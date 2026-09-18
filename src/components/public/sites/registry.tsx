// ============================================================
// [R39-1] 站点克隆模板注册表 —— SiteTemplateSet 的唯一消费入口
//
// R39 用户指令「先彻底删除现有所有主题模版 → 再重新完整克隆」执行中:
// R28 轮 10 套模板已全部删除(src/components/public/sites/{id}/ + header/{id}.tsx),
// 本轮按真站快照(/tmp/r39-snap/{id}/)逐站 1:1 重克隆后在此挂载, 模板 id 与导出名
// 与 R28 轮一致(registry 零改动挂载)。
//
// 页型覆盖表(8 页型 = H首页 C分类 B书 T目录 R章节 + Ran排行 Ful全本 Sea搜索):
//   aijjxs     H C B T R     Ful Sea  (真站无独立排行页, 榜单为首页 aside 板块; 声明)
//   ddyueshu   H C B T R Ran Ful     (Sea 不实现: 真站无站内搜索结果页, header 搜索为站外 JS; 声明)
//   ggd66      H C B T R     Ful Sea  (Ran 不实现: 真站无独立排行页, 榜单为首页 aside 板块; 声明)
//   (其余各站重建中, 逐站回填)
//
// css 注入: 各套 css 字段(全部选择器以 .clone-{id} 开头)由 PublicSite 在
// .clone-{theme.id} 作用域下统一注入(<style data-template-clone-css>)。
// 未命中站点走视图壳通用兜底, 前台永不白屏。
// ============================================================
import type { SiteTemplateSet } from './shared'
import { aijjxsTemplate } from './aijjxs'
import { ddyueshuTemplate } from './ddyueshu'
import { ggd66Template } from './ggd66'
import { x2552Template } from './x2552'
import { qb23Template } from './qb23'
import { huangjinwuTemplate } from './huangjinwu'
import { kks101Template } from './kks101'
import { piliTemplate } from './pili'
import { shipsayTemplate } from './shipsay'
import { trxswTemplate } from './trxsw'

const TEMPLATE_SETS: Partial<Record<string, SiteTemplateSet>> = {
  aijjxs: aijjxsTemplate, // [R39-2a] 9 文件重克隆(快照 /tmp/r39-snap/aijjxs/ 2026-09-18 直连实抓)
  ddyueshu: ddyueshuTemplate, // [R39-2d] 10 文件重克隆(biquge 家族, GBK 快照 2026-09-18)
  ggd66: ggd66Template, // [R39-2e] 7 文件重克隆(绿系简洁风, 快照 2026-09-18)
  pili: piliTemplate, // [R39-2j] 6 文件重克隆(wmcms 橙棕系, cloak 快照 2026-09-18)
  kks101: kks101Template, // [R39-2i] 6 文件重克隆(繁体蓝系书单卡墙, 快照 2026-09-18)
  huangjinwu: huangjinwuTemplate, // [R39-2h] 7 文件重克隆(现代蓝系 CSS 变量设计, 快照 2026-09-18)
  qb23: qb23Template, // [R39-2g] 7 文件重克隆(mxone 红色卡片墙, 快照 2026-09-18)
  x2552: x2552Template, // [R39-2f] legacy 恢复(真站本轮快照文本编码损坏, 结构/黑冰 CSS 已复核一致; R28 Wayback 实测克隆)
  // [R39-2c] 以下两站真站已不可达(本轮 curl/relay/cloak/ZAI 四链路复核): trxsw.com 服务器空响应、
  // demo.shipsay.com 仅 ZAI 间歇可达。恢复 R28 轮基于真实抓取(Wayback 实测)的克隆成果, 来源已注明各文件头
  shipsay: shipsayTemplate,
  trxsw: trxswTemplate,
}

/**
 * themeId → 模板集。未接入克隆模板的站点返回 null, 调用方走通用兜底渲染。
 * theme.id 与模板目录名共用 SiteCloneId 命名空间(themes.ts), 故以 theme.id 为键。
 */
export function getTemplateSet(themeId: string | null | undefined): SiteTemplateSet | null {
  if (!themeId) return null
  return TEMPLATE_SETS[themeId] || null
}
