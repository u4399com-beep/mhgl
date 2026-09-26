// ============================================================
// 页面级解析 — parseList / parseBook / parseToc / parseContent
// 移植权威: /home/z/my-project/src/lib/crawl/parser.ts(逐语义对齐)
// 编排消费: internal/task(单书流水线: 书籍页→目录→正文)
// ============================================================
package rule

import (
	"context"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/PuerkitoBio/goquery"
	xhtml "golang.org/x/net/html"

	"mhgl/internal/crawl/util"
)

// ListResult 列表解析结果(items[].fields 为字段名→值)
type ListResult struct {
	Items []map[string]string
}

// hasJsonConstFields 是否存在 json/const 型字段
func hasJsonConstFields(fields map[string]*FieldRule) bool {
	for _, r := range fields {
		if r != nil && (r.Type == "json" || r.Type == "const") {
			return true
		}
	}
	return false
}

// ParseList 列表/字段解析(urlFields=需要绝对化的链接字段名, 如 url/bookUrl/cover):
//  1. JSON 模式: itemSelector.type=json(数组路径并集) 或无容器+json/const 字段(书籍页 JSON)
//  2. 无容器: 整页单值提取(书籍页)
//  3. 容器型: css 容器遍历 / regex 容器分段(xpath 不支持, 引擎返回空)
func ParseList(htmlStr, baseURL string, pageRule *PageRule, urlFields []string) ListResult {
	var out ListResult
	if pageRule == nil {
		return out
	}
	doc, _ := goquery.NewDocumentFromReader(strings.NewReader(htmlStr))
	itemSelector := pageRule.ItemSelector
	fields := pageRule.Fields

	// ---- JSON 模式: 规则为 json/const 型时不回退 HTML 提取(JSON 解析失败直接空结果) ----
	if (itemSelector != nil && itemSelector.Type == "json") || (itemSelector == nil && hasJsonConstFields(fields)) {
		root := parseJsonBody(htmlStr)
		if root == nil {
			return out
		}
		varsBase := urlVars(baseURL)
		var scopes []interface{}
		baseIndex := 1
		if itemSelector != nil {
			arr := jsonArrayAt(root, itemSelector.Expression)
			scopes = arr
		} else {
			scopes = []interface{}{root}
		}
		for i, scope := range scopes {
			idx := baseIndex + i
			rec := map[string]string{}
			// 两阶段提取: 先非 const(json 路径从当前数组项取值), 再 const(模板引用已提取字段如 {id})
			phase1Vars := mergeVars(varsBase, map[string]string{"index": fmt.Sprintf("%d", idx)})
			for key, r := range fields {
				if r == nil || r.Type == "const" {
					continue
				}
				rec[key] = extractField("", nil, nil, r, &extractCtx{JSON: scope, Vars: phase1Vars})
			}
			phase2Vars := mergeVars(varsBase, map[string]string{"index": fmt.Sprintf("%d", idx)})
			phase2Vars = mergeVars(phase2Vars, rec)
			for key, r := range fields {
				if r == nil || r.Type != "const" {
					continue
				}
				rec[key] = extractField("", nil, nil, r, &extractCtx{Vars: phase2Vars})
			}
			absolutizeFields(rec, urlFields, baseURL)
			// 列表项链接收紧(qq-e): 含 url/bookUrl 链接字段而全部为空的项不入列
			if !listItemTightenOK(rec, urlFields) {
				continue
			}
			if anyValue(rec) {
				out.Items = append(out.Items, rec)
			}
		}
		return out
	}

	if itemSelector == nil {
		// 无容器: 直接对整页提取字段(单值型, 如书籍页)
		if doc == nil {
			return out
		}
		rec := map[string]string{}
		for key, r := range fields {
			if r != nil {
				rec[key] = extractField(htmlStr, doc, nil, r, nil)
			}
		}
		if len(rec) > 0 {
			out.Items = append(out.Items, rec)
		}
		return out
	}

	// 容器型: css 容器 → 遍历; regex 容器 → 分段; xpath 不支持 → 空结果
	var scopeHTMLs []string
	switch itemSelector.Type {
	case "css":
		if doc != nil {
			for _, node := range cssExtractAll(doc, itemSelector.Expression) {
				scopeHTMLs = append(scopeHTMLs, outerHtmlOf(node))
			}
		}
	case "regex":
		scopeHTMLs = regexExtractAll(htmlStr, itemSelector)
	default:
		return out // xpath/其他: 不支持, 空结果(capability 已拦截)
	}

	for _, scopeHTML := range scopeHTMLs {
		scopeDoc, _ := goquery.NewDocumentFromReader(strings.NewReader(scopeHTML))
		rec := map[string]string{}
		if scopeDoc != nil {
			for key, r := range fields {
				if r != nil {
					rec[key] = extractField(scopeHTML, scopeDoc, nil, r, nil)
				}
			}
		}
		absolutizeFields(rec, urlFields, baseURL)
		if !listItemTightenOK(rec, urlFields) {
			continue
		}
		if anyValue(rec) {
			out.Items = append(out.Items, rec)
		}
	}
	return out
}

// listItemTightenOK 链接字段收紧判定: urlFields 含 url/bookUrl 时至少一个非空才放行;
// parseBook 借道本函数(urlFields=[cover])不受此限(TS 同口径)
func listItemTightenOK(rec map[string]string, urlFields []string) bool {
	hasLinkField := false
	hasValue := false
	for _, uf := range urlFields {
		if uf == "url" || uf == "bookUrl" {
			hasLinkField = true
			if rec[uf] != "" {
				hasValue = true
			}
		}
	}
	if hasLinkField && !hasValue {
		return false
	}
	return true
}

func anyValue(rec map[string]string) bool {
	for _, v := range rec {
		if v != "" {
			return true
		}
	}
	return false
}

func absolutizeFields(rec map[string]string, urlFields []string, baseURL string) {
	for _, uf := range urlFields {
		if rec[uf] != "" {
			rec[uf] = absolutize(rec[uf], baseURL)
		}
	}
}

// mergeVars 合并 vars 表(b 覆盖 a)
func mergeVars(a, b map[string]string) map[string]string {
	out := make(map[string]string, len(a)+len(b))
	for k, v := range a {
		out[k] = v
	}
	for k, v := range b {
		out[k] = v
	}
	return out
}

// ParsedBook 书籍解析结果
type ParsedBook struct {
	Name          string `json:"name,omitempty"`
	Author        string `json:"author,omitempty"`
	Category      string `json:"category,omitempty"`
	Keywords      string `json:"keywords,omitempty"`
	Intro         string `json:"intro,omitempty"`
	Cover         string `json:"coverUrl,omitempty"`
	Status        string `json:"status,omitempty"`
	LatestChapter string `json:"latestChapter,omitempty"`
	// [R62-f] 引擎接线(R61-1B 盲区消除): book.fields.wordCount 提取值经 parseWordCount
	// 归一(纯数字/「353.5万字」双形态); 作 Book.wordCount 初始值, 正文聚合完成后
	// 聚合值覆写(bridge.Contents), 聚合值为 0(目录中断)时保留本值
	WordCount int64 `json:"wordCount,omitempty"`
}

// ParseBook 书籍信息解析: 借道 ParseList(urlFields=['cover']) 提取字段。
// status/keywords/latestChapter 的 cleanTextField 为其唯一清洗点(TS R25-2-5 同口径);
// name/author/category/intro 由 bridge 回调层清洗(bridge.go book 回调经 clean.CleanTextField
// /CleanIntro), 此处不重复; wordCount 经 parseWordCount 归一([R62-f] 接线, 见上)
func ParseBook(htmlStr, baseURL string, pageRule *PageRule) ParsedBook {
	res := ParseList(htmlStr, baseURL, pageRule, []string{"cover"})
	f := map[string]string{}
	if len(res.Items) > 0 {
		f = res.Items[0]
	}
	pb := ParsedBook{}
	if f["name"] != "" {
		pb.Name = f["name"]
	}
	if f["author"] != "" {
		pb.Author = f["author"]
	}
	if f["category"] != "" {
		pb.Category = f["category"]
	}
	if f["keywords"] != "" {
		pb.Keywords = cleanTextFieldMinimal(f["keywords"], 0)
	}
	if f["intro"] != "" {
		pb.Intro = f["intro"]
	}
	if f["cover"] != "" {
		pb.Cover = absolutize(f["cover"], baseURL)
	}
	if s := cleanTextFieldMinimal(f["status"], 0); s != "" {
		pb.Status = s
	}
	if s := cleanTextFieldMinimal(f["latestChapter"], 0); s != "" {
		pb.LatestChapter = s
	}
	if n := parseWordCount(f["wordCount"]); n > 0 {
		pb.WordCount = n
	}
	return pb
}

// TocItem 目录项
type TocItem struct {
	Title  string `json:"title"`
	URL    string `json:"url"`
	Volume string `json:"volume,omitempty"`
}

// tocDedupKey 目录去重键规范化(R30-3-4): host 小写(含端口)+剥 fragment+剥非根路径尾斜杠,
// search 保留(query 差异=不同页); 目录条目保留首次出现的原始 href
func tocDedupKey(href, title string) string {
	raw := href
	if raw == "" {
		return title
	}
	u, err := url.Parse(href)
	if err != nil {
		return raw
	}
	path := u.Path
	if len(path) > 1 {
		path = strings.TrimRight(path, "/")
	}
	return strings.ToLower(u.Host) + path + u.RawQuery
}

// scopePair 目录项作用域: html=容器 HTML(regex 字段用), sel=容器元素(css 容器 href 回退用)
type scopePair struct {
	html string
	sel  *xhtml.Node
}

// ParseToc 目录解析(含翻页+去重):
//   - JSON 目录模式: itemSelector.expression=数组路径, 章节URL用 const 模板合成
//   - HTML 模式: itemSelector(css/regex)遍历 + pagination 翻页合并
//
// fetcher=翻页传输回调(任务编排层注入过闸版); 返回 items 与实际使用页数
func ParseToc(ctx context.Context, firstURL, htmlStr string, pageRule *PageRule, fetcher PageFetch, onProgress func(page, found int)) ([]TocItem, int) {
	var all []TocItem
	// [R57-2a] nil 规则防御: 现有调用方恒传 &cfg.Toc, 但 JSON 分支本就显式判 nil
	// (设计上允许 nil), HTML 分支却会空指针 panic —— 补齐同口径守卫(空规则=空结果)
	if pageRule == nil {
		return all, 1
	}

	// ---- JSON 目录模式: 数组项可为对象(字段按路径取)或纯字符串(title 用 '.' 取根本身) ----
	if pageRule != nil && pageRule.ItemSelector != nil && pageRule.ItemSelector.Type == "json" {
		root := parseJsonBody(htmlStr)
		if root == nil {
			return all, 1
		}
		base := firstURL
		varsBase := urlVars(firstURL)
		seen := map[string]struct{}{}
		items := jsonArrayAt(root, pageRule.ItemSelector.Expression)
		titleRule := pageRule.Fields["title"]
		urlRule := pageRule.Fields["url"]
		volumeRule := pageRule.Fields["volume"]
		for i, it := range items {
			// 两阶段提取: 先非 const 字段(供 const 模板引用), 再 const 字段;
			// index/title 显式后置防同名字段覆盖(TS cc-c 同口径)
			phase1Vars := mergeVars(varsBase, map[string]string{"index": fmt.Sprintf("%d", i+1)})
			rec := map[string]string{}
			for key, r := range pageRule.Fields {
				if r == nil || r.Type == "const" {
					continue
				}
				rec[key] = extractField("", nil, nil, r, &extractCtx{JSON: it, Vars: phase1Vars})
			}
			title := rec["title"]
			if titleRule != nil && titleRule.Type == "const" {
				v := mergeVars(varsBase, rec)
				v["index"] = fmt.Sprintf("%d", i+1)
				title = extractField("", nil, nil, titleRule, &extractCtx{Vars: v})
			}
			href := ""
			if urlRule != nil && urlRule.Type == "const" {
				v := mergeVars(varsBase, rec)
				v["index"] = fmt.Sprintf("%d", i+1)
				v["title"] = title
				href = extractField("", nil, nil, urlRule, &extractCtx{JSON: it, Vars: v})
			} else if urlRule != nil {
				href = rec["url"]
			}
			// const 型 volume 补提(ll-c: 与 title const 同取值表后置提取)
			volume := rec["volume"]
			if volume == "" && volumeRule != nil && volumeRule.Type == "const" {
				v := mergeVars(varsBase, rec)
				v["index"] = fmt.Sprintf("%d", i+1)
				v["title"] = title
				volume = extractField("", nil, nil, volumeRule, &extractCtx{Vars: v})
			}
			if title == "" && href == "" {
				continue
			}
			href = absolutize(href, base)
			// 目录条目必须持有效章节链接(const 模板占位符未命中会合成空 URL)
			if href == "" {
				continue
			}
			key := tocDedupKey(href, title)
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}
			cleanVol := ""
			if volume != "" {
				cleanVol = cleanTextFieldMinimal(volume, 120)
			}
			if title == "" {
				title = href
			}
			all = append(all, TocItem{Title: title, URL: href, Volume: cleanVol})
		}
		if onProgress != nil {
			onProgress(1, len(all))
		}
		return all, 1
	}

	// ---- HTML 目录模式(含翻页) ----
	maxPages := 1
	paginationEnabled := false
	if pageRule != nil && pageRule.Pagination != nil && pageRule.Pagination.Enabled {
		paginationEnabled = true
		maxPages = pageRule.Pagination.MaxPages
		if maxPages <= 0 {
			maxPages = 20
		}
	}
	currentURL := firstURL
	currentHTML := htmlStr
	seen := map[string]struct{}{}
	if paginationEnabled {
		seen["__page__"+firstURL] = struct{}{} // [R9-c-5] 首页入防环集
	}
	// R3-24: 同 path 不同 query 的"伪翻页"计数, 连 5 次即停
	samePathStreak := 0
	lastPath := ""
	pagesUsed := 0

	for p := 1; p <= maxPages && currentURL != ""; p++ {
		curPath := ""
		if u, err := url.Parse(currentURL); err == nil {
			curPath = strings.ToLower(u.Path)
		}
		if curPath != "" && curPath == lastPath {
			samePathStreak++
			if samePathStreak >= 5 {
				fmt.Printf("[parser] 目录翻页连续 %d 次同 path(%s, 疑似伪翻页防环熔断), 停止合并(已得 %d 章)\n",
					samePathStreak, util.Truncate(curPath, 120), len(all))
				break
			}
		} else {
			samePathStreak = 0
		}
		lastPath = curPath
		doc, _ := goquery.NewDocumentFromReader(strings.NewReader(currentHTML))
		if doc == nil {
			break
		}
		// <base href> 生效时目录相对链接按基址解析; 自引用过滤仍以文档 URL 为基准
		base := docBase(doc, firstOr(currentURL, firstURL))
		titleRule := pageRule.Fields["title"]
		urlRule := pageRule.Fields["url"]
		volumeRule := pageRule.Fields["volume"]

		var scopePairs []scopePair
		if pageRule.ItemSelector != nil {
			switch pageRule.ItemSelector.Type {
			case "css":
				for _, node := range cssExtractAll(doc, pageRule.ItemSelector.Expression) {
					h := outerHtmlOf(node)
					scopePairs = append(scopePairs, scopePair{html: h, sel: node})
				}
			case "regex":
				for _, h := range regexExtractAll(currentHTML, pageRule.ItemSelector) {
					scopePairs = append(scopePairs, scopePair{html: h})
				}
			default:
				scopePairs = nil
			}
		} else {
			scopePairs = []scopePair{{html: currentHTML}}
		}

		for _, sp := range scopePairs {
			scopeHTML := sp.html
			scopeDoc, _ := goquery.NewDocumentFromReader(strings.NewReader(scopeHTML))
			title, href, vol := "", "", ""
			if scopeDoc != nil {
				if titleRule != nil {
					title = extractField(scopeHTML, scopeDoc, nil, titleRule, nil)
				}
				if urlRule != nil {
					href = extractField(scopeHTML, scopeDoc, nil, urlRule, nil)
				}
				if volumeRule != nil {
					vol = extractField(scopeHTML, scopeDoc, nil, volumeRule, nil)
				}
			}
			if title == "" && href == "" {
				continue
			}
			if href == "" && sp.sel != nil {
				// css 容器本身为 <a> 时回退取容器 href(TS nodeAttr(scope.node,'href') 同语义:
				// 仅容器自身属性, 不下钻子元素)
				href = nodeAttr(sp.sel, "href")
			}
			href = absolutize(resolveWithBase(href, base), firstOr(currentURL, firstURL))
			if href == "" {
				continue // 目录条目必须持有效章节链接(纯锚点被 absolutize 过滤)
			}
			key := tocDedupKey(href, title)
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}
			cleanVol := ""
			if vol != "" {
				cleanVol = cleanTextFieldMinimal(vol, 120)
			}
			if title == "" {
				title = href
			}
			all = append(all, TocItem{Title: title, URL: href, Volume: cleanVol})
		}
		if onProgress != nil {
			onProgress(p, len(all))
		}
		// [R69-b] pagesUsed 在「本页实际完成解析」后落位: 修前在循环顶赋值,
		// 同 path 防环熔断/文档解析失败等「本页未解析即 break」的路径会把未解析页
		// 计入实际使用页数(返回值语义=实际使用页数, 引擎侧仅日志消费但口径应真)
		pagesUsed = p

		// 翻页
		if p < maxPages && paginationEnabled {
			next := pickNextHref(doc, pageRule.Pagination.NextLink, currentHTML, base, currentURL,
				[]string{"下一页", "下页", "下一章"}, func(u string) bool {
					_, ok := seen["__page__"+u]
					return ok
				})
			if next == "" {
				break
			}
			seen["__page__"+next] = struct{}{}
			refererForNext := currentURL // 翻页链逐页回溯(ll-c Referer 链语义)
			currentURL = next
			nextHTML, err := fetchPaginationPage(ctx, fetcher, currentURL, refererForNext)
			if err != nil {
				fmt.Printf("[parser] 目录翻页请求失败(第%d页 %s), 停止合并(已得 %d 章): %v\n",
					p+1, util.Truncate(currentURL, 160), len(all), err)
				break
			}
			currentHTML = nextHTML
		} else {
			if paginationEnabled && doc != nil {
				// maxPages 截断告警(R35-2c-1 同口径): 末页仍有下一页候选时后续章节被截断
				truncated := pickNextHref(doc, pageRule.Pagination.NextLink, currentHTML, base, currentURL,
					[]string{"下一页", "下页", "下一章"}, func(u string) bool {
						_, ok := seen["__page__"+u]
						return ok
					})
				if truncated != "" {
					fmt.Printf("[parser] 目录翻页达 maxPages=%d 上限仍有下一页(%s), 已截断: 前 %d 章入库\n",
						maxPages, util.Truncate(truncated, 160), len(all))
				}
			}
			break
		}
	}
	if pagesUsed == 0 {
		pagesUsed = 1
	}
	return all, pagesUsed
}

// ParsedContent 章节内容解析结果
type ParsedContent struct {
	Content string
	Pages   int
}

// ParseContent 章节内容解析(含翻页合并 joinWith):
// css 规则第 1 页低质时启用"最长文本容器"备用提取器(R9-c-6 同口径)。
// 原始 HTML 原样回调; 清洗由 bridge Contents 回调经 clean.CleanContentHTML 执行
// (clean 配置经 clean.FromRuleRaw 从规则 JSON 构建; R55 单体化后 clean 在 Go 侧闭环)
func ParseContent(ctx context.Context, firstURL, htmlStr string, pageRule *PageRule, fetcher PageFetch) ParsedContent {
	res := ParsedContent{Pages: 1}
	if pageRule == nil {
		return res
	}
	contentRule := pageRule.Fields["content"]
	if contentRule == nil {
		return res
	}
	joinWith := "<br/>"
	if pageRule.Pagination != nil && pageRule.Pagination.JoinWith != "" {
		joinWith = pageRule.Pagination.JoinWith
	}
	maxPages := 1
	paginationEnabled := false
	if pageRule.Pagination != nil && pageRule.Pagination.Enabled {
		paginationEnabled = true
		maxPages = pageRule.Pagination.MaxPages
		if maxPages <= 0 {
			maxPages = 10
		}
	}
	var parts []string
	currentURL := firstURL
	currentHTML := htmlStr
	visited := map[string]struct{}{}
	useLargest := false // 低质备用选择器状态: 仅第 1 页定夺一次(防跨页风格混拼)

	for p := 1; p <= maxPages && currentURL != ""; p++ {
		if _, ok := visited[currentURL]; ok {
			break
		}
		visited[currentURL] = struct{}{}
		doc, _ := goquery.NewDocumentFromReader(strings.NewReader(currentHTML))
		if doc == nil {
			break
		}
		base := docBase(doc, firstOr(currentURL, firstURL))
		part := extractField(currentHTML, doc, nil, contentRule, nil)
		if contentRule.Type == "css" {
			if p == 1 {
				// 低质触发备用选择器重试: 空/文本量过小/短行占比过高, 而"最长文本容器"
				// 显著更好(得分×1.5)时改用; 防误切双保险(alt 与主结果互不包含)
				q1 := scoreContentHTML(part)
				if q1.textLen == 0 {
					useLargest = true
					part = findLargestText(doc)
				} else if (q1.textLen < 400 || q1.shortLineRatio > 0.5) && q1.textLen < 5000 {
					alt := findLargestText(doc)
					if alt != "" && alt != part && !strings.Contains(alt, part) && !strings.Contains(part, alt) {
						q2 := scoreContentHTML(alt)
						if float64(q2.score) > float64(q1.score)*1.5 {
							part = alt
							useLargest = true
						}
					}
				}
			} else if useLargest {
				// 备用提取器路径取不到时回退主规则结果
				if alt := findLargestText(doc); alt != "" {
					part = alt
				}
			}
		}
		if part != "" {
			parts = append(parts, part)
		}

		if p < maxPages && paginationEnabled {
			next := pickNextHref(doc, pageRule.Pagination.NextLink, currentHTML, base, currentURL,
				[]string{"下一页", "下页"}, func(u string) bool {
					_, ok := visited[u]
					return ok
				})
			if next == "" {
				break
			}
			refererForNext := currentURL
			currentURL = next
			nextHTML, err := fetchPaginationPage(ctx, fetcher, currentURL, refererForNext)
			if err != nil {
				fmt.Printf("[parser] 正文翻页请求失败(第%d页 %s), 停止合并(已并 %d 页): %v\n",
					p+1, util.Truncate(currentURL, 160), len(parts), err)
				break
			}
			currentHTML = nextHTML
		} else {
			if paginationEnabled && doc != nil {
				truncated := pickNextHref(doc, pageRule.Pagination.NextLink, currentHTML, base, currentURL,
					[]string{"下一页", "下页"}, func(u string) bool {
						_, ok := visited[u]
						return ok
					})
				if truncated != "" {
					fmt.Printf("[parser] 正文分页达 maxPages=%d 上限仍有下一页(%s), 已截断合并\n",
						maxPages, util.Truncate(truncated, 160))
				}
			}
			break
		}
	}
	res.Content = strings.Join(filterEmpty(parts), joinWith)
	res.Pages = len(visited)
	if res.Pages < 1 {
		res.Pages = 1
	}
	return res
}

func filterEmpty(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

func firstOr(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

// ---------------- [R9-c-6] 正文质量评分(备用提取器决策用) ----------------

type contentScore struct {
	textLen        int
	shortLineRatio float64
	adHitRatio     float64
	score          float64
}

var adMarkerRe = regexp.MustCompile(`(?i)(请记住本站|最新章节|无弹窗|首发|本站地址|章节错误|点此举报|广告|推广|手机阅读|APP下载|加入书签|点击下一页|继续阅读|www\.|https?://)`)

// scoreContentHTML 正文质量画像: 去标签后按行统计
func scoreContentHTML(htmlStr string) contentScore {
	text := tagStripRe.ReplaceAllString(htmlStr, "\n")
	lines := []string{}
	for _, l := range splitLines(text) {
		l = strings.TrimSpace(l)
		if l != "" {
			lines = append(lines, l)
		}
	}
	textLen := 0
	for _, l := range lines {
		textLen += len([]rune(l))
	}
	if textLen == 0 {
		return contentScore{textLen: 0, shortLineRatio: 1}
	}
	shortLines := 0
	adChars := 0
	for _, l := range lines {
		if len([]rune(l)) <= 8 {
			shortLines++
		}
		hits := adMarkerRe.FindAllString(l, -1)
		for _, h := range hits {
			adChars += len([]rune(h))
		}
	}
	r := contentScore{
		textLen:        textLen,
		shortLineRatio: float64(shortLines) / float64(len(lines)),
		adHitRatio:     min(1, float64(adChars)/float64(textLen)),
	}
	r.score = float64(r.textLen) * (1 - 0.5*r.shortLineRatio) * (1 - 0.7*r.adHitRatio)
	return r
}

var tagStripRe = regexp.MustCompile(`<[^>]+>`)

func splitLines(s string) []string {
	return strings.Split(s, "\n")
}

// findLargestText 最长文本容器备用提取器(div/p/td/article, per-tag 200/全局 600 候选上限);
// 门槛: 文本长度 > 200 才采纳
func findLargestText(doc *goquery.Document) string {
	best := ""
	bestLen := 0
	perTagSeen := map[string]int{}
	const perTagCap = 200
	const totalCap = 600
	totalSeen := 0
	doc.Find("div,p,td,article").EachWithBreak(func(_ int, el *goquery.Selection) bool {
		if totalSeen >= totalCap {
			return false
		}
		node := el.Get(0)
		if node == nil {
			return true
		}
		tag := strings.ToLower(node.Data)
		perTagSeen[tag]++
		if perTagSeen[tag] > perTagCap {
			return true
		}
		totalSeen++
		t := el.Text()
		if len([]rune(t)) > bestLen {
			bestLen = len([]rune(t))
			h, _ := goquery.OuterHtml(el)
			best = h
		}
		return true
	})
	if bestLen > 200 {
		return best
	}
	return ""
}

// ---------------- bookIds 队列构建(对齐 src/lib/book-ids.ts) ----------------

var bookIdSplitRe = regexp.MustCompile(`[\s,，、;；]+`)

// ParseBookIdList 书号原文解析: 拆分→trim→去空→去重保序(容错接受字符串形态)
func ParseBookIdList(raw string) []string {
	if raw == "" {
		return nil
	}
	seen := map[string]struct{}{}
	var out []string
	for _, part := range bookIdSplitRe.Split(raw, -1) {
		id := strings.TrimSpace(part)
		if id == "" {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

// EncodeURIComponent 对齐 TS encodeURIComponent(编码集差异: Go url.QueryEscape
// 会把空格转 '+' 且不保留 !'()*, 与 JS 语义不符, 故手写)。导出供 fetch/task 包复用
func EncodeURIComponent(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
			c == '-' || c == '_' || c == '.' || c == '!' || c == '~' || c == '*' ||
			c == '\'' || c == '(' || c == ')' {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

// renderBookIdTemplate 书籍页 URL 模板渲染: {bookId} → encodeURIComponent(书号)
func renderBookIdTemplate(template, id string) string {
	return strings.ReplaceAll(template, "{bookId}", EncodeURIComponent(id))
}

// BuildBookIdQueue 书号列表队列: 逐个渲染模板 → 渲染后去重保序(10 万级平稳: 仅串操作)
func BuildBookIdQueue(ids []string, template string) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, id := range ids {
		u := renderBookIdTemplate(template, id)
		if _, dup := seen[u]; dup {
			continue
		}
		seen[u] = struct{}{}
		out = append(out, u)
	}
	return out
}

// 书号范围展开上限(契约 §7 书号 10 万级 + R51-2-b P1-4: 范围形态跨度 fail-closed 上限,
// 防直发 payload 溢出书号→1<<62 后无上限循环 OOM 崩溃重启环)
const BookIDMaxSpan = 100000

// BuildBookIdQueueFromRange 书号范围队列: 数字序列 from..to → 渲染 → 去重保序。
// 10 万级书号构建仅产生 URL 串(契约内存纪律: 队列只是 URL 串, 平稳可控);
// 跨度超 BookIDMaxSpan 时截断+warn 兜底(正常路径由 Validate 先行 fail-closed 拒绝)
func BuildBookIdQueueFromRange(from, to int64, template string) []string {
	// [R54-2a] 倒置范围归一(from>to 交换): 正常路径 Validate/buildBookIdsQueue 已先行
	// 归一+跨度校验, 本函数作为"二次防线"自身必须 panic-safe —— 修前倒置入参使
	// make(…, 0, to-from+1) 收到负 cap 直接 panic(虽有 run 协程 recover 兜底, 但
	// fail-closed 兜底路径自身崩 panic 属口径缺陷); 归一后语义与调用方一致
	if to < from {
		from, to = to, from
	}
	truncated := false
	if to-from+1 > BookIDMaxSpan {
		to = from + BookIDMaxSpan - 1
		truncated = true
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, to-from+1)
	for id := from; id <= to; id++ {
		u := renderBookIdTemplate(template, fmt.Sprintf("%d", id))
		if _, dup := seen[u]; dup {
			continue
		}
		seen[u] = struct{}{}
		out = append(out, u)
	}
	if truncated {
		fmt.Printf("[queue] warn: 书号范围跨度超上限 %d, 已截断至 %d..%d(fail-closed 兜底, 正常路径应被 Validate 拒绝)\n", BookIDMaxSpan, from, to)
	}
	return out
}

// ExpandListURL range 模式列表地址展开: {offset:N}=(p-1)*N; {page}=页号(全局替换)。
// 双形态展开: %7Bpage%7D/%7Boffset(:|%3A)N%7D 编码形态同认(TS R12-a-2 口径)
var offsetTplRe = regexp.MustCompile(`(?i)\{offset:(\d+)\}`)
var offsetEncRe = regexp.MustCompile(`(?i)%7Boffset(?:%3A|:)(\d+)%7D`)
var pageEncRe = regexp.MustCompile(`(?i)%7Bpage%7D`)

func ExpandListURL(rawTemplate string, page int) string {
	tpl := offsetTplRe.ReplaceAllStringFunc(rawTemplate, func(m string) string {
		sub := offsetTplRe.FindStringSubmatch(m)
		n := atoiSafe(sub[1], 1)
		if n < 1 {
			n = 1
		}
		return fmt.Sprintf("{offset:%d}", n)
	})
	tpl = offsetEncRe.ReplaceAllStringFunc(tpl, func(m string) string {
		sub := offsetEncRe.FindStringSubmatch(m)
		n := atoiSafe(sub[1], 1)
		if n < 1 {
			n = 1
		}
		return fmt.Sprintf("{offset:%d}", n)
	})
	tpl = pageEncRe.ReplaceAllString(tpl, "{page}")
	tpl = offsetTplRe.ReplaceAllStringFunc(tpl, func(m string) string {
		sub := offsetTplRe.FindStringSubmatch(m)
		n := atoiSafe(sub[1], 1)
		if n < 1 {
			n = 1
		}
		return fmt.Sprintf("%d", (page-1)*n)
	})
	return strings.ReplaceAll(tpl, "{page}", fmt.Sprintf("%d", page))
}

func atoiSafe(s string, def int) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return def
		}
		n = n*10 + int(c-'0')
	}
	return n
}

// HasUnrecognizedPlaceholder 模板残留未知占位符探测(R12-a-3 防呆)
var unknownPlaceholderRe = regexp.MustCompile(`(?i)\{[^{}]*\}|%7B[^%]*%7D`)

// recognizedPlaceholderRe 已识别占位符剔除(包级预编译 — 原 HasUnrecognizedPlaceholder
// 每次调用 MustCompile, range 发现每页一编译; R51-2-b P3)
var recognizedPlaceholderRe = regexp.MustCompile(`(?i)\{page\}|\{offset:\d+\}`)

func HasUnrecognizedPlaceholder(tpl string) bool {
	cleaned := recognizedPlaceholderRe.ReplaceAllString(tpl, "")
	return unknownPlaceholderRe.MatchString(cleaned)
}

// AbsolutizeURL 导出包装: 相对链接绝对化 + 噪声剥离/协议过滤/自引用过滤。
// 编排层 tocLink 定位与书号模板渲染共用(解析层内部 absolutize 同一实现, 不重复造轮子)
func AbsolutizeURL(raw, baseURL string) string {
	return absolutize(raw, baseURL)
}
