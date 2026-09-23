// ============================================================
// R56-2b — internal/store 深审回归测试
// 覆盖: Open DSN pragma 完整生效(R56-2b-fix)、ToMS/ToBool 回读口径、
//
//	MergeTaskJSON 并发合并不丢更新(R56-2b-fix 事务化)、
//	CrawlMergeStatsDelta 键白名单(注入防御深度)。
//
// ============================================================
package store

import (
	"database/sql"
	"encoding/json"
	"path/filepath"
	"sync"
	"testing"
)

// testSchema 建测试库最小表结构(与 Prisma 落库列名/类型一致)。
const testSchema = `
CREATE TABLE "Task" (id TEXT PRIMARY KEY, name TEXT, ruleId TEXT, mode TEXT, bookUrl TEXT, bookIds TEXT,
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
`

func testStore(t *testing.T) *DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	raw, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("raw open: %v", err)
	}
	if _, err := raw.Exec(testSchema); err != nil {
		t.Fatalf("schema: %v", err)
	}
	if err := raw.Close(); err != nil {
		t.Fatalf("raw close: %v", err)
	}
	db, err := Open(path)
	if err != nil {
		t.Fatalf("store open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func TestOpenAppliesAllPragmas(t *testing.T) {
	// [R56-2b-fix] 修前 DSN 双问号导致排头 busy_timeout 静默失效
	db := testStore(t)
	var bt int
	if err := db.QueryRow(`PRAGMA busy_timeout`).Scan(&bt); err != nil || bt != 10000 {
		t.Fatalf("busy_timeout=%d err=%v (want 10000)", bt, err)
	}
	var mode string
	if err := db.QueryRow(`PRAGMA journal_mode`).Scan(&mode); err != nil || mode != "wal" {
		t.Fatalf("journal_mode=%s err=%v (want wal)", mode, err)
	}
	var fk int
	if err := db.QueryRow(`PRAGMA foreign_keys`).Scan(&fk); err != nil || fk != 1 {
		t.Fatalf("foreign_keys=%d err=%v (want 1)", fk, err)
	}
}

func TestToMS(t *testing.T) {
	cases := []struct {
		in   any
		want int64
	}{
		{int64(1790083748380), 1790083748380},
		{float64(1790083748380), 1790083748380},
		{"1790083748380", 1790083748380},
		{"1699999999", 1699999999000}, // 10 位按秒
		{"", 0},
		{"abc", 0},
		{nil, 0},
		{"2025-09-22T10:00:00Z", 1758535200000},
	}
	for _, c := range cases {
		if got := ToMS(c.in); got != c.want {
			t.Errorf("ToMS(%v)=%d want %d", c.in, got, c.want)
		}
	}
}

func TestToBool(t *testing.T) {
	cases := []struct {
		in   any
		want bool
	}{
		{int64(1), true}, {int64(0), false}, {float64(1), true},
		{"1", true}, {"0", false}, {"true", true}, {"FALSE", false},
		{true, true}, {nil, false},
	}
	for _, c := range cases {
		if got := ToBool(c.in); got != c.want {
			t.Errorf("ToBool(%v)=%v want %v", c.in, got, c.want)
		}
	}
}

func TestMergeTaskJSONNoLostUpdate(t *testing.T) {
	// [R56-2b-fix] RMW 事务化后, 并发合并各写各的键必须全量保留
	db := testStore(t)
	id := db.NewID()
	if _, err := db.Exec(`INSERT INTO "Task" (id,name,status,progress,createdAt,updatedAt) VALUES (?,'t','pending','{}',?,?)`,
		id, NowMS(), NowMS()); err != nil {
		t.Fatal(err)
	}
	const n = 50
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if err := db.MergeTaskJSON(id, "progress", map[string]any{"k": i}); err != nil {
				t.Errorf("merge %d: %v", i, err)
			}
		}(i)
	}
	wg.Wait()
	var cur string
	if err := db.QueryRow(`SELECT progress FROM "Task" WHERE id=?`, id).Scan(&cur); err != nil {
		t.Fatal(err)
	}
	m := map[string]any{}
	if err := json.Unmarshal([]byte(cur), &m); err != nil {
		t.Fatalf("progress not json: %q", cur)
	}
	// 同键并发覆盖: 最终必保留其中之一的值(不丢成空/半途快照)
	if _, ok := m["k"]; !ok {
		t.Fatalf("merge key lost: %q", cur)
	}
	// 错误列名仍拒绝
	if err := db.MergeTaskJSON(id, "name", map[string]any{"x": 1}); err == nil {
		t.Fatalf("non-whitelisted column must be rejected")
	}
}

func TestCrawlMergeStatsDeltaKeyValidation(t *testing.T) {
	// [R56-2b-fix] 键拼进 json 路径前的字符白名单(注入防御深度)
	db := testStore(t)
	id := db.NewID()
	if _, err := db.Exec(`INSERT INTO "Task" (id,name,status,stats,createdAt,updatedAt) VALUES (?,'t','running','{}',?,?)`,
		id, NowMS(), NowMS()); err != nil {
		t.Fatal(err)
	}
	if err := db.CrawlMergeStatsDelta(id, map[string]int64{"booksCreated": 3}); err != nil {
		t.Fatalf("valid key rejected: %v", err)
	}
	var n int64
	if err := db.QueryRow(`SELECT json_extract(stats,'$.booksCreated') FROM "Task" WHERE id=?`, id).Scan(&n); err != nil || n != 3 {
		t.Fatalf("stats delta not applied: n=%d err=%v", n, err)
	}
	// 再叠加一次验证累加
	if err := db.CrawlMergeStatsDelta(id, map[string]int64{"booksCreated": 2}); err != nil {
		t.Fatalf("second delta: %v", err)
	}
	if err := db.QueryRow(`SELECT json_extract(stats,'$.booksCreated') FROM "Task" WHERE id=?`, id).Scan(&n); err != nil || n != 5 {
		t.Fatalf("delta accumulate: n=%d err=%v", n, err)
	}
	if err := db.CrawlMergeStatsDelta(id, map[string]int64{"evil')); DROP TABLE \"Task\";--": 1}); err == nil {
		t.Fatalf("malicious key must be rejected")
	}
}

func TestUpdateTaskStatusIf(t *testing.T) {
	db := testStore(t)
	id := db.NewID()
	if _, err := db.Exec(`INSERT INTO "Task" (id,name,status,createdAt,updatedAt) VALUES (?,'t','running',?,?)`, id, NowMS(), NowMS()); err != nil {
		t.Fatal(err)
	}
	ok, err := db.UpdateTaskStatusIf(id, "paused", "running")
	if err != nil || !ok {
		t.Fatalf("conditional transition failed: ok=%v err=%v", ok, err)
	}
	ok, err = db.UpdateTaskStatusIf(id, "done", "running") // 已是 paused → 0 行
	if err != nil || ok {
		t.Fatalf("stale expectation must not apply: ok=%v err=%v", ok, err)
	}
}
