// ============================================================
// 头组仿真 v1 — 与 UA 严格自洽的指纹头组(反反爬 R51-2-c ③)
// 语义权威: /home/z/my-project/src/lib/crawl/fetcher.ts fingerprintHeadersFor
// (Go 侧 v1 子集: sec-ch-ua 三件套 + Sec-Fetch 四件套 + Accept/Accept-Language
//
//	家族化; TS 侧的低熵全量 CH(platform-version/arch/bitness/model/wow64)暂不移植)
//
// 一致性即本能力的核心:
//   - Chromium(Chrome/Edge): sec-ch-ua(品牌版本从 UA 正则提取, 与 UA 同版)
//   - sec-ch-ua-mobile(?0/?1 按 UA 移动性) + sec-ch-ua-platform(按 UA 平台段)
//   - Sec-Fetch 四件套;
//   - Safari: 一律不发 sec-ch-ua 与 Sec-Fetch-*(Fetch Metadata 不支持),
//     防"Safari UA 带 Chromium 专属头"的反向破绽;
//   - Firefox: 只发 Sec-Fetch-*(发 Metadata 不发 Client Hints);
//   - Accept 按家族化(TS ACCEPT_HTML_BY_FAMILY); Accept-Language 按 UA locale 段推导;
//   - Accept-Encoding 显式 gzip, deflate(不发 br/zstd — Go 标准库解不了)
//
// ============================================================
package fetch

import (
	"net/url"
	"regexp"
	"strings"
)

var (
	chromeVerRe  = regexp.MustCompile(`Chrome/(\d+)`)
	edgeVerRe    = regexp.MustCompile(`Edg(?:e|A|iOS)?/(\d+)`)
	mobileUARe   = regexp.MustCompile(`iPhone|iPad|Android|Mobile Safari|;\s*Mobile/`)
	uaLocaleZhRe = regexp.MustCompile(`(?i)zh-cn`)
	uaLocaleJaRe = regexp.MustCompile(`(?i)(ja-jp|ja_jp|\bja\b)`)
	uaLocaleEnRe = regexp.MustCompile(`(?i)en-us`)
	// [R54-2a] 热路径正则上提为包级编译(原 uaFamily/uaPlatformHint 每次调用
	// MustCompile —— 每请求/每正文分页都重编译, 纯性能缺陷 R52-c P3「热路径
	// MustCompile」同族; 上提与 TS 正则字面量单次编译语义一致, 判定逻辑零变化)
	edgFamilyRe = regexp.MustCompile(`\bEdg\b`)
	iosHintRe   = regexp.MustCompile(`iPhone|iPad|iOS|iPhone OS`)
	macHintRe   = regexp.MustCompile(`Mac OS|Macintosh`)
	x11HintRe   = regexp.MustCompile(`X11|Linux`)
)

// uaFamily UA 家族判定(决定头组构成; TS uaFamilyOf 同口径)
func uaFamily(ua string) string {
	switch {
	case strings.Contains(ua, "Firefox/"):
		return "firefox"
	case strings.Contains(ua, "Chrome/"), edgFamilyRe.MatchString(ua):
		return "chromium"
	case strings.Contains(ua, "Safari/"):
		return "safari"
	default:
		return "unknown"
	}
}

// isMobileUA UA 移动性判定(TS isMobileUa 同口径)
func isMobileUA(ua string) bool { return mobileUARe.MatchString(ua) }

// uaPlatformHint sec-ch-ua-platform 值: 从 UA 平台段推导(TS uaPlatformHint 同口径)
func uaPlatformHint(ua string) string {
	switch {
	case strings.Contains(ua, "Android"):
		return "Android"
	case iosHintRe.MatchString(ua):
		return "iOS"
	case strings.Contains(ua, "Windows"):
		return "Windows"
	case macHintRe.MatchString(ua):
		return "macOS"
	case strings.Contains(ua, "CrOS"):
		return "Chrome OS"
	case x11HintRe.MatchString(ua):
		return "Linux"
	default:
		return "Windows"
	}
}

// ACCEPT_HTML_BY_FAMILY Accept 按家族化(TS ACCEPT_HTML_BY_FAMILY 照搬):
// Safari 不发 avif/apng/signed-exchange, 单一 Chrome 旧式值与池内 Safari UA 搭配
// 即自相矛盾指纹
const (
	acceptHTMLChromium = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"
	acceptHTMLFirefox  = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
	acceptHTMLSafari   = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
	acceptHTMLDefault  = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
)

func acceptForFamily(family string) string {
	switch family {
	case "chromium":
		return acceptHTMLChromium
	case "firefox":
		return acceptHTMLFirefox
	case "safari":
		return acceptHTMLSafari
	default:
		return acceptHTMLDefault
	}
}

// acceptLanguageFor Accept-Language 按 UA locale 段推导(TS 非池化分支同口径):
// zh-cn → zh-CN,zh;q=0.9,en;q=0.8; ja → ja,en-US;q=0.9,en;q=0.8;
// en-US → en-US,en;q=0.9; 缺省 → zh-CN,zh;q=0.9,en;q=0.6
func acceptLanguageFor(ua string) string {
	switch {
	case uaLocaleZhRe.MatchString(ua):
		return "zh-CN,zh;q=0.9,en;q=0.8"
	case uaLocaleJaRe.MatchString(ua):
		return "ja,en-US;q=0.9,en;q=0.8"
	case uaLocaleEnRe.MatchString(ua):
		return "en-US,en;q=0.9"
	default:
		return "zh-CN,zh;q=0.9,en;q=0.6"
	}
}

// knownMultiPartTLDs 多段 TLD 简化后缀表(注册域 eTLD+1 近似; TS KNOWN_MULTI_PART_TLDS
// 精选子集 — 完整 PSL 不引入, 仅覆盖采集目标高频域)
var knownMultiPartTLDs = map[string]bool{
	// UK
	"co.uk": true, "org.uk": true, "ac.uk": true, "gov.uk": true, "me.uk": true,
	// CN
	"com.cn": true, "net.cn": true, "org.cn": true, "gov.cn": true, "edu.cn": true, "ac.cn": true,
	// HK/TW
	"com.hk": true, "net.hk": true, "org.hk": true, "gov.hk": true,
	"com.tw": true, "net.tw": true, "org.tw": true, "gov.tw": true, "edu.tw": true,
	// AU/JP/KR/BR/IN/SG/US/RU
	"com.au": true, "net.au": true, "org.au": true,
	"co.jp": true, "ne.jp": true, "or.jp": true, "ac.jp": true,
	"co.kr": true, "ne.kr": true, "or.kr": true,
	"com.br": true, "net.br": true, "org.br": true,
	"co.in": true, "net.in": true, "org.in": true, "firm.in": true, "gen.in": true, "ind.in": true,
	"com.sg": true, "net.sg": true, "org.sg": true,
	"com.us": true,
	"com.ru": true, "net.ru": true, "org.ru": true,
	// 平台域(无主域可拆, 原样返回防误判 same-site)
	"github.io": true, "gitlab.io": true, "appspot.com": true, "herokuapp.com": true,
	"azurewebsites.net": true, "netlify.app": true, "vercel.app": true, "fly.dev": true, "deno.dev": true,
}

var ipLiteralRe = regexp.MustCompile(`^(\d{1,3}\.){3}\d{1,3}$`)

// registrableDomain 注册域(eTLD+1)近似(TS registrableDomainOf 同口径): 倒数 2 段为基,
// 末尾命中多段 TLD 表时 TLD 段视作原子整体多取 1~2 段; IP/IPv6/单标签原样返回
func registrableDomain(hostname string) string {
	h := strings.ToLower(hostname)
	if h == "" {
		return ""
	}
	if ipLiteralRe.MatchString(h) || strings.Contains(h, ":") || !strings.Contains(h, ".") {
		return h
	}
	parts := strings.Split(h, ".")
	n := len(parts)
	tldSegments := 1
	if n >= 4 && knownMultiPartTLDs[strings.Join(parts[n-3:], ".")] {
		tldSegments = 3
	} else if n >= 3 && knownMultiPartTLDs[strings.Join(parts[n-2:], ".")] {
		tldSegments = 2
	}
	if tldSegments+1 > n {
		return h
	}
	return strings.Join(parts[n-tldSegments-1:], ".")
}

// secFetchSite Sec-Fetch-Site 按 Referer 与目标关系还原真实导航语义(TS secFetchSite
// 同口径): origin 全等 → same-origin; scheme 相等 + 注册域相等 → same-site; 其余
// cross-site; 无 Referer/解析失败 → none
func secFetchSite(referer, targetURL string) string {
	if referer == "" {
		return "none"
	}
	r, err1 := parseHostTuple(referer)
	t, err2 := parseHostTuple(targetURL)
	if err1 != nil || err2 != nil {
		return "none"
	}
	if r.scheme == t.scheme && r.host == t.host && r.host != "" {
		return "same-origin"
	}
	if r.scheme == t.scheme && r.reg != "" && r.reg == t.reg {
		return "same-site"
	}
	return "cross-site"
}

type hostTuple struct {
	scheme, host, reg string
}

func parseHostTuple(raw string) (hostTuple, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return hostTuple{}, err
	}
	return hostTuple{scheme: strings.ToLower(u.Scheme), host: strings.ToLower(u.Host), reg: registrableDomain(u.Hostname())}, nil
}

// fingerprintHeaders 从 UA 生成指纹头组(v1 子集; 与 buildHeaders 合并后 cfg.headers
// 可覆盖单项)。返回 map 直接逐项 Header.Set(头序由 Go 运行时管理, v1 不做排序仿真)
func fingerprintHeaders(ua, referer, targetURL string) map[string]string {
	family := uaFamily(ua)
	headers := map[string]string{
		"Accept-Language": acceptLanguageFor(ua),
	}
	if family == "chromium" || family == "firefox" {
		headers["Sec-Fetch-Dest"] = "document"
		headers["Sec-Fetch-Mode"] = "navigate"
		headers["Sec-Fetch-Site"] = secFetchSite(referer, targetURL)
		// 首跳(无 Referer, 用户激活导航) ?1; 后续(有 Referer) ?0(TS feat-round-8 同口径)
		if referer != "" {
			headers["Sec-Fetch-User"] = "?0"
		} else {
			headers["Sec-Fetch-User"] = "?1"
		}
	}
	if family == "chromium" {
		cv := ""
		if m := chromeVerRe.FindStringSubmatch(ua); len(m) > 1 {
			cv = m[1]
		}
		if cv != "" {
			ev := ""
			if m := edgeVerRe.FindStringSubmatch(ua); len(m) > 1 {
				ev = m[1]
			}
			if ev != "" {
				headers["sec-ch-ua"] = `"Chromium";v="` + cv + `", "Google Chrome";v="` + cv + `", "Microsoft Edge";v="` + ev + `", "Not:A-Brand";v="24"`
			} else {
				headers["sec-ch-ua"] = `"Chromium";v="` + cv + `", "Google Chrome";v="` + cv + `", "Not:A-Brand";v="24"`
			}
			if isMobileUA(ua) {
				headers["sec-ch-ua-mobile"] = "?1"
			} else {
				headers["sec-ch-ua-mobile"] = "?0"
			}
			headers["sec-ch-ua-platform"] = `"` + uaPlatformHint(ua) + `"`
		}
	}
	return headers
}
