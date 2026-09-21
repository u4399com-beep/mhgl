// ============================================================
// [R49-10] TaskRunner 进程外客户端 stub —— 采集引擎已迁独立 worker(mini-services/
// crawl-worker:3018), Next API 路由经本客户端以同方法面访问 runner。
// ------------------------------------------------------------
// 为什么: dev 模式 next-server 基线 ~1.9GB(Turbopack 编译缓存)与采集护栏线互踩熔断
// (R48-2 起反复震荡)。采集迁出后: ①worker 自身基线 ~150MB, 护栏按自身标定, 熔断只反映
// 采集压力; ②dev server 的 Turbopack 内存漂移不再干扰采集。src/lib/crawl/* 零 Next 依赖,
// worker 直搬全量引擎逻辑(runner/fetcher/parser/watcher/自愈链均在本进程内活体运行)。
// 容错语义: worker 不可达时 isRunning→false / control→{ok:false} / 排定面静默吞 ——
// 与 runner 单例缺失时的降级行为对齐, UI 侧表现为"任务未运行/操作失败", 不 500。
// health 快照(getRunnerSnapshot 替代数据源): worker /health → runtimes 计数。
// ============================================================
const WORKER_BASE = 'http://127.0.0.1:3018'

/** worker 探活窗口: 管理 UI 2s 轮询链路, 超时不宜长; 失败即降级不重试(下一轮询自愈) */
async function workerFetch(path: string, init?: RequestInit, timeoutMs = 4000): Promise<{ ok: boolean; data: Record<string, unknown> | null; status: number }> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(`${WORKER_BASE}${path}`, { ...init, signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
    let data: Record<string, unknown> | null = null
    try { data = await res.json() as Record<string, unknown> } catch { /* 非 JSON: 保持 null */ }
    return { ok: res.ok, data, status: res.status }
  } catch {
    return { ok: false, data: null, status: 0 }
  } finally {
    clearTimeout(timer)
  }
}

export const runnerClient = {
  /** 同 TaskRunner.isRunning: worker 不可达按"未运行"降级(与进程内单例缺失语义对齐) */
  async isRunning(taskId: string): Promise<boolean> {
    if (!taskId) return false
    const r = await workerFetch(`/is-running?taskId=${encodeURIComponent(taskId)}`)
    return r.ok ? r.data?.running === true : false
  },

  /** 同 TaskRunner.control: 返回 {ok, message}, worker 不可达时 ok=false + 原因 */
  async control(taskId: string, action: 'start' | 'pause' | 'stop'): Promise<{ ok: boolean; message: string }> {
    const r = await workerFetch('/control', { method: 'POST', body: JSON.stringify({ taskId, action }) })
    if (r.ok && r.data) {
      return { ok: r.data.ok === true, message: String(r.data.message ?? '') }
    }
    return { ok: false, message: r.status === 0 ? '采集服务(crawl-worker)不可达, 请检查服务状态' : `采集服务返回 ${r.status}` }
  },

  /** 同 TaskRunner.scheduleAutoRefresh(排定面, 失败静默 —— 原路由已 catch 包裹) */
  async scheduleAutoRefresh(taskId: string, delayMin: number, taskName = ''): Promise<void> {
    await workerFetch('/auto-refresh/schedule', { method: 'POST', body: JSON.stringify({ taskId, delayMin, taskName }) })
  },

  /** 同 TaskRunner.cancelAutoRefresh */
  async cancelAutoRefresh(taskId: string): Promise<void> {
    await workerFetch('/auto-refresh/cancel', { method: 'POST', body: JSON.stringify({ taskId }) })
  },

  /** health 路由 runner 快照: {activeTasks, runtimes}; worker 不可达返回零值(与原 catch 对齐) */
  async snapshot(): Promise<{ activeTasks: number; runtimes: number }> {
    const r = await workerFetch('/health')
    if (r.ok && r.data && typeof r.data.runtimes === 'object' && r.data.runtimes !== null) {
      const rt = r.data.runtimes as { activeTasks?: unknown; runtimes?: unknown }
      return { activeTasks: Number(rt.activeTasks) || 0, runtimes: Number(rt.runtimes) || 0 }
    }
    return { activeTasks: 0, runtimes: 0 }
  },
}
