// ============================================================
// [R51-4] TaskLog 单一写者实现(三处收敛)
// 修前三份同构: runner.log(cap 1500+R31-8-1 修剪节流) / tasks/_go-control.ts taskLog(cap 2000)
// / go-callback route taskLog(cap 2000) —— 统一为本实现: push + cap 2000 + 修剪(节流语义保留)。
// DB 形态与 level 字段语义不变(info|success|warn|error, TaskLog 表)。
// 消费方: runner.log(薄壳保签名) / _go-control.taskLog / go-callback taskLog(log kind)。
// ============================================================
import { db } from '@/lib/db'

export type TaskLogLevel = 'info' | 'success' | 'warn' | 'error'

/** 消息统一上限 2000(契约 §2 log kind 同口径; R51-4 起 runner 侧 1500 归一到 2000) */
export const TASK_LOG_MESSAGE_CAP = 2000

/** TaskLog 追加(push+cap+修剪): 创建失败静默不阻断业务链(三处修前同风格);
 *  修剪节流沿袭 runner [R31-8-1] 语义逐字节保留(见内注) */
export async function appendTaskLog(taskId: string, level: TaskLogLevel, message: string): Promise<void> {
  try {
    await db.taskLog.create({ data: { taskId, level, message: message.slice(0, TASK_LOG_MESSAGE_CAP) } })
    // [R31-8-1] 修剪检查节流(写放大修复): 原实现每条日志都 count() —— 长任务按批进度打点
    // (≈1131 批/书)时计数查询与业务写入 1:1 放大。3000 条是软水位而非硬不变量, 现按 task
    // 30s 节流: 窗口内只 create 不 count/修剪(单条超限最多多留一个窗口量, 语义不变);
    // 先置时间戳防并发重复检查。日志创建路径零变化; restore/stats 等外部写入不依赖本节流。
    // 进程级 Map 挂 globalThis 防 dev HMR 多实例, FIFO 512 防 long-run 泄漏(numberMapFifoSet 同款)
    const g18 = globalThis as unknown as { __novelLogTrimLast_v1?: Map<string, number> }
    if (!g18.__novelLogTrimLast_v1) g18.__novelLogTrimLast_v1 = new Map()
    const trimLast = g18.__novelLogTrimLast_v1
    const nowMs = Date.now()
    if (nowMs - (trimLast.get(taskId) ?? 0) < 30_000) return
    while (trimLast.size >= 512) {
      const oldest = trimLast.keys().next().value
      if (oldest === undefined) break
      trimLast.delete(oldest)
    }
    trimLast.set(taskId, nowMs)
    // 限制日志量: 保留最近3000条
    const count = await db.taskLog.count({ where: { taskId } })
    if (count > 3000) {
      const oldest = await db.taskLog.findMany({
        where: { taskId },
        orderBy: { id: 'asc' },
        take: count - 3000,
        select: { id: true },
      })
      if (oldest.length) {
        await db.taskLog.deleteMany({ where: { id: { in: oldest.map((o) => o.id) } } })
      }
    }
  } catch { /* ignore */ }
}
