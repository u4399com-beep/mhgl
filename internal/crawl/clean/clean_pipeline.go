// ============================================================
// 清洗主管线 —— cleaner.ts cleanContentHtml/cleanTextField/cleanIntro/
// cleanChapterTitle 的 Go 移植件(R55-3a2 补全; 字符面/广告面/违禁词面已在本包
// clean.go 落盘, 本文件只承载「管线编排」)。
//
// 已知移植偏差(worklog R55-3a2 留档):
//   - 繁体→简体(OpenCC t2s)不移植(词典等价物缺位; 简体源站零影响, 与 clean.go
//     头注同一决策);
//   - RE2 无反向引用/先行断言: 空壳清理与段间空白坍缩按 per-tag 展开 / 捕获组
//     改写, 判定面等价(见各 RE 注);
//   - goquery 承担 cheerio DOM 职责, 节点移动(白名单剥壳/data-id 重排)走
//     x/net/html 原生 RemoveChild+InsertBefore(先摘再挂, 附着节点不可直接插)。
//
// ============================================================
package clean

import (
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// ---------------- 站点尾巴剥离(R25-2-1/2-2 逐条移植) ----------------

const fieldSiteDomain = `(?:www\.)?[a-z0-9-]{2,}\.(?:com|net|cc|org|info|top|xyz|vip|site|la|mobi|tv)`
const fieldSiteBrands = `笔趣阁|笔趣网|笔趣吧|小说网|文学网|中文网|阅读网`
const fieldSiteMarketing = `首发|无弹窗|全文阅读|在线阅读|最新章节|手打|txt下载|敬请期待|免费阅读|全本阅读`

// 任意分隔符(含空格) × 域名+品牌词; 显式标点分隔 × 域名+品牌词+营销词
var fieldTailAnySepRe = regexp.MustCompile(`(?:[\s_\-–—·・|｜:：,，~]+|\s*[(（【\[]\s*)(` + fieldSiteDomain + `|` + fieldSiteBrands + `)\s*[)）\]】]?\s*$`)
var fieldTailPunctSepRe = regexp.MustCompile(`(?:[_\-–—·・|｜:：,，~]+|\s*[(（【\[]\s*)(` + fieldSiteDomain + `|` + fieldSiteBrands + `|` + fieldSiteMarketing + `)\s*[)）\]】]?\s*$`)
var fieldTailTrailingSepRe = regexp.MustCompile(`[\s_\-–—·・|｜:：,，~]+$`)

// stripFieldSiteSuffix 剥离短字段尾部的站点后缀/营销词尾巴, 多级尾巴循环剥(6 层有界);
// 剥后为空则保留原文(与 cleanChapterTitle "剥后为空则保留原标题"同口径)。
func stripFieldSiteSuffix(text string) string {
	if text == "" {
		return text
	}
	v := text
	for i := 0; i < 6; i++ {
		next := fieldTailPunctSepRe.ReplaceAllString(v, "")
		next = fieldTailAnySepRe.ReplaceAllString(next, "")
		if next == v {
			break
		}
		next = fieldTailTrailingSepRe.ReplaceAllString(next, "")
		if strings.TrimSpace(next) == "" {
			return text
		}
		v = next
	}
	return v
}

// CleanTextField 清洗纯文本字段(对齐 cleaner.ts cleanTextField):
// 标签剥离(引号感知)→ 实体单遍解码 → 控制字符 → 不可见字符 → \s+→' ' 归一 →
// 站点尾巴剥离 → 码点截断(maxLength≤0 不截)。
func CleanTextField(raw string, maxLength int) string {
	if raw == "" {
		return ""
	}
	v := stripHtmlTags(raw)
	v = decodeEntitiesOnce(v)
	v = ctrlCharsRe.ReplaceAllString(v, "")
	v = invisibleCharsRe.ReplaceAllString(v, "")
	v = jsSpaceRe.ReplaceAllString(v, " ")
	v = strings.TrimSpace(v)
	v = stripFieldSiteSuffix(v)
	if maxLength > 0 {
		v = truncateRunes(v, maxLength)
	}
	return v
}

// introJunkLineRe [R25-2-3] 简介纯垃圾行判定: 整行仅由 域名/站点品牌词/营销词
// (+括号包裹/尾标点) 构成时判为广告尾巴行; 行内含非白名单文本不命中(保守不误删)。
var introJunkLineRe = regexp.MustCompile(`(?i)^\s*[(（【\[]?\s*(?:(?:` + fieldSiteDomain + `)|(?:` + fieldSiteBrands + `)|(?:` + fieldSiteMarketing + `))(?:[\s_\-–—·・|｜:：,，~]+(?:(?:` + fieldSiteDomain + `)|(?:` + fieldSiteBrands + `)|(?:` + fieldSiteMarketing + `)))*[)）\]】]?\s*[。．.!！]?$`)

// CleanIntro 清洗多行简介(对齐 cleaner.ts cleanIntro): 块级标签边界→\n + br→\n +
// 剥签 + 解码 + 控制字符/不可见字符 + 广告正则 + 按行归一/垃圾行丢弃 + 码点截断。
// maxLength≤0 时用缺省 2000。
func CleanIntro(raw string, maxLength int) string {
	if raw == "" {
		return ""
	}
	if maxLength <= 0 {
		maxLength = 2000
	}
	v := crlfRe.ReplaceAllString(raw, "\n")
	v = brRe.ReplaceAllString(v, "\n")
	v = contentBlockTagLinebreakRe.ReplaceAllString(v, "\n")
	v = stripHtmlTags(v)
	v = decodeEntitiesOnce(v)
	v = ctrlCharsRe.ReplaceAllString(v, "")
	v = invisibleCharsRe.ReplaceAllString(v, "")
	v = removeAdLines(v, defaultConfig().AdPatterns)
	var lines []string
	for _, l := range strings.Split(v, "\n") {
		l = strings.TrimSpace(unicodeSpaceRe.ReplaceAllString(l, " "))
		if l == "" || introJunkLineRe.MatchString(l) {
			continue
		}
		lines = append(lines, l)
	}
	v = strings.Join(lines, "\n")
	return truncateRunes(v, maxLength)
}

// chapterTitleJunkRe 章节标题垃圾尾巴(qq-e/qe2: 懒惰量词取最左垃圾词, 切割点=垃圾词起点;
// "龙争-虎斗 www.y.com"→"龙争-虎斗", "转折_www.x.com首发"→"转折")
var chapterTitleJunkRe = regexp.MustCompile(`(?i)[_\-–—|]\s*[^_\-–—|]*?((?:www\.|[a-z0-9-]+\.(?:com|net|cc|org|info|top|xyz|vip)|中文网|文学网|小说网|首发|无弹窗|全文阅读|在线阅读|最新章节|手打|txt下载|敬请期待))`)

// CleanChapterTitle 清洗章节标题(对齐 cleaner.ts cleanChapterTitle):
// cleanTextField 基础面 + 书名前缀剥离 + 站点尾巴切割(剥后为空保留原标题) + 码点截断 120。
func CleanChapterTitle(raw, bookName string) string {
	if raw == "" {
		return ""
	}
	t := CleanTextField(raw, 0)
	if bookName != "" && t != "" {
		re, err := regexp.Compile(`^` + regexp.QuoteMeta(bookName) + `\s*`)
		if err == nil {
			// TS replace(…, 'g') 全局剥; Go 等价: 循环剥至不再命中(有界防意外)
			for i := 0; i < 5; i++ {
				next := re.ReplaceAllString(t, "")
				if next == t {
					break
				}
				t = next
			}
		}
	}
	if m := chapterTitleJunkRe.FindStringSubmatch(t); m != nil {
		if idx := strings.Index(t, m[0]); idx >= 0 && m[1] != "" {
			cutAt := idx + len(m[0]) - len(m[1])
			cut := strings.TrimRight(t[:cutAt], " _-–—|")
			cut = strings.TrimSpace(cut)
			if cut != "" {
				t = cut
			}
		}
	}
	return truncateRunes(t, 120)
}

// ---------------- 正文 HTML 清洗(cleanContentHtml 移植) ----------------

// navLinkTextRe 分页/导航链接判定(1.5 段)
var navLinkTextRe = regexp.MustCompile(`^(下一页|上一页|下页|上页|目录|首?页|尾?页|返回目录|继续阅读|点击阅读|分页阅读?|加入书签|推荐本书?|报错).{0,4}$`)

// paraStructureRe [R13-1] 块级段落结构判定(置于 normalize 包裹之前)
var paraStructureRe = regexp.MustCompile(`(?i)<(?:p|br|div|h[1-6]|li)\b`)

// hasPRe Bug 15 语义: 是否已有 <p> 结构
var hasPRe = regexp.MustCompile(`(?i)<\s*p[\s>]|<\s*/\s*p`)

// brBrPairRe <br><br> → </p><p>(带属性形态, R22-b-3)
var brBrPairRe = regexp.MustCompile(`(?i)<\s*br\b[^>]*>\s*<\s*br\b[^>]*>`)

// 空壳清理(R22-b-5): RE2 无反向引用, 按 per-tag 展开(与 clean.go dangerousPairRes 同手法);
// 空白实体族 body = 空白 / &nbsp; / 任意 br(空壳内容族, 与 TS 逐字对齐)
var emptyBlockShellTags = []string{"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "blockquote", "center"}
var emptyInlineShellTags = []string{"b", "strong", "em", "i", "u", "span", "font", "small", "big", "sub", "sup", "s", "del", "ins", "mark", "a"}

const emptyShellBody = `(?:\s|&nbsp;|<br\b[^>]*>)*`

func compileEmptyShellRes(tags []string) []*regexp.Regexp {
	out := make([]*regexp.Regexp, 0, len(tags))
	for _, t := range tags {
		out = append(out, regexp.MustCompile(`(?i)<`+t+`\b[^>]*>`+emptyShellBody+`</`+t+`>`))
	}
	return out
}

var (
	emptyBlockShellRes  = compileEmptyShellRes(emptyBlockShellTags)
	emptyInlineShellRes = compileEmptyShellRes(emptyInlineShellTags)
	emptyPOpenRe        = regexp.MustCompile(`(?i)<p>(?:\s|&nbsp;|<br\b[^>]*>)+`)
	emptyPCloseRe       = regexp.MustCompile(`(?i)(?:\s|&nbsp;|<br\b[^>]*>)+</p>`)
	// brSpacerBetweenPRe RE2 无先行断言 → 捕获组改写: </p>垫片<p…> → </p><p…>(原 <p 形态保留)
	brSpacerBetweenPRe = regexp.MustCompile(`(?i)</p>\s*(?:<br\b[^>]*>\s*)+(<p[\s>])`)
	leadShellRe        = regexp.MustCompile(`(?i)^(?:\s|&nbsp;|<br\b[^>]*>)+`)
	trailShellRe       = regexp.MustCompile(`(?i)(?:\s|&nbsp;|<br\b[^>]*>)+$`)
	// blockGapCollapseRe [R22-b-9] 段间原始空白坍缩: </tag>\s+< → </tag><(原标签保留)
	blockGapCollapseRe = regexp.MustCompile(`(?i)</(p|h[1-6]|li|blockquote)>(\s+)(<)`)
)

// CleanContentHTML 章节正文清洗(cleaner.ts cleanContentHtml 全管线移植):
// 纯文本模式 → htmlToPlainLines + 广告正则 + 按行重建;
// HTML 模式 → 危险标签硬移除 → 选择器移除 → 导航链接移除 → data-id 乱序段落重排(1.8)
// → 白名单剥壳(块级补 \n) → 属性消毒 → 广告正则 → 规范化(空壳清理循环) → 段落重建
// → 控制字符剥离 + 违禁词出口过滤。
func CleanContentHTML(raw string, cfg Config) string {
	if raw == "" {
		return ""
	}
	// [R21-c-2] 不可见 Unicode 剥离置于两模式共用入口(简化: t2s 不移植, 见头注)
	htmlIn := invisibleCharsRe.ReplaceAllString(raw, "")

	if cfg.PlainText {
		text := htmlToPlainLines(htmlIn)
		text = removeAdLines(text, withFloorPatterns(cfg.AdPatterns))
		var lines []string
		for _, l := range strings.Split(text, "\n") {
			l = strings.TrimSpace(unicodeSpaceRe.ReplaceAllString(l, " "))
			if l != "" {
				lines = append(lines, l)
			}
		}
		out := strings.Join(lines, "\n\n")
		return applyBannedWordsIfLoaded(ctrlCharsRe.ReplaceAllString(out, ""))
	}

	return cleanContentHTMLMode(htmlIn, cfg)
}

// cleanContentHTMLMode HTML 模式清洗(goquery 承担 cheerio 职责)
func cleanContentHTMLMode(htmlIn string, cfg Config) string {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(`<div id="__clean_root">` + htmlIn + `</div>`))
	if err != nil {
		return htmlIn
	}
	root := doc.Find(`#__clean_root`)

	// 0. 硬移除脚本/样式类标签(自定义配置遗漏时防内部代码以"纯文本"漏进正文)
	root.Find("script, style, noscript, iframe, object, embed").Remove()
	// 1. 移除指定选择器(无效选择器: goquery 静默空选, 与 cheerio try/catch 语义等价)
	for _, sel := range cfg.RemoveSelectors {
		sel = strings.TrimSpace(sel)
		if sel == "" {
			continue
		}
		root.Find(sel).Remove()
	}
	// 1.5 移除分页/导航链接
	root.Find("a").Each(func(_ int, s *goquery.Selection) {
		t := strings.TrimSpace(s.Text())
		if t != "" && navLinkTextRe.MatchString(t) {
			s.Remove()
		}
	})
	// 1.8 乱序段落重排(data-id 反采集; 同父容器 ≥3 个 data-id 子元素且数值非单调 → 升序重组)
	reorderByDataID(root)

	// 2. 白名单外的标签剥壳保文本(快照遍历: 先收集后处理, 与 cheerio each 快照语义一致)
	whitelist := make(map[string]struct{}, len(cfg.Whitelist))
	for _, t := range cfg.Whitelist {
		whitelist[strings.ToLower(t)] = struct{}{}
	}
	var shells []*html.Node
	var shellBlock map[*html.Node]bool
	root.Find("*").Each(func(_ int, s *goquery.Selection) {
		tag := goquery.NodeName(s)
		if tag == "" || strings.HasPrefix(tag, "#") {
			return
		}
		if _, ok := whitelist[tag]; ok {
			return
		}
		if shells == nil {
			shellBlock = map[*html.Node]bool{}
		}
		shells = append(shells, s.Nodes[0])
		shellBlock[s.Nodes[0]] = isBlockTag(tag)
	})
	for _, node := range shells {
		if node.Parent == nil {
			continue // 已随祖先脱离文档(防御)
		}
		parent := node.Parent
		if shellBlock[node] {
			insertTextBefore(parent, node, "\n")
			insertTextBefore(parent, node.NextSibling, "\n")
		}
		// 剥壳: 子节点原位上移后移除空壳(x/net/html 附着节点不可直接插入, 先摘再挂)
		for c := node.FirstChild; c != nil; {
			next := c.NextSibling
			node.RemoveChild(c)
			parent.InsertBefore(c, node)
			c = next
		}
		parent.RemoveChild(node)
	}

	// 2.5 白名单标签属性消毒(on*/style 注入面; a/img 按协议白名单保留指定属性)
	root.Find("*").Each(func(_ int, s *goquery.Selection) {
		tag := goquery.NodeName(s)
		var drops []string
		for _, a := range s.Nodes[0].Attr {
			val := a.Val
			keep := (tag == "a" && a.Key == "href" && isHTTPURL(val)) ||
				(tag == "img" && a.Key == "src" && isHTTPURL(val)) ||
				(tag == "img" && a.Key == "alt")
			if !keep {
				drops = append(drops, a.Key)
			}
		}
		for _, k := range drops {
			s.RemoveAttr(k)
		}
	})

	out, _ := root.Html()
	// 3. 广告正则清洗(底线模式无条件叠加: 规则自定义 adPatterns 为按站清单,
	// 通用高置信残留请记住本书首发域名/整行 URL 等不可缺席 —— R59-2c DB 抽样实证)
	out = removeAdLines(out, withFloorPatterns(cfg.AdPatterns))
	// [R13-1] 块级段落结构判定(用包裹前状态)
	hadParaStructure := paraStructureRe.MatchString(out)
	// 4. 规范化
	if cfg.Normalize {
		if hadParaStructure && !hasPRe.MatchString(out) {
			// Bug 15 语义: 纯 <br> 分段才走包裹+替换(已含 <p> 结构时包裹产生嵌套)
			out = "<p>" + out + "</p>"
			out = brBrPairRe.ReplaceAllString(out, "</p><p>")
		}
		// 空壳清理循环至不再变化(嵌套壳逐层剥)
		for {
			next := out
			for _, re := range emptyBlockShellRes {
				next = re.ReplaceAllString(next, "")
			}
			for _, re := range emptyInlineShellRes {
				next = re.ReplaceAllString(next, "")
			}
			next = emptyPOpenRe.ReplaceAllString(next, "<p>")
			next = emptyPCloseRe.ReplaceAllString(next, "</p>")
			// [R59-2c-1] 修前替换串漏 $1 —— 匹配尾部的下一个 <p…> 开标签被一并吞掉,
			// "</p><br><p>段落二</p>" 变 "</p>段落二</p>"(段落二并入前段, 段落结构破坏,
			// 探针实证); 捕获组改写语义按本 RE 注释本意回补 $1(原 <p 形态保留)
			next = brSpacerBetweenPRe.ReplaceAllString(next, "</p>$1")
			next = leadShellRe.ReplaceAllString(next, "")
			next = trailShellRe.ReplaceAllString(next, "")
			if next == out {
				break
			}
			out = next
		}
		// [R22-b-9] 段间原始空白坍缩(块级间空白渲染为零, 存库冗余清掉)
		out = blockGapCollapseRe.ReplaceAllString(out, "</$1>$3")
	}
	// 5. 无任何块级段落标签 → 按换行重建段落(与 normalize 包裹互斥)
	if !hadParaStructure {
		var ps []string
		for _, l := range strings.Split(out, "\n") {
			l = strings.TrimSpace(l)
			if l != "" {
				ps = append(ps, "<p>"+l+"</p>")
			}
		}
		out = strings.Join(ps, "")
	}
	// 出口: 控制字符剥离 + 违禁词过滤(文本段)
	return applyBannedWordsIfLoaded(strings.TrimSpace(ctrlCharsRe.ReplaceAllString(out, "")))
}

// isHTTPURL a/img 属性协议白名单(与 parser.absolutize 的协议过滤同口径)
func isHTTPURL(v string) bool {
	return len(v) > 8 && (strings.HasPrefix(strings.ToLower(v), "http://") || strings.HasPrefix(strings.ToLower(v), "https://"))
}

// insertTextBefore 在 ref 前插入纯文本节点(ref 为 nil 时追加到末尾)
func insertTextBefore(parent, ref *html.Node, s string) {
	tn := &html.Node{Type: html.TextNode, Data: s}
	parent.InsertBefore(tn, ref)
}

// dataIdItem 1.8 乱序段落条目
type dataIdItem struct {
	n    int
	node *html.Node
}

// reorderByDataID [1.8] data-id 乱序段落重排:
// 同一父容器下 ≥3 个 data-id 子元素且数值序列非单调 → 按 data-id 升序重组父容器内容;
// 各 data-id 节点后紧邻的非 data-id 兄弟(直到下一个 data-id 为止)作为同组尾随节点一起移动;
// 首个 data-id 之前的节点原地保留。重组后复刻包 <p> 语义(内部以 <p>/<br> 开头 → 原位
// 展开; 否则子节点移入新建 <p>)。
func reorderByDataID(root *goquery.Selection) {
	dEls := root.Find("[data-id]")
	if dEls.Length() < 3 {
		return
	}
	parent := dEls.Get(0).Parent
	if parent == nil {
		return
	}
	items := make([]dataIdItem, 0, dEls.Length())
	for i := 0; i < dEls.Length(); i++ {
		node := dEls.Get(i)
		if node.Parent != parent { // $(el).parent().is(parent) 判定
			return
		}
		n, err := strconv.Atoi(strings.TrimSpace(dEls.Eq(i).AttrOr("data-id", "")))
		if err != nil {
			return // Number.isFinite 失败 → 放弃重排
		}
		items = append(items, dataIdItem{n: n, node: node})
	}
	monotonic := true
	for i := 1; i < len(items); i++ {
		if items[i].n < items[i-1].n {
			monotonic = false
			break
		}
	}
	if monotonic {
		return
	}
	// 稳定排序(同值保持文档序, 与 TS items.sort 同语义)
	sort.SliceStable(items, func(a, b int) bool { return items[a].n < items[b].n })

	// 尾随分组(快照遍历后再移动)
	dataIDSet := make(map[*html.Node]struct{}, len(items))
	for _, it := range items {
		dataIDSet[it.node] = struct{}{}
	}
	type tailGroup struct {
		head *html.Node
		tail []*html.Node
	}
	var groups []*tailGroup
	var cur *tailGroup
	for c := parent.FirstChild; c != nil; c = c.NextSibling {
		if _, ok := dataIDSet[c]; ok {
			cur = &tailGroup{head: c}
			groups = append(groups, cur)
		} else if cur != nil {
			cur.tail = append(cur.tail, c)
		}
	}
	moveToEnd := func(n *html.Node) {
		if n.Parent != nil {
			n.Parent.RemoveChild(n)
		}
		parent.AppendChild(n)
	}
	for _, it := range items {
		for _, g := range groups {
			if g.head != it.node {
				continue
			}
			moveToEnd(g.head)
			for _, t := range g.tail {
				moveToEnd(t)
			}
		}
	}
	// 包 <p> 语义: 内部 html 以 <p>/<br> 开头 → 原位展开; 否则子节点整体移入新建 <p>
	for _, it := range items {
		node := it.node
		if node.Parent == nil {
			continue
		}
		h := strings.TrimSpace(innerHTMLOf(node))
		if startsWithPTag(h) {
			unwrapNode(node)
		} else {
			p := &html.Node{Type: html.ElementNode, Data: "p", DataAtom: atom.P}
			node.Parent.InsertBefore(p, node)
			for c := node.FirstChild; c != nil; {
				next := c.NextSibling
				node.RemoveChild(c)
				p.AppendChild(c)
				c = next
			}
			node.Parent.RemoveChild(node)
		}
	}
}

func innerHTMLOf(n *html.Node) string {
	var b strings.Builder
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if err := html.Render(&b, c); err != nil {
			return ""
		}
	}
	return b.String()
}

func startsWithPTag(h string) bool {
	return strings.HasPrefix(h, "<p") || strings.HasPrefix(h, "<br") || strings.HasPrefix(h, "<P") || strings.HasPrefix(h, "<BR")
}

// unwrapNode 剥壳保子节点(原位上移后移除)
func unwrapNode(node *html.Node) {
	parent := node.Parent
	if parent == nil {
		return
	}
	for c := node.FirstChild; c != nil; {
		next := c.NextSibling
		node.RemoveChild(c)
		parent.InsertBefore(c, node)
		c = next
	}
	parent.RemoveChild(node)
}
