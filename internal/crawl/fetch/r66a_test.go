// ============================================================
// R66-a 回归测试 — challenge 形态退避重试 + Cookie 会话持续性
//
//	①200 壳挑战页: Set-Cookie 回写 → 退避抖动重试 → 带 Cookie 重访过关
//	  (与浏览器「领挑战→解题→带证重访」行为同构; 修前挑战页零重试直接失败)
//	②持续挑战: 重试预算耗尽按 Blocked 失败返回, 不无限重试
//	③Retries=0 规则保持旧口径(挑战即失败, 零重试)
//	④noteChallenge 节奏放宽: ×1.5 钳 3s, 成功即归位
//	⑤302 链 Cookie 持续性(jar 会话跨重定向)
//	⑥challengeBackoff 退避曲线界(exponential+jitter+cap)
//
// ============================================================
package fetch

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"mhgl/internal/crawl/rule"
)

// challengeHTML 200 壳挑战页(strong marker "just a moment" 命中, 无论长短判拦)
const challengeHTML = `<html><head><title>Just a moment...</title></head>` +
	`<body>Checking your browser before accessing. Please wait.</body></html>`

// normalChapterHTML 正常章节页(≥200 码点+正常标题+无弱标记 → 不判拦)
func normalChapterHTML(tag string) string {
	return `<html><head><title>第十二章 破阵</title></head><body><div>` +
		strings.Repeat("这是"+tag+"章的正文内容, 情节持续推进。", 120) + `</div></body></html>`
}

// TestChallengePageRetryWithCookieReplay 挑战 Set-Cookie 回写后退避重试过关:
// 无 Cookie 请求 → 200 挑战页+Set-Cookie(clearance); 重试带 Cookie → 正常页
func TestChallengePageRetryWithCookieReplay(t *testing.T) {
	var mu sync.Mutex
	var cookies []string
	var reqAt []time.Time
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		cookies = append(cookies, r.Header.Get("Cookie"))
		reqAt = append(reqAt, time.Now())
		n := len(cookies)
		mu.Unlock()
		if r.Header.Get("Cookie") == "" || !strings.Contains(r.Header.Get("Cookie"), "clearance=pass99") {
			// 挑战形态: 颁发 clearance Cookie + 挑战壳页(200)
			w.Header().Add("Set-Cookie", "clearance=pass99; Path=/")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(challengeHTML))
			return
		}
		_ = n
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(normalChapterHTML("重试过关")))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	oldBase := challengeBackoffBase
	challengeBackoffBase = 5 * time.Millisecond
	defer func() { challengeBackoffBase = oldBase }()

	cfg := rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 3000,
		AllowLoopback: true, GlobalConcurrency: 2, Retries: 2}
	c := New(cfg)
	defer c.Close()

	res, err := c.Fetch(context.Background(), srv.URL+"/chapter/1", "")
	if err != nil {
		t.Fatalf("挑战重试后应过关: %v", err)
	}
	if res.Blocked {
		t.Fatalf("重试过关后 Blocked 应为 false")
	}
	if !strings.Contains(res.HTML, "重试过关") {
		t.Fatalf("应为正常章节页: %q", res.HTML[:60])
	}
	mu.Lock()
	defer mu.Unlock()
	if len(cookies) != 2 {
		t.Fatalf("请求数 = %d, want 2(1 挑战 + 1 带证重访)", len(cookies))
	}
	if !strings.Contains(cookies[1], "clearance=pass99") {
		t.Fatalf("重试请求应携带挑战页 Set-Cookie 回写值: %q", cookies[1])
	}
	if gap := reqAt[1].Sub(reqAt[0]); gap < 5*time.Millisecond {
		t.Fatalf("重试前应经过退避等待(base=5ms), 实际间隔 %v", gap)
	}
	if got := c.BlockedCount(); got != 1 {
		t.Fatalf("blockedCount = %d, want 1(挑战命中逐次计数)", got)
	}
}

// TestChallengePagePersistentBlockedBudgetCapped 持续挑战: 预算 min(Retries,2) 耗尽
// 按 Blocked 失败返回, 不无限重试
func TestChallengePagePersistentBlockedBudgetCapped(t *testing.T) {
	var mu sync.Mutex
	n := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		n++
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(challengeHTML))
	}))
	t.Cleanup(srv.Close)

	oldBase := challengeBackoffBase
	challengeBackoffBase = 2 * time.Millisecond
	defer func() { challengeBackoffBase = oldBase }()

	c := New(rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 3000,
		AllowLoopback: true, GlobalConcurrency: 2, Retries: 5})
	defer c.Close()

	res, err := c.Fetch(context.Background(), srv.URL+"/c", "")
	if err != nil {
		t.Fatalf("持续挑战应按 Blocked 返回而非 error: %v", err)
	}
	if !res.Blocked {
		t.Fatalf("持续挑战 Blocked 应为 true")
	}
	mu.Lock()
	defer mu.Unlock()
	if n != 1+challengeRetryMax {
		t.Fatalf("请求数 = %d, want %d(1+min(Retries=5,2))", n, 1+challengeRetryMax)
	}
	if got := c.BlockedCount(); got != int64(1+challengeRetryMax) {
		t.Fatalf("blockedCount = %d, want %d", got, 1+challengeRetryMax)
	}
}

// TestChallengeRetryDisabledWhenRetriesZero Retries=0 保持旧口径: 挑战即失败, 零重试
func TestChallengeRetryDisabledWhenRetriesZero(t *testing.T) {
	var mu sync.Mutex
	n := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		n++
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(challengeHTML))
	}))
	t.Cleanup(srv.Close)

	c := New(rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 3000,
		AllowLoopback: true, GlobalConcurrency: 2, Retries: 0})
	defer c.Close()

	res, err := c.Fetch(context.Background(), srv.URL+"/c", "")
	if err != nil {
		t.Fatalf("Retries=0 挑战应按 Blocked 返回: %v", err)
	}
	if !res.Blocked {
		t.Fatalf("Blocked 应为 true")
	}
	mu.Lock()
	defer mu.Unlock()
	if n != 1 {
		t.Fatalf("Retries=0 应恰好 1 次请求, 实际 %d", n)
	}
}

// TestNoteChallengePacingWidensGap 挑战证据节奏放宽: ×1.5 累进钳 3s, 成功归位,
// baseGap=0(未注入节奏)时零作用, 非法 URL 不 panic
func TestNoteChallengePacingWidensGap(t *testing.T) {
	c := New(rule.FetchConfig{Engine: "http", UaMode: "fixed", AllowLoopback: true})
	defer c.Close()
	c.SetHostGap(100 * time.Millisecond)

	gate := c.gateFor("stress.example.com:80")
	if gate.minGap != 100*time.Millisecond {
		t.Fatalf("初始 minGap = %v, want 100ms", gate.minGap)
	}
	c.noteChallengePacing("http://stress.example.com:80/a")
	if gate.minGap != 150*time.Millisecond {
		t.Fatalf("一次挑战后 minGap = %v, want 150ms(×1.5)", gate.minGap)
	}
	for i := 0; i < 30; i++ {
		c.noteChallengePacing("http://stress.example.com:80/a")
	}
	if gate.minGap > gateGapCap {
		t.Fatalf("挑战放宽应钳 gateGapCap(%v), 实际 %v", gateGapCap, gate.minGap)
	}
	gate.noteSuccess()
	if gate.minGap != 100*time.Millisecond {
		t.Fatalf("成功后 minGap 应归位基准 100ms, 实际 %v", gate.minGap)
	}
	// baseGap=0(缺省无节奏)与非法 URL: 零作用/零 panic
	c2 := New(rule.FetchConfig{Engine: "http", UaMode: "fixed", AllowLoopback: true})
	defer c2.Close()
	g2 := c2.gateFor("x.example.com")
	c2.noteChallengePacing("http://x.example.com/a")
	if g2.minGap != 0 {
		t.Fatalf("baseGap=0 时挑战不应制造节奏, minGap = %v", g2.minGap)
	}
	c2.noteChallengePacing("::::not-a-url")
	c2.noteChallengePacing("")
}

// TestCookieSessionAcrossRedirectChain 302 链 Cookie 会话持续性:
// /entry 302(Set-Cookie) → /next 收到 Cookie(jar 跨重定向跟随, challenge cookie 回写形态)
func TestCookieSessionAcrossRedirectChain(t *testing.T) {
	var mu sync.Mutex
	gotCookie := ""
	mux := http.NewServeMux()
	mux.HandleFunc("GET /entry", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Set-Cookie", "challenge=solved42; Path=/")
		http.Redirect(w, r, "/next", http.StatusFound) // 302
	})
	mux.HandleFunc("GET /next", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		gotCookie = r.Header.Get("Cookie")
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(normalChapterHTML("302链")))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	c := New(rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 3000,
		AllowLoopback: true, GlobalConcurrency: 2})
	defer c.Close()

	res, err := c.Fetch(context.Background(), srv.URL+"/entry", "")
	if err != nil {
		t.Fatalf("302 链抓取: %v", err)
	}
	if !strings.HasSuffix(res.FinalURL, "/next") {
		t.Fatalf("应跟随 302 至 /next, FinalURL = %s", res.FinalURL)
	}
	mu.Lock()
	defer mu.Unlock()
	if !strings.Contains(gotCookie, "challenge=solved42") {
		t.Fatalf("302 后续请求应携带 Set-Cookie 回写值(jar 持续性): %q", gotCookie)
	}
}

// TestChallengeBackoffCurve 退避曲线界: base×2^a 指数, +0~50% 抖动, 钳 3s
func TestChallengeBackoffCurve(t *testing.T) {
	oldBase := challengeBackoffBase
	challengeBackoffBase = 400 * time.Millisecond
	defer func() { challengeBackoffBase = oldBase }()

	cases := []struct {
		attempt int
		lo, hi  time.Duration
	}{
		{0, 400 * time.Millisecond, 600 * time.Millisecond},
		{1, 800 * time.Millisecond, 1200 * time.Millisecond},
		{2, 1600 * time.Millisecond, 2400 * time.Millisecond},
		{9, 3 * time.Second, 4500 * time.Millisecond}, // 钳 3s + 0~50% 抖动
	}
	for _, tc := range cases {
		seen := map[time.Duration]bool{}
		for i := 0; i < 200; i++ {
			d := challengeBackoff(tc.attempt)
			if d < tc.lo || d > tc.hi {
				t.Fatalf("attempt=%d 退避 %v 越界 [%v, %v]", tc.attempt, d, tc.lo, tc.hi)
			}
			seen[d] = true
		}
		// 抖动非退化探针: 200 采样应呈现多值(恒等值/恒满值实现即失败; 精确下界命中
		// 概率 ~1/(d/2) 不可采样, 改以多样性断言)
		if len(seen) < 5 {
			t.Fatalf("attempt=%d 200 采样仅 %d 种取值 — 抖动实现退化", tc.attempt, len(seen))
		}
	}
}
