// ============================================================
// 章节读写(回调桥与前台共用; 复杂批量语义在 internal/crawl 的桥内实现)
// ============================================================
package store

import (
	"database/sql"
	"errors"
)

// [R67/R68 死代码清退] ChapterURLIndex 删除(TS 增量决策 existUrlMap 口径遗留, 全仓零消费者)。

// ChapterCount 书章节数。
func (d *DB) ChapterCount(bookID string) (int, error) {
	return d.Count(`SELECT count(*) FROM "Chapter" WHERE bookId=?`, bookID)
}

// UnfetchedChapterCount 未采正文章数(R53-4 skipContent 必要条件口径)。
func (d *DB) UnfetchedChapterCount(bookID string) (int, error) {
	return d.Count(`SELECT count(*) FROM "Chapter" WHERE bookId=? AND fetched=0`, bookID)
}

// LastChapterURL 库内末章 URL(按 idx 降序; 供回调响应 lastChapterUrl)。
func (d *DB) LastChapterURL(bookID string) (string, error) {
	var u string
	err := d.QueryRow(`SELECT url FROM "Chapter" WHERE bookId=? AND url<>'' ORDER BY idx DESC LIMIT 1`, bookID).Scan(&u)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return u, err
}

// [R67/R68 死代码清退] InsertChapter 删除(全仓零消费者, 建章恒走 bridge 批量/事务路径)。

// UpdateChapterContent 章节正文 upsert(幂等按 url 由调用方决策; fetched=1)。
func (d *DB) UpdateChapterContent(chapterID, url, content string, wordCount int) error {
	_, err := d.Exec(`UPDATE "Chapter" SET content=?, wordCount=?, fetched=1, updatedAt=? WHERE id=?`,
		content, wordCount, NowMS(), chapterID)
	return err
}
