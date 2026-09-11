// 主题模板列表
// - feat-combo-theme-incremental: 双模式 API
//   默认(无 query): 返回 THEMES(9 个 preset)数组, 兼容 ThemesSection 卡片网格
//   ?page=N&size=M: 返回 { page, size, total, totalAll, totalPages, items: [presets + combos] }
//   preset 在 items 头部, 50400 组合紧跟其后, 每页可取任意 size(默认 50, 上限 500)
//   组合主题用惰性切片生成(不长期驻留内存), 仅计算本页所需项后即丢
// - [R10-a-3] 分页模式增加 ?q= 搜索: 按 id/name/desc 不区分大小写子串匹配,
//   preset + 组合统一过滤后分页; 响应附 total(过滤后总数)与 totalAll(全库 50409)。
//   向后兼容: 无 q 无分页参数时行为不变(仍返回 preset 数组); q 仅在分页模式生效。
import { ok, num } from '@/lib/api'
import { THEMES } from '@/lib/crawl/themes'
import {
  COLOR_SCHEMES,
  STYLES,
  LAYOUTS,
  TOTAL_COMBOS,
  searchThemeList,
  type ThemeListItem,
} from '@/lib/crawl/theme-matrix'
import { withGuard } from '../../_lib/http'

/** preset → ThemeListItem(与组合主题同形态) */
function presetToListItem(t: (typeof THEMES)[number]): ThemeListItem {
  return {
    id: t.id,
    name: t.name,
    desc: t.desc,
    layout: t.layout,
    dark: t.dark,
    read: t.read ? { layout: t.read.layout || 'classic' } : undefined,
    preview: t.preview,
  }
}

/** 组合主题切片生成器(惰性, 仅生成本页所需项, 不构建全量 50400 数组)
 *  combos 全局序: colorIdx * STYLE_COUNT * LAYOUT_COUNT + styleIdx * LAYOUT_COUNT + layoutIdx
 *  返回 [from, to) 区间内的 ThemeListItem[] */
function sliceCombos(from: number, to: number): ThemeListItem[] {
  const out: ThemeListItem[] = []
  const total = TOTAL_COMBOS
  const lo = Math.max(0, from)
  const hi = Math.min(total, to)
  if (lo >= hi) return out
  // 计算起点对应的 (colorIdx, styleIdx, layoutIdx)
  for (let i = lo; i < hi; i++) {
    const cIdx = Math.floor(i / (STYLES.length * LAYOUTS.length))
    const rem = i - cIdx * STYLES.length * LAYOUTS.length
    const sIdx = Math.floor(rem / LAYOUTS.length)
    const lIdx = rem - sIdx * LAYOUTS.length
    const c = COLOR_SCHEMES[cIdx]
    const s = STYLES[sIdx]
    const l = LAYOUTS[lIdx]
    if (!c || !s || !l) continue
    out.push({
      id: `${c.id}-${s.id}-${l.id}`,
      name: `${c.name}·${s.name}·${l.name}`,
      desc: `${s.desc} · ${c.dark ? '暗色' : '亮色'} · ${l.name}`,
      layout: l.homeLayout,
      dark: c.dark,
      read: { layout: l.readLayout },
      preview: c.preview,
    })
  }
  return out
}

// [R10-a-3] q 匹配谓词(id/name/desc 不区分大小写子串), preset 与组合统一口径
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
    const qRaw = (url.searchParams.get('q') || '').trim() // [R10-a-3]
    // 双模式: 缺省无分页参数 → 数组(presets); 带分页参数 → 对象(presets+combos 分页)
    if (pageRaw === null && sizeRaw === null) {
      // 默认: 仅返回 presets(9 个) 数组, ThemesSection 卡片网格沿用原契约(q 不影响此模式)
      return ok(THEMES)
    }
    // 分页模式: presets + combos 合并分页
    const page = Math.max(1, num(pageRaw, 1))
    const size = Math.max(1, Math.min(500, num(sizeRaw, 50)))
    const presetCount = THEMES.length
    const totalAll = presetCount + TOTAL_COMBOS // [R10-a-3] 全库总数(9 精选 + 50400 组合)

    // [R10-a-3] 搜索模式: q 非空 → preset + 组合统一过滤后分页
    // 组合侧走 theme-matrix 的惰性单例缓存(全量 50400 项构建一次常驻, 取舍见该函数注释)
    if (qRaw) {
      const needle = qRaw.toLowerCase()
      const filtered: ThemeListItem[] = [
        ...THEMES.filter((t) => matchListItem(needle, t)).map(presetToListItem),
        ...searchThemeList(qRaw),
      ]
      const total = filtered.length
      const totalPages = Math.max(1, Math.ceil(total / size))
      const p = Math.max(1, Math.min(totalPages, page))
      const start = (p - 1) * size
      return ok({ page: p, size, total, totalAll, totalPages, items: filtered.slice(start, start + size) })
    }

    // 无 q 分页模式(原行为): combos 惰性切片, 不构建全量数组
    const total = totalAll
    const totalPages = Math.max(1, Math.ceil(total / size))
    const p = Math.max(1, Math.min(totalPages, page))
    const start = (p - 1) * size
    const end = start + size
    const items: ThemeListItem[] = []
    // [start, end) 区间: 跨越 preset 边界时同时填入 preset + combos
    if (start < presetCount) {
      for (let i = start; i < Math.min(end, presetCount); i++) {
        items.push(presetToListItem(THEMES[i]))
      }
    }
    // combos 区间(若 end 超出 preset 边界)
    if (end > presetCount) {
      const comboStart = Math.max(0, start - presetCount)
      const comboEnd = end - presetCount
      items.push(...sliceCombos(comboStart, comboEnd))
    }
    return ok({ page: p, size, total, totalAll, totalPages, items })
  })
}
