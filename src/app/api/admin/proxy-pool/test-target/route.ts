// [R42-1] 免费代理池 — 定向测试(对目标 URL 用池内代理逐个探活; 同步返回, 量小)
import { ok, fail, readBody } from '@/lib/api'
import { withGuard, str, clampInt } from '../../../_lib/http'
import { testProxiesAgainstTarget } from '@/lib/crawl/proxy-pool'

export async function POST(req: Request) {
  return withGuard(async () => {
    // [R49-2c-2] 裸 req.json() → readBody(5MB 上限), 与全站 body 防护契约统一(超限 413)
    const body = await readBody<Record<string, unknown>>(req)
    const url = str(body.url, 500).trim()
    if (!/^https?:\/\/\S+$/i.test(url)) return fail('url 必须为合法 http(s) 地址')
    const countries = str(body.countries, 60)
    const protocols = str(body.protocols, 40)
    const limit = clampInt(body.limit, 10, 1, 30)
    const results = await testProxiesAgainstTarget({ url, countries, protocols, limit })
    return ok({ url, results, hitCount: results.filter((r) => r.ok).length })
  })
}
