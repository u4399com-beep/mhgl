// ============================================================
// R58-2c — api/store/auth 未审面深审回归
//
//	① adminRulesBatch 整批原子: 预检 409 不半删 + FK 竞态事务回滚机制
//	② WebResolveCatID 分类锚解析(errors.Is 化后语义锁定)
//	③ publicCover 边界: 空文件/畸形 jpg 头/超大文件体积防线/穿越沙箱回归
//	④ sitemap 超长 page 参数硬ening 不改变行为
//
// ============================================================
package api

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mhgl/internal/auth"
	"mhgl/internal/store"
)

func mustExec(t *testing.T, db *store.DB, q string, args ...any) {
	t.Helper()
	if _, err := db.Exec(q, args...); err != nil {
		t.Fatalf("exec %s: %v", q, err)
	}
}

// ---------------- ① 规则批量删除原子性 ----------------

func seedRulesForBatch(t *testing.T, db *store.DB, suffix string) (ra, rb string) {
	t.Helper()
	now := store.NowMS()
	ra, rb = "c-rule-a-"+suffix, "c-rule-b-"+suffix
	mustExec(t, db, `INSERT INTO "Rule" (id,name,description,config,enabled,createdAt,updatedAt)
VALUES (?,'规则甲','d','{}',1,?,?), (?,'规则乙','d','{}',1,?,?)`, ra, now, now, rb, now, now)
	mustExec(t, db, `INSERT INTO "Setting" (key,value) VALUES ('calibration:`+ra+`','{"n":1}')`)
	// 任务引用 规则乙 → 真实 FK(apiTestSchema Task.ruleId REFERENCES Rule)
	mustExec(t, db, `INSERT INTO "Task" (id,name,ruleId,mode,status,createdAt,updatedAt)
VALUES ('c-task-ref-`+suffix+`','任务','`+rb+`','single','paused',?,?)`, now, now)
	return ra, rb
}

func postRulesBatch(t *testing.T, d Deps, ids []string) (int, map[string]any) {
	t.Helper()
	body, _ := json.Marshal(map[string]any{"action": "delete", "ids": ids})
	req := httptest.NewRequest("POST", "/api/admin/rules/batch", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	d.adminRulesBatch(rec, req)
	var env struct {
		OK    bool           `json:"ok"`
		Error string         `json:"error"`
		Data  map[string]any `json:"data"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &env)
	if env.OK {
		return rec.Code, env.Data
	}
	return rec.Code, map[string]any{"error": env.Error}
}

func ruleExists(t *testing.T, db *store.DB, id string) bool {
	t.Helper()
	_, ok, err := db.QueryMap(`SELECT id FROM "Rule" WHERE id=?`, id)
	if err != nil {
		t.Fatalf("rule exists: %v", err)
	}
	return ok
}

func TestRulesBatchDeleteAtomic(t *testing.T) {
	db := newTestDB(t)
	d := Deps{DB: db, Auth: auth.NewService("pw", "s", false)}
	ra, rb := seedRulesForBatch(t, db, "1")

	// ---- 预检: 被引用规则在批内 → 409 且两条规则都不删(整批拒绝无半删) ----
	code, data := postRulesBatch(t, d, []string{ra, rb})
	if code != 409 {
		t.Fatalf("referenced batch must 409, got %d (%v)", code, data)
	}
	if !ruleExists(t, db, ra) || !ruleExists(t, db, rb) {
		t.Fatalf("409 must delete nothing, exists(a)=%v exists(b)=%v", ruleExists(t, db, ra), ruleExists(t, db, rb))
	}

	// ---- FK 竞态窗口(预检通过后引用才出现)的事务回滚机制: 与 handler 同款语句序 ----
	// 先移除引用使预检可通过, 再在事务内复现「删 a 成功 → 删 b 撞 FK → 回滚 → a 复活」
	mustExec(t, db, `DELETE FROM "Task" WHERE id='c-task-ref-1'`)
	code, data = postRulesBatch(t, d, []string{ra})
	if code != 200 {
		t.Fatalf("clean batch must 200, got %d (%v)", code, data)
	}
	if ruleExists(t, db, ra) {
		t.Fatalf("unreferenced rule must be deleted")
	}
	if _, ok, _ := db.QueryMap(`SELECT key FROM "Setting" WHERE key=?`, "calibration:"+ra); ok {
		t.Fatalf("calibration setting must be cleaned with rule")
	}

	// 重建一组, 恢复引用 b 的事务后, 事务内先删 a 再删 b 撞 FK → 回滚 → a 仍在
	ra2, rb2 := seedRulesForBatch(t, db, "2")
	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	if _, err := tx.Exec(`DELETE FROM "Rule" WHERE id=?`, ra2); err != nil {
		t.Fatalf("tx delete a: %v", err)
	}
	if _, err := tx.Exec(`DELETE FROM "Rule" WHERE id=?`, rb2); err == nil || !strings.Contains(err.Error(), "FOREIGN KEY") {
		t.Fatalf("tx delete referenced rule must fail with FK, got %v", err)
	}
	_ = tx.Rollback()
	if !ruleExists(t, db, ra2) {
		t.Fatalf("rollback must restore rule a (整批原子机制)")
	}
}

// ---------------- ② WebResolveCatID 分类锚 ----------------

func TestWebResolveCatIDAnchors(t *testing.T) {
	db := newTestDB(t)
	now := store.NowMS()
	mustExec(t, db, `INSERT INTO "Category" (id,name,sortOrder,createdAt) VALUES ('cat9','玄幻',1,?)`, now)
	mustExec(t, db, `INSERT INTO "Book" (id,num,name,author,categoryId,storageMode,createdAt,updatedAt)
VALUES ('bk9',1,'书甲','作者','cat9','db',?,?)`, now, now)

	if id, err := db.WebResolveCatID("cat:玄幻"); err != nil || id != "cat9" {
		t.Fatalf("cat anchor by name = %q err=%v", id, err)
	}
	if id, err := db.WebResolveCatID("cat:不存在分类"); err != nil || id != "__no_match__" {
		t.Fatalf("missing name must be __no_match__, got %q err=%v", id, err)
	}
	if id, _ := db.WebResolveCatID(""); id != "" {
		t.Fatalf("empty anchor passthrough, got %q", id)
	}
	if id, _ := db.WebResolveCatID("cat9"); id != "cat9" {
		t.Fatalf("raw id passthrough, got %q", id)
	}
	// 列表面锚: 未命中锚 → 空结果不报错; 命中锚 → 1 行
	if _, total, err := db.WebListBooks(1, 10, "cat:不存在分类", "", "", ""); err != nil || total != 0 {
		t.Fatalf("no-match anchor list total=%d err=%v", total, err)
	}
	rows, total, err := db.WebListBooks(1, 10, "cat:玄幻", "", "", "")
	if err != nil || total != 1 || len(rows) != 1 || rows[0]["id"] != "bk9" {
		t.Fatalf("matched anchor list rows=%v total=%d err=%v", rows, total, err)
	}
}

// ---------------- ③ publicCover 边界 ----------------

func withTempCoverDir(t *testing.T) string {
	t.Helper()
	old := coverDirEnv
	dir := t.TempDir()
	coverDirEnv = dir
	t.Cleanup(func() { coverDirEnv = old })
	return dir
}

func TestPublicCoverServeEdges(t *testing.T) {
	dir := withTempCoverDir(t)
	d := Deps{DB: newTestDB(t), Auth: auth.NewService("pw", "s", false)}

	get := func(file string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest("GET", "/api/public/cover?file="+file, nil)
		rec := httptest.NewRecorder()
		d.publicCover(rec, req)
		return rec
	}

	// 空文件: 200 + 空 body + 按 .jpg 出 image/jpeg(不 500, 浏览器 onerror 兜底)
	if err := os.WriteFile(filepath.Join(dir, "empty.jpg"), nil, 0o644); err != nil {
		t.Fatalf("write empty: %v", err)
	}
	rec := get("empty.jpg")
	if rec.Code != 200 || rec.Body.Len() != 0 || rec.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatalf("empty cover: code=%d len=%d ctype=%s", rec.Code, rec.Body.Len(), rec.Header().Get("Content-Type"))
	}

	// 畸形 jpg 头(文本字节冒充 .jpg): 200 直出 + nosniff(浏览器解码失败走 onerror, 无脚本风险)
	if err := os.WriteFile(filepath.Join(dir, "fake.jpg"), []byte("GIF89a-not-a-jpeg\xff\xfe"), 0o644); err != nil {
		t.Fatalf("write fake: %v", err)
	}
	rec = get("fake.jpg")
	if rec.Code != 200 || rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("malformed header cover: code=%d nosniff=%q", rec.Code, rec.Header().Get("X-Content-Type-Options"))
	}

	// 超大文件(>16MB 稀疏文件): 404 拒绝, 不整读进内存
	big, err := os.Create(filepath.Join(dir, "huge.jpg"))
	if err != nil {
		t.Fatalf("create huge: %v", err)
	}
	if _, err := big.Seek(maxCoverBytes+1, 0); err != nil {
		t.Fatalf("seek: %v", err)
	}
	if _, err := big.Write([]byte{0}); err != nil {
		t.Fatalf("write tail: %v", err)
	}
	_ = big.Close()
	rec = get("huge.jpg")
	if rec.Code != 404 {
		t.Fatalf("oversized cover must 404 (体积防线), got %d", rec.Code)
	}

	// 体积内正常文件不回归: <16MB 仍 200
	if err := os.WriteFile(filepath.Join(dir, "ok.jpg"), bytes.Repeat([]byte{0xFF, 0xD8}, 100), 0o644); err != nil {
		t.Fatalf("write ok: %v", err)
	}
	rec = get("ok.jpg")
	if rec.Code != 200 || rec.Body.Len() != 200 {
		t.Fatalf("normal cover: code=%d len=%d", rec.Code, rec.Body.Len())
	}

	// 沙箱回归: 穿越/非法后缀仍拒绝
	if rec := get("..%2F..%2Fsecret.jpg"); rec.Code != 400 {
		t.Fatalf("traversal must 400, got %d", rec.Code)
	}
	if rec := get("evil.txt"); rec.Code != 400 {
		t.Fatalf("non-image suffix must 400, got %d", rec.Code)
	}
	if rec := get("missing.jpg"); rec.Code != 404 {
		t.Fatalf("missing cover must 404, got %d", rec.Code)
	}
}

// ---------------- ④ sitemap 参数硬化 ----------------

func TestSitemapHugePageParamStillOK(t *testing.T) {
	d := Deps{DB: newTestDB(t), Auth: auth.NewService("pw", "s", false)}
	req := httptest.NewRequest("GET", "/api/public/sitemap?page=999999999999999999999999", nil)
	rec := httptest.NewRecorder()
	d.publicSitemap(rec, req)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "<urlset") {
		t.Fatalf("huge page param must clamp to bounded page and 200, got %d", rec.Code)
	}
	req = httptest.NewRequest("GET", "/api/public/sitemap", nil)
	rec = httptest.NewRecorder()
	d.publicSitemap(rec, req)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "<urlset") {
		t.Fatalf("default sitemap must 200 urlset, got %d", rec.Code)
	}
}
