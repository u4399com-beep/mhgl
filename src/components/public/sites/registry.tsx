// ============================================================
// [R28-1] 站点克隆模板注册表 —— SiteTemplateSet 的唯一消费入口
//
// R28 用户指令「删除现有所有主题模版 → 重新完整克隆」执行完毕: R26/R27 十套模板
// 已删除并由本轮 5+3 agent + 主控以 8 页型契约(基础五视图 + Ranking/Fulltext/Search
// 扩展三视图)重建, 在此集中挂载。
//
// 覆盖表(8 页型 = H首页 C分类 B书 T目录 R章节 + Ran排行 Ful全本 Sea搜索):
//   aijjxs     H C B T R     Ful Sea  (真站无独立排行页, 声明)
//   pili       H C B T R Ran Sea     (真站无独立全本页, 声明)
//   kks101     H C B T R Ran Ful Sea  (8/8)
//   qb23       H C B T R Ran Ful Sea  (8/8)
//   ddyueshu   H C B T R Ran Ful      (真站搜索为第三方站外引擎, 声明)
//   ggd66      H C B T R     Ful Sea  (真站无独立排行页, 声明)
//   huangjinwu H C B T R Ran Sea      (真站无全本列表页, 声明)
//   x2552      H C B T R Ran Ful Sea  (8/8, Wayback 实测为主)
//   shipsay    H C B T R Ran Ful Sea  (8/8, Wayback 实测为主)
//   trxsw      H C B T R Ran Ful Sea  (8/8, Wayback 实测为主)
//
// css 注入: 各套 css 字段(全部选择器以 .clone-{id} 开头)由 PublicSite 在
// .clone-{theme.id} 作用域下统一注入(<style data-template-clone-css>)。
// 未命中站点走视图壳通用兜底, 前台永不白屏。
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
  aijjxs: aijjxsTemplate, // [R28-2a] 8 文件 2162 行
  pili: piliTemplate, // [R28-2b/2b2] 七页型(Ranking 截断修复+Search 补建)
  kks101: kks101Template, // [R28-2f] 10 文件 2119 行
  qb23: qb23Template, // [R28-2c] 8 文件 1877 行
  ddyueshu: ddyueshuTemplate, // [R28-2a/2a2/2h] 补完+Ranking 补建
  ggd66: ggd66Template, // [R28-2c] 8 文件 1462 行
  huangjinwu: huangjinwuTemplate, // [R28-2d] 8 文件 1458 行
  x2552: x2552Template, // [R28-2d/2d-x] Wayback 快照重建+主控补完 8 文件
  shipsay: shipsayTemplate, // [R28-2e] 8 文件 1799 行
  trxsw: trxswTemplate, // [R28-2g] 9 文件 1736 行
}

/**
 * themeId → 模板集。未接入克隆模板的站点返回 null, 调用方走通用兜底渲染。
 * theme.id 与模板目录名共用 SiteCloneId 命名空间(themes.ts), 故以 theme.id 为键。
 */
export function getTemplateSet(themeId: string | null | undefined): SiteTemplateSet | null {
  if (!themeId) return null
  return TEMPLATE_SETS[themeId] || null
}
