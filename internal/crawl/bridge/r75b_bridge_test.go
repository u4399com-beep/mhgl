// ============================================================
// [R75-b] bridge 回归 —— contents 缺章兜底标题 t2s + Book.latestChapter 清洗同源
// ============================================================
package bridge

import (
	"testing"

	"mhgl/internal/crawl/callback"
)

// TestR75bContentsFallbackTitleT2S contents 回调缺章兜底建行标题 t2s:
// Chapters 路径标题经 t2s 就地转换(R73-1), contents 兜底建行路径修前漏转 ——
// 繁体站缺章兜底章标题繁体入库, 与目录路径同一标题两处形态分叉(探针实证)。
func TestR75bContentsFallbackTitleT2S(t *testing.T) {
	b, db := newWCBridge(t, "incremental")
	dec, err := b.Book(t.Context(), callback.BookPayload{
		BookURL: "http://src/book/r75t2s", Name: "测试书", Author: "作者",
	})
	if err != nil {
		t.Fatalf("Book: %v", err)
	}
	// 直接发 contents(URL 无既有章行 → 走缺章兜底建行路径), 带繁体标题
	if err := b.Contents(t.Context(), callback.ContentsPayload{
		BookURL: "http://src/book/r75t2s", BookID: dec.BookID,
		Items: []callback.ChapterItem{
			{URL: "http://src/book/r75t2s/9", Title: "第九章 龍飛鳳舞", ContentHTML: "<p>正文。</p>"},
		},
	}); err != nil {
		t.Fatalf("Contents: %v", err)
	}
	var title string
	if err := db.QueryRow(`SELECT title FROM "Chapter" WHERE bookId=?`, dec.BookID).Scan(&title); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if title != "第九章 龙飞凤舞" {
		t.Fatalf("contents 兜底建章标题未转简: %q", title)
	}
}

// TestR75bLatestChapterCleanedTitle Book.latestChapter 与章行标题同源(清洗后形态):
// 章行标题经 planChapterSync 的 CleanChapterTitle 净化, 修前 latestChapter 直接回写
// 原始 TOC 标题 —— "第2章 大结局_www.x.com首发" 类垃圾尾在书籍页「最新章节」残留,
// 与章行显示形态分叉。清洗后为空(病态壳标题)回落原串。
func TestR75bLatestChapterCleanedTitle(t *testing.T) {
	b, db := newWCBridge(t, "incremental")
	dec, err := b.Book(t.Context(), callback.BookPayload{
		BookURL: "http://src/book/r75lc", Name: "测试书", Author: "作者",
	})
	if err != nil {
		t.Fatalf("Book: %v", err)
	}
	if _, err := b.Chapters(t.Context(), callback.ChaptersPayload{
		BookURL: "http://src/book/r75lc", BookID: dec.BookID,
		Items: []callback.TocItemPayload{
			{Title: "第1章 风起", URL: "http://src/book/r75lc/1"},
			{Title: "第2章 大结局_www.x.com首发", URL: "http://src/book/r75lc/2"},
		},
	}); err != nil {
		t.Fatalf("Chapters: %v", err)
	}
	var latest string
	if err := db.QueryRow(`SELECT latestChapter FROM "Book" WHERE id=?`, dec.BookID).Scan(&latest); err != nil {
		t.Fatalf("scan book: %v", err)
	}
	if latest != "第2章 大结局" {
		t.Fatalf("latestChapter 未取清洗后形态: %q (want 第2章 大结局)", latest)
	}
	// 章行标题同形态(同源断言)
	var rowTitle string
	if err := db.QueryRow(`SELECT title FROM "Chapter" WHERE bookId=? AND url=?`,
		dec.BookID, "http://src/book/r75lc/2").Scan(&rowTitle); err != nil {
		t.Fatalf("scan chapter: %v", err)
	}
	if rowTitle != latest {
		t.Fatalf("latestChapter(%q) 与章行标题(%q) 不同源", latest, rowTitle)
	}
}
