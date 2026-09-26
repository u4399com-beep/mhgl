// ============================================================
// R70-c — 手写 HTML tokenizer(零依赖, stdlib 足够)
//
// 设计目标:
//  1. 可靠区分 文本节点 / 标记(标签/注释/DOCTYPE) / 逐字节透传区,
//     为伪装管线提供最小充分的 token 视图;
//  2. 怪数据不 panic: 任何截断/嵌套错误/非法字节都以"保守透传"收场;
//  3. raw text 元素(script/style/textarea)与 pre 内容、svg/math 整区
//     一律单 token 逐字节透传 —— 转码/伪原创/实体化绝不进入这些区域;
//  4. 与浏览器解析口径对齐的关键点: "<" 后非标签起始字符按字面文本处理、
//     注释/伪注释吞到 EOF、属性值引号内的 ">" 不结束标签、非引号属性值
//     中的 "/" 属于值本身(script/style 的自闭合写法按规范忽略)。
//
// ============================================================
package stealth

import "strings"

// tokKind token 类别。
type tokKind uint8

const (
	tokText   tokKind = iota // 文本节点(转码/伪原创/实体化的作用面)
	tokMarkup                // 标记: 标签/注释/DOCTYPE/管线生成的 HTML 片段
	tokRaw                   // 逐字节透传区: raw text 内容 / pre / svg·math 整区
)

// token 单个 token。data 恒为源串(或生成串)的逐字节口径。
type token struct {
	kind    tokKind
	data    string
	name    string // 标签名(小写); 非标签 token 为空
	closing bool   // 闭标签
	self    bool   // 自闭合 "/>"(仅 svg/math 外来元素语义生效)
	// noInsert 表示该开标签与其后内容之间严禁插入任何字节
	// (script/style/textarea/pre 的 raw 内容、title 的 RCDATA 内容)。
	noInsert bool
	// isRawOpen 开标签后紧跟 tokRaw 内容(script/style/textarea/pre)。
	isRawOpen bool
	// isDoctype DOCTYPE/注释/伪注释(<! ... > 类)。
	isDoctype bool
	// isVoid void 元素(不参与深度栈)。
	isVoid bool
	// known 已知 HTML 标签白名单(大小写抖动只对白名单生效)。
	known bool
	// region svg/math 整区透传 token。
	region bool
}

// rawElems 内容按 raw text 逐字节透传的元素(script/style 为 HTML 规范
// raw text, textarea 为 RCDATA, pre 按任务约定整块 passthrough)。
var rawElems = map[string]bool{"script": true, "style": true, "textarea": true, "pre": true}

// rcdataOpen 内容仍是文本(可转码)但开标签后严禁插入字节的元素。
var rcdataOpen = map[string]bool{"title": true}

// voidElems HTML void 元素(深度栈不压入)。
var voidElems = map[string]bool{
	"area": true, "base": true, "br": true, "col": true, "embed": true,
	"hr": true, "img": true, "input": true, "link": true, "meta": true,
	"param": true, "source": true, "track": true, "wbr": true,
}

// knownTags 大小写抖动白名单(常用 HTML 标签; svg/math 家族不在此列)。
var knownTags = map[string]bool{
	"a": true, "abbr": true, "address": true, "article": true, "aside": true,
	"audio": true, "b": true, "bdi": true, "bdo": true, "blockquote": true,
	"body": true, "br": true, "button": true, "canvas": true, "caption": true,
	"cite": true, "code": true, "col": true, "colgroup": true, "data": true,
	"datalist": true, "dd": true, "del": true, "details": true, "dfn": true,
	"dialog": true, "div": true, "dl": true, "dt": true, "em": true,
	"embed": true, "fieldset": true, "figcaption": true, "figure": true,
	"footer": true, "form": true, "h1": true, "h2": true, "h3": true,
	"h4": true, "h5": true, "h6": true, "head": true, "header": true,
	"hgroup": true, "hr": true, "html": true, "i": true, "iframe": true,
	"img": true, "input": true, "ins": true, "kbd": true, "label": true,
	"legend": true, "li": true, "link": true, "main": true, "mark": true,
	"menu": true, "meta": true, "meter": true, "nav": true, "noscript": true,
	"object": true, "ol": true, "optgroup": true, "option": true,
	"output": true, "p": true, "param": true, "picture": true, "pre": true,
	"progress": true, "q": true, "rp": true, "rt": true, "ruby": true,
	"s": true, "samp": true, "script": true, "section": true, "select": true,
	"small": true, "source": true, "span": true, "strong": true,
	"style": true, "sub": true, "summary": true, "sup": true, "table": true,
	"tbody": true, "td": true, "template": true, "textarea": true,
	"tfoot": true, "th": true, "thead": true, "time": true, "title": true,
	"tr": true, "track": true, "u": true, "ul": true, "var": true,
	"video": true, "wbr": true,
}

func isAlphaByte(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z')
}

func isWsByte(b byte) bool {
	return b == ' ' || b == '\t' || b == '\n' || b == '\r' || b == '\f'
}

// lowerName 截取 [from, to) 内的标签名并小写化(ASCII; 名字段只含 ASCII)。
func lowerName(s string, from, to int) string {
	if to > len(s) {
		to = len(s)
	}
	if from < 0 || from > to {
		return ""
	}
	return strings.ToLower(s[from:to])
}

// tokenize 把 HTML 源串切成 token 序列。恒成功(极端输入 = 大 token 透传)。
func tokenize(src string) []token {
	toks := make([]token, 0, 64)
	n := len(src)
	i := 0
	textStart := -1
	flushText := func(end int) {
		if textStart >= 0 && end > textStart {
			toks = append(toks, token{kind: tokText, data: src[textStart:end]})
		}
		textStart = -1
	}
	for i < n {
		if src[i] != '<' {
			if textStart < 0 {
				textStart = i
			}
			i++
			continue
		}
		// src[i] == '<'
		if i+1 >= n { // 末尾孤立 '<' → 字面文本
			if textStart < 0 {
				textStart = i
			}
			i++
			continue
		}
		switch c := src[i+1]; {
		case c == '!': // 注释 / DOCTYPE / 伪注释
			flushText(i)
			if strings.HasPrefix(src[i:], "<!--") {
				end := strings.Index(src[i+4:], "-->")
				if end < 0 { // 未闭合注释吞到 EOF(浏览器同口径)
					toks = append(toks, token{kind: tokMarkup, data: src[i:], isDoctype: true})
					i = n
				} else {
					j := i + 4 + end + 3
					toks = append(toks, token{kind: tokMarkup, data: src[i:j], isDoctype: true})
					i = j
				}
			} else {
				j := scanBogusEnd(src, i+2)
				toks = append(toks, token{kind: tokMarkup, data: src[i:j], isDoctype: true})
				i = j
			}
		case c == '?': // 处理指令 → 伪注释吞到 '>'
			flushText(i)
			j := scanBogusEnd(src, i+2)
			toks = append(toks, token{kind: tokMarkup, data: src[i:j], isDoctype: true})
			i = j
		case c == '/':
			if i+2 < n && isAlphaByte(src[i+2]) {
				flushText(i)
				j := scanToTagEnd(src, i+2) // 闭标签属性垃圾一并吞到 '>'
				tk := token{kind: tokMarkup, data: src[i:j], closing: true,
					name: lowerName(src, i+2, tagNameEnd(src, i+2))}
				tk.known = knownTags[tk.name]
				toks = append(toks, tk)
				i = j
			} else if i+2 < n && src[i+2] == '>' { // "</>" 直通
				flushText(i)
				toks = append(toks, token{kind: tokMarkup, data: src[i : i+3]})
				i += 3
			} else { // "</ x" → 伪注释
				flushText(i)
				j := scanBogusEnd(src, i+2)
				toks = append(toks, token{kind: tokMarkup, data: src[i:j], isDoctype: true})
				i = j
			}
		case isAlphaByte(c): // 开标签
			flushText(i)
			nameEnd := tagNameEnd(src, i+1)
			name := lowerName(src, i+1, nameEnd)
			j, self := parseOpenTag(src, nameEnd)
			tk := token{kind: tokMarkup, data: src[i:j], name: name, self: self}
			tk.known = knownTags[name]
			tk.isVoid = voidElems[name]
			tk.noInsert = rawElems[name] || rcdataOpen[name]
			// HTML 规范: 自闭合标志仅 svg/math 外来元素生效; script/style/
			// textarea 的 "/" 被浏览器忽略, 内容恒为 raw(防变换进脚本源)。
			tk.isRawOpen = rawElems[name]
			toks = append(toks, tk)
			i = j
			if tk.isRawOpen {
				endIdx := findRawEnd(src, i, name)
				if endIdx > i {
					toks = append(toks, token{kind: tokRaw, data: src[i:endIdx]})
					i = endIdx
				}
			}
			if (name == "svg" || name == "math") && !self {
				regEnd := findForeignEnd(src, i, name)
				if regEnd > i {
					toks = append(toks, token{kind: tokRaw, data: src[i:regEnd], region: true})
					i = regEnd
				}
			}
		default: // "<" 后非标签起始 → 字面文本(浏览器同口径)
			if textStart < 0 {
				textStart = i
			}
			i++
		}
	}
	flushText(n)
	return toks
}

// renderTokens 重组装(与 tokenize 互逆, 除被变换阶段改写的 data 与插入 token)。
func renderTokens(toks []token) []byte {
	total := 0
	for i := range toks {
		total += len(toks[i].data)
	}
	out := make([]byte, 0, total)
	for i := range toks {
		out = append(out, toks[i].data...)
	}
	return out
}

// tagNameEnd 标签名结束位置(名字含字母数字及 '-'; HTML 名字段宽容口径)。
func tagNameEnd(src string, from int) int {
	i := from
	for i < len(src) {
		b := src[i]
		if isWsByte(b) || b == '>' || b == '/' || b == '<' {
			break
		}
		i++
	}
	return i
}

// parseOpenTag 开标签属性区状态机: 返回 '>' 之后下标与自闭合判定。
// 关键口径(与浏览器一致): 引号内 '>' 不结束标签; 非引号值中的 '/' 属于
// 值本身(<a href=/x/> 不是自闭合); 自闭合 = '/' 紧邻 '>' 且不在值内。
// 未闭合标签吞到 EOF。
func parseOpenTag(src string, from int) (end int, self bool) {
	i := from
	for i < len(src) {
		b := src[i]
		if isWsByte(b) {
			i++
			continue
		}
		if b == '>' {
			return i + 1, false
		}
		if b == '/' {
			if i+1 < len(src) && src[i+1] == '>' {
				return i + 2, true
			}
			i++ // 孤立 '/' 忽略
			continue
		}
		// 属性名: 吞到 空白/'='/'>'/'/'
		for i < len(src) && !isWsByte(src[i]) && src[i] != '=' && src[i] != '>' && src[i] != '/' {
			i++
		}
		if i < len(src) && src[i] == '=' {
			i++
			for i < len(src) && isWsByte(src[i]) {
				i++
			}
			if i < len(src) && (src[i] == '"' || src[i] == '\'') {
				q := src[i]
				k := strings.IndexByte(src[i+1:], q)
				if k < 0 {
					return len(src), false
				}
				i += k + 2
			} else { // 非引号值: 吞到空白或 '>'(值内 '/' 合法)
				for i < len(src) && !isWsByte(src[i]) && src[i] != '>' {
					i++
				}
			}
		}
	}
	return len(src), false
}

// scanToTagEnd 闭标签/伪注释体宽容扫描(引号内 '>' 不结束; 未闭合吞到 EOF)。
func scanToTagEnd(src string, from int) int {
	i := from
	for i < len(src) {
		b := src[i]
		if b == '"' {
			k := strings.IndexByte(src[i+1:], '"')
			if k < 0 {
				return len(src)
			}
			i += k + 2
			continue
		}
		if b == '\'' {
			k := strings.IndexByte(src[i+1:], '\'')
			if k < 0 {
				return len(src)
			}
			i += k + 2
			continue
		}
		if b == '>' {
			return i + 1
		}
		i++
	}
	return len(src)
}

// scanBogusEnd DOCTYPE/伪注释体: 引号内 '>' 不结束(DOCTYPE 内部子集兼容)。
func scanBogusEnd(src string, from int) int {
	return scanToTagEnd(src, from)
}

// findRawEnd raw text 内容结束点 = "</name" 后随 空白/'/'/'>'/EOF 的首个
// 匹配(大小写不敏感)。返回内容结束下标(即 "</" 处); 找不到 → len(src)。
func findRawEnd(src string, from int, name string) int {
	for i := from; i+1 < len(src); i++ {
		if src[i] != '<' || src[i+1] != '/' {
			continue
		}
		ne := tagNameEnd(src, i+2)
		if !strings.EqualFold(src[i+2:ne], name) {
			continue
		}
		if ne >= len(src) {
			return i
		}
		b := src[ne]
		if isWsByte(b) || b == '>' || b == '/' {
			return i
		}
	}
	return len(src)
}

// findForeignEnd svg/math 整区结束点(嵌套计数, 大小写不敏感; 外来自闭合
// 不增层)。返回匹配闭标签 '>' 之后下标; 找不到 → len(src)。
func findForeignEnd(src string, from int, name string) int {
	depth := 1
	openTag := "<" + name
	closeTag := "</" + name
	for i := from; i < len(src); {
		if src[i] != '<' {
			i++
			continue
		}
		if i+1 < len(src) && (src[i+1] == '/' || isAlphaByte(src[i+1])) {
			isClose := src[i+1] == '/'
			cand := openTag
			if isClose {
				cand = closeTag
			}
			if i+len(cand) <= len(src) && strings.EqualFold(src[i:i+len(cand)], cand) {
				ne := i + len(cand)
				if ne >= len(src) || isWsByte(src[ne]) || src[ne] == '>' || src[ne] == '/' {
					if isClose {
						end := scanToTagEnd(src, ne)
						depth--
						if depth == 0 {
							return end
						}
						i = end
						continue
					}
					end, self2 := parseOpenTag(src, ne)
					if !self2 {
						depth++
					}
					i = end
					continue
				}
			}
		}
		i++
	}
	return len(src)
}
