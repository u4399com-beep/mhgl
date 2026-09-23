// ============================================================
// 引擎装配单测(R57-2a) — 代理结果回写泵
//
//	① push 解析/归一/非法丢弃/队列满丢弃 ② 全链: 最小 schema 库 FreeProxy 行
//	成功事实 → lastUsedAt 刷新; 连败事实 → alive=0(异步 worker 消费)
//
// ============================================================
package crawl

import (
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"mhgl/internal/store"

	_ "modernc.org/sqlite"
)

// feedbackTestSchema store.Open(pingAndSeed)所需关键表 + FreeProxy 最小列集
const feedbackTestSchema = `
CREATE TABLE "Task" (id TEXT PRIMARY KEY, ruleId TEXT, name TEXT, mode TEXT DEFAULT 'range',
bookUrl TEXT, bookIds TEXT, bookIdFrom TEXT, bookIdTo TEXT, listUrl TEXT, listStart INTEGER DEFAULT 1,
listEnd INTEGER DEFAULT 1, bookStart INTEGER DEFAULT 0, bookEnd INTEGER DEFAULT 0,
recrawlMode TEXT DEFAULT 'incremental', storageMode TEXT DEFAULT 'db', status TEXT DEFAULT 'pending',
autoRefresh BOOLEAN DEFAULT 0, refreshIntervalMin INTEGER DEFAULT 30, threadMin INTEGER DEFAULT 1,
threadMax INTEGER DEFAULT 5, intervalMin INTEGER DEFAULT 1000, intervalMax INTEGER DEFAULT 2000,
smartCategory BOOLEAN DEFAULT 1, smartComplete BOOLEAN DEFAULT 1, stats TEXT DEFAULT '{}',
progress TEXT DEFAULT '{}', error TEXT, createdAt INTEGER, updatedAt INTEGER);
CREATE TABLE "Book" (id TEXT PRIMARY KEY, num INTEGER UNIQUE, name TEXT, author TEXT,
categoryId TEXT, intro TEXT, cover TEXT, status TEXT, keywords TEXT, latestChapter TEXT,
wordCount INTEGER DEFAULT 0, sourceUrl TEXT UNIQUE, sourceRuleId TEXT, storageMode TEXT DEFAULT 'db',
collectedAt INTEGER, createdAt INTEGER, updatedAt INTEGER);
CREATE TABLE "Chapter" (id TEXT PRIMARY KEY, bookId TEXT NOT NULL, idx INTEGER NOT NULL,
title TEXT, volume TEXT, url TEXT, storageMode TEXT DEFAULT 'db', content TEXT, plainLength INTEGER DEFAULT 0,
fetched BOOLEAN DEFAULT 0, createdAt INTEGER, updatedAt INTEGER, UNIQUE(bookId, idx), UNIQUE(bookId, url));
CREATE TABLE "Rule" (id TEXT PRIMARY KEY, name TEXT, description TEXT, config TEXT DEFAULT '{}',
enabled BOOLEAN DEFAULT 1, createdAt INTEGER, updatedAt INTEGER);
CREATE TABLE "Setting" (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE "Site" (id TEXT PRIMARY KEY, name TEXT, domain TEXT UNIQUE, createdAt INTEGER, updatedAt INTEGER);
CREATE TABLE "FreeProxy" (id TEXT PRIMARY KEY, protocol TEXT NOT NULL, host TEXT NOT NULL,
port INTEGER NOT NULL, alive INTEGER NOT NULL DEFAULT 0, healthScore INTEGER NOT NULL DEFAULT 0,
lastCheckedAt INTEGER, lastSuccessAt INTEGER, lastUsedAt INTEGER, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
UNIQUE(protocol, host, port));
`

func feedbackTestDB(t *testing.T) *store.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "feedback-test.db")
	raw, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("raw open: %v", err)
	}
	if _, err := raw.Exec(feedbackTestSchema); err != nil {
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

func TestProxyFeedbackSinkPushParsing(t *testing.T) {
	s := &proxyFeedbackSink{ch: make(chan proxyFeedbackEvent, 8)}
	s.push("http://1.2.3.4:8080", true)
	s.push("socks5h://5.6.7.8:1080", false) // socks5h → socks5 归一
	s.push("10.0.0.7:3128", true)           // 无 scheme 形态整串当 host(port 空) → 丢
	s.push("ftp://9.9.9.9:21", true)        // 不支持协议 → 丢
	s.push("http://noport", true)           // 缺 port → 丢
	s.push("::::", true)                    // 解析异常形态 → 丢
	if len(s.ch) != 2 {
		t.Fatalf("入队事件数=%d, want 2", len(s.ch))
	}
	ev := <-s.ch
	if ev.protocol != "http" || ev.host != "1.2.3.4" || ev.port != "8080" || !ev.ok {
		t.Fatalf("事件①解析错误: %+v", ev)
	}
	ev = <-s.ch
	if ev.protocol != "socks5" || ev.host != "5.6.7.8" || ev.port != "1080" || ev.ok {
		t.Fatalf("事件②解析错误(socks5h 归一失败): %+v", ev)
	}
	// 队列满丢弃(容量 1 通道验证非阻塞语义)
	s2 := &proxyFeedbackSink{ch: make(chan proxyFeedbackEvent, 1)}
	s2.push("http://1.1.1.1:80", true)  // 占满
	s2.push("http://2.2.2.2:80", false) // 满即丢(不得阻塞)
	if len(s2.ch) != 1 {
		t.Fatalf("队列满丢弃异常: len=%d", len(s2.ch))
	}
}

func TestProxyFeedbackSinkEndToEnd(t *testing.T) {
	db := feedbackTestDB(t)
	now := time.Now().UnixMilli()
	_, err := db.Exec(`INSERT INTO "FreeProxy" (id, protocol, host, port, alive, healthScore, createdAt, updatedAt)
		VALUES ('c-pf-1', 'http', '10.1.1.1', 8080, 1, 50, ?, ?), ('c-pf-2', 'socks5', '10.1.1.2', 1080, 1, 40, ?, ?)`,
		now, now, now, now)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	feed := newProxyFeedbackSink(db)
	feed("http://10.1.1.1:8080", true)     // 成功 → lastUsedAt 刷新, alive 保持 1
	feed("socks5h://10.1.1.2:1080", false) // 连败 → alive=0
	feed("http://10.9.9.9:1", true)        // 池外代理: 无行受影响, 不报错

	deadline := time.Now().Add(5 * time.Second)
	var usedSet bool
	var alive2 int
	for time.Now().Before(deadline) {
		err := db.QueryRow(`SELECT lastUsedAt IS NOT NULL FROM "FreeProxy" WHERE id='c-pf-1'`).Scan(&usedSet)
		if err == nil {
			_ = db.QueryRow(`SELECT alive FROM "FreeProxy" WHERE id='c-pf-2'`).Scan(&alive2)
			if usedSet && alive2 == 0 {
				break
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	if !usedSet {
		t.Fatalf("成功事实未刷新 lastUsedAt")
	}
	if alive2 != 0 {
		t.Fatalf("连败事实未落 alive=0: alive=%d", alive2)
	}
	// alive=1 且 lastUsedAt 已刷(成功路径不清 alive, 健康度面留给收割器 Check)
	var alive1 int
	if err := db.QueryRow(`SELECT alive FROM "FreeProxy" WHERE id='c-pf-1'`).Scan(&alive1); err != nil || alive1 != 1 {
		t.Fatalf("成功路径不应清 alive: alive=%d err=%v", alive1, err)
	}
}
