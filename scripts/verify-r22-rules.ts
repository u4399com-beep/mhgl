// ============================================================
// [R22-a] 内置采集规则全量复测 — 27 条规则 × 四段(list/book/toc/content)
//         + ★空白/实体清洗专项深度审计(本轮用户点名重点)
// 用法: bun scripts/verify-r22-rules.ts [ruleKey ...]   (无参数 = 全部 27 条)
//
// 设计(R21-a harness 同构 + 本轮增量):
//   - 四段实测走真实测试端点 POST /api/admin/rules/test(带 heis_admin 会话), 与后台
//     "规则测试"面板完全同链路; URL 传已展开形态({page}→1, {offset:N}→0, 与测试路由
//     expandListPlaceholders 同口径); 书籍/目录/章节 URL 取上游段实测产物逐级下传。
//   - content 段另做引擎直连深审计(fetchPage+parseContent+cleanContentHtml 全量文本):
//     测试端点 cleanedText 有 1500 码点截断, 尾部推广句/水印必须用全量文本才能覆盖;
//     本地深审计与端点同用 parseRuleConfig 消毒后的规则配置(生产同口径)。
//   - ★清洗专项(逐项报告, content 全量文本 + list/book 字段值):
//       1) 实体残留: 解码后可见表面残留 &xxx;/&#ddd;/&#xhhh; 计数(应 0; 命中=双重编码
//          或白名单外实体漏网)
//       2) U+00A0 残留(源站裸写不换行空格是否被规整为普通空格)
//       3) \r 残留 / 连续 3+ 换行(松散空行区) / 2+ 连续空格 run
//       4) 段落形态: 段间距 gap 剖析(tight 单换行 / standard \n\n / loose 3+换行),
//          抽查头/中/尾各 1 段
//       5) 噪声残留: 站域水印/请记住本站/网址残留/章节尾推广句; clean.adPatterns 实效
//          复检(掩码 URL 后逐行重测, 仍命中=该 pattern 清洗未生效)
//   - 失败定性: 网络类失败(超时/拒连/403/5xx/拦截/DNS)重试 1 次(10s 后)仍败 → ENV;
//     断言类失败先按"dev 热重载瞬态"复跑一次探针(3s 后)再定 FAIL。
//   - 依赖本机 mini-service 的规则(bqg713:3010 / deqixs:3014 / xjp:3015 / qidian:3017 /
//     qimao:3013 / ratelimit-demo:3040)先 HTTP 探测端口, DOWN 直接 ENV 不烧外网请求。
//   - 已知环境(R21 留档): 77shuku 需国内 IP 出口; wanben 沙箱出口被 GoEdge 封;
//     ratelimit-demo 需本机 3040 mock; zxcs toc/content 按站点语义禁用; qidian 镜像
//     失效待换; fanqie 声明 API 曾全路径 502; daweixs/pilishuwu 站点状态波动。
//   - 产出: 汇总矩阵(四段+audit) / FAIL·ENV·SKIP 明细 / 清洗专项异常清单(带样本) /
//     修复建议(只建议不改种子) / JSON(/tmp/verify-r22-results.json)。
// ============================================================
import { writeFileSync } from 'node:fs'
import { BUILTIN_RULES } from '../src/lib/crawl/builtin-rules'
import {
  parseRuleConfig,
  DEFAULT_CLEAN_CONFIG,
  type RuleConfig,
  type FetchConfig,
  type PageRule,
} from '../src/lib/crawl/types'
import { fetchPage } from '../src/lib/crawl/fetcher'
import { parseContent, parseJsonBody } from '../src/lib/crawl/parser'
import { cleanContentHtml, cleanTextField, cleanIntro } from '../src/lib/crawl/cleaner'

// ---------------- 常量与工具 ----------------
const BASE = process.env.BASE || 'http://127.0.0.1:3000'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() || 'audit-fix-2025'
const RULE_GAP_MS = 1200
const STAGE_GAP_MS = 800
const HTTP_REQ_TIMEOUT_MS = 15_000 // http/auto 引擎单请求超时(R21 同款)
const BROWSER_REQ_TIMEOUT_MAX_MS = 45_000 // browser 渲染链保底
const API_REQ_TIMEOUT_MS = 120_000 // 端点自带 90s 护栏, 客户端再留余量
const RETRY_DELAY_MS = 10_000 // 网络类失败重试间隔(任务要求: 重试 1 次后标 ENV)
const REPROBE_DELAY_MS = 3_000 // 断言类失败热重载复跑间隔
const BUDGET_MS = 15 * 60_000 // 外部站点抓取总预算(软上限, 超出后剩余规则标 SKIP)
const SAMPLE_MAX = 200
const OUT_JSON = '/tmp/verify-r22-results.json'

type Stage = 'list' | 'book' | 'toc' | 'content'
type Verdict = 'PASS' | 'FAIL' | 'ENV' | 'SKIP'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 按码点截断(与 @/lib/utils.sliceCodePoints 同语义, 避免代理对斩半) */
function cut(s: string, max = SAMPLE_MAX): string {
  const arr = Array.from((s || '').replace(/\s+/g, ' ').trim())
  return arr.length > max ? arr.slice(0, max).join('') + '…' : arr.join('')
}

/** 列表段 URL 占位符展开(与 rules/test 路由 expandListPlaceholders 逐字节同口径) */
function expandListPlaceholders(raw: string): string {
  const p1Offset = (_m: string, n: string) => String((1 - 1) * Math.max(1, parseInt(n, 10) || 1))
  return raw
    .replace(/\{offset:(\d+)\}/gi, p1Offset)
    .replace(/%7Boffset%3A(\d+)%7D/gi, p1Offset)
    .replace(/%7Boffset:(\d+)%7D/gi, p1Offset)
    .replace(/\{page\}/gi, '1')
    .replace(/%7Bpage%7D/gi, '1')
}

/** 网络类错误分类(决定 ENV 标签与是否重试一次) */
type ErrKind = 'timeout' | 'conn-refused' | 'http-403' | 'http-4xx' | 'http-5xx' | 'blocked' | 'dns' | 'assert' | 'other'
function classifyError(e: unknown): { kind: ErrKind; detail: string } {
  const msg = String((e as Error)?.message || e).slice(0, 300)
  if (/STAGE_TIMEOUT/.test(msg)) return { kind: 'timeout', detail: msg }
  if (/拦截页|looksBlocked|验证码|JS挑战/.test(msg)) return { kind: 'blocked', detail: msg }
  if (/ECONNREFUSED|connection refused|连接被拒绝|ConnectionRefused/i.test(msg)) return { kind: 'conn-refused', detail: msg }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|DNS|Certificate|TLS|ssl/i.test(msg)) return { kind: 'dns', detail: msg }
  const statusM = msg.match(/HTTP (\d{3})/)
  if (/timeout|timed?\s*out|ETIMEDOUT|AbortError|aborted|超时/i.test(msg) && !statusM) return { kind: 'timeout', detail: msg }
  if (statusM) {
    const st = Number(statusM[1])
    if (st === 403) return { kind: 'http-403', detail: msg }
    if (st >= 500) return { kind: 'http-5xx', detail: msg }
    if (st >= 400) return { kind: 'http-4xx', detail: msg }
  }
  if (/SSRF blocked/.test(msg)) return { kind: 'other', detail: msg }
  return { kind: 'other', detail: msg }
}
const NETWORK_KINDS: ErrKind[] = ['timeout', 'conn-refused', 'http-403', 'http-4xx', 'http-5xx', 'blocked', 'dns']

// ---------------- 本机 mini-service 端口探测 ----------------
const LOCAL_PORTS = [3010, 3011, 3012, 3013, 3014, 3015, 3016, 3017, 3040]
const portStatus = new Map<number, string>() // 'UP' | 'DOWN: <err>'

async function probeLocalPorts(): Promise<void> {
  console.log('---- 本机服务端口探测 ----')
  for (const p of LOCAL_PORTS) {
    const t0 = Date.now()
    try {
      const res = await fetch(`http://127.0.0.1:${p}/`, { signal: AbortSignal.timeout(3000) })
      portStatus.set(p, `UP(HTTP ${res.status})`)
    } catch (e) {
      portStatus.set(p, `DOWN: ${cut(String((e as Error)?.message || e), 60)}`)
    }
    console.log(`  127.0.0.1:${p} → ${portStatus.get(p)} (${Date.now() - t0}ms)`)
  }
  // dev server 可用性(测试端点宿主)
  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(8000) })
    console.log(`  dev ${BASE} → UP(HTTP ${res.status})`)
  } catch (e) {
    console.log(`  dev ${BASE} → DOWN: ${cut(String((e as Error)?.message || e), 80)}`)
  }
}

/** 从配置片段提取依赖的本机端口(127.0.0.1:301x / localhost:301x) */
function extractLocalPorts(s: string): number[] {
  const out = new Set<number>()
  for (const m of String(s || '').matchAll(/(?:127\.0\.0\.1|localhost):(\d{4})/g)) {
    const p = Number(m[1])
    if (LOCAL_PORTS.includes(p)) out.add(p)
  }
  return [...out]
}

// ---------------- 后台 API 会话 ----------------
let authCookie: string | null = null

async function ensureAuth(): Promise<string> {
  if (authCookie) return authCookie
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
    signal: AbortSignal.timeout(15_000),
  })
  const setCookie = res.headers.get('set-cookie') || ''
  const m = setCookie.match(/heis_admin=([^;]+)/)
  if (!res.ok || !m) throw new Error(`后台登录失败(HTTP ${res.status}) — 检查 ADMIN_PASSWORD`)
  authCookie = `heis_admin=${m[1]}`
  return authCookie
}

interface ApiTestOk {
  ok: true
  data: Record<string, any>
}
interface ApiTestErr {
  ok: false
  message: string
  status: number
}

/** POST /api/admin/rules/test(自动登录/401 重登一次; 401 亦重登重试一次) */
async function apiTest(
  section: Stage,
  url: string,
  rule: unknown,
  fetchCfg: unknown,
  cleanCfg: unknown,
  limit = 8,
): Promise<ApiTestOk | ApiTestErr> {
  const doCall = async (cookie: string | null): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (cookie) headers.Cookie = cookie
    return fetch(`${BASE}/api/admin/rules/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ section, url, rule, fetch: fetchCfg, clean: cleanCfg, limit }),
      signal: AbortSignal.timeout(API_REQ_TIMEOUT_MS),
    })
  }
  let res = await doCall(await ensureAuth())
  if (res.status === 401) {
    authCookie = null
    res = await doCall(await ensureAuth())
  }
  let json: { ok?: boolean; message?: string; data?: Record<string, any> } | null = null
  try {
    // [R22-a-fix] 自引用 as typeof json 会被收窄成 never(tsc TS2339), 改具名类型断言
    json = (await res.json()) as { ok?: boolean; message?: string; data?: Record<string, any> }
  } catch {
    return { ok: false, message: `HTTP ${res.status} 非 JSON 响应`, status: res.status }
  }
  if (!res.ok || !json?.ok) {
    return { ok: false, message: String(json?.message || `HTTP ${res.status}`), status: res.status }
  }
  return { ok: true, data: (json.data || {}) as Record<string, any> }
}

// ---------------- 清洗专项审计 ----------------
interface CleanIssue {
  item: string // 问题代号(供修复建议映射)
  level: 'FAIL' | 'WARN'
  label: string // 人读描述
  count?: number
  sample?: string
}
interface CleanAudit {
  issues: CleanIssue[]
  metrics: Record<string, number>
  paras: string[] // 头/中/尾段样本
  gapProfile: string // 段距剖析摘要
}

/** 全量实体解码(浏览器等价可见表面): 白名单+常用命名实体+数字实体; 未知命名实体保留
 *  字面量(浏览器对未识别实体也按字面渲染 → 残留即真实可见缺陷) */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', zwnj: '', zwj: '', lrm: '', rlm: '',
  mdash: '—', ndash: '–', hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  copy: '©', reg: '®', trade: '™', middot: '·', laquo: '«', raquo: '»', deg: '°',
  times: '×', divide: '÷', shy: '\u00ad', bull: '•', dagger: '†', permil: '‰',
}
function safeCp(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return ''
  try { return String.fromCodePoint(cp) } catch { return '' }
}
function decodeAllEntities(s: string): string {
  return s.replace(/&(?:[a-zA-Z][a-zA-Z0-9]{1,30}|#[0-9]{1,8}|#x[0-9a-fA-F]{1,7});/g, (m) => {
    const key = m.slice(1, -1)
    if (key.startsWith('#x') || key.startsWith('#X')) return safeCp(parseInt(key.slice(2), 16))
    if (key.startsWith('#')) return safeCp(parseInt(key.slice(1), 10))
    const v = NAMED_ENTITIES[key.toLowerCase()]
    return v !== undefined ? v : m
  })
}

/** HTML → 浏览器等价纯文本表面(块级标签→换行, 引号感知不必: 审计面非标签处理面) */
function htmlToSurface(html: string): string {
  return decodeAllEntities(
    (html || '')
      .replace(/<(script|style|noscript|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<(script|style|noscript|iframe|object|embed)\b[^>]*>[\s\S]*$/gi, ' ')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/?(?:p|div|li|ul|ol|tr|td|th|table|thead|tbody|tfoot|h[1-6]|section|article|header|footer|aside|nav|blockquote|pre|form|dl|dt|dd|figure|figcaption|main|center|hr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
}

// 噪声标记(逐行扫描; FAIL=明确推广/水印噪声, WARN=可疑残留需人审样本)
const NOISE_MARKERS: [RegExp, string, 'FAIL' | 'WARN'][] = [
  [/请记住本[站书]/, '请记住本站/书水印', 'FAIL'],
  [/一秒记住/, '一秒记住水印', 'FAIL'],
  [/天才一秒/, '天才一秒水印', 'FAIL'],
  [/本站网址|本站最新网址|记住本站/, '本站网址水印', 'FAIL'],
  [/本章未完/, '本章未完引流行', 'FAIL'],
  [/点击下一页|下一页继续/, '翻页引流行', 'FAIL'],
  [/(?:无弹窗|无广告)/, '无弹窗广告词', 'FAIL'],
  [/笔趣阁|顶点小说|八一中文| NeuGet /, '第三方站名水印', 'FAIL'],
  [/www\.[a-z0-9-]+\./i, 'www. 网址残留', 'FAIL'],
  [/https?:\/\//i, 'URL 残留', 'FAIL'],
  [/\/\/[a-z0-9-]+\.[a-z]{2,}(?:\/|\s|$)/i, '协议相对网址残留', 'FAIL'],
  [/求收藏|求月票|求推荐票|求订阅/, '求票求收藏句', 'WARN'],
  [/最新章节|手机(?:版|阅读)|APP(?:下载|阅读)/i, '站点导流词', 'WARN'],
]

// 成人诱饵标记(沿 R21-f 修复后的交替正则, 阈值同 R21)
const ADULT_MARKERS_RE = /(胸口|高耸|肌肤|呻吟|喘息|挺动|抽插|肉棒|淫|穴|骚|乳|臀|欲火|春宵|交合|肉体)/g

interface SurfaceCtx {
  mode: 'PT' | 'HT' // PT=clean.plainText 纯文本规则; HT=HTML 规则(表面=浏览器等价文本)
  cleanedHtml: string // cleanContentHtml 原始输出(HT=HTML / PT=纯文本)
  adPatterns: string[] // 规则 clean.adPatterns ∪ DEFAULT
  hosts: string[] // 站域(书籍 URL host 去 www + mirrorDomains), 供站域水印检测
  chapterTitle: string
}

/** ★content 全量清洗文本深度审计 */
function auditSurface(surface: string, ctx: SurfaceCtx): CleanAudit {
  const issues: CleanIssue[] = []
  const push = (i: CleanIssue) => issues.push(i)
  const chars = surface.replace(/\s+/g, '').length
  const metrics: Record<string, number> = { chars }

  // -- 1) 实体残留(解码后可见表面仍含实体字面量 = 双重编码或白名单外实体) --
  const entityHits = surface.match(/&(?:[a-zA-Z][a-zA-Z0-9]{1,30}|#[0-9]{1,8}|#x[0-9a-fA-F]{1,7});/g) || []
  metrics.entityResidue = entityHits.length
  if (entityHits.length) {
    const distinct = [...new Set(entityHits)].slice(0, 3).join(' ')
    push({ item: 'entityResidue', level: 'FAIL', label: `实体残留 ${entityHits.length} 处(解码后可见表面)`, count: entityHits.length, sample: distinct })
  }

  // -- 2) U+00A0 残留(裸写不换行空格未被规整) --
  const nbspCount = (surface.match(/\u00a0/g) || []).length
  metrics.u00a0 = nbspCount
  if (nbspCount > 0) {
    const line = surface.split('\n').find((l) => l.includes('\u00a0')) || ''
    push({ item: 'u00a0', level: 'WARN', label: `U+00A0 不换行空格残留 ${nbspCount} 处(未规整为普通空格)`, count: nbspCount, sample: cut(line, 80) })
  }

  // -- 3) \r 残留 --
  const crCount = (surface.match(/\r/g) || []).length
  metrics.cr = crCount
  if (crCount > 0) {
    const line = surface.split(/\r?\n/).find((l) => l.includes('\r')) || ''
    push({ item: 'cr', level: ctx.mode === 'PT' ? 'FAIL' : 'WARN', label: `\\r 残留 ${crCount} 处(${ctx.mode === 'PT' ? '纯文本出口不应含 \\r' : '存库 HTML 文本节点含 \\r'})`, count: crCount, sample: cut(line.replace(/\r/g, '␍'), 80) })
  }

  // -- 4) 段距剖析(gap: 相邻两非空行间换行形态) + 松散空行区 + 纯空白行 --
  const lines = surface.split('\n')
  type Gap = { nl: number; blanks: number; after: string }
  const gaps: Gap[] = []
  let prev = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') continue
    if (prev >= 0) {
      const between = lines.slice(prev + 1, i)
      gaps.push({ nl: between.length + 1, blanks: between.filter((l) => l.trim() === '').length, after: lines[i] })
    }
    prev = i
  }
  const tight = gaps.filter((g) => g.nl === 1)
  const standard = gaps.filter((g) => g.nl === 2)
  const loose = gaps.filter((g) => g.nl >= 3)
  metrics.tightGaps = tight.length
  metrics.standardGaps = standard.length
  metrics.looseGaps = loose.length
  metrics.paras = prev >= 0 ? gaps.length + 1 : 0
  if (loose.length) {
    const g = loose[0]
    push({ item: 'looseGaps', level: 'FAIL', label: `松散空行区 ${loose.length} 处(3+ 连续换行)`, count: loose.length, sample: cut(g.after, 60) })
  }
  if (ctx.mode === 'PT' && tight.length) {
    push({ item: 'tightGaps', level: 'FAIL', label: `段间距丢失 ${tight.length} 处(纯文本规则应为统一 \\n\\n 段距, 实测 ${tight.length} 处单换行直连)`, count: tight.length, sample: cut(tight[0].after, 60) })
  }
  const gapProfile = `tight=${tight.length} standard=${standard.length} loose=${loose.length} (${ctx.mode} 模式)`

  // -- 5) 连续多空格 run(2+ 空格/全角空格; 行内) --
  const spaceRuns = surface.match(/[ \u3000]{2,}/g) || []
  metrics.spaceRuns = spaceRuns.length
  if (spaceRuns.length) {
    // [R22-a-fix] noUncheckedIndexedAccess: 首元素需显式非空断言
    const firstRun = spaceRuns[0] as string
    const idx = surface.indexOf(firstRun)
    push({ item: 'spaceRuns', level: 'WARN', label: `连续多空格 run ${spaceRuns.length} 处(2+ 空格)`, count: spaceRuns.length, sample: cut(surface.slice(Math.max(0, idx - 20), idx + firstRun.length + 20), 80) })
  }

  // -- 6) 不可见字符 / PUA 占位符 / U+FFFD --
  const invisible = (surface.match(/[\u00ad\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g) || []).length
  metrics.invisible = invisible
  if (invisible > 0) push({ item: 'invisible', level: 'FAIL', label: `零宽/不可见 Unicode 残留 ${invisible} 处(清洗器应剥离)`, count: invisible })
  const pua = (surface.match(/[\uE000\uE001]/g) || []).length
  metrics.pua = pua
  if (pua > 0) push({ item: 'pua', level: 'FAIL', label: `广告清洗 URL 占位符(PUA \\uE000/\\uE001)残留 ${pua} 处`, count: pua })
  const fffd = (surface.match(/\uFFFD/g) || []).length
  metrics.fffd = fffd
  if (fffd > Math.max(2, chars * 0.005)) push({ item: 'fffd', level: 'FAIL', label: `U+FFFD 乱码 ${fffd} 处(疑似编码解码错误)`, count: fffd })

  // -- 7) 噪声标记逐行扫描 + 站域水印 + 尾部推广 --
  const contentLines = lines.map((l) => l.trim()).filter(Boolean)
  let markerFails = 0
  let markerWarns = 0
  const markerSamples: string[] = []
  for (const line of contentLines) {
    for (const [re, name, lv] of NOISE_MARKERS) {
      if (!re.test(line)) continue
      if (lv === 'FAIL') markerFails++
      else markerWarns++
      if (markerSamples.length < 6) markerSamples.push(`[${name}] ${cut(line, 70)}`)
      break // 每行只记首个命中标记
    }
  }
  metrics.markerFails = markerFails
  metrics.markerWarns = markerWarns
  if (markerFails > 0) push({ item: 'noiseMarkers', level: 'FAIL', label: `噪声行 ${markerFails} 行(水印/引流/网址)`, count: markerFails, sample: markerSamples.slice(0, 3).join(' ┃ ') })
  if (markerWarns > 0) push({ item: 'noiseMarkersSoft', level: 'WARN', label: `可疑导流行 ${markerWarns} 行(求票/最新章节类, 需人审)`, count: markerWarns, sample: markerSamples.slice(0, 3).join(' ┃ ') })
  for (const h of ctx.hosts) {
    if (!h || /^127\.|^localhost/.test(h)) continue
    const hostLines = contentLines.filter((l) => l.includes(h))
    if (hostLines.length) {
      push({ item: 'siteWatermark', level: 'FAIL', label: `站域水印 "${h}" 出现 ${hostLines.length} 行`, count: hostLines.length, sample: cut(hostLines[0], 70) })
      break
    }
  }
  // 章节尾推广句(末 2 行)
  const tail = contentLines.slice(-2)
  const tailPromo = tail.filter((l) => /(更多精彩|请下一页|未完待续.*点击|点击下一页|下一页继续|本章完|继续阅读请)/.test(l))
  if (tailPromo.length) push({ item: 'tailPromo', level: 'FAIL', label: '章节尾部推广句残留', count: tailPromo.length, sample: cut(tailPromo[tailPromo.length - 1], 70) })

  // -- 8) clean.adPatterns 实效复检: 掩码 URL 后逐行重测, 仍命中 = pattern 清洗未生效 --
  const maskedLines = contentLines.map((l) => l.replace(/(?:https?:)?\/\/[^\s"'<>]+/gi, ' §URL§ '))
  const adLeft: string[] = []
  for (const p of ctx.adPatterns) {
    let re: RegExp | null = null
    try { re = new RegExp(p, 'i') } catch { continue }
    for (const line of maskedLines) {
      if (re.test(line)) {
        adLeft.push(`[/${p}/] ${cut(line, 60)}`)
        break // 每 pattern 记 1 条样本
      }
    }
  }
  metrics.adPatternLeft = adLeft.length
  if (adLeft.length) push({ item: 'adPatternIneffective', level: 'FAIL', label: `${adLeft.length} 条 adPattern 对残留行未生效(pattern 命中但清洗未删除)`, count: adLeft.length, sample: adLeft.slice(0, 2).join(' ┃ ') })

  // -- 9) 段落样本(头/中/尾各 1 段) --
  const paras: string[] = []
  if (contentLines.length) {
    const pick = [0, Math.floor(contentLines.length / 2), contentLines.length - 1]
    for (const i of [...new Set(pick)]) paras.push(cut(contentLines[i], 90))
  }

  return { issues, metrics, paras, gapProfile }
}

/** ★list/book 字段值清洗审计(production 口径: 先过 cleanTextField/cleanIntro 再查残留) */
function auditField(kind: 'text' | 'intro', field: string, raw: string, scope: string): CleanIssue[] {
  const issues: CleanIssue[] = []
  if (!raw || !String(raw).trim()) return issues
  const v = kind === 'intro' ? cleanIntro(raw) : cleanTextField(raw, 4000)
  if (!v.trim()) return issues
  const entityHits = v.match(/&(?:[a-zA-Z][a-zA-Z0-9]{1,30}|#[0-9]{1,8}|#x[0-9a-fA-F]{1,7});/g) || []
  if (entityHits.length) {
    issues.push({ item: 'fieldEntityResidue', level: 'FAIL', label: `${scope}.${field}: 实体残留 ${entityHits.length} 处(cleanTextField/cleanIntro 解码后仍可见)`, count: entityHits.length, sample: [...new Set(entityHits)].slice(0, 3).join(' ') + ' ┃ ' + cut(v, 60) })
  }
  const nbsp = (v.match(/\u00a0/g) || []).length
  if (nbsp > 0) {
    issues.push({ item: 'fieldU00a0', level: 'WARN', label: `${scope}.${field}: U+00A0 残留 ${nbsp} 处`, count: nbsp, sample: cut(v, 60) })
  }
  const cr = (v.match(/\r/g) || []).length
  if (cr > 0) {
    issues.push({ item: 'fieldCr', level: 'FAIL', label: `${scope}.${field}: \\r 残留 ${cr} 处`, count: cr })
  }
  const spaceRuns = (v.match(/[ \u3000]{2,}/g) || []).length
  if (spaceRuns > 0 && kind === 'intro') {
    // cleanTextField 已折叠 \s{2,}(text 类字段理论为 0); intro 仅 trim 行缘, 行内多空格可残留
    issues.push({ item: 'fieldSpaceRuns', level: 'WARN', label: `${scope}.${field}: 连续多空格 ${spaceRuns} 处`, count: spaceRuns, sample: cut(v, 60) })
  }
  if (/^[\s\u00a0]+$/.test(String(raw)) && v === '') {
    issues.push({ item: 'fieldBlank', level: 'WARN', label: `${scope}.${field}: 值为纯空白`, sample: cut(String(raw), 40) })
  }
  return issues
}

// ---------------- 断言结果结构 ----------------
interface Check { name: string; ok: boolean; detail: string }
interface StageResult {
  stage: Stage
  verdict: Verdict
  reason: string
  checks: Check[]
  metrics: Record<string, unknown>
  samples: string[]
  engine?: string
  ms?: number
}

function mkStage(stage: Stage): StageResult {
  return { stage, verdict: 'FAIL', reason: '', checks: [], metrics: {}, samples: [] }
}
function failStage(st: StageResult, reason: string, kind: ErrKind | null = null): StageResult {
  st.verdict = kind ? 'ENV' : 'FAIL'
  st.reason = kind ? `${kind}: ${reason}` : reason
  return st
}
function skipStage(stage: Stage, reason: string): StageResult {
  return { ...mkStage(stage), verdict: 'SKIP', reason }
}
function envStage(stage: Stage, reason: string): StageResult {
  return { ...mkStage(stage), verdict: 'ENV', reason }
}

// ---------------- 引擎直连深审计(content 全量文本) ----------------
function clampTimeout(cfg: FetchConfig): FetchConfig {
  return {
    ...cfg,
    timeout:
      cfg.engine === 'browser'
        ? Math.min(cfg.timeout || BROWSER_REQ_TIMEOUT_MAX_MS, BROWSER_REQ_TIMEOUT_MAX_MS)
        : HTTP_REQ_TIMEOUT_MS,
  }
}

async function engineFetchFull(url: string, fetchCfg: Partial<FetchConfig>): Promise<{ html: string; engine: string; ms: number }> {
  const started = Date.now()
  const res = await fetchPage(url, fetchCfg)
  const ms = Date.now() - started
  if (res.blocked && parseJsonBody(res.html) === undefined) {
    const head = cut(res.html.replace(/<[^>]+>/g, ' ').trim(), 120)
    throw new Error(`目标站点返回了反爬拦截页(验证码/JS挑战/空壳响应) [engine=${res.engine}] 页面样本: ${head}`)
  }
  return { html: res.html, engine: res.engine, ms }
}

/** 段级护栏(防悬挂) */
async function stageGuard<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined
  const timer = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`STAGE_TIMEOUT:${label} 超过 ${ms / 1000}s 护栏`)), ms)
  })
  try {
    return await Promise.race([p, timer])
  } finally {
    if (t) clearTimeout(t)
  }
}

// ---------------- 单规则四段链 ----------------
interface RuleReport {
  key: string
  name: string
  note?: string
  stages: Record<Stage, StageResult>
  auditVerdict: 'PASS' | 'WARN' | 'FAIL' | 'SKIP'
  contentAudit: { issues: CleanIssue[]; metrics: Record<string, number>; paras: string[]; gapProfile: string; source: string } | null
  fieldAudit: CleanIssue[]
  summary: string
}

const KNOWN_NOTES: Record<string, string> = {
  '77shuku': '已知: 站点仅国内 IP 可达(R16/R17-b), 预期 timeout → ENV',
  wanben: '已知: 站点对沙箱出口 IP 层封锁(GoEdge), 预期 403/拦截 → ENV',
  'ratelimit-demo': '已知: 指向本机 127.0.0.1:3040 模拟源站, 端口未运行 → ENV',
  zxcs: '已知: TXT 下载站, toc/content 段按站点语义 enabled:false → by-design SKIP',
  fanqie: '已知: 规则声明 API 曾全路径 502(R21 实证), 本轮复测提供新鲜证据',
  qidian: '已知: 镜像 full.hnxianxin.cn TLS 证书过期+404(R21 实证), 目标失效待换镜像',
  daweixs: '已知: 章节页间歇跳转导流首页(站点变质征兆, R13 留档)',
  pilishuwu: '已知: CF 挑战强度波动, 间歇性超时(R13 留档)',
  bqg713: 'R21-b 已根治: 正文走 127.0.0.1:3010 /unlock 主机池, 预期真实正文 PASS',
  deqixs: '依赖本机 deqixs-proxy :3014(签名代理+GBK 解码)',
  xjp: '依赖本机 xjp-proxy :3015(contentProxy 转换)',
  qimao: '依赖本机 qimao-proxy :3013(allowLoopback 签名代理)',
}

function seedFileOf(key: string): string {
  return `scripts/seed-rule-${key}.ts`
}

/** 修复建议生成(只建议, 不改种子) */
function suggestionsFor(key: string, issues: CleanIssue[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (s: string) => {
    const k = s.slice(0, 60)
    if (!seen.has(k)) { seen.add(k); out.push(s) }
  }
  for (const i of issues) {
    switch (i.item) {
      case 'entityResidue':
        add(`${key}: 清洗后可见表面残留 HTML 实体(${cut(i.sample || '', 40)}) — 引擎层 decodeEntitiesOnce 白名单未覆盖该实体或存在双重编码; 建议核对 ${seedFileOf(key)} clean.replaceFrom 或引擎 ENTITY_RE 白名单扩面`)
        break
      case 'u00a0':
        add(`${key}: 正文含裸 U+00A0 ${i.count} 处未被规整为普通空格 — 建议清洗出口统一 NBSP→空格规整(引擎层), 或 ${seedFileOf(key)} clean.replaceFrom 增加替换`)
        break
      case 'cr':
        add(`${key}: 可见表面 \\r 残留 ${i.count} 处 — 建议 ${seedFileOf(key)} content.replaceFrom 或引擎出口剥 \\r`)
        break
      case 'looseGaps':
        add(`${key}: 3+ 连续换行空行区 ${i.count} 处 — 参考 dafengdagengren/daweixs 修法, ${seedFileOf(key)} content.replaceFrom 增加 br 折叠/空行收敛分支`)
        break
      case 'tightGaps':
        add(`${key}: 纯文本模式段距丢失(单换行直连) ${i.count} 处 — 检查 ${seedFileOf(key)} clean.plainText 链路是否被旁路`)
        break
      case 'spaceRuns':
        add(`${key}: 连续多空格 run ${i.count} 处 — 建议 ${seedFileOf(key)} clean.replaceFrom 或引擎纯文本出口做 [ 　]{2,}→单空格规整`)
        break
      case 'siteWatermark':
      case 'noiseMarkers':
        add(`${key}: 噪声行残留(${cut(i.label, 50)}) — 建议 ${seedFileOf(key)} clean.adPatterns 增补对应正则`)
        break
      case 'adPatternIneffective':
        add(`${key}: adPattern 已配置但对残留行未生效(${cut(i.sample || '', 60)}) — 检查 ${seedFileOf(key)} clean.adPatterns 该条与实际噪声形态的差异(URL 掩码干扰/行内标签隔断)`)
        break
      case 'tailPromo':
        add(`${key}: 章节尾推广句残留 — 建议 ${seedFileOf(key)} clean.adPatterns 增补尾部句式正则`)
        break
      case 'invisible':
      case 'pua':
        add(`${key}: 不可见字符/PUA 占位符残留 — 引擎层清洗出口剥离缺失, 建议引擎侧排查(非种子问题)`)
        break
      case 'fieldEntityResidue':
        add(`${key}: ${cut(i.label, 70)} — 字段实体漏网, 建议 ${seedFileOf(key)} 对应字段 replaceFrom 或引擎 decodeEntitiesOnce 白名单扩面`)
        break
      case 'fieldU00a0':
        add(`${key}: ${cut(i.label, 70)} — 字段裸 U+00A0 未规整, 建议 ${seedFileOf(key)} 字段 replaceFrom 或引擎 cleanTextField 统一 NBSP→空格`)
        break
      case 'fieldSpaceRuns':
        add(`${key}: ${cut(i.label, 70)} — intro 行内多空格, 建议 ${seedFileOf(key)} intro 字段 replaceFrom 或引擎 cleanIntro 折叠多空格`)
        break
      case 'fieldCr':
        add(`${key}: ${cut(i.label, 70)} — 字段 \\r 残留, 建议引擎 cleanTextField/cleanIntro 出口剥 \\r`)
        break
      default:
        break
    }
  }
  return out
}

async function verifyRule(entry: (typeof BUILTIN_RULES)[number], budgetDeadline: number): Promise<RuleReport> {
  const report: RuleReport = {
    key: entry.key, name: entry.name, note: KNOWN_NOTES[entry.key], stages: {} as never,
    auditVerdict: 'SKIP', contentAudit: null, fieldAudit: [], summary: '',
  }
  const cfg = parseRuleConfig(JSON.stringify(entry.config))
  console.log(`\n▶ (${entry.key}) ${entry.name}`)

  // 引擎超时钳制(送测端点的 fetch 配置同款, 防 77shuku 类大 timeout 烧 90s 端点护栏)
  const cfgFetch = clampTimeout(cfg.fetch)
  const ruleCfg: RuleConfig = { ...cfg, fetch: cfgFetch }

  // 本机端口依赖 → 端口 DOWN 直接 ENV
  const downPorts = new Set([...portStatus.entries()].filter(([p, s]) => s.startsWith('DOWN')).map(([p]) => p))
  const stagePorts: Record<Stage, number[]> = {
    list: extractLocalPorts(JSON.stringify(cfg.list)),
    book: extractLocalPorts(JSON.stringify(cfg.book)),
    toc: extractLocalPorts(JSON.stringify(cfg.toc)),
    content: [...new Set([...extractLocalPorts(JSON.stringify(cfg.content)), ...extractLocalPorts(JSON.stringify({ p: cfg.fetch.contentProxyUrl, t: cfg.fetch.tokenUrl }))])],
  }
  const portEnv = (stage: Stage): string | null => {
    const downs = stagePorts[stage].filter((p) => downPorts.has(p))
    return downs.length ? `本机依赖端口 ${downs.map((p) => `:${p}`).join(',')} 未运行(${downs.map((p) => portStatus.get(p)?.slice(0, 40)).join('; ')})` : null
  }

  /** 网络类失败重试一次(10s) → ENV; 断言类失败复跑一次(3s, 热重载容错) → FAIL */
  const withRetry = async <T>(fn: () => Promise<T>, label: string): Promise<T> => {
    try {
      return await fn()
    } catch (e) {
      const { kind, detail } = classifyError(e)
      if (!NETWORK_KINDS.includes(kind)) throw e
      console.log(`  ⏳ ${label} 网络类失败(${kind}: ${cut(detail, 110)}), ${RETRY_DELAY_MS / 1000}s 后重试一次…`)
      await sleep(RETRY_DELAY_MS)
      return await fn()
    }
  }

  /** 端点探针 + 失败定性包装: ok→data; 断言类失败→抛 ASSERT; 网络类→重试→ENV 错 */
  const probe = async (section: Stage, url: string, ruleSection: unknown, refererUrl?: string): Promise<Record<string, any>> => {
    const fetchBody: Partial<FetchConfig> = refererUrl && cfg.fetch.refererChain ? { ...cfgFetch, refererUrl } : cfgFetch
    const call = async (): Promise<Record<string, any>> => {
      const r = await apiTest(section, url, ruleSection, fetchBody, cfg.clean)
      if (r.ok) return r.data
      const err = new Error(r.message) as Error & { apiStatus?: number }
      err.apiStatus = r.status
      throw err
    }
    try {
      return await withRetry(call, section)
    } catch (e) {
      const err = e as Error & { apiStatus?: number }
      const { kind, detail } = classifyError(err)
      if (NETWORK_KINDS.includes(kind)) {
        const envErr = new Error(`ENV:${kind}:${cut(detail, 180)}`) as Error & { isEnv?: boolean; envKind?: ErrKind }
        envErr.isEnv = true
        envErr.envKind = kind
        throw envErr
      }
      // 端点 502 包装的解析/拦截失败已含 message; 断言类失败按热重载容错复跑一次
      // [R22-a-fix] isEnv/envKind 仅在 NETWORK 分支构造的 error 上存在, 交叉类型补齐断言
      if (!(err as Error & { isEnv?: boolean }).isEnv) {
        const isServerFail = (err.apiStatus ?? 0) >= 400
        if (isServerFail || kind === 'other') {
          // 端点报错(502 等)可能是 dev 热重载瞬态 → 3s 复跑一次再定性
          await sleep(REPROBE_DELAY_MS)
          try {
            return await call()
          } catch (e2) {
            const err2 = e2 as Error & { apiStatus?: number }
            const k2 = classifyError(err2)
            if (NETWORK_KINDS.includes(k2.kind)) {
              const envErr = new Error(`ENV:${k2.kind}:${cut(k2.detail, 180)}`) as Error & { isEnv?: boolean; envKind?: ErrKind }
              envErr.isEnv = true
              envErr.envKind = k2.kind
              throw envErr
            }
            throw err2
          }
        }
      }
      throw err
    }
  }

  const fieldPatterns = (fields: Record<string, unknown>) => Object.keys(fields)

  // ---- list ----
  let bookUrl = ''
  let bookHtmlViaApi: Record<string, any> | null = null
  try {
    if (Date.now() > budgetDeadline) throw new Error('BUDGET_EXCEEDED: 全局 15 分钟抓取预算耗尽, 本规则未测')
    const pe = portEnv('list')
    if (pe) throw Object.assign(new Error(`ENV:conn-refused:${pe}`), { isEnv: true, envKind: 'conn-refused' as ErrKind })
    const url = expandListPlaceholders(cfg.list.urlTemplate || '')
    if (!url) throw new Error('ASSERT:list.urlTemplate 缺失')
    const st = mkStage('list')
    const data = await probe('list', url, cfg.list)
    st.engine = data.engine
    st.ms = data.ms
    st.metrics.url = url
    st.metrics.count = data.count
    const sample: Record<string, string>[] = Array.isArray(data.sample) ? data.sample : []
    st.metrics.sampleSize = sample.length
    const linkN = sample.filter((it) => (it.url || it.bookUrl || '').trim()).length
    const linkRate = sample.length ? Math.round((linkN / sample.length) * 1000) / 1000 : 0
    const nameDefined = fieldPatterns(cfg.list.fields || {}).includes('name')
    const nameRate = sample.length && nameDefined ? Math.round((sample.filter((it) => (it.name || '').trim()).length / sample.length) * 1000) / 1000 : 0
    st.checks.push({ name: 'list.条目数>0', ok: (data.count ?? 0) > 0, detail: `count=${data.count}` })
    if (nameDefined) st.checks.push({ name: 'list.name 非空率≥0.5(样本内)', ok: nameRate >= 0.5, detail: `rate=${nameRate}` })
    st.checks.push({ name: 'list.url/bookUrl 非空率≥0.5(样本内)', ok: linkRate >= 0.5, detail: `rate=${linkRate}` })
    const first = sample.find((it) => it.url || it.bookUrl)
    bookUrl = first ? String(first.url || first.bookUrl || '').trim() : ''
    if (first) st.samples.push(cut(JSON.stringify({ name: first.name, author: first.author, link: bookUrl }), SAMPLE_MAX))
    // ★字段清洗审计(list sample 前 5 条非空值)
    const laudited = new Set<string>()
    for (const it of sample.slice(0, 5)) {
      for (const f of ['name', 'author', 'category', 'status', 'latestChapter']) {
        const v = (it[f] || '').trim()
        if (!v || laudited.has(`${f}:${v.slice(0, 20)}`)) continue
        laudited.add(`${f}:${v.slice(0, 20)}`)
        report.fieldAudit.push(...auditField('text', f, v, 'list'))
      }
      if ((it.intro || '').trim()) report.fieldAudit.push(...auditField('intro', 'intro', it.intro, 'list'))
    }
    const hard = st.checks.filter((c) => !c.ok)
    if (hard.length) {
      report.stages.list = failStage(st, `断言失败: ${hard.map((c) => `${c.name}(${c.detail})`).join('; ')}`)
      // 断言失败热重载复跑一次
      await sleep(REPROBE_DELAY_MS)
      try {
        const d2 = await probe('list', url, cfg.list)
        if ((d2.count ?? 0) > 0) {
          const s2 = Array.isArray(d2.sample) ? d2.sample : []
          const l2 = s2.filter((it: Record<string, string>) => (it.url || it.bookUrl || '').trim()).length
          if (s2.length && l2 / s2.length >= 0.5) {
            bookUrl = String((s2.find((it: Record<string, string>) => it.url || it.bookUrl) || {}).url || (s2.find((it: Record<string, string>) => it.url || it.bookUrl) || {}).bookUrl || '').trim()
            const st2: StageResult = { ...st, verdict: 'PASS', reason: '' }
            st2.metrics.reprobed = true
            report.stages.list = st2
          }
        }
      } catch { /* 复跑仍失败 → 维持 FAIL */ }
    } else {
      st.verdict = 'PASS'
      report.stages.list = st
    }
    console.log(`  list: ${report.stages.list.verdict} (count=${data.count}, linkRate=${linkRate}${report.stages.list.verdict !== 'PASS' ? `, ${report.stages.list.reason}` : ''})`)
  } catch (e) {
    const err = e as Error & { isEnv?: boolean; envKind?: ErrKind }
    const { kind, detail } = classifyError(e)
    report.stages.list = err.isEnv
      ? envStage('list', `${err.envKind || kind}: ${cut(detail, 180)}`)
      : failStage(mkStage('list'), cut(String(err.message).replace(/^ASSERT:/, '') || detail, 200), null)
    console.log(`  list: ${report.stages.list.verdict} (${report.stages.list.reason})`)
  }

  const listOk = report.stages.list.verdict === 'PASS'
  if (!listOk) {
    const dep = `dependency: list ${report.stages.list.verdict}`
    const v: Verdict = report.stages.list.verdict === 'ENV' ? 'ENV' : 'SKIP'
    report.stages.book = v === 'ENV' ? envStage('book', dep) : skipStage('book', dep)
    report.stages.toc = v === 'ENV' ? envStage('toc', dep) : skipStage('toc', dep)
    report.stages.content = v === 'ENV' ? envStage('content', dep) : skipStage('content', dep)
  }

  // ---- book ----
  if (listOk) {
    await sleep(STAGE_GAP_MS)
    try {
      const pe = portEnv('book')
      if (pe) throw Object.assign(new Error(`ENV:conn-refused:${pe}`), { isEnv: true, envKind: 'conn-refused' as ErrKind })
      const st = mkStage('book')
      const data = await probe('book', bookUrl, cfg.book)
      st.engine = data.engine
      st.ms = data.ms
      st.metrics.url = bookUrl
      const f: Record<string, string | undefined> = data.fields || {}
      const clean = (s: string | undefined) => (s || '').replace(/\s+/g, ' ').trim()
      const name = clean(f.name)
      const author = clean(f.author)
      const intro = clean(f.intro)
      const latest = clean(f.latestChapter)
      st.metrics.fields = { name: cut(name, 60), author: cut(author, 40), introLen: intro.length }
      st.checks.push({ name: 'book.书名非空', ok: !!name, detail: name || '空' })
      st.checks.push({ name: 'book.作者非空', ok: !!author, detail: author || '空' })
      st.checks.push({ name: 'book.简介非空', ok: intro.length > 0, detail: `introLen=${intro.length}` })
      if (name) st.samples.push(cut(`书名《${name}》 作者:${author} 简介:${intro}`, SAMPLE_MAX))
      // ★字段清洗审计(book)
      for (const [k, kind] of [['name', 'text'], ['author', 'text'], ['category', 'text'], ['status', 'text'], ['latestChapter', 'text'], ['keywords', 'text']] as const) {
        if ((f[k] || '').trim()) report.fieldAudit.push(...auditField(kind as 'text', k, String(f[k]), 'book'))
      }
      if ((f.intro || '').trim()) report.fieldAudit.push(...auditField('intro', 'intro', String(f.intro), 'book'))
      const hard = st.checks.filter((c) => !c.ok)
      if (hard.length) {
        report.stages.book = failStage(st, `断言失败: ${hard.map((c) => `${c.name}(${cut(c.detail, 80)})`).join('; ')}`)
      } else {
        st.verdict = 'PASS'
        report.stages.book = st
      }
      console.log(`  book: ${report.stages.book.verdict} (${report.stages.book.verdict === 'PASS' ? `《${name}》 introLen=${intro.length}` : report.stages.book.reason})`)
    } catch (e) {
      const err = e as Error & { isEnv?: boolean; envKind?: ErrKind }
      const { kind, detail } = classifyError(e)
      report.stages.book = err.isEnv
        ? envStage('book', `${err.envKind || kind}: ${cut(detail, 180)}`)
        : failStage(mkStage('book'), cut(String(err.message).replace(/^ASSERT:/, '') || detail, 200), null)
      console.log(`  book: ${report.stages.book.verdict} (${report.stages.book.reason})`)
    }
  }

  // ---- toc ----
  let chapterUrl = ''
  let chapterTitle = ''
  const bookOk = report.stages.book.verdict === 'PASS'
  const tocDisabled = !cfg.toc.enabled || !cfg.toc.fields || (!cfg.toc.fields.title && !cfg.toc.fields.url)
  if (!bookOk) {
    const dep = `dependency: book ${report.stages.book.verdict}`
    const v: Verdict = report.stages.book.verdict === 'ENV' ? 'ENV' : 'SKIP'
    report.stages.toc = v === 'ENV' ? envStage('toc', dep) : skipStage('toc', dep)
    report.stages.content = v === 'ENV' ? envStage('content', dep) : skipStage('content', dep)
  } else if (tocDisabled) {
    report.stages.toc = skipStage('toc', 'by-design: 规则 toc 段 enabled=false(站点无在线目录)')
    report.stages.content = cfg.content.enabled
      ? skipStage('content', 'dependency: toc SKIP(无章节 URL 来源)')
      : skipStage('content', 'by-design: 规则 content 段 enabled=false')
  } else {
    await sleep(STAGE_GAP_MS)
    try {
      const pe = portEnv('toc')
      if (pe) throw Object.assign(new Error(`ENV:conn-refused:${pe}`), { isEnv: true, envKind: 'conn-refused' as ErrKind })
      const st = mkStage('toc')
      const data = await probe('toc', bookUrl, cfg.toc, bookUrl)
      st.engine = data.engine
      st.ms = data.ms
      st.metrics.count = data.count
      st.metrics.pages = data.pages
      const sample: { title?: string; url?: string }[] = Array.isArray(data.sample) ? data.sample : []
      const firstTitle = (sample[0]?.title || '').trim()
      const lastTitle = (sample[sample.length - 1]?.title || '').trim()
      st.checks.push({ name: 'toc.章节数>0', ok: (data.count ?? 0) > 0, detail: `chapters=${data.count}` })
      st.checks.push({ name: 'toc.首章标题非空', ok: !!firstTitle, detail: cut(firstTitle, 40) || '空' })
      const badUrls = sample.filter((it) => it.url && !/^https?:\/\//i.test(it.url))
      st.checks.push({ name: 'toc.样本章节URL均为绝对http(s)', ok: badUrls.length === 0, detail: badUrls.length ? `异常 ${badUrls.length} 条` : '全部合法' })
      // 域名形态: 章节 host 应与书籍页同 host/镜像/本机代理
      let bookHost = ''
      try { bookHost = new URL(bookUrl).hostname.replace(/^www\./, '') } catch { /* ignore */ }
      const mirrorHosts = new Set((cfg.fetch.mirrorDomains || '').split(',').map((d) => d.trim().replace(/^www\./, '')).filter(Boolean))
      const proxyHosts = new Set<string>()
      for (const tpl of [cfg.fetch.contentProxyUrl, cfg.fetch.tokenUrl]) {
        if (!tpl) continue
        try { proxyHosts.add(new URL(String(tpl).replace(/\{url\}/g, 'x')).hostname.replace(/^www\./, '')) } catch { /* ignore */ }
      }
      if (cfg.fetch.allowLoopback === true) proxyHosts.add('127.0.0.1')
      const offHost = sample.filter((it) => {
        try {
          const h = new URL(it.url || '').hostname.replace(/^www\./, '')
          return h !== bookHost && !mirrorHosts.has(h) && !proxyHosts.has(h) && !h.endsWith('.' + bookHost) && !bookHost.endsWith('.' + h)
        } catch { return false }
      })
      st.checks.push({
        name: 'toc.章节URL同站(或镜像/代理)占比≥0.5(样本内)',
        ok: sample.length === 0 || offHost.length / sample.length <= 0.5,
        detail: `跨域 ${offHost.length}/${sample.length}`,
      })
      st.metrics.first = { title: cut(firstTitle, 50), url: sample[0]?.url }
      if (firstTitle) st.samples.push(cut(`首章: ${firstTitle} | ${sample[0]?.url}`, SAMPLE_MAX))
      chapterUrl = (sample[0]?.url || '').trim()
      chapterTitle = firstTitle
      const hard = st.checks.filter((c) => !c.ok)
      if (hard.length) {
        report.stages.toc = failStage(st, `断言失败: ${hard.map((c) => `${c.name}(${cut(c.detail, 100)})`).join('; ')}`)
      } else {
        st.verdict = 'PASS'
        report.stages.toc = st
      }
      console.log(`  toc: ${report.stages.toc.verdict} (chapters=${data.count}, pages=${data.pages}${report.stages.toc.verdict !== 'PASS' ? `, ${report.stages.toc.reason}` : ''})`)
    } catch (e) {
      const err = e as Error & { isEnv?: boolean; envKind?: ErrKind }
      const { kind, detail } = classifyError(e)
      report.stages.toc = err.isEnv
        ? envStage('toc', `${err.envKind || kind}: ${cut(detail, 180)}`)
        : failStage(mkStage('toc'), cut(String(err.message).replace(/^ASSERT:/, '') || detail, 200), null)
      console.log(`  toc: ${report.stages.toc.verdict} (${report.stages.toc.reason})`)
    }
  }

  // ---- content(端点探针 + 引擎直连全量深审计) ----
  const contentDisabled = !cfg.content.enabled || !cfg.content.fields?.content
  if (!chapterUrl) {
    if (!report.stages.content) {
      const dep = `dependency: toc ${report.stages.toc.verdict}`
      const v: Verdict = report.stages.toc.verdict === 'ENV' ? 'ENV' : 'SKIP'
      report.stages.content = v === 'ENV' ? envStage('content', dep) : skipStage('content', dep)
    }
  } else if (contentDisabled) {
    report.stages.content = skipStage('content', 'by-design: 规则 content 段 enabled=false')
  } else {
    await sleep(STAGE_GAP_MS)
    const st = mkStage('content')
    try {
      const pe = portEnv('content')
      if (pe) throw Object.assign(new Error(`ENV:conn-refused:${pe}`), { isEnv: true, envKind: 'conn-refused' as ErrKind })
      // (1) 端点探针(生产测试面板同链路)
      const data = await probe('content', chapterUrl, cfg.content, bookUrl)
      st.engine = data.engine
      st.ms = data.ms
      st.metrics.url = chapterUrl
      st.metrics.pages = data.pages
      st.metrics.rawLength = data.rawLength
      st.metrics.cleanedLength = data.cleanedLength
      const apiCleanedHead: string = String(data.cleanedText || '')
      st.checks.push({ name: 'content.端点探针成功且清洗产物非空', ok: (data.cleanedLength ?? 0) > 0, detail: `cleanedLength=${data.cleanedLength}` })
      // (2) 引擎直连全量深审计(端点 cleanedText 有 1500 码点截断)
      let auditSource = ''
      let audit: CleanAudit | null = null
      try {
        const fetchLocal: Partial<FetchConfig> = cfg.fetch.refererChain ? { ...cfgFetch, refererUrl: bookUrl } : cfgFetch
        const res = await stageGuard(engineFetchFull(chapterUrl, fetchLocal), 120_000, 'content-deep')
        const parsed = await parseContent(chapterUrl, res.html, cfg.content, fetchLocal)
        const cleanedFull = cleanContentHtml(parsed.content, cfg.clean)
        st.metrics.localCleanedLength = cleanedFull.length
        const mode: 'PT' | 'HT' = cfg.clean.plainText ? 'PT' : 'HT'
        const surface = mode === 'PT' ? cleanedFull : htmlToSurface(cleanedFull)
        const fullChars = surface.replace(/\s+/g, '').length
        const hosts: string[] = []
        try {
          const h = new URL(bookUrl).hostname.replace(/^www\./, '')
          hosts.push(h, h.split('.').slice(1).join('.')) // 全 host + 去一级域(如 shudugu.org / shudugu)
        } catch { /* ignore */ }
        for (const d of (cfg.fetch.mirrorDomains || '').split(',').map((x) => x.trim()).filter(Boolean)) hosts.push(d.replace(/^www\./, ''))
        audit = auditSurface(surface, {
          mode,
          cleanedHtml: cleanedFull,
          adPatterns: [...new Set([...(cfg.clean.adPatterns || []), ...DEFAULT_CLEAN_CONFIG.adPatterns])],
          hosts: [...new Set(hosts.filter((h) => h && h.includes('.')))],
          chapterTitle,
        })
        auditSource = `engine-direct(全量 ${surface.length} 字符表面)`
        // 与端点产物交叉核对(cleanedText=清洗后产物头部, 两模式同语义; 前 300 字符归一比对)
        const apiHeadCmp = apiCleanedHead.slice(0, 300)
        const localHeadCmp = cleanedFull.slice(0, 300)
        if (apiHeadCmp && localHeadCmp && apiHeadCmp.replace(/\s+/g, '') !== localHeadCmp.replace(/\s+/g, '')) {
          audit.issues.push({ item: 'apiLocalDivergence', level: 'WARN', label: '端点与引擎直连清洗产物头部不一致(两次抓取源站内容/分页差异, 不影响判定)', sample: cut(apiHeadCmp.replace(/\s+/g, ' '), 60) })
        }
        // R21 六项断言(全量文本上重算, 保持 R21 口径不放宽)
        const paraCount = audit.metrics.paras ?? 0
        st.checks.push({ name: 'content.① 段落数>1', ok: paraCount > 1, detail: `paragraphs=${paraCount}` })
        st.checks.push({ name: 'content.② 无连续3+空行', ok: (audit.metrics.looseGaps ?? 0) === 0, detail: `looseGaps=${audit.metrics.looseGaps ?? 0}` })
        st.checks.push({ name: 'content.③ 无广告行残留(掩码URL口径)', ok: (audit.metrics.adPatternLeft ?? 0) === 0 && (audit.metrics.markerFails ?? 0) === 0, detail: `adPatternLeft=${audit.metrics.adPatternLeft ?? 0} markerFails=${audit.metrics.markerFails ?? 0}` })
        const tagCheck: string[] = []
        if (mode === 'PT' && /<[^>]+>/.test(cleanedFull)) tagCheck.push('plainText 输出含 HTML 标签')
        if (mode === 'HT' && /<\s*\/?\s*(script|style|iframe|object|embed|link|meta)\b/i.test(cleanedFull)) tagCheck.push('危险标签残留')
        if (mode === 'HT' && /\son[a-z]+\s*=\s*["']?/i.test(cleanedFull)) tagCheck.push('on* 事件属性残留')
        if (mode === 'HT' && /javascript:/i.test(cleanedFull)) tagCheck.push('javascript: 协议残留')
        if (/(?:function\s*\w*\s*\(|document\.(?:write|cookie|getElement)|window\.|addEventListener\s*\()/.test(cleanedFull)) tagCheck.push('JS 代码残留')
        st.checks.push({ name: 'content.④ 无HTML/JS残留', ok: tagCheck.length === 0, detail: tagCheck.join('; ') || '无' })
        // 诱饵特征(重复填充/章名零交集/成人标记) — R21 口径
        const decoy: string[] = []
        const surfLines = surface.split(/\n+/).map((l) => l.trim()).filter(Boolean)
        if (surfLines.length) {
          const freq = new Map<string, number>()
          for (const l of surfLines) freq.set(l.slice(0, 40), (freq.get(l.slice(0, 40)) || 0) + 1)
          const [topLine, topN] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]
          if (topN >= 5 && topN / surfLines.length > 0.3) decoy.push(`重复填充: "${cut(topLine, 30)}" ×${topN}/${surfLines.length} 行`)
        }
        const TITLE_UNIT_CHARS = new Set(['第', '章', '节', '卷', '回', '集', '话', '篇', '部'])
        const cjkTitle = (chapterTitle.match(/[\u4e00-\u9fff]/g) || []).filter((c) => !TITLE_UNIT_CHARS.has(c))
        if (cjkTitle.length >= 2 && fullChars > 100) {
          const head = surface.replace(/\s+/g, '').slice(0, 800)
          if (cjkTitle.every((c) => !head.includes(c))) decoy.push(`内容与章名零字符交集(章名="${cut(chapterTitle, 30)}")`)
        }
        const adultHits = (cleanedFull.match(ADULT_MARKERS_RE) || []).length
        if (adultHits >= 5) decoy.push(`成人内容标记词命中 ${adultHits} 处(疑似诱饵载荷)`)
        st.checks.push({ name: 'content.⑤ 无诱饵特征', ok: decoy.length === 0, detail: decoy.join('; ') || '无' })
        st.checks.push({ name: 'content.⑥ 字数>200', ok: fullChars > 200, detail: `chars=${fullChars}` })
        if (audit) {
          for (const p of audit.paras.slice(0, 1)) st.samples.push(`头段: ${p}`)
          for (const p of audit.paras.slice(-1)) st.samples.push(`尾段: ${p}`)
        }
      } catch (deepErr) {
        // 引擎直连失败不推翻端点结论, 但审计面降级为端点 1500 码点头部
        const dk = classifyError(deepErr)
        auditSource = `api-head-fallback(端点头部 1500 码点, 深审计失败: ${dk.kind}: ${cut(String((deepErr as Error)?.message || deepErr), 80)})`
        const mode: 'PT' | 'HT' = cfg.clean.plainText ? 'PT' : 'HT'
        const headSurface = mode === 'PT' ? apiCleanedHead : htmlToSurface(String(data.cleanedHtml || ''))
        audit = auditSurface(headSurface, {
          mode,
          cleanedHtml: String(data.cleanedHtml || ''),
          adPatterns: [...new Set([...(cfg.clean.adPatterns || []), ...DEFAULT_CLEAN_CONFIG.adPatterns])],
          hosts: [],
          chapterTitle,
        })
        st.checks.push({ name: 'content.① 段落数>1(头部样本)', ok: (audit.metrics.paras ?? 0) > 1, detail: `paras=${audit.metrics.paras ?? 0}(头部样本)` })
        st.checks.push({ name: 'content.⑥ 字数>200(头部样本)', ok: (audit.metrics.chars ?? 0) > 200, detail: `chars=${audit.metrics.chars ?? 0}(头部样本)` })
      }
      // 汇总 content 判定
      report.contentAudit = audit
        ? { issues: audit.issues, metrics: audit.metrics, paras: audit.paras, gapProfile: audit.gapProfile, source: auditSource }
        : null
      const hardChecks = st.checks.filter((c) => !c.ok)
      const auditFails = audit ? audit.issues.filter((i) => i.level === 'FAIL') : []
      if (hardChecks.length || auditFails.length) {
        const reasons = [...hardChecks.map((c) => `${c.name}(${cut(c.detail, 100)})`), ...auditFails.map((i) => `${i.label}`)]
        report.stages.content = failStage(st, reasons.join('; '))
      } else {
        st.verdict = 'PASS'
        report.stages.content = st
      }
      const auditTags = audit ? audit.issues.filter((i) => i.level === 'WARN').length : 0
      console.log(`  content: ${report.stages.content.verdict} (${report.stages.content.verdict === 'PASS' ? `cleanedLen=${data.cleanedLength}, auditSource=${auditSource}${auditTags ? `, WARN×${auditTags}` : ''}` : cut(report.stages.content.reason, 150)})`)
    } catch (e) {
      const err = e as Error & { isEnv?: boolean; envKind?: ErrKind }
      const { kind, detail } = classifyError(e)
      report.stages.content = err.isEnv
        ? envStage('content', `${err.envKind || kind}: ${cut(detail, 180)}`)
        : failStage(mkStage('content'), cut(String(err.message).replace(/^ASSERT:/, '') || detail, 200), null)
      console.log(`  content: ${report.stages.content.verdict} (${report.stages.content.reason})`)
    }
  }

  // ---- audit 列判定 + summary ----
  const auditFails = report.fieldAudit.filter((i) => i.level === 'FAIL').length
    + (report.contentAudit ? report.contentAudit.issues.filter((i) => i.level === 'FAIL').length : 0)
  const auditWarns = report.fieldAudit.filter((i) => i.level === 'WARN').length
    + (report.contentAudit ? report.contentAudit.issues.filter((i) => i.level === 'WARN').length : 0)
  report.auditVerdict = report.stages.content.verdict === 'SKIP' && !report.contentAudit && !report.fieldAudit.length
    ? 'SKIP'
    : auditFails > 0 ? 'FAIL' : auditWarns > 0 ? 'WARN' : 'PASS'
  const parts = (['list', 'book', 'toc', 'content'] as Stage[]).map((s) => `${s}=${report.stages[s]?.verdict ?? 'SKIP'}`)
  report.summary = `${parts.join(' ')} audit=${report.auditVerdict}`
  return report
}

// ---------------- 主流程 ----------------
async function main() {
  const t0 = Date.now()
  const argKeys = process.argv.slice(2)
  const rules = argKeys.length ? BUILTIN_RULES.filter((r) => argKeys.includes(r.key)) : BUILTIN_RULES
  if (!rules.length) {
    console.error(`未找到规则: ${argKeys.join(', ')} (可用 key: ${BUILTIN_RULES.map((r) => r.key).join(', ')})`)
    process.exit(1)
  }
  console.log(`[R22-a] 内置规则全量复测: ${rules.length}/${BUILTIN_RULES.length} 条, 串行 + ${RULE_GAP_MS}ms 间隔 + http 单请求 ${HTTP_REQ_TIMEOUT_MS / 1000}s + 端点 ${BASE}/api/admin/rules/test`)
  await probeLocalPorts()

  const budgetDeadline = t0 + BUDGET_MS
  const reports: RuleReport[] = []
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]
    const report = await verifyRule(r, budgetDeadline)
    reports.push(report)
    if (i < rules.length - 1) await sleep(RULE_GAP_MS)
  }
  const wallMin = Math.round((Date.now() - t0) / 600) / 100

  // ---- 汇总矩阵 ----
  console.log('\n==================== 汇总矩阵 ====================')
  console.log('key'.padEnd(17), 'list'.padEnd(6), 'book'.padEnd(6), 'toc'.padEnd(6), 'content'.padEnd(8), 'audit'.padEnd(6), '说明')
  const tally: Record<Verdict, number> = { PASS: 0, FAIL: 0, ENV: 0, SKIP: 0 }
  let allFour = 0
  for (const r of reports) {
    const v = (s: Stage) => (r.stages[s]?.verdict ?? 'SKIP')
    console.log(r.key.padEnd(17), v('list').padEnd(6), v('book').padEnd(6), v('toc').padEnd(6), v('content').padEnd(8), String(r.auditVerdict).padEnd(6), r.note ? `〔${r.note}〕` : '')
    for (const s of ['list', 'book', 'toc', 'content'] as Stage[]) tally[v(s)]++
    if ((['list', 'book', 'toc', 'content'] as Stage[]).every((s) => v(s) === 'PASS')) allFour++
  }
  console.log('--------------------------------------------------')
  console.log(`全四段 PASS: ${allFour}/${reports.length}; 段级: PASS=${tally.PASS} FAIL=${tally.FAIL} ENV=${tally.ENV} SKIP=${tally.SKIP}; 总耗时 ${wallMin}min`)

  const fails = reports.filter((r) => (['list', 'book', 'toc', 'content'] as Stage[]).some((s) => r.stages[s]?.verdict === 'FAIL'))
  if (fails.length) {
    console.log('\n---- FAIL 明细 ----')
    for (const r of fails) {
      for (const s of ['list', 'book', 'toc', 'content'] as Stage[]) {
        const st = r.stages[s]
        if (st?.verdict === 'FAIL') {
          console.log(`(${r.key}) ${s}: ${cut(st.reason, 300)}`)
          for (const sm of st.samples.slice(0, 2)) console.log(`   样本: ${sm}`)
        }
      }
    }
  }
  const envs = reports.filter((r) => (['list', 'book', 'toc', 'content'] as Stage[]).some((s) => r.stages[s]?.verdict === 'ENV'))
  if (envs.length) {
    console.log('\n---- ENV 明细(环境受限, 带新鲜实证) ----')
    for (const r of envs) {
      for (const s of ['list', 'book', 'toc', 'content'] as Stage[]) {
        const st = r.stages[s]
        if (st?.verdict === 'ENV') console.log(`(${r.key}) ${s}: ${cut(st.reason, 220)}`)
      }
    }
  }
  const skips = reports.filter((r) => (['list', 'book', 'toc', 'content'] as Stage[]).some((s) => r.stages[s]?.verdict === 'SKIP'))
  if (skips.length) {
    console.log('\n---- SKIP 明细(by-design/依赖) ----')
    for (const r of skips) {
      for (const s of ['list', 'book', 'toc', 'content'] as Stage[]) {
        const st = r.stages[s]
        if (st?.verdict === 'SKIP') console.log(`(${r.key}) ${s}: ${st.reason}`)
      }
    }
  }

  // ---- ★清洗专项异常清单 ----
  console.log('\n==================== 清洗专项异常清单 ====================')
  const allSuggestions: string[] = []
  for (const r of reports) {
    const contentIssues = r.contentAudit?.issues || []
    const fieldIssues = r.fieldAudit
    if (!contentIssues.length && !fieldIssues.length) continue
    const fails = [...contentIssues, ...fieldIssues].filter((i) => i.level === 'FAIL')
    const warns = [...contentIssues, ...fieldIssues].filter((i) => i.level === 'WARN')
    console.log(`\n(${r.key}) audit=${r.auditVerdict}${r.contentAudit ? ` 表面=${r.contentAudit.source}; ${r.contentAudit.gapProfile}` : ''}`)
    for (const i of fails) console.log(`  ✗ FAIL ${i.label}${i.sample ? `\n      样本: ${cut(i.sample, 160)}` : ''}`)
    for (const i of warns) console.log(`  ⚠ WARN ${i.label}${i.sample ? `\n      样本: ${cut(i.sample, 160)}` : ''}`)
    allSuggestions.push(...suggestionsFor(r.key, [...fails, ...warns]))
  }
  const anyIssue = reports.some((r) => (r.contentAudit?.issues.length || 0) + r.fieldAudit.length > 0)
  if (!allSuggestions.length && anyIssue) console.log('(异常仅 WARN 级记录项, 无针对性修复建议)')
  if (!anyIssue) console.log('(全部规则清洗专项零异常)')
  console.log('\n---- 修复建议清单(只建议, 不改种子) ----')
  for (const s of allSuggestions) console.log(`  • ${s}`)

  // ---- 段落形态抽查汇总(头/中/尾) ----
  console.log('\n---- 段落形态抽查(头/中/尾各 1 段, 有 content 审计的规则) ----')
  for (const r of reports) {
    if (!r.contentAudit) continue
    if (!r.contentAudit.paras.length) continue
    console.log(`(${r.key}) ${r.contentAudit.paras.join(' ｜ ')}`)
  }

  try {
    writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), wallMinutes: wallMin, reports }, null, 2))
    console.log(`\n结果 JSON 已写入 ${OUT_JSON}`)
  } catch { /* /tmp 不可写则跳过 */ }
}

main().catch((e) => {
  console.error('复测脚本异常退出:', e)
  process.exit(1)
})
