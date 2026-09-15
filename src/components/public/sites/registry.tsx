// ============================================================
// [R27-5b-H2] 站点克隆模板注册表 —— SiteTemplateSet 的唯一消费入口
//
// R26 交付的五套六文件克隆模板(aijjxs/pili/kks101/qb23/ddyueshu, 每套
// Home/Category/Book/Toc/Read/css)在此集中挂载; 各视图壳(HomeView/CategoryView/
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
// 扩展位: 其余 5 站(x2552/huangjinwu/ggd66/shipsay/trxsw)尚为旧单文件形态
// (sites/XxxHome.tsx, 仅首页一页型), 完成六文件克隆后在此追加 import + 一行映射
// 即可自动获得五视图接线与 css 注入(视图壳已全部按 getTemplateSet 消费, 无需再改)。
// ============================================================
import type { SiteTemplateSet } from './shared'
import { aijjxsTemplate } from './aijjxs'
import { piliTemplate } from './pili'
import { kks101Template } from './kks101'
import { qb23Template } from './qb23'
import { ddyueshuTemplate } from './ddyueshu'

const TEMPLATE_SETS: Record<string, SiteTemplateSet> = {
  aijjxs: aijjxsTemplate,
  pili: piliTemplate,
  kks101: kks101Template,
  qb23: qb23Template,
  ddyueshu: ddyueshuTemplate,
}

/**
 * themeId → 模板集。未接入克隆六文件的站点返回 null, 调用方走旧渲染路径。
 * theme.id 与模板目录名共用 SiteCloneId 命名空间(themes.ts), 故以 theme.id 为键。
 */
export function getTemplateSet(themeId: string | null | undefined): SiteTemplateSet | null {
  if (!themeId) return null
  return TEMPLATE_SETS[themeId] || null
}
