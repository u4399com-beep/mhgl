// ============================================================
// R71-a 回归测试 — fetch 逐行抓虫修复面 + 反反爬增强(承接前轮中断改动收口)
//
//	①二进制子资源(<img>)不再携带 Upgrade-Insecure-Requests(导航专属头,
//	  与 Sec-Fetch-Dest:image 同现即自相矛盾指纹; 文档导航保持携带)
//	②backoffJitter 统一实现: +0~50% 比例窗/crypto-rand 源(高档位退避抖动占比
//	  不再趋零); challengeBackoff 曲线边界回归
//	③pathJitterDelay crypto/rand 源(100~499ms 窗不变)
//	④FetchBinary 子资源 Referer 真实化(嵌入页 Referer + 浏览器跨源改写语义;
//	  refererChain 关闭时保持既有自源口径)
//	⑤cfg.headers 显式 User-Agent 覆盖时指纹头组以线上 UA 为基(家族自洽)
//	⑥首跳请求按 strict-origin-when-cross-origin 改写 Referer(R67-a 逐跳语义补全)
//	⑦限流兜底窗连续自适应升级(30s→60s→120s 钳上限; 显式 RA/成功归零)
//	⑧代理状态表修剪(传输表重置时清除冷却过期键, 活跃冷却/权重记忆保留)
//	⑨WAF 强标记扩容(DataDome 挑战路径/PerimeterX 元素 id/阿里云 WAF)零误伤
//
// ============================================================
package fetch

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"mhgl/internal/crawl/rule"
)

const r71aSafariUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"

// r71aHeaderRecorder 线上请求头捕获(共享给 ①④⑤⑥ 用例)
type r71aHeaderRecorder struct {
	mu    sync.Mutex
	last  http.Header
	pages map[string]func(w http.ResponseWriter, r *http.Request)
}

func newR71aRecorder() *r71aHeaderRecorder {
	return &r71aHeaderRecorder{pages: map[string]func(w http.ResponseWriter, r *http.Request){}}
}

func (rec *r71aHeaderRecorder) add(pattern string, h func(w http.ResponseWriter, r *http.Request)) {
	rec.pages[pattern] = h
}

func (rec *r71aHeaderRecorder) serve() *httptest.Server {
	mux := http.NewServeMux()
	for pattern, h := range rec.pages {
		mux.HandleFunc(pattern, h)
	}
	return httptest.NewServer(mux)
}

func (rec *r71aHeaderRecorder) record(r *http.Request) {
	rec.mu.Lock()
	rec.last = r.Header.Clone()
	rec.mu.Unlock()
}

func (rec *r71aHeaderRecorder) snapshot() http.Header {
	rec.mu.Lock()
	defer rec.mu.Unlock()
	return rec.last
}

// TestR71aBinaryNoUpgradeInsecureRequests ①<img> 子资源不带 Upgrade-Insecure-Requests:
// 真实浏览器 UIR 是导航请求专属 https 升级信号, 子资源从不携带(修前与 Sec-Fetch-Dest:image
// 同现即自相矛盾指纹); 文档导航路径保持携带零变化
func TestR71aBinaryNoUpgradeInsecureRequests(t *testing.T) {
	rec := newR71aRecorder()
	png := []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13}
	rec.add("GET /cover.jpg", func(w http.ResponseWriter, r *http.Request) {
		rec.record(r)
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(png)
	})
	rec.add("GET /page", func(w http.ResponseWriter, r *http.Request) {
		rec.record(r)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<html><head><title>正常页</title></head><body>" + strings.Repeat("内容。", 120) + "</body></html>"))
	})
	srv := rec.serve()
	t.Cleanup(srv.Close)

	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r69aChromeUA})
	defer c.Close()
	ctx := context.Background()

	if _, _, err := c.FetchBinary(ctx, srv.URL+"/cover.jpg", ""); err != nil {
		t.Fatalf("二进制抓取: %v", err)
	}
	if got := rec.snapshot().Get("Upgrade-Insecure-Requests"); got != "" {
		t.Fatalf("<img> 子资源不应携带 Upgrade-Insecure-Requests(修前与 Sec-Fetch-Dest:image 同现即矛盾指纹): %q", got)
	}

	if _, err := c.Fetch(ctx, srv.URL+"/page", ""); err != nil {
		t.Fatalf("HTML 抓取: %v", err)
	}
	if got := rec.snapshot().Get("Upgrade-Insecure-Requests"); got != "1" {
		t.Fatalf("文档导航应保持 Upgrade-Insecure-Requests: 1, got %q(路径零变化回归)", got)
	}
}

// TestR71aBackoffJitterBounds ②退避抖动统一实现: backoffJitter ∈ [0, d/2](比例窗,
// 高档位退避抖动占比不再趋零)且样本非退化(多请求退避波峰打散); challengeBackoff
// 曲线(400ms×2^a 钳 3s + 抖动)边界回归
func TestR71aBackoffJitterBounds(t *testing.T) {
	for _, d := range []time.Duration{400 * time.Millisecond, time.Second, 8 * time.Second} {
		lo, hi := time.Duration(1<<62), time.Duration(0)
		for i := 0; i < 300; i++ {
			j := backoffJitter(d)
			if j < 0 || j > d/2 {
				t.Fatalf("backoffJitter(%v) = %v, 应 ∈ [0, %v]", d, j, d/2)
			}
			if j < lo {
				lo = j
			}
			if j > hi {
				hi = j
			}
		}
		if hi-lo < d/8 {
			t.Fatalf("backoffJitter(%v) 300 样本跨度过窄 [%v,%v] — 退化随机源", d, lo, hi)
		}
	}
	if backoffJitter(0) != 0 || backoffJitter(-time.Second) != 0 {
		t.Fatal("d<=0 恒 0")
	}
	// challengeBackoff: base×2^attempt 钳 max, 附 +0~50% 抖动(修前固定窗, 上界 1.5×base 内)
	for attempt := 0; attempt < challengeRetryMax; attempt++ {
		base := challengeBackoffBase << uint(attempt)
		if base > challengeBackoffMax {
			base = challengeBackoffMax
		}
		for i := 0; i < 50; i++ {
			got := challengeBackoff(attempt)
			if got < base || got > base+base/2 {
				t.Fatalf("challengeBackoff(%d) = %v, 应 ∈ [%v, %v]", attempt, got, base, base+base/2)
			}
		}
	}
}

// TestR71aPathJitterDelayBounds ③pathJitterDelay: 100~499ms(crypto/rand 源与墙钟
// 解耦, 窗口与既有口径一致)
func TestR71aPathJitterDelayBounds(t *testing.T) {
	for i := 0; i < 300; i++ {
		d := pathJitterDelay()
		if d < 100*time.Millisecond || d > 499*time.Millisecond {
			t.Fatalf("pathJitterDelay = %v, 应 ∈ [100ms, 499ms]", d)
		}
	}
}

// TestR71aFetchBinaryReferer ④封面子资源 Referer 真实化: refererChain 开启时携带
// 嵌入页(书籍页)Referer 并按浏览器 strict-origin-when-cross-origin 改写 —— 同源全 URL,
// 跨源仅 origin(修前恒空回落自源 Referer, 对 CDN 封面产生「自指 Referer+same-origin」
// 不可能指纹); refererChain 关闭保持既有自源口径零变化
func TestR71aFetchBinaryReferer(t *testing.T) {
	rec := newR71aRecorder()
	png := []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13}
	rec.add("GET /cover.jpg", func(w http.ResponseWriter, r *http.Request) {
		rec.record(r)
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(png)
	})
	bookSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<html><head><title>书页</title></head><body>ok</body></html>"))
	}))
	t.Cleanup(bookSrv.Close)
	srv := rec.serve()
	t.Cleanup(srv.Close)

	chainOn := true
	bookURL := bookSrv.URL + "/book/1"

	// ①refererChain 开启 + 跨源(书籍页 host ≠ 封面 host) → 仅发书籍页 origin
	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r69aChromeUA,
		RefererChain: &chainOn})
	if _, _, err := c.FetchBinary(context.Background(), srv.URL+"/cover.jpg", bookURL); err != nil {
		t.Fatalf("二进制抓取: %v", err)
	}
	if got := rec.snapshot().Get("Referer"); got != bookSrv.URL+"/" {
		t.Fatalf("跨源 <img> Referer 应为嵌入页 origin(浏览器语义), got %q want %q", got, bookSrv.URL+"/")
	}
	c.Close()

	// ②同源(封面与嵌入页同 host) → 全 URL Referer
	c2 := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r69aChromeUA,
		RefererChain: &chainOn})
	sameBook := srv.URL + "/book/1"
	if _, _, err := c2.FetchBinary(context.Background(), srv.URL+"/cover.jpg", sameBook); err != nil {
		t.Fatalf("二进制抓取: %v", err)
	}
	if got := rec.snapshot().Get("Referer"); got != sameBook {
		t.Fatalf("同源 <img> Referer 应为嵌入页全 URL, got %q want %q", got, sameBook)
	}
	c2.Close()

	// ③refererChain 关闭 → 既有自源口径(封面自身 origin), 零回归
	c3 := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r69aChromeUA})
	if _, _, err := c3.FetchBinary(context.Background(), srv.URL+"/cover.jpg", bookURL); err != nil {
		t.Fatalf("二进制抓取: %v", err)
	}
	if got := rec.snapshot().Get("Referer"); got != srv.URL+"/" {
		t.Fatalf("refererChain 关闭应保持自源 Referer 口径, got %q want %q", got, srv.URL+"/")
	}
	c3.Close()
}

// TestR71aUAOverrideFamilyConsistency ⑤cfg.headers 显式 User-Agent 覆盖时, 指纹头组
// 以线上实际 UA 为基 —— Safari 覆写 UA 不得携带 Chrome 专属 sec-ch-ua 品牌表与
// signed-exchange Accept(修前家族化恒按池内 UA 派生, 与覆写 UA 自相矛盾); 未配置时
// 池内 UA 家族化零变化
func TestR71aUAOverrideFamilyConsistency(t *testing.T) {
	rec := newR71aRecorder()
	rec.add("GET /page", func(w http.ResponseWriter, r *http.Request) {
		rec.record(r)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<html><head><title>正常页</title></head><body>" + strings.Repeat("内容。", 120) + "</body></html>"))
	})
	srv := rec.serve()
	t.Cleanup(srv.Close)
	ctx := context.Background()

	// ①覆写 Safari UA → 头组按 Safari 家族(无 sec-ch-ua / 无 signed-exchange / 有 Sec-Fetch)
	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2,
		Headers: map[string]string{"User-Agent": r71aSafariUA}})
	defer c.Close()
	if _, err := c.Fetch(ctx, srv.URL+"/page", ""); err != nil {
		t.Fatalf("抓取: %v", err)
	}
	h := rec.snapshot()
	if got := h.Get("User-Agent"); got != r71aSafariUA {
		t.Fatalf("覆写 UA 应原样上线, got %q", got)
	}
	if got := h.Get("sec-ch-ua"); got != "" {
		t.Fatalf("Safari UA 覆写时不得携带 Chrome 专属 sec-ch-ua(修前按池内 UA 派生自相矛盾): %q", got)
	}
	if got := h.Get("Accept"); strings.Contains(got, "signed-exchange") || !strings.HasPrefix(got, "text/html") {
		t.Fatalf("Safari 家族 Accept 不得含 signed-exchange, got %q", got)
	}
	if got := h.Get("Sec-Fetch-Dest"); got != "document" {
		t.Fatalf("Safari 16.4+ 应发 Sec-Fetch 家族, got Dest=%q", got)
	}

	// ②未配置覆写 → 池内 Chrome UA 走 Chromium 家族(既有口径零变化)
	rec.mu.Lock()
	rec.last = nil
	rec.mu.Unlock()
	c2 := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r69aChromeUA})
	defer c2.Close()
	if _, err := c2.Fetch(ctx, srv.URL+"/page", ""); err != nil {
		t.Fatalf("抓取: %v", err)
	}
	h2 := rec.snapshot()
	if !strings.Contains(h2.Get("sec-ch-ua"), `"Google Chrome"`) {
		t.Fatalf("未覆写时 Chromium 家族头组应保持(零回归), got %q", h2.Get("sec-ch-ua"))
	}
	if !strings.Contains(h2.Get("Accept"), "signed-exchange") {
		t.Fatalf("未覆写时 Chromium Accept 应含 signed-exchange(零回归), got %q", h2.Get("Accept"))
	}
}

// TestR71aInitialRefererCrossOriginRewrite ⑥首跳请求同样按浏览器
// strict-origin-when-cross-origin 语义改写显式 Referer —— 跨源仅发 origin
// (修前首跳全 URL 原样透传给异源目标, 泄漏来源页路径); 同源全 URL 零变化
func TestR71aInitialRefererCrossOriginRewrite(t *testing.T) {
	rec := newR71aRecorder()
	rec.add("GET /chapter/", func(w http.ResponseWriter, r *http.Request) {
		rec.record(r)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<html><head><title>正文</title></head><body>" + strings.Repeat("正文。", 120) + "</body></html>"))
	})
	tocSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<html><head><title>目录</title></head><body>ok</body></html>"))
	}))
	t.Cleanup(tocSrv.Close)
	srv := rec.serve()
	t.Cleanup(srv.Close)

	chainOn := true
	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r69aChromeUA,
		RefererChain: &chainOn})
	defer c.Close()
	tocURL := tocSrv.URL + "/toc"
	if _, err := c.Fetch(context.Background(), srv.URL+"/chapter/1", tocURL); err != nil {
		t.Fatalf("抓取: %v", err)
	}
	if got := rec.snapshot().Get("Referer"); got != tocSrv.URL+"/" {
		t.Fatalf("跨源首跳 Referer 应降为来源 origin(修前全 URL 泄漏来源页路径), got %q want %q", got, tocSrv.URL+"/")
	}

	// 同源: 全 URL 零变化
	sameToc := srv.URL + "/toc"
	if _, err := c.Fetch(context.Background(), srv.URL+"/chapter/2", sameToc); err != nil {
		t.Fatalf("抓取: %v", err)
	}
	if got := rec.snapshot().Get("Referer"); got != sameToc {
		t.Fatalf("同源首跳 Referer 应保持全 URL(零变化), got %q want %q", got, sameToc)
	}
}

// TestR71aRateLimitFallbackEscalation ⑦限流兜底窗连续自适应升级: 第 n 次连续兜底
// 限流(无显式 Retry-After)按 30s×2^(n-1) 升级钳 120s; 显式 Retry-After 臂如实采纳
// 并归零计数; 请求成功归零(修前恒 30s 固定节拍 — 节拍本身即可被服务端统计识别)
func TestR71aRateLimitFallbackEscalation(t *testing.T) {
	g := newHostGate(4, 0)
	// 第 1 次: 兜底 30s(升级基线, 与既有口径一致)
	g.noteRateLimitedFallback(retryAfterFallback)
	g.mu.Lock()
	w1 := g.rateLimitedUntil
	strikes1 := g.rlStrikes
	g.mu.Unlock()
	if strikes1 != 1 {
		t.Fatalf("strikes = %d, want 1", strikes1)
	}
	if d := time.Until(w1); d < 29*time.Second || d > retryAfterFallback {
		t.Fatalf("第 1 次兜底窗应 ≈30s, got %v", d)
	}
	// 第 2 次: 升级 60s
	g.mu.Lock()
	g.rateLimitedUntil = time.Time{}
	g.mu.Unlock()
	g.noteRateLimitedFallback(retryAfterFallback)
	g.mu.Lock()
	w2 := g.rateLimitedUntil
	g.mu.Unlock()
	if d := time.Until(w2); d < 59*time.Second || d > 2*retryAfterFallback {
		t.Fatalf("第 2 次兜底窗应升级 ≈60s, got %v", d)
	}
	// 第 3 次: 120s(钳 retryAfterMax)
	g.mu.Lock()
	g.rateLimitedUntil = time.Time{}
	g.mu.Unlock()
	g.noteRateLimitedFallback(retryAfterFallback)
	g.mu.Lock()
	w3 := g.rateLimitedUntil
	g.mu.Unlock()
	if d := time.Until(w3); d < retryAfterMax-2*time.Second {
		t.Fatalf("第 3 次兜底窗应钳 120s, got %v", d)
	}
	// 持续限流: 不再越 120s
	g.mu.Lock()
	g.rateLimitedUntil = time.Time{}
	g.mu.Unlock()
	for i := 0; i < 20; i++ {
		g.noteRateLimitedFallback(retryAfterFallback)
	}
	g.mu.Lock()
	w4 := g.rateLimitedUntil
	g.mu.Unlock()
	if d := time.Until(w4); d > retryAfterMax {
		t.Fatalf("持续兜底限流应钳 120s 不越限, got %v", d)
	}
	// 显式 Retry-After: 计数归零, 下次兜底回到 30s 基线
	g.clearRateLimitStrikes()
	g.mu.Lock()
	g.rateLimitedUntil = time.Time{}
	g.mu.Unlock()
	g.noteRateLimitedFallback(retryAfterFallback)
	g.mu.Lock()
	w5 := g.rateLimitedUntil
	g.mu.Unlock()
	if d := time.Until(w5); d > retryAfterFallback {
		t.Fatalf("归零后兜底窗应回 30s 基线, got %v", d)
	}
	// 请求成功: 同样归零(noteSuccess 臂)
	g.mu.Lock()
	g.rlStrikes = 9
	g.mu.Unlock()
	g.noteSuccess()
	g.mu.Lock()
	if g.rlStrikes != 0 {
		t.Fatalf("noteSuccess 应归零升级计数, got %d", g.rlStrikes)
	}
	g.mu.Unlock()
	// 显式 Retry-After 采纳臂不经过升级(doOnce ok 臂走 setRateLimited, 窗口=显式值)
	g2 := newHostGate(4, 0)
	g2.setRateLimited(3 * time.Second)
	g2.mu.Lock()
	w6 := g2.rateLimitedUntil
	g2.mu.Unlock()
	if d := time.Until(w6); d < 2*time.Second || d > 3*time.Second {
		t.Fatalf("显式 RA=3s 应如实采纳, got %v", d)
	}
}

// TestR71aProxyStatePruneOnTransportReset ⑧代理状态表修剪: 传输表越限整表重置时,
// 冷却已过期的 failedUntil/failCount/succCount(零值)键被清除; 活跃冷却键与
// succCount>0 权重键保留(剔除语义与加权随机健康记忆不失真)
func TestR71aProxyStatePruneOnTransportReset(t *testing.T) {
	c := New(rule.FetchConfig{Engine: "http", UaMode: "fixed", AllowLoopback: true})
	defer c.Close()

	mk := func(raw string) *url.URL {
		t.Helper()
		pu, err := url.Parse(raw)
		if err != nil {
			t.Fatalf("proxy url %q: %v", raw, err)
		}
		return pu
	}
	dead := mk("http://10.255.0.1:1") // 冷却已过期的死代理
	live := mk("http://10.255.0.2:2") // 冷却中的代理
	weight := mk("http://10.255.0.3:3")
	c.mu.Lock()
	c.proxyFailedUntil[dead.String()] = time.Now().Add(-time.Minute) // 已过期
	c.proxyFailCount[dead.String()] = 7
	c.proxySuccCount[dead.String()] = 0
	c.proxyFailedUntil[live.String()] = time.Now().Add(5 * time.Minute) // 活跃冷却
	c.proxyFailCount[live.String()] = 3
	c.proxySuccCount[weight.String()] = 9 // 有权重贡献(无冷却行)
	c.mu.Unlock()

	// 灌满传输表触发整表重置+修剪
	for i := 0; i < proxyTransportCap+1; i++ {
		pu, perr := url.Parse("http://192.0.2." + strconv.Itoa(i/256%256) + "." + strconv.Itoa(i%256) + ":8080")
		if perr != nil {
			t.Fatalf("proxy url: %v", perr)
		}
		_ = c.transportFor(pu, false)
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.proxyFailedUntil[dead.String()]; ok {
		t.Fatal("冷却过期的死代理 failedUntil 应被修剪(修前三表只增不减)")
	}
	if _, ok := c.proxyFailCount[dead.String()]; ok {
		t.Fatal("冷却过期的死代理 failCount 应被修剪")
	}
	if _, ok := c.proxySuccCount[dead.String()]; ok {
		t.Fatal("冷却过期且零权重的 succCount 应被修剪")
	}
	if until, ok := c.proxyFailedUntil[live.String()]; !ok || !until.After(time.Now()) {
		t.Fatal("活跃冷却窗的键应原样保留(剔除语义不变, 不因修剪提前复活)")
	}
	if cnt, ok := c.proxyFailCount[live.String()]; !ok || cnt != 3 {
		t.Fatal("活跃冷却键的连败计数应保留(冷却结束后冷却底数不失真)")
	}
	if w, ok := c.proxySuccCount[weight.String()]; !ok || w != 9 {
		t.Fatal("succCount>0 的权重键应保留(加权随机健康记忆不失真)")
	}
	if len(c.proxyTans) > proxyTransportCap {
		t.Fatalf("传输表应被重置有界, len = %d", len(c.proxyTans))
	}
}

// TestR71aWafMarkerAdditions ⑨WAF 强标记扩容(DataDome 挑战路径/PerimeterX 元素 id/
// 阿里云 WAF acw_sc__v2/errors.aliyun.com)命中即拦; 正常长页+正常标题零误伤
// (站点级 tag 脚本形态不在词表 — 受保护站正常页嵌入面零误伤)
func TestR71aWafMarkerAdditions(t *testing.T) {
	markers := []string{
		"https://geo.captcha-delivery.com/captcha/?initialCid=abc",
		`<div id="px-captcha">Please verify</div>`,
		`<script>var acw_sc__v2="x";</script>`,
		`<meta http-equiv="refresh" content="0;url=https://errors.aliyun.com/xxx">`,
	}
	for _, m := range markers {
		page := "<html><head></head><body>" + m + "</body></html>"
		if !looksBlocked(page, 200, "") {
			t.Fatalf("挑战/拦截页强标记应判拦: %s", m)
		}
	}
	// 零误伤: 长页+正常标题(弱词"验证"在正文提及也不误判, 强标记不在页内)
	normal := "<html><head><title>仙侠小说_第1章</title></head><body>" +
		strings.Repeat("他在雷池边缘渡劫, 云锁千山, 安全狗吠声远远传来。", 200) + "</body></html>"
	if looksBlocked(normal, 200, "") {
		t.Fatal("正常长页+正常标题不应判拦(含中文产品名正文碰撞形态)")
	}
	// 站点级 DataDome tag 脚本(非挑战路径)不应命中新词条(受保护站正常页嵌入面)
	tagOnly := "<html><head><title>正常页</title></head><body><script src=\"https://js.datadome.co/tags.js\"></script>" +
		strings.Repeat("正文内容。", 200) + "</body></html>"
	if looksBlocked(tagOnly, 200, "") {
		t.Fatal("DataDome 站点级 tag 脚本(非挑战路径)不应判拦 — 强标记只收挑战页专属形态")
	}
}
