// ============================================================
// 解析引擎 — 提取原语层
// 移植权威: /home/z/my-project/src/lib/crawl/parser.ts(逐语义对齐)
//
//	applyTransform / cssExtract / regexExtract / jsonGet / constTemplate
//	/ absolutize / docBase / pickNextHref
//
// 设计决策:
//   - JS 正则 → Go RE2: 前瞻/反向引用等 RE2 不支持语法在编译期失败, 提取
//     fail-closed 返回空(TS 引擎侧为 try/catch 静默空, 语义等价; 能力差异留档)
//   - JSON 解码统一 UseNumber: 数字按原文字面串保留(TS String(v) 语义),
//     避免 float64 精度损失破坏书号/章节 id
//
// ============================================================
package rule

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
	xhtml "golang.org/x/net/html"
)

// ---------------- 后处理 ----------------

// [R9-c-1] 替换执行哨兵: 逐匹配累计耗时/匹配数上限(超限放弃本次替换保持原文)
const replaceBudgetMs = 1000
const replaceMaxMatches = 100000

// expandReplaceTo 展开 TS String.replace 替换串占位符: $$/$&/$`/$'/$1~$99/$<name>。
// 组号不存在时按规范保留字面量(如仅 8 组时 "$18" → 组1内容 + 字面 "8")。
// [R58-2a] groups 长度守卫: 零宽匹配分支传入 nil groups(修前 $&/$N 在零宽匹配时
// 对 nil 切片索引 → panic; RE2 零宽匹配常见于 a*/a? 形态替换, 任务 run 协程虽有
// recover 兜底, 但整轮任务被无谓熔断转 error)
func expandReplaceTo(repl string, match []int, groups [][]byte, subexpNames []string, source string) string {
	var out strings.Builder
	i := 0
	groupVal := func(n int) (string, bool) {
		if n < len(match)/2 && n < len(groups) && match[2*n] >= 0 {
			return string(groups[n]), true
		}
		return "", false
	}
	for i < len(repl) {
		ch := repl[i]
		if ch != '$' {
			out.WriteByte(ch)
			i++
			continue
		}
		if i+1 >= len(repl) {
			out.WriteByte('$')
			i++
			continue
		}
		nxt := repl[i+1]
		switch {
		case nxt == '$':
			out.WriteByte('$')
			i += 2
		case nxt == '&':
			if len(groups) > 0 {
				out.Write(groups[0])
			}
			i += 2
		case nxt == '`':
			out.WriteString(source[:match[0]])
			i += 2
		case nxt == '\'':
			out.WriteString(source[match[1]:])
			i += 2
		case nxt == '<':
			end := strings.IndexByte(repl[i+2:], '>')
			if end > 0 {
				name := repl[i+2 : i+2+end]
				for gi, gn := range subexpNames {
					if gn == name {
						if v, ok := groupVal(gi); ok {
							out.WriteString(v)
						}
						break
					}
				}
				i = i + 2 + end + 1
			} else {
				out.WriteByte('$')
				i++
			}
		case nxt >= '0' && nxt <= '9':
			// 两位组号(存在才采用)优先, 否则一位; 均不存在按字面量透传
			two := ""
			if i+3 <= len(repl) {
				two = repl[i+1 : i+3]
			}
			if len(two) == 2 && isAllDigits(two) {
				if n, err := strconv.Atoi(two); err == nil {
					if v, ok := groupVal(n); ok {
						out.WriteString(v)
						i += 3
						continue
					}
				}
			}
			if v, ok := groupVal(int(nxt - '0')); ok {
				out.WriteString(v)
				i += 2
			} else {
				out.WriteByte('$')
				i++
			}
		default:
			out.WriteByte('$')
			i++
		}
	}
	return out.String()
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// reCache 热路径正则编译缓存: rule 提供的 pattern 在每章每字段提取时反复使用
// [R52-5 P3](审计 R52-c「热路径 MustCompile 提包级」): regexExtract/regexExtractAll/
// safeReplaceAll 修前每次调用都 regexp.Compile(同 pattern 反复编译); 缓存后同 pattern
// 仅编译一次。键=完整 pattern(含 flags 前缀); 值=*regexp.Regexp(仅缓存编译成功者,
// 失败者不缓存每次重试编译, 行为与修前一致)。pattern 集合受规则数约束(有界, 逐任务
// 至多几十条), 无需淘汰
var reCache sync.Map // string -> *regexp.Regexp

func compileCached(pattern string) (*regexp.Regexp, error) {
	if v, ok := reCache.Load(pattern); ok {
		return v.(*regexp.Regexp), nil
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return nil, err
	}
	reCache.Store(pattern, re)
	return re, nil
}

// safeReplaceAll 安全整串替换: 单遍扫描 + $ 占位符展开; 逐匹配耗时超预算或匹配数
// 超上限时返回 ""(调用方保持原文不替换)。语义对齐 parser.ts safeReplaceAll
// R51-2-b #4: FindAllSubmatchIndex 上限化(replaceMaxMatches+1) — 零宽正则×10MB 页
// 原 -1 无界预分配可达数百 MB 峰值; 匹配数上限化后预算内存 ~3MB 且超限语义不变(fail-closed)
func safeReplaceAll(input, src, replaceTo string) string {
	re, err := compileCached(src)
	if err != nil {
		return ""
	}
	t0 := time.Now()
	var out strings.Builder
	last := 0
	count := 0
	locs := re.FindAllSubmatchIndex([]byte(input), replaceMaxMatches+1)
	if locs == nil {
		return input
	}
	for _, m := range locs {
		count++
		if count > replaceMaxMatches {
			return ""
		}
		if time.Since(t0).Milliseconds() > replaceBudgetMs {
			return ""
		}
		if m[0] == m[1] {
			// 零宽匹配: 在该位置插入 replaceTo, 推进一位防死循环(TS 同语义)
			out.WriteString(input[last:m[0]])
			out.WriteString(expandReplaceTo(replaceTo, m, nil, re.SubexpNames(), input))
			last = m[0]
			if last < len(input) {
				// 输入侧推进由 locs 顺序保证, 这里仅跳过零宽插入重复
			}
			continue
		}
		groups := make([][]byte, len(m)/2)
		for g := range groups {
			if m[2*g] >= 0 {
				groups[g] = []byte(input[m[2*g]:m[2*g+1]])
			}
		}
		out.WriteString(input[last:m[0]])
		out.WriteString(expandReplaceTo(replaceTo, m, groups, re.SubexpNames(), input))
		last = m[1]
	}
	out.WriteString(input[last:])
	return out.String()
}

// jsFlagsToGo JS 正则 flags → Go 内联 flags 前缀(i→(?i) s→(?s) m→(?m); g/u/y 忽略)
func jsFlagsToGo(flags string) string {
	var b strings.Builder
	if strings.Contains(flags, "i") {
		b.WriteString("(?i)")
	}
	if strings.Contains(flags, "s") {
		b.WriteString("(?s)")
	}
	if strings.Contains(flags, "m") {
		b.WriteString("(?m)")
	}
	return b.String()
}

// regexRuntimeSafe 正则危险度闸门(对齐 parser.ts regexRuntimeSafe):
// 长度上限 + 嵌套量词快筛。RE2 本身无灾难回溯, 预算样本测试不必要;
// 嵌套量词闸门保留(与 TS 判定口径一致, 便于行为对齐)。
var nestedQuantRe = regexp.MustCompile(`[+*]\s*\)\s*[+*{]`)

func regexRuntimeSafe(src string) bool {
	return len(src) <= 1000 && !nestedQuantRe.MatchString(src)
}

// regexExtract 首次匹配提取: attr 为数字=捕获组序号, 否则有组取组1/无组取全匹配
func regexExtract(htmlStr string, rule *FieldRule) string {
	if !regexRuntimeSafe(rule.Expression) {
		return ""
	}
	re, err := compileCached(jsFlagsToGo(rule.Flags) + rule.Expression)
	if err != nil {
		return ""
	}
	m := re.FindStringSubmatch(htmlStr)
	if m == nil {
		return ""
	}
	group := 0
	if rule.Attr != "" && isAllDigits(rule.Attr) {
		group, _ = strconv.Atoi(rule.Attr)
	} else if re.NumSubexp() > 0 {
		group = 1
	}
	if group < len(m) && m[group] != "" {
		return m[group]
	}
	return m[0]
}

// regexExtractAll 全量匹配提取(上限 5000, 零宽推进防护)。
// [R58-2a] FindAll 上限化(5001): 修前 -1 无界 —— 10MB 页 × 高频匹配 pattern(如单字
// 字符类)先全量分配再事后截断, 内存放大与 safeReplaceAll R51-2-b #4 同族; 上限化后
// 预分配有界, 返回语义不变(仍取首 5000)
func regexExtractAll(htmlStr string, rule *FieldRule) []string {
	if !regexRuntimeSafe(rule.Expression) {
		return nil
	}
	re, err := compileCached(jsFlagsToGo(rule.Flags) + rule.Expression)
	if err != nil {
		return nil
	}
	group := 0
	if rule.Attr != "" && isAllDigits(rule.Attr) {
		group, _ = strconv.Atoi(rule.Attr)
	} else if strings.Contains(rule.Expression, "(") {
		group = 1
	}
	if group > re.NumSubexp() {
		group = 0
	}
	var out []string
	guard := 0
	for _, m := range re.FindAllStringSubmatch(htmlStr, 5001) {
		if guard++; guard > 5000 {
			break
		}
		if group < len(m) && m[group] != "" {
			out = append(out, m[group])
		} else {
			out = append(out, m[0])
		}
	}
	return out
}

// ---------------- CSS (goquery) ----------------

// cssSelect 选择器容错执行: 非法选择器(如数字开头 id)自动降级为属性选择器重试。
// goquery/cascadia 对非法选择器返回空集(不 panic), 因此先查原始表达式, 空且可改写时重试。
var numericIdRe = regexp.MustCompile(`#(\d[\w-]*)`)

func cssSelect(doc *goquery.Document, scope *goquery.Selection, expression string) *goquery.Selection {
	run := func(expr string) *goquery.Selection {
		if scope != nil {
			return scope.Find(expr)
		}
		return doc.Find(expr)
	}
	sel := run(expression)
	if sel != nil && sel.Length() > 0 {
		return sel
	}
	if fixed := numericIdRe.ReplaceAllString(expression, `[id="$1"]`); fixed != expression {
		return run(fixed)
	}
	return nil
}

// TEXT_BLOCK_TAGS 内容块级标签集合(与 TS parser.ts TEXT_BLOCK_TAGS 同口径)
var textBlockTags = map[string]bool{
	"p": true, "div": true, "li": true, "ul": true, "ol": true, "tr": true, "td": true,
	"th": true, "table": true, "thead": true, "tbody": true, "tfoot": true,
	"h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
	"section": true, "article": true, "header": true, "footer": true,
	"aside": true, "nav": true, "blockquote": true, "pre": true, "form": true,
	"dl": true, "dt": true, "dd": true, "figure": true, "figcaption": true,
	"main": true, "center": true, "hr": true,
}

// blockAwareText 块级感知文本提取: 遍历 DOM 节点, 块级开闭边界/br 插入 \n;
// script/style/noscript 内部文本不进正文(R13-4 同口径)
func blockAwareText(node *xhtml.Node) string {
	var out strings.Builder
	var walk func(n *xhtml.Node)
	walk = func(n *xhtml.Node) {
		if n == nil {
			return
		}
		switch n.Type {
		case xhtml.TextNode:
			out.WriteString(n.Data)
			return
		case xhtml.DocumentNode:
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				walk(c)
			}
			return
		case xhtml.ElementNode:
			// 继续下方处理
		default:
			return
		}
		tag := strings.ToLower(n.Data)
		if tag == "br" {
			out.WriteString("\n")
			return
		}
		if tag == "script" || tag == "style" || tag == "noscript" {
			return
		}
		block := textBlockTags[tag]
		if block {
			out.WriteString("\n")
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
		if block {
			out.WriteString("\n")
		}
	}
	walk(node)
	return out.String()
}

// cssExtract CSS 字段提取: 取首元素, attr 语义 text/html/href/src/任意属性
func cssExtract(doc *goquery.Document, scope *goquery.Selection, rule *FieldRule) string {
	sel := cssSelect(doc, scope, rule.Expression)
	if sel == nil || sel.Length() == 0 {
		return ""
	}
	first := sel.First()
	attr := rule.Attr
	if attr == "" {
		attr = "text"
	}
	switch attr {
	case "text":
		node := first.Get(0)
		if node == nil {
			return ""
		}
		return blockAwareText(node)
	case "html":
		h, _ := first.Html()
		return h
	case "href":
		v, _ := first.Attr("href")
		return v
	case "src":
		v, _ := first.Attr("src")
		return v
	default:
		v, _ := first.Attr(attr)
		return v
	}
}

func cssExtractAll(doc *goquery.Document, expression string) []*xhtml.Node {
	sel := doc.Find(expression)
	if sel == nil {
		return nil
	}
	return sel.Nodes
}

// nodeAttr 节点自身属性读取(xhtml.Node 直读, 不下钻子元素)
func nodeAttr(node *xhtml.Node, name string) string {
	if node == nil {
		return ""
	}
	if name == "text" {
		return nodeTextContent(node)
	}
	for _, a := range node.Attr {
		if a.Key == name {
			return a.Val
		}
	}
	return ""
}

// nodeTextContent 节点子树文本拼接(对齐 cheerio .text(): 仅文本节点串联)
func nodeTextContent(node *xhtml.Node) string {
	var b strings.Builder
	var walk func(n *xhtml.Node)
	walk = func(n *xhtml.Node) {
		if n == nil {
			return
		}
		if n.Type == xhtml.TextNode {
			b.WriteString(n.Data)
			return
		}
		if n.Type != xhtml.ElementNode && n.Type != xhtml.DocumentNode {
			return
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(node)
	return b.String()
}

// outerHtmlOf 节点外层 HTML 序列化
func outerHtmlOf(node *xhtml.Node) string {
	if node == nil {
		return ""
	}
	doc := goquery.NewDocumentFromNode(node)
	h, err := goquery.OuterHtml(doc.Selection)
	if err != nil {
		return ""
	}
	return h
}

// stripHtmlTagsQuoteAware 引号感知标签剥离(属性内 > 不截断, 对齐 cleaner R21-c-4)
func stripHtmlTagsQuoteAware(s string) string {
	var out strings.Builder
	i := 0
	for i < len(s) {
		if s[i] == '<' {
			j := i + 1
			depth := 1
			inQuote := byte(0)
			for j < len(s) && depth > 0 {
				c := s[j]
				if inQuote != 0 {
					if c == inQuote {
						inQuote = 0
					}
				} else if c == '"' || c == '\'' {
					inQuote = c
				} else if c == '<' {
					depth++
				} else if c == '>' {
					depth--
					if depth == 0 {
						break
					}
				}
				j++
			}
			if j < len(s) {
				i = j + 1
				continue
			}
			// 未闭合 '<' 按字面量保留
			out.WriteByte('<')
			i++
			continue
		}
		out.WriteByte(s[i])
		i++
	}
	return out.String()
}

// applyTransform 变换链: trim → stripTags → replaceFrom/replaceTo(正则) → index 截取。
// 语义逐条对齐 parser.ts applyTransform
func applyTransform(value string, rule *FieldRule) string {
	v := strings.TrimSpace(value)
	if rule.StripTags {
		v = strings.TrimSpace(stripHtmlTagsQuoteAware(v))
	}
	if rule.ReplaceFrom != "" {
		if regexRuntimeSafe(rule.ReplaceFrom) {
			if replaced := safeReplaceAll(v, rule.ReplaceFrom, rule.ReplaceTo); replaced != "" {
				v = replaced
			}
		}
	}
	if rule.Index != nil {
		parts := splitCommaFull(v)
		idx := *rule.Index
		if idx >= 0 && idx < len(parts) {
			v = parts[idx]
		} else {
			v = ""
		}
	}
	return strings.TrimSpace(v)
}

// splitCommaFull 逗号分段(全角/半角逗号, 对齐 TS split(/[，,]/))
var commaSplitRe = regexp.MustCompile(`[，,]`)

func splitCommaFull(v string) []string {
	raw := commaSplitRe.Split(v, -1)
	out := make([]string, 0, len(raw))
	for _, p := range raw {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// ---------------- JSON 纯 API 站模式 ----------------

// parseJsonBody 响应体 → JSON 值: 去 BOM, 首字符 {/[ 快速判定, 解析失败返回 nil
func parseJsonBody(body string) interface{} {
	if body == "" {
		return nil
	}
	s := strings.TrimPrefix(body, "\uFEFF")
	t := strings.TrimSpace(s)
	if t == "" || (t[0] != '{' && t[0] != '[') {
		return nil
	}
	dec := json.NewDecoder(strings.NewReader(t))
	dec.UseNumber() // 数字按字面串保留(TS String(v) 语义, 防书号/章节 id 精度损失)
	var v interface{}
	if err := dec.Decode(&v); err != nil {
		return nil
	}
	return v
}

// JSONGet JSON 点路径取值导出形态(fetch 层 token 提取等跨包消费 — 原与
// fetch.jsonGetPath 双实现, R51-3-a 收敛为单一实现)
func JSONGet(root interface{}, path string) interface{} {
	return jsonGet(root, path)
}

// ParseJSONBody 宽松 JSON 解码导出形态(UseNumber: 数字按原文字面串保留)
func ParseJSONBody(s string) interface{} {
	return parseJsonBody(s)
}

// jsonGet JSON 点路径取值(契约 §4): a.b.c 逐层; 数字段=数组下标(0基); 空路径/./$=根本身;
// [] 装饰剔除; [n]=下标; [k=v(&k2=v2)]=过滤(值 %26 转义还原); *=递归展平
func jsonGet(root interface{}, path string) interface{} {
	if root == nil {
		return nil
	}
	cur := root
	raw := strings.TrimSpace(path)
	if raw == "" || raw == "." || raw == "$" {
		return cur
	}
	for _, seg0 := range strings.Split(raw, ".") {
		seg := strings.TrimSpace(strings.ReplaceAll(seg0, "[]", ""))
		if seg == "" || seg == "$" {
			continue
		}
		if cur == nil {
			return nil
		}
		name, ops := splitJsonSeg(seg)
		if name == "*" {
			if arr, ok := cur.([]interface{}); ok {
				cur = deepFlatten(arr)
			}
		} else if name != "" {
			if arr, ok := cur.([]interface{}); ok {
				if isAllDigits(name) {
					idx, _ := strconv.Atoi(name)
					if idx < len(arr) {
						cur = arr[idx]
					} else {
						return nil
					}
				} else {
					return nil
				}
			} else if obj, ok := cur.(map[string]interface{}); ok {
				cur = obj[name]
			} else {
				return nil
			}
		}
		for _, op := range ops {
			arr, ok := cur.([]interface{})
			if !ok {
				break
			}
			if isAllDigits(op) {
				idx, _ := strconv.Atoi(op)
				if idx < len(arr) {
					cur = arr[idx]
				} else {
					cur = nil
				}
			} else if strings.Contains(op, "=") {
				cur = filterJsonArray(arr, op)
			}
		}
	}
	return cur
}

// jsonArrayAt itemSelector 专用: 逗号分隔多路径并集取"数组平面"(各路径数组逐项拼入)
func jsonArrayAt(root interface{}, path string) []interface{} {
	raw := strings.TrimSpace(path)
	if raw == "" {
		return nil
	}
	var out []interface{}
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		v := jsonArrayWalk(root, part)
		if arr, ok := v.([]interface{}); ok {
			out = append(out, arr...)
		} else if v != nil {
			out = append(out, v)
		}
	}
	return out
}

// jsonArrayWalk 行走器: jsonGet 语法 + map-collect(数组上非数字段=跨元素取属性展平一层)
func jsonArrayWalk(root interface{}, path string) interface{} {
	if root == nil {
		return nil
	}
	cur := root
	raw := strings.TrimSpace(path)
	if raw == "" || raw == "." || raw == "$" {
		return cur
	}
	for _, seg0 := range strings.Split(raw, ".") {
		seg := strings.TrimSpace(strings.ReplaceAll(seg0, "[]", ""))
		if seg == "" || seg == "$" {
			continue
		}
		if cur == nil {
			return nil
		}
		name, ops := splitJsonSeg(seg)
		if name == "*" {
			if arr, ok := cur.([]interface{}); ok {
				cur = deepFlatten(arr)
			}
		} else if name != "" {
			if arr, ok := cur.([]interface{}); ok {
				if isAllDigits(name) {
					idx, _ := strconv.Atoi(name)
					if idx < len(arr) {
						cur = arr[idx]
					} else {
						return nil
					}
				} else {
					// map-collect: 跨元素取属性并展平一层
					collected := make([]interface{}, 0, len(arr))
					for _, el := range arr {
						if obj, ok := el.(map[string]interface{}); ok {
							v := obj[name]
							if va, ok := v.([]interface{}); ok {
								collected = append(collected, va...)
							} else if v != nil {
								collected = append(collected, v)
							}
						}
					}
					cur = collected
				}
			} else if obj, ok := cur.(map[string]interface{}); ok {
				cur = obj[name]
			} else {
				return nil
			}
		}
		for _, op := range ops {
			arr, ok := cur.([]interface{})
			if !ok {
				break
			}
			if isAllDigits(op) {
				idx, _ := strconv.Atoi(op)
				if idx < len(arr) {
					cur = arr[idx]
				} else {
					cur = nil
				}
			} else if strings.Contains(op, "=") {
				cur = filterJsonArray(arr, op)
			}
		}
	}
	return cur
}

// splitJsonSeg 拆分路径段: 'name[3]'/'name[k=v]'/'name[]' → {name, ops[]}
var bracketOpsRe = regexp.MustCompile(`\[([^\]]*)\]`)
var bracketStripRe = regexp.MustCompile(`\[[^\]]*\]`)

func splitJsonSeg(seg string) (string, []string) {
	var ops []string
	for _, m := range bracketOpsRe.FindAllStringSubmatch(seg, -1) {
		ops = append(ops, m[1])
	}
	name := strings.TrimSpace(bracketStripRe.ReplaceAllString(seg, ""))
	return name, ops
}

// filterJsonArray [k=v(&k2=v2)] 过滤算子: 值按 String 宽松比较; %26 → 字面 & (R4-18)
func filterJsonArray(arr []interface{}, op string) []interface{} {
	var conds [][2]string
	for _, c := range strings.Split(op, "&") {
		i := strings.Index(c, "=")
		if i < 0 {
			continue
		}
		k := c[:i]
		v := strings.ReplaceAll(c[i+1:], "%26", "&") // 转义符解码(R4-18 同口径)
		conds = append(conds, [2]string{k, v})
	}
	out := make([]interface{}, 0, len(arr))
	for _, el := range arr {
		obj, ok := el.(map[string]interface{})
		if !ok {
			continue
		}
		match := true
		for _, cond := range conds {
			if jsonStringOf(obj[cond[0]]) != cond[1] {
				match = false
				break
			}
		}
		if match {
			out = append(out, el)
		}
	}
	return out
}

// deepFlatten 递归展平(数组的数组 → 元素平面, 对齐 TS flat(Infinity))
func deepFlatten(arr []interface{}) []interface{} {
	out := make([]interface{}, 0, len(arr))
	var walk func(a []interface{})
	walk = func(a []interface{}) {
		for _, el := range a {
			if sub, ok := el.([]interface{}); ok {
				walk(sub)
			} else {
				out = append(out, el)
			}
		}
	}
	walk(arr)
	return out
}

// jsonStringOf JSON 值 → String 宽松比较口径: 标量→字面串; 其他→""(对齐 TS String())
func jsonStringOf(v interface{}) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case json.Number:
		return string(t)
	case bool:
		if t {
			return "true"
		}
		return "false"
	default:
		return ""
	}
}

// jsonToString JSON 值 → 字段串: 数组→各元素按\n连接; 标量→String; 对象/null→”
func jsonToString(v interface{}) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case bool:
		if t {
			return "true"
		}
		return "false"
	case json.Number:
		return string(t)
	case []interface{}:
		var parts []string
		for _, x := range t {
			s := jsonToString(x)
			if s != "" {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, "\n")
	default:
		return ""
	}
}

// urlVars 页面URL → const 模板 vars(q.参数名 → 查询参数值)
func urlVars(u string) map[string]string {
	out := map[string]string{}
	if u == "" {
		return out
	}
	parsed, err := url.Parse(u)
	if err != nil {
		return out
	}
	for k, vs := range parsed.Query() {
		if k != "" && len(k) <= 40 && len(vs) > 0 {
			out["q."+k] = vs[0]
		}
	}
	return out
}

// ---------------- const 模板(含算术后缀, 契约 §4) ----------------

// constTemplate 常量模板渲染:
//
//	{name}      → vars[name], 未命中替换为空串(TS 既有语义)
//	{v|/N}      → 整除(向下取整); 变量缺失/非数字/N=0 → 整体置空 fail-closed
//	{v|+N}/{v|-N} → 加减; 变量缺失/非数字 → 整体置空
//
// arithPlaceholderIncomplete 预检(R49-9): 渲染前扫描, 任何算术后缀残缺(如 {v|/}、
// {v|*2}、{v|/1.5})或未闭合({v|/1000 无右括号}) → 整体置空 fail-closed。
// 整体置空 = 整个字段值为空串, 防止残缺模板渲染出错误 URL 参与抓取。
// [R52-5 P2 对齐 TS parser.ts](审计 R52-c): ①空后缀 {v|} 与残缺同口径整体置空 —— 修前
// 按"纯占位符"渲染原值, 违背本段 fail-closed 注释(TS 预检2 对空后缀置空整字段);
// ②ParseFloat 放行 Infinity/NaN 修后非有限数也整体置空(TS Number.isFinite 同口径),
// 防 "+Inf"/"NaN" 渲染进 URL; ③N 上限对齐 TS \d{1,6}(1~6 位整数, 修后 7 位 N
// 预检即整体置空且 Atoi 溢出面闭合)。
var constTplRe = regexp.MustCompile(`\{([a-zA-Z0-9_.]+)(\|([^{}]*))?\}`)

// arithSuffixRe: 仅 / +- 三算子(原字符类误含 ~ 字面量 — R51-2-b P3: 统一 fail-closed,
// {v|~N} 预检即整体置空而非预检放行后 default 分支置空);
// [R52-5] N 上限 1~6 位对齐 TS CONST_TPL_RE 渲染能力(\d{1,6})
var arithSuffixRe = regexp.MustCompile(`^([-/+])([0-9]{1,6})$`)
var danglingArithRe = regexp.MustCompile(`\{[a-zA-Z0-9_.]+\|[^{}]*$`)

func constTemplate(expr string, vars map[string]string) string {
	// 预检 1: 未闭合的算术占位符({v|/1000 → 永不闭合) → 整体置空
	if danglingArithRe.MatchString(expr) {
		return ""
	}
	// 预检 2: 已闭合但后缀残缺/未知算子/非整数 N → 整体置空
	for _, m := range constTplRe.FindAllStringSubmatch(expr, -1) {
		suffix := m[3]
		// [R52-5] 区分口径: m[2]=="" 才是纯 {var}(无管道); {v|}(管道+空后缀)是残缺形态,
		// 与 TS 预检2(CONST_TPL_SUFFIX_RE 捕获后 CONST_TPL_ARITH_RE 校验失败)同口径置空 ——
		// 修前以 suffix=="" 判纯占位符, {v|} 漏过预检被渲染成原值
		if m[2] == "" {
			continue // 纯 {var} 占位符, 无预检需求
		}
		if !arithSuffixRe.MatchString(suffix) {
			return ""
		}
	}
	// 预检 3(R49-9 语义对齐, TS parser.ts arithPlaceholderIncomplete): 任一算术占位符的
	// 变量缺失/非数/除零 → 整体置空 fail-closed —— 防止半残 URL(如 bookimg//.jpg)
	// 静默命中源站占位图(既有真实缺陷, 不可只置空单个占位符放行残串)
	for _, m := range constTplRe.FindAllStringSubmatch(expr, -1) {
		key := m[1]
		suffix := m[3]
		if m[2] == "" {
			continue // [R52-5] 纯 {var}(无管道)无预检需求; {v|} 空后缀属残缺不再跳过
		}
		raw, ok := vars[key]
		if !ok || raw == "" {
			return "" // 缺变量 → 整体置空
		}
		raw = strings.TrimSpace(raw) // [R52-5 P3] 对齐 TS 预检3 String(raw).trim()(仅算术臂; 纯 {var} 不 trim)
		if raw == "" {
			return "" // 空白值(trim 后空) → 整体置空
		}
		f, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return "" // 非数 → 整体置空
		}
		// [R52-5 P2] 非有限数(Infinity/+Inf/NaN) → 整体置空(TS Number.isFinite 同口径):
		// Go ParseFloat 接受这些字面量, 修前会渲染 "+Inf"/"NaN" 入 URL
		if math.IsInf(f, 0) || math.IsNaN(f) {
			return ""
		}
		if strings.HasPrefix(suffix, "/") {
			if n, _ := strconv.Atoi(suffix[1:]); n == 0 {
				return "" // 除零 → 整体置空
			}
		}
	}
	return constTplRe.ReplaceAllStringFunc(expr, func(full string) string {
		m := constTplRe.FindStringSubmatch(full)
		key := m[1]
		suffix := m[3]
		if m[2] == "" {
			// 纯 {var}(无管道): 未命中 → 空串(TS 语义)
			// [R52-5] 判定改 m[2]: {v|} 空后缀已被预检2置空不会到达本分支;
			// 修前以 suffix=="" 判纯占位符, {v|} 会在此被渲染成原值
			return vars[key]
		}
		// 算术占位符: fail-closed 语义
		op := suffix[0:1]
		n, _ := strconv.Atoi(suffix[1:])
		raw, ok := vars[key]
		if !ok || strings.TrimSpace(raw) == "" {
			return "" // 缺变量/空白值 → 整体置空(由外层检查保证, 此处兜底)
		}
		raw = strings.TrimSpace(raw) // [R52-5 P3] 对齐 TS 渲染臂 String(v).trim()(仅算术臂)
		val, err := strconv.ParseFloat(raw, 64)
		if err != nil || math.IsInf(val, 0) || math.IsNaN(val) {
			return "" // 非数字/非有限数 → 整体置空([R52-5] 补 IsInf/IsNaN 兜底)
		}
		var result float64
		switch op {
		case "/":
			if n == 0 {
				return "" // 除零 → 整体置空
			}
			result = math.Floor(val / float64(n))
		case "+":
			result = val + float64(n)
		case "-":
			result = val - float64(n)
		default:
			return ""
		}
		return formatArithResult(result)
	})
}

// formatArithResult 结果格式化(对齐 TS String(result)=JS Number→String 语义):
// 整值且 |x|<1e15 → 无小数点整数; 1e-6 ≤ |x| < 1e21 → 固定小数('f' 最短精度);
// 其余(含 ≥1e21 大数与 <1e-6 极小值)→ JS 形态科学计数("1e+21"/"1e-7", 指数无前导零)。
// [R52-5 P3](审计 R52-c「1e21 格式」): 修前非整值一律 'f' → 22 位大数与 JS "1e+21"
// 分叉(同 ID 两侧产出不同 URL)
func formatArithResult(f float64) string {
	abs := math.Abs(f)
	if f == math.Trunc(f) && abs < 1e15 {
		return strconv.FormatInt(int64(f), 10)
	}
	if abs != 0 && (abs >= 1e21 || abs < 1e-6) {
		return jsFloatFormat(f)
	}
	return strconv.FormatFloat(f, 'f', -1, 64)
}

// jsFloatFormat JS Number 科学计数形态: mantissa + 'e' + 符号 + 无前导零指数
// (Go 'e' 指数至少 2 位 "1e-07", JS 为 "1e-7" —— 手工重组)
func jsFloatFormat(f float64) string {
	s := strconv.FormatFloat(f, 'e', -1, 64)
	i := strings.IndexByte(s, 'e')
	if i < 0 {
		return s
	}
	mant, exp := s[:i], s[i+1:]
	sign := "+"
	switch exp[0] {
	case '+':
		exp = exp[1:]
	case '-':
		sign = "-"
		exp = exp[1:]
	}
	exp = strings.TrimLeft(exp, "0")
	if exp == "" {
		exp = "0"
	}
	return mant + "e" + sign + exp
}

// ---------------- 提取上下文与统一提取 ----------------

// extractCtx 提取上下文: json=当前作用域 JSON 根值; vars=const 模板占位符取值表
type extractCtx struct {
	JSON interface{}
	Vars map[string]string
}

// extractField 统一提取入口: 按 rule.type 分发 + applyTransform 后处理。
// htmlStr=当前作用域 HTML(regex 用), doc=goquery 文档(css 用), ctx=json/const 上下文
func extractField(htmlStr string, doc *goquery.Document, scope *goquery.Selection, rule *FieldRule, ctx *extractCtx) string {
	var v string
	switch rule.Type {
	case "css":
		if doc != nil {
			v = cssExtract(doc, scope, rule)
		}
	case "regex":
		v = regexExtract(htmlStr, rule)
	case "json":
		var root interface{}
		if ctx != nil && ctx.JSON != nil {
			root = ctx.JSON
		} else {
			root = parseJsonBody(htmlStr)
		}
		if root != nil {
			v = jsonToString(jsonGet(root, rule.Expression))
		}
	case "const":
		if ctx != nil {
			v = constTemplate(rule.Expression, ctx.Vars)
		} else {
			v = constTemplate(rule.Expression, nil)
		}
	case "xpath":
		// 不支持: capability 校验拦截后不会到达; 引擎侧 fail-closed 空值
		v = ""
	}
	return applyTransform(v, rule)
}

// ---------------- URL 绝对化 ----------------

// invisibleCharsRe 零宽/双向控制字符(对齐 cleaner INVISIBLE_CHARS_RE)
var invisibleCharsRe = regexp.MustCompile(`[\x{00ad}\x{180e}\x{200b}-\x{200f}\x{202a}-\x{202e}\x{2060}-\x{2064}\x{2066}-\x{2069}\x{feff}]`)

// httpSchemeRe http(s) 前缀判定(包级预编译 — 原 absolutize/docBase/resolveWithBase
// 热路径循环内 MustCompile, 每链接一次编译; R51-2-b P3)
var httpSchemeRe = regexp.MustCompile(`(?i)^https?://`)

// absolutize URL 绝对化 + 噪声剥离 + 协议过滤 + 自引用过滤(对齐 parser.ts absolutize):
// ①不可见字符剥离(反采集零宽水印) ②实体单遍解码 ③相对地址按 base 解析
// ④非 http(s) 过滤(javascript:/data:/mailto: 等) ⑤自引用(同 origin+path+search)返回空
func absolutize(rawURL, baseURL string) string {
	if rawURL == "" {
		return ""
	}
	u := strings.TrimSpace(invisibleCharsRe.ReplaceAllString(rawURL, ""))
	decoded := ""
	if u != "" {
		decoded = strings.TrimSpace(html.UnescapeString(u))
	}
	if decoded == "" {
		return ""
	}
	out := decoded
	if !httpSchemeRe.MatchString(decoded) {
		if baseURL != "" {
			if resolved := resolveRef(baseURL, decoded); resolved != "" {
				out = resolved
			}
		}
	}
	if !httpSchemeRe.MatchString(out) {
		return ""
	}
	// 自引用过滤: 纯锚点/./ 等指向当前文档本身 → 空(防目录页整页当章节)
	if baseURL != "" {
		bu, err1 := url.Parse(baseURL)
		ou, err2 := url.Parse(out)
		if err1 == nil && err2 == nil &&
			schemeHost(bu) == schemeHost(ou) && ou.Path == bu.Path && ou.RawQuery == bu.RawQuery {
			return ""
		}
	}
	return out
}

func schemeHost(u *url.URL) string {
	return strings.ToLower(u.Scheme) + "://" + strings.ToLower(u.Host)
}

// resolveRef 按基准解析相对地址(失败返回 "")
func resolveRef(base, ref string) string {
	b, err := url.Parse(base)
	if err != nil {
		return ""
	}
	r, err := url.Parse(ref)
	if err != nil {
		return ""
	}
	return b.ResolveReference(r).String()
}

// ---------------- 页面基址(<base href>) ----------------

// docBase 页面有效文档基址: 首个 base[href] 生效位; 相对 base href 按文档 URL 解析
func docBase(doc *goquery.Document, docURL string) string {
	if docURL == "" || doc == nil {
		return docURL
	}
	href := strings.TrimSpace(doc.Find("base[href]").First().AttrOr("href", ""))
	if href != "" {
		if httpSchemeRe.MatchString(href) {
			return href
		}
		if u := resolveRef(docURL, href); u != "" {
			if pu, err := url.Parse(u); err == nil && (pu.Scheme == "http" || pu.Scheme == "https") {
				return u
			}
		}
	}
	return docURL
}

// resolveWithBase 相对地址先按页面基址解析(纯锚点/绝对地址原样返回);
// absolutize 的自引用过滤始终以文档 URL 为基准 —— 两基准分离(TS bb-g 同口径)
func resolveWithBase(raw, baseURL string) string {
	u := strings.TrimSpace(raw)
	if u == "" || strings.HasPrefix(u, "#") {
		return u
	}
	if httpSchemeRe.MatchString(u) {
		return u
	}
	abs := resolveRef(baseURL, u)
	if abs != "" && httpSchemeRe.MatchString(abs) {
		return abs
	}
	return u
}

// ---------------- 翻页"下一页"鲁棒选取 ----------------

// pickNextHref 翻页候选选取: 规则型候选(css 多元素/其他类型单值)+文案兜底
// (a:contains), 逐个绝对化+自引用过滤, 取第一个有效且未被排除的 URL(对齐 R9-c-4)
func pickNextHref(doc *goquery.Document, nextRule *FieldRule, scopeHTML, base, docURL string, fallbackTexts []string, exclude func(u string) bool) string {
	var raws []string
	if nextRule != nil {
		if nextRule.Type == "css" {
			els := cssSelect(doc, nil, nextRule.Expression)
			if els != nil {
				arr := els.Nodes
				if len(arr) > 50 {
					arr = arr[:50]
				}
				for _, el := range arr {
					var v string
					if nextRule.Attr == "text" || nextRule.Attr == "html" || nextRule.Attr == "" {
						v = nodeAttr(el, "href")
						if v == "" {
							v = strings.TrimSpace(nodeTextContent(el))
						}
					} else {
						v = nodeAttr(el, nextRule.Attr)
					}
					if v != "" {
						if t := applyTransform(v, nextRule); t != "" {
							raws = append(raws, t)
						}
					}
				}
			}
		} else {
			raws = append(raws, extractField(scopeHTML, doc, nil, nextRule, nil))
		}
	}
	// 常见文案兜底(:contains 由 cascadia 支持)
	for _, t := range fallbackTexts {
		hits := doc.Find(fmt.Sprintf("a:contains(%q)", t))
		arr := hits.Nodes
		if len(arr) > 50 {
			arr = arr[:50]
		}
		for _, el := range arr {
			if v := nodeAttr(el, "href"); v != "" {
				raws = append(raws, v)
			}
		}
	}
	for _, raw := range raws {
		abs := absolutize(resolveWithBase(raw, base), docURL)
		if abs != "" && abs != docURL && !exclude(abs) {
			return abs
		}
	}
	return ""
}

// PageFetch 翻页/分页请求传输回调(由任务编排层注入过闸版抓取; 契约 §4 refererChain:
// 翻页第 2 页起回传上一页 URL 作 Referer)
type PageFetch func(ctx context.Context, url string, refererURL string) (string, error)

// fetchPaginationPage 翻页传输: 注入回调必经; 失败上抛由调用方 break(已得页保留)
func fetchPaginationPage(ctx context.Context, fn PageFetch, url, refererURL string) (string, error) {
	if fn == nil {
		return "", fmt.Errorf("翻页传输未注入")
	}
	return fn(ctx, url, refererURL)
}

// ---------------- 简版字段清洗(仅 status/keywords/latestChapter/volume 消费) ----------------

// cleanTextFieldMinimal 简版 cleanTextField: 标签剥离 → 实体单遍解码 → 控制字符/不可见
// 字符剥离 → 空白折叠 → trim → 码点截断。与 TS 差异: 不做繁→简(t2s 映射表体积过大,
// 状态检测关键词以简体为主, 影响面极小, 已留档为偏差项)
func cleanTextFieldMinimal(raw string, maxLen int) string {
	if raw == "" {
		return ""
	}
	v := stripHtmlTagsQuoteAware(raw)
	v = html.UnescapeString(v)
	v = ctrlRe.ReplaceAllString(v, "")
	v = invisibleCharsRe.ReplaceAllString(v, "")
	// 空白折叠(\s+ → ' ', 含全角空格族; 对齐 TS R22-b-1)
	v = collapseSpaceRe.ReplaceAllString(v, " ")
	v = strings.TrimSpace(v)
	if maxLen > 0 {
		r := []rune(v)
		if len(r) > maxLen {
			v = string(r[:maxLen])
		}
	}
	return v
}

var collapseSpaceRe = regexp.MustCompile(`\s+`)
