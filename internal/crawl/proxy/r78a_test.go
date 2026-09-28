// ============================================================
// [R78-a] 免费收割条目内网/保留地址拒绝回归:
// ① deniedProxyHost 判定表(回环/私网/CGNAT/链路本地/组播/未指定 拒; 公网/域名 收)
// ② ParseSourceBody 出口过滤(plain/proxifly/roosterkid/geonode 四形态; thespeedx
//
//	实测污染形态 127.0.0.7:80 / 0.0.0.0:80 钉死)
//
// ③ 校验传输拨号守卫接线(transportFor DialContext 非_nil + dialSOCKS4 复检臂)
// ============================================================
package proxy

import (
	"net"
	"testing"
)

func TestR78a_DeniedProxyHostTable(t *testing.T) {
	cases := []struct {
		host string
		want bool // true = 拒绝
	}{
		{"127.0.0.1", true},
		{"127.0.0.7", true}, // thespeedx 生产池实证形态
		{"0.0.0.0", true},   // thespeedx 生产池实证形态
		{"10.1.2.3", true},
		{"172.16.0.9", true},
		{"172.31.255.255", true},
		{"192.168.1.1", true},
		{"100.64.0.1", true}, // CGNAT
		{"100.127.255.254", true},
		{"169.254.169.254", true}, // 云元数据
		{"224.0.0.1", true},       // 组播
		{"::1", true},
		{"fc00::1234", true}, // IPv6 ULA
		{"fe80::1", true},    // IPv6 链路本地
		{"93.184.216.34", false},
		{"1.2.3.4", false},
		{"proxy.example.com", false}, // 域名不做解析判定
		{"not-an-ip", false},
	}
	for _, tc := range cases {
		if got := deniedProxyHost(tc.host); got != tc.want {
			t.Errorf("deniedProxyHost(%q) = %v, want %v", tc.host, got, tc.want)
		}
	}
}

func TestR78a_ParseSourceBodyDeniesInternalHosts(t *testing.T) {
	body := "127.0.0.7:80\n" + // 实测污染形态
		"0.0.0.0:80\n" + // 实测污染形态
		"10.9.8.7:8080\n" +
		"192.168.50.50:3128\n" +
		"169.254.169.254:80\n" +
		"100.64.1.2:8080\n" +
		"1.2.3.4:8080\n" +
		"5.6.7.8:3128\n"
	src := Source{ID: "fake-plain", Kind: KindPlain, Protocol: "http"}
	out := ParseSourceBody(src, body)
	if len(out) != 2 {
		t.Fatalf("内网条目应全被过滤, 仅剩 2 条公网: got %d: %+v", len(out), out)
	}
	for _, p := range out {
		if p.Host != "1.2.3.4" && p.Host != "5.6.7.8" {
			t.Fatalf("意外条目漏网: %+v", p)
		}
	}
}

func TestR78a_ParseSourceBodyGeonodeDeniesInternal(t *testing.T) {
	body := `{"data":[
                {"ip":"169.254.169.254","port":80,"protocols":["http"],"country":"US"},
                {"ip":"127.0.0.1","port":3128,"protocols":["http"],"country":"JP"},
                {"ip":"9.9.9.9","port":1080,"protocols":["socks5"],"country":"KR"}
        ]}`
	src := Source{ID: "fake-geonode", Kind: KindGeonode}
	out := ParseSourceBody(src, body)
	if len(out) != 1 || out[0].Host != "9.9.9.9" {
		t.Fatalf("geonode 内网条目应被过滤: %+v", out)
	}
}

// TestR78a_ProxiflyRoosterkidDeniesInternal 行内元数据形态(带 scheme/带管道分段)同样过滤
func TestR78a_ProxiflyRoosterkidDeniesInternal(t *testing.T) {
	pf := ParseSourceBody(Source{ID: "fake-pf", Kind: KindProxifly},
		"http://10.1.1.1:8080\nhttp://2.2.2.2:8080\n")
	if len(pf) != 1 || pf[0].Host != "2.2.2.2" {
		t.Fatalf("proxifly 形态过滤异常: %+v", pf)
	}
	rk := ParseSourceBody(Source{ID: "fake-rk", Kind: KindRoosterkid, Protocol: "http"},
		"172.20.0.8:8080 | 120 | US | elite\n3.3.3.3:8080 | 100 | US | elite\n")
	if len(rk) != 1 || rk[0].Host != "3.3.3.3" {
		t.Fatalf("roosterkid 形态过滤异常: %+v", rk)
	}
}

// TestR78a_CheckTransportDialGuardWired 校验传输拨号守卫接线(修前裸拨)
func TestR78a_CheckTransportDialGuardWired(t *testing.T) {
	h := NewHarvester(nil)
	pu, err := proxyURL("http", "93.184.216.34", 8080)
	if err != nil {
		t.Fatalf("proxyURL: %v", err)
	}
	for _, proto := range []string{"http", "socks5"} {
		tr, err := h.transportFor(proto, pu, "93.184.216.34", 8080)
		if err != nil {
			t.Fatalf("transportFor(%s): %v", proto, err)
		}
		if tr.DialContext == nil {
			t.Errorf("校验传输(%s) DialContext 未接线", proto)
		}
	}
}

// TestR78a_DeniedRemoteIPLoopbackAllowed 拨号复检与 ingest 判定的口径差: 回环放行
// (测试 mock 代理在 127.0.0.1, 既有 fake-proxy E2E 全依赖此口径), 私网恒拒
func TestR78a_DeniedRemoteIPLoopbackAllowed(t *testing.T) {
	if deniedRemoteIP(net.ParseIP("127.0.0.1")) {
		t.Errorf("回环应放行(测试 mock 代理依赖)")
	}
	if !deniedRemoteIP(net.ParseIP("10.0.0.5")) {
		t.Errorf("私网应拒")
	}
	if !deniedRemoteIP(net.ParseIP("169.254.169.254")) {
		t.Errorf("元数据地址应拒")
	}
	if deniedRemoteIP(net.ParseIP("93.184.216.34")) {
		t.Errorf("公网应放行")
	}
}
