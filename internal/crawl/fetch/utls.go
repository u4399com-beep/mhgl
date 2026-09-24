// ============================================================
// utls TLS 指纹仿真 — fetch.tlsFingerprint="chrome" 时接管 https 拨号
//
// 目标站(如 fanqianxs CF 盾)用 JA3/JA4 指纹识别 Go 标准库 crypto/tls 的
// ClientHello 并拒绝 —— Go http.Transport 无法自定义 ClientHello, 故以
// utls(refraction-networking)按 Chrome 真实规格重放。
//
// 链路(全部复用既有 dial 层语义, 不绕过代理池/SSRF 守卫):
//
//	直连 https:   safeDialContext(TCP 拨号+拨号级 SSRF 复检) → utls 握手
//	http(s) 代理: 拨代理 → CONNECT 隧道 → utls 握手(Go Transport 对代理
//	              https 的内建 crypto/tls 无法注入, 故隧道由本层自管)
//	socks5 代理:  x/net/proxy SOCKS5 隧道(支持用户名/口令) → utls 握手
//	http 明文:    不受影响(Transport 既有 DialContext 路径)
//	内部通道:     token 预取/contentProxy(hcLocal)恒不启用指纹仿真
//	回环豁免:     ssrfCheck/dial-guard 既有口径不变(经代理目标解析在代理侧)
//
// 稳定优先: Chrome 规格自带 ALPN h2+http/1.1, 而 Transport 侧为 h1(空
// TLSNextProto 表), 故握手前覆写 ALPN 仅声明 http/1.1, 协商出非 h1 即刻失败
// (与既有直连传输 DialContext 定制 → 无内建 h2 的口径一致); 证书校验保持
// 开启(同标准库, 不因指纹仿真放松)。
// 预期管理: utls 消除的是「Go 默认 JA3 被精确识别」一类拦截; CF 若还查
// JS 挑战/Cookie/行为面, 403 属预期而非本层回归。
// ============================================================
package fetch

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	utls "github.com/refraction-networking/utls"
	"golang.org/x/net/proxy"
)

// utlsHelloID ClientHello 仿真规格: HelloChrome_Auto = 库内最新 Chrome 规格
// 指针(utls v1.8.2 → HelloChrome_133), 随 utls 升级自动跟进
var utlsHelloID = utls.HelloChrome_Auto

// utlsHandshakeTimeout TLS 握手硬超时(独立于请求超时的兜底, 防慢握手占住
// 连接槽位; 取 min(本值, ctx 既有 deadline))
const utlsHandshakeTimeout = 15 * time.Second

// utlsConfigHook 测试注入点(本地自签证书场景替换校验配置; 生产恒 nil)
var utlsConfigHook func(host string) *utls.Config

// tlsFingerprintEnabled fetch.tlsFingerprint 开关判定("chrome" 开启;
// ""/none/其余值关闭 — Sanitize 已做枚举白名单, 此处为运行时兜底)
func tlsFingerprintEnabled(mode string) bool {
	return strings.ToLower(strings.TrimSpace(mode)) == "chrome"
}

// utlsHandshake 在既有 TCP 连接(或代理隧道流)上做 utls ClientHello 握手。
// 返回的 conn 已完成 TLS, 可直接交给 http.Transport 的 DialTLSContext。
// ALPN 覆写只声明 http/1.1(BuildHandshakeState 后改扩展对象, 握手时
// MarshalClientHello 重序列化生效 — utls 规格扩展为逐连接新建对象, 改动不外溢)
func utlsHandshake(ctx context.Context, conn net.Conn, host string) (net.Conn, error) {
	cfg := &utls.Config{ServerName: host}
	if utlsConfigHook != nil {
		cfg = utlsConfigHook(host)
	}
	uconn := utls.UClient(conn, cfg, utlsHelloID)
	if err := uconn.BuildHandshakeState(); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("utls ClientHello 构建失败: %w", err)
	}
	for _, ext := range uconn.Extensions {
		if alpn, ok := ext.(*utls.ALPNExtension); ok {
			alpn.AlpnProtocols = []string{"http/1.1"}
		}
	}
	if len(uconn.HandshakeState.Hello.AlpnProtocols) > 0 {
		uconn.HandshakeState.Hello.AlpnProtocols = []string{"http/1.1"}
	}
	deadline := time.Now().Add(utlsHandshakeTimeout)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	_ = conn.SetDeadline(deadline)
	if err := uconn.HandshakeContext(ctx); err != nil {
		_ = uconn.Close()
		return nil, fmt.Errorf("utls 握手失败(host=%s): %w", host, err)
	}
	_ = conn.SetDeadline(time.Time{})
	// 防御: server 违规选中 h2(本传输层为 h1)即刻失败, 不留挂死连接
	if np := uconn.ConnectionState().NegotiatedProtocol; np != "" && np != "http/1.1" {
		_ = uconn.Close()
		return nil, fmt.Errorf("utls 协商出非 h1 协议(%s), 传输层不可用", np)
	}
	return uconn, nil
}

// safeTLSDialContext 直连 https 拨号(TLS 指纹形态): 复用 safeDialContext 的
// TCP 拨号+拨号级 SSRF 复检(防 DNS rebinding TOCTOU), 其后 utls 握手
func (c *Client) safeTLSDialContext(allowLoopback bool) func(context.Context, string, string) (net.Conn, error) {
	tcpDial := c.safeDialContext(allowLoopback)
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		conn, err := tcpDial(ctx, network, addr)
		if err != nil {
			return nil, err
		}
		host, _, err := net.SplitHostPort(addr)
		if err != nil {
			_ = conn.Close()
			return nil, fmt.Errorf("utls 目标地址非法(%s): %w", addr, err)
		}
		return utlsHandshake(ctx, conn, host)
	}
}

// proxyTLSDialContext 代理 https 拨号(TLS 指纹形态): 先建代理隧道
// (http/https 代理=CONNECT; socks5=x/net/proxy), 隧道流上做 utls 握手。
// 隧道目标解析发生在代理侧(与既有代理传输口径一致, 拨号级 SSRF 复检不适用);
// 握手失败经代理时由 doOnce 既有 proxyChannelError 链记代理账(冷却/回写),
// 注: CF 对 ClientHello 的 SNI 级拒绝也表现为握手失败, 此时故障归属有轻微
// 偏置(目标侧拒绝记到代理账), 重试/镜像/直连链自然消化
func (c *Client) proxyTLSDialContext(pu *url.URL) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, _, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, fmt.Errorf("utls 目标地址非法(%s): %w", addr, err)
		}
		var tun net.Conn
		switch pu.Scheme {
		case "socks5":
			tun, err = socks5Tunnel(ctx, pu, addr)
		default:
			tun, err = connectTunnel(ctx, pu, addr)
		}
		if err != nil {
			return nil, err
		}
		return utlsHandshake(ctx, tun, host)
	}
}

// connectTunnel http/https 代理 CONNECT 隧道: 拨代理(https 代理跳用标准
// crypto/tls — 代理跳指纹无关紧要, 目标 TLS 由 utls 接管) → CONNECT
// addr(带 Proxy-Authorization) → 2xx → 返回带缓冲残余的隧道流
func connectTunnel(ctx context.Context, pu *url.URL, addr string) (net.Conn, error) {
	d := &net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}
	phost, pport := pu.Hostname(), pu.Port()
	if pport == "" {
		if pu.Scheme == "https" {
			pport = "443"
		} else {
			pport = "80"
		}
	}
	conn, err := d.DialContext(ctx, "tcp", net.JoinHostPort(phost, pport))
	if err != nil {
		return nil, fmt.Errorf("代理连接失败(%s): %w", pu.String(), err)
	}
	if pu.Scheme == "https" {
		tc := tls.Client(conn, &tls.Config{ServerName: phost, NextProtos: []string{"http/1.1"}})
		if err := tc.HandshakeContext(ctx); err != nil {
			_ = conn.Close()
			return nil, fmt.Errorf("代理 TLS 握手失败(%s): %w", pu.String(), err)
		}
		conn = tc
	}
	req := &http.Request{
		Method: http.MethodConnect,
		URL:    &url.URL{Opaque: addr},
		Host:   addr,
		Header: http.Header{},
	}
	if pu.User != nil {
		pwd, _ := pu.User.Password()
		cred := base64.StdEncoding.EncodeToString([]byte(pu.User.Username() + ":" + pwd))
		req.Header.Set("Proxy-Authorization", "Basic "+cred)
	}
	_ = conn.SetDeadline(time.Now().Add(30 * time.Second)) // CONNECT 往返硬超时
	if err := req.Write(conn); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("代理 CONNECT 写入失败(%s): %w", pu.String(), err)
	}
	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, req)
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("代理 CONNECT 响应读取失败(%s): %w", pu.String(), err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		_ = conn.Close()
		return nil, fmt.Errorf("代理 CONNECT 被拒: HTTP %d (%s)", resp.StatusCode, pu.String())
	}
	_ = conn.SetDeadline(time.Time{})
	// 响应后 bufio 残余字节属 TLS 流(丢弃会破坏握手首字节), 包一层读缓冲桥
	return &bufferedConn{Conn: conn, r: br}, nil
}

// bufferedConn 已缓冲读取的流桥(CONNECT 响应解析后 bufio.Reader 内残余字节
// 属于后续 TLS 握手流)
type bufferedConn struct {
	net.Conn
	r *bufio.Reader
}

func (c *bufferedConn) Read(p []byte) (int, error) { return c.r.Read(p) }

// socks5Tunnel SOCKS5 隧道(x/net/proxy, 支持用户名/口令认证; ctx 感知)
func socks5Tunnel(ctx context.Context, pu *url.URL, addr string) (net.Conn, error) {
	var auth *proxy.Auth
	if pu.User != nil {
		pwd, _ := pu.User.Password()
		auth = &proxy.Auth{User: pu.User.Username(), Password: pwd}
	}
	d, err := proxy.SOCKS5("tcp", pu.Host, auth, proxy.Direct)
	if err != nil {
		return nil, fmt.Errorf("SOCKS5 拨号器创建失败(%s): %w", pu.String(), err)
	}
	cd, ok := d.(proxy.ContextDialer)
	if !ok {
		return nil, fmt.Errorf("SOCKS5 拨号器不支持 Context 拨号(%s)", pu.String())
	}
	conn, err := cd.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("SOCKS5 隧道建立失败(%s): %w", pu.String(), err)
	}
	return conn, nil
}
