// ============================================================
// [R21-a] 内置采集规则全量复测 — 25 条规则 × 四段(list/book/toc/content) + 清洗验证
// 用法: bun scripts/verify-r21-rules.ts [ruleKey ...]   (无参数 = 全部 25 条)
//
// 设计(对齐 R13/R19-b 复测口径 + api/admin/rules/test 路由同款语义):
//   - 直连引擎函数(fetcher.fetchPage + parser.parseList/parseBook/parseToc/parseContent
//     + cleaner.cleanContentHtml), 不经数据库; 规则 config 先过 parseRuleConfig 深消毒
//     (与入库→实采链路同口径)。
//   - list 段与 runner.parseList 同款 urlFields=['url','bookUrl']; URL 占位符展开同
//     测试路由 expandListPlaceholders({page}→1, {offset:N}→0, 兼容 %7B%7D 编码形态)。
//   - toc 段与 runner.extractToc 同序: tocLink → 书籍页本页 → 目录链接嗅探回退
//     (复制 rules/test 路由 resolveToc 流程; {q.*} 占位符取自真实 bookUrl 查询参数,
//     规避 R13 记录的"探针未传 vars"假阳性)。
//   - content 段: 取目录第 1 章 → fetchPage(blocked 且非合法 JSON 判拦) → parseContent
//     → cleanContentHtml(cfg.clean) → 六项断言(段落数/连续空行/广告残留/HTML-CSS-JS
//     残留/诱饵特征/字数) + GBK 乱码检测。
//   - 网络礼貌: 规则间串行, 规则间隔 1.2s, 段间隔 0.8s; 单请求超时: http 引擎规则统一
//     15s(AbortSignal.timeout 由 fetcher 内部 controller 执行), browser 引擎规则保留
//     min(规则值,45s) —— 浏览器渲染链(桥队列+页面加载+waitMs)15s 内经常无法完成,
//     15s 硬上限只对 HTTP 传输语义执行; 每段另有外层 stage 护栏防悬挂。
//   - 网络类失败(timeout/conn-refused/HTTP 403/5xx/拦截页)等 30s 重试一次再定论;
//     断言类失败(解析产物坏)不重试(确定性结果)。
//   - SKIP 必须注明原因; 不放宽任何断言。
//   - 已知环境注记(只注记不影响判定): 77shuku 需国内 IP 代理(R16/R17-b); wanben 站点
//     对沙箱出口 IP 层封锁(R13); ratelimit-demo 指向本机 3040 mock(R13 留档); zxcs
//     toc/content 按站点语义禁用(R13)。
// ============================================================
import * as cheerio from 'cheerio'
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
import {
  parseList,
  parseBook,
  parseToc,
  parseContent,
  parseJsonBody,
  extractField,
  urlVars,
  absolutize,
} from '../src/lib/crawl/parser'
import { cleanContentHtml } from '../src/lib/crawl/cleaner'

// ---------------- 常量与工具 ----------------
const RULE_GAP_MS = 1200
const STAGE_GAP_MS = 800
const HTTP_REQ_TIMEOUT_MS = 15_000 // 任务要求: 单请求超时 15s
const BROWSER_REQ_TIMEOUT_MAX_MS = 45_000 // browser 渲染链保底(见文件头注记)
const STAGE_GUARD_MS: Record<Stage, number> = { list: 60_000, book: 60_000, toc: 150_000, content: 120_000 }
const RETRY_DELAY_MS = 30_000
const SAMPLE_MAX = 200
const OUT_JSON = '/tmp/verify-r21-results.json'

type Stage = 'list' | 'book' | 'toc' | 'content'
type Verdict = 'PASS' | 'FAIL' | 'SKIP'

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

/** 网络类错误分类(决定 SKIP 标签与是否 30s 重试一次) */
type ErrKind = 'timeout' | 'conn-refused' | 'http-403' | 'http-4xx' | 'http-5xx' | 'blocked' | 'dns' | 'assert' | 'other'
function classifyError(e: unknown): { kind: ErrKind; detail: string } {
  const msg = String((e as Error)?.message || e).slice(0, 300)
  if (/STAGE_TIMEOUT/.test(msg)) return { kind: 'timeout', detail: msg }
  if (/拦截页|looksBlocked|验证码|JS挑战/.test(msg)) return { kind: 'blocked', detail: msg }
  if (/ECONNREFUSED|connection refused|连接被拒绝/i.test(msg)) return { kind: 'conn-refused', detail: msg }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|DNS/i.test(msg)) return { kind: 'dns', detail: msg }
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

/** 段级护栏(防悬挂; fetcher 自身 controller 已按 cfg.timeout 真正断 socket) */
async function stageGuard<T>(p: Promise<T>, ms: number, stage: Stage): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined
  const timer = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`STAGE_TIMEOUT:${stage} 段超过 ${ms / 1000}s 护栏`)), ms)
  })
  try {
    return await Promise.race([p, timer])
  } finally {
    if (t) clearTimeout(t)
  }
}

/** 引擎抓取统一入口: 规则 fetch + 超时钳制 + 拦截判定(runner/测试路由同款 JSON 豁免) */
async function engineFetch(url: string, fetchCfg: Partial<FetchConfig>): Promise<{ html: string; engine: string; ms: number }> {
  const started = Date.now()
  const res = await fetchPage(url, fetchCfg)
  const ms = Date.now() - started
  if (res.blocked && parseJsonBody(res.html) === undefined) {
    const head = cut(res.html.replace(/<[^>]+>/g, ' ').trim(), 120)
    throw new Error(`目标站点返回了反爬拦截页(验证码/JS挑战/空壳响应) [engine=${res.engine}] 页面样本: ${head}`)
  }
  return { html: res.html, engine: res.engine, ms }
}

/** HTML → 纯文本(块级感知, 与 downloader.stripHtmlToText 同口径) — 供正文断言用 */
function htmlToText(html: string): string {
  return decodeEntitiesLite(
    (html || '')
      .replace(/<(script|style|noscript|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<(script|style|noscript|iframe|object|embed)\b[^>]*\/?>/gi, ' ')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr|td|th|section|article|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
}
/** 实体单遍解码(白名单, 与 cleaner.decodeEntitiesOnce 同表) */
function decodeEntitiesLite(s: string): string {
  return s.replace(/&(?:nbsp|amp|lt|gt|quot|apos|#x[0-9a-f]+|#[0-9]+);/gi, (m) => {
    const key = m.slice(1, -1).toLowerCase()
    const basic: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
    if (basic[key] !== undefined) return basic[key]
    if (key.startsWith('#x')) {
      const cp = parseInt(key.slice(2), 16)
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''
    }
    if (key.startsWith('#')) {
      const cp = parseInt(key.slice(1), 10)
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''
    }
    return m
  })
}

/** 目录段(与 rules/test 路由 resolveToc / runner.extractToc 同序): tocLink → 本页 → 嗅探 */
async function resolveToc(
  bookUrl: string,
  bookHtml: string,
  rule: PageRule,
  fetchCfg: Partial<FetchConfig>,
): Promise<{ items: { title: string; url: string }[]; pages: number; via: string }> {
  if (rule.tocLink?.expression) {
    try {
      const $ = cheerio.load(bookHtml)
      const link = extractField(bookHtml, $, null, null, rule.tocLink, { vars: urlVars(bookUrl) })
      const abs = absolutize(link, bookUrl)
      if (abs && /^https?:\/\//.test(abs) && abs !== bookUrl) {
        let page: { html: string; engine: string; ms: number }
        try {
          page = await engineFetch(abs, fetchCfg)
        } catch {
          await sleep(800)
          page = await engineFetch(abs, fetchCfg)
        }
        const r1 = await parseToc(abs, page.html, rule, fetchCfg)
        if (r1.items.length) return { ...r1, via: `tocLink(${abs.slice(0, 100)})` }
      }
    } catch {
      // tocLink 解析/抓取失败 → 回退书籍页本页(与 runner 一致)
    }
  }
  const r2 = await parseToc(bookUrl, bookHtml, rule, fetchCfg)
  if (r2.items.length) return { ...r2, via: 'book-page' }
  // 嗅探兜底
  try {
    const $ = cheerio.load(bookHtml)
    let guess = ''
    $('a').each((_, el) => {
      if (guess) return
      const t = ($(el).text() || '').trim()
      if (/^(查看目录|章节目录|最新章节列表|章节列表|点击查看目录|全文目录|目录)$/.test(t)) {
        guess = $(el).attr('href') || ''
      }
    })
    const abs = absolutize(guess, bookUrl)
    if (abs && /^https?:\/\//.test(abs) && abs !== bookUrl) {
      const page = await engineFetch(abs, fetchCfg)
      const r3 = await parseToc(abs, page.html, rule, fetchCfg)
      if (r3.items.length) return { ...r3, via: `sniff(${abs.slice(0, 100)})` }
    }
  } catch {
    // 嗅探失败 → 返回本页结果
  }
  return { ...r2, via: 'book-page' }
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
  st.verdict = kind ? 'SKIP' : 'FAIL'
  st.reason = kind ? `${kind}: ${reason}` : reason
  return st
}

// ---------------- 各段断言 ----------------
async function verifyList(cfg: RuleConfig): Promise<{ result: StageResult; bookUrl: string; listName: string }> {
  const st = mkStage('list')
  const rule = cfg.list
  const url = expandListPlaceholders(rule.urlTemplate || '')
  if (!url) return { result: failStage(st, 'list.urlTemplate 缺失'), bookUrl: '', listName: '' }
  const res = await stageGuard(engineFetch(url, cfg.fetch), STAGE_GUARD_MS.list, 'list')
  st.engine = res.engine
  st.ms = res.ms
  st.metrics.url = url
  st.metrics.htmlBytes = res.html.length
  const parsed = parseList(res.html, url, rule, ['url', 'bookUrl'])
  const items = parsed.items.map((i) => i.fields)
  st.metrics.items = items.length
  const hasField = (k: string) => !!rule.fields[k]
  const rate = (k: string) => {
    if (!items.length) return { defined: hasField(k), rate: 0 }
    const n = items.filter((it) => (it[k] || '').trim()).length
    return { defined: hasField(k), rate: Math.round((n / items.length) * 1000) / 1000 }
  }
  st.metrics.nameRate = rate('name')
  st.metrics.authorRate = rate('author')
  st.metrics.introRate = rate('intro')
  const linkRate = (() => {
    if (!items.length) return 0
    const n = items.filter((it) => (it.url || it.bookUrl || '').trim()).length
    return Math.round((n / items.length) * 1000) / 1000
  })()
  st.metrics.linkRate = linkRate
  // 断言 1: 条目数 > 0
  st.checks.push({ name: 'list.条目数>0', ok: items.length > 0, detail: `items=${items.length}` })
  // 断言 2: 规则声明了 name 字段时, 非空率 ≥ 0.5(列表无名字则发现链路无标题可用)
  if (rate('name').defined) {
    st.checks.push({ name: 'list.name 非空率≥0.5', ok: rate('name').rate >= 0.5, detail: `rate=${rate('name').rate}` })
  }
  // 断言 3: 链接字段(url/bookUrl)非空率 ≥ 0.5(发现链路命脉)
  st.checks.push({ name: 'list.url/bookUrl 非空率≥0.5', ok: linkRate >= 0.5, detail: `rate=${linkRate}` })
  // author/intro 为记录项(书籍页权威来源, 列表缺省不判死)
  const first = items.find((it) => it.url || it.bookUrl)
  const bookUrl = first ? String(first.url || first.bookUrl || '').trim() : ''
  const listName = String(first?.name || first?.title || '').trim()
  if (first) {
    st.samples.push(cut(JSON.stringify({ name: first.name, author: first.author, link: bookUrl }), SAMPLE_MAX))
  }
  const hard = st.checks.filter((c) => !c.ok)
  if (hard.length) return { result: failStage(st, `断言失败: ${hard.map((c) => `${c.name}(${c.detail})`).join('; ')}`), bookUrl, listName }
  st.verdict = 'PASS'
  return { result: st, bookUrl, listName }
}

async function verifyToc(
  cfg: RuleConfig,
  bookUrl: string,
  bookHtml: string,
): Promise<{ result: StageResult; chapterUrl: string; chapterTitle: string }> {
  const st = mkStage('toc')
  const rule = cfg.toc
  const fetchCfg: Partial<FetchConfig> = cfg.fetch.refererChain ? { ...cfg.fetch, refererUrl: bookUrl } : cfg.fetch
  const r = await stageGuard(resolveToc(bookUrl, bookHtml, rule, fetchCfg), STAGE_GUARD_MS.toc, 'toc')
  st.metrics.via = r.via
  st.metrics.pages = r.pages
  const items = r.items
  st.metrics.chapters = items.length
  // 断言 1: 章节数 > 0
  st.checks.push({ name: 'toc.章节数>0', ok: items.length > 0, detail: `chapters=${items.length}` })
  if (!items.length) {
    return { result: failStage(st, '目录解析 0 章'), chapterUrl: '', chapterTitle: '' }
  }
  const firstTitle = (items[0].title || '').trim()
  const lastTitle = (items[items.length - 1].title || '').trim()
  st.checks.push({ name: 'toc.首章标题非空', ok: !!firstTitle, detail: cut(firstTitle, 40) || '空' })
  st.checks.push({ name: 'toc.末章标题非空', ok: !!lastTitle, detail: cut(lastTitle, 40) || '空' })
  // 断言 4: 章节 URL 形态合理(绝对 http(s) 链接)
  const badUrls = items.filter((it) => !/^https?:\/\//i.test(it.url || ''))
  st.checks.push({
    name: 'toc.章节URL均为绝对http(s)',
    ok: badUrls.length === 0,
    detail: badUrls.length ? `异常 ${badUrls.length} 条, 样本: ${cut(badUrls[0].url || '(空)', 80)}` : '全部合法',
  })
  // 域名形态: 章节 URL 主体应与书籍页同 host(或镜像域)
  let bookHost = ''
  try { bookHost = new URL(bookUrl).hostname.replace(/^www\./, '') } catch { /* ignore */ }
  const mirrorHosts = new Set(
    (cfg.fetch.mirrorDomains || '').split(',').map((d) => d.trim().replace(/^www\./, '')).filter(Boolean),
  )
  // [R21-b] loopback 转换代理主机豁免(deqixs/qidian/xjp/bqg713 同款 degrade-native 契约):
  // 章节 URL 由 toc 合成指向本机 contentProxyUrl(如 127.0.0.1:3010/unlock?url=…), 属合法形态非跨域误配
  const proxyHosts = new Set<string>()
  for (const tpl of [cfg.fetch.contentProxyUrl, cfg.fetch.tokenUrl]) {
    if (!tpl) continue
    try {
      proxyHosts.add(new URL(tpl.replace(/\{url\}/g, 'x')).hostname.replace(/^www\./, ''))
    } catch { /* 非法模板忽略 */ }
  }
  const offHost = items.filter((it) => {
    try {
      const h = new URL(it.url).hostname.replace(/^www\./, '')
      return h !== bookHost && !mirrorHosts.has(h) && !proxyHosts.has(h) && !h.endsWith('.' + bookHost) && !bookHost.endsWith('.' + h)
    } catch { return true }
  })
  st.checks.push({
    name: 'toc.章节URL同站(或镜像域)占比≥0.5',
    ok: items.length === 0 ? false : offHost.length / items.length <= 0.5,
    detail: `跨域 ${offHost.length}/${items.length}${offHost.length ? `, 跨域样本 host: ${(() => { try { return new URL(offHost[0].url).hostname } catch { return '(解析失败)' } })()}` : ''}`,
  })
  st.metrics.first = { title: cut(firstTitle, 50), url: items[0].url }
  st.metrics.last = { title: cut(lastTitle, 50), url: items[items.length - 1].url }
  st.samples.push(cut(`首章: ${firstTitle} | ${items[0].url}`, SAMPLE_MAX))
  st.samples.push(cut(`末章: ${lastTitle} | ${items[items.length - 1].url}`, SAMPLE_MAX))
  const hard = st.checks.filter((c) => !c.ok)
  if (hard.length) {
    return { result: failStage(st, `断言失败: ${hard.map((c) => `${c.name}(${cut(c.detail, 100)})`).join('; ')}`), chapterUrl: items[0].url, chapterTitle: firstTitle }
  }
  st.verdict = 'PASS'
  return { result: st, chapterUrl: items[0].url, chapterTitle: firstTitle }
}

/** 成人诱饵特征词(客观证据采样用; 命中数进报告) */
const ADULT_MARKERS_RE = /[胸口|高耸|肌肤|呻吟|喘息|挺动|抽插|肉棒|淫|穴|骚|乳|臀|欲火|春宵|交合|肉体]/g

async function verifyContent(
  cfg: RuleConfig,
  chapterUrl: string,
  chapterTitle: string,
  tocUrl: string,
): Promise<StageResult> {
  const st = mkStage('content')
  const rule = cfg.content
  const fetchCfg: Partial<FetchConfig> = cfg.fetch.refererChain ? { ...cfg.fetch, refererUrl: tocUrl } : cfg.fetch
  const res = await stageGuard(engineFetch(chapterUrl, fetchCfg), STAGE_GUARD_MS.content, 'content')
  st.engine = res.engine
  st.ms = res.ms
  st.metrics.url = chapterUrl
  st.metrics.htmlBytes = res.html.length
  const parsed = await parseContent(chapterUrl, res.html, rule, fetchCfg)
  const cleaned = cleanContentHtml(parsed.content, cfg.clean)
  st.metrics.pages = parsed.pages
  st.metrics.rawLen = parsed.content.length
  st.metrics.cleanedLen = cleaned.length
  st.metrics.quality = parsed.quality
  const isPlainText = !!cfg.clean.plainText
  const text = isPlainText ? cleaned : htmlToText(cleaned)
  const textCompact = text.replace(/\s+/g, '')
  st.metrics.textChars = textCompact.length

  // 断言 ①: 段落数 > 1
  let paraCount: number
  if (isPlainText) {
    paraCount = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).length
  } else {
    const pTags = (cleaned.match(/<p[\s>]/gi) || []).length
    const brCount = (cleaned.match(/<\s*br\s*\/?>/gi) || []).length
    const lineCount = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).length
    paraCount = Math.max(pTags, lineCount, brCount > 0 ? 2 : lineCount)
  }
  st.metrics.paragraphs = paraCount
  st.checks.push({ name: 'content.① 段落数>1', ok: paraCount > 1, detail: `paragraphs=${paraCount}` })

  // 断言 ②: 无连续 3+ 空行
  const blankRuns = text.match(/\n[ \t]*\n(?:[ \t]*\n)+/g) || []
  const emptyParaRuns = isPlainText ? [] : cleaned.match(/(?:<p>(?:\s|&nbsp;|<br\s*\/?\s*>)*<\/p>\s*){3,}/gi) || []
  st.checks.push({
    name: 'content.② 无连续3+空行',
    ok: blankRuns.length === 0 && emptyParaRuns.length === 0,
    detail: blankRuns.length || emptyParaRuns.length ? `连续空行区 ${blankRuns.length} 处/空段落链 ${emptyParaRuns.length} 处` : '无',
  })

  // 断言 ③: 无广告行残留(对照本规则 clean.adPatterns ∪ 默认广告特征)
  const patterns = [...new Set([...(cfg.clean.adPatterns || []), ...DEFAULT_CLEAN_CONFIG.adPatterns])]
  const adHits: string[] = []
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    for (const p of patterns) {
      let re: RegExp | null = null
      try { re = new RegExp(p, 'i') } catch { continue }
      if (re.test(line)) {
        adHits.push(`[/${p}/] ${cut(line, 80)}`)
        break
      }
    }
  }
  st.metrics.adHitLines = adHits.length
  if (adHits.length) st.samples.push(...adHits.slice(0, 3))
  st.checks.push({
    name: 'content.③ 无广告行残留',
    ok: adHits.length === 0,
    detail: adHits.length ? `${adHits.length} 行命中广告特征` : '无',
  })

  // 断言 ④: 无 HTML 标签 / CSS / JS 残留
  const tagCheck: string[] = []
  if (isPlainText && /<[^>]+>/.test(cleaned)) tagCheck.push('plainText 输出含 HTML 标签: ' + cut(cleaned.match(/<[^>]+>/)?.[0] || '', 40))
  if (/<\s*\/?\s*(script|style|iframe|object|embed|link|meta)\b/i.test(cleaned)) tagCheck.push('危险标签残留')
  if (/on[a-z]+\s*=\s*["']?/i.test(cleaned)) tagCheck.push('on* 事件属性残留')
  if (/javascript:/i.test(cleaned)) tagCheck.push('javascript: 协议残留')
  if (/(?:function\s*\w*\s*\(|document\.(?:write|cookie|getElement)|window\.|addEventListener\s*\()/.test(text)) tagCheck.push('JS 代码残留')
  if (/(?:display\s*:\s*(?:none|block)|background(?:-color)?\s*:|margin(?:-left)?\s*:|font-size\s*:|@\w+-keyframes|\.\w+\s*\{[^}]*:)/i.test(text)) tagCheck.push('CSS 残留')
  st.checks.push({
    name: 'content.④ 无HTML/CSS/JS残留',
    ok: tagCheck.length === 0,
    detail: tagCheck.length ? tagCheck.join('; ') : '无',
  })

  // 断言 ⑤: 诱饵特征(异常短 / 重复填充 / 与章名零交集 / 成人诱饵标记)
  const decoy: string[] = []
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  if (lines.length) {
    const freq = new Map<string, number>()
    for (const l of lines) {
      const k = l.slice(0, 40)
      freq.set(k, (freq.get(k) || 0) + 1)
    }
    const [topLine, topN] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]
    const repeatRatio = topN / lines.length
    if (topN >= 5 && repeatRatio > 0.3) decoy.push(`重复填充: "${cut(topLine, 30)}" ×${topN}/${lines.length} 行`)
  }
  const cjkTitle = chapterTitle.match(/[\u4e00-\u9fff]/g) || []
  if (cjkTitle.length >= 2 && textCompact.length > 100) {
    const head = textCompact.slice(0, 800)
    const overlap = cjkTitle.filter((c) => head.includes(c)).length
    if (overlap === 0) decoy.push(`内容与章名零字符交集(章名="${cut(chapterTitle, 30)}")`)
  }
  const adultHits = (cleaned.match(ADULT_MARKERS_RE) || []).length
  if (adultHits >= 5) decoy.push(`成人内容标记词命中 ${adultHits} 处(疑似诱饵载荷)`)
  st.metrics.adultMarkerHits = adultHits
  st.checks.push({
    name: 'content.⑤ 无诱饵特征',
    ok: decoy.length === 0,
    detail: decoy.length ? decoy.join('; ') : '无',
  })
  if (decoy.length) st.samples.push(cut(text, SAMPLE_MAX))

  // 断言 ⑥: 字数 > 200
  st.checks.push({ name: 'content.⑥ 字数>200', ok: textCompact.length > 200, detail: `chars=${textCompact.length}` })

  // GBK/编码: 乱码检测(U+FFFD 与 UTF8-as-Latin1 典型串)
  const fffd = (cleaned.match(/\uFFFD/g) || []).length
  const mojibakeLatin = (cleaned.match(/[\u00C0-\u00FF]{4,}/g) || []).length
  st.metrics.mojibake = { fffd, mojibakeLatin }
  if (fffd > Math.max(2, textCompact.length * 0.005)) {
    st.checks.push({ name: 'content.编码无乱码', ok: false, detail: `U+FFFD ×${fffd}(疑似编码解码错误)` })
  } else if (mojibakeLatin > 3 && /[\u4e00-\u9fff]/.test(chapterTitle)) {
    st.checks.push({ name: 'content.编码无乱码', ok: false, detail: `Latin 扩展串 ×${mojibakeLatin}(疑似 GBK 站按 UTF-8 解码)` })
  } else {
    st.checks.push({ name: 'content.编码无乱码', ok: true, detail: '无乱码特征' })
  }

  // 样本: 首段与末段
  const paraLines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  if (paraLines.length) {
    st.samples.unshift(cut(`开头: ${paraLines.slice(0, 2).join(' / ')}`, SAMPLE_MAX))
    if (paraLines.length > 2) st.samples.push(cut(`结尾: ${paraLines.slice(-1).join('')}`, SAMPLE_MAX))
  }

  const hard = st.checks.filter((c) => !c.ok)
  if (hard.length) return failStage(st, `断言失败: ${hard.map((c) => `${c.name}(${cut(c.detail, 120)})`).join('; ')}`)
  st.verdict = 'PASS'
  return st
}

// ---------------- 单规则四段链 ----------------
interface RuleReport {
  key: string
  name: string
  note?: string
  stages: Record<Stage, StageResult>
  summary: string
}

const KNOWN_NOTES: Record<string, string> = {
  '77shuku': '已知: 站点仅国内 IP 可达, builtin 注册表 proxyUrl 为空 → 预期连接超时 SKIP(R16/R17-b)',
  wanben: '已知: 站点对沙箱出口 IP 层封锁, 浏览器无解 → 预期 SKIP(R13 留档)',
  'ratelimit-demo': '已知: 指向本机 127.0.0.1:3040 模拟源站, 当前未启动 → 预期连接拒绝 SKIP(R13 留档)',
  zxcs: '已知: TXT 下载站, toc/content 段按站点语义 enabled:false(R13 留档)',
  fanqie: '已知: 规则声明 API 于 2026-08-31 全路径 502 暂不可达, 本轮提供新鲜证据',
  daweixs: '已知: 章节页间歇跳转导流首页(站点变质征兆, R13 留档)',
  pilishuwu: '已知: CF 挑战强度波动, 间歇性超时(R13 留档)',
  bqg713: 'R21-b 已根治: 正文走 3010 /unlock 主机池(诱饵镜像剔除), 预期真实正文 PASS',
}

async function verifyRule(entry: (typeof BUILTIN_RULES)[number]): Promise<RuleReport> {
  const report: RuleReport = { key: entry.key, name: entry.name, note: KNOWN_NOTES[entry.key], stages: {} as never, summary: '' }
  const cfg = parseRuleConfig(JSON.stringify(entry.config))
  console.log(`\n▶ [${entry.key}] ${entry.name}`)

  // 引擎超时钳制: http 引擎 15s; browser 引擎保留规则值(≤45s, 渲染链需要)
  const cfgFetch: FetchConfig = {
    ...cfg.fetch,
    timeout:
      cfg.fetch.engine === 'browser'
        ? Math.min(cfg.fetch.timeout || BROWSER_REQ_TIMEOUT_MAX_MS, BROWSER_REQ_TIMEOUT_MAX_MS)
        : HTTP_REQ_TIMEOUT_MS,
  }
  const ruleCfg: RuleConfig = { ...cfg, fetch: cfgFetch }

  /** 网络类失败 30s 后重试一次(任务硬约束: 等待重试再定论) */
  const withNetRetry = async <T>(fn: () => Promise<T>, label: string): Promise<T> => {
    try {
      return await fn()
    } catch (e) {
      const { kind, detail } = classifyError(e)
      if (!NETWORK_KINDS.includes(kind)) throw e
      console.log(`  ⏳ ${label} 网络类失败(${kind}: ${cut(detail, 120)}), 30s 后重试一次…`)
      await sleep(RETRY_DELAY_MS)
      return await fn()
    }
  }

  // ---- list ----
  let bookUrl = ''
  let bookHtml = ''
  let tocUrl = ''
  try {
    const listRun = async () => {
      const r = await verifyList(ruleCfg)
      if (r.result.verdict === 'FAIL') {
        const err: any = new Error(`ASSERT:${r.result.reason}`)
        err.isAssert = true
        throw err
      }
      return r
    }
    const { result, bookUrl: bu, listName } = await withNetRetry(listRun, 'list')
    report.stages.list = result
    bookUrl = bu
    console.log(`  list: PASS (items=${result.metrics.items}, linkRate=${result.metrics.linkRate}, name=${listName || '—'})`)
  } catch (e) {
    const err = e as Error & { isAssert?: boolean }
    const { kind, detail } = classifyError(e)
    report.stages.list = err.isAssert
      ? { ...mkStage('list'), verdict: 'FAIL', reason: String(err.message).replace(/^ASSERT:/, '') }
      : failStage(mkStage('list'), cut(detail, 200), kind)
    console.log(`  list: ${report.stages.list.verdict} (${report.stages.list.reason})`)
  }

  // ---- book ----
  if (!bookUrl) {
    const dep = `dependency: list ${report.stages.list.verdict}`
    report.stages.book = { ...mkStage('book'), verdict: 'SKIP', reason: dep }
    report.stages.toc = { ...mkStage('toc'), verdict: 'SKIP', reason: dep }
    report.stages.content = { ...mkStage('content'), verdict: 'SKIP', reason: dep }
  } else {
    await sleep(STAGE_GAP_MS)
    try {
      // 抓书籍页(留存 html 给 toc 段复用, 避免二次抓取), 再做 parseBook 断言
      const fetchBook = async () => {
        const res = await stageGuard(engineFetch(bookUrl, ruleCfg.fetch), STAGE_GUARD_MS.book, 'book')
        return res
      }
      const res = await withNetRetry(fetchBook, 'book')
      bookHtml = res.html
      // 断言部分
      const stB = mkStage('book')
      stB.engine = res.engine
      stB.ms = res.ms
      stB.metrics.url = bookUrl
      stB.metrics.htmlBytes = res.html.length
      const parsed = parseBook(res.html, bookUrl, ruleCfg.book)
      const clean = (s: string | undefined) => (s || '').replace(/\s+/g, ' ').trim()
      const name = clean(parsed.name)
      const author = clean(parsed.author)
      const intro = clean(parsed.intro)
      const latest = clean(parsed.latestChapter)
      stB.metrics.fields = { name: cut(name, 60), author: cut(author, 40), category: clean(parsed.category), status: clean(parsed.status), latestChapter: cut(latest, 60), introLen: intro.length }
      stB.checks.push({ name: 'book.书名非空', ok: !!name, detail: name || '空' })
      stB.checks.push({ name: 'book.作者非空', ok: !!author, detail: author || '空' })
      stB.checks.push({ name: 'book.简介非空', ok: intro.length > 0, detail: `introLen=${intro.length}` })
      if (ruleCfg.book.fields.latestChapter) {
        stB.checks.push({ name: 'book.最新章节非空', ok: !!latest, detail: latest || '空' })
      } else {
        stB.checks.push({ name: 'book.最新章节非空', ok: true, detail: 'N/A(规则未定义 latestChapter 字段)' })
      }
      if (name) stB.samples.push(cut(`书名《${name}》 作者:${author} 简介:${intro}`, SAMPLE_MAX))
      const hardB = stB.checks.filter((c) => !c.ok)
      if (hardB.length) {
        report.stages.book = failStage(stB, `断言失败: ${hardB.map((c) => `${c.name}(${cut(c.detail, 80)})`).join('; ')}`)
      } else {
        stB.verdict = 'PASS'
        report.stages.book = stB
      }
      console.log(`  book: ${report.stages.book.verdict} (${report.stages.book.verdict === 'PASS' ? `《${name}》 introLen=${intro.length}` : report.stages.book.reason})`)
    } catch (e) {
      const err = e as Error
      const { kind, detail } = classifyError(e)
      report.stages.book = failStage(mkStage('book'), cut(detail, 200), kind)
      console.log(`  book: ${report.stages.book.verdict} (${report.stages.book.reason})`)
    }

    // ---- toc ----
    if (report.stages.book.verdict !== 'PASS') {
      report.stages.toc = { ...mkStage('toc'), verdict: 'SKIP', reason: `dependency: book ${report.stages.book.verdict}` }
      report.stages.content = { ...mkStage('content'), verdict: 'SKIP', reason: `dependency: book ${report.stages.book.verdict}` }
    } else if (!ruleCfg.toc.enabled || !ruleCfg.toc.fields || (!ruleCfg.toc.fields.title && !ruleCfg.toc.fields.url)) {
      report.stages.toc = { ...mkStage('toc'), verdict: 'SKIP', reason: 'by-design: 规则 toc 段 enabled=false(站点无在线目录)' }
      report.stages.content = ruleCfg.content.enabled
        ? { ...mkStage('content'), verdict: 'SKIP', reason: 'dependency: toc SKIP(无章节 URL 来源)' }
        : { ...mkStage('content'), verdict: 'SKIP', reason: 'by-design: 规则 content 段 enabled=false' }
    } else {
      await sleep(STAGE_GAP_MS)
      let chapterUrl = ''
      let chapterTitle = ''
      try {
        const tocRun = async () => {
          const r = await verifyToc(ruleCfg, bookUrl, bookHtml)
          if (r.result.verdict === 'FAIL') {
            const err: any = new Error(`ASSERT:${r.result.reason}`)
            err.isAssert = true
            throw err
          }
          return r
        }
        const r = await withNetRetry(tocRun, 'toc')
        report.stages.toc = r.result
        chapterUrl = r.chapterUrl
        chapterTitle = r.chapterTitle
        tocUrl = String(r.result.metrics.via || '').match(/^tocLink\(([^)]+)\)/)?.[1] || bookUrl
        console.log(`  toc: PASS (chapters=${r.result.metrics.chapters}, via=${r.result.metrics.via})`)
      } catch (e) {
        const err = e as Error & { isAssert?: boolean }
        const { kind, detail } = classifyError(e)
        report.stages.toc = err.isAssert
          ? { ...mkStage('toc'), verdict: 'FAIL', reason: String(err.message).replace(/^ASSERT:/, '') }
          : failStage(mkStage('toc'), cut(detail, 200), kind)
        console.log(`  toc: ${report.stages.toc.verdict} (${report.stages.toc.reason})`)
      }

      // ---- content ----
      if (!chapterUrl) {
        report.stages.content = { ...mkStage('content'), verdict: 'SKIP', reason: `dependency: toc ${report.stages.toc.verdict}` }
      } else if (!ruleCfg.content.enabled || !ruleCfg.content.fields?.content) {
        report.stages.content = { ...mkStage('content'), verdict: 'SKIP', reason: 'by-design: 规则 content 段 enabled=false' }
      } else {
        await sleep(STAGE_GAP_MS)
        try {
          const contentRun = async () => verifyContent(ruleCfg, chapterUrl, chapterTitle, tocUrl)
          // 网络类失败在 engineFetch 抛错阶段被 withNetRetry 捕获重试; 断言失败不重试(确定性)
          report.stages.content = await withNetRetry(contentRun, 'content')
          console.log(`  content: ${report.stages.content.verdict} (${report.stages.content.verdict === 'PASS' ? `chars=${report.stages.content.metrics.textChars}, paras=${report.stages.content.metrics.paragraphs}` : report.stages.content.reason})`)
        } catch (e) {
          const { kind, detail } = classifyError(e)
          report.stages.content = failStage(mkStage('content'), cut(detail, 200), kind)
          console.log(`  content: ${report.stages.content.verdict} (${report.stages.content.reason})`)
        }
      }
    }
  }

  // ---- summary ----
  const parts = (['list', 'book', 'toc', 'content'] as Stage[]).map((s) => `${s}=${report.stages[s]?.verdict ?? 'SKIP'}`)
  report.summary = parts.join(' ')
  return report
}

// ---------------- 主流程 ----------------
async function main() {
  const argKeys = process.argv.slice(2)
  const rules = argKeys.length ? BUILTIN_RULES.filter((r) => argKeys.includes(r.key)) : BUILTIN_RULES
  if (!rules.length) {
    console.error(`未找到规则: ${argKeys.join(', ')} (可用 key: ${BUILTIN_RULES.map((r) => r.key).join(', ')})`)
    process.exit(1)
  }
  console.log(`[R21-a] 内置规则全量复测: ${rules.length}/${BUILTIN_RULES.length} 条, 串行 + ${RULE_GAP_MS}ms 间隔 + http 单请求 ${HTTP_REQ_TIMEOUT_MS / 1000}s 超时`)
  const reports: RuleReport[] = []
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]
    const report = await verifyRule(r)
    reports.push(report)
    if (i < rules.length - 1) await sleep(RULE_GAP_MS)
  }

  // ---- 汇总矩阵 ----
  console.log('\n==================== 汇总矩阵 ====================')
  console.log('key'.padEnd(16), 'list'.padEnd(6), 'book'.padEnd(6), 'toc'.padEnd(6), 'content'.padEnd(6), '说明')
  const tally: Record<Verdict, number> = { PASS: 0, FAIL: 0, SKIP: 0 }
  let allFour = 0
  for (const r of reports) {
    const v = (s: Stage) => (r.stages[s]?.verdict ?? 'SKIP')
    console.log(r.key.padEnd(16), v('list').padEnd(6), v('book').padEnd(6), v('toc').padEnd(6), v('content').padEnd(6), r.note ? `〔${r.note}〕` : '')
    for (const s of ['list', 'book', 'toc', 'content'] as Stage[]) tally[v(s)]++
    if (v('list') === 'PASS' && v('book') === 'PASS' && v('toc') === 'PASS' && v('content') === 'PASS') allFour++
  }
  console.log('--------------------------------------------------')
  console.log(`全四段 PASS: ${allFour}/${reports.length}; 段级: PASS=${tally.PASS} FAIL=${tally.FAIL} SKIP=${tally.SKIP}`)
  const fails = reports.filter((r) => (['list', 'book', 'toc', 'content'] as Stage[]).some((s) => r.stages[s]?.verdict === 'FAIL'))
  if (fails.length) {
    console.log('\n---- FAIL 明细 ----')
    for (const r of fails) {
      for (const s of ['list', 'book', 'toc', 'content'] as Stage[]) {
        const st = r.stages[s]
        if (st?.verdict === 'FAIL') {
          console.log(`[${r.key}] ${s}: ${st.reason}`)
          for (const sm of st.samples.slice(0, 2)) console.log(`   样本: ${sm}`)
        }
      }
    }
  }
  const skips = reports.filter((r) => (['list', 'book', 'toc', 'content'] as Stage[]).some((s) => r.stages[s]?.verdict === 'SKIP'))
  if (skips.length) {
    console.log('\n---- SKIP 明细(含原因) ----')
    for (const r of skips) {
      for (const s of ['list', 'book', 'toc', 'content'] as Stage[]) {
        const st = r.stages[s]
        if (st?.verdict === 'SKIP') console.log(`[${r.key}] ${s}: ${st.reason}`)
      }
    }
  }
  try {
    writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2))
    console.log(`\n结果 JSON 已写入 ${OUT_JSON}`)
  } catch { /* /tmp 不可写则跳过 */ }
}

main().catch((e) => {
  console.error('复测脚本异常退出:', e)
  process.exit(1)
})
