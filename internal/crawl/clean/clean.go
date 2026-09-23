// ============================================================
// 内容清洗系统 —— src/lib/crawl/cleaner.ts(756 行)语义移植
// 语义权威: src/lib/crawl/cleaner.ts(R13/R21/R22/R25 历轮打磨资产)。
// 规则 clean 配置驱动(defaultConfig/FromRuleRaw 对齐 types.ts sanitizeCleanConfig);
// 消费方: bridge contents 回调(章节正文清洗)+ book 回调(intro/字段清洗)。
//
// 已知移植偏差(留档, 语义等价面见 worklog R55-3a):
//   - 繁体→简体(OpenCC t2s)不移植: Go 侧无 OpenCC 词典等价物, 简体源站零影响,
//     繁体源站正文保持原样入库(hasVariantChinese 检测层随之省略);
//   - 违禁词配置快照经 BannedWordsProvider 注入(bridge 侧接 store.Setting 60s TTL),
//     引擎纯函数面与 TS banned-words.ts 逐语义对齐。
//
// ============================================================
package clean

import (
	"encoding/json"
	"regexp"
	"strings"
	"sync"
	"unicode/utf8"
)

// Config 清洗配置(对齐 TS CleanConfig)
type Config struct {
	RemoveSelectors []string `json:"removeSelectors"`
	AdPatterns      []string `json:"adPatterns"`
	Whitelist       []string `json:"whitelist"`
	Normalize       bool     `json:"normalize"`
	PlainText       bool     `json:"plainText"`
}

// defaultConfig 缺省清洗配置(逐条对齐 types.ts DEFAULT_CLEAN_CONFIG)
func defaultConfig() Config {
	return Config{
		RemoveSelectors: []string{"script", "style", "iframe", "ins", "noscript", ".adsbygoogle", ".ad", "#ad"},
		AdPatterns: []string{
			`(www\.)?[a-z0-9-]+\.(com|net|cc|org|info|top|xyz|vip|site)(\/\S*)?`,
			`本章未完.*?点击下一页继续阅读`,
			`请记住本书.*?域名`,
			`最新章节请到.*?查看`,
			`[（(]?完?本[网站站][）)]?`,
			`一秒记住.*?免费读`,
		},
		Whitelist: []string{"p", "br", "b", "strong", "em", "i", "u", "h1", "h2", "h3", "h4", "h5", "h6"},
		Normalize: true,
		PlainText: false,
	}
}

// safeStrArr 对齐 types.ts safeStrArr: 仅字符串项保留(截断 maxLen), 上限 maxCount 条
func safeStrArr(v []string, maxCount, maxLen int) []string {
	if len(v) == 0 {
		return nil
	}
	out := make([]string, 0, len(v))
	for _, s := range v {
		if s == "" {
			continue
		}
		if len(out) >= maxCount {
			break
		}
		out = append(out, truncateRunes(s, maxLen))
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func truncateRunes(s string, max int) string {
	if max <= 0 {
		return ""
	}
	n := 0
	for i := range s {
		if n == max {
			return s[:i]
		}
		n++
	}
	return s
}

// jsonUnmarshal 包内 JSON 解析小封装(FromRuleRaw 消费; 与 store 层通用件解耦,
// clean 为纯函数包不反向依赖 store)。
func jsonUnmarshal(data []byte, v any) error {
	return json.Unmarshal(data, v)
}

// FromRuleRaw 规则 config JSON → 清洗配置(对齐 parseRuleConfig + sanitizeCleanConfig):
// clean 段缺失/非对象 → 整段缺省; 各字段缺失 → 字段缺省(safeStrArr 钳制 + 白名单小写化)。
func FromRuleRaw(raw []byte) Config {
	def := defaultConfig()
	if len(raw) == 0 {
		return def
	}
	var root struct {
		Clean *struct {
			RemoveSelectors []string `json:"removeSelectors"`
			AdPatterns      []string `json:"adPatterns"`
			Whitelist       []string `json:"whitelist"`
			Normalize       *bool    `json:"normalize"`
			PlainText       *bool    `json:"plainText"`
		} `json:"clean"`
	}
	if err := jsonUnmarshal(raw, &root); err != nil || root.Clean == nil {
		return def
	}
	c := root.Clean
	out := Config{
		RemoveSelectors: def.RemoveSelectors,
		AdPatterns:      def.AdPatterns,
		Whitelist:       def.Whitelist,
		Normalize:       true,
		PlainText:       false,
	}
	if rs := safeStrArr(c.RemoveSelectors, 30, 300); rs != nil {
		out.RemoveSelectors = rs
	}
	if ap := safeStrArr(c.AdPatterns, 30, 1000); ap != nil {
		out.AdPatterns = ap
	}
	if wl := safeStrArr(c.Whitelist, 30, 20); wl != nil {
		list := make([]string, 0, len(wl))
		for _, t := range wl {
			t = strings.ToLower(strings.TrimSpace(t))
			if t != "" {
				list = append(list, t)
			}
		}
		if len(list) > 0 {
			out.Whitelist = list
		}
	}
	if c.Normalize != nil {
		out.Normalize = *c.Normalize
	}
	if c.PlainText != nil {
		out.PlainText = *c.PlainText
	}
	return out
}

// ---------------- 通用字符面(与 cleaner.ts 同名常量逐条对齐) ----------------

// CTRL_CHARS_RE 控制字符剥离(\t\n\r 保留)
var ctrlCharsRe = regexp.MustCompile("[\x00-\x08\x0B\x0C\x0E-\x1F]")

// INVISIBLE_CHARS_RE 不可见 Unicode 剥离(零宽/方向标记/双向控制/词连接器/软连字符/BOM)
var invisibleCharsRe = regexp.MustCompile("[\u00ad\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]")

// UNICODE_SPACE_RE Unicode 空格家族(不含行终止符与 \t; 行级归一为普通空格)
var unicodeSpaceRe = regexp.MustCompile("[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]")

// JS_SPACE_RE JS \s 全集(含行终止符/BOM; 用于 cleanTextField 的 \s+→' ' 归一)
var jsSpaceRe = regexp.MustCompile("[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+")

// contentBlockTags 内容块级标签集合(R13-2)
var contentBlockTags = map[string]struct{}{
	"p": {}, "div": {}, "li": {}, "ul": {}, "ol": {}, "tr": {}, "td": {}, "th": {}, "table": {},
	"thead": {}, "tbody": {}, "tfoot": {}, "h1": {}, "h2": {}, "h3": {}, "h4": {}, "h5": {}, "h6": {},
	"section": {}, "article": {}, "header": {}, "footer": {}, "aside": {}, "nav": {},
	"blockquote": {}, "pre": {}, "form": {}, "dl": {}, "dt": {}, "dd": {}, "figure": {},
	"figcaption": {}, "main": {}, "center": {}, "hr": {},
}

func isBlockTag(tag string) bool {
	_, ok := contentBlockTags[tag]
	return ok
}

// tagAlt 构造 (?:p|div|...) 交替段(排序固定保证与 TS 集合等价的确定性)
func tagAlt(tags []string) string {
	return strings.Join(tags, "|")
}

var blockTagList = []string{"p", "div", "li", "ul", "ol", "tr", "td", "th", "table", "thead", "tbody", "tfoot",
	"h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "header", "footer",
	"aside", "nav", "blockquote", "pre", "form", "dl", "dt", "dd", "figure", "figcaption", "main", "center", "hr"}

// contentBlockTagLinebreakRe 块级标签(开+闭)边界 → \n(R21-c-3)
var contentBlockTagLinebreakRe = regexp.MustCompile(`(?i)</?(?:` + tagAlt(blockTagList) + `)\b[^>]*>`)

// tagQuoteAwareRe 引号感知标签剥离(R21-c-4: '>' 位于引号属性值内时不终结标签)
var tagQuoteAwareRe = regexp.MustCompile(`<(?:[^>"']|"[^"]*"|'[^']*')*>`)

// tagNaiveRe 裸剥兜底
var tagNaiveRe = regexp.MustCompile(`<[^>]+>`)

// stripHtmlTags 剥离全部 HTML 标签(引号感知 + 裸剥兜底)
func stripHtmlTags(html string) string {
	return tagNaiveRe.ReplaceAllString(tagQuoteAwareRe.ReplaceAllString(html, ""), "")
}

// brRe br 带属性形态(R22-b-3: <br class="x"> 同样换行)
var brRe = regexp.MustCompile(`(?i)<\s*br\b[^>]*>`)

// dangerousOpen 危险标签整段剥除(R5-16 截断未闭合形态; per-tag 展开 RE2 无反向引用)
var dangerousTags = []string{"script", "style", "noscript", "iframe", "object", "embed"}
var dangerousPairRes = func() []*regexp.Regexp {
	out := make([]*regexp.Regexp, 0, len(dangerousTags))
	for _, t := range dangerousTags {
		out = append(out, regexp.MustCompile(`(?i)<`+t+`\b[^>]*>[\s\S]*?</`+t+`\s*>`))
	}
	return out
}()
var dangerousSelfRe = regexp.MustCompile(`(?i)<(?:` + tagAlt(dangerousTags) + `)\b[^>]*>[\s\S]*$`)
var dangerousSelfCloseRe = regexp.MustCompile(`(?i)<(?:` + tagAlt(dangerousTags) + `)\b[^>]*/>`)

// htmlToPlainLines HTML → 带换行纯文本([R21-c-3] cleanContentHtml 纯文本模式单一实现;
// 输出不 trim, 按行消费的调用方自行处理)
func htmlToPlainLines(html string) string {
	if html == "" {
		return ""
	}
	text := crlfRe.ReplaceAllString(html, "\n")
	for _, re := range dangerousPairRes {
		text = re.ReplaceAllString(text, " ")
	}
	text = dangerousSelfCloseRe.ReplaceAllString(text, " ")
	text = dangerousSelfRe.ReplaceAllString(text, " ")
	text = brRe.ReplaceAllString(text, "\n")
	text = contentBlockTagLinebreakRe.ReplaceAllString(text, "\n")
	out := decodeEntitiesOnce(stripHtmlTags(text))
	out = ctrlCharsRe.ReplaceAllString(out, "")
	out = invisibleCharsRe.ReplaceAllString(out, "")
	return out
}

var crlfRe = regexp.MustCompile(`\r\n?`)

// ---------------- 实体单遍解码(防双重解码) ----------------

var entityRe = regexp.MustCompile(`(?i)&(?:nbsp|ensp|emsp|thinsp|amp|lt|gt|quot|apos|mdash|ndash|lsquo|rsquo|ldquo|rdquo|hellip|middot|bull|copy|reg|trade|deg|plusmn|times|divide|laquo|raquo|euro|pound|yen|cent|sect|para|frac12|frac14|frac34|sup2|sup3|larr|rarr|uarr|darr|harr|shy|zwsp|#x[0-9a-f]+|#[0-9]+);`)

var entityBasic = map[string]string{
	"nbsp": " ", "amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'",
	"ensp": "\u2002", "emsp": "\u3000", "thinsp": "\u2009", "mdash": "\u2014", "ndash": "\u2013",
	"lsquo": "\u2018", "rsquo": "\u2019", "ldquo": "\u201c", "rdquo": "\u201d", "hellip": "\u2026",
	"middot": "\u00b7", "bull": "\u2022", "copy": "\u00a9", "reg": "\u00ae", "trade": "\u2122",
	"deg": "\u00b0", "plusmn": "\u00b1", "times": "\u00d7", "divide": "\u00f7", "laquo": "\u00ab",
	"raquo": "\u00bb", "euro": "\u20ac", "pound": "\u00a3", "yen": "\u00a5", "cent": "\u00a2",
	"sect": "\u00a7", "para": "\u00b6", "frac12": "\u00bd", "frac14": "\u00bc", "frac34": "\u00be",
	"sup2": "\u00b2", "sup3": "\u00b3", "larr": "\u2190", "rarr": "\u2192", "uarr": "\u2191",
	"darr": "\u2193", "harr": "\u2194", "shy": "\u00ad", "zwsp": "\u200b",
}

// fromCodePointSafe 数字实体安全取码点(越界/孤立代理区返回空; R22-b-7)
func fromCodePointSafe(cp int) string {
	if cp < 0 || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF) {
		return ""
	}
	return string(rune(cp))
}

// decodeEntitiesOnce 实体单遍解码(白名单实体; 不回扫替换产物防链式二次解码)
func decodeEntitiesOnce(s string) string {
	return entityRe.ReplaceAllStringFunc(s, func(m string) string {
		key := strings.ToLower(m[1 : len(m)-1])
		if basic, ok := entityBasic[key]; ok {
			return basic
		}
		if strings.HasPrefix(key, "#x") {
			return fromCodePointSafe(parseHex(key[2:]))
		}
		if strings.HasPrefix(key, "#") {
			return fromCodePointSafe(parseIntDec(key[1:]))
		}
		return m
	})
}

func parseHex(s string) int {
	n := 0
	for _, c := range s {
		var d int
		switch {
		case c >= '0' && c <= '9':
			d = int(c - '0')
		case c >= 'a' && c <= 'f':
			d = int(c-'a') + 10
		case c >= 'A' && c <= 'F':
			d = int(c-'A') + 10
		default:
			return 0
		}
		n = n*16 + d
	}
	return n
}

func parseIntDec(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int(c-'0')
	}
	return n
}

// ---------------- 广告正则清洗(URL 掩码保护 + 校验位还原) ----------------

const adReCacheMax = 400

var (
	adReCacheMu sync.Mutex
	adReCache   = map[string]*regexp.Regexp{}
)

// compileAdPattern 编译缓存(空/超长/嵌套量词/非法 → nil 跳过; R15-d1b-6 口径)
func compileAdPattern(p string) *regexp.Regexp {
	adReCacheMu.Lock()
	re, ok := adReCache[p]
	adReCacheMu.Unlock()
	if ok {
		return re
	}
	var compiled *regexp.Regexp
	nestedQuant := regexp.MustCompile(`[+*]\s*\)\s*[+*{]`)
	if p != "" && utf8.RuneCountInString(p) <= 300 && !nestedQuant.MatchString(p) {
		if r, err := regexp.Compile(p); err == nil {
			compiled = r
		}
	}
	adReCacheMu.Lock()
	if len(adReCache) >= adReCacheMax {
		// FIFO 驱逐: 简单置空(容量 400 级, 重建成本可忽略; 与 TS 清空语义等价层面)
		adReCache = map[string]*regexp.Regexp{}
	}
	adReCache[p] = compiled
	adReCacheMu.Unlock()
	return compiled
}

const (
	maskOpen  = "\uE000"
	maskClose = "\uE001"
)

var urlMaskRe = regexp.MustCompile(`(?i)(?:https?:)?//[^\s"'<>]+`)
var maskRestoreRe = regexp.MustCompile("\uE000([0-9]+)\uE001")
var maskScrubRe = regexp.MustCompile("[\uE000\uE001]")

// removeAdLines 广告正则清洗(y-a/R9-c-7/R17-b-1: URL 完整区段掩码保护 + 校验位验签还原)
func removeAdLines(text string, patterns []string) string {
	var urls []string
	out := urlMaskRe.ReplaceAllStringFunc(text, func(m string) string {
		urls = append(urls, m)
		idx := len(urls) - 1
		return maskOpen + itoa(idx*10+(idx%9+1)) + maskClose
	})
	for _, p := range patterns {
		re := compileAdPattern(p)
		if re == nil {
			continue
		}
		out = re.ReplaceAllString(out, "")
	}
	out = maskRestoreRe.ReplaceAllStringFunc(out, func(m string) string {
		sub := maskRestoreRe.FindStringSubmatch(m)
		v := parseIntDec(sub[1])
		if v < 1 {
			return ""
		}
		body := v / 10
		if body%9+1 == v%10 && body < len(urls) {
			return urls[body]
		}
		return ""
	})
	out = maskScrubRe.ReplaceAllString(out, "")
	return out
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

// ---------------- 违禁词过滤(R51-3-c; 配置经 Provider 注入) ----------------

// BannedWordsConfig 违禁词配置(对齐 banned-words.ts; Setting key 'bannedWords')
type BannedWordsConfig struct {
	Enabled *bool    `json:"enabled,omitempty"`
	Mode    string   `json:"mode"` // mask|remove
	Words   []string `json:"words"`
}

// BannedWordsProvider 违禁词配置提供方(bridge 注入: Setting 读 + 60s TTL; nil=空配置直通)
var BannedWordsProvider func() BannedWordsConfig

const bannedMaskMaxStars = 6

var (
	bwMu       sync.Mutex
	bwCacheKey string
	bwCacheRe  *regexp.Regexp
)

func escapeRegExp(s string) string {
	return regexp.QuoteMeta(s)
}

func compileBannedWords(cfg BannedWordsConfig) (mode string, re *regexp.Regexp) {
	words := make([]string, 0, len(cfg.Words))
	seen := map[string]struct{}{}
	for _, w := range cfg.Words {
		w = strings.TrimSpace(w)
		if w == "" {
			continue
		}
		key := strings.ToLower(w)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		if utf8.RuneCountInString(w) > 50 {
			w = truncateRunes(w, 50)
		}
		words = append(words, w)
	}
	// 长词优先(alternation 同位置取最长命中; TS sort(b.length-a.length) 稳定序近似)
	for i := 1; i < len(words); i++ {
		for j := i; j > 0 && utf8.RuneCountInString(words[j]) > utf8.RuneCountInString(words[j-1]); j-- {
			words[j], words[j-1] = words[j-1], words[j]
		}
	}
	if len(words) == 0 {
		return "mask", nil
	}
	key := cfg.Mode + "\x00" + strings.Join(words, "\x01")
	bwMu.Lock()
	defer bwMu.Unlock()
	if key == bwCacheKey {
		return modeOf(cfg.Mode), bwCacheRe
	}
	var compiled *regexp.Regexp
	{
		parts := make([]string, len(words))
		for i, w := range words {
			parts[i] = escapeRegExp(w)
		}
		compiled = regexp.MustCompile(`(?i)` + strings.Join(parts, "|"))
	}
	bwCacheKey = key
	bwCacheRe = compiled
	return modeOf(cfg.Mode), compiled
}

func modeOf(m string) string {
	if m == "remove" {
		return "remove"
	}
	return "mask"
}

// applyBannedWords 纯文本违禁词过滤(mask=打码, remove=删除)
func applyBannedWords(text string, mode string, re *regexp.Regexp) string {
	if text == "" || re == nil {
		return text
	}
	if mode == "remove" {
		return re.ReplaceAllString(text, "")
	}
	return re.ReplaceAllStringFunc(text, func(m string) string {
		n := utf8.RuneCountInString(m)
		if n > bannedMaskMaxStars {
			n = bannedMaskMaxStars
		}
		return strings.Repeat("*", n)
	})
}

var htmlTagSplitRe = regexp.MustCompile(`(<[^>]*>)`)
var fullTagRe = regexp.MustCompile(`^<[^>]*>$`)

// applyBannedWordsIfLoaded 出口统一过滤(未就绪/词表空 → 直通; 只过滤文本段不动标签)
func applyBannedWordsIfLoaded(text string) string {
	if BannedWordsProvider == nil || text == "" {
		return text
	}
	cfg := BannedWordsProvider()
	if len(cfg.Words) == 0 {
		return text
	}
	mode, re := compileBannedWords(cfg)
	if re == nil {
		return text
	}
	// 按捕获组切分(标签段奇偶判定与 JS split 捕获组语义一致)
	parts := splitKeepTags(text)
	var b strings.Builder
	for _, seg := range parts {
		if fullTagRe.MatchString(seg) {
			b.WriteString(seg)
		} else {
			b.WriteString(applyBannedWords(seg, mode, re))
		}
	}
	return b.String()
}

// splitKeepTags 按 (<[^>]*>) 捕获组切分, 标签段保留在结果中(奇数下标=标签, 同 JS split 捕获组语义)
func splitKeepTags(s string) []string {
	locs := htmlTagSplitRe.FindAllStringIndex(s, -1)
	if len(locs) == 0 {
		return []string{s}
	}
	out := make([]string, 0, len(locs)*2+1)
	last := 0
	for _, loc := range locs {
		if loc[0] > last {
			out = append(out, s[last:loc[0]])
		}
		out = append(out, s[loc[0]:loc[1]])
		last = loc[1]
	}
	if last < len(s) {
		out = append(out, s[last:])
	}
	return out
}
