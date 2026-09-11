// ============================================================
// API 层内部通用加固工具 (仅供本目录 route.ts 使用, 不会成为路由)
// 职责: 统一异常兜底 / 参数钳制 / LIKE 通配符过滤 / 路径穿越防护
// 5-a: unhandled 与 batch-item 异常改走结构化 logger (带 reqId/脱敏/分级)
// ============================================================
import { fail, BodyTooLargeError } from '@/lib/api'
import { logger } from '@/lib/logger'
import path from 'path'

/** 包裹 handler: 任何未捕获异常 → 500 信封, 不泄露内部堆栈 */
export async function withGuard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e: any) {
    // R5-5: readBody 超限 → 413 Payload Too Large (而非 500)
    if (e instanceof BodyTooLargeError) {
      return fail(`请求体过大(超过 ${(e.maxBytes / 1024 / 1024).toFixed(1)}MB 上限)`, 413)
    }
    // 5-a: 结构化日志 — err/stack/code 字段, 敏感字段自动脱敏
    logger.error('api unhandled error', {
      err: e?.message,
      stack: e?.stack?.slice(0, 500),
      code: e?.code,
    })
    return fail('服务器内部错误', 500)
  }
}

/**
 * 批量操作 skipped 项的错误文本消毒(tt-b):
 * 逐条 catch 中 Prisma 异常的 e.message 含内部细节(查询原文/schema 文件路径), 原样塞进
 * skipped.reason 会随 200 信封泄漏给客户端。此处按已知错误码转友好文案, 其余一律归
 * "操作失败"并在服务端 logger.warn 留 err/code (5-a: 结构化日志, 敏感字段自动脱敏)。
 */
export function errText(e: unknown): string {
  const code = (e as any)?.code
  if (code === 'P2025') return '记录已被删除(并发变更), 请刷新后重试'
  if (code === 'P2003') return '关联数据不存在(并发变更), 请刷新后重试'
  if (code === 'P2002') return '唯一约束冲突(数据已存在)'
  // 5-a: 结构化日志 — err/code 字段, 敏感字段自动脱敏
  logger.warn('batch item error', { err: (e as any)?.message, code: (e as any)?.code })
  return '操作失败(内部错误), 请重试'
}

/** 整数钳制: 缺失(null/undefined/'')→默认值; NaN/Infinity/越界→边界内安全值 */
export function clampInt(v: unknown, def: number, min: number, max: number): number {
  // 注意: Number(null)===0, 必须先短路缺失场景, 否则未传的分页参数会被钳成 min(如 size 变 1)
  if (v === null || v === undefined || v === '') return def
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/** 字符串安全化: 非字符串→'', 超长截断 */
export function str(v: unknown, maxLen: number): string {
  if (typeof v !== 'string') return v === null || v === undefined ? '' : String(v).slice(0, maxLen)
  return v.slice(0, maxLen)
}

/** 搜索词清洗: trim + 去除 SQLite LIKE 通配符 (% _) + 截断 */
export function likeSafe(v: unknown, maxLen = 100): string {
  return str(v, maxLen).trim().replace(/[%_\\]/g, ' ')
}

/** URL 校验: 仅允许 http/https, 返回规范化字符串或 null */
export function httpUrl(v: unknown, maxLen = 2000): string | null {
  const s = str(v, maxLen).trim()
  if (!s) return null
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    // [R12-a-1] 修复(High): new URL() 规范化会把路径中的字面 { } 强制编码为 %7B %7D,
    //  而本系统把 {page}/{offset:N} 视为合法的 URL 模板占位符(任务列表页URL/测试端点
    //  均支持) —— 编码后 runner 的 .replace('{page}', …) 匹配不到, 字面 %7Bpage%7D
    //  被原样发往源站(用户实测: pilishuwu 范围任务 0_{page}.html 存库变 0_%7Bpage%7D.html)。
    //  RFC 3986 中 { } 属于未保留集外但合法的 path 字符, new URL 的强制编码是过度编码;
    //  规范化后定向还原, 占位符模板在存库/回显/替换各环节保持原样。普通 URL 中的 %7B
    //  (真实需要编码的 {)还原为字面 { 后请求语义不变, 无回归面
    return u.toString().replace(/%7B/g, '{').replace(/%7D/g, '}')
  } catch {
    return null
  }
}

/** 是否纯对象(非数组/非null) */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * 路径穿越防护: resolve 后必须仍位于 root 目录内(含分隔符边界)。
 * 防御 ../、绝对路径、%2e%2e 解码后穿越、以及 startsWith 前缀的兄弟目录绕过 (data-x vs data)。
 * 返回解析后的绝对路径, 非法返回 null。
 */
export function safeJoin(root: string, rel: string): string | null {
  if (!rel || rel.includes('\0')) return null
  const resolved = path.resolve(root, rel)
  const prefix = path.resolve(root)
  if (resolved === prefix) return null
  if (!resolved.startsWith(prefix + path.sep)) return null
  return resolved
}

// ============================================================
// R9-d-6: 任务进度 JSON 瘦身 (列表/仪表盘视图专用)
// ============================================================
// task.progress 内含 4 个续采集合字段(discoveredBookUrls/completedBookUrls/ongoingBookUrls
// /bookLastChapters), 单集合 cap 50000 条 URL ≈ 3~5MB, 四集合合计可达 ~12MB/任务。
// 列表 API(500 行)与仪表盘 recentTasks 若原样返回, 一次轮询可拖回数百 MB JSON
// (且管理端仅消费标量进度字段, URL 集合从未被前端使用)。运行时续采数据由 runner
// 直接读写 DB, 与本瘦身影响面完全隔离。
/** 超过该长度(progress 字符串字节数)才触发解析瘦身, 小行零开销直通 */
export const TASK_PROGRESS_SLIM_THRESHOLD = 64 * 1024
/** 瘦身后每个集合保留的条数(仅截断展示冗余, 标量字段原样保留) */
export const TASK_PROGRESS_SLIM_KEEP = 200

/**
 * 任务进度 JSON 瘦身: 解析后把 4 个续采集合字段截断到 SLIM_KEEP 条。
 * 返回 { progress: 处理后的 JSON 字符串, truncated: 是否发生了截断 }。
 * 非 JSON/解析失败/未超阈值/无截断 → 原样返回(truncated=false), 调用方按需附带标记字段。
 */
export function slimTaskProgressJson(raw: string | null | undefined): { progress: string; truncated: boolean } {
  if (!raw || raw.length <= TASK_PROGRESS_SLIM_THRESHOLD) return { progress: raw || '', truncated: false }
  let p: unknown
  try {
    p = JSON.parse(raw)
  } catch {
    return { progress: raw, truncated: false } // 非 JSON(异常数据): 原样透传, 不做二次破坏
  }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { progress: raw, truncated: false }
  const obj = p as Record<string, unknown>
  let truncated = false
  for (const key of ['discoveredBookUrls', 'completedBookUrls', 'ongoingBookUrls'] as const) {
    const arr = obj[key]
    if (Array.isArray(arr) && arr.length > TASK_PROGRESS_SLIM_KEEP) {
      obj[key] = arr.slice(0, TASK_PROGRESS_SLIM_KEEP)
      truncated = true
    }
  }
  const blc = obj.bookLastChapters
  if (blc && typeof blc === 'object' && !Array.isArray(blc)) {
    const dict = blc as Record<string, unknown>
    const keys = Object.keys(dict)
    if (keys.length > TASK_PROGRESS_SLIM_KEEP) {
      const out: Record<string, unknown> = {}
      for (const k of keys.slice(0, TASK_PROGRESS_SLIM_KEEP)) out[k] = dict[k]
      obj.bookLastChapters = out
      truncated = true
    }
  }
  if (!truncated) return { progress: raw, truncated: false }
  try {
    return { progress: JSON.stringify(obj), truncated: true }
  } catch {
    return { progress: raw, truncated: false }
  }
}
