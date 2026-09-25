// ============================================================
// R67-a 回归测试 — 头集完整性增强 + 重定向 Referer 语义 + 传输面修复
//
//	①sec-ch-ua 品牌集对齐真实浏览器(Edge 不含 Google Chrome 品牌)+ 品牌序
//	  稳定置换(同 UA 恒定同序; 异 UA 间序打散)
//	②Sec-Fetch-User 恒 "?1"(真实浏览器从不发 "?0"); Safari(≥16.4)发 Sec-Fetch-*
//	③重定向链逐跳 Referer 浏览器 strict-origin-when-cross-origin 语义:
//	  同源全 URL/跨源仅 origin/https→http 降级不发/首跳不受影响
//	④代理地址无端口形态补缺省端口(http:80/https:443/socks5:1080, IPv6 literal 括号)
//	⑤CGNAT 100.64.0.0/10 纳入 SSRF 拒绝面(isDeniedIP+ssrfCheck 双层)
//	⑥负 Retries 零值防御(attempts=1+Retries ≤0 曾使重试循环整体跳过 → 恒失败)
//
// ============================================================
package fetch

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/andybalholm/brotli"
	"github.com/klauspost/compress/zstd"

	"mhgl/internal/crawl/rule"
)

// TestR67aSecChUABrandSets ①品牌集: Chrome = Google Chrome+Chromium+GREASE;
// Edge = Microsoft Edge+Chromium+GREASE 且绝不含 "Google Chrome"(修前 Edge 混入
// Google Chrome 品牌 = 真浏览器不存在的自相矛盾指纹); 品牌 3 段、版本与 UA 同版
func TestR67aSecChUABrandSets(t *testing.T) {
	chromeUA := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
	edgeUA := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0"

	hc := fingerprintHeaders(chromeUA, "", "https://example.com/a")["sec-ch-ua"]
	if !strings.Contains(hc, `"Google Chrome";v="143"`) || !strings.Contains(hc, `"Chromium";v="143"`) || !strings.Contains(hc, `"Not:A-Brand";v="24"`) {
		t.Fatalf("Chrome 品牌集缺项: %q", hc)
	}
	if strings.Contains(hc, "Microsoft Edge") {
		t.Fatalf("Chrome UA 不应含 Microsoft Edge 品牌: %q", hc)
	}
	if n := len(strings.Split(hc, ", ")); n != 3 {
		t.Fatalf("Chrome sec-ch-ua 应为 3 品牌, got %d: %q", n, hc)
	}

	he := fingerprintHeaders(edgeUA, "", "https://example.com/a")["sec-ch-ua"]
	if !strings.Contains(he, `"Microsoft Edge";v="143"`) || !strings.Contains(he, `"Chromium";v="143"`) || !strings.Contains(he, `"Not:A-Brand";v="24"`) {
		t.Fatalf("Edge 品牌集缺项: %q", he)
	}
	if strings.Contains(he, "Google Chrome") {
		t.Fatalf("Edge UA 绝不应声明 Google Chrome 品牌(真实 Edge 行为): %q", he)
	}
	if n := len(strings.Split(he, ", ")); n != 3 {
		t.Fatalf("Edge sec-ch-ua 应为 3 品牌, got %d: %q", n, he)
	}

	// 品牌序稳定置换: 同一 UA 恒定同序(会话稳定); 池内 chromium 族 UA 间至少 2 种序
	if again := fingerprintHeaders(chromeUA, "", "https://example.com/a")["sec-ch-ua"]; again != hc {
		t.Fatalf("同 UA 品牌序应稳定(会话口径): %q vs %q", hc, again)
	}
	orders := map[string]int{}
	for _, ua := range uaPool {
		if uaFamily(ua) != "chromium" {
			continue
		}
		seg := strings.Split(fingerprintHeaders(ua, "", "https://example.com/a")["sec-ch-ua"], ", ")
		orders[strings.Join(seg, "|")]++
	}
	if len(orders) < 2 {
		t.Fatalf("池内 chromium UA 品牌序应呈现 ≥2 种排列(GREASE 多样性), got %d", len(orders))
	}
}

// TestR67aSecFetchUserAlwaysQ1 ②Sec-Fetch-User 恒 "?1"(修前有 Referer 时发 "?0",
// 真实浏览器从不上线 "?0"); Safari(17.4/18.4)纳入 Sec-Fetch 家族
func TestR67aSecFetchUserAlwaysQ1(t *testing.T) {
	uas := map[string]string{
		"chromium": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
		"firefox":  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
		"safari":   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
	}
	for family, ua := range uas {
		for _, ref := range []string{"", "https://other.example/toc"} {
			h := fingerprintHeaders(ua, ref, "https://example.com/book")
			if got := h["Sec-Fetch-User"]; got != "?1" {
				t.Fatalf("%s(referer=%q) Sec-Fetch-User = %q, want 恒 ?1(真实浏览器口径)", family, ref, got)
			}
			if h["Sec-Fetch-Dest"] != "document" || h["Sec-Fetch-Mode"] != "navigate" {
				t.Fatalf("%s Sec-Fetch Dest/Mode 异常: %v", family, h)
			}
			wantSite := "none"
			if ref != "" {
				wantSite = "cross-site"
			}
			if h["Sec-Fetch-Site"] != wantSite {
				t.Fatalf("%s(referer=%q) Sec-Fetch-Site = %q, want %q", family, ref, h["Sec-Fetch-Site"], wantSite)
			}
		}
	}
}

// TestR67aRedirectRefererBrowserSemantics ③重定向链逐跳 Referer 浏览器语义:
// ①首跳保持注入值 ②同源跳发完整上一跳 URL ③跨源跳仅发来源 origin
// ④https→http 降级跳不发 Referer
func TestR67aRedirectRefererBrowserSemantics(t *testing.T) {
	var mu sync.Mutex
	refAt := map[string]string{}
	record := func(name string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			mu.Lock()
			refAt[name] = r.Header.Get("Referer")
			mu.Unlock()
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(fmt.Sprintf("<html><head><title>正常页 %s</title></head><body>%s</body></html>", name, strings.Repeat("正文内容。", 120))))
		}
	}

	// 同源链: /start → 302 /mid → 302 /final
	sameMux := http.NewServeMux()
	sameMux.HandleFunc("GET /start", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/mid", http.StatusFound)
	})
	sameMux.HandleFunc("GET /mid", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/final", http.StatusFound)
	})
	sameMux.Handle("GET /final", record("same-origin /final"))
	sameSrv := httptest.NewServer(sameMux)
	t.Cleanup(sameSrv.Close)

	// 跨源链: srvA /cross → 302 srvB /land → 302 /final2(同源段)
	aMux := http.NewServeMux()
	aSrv := httptest.NewServer(aMux)
	t.Cleanup(aSrv.Close)

	var bURL string
	bMux := http.NewServeMux()
	bMux.HandleFunc("GET /land", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		refAt["cross-origin /land"] = r.Header.Get("Referer")
		mu.Unlock()
		http.Redirect(w, r, "/final2", http.StatusFound)
	})
	bMux.Handle("GET /final2", record("cross-origin /final2"))
	bSrv := httptest.NewServer(bMux)
	t.Cleanup(bSrv.Close)
	bURL = bSrv.URL
	aMux.HandleFunc("GET /cross", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, bURL+"/land", http.StatusFound)
	})

	c := New(rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2})
	defer c.Close()
	ctx := context.Background()

	// ① 同源链
	if _, err := c.Fetch(ctx, sameSrv.URL+"/start", ""); err != nil {
		t.Fatalf("同源链抓取: %v", err)
	}
	mu.Lock()
	gotFinal := refAt["same-origin /final"]
	mu.Unlock()
	if want := sameSrv.URL + "/mid"; gotFinal != want {
		t.Fatalf("同源跳应发完整上一跳 URL: got %q, want %q", gotFinal, want)
	}

	// ② 跨源链: /cross → /land 应仅发 A 的 origin; /land → /final2 同源发完整 URL
	if _, err := c.Fetch(ctx, aSrv.URL+"/cross", ""); err != nil {
		t.Fatalf("跨源链抓取: %v", err)
	}
	mu.Lock()
	gotLand := refAt["cross-origin /land"]
	gotFinal2 := refAt["cross-origin /final2"]
	mu.Unlock()
	aURL, _ := url.Parse(aSrv.URL)
	if want := "http://" + aURL.Host + "/"; gotLand != want {
		t.Fatalf("跨源跳应仅发来源 origin: got %q, want %q", gotLand, want)
	}
	if want := bSrv.URL + "/land"; gotFinal2 != want {
		t.Fatalf("跨源链同源段应发完整上一跳 URL: got %q, want %q", gotFinal2, want)
	}

	// ③ 首跳不受影响: 请求 A /cross 时 Referer 仍为自动同源 origin(经记录侧验证:
	// /cross 未记录, 以直接抓取 /rec 验证首跳)
	recMux := http.NewServeMux()
	recMux.Handle("GET /rec", record("first-hop"))
	recSrv := httptest.NewServer(recMux)
	t.Cleanup(recSrv.Close)
	if _, err := c.Fetch(ctx, recSrv.URL+"/rec", ""); err != nil {
		t.Fatalf("首跳抓取: %v", err)
	}
	mu.Lock()
	gotFirst := refAt["first-hop"]
	mu.Unlock()
	if want := "http://" + recURLHost(recSrv.URL) + "/"; gotFirst != want {
		t.Fatalf("首跳自动 Referer 不应受逐跳重写影响: got %q, want %q", gotFirst, want)
	}

	// ④ https→http 降级: TLS 站 302 → 明文站, 降级跳不发 Referer
	tlsMux := http.NewServeMux()
	tlsMux.HandleFunc("GET /jump", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, bSrv.URL+"/final2", http.StatusFound)
	})
	tlsSrv := httptest.NewTLSServer(tlsMux)
	t.Cleanup(tlsSrv.Close)
	cTLS := New(rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2})
	defer cTLS.Close()
	cTLS.hc.Transport.(*http.Transport).TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec // 本地自签测试专用
	mu.Lock()
	delete(refAt, "cross-origin /final2")
	mu.Unlock()
	if _, err := cTLS.Fetch(ctx, tlsSrv.URL+"/jump", ""); err != nil {
		t.Fatalf("降级链抓取: %v", err)
	}
	mu.Lock()
	gotDown := refAt["cross-origin /final2"]
	mu.Unlock()
	if gotDown != "" {
		t.Fatalf("https→http 降级跳不应发 Referer(修前原样透传): got %q", gotDown)
	}
}

// recURLHost 从 httptest URL 剥 scheme(测试小助手)
func recURLHost(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	return u.Host
}

// TestR67aParseProxyAddrDefaultPorts ④无端口代理条目补缺省端口(修前通过解析却
// 在拨号期 missing port 失败): 裸 host→http:80 / https→443 / socks5→1080 /
// socks5h 归一+补端口 / IPv6 literal 括号形态保持 / 显式端口不变 / 非法协议拒绝
func TestR67aParseProxyAddrDefaultPorts(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"1.2.3.4", "http://1.2.3.4:80", true},
		{"1.2.3.4:8080", "http://1.2.3.4:8080", true},
		{"https://p.example.com", "https://p.example.com:443", true},
		{"socks5://5.6.7.8", "socks5://5.6.7.8:1080", true},
		{"socks5h://5.6.7.8", "socks5://5.6.7.8:1080", true},
		{"socks5://5.6.7.8:1081", "socks5://5.6.7.8:1081", true},
		{"socks5://[::1]", "socks5://[::1]:1080", true},
		{"ftp://1.2.3.4", "", false},
		{"", "", false},
		{"   ", "", false},
	}
	for _, tc := range cases {
		pu, ok := parseProxyAddr(tc.in)
		if ok != tc.ok {
			t.Fatalf("parseProxyAddr(%q) ok = %v, want %v", tc.in, ok, tc.ok)
		}
		if ok && pu.String() != tc.want {
			t.Fatalf("parseProxyAddr(%q) = %q, want %q", tc.in, pu.String(), tc.want)
		}
	}
	// 静态池接线: 无端口条目现在真正入池(修前入池但拨号必败)
	c := New(rule.FetchConfig{ProxyURL: "1.2.3.4, socks5://5.6.7.8", GlobalConcurrency: 2})
	defer c.Close()
	if got := c.ProxyCount(); got != 2 {
		t.Fatalf("无端口条目应入池, ProxyCount = %d, want 2", got)
	}
}

// TestR67aDeniedIPCGNAT ⑤CGNAT 100.64.0.0/10 拒绝面(IsPrivate 不覆盖的 RFC 6598
// 运营商/云内网段): isDeniedIP 边界(100.63/100.128 放行, 100.64~100.127 拒绝)+
// ssrfCheck 端到端拒绝
func TestR67aDeniedIPCGNAT(t *testing.T) {
	cases := []struct {
		ip   string
		want bool
	}{
		{"100.64.0.1", true},
		{"100.127.255.255", true},
		{"100.100.100.100", true},
		{"100.128.0.1", false},    // 超出 /10
		{"100.63.255.255", false}, // 低于 /10
		{"8.8.8.8", false},
		{"10.0.0.1", true},        // 私网(既有面回归)
		{"169.254.169.254", true}, // 云元数据(既有面回归)
	}
	for _, tc := range cases {
		if got := isDeniedIP(net.ParseIP(tc.ip)); got != tc.want {
			t.Fatalf("isDeniedIP(%s) = %v, want %v", tc.ip, got, tc.want)
		}
	}
	if err := ssrfCheck("http://100.64.0.1/", true); err == nil {
		t.Fatal("CGNAT 目标应被 ssrfCheck 拒绝(即便 loopback 豁免)")
	}
	if err := ssrfCheck("http://8.8.8.8/", false); err != nil {
		t.Fatalf("公网目标不应误拒: %v", err)
	}
}

// TestR67aNegativeRetriesClamped ⑥负 Retries 零值防御: 修前 attempts=1+Retries≤0
// 使重试循环整体跳过, 每次抓取必以「抓取失败」告终; 修后钳 0, 单次抓取正常
func TestR67aNegativeRetriesClamped(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("<html><head><title>正常页</title></head><body>" + strings.Repeat("正文内容。", 120) + "</body></html>"))
	}))
	t.Cleanup(srv.Close)

	c := New(rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 3000,
		AllowLoopback: true, GlobalConcurrency: 2, Retries: -5})
	defer c.Close()
	if c.cfg.Retries != 0 {
		t.Fatalf("负 Retries 应钳 0, got %d", c.cfg.Retries)
	}
	res, err := c.Fetch(context.Background(), srv.URL+"/page", "")
	if err != nil {
		t.Fatalf("Retries=-5 钳 0 后单次抓取应成功(修前 attempts=0 恒失败): %v", err)
	}
	if res.Blocked || !strings.Contains(res.HTML, "正常页") {
		t.Fatalf("抓取结果异常: blocked=%v html=%q", res.Blocked, res.HTML[:60])
	}
}

// TestR67aAcceptEncodingFamilies 家族化 Accept-Encoding([R67-a] 头集完整性):
// Chrome/Firefox = gzip, deflate, br, zstd; Safari = gzip, deflate, br(修前恒
// "gzip, deflate" 与真实浏览器全家族广告 br 相悖)
func TestR67aAcceptEncodingFamilies(t *testing.T) {
	var mu sync.Mutex
	gotAE := ""
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		gotAE = r.Header.Get("Accept-Encoding")
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("<html><head><title>正常页</title></head><body>" + strings.Repeat("正文内容。", 120) + "</body></html>"))
	}))
	t.Cleanup(srv.Close)

	cases := []struct{ ua, want string }{
		{"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36", "gzip, deflate, br, zstd"},
		{"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0", "gzip, deflate, br, zstd"},
		{"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15", "gzip, deflate, br"},
		{"scout/1.0 (unknown family)", "gzip, deflate"},
	}
	for _, tc := range cases {
		c := New(rule.FetchConfig{Engine: "http", UaMode: "custom", CustomUa: tc.ua, Timeout: 3000,
			AllowLoopback: true, GlobalConcurrency: 2})
		if _, err := c.Fetch(context.Background(), srv.URL+"/page", ""); err != nil {
			t.Fatalf("抓取(ua=%s): %v", tc.ua, err)
		}
		mu.Lock()
		got := gotAE
		mu.Unlock()
		if got != tc.want {
			t.Fatalf("Accept-Encoding(ua=%s) = %q, want %q", tc.ua, got, tc.want)
		}
		c.Close()
	}
}

// TestR67aBrotliAndZstdBodyDecode 广告与解压成对: 服务端按 Content-Encoding: br / zstd
// 压缩响应, 客户端须解出原文(修前只解 gzip/deflate, 广告 br 即乱码); 压缩器用同库
// Writer(解码面与真实源站 br/zstd 响应同构)
func TestR67aBrotliAndZstdBodyDecode(t *testing.T) {
	page := func(tag string) string {
		return "<html><head><title>解压页 " + tag + "</title></head><body>" + strings.Repeat("正文内容。", 120) + "</body></html>"
	}
	serve := map[string]func(w http.ResponseWriter, r *http.Request){
		"br": func(w http.ResponseWriter, r *http.Request) {
			var buf bytes.Buffer
			bw := brotli.NewWriter(&buf)
			_, _ = bw.Write([]byte(page("br")))
			_ = bw.Close()
			w.Header().Set("Content-Encoding", "br")
			_, _ = w.Write(buf.Bytes())
		},
		"zstd": func(w http.ResponseWriter, r *http.Request) {
			var buf bytes.Buffer
			zw, _ := zstd.NewWriter(&buf)
			_, _ = zw.Write([]byte(page("zstd")))
			_ = zw.Close()
			w.Header().Set("Content-Encoding", "zstd")
			_, _ = w.Write(buf.Bytes())
		},
	}
	mux := http.NewServeMux()
	for k, h := range serve {
		mux.HandleFunc("GET /"+k, h)
	}
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	c := New(rule.FetchConfig{Engine: "http", UaMode: "custom",
		CustomUa: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
		Timeout:  3000, AllowLoopback: true, GlobalConcurrency: 2})
	defer c.Close()
	for _, enc := range []string{"br", "zstd"} {
		res, err := c.Fetch(context.Background(), srv.URL+"/"+enc, "")
		if err != nil {
			t.Fatalf("%s 响应解压抓取: %v", enc, err)
		}
		if res.Blocked || !strings.Contains(res.HTML, "解压页 "+enc) {
			t.Fatalf("%s 响应应解出原文: blocked=%v html=%q", enc, res.Blocked, res.HTML[:60])
		}
	}
}
