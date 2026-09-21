// ============================================================
// fetch 层最小单测 — R51-2-b 审计盲区补齐(R51-3-a 清单 ㉖)
//
//	① token 预取嵌套过闸死锁回归 ② jar Set-Cookie 同名去重(服务端覆盖静态种子)
//	③ tokenUrl=127.0.0.1 无 allowLoopback 预取成功(隐式 loopback 豁免)
//	⑤ blockcheck 五类样本 ⑥ Retry-After 429→2s 冷却时序 ⑦ 头组形态(家族自洽)
//	⑧ mirror sticky 顺序
//
// ============================================================
package fetch

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"crawler-go/internal/rule"
)

// newTokenSite 假站: /token 返回 token 体; /page 返回正常长页
func newTokenSite(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /token", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("tok-1234567890"))
	})
	mux.HandleFunc("GET /page", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(fmt.Sprintf("<html><head><title>正常页</title></head><body>%s</body></html>", strings.Repeat("正文内容。", 120))))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// TestTokenPrefetchNoDeadlock ①并发 4×同 host + tokenUrl + 全局并发 1: 旧实现 token
// 预取发生在持闸之后(全局信号量内再等全局信号量) = 嵌套过闸死锁; 修复后预取在取闸
// 之前且不过闸, 5s 内全部完成即通过
func TestTokenPrefetchNoDeadlock(t *testing.T) {
	site := newTokenSite(t)
	cfg := rule.FetchConfig{
		Engine: "http", UaMode: "fixed", Timeout: 3000, Retries: 0,
		HostGateLimit: 1, GlobalConcurrency: 1, AllowLoopback: true,
		TokenURL: site.URL + "/token",
	}
	c := New(cfg)
	defer c.Close()
	var wg sync.WaitGroup
	var okCount atomic.Int64
	start := time.Now()
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			res, err := c.Fetch(context.Background(), site.URL+"/page", "")
			if err == nil && !res.Blocked {
				okCount.Add(1)
			}
		}()
	}
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("并发 4×同 host token 预取 5s 未完成 = 嵌套过闸死锁回归")
	}
	if okCount.Load() != 4 {
		t.Fatalf("成功数 = %d, want 4", okCount.Load())
	}
	t.Logf("并发完成耗时 %v", time.Since(start))
}

// TestJarSetCookieOverridesSeed ②静态 Cookie 注入 jar + 服务端 Set-Cookie 同名覆盖:
// 首请求带静态种子(sid=seed; theme=dark), 响应 Set-Cookie sid=server 后,
// 二次请求应带 sid=server(同名去重覆盖) 且保留 theme=dark
func TestJarSetCookieOverridesSeed(t *testing.T) {
	var mu sync.Mutex
	var seen []string
	reqCount := 0
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		seen = append(seen, r.Header.Get("Cookie"))
		reqCount++
		n := reqCount
		mu.Unlock()
		if n == 1 {
			w.Header().Add("Set-Cookie", "sid=server; Path=/")
		}
		_, _ = w.Write([]byte(fmt.Sprintf("<html><head><title>正常页</title></head><body>%s</body></html>", strings.Repeat("内容。", 120))))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	cfg := rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 3000,
		AllowLoopback: true, Cookies: "sid=seed; theme=dark", GlobalConcurrency: 2}
	c := New(cfg)
	defer c.Close()
	if _, err := c.Fetch(context.Background(), srv.URL+"/first", ""); err != nil {
		t.Fatalf("第一次抓取: %v", err)
	}
	if _, err := c.Fetch(context.Background(), srv.URL+"/second", ""); err != nil {
		t.Fatalf("第二次抓取: %v", err)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(seen) != 2 {
		t.Fatalf("请求数 = %d, want 2", len(seen))
	}
	if !strings.Contains(seen[0], "sid=seed") || !strings.Contains(seen[0], "theme=dark") {
		t.Fatalf("首次请求应携带静态种子 Cookie: %q", seen[0])
	}
	if !strings.Contains(seen[1], "sid=server") {
		t.Fatalf("二次请求应携带服务端 Set-Cookie 覆盖值: %q", seen[1])
	}
	if strings.Contains(seen[1], "sid=seed") {
		t.Fatalf("同名 Cookie 应被服务端值覆盖(jar 去重): %q", seen[1])
	}
	if !strings.Contains(seen[1], "theme=dark") {
		t.Fatalf("静态种子其余键应保留: %q", seen[1])
	}
}

// TestTokenPrefetchLoopbackExempt ③tokenUrl 指向 127.0.0.1 且未开 allowLoopback:
// 预取经隐式 loopback 豁免成功(本地签名/转换代理形态, 契约文件头声明语义)
func TestTokenPrefetchLoopbackExempt(t *testing.T) {
	site := newTokenSite(t)
	cfg := rule.FetchConfig{Engine: "http", Timeout: 3000, AllowLoopback: false,
		TokenURL: site.URL + "/token", GlobalConcurrency: 2}
	c := New(cfg)
	defer c.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	tok := c.prefetchToken(ctx, site.URL+"/page")
	if !strings.HasPrefix(tok, "tok-") {
		t.Fatalf("tokenUrl=127.0.0.1 无 allowLoopback 预取应成功(隐式豁免), got %q", tok)
	}
}

// TestLooksBlockedSamples ⑤拦截页判定五类样本
func TestLooksBlockedSamples(t *testing.T) {
	long := strings.Repeat("这是一段足够长的正文内容, 用于撑起页面长度判定阈值。", 60)
	cases := []struct {
		name   string
		html   string
		status int
		server string
		want   bool
	}{
		{"空体判拦", "", 200, "", true},
		{"强标记CF挑战页", "<html><head><title>Just a moment...</title></head><body>Checking your browser before accessing</body></html>", 200, "", true},
		{"合法JSON整体豁免", `{"ok":true,"list":[{"name":"验证码史话"}]}`, 200, "", false},
		{"403加WAFServer头联合判拦", "<html><body>error</body></html>", 403, "cloudflare", true},
		{"极短页判拦", "<html></html>", 200, "", true},
		{"长页正常标题豁免", "<html><head><title>斗破苍穹最新章节列表</title></head><body>" + long + "本站早已废除验证码公告。</body></html>", 200, "", false},
	}
	for _, c := range cases {
		if got := LooksBlocked(c.html, c.status, c.server); got != c.want {
			t.Fatalf("%s: LooksBlocked = %v, want %v", c.name, got, c.want)
		}
	}
}

// TestRetryAfter429Cooldown ⑥429 + Retry-After: 2 → 重试链等待冷却窗后成功(时序 ≥1.8s;
// 若冷却不被尊重, 重试在 ~0.5s 内完成即失败)
func TestRetryAfter429Cooldown(t *testing.T) {
	var calls atomic.Int64
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.Header().Set("Retry-After", "2")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte("rate limited"))
			return
		}
		_, _ = w.Write([]byte(fmt.Sprintf("<html><head><title>正常页</title></head><body>%s</body></html>", strings.Repeat("内容。", 120))))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	cfg := rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 1,
		AllowLoopback: true, GlobalConcurrency: 4}
	c := New(cfg)
	defer c.Close()
	start := time.Now()
	res, err := c.Fetch(context.Background(), srv.URL+"/page", "")
	el := time.Since(start)
	if err != nil {
		t.Fatalf("429 后重试应成功: %v", err)
	}
	if res.Blocked {
		t.Fatal("正常页不应判拦")
	}
	if el < 1800*time.Millisecond {
		t.Fatalf("Retry-After: 2 未被尊重(仅 %v) — 冷却窗未生效", el)
	}
	if el > 8*time.Second {
		t.Fatalf("冷却耗时异常: %v", el)
	}
	if c.RateLimitedCount() != 1 {
		t.Fatalf("rateLimited 计数 = %d, want 1", c.RateLimitedCount())
	}
	if calls.Load() < 2 {
		t.Fatalf("应发起第二次请求: %d", calls.Load())
	}
}

// TestFingerprintHeaders ⑦头组与 UA 家族自洽: Chrome 必有 sec-ch-ua 且品牌版本与 UA
// 一致; Safari 必无 sec-ch-ua 与 Sec-Fetch-*; Firefox 只发 Sec-Fetch; Sec-Fetch-Site
// 按 Referer 关系判定
func TestFingerprintHeaders(t *testing.T) {
	chromeUA := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
	h := fingerprintHeaders(chromeUA, "", "https://example.com/a")
	if got := h["sec-ch-ua"]; !strings.Contains(got, `"Chromium";v="137"`) || !strings.Contains(got, `"Google Chrome";v="137"`) {
		t.Fatalf("Chrome UA sec-ch-ua 品牌版本应与 UA 一致: %q", got)
	}
	if h["sec-ch-ua-mobile"] != "?0" || h["sec-ch-ua-platform"] != `"Windows"` {
		t.Fatalf("sec-ch-ua-mobile/platform 异常: %q / %q", h["sec-ch-ua-mobile"], h["sec-ch-ua-platform"])
	}
	if h["Sec-Fetch-Site"] != "none" || h["Sec-Fetch-User"] != "?1" {
		t.Fatalf("无 Referer 应为 none/?1: %q / %q", h["Sec-Fetch-Site"], h["Sec-Fetch-User"])
	}

	safariUA := "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
	hs := fingerprintHeaders(safariUA, "https://other.com/", "https://example.com/a")
	if _, ok := hs["sec-ch-ua"]; ok {
		t.Fatalf("Safari 不应发 sec-ch-ua: %v", hs)
	}
	if _, ok := hs["Sec-Fetch-Dest"]; ok {
		t.Fatalf("Safari 不应发 Sec-Fetch-*: %v", hs)
	}

	ffUA := "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0"
	hf := fingerprintHeaders(ffUA, "https://example.com/toc", "https://example.com/book")
	if hf["Sec-Fetch-Site"] != "same-origin" || hf["Sec-Fetch-User"] != "?0" {
		t.Fatalf("Firefox Sec-Fetch 组异常: %v", hf)
	}
	if _, ok := hf["sec-ch-ua"]; ok {
		t.Fatalf("Firefox 不应发 sec-ch-ua")
	}

	hx := fingerprintHeaders(chromeUA, "https://referer.example.org/x", "https://example.com/a")
	if hx["Sec-Fetch-Site"] != "cross-site" {
		t.Fatalf("跨注册域 Referer 应判 cross-site: %q", hx["Sec-Fetch-Site"])
	}
}

// TestMirrorStickyReorder ⑧镜像成功域 sticky: 候选按上次成功域重排首位, 清除后回原序
func TestMirrorStickyReorder(t *testing.T) {
	c := New(rule.FetchConfig{MirrorDomains: "m1.com,m2.com", GlobalConcurrency: 2})
	defer c.Close()
	group := c.mirrorGroup("http://main.com/a")
	want := []string{"http://main.com/a", "http://m1.com/a", "http://m2.com/a"}
	if !reflect.DeepEqual(group, want) {
		t.Fatalf("初始组序 = %v, want %v", group, want)
	}
	c.noteMirrorSuccess("main.com", "m2.com")
	group = c.mirrorGroup("http://main.com/b")
	if group[0] != "http://m2.com/b" {
		t.Fatalf("sticky 成功域应重排首位: %v", group)
	}
	if !reflect.DeepEqual(group, []string{"http://m2.com/b", "http://main.com/b", "http://m1.com/b"}) {
		t.Fatalf("sticky 组序 = %v", group)
	}
	// R51-4: sticky key=注册域(eTLD+1, 与 TS registrableDomainOf 口径对齐) ——
	// 同注册域多子域共享 sticky 记忆(修前 key=整 host, 子域间不互享)
	c.noteMirrorSuccess("www.main.com", "m2.com")
	group = c.mirrorGroup("http://api.main.com/d")
	if group[0] != "http://m2.com/d" {
		t.Fatalf("同注册域子域应共享 sticky: %v", group)
	}
	c.clearMirrorSticky("main.com")
	group = c.mirrorGroup("http://main.com/c")
	if group[0] != "http://main.com/c" {
		t.Fatalf("整组耗尽清 sticky 后应回原序: %v", group)
	}
}
