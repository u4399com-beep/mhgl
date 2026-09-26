// ============================================================
// 拦截页/挑战壳检测 — looksBlocked Go 精简移植
// 词表语义权威: /home/z/my-project/src/lib/crawl/fetcher.ts
// (STRONG_BLOCK_MARKERS/BLOCK_MARKERS/isJsChallenge/hasNormalTitle/isPlainJsonBody
//
//	逐条照搬; Go 侧新增 Result.Blocked 出口判定, 编排层等价 HTTP 403 计失败路径)
//
// 判定层次(与 TS looksBlocked 同序):
//
//	①空体判拦 ②合法 JSON 整体豁免 ③403/429/503 + WAF Server 头联合判定
//	④极短 JS 跳转壳判拦 ⑤强挑战标记命中判拦(jsd 探测脚本良性豁免)
//	⑥极短页(<200B)判拦 ⑦200~500B 且可见文本 <50 判拦 ⑧长页+正常标题豁免
//	⑨弱标记前 4000 字符扫描判拦
//
// ============================================================
package fetch

import (
	"encoding/json"
	"regexp"
	"strings"
	"unicode/utf8"
)

// strongBlockMarkers 结构化挑战标记(命中即判拦, 不适用"长页面+正常标题"豁免)。
// 从 TS STRONG_BLOCK_MARKERS 逐条照搬 —— 词表语义权威在 TS 侧, 增删词条须两侧同步
var strongBlockMarkers = []string{
	"just a moment", "cf-browser-verification", "cf-chl", "challenge-platform",
	"cf_chl_", "checking your browser", "attention required",
	"cf-turnstile", "ddos-guard", "challenge.js",
	// WAF 通用拦截页特征 —— hCaptcha/Turnstile 旧版 CF/通用 WAF 拦截页
	"cf-chl-bypass",
	"please verify you are a human",
	"enable javascript and cookies",
	"正在进行安全验证", "本网站使用安全服务",
	// 繁体变体(ixdzs 系"請稍等，正在進行安全驗證..."盾页)与"正在验证浏览器"标题站
	"正在進行安全驗證", "正在驗證瀏覽器", "正在验证浏览器", "安全驗證",
	// Cloudflare 2023+ 新版 Turnstile 非交互盾页文案 / 加速乐挑战 Cookie 名 / 宝塔 WAF
	"verifying you are human", "__jsl_clearance", "btwaf",
	// [R68-a] CF 挑战/Turnstile 脚本域(challenges.cloudflare.com): Turnstile 组件与
	// 托管挑战页的脚本宿主, 2022+ 新形态; 正文页不会引用该域, 命中即挑战组件在页
	"challenges.cloudflare.com",
	// [R69-a] CF 2021+ 挑战内联配置对象名(window._cf_chl_opt): 现代托管挑战页
	// 必含, 正常业务页不引用
	"_cf_chl_opt",
	// [R69-a] CF 错误/拦截页容器标记(cf-error-details): 5xx/1020/1015 拦截页模板
	// 必含 class/id, 正文页不引用
	"cf-error-details",
	// [R69-a] CF 硬限流/防火墙拦截页字面文案(纯文本 body 无模板标记的形态:
	// 1015 = rate-limited / 1020 = access-rule blocked)
	"error code: 1015", "error code: 1020",
	// [R70-a] 国产 WAF/CDN 拦截页识别扩容(合成 fixture 单测 r70a_test.go 驱动)。
	// 强标记只收「技术指纹」: cookie 名/脚本路径/JS 加载器/产品 ASCII 标识 ——
	// 正文零碰撞, 长页+正常标题豁免不适用(命中即拦):
	//   宝塔: getWafJs 挑战加载器 / /bt-waf 拦截资源路径 / 宝塔网站防火墙(产品全称)
	//   安全狗: safedog(cookie safedog-flow-item/脚本域)
	//   云锁: yunsuo_session(cookie 族 yunsuo_session_verify 等)
	//   雷池 SafeLine: safeline(ASCII 标识) / 请求被waf拦截(拦截文案, haystack 已小写化)
	//   加速乐: __jsluid(cookie 族, 补既有 __jsl_clearance 之外的 uid 面)
	//   百度云加速: yunjiasu(脚本域 static.yunjiasu.com/cookie)
	//   知道创宇: 创宇盾(产品名) / wzws_cid(网站卫士 cookie)
	"getwafjs", "bt-waf", "宝塔网站防火墙",
	"safedog", "yunsuo_session", "safeline", "请求被waf拦截",
	"__jsluid", "yunjiasu", "wzws_cid", "创宇盾",
	// [R71-a] 国际 WAF + 阿里云 WAF 挑战/拦截页技术指纹扩容(仅挑挑战页专属形态,
	// 商业页嵌入面零误伤 —— DataDome/PerimeterX 的站点级 tag 脚本会出现在受保护站
	// 的每个正常页上, 不可作强标记; 下列词条只出现在挑战/拦截响应内):
	//   DataDome: captcha-delivery.com/captcha(挑战 iframe/脚本专属路径)
	//   PerimeterX: px-captcha(挑战页专属元素 id)
	//   阿里云 WAF: acw_sc__v2(JS 挑战 cookie/内联脚本专属名, 挑战页内联下发) /
	//               errors.aliyun.com(拦截跳转宿主)
	"captcha-delivery.com/captcha", "px-captcha",
	"acw_sc__v2", "errors.aliyun.com",
	// [R72-a] Imperva Incapsula JS 挑战页内联脚本标记: 仅挑战/拦截响应出现,
	// 业务页零引用(Server 头面 wafServerRe 已有 incapsula, 此补 200 壳形态)
	"_incapsula_resource",
}

// weakBlockMarkers 弱标记(TS BLOCK_MARKERS): 无正常标题豁免时仅扫前 4000 字符
var weakBlockMarkers = []string{
	"captcha", "verify", "验证码", "安全验证", "滑动验证", "人机验证",
	"access denied", "forbidden", "请开启javascript", "enable javascript",
	"just a moment", "cf-browser-verification", "checking your browser",
	"cf-chl", "challenge-platform", "cf_chl_", "attention required",
	// [R68-a] 中文站(杰奇 WAP 系常见)拦截/限频文案, 与既有词条同族补全:
	// 仅在无正常标题豁免时扫前 4000 字符, 长页+正常标题(正文/导航提及)不误伤
	"访问过于频繁", "请开启浏览器javascript", "启用javascript",
	// [R69-a] 限频文案同族变体(短壳拦截页高频用语; 长页+正常标题豁免不误伤)
	"请求过于频繁", "操作过于频繁", "访问频率过高",
	// [R70-a] 国产 WAF 中文产品名(弱标记: 正文/页脚提及不误伤 — 中文产品名存在
	// 正文碰撞可能, 如武侠文本「云锁」「雷池」「安全狗」均可入文, 仅无正常标题
	// 豁免时扫前 4000 字符判拦; 技术指纹已由强标记覆盖)
	"安全狗", "云锁", "雷池waf", "百度云加速", "网站卫士",
}

var (
	cfChlBypassRe = regexp.MustCompile(`(?i)cf-chl-bypass`)
	jsRedirectRe  = regexp.MustCompile(`window\.location\s*[.[]|location\.href\s*=|location\.replace\s*\(|location\.assign\s*\(`)
	jsRefreshRe   = regexp.MustCompile(`(?i)http-equiv\s*=\s*["']?refresh`)
	titleRe       = regexp.MustCompile(`(?i)<title[^>]*>([\s\S]{1,300}?)</title>`)
	// 403/404 整词判定(带分隔上下文): "第403章" 的前导数字不作分隔, 不误判
	badStatusTitleRe = regexp.MustCompile(`(^|[^\p{L}\p{N}])40[34]([^\p{L}\p{N}]|$)`)
	scriptRe         = regexp.MustCompile(`(?is)<script[\s\S]*?</script>`)
	styleRe          = regexp.MustCompile(`(?is)<style[\s\S]*?</style>`)
	htmlTagRe        = regexp.MustCompile(`<[^>]+>`)
	// [R70-a] Server 头 WAF 指纹补国产面(仅 403/429/503 联合判定消费, 误报面限缩)
	wafServerRe = regexp.MustCompile(`(?i)cloudflare|akamai|incapsula|sucuri|safedog|yunsuo|safeline|yunjiasu`)

	// [R70-a] meta-refresh 跳转型挑战(属性序无关: 仅要求同一标签内 http-equiv 后随
	// refresh 值 — 前后两种属性序均命中)与 iframe 嵌套挑战标签
	metaRefreshTagRe = regexp.MustCompile(`(?is)<meta\b[^>]*http-equiv[^>]*\brefresh\b[^>]*>`)
	iframeTagRe      = regexp.MustCompile(`(?is)<iframe\b[^>]*>`)
	// 跳转目标/源指向 WAF/挑战端点的技术关键词(裸 refresh/iframe 业务形态不命中;
	// 刻意不含 verify 等宽泛词 — 本判定对长页+正常标题页生效, 关键词必须零正文碰撞)。
	// [R72-a] jsl 收紧为边界形态(__jsl* cookie 名 / jsl 后随路径·查询·赋值分隔符,
	// 加速乐挑战资源真实形态 /jsl/?h=…): 裸 "jsl" 子串误伤业务路径 /jslib/*
	// (iframe src="/jslib/jquery.min.js" 的长内容页被整页判拦丢章)
	jumpWafTargetRe = regexp.MustCompile(`(?i)(waf|challenge|captcha|__jsl|jsl[/?=]|safedog|yunsuo|safeline|yunjiasu)`)
)

// isPlainJSONBody 合法 JSON 响应体整体豁免(TS isPlainJsonBody 同口径): JSON API 站的
// 短响应是正常业务信封; 挑战页均以 <html>/<script> 形态返回, 合法 JSON 不可能是盾页
func isPlainJSONBody(s string) bool {
	t := strings.TrimSpace(s)
	if t == "" {
		return false
	}
	if t[0] != '{' && t[0] != '[' {
		return false
	}
	return json.Valid([]byte(t))
}

// isJsChallenge 极短 JS 跳转壳判定(TS isJsChallenge 同口径; 长度阈值按 rune 计数
// 近似 JS string.length, CJK 形态下与 TS 判定面一致)
func isJsChallenge(h string) bool {
	s := strings.TrimSpace(h)
	if s == "" {
		return false
	}
	n := utf8.RuneCountInString(s)
	// 旧版 CF JS 挑战壳特征(cf-chl-bypass), 短壳内出现即判 JS 挑战
	if n < 1200 && cfChlBypassRe.MatchString(s) {
		return true
	}
	if n >= 1200 {
		return false
	}
	return jsRedirectRe.MatchString(s) || jsRefreshRe.MatchString(s)
}

// hasNormalTitle 正常标题判定(TS hasNormalTitle 同口径): 盾页标题黑名单 + 403/404
// 状态页形态整词判定
func hasNormalTitle(h string) bool {
	m := titleRe.FindStringSubmatch(h)
	if m == nil {
		return false
	}
	t := strings.ToLower(strings.TrimSpace(m[1]))
	if utf8.RuneCountInString(t) < 2 {
		return false
	}
	bad := []string{"just a moment", "attention required", "access denied", "forbidden", "请开启", "验证", "请稍候", "请稍後"}
	for _, k := range bad {
		if strings.Contains(t, k) {
			return false
		}
	}
	return !badStatusTitleRe.MatchString(t)
}

// visibleText 去标签可见文本(调用方按 rune 计数; script/style 剥除)
func visibleText(h string) string {
	s := scriptRe.ReplaceAllString(h, "")
	s = styleRe.ReplaceAllString(s, "")
	s = htmlTagRe.ReplaceAllString(s, "")
	return strings.TrimSpace(s)
}

// runeHead 前 n 码点截断(按 rune 边界, 不斩多字节字符; 总码点 ≤n 时原样返回)。
// 字节切片守卫式(零大额分配, [R64-a] 同款), 供弱标记前 4000 扫描与 [R70-a]
// 挑战跳转扫描共用
func runeHead(s string, n int) string {
	if n <= 0 {
		return ""
	}
	cut, seen := len(s), 0
	for idx := range s {
		if seen == n {
			cut = idx
			break
		}
		seen++
	}
	if seen == n {
		return s[:cut]
	}
	return s
}

// isWafJumpChallenge [R70-a] meta-refresh/iframe 嵌套挑战跳转识别(国产 WAF 二跳
// 形态: <meta http-equiv="refresh" content="0;url=/bt-waf/verify..."> 或
// <iframe src="/waf/captcha...">)。仅当跳转目标/源含 WAF/挑战技术关键词才判拦
// —— 裸 meta refresh(分页跳转)与业务 iframe 不误伤。极短跳壳本就由 isJsChallenge
// (<1200 码点含 refresh 即拦)覆盖, 本判定补足「长页/正常标题」形态; 扫描范围限
// 前 4000 码点(meta 标签语义上位于 head, 挑战壳恒短, 成本有界)
func isWafJumpChallenge(lower string) bool {
	head := runeHead(lower, 4000)
	for _, tag := range metaRefreshTagRe.FindAllString(head, 16) {
		if jumpWafTargetRe.MatchString(tag) {
			return true
		}
	}
	for _, tag := range iframeTagRe.FindAllString(head, 16) {
		if jumpWafTargetRe.MatchString(tag) {
			return true
		}
	}
	return false
}

// looksBlocked 拦截页/挑战壳判定(出口判定: charset 解码后的 HTML + 状态 + Server 头)。
// blocked=true 时编排层按等价 httpStatusError{403} 计失败路径, 内容不入库不回调
func looksBlocked(h string, status int, serverHeader string) bool {
	if h == "" {
		return true
	}
	// [R66-a] 全文码点计数一次(修前 <200/<500/≥1200/jsd 豁免四处各扫一遍 O(n) → 1 次;
	// head 4000 截断仍按 lower 自身码点数 —— ToLower 对极少数字符(İ 类) 1 码点→2 码点
	// 膨胀, 截断口径沿用原实现不计入 n)
	n := utf8.RuneCountInString(h)
	// 合法 JSON 响应体整体豁免(置于词表之前: 正文 JSON 合法出现的"验证码/安全验证"
	// 等词汇不应触发 HTML 特征词库误拦)
	if isPlainJSONBody(h) {
		return false
	}
	// 状态 + WAF Server 头联合判定(响应体可能为空或极短, 单凭内容特征漏判)
	if status == 403 || status == 429 || status == 503 {
		srv := strings.ToLower(serverHeader)
		if srv != "" && wafServerRe.MatchString(srv) {
			return true
		}
	}
	// 极短 JS 跳转壳判拦
	if isJsChallenge(h) {
		return true
	}
	lower := strings.ToLower(h)
	// CF JS Detections 探测脚本良性豁免: 页面有正常标题且足够长时, 内嵌 jsd 不代表
	// 当前是挑战页(真实内容页误拦防护, TS jsdBenign 同口径)
	jsdBenign := strings.Contains(lower, "challenge-platform/scripts/jsd") &&
		n >= 1200 && hasNormalTitle(h)
	// 强挑战特征(CF 等): 无论长短一律判拦
	if !jsdBenign {
		for _, k := range strongBlockMarkers {
			if strings.Contains(lower, k) {
				return true
			}
		}
	}
	// [R70-a] meta-refresh/iframe 嵌套挑战跳转(国产 WAF 二跳形态, 目标含
	// WAF/挑战技术关键词才判拦)
	if isWafJumpChallenge(lower) {
		return true
	}
	// 极短内容视为被拦(<200B)
	if n < 200 {
		return true
	}
	// 200~500 字短页且可见文本 <50 字 → 疑似空壳拦截页(典型 WAF 占位)
	if n < 500 {
		if vt := visibleText(h); utf8.RuneCountInString(vt) < 50 {
			return true
		}
	}
	// 含正常 <title> 且足够长的页面视为正常内容页(正文/导航提及"验证码/verify"等
	// 词不误判)
	if n >= 1200 && hasNormalTitle(h) {
		return false
	}
	// 弱标记: 无正常标题豁免时仅扫前 4000 字符(TS lower.slice(0, 4000) 同口径)。
	// [R64-a] 修前 string([]rune(head)[:4000]) 全量码点转换 —— 10MB 响应体每次到达
	// 本分支即 ~40MB 临时分配(无正常标题的站点每个内容页都付一次); 改为按 rune
	// 边界的字节切片, 语义不变(仍取前 4000 码点, 不会斩断多字节字符)且零大额分配。
	// [R70-a] 截断逻辑收敛到 runeHead 单一实现(与挑战跳转扫描共用)
	head := runeHead(lower, 4000)
	for _, k := range weakBlockMarkers {
		if strings.Contains(head, k) {
			return true
		}
	}
	return false
}
