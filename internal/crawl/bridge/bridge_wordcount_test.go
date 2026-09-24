// ============================================================
// [R62-f] Book.wordCount 优先级语义回归(bridge 层)
//
//	book.fields.wordCount(声明字数)=初始值; 正文聚合值(实采正文和)=最终值:
//	  ① 新建书 → 声明字数直接落库
//	  ② 聚合值 >0 → 覆写声明值(聚合值更准)
//	  ③ 聚合值 =0(目录采集中断/正文空) → 保留声明值, 不冲 0
//	  ④ 增量重采既有书 → 仅库内字数为 0 时补声明值(不覆写既有聚合值)
//	  ⑤ 完全覆盖重采 → 字数重置为声明值(无声明值则 0, 同旧口径)
//
// ============================================================
package bridge

import (
	"database/sql"
	"path/filepath"
	"testing"

	"mhgl/internal/crawl/callback"
	"mhgl/internal/store"
)

const wcTestSchema = `
CREATE TABLE "Task" (id TEXT PRIMARY KEY, name TEXT DEFAULT '', ruleId TEXT DEFAULT '', mode TEXT DEFAULT '',
bookUrl TEXT DEFAULT '', bookIds TEXT DEFAULT '', bookIdFrom TEXT DEFAULT '', bookIdTo TEXT DEFAULT '',
listUrl TEXT DEFAULT '', listStart INTEGER DEFAULT 0, listEnd INTEGER DEFAULT 0, bookStart INTEGER DEFAULT 0,
bookEnd INTEGER DEFAULT 0,
recrawlMode TEXT DEFAULT '', storageMode TEXT DEFAULT 'db', engine TEXT DEFAULT '', fetchConfig TEXT DEFAULT '',
threadMin INTEGER DEFAULT 0, threadMax INTEGER DEFAULT 0,
intervalMin INTEGER DEFAULT 0, intervalMax INTEGER DEFAULT 0, smartCategory BOOLEAN DEFAULT 0,
smartComplete BOOLEAN DEFAULT 0, autoSuggest BOOLEAN DEFAULT 0,
autoRefresh BOOLEAN DEFAULT 0, refreshIntervalMin INTEGER DEFAULT 0, status TEXT DEFAULT 'pending',
progress TEXT DEFAULT '{}', stats TEXT DEFAULT '{}',
createdAt DATETIME, updatedAt DATETIME);
CREATE TABLE "Book" (id TEXT PRIMARY KEY, num INTEGER UNIQUE, name TEXT DEFAULT '', author TEXT DEFAULT '',
categoryId TEXT DEFAULT '',
intro TEXT DEFAULT '', cover TEXT DEFAULT '', status TEXT DEFAULT 'unknown', keywords TEXT DEFAULT '',
latestChapter TEXT DEFAULT '', wordCount INTEGER DEFAULT 0, sourceUrl TEXT DEFAULT '',
sourceRuleId TEXT, storageMode TEXT DEFAULT 'db', collectedAt DATETIME, createdAt DATETIME, updatedAt DATETIME);
CREATE TABLE "Chapter" (id TEXT PRIMARY KEY, bookId TEXT, idx INTEGER, title TEXT, volume TEXT DEFAULT '',
url TEXT DEFAULT '', content TEXT, storage TEXT DEFAULT 'db', filePath TEXT, wordCount INTEGER DEFAULT 0,
fetched BOOLEAN DEFAULT 0, createdAt DATETIME, updatedAt DATETIME);
CREATE TABLE "Rule" (id TEXT PRIMARY KEY, name TEXT, description TEXT, config TEXT DEFAULT '{}',
enabled BOOLEAN DEFAULT 1, createdAt DATETIME, updatedAt DATETIME);
CREATE TABLE "Site" (id TEXT PRIMARY KEY, name TEXT, domain TEXT UNIQUE, themeId TEXT, title TEXT,
description TEXT, keywords TEXT, icbm TEXT, geoRegion TEXT, geoPlacename TEXT, offset INTEGER DEFAULT 0,
isDefault BOOLEAN DEFAULT 0, status BOOLEAN DEFAULT 1, inLinkWheel BOOLEAN DEFAULT 1,
createdAt DATETIME, updatedAt DATETIME);
CREATE TABLE "Setting" (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE "Category" (id TEXT PRIMARY KEY, name TEXT UNIQUE, sortOrder INTEGER DEFAULT 0, createdAt DATETIME);
CREATE TABLE "TaskLog" (id TEXT PRIMARY KEY, taskId TEXT, level TEXT, message TEXT, createdAt DATETIME);
CREATE TABLE "BookTag" (id TEXT PRIMARY KEY, bookId TEXT, tag TEXT, source TEXT DEFAULT 'suggest',
hits INTEGER DEFAULT 0, UNIQUE(bookId, tag));
`

func newWCBridge(t *testing.T, recrawlMode string) (*Bridge, *store.DB) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "wc-test.db")
	raw, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("raw open: %v", err)
	}
	if _, err := raw.Exec(wcTestSchema); err != nil {
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
	taskID := "task-wc"
	now := store.NowMS()
	if _, err := db.Exec(`INSERT INTO "Rule" (id,name,config,enabled,createdAt,updatedAt) VALUES ('r1','规则','{}',1,?,?)`, now, now); err != nil {
		t.Fatalf("seed rule: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO "Task" (id,name,ruleId,mode,bookUrl,status,recrawlMode,storageMode,smartCategory,smartComplete,autoSuggest,autoRefresh,createdAt,updatedAt)
VALUES (?,'字数测试','r1','single','','running',?,'db',0,0,0,0,?,?)`, taskID, recrawlMode, now, now); err != nil {
		t.Fatalf("seed task: %v", err)
	}
	return &Bridge{db: db, taskID: taskID, coverDir: t.TempDir()}, db
}

func bookWCOf(t *testing.T, db *store.DB, bookID string) int64 {
	t.Helper()
	b, err := db.GetBook(bookID)
	if err != nil || b == nil {
		t.Fatalf("GetBook(%s)=%v,%v", bookID, b, err)
	}
	return b.WordCount
}

// ① 新建书: 声明字数直接落库作初始值。
func TestBookCallbackWordCountInitialValue(t *testing.T) {
	b, db := newWCBridge(t, "incremental")
	dec, err := b.Book(t.Context(), callback.BookPayload{
		BookURL:   "http://src/book/1",
		Name:      "初始值书",
		Author:    "甲",
		WordCount: 3535000,
	})
	if err != nil {
		t.Fatalf("Book: %v", err)
	}
	if got := bookWCOf(t, db, dec.BookID); got != 3535000 {
		t.Fatalf("new book wordCount=%d want 3535000(声明字数落库)", got)
	}
	// 未提取(0)同旧口径: 落 0
	dec2, err := b.Book(t.Context(), callback.BookPayload{BookURL: "http://src/book/2", Name: "无声明书", Author: "乙"})
	if err != nil {
		t.Fatalf("Book2: %v", err)
	}
	if got := bookWCOf(t, db, dec2.BookID); got != 0 {
		t.Fatalf("new book without declared wordCount=%d want 0", got)
	}
}

// ② 聚合值 >0 覆写声明值; ③ 聚合值 =0 保留声明值。
func TestContentsAggregationPriority(t *testing.T) {
	b, db := newWCBridge(t, "incremental")
	dec, err := b.Book(t.Context(), callback.BookPayload{
		BookURL: "http://src/book/10", Name: "聚合覆写书", Author: "丙", WordCount: 100,
	})
	if err != nil {
		t.Fatalf("Book: %v", err)
	}
	// 正文一批: 2 章, 纯文本长度 6+6=12(去标签后 rune 数) → 聚合值 12 >0 → 覆写声明值 100
	err = b.Contents(t.Context(), callback.ContentsPayload{
		BookURL: "http://src/book/10", BookID: dec.BookID,
		Items: []callback.ChapterItem{
			{URL: "http://src/book/10/c1", Title: "第一章", ContentHTML: "<p>正文甲甲甲甲</p>"},
			{URL: "http://src/book/10/c2", Title: "第二章", ContentHTML: "<p>正文乙乙乙乙</p>"},
		},
	})
	if err != nil {
		t.Fatalf("Contents: %v", err)
	}
	if got := bookWCOf(t, db, dec.BookID); got != 12 {
		t.Fatalf("wordCount=%d want 12(聚合值覆写声明值)", got)
	}

	// ③ 聚合值 =0(正文清空后无有效字符) → 保留声明字数, 不冲 0
	dec3, err := b.Book(t.Context(), callback.BookPayload{
		BookURL: "http://src/book/11", Name: "中断保底书", Author: "丁", WordCount: 3535000,
	})
	if err != nil {
		t.Fatalf("Book3: %v", err)
	}
	err = b.Contents(t.Context(), callback.ContentsPayload{
		BookURL: "http://src/book/11", BookID: dec3.BookID,
		Items: []callback.ChapterItem{
			{URL: "http://src/book/11/c1", Title: "第一章", ContentHTML: "<p></p>"},
		},
	})
	if err != nil {
		t.Fatalf("Contents3: %v", err)
	}
	if got := bookWCOf(t, db, dec3.BookID); got != 3535000 {
		t.Fatalf("wordCount=%d want 3535000(聚合值 0 时保留声明字数)", got)
	}
}

// ④ 增量重采: 仅库内字数为 0 时补声明值, 不覆写既有聚合值。
func TestBookCallbackIncrementalFillIfEmpty(t *testing.T) {
	b, db := newWCBridge(t, "incremental")
	now := store.NowMS()
	// 既有书 A: 已有聚合字数 500 → 声明值不得覆写
	if _, err := db.Exec(`INSERT INTO "Book" (id,num,name,author,wordCount,sourceUrl,storageMode,createdAt,updatedAt)
VALUES ('book-a',1,'聚合书','戊',500,'http://src/book/a','db',?,?)`, now, now); err != nil {
		t.Fatalf("seed book-a: %v", err)
	}
	// 既有书 B: 字数 0(历史书籍从未获得值) → 声明值补位
	if _, err := db.Exec(`INSERT INTO "Book" (id,num,name,author,wordCount,sourceUrl,storageMode,createdAt,updatedAt)
VALUES ('book-b',2,'空字数书','己',0,'http://src/book/b','db',?,?)`, now, now); err != nil {
		t.Fatalf("seed book-b: %v", err)
	}
	if _, err := b.Book(t.Context(), callback.BookPayload{BookURL: "http://src/book/a", Name: "聚合书", Author: "戊", WordCount: 3535000}); err != nil {
		t.Fatalf("Book a: %v", err)
	}
	if got := bookWCOf(t, db, "book-a"); got != 500 {
		t.Fatalf("book-a wordCount=%d want 500(既有聚合值不被声明值覆写)", got)
	}
	if _, err := b.Book(t.Context(), callback.BookPayload{BookURL: "http://src/book/b", Name: "空字数书", Author: "己", WordCount: 3535000}); err != nil {
		t.Fatalf("Book b: %v", err)
	}
	if got := bookWCOf(t, db, "book-b"); got != 3535000 {
		t.Fatalf("book-b wordCount=%d want 3535000(零字数书补声明值)", got)
	}
}

// ⑤ 完全覆盖: 字数重置为声明值(章节清空后聚合值失效, 声明值接管初始位)。
func TestBookCallbackFullRecrawlReset(t *testing.T) {
	b, db := newWCBridge(t, "full")
	now := store.NowMS()
	if _, err := db.Exec(`INSERT INTO "Book" (id,num,name,author,wordCount,sourceUrl,storageMode,createdAt,updatedAt)
VALUES ('book-f',9,'全覆盖书','庚',500,'http://src/book/f','db',?,?)`, now, now); err != nil {
		t.Fatalf("seed: %v", err)
	}
	dec, err := b.Book(t.Context(), callback.BookPayload{BookURL: "http://src/book/f", Name: "全覆盖书", Author: "庚", WordCount: 3079864})
	if err != nil {
		t.Fatalf("Book: %v", err)
	}
	if dec.BookID != "book-f" {
		t.Fatalf("full recrawl must reuse book id, got %s", dec.BookID)
	}
	if got := bookWCOf(t, db, "book-f"); got != 3079864 {
		t.Fatalf("full recrawl wordCount=%d want 3079864(声明值接管)", got)
	}
}
