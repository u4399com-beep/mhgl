// [R42-1] 免费代理池 — 验证作业(fire-and-forget; mode: unchecked|stale|alive)
import { ok, readBody } from '@/lib/api'
import { withGuard, str, clampInt } from '../../../_lib/http'
import { startCheckJob, poolJobState, ensurePoolAutoLoop } from '@/lib/crawl/proxy-pool'

export async function POST(req: Request) {
  return withGuard(async () => {
    ensurePoolAutoLoop()
    // [R49-2c-2] 裸 req.json() → readBody(5MB 上限) — 修前 admin 鉴权路由对 chunked 无限
    //  body 无防护(JSON 全量入内存), 与全站 readBody 契约(超限 413)统一
    const body = await readBody<Record<string, unknown>>(req)
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
