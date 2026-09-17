// ============================================================
// [R24-5] 主题模板列表 API — 重写为仅 9 套站点克隆主题。
//   默认(无 query): 返回 THEMES(9 套克隆)数组, 兼容 ThemesSection 卡片网格
//   ?page=N&size=M: 返回 { page, size, total, totalAll, totalPages, items }
//   ?q=: 按 id/name/desc 不区分大小写子串匹配(克隆集内过滤)
//   旧 512 组合矩阵(theme-matrix)已随「删除全部旧主题」指令一并下线。
// [R36-2a-4] 双模式行均合并主题覆盖(Setting.theme_overrides): read 深合并(注册表+覆盖)+
//   footer 全量投影(THEME_FOOTER_DEFAULTS 起底), ThemesSection 编辑器/卡片可见生效值。
// ============================================================
import { ok, num } from '@/lib/api'
import { THEMES, applyThemeOverrides, footerOf, readOf, type ThemeDef, type ThemeOverride } from '@/lib/crawl/themes'
import { getThemeOverrides } from '@/lib/theme-overrides'
import { withGuard } from '../../_lib/http'

/** [R36-2a-4] 合并覆盖 + footer 全量投影(未命中覆盖的主题 footer 也带全量缺省值, 编辑器可直接预填) */
function mergeTheme(t: ThemeDef, ov?: ThemeOverride): ThemeDef {
  const merged = applyThemeOverrides(t, ov)
  return { ...merged, footer: footerOf(merged) }
}

/** clone 主题 → 列表项(与旧 ThemeListItem 同形态, ThemesSection 零适配); [R36-2a-4] read 全量+footer 全量 */
function presetToListItem(t: ThemeDef) {
  return {
    id: t.id,
    name: t.name,
    desc: t.desc,
    layout: t.layout,
    dark: t.dark,
    read: readOf(t),
    footer: t.footer,
    preview: t.preview,
  }
}

/** q 匹配谓词(id/name/desc 不区分大小写子串) */
function matchListItem(needleLower: string, item: { id: string; name: string; desc: string }): boolean {
  return (
    item.id.toLowerCase().includes(needleLower) ||
    item.name.toLowerCase().includes(needleLower) ||
    item.desc.toLowerCase().includes(needleLower)
  )
}

export async function GET(req: Request) {
  return withGuard(async () => {
    const url = new URL(req.url)
    const pageRaw = url.searchParams.get('page')
    const sizeRaw = url.searchParams.get('size')
    const qRaw = (url.searchParams.get('q') || '').trim()
    // [R36-2a-4] 合并当前覆盖(读侧 60s 缓存; 写路径已 invalidate, 保存后刷新列表即见新值)
    const overrides = await getThemeOverrides()
    const merged = THEMES.map((t) => mergeTheme(t, overrides[t.id]))
    // 双模式: 缺省无分页参数 → 数组(9 套克隆); 带分页参数 → 对象分页
    if (pageRaw === null && sizeRaw === null) {
      return ok(merged)
    }
    const page = Math.max(1, num(pageRaw, 1))
    const size = Math.max(1, Math.min(500, num(sizeRaw, 50)))
    const filtered = qRaw
      ? merged.filter((t) => matchListItem(qRaw.toLowerCase(), t)).map(presetToListItem)
      : merged.map(presetToListItem)
    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / size))
    const p = Math.max(1, Math.min(totalPages, page))
    const start = (p - 1) * size
    return ok({
      page: p,
      size,
      total,
      totalAll: THEMES.length,
      totalPages,
      items: filtered.slice(start, start + size),
    })
  })
}
