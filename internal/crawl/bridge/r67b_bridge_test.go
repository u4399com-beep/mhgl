// ============================================================
// [R67-b] bridge 抓虫回归测试
//
//	Contents 批内 URL 去重: 同批重复 URL 幂等只写一次, chaptersUpdated
//	计数不虚高; 超长/空正文 skip 语义不变(不占去重位)
//	Cover 书行预检前移: 书行不存在时不再落盘孤儿封面文件
//
// ============================================================
package bridge

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mhgl/internal/crawl/callback"
	"mhgl/internal/store"
)

// statsChaptersUpdated 读任务 stats JSON 的 chaptersUpdated 计数
func statsChaptersUpdated(t *testing.T, db *store.DB) int64 {
	t.Helper()
	task, err := db.GetTask("task-wc")
	if err != nil || task == nil {
		t.Fatalf("GetTask: %v,%v", task, err)
	}
	if task.Stats == "" {
		return 0
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(task.Stats), &m); err != nil {
		t.Fatalf("stats json: %v", err)
	}
	v, _ := m["chaptersUpdated"].(float64)
	return int64(v)
}

// chapterContentOf 读章节 content(按 bookId+url)
func chapterContentOf(t *testing.T, db *store.DB, bookID, url string) string {
	t.Helper()
	rows, err := db.QueryMaps(`SELECT content FROM "Chapter" WHERE bookId=? AND url=?`, bookID, url)
	if err != nil {
		t.Fatalf("QueryMaps: %v", err)
	}
	if len(rows) == 0 {
		return ""
	}
	s, _ := rows[0]["content"].(string)
	return s
}

// TestContentsDedupWithinBatch [R67-b] 批内 URL 去重: 同批两项同 URL(不同内容)只
// 写一次 —— 修前两项各自 UpdateChapterContent + saved++ 双双计 chaptersUpdated(虚高),
// 且后项覆盖前项内容(批内落库结果非确定性)。修后首现落库, 重复项跳过, 计数=真实
// 落库行数; 超长/空正文 skip 项不占去重位(既有 skip 语义不变)。
func TestContentsDedupWithinBatch(t *testing.T) {
	b, db := newWCBridge(t, "incremental")
	dec, err := b.Book(t.Context(), callback.BookPayload{
		BookURL: "http://src/book/dup", Name: "批内去重书", Author: "甲",
	})
	if err != nil {
		t.Fatalf("Book: %v", err)
	}
	err = b.Contents(t.Context(), callback.ContentsPayload{
		BookURL: "http://src/book/dup", BookID: dec.BookID,
		Items: []callback.ChapterItem{
			{URL: "http://src/book/dup/c1", Title: "第一章", ContentHTML: "<p>首现内容甲甲甲甲</p>"},
			{URL: "http://src/book/dup/c1", Title: "第一章", ContentHTML: "<p>重复内容乙乙乙乙</p>"},
			{URL: "http://src/book/dup/c2", Title: "第二章", ContentHTML: "<p>正常章丙丙丙丙</p>"},
		},
	})
	if err != nil {
		t.Fatalf("Contents: %v", err)
	}
	// 计数: 3 项中 1 项为重复 → 实际落库 2 章(修前恒 3)
	if got := statsChaptersUpdated(t, db); got != 2 {
		t.Fatalf("chaptersUpdated=%d, want 2(批内重复 URL 只计一次)", got)
	}
	// 首现内容保留(重复项不再覆写)
	got := chapterContentOf(t, db, dec.BookID, "http://src/book/dup/c1")
	if strings.Contains(got, "重复内容") {
		t.Fatalf("c1 内容被重复项覆写: %s", got)
	}
	if !strings.Contains(got, "首现内容") {
		t.Fatalf("c1 应保留首现内容, got: %q", got)
	}
}

// TestContentsDedupSkippedItemNotOccupying [R67-b] 去重位语义: 空正文 skip 项不占
// 去重位 —— 同 URL 首项为空正文(跳过)、后项为合法正文时, 合法项仍须落库。
func TestContentsDedupSkippedItemNotOccupying(t *testing.T) {
	b, db := newWCBridge(t, "incremental")
	dec, err := b.Book(t.Context(), callback.BookPayload{
		BookURL: "http://src/book/dup2", Name: "跳过不占位书", Author: "乙",
	})
	if err != nil {
		t.Fatalf("Book: %v", err)
	}
	err = b.Contents(t.Context(), callback.ContentsPayload{
		BookURL: "http://src/book/dup2", BookID: dec.BookID,
		Items: []callback.ChapterItem{
			{URL: "http://src/book/dup2/c1", Title: "第一章", ContentHTML: ""}, // 空正文: skip(不占去重位)
			{URL: "http://src/book/dup2/c1", Title: "第一章", ContentHTML: "<p>合法章丁丁丁丁</p>"},
		},
	})
	if err != nil {
		t.Fatalf("Contents: %v", err)
	}
	if got := statsChaptersUpdated(t, db); got != 1 {
		t.Fatalf("chaptersUpdated=%d, want 1(空正文跳过后合法项应落库)", got)
	}
	if got := chapterContentOf(t, db, dec.BookID, "http://src/book/dup2/c1"); !strings.Contains(got, "合法章") {
		t.Fatalf("合法项应落库, got: %q", got)
	}
}

// TestCoverNoOrphanFileWhenBookMissing [R67-b] 封面孤儿文件防护: 书行不存在时
// Cover 回调必须跳过落盘 —— 修前先 saveCoverFile 再定位书行, 书被中途删除的病态
// 窗口下 covers/ 残留无 DB 引用孤儿文件(且重发每次再写一份)。
func TestCoverNoOrphanFileWhenBookMissing(t *testing.T) {
	b, _ := newWCBridge(t, "incremental")
	err := b.Cover(t.Context(), callback.CoverPayload{
		BookURL:     "http://src/book/ghost", // 库中不存在
		B64:         "Y292ZXItYnl0ZXM=",      // base64("cover-bytes")
		ContentType: "image/png",
	})
	if err != nil {
		t.Fatalf("书不存在时 Cover 应宽容返回 nil, got %v", err)
	}
	entries, rerr := os.ReadDir(b.coverDir)
	if rerr != nil {
		t.Fatalf("ReadDir: %v", rerr)
	}
	if len(entries) != 0 {
		t.Fatalf("书行不存在时不得落盘孤儿封面文件: %d 个", len(entries))
	}
}

// TestCoverHappyPathSavesFile [R67-b] 正例钉: 书行存在时封面正常落盘+回写
// (预检前移不得破坏正常路径)。
func TestCoverHappyPathSavesFile(t *testing.T) {
	b, db := newWCBridge(t, "incremental")
	dec, err := b.Book(t.Context(), callback.BookPayload{
		BookURL: "http://src/book/cover-ok", Name: "封面正例书", Author: "丙",
	})
	if err != nil {
		t.Fatalf("Book: %v", err)
	}
	if err := b.Cover(t.Context(), callback.CoverPayload{
		BookURL: "http://src/book/cover-ok", BookID: dec.BookID,
		B64:         "Y292ZXItYnl0ZXM=",
		ContentType: "image/png",
	}); err != nil {
		t.Fatalf("Cover: %v", err)
	}
	book, err := db.GetBook(dec.BookID)
	if err != nil || book == nil {
		t.Fatalf("GetBook: %v,%v", book, err)
	}
	if book.Cover == "" {
		t.Fatal("Book.cover 未回写")
	}
	if _, err := os.Stat(filepath.Join(b.coverDir, filepath.Base(book.Cover))); err != nil {
		t.Fatalf("封面文件未落盘: %s: %v", book.Cover, err)
	}
}
