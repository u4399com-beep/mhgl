// ============================================================
// [R67-b] task/bridge 抓虫回归测试
//
//	task.Start 瞬时快照一致性(startedAt/phase 同锁初始化)
//	discoverPages 单轮上限命中时 discovered 终值落盘
//	bridge.Contents 批内 URL 去重(幂等只写一次+计数不虚高)
//	bridge.Cover 书行预检前移(防孤儿封面文件)
//
// ============================================================
package task

import (
	"context"
	"math/rand"
	"net/http"
	"sync"
	"testing"
	"time"

	"mhgl/internal/crawl/callback"
	"mhgl/internal/crawl/fetch"
	"mhgl/internal/crawl/rule"
)

// (noopSink 复用 proxyfeed_test.go 既有定义: 静默回调面 stub)

// TestStartSnapshotImmediateConsistency [R67-b] Start 返回瞬间 Status 快照一致性:
// startedAt/phase 必须在注册时(持锁)就绪 —— 修前由 run 协程稍后置位, Start 至 run 首
// 行的窗口内 Status.StartedAtMs 为零值时刻(UnixMilli ≈ -6.2e13, 管理面显示「1970 年前
// 启动」)、Phase 为空串。StartedAtMs>0 即钉死零值时刻回归(phase 非空同理)。
func TestStartSnapshotImmediateConsistency(t *testing.T) {
	site, rc, mgr, mock := e2eHarness(t)
	p := rule.TaskStartPayload{
		Task: rule.TaskInfo{ID: "t-r67b-start", Mode: "single", BookURL: site + "/book/1.html",
			RecrawlMode: "incremental", StorageMode: "db", ThreadMin: 1, ThreadMax: 1,
			IntervalMin: 300, IntervalMax: 300},
		Rule:     rc,
		Callback: rule.CallbackInfo{BaseURL: mock.srv.URL, Secret: callback.DefaultSecret},
	}
	before := time.Now().UnixMilli()
	if err := mgr.Start(p); err != nil {
		t.Fatalf("start: %v", err)
	}
	// Start 返回后立即读快照(不 sleep: 故意命中注册与 run 首行之间的窗口)
	st := mgr.Status("t-r67b-start")
	if !st.Exists {
		t.Fatal("Start 返回后任务应已在注册表")
	}
	if st.StartedAtMs <= 0 {
		t.Fatalf("StartedAtMs=%d, 应为正数(修前零值时刻为负 ≈ -6.2e13)", st.StartedAtMs)
	}
	if st.StartedAtMs > before+5000 {
		t.Fatalf("StartedAtMs=%d 异常超前(now=%d)", st.StartedAtMs, before)
	}
	if st.Phase == "" {
		t.Fatal("Start 返回瞬间 Phase 不应为空串(修前 run 协程未及置位)")
	}
	_, _ = mgr.Control("t-r67b-start", "stop") // 收尾, 防协程泄漏影响后续用例
}

// TestDiscoverPagesDiscoveredFinalCount [R67-b] discoverPages 单轮上限命中时
// discovered 终值落盘: 修前 discovered 只在页循环尾推进, maxURLs 在条目循环内命中
// break pageLoop 时终页计数不落盘(首页即达上限时恒 0), 进度面与实际发现数脱钩。
func TestDiscoverPagesDiscoveredFinalCount(t *testing.T) {
	site := newFakeSite(t)
	rc := fixtureRule(site.URL)
	tt := &Task{
		ID:      "t-r67b-disc",
		ruleC:   rc,
		ctx:     context.Background(),
		cb:      noopSink{},
		fetcher: fetch.New(rc.Fetch),
		rnd:     rand.New(rand.NewSource(time.Now().UnixNano())),
		info:    rule.TaskInfo{Mode: "range", ListStart: 1, ListEnd: 2, IntervalMin: 0, IntervalMax: 0},
	}
	tt.cond = sync.NewCond(&tt.mu)
	t.Cleanup(func() { tt.fetcher.Close() })

	// maxURLs=1: 首页第 1 本即达上限(修前 discovered 恒 0), 终值应为 1
	urls := tt.discoverPages(site.URL+"/list/{page}.html", 1)
	if len(urls) != 1 {
		t.Fatalf("maxURLs=1 应发现 1 本, got %d: %v", len(urls), urls)
	}
	tt.mu.Lock()
	got := tt.discovered
	tt.mu.Unlock()
	if got != 1 {
		t.Fatalf("discovered=%d, want 1(上限命中页的发现数必须落盘)", got)
	}

	// maxURLs=3: 跨页命中(首页 2 本+次页第 1 本), 终值应为 3(修前停在前页值 2)
	urls2 := tt.discoverPages(site.URL+"/list/{page}.html", 3)
	if len(urls2) != 3 {
		t.Fatalf("maxURLs=3 应发现 3 本, got %d", len(urls2))
	}
	tt.mu.Lock()
	got2 := tt.discovered
	tt.mu.Unlock()
	if got2 != 3 {
		t.Fatalf("discovered=%d, want 3(跨页上限命中终值落盘)", got2)
	}
}

// compile 断言: fetch/callback/http 包引用存活(防 import 漂移)
var (
	_ = fetch.ErrBlocked
	_ = http.StatusOK
)
