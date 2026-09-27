// ============================================================
// [R73-1] 繁转简入库管线回归 —— bridge 三落库点(Book/Chapters/Contents)
// 全字段转换 + 开关(crawlT2S="0")直通 + 简体零变化。
//
// ============================================================
package bridge

import (
	"strings"
	"testing"

	"mhgl/internal/crawl/callback"
	"mhgl/internal/store"
)

// setT2S 写 settings 开关("1"/"0"), 并复位 TTL 快照使下一次读立即生效。
func setT2S(t *testing.T, db *store.DB, v string) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO "Setting" (key, value) VALUES ('crawlT2S', ?)
ON CONFLICT(key) DO UPDATE SET value=excluded.value`, v); err != nil {
		t.Fatalf("set crawlT2S: %v", err)
	}
	t2sMu.Lock()
	t2sAt = t2sAt.Add(-t2sTTLSec) // 过期快照 → 下一次读取立即刷新
	t2sMu.Unlock()
}

func TestR73_T2SBookFieldsConverted(t *testing.T) {
	b, db := newWCBridge(t, "incremental")

	dec, err := b.Book(t.Context(), callback.BookPayload{
		BookURL:  "http://src/book/t2s",
		Name:     "萬古神帝",           // 繁体书名
		Author:   "飛天魚",            // 繁体作者
		Category: "玄幻奇幻",           // 已是简体(分类表为简体, 恒等)
		Intro:    "這是一個關於少年逆襲的故事。", // 繁体简介
	})
	if err != nil {
		t.Fatalf("Book: %v", err)
	}
	var name, author, intro string
	if err := db.QueryRow(`SELECT name, author, intro FROM "Book" WHERE id=?`, dec.BookID).
		Scan(&name, &author, &intro); err != nil {
		t.Fatalf("scan book: %v", err)
	}
	if name != "万古神帝" {
		t.Errorf("书名未转简: %q", name)
	}
	if author != "飞天鱼" {
		t.Errorf("作者未转简: %q", author)
	}
	if !strings.Contains(intro, "这是一个关于少年逆袭的故事") {
		t.Errorf("简介未转简: %q", intro)
	}
}

func TestR73_T2SChapterTitleVolumeContent(t *testing.T) {
	b, db := newWCBridge(t, "incremental")

	dec, err := b.Book(t.Context(), callback.BookPayload{
		BookURL: "http://src/book/t2sc", Name: "測試書", Author: "作者",
	})
	if err != nil {
		t.Fatalf("Book: %v", err)
	}
	if _, err := b.Chapters(t.Context(), callback.ChaptersPayload{
		BookURL: "http://src/book/t2sc", BookID: dec.BookID,
		Items: []callback.TocItemPayload{
			{Title: "第一章 龍飛鳳舞", URL: "http://src/book/t2sc/1", Volume: "第一卷 風雲"},
		},
	}); err != nil {
		t.Fatalf("Chapters: %v", err)
	}
	var title, volume string
	if err := db.QueryRow(`SELECT title, volume FROM "Chapter" WHERE bookId=?`, dec.BookID).
		Scan(&title, &volume); err != nil {
		t.Fatalf("scan chapter: %v", err)
	}
	if title != "第一章 龙飞凤舞" {
		t.Errorf("章节标题未转简: %q", title)
	}
	if volume != "第一卷 风云" {
		t.Errorf("卷名未转简: %q", volume)
	}
	// 正文转换
	var content string
	if err := b.Contents(t.Context(), callback.ContentsPayload{
		BookURL: "http://src/book/t2sc", BookID: dec.BookID,
		Items: []callback.ChapterItem{
			{URL: "http://src/book/t2sc/1", Title: "第一章 龍飛鳳舞", ContentHTML: "<p>他們飛過了萬里長空。</p>"},
		},
	}); err != nil {
		t.Fatalf("Contents: %v", err)
	}
	if err := db.QueryRow(`SELECT content FROM "Chapter" WHERE bookId=?`, dec.BookID).
		Scan(&content); err != nil {
		t.Fatalf("scan content: %v", err)
	}
	if !strings.Contains(content, "他们飞过了万里长空") {
		t.Errorf("正文未转简: %q", content)
	}
}

func TestR73_T2SDisabledPassthrough(t *testing.T) {
	b, db := newWCBridge(t, "incremental")
	setT2S(t, db, "0") // 关闭

	dec, err := b.Book(t.Context(), callback.BookPayload{
		BookURL: "http://src/book/t2soff", Name: "萬古神帝", Author: "飛天魚",
	})
	if err != nil {
		t.Fatalf("Book: %v", err)
	}
	var name string
	if err := db.QueryRow(`SELECT name FROM "Book" WHERE id=?`, dec.BookID).Scan(&name); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if name != "萬古神帝" {
		t.Errorf("关闭后不应转换: %q", name)
	}
	// 恢复开启 → 再建书转换恢复
	setT2S(t, db, "1")
	dec2, err := b.Book(t.Context(), callback.BookPayload{
		BookURL: "http://src/book/t2son2", Name: "萬古神帝", Author: "飛天魚",
	})
	if err != nil {
		t.Fatalf("Book2: %v", err)
	}
	var name2 string
	if err := db.QueryRow(`SELECT name FROM "Book" WHERE id=?`, dec2.BookID).Scan(&name2); err != nil {
		t.Fatalf("scan2: %v", err)
	}
	if name2 != "万古神帝" {
		t.Errorf("重新开启后应转换: %q", name2)
	}
}

func TestR73_T2SSimplifiedIdentity(t *testing.T) {
	b, db := newWCBridge(t, "incremental")
	// 简体书名零变化(同名建书幂等性依赖恒等)
	dec, err := b.Book(t.Context(), callback.BookPayload{
		BookURL: "http://src/book/t2sid", Name: "简体书名", Author: "作者",
	})
	if err != nil {
		t.Fatalf("Book: %v", err)
	}
	var name string
	if err := db.QueryRow(`SELECT name FROM "Book" WHERE id=?`, dec.BookID).Scan(&name); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if name != "简体书名" {
		t.Errorf("简体书名被误转: %q", name)
	}
}
