// ============================================================
// [R50-1] 采集引擎 Go 分支控制面共用编排 (tasks/[id]/control 与 tasks/batch 两路由共用)
// 契约: agent-ctx/go-engine/CONTRACT.md §1/§5/§6(唯一事实源)
// 职责: task.engine==='go' 时, start 先走 capability 校验 + storageMode txt 拒绝 +
//       Go 不可达/能力不符 → TaskLog warn 后交回调用方走原 TaskRunner 路径(ts-fallback);
//       pause/stop/resume 转发 Go 引擎并同步 DB 状态(TaskLog 习惯与 runner 控制链对齐)。
// 语义红线: engine 未设置/为 'ts' 的任务永不进入本模块(调用方判 task.engine==='go' 才调)。
// ============================================================
import { db } from '@/lib/db'
import { TaskRunner } from '@/lib/crawl/runner'
import { parseRuleConfig } from '@/lib/crawl/types'
import { goCapability, goTaskControl, goTaskStart, goTaskStatus, type GoTaskStartTask } from '@/lib/crawl/go-engine'
// [R51-4] TaskLog 三写者收敛: 本模块 taskLog 与 runner.log/go-callback 共用单实现(cap 2000+修剪)
import { appendTaskLog as taskLog } from '@/lib/crawl/task-log'

/** Task 行形态(Go 分支所需字段; Prisma Task 全标量行天然满足, batch 路由按字段白名单 select) */
export type GoControlTask = GoTaskStartTask & { name: string; status: string; ruleId: string }

export type GoControlOutcome =
  /** Go 引擎控制成功(DB 状态/日志已写), 调用方直接返回 ok */
  | { kind: 'ok' }
  /** 交回调用方走原 TaskRunner 路径: ①start 时 storageMode=txt/Go 不可达/能力不符/规则缺失
   *  (已记 TaskLog warn「回退 TS 引擎」) ②TS runner 实际持有该任务运行时(start 回退场景的
   *  pause/stop/start 控制体在 TS 侧) —— 两种情况调用方行为与 engine='ts' 完全一致 */
  | { kind: 'ts-fallback' }
  /** 直接失败(返回 fail/skipItem, 不走 TS 回退) */
  | { kind: 'fail'; message: string }

/** DB 状态写(P2025 任务并发删除时静默, 与 saveProgress 的容错口径一致) */
async function writeStatus(taskId: string, data: Record<string, unknown>): Promise<void> {
  try {
    await db.task.update({ where: { id: taskId }, data })
  } catch (e: any) {
    if (e?.code !== 'P2025') throw e
  }
}

// [R51-4] Go status 统计透传白名单(契约 §4: blocked=拦截页命中/rateLimited=429,503 收到,
// Go-owned 绝对值语义, 与 errors/coversSaved 同路 —— json_patch 绝对覆盖单语句原子;
// 键名来自白名单常量无注入面, 数值经绑定参数传递)
const GO_STATUS_STATS_KEYS = ['blocked', 'rateLimited'] as const

/** Go status → Task.stats 白名单透传(Go-owned 绝对值覆盖; json_patch 不可用时 RMW 降级,
 *  与 go-callback stats kind 的 mergeTaskJsonAtomically 同语义双通道) */
async function syncGoStatusStats(taskId: string, raw: unknown): Promise<void> {
  if (!raw || typeof raw !== 'object') return
  const s = raw as Record<string, unknown>
  const patch: Record<string, number> = {}
  for (const k of GO_STATUS_STATS_KEYS) {
    const n = Math.trunc(Number(s[k]))
    if (Number.isFinite(n)) patch[k] = n
  }
  if (Object.keys(patch).length === 0) return
  try {
    await db.$executeRawUnsafe(
      `UPDATE Task SET stats = json_patch(COALESCE(stats, '{}'), ?) WHERE id = ?`,
      JSON.stringify(patch),
      taskId,
    )
    return
  } catch {
    /* json_patch 不可用(老 SQLite)/行不存在 → RMW 降级一次(含脏 JSON 重建) */
  }
  const t = await db.task.findUnique({ where: { id: taskId }, select: { stats: true } }).catch(() => null)
  if (!t) return
  let obj: Record<string, unknown> = {}
  try {
    obj = JSON.parse(t.stats || '{}')
  } catch {
    obj = {}
  }
  await db.task.update({ where: { id: taskId }, data: { stats: JSON.stringify({ ...obj, ...patch }) } }).catch(() => {})
}

/** start 成功后的状态迁移: 与 TS 路径一致 —— 先终态条件原子重置 done/error/stopped→pending
 *  (API-1 同款 updateMany, 防并发 start 读旧终态快照覆写 running), 再就绪态→running。
 *  Go 侧运行态以其回调(status/progress)为准, 这里只落「已受理」语义 */
async function markGoStarted(taskId: string): Promise<void> {
  await db.task
    .updateMany({ where: { id: taskId, status: { in: ['done', 'error', 'stopped'] } }, data: { status: 'pending' } })
    .catch(() => {})
  await db.task
    .updateMany({ where: { id: taskId, status: { in: ['pending', 'paused', 'interrupted'] } }, data: { status: 'running' } })
    .catch(() => {})
}

/**
 * engine==='go' 任务的控制入口。act 与控制路由白名单一致('start'|'pause'|'stop')。
 */
export async function goEngineControl(task: GoControlTask, act: 'start' | 'pause' | 'stop'): Promise<GoControlOutcome> {
  const taskId = task.id

  // 0) TS runner 实际持有运行时: engine 标 'go' 但当次启动已回退 TS 引擎(Go 不可达/能力不符时
  //    的设计行为), 实际运行体在 TaskRunner —— 控制语义整体交回原路径(含终态重置/暂停门/日志习惯)
  if (TaskRunner.instance.isRunning(taskId)) return { kind: 'ts-fallback' }

  // ---------- start ----------
  if (act === 'start') {
    // 契约 §3: v1 仅 db; storageMode='txt' 直接回退 TS(不请求 Go)
    if (task.storageMode === 'txt') {
      await taskLog(taskId, 'warn', `⚠ 采集引擎为 Go 但存储模式为 TXT(仅支持 db), 本次启动回退 TS 引擎`)
      return { kind: 'ts-fallback' }
    }
    const rule = await db.rule.findUnique({ where: { id: task.ruleId }, select: { config: true } }).catch(() => null)
    if (!rule) {
      await taskLog(taskId, 'warn', '⚠ 规则读取失败, 本次启动回退 TS 引擎')
      return { kind: 'ts-fallback' }
    }
    const ruleCfg = parseRuleConfig(rule.config)
    // 契约 §6-3: start 先 capability 校验, 不符/不可达 → TaskLog warn + 回退 TS 引擎
    const cap = await goCapability(ruleCfg)
    if (!cap.ok) {
      await taskLog(taskId, 'warn', `⚠ Go 引擎能力校验未通过(${cap.reason || '未知原因'}), 本次启动回退 TS 引擎`)
      return { kind: 'ts-fallback' }
    }
    // Go 中已有该任务: running → 拒绝(与 TS 状态机同语义); 非运行(paused) → resume 断点续跑(契约 §5)
    const st = await goTaskStatus(taskId)
    if (st.ok && st.exists) {
      // [R51-4] Go-owned 观测统计(status stats.blocked/rateLimited)白名单透传进 Task.stats
      await syncGoStatusStats(taskId, st.stats)
      if (st.running) return { kind: 'fail', message: '任务已在运行中' }
      const r = await goTaskControl(taskId, 'resume')
      if (r.ok) {
        await markGoStarted(taskId)
        await taskLog(taskId, 'success', '▶ 任务已恢复运行(Go 引擎)')
        return { kind: 'ok' }
      }
      await taskLog(taskId, 'warn', `⚠ Go 引擎恢复失败(${r.reason || '未知原因'}), 本次启动回退 TS 引擎`)
      return { kind: 'ts-fallback' }
    }
    if (!st.ok && !st.fallback) {
      // Go 可达但 status 查询被明确拒绝(罕见): 不盲目回退, 直接报错由操作员决策
      return { kind: 'fail', message: `Go 引擎状态查询失败: ${st.reason || '未知原因'}` }
    }
    // st.fallback(不可达/超时) 或 !exists(Go 重启后任务态丢失, 契约 §5: 重发 start 等价断点续采)
    const startRes = await goTaskStart(task, ruleCfg)
    if (startRes.ok) {
      await markGoStarted(taskId)
      const modeLabel = task.mode === 'single' ? '单本' : task.mode === 'range' ? '范围' : task.mode === 'bookIds' ? '书号' : task.mode
      await taskLog(
        taskId,
        'success',
        `▶ 任务启动 [${task.name}] 模式:${modeLabel} 重采:${task.recrawlMode === 'full' ? '完全覆盖' : '增量更新'} 存储:数据库 线程:${task.threadMin}~${task.threadMax} 间隔:${task.intervalMin}~${task.intervalMax}ms (Go 引擎, 内存隔离进程)`,
      )
      return { kind: 'ok' }
    }
    // 409 已存在(并发 start 竞态): 再探状态转 resume; 仍失败按回退处理
    if (startRes.alreadyExists) {
      const r = await goTaskControl(taskId, 'resume')
      if (r.ok) {
        await markGoStarted(taskId)
        await taskLog(taskId, 'success', '▶ 任务已恢复运行(Go 引擎)')
        return { kind: 'ok' }
      }
      return { kind: 'fail', message: `Go 引擎中已存在该任务且恢复失败: ${r.reason || '未知原因'}` }
    }
    await taskLog(taskId, 'warn', `⚠ Go 引擎启动失败(${startRes.reason || '未知原因'}), 本次启动回退 TS 引擎`)
    return { kind: 'ts-fallback' }
  }

  // ---------- pause ----------
  if (act === 'pause') {
    const r = await goTaskControl(taskId, 'pause')
    if (r.ok) {
      // 与 TS 路径同语义: running → paused(条件写, 不覆写并发 stop 的终态)
      await db.task
        .updateMany({ where: { id: taskId, status: 'running' }, data: { status: 'paused' } })
        .catch(() => {})
      await taskLog(taskId, 'warn', '⏸ 任务已暂停(Go 引擎, 在飞批次完成后挂起)')
      return { kind: 'ok' }
    }
    await taskLog(taskId, 'warn', `⚠ Go 引擎暂停失败: ${r.reason || '未知原因'}`)
    // [R51-3-b] Go 不可达(网络层 fallback)时交回 TS 原路径, 与 start 回退语义对齐 ——
    //  修前恒 fail: 控制体实际在 TS 侧(start 回退场景的任务)无法暂停, DB 卡死 running 只能等
    //  5min ghost sweeper 兑底
    if (!r.ok && r.fallback) return { kind: 'ts-fallback' }
    return { kind: 'fail', message: r.reason || 'Go 引擎暂停失败' }
  }

  // ---------- stop ----------
  const r = await goTaskControl(taskId, 'stop')
  if (r.ok) {
    // jj-e 语义对齐: 手动停止取消已排定的自动刷新(防幽灵 timer 拉起 Go 任务)
    TaskRunner.instance.cancelAutoRefresh(taskId)
    await writeStatus(taskId, { status: 'stopped' })
    await taskLog(taskId, 'warn', '⏹ 任务已停止(Go 引擎, 自动刷新已取消)')
    return { kind: 'ok' }
  }
  await taskLog(taskId, 'warn', `⚠ Go 引擎停止失败: ${r.reason || '未知原因'}`)
  // [R51-3-b] Go 不可达(网络层 fallback)时交回 TS 原路径, 与 start/pause 回退语义对齐 ——
  //  修前恒 fail: TS 侧运行的任务无法停止(DB 卡 running), 且 stop 是终态操作应尽量达成
  if (!r.ok && r.fallback) return { kind: 'ts-fallback' }
  return { kind: 'fail', message: r.reason || 'Go 引擎停止失败' }
}
