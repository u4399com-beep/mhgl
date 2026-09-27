// ============================================================
// R73-a 回归: ①全局槽所有权(冷却窗/退避长睡眠期归还 — R72-a 留档设计层正面处理)
// ②Safari UA 不携带 Upgrade-Insecure-Requests(WebKit 全系不实现 UIR)
// ③确定性 4xx 快速失败(400/401/405/410/414/431/451 重试零胜率面)
// ============================================================
package fetch

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"mhgl/internal/crawl/rule"
)

const r73aSafariUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15"

func r73aOKPage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte("<html><head><title>正常页</title></head><body>" + strings.Repeat("内容。", 120) + "</body></html>"))
}

// TestR73aCooldownParkReleasesGlobalSlot ①核心饿死面: 主 host 限流冷却窗(600ms)睡眠期间
// 归还全局槽。GlobalConcurrency=1: 修前 A 整个冷却窗持有唯一全局槽, B(异 host)全程阻塞
// 到 A 睡醒 — 槽位 ≤10 全睡同一 host 闸时镜像域流量被饿(R72-a 留档); 修后 A 睡眠即 park,
// B 在 A 睡醒前完成抓取
func TestR73aCooldownParkReleasesGlobalSlot(t *testing.T) {
	srvA := httptest.NewServer(http.HandlerFunc(r73aOKPage))
	defer srvA.Close()
	srvB := httptest.NewServer(http.HandlerFunc(r73aOKPage))
	defer srvB.Close()

	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 1, UaMode: "custom", CustomUa: r69aChromeUA})
	defer c.Close()

	// 主 host(A)打上 600ms 限流冷却窗(同 429 Retry-After 写入路径)
	c.gateFor(strings.TrimPrefix(srvA.URL, "http://")).setRateLimited(600 * time.Millisecond)

	doneA := make(chan error, 1)
	go func() {
		_, err := c.Fetch(context.Background(), srvA.URL+"/a", "")
		doneA <- err
	}()
	time.Sleep(150 * time.Millisecond) // 让 A 进入冷却睡眠(已 park 归还全局槽)

	start := time.Now()
	if _, err := c.Fetch(context.Background(), srvB.URL+"/b", ""); err != nil {
		t.Fatalf("异 host B 抓取失败: %v", err)
	}
	if elapsed := time.Since(start); elapsed > 400*time.Millisecond {
		t.Fatalf("B 在 A 冷却睡眠期间被全局槽饿死(耗时 %v) — 冷却睡眠应归还全局槽", elapsed)
	}
	if err := <-doneA; err != nil {
		t.Fatalf("A 冷却窗醒后应正常完成: %v", err)
	}
}

// TestR73aCancelWhileParkedNoSlotLeak ②冷却睡眠(parked 状态)中 ctx 取消: 槽位所有权
// 不丢失不超收 — park 后取消的返回路径 defer release() 必须幂等跳过, 后续请求仍能
// 取到全局槽(修前路径由 defer 出槽天然成立, 此测试钉死 park/resume 新路径的所有权边界)
func TestR73aCancelWhileParkedNoSlotLeak(t *testing.T) {
	srvA := httptest.NewServer(http.HandlerFunc(r73aOKPage))
	defer srvA.Close()
	srvB := httptest.NewServer(http.HandlerFunc(r73aOKPage))
	defer srvB.Close()

	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 1, UaMode: "custom", CustomUa: r69aChromeUA})
	defer c.Close()

	c.gateFor(strings.TrimPrefix(srvA.URL, "http://")).setRateLimited(3 * time.Second)

	ctxA, cancelA := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancelA()
	if _, err := c.Fetch(ctxA, srvA.URL+"/a", ""); err == nil {
		t.Fatal("冷却窗 3s > ctx 300ms, 取消应中断冷却等待并报错")
	}

	// 取消后全局槽必须可用(GlobalConcurrency=1: 槽丢失即此步永久阻塞)
	done := make(chan error, 1)
	go func() {
		_, err := c.Fetch(context.Background(), srvB.URL+"/b", "")
		done <- err
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("取消后异 host 抓取应正常(槽位未泄漏): %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("取消后全局槽不可获取 — parked 状态返回路径槽位泄漏")
	}
}

// TestR73aBackoffParkReleasesGlobalSlot ③重试退避睡眠期归还全局槽: host A 首响应 500
// 触发 400ms 退避(睡眠期 park), GlobalConcurrency=1 下 B 在 A 退避窗内完成 — 睡眠
// 不占全局容量(R72-a 场景「退避 ≤8s 持槽 + 冷却停槽」的退避半边)
func TestR73aBackoffParkReleasesGlobalSlot(t *testing.T) {
	var hitsA atomic.Int32
	srvA := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if hitsA.Add(1) == 1 {
			http.Error(w, "boom", http.StatusInternalServerError)
			return
		}
		r73aOKPage(w, r)
	}))
	defer srvA.Close()
	srvB := httptest.NewServer(http.HandlerFunc(r73aOKPage))
	defer srvB.Close()

	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 1,
		AllowLoopback: true, GlobalConcurrency: 1, UaMode: "custom", CustomUa: r69aChromeUA})
	defer c.Close()

	doneA := make(chan error, 1)
	go func() {
		_, err := c.Fetch(context.Background(), srvA.URL+"/a", "")
		doneA <- err
	}()
	time.Sleep(100 * time.Millisecond) // A 已首击 500 并进入退避睡眠(parked)

	start := time.Now()
	if _, err := c.Fetch(context.Background(), srvB.URL+"/b", ""); err != nil {
		t.Fatalf("异 host B 抓取失败: %v", err)
	}
	if elapsed := time.Since(start); elapsed > 250*time.Millisecond {
		t.Fatalf("B 在 A 退避睡眠期间被全局槽阻塞(耗时 %v) — 退避睡眠应归还全局槽", elapsed)
	}
	if err := <-doneA; err != nil {
		t.Fatalf("A 重试后应成功: %v", err)
	}
	if got := hitsA.Load(); got != 2 {
		t.Fatalf("A 应恰好尝试 2 次(500→200), got %d", got)
	}
}

// TestR73aSafariUANoUpgradeInsecureRequests ④指纹一致性: WebKit/Safari 全系不实现
// Upgrade-Insecure-Requests — Safari UA 的文档导航携带 UIR 即「不可能指纹」; Chrome UA
// 保持携带(R71-a 文档路径零变化回归)
func TestR73aSafariUANoUpgradeInsecureRequests(t *testing.T) {
	rec := newR71aRecorder()
	rec.add("GET /page", func(w http.ResponseWriter, r *http.Request) {
		rec.record(r)
		r73aOKPage(w, r)
	})
	srv := rec.serve()
	t.Cleanup(srv.Close)
	ctx := context.Background()

	cs := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r73aSafariUA})
	if _, err := cs.Fetch(ctx, srv.URL+"/page", ""); err != nil {
		t.Fatalf("Safari UA 抓取: %v", err)
	}
	h := rec.snapshot()
	if got := h.Get("Upgrade-Insecure-Requests"); got != "" {
		t.Fatalf("Safari UA 不应携带 Upgrade-Insecure-Requests(WebKit 不实现, 不可能指纹): %q", got)
	}
	if got := h.Get("Sec-Fetch-Dest"); got != "document" {
		t.Fatalf("Safari 17.4+ 应保持 Sec-Fetch 家族(R67-a 口径), got %q", got)
	}
	cs.Close()

	cc := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r69aChromeUA})
	if _, err := cc.Fetch(ctx, srv.URL+"/page", ""); err != nil {
		t.Fatalf("Chrome UA 抓取: %v", err)
	}
	if got := rec.snapshot().Get("Upgrade-Insecure-Requests"); got != "1" {
		t.Fatalf("Chrome UA 文档导航应保持 Upgrade-Insecure-Requests: 1(R71-a 回归), got %q", got)
	}
	cc.Close()
}

// TestR73aDeterministic4xxFastFail ⑤确定性 4xx 快速失败: 410(同族 400/401/405/414/431/451)
// 与请求形态/资源绑定, 重试零胜率 — Retries=3 时修前烧 1+3 次尝试+全链退避, 修后恰好
// 1 次请求即失败; 镜像候选不切换(与 404 同款 failNoMirror 口径)
func TestR73aDeterministic4xxFastFail(t *testing.T) {
	var hitsPrimary, hitsMirror atomic.Int32
	srvPrimary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hitsPrimary.Add(1)
		http.Error(w, "gone", http.StatusGone)
	}))
	defer srvPrimary.Close()
	srvMirror := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hitsMirror.Add(1)
		r73aOKPage(w, r)
	}))
	defer srvMirror.Close()

	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 3,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r69aChromeUA,
		MirrorDomains: strings.TrimPrefix(srvMirror.URL, "http://")})
	defer c.Close()

	start := time.Now()
	_, err := c.Fetch(context.Background(), srvPrimary.URL+"/x", "")
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("确定性 4xx 应快速失败, 耗时 %v(修前烧满退避链)", elapsed)
	}
	var statusErr *httpStatusError
	if !errors.As(err, &statusErr) || statusErr.code != 410 {
		t.Fatalf("错误面应为 httpStatusError{410}, got %v", err)
	}
	if got := hitsPrimary.Load(); got != 1 {
		t.Fatalf("确定性 4xx 应首击即失败(不再重试), 主 host 请求数 got %d", got)
	}
	if got := hitsMirror.Load(); got != 0 {
		t.Fatalf("确定性 4xx 不应切换镜像, 镜像请求数 got %d", got)
	}
}

// TestR73aRetryable412StillRetried ⑥边界回归: 412(cookie/挑战面, Set-Cookie 已入 jar
// 重试可过关)保持既有重试语义 — Retries=1 恰好 2 次尝试(快速失败不误伤可重试 4xx)
func TestR73aRetryable412StillRetried(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		http.Error(w, "precondition", http.StatusPreconditionFailed)
	}))
	defer srv.Close()

	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 1,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r69aChromeUA})
	defer c.Close()

	_, err := c.Fetch(context.Background(), srv.URL+"/x", "")
	var statusErr *httpStatusError
	if !errors.As(err, &statusErr) || statusErr.code != 412 {
		t.Fatalf("错误面应为 httpStatusError{412}, got %v", err)
	}
	if got := hits.Load(); got != 2 {
		t.Fatalf("可重试 4xx(412) 应保持 1+Retries 次尝试, got %d", got)
	}
}
