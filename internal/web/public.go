// ============================================================
// 前台 SSR handlers — aijjxs 默认主题(结构与视觉对齐 src/components/public/sites/aijjxs)
//
//	视图: home/book/toc/read/search/keyword/category/ranking/fulltext + PSEO + history(空态)
//	数据面: 全部走 internal/store(QueryMaps/WebXxx); 站群 ?site= 切站; 站点 TDK/geo/ICP
//
// ============================================================
package web

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"mhgl/internal/store"
)

// resolveSite 站点解析链: ?site=(status 校验) → 默认站 → 任意启用站(对齐 resolveMetaSite)。
// 永不返回 nil(无站行 → 空表): 防模板对 siteTitle(map) 传 nil 值报类型错(全页面破碎)。
func (d Deps) resolveSite(r *http.Request) map[string]any {
	if sid := strings.TrimSpace(r.URL.Query().Get("site")); sid != "" {
		if m, ok, _ := d.DB.SiteByID(sid); ok && store.ToBool(m["status"]) {
			return m
		}
	}
	if m, ok, _ := d.DB.DefaultSite(); ok {
		return m
	}
	return map[string]any{}
}

func siteID(site map[string]any) string {
	if site == nil {
		return ""
	}
	return ToStrSafe(site["id"])
}

// pageOf 查询串页码(钳 1..1e6)。
func pageOf(sp map[string][]string) int {
	n, _ := strconv.Atoi(firstQ(sp, "page"))
	if n < 1 {
		return 1
	}
	if n > 1_000_000 {
		return 1_000_000
	}
	return n
}

func firstQ(sp map[string][]string, k string) string {
	if v, ok := sp[k]; ok && len(v) > 0 {
		return v[0]
	}
	return ""
}

// baseData 每页公共数据(站点/头部 TDK/分类/友链/常用视图链接)。
func (d Deps) baseData(r *http.Request, site map[string]any, head map[string]any) map[string]any {
	cats, _ := d.DB.ListCategories()
	links, _ := d.DB.ListFriendLinks()
	sid := siteID(site)
	return map[string]any{
		"Site":         site,
		"SiteID":       sid,
		"Head":         head,
		"Cats":         cats,
		"Links":        links,
		"NavCats":      navFloatCats,
		"CatCount":     len(cats),
		"HomeHref":     viewHref("home", sid, nil),
		"SearchHref":   viewHref("search", sid, nil),
		"FulltextHref": viewHref("fulltext", sid, nil),
		"RankingHref":  viewHref("ranking", sid, nil),
		"KeywordHref":  viewHref("keyword", sid, nil),
		"HistoryHref":  viewHref("history", sid, nil),
	}
}

// navFloatCats 导航 4 字归一分类锚(主控定稿顺序, 逐字固定): 与 Category 表(主控已改名)
// 和 crawl 归一词表三方一致, catHref 以 cat:{锚名} 解析到同名分类页。
// [R58-2b] 旧 15 锚(穿越/重生/古代架空…)与分类名完全脱节致全部“暂无相关书籍”, 故换 4 字口径。
var navFloatCats = []string{
	"玄幻奇幻", "西方奇幻", "武侠江湖", "仙侠修真", "都市生活", "现代言情", "历史演义", "军事战争",
	"游戏竞技", "科幻未来", "悬疑灵异", "体育竞技", "耽美纯爱", "同人衍生", "现实百态",
}

// pager 分页数据(上一页/下一页/计数)。
type pager struct {
	Page, TotalPages int
	Total            int64
	PrevURL, NextURL string
}

func makePager(page int, total int64, size int, urlFor func(int) string) pager {
	tp := int((total + int64(size) - 1) / int64(size))
	if tp < 1 {
		tp = 1
	}
	p := pager{Page: page, TotalPages: tp, Total: total}
	if page > 1 {
		p.PrevURL = urlFor(page - 1)
	}
	if page < tp {
		p.NextURL = urlFor(page + 1)
	}
	return p
}

// siteTitle 站名(空站兜底"小说站")。
func siteTitle(site map[string]any) string {
	if n := strings.TrimSpace(ToStrSafe(site["name"])); n != "" {
		return n
	}
	return "小说站"
}

// siteTdkOf Site 行 TDK(空回落站名)。
func siteTdkOf(site map[string]any) (title, desc, kw string) {
	title = strings.TrimSpace(ToStrSafe(site["title"]))
	desc = strings.TrimSpace(ToStrSafe(site["description"]))
	kw = strings.TrimSpace(ToStrSafe(site["keywords"]))
	return
}

// ---------------- / 与 /?view=... ----------------

func (d Deps) handleRoot(w http.ResponseWriter, r *http.Request) {
	sp := r.URL.Query()
	switch sp.Get("view") {
	case "", "home":
		d.renderHome(w, r, sp)
	case "book":
		d.renderBookView(w, r, sp, sp.Get("id"), 0)
	case "toc":
		d.renderToc(w, r, sp, sp.Get("id"), 0)
	case "read":
		d.renderReadByID(w, r, sp, sp.Get("chapter"))
	case "search":
		d.renderSearch(w, r, sp, sp.Get("q"))
	case "keyword":
		d.renderKeyword(w, r, sp, sp.Get("tag"))
	case "category":
		d.renderCategory(w, r, sp, sp.Get("cat"), pageOf(sp))
	case "ranking":
		d.renderRanking(w, r, sp)
	case "fulltext":
		d.renderFulltext(w, r, sp, pageOf(sp))
	case "history":
		d.renderHistory(w, r, sp)
	default:
		d.renderHome(w, r, sp)
	}
}

// handleNotFoundPretty 全局兜底: 未匹配路径 → 美观 404(/api/ 保持纯文本 404)。
func (d Deps) handleNotFoundPretty(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		http.NotFound(w, r)
		return
	}
	d.render404(w, r, "你访问的页面不存在或已被移除")
}

// ---------------- 首页 ----------------

func (d Deps) renderHome(w http.ResponseWriter, r *http.Request, sp map[string][]string) {
	site := d.resolveSite(r)
	sid := siteID(site)
	page := pageOf(sp)
	const size = 24
	books, total, err := d.DB.WebListBooks(page, size, "", "", "latest", "")
	if err != nil {
		d.render404(w, r, "数据加载失败")
		return
	}
	clickRank, _ := d.DB.WebRankBooks("words", 10)
	weekRank, _ := d.DB.WebRankBooks("latest", 11)
	authors, _ := d.DB.WebHotAuthors(10)
	booksN, authorsN, wordsN, chaptersN, _ := d.DB.WebSiteStats()

	var topBook map[string]any
	var weekList []map[string]any
	if len(weekRank) > 0 {
		topBook = weekRank[0]
		weekList = weekRank[1:]
	} else if len(clickRank) > 0 {
		topBook = clickRank[0]
	}

	st, sd, sk := siteTdkOf(site)
	name := siteTitle(site)
	if st == "" {
		st = name
	}
	if sd == "" {
		sd = name + "每日更新热门小说，覆盖玄幻奇幻、都市生活、现代言情等主流分类；支持全站 TXT 免费下载与在线阅读。"
	}
	canonical := "/"
	if page > 1 {
		canonical = viewHref("home", sid, map[string]string{"page": strconv.Itoa(page)})
	}
	head := d.head(r, site, st+" - "+name, plainText(sd), sk, canonical)

	data := d.baseData(r, site, head)
	data["Books"] = books
	data["ClickRank"] = clickRank
	data["TopBook"] = topBook
	data["WeekRank"] = weekList
	data["Authors"] = authors
	data["Stats"] = map[string]any{"Books": booksN, "Authors": authorsN, "Words": wordsN, "Chapters": chaptersN}
	data["Pager"] = makePager(page, total, size, func(p int) string {
		return viewHref("home", sid, map[string]string{"page": strconv.Itoa(p)})
	})
	data["HomeHref"] = viewHref("home", sid, nil)
	data["SearchHref"] = viewHref("search", sid, nil)
	data["FulltextHref"] = viewHref("fulltext", sid, nil)
	data["RankingHref"] = viewHref("ranking", sid, nil)
	render(w, "home", data)
}

// ---------------- 书籍页 ----------------

// resolveBookToken 书籍 token → book(数字/b 前缀 → num; cuid → id)。
func (d Deps) resolveBookToken(tok string) map[string]any {
	if tok == "" {
		return nil
	}
	if tokenIsCuid(tok) {
		m, ok, _ := d.DB.QueryMap(`SELECT `+webBookColsJoin()+` WHERE b.id=?`, tok)
		if ok {
			return m
		}
		return nil
	}
	if n := tokenToNum(tok); n > 0 {
		m, ok, _ := d.DB.QueryMap(`SELECT `+webBookColsJoin()+` WHERE b.num=?`, n)
		if ok {
			return m
		}
	}
	return nil
}

func webBookColsJoin() string {
	return `b.id, b.num, b.name, b.author, b.intro AS intro, b.cover, b.status,
b.wordCount, b.latestChapter, b.categoryId, b.updatedAt, c.name AS category
FROM "Book" b LEFT JOIN "Category" c ON c.id=b.categoryId`
}

// renderBookView 书籍详情(id 直查入口)。
func (d Deps) renderBookView(w http.ResponseWriter, r *http.Request, sp map[string][]string, id string, num int64) {
	var book map[string]any
	if num > 0 {
		m, ok, _ := d.DB.QueryMap(`SELECT `+webBookColsJoin()+` WHERE b.num=?`, num)
		book = pickMap(ok, m)
	} else if id != "" {
		m, ok, _ := d.DB.QueryMap(`SELECT `+webBookColsJoin()+` WHERE b.id=?`, id)
		book = pickMap(ok, m)
	}
	if book == nil {
		d.render404(w, r, "书籍不存在或尚未入库")
		return
	}
	d.renderBookPage(w, r, sp, book)
}

func pickMap(ok bool, m map[string]any) map[string]any {
	if !ok {
		return nil
	}
	return m
}

func (d Deps) renderBookPage(w http.ResponseWriter, r *http.Request, sp map[string][]string, book map[string]any) {
	site := d.resolveSite(r)
	sid := siteID(site)
	bid := ToStrSafe(book["id"])
	bnum := num64(book["num"])

	chapterCount, _ := d.DB.ChapterCount(bid)
	first, _ := d.DB.WebChapterPage(bid, 1, 1)
	latest, _ := d.DB.WebLatestChapters(bid, 12)
	recs, _ := d.DB.WebRecsBooks(ToStrSafe(book["categoryId"]), bid, 4)
	sideRank, _ := d.DB.WebRecsBooks(ToStrSafe(book["categoryId"]), bid, 8)
	tags, _ := d.DB.WebBookTags(bid, 16)

	name := plainText(ToStrSafe(book["name"]))
	author := plainText(ToStrSafe(book["author"]))
	category := plainText(ToStrSafe(book["category"]))
	tdk := d.composeBookTdk(tdkVars{
		bookname: name, author: author, category: category,
		sitename: siteTitle(site), status: ToStrSafe(book["status"]),
		intro: ToStrSafe(book["intro"]), siteKeywords: ToStrSafe(site["keywords"]),
	})
	var canonical string
	if bnum > 0 {
		canonical = "/book/" + itoa64local(bnum) + ".html"
	} else {
		canonical = "/?view=book&id=" + queryEscapeLocal(bid)
	}
	canonical = joinSite(canonical, sid)
	head := d.head(r, site, tdk.Title, tdk.Description, tdk.Keywords, canonical)

	data := d.baseData(r, site, head)
	data["Book"] = book
	data["ChapterCount"] = chapterCount
	data["Tags"] = tags
	data["Recs"] = recs
	data["SideRank"] = sideRank
	data["LatestChapters"] = latest
	if len(first) > 0 {
		data["FirstChapter"] = first[0]
	}
	data["BookHref"] = bookHref(bid, bnum, sid)
	data["ReadFirstHref"] = ""
	if len(first) > 0 {
		data["ReadFirstHref"] = chapterHref(ToStrSafe(first[0]["id"]), bnum, num64(first[0]["idx"]), sid)
	}
	data["TocHref"] = tocHref(bid, bnum, sid)
	data["FulltextHref"] = viewHref("fulltext", sid, nil)
	data["SearchHref"] = viewHref("search", sid, nil)
	data["HomeHref"] = viewHref("home", sid, nil)
	render(w, "book", data)
}

// handleBookPretty /book/{num}[.html] 伪静态({num} 段含 .html/.htm 后缀在此剥离)。
func (d Deps) handleBookPretty(w http.ResponseWriter, r *http.Request) {
	tok := strings.Trim(r.PathValue("num"), "/")
	if i := strings.LastIndexByte(tok, '.'); i > 0 {
		suffix := strings.ToLower(tok[i:])
		if suffix == ".html" || suffix == ".htm" {
			tok = tok[:i]
		}
	}
	d.renderBookPretty(w, r, tok)
}

// renderBookPretty 伪静态书籍页入口。
func (d Deps) renderBookPretty(w http.ResponseWriter, r *http.Request, tok string) {
	book := d.resolveBookToken(tok)
	if book == nil {
		d.render404(w, r, "书籍不存在或尚未入库")
		return
	}
	d.renderBookPage(w, r, r.URL.Query(), book)
}

// ---------------- 目录页 ----------------

// renderToc 目录(id 直查; bookNum>0 时为伪静态 /read/{num}/ 落点)。
func (d Deps) renderToc(w http.ResponseWriter, r *http.Request, sp map[string][]string, id string, bookNum int64) {
	var book map[string]any
	if bookNum > 0 {
		m, ok, _ := d.DB.QueryMap(`SELECT `+webBookColsJoin()+` WHERE b.num=?`, bookNum)
		book = pickMap(ok, m)
	} else if id != "" {
		if tokenIsCuid(id) {
			m, ok, _ := d.DB.QueryMap(`SELECT `+webBookColsJoin()+` WHERE b.id=?`, id)
			book = pickMap(ok, m)
		} else if n := tokenToNum(id); n > 0 {
			m, ok, _ := d.DB.QueryMap(`SELECT `+webBookColsJoin()+` WHERE b.num=?`, n)
			book = pickMap(ok, m)
		}
	}
	if book == nil {
		d.render404(w, r, "书籍不存在或尚未入库")
		return
	}
	site := d.resolveSite(r)
	sid := siteID(site)
	bid := ToStrSafe(book["id"])
	bnum := num64(book["num"])
	page := pageOf(sp)
	const size = 100
	chapters, _ := d.DB.WebChapterPage(bid, page, size)
	total, _ := d.DB.WebChapterTotal(bid)

	name := plainText(ToStrSafe(book["name"]))
	tdk := d.composeTocTdk(tdkVars{
		bookname: name, author: plainText(ToStrSafe(book["author"])),
		category: plainText(ToStrSafe(book["category"])), sitename: siteTitle(site),
		status: ToStrSafe(book["status"]), chapterCount: strconv.Itoa(total),
		siteKeywords: ToStrSafe(site["keywords"]),
	})
	base := tocHref(bid, bnum, sid)
	head := d.head(r, site, tdk.Title, tdk.Description, "", base)

	data := d.baseData(r, site, head)
	data["Book"] = book
	data["Chapters"] = chapters
	data["Total"] = int64(total)
	data["Pager"] = makePager(page, int64(total), size, func(p int) string {
		return appendQueryParam(joinSite(base, sid), "page", strconv.Itoa(p))
	})
	data["BookHref"] = bookHref(bid, bnum, sid)
	data["HomeHref"] = viewHref("home", sid, nil)
	render(w, "toc", data)
}

// appendQueryParam 追加查询参数(自动选 ?/& 连接; 修 toc 分页 URL: /read/{num}/ 无查询时误拼 "&page=")。
func appendQueryParam(u, k, v string) string {
	sep := "?"
	if strings.Contains(u, "?") {
		sep = "&"
	}
	return u + sep + k + "=" + queryEscapeLocal(v)
}

// ---------------- 阅读页 ----------------

// renderReadByID /?view=read&chapter={id}。
func (d Deps) renderReadByID(w http.ResponseWriter, r *http.Request, sp map[string][]string, chapterID string) {
	if chapterID == "" {
		d.render404(w, r, "章节参数缺失")
		return
	}
	ch, book, prev, next, ok, _ := d.DB.WebChapterRead(chapterID)
	if !ok {
		d.render404(w, r, "章节不存在或尚未采集")
		return
	}
	d.renderReadPage(w, r, sp, ch, book, prev, next)
}

// renderReadByNum 伪静态 /read/{bookNum}/{idx}.html。
func (d Deps) renderReadByNum(w http.ResponseWriter, r *http.Request, bookNum, idx int64) {
	bookM, bookOK, _ := d.DB.QueryMap(`SELECT b.id, b.num FROM "Book" b WHERE b.num=?`, bookNum)
	if !bookOK {
		d.render404(w, r, "书籍不存在")
		return
	}
	bid := ToStrSafe(bookM["id"])
	chm, chOK, _ := d.DB.WebChapterByNum(bid, idx)
	if !chOK {
		d.render404(w, r, "章节不存在或尚未采集")
		return
	}
	ch, book, prev, next, ok2, _ := d.DB.WebChapterRead(ToStrSafe(chm["id"]))
	if !ok2 {
		d.render404(w, r, "章节内容缺失")
		return
	}
	d.renderReadPage(w, r, r.URL.Query(), ch, book, prev, next)
}

func (d Deps) renderReadPage(w http.ResponseWriter, r *http.Request, sp map[string][]string, ch, book, prev, next map[string]any) {
	site := d.resolveSite(r)
	sid := siteID(site)
	bid := ToStrSafe(book["id"])
	bnum := num64(book["num"])
	cid := ToStrSafe(ch["id"])
	cidx := num64(ch["idx"])

	name := plainText(ToStrSafe(book["name"]))
	chTitle := plainText(ToStrSafe(ch["title"]))
	tdk := d.composeChapterTdk(tdkVars{
		bookname: name, author: plainText(ToStrSafe(book["author"])),
		category: plainText(ToStrSafe(book["category"])), sitename: siteTitle(site),
		chaptername: chTitle, chapterno: strconv.FormatInt(cidx, 10),
		excerpt:      clampCodePoints(plainText(ToStrSafe(ch["content"])), 110),
		siteKeywords: ToStrSafe(site["keywords"]),
	})
	canonical := ""
	if bnum > 0 && cidx > 0 {
		canonical = joinSite("/read/"+itoa64local(bnum)+"/"+itoa64local(cidx)+".html", sid)
	} else {
		canonical = joinSite("/?view=read&chapter="+queryEscapeLocal(cid), sid)
	}
	head := d.head(r, site, tdk.Title, tdk.Description, tdk.Keywords, canonical)

	data := d.baseData(r, site, head)
	data["Chapter"] = ch
	data["Book"] = book
	data["Prev"] = prev
	data["Next"] = next
	data["PrevHref"] = ""
	if prev != nil {
		data["PrevHref"] = chapterHref(ToStrSafe(prev["id"]), bnum, num64(prev["idx"]), sid)
	}
	data["NextHref"] = ""
	if next != nil {
		data["NextHref"] = chapterHref(ToStrSafe(next["id"]), bnum, num64(next["idx"]), sid)
	}
	data["TocHref"] = tocHref(bid, bnum, sid)
	data["BookHref"] = bookHref(bid, bnum, sid)
	data["HomeHref"] = viewHref("home", sid, nil)
	render(w, "read", data)
}

// handleReadPretty /read/... 全形态解析。
func (d Deps) handleReadPretty(w http.ResponseWriter, r *http.Request) {
	rest := r.PathValue("rest")
	pp := parsePrettyPath("/read/" + rest)
	if pp == nil {
		d.render404(w, r, "地址格式无法识别")
		return
	}
	if pp.view == "book" || pp.view == "toc" {
		// /read/{btok}[.html|/] 缺章节段 → 目录页(真站 /read/{num}/ 即章节列表; 兼容 ?page= 翻页)。
		if n := tokenToNum(pp.bookToken); n > 0 {
			d.renderToc(w, r, r.URL.Query(), "", n)
			return
		}
		if book := d.resolveBookToken(pp.bookToken); book != nil {
			d.renderToc(w, r, r.URL.Query(), ToStrSafe(book["id"]), 0)
			return
		}
		d.render404(w, r, "书籍不存在或尚未入库")
		return
	}
	book := d.resolveBookToken(pp.bookToken)
	if book == nil {
		d.render404(w, r, "书籍不存在或尚未入库")
		return
	}
	bid := ToStrSafe(book["id"])
	var chapter map[string]any
	if tokenIsCuid(pp.chapterToken) {
		m, ok, _ := d.DB.QueryMap(`SELECT id, idx, title FROM "Chapter" WHERE id=? AND bookId=? LIMIT 1`, pp.chapterToken, bid)
		chapter = pickMap(ok, m)
	} else if n := tokenToNum(pp.chapterToken); n > 0 {
		m, ok, _ := d.DB.WebChapterByNum(bid, n)
		chapter = pickMap(ok, m)
	}
	if chapter == nil {
		d.render404(w, r, "章节不存在或尚未采集")
		return
	}
	ch, bk, prev, next, ok, _ := d.DB.WebChapterRead(ToStrSafe(chapter["id"]))
	if !ok {
		d.render404(w, r, "章节内容缺失")
		return
	}
	d.renderReadPage(w, r, r.URL.Query(), ch, bk, prev, next)
}

// ---------------- 搜索 ----------------

func (d Deps) renderSearch(w http.ResponseWriter, r *http.Request, sp map[string][]string, q string) {
	site := d.resolveSite(r)
	sid := siteID(site)
	q = strings.TrimSpace(q)
	var books []map[string]any
	var total int64
	if q != "" {
		books, total, _ = d.DB.WebListBooks(1, 30, "", q, "latest", "")
	}
	tags, _ := d.DB.WebRelatedTags(q, 12)

	name := siteTitle(site)
	tdkTitle := fmt.Sprintf("「%s」的搜索结果 - %s", q, name)
	head := d.head(r, site, tdkTitle, name+"站内搜索："+q, q, joinSite("/?view=search", sid))

	data := d.baseData(r, site, head)
	data["Q"] = q
	data["Books"] = books
	data["Total"] = total
	data["Tags"] = tags
	data["HomeHref"] = viewHref("home", sid, nil)
	data["FulltextHref"] = viewHref("fulltext", sid, nil)
	render(w, "search", data)
}

// ---------------- 关键词页 ----------------

func (d Deps) renderKeyword(w http.ResponseWriter, r *http.Request, sp map[string][]string, tag string) {
	site := d.resolveSite(r)
	sid := siteID(site)
	tag = strings.TrimSpace(tag)
	hits, _ := d.DB.WebKeywordHits(tag, 10)
	var primary map[string]any
	var others []map[string]any
	if len(hits) > 0 {
		primary = hits[0]
		others = hits[1:]
	}
	var related []string
	if primary != nil {
		related, _ = d.DB.WebBookTags(ToStrSafe(primary["id"]), 16)
		// 相关词剔除自身
		var cleaned []string
		for _, t := range related {
			if t != tag {
				cleaned = append(cleaned, t)
			}
		}
		related = cleaned
	}
	name := siteTitle(site)
	head := d.head(r, site, tag+" - "+name, name+"聚合「"+tag+"」相关小说资源，提供全文免费在线阅读。", tag, joinSite(viewHref("keyword", sid, map[string]string{"tag": tag}), ""))

	data := d.baseData(r, site, head)
	data["Tag"] = tag
	data["Primary"] = primary
	data["Others"] = others
	data["Related"] = related
	data["HomeHref"] = viewHref("home", sid, nil)
	if primary != nil {
		data["PrimaryBookHref"] = bookHref(ToStrSafe(primary["id"]), num64(primary["num"]), sid)
	}
	render(w, "keyword", data)
}

// ---------------- 分类页 ----------------

func (d Deps) renderCategory(w http.ResponseWriter, r *http.Request, sp map[string][]string, cat string, page int) {
	site := d.resolveSite(r)
	sid := siteID(site)
	const size = 24
	books, total, err := d.DB.WebListBooks(page, size, cat, "", "latest", "")
	if err != nil {
		d.render404(w, r, "数据加载失败")
		return
	}
	// 分类名: cat:名 锚 → 名; id → 查表
	catName := "全部"
	if cat != "" {
		if strings.HasPrefix(cat, "cat:") {
			catName = strings.TrimPrefix(cat, "cat:")
		} else if m, ok, _ := d.DB.QueryMap(`SELECT name FROM "Category" WHERE id=?`, cat); ok {
			catName = ToStrSafe(m["name"])
		}
	}
	cats, _ := d.DB.ListCategories()

	name := siteTitle(site)
	tdkTitle := catName + "小说最新上传 - " + name
	head := d.head(r, site, tdkTitle, name+catName+"分类小说最新上传列表，免费在线阅读与 TXT 下载。", catName+",小说列表", joinSite(viewHref("category", sid, map[string]string{"cat": cat}), ""))

	data := d.baseData(r, site, head)
	data["Books"] = books
	data["CatName"] = catName
	data["Cat"] = cat
	data["Cats"] = cats
	data["Pager"] = makePager(page, total, size, func(p int) string {
		return viewHref("category", sid, map[string]string{"cat": cat, "page": strconv.Itoa(p)})
	})
	data["HomeHref"] = viewHref("home", sid, nil)
	data["FulltextHref"] = viewHref("fulltext", sid, nil)
	render(w, "category", data)
}

// ---------------- 榜单页 ----------------

func (d Deps) renderRanking(w http.ResponseWriter, r *http.Request, sp map[string][]string) {
	site := d.resolveSite(r)
	sid := siteID(site)
	latest, _ := d.DB.WebRankBooks("latest", 60)
	words, _ := d.DB.WebRankBooks("words", 60)
	newest, _ := d.DB.WebRankBooks("new", 60)

	name := siteTitle(site)
	head := d.head(r, site, "排行榜 - "+name,
		name+"小说排行榜，更新榜/字数榜/新书榜 TOP60，热门小说实时排名，支持在线阅读与TXT下载",
		"小说排行榜,热门小说,"+name+"排行榜", joinSite(viewHref("ranking", sid, nil), ""))

	data := d.baseData(r, site, head)
	data["Boards"] = []map[string]any{
		{"Key": "latest", "Label": "更新榜", "Books": latest},
		{"Key": "words", "Label": "字数榜", "Books": words},
		{"Key": "new", "Label": "新书榜", "Books": newest},
	}
	data["HomeHref"] = viewHref("home", sid, nil)
	render(w, "ranking", data)
}

// ---------------- 全站书库 ----------------

func (d Deps) renderFulltext(w http.ResponseWriter, r *http.Request, sp map[string][]string, page int) {
	site := d.resolveSite(r)
	sid := siteID(site)
	const size = 24
	books, total, err := d.DB.WebListBooks(page, size, "", "", "latest", "")
	if err != nil {
		d.render404(w, r, "数据加载失败")
		return
	}
	name := siteTitle(site)
	head := d.head(r, site, "全站书库 - "+name, name+"全站书库，全部小说免费在线阅读与 TXT 下载。", "全站书库,小说下载", joinSite(viewHref("fulltext", sid, nil), ""))

	data := d.baseData(r, site, head)
	data["Books"] = books
	data["Pager"] = makePager(page, total, size, func(p int) string {
		return viewHref("fulltext", sid, map[string]string{"page": strconv.Itoa(p)})
	})
	data["HomeHref"] = viewHref("home", sid, nil)
	data["RankingHref"] = viewHref("ranking", sid, nil)
	render(w, "fulltext", data)
}

// ---------------- 阅读历史(客户端 localStorage 渲染, SSR 空态) ----------------

func (d Deps) renderHistory(w http.ResponseWriter, r *http.Request, sp map[string][]string) {
	site := d.resolveSite(r)
	sid := siteID(site)
	name := siteTitle(site)
	head := d.head(r, site, "阅读历史 - "+name, "本机阅读历史记录(仅保存在浏览器本地)。", "阅读历史", "")
	data := d.baseData(r, site, head)
	data["HomeHref"] = viewHref("home", sid, nil)
	data["SearchHref"] = viewHref("search", sid, nil)
	render(w, "history", data)
}

// ---------------- PSEO 落地页 ----------------

// handlePseo /p/{slug}[.html]。
func (d Deps) handlePseo(w http.ResponseWriter, r *http.Request) {
	slug := strings.Trim(r.PathValue("slug"), "/")
	if low := strings.ToLower(slug); strings.HasSuffix(low, ".html") {
		slug = slug[:len(slug)-5]
	} else if strings.HasSuffix(low, ".htm") {
		slug = slug[:len(slug)-4]
	}
	if slug == "" || len(slug) > 256 || strings.Contains(slug, "/") {
		d.render404(w, r, "专题页不存在")
		return
	}
	candidates := []string{slug}
	if strings.Contains(slug, "%") {
		if dec, err := url.PathUnescape(slug); err == nil && dec != slug {
			candidates = append(candidates, dec)
		}
	}
	var row map[string]any
	for _, c := range candidates {
		if m, ok, _ := d.DB.WebPseoBySlug(c); ok {
			row = m
			break
		}
	}
	if row == nil {
		d.render404(w, r, "专题页不存在")
		return
	}
	site := d.resolveSite(r)
	sid := siteID(site)
	name := siteTitle(site)

	ids := pseoMatchedIDs(ToStrSafe(row["matchedBookIds"]))
	found, _ := d.DB.WebBooksByIDs(ids)
	byID := map[string]map[string]any{}
	for _, b := range found {
		byID[ToStrSafe(b["id"])] = b
	}
	books := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		if b, ok := byID[id]; ok {
			books = append(books, b)
		}
	}
	var primary map[string]any
	pid := ToStrSafe(row["primaryBookId"])
	for _, b := range books {
		if pid == "" || ToStrSafe(b["id"]) == pid {
			primary = b
			break
		}
	}

	heading := ToStrSafe(row["title"])
	if heading == "" {
		heading = ToStrSafe(row["keyword"])
	}
	title := heading + " - " + name
	head := d.head(r, site, title, ToStrSafe(row["description"]), ToStrSafe(row["keywords"]),
		joinSite("/p/"+slug+".html", sid))

	data := d.baseData(r, site, head)
	data["Row"] = row
	data["Heading"] = heading
	data["Books"] = books
	data["Primary"] = primary
	data["SiteName"] = name
	data["HomeHref"] = viewHref("home", sid, nil)
	data["SearchHref"] = viewHref("search", sid, nil)
	// 站内书籍链接(恒非 nil: pseo 页脚 firstN 6 .BookViews 需 []map 类型, nil 传参模板类型错)
	booksView := make([]map[string]any, 0, len(books))
	for _, b := range books {
		booksView = append(booksView, map[string]any{
			"Book":     b,
			"BookHref": bookHref(ToStrSafe(b["id"]), num64(b["num"]), sid),
			"TocHref":  tocHref(ToStrSafe(b["id"]), num64(b["num"]), sid),
			"CatHref":  viewHref("category", sid, map[string]string{"cat": ToStrSafe(b["categoryId"])}),
		})
	}
	data["BookViews"] = booksView
	render(w, "pseo", data)
}

// pseoMatchedIDs matchedBookIds JSON → 去重字符串列表(脏 JSON 安全)。
func pseoMatchedIDs(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var arr []string
	if err := json.Unmarshal([]byte(raw), &arr); err != nil {
		return nil
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(arr))
	for _, s := range arr {
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

// ---------------- robots / sitemap ----------------

func (d Deps) handleRobots(w http.ResponseWriter, r *http.Request) {
	origin := requestOrigin(r)
	var b strings.Builder
	b.WriteString("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin\n")
	if origin != "" {
		b.WriteString("Sitemap: " + origin + "/sitemap.xml\n")
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte(b.String()))
}

// xmlEscape XML 文本转义(sitemap <loc>/<lastmod> 拼接层; origin 含 Host 头不可信, 全值过此)。
func xmlEscape(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch r {
		case '&':
			b.WriteString("&amp;")
		case '<':
			b.WriteString("&lt;")
		case '>':
			b.WriteString("&gt;")
		case '"':
			b.WriteString("&quot;")
		case '\'':
			b.WriteString("&apos;")
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

func (d Deps) handleSitemap(w http.ResponseWriter, r *http.Request) {
	site := d.resolveSite(r)
	sid := siteID(site)
	origin := requestOrigin(r)
	books, _ := d.DB.WebSitemapBooks(2000)
	cats, _ := d.DB.ListCategories()

	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	add := func(loc, lastmod string) {
		b.WriteString("<url><loc>")
		if origin != "" {
			b.WriteString(xmlEscape(origin))
		}
		b.WriteString(xmlEscape(loc))
		b.WriteString("</loc>")
		if lastmod != "" {
			b.WriteString("<lastmod>" + xmlEscape(lastmod) + "</lastmod>")
		}
		b.WriteString("</url>\n")
	}
	add("/", "")
	add(joinSite(viewHref("fulltext", sid, nil), sid), "")
	add(joinSite(viewHref("ranking", sid, nil), sid), "")
	for _, c := range cats {
		add(joinSite(viewHref("category", sid, map[string]string{"cat": ToStrSafe(c["id"])}), sid), "")
	}
	for _, bk := range books {
		num := num64(bk["num"])
		if num <= 0 {
			continue
		}
		add(joinSite("/book/"+itoa64local(num)+".html", sid), fmtDateMS(num64(bk["updatedAt"])))
	}
	b.WriteString("</urlset>")
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	_, _ = w.Write([]byte(b.String()))
}
