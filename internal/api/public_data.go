// ============================================================
// R55-3b — /api/public/* 数据面(移植 src/app/api/public/*)
//
//	GET books / book / chapter / search / categories / tags
//	GET related / keyword / links / sites / resolve
//
// ============================================================
package api

import (
	"encoding/json"
	"math/rand"
	"net/http"
	"strings"

	"mhgl/internal/store"
)

// randIntn [0,n) 随机数(n<=0 返 0; 供 tags 洗牌)。
func randIntn(n int) int {
	if n <= 0 {
		return 0
	}
	return rand.Intn(n)
}

// jsonUnmarshal 字符串→JSON(空串直接报错, 对齐 json.Unmarshal 语义)。
func jsonUnmarshal(s string, v any) error {
	return json.Unmarshal([]byte(s), v)
}

// bookDto 单本书公开 DTO(对齐 public/books toBookDto)。
func bookDto(b map[string]any) map[string]any {
	intro := store.ToStr(b["intro"])
	if len(intro) > 120 {
		intro = truncateRunes(intro, 120)
	}
	var categoryName any = "未分类"
	if c, ok := b["category"].(map[string]any); ok && c != nil {
		if n := store.ToStr(c["name"]); n != "" {
			categoryName = n
		}
	}
	return map[string]any{
		"id": b["id"], "num": b["num"], "name": b["name"], "author": b["author"],
		"intro": intro, "cover": b["cover"], "status": b["status"],
		"wordCount": b["wordCount"], "latestChapter": b["latestChapter"],
		"category": categoryName, "categoryId": b["categoryId"], "updatedAt": b["updatedAt"],
	}
}

// (d Deps) publicBooks GET /api/public/books
func (d Deps) publicBooks(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	like := likeSafe(q.Get("q"), 100)
	cat := strings.TrimSpace(strOf(q.Get("cat"), 64))
	status := strings.TrimSpace(strOf(q.Get("status"), 20))
	sort := strings.TrimSpace(strOf(q.Get("sort"), 20))
	if sort == "" {
		sort = "latest"
	}
	page, size := pageClamp(q, 1, 24, 60)

	// ?ids= 批量直查(书架 N+1 修复口径)
	idsParam := strOf(q.Get("ids"), 64*50+64)
	if idsParam != "" {
		var ids []string
		seen := map[string]bool{}
		for _, s := range strings.Split(idsParam, ",") {
			s = strings.TrimSpace(s)
			if len(s) >= 8 && len(s) <= 64 && isAlnum(s) && !seen[s] {
				seen[s] = true
				ids = append(ids, s)
				if len(ids) >= 50 {
					break
				}
			}
		}
		if len(ids) > 0 {
			books := make([]map[string]any, 0, len(ids))
			for _, id := range ids {
				b, ok, _ := d.DB.QueryMap(`SELECT b.*, c.name AS categoryName FROM "Book" b
LEFT JOIN "Category" c ON c.id=b.categoryId WHERE b.id=?`, id)
				if ok {
					b["category"] = map[string]any{"name": b["categoryName"]}
					delete(b, "categoryName")
					books = append(books, bookDto(b))
				}
			}
			apiOK(w, map[string]any{"total": len(books), "page": 1, "size": len(ids), "books": books})
			return
		}
	}

	// 站群偏移
	offset := 0
	if siteID := strings.TrimSpace(strOf(q.Get("site"), 64)); siteID != "" {
		if site, ok, _ := d.DB.QueryMap(`SELECT offset FROM "Site" WHERE id=?`, siteID); ok {
			offset = int(store.ToInt(site["offset"]))
			if offset < 0 {
				offset = 0
			}
		}
	}

	where := []string{"1=1"}
	var args []any
	if like != "" {
		where = append(where, `(b.name LIKE ? OR b.author LIKE ? OR b.keywords LIKE ?)`)
		l := "%" + like + "%"
		args = append(args, l, l, l)
	}
	if cat != "" {
		if strings.HasPrefix(cat, "cat:") {
			name := cat[len("cat:"):]
			id := ""
			_ = d.DB.QueryRow(`SELECT id FROM "Category" WHERE name=? LIMIT 1`, name).Scan(&id)
			where = append(where, `b.categoryId=?`)
			args = append(args, id) // 未命中 → 恒空结果(合法空态)
		} else {
			where = append(where, `b.categoryId=?`)
			args = append(args, cat)
		}
	}
	if status == "unknown" || status == "ongoing" || status == "completed" {
		where = append(where, `b.status=?`)
		args = append(args, status)
	}
	orderBy := `b.updatedAt DESC`
	switch sort {
	case "words":
		orderBy = `b.wordCount DESC`
	case "new":
		orderBy = `b.createdAt DESC`
	}
	whereSQL := strings.Join(where, " AND ")
	total, err := d.DB.Count(`SELECT count(*) FROM "Book" b WHERE `+whereSQL, args...)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	// 站群偏移仅在无筛选浏览时生效
	hasFilter := like != "" || cat != "" || status != ""
	effectiveOffset := 0
	if !hasFilter {
		effectiveOffset = offset
	}
	requestedSkip := effectiveOffset + (page-1)*size
	skipCapped := requestedSkip > 10_000
	effectiveSkip := minInt(requestedSkip, 10_000)

	var books []map[string]any
	if !skipCapped {
		rows, err2 := d.DB.QueryMaps(`SELECT b.*, c.name AS categoryName FROM "Book" b
LEFT JOIN "Category" c ON c.id=b.categoryId WHERE `+whereSQL+` ORDER BY `+orderBy+` LIMIT ? OFFSET ?`,
			append(args, size, effectiveSkip)...)
		if err2 != nil {
			apiErr(w, http.StatusInternalServerError, "服务器内部错误")
			return
		}
		for _, b := range rows {
			b["category"] = map[string]any{"name": b["categoryName"]}
			delete(b, "categoryName")
			books = append(books, bookDto(b))
		}
	} else {
		books = []map[string]any{}
	}
	resp := map[string]any{
		"total": maxInt(0, total-effectiveOffset), "page": page, "size": size, "books": books,
	}
	if skipCapped {
		resp["note"] = "已超出最大可分页深度(10000), 请使用搜索或分类筛选缩小范围"
	}
	apiOK(w, resp)
}

func isAlnum(s string) bool {
	for _, c := range s {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9') {
			return false
		}
	}
	return true
}

// (d Deps) publicBook GET /api/public/book?id=&tocPage=&tocSize=
func (d Deps) publicBook(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	id := strings.TrimSpace(strOf(q.Get("id"), 64))
	if id == "" {
		apiErr(w, http.StatusBadRequest, "缺少id")
		return
	}
	tocPage, tocSize := pageClamp(q, 1, 100, 300)
	requestedSkip := (tocPage - 1) * tocSize
	effectiveSkip := minInt(requestedSkip, 10_000)

	b, ok, err := d.DB.QueryMap(`SELECT b.*, c.name AS categoryName FROM "Book" b
LEFT JOIN "Category" c ON c.id=b.categoryId WHERE b.id=?`, id)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if !ok {
		apiErr(w, http.StatusNotFound, "书籍不存在")
		return
	}
	delete(b, "sourceUrl") // 安全面(rr-d): 采集源地址不进公开面
	// 响应形态对齐 TS 原件(book 路由显式字段集): category 为字符串(非对象), 不带
	// sourceRuleId/storageMode/collectedAt/createdAt 等管理面字段
	book := map[string]any{
		"id": b["id"], "num": b["num"], "name": b["name"], "author": b["author"],
		"intro": b["intro"], "cover": b["cover"], "status": b["status"],
		"keywords": b["keywords"], "wordCount": b["wordCount"], "latestChapter": b["latestChapter"],
		"category":   orDefault(store.ToStr(b["categoryName"]), "未分类"),
		"categoryId": b["categoryId"], "updatedAt": b["updatedAt"],
	}

	total, _ := d.DB.ChapterCount(id)
	tags, _ := d.DB.QueryMaps(`SELECT * FROM "BookTag" WHERE bookId=? ORDER BY hits DESC LIMIT 30`, id)
	chapters, _ := d.DB.QueryMaps(`SELECT id,bookId,idx,title,wordCount,volume FROM "Chapter" WHERE bookId=? ORDER BY idx ASC LIMIT ? OFFSET ?`,
		id, tocSize, effectiveSkip)
	latest, _ := d.DB.QueryMaps(`SELECT id,bookId,idx,title,wordCount,volume FROM "Chapter" WHERE bookId=? ORDER BY idx DESC LIMIT 12`, id)
	apiOK(w, map[string]any{
		"book": book, "tocTotal": total, "tocPage": tocPage, "tocSize": tocSize,
		"tocTotalPages": maxInt(1, lastPage(total, tocSize)),
		"chapters":      chapters, "latestChapters": latest, "tags": tags,
	})
}

// (d Deps) publicChapter GET /api/public/chapter?id=
func (d Deps) publicChapter(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(strOf(r.URL.Query().Get("id"), 64))
	if id == "" {
		apiErr(w, http.StatusBadRequest, "缺少id")
		return
	}
	ch, ok, err := d.DB.QueryMap(`SELECT c.*, b.id AS bId, b.num AS bNum, b.name AS bName, b.author AS bAuthor,
b.status AS bStatus, b.keywords AS bKeywords
FROM "Chapter" c LEFT JOIN "Book" b ON b.id=c.bookId WHERE c.id=?`, id)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if !ok {
		apiErr(w, http.StatusNotFound, "章节不存在")
		return
	}
	content := store.ToStr(ch["content"])
	if store.ToStr(ch["storage"]) == "txt" {
		content = chapterPlainText(map[string]any{"storage": "txt", "filePath": ch["filePath"], "content": ch["content"]})
		// 存储型注入面: 段落转义后包 <p>(对齐 TS 口径; 实体先解码再转义)
		if content != "" {
			var sb strings.Builder
			for _, p := range strings.Split(content, "\n\n") {
				p = strings.TrimSpace(p)
				if p == "" {
					continue
				}
				p = strings.ReplaceAll(p, "&", "&amp;")
				p = strings.ReplaceAll(p, "<", "&lt;")
				p = strings.ReplaceAll(p, ">", "&gt;")
				sb.WriteString("<p>" + p + "</p>")
			}
			content = sb.String()
		}
	}
	// [R21-h-1] 违禁词过滤(前台公共渲染点, 对齐 TS public/chapter): 只过滤文本段不动标签
	if content != "" {
		content = applyBannedWordsToHtml(content, d.bannedWordsConfigCached())
	}
	prev, _, _ := d.DB.QueryMap(`SELECT id,idx,title FROM "Chapter" WHERE bookId=? AND idx<? ORDER BY idx DESC LIMIT 1`,
		ch["bId"], ch["idx"])
	next, _, _ := d.DB.QueryMap(`SELECT id,idx,title FROM "Chapter" WHERE bookId=? AND idx>? ORDER BY idx ASC LIMIT 1`,
		ch["bId"], ch["idx"])
	apiOK(w, map[string]any{
		"chapter": map[string]any{
			"id": ch["id"], "idx": ch["idx"], "title": ch["title"], "content": content,
			"wordCount": ch["wordCount"], "storage": ch["storage"],
		},
		"book": map[string]any{
			"id": ch["bId"], "num": ch["bNum"], "name": ch["bName"],
			"author": ch["bAuthor"], "status": ch["bStatus"], "keywords": ch["bKeywords"],
		},
		"prev": prev, "next": next,
	})
}

// (d Deps) publicSearch GET /api/public/search?q=&limit=
func (d Deps) publicSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	kw := likeSafe(q.Get("q"), 100)
	limit := clampIntOf(q.Get("limit"), 20, 1, 50)
	if kw == "" {
		apiOK(w, map[string]any{"q": kw, "books": []any{}})
		return
	}
	l := "%" + kw + "%"
	books, err := d.DB.QueryMaps(`SELECT b.id,b.num,b.name,b.author,b.intro,b.cover,b.status,b.wordCount,
c.name AS categoryName FROM "Book" b LEFT JOIN "Category" c ON c.id=b.categoryId
WHERE b.name LIKE ? OR b.author LIKE ? OR b.intro LIKE ? OR b.keywords LIKE ?
OR b.id IN (SELECT bookId FROM "BookTag" WHERE tag LIKE ?)
ORDER BY b.wordCount DESC LIMIT ?`, l, l, l, l, l, limit)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	out := make([]map[string]any, 0, len(books))
	for _, b := range books {
		intro := store.ToStr(b["intro"])
		if len(intro) > 150 {
			intro = truncateRunes(intro, 150)
		}
		catName := "未分类"
		if n := store.ToStr(b["categoryName"]); n != "" {
			catName = n
		}
		out = append(out, map[string]any{
			"id": b["id"], "num": b["num"], "name": b["name"], "author": b["author"],
			"intro": intro, "cover": b["cover"], "status": b["status"],
			"wordCount": b["wordCount"], "category": catName,
		})
	}
	relatedTags, _ := d.DB.QueryMaps(`SELECT t.tag, t.bookId, b.name AS bookName FROM "BookTag" t
LEFT JOIN "Book" b ON b.id=t.bookId WHERE t.tag LIKE ? LIMIT 12`, l)
	related := make([]map[string]any, 0, len(relatedTags))
	for _, t := range relatedTags {
		related = append(related, map[string]any{"tag": t["tag"], "bookId": t["bookId"], "bookName": t["bookName"]})
	}
	apiOK(w, map[string]any{"q": kw, "books": out, "relatedTags": related})
}

// (d Deps) publicCategories GET /api/public/categories?limit=
func (d Deps) publicCategories(w http.ResponseWriter, r *http.Request) {
	limit := clampIntOf(r.URL.Query().Get("limit"), 24, 1, 60)
	cats, err := d.DB.QueryMaps(`SELECT c.id, c.name,
 (SELECT count(*) FROM "Book" b WHERE b.categoryId=c.id) AS bookCount
FROM "Category" c
WHERE EXISTS (SELECT 1 FROM "Book" b WHERE b.categoryId=c.id)
ORDER BY c.sortOrder ASC LIMIT ?`, limit)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	items := make([]map[string]any, 0, len(cats))
	for _, c := range cats {
		items = append(items, map[string]any{"id": c["id"], "name": c["name"], "bookCount": c["bookCount"]})
	}
	apiOK(w, map[string]any{"items": items})
}

// (d Deps) publicTags GET /api/public/tags?n=
func (d Deps) publicTags(w http.ResponseWriter, r *http.Request) {
	n := clampIntOf(r.URL.Query().Get("n"), 24, 1, 120)
	rows, err := d.DB.QueryMaps(`SELECT tag, MAX(hits) AS mh FROM "BookTag" GROUP BY tag ORDER BY mh DESC LIMIT 800`)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	pool := make([]string, 0, len(rows))
	for _, row := range rows {
		pool = append(pool, store.ToStr(row["tag"]))
	}
	// Fisher-Yates 洗牌取前 n
	for i := len(pool) - 1; i > 0; i-- {
		j := int(randIntn(i + 1))
		pool[i], pool[j] = pool[j], pool[i]
	}
	if len(pool) > n {
		pool = pool[:n]
	}
	apiOK(w, map[string]any{"tags": pool})
}

// (d Deps) publicKeyword GET /api/public/keyword?kw=&tag=
func (d Deps) publicKeyword(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	kw := strings.TrimSpace(strOf(q.Get("kw"), 100))
	tag := strings.TrimSpace(strOf(q.Get("tag"), 100))
	if tag == "" {
		tag = kw
	}
	if tag == "" {
		apiOK(w, map[string]any{"tag": "", "book": nil, "related": []any{}, "otherBooks": []any{}})
		return
	}
	hits, err := d.DB.QueryMaps(`SELECT t.*, b.name AS bName, b.num AS bNum, b.author AS bAuthor,
b.intro AS bIntro, b.cover AS bCover, b.status AS bStatus, b.wordCount AS bWordCount,
c.name AS bCategory
FROM "BookTag" t LEFT JOIN "Book" b ON b.id=t.bookId LEFT JOIN "Category" c ON c.id=b.categoryId
WHERE t.tag=? ORDER BY t.hits DESC LIMIT 10`, tag)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	var mainBook map[string]any
	otherBooks := []map[string]any{}
	related := []string{}
	if len(hits) > 0 {
		h := hits[0]
		mainBook = map[string]any{
			"id": h["bookId"], "num": h["bNum"], "name": h["bName"], "author": h["bAuthor"],
			"intro": truncateRunes(store.ToStr(h["bIntro"]), 200),
			"cover": h["bCover"], "status": h["bStatus"], "wordCount": h["bWordCount"],
			"category": orDefault(store.ToStr(h["bCategory"]), "未分类"),
		}
		moreTags, _ := d.DB.QueryMaps(`SELECT tag FROM "BookTag" WHERE bookId=? AND tag<>? ORDER BY hits DESC LIMIT 16`,
			h["bookId"], tag)
		for _, t := range moreTags {
			related = append(related, store.ToStr(t["tag"]))
		}
	}
	for _, h := range hits[minInt(1, len(hits)):] {
		otherBooks = append(otherBooks, map[string]any{"id": h["bookId"], "name": h["bName"], "author": h["bAuthor"]})
	}
	apiOK(w, map[string]any{"tag": tag, "book": mainBook, "otherBooks": otherBooks, "related": related})
}

// (d Deps) publicRelated GET /api/public/related?id=&limit=
func (d Deps) publicRelated(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	id := strings.TrimSpace(strOf(q.Get("id"), 64))
	limit := clampIntOf(q.Get("limit"), 6, 1, 12)
	if id == "" {
		apiErr(w, http.StatusBadRequest, "缺少id")
		return
	}
	book, ok, _ := d.DB.QueryMap(`SELECT id,categoryId FROM "Book" WHERE id=?`, id)
	if !ok {
		apiErr(w, http.StatusNotFound, "书籍不存在")
		return
	}
	pick := func(b map[string]any) map[string]any {
		return map[string]any{
			"id": b["id"], "num": b["num"], "name": b["name"], "author": b["author"],
			"cover": b["cover"], "status": b["status"], "wordCount": b["wordCount"],
			"category":   orDefault(store.ToStr(b["categoryName"]), "未分类"),
			"categoryId": b["categoryId"],
		}
	}
	out := []map[string]any{}
	in := map[string]bool{id: true}
	qSQL := `SELECT b.*, c.name AS categoryName FROM "Book" b LEFT JOIN "Category" c ON c.id=b.categoryId WHERE `
	if cid := store.ToStr(book["categoryId"]); cid != "" {
		rows, _ := d.DB.QueryMaps(qSQL+`b.id<>? AND b.categoryId=? ORDER BY b.wordCount DESC LIMIT ?`, id, cid, limit)
		for _, b := range rows {
			if in[store.ToStr(b["id"])] || len(out) >= limit {
				continue
			}
			in[store.ToStr(b["id"])] = true
			out = append(out, pick(b))
		}
	}
	if len(out) < limit {
		rows, _ := d.DB.QueryMaps(qSQL+`b.id<>? ORDER BY b.wordCount DESC LIMIT ?`, id, limit)
		for _, b := range rows {
			if in[store.ToStr(b["id"])] || len(out) >= limit {
				continue
			}
			in[store.ToStr(b["id"])] = true
			out = append(out, pick(b))
		}
	}
	apiOK(w, map[string]any{"books": out})
}

// (d Deps) publicLinks GET /api/public/links?site=
// 简化档: 链轮 = 启用且参与链轮的站点直链(TS 版随机指向站内书籍页, PARITY 记录)。
func (d Deps) publicLinks(w http.ResponseWriter, r *http.Request) {
	siteID := strings.TrimSpace(strOf(r.URL.Query().Get("site"), 64))
	friend, _ := d.DB.ListFriendLinks()
	fl := make([]map[string]any, 0, len(friend))
	for _, f := range friend {
		fl = append(fl, f)
	}
	cfg := map[string]any{"enabled": true, "mode": "home", "count": 6}
	if raw, ok, _ := d.DB.GetSetting("linkwheel"); ok {
		var m map[string]any
		if jsonUnmarshal(raw, &m) == nil && m != nil {
			if m["enabled"] == false {
				cfg["enabled"] = false
			}
			if m["mode"] == "book" || m["mode"] == "mixed" {
				cfg["mode"] = m["mode"]
			}
			cfg["count"] = clampIntOf(m["count"], 6, 1, 30)
		}
	}
	wheel := []map[string]any{}
	if cfg["enabled"] == true {
		rows, _ := d.DB.QueryMaps(`SELECT id,name,domain,title FROM "Site" WHERE status=1 AND inLinkWheel=1 ORDER BY createdAt ASC`)
		for _, s := range rows {
			if siteID != "" && store.ToStr(s["id"]) == siteID {
				continue // 永不指向自己
			}
			dom := store.ToStr(s["domain"])
			if dom == "" {
				continue
			}
			name := orDefault(store.ToStr(s["title"]), store.ToStr(s["name"]))
			wheel = append(wheel, map[string]any{"url": "https://" + dom, "name": name})
			if len(wheel) >= clampIntOf(cfg["count"], 6, 1, 30) {
				break
			}
		}
	}
	apiOK(w, map[string]any{"friend": fl, "wheel": wheel, "wheelEnabled": cfg["enabled"], "mode": cfg["mode"], "count": cfg["count"]})
}

// (d Deps) publicSites GET /api/public/sites
func (d Deps) publicSites(w http.ResponseWriter, r *http.Request) {
	rows, err := d.DB.QueryMaps(`SELECT id,name,domain,themeId,title,description,keywords,icbm,geoRegion,geoPlacename,
offset,isDefault,inLinkWheel FROM "Site" WHERE status=1 ORDER BY createdAt ASC LIMIT 500`)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	preset := d.DB.APIPseudoPreset()
	seoTpl := d.currentSeoTpl()
	overrides := map[string]any{}
	if raw, ok, _ := d.DB.GetSetting("theme_overrides"); ok {
		if jsonUnmarshal(raw, &overrides) != nil || overrides == nil {
			overrides = map[string]any{}
		}
	}
	out := make([]map[string]any, 0, len(rows))
	for _, s := range rows {
		s["pseudoPreset"] = preset
		s["seoTpl"] = seoTpl
		s["themeOverrides"] = overrides
		out = append(out, s)
	}
	apiOK(w, out)
}

// currentSeoTpl 当前生效模板(默认+覆盖合并)。
func (d Deps) currentSeoTpl() map[string]any {
	tpl := deepCopyMap(defaultSeoTplSet)
	if raw, ok, _ := d.DB.GetSetting("seoTemplates"); ok {
		var m map[string]any
		if jsonUnmarshal(raw, &m) == nil && len(m) > 0 {
			tpl = sanitizeSeoTpl(m)
		}
	}
	return tpl
}

// (d Deps) publicResolve GET /api/public/resolve?path=/book/1001.html
func (d Deps) publicResolve(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimSpace(strOf(r.URL.Query().Get("path"), 512))
	if path == "" || !strings.HasPrefix(path, "/") {
		apiOK(w, nil)
		return
	}
	parsed := parsePrettyPath(path)
	if parsed == nil {
		apiOK(w, nil)
		return
	}
	// 书籍: 数字 token → num; cuid → id
	var bookID string
	if n := tokenToNum(parsed.bookToken); n > 0 {
		if b, err := d.DB.GetBookByNum(n); err == nil && b != nil {
			bookID = b.ID
		}
	} else if tokenIsCuid(parsed.bookToken) {
		if b, ok, _ := d.DB.QueryMap(`SELECT id FROM "Book" WHERE id=?`, parsed.bookToken); ok {
			bookID = store.ToStr(b["id"])
		}
	}
	if bookID == "" {
		apiOK(w, nil)
		return
	}
	if parsed.view == "book" || parsed.chapterToken == "" {
		apiOK(w, map[string]any{"view": "book", "bookId": bookID})
		return
	}
	// 章节: 数字 token → idx; cuid → id(校验归属书)
	var chapterID string
	if n := tokenToNum(parsed.chapterToken); n > 0 {
		if c, ok, _ := d.DB.QueryMap(`SELECT id FROM "Chapter" WHERE bookId=? AND idx=?`, bookID, n); ok {
			chapterID = store.ToStr(c["id"])
		}
	} else if tokenIsCuid(parsed.chapterToken) {
		if c, ok, _ := d.DB.QueryMap(`SELECT id FROM "Chapter" WHERE id=? AND bookId=?`, parsed.chapterToken, bookID); ok {
			chapterID = store.ToStr(c["id"])
		}
	}
	if chapterID == "" {
		apiOK(w, nil)
		return
	}
	apiOK(w, map[string]any{"view": "read", "bookId": bookID, "chapterId": chapterID})
}
