// ============================================================
// [R69-b] bridge 计数诚实回归 —— chaptersUpdated 只计实际落库行数
//
//	修前 Contents 对每项恒 saved++: UpdateChapterContent 败 → 兜底建行
//	(失败静默吞错) → 仍 saved++, chaptersUpdated 与实际落库行数脱钩(虚高)。
//	修后两条写路径全败的章节跳过计数, 保持 fetched=false 由下轮增量重试。
//	注入面: SQLite trigger 按 URL 标记拦截 INSERT/UPDATE, 确定性无 sleep。
//
// ============================================================
package bridge

import (
	"testing"

	"mhgl/internal/crawl/callback"
)

// installChapterWriteBlocker 注入写路径失败面: url 含标记的章节 INSERT/UPDATE 全败
func TestContentsSkipsUnpersistedChaptersInCount(t *testing.T) {
	b, db := newWCBridge(t, "incremental")

	dec, err := b.Book(t.Context(), callback.BookPayload{
		BookURL: "http://src/book/count", Name: "计数诚实书", Author: "丁",
	})
	if err != nil {
		t.Fatalf("Book: %v", err)
	}
	// 预置一章(UPDATE 阻断目标): 走 INSERT, url 含 blockupd
	// (先播种后装 trigger: INSERT 阻断器对 blockupd 形态同拦, 播种行必须先行落库)
	if _, err := db.Exec(`INSERT INTO "Chapter" (id, bookId, idx, title, url, content, fetched, createdAt, updatedAt)
VALUES ('ch-pre', ?, 1, '预置章', 'http://src/book/count/blockupd-1', '', 0, datetime('now'), datetime('now'))`, dec.BookID); err != nil {
		t.Fatalf("seed chapter: %v", err)
	}

	// 失败注入: INSERT 阻断 url 含 "blocked"/"blockupd" 的章节(两标记同拦:
	// 更新路径章节的兜底 INSERT 与 UPDATE 必须同败, 才构成「双路径全败」场景);
	// UPDATE(content) 阻断 url 含 "blockupd" 的章节
	if _, err := db.Exec(`CREATE TRIGGER r69b_block_insert BEFORE INSERT ON "Chapter"
WHEN new.url LIKE '%blocked%' OR new.url LIKE '%blockupd%' BEGIN SELECT RAISE(ABORT, 'r69b blocked insert'); END`); err != nil {
		t.Fatalf("trigger insert: %v", err)
	}
	if _, err := db.Exec(`CREATE TRIGGER r69b_block_update BEFORE UPDATE OF content ON "Chapter"
WHEN new.url LIKE '%blockupd%' BEGIN SELECT RAISE(ABORT, 'r69b blocked update'); END`); err != nil {
		t.Fatalf("trigger update: %v", err)
	}

	err = b.Contents(t.Context(), callback.ContentsPayload{
		BookURL: "http://src/book/count", BookID: dec.BookID,
		Items: []callback.ChapterItem{
			{URL: "http://src/book/count/ok", Title: "正常章", ContentHTML: "<p>正常内容戊戊戊戊</p>"},
			// 缺章兜底建行路径: INSERT 被 trigger 阻断 → 双路径全败 → 不计
			{URL: "http://src/book/count/blocked-1", Title: "阻断建行章", ContentHTML: "<p>阻断建行内容</p>"},
			// 更新路径: UPDATE 被 trigger 阻断 → 兜底 INSERT(url 同含 blockupd)亦阻断 → 不计
			{URL: "http://src/book/count/blockupd-1", Title: "阻断更新章", ContentHTML: "<p>阻断更新内容</p>"},
		},
	})
	if err != nil {
		t.Fatalf("Contents: %v", err)
	}
	if got := statsChaptersUpdated(t, db); got != 1 {
		t.Fatalf("chaptersUpdated=%d, want 1(仅实际落库的正常章计数, 修前恒 3)", got)
	}
	if got := chapterContentOf(t, db, dec.BookID, "http://src/book/count/ok"); got == "" {
		t.Fatal("正常章应落库")
	}
}
