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
}

// weakBlockMarkers 弱标记(TS BLOCK_MARKERS): 无正常标题豁免时仅扫前 4000 字符
var weakBlockMarkers = []string{
	"captcha", "verify", "验证码", "安全验证", "滑动验证", "人机验证",
	"access denied", "forbidden", "请开启javascript", "enable javascript",
	"just a moment", "cf-browser-verification", "checking your browser",
	"cf-chl", "challenge-platform", "cf_chl_", "attention required",
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
	wafServerRe      = regexp.MustCompile(`(?i)cloudflare|akamai|incapsula|sucuri`)
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

// looksBlocked 拦截页/挑战壳判定(出口判定: charset 解码后的 HTML + 状态 + Server 头)。
// blocked=true 时编排层按等价 httpStatusError{403} 计失败路径, 内容不入库不回调
func looksBlocked(h string, status int, serverHeader string) bool {
	if h == "" {
		return true
	}
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
		utf8.RuneCountInString(h) >= 1200 && hasNormalTitle(h)
	// 强挑战特征(CF 等): 无论长短一律判拦
	if !jsdBenign {
		for _, k := range strongBlockMarkers {
			if strings.Contains(lower, k) {
				return true
			}
		}
	}
	// 极短内容视为被拦(<200B)
	if utf8.RuneCountInString(h) < 200 {
		return true
	}
	// 200~500 字短页且可见文本 <50 字 → 疑似空壳拦截页(典型 WAF 占位)
	if n := utf8.RuneCountInString(h); n < 500 {
		if vt := visibleText(h); utf8.RuneCountInString(vt) < 50 {
			return true
		}
	}
	// 含正常 <title> 且足够长的页面视为正常内容页(正文/导航提及"验证码/verify"等
	// 词不误判)
	if utf8.RuneCountInString(h) >= 1200 && hasNormalTitle(h) {
		return false
	}
	// 弱标记: 无正常标题豁免时仅扫前 4000 字符(TS lower.slice(0, 4000) 同口径)。
	// [R64-a] 修前 string([]rune(head)[:4000]) 全量码点转换 —— 10MB 响应体每次到达
	// 本分支即 ~40MB 临时分配(无正常标题的站点每个内容页都付一次); 改为按 rune
	// 边界的字节切片, 语义不变(仍取前 4000 码点, 不会斩断多字节字符)且零大额分配
	head := lower
	if utf8.RuneCountInString(head) > 4000 {
		cut := len(head)
		n := 0
		for idx := range head {
			if n == 4000 {
				cut = idx
				break
			}
			n++
		}
		head = head[:cut]
	}
	for _, k := range weakBlockMarkers {
		if strings.Contains(head, k) {
			return true
		}
	}
	return false
}
