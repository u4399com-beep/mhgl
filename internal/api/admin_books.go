// ============================================================
// R55-3b — /api/admin/books 系列(移植 src/app/api/admin/books/*)
//
//	GET/POST /api/admin/books          列表(q/categoryId/status/sort/分页) / 手动新增
//	GET/PUT/DELETE /api/admin/books/{id}
//	GET  /api/admin/books/{id}/toc     分页章节列表(skip 上限 10000)
//	POST /api/admin/books/{id}/recrawl 以书建单本增量/全量任务并启动
//	GET/POST/DELETE /api/admin/books/{id}/keywords  标签(manualTags 写入/suggest 词列表/删 tag)
//	POST /api/admin/books/batch        delete|category|status|recrawl
//
// ============================================================
package api

import (
	"net/http"
	"os"
	"strings"

	"mhgl/internal/store"
)

var bookStatuses = map[string]bool{"unknown": true, "ongoing": true, "completed": true}

// (d Deps) adminBooksList GET /api/admin/books
func (d Deps) adminBooksList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	qLike := likeSafe(q.Get("q"), 100)
	categoryID := strings.TrimSpace(strOf(q.Get("categoryId"), 64))
	status := strings.TrimSpace(strOf(q.Get("status"), 20))
	sort := strings.TrimSpace(strOf(q.Get("sort"), 20))
	page0, size := pageClamp(q, 1, 20, 50)

	where := []string{"1=1"}
	var args []any
	if qLike != "" {
		where = append(where, `(b.name LIKE ? OR b.author LIKE ? OR b.keywords LIKE ?)`)
		like := "%" + qLike + "%"
		args = append(args, like, like, like)
	}
	if categoryID != "" {
		where = append(where, `b.categoryId=?`)
		args = append(args, categoryID)
	}
	if bookStatuses[status] {
		where = append(where, `b.status=?`)
		args = append(args, status)
	}
	orderBy := `b.updatedAt DESC`
	if sort == "words" {
		orderBy = `b.wordCount DESC`
	}
	whereSQL := strings.Join(where, " AND ")
	total, err := d.DB.Count(`SELECT count(*) FROM "Book" b WHERE `+whereSQL, args...)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	page := minInt(page0, lastPage(total, size))
	rows, err := d.DB.QueryMaps(`SELECT b.*, c.name AS categoryName,
 (SELECT count(*) FROM "Chapter" ch WHERE ch.bookId=b.id) AS _count_chapters,
 (SELECT count(*) FROM "BookTag" bt WHERE bt.bookId=b.id) AS _count_tags
FROM "Book" b LEFT JOIN "Category" c ON c.id=b.categoryId
WHERE `+whereSQL+` ORDER BY `+orderBy+` LIMIT ? OFFSET ?`,
		append(args, size, (page-1)*size)...)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	for _, row := range rows {
		// TS include category:{...} + _count; 归一为 category 对象与 _count 子对象
		cat := map[string]any{"name": row["categoryName"]}
		row["category"] = cat
		row["_count"] = map[string]any{"chapters": row["_count_chapters"], "tags": row["_count_tags"]}
		delete(row, "categoryName")
		delete(row, "_count_chapters")
		delete(row, "_count_tags")
	}
	apiOK(w, map[string]any{"total": total, "page": page, "size": size, "books": rows})
}

// (d Deps) adminBooksCreate POST /api/admin/books
func (d Deps) adminBooksCreate(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	name := strings.TrimSpace(strOf(body["name"], 200))
	if name == "" {
		apiErr(w, http.StatusBadRequest, "书名必填")
		return
	}
	var categoryID any
	if cid := strings.TrimSpace(strOf(body["categoryId"], 64)); cid != "" {
		if exists, ok, _ := d.DB.QueryMap(`SELECT id FROM "Category" WHERE id=?`, cid); !ok || exists == nil {
			apiErr(w, http.StatusNotFound, "所选分类不存在")
			return
		}
		categoryID = cid
	} else if catName := strings.TrimSpace(strOf(body["categoryName"], 50)); catName != "" {
		id, err := d.DB.APIUpsertCategoryByName(catName, d.DB.APICategoryMaxSortOrder()+1)
		if err != nil {
			apiErr(w, http.StatusInternalServerError, "服务器内部错误")
			return
		}
		categoryID = id
	}

	status := "unknown"
	if bookStatuses[strOf(body["status"], 20)] {
		status = strOf(body["status"], 20)
	}
	sourceURL := ""
	if raw := body["sourceUrl"]; raw != nil && strOf(raw, 0) != "" {
		sourceURL = httpUrlOf(raw, 2000)
		if sourceURL == "" {
			apiErr(w, http.StatusBadRequest, "来源地址格式非法(需 http/https)")
			return
		}
	}
	storageMode := "db"
	if strOf(body["storageMode"], 10) == "txt" {
		storageMode = "txt"
	}
	// 伪静态书号 max+1(NextBookNum; 撞号由 num 唯一约束兜底重试一次)
	num, nerr := d.DB.NextBookNum()
	if nerr != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	id := d.DB.NewID()
	now := store.NowMS()
	author := strings.TrimSpace(strOf(body["author"], 100))
	if author == "" {
		author = "佚名"
	}
	insert := func(n int64) error {
		_, e := d.DB.Exec(`INSERT INTO "Book" (id,num,name,author,categoryId,intro,cover,status,keywords,latestChapter,
wordCount,sourceUrl,sourceRuleId,storageMode,collectedAt,createdAt,updatedAt)
VALUES (?,?,?,?,?,?,?,?,?,'',0,?,NULL,?,NULL,?,?)`,
			id, n, name, author, nullString(categoryID), strOf(body["intro"], 20_000), strOf(body["cover"], 2000),
			status, strOf(body["keywords"], 500), sourceURL, storageMode, now, now)
		return e
	}
	if err := insert(num); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			if err2 := insert(num + 1); err2 != nil {
				apiErr(w, http.StatusInternalServerError, "服务器内部错误")
				return
			}
		} else if strings.Contains(err.Error(), "FOREIGN KEY") {
			apiErr(w, http.StatusConflict, "分类不存在或已被删除, 请刷新后重试")
			return
		} else {
			apiErr(w, http.StatusInternalServerError, "服务器内部错误")
			return
		}
	}
	row, _, _ := d.DB.QueryMap(`SELECT * FROM "Book" WHERE id=?`, id)
	apiOK(w, row)
}

// nullString nil→sql null 语义(map 序列化时 nil→null)。
func nullString(v any) any {
	if s, _ := v.(string); s == "" || v == nil {
		return nil
	}
	return v
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// (d Deps) adminBookDetail GET /api/admin/books/{id}
func (d Deps) adminBookDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	row, ok, err := d.DB.QueryMap(`SELECT b.*, c.name AS categoryName FROM "Book" b
LEFT JOIN "Category" c ON c.id=b.categoryId WHERE b.id=?`, id)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if !ok {
		apiErr(w, http.StatusNotFound, "书籍不存在")
		return
	}
	row["category"] = map[string]any{"name": row["categoryName"]}
	delete(row, "categoryName")
	tags, _ := d.DB.QueryMaps(`SELECT * FROM "BookTag" WHERE bookId=? ORDER BY hits DESC LIMIT 500`, id)
	row["tags"] = tags
	n, _ := d.DB.ChapterCount(id)
	row["_count"] = map[string]any{"chapters": n}
	apiOK(w, row)
}

// (d Deps) adminBookUpdate PUT /api/admin/books/{id}
func (d Deps) adminBookUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Book" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "书籍不存在")
		return
	}
	sets := []string{"updatedAt=?"}
	args := []any{store.NowMS()}
	fail := func(status int, msg string) {
		apiErr(w, status, msg)
	}
	if v, has := body["name"]; has {
		name := strings.TrimSpace(strOf(v, 200))
		if name == "" {
			fail(http.StatusBadRequest, "书名不能为空")
			return
		}
		sets, args = append(sets, "name=?"), append(args, name)
	}
	if v, has := body["author"]; has {
		a := strings.TrimSpace(strOf(v, 100))
		if a == "" {
			a = "佚名"
		}
		sets, args = append(sets, "author=?"), append(args, a)
	}
	if v, has := body["intro"]; has {
		sets, args = append(sets, "intro=?"), append(args, strOf(v, 20_000))
	}
	if v, has := body["cover"]; has {
		sets, args = append(sets, "cover=?"), append(args, strOf(v, 2000))
	}
	if v, has := body["status"]; has {
		if !bookStatuses[strOf(v, 20)] {
			fail(http.StatusBadRequest, "无效的书籍状态")
			return
		}
		sets, args = append(sets, "status=?"), append(args, strOf(v, 20))
	}
	if v, has := body["keywords"]; has {
		sets, args = append(sets, "keywords=?"), append(args, strOf(v, 500))
	}
	if v, has := body["storageMode"]; has {
		sm := strOf(v, 10)
		if sm != "db" && sm != "txt" {
			fail(http.StatusBadRequest, "无效的存储方式")
			return
		}
		sets, args = append(sets, "storageMode=?"), append(args, sm)
	}
	if v, has := body["latestChapter"]; has {
		sets, args = append(sets, "latestChapter=?"), append(args, strOf(v, 200))
	}
	if v, has := body["sourceUrl"]; has {
		u := ""
		if strOf(v, 0) != "" {
			u = httpUrlOf(v, 2000)
			if u == "" {
				fail(http.StatusBadRequest, "来源地址格式非法(需 http/https)")
				return
			}
		}
		sets, args = append(sets, "sourceUrl=?"), append(args, u)
	}
	if v, has := body["sourceRuleId"]; has {
		rid := strings.TrimSpace(strOf(v, 64))
		if rid != "" {
			if exists, _ := d.DB.APIRuleExists(rid); !exists {
				fail(http.StatusNotFound, "来源规则不存在")
				return
			}
		} else {
			rid = ""
		}
		sets, args = append(sets, "sourceRuleId=?"), append(args, nullString(rid))
	}
	if v, has := body["categoryId"]; has {
		cid := strings.TrimSpace(strOf(v, 64))
		if cid != "" {
			if _, ok2, _ := d.DB.QueryMap(`SELECT id FROM "Category" WHERE id=?`, cid); !ok2 {
				fail(http.StatusNotFound, "所选分类不存在")
				return
			}
		} else {
			cid = ""
		}
		sets, args = append(sets, "categoryId=?"), append(args, nullString(cid))
	}
	args = append(args, id)
	if _, err := d.DB.Exec(`UPDATE "Book" SET `+strings.Join(sets, ", ")+` WHERE id=?`, args...); err != nil {
		if strings.Contains(err.Error(), "FOREIGN KEY") {
			apiErr(w, http.StatusConflict, "所选分类或来源规则已被删除, 请刷新后重试")
			return
		}
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	row, _, _ := d.DB.QueryMap(`SELECT * FROM "Book" WHERE id=?`, id)
	apiOK(w, row)
}

// (d Deps) adminBookDelete DELETE /api/admin/books/{id}
func (d Deps) adminBookDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Book" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "书籍不存在")
		return
	}
	// 章节/标签/下载任务由 DDL 级联清理; txt 章节目录尽力清理
	_ = os.RemoveAll("web/novels/" + id)
	if _, err := d.DB.Exec(`DELETE FROM "Book" WHERE id=?`, id); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, nil)
}

// (d Deps) adminBookToc GET /api/admin/books/{id}/toc
func (d Deps) adminBookToc(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	q := r.URL.Query()
	page, size := pageClamp(q, 1, 50, 200)
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Book" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "书籍不存在")
		return
	}
	total, err := d.DB.ChapterCount(id)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	page = minInt(page, lastPage(total, size))
	skip := minInt((page-1)*size, 10_000) // R4A-5 skip 上限
	rows, err := d.DB.QueryMaps(`SELECT id,bookId,idx,title,url,storage,filePath,wordCount,fetched,volume,updatedAt
FROM "Chapter" WHERE bookId=? ORDER BY idx ASC LIMIT ? OFFSET ?`, id, size, skip)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, map[string]any{"total": total, "page": page, "size": size, "chapters": rows})
}

// (d Deps) adminBookRecrawl POST /api/admin/books/{id}/recrawl
func (d Deps) adminBookRecrawl(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	book, ok, err := d.DB.QueryMap(`SELECT id,name,sourceUrl,sourceRuleId,storageMode FROM "Book" WHERE id=?`, id)
	if err != nil || !ok {
		apiErr(w, http.StatusNotFound, "书籍不存在")
		return
	}
	sourceURL := strOf(book["sourceUrl"], 2000)
	if sourceURL == "" {
		apiErr(w, http.StatusBadRequest, "该书无来源地址, 无法重采集")
		return
	}
	recrawlMode := "incremental"
	if strOf(body["mode"], 10) == "full" {
		recrawlMode = "full"
	}
	ruleID := nullString(book["sourceRuleId"])
	if ruleID == nil || !func() bool { ok, _ := d.DB.APIRuleExists(strOf(ruleID, 64)); return ok }() {
		anyRule, ok2, _ := d.DB.QueryMap(`SELECT id FROM "Rule" ORDER BY createdAt ASC LIMIT 1`)
		if !ok2 {
			apiErr(w, http.StatusBadRequest, "系统中无采集规则, 请先创建")
			return
		}
		ruleID = strOf(anyRule["id"], 64)
	}
	// R3-40: 禁用规则不允许直接重采
	enabled, _ := d.DB.Count(`SELECT count(*) FROM "Rule" WHERE id=? AND enabled=1`, strOf(ruleID, 64))
	if enabled == 0 {
		apiErr(w, http.StatusBadRequest, "规则已禁用, 请先启用规则")
		return
	}
	storageMode := "db"
	if strOf(book["storageMode"], 10) == "txt" {
		storageMode = "txt"
	}
	name := "增量更新重采:《" + truncateRunes(strOf(book["name"], 100), 80) + "》"
	if recrawlMode == "full" {
		name = "完全覆盖重采:《" + truncateRunes(strOf(book["name"], 100), 80) + "》"
	}
	taskID := d.DB.NewID()
	now := store.NowMS()
	_, err = d.DB.Exec(`INSERT INTO "Task" (id,name,ruleId,mode,bookUrl,recrawlMode,storageMode,fetchConfig,
threadMin,threadMax,intervalMin,intervalMax,smartCategory,smartComplete,autoSuggest,autoRefresh,refreshIntervalMin,
status,progress,stats,createdAt,updatedAt)
VALUES (?,?,?,?,?,?,?,'{}',2,4,300,1200,0,1,0,0,30,'pending','{}','{}',?,?)`,
		taskID, name, strOf(ruleID, 64), "single", sourceURL, recrawlMode, storageMode, now, now)
	if err != nil {
		if strings.Contains(err.Error(), "FOREIGN KEY") {
			apiErr(w, http.StatusConflict, "所选采集规则已被删除, 请刷新后重试")
			return
		}
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if err := d.Tasks.Start(taskID); err != nil {
		apiErr(w, http.StatusInternalServerError, "重采任务已创建但启动失败: "+err.Error())
		return
	}
	row, _, _ := d.DB.QueryMap(`SELECT * FROM "Task" WHERE id=?`, taskID)
	apiOK(w, row)
}

// truncateRunes 按码点截断(代理对不斩半)。
func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

// (d Deps) adminBookKeywords GET /api/admin/books/{id}/keywords
func (d Deps) adminBookKeywords(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Book" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "书籍不存在")
		return
	}
	tags, err := d.DB.QueryMaps(`SELECT * FROM "BookTag" WHERE bookId=? ORDER BY hits DESC LIMIT 500`, id)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, tags)
}

// (d Deps) adminBookKeywordsPost POST /api/admin/books/{id}/keywords
// 简化档: 搜索引擎下拉词实时抓取未迁移(外部 suggest 引擎随 TS 运行时退役);
// manualTags 显式写入 + 既有词自增命中保留, engines 恒空数组(形态不变)。
func (d Deps) adminBookKeywordsPost(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	if _, ok, _ := d.DB.QueryMap(`SELECT id,name FROM "Book" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "书籍不存在")
		return
	}
	words := []string{}
	added, updated := 0, 0
	if tags, ok := body["manualTags"].([]any); ok {
		for _, t := range tags {
			ts, ok := t.(string)
			if !ok {
				continue
			}
			tag := strings.TrimSpace(strOf(ts, 60))
			if tag == "" || len(words) >= 50 {
				continue
			}
			n := upsertBookTag(d, id, tag, "manual")
			if n == 0 {
				added++
			} else {
				updated++
			}
			words = append(words, tag)
		}
	}
	apiOK(w, map[string]any{"added": added, "updated": updated, "words": words, "engines": []any{}, "engineDetail": []any{}})
}

// upsertBookTag (bookId,tag) 幂等写入; 返回该行 hits(0=新增)。
func upsertBookTag(d Deps, bookID, tag, source string) int {
	var hits int
	err := d.DB.QueryRow(`SELECT hits FROM "BookTag" WHERE bookId=? AND tag=?`, bookID, tag).Scan(&hits)
	if err == nil {
		_, _ = d.DB.Exec(`UPDATE "BookTag" SET hits=hits+1 WHERE bookId=? AND tag=?`, bookID, tag)
		return hits + 1
	}
	_, _ = d.DB.Exec(`INSERT INTO "BookTag" (id,bookId,tag,source,hits) VALUES (?,?,?,?,0)`,
		d.DB.NewID(), bookID, tag, source)
	return 0
}

// (d Deps) adminBookKeywordsDelete DELETE /api/admin/books/{id}/keywords?tag=
func (d Deps) adminBookKeywordsDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Book" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "书籍不存在")
		return
	}
	tag := strings.TrimSpace(strOf(r.URL.Query().Get("tag"), 100))
	if tag == "" {
		apiErr(w, http.StatusBadRequest, "缺少tag参数")
		return
	}
	_, _ = d.DB.Exec(`DELETE FROM "BookTag" WHERE bookId=? AND tag=?`, id, tag)
	apiOK(w, nil)
}

// (d Deps) adminBooksBatch POST /api/admin/books/batch
func (d Deps) adminBooksBatch(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	action, ids, payload, errMsg := parseBatchBody(body, []string{"delete", "category", "status", "recrawl"})
	if errMsg != "" {
		apiErr(w, http.StatusBadRequest, errMsg)
		return
	}
	skipped := []batchSkip{}
	payloadStr := func(key string) string {
		if payload == nil {
			return ""
		}
		s, _ := payload[key].(string)
		return strings.TrimSpace(strOf(s, 200))
	}

	switch action {
	case "delete":
		for _, id := range ids {
			if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Book" WHERE id=?`, id); !ok {
				skipped = append(skipped, skipItem("书籍不存在(可能已删除)", ""))
				continue
			}
			_ = os.RemoveAll("web/novels/" + id)
			if _, err := d.DB.Exec(`DELETE FROM "Book" WHERE id=?`, id); err != nil {
				skipped = append(skipped, skipItem("操作失败(内部错误), 请重试", ""))
				continue
			}
		}
		apiOK(w, map[string]any{"affected": len(ids) - len(skipped), "skipped": skipped})
	case "category":
		cid := payloadStr("categoryId")
		if cid != "" {
			if exists, ok2, _ := d.DB.QueryMap(`SELECT id FROM "Category" WHERE id=?`, cid); !ok2 || exists == nil {
				apiErr(w, http.StatusNotFound, "所选分类不存在")
				return
			}
		}
		for _, id := range ids {
			if _, err := d.DB.Exec(`UPDATE "Book" SET categoryId=?, updatedAt=? WHERE id=?`,
				nullString(cid), store.NowMS(), id); err != nil {
				skipped = append(skipped, skipItem("操作失败(内部错误), 请重试", ""))
			}
		}
		apiOK(w, map[string]any{"affected": len(ids) - len(skipped), "skipped": skipped})
	case "status":
		st := payloadStr("status")
		if !bookStatuses[st] {
			apiErr(w, http.StatusBadRequest, "无效的书籍状态")
			return
		}
		for _, id := range ids {
			if _, err := d.DB.Exec(`UPDATE "Book" SET status=?, updatedAt=? WHERE id=?`, st, store.NowMS(), id); err != nil {
				skipped = append(skipped, skipItem("操作失败(内部错误), 请重试", ""))
			}
		}
		apiOK(w, map[string]any{"affected": len(ids) - len(skipped), "skipped": skipped})
	case "recrawl":
		if len(ids) > 20 {
			apiErr(w, http.StatusBadRequest, "单次批量重采最多 20 本, 请分批操作")
			return
		}
		mode := "incremental"
		if payloadStr("mode") == "full" {
			mode = "full"
		}
		fallbackRule, okR, _ := d.DB.QueryMap(`SELECT id FROM "Rule" ORDER BY createdAt ASC LIMIT 1`)
		if !okR {
			apiErr(w, http.StatusBadRequest, "系统中无采集规则, 请先创建")
			return
		}
		affected := 0
		for _, id := range ids {
			b, ok, _ := d.DB.QueryMap(`SELECT id,name,sourceUrl,sourceRuleId,storageMode FROM "Book" WHERE id=?`, id)
			if !ok {
				skipped = append(skipped, skipItem("书籍不存在(可能已删除)", ""))
				continue
			}
			sourceURL := strOf(b["sourceUrl"], 2000)
			if sourceURL == "" {
				skipped = append(skipped, skipItem("无来源地址, 无法重采集", strOf(b["name"], 100)))
				continue
			}
			ruleID := strOf(b["sourceRuleId"], 64)
			if exists, _ := d.DB.APIRuleExists(ruleID); !exists {
				ruleID = strOf(fallbackRule["id"], 64)
			}
			storageMode := "db"
			if strOf(b["storageMode"], 10) == "txt" {
				storageMode = "txt"
			}
			name := "增量更新重采:《" + truncateRunes(strOf(b["name"], 100), 80) + "》"
			if mode == "full" {
				name = "完全覆盖重采:《" + truncateRunes(strOf(b["name"], 100), 80) + "》"
			}
			taskID := d.DB.NewID()
			now := store.NowMS()
			if _, err := d.DB.Exec(`INSERT INTO "Task" (id,name,ruleId,mode,bookUrl,recrawlMode,storageMode,fetchConfig,
threadMin,threadMax,intervalMin,intervalMax,smartCategory,smartComplete,autoSuggest,autoRefresh,refreshIntervalMin,
status,progress,stats,createdAt,updatedAt)
VALUES (?,?,?,?,?,?,?,'{}',2,4,300,1200,0,1,0,0,30,'pending','{}','{}',?,?)`,
				taskID, name, ruleID, "single", sourceURL, mode, storageMode, now, now); err != nil {
				skipped = append(skipped, skipItem("操作失败(内部错误), 请重试", strOf(b["name"], 100)))
				continue
			}
			if err := d.Tasks.Start(taskID); err != nil {
				skipped = append(skipped, skipItem("任务已创建但启动失败: "+err.Error(), strOf(b["name"], 100)))
				continue
			}
			affected++
		}
		apiOK(w, map[string]any{"affected": affected, "skipped": skipped})
	}
}
