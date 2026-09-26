// ============================================================
// 头组仿真 v1 — 与 UA 严格自洽的指纹头组(反反爬 R51-2-c ③)
// 语义权威: /home/z/my-project/src/lib/crawl/fetcher.ts fingerprintHeadersFor
// (Go 侧 v1 子集: sec-ch-ua 三件套 + Sec-Fetch 四件套 + Accept/Accept-Language
//
//	家族化; TS 侧的低熵全量 CH(platform-version/arch/bitness/model/wow64)暂不移植)
//
// 一致性即本能力的核心:
//   - Chromium(Chrome/Edge): sec-ch-ua(品牌版本从 UA 正则提取, 与 UA 同版;
//     [R67-a] Edge 只发 Edge+Chromium+GREASE 三品牌 — 修前混入 "Google Chrome"
//     品牌, 真 Edge 从不声明 Google Chrome, 自相矛盾指纹)
//   - sec-ch-ua-mobile(?0/?1 按 UA 移动性) + sec-ch-ua-platform(按 UA 平台段)
//   - [R67-a] sec-ch-ua 品牌序按 UA 播撒的稳定置换(Chrome 真实行为: 品牌序经
//     GREASE 随机化; 修前恒定 "Chromium,Google Chrome,Not:A-Brand" 固定序本身
//     即可被服务端识别为非浏览器特征。同一 UA 稳定同序 = 与 UA 钉扎的会话稳定性
//     一致, 不做逐请求乱序避免同一会话内自相矛盾)
//   - Sec-Fetch 四件套: Chromium + Firefox + Safari(池内 Safari UA 均 ≥17.4,
//     Fetch Metadata 于 Safari 16.4 落地, 修前不发反而与 UA 版本自相矛盾);
//   - [R67-a] Sec-Fetch-User 恒 "?1": 真实浏览器只发 "?1"(用户激活)或不发,
//     "?0" 从不上线(TS feat-round-8 的 ?0 口径与真实浏览器行为相悖, 偏差留档;
//     Go 引擎为现行唯一引擎, 以真实浏览器语义为权威)
//   - Accept 按家族化(TS ACCEPT_HTML_BY_FAMILY); Accept-Language 按 UA locale 段推导;
//   - [R67-a] Accept-Encoding 按家族化补齐 br/zstd(真实浏览器全部广告 br: Safari 恒
//     "gzip, deflate, br"; Chrome/Firefox 额外带 zstd; 修前恒 "gzip, deflate" 本身即
//     全家族一致性指纹异常)。br/zstd 解压用既有间接依赖 andybalholm/brotli 与
//     klauspost/compress(已在 go.sum/模块缓存内, 零新依赖下载), readBodyDecompressed
//     按 Content-Encoding 对应解压
//
// 头序评估结论([R67-a] 留档): Go 标准库 net/http 对 HTTP/1.1 请求头按字典序
// 排序写线(net/http.Header.WriteSubset sortedKeyValues), 请求头发送顺序不可
// 通过 Header map 控制或扰动; utls 仅接管 TLS ClientHello, HTTP 头序仍由
// Transport 决定。真实 Chrome 的头序为固定业务序(UA 在 Accept 前、Sec-Fetch 家族
// 在 Accept 后等), 与字典序不同 —— 逐字节头序仿真需替换整个 h1 写线路径
// (fhttp/azuretls 类 fork net/http 或手写 RoundTripper, >100 行+新依赖), 本轮
// 只评估不动手, 详见 worklog R67-a。
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

// acceptEncodingFor 家族化 Accept-Encoding([R67-a] 头集完整性): 请求头值家族自洽
// 与响应解压能力成对 —— 广告 br/zstd 即必须能解(readBodyDecompressed 同步实现,
// 解压库为既有间接依赖, 无新依赖)。unknown 家族保守保持旧值 "gzip, deflate"
func acceptEncodingFor(family string) string {
	switch family {
	case "chromium", "firefox":
		return "gzip, deflate, br, zstd"
	case "safari":
		return "gzip, deflate, br"
	default:
		return "gzip, deflate"
	}
}

// imageAcceptFor 图片子资源 Accept 家族化([R69-a] FetchBinary 封面抓取消费):
// 真实浏览器 <img> 加载不发 HTML Accept — Chrome/Edge/Firefox/Safari 各按真实
// 图片 Accept 值广告; unknown 家族保守 "*/*"
func imageAcceptFor(family string) string {
	switch family {
	case "chromium":
		// Chrome 140+ 图片请求 Accept(含 apng/svg+xml; 与导航 Accept 的差异面)
		return "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
	case "firefox":
		return "image/avif,image/webp,*/*"
	case "safari":
		// Safari 17+ 图片请求 Accept(heic 为 WebKit 家族特征位)
		return "image/avif,image/webp,image/heic,*/*"
	default:
		return "*/*"
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
	// [R67-a] Safari 纳入 Sec-Fetch 家族: Fetch Metadata 自 Safari 16.4 落地,
	// 池内 Safari UA(17.4/18.4)不发反而与 UA 版本自相矛盾; sec-ch-ua 仍不发
	// (WebKit 无 Client Hints, 保持)
	if family == "chromium" || family == "firefox" || family == "safari" {
		headers["Sec-Fetch-Dest"] = "document"
		headers["Sec-Fetch-Mode"] = "navigate"
		headers["Sec-Fetch-Site"] = secFetchSite(referer, targetURL)
		// [R67-a] 恒 "?1": 真实浏览器 Sec-Fetch-User 仅在用户激活时出现且值恒
		// "?1", "?0" 从不上线(修前有 Referer 时发 "?0" = 非浏览器特征;
		// 采集请求模拟用户浏览行为, 恒按用户激活口径)
		headers["Sec-Fetch-User"] = "?1"
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
			// [R67-a] 品牌集对齐真实浏览器: Chrome = Google Chrome+Chromium+GREASE;
			// Edge = Microsoft Edge+Chromium+GREASE(修前 Edge 混入 "Google Chrome"
			// 品牌, 真 Edge 从不声明)
			var brands []string
			if ev != "" {
				brands = []string{`"Microsoft Edge";v="` + ev + `"`, `"Chromium";v="` + cv + `"`, `"Not:A-Brand";v="24"`}
			} else {
				brands = []string{`"Google Chrome";v="` + cv + `"`, `"Chromium";v="` + cv + `"`, `"Not:A-Brand";v="24"`}
			}
			headers["sec-ch-ua"] = strings.Join(permuteChromiumBrands(brands, ua), ", ")
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

// permuteChromiumBrands sec-ch-ua 品牌序稳定置换(种子=UA 串 FNV-1a 派生):
// 同一 UA 恒定同序(与 UA 钉扎的会话稳定性一致), 异 UA 间序打散 —— 品牌序随机化
// 是 Chrome 真实行为(GREASE), 固定序本身即机器指纹。确定性实现(非逐请求随机):
// 测试可断言且钉扎 UA 的会话内不自相矛盾
func permuteChromiumBrands(brands []string, ua string) []string {
	h := uint64(14695981039346656037) // FNV-1a offset basis
	for i := 0; i < len(ua); i++ {
		h ^= uint64(ua[i])
		h *= 1099511628211 // FNV-1a prime
	}
	out := append([]string(nil), brands...)
	for i := len(out) - 1; i > 0; i-- { // Fisher-Yates 降序, 混合后取高位防低位偏向
		h ^= h >> 33
		h *= 0x9E3779B97F4A7C15
		j := int((h >> 33) % uint64(i+1))
		out[i], out[j] = out[j], out[i]
	}
	return out
}
