// 统计
import { db } from '@/lib/db'
import { ok } from '@/lib/api'
import { TaskRunner } from '@/lib/crawl/runner'
import { logger } from '@/lib/logger'
import { withGuard, slimTaskProgressJson } from '../../_lib/http'

const globalForBoot = globalThis as unknown as { __novelBootRecovered?: boolean }

// ---------------- 时间序列辅助: 近 7 天分桶 ----------------
// 生成 [{day:'MM-DD', count:0}, ...] 共 7 项(最旧在前, 含今日, 全 0 占位)
function empty7d(): Array<{ day: string; count: number }> {
  const out: Array<{ day: string; count: number }> = []
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    out.push({ day: `${mm}-${dd}`, count: 0 })
  }
  return out
}

/**
 * R9-d-7: 近 7 天逐日计数 —— 旧实现 findMany({ select: { createdAt } }) 把 7 天内全部行的
 * createdAt 拉回内存再分桶(活跃采集周可达数十万行, 纯粹为了 count)。改为按本地自然日
 * [当日 0 点, 次日 0点) 边界做 7 次 count(输出与旧行为逐桶一致), 内存 O(1)、无需传输行数据。
 */
async function countPerDay7d(
  model: 'chapter' | 'book'
): Promise<Array<{ day: string; count: number }>> {
  const buckets = empty7d()
  // 动态模型选择: chapter/book 两表同构的 createdAt 计数, 这里用窄化接口规避 any
  type Countable = { count(args: { where: { createdAt: { gte: Date; lt: Date } } }): Promise<number> }
  const m = (model === 'chapter' ? db.chapter : db.book) as unknown as Countable
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // [R30-5-2] 7 个独立日桶 count 并行化(原逐日串行 await, 同批次往返一次拿齐; 输出逐桶一致)
  await Promise.all(
    buckets.map(async (_, idx) => {
      const i = 6 - idx
      const dayStart = new Date(today)
      dayStart.setDate(dayStart.getDate() - i)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)
      buckets[idx].count = await m.count({ where: { createdAt: { gte: dayStart, lt: dayEnd } } })
    }),
  )
  return buckets
}

export async function GET() {
  return withGuard(async () => {
    // 服务启动恢复: 曾在运行的任务转入暂停 (每个进程仅执行一次)
    if (!globalForBoot.__novelBootRecovered) {
      globalForBoot.__novelBootRecovered = true
      TaskRunner.instance.recoverOnBoot().catch(() => {})
    }

    // API-5: 仪表盘加载时顺手做一次全局 TaskLog 清理(30 天前) —— 单任务级清理已在 logs 路由做,
    // 此处兜底跨任务清理(例如已删除任务的孤儿日志、长期未访问任务的历史日志)
    try {
      await db.taskLog.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 3600 * 1000) } },
      })
    } catch { /* 清理失败不阻塞仪表盘渲染 */ }

    const [books, chapters, rules, tasks, runningTasks, sites, tags, downloads] = await Promise.all([
      db.book.count(),
      db.chapter.count(),
      db.rule.count(),
      db.task.count(),
      db.task.count({ where: { status: { in: ['running', 'paused'] } } }),
      db.site.count(),
      db.bookTag.count(),
      db.downloadJob.count(),
    ])
    // [R30-5-2] 原本逐条串行 await 的 8 个独立查询合并为一批 Promise.all —— 各项失败语义不变:
    // 基础四查询失败仍随 withGuard 抛 500; 可视化四项 .catch 记 warn 后返回 null(下方回落空数组)。
    // Dashboard 轮询热路径, 16+ 次串行往返 → 2 批。
    const [wordAgg, recentTasksRaw, recentBooks, categories, catAgg, statusRows, chapters7d, books7d, taskStatusRows] =
      await Promise.all([
        db.chapter.aggregate({ _sum: { wordCount: true } }),
        db.task.findMany({ orderBy: { updatedAt: 'desc' }, take: 6, include: { rule: { select: { name: true } } } }),
        db.book.findMany({
          orderBy: { updatedAt: 'desc' },
          take: 6,
          select: { id: true, name: true, author: true, cover: true, status: true, updatedAt: true, _count: { select: { chapters: true } } },
        }),
        // API-12: 加 take: 500 上限, 防止分类膨胀时把全表拉回(分类一般 <60, 500 足够余量)
        db.category.findMany({
          select: { id: true, name: true, _count: { select: { books: true } } },
          orderBy: { sortOrder: 'asc' },
          take: 500,
        }),
        // feat-b 可视化扩展(原各自独立 try/catch → .catch(e => { logger.warn; null }) 同语义)
        db.book
          .groupBy({ by: ['categoryId'], _sum: { wordCount: true }, where: { categoryId: { not: null } } })
          .catch((e) => (logger.warn('stats wordsByCategory failed', { err: (e as Error)?.message }), null)),
        db.book.groupBy({ by: ['status'], _count: true }).catch((e) => (logger.warn('stats booksByStatus failed', { err: (e as Error)?.message }), null)),
        countPerDay7d('chapter').catch((e) => (logger.warn('stats chaptersLast7d failed', { err: (e as Error)?.message }), null)),
        countPerDay7d('book').catch((e) => (logger.warn('stats booksLast7d failed', { err: (e as Error)?.message }), null)),
        db.task.groupBy({ by: ['status'], _count: true }).catch((e) => (logger.warn('stats taskStatusBreakdown failed', { err: (e as Error)?.message }), null)),
      ])
    // R9-d-6/7: 仪表盘 recentTasks 同款进度瘦身(单任务 progress 可达 ~12MB, 6 行原样返回
    // 会被 Dashboard 轮询周期性拖回数十 MB; 前端仅消费标量进度字段)
    const recentTasks = recentTasksRaw.map((t) => {
      const slim = slimTaskProgressJson(t.progress)
      if (!slim.truncated) return t
      return { ...t, progress: slim.progress, progressTruncated: true }
    })

    // ============= feat-b: 可视化扩展字段(查询已在上方批次并行, 此处仅做内存映射; 失败 → 空数组) =============
    // 1) 分类字数排行 — book.groupBy(categoryId, _sum wordCount) + categories 名称合并
    const wmap = new Map<string, number>()
    for (const row of catAgg || []) {
      if (row.categoryId) wmap.set(row.categoryId, row._sum.wordCount || 0)
    }
    const wordsByCategory = categories
      .map((c) => ({ name: c.name, words: wmap.get(c.id) || 0 }))
      .sort((a, b) => b.words - a.words)

    // 2) 书籍状态分布
    const booksByStatus = (statusRows || []).map((r) => ({ status: r.status, count: r._count }))

    // 3)/4) 近 7 天章节/书籍入库曲线 — R9-d-7: 逐日 count 替代全行 findMany+分桶(内存 O(1))
    const chaptersLast7d = chapters7d || empty7d()
    const booksLast7d = books7d || empty7d()

    // 5) 任务状态分布
    const taskStatusBreakdown = (taskStatusRows || []).map((r) => ({ status: r.status, count: r._count }))

    return ok({
      books, chapters, rules, tasks, runningTasks, sites, tags, downloads,
      totalWords: wordAgg._sum.wordCount || 0,
      recentTasks, recentBooks, categories,
      // feat-b 可视化字段
      wordsByCategory,
      booksByStatus,
      chaptersLast7d,
      booksLast7d,
      taskStatusBreakdown,
    })
  })
}
