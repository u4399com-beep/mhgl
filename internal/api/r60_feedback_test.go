// ============================================================
// R60-2b — 用户反馈模块回归(公开提交/开关/限频/管理面/公开页/pseoAutoGenerate 钩子)
//
//	① 公开 POST: 合法入库(status=new)/类型校验/长度钳 1..2000+剥 HTML/限频 429/开关关 403
//	② 管理面: 分页列表+统计/筛选/process 标记/PATCH 契约(空备注→NULL)/DELETE 幂等 404
//	③ 公开页 GET /feedback: 注册在 mux 且开/关两态渲染; GET /api/public/feedback 405
//	④ pseoAutoGenerate 死设置接上: InsertBook 钩子(关=零行为/开=自动生成 ≤5 页/keyword 唯一去重)
//
// ============================================================
package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"mhgl/internal/auth"
	"mhgl/internal/store"
)

func feedbackDeps(t *testing.T) Deps {
	t.Helper()
	return Deps{DB: newTestDB(t), Auth: auth.NewService("pw", "s", false)}
}

func postFeedback(t *testing.T, d Deps, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/public/feedback", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.7:1234" // 公网直连(不采信 XFF)—— 同 IP 限频可复现
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	d.publicFeedbackPost(rec, req)
	return rec
}

func decodeEnv(t *testing.T, rec *httptest.ResponseRecorder) (bool, map[string]any) {
	t.Helper()
	var env struct {
		OK   bool           `json:"ok"`
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("envelope: %v body=%s", err, rec.Body.String())
	}
	return env.OK, env.Data
}

func TestFeedbackPublicPostRules(t *testing.T) {
	d := feedbackDeps(t)

	// 合法提交 → 200 + status=new 落库
	rec := postFeedback(t, d, `{"type":"bug","content":"第一章打不开","contact":"a@b.c","url":"https://x/read/1"}`)
	if rec.Code != 200 {
		t.Fatalf("post status=%d body=%s", rec.Code, rec.Body.String())
	}
	ok, data := decodeEnv(t, rec)
	if !ok || data["id"] == nil {
		t.Fatalf("post env: %v", data)
	}
	row, found, _ := d.DB.FeedbackGet(data["id"].(string))
	if !found || row["status"] != "new" || row["ip"] != "192.0.2.7" {
		t.Fatalf("row=%v", row)
	}

	// 长度钳制: 剥 HTML + 2000 字上限
	long := strings.Repeat("字", 2500)
	rec = postFeedback(t, d, `{"type":"suggestion","content":"<b>aaa</b> `+long+`"}`)
	if rec.Code != 200 {
		t.Fatalf("clamp post status=%d", rec.Code)
	}
	_, data = decodeEnv(t, rec)
	row, _, _ = d.DB.FeedbackGet(data["id"].(string))
	content := row["content"].(string)
	if strings.Contains(content, "<b>") || len([]rune(content)) != 2000 {
		t.Fatalf("clamp broken: runes=%d hasHTML=%v", len([]rune(content)), strings.Contains(content, "<b>"))
	}

	// 空内容 / 纯标签 → 400
	if rec = postFeedback(t, d, `{"type":"bug","content":"   "}`); rec.Code != 400 {
		t.Fatalf("empty content status=%d", rec.Code)
	}
	if rec = postFeedback(t, d, `{"type":"bug","content":"<img><br>"}`); rec.Code != 400 {
		t.Fatalf("tags-only content status=%d", rec.Code)
	}
	// 类型不合法 → 400
	if rec = postFeedback(t, d, `{"type":"spam","content":"正常内容哦"}`); rec.Code != 400 {
		t.Fatalf("bad type status=%d", rec.Code)
	}

	// 限频: 同 IP 每小时 ≤5 → 第 6 条 429(既有 4 条已插, 再补 4 条历史=共 5)
	for i := 0; i < 4; i++ {
		if _, err := d.DB.FeedbackInsert(store.FeedbackInput{Type: "other", Content: "历史", IP: "192.0.2.7"}); err != nil {
			t.Fatalf("seed rate rows: %v", err)
		}
	}
	rec = postFeedback(t, d, `{"type":"bug","content":"第六条会被限流"}`)
	if rec.Code != 429 {
		t.Fatalf("rate limit status=%d want 429", rec.Code)
	}

	// 老窗口不计入: 全部挪到 2 小时前 → 放行
	if _, err := d.DB.Exec(`UPDATE "Feedback" SET createdAt=?`, store.NowMS()-2*3600_000); err != nil {
		t.Fatalf("age rows: %v", err)
	}
	rec = postFeedback(t, d, `{"type":"bug","content":"一小时窗口外放行"}`)
	if rec.Code != 200 {
		t.Fatalf("window expire status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestFeedbackEnabledSwitch(t *testing.T) {
	d := feedbackDeps(t)

	// 缺省开
	if !d.feedbackEnabled() {
		t.Fatalf("default must be enabled")
	}
	// GET settings 含 feedback.enabled=true 缺省
	req := httptest.NewRequest("GET", "/api/admin/settings", nil)
	rec := httptest.NewRecorder()
	d.adminSettingsGet(rec, req)
	_, data := decodeEnv(t, rec)
	fb, _ := data["feedback"].(map[string]any)
	if fb == nil || fb["enabled"] != true {
		t.Fatalf("settings default feedback: %v", data["feedback"])
	}

	// 关闭(走 PUT /api/admin/settings 正式入口) → POST 403 带明确文案
	put := httptest.NewRequest("PUT", "/api/admin/settings", strings.NewReader(`{"feedback":{"enabled":false}}`))
	rec = httptest.NewRecorder()
	d.adminSettingsPut(rec, put)
	if rec.Code != 200 {
		t.Fatalf("settings put status=%d body=%s", rec.Code, rec.Body.String())
	}
	if d.feedbackEnabled() {
		t.Fatalf("switch off must disable")
	}
	rec = postFeedback(t, d, `{"type":"bug","content":"开关关闭后的提交"}`)
	if rec.Code != 403 {
		t.Fatalf("disabled post status=%d want 403", rec.Code)
	}
	var env struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &env)
	if !strings.Contains(env.Error, "反馈功能已关闭") {
		t.Fatalf("403 message=%q", env.Error)
	}
	// 脏 JSON 回落缺省开
	if err := d.DB.SetSetting("feedback", "{broken"); err != nil {
		t.Fatalf("set dirty: %v", err)
	}
	if !d.feedbackEnabled() {
		t.Fatalf("dirty JSON must fall back to enabled")
	}
}

func TestFeedbackAdminListProcessDelete(t *testing.T) {
	d := feedbackDeps(t)
	ids := make([]string, 0, 5)
	for i := 0; i < 5; i++ {
		id, err := d.DB.FeedbackInsert(store.FeedbackInput{
			Type: map[bool]string{true: "bug", false: "suggestion"}[i%2 == 0],
			// i 偶数 bug, 奇数 suggestion
			Content: map[bool]string{true: "书籍目录缺章", false: "希望增加搜索历史"}[i%2 == 0],
			IP:      "10.0.0." + string(rune('1'+i)),
		})
		if err != nil {
			t.Fatalf("seed %d: %v", i, err)
		}
		ids = append(ids, id)
	}

	// 列表全量 + 统计
	rec := httptest.NewRecorder()
	d.adminFeedbackList(rec, httptest.NewRequest("GET", "/api/admin/feedback", nil))
	_, data := decodeEnv(t, rec)
	if int(data["total"].(float64)) != 5 {
		t.Fatalf("total=%v", data["total"])
	}
	stats := data["stats"].(map[string]any)
	if stats["total"].(float64) != 5 || stats["new"].(float64) != 5 {
		t.Fatalf("stats=%v", stats)
	}

	// 分页: page=1 size=2 → 2 行 pages=3
	rec = httptest.NewRecorder()
	d.adminFeedbackList(rec, httptest.NewRequest("GET", "/api/admin/feedback?page=1&size=2", nil))
	_, data = decodeEnv(t, rec)
	if len(data["rows"].([]any)) != 2 || data["pages"].(float64) != 3 {
		t.Fatalf("page1 rows=%d pages=%v", len(data["rows"].([]any)), data["pages"])
	}
	// 筛选: type=bug → 3 行; q=搜索历史 → 1 行
	rec = httptest.NewRecorder()
	d.adminFeedbackList(rec, httptest.NewRequest("GET", "/api/admin/feedback?type=bug", nil))
	_, data = decodeEnv(t, rec)
	if int(data["total"].(float64)) != 3 {
		t.Fatalf("type filter total=%v", data["total"])
	}
	rec = httptest.NewRecorder()
	d.adminFeedbackList(rec, httptest.NewRequest("GET", "/api/admin/feedback?q="+url.QueryEscape("搜索历史"), nil))
	_, data = decodeEnv(t, rec)
	if int(data["total"].(float64)) != 2 { // 奇数序 2 行均为「希望增加搜索历史」
		t.Fatalf("q filter total=%v", data["total"])
	}

	// process: 标记已处理 + 备注
	rec = httptest.NewRecorder()
	reqProc := httptest.NewRequest("POST", "/api/admin/feedback/x/process", strings.NewReader(`{"adminNote":"<i>已修复</i>"}`))
	reqProc.SetPathValue("id", ids[0])
	d.adminFeedbackProcess(rec, reqProc)
	if rec.Code != 200 {
		t.Fatalf("process status=%d body=%s", rec.Code, rec.Body.String())
	}
	row, _, _ := d.DB.FeedbackGet(ids[0])
	if row["status"] != "resolved" || row["adminNote"] != "已修复" { // 剥 HTML
		t.Fatalf("processed row=%v", row)
	}

	// PATCH 契约保留: 空备注 → NULL
	rec = httptest.NewRecorder()
	reqPatch := httptest.NewRequest("PATCH", "/api/admin/feedback/x", strings.NewReader(`{"adminNote":""}`))
	reqPatch.SetPathValue("id", ids[0])
	d.adminFeedbackUpdate(rec, reqPatch)
	if rec.Code != 200 {
		t.Fatalf("patch status=%d", rec.Code)
	}
	row, _, _ = d.DB.FeedbackGet(ids[0])
	if row["adminNote"] != nil {
		t.Fatalf("empty note must NULL, got %v", row["adminNote"])
	}

	// DELETE + 二次删除 404
	rec = httptest.NewRecorder()
	reqDel := httptest.NewRequest("DELETE", "/api/admin/feedback/x", nil)
	reqDel.SetPathValue("id", ids[1])
	d.adminFeedbackDelete(rec, reqDel)
	if rec.Code != 200 {
		t.Fatalf("delete status=%d", rec.Code)
	}
	rec = httptest.NewRecorder()
	reqDel2 := httptest.NewRequest("DELETE", "/api/admin/feedback/x", nil)
	reqDel2.SetPathValue("id", ids[1])
	d.adminFeedbackDelete(rec, reqDel2)
	if rec.Code != 404 {
		t.Fatalf("second delete status=%d want 404", rec.Code)
	}
	// 详情 404
	rec = httptest.NewRecorder()
	reqDet := httptest.NewRequest("GET", "/api/admin/feedback/x", nil)
	reqDet.SetPathValue("id", ids[1])
	d.adminFeedbackDetail(rec, reqDet)
	if rec.Code != 404 {
		t.Fatalf("detail missing status=%d", rec.Code)
	}
}

func TestFeedbackPublicPageAndRouting(t *testing.T) {
	d := feedbackDeps(t)
	mux := http.NewServeMux()
	Register(mux, d)

	// 开: 页面 200 + 表单在位
	req := httptest.NewRequest("GET", "/feedback", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("/feedback status=%d", rec.Code)
	}
	ct := rec.Header().Get("Content-Type")
	if !strings.HasPrefix(ct, "text/html") {
		t.Fatalf("content-type=%q", ct)
	}
	body := rec.Body.String()
	for _, needle := range []string{"id=\"fb-form\"", "api/public/feedback", "意见反馈"} {
		if !strings.Contains(body, needle) {
			t.Fatalf("page missing %q", needle)
		}
	}
	// 页面字面路由优先于 web 层兜底 404(此处只证 api 侧注册成功, 即 mux 命中本 handler 而非 404)

	// 关: 关闭态文案
	if err := d.DB.SetSetting("feedback", `{"enabled":false}`); err != nil {
		t.Fatalf("set off: %v", err)
	}
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", "/feedback", nil))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "反馈功能未开启") {
		t.Fatalf("closed page status=%d", rec.Code)
	}

	// GET /api/public/feedback → 405
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", "/api/public/feedback", nil))
	if rec.Code != 405 {
		t.Fatalf("public GET status=%d want 405", rec.Code)
	}
}

func TestPseoAutoGenerateHook(t *testing.T) {
	d := feedbackDeps(t)
	// Register 已装钩子(feedbackDeps 未走 Register → 此处手动装, 与生产同路径)
	d.initPseoAutoGenerate()

	mkBook := func(t *testing.T, id, keywords string) {
		t.Helper()
		b := &store.Book{ID: id, Name: "测试书" + id, Author: "作者", Keywords: keywords, Status: "unknown"}
		if err := d.DB.InsertBook(b); err != nil {
			t.Fatalf("insert book: %v", err)
		}
	}
	countPseo := func() int {
		n, _ := d.DB.Count(`SELECT count(*) FROM "PseoPage"`)
		return n
	}
	waitFor := func(t *testing.T, want int, what string) {
		t.Helper()
		deadline := time.Now().Add(2 * time.Second)
		for time.Now().Before(deadline) {
			if countPseo() >= want {
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
		t.Fatalf("%s: pseo rows=%d want >=%d", what, countPseo(), want)
	}

	// 开关关闭(缺省) → 建书零 PseoPage
	mkBook(t, "c-fb-off", "玄幻,都市")
	time.Sleep(150 * time.Millisecond)
	if n := countPseo(); n != 0 {
		t.Fatalf("hook must be no-op when disabled, got %d rows", n)
	}

	// 开关开启(历史口径字符串 "1") → 自动生成 ≤5 页
	if err := d.DB.SetSetting("pseoAutoGenerate", "1"); err != nil {
		t.Fatalf("set auto: %v", err)
	}
	mkBook(t, "c-fb-on", "科幻未来,悬疑灵异,游戏竞技")
	waitFor(t, 3, "auto generate on")

	// keyword 全站唯一: 预插同关键词 → 不重复生成
	if _, err := d.DB.Exec(`INSERT INTO "PseoPage" (id,keyword,slug) VALUES ('c-pre','都市生活','pre-slug')`); err != nil {
		t.Fatalf("pre insert: %v", err)
	}
	mkBook(t, "c-fb-dup", "都市生活")
	waitFor(t, 4, "dedupe keeps others")
	time.Sleep(150 * time.Millisecond)
	if n := countPseo(); n != 4 {
		t.Fatalf("duplicate keyword generated: rows=%d want 4", n)
	}

	// JSON 带引号形态("1")亦识别
	if err := d.DB.SetSetting("pseoAutoGenerate", `"1"`); err != nil {
		t.Fatalf("set quoted: %v", err)
	}
	if !d.pseoAutoEnabled() {
		t.Fatalf("quoted \"1\" must enable")
	}
}
