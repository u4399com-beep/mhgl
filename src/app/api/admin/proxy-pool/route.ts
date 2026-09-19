// [R42-1] 免费代理池 — 列表/统计/作业状态 + Setting 更新
import { db } from '@/lib/db'
import { ok, fail, readBody } from '@/lib/api'
import { withGuard, clampInt, str } from '../../_lib/http'
import { poolJobState, poolStats, readPoolSetting, ensurePoolAutoLoop, PROXY_SOURCES } from '@/lib/crawl/proxy-pool'

export async function GET(req: Request) {
  return withGuard(async () => {
    // 懒激活自动保鲜循环(首次打开代理池页即激活)
    ensurePoolAutoLoop()
    const u = new URL(req.url)
    const page = clampInt(u.searchParams.get('page'), 1, 1, 100_000)
    const pageSize = clampInt(u.searchParams.get('pageSize'), 50, 5, 200)
    const alive = str(u.searchParams.get('alive'), 8) // '' | 'true' | 'false'
    const country = str(u.searchParams.get('country'), 2).toUpperCase()
    const protocol = str(u.searchParams.get('protocol'), 8)
    const sort = str(u.searchParams.get('sort'), 12) // health | checked | created | latency

    const where: Record<string, unknown> = {}
    if (alive === 'true') where.alive = true
    if (alive === 'false') where.alive = false
    if (/^[A-Z]{2}$/.test(country)) where.country = country
    if (['http', 'socks5', 'socks4'].includes(protocol)) where.protocol = protocol

    const orderBy =
      sort === 'checked' ? [{ lastCheckedAt: 'desc' as const }, { createdAt: 'desc' as const }]
      : sort === 'created' ? [{ createdAt: 'desc' as const }]
      : sort === 'latency' ? [{ latencyMs: 'asc' as const }, { healthScore: 'desc' as const }]
      : [{ healthScore: 'desc' as const }, { lastSuccessAt: 'desc' as const }]

    const [stats, total, list, setting] = await Promise.all([
      poolStats(),
      db.freeProxy.count({ where }),
      db.freeProxy.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      readPoolSetting(),
    ])

    return ok({
      stats,
      setting,
      sources: PROXY_SOURCES.map((s) => ({ id: s.id, kind: s.kind, protocol: s.protocol || '' })),
      job: poolJobState(),
      total,
      page,
      pageSize,
      list,
    })
  })
}

/** 更新池设置(auto/intervalMin/checkBatch/pickLimit) */
export async function PATCH(req: Request) {
  return withGuard(async () => {
    const body = await readBody<Record<string, unknown>>(req)
    const cur = await readPoolSetting()
    const next = {
      auto: typeof body.auto === 'boolean' ? body.auto : cur.auto,
      intervalMin: clampInt(body.intervalMin, cur.intervalMin, 5, 1440),
      checkBatch: clampInt(body.checkBatch, cur.checkBatch, 20, 2000),
      pickLimit: clampInt(body.pickLimit, cur.pickLimit, 1, 10),
    }
    await db.setting.upsert({
      where: { key: 'proxyPool' },
      create: { key: 'proxyPool', value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    })
    return ok(next)
  })
}

/** DELETE: 清空全池(危险操作, 需 confirm=true) */
export async function DELETE(req: Request) {
  return withGuard(async () => {
    const u = new URL(req.url)
    if (str(u.searchParams.get('confirm'), 4).toLowerCase() !== 'true') {
      return fail('缺少 confirm=true, 拒绝清空代理池')
    }
    const r = await db.freeProxy.deleteMany({})
    return ok({ deleted: r.count })
  })
}
