// ============================================================
// R57-2b — 备份→清库→恢复→校验 全回路 E2E + 深审回归测试
//
//	TestBackupRestoreFullLoopE2E   导出→同库清空→overwrite 灌回→counts 一致
//	                              →running→paused 归一→Setting JSON 往返
//	                              →skip 二遍(全 skip, 现库不动)
//	TestPublicResolveAllPseudoForms resolve 各伪静态形态(数字/bN/cN/compact/cuid/斜体)
//	TestCountPerDay7dBucketsLocalDays stats 7 日曲线本地自然日分桶口径
//	TestPublicCoverFormatsAndSandbox 封面端点多格式(R57-2b-fix)+穿越沙箱
//	TestUpsertBookTagAtomic         标签 upsert 原子性(R57-2b-fix)
//
// ============================================================
package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"mhgl/internal/auth"
	"mhgl/internal/store"
)

// seedLoopData 全回路种子: 2 书/4 章/2 标签/1 规则/1 站/1 分类/3 设置/1 友链/
// 3 任务(running|paused|done)/1 下载任务。
func seedLoopData(t *testing.T, db *store.DB) {
	t.Helper()
	now := store.NowMS()
	must := func(_ sql.Result, err error) {
		if err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	must(db.Exec(`INSERT INTO "Setting" (key,value) VALUES ('bannedWords','{"enabled":true,"mode":"mask","words":["坏词"]}')`))
	must(db.Exec(`INSERT INTO "Setting" (key,value) VALUES ('pseudostatic','{"preset":"alnum"}')`))
	must(db.Exec(`INSERT INTO "Setting" (key,value) VALUES ('download','{"siteName":"回环站","siteUrl":"https://loop.example.com"}')`))
	must(db.Exec(`INSERT INTO "Category" (id,name,sortOrder,createdAt) VALUES ('cat1','玄幻',1,?)`, now))
	must(db.Exec(`INSERT INTO "Site" (id,name,domain,themeId,isDefault,status,inLinkWheel,offset,createdAt,updatedAt)
VALUES ('site1','回环站','loop.example.com','aijjxs',1,1,1,0,?,?)`, now, now))
	must(db.Exec(`INSERT INTO "Rule" (id,name,description,config,enabled,createdAt,updatedAt)
VALUES ('rule1','规则A','d','{}',1,?,?)`, now, now))
	must(db.Exec(`INSERT INTO "FriendLink" (id,name,url,logo,sortOrder,enabled,createdAt,updatedAt)
VALUES ('fl1','友链甲','https://friend.example.com','',1,1,?,?)`, now, now))
	for _, bk := range []struct{ id, name string }{{"book1", "吞天神帝"}, {"book2", "万古神帝"}} {
		must(db.Exec(`INSERT INTO "Book" (id,num,name,author,categoryId,intro,cover,status,keywords,latestChapter,
wordCount,sourceUrl,sourceRuleId,storageMode,collectedAt,createdAt,updatedAt)
VALUES (?,?,'中文《》书名','作者甲','cat1','简介','','ongoing','kw','第一章',100,'','rule1','db',NULL,?,?)`,
			bk.id, bk.name, now, now))
	}
	for i, ch := range []struct{ id, book, title, content string }{
		{"ch1", "book1", "第一章", "<p>正文甲</p>"},
		{"ch2", "book1", "第二章", "<p>正文乙</p>"},
		{"ch3", "book2", "第一回", "<p>正文丙</p>"},
		{"ch4", "book2", "第二回", "<p>正文丁</p>"},
	} {
		must(db.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,volume,url,content,storage,wordCount,fetched,createdAt,updatedAt)
VALUES (?,?,?,?,?,?,?,'db',3,1,?,?)`, ch.id, ch.book, i+1, ch.title, "", "http://x/"+ch.id, ch.content, now, now))
	}
	must(db.Exec(`INSERT INTO "BookTag" (id,bookId,tag,source,hits) VALUES ('bt1','book1','玄幻','manual',5)`))
	must(db.Exec(`INSERT INTO "BookTag" (id,bookId,tag,source,hits) VALUES ('bt2','book1','热血','suggest',2)`))
	must(db.Exec(`INSERT INTO "Task" (id,name,ruleId,mode,bookUrl,status,progress,stats,createdAt,updatedAt)
VALUES ('task1','任务1','rule1','single','http://x/b','running','{"currentBook":"吞天神帝"}','{}',?,?)`, now, now))
	must(db.Exec(`INSERT INTO "Task" (id,name,ruleId,mode,bookUrl,status,progress,stats,createdAt,updatedAt)
VALUES ('task2','任务2','rule1','single','http://x/c','paused','{}','{}',?,?)`, now, now))
	must(db.Exec(`INSERT INTO "Task" (id,name,ruleId,mode,bookUrl,status,progress,stats,createdAt,updatedAt)
VALUES ('task3','任务3','rule1','single','http://x/d','done','{}','{}',?,?)`, now, now))
	must(db.Exec(`INSERT INTO "DownloadJob" (id,bookId,options,status,filePath,size,createdAt)
VALUES ('dj1','book1','{}','done','web/downloads/a.txt',123,?)`, now))
}

// loopCounts 备份 counts 键 → 实体表名。
var loopCounts = map[string]string{
	"settings": "Setting", "categories": "Category", "sites": "Site", "friendLinks": "FriendLink",
	"rules": "Rule", "books": "Book", "chapters": "Chapter", "tasks": "Task", "downloadJobs": "DownloadJob",
}

func dbCountOf(t *testing.T, db *store.DB, tbl string) int {
	t.Helper()
	n, err := db.Count(`SELECT count(*) FROM "` + tbl + `"`)
	if err != nil {
		t.Fatalf("count %s: %v", tbl, err)
	}
	return n
}

func clearAllTables(t *testing.T, db *store.DB) {
	t.Helper()
	for _, tbl := range []string{"BookTag", "Chapter", "TaskLog", "DownloadJob", "Task", "Book", "Rule", "Site", "Category", "FriendLink", "Setting"} {
		if _, err := db.Exec(`DELETE FROM "` + tbl + `"`); err != nil {
			t.Fatalf("clear %s: %v", tbl, err)
		}
	}
}

func TestBackupRestoreFullLoopE2E(t *testing.T) {
	db := newTestDB(t)
	d := Deps{DB: db, Auth: auth.NewService("pw", "s", false)}
	seedLoopData(t, db)

	// ---- ① 导出: counts 与种子全量一致 ----
	backup := doBackup(t, d)
	counts, _ := backup["counts"].(map[string]any)
	for k, tbl := range loopCounts {
		want := dbCountOf(t, db, tbl)
		if got, _ := counts[k].(float64); int(got) != want {
			t.Fatalf("backup counts[%s]=%v want %d", k, got, want)
		}
	}

	// ---- ② 同库全表清空 ----
	clearAllTables(t, db)
	for _, tbl := range loopCounts {
		if n := dbCountOf(t, db, tbl); n != 0 {
			t.Fatalf("clear: %s still has %d rows", tbl, n)
		}
	}

	// ---- ③ strategy=overwrite 灌回: 逐表计数与 counts 一致 ----
	_, data := doRestore(t, d, backup, "overwrite")
	if len(data["failed"].([]any)) != 0 {
		t.Fatalf("overwrite loop restore must have no failures: %v", data["failed"])
	}
	for k, tbl := range loopCounts {
		want := int(counts[k].(float64))
		if got := dbCountOf(t, db, tbl); got != want {
			t.Fatalf("restore counts[%s]=%d want %d (restored=%v)", k, got, want, data["restored"])
		}
	}
	if got := dbCountOf(t, db, "BookTag"); got != 2 {
		t.Fatalf("BookTag=%d want 2", got)
	}

	// ---- ④ 行级校验: running→paused 归一 / 内容原样 / 任务 JSON 字段往返 ----
	var st string
	if err := db.QueryRow(`SELECT status FROM "Task" WHERE id='task1'`).Scan(&st); err != nil || st != "paused" {
		t.Fatalf("task1 running must normalize to paused, got %q err=%v", st, err)
	}
	if err := db.QueryRow(`SELECT status FROM "Task" WHERE id='task2'`).Scan(&st); err != nil || st != "paused" {
		t.Fatalf("task2 paused stays paused, got %q err=%v", st, err)
	}
	if err := db.QueryRow(`SELECT status FROM "Task" WHERE id='task3'`).Scan(&st); err != nil || st != "done" {
		t.Fatalf("task3 done stays done, got %q err=%v", st, err)
	}
	var content, progress string
	if err := db.QueryRow(`SELECT content FROM "Chapter" WHERE id='ch4'`).Scan(&content); err != nil || content != "<p>正文丁</p>" {
		t.Fatalf("chapter content roundtrip: %q err=%v", content, err)
	}
	if err := db.QueryRow(`SELECT progress FROM "Task" WHERE id='task1'`).Scan(&progress); err != nil || progress != `{"currentBook":"吞天神帝"}` {
		t.Fatalf("task progress roundtrip: %q err=%v", progress, err)
	}

	// ---- ⑤ Setting JSON 字符串往返: 读回为结构化对象(非串值) ----
	settings := d.readAllSettings()
	bw, _ := settings["bannedWords"].(map[string]any)
	if bw == nil || bw["enabled"] != true {
		t.Fatalf("bannedWords must parse back to object, got %v", settings["bannedWords"])
	}
	if arr, _ := bw["words"].([]any); len(arr) != 1 || arr[0] != "坏词" {
		t.Fatalf("bannedWords.words roundtrip broken: %v", bw["words"])
	}

	// ---- ⑥ strategy=skip 二遍: 全部 skip, 现库逐字节不动 ----
	_, data2 := doRestore(t, d, backup, "skip")
	restored2, _ := data2["restored"].(map[string]any)
	for tbl := range restored2 {
		if n, _ := restored2[tbl].(float64); n != 0 {
			t.Fatalf("skip must restore nothing, restored[%s]=%v", tbl, restored2)
		}
	}
	skipped2, _ := data2["skipped"].(map[string]any)
	for k, tbl := range loopCounts {
		want := int(counts[k].(float64))
		if got, _ := skipped2[tbl].(float64); int(got) != want {
			t.Fatalf("skip skipped[%s]=%v want %d", k, got, want)
		}
		if got := dbCountOf(t, db, tbl); got != want {
			t.Fatalf("skip must not mutate db: %s=%d want %d", tbl, got, want)
		}
	}

	// ---- ⑦ Setting 非串值防御: 备份里 value 为对象 → 恢复时 JSON 字符串化 ----
	seeded, _ := json.Marshal(backup)
	var tp map[string]any
	if err := json.Unmarshal(seeded, &tp); err != nil {
		t.Fatal(err)
	}
	tpData := tp["data"].(map[string]any)
	tpSettings := tpData["settings"].([]any)
	for _, row := range tpSettings {
		rm := row.(map[string]any)
		if rm["key"] == "pseudostatic" {
			rm["value"] = map[string]any{"preset": "numeric"} // 模拟非字符串 value 的备份
		}
	}
	tampered, _ := json.Marshal(tp)
	clearAllTables(t, db)
	req := httptest.NewRequest("POST", "/api/admin/backup/restore", bytes.NewReader(tampered))
	rec := httptest.NewRecorder()
	d.adminBackupRestore(rec, req)
	if rec.Code != 200 {
		t.Fatalf("tampered restore status=%d body=%s", rec.Code, rec.Body.String())
	}
	var raw string
	if err := db.QueryRow(`SELECT value FROM "Setting" WHERE key='pseudostatic'`).Scan(&raw); err != nil || raw != `{"preset":"numeric"}` {
		t.Fatalf("non-string setting value must JSON-ify on restore, got %q err=%v", raw, err)
	}
	if got := d.DB.APIPseudoPreset(); got != "numeric" {
		t.Fatalf("pseudo preset readback=%q want numeric", got)
	}
}

// ---------------- resolve 各伪静态形态 ----------------

func TestPublicResolveAllPseudoForms(t *testing.T) {
	db := newTestDB(t)
	d := Deps{DB: db, Auth: auth.NewService("pw", "s", false)}
	now := store.NowMS()
	must := func(_ sql.Result, err error) {
		if err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	// cuid 形态书/章(≥16 位小写字母数字)
	cuidBook := "cbookcuid1234567890"
	cuidCh := "cchaptercuid1234567"
	must(db.Exec(`INSERT INTO "Book" (id,num,name,author,categoryId,intro,cover,status,keywords,latestChapter,
wordCount,sourceUrl,sourceRuleId,storageMode,collectedAt,createdAt,updatedAt)
VALUES (?,1001,'甲书','作者','cat1','','','ongoing','','',0,'',NULL,'db',NULL,?,?)`, cuidBook, now, now))
	must(db.Exec(`INSERT INTO "Book" (id,num,name,author,categoryId,intro,cover,status,keywords,latestChapter,
wordCount,sourceUrl,sourceRuleId,storageMode,collectedAt,createdAt,updatedAt)
VALUES (?,1002,'乙书','作者','cat1','','','ongoing','','',0,'',NULL,'db',NULL,?,?)`, "book2", now, now))
	must(db.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,content,storage,wordCount,fetched,createdAt,updatedAt)
VALUES (?,?,?,?,?,'db',0,0,?,?)`, "chA", cuidBook, 1, "第一章", "", now, now))
	must(db.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,content,storage,wordCount,fetched,createdAt,updatedAt)
VALUES (?,?,?,?,?,'db',0,0,?,?)`, "chB", "book2", 1, "第一章", "", now, now))
	must(db.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,content,storage,wordCount,fetched,createdAt,updatedAt)
VALUES (?,?,?,?,?,'db',0,0,?,?)`, "chC", cuidBook, 2, "第二章", "", now, now))
	// cuid 形态章节 id(resolve cuid 路径用)
	must(db.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,content,storage,wordCount,fetched,createdAt,updatedAt)
VALUES (?,?,?,?,?,'db',0,0,?,?)`, cuidCh, cuidBook, 3, "第三章", "", now, now))

	type want struct {
		view   string
		bookID string
		chID   string
	}
	cases := []struct {
		path string
		want want
	}{
		{"/book/1001.html", want{"book", cuidBook, ""}},
		{"/book/1001", want{"book", cuidBook, ""}},
		{"/book/1001/", want{"book", cuidBook, ""}},
		{"/book/b1001.html", want{"book", cuidBook, ""}},
		{"/book/" + cuidBook + ".html", want{"book", cuidBook, ""}},
		{"/read/1001/1.html", want{"read", cuidBook, "chA"}},
		{"/read/1001/1", want{"read", cuidBook, "chA"}},
		{"/read/1001/2/", want{"read", cuidBook, "chC"}},
		{"/read/b1001/c1.html", want{"read", cuidBook, "chA"}},
		{"/read/1001_1.html", want{"read", cuidBook, "chA"}}, // compact
		{"/read/1001_1", want{"read", cuidBook, "chA"}},
		{"/read/" + cuidBook + "/" + cuidCh + ".html", want{"read", cuidBook, cuidCh}},
		{"/read/1002/1.html", want{"read", "book2", "chB"}},
		{"/read/1002/99.html", want{"", "", ""}},  // 越界章 → nil
		{"/read/9999/1.html", want{"", "", ""}},   // 无此书 → nil
		{"/other/1001.html", want{"", "", ""}},    // 非 book/read 段 → nil
		{"/book/<script>.html", want{"", "", ""}}, // 非法 token → nil
	}
	for _, c := range cases {
		u := "/api/public/resolve?path=" + url.QueryEscape(c.path)
		rec := httptest.NewRecorder()
		d.publicResolve(rec, httptest.NewRequest("GET", u, nil))
		if rec.Code != 200 {
			t.Errorf("%s: status=%d body=%s", c.path, rec.Code, rec.Body.String())
			continue
		}
		var env struct {
			OK   bool            `json:"ok"`
			Data *map[string]any `json:"data"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
			t.Errorf("%s: json: %v", c.path, err)
			continue
		}
		if c.want.view == "" {
			if env.Data != nil {
				t.Errorf("%s: want nil resolve, got %v", c.path, *env.Data)
			}
			continue
		}
		if env.Data == nil {
			t.Errorf("%s: want %v, got nil", c.path, c.want)
			continue
		}
		got := *env.Data
		if got["view"] != c.want.view || got["bookId"] != c.want.bookID {
			t.Errorf("%s: got view/book=%v/%v want %v/%v", c.path, got["view"], got["bookId"], c.want.view, c.want.bookID)
		}
		if c.want.chID != "" && got["chapterId"] != c.want.chID {
			t.Errorf("%s: chapterId=%v want %v", c.path, got["chapterId"], c.want.chID)
		}
	}
}

// ---------------- stats 7 日曲线: 本地自然日分桶(含今日) ----------------

func TestCountPerDay7dBucketsLocalDays(t *testing.T) {
	db := newTestDB(t)
	d := Deps{DB: db, Auth: auth.NewService("pw", "s", false)}
	now := time.Now()
	must := func(_ sql.Result, err error) {
		if err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	must(db.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,content,storage,wordCount,fetched,createdAt,updatedAt)
VALUES ('ch1','b',1,'t','','db',0,0,?,?)`, now.UnixMilli(), now.UnixMilli()))
	old := now.AddDate(0, 0, -8).UnixMilli() // 8 天前: 任何桶都不应出现
	must(db.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,content,storage,wordCount,fetched,createdAt,updatedAt)
VALUES ('ch2','b',2,'t','','db',0,0,?,?)`, old, old))

	out := countPerDay7d(d, "Chapter")
	if len(out) != 7 {
		t.Fatalf("buckets=%d want 7", len(out))
	}
	for i := 0; i < 6; i++ {
		if n, _ := out[i]["count"].(int); n != 0 {
			t.Errorf("bucket[%d](%v) must be 0, got %v", i, out[i]["day"], out[i]["count"])
		}
	}
	if out[6]["day"] != now.Format("01-02") {
		t.Errorf("last bucket day=%v want %v (本地自然日含今日)", out[6]["day"], now.Format("01-02"))
	}
	if n, _ := out[6]["count"].(int); n != 1 {
		t.Errorf("today bucket=%v want 1", out[6]["count"])
	}
	books := countPerDay7d(d, "Book")
	if n, _ := books[6]["count"].(int); n != 0 {
		t.Errorf("books today bucket=%v want 0", books[6]["count"])
	}
}

// ---------------- 封面端点: 多格式 + 穿越沙箱([R57-2b-fix]) ----------------

func TestPublicCoverFormatsAndSandbox(t *testing.T) {
	oldDir := coverDirEnv
	dir := t.TempDir()
	coverDirEnv = dir
	t.Cleanup(func() { coverDirEnv = oldDir })

	if err := os.WriteFile(filepath.Join(dir, "b1.jpg"), []byte{0xFF, 0xD8, 0xFF, 0xE0}, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "b2.webp"), []byte("RIFF####"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "evil.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	d := Deps{DB: newTestDB(t), Auth: auth.NewService("pw", "s", false)}
	cases := []struct {
		file   string
		code   int
		ctypes string
	}{
		{"b1.jpg", 200, "image/jpeg"},
		{"covers/b1.jpg", 200, "image/jpeg"}, // 带 covers/ 前缀剥掉
		{"b2.webp", 200, "image/webp"},
		{"b1.jpeg", 404, ""},     // 合法后缀但文件不存在 → 404
		{"b1.txt", 400, ""},      // 非图片后缀拒绝
		{"../evil.txt", 400, ""}, // 穿越 → 400
		{"..%2Fevil.txt", 400, ""},
	}
	for _, c := range cases {
		rec := httptest.NewRecorder()
		d.publicCover(rec, httptest.NewRequest("GET", "/api/public/cover?file="+url.QueryEscape(c.file), nil))
		if rec.Code != c.code {
			t.Errorf("file=%s: status=%d want %d body=%s", c.file, rec.Code, c.code, rec.Body.String())
			continue
		}
		if c.ctypes != "" && rec.Header().Get("Content-Type") != c.ctypes {
			t.Errorf("file=%s: content-type=%s want %s", c.file, rec.Header().Get("Content-Type"), c.ctypes)
		}
	}
}

// ---------------- 标签 upsert 原子性([R57-2b-fix]) ----------------

func TestUpsertBookTagAtomic(t *testing.T) {
	db := newTestDB(t)
	d := Deps{DB: db, Auth: auth.NewService("pw", "s", false)}
	hits, added := upsertBookTag(d, "b1", "玄幻", "manual")
	if !added || hits != 0 {
		t.Fatalf("first upsert: added=%v hits=%d want true/0", added, hits)
	}
	hits, added = upsertBookTag(d, "b1", "玄幻", "manual")
	if added || hits != 1 {
		t.Fatalf("second upsert: added=%v hits=%d want false/1", added, hits)
	}
	// 并发同 tag: 恰一行, 命中数 = N-1(单语句 upsert 消除 RMW 竞态)
	const n = 20
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			upsertBookTag(d, "b1", "热血", "manual")
		}()
	}
	wg.Wait()
	var rows, hitsN int
	if err := db.QueryRow(`SELECT count(*), COALESCE(MAX(hits),-1) FROM "BookTag" WHERE bookId='b1' AND tag='热血'`).Scan(&rows, &hitsN); err != nil {
		t.Fatal(err)
	}
	if rows != 1 {
		t.Fatalf("concurrent upsert produced %d rows, want 1", rows)
	}
	if hitsN != n-1 {
		t.Fatalf("hits=%d want %d (每并发恰自增一次)", hitsN, n-1)
	}
}
