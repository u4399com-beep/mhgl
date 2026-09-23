// ============================================================
// Web 层扩展读面(3-c 专有, 前缀 WebXxx; PLAN §3 扩展协议)
// 供前台 SSR(书籍列表/榜单/章节/关键词/PSEO)与后台页轻量数据使用。
// 列表统一 JOIN Category 出 categoryName, 与 /api/public/books DTO 口径一致。
// ============================================================
package store

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// webLikeSafe LIKE 通配转义(对齐 api/_lib likeSafe)。
func webLikeSafe(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "%", "\\%")
	s = strings.ReplaceAll(s, "_", "\\_")
	return s
}

const webBookCols = `b.id, b.num, b.name, b.author, substr(b.intro,1,200) AS intro, b.cover, b.status,
b.wordCount, b.latestChapter, b.categoryId, b.updatedAt, c.name AS category`

func webBookFrom() string {
	return ` FROM "Book" b LEFT JOIN "Category" c ON c.id=b.categoryId`
}

// WebResolveCatID 分类锚双形态解析: "cat:{name}" → 按名查 id(未命中回 "__no_match__");
// 其余原样返回(常规 categoryId 精确直查)。空串返回空串(无筛选)。
func (d *DB) WebResolveCatID(cat string) (string, error) {
	cat = strings.TrimSpace(cat)
	if cat == "" {
		return "", nil
	}
	if !strings.HasPrefix(cat, "cat:") {
		return cat, nil
	}
	name := strings.TrimPrefix(cat, "cat:")
	var id string
	err := d.QueryRow(`SELECT id FROM "Category" WHERE name=? LIMIT 1`, name).Scan(&id)
	// [R58-2c-fix] 修前 err.Error()=="sql: no rows..." 字符串直比 —— R56-2b-6/R57-2b-2
	// 已在 models.go 等五处同款收敛为 errors.Is, 此处为漏网残留(驱动换型/错误包装即失效)。
	if errors.Is(err, sql.ErrNoRows) {
		return "__no_match__", nil
	}
	return id, err
}

// WebListBooks 前台书籍列表(分页+cat/q/sort/status 筛选)。
// sort ∈ latest(updatedAt DESC)|words(wordCount DESC)|new(createdAt DESC), 非法回落 latest;
// status ∈ unknown|ongoing|completed 白名单, 其余忽略。
// 返回 (rows, total, err); rows 元素含 category(分类名)。
func (d *DB) WebListBooks(page, pageSize int, cat, q, sort, status string) ([]map[string]any, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 120 {
		pageSize = 24
	}
	var where []string
	var args []any
	if t := strings.TrimSpace(q); t != "" {
		like := "%" + webLikeSafe(t) + "%"
		where = append(where, `(b.name LIKE ? ESCAPE '\' OR b.author LIKE ? ESCAPE '\' OR b.keywords LIKE ? ESCAPE '\')`)
		args = append(args, like, like, like)
	}
	if cid, err := d.WebResolveCatID(cat); err != nil {
		return nil, 0, err
	} else if cid != "" {
		where = append(where, `b.categoryId=?`)
		args = append(args, cid)
	}
	switch status {
	case "unknown", "ongoing", "completed":
		where = append(where, `b.status=?`)
		args = append(args, status)
	}
	w := ""
	if len(where) > 0 {
		w = " WHERE " + strings.Join(where, " AND ")
	}
	order := `b.updatedAt DESC`
	switch sort {
	case "words":
		order = `b.wordCount DESC`
	case "new":
		order = `b.createdAt DESC`
	}
	total, err := d.Count(`SELECT count(*)`+webBookFrom()+w, args...)
	if err != nil {
		return nil, 0, err
	}
	qs := `SELECT ` + webBookCols + webBookFrom() + w +
		fmt.Sprintf(` ORDER BY %s LIMIT %d OFFSET %d`, order, pageSize, (page-1)*pageSize)
	rows, err := d.QueryMaps(qs, args...)
	if err != nil {
		return nil, 0, err
	}
	return rows, int64(total), nil
}

// WebBookDetail 书籍详情(+分类名+章节数)。
func (d *DB) WebBookDetail(id string) (map[string]any, bool, error) {
	m, ok, err := d.QueryMap(`SELECT `+webBookCols+`, (SELECT count(*) FROM "Chapter" ch WHERE ch.bookId=b.id) AS chapterCount`+
		webBookFrom()+` WHERE b.id=?`, id)
	return m, ok, err
}

// WebChapterPage 书籍章节分页(idx 升序)。
func (d *DB) WebChapterPage(bookID string, page, size int) ([]map[string]any, error) {
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 300 {
		size = 100
	}
	return d.QueryMaps(`SELECT id, idx, title, volume FROM "Chapter" WHERE bookId=?
ORDER BY idx ASC LIMIT ? OFFSET ?`, bookID, size, (page-1)*size)
}

// WebChapterTotal 书章节总数。
func (d *DB) WebChapterTotal(bookID string) (int, error) {
	return d.Count(`SELECT count(*) FROM "Chapter" WHERE bookId=?`, bookID)
}

// WebLatestChapters 全书最新 N 章(idx 降序)。
func (d *DB) WebLatestChapters(bookID string, n int) ([]map[string]any, error) {
	if n < 1 || n > 50 {
		n = 12
	}
	return d.QueryMaps(`SELECT id, idx, title FROM "Chapter" WHERE bookId=? ORDER BY idx DESC LIMIT ?`, bookID, n)
}

// WebChapterRead 章节正文页数据: 章节 + 书 + 分类名(+前后章 id/idx/title)。
func (d *DB) WebChapterRead(chapterID string) (chapter, book map[string]any, prev, next map[string]any, ok bool, err error) {
	chapter, ok, err = d.QueryMap(`SELECT id, bookId, idx, title, content, wordCount FROM "Chapter" WHERE id=?`, chapterID)
	if err != nil || !ok {
		return nil, nil, nil, nil, false, err
	}
	book, ok, err = d.QueryMap(`SELECT `+webBookCols+webBookFrom()+` WHERE b.id=?`, chapter["bookId"])
	if err != nil || !ok {
		return nil, nil, nil, nil, false, err
	}
	idx, _ := chapter["idx"].(int64)
	prev, _, err = d.QueryMap(`SELECT id, idx, title FROM "Chapter" WHERE bookId=? AND idx<? ORDER BY idx DESC LIMIT 1`, chapter["bookId"], idx)
	if err != nil {
		return nil, nil, nil, nil, false, err
	}
	next, _, err = d.QueryMap(`SELECT id, idx, title FROM "Chapter" WHERE bookId=? AND idx>? ORDER BY idx ASC LIMIT 1`, chapter["bookId"], idx)
	if err != nil {
		return nil, nil, nil, nil, false, err
	}
	return chapter, book, prev, next, true, nil
}

// WebChapterByNum 书内序号定位章节(伪静态 /read/{num}/{idx}.html)。
func (d *DB) WebChapterByNum(bookID string, idx int64) (map[string]any, bool, error) {
	return d.QueryMap(`SELECT id, idx, title FROM "Chapter" WHERE bookId=? AND idx=? LIMIT 1`, bookID, idx)
}

// WebBookTags 书籍标签(按 hits 降序)。
func (d *DB) WebBookTags(bookID string, n int) ([]string, error) {
	if n < 1 || n > 60 {
		n = 16
	}
	rows, err := d.QueryMaps(`SELECT tag FROM "BookTag" WHERE bookId=? ORDER BY hits DESC LIMIT ?`, bookID, n)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		if t := ToStr(r["tag"]); t != "" {
			out = append(out, t)
		}
	}
	return out, nil
}

// WebRelatedTags 搜索相关词: 与命中书(书名/作者/关键词 LIKE q)关联的标签聚合。
// q 为空 → 返回随机词池(全站标签按 hits 降序)。
func (d *DB) WebRelatedTags(q string, n int) ([]map[string]any, error) {
	if n < 1 || n > 60 {
		n = 12
	}
	if strings.TrimSpace(q) == "" {
		return d.QueryMaps(`SELECT bt.tag, count(*) AS hits, max(bt.bookId) AS bookId
FROM "BookTag" bt GROUP BY bt.tag ORDER BY hits DESC LIMIT ?`, n)
	}
	like := "%" + webLikeSafe(strings.TrimSpace(q)) + "%"
	return d.QueryMaps(`SELECT bt.tag, max(bt.hits) AS hits, max(bt.bookId) AS bookId
FROM "BookTag" bt JOIN "Book" b ON b.id=bt.bookId
WHERE b.name LIKE ? ESCAPE '\' OR b.author LIKE ? ESCAPE '\' OR b.keywords LIKE ? ESCAPE '\'
GROUP BY bt.tag ORDER BY hits DESC LIMIT ?`, like, like, like, n)
}

// WebKeywordHits 标签命中书(主书=hits 最高)。
func (d *DB) WebKeywordHits(tag string, n int) ([]map[string]any, error) {
	if n < 1 || n > 30 {
		n = 10
	}
	return d.QueryMaps(`SELECT b.id, b.num, b.name, b.author, substr(b.intro,1,200) AS intro, b.cover,
b.status, b.wordCount, b.latestChapter, b.categoryId, b.updatedAt, c.name AS category, bt.hits
FROM "BookTag" bt JOIN "Book" b ON b.id=bt.bookId LEFT JOIN "Category" c ON c.id=b.categoryId
WHERE bt.tag=? ORDER BY bt.hits DESC LIMIT ?`, tag, n)
}

// WebRankBooks 榜单切片(latest|words|new, top n)。
func (d *DB) WebRankBooks(sort string, n int) ([]map[string]any, error) {
	if n < 1 || n > 120 {
		n = 60
	}
	rows, _, err := d.WebListBooks(1, n, "", "", sort, "")
	return rows, err
}

// WebHotAuthors 热门作者(按书数字数聚合取前 n)。
func (d *DB) WebHotAuthors(n int) ([]string, error) {
	if n < 1 || n > 30 {
		n = 10
	}
	rows, err := d.QueryMaps(`SELECT author, count(*) AS bc FROM "Book" WHERE author<>''
GROUP BY author ORDER BY bc DESC, author ASC LIMIT ?`, n)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		if a := ToStr(r["author"]); a != "" {
			out = append(out, a)
		}
	}
	return out, nil
}

// WebRecsBooks 同分类推荐(猜您喜欢; 排除自身, 最新优先; catID 空→全站最新)。
func (d *DB) WebRecsBooks(catID, excludeID string, n int) ([]map[string]any, error) {
	if n < 1 || n > 30 {
		n = 8
	}
	var args []any
	w := ""
	if catID != "" {
		w = ` WHERE b.categoryId=?`
		args = append(args, catID)
	}
	if excludeID != "" {
		if w == "" {
			w = " WHERE "
		} else {
			w += " AND "
		}
		w += `b.id<>?`
		args = append(args, excludeID)
	}
	return d.QueryMaps(`SELECT `+webBookCols+webBookFrom()+w+` ORDER BY b.updatedAt DESC LIMIT ?`,
		append(args, n)...)
}

// WebSiteStats 前台 hero 统计(书籍/作者/总字数/章节)。
func (d *DB) WebSiteStats() (books, authors int64, words int64, chapters int64, err error) {
	if err = d.QueryRow(`SELECT count(*), count(DISTINCT author), coalesce(sum(wordCount),0) FROM "Book"`).
		Scan(&books, &authors, &words); err != nil {
		return
	}
	var chN int
	chN, err = d.Count(`SELECT count(*) FROM "Chapter" WHERE fetched=1`)
	chapters = int64(chN)
	return
}

// WebPseoBySlug PSEO 落地页(slug 精确; 仅 active)。not found → ok=false。
func (d *DB) WebPseoBySlug(slug string) (map[string]any, bool, error) {
	return d.QueryMap(`SELECT id, siteId, keyword, slug, title, description, keywords,
primaryBookId, matchedBookIds, status, updatedAt FROM "PseoPage" WHERE slug=? AND status='active' LIMIT 1`, slug)
}

// WebBooksByIDs 按 id 集合取书(保序由调用方负责)。
func (d *DB) WebBooksByIDs(ids []string) ([]map[string]any, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	if len(ids) > 60 {
		ids = ids[:60]
	}
	ph := make([]string, len(ids))
	args := make([]any, 0, len(ids))
	for i, id := range ids {
		ph[i] = "?"
		args = append(args, id)
	}
	return d.QueryMaps(`SELECT `+webBookCols+webBookFrom()+` WHERE b.id IN (`+strings.Join(ph, ",")+`)`, args...)
}

// WebSitemapBooks 伪静态书号(站点地图用)。
func (d *DB) WebSitemapBooks(limit int) ([]map[string]any, error) {
	if limit < 1 || limit > 5000 {
		limit = 2000
	}
	return d.QueryMaps(`SELECT b.num, b.updatedAt FROM "Book" b WHERE b.num IS NOT NULL ORDER BY b.updatedAt DESC LIMIT ?`, limit)
}
