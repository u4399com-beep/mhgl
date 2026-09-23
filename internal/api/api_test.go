// ============================================================
// R56-2b — internal/api 深审回归测试
// 覆盖: 分页/钳制边界(page=0/负数/溢出)、strOf 码点安全截断、
//
//	clientIP XFF 信任收紧、备份导出→恢复 roundtrip(strategy=overwrite/skip)、
//	Task.status=running 恢复期收编、非法入参拒绝。
//
// ============================================================
package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"

	"mhgl/internal/auth"
	"mhgl/internal/store"
)

// testSchema 与 store/store_test.go 同源(测试包各自独立, 不跨包导出)。
const apiTestSchema = `
CREATE TABLE "Task" (id TEXT PRIMARY KEY, name TEXT, ruleId TEXT REFERENCES "Rule"(id), mode TEXT, bookUrl TEXT, bookIds TEXT,
bookIdFrom TEXT, bookIdTo TEXT, listUrl TEXT, listStart INTEGER, listEnd INTEGER, bookStart INTEGER, bookEnd INTEGER,
recrawlMode TEXT, storageMode TEXT, engine TEXT, fetchConfig TEXT, threadMin INTEGER, threadMax INTEGER,
intervalMin INTEGER, intervalMax INTEGER, smartCategory BOOLEAN, smartComplete BOOLEAN, autoSuggest BOOLEAN,
autoRefresh BOOLEAN, refreshIntervalMin INTEGER, status TEXT, progress TEXT, stats TEXT,
createdAt DATETIME, updatedAt DATETIME);
CREATE TABLE "Book" (id TEXT PRIMARY KEY, num INTEGER UNIQUE, name TEXT, author TEXT, categoryId TEXT,
intro TEXT, cover TEXT, status TEXT, keywords TEXT, latestChapter TEXT, wordCount INTEGER, sourceUrl TEXT,
sourceRuleId TEXT, storageMode TEXT, collectedAt DATETIME, createdAt DATETIME, updatedAt DATETIME);
CREATE TABLE "Chapter" (id TEXT PRIMARY KEY, bookId TEXT, idx INTEGER, title TEXT, volume TEXT DEFAULT '',
url TEXT DEFAULT '', content TEXT, storage TEXT DEFAULT 'db', filePath TEXT, wordCount INTEGER DEFAULT 0,
fetched BOOLEAN DEFAULT 0, createdAt DATETIME, updatedAt DATETIME);
CREATE TABLE "Rule" (id TEXT PRIMARY KEY, name TEXT, description TEXT, config TEXT DEFAULT '{}',
enabled BOOLEAN DEFAULT 1, createdAt DATETIME, updatedAt DATETIME);
CREATE TABLE "Setting" (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE "Site" (id TEXT PRIMARY KEY, name TEXT, domain TEXT UNIQUE, themeId TEXT, title TEXT,
description TEXT, keywords TEXT, icbm TEXT, geoRegion TEXT, geoPlacename TEXT, offset INTEGER DEFAULT 0,
isDefault BOOLEAN DEFAULT 0, status BOOLEAN DEFAULT 1, inLinkWheel BOOLEAN DEFAULT 1,
createdAt DATETIME, updatedAt DATETIME);
CREATE TABLE "Category" (id TEXT PRIMARY KEY, name TEXT UNIQUE, sortOrder INTEGER DEFAULT 0, createdAt DATETIME);
CREATE TABLE "TaskLog" (id TEXT PRIMARY KEY, taskId TEXT, level TEXT, message TEXT, createdAt DATETIME);
CREATE TABLE "BookTag" (id TEXT PRIMARY KEY, bookId TEXT, tag TEXT, source TEXT DEFAULT 'suggest',
hits INTEGER DEFAULT 0, UNIQUE(bookId, tag));
CREATE TABLE "DownloadJob" (id TEXT PRIMARY KEY, bookId TEXT, options TEXT DEFAULT '{}',
status TEXT DEFAULT 'pending', filePath TEXT, error TEXT, size INTEGER DEFAULT 0, createdAt DATETIME);
CREATE TABLE "FriendLink" (id TEXT PRIMARY KEY, name TEXT, url TEXT, logo TEXT,
sortOrder INTEGER DEFAULT 0, enabled BOOLEAN DEFAULT 1, createdAt DATETIME, updatedAt DATETIME);
CREATE TABLE "FreeProxy" (id TEXT PRIMARY KEY, protocol TEXT NOT NULL, host TEXT NOT NULL,
port INTEGER NOT NULL, anonymity TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '',
countryName TEXT NOT NULL DEFAULT '', exitIp TEXT NOT NULL DEFAULT '', latencyMs INTEGER,
alive INTEGER NOT NULL DEFAULT 0, successCount INTEGER NOT NULL DEFAULT 0, failCount INTEGER NOT NULL DEFAULT 0,
healthScore INTEGER NOT NULL DEFAULT 0, lastError TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
lastCheckedAt INTEGER, lastSuccessAt INTEGER, lastUsedAt INTEGER, createdAt INTEGER NOT NULL,
updatedAt INTEGER NOT NULL, UNIQUE(protocol, host, port));
`

func newTestDB(t *testing.T) *store.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	raw, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("raw open: %v", err)
	}
	if _, err := raw.Exec(apiTestSchema); err != nil {
		t.Fatalf("schema: %v", err)
	}
	if err := raw.Close(); err != nil {
		t.Fatalf("raw close: %v", err)
	}
	db, err := store.Open(path)
	if err != nil {
		t.Fatalf("store open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// ---------------- middleware 纯函数 ----------------

func TestPageClampBoundaries(t *testing.T) {
	q := url.Values{}
	q.Set("page", "0")
	q.Set("size", "-5")
	page, size := pageClamp(q, 1, 20, 50)
	if page != 1 || size != 1 {
		t.Fatalf("page/size=%d/%d want 1/1 (越界钳到边界而非默认)", page, size)
	}
	q.Set("page", "99999999") // 溢出上限 → 1e6
	q.Set("size", "99999")    // → maxSize
	page, size = pageClamp(q, 1, 20, 50)
	if page != 1_000_000 || size != 50 {
		t.Fatalf("page/size=%d/%d want 1e6/50", page, size)
	}
}

func TestClampIntOfFloatOverflow(t *testing.T) {
	// [R56-2b-fix] 修前 int64(1e19) 实现定义行为 → 命中下边界
	if got := clampIntOf(float64(1e19), 0, -1_000_000, 1_000_000); got != 1_000_000 {
		t.Fatalf("huge positive must clamp to max, got %d", got)
	}
	if got := clampIntOf(float64(-1e19), 0, -1_000_000, 1_000_000); got != -1_000_000 {
		t.Fatalf("huge negative must clamp to min, got %d", got)
	}
	if got := clampIntOf("42", 0, 1, 100); got != 42 {
		t.Fatalf("string number passthrough, got %d", got)
	}
}

func TestStrOfRuneBoundary(t *testing.T) {
	// [R56-2b-fix] 修前字节斩断产出非法 UTF-8
	got := strOf("中文中文中文", 7) // 7 字节 → 回退到 6 字节完整边界
	if got != "中文" {
		t.Fatalf("strOf rune-safe = %q want %q", got, "中文")
	}
	if s := strOf("abcdef", 3); s != "abc" {
		t.Fatalf("ascii truncation broken: %q", s)
	}
}

func TestClientIPXFFTrust(t *testing.T) {
	// [R56-2b-fix] 公网直连不信任 XFF(防伪造轮换绕过限流)
	req := httptest.NewRequest("POST", "/api/auth/login", nil) // RemoteAddr=192.0.2.1:1234 (TEST-NET)
	req.Header.Set("X-Forwarded-For", "9.9.9.9")
	if got := clientIP(req); got != "192.0.2.1" {
		t.Fatalf("public peer must ignore XFF, got %q", got)
	}
	req.RemoteAddr = "127.0.0.1:5555" // 本机反代后 → 采信 XFF
	if got := clientIP(req); got != "9.9.9.9" {
		t.Fatalf("loopback peer must trust XFF, got %q", got)
	}
	req.Header.Set("X-Forwarded-For", "9.9.9.9, 10.0.0.1")
	if got := clientIP(req); got != "9.9.9.9" {
		t.Fatalf("XFF first segment expected, got %q", got)
	}
}

// ---------------- 备份导出 → 恢复 roundtrip ----------------

func seedSourceData(t *testing.T, db *store.DB) {
	t.Helper()
	now := store.NowMS()
	must := func(_ sql.Result, err error) {
		if err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	must(db.Exec(`INSERT INTO "Setting" (key,value) VALUES ('bannedWords','{"enabled":true,"mode":"mask","words":["坏词"]}')`))
	must(db.Exec(`INSERT INTO "Category" (id,name,sortOrder,createdAt) VALUES ('cat1','玄幻',1,?)`, now))
	must(db.Exec(`INSERT INTO "Site" (id,name,domain,themeId,isDefault,status,inLinkWheel,offset,createdAt,updatedAt)
VALUES ('site1','测试站','www.example.com','aijjxs',1,1,1,0,?,?)`, now, now))
	must(db.Exec(`INSERT INTO "Rule" (id,name,description,config,enabled,createdAt,updatedAt)
VALUES ('rule1','规则A','d','{}',1,?,?)`, now, now))
	must(db.Exec(`INSERT INTO "Book" (id,num,name,author,categoryId,intro,cover,status,keywords,latestChapter,
wordCount,sourceUrl,sourceRuleId,storageMode,collectedAt,createdAt,updatedAt)
VALUES ('book1',1,'测试书','作者甲','cat1','简介','','ongoing','kw','第一章',100,'','rule1','db',NULL,?,?)`, now, now))
	must(db.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,volume,url,content,storage,wordCount,fetched,createdAt,updatedAt)
VALUES ('ch1','book1',1,'第一章','卷一','http://x/1','<p>正文甲</p>','db',3,1,?,?)`, now, now))
	must(db.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,volume,url,content,storage,wordCount,fetched,createdAt,updatedAt)
VALUES ('ch2','book1',2,'第二章','','http://x/2','<p>正文乙</p>','db',3,1,?,?)`, now, now))
	must(db.Exec(`INSERT INTO "BookTag" (id,bookId,tag,source,hits) VALUES ('bt1','book1','kw','manual',5)`))
	must(db.Exec(`INSERT INTO "Task" (id,name,ruleId,mode,bookUrl,status,progress,stats,createdAt,updatedAt)
VALUES ('task1','任务1','rule1','single','http://x/b','running','{}','{}',?,?)`, now, now))
	must(db.Exec(`INSERT INTO "DownloadJob" (id,bookId,options,status,filePath,size,createdAt)
VALUES ('dj1','book1','{}','done','web/downloads/a.txt',123,?)`, now))
}

func doBackup(t *testing.T, d Deps) map[string]any {
	t.Helper()
	req := httptest.NewRequest("GET", "/api/admin/backup", nil)
	rec := httptest.NewRecorder()
	d.adminBackup(rec, req)
	if rec.Code != 200 {
		t.Fatalf("backup status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("backup json: %v", err)
	}
	return out
}

func doRestore(t *testing.T, d Deps, backup map[string]any, strategy string) (int, map[string]any) {
	t.Helper()
	body, _ := json.Marshal(backup)
	u := "/api/admin/backup/restore"
	if strategy != "" {
		u += "?strategy=" + strategy
	}
	req := httptest.NewRequest("POST", u, bytes.NewReader(body))
	rec := httptest.NewRecorder()
	d.adminBackupRestore(rec, req)
	if rec.Code != 200 {
		t.Fatalf("restore status=%d body=%s", rec.Code, rec.Body.String())
	}
	var envelope struct {
		OK   bool           `json:"ok"`
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &envelope); err != nil || !envelope.OK {
		t.Fatalf("restore envelope: %v %s", err, rec.Body.String())
	}
	return rec.Code, envelope.Data
}

func TestBackupRestoreRoundtrip(t *testing.T) {
	src := newTestDB(t)
	seedSourceData(t, src)
	dSrc := Deps{DB: src, Auth: auth.NewService("pw", "s", false)}
	backup := doBackup(t, dSrc)

	// ---- 恢复进全新空库(overwrite 缺省: 备份为准) ----
	dst := newTestDB(t)
	dDst := Deps{DB: dst, Auth: auth.NewService("pw", "s", false)}
	_, data := doRestore(t, dDst, backup, "")

	restored, _ := data["restored"].(map[string]any)
	for tbl, want := range map[string]float64{
		"Setting": 1, "Category": 1, "Site": 1, "Rule": 1,
		"Book": 1, "Chapter": 2, "BookTag": 1, "Task": 1, "DownloadJob": 1,
	} {
		if got, _ := restored[tbl].(float64); got != want {
			t.Errorf("restored[%s]=%v want %v (data=%v failed=%v)", tbl, got, want, restored, data["failed"])
		}
	}
	if len(data["failed"].([]any)) != 0 {
		t.Errorf("roundtrip must have no failures: %v", data["failed"])
	}

	// 行级校验: 书/章/设置/任务收编
	var name, status string
	if err := dst.QueryRow(`SELECT name,status FROM "Book" WHERE id='book1'`).Scan(&name, &status); err != nil || name != "测试书" {
		t.Fatalf("book row: %q err=%v", name, err)
	}
	var content string
	if err := dst.QueryRow(`SELECT content FROM "Chapter" WHERE id='ch2'`).Scan(&content); err != nil || content != "<p>正文乙</p>" {
		t.Fatalf("nested chapter content: %q err=%v", content, err)
	}
	if err := dst.QueryRow(`SELECT status FROM "Task" WHERE id='task1'`).Scan(&status); err != nil || status != "paused" {
		t.Fatalf("running task must be normalized to paused, got %q err=%v", status, err)
	}
	var raw string
	if err := dst.QueryRow(`SELECT value FROM "Setting" WHERE key='bannedWords'`).Scan(&raw); err != nil || !strings.Contains(raw, "坏词") {
		t.Fatalf("setting row: %q err=%v", raw, err)
	}

	// ---- skip 策略: 现库行保留, 全量 skipped ----
	backup2 := doBackup(t, dSrc)
	_, data2 := doRestore(t, dDst, backup2, "skip")
	skipped, _ := data2["skipped"].(map[string]any)
	restored2, _ := data2["restored"].(map[string]any)
	if got, _ := restored2["Chapter"].(float64); got != 0 {
		t.Errorf("skip strategy must restore nothing, got %v", restored2)
	}
	if got, _ := skipped["Book"].(float64); got != 1 {
		t.Errorf("skip: Book must be skipped, skipped=%v", skipped)
	}

	// ---- overwrite 再恢复: 幂等(全部覆盖, 无 failed) ----
	_, data3 := doRestore(t, dDst, backup2, "overwrite")
	restored3, _ := data3["restored"].(map[string]any)
	if got, _ := restored3["Chapter"].(float64); got != 2 {
		t.Errorf("overwrite re-restore chapters=%v want 2", restored3)
	}
	if len(data3["failed"].([]any)) != 0 {
		t.Errorf("overwrite re-restore must have no failures: %v", data3["failed"])
	}

	// ---- 非法 strategy / 非法 JSON 拒绝 ----
	req := httptest.NewRequest("POST", "/api/admin/backup/restore?strategy=bogus", strings.NewReader("{}"))
	rec := httptest.NewRecorder()
	dDst.adminBackupRestore(rec, req)
	if rec.Code != 400 {
		t.Errorf("bad strategy must 400, got %d", rec.Code)
	}
	req = httptest.NewRequest("POST", "/api/admin/backup/restore", strings.NewReader("not-json"))
	rec = httptest.NewRecorder()
	dDst.adminBackupRestore(rec, req)
	if rec.Code != 400 {
		t.Errorf("bad json must 400, got %d", rec.Code)
	}
}

func TestRegisterMountsRestore(t *testing.T) {
	// 路由注册面: POST /api/admin/backup/restore 已挂载且受 admin 鉴权保护
	d := Deps{DB: newTestDB(t), Auth: auth.NewService("pw", "s", false)}
	mux := http.NewServeMux()
	Register(mux, d)
	req := httptest.NewRequest("POST", "/api/admin/backup/restore", strings.NewReader("{}"))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 401 {
		t.Errorf("restore without session must 401, got %d", rec.Code)
	}
}
