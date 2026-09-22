// ============================================================
// 章节读写(回调桥与前台共用; 复杂批量语义在 internal/crawl 的桥内实现)
// ============================================================
package store

// ChapterURLIndex 书内 url→idx 映射(增量决策 existUrlMap 口径)。
func (d *DB) ChapterURLIndex(bookID string) (map[string]int, error) {
	rows, err := d.Query(`SELECT url, idx FROM "Chapter" WHERE bookId=? AND url<>''`, bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := make(map[string]int, 256)
	for rows.Next() {
		var u string
		var idx int64
		if err := rows.Scan(&u, &idx); err != nil {
			return nil, err
		}
		m[u] = int(idx)
	}
	return m, rows.Err()
}

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
	if err != nil && err.Error() == "sql: no rows in result set" {
		return "", nil
	}
	return u, err
}

// InsertChapter 建章(storage 恒 db; content/fetched 由调用方后续填充)。
func (d *DB) InsertChapter(id, bookID string, idx int, title, volume, url string) error {
	now := NowMS()
	_, err := d.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,volume,url,content,storage,filePath,wordCount,fetched,createdAt,updatedAt)
VALUES (?,?,?,?,?,?,NULL,'db',NULL,0,0,?,?)`, id, bookID, idx, title, volume, url, now, now)
	return err
}

// UpdateChapterContent 章节正文 upsert(幂等按 url 由调用方决策; fetched=1)。
func (d *DB) UpdateChapterContent(chapterID, url, content string, wordCount int) error {
	_, err := d.Exec(`UPDATE "Chapter" SET content=?, wordCount=?, fetched=1, updatedAt=? WHERE id=?`,
		content, wordCount, NowMS(), chapterID)
	return err
}
