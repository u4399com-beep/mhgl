/**
 * 起点中文(qidian) 镜像 API 正文转换代理 (R12-b)
 * ============================================================
 * 背景(2026-09-11 真网实测, 见 scripts/seed-rule-qidian.ts 头注释与 worklog R12-b):
 *   - 书源来源: Legado「小雨的世界 · 起点中文」(shuyuan-api.yiove.com 导入,
 *     经本系统 cloak-browser:3016 穿透其 Cloudflare 盾拉取), 底层为镜像 API
 *     full.hnxianxin.cn/qd/(search/detail/catalog/ranking/content.php, 纯 JSON):
 *     · ranking/detail/catalog 三段公网可匿名直连(实测 200, 无 WAF)
 *     · content.php 必须携带起点小程序会话凭证(Ywkey/Ywguid 请求头, 即书源
 *       loginUi 的"自订正文凭证"机制), 匿名请求 → 401 {"error":"缺少用户 token，
 *       请先申请游客 token 或登录账号"}; 全网未发现游客 token 端点(逐路径探测 404)
 *   - 目录 API 的章节载体 C 字段 = "data:;base64,<b64>,{opts}" 形态, b64 解码即
 *     {bookId, chapterId, v, epub, time} 签名载荷(time 为时效签名, 过期需重取目录)
 *   - 声明式引擎不可表达(b64 解码+签名 URL 合成+凭证头) → 外置转换代理(本服务)
 *
 * ★ 与采集引擎的对接契约(degrade-native, 与 xjp/deqixs 同范式):
 *   - 规则 toc url 字段(const) 直接指向本代理: http://127.0.0.1:3017/chapter?bookId={q.bookId}&index={index}
 *   - 规则 fetch.contentProxyUrl 必须配置为 http://127.0.0.1:3017/chapter?url={url}:
 *     它是引擎 SSRF 守卫的 loopback 豁免键(loopbackBypassAllowed 按 host:port 比对)。
 *     引擎 contentProxyUrl 钩子会先行探测(把章节 URL 本身塞进 url= 参数) —— 本代理对
 *     url= 形态【故意快速拒绝】(返回 ok:false), 令引擎走"静默降级原 URL 直连"路径;
 *     降级直连命中本代理的 bookId+index 参数形态 → 返回 {ok,len,content} JSON →
 *     引擎 content 字段(json 类型)直接取 content 纯文本(\n 分段)。
 *     (不走 hook 成功路径的原因: hook 成功会把 content 文本包成 <p> HTML, 而引擎
 *      解析器无"多段 <p> 聚合"提取器(css 取首个/regex 取首个), json 字段会拿到空)
 *   - index = 目录数组 1 基下标(含卷行): 引擎侧用 toc url 的 replaceFrom('^.*&Vo=true$')
 *     把卷行(Vo=true, C 为空)URL 整体清空 → 空链接目录条目被引擎过滤不采;
 *     本代理对命中的 index 再校验一次行数据(卷行/越界均报错), 双保险防错位
 *
 * 凭证配置(正文必需):
 *   环境变量 QD_YWKEY / QD_YWGUID = 起点小程序 ywkey/ywguid(书源自订凭证同源)。
 *   未配置时: catalog/ranking/detail 代理能力不受影响, 正文请求返回 ok:false 并附
 *   配置指引(引擎侧表现为章节正文为空, TaskLog 可见; /health.credentialsConfigured=false)。
 *
 * 接口:
 *   GET /health                          → {ok,service,port,selfTestOk,credentialsConfigured,upstreamProbe,ts}
 *   GET /chapter?bookId=<digits>&index=<n> → {ok:true,bookId,index,len,content}   (content=UTF-8 纯文本 \n 分段)
 *                                          | {ok:false,error}  (参数非法/卷行/越界/上游失败/缺凭证)
 *
 * 启动: cd mini-services/qidian-proxy && bun run dev   (bun --hot 热更, 端口固定 3017)
 */
import { createBridgeServer, createThrottledHealthProbe, getRes, htmlToText, json } from '../_shared/server'

const PORT = Number(process.env.PORT || 3017)
const UPSTREAM = (process.env.QD_UPSTREAM || 'https://full.hnxianxin.cn/qd/').replace(/\/?$/, '/')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const UPSTREAM_TIMEOUT_MS = 20_000
// 自检用书目(玄鉴仙族, 公开可匿名取目录; 仅验 catalog+解码链路, 不打 content 免耗配额)
const PROBE_BOOK_ID = /^\d{1,12}$/.test(process.env.QD_PROBE_BOOK_ID || '') ? (process.env.QD_PROBE_BOOK_ID as string) : '1035420986'

// ---------- 目录缓存 ----------
// TTL 10min: 目录内的章节签名(time)有时效性, 缓存过久可能拿到过期签名 → 取中等 TTL;
// 引擎每章采集都会打到本代理, 缓存避免逐章重拉 120KB 目录(起点大部头 3000+ 章 ≈ 2MB/次)
const CATALOG_TTL_MS = 10 * 60_000
const CATALOG_CACHE_MAX = 200
const catalogCache = new Map<string, { rows: CatalogRow[]; at: number }>()

interface CatalogRow {
  N: string
  Vo?: boolean
  C?: string
  V?: boolean
  T?: string
}

interface ChapterMeta {
  bookId: string
  chapterId: string | number
  v?: number
  vip?: number
  epub?: number
  time: string | number
}

function catalogGet(bookId: string): { rows: CatalogRow[]; at: number } | undefined {
  const hit = catalogCache.get(bookId)
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit
  if (hit) catalogCache.delete(bookId)
  return undefined
}

function catalogPut(bookId: string, rows: CatalogRow[]): void {
  // FIFO 淘汰(与 fetcher ssrfDnsCache 同款纪律)
  while (catalogCache.size >= CATALOG_CACHE_MAX) {
    const oldest = catalogCache.keys().next().value
    if (oldest === undefined) break
    catalogCache.delete(oldest)
  }
  catalogCache.set(bookId, { rows, at: Date.now() })
}

// ---------- 上游访问(在飞钳 2: 镜像站无公网 WAF 但自律限速, 防代理被打成放大器) ----------
let upstreamInflight = 0
// 简单信号量: 队列尾部等待者按 FIFO 唤醒(公平性优于忙等)
const upstreamWaiters: (() => void)[] = []

async function acquireUpstream(): Promise<void> {
  if (upstreamInflight < 2) {
    upstreamInflight++
    return
  }
  await new Promise<void>((r) => upstreamWaiters.push(r))
  upstreamInflight++
}

function releaseUpstream(): void {
  upstreamInflight = Math.max(0, upstreamInflight - 1)
  const next = upstreamWaiters.shift()
  if (next) next()
}

function upstreamHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'User-Agent': UA,
    Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
    Referer: UPSTREAM,
    ...extra,
  }
}

// ---------- C 载荷解码(与书源 xyDecodeChapter 同契约) ----------
/** "data:;base64,<b64>,{opts}" → {bookId,chapterId,time,...}; 非法/缺字段返回 null */
function decodeChapterPayload(raw: string): ChapterMeta | null {
  const text = String(raw || '')
  const m = text.match(/base64,([A-Za-z0-9+/=_%-]+)/i)
  let encoded = m ? m[1] : text
  if (!encoded) return null
  // 书源形态: b64 后可跟 ",{opts}" 后缀(逗号截断); URL-safe b64 归一化; 空白剔除(查询串中 '+' 可能被解码为空格)
  const sep = encoded.indexOf(',')
  if (sep >= 0) encoded = encoded.slice(0, sep)
  encoded = encoded.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  while (encoded.length % 4) encoded += '='
  let data: unknown
  try {
    data = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (!d.bookId || d.chapterId === undefined || d.chapterId === null || d.chapterId === '') return null
  if (!Object.prototype.hasOwnProperty.call(d, 'time') || !/^\d+$/.test(String(d.time)) || String(d.time) === '0') return null
  return { bookId: String(d.bookId), chapterId: d.chapterId as string | number, v: d.v as number | undefined, vip: d.vip as number | undefined, epub: d.epub as number | undefined, time: d.time as string | number }
}

// ---------- 核心链路: bookId+index → 目录行 → 解码 → content.php → 纯文本 ----------
type ChapterResult = { ok: true; content: string } | { ok: false; error: string }

async function fetchCatalogRows(bookId: string): Promise<{ ok: true; rows: CatalogRow[] } | { ok: false; error: string }> {
  const cached = catalogGet(bookId)
  if (cached) return { ok: true, rows: cached.rows }
  const r = await getRes(`${UPSTREAM}catalog.php?bookId=${encodeURIComponent(bookId)}`, upstreamHeaders(), UPSTREAM_TIMEOUT_MS)
  if (!r.ok) return { ok: false, error: `目录上游失败(${r.status}${r.error ? ' ' + r.error : ''})` }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: false }).decode(r.buf))
  } catch {
    return { ok: false, error: '目录响应不是 JSON(上游结构变更?)' }
  }
  const rows = (parsed as { data?: CatalogRow[] } | null)?.data
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: '目录 data 为空(书号无效/上游结构变更?)' }
  catalogPut(bookId, rows)
  return { ok: true, rows }
}

async function fetchChapter(bookId: string, index: number): Promise<ChapterResult> {
  const cat = await fetchCatalogRows(bookId)
  if (!cat.ok) return cat
  const row = cat.rows[index - 1]
  if (!row) return { ok: false, error: `index ${index} 越界(目录共 ${cat.rows.length} 行, 提示: 目录可能在采集间隙更新, 请重建目录)` }
  if (!row.C) return { ok: false, error: `index ${index} 为卷行(无章节载荷, 规则侧应以 Vo 标记过滤), 行名: ${String(row.N).slice(0, 40)}` }

  const meta = decodeChapterPayload(row.C)
  if (!meta) return { ok: false, error: '章节载荷解码失败(C 形态变更/签名过期, 请重建目录)' }

  const vip = Number(meta.v !== undefined ? meta.v : meta.vip) ? 1 : 0
  const url =
    `${UPSTREAM}content.php?bookId=${encodeURIComponent(meta.bookId)}` +
    `&chapterId=${encodeURIComponent(String(meta.chapterId))}` +
    `&t=${encodeURIComponent(String(meta.time))}` +
    `&epub=${Number(meta.epub) ? 1 : 0}&v=${vip}`

  // 凭证: 起点小程序会话(书源自订凭证机制同源), 未配置时仍请求一次以取回上游原始错误
  const creds: Record<string, string> = {}
  const ywkey = (process.env.QD_YWKEY || '').trim()
  const ywguid = (process.env.QD_YWGUID || '').trim()
  if (ywkey) creds.Ywkey = ywkey.slice(0, 256)
  if (ywguid) creds.Ywguid = ywguid.slice(0, 256)

  await acquireUpstream()
  let r
  try {
    r = await getRes(url, upstreamHeaders(creds), UPSTREAM_TIMEOUT_MS)
  } finally {
    releaseUpstream()
  }
  if (!r.ok) {
    let body = ''
    try { body = new TextDecoder('utf-8', { fatal: false }).decode(r.buf) } catch { /* ignore */ }
    if (r.status === 401 || body.includes('token')) {
      return { ok: false, error: `正文上游 401: ${body.slice(0, 120) || '缺少用户 token'} —— 需配置起点小程序凭证: 设 mini-services/qidian-proxy 环境变量 QD_YWKEY/QD_YWGUID(见服务头注释)后重启` }
    }
    return { ok: false, error: `正文上游失败(${r.status}${r.error ? ' ' + r.error : ''})${body ? ' ' + body.slice(0, 100) : ''}` }
  }

  let env: unknown
  try {
    env = JSON.parse(new TextDecoder('utf-8', { fatal: false }).decode(r.buf))
  } catch {
    return { ok: false, error: '正文响应不是 JSON(凭证失效返回了登录壳? 请检查 QD_YWKEY/QD_YWGUID)' }
  }
  // 信封契约(与书源 xyFormatContent 同口径): 错误形态 {error}|{detail}|{code,msg}; 内容形态 content|Content|Data.Content
  const o = (env && typeof env === 'object' ? env : {}) as Record<string, unknown>
  if (typeof o.error === 'string' && o.error) return { ok: false, error: `正文上游错误: ${o.error.slice(0, 140)}` }
  if (typeof o.detail === 'string' && o.detail) return { ok: false, error: `正文上游错误: ${o.detail.slice(0, 140)}` }
  if (o.code !== undefined && Number(o.code) !== 0 && typeof o.msg === 'string' && o.msg) return { ok: false, error: `正文上游错误: ${o.msg.slice(0, 140)}` }
  const data = o.Data && typeof o.Data === 'object' ? (o.Data as Record<string, unknown>) : undefined
  const raw = typeof o.content === 'string' ? o.content : typeof o.Content === 'string' ? o.Content : (data && typeof data.Content === 'string' ? data.Content : '')
  if (!raw) return { ok: false, error: '正文内容为空(上游信封无可识别 content 字段)' }
  const content = cleanContent(raw)
  if (!content) return { ok: false, error: '正文清洗后为空(全页图片/评论气泡?)' }
  return { ok: true, content }
}

// ---------- 正文清洗(htmlToText 会把 <img> 段评气泡整体剥掉, 留纯文本) ----------
function cleanContent(body: string): string {
  return htmlToText(String(body || ''))
}

// ---------- 参数校验(防呆: 只接受数字 bookId/正整数 index, 无任意 URL 抓取面 → 非开放代理) ----------
function parseParams(u: URL): { ok: true; bookId: string; index: number } | { ok: false; error: string; status: number } {
  // url= 形态 = 引擎 contentProxyUrl 钩子探测(见头注释"degrade-native"契约): 快速拒绝令引擎降级直连
  if (u.searchParams.has('url')) {
    return { ok: false, status: 400, error: 'hook 探测形态(url=)不被本代理承载 —— 本服务为 degrade-native 契约, 引擎将以原 URL(bookId+index 形态)直连重试' }
  }
  const bookId = u.searchParams.get('bookId') || ''
  const indexRaw = u.searchParams.get('index') || ''
  if (!/^\d{1,12}$/.test(bookId)) return { ok: false, status: 400, error: `bookId 必须为数字(收到: ${bookId.slice(0, 40)})` }
  const index = Number(indexRaw)
  if (!/^\d{1,7}$/.test(indexRaw) || index < 1 || index > 1_000_000) return { ok: false, status: 400, error: `index 必须为 1..1000000 整数(收到: ${indexRaw.slice(0, 20)})` }
  return { ok: true, bookId, index }
}

// ---------- 自检 + 健康探针 ----------
async function selfTestRun(): Promise<boolean> {
  try {
    const cat = await fetchCatalogRows(PROBE_BOOK_ID)
    if (!cat.ok) return false
    const first = cat.rows.find((r) => r.C && String(r.C).startsWith('data:'))
    if (!first) return false
    return decodeChapterPayload(first.C) !== null
  } catch {
    return false
  }
}
const st = { ok: false, detail: '尚未运行' }
void selfTestRun().then((ok) => {
  st.ok = ok
  st.detail = ok ? `catalog+decode OK(probe bookId=${PROBE_BOOK_ID})` : `catalog/decode 失败(probe bookId=${PROBE_BOOK_ID}, 上游 ${UPSTREAM})`
  console.log(`[qidian-proxy] selfTest: ${st.detail}`)
})

/** [R11-d-3] /health 上游探针: ranking 1 页最小请求(不打 content 免耗凭证配额) */
const healthCheck = createThrottledHealthProbe(async () => {
  const r = await getRes(
    `${UPSTREAM}ranking.php?action=ranking&site_id=11&order=11&page=1&page_size=1&category_id=0`,
    upstreamHeaders(),
    UPSTREAM_TIMEOUT_MS,
  )
  const body = r.ok ? new TextDecoder('utf-8', { fatal: false }).decode(r.buf) : ''
  return { upstreamReachable: r.ok && body.includes('"Books"'), upstream: r.status }
})

// ---------- 路由 ----------
async function handle(req: Request): Promise<Response> {
  const u = new URL(req.url)
  const p = u.pathname

  if (p === '/chapter') {
    const q = parseParams(u)
    if (!q.ok) return json({ ok: false, error: q.error }, q.status)
    try {
      const r = await fetchChapter(q.bookId, q.index)
      if (!r.ok) return json(r, 502)
      return json({ ok: true, bookId: q.bookId, index: q.index, len: r.content.length, content: r.content })
    } catch (e) {
      return json({ ok: false, error: `代理内部错误: ${String(e).slice(0, 160)}` }, 500)
    }
  }

  return json({ ok: false, error: `未知路径 ${p}(可用: /health /chapter?bookId=&index=)` }, 404)
}

// 1-c 重构口径: _shared createBridgeServer, 始终绑定 127.0.0.1; 上游两步各 20s 超时 → idleTimeout 放宽
createBridgeServer({
  name: 'qidian-proxy',
  port: PORT,
  idleTimeoutS: 120,
  selfTest: () => st.ok,
  healthCheck,
  // [R12-b-4] 凭证配置状态外露(R11-d-4 healthExtras 钩子): 正文 401 排障第一入口
  healthExtras: () => ({
    credentialsConfigured: Boolean((process.env.QD_YWKEY || '').trim() && (process.env.QD_YWGUID || '').trim()),
    catalogCache: { size: catalogCache.size, ttlMs: CATALOG_TTL_MS },
  }),
  fetch: (req) => handle(req),
})
console.log(`[qidian-proxy] upstream: ${UPSTREAM}  credentialsConfigured: ${Boolean((process.env.QD_YWKEY || '').trim() && (process.env.QD_YWGUID || '').trim())}`)
