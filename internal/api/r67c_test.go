// ============================================================
// R67-c — API 层 R66-c 审查发现落地回归
// ⑤DELETE /api/admin/settings/{key}(核心键白名单) ⑦⑧chapter 输出面消毒
// ⑨sitemap 双轨统一(视图/分类面并入) ④主题清单单一来源消费
// ============================================================
package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mhgl/internal/auth"
)

func r67cDeps(t *testing.T) Deps {
	return Deps{DB: newTestDB(t), Auth: auth.NewService("pw", "s", false)}
}

// must67(t)(d.DB.Exec(...)) 用局部包装签名(t 固定捕获)。
func must67(t *testing.T) func(sql.Result, error) {
	return func(_ sql.Result, err error) {
		t.Helper()
		if err != nil {
			t.Fatalf("exec: %v", err)
		}
	}
}

func decodeEnv67(t *testing.T, rec *httptest.ResponseRecorder) (int, map[string]any) {
	t.Helper()
	var env struct {
		OK   bool           `json:"ok"`
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode env: %v body=%s", err, rec.Body.String())
	}
	return rec.Code, env.Data
}

// ---------------- ⑤ DELETE /api/admin/settings/{key} ----------------

// deleteViaMux PathValue 需经 mux 路由才能绑定 {key}, 直调 handler 拿不到路径参数。
func deleteViaMux(d Deps, key string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	mux.HandleFunc("DELETE /api/admin/settings/{key}", d.adminSettingDelete)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("DELETE", "/api/admin/settings/"+key, nil))
	return rec
}

func TestAdminSettingDelete_ProtectedKeyRejected(t *testing.T) {
	d := r67cDeps(t)
	for _, key := range []string{"bannedWords", "seoTemplates", "theme_overrides", "linkwheel",
		"feedback", "pseoAutoGenerate", "proxyPool", "download", "pseudostatic"} {
		rec := deleteViaMux(d, key)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("核心键 %s 删除应 400, got %d body=%s", key, rec.Code, rec.Body.String())
		}
	}
}

func TestAdminSettingDelete_UnknownAndBadKey(t *testing.T) {
	d := r67cDeps(t)
	rec := deleteViaMux(d, "no-such-key")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("不存在键应 404, got %d", rec.Code)
	}
	rec = deleteViaMux(d, "badkey!")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("非法键形态应 400, got %d", rec.Code)
	}
}

func TestAdminSettingDelete_CustomKeyOK(t *testing.T) {
	d := r67cDeps(t)
	must67(t)(d.DB.Exec(`INSERT INTO "Setting" (key,value) VALUES ('probe_junk','{"a":1}')`))
	rec := deleteViaMux(d, "probe_junk")
	if rec.Code != http.StatusOK {
		t.Fatalf("自定义键删除应 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	if _, ok, _ := d.DB.GetSetting("probe_junk"); ok {
		t.Fatalf("删除后键仍存在")
	}
}

// ---------------- ⑦⑧ publicChapter 输出面消毒 ----------------

func TestPublicChapterContentSanitized(t *testing.T) {
	d := r67cDeps(t)
	must67(t)(d.DB.Exec(`INSERT INTO "Book" (id,num,name) VALUES ('bk1',1,'书')`))
	must67(t)(d.DB.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,content,storage) VALUES ('ch1','bk1',1,'章',
'<p>正文</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:go()">链</a>', 'db')`))

	req := httptest.NewRequest("GET", "/api/public/chapter?id=ch1", nil)
	rec := httptest.NewRecorder()
	d.publicChapter(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var env struct {
		Data struct {
			Chapter struct {
				Content string `json:"content"`
			} `json:"chapter"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode: %v body=%s", err, rec.Body.String())
	}
	content := env.Data.Chapter.Content
	for _, bad := range []string{"alert(1)", "onerror", "javascript:go", "script", "href"} {
		if strings.Contains(strings.ToLower(content), strings.ToLower(bad)) {
			t.Fatalf("章节 API 输出未消毒: 含 %q content=%q", bad, content)
		}
	}
	if !strings.Contains(content, `<p>正文</p>`) || !strings.Contains(content, "链") {
		t.Fatalf("安全正文被误删: %q", content)
	}
}

// ---------------- ⑨ sitemap 双轨统一: 视图/分类面并入 ----------------

func TestPublicSitemapIncludesViewsAndCategories(t *testing.T) {
	d := r67cDeps(t)
	// 伪静态预设与生产形态一致(numeric → /book/{num}.html): APIPseudoPreset 缺 Setting 时
	// 回落 query, 书籍面即变查询形态, /book/1001.html 断言需此键
	must67(t)(d.DB.Exec(`INSERT INTO "Setting" (key,value) VALUES ('pseudostatic','{"preset":"numeric"}')`))
	must67(t)(d.DB.Exec(`INSERT INTO "Category" (id,name,sortOrder) VALUES ('cat1','玄幻',1)`))
	must67(t)(d.DB.Exec(`INSERT INTO "Book" (id,num,name,updatedAt) VALUES ('bk1',1001,'书',1700000000000)`))
	must67(t)(d.DB.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,content) VALUES ('ch1','bk1',1,'章','内容')`))

	req := httptest.NewRequest("GET", "http://x.test/api/public/sitemap", nil)
	rec := httptest.NewRecorder()
	d.publicSitemap(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d", rec.Code)
	}
	body := rec.Body.String()
	for _, want := range []string{
		`/?view=fulltext`, `/?view=ranking`, `/?view=category&amp;cat=cat1`, // [R67-c] 并入面
		`<loc>http://x.test/`, // 首页(loc 内容转义, 标签本身不转义)
		`/book/1001.html`,     // 书籍面
		`<changefreq>`,        // API 轨口径(changefreq 元素)
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("sitemap 缺 %s\n%s", want, body)
		}
	}

	// ?page=1 分页口径与默认单页一致(视图/分类面同在)
	req2 := httptest.NewRequest("GET", "http://x.test/api/public/sitemap?page=1", nil)
	rec2 := httptest.NewRecorder()
	d.publicSitemap(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("page=1 status=%d", rec2.Code)
	}
	body2 := rec2.Body.String()
	for _, want := range []string{`/?view=fulltext`, `/?view=category&amp;cat=cat1`} {
		if !strings.Contains(body2, want) {
			t.Fatalf("page=1 sitemap 缺 %s\n%s", want, body2)
		}
	}
}

// ---------------- ④ 主题清单/合法性单一来源消费 ----------------

func TestValidThemeViaWebRegistry(t *testing.T) {
	for _, id := range []string{"aijjxs", "pili", "shipsay", "trxsw", "x33yq"} {
		if got := validTheme(id); got != id {
			t.Fatalf("validTheme(%q)=%q", id, got)
		}
	}
	if got := validTheme("bogus-theme"); got != "aijjxs" {
		t.Fatalf("非法主题应回落 aijjxs, got %q", got)
	}
	if got := validTheme(""); got != "aijjxs" {
		t.Fatalf("空主题应回落 aijjxs, got %q", got)
	}
}

func TestAdminThemesListFromRegistry(t *testing.T) {
	d := r67cDeps(t)
	rec := httptest.NewRecorder()
	d.adminThemesList(rec, httptest.NewRequest("GET", "/api/admin/themes", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d", rec.Code)
	}
	var env struct {
		OK   bool            `json:"ok"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode env: %v %s", err, rec.Body.String())
	}
	var items []map[string]any
	if err := json.Unmarshal(env.Data, &items); err != nil {
		t.Fatalf("themes list 形态: %v %s", err, env.Data)
	}
	if len(items) != 11 {
		t.Fatalf("主题清单=%d, want 11(单一来源)", len(items))
	}
	if items[0]["id"] != "aijjxs" {
		t.Fatalf("首项=%v, want aijjxs(缺省主题置首)", items[0]["id"])
	}
	for _, it := range items {
		if it["name"] == "" || it["desc"] == "" {
			t.Fatalf("主题 %v 名称/描述缺省", it["id"])
		}
	}
	// q 过滤仍生效
	rec2 := httptest.NewRecorder()
	d.adminThemesList(rec2, httptest.NewRequest("GET", "/api/admin/themes?q=x33", nil))
	var env2 struct {
		OK   bool            `json:"ok"`
		Data json.RawMessage `json:"data"`
	}
	_ = json.Unmarshal(rec2.Body.Bytes(), &env2)
	var filtered []map[string]any
	_ = json.Unmarshal(env2.Data, &filtered)
	if len(filtered) != 1 || filtered[0]["id"] != "x33yq" {
		t.Fatalf("q=x33 过滤结果: %s", env2.Data)
	}
}

// ---------------- 违禁词配置结构化编辑(语义 UI 背书端点) ----------------

func TestBannedWordsPutShape(t *testing.T) {
	d := r67cDeps(t)
	body := strings.NewReader(`{"enabled":true,"mode":"remove","words":["坏词A","坏词A","坏词B","","  坏词C  "]}`)
	req := httptest.NewRequest("PUT", "/api/admin/banned-words", body)
	rec := httptest.NewRecorder()
	d.adminBannedWordsPut(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var raw string
	if err := d.DB.QueryRow(`SELECT value FROM "Setting" WHERE key='bannedWords'`).Scan(&raw); err != nil {
		t.Fatalf("read setting: %v", err)
	}
	if !strings.Contains(raw, "坏词A") || !strings.Contains(raw, "坏词B") || !strings.Contains(raw, "坏词C") {
		t.Fatalf("词表形态异常: %s", raw)
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		t.Fatalf("setting not json: %v", err)
	}
	if words, ok := m["words"].([]any); !ok || len(words) != 3 {
		t.Fatalf("去重/空行/trim 后应 3 词: %s", raw)
	}
}
