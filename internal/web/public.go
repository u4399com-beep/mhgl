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
	"time"

	"mhgl/internal/crawl/smart"
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

// clampInput 查询串用户输入收口(trim + 码点钳长)。
// [R64-c] 修前 renderSearch(q)/renderKeyword(tag)/renderCategory(cat 锚名) 原样进
// TDK title/description 与 LIKE 模式 —— 超长查询串(实测 3000 字符)直出无界 <title>
// (SEO 垃圾面)并进 SQL LIKE; api 面 /api/public/search 同参已 likeSafe(100) 收口,
// SSR 面对齐同口径。钳长后值仍经 html/template 自动转义(XSS 面不变)。
func clampInput(s string, max int) string {
	return clampCodePoints(strings.TrimSpace(s), max)
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

// [R65-b] smartTdkFill 智能 TDK 填充: 站点行 smartTdk 配置(JSON, 见 store/site_tdk.go)
// 开启且当前页类型策略=smart 时, 从启用套中随机选一套经 crawl/smart 引擎渲染 TDK 三件套。
// 未配置/未开启/无可用套/渲染为空 → ok=false, 调用方走原逻辑(R62 修复语义零回退;
// 默认关闭, 存量站点零影响)。
func (d Deps) smartTdkFill(site map[string]any, pageType string, book map[string]any, catName string) (composedTdk, bool) {
	cfg := smart.ParseSiteCfg(ToStrSafe(site["smartTdk"]))
	if !cfg.Enabled {
		return composedTdk{}, false
	}
	ctx := smart.TDKCtx{
		SiteName: siteTitle(site),
		Year:     time.Now().Format("2006"),
	}
	if book != nil {
		ctx.BookName = plainText(ToStrSafe(book["name"]))
		ctx.Author = plainText(ToStrSafe(book["author"]))
		ctx.Category = plainText(ToStrSafe(book["category"]))
		switch ToStrSafe(book["status"]) {
		case "completed":
			ctx.Status = "已完结"
		case "ongoing":
			ctx.Status = "连载中"
		}
		ctx.Words = store.ToInt(book["wordCount"])
	}
	if catName != "" {
		// 无锚分类页(catName=「全部」)无具体分类语义, 引擎句式会失真 → 回落原逻辑
		if pageType == smart.PageCategory && catName == "全部" {
			return composedTdk{}, false
		}
		ctx.Category = catName
	}
	title, desc, kw := smart.BuildTDK(cfg, ctx, pageType)
	if strings.TrimSpace(title) == "" || strings.TrimSpace(desc) == "" {
		return composedTdk{}, false
	}
	return composedTdk{Title: title, Description: desc, Keywords: kw}, true
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
	// [R59-2a-batch2] x2552(黑冰模板) 真站榜单行数 15/20+1(TS X2552Home: 总推荐榜 15 行/最新小说 20 行);
	// 其余主题维持 10/11 既有口径(TopBook 恒取 latest 首位, WeekList = 其余)。
	rankWords, rankLatest := 10, 11
	if themeOf(site) == "x2552" {
		rankWords, rankLatest = 15, 21
	}
	clickRank, _ := d.DB.WebRankBooks("words", rankWords)
	weekRank, _ := d.DB.WebRankBooks("latest", rankLatest)
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
	// [R62-b] 首页 title: 修前 = st+" - "+name —— site.title 未配置时回落站名再拼接
	// → 「站名 - 站名」重复; 且实测存量站点 site.title == site.name 同样触发重复。
	// 修后: 未配置 → 「{站名} - 精品小说在线阅读」(对齐 TS HomeView useSiteSEO 回落);
	// 已配置 → 「{site.title} - {站名}」, 与站名相同则不重复追加。
	homeTitle := st
	if homeTitle == "" {
		homeTitle = name + " - 精品小说在线阅读"
	} else if homeTitle != name {
		homeTitle = homeTitle + " - " + name
	}
	if sd == "" {
		sd = name + "每日更新热门小说，覆盖玄幻奇幻、都市生活、现代言情等主流分类；支持全站 TXT 免费下载与在线阅读。"
	}
	// [R62-b] keywords 空回落(对齐 TS useSiteSEO「小说,在线阅读」; 修前空值整个 meta 不输出)。
	if sk == "" {
		sk = "小说,在线阅读"
	}
	// [R65-b] 智能 TDK(首页): 站点启用首页套(17/18)时随机生成; 未启用保持上行 R62 修复语义零回退。
	if td, ok := d.smartTdkFill(site, smart.PageHome, nil, ""); ok {
		homeTitle, sd, sk = td.Title, td.Description, td.Keywords
	}
	canonical := "/"
	if page > 1 {
		canonical = viewHref("home", sid, map[string]string{"page": strconv.Itoa(page)})
	}
	head := d.head(r, site, homeTitle, plainText(sd), sk, canonical)

	data := d.baseData(r, site, head)
	data["Books"] = books
	data["ClickRank"] = clickRank
	data["TopBook"] = topBook
	data["WeekRank"] = weekList
	data["Authors"] = authors
	data["Stats"] = map[string]any{"Books": booksN, "Authors": authorsN, "Words": wordsN, "Chapters": chaptersN}
	// [R59-2a] aijjxs 首页 1:1 补齐: 封面推荐(真站取最新 2 本带封面书) +
	// 小说分类 4 组(真站 女生/纯美/男生/悬疑 → 本站 4 字锚 现代言情/耽美纯爱/玄幻奇幻/悬疑灵异, 各 10 本)。
	data["CoverPicks"] = pickCoverBooks(books, 2)
	data["CatGroups"] = d.homeCatGroups()
	// [R59-2a-batch2] 主题化数据面(仅相关主题计算, 其余主题零开销):
	//   pili/shipsay → CoverRow(最新上传带封面 10 本; pili 强档推荐 1 大+2 横+7 条, shipsay 大神小说 6 卡)
	//   ddyueshu/shipsay → CatBlocks(6 组 4 字锚分类块 ×13 本; ddyueshu novelslist 6 块 / shipsay sortvisit 6 块)
	switch themeOf(site) {
	case "pili", "shipsay":
		data["CoverRow"] = pickCoverBooks(books, 10)
	}
	switch themeOf(site) {
	case "ddyueshu", "shipsay":
		data["CatBlocks"] = d.homeCatBlocks()
	}
	// [R60-2a] 新主题数据面(ggd66/huangjinwu/qb23/x33yq, 均走既有 WebListBooks/WebRankBooks 参数化查询):
	//   ggd66 → GgTuij(封推 6 本带封面优先, 不足补无封面)+GgRank(阅读排行榜 13 行, 字数序)
	//   huangjinwu → HjwHot(热门推荐 6)+HjwMods(分类排行榜 6 榜×10, TS buildRankModules 口径: 池按分类分组取前 6 榜)
	//   qb23 → QbHot(热门点击榜 10 封面网格)+QbCols(最新 48 本按分类分组 12 列×10 行, 组内字数序)
	//   x33yq → Books 换 48 本池(TS props.books=48: hotcontent 6+GARAN 33+newscontent 30/24 全出自同池)
	switch themeOf(site) {
	case "ggd66":
		pool, _ := d.DB.WebRankBooks("words", 60)
		data["GgTuij"] = pickCoverPrefer(pool, 6)
		data["GgRank"] = firstNRows(pool, 13)
	case "huangjinwu":
		pool, _ := d.DB.WebRankBooks("words", 48)
		data["HjwHot"] = firstNRows(pool, 6)
		data["HjwMods"] = groupBooksByCat(pool, 6, 10, false)
	case "qb23":
		pool, _ := d.DB.WebRankBooks("words", 10)
		data["QbHot"] = pool
		latest48, _, _ := d.DB.WebListBooks(1, 48, "", "", "latest", "")
		data["QbCols"] = groupBooksByCat(latest48, 12, 10, true)
	case "x33yq":
		pool, _, _ := d.DB.WebListBooks(1, 48, "", "", "latest", "")
		if len(pool) > 0 {
			data["Books"] = pool
		}
	}
	data["Pager"] = makePager(page, total, size, func(p int) string {
		return viewHref("home", sid, map[string]string{"page": strconv.Itoa(p)})
	})
	data["HomeHref"] = viewHref("home", sid, nil)
	data["SearchHref"] = viewHref("search", sid, nil)
	data["FulltextHref"] = viewHref("fulltext", sid, nil)
	data["RankingHref"] = viewHref("ranking", sid, nil)
	render(w, "home", data)
}

// pickCoverBooks 从列表行里挑前 n 本有封面的书(首页「封面推荐」数据; 真站面板即取最新上传带图 2 本)。
func pickCoverBooks(books []map[string]any, n int) []map[string]any {
	var out []map[string]any
	for _, b := range books {
		if len(out) >= n {
			break
		}
		if ToStrSafe(b["cover"]) != "" {
			out = append(out, b)
		}
	}
	return out
}

// firstNRows 行切片安全取前 n(模板 firstN 的 Go 侧等价, 供面板数据面使用)。
func firstNRows(rows []map[string]any, n int) []map[string]any {
	if n <= 0 || len(rows) <= n {
		return rows
	}
	return rows[:n]
}

// pickCoverPrefer 封面优先补齐: 先取带封面者, 不足按原序补无封面书(对齐 TS pickWithCover)。
func pickCoverPrefer(rows []map[string]any, n int) []map[string]any {
	var with, without []map[string]any
	for _, b := range rows {
		if ToStrSafe(b["cover"]) != "" {
			with = append(with, b)
		} else {
			without = append(without, b)
		}
	}
	out := append([]map[string]any{}, with...)
	out = append(out, without...)
	return firstNRows(out, n)
}

// groupBooksByCat 行池按分类名分组取前 maxGroups 组×每组 perGroup 本(huangjinwu 分类排行榜 /
// qb23 分类榜单列; TS buildRankModules 口径: 组按收录量降序, sortInside 时组内再按字数降序)。
func groupBooksByCat(rows []map[string]any, maxGroups, perGroup int, sortInside bool) []map[string]any {
	if maxGroups < 1 || perGroup < 1 {
		return nil
	}
	order := []string{}
	byCat := map[string][]map[string]any{}
	for _, b := range rows {
		name := plainText(ToStrSafe(b["category"]))
		if name == "" {
			name = "小说"
		}
		if _, ok := byCat[name]; !ok {
			order = append(order, name)
		}
		byCat[name] = append(byCat[name], b)
	}
	out := make([]map[string]any, 0, len(order))
	for _, name := range order {
		grp := byCat[name]
		if sortInside && len(grp) > 1 {
			for i := 1; i < len(grp); i++ {
				for j := i; j > 0 && num64(grp[j]["wordCount"]) > num64(grp[j-1]["wordCount"]); j-- {
					grp[j], grp[j-1] = grp[j-1], grp[j]
				}
			}
		}
		out = append(out, map[string]any{"Name": name, "Books": firstNRows(grp, perGroup)})
	}
	// 组按收录量降序(稳定: 同量保持池内出现次序)
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && len(byCat[ToStrSafe(out[j]["Name"])]) > len(byCat[ToStrSafe(out[j-1]["Name"])]); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return firstNRows(out, maxGroups)
}

// homeCatGroups 首页「小说分类」4 组面板(真站 女生/纯美/男生/悬疑 → 本站 4 字锚同位映射)。
// cat 锚走 cat:名 形态(WebResolveCatID 解析), 无该分类时 WebListBooks 返回空组由模板隐藏。
func (d Deps) homeCatGroups() []map[string]any {
	groupNames := []string{"现代言情", "耽美纯爱", "玄幻奇幻", "悬疑灵异"}
	out := make([]map[string]any, 0, len(groupNames))
	for _, name := range groupNames {
		rows, _, err := d.DB.WebListBooks(1, 10, "cat:"+name, "", "latest", "")
		if err != nil {
			rows = nil
		}
		out = append(out, map[string]any{"Name": name, "Books": rows})
	}
	return out
}

// homeCatBlocks biquge 家族首页 6 组分类封面块(ddyueshu novelslist 真站 玄幻/武侠/都市/历史/
// 网游/科幻小说 6 块 + shipsay sortvisit 6 块同构; 锚映射本站 4 字归一名)。
// 每组 13 本: 首本作特推图位(.top/60×80 级), 后 12 本作「书名/作者」行; 字数序≈真站人气块。
// 无该分类时组为空, 模板整块隐藏(不渲染空壳)。
func (d Deps) homeCatBlocks() []map[string]any {
	groupNames := []string{"玄幻奇幻", "武侠江湖", "都市生活", "历史演义", "游戏竞技", "科幻未来"}
	out := make([]map[string]any, 0, len(groupNames))
	for _, name := range groupNames {
		rows, _, err := d.DB.WebListBooks(1, 13, "cat:"+name, "", "words", "")
		if err != nil {
			rows = nil
		}
		out = append(out, map[string]any{"Name": name, "Books": rows})
	}
	return out
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
	// [R62-d2] 同分类仅本作(或无分类)时「会员推荐/猜您喜欢」空壳 → 回落全站最新(catID 空语义), 各主题 SideRank 块保持有数据
	if len(sideRank) == 0 {
		sideRank, _ = d.DB.WebRecsBooks("", bid, 8)
	}
	tags, _ := d.DB.WebBookTags(bid, 16)
	// [R59-2a] 真站书籍页「作者其它作品」侧卡(同作者他书, 排除本作, 取 6 本; 泛型 QueryMaps 不动 store 面)。
	var authorOthers []map[string]any
	if author := ToStrSafe(book["author"]); author != "" {
		authorOthers, _ = d.DB.QueryMaps(`SELECT b.id, b.num, b.name, b.cover, c.name AS category
FROM "Book" b LEFT JOIN "Category" c ON c.id=b.categoryId
WHERE b.author=? AND b.id<>? ORDER BY b.updatedAt DESC LIMIT 6`, author, bid)
	}

	name := plainText(ToStrSafe(book["name"]))
	author := plainText(ToStrSafe(book["author"]))
	category := plainText(ToStrSafe(book["category"]))
	tdk := d.composeBookTdk(tdkVars{
		bookname: name, author: author, category: category,
		sitename: siteTitle(site), status: ToStrSafe(book["status"]),
		intro: ToStrSafe(book["intro"]), siteKeywords: ToStrSafe(site["keywords"]),
	})
	// [R65-b] 智能 TDK(书籍页): 站点启用书籍套时随机生成; 未启用走上行原逻辑零变化。
	if td, ok := d.smartTdkFill(site, smart.PageBook, book, ""); ok {
		tdk = td
	}
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
	data["AuthorOthers"] = authorOthers
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
	// [R65-b] 智能 TDK(目录页): 同上, 未启用零变化。
	if td, ok := d.smartTdkFill(site, smart.PageToc, book, ""); ok {
		tdk = td
	}
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
	// [R60-2a] x33yq 目录页侧栏「妹纸们都在看」(TS useWordsPool 字数热榜 26 条近似; 仅该主题计算)。
	if themeOf(site) == "x33yq" {
		side, _ := d.DB.WebRankBooks("words", 26)
		data["XqSide"] = side
	}
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
	// [R65-b] 智能 TDK(阅读页): 同上, 未启用零变化。
	if td, ok := d.smartTdkFill(site, smart.PageRead, book, ""); ok {
		tdk = td
	}
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
	q = clampInput(q, 100) // [R64-c] 超长 q 直出 TDK+LIKE 无界面收口(对齐 api likeSafe 100)
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
	tag = clampInput(tag, 100) // [R64-c] 同 renderSearch: 聚合页 TDK 直出无界面收口
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
	// [R59-2a] 真站分类页筛选行(排序/完结态)落地: sort∈latest|words|new, status 白名单同 store 层。
	sortKey := firstQ(sp, "sort")
	switch sortKey {
	case "latest", "words", "new":
	default:
		sortKey = "latest"
	}
	statusKey := firstQ(sp, "status")
	switch statusKey {
	case "unknown", "ongoing", "completed":
	default:
		statusKey = ""
	}
	books, total, err := d.DB.WebListBooks(page, size, cat, "", sortKey, statusKey)
	if err != nil {
		d.render404(w, r, "数据加载失败")
		return
	}
	// 分类名: cat:名 锚 → 名; id → 查表
	catName := "全部"
	if cat != "" {
		if strings.HasPrefix(cat, "cat:") {
			catName = clampInput(strings.TrimPrefix(cat, "cat:"), 50) // [R64-c] 锚名进 TDK, 钳分类名上限(50 同 Category.name)
		} else if m, ok, _ := d.DB.QueryMap(`SELECT name FROM "Category" WHERE id=?`, cat); ok {
			catName = clampInput(ToStrSafe(m["name"]), 50)
		}
	}
	cats, _ := d.DB.ListCategories()

	name := siteTitle(site)
	tdkTitle := catName + "小说最新上传 - " + name
	headDesc := name + catName + "分类小说最新上传列表，免费在线阅读与 TXT 下载。"
	headKw := catName + ",小说列表"
	// [R65-b] 智能 TDK(分类页): 站点启用分类套(14-16)时随机生成; 无锚分类页(「全部」)与
	// 未启用均回落上行原逻辑(对齐 R62 同语义)。
	if td, ok := d.smartTdkFill(site, smart.PageCategory, nil, catName); ok {
		tdkTitle, headDesc, headKw = td.Title, td.Description, td.Keywords
	}
	head := d.head(r, site, tdkTitle, headDesc, headKw, joinSite(viewHref("category", sid, map[string]string{"cat": cat}), ""))

	data := d.baseData(r, site, head)
	data["Books"] = books
	data["CatName"] = catName
	data["Cat"] = cat
	data["Cats"] = cats
	data["Pager"] = makePager(page, total, size, func(p int) string {
		return viewHref("category", sid, map[string]string{"cat": cat, "page": strconv.Itoa(p), "sort": sortKey, "status": statusKey})
	})
	data["Sort"] = sortKey
	data["Status"] = statusKey
	// [R59-2a-batch2] ddyueshu(biquge) 分类页 1:1: 真站 /{锚}/ 页顶部 .hot.bd 6 封面位 +
	// 右栏同分类人气榜(真站 .up .r [分类]书名/作者 行; 本站以字数序近似真站人气)。
	if themeOf(site) == "ddyueshu" {
		hot, _, _ := d.DB.WebListBooks(1, 6, cat, "", "words", "")
		data["HotPicks"] = hot
		side, _, _ := d.DB.WebListBooks(1, 20, cat, "", "words", "")
		data["SideRank"] = side
	}
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
	// [R62-b] viewHref 内部已 joinSite 追加 site 参数, 外层再包一层 joinSite(…, sid)
	// 造成「site=X&site=X」重复参数(修前 sitemap 实测 3 类 URL 全部双写)。去外层包裹。
	add(viewHref("fulltext", sid, nil), "")
	add(viewHref("ranking", sid, nil), "")
	for _, c := range cats {
		add(viewHref("category", sid, map[string]string{"cat": ToStrSafe(c["id"])}), "")
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
