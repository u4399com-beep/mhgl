package task

// [R75-main] tocLink const {q.*} 变量渲染回归。
// 背景: 纯 JSON API 站(bqg713 类)的 toc.tocLink 为 const 模板 "…/api/booklist?id={q.id}",
// {q.*} 变量源自书籍页 URL 查询参数(urlVars)。修前任务侧 extractRuleField 传 baseURL=""
// → urlVars 恒空 → 渲染残 URL "?id=" 打向源站必 403 丢书; 而测试端点(testResolveToc)
// 传 bookURL 渲染正常 —— 任务/测试两路语义分叉。修后同传 bookURL。
// 本测试: booklist 端点对 id!=123 返回 403 —— 修前任务必然丢书, 修后全链通过。

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mhgl/internal/crawl/callback"
	"mhgl/internal/crawl/rule"
)

func TestR75main_TocLinkQVarRendered(t *testing.T) {
	_, _, mgr, mock := e2eHarness(t)

	mux := http.NewServeMux()
	// 书籍页 = 纯 JSON(book.url 直带 ?id=123 → q.id=123)
	mux.HandleFunc("GET /api/book", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("id") != "123" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"title":"测书甲","author":"作者乙","intro":"简介文本","full":0,"sortname":"玄幻"}`))
	})
	// 目录页 = JSON 列表; 修前 extractRuleField 渲染 "?id="(空) 打到这里 → 403 → 丢书
	mux.HandleFunc("GET /api/booklist", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("id") != "123" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"list":["第一章 甲","第二章 乙","第三章 丙"]}`))
	})
	// 正文页 = HTML(闭环 content 阶段)
	mux.HandleFunc("GET /api/chapter", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("id") != "123" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		_, _ = w.Write([]byte("<html><body><div id=\"content\">" +
			strings.Repeat("正文段落内容。", 40) + "</div></body></html>"))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	rc := fixtureRule(srv.URL)
	// JSON API 站形态: 书籍字段走 json 路径; tocLink 走 const {q.id}; 目录项 JSON 数组
	rc.Book.Fields = map[string]*rule.FieldRule{
		"name":   {Type: "json", Expression: "title"},
		"author": {Type: "json", Expression: "author"},
		"intro":  {Type: "json", Expression: "intro"},
	}
	rc.Toc.TocLink = &rule.FieldRule{Type: "const", Expression: srv.URL + "/api/booklist?id={q.id}"}
	rc.Toc.ItemSelector = &rule.FieldRule{Type: "json", Expression: "list"}
	rc.Toc.Fields = map[string]*rule.FieldRule{
		"title": {Type: "json", Expression: "."},
		"url":   {Type: "const", Expression: srv.URL + "/api/chapter?id={q.id}&chapterid={index}"},
	}

	p := rule.TaskStartPayload{
		Task: rule.TaskInfo{ID: "t-r75main-qvar", Mode: "single",
			BookURL:     srv.URL + "/api/book?id=123",
			RecrawlMode: "full", StorageMode: "db", ThreadMin: 1, ThreadMax: 1, IntervalMin: 0, IntervalMax: 0},
		Rule:     rc,
		Callback: rule.CallbackInfo{BaseURL: mock.srv.URL, Secret: callback.DefaultSecret},
	}
	if err := mgr.Start(p); err != nil {
		t.Fatalf("start: %v", err)
	}
	info := waitDone(t, mgr, "t-r75main-qvar")
	if info.Phase != "done" {
		t.Fatalf("phase = %s (lastError=%s) —— tocLink {q.id} 渲染残 URL 会在此暴露", info.Phase, info.LastError)
	}
	// chapters 回调必须含渲染后的章节 URL(id=123&chapterid=N), 且无空 id 形态
	found := 0
	for _, k := range mock.snapshot() {
		if k.Kind != "chapters" {
			continue
		}
		items, _ := k.Payload["items"].([]interface{})
		for _, it := range items {
			m, _ := it.(map[string]interface{})
			u, _ := m["url"].(string)
			if u == "" {
				continue
			}
			if strings.Contains(u, "chapterid=") && !strings.Contains(u, "id=123") {
				t.Fatalf("章节 URL 未渲染 {q.id}: %s", u)
			}
			if strings.Contains(u, "id=123&chapterid=") {
				found++
			}
		}
	}
	if found < 3 {
		t.Fatalf("期望 ≥3 条 id=123&chapterid=N 章节 URL, 实得 %d", found)
	}
}
