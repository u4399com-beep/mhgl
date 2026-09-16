// ============================================================
// 抓取器 — 反反爬策略
// HTTP 引擎: UA轮换/Cookie罐/Referer/编码识别/重试/Cookie挑战重试
// 浏览器引擎: 优先 Obscura(--stealth 轻量无头, 见 ./obscura.ts),
//             失败降级裸 Playwright JS渲染
// auto 模式: HTTP 被拦截(403/412/429/503/验证码特征/JS挑战)自动升级浏览器渲染
// ============================================================
import iconv from 'iconv-lite'
import { type FetchConfig, DEFAULT_FETCH_CONFIG, isValidMirrorHost } from './types'
import { obscuraFetch, checkObscuraAvailable, clickSelectorAnywhere, buildIdentityInitScript, applyUaCdpOverride, shutdownObscura } from './obscura'
// [R9-e-4] 增强: 请求节奏画像上报 —— hostgate 无内部依赖(无循环风险); 缺省开关关闭时
// 上报函数为 no-op, 既有行为零变化
// [R28-4-E1] 增强: reportHostForbidden —— host 级长静默熔断(403 连败≥5 → 5~15min 停手),
// 接线点在本文件 noteHostHttpFailure 的 403 记账路径
import { reportHostLatency, reportHostChallenge, reportHostRateLimited, reportHostForbidden, PACE_PROFILE_ENABLED } from './hostgate'

// ---------- UA 池 ----------
// C.3(y-a重放): Chrome 系版本升级至当前稳定段 137~140(原池 118~131 过旧, 属明显
// 爬虫指纹特征); Edge 与 Chromium 同主版本号配对(Edg/137↔Chrome/137, 真实 Edge
// 即如此), 防 UA 与版本指纹自相矛盾。注: 引擎请求头从不携带 sec-ch-ua 等
// Client Hints 头(grep 全库无此头), 不存在"sec-ch-ua 与 UA 版本不一致"的配对面;
// Safari/Firefox 条目不在本轮范围, 保持原样(最小改动)
export const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 Edg/137.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; U; Android 13; zh-cn; M2102J2SC Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/137.0.0.0 Mobile Safari/537.36',
  // —— 扩充池(Chrome 137~140 / Edge / Firefox 126+ / Safari 17.5 / Android / iOS), 与上无重复 ——
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  // —— 2-fetcher 扩充②: Chrome 141/142 / Edge 141/142 / Firefox 128~130 / Safari 17.6/18.0 /
  // Android Pixel 9 + Samsung S24(SM-S926B) / iOS 17.6/18.0(配合 sec-ch-ua-model 与
  // sec-ch-ua-platform-version 自洽); 池中既存条目保持不动(版本号无碰撞) ——
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  'Mozilla/5.0 (Linux; Android 14; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
]

// [R21-e-5] 精简: 仅文件内消费(pickUaFor)去 export(R19-b-3 同款口径, rg 全库含 archive 零外部引用)
function randomUa(): string {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)]
}

// ---------- 浏览器指纹头组 (ff-b 增强①) ----------
/**
 * 场景: UA 轮换只解决了 User-Agent 单头, 真实浏览器还固定携带一组与 UA 严格配套的
 * Client Hints(sec-ch-ua*)与 Fetch Metadata(Sec-Fetch-*)头 —— "只有 UA 没有配套头组"
 * 与"sec-ch-ua 版本和 UA 版本不一致"/"Android UA 配桌面 platform"一样, 都是自相矛盾的
 * 非浏览器指纹。本层按【实际选中的 UA】推导完整指纹头组(仅 HTTP 链注入, 见 buildHeaders):
 *  - Chromium 系(Chrome/Edge): sec-ch-ua(品牌版本从 UA 提取, 与 UA 同版)+ sec-ch-ua-mobile
 *    (?0/?1 按 UA 移动性)+ sec-ch-ua-platform(按 UA 平台段: Windows/macOS/Linux/Android/iOS);
 *  - Sec-Fetch-*(Chromium/Firefox 导航均发送): Dest: document/Mode: navigate/User: ?1,
 *    Site 按 Referer 与目标 host 关系取 none(直接输入)/same-origin(同站来源)/cross-site;
 *  - Safari 不发送 Client Hints 与 Sec-Fetch-*(Fetch Metadata 不支持) → 一律不注入,
 *    防"Safari UA 带 Chromium 专属头"的反向破绽; Firefox 发送 Sec-Fetch-* 但无 Client Hints;
 *  - Upgrade-Insecure-Requests: 三家浏览器文档导航均发送。
 * 一致性即本能力的核心: Android 移动 UA 必然配 sec-ch-ua-mobile: ?1 + platform "Android"。
 * 注入点纪律: 仅 fetchHttp/fetchViaCurl(HTTP 链)经 buildHeaders({fingerprint:true}) 启用;
 * 裸 Playwright 链刻意不注入 —— 真浏览器自身发送原生 Sec-Fetch-* 与 sec-ch-ua, extraHTTPHeaders
 * 再注入同名头会产生重复头/覆盖冲突(双值头反而可疑), UA 之外的头组交给真浏览器自洽。
 */
const CHROME_VER_RE = /Chrome\/(\d+)/
const EDGE_VER_RE = /Edg(?:e|A|iOS)?\/(\d+)/

/** UA 移动性判定: 池内 iPhone/iPad/Android 与通用 Mobile 标记 */
export function isMobileUa(ua: string): boolean {
  return /iPhone|iPad|Android|Mobile Safari|;\s*Mobile\//.test(ua)
}

/** UA 家族判定(决定头组构成) */
function uaFamilyOf(ua: string): 'chromium' | 'safari' | 'firefox' | 'unknown' {
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Chrome\/|\bEdg\b/.test(ua)) return 'chromium'
  if (/Safari\//.test(ua)) return 'safari'
  return 'unknown'
}

/** sec-ch-ua-platform 值: 从 UA 平台段推导(Chromium 系才发送, 需与 UA 自洽) */
function uaPlatformHint(ua: string): string {
  if (/Android/.test(ua)) return 'Android'
  if (/iPhone|iPad|iOS|iPhone OS/.test(ua)) return 'iOS'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Mac OS|Macintosh/.test(ua)) return 'macOS'
  if (/CrOS/.test(ua)) return 'Chrome OS'
  if (/X11|Linux/.test(ua)) return 'Linux'
  return 'Windows'
}

/** Sec-Fetch-Site: 按 Referer 与目标 host 关系还原真实导航语义
 *  [R9-a-6] 修复: 同站跨子域(a.example.com → b.example.com)原先被判 cross-site ——
 *  真实浏览器按注册域判 same-site(站内跨子域跳转极常见), 错标本身就是指纹破绽。
 *  [R9-a2-3] 补全(核实 1-a 修改时发现其实现与注释不符): 原 suffix 互判只覆盖
 *  【父子域】(a.example.com ↔ example.com), 兄弟子域(a.example.com → b.example.com,
 *  如 www → img 静态资源站)仍被误判 cross-site —— 与该修复注释声称的场景正好相反。
 *  且 host 含端口/忽略 scheme: 真实浏览器 Sec-Fetch-Site 按【站点元组(scheme+注册域)】
 *  判定, 与端口无关(http://a.com:8080 → http://b.a.com 也是 same-site), 而 same-origin
 *  才要求 scheme+host+port 全等。现按 Fetch 规范语义重写:
 *   - origin 全等(URL.origin 含 scheme+host+归一化端口) → same-origin;
 *   - scheme 相等 + 注册域(eTLD+1 近似, KNOWN_MULTI_PART_TLDS 兜底多段 TLD)相等 → same-site;
 *   - 其余 → cross-site。无 PSL 库约束下的近似口径与 CookieJar parentDomainChain 一致 */
function secFetchSite(referer: string, targetUrl: string): string {
  if (!referer) return 'none'
  try {
    const r = new URL(referer)
    const t = new URL(targetUrl)
    if (r.origin !== 'null' && r.origin === t.origin) return 'same-origin'
    // 注册域近似(hostname 不含端口; IP/IPv6 字面量无注册域概念, registrableDomainOf 原样返回);
    // scheme 参与站点元组(http→https 同域跳转真实浏览器也判 cross-site)
    const rReg = registrableDomainOf(r.hostname)
    if (r.protocol === t.protocol && rReg && rReg === registrableDomainOf(t.hostname)) return 'same-site'
    return 'cross-site'
  } catch {
    return 'none'
  }
}

/** [R9-a2-3] 注册域(eTLD+1)近似: 倒数 2 段为基, 末尾命中 KNOWN_MULTI_PART_TLDS
 *  (co.uk/com.cn 等)时 TLD 段视作原子整体多取 1~2 段 —— 与 parentDomainChain 同一口径。
 *  IP 字面量 / IPv6 / 单标签(localhost)无注册域概念, 原样返回(仅 host 全等才 same-origin,
 *  不会误判 same-site) */
function registrableDomainOf(hostname: string): string {
  const h = hostname.toLowerCase()
  if (!h) return ''
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h) || h.includes(':') || !h.includes('.')) return h
  const parts = h.split('.')
  let tldSegments = 1
  if (parts.length >= 4 && KNOWN_MULTI_PART_TLDS.has(parts.slice(-3).join('.'))) tldSegments = 3
  else if (parts.length >= 3 && KNOWN_MULTI_PART_TLDS.has(parts.slice(-2).join('.'))) tldSegments = 2
  return parts.slice(-(tldSegments + 1)).join('.')
}

/** 从 UA 生成完整指纹头组(与 buildHeaders 合并, cfg.headers 可覆盖单项)
 *  2-fetcher 增强②: 在原有 sec-ch-ua / sec-ch-ua-mobile / sec-ch-ua-platform 基础上, 补齐
 *  与 Chromium 100+ 真实浏览器同步发送的低熵 Client Hints: sec-ch-ua-platform-version /
 *  sec-ch-ua-arch / sec-ch-ua-bitness / sec-ch-ua-model / sec-ch-ua-wow64; 并按 UA 平台段
 *  推导自洽的 Accept-Language(zh-CN / en-US / ja), 防"Android UA 配桌面 Accept-Language"
 *  的反向破绽。所有派生值与 UA 字符串严格配套(移动 UA → mobile=?1 + model=Pixel/iPhone,
 *  桌面 UA → mobile=?0 + model=""), 任一头缺失或错配都会被 WAF 指纹库判为爬虫。
 *
 *  feat-round-8: B2 — Sec-Fetch-User 链路语义
 *  真实 Chrome 导航行为: 用户首次输入 URL/点击外链进入时 Sec-Fetch-User: ?1
 *  (用户激活的导航); 同站后续跳转/翻页/重定向 Sec-Fetch-User: ?0 (无用户激活)。
 *  原实现恒送 ?1, 多页采集时全 ?1 与真实浏览器指纹相悖。改为按 Referer 是否存在
 *  判定: 无 Referer(首跳, secFetchSite=none) → ?1; 有 Referer(后续) → ?0。
 *  Referer 由 buildHeaders 按链(chainReferer > origin)注入, fingerprintHeadersFor
 *  入参 referer 即"生效 Referer", 据此判定首跳/后续语义自洽。 */
export function fingerprintHeadersFor(ua: string, referer: string, targetUrl: string): Record<string, string> {
  const family = uaFamilyOf(ua)
  const headers: Record<string, string> = {
    'Upgrade-Insecure-Requests': '1',
  }
  headers['Accept-Language'] = acceptLanguageFor(ua, targetUrl)
  if (family === 'chromium' || family === 'firefox') {
    headers['Sec-Fetch-Dest'] = 'document'
    headers['Sec-Fetch-Mode'] = 'navigate'
    headers['Sec-Fetch-Site'] = secFetchSite(referer, targetUrl)
    // feat-round-8: B2 — 首跳(无 Referer, 用户激活导航) ?1; 后续(有 Referer) ?0
    headers['Sec-Fetch-User'] = referer ? '?0' : '?1'
  }
  if (family === 'chromium') {
    const cv = ua.match(CHROME_VER_RE)?.[1] || ''
    const ev = ua.match(EDGE_VER_RE)?.[1] || ''
    if (cv) {
      const brands = ev
        ? `"Chromium";v="${cv}", "Google Chrome";v="${cv}", "Microsoft Edge";v="${ev}", "Not:A-Brand";v="24"`
        : `"Chromium";v="${cv}", "Google Chrome";v="${cv}", "Not:A-Brand";v="24"`
      headers['sec-ch-ua'] = brands
      const mobile = isMobileUa(ua)
      headers['sec-ch-ua-mobile'] = mobile ? '?1' : '?0'
      const platform = uaPlatformHint(ua)
      headers['sec-ch-ua-platform'] = `"${platform}"`
      // 2-fetcher② 增强: 与 platform 配套的低熵 Client Hints(Chrome 100+ 全量发送)
      headers['sec-ch-ua-platform-version'] = uaPlatformVersionFor(ua, platform)
      headers['sec-ch-ua-arch'] = uaArchFor(ua, platform)
      headers['sec-ch-ua-bitness'] = '64'
      headers['sec-ch-ua-model'] = uaModelFor(ua, mobile, platform)
      headers['sec-ch-ua-wow64'] = '?0'
    }
  }
  return headers
}

/** Accept-Language: 按 UA 平台/语言段推导 —— zh-cn UAs → zh-CN,zh;q=0.9,en;q=0.8;
 *  en-US UAs → en-US,en;q=0.9; ja_JP UAs → ja,en-US;q=0.9,en;q=0.8。原先一律硬编码
 *  zh-CN Accept-Language, 与 en-US / ja-JP UA 不配套(破绽指纹) */
// [R11-b-EN-4] 增强: Accept-Language 方言池(FETCH_AL_POOL=1, 缺省关闭零回归) ——
//  同一工具全量请求发出逐字节相同的 Accept-Language, 是可聚类指纹面(与 UA 池同理);
//  开启后按【目标 host】djb2 确定性抽取方言变体(同站恒同值, 会话内不跳变; 跨站分散),
//  变体仅调 q 权重/次级语言, 首选语言仍与 UA locale 自洽(zh UA 永远 zh-CN 打头)。
//  关闭时返回值与旧版逐字节一致(每分支首项即原值)。注: 头序随机化不在本轮落地 ——
//  [R9-a-11] 已论证真实浏览器头序固定, 随机化反而偏离真值, 维持规范化排序不变
const FETCH_AL_POOL_ENABLED = process.env.FETCH_AL_POOL === '1'
const AL_DIALECT_POOLS: Record<string, string[]> = {
  zh: [
    'zh-CN,zh;q=0.9,en;q=0.8',
    'zh-CN,zh;q=0.9',
    'zh-CN,en;q=0.9',
    'zh-CN,zh;q=0.8,en;q=0.7',
    'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'zh-CN,en-US;q=0.9,en;q=0.8',
    // [R11-b2-1] 修复(Low): 旧版 default 分支值(UA 无 locale 提示时, UA_POOL 全量 UAs 都落此分支)
    // 原先不在池内 → 开启态永远产不出遗留形态, 注释"每分支首项即原值"对 default 分支失真;
    // 补入后部分 host 保持与关闭态逐字节一致, 其余 host 获得方言分散
    'zh-CN,zh;q=0.9,en;q=0.6',
  ],
  en: [
    'en-US,en;q=0.9',
    'en-US,en;q=0.9,zh-CN;q=0.8',
    'en-US,en;q=0.8',
    'en-US,en;q=0.9,ja;q=0.8',
  ],
  ja: [
    'ja,en-US;q=0.9,en;q=0.8',
    'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
    'ja,en;q=0.9',
  ],
}
function alDialectIndexOf(targetUrl: string): number {
  let host = targetUrl
  try { host = new URL(targetUrl).host.toLowerCase() } catch { /* 非法 URL: 用原串哈希 */ }
  let h = 5381
  for (let i = 0; i < host.length; i++) h = ((h << 5) + h + host.charCodeAt(i)) >>> 0
  return h
}
function acceptLanguageFor(ua: string, targetUrl?: string): string {
  // [R11-b-EN-4]: 池化分支(targetUrl 缺省/非法时哈希退化为原串, 结果仍确定性)
  if (FETCH_AL_POOL_ENABLED) {
    const idx = alDialectIndexOf(targetUrl || '')
    if (/zh-cn|zh-CN/i.test(ua)) return AL_DIALECT_POOLS.zh[idx % AL_DIALECT_POOLS.zh.length]
    if (/ja-JP|ja_JP|\bja\b/i.test(ua)) return AL_DIALECT_POOLS.ja[idx % AL_DIALECT_POOLS.ja.length]
    if (/en-US/i.test(ua)) return AL_DIALECT_POOLS.en[idx % AL_DIALECT_POOLS.en.length]
    return AL_DIALECT_POOLS.zh[idx % AL_DIALECT_POOLS.zh.length]
  }
  if (/zh-cn|zh-CN/i.test(ua)) return 'zh-CN,zh;q=0.9,en;q=0.8'
  if (/ja-JP|ja_JP|\bja\b/i.test(ua)) return 'ja,en-US;q=0.9,en;q=0.8'
  if (/en-US/i.test(ua)) return 'en-US,en;q=0.9'
  return 'zh-CN,zh;q=0.9,en;q=0.6'
}

/** sec-ch-ua-platform-version: 与 UA 平台段自洽的版本号
 *  - Windows: 10.0.0(UA 不可区分 Win10/11, 默认 10.0.0; 真实 Chrome 不发 11.0.0 区分)
 *  - macOS: 14.0.0(按 UA Mac OS X 10_15_7 派生, 真实 Chrome 自 14.0.0 起)
 *  - Android: 14.0.0(按 UA Android 14 派生)
 *  - iOS: 17.0.0(按 UA iPhone OS 17_x 派生, 真实 Chromium-on-iOS 不发此头, 仅 Android 实际生效) */
function uaPlatformVersionFor(ua: string, platform: string): string {
  if (platform === 'Windows') return '10.0.0'
  if (platform === 'macOS') return '14.0.0'
  if (platform === 'Android') {
    const m = ua.match(/Android\s+(\d+)/i)
    return m ? `${m[1]}.0.0` : '14.0.0'
  }
  if (platform === 'iOS') {
    const m = ua.match(/iPhone OS\s+(\d+)_/i) || ua.match(/CPU OS\s+(\d+)_/i)
    return m ? `${m[1]}.0.0` : '17.0.0'
  }
  return '10.0.0'
}

/** sec-ch-ua-arch: 按 UA 平台推导 CPU 架构 —— Android/iOS → arm; 桌面(x86_64 / Win64) → x86 */
function uaArchFor(ua: string, platform: string): string {
  if (platform === 'Android' || platform === 'iOS') return 'arm'
  if (/aarch64|arm/i.test(ua)) return 'arm'
  return 'x86'
}

/** sec-ch-ua-model: 移动设备型号(Android Chromium 真实发送, iOS Safari 不发 Client Hints
 *  故此分支在 iOS UA 上永不触达); 桌面空串(Chromium 真实行为)。
 *  - Pixel 8/9 / Samsung SM-S921B/SM-S926B / M2102J2SC → 从 UA 提取设备型号段
 *  - 构建号形态(M2102J2SC Build/...)截首段防 Build 字串污染模型
 *  [R22-e-5] 修复(Low, 指纹自洽): MIUI 双段 locale UA 形态 'Linux; U; Android 13; zh-cn;
 *  M2102J2SC Build/…)' —— 单段正则的 [^);]+ 不可跨 ';' 整体失配, 修前该 UA 返回【空串
 *  model】(真机此头发送 'M2102J2SC', 空型号是可聚类指纹破绽); 现单段失配时用双段正则
 *  取 locale 段之后的型号段。标准 'Android X; <model>)' 单段形态逐字节不变 */
function uaModelFor(ua: string, mobile: boolean, _platform: string): string {
  if (!mobile) return ''
  // Android Chromium: 抽取 "Android X; <model>" 段
  const m = ua.match(/Android\s+\d+;\s*([^);]+)\)/i)
  if (m) {
    const model = m[1].trim()
    const short = model.split(/\s+Build\//i)[0].trim()
    return short
  }
  // [R22-e-5]: 双段形态 'Android X; <locale>; <model> Build/…)' → 取型号段
  const m2 = ua.match(/Android\s+\d+;\s*[^;)]+;\s*([^);]+)\)/i)
  if (m2) return m2[1].trim().split(/\s+Build\//i)[0].trim()
  return ''
}

// ---------- Cookie 罐 (按域名) ----------
/** 会话条目 TTL(ff-b 增强④): 挑战/会话 Cookie(如 cf_clearance)与出口 IP+UA 绑定,
 *  30 分钟前的陈旧会话继续携带反而是"过期会话+拒绝服务"的 403 诱因 —— 真实浏览器
 *  会话同样有时效。过期条目在 get/count 惰性清扫; 跨请求复用本体(按 host 缓存、
 *  下次同 host 直接带)是既有 autoCookie 全局罐能力, 本轮仅补时效与失效清理 */
const COOKIE_SESSION_TTL_MS = 30 * 60 * 1000

// R6-1: 提取 origin 字符串中的 hostname(去 scheme/port) ——
//  CookieJar.store/get 接收的 domain 是 originHost(url) = `https://www.example.com` 形态(origin),
//  需从中取 hostname(www.example.com)做父域拆分。URL 解析失败返回空字符串。
function hostOf(origin: string): string {
  if (!origin) return ''
  try {
    return new URL(origin).hostname.toLowerCase().replace(/^\[|\]$/g, '')
  } catch {
    // 非 URL 形态(可能是已剥好的 hostname), 直接小写化返回
    return origin.toLowerCase().replace(/^\[|\]$/g, '')
  }
}

// R6-1: origin/host → 父域链(含自身, 子域在前父域在后) ——
//  例: 'https://a.b.example.com' → ['a.b.example.com', 'b.example.com', 'example.com']
//  例: 'a.b.example.com'          → ['a.b.example.com', 'b.example.com', 'example.com']
//  IP 字面量 / localhost / 单段 host(无点) → [host](仅自身, 无父域可遍历)
//  最多 5 级防病态长 TLD; 用于 CookieJar.get 父域 cookie 合并 + store domain 属性校验
//
// feat-cloak-anticrawler A: 多段 TLD(PSL)识别 ——
//  原 parentDomainChain 按"倒数 N 段累积"做父域拆分, 把 co.uk / com.cn 这类多段 TLD
//  当作普通 host: 'www.example.co.uk' → ['www.example.co.uk', 'example.co.uk', 'co.uk'],
//  'co.uk' 被回填进 CookieJar 时就成了"任一 *.uk 站点 cookie 都共享"的灾难面。
//  修法: 拆分前先扫 KNOWN_MULTI_PART_TLDS, 若 host 末尾匹配某多段 TLD, 把 TLD 段视作
//  原子整体, 只在 TLD 之前的子域链上累积, 不再产生 TLD-only / TLD-父级 这类越权条目。
const KNOWN_MULTI_PART_TLDS = new Set([
  // UK
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'sch.uk', 'nhs.uk', 'police.uk', 'mod.uk',
  // CN
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn', 'mil.cn',
  // HK
  'com.hk', 'net.hk', 'org.hk', 'gov.hk', 'edu.hk', 'idv.hk',
  // TW
  'com.tw', 'net.tw', 'org.tw', 'gov.tw', 'edu.tw', 'mil.tw', 'idv.tw',
  // AU
  'com.au', 'net.au', 'org.au', 'gov.au', 'edu.au',
  // JP
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'ed.jp', 'gr.jp',
  // KR
  'co.kr', 'ne.kr', 'or.kr', 'go.kr', 're.kr', 'pe.kr', 'mil.kr', 'ac.kr',
  // BR
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
  // IN
  'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in', 'res.in', 'firm.in', 'gen.in', 'ind.in',
  // SG
  'com.sg', 'net.sg', 'org.sg', 'gov.sg', 'edu.sg', 'per.sg',
  // US
  'com.us',
  // RU
  'com.ru', 'net.ru', 'org.ru', 'gov.ru',
  // R8-10: 3-segment TLDs —— 3 段 TLD 在公网较少(主要是美国教育/政府/军域),
  // 此处只列出已知的几条; 注: 该列表可能并不完备(完整覆盖需引入 PSL 库, 此处保持低成本兜底)。
  'pvt.k12.ca.us', 'k12.ca.us',
  // cloud / paas 域(用于"操作员代理 / 域名伪造"的混入场景, 默认无主域可拆)
  'github.io', 'gitlab.io', 'appspot.com', 'cloudapp.net', 'herokuapp.com',
  'azurewebsites.net', 'onamazon.com', 'elasticbeanstalk.com',
  'netlify.app', 'vercel.app', 'fastly.net', 'fly.dev', 'deno.dev', 'render.com',
])

function parentDomainChain(origin: string): string[] {
  const host = hostOf(origin)
  if (!host) return []
  // IP 字面量 / localhost / *.localhost → 仅自身, 不做父域遍历
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':')) return [host]
  if (host === 'localhost' || host.endsWith('.localhost')) return [host]
  const parts = host.split('.')
  // 单段(如 'localhost' 已上面处理; 'com' 这类 TLD-only 不应作 host 出现, 但兜底返回自身)
  if (parts.length < 2) return [host]

  // feat-cloak-anticrawler A: 多段 TLD 识别 —— 尝试末尾 2 段 / 3 段 是否命中 PSL,
  // 命中则把 TLD 段视作原子, 不再单独拆出 TLD-only 条目(co.uk 不进 chain)。
  // 末尾 3 段优先校验: 'example.co.uk' → 末尾 'co.uk'(2 段)命中 → TLD='co.uk',
  // 子域链只在 'example' 那一段上累积。
  // R8-10: 3 段 TLD(如 'pvt.k12.ca.us')识别 —— 优先校验末尾 3 段是否命中 PSL,
  // 命中则 TLD='pvt.k12.ca.us'(3 段); 否则继续校验末尾 2 段(原逻辑)。
  // 注: 3 段 TLD 在公网较少且 PSL 列表可能不完备, 此处仅处理已识别的常见条目。
  let tldSegments = 1
  if (parts.length >= 4) {
    const last3 = parts.slice(-3).join('.')
    if (KNOWN_MULTI_PART_TLDS.has(last3)) tldSegments = 3
  }
  if (tldSegments === 1 && parts.length >= 3) {
    const last2 = parts.slice(-2).join('.')
    if (KNOWN_MULTI_PART_TLDS.has(last2)) tldSegments = 2
  }
  const tailEnd = parts.length - tldSegments
  // TLD-only host(如 'co.uk' 本身作 host): 兜底返回自身
  if (tailEnd <= 0) return [host]

  // 倒序累积: parts=[a,b,example,co,uk] + tldSegments=2 →
  //   [a.b.example.co.uk, b.example.co.uk, example.co.uk] (不含 'co.uk')
  const out: string[] = []
  const maxLevels = Math.min(tailEnd, 5) // 最多 5 级, 不含 TLD
  for (let i = 0; i < maxLevels; i++) {
    out.push(parts.slice(i).join('.'))
  }
  return out
}

class CookieJar {
  private jars = new Map<string, Map<string, { v: string; at: number }>>()
  /** 未过期条目判定(过期即惰性删除) */
  private fresh(jar: Map<string, { v: string; at: number }>, k: string, e: { at: number }): boolean {
    if (Date.now() - e.at < COOKIE_SESSION_TTL_MS) return true
    jar.delete(k)
    return false
  }
  /** 2-fetcher Bug 9: 周期性清扫空域名 Map 条目 —— fresh() 删尽条目后罐中保留空 Map,
   *  长任务下域名数量累积泄漏(每章节一个 host, 万章→万 Map 条目)。5min 节流避免
   *  get/count 高频路径每次扫全表(O(N)); 调用方删除当前 jar 后 prune 顺带清扫其它域 */
  private lastPruneAt = 0
  private prune() {
    const now = Date.now()
    if (now - this.lastPruneAt < 5 * 60 * 1000) return
    this.lastPruneAt = now
    const empty: string[] = []
    for (const [domain, jar] of this.jars) {
      // 先惰性清过期, 再看是否空
      for (const [k, e] of jar) this.fresh(jar, k, e)
      if (jar.size === 0) empty.push(domain)
    }
    for (const d of empty) this.jars.delete(d)
  }
  get(domain: string): string {
    // R6-1: 跨子域 cookie 合并 —— R5-6 store() 已把带 `domain=` 属性的 cookie 同时存到
    //  cookie 自身 domain 罐里(如 .example.com → example.com 罐), 但 get() 旧行为只查
    //  精确匹配的 request host 罐, 永远拿不到父域罐中的 cf_clearance 等凭证。
    //  修法: 沿 request host 的父域链逐级合并 ——
    //   host=a.b.example.com → 查 a.b.example.com / b.example.com / example.com 三个罐;
    //   子域 cookie 覆盖父域同名 cookie(更具体的优先, 与浏览器同源 cookie 优先级一致)。
    //  域名拆分用点号分段倒序累积, 最多 5 级(常见域名 ≤3 级, 5 级防病态长 TLD);
    //  IP 字面量/localhost 不做父域遍历(它们不是 DNS 层级结构)。
    const hosts = parentDomainChain(domain)
    if (hosts.length === 0) {
      this.prune()
      return ''
    }
    // 合并: 父域先入, 子域后入覆盖同名键(子域优先)
    const merged = new Map<string, string>()
    for (let i = hosts.length - 1; i >= 0; i--) {
      const jar = this.jars.get(hosts[i])
      if (!jar || jar.size === 0) continue
      for (const [k, e] of jar) {
        if (this.fresh(jar, k, e)) merged.set(k, e.v)
      }
      if (jar.size === 0) this.jars.delete(hosts[i])
    }
    this.prune()
    if (merged.size === 0) return ''
    return Array.from(merged.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
  }
  /** 当前域名已存(未过期)cookie 数(用于判断本次响应是否刚种下新 Cookie)
   *  [R15-d1-7] 入参与 store/get 同口径换算(origin 串 → hostname), 否则 host-only
   *  Cookie 在 count 可见(store 主罐)但发不出(get 查 hostname 键)的分裂状态下
   *  gotNewCookie 检测虽为真、重发请求却不带 Cookie, 挑战重试链空转 */
  count(domain: string): number {
    const jar = this.jars.get(hostOf(domain) || domain)
    if (!jar) {
      this.prune()
      return 0
    }
    let n = 0
    for (const [k, e] of jar) {
      if (this.fresh(jar, k, e)) n++
    }
    const key = hostOf(domain) || domain
    if (jar.size === 0) this.jars.delete(key)
    else this.prune()
    return n
  }
  store(domain: string, setCookieHeaders: string[]) {
    if (!setCookieHeaders?.length) return
    // 2-fetcher Bug 27: 拒收畸形 Set-Cookie。首段无 '=' / 名为属性关键字(Path/Domain/
    // Expires/Max-Age/Secure/HttpOnly/SameSite)的"伪 cookie"原先会被写入罐, 污染后续
    // Cookie 头(发送 "Path=/; Secure" 给服务端, 触发 400 Bad Request)
    const ATTR_NAMES = new Set(['path', 'domain', 'expires', 'max-age', 'secure', 'httponly', 'samesite'])
    // R6-5: 提取 request host 用于校验 Set-Cookie 的 domain 属性 ——
    //  RFC 6265 第 5.3 步 6: 服务端只能为「自己或自己的父域」设置 cookie。
    //  旧行为(R5-6 fix)只看 domain= 属性直接存到该域罐, 未校验 domain 是否为 request host
    //  的父域。攻击者控制 evil.com 即可设 `Set-Cookie: session=evil; domain=google.com`,
    //  cookie 被存到 google.com 罐, 后续请求 google.com 时被发出 → 跨域 cookie 注入。
    //  修法: 解析 domain 属性后, 校验 request host === cookieDomain 或 request host 以
    //  `.cookieDomain` 结尾(子域); 不通过则丢弃 domain 属性, cookie 仅存到 request host
    //  罐(host-only 语义, 与无 domain= 属性的 cookie 同行为)。
    const reqHost = hostOf(domain)
    for (const raw of setCookieHeaders) {
      const [pair] = raw.split(';')
      const idx = pair.indexOf('=')
      if (idx <= 0) continue
      const name = pair.slice(0, idx).trim().toLowerCase()
      if (!name || ATTR_NAMES.has(name)) continue
      // R5-6: 解析 Set-Cookie 的 domain 属性 —— CF clearance 常带 `domain=.example.com`,
      // 旧行为只按请求 URL host(originHost 拿到 www.example.com)存罐, 后续 fetcher 直连
      // api.example.com 时 cookieJar.get('api.example.com') 返回空, cf_clearance 不发, 过盾失败。
      // 修法: 若 Set-Cookie 显式声明 domain=, 把该条 cookie 也存到 cookie 自身 domain 字段
      // (去前导点: '.example.com' → 'example.com') 对应的罐里; 无 domain= 的(默认 host-only)
      // 仍存到调用方传入的 request host 罐里。这样跨子域跳转/直连时凭证能跨子域复用。
      const attrs = raw.split(';').map((s) => s.trim())
      let cookieDomain: string | null = null
      for (const a of attrs) {
        const eq = a.indexOf('=')
        if (eq <= 0) continue
        const ak = a.slice(0, eq).trim().toLowerCase()
        if (ak === 'domain') {
          let dv = a.slice(eq + 1).trim().toLowerCase()
          if (dv.startsWith('.')) dv = dv.slice(1) // 去前导点(.example.com → example.com)
          if (dv) cookieDomain = dv
          break
        }
      }
      // R6-5: domain 属性安全校验 —— cookieDomain 必须是 request host 自身或其父域;
      //  不通过则降级为 host-only(不存副罐)。防跨域 cookie 注入(evil.com 设 domain=google.com)。
      //  parentDomainChain 返回 request host 的所有父域(含自身), cookieDomain 必须在其中。
      //  IP 字面量/localhost 不参与父域校验(parentDomainChain 返回空, 一律降级 host-only)。
      let effectiveCookieDomain: string | null = cookieDomain
      if (effectiveCookieDomain && reqHost) {
        const allowed = parentDomainChain(domain)
        if (!allowed.includes(effectiveCookieDomain)) {
          effectiveCookieDomain = null // 拒绝跨域, 降级为 host-only
        }
      } else if (effectiveCookieDomain && !reqHost) {
        // request host 不可解析(异常 URL), 一律降级 host-only 防注入
        effectiveCookieDomain = null
      }
      const cookieKey = pair.slice(0, idx).trim()
      const cookieVal = pair.slice(idx + 1).trim()
      // 主罐: 按请求 hostname 存 —— [R15-d1-7](High) 修复: 原 key 为调用方传入的 origin
      // 串(如 'https://www.example.com'), 而 get() 沿 parentDomainChain 查询的是 hostname
      // 键('www.example.com'/'example.com'), 两套键空间永不相交 → host-only Set-Cookie
      // (无 domain= 属性, 多数站点的会话 Cookie 形态)存得进但永远发不出, autoCookie
      // 挑战重试链(count 检测到新 Cookie → 重发)全部空转, 持久化 persist/load 后的条目
      // 同样不可达; 只有带 domain= 属性的 CF 形态(落 R5-6 副罐, hostname 键)碰巧可达。
      // 现统一为 hostname 键(浏览器 Cookie 作用域本就不含端口, 回环代理分键同理并集);
      // count/clear/seed 同步换算(hostOf), get() 不变
      const primaryKey = reqHost || domain
      let jar = this.jars.get(primaryKey)
      if (!jar) { jar = new Map(); this.jars.set(primaryKey, jar) }
      jar.set(cookieKey, { v: cookieVal, at: Date.now() })
      // 副罐: cookie 自身 domain 属性指定的域(跨子域场景); R6-5 已校验为合法父域
      // (与主罐同域/同键时不再重复写, 修前 origin 串恒 ≠ hostname 使副罐总是多写一份)
      if (effectiveCookieDomain && effectiveCookieDomain !== reqHost && effectiveCookieDomain !== primaryKey) {
        let jar2 = this.jars.get(effectiveCookieDomain)
        if (!jar2) { jar2 = new Map(); this.jars.set(effectiveCookieDomain, jar2) }
        jar2.set(cookieKey, { v: cookieVal, at: Date.now() })
      }
    }
  }
  seed(domain: string, cookieStr?: string) {
    if (!cookieStr) return
    // [R15-d1-7] 键空间换算与 store/get 对齐(hostOf; origin 串/hostname 双形态兼容)
    const primaryKey = hostOf(domain) || domain
    let jar = this.jars.get(primaryKey)
    if (!jar) { jar = new Map(); this.jars.set(primaryKey, jar) }
    // R3-2: 应用与 store() 同口径的 ATTR_NAMES 过滤 —— 否则 seed('Path=/; Secure; HttpOnly')
    // 形态会把"Path/Secure/HttpOnly"当 cookie 名塞进罐, 后续 buildHeaders 拼出 "Path=/; Secure=..."
    // 头发送给服务端, 触发 400。手工 seed 多见于规则配置的 starter cookies, 字面量常含属性声明
    const ATTR_NAMES = new Set(['path', 'domain', 'expires', 'max-age', 'secure', 'httponly', 'samesite'])
    for (const pair of cookieStr.split(';')) {
      const idx = pair.indexOf('=')
      if (idx <= 0) continue
      const name = pair.slice(0, idx).trim().toLowerCase()
      if (!name || ATTR_NAMES.has(name)) continue
      jar.set(pair.slice(0, idx).trim(), { v: pair.slice(idx + 1).trim(), at: Date.now() })
    }
  }
  /** 清空指定 host 的罐(ff-b): 403 且无新 Cookie 时疑陈旧会话, 清空重走 autoCookie
   *  [R15-d1-7] 入参与 store/get 同口径换算(origin 串 → hostname) */
  clear(domain: string) {
    this.jars.delete(hostOf(domain) || domain)
  }

  /**
   * feat-cloak-anticrawler B: 序列化全罐为 JSON 字符串(供 SIGTERM 持久化到 data/cookies.json)。
   *  仅导出未过期条目, 形态: {"domains":[{"host":"example.com","cookies":[{"name":"k","value":"v","at":1234567890}]}]}
   *  兼容 load() 反向重建; 进程重启后可凭其直接带 cf_clearance 等挑战凭证过盾, 免重新过 CF。
   *  导出前先 prune() 顺带清过期条目(避免序列化已死 cookie 浪费磁盘 / 反序列化后立即过期)
   */
  persist(): string {
    this.prune()
    const domains: Array<{ host: string; cookies: Array<{ name: string; value: string; at: number }> }> = []
    const now = Date.now()
    for (const [host, jar] of this.jars) {
      const cookies: Array<{ name: string; value: string; at: number }> = []
      for (const [k, e] of jar) {
        // 复查未过期(prune 已清过一次, 这里复用 fresh 兜底)
        if (now - e.at >= COOKIE_SESSION_TTL_MS) continue
        cookies.push({ name: k, value: e.v, at: e.at })
      }
      // 空罐跳过, 减少落盘体积
      if (cookies.length > 0) domains.push({ host, cookies })
    }
    return JSON.stringify({ v: 1, ts: now, domains })
  }

  /**
   * feat-cloak-anticrawler B: 从 persist() 的 JSON 字符串重建罐(启动时加载 data/cookies.json)。
   *  - 形态不匹配/解析失败: 静默清空当前罐 + 警告日志, 不抛错(零回归: 不阻断启动)
   *  - 加载后保留过期边界判定(fresh() 复查), 30 分钟 TTL 之外条目立即过期不参与合并
   *  - 旧罐条目不保留(全量替换语义, 与持久化时点对齐); 调用方负责先 persist 旧罐再 load 新罐
   */
  load(json: string): void {
    let parsed: { v?: number; domains?: Array<{ host: string; cookies: Array<{ name: string; value: string; at: number }> }> } | null = null
    try {
      parsed = JSON.parse(json)
    } catch {
      console.warn('[fetcher] cookieJar.load: JSON 解析失败, 罐保持空')
      this.jars.clear()
      return
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.domains)) {
      console.warn('[fetcher] cookieJar.load: 形态不匹配(缺 domains), 罐保持空')
      this.jars.clear()
      return
    }
    this.jars.clear()
    const now = Date.now()
    for (const d of parsed.domains) {
      if (!d || typeof d.host !== 'string' || !Array.isArray(d.cookies)) continue
      const jar = new Map<string, { v: string; at: number }>()
      for (const c of d.cookies) {
        if (!c || typeof c.name !== 'string' || typeof c.value !== 'string' || typeof c.at !== 'number') continue
        // 跳过已过期条目(避免一加载就被静默清理占内存)
        if (now - c.at >= COOKIE_SESSION_TTL_MS) continue
        jar.set(c.name, { v: c.value, at: c.at })
      }
      if (jar.size > 0) this.jars.set(d.host, jar)
    }
  }

  /** feat-cloak-anticrawler B: 当前罐中域名数(供 SIGTERM handler 状态日志用) */
  domainCount(): number {
    let n = 0
    for (const _ of this.jars) n++
    return n
  }
}
const globalForJar = globalThis as unknown as { __novelCookieJar_v3?: CookieJar }
// 版本化缓存键: dev 热更新时旧进程实例可能缺少新方法/旧条目结构(纯字符串 vs 时间戳对象),
// 结构不匹配则重建(v2 纯串实例不含 TTL 时间戳, 复用会让 fresh() 读到 undefined)
// feat-cloak-anticrawler B: 同时校验 persist/load/domainCount 新方法, 防止 dev HMR 复用
// 不含新方法的旧实例(否则 SIGTERM 持久化路径会 TypeError)
function validJar(j: CookieJar | undefined): j is CookieJar {
  return !!j
    && typeof j.count === 'function'
    && typeof j.store === 'function'
    && typeof j.clear === 'function'
    && typeof (j as CookieJar).persist === 'function'
    && typeof (j as CookieJar).load === 'function'
    && typeof (j as CookieJar).domainCount === 'function'
}
export const cookieJar = validJar(globalForJar.__novelCookieJar_v3)
  ? globalForJar.__novelCookieJar_v3
  : new CookieJar()
globalForJar.__novelCookieJar_v3 = cookieJar

// ---------- feat-cloak-anticrawler B/E: Cookie 持久化 + SIGTERM 优雅关闭 ----------
// data/cookies.json 路径(与 storage.ts ensureDirs 同根, 供 SIGTERM 持久化与启动加载复用)
const COOKIE_PERSIST_PATH = 'data/cookies.json'

/**
 * 启动时加载持久化 cookie 罐 —— 进程启动早期调用一次即可(幂等: 重复调用会覆盖当前罐)。
 * 文件不存在/解析失败/形态不匹配 → 静默跳过(零回归: 不阻断启动, 仅丢失上次会话凭证)。
 * 加载成功后旧罐条目被覆盖(与 persist 时点对齐); 调用方需在启动后立即调用, 避免在采集
 * 进行中调用导致正在使用的 cookie 被清空。
 */
export function loadCookieJarFromDisk(): void {
  try {
    // node:fs 同步读取(启动期阻塞可接受; 异步读取需保证后续 fetch 在加载完成前不触发,
    // 复杂度更高且引入时序竞态, 故启动期同步加载)
    // [R9-a-3] 修复: require 在 ESM/Turbopack 打包产物中可能不存在 → 原实现静默 return,
    // cookie 罐磁盘加载永久失效。优先 process.getBuiltinModule(Node≥22.3/Bun 同步取原生模块),
    // 回退 require(旧路径)
    const procFs = process as unknown as { getBuiltinModule?: (id: string) => typeof import('node:fs') }
    const fs: typeof import('node:fs') | null =
      (typeof procFs.getBuiltinModule === 'function' ? procFs.getBuiltinModule!('node:fs') : null) ??
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (typeof require === 'function' ? (require('node:fs') as typeof import('node:fs')) : null)
    if (!fs) return
    if (!fs.existsSync(COOKIE_PERSIST_PATH)) return
    const json = fs.readFileSync(COOKIE_PERSIST_PATH, 'utf8')
    if (typeof json === 'string' && json.length > 0) {
      cookieJar.load(json)
      // [R10-c-4] 清理评估: 本文件全部 40+ 处 console.* 保持裸用不换 logger —— 本模块为采集
      // 基础库, 日志均为运维可读的单行文本(与既有 console.warn 主体格式一致), 且启动/关停
      // 三个 log 是进程生命周期一次性事件; 换 logger 会输出 JSON 行, 同文件内两种格式混杂
      // 反而降低终端可读性(理由留档, 非遗漏)
      console.log(`[fetcher] cookie jar 已从 ${COOKIE_PERSIST_PATH} 加载(${cookieJar.domainCount()} 域)`)
    }
  } catch (e: any) {
    console.warn(`[fetcher] 加载 cookie jar 失败(忽略, 继续空罐启动): ${String(e?.message || e).slice(0, 120)}`)
  }
}

/**
 * 在飞请求计数器 —— 用于 SIGTERM 时"等待在飞请求最多 10s"的判定。
 * 每次 fetchPage 入口 +1, 出口(无论成功失败) -1。
 */
let inFlightFetchCount = 0
function enterInFlight(): void { inFlightFetchCount++ }
function leaveInFlight(): void { inFlightFetchCount = Math.max(0, inFlightFetchCount - 1) }

/**
 * feat-cloak-anticrawler F: 全局并发信号量 —— 跨 host 共享, 限制"全局总在飞"请求上限,
 * 防 hostGate(per-host)无法表达的多任务并行 + 多镜像 host 累积在飞撑爆内存。
 *
 * 设计(与 hostgate 同款 FIFO + 无偏向容量复查语义, 但极简化无速率/降额维度):
 *  - acquire(limit): 满 limit 则排队等待, 直到 inFlight < limit 才放行并 inFlight++
 *  - release(): inFlight-- 且唤醒一个排队者
 *  - 挂到 globalThis 防 dev HMR 多实例: 全局信号量在跨请求间共享, 单例必需
 *  - 无超时上限(让上层 fetchPage 的 cfg.timeout 兜底, 不再叠加上层等待时间)
 */
interface GlobalSemaphore {
  inFlight: number
  waiters: Array<() => void>
}
const globalForSem = globalThis as unknown as { __novelGlobalSem_v1?: GlobalSemaphore }
const globalSem: GlobalSemaphore = globalForSem.__novelGlobalSem_v1 ?? { inFlight: 0, waiters: [] }
globalForSem.__novelGlobalSem_v1 = globalSem

// R8-19: OOM backpressure 全局协调 —— 挂到 globalThis 防 dev HMR 多实例;
// 第一个检测到内存压力的请求置 active=true + until=now+5s, sleep 5s 让 GC 回收;
// 后续并发请求看到 active=true 等待 until(不重复 sleep, 避免 N×N 浪费)
interface OomBackpressure {
  active: boolean
  until: number
}
const globalForOom = globalThis as unknown as { __novelOomBackpressure_v1?: OomBackpressure }
const oomBackpressure: OomBackpressure = globalForOom.__novelOomBackpressure_v1 ?? { active: false, until: 0 }
globalForOom.__novelOomBackpressure_v1 = oomBackpressure

async function acquireGlobalSlot(limit: number): Promise<void> {
  if (globalSem.inFlight < limit) {
    globalSem.inFlight++
    return
  }
  // 排队等待, release 时唤醒
  // R8-1: 30s 超时 —— holder 卡死(Playwright 死锁 / cfg.timeout=0 永不释放)时,
  // waiter 不会无限排队; 超时 reject 让上层降级(Obscura 30s 已有 waiter 超时同口径)
  await new Promise<void>((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      // 超时: 从 waiters 移除自身(防 release 后误唤醒已 reject 的 promise)
      const idx = globalSem.waiters.indexOf(wakeup)
      if (idx >= 0) globalSem.waiters.splice(idx, 1)
      reject(new Error('GlobalSemTimeout: 全局并发信号量等待 30s 未获取槽位'))
    }, 30_000)
    if (typeof timer.unref === 'function') timer.unref()
    const wakeup = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve()
    }
    // R8-12: push 到末尾, release 时用 pop() O(1) 取末尾(LIFO 替代 FIFO, 公平性不要求但吞吐量优先)
    globalSem.waiters.push(wakeup)
  })
  // 被唤醒后 inFlight 已被唤醒者 ++ 占位(见 release), 直接返回
}

function releaseGlobalSlot(): void {
  globalSem.inFlight = Math.max(0, globalSem.inFlight - 1)
  // 容量空出后唤醒一个等待者(LIFO: 末尾优先, O(1) 替代 shift 的 O(N))
  // R8-12: shift 是 O(N)(拷贝剩余元素), 高并发下 10000 排队者全部 release 是 O(N²)=100M 操作;
  // pop 是 O(1) 末尾取, 同等吞吐量但 CPU 开销线性。LIFO 不保证公平但对吞吐量更友好
  // (热点 waiter 优先调度, 减少上下文切换)
  const next = globalSem.waiters.pop()
  if (next) {
    // 唤醒者立即占位(inFlight++), 避免"先唤醒后竞争"导致 barge 插队
    globalSem.inFlight++
    next()
  }
}

/**
 * feat-cloak-anticrawler G: 路径抖动 —— 跨"不同 URL path"切换时插入 100~500ms 随机延迟。
 * per-host 维护"上次请求的 pathname", 当前请求 path 不同时插入随机延迟并更新记录。
 * 设计要点:
 *  - 仅当 cfg.pathJitter === true 时启用(零回归: 缺省 false 不注入任何延迟)
 *  - per-host: 同 host 不同 path 才抖动(同 path 重复请求如 token 重试不抖动, 避免拖慢重试链)
 *  - 100~500ms: 与真实用户翻页阅读间隔同量级, 不至拖慢采集吞吐
 *  - 全局 Map: 挂到 globalThis 防 dev HMR 多实例; LRU 200 条防泄漏
 */
interface PathJitterState {
  /** host → last pathname seen */
  lastPaths: Map<string, string>
}
const globalForPj = globalThis as unknown as { __novelPathJitter_v1?: PathJitterState }
const pathJitterState: PathJitterState = globalForPj.__novelPathJitter_v1 ?? { lastPaths: new Map() }
globalForPj.__novelPathJitter_v1 = pathJitterState

async function maybePathJitter(url: string, cfg: FetchConfig): Promise<void> {
  if (!cfg.pathJitter) return
  let host = '', path = ''
  try {
    const u = new URL(url)
    host = u.hostname.toLowerCase()
    path = u.pathname
  } catch { return /* URL 解析失败: 跳过抖动, 不阻断抓取 */ }
  if (!host || !path) return
  const last = pathJitterState.lastPaths.get(host)
  // 同 path(如重试/token 挑战)不抖动; 不同 path 才注入延迟
  if (last !== undefined && last !== path) {
    const delay = 100 + Math.floor(Math.random() * 400) // 100~500ms
    await new Promise((r) => setTimeout(r, delay))
  }
  // 更新 last path(无论是否抖动, 让"连续同 path 请求"也能正确判定)
  pathJitterState.lastPaths.set(host, path)
  // LRU 200 条防泄漏(同 cookieJar/domainUa 同款 FIFO 淘汰)
  if (pathJitterState.lastPaths.size > 200) {
    const firstKey = pathJitterState.lastPaths.keys().next().value
    if (firstKey) pathJitterState.lastPaths.delete(firstKey)
  }
}

// ============================================================
// [R9-a Task1-a] B/C 增强: 失败分类分级计数 / host 自适应节奏 / 条件请求协商 / 陷阱信号
// ============================================================

// ---------- B3: 失败分类精细化 ----------
/** 网络/HTTP 失败分类: dns / tls / timeout / conn / http-4xx / http-5xx / other。
 *  分类用于: ① host 节奏惩罚窗取值(403/429 才惩罚); ② hostRhythm.classCounts 分级计数
 *  供降级链决策与观测; ③ 后续可细化 DNS/TLS 差异化重试 */
// [R21-e-5] 精简: HttpFailureClass/classifyHttpFailure 仅文件内消费去 export(rg 全库零外部引用)
type HttpFailureClass = 'dns' | 'tls' | 'timeout' | 'conn' | 'http-4xx' | 'http-5xx' | 'other'

function classifyHttpFailure(e: unknown): HttpFailureClass {
  const err = e as { status?: unknown; code?: unknown; message?: unknown; name?: unknown; isFetchTimeout?: unknown } | null
  const status = typeof err?.status === 'number' && Number.isFinite(err.status) ? err.status : 0
  if (status >= 400 && status < 500) return 'http-4xx'
  if (status >= 500 && status < 600) return 'http-5xx'
  // [R28-4-M2] 仅"源站超时"归 'timeout': isFetchTimeout 由 fetchHttp 计时器 abort 打标(ee-d),
  // OS 层 ETIMEDOUT 在下方 code 分支归 'timeout'。裸 AbortError/ABORT_ERR(无标记, 任务停止/
  // 换代在途中止)归 'other' —— 修前两类合并计 'timeout', 与 runner 侧两分支口径
  // (isFetchTimeout 严格区分"源站超时"与"停止中止", runner.ts 章节错误分类处)漂移,
  // hostRhythm.classCounts['timeout'] 被操作员停止事件污染, "超时率"观测失真
  if (err?.isFetchTimeout === true) return 'timeout'
  if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') return 'other'
  const code = String(err?.code || '')
  const msg = String(err?.message || '')
  if (code === 'ETIMEDOUT') return 'timeout'
  if (/^(ENOTFOUND|EAI_AGAIN)$/.test(code) || /getaddrinfo (ENOTFOUND|EAI_AGAIN)|DNS 解析失败/i.test(msg)) return 'dns'
  if (/^(ECONNREFUSED|ECONNRESET|EPIPE|EHOSTUNREACH|ENETUNREACH|ECONNABORTED)$/.test(code) || /ECONNREFUSED|ECONNRESET|socket hang up/i.test(msg)) return 'conn'
  if (/CERT_|SSL|TLS|handshake/i.test(`${code} ${msg}`)) return 'tls'
  return 'other'
}

// ---------- B2/C: host 自适应节奏(403/429 惩罚记忆 + robots/蜜罐信号学习 + burst-pause) ----------
/**
 * hostgate(并发/限流闸)只覆盖 runner.gateFetch 路径; token 预取/challenge 求解/规则测试
 * 直连等路径绕过闸门。本模块在 fetcher 层维护 per-host 节奏记忆, 与 hostGate 互补:
 *  - 403: 指数退避惩罚窗(1.5s×2^n 钳 20s)×抖动; 429: 优先尊重 Retry-After(钳 20s);
 *  - 敏感信号(meta robots noindex / 蜜罐页)→ 温和降速观察窗(learn 行为, C.4/C.5);
 *  - burst-pause(对抗性 host 10min 内): 每 6~14 个请求随机停顿 0.6~2s(C.3);
 *  - 执行等待全部有界(惩罚窗执行 ≤3s、温和间隔 ≤1.5s、burst 停顿 ≤2s), 不阻塞任务;
 *  - 健康站点零影响(无信号不注入任何延迟); globalThis 版本化防 HMR 多实例
 */
interface HostRhythmState {
  cooldownUntil: number
  forbiddenStreak: number
  rateLimitStreak: number
  /** 对抗性标记窗(403/429/敏感信号任一命中后 10min): burst-pause 仅在此窗口启用 */
  resistUntil: number
  /** B3: 失败分类计数(cls → count), 供降级链决策与观测 */
  classCounts: Record<string, number>
  /** C.4/C.5 敏感观察窗 + 温和间隔 */
  sensitiveUntil: number
  gentleGapMs: number
  burstCount: number
  burstTarget: number
}
const HOST_RHYTHM_CAP = 512
const HOST_SENSITIVE_WINDOW_MS = 10 * 60 * 1000
const HOST_RHYTHM_COOLDOWN_CAP_MS = 20_000
const HOST_RHYTHM_ENFORCE_CAP_MS = 3_000
const globalForRhythm = globalThis as unknown as { __novelHostRhythm_v1?: Map<string, HostRhythmState> }
const hostRhythm: Map<string, HostRhythmState> = globalForRhythm.__novelHostRhythm_v1 ?? new Map()
globalForRhythm.__novelHostRhythm_v1 = hostRhythm

function hostKeyOf(url: string): string {
  try { return new URL(url).host.toLowerCase() } catch { return '' }
}

function rhythmStateOf(host: string): HostRhythmState | null {
  if (!host) return null
  let st = hostRhythm.get(host)
  if (!st) {
    // FIFO 淘汰(同 domainUa 惯例), 上限防长任务泄漏
    while (hostRhythm.size >= HOST_RHYTHM_CAP) {
      const oldest = hostRhythm.keys().next().value
      if (oldest === undefined) break
      hostRhythm.delete(oldest)
    }
    st = { cooldownUntil: 0, forbiddenStreak: 0, rateLimitStreak: 0, resistUntil: 0, classCounts: {}, sensitiveUntil: 0, gentleGapMs: 0, burstCount: 0, burstTarget: 8 }
    hostRhythm.set(host, st)
  }
  return st
}

/** ±15% 抖动(惩罚/温和等待统一加抖, 防多任务同步对齐) */
function jitter15(v: number): number {
  return Math.max(0, Math.round(v * (0.85 + Math.random() * 0.3)))
}

function recordFailureClass(url: string, cls: HttpFailureClass): void {
  const st = rhythmStateOf(hostKeyOf(url))
  if (!st) return
  st.classCounts[cls] = (st.classCounts[cls] || 0) + 1
}

/** 403/429 惩罚记忆: 429 优先尊重 Retry-After(钳 20s), 其余指数退避; 全部带抖动 */
function noteHostHttpFailure(url: string, status: number, retryAfterMs?: number): void {
  const st = rhythmStateOf(hostKeyOf(url))
  if (!st) return
  const now = Date.now()
  st.resistUntil = now + HOST_SENSITIVE_WINDOW_MS
  if (status === 403) {
    st.forbiddenStreak++
    st.cooldownUntil = now + jitter15(Math.min(HOST_RHYTHM_COOLDOWN_CAP_MS, 1500 * Math.pow(2, Math.min(4, st.forbiddenStreak - 1))))
    // [R28-4-E1] host 级长静默熔断接线: 403 连败≥5 时把该 host 推入 hostgate 5~15min 停手窗
    // (指数+抖动, hostgate 侧 arm), 真被封站自动停手保护出口 IP; 章节保持 fetched=false
    // 增量重试语义不变。返回 false = hostgate 无该 host 账本(未过闸路径)/未达阈值, 无操作
    if (reportHostForbidden(url, st.forbiddenStreak)) {
      console.warn(`[fetcher] host 级熔断已触发: 403 连续 ${st.forbiddenStreak} 次, 长静默见 hostgate 日志: ${url.slice(0, 120)}`)
    }
  } else if (status === 429) {
    st.rateLimitStreak++
    const base = typeof retryAfterMs === 'number' && retryAfterMs > 0
      ? Math.min(HOST_RHYTHM_COOLDOWN_CAP_MS, retryAfterMs)
      : Math.min(HOST_RHYTHM_COOLDOWN_CAP_MS, 1000 * Math.pow(2, Math.min(4, st.rateLimitStreak - 1)))
    st.cooldownUntil = now + jitter15(base)
  }
}

/** 成功记账: 干净 200 清惩罚链; 被拦(挑战壳)不清, 交由 hostGate/惩罚窗学习 */
function noteHostHttpSuccess(url: string, blocked: boolean): void {
  const st = rhythmStateOf(hostKeyOf(url))
  if (!st) return
  if (!blocked) {
    st.forbiddenStreak = 0
    st.rateLimitStreak = 0
    st.cooldownUntil = 0
  }
  st.burstCount++
}

/** C.4/C.5: 敏感信号学习(noindex/蜜罐页) → 温和降速观察窗 */
function noteHostSensitive(url: string, gapMs: number): void {
  const st = rhythmStateOf(hostKeyOf(url))
  if (!st) return
  st.sensitiveUntil = Date.now() + HOST_SENSITIVE_WINDOW_MS
  st.resistUntil = st.sensitiveUntil
  st.gentleGapMs = Math.max(st.gentleGapMs, Math.min(1500, Math.round(gapMs)))
}

/** 请求前节奏守门: 惩罚窗等待 > 敏感窗温和间隔 > burst-pause(仅对抗性 host)。全部有界 */
async function maybeHostRhythmDelay(url: string): Promise<void> {
  const st = rhythmStateOf(hostKeyOf(url))
  if (!st) return
  const now = Date.now()
  if (now < st.cooldownUntil) {
    await new Promise((r) => setTimeout(r, jitter15(Math.min(HOST_RHYTHM_ENFORCE_CAP_MS, st.cooldownUntil - now))))
    return
  }
  if (now < st.sensitiveUntil && st.gentleGapMs > 0) {
    await new Promise((r) => setTimeout(r, jitter15(Math.min(1500, st.gentleGapMs))))
    return
  }
  if (st.resistUntil > now && st.burstCount >= st.burstTarget) {
    st.burstCount = 0
    st.burstTarget = 6 + Math.floor(Math.random() * 9) // 6~14 个请求后停顿
    await new Promise((r) => setTimeout(r, 600 + Math.floor(Math.random() * 1400)))
  }
}

// ---------- C.4/C.5: 蜜罐/robots 陷阱信号识别(响应侧, 轻量有界正则) ----------
/** 对抓到的 HTML 做陷阱信号扫描:
 *  - meta robots noindex/none → 站点对本引擎不欢迎(C.5 学习降速);
 *  - 内联隐藏样式锚(display:none/visibility:hidden/font-size:0/opacity:0)≥5 → 疑似
 *    隐藏链接蜜罐页; rel=nofollow 高密度(≥21) → 疑似链接农场页(C.4)。
 *  注: 「发现阶段不跟进蜜罐链接」属 runner/parser 职责(不在本文件分区), 本层以
 *  站点级温和降速响应陷阱信号; 计数用 exec 循环封顶, 单页开销有界 */
function countMatchesBounded(s: string, re: RegExp, cap: number): number {
  let n = 0
  re.lastIndex = 0
  while (n < cap) {
    const m = re.exec(s)
    if (!m) break
    n++
    if (m.index === re.lastIndex) re.lastIndex++
  }
  return n
}

// [R21-e-5] 精简: 仅文件内消费(noteHostSensitive 调用点)去 export(rg 全库零外部引用)
function detectTrapSignals(html: string): { trapGapMs: number; noindex: boolean; hiddenAnchors: number; nofollowAnchors: number } {
  const out = { trapGapMs: 0, noindex: false, hiddenAnchors: 0, nofollowAnchors: 0 }
  if (!html) return out
  const head = html.slice(0, 8192)
  const metaRobots = head.match(/<meta[^>]{0,200}name\s*=\s*["']?robots["']?[^>]{0,300}>/i)
  if (metaRobots && /content\s*=\s*["']?[^"'>]*(noindex|none)/i.test(metaRobots[0])) out.noindex = true
  out.hiddenAnchors = countMatchesBounded(html.slice(0, 65536), /<a\b[^>]{0,400}?(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:px|em|pt|rem)?\s*[;"]|opacity\s*:\s*0(?:\.0+)?\s*[;"])[^>]{0,400}>/gi, 6)
  out.nofollowAnchors = countMatchesBounded(html.slice(0, 65536), /rel\s*=\s*["']?[^"'>]*nofollow/gi, 21)
  if (out.noindex) out.trapGapMs = 600
  if (out.hiddenAnchors >= 6) out.trapGapMs = Math.max(out.trapGapMs, 900)
  if (out.nofollowAnchors >= 21) out.trapGapMs = Math.max(out.trapGapMs, 800)
  return out
}

// ---------- B1: 条件请求协商(ETag/Last-Modified → If-None-Match/If-Modified-Since) ----------
/**
 * 仅 native/relay 传输(fetchHttp)启用; curl 链不注入条件头。304 命中返回缓存 html
 * —— 不算失败、不进重试/退避链。增量续采(目录页周期性复查)/镜像重试等重复抓取场景
 * 显著省带宽且对站点更友好(真实浏览器二次导航同样发条件头, 指纹无害)。
 * 缓存有界: 256 条 × body ≤256KB × TTL 10min; UA+Cookie 变体隔离(登录态/挑战 cookie
 * 内容差异不串缓存); token 预取/challenge 求解/contentProxy 路径显式禁用(要求每次新响应)。
 * 注: FetchConfig 接口在 types.ts(本轮只读分区), 以交叉类型 FetchCfgOpt 读取可选开关。
 */
type FetchCfgOpt = FetchConfig & { conditionalGet?: boolean; /** [R28-4-E2] 403/429 换档重试注入的显式档位(传输态, 不进规则 JSON/sanitize) */ impersonateTierOverride?: string }
interface CondCacheEntry { html: string; etag: string; lastModified: string; at: number }
const COND_CACHE_MAX = 256
const COND_CACHE_TTL_MS = 10 * 60 * 1000
const COND_CACHE_BODY_MAX = 256 * 1024
const globalForCond = globalThis as unknown as { __novelCondCache_v1?: Map<string, CondCacheEntry> }
const condCache: Map<string, CondCacheEntry> = globalForCond.__novelCondCache_v1 ?? new Map()
globalForCond.__novelCondCache_v1 = condCache

function condCacheKey(url: string, ua: string, cookie: string): string {
  return `${url}\u0001${ua}\u0001${cookie}`
}

function condCacheGet(key: string): CondCacheEntry | null {
  const e = condCache.get(key)
  if (!e) return null
  if (Date.now() - e.at >= COND_CACHE_TTL_MS) {
    condCache.delete(key)
    return null
  }
  return e
}

function condCacheSet(key: string, html: string, etag: string, lastModified: string): void {
  if (!etag && !lastModified) return
  if (condCache.size >= COND_CACHE_MAX) {
    const now = Date.now()
    for (const [k, e] of condCache) {
      if (now - e.at >= COND_CACHE_TTL_MS) condCache.delete(k)
    }
    while (condCache.size >= COND_CACHE_MAX) {
      const oldest = condCache.keys().next().value
      if (oldest === undefined) break
      condCache.delete(oldest)
    }
  }
  condCache.set(key, { html, etag, lastModified, at: Date.now() })
}

/**
 * 优雅关闭已注册标志(防 SIGTERM 多次触发重复执行关闭流程)。
 * 挂到 globalThis 防 dev HMR 多次注册 handler。
 */
const globalForShutdown = globalThis as unknown as { __novelShutdownRegistered_v1?: boolean }
let shutdownInProgress = false

/**
 * 注册 SIGTERM / SIGINT 优雅关闭 hook:
 *  1. 持久化 cookieJar 到 data/cookies.json(挑战凭证 cf_clearance 等下次启动可复用)
 *  2. shutdownObscura 关闭浏览器实例与槽位 ctx
 *  3. 等待在飞 fetchPage 请求最多 10s(避免半路杀掉 fetcher 导致 cf_clearance 不写入罐)
 *  4. exit(0) 退出
 *
 * 注: CloakBrowser(端口 3016)是独立 bun 进程, 由其自身的 SIGTERM handler 关闭
 * 浏览器实例(本进程无法跨进程关闭其 browser); cookie jar 已持久化的部分覆盖 CloakBrowser
 * 通过 Set-Cookie 头写回的 cf_clearance(由 fetcher.renderWithBrowser → cookieJar.store 落罐)。
 *
 * runner.ts 侧的"任务进度落库"由 saveProgress 在每次抓取批次后即时落库, SIGTERM 时
 * 最多丢失"未到下一 saveProgress 检查点"的少量进度(已被持久化过的进度不丢失)。
 */
export function registerGracefulShutdown(): void {
  if (globalForShutdown.__novelShutdownRegistered_v1) return
  globalForShutdown.__novelShutdownRegistered_v1 = true
  const handler = (sig: string) => {
    if (shutdownInProgress) return
    shutdownInProgress = true
    console.log(`[fetcher] 收到 ${sig}, 开始优雅关闭(cookieJar 持久化 + Obscura 关闭 + 等在飞)`)
    void (async () => {
      // 1. cookie jar 持久化(同步 fs 写 + fsync, 防 exit 前 IO 没刷盘)
      try {
        // [R9-a-3] 同 loadCookieJarFromDisk: getBuiltinModule 优先, require 兜底(防 ESM 下静默丢持久化)
        const procFs = process as unknown as { getBuiltinModule?: (id: string) => typeof import('node:fs') }
        const fs: typeof import('node:fs') | null =
          (typeof procFs.getBuiltinModule === 'function' ? procFs.getBuiltinModule!('node:fs') : null) ??
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          (typeof require === 'function' ? (require('node:fs') as typeof import('node:fs')) : null)
        if (fs) {
          const json = cookieJar.persist()
          // data 目录可能不存在(冷启动), mkdirSync 同步创建
          try { fs.mkdirSync('data', { recursive: true }) } catch { /* 已存在 */ }
          // R8-15: 使用 openSync + writeFileSync + fsyncSync + closeSync 替代 writeFileSync(path, ...),
          // 强制 OS buffer 刷盘, 防硬崩溃/断电导致 cookieJar 文件截断/损坏(JSON.parse 失败 → 空罐)
          const fd = fs.openSync(COOKIE_PERSIST_PATH, 'w')
          try {
            fs.writeFileSync(fd, json, 'utf8')
            try { fs.fsyncSync(fd) } catch { /* 某些文件系统不支持 fsync, 忽略 */ }
          } finally {
            try { fs.closeSync(fd) } catch { /* ignore */ }
          }
          console.log(`[fetcher] cookie jar 已持久化到 ${COOKIE_PERSIST_PATH} (${cookieJar.domainCount()} 域)`)
        }
      } catch (e: any) {
        console.warn(`[fetcher] cookie jar 持久化失败(忽略): ${String(e?.message || e).slice(0, 120)}`)
      }
      // 2. Obscura 关闭(独立 try, 失败不阻断后续)
      try { await shutdownObscura() } catch (e: any) {
        console.warn(`[fetcher] Obscura 关闭失败(忽略): ${String(e?.message || e).slice(0, 120)}`)
      }
      // 3. 等待在飞请求(最多 10s; in-flight 计数降为 0 即提前退出)
      const waitDeadline = Date.now() + 10_000
      while (inFlightFetchCount > 0 && Date.now() < waitDeadline) {
        await new Promise((r) => setTimeout(r, 200))
      }
      if (inFlightFetchCount > 0) {
        console.warn(`[fetcher] 优雅关闭超时, 仍有 ${inFlightFetchCount} 个在飞请求, 强制退出`)
      }
      // 4. exit
      process.exit(0)
    })()
  }
  try {
    process.once('SIGTERM', () => handler('SIGTERM'))
    process.once('SIGINT', () => handler('SIGINT'))
  } catch { /* 某些运行时 process 只读, 忽略 */ }
}


// ---------- 编码识别 ----------
function stripBom(s: string): string {
  // 去 UTF-8 BOM(\uFEFF): 避免首段隐形字符污染标题匹配/正文开头
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/** [R28-4-L4] 前 64K 字符采样统计 U+FFFD 数量(有界, 10MB 串不全量扫) */
function countReplacementChars(s: string): number {
  const probe = s.length > 65536 ? s.slice(0, 65536) : s
  let n = 0
  let idx = probe.indexOf('\uFFFD')
  while (idx >= 0) { n++; idx = probe.indexOf('\uFFFD', idx + 1) }
  return n
}

/** [R28-4-L4] FFFD 密度异常判定: ≥8 个且占比 ≥0.2% —— 正常文本页不应出现替换符,
 *  误报面集中在"内容刻意含 FFFD 字符"(罕见)与"截断多字节序列尾部"(单个, 远低于阈值) */
function isFffdDense(s: string): boolean {
  const probe = s.length > 65536 ? s.slice(0, 65536) : s
  if (!probe.length) return false
  const n = countReplacementChars(probe)
  return n >= 8 && n / probe.length >= 0.002
}

function decodeBuffer(buf: ArrayBuffer, contentType?: string): string {
  let charset = ''
  const ct = contentType || ''
  // 兼容 charset="gb2312" / charset='gbk' 引号变体(原正则遇到引号即失配, 编码退化为 utf8 产生乱码)
  const m1 = ct.match(/charset\s*=\s*["']?([\w-]+)/i)
  if (m1) charset = m1[1]
  // [R28-4-L4] 嗅探窗 2048→8192: GBK 站 <head> 前置超长注释/统计脚本(>2KB)时 meta charset
  // 落在窗外, 探测落空退化 utf-8 → 全页 U+FFFD 乱码入库(RESPONSE_SANITY 兜底缺省关)。
  // latin1 解码 + 单次正则开销与窗长线性, 8KB 仍可忽略(响应体上限 10MB)
  const head = Buffer.from(buf.slice(0, 8192))
  if (!charset) {
    const headStr = head.toString('latin1')
    const m2 = headStr.match(/<meta[^>]+charset=["']?([\w-]+)/i)
    if (m2) charset = m2[1]
    else if (headStr.includes('charset=gb')) charset = 'gbk'
  }
  charset = charset.toLowerCase()
  // 2-fetcher Bug 2: gb2312 / gbk 升级为 gb18030(严格超集), 修复 GB18030 字符(部分生僻汉字、
  // 全角符号、4字节汉字)在 gb2312 解码下变 ? 的乱码 —— 真实 iconv gb2312 仅覆盖基本集, GBK 扩展集
  // 与 GB18030 4字节区在 gb2312 模式下被替换为 U+FFFD
  if (charset === 'gb2312' || charset === 'gbk') charset = 'gb18030'
  if (!charset || charset === 'utf-8' || charset === 'utf8') {
    try {
      const utf8 = stripBom(new TextDecoder('utf-8', { fatal: false }).decode(buf))
      // [R28-4-L4] FFFD 密度兜底重解: 无 Content-Type charset 且嗅探窗仍落空时, 高密度
      // U+FFFD(≥8 个且占比 ≥0.2%, 前 64K 字符采样)说明 utf-8 解码失真 —— 按中文小说站
      // 最常见替代编码 gb18030(GBK 严格超集)重解一次, 仅当 FFFD 更少时采纳(有界单次,
      // 防"utf-8 里合法出现少量 FFFD"的误替换; 二进制/非 GBK 站 utf-8 结果原样返回)
      if (!charset && isFffdDense(utf8)) {
        const alt = iconv.decode(Buffer.from(buf), 'gb18030')
        if (countReplacementChars(alt) < countReplacementChars(utf8)) return stripBom(alt)
      }
      return utf8
    } catch { return stripBom(Buffer.from(buf).toString('utf8')) }
  }
  // encodingExists 兜底: 非法/未知名编码(如 x-mac-cyrillic)退回 utf8, 不让 iconv 抛错
  if (iconv.encodingExists(charset)) {
    return stripBom(iconv.decode(Buffer.from(buf), charset))
  }
  return stripBom(Buffer.from(buf).toString('utf8'))
}

// ---------- JS 跳转挑战识别 ----------
/**
 * 判定"JS跳转挑战壳"页:
 *  - 内容 <1200 字 且 含 window.location / location.href / location.replace 等跳转脚本
 *  - 或含 http-equiv="refresh" 且内容很短(<1200)
 * 典型: 反爬中间页只输出一段脚本跳到真实地址 / 首次访问种 Cookie 后刷新
 */
// [R22-e-8] 精简: 去 export(R21-e-5 同款口径, rg 全库含 scripts/archive 零外部 import,
//  仅注释/文档提及) —— 供文件内 isJsChallenge/looksBlocked 互相调用与 fetchPageOnce 消费
function isJsChallenge(html: string): boolean {
  if (!html) return false
  const s = html.trim()
  if (!s) return false
  // 2-fetcher⑤ 增强: 旧版 CF JS 挑战壳特征(cf-chl-bypass), 在短壳内出现即判 JS 挑战;
  // challenge-platform 已在 STRONG_BLOCK_MARKERS / looksBlocked 内强判, 此处不重复触发
  if (s.length < 1200 && /cf-chl-bypass/i.test(s)) return true
  if (s.length >= 1200) return false
  const hasRedirect = /window\.location\s*[.[]|location\.href\s*=|location\.replace\s*\(|location\.assign\s*\(/.test(s)
  const hasRefresh = /http-equiv\s*=\s*["']?refresh/i.test(s)
  return hasRedirect || hasRefresh
}

// ---------- 验证码/拦截特征 ----------
const BLOCK_MARKERS = [
  'captcha', 'verify', '验证码', '安全验证', '滑动验证', '人机验证',
  'access denied', 'forbidden', '请开启javascript', 'enable javascript',
  'just a moment', 'cf-browser-verification', 'checking your browser',
  'cf-chl', 'challenge-platform', 'cf_chl_', 'attention required',
]
/** 结构化挑战标记: 命中即判拦, 不适用"长页面+正常标题"豁免
 *  修复: 与 obscura.looksLikeChallenge 对齐(补 cf-turnstile/ddos-guard 及 CF 中文 Turnstile
 *  页特征)——原先 HTTP 引擎遇到 5165.org 那种中文盾页会漏判为正常内容直接入库 */
const STRONG_BLOCK_MARKERS = [
  'just a moment', 'cf-browser-verification', 'cf-chl', 'challenge-platform',
  'cf_chl_', 'checking your browser', 'attention required',
  'cf-turnstile', 'ddos-guard', 'challenge.js',
  // 2-fetcher③ 增强: WAF 通用拦截页特征补充 —— hCaptcha/Turnstile 旧版 CF/通用 WAF 拦截页
  'cf-chl-bypass',                          // 旧版 CF 挑战壳脚本特征
  'please verify you are a human',          // hCaptcha/Turnstile 验证页
  'enable javascript and cookies',          // 通用 WAF(Akamai/Sucuri)
  '正在进行安全验证', '本网站使用安全服务',
  // 繁体变体(ixdzs 系"請稍等，正在進行安全驗證..."盾页)与"正在验证浏览器"标题站
  // ——原先只配简体, 繁体盾页被漏判为正常内容直接入库
  '正在進行安全驗證', '正在驗證瀏覽器', '正在验证浏览器', '安全驗證',
  // [R15-d1-5] 增强: 挑战页识别面扩充(逐条均有真实站点形态可验证, 且为强指纹不可能误伤正文):
  //  - 'verifying you are human': Cloudflare 2023+ 新版 Turnstile 非交互盾页文案
  //    ("Verifying you are human. This may take a few seconds."), 旧库仅收
  //    'please verify you are a human' 旧变体, 新版盾页漏判为正常内容
  //  - '__jsl_clearance': 加速乐(JiaSuLe)挑战 Cookie 名, 挑战壳内联 JS 回种 Cookie 时
  //    响应体必含此名(静态资源路径/正文不可能出现)
  //  - 'btwaf': 宝塔面板 WAF 拦截页特征路径(/btwaf/… 脚本与样式引用), 同上不可能误伤正文
  'verifying you are human', '__jsl_clearance', 'btwaf',
]

function hasNormalTitle(html: string): boolean {
  const m = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i)
  if (!m) return false
  const t = m[1].trim().toLowerCase()
  if (t.length < 2) return false
  // 修复: 补 '请稍候/请稍後'(CF 中文盾页标题)——原先这类标题被当正常标题豁免, 盾页被当正文
  // [R15-d1-1](Med) 修复: '403'/'404' 由 includes 子串判定改为带分隔上下文的整词判定 ——
  //  章节数字天然含 403/404 子串("第403章"/"第1404章"), 原判定把这些内容页标题误判为
  //  异常标题, 丢掉 hasNormalTitle 豁免后产生两级真实误拦: ①CF Bot Management 正常页
  //  内嵌 jsd 探测脚本时 jsdBenign 豁免失效 → STRONG 'challenge-platform' 命中整章误判
  //  拦截(http 引擎章节全败 / auto 引擎白升级浏览器); ②长内容页跌入前 4000 字特征词扫描,
  //  正文出现"验证码/verify"等词即误拦。现仅 WAF 状态页形态命中("403 forbidden"/
  //  "error 404"/"404: xxx"等); 分隔类排除字母与数字("第1404章"的前导 1 不作分隔,
  //  "4030"不误判), /\p{L}|\p{N}/ 为 ES2018 Unicode 属性类(bun/node 全支持)
  const bad = ['just a moment', 'attention required', 'access denied', 'forbidden', '请开启', '验证', '请稍候', '请稍後']
  if (bad.some((k) => t.includes(k))) return false
  return !/(^|[^\p{L}\p{N}])40[34]([^\p{L}\p{N}]|$)/u.test(t)
}

// [R22-e-8] 精简: 去 export(R21-e-5 同款口径, rg 全库含 scripts/archive 零外部 import,
//  仅注释提及) —— 文件内 fetchPageOnce/looksBlocked 自消费, 判定语义不变
function looksBlocked(html: string, opts?: { status?: number; serverHeader?: string }): boolean {
  if (!html) return true
  // [R13-7] 合法 JSON 响应体整体豁免: JSON API 站(book/detail/toc/content 接口)的短响应
  // 是正常业务信封 —— bqg713 book API 实测 198 字节合法 JSON 被"极短内容判拦"(1248 行)
  // 误拒, book 段采集全断。合法 JSON.parse 成功的结构化数据不可能是渲染挑战页/HTML 盾页
  // (挑战页均以 <html>/<script> 形态返回), 置于 STRONG_BLOCK_MARKERS 之前 —— 正文 JSON
  // 中合法出现的"验证码/安全验证"等词汇不应触发 HTML 特征词库误拦
  if (isPlainJsonBody(html)) return false
  // 2-fetcher③ 增强: HTTP 状态 + WAF Server 头联合判定 —— 403/429/503 + cloudflare/akamai/
  // incapsula/sucuri 即判拦(响应体可能为空或极短, 单凭内容特征漏判; 状态信息由调用方传入)
  if (opts?.status && (opts.status === 403 || opts.status === 429 || opts.status === 503)) {
    const srv = (opts?.serverHeader || '').toLowerCase()
    if (srv && /cloudflare|akamai|incapsula|sucuri/.test(srv)) return true
  }
  // 用 isJsChallenge 区分: 极短 JS 跳转壳直接判拦
  if (isJsChallenge(html)) return true
  const lower = html.toLowerCase()
  // CF JS Detections 脚本(challenge-platform/scripts/jsd/main.js)是 Bot Management 下
  // 正常页面普遍内嵌的探测脚本, 不代表当前是挑战页 —— 页面有正常标题且足够长时豁免,
  // 否则真实内容页(101kks 实测)被永久拒收
  const jsdBenign = lower.includes('challenge-platform/scripts/jsd') && html.length >= 1200 && hasNormalTitle(html)
  // 强挑战特征(CF 等): 无论长短一律判拦
  if (!jsdBenign && STRONG_BLOCK_MARKERS.some((k) => lower.includes(k))) return true
  // 保留原规则: 极短内容视为被拦
  if (html.length < 200) return true
  // 2-fetcher③ 增强: 200~500 字短页且可见文本 <50 字 → 疑似空壳拦截页(典型 WAF 占位)
  if (html.length < 500) {
    const visibleText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (visibleText.length < 50) return true
  }
  // 含正常 <title> 且长度 >= 1200 的页面视为正常内容页,
  // 不因正文/导航提及"验证码/verify/enable javascript"等词误判
  if (html.length >= 1200 && hasNormalTitle(html)) return false
  return BLOCK_MARKERS.some((k) => lower.slice(0, 4000).includes(k))
}

// ---------- 浏览器渲染 (Playwright, 惰性加载) ----------
let browserAvailable: boolean | null = null
let browserCheckedAt = 0
let pwModule: any = null
/** 探测失败的重新检查间隔: 原先 false 永久缓存, chromium 后装好/瞬时故障后引擎永远不可用 */
const BROWSER_PROBE_RETRY_MS = 60_000

/** 每域 UA 钉扎: 同域连续请求保持同一 UA —— Cookie 罐是按域共享的, 若每个章节都换 UA,
 *  "同一会话 UA 跳变"本身就是一个典型爬虫特征; 整轮失败时清除钉扎, 下次调用换新身份 */
// R4-7: 版本化缓存键 __novelDomainUa_v3 + 形态校验, 防 dev HMR 模块重载时复用结构已变的旧实例
// (同 CookieJar.validJar 设计; 旧 v2 仅是 plain Map, 无法识别方法缺失/字段漂移)
const globalForUa = globalThis as unknown as { __novelDomainUa_v3?: Map<string, string> }
function validDomainUa(m: unknown): m is Map<string, string> {
  return m instanceof Map
}
const domainUa: Map<string, string> = validDomainUa(globalForUa.__novelDomainUa_v3)
  ? globalForUa.__novelDomainUa_v3 as Map<string, string>
  : new Map<string, string>()
globalForUa.__novelDomainUa_v3 = domainUa

function pickUaFor(domain: string, cfg: FetchConfig): string {
  if (cfg.uaMode === 'custom' && cfg.customUa) return cfg.customUa
  const pinned = domain ? domainUa.get(domain) : undefined
  if (pinned) {
    // ff-b uaMode=mobile/desktop: 钉扎 UA 与请求类别不符(模式在线切换)时重选,
    // 防止"desktop 模式拿到上一次 mobile 钉扎的 iPhone UA"自相矛盾
    if (cfg.uaMode !== 'mobile' && cfg.uaMode !== 'desktop') return pinned
    if (isMobileUa(pinned) === (cfg.uaMode === 'mobile')) return pinned
  }
  // ff-b: mobile/desktop 两档 = 池内移动/桌面子集随机(同域钉扎语义不变);
  // rotate/fixed 维持全池随机
  let ua: string
  if (cfg.uaMode === 'mobile' || cfg.uaMode === 'desktop') {
    const subset = UA_POOL.filter((u) => isMobileUa(u) === (cfg.uaMode === 'mobile'))
    ua = subset.length ? subset[Math.floor(Math.random() * subset.length)] : randomUa()
  } else {
    ua = randomUa()
  }
  if (domain) {
    // R3-1: 原 domainUa.clear() 把站群场景下所有已钉扎 UA 一次性清空, 后续请求全部随机选 UA
    // → 同站会话 UA 跳变被反爬识别。改为按插入序 FIFO 淘汰 20 个最旧条目, 留下近期活跃站点
    if (domainUa.size > 200) {
      let n = 20
      for (const k of domainUa.keys()) {
        if (n-- <= 0) break
        domainUa.delete(k)
      }
    }
    domainUa.set(domain, ua)
  }
  return ua
}

export async function checkBrowser(): Promise<boolean> {
  // 失败结果只缓存 60s: 防瞬时异常把裸 Playwright 降级路径永久判死; 成功结果仍永久缓存
  if (browserAvailable === true) return true
  if (browserAvailable === false && Date.now() - browserCheckedAt < BROWSER_PROBE_RETRY_MS) return false
  try {
    pwModule = await import('playwright')
    const { chromium } = pwModule
    // [R9-a-5] 修复: close() 抛错原先会把【可用】的浏览器探针误判为不可用(探测语义=能否 launch,
    // close 失败只是清理异常), 降级路径被错误禁用 60s
    const probeBrowser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
    try { await probeBrowser.close() } catch { /* close 失败不代表引擎不可用 */ }
    browserAvailable = true
  } catch (e: any) {
    console.warn('[fetcher] playwright chromium unavailable:', e?.message?.slice(0, 120))
    browserAvailable = false
  }
  browserCheckedAt = Date.now()
  return browserAvailable
}

/**
 * 浏览器渲染入口: 优先 Obscura(--stealth 隐身模式: 指纹随机化 + 挑战自动等待 + Cookie 回传),
 * Obscura 不可用或渲染抛错时, 降级回裸 Playwright 直连(renderWithBrowserRaw)。
 * 出口代理(dd-a): 配置了代理且目标非回环时跳过 Obscura 直接走裸 Playwright 专用 launch
 * —— Obscura 单例页面池不支持代理(支持矩阵见代理池段注释), 而裸路径每次请求独立
 * launch, per-context proxy 无槽位复用串扰面。选路统一经 pickProxyFor 单一函数
 */
async function renderWithBrowser(url: string, cfg: FetchConfig, ua: string): Promise<string> {
  if (pickProxyFor(url, cfg)) return renderWithBrowserRaw(url, cfg, ua)
  try {
    if (await checkObscuraAvailable()) {
      const res = await obscuraFetch(url, {
        userAgent: ua,
        timeout: cfg.timeout,
        waitSelector: cfg.waitSelector,
        waitMs: cfg.waitMs,
        // 点击展开懒加载内容("点击展开全部目录"交互型站点)
        clickSelector: cfg.clickSelector,
        // 渲染稳定化: AJAX 站点在 waitMs 后仍可能继续注入内容(章节列表/段落组装),
        // 上限取 max(6s, waitMs), 稳定后提前退出
        settleMs: Math.max(6000, cfg.waitMs || 0),
      })
      // 浏览器引擎拿到的挑战凭证(cf_clearance 等)写回 CookieJar —— 打通 HTTP 引擎后续直连
      if (res.cookies.length) cookieJar.store(originHost(url), res.cookies)
      return res.html
    }
  } catch (e: any) {
    console.warn('[fetcher] Obscura 渲染失败, 降级裸 Playwright:', e?.message?.slice(0, 120))
  }
  return renderWithBrowserRaw(url, cfg, ua)
}

/** 裸 Playwright 直连渲染(降级路径, 原 renderWithBrowser 实现)
 *  出口代理(dd-a): 目标非回环且配置了代理时, launch 挂占位全局 proxy(chromium 逐
 *  context 覆盖的前提, Playwright 文档: 所有 context 覆盖后全局值永不使用, 可为任意串)
 *  + newContext 注入真实代理(per-context, 本浏览器实例仅本请求专用, 无共享串扰);
 *  无代理时保持原样 launch(零回归) */
async function renderWithBrowserRaw(url: string, cfg: FetchConfig, ua: string): Promise<string> {
  if (!pwModule) {
    const ok = await checkBrowser()
    if (!ok) throw new Error('浏览器渲染引擎不可用(未安装playwright/chromium), 请使用HTTP引擎')
  }
  const { chromium } = pwModule
  const proxy = pickProxyFor(url, cfg)
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    ...(proxy ? { proxy: { server: 'http://per-context-placeholder' } } : {}),
  })
  const timeoutMs = cfg.timeout && cfg.timeout > 0 ? cfg.timeout : 20000
  try {
    // [R22-e-3] Cookie 注入迁移(修前缺陷): extraHTTPHeaders 是 context 级【全请求】附加 ——
    //  修前罐中/规则 Cookie 以 Cookie 头形态挂上去, 会发给页面加载的每一个跨域子资源与
    //  iframe(cdn/统计域), 既把目标站会话 Cookie 泄漏给第三方域, 又与浏览器自身 Cookie 栈
    //  产生同名重复/覆盖(CF 站浏览器自解出的 cf_clearance 可能被无凭证的注入头压掉)。
    //  现改 ctx.addCookies 按【目标 origin】作用域种入(host-only, 与真实浏览器 Cookie 语义
    //  一致, 同源请求照常携带); addCookies 失败(畸形 cookie 名等)回退 setExtraHTTPHeaders
    //  旧形态保证种子 Cookie 不丢, 双失败则与 Obscura 路径同态(无种子 Cookie)不阻断渲染。
    //  其余头组(Accept/Accept-Language/Referer)维持 extraHTTPHeaders 既有口径不动
    const baseHeaders = buildHeaders(url, cfg, ua)
    const cookieHeaderValue = baseHeaders.Cookie
    if (cookieHeaderValue) delete baseHeaders.Cookie
    const ctx = await browser.newContext({
      userAgent: ua,
      viewport: { width: 1366, height: 768 },
      extraHTTPHeaders: baseHeaders,
      ...(proxy ? { proxy: playwrightProxyParts(proxy) } : {}),
    })
    if (cookieHeaderValue) {
      try {
        const origin = originHost(url)
        const pwCookies = Array.from(mergedCookiePairs([cookieHeaderValue]).entries())
          .map(([name, value]) => ({ name, value, url: origin }))
        if (pwCookies.length) await ctx.addCookies(pwCookies)
        else await ctx.setExtraHTTPHeaders({ ...baseHeaders, Cookie: cookieHeaderValue })
      } catch {
        try { await ctx.setExtraHTTPHeaders({ ...baseHeaders, Cookie: cookieHeaderValue }) } catch { /* 旧行为不可达时按无种子 Cookie 渲染 */ }
      }
    }
    // 反自动化检测脚本
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })
    // hh-d2: 身份脚本(UA 参数化) —— UA/platform/vendor/maxTouchPoints/userAgentData/WebGL 按
    // UA 身份逐 frame 自洽(与 Obscura 隐身栈同一份实现, 降级路径不降指纹)
    await ctx.addInitScript(buildIdentityInitScript(ua))
    const page = await ctx.newPage()
    // hh-d2: CDP Network.setUserAgentOverride(+userAgentMetadata) 让网络层 sec-ch-ua* 头与
    // UA 字符串三方自洽(含移动分支); 与 Obscura 同一 helper, 失败容忍(JS 面仍有身份脚本)
    await applyUaCdpOverride(page, ua)
    if (cfg.waitSelector) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      try { await page.waitForSelector(cfg.waitSelector, { timeout: cfg.waitMs || 8000 }) } catch { /* 容忍 */ }
    } else {
      await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs }).catch(async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      })
    }
    if (cfg.waitMs) await page.waitForTimeout(cfg.waitMs)
    // 点击展开懒加载内容(与 Obscura 路径对齐, 裸 Playwright 降级路径同样支持);
    // gg: 主 frame+跨域 iframe 全遍历(挑战复选框在跨域 iframe 内, dd-d 缺口补齐),
    // 找不到元素静默跳过语义不变
    if (cfg.clickSelector) {
      const clicked = await clickSelectorAnywhere(page, cfg.clickSelector)
      if (clicked) await page.waitForTimeout(1200)
    }
    let html: string
    try {
      html = await page.content()
    } catch {
      // 点击"展开"可能实为链接触发整页导航: content() 在导航提交期间会抛错,
      // 退避后重试一次拿导航后的真实内容, 仍失败才向上抛
      await page.waitForTimeout(1500)
      html = await page.content()
    }
    // R3-5: ctx.close() 在导航残留/TargetClosedError 等场景下会抛错并丢弃已捕获的 html,
    // 改为 try/catch 吞错 —— html 已在内存中, 浏览器侧的 close 失败由 finally 段的
    // browser.close() 兜底回收(进程级单例, 一次失败不阻塞后续渲染)。原实现若 ctx.close
    // 抛错, 整个 try 块抛出到 finally 关 browser 后向上传播, 上层 gateFetch 走 catch
    // 分支不计入正确结果 → 章节丢失
    try { await ctx.close() } catch { /* ignore: html already captured */ }
    return html
  } finally {
    // [R9-a-2] 修复: browser.close() 抛错(浏览器崩溃/TargetClosed)原先会从 finally 重新抛出,
    // 吞掉已捕获的 html —— 与 R3-5 ctx.close 同类缺陷; 浏览器侧回收失败不应使成功渲染内容丢失
    try { await browser.close() } catch { /* html already captured */ }
  }
}

// [R9-a-10] C.1 头一致性硬化: Accept 按浏览器家族取真实导航值 —— 原单一 Chrome 旧式
// 值与池内 Safari/Firefox UA 搭配即自相矛盾指纹(Safari 不发 avif/apng/signed-exchange);
// 另补图片请求专用 Accept(fetchBinary 原先拿 HTML 形态 Accept 抓封面, 同样露馅)
const ACCEPT_HTML_BY_FAMILY: Record<string, string> = {
  chromium: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  firefox: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  safari: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}
const ACCEPT_HTML_DEFAULT = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
const ACCEPT_IMAGE = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'

// [R9-a-11] C.1 头序一致性: 头序本身是 JA4H 类指纹。真实浏览器发送头序是固定的,
// 随机洗牌反而偏离真值 → 按家族真实头序【规范化排序】而非随机化(任务书"头序随机化"
// 以引擎实际可控行为准: curl 链按数组顺序上线, 规范化即生效; native fetch 由运行时管理
// 底层头序, 本排序不破坏语义)。未知头排末尾, 同序稳定(ES2019 sort 稳定性保证)
const HEADER_ORDER_BY_FAMILY: Record<string, string[]> = {
  chromium: ['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'sec-ch-ua-platform-version', 'sec-ch-ua-arch', 'sec-ch-ua-bitness', 'sec-ch-ua-model', 'sec-ch-ua-wow64', 'upgrade-insecure-requests', 'user-agent', 'accept', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-user', 'referer', 'accept-language', 'cookie'],
  firefox: ['upgrade-insecure-requests', 'user-agent', 'accept', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-user', 'referer', 'accept-language', 'cookie'],
  safari: ['upgrade-insecure-requests', 'user-agent', 'accept', 'referer', 'accept-language', 'cookie'],
}

function orderHeadersLikeBrowser(headers: Record<string, string>, family: string): Record<string, string> {
  const order = HEADER_ORDER_BY_FAMILY[family]
  if (!order) return headers
  const idxOf = (k: string): number => {
    const i = order.indexOf(k.toLowerCase())
    return i < 0 ? order.length : i
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers).sort((a, b) => idxOf(a[0]) - idxOf(b[0]))) out[k] = v
  return out
}

/** [R22-e-6] Cookie 键值对合并(重复 helper 收敛: buildHeaders 拼头与 [R22-e-3] 裸 Playwright
 *  addCookies 注入共用同一解析)。同名键后者覆盖(调用方按 [cfg.cookies, jar] 顺序传参,
 *  服务端最新 Set-Cookie 优先, 与既有语义一致)。控制字符(\r\n\0)在入口剥除 —— 修前规则串
 *  /罐中值若混入控制字符, native fetch 构造 Headers 直接抛 TypeError 硬断链路(curl 链有
 *  逐头清洗, native 链漏网); 空名键跳过 */
function mergedCookiePairs(sources: Array<string | undefined>): Map<string, string> {
  const merged = new Map<string, string>()
  for (const src of sources) {
    if (!src) continue
    for (const pair of src.split(';')) {
      const idx = pair.indexOf('=')
      if (idx > 0) {
        const name = pair.slice(0, idx).trim().replace(/[\r\n\0]+/g, '')
        if (name) merged.set(name, pair.slice(idx + 1).trim().replace(/[\r\n\0]+/g, ''))
      }
    }
  }
  return merged
}

/** 头组构造(HTTP 内容链专用; ff-b 增强①: opts.fingerprint=true 时注入完整浏览器指纹头组)
 *  - 指纹纪律: 仅 fetchHttp(逐跳)/fetchViaCurl 传入 fingerprint —— 裸 Playwright 链
 *    (renderWithBrowser)与 fetchBinary 刻意不传: 真浏览器自发自洽的原生 sec-ch-ua/Sec-Fetch-*,
 *    再注入同名头会产生重复/冲突(双值头反而可疑); 资源请求的 Sec-Fetch-Dest 语义也不同
 *  - refererChain(ff-b 增强②): cfg.refererChain && cfg.refererUrl 时 Referer 用运行时注入的
 *    来源页 URL(目录页→书籍页→章节页同链路), 未注入回退站点 origin(零回归)
 *  - 合并次序: 基础头 → 指纹头组 → cfg.headers(规则显式配置最优先, 可覆盖任意单项) */
function buildHeaders(url: string, cfg: FetchConfig, ua: string, opts?: { fingerprint?: boolean; accept?: 'html' | 'image' }): Record<string, string> {
  let origin = ''
  try { origin = new URL(url).origin } catch { /* ignore */ }
  const family = uaFamilyOf(ua)
  const headers: Record<string, string> = {
    'User-Agent': ua,
    // [R9-a-10] Accept 按家族取真值(见上方常量注释); opts.accept='image' 供资源链使用
    Accept: opts?.accept === 'image' ? ACCEPT_IMAGE : (ACCEPT_HTML_BY_FAMILY[family] || ACCEPT_HTML_DEFAULT),
    // [R21-e-2] 增强: AL 改由 UA locale 推导(非 fingerprint 链=封面 fetchBinary/裸 Playwright
    // extraHTTPHeaders 原先硬编码 zh-CN, en-US/ja custom UA 配 zh-CN AL 是可聚类矛盾指纹,
    // 与 R9-a-10 Accept 家族化/R11-b-EN-4 AL 池同一自洽口径)。回归面实测: UA_POOL 35 条中
    // 34 条无 locale 段 → default 分支返回值与原硬编码逐字节一致; 唯一 'zh-cn' Android UA
    // 由 q=0.9,en;q=0.6 变为 locale 配套的 zh-CN,zh;q=0.9,en;q=0.8(同为真实 zh-CN 形态,
    // 自洽性提升); 指纹链同函数同参覆写为同值, 无漂移
    'Accept-Language': acceptLanguageFor(ua, url),
    // [R9-a-12] 移除缺省 Cache-Control: no-cache —— 真实浏览器导航不发送该头(仅硬刷新才发),
    // 常驻发送本身是爬虫指纹且禁用中间缓存白耗带宽; cfg.headers 显式配置仍可覆盖回来
  }
  const chainReferer = cfg.refererChain && cfg.refererUrl ? cfg.refererUrl : ''
  if (opts?.fingerprint) {
    // 指纹头组按【实际选中 UA】+【生效 Referer】推导(Sec-Fetch-Site 语义依赖后者);
    // 先于 cfg.headers 合并 —— 规则显式配置的头永远最优先
    Object.assign(headers, fingerprintHeadersFor(ua, chainReferer || origin, url))
  }
  Object.assign(headers, cfg.headers)
  if (chainReferer) headers.Referer = chainReferer
  else if (cfg.referer !== false && origin) headers.Referer = origin
  // Cookie 合并去重: 同名键以罐中值(服务端最新 Set-Cookie)为准, 避免拼出 "a=1; a=9" 重复 Cookie 头
  // [R22-e-6]: 解析收敛到 mergedCookiePairs(控制字符剥除, native 链 Headers 不再被脏值炸抛)
  // [R28-4-L3] autoCookie=false 只停收不发: 该语义是"不自动收集 Cookie", 修前仍把其它任务/
  // 规则在同域累积的罐中 Cookie(cf_clearance 等会话态)发出去 —— 想以无 Cookie 干净身份采集的
  // 规则实际携带他人会话(跨规则串味, 字段名与行为相悖)。现跳过 jar 合并(显式 cfg.cookies 保留);
  // 三链(fetchHttp 逐跳/curl/fetchBinary)共用本函数, 一处修全链生效。罐【收取】侧各链本就
  // 以 cfg.autoCookie !== false 判定, 不受影响
  const merged = mergedCookiePairs(
    cfg.autoCookie === false
      ? [cfg.cookies]
      : [cfg.cookies, cookieJar.get(originHost(url))],
  )
  if (merged.size) headers.Cookie = Array.from(merged.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
  // [R9-a-11] 指纹链按真实浏览器头序规范化(仅 HTTP 内容链; 裸 Playwright 链交真浏览器自洽)
  if (opts?.fingerprint) return orderHeadersLikeBrowser(headers, family)
  return headers
}

function originHost(url: string): string {
  try { return new URL(url).origin } catch { return '' }
}

/** [R22-e-4] 跨 host 跳剥离规则种子 Cookie(R15-d1-2 的同类缺口补齐): R15-d1-2 只剥了
 *  cfg.cookies 字段, 规则经 cfg.headers 显式配置的 Cookie 头在跨域重定向跳时仍会原样发给
 *  新 host —— 静态头跨域泄漏的漏网面(grep builtin-rules 现无规则使用 headers.Cookie,
 *  纯加固零回归; 罐内 Cookie 由 buildHeaders 按跳域自取不受影响)。
 *  native(fetchHttp)/curl(fetchViaCurl)/binary(fetchBinary) 三链逐跳共用本 helper */
function stripRuleSeedCookie(cfg: FetchConfig): FetchConfig {
  const headers = cfg.headers
  const hasCookieHeader = !!headers && Object.keys(headers).some((k) => k.toLowerCase() === 'cookie')
  if (!cfg.cookies && !hasCookieHeader) return { ...cfg }
  const nextHeaders = hasCookieHeader
    ? Object.fromEntries(Object.entries(headers || {}).filter(([k]) => k.toLowerCase() !== 'cookie'))
    : headers
  return { ...cfg, cookies: undefined, headers: nextHeaders }
}

// ---------- SSRF 守卫 (审计 C2 修复 / 2-fetcher Part A) ----------
/**
 * 引擎层禁止抓取内部/元数据/不可路由地址, 防 SSRF 滥用爬虫引擎打内网。
 * 严格名单(无论 allowLoopback): 云元数据 169.254.169.254 / 链路本地 169.254.0.0/16+fe80::/10 /
 *  CGNAT 100.64.0.0/10 / 私网 10.0.0.0/8 + 172.16.0.0/12 + 192.168.0.0/16 + fc00::/7 /
 *  不可路由 0.0.0.0/8; allowLoopback=true 时放行 127.0.0.0/8 / ::1 / localhost / *.localhost
 *  (供 tokenUrl(127.0.0.1:301x) 与 relay/bridge 内部调用使用)。
 *  字面量 IP 直接判范围; 域名经 node:dns lookup 解析全部地址(v4+v6)逐个比对 —— 防
 *  "外网域名解析到内网 IP" 绕过(如本地 hosts 把 evil.com 指 169.254.169.254)。
 *  DNS 解析结果缓存 60s(Map<hostname, {ips, at}>, 上限 2000 FIFO 淘汰)
 *
 *  R5-19 已知限制(DNS rebinding TOCTOU): 本守卫只校验 DNS 解析得到的 IP 是否安全, 实际
 *  fetch(url) 仍以 hostname 发起连接, 浏览器/Node 会再走一次系统 DNS 查询, 攻击者控制
 *  DNS 即可在守卫通过后把 hostname 重绑到内网 IP(如 169.254.169.254)绕过本守卫。
 *  缓解: 60s DNS 缓存窗口内重绑攻击窗口受限; fetcher 的所有 fetch 走 Caddy 出口代理也
 *  能拆掉部分直连路径。彻底修复需将 DNS 解析结果以 fetch 的 lookup 选项注入(强制走缓存 IP
 *  + Host 头), 当前 fetch 实现不支持自定义 lookup, 列为已知限制, 待引入 undici dispatcher 时收口。
 */
const SSRF_DNS_CACHE_MAX = 2000
const SSRF_DNS_CACHE_TTL_MS = 60_000
const globalForSsrfDns = globalThis as unknown as { __novelSsrfDnsCache_v1?: Map<string, { ips: string[]; at: number }> }
const ssrfDnsCache: Map<string, { ips: string[]; at: number }> = globalForSsrfDns.__novelSsrfDnsCache_v1 ?? new Map()
globalForSsrfDns.__novelSsrfDnsCache_v1 = ssrfDnsCache

/** IPv4 是否合法点分十进制(每段 0-255) */
function isValidIpv4(s: string): boolean {
  const parts = s.split('.')
  if (parts.length !== 4) return false
  return parts.every((p) => /^\d{1,3}$/.test(p) && parseInt(p, 10) <= 255)
}

/** IPv6 字符串展开为 16 字节 Uint8Array; 非法形态返回 null。
 *  接受 :: 简写与 zone-id 后缀; 不接受 v4-mapped 嵌入(由 assertSafeIp 单独兜底) */
function ipv6ToBytes(s: string): Uint8Array | null {
  const addr = s.replace(/^\[|\]$/g, '').split('%')[0]
  if (!addr) return null
  const halves = addr.split('::')
  let head: string[]
  let tail: string[]
  if (halves.length === 2) {
    head = halves[0] ? halves[0].split(':') : []
    tail = halves[1] ? halves[1].split(':') : []
  } else if (halves.length === 1) {
    head = halves[0].split(':')
    tail = []
  } else {
    return null // 多个 :: 非法
  }
  if (head.length + tail.length > 8) return null
  const groups: string[] = []
  for (const g of head) groups.push(g)
  for (let i = 0; i < 8 - head.length - tail.length; i++) groups.push('0')
  for (const g of tail) groups.push(g)
  if (groups.length !== 8) return null
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 8; i++) {
    const g = groups[i]
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null
    const v = parseInt(g, 16)
    bytes[i * 2] = (v >> 8) & 0xFF
    bytes[i * 2 + 1] = v & 0xFF
  }
  return bytes
}

/** 单 IP 黑名单检查(同步, 无 DNS): 返回安全判定 + 拒绝原因 */
function assertSafeIp(ip: string, allowLoopback: boolean): { ok: true } | { ok: false, reason: string } {
  // 云元数据(aws/azure/gcp 通用 169.254.169.254 + GCP alias 169.254.169.253)
  if (ip === '169.254.169.254' || ip === '169.254.169.253' || ip === 'fd00:ec2::254') {
    return { ok: false, reason: `云元数据地址 ${ip} (SSRF 黑名单)` }
  }
  // IPv4 范围检查(每条都用 isValidIpv4 兜底防伪 IP 误判)
  if (isValidIpv4(ip)) {
    if (/^169\.254\./.test(ip)) return { ok: false, reason: `链路本地 169.254.0.0/16 (${ip})` }
    if (/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(ip)) return { ok: false, reason: `CGNAT 100.64.0.0/10 (${ip})` }
    if (/^10\./.test(ip)) return { ok: false, reason: `私网 10.0.0.0/8 (${ip})` }
    if (/^192\.168\./.test(ip)) return { ok: false, reason: `私网 192.168.0.0/16 (${ip})` }
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return { ok: false, reason: `私网 172.16.0.0/12 (${ip})` }
    if (/^0\./.test(ip)) return { ok: false, reason: `不可路由 0.0.0.0/8 (${ip})` }
    if (/^127\./.test(ip)) {
      if (!allowLoopback) return { ok: false, reason: `IPv4 回环 127.0.0.0/8 (${ip}, 未启用 allowLoopback)` }
      return { ok: true }
    }
    return { ok: true }
  }
  // IPv6 范围检查
  const v6 = ipv6ToBytes(ip)
  if (v6) {
    // [R12-c2-3] 未指定地址 :: (全零): 本机实测 bun fetch('http://[::]:P/') 直达 ::1 回环服务
    // (Linux connect(::) 语义与 0.0.0.0 同型, 0.0.0.0/8 已在 v4 分支拒) —— 不论 allowLoopback 一律拒
    if (v6.every((b) => b === 0)) return { ok: false, reason: `IPv6 未指定地址 :: (${ip}, 回环等价)` }
    // [R12-c2-3] NAT64 有界嵌入(RFC 6052): 64:ff9b::/96(知名前缀)与 64:ff9b:1::/48(本地用前缀)
    // 末 4 字节即目标 IPv4 —— 提取后走同一 v4 黑名单, 防 64:ff9b::a9fe:a9fe 形态借 NAT64 网关
    // 触达元数据/私网(allowLoopback 语义随嵌入 v4 判定)
    if (v6[0] === 0x00 && v6[1] === 0x64 && v6[2] === 0xff && v6[3] === 0x9b) {
      const nat64Wk = v6.slice(4, 12).every((b) => b === 0) // 64:ff9b::/96
      const nat64Local = v6[4] === 0x00 && v6[5] === 0x01 && v6.slice(6, 12).every((b) => b === 0) // 64:ff9b:1::/48
      if (nat64Wk || nat64Local) {
        const v4 = `${v6[12]}.${v6[13]}.${v6[14]}.${v6[15]}`
        return assertSafeIp(v4, allowLoopback)
      }
    }
    // fe80::/10 (link-local): 首字节 0xFE, 次字节高 2 位 = 10
    if (v6[0] === 0xFE && (v6[1] & 0xC0) === 0x80) return { ok: false, reason: `IPv6 链路本地 fe80::/10 (${ip})` }
    // fc00::/7 (ULA): 首字节高 7 位 = 1111110 (0xFC or 0xFD)
    if ((v6[0] & 0xFE) === 0xFC) return { ok: false, reason: `IPv6 唯一本地 fc00::/7 (${ip})` }
    // ::1 (loopback)
    const isV6Loopback = v6[15] === 1 && v6.slice(0, 15).every((b) => b === 0)
    if (isV6Loopback) {
      if (!allowLoopback) return { ok: false, reason: `IPv6 回环 ::1 (${ip}, 未启用 allowLoopback)` }
      return { ok: true }
    }
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) 兜底: 提取嵌入的 v4 比对
    const isV4Mapped = v6.slice(0, 10).every((b) => b === 0) && v6[10] === 0xFF && v6[11] === 0xFF
    if (isV4Mapped) {
      const v4 = `${v6[12]}.${v6[13]}.${v6[14]}.${v6[15]}`
      return assertSafeIp(v4, allowLoopback)
    }
    return { ok: true }
  }
  // 非法 IP 形态
  return { ok: false, reason: `非法 IP 形态: ${ip}` }
}

/** DNS 解析(hostname → 全部 v4+v6 地址), 带 60s 缓存 + 2000 上限 FIFO 淘汰。
 *  解析失败(ENOTFOUND/EAI_AGAIN 等)返回空数组, 由调用方判定为 SSRF 拒绝 */
async function resolveAllIps(hostname: string): Promise<string[]> {
  const now = Date.now()
  const cached = ssrfDnsCache.get(hostname)
  if (cached && now - cached.at < SSRF_DNS_CACHE_TTL_MS) return cached.ips
  try {
    const { promises: dnsPromises } = await import('node:dns')
    const results = await dnsPromises.lookup(hostname, { all: true, family: 0 })
    const ips = results.map((r) => r.address)
    // FIFO 淘汰至上限以下
    while (ssrfDnsCache.size >= SSRF_DNS_CACHE_MAX) {
      const oldest = ssrfDnsCache.keys().next().value
      if (oldest === undefined) break
      ssrfDnsCache.delete(oldest)
    }
    ssrfDnsCache.set(hostname, { ips, at: now })
    return ips
  } catch {
    return []
  }
}

/**
 * SSRF 目标安全判定(异步, 因域名需 DNS 解析):
 *  - 非 http/https 协议 → 拒
 *  - 字面量 IP → 直接判范围(含 IPv4-mapped IPv6 兜底)
 *  - localhost / *.localhost → 不走 DNS, 直接按 allowLoopback 判
 *  - 其他域名 → DNS lookup 解析全部地址, 逐个比对黑名单; 任一命中即拒; 解析失败 → 拒
 *  返回 { ok: true } 或 { ok: false, reason }
 */
export async function assertSafeTarget(url: string, opts?: { allowLoopback?: boolean }): Promise<{ ok: true } | { ok: false, reason: string }> {
  const allowLoopback = opts?.allowLoopback === true
  let parsed: URL
  try { parsed = new URL(url) } catch { return { ok: false, reason: `URL 解析失败: ${url.slice(0, 100)}` } }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: `非 http/https 协议: ${parsed.protocol}` }
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!hostname) return { ok: false, reason: 'URL 缺少 hostname' }
  // localhost / *.localhost — 不走 DNS, 直接按 allowLoopback 判
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    if (!allowLoopback) return { ok: false, reason: `localhost 域名 (${hostname}, 未启用 allowLoopback)` }
    return { ok: true }
  }
  // IP 字面量?
  const looksLikeV4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
  const looksLikeV6 = hostname.includes(':')
  if (looksLikeV4 || looksLikeV6) {
    return assertSafeIp(hostname, allowLoopback)
  }
  // 域名 — DNS 解析全部地址, 逐个判
  const ips = await resolveAllIps(hostname)
  if (!ips.length) return { ok: false, reason: `DNS 解析失败: ${hostname}` }
  for (const ip of ips) {
    const r = assertSafeIp(ip, allowLoopback)
    if (!r.ok) return { ok: false, reason: `${hostname} → ${ip}: ${r.reason}` }
  }
  return { ok: true }
}

/** fetchPage 内 loopback 放行判定: URL 必须是操作员配置的 loopback 服务(tokenUrl /
 *  fetch-relay / scrapling bridge)才允许 loopback 抓取 —— 防止规则里塞 127.0.0.1
 *  把内网服务拉爆, 同时不破坏 token 预取/中继/桥接测试链路 */
function loopbackBypassAllowed(url: string, cfg: FetchConfig): boolean {
  if (!isLoopbackTarget(url)) return false
  // [R21-f2-5] 规则级显式声明(fetch.allowLoopback=true): 目标本身是操作员配置的本机转换代理
  // (qimao 127.0.0.1:3013 签名代理作列表/目录源等), 与 tokenUrl/contentProxyUrl 隐式豁免同口径;
  // 仅放宽 loopback, 私网/元数据仍由 assertSafeIp 硬拒
  if (cfg.allowLoopback === true) return true
  let uHost = ''
  let uPort = ''
  try {
    const u = new URL(url)
    uHost = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    uPort = u.port || ''
  } catch { return false }
  const matches = (rawUrl: string): boolean => {
    try {
      // tokenUrl 可能含 {url} 占位符, 替换为合法 URL 后解析
      // R3-3: 原 replace('{url}', ...) 仅替首个占位符, 多占位符模板第二个起漏替换 →
      // URL 解析失败 → matches 返回 false → tokenUrl 配置的回环目标永远拿不到 loopback 豁免。
      // split/join 全量替换保证所有占位符都被替, 与 prefetchToken 内同款修复口径一致
      const u = new URL(rawUrl.split('{url}').join(encodeURIComponent('https://example.com/')))
      return u.hostname.toLowerCase().replace(/^\[|\]$/g, '') === uHost && (u.port || '') === uPort
    } catch { return false }
  }
  if ((cfg.tokenUrl || '').trim() && matches(cfg.tokenUrl!)) return true
  // feat-contentproxy-resume: contentProxyUrl 与 tokenUrl 同口径 —— 操作员配置的回环转换代理
  // (xjp-proxy 127.0.0.1:3015 等), 抓取该代理 URL 走 loopback 豁免(不走出口代理, 不被 SSRF 拒)
  if ((cfg.contentProxyUrl || '').trim() && matches(cfg.contentProxyUrl!)) return true
  if (matches(RELAY_URL)) return true
  if (matches(SCRAPLING_BRIDGE_URL)) return true
  return false
}

// ---------- 出口代理池 (dd-a: proxy rotation, 反反爬核心) ----------
/**
 * 面向 ybswo.com 这类"换出口IP才能过 CF 盾"的站点: FetchConfig.proxyUrl 配置
 * 逗号分隔多条代理, 多条时随机轮换。支持矩阵(本机 Bun 1.3.14 + node v24 实测,
 * 探针与 scripts/verify-dd-a-proxy.ts 记录, 如实不虚报):
 *  - bun 运行时 fetch(scripts/e2e/seed 等 bun 脚本): RequestInit.proxy 支持
 *    http/https(实测生效); socks5 不支持(实测抛 UnsupportedProxyProtocol)
 *    —— 同一请求即时失败并自然落 curl 链, socks5 代理在 http 链的实际生效路径为 curl
 *  - node 运行时 fetch(undici): 【重要】next dev/prod 实测以 node 运行(ps: node …/next dev),
 *    undici fetch 对 RequestInit.proxy 是【静默忽略】(请求伪装直连, 最危险虚报形态) ——
 *    故 node 运行时配置了代理的尝试直接走 curl 链(fetchViaCurl -x, 全形态实测可用),
 *    绝不让代理静默失效; curl 不可用时该次代理尝试如实失败交由轮换/降级接管
 *  - 裸 Playwright(renderWithBrowserRaw): per-context proxy 全形态(bun/node 皆然;
 *    chromium 逐 context 覆盖的前提是 launch 带占位全局 proxy, 见该函数注释)
 *  - Obscura stealth 路径: 不支持代理 —— 单例浏览器页面池按域复用槽位, 若为
 *    per-context proxy 给 launch 挂占位全局 proxy, 无代理 context 会继承占位值
 *    导致直连全断(实测 ERR_PROXY_CONNECTION_FAILED); 故配置了代理的请求跳过
 *    Obscura 直接走裸 Playwright 专用 launch(renderWithBrowser 内分流)
 */
const MAX_PROXY_POOL = 10

/** 当前运行时 fetch 是否原生支持 RequestInit.proxy:
 *  bun 支持(http/https); node/undici 静默忽略(不得伪装直连) */
const PROXY_FETCH_SUPPORTED = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'

/** 代理条目形态校验: scheme 白名单(http/https/socks5(h)/socks4(a)) + 无空白/逗号的
 *  host[:port] 形态(凭证以 http://u:p@host:port 内联), 单条 ≤500 字符。
 *  与 types.ts sanitizeFetchConfig 内联校验同口径(两处保持一致, 改动需同步) */
export function isValidProxySpec(s: string): boolean {
  return s.length <= 500 && /^(https?|socks5h?|socks4a?):\/\/[^\s,]+$/.test(s)
}

/** 代理池解析: 逗号分隔多条, 去空/去重/逐条校验, 上限 MAX_PROXY_POOL */
export function parseProxyPool(proxyUrl: string | undefined | null): string[] {
  if (!proxyUrl) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of proxyUrl.split(',')) {
    const s = raw.trim()
    if (!s || seen.has(s) || !isValidProxySpec(s) || out.length >= MAX_PROXY_POOL) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

/** 回环豁免: 目标 host 为 localhost/*.localhost/127.0.0.0/8/::1 时跳过代理直连
 *  —— 否则本地 mock 服务/token 代理 tokenUrl(如 bqg713-proxy 127.0.0.1:3010)会被代理
 *  转发出不去。hostname 对 IPv6 含方括号需剥离
 *  R3-9: 移除 '0.0.0.0' 分支 —— 它本就由 SSRF 守卫的"不可路由 0.0.0.0/8"规则拦截,
 *  此处把它当 loopback 放行会产生矛盾(走 loopbackBypassAllowed 时若 tokenUrl 指向
 *  0.0.0.0 会因 SSRF 拒; 不指 tokenUrl 时 isLoopbackTarget 又返回 true 让代理豁免,
 *  但 SSRF 拦截依然生效)→ 配置错误日志混乱。直接由 SSRF 守卫统一拒绝更清晰 */
export function isLoopbackTarget(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '')
    return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
  } catch {
    return false
  }
}

// ---------- 代理池状态跟踪(feat-round-8: Feature B3) ----------
/**
 * 进程级代理池运行时状态: useCount(累计使用次数, least-used 策略+round-robin 近似)/
 * failedUntil(失败冷却到期 epoch ms, 0=未失败)。状态不进规则 JSON(sanitize 白名单不
 * 透传运行时字段), 进程级 Map 持久, dev 热更新经 globalThis 复用避免丢状态。
 *
 * 失败语义: 仅"网络层失败"(无 HTTP status — 超时/连接拒绝/DNS/TLS)触发冷却;
 * HTTP 4xx/5xx 是源站行为, 代理本身可能健康(只是被源站识别为爬虫), 不冷却。
 * 冷却时长 30s(与既有 hostGate 限流兜底同口径), 过期自动恢复参与轮换。
 */
interface ProxyState {
  useCount: number
  failedUntil: number
  /** R4-3: 连续失败计数 —— 旧实现固定 30s 冷却, 死代理每 30s 重新尝试一次浪费一次请求。
   *  改为指数退避: cooldown = min(300s, 30s × 2^failures), 死代理冷却期会指数拉长至 5min,
   *  减少无效重试; 任一成功重置为 0 */
  consecutiveFailures: number
  /** [R9-e-2] 增强: 健康度滑动窗口 —— 最近 N 次{ok, latencyMs, at}(FIFO 有界),
   *  供成功率/平均延迟健康评分(PROXY_HEALTH_SCORING=1 时参与选路加权); 纯内存记录
   *  不改变任何既有行为, 仅在选路开关开启时被消费 */
  win?: Array<{ ok: boolean; latencyMs: number; at: number }>
  /** [R9-e-2] 增强: 最近一次网络层封禁(冷却)时刻 ms, 0=无 —— 评分时近期封禁降权 */
  lastBanAt?: number
}
const PROXY_FAIL_COOLDOWN_MS = 30_000
/** R4-3: 指数退避上限 —— 30s × 2^4 = 480s, 钳至 300s 防冷却过长 */
const PROXY_FAIL_COOLDOWN_MAX_MS = 300_000

// [R9-e-2] 增强: 代理健康度评分开关(缺省关闭零回归) —— 开启后选路在既有冷却过滤/
// 轮换策略之上叠加"健康者优先": 缺省 random 策略改为按健康度加权随机, 降级尝试顺序
// 按健康度降序; round-robin/least-used 显式策略语义不变(平摊负载是它们的存在意义)。
// 健康度 = 近窗成功率² × 延迟因子 × 近期封禁降权, 数据来自 markProxy 处的滑动窗口记录
const PROXY_HEALTH_SCORING = process.env.PROXY_HEALTH_SCORING === '1'
/** 健康度滑动窗口容量(每代理最近 N 次) */
const PROXY_HEALTH_WIN = 12
/** 近期封禁降权窗口: 距上次网络层封禁 2min 内健康分 ×0.2 */
const PROXY_HEALTH_BAN_PENALTY_MS = 2 * 60 * 1000
const globalForProxyState = globalThis as unknown as { __novelProxyState_v1?: Map<string, ProxyState> }
const proxyState: Map<string, ProxyState> = globalForProxyState.__novelProxyState_v1 ?? new Map()
globalForProxyState.__novelProxyState_v1 = proxyState

// [R22-e-2] 状态 Map 有界化: proxyState 以【代理串】为键, 单池 ≤10 条但多规则/多任务各配
// 不同代理串时条目只增不减(修前无上限, 长驻进程多套代理配置累积泄漏; 同 hostRhythm 512/
// domainUa 200 同款 FIFO 上限口径)。256 = 25 个满配代理池的容量, 远超现实配置密度
const PROXY_STATE_CAP = 256

/** 获取(或初始化)某代理的运行时状态 */
function getProxyState(proxy: string): ProxyState {
  let s = proxyState.get(proxy)
  if (!s) {
    // FIFO 淘汰: 超上限时按插入序删最旧(使用中的代理下次 get 会重建, 仅丢健康度历史)
    while (proxyState.size >= PROXY_STATE_CAP) {
      const oldest = proxyState.keys().next().value
      if (oldest === undefined) break
      proxyState.delete(oldest)
    }
    s = { useCount: 0, failedUntil: 0, consecutiveFailures: 0 }
    proxyState.set(proxy, s)
  }
  return s
}

/** 代理当前可用(未在冷却期内) */
function isProxyAvailable(proxy: string): boolean {
  const s = proxyState.get(proxy)
  if (!s) return true
  return s.failedUntil <= Date.now()
}

/** 标记代理已被使用(useCount++, 供 least-used/round-robin 策略平摊负载) */
function markProxyUsed(proxy: string): void {
  getProxyState(proxy).useCount++
}

/** 标记代理失败+指数退避冷却(仅网络层失败调用, HTTP 状态错误不冷却)
 *  R4-3: cooldown = min(PROXY_FAIL_COOLDOWN_MAX_MS, PROXY_FAIL_COOLDOWN_MS × 2^consecutiveFailures)
 *  死代理连续失败时冷却指数拉长(30s→60s→120s→240s→300s 上限), 减少无效重试;
 *  代理恢复成功(succeedProxyState) 时 consecutiveFailures 清零 */
function markProxyFailed(proxy: string, cooldownMs = PROXY_FAIL_COOLDOWN_MS): void {
  const s = getProxyState(proxy)
  s.consecutiveFailures++
  // [R9-e-2]: 记录最近封禁时刻(健康度评分近期封禁降权用)
  s.lastBanAt = Date.now()
  // 指数退避: 30s × 2^(failures-1) → 30/60/120/240/480s, 上限 300s
  const exp = cooldownMs * Math.pow(2, Math.max(0, s.consecutiveFailures - 1))
  s.failedUntil = Date.now() + Math.min(PROXY_FAIL_COOLDOWN_MAX_MS, exp)
}

/** 代理请求成功 → 清零连续失败计数(R4-3: 让指数退避在恢复后立即解除) */
function markProxySucceeded(proxy: string): void {
  const s = proxyState.get(proxy)
  if (!s) return
  s.consecutiveFailures = 0
}

/**
 * [R9-e-2] 增强: 记录一次代理传输结果到滑动窗口(FIFO 有界 PROXY_HEALTH_WIN)。
 * 记录本身是纯内存无行为操作(缺省也记录, 开关仅控制选路是否消费):
 *  - ok=true: 拿到源站响应(含 4xx/5xx —— 与既有"源站行为不冷却"同口径, 传输层是通的)
 *  - ok=false: 网络层失败(超时/连接拒绝/DNS/TLS, 代理本身不健康)
 */
function recordProxyOutcome(proxy: string, ok: boolean, latencyMs: number): void {
  const s = proxyState.get(proxy)
  if (!s) return
  const win = s.win || (s.win = [])
  win.push({ ok, latencyMs, at: Date.now() })
  if (win.length > PROXY_HEALTH_WIN) win.shift()
}

/** [R9-e-2] 健康度评分 ∈ (0,1]: 近窗成功率² × 延迟因子(1000/(1000+平均延迟)) × 近期封禁降权。
 *  无数据(新代理/未记录)返回 1(满分) —— 与旧随机选择等价, 新代理不会被历史数据歧视 */
function proxyHealthScore(proxy: string): number {
  const s = proxyState.get(proxy)
  if (!s) return 1
  const win = s.win || []
  if (!win.length) return 1
  let okCount = 0
  let latSum = 0
  let latN = 0
  for (const r of win) {
    if (r.ok) { okCount++; latSum += r.latencyMs; latN++ }
  }
  const rate = okCount / win.length
  // 平均延迟缺省 1500ms(窗口内全失败时取中性值, 避免除零也避免过度惩罚)
  const avgLat = latN > 0 ? latSum / latN : 1500
  const banFactor = s.lastBanAt && Date.now() - s.lastBanAt < PROXY_HEALTH_BAN_PENALTY_MS ? 0.2 : 1
  return banFactor * rate * rate * (1000 / (1000 + avgLat))
}

/** [R9-e-2] 按健康度加权随机(权重下限 0.01 防零权重淘汰, 保留弱代理少量流量作探活) */
function weightedPickByHealth(candidates: string[]): string {
  const weights = candidates.map((p) => Math.max(0.01, proxyHealthScore(p)))
  const total = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < candidates.length; i++) {
    if (r < weights[i]) return candidates[i]
    r -= weights[i]
  }
  return candidates[candidates.length - 1]
}

// ---------- [R28-4-E6] sticky-host 粘滞选路(同 host 成功代理优先复用) ----------
/**
 * 场景: cf_clearance 等挑战 Cookie 与出口 IP 绑定(本文件 Cookie 罐段自述), random/round-robin
 * 轮换会使"IP-A 过盾 → IP-B 带盾访问"互踢 —— 每次轮换都可能作废刚拿到的会话。sticky-host
 * 策略: 同目标 host 稳定粘住同一代理(首个成功后持续复用), 仅当连续网络层失败达
 * PROXY_STICKY_FAILS_TO_SWITCH(2) 次才换池内下一条(确定性顺移一格), HTTP 4xx/5xx
 * (源站行为, 代理健康)不换。状态进程级(globalThis 防 HMR), 有界 FIFO 同 proxyState 口径。
 * 注: key 用 URL host(含非默认端口); 换档记忆 offset 跨重启不持久(会话态, 重建成本一次请求)
 */
const PROXY_STICKY_FAILS_TO_SWITCH = 2
const PROXY_STICKY_CAP = 512
interface ProxyStickyEntry { offset: number; fails: number; proxy: string }
const globalForProxySticky = globalThis as unknown as { __novelProxySticky_v1?: Map<string, ProxyStickyEntry> }
const proxySticky: Map<string, ProxyStickyEntry> = globalForProxySticky.__novelProxySticky_v1 ?? new Map()
globalForProxySticky.__novelProxySticky_v1 = proxySticky

function proxyStickyKeyOf(url: string): string {
  try { return new URL(url).host.toLowerCase() } catch { return '' }
}

/** djb2 稳定哈希(与 curlTlsProfileIndex 同款), sticky 初始下标用 */
function stableHashOf(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

/** sticky-host 选路: 有粘滞条目且代理仍可用 → 复用; 否则按 (host 稳定 hash + 换档 offset)
 *  取池内固定下标起顺找第一条可用代理(命中冷却代理自动顺延), 并登记粘滞条目 */
function stickyPickFor(url: string, pool: string[], available: string[]): string {
  const key = proxyStickyKeyOf(url)
  const entry = key ? proxySticky.get(key) : undefined
  if (entry && available.includes(entry.proxy)) return entry.proxy
  const start = key ? (stableHashOf(key) + (entry?.offset || 0)) % pool.length : 0
  const ordered = pool.slice(start).concat(pool.slice(0, start))
  const pick = ordered.find((p) => available.includes(p)) || available[0]
  if (key && pick) {
    // FIFO 有界防泄漏(同 hostRhythm/proxyState 口径)
    while (proxySticky.size >= PROXY_STICKY_CAP) {
      const oldest = proxySticky.keys().next().value
      if (oldest === undefined) break
      proxySticky.delete(oldest)
    }
    proxySticky.set(key, { offset: entry?.offset || 0, fails: entry?.proxy === pick ? entry.fails : 0, proxy: pick })
  }
  return pick
}

/** sticky 反馈记账(fetchHttpWithCurlFallback 调用): 成功/源站行为(传输层通)清零连败;
 *  网络层失败累计, 达阈值顺移 offset(下一条代理)并清零 —— 实现确定性换档 */
function proxyStickyNote(url: string, proxy: string, ok: boolean): void {
  const key = proxyStickyKeyOf(url)
  if (!key) return
  const entry = proxySticky.get(key)
  if (!entry || entry.proxy !== proxy) return
  if (ok) { entry.fails = 0; return }
  entry.fails++
  if (entry.fails >= PROXY_STICKY_FAILS_TO_SWITCH) {
    entry.offset = (entry.offset + 1) % (1 << 30)
    entry.fails = 0
    console.warn(`[fetcher] sticky-host 换代理: ${key} 连续 ${PROXY_STICKY_FAILS_TO_SWITCH} 次网络层失败, 顺移池内下一条`)
  }
}

/** 判定错误是否属代理网络层失败(应冷却): HTTP status 存在=源站响应, 不冷却;
 *  无 status=网络层(超时/连接拒绝/DNS/TLS/AbortError), 冷却 */
function isProxyNetworkError(e: any): boolean {
  if (typeof e?.status === 'number' && e.status > 0) return false
  return true
}

/**
 * 代理选路(三链路单一收敛点, 返回本次请求使用的代理, ''=直连):
 * - 未配置 / 目标回环 → 直连
 * - 全部代理冷却中 → 直连(降级, 与 fetchHttpWithCurlFallback 末尾降级语义一致)
 * - 否则按 proxyRotationStrategy 选:
 *   • undefined / 'random' (缺省行为): 池中随机一条(与 UA 池同款 random 模式)
 *   • 'round-robin': 池中 useCount 最低的一条(近似顺序轮换, ties 按池顺序首条)
 *   • 'least-used': 池中 useCount 最低的一条(ties 随机打破)
 * 选中的代理 useCount++ (供后续轮换决策); 失败由调用方 markProxyFailed 触发冷却。
 * fetchHttp(bun fetch)/fetchViaCurl(curl)/renderWithBrowserRaw(per-context)一律经
 * 本函数取代理, 避免三处重复实现漂移
 */
export function pickProxyFor(url: string, cfg: FetchConfig): string {
  const pool = parseProxyPool(cfg.proxyUrl)
  if (!pool.length || isLoopbackTarget(url)) return ''
  // feat-round-8: B3 — 过滤冷却中的代理, 全部冷却→直连降级
  const available = pool.filter(isProxyAvailable)
  if (available.length === 0) {
    console.warn(`[fetcher] 全部 ${pool.length} 条代理均在冷却中, 直连: ${url.slice(0, 200)}`)
    return ''
  }
  const strategy = cfg.proxyRotationStrategy
  let pick: string
  if (strategy === 'sticky-host') {
    // [R28-4-E6] sticky-host: 同目标 host 稳定复用同一代理(防 cf_clearance 与出口 IP 互踢),
    // 连续 2 次网络层失败才换下一条(语义见 proxySticky 段注)
    pick = stickyPickFor(url, pool, available)
  } else if (strategy === 'round-robin' || strategy === 'least-used') {
    // useCount 升序(round-robin/least-used 都选最低; ties 处理不同)
    let minCount = Infinity
    const ties: string[] = []
    for (const p of available) {
      const u = getProxyState(p).useCount
      if (u < minCount) { minCount = u; ties.length = 0; ties.push(p) }
      else if (u === minCount) ties.push(p)
    }
    // round-robin: ties 按池顺序首条(稳定); least-used: ties 随机打破
    pick = strategy === 'round-robin' ? ties[0] : ties[Math.floor(Math.random() * ties.length)]
  } else {
    // undefined / 'random' = 随机(原行为, 零回归)
    // [R9-e-2] 增强: PROXY_HEALTH_SCORING=1 时改为健康度加权随机(健康者优先, 弱者保底探活);
    // 开关关闭或池中仅 1 条时与原逐字节一致
    if (PROXY_HEALTH_SCORING && available.length > 1) {
      pick = weightedPickByHealth(available)
    } else {
      pick = available[Math.floor(Math.random() * available.length)]
    }
  }
  markProxyUsed(pick)
  return pick
}

/** 日志用代理脱敏: 隐藏内联凭证(u:p@ → ***@) */
function redactProxy(proxy: string): string {
  // R3-4: 原 [^@/]+ 排除 '/' 字符, 但密码含 '/'(常见于 base64/hex 编码凭证)时正则不匹配,
  // 凭证以明文留在日志。改为仅排除空白与 '/'。
  // [R17-d-1](Med): R3-4 的 [^@\s]+ 在密码含字面 '@'(如 http://admin:p@ss@host:8080,
  // WHATWG/RFC3986 均以最后一个 @ 定界 userinfo)时只吃到首个 @ → 脱敏后 '***@ss@host:8080'
  // 把密码后半段泄进日志(bun 实证)。改 [^/\s]* 贪婪跨 @: 凭证段不可能含字面 '/'(URL 解析
  // 以首个 / 终结 authority), 故最后一个 @ 前、首个 / 后即完整 userinfo —— 多 @ 密码全段隐藏,
  // 无凭证但 path/query 含 @ 的形态因首个 / 截断不会误伤。与 playwrightProxyParts 的
  // URL 解析定界口径一致
  return proxy.replace(/^(https?|socks5h?|socks4a?):\/\/[^/\s]*@/i, '$1://***@')
}

/** Playwright per-context proxy 参数: 内联凭证拆出 username/password
 *  (Playwright 不接受 server 内嵌凭证), 无凭证原样返回 */
function playwrightProxyParts(proxy: string): { server: string; username?: string; password?: string } {
  try {
    const u = new URL(proxy)
    if (u.username || u.password) {
      const out: { server: string; username?: string; password?: string } = {
        server: `${u.protocol}//${u.host}`,
      }
      // [R17-d-2](Low): decodeURIComponent 对合法 %XX 但非法 UTF-8 序列(如密码 'a%80b')
      // 抛 URIError → 外层 catch 落入 { server: proxy } 把内嵌凭证原样交给 Playwright
      // (playwright 要求 server 不带凭证, 连接即败)。逐组件安全解码: 解不开退回原编码值,
      // 保证 server 恒无凭证
      const dec = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }
      const un = dec(u.username)
      const pw = dec(u.password)
      if (un) out.username = un
      if (pw) out.password = pw
      return out
    }
  } catch { /* 已过 isValidProxySpec, 理论不达 */ }
  return { server: proxy }
}

// ---------- HTTP 引擎 ----------
/** 单链最大跳数: 与 undici/浏览器 redirect:follow 默认上限(20)对齐,
 * 超限抛错防重定向环; 逐跳 Set-Cookie 收集依赖自循环, 上限是防环保险丝 */
const MAX_REDIRECT_HOPS = 20

// ---------- Retry-After 头抢救 (ab-b: 429 限流冷却精确感知) ----------
/**
 * 场景(zz-b 遗留收编): 真 429 在 HTTP 引擎以抛错形态抵达 runner.gateFetch, 但抛错对象
 * 原先只保留 status/bodyHtml, Retry-After 头在抛错瞬间丢失 → 限流冷却一律走 30s 兜底。
 * 现把解析出的毫秒值挂到抛错对象新字段 retryAfterMs(既有 status/bodyHtml 行为零变化),
 * runner 抛错路径透传给 reportHostRateLimited —— 服务端给多少歇多久(上限/噪声底由
 * hostgate 侧钳制), 不再盲目硬等 30s。
 * 解析语义(RFC 7231 Retry-After 两种形态):
 *  - 整数秒: '2' → 2000('0' 如实返回 0, <1s 噪声底由 hostgate 兜底 30s);
 *  - HTTP 日期: Date.parse 兜底, 取"距现时刻"毫秒(已过期返回 0);
 *  - 缺失/空/垃圾 → undefined(调用方不挂字段, 上层走 30s 兜底)。
 * 导出供验证脚本直接单测解析语义(verify-ab-b-ratelimit)
 */
export function parseRetryAfterHeaderMs(raw: string | null | undefined): number | undefined {
  const s = (raw ?? '').trim()
  if (!s) return undefined
  if (/^\d+$/.test(s)) {
    const sec = parseInt(s, 10)
    return Number.isSafeInteger(sec) ? sec * 1000 : undefined
  }
  const t = Date.parse(s)
  if (!Number.isFinite(t)) return undefined
  return Math.max(0, t - Date.now())
}

/** 把 Retry-After 毫秒值挂到 HTTP 抛错对象(ab-b): 头缺失/解析失败时不挂字段
 *  (err.retryAfterMs 保持 undefined), 既有 err.status/err.bodyHtml 行为完全不变。
 *  res.headers 兼容 native fetch 与 gg 中继重组形态(均为 Headers 实例) */
function attachRetryAfterMs(err: any, headers: { get(name: string): string | null }): void {
  const ms = parseRetryAfterHeaderMs(headers?.get ? headers.get('retry-after') : null)
  if (ms !== undefined) err.retryAfterMs = ms
}

async function fetchHttp(url: string, cfg: FetchConfig, ua: string, proxy = '', transport: 'native' | 'relay' = 'native'): Promise<string> {
  // 超时防御: 规则配置里 timeout 可能是 0/null/负数, setTimeout(fn, 0) 会立即中止请求
  const timeoutMs = cfg.timeout && cfg.timeout > 0 ? cfg.timeout : 20000
  const controller = new AbortController()
  // ee-d: 本计时器是“超时型 AbortError”的唯一来源(stop 不中止在途——abortControllers 声明后从未使用),
  // 打标后 runner/gateFetch 可区分“源站超时”与“停止/换代在途中止”, 前者计失败嗂 hostGate, 后者才享 x-a 豁免
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  // R4-2: native fetch 响应体大小上限 —— 与 curl 路径 MAX_HTML_BYTES = 10MB 对齐, 防 100MB+
  // 异常响应体 OOM。读前先看 content-length 提前拒绝, 无 content-length 时流式读 + 计数 abort
  const MAX_NATIVE_HTML_BYTES = 10 * 1024 * 1024
  // [R9-e-6] 增强: 响应完整性校验开关(缺省关闭零回归) —— 开启后在成功路径比对
  // Content-Length 与实际读取字节数, 实际 < 声明即判截断失败(交上层既有重试/降级链),
  // 防半截正文入库。仅对无 Content-Encoding 的响应生效: 压缩传输时 CL 头是压缩字节数,
  // 与解压后长度天然不可比, 严禁误判
  const BODY_LEN_CHECK = process.env.FETCH_BODY_LEN_CHECK === '1'
  /** 安全读响应体: content-length 已超限 → 抛 RangeError; body 流式读超限 → 抛 RangeError;
   *  其余情况返回完整 buffer。3xx 与 !ok 分支同样调用此函数, 故错误体也受同一上限保护。
   *  [R9-e-6] strictLen=true(仅成功路径传): 追加"实际字节数 < Content-Length 判截断"校验
   *  (FETCH_BODY_LEN_CHECK=1 时生效; 错误体不做此校验 —— 挑战壳识别不受截断影响) */
  const readBodyCapped = async (res: Response | RelayResponseLike, strictLen = false): Promise<ArrayBuffer> => {
    const cl = Number(res.headers.get('content-length') || 0)
    // [R9-e-6]: 压缩传输(CL 头是压缩字节数, 与解压后长度天然不可比)不参与完整性校验
    const compressed = !!res.headers.get('content-encoding')
    if (cl && cl > MAX_NATIVE_HTML_BYTES) {
      try { await res.body?.cancel().catch(() => {}) } catch { /* ignore */ }
      throw new RangeError(`响应体过大(content-length=${cl} > ${MAX_NATIVE_HTML_BYTES}字节), 已中止`)
    }
    // body 流式读 + 计数; 中继形态无 body 字段或 body 仅 { cancel } 时回退 arrayBuffer()
    const rawBody = res.body as { getReader?: () => any; cancel?: () => any } | null | undefined
    if (!rawBody || typeof rawBody.getReader !== 'function') {
      const buf = await res.arrayBuffer()
      if (buf.byteLength > MAX_NATIVE_HTML_BYTES) {
        throw new RangeError(`响应体过大(${buf.byteLength} > ${MAX_NATIVE_HTML_BYTES}字节, 已读取)`)
      }
      // [R9-e-6]: 截断校验(arrayBuffer 回退形态, 中继重组响应不校验)
      if (strictLen && BODY_LEN_CHECK && cl && !compressed && buf.byteLength < cl) {
        throw new RangeError(`响应体截断(content-length=${cl}, 实际读 ${buf.byteLength} 字节), 判失败交上层重试`)
      }
      return buf
    }
    const reader = rawBody.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    let overflow = false
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_NATIVE_HTML_BYTES) {
        overflow = true
        try { await reader.cancel().catch(() => {}) } catch { /* ignore */ }
        break
      }
      chunks.push(value)
    }
    if (overflow) {
      throw new RangeError(`响应体流式读超 ${MAX_NATIVE_HTML_BYTES}字节上限, 已中止`)
    }
    // [R9-e-6] 增强: 完整性校验(FETCH_BODY_LEN_CHECK=1 且调用方要求严格校验时) ——
    // 服务端声明的字节数未收满 = 传输被掐断(代理/网关掐流常见形态), 半截 HTML 入库会
    // 产生"正文少半截/标签未闭合"脏数据; 抛 RangeError 落入上层既有重试/降级链
    // (fetchHttpWithCurlSingle 同代理落 curl 重取, R9-a2-1 的 curl 退出码校验兜同风险)
    if (strictLen && BODY_LEN_CHECK && cl && !compressed && total < cl) {
      throw new RangeError(`响应体截断(content-length=${cl}, 实际读 ${total} 字节), 判失败交上层重试`)
    }
    const merged = new Uint8Array(total)
    let off = 0
    for (const c of chunks) { merged.set(c, off); off += c.byteLength }
    return merged.buffer as ArrayBuffer
  }
  // 出口代理(dd-a): ''=直连; bun fetch 原生 RequestInit.proxy 仅支持 http/https,
  // socks5 条目在此链即时失败(UnsupportedProxyProtocol)后由 fetchHttpWithCurlFallback
  // 同代理重试 curl 链(-x 全形态), 支持矩阵见代理池段注释
  try {
    // redirect:'manual' 自循环逐跳收集(y-a增强重放, 补 x-a 遗留②): 原先 redirect:'follow'
    // 只能拿到【最终响应】的 Set-Cookie —— 多跳重定向中, 经 301/302 中间跳种会话 Cookie
    // 的站(首访种 Cookie 再跳真实页)中间跳 Cookie 全部丢失, 同站 http→https 升级链路
    // https 侧永远拿不到会话 Cookie(x-a 修复只解决了"归属域", 没解决"只收最终一跳")。
    // 改为逐跳: 每跳 Set-Cookie 归属到【该跳实际 URL】的域键(与 curl 路径按轮归属同语义),
    // 后续跳经 buildHeaders 带上前面跳种下的 Cookie —— 等价于真实浏览器跟随重定向的
    // Cookie 行为。相对 Location 解析; 20 跳上限; 跨 scheme 降级(https→http)拒绝,
    // http→https 升级放行(国内站 301 升级 https 常态, 不能因安全策略拒采)。
    // 注: Bun fetch redirect:'manual' 实测(1.3.14)返回真实 3xx 响应, 状态行/Location/
    // getSetCookie 全可读, 无 opaque-redirect 屏蔽(见 scripts/archive/probe-bun-manual-redirect.ts)
    let hopUrl = url
    // [R9-a-7] C.4: 重定向环早期熔断 —— 记录已访问跳 URL。
    // [R15-d1-3] 修复(Med): 判定由 Set"任一重复即熔断"改为 Map"同 URL 至多 2 次访问"
    // (允许 1 次重访)。原判定把「302 种 Cookie 后跳回原 URL」的真实会话引导链(A→B→A,
    // 每跳 Set-Cookie 已逐跳入罐, 第二次请求带新 Cookie 通常即 200)整链打断 —— 该形态
    // 正是逐跳 Cookie 收集(y-a)要服务的场景; 3 次访问(=2 次重访)仍熔断, 对抗性回环
    // (A↔B 互指)代价上限从 2 跳升至 4 跳, 仍有界
    const visitedHops = new Map<string, number>([[url, 1]])
    // [R11-b-2] 修复(Low): 304 命中时缓存条目恰被并发驱逐(TTL/容量)原直接抛
    // "304 无缓存条目"走失败链(curl 兑底重新全量抓, 白耗一次传输+日志噪声; R10-c 留档
    // 遗留风险②)。正确语义是降级为无条件 GET 重发一次(RFC 9111: 304 只对条件请求有效,
    // 无缓存体可回时重新取全量)。仅重试一次且仅限本层协商的 condKey(规则自带 If-* 头的
    // 304 形态维持旧抛错口径), 病态服务端连续 304 仍抛错防死循环
    let retriedBare304 = false
    for (let hop = 0; ; hop++) {
      if (hop > MAX_REDIRECT_HOPS) {
        throw new Error(`HTTP 重定向超过 ${MAX_REDIRECT_HOPS} 跳上限(疑似重定向环)`)
      }
      // ff-b①: HTTP 内容链逐跳注入完整指纹头组(与 UA 自洽的 sec-ch-ua*/Sec-Fetch-*)
      // [R15-d1-2] 修复(Med): 规则级 cfg.cookies(源站 A 的种子 Cookie)原先逐跳无条件携带,
      // 跨域重定向时把 A 站 Cookie 泄漏给 B 站 —— 与 R9-a-1 修复的 curl -L 静态头跨域泄漏
      // 同类缺陷(该修复只重建了罐内 Cookie 的按跳归属, cfg.cookies 漏网)。现仅同 host 跳
      // 携带(浏览器 Cookie 作用域语义); 罐内 Cookie 本就按跳域取值不受影响, 同源链路
      // (绝大多数站)行为逐字节不变
      // [R22-e-4]: cfg.headers.Cookie 同类跨域泄漏补齐(stripRuleSeedCookie 三链共用)
      const hopCfg = hostKeyOf(hopUrl) === hostKeyOf(url) ? cfg : stripRuleSeedCookie(cfg)
      const headers = buildHeaders(hopUrl, hopCfg, ua, { fingerprint: true })
      // [R9-a-13] B1: 条件请求协商 —— 有缓存校验器时带 If-None-Match / If-Modified-Since;
      // 规则显式配置了 If-* 头时让位(cfg.headers 优先), 关闭缓存路径由调用方传 conditionalGet:false
      const condKey = (cfg as FetchCfgOpt).conditionalGet === false || headers['If-None-Match'] || headers['If-Modified-Since']
        ? ''
        : condCacheKey(hopUrl, ua, headers.Cookie || '')
      const condEntry = condKey ? condCacheGet(condKey) : null
      if (condEntry) {
        if (condEntry.etag) headers['If-None-Match'] = condEntry.etag
        else if (condEntry.lastModified) headers['If-Modified-Since'] = condEntry.lastModified
      }
      // 出口代理逐跳同代理(会话连贯性/出口固定); 交叉类型携带非标准 proxy 字段
      // (Bun 运行时扩展生效, 不依赖 bun-types 全局声明)
      const init: RequestInit & { proxy?: string } = { headers, redirect: 'manual', signal: controller.signal }
      if (proxy) init.proxy = proxy
      // [R9-e-4] 增强: 末跳响应墙钟计时起点(节奏画像延迟样本, 详见成功路径 reportHostLatency)
      const hopT0 = PACE_PROFILE_ENABLED ? Date.now() : 0
      // gg 中继桥: transport='relay' 时逐跳经 bun 中继服务发起(响应重组为 Response 形态,
      // status/location/getSetCookie/arrayBuffer 全保持 —— 逐跳重定向/Cookie 收集/超时/
      // 指纹头组语义全部复用本循环, 与 native 传输唯一差异在底层传输介质)
      const res = transport === 'relay' && proxy
        ? await relayHop(hopUrl, headers, proxy, controller.signal, timeoutMs)
        : await fetch(hopUrl, init)
      if (cfg.autoCookie !== false) {
        const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
        // 每跳 Cookie 记到该跳 URL 的 origin 名下: 跨域重定向不串味, 同站跳转按域聚合
        cookieJar.store(originHost(hopUrl), setCookies)
      }
      // [R9-a-13] B1: 304 Not Modified —— 条件请求命中, 返回缓存 html(不计失败、不进重试/退避链)
      if (res.status === 304) {
        try { void res.body?.cancel().catch(() => {}) } catch { /* ignore */ }
        const cached = condKey ? condCacheGet(condKey) : null
        if (cached) {
          // [R9-a2-2] 修复: 304=服务端确认内容未变, 缓存条目应【续期】(RFC 9111 成功再验证
          // 重置新鲜度) —— 原实现不续期, 长任务周期复查目录页时 TTL(10min) 按首抓时刻耗尽,
          // 条件请求命中率随时间衰减回全量抓取, B1 省带宽目标落空
          cached.at = Date.now()
          return cached.html
        }
        // [R11-b-2]: 缓存条目已被驱逐 → 重发一次无条件 GET(下一轮 condEntry 为 null,
        // 不会带 If-* 头, condKey 虽重算但无害); 重试后仍 304(病态/劫持)按旧口径抛错
        if (condKey && !retriedBare304) {
          retriedBare304 = true
          continue
        }
        const err304: any = new Error('HTTP 304(无缓存条目, 条件请求状态异常)')
        err304.status = 304
        throw err304
      }
      const location = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && location) {
        // rr-c3 卫生: manual 重定向链上 3xx 响应体从不读取, 显式 cancel 立即释放连接
        // (不消费的 body 由 GC 延迟回收, 重定向密集站滞后占用连接池; 可选链短路安全,
        //  relay 重组形态无 body 字段时为 no-op; catch 兜底防空 rejection)
        try { void res.body?.cancel().catch(() => {}) } catch { /* ignore */ }
        let next: URL
        try {
          next = new URL(location, hopUrl) // 相对 Location(./x、/x、//host)按当前跳解析
        } catch {
          // 非法 Location: 视作最终响应走 !res.ok 抛错语义(带 status+bodyHtml)
          // ee-d: 错误体同样走 charset 感知解码(GBK 站挑战壳若按 utf8 读成 FFFD, looksBlocked/isJsChallenge 全部漏判)
          // R4-2: 错误体也走 readBodyCapped 防 OOM(原 arrayBuffer() 无上限)
          const bodyHtml = await readBodyCapped(res).then((b) => decodeBuffer(b, res.headers.get('content-type') ?? undefined)).catch(() => '')
          const err: any = new Error(`HTTP ${res.status}(Location 非法)`)
          err.status = res.status
          err.bodyHtml = bodyHtml
          attachRetryAfterMs(err, res.headers) // ab-b: 有 res 在手, 错误形态统一抢救 Retry-After
          throw err
        }
        if (next.protocol !== new URL(hopUrl).protocol) {
          // 跨 scheme: 仅放行 http→https 升级; 降级(https→http)与其余一律拒绝,
          // 防止降级明文跳转把会话 Cookie 带到不安全上下文
          const upgrade = new URL(hopUrl).protocol === 'http:' && next.protocol === 'https:'
          if (!upgrade) {
            const err: any = new Error(`HTTP ${res.status} 重定向跨 scheme 被拒绝(${new URL(hopUrl).protocol}→${next.protocol})`)
            err.status = res.status
            attachRetryAfterMs(err, res.headers) // ab-b: 同上(3xx 错误形态, 头在才挂)
            throw err
          }
        }
        // [R9-a-7] 环检测: [R15-d1-3] 同跳 URL 第 3 次访问即熔断(允许 1 次重访, 见循环前注)
        const nextStr = next.toString()
        if ((visitedHops.get(nextStr) || 0) >= 2) throw new Error(`HTTP 重定向环(重复访问 ${nextStr.slice(0, 120)})`)
        // [R12-c2-2] SSRF: 重定向跳目标同样过守卫 —— 初始 URL 过了 assertSafeTarget 不代表跳
        // 目标安全(开放重定向把引擎引向 169.254.169.254/私网 = 守卫被 3xx 整体绕过; relayHop/
        // scrapling 桥侧已有同款校验, native 逐跳循环原先漏网)。豁免口径与外层同源:
        // 操作员配置的 loopback 服务(tokenUrl/contentProxyUrl/relay/bridge) host:port
        const hopSsrf = await assertSafeTarget(nextStr, { allowLoopback: loopbackBypassAllowed(nextStr, cfg) })
        if (!hopSsrf.ok) {
          const err: any = new Error(`HTTP ${res.status} 重定向跳目标被 SSRF 守卫拒绝: ${hopSsrf.reason}`)
          err.status = res.status
          attachRetryAfterMs(err, res.headers) // 3xx 错误形态, 头在才挂(与跨 scheme 拒绝分支同口径)
          throw err
        }
        visitedHops.set(nextStr, (visitedHops.get(nextStr) || 0) + 1)
        hopUrl = nextStr
        continue
      }
      if (!res.ok) {
        // 读出错误响应体供挑战识别(isJsChallenge/CF壳), 挂在 error.bodyHtml 上
        // ee-d: 与成功路径同走 decodeBuffer(charset 三级探测), 否则 GBK 站 403 壳页乱码化后挑战识别失效
        // R4-2: 错误体也走 readBodyCapped 防 OOM(原 arrayBuffer() 无上限)
        const bodyHtml = await readBodyCapped(res).then((b) => decodeBuffer(b, res.headers.get('content-type') ?? undefined)).catch(() => '')
        const err: any = new Error(`HTTP ${res.status}`)
        err.status = res.status
        err.bodyHtml = bodyHtml
        // ab-b(429 主通道): 真 429 以抛错形态抵达 runner.gateFetch —— 此处是 Retry-After
        // 头唯一能被抢救的位置(zz-b 遗留: 原先头信息在此丢失, 限流冷却一律 30s 兜底)
        attachRetryAfterMs(err, res.headers)
        throw err
      }
      // R4-2: 成功路径同样走 readBodyCapped(原 res.arrayBuffer() 无上限, 100MB+ 响应 OOM)
      // [R9-e-6]: 成功路径要求严格完整性校验(仅 native 传输; 中继重组响应的 CL 头不可信)
      const buf = await readBodyCapped(res, transport !== 'relay')
      const html = decodeBuffer(buf, res.headers.get("content-type") ?? undefined)
      // [R9-e-4] 增强: 请求节奏画像(HOSTGATE_PACE_PROFILE=1 时) —— 末跳墙钟(含正文下载)
      // 喂 hostgate 供"目标站响应变慢"感知; 缺省关闭零开销。仅 native 传输(中继/curl 链
      // 时延含桥接/子进程开销, 不代表目标站快慢); hopT0=0(开关关闭)时不产样本
      if (PACE_PROFILE_ENABLED && transport !== 'relay' && hopT0 > 0) {
        // [R10-c-5] 修复: 归因 host 用末跳 hopUrl 而非初始 url —— 重定向链跨域时原实现把
        // "A 站跳到 B 站"的延迟记在 A 头上, 节奏画像会误放缓未被证明变慢的源站; 末跳才是
        // 实际产出响应体、延迟真正归属的目标
        reportHostLatency(hopUrl, Date.now() - hopT0)
      }
      // [R9-a-13] B1: 记录响应校验器供下次条件请求(仅未拦正文 + 256KB 内; 挑战壳/超大响应不入缓存)
      if (condKey) {
        const etag = res.headers.get('etag') || ''
        const lastModified = res.headers.get('last-modified') || ''
        if ((etag || lastModified) && html.length <= COND_CACHE_BODY_MAX && !looksBlocked(html)) {
          condCacheSet(condKey, html, etag, lastModified)
        }
      }
      return html
    }
  } catch (e: any) {
    // ee-d: fetch 超时(本计时器 abort)打标 isFetchTimeout —— 上层据此分类为源站超时
    // (计 errors+写日志+嗂 hostGate 连败), 不再被 x-a 停止豁免分支静默吞掉
    if ((e?.name === 'AbortError' || e?.code === 'ABORT_ERR') && timedOut) e.isFetchTimeout = true
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// ---------- curl 子进程传输(反 TLS 指纹封锁) ----------
/**
 * 场景: 部分站点的 WAF/CDN(uukanshu.cc 实测)按 TLS 指纹(JA3)封锁常见 HTTP 客户端 ——
 * Bun/Node fetch(BoringSSL 栈)必被 403, 而系统 curl(OpenSSL 栈)可直连。
 * 故在 HTTP 引擎内提供第二级传输: curl 子进程。
 * - argv 数组式 spawn(不经 shell, 无注入面), 仅支持 http/https
 * - 复用 CookieJar(autoCookie)与 buildHeaders(UA轮换/Referer)
 * - 响应头落临时文件(-D), body 走 stdout(二进制安全), 10MB 上限防内存炸
 */
let curlAvailable: boolean | null = null
let curlCheckedAt = 0
const CURL_PROBE_RETRY_MS = 60_000

/** Buffer(视图) -> 独立 ArrayBuffer(拷贝, 防共享池越界) */
function toArrayBufferView(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

async function checkCurl(): Promise<boolean> {
  if (curlAvailable === true) return true
  if (curlAvailable === false && Date.now() - curlCheckedAt < CURL_PROBE_RETRY_MS) return false
  try {
    const { spawn } = await import('node:child_process')
    curlAvailable = await new Promise<boolean>((resolve) => {
      const child = spawn('curl', ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] })
      const t = setTimeout(() => {
        try { child.kill() } catch { /* ignore */ }
        resolve(false)
      }, 5000)
      child.on('error', () => { clearTimeout(t); resolve(false) })
      child.on('close', (code) => { clearTimeout(t); resolve(code === 0) })
    })
  } catch {
    curlAvailable = false
  }
  curlCheckedAt = Date.now()
  return curlAvailable
}

// [R9-a-14] C.2 curl 链 TLS 指纹轮换: Chrome 真实 TLS1.2 套件表(OpenSSL 名, 冒号分隔;
// TLS1.3 套件由 --tls13-ciphers 独立管理, 不受 --ciphers 影响, 传了也不破坏 1.3 握手)
const CURL_CHROME_TLS12_CIPHERS = 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-RSA-AES128-SHA:ECDHE-RSA-AES256-SHA:AES128-GCM-SHA256:AES256-GCM-SHA384:AES128-SHA:AES256-SHA'

/** [R9-a-14] C.2: host 稳定伪随机(djb2) → 传输画像索引。同 host 每次同画像
 *  (防同站会话内 h2/h1.1 + JA3 混杂翻转), 跨 host 三画像分散(默认h2 / --http1.1 / Chrome TLS1.2 套件表)
 *  [R22-e-7] HTTP/2 指纹边界说明: 本层只控制 ALPN/HTTP 版本与 TLS1.2 套件表 —— HTTP/2
 *  SETTINGS 帧参数(Akamai fingerprint2 类画像)随系统 curl 二进制固定, 进程内不可调,
 *  升级系统 curl 才会改变 h2 指纹画像(如实留档, 非遗漏)。
 *  [R27-1b-1] 该边界在 impersonate 档位下被突破: curl-impersonate/curl_cffi 以真实浏览器
 *  HTTP/2 SETTINGS/伪头指纹发车(实测 chrome116 档 akamai_h2 与真 Chrome 一致, 见 worklog)。 */
function curlTlsProfileIndex(host: string): number {
  let h = 5381
  for (let i = 0; i < host.length; i++) h = ((h << 5) + h + host.charCodeAt(i)) >>> 0
  return h % 3
}

/** [R27-1b-1] curl 传输画像数组 —— 把 [R9-a-14] 的隐式三画像(curlTlsProfileIndex hash%3
 *  下标)显式化, 每条目可携带可选 impersonate 档位字段(curl-impersonate/curl_cffi 浏览器
 *  指纹档, chrome116/safari17_0/firefox135 等)。缺省条目均不带 impersonate = 既有系统
 *  curl 行为零回归; 档位仅当规则 fetch 配置显式选档(cfg.curlImpersonate, types.ts 白名单)
 *  或环境开关(CURL_IMPERSONATE_PROFILE 全局 / CURL_IMPERSONATE_HOSTS host 钉扎)时
 *  经 resolveCurlImpersonateTier 解析生效, 默认不开(现有规则/任务零破坏)。 */
interface CurlTransportProfile {
  name: string
  /** 强制 HTTP/1.1(画像 1, --http1.1) */
  http11?: boolean
  /** TLS1.2 套件表(画像 2, --ciphers) */
  ciphers?: string
  /** [R27-1b-1] impersonate 档位: 生效时该跳传输画像(TLS ClientHello/JA3-JA4 +
   *  HTTP/2 SETTINGS/伪头序 + 浏览器头组)整体交 curl-impersonate 档位引擎接管
   *  (二进制包装脚本或桥 /impersonate 等价引擎), 系统 curl 的 http11/ciphers 旗组与
   *  引擎指纹头组让位(浏览器版本自洽由档位保证, 见 filterImpersonateHeaders)。
   *  当前内置条目均不带(缺省关闭), 字段留作 host 钉扎档位的声明位。 */
  impersonate?: string
}
const CURL_TRANSPORT_PROFILES: readonly CurlTransportProfile[] = [
  { name: 'h2-default' },                                               // hash%3=0: 系统 curl 默认 h2
  { name: 'http1.1', http11: true },                                    // hash%3=1: --http1.1
  { name: 'chrome-tls12-ciphers', ciphers: CURL_CHROME_TLS12_CIPHERS }, // hash%3=2: Chrome TLS1.2 套件表
]

/** [R27-1b-1] host → 生效传输画像(hash 钉扎下标语义与旧三画像完全兼容) */
function curlProfileOf(host: string): CurlTransportProfile {
  return CURL_TRANSPORT_PROFILES[curlTlsProfileIndex(host)] ?? { name: 'h2-default' }
}

// ---------- [R27-1b-2] curl-impersonate 档位解析(默认关, 显式选档才启用) ----------
/** 档位白名单: chrome/edge/safari/firefox + 2~3 位版本号(±A/B 观察版单字母后缀如
 *  chrome133a) + _android/_ios 后缀形态(curl_cffi 目标命名), 也接受裸别名(= 该家族最新
 *  档, 仅桥 curl_cffi 轨可用; 二进制轨包装脚本按版本命名)。与桥 server.py _TIER_RE 同口径
 *  (改动需双侧同步)。 */
const IMPERSONATE_TIER_RE = /^(chrome|edge|safari|firefox)(\d{2,3}(_[0-9])?(_android|_ios)?[a-z]?)?$/

/** [R28-4-E2] 403/429 换档重试的预置换档序: chrome116→edge101→safari17_0(firefox 系仅桥轨
 *  可用, 不入默认序)。当前档不在序内(自定义档位)时取序内首个异档。收益: TLS 档位被站点
 *  针对性封禁时自动逃生; 成本: 每次抓取至多 1 次换档重试(与 cookieRetries 共用
 *  MAX_COOKIE_RETRIES 预算, 不双倍放大)。可扩展位: 后续如需规则字段 curlImpersonateFallbacks
 *  显式配置换档序, 在此接入 sanitize 白名单同款正则校验即可(本轮不加新规则字段) */
const IMPERSONATE_TIER_ROTATION: readonly string[] = ['chrome116', 'edge101', 'safari17_0']

/** [R28-4-E2] 取当前档位在预置序内的后继(环形); 当前不在序内时取序内首个异档; 无可用后继返回 '' */
function nextImpersonateTier(current: string): string {
  const list = IMPERSONATE_TIER_ROTATION.filter((t) => t !== current && IMPERSONATE_TIER_RE.test(t))
  if (!list.length) return ''
  const idx = IMPERSONATE_TIER_ROTATION.indexOf(current)
  return idx >= 0 ? IMPERSONATE_TIER_ROTATION[(idx + 1) % IMPERSONATE_TIER_ROTATION.length] : list[0]
}

/** 全局档位开关(env CURL_IMPERSONATE_PROFILE): 设置后 curl 链全部请求按该档位走
 *  impersonate 引擎(操作员级开关, 不改规则; 缺省空=关闭)。模块加载时读定, 进程重启生效。 */
const ENV_IMPERSONATE_PROFILE = (process.env.CURL_IMPERSONATE_PROFILE || '').trim()

/** [R27-1b-2] host 钉扎档位表(env CURL_IMPERSONATE_HOSTS="host=档位,host2=档位2"):
 *  命中 host 的 curl 链请求按钉扎档位走 impersonate 引擎 —— "host 钉扎"在旧三画像语义
 *  (hash→TLS/HTTP 版本组合)之上增加"host→完整浏览器指纹"维度。启动时解析,
 *  非法对(host 空/档位不达白名单)静默丢弃。 */
const IMPERSONATE_HOST_PINNING = (() => {
  const map = new Map<string, string>()
  for (const pair of (process.env.CURL_IMPERSONATE_HOSTS || '').split(',')) {
    const idx = pair.indexOf('=')
    if (idx <= 0) continue
    const host = pair.slice(0, idx).trim().toLowerCase()
    const tier = pair.slice(idx + 1).trim()
    if (host && IMPERSONATE_TIER_RE.test(tier)) map.set(host, tier)
  }
  return map
})()

/** [R27-1b-2] impersonate 档位解析: [R28-4-E2] 换档重试显式覆盖(tierOverride, 单次/调用方自限)
 *  > 规则 curlImpersonate 显式选档 > CURL_IMPERSONATE_HOSTS host 钉扎 > CURL_IMPERSONATE_PROFILE
 *  全局开关 > 画像条目缺省(当前全空)。返回 ''=不启用(系统 curl 既有画像, 零回归);
 *  非法档位一律视为未选(sanitize 白名单已拦截, 此处运行时兜底)。 */
function resolveCurlImpersonateTier(host: string, cfg: FetchConfig, profile: CurlTransportProfile, tierOverride?: string): string {
  // [R28-4-E2]: 403/429 换档重试路径注入的显式档位最高优先(每次抓取至多 1 次, 由调用方
  // 与 cookieRetries 共用预算自限); 非法值视为未选, 落回常规解析
  const override = (tierOverride || '').trim()
  if (override && IMPERSONATE_TIER_RE.test(override)) return override.toLowerCase()
  const ruleTier = (cfg.curlImpersonate || '').trim()
  if (ruleTier) return IMPERSONATE_TIER_RE.test(ruleTier) ? ruleTier.toLowerCase() : ''
  const pinned = IMPERSONATE_HOST_PINNING.get(host.toLowerCase())
  if (pinned) return pinned
  if (ENV_IMPERSONATE_PROFILE && IMPERSONATE_TIER_RE.test(ENV_IMPERSONATE_PROFILE)) {
    return ENV_IMPERSONATE_PROFILE.toLowerCase()
  }
  return profile.impersonate || ''
}

// ---------- [R27-1b-3] curl-impersonate 二进制(档位包装脚本)探测 ----------
/** curl-impersonate(lexiforest fork)的档位启动形态是包装脚本(curl_chrome116/curl_safari17_0
 *  等, 内部以完整旗组拉起 curl-impersonate-chrome 二进制, 覆盖 TLS ClientHello/JA3-JA4 +
 *  HTTP/2 SETTINGS/伪头序 + 浏览器头组; v0.9.0 二进制无 --impersonate 聚合旗 —— 该旗是
 *  curl_cffi(Python)侧 API 概念, 包装脚本即二进制侧官方档位形态)。包装脚本与同名二进制
 *  探测顺序: CURL_IMPERSONATE_BIN(env, 指包装脚本所在目录或具体包装脚本路径) > PATH >
 *  mini-services/scrapling-bridge/_bin(项目内随桥分发的副本)。命中缓存; 未命中按
 *  IMPERSONATE_PROBE_RETRY_MS 冷却重试。全部未命中 → 该档位请求改走桥 /impersonate
 *  (curl_cffi 等价引擎, impersonateOnceViaBridge [R27-1b-6])。 */
const IMPERSONATE_PROBE_RETRY_MS = 60_000
const impersonateBinCache = new Map<string, { path: string | null; checkedAt: number }>()

async function probeImpersonateBin(path: string): Promise<boolean> {
  try {
    const { spawn } = await import('node:child_process')
    return await new Promise<boolean>((resolve) => {
      const child = spawn(path, ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] })
      const t = setTimeout(() => {
        try { child.kill() } catch { /* ignore */ }
        resolve(false)
      }, 3000)
      child.on('error', () => { clearTimeout(t); resolve(false) })
      child.on('close', (code) => { clearTimeout(t); resolve(code === 0) })
    })
  } catch {
    return false
  }
}

/** [R27-1b-3] 解析某档位的 curl-impersonate 包装脚本可执行路径; 未命中返回 null(走桥轨) */
async function resolveImpersonateBin(tier: string): Promise<string | null> {
  const cached = impersonateBinCache.get(tier)
  if (cached && (cached.path || Date.now() - cached.checkedAt < IMPERSONATE_PROBE_RETRY_MS)) return cached.path
  const wrapper = `curl_${tier}`
  const candidates: string[] = []
  const envBin = (process.env.CURL_IMPERSONATE_BIN || '').trim()
  if (envBin) {
    // env 指目录 → 拼档位包装脚本; env 指具体文件 → 先按字面收(操作员直接指向某档位
    // 包装脚本), 再按其父目录拼一次(包装脚本与二进制同目录布局)
    candidates.push(`${envBin.replace(/\/+$/, '')}/${wrapper}`)
    if (envBin.endsWith(`/${wrapper}`)) candidates.push(envBin)
    else candidates.push(envBin.replace(/\/[^/]*$/, '') + '/' + wrapper)
  }
  candidates.push(wrapper) // PATH 探测(spawn 语义同 checkCurl)
  candidates.push(`${process.cwd()}/mini-services/scrapling-bridge/_bin/${wrapper}`) // 项目内副本(Next dev cwd=项目根)
  let found: string | null = null
  for (const c of candidates) {
    if (await probeImpersonateBin(c)) { found = c; break }
  }
  impersonateBinCache.set(tier, { path: found, checkedAt: Date.now() })
  return found
}

// ---------- [R27-1b-4] impersonate 轨头组过滤(防同名双头 + 版本自洽) ----------
/** 档位包装脚本自带完整浏览器头组(curl_chrome* 与 curl_edge* 系 12 项、curl_safari* 系 7 项,
 *  实测脚本旗组): 引擎指纹头组(UA 轮换/Accept/Sec-Fetch-* 等)与之同名追加会产生重复头
 *  (实测 wrapper + 追加 -H UA → 服务端收到双 User-Agent, 反成指纹破绽), 且引擎 UA 池
 *  (Chrome 137~142)与档位 TLS 版本(如 chrome116)错配。故档位生效时过滤下列头键交档位
 *  引擎自管(头组与 TLS/h2 指纹版本自洽), 仅透传 Cookie/Referer/规则显式自定义头。
 *  桥 /impersonate 轨同口径: curl_cffi 档位默认头按名合并, 过滤后与二进制轨行为一致。 */
const IMPERSONATE_WRAPPER_HEADER_KEYS = new Set([
  'accept', 'accept-encoding', 'accept-language', 'sec-ch-ua', 'sec-ch-ua-mobile',
  'sec-ch-ua-platform', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-user',
  'sec-fetch-dest', 'upgrade-insecure-requests', 'user-agent',
])

function filterImpersonateHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (!IMPERSONATE_WRAPPER_HEADER_KEYS.has(k.toLowerCase())) out[k] = v
  }
  return out
}

/** 单跳 curl 响应结果(手工重定向循环的底层产物) */
interface CurlHopResult {
  status: number
  location: string
  contentType: string
  setCookies: string[]
  retryAfter: string
  body: Buffer
}

// ---------- [R27-1b-6] 桥 /impersonate 单跳(无二进制时的档位等价引擎) ----------
/** 桥 /impersonate 响应信封(ok:true 形态; ok:false 见 error 字段) */
interface ImpersonateBridgePayload {
  ok?: boolean
  status?: number
  html?: string
  finalUrl?: string
  error?: string
  headers?: { location?: string; contentType?: string; retryAfter?: string; setCookies?: string[] }
}

/** [R27-1b-6] 桥 /impersonate 单跳: scrapling 桥 venv 内 curl_cffi(lexiforest 系)按档位
 *  伪装 TLS ClientHello(JA3/JA4)+ HTTP/2 SETTINGS/伪头序指纹代发(与 curl-impersonate
 *  二进制同指纹家族, 实测 chrome116 档两侧 JA4/akamai_h2 一致)。allow_redirects=False
 *  单跳语义与 curlOnce 对齐; 信封 {ok,status,html,finalUrl,headers:{location,
 *  contentType,retryAfter,setCookies}} 映射回 CurlHopResult 供 fetchViaCurl 手工重定向
 *  循环无差别消费。桥不可达/桥内失败抛错(与 curl 进程失败同形态, 上层降级链语义不变)。
 *  引擎侧 SSRF 守卫在此补一道(与 fetchViaScraplingBridge 双重保险同款)。注意: 桥返回
 *  的 html 是 curl_cffi 已按目标 charset 解码后的文本, contentType 强制改写 charset=utf-8
 *  防上层 decodeBuffer 按原 charset 二次解码出乱码。 */
async function impersonateOnceViaBridge(url: string, headers: Record<string, string>, proxy: string, remainingMs: number, tier: string, bridge: string): Promise<CurlHopResult> {
  const ssrf = await assertSafeTarget(url, { allowLoopback: false })
  if (!ssrf.ok) throw new Error(`impersonate 桥跳目标被 SSRF 守卫拒绝(${ssrf.reason})`)
  const timeoutMs = Math.max(1000, Math.min(Math.ceil(remainingMs), 120_000))
  let res: Response
  try {
    res = await fetch(`${bridge}/impersonate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, method: 'GET', impersonate: tier, headers, proxy: proxy || undefined, timeoutMs }),
      signal: AbortSignal.timeout(timeoutMs + 5000),
    })
  } catch (e: any) {
    if (e?.name === 'AbortError' || e?.code === 'ABORT_ERR') {
      throw new Error(`impersonate 桥单跳超时(${timeoutMs}ms, 桥 ${bridge})`)
    }
    throw new Error(`impersonate 桥不可达(${bridge}): ${String(e?.message || e).slice(0, 120)}`)
  }
  if (!res.ok) throw new Error(`impersonate 桥响应形态异常(HTTP ${res.status})`)
  const payload = (await res.json()) as ImpersonateBridgePayload
  if (!payload?.ok || typeof payload.status !== 'number' || typeof payload.html !== 'string') {
    throw new Error(`impersonate 桥内失败(${String(payload?.error || '响应形态非法').slice(0, 140)})`)
  }
  const h = payload.headers || {}
  const contentType = typeof h.contentType === 'string' && h.contentType
    ? h.contentType.replace(/charset=[^;]*/i, 'charset=utf-8')
    : 'text/html; charset=utf-8'
  return {
    status: payload.status,
    location: typeof h.location === 'string' ? h.location : '',
    contentType,
    setCookies: Array.isArray(h.setCookies) ? h.setCookies.map(String) : [],
    retryAfter: typeof h.retryAfter === 'string' ? h.retryAfter : '',
    body: Buffer.from(payload.html, 'utf8'),
  }
}

/** [R27-1b-5] 通用 curl 进程单跳执行器 —— 原 curlOnce 内联 spawn/收流/头文件解析逻辑
 *  原样抽出, 仅二进制参数化(系统 curl 与 curl-impersonate 档位包装脚本共用同一套
 *  stdout 收流(10MB 上限防溢出)/异常退出拒收/多轮头解析取末轮/临时头文件清理语义)。 */
async function runCurlProcess(bin: string, args: string[], headerFile: string, remainingMs: number): Promise<CurlHopResult> {
  const { spawn } = await import('node:child_process')
  const { readFile, unlink } = await import('node:fs/promises')
  return await new Promise<CurlHopResult>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let total = 0
    const MAX_HTML_BYTES = 10 * 1024 * 1024
    let stderr = ''
    let settled = false
    // 溢出标记: 原实现超限 SIGKILL 后 close 处理器仍会把已收到的部分 body 当成功内容 resolve,
    // 截断 HTML 会被上层解析成半截正文/目录入库 —— 必须改为 reject
    let overflow = false
    const killTimer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* ignore */ }
    }, Math.max(2000, remainingMs + 5000))
    child.stdout.on('data', (c: Buffer) => {
      if (overflow) return
      total += c.length
      if (total > MAX_HTML_BYTES) {
        overflow = true
        chunks.length = 0 // 立即释放已收数据, 不留大块缓冲到 close
        try { child.kill('SIGKILL') } catch { /* ignore */ }
        return
      }
      chunks.push(c)
    })
    child.stderr.on('data', (c: Buffer) => {
      if (stderr.length < 600) stderr += c.toString()
    })
    child.on('error', (e) => {
      if (settled) return
      settled = true
      clearTimeout(killTimer)
      // 修复: error 路径(spawn 后期失败/进程无法被 kill)原先不删临时头文件, 造成 tmp 泄漏
      try { void unlink(headerFile).catch(() => {}) } catch { /* ignore */ }
      reject(e)
    })
    child.on('close', (code: number | null, signal: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(killTimer)
      ;(async () => {
        let headerRaw = ''
        try {
          headerRaw = await readFile(headerFile, 'utf8')
        } catch { /* 无头文件: curl 提前失败 */ }
        try { await unlink(headerFile) } catch { /* ignore */ }
        const body = Buffer.concat(chunks)
        // 修复: 10MB 上限溢出后(SIGKILL)原先仍会走到 resolve 返回截断内容
        if (overflow) {
          reject(new Error(`curl 响应体超过 ${Math.round(MAX_HTML_BYTES / 1024 / 1024)}MB 上限, 已中止`))
          return
        }
        // [R9-a2-1] 修复: curl 进程异常退出(退出码≠0/被信号杀死)时原实现仍会解析已收到的
        // 部分头+响应体并按成功 resolve —— --max-time 到点(exit 28)/传输中断(exit 18)会产出
        // 【截断正文】被上层解析入库(半截目录/正文污染), killTimer SIGKILL 兜底路径同理。
        // curl 成功收完响应必 exit 0(4xx/5xx 不影响退出码, 不带 --fail), 下方 HTTP 状态
        // 分支不受影响; 异常退出经 fetchHttpWithCurlSingle 落回错误处理链(不会误判成功)
        if (code !== 0 || signal) {
          reject(new Error(`curl 进程异常退出(code=${code ?? signal ?? 'unknown'})${stderr ? `: ${stderr.slice(0, 160)}` : ''}`))
          return
        }
        if (!headerRaw) {
          reject(new Error(`curl 无响应${stderr ? `: ${stderr.slice(0, 160)}` : ''}`))
          return
        }
        // 按状态行切分轮次解析(容错 1xx 中间响应/代理插头): 取最后一轮为有效响应。
        // ab-b: Retry-After 随轮解析, 多轮时仅在非空时更新(2-fetcher Bug 22 同口径)
        type CurlRound = { status: number; location: string; contentType: string; setCookies: string[]; retryAfter: string }
        const rounds: CurlRound[] = []
        let cur: CurlRound | null = null
        for (const line of headerRaw.split(/\r?\n/)) {
          const sm = line.match(/^HTTP\/[\d.]+\s+(\d{3})/i)
          if (sm) { cur = { status: parseInt(sm[1], 10), location: '', contentType: '', setCookies: [], retryAfter: '' }; rounds.push(cur); continue }
          if (!cur) continue
          const idx = line.indexOf(':')
          if (idx <= 0) continue
          const key = line.slice(0, idx).trim().toLowerCase()
          const val = line.slice(idx + 1).trim()
          if (key === 'content-type') cur.contentType = val
          else if (key === 'set-cookie') cur.setCookies.push(val)
          else if (key === 'location') cur.location = val
          else if (key === 'retry-after') cur.retryAfter = val // ab-b
        }
        const last = rounds[rounds.length - 1]
        // R3-6: 没解析出任何状态行 = 畸形响应/连接被劫持(SSH banner 等), 显式 reject 不入库
        if (!last || last.status === 0) {
          reject(new Error(`curl 未解析到 HTTP 状态行(响应畸形或被劫持)${stderr ? `: ${stderr.slice(0, 160)}` : ''}`))
          return
        }
        // 非错误状态空响应体: 视为 curl 失败(3xx 无 Location / 204 等退化形态同旧口径)
        // [R12-c2-4] 修复(Med): 原条件 `status<400 && !body.length` 把「3xx+Location+空体」
        // (重定向的常规形态, 301/302/307 响应体本就常为空)也一并拒为"响应体为空" —— 注释声明的
        // 意图是只拒"3xx 无 Location", 代码却漏查 location → fetchViaCurl 的手工逐跳重定向循环
        // 对空体重定向永不触达(curl 链整体失败), 与 native 链 redirect:'manual' 逐跳语义断裂。
        // 补 `!last.location` 守卫: 3xx 带 Location 照常 resolve 交重定向循环(含 R12-c2-2 跳守卫)
        if (last.status < 400 && !body.length && !last.location) {
          reject(new Error(`curl 响应体为空${stderr ? `: ${stderr.slice(0, 160)}` : ''}`))
          return
        }
        resolve({ status: last.status, location: last.location, contentType: last.contentType, setCookies: last.setCookies, retryAfter: last.retryAfter, body })
      })().catch(reject)
    })
  })
}

/** [R9-a] 单跳 curl 子进程(无 -L): 目标侧单响应如实返回(含 3xx/4xx), 由 fetchViaCurl
 *  手工循环消费; 超时/10MB 溢出/畸形响应 reject。原 -L 整链单进程形态见 fetchViaCurl 注释。
 *  [R27-1b-5] impersonate 档位双轨: 档位生效(规则 curlImpersonate/env 开关, 见
 *  resolveCurlImpersonateTier)且有档位包装脚本 → curl-impersonate 形态 spawn(轨 1,
 *  bin=包装脚本, 传输画像全由包装脚本旗组接管, 不再加旧画像 --http1.1/--ciphers,
 *  头组经 filterImpersonateHeaders 过滤档位自带指纹头); 无二进制 → 该画像请求改走桥
 *  /impersonate(curl_cffi 等价引擎, 轨 2)。轨 2 失败如实抛错(与 curl 失败同形态),
 *  不静默降级回弱指纹系统 curl(降级决策归上层降级链)。 */
async function curlOnce(url: string, headers: Record<string, string>, proxy: string, remainingMs: number, impersonateTier = '', bridgeUrl = ''): Promise<CurlHopResult> {
  const [{ tmpdir }, { join }, { randomUUID }] = await Promise.all([
    import('node:os'), import('node:path'), import('node:crypto'),
  ])
  const headerFile = join(tmpdir(), `novel-curl-${randomUUID()}.hdr`)
  const args: string[] = [
    '-sS', '--compressed',
    '--max-time', String(Math.max(1, Math.ceil(remainingMs / 1000))),
    '-D', headerFile, '-o', '-',
  ]
  // [R27-1b-5] 传输画像双轨选择(缺省 impersonateTier='' → 旧轨零回归)
  let bin = 'curl'
  let hopHeaders = headers
  if (impersonateTier) {
    const impersonateBin = await resolveImpersonateBin(impersonateTier)
    if (impersonateBin) {
      // 轨 1: curl-impersonate 档位包装脚本(如 curl_chrome116) —— 完整真实浏览器指纹
      bin = impersonateBin
      hopHeaders = filterImpersonateHeaders(headers) // [R27-1b-4] 防同名双头/版本错配
    } else {
      // 轨 2: 桥 /impersonate(curl_cffi 等价引擎; 桥地址同 scrapling 桥)
      // [R28-4-M1] 桥轨同样过 filterImpersonateHeaders —— 修前轨 2 收 buildHeaders(fingerprint:true)
      // 产出的全量头组原样 POST 给桥, curl_cffi 语义是"显式头按名覆盖档位默认头", 于是桥轨实际 =
      // chrome116 的 TLS ClientHello + 引擎 UA 池的 Chrome 141~142 UA/sec-ch-ua —— TLS 与 UA 版本
      // 错配正是 WAF 指纹库的标准爬虫信号(轨 1 有过滤, 双轨行为不一致, R27-1b"桥轨同口径"未兑现)。
      // 现与轨 1/server.py 契约("引擎已过滤", server.py do_impersonate 文档串)三侧对齐
      return await impersonateOnceViaBridge(url, filterImpersonateHeaders(headers), proxy, remainingMs, impersonateTier, bridgeUrl || SCRAPLING_BRIDGE_URL)
    }
  } else if (/^https:/i.test(url)) {
    // [R9-a-14] C.2 + [R27-1b-1]: 按 host 钉扎的传输画像(仅 https 有 TLS 面; http 不加;
    // 画像数组显式化, hash 下标语义与旧三画像一致)
    const profile = curlProfileOf(hostOf(url))
    if (profile.http11) args.push('--http1.1')
    else if (profile.ciphers) args.push('--ciphers', profile.ciphers)
  }
  for (const [k, v] of Object.entries(hopHeaders)) {
    // 控制字符清洗: 防 header 值/键换行注入额外 curl 指令(argv 传输仍单参数, 但 curl 自身按行解析);
    // 键同样要洗(键来自 cfg.headers 用户配置), 且去冒号防 curl 把键值对解析错位
    const key = String(k).replace(/[\r\n\0:]+/g, '').trim()
    const clean = String(v).replace(/[\r\n\0]+/g, ' ').trim()
    if (key && clean) args.push('-H', `${key}: ${clean}`)
  }
  if (proxy) {
    // 出口代理: -x 全形态; 控制字符清洗与头注入同口径(curl 按行解析参数值)
    args.push('-x', proxy.replace(/[\r\n\0]+/g, ''))
  }
  args.push('--', url)
  return await runCurlProcess(bin, args, headerFile, remainingMs)
}

/** curl 子进程传输(内部实现, 导出仅供诊断/冒烟脚本直接复用)
 *  proxy(dd-a): 非空时以 -x 透传(http/https/socks5(h)/socks4(a) 全形态, 内联凭证
 *  http://u:p@host:port 原生支持; 值清洗控制字符防 curl 参数注入)
 *
 *  [R9-a-1] 修复: 原实现 curl -L 跟随重定向 —— -H 静态头(含 Cookie)会原样发给每个重定向跳,
 *  跨域重定向时把 A 站会话 Cookie 泄漏给 B 站(2-fetcher Bug 23 在 fetchBinary 已修同类缺陷,
 *  curl 链漏网)。改为手工逐跳循环(与 fetchHttp redirect:'manual' 同语义):
 *   - 每跳重建头组: Cookie 按该跳实际 URL 取罐, 跨域跳转自动不带原域 Cookie;
 *   - 每跳 Set-Cookie 归属该跳 URL 域键(与 native 逐跳一致);
 *   - 跨 scheme 降级拒绝 / http→https 升级放行; [R9-a-7] 重复跳 URL 环熔断;
 *   - 总超时预算分摊到各跳(--max-time 按剩余预算, 原 -L 单进程跑满全链同一预算)。
 *  [R9-a-14] C.2: 每跳按 host 钉扎的 TLS/HTTP 版本画像(见 curlTlsProfileIndex)。
 *  [R27-1b-7] 每跳解析 impersonate 档位(与 curlTlsProfileIndex host 钉扎同口径: 重定向
 *  跨 host 按新 host 重解析, host 钉扎表/规则选档各自生效); 档位命中时该跳走
 *  curl-impersonate 双轨(二进制包装脚本/桥 /impersonate), 否则旧轨零回归。 */
export async function fetchViaCurl(url: string, cfg: FetchConfig, ua: string, proxy = ''): Promise<string> {
  if (!/^https?:\/\//i.test(url)) throw new Error('curl 传输仅支持 http/https URL')
  if (!(await checkCurl())) throw new Error('curl 子进程不可用')
  const timeoutMs = cfg.timeout && cfg.timeout > 0 ? cfg.timeout : 20000
  const deadline = Date.now() + timeoutMs
  // [R27-1b-7] impersonate 桥轨地址: 规则 scraplingBridgeUrl 优先(与 scrapling 模式同
  // 桥同地址), 缺省 SCRAPLING_BRIDGE_URL(/impersonate 为同服务新增端点)
  const bridgeUrl = (cfg.scraplingBridgeUrl || '').trim() || SCRAPLING_BRIDGE_URL
  const MAX_CURL_REDIRECT_HOPS = 5 // 与原 --max-redirs 5 同口径
  // [R9-a-7] C.4: 环检测 —— [R15-d1-3] 同 URL 至多 2 次访问(允许 1 次重访, 种 Cookie 回跳
  // A→B→A 不再被误熔断; 3 次访问仍熔断, 与 native 链同口径, 详见 fetchHttp 循环前注)
  const visitedHops = new Map<string, number>([[url, 1]])
  let hopUrl = url
  for (let hop = 0; ; hop++) {
    if (hop > MAX_CURL_REDIRECT_HOPS) {
      throw new Error(`curl 重定向超过 ${MAX_CURL_REDIRECT_HOPS} 跳上限(疑似重定向环)`)
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw new Error(`curl 总超时(${timeoutMs}ms)预算耗尽(重定向链过长)`)
    }
    // ff-b① + [R9-a-1]: curl 子进程同为 HTTP 内容链, 逐跳重建指纹头组
    // (Cookie 按该跳 URL 取罐 —— 跨域重定向不泄漏原域 Cookie; Sec-Fetch-Site 按跳自洽)
    // [R15-d1-2] 修复(Med): 规则级 cfg.cookies 同款跨域泄漏在 curl 链补齐(与 fetchHttp
    // 逐跳 hopCfg 同口径, 仅同 host 跳携带规则种子 Cookie); [R22-e-4]: cfg.headers.Cookie
    // 同类泄漏同批补齐(stripRuleSeedCookie 三链共用)
    const hopCfg = hostKeyOf(hopUrl) === hostKeyOf(url) ? cfg : stripRuleSeedCookie(cfg)
    const headers = buildHeaders(hopUrl, hopCfg, ua, { fingerprint: true })
    // [R27-1b-7] 逐跳解析 impersonate 档位('' = 不启用 → curlOnce 旧轨, 零回归)
    // [R28-4-E2]: 第 4 参透传换档重试覆盖档位(fetchPageOnce 错误路径经 effCfg 注入, 逐跳继承)
    const hopTier = resolveCurlImpersonateTier(hostOf(hopUrl), hopCfg, curlProfileOf(hostOf(hopUrl)), (hopCfg as FetchCfgOpt).impersonateTierOverride)
    const r = await curlOnce(hopUrl, headers, proxy, remaining, hopTier, bridgeUrl)
    if (cfg.autoCookie !== false && r.setCookies.length) {
      // 每跳 Set-Cookie 记到该跳 URL 的 origin 名下(与 native 逐跳同语义)
      cookieJar.store(originHost(hopUrl), r.setCookies)
    }
    if (r.status >= 300 && r.status < 400 && r.location) {
      let next: URL
      try {
        next = new URL(r.location, hopUrl) // 相对 Location 按当前跳解析
      } catch {
        // 非法 Location: 与 native 路径同语义, 带状态抛错
        const err: any = new Error(`HTTP ${r.status}(curl, Location 非法)`)
        err.status = r.status
        const ram = parseRetryAfterHeaderMs(r.retryAfter)
        if (ram !== undefined) err.retryAfterMs = ram
        throw err
      }
      if (next.protocol !== new URL(hopUrl).protocol) {
        // 跨 scheme: 仅放行 http→https 升级(与 native 同口径, 防明文跳转泄漏会话)
        const upgrade = new URL(hopUrl).protocol === 'http:' && next.protocol === 'https:'
        if (!upgrade) {
          const err: any = new Error(`HTTP ${r.status} 重定向跨 scheme 被拒绝(${new URL(hopUrl).protocol}→${next.protocol})(curl)`)
          err.status = r.status
          // [R11-b-3] 修复(Low): 此错误形态原先漏挂 retryAfterMs(native 同形态错误在 3xx 分支
          // 有挂, curl 链的"非法 Location"形态也有挂, 唯此分支遗漏), 429/503 跨 scheme 拒绝时
          // 上层限流冷却退化为 30s 兜底而非服务端指定时长; 补齐与 native/curl 其他错误形态一致
          const ramScheme = parseRetryAfterHeaderMs(r.retryAfter)
          if (ramScheme !== undefined) err.retryAfterMs = ramScheme
          throw err
        }
      }
      const nextStr = next.toString()
      // [R9-a-7] 环检测: [R15-d1-3] 同跳 URL 第 3 次访问即熔断(允许 1 次重访)
      if ((visitedHops.get(nextStr) || 0) >= 2) throw new Error(`curl 重定向环(重复访问 ${nextStr.slice(0, 120)})`)
      // [R12-c2-2] SSRF: curl 链重定向跳同款守卫(与 fetchHttp native 逐跳同口径, 防 3xx 绕过;
      // 豁免口径同源: 操作员配置的 loopback 服务 host:port)
      const hopSsrf = await assertSafeTarget(nextStr, { allowLoopback: loopbackBypassAllowed(nextStr, cfg) })
      if (!hopSsrf.ok) {
        const err: any = new Error(`HTTP ${r.status} 重定向跳目标被 SSRF 守卫拒绝(${hopSsrf.reason})(curl)`)
        err.status = r.status
        throw err
      }
      visitedHops.set(nextStr, (visitedHops.get(nextStr) || 0) + 1)
      hopUrl = nextStr
      continue
    }
    if (r.status >= 400) {
      const err: any = new Error(`HTTP ${r.status}(curl)`)
      err.status = r.status
      err.bodyHtml = decodeBuffer(toArrayBufferView(r.body), r.contentType)
      // ab-b: curl 错误形态同样抢救 Retry-After(缺省/非法不挂字段 → 上层 30s 兜底)
      const ram = parseRetryAfterHeaderMs(r.retryAfter)
      if (ram !== undefined) err.retryAfterMs = ram
      throw err
    }
    return decodeBuffer(toArrayBufferView(r.body), r.contentType)
  }
}

// ---------- bun 中继桥 (gg: node 运行时+代理的 TLS 指纹出路) ----------
/**
 * 场景(gg-b wanben 实录): node 运行时(next dev)下 RequestInit.proxy 被全局 fetch(undici)
 * 静默忽略, 引擎因此直入 curl 链(fetchHttpWithCurlSingle node+proxy 分支), 而 curl 的
 * OpenSSL TLS 指纹被部分 WAF 按 JA3 拦截(同一代理同一 URL: bun 直抓 200 / 引擎 curl 链
 * 403 交替实录), 代理链在 dev 服务里全灭。
 * 中继桥: 独立 bun mini-service(127.0.0.1:3011, Bun 运行时 RequestInit.proxy 原生支持)
 * 代为发起请求, 引擎侧把响应重组为 Response 形态嵌入 fetchHttp 逐跳循环 → node+代理
 * 场景获得 bun 级 TLS 指纹, 逐跳重定向/Cookie/超时/指纹头组语义零改动。
 * 可用性: /health 探测结果缓存 RELAY_PROBE_RETRY_MS; 中继不在/中继层失败 → 原 curl 链
 * 兜底(零回归); 目标侧响应(含 403/5xx)如实上抛不双发。
 * socks5 形态: bun RequestInit.proxy 不支持 → 中继报 relayError → 落 curl(-x 全形态),
 * 与 native 链"socks5 即时失败后 curl 重试"同契约。
 */
/** 中继层错误(区别于目标侧 HTTP 错误): 仅此类错误触发 curl 兜底, 防失败请求双发 */
class RelayTransportError extends Error {
  constructor(message: string) { super(message); this.name = 'RelayTransportError' }
}

const RELAY_URL = process.env.FETCH_RELAY_URL || 'http://127.0.0.1:3011'
const RELAY_PROBE_RETRY_MS = 60_000
let relayAvailable: boolean | null = null
let relayCheckedAt = 0

/** 中继可用性探测(/health), 结果按 RELAY_PROBE_RETRY_MS 缓存; 失败短超时快返 */
async function checkRelay(): Promise<boolean> {
  if (relayAvailable === true) return true
  if (relayAvailable === false && Date.now() - relayCheckedAt < RELAY_PROBE_RETRY_MS) return false
  try {
    const res = await fetch(`${RELAY_URL}/health`, { signal: AbortSignal.timeout(1500) })
    relayAvailable = res.ok
  } catch {
    relayAvailable = false
  }
  relayCheckedAt = Date.now()
  return relayAvailable
}

/** 中继响应重组形态: fetchHttp 逐跳循环消费的最小 Response 面。
 *  body 为可选(rr-c3 卫生: native Response 携带真实流, 中继重组形态无 body 字段 ——
 *  3xx/!ok 分支的 res.body?.cancel() 对中继形态为 no-op, 可选链短路安全) */
interface RelayResponseLike {
  status: number
  ok: boolean
  headers: Headers
  arrayBuffer(): Promise<ArrayBuffer>
  readonly body?: { cancel(): Promise<void> } | null
}

/** 单跳经中继发起: 返回所有目标侧响应(含 3xx/4xx/5xx, 忠实转发不拦截);
 *  仅中继服务自身不可达/内部错误/代理协议不支持时抛 RelayTransportError。
 *  clientSignal 透传 fetchHttp 的超时控制器(AbortError 原样上抛, 超时分类语义不变);
 *  中继侧超时给 clientTimeoutMs+3000 冗余(客户端先超时, 口径一致) */
async function relayHop(url: string, headers: Headers | Record<string, string>, proxy: string, clientSignal: AbortSignal, clientTimeoutMs: number): Promise<RelayResponseLike> {
  // 2-fetcher Part A: SSRF 守卫 —— 引擎不向中继请求内部目标(中继侧 1-c 另有校验, 双重保险)
  const ssrf = await assertSafeTarget(url, { allowLoopback: false })
  if (!ssrf.ok) throw new Error(`SSRF blocked: ${ssrf.reason}`)
  // buildHeaders 返回普通对象, 引擎逐跳处也可能是 Headers 实例 —— 两种形态都收
  const headerObj: Record<string, string> = {}
  if (headers && typeof (headers as Headers).forEach === 'function') {
    ;(headers as Headers).forEach((v, k) => { headerObj[k] = v })
  } else {
    for (const [k, v] of Object.entries(headers as Record<string, string>)) headerObj[k] = v
  }
  let res: Response
  try {
    res = await fetch(`${RELAY_URL}/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, headers: headerObj, proxy, timeoutMs: clientTimeoutMs + 3000 }),
      signal: clientSignal,
    })
  } catch (e: any) {
    if (e?.name === 'AbortError' || e?.code === 'ABORT_ERR') throw e
    throw new RelayTransportError(`中继不可达(${RELAY_URL}): ${String(e?.message || e).slice(0, 120)}`)
  }
  // R4-4: relay 响应体大小上限 —— 中继响应是 JSON 包装的 {status, headers, setCookie, bodyB64},
  //  bodyB64 是目标响应体的 base64 编码(膨胀 ~33%)。fetch-relay bridge 自身有 20MB 上限,
  //  但若中继服务异常/被攻击返回 1GB JSON, 引擎侧 res.json() 一次性读入会 OOM。
  //  读前先看 content-length 拒绝明显超大响应, 流式读时也 cap 在 20MB
  const RELAY_MAX_JSON_BYTES = 20 * 1024 * 1024
  const cl = Number(res.headers.get('content-length') || 0)
  if (cl && cl > RELAY_MAX_JSON_BYTES) {
    try { await res.body?.cancel().catch(() => {}) } catch { /* ignore */ }
    throw new RelayTransportError(`中继响应体过大(content-length=${cl} > ${RELAY_MAX_JSON_BYTES}字节), 已中止`)
  }
  let payloadText: string
  if (res.body && typeof res.body.getReader === 'function') {
    // 流式读 + 计数, 超限中止防 OOM
    const reader = res.body.getReader()
    const dec = new TextDecoder('utf-8')
    let acc = ''
    let total = 0
    let overflow = false
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > RELAY_MAX_JSON_BYTES) {
        overflow = true
        try { await reader.cancel().catch(() => {}) } catch { /* ignore */ }
        break
      }
      acc += dec.decode(value, { stream: true })
    }
    acc += dec.decode() // flush
    if (overflow) {
      throw new RelayTransportError(`中继响应体流式读超 ${RELAY_MAX_JSON_BYTES}字节上限, 已中止`)
    }
    payloadText = acc
  } else {
    // 无 body 流(理论不可达, 兜底走 text())
    payloadText = await res.text()
    if (payloadText.length > RELAY_MAX_JSON_BYTES) {
      throw new RelayTransportError(`中继响应体过大(${payloadText.length} > ${RELAY_MAX_JSON_BYTES}字符, 已读取)`)
    }
  }
  let payload: { status?: number; headers?: [string, string][]; setCookie?: string[]; bodyB64?: string; relayError?: string }
  try {
    payload = JSON.parse(payloadText)
  } catch (e: any) {
    throw new RelayTransportError(`中继响应非 JSON(HTTP ${res.status}): ${String(e?.message || e).slice(0, 100)}`)
  }
  if (payload.relayError || typeof payload.status !== 'number' || typeof payload.bodyB64 !== 'string') {
    throw new RelayTransportError(`中继层失败: ${String(payload.relayError || '响应形态非法').slice(0, 160)}`)
  }
  // R4-4: base64 body 同样 cap(防中继层未限大小就塞进来, 解码后 buf.length > 20MB 拒收)
  if (payload.bodyB64.length > Math.ceil(RELAY_MAX_JSON_BYTES * 4 / 3)) {
    throw new RelayTransportError(`中继 bodyB64 过大(${payload.bodyB64.length}字符), 已拒绝`)
  }
  const h = new Headers()
  for (const [k, v] of payload.headers || []) {
    if (k.toLowerCase() === 'set-cookie') continue // set-cookie 走专用通道保留多条
    try { h.append(k, v) } catch { /* 非法头键跳过(与引擎头键白名单同向) */ }
  }
  for (const c of payload.setCookie || []) {
    try { h.append('set-cookie', c) } catch { /* ignore */ }
  }
  const buf = Buffer.from(payload.bodyB64, 'base64')
  return {
    status: payload.status,
    ok: payload.status >= 200 && payload.status < 300,
    headers: h,
    arrayBuffer: async () => toArrayBufferView(buf),
  }
}

// ---------- scrapling 桥 (hh-c: 第三方抓取工具接入) ----------
/**
 * 场景: 引擎接入第三方抓取工具 Scrapling(Python 自适应抓取框架)。桥服务
 * mini-services/scrapling-bridge(127.0.0.1:3012, 与 bqg713-proxy:3010/fetch-relay:3011
 * 同 mini-service 范式)内以 Scrapling 三类 Fetcher 代发请求:
 *   - static:     curl_cffi TLS 指纹伪装(chrome impersonate)——与 curl 链的差异在
 *                 curl_cffi 会完整模拟浏览器 TLS 握手与头组, 对 JA3 指纹封锁是第三条出路
 *   - stealthy:   patchright 反检测浏览器 + solve_cloudflare(CF Turnstile/Interstitial
 *                 挑战自动求解)——Obscura 之外的第二个隐身浏览器面
 *   - playwright: 裸 Playwright chromium JS 渲染(与引擎裸 Playwright 链同源, 独立浏览器栈)
 * 分流点: fetchPageOnce 顶层(镜像组循环之内, 逐镜像 host 各走一次桥)——scrapling-* 模式
 * 把整次抓取交桥代发, 目标侧响应(含 4xx/5xx)如实透传不再双发; native 专有步骤
 * (token 预取/autoCookie/Cookie 挑战重试/清罐自愈/指数退避/浏览器升级链)跳过——
 * 隐身与反爬能力由桥内 Scrapling Fetcher 自身承担(可接受语义, 存档 worklog hh-c)。
 * 失败语义(照 fetch-relay 先例, 仅传输层错误降级): 桥进程不可达/桥内异常(ok:false)/
 * 响应形态非法 → 返回 null → 落入既有 native HTTP 链一次(warn 日志); 代理语义: 桥调用
 * 本身恒为回环直连(不注入代理), 规则配了 proxyUrl 且目标非回环时把代理经 body.proxy
 * 交桥内 Fetcher 走代理(pickProxyFor 复用 isLoopbackTarget 回环豁免)。
 * fetchMode 非法值: sanitize 白名单已拦截, scraplingModeOf 再兜底(运行时对象直改防线)
 * —— 两道防线后仍非 scrapling-* 一律 native 链, 缺省(未配置)零行为变化。
 */
const SCRAPLING_BRIDGE_URL = process.env.SCRAPLING_BRIDGE_URL || 'http://127.0.0.1:3012'
const SCRAPLING_MODES = ['static', 'stealthy', 'playwright'] as const
type ScraplingMode = (typeof SCRAPLING_MODES)[number]

/** fetchMode → 桥模式判定: 'scrapling-static|stealthy|playwright' → 对应模式;
 *  'native'/未配置/非法值 → null(native 链)。导出供测试脚本复用 */
export function scraplingModeOf(fetchMode: string | undefined | null): ScraplingMode | null {
  if (!fetchMode || !fetchMode.startsWith('scrapling-')) return null
  const mode = fetchMode.slice('scrapling-'.length)
  return (SCRAPLING_MODES as readonly string[]).includes(mode) ? (mode as ScraplingMode) : null
}

/**
 * mm-b 反反爬增强: 浏览器类桥模式的 hostGateLimit 自动钳制。
 * 桥服务对 stealthy/playwright 有全局 BoundedSemaphore(3)(server.py BROWSER_SEM,
 * 独立 launch 浏览器内存开销大): 引擎侧 hostGateLimit>3 时, 超出部分的请求并不能
 * 提升采集吞吐, 只会在桥内信号量排队 —— 而"在桥内排队"有两个真实代价:
 *  ① 白占 hostGate 槽位(同 host 的其他工作/并行任务被 starving);
 *  ② 引擎客户端护栏(AbortSignal timeout)在排队期间到点后, 请求被放弃但桥内浏览器
 *     会话继续跑完(孤儿工作), mm 重试还会再叠一次。
 * 故 gateFetch 准入时把 per-host limit 钳到 min(配置, SCRAPLING_BROWSER_CONCURRENCY):
 *  - stealthy/playwright → 钳制; 超出部分的请求改走 HostGate 等待(30s 上限),
 *    超时即 HostGateTimeout —— 系统既有设计面(bb-d: warn/不计失败/章节保持未采集,
 *    增量重试恢复), 不产生孤儿浏览器工作;
 *  - static(curl_cffi, 桥内无信号量)/native/未配置 → 原值透传(零回归);
 *  - 未配置 hostGateLimit(undefined)→ 原样(引擎缺省 3 恰等于钳制线, 无需干预)。
 * 行为注记: 大 timeout 的 stealthy 配置(桥内排队可在护栏内等到槽位)原先可能"晚到
 * 成功", 钳制后改为 30s HostGateTimeout + 增量重试 —— 与 hostGate 对超并发的一贯
 * 语义对齐; pili 生产配置(limit=2)不受影响。
 * 跨 host 共享: 桥信号量是进程级全局 3, 多 host 并行任务叠加时仍可能在桥内短暂排队
 * (per-host 闸无法表达全局上限), 该残余排队有界且无害, 不在本钳制职责内。
 */
// [R21-e-5] 精简: 仅文件内消费(effectiveHostGateLimit)去 export(rg 全库零外部引用)
const SCRAPLING_BROWSER_CONCURRENCY = 3

export function effectiveHostGateLimit(cfg: Pick<FetchConfig, 'fetchMode' | 'hostGateLimit' | 'hostGateConcurrency'>): number | undefined {
  const mode = scraplingModeOf(cfg.fetchMode)
  // feat-cloak-anticrawler F: 优先取 hostGateConcurrency(语义别名), 缺失回退 hostGateLimit
  const rawLimit = cfg.hostGateConcurrency ?? cfg.hostGateLimit
  if (mode !== 'stealthy' && mode !== 'playwright') return rawLimit
  const limit = rawLimit
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return limit
  return Math.min(limit, SCRAPLING_BROWSER_CONCURRENCY)
}

interface ScraplingBridgeResult {
  status: number
  html: string
  finalUrl: string
}

/** 经 scrapling 桥抓取一次: 成功返回 {status,html,finalUrl}; 桥不可达/桥内失败返回 null
 *  (调用方降级 native 链, warn 已在此打)。目标侧响应(含 4xx/5xx)在 ok:true 信封内如实
 *  透传 —— 与中继桥契约同向: 仅传输层失败触发降级, 目标请求不双发 */
async function fetchViaScraplingBridge(url: string, cfg: FetchConfig, mode: ScraplingMode): Promise<ScraplingBridgeResult | null> {
  // 2-fetcher Part A: SSRF 守卫 —— 引擎不向桥请求内部目标(桥侧另有校验, 双重保险)
  const ssrf = await assertSafeTarget(url, { allowLoopback: false })
  if (!ssrf.ok) {
    console.warn(`[fetcher] scrapling bridge SSRF 拒绝: ${ssrf.reason} (${url.slice(0, 120)})`)
    return null
  }
  const bridge = (cfg.scraplingBridgeUrl || '').trim() || SCRAPLING_BRIDGE_URL
  // 目标侧代理: 规则配了 proxyUrl 且目标非回环 → 随机选一条交桥(桥内 Fetcher 走代理);
  // 桥调用本身是回环直连(node fetch 不带 proxy 选项, 与 isLoopbackTarget 豁免语义一致)
  const proxy = pickProxyFor(url, cfg)
  // 显式头组透传: 规则 headers 最优先 + cookies 收敛为 Cookie 头(桥内 static 模式可覆盖
  // 其 stealthy_headers 生成的同名头; stealthy/playwright 经 extra_headers 透传);
  // native 专有的指纹头组/token 预取头不在此组装(桥内 Fetcher 自生成自洽头组)
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(cfg.headers || {})) headers[k] = v
  if (cfg.cookies && !headers.Cookie) headers.Cookie = cfg.cookies
  // Referer 与 native buildHeaders 同语义(ii-c 修前补齐: refererChain/refererUrl 运行时注入
  // 的来源页在 scrapling 模式曾被静默丢失 —— 规则组合 fetchMode=scrapling-* × refererChain
  // 时目录页→书籍页→章节页 Referer 链断裂): 优先级镜像 buildHeaders = 链 Referer(refererUrl)
  // > origin 回退(cfg.referer !== false) > 规则显式 cfg.headers.Referer(与 native 一致被回退覆盖)
  {
    const chainReferer = cfg.refererChain && cfg.refererUrl ? cfg.refererUrl : ''
    let origin = ''
    try { origin = new URL(url).origin } catch { /* ignore */ }
    if (chainReferer) headers.Referer = chainReferer
    else if (cfg.referer !== false && origin) headers.Referer = origin
  }
  const timeoutMs = cfg.timeout && cfg.timeout > 0 ? cfg.timeout : 20000
  // mm 轮韧性增强: 桥内浏览器实例逐请求独立, 瞬态崩溃(TargetClosedError/Page crashed,
  // 多 chromium 并存内存挤压场景)或桥重启窗口, 一次即降级 native —— 对 CF 挑战站 native
  // 必然 403, 整条采集链当场断裂(生产实锤: pili 任务首页 crash→全任务 0 书)。此处仅对
  // "桥内失败"重试一次(间隔 800ms, 浏览器重启 typically <1s); 目标侧真实响应(payload.ok)
  // 永不重发, 与"不双发"契约一致
  for (let attempt = 1; attempt <= 2; attempt++) {
    const retryHint = attempt === 1 ? '重试一次' : '降级 native 链'
    try {
      const res = await fetch(`${bridge}/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mode, headless: true, proxy: proxy || undefined, timeoutMs, headers }),
        // 客户端侧护栏只防桥进程僵死(桥自身对目标限时); 冗余 15s, 下限 45s(stealthy
        // 首启含浏览器冷启动 + solve_cloudflare 挑战求解耗时)
        signal: AbortSignal.timeout(Math.max(timeoutMs + 15_000, 45_000)),
      })
      if (!res.ok) {
        console.warn(`[fetcher] scrapling 桥响应形态非法(HTTP ${res.status}), ${retryHint}`)
        if (attempt === 1) {
          await new Promise((r) => setTimeout(r, 800))
          continue
        }
        return null
      }
      const payload = (await res.json()) as { ok?: boolean; status?: number; html?: string; finalUrl?: string; error?: string }
      if (!payload?.ok || typeof payload.status !== 'number' || typeof payload.html !== 'string') {
        console.warn(`[fetcher] scrapling 桥内失败(${String(payload?.error || '响应形态非法').slice(0, 140)}), ${retryHint}`)
        if (attempt === 1) {
          await new Promise((r) => setTimeout(r, 800))
          continue
        }
        return null
      }
      return { status: payload.status, html: payload.html, finalUrl: payload.finalUrl || url }
    } catch (e: any) {
      console.warn(`[fetcher] scrapling 桥不可达(${bridge}): ${String(e?.message || e).slice(0, 120)}, ${retryHint}`)
      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 800))
        continue
      }
      return null
    }
  }
  return null
}

/** 单代理(或直连)单次尝试: bun fetch 失败(网络错误/4xx/5xx)时自动落 curl 子进程。
 *  超时(AbortError)不落 curl: 同超时下 curl 也救不了, 白等。
 *  挑战壳(200+JS跳转)不在此处理, 由上层 Cookie 重试/浏览器升级链负责。
 *  代理尝试在 node 运行时直接走 curl(undici 静默忽略 proxy, 见 PROXY_FETCH_SUPPORTED) */
async function fetchHttpWithCurlSingle(url: string, cfg: FetchConfig, ua: string, proxy: string): Promise<string> {
  if (proxy && !PROXY_FETCH_SUPPORTED) {
    // node 运行时 + 代理: 内置 fetch 不支持 proxy 选项(静默忽略→伪装直连)。
    // gg 中继桥优先(若 bun 中继服务在位): bun 级 TLS 指纹过 WAF(wanben GoEdge 实录
    // curl 指纹被拦); 中继不在/中继层失败 → curl 链兜底(既有行为, 零回归)。
    // 超时(AbortError)不落 curl(同超时 curl 也救不了, 白等); 目标侧响应如实上抛不双发。
    if (await checkRelay()) {
      try {
        return await fetchHttp(url, cfg, ua, proxy, 'relay')
      } catch (e: any) {
        if (e?.name === 'AbortError' || e?.code === 'ABORT_ERR') throw e
        if (!(e instanceof RelayTransportError)) throw e
        console.warn('[fetcher] 中继桥失败, 落 curl 链:', String(e?.message || e).slice(0, 140))
      }
    }
    return fetchViaCurl(url, cfg, ua, proxy)
  }
  try {
    return await fetchHttp(url, cfg, ua, proxy)
  } catch (e: any) {
    if (e?.name === 'AbortError' || e?.code === 'ABORT_ERR') throw e
    // 2-fetcher C4: DNS 瞬时失败(ENOTFOUND/EAI_AGAIN) 2s 后重试 fetchHttp 一次, 不落 curl;
    // ECONNREFUSED 不重试(端口关=非瞬时, curl 也救不了); 超时(isFetchTimeout)不重试
    if (
      !e?.status && !e?.isFetchTimeout &&
      (e?.code === 'ENOTFOUND' || e?.code === 'EAI_AGAIN' ||
        /getaddrinfo (ENOTFOUND|EAI_AGAIN)/i.test(String(e?.message || '')))
    ) {
      await new Promise((r) => setTimeout(r, 2000))
      try {
        return await fetchHttp(url, cfg, ua, proxy)
      } catch {
        // DNS 重试仍失败, 落 curl 兜底(下方逻辑)
      }
    }
    try {
      return await fetchViaCurl(url, cfg, ua, proxy)
    } catch (curlErr: any) {
      console.warn('[fetcher] curl 传输未成:', String(curlErr?.message || curlErr).slice(0, 140))
      // 原错误是 HTTP 状态错误(带 status)时仍抛原错误保留 bodyHtml 语义;
      // 原错误是纯网络层失败(无 status, 如 TLS 指纹被 WAF 拒连)时改抛 curl 的错误 ——
      // 它带 status/bodyHtml, 上层 fetchPage 的 fallbackStatus/Cookie 挑战重试判定依赖这些字段,
      // 原先一律重抛原错误会让"curl 拿到 403+Set-Cookie"的挑战信号丢失, Cookie 重试链路失效
      if (e?.status) throw e
      throw curlErr || e
    }
  }
}

/** @internal 测试专用(gg 中继桥验证): 显式指定 transport 执行单次 HTTP 尝试 ——
 *  bun 运行时下 PROXY_FETCH_SUPPORTED 恒真, node+proxy 决策分支在 bun 探针里不可达,
 *  故以直通入口验证 relay 传输与 fetchHttp 逐跳语义的组合(循环回环端到端) */
export async function fetchHttpForTest(url: string, cfg: FetchConfig, ua: string, proxy: string, transport: 'native' | 'relay'): Promise<string> {
  return fetchHttp(url, cfg, ua, proxy, transport)
}

/**
 * HTTP 双传输封装 + 出口代理轮换(dd-a, 失败降级契约):
 * 配置了代理且目标非回环时, 按策略排序后逐条尝试(每条 = bun fetch→curl 兜底
 * 单次尝试); 任一条成功即返回; 全部失败 → 降级直连重试一次(与 token 预取
 * "静默降级不硬断"同口径)。轮换/降级全程仅 warn 级日志, 不因代理失败中断采集;
 * 降级直连成功与否如实返回/抛出(错误保留 status/bodyHtml 供上层挑战链判定)。
 * token 预取(prefetchToken)/token 挑战求解(trySolveTokenChallenge)亦经本函数,
 * 代理/回环豁免语义自动贯穿; 目标回环或未配置代理时行为与原实现完全一致(零回归)
 *
 * feat-round-8: B3 — 代理轮换策略 + 失败冷却
 *   - 过滤冷却中的代理(failedUntil > now), 全部冷却→直接降级直连
 *   - 排序按 cfg.proxyRotationStrategy:
 *     • undefined / 'random': Fisher-Yates 洗牌(原行为)
 *     • 'round-robin' / 'least-used': 按 useCount 升序(最低先用, 平摊负载)
 *   - 网络层失败(无 HTTP status — 超时/连接拒绝/DNS/TLS) → markProxyFailed(30s 冷却);
 *     HTTP 4xx/5xx(有 status)是源站响应, 代理本身健康, 不冷却
 */
export async function fetchHttpWithCurlFallback(url: string, cfg: FetchConfig, ua: string): Promise<string> {
  const pool = parseProxyPool(cfg.proxyUrl)
  if (!pool.length || isLoopbackTarget(url)) {
    return fetchHttpWithCurlSingle(url, cfg, ua, '')
  }
  // feat-round-8: B3 — 过滤冷却中的代理
  const available = pool.filter(isProxyAvailable)
  if (available.length === 0) {
    console.warn(`[fetcher] 全部 ${pool.length} 条代理均在冷却中, 降级直连: ${url.slice(0, 200)}`)
    return fetchHttpWithCurlSingle(url, cfg, ua, '')
  }
  // 排序: round-robin/least-used 按 useCount 升序; undefined/random Fisher-Yates 洗牌(原行为)
  // [R9-e-2] 增强: 开启健康度评分时 random 策略改为健康度降序(稳序排序 ties 保持池顺序,
  // 满分并列时退化为池顺序) —— 尝试顺序"最健康者优先", 全败时自然落到弱者探活
  // [R28-4-E6] sticky-host: 粘滞代理打头(同 host 会话复用), 其余可用代理作后备顺位
  const strategy = cfg.proxyRotationStrategy
  let order: string[]
  if (strategy === 'sticky-host') {
    const sticky = stickyPickFor(url, pool, available)
    order = [sticky, ...available.filter((p) => p !== sticky)]
  } else if (strategy === 'round-robin' || strategy === 'least-used') {
    order = available.slice().sort((a, b) => getProxyState(a).useCount - getProxyState(b).useCount)
  } else if (PROXY_HEALTH_SCORING) {
    order = available.slice().sort((a, b) => proxyHealthScore(b) - proxyHealthScore(a))
  } else {
    order = available.slice()
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
  }
  let lastErr: any = null
  let triedProxies = 0
  for (const proxy of order) {
    triedProxies++
    markProxyUsed(proxy)
    // [R9-e-2]: 本次尝试墙钟(健康度滑动窗口的延迟样本; 含链内 curl 兜底重试, 粗粒度信号)
    const attemptT0 = Date.now()
    try {
      const result = await fetchHttpWithCurlSingle(url, cfg, ua, proxy)
      // R4-3: 代理请求成功 → 清零连续失败计数, 让指数退避在代理恢复后立即解除
      markProxySucceeded(proxy)
      // [R9-e-2]: 记录成功样本(传输层通, 延迟为本次尝试墙钟)
      recordProxyOutcome(proxy, true, Date.now() - attemptT0)
      // [R28-4-E6]: sticky-host 成功反馈(粘滞条目连败清零)
      proxyStickyNote(url, proxy, true)
      return result
    } catch (e: any) {
      lastErr = e
      // [R28-4-M3] 源站级拒绝(403/429)立即停止逐代理轮换: IP 轮换对"源站级拒绝"收益趋零
      // (源站已表达的是拒绝该请求形态而非该出口; 403 惩罚记忆已由 noteHostHttpFailure 记账,
      // 连败≥5 另有 [R28-4-E1] host 级长静默熔断接管停手)。修前拿到 403/429 仍继续试下一条
      // 代理, 被全出口封锁的站每章白挨 10 代理+1 直连共 11 次被拒请求(既恶化源站侧 IP 信誉
      // 画像, 又与 pickProxyFor 单选语义不一致)。取舍声明: break 后仍落函数尾部既有直连兜底
      // (保留"静默降级不硬断"契约), 单章最坏 1 代理+1 直连=2 次(原 11 次), 残余面由 host 级
      // 熔断封顶; 代理本身健康(源站响应)故记成功样本并 sticky 反馈 ok
      if (e?.status === 403 || e?.status === 429) {
        recordProxyOutcome(proxy, true, Date.now() - attemptT0)
        proxyStickyNote(url, proxy, true)
        console.warn(`[fetcher] 代理收到源站级拒绝(HTTP ${e.status}), 停止逐代理轮换(${redactProxy(proxy)}): ${url.slice(0, 200)}`)
        break
      }
      // feat-round-8: B3 — 网络层失败(无 HTTP status)标记代理冷却 30s; HTTP 状态错误不冷却
      // R4-3: 冷却改为指数退避(30s→60s→120s→240s→300s 上限)
      if (isProxyNetworkError(e)) {
        markProxyFailed(proxy)
        // [R9-e-2]: 记录失败样本(代理不健康)
        recordProxyOutcome(proxy, false, Date.now() - attemptT0)
        // [R28-4-E6]: sticky-host 网络层失败反馈(连续 2 次顺移下一条)
        proxyStickyNote(url, proxy, false)
        console.warn(`[fetcher] 代理网络层失败+指数退避冷却(${redactProxy(proxy)}): ${String(e?.message || e).slice(0, 140)}`)
      } else {
        // [R9-e-2]: 源站 4xx/5xx = 传输层通(代理健康, 与"不冷却"同口径)记成功样本
        recordProxyOutcome(proxy, true, Date.now() - attemptT0)
        // [R28-4-E6]: 代理本身健康(源站响应), sticky 连败清零
        proxyStickyNote(url, proxy, true)
        console.warn(`[fetcher] 代理请求失败(源站响应, 不冷却)(${redactProxy(proxy)}): ${String(e?.message || e).slice(0, 140)}`)
      }
    }
  }
  // [R28-4-M3]: 计数如实(403/429 break 时不再宣称"全部失败")
  console.warn(`[fetcher] ${triedProxies}/${order.length} 条代理失败(末次: ${String(lastErr?.message || lastErr).slice(0, 120)}), 降级直连重试: ${url.slice(0, 200)}`)
  return fetchHttpWithCurlSingle(url, cfg, ua, '')
}

// ---------- 通用 token 预取钩子(bb-d) ----------
/** 场景: 部分站点(bqg713 系 content 段等)的接口/页面需要先从另一端点取得动态 token
 *  才能放行(缺失/非法值一律 403)。这里提供【通用预取型】token 能力:
 *   - cfg.tokenUrl: 预取地址(响应体含 token 的任意端点); 支持 {url} 占位符
 *     (=当前请求 URL 的 encodeURIComponent, 外部转换代理形态)
 *   - cfg.tokenPattern: 提取表达式 — 'regex:' 前缀=正则(取第一捕获组, 无捕获组取全匹配);
 *     否则按 JSON 点路径(如 'data.token', 语法同 parser.jsonGet)
 *   - cfg.tokenInjection: 'url'=替换请求 URL 中的 {token} / %7Btoken%7D 占位符
 *     (规则 const 模板不认识的 {token} 占位符可用百分号编码形态存活到 fetch 时),
 *     无占位符时追加 ?token=/&token= 查询参数; 'header'=注入请求头 tokenHeaderName(默认 X-Token)
 *   - 预取失败/提取为空 → 静默降级为无 token 直连(不硬断链路);
 *     同 (host+tokenUrl+pattern) 30s 进程内缓存, 防逐章双请求拖慢与预取端限流
 *   注: bqg713 现状为【按章 AES-CBC 加密参数】型 token(每次请求需对 {id,chapterid}
 *   加密, 密钥派生自站点混淆 JS), 不属"可预取 token"形态, 本钩子无法表达 ——
 *   该站仍需站点专属解密或外置转换代理(见 worklog bb-d 留档), 钩子面向通用形态 */
const TOKEN_CACHE_TTL_MS = 30_000
/** 容量上限(rr-c3): {url} 占位符形态(生产 bqg713 规则 tokenUrl=…/rewrite?url={url} 在用)
 *  按解析后 URL 逐章分键, TTL 仅在"同键再次命中"时惰性删过期条目 —— 逐章单次访问的键
 *  永不回收, 长任务 Map 无界增长(probe-rr-c3-token-cache 实证: 800 目标→800 条目, 人为
 *  过期条目新写入后仍存活)。超限先全表清扫过期条目, 仍超限按插入序删最旧; 固定 tokenUrl
 *  (会话型)形态每 host 恒 1 条, 上限永不触及, 缓存语义零变化 */
const TOKEN_CACHE_MAX = 256

function tokenCacheTrim(cache: Map<string, { token: string; at: number }>) {
  if (cache.size <= TOKEN_CACHE_MAX) return
  const now = Date.now()
  for (const [k, e] of cache) {
    if (now - e.at >= TOKEN_CACHE_TTL_MS) cache.delete(k)
  }
  while (cache.size > TOKEN_CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

const globalForToken = globalThis as unknown as {
  __novelTokenPrefetch_v1?: Map<string, { token: string; at: number }>
  /** R4-1: in-flight token 预取 promise —— 并发调用同 cacheKey 时复用同一 promise, 防
   *  TTL 过期瞬间 N 个并行章节请求同时 miss cache、同时触发 N 次 fetchHttpWithCurlFallback
   *  打爆 token 端点(触发对端 429 / 自伤出口 IP)。Promise resolve 后清条目 */
  __novelTokenInflight_v1?: Map<string, Promise<string>>
}
function tokenCache(): Map<string, { token: string; at: number }> {
  if (!globalForToken.__novelTokenPrefetch_v1) globalForToken.__novelTokenPrefetch_v1 = new Map()
  return globalForToken.__novelTokenPrefetch_v1
}
function tokenInflight(): Map<string, Promise<string>> {
  if (!globalForToken.__novelTokenInflight_v1) globalForToken.__novelTokenInflight_v1 = new Map()
  return globalForToken.__novelTokenInflight_v1
}

/** token 提取: 'regex:' 前缀=正则第一捕获组(无捕获组取全匹配), 否则 JSON 点路径。
 *  JSON 路径惰性 import parser(其顶层依赖 fetchPage, 避免模块环) */
async function extractToken(body: string, pattern: string): Promise<string> {
  if (!body) return ''
  const p = (pattern || '').trim()
  if (!p) return ''
  if (p.startsWith('regex:')) {
    try {
      const m = new RegExp(p.slice(6)).exec(body)
      return m ? (m[1] ?? m[0] ?? '').trim() : ''
    } catch { return '' }
  }
  try {
    const { parseJsonBody, jsonGet, jsonToString } = await import('./parser')
    const root = parseJsonBody(body)
    if (root === undefined) return ''
    return jsonToString(jsonGet(root, p)).trim()
  } catch { return '' }
}

// [R22-e-1] token 预取 URL 解析({url} 占位符全量替换, 2-fetcher Bug 11 口径)——
//  prefetchToken 与 invalidateTokenCache 共用同一展开, 防两处各写一份 replace 逻辑漂移
function resolveTokenRealUrl(tokenUrl: string, targetUrl: string): string {
  return tokenUrl.includes('{url}') ? tokenUrl.split('{url}').join(encodeURIComponent(targetUrl)) : tokenUrl
}

// [R22-e-1] token 缓存键构造(prefetchToken 写入与失效删除共用同一函数, 修前键串内联在
//  prefetchToken 中, 失效方无法等价重算出同键) —— 键 = 目标 origin|展开后预取 URL|提取式
function tokenCacheKeyFor(targetUrl: string, cfg: FetchConfig): string {
  return `${originHost(targetUrl)}|${resolveTokenRealUrl((cfg.tokenUrl || '').trim(), targetUrl)}|${(cfg.tokenPattern || '').trim()}`
}

// [R22-e-1] token 失效重取路径(修前缺失): 预取 token 注入即进 30s 进程内缓存, 会话型
//  token 中途失效(签名过期/服务端轮换/出口 IP 变更)时, 缓存窗口内后续章节全部复用毒 token
//  吃 403 —— 触发 hostRhythm 403 惩罚窗+退避白耗重试, 而同一次 fetchPageOnce 的重试链
//  reqUrl 已定永远复用旧 token, 无重取机会。现目标端 403 且本次请求注入了 token 时删除缓存
//  条目, 下一次抓取自然重新预取。幂等(条目不存在 no-op); 403 若为 UA/WAF 拦截所致则多花
//  一次预取请求(预取端通常为操作员本机转换代理 127.0.0.1:301x, 成本可忽略)
function invalidateTokenCache(targetUrl: string, cfg: FetchConfig): void {
  if (!(cfg.tokenUrl || '').trim() || !(cfg.tokenPattern || '').trim()) return
  tokenCache().delete(tokenCacheKeyFor(targetUrl, cfg))
}

/** token 预取(带 30s 进程内缓存): 失败返回 ''(静默降级, 不硬断链路) */
async function prefetchToken(targetUrl: string, cfg: FetchConfig, ua: string): Promise<string> {
  const tokenUrl = (cfg.tokenUrl || '').trim()
  const pattern = (cfg.tokenPattern || '').trim()
  if (!tokenUrl || !pattern) return ''
  // [R22-e-1]: {url} 展开收敛到 resolveTokenRealUrl(与失效路径共用)
  const real = resolveTokenRealUrl(tokenUrl, targetUrl)
  // 2-fetcher Part A: SSRF 守卫 —— tokenUrl 是操作员配置的预取端点(常为 127.0.0.1:301x
  // 转换代理), 允许 loopback; 但仍拒绝云元数据/私网(防恶意规则把 tokenUrl 指 10.0.0.1)
  const ssrf = await assertSafeTarget(real, { allowLoopback: true })
  if (!ssrf.ok) {
    console.warn(`[fetcher] prefetchToken SSRF 拒绝: ${ssrf.reason} (${real.slice(0, 120)})`)
    return ''
  }
  // 缓存键用【解析后】预取 URL(bb-g 修复): 原 tokenUrl 原串含 {url} 占位符时, 同 host 30s 内
  // 所有目标 URL 共享同一缓存槽 —— 第二章复用第一章的 f(url) token 必被目标端 403。
  // 固定 tokenUrl(会话型)时 real === tokenUrl, 缓存语义不变
  // [R22-e-1]: 键构造收敛到 tokenCacheKeyFor(与失效删除共用同一函数)
  const cacheKey = tokenCacheKeyFor(targetUrl, cfg)
  const cached = tokenCache().get(cacheKey)
  if (cached && Date.now() - cached.at < TOKEN_CACHE_TTL_MS) return cached.token
  // R4-1: in-flight 去重 —— TTL 过期瞬间 N 个并行章节请求同时 miss cache, 原实现每个都
  // 触发一次 fetchHttpWithCurlFallback(real, ...), N× 负载打在 token 端点上(触发对端 429
  // 或自伤出口 IP)。现复用同一 in-flight promise, N 个 caller 共享一次预取结果
  const inflightMap = tokenInflight()
  const existing = inflightMap.get(cacheKey)
  if (existing) {
    try {
      return await existing
    } catch {
      // 上一次预取失败, 落到下方自己重试一次(单次, 不再 in-flight 嵌套)
    }
  }
  const p = (async () => {
    try {
      // [R9-a-13] B1: token 预取端点要求每次新响应(304 缓存会让过期 token 再次生效), 关闭条件请求
      const noCond: FetchCfgOpt = { ...cfg, conditionalGet: false }
      const body = await fetchHttpWithCurlFallback(real, noCond, ua)
      const token = await extractToken(body, pattern)
      if (token) {
        const cache = tokenCache()
        cache.set(cacheKey, { token, at: Date.now() })
        tokenCacheTrim(cache) // rr-c3: 有界化(修前逐章分键条目永不清扫 → 长任务无界增长)
      }
      return token
    } finally {
      // 完成后清 in-flight 条目, 让下次 TTL 过期能重新预取
      inflightMap.delete(cacheKey)
    }
  })()
  inflightMap.set(cacheKey, p)
  return p
}

// ---------- 镜像域名自动故障切换 (dd-b) ----------
/**
 * 场景: bqg713 系站点正文 API 钉死单域(apibi.cc), 域死则全站章节全失败, 换模板域名
 * 需手工平移。引擎级通用能力: FetchConfig.mirrorDomains 配置镜像组, 失败驱动逐 host
 * 重写重试(transport 级, 本文件内闭环)。
 * 设计裁定(存档 worklog dd-b):
 *  - 镜像组 = URL 自身 host + mirrorDomains 全部条目(通用口径: URL host 无须出现在
 *    列表内, 组内即触发); 组以 URL host 打头, "从当前 host 的下一个开始/环形回绕"语义
 *    由构造保证(首尝试即当前 host, 逐个后移, 至多组大小次);
 *  - 触发条件 transport 级: 网络错误/超时(无 status)与 HTTP 403/5xx; 404 与 2xx/3xx
 *    不触发(404=资源不存在, 换镜像无意义, 存档裁定); 401/412/429 等其余 4xx 亦不触发
 *    (auto 引擎下交既有浏览器升级链处理, 与镜像职责正交);
 *  - hostGate 关系: 镜像重试在本层(fetchPage 内)完成, 不经 hostGate 闸门 —— 故障切换是
 *    失败驱动的低频路径且至多组大小次有界, 按新 host 重新排队会显著复杂化计账且收益为零
 *    (runner.gateFetch 对整个 fetchPage 调用持一个闸门槽, 内部镜像重试随行同槽);
 *  - 每个镜像 host 独立走完整 fetchPageOnce 流程(token 预取 {url} 占位符按重写后 URL
 *    取值 → 逐章 token 天然按镜像域重签, 代理池/回环豁免/UA/Cookie 逻辑照常);
 *    不做跨请求"上次好域"记忆(有状态缓存会延迟故障发现, 保持无状态可测);
 *  - fetchBinary(封面等静态资源)刻意不接镜像: 非内容链路且失败优雅降级 null。
 */
const MAX_MIRROR_HOSTS = 10

/** 镜像组解析: URL host 打头 + mirrorDomains 逗号分隔条目(小写化/去空/去重/逐条形态
 *  校验, 上限 MAX_MIRROR_HOSTS; 与 URL host 相同的条目剔除)。未配置或 URL 不可解析
 *  → 返回空(单 host 直通, 零行为变化) */
export function mirrorGroupFor(url: string, cfg: Pick<FetchConfig, 'mirrorDomains'>): string[] {
  const raw = (cfg.mirrorDomains || '').trim()
  if (!raw) return []
  let host = ''
  try { host = new URL(url).host.toLowerCase() } catch { return [] }
  if (!host) return []
  const seen = new Set<string>([host])
  const group = [host]
  for (const item of raw.split(',')) {
    const s = item.trim().toLowerCase()
    if (!s || seen.has(s) || !isValidMirrorHost(s) || group.length >= MAX_MIRROR_HOSTS + 1) continue
    seen.add(s)
    group.push(s)
  }
  return group
}

/** host 重写: 仅换 hostname(条目带 :port 时连 port 一起换, 条目缺省端口则保留原 port),
 *  scheme/path/query/fragment 原样保留。URL 不可解析返回 null(调用方跳过该镜像) */
export function rewriteMirrorHost(url: string, hostEntry: string): string | null {
  try {
    const u = new URL(url)
    const idx = hostEntry.lastIndexOf(':')
    if (idx > 0) {
      u.hostname = hostEntry.slice(0, idx)
      u.port = hostEntry.slice(idx + 1)
    } else {
      u.hostname = hostEntry
    }
    return u.toString()
  } catch {
    return null
  }
}

/** 镜像切换触发判定: 有显式 status 时仅 403/5xx 可切换; 无 status = 网络层错误/超时
 *  (DNS 失败/连接拒绝/TLS/AbortError) —— 域名级故障的典型形态, 可切换。
 *  404(资源不存在, 换镜像无意义, 存档裁定)/3xx/其余 4xx 不触发 */
export function isMirrorSwitchableError(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status
  if (typeof status === 'number' && Number.isFinite(status) && status > 0) {
    return status === 403 || (status >= 500 && status <= 599)
  }
  return true
}

// ---------- 统一入口 ----------
export interface FetchResult {
  html: string
  engine: 'http' | 'browser'
  blocked: boolean
}

/**
 * 统一抓取入口: 未配置 mirrorDomains 时单 host 直通 fetchPageOnce(与历史行为逐字节一致);
 * 配置后按镜像组失败驱动切换(dd-b, 语义见镜像段注释)
 */
export async function fetchPage(url: string, cfgOverride?: Partial<FetchConfig>): Promise<FetchResult> {
  const cfg: FetchConfig = { ...DEFAULT_FETCH_CONFIG, ...cfgOverride }
  // feat-cloak-anticrawler E: 在飞计数器(SIGTERM 优雅关闭判定用) —— 必须在 SSRF 守卫
  // 之前 +1, 让"被 SSRF 拒绝也计入在飞"语义不丢(同步路径瞬时 return 不影响计数器一致性:
  // enterInFlight +1, finally 出口 leaveInFlight -1)。SSRF 拒绝是同步 throw, finally 仍执行
  enterInFlight()
  try {
    // feat-cloak-anticrawler F: 全局并发信号量 —— acquire/release 在外层包裹,
    // 让"被 SSRF 拒绝/内存压力等待/镜像组重试"全路径都计入全局在飞计数(同 hostGate
    // 口径, 保证信号量与在飞计数器一致)。release 必须在 finally, 否则异常路径会泄漏槽位。
    // 钳制 limit [1, 50](sanitizeFetchConfig 同口径, 兜底防脏值)
    const globalLimit = Math.max(1, Math.min(50, cfg.globalConcurrency ?? 10))
    await acquireGlobalSlot(globalLimit)
    try {
      // feat-cloak-anticrawler G: 路径抖动 —— 跨"不同 URL path"切换时插入 100~500ms 随机延迟
      // (cfg.pathJitter === true 时启用, 缺省 false 零回归)。必须在信号量获取后, 让抖动等待
      // 也计入全局在飞(否则信号量槽位会被抖动等待占用而其他请求饿死)。抖动不释放信号量,
      // 同一个槽位一直持有到 fetchPageOnce 完成 → finally release
      await maybePathJitter(url, cfg)
      // feat-cloak-anticrawler H: OOM 保护 —— heapUsed 超 1.5GB 暂停新请求 5s, 让 GC 回收
      // 在飞响应体/cheerio 文档; 长任务大书(数千章节)累积堆占用撑爆 4G 容器导致 OOM kill。
      // 同步 process.memoryUsage() 开销极低(<1μs), 每请求测一次可接受
      // R8-19: 全局协调 —— 第一个检测到内存压力的请求 sleep 5s 并置 backpressure 标志;
      // 后续并发请求看到标志直接等待标志清除(不重复 sleep), 避免 10 个并发请求同时各 sleep 5s
      // 浪费 50s 聚合时间(GC 是单线程的, 同时 sleep 不增加 GC 时间)
      try {
        const mem = process.memoryUsage()
        if (mem.heapUsed > 1.5 * 1024 * 1024 * 1024) {
          if (!oomBackpressure.active) {
            // 第一个检测到的请求: 置标志 + sleep 5s 让 GC 回收
            oomBackpressure.active = true
            oomBackpressure.until = Date.now() + 5000
            console.warn(`[fetcher] 内存压力(heapUsed=${Math.round(mem.heapUsed / 1024 / 1024)}MB > 1.5GB), 暂停 5s 让 GC 回收(并发请求将等待本窗口结束)`)
            await new Promise((r) => setTimeout(r, 5000))
            oomBackpressure.active = false
          } else {
            // 后续并发请求: 等待当前 backpressure 窗口结束(不重复 sleep)
            const remain = oomBackpressure.until - Date.now()
            if (remain > 0) await new Promise((r) => setTimeout(r, remain))
          }
        }
      } catch { /* memoryUsage 失败容忍 */ }

      // 2-fetcher Part A: SSRF 守卫 —— 默认禁止抓取内部/元数据/私网地址; loopback 仅对
      // 操作员配置的 tokenUrl(127.0.0.1:301x)/fetch-relay/scrapling bridge 内部调用放行
      const allowLoopback = loopbackBypassAllowed(url, cfg)
      const ssrf = await assertSafeTarget(url, { allowLoopback })
      if (!ssrf.ok) throw new Error(`SSRF blocked: ${ssrf.reason}`)
      const group = mirrorGroupFor(url, cfg)
      if (group.length <= 1) return await fetchPageOnce(url, cfg)
      let lastErr: unknown = null
      for (let i = 0; i < group.length; i++) {
        const hostUrl = rewriteMirrorHost(url, group[i])
        if (!hostUrl) continue
        // 2-fetcher Part A: 镜像 host 也走 SSRF 守卫(防 admin 配置 mirrorDomains 指向内网)
        // R5-13: 原硬编码 allowLoopback:false 会把 URL 自身的 loopback token 代理(如 127.0.0.1:3010)
        //  在 i=0 首次迭代(=URL 自身 host)时拒掉 → 该镜像被跳过 → 章节抓取静默失败。
        //  改用 loopbackBypassAllowed(hostUrl, cfg) 与外层 SSRF 守卫同口径(配置豁免则放行)
        const mirrorSsrf = await assertSafeTarget(hostUrl, { allowLoopback: loopbackBypassAllowed(hostUrl, cfg) })
        if (!mirrorSsrf.ok) {
          console.warn(`[fetcher] 镜像 ${group[i]} SSRF 拒绝: ${mirrorSsrf.reason}`)
          lastErr = new Error(`SSRF blocked: ${mirrorSsrf.reason}`)
          continue
        }
        try {
          return await fetchPageOnce(hostUrl, cfg)
        } catch (e) {
          lastErr = e
          // 不可切换错误(404/3xx/其余4xx)原样上抛: 换镜像无意义, 错误语义与单 host 契约一致
          if (!isMirrorSwitchableError(e)) throw e
          console.warn(
            `[fetcher] 镜像切换: ${group[i]} 失败(${String((e as Error)?.message || e).slice(0, 120)}), ` +
            (i + 1 < group.length ? `改试下一镜像 ${group[i + 1]}` : `镜像组已尽(共${group.length}个 host)`)
          )
        }
      }
      throw lastErr ?? new Error('抓取失败(镜像组全部尝试失败)')
    } finally {
      releaseGlobalSlot()
    }
  } finally {
    leaveInFlight()
  }
}

/**
 * Token 挑战 HTTP 求解器(ixdzs/101kks 系"正在验证浏览器"盾):
 * 页面 body 内嵌 `let token = "..."` 并执行 `location.href = pathname + "?challenge=" + token`,
 * 纯 HTTP 即可求解 —— 取 token → 带 Cookie 请求 原地址+challenge 参数 → 得真实页面。
 * 求解后新 Cookie 已随响应写入 jar, 后续请求直连。
 * 返回 null 表示不匹配该模式或求解后仍被拦(交回上层升级链)。
 */
async function trySolveTokenChallenge(url: string, html: string, cfg: FetchConfig, ua: string): Promise<string | null> {
  if (!html || html.length > 5000) return null
  // R3-8: 原实现把 token=... 与 "?challenge=" 两个特征作【独立 OR】判定 —— 任意"含 token 字符串
  // + 出现 ?challenge 字样"的拦截页都会误触发求解(如 CF "Attention Required" 挑战页 HTML 内嵌
  // challenge-platform 脚本 + 含 token=... 字面量)。改为要求两特征【同时】出现且在 500 字符
  // 邻近范围内(典型 token 挑战壳体极短 <2k, 二者必紧邻)。仅命中 token= 而无 challenge 拼接,
  // 或仅命中 challenge 而无 token= 的形态一律放弃求解(交回浏览器升级链, 不浪费双跳请求)
  // R4-6: 原正则只匹配双引号 token —— 源站用 `let token = '...'`(单引号)或反引号时求解漏触发,
  //  降级走浏览器渲染(慢)。改为 ["'`] 字符组同时支持双引号/单引号/反引号, 且开闭引号必须一致
  const m = html.match(/(?:let|var)\s+token\s*=\s*(["'`])([A-Za-z0-9+/=_-]{20,})\1/)
  if (!m) return null
  const tokenIdx = m.index ?? -1
  const token = m[2]
  // challenge 拼接模式: location.href = ... + "?challenge=" + token, 允许 ? 或 = 单独成块,
  // 但要求是同一行/紧邻 token 定义(<500 字符)。encodeURIComponent 分支显式列出防止误命中
  const chalRe = /location\.href\s*=\s*[^;]{0,200}\?\s*challenge\s*=?|location\.href\s*=\s*[^;]{0,200}\+\s*encodeURIComponent/
  const cm = html.match(chalRe)
  if (!cm) return null
  const chalIdx = cm.index ?? -1
  if (tokenIdx < 0 || chalIdx < 0) return null
  if (Math.abs(tokenIdx - chalIdx) > 500) return null
  const challengeUrl = `${url}${url.includes('?') ? '&' : '?'}challenge=${encodeURIComponent(token)}`
  try {
    // [R9-a-13] B1: challenge 求解必须拿新响应(一次性 token), 关闭条件请求协商
    const noCond: FetchCfgOpt = { ...cfg, conditionalGet: false }
    const solved = await fetchHttpWithCurlFallback(challengeUrl, noCond, ua)
    return looksBlocked(solved) ? null : solved
  } catch {
    return null
  }
}

// ============================================================
// [R11-b-EN] 反反爬增强开关组(全部缺省关闭, 关闭时代码路径与现状逐字节等价)
// [R22-e-7] 开启建议评估(逐项过审, 维持缺省全关不变 —— 仅把结论留档供运维选型):
//  ① 可安全开启(纯自愈/纯减伤, 不改变成功路径响应形态):
//    RETRY_AFTER_HONOR(尊重服务端 Retry-After 写 hostgate 冷却, 纯减伤)
//    FETCH_BINARY_RETRY(封面瞬时失败一次重试, 永久失败不重试)
//    FETCH_BODY_LEN_CHECK(截断检测, 仅无压缩响应参与比对, 误报面=零)
//    CHALLENGE_ESCALATE(CF 强指纹跳过无效 Cookie 重试, 升级链为既有路径)
//  ② 建议按需灰度(有可辩护的误拦面):
//    RESPONSE_SANITY(JS 壳/乱码判拦 —— 重 JS 渲染型源站可能误拦, 先灰度观察)
//    FETCH_AL_POOL(AL 方言分散, 同站恒定/跨站分散, 指纹面更分散但改变 AL 形态)
//  ③ 场景开关: PROXY_HEALTH_SCORING(仅配置了代理池时有意义)/HOSTGATE_PACE_PROFILE
//    (节奏观测面, 低开销, 排障期开启)/PATH_JITTER|pathJitter(规则级字段)
// ============================================================
// [R11-b-EN-1] RETRY_AFTER_HONOR: 429/503 响应携带合法 Retry-After(≥1s, 整数秒/HTTP 日期
//  双形态已由 parseRetryAfterHeaderMs 解析并挂到抛错对象 retryAfterMs)时, 除既有
//  hostRhythm 惩罚(≤20s, 429)与 runner.gateFetch 抛错路径 reportHostRateLimited(仅 429)外,
//  在 fetcher 错误入口即时写入 hostgate per-host 限流冷却(上限钳 120s 在 hostgate 侧) ——
//  补上 503 不走 gateFetch 限流冷却的缺口, 且同轮重试尚未结束时其他并发任务已受保护。
//  仅采纳显式合法值(≥1s): 缺省/非法/过小不触发, 维持既有 30s 兜底口径不变
const RETRY_AFTER_HONOR_ENABLED = process.env.RETRY_AFTER_HONOR === '1'
// [R11-b-EN-2] CHALLENGE_ESCALATE: 响应体命中 CF 挑战页强指纹(cf-chl/challenge-platform
//  探测脚本/cf-turnstile/"just a moment"等)时, 跳过既有的 Cookie 重试链(对新种 Cookie
//  再请求 1~2 次对 CF 盾毫无收益, 只会多敲盾页恶化 IP 信誉), 直接升级既有 auto 浏览器
//  渲染链(obscura→裸 Playwright, 升级仍只此一次)。非 CF 特征的通用拦截词(captcha/验证码)
//  不触发, 维持原 Cookie 重试语义
const CHALLENGE_ESCALATE_ENABLED = process.env.CHALLENGE_ESCALATE === '1'
// [R11-b-EN-3] RESPONSE_SANITY: 响应体健全性启发(缺省关闭零回归) —— looksBlocked 只能
//  识别"短页/强特征盾页", 对"长页但无正文"的形态(纯 JS 壳/SPA 骨架/双层压缩残留乱码)
//  会当正常内容放行, HTTP 引擎下解析出空章节、auto 引擎下不升级浏览器。开启后:
//   ① 长页(≥1200 字)去 script/style 后可见文本 <80 字 → 判空壳(按拦截处理, auto 升级
//      浏览器渲染; http 引擎如实置 blocked 交上层失败链, 不再存空壳正文);
//   ② U+FFFD 乱码密度异常(≥20 个且占比 ≥1%, 前 256KB 采样) → 判编码损坏(浏览器重渲染
//      可自愈 —— 引擎侧 decodeBuffer 已尽力, 谎报 charset 只能靠浏览器嗅探纠正);
//   ③ JSON 体(规则 API 站, '{'/'[' 开头)明确豁免, 不影响 bqg713 纯 API 站放行口径;
//   ④ 短页(<1200 字)不参与判定, 维持 looksBlocked 既有规则管辖, 不双重判定
const RESPONSE_SANITY_ENABLED = process.env.RESPONSE_SANITY === '1'

/** [R11-b-EN-2] CF 挑战页强指纹(仅用于挑战升级判定; 与 looksBlocked 的通用拦截词库区分):
 *  challenge-platform 需排除 CF JS Detections 探测脚本(正常页普遍内嵌, looksBlocked 已有
 *  jsdBenign 豁免同口径), 其余强特征命中即判 CF 管理型挑战形态 */
function isCfChallengeShell(html: string): boolean {
  if (!html) return false
  const lower = html.toLowerCase()
  if (lower.includes('challenge-platform') && !lower.includes('challenge-platform/scripts/jsd')) return true
  return /cf-chl|cf_chl_|cf-turnstile|just a moment|checking your browser|attention required/.test(lower)
}

/** [R11-b-EN-3] 响应体健全性启发(空壳/纯 JS 壳/乱码): 返回 true=不健全, 按拦截形态处理。
 *  采样截前 256KB(与 detectTrapSignals 有界扫描同口径, 10MB 响应上限下正则开销有界) */
function responseSanityBad(html: string): boolean {
  if (!html || html.length < 1200) return false
  const head = html.trimStart()
  if (head.startsWith('{') || head.startsWith('[')) return false // JSON API 体豁免(规则解析对象)
  const probe = html.slice(0, 262144)
  // ① 纯 JS 壳/SPA 骨架: 去 script/style 后可见文本占比异常低(真实内容页不可能 <80 字)
  const visible = probe
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (visible.length < 80) return true
  // ② 编码乱码: U+FFFD 密度异常(谎报 charset/双层压缩残留; 浏览器重渲染可自愈)
  let fffd = 0
  let idx = probe.indexOf('\uFFFD')
  while (idx >= 0) { fffd++; idx = probe.indexOf('\uFFFD', idx + 1) }
  if (fffd >= 20 && fffd / probe.length >= 0.01) return true
  return false
}

/** [R12-c2-1] 纯 JSON 体判定(trimStart 后 {/[ 打头且 JSON.parse 成功) ——
 *  degrade-native 转换代理 {ok,len,content} 信封识别用(见 fetchPageOnce 免判注释) */
function isPlainJsonBody(s: string): boolean {
  // [R15-d1-4](Low, perf): O(1) 快速拒绝 —— looksBlocked 对每次响应体都会调用本函数,
  // HTML 体(常态)首字符即 '<' 且无前导空白, 原先 trimStart 对最大 10MB 串白做一次全量
  // 拷贝; 快速路径命中时(无前导空白且首字符非 {/[)与 trimStart 后判定逐字节等价,
  // 其余形态(带前导空白/JSON 体)维持原路径
  const str = s || ''
  const c00 = str.charCodeAt(0)
  if (str && c00 !== 0x7b /* { */ && c00 !== 0x5b /* [ */ && !/\s/.test(str[0] ?? '')) return false
  const t = str.trimStart()
  const c0 = t.charCodeAt(0)
  if (!t || (c0 !== 0x7b && c0 !== 0x5b)) return false
  try { JSON.parse(t); return true } catch { return false }
}

/** 单 host 完整抓取流程(原 fetchPage 本体): token 预取 → HTTP 重试链 → auto 浏览器升级。
 *  每个镜像 host 独立走一遍完整流程 —— token 预取 {url} 占位符按当前 host 的 URL 取值,
 *  逐章 token 天然按镜像域重签(与 token 钩子组合的正确性来源, verify-dd-b-mirror ④ 实证);
 *  auto 引擎两条出口错误附加 .status=lastStatus: 镜像层按状态判定可切换性(纯网络错误
 *  无 status 天然可切换; 404 等不可切换错误透传状态后仍不可切换) */
async function fetchPageOnce(url: string, cfg: FetchConfig): Promise<FetchResult> {
  // hh-c: scrapling 桥分流 —— fetchMode='scrapling-*' 时整次抓取交桥代发, 目标侧响应
  // 如实返回(不双发); native 专有步骤(token 预取/autoCookie/Cookie 重试/浏览器升级链)
  // 跳过, 隐身能力由桥内 Scrapling Fetcher 承担。桥不可达/桥内异常 → null → 落入下方
  // 既有 native 链降级一次(warn 日志在 fetchViaScraplingBridge 打出)。非法 fetchMode
  // 在 sanitize 白名单已丢弃, scraplingModeOf 此处再兜底(运行时对象直改注入防线)。
  // 未配置 fetchMode / 'native' → scraplingModeOf=null, 下方原流程零行为变化
  const slMode = scraplingModeOf(cfg.fetchMode)
  if (slMode) {
    const bridged = await fetchViaScraplingBridge(url, cfg, slMode)
    if (bridged) {
      const blocked = looksBlocked(bridged.html, { status: bridged.status })
      if (blocked) {
        console.warn(`[fetcher] scrapling(${slMode}) 内容疑似被拦截(HTTP ${bridged.status}): ${url.slice(0, 160)}`)
      }
      return { html: bridged.html, engine: 'http', blocked }
    }
  }

  const ua = pickUaFor(originHost(url), cfg)

  // 通用 token 预取(bb-d): tokenUrl+tokenPattern 配置齐全时先取 token, 再按 tokenInjection
  // 注入('url'=URL 占位符替换/查询参数追加, 'header'=请求头); 未配置/预取失败原样直连
  // [R22-e-1]: tokenInjected 供 403 失效重取判定(注入过 token 的请求吃 403 → 删预取缓存)
  let tokenInjected = false
  let reqUrl = url
  let effCfg: FetchConfig = cfg
  if ((cfg.tokenUrl || '').trim() && (cfg.tokenPattern || '').trim()) {
    // R4-1: prefetchToken 现可 reject(in-flight promise 异常上抛), 失败时静默降级直连(零回归)
    const token = await prefetchToken(url, cfg, ua).catch(() => '')
    if (token) {
      tokenInjected = true
      if (cfg.tokenInjection === 'header') {
        // 请求头名同样清洗控制字符与冒号(与 curl 头注入防护同口径)
        const name = (cfg.tokenHeaderName || 'X-Token').replace(/[\r\n\0:]+/g, '').trim() || 'X-Token'
        // 头【值】同样清洗控制字符(bb-g 修复): token 来自远端预取响应体, 值含 CR/LF 时
        // bun fetch Headers 直接抛 TypeError(硬断链路) / curl 值被空格化、语义破坏 ——
        // 剥除后仍非空才注入, 否则按预取失败同口径静默降级直连
        const safeToken = token.replace(/[\x00-\x1f\x7f]+/g, '').trim()
        if (safeToken) effCfg = { ...cfg, headers: { ...cfg.headers, [name]: safeToken } }
      } else {
        // [R21-e-1](Med) token 编码统一治理(R20-c-2 丢失修复重实现): 预取端返回的 token 可能
        // 已是百分号编码形态(如含 %2B) —— 原实现无条件 encodeURIComponent 后再注入, 且
        // searchParams.set('token', enc) 序列化时对值里的 % 再编一次, 产出 %252B/%25252B,
        // 目标站解码一次得不到真实 token → 403。现判定: 值含合法 %XX 十六进制转义即视为已
        // 编码(原样逐字注入), 原始值则编码一次。注入一律改原串级拼接/替换 —— searchParams.set
        // 除对已编码值二次编码外还会全量重序列化整条 query(其余参数形态可能被改写), 弃用;
        // Bug 12(已含 token= 改 set 防重复)与 bb-g(参数落 #fragment 之前)语义由原串级
        // set/append 等价保留(参数名精确匹配 token, 与原 searchParams.has('token') 同口径)
        const looksPctEncoded = /%[0-9a-fA-F]{2}/.test(token)
        const enc = looksPctEncoded ? token : encodeURIComponent(token)
        // [R9-a-4] 修复: {token} 占位符原先单次 replace 只替首个, 多占位符模板第二个起漏替换
        // (与 R3-3/2-fetcher Bug 11 {url} 修复同口径, split/join 全量替换)
        if (reqUrl.includes('{token}')) reqUrl = reqUrl.split('{token}').join(enc)
        else if (/%7Btoken%7D/i.test(reqUrl)) reqUrl = reqUrl.replace(/%7Btoken%7D/gi, () => enc)
        else {
          // 原串级 set/append: 仅在 #fragment 之前的 query 段内操作(锚点后的参数服务端不可见);
          // 替换用函数形态防 enc 含 $(String.replace 替换串模式符)被展开吃掉
          const hashAt = reqUrl.indexOf('#')
          const head = hashAt >= 0 ? reqUrl.slice(0, hashAt) : reqUrl
          const tail = reqUrl.slice(head.length)
          const sep = head.includes('?') ? '&' : '?'
          const m = /([?&])token(?:=[^&#]*)?/.exec(head)
          if (m) reqUrl = head.slice(0, m.index) + m[1] + 'token=' + enc + head.slice(m.index + m[0].length) + tail
          else reqUrl = head + sep + 'token=' + enc + tail
        }
      }
    }
  }

  // feat-contentproxy-resume: 内容代理 URL(xjp-proxy/deqixs-proxy 等服务端解密代理)。
  // 配置后正文段 fetch 不走原始 URL, 而是请求 contentProxyUrl(替换 {url} 为原始章节 URL 的
  // encodeURIComponent), 代理返回 JSON {ok:true, content:string}(纯文本, \n 分段), 引擎
  // 把每行 wrap 成 <p> 作为 html 传给 parser(content 字段可设 const 类型直接拿全文)。
  // 必须在 fetchPageOnce 内部 token 预取之后、原 URL fetch 之前 —— 拦截掉原 URL 抓取。
  // SSRF 守卫: contentProxyUrl 是操作员配置的回环转换代理, allowLoopback:true 放行(与 tokenUrl 同口径);
  // 仍拒绝云元数据/私网(防恶意规则把 contentProxyUrl 指 10.0.0.1)。代理失败/响应非法 → 静默降级原 URL 直连
  const contentProxyUrl = (cfg.contentProxyUrl || '').trim()
  if (contentProxyUrl) {
    // {url} 占位符全量替换(与 prefetchToken 同款 split/join, 防 replace 只替首个多占位符漏替换)
    const proxyUrl = contentProxyUrl.split('{url}').join(encodeURIComponent(url))
    const ssrf = await assertSafeTarget(proxyUrl, { allowLoopback: true })
    if (ssrf.ok) {
      try {
        // R8-16: 暂时剥离 cfg.proxyUrl(exit proxy) —— contentProxyUrl 是 loopback 转换代理(127.0.0.1:301x),
        // exit proxy 无法路由到 loopback; 直接走 loopback 抓取 contentProxyUrl, 抓到内容后再用原 cfg 抓原 URL
        // [R9-a-13] B1: 转换代理响应要求每次新内容, 同步关闭条件请求协商
        const effCfg: FetchCfgOpt = { ...cfg, proxyUrl: '', conditionalGet: false }
        const body = await fetchHttpWithCurlFallback(proxyUrl, effCfg, ua)
        let parsed: unknown = undefined
        try { parsed = JSON.parse(body) } catch { parsed = undefined }
        // 容错形态: {ok:true, content:string} 或 {ok:false, error:string}
        const obj = parsed as { ok?: unknown; content?: unknown; error?: unknown } | undefined
        if (obj && obj.ok === true && typeof obj.content === 'string' && obj.content) {
          // 代理返回纯文本(\n 分段), 转 HTML 给 parser(每行一个 <p>, 过滤空行)
          const html = obj.content
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => `<p>${l.replace(/[<>&]/g, (c) => c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;')}</p>`)
            .join('')
          if (html) {
            return { html, engine: 'http', blocked: false }
          }
        }
        // ok=false || content 空 → 静默降级原 URL(fetcher 注释)
        console.warn(`[fetcher] contentProxyUrl 响应未给出有效内容, 降级直连原 URL: ${String(obj?.error || 'ok/content 字段缺失').slice(0, 120)} (proxy=${proxyUrl.slice(0, 120)})`)
      } catch (e) {
        // 代理抓取失败/超时/JSON 解析失败 → 静默降级原 URL 直连(零回归)
        console.warn(`[fetcher] contentProxyUrl 抓取失败, 降级直连原 URL: ${String((e as Error)?.message || e).slice(0, 120)} (proxy=${proxyUrl.slice(0, 120)})`)
      }
    } else {
      // SSRF 拒绝 → 静默降级原 URL 直连(不抛, 与 token 预取失败同口径)
      console.warn(`[fetcher] contentProxyUrl SSRF 拒绝: ${ssrf.reason} (proxy=${proxyUrl.slice(0, 120)})`)
    }
  }

  const domain = originHost(reqUrl)

  const fallbackStatus = cfg.browserFallbackStatus || [403, 412, 429, 503]
  let lastErr: any = null
  let lastStatus = 0

  // 强制浏览器
  if (cfg.engine === 'browser') {
    const html = await renderWithBrowser(reqUrl, effCfg, ua)
    // 浏览器结果同样过拦截判定: 裸 Playwright 降级路径不识别挑战页, 原先固定 blocked=false
    // 会把盾页当正常内容返回, 上层解析入库产生脏书(obscura 路径已有挑战抛错, 此处是双保险)
    return { html, engine: 'browser', blocked: looksBlocked(html) }
  }

  // HTTP 尝试(带重试)
  // [R9-a-8] B2/C: host 自适应节奏守门(403/429 惩罚窗 ≤3s / 敏感窗温和间隔 / burst-pause,
  // 仅对有对抗性历史的 host 生效, 健康站点零影响) —— 在首次 HTTP 尝试前注入
  await maybeHostRhythmDelay(reqUrl)
  // Cookie 挑战重试(修复 guichuideng.info 场景): 首访 403 响应携带 Set-Cookie
  // (autoCookie 已存入 jar), 带新 Cookie 重发一次 HTTP 即可 200 —— 因此
  // fallbackStatus 命中时, 若本次响应刚种下新 Cookie 或返回体是 JS 挑战壳,
  // 不立即 break 升级浏览器, 而是继续下一轮(带新 Cookie), 最多追加 2 次;
  // 追加用尽仍失败才 break 升级。429/503 仍走原退避重试路径。
  const baseAttempts = (cfg.retries ?? 0) + 1
  const MAX_COOKIE_RETRIES = 2
  let cookieRetries = 0
  // [R28-4-E2] 换档重试已用标记(每次抓取至多 1 次, 与 cookieRetries 共用 MAX_COOKIE_RETRIES 预算)
  let tierRetried = false
  // 2-fetcher Bug 3: 独立 backoff 计数器, 解耦 cookie 重试与 429/5xx 退避额度
  let backoffRetries = 0
  let attempt = 0
  while (attempt < baseAttempts + cookieRetries) {
    attempt++
    const cookiesBefore = cookieJar.count(domain)
    try {
      let html = await fetchHttpWithCurlFallback(reqUrl, effCfg, ua)
      // Token 挑战 HTTP 求解: 命中"正在验证浏览器"式 token 重定向盾时, 纯 HTTP 取 token 重放,
      // 免浏览器升级(ixdzs/101kks 系)。http 与 auto 引擎均受益
      let blockedHtml = looksBlocked(html)
      // [R12-c2-1] degrade-native 直连形态豁免: 请求目标是操作员配置的回环转换代理
      // (loopbackBypassAllowed 同口径)且响应体是合法 JSON 时, {ok,len,content} 信封本身就是
      // 预期载荷(qidian/xjp/deqixs 契约: 业务失败走 502 抛错, 200+JSON 即载荷) ——
      // looksBlocked 的"<200 字极短页判拦/拦截图库"对短章节 JSON(如 <200 字的卷末短章)误判:
      // engine='http' 路径有 runner 侧 JSON 放行口径(parseJsonBody)不受影响; auto 引擎则白升级
      // 浏览器渲染回环代理(浏览器拿到 HTML 包裹的 JSON, parseJsonBody 失效 → 还会误喂
      // hostgate 连败降额)。豁免仅限回环豁免目标, 公网 JSON API 站口径不变
      if (blockedHtml && loopbackBypassAllowed(reqUrl, cfg) && isPlainJsonBody(html)) {
        blockedHtml = false
      }
      // [R11-b-EN-3] 增强: 响应体健全性启发(RESPONSE_SANITY=1, 缺省关) —— looksBlocked 漏判的
      // "长页无正文"形态(纯 JS 壳/SPA 骨架/乱码)按拦截处理; 关闭时本块整体不执行, 行为不变
      if (RESPONSE_SANITY_ENABLED && !blockedHtml && responseSanityBad(html)) {
        blockedHtml = true
        console.warn(`[fetcher] RESPONSE_SANITY: 响应体健全性异常(空壳/纯JS壳/乱码), 按拦截处理: ${reqUrl.slice(0, 160)}`)
      }
      // [R11-b-EN-2] 增强: CF 挑战强指纹识别(CHALLENGE_ESCALATE=1, 缺省关) —— 命中则跳过
      // 下方 Cookie 重试链直接升级浏览器(多敲盾页只恶化信誉, 升级本身仍只此一次)
      const cfChallenge = CHALLENGE_ESCALATE_ENABLED && blockedHtml && isCfChallengeShell(html)
      if (cfChallenge) {
        console.warn(`[fetcher] CHALLENGE_ESCALATE: CF 挑战指纹, 跳过 Cookie 重试直接升级浏览器渲染: ${reqUrl.slice(0, 160)}`)
      }
      // [R9-e-4] 增强: 节奏画像 —— 被拦/挑战页上报 hostgate(连续 ≥2 次自动放缓准入节奏,
      // 供 runner 降级参考); 缺省关闭零开销
      if (PACE_PROFILE_ENABLED && blockedHtml) reportHostChallenge(reqUrl)
      if (blockedHtml) {
        const solved = await trySolveTokenChallenge(reqUrl, html, effCfg, ua)
        if (solved) { html = solved; blockedHtml = false }
      }
      // [R9-a-8] B2: 成功记账(干净 200 清惩罚链; 被拦壳不清, 交由 hostGate/惩罚窗学习)
      noteHostHttpSuccess(reqUrl, blockedHtml)
      // [R9-a-15] C.4/C.5: 蜜罐/robots 陷阱信号学习(仅未拦正文扫描, 有界正则) → 温和降速窗
      if (!blockedHtml) {
        const trap = detectTrapSignals(html)
        if (trap.trapGapMs > 0) noteHostSensitive(reqUrl, trap.trapGapMs)
      }
      if (cfg.engine === 'http') return { html, engine: 'http', blocked: blockedHtml }
      if (!blockedHtml) return { html, engine: 'http', blocked: false }
      // auto 模式: 200 但内容疑似挑战壳 —— 若刚种下新 Cookie 或响应体是 JS 跳转壳,
      // 与 403 场景同策略追加带 Cookie 重试(有的站以 200+跳转壳代替 403), 用尽再升级浏览器
      const gotNewCookieOk = cookieJar.count(domain) > cookiesBefore
      // [R11-b-EN-2]: cfChallenge 命中时不做 Cookie 重试(对 CF 盾无收益), 直接 break 升级
      if (!cfChallenge && (gotNewCookieOk || isJsChallenge(html)) && cookieRetries < MAX_COOKIE_RETRIES) {
        cookieRetries++
        await new Promise((r) => setTimeout(r, 350))
        continue
      }
      lastErr = new Error('内容疑似被拦截(验证码/JS挑战)')
      break
    } catch (e: any) {
      lastErr = e
      lastStatus = e?.status || 0
      // [R9-a-9] B3: 失败分类分级计数(dns/tls/timeout/conn/4xx/5xx, hostRhythm 可观测)
      recordFailureClass(reqUrl, classifyHttpFailure(e))
      // [R9-a-8] B2: 403/429 惩罚记忆(429 优先尊重 Retry-After; 指数退避+抖动, 执行等待有界 3s)
      if (lastStatus === 403 || lastStatus === 429) noteHostHttpFailure(reqUrl, lastStatus, e?.retryAfterMs)
      // [R22-e-1] token 失效重取路径: 注入了 token 的请求吃到 403 → 删除 30s 预取缓存条目,
      // 下一次抓取自然重新预取(本请求的重试链 reqUrl 已定不做热替换, 与 Cookie 重试语义
      // 互不干扰; 幂等, 条目不存在 no-op)
      if (tokenInjected && lastStatus === 403) invalidateTokenCache(url, cfg)
      const bodyHtml: string = e?.bodyHtml || ''
      // [R11-b-EN-1] 增强: Retry-After 尊重(RETRY_AFTER_HONOR=1, 缺省关) —— 429/503 抛错对象
      // 已由 fetchHttp/curl 链抢救出 retryAfterMs(整数秒/HTTP 日期双形态), 此处即时写入
      // hostgate per-host 限流冷却(上限 120s 在 hostgate 侧; <1s 视为解析噪声不触发,
      // 维持既有 30s 兜底口径)。与 runner.gateFetch 的 429 报告幂等(重复推后返回 false);
      // 503 原先完全不走限流冷却(仅降额链), 本开关补上该缺口
      if (
        RETRY_AFTER_HONOR_ENABLED &&
        (lastStatus === 429 || lastStatus === 503) &&
        typeof e?.retryAfterMs === 'number' && e.retryAfterMs >= 1000
      ) {
        if (reportHostRateLimited(reqUrl, e.retryAfterMs)) {
          console.warn(`[fetcher] RETRY_AFTER_HONOR: HTTP ${lastStatus} Retry-After ${Math.round(e.retryAfterMs / 1000)}s → hostgate 限流冷却: ${reqUrl.slice(0, 120)}`)
        }
      }
      // Token 挑战求解(错误路径): 403/412 响应体同样可能是 token 挑战页, 求解成功视同成功
      if (bodyHtml && looksBlocked(bodyHtml, { status: lastStatus })) {
        const solved = await trySolveTokenChallenge(reqUrl, bodyHtml, effCfg, ua)
        if (solved) return { html: solved, engine: 'http', blocked: false }
      }
      // [R28-4-E2] impersonate 档位自动轮换: 403/429 且本次已用档位(规则/env 钉扎)时按预置序
      // 换档重试一次(TLS 档位被站点针对性封禁时的自动逃生)。与既有 cookieRetries 共用
      // MAX_COOKIE_RETRIES 预算防双倍请求放大; 排在 fallbackStatus 分支前 —— 命中即 continue,
      // 不再走"清罐/Cookie 重试"(换档与换 Cookie 互斥, 预算同池)。档位注入经 effCfg 传输态字段
      // impersonateTierOverride → fetchViaCurl 逐跳 resolveCurlImpersonateTier 第 4 参生效;
      // curl 链未启用档位(缺省全关)时本分支天然不触发, 零回归
      if (
        (lastStatus === 403 || lastStatus === 429) &&
        !tierRetried &&
        cookieRetries < MAX_COOKIE_RETRIES
      ) {
        const currentTier = resolveCurlImpersonateTier(hostOf(reqUrl), cfg, curlProfileOf(hostOf(reqUrl)))
        const nextTier = currentTier ? nextImpersonateTier(currentTier) : ''
        if (nextTier) {
          tierRetried = true
          cookieRetries++
          effCfg = { ...effCfg, impersonateTierOverride: nextTier } as FetchCfgOpt
          console.warn(`[fetcher] impersonate 换档重试: ${currentTier} → ${nextTier} (HTTP ${lastStatus}): ${reqUrl.slice(0, 120)}`)
          continue
        }
      }
      // [R11-b-EN-2]: CF 挑战指纹的错误形态(403/503 盾壳)跳过下方 Cookie 重试直接升级
      const cfChallengeErr = CHALLENGE_ESCALATE_ENABLED && isCfChallengeShell(bodyHtml)
      if (fallbackStatus.includes(lastStatus)) {
        const gotNewCookie = cookieJar.count(domain) > cookiesBefore
        if ((gotNewCookie || isJsChallenge(bodyHtml)) && !cfChallengeErr && cookieRetries < MAX_COOKIE_RETRIES) {
          cookieRetries++
          await new Promise((r) => setTimeout(r, 350))
          continue // 带刚种下的新 Cookie 重发
        }
        // ff-b③: 403 且罐中已有会话但无新 Cookie —— 疑"陈旧会话 Cookie 被目标端拒绝"
        // (挑战 Cookie 与出口 IP/UA 绑定, 出口轮换后旧罐变毒药)。清空该域罐以全新会话
        // 重试一次(有 cookieRetries 上限兜底不死循环); 罐为空则直接 break 升级浏览器
        if (lastStatus === 403 && cookieJar.count(domain) > 0 && cookieRetries < MAX_COOKIE_RETRIES) {
          cookieJar.clear(domain)
          cookieRetries++
          await new Promise((r) => setTimeout(r, 350))
          continue
        }
        // ff-b④ + 2-fetcher Bug 3: 429/瞬时 5xx(500/502/504) 指数退避重试 HTTP 级
        // (1.5s×2^n 封顶 8s; 瞬时故障升级浏览器收益低)。Bug 3 修复: 原先用
        // `attempt < baseAttempts + cookieRetries` 判定, 但 cookieRetries 已在前面 ++ 后
        // 再到此处, 边界 429 会跳过退避直接 break 升级浏览器。改为独立 backoffRetries 计数器,
        // 与 cookieRetries 解耦; maxBackoffRetries = min(2, retries) 上限确保退避不无限。
        // 503 不参与(常为 CF 挑战壳, 保留升级浏览器语义); 超时不在此路径(isFetchTimeout 另行喂 hostGate)
        // [R19-b-2] 退避等待加 ±15% 抖动(复用 jitter15): 原固定 1.5s/3s 整数倍 —— 并行多任务
        // 对同站同时吃 429/5xx 时, 各任务重试时刻逐字节对齐(同拍共振是可聚类节奏指纹),
        // 与本文件 noteHostHttpFailure/jitter15 既有抖动口径一致; 单任务退避期望值不变
        const maxBackoffRetries = Math.min(2, cfg.retries ?? 0)
        if (
          (lastStatus === 429 || lastStatus === 500 || lastStatus === 502 || lastStatus === 504) &&
          backoffRetries < maxBackoffRetries
        ) {
          backoffRetries++
          const delay = jitter15(Math.min(1500 * Math.pow(2, backoffRetries - 1), 8000))
          await new Promise((r) => setTimeout(r, delay))
          continue
        }
        break
      }
      // [R19-b-2] 其余错误重试等待同款 ±15% 抖动(原固定 400ms×attempt 整数倍, 同上共振面)
      // [R28-4-L2] 终败不再白睡: 循环已无下一轮(attempt 耗尽)时跳过退避 sleep 直接抛错 ——
      // 修前末次失败仍白睡 0.4~1.2s 才退出, 终败章节平均多此一延(continue 路径在上方,
      // 此处 cookieRetries 已定型, 该判定与 while 循环条件完全一致)
      if (attempt < baseAttempts + cookieRetries) {
        await new Promise((r) => setTimeout(r, jitter15(400 * attempt)))
      }
    }
  }

  // 本轮 HTTP 全部失败: 释放该域 UA 钉扎, 下次抓取换新 UA 再试
  domainUa.delete(domain)

  // auto: 升级浏览器渲染
  if (cfg.engine === 'auto') {
    const ok = await checkBrowser()
    if (ok) {
      try {
        const html = await renderWithBrowser(reqUrl, effCfg, ua)
        const browserBlocked = looksBlocked(html)
        // [R9-e-4] 增强: 浏览器路径同样上报挑战信号(与 HTTP 路径同口径)
        if (PACE_PROFILE_ENABLED && browserBlocked) reportHostChallenge(reqUrl)
        // [R9-a-8] B2: 浏览器路径同样成功记账(清惩罚链, 防历史惩罚拖慢后续请求)
        noteHostHttpSuccess(reqUrl, browserBlocked)
        return { html, engine: 'browser', blocked: browserBlocked }
      } catch (e: any) {
        const err: any = new Error(`HTTP(${lastStatus || lastErr?.message}) 与浏览器渲染均失败: ${e?.message?.slice(0, 100)}`)
        err.status = lastStatus
        // ab-b: 合成错误透传底层 429 的 Retry-After(gateFetch 抛错路径靠它精确感知限流冷却)
        if (lastErr && typeof lastErr.retryAfterMs === 'number') err.retryAfterMs = lastErr.retryAfterMs
        throw err
      }
    }
    const err: any = new Error(
      `抓取失败(${lastStatus || lastErr?.message || '被拦截'})且浏览器渲染引擎不可用; 可安装chromium或在规则中配置Cookie/UA`
    )
    err.status = lastStatus
    // ab-b: 同上, 合成错误透传 Retry-After(缺失/非法时不挂字段 → 上层 30s 兜底)
    if (lastErr && typeof lastErr.retryAfterMs === 'number') err.retryAfterMs = lastErr.retryAfterMs
    throw err
  }
  throw lastErr || new Error('抓取失败')
}

/** 获取二进制资源(封面等)
 *  [R9-e-5] 增强: 瞬时失败一次性重试(FETCH_BINARY_RETRY=1, 缺省关闭零回归) ——
 *  封面本地化链路(downloader 调本函数)对 null 的语义是"无封面, 永久放弃", 一次网络
 *  抖动/DNS 瞬断/源站瞬时 5xx 就丢一张封面且无任何恢复机会。开启后对"瞬时类失败"
 *  (网络层异常 / 408/5xx)延迟 800ms 重试一次(与 scrapling 桥重试间隔同口径);
 *  永久类失败(SSRF 拒/重定向环/scheme 降级/超限/整体超时/4xx 反盗链)不重试 */
const BINARY_TRANSIENT_RETRY = process.env.FETCH_BINARY_RETRY === '1'

export async function fetchBinary(
  url: string,
  cfgOverride?: Partial<FetchConfig>
): Promise<{ buf: Buffer; contentType: string } | null> {
  const cfg: FetchConfig = { ...DEFAULT_FETCH_CONFIG, ...cfgOverride }
  // 2-fetcher Part A: SSRF 守卫(allowLoopback=false), 防 SSRF 滥用封面抓取打内网
  // (配置性拒绝, 重试无意义, 保持重试域之外)
  const ssrf = await assertSafeTarget(url, { allowLoopback: false })
  if (!ssrf.ok) {
    console.warn(`[fetcher] fetchBinary SSRF 拒绝: ${ssrf.reason} (${url.slice(0, 120)})`)
    return null
  }
  const ua = pickUaFor(originHost(url), cfg)
  // 大文件内存保护: 封面等资源超过上限直接放弃, 防异常站点回 4GB 响应拖爆内存
  const MAX_BINARY_BYTES = 25 * 1024 * 1024
  const timeoutMs = cfg.timeout && cfg.timeout > 0 ? cfg.timeout : 20000
  /**
   * 单次尝试(原 try 块主体原样内移, 语义逐行不变):
   * 返回 ok=成功(带 buf/contentType); permanent=重试也救不了(SSRF 外的配置/协议类失败);
   * transient=瞬时失败(网络层异常/408/5xx, 一次重试有恢复机会)
   * [R11-b-1] 修复(Med): controller/timer 原先在 attemptOnce 外共享 —— 首次尝试若把
   * 超时预算耗尽(如慢 5xx 响应到点), FETCH_BINARY_RETRY 开启后的重试 fetch 拿到的是
   * 已 abort 的 signal, 瞬间抛 AbortError → permanent → null, 重试形同虚设(R10-c 留档
   * 遗留风险③)。改为每次尝试独立 controller+timer: 单次尝试路径超时值/中止语义与旧版
   * 完全一致(缺省关闭零回归); 重试开启态每次尝试获得完整独立预算, 重试语义成立。
   * 注: 单次尝试内部超时到点仍判 permanent(同预算下重试也必败, 既有口径不变);
   * 改后变化仅在"首次尝试未超时但瞬时失败、重试时预算已所剩无几"的场景 —— 这正是
   * 重试开关要救的形态。 */
  const attemptOnce = async (): Promise<
    { ok: true; buf: Buffer; contentType: string } | { ok: false; kind: 'permanent' | 'transient' }
  > => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      // 2-fetcher Bug 23: redirect:'follow' 把 Cookie 头原样带到重定向目标 —— 跨域重定向时
      // 会泄漏同站 Cookie 给重定向目标域。改为 manual, 逐跳重新 buildHeaders(每跳 Cookie 按
      // 该跳 URL 域取罐中值), 跨域跳转自动不带原域 Cookie。上限 5 跳(封面资源重定向罕见)
      const MAX_BINARY_REDIRECT_HOPS = 5
      let hopUrl = url
      let res: Response | null = null
      // [R9-a-7] C.4: 封面重定向环同样熔断 —— [R15-d1-3] 同 URL 至多 2 次访问(允许 1 次重访,
      // 与内容链同口径; 3 次访问即放弃, 封面非关键资源不重试)
      const visitedHops = new Map<string, number>([[url, 1]])
      for (let hop = 0; hop <= MAX_BINARY_REDIRECT_HOPS; hop++) {
        // [R9-a-6] C.1: 封面资源按图片请求形态构造 Accept(原先拿 HTML 形态 Accept 抓图, 指纹露馅)
        // [R15-d1-2] 修复(Med): 规则级 cfg.cookies 跨域泄漏同款在封面链补齐(仅同 host 跳携带);
        // [R22-e-4]: cfg.headers.Cookie 同类泄漏同批补齐(stripRuleSeedCookie 三链共用)
        const hopCfg = hostKeyOf(hopUrl) === hostKeyOf(url) ? cfg : stripRuleSeedCookie(cfg)
        const headers = buildHeaders(hopUrl, hopCfg, ua, { accept: 'image' })
        res = await fetch(hopUrl, { headers, signal: controller.signal, redirect: 'manual' })
        // R4-5: fetchBinary 逐跳存储 Set-Cookie —— 旧行为从未调用 cookieJar.store, 重定向链中
        // 中间跳(如 CDN anti-hotlink)种下的会话 Cookie 全部丢失, 后续同域正文/章节抓取拿不到
        // 会话 Cookie → 403。与 fetchHttp 逐跳同口径调用 store
        if (cfg.autoCookie !== false) {
          const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
          if (setCookies.length) cookieJar.store(originHost(hopUrl), setCookies)
        }
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
          // 不消费 3xx 响应体, 显式 cancel 释放连接
          try { void res.body?.cancel().catch(() => {}) } catch { /* ignore */ }
          let next: URL
          try { next = new URL(res.headers.get('location')!, hopUrl) } catch { return { ok: false, kind: 'permanent' } }
          // 仅放行 http→https 升级, 拒绝跨 scheme 降级(防明文跳转泄漏 Cookie)
          if (next.protocol !== new URL(hopUrl).protocol) {
            const upgrade = new URL(hopUrl).protocol === 'http:' && next.protocol === 'https:'
            if (!upgrade) return { ok: false, kind: 'permanent' }
          }
          const nextStr = next.toString()
          // [R9-a-7] 环检测: [R15-d1-3] 同跳 URL 第 3 次访问即放弃(允许 1 次重访, 见循环前注)
          if ((visitedHops.get(nextStr) || 0) >= 2) return { ok: false, kind: 'permanent' }
          // [R12-c2-2] SSRF: 重定向跳目标同样过守卫(封面链 allowLoopback 恒 false, 与初始 URL 同口径;
          // 封面 CDN 开放重定向引向内网/元数据原先不设防)
          const hopSsrf = await assertSafeTarget(nextStr, { allowLoopback: false })
          if (!hopSsrf.ok) {
            console.warn(`[fetcher] fetchBinary 重定向跳 SSRF 拒绝: ${hopSsrf.reason} (${nextStr.slice(0, 120)})`)
            return { ok: false, kind: 'permanent' }
          }
          visitedHops.set(nextStr, (visitedHops.get(nextStr) || 0) + 1)
          hopUrl = nextStr
          continue
        }
        break
      }
      if (!res || !res.ok) {
        // rr-c3 卫生: 与 fetchHttp 3xx 分支同口径, 失败路径 body 显式 cancel 释放连接
        try { void res?.body?.cancel().catch(() => {}) } catch { /* ignore */ }
        const st = res?.status || 0
        // [R9-e-5]: 408/瞬时 5xx(500/502/503/504)重试有恢复机会; 其余 4xx(403 反盗链/404 无资源)
        // 重试同一 URL 结果不变, 不浪费请求
        if (st === 408 || (st >= 500 && st <= 599)) return { ok: false, kind: 'transient' }
        return { ok: false, kind: 'permanent' }
      }
      const lenHeader = Number(res.headers.get('content-length') || 0)
      if (lenHeader > MAX_BINARY_BYTES) {
        // 超限早退时取消响应体: 不消费 body 会占住连接直到服务端断开
        try { await res.body?.cancel() } catch { /* ignore */ }
        return { ok: false, kind: 'permanent' }
      }
      // 2-fetcher Bug 1: 流式读取 + 运行计数, 超限即中止 —— 原先 res.arrayBuffer() 一次性
      // 读入内存再判大小, 异常站点回 4GB 响应已 OOM。getReader 逐 chunk 累加, 超 MAX 即抛
      if (!res.body) {
        // 无 body 流(某些运行时 / 中继形态)回退 arrayBuffer 读取
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length > MAX_BINARY_BYTES) return { ok: false, kind: 'permanent' }
        return { ok: true, buf, contentType: res.headers.get('content-type') || '' }
      }
      const reader = res.body.getReader()
      const chunks: Buffer[] = []
      let total = 0
      let overflow = false
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        total += value.byteLength
        if (total > MAX_BINARY_BYTES) {
          overflow = true
          try { await reader.cancel() } catch { /* ignore */ }
          break
        }
        chunks.push(Buffer.from(value))
      }
      if (overflow) {
        console.warn(`[fetcher] fetchBinary 响应体超过 ${Math.round(MAX_BINARY_BYTES / 1024 / 1024)}MB 上限, 已中止: ${url.slice(0, 120)}`)
        return { ok: false, kind: 'permanent' }
      }
      const buf = Buffer.concat(chunks)
      return { ok: true, buf, contentType: res.headers.get('content-type') || '' }
    } catch {
      // [R9-e-5]: 整体超时到点(controller 已 abort)不重试 —— 同超时预算下重试也必然失败,
      // 与 fetchHttp 超时口径一致; 其余异常(网络抖动/DNS 瞬断)按瞬时失败处理
      if (controller.signal.aborted) return { ok: false, kind: 'permanent' }
      return { ok: false, kind: 'transient' }
    } finally {
      // [R11-b-1]: 每次尝试自带计时器, 尝试结束即清理(原外层 finally 统一清理)
      clearTimeout(timer)
    }
  }
  // [R11-b-1]: attemptOnce 内部全捕获不外抛, 计时器随每次尝试自清理, 外层无需 try/finally
  const first = await attemptOnce()
  if (first.ok) return { buf: first.buf, contentType: first.contentType }
  // [R9-e-5]: 开关关闭(缺省)或永久性失败 → 单次尝试, 与旧行为一致; 仅瞬时失败重试一次
  if (!BINARY_TRANSIENT_RETRY || first.kind === 'permanent') return null
  await new Promise((r) => setTimeout(r, 800))
  const second = await attemptOnce()
  return second.ok ? { buf: second.buf, contentType: second.contentType } : null
}
