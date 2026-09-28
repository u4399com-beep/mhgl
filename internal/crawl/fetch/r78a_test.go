// ============================================================
// [R78-a] 代理跳拨号 SSRF 守卫回归:
// ① guardProxyHopConn 判定表(私网/元数据/CGNAT/组播/未指定 恒拒; 回环放行 — 本地
//
//	mock 代理与静态回环代理场景保持可用, TestR76aHarvestAddrThroughPickProxyAndDial
//	为回环放行的整合级实证)
//
// ② transportFor 普通形态(非 tlsfp)代理传输 DialContext 守卫接线断言
// ③ 守卫触发路径整合: 私网地址代理经 doOnce → proxyChannelError(记代理账,
//
//	不喂目标 host 连败链)
//
// ============================================================
package fetch

import (
	"context"
	"net"
	"net/http"
	"net/url"
	"testing"
	"time"

	"mhgl/internal/crawl/rule"
)

// stubAddrConn net.Conn 桩(仅 RemoteAddr/Close 被守卫消费; 其余方法 panic 即证未触)
type stubAddrConn struct {
	net.Conn
	remote net.Addr
	closed bool
}

func (c *stubAddrConn) RemoteAddr() net.Addr { return c.remote }
func (c *stubAddrConn) Close() error         { c.closed = true; return nil }

type stubTCPAddr struct{ ip net.IP }

func (a stubTCPAddr) Network() string { return "tcp" }
func (a stubTCPAddr) String() string {
	if a.ip.To4() == nil {
		return "[" + a.ip.String() + "]:9999" // net.TCPAddr 同口径: IPv6 括号形态
	}
	return a.ip.String() + ":9999"
}

func TestR78a_GuardProxyHopConnTable(t *testing.T) {
	cases := []struct {
		name string
		ip   string
		want bool // true = 放行
	}{
		{"回环放行(本地 mock 代理)", "127.0.0.1", true},
		{"公网放行", "93.184.216.34", true},
		{"私网 10/8 拒", "10.1.2.3", false},
		{"私网 172.16/12 拒", "172.16.0.9", false},
		{"私网 192.168/16 拒", "192.168.1.1", false},
		{"CGNAT 100.64/10 拒", "100.64.0.13", false},
		{"链路本地拒", "169.254.169.254", false},
		{"组播拒", "224.0.0.1", false},
		{"未指定拒", "0.0.0.0", false},
		{"IPv6 回环放行", "::1", true},
		{"IPv6 私网 fc00::/7 拒", "fc00::1234", false},
		{"IPv6 链路本地拒", "fe80::1", false},
	}
	for _, tc := range cases {
		conn := &stubAddrConn{remote: stubTCPAddr{ip: net.ParseIP(tc.ip)}}
		err := guardProxyHopConn(conn)
		if tc.want && err != nil {
			t.Errorf("%s: 应放行, got %v", tc.name, err)
		}
		if !tc.want {
			if err == nil {
				t.Errorf("%s: 应拒绝, got nil", tc.name)
			}
			if !conn.closed {
				t.Errorf("%s: 拒绝时应断连", tc.name)
			}
		}
	}
	// RemoteAddr 不可解析(非 TCP 地址形态): 拒绝并断连
	c2 := &stubAddrConn{remote: dummyNonTCPAddr{}}
	if err := guardProxyHopConn(c2); err == nil {
		t.Errorf("RemoteAddr 不可解析应拒绝")
	}
	if !c2.closed {
		t.Errorf("RemoteAddr 不可解析拒绝时应断连")
	}
}

type dummyNonTCPAddr struct{}

func (dummyNonTCPAddr) Network() string { return "unix" }
func (dummyNonTCPAddr) String() string  { return "/tmp/sock" }

// TestR78a_ProxyTransportDialGuardWired transportFor 普通形态代理传输必须接线
// guardProxyHopDialContext(修前为 nil DialContext 裸默认拨号器)
func TestR78a_ProxyTransportDialGuardWired(t *testing.T) {
	c := New(rule.FetchConfig{Engine: "http", Timeout: 2000, Retries: 0, GlobalConcurrency: 1, HostGateLimit: 1})
	t.Cleanup(c.Close)
	pu, _ := url.Parse("http://93.184.216.34:8080")
	tr := c.transportFor(pu, false)
	if tr.DialContext == nil {
		t.Fatalf("普通形态代理传输 DialContext 未接线(裸默认拨号器)")
	}
	// tlsfp 形态: DialContext 为直连兜底(既有口径), DialTLSContext 独立 — 不在本测范围
}

// TestR78a_PrivateIPProxyRejectedTransport 整合(传输层): 私网地址代理的传输发起请求
// 时必败 —— 拨号守卫拒绝(实拨成功进复检)或拨号本身失败(沙箱无该网段), 两者均阻断
// 请求线打向内网; 判定逻辑的精确语义由 TestR78a_GuardProxyHopConnTable 钉死。
// 目标用公网 IP 字面量 URL(仅作形态, Transport 对代理传输恒先拨代理, 不会真连目标)
func TestR78a_PrivateIPProxyRejectedTransport(t *testing.T) {
	c := New(rule.FetchConfig{Engine: "http", Timeout: 2000, Retries: 0, GlobalConcurrency: 1, HostGateLimit: 1})
	t.Cleanup(c.Close)
	pu, _ := url.Parse("http://10.198.76.54:3128")
	tr := c.transportFor(pu, false)
	client := &http.Client{Transport: tr, Timeout: 6 * time.Second}
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://93.184.216.34/page", nil)
	if _, err := client.Do(req); err == nil {
		t.Fatalf("私网代理通道应失败(拨号守卫/拨号失败)")
	}
}
