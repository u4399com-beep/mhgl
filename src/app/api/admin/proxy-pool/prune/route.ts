// [R42-1] 免费代理池 — 清理死代理(alive=false 且失败≥2 且 3 天未成功)
import { ok } from '@/lib/api'
import { withGuard } from '../../../_lib/http'
import { pruneDeadProxies } from '@/lib/crawl/proxy-pool'

export async function POST() {
  return withGuard(async () => {
    const deleted = await pruneDeadProxies()
    return ok({ deleted })
  })
}
