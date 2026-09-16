// ============================================================
// [R28-2a] aijjxs(久久小说下载网 www.aijjxs.com) 7 页型克隆模板集
//   基础五视图: Home.tsx 首页 / Category.tsx 分类页 / Book.tsx 书页 / Toc.tsx 目录页 / Read.tsx 章节页
//   扩展两视图: Fulltext.tsx 全站书库(真站 /txt/) / Search.tsx 搜索结果(推断级)
//   Ranking 不实现: 真站无独立排行榜页(榜单仅为首页 aside 双热榜板块, 见 Home.tsx;
//   /support/sitemap.html 全站页型清点实证无 /top/ /paihang/ 类路由)。
//
//   勘察产物(/tmp/r28-2a/aijjxs/, 2026-09-16 直连实抓):
//   aijjxs-home.html(57.9KB) / aijjxs-cat.html / aijjxs-book.html / aijjxs-toc.html
//   / aijjxs-chapter.html / aijjxs-txtlist.html / aijjxs-search-post.html
//   + aijjxs-style.css(skin/yellow/style.css 39.9KB) / aijjxs-read.css(skin/yellow/read.css
//   12.8KB) / aijjxs-common.css(yecha/Common.css 18.9KB) 三份真站样式全量。
//
//   css 字段: 仅承载组件内难以表达的 :hover/伪类/复合选择器, 全部以 .clone-aijjxs 开头
//   (PublicSite 在 .clone-{id} 作用域注入, 禁止全局污染); 色值出处见各规则行注释。
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { AijjxsHome } from './Home'
import { AijjxsCategory } from './Category'
import { AijjxsBook } from './Book'
import { AijjxsToc } from './Toc'
import { AijjxsRead } from './Read'
import { AijjxsFulltext } from './Fulltext'
import { AijjxsSearch } from './Search'

export const aijjxsTemplate: SiteTemplateSet = {
  Home: AijjxsHome,
  Category: AijjxsCategory,
  Book: AijjxsBook,
  Toc: AijjxsToc,
  Read: AijjxsRead,
  Fulltext: AijjxsFulltext,
  Search: AijjxsSearch,
  css: `
/* ---- 全局链接过渡(真站 style.css a 基线: color var(--brand-dark), hover var(--brand)+下划线) ---- */
.clone-aijjxs a{transition:color .15s ease}
.clone-aijjxs a.ajx-a{color:#115e59;text-decoration:none}
.clone-aijjxs a.ajx-a:hover{color:#0f766e;text-decoration:underline}
/* 真站 .book a:hover: #09B295 无下划线(style.css .book a:hover 实测) */
.clone-aijjxs a.ajx-book{color:#115e59;text-decoration:none}
.clone-aijjxs a.ajx-book:hover{color:#09B295;text-decoration:none}
/* flat 链(真站 .top-links > a: #0f766e 600, 无下划线) */
.clone-aijjxs button.ajx-flat:hover,.clone-aijjxs a.ajx-flat:hover{color:#0b5f58;text-decoration:none}
/* ---- 阅读页链接(真站 read.css a: #6b3418, hover #a85a2a, !important 无下划线) ---- */
.clone-aijjxs button.ajx-rl,.clone-aijjxs a.ajx-rl{color:#6b3418;text-decoration:none}
.clone-aijjxs button.ajx-rl:hover,.clone-aijjxs a.ajx-rl:hover{color:#a85a2a;text-decoration:none}
/* ---- 首页「展示更多」按钮 hover(真站 .latest-upload-more:hover: #d6a63d/#b27400/#fffaf0) ---- */
.clone-aijjxs button.ajx-more:hover,.clone-aijjxs a.ajx-more:hover{border-color:#d6a63d;color:#b27400;background:#fffaf0}
/* ---- 书页 download-btn hover(真站 .download-btn:hover: #c94a20→#9e350f 加深+投影) ---- */
.clone-aijjxs a.ajx-dl:hover,.clone-aijjxs button.ajx-dl:hover{background:linear-gradient(135deg,#c94a20,#9e350f);box-shadow:0 12px 20px rgba(184,70,29,.3);text-decoration:none;color:#fff}
/* 书页「在线阅读全文」按钮为青色系, hover 加深至 brand-dark(与真站 download-btn 同形态不同色, 推断等价) */
.clone-aijjxs button.ajx-dl-read:hover{background:linear-gradient(135deg,#115e59,#0b5f58);box-shadow:0 12px 20px rgba(15,118,110,.28)}
/* ---- 书页 copy-btn hover(真站 .copy-btn:hover: bg #e5fcfa) ---- */
.clone-aijjxs a.ajx-copy:hover{background:#e5fcfa;text-decoration:none;color:#0f766e}
/* ---- 分类页图文书名 hover(真站 .cenMain .catalog .listbg .title a:hover: #09B295) ---- */
.clone-aijjxs button.ajx-cat-title:hover,.clone-aijjxs a.ajx-cat-title:hover{color:#09B295}
/* ---- 分页钮 hover(真站 .pager a:hover: bg #f3ede1) ---- */
.clone-aijjxs .ajx-pager button:hover{background:#f3ede1}
.clone-aijjxs .ajx-pager button[disabled]:hover{background:none}
/* ---- 目录页章节格子 hover(真站 toc 内联 .chapter-list li:hover: #cfd9e8/#f9fbff) ---- */
.clone-aijjxs .ajx-toc-item{transition:border-color .15s ease,background .15s ease}
.clone-aijjxs .ajx-toc-item:hover{border-color:#cfd9e8;background:#f9fbff}
/* ---- 目录页 TXT 下载 hover(真站 .read-meta a #1f8b4c, hover 加深, 推断等价) ---- */
.clone-aijjxs a.ajx-toc-dl:hover{color:#17783c;text-decoration:underline}
/* ---- 阅读页工具条字号钮(真站 read.css #fonts .s: 边 #d8cab7 radius 8 #6f4f34; 激活 #fbe8ce/#d8a366/#80410f) ---- */
.clone-aijjxs .ajx-fs{transition:background .15s ease,border-color .15s ease}
.clone-aijjxs .ajx-fs:hover{border-color:#d8a366}
/* ---- 阅读页背景色板圆点激活(真站 #skbglist .c 激活外圈; read.css 无显式激活规则, 以品牌色外圈近似) ---- */
.clone-aijjxs .ajx-swatch.is-active{box-shadow:0 0 0 2px rgba(15,118,110,.55)}
/* ---- 正文段落规格(真站 read.css #view_content_txt p: 段距 1.2em/缩进 2.4em/首段不缩进) ---- */
.clone-aijjxs .ajx-read-txt p{margin:0 0 1.2em;text-indent:2.4em}
.clone-aijjxs .ajx-read-txt p:first-child{text-indent:0}
/* ---- 搜索框聚焦(真站 .search input focus 边 var(--brand), 推断等价) ---- */
.clone-aijjxs .ajx-search-form input:focus{border-color:#0f766e}
/* ---- 搜索按钮 hover(真站 button 无显式 hover → 加深, 推断等价) ---- */
.clone-aijjxs .ajx-search-btn:hover{background:#0b5f58}

/* ================= 移动端(真站断点 980/900/680/640/560 近似复刻, 375px 无横向滚动) ================= */
/* 真站 @media (max-width:980px): .layout 单列 */
@media (max-width: 980px){
  .clone-aijjxs .ajx-layout{grid-template-columns:1fr}
  .clone-aijjxs .ajx-grid3{grid-template-columns:1fr}
}
/* 真站 @media (max-width:900px): .grid2 单列 + 封面推荐卡图不换行 */
@media (max-width: 900px){
  .clone-aijjxs .ajx-grid2{grid-template-columns:1fr}
}
/* 真站 @media (max-width:680px): 列表行允许换行 + .listbg 左移减小 + detail 单列 */
@media (max-width: 680px){
  .clone-aijjxs .ajx-listbg{min-height:116px;padding:12px 12px 12px 100px}
  .clone-aijjxs .ajx-listbg button[style*="left: 16px"],.clone-aijjxs .ajx-listbg > button:first-child{left:12px;top:12px;width:76px;height:104px}
  .clone-aijjxs .ajx-detail{grid-template-columns:84px minmax(0,1fr)}
  .clone-aijjxs .ajx-kpi{grid-template-columns:repeat(2,minmax(0,1fr))}
  .clone-aijjxs .ajx-search-form{grid-template-columns:minmax(0,1fr) 96px}
}
/* 真站 @media (max-width:640px)(toc 内联): .chapter-list 单列 + 标题 22px */
@media (max-width: 640px){
  .clone-aijjxs .ajx-chapter-list{grid-template-columns:1fr}
  .clone-aijjxs .ajx-read-title{font-size:22px}
}
/* 兜底: 375px 无横向滚动(行内容均 ellipsis 截断) */
.clone-aijjxs .ajx-home,.clone-aijjxs .ajx-cat,.clone-aijjxs .ajx-book-page,.clone-aijjxs .ajx-toc,.clone-aijjxs .ajx-read,.clone-aijjxs .ajx-ft,.clone-aijjxs .ajx-search{overflow-x:hidden}
`,
}

