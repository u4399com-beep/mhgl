// ============================================================
// 前台 SEO/TDK 引擎 — src/lib/seo-tpl.ts 逐语义移植(默认模板+Setting 覆盖+码点截断)
//
//	· {var} 插值: 未知变量整段丢弃; 产出清洗重复标点/首尾悬挂标点
//	· 书籍页 title ≤40 / desc ≤160 / keywords ≤200; 目录页/章节页同安全线
//	· 简介空 → 固定句式兜底; keywords 去重合并站点关键词尾段
//
// 另含前台渲染小件: plainText/sanitizeChapterHTML/coverURL/safeHref/格式化。
// ============================================================
package web

import (
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// ---- TDK 模板集(默认值与 seo-tpl.ts DEFAULT_SEO_TEMPLATES 逐字段一致) ----

type tdkTriple struct{ Title, Desc, Kw string }
type tdkSet struct{ Book, Toc, Chapter tdkTriple }

var defaultTdk = tdkSet{
	Book: tdkTriple{
		Title: "{bookname}_{author}小说全文免费阅读 - {sitename}",
		Desc:  "《{bookname}》是{author}创作的{category}小说，{statusText}。{intro}《{bookname}》在{sitename}提供全文免费在线阅读。",
		Kw:    "{bookname},{bookname}小说,{bookname}全文阅读,{bookname}免费阅读,{author},{author}小说,{category}小说",
	},
	Toc: tdkTriple{
		Title: "{bookname}目录_全部章节列表 - {sitename}",
		Desc:  "《{bookname}》{statusText}，共{chapterCount}章。{sitename}为您整理{bookname}全部章节目录，持续更新，免费在线阅读。",
	},
	Chapter: tdkTriple{
		Title: "{bookname}_{chaptername} - {sitename}",
		Desc:  "《{bookname}》{chaptername}在线阅读：{excerpt}……{sitename}提供{bookname}最新章节免费无弹窗阅读。",
		Kw:    "{bookname},{bookname}最新章节,{chaptername},{bookname}{chaptername},{bookname}无弹窗",
	},
}

var varRe = regexp.MustCompile(`\{(\w+)\}`)

// loadSeoTpls 读 Setting.seoTemplates(JSON) 覆盖默认(字段须含 '{' 才采纳, 防脏数据)。
func (d Deps) loadSeoTpls() tdkSet {
	set := defaultTdk
	var raw struct {
		Book    map[string]string `json:"book"`
		Toc     map[string]string `json:"toc"`
		Chapter map[string]string `json:"chapter"`
	}
	if ok, err := d.DB.SettingJSON("seoTemplates", &raw); err != nil || !ok {
		return set
	}
	pick := func(v, def string) string {
		if strings.TrimSpace(v) != "" && strings.Contains(v, "{") {
			return v
		}
		return def
	}
	if raw.Book != nil {
		set.Book.Title = pick(raw.Book["title"], set.Book.Title)
		set.Book.Desc = pick(raw.Book["description"], set.Book.Desc)
		set.Book.Kw = pick(raw.Book["keywords"], set.Book.Kw)
	}
	if raw.Toc != nil {
		set.Toc.Title = pick(raw.Toc["title"], set.Toc.Title)
		set.Toc.Desc = pick(raw.Toc["description"], set.Toc.Desc)
	}
	if raw.Chapter != nil {
		set.Chapter.Title = pick(raw.Chapter["title"], set.Chapter.Title)
		set.Chapter.Desc = pick(raw.Chapter["description"], set.Chapter.Desc)
		set.Chapter.Kw = pick(raw.Chapter["keywords"], set.Chapter.Kw)
	}
	return set
}

// tdkVars 模板变量集(口径与 seo-tpl.ts SeoTplVars 对齐)。
type tdkVars struct {
	bookname, author, category, sitename string
	chaptername                          string
	chapterno, chapterCount              string
	status                               string // unknown|ongoing|completed|''
	intro, excerpt, siteKeywords         string
}

func (v tdkVars) toMap() map[string]string {
	statusText := ""
	switch v.status {
	case "completed":
		statusText = "已完结"
	case "ongoing":
		statusText = "连载中"
	}
	return map[string]string{
		"bookname":     v.bookname,
		"author":       v.author,
		"category":     v.category,
		"sitename":     v.sitename,
		"chaptername":  v.chaptername,
		"chapterno":    v.chapterno,
		"chapterCount": v.chapterCount,
		"statusText":   statusText,
		"intro":        clampCodePoints(stripLiteralEscapes(v.intro), 110),
		"excerpt":      clampCodePoints(stripLiteralEscapes(v.excerpt), 90),
	}
}

// interpolate {var} 插值 + 产出清洗(重复空白/重复标点/首尾悬挂标点)。
func interpolate(tpl string, vars tdkVars) string {
	m := vars.toMap()
	out := varRe.ReplaceAllStringFunc(tpl, func(s string) string {
		key := s[1 : len(s)-1]
		if v, ok := m[key]; ok {
			return v
		}
		return ""
	})
	out = regexp.MustCompile(`\s{2,}`).ReplaceAllString(out, " ")
	out = regexp.MustCompile(`(，|,|。|；|;)\s*(，|,|。|；|;)+`).ReplaceAllString(out, "$1")
	out = regexp.MustCompile(`^[，,。；;\s]+|[，,。；;\s]+$`).ReplaceAllString(out, "")
	return strings.TrimSpace(out)
}

// stripLiteralEscapes 字面 \uXXXX 还原 + 字面 \r\n\t\f → 空格(存量简介清洗)。
func stripLiteralEscapes(s string) string {
	if !strings.ContainsRune(s, '\\') {
		return s
	}
	uRe := regexp.MustCompile(`\\u([0-9a-fA-F]{4})`)
	s = uRe.ReplaceAllStringFunc(s, func(m string) string {
		var code rune
		for _, c := range m[2:] {
			code = code*16 + rune(hexVal(c))
		}
		if code >= 0xd800 && code <= 0xdfff {
			return " "
		}
		return string(code)
	})
	return regexp.MustCompile(`\\[rntfu]`).ReplaceAllString(s, " ")
}

func hexVal(c rune) int {
	switch {
	case c >= '0' && c <= '9':
		return int(c - '0')
	case c >= 'a' && c <= 'f':
		return int(c-'a') + 10
	case c >= 'A' && c <= 'F':
		return int(c-'A') + 10
	}
	return 0
}

// clampCodePoints 码点安全截断(UTF-8 rune 口径, 对齐 sliceCodePoints)。
func clampCodePoints(s string, max int) string {
	if max <= 0 || utf8.RuneCountInString(s) <= max {
		return s
	}
	rs := []rune(s)
	return string(rs[:max])
}

type composedTdk struct{ Title, Description, Keywords string }

// joinKeywords 关键词去重合并(站点关键词尾段) + 截断。
func joinKeywords(base, siteKeywords string, max int) string {
	parts := strings.Split(base+","+siteKeywords, ",")
	seen := map[string]bool{}
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" || seen[p] {
			continue
		}
		seen[p] = true
		out = append(out, p)
	}
	return clampCodePoints(strings.Join(out, ","), max)
}

// composeBookTdk 书籍页自动 TDK。
func (d Deps) composeBookTdk(vars tdkVars) composedTdk {
	t := d.loadSeoTpls()
	if vars.sitename == "" {
		vars.sitename = "小说站"
	}
	title := clampCodePoints(interpolate(t.Book.Title, vars), 40)
	if title == "" {
		title = clampCodePoints(vars.bookname+"免费阅读 - "+vars.sitename, 40)
	}
	desc := clampCodePoints(interpolate(t.Book.Desc, vars), 160)
	if desc == "" {
		fb := vars.bookname
		if vars.author != "" {
			fb += "," + vars.author + "著"
		}
		desc = clampCodePoints(fb+"全文免费在线阅读 - "+vars.sitename, 160)
	}
	kw := joinKeywords(interpolate(t.Book.Kw, vars), vars.siteKeywords, 200)
	return composedTdk{Title: title, Description: desc, Keywords: kw}
}

// composeTocTdk 目录页 TDK。
func (d Deps) composeTocTdk(vars tdkVars) composedTdk {
	t := d.loadSeoTpls()
	if vars.sitename == "" {
		vars.sitename = "小说站"
	}
	title := clampCodePoints(interpolate(t.Toc.Title, vars), 40)
	if title == "" {
		title = clampCodePoints(vars.bookname+"目录 - "+vars.sitename, 40)
	}
	desc := clampCodePoints(interpolate(t.Toc.Desc, vars), 160)
	return composedTdk{Title: title, Description: desc}
}

// composeChapterTdk 章节页 TDK。
func (d Deps) composeChapterTdk(vars tdkVars) composedTdk {
	t := d.loadSeoTpls()
	if vars.sitename == "" {
		vars.sitename = "小说站"
	}
	if vars.bookname == "" {
		vars.bookname = "小说"
	}
	if vars.chaptername == "" {
		vars.chaptername = "最新章节"
	}
	title := clampCodePoints(interpolate(t.Chapter.Title, vars), 40)
	if title == "" {
		title = clampCodePoints(vars.bookname+"_"+vars.chaptername+" - "+vars.sitename, 40)
	}
	desc := clampCodePoints(interpolate(t.Chapter.Desc, vars), 160)
	if desc == "" {
		desc = clampCodePoints(vars.bookname+" "+vars.chaptername+" 在线阅读 - "+vars.sitename, 160)
	}
	kw := joinKeywords(interpolate(t.Chapter.Kw, vars), vars.siteKeywords, 200)
	return composedTdk{Title: title, Description: desc, Keywords: kw}
}

// ---------------- 章节正文消毒(对齐 TS read-layouts/shared.tsx sanitizeReaderHtml R33 口径) ----------------
//
// 内容源为爬虫抓取的外部站数据(不可信), 此处为写侧清洗链之后的展示级纵深兜底:
//   1. 危险块级标签连内容整段剥离(script/style/noscript/iframe/object/embed/template + form/input/button)
//   2. on* 事件属性剥离(属性分隔符含 "/", HTML5 tokenizer 中 <img/src=x/onerror=y> 斜杠等价空白)
//   3. href/src(及 action 等出链属性) scheme 白名单: 探测值先做单遍字符引用解码 + 剥 \t\n\r +
//      剥首尾 C0 控制符/空格(浏览器 URL 解析同口径), 仅 http/https 与无 scheme 相对地址放行
//      (javascript:/vbscript:/data: 及 jav&#x09;ascript: / javascript&#58; 等全部编码变体拦截)
//   4. 标签 span 识别感知引号(alt=">" 等属性值含 > 时不再提前截断闭合边界)

// stripBlocks 块级危险标签连内容剥离(RE2 无反向引用, 逐标签编译; |$ 兼容未闭合块到 EOF)。
var stripBlockRes = []*regexp.Regexp{
	regexp.MustCompile(`(?is)<script\b[^>]*>.*?(</script\s*>|$)`),
	regexp.MustCompile(`(?is)<style\b[^>]*>.*?(</style\s*>|$)`),
	regexp.MustCompile(`(?is)<noscript\b[^>]*>.*?(</noscript\s*>|$)`),
	regexp.MustCompile(`(?is)<iframe\b[^>]*>.*?(</iframe\s*>|$)`),
	regexp.MustCompile(`(?is)<object\b[^>]*>.*?(</object\s*>|$)`),
	regexp.MustCompile(`(?is)<embed\b[^>]*>.*?(</embed\s*>|$)`),
	regexp.MustCompile(`(?is)<template\b[^>]*>.*?(</template\s*>|$)`),
}

func stripBlocks(s string) string {
	for _, re := range stripBlockRes {
		s = re.ReplaceAllString(s, " ")
	}
	return s
}

var (
	stripTagRe    = regexp.MustCompile(`(?s)<[^>]*>`)
	spaceRe       = regexp.MustCompile(`\s+`)
	selfCloseRe   = regexp.MustCompile(`(?is)<(script|style|noscript|iframe|object|embed|template|form|input|button|base|area|link|meta)\b[^>]*/?>`)
	closeTagRe    = regexp.MustCompile(`(?is)</(script|style|noscript|iframe|object|embed|template|form|input|button|base|area|link|meta)\s*>`)
	tagSpanRe     = regexp.MustCompile(`<[a-zA-Z](?:"[^"]*"|'[^']*'|` + "`" + `[^` + "`" + `]*` + "`" + `|[^>])*>`)
	onAttrRe      = regexp.MustCompile(`(?i)[\s/]+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|` + "`" + `[^` + "`" + `]*` + "`" + `|[^\s>]+)`)
	urlAttrRe     = regexp.MustCompile(`(?i)[\s/]+(?:href|src|action|formaction|xlink:href|poster|background|data|dynsrc|lowsrc)\s*=\s*(?:"[^"]*"|'[^']*'|` + "`" + `[^` + "`" + `]*` + "`" + `|[^\s>]+)`)
	decHexRe      = regexp.MustCompile(`(?i)&#x([0-9a-f]+);?`)
	decDecRe      = regexp.MustCompile(`&#([0-9]+);?`)
	decNamedRe    = regexp.MustCompile(`(?i)&(tab|newline|colon|sol|semi);`)
	schemeProbeRe = regexp.MustCompile(`^([a-zA-Z][a-zA-Z0-9+.\-]*):`)
)

// decodeCharRefsOnce 字符引用单遍解码(仅探测用, 幂等): 数字实体(十/十六, 兼容无分号形态)
// + URL 走私相关命名实体(tab/newline/colon/sol/semi)。非法/代理区段码点丢空。
func decodeCharRefsOnce(s string) string {
	if !strings.Contains(s, "&#") && !strings.Contains(s, "&") {
		return s
	}
	s = decHexRe.ReplaceAllStringFunc(s, func(m string) string {
		code, err := strconv.ParseInt(m[3:len(m)-1], 16, 64)
		if err != nil || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) {
			return ""
		}
		return string(rune(code))
	})
	s = decDecRe.ReplaceAllStringFunc(s, func(m string) string {
		code, err := strconv.ParseInt(m[2:len(m)-1], 10, 64)
		if err != nil || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) {
			return ""
		}
		return string(rune(code))
	})
	return decNamedRe.ReplaceAllStringFunc(s, func(m string) string {
		switch strings.ToLower(strings.TrimSuffix(strings.TrimPrefix(m, "&"), ";")) {
		case "tab":
			return "\t"
		case "newline":
			return "\n"
		case "colon":
			return ":"
		case "sol":
			return "/"
		case "semi":
			return ";"
		}
		return m
	})
}

// isSafeURLValue URL 属性值 scheme 白名单判定(TS isSafeUrlValue 同口径):
// 探测串剥 \t\n\r + 剥首尾 [\x00-\x20] 后, 无 scheme(相对/锚点)或 http/https 放行, 其余拦截。
func isSafeURLValue(raw string) bool {
	probe := decodeCharRefsOnce(raw)
	probe = strings.ReplaceAll(probe, "\t", "")
	probe = strings.ReplaceAll(probe, "\n", "")
	probe = strings.ReplaceAll(probe, "\r", "")
	probe = strings.Trim(probe, "\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0b\x0c\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f ")
	m := schemeProbeRe.FindStringSubmatch(probe)
	if m == nil {
		return true // 无 scheme → 相对地址/锚点
	}
	return m[1] == "http" || m[1] == "https"
}

// sanitizeTagAttrs 字面标签 span 内属性消毒: 剥 on* 事件属性; 出链属性值 scheme 白名单外整属性剥离。
func sanitizeTagAttrs(tag string) string {
	tag = onAttrRe.ReplaceAllString(tag, "")
	tag = urlAttrRe.ReplaceAllStringFunc(tag, func(m string) string {
		eq := strings.IndexByte(m, '=')
		val := strings.TrimSpace(m[eq+1:])
		raw := val
		if len(val) >= 2 {
			q := val[0]
			if (q == '"' || q == '\'' || q == '`') && val[len(val)-1] == q {
				raw = val[1 : len(val)-1]
			}
		}
		if isSafeURLValue(raw) {
			return m
		}
		return ""
	})
	return tag
}

// sanitizeChapterHTML 章节正文展示级消毒(对齐 TS sanitizeReaderHtml; 无需引号感知外正则时零分配直通)。
func sanitizeChapterHTML(s string) string {
	if s == "" {
		return ""
	}
	s = stripBlocks(s)
	s = selfCloseRe.ReplaceAllString(s, " ")
	s = closeTagRe.ReplaceAllString(s, " ")
	s = tagSpanRe.ReplaceAllStringFunc(s, sanitizeTagAttrs)
	return s
}

// plainText HTML → 折叠空白纯文本(TDK 摘要口径)。
func plainText(html string) string {
	if html == "" {
		return ""
	}
	s := stripBlocks(html)
	s = stripTagRe.ReplaceAllString(s, " ")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	s = strings.ReplaceAll(s, "\u3000", " ")
	return spaceRe.ReplaceAllString(s, " ")
}

var (
	contentPTagRe = regexp.MustCompile(`<p[\s>]`)
	multiNLRe     = regexp.MustCompile(`\n+`)
	tagOrNLRe     = regexp.MustCompile(`(<[^>]+>)|\n`)
)

// contentToParagraphs 章节正文段落规整(对齐 read-layouts/shared.tsx contentToHtml):
// 含 <p|div|br> 的 HTML 原样走(存量单 <p> 包裹 + 内部 \n 的 bug 产物 → \n 转 <br>);
// 纯文本按连续换行(\n+, 正则口径)分段各包 <p>(逐段 HTML 转义)。返回结果仍需 sanitizeChapterHTML 消毒。
func contentToParagraphs(raw string) string {
	content := strings.TrimSpace(raw)
	if content == "" {
		return ""
	}
	if hasAnyTag(content, "p", "div", "br") {
		pOpen := len(contentPTagRe.FindAllString(content, -1))
		hasBr := hasAnyTag(content, "br")
		if pOpen < 2 && !hasBr {
			return tagOrNLRe.ReplaceAllStringFunc(content, func(m string) string {
				if strings.HasPrefix(m, "<") {
					return m
				}
				return "<br/>"
			})
		}
		return content
	}
	var b strings.Builder
	for _, seg := range multiNLRe.Split(content, -1) {
		seg = strings.TrimSpace(seg)
		if seg == "" {
			continue
		}
		b.WriteString("<p>")
		b.WriteString(strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(seg, "&", "&amp;"), "<", "&lt;"), ">", "&gt;"))
		b.WriteString("</p>")
	}
	return b.String()
}

// hasAnyTag 宽容检测内容是否含指定标签开形态(对齐 /<\s*(p|div|br)\b/i 口径)。
func hasAnyTag(s string, tags ...string) bool {
	low := strings.ToLower(s)
	for _, t := range tags {
		if tagReFor(t).MatchString(low) {
			return true
		}
	}
	return false
}

// tagReCache 标签开形态正则缓存(仅 p/div/br 三键; [R66-c] 补互斥锁 —— 修前并发
// 渲染阅读页(readHTML→contentToParagraphs→hasAnyTag)冷缓存首遇可并发写 map,
// Go 运行时对并发 map 写直接 fatal(不可 recover), 属进程级崩溃面; 加锁后写路径串行)。
var (
	tagReCacheMu sync.Mutex
	tagReCache   = map[string]*regexp.Regexp{}
)

func tagReFor(tag string) *regexp.Regexp {
	tagReCacheMu.Lock()
	defer tagReCacheMu.Unlock()
	if re, ok := tagReCache[tag]; ok {
		return re
	}
	re := regexp.MustCompile(`<\s*` + tag + `\b`)
	tagReCache[tag] = re
	return re
}

// coverURL 封面地址: 外链直用, 本地 covers/ 走 /api/public/cover?file=(3-b 端点; 不可达时
// 前端 onerror 回落占位封面, 绝不 500)。空 → 空串(渲染占位块)。
func coverURL(cover string) string {
	cover = strings.TrimSpace(cover)
	if cover == "" {
		return ""
	}
	if strings.HasPrefix(cover, "http://") || strings.HasPrefix(cover, "https://") {
		return cover
	}
	f := strings.TrimPrefix(cover, "covers/")
	f = strings.TrimPrefix(f, "/")
	if f == "" {
		return ""
	}
	return "/api/public/cover?file=" + queryEscapeLocal(f)
}

func queryEscapeLocal(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~' {
			b.WriteByte(c)
		} else {
			b.WriteString(fmtHexByte(c))
		}
	}
	return b.String()
}

func fmtHexByte(c byte) string {
	const hex = "0123456789ABCDEF"
	return "%" + string(hex[c>>4]) + string(hex[c&0xf])
}

// safeHref 友链/外链白名单出口(对齐 safe-href.ts: 仅 http(s) 与站内 / # 放行, 其余 '#')。
// 反斜杠口子(浏览器把 href 中 "\" 等价 "/"): "/\" 或 "\\" 开头即协议相对指向任意外域, 拦截。
func safeHref(u string) string {
	s := strings.TrimSpace(u)
	if s == "" {
		return "#"
	}
	if strings.HasPrefix(s, "//") || strings.HasPrefix(s, "/\\") || strings.HasPrefix(s, "\\/") || strings.HasPrefix(s, "\\") {
		return "#"
	}
	if strings.HasPrefix(s, "/") || strings.HasPrefix(s, "#") {
		return s
	}
	low := strings.ToLower(s)
	if strings.HasPrefix(low, "http://") || strings.HasPrefix(low, "https://") {
		return s
	}
	return "#"
}

// fmtWords 字数格式化(万缩写, 对齐 formatWords)。
func fmtWords(v any) string {
	n := num64(v)
	if n < 10000 {
		return itoa64local(n)
	}
	w := n / 10000
	dec := (n % 10000) / 1000
	if dec == 0 {
		return itoa64local(w) + " 万"
	}
	return itoa64local(w) + "." + itoa64local(dec) + " 万"
}

// fmtKB 字数 → KB(书籍大小口径, 对齐 AijjxsBook kb())。
func fmtKB(v any) string {
	n := num64(v)
	kb := (n + 1023) / 1024
	if kb < 1 {
		kb = 1
	}
	return itoa64local(kb) + " KB"
}

func itoa64local(n int64) string {
	if n <= 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

// fmtDateMS epoch-ms → "2006-01-02"(0 → "")。
func fmtDateMS(ms int64) string {
	if ms <= 0 {
		return ""
	}
	return time.UnixMilli(ms).Format("2006-01-02")
}

// statusLabel 连载状态文案。
func statusLabel(s string) string {
	switch s {
	case "completed":
		return "已完结"
	case "ongoing":
		return "连载中"
	default:
		return "未知"
	}
}
