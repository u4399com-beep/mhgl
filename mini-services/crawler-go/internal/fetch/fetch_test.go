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
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
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

// ---------------- [R53-2a] 六项 P3 修复单测 ----------------

// TestProxyChannelErrorExempt [R53-2a](代理误责):
// ①纯逻辑: proxyChannelError 经 errors.As 可打标识别(含 fmt.Errorf %w 包装链),
//
//	普通网络错误/HTTP 状态壳不误判 —— rawFetch 据此豁免 gate.noteFailure 的判定面;
//
// ②集成(生产 rawFetch 真实分支): 死代理通道失败 → 目标 host 闸零喂连败+代理入失败冷却;
//
//	③对照: 无代理直连死端口 → 普通错误照常喂闸(豁免不误伤真实站点故障)
func TestProxyChannelErrorExempt(t *testing.T) {
	// ① 纯逻辑: errors.As 打标/豁免判定
	inner := errors.New("dial tcp 127.0.0.1:9: connect: connection refused")
	pxy := &proxyChannelError{err: inner}
	if !strings.Contains(pxy.Error(), "代理通道失败") {
		t.Fatalf("proxyChannelError 消息应带通道语义: %q", pxy.Error())
	}
	if !errors.Is(pxy, inner) {
		t.Fatal("proxyChannelError.Unwrap 应透出底层网络错误")
	}
	wrapped := fmt.Errorf("抓取: %w", pxy)
	var hit *proxyChannelError
	if !errors.As(wrapped, &hit) || hit != pxy {
		t.Fatal("包装链中的 proxyChannelError 应被 errors.As 识别")
	}
	// 豁免判定面(errors.As 命中 → 跳过 gate.noteFailure): 负样本不误判
	var probe *proxyChannelError
	if errors.As(error(inner), &probe) {
		t.Fatal("普通网络错误不应被识别为代理通道失败")
	}
	if errors.As(error(&httpStatusError{code: 503}), &probe) {
		t.Fatal("HTTP 状态壳不应被识别为代理通道失败")
	}

	// ② 集成: 死代理(先建后关的 httptest 端口, 连接必拒) → rawFetch 豁免目标 host 闸。
	// 目标须为非回环(pickProxy 对回环目标豁免直连, 代理层不可达): 用 TEST-NET-3
	// 文档段 IP 字面量(RFC 5737, 非私网/链路本地, ssrfCheck 放行, 无 DNS 依赖)
	deadSrv := httptest.NewServer(http.NewServeMux())
	deadProxyURL := deadSrv.URL // 先取地址后关: 端口即刻拒绝, 沙箱环境稳定
	deadSrv.Close()
	cfg := rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 2000, Retries: 0,
		HostGateLimit: 3, GlobalConcurrency: 2, AllowLoopback: true, ProxyURL: deadProxyURL}
	c := New(cfg)
	defer c.Close()
	if _, err := c.Fetch(context.Background(), "http://203.0.113.1/page", ""); err == nil {
		t.Fatal("死代理下抓取应失败")
	} else {
		var pe *proxyChannelError
		if !errors.As(err, &pe) {
			t.Fatalf("代理通道失败应打标 proxyChannelError 上抛: %v", err)
		}
	}
	g1 := c.gateFor("203.0.113.1")
	g1.mu.Lock()
	fails := g1.fails
	g1.mu.Unlock()
	if fails != 0 {
		t.Fatalf("代理通道失败不应喂目标 host 连败链: fails=%d, want 0", fails)
	}
	c.mu.Lock()
	cooled := len(c.proxyFailedUntil)
	c.mu.Unlock()
	if cooled != 1 {
		t.Fatalf("死代理应记入代理自身失败冷却: %d 条, want 1", cooled)
	}

	// ③ 对照: 无代理直连死端口 → 普通网络错误照常喂闸(豁免不误伤真实失败)
	cfg2 := rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 2000, Retries: 0,
		HostGateLimit: 3, GlobalConcurrency: 2, AllowLoopback: true}
	c2 := New(cfg2)
	defer c2.Close()
	if _, err := c2.Fetch(context.Background(), deadProxyURL+"/page", ""); err == nil {
		t.Fatal("直连死端口应失败")
	} else {
		var pe *proxyChannelError
		if errors.As(err, &pe) {
			t.Fatalf("直连失败不应打标 proxyChannelError: %v", err)
		}
	}
	u2, _ := url.Parse(deadProxyURL)
	g2 := c2.gateFor(strings.ToLower(u2.Host))
	g2.mu.Lock()
	fails2 := g2.fails
	g2.mu.Unlock()
	if fails2 != 1 {
		t.Fatalf("直连网络失败应喂目标 host 连败链: fails=%d, want 1", fails2)
	}
}

// TestStickyKeyStripsPort [R53-2a](端口 sticky 键): mirrorGroup sticky 键基改用
// Hostname()(剥端口, TS new URL(url).hostname 口径):
// ①口径组合断言: u.Host 带端口/Hostname() 不带端口, registrableDomain 对 "host:port"
//
//	走含 ':' 原样返回臂 → 修前键基=完整 host:port 与注册域键永不相交
//
// ②带端口 URL 命中剥端口写入的 sticky ③同站异端口互享 ④子域+端口互享 ⑤clear 清键
func TestStickyKeyStripsPort(t *testing.T) {
	// ① Host/Hostname 口径 + registrableDomain 组合断言(修前键基歧义的根因面)
	u, err := url.Parse("http://main.com:8080/a")
	if err != nil {
		t.Fatal(err)
	}
	if u.Host != "main.com:8080" || u.Hostname() != "main.com" {
		t.Fatalf("Host/Hostname 口径异常: %q / %q", u.Host, u.Hostname())
	}
	if registrableDomain("main.com:8080") != "main.com:8080" {
		t.Fatalf("含 ':' 的 host:port 应原样返回(修前 sticky 键基): %q", registrableDomain("main.com:8080"))
	}
	if registrableDomain("main.com") != "main.com" {
		t.Fatalf("注册域键基应为 eTLD+1: %q", registrableDomain("main.com"))
	}

	// ② 带端口 URL 的 sticky 查找与剥端口写入互认(修前查 "main.com:8080" 永不命中)
	c := New(rule.FetchConfig{MirrorDomains: "m1.com,m2.com", GlobalConcurrency: 2})
	defer c.Close()
	group := c.mirrorGroup("http://main.com:8080/a")
	want := []string{"http://main.com:8080/a", "http://m1.com/a", "http://m2.com/a"}
	if !reflect.DeepEqual(group, want) {
		t.Fatalf("带端口 URL 初始组序 = %v, want %v", group, want)
	}
	c.noteMirrorSuccess("main.com", "m2.com") // rawFetch 传 u.Hostname() 口径写入
	group = c.mirrorGroup("http://main.com:8080/b")
	if group[0] != "http://m2.com/b" {
		t.Fatalf("带端口 URL 应命中注册域 sticky 键: %v", group)
	}
	// ③ 端口无关: 同站不同端口共享 sticky(键基不含端口)
	if g := c.mirrorGroup("http://main.com:9090/c"); g[0] != "http://m2.com/c" {
		t.Fatalf("异端口应共享同键 sticky: %v", g)
	}
	// ④ 子域+端口: 同注册域子域经端口 URL 亦互享(注册域口径一致)
	c.noteMirrorSuccess("www.main.com", "m1.com")
	if g := c.mirrorGroup("http://api.main.com:8443/d"); g[0] != "http://m1.com/d" {
		t.Fatalf("子域+端口应共享注册域 sticky: %v", g)
	}
	// ⑤ clear 清键: 带端口入参按剥端口口径清理, 组序回原序
	c.clearMirrorSticky("main.com")
	if g := c.mirrorGroup("http://main.com:8080/e"); g[0] != "http://main.com:8080/e" {
		t.Fatalf("clear 后应回原序: %v", g)
	}
}

// Test4xxShellNoMirrorSwitch [R53-2a](400 壳不喂降额链+非 403/429 的 4xx 不换镜像):
// 400 错误壳产 httpStatusError{400} 快速失败(修前按成功返回壳体送解析层); 同候选重试
// 耗尽后不轮换镜像(镜像站 0 命中); 400 属目标站自身故障, 照常喂 host 连败链
func Test4xxShellNoMirrorSwitch(t *testing.T) {
	var hits1, hits2 atomic.Int64
	mux1 := http.NewServeMux()
	mux1.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		hits1.Add(1)
		http.Error(w, "bad request shell", http.StatusBadRequest)
	})
	srv1 := httptest.NewServer(mux1)
	t.Cleanup(srv1.Close)
	mux2 := http.NewServeMux()
	mux2.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		hits2.Add(1)
		_, _ = w.Write([]byte(fmt.Sprintf("<html><head><title>镜像页</title></head><body>%s</body></html>", strings.Repeat("内容。", 120))))
	})
	srv2 := httptest.NewServer(mux2)
	t.Cleanup(srv2.Close)
	u1, _ := url.Parse(srv1.URL)
	u2, _ := url.Parse(srv2.URL)

	cfg := rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 2000, Retries: 0,
		HostGateLimit: 3, GlobalConcurrency: 2, AllowLoopback: true, MirrorDomains: u2.Host}
	c := New(cfg)
	defer c.Close()
	if _, err := c.Fetch(context.Background(), srv1.URL+"/page", ""); err == nil {
		t.Fatal("400 错误壳应判失败(修前按成功返回)")
	} else {
		var he *httpStatusError
		if !errors.As(err, &he) || he.code != 400 {
			t.Fatalf("应返回 httpStatusError{400}: %v", err)
		}
	}
	if hits1.Load() != 1 {
		t.Fatalf("主站命中 = %d, want 1(Retries=0 同候选不重试)", hits1.Load())
	}
	if hits2.Load() != 0 {
		t.Fatalf("镜像站命中 = %d, want 0(400 不可切换镜像)", hits2.Load())
	}
	g := c.gateFor(strings.ToLower(u1.Host))
	g.mu.Lock()
	fails := g.fails
	g.mu.Unlock()
	if fails != 1 {
		t.Fatalf("400 应喂目标 host 连败链(与代理误责豁免相区分): fails=%d, want 1", fails)
	}
}

// TestUAFamilyAndPlatformHints [R54-2a] uaFamily/uaPlatformHint 判定锚(热路径正则
// 上提为包级编译后的行为回归): Edge UA 走 chromium 臂(\bEdg\b), 旧版 Edge 不误判,
// 无家族标记判 unknown; 平台推导按 UA 段自洽(iOS/macOS/Linux/缺省 Windows)
func TestUAFamilyAndPlatformHints(t *testing.T) {
	edgeChromium := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 Edg/137.0.0.0"
	if got := uaFamily(edgeChromium); got != "chromium" {
		t.Fatalf("Edge UA 应判 chromium(\\bEdg\\b 臂): %s", got)
	}
	if got := uaPlatformHint(edgeChromium); got != "Windows" {
		t.Fatalf("Edge/Windows 平台推导 = %s, want Windows", got)
	}
	// 旧版 EdgeHTML("Edge/18"): 无 Chrome/ 且 \bEdg\b 不命中 "Edge"(e 为词字符) → unknown
	if got := uaFamily("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edge/18.18363"); got != "unknown" {
		t.Fatalf("旧版 EdgeHTML 应判 unknown: %s", got)
	}
	if got := uaFamily("Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0"); got != "firefox" {
		t.Fatalf("Firefox UA 应判 firefox: %s", got)
	}
	// 无任何家族标记 → unknown(不误判)
	if got := uaFamily("Mozilla/5.0 (X11; Linux x86_64)"); got != "unknown" {
		t.Fatalf("无家族标记应判 unknown: %s", got)
	}
	// 平台推导: iOS 优先于 Chrome 段(移动 UA), macOS/Linux/Android 各归其位
	iphone := "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
	if got := uaPlatformHint(iphone); got != "iOS" {
		t.Fatalf("iPhone UA 平台 = %s, want iOS", got)
	}
	macSafari := "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
	if got := uaPlatformHint(macSafari); got != "macOS" {
		t.Fatalf("Mac UA 平台 = %s, want macOS", got)
	}
	android := "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36"
	if got := uaPlatformHint(android); got != "Android" {
		t.Fatalf("Android UA 平台 = %s, want Android", got)
	}
	if got := uaPlatformHint("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/137.0.0.0 Safari/537.36"); got != "Linux" {
		t.Fatalf("Linux UA 平台 = %s, want Linux", got)
	}
	if !isMobileUA(iphone) || isMobileUA(edgeChromium) {
		t.Fatal("isMobileUA 判定异常")
	}
}
