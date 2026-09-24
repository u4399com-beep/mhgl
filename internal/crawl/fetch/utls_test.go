// ============================================================
// utls TLS 指纹仿真单测 — R63-b
//
//	① 自签 TLS server 上 utls 握手+HTTP 可用(ALPN 钉 http/1.1)
//	② Client 直连抓取: 开 chrome 走 utls(服务端见 ALPN http/1.1)/
//	   缺省不开走标准 crypto/tls(服务端见无 ALPN)且两者均可用
//	③ CONNECT 代理隧道 + utls 端到端(Transport 自管隧道)
//	④ 传输选择: chrome 开 → https 走 utls 形态(Proxy nil)/http 走普通
//	   形态; 缺省关 → 全普通形态(无 DialTLSContext, 兼容回归)
//
// 本地自签证书经 utlsConfigHook 注入 InsecureSkipVerify(仅测试; 生产恒 nil,
// 证书校验保持开启)。
// ============================================================
package fetch

import (
	"context"
	"crypto/tls"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	utls "github.com/refraction-networking/utls"

	"mhgl/internal/crawl/rule"
)

// tlsProbe 服务端 TLS 观测(NegotiatedProtocol 区分 utls-ALPN 与标准 Go 客户端:
// 标准 Go h1 传输不发 ALPN → 服务端 NegotiatedProtocol 为 ""; utls 形态覆写
// ALPN 仅声明 http/1.1 → httptest h2 服务器只能选 "http/1.1")
type tlsProbe struct {
	mu         sync.Mutex
	negotiated string
	count      int
}

func (p *tlsProbe) snapshot() (string, int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.negotiated, p.count
}

// newTLSPageServer 自签 TLS 假站(/page 返回静态页并观测 TLS 协商)
func newTLSPageServer(t *testing.T) (*httptest.Server, *tlsProbe) {
	t.Helper()
	mux := http.NewServeMux()
	probe := &tlsProbe{}
	mux.HandleFunc("GET /page", func(w http.ResponseWriter, r *http.Request) {
		if r.TLS != nil {
			probe.mu.Lock()
			probe.negotiated = r.TLS.NegotiatedProtocol
			probe.count++
			probe.mu.Unlock()
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, "<html><head><title>utls 测试页</title></head><body>"+strings.Repeat("正文内容。", 120)+"</body></html>")
	})
	srv := httptest.NewTLSServer(mux)
	t.Cleanup(srv.Close)
	return srv, probe
}

// useInsecureUTLSConfig 测试期注入自签校验配置(生产恒 nil)
func useInsecureUTLSConfig(t *testing.T) {
	t.Helper()
	prev := utlsConfigHook
	utlsConfigHook = func(host string) *utls.Config {
		return &utls.Config{ServerName: host, InsecureSkipVerify: true} //nolint:gosec // 本地自签测试专用
	}
	t.Cleanup(func() { utlsConfigHook = prev })
}

// TestUTLSHandshakeSelfSigned ①裸 utls 握手: 自签 TLS server 上握手成功,
// 手写 HTTP/1.1 请求可完成往返; 客户端协商协议为 http/1.1(守卫口径)
func TestUTLSHandshakeSelfSigned(t *testing.T) {
	useInsecureUTLSConfig(t)
	srv, probe := newTLSPageServer(t)
	host := strings.TrimPrefix(srv.URL, "https://")
	h, _, err := net.SplitHostPort(host)
	if err != nil {
		t.Fatalf("拆分 host: %v", err)
	}
	conn, err := net.DialTimeout("tcp", host, 5*time.Second)
	if err != nil {
		t.Fatalf("TCP 拨号: %v", err)
	}
	defer conn.Close()
	uconn, err := utlsHandshake(context.Background(), conn, h)
	if err != nil {
		t.Fatalf("utls 握手: %v", err)
	}
	defer uconn.Close()
	uc, ok := uconn.(*utls.UConn)
	if !ok {
		t.Fatalf("utlsHandshake 应返回 *utls.UConn, got %T", uconn)
	}
	if np := uc.ConnectionState().NegotiatedProtocol; np != "http/1.1" {
		t.Fatalf("客户端协商协议 = %q, want http/1.1", np)
	}
	req := "GET /page HTTP/1.1\r\nHost: " + host + "\r\nConnection: close\r\n\r\n"
	if _, err := uconn.Write([]byte(req)); err != nil {
		t.Fatalf("写请求: %v", err)
	}
	body, err := io.ReadAll(io.LimitReader(uconn, 64<<10))
	if err != nil {
		t.Fatalf("读响应: %v", err)
	}
	if !strings.Contains(string(body), "utls 测试页") {
		t.Fatalf("响应体缺标记: %q", truncateStr(string(body), 200))
	}
	if got, _ := probe.snapshot(); got != "http/1.1" {
		t.Fatalf("服务端协商协议 = %q, want http/1.1(ALPN 覆写未生效?)", got)
	}
}

// TestFetchTLSFingerprintDirect ②直连抓取: 开 chrome 走 utls 且抓取语义不变
// (状态码/正文/charset 通路); 缺省不开走标准栈(服务端无 ALPN 可见)
func TestFetchTLSFingerprintDirect(t *testing.T) {
	useInsecureUTLSConfig(t)
	srv, probe := newTLSPageServer(t)
	ctx := context.Background()

	onCfg := rule.FetchConfig{Engine: "http", Timeout: 5000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, TLSFingerprint: "chrome"}
	c := New(onCfg)
	res, err := c.Fetch(ctx, srv.URL+"/page", "")
	if err != nil {
		t.Fatalf("chrome 指纹抓取: %v", err)
	}
	if res.StatusCode != 200 || res.Blocked || !strings.Contains(res.HTML, "utls 测试页") {
		t.Fatalf("chrome 指纹抓取结果异常: status=%d blocked=%v html=%q", res.StatusCode, res.Blocked, truncateStr(res.HTML, 200))
	}
	if got, _ := probe.snapshot(); got != "http/1.1" {
		t.Fatalf("chrome 指纹下服务端协商协议 = %q, want http/1.1(应经 DialTLSContext/utls)", got)
	}
	if !strings.Contains(res.HTML, strings.Repeat("正文内容。", 3)) {
		t.Fatalf("正文不完整: %q", truncateStr(res.HTML, 200))
	}
	c.Close()

	offCfg := onCfg
	offCfg.TLSFingerprint = ""
	c2 := New(offCfg)
	// 测试注入: 标准栈路径信任自签证书(仅此次对照; 结构断言见 TestTransportSelection)
	c2.hc.Transport.(*http.Transport).TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec // 本地自签测试专用
	res2, err := c2.Fetch(ctx, srv.URL+"/page", "")
	if err != nil {
		t.Fatalf("缺省关抓取(标准栈回归): %v", err)
	}
	if res2.StatusCode != 200 {
		t.Fatalf("缺省关抓取状态码 = %d, want 200", res2.StatusCode)
	}
	// 标准栈 h1 传输不发 ALPN → 服务端协商协议为 ""(区分 utls 路径的旁证)
	probe.mu.Lock()
	last := probe.negotiated
	probe.mu.Unlock()
	if last != "" {
		t.Fatalf("缺省关服务端协商协议 = %q, want 空(标准 Go 栈不发 ALPN; 说明 utls 被误启用)", last)
	}
	c2.Close()
}

// newCONNECTProxy 本地 CONNECT 隧道代理(劫持后双向拼接到目标; 记录 CONNECT 次数)
func newCONNECTProxy(t *testing.T, connects *atomic.Int64) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodConnect {
			http.Error(w, "仅支持 CONNECT", http.StatusMethodNotAllowed)
			return
		}
		connects.Add(1)
		dst, err := net.DialTimeout("tcp", r.Host, 5*time.Second)
		if err != nil {
			http.Error(w, "目标不可达: "+err.Error(), http.StatusBadGateway)
			return
		}
		hj, ok := w.(http.Hijacker)
		if !ok {
			dst.Close()
			http.Error(w, "hijack 不支持", http.StatusInternalServerError)
			return
		}
		conn, buf, err := hj.Hijack()
		if err != nil {
			dst.Close()
			return
		}
		defer conn.Close()
		defer dst.Close()
		if _, err := io.WriteString(buf, "HTTP/1.1 200 Connection Established\r\n\r\n"); err != nil {
			return
		}
		_ = buf.Flush()
		// 请求行后已缓冲的残余字节属隧道流, 先拼给目标再双向拷贝
		if n := buf.Reader.Buffered(); n > 0 {
			lead := make([]byte, n)
			_, _ = io.ReadFull(buf.Reader, lead)
			if _, err := dst.Write(lead); err != nil {
				return
			}
		}
		done := make(chan struct{}, 2)
		go func() { _, _ = io.Copy(dst, conn); done <- struct{}{} }()
		go func() { _, _ = io.Copy(conn, dst); done <- struct{}{} }()
		<-done
	}))
	t.Cleanup(srv.Close)
	return srv
}

// TestConnectProxyTLSFingerprint ③CONNECT 隧道 + utls 端到端: 经本地 CONNECT
// 代理抓取自签 https 假站, 服务端见 ALPN http/1.1, 代理收到 CONNECT
func TestConnectProxyTLSFingerprint(t *testing.T) {
	useInsecureUTLSConfig(t)
	tlsSrv, probe := newTLSPageServer(t)
	var connects atomic.Int64
	proxySrv := newCONNECTProxy(t, &connects)

	c := New(rule.FetchConfig{Engine: "http", Timeout: 5000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, TLSFingerprint: "chrome",
		ProxyURL: proxySrv.URL})
	defer c.Close()
	pu, err := url.Parse(proxySrv.URL)
	if err != nil {
		t.Fatalf("代理 URL 解析: %v", err)
	}
	tr := c.transportFor(pu, true)
	if tr.Proxy != nil || tr.DialTLSContext == nil {
		t.Fatalf("https 目标应为 utls 隧道形态: proxy=nil? %v dialTLS==nil? %v", tr.Proxy == nil, tr.DialTLSContext == nil)
	}
	hc := &http.Client{Transport: tr, Timeout: 10 * time.Second}
	resp, err := hc.Get(tlsSrv.URL + "/page")
	if err != nil {
		t.Fatalf("经 CONNECT 隧道抓取: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 || !strings.Contains(string(body), "utls 测试页") {
		t.Fatalf("隧道抓取结果异常: status=%d body=%q", resp.StatusCode, truncateStr(string(body), 200))
	}
	if got, _ := probe.snapshot(); got != "http/1.1" {
		t.Fatalf("隧道下服务端协商协议 = %q, want http/1.1", got)
	}
	if connects.Load() != 1 {
		t.Fatalf("代理 CONNECT 次数 = %d, want 1", connects.Load())
	}
}

// TestTransportSelection ④传输选择与缺省兼容: chrome 开 → https 目标走 utls
// 形态(Proxy 置空+独立键)/http 目标走普通形态; 缺省关 → 全普通形态且直连
// 传输无 DialTLSContext(既有行为零变化)
func TestTransportSelection(t *testing.T) {
	onCfg := rule.FetchConfig{Engine: "http", Timeout: 5000, TLSFingerprint: "chrome", ProxyURL: "http://10.9.9.9:3128"}
	c := New(onCfg)
	defer c.Close()
	if tr := c.hc.Transport.(*http.Transport); tr.DialTLSContext == nil || tr.TLSNextProto == nil {
		t.Fatalf("chrome 开时直连传输应挂 DialTLSContext+空 TLSNextProto")
	}
	pu, _ := url.Parse("http://10.9.9.9:3128")
	trHTTPS := c.transportFor(pu, true)
	if trHTTPS.Proxy != nil || trHTTPS.DialTLSContext == nil {
		t.Fatalf("https 目标 utls 形态异常: proxy=%v dialTLS=%v", trHTTPS.Proxy != nil, trHTTPS.DialTLSContext == nil)
	}
	trHTTP := c.transportFor(pu, false)
	if trHTTP.Proxy == nil || trHTTP.DialTLSContext != nil {
		t.Fatalf("http 目标应为普通代理形态: proxy=%v dialTLS=%v", trHTTP.Proxy == nil, trHTTP.DialTLSContext != nil)
	}
	if trHTTPS == trHTTP {
		t.Fatalf("utls 形态与普通形态应独立缓存, 不互串")
	}

	offCfg := onCfg
	offCfg.TLSFingerprint = ""
	c2 := New(offCfg)
	defer c2.Close()
	if tr := c2.hc.Transport.(*http.Transport); tr.DialTLSContext != nil || tr.TLSNextProto != nil {
		t.Fatalf("缺省关直连传输应保持既有口径(无 DialTLSContext/空表)")
	}
	tr2 := c2.transportFor(pu, true)
	if tr2.Proxy == nil || tr2.DialTLSContext != nil {
		t.Fatalf("缺省关 https 目标应为普通代理形态: proxy=%v dialTLS=%v", tr2.Proxy == nil, tr2.DialTLSContext != nil)
	}
}

// TestTLSFingerprintEnabled 开关判定兜底
func TestTLSFingerprintEnabled(t *testing.T) {
	cases := map[string]bool{
		"chrome": true, " Chrome ": true, "CHROME": true,
		"": false, "none": false, "firefox": false, "curl": false,
	}
	for in, want := range cases {
		if got := tlsFingerprintEnabled(in); got != want {
			t.Fatalf("tlsFingerprintEnabled(%q) = %v, want %v", in, got, want)
		}
	}
}

// truncateStr 测试用截断
func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
