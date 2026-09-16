// ============================================================
// [R28-2b2-8] 霹雳书屋 模板集合入口 —— registry 按 theme.id='pili' 消费
//
// 七页型(真站均有对应页, 扩展两视图全部落地):
//   基础五视图: Home(首页 mod-tags/banner/strong/vip/main) / Category(/0/list/{page}.html)
//     / Book(/{cat}/{id}/info.html) / Toc(/{cat}/{id}/menu/{page}.html) / Read(read.php 章节页)
//   扩展两视图: Ranking(/top/index.html 榜单页) / Search(/module/search/search.php
//     真站全站表单实测有搜索结果页; 结果列表按同模板族 wmcms 检索组件复刻, 见 Search.tsx 头注)
// 真站无独立「全本/完本列表页」(完本走分类筛选) → 不实现 Fulltext, 缺省走通用兜底。
//
// css: 站点级克隆样式, PublicSite 在 .clone-pili 作用域注入(所有选择器以 .clone-pili 开头)。
// 色板考据(/tmp/r28-2b/pili/ 快照实测): 主橙 #fd8929 · 浅橙 #ff9a6a · 按钮橙 #f89157
// (边 #ec7d4d) · 米色 #faead0/#eed3a4 · 深榜 #373533 · 书名条 #f1823a · 红 #d71704 ·
// 访问章 #A75646 · 版心 1200px —— 与 themes.ts pili preset(vars/customCss)同源。
// 全站链接 0.15s 色过渡与页脚底色已由 themes.ts customCss 注入(clone-pili a/.site-footer),
// 此处仅集中真站伪类/后代派生规则(组件内内联无法表达者), 每条注明真站 CSS 出处。
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { PiliHome } from './Home'
import { PiliCategory } from './Category'
import { PiliBook } from './Book'
import { PiliToc } from './Toc'
import { PiliRead } from './Read'
import { PiliRanking } from './Ranking'
import { PiliSearch } from './Search'

export const piliTemplate: SiteTemplateSet = {
  Home: PiliHome,
  Category: PiliCategory,
  Book: PiliBook,
  Toc: PiliToc,
  Read: PiliRead,
  // [R28-2b2-8] 扩展两视图(R28-2b2 补完: Ranking 修截断 + Search 新建)
  Ranking: PiliRanking,
  Search: PiliSearch,
  // 真站实测伪类/派生选择器集中在此(每条注明出处; 组件内以 pili-* 类挂点):
  // - .pili-read-content p ← read.css .main-text-wrap .read-content p
  //   {line-height:1.8;margin:1.2em 0;text-indent:2em}(read63.html 正文实测)
  // - .pili-toc-link:visited ← works.css .works-chapter-item a:visited{color:#A75646}
  //   (真站目录/书页章节链访问色; 克隆为 button 无浏览历史语义, 规则保留对齐真站规格)
  // - .pili-ctrl-link:not(:disabled):hover ← read.css .chapter-control a:hover
  //   {color:#1a1a1a;background:rgba(0,0,0,.03)}(文末上一章|目录|下一章控制条)
  // - .pili-dock-btn:hover ← read.css .left-bar-list dd a:hover{color:#ed4259}
  //   (阅读侧坞 目录/书页/首页/排行, 图标随文字同色)
  // - .pili-rank-name ← rank.css .mod-rank-name1{color:#666} 与 :hover{color:#fa8729}
  //   (榜单列表书名链; /tmp/r28-2b/pili/wmcms.page.rank.css 481-488 行实测)
  css: `
.clone-pili .pili-read-content p{margin:1.2em 0;text-indent:2em;line-height:1.8}
.clone-pili .pili-read-content p:first-child{margin-top:0}
.clone-pili .pili-read-content p:last-child{margin-bottom:0}
.clone-pili .pili-toc-link:visited{color:#A75646}
.clone-pili .pili-ctrl-link:not(:disabled):hover{color:#1a1a1a;background:rgba(0,0,0,0.03)}
.clone-pili .pili-dock-btn:hover{color:#ed4259}
.clone-pili .pili-dock-btn:hover svg{color:#ed4259!important}
.clone-pili .pili-rank-name{color:#666666}
.clone-pili .pili-rank-name:hover{color:#fa8729}
`.trim(),
}
