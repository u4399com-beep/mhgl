// ============================================================
// [R75-e] 报错可见性回归 —— 失败路径日志全覆盖
//
//	① chapterFailLevel 分级: 连败过半(≥熔断阈值/2)升级 error, 首败 warn
//	② E2E: 全 404 章节流 → warn(1/20)…error(10/20) 实际落日志回调
//	③ 空正文章限频: 首条+每 20 条, 书收尾汇总; 修前逐章 warn 刷屏
//	④ 目录 0 章单列 warn, 不再伪装「增量无新章: 0 章全量已存」
//
// ============================================================
package task

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"mhgl/internal/crawl/callback"
	"mhgl/internal/crawl/rule"
)

// r75eWaitLog 轮询等待匹配的日志回调出现(日志经 goroutine best-effort 发送, 需等待)
func r75eWaitLog(t *testing.T, mock *mockCB, timeout time.Duration, match func(level, msg string) bool) []recCallback {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		hits := []recCallback{}
		for _, k := range mock.snapshot() {
			if k.Kind != "log" {
				continue
			}
			lvl, _ := k.Payload["level"].(string)
			msg, _ := k.Payload["message"].(string)
			if match(lvl, msg) {
				hits = append(hits, k)
			}
		}
		if len(hits) > 0 {
			return hits
		}
		if time.Now().After(deadline) {
			t.Fatalf("等待匹配日志超时(%v)", timeout)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// r75eLogAll 收集全部日志回调(快照)
func r75eLogAll(mock *mockCB) []recCallback {
	out := []recCallback{}
	for _, k := range mock.snapshot() {
		if k.Kind == "log" {
			out = append(out, k)
		}
	}
	return out
}

// TestR75e_ChapterFailLevel 分级纯函数: 阈值半程起 error, 之前 warn
func TestR75e_ChapterFailLevel(t *testing.T) {
	for s := 1; s <= 9; s++ {
		if got := chapterFailLevel(s); got != "warn" {
			t.Fatalf("streak=%d level=%s, want warn", s, got)
		}
	}
	for s := 10; s <= ChapterFailCircuit; s++ {
		if got := chapterFailLevel(s); got != "error" {
			t.Fatalf("streak=%d level=%s, want error(≥阈值半程升级)", s, got)
		}
	}
}

// TestR75e_ChapterFailLogEscalation E2E: 单书 12 章全 404(Retries=0 快速失败) →
// 首败 warn(1/20)、连败 10 升级 error(10/20 文案「连败过半」)真实落日志回调
func TestR75e_ChapterFailLogEscalation(t *testing.T) {
	_, rc, mgr, mock := e2eHarness(t)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /book/", func(w http.ResponseWriter, r *http.Request) {
		var sb strings.Builder
		fmt.Fprintf(&sb, "<html><head><meta charset=\"utf-8\"><title>测试书1 - 假站</title></head><body>")
		fmt.Fprintf(&sb, `<h1 class="bt">测试书1</h1><span class="ba">作者1</span>`)
		fmt.Fprintf(&sb, `<div id="intro">这是一本测试书籍的简介。%s</div>`, strings.Repeat("简介补充内容, 用于页面体量判定。", 30))
		sb.WriteString(`<div class="toc"><ul>`)
		for n := 1; n <= 12; n++ {
			fmt.Fprintf(&sb, `<li><a href="/chapter/1_%d.html">第%d章 标题</a></li>`, n, n)
		}
		sb.WriteString("</ul></div></body></html>")
		_, _ = w.Write([]byte(sb.String()))
	})
	mux.HandleFunc("GET /chapter/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound) // 404 → 确定性快速失败(不烧重试)
		_, _ = w.Write([]byte("not found"))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	p := rule.TaskStartPayload{
		Task: rule.TaskInfo{ID: "t-r75e-404", Mode: "single", BookURL: srv.URL + "/book/1.html",
			RecrawlMode: "incremental", StorageMode: "db", ThreadMin: 1, ThreadMax: 1, IntervalMin: 0, IntervalMax: 0},
		Rule:     rc,
		Callback: rule.CallbackInfo{BaseURL: mock.srv.URL, Secret: callback.DefaultSecret},
	}
	if err := mgr.Start(p); err != nil {
		t.Fatalf("start: %v", err)
	}
	info := waitDone(t, mgr, "t-r75e-404")
	if info.Phase != "done" {
		t.Fatalf("phase = %s (lastError=%s), 12<20 未达熔断应正常收尾", info.Phase, info.LastError)
	}
	if info.Stats.Errors != 12 {
		t.Fatalf("stats.Errors = %d, want 12", info.Stats.Errors)
	}
	// 首败 warn
	r75eWaitLog(t, mock, 10*time.Second, func(lvl, msg string) bool {
		return lvl == "warn" && strings.Contains(msg, "章节失败(1/20 连败)") && strings.Contains(msg, "HTTP 404")
	})
	// 连败过半升级 error
	r75eWaitLog(t, mock, 10*time.Second, func(lvl, msg string) bool {
		return lvl == "error" && strings.Contains(msg, "章节连败过半(10/20")
	})
	// 限频面: streak 4/6/7/8/9/11/12 不产生日志 → 「章节失败(」类 warn 恰 4 条(1,2,3,5)
	warns := 0
	for _, k := range r75eLogAll(mock) {
		lvl, _ := k.Payload["level"].(string)
		msg, _ := k.Payload["message"].(string)
		if lvl == "warn" && strings.Contains(msg, "章节失败(") {
			warns++
		}
	}
	if warns != 4 {
		t.Fatalf("「章节失败(」warn 条数 = %d, want 4(限频 1,2,3,5)", warns)
	}
}

// TestR75e_EmptyContentThrottleAndSummary 空正文章: 3 章全空 → 首条 warn(累计 1),
// 第 2/3 章不刷屏, 书收尾汇总 warn(累计 3 章)
func TestR75e_EmptyContentThrottleAndSummary(t *testing.T) {
	_, rc, mgr, mock := e2eHarness(t)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /book/", func(w http.ResponseWriter, r *http.Request) {
		var sb strings.Builder
		fmt.Fprintf(&sb, "<html><head><meta charset=\"utf-8\"><title>测试书1 - 假站</title></head><body>")
		fmt.Fprintf(&sb, `<h1 class="bt">测试书1</h1><span class="ba">作者1</span>`)
		fmt.Fprintf(&sb, `<div id="intro">这是一本测试书籍的简介。%s</div>`, strings.Repeat("简介补充内容, 用于页面体量判定。", 30))
		sb.WriteString(`<div class="toc"><ul>`)
		for n := 1; n <= 3; n++ {
			fmt.Fprintf(&sb, `<li><a href="/chapter/1_%d.html">第%d章 标题</a></li>`, n, n)
		}
		sb.WriteString("</ul></div></body></html>")
		_, _ = w.Write([]byte(sb.String()))
	})
	// 章节 页面体量足够(防短页误判拦截页); 正文为空经「非 css 内容规则」构造 ——
	// css 型有低质备用选择器兜底(findLargestText 会捞出 filler), regex 型无兜底,
	// 永不匹配 → parsed.Content 严格为空(真实空正文语义)
	rc.Content = rule.PageRule{Enabled: true, Fields: map[string]*rule.FieldRule{
		"content": {Type: "regex", Expression: "R75E_NEVER_MATCH_PLACEHOLDER"},
	}}
	mux.HandleFunc("GET /chapter/", func(w http.ResponseWriter, r *http.Request) {
		var bid, n int
		_, _ = fmt.Sscanf(r.URL.Path, "/chapter/%d_%d.html", &bid, &n)
		_, _ = fmt.Fprintf(w, "<html><head><title>第%d章 标题 - 假站</title></head><body><div id=\"content\"><p>这是第%d章的正文内容。</p><p>%s</p></div></body></html>", n, n, strings.Repeat("正文段落, 内容足够长以通过页面体量判定。", 20))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	rc.Fetch.AllowLoopback = true

	p := rule.TaskStartPayload{
		Task: rule.TaskInfo{ID: "t-r75e-empty", Mode: "single", BookURL: srv.URL + "/book/1.html",
			RecrawlMode: "incremental", StorageMode: "db", ThreadMin: 1, ThreadMax: 1, IntervalMin: 0, IntervalMax: 0},
		Rule:     rc,
		Callback: rule.CallbackInfo{BaseURL: mock.srv.URL, Secret: callback.DefaultSecret},
	}
	if err := mgr.Start(p); err != nil {
		t.Fatalf("start: %v", err)
	}
	info := waitDone(t, mgr, "t-r75e-empty")
	if info.Phase != "done" {
		t.Fatalf("phase = %s (lastError=%s)", info.Phase, info.LastError)
	}
	// 首条限频 warn
	r75eWaitLog(t, mock, 10*time.Second, func(lvl, msg string) bool {
		return lvl == "warn" && strings.Contains(msg, "章节正文为空") && strings.Contains(msg, "本书累计 1")
	})
	// 收尾汇总
	r75eWaitLog(t, mock, 10*time.Second, func(lvl, msg string) bool {
		return lvl == "warn" && strings.Contains(msg, "空正文章节累计 3 章")
	})
	// 刷屏面: 「章节正文为空」恰 1 条(第 2/3 章静默计数)
	n := 0
	for _, k := range r75eLogAll(mock) {
		lvl, _ := k.Payload["level"].(string)
		msg, _ := k.Payload["message"].(string)
		if lvl == "warn" && strings.Contains(msg, "章节正文为空") {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("「章节正文为空」warn 条数 = %d, want 1(限频)", n)
	}
	if info.Progress.ContentDone != 0 {
		t.Fatalf("空正文不应计入 contentDone: %d", info.Progress.ContentDone)
	}
}

// TestR75e_TocZeroChaptersWarned 目录 0 章(规则不匹配/结构变化): 单列 warn,
// 且不再发误导性「增量无新章: 0 章全量已存」
func TestR75e_TocZeroChaptersWarned(t *testing.T) {
	_, rc, mgr, mock := e2eHarness(t)
	mux := http.NewServeMux()
	// 书页元数据齐全但无 .toc 条目 → ParseToc 0 章
	mux.HandleFunc("GET /book/", func(w http.ResponseWriter, r *http.Request) {
		var sb strings.Builder
		fmt.Fprintf(&sb, "<html><head><meta charset=\"utf-8\"><title>测试书1 - 假站</title></head><body>")
		fmt.Fprintf(&sb, `<h1 class="bt">测试书1</h1><span class="ba">作者1</span>`)
		fmt.Fprintf(&sb, `<div id="intro">这是一本测试书籍的简介。%s</div>`, strings.Repeat("简介补充内容, 用于页面体量判定。", 30))
		sb.WriteString(`<div class="toc"><ul></ul></div></body></html>`)
		_, _ = w.Write([]byte(sb.String()))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	rc.Fetch.AllowLoopback = true

	p := rule.TaskStartPayload{
		Task: rule.TaskInfo{ID: "t-r75e-toc0", Mode: "single", BookURL: srv.URL + "/book/1.html",
			RecrawlMode: "incremental", StorageMode: "db", ThreadMin: 1, ThreadMax: 1, IntervalMin: 0, IntervalMax: 0},
		Rule:     rc,
		Callback: rule.CallbackInfo{BaseURL: mock.srv.URL, Secret: callback.DefaultSecret},
	}
	if err := mgr.Start(p); err != nil {
		t.Fatalf("start: %v", err)
	}
	info := waitDone(t, mgr, "t-r75e-toc0")
	if info.Phase != "done" {
		t.Fatalf("phase = %s (lastError=%s)", info.Phase, info.LastError)
	}
	r75eWaitLog(t, mock, 10*time.Second, func(lvl, msg string) bool {
		return lvl == "warn" && strings.Contains(msg, "目录解析得 0 章")
	})
	time.Sleep(500 * time.Millisecond) // 日志 best-effort goroutine 收敛窗(负断言)
	for _, k := range r75eLogAll(mock) {
		msg, _ := k.Payload["message"].(string)
		if strings.Contains(msg, "增量无新章") {
			t.Fatalf("0 章场景不应再发「增量无新章: 0 章全量已存」误导文案: %s", msg)
		}
	}
}
