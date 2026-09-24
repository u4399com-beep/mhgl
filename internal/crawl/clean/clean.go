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

// defaultConfig 缺省清洗配置(基底字段逐条对齐 types.ts DEFAULT_CLEAN_CONFIG;
// AdPatterns 见 defaultAdPatterns —— TS 退役后在 TS 缺省 6 条之上叠加底线层与
// DB 实证增强, 为本站唯一权威清单)
func defaultConfig() Config {
	return Config{
		RemoveSelectors: []string{"script", "style", "iframe", "ins", "noscript", ".adsbygoogle", ".ad", "#ad"},
		AdPatterns:      defaultAdPatterns(),
		Whitelist:       []string{"p", "br", "b", "strong", "em", "i", "u", "h1", "h2", "h3", "h4", "h5", "h6"},
		Normalize:       true,
		PlainText:       false,
	}
}

// defaultAdPatterns 缺省广告正则全集 = 底线模式(coreAdPatterns, 无条件叠加层) ∪
// TS 缺省 6 条 ∪ DB 实证增强(R59-2c: 对 /tmp 只读库抽样 1500 章残留噪声逐族归纳)。
// TS 退役后本表为唯一权威; 增删条目须在 clean_test.go 配正例+防误伤反例。
func defaultAdPatterns() []string {
	out := make([]string, 0, 32)
	out = append(out, coreAdPatterns...)
	out = append(out, []string{
		// TS DEFAULT_CLEAN_CONFIG 原始 6 条(域名条已并入 coreAdPatterns[0] 的
		// 扩展形态: 子域标签 + 更多 TLD; 此处保留原形兼容历史规则字面)
		`(www\.)?[a-z0-9-]+\.(com|net|cc|org|info|top|xyz|vip|site)(/[^\s<>]*)?`,
		`本章未完.*?点击下一页继续阅读`,
		`请记住本书.*?域名`,
		`最新章节请到.*?查看`,
		`[（(]?完?本[网站站][）)]?`,
		`一秒记住.*?免费读`,
		// ---- R59-2c DB 抽样增强(中等特异度; 全部经防误伤反例测试) ----
		// 书名+地址尾巴族("万古神帝最新章节地址：/12192/")
		`(?i)(?:最新章节|全文阅读|txt下载|手机阅读)地址[：:]?(?:[a-z0-9./-]{0,40})`,
		`本书手机阅读(?:地址)?[：:]?`,
		`言情阅读网址[：:]?`,
		// 搜索引导族("获取我有一剑最新章节请搜索" / "最新章节百度搜索：")
		`获取[^<>\n]{1,40}?最新章节请搜索[：:]?`,
		`最新章节(?:百度|必应|搜狗|谷歌|360)搜索[：:]?`,
		`最新最快首发(?:《[^<>\n]{1,40}》?)?`,
		`最快更新最新章节[！!。]?`,
		// 收藏/推荐套话族(整段长链)
		`请向你的朋友[（(]QQ、博客、微信等方式[)）]推荐本书[，,]?谢谢您的支持[！!]*`,
		`[【『\[(]?加入书签[，,]方便阅读[】』\])]?\s*`,
		`更新快[，,]网站页面清爽[，,]广告少[，,]无弹窗`,
		// 全角混淆 URL 族("一秒记住hｔｔps：//" / "ｗｗｗ.ｘｘ.ｃｏｍ")
		`[hｈ][ｔt]{2}[ｐp][ｓs]?[：:]//[^\s<>\n]{0,60}`,

		// R62-c3 修: {1,60}→{0,60}, 裸尾形态("…的模样。\u00a0一秒记住")也回收
		`一秒记住(?:[hｈ][ｔt]{2}[ｐp][ｓs]?[：:])?[a-z0-9ａ-ｚＡ-Ｚ０-９.．:：/／\-_~%?&#=]{0,60}`,
	}...)
	return out
}

// lineWs 行空白类(nbsp 容错): Go \s 不含 U+00A0, 源站 &nbsp; 经 goquery 解码落为
// U+00A0 原字符, `^\s*` 类行锚在行首 nbsp 处卡死 —— R63-d 实证 xyetianlian 924 章
// 整行 URL 残留根因(raw 形态 "&nbsp;&nbsp;&nbsp;&nbsp;http://...<br />", 行锚模式
// 因行首 U+00A0 全部失效)。行锚统一用本类, 不再裸用 \s。
// 注: 解释型字符串(\u00a0 落为原字符) —— raw string 里 \u 不转义会成 RE2 非法转义,
// R62-c3 同款事故形态, TestAllAdPatternsCompile 巡检兜底。
const lineWs = "(?:\\s|\u00a0)*"

// domainBody 域名主体([1] 与 R63-d 引导前缀模式共用, 改动须同步两处语义)
const domainBody = `(?:[a-z0-9-]{1,20}\.){0,2}[a-z0-9-]+\.(?:com\.cn|net\.cn|org\.cn|com|net|cc|org|info|top|xyz|vip|site|cn|la|mobi|tv)`

// leadPrefixAddr 引导地址前缀词组(R63-d: "无弹窗推荐地址：http://..." 族)。词组可
// 自由组合覆盖 "本书最新地址/最新章节地址/无弹窗地址/手机阅读地址" 等复合形态,
// 至少一个限定词(裸 "地址" 不收, 防正文误伤)。本词组只在与域名/掩码占位符同现时
// 消费, 单独出现交由 [16] 整行 mop-up。
const leadPrefixAddr = `(?:最新|全文|手机|访问|推荐|阅读|原文|本书|小说|章节|无弹窗|首发|本站)+地址`

// coreAdPatterns 反广告底线模式(硬底线, 语义同类先例: script/style 标签无视配置
// 硬移除)。规则自定义 clean.adPatterns 为按站定制清单(R59-2c DB 实证: 35 规则中
// 31 条自定义覆盖缺省, 恰恰漏掉请记住本书首发域名/整行 URL 等通用残留), 故通用
// 高置信模式在此无条件叠加, 不受规则配置增删影响。仅收录误伤风险≈0 的形态,
// 全部带防误伤反例测试(clean_test.go TestCoreAdPatternsFloor)。
// 注: \uE000/\uE001 为 removeAdLines 内部 URL 掩码占位符 —— 带 scheme 的
// URL 行被掩码保护不被域名模式删除, 底线改为按「整行仅剩掩码占位符」回收整行;
// 消费顺序: removeAdLines 先掩码 → 逐条替换 → 掩码还原, 本组模式于掩码期间生效。
var coreAdPatterns = []string{
	// [0] R63-d 引导地址前缀+URL/域名 整段回收("无弹窗推荐地址：http://..."族;
	// 掩码占位符期生效 —— 前缀后必须紧跟可见域名或掩码占位符, 防"访问地址：朝阳区"
	// 类正文误伤; 置于 [1] 之前使裸域名随前缀整体回收, 避免域名先删致前缀残留)
	leadPrefixAddr + `[：:]?` + lineWs + `(?:` + domainBody + `[^\s<>]*|` + maskOpen + `\d+` + maskClose + `)[，,。．.!！；;]?`,
	// [1] 域名(含子域标签与 TLD 扩展: 修 "m.xxxx.com" 仅删 "xxxx.com" 残留 "m.";
	// R63-d 路径段 [^\s<>]* 化 —— \S* 会吞 "</p>" 留孤儿开标签)
	domainBody + `(?:/[^\s<>]*)?`,
	// [2] 整行仅 URL(纯文本行形态 + <p> 包裹形态 + br 隔断形态; 掩码占位符期生效)
	// R62-c3 修: 原 \xa0 为 Go 字节转义(单字节 0xA0 非法 UTF-8) → 整条模式编译失败
	// 被静默跳过(compileAdPattern 容错), 「整行仅 URL」回收功能自 R59 起从未生效;
	// 改 \u00a0 rune 转义修复编译。
	// R63-d 修: 行锚 ^\s* 在行首 U+00A0 处卡死(Go \s 不含 U+00A0), raw 形态
	// "&nbsp;&nbsp;&nbsp;&nbsp;URL<br />" 漏网 → 行锚统一 lineWs; 增 br 隔断形态
	// (div 直排上下文无 <p> 包裹, Bug-15 包裹发生在 removeAdLines 之后不可见)。
	"(?m)^" + lineWs + "\uE000\\d+\uE001[。．.!！]?" + lineWs + "$" +
		"|<p[^>]*>" + lineWs + "(?:<a\\b[^>]*>)?" + lineWs + "\uE000\\d+\uE001" + lineWs + "(?:</a>)?" + lineWs + "</p>" +
		"|<br\\b[^>]*>" + lineWs + "\uE000\\d+\uE001" + lineWs + "(?:<br\\b[^>]*)?",
	// [3] 首发域名水印前缀(DB 残留 800+ 行/千章, 居首)
	`请记住本书首发域名[：:]?`,
	`请记住本站[：:]?`,
	// [4] 手机版跳转引导残留("手机版阅读网址：m." / "记住手机版网址：")
	`(?:记住)?手机版(?:阅读)?网址[：:]?`,
	// [5] 章末标记("(本章完)"/"（本章完）", 含行尾内联形态)
	`[（(]\s*本章完\s*[)）]`,
	// [6] 移动端阅读体验插语("手机用户请浏览m.xxx.com阅读，更优质的阅读体验。")
	`手机用户.{0,6}?浏览.{0,36}?更优质的阅读体验[。！!]?`,
	// [7] 全角混淆域名("笔・趣・阁www.ｂｉｑｕｇｅ.ｉｎｆｏ" 的 URL 段; www 与 ｗｗｗ 双形态;
	// R62-c3 增全角句号。混淆形态: DB 黄金瞳 114 章 "www。biquge。info")
	`[wｗ]{3}[.．。][0-9A-Za-zａ-ｚＡ-Ｚ０-９.．。]{2,40}`,
	// [8] 间隔号规避品牌("笔・趣・阁"; 直写"笔趣阁"归品牌词层; R62-c3 增 、＆ 隔符:
	// DB 黄金瞳 114 章 "笔、趣、阁" / "笔＆趣＆阁" 变体)
	`笔[・•·.．、＆]\s*趣[・•·.．、＆]\s*阁`,
	// [9] 星号装饰手打行("★★手打★шшш..★"; 星饰+ш/w 混淆域, 整行回收;
	// R63-d 行锚 lineWs 化同 [2] —— 行首 &nbsp; 卡死修复)
	"(?m)^" + lineWs + "[★☆✦✧*＊\\s\u00a0]*手打\\s*[★☆✦✧*＊шωw3vvs\\s\u00a0.．。·_]*" + lineWs + "$" +
		"|<p[^>]*>" + lineWs + "[★☆✦✧*＊\\s\u00a0]*手打\\s*[★☆✦✧*＊шωw3vvs\\s\u00a0.．。·_]*" + lineWs + "</p>",
	// [10] 无错网会员手打尾注("…会员手打，更多章节请到网址：.")
	`会员手打[，,]`,
	`更多章节请到网址[：:.。]?`,
	// [11] 失联/换址引导
	`请访问最新地址[：:]?`,
	// [12] 收藏/书架套话整段("为了方便下次阅读，你可以点击下方的…下次打开书架即可看到！")
	`为了方便下次阅读[^<>\n]{0,80}?下次打开书架即可看到[！!]?`,
	// [13] 翻页标记("（本章未完，请翻页）"; R62-c3 DB 实证 xyetianlian 万相之王 100 章残留)
	`[（(]\s*本章未完[，,]?\s*请翻页\s*[)）]`,
	// [14] 章末"未完待续"标记("（未完待续）"; R62-c3 DB 实证 xbqg777 黄金瞳 130 章残留)
	`[（(]\s*未完待续\s*[)）]`,
	// [15] 站点导流行("阅读本书最新章节请到999OM,手机同步阅读请访问sj.999om,清爽无广告。…";
	// R62-c3 DB 实证 xyetianlian 万古神帝 7 章; 不跨标签/行防误伤)
	`阅读本书最新章节请到[^<>\n]{0,80}`,
	// [16] R63-d 纯引导地址前缀整行回收(mop-up: 其他模式删 URL/域名后仅剩前缀的行,
	// 如全角混淆域名经 [7] 删后剩 "无弹窗推荐地址："; 整行仅前缀+标点, 无正文误伤面)
	"(?m)^" + lineWs + "[。．,，]?" + lineWs + leadPrefixAddr + "[：:]?" + lineWs + "[。．.!！]?" + lineWs + "$" +
		"|<p[^>]*>" + lineWs + leadPrefixAddr + "[：:]?" + lineWs + "</p>",
}

// withFloorPatterns 消费侧底线叠加: 规则自定义/缺省 AdPatterns 之外无条件并入
// coreAdPatterns(按整串去重, 缺省表已含底线条目时为零开销等价)。恒返回新切片
// (不触碰入参底层数组 —— cfg.AdPatterns 常为跨协程共享的任务级配置, 防 append
// 别名写入竞态)。纯函数, 每次 CleanContentHTML 调用构建一次(千章量级 map 开销可忽略)。
func withFloorPatterns(patterns []string) []string {
	have := make(map[string]struct{}, len(patterns)+len(coreAdPatterns))
	for _, p := range patterns {
		have[p] = struct{}{}
	}
	out := make([]string, 0, len(patterns)+len(coreAdPatterns))
	out = append(out, patterns...)
	for _, p := range coreAdPatterns {
		if _, dup := have[p]; dup {
			continue
		}
		have[p] = struct{}{}
		out = append(out, p)
	}
	return out
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

// sanitizeAdPattern 规则自定义广告模式的吞标签防护(R63-d: 35 规则 68 处 \S* 族实证
// —— \S 含 <>, "无弹窗推荐地址：\S*" 会把 "</p>" 一并吞掉留下孤儿开标签入存。
// 机械改写: \S*→[^\s<>]*, \S+→[^\s<>]+, 非 lazy 的 .*→[^\n<]*(单行 HTML 序列化下
// 贪心 .* 直吞到文末), lazy 量词(.*?/.+?)不动 —— 跨标签匹配是触发词到定界符的本意。
// 改写只会收窄匹配面, 恒不放宽; 纯文本面(无 <>)语义不变。RE2 无前瞻, lazy 区分
// 用 \?? 可选尾问号 + 回调判定。注意 compileAdPattern 的 300 rune 上限作用在消毒后
// 串上(实测最长规则模式 <60 rune, 远低于限; 上限本意为 DoS 防护)。
func sanitizeAdPattern(p string) string {
	if p == "" {
		return p
	}
	out := reSStar.ReplaceAllString(p, `[^\s<>]*`)
	out = reSPlus.ReplaceAllString(out, `[^\s<>]+`)
	out = reDotStar.ReplaceAllStringFunc(out, func(m string) string {
		if strings.HasSuffix(m, "?") {
			return m // lazy: 跨标签是本意, 不动
		}
		return "[^\\n<]*"
	})
	out = reDotPlus.ReplaceAllStringFunc(out, func(m string) string {
		if strings.HasSuffix(m, "?") {
			return m
		}
		return "[^\\n<]+"
	})
	return out
}

var (
	reSStar   = regexp.MustCompile(`\\S\*`)
	reSPlus   = regexp.MustCompile(`\\S\+`)
	reDotStar = regexp.MustCompile(`\.\*\??`)
	reDotPlus = regexp.MustCompile(`\.\+\??`)
)

// FromRuleRaw 规则 config JSON → 清洗配置(对齐 parseRuleConfig + sanitizeCleanConfig):
// clean 段缺失/非对象 → 整段缺省; 各字段缺失 → 字段缺省(safeStrArr 钳制 + 白名单小写化
// + adPatterns 逐条 sanitizeAdPattern 吞标签消毒)。
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
		for i, p := range ap {
			ap[i] = sanitizeAdPattern(p)
		}
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

// PlainLen 纯文本长度(口径: 剥全部标签后 rune 计数, 对齐 JS
// cleaned.replace(/<[^>]+>/g,”).length; reclean 维护面与 bridge 落库共用)
func PlainLen(html string) int {
	return len([]rune(tagNaiveRe.ReplaceAllString(html, "")))
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
