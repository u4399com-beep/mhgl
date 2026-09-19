// [R42-1] 免费代理池 — 抓取作业(fire-and-forget, 状态经 GET /api/admin/proxy-pool 轮询)
import { ok } from '@/lib/api'
import { withGuard } from '../../../_lib/http'
import { startHarvestJob, poolJobState, ensurePoolAutoLoop } from '@/lib/crawl/proxy-pool'

export async function POST() {
  return withGuard(async () => {
    ensurePoolAutoLoop()
    const r = startHarvestJob()
    if (!r.ok) return ok({ ...r, job: poolJobState() })
    return ok(r)
  })
}
