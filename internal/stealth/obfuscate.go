// ============================================================
// R70-c2 — 结构混淆阶段(obfuscate, 管线第 4 拍)
//
// 70-c 断连遗留: stealth.go:131 调用 obfuscateTokens 但全包无实现(包不编译),
// 本文件按 stealth.go 头注契约补齐六子变换:
//
//	注释     空隙处插入无语义 HTML 注释(随机 hex)
//	幽灵元素 安全块级开标签后插入 <i style="display:none"></i> 族(空内容不可见)
//	空白抖动 纯空白文本 token 增生空白(white-space:normal 下渲染等价)
//	属性重排 开标签属性乱序(HTML 属性序无语义; 重名属性跳过防 first-wins 翻转)
//	大小写   已知标签名大小写抖动(HTML 名大小写不敏感)
//	低频实体化 文本节点 ASCII 字母数字低频实体化(&#x61; 渲染恒等 'a')
//
// 硬边界: script/style/textarea/pre 与 svg/math 整区、属性值、title(RCDATA)
// 内容一律逐字节不动 —— 注释/幽灵元素绝不插到 noInsert 开标签之后(那会落进
// raw 源码内); 大小写/属性重排排除 noInsert 开标签; 上一 token 为开标签且
// 下一 token 是 raw/region 时禁插(svg/math 区域内插注释会破坏结构)。
// 全部变换只改字节序形态, 可见文本与可见外观与原文档一致。
// ============================================================
package stealth

import (
	"math/rand"
	"strings"
	"unicode/utf8"
)

// 混淆注入总量钳制(防超长文档字节膨胀)。
const (
	obfCommentCap = 20 // 注释上限
	obfGhostCap   = 10 // 幽灵元素上限
	obfWsCap      = 32 // 空白抖动上限
)

// ghostAfter 幽灵元素只插在这些块级容器开标签之后(内容上下文宽容,
// 不落 html/head/表格严格区/select 族, 规避浏览器重排/隐式 li 计数等语义面)。
var ghostAfter = map[string]bool{
	"p": true, "div": true, "li": true, "dd": true, "dt": true, "td": true,
	"th": true, "caption": true, "h1": true, "h2": true, "h3": true, "h4": true,
	"h5": true, "h6": true, "blockquote": true, "section": true, "article": true,
	"aside": true, "header": true, "footer": true, "main": true, "figure": true,
	"figcaption": true, "address": true, "details": true, "summary": true,
	"fieldset": true, "form": true, "center": true,
}

// ghostElems 幽灵元素形态池(空内容 + display:none, 对渲染零贡献)。
var ghostElems = []string{
	`<i style="display:none"></i>`,
	`<b style="display:none"></b>`,
	`<u style="display:none"></u>`,
	`<em style="display:none"></em>`,
	`<span style="display:none"></span>`,
}

// obfuscateTokens 结构混淆入口(管线末拍; 就地改写 + 切片注入)。
func obfuscateTokens(toks []token, r *rand.Rand) []token {
	toks = obfTextNoise(toks, r)
	toks = obfTagShape(toks, r)
	toks = obfInject(toks, r)
	return toks
}

// ---------------- ① 空白抖动 + 低频 ASCII 实体化(文本节点) ----------------

// obfTextNoise 文本节点两件事: 纯空白 token 增生(抖动)与 ASCII 字母数字
// 低频实体化。title(RCDATA)内容 = 紧跟 noInsert 开标签的文本 token 一律跳过。
func obfTextNoise(toks []token, r *rand.Rand) []token {
	grown := 0
	for idx := range toks {
		if toks[idx].kind != tokText || toks[idx].data == "" {
			continue
		}
		if idx > 0 && toks[idx-1].noInsert {
			continue // title/RCDATA 内容逐字节不动
		}
		if isAllWhitespace(toks[idx].data) {
			// 空白抖动: white-space:normal 下任意空白连串渲染为一个可折叠空格,
			// 增生空白不改变外观; pre/textarea 是 raw token 天然到不了这里。
			if grown < obfWsCap && r.Intn(6) == 0 {
				toks[idx].data += wsChar(r)
				grown++
			}
			continue
		}
		toks[idx].data = asciiEntityText(toks[idx].data, r)
	}
	return toks
}

// isAllWhitespace 串内全是 HTML 空白字符。
func isAllWhitespace(s string) bool {
	for i := 0; i < len(s); i++ {
		if !isWsByte(s[i]) {
			return false
		}
	}
	return true
}

// wsChar 抖动用空白字符池(均为 HTML 空白, 折叠语义相同)。
func wsChar(r *rand.Rand) string {
	switch r.Intn(3) {
	case 0:
		return " "
	case 1:
		return "\n"
	default:
		return "\t"
	}
}

// asciiEntityText 低频实体化 ASCII 字母数字(概率 2%/字符, hex/dec 随机)。
// 字符引用在文本节点渲染恒等于原字符 → 可见文本零变化; CJK 归 transcode 管。
// [R70-c 真虫修复] 既有字符引用整体保真跳过: transcode 先行时文本节点已含
// &#x4E0A; 形态引用, 修前会把引用内部的 x/4/E/0/A 当普通 ASCII 再实体化,
// 破坏引用结构 → 浏览器渲染出字面乱码(外观破坏级 bug)。
// [R71-c 真虫修复] 同类残余: HTML5 legacy 无分号命名引用(&amp/&nbsp/&copy 等
// 在文本上下文同样被浏览器解码)修前不被 entityRefLen 认领, 引用内部字母被二次
// 实体化(&amp → &&#97;mp)→ 引用失配 → 浏览器渲染字面 "amp"(可见文本漂移,
// 探针实证 600 轮 139 漂移)。修后 '&' 后跟 '#' 或字母数字时整段引用形参照抄
// (编码更少 = 保守方向, 浏览器解码语义逐字节不变)。
// [R72-c 真虫修复] 透传分支 WriteRune(c) → 照抄原始字节切片: 非法 UTF-8 字节
// (采集残留 GBK 碎片等)经 DecodeRune 得 RuneError, 修前被改写成 U+FFFD 三字节
// 序列, 同节点任一 ASCII 字母被实体化时重建串即丢原始字节(浏览器对非法序列
// 折叠渲染 1 个替换符, 修前展开多个 → 外观漂移); 修后非实体化字符恒原样照抄。
func asciiEntityText(s string, r *rand.Rand) string {
	var b strings.Builder
	changed := false
	b.Grow(len(s) + 8)
	for i := 0; i < len(s); {
		c, sz := utf8.DecodeRuneInString(s[i:])
		if c == '&' {
			if n := entityRefLen(s[i:]); n > 0 {
				b.WriteString(s[i : i+n])
				i += n
				continue
			}
			// 不完整/legacy 引用形: '&' 起的潜在引用前缀(&#x…/#…/字母段)整段照抄,
			// 内部字母绝不实体化(修前 &amp 的 a/m/p 各 2% 被编码, 破坏浏览器解码)。
			if i+1 < len(s) && (s[i+1] == '#' || isASCIILetterDigit(rune(s[i+1]))) {
				j := i + 1
				if s[j] == '#' {
					j++
					if j < len(s) && (s[j] == 'x' || s[j] == 'X') {
						j++
					}
				}
				for j < len(s) && isASCIILetterDigit(rune(s[j])) {
					j++
				}
				b.WriteString(s[i:j])
				i = j
				continue
			}
		}
		if isASCIILetterDigit(c) && r.Intn(50) == 0 {
			if r.Intn(2) == 0 {
				b.WriteString("&#x")
				b.WriteString(hexLower(uint64(c)))
			} else {
				b.WriteString("&#")
				b.WriteString(itoaDec(int(c)))
			}
			b.WriteByte(';')
			changed = true
			i += sz
			continue
		}
		b.WriteString(s[i : i+sz]) // [R72-c] 原始字节照抄(非法 UTF-8 同样保真)
		i += sz
	}
	if !changed {
		return s
	}
	return b.String()
}

// entityRefLen s 开头是完整字符引用时返回其字节长度, 否则 0。
// 口径: &#xHEX; / &#DEC; / &NAME;(带分号), 以及 HTML5 合法的无分号数字引用
// (与 sanitize/R69-C 的浏览器贪婪解码口径对齐); 无分号字母名不认(保守少编码)。
func entityRefLen(s string) int {
	if len(s) < 3 || s[0] != '&' {
		return 0
	}
	if s[1] == '#' {
		i := 2
		if i < len(s) && (s[i] == 'x' || s[i] == 'X') {
			i++
			for i < len(s) && isHexByte(s[i]) {
				i++
			}
		} else {
			for i < len(s) && s[i] >= '0' && s[i] <= '9' {
				i++
			}
		}
		if i > 2 && i < len(s) && s[i] == ';' {
			return i + 1
		}
		if i > 2 { // 无分号数字引用(浏览器吞到非数字止)
			return i
		}
		return 0
	}
	i := 1
	for i < len(s) && isASCIILetterDigit(rune(s[i])) {
		i++
	}
	if i > 1 && i < len(s) && s[i] == ';' {
		return i + 1
	}
	return 0
}

// isHexByte ASCII 十六进制字符。
func isHexByte(c byte) bool {
	return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

// isASCIILetterDigit ASCII 字母或数字(实体化作用面; 多字节 rune 恒 false)。
func isASCIILetterDigit(c rune) bool {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
}

// hexLower 非负整数小写 hex(实体化 hex 形态用; 避免引 fmt 开销)。
func hexLower(v uint64) string {
	if v == 0 {
		return "0"
	}
	const digits = "0123456789abcdef"
	var buf [16]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = digits[v&0xf]
		v >>= 4
	}
	return string(buf[i:])
}

// itoaDec 非负整数十进制串。
func itoaDec(v int) string {
	if v == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	return string(buf[i:])
}

// ---------------- ② 属性重排 + 标签名大小写抖动(开标签) ----------------

// obfTagShape 开标签形态抖动。属性重排先扫片段(引号感知), 重名属性跳过
// (HTML 重复属性 first-wins, 乱序会翻转生效值); 大小写只对白名单已知标签。
// script/style/textarea/pre/title 开标签(noInsert)整段跳过防手滑破坏 raw 源。
func obfTagShape(toks []token, r *rand.Rand) []token {
	for idx := range toks {
		tk := &toks[idx]
		if tk.kind != tokMarkup || tk.closing || tk.isDoctype || tk.name == "" {
			continue
		}
		if tk.noInsert || !tk.known || !strings.HasPrefix(tk.data, "<") {
			continue
		}
		nameEnd := tagNameEnd(tk.data, 1)
		// 大小写抖动(等长改写, 不动属性区): 1/12 概率。
		if r.Intn(12) == 0 {
			tk.data = "<" + jitterCase(tk.data[1:nameEnd], r) + tk.data[nameEnd:]
		}
		// 属性重排: ≥2 个不重名属性, 1/4 概率。
		if r.Intn(4) != 0 {
			continue
		}
		spans, names, selfCut, ok := scanAttrSpans(tk.data, nameEnd)
		if !ok || len(spans) < 2 || hasDupString(names) {
			continue
		}
		tk.data = rebuildTag(tk.data, nameEnd, spans, selfCut, r)
	}
	return toks
}

// jitterCase 标签名大小写抖动(逐字母随机; 长度恒等 → data 其余段下标不变)。
func jitterCase(name string, r *rand.Rand) string {
	var b strings.Builder
	b.Grow(len(name))
	for i := 0; i < len(name); i++ {
		c := name[i]
		if c >= 'a' && c <= 'z' {
			if r.Intn(2) == 0 {
				c -= 'a' - 'A'
			}
		} else if c >= 'A' && c <= 'Z' {
			if r.Intn(2) == 0 {
				c += 'a' - 'A'
			}
		}
		b.WriteByte(c)
	}
	return b.String()
}

// scanAttrSpans 扫描开标签属性区(data 相对下标): 返回每个属性完整片段
// (含属性名/=/值/引号, 不含前导空白)、名字表、'>' 前是否有孤立 '/'(自闭合尾)。
// 口径与 tokenizer.parseOpenTag 一致: 引号内 '>'/空白不切分, 非引号值内 '/'
// 属于值; 未闭合引号视为畸形返回 ok=false(保守跳过)。
func scanAttrSpans(data string, from int) (spans [][2]int, names []string, selfCut bool, ok bool) {
	i := from
	n := len(data)
	for i < n {
		c := data[i]
		if isWsByte(c) {
			i++
			continue
		}
		if c == '>' {
			return spans, names, false, true
		}
		if c == '/' {
			// 值外 '/': parseOpenTag 语义为孤立 '/' 忽略, 紧邻 '>' 即自闭合尾。
			if i+1 < n && data[i+1] == '>' {
				return spans, names, true, true
			}
			i++
			continue
		}
		// 属性名: 吞到 空白/'='/'>'/'/'
		start := i
		for i < n && !isWsByte(data[i]) && data[i] != '=' && data[i] != '>' && data[i] != '/' {
			i++
		}
		nameEnd := i // [R71-c] 重名检测按属性名本体(修前整片段含值, 同名异值漏判)
		if i < n && data[i] == '=' {
			i++
			for i < n && isWsByte(data[i]) {
				i++
			}
			if i < n && (data[i] == '"' || data[i] == '\'') {
				q := data[i]
				k := strings.IndexByte(data[i+1:], q)
				if k < 0 {
					return nil, nil, false, false // 未闭合引号 → 畸形, 不动
				}
				i += k + 2
			} else { // 非引号值: 吞到空白或 '>'
				for i < n && !isWsByte(data[i]) && data[i] != '>' {
					i++
				}
			}
		}
		spans = append(spans, [2]int{start, i})
		names = append(names, strings.ToLower(data[start:nameEnd]))
	}
	return nil, nil, false, false // '>' 缺失(理论不该发生) → 畸形
}

// hasDupString 重名检测(小写化后; 重复属性 first-wins, 重排会翻转语义 → 跳过)。
func hasDupString(xs []string) bool {
	for i := range xs {
		for j := i + 1; j < len(xs); j++ {
			if xs[i] == xs[j] {
				return true
			}
		}
	}
	return false
}

// rebuildTag 属性乱序重组: `<原名 attr…[/]>`(属性间单空格; 自闭合尾前补空格,
// 防前项非引号值被 '/' 粘连改值)。值片段逐字节原样 → 语义恒等。
func rebuildTag(data string, nameEnd int, spans [][2]int, selfCut bool, r *rand.Rand) string {
	var b strings.Builder
	b.WriteString("<")
	b.WriteString(data[1:nameEnd])
	order := r.Perm(len(spans))
	for _, oi := range order {
		b.WriteByte(' ')
		b.WriteString(data[spans[oi][0]:spans[oi][1]])
	}
	if selfCut {
		b.WriteString(" />")
	} else {
		b.WriteString(">")
	}
	return b.String()
}

// ---------------- ③ 注释 + 幽灵元素注入 ----------------

// obfInject 空隙注入(注释/幽灵元素)。插入点=「开标签之后」: 严禁 noInsert
// 开标签(script/style/textarea/pre/title 内容区)与下一 token 为 raw/region
// (svg/math 整区)的位置; 幽灵元素另限 ghostAfter 白名单容器。注释额外允许
// 闭标签/DOCTYPE 之后。全部经新切片重组(同 interfere.applyInsertions 口径)。
func obfInject(toks []token, r *rand.Rand) []token {
	type insAt struct {
		idx  int
		html string
	}
	var ins []insAt
	comments, ghosts := 0, 0
	for idx := range toks {
		tk := &toks[idx]
		if tk.kind != tokMarkup {
			continue
		}
		if idx+1 < len(toks) && toks[idx+1].kind == tokRaw {
			continue // raw 内容紧随(svg/math/script 区内禁插)
		}
		eligible := false
		ghostOK := false
		switch {
		case tk.isDoctype:
			eligible = true // DOCTYPE/伪注释之后
		case tk.closing && tk.name != "":
			eligible = true // 闭标签之后
		case !tk.closing && tk.name != "" && !tk.noInsert:
			eligible = true
			ghostOK = ghostAfter[tk.name]
		}
		if !eligible {
			continue
		}
		if ghostOK && ghosts < obfGhostCap && r.Intn(16) == 0 {
			ins = append(ins, insAt{idx: idx, html: ghostElems[r.Intn(len(ghostElems))]})
			ghosts++
			continue
		}
		if comments < obfCommentCap && r.Intn(10) == 0 {
			ins = append(ins, insAt{idx: idx, html: `<!-- sj:` + hexRand(r, 8) + ` -->`})
			comments++
		}
	}
	if len(ins) == 0 {
		return toks
	}
	out := make([]token, 0, len(toks)+len(ins))
	next := 0
	for idx := range toks {
		out = append(out, toks[idx])
		if next < len(ins) && ins[next].idx == idx {
			out = append(out, token{kind: tokMarkup, data: ins[next].html})
			next++
		}
	}
	return out
}
