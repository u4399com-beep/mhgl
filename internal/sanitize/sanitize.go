// ============================================================
// 章节正文展示级消毒(公共包) — 对齐 TS read-layouts/shared.tsx sanitizeReaderHtml R33 口径
//
// [R67-c] 自 internal/web/seo.go 下沉为公共包: /api/public/chapter 输出面与前台
// SSR readHTML 需要同一层「展示级纵深」防线, 而 api 包不宜 import web(SSR 层)。
// 数据源为爬虫抓取的外部站内容(不可信), 本消毒器为写侧清洗链之后的最后兜底:
//
//  1. 危险块级标签连内容整段剥离(script/style/noscript/iframe/object/embed/template + form/input/button)
//  2. on* 事件属性剥离(属性分隔符含 "/", HTML5 tokenizer 中 <img/src=x/onerror=y> 斜杠等价空白)
//  3. href/src(及 action 等出链属性) scheme 白名单: 探测值先做单遍字符引用解码 + 剥 \t\n\r +
//     剥首尾 C0 控制符/空格(浏览器 URL 解析同口径), 仅 http/https 与无 scheme 相对地址放行
//     (javascript:/vbscript:/data: 及 jav&#x09;ascript: / javascript&#58; 等全部编码变体拦截)
//  4. 标签 span 识别感知引号(alt=">" 等属性值含 > 时不再提前截断闭合边界)
//
// ============================================================
package sanitize

import (
	"regexp"
	"strconv"
	"strings"
)

// stripBlockRes 块级危险标签连内容剥离(RE2 无反向引用, 逐标签编译; |$ 兼容未闭合块到 EOF)。
var stripBlockRes = []*regexp.Regexp{
	regexp.MustCompile(`(?is)<script\b[^>]*>.*?(</script\s*>|$)`),
	regexp.MustCompile(`(?is)<style\b[^>]*>.*?(</style\s*>|$)`),
	regexp.MustCompile(`(?is)<noscript\b[^>]*>.*?(</noscript\s*>|$)`),
	regexp.MustCompile(`(?is)<iframe\b[^>]*>.*?(</iframe\s*>|$)`),
	regexp.MustCompile(`(?is)<object\b[^>]*>.*?(</object\s*>|$)`),
	regexp.MustCompile(`(?is)<embed\b[^>]*>.*?(</embed\s*>|$)`),
	regexp.MustCompile(`(?is)<template\b[^>]*>.*?(</template\s*>|$)`),
}

// StripBlocks 块级危险标签连内容剥离(plainText 摘要链与正文消毒共用)。
func StripBlocks(s string) string {
	for _, re := range stripBlockRes {
		s = re.ReplaceAllString(s, " ")
	}
	return s
}

var (
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

// IsSafeURLValue URL 属性值 scheme 白名单判定(TS isSafeUrlValue 同口径):
// 探测串剥 \t\n\r + 剥首尾 [\x00-\x20] 后, 无 scheme(相对/锚点)或 http/https 放行, 其余拦截。
func IsSafeURLValue(raw string) bool {
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
		if IsSafeURLValue(raw) {
			return m
		}
		return ""
	})
	return tag
}

// ChapterHTML 章节正文展示级消毒(幂等; 无需引号感知外正则时零分配直通)。
func ChapterHTML(s string) string {
	if s == "" {
		return ""
	}
	s = StripBlocks(s)
	s = selfCloseRe.ReplaceAllString(s, " ")
	s = closeTagRe.ReplaceAllString(s, " ")
	s = tagSpanRe.ReplaceAllStringFunc(s, sanitizeTagAttrs)
	return s
}
