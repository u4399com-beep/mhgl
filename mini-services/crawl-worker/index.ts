// ============================================================
// [R49-10] crawl-worker — 采集引擎独立进程(mini-service, 端口 3018)
// ------------------------------------------------------------
// 背景(为什么要把采集器从 Next dev server 拆出来):
//   R48-2 实测 dev 基线(Turbopack 按需编译缓存+Prisma)把 next-server 稳态推到 1.7~1.8GB,
//   R49-10 复测一次 GET / 即 +1.34GB(单路由打包管理壳+前台全模块图), 空闲漂移至 ~1.9GB。
//   采集护栏线(halt 1950)被迫架在基线上方 50~150MB 处 —— 采集与浏览器一点忙就互相踩熔断,
//   任务反复「硬熔断 3/3 → 自动暂停 → 内存回落续采」震荡。
//   根治 = 进程解耦: 采集引擎在本进程以 --smol 独立运行(JSC GC + 基线 ~150MB), 护栏线
//   (soft 350/halt 650/resume 550)按自身基线标定, 熔断只反映采集自身压力, 与 dev server
//   的 Turbopack 内存彻底脱钩。src/lib/crawl/* 零 Next 依赖(实测 import 面全查), 直搬即用。
// 接口(HTTP, 仅 127.0.0.1 —— Next API 路由服务端代理转发, 客户端不直连):
//   GET  /health                      → { ok, runtimes:{activeTasks,runtimes}, memory, uptime }
//   GET  /is-running?taskId=          → { running: boolean }
//   POST /control {taskId, action}    → TaskRunner.control → { ok, message }
//   POST /auto-refresh/schedule       → { taskId, delayMin, taskName }
//   POST /auto-refresh/cancel         → { taskId }
// 自举: recoverOrphanTasks(孤儿 running→interrupted) + runner.recoverOnBoot(终态重排定 +
//   paused 回收) + isRunning 懒触发 ensureMemHaltResumeScan(熔断暂停锚点扫回, 与 Next 侧
//   R49-8-2 同机制迁入本进程)。
// 内存护栏 fetcher env(按本进程基线标定, 非 dev server 的 1550/1900):
//   FETCH_RSS_SOFT_MB=350 FETCH_RSS_HALT_MB=650 FETCH_RSS_RESUME_MB=550 FETCH_RSS_STOP_MB=800
// 运维: bun run dev (cwd=项目根 —— storage.ts DATA_ROOT=process.cwd()/data 封面/txt 落盘
//   必须与 Next 同根; @prisma/client 与 SQLite 路径按文件位置解析不受 cwd 影响)
// ============================================================
import { TaskRunner } from '../../src/lib/crawl/runner'
import { recoverOrphanTasks } from '../../src/lib/crawl/recovery'
import { memoryGuardSnapshot, registerGracefulShutdown } from '../../src/lib/crawl/fetcher'

const PORT = 3018
const HOST = '127.0.0.1'

// ---- 自举(与 Next instrumentation + 首次 isRunning 触发等价的能力集, 收口到本进程) ----
async function bootstrap(): Promise<void> {
  // 优雅停机注册(cookieJar 持久化 + Obscura 关闭 + 等在飞; 幂等)
  try { registerGracefulShutdown() } catch { /* 注册失败不阻碍启动 */ }
  try {
    const r = await recoverOrphanTasks()
    if (r.recovered > 0) console.log(`[crawl-worker] 孤儿任务恢复: ${r.recovered}/${r.scanned} 条 running → interrupted`)
  } catch (e) {
    console.warn(`[crawl-worker] 孤儿恢复失败(不阻碍启动): ${String((e as Error)?.message || e).slice(0, 120)}`)
  }
  try {
    await TaskRunner.instance.recoverOnBoot()
  } catch (e) {
    console.warn(`[crawl-worker] recoverOnBoot 失败(不阻碍启动): ${String((e as Error)?.message || e).slice(0, 120)}`)
  }
  try {
    // 熔断暂停锚点 DB 扫描(isRunning 懒触发同款; boot 即扫一次, 早于任何 UI 轮询)
    ;(TaskRunner.instance as unknown as { ensureMemHaltResumeScan?: () => void }).ensureMemHaltResumeScan?.()
  } catch { /* 懒触发路径仍会兜底 */ }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json()
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: async (req) => {
    const url = new URL(req.url)
    const path = url.pathname
    try {
      // ---- 健康快照(health 路由 getRunnerSnapshot 的替代数据源) ----
      if (req.method === 'GET' && path === '/health') {
        const inst = TaskRunner.instance as unknown as { runtimes?: Map<string, { running?: boolean }> }
        const runtimes = inst.runtimes
        let activeTasks = 0
        if (runtimes) for (const rt of runtimes.values()) if (rt.running) activeTasks++
        const mem = memoryGuardSnapshot()
        return json({
          ok: true,
          runtimes: { activeTasks, runtimes: runtimes?.size ?? 0 },
          memory: { rssMb: mem.rssMb, heapUsedMb: mem.heapUsedMb, softMb: mem.softMb, haltMb: mem.haltMb, resumeMb: mem.resumeMb },
          uptime: Math.floor(process.uptime()),
        })
      }
      // ---- isRunning(管理 UI 2s 轮询热路径 + 熔断锚点懒扫描触发点) ----
      if (req.method === 'GET' && path === '/is-running') {
        const taskId = url.searchParams.get('taskId') || ''
        if (!taskId) return json({ ok: false, message: 'taskId required' }, 400)
        return json({ ok: true, running: TaskRunner.instance.isRunning(taskId) })
      }
      // ---- 控制(start/pause/stop) ----
      if (req.method === 'POST' && path === '/control') {
        const body = await readBody(req)
        const taskId = String(body.taskId || '').trim()
        const action = String(body.action || '').trim() as 'start' | 'pause' | 'stop'
        if (!taskId || !['start', 'pause', 'stop'].includes(action)) {
          return json({ ok: false, message: 'taskId/action required' }, 400)
        }
        const res = await TaskRunner.instance.control(taskId, action)
        return json(res)
      }
      // ---- 自动刷新排定面(ll-d 交互链) ----
      if (req.method === 'POST' && path === '/auto-refresh/schedule') {
        const body = await readBody(req)
        const taskId = String(body.taskId || '').trim()
        const delayMin = Number(body.delayMin) || 0
        const taskName = String(body.taskName || '')
        if (!taskId || delayMin <= 0) return json({ ok: false, message: 'taskId/delayMin required' }, 400)
        TaskRunner.instance.scheduleAutoRefresh(taskId, delayMin, taskName)
        return json({ ok: true })
      }
      if (req.method === 'POST' && path === '/auto-refresh/cancel') {
        const body = await readBody(req)
        const taskId = String(body.taskId || '').trim()
        if (!taskId) return json({ ok: false, message: 'taskId required' }, 400)
        TaskRunner.instance.cancelAutoRefresh(taskId)
        return json({ ok: true })
      }
      return json({ ok: false, message: `no route: ${req.method} ${path}` }, 404)
    } catch (e) {
      return json({ ok: false, message: String((e as Error)?.message || e).slice(0, 200) }, 500)
    }
  },
})

console.log(`[crawl-worker] listening on http://${HOST}:${PORT} (guard: soft ${process.env.FETCH_RSS_SOFT_MB || 'default'}/halt ${process.env.FETCH_RSS_HALT_MB || 'default'}/resume ${process.env.FETCH_RSS_RESUME_MB || 'default'} MB)`)
void bootstrap()

// ---- 停机: registerGracefulShutdown 已在 bootstrap 注册真实清理链, 此处仅透传退出 ----
process.on('SIGINT', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))
