// ============================================================
// [R31-3] Next.js instrumentation 钩子(启动期一次性入口)
// ============================================================
// Next.js 16 约定: 服务实例启动时调用本文件导出的 register()(await 完成后才开始受理请求,
// src/ 项目结构放 src/instrumentation.ts)。在此收口孤儿任务恢复(R31-0-3 缺陷确认:
// 连续两轮 OOM 后用户任务滞留 status='running' 成僵尸, 无任何启动期标记机制)。
//
// 注意: register() 内不得做重活/阻塞——恢复只做条件 UPDATE + 少量 TaskLog 插入
// (SQLite 本地毫秒级), 且必须吞掉一切异常(恢复失败不得阻碍启动)。
export async function register(): Promise<void> {
  // 非 nodejs 运行时(edge 等)直接跳过: Prisma/采集引擎仅存在于 nodejs 运行时
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    // 动态 import: ① edge 构建面不打包 crawl 链; ② 恢复链路任何加载失败都收进下方 catch
    const { recoverOrphanTasks } = await import('./lib/crawl/recovery')
    const r = await recoverOrphanTasks()
    if (r.recovered > 0) {
      console.log(
        `[instrumentation] 孤儿任务恢复: ${r.recovered}/${r.scanned} 条 running → interrupted` +
          (r.skippedInProcess ? `(跳过本进程在跑 ${r.skippedInProcess} 条)` : ''),
      )
    }
  } catch (e) {
    // 恢复失败不得阻碍启动: 仅留一行告警, 僵尸行留待下次重启重试
    console.warn('[instrumentation] 孤儿任务恢复失败(不阻碍启动):', (e as Error)?.message || e)
  }
}
