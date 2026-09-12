// 公开站点列表 — 仅返回 status=true 的站点, 不含管理敏感字段
// (修复 feat-round-4 回归: 公开站点前端原调用 /api/admin/sites, auth 加固后被 401 拦截)
// 伪静态: 每行附带全局 pseudoPreset(前台 viewToUrl 按预设生成链接; 单查询零额外成本)
import { db } from '@/lib/db'
import { ok } from '@/lib/api'
import { withGuard } from '../../_lib/http'
import { getPseudoPreset } from '@/lib/pseudostatic-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withGuard(async () => {
    const [sites, pseudoPreset] = await Promise.all([
      db.site.findMany({
        where: { status: true },
        orderBy: { createdAt: 'asc' },
        take: 500,
        select: {
          id: true,
          name: true,
          domain: true,
          themeId: true,
          title: true,
          description: true,
          keywords: true,
          icbm: true,
          geoRegion: true,
          geoPlacename: true,
          offset: true,
          isDefault: true,
          inLinkWheel: true,
        },
      }),
      getPseudoPreset(),
    ])
    return ok(sites.map((s) => ({ ...s, pseudoPreset })))
  })
}
