// ============================================================
// [R79-i06] 收割管线深审回归 — deniedProxyHost 非规范数字形态补口:
// net.ParseIP 严格口径不认、isValidHostPort 却放行的 inet_aton 家族字面量
// ("127.1" 缺段 / "0177.0.0.1" 八进制 / "0x7f.0.0.1" 十六进制), 修前绕过
// R78-a ingest 过滤入库; cgo 解析器拨号场景还原成回环/私网 IP 实拨
//
//	① deniedProxyHost 判定表扩案(非规范形态 拒; 真实数字型域名 收)
//	② ParseSourceBody 四形态出口过滤端到端(plain/proxifly/roosterkid/geonode)
//	③ 真实域名形态零误伤判据钉子(含 IDN xn-- TLD)
//
// ============================================================
package proxy

import "testing"

func TestR79i06_DeniedProxyHostNonCanonicalNumeric(t *testing.T) {
	cases := []struct {
		host string
		want bool // true = 拒绝
	}{
		// inet_aton 十进制缺段(ParseIP=nil, 修前按「域名」放行)
		{"127.1", true},     // inet_aton → 127.0.0.1 回环
		{"10.1", true},      // inet_aton → 10.0.0.1 私网
		{"169.254", true},   // inet_aton → 169.0.0.254 链路本地族
		{"192.168", true},   // inet_aton → 192.0.0.168 私网族
		{"1.2.3.4.5", true}, // 5 段非法(IPv4 段数越界), 顺手封死
		// 八进制(ParseIP 十进制读法=177.0.0.1 假公网, inet_aton 八进制=127.0.0.1)
		{"0177.0.0.1", true},
		{"017.0.0.1", true}, // 八进制 017=15 → 15.0.0.1
		// 十六进制
		{"0x7f.0.0.1", true},      // → 127.0.0.1
		{"0x7f.0.0.0xa", true},    // → 127.0.0.10
		{"0X7F.0.0.1", true},      // 大写 hex 前缀
		{"127.000.000.001", true}, // 前导零八进制段(ParseIP 1.17+ 已拒)
		// 无点纯十进制整数(isValidHostPort 本就拒, 钉住不回归)
		{"2130706433", true},
		// 真实域名形态零误伤: TLD/标签含 x 以外字母
		{"example.com", false},
		{"0x.org", false},                  // "0x" 前缀是真域名形态(加密圈)
		{"0xa.io", false},                  // hex 样标签 + 正常 TLD
		{"12306.cn", false},                // 纯数字主标签 + 正常 TLD
		{"9gag.com", false},                // 数字+字母混排
		{"proxy.xn--p1ai", false},          // IDN TLD 含数字但亦有字母
		{"1.2.3.4.cdn.example.com", false}, // 多级数字子域真实形态(含非数值标签不受误伤)
		{"93.184.216.34", false},           // 规范公网 IPv4(ParseIP 臂, 不入本判定)
		{"1.2.3.4", false},
	}
	for _, tc := range cases {
		if got := deniedProxyHost(tc.host); got != tc.want {
			t.Errorf("deniedProxyHost(%q) = %v, want %v", tc.host, got, tc.want)
		}
	}
}

// TestR79i06_ParseSourceBodyDropsNonCanonicalNumeric 四形态出口端到端:
// 非规范数字形态条目在入库前被 dropDeniedHosts 统一剔除
func TestR79i06_ParseSourceBodyDropsNonCanonicalNumeric(t *testing.T) {
	plain := ParseSourceBody(Source{ID: "f-plain", Kind: KindPlain, Protocol: "http"},
		"127.1:8080\n0177.0.0.1:80\n0x7f.0.0.1:3128\n10.1:1080\n8.8.8.8:8080\n")
	if len(plain) != 1 || plain[0].Host != "8.8.8.8" {
		t.Fatalf("plain 形态非规范数字条目应全过滤: %+v", plain)
	}
	pf := ParseSourceBody(Source{ID: "f-pf", Kind: KindProxifly},
		"http://127.1:8080\nhttp://169.254:80\nhttp://4.4.4.4:8080\n")
	if len(pf) != 1 || pf[0].Host != "4.4.4.4" {
		t.Fatalf("proxifly 形态非规范数字条目应全过滤: %+v", pf)
	}
	rk := ParseSourceBody(Source{ID: "f-rk", Kind: KindRoosterkid, Protocol: "http"},
		"0x7f.0.0.1:8080 | 100 | US | elite\n5.5.5.5:8080 | 100 | US | elite\n")
	if len(rk) != 1 || rk[0].Host != "5.5.5.5" {
		t.Fatalf("roosterkid 形态非规范数字条目应全过滤: %+v", rk)
	}
	gn := ParseSourceBody(Source{ID: "f-gn", Kind: KindGeonode}, `{"data":[
                {"ip":"127.1","port":8080,"protocols":["http"],"country":"US"},
                {"ip":"0177.0.0.1","port":80,"protocols":["http"],"country":"JP"},
                {"ip":"6.6.6.6","port":1080,"protocols":["socks5"],"country":"KR"}
        ]}`)
	if len(gn) != 1 || gn[0].Host != "6.6.6.6" {
		t.Fatalf("geonode 形态非规范数字条目应全过滤: %+v", gn)
	}
}
