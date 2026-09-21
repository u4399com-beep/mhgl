// 任务批量操作: start / pause / stop / delete
// start/pause/stop 逐个复用 tasks/[id]/control 真实路径(终态重置 + TaskRunner.control),
// 单个失败不中断整批, 失败项进 skipped[{name, reason}]; delete 对运行中任务跳过(isRunning 语义)
import { db } from '@/lib/db'
import { ok, fail, readBody } from '@/lib/api'
import { TaskRunner } from '@/lib/crawl/runner'
import { withGuard, errText } from '../../../_lib/http'
import { parseBatchBody, skipItem, type BatchSkippedItem } from '../../../_lib/batch'
// [R50-1] engine==='go' 时前置走 Go 引擎控制面(不可达/能力不符/ts 存储自动回退下方 TS 原路径)
import { goEngineControl } from '../_go-control'
// [R51-3-b] 删除 engine='go' 任务前先停 Go 侧(批量/单删同口径; isRunning 只反映 TS runtime)
import { goTaskControl } from '@/lib/crawl/go-engine'

const ACTIONS = ['start', 'pause', 'stop', 'delete'] as const
type BatchAction = (typeof ACTIONS)[number]

/** 终态: start 前需重置为 pending(与单条 control 路由一致) */
const FINAL_STATUSES = ['done', 'error', 'stopped']

export async function POST(req: Request) {
  return withGuard(async () => {
    const parsed = parseBatchBody(await readBody(req), [...ACTIONS])
    if (!parsed.ok) return fail(parsed.message)
    const { action, ids } = parsed
    const act = action as BatchAction
    const skipped: BatchSkippedItem[] = []
    let affected = 0

    if (act === 'delete') {
      // [R51-3-b] select 补 engine 字段: Go 任务删除前需先停 Go 侧(下方分支判定用)
      const rows = await db.task.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, engine: true } })
      const byId = new Map(rows.map((t) => [t.id, t]))
      for (const id of ids) {
        const t = byId.get(id)
        if (!t) {
          skipped.push(skipItem('任务不存在(可能已删除)'))
          continue
        }
        // 运行中任务跳过而非强停 — 与单删"先停止再删"的主动语义不同, 批量选择保护优先
        if (TaskRunner.instance.isRunning(id)) {
          skipped.push(skipItem('任务运行中, 请先停止再删除', t.name))
          continue
        }
        // [R51-3-b] engine='go' 任务: TS isRunning 只反映 TS runtime, Go 进程内运行中的任务
        //  删除前先停 Go 侧(fire-and-forget, Go 不可达时 catch 吞掉不阻断删除; 修前只删 DB 行,
        //  Go 侧继续采集+回调写库, 已删任务的全部回调撞 P2025 静默丢)
        if (t.engine === 'go') void goTaskControl(id, 'stop').catch(() => {})
        try {
          // jj-e: 删除前取消已排定的自动刷新定时器(防幽灵 timer 触发后撞 404)
          TaskRunner.instance.cancelAutoRefresh(id)
          await db.task.delete({ where: { id } })
          affected++
        } catch (e: any) {
          // tt-b: e.message 含 Prisma 查询原文/路径, 不得入信封 → errText 消毒
          skipped.push(skipItem(errText(e), t.name))
        }
      }
      return ok({ affected, skipped })
    }

    // start / pause / stop: 逐个走与单条完全相同的控制路径
    const rows = await db.task.findMany({
      where: { id: { in: ids } },
      // [R50-1] select 扩至 Go 分支所需全标量字段(引擎/模式/队列源/节奏; 与 GoControlTask 对齐)
      select: {
        id: true, name: true, status: true, engine: true,
        mode: true, bookUrl: true, bookIds: true, bookIdFrom: true, bookIdTo: true,
        listUrl: true, listStart: true, listEnd: true, bookStart: true, bookEnd: true,
        recrawlMode: true, storageMode: true,
        threadMin: true, threadMax: true, intervalMin: true, intervalMax: true,
        ruleId: true,
      },
    })
    const byId = new Map(rows.map((t) => [t.id, t]))
    for (const id of ids) {
      const t = byId.get(id)
      if (!t) {
        skipped.push(skipItem('任务不存在(可能已删除)'))
        continue
      }
      try {
        // [R50-1] Go 采集引擎分支: 仅 engine==='go' 进入(与单条 control 同一套 goEngineControl 编排);
        //  ts-fallback(不可达/能力不符/txt 存储/TS runtime 实际在跑)落回下方原 TaskRunner 路径
        if (t.engine === 'go' && (act === 'start' || act === 'pause' || act === 'stop')) {
          const go = await goEngineControl(t, act)
          if (go.kind === 'ok') {
            affected++
            continue
          }
          if (go.kind === 'fail') {
            skipped.push(skipItem(go.message, t.name))
            continue
          }
          // ts-fallback → 继续走下方原路径
        }
        // [R51-3-b] R5-7 回归修复: 终态重置移回 TaskRunner.control 成功【之后】(逐字节镜像单条
        //  control 路由的 R5-7 结构) —— 修前先 updateMany(终态→pending) 再 control, control 被拒
        //  (熔断 60s 冷却/已在运行)时 DB 已被改为 pending 但 runtime 没启动, 任务恒卡 pending。
        //  运行/暂停/停止的状态机校验在 TaskRunner.control 内(运行中 start 拒绝 / 未运行 pause 拒绝 / stop 幂等)
        const res = await TaskRunner.instance.control(id, act)
        if (!res.ok) {
          skipped.push(skipItem(res.message, t.name))
          continue
        }
        // control 成功后, 才把 done/error/stopped → pending 由 runner 置 running
        // API-1: updateMany 条件原子写(条件不满足时静默放行, runtime 已接管);
        // P2025(预检与重置间并发删除)不回滚已成功的 control —— 与单条 control 路由同口径
        if (act === 'start' && FINAL_STATUSES.includes(t.status)) {
          try {
            await db.task.updateMany({ where: { id, status: { in: FINAL_STATUSES } }, data: { status: 'pending' } })
          } catch (e: any) {
            if (e?.code !== 'P2025') throw e
          }
        }
        affected++
      } catch (e: any) {
        skipped.push(skipItem(errText(e), t.name))
      }
    }
    return ok({ affected, skipped })
  })
}
