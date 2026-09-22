// ============================================================
// [R50-1] Go 采集引擎控制面客户端 (mini-services/crawler-go, 127.0.0.1:3032)
// 契约: agent-ctx/go-engine/CONTRACT.md §1/§2/§3(唯一事实源)
// 职责: Next.js → Go 控制面(health / capability / task-start / task-control / task-status)
//       持久化方向(Go → Next.js)走 POST /api/admin/tasks/go-callback 回调路由, 不在本模块。
// 容错口径: Go 不可达 / 响应异常 / 能力不符 → 统一返回 { ok:false, fallback:true, reason };
//       fallback=true 语义 = 调用方(控制路由)应回退 TS 引擎 TaskRunner 原路径并记 TaskLog warn。
// 网络路径: 后端对后端直连 127.0.0.1, 不经 Caddy 网关(契约 §0), 无需 XTransformPort。
// ============================================================
import { timingSafeEqual } from 'node:crypto'
import type { RuleConfig } from './types'
import { parseBookIdList } from '@/lib/book-ids'

/** Go 服务基址: env GO_ENGINE_URL 可覆盖(缺省契约固定 127.0.0.1:3032) */
const GO_ENGINE_BASE = (process.env.GO_ENGINE_URL || 'http://127.0.0.1:3032').replace(/\/+$/, '')

/** 回调共享密钥(契约 §2): env GO_CALLBACK_SECRET 可覆盖, 缺省固定值与 Go 侧同口径。
 *  消费方: goTaskStart 下发 callback.secret / go-callback 回调路由 403 兜底校验 */
export const GO_CALLBACK_SECRET = process.env.GO_CALLBACK_SECRET || 'go-cb-2025-mhgl'

/** 回调 baseUrl(契约 §3 TaskStartPayload.callback.baseUrl): Go 侧拼固定路径
 *  /api/admin/tasks/go-callback(契约 §2), env GO_CALLBACK_BASE_URL 可覆盖(缺省本机 dev server) */
export const GO_CALLBACK_BASE_URL = (process.env.GO_CALLBACK_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '')

/** 控制面(capability/control/status/health)超时 3s(契约 §6-2) */
const CONTROL_TIMEOUT_MS = 3_000
/** task/start 超时 10s(契约 §6-2; Go 侧 start 仅注册任务应快速返回) */
const START_TIMEOUT_MS = 10_000

/** 统一结果形态: ok=false 时 fallback=true 表示"应回退 TS 引擎", false 表示 Go 明确拒绝(不回退)。
 *  [R54] notFound=true 表示目标任务在引擎中不存在(404, 引擎重启后任务态丢失), 供控制面判定
 *  "引擎侧已无运行体"—— stop/pause 语义可直接达成, 无需 fail 卡死或回退 TS */
export interface GoResult {
  ok: boolean
  fallback?: boolean
  notFound?: boolean
  reason?: string
}

/** TaskStartPayload.task 段(契约 §3): 从 Task 行提取的编排入参 */
export interface GoTaskStartTask {
  id: string
  mode: string
  bookUrl: string
  bookIds: string
  bookIdFrom: string
  bookIdTo: string
  listUrl: string
  listStart: number
  listEnd: number
  bookStart: number
  bookEnd: number
  recrawlMode: string
  storageMode: string
  threadMin: number
  threadMax: number
  intervalMin: number
  intervalMax: number
}

/** 组装 TaskStartPayload(契约 §3): task 段 + 完整 RuleConfig + callback 段。
 *  bookIds 列表形态已展开去重(parseBookIdList 同口径), 范围形态传端点原串(与列表互斥由 API 层执法) */
export function buildTaskStartPayload(task: GoTaskStartTask, rule: RuleConfig) {
  return {
    task: {
      id: task.id,
      mode: task.mode,
      bookUrl: task.bookUrl,
      // 契约 §3: bookIds 模式-列表形态(已展开去重); 非 bookIds 模式/范围形态传空数组
      bookIds: task.mode === 'bookIds' && !(task.bookIdFrom && task.bookIdTo) ? parseBookIdList(task.bookIds) : [],
      bookIdFrom: task.bookIdFrom || undefined,
      bookIdTo: task.bookIdTo || undefined,
      listUrl: task.listUrl || undefined,
      listStart: task.listStart,
      listEnd: task.listEnd,
      bookStart: task.bookStart,
      bookEnd: task.bookEnd,
      recrawlMode: task.recrawlMode === 'full' ? 'full' : 'incremental',
      // 契约 §3: v1 仅 db; txt 由控制路由在调用本模块前拒绝(回退 TS)
      storageMode: 'db' as const,
      threadMin: task.threadMin,
      threadMax: task.threadMax,
      intervalMin: task.intervalMin,
      intervalMax: task.intervalMax,
    },
    rule,
    callback: {
      baseUrl: GO_CALLBACK_BASE_URL,
      secret: GO_CALLBACK_SECRET,
    },
  }
}

/** 带超时 fetch + 统一容错: 网络层失败(不可达/超时/非 JSON)→ fallback:true; Go 明确 {ok:false} → fallback:false */
async function goFetch(path: string, init: RequestInit | undefined, timeoutMs: number): Promise<GoResult & Record<string, any>> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(`${GO_ENGINE_BASE}${path}`, {
      ...init,
      signal: ac.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      cache: 'no-store',
    })
    let body: any = null
    try {
      body = await res.json()
    } catch {
      return { ok: false, fallback: true, reason: `Go 引擎响应异常(HTTP ${res.status}, 非 JSON)` }
    }
    if (!res.ok || body?.ok === false) {
      // 409(task already exists)属业务态, 非引擎故障, 不标记 fallback(调用方转 resume)
      const alreadyExists = res.status === 409
      // [R54] 404(任务在引擎中不存在)同属业务态: 不标记 fallback(不应回退 TS), 单独打标供
      //       控制面按"引擎侧已无运行体"收口(R53 遗留①: 修前 stop 撞 404 恒 fail)
      const notFound = res.status === 404
      return {
        ok: false,
        fallback: alreadyExists || notFound ? false : res.status >= 500,
        alreadyExists,
        notFound,
        reason: String(body?.error || `Go 引擎返回 HTTP ${res.status}`),
      }
    }
    return { ok: true, ...(body && typeof body === 'object' ? body : {}) }
  } catch (e: any) {
    const aborted = e?.name === 'AbortError'
    return {
      ok: false,
      fallback: true,
      reason: aborted ? `Go 引擎请求超时(${timeoutMs}ms)` : `Go 引擎不可达: ${String(e?.message || e).slice(0, 120)}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

/** GET /health(契约 §1): 健康检查(运行任务数/RSS/uptime) */
export async function goHealth(): Promise<GoResult & { engine?: string; version?: string; tasks?: { running: number; paused: number }; rssMB?: number; uptimeMs?: number }> {
  return goFetch('/health', { method: 'GET' }, CONTROL_TIMEOUT_MS)
}

/** POST /capability(契约 §1/§4): 规则子集校验 —— unsupported 非空 = 规则含 Go 不支持的能力
 *  (xpath/browser 引擎/scrapling 等), 归一为 fallback:true 由调用方回退 TS 引擎 */
export async function goCapability(rule: RuleConfig): Promise<GoResult & { unsupported?: string[] }> {
  const r = await goFetch('/capability', { method: 'POST', body: JSON.stringify(rule) }, CONTROL_TIMEOUT_MS)
  if (r.ok && Array.isArray(r.unsupported) && r.unsupported.length > 0) {
    return { ok: false, fallback: true, unsupported: r.unsupported, reason: `规则含 Go 引擎不支持的能力: ${r.unsupported.join(', ')}` }
  }
  return r as GoResult & { unsupported?: string[] }
}

/** POST /task/start(契约 §1/§3): 注册并启动任务; 409 = Go 中已存在同 id 任务(alreadyExists, 调用方转 resume) */
export async function goTaskStart(task: GoTaskStartTask, rule: RuleConfig): Promise<GoResult & { alreadyExists?: boolean }> {
  return goFetch('/task/start', { method: 'POST', body: JSON.stringify(buildTaskStartPayload(task, rule)) }, START_TIMEOUT_MS)
}

/** POST /task/{id}/control(契约 §1): pause=跑完在飞批次后挂起 / resume=断点续跑 / stop=终止并移除 */
export async function goTaskControl(id: string, action: 'pause' | 'resume' | 'stop'): Promise<GoResult & { status?: string }> {
  return goFetch(`/task/${encodeURIComponent(id)}/control`, { method: 'POST', body: JSON.stringify({ action }) }, CONTROL_TIMEOUT_MS)
}

/** GET /task/{id}/status(契约 §1): 任务在 Go 中的运行态(不存在时 exists=false, 非错误)。
 *  [R51-4] stats 透传: 契约 §4 status 响应 stats 含 Go-owned 绝对值字段(blocked=拦截页命中数/
 *  rateLimited=429,503 收到数), 调用方可将白名单键绝对值覆盖合并进 Task.stats(与 errors/
 *  coversSaved 同路); 其余键(booksCreated 等权威在 Next.js)不透传 */
export async function goTaskStatus(id: string): Promise<GoResult & { exists?: boolean; running?: boolean; phase?: string; rssMB?: number; startedAtMs?: number; lastError?: string; stats?: { blocked?: number; rateLimited?: number } }> {
  return goFetch(`/task/${encodeURIComponent(id)}/status`, { method: 'GET' }, CONTROL_TIMEOUT_MS)
}

/** 回调共享密钥校验(timingSafeEqual 防时序侧信道): go-callback 路由 403 兜底用。
 *  密钥口径与 goTaskStart 下发的 callback.secret 一致(env GO_CALLBACK_SECRET, 缺省 go-cb-2025-mhgl) */
export function verifyGoCallbackSecret(headerVal: string | null | undefined): boolean {
  if (!headerVal) return false
  const a = Buffer.from(headerVal)
  const b = Buffer.from(GO_CALLBACK_SECRET)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
