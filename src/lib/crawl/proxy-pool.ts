// ============================================================
// [R42-1] 免费代理池 — harvester(多源抓取) + validator(并发验证) + selector(规则匹配)
// ============================================================
// 三段式流水线:
//   ① harvestProxies(): 从全网免费代理源(GitHub raw/静态 API/JSON API)抓取原始列表,
//      解析归一(protocol 归一: https→http, socks5h→socks5)后 createMany skipDuplicates 入库;
//   ② checkProxies(): 批量并发验证(curl -x 子进程, 与采集 curl 链同口径), 经 ip-api.com
//      回显出口 IP/国别, 更新 alive/健康分/延迟/国别(成功 +15 封顶 / 失败 ×0.3 衰减);
//   ③ pickProxiesForRule(): 采集规则/任务标记 needsProxy=true 且未显式配 proxyUrl 时,
//      按 国别/协议/健康分 从表内挑选, 启动前写回任务 fetchConfig.proxyUrl(持久化) →
//      既有 pickProxyFor 轮换机制原样接管(http/curl/browser/scrapling 四链全兼容)。
// 保鲜机制: ensurePoolAutoLoop() 每 60s 心跳读 Setting('proxyPool'), auto 开启时按
//   intervalMin 周期自动 harvest+check(免费代理半衰期短, 不持续补池则池子必然全灭);
//   另维护进程级 pick 快照(60s TTL)供 runner.buildFetch 同步兜底注入。
// 零直接 DB 接触: 全部走 prisma client; 无新包依赖(curl 用 child_process, 抓取用全局 fetch)。
// ============================================================

import { execFile } from 'child_process'
import { db } from '@/lib/db'

// ---------------- 源清单 ----------------

type SourceKind = 'plain' | 'proxifly' | 'geonode' | 'roosterkid'

interface ProxySource {
  id: string
  url: string
  kind: SourceKind
  /** kind=plain 时整源的固定协议; 其余 kind 从行内/JSON 解析 */
  protocol?: 'http' | 'socks5' | 'socks4'
}

/** 免费代理源(2025 活跃源; 沙箱香港出口可达; 单源失败不阻断其余源) */
export const PROXY_SOURCES: ProxySource[] = [
  { id: 'thespeedx-http', url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt', kind: 'plain', protocol: 'http' },
  { id: 'thespeedx-socks5', url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt', kind: 'plain', protocol: 'socks5' },
  { id: 'thespeedx-socks4', url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt', kind: 'plain', protocol: 'socks4' },
  { id: 'monosans-http', url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt', kind: 'plain', protocol: 'http' },
  { id: 'monosans-socks5', url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt', kind: 'plain', protocol: 'socks5' },
  { id: 'monosans-socks4', url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt', kind: 'plain', protocol: 'socks4' },
  { id: 'proxyscrape-http', url: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all', kind: 'plain', protocol: 'http' },
  { id: 'proxyscrape-socks5', url: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000', kind: 'plain', protocol: 'socks5' },
  { id: 'proxyscrape-socks4', url: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000', kind: 'plain', protocol: 'socks4' },
  // 行格式: "protocol host:port Country CountryCode anonymity"(空格分隔)
  { id: 'proxifly-all', url: 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.txt', kind: 'proxifly' },
  { id: 'mmpx12-http', url: 'https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt', kind: 'plain', protocol: 'http' },
  // 行格式: "host:port | latency | CC | anonymity | ..."(| 分隔)
  { id: 'roosterkid-https', url: 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt', kind: 'roosterkid', protocol: 'http' },
  { id: 'roosterkid-socks5', url: 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt', kind: 'roosterkid', protocol: 'socks5' },
  // JSON API(带国别元数据; 公共端点限流, 429 时该源自然跳过)
  { id: 'geonode-http', url: 'https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc&protocols=http%2Chttps', kind: 'geonode' },
  { id: 'geonode-socks', url: 'https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc&protocols=socks4%2Csocks5', kind: 'geonode' },
  { id: 'proxyspace-http', url: 'https://proxyspace.pro/http.txt', kind: 'plain', protocol: 'http' },
  { id: 'proxyspace-socks5', url: 'https://proxyspace.pro/socks5.txt', kind: 'plain', protocol: 'socks5' },
]

// ---------------- 解析 ----------------

interface ParsedProxy {
  protocol: string
  host: string
  port: number
  country?: string
  anonymity?: string
  /** 首见源标注(fetchSource 时打标) */
  source?: string
}

/** 存储协议归一: https→http(免费列表 "https" 实为支持 CONNECT 隧道的 http 代理),
 *  socks5h→socks5(fetcher scheme 白名单口径), 其余 socks4 原样; 非法协议返回 null */
function normalizeProtocol(raw: string): 'http' | 'socks5' | 'socks4' | null {
  const p = raw.trim().toLowerCase()
  if (p === 'http' || p === 'https') return 'http'
  if (p === 'socks5' || p === 'socks5h') return 'socks5'
  if (p === 'socks4' || p === 'socks4a') return 'socks4'
  return null
}

/** host:port 严格校验(IPv4/域名 + 1~65535 端口); 域名放宽到常见 TLD 形态, 防解析垃圾入库 */
function isValidHostPort(host: string, port: number): boolean {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false
  if (!host || host.length > 253) return false
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) return ipv4.slice(1).every((s) => Number(s) >= 0 && Number(s) <= 255)
  // 域名: 至少两点 + 标签字符集(纯数字标签允许但整体不能像 IPv4 已被上面分支覆盖)
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host)
}

function parseSourceBody(src: ProxySource, body: string): ParsedProxy[] {
  const out: ParsedProxy[] = []
  const lines = body.split(/\r?\n/)
  for (const line of lines) {
    const raw = line.trim()
    if (!raw || raw.startsWith('#') || raw.startsWith('//')) continue

    if (src.kind === 'plain') {
      // host:port (个别源带 scheme 前缀也容错剥掉)
      const m = /^(?:(https?|socks5h?|socks4a?):\/\/)?([\w.-]+):(\d{1,5})$/.exec(raw)
      if (!m) continue
      const protocol = m[1] ? normalizeProtocol(m[1]) : (src.protocol || null)
      const host = m[2]
      const port = Number(m[3])
      if (protocol && isValidHostPort(host, port)) out.push({ protocol, host, port })
      continue
    }

    if (src.kind === 'proxifly') {
      // "protocol host:port Country CountryCode anonymity"
      const parts = raw.split(/\s+/)
      if (parts.length < 2) continue
      const protocol = normalizeProtocol(parts[0])
      const hm = /^([\w.-]+):(\d{1,5})$/.exec(parts[1])
      if (!protocol || !hm) continue
      const host = hm[1]
      const port = Number(hm[2])
      if (!isValidHostPort(host, port)) continue
      const cc = (parts[3] || '').toUpperCase()
      out.push({ protocol, host, port, country: /^[A-Z]{2}$/.test(cc) ? cc : undefined, anonymity: parts[4] || undefined })
      continue
    }

    if (src.kind === 'roosterkid') {
      // "host:port | latency | CC | anonymity | ..."
      const seg = raw.split('|').map((s) => s.trim())
      const hm = /^([\w.-]+):(\d{1,5})$/.exec(seg[0] || '')
      if (!hm || !src.protocol) continue
      const host = hm[1]
      const port = Number(hm[2])
      if (!isValidHostPort(host, port)) continue
      const cc = (seg[2] || '').toUpperCase()
      out.push({ protocol: src.protocol, host, port, country: /^[A-Z]{2}$/.test(cc) ? cc : undefined, anonymity: seg[3] || undefined })
      continue
    }

    // geonode JSON
    // { data: [{ ip, port, protocol: ['http'] | ['socks5'], ... }] }
    try {
      const json = JSON.parse(body) as { data?: Array<{ ip?: string; port?: number | string; protocol?: string[]; anonymity?: number | string }> }
      for (const it of json.data || []) {
        if (!it || typeof it.ip !== 'string') continue
        const port = Number(it.port)
        const protoRaw = Array.isArray(it.protocol) ? it.protocol[0] : ''
        const protocol = normalizeProtocol(protoRaw)
        if (!protocol || !isValidHostPort(it.ip, port)) continue
        out.push({ protocol, host: it.ip, port, anonymity: it.anonymity != null ? String(it.anonymity) : undefined })
      }
      return out // JSON 整体解析, 不逐行
    } catch {
      return out
    }
  }
  return out
}

// ---------------- 任务状态(globalThis 防 dev HMR 丢失) ----------------

export interface HarvestResult {
  startedAt: string
  elapsedMs: number
  parsed: number
  added: number
  perSource: Array<{ id: string; ok: boolean; count: number; error?: string }>
}

export interface CheckResult {
  startedAt: string
  elapsedMs: number
  checked: number
  alive: number
  dead: number
  mode: string
}

export interface PoolJobState {
  harvesting: boolean
  checking: boolean
  harvestStartedAt?: string
  checkStartedAt?: string
  lastHarvest?: HarvestResult
  lastCheck?: CheckResult
  lastAutoTickAt?: string
  lastError?: string
}

interface PoolGlobals {
  __proxyPoolJob_v1?: PoolJobState
  __proxyPoolLoop_v1?: NodeJS.Timeout
  __proxyPoolPickCache_v1?: { pool: string; countries: string; at: number }
}
const g = globalThis as unknown as PoolGlobals

function jobState(): PoolJobState {
  if (!g.__proxyPoolJob_v1) {
    g.__proxyPoolJob_v1 = { harvesting: false, checking: false }
  }
  return g.__proxyPoolJob_v1
}

/** UI/API 读当前作业状态(进行中标志 + 最近一次结果) */
export function poolJobState(): PoolJobState {
  return { ...jobState() }
}

// ---------------- Setting(proxyPool 自动循环配置) ----------------

export interface ProxyPoolSetting {
  /** 自动保鲜循环开关(缺省开) */
  auto: boolean
  /** 自动 harvest+check 周期(分钟, 5~1440 钳制) */
  intervalMin: number
  /** 每轮自动验证条数 */
  checkBatch: number
  /** 规则匹配代理上限(fetchConfig.proxyUrl 池容量) */
  pickLimit: number
}

const DEFAULT_SETTING: ProxyPoolSetting = { auto: true, intervalMin: 30, checkBatch: 250, pickLimit: 8 }

export async function readPoolSetting(): Promise<ProxyPoolSetting> {
  try {
    const row = await db.setting.findUnique({ where: { key: 'proxyPool' } })
    if (!row) return { ...DEFAULT_SETTING }
    const v = JSON.parse(row.value) as Partial<ProxyPoolSetting>
    return {
      auto: v.auto !== false,
      intervalMin: Math.min(1440, Math.max(5, Number(v.intervalMin) || DEFAULT_SETTING.intervalMin)),
      checkBatch: Math.min(2000, Math.max(20, Number(v.checkBatch) || DEFAULT_SETTING.checkBatch)),
      pickLimit: Math.min(10, Math.max(1, Number(v.pickLimit) || DEFAULT_SETTING.pickLimit)),
    }
  } catch {
    return { ...DEFAULT_SETTING }
  }
}

// ---------------- ① harvester ----------------

async function fetchSource(src: ProxySource): Promise<ParsedProxy[]> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 20_000)
  try {
    const res = await fetch(src.url, {
      signal: ac.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', accept: '*/*' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.text()
    if (body.length > 5_000_000) throw new Error('响应体超 5MB, 疑似异常')
    return parseSourceBody(src, body).map((p) => ({ ...p, source: src.id }))
  } finally {
    clearTimeout(timer)
  }
}

/** 抓取全部源并入库(createMany skipDuplicates 幂等; 已存在条目保持既有验证数据不覆盖) */
export async function harvestProxies(): Promise<HarvestResult> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const results = await Promise.allSettled(PROXY_SOURCES.map((s) => fetchSource(s)))
  const perSource: HarvestResult['perSource'] = []
  const all = new Map<string, ParsedProxy>()
  results.forEach((r, i) => {
    const src = PROXY_SOURCES[i]
    if (r.status === 'fulfilled') {
      for (const p of r.value) {
        // 去重键跨源统一(同 host:port:protocol 多源收录只算一条, 首见源标注优先)
        const key = `${p.protocol}://${p.host}:${p.port}`
        if (!all.has(key)) all.set(key, p)
      }
      perSource.push({ id: src.id, ok: true, count: r.value.length })
    } else {
      perSource.push({ id: src.id, ok: false, count: 0, error: String((r.reason as Error)?.message || r.reason).slice(0, 120) })
    }
  })
  let added = 0
  const list = [...all.values()]
  // SQLite 变量上限: 每行 8 字段 → 批 100 行(800 变量)安全。
  // 注: Prisma createMany 的 skipDuplicates 不支持 SQLite(类型 never), 故先 findMany 查已存
  // 键过滤再 createMany(幂等; 已存在条目保持既有验证数据不被覆盖)
  for (let i = 0; i < list.length; i += 100) {
    const batch = list.slice(i, i + 100)
    const exist = await db.freeProxy.findMany({
      where: { OR: batch.map((p) => ({ protocol: p.protocol, host: p.host, port: p.port })) },
      select: { protocol: true, host: true, port: true },
    })
    const existKeys = new Set(exist.map((r) => `${r.protocol}//${r.host}:${r.port}`))
    const fresh = batch.filter((p) => !existKeys.has(`${p.protocol}//${p.host}:${p.port}`))
    if (!fresh.length) continue
    const r = await db.freeProxy.createMany({
      data: fresh.map((p) => ({
        protocol: p.protocol,
        host: p.host,
        port: p.port,
        country: p.country || '',
        anonymity: p.anonymity || '',
        source: p.source || '',
        lastError: '',
      })),
    })
    added += r.count
  }
  const result: HarvestResult = { startedAt, elapsedMs: Date.now() - t0, parsed: list.length, added, perSource }
  return result
}

// ---------------- ② validator ----------------

interface CheckOptions {
  /** unchecked(缺省)=只验未验过的; stale=全量按最旧优先(可复活死代理); alive=只刷活代理 */
  mode?: 'unchecked' | 'stale' | 'alive'
  limit?: number
  /** 只验指定国别(逗号分隔 CC) */
  countries?: string
  /** 只验指定协议(逗号分隔) */
  protocols?: string
  concurrency?: number
}

interface ValidateOutcome {
  ok: boolean
  latencyMs?: number
  country?: string
  countryName?: string
  exitIp?: string
  error?: string
}

const IPAPI_URL = 'http://ip-api.com/json/?fields=status,message,country,countryCode,query,isp'

function curlProxyCheck(proxyUrl: string, timeoutSec: number): Promise<ValidateOutcome> {
  return new Promise((resolve) => {
    const child = execFile(
      'curl',
      [
        '-sS', '--max-time', String(timeoutSec),
        '-x', proxyUrl,
        IPAPI_URL,
        '-w', '\n__POOL_T%{time_total}',
      ],
      { timeout: (timeoutSec + 3) * 1000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 },
      (err, stdout) => {
        const idx = stdout.lastIndexOf('\n__POOL_T')
        const body = idx >= 0 ? stdout.slice(0, idx) : stdout
        const tSec = idx >= 0 ? Number(stdout.slice(idx + 9)) : NaN
        if (err && !body.trim()) {
          resolve({ ok: false, error: String(err.message || err).slice(0, 160) })
          return
        }
        try {
          const json = JSON.parse(body.trim()) as { status?: string; message?: string; country?: string; countryCode?: string; query?: string }
          if (json.status !== 'success') {
            resolve({ ok: false, error: `ip-api: ${json.message || 'failed'}`.slice(0, 160) })
            return
          }
          const latencyMs = Number.isFinite(tSec) && tSec > 0 ? Math.round(tSec * 1000) : undefined
          resolve({
            ok: true,
            latencyMs: latencyMs ? Math.min(latencyMs, 60_000) : undefined,
            country: (json.countryCode || '').toUpperCase(),
            countryName: json.country || '',
            exitIp: json.query || '',
          })
        } catch {
          resolve({ ok: false, error: `响应非 JSON: ${body.trim().slice(0, 80)}` })
        }
      },
    )
    child.on('error', () => { /* err 回调已处理, 防未捕获事件 */ })
  })
}

/** 匿名度推定: 出口 IP === 代理自身 host → 透明(泄漏真实来源); 其余按 anonymous 记 */
function deriveAnonymity(existing: string, proxyHost: string, exitIp: string): string {
  if (existing) return existing
  if (exitIp && exitIp === proxyHost) return 'transparent'
  return 'anonymous'
}

async function applyCheckResult(
  row: { id: string; protocol: string; host: string; port: number; anonymity: string; healthScore: number; successCount: number; failCount: number },
  out: ValidateOutcome,
): Promise<void> {
  const now = new Date()
  const proxyUrl = `${row.protocol}://${row.host}:${row.port}`
  if (out.ok) {
    const score = Math.min(100, row.healthScore + 15)
    await db.freeProxy.update({
      where: { id: row.id },
      data: {
        alive: true,
        healthScore: score,
        successCount: { increment: 1 },
        latencyMs: out.latencyMs ?? null,
        // undefined=字段不更新(保留既有国别; ip-api 成功路径 out.country 必有值)
        country: out.country || undefined,
        countryName: out.countryName || undefined,
        exitIp: out.exitIp || '',
        anonymity: deriveAnonymity(row.anonymity, row.host, out.exitIp || ''),
        lastError: '',
        lastCheckedAt: now,
        lastSuccessAt: now,
      },
    }).catch(() => {})
  } else {
    await db.freeProxy.update({
      where: { id: row.id },
      data: {
        alive: false,
        healthScore: Math.floor(row.healthScore * 0.3),
        failCount: { increment: 1 },
        lastError: `${proxyUrl} → ${out.error || 'failed'}`.slice(0, 200),
        lastCheckedAt: now,
      },
    }).catch(() => {})
  }
}

/** 批量并发验证(curl -x 子进程; 免费代理典型存活率 2~15%, 验证是池子价值的核心) */
export async function checkProxies(opts: CheckOptions = {}): Promise<CheckResult> {
  const mode = opts.mode || 'unchecked'
  const limit = Math.min(2000, Math.max(1, opts.limit || DEFAULT_SETTING.checkBatch))
  const concurrency = Math.min(32, Math.max(1, opts.concurrency || 16))
  const countries = (opts.countries || '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s))
  const protocols = (opts.protocols || '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => ['http', 'socks5', 'socks4'].includes(s))

  const where: Record<string, unknown> = {}
  if (mode === 'unchecked') where.lastCheckedAt = null
  if (mode === 'alive') where.alive = true
  if (countries.length) where.country = { in: countries }
  if (protocols.length) where.protocol = { in: protocols }

  const candidates = await db.freeProxy.findMany({
    where,
    orderBy: mode === 'alive' ? [{ lastCheckedAt: 'asc' }, { healthScore: 'desc' }] : [{ lastCheckedAt: 'asc' }, { createdAt: 'asc' }],
    take: limit,
  })

  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  let alive = 0
  let dead = 0
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < candidates.length) {
      const row = candidates[cursor++]
      if (!row) return
      const out = await curlProxyCheck(`${row.protocol}://${row.host}:${row.port}`, 9)
      if (out.ok) alive++
      else dead++
      await applyCheckResult(row, out)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()))
  const result: CheckResult = { startedAt, elapsedMs: Date.now() - t0, checked: candidates.length, alive, dead, mode }
  return result
}

// ---------------- ③ selector(规则匹配) ----------------

export interface PickOptions {
  /** 期望出口国别(逗号分隔 CC, 空=不限) */
  proxyCountries?: string
  /** 期望协议(逗号分隔, 缺省 http,socks5,socks4) */
  proxyProtocols?: string
  /** 池容量(1~10) */
  limit?: number
  /** 健康分下限(缺省 40) */
  minScore?: number
}

/** 从池中挑选代理 → fetchConfig.proxyUrl 形态逗号串(如 "http://1.2.3.4:8080,socks5://5.6.7.8:1080");
 *  池空返回 null(调用方决定降级行为)。
 *  两段降级(R42-1e 实测校准): 先按 minScore(缺省 40) 挑, 稀缺国别(CN 等)常空 → 降级 minScore=0
 *  只要 alive(健康分降序); 健康分低只代表"历史弱", 免费代理本就间歇性可用, 交给 fetcher 侧
 *  失败冷却+轮换兜底 */
export async function pickProxiesForRule(opts: PickOptions): Promise<string | null> {
  const setting = await readPoolSetting()
  const limit = Math.min(10, Math.max(1, opts.limit || setting.pickLimit))
  const minScore = Math.min(100, Math.max(0, opts.minScore ?? 40))
  const countries = (opts.proxyCountries || '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s))
  const protocols = (opts.proxyProtocols || '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => ['http', 'socks5', 'socks4'].includes(s))

  const baseWhere: Record<string, unknown> = { alive: true }
  if (countries.length) baseWhere.country = { in: countries }
  if (protocols.length) baseWhere.protocol = { in: protocols }

  type ProxyRow = Awaited<ReturnType<typeof db.freeProxy.findMany>>[number]
  const query = (scoreGte: number): Promise<ProxyRow[]> =>
    db.freeProxy.findMany({
      where: scoreGte > 0 ? { ...baseWhere, healthScore: { gte: scoreGte } } : baseWhere,
      orderBy: [{ healthScore: 'desc' }, { lastSuccessAt: 'desc' }, { latencyMs: 'asc' }],
      take: limit * 3,
    })
  let rows = await query(minScore)
  // 两段降级: 严格健康分无果 → 只要 alive(稀缺国别存活本就少)
  if (!rows.length && minScore > 0) rows = await query(0)
  if (!rows.length) return null
  // 异构协议混排: 优先 http(采集链兼容面最广), socks5 次之; 同协议内按健康分
  const http = rows.filter((r) => r.protocol === 'http').slice(0, limit)
  const rest = rows.filter((r) => r.protocol !== 'http').slice(0, limit - http.length)
  const picked = [...http, ...rest].slice(0, limit)
  if (!picked.length) return null
  const pool = picked.map((r) => `${r.protocol}://${r.host}:${r.port}`).join(',')
  // 记录消费时间(供统计); 快照同步给 buildFetch 保险层
  const now = new Date()
  await db.freeProxy.updateMany({ where: { id: { in: picked.map((r) => r.id) } }, data: { lastUsedAt: now } }).catch(() => {})
  g.__proxyPoolPickCache_v1 = { pool, countries: countries.join(','), at: Date.now() }
  return pool
}

/** 运行时同步兜底(buildFetch 用): 60s TTL 内最近一次 pickProxiesForRule 结果 */
export function getCachedProxyPoolSnapshot(countries: string): string | null {
  const c = g.__proxyPoolPickCache_v1
  if (!c || Date.now() - c.at > 60_000) return null
  if (countries && c.countries && countries.toUpperCase() !== c.countries.toUpperCase()) return null
  return c.pool || null
}

// ---------------- 定向测试 ----------------

export interface TargetTestItem {
  proxy: string
  code: number | null
  ms: number
  ok: boolean
  error?: string
}

/** 对指定目标 URL 测池内代理可达性(定向匹配预检: 两站探活/规则校准); countries 命中优先 */
export async function testProxiesAgainstTarget(opts: { url: string; countries?: string; protocols?: string; limit?: number }): Promise<TargetTestItem[]> {
  const limit = Math.min(30, Math.max(1, opts.limit || 10))
  const countries = (opts.countries || '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s))
  const protocols = (opts.protocols || '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => ['http', 'socks5', 'socks4'].includes(s))
  const where: Record<string, unknown> = { alive: true }
  if (countries.length) where.country = { in: countries }
  if (protocols.length) where.protocol = { in: protocols }
  const rows = await db.freeProxy.findMany({
    where,
    orderBy: countries.length ? [{ healthScore: 'desc' }, { lastSuccessAt: 'desc' }] : [{ lastSuccessAt: 'desc' }],
    take: limit,
  })
  if (!rows.length) return []
  const results: TargetTestItem[] = []
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < rows.length) {
      const row = rows[cursor++]
      if (!row) return
      const proxyUrl = `${row.protocol}://${row.host}:${row.port}`
      const t0 = Date.now()
      const item: TargetTestItem = { proxy: proxyUrl, code: null, ms: 0, ok: false }
      try {
        const code = await new Promise<number | null>((resolve) => {
          execFile(
            'curl',
            ['-sS', '-o', '/dev/null', '--max-time', '15', '-x', proxyUrl, '-w', '%{http_code}', '-L', opts.url],
            { timeout: 18_000, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 },
            (err, stdout) => {
              if (err && !stdout.trim()) { resolve(null); return }
              const n = Number(stdout.trim())
              resolve(Number.isFinite(n) && n > 0 ? n : null)
            },
          )
        })
        item.ms = Date.now() - t0
        item.code = code
        item.ok = code != null && code >= 200 && code < 400
        if (!item.ok) item.error = code != null ? `HTTP ${code}` : '连接失败/超时'
      } catch (e) {
        item.ms = Date.now() - t0
        item.error = String((e as Error)?.message || e).slice(0, 120)
      }
      results.push(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(10, rows.length) }, () => worker()))
  return results.sort((a, b) => Number(b.ok) - Number(a.ok) || a.ms - b.ms)
}

// ---------------- 清理 / 统计 ----------------

/** 清理死代理: alive=false 且失败≥2 且 3 天未成功的条目 */
export async function pruneDeadProxies(): Promise<number> {
  const cutoff = new Date(Date.now() - 3 * 24 * 3600 * 1000)
  const r = await db.freeProxy.deleteMany({
    where: { alive: false, failCount: { gte: 2 }, OR: [{ lastSuccessAt: null }, { lastSuccessAt: { lt: cutoff } }] },
  })
  return r.count
}

export interface PoolStats {
  total: number
  alive: number
  unchecked: number
  avgLatency: number | null
  byCountry: Array<{ country: string; count: number }>
  byProtocol: Array<{ protocol: string; count: number }>
}

export async function poolStats(): Promise<PoolStats> {
  const [total, alive, unchecked, lat, byCountry, byProtocol] = await Promise.all([
    db.freeProxy.count(),
    db.freeProxy.count({ where: { alive: true } }),
    db.freeProxy.count({ where: { lastCheckedAt: null } }),
    db.freeProxy.aggregate({ where: { alive: true, latencyMs: { not: null } }, _avg: { latencyMs: true } }),
    db.freeProxy.groupBy({ by: ['country'], where: { alive: true }, _count: { _all: true }, orderBy: { _count: { country: 'desc' } }, take: 12 }),
    db.freeProxy.groupBy({ by: ['protocol'], where: { alive: true }, _count: { _all: true } }),
  ])
  return {
    total,
    alive,
    unchecked,
    avgLatency: lat._avg.latencyMs != null ? Math.round(lat._avg.latencyMs) : null,
    byCountry: byCountry.map((r) => ({ country: r.country || '??', count: r._count._all })),
    byProtocol: byProtocol.map((r) => ({ protocol: r.protocol, count: r._count._all })),
  }
}

// ---------------- 作业启动(fire-and-forget) ----------------

/** 启动抓取作业(已在跑则拒接; 完成后状态落 jobState) */
export function startHarvestJob(): { ok: boolean; message: string } {
  const st = jobState()
  if (st.harvesting) return { ok: false, message: '抓取作业进行中' }
  st.harvesting = true
  st.harvestStartedAt = new Date().toISOString()
  st.lastError = undefined
  harvestProxies()
    .then((r) => { st.lastHarvest = r })
    .catch((e) => { st.lastError = `harvest: ${String((e as Error)?.message || e).slice(0, 200)}` })
    .finally(() => { st.harvesting = false })
  return { ok: true, message: '抓取已启动' }
}

export function startCheckJob(opts: CheckOptions = {}): { ok: boolean; message: string } {
  const st = jobState()
  if (st.checking) return { ok: false, message: '验证作业进行中' }
  st.checking = true
  st.checkStartedAt = new Date().toISOString()
  st.lastError = undefined
  checkProxies(opts)
    .then((r) => { st.lastCheck = r })
    .catch((e) => { st.lastError = `check: ${String((e as Error)?.message || e).slice(0, 200)}` })
    .finally(() => { st.checking = false })
  return { ok: true, message: '验证已启动' }
}

// ---------------- 自动保鲜循环 ----------------

let _autoTicking = false

async function autoTick(): Promise<void> {
  if (_autoTicking) return
  const st = jobState()
  if (st.harvesting || st.checking) return
  const setting = await readPoolSetting().catch(() => ({ ...DEFAULT_SETTING }))
  if (!setting.auto) return
  const last = st.lastAutoTickAt ? Date.parse(st.lastAutoTickAt) : 0
  if (Date.now() - last < setting.intervalMin * 60_000) return
  _autoTicking = true
  try {
    st.lastAutoTickAt = new Date().toISOString()
    const hr = await harvestProxies()
    st.lastHarvest = hr
    if (hr.added > 0 || hr.parsed > 0) {
      const cr = await checkProxies({ mode: 'unchecked', limit: setting.checkBatch })
      st.lastCheck = cr
    }
  } catch (e) {
    st.lastError = `autoTick: ${String((e as Error)?.message || e).slice(0, 200)}`
  } finally {
    _autoTicking = false
  }
}

/** 挂载自动保鲜循环(幂等; 60s 心跳按 Setting 周期触发; unref 不阻进程退出)。
 *  调用点: 代理池 API 首次请求 / runner 启动 needsProxy 任务时(懒激活, dev HMR 安全) */
export function ensurePoolAutoLoop(): void {
  if (g.__proxyPoolLoop_v1) return
  const timer = setInterval(() => { void autoTick() }, 60_000)
  timer.unref?.()
  g.__proxyPoolLoop_v1 = timer
}
