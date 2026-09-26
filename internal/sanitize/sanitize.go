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
	selfCloseRe = regexp.MustCompile(`(?is)<(script|style|noscript|iframe|object|embed|template|form|input|button|base|area|link|meta)\b[^>]*/?>`)
	closeTagRe  = regexp.MustCompile(`(?is)</(script|style|noscript|iframe|object|embed|template|form|input|button|base|area|link|meta)\s*>`)
	tagSpanRe   = regexp.MustCompile(`<[a-zA-Z](?:"[^"]*"|'[^']*'|` + "`" + `[^` + "`" + `]*` + "`" + `|[^>])*>`)
	onAttrRe    = regexp.MustCompile(`(?i)[\s/]+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|` + "`" + `[^` + "`" + `]*` + "`" + `|[^\s>]+)`)
	// [R71-b] 属性面扩容: +srcset/cite/ping —— 修前 srcset 完全穿透消毒面(<img srcset="javascript:..."> 原样保留, 探针实证; 浏览器虽不执行 srcset 中的 js: URL, 属性值整段入库属纵深防御缺口)。
	urlAttrRe     = regexp.MustCompile(`(?i)[\s/]+(?:href|src|srcset|cite|ping|action|xlink:href|poster|background|data|dynsrc|lowsrc)\s*=\s*(?:"[^"]*"|'[^']*'|` + "`" + `[^` + "`" + `]*` + "`" + `|[^\s>]+)`)
	decHexRe      = regexp.MustCompile(`(?i)&#x([0-9a-f]+);?`)
	decDecRe      = regexp.MustCompile(`&#([0-9]+);?`)
	decNamedRe    = regexp.MustCompile(`(?i)&(tab|newline|colon|sol|semi);`)
	schemeProbeRe = regexp.MustCompile(`^([a-zA-Z][a-zA-Z0-9+.\-]*):`)
)

// decodeCharRefsOnce 字符引用单遍解码(仅探测用, 幂等): 数字实体(十/十六, 兼容无分号形态)
// + URL 走私相关命名实体(tab/newline/colon/sol/semi)。非法/代理区段码点丢空。
// [R69-c] 修前按 m[3:len(m)-1] / m[2:len(m)-1] 取数字段 —— 隐含「末字符必为 ;」假设;
// 无分号形态(&#58 / &#x3a, HTML5 属性值中数字实体本就免分号合法)会把末位数字当分号
// 剥掉, 解码出错误码点(javascript&#58 → "javascript\x05"), scheme 探测失配 → 危险
// URL fail-open 直通浏览器(浏览器侧解码正确)。改为仅在有分号时剥分号。
func decodeCharRefsOnce(s string) string {
	if !strings.Contains(s, "&#") && !strings.Contains(s, "&") {
		return s
	}
	s = decHexRe.ReplaceAllStringFunc(s, func(m string) string {
		digits := m[3:]
		if strings.HasSuffix(digits, ";") {
			digits = digits[:len(digits)-1]
		}
		code, err := strconv.ParseInt(digits, 16, 64)
		if err != nil || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) {
			return ""
		}
		return string(rune(code))
	})
	s = decDecRe.ReplaceAllStringFunc(s, func(m string) string {
		digits := m[2:]
		if strings.HasSuffix(digits, ";") {
			digits = digits[:len(digits)-1]
		}
		code, err := strconv.ParseInt(digits, 10, 64)
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
// [R71-b] 修前 scheme 按原样与 "http"/"https" 精确比较 —— 大写形态("HTTP://X.COM",
// 浏览器合法 scheme, 写侧 clean.isHTTPURL 亦 ToLower 放行)被误判 unsafe 整属性剥离,
// 出链 href 丢失; 修后 scheme 小写归一后比对(白名单语义不变, javascript: 等
// 大小写走私本就落在 else 拦截臂)。
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
	switch strings.ToLower(m[1]) {
	case "http", "https":
		return true
	}
	return false
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
			// [R71-b] srcset 多候选形态: 逗号分段后逐段首 token 复验(单段 scheme
			// 检查只看整体起点, "a.jpg 1x, javascript:x 2x" 类混合候选漏判)。
			// 任一段不安全 → 整属性剥离(与白名单外整属性剥离同口径)。
			if strings.EqualFold(strings.TrimSpace(m[:eq]), "srcset") {
				for _, seg := range strings.Split(raw, ",") {
					tok := strings.TrimSpace(seg)
					if i := strings.IndexAny(tok, " \t\n\r"); i >= 0 {
						tok = tok[:i]
					}
					if tok != "" && !IsSafeURLValue(tok) {
						return ""
					}
				}
			}
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
