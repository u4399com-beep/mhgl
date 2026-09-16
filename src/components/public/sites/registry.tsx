// ============================================================
// [R27-5b-H2] 站点克隆模板注册表 —— SiteTemplateSet 的唯一消费入口
//
// R26/R27 交付的十套六文件克隆模板(aijjxs/pili/kks101/qb23/ddyueshu/ggd66/
// huangjinwu/x2552/shipsay/trxsw, 每套 Home/Category/Book/Toc/Read/css)在此
// 集中挂载; 各视图壳(HomeView/CategoryView/
// BookView/TocView/ReadView)按 theme.id 查表命中后以 SiteTemplateSet 契约 props
// 分发渲染, 未命中站点走既有通用渲染路径(零回归)。
//
// css 注入: 各套 css 字段(全部选择器以 .clone-{id} 开头)由 PublicSite 在
// .clone-{theme.id} 作用域下统一注入(<style data-template-clone-css>), 与
// theme.customCss 的既有注入通道(theme.customCss → data-theme-clone-css)叠加共存。
//
// 数据流契约(见 ./shared.ts): 数据获取/SEO/TDK 一律由通用视图壳统一完成后以 props
// 下发 —— 模板组件是纯展示层, 内部用 usePublic() 拿 site/theme/navigate。
//
// 扩展位: 十站已全部六文件化(旧单文件形态已全部删除)。新增站点时在此追加
// import + 一行映射即可自动获得五视图接线与 css 注入(视图壳已全部按
// getTemplateSet 消费, 无需再改)。
// ============================================================
import type { SiteTemplateSet } from './shared'
import { aijjxsTemplate } from './aijjxs'
import { piliTemplate } from './pili'
import { kks101Template } from './kks101'
import { qb23Template } from './qb23'
import { ddyueshuTemplate } from './ddyueshu'
import { ggd66Template } from './ggd66'
import { huangjinwuTemplate } from './huangjinwu'
import { x2552Template } from './x2552'
import { shipsayTemplate } from './shipsay'
import { trxswTemplate } from './trxsw'

const TEMPLATE_SETS: Record<string, SiteTemplateSet> = {
  aijjxs: aijjxsTemplate,
  pili: piliTemplate,
  kks101: kks101Template,
  qb23: qb23Template,
  ddyueshu: ddyueshuTemplate,
  ggd66: ggd66Template, // [R27-6-g1] R27-6 克隆第 6 站(格格党)
  huangjinwu: huangjinwuTemplate, // [R27-6-g2] R27-6 克隆第 7 站(黄金屋)
  x2552: x2552Template, // [R27-6b] 第 8 站(黑冰模板; Wayback 快照+家族标准)
  shipsay: shipsayTemplate, // [R27-6b] 第 9 站(船说 V4.2; Wayback 快照+家族标准)
  trxsw: trxswTemplate, // [R27-6b] 第 10 站(杰奇默认; Wayback 快照+家族标准)
}

/**
 * themeId → 模板集。未接入克隆六文件的站点返回 null, 调用方走旧渲染路径。
 * theme.id 与模板目录名共用 SiteCloneId 命名空间(themes.ts), 故以 theme.id 为键。
 */
export function getTemplateSet(themeId: string | null | undefined): SiteTemplateSet | null {
  if (!themeId) return null
  return TEMPLATE_SETS[themeId] || null
}
