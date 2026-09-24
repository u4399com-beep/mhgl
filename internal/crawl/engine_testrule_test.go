// ============================================================
// [R63-c] TestRule content 段语义对齐单测
//
//	复现 R62 遗留实证(bqg713): 规则 fetch.contentProxyUrl 配置下,
//	test 端点修前恒走普通 Fetch —— 直连被源站拒绝(403)时 test 报
//	「抓取失败: HTTP 403」, 而生产 FetchContentRef 经 unlock 包裹 200
//	成功, 操作员按 test 结果修规则会得出与生产行为相悖的结论。
//	修后 content 段走 FetchContentRef(包裹优先+降级直连), 与生产同链路。
//
// ============================================================
package crawl

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestTestRuleContentUsesContentProxy(t *testing.T) {
	// 章节直连恒 403(模拟源站封锁直连, bqg713 apige.cc 形态)
	var directHits int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&directHits, 1)
		http.Error(w, "forbidden", http.StatusForbidden)
	}))
	defer upstream.Close()

	// unlock 转换代理: 校验 {url} 包裹参数并返回 JSON {ok,content}(模拟 :3010 unlock)
	var proxyHits int32
	unlock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&proxyHits, 1)
		if got := r.URL.Query().Get("url"); !strings.Contains(got, "chapter/1.html") {
			t.Errorf("unlock 未收到 {url} 包裹参数: %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"chaptername":"第一章 试探","content":"PROXY-CONTENT-MARKER 这是经转换代理取得的正文, 足够长以通过拦截页判定。——` +
			strings.Repeat("正文段落。", 60) + `"}`))
	}))
	defer unlock.Close()

	cfg := map[string]any{
		"content": map[string]any{
			"enabled": true,
			"fields": map[string]any{
				"content": map[string]any{"type": "css", "expression": "body"},
			},
		},
		"fetch": map[string]any{
			"engine":          "http",
			"timeout":         3000,
			"retries":         0,
			"allowLoopback":   true,
			"contentProxyUrl": "http://" + unlock.Listener.Addr().String() + "/unlock?url={url}",
		},
		"clean": map[string]any{},
	}
	b, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal cfg: %v", err)
	}
	res, terr := TestRule(string(b), "http://"+upstream.Listener.Addr().String()+"/chapter/1.html")
	if terr != nil {
		t.Fatalf("content 段 test 应经 contentProxyUrl 包裹成功(生产同链路), got error: %v", terr)
	}
	if atomic.LoadInt32(&proxyHits) == 0 {
		t.Fatalf("contentProxyUrl 包裹未被应用(unlock 零请求)")
	}
	if atomic.LoadInt32(&directHits) != 0 {
		t.Fatalf("包裹成功时不应降级直连源站(直接命中 %d 次)", directHits)
	}
	data, ok := res["data"].(map[string]any)
	if !ok {
		t.Fatalf("响应缺 data 段: %v", res)
	}
	if cleaned, _ := data["cleanedText"].(string); !strings.Contains(cleaned, "PROXY-CONTENT-MARKER") {
		t.Fatalf("cleanedText 应含转换代理正文, got: %.200s", cleaned)
	}
}

// TestTestRuleContentProxyFallbackToDirect 反向: 转换代理失败时降级直连
// (FetchContentRef 降级语义, 直连可用即成功) —— 保 test 端点与生产降级行为一致
func TestTestRuleContentProxyFallbackToDirect(t *testing.T) {
	var directHits int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&directHits, 1)
		body := "<html><body><p>" + strings.Repeat("直连正文段落。", 80) + "</p></body></html>"
		_, _ = w.Write([]byte(body))
	}))
	defer upstream.Close()

	// 转换代理: 恒 503(不可用) → 降级直连
	unlock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", http.StatusServiceUnavailable)
	}))
	defer unlock.Close()

	cfg := map[string]any{
		"content": map[string]any{
			"enabled": true,
			"fields": map[string]any{
				"content": map[string]any{"type": "css", "expression": "body"},
			},
		},
		"fetch": map[string]any{
			"engine":          "http",
			"timeout":         3000,
			"retries":         0,
			"allowLoopback":   true,
			"contentProxyUrl": "http://" + unlock.Listener.Addr().String() + "/unlock?url={url}",
		},
		"clean": map[string]any{},
	}
	b, _ := json.Marshal(cfg)
	res, terr := TestRule(string(b), "http://"+upstream.Listener.Addr().String()+"/chapter/2.html")
	if terr != nil {
		t.Fatalf("代理失败应降级直连成功, got error: %v", terr)
	}
	if atomic.LoadInt32(&directHits) == 0 {
		t.Fatalf("降级直连未发生")
	}
	data, ok := res["data"].(map[string]any)
	if !ok {
		t.Fatalf("响应缺 data 段: %v", res)
	}
	if cleaned, _ := data["cleanedText"].(string); !strings.Contains(cleaned, "直连正文段落") {
		t.Fatalf("cleanedText 应含直连正文, got: %.200s", cleaned)
	}
}
