// 任务详情/在线调节(线程/间隔等)/删除
import { db } from '@/lib/db'
import { ok, fail, readBody } from '@/lib/api'
import { TaskRunner } from '@/lib/crawl/runner'
import { withGuard, str, slimTaskProgressJson } from '../../../_lib/http'
import { normalizeTaskData, validateTaskPair } from '../_shared'
// [R50-1] 书号上限按 engine 取值(ts 2000 / go 100000), 三方(API/UI/范围校验)同口径
import { bookIdMaxCountForEngine } from '@/lib/book-ids'
// [R51-3-b] 删除 engine='go' 任务前先停 Go 侧(与 batch delete 同口径; isRunning 只反映 TS runtime)
import { goTaskControl } from '@/lib/crawl/go-engine'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withGuard(async () => {
    const { id } = await params
    const task = await db.task.findUnique({ where: { id }, include: { rule: true } })
    if (!task) return fail('任务不存在', 404)
    // [R31-4-1] 详情路由进度瘦身 —— 本 GET 是 TaskMonitor 唯一数据源, 以 2s 间隔轮询;
    // 修前 progress 原样返回, 大范围任务的 4 个续采 URL 集合(单集合 cap 50000)可达
    // ~12MB/响应, 2s 轮询即每分钟最高数百 MB 的 JSON 序列化/传输/前端解析(GC 压力,
    // OOM 关联)。与列表路由 R9-d-6 同口径: 超阈值(64KB)截断 URL 集合到 200 条并附带
    // progressTruncated 标记(additive), 信封与字段形态不变; 监控面板仅消费标量进度字段
    // (phase/booksDone/contentTotal 等), URL 集合零消费; 运行时续采读写走 runner 直连
    // DB, 与本瘦身完全隔离
    const slim = slimTaskProgressJson(task.progress)
    if (!slim.truncated) return ok({ ...task, live: TaskRunner.instance.isRunning(id) })
    return ok({ ...task, progress: slim.progress, progressTruncated: true, live: TaskRunner.instance.isRunning(id) })
  })
}

// 在线调节: 线程范围/间隔范围/重采模式等, 运行中也可调整
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withGuard(async () => {
    const { id } = await params
    const body = await readBody(req)
    const exist = await db.task.findUnique({ where: { id } })
    if (!exist) return fail('任务不存在', 404)

    const { data, error } = normalizeTaskData({ ...exist, ...body }, 'partial')
    if (error) return fail(error)

    // ruleId 变更时校验目标规则存在, 防FK 500
    if (body?.ruleId !== undefined) {
      const ruleId = str(body.ruleId, 64).trim()
      if (!ruleId) return fail('请选择采集规则')
      const rule = await db.rule.findUnique({ where: { id: ruleId } })
      if (!rule) return fail('规则不存在', 404)
      data.ruleId = ruleId
    }

    // R3-41: 任务运行中时禁止修改 mode/bookUrl/listUrl —— 这三个字段决定任务执行流
    // (single→单书/ Range→列表批量; bookUrl/listUrl 是采集入口)。运行中改这些字段,
    // 当前循环 loadConfig 下一批次会读到新值, 但已发现的 toc/书架可能与新 mode 不匹配
    // (例如 single→list 中途切换, 已 start 的 single 任务拿 listUrl 去解析 toc → 抛错/脏数据)。
    // 非模式字段(threadMin/intervalMin/recrawlMode 等)允许热调(运行时 loadConfig 已支持)
    const isRunning = TaskRunner.instance.isRunning(id)
    if (isRunning) {
      const modeChanged = data.mode !== undefined && data.mode !== exist.mode
      const bookUrlChanged = data.bookUrl !== undefined && data.bookUrl !== exist.bookUrl
      const listUrlChanged = data.listUrl !== undefined && data.listUrl !== exist.listUrl
      // [R34-2a-3] bookIds 同列入运行中禁改面: 它是 bookIds 模式的采集入口(队列源头), 与 bookUrl 模板同语义。
      //  以「请求体显式携带 bookIds」为准(partial 合并后 data.bookIds 恒有值, 不能作变更判据)
      const bookIdsChanged = body?.bookIds !== undefined && data.bookIds !== (exist as { bookIds?: string }).bookIds
      // [R35-2a-4] bookIdFrom/bookIdTo 同列运行中禁改面(范围形式是 bookIds 模式的另一队列源头, 与 bookIds 同语义;
      //  同样以请求体显式携带为准; schema push 前旧 client 上 exist 无该字段 → 走补丁值判变更, push 后自然对齐)
      const bookIdFromChanged =
        body?.bookIdFrom !== undefined && data.bookIdFrom !== (exist as { bookIdFrom?: string }).bookIdFrom
      const bookIdToChanged =
        body?.bookIdTo !== undefined && data.bookIdTo !== (exist as { bookIdTo?: string }).bookIdTo
      if (modeChanged || bookUrlChanged || listUrlChanged || bookIdsChanged || bookIdFromChanged || bookIdToChanged) {
        return fail('任务运行中, 无法修改模式参数, 请先停止任务', 400)
      }
    }

    // 模式与URL联动: 用"现值+补丁"合并后的生效值校验
    // [R50-1] 书号上限按合并后的 engine 传入(ts 2000 / go 100000; schema push 前旧行缺 engine → bookIdMaxCountForEngine 归 ts)
    const mergedEngine = (data.engine as string | undefined) ?? (exist as { engine?: string }).engine
    const pairErr = validateTaskPair(
      (data.mode as string) ?? exist.mode,
      (data.bookUrl as string) ?? exist.bookUrl,
      (data.listUrl as string) ?? exist.listUrl,
      // [R34-2a-3] bookIds 合并值(schema 未 push/旧列不存在时 exist 上无该字段, 走补丁值或 undefined)
      (data.bookIds as string) ?? (exist as { bookIds?: string }).bookIds,
      // [R35-2a-4] 范围端点合并值(与 bookIds 同口径; 显式携带空串可清除, '' 非 nullish 不会被 exist 值覆盖)
      (data.bookIdFrom as string | undefined) ?? (exist as { bookIdFrom?: string }).bookIdFrom,
      (data.bookIdTo as string | undefined) ?? (exist as { bookIdTo?: string }).bookIdTo,
      bookIdMaxCountForEngine(mergedEngine)
    )
    if (pairErr) return fail(pairErr)

    // FK 竞态兜底(主控z遗留项): ruleId 校验通过后规则被并发删除 → update 落 P2003 原会裸 500
    let task: Awaited<ReturnType<typeof db.task.update>>
    try {
      task = await db.task.update({ where: { id }, data })
    } catch (e: any) {
      if (e?.code === 'P2003') return fail('所选采集规则已被删除, 请刷新后重试', 409)
      if (e?.code === 'P2025') return fail('任务不存在, 请刷新后重试', 404)
      throw e
    }

    // ll-d: autoRefresh 开关交互链闭环 — PUT 显式携带 autoRefresh/refreshIntervalMin 时同步排定面:
    // ① 终态任务补开开关(或改间隔) → 立即按合并后间隔排定(原实现只在 done/error 时与进程重启
    //    recoverOnBoot 排定, 完成后才补开开关会静默失效直到下次重启);
    // ② 显式关闭 → 立即取消已排定 timer(与 DELETE/stop 语义对齐, 不再依赖触发时复核)。
    // 运行中/未终态不排定(完成时统一处理); TaskMonitor 在线调参 PUT 不含这两个字段 → 零扰动。
    if (body?.autoRefresh !== undefined || body?.refreshIntervalMin !== undefined) {
      try {
        const mergedAuto = data.autoRefresh !== undefined ? data.autoRefresh : exist.autoRefresh
        const mergedInterval = data.refreshIntervalMin !== undefined ? Number(data.refreshIntervalMin) : exist.refreshIntervalMin
        if (mergedAuto === false) {
          TaskRunner.instance.cancelAutoRefresh(id)
        } else if (['done', 'error'].includes(exist.status) && !TaskRunner.instance.isRunning(id)) {
          // R3-14: 同 recoverOnBoot/scheduleAutoRefresh 内部复核, 'stopped' 不参与自动刷新
          // (用户手动 stop 的明确意图, 排定时器拉回与意图相反)
          TaskRunner.instance.scheduleAutoRefresh(id, mergedInterval, task.name)
        }
      } catch { /* 排定面异常不影响任务更新主流程 */ }
    }

    return ok(task)
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withGuard(async () => {
    const { id } = await params
    const exist = await db.task.findUnique({ where: { id } })
    if (!exist) return fail('任务不存在', 404)
    // 运行中先发停止信号, 再删记录
    if (TaskRunner.instance.isRunning(id)) {
      await TaskRunner.instance.control(id, 'stop')
    }
    // [R51-3-b] engine='go' 任务: isRunning 只反映 TS runtime, Go 进程内运行中的任务删除前
    //  必须先停 Go 侧(fire-and-forget, Go 不可达时 catch 吞掉不阻断删除; 修前只删 DB 行,
    //  Go 侧继续采集+回调写库, 已删任务的全部回调撞 P2025 静默丢)
    if (exist.engine === 'go') void goTaskControl(id, 'stop').catch(() => {})
    // jj-e: 取消已排定的自动刷新定时器(防幽灵 timer 触发后撞 404)
    TaskRunner.instance.cancelAutoRefresh(id)
    try {
      await db.task.delete({ where: { id } })
    } catch (e: any) {
      // tt-b: 存在性预检与 delete 间的并发删除窗口原会裸 500 → 回归 404 契约
      if (e?.code === 'P2025') return fail('任务不存在, 请刷新后重试', 404)
      throw e
    }
    return ok()
  })
}
