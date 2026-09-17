// 采集任务 CRUD
import { db } from '@/lib/db'
import { ok, fail, readBody } from '@/lib/api'
import { withGuard, str, slimTaskProgressJson } from '../../_lib/http'
import { normalizeTaskData, validateTaskPair, TASK_STATUSES, type NormalizedTask } from './_shared'

export async function GET(req: Request) {
  return withGuard(async () => {
    const url = new URL(req.url)
    const status = str(url.searchParams.get('status'), 20).trim()
    // 状态白名单过滤: 非法值忽略(不报错, 保持列表可用)
    const validStatus = (TASK_STATUSES as readonly string[]).includes(status) ? status : undefined
    const tasks = await db.task.findMany({
      where: validStatus ? { status: validStatus } : undefined,
      orderBy: { updatedAt: 'desc' },
      include: { rule: { select: { id: true, name: true } } },
      // API-12: 加 take: 500 上限, 防止任务表无限膨胀拉回内存
      take: 500,
    })
    // R9-d-6: 列表视图进度瘦身 —— 大范围任务的 progress 内含最多 4×50000 条续采 URL
    // (~12MB/任务), 500 行原样返回单次响应可达数百 MB, 且管理端列表/监控仅消费标量进度
    // 字段。超阈值(64KB)的行截断 URL 集合到 200 条并附带 progressTruncated 标记(可增字段,
    // 响应结构不变); 运行时续采读写走 runner 直连 DB, 不受影响。任务详情 [id] 路由仍返回全量
    const slimmed = tasks.map((t) => {
      const slim = slimTaskProgressJson(t.progress)
      if (!slim.truncated) return t
      return { ...t, progress: slim.progress, progressTruncated: true }
    })
    return ok(slimmed)
  })
}

export async function POST(req: Request) {
  return withGuard(async () => {
    const body = await readBody(req)

    const ruleId = str(body?.ruleId, 64).trim()
    if (!ruleId) return fail('请选择采集规则')
    const rule = await db.rule.findUnique({ where: { id: ruleId } })
    if (!rule) return fail('规则不存在', 404)

    const { data, error } = normalizeTaskData(body ?? {}, 'full')
    if (error) return fail(error)
    // [R34-2a-3] 书号模式联动校验: 传入规范化后的 bookIds(模式为 single/range 时本参不参与校验)
    const pairErr = validateTaskPair(data.mode, data.bookUrl, data.listUrl, data.bookIds)
    if (pairErr) return fail(pairErr)

    // full 模式下所有字段均已规范化
    // FK 竞态兜底(主控z遗留项): ruleId 校验通过后规则被并发删除 → create 落 P2003 原会裸 500
    try {
      const task = await db.task.create({
        data: { ...(data as NormalizedTask), ruleId },
      })
      return ok(task)
    } catch (e: any) {
      if (e?.code === 'P2003') return fail('所选采集规则已被删除, 请刷新后重试', 409)
      throw e
    }
  })
}
