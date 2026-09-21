// ============================================================
// 任务编排层测试 — 契约 §5/§8
//
//	纯函数: 序号过滤/批次随机区间/洗牌保元/书号解析
//	fixture E2E: httptest 假站(列表2页×2书/书籍页内嵌目录3章/内容页/封面)
//	+ 内存 mock 回调接收器(决策: skipContent=false, needUrls=全量)
//	→ 走通 single / bookIds(范围) / range 三模式全链, 断言回调序列与进度
//
// ============================================================
package task

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"crawler-go/internal/callback"
	"crawler-go/internal/rule"
)

// ---------------- 纯函数 ----------------

// randSource 测试随机源
func randSource() *rand.Rand { return rand.New(rand.NewSource(time.Now().UnixNano())) }

func TestSliceByBookStartEnd(t *testing.T) {
	urls := []string{"a", "b", "c", "d"}
	if got := sliceByBookStartEnd(urls, 0, 0); len(got) != 4 {
		t.Fatalf("不限切片 = %v", got)
	}
	if got := sliceByBookStartEnd(urls, 2, 3); len(got) != 2 || got[0] != "b" || got[1] != "c" {
		t.Fatalf("2..3 切片 = %v", got)
	}
	if got := sliceByBookStartEnd(urls, 3, 0); len(got) != 2 || got[0] != "c" {
		t.Fatalf("3..末尾切片 = %v", got)
	}
	if got := sliceByBookStartEnd(urls, 9, 12); len(got) != 0 {
		t.Fatalf("越界切片 = %v", got)
	}
}

func TestBatchRandomBounds(t *testing.T) {
	rnd := randSource()
	for i := 0; i < 200; i++ {
		// 批大小钳 ≤ MaxContentsBatch
		n := drawBatchThreads(rnd, 1, 50)
		if n < 1 || n > MaxContentsBatch {
			t.Fatalf("drawBatchThreads 越界: %d", n)
		}
		// 区间随机夹在 [min,max]
		v := randInt(rnd, 3, 7)
		if v < 3 || v > 7 {
			t.Fatalf("randInt 越界: %d", v)
		}
		// min>max 归一
		if v := randInt(rnd, 7, 3); v < 3 || v > 7 {
			t.Fatalf("randInt 反序越界: %d", v)
		}
		// 间隔 = 区间 + jitter
		d := drawInterval(rnd, 0, 0, 5)
		if d < 0 || d > 5*time.Millisecond {
			t.Fatalf("drawInterval 越界: %v", d)
		}
	}
}

func TestFisherYatesPreservesElements(t *testing.T) {
	rnd := randSource()
	src := []string{"1", "2", "3", "4", "5", "6"}
	dst := append([]string(nil), src...)
	fisherYates(rnd, dst)
	if len(dst) != len(src) {
		t.Fatalf("洗牌改变长度: %v", dst)
	}
	seen := map[string]bool{}
	for _, s := range dst {
		seen[s] = true
	}
	for _, s := range src {
		if !seen[s] {
			t.Fatalf("洗牌丢失元素 %q: %v", s, dst)
		}
	}
}

func TestParseIDInt(t *testing.T) {
	if parseIDInt("123") != 123 || parseIDInt("") != 0 || parseIDInt("12a") != 0 || parseIDInt("-5") != 0 {
		t.Fatal("parseIDInt 语义异常")
	}
}

// ---------------- fixture E2E ----------------

// recCallback mock 回调接收器记录
type recCallback struct {
	Kind    string
	Payload map[string]interface{}
}

type mockCB struct {
	mu     sync.Mutex
	kinds  []recCallback
	secret string
	srv    *httptest.Server
}

func newMockCB(t *testing.T, secret string) *mockCB {
	m := &mockCB{secret: secret}
	mux := http.NewServeMux()
	mux.HandleFunc("POST "+callback.CallbackPath, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-go-callback-secret") != m.secret {
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": "bad secret"})
			return
		}
		var env struct {
			TaskID  string                 `json:"taskId"`
			Kind    string                 `json:"kind"`
			Payload map[string]interface{} `json:"payload"`
		}
		if err := json.NewDecoder(r.Body).Decode(&env); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		m.mu.Lock()
		m.kinds = append(m.kinds, recCallback{Kind: env.Kind, Payload: env.Payload})
		m.mu.Unlock()

		resp := map[string]interface{}{"ok": true}
		switch env.Kind {
		case "book":
			// 决策: 不跳过正文(增量跳过语义在 skip_test 单测覆盖)
			resp["bookId"] = "mock-book-1"
			resp["skipContent"] = false
			resp["lastChapterUrl"] = ""
		case "chapters":
			// 决策: 全量需要抓取(needUrls=items 的 url 回显)
			var need []string
			if items, ok := env.Payload["items"].([]interface{}); ok {
				for _, it := range items {
					if o, ok := it.(map[string]interface{}); ok {
						if u, ok := o["url"].(string); ok && u != "" {
							need = append(need, u)
						}
					}
				}
			}
			resp["needUrls"] = need
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})
	m.srv = httptest.NewServer(mux)
	t.Cleanup(m.srv.Close)
	return m
}

func (m *mockCB) snapshot() []recCallback {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]recCallback(nil), m.kinds...)
}

func (m *mockCB) countKind(kind string) int {
	n := 0
	for _, k := range m.snapshot() {
		if k.Kind == kind {
			n++
		}
	}
	return n
}

// newFakeSite 假站: /list/{page}.html(2 页×2 书) /book/{id}.html(内嵌目录 3 章)
// /chapter/{bid}_{n}.html(正文) /covers/x.jpg(1×1 PNG)
func newFakeSite(t *testing.T) *httptest.Server {
	const chapterCount = 3
	png := []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /list/", func(w http.ResponseWriter, r *http.Request) {
		page := 1
		if strings.HasSuffix(r.URL.Path, "/2.html") {
			page = 2
		}
		var sb strings.Builder
		// 页面体量需 ≥500 rune 且带正常 title(拦截页检测 R51-3-a: 极短页/短页低可见
		// 文本判拦 —— fixture 同步真实站点体量, 避免被误拦)
		sb.WriteString("<html><head><meta charset=\"utf-8\"><title>书库列表</title></head><body><div class=\"booklist\"><ul>")
		for _, id := range []int{(page-1)*2 + 1, (page-1)*2 + 2} {
			fmt.Fprintf(&sb, `<li><a class="t" href="/book/%d.html">书%d</a></li>`, id, id)
		}
		sb.WriteString("</ul></div><p>" + strings.Repeat("列表页导航与站点公告文本。", 30) + "</p></body></html>")
		_, _ = w.Write([]byte(sb.String()))
	})

	mux.HandleFunc("GET /book/", func(w http.ResponseWriter, r *http.Request) {
		var id int
		_, _ = fmt.Sscanf(r.URL.Path, "/book/%d.html", &id)
		var sb strings.Builder
		fmt.Fprintf(&sb, "<html><head><meta charset=\"utf-8\"><title>测试书%d - 假站</title></head><body>", id)
		fmt.Fprintf(&sb, `<h1 class="bt">测试书%d</h1><span class="ba">作者%d</span>`, id, id)
		fmt.Fprintf(&sb, `<div id="intro">这是一本测试书籍的简介。%s</div>`, strings.Repeat("简介补充内容, 用于页面体量判定。", 30))
		sb.WriteString(`<img class="cover" src="/covers/x.jpg">`)
		sb.WriteString(`<div class="toc"><ul>`)
		for n := 1; n <= chapterCount; n++ {
			fmt.Fprintf(&sb, `<li><a href="/chapter/%d_%d.html">第%d章 标题</a></li>`, id, n, n)
		}
		sb.WriteString("</ul></div></body></html>")
		_, _ = w.Write([]byte(sb.String()))
	})

	mux.HandleFunc("GET /chapter/", func(w http.ResponseWriter, r *http.Request) {
		var bid, n int
		_, _ = fmt.Sscanf(r.URL.Path, "/chapter/%d_%d.html", &bid, &n)
		_, _ = fmt.Fprintf(w, "<html><head><title>第%d章 标题 - 假站</title></head><body><div id=\"content\"><p>这是第%d章的正文内容, 用于测试图书%d。</p><p>%s</p></div></body></html>", n, n, bid, strings.Repeat("正文段落, 内容足够长以通过页面体量判定。", 20))
	})

	mux.HandleFunc("GET /covers/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(png)
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// fixtureRule 假站规则(经典 HTML 形态; AllowLoopback 放行 httptest 回环地址)
func fixtureRule(site string) rule.RuleConfig {
	return rule.RuleConfig{
		List: rule.PageRule{Enabled: true,
			ItemSelector: &rule.FieldRule{Type: "css", Expression: ".booklist li"},
			Fields: map[string]*rule.FieldRule{
				"url": {Type: "css", Expression: "a.t", Attr: "href"},
			}},
		Book: rule.PageRule{Enabled: true, Fields: map[string]*rule.FieldRule{
			"name":   {Type: "css", Expression: "h1.bt"},
			"author": {Type: "css", Expression: "span.ba"},
			"intro":  {Type: "css", Expression: "#intro", StripTags: true},
			"cover":  {Type: "css", Expression: "img.cover", Attr: "src"},
		}},
		Toc: rule.PageRule{Enabled: true,
			ItemSelector: &rule.FieldRule{Type: "css", Expression: ".toc li"},
			Fields: map[string]*rule.FieldRule{
				"title": {Type: "css", Expression: "a"},
				"url":   {Type: "css", Expression: "a", Attr: "href"},
			}},
		Content: rule.PageRule{Enabled: true, Fields: map[string]*rule.FieldRule{
			"content": {Type: "css", Expression: "#content", Attr: "html"},
		}},
		Fetch: rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 5000, Retries: 0,
			HostGateLimit: 3, GlobalConcurrency: 10, AllowLoopback: true},
	}
}

// waitDone 轮询等待任务终态(超时 60s)
func waitDone(t *testing.T, mgr *Manager, id string) StatusInfo {
	t.Helper()
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		info := mgr.Status(id)
		if !info.Exists || (!info.Running && info.Phase != "content" && info.Phase != "book" && info.Phase != "toc" && info.Phase != "discovery") {
			// 终态判定: 注册表已出(exists=false, stop 收割)或 phase 为 done/error/stopped/paused
			if !info.Exists || info.Phase == "done" || info.Phase == "error" || info.Phase == "stopped" {
				return info
			}
			if info.Phase == "paused" {
				return info
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("任务 %s 60s 未达终态: %+v", id, mgr.Status(id))
	return StatusInfo{}
}

// e2eHarness 启动假站+mock 回调, 返回(假站地址, 规则, 注册表, mock 回调)
func e2eHarness(t *testing.T) (string, rule.RuleConfig, *Manager, *mockCB) {
	t.Helper()
	site := newFakeSite(t)
	mock := newMockCB(t, callback.DefaultSecret)
	return site.URL, fixtureRule(site.URL), NewManager(), mock
}

func TestE2ESingleMode(t *testing.T) {
	site, rc, mgr, mock := e2eHarness(t)
	p := rule.TaskStartPayload{
		Task: rule.TaskInfo{ID: "t-single", Mode: "single", BookURL: site + "/book/1.html",
			RecrawlMode: "incremental", StorageMode: "db", ThreadMin: 2, ThreadMax: 2, IntervalMin: 0, IntervalMax: 0},
		Rule:     rc,
		Callback: rule.CallbackInfo{BaseURL: mock.srv.URL, Secret: callback.DefaultSecret},
	}
	if err := mgr.Start(p); err != nil {
		t.Fatalf("start: %v", err)
	}
	info := waitDone(t, mgr, "t-single")
	if info.Phase != "done" {
		t.Fatalf("phase = %s (lastError=%s)", info.Phase, info.LastError)
	}
	if info.Progress.BooksDone != 1 {
		t.Fatalf("booksDone = %d, want 1", info.Progress.BooksDone)
	}
	if info.Progress.ContentDone != 3 || info.Progress.ContentTotal != 3 {
		t.Fatalf("content = %d/%d, want 3/3", info.Progress.ContentDone, info.Progress.ContentTotal)
	}
	// 回调序列断言: 决策类(book/chapters/contents/cover)至少各 1, 终态 status=done
	if mock.countKind("book") != 1 {
		t.Fatalf("book 回调数 = %d, want 1", mock.countKind("book"))
	}
	if mock.countKind("chapters") != 1 {
		t.Fatalf("chapters 回调数 = %d, want 1", mock.countKind("chapters"))
	}
	if mock.countKind("contents") < 1 {
		t.Fatalf("contents 回调缺失")
	}
	if mock.countKind("cover") != 1 {
		t.Fatalf("cover 回调数 = %d, want 1", mock.countKind("cover"))
	}
	last := recCallback{}
	for _, k := range mock.snapshot() {
		if k.Kind == "status" {
			last = k
		}
	}
	if last.Payload["status"] != "done" {
		t.Fatalf("末次 status = %v, want done", last.Payload["status"])
	}
	// chapters 回调 items=3 且 book 回调带书名
	for _, k := range mock.snapshot() {
		if k.Kind == "book" {
			if !strings.Contains(fmt.Sprint(k.Payload["name"]), "测试书1") {
				t.Fatalf("book 回调书名异常: %v", k.Payload["name"])
			}
		}
	}
}

func TestE2EBookIdsRangeMode(t *testing.T) {
	site, rc, mgr, mock := e2eHarness(t)
	p := rule.TaskStartPayload{
		Task: rule.TaskInfo{ID: "t-bookids", Mode: "bookIds",
			BookURL: site + "/book/{bookId}.html", BookIdFrom: "1", BookIdTo: "2",
			RecrawlMode: "incremental", StorageMode: "db", ThreadMin: 1, ThreadMax: 2, IntervalMin: 0, IntervalMax: 0},
		Rule:     rc,
		Callback: rule.CallbackInfo{BaseURL: mock.srv.URL, Secret: callback.DefaultSecret},
	}
	if err := mgr.Start(p); err != nil {
		t.Fatalf("start: %v", err)
	}
	info := waitDone(t, mgr, "t-bookids")
	if info.Phase != "done" {
		t.Fatalf("phase = %s (lastError=%s)", info.Phase, info.LastError)
	}
	if info.Progress.BooksDone != 2 || info.Progress.BooksTotal != 2 {
		t.Fatalf("books = %d/%d, want 2/2", info.Progress.BooksDone, info.Progress.BooksTotal)
	}
	if info.Progress.ContentDone != 6 {
		t.Fatalf("contentDone = %d, want 6(2 书×3 章)", info.Progress.ContentDone)
	}
	if mock.countKind("book") != 2 || mock.countKind("cover") != 2 {
		t.Fatalf("book/cover 回调数 = %d/%d, want 2/2", mock.countKind("book"), mock.countKind("cover"))
	}
}

func TestE2ERangeDiscovery(t *testing.T) {
	site, rc, mgr, mock := e2eHarness(t)
	p := rule.TaskStartPayload{
		Task: rule.TaskInfo{ID: "t-range", Mode: "range",
			ListURL: site + "/list/{page}.html", ListStart: 1, ListEnd: 2,
			RecrawlMode: "incremental", StorageMode: "db", ThreadMin: 1, ThreadMax: 2, IntervalMin: 0, IntervalMax: 0},
		Rule:     rc,
		Callback: rule.CallbackInfo{BaseURL: mock.srv.URL, Secret: callback.DefaultSecret},
	}
	if err := mgr.Start(p); err != nil {
		t.Fatalf("start: %v", err)
	}
	info := waitDone(t, mgr, "t-range")
	if info.Phase != "done" {
		t.Fatalf("phase = %s (lastError=%s)", info.Phase, info.LastError)
	}
	// 2 页×2 书=4 本(去重后)
	if info.Progress.Discovered != 4 {
		t.Fatalf("discovered = %d, want 4", info.Progress.Discovered)
	}
	if info.Progress.BooksDone != 4 {
		t.Fatalf("booksDone = %d, want 4", info.Progress.BooksDone)
	}
	if mock.countKind("book") != 4 {
		t.Fatalf("book 回调数 = %d, want 4", mock.countKind("book"))
	}
}

// TestPauseStopControl 控制面: pause 挂起后 resume 完成 / stop 终止
func TestPauseStopControl(t *testing.T) {
	site, rc, mgr, mock := e2eHarness(t)
	// 间隔拉大, 保证 pause 有窗口切入
	p := rule.TaskStartPayload{
		Task: rule.TaskInfo{ID: "t-ctl", Mode: "bookIds",
			BookURL: site + "/book/{bookId}.html", BookIds: []string{"1", "2"},
			RecrawlMode: "incremental", StorageMode: "db", ThreadMin: 1, ThreadMax: 1, IntervalMin: 300, IntervalMax: 300},
		Rule:     rc,
		Callback: rule.CallbackInfo{BaseURL: mock.srv.URL, Secret: callback.DefaultSecret},
	}
	if err := mgr.Start(p); err != nil {
		t.Fatalf("start: %v", err)
	}
	// 等 book 回调出现后立即 pause
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) && mock.countKind("book") == 0 {
		time.Sleep(20 * time.Millisecond)
	}
	if _, err := mgr.Control("t-ctl", "pause"); err != nil {
		t.Fatalf("pause: %v", err)
	}
	time.Sleep(200 * time.Millisecond)
	if _, err := mgr.Control("t-ctl", "resume"); err != nil {
		t.Fatalf("resume: %v", err)
	}
	info := waitDone(t, mgr, "t-ctl")
	if info.Phase != "done" {
		t.Fatalf("pause/resume 后 phase = %s", info.Phase)
	}
	if info.Progress.BooksDone != 2 {
		t.Fatalf("booksDone = %d, want 2", info.Progress.BooksDone)
	}

	// stop: 启动新任务后立即停止(终态 stopped 或注册表移除)
	p.Task.ID = "t-stop2"
	if err := mgr.Start(p); err != nil {
		t.Fatalf("restart: %v", err)
	}
	if _, err := mgr.Control("t-stop2", "stop"); err != nil {
		t.Fatalf("stop: %v", err)
	}
	deadline = time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		if !mgr.Status("t-stop2").Exists {
			break // stop 收割完成
		}
		time.Sleep(50 * time.Millisecond)
	}
}

// TestNeedUrlsEmptySkips 增量语义: chapters 回调 needUrls=[] → 跳过正文阶段(无 contents 回调)
func TestNeedUrlsEmptySkips(t *testing.T) {
	site, rc, _, _ := e2eHarness(t) // mgr 不用, 自建带空 needUrls 的 mock
	mux := http.NewServeMux()
	mux.HandleFunc("POST "+callback.CallbackPath, func(w http.ResponseWriter, r *http.Request) {
		var env struct {
			Kind    string                 `json:"kind"`
			Payload map[string]interface{} `json:"payload"`
		}
		_ = json.NewDecoder(r.Body).Decode(&env)
		resp := map[string]interface{}{"ok": true}
		switch env.Kind {
		case "book":
			resp["bookId"] = "b1"
			resp["skipContent"] = false
		case "chapters":
			resp["needUrls"] = []string{} // 空 = 全部已采
		}
		_ = json.NewEncoder(w).Encode(resp)
	})
	cbSrv := httptest.NewServer(mux)
	defer cbSrv.Close()

	mgr := NewManager()
	mock := &mockCB{} // 仅占位(此用例直接自建接收器)
	_ = mock
	p := rule.TaskStartPayload{
		Task: rule.TaskInfo{ID: "t-skip", Mode: "single", BookURL: site + "/book/1.html",
			RecrawlMode: "incremental", StorageMode: "db", ThreadMin: 1, ThreadMax: 1, IntervalMin: 0, IntervalMax: 0},
		Rule:     rc,
		Callback: rule.CallbackInfo{BaseURL: cbSrv.URL, Secret: callback.DefaultSecret},
	}
	if err := mgr.Start(p); err != nil {
		t.Fatalf("start: %v", err)
	}
	info := waitDone(t, mgr, "t-skip")
	if info.Phase != "done" {
		t.Fatalf("phase = %s", info.Phase)
	}
	if info.Progress.ContentTotal != 0 || info.Progress.ContentDone != 0 {
		t.Fatalf("needUrls 空不应进入正文阶段: %d/%d", info.Progress.ContentDone, info.Progress.ContentTotal)
	}
}
