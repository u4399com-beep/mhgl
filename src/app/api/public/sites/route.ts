// 公开站点列表 — 仅返回 status=true 的站点, 不含管理敏感字段
// (修复 feat-round-4 回归: 公开站点前端原调用 /api/admin/sites, auth 加固后被 401 拦截)
// 伪静态: 每行附带全局 pseudoPreset(前台 viewToUrl 按预设生成链接; 单查询零额外成本)
// [R36-2a-5] 每行附带 themeOverrides(逐主题阅读设置/页面底部覆盖 map, 前台 applyThemeOverrides 合并生效)
import { db } from '@/lib/db'
import { ok } from '@/lib/api'
import { withGuard } from '../../_lib/http'
import { getPseudoPreset } from '@/lib/pseudostatic-server'
import { getSeoTemplates } from '@/lib/seo-tpl-server'
import { getThemeOverrides } from '@/lib/theme-overrides'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withGuard(async () => {
    const [sites, pseudoPreset, seoTpl, themeOverrides] = await Promise.all([
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
      // [R24-4] 全局 SEO 模板随站点列表下发(客户端书籍页/目录页/章节页 TDK 与 SSR 同源同口径)
      getSeoTemplates(),
      // [R36-2a-5] 主题覆盖 map 随站点列表下发(写后缓存已失效, 下次请求即新值)
      getThemeOverrides(),
    ])
    return ok(sites.map((s) => ({ ...s, pseudoPreset, seoTpl, themeOverrides })))
  })
}
