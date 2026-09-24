// ============================================================
// Web 层单元测试 — 消毒器 bypass 向量 / SEO 小件 / 主题解析 / 模板冒烟
// (无 DB 依赖; handler 级验证由 /tmp harness 承担)
// ============================================================
package web

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// ---------------- sanitizeChapterHTML(外部抓取正文 = 不可信输入) ----------------

func TestSanitizeChapterHTML_BypassVectors(t *testing.T) {
	cases := []struct{ name, in, mustNotContain string }{
		{"script块", `<p>正文</p><script>alert(1)</script>`, "alert(1)"},
		{"未闭合script到EOF", `<p>a</p><script>alert(1)`, "alert(1)"},
		{"img onerror", `<img src=x onerror=alert(1)>`, "onerror"},
		{"斜杠分隔onerror(HTML5 tokenizer / 等价空白)", `<img src=x/onerror=alert(1)>`, "onerror"},
		{"实体冒号javascript", `<a href="javascript&#58;alert(1)">x</a>`, "javascript"},
		{"tab走私scheme", `<a href="jav&#x09;ascript:alert(1)">x</a>`, "ascript"},
		{"字面tab换行", "<a href=\"java\tscript:alert(1)\">x</a>", "ascript"},
		{"data协议", `<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>`, "data:"},
		{"vbscript", `<a href="vbscript:msgbox(1)">x</a>`, "vbscript"},
		{"大小写混合", `<A HREF="JavaScript:alert(1)">x</A>`, "JavaScript"},
		{"引号内大于号", `<img alt=">" onerror=alert(1) src=x>`, "onerror"},
		{"iframe块", `<iframe src="https://evil"></iframe>正文`, "iframe"},
		{"object块", `<object data="https://evil"></object>正文`, "object"},
		{"svg外链animate", `<svg><a href="javascript:alert(1)"><text>x</text></a></svg>`, "javascript"},
		{"base标签", `<base href="javascript://">`, "base"},
		{"style块js", `<style>body{background:url(javascript:alert(1))}</style>正文`, "javascript"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			out := sanitizeChapterHTML(c.in)
			if strings.Contains(strings.ToLower(out), strings.ToLower(c.mustNotContain)) {
				t.Fatalf("sanitizer leak:\n in=%q\n out=%q", c.in, out)
			}
		})
	}
}

func TestSanitizeChapterHTML_KeepsSafeContent(t *testing.T) {
	safe := `<p>第一章 风起</p><p>他走向远方——「&lt;script&gt;」只是文字。</p><a href="https://example.com">合法外链</a><br/><img src=x onload&#61;alert(1)>`
	out := sanitizeChapterHTML(safe)
	for _, want := range []string{`<p>第一章 风起</p>`, `href="https://example.com"`, "<br/>", `onload&#61;alert(1)`} {
		if !strings.Contains(out, want) {
			t.Fatalf("安全内容被误删: want %q in %q", want, out)
		}
	}
}

func TestIsSafeURLValue(t *testing.T) {
	unsafe := []string{"javascript:alert(1)", " JavaScript:alert(1)", " jav&#x09;ascript:alert(1)", "java\nscript:x", "data:text/html,x", "vbscript:x", "\x14javascript:x", "mailto:a@b.c", "file:///etc/passwd"}
	safe := []string{"", "/book/1.html", "#top", "https://example.com/a?b=c", "http://example.com", "cover/1.jpg", "  /relative  "}
	for _, u := range unsafe {
		if isSafeURLValue(u) {
			t.Fatalf("isSafeURLValue(%q)=true, want false", u)
		}
	}
	for _, u := range safe {
		if !isSafeURLValue(u) {
			t.Fatalf("isSafeURLValue(%q)=false, want true", u)
		}
	}
}

// ---------------- contentToParagraphs ----------------

func TestContentToParagraphs(t *testing.T) {
	if got := contentToParagraphs("a\n\nb\n\nc"); got != "<p>a</p><p>b</p><p>c</p>" {
		t.Fatalf("连续换行分段(\\n+ 正则口径)失效: %q", got)
	}
	if got := contentToParagraphs("<p>第一段\n第二段</p>"); got != "<p>第一段<br/>第二段</p>" {
		t.Fatalf("单<p>存量数据 \\n→<br/> 失效: %q", got)
	}
	if got := contentToParagraphs("<p>一</p><p>二</p>"); got != "<p>一</p><p>二</p>" {
		t.Fatalf("多<p>原样直通失效: %q", got)
	}
	if got := contentToParagraphs("纯文本无换行"); got != "<p>纯文本无换行</p>" {
		t.Fatalf("纯文本包裹失效: %q", got)
	}
}

// ---------------- requestOrigin(Host 头不可信) ----------------

func TestRequestOrigin_HostValidation(t *testing.T) {
	cases := []struct {
		name, xfhost, host, want string
	}{
		{"正常", "", "example.com:8080", "http://example.com:8080"},
		{"反代头", "cdn.example.com", "internal", "http://cdn.example.com"},
		{"反代头多值取首个", "a.com, b.com", "internal", "http://a.com"},
		{"注入Host", "", `<script>alert(1)</script>`, ""},
		{"注入转发头", `evil"><script>`, "", ""},
		{"非法字符", "", "bad host.com", ""},
		{"超长", "", strings.Repeat("a", 300), ""},
		{"IPv6", "", "[::1]:3000", "http://[::1]:3000"},
		{"localhost", "", "localhost", "http://localhost"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "http://x/", nil)
			r.Host = c.host
			if c.xfhost != "" {
				r.Header.Set("X-Forwarded-Host", c.xfhost)
			}
			if got := requestOrigin(r); got != c.want {
				t.Fatalf("requestOrigin=%q want %q", got, c.want)
			}
		})
	}
}

// ---------------- 主题选择 ----------------

func TestThemeOf(t *testing.T) {
	cases := []struct {
		site map[string]any
		want string
	}{
		{nil, defaultTheme},
		{map[string]any{}, defaultTheme},
		{map[string]any{"themeId": "pili"}, "pili"},
		{map[string]any{"themeId": "shipsay"}, "shipsay"},
		{map[string]any{"themeId": "PIli"}, "pili"},
		{map[string]any{"themeId": "不存在"}, defaultTheme},
		{map[string]any{"themeId": "../admin"}, defaultTheme},
		{map[string]any{"themeId": ""}, defaultTheme},
		{map[string]any{"theme": "pili"}, "pili"}, // theme 别名兼容
	}
	for _, c := range cases {
		if got := themeOf(c.site); got != c.want {
			t.Fatalf("themeOf(%v)=%q want %q", c.site, got, c.want)
		}
	}
}

func TestValidHost(t *testing.T) {
	for _, h := range []string{"a.com", "a.b-c.com:443", "localhost", "[::1]", "[::1]:3000", "127.0.0.1"} {
		if !validHost(h) {
			t.Fatalf("validHost(%q)=false", h)
		}
	}
	for _, h := range []string{"", "a b", "a<b>", `a"b`, strings.Repeat("x", 260), "a.com/", "a\\b"} {
		if validHost(h) {
			t.Fatalf("validHost(%q)=true, want false", h)
		}
	}
}

// ---------------- 链接/分页小件 ----------------

func TestAppendQueryParam(t *testing.T) {
	if got := appendQueryParam("/read/5/", "page", "2"); got != "/read/5/?page=2" {
		t.Fatalf("toc 无查询串误拼 &: %q", got)
	}
	if got := appendQueryParam("/?view=toc&id=x", "page", "2"); got != "/?view=toc&id=x&page=2" {
		t.Fatalf("已有查询串应接 &: %q", got)
	}
}

func TestMakePagerBoundaries(t *testing.T) {
	p := makePager(1, 0, 24, func(i int) string { return "/?page=1" })
	if p.TotalPages != 1 || p.PrevURL != "" || p.NextURL != "" {
		t.Fatalf("空集分页应单页无翻页: %+v", p)
	}
	p = makePager(3, 49, 24, func(i int) string { return "/?page=3" })
	if p.TotalPages != 3 || p.PrevURL == "" || p.NextURL != "" {
		t.Fatalf("末页 NextURL 应为空: %+v", p)
	}
	if pageOf(map[string][]string{"page": {"-5"}}) != 1 || pageOf(map[string][]string{"page": {"99999999"}}) != 1_000_000 {
		t.Fatal("pageOf 钳位失效")
	}
}

func TestParsePrettyPathForms(t *testing.T) {
	if p := parsePrettyPath("/read/5/"); p == nil || p.view != "toc" {
		t.Fatalf("/read/5/ 应落目录: %+v", p)
	}
	if p := parsePrettyPath("/read/5_3.html"); p == nil || p.view != "read" || p.bookToken != "5" || p.chapterToken != "3" {
		t.Fatalf("紧凑双段解析失败: %+v", p)
	}
	if p := parsePrettyPath("/book/9.html"); p == nil || p.view != "book" {
		t.Fatalf("/book/9.html 解析失败: %+v", p)
	}
	if p := parsePrettyPath("/read/5/../../etc"); p != nil {
		t.Fatalf("路径遍历段应拒绝: %+v", p)
	}
}

func TestXMLEscape(t *testing.T) {
	if got := xmlEscape(`<loc>&"'</loc>`); got != "&lt;loc&gt;&amp;&quot;&apos;&lt;/loc&gt;" {
		t.Fatalf("xmlEscape: %q", got)
	}
}

func TestSafeHref(t *testing.T) {
	for _, u := range []string{"javascript:alert(1)", "//evil.com", "data:text/html,x", "JAVASCRIPT:x",
		`/\evil.com`, `\\evil.com`, `\evil.com`, " /\\evil.com", "\t//evil.com"} {
		if got := safeHref(u); got != "#" {
			t.Fatalf("safeHref(%q)=%q, want #", u, got)
		}
	}
	if got := safeHref("https://friend.example"); got != "https://friend.example" {
		t.Fatalf("合法外链被拦: %q", got)
	}
	if got := safeHref("/book/1.html"); got != "/book/1.html" {
		t.Fatalf("站内路径被拦: %q", got)
	}
}

func TestCoverURL(t *testing.T) {
	if got := coverURL("javascript:alert(1)"); strings.Contains(got, "javascript:") {
		t.Fatalf("伪协议 cover 未走 API 包装: %q", got)
	}
	if got := coverURL("covers/a b.jpg"); got != "/api/public/cover?file=a%20b.jpg" {
		t.Fatalf("本地封面编码: %q", got)
	}
	if got := coverURL("https://x/y.jpg"); got != "https://x/y.jpg" {
		t.Fatalf("外链封面应直用: %q", got)
	}
}

// ---------------- 模板集装载与全页渲染冒烟(三主题 × 12 页 + 后台) ----------------

func kitchenSinkData() map[string]any {
	return map[string]any{
		"Site":     map[string]any{"id": "s1", "name": "测试站", "themeId": "pili"},
		"SiteID":   "s1",
		"Head":     map[string]any{"Title": "T", "Description": "D", "Keywords": "K", "Canonical": "/"},
		"NavCats":  []string{"玄幻"},
		"CatCount": 1,
		"Cats":     []map[string]any{{"id": "c1", "name": "玄幻", "bookCount": int64(3)}},
		"Links":    []map[string]any{{"name": "友链", "url": "https://f.example"}},
		"Q":        "",
		"HomeHref": "/", "SearchHref": "/?view=search", "FulltextHref": "/?view=fulltext",
		"RankingHref": "/?view=ranking", "KeywordHref": "/?view=keyword", "HistoryHref": "/?view=history",
		"Books": []map[string]any{{"id": "b1", "num": int64(1), "name": "书名", "author": "作者", "category": "玄幻",
			"intro": "<p>简介</p>", "cover": "", "wordCount": int64(123456), "status": "ongoing",
			"updatedAt": int64(1700000000000), "latestChapter": "第1章"}},
		"ClickRank": nil, "WeekRank": nil, "TopBook": nil, "Authors": nil,
		"Stats":        map[string]any{"Books": 1, "Words": int64(9), "Authors": 1, "Chapters": 1},
		"Pager":        makePager(1, 3, 24, func(int) string { return "/" }),
		"Book":         map[string]any{"id": "b1", "num": int64(1), "name": "书名", "author": "作者", "category": "玄幻", "intro": "", "cover": "", "wordCount": int64(9), "status": "ongoing", "updatedAt": int64(0), "categoryId": "c1"},
		"Chapter":      map[string]any{"id": "ch1", "idx": int64(1), "title": "章节名", "content": "正文第一段\n\n正文第二段"},
		"ChapterCount": 1,
		"Tags":         []string{"tag1"},
		"Recs":         nil, "SideRank": nil, "LatestChapters": nil,
		"FirstChapter": nil,
		"BookHref":     "/book/1.html", "ReadFirstHref": "", "TocHref": "/read/1/",
		"Total":    int64(0),
		"Chapters": nil,
		"Prev":     nil, "Next": nil, "PrevHref": "", "NextHref": "",
		"CatName": "全部", "Cat": "",
		"Boards": nil,
		"Tag":    "", "Primary": nil, "Others": nil, "Related": nil, "PrimaryBookHref": "",
		"Row":     map[string]any{"title": "", "keyword": "kw", "description": "", "updatedAt": int64(0)},
		"Heading": "H", "SiteName": "测试站", "BookViews": []map[string]any{},
		"Msg": "",
	}
}

func TestThemeTemplateSets_RenderSmoke(t *testing.T) {
	themes := []string{defaultTheme, "pili", "shipsay", "x2552", "kks101", "trxsw", "ddyueshu", "ggd66", "huangjinwu", "qb23", "x33yq"}
	for _, theme := range themes {
		set := themeSet(theme)
		if set == nil {
			t.Fatalf("主题 %s 模板集装载失败", theme)
		}
		for _, name := range publicPages {
			tpl, ok := set[name]
			if !ok {
				t.Fatalf("主题 %s 缺页 %s", theme, name)
			}
			data := kitchenSinkData()
			data["Site"] = map[string]any{"id": "s1", "name": "测试站", "themeId": theme}
			switch name {
			case "search": // renderSearch: Tags=WebRelatedTags([]map 带 .tag)
				data["Tags"] = []map[string]any{{"tag": "t1", "hits": 1, "bookId": "b1"}}
			case "book": // renderBookPage: Tags=WebBookTags([]string)
				data["Tags"] = []string{"t1"}
			}
			w := httptest.NewRecorder()
			if err := tpl.ExecuteTemplate(w, "layout.html", data); err != nil {
				t.Fatalf("主题 %s 页 %s 渲染失败: %v", theme, name, err)
			}
			if w.Code != http.StatusOK {
				t.Fatalf("主题 %s 页 %s 渲染码 %d", theme, name, w.Code)
			}
			body := w.Body.String()
			if !strings.Contains(body, "<!DOCTYPE html>") {
				t.Fatalf("主题 %s 页 %s 输出非完整文档", theme, name)
			}
			if !strings.Contains(body, `rel="manifest"`) || !strings.Contains(body, "/static/js/pwa.js") {
				t.Fatalf("主题 %s 页 %s 未注入 PWA 注入点", theme, name)
			}
		}
	}
}

func TestRender_DefaultThemeFallback(t *testing.T) {
	w := httptest.NewRecorder()
	data := kitchenSinkData()
	data["Site"] = map[string]any{} // 空站表 → 缺省主题(themeOf 空表回落)
	render(w, "404", data)
	if w.Code != http.StatusOK {
		t.Fatalf("render 404 状态 %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "clone-aijjxs") {
		t.Fatal("无 Site 时应回落缺省主题 aijjxs")
	}
}

func TestAdminTemplates_LoadAndRender(t *testing.T) {
	ensureAdminTpls()
	w := httptest.NewRecorder()
	render(w, "login", map[string]any{"Head": map[string]any{"Title": "登录"}, "Sections": []map[string]any{}, "PreviewHint": ""})
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "mhgl 管理台") {
		t.Fatalf("login 渲染异常: %d %s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	render(w, "admin:dashboard", map[string]any{"Head": map[string]any{"Title": "仪表盘"}, "Sections": []map[string]any{}, "Current": "dashboard", "Label": "仪表盘"})
	if w.Code != http.StatusOK {
		t.Fatalf("admin:dashboard 渲染异常: %d", w.Code)
	}
}

// ---------------- 列表行封面渲染回归(R58-2b: 列表页必须渲染封面缩略图) ----------------

// TestAllThemes_ListCoverRendered 有 cover → /api/public/cover 包装 URL 进列表行;
// 空 cover → 占位块文字回显且不产生封面 URL。范围 = 全主题 home 主列表 + 缺省主题四列表页
// (R58-2b 任务面: aijjxs home/category/fulltext/ranking + 其余主题 home)。
func TestAllThemes_ListCoverRendered(t *testing.T) {
	cases := []struct{ theme, page string }{
		{defaultTheme, "home"}, {defaultTheme, "category"}, {defaultTheme, "fulltext"}, {defaultTheme, "ranking"},
		{"pili", "home"}, {"shipsay", "home"}, {"x2552", "home"}, {"kks101", "home"},
		{"trxsw", "home"}, {"ddyueshu", "home"}, {"ggd66", "home"}, {"huangjinwu", "home"},
		{"qb23", "home"}, {"qb23", "category"}, {"qb23", "fulltext"}, {"x33yq", "home"},
		{"x33yq", "category"}, {"ggd66", "category"}, {"huangjinwu", "category"},
	}
	for _, c := range cases {
		set := themeSet(c.theme)
		if set == nil {
			t.Fatalf("主题 %s 模板集装载失败", c.theme)
		}
		seed := func(cover string) map[string]any {
			data := kitchenSinkData()
			data["Site"] = map[string]any{"id": "s1", "name": "测试站", "themeId": c.theme}
			data["Books"].([]map[string]any)[0]["cover"] = cover
			data["Boards"] = []map[string]any{{"Key": "latest", "Label": "更新榜", "Books": data["Books"]}}
			// [R60-2a] 封面载体为主题面板数据的主题(ggd66 封推/qb23 热门网格)同步播种面板键
			if c.theme == "ggd66" {
				data["GgTuij"] = data["Books"]
				data["GgRank"] = data["Books"]
			}
			if c.theme == "qb23" {
				data["QbHot"] = data["Books"]
			}
			return data
		}
		for _, cover := range []string{"covers/book_x.jpg", ""} {
			data := seed(cover)
			w := httptest.NewRecorder()
			if err := set[c.page].ExecuteTemplate(w, "layout.html", data); err != nil {
				t.Fatalf("主题 %s 页 %s 渲染失败: %v", c.theme, c.page, err)
			}
			hasURL := strings.Contains(w.Body.String(), "/api/public/cover")
			if cover != "" && !hasURL {
				t.Fatalf("主题 %s 页 %s 列表行未渲染封面 URL", c.theme, c.page)
			}
			if cover == "" && hasURL {
				t.Fatalf("主题 %s 页 %s 空 cover 不应产生封面 URL", c.theme, c.page)
			}
		}
	}
}

// ---------------- 全主题 XSS 探针(爬虫外部数据经模板渲染不得形成活标记) ----------------

// xssProbes 活标记探针: 输出含任一子串 = 外部数据未转义/未消毒进入 HTML。
// 已转义形态(&lt;img ...)与静态 javascript:void(0)/<script src> 不匹配这些探针。
var xssProbes = []string{
	`<img src=x onerror=alert`,
	`<script>alert`,
	`<svg onload`,
	`onmouseover="alert`,
	`onclick="alert`,
	`href="javascript:alert`,
	`href="/\evil.com`, // safeHref 反斜杠协议相对口子
}

// poisonedSink 全字段毒化的渲染数据(书名/作者/简介/章节/站名/友链/Q/专题全走爬虫口径)。
func poisonedSink() map[string]any {
	img := `<img src=x onerror=alert(1)>`
	svg := `"><svg onload=alert(5)>`
	d := kitchenSinkData()
	d["Site"] = map[string]any{"id": "s1", "name": `测试站` + img, "themeId": "pili"}
	d["Links"] = []map[string]any{{"name": `<script>alert(9)</script>`, "url": `/\evil.com`}}
	d["Q"] = `搜索` + img
	d["Msg"] = `页面` + img
	b := map[string]any{
		"id": "b1", "num": int64(1), "name": `书名` + img, "author": `作者<script>alert(2)</script>`,
		"category": `分类` + svg, "categoryId": "c1",
		"intro": `<p onclick="alert(3)">简介</p><script>alert(4)</script>`,
		"cover": `"><img src=x onerror=alert(11)>`, "wordCount": int64(9), "status": "ongoing",
		"updatedAt": int64(1700000000000), "latestChapter": `章名` + svg,
	}
	books := []map[string]any{b}
	d["Books"] = books
	d["Book"] = b
	d["Chapter"] = map[string]any{
		"id": "ch1", "idx": int64(1), "title": `章节名` + img,
		"content": "正文第一段\n\n<img src=x onerror=alert(7)><script>alert(8)</script>",
	}
	d["LatestChapters"] = []map[string]any{{"id": "ch1", "idx": int64(1), "title": `章节名` + img}}
	d["Tags"] = []string{`tag` + img}
	d["Primary"] = b
	d["PrimaryBookHref"] = "/book/1.html"
	d["Heading"] = `专题` + img
	d["Row"] = map[string]any{"title": `T` + img, "keyword": `kw` + img, "description": `D` + img, "updatedAt": int64(0)}
	d["BookViews"] = []map[string]any{{"Book": b, "BookHref": "/book/1.html", "TocHref": "/read/1/"}}
	d["Boards"] = []map[string]any{{"Key": "latest", "Label": `更新榜` + img, "Books": books}}
	return d
}

// ---------------- 主题 1:1 复刻修复面板回归(R59-2a-batch2) ----------------

// panelSeedData 主题面板渲染数据: kitchenSink 基座 + 主题面板键播种(1:1 面板钉/类名覆盖核查共用)。
// 页面差异: search 页 Tags=WebRelatedTags([]map 带 .tag), book 页 Tags=WebBookTags([]string)。
func panelSeedData(theme, page string) map[string]any {
	cov := func(name string) map[string]any {
		return map[string]any{"id": "b-" + name, "num": int64(1), "name": name, "author": "作者",
			"cover": "covers/x.jpg", "intro": "简介", "wordCount": int64(9), "status": "ongoing",
			"updatedAt": int64(1700000000000), "latestChapter": "第1章", "category": "玄幻奇幻"}
	}
	data := kitchenSinkData()
	data["Site"] = map[string]any{"id": "s1", "name": "测试站", "themeId": theme}
	switch page {
	case "search":
		data["Tags"] = []map[string]any{{"tag": "t1", "hits": 1, "bookId": "b1"}}
	case "book":
		data["Tags"] = []string{"t1"}
	}
	if theme == "pili" || theme == "shipsay" {
		data["CoverRow"] = []map[string]any{cov("甲"), cov("乙"), cov("丙"), cov("丁")}
	}
	if theme == "pili" {
		data["CatGroups"] = []map[string]any{{"Name": "现代言情", "Books": []map[string]any{cov("甲"), cov("乙")}}}
	}
	if theme == "shipsay" || theme == "ddyueshu" {
		data["CatBlocks"] = []map[string]any{{"Name": "玄幻奇幻", "Books": []map[string]any{cov("甲"), cov("乙")}}}
	}
	// [R60-2a] 新主题面板数据钉
	if theme == "ggd66" {
		data["GgTuij"] = []map[string]any{cov("甲"), cov("乙")}
		data["GgRank"] = []map[string]any{cov("丙")}
	}
	if theme == "huangjinwu" {
		data["HjwHot"] = []map[string]any{cov("甲"), cov("乙")}
		data["HjwMods"] = []map[string]any{{"Name": "玄幻奇幻", "Books": []map[string]any{cov("丙")}}}
	}
	if theme == "qb23" {
		data["QbHot"] = []map[string]any{cov("甲"), cov("乙")}
		data["QbCols"] = []map[string]any{{"Name": "都市生活", "Books": []map[string]any{cov("丙")}}}
	}
	if theme == "x33yq" && page == "toc" {
		data["XqSide"] = []map[string]any{cov("甲"), cov("乙")}
	}
	if theme == "ddyueshu" && page == "category" {
		data["HotPicks"] = []map[string]any{cov("甲")}
		data["SideRank"] = []map[string]any{cov("甲")}
	}
	return data
}

// TestThemes_1to1Panels 本轮 1:1 复刻修复新增面板/行的渲染钉:
//
//	pili 强档推荐+分类封面列+分类筛选行 / shipsay sortvisit 分类块 / ddyueshu novelslist
//	六分类块+分类页 hot+up 双栏 / kks101 快捷入口+封面格牆+书页标签块 / x2552 公告条
//	ggd66 封推+搜索框+书库盒 / huangjinwu 封面卡+分类排行榜+hero / qb23 热门网格+榜单列+筛选行
//	x33yq GARAN+newscontent+目录侧栏。
//	缺键路径由 TestThemeTemplateSets_RenderSmoke(kitchenSink 无新键)覆盖, 转义由 XSS 探针组覆盖。
func TestThemes_1to1Panels(t *testing.T) {
	cases := []struct{ theme, page, marker string }{
		{"pili", "home", "pli-strong"}, {"pili", "home", "pli-catcols"}, {"pili", "category", "pli-filters"},
		{"pili", "home", "pli-banner-item"},
		{"shipsay", "home", "ss-sortvisit"},
		{"ddyueshu", "home", "ddy-nl-content"}, {"ddyueshu", "category", "ddy-up-l"}, {"ddyueshu", "category", "ddy-up-r"},
		{"kks101", "home", "kks-quick"}, {"kks101", "category", "kks-newnovels"}, {"kks101", "book", "kks-tagul"},
		{"x2552", "home", "x2-announce"},
		{"ggd66", "home", "ggd-fengtui"}, {"ggd66", "home", "ggd-fsearch"}, {"ggd66", "category", "ggd-bookbox"},
		{"huangjinwu", "home", "hjw-book-card"}, {"huangjinwu", "home", "hjw-rankmod"}, {"huangjinwu", "book", "hjw-hero"},
		{"qb23", "home", "qb-hot-grid"}, {"qb23", "home", "qb-rankcols"}, {"qb23", "category", "qb-filter-row"},
		{"x33yq", "home", "xq-GARAN"}, {"x33yq", "home", "xq-newscontent"}, {"x33yq", "toc", "xq-sidebar"},
	}
	for _, c := range cases {
		set := themeSet(c.theme)
		if set == nil {
			t.Fatalf("主题 %s 模板集装载失败", c.theme)
		}
		data := panelSeedData(c.theme, c.page)
		w := httptest.NewRecorder()
		if err := set[c.page].ExecuteTemplate(w, "layout.html", data); err != nil {
			t.Fatalf("主题 %s 页 %s 渲染失败: %v", c.theme, c.page, err)
		}
		if !strings.Contains(w.Body.String(), c.marker) {
			t.Fatalf("主题 %s 页 %s 未渲染 %s 面板", c.theme, c.page, c.marker)
		}
	}
}

func TestAllThemes_XSSProbe(t *testing.T) {
	for _, theme := range []string{defaultTheme, "pili", "shipsay", "x2552", "kks101", "trxsw", "ddyueshu", "ggd66", "huangjinwu", "qb23", "x33yq"} {
		set := themeSet(theme)
		if set == nil {
			t.Fatalf("主题 %s 模板集装载失败", theme)
		}
		for _, name := range publicPages {
			data := poisonedSink()
			data["Site"].(map[string]any)["themeId"] = theme
			switch name {
			case "search": // renderSearch: Tags=WebRelatedTags([]map 带 .tag)
				data["Tags"] = []map[string]any{{"tag": `tag` + `<img src=x onerror=alert(1)>`, "hits": 1}}
				data["Total"] = int64(1)
			case "book": // renderBookPage: Tags=WebBookTags([]string)
				data["Tags"] = []string{`tag` + `<img src=x onerror=alert(1)>`}
			}
			w := httptest.NewRecorder()
			if err := set[name].ExecuteTemplate(w, "layout.html", data); err != nil {
				t.Fatalf("主题 %s 页 %s 渲染失败: %v", theme, name, err)
			}
			body := w.Body.String()
			for _, probe := range xssProbes {
				if strings.Contains(body, probe) {
					t.Fatalf("主题 %s 页 %s XSS 探针命中 %q:\n%s", theme, name, probe, body)
				}
			}
			if name == "home" && !strings.Contains(body, "&lt;img") {
				t.Fatalf("主题 %s 首页未观察到自动转义痕迹(&lt;img 缺失)", theme)
			}
		}
	}
}

// ---------------- 全主题逐页 css 类名覆盖核查(R60-2a 指令 10) ----------------

// cssDir 主题样式目录(测试进程 CWD=internal/web; css 由 cmd/server http.Dir("web/static") 磁盘服务,
// 不在 embed 内, 故以相对路径读盘核查; 缺失即失败 — 主题裸奔态在门禁即拦截)。
const cssDir = "../../web/static/css"

// cssCoverageWhitelist 非主题样式承载的类: site.js 阅读控件基类(主题 css 以主题前缀组合类承载,
// 如 .ddy-fs/.ggd-fs)与 JS/模板态切换类(is-* 活性态由 JS 增删或组合选择器承载)。
var cssCoverageWhitelist = map[string]bool{
	"ajx-s": true, "ajx-c": true, "ajx-ys": true, "ajx-fonts": true, "ajx-ffamily": true,
	"is-active": true, "is-disabled": true, "is-show": true, "is-open": true, "is-on": true,
}

var classAttrRe = regexp.MustCompile(`class="([^"]*)"`)

// TestAllThemes_CSSClassCoverage 11 主题 × 12 页逐页渲染, 提取输出中全部 class token,
// 与该主题 css 文件交叉核对: 出现而未定义的类 = 「裸奔区块」, 逐项报缺(上限 12 条/主题防刷屏)。
// 附带断言: 每主题 css 存在 + 含移动端断点(@media) + layout 版心类在位。
func TestAllThemes_CSSClassCoverage(t *testing.T) {
	themes := []string{defaultTheme, "pili", "shipsay", "x2552", "kks101", "trxsw", "ddyueshu", "ggd66", "huangjinwu", "qb23", "x33yq"}
	for _, theme := range themes {
		cssName := theme + ".css"
		if theme == defaultTheme {
			cssName = "site.css"
		}
		cssBytes, err := os.ReadFile(filepath.Join(cssDir, cssName))
		if err != nil {
			t.Fatalf("主题 %s 样式缺失(%s): %v", theme, cssName, err)
		}
		css := string(cssBytes)
		if !strings.Contains(css, "@media") {
			t.Errorf("主题 %s 样式 %s 缺移动端断点(@media)", theme, cssName)
		}
		set := themeSet(theme)
		if set == nil {
			t.Fatalf("主题 %s 模板集装载失败", theme)
		}
		for _, page := range publicPages {
			data := panelSeedData(theme, page)
			w := httptest.NewRecorder()
			if err := set[page].ExecuteTemplate(w, "layout.html", data); err != nil {
				t.Fatalf("主题 %s 页 %s 渲染失败: %v", theme, page, err)
			}
			missing := map[string]bool{}
			for _, m := range classAttrRe.FindAllStringSubmatch(w.Body.String(), -1) {
				for _, cls := range strings.Fields(m[1]) {
					if cls == "" || cssCoverageWhitelist[cls] || missing[cls] {
						continue
					}
					if !strings.Contains(css, "."+cls) {
						missing[cls] = true
					}
				}
			}
			if len(missing) > 0 {
				keys := make([]string, 0, len(missing))
				for k := range missing {
					keys = append(keys, "."+k)
				}
				sort.Strings(keys)
				if len(keys) > 12 {
					keys = append(keys[:12], "…")
				}
				t.Errorf("主题 %s 页 %s 裸奔类(渲染出现但 %s 未定义): %s", theme, page, cssName, strings.Join(keys, " "))
			}
		}
	}
}
