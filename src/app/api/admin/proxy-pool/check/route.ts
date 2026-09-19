// [R42-1] 免费代理池 — 验证作业(fire-and-forget; mode: unchecked|stale|alive)
import { ok } from '@/lib/api'
import { withGuard, str, clampInt } from '../../../_lib/http'
import { startCheckJob, poolJobState, ensurePoolAutoLoop } from '@/lib/crawl/proxy-pool'

export async function POST(req: Request) {
  return withGuard(async () => {
    ensurePoolAutoLoop()
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const modeRaw = str(body.mode, 12)
    const mode = modeRaw === 'stale' || modeRaw === 'alive' ? modeRaw : 'unchecked'
    const limit = clampInt(body.limit, 0, 0, 2000) || undefined
    const countries = str(body.countries, 60)
    const protocols = str(body.protocols, 40)
    const r = startCheckJob({ mode, limit, countries, protocols })
    if (!r.ok) return ok({ ...r, job: poolJobState() })
    return ok(r)
  })
}
