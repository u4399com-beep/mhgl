// ============================================================
// [R31-3] 孤儿任务恢复机制(服务重启后 running 僵尸任务收容)
// ============================================================
// 背景(R31-0-2/-3): dev server 连续两轮 OOM 被杀(next-server 2.33/2.38GB), 用户在跑的
// 采集任务随进程死亡, DB 中滞留 status='running' 成僵尸(无心跳), 无声无息无任何标记。
// runner.recoverOnBoot(stats API 懒触发)/ghost sweeper(5min 轮)虽有兜底, 但都依赖
// TaskRunner 单例被使用后才挂载; instrumentation.register() 才是启动期统一收口点。
//
// 状态值决策(红线: 严禁改 prisma/schema.prisma):
//  - Task.status 在 schema 中为 `String @default("pending")`(非 Prisma enum, 自由串),
//    现有取值: pending | running | paused | stopped | done | error(runner.ts 状态机)。
//  - 依任务口径: String 类型 → 直接采用新值 'interrupted'(中断态), schema 零改动。
//  - 下游消费面影响(已逐一核实, 均为优雅降级不崩溃, 移交主控/D-agent 补展示):
//    · TasksSection.tsx / TaskMonitor.tsx / Dashboard.tsx 徽章取 TASK_STATUS_META[status]
//      未知值回退 `|| TASK_STATUS_META.pending`(灰牌, 不崩); canStart=status!=='running'
//      恒为 true → 用户可正常手动重跑(断点续采由现有增量模式承接)。
//    · 备份恢复 route normalizeRestoredTaskStatus 白名单外值 → 归一 'pending' + warning(不崩)。
//    · stats 路由"活跃任务"计数只统计 running/paused, interrupted 不计入(符合终态语义)。
//
// 红线声明:
//  - 只做"标记中断", 不自动恢复运行(断点续采由用户手动重跑, 现有增量模式支持);
//  - 不删除任何数据(任务行/进度/日志全部保留);
//  - 幂等: 重复调用无害(once-per-process 成功标志 + 条件更新只命中 status='running' 行,
//    已中断行不再匹配; TaskLog 仅在行真实翻转时写一条, 重复调用不产生重复日志);
//  - 并行安全: 仅标记"本进程未注册在跑"的任务 —— runner 的在跑注册表为
//    TaskRunner.runtimes(private), 经 globalThis 单例槽 `__novelTaskRunner` 探测其
//    isRunning(taskId)(runner.ts 用同款 globalThis 槽存放单例)。本进程内在跑任务必然
//    已创建 TaskRunner 单例(control('start') 同步置 rt.running 先于 DB 状态写), 探测命中
//    即跳过; 单例不存在时(启动期常态)本进程必然无在跑任务 → 逐一标记是安全的。
//    写入用 updateMany 条件更新(where: {id, status:'running'}), 窄化 check-then-act 窗口:
//    并发 control(stop/pause) 已把状态改为非 running 时本更新不命中, 不覆盖操作员意图。
//  - 启动时间窗([R34-2b-4], 双进程共享 SQLite 的保守防护): 恢复仅命中 updatedAt 早于
//    「本进程模块加载时刻 - 10s」的行 —— register() 调用期进程内必无在跑任务(见上),
//    单进程形态下任意 running 行的最后一次写入必然早于本进程启动(前一进程已死),
//    窗口恒空转, 行为逐字节不变; 双进程共享同一 SQLite 文件时(后启进程仪表盘/第二个
//    dev 实例), 另一进程正在跑的任务会在窗口内持续刷新 updatedAt 而被跳过, 不再被误标
//    interrupted。窗口取 10s 与 runner.recoverOnBoot 的 createdAt-10s 宽限同源: 进程内
//    一次成功采集循环对任务行的写入间隔远小于 10s, 而僵尸(前一进程死亡)的最后写入必然
//    早于重启(watchdog 检测+拉起 ≥30s)。保守取舍(如实留档): 窗口只覆盖启动前 10s 内
//    仍在写入的任务, 若「另一进程恰好启动前 >10s 未写任务行但仍在跑」(如长渲染阶段)
//    仍可能被误标 —— 该形态下单进程是主要部署形态, 引入心跳/进程归属语义跨面过大,
//    取 10s 最小干预面; 被误标任务的断点数据完好, 点启动即续采, 损害有界。
// ============================================================
import { db } from '@/lib/db'

/** [R31-3] 中断态状态值(Task.status 为自由 String, 非 Prisma enum, 决策依据见文件头) */
export const ORPHAN_INTERRUPTED_STATUS = 'interrupted'

/** runner 单例结构探测面(仅 isRunning; 与 runner.ts globalForRunner 槽同名同形) */
interface RunnerRegistryProbe {
  isRunning?: (taskId: string) => boolean
}

/** [R31-3] 进度快照提取面: 只取 phase/current 两个展示字段(全量 progress 本就留在任务行不删) */
interface OrphanProgressSnapshot {
  phase?: unknown
  currentBook?: unknown
}

const globalForRecovery = globalThis as unknown as {
  /** 本进程已成功完成一轮恢复(Bug-8 同款先例: 仅成功后置位, 失败留待下次调用重试) */
  __novelOrphanRecoveryDone_v1?: boolean
  /** runner.ts 的 TaskRunner 单例槽(探测进程内在跑任务注册表, 不 import runner 防耦合) */
  __novelTaskRunner?: RunnerRegistryProbe
}

// [R34-2b-4] 进程启动锚点: 本模块被 instrumentation.register() 动态 import(先于任何请求
// 受理), 模块求值时刻即进程启动期的可靠近似; 固定于模块加载时刻(后续手动调用不重算)
const RECOVERY_BOOT_AT = Date.now()
/** 启动时间窗宽限(与 runner.recoverOnBoot 的 createdAt-10s 同源, 依据见文件头) */
const ORPHAN_BOOT_WINDOW_MS = 10_000

export interface RecoverOrphanTasksResult {
  /** 扫到的 status='running' 行数 */
  scanned: number
  /** 实际翻转为 interrupted 的行数(=新增 TaskLog 条数) */
  recovered: number
  /** 因本进程注册表显示在跑而跳过的行数 */
  skippedInProcess: number
  /** 本进程已执行过一轮(直接短路返回) */
  alreadyDone: boolean
}

/** [R31-3] 进度快照安全解析(脏 JSON/类型不符逐字段降级, 永不抛) */
function parseProgressSnapshot(raw: string | null | undefined): OrphanProgressSnapshot {
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw) as OrphanProgressSnapshot
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}

/** [R31-3] 进度快照展示串(phase/currentBook 均非串/超长时截断降级) */
function snapshotLabel(snap: OrphanProgressSnapshot): string {
  const phase = typeof snap.phase === 'string' && snap.phase ? snap.phase.slice(0, 40) : '未知'
  const current = typeof snap.currentBook === 'string' && snap.currentBook ? snap.currentBook.slice(0, 120) : ''
  return current ? `phase=${phase} current=${current}` : `phase=${phase} current=无`
}

/**
 * [R31-3] 孤儿任务恢复: 把 status='running' 且本进程未注册在跑的任务标记为 'interrupted',
 * 并逐任务落一条 warn 级 TaskLog(消息含"服务重启导致任务中断"与进度快照 phase/current)。
 *
 * 调用时机: src/instrumentation.ts register()(Next.js 启动期, 服务请求尚未受理, 进程内
 * 必无在跑任务); 亦可手动/测试调用 —— 幂等, 重复调用第二次起直接短路(alreadyDone)。
 * 恢复失败( DB 故障等)由调用方吞异常, 不得阻碍服务启动。
 *
 * 不自动恢复运行(红线): 只标记中断; 用户在后台点击"启动/继续"即可手动断点续采
 * (增量模式自动跳过已采内容 —— rt 续采集合由 task.progress 重建, 见 runner.executeTask)。
 */
export async function recoverOrphanTasks(): Promise<RecoverOrphanTasksResult> {
  const result: RecoverOrphanTasksResult = { scanned: 0, recovered: 0, skippedInProcess: 0, alreadyDone: false }
  if (globalForRecovery.__novelOrphanRecoveryDone_v1) {
    result.alreadyDone = true
    return result
  }
  // 在跑注册表探测: 单例在 → 委托 isRunning(结构与 TaskRunner.isRunning 同形)。
  // 探针异常向上传播放弃本轮恢复(fail-safe): 宁可把僵尸留给下一轮重试, 也不在
  // "无法确认是否在跑"时盲目翻转 —— 防运行期调用(或探针故障)误伤真实在跑任务。
  // 注: 启动期常态是单例不存在(undefined?.() === undefined → false), 正常路径不受影响
  const isRunningInProcess = (taskId: string): boolean =>
    globalForRecovery.__novelTaskRunner?.isRunning?.(taskId) || false
  // 单轮扫描上限(防御性钳制: 正常僵尸数 ≤ 用户任务数; 万一脏数据灌满, 分批多轮消化,
  // 每轮行集有界防内存峰值 —— 本函数在启动路径上运行)
  const ORPHAN_SCAN_TAKE = 1000
  const rows = await db.task.findMany({
    where: {
      status: 'running',
      // [R34-2b-4] 启动时间窗: 仅收容「本进程启动前」最后一次写入的行(带 10s 宽限),
      // 防双进程共享 SQLite 时误标另一进程的在跑任务(语义与依据见文件头; 单进程形态
      // 下该过滤恒全量命中, 行为逐字节不变)
      updatedAt: { lt: new Date(RECOVERY_BOOT_AT - ORPHAN_BOOT_WINDOW_MS) },
    },
    select: { id: true, progress: true },
    orderBy: { updatedAt: 'asc' }, // 最久无心跳的僵尸最先收容
    take: ORPHAN_SCAN_TAKE,
  })
  result.scanned = rows.length
  for (const t of rows) {
    // 并行安全闸: 本进程注册表显示在跑(刚被 control('start') 拉起) → 不动
    if (isRunningInProcess(t.id)) {
      result.skippedInProcess++
      continue
    }
    // 条件更新窄化竞态: 仅当行仍处于 running 时翻转 —— 期间被 stop/pause/删除的操作
    // 均不命中(updateMany 返回 count=0), 不覆盖操作员意图、不产生幽灵日志
    const upd = await db.task.updateMany({
      where: { id: t.id, status: 'running' },
      data: { status: ORPHAN_INTERRUPTED_STATUS },
    })
    if (upd.count !== 1) continue // 已被并发操作改写/删除: 放弃本行(幂等, 下轮不再匹配)
    result.recovered++
    const snap = parseProgressSnapshot(t.progress)
    // 消息口径: 必含"服务重启导致任务中断" + 进度快照 phase/current; 上限 1500 与 runner.log 同款
    const message =
      `服务重启导致任务中断(孤儿恢复, 不自动重启): ${snapshotLabel(snap)}; ` +
      `进度快照已保留在任务中, 断点续采请手动点击启动(增量模式自动跳过已采内容)`
    try {
      await db.taskLog.create({
        data: { taskId: t.id, level: 'warn', message: message.slice(0, 1500) },
      })
    } catch {
      // 日志写入失败不回滚状态翻转(标记本身已达成"僵尸可见化"目标), 交给外层统计
    }
  }
  // Bug-8 同款先例(runner.recoverOnBoot): 全部成功后才置位; 中途抛错则不置位,
  // 留待下次调用(服务重启/手动)重试
  globalForRecovery.__novelOrphanRecoveryDone_v1 = true
  return result
}
