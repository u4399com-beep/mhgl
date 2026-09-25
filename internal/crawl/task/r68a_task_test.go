// ============================================================
// [R68-a] queue 发现链抓虫回归测试
//
//	列表页 200 壳拦截页按等价 HTTP 403 失败处置: 计失败+推进连败链,
//	修前 Blocked 结果(err=nil)落进解析层 → 0 条新增 → 计入「连续空页」
//	熔断, stats.Errors 零记账 —— 源站压速/下挑战被误诊为「已越过站点末页」
//
// ============================================================
package task

import (
	"context"
	"fmt"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"mhgl/internal/crawl/fetch"
	"mhgl/internal/crawl/rule"
)

// blockedListSite 列表页拦截站: blockPages 集合内的列表页返回 200 壳挑战页
// (强标记 "Just a moment"), 其余列表页返回与 e2e 假站同构的正常列表页
// (P1/P2 各 2 本, 页面体量 ≥500 rune + 正常 title 防误拦)。
func blockedListSite(t *testing.T, blockPages map[int]bool) *httptest.Server {
	t.Helper()
	var n int64
	mux := http.NewServeMux()
	mux.HandleFunc("GET /list/", func(w http.ResponseWriter, r *http.Request) {
		page := 1
		if strings.HasSuffix(r.URL.Path, "/2.html") {
			page = 2
		}
		if blockPages[page] {
			atomic.AddInt64(&n, 1)
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte("<html><head><title>Just a moment...</title></head>" +
				"<body>Checking your browser before accessing. Please wait.</body></html>"))
			return
		}
		var sb strings.Builder
		sb.WriteString("<html><head><meta charset=\"utf-8\"><title>书库列表</title></head><body><div class=\"booklist\"><ul>")
		for _, id := range []int{(page-1)*2 + 1, (page-1)*2 + 2} {
			fmt.Fprintf(&sb, `<li><a class="t" href="/book/%d.html">书%d</a></li>`, id, id)
		}
		sb.WriteString("</ul></div><p>" + strings.Repeat("列表页导航与站点公告文本。", 30) + "</p></body></html>")
		_, _ = w.Write([]byte(sb.String()))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	_ = n
	return srv
}

// newBlockedSiteTask 直构 Task(r67b discoverPages 测试同模式)
func newBlockedSiteTask(t *testing.T, rc rule.RuleConfig, listStart, listEnd int) *Task {
	t.Helper()
	tt := &Task{
		ID:      "t-r68-queue",
		ruleC:   rc,
		ctx:     context.Background(),
		cb:      noopSink{},
		fetcher: fetch.New(rc.Fetch),
		rnd:     rand.New(rand.NewSource(time.Now().UnixNano())),
		info:    rule.TaskInfo{Mode: "range", ListStart: listStart, ListEnd: listEnd, IntervalMin: 0, IntervalMax: 0},
	}
	tt.cond = sync.NewCond(&tt.mu)
	t.Cleanup(func() { tt.fetcher.Close() })
	return tt
}

// TestDiscoverPagesBlockedListCountsAsFailure [R68-a] 全拦截列表: 两页均挑战壳 →
// 修后等价 403 计失败(stats.Errors=2), 发现 0 本, 返回空清单非错误
// (熔断 discoveryFailCircuit=20 未触发, 页循环自然耗尽)。
func TestDiscoverPagesBlockedListCountsAsFailure(t *testing.T) {
	srv := blockedListSite(t, map[int]bool{1: true, 2: true})
	rc := fixtureRule(srv.URL)
	tt := newBlockedSiteTask(t, rc, 1, 2)

	urls := tt.discoverPages(srv.URL+"/list/{page}.html", 100)
	if len(urls) != 0 {
		t.Fatalf("全拦截应发现 0 本, got %v", urls)
	}
	tt.mu.Lock()
	errs, disc := tt.stats.Errors, tt.discovered
	tt.mu.Unlock()
	if errs != 2 {
		t.Fatalf("stats.Errors = %d, want 2(修前 Blocked 落解析层零记账)", errs)
	}
	if disc != 0 {
		t.Fatalf("discovered = %d, want 0", disc)
	}
}

// TestDiscoverPagesBlockedListMixedRecovery [R68-a] 混合形态: P1 拦截 + P2 正常 →
// P1 计失败后连败链在 P2 成功时归零, 正常页书籍照常发现(stats.Errors=1)。
func TestDiscoverPagesBlockedListMixedRecovery(t *testing.T) {
	srv := blockedListSite(t, map[int]bool{1: true})
	rc := fixtureRule(srv.URL)
	tt := newBlockedSiteTask(t, rc, 1, 2)

	urls := tt.discoverPages(srv.URL+"/list/{page}.html", 100)
	if len(urls) != 2 {
		t.Fatalf("P2 正常应发现 2 本, got %v", urls)
	}
	tt.mu.Lock()
	errs := tt.stats.Errors
	tt.mu.Unlock()
	if errs != 1 {
		t.Fatalf("stats.Errors = %d, want 1(P1 拦截计失败, P2 成功不记账)", errs)
	}
}

// compile 断言: context 引用存活(防 import 漂移)
var _ = context.Background
