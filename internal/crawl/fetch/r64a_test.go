// ============================================================
// R64-a 采集反反爬增强 — 逐行抓 bug 回归单测
//
//	① parseRetryAfter/retryAfterCooldown 表驱动(负数/超大值/日期形态/钳制边界)
//	② admitJitter 界(+0~1/4, d<=0 恒 0) ③ headersHaveKey 大小写不敏感
//	④ cfg.headers.Referer 覆盖契约(修前被同源缺省 Referer 无条件覆盖)
//	⑤ ctx 取消不误责(代理不入冷却不回写 alive=0; 直连不喂 host 连败链)
//	⑥ pickUA 子集池空回落全量池(修前 mod-0 panic 风险)
//	⑦ blockcheck 弱标记 4000 码点前缀截断(rune 边界语义钉)
//
// ============================================================
package fetch

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"
	"unicode/utf8"

	"mhgl/internal/crawl/rule"
)

// TestParseRetryAfterTable ①表驱动: 整数秒/HTTP 日期/缺失/非法/负数/超大值
func TestParseRetryAfterTable(t *testing.T) {
	now := time.Date(2025, 6, 1, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name   string
		raw    string
		wantD  time.Duration
		wantOK bool
	}{
		{"缺失", "", 0, false},
		{"纯空白", "   ", 0, false},
		{"非法词", "soon", 0, false},
		{"零秒兜底", "0", 0, false},
		{"负数", "-5", 0, false},
		{"加号形态非法", "+30", 0, false},
		{"超大值溢出 Atoi", "99999999999999999999", 0, false},
		{"正常秒数", "5", 5 * time.Second, true},
		{"带空白秒数", " 8 ", 8 * time.Second, true},
		{"大但不溢出", "120", 120 * time.Second, true},
		{"HTTP 日期已过期→0", "Sun, 01 Jun 2025 11:00:00 GMT", 0, true},
		{"HTTP 日期未来 90s", now.Add(90 * time.Second).UTC().Format(http.TimeFormat), 90 * time.Second, true},
	}
	for _, c := range cases {
		d, ok := parseRetryAfter(c.raw, now)
		if ok != c.wantOK {
			t.Fatalf("%s: ok=%v, want %v", c.name, ok, c.wantOK)
		}
		if ok && (d < c.wantD-time.Second || d > c.wantD+time.Second) {
			t.Fatalf("%s: d=%v, want ≈%v", c.name, d, c.wantD)
		}
		if !ok && d != 0 {
			t.Fatalf("%s: 非法形态应返回 0 时长, got %v", c.name, d)
		}
	}
}

// TestRetryAfterCooldownClamp ①冷却钳制: 缺失/非法/<1s 兜底 30s; 显式值如实; 超 120s 钳 120s
func TestRetryAfterCooldownClamp(t *testing.T) {
	cases := []struct {
		name string
		d    time.Duration
		ok   bool
		want time.Duration
	}{
		{"缺失兜底 30s", 0, false, retryAfterFallback},
		{"非法兜底 30s", 3 * time.Second, false, retryAfterFallback},
		{"<1s 兜底 30s", 500 * time.Millisecond, true, retryAfterFallback},
		{"恰好 1s 如实", time.Second, true, time.Second},
		{"90s 如实", 90 * time.Second, true, 90 * time.Second},
		{"121s 钳 120s", 121 * time.Second, true, retryAfterMax},
		{"超大钳 120s", 30 * 24 * time.Hour, true, retryAfterMax},
	}
	for _, c := range cases {
		if got := retryAfterCooldown(c.d, c.ok); got != c.want {
			t.Fatalf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

// TestAdmitJitterBounds ②抖动界: 0 ≤ jitter(d) ≤ d/4; d<=0 恒 0(负样本防 panic)
func TestAdmitJitterBounds(t *testing.T) {
	for _, d := range []time.Duration{0, -time.Second, time.Nanosecond, 200 * time.Millisecond, time.Second, time.Minute} {
		got := admitJitter(d)
		if d <= 0 {
			if got != 0 {
				t.Fatalf("admitJitter(%v)=%v, 非正时长应恒 0", d, got)
			}
			continue
		}
		if got < 0 || got > d/4 {
			t.Fatalf("admitJitter(%v)=%v 越界[0,%v]", d, got, d/4)
		}
	}
	max := time.Duration(0)
	for i := 0; i < 500; i++ {
		if j := admitJitter(200 * time.Millisecond); j > max {
			max = j
		}
	}
	if max > 50*time.Millisecond {
		t.Fatalf("200ms 抖动最大观测 %v, 应 ≤50ms", max)
	}
	if max == 0 {
		t.Fatal("500 次采样抖动全为 0 — 抖动源疑似失效(应随机非零)")
	}
}

// TestHeadersHaveKey ③键存在性大小写不敏感
func TestHeadersHaveKey(t *testing.T) {
	cases := []struct {
		h    map[string]string
		key  string
		want bool
	}{
		{nil, "Referer", false},
		{map[string]string{}, "Referer", false},
		{map[string]string{"Referer": "x"}, "Referer", true},
		{map[string]string{"referer": "x"}, "Referer", true},
		{map[string]string{"USER-AGENT": "x"}, "user-agent", true},
		{map[string]string{"X-Referer": "x"}, "Referer", false},
	}
	for _, c := range cases {
		if got := headersHaveKey(c.h, c.key); got != c.want {
			t.Fatalf("headersHaveKey(%v, %q)=%v, want %v", c.h, c.key, got, c.want)
		}
	}
}

// TestRuleHeadersRefererOverride ④契约: cfg.headers 显式配置的 Referer 必须生效
// (修前 doOnce 末尾无条件 Set 同源缺省 Referer, 规则自定义 Referer 恒被覆盖失效)
func TestRuleHeadersRefererOverride(t *testing.T) {
	var seen atomic.Value // string
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		seen.Store(r.Header.Get("Referer"))
		_, _ = w.Write([]byte("<html><head><title>正常页</title></head><body>" + strings.Repeat("内容。", 120) + "</body></html>"))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	// ①规则头显式 Referer → 以规则值为准
	cfg := rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, Headers: map[string]string{"Referer": "https://cfg.example/list"}}
	c := New(cfg)
	defer c.Close()
	if _, err := c.Fetch(context.Background(), srv.URL+"/page", ""); err != nil {
		t.Fatalf("抓取: %v", err)
	}
	if got, _ := seen.Load().(string); got != "https://cfg.example/list" {
		t.Fatalf("cfg.headers Referer 应覆盖缺省同源 Referer, got %q", got)
	}

	// ②键大小写不敏感("referer" 同样生效)
	seen.Store("")
	cfg2 := rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, Headers: map[string]string{"referer": "https://lower.example/"}}
	c2 := New(cfg2)
	defer c2.Close()
	if _, err := c2.Fetch(context.Background(), srv.URL+"/page", ""); err != nil {
		t.Fatalf("抓取: %v", err)
	}
	if got, _ := seen.Load().(string); got != "https://lower.example/" {
		t.Fatalf("小写 referer 键应同样生效, got %q", got)
	}

	// ③未配置时保持既有缺省(同源 scheme://host/)
	seen.Store("")
	cfg3 := rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2}
	c3 := New(cfg3)
	defer c3.Close()
	if _, err := c3.Fetch(context.Background(), srv.URL+"/page", ""); err != nil {
		t.Fatalf("抓取: %v", err)
	}
	if got, _ := seen.Load().(string); got != srv.URL+"/" {
		t.Fatalf("无规则 Referer 应保持同源缺省, got %q", got)
	}
}

// TestCtxCancelNoMisblame ⑤任务停止(ctx 取消)发生在请求在飞期时:
// ①代理通道不入失败冷却/不触发回写事件(修前误当代理故障, 连败即误杀 DB 池条目)
// ②直连失败不喂目标 host 连败链(修前无辜站点被降额)
func TestCtxCancelNoMisblame(t *testing.T) {
	// ① 代理路径: 慢代理(在飞 3s)+ 300ms 取消; 目标用 TEST-NET-3 非回环字面量
	// (回环目标会被 pickProxy 豁免直连, 代理层不可达)
	release := make(chan struct{})
	proxyMux := http.NewServeMux()
	proxyMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		<-release // 挂住在飞请求直至测试放行
		_, _ = w.Write([]byte("<html><head><title>代理页</title></head><body>" + strings.Repeat("内容。", 120) + "</body></html>"))
	})
	proxySrv := httptest.NewServer(proxyMux)
	t.Cleanup(proxySrv.Close)

	var events atomic.Int64
	cfg := rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 5000, Retries: 0,
		HostGateLimit: 2, GlobalConcurrency: 2, ProxyURL: proxySrv.URL}
	c := New(cfg)
	defer c.Close()
	c.ProxyFeedback = func(addr string, ok bool) { events.Add(1) }

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	if _, err := c.Fetch(ctx, "http://203.0.113.1/page", ""); err == nil {
		t.Fatal("取消中的抓取应返回错误")
	}
	c.mu.Lock()
	cooled := len(c.proxyFailedUntil)
	c.mu.Unlock()
	if cooled != 0 {
		t.Fatalf("ctx 取消不应把代理记失败冷却: %d 条", cooled)
	}
	if events.Load() != 0 {
		t.Fatalf("ctx 取消不应触发代理回写事件: %d 次", events.Load())
	}
	close(release)

	// ② 直连路径: 慢站 + 300ms 取消 → 目标 host 连败计数必须为 0(修前 =1)
	slowMux := http.NewServeMux()
	slowMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(3 * time.Second):
		}
	})
	slowSrv := httptest.NewServer(slowMux)
	t.Cleanup(slowSrv.Close)

	cfg2 := rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 5000, Retries: 0,
		HostGateLimit: 2, GlobalConcurrency: 2, AllowLoopback: true}
	c2 := New(cfg2)
	defer c2.Close()
	ctx2, cancel2 := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel2()
	if _, err := c2.Fetch(ctx2, slowSrv.URL+"/page", ""); err == nil {
		t.Fatal("取消中的直连抓取应返回错误")
	}
	u, err := url.Parse(slowSrv.URL)
	if err != nil {
		t.Fatalf("解析 %s: %v", slowSrv.URL, err)
	}
	g := c2.gateFor(strings.ToLower(u.Host))
	g.mu.Lock()
	fails := g.fails
	g.mu.Unlock()
	if fails != 0 {
		t.Fatalf("ctx 取消不应喂目标 host 连败链: fails=%d, want 0", fails)
	}
}

// TestPickUAEmptySubsetPoolFallback ⑥子集池空防御: desktop 子集池被清空时
// 回落全量池(修前 len(pool)==0 取模除零 panic)
func TestPickUAEmptySubsetPoolFallback(t *testing.T) {
	prev := desktopUAPool
	desktopUAPool = nil
	t.Cleanup(func() { desktopUAPool = prev })

	c := New(rule.FetchConfig{Engine: "http", UaMode: "desktop", GlobalConcurrency: 1})
	defer c.Close()
	ua := c.pickUA("example.com")
	inPool := false
	for _, cand := range uaPool {
		if cand == ua {
			inPool = true
			break
		}
	}
	if ua == "" || !inPool {
		t.Fatalf("空子集池应回落全量池取 UA, got %q", ua)
	}
	// 同域钉扎照常生效
	if again := c.pickUA("example.com"); again != ua {
		t.Fatalf("回落路径下同域钉扎失效: %q vs %q", again, ua)
	}
}

// TestLooksBlockedWeakMarkerRuneBoundary ⑦弱标记前 4000 码点扫描语义钉:
// 标记在 4000 码点内判拦, 越界不判拦, 4000 边界斩断标记的后半不判拦
// (与 TS lower.slice(0,4000) rune 近似口径一致; 修前实现等价, 此处钉死防回归)
func TestLooksBlockedWeakMarkerRuneBoundary(t *testing.T) {
	cases := []struct {
		name string
		body string
		want bool
	}{
		{"标记在前 4000 码点内", strings.Repeat("a", 100) + "captcha" + strings.Repeat("a", 4900), true},
		{"标记在 4000 码点之外", strings.Repeat("a", 4200) + "captcha" + strings.Repeat("a", 800), false},
		{"标记恰跨 4000 边界(斩半)", strings.Repeat("a", 3999) + "captcha" + strings.Repeat("a", 800), false},
		{"多字节正文边界不斩字", strings.Repeat("汉", 4100) + "captcha" + strings.Repeat("汉", 500), false},
		{"多字节正文标记在前段", strings.Repeat("汉", 100) + "captcha" + strings.Repeat("汉", 4900), true},
	}
	for _, c := range cases {
		if got := looksBlocked(c.body, 200, ""); got != c.want {
			t.Fatalf("%s: looksBlocked=%v, want %v(len=%d runes)", c.name, got, c.want, utf8.RuneCountInString(c.body))
		}
	}
}
