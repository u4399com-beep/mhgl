// ============================================================
// [R39-2a] aijjxs(久久小说下载网 www.aijjxs.com) 8 页型克隆模板集
//   基础五视图: Home.tsx 首页 / Category.tsx 分类页 / Book.tsx 书页 / Toc.tsx 目录页 / Read.tsx 章节页
//   扩展三视图: Fulltext.tsx 全站书库(真站 /txt/) / Search.tsx 搜索结果(推断级, 真站 POST 搜索无结果页快照)
//   Ranking 不实现: 真站无独立排行页(榜单仅为首页 aside「点击榜/一周热榜」板块, 见 Home.tsx;
//   快照 2026-09-18 直连实抓复核无 /top/ /paihang/ 类路由)。
//
//   勘察产物(/tmp/r39-snap/aijjxs/, 2026-09-18 直连实抓):
//   home.html(52.9KB) / category.html(/txt/chuanyue/ 17.8KB) / book.html(/txt/57384.html 12.7KB)
//   / read.html(/read/57384/ 章节列表) / read2.html(/read/47/57384/2.html 正文页 27.7KB)
//   + css-0-style.css(39.7KB) / css-1-Common.css(18.9KB) / css-read.css(read.css 13.0KB) 三份真站样式全量。
//
//   css 字段: 仅承载组件内难以表达的 :hover/伪类/媒体查询, 全部以 .clone-aijjxs 开头
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
/* ---- 全局链接过渡(真站 style.css a 基线: color var(--brand-dark)=#115e59, hover var(--brand)=#0f766e) ---- */
.clone-aijjxs a{transition:color .15s ease}
.clone-aijjxs .ajx-line a{color:#115e59;text-decoration:none}
.clone-aijjxs .ajx-line a:hover{color:#0f766e;text-decoration:underline}
/* 真站 .book a:hover: #09B295 无下划线(style.css .book a:hover 实测) */
.clone-aijjxs .ajx-book-card a{color:#115e59;text-decoration:none}
.clone-aijjxs .ajx-book-card a:hover{color:#09B295;text-decoration:none}
/* ---- 顶导航胶囊(真站 .top-float-nav a: padding 6px 7px radius 8 weight 800; hover 白底 75%) ---- */
.clone-aijjxs .ajx-tf-a{color:#115e59;text-decoration:none}
.clone-aijjxs .ajx-tf-a:hover{color:#0b5f58;background:rgba(255,255,255,.75);text-decoration:none}
/* ---- 首页「展示更多」按钮 hover(真站 .latest-upload-more:hover: #d6a63d/#b27400/#fffaf0) ---- */
.clone-aijjxs button.ajx-more:hover,.clone-aijjxs a.ajx-more:hover{border-color:#d6a63d;color:#b27400;background:#fffaf0}
/* ---- 书页下载钮 hover(真站 .download-btn:hover: #c94a20→#9e350f 加深+投影) ---- */
.clone-aijjxs .ajx-download-btn{transition:all .15s ease}
.clone-aijjxs .ajx-dl-read:hover{background:linear-gradient(135deg,#0f766e,#0b5f58)!important;box-shadow:0 12px 20px rgba(15,118,110,.28);color:#fff}
.clone-aijjxs .ajx-dl-toc:hover{background:linear-gradient(135deg,#c94a20,#9e350f)!important;box-shadow:0 12px 20px rgba(184,70,29,.3);color:#fff}
/* ---- 书页 copy-btn hover(真站 .copy-btn:hover: bg #e5fcfa) ---- */
.clone-aijjxs .ajx-copy-btn:hover{background:#e5fcfa;text-decoration:none;color:#0f766e}
/* ---- 分页钮 hover(真站 .pager a:hover: bg #f3ede1) ---- */
.clone-aijjxs .ajx-pager button:hover:not([disabled]){background:#f3ede1}
/* ---- 目录页章节格子 hover(真站 toc 内联 .chapter-list li:hover: #cfd9e8/#f9fbff) ---- */
.clone-aijjxs .ajx-chapter-list a{transition:border-color .15s ease,background .15s ease}
.clone-aijjxs .ajx-chapter-list a:hover{border-color:#cfd9e8;background:#f9fbff}
.clone-aijjxs .ajx-chapter-list a.is-active{border-color:#0f766e;color:#0f766e;background:#e8f7f4}
/* ---- 阅读页工具条字号钮(真站 read.css #fonts .s: 边 #d8cab7 radius 8 #6f4f34; 激活 #fbe8ce/#d8a366/#80410f) ---- */
.clone-aijjxs .ajx-s{transition:background .15s ease,border-color .15s ease}
.clone-aijjxs .ajx-s:hover{border-color:#d8a366}
.clone-aijjxs .ajx-s.is-active{background:#fbe8ce;border-color:#d8a366;color:#80410f}
/* ---- 背景色板圆点(真站 #skbglist .c 18px 圆形边 rgba(0,0,0,.25); 激活品牌色外圈近似) ---- */
.clone-aijjxs .ajx-c.is-active{box-shadow:0 0 0 2px rgba(15,118,110,.55)}
/* ---- 字体颜色菜单 hover(真站 #ys_menu a:hover: bg #f5efe6) ---- */
.clone-aijjxs .ajx-ys a{margin-right:8px;text-decoration:none}
.clone-aijjxs .ajx-ys a:hover{background:#f5efe6}
/* ---- 正文段落规格(真站 read.css #view_content_txt p: 段距 1.2em/缩进 2.4em/首段不缩进) ---- */
.clone-aijjxs .ajx-read-txt p{margin:0 0 1.2em;text-indent:2.4em}
.clone-aijjxs .ajx-read-txt p:first-child{text-indent:0}
/* ---- 搜索框聚焦(真站 .search input focus: 边 rgba(15,118,110,.45)+3px 光圈) ---- */
.clone-aijjxs .ajx-search input:focus{border-color:rgba(15,118,110,.45);box-shadow:0 0 0 3px rgba(15,118,110,.12)}
/* ---- 搜索按钮 hover(真站 button 无显式 hover → 品牌深色, 推断等价) ---- */
.clone-aijjxs .ajx-search button:hover{background:linear-gradient(135deg,#0b5f58,#0f766e)}
/* ---- 阅读页翻页钮(真站 .view_page 面板形态: 边 var(--line) 圆角 13 面板底) ---- */
.clone-aijjxs .ajx-view-page{display:flex;justify-content:center;gap:10px;padding:10px 9px;border:1px solid #e5dccd;border-radius:13px;background:rgba(255,253,248,.86)}
.clone-aijjxs .ajx-view-page button{padding:8px 18px;border:1px solid #d8cab7;border-radius:10px;background:#fff;color:#6b3418;font-size:14px;cursor:pointer}
.clone-aijjxs .ajx-view-page button:hover:not([disabled]){background:#fbe8ce;border-color:#d8a366;color:#80410f}
.clone-aijjxs .ajx-view-page button[disabled]{opacity:.45;cursor:not-allowed}

/* ================= 移动端(真站断点 980/900/680/640/560 近似复刻, 375px 无横向滚动) ================= */
@media (max-width: 980px){
  .clone-aijjxs .ajx-layout{grid-template-columns:1fr}
  .clone-aijjxs .ajx-grid2{grid-template-columns:1fr}
}
@media (max-width: 680px){
  .clone-aijjxs .ajx-books-2col{grid-template-columns:1fr}
  .clone-aijjxs .ajx-detail{grid-template-columns:84px minmax(0,1fr)}
  .clone-aijjxs .ajx-kpi{grid-template-columns:repeat(2,minmax(0,1fr))}
  .clone-aijjxs .ajx-search{grid-template-columns:minmax(0,1fr) 96px}
  .clone-aijjxs .ajx-duset{flex-wrap:wrap;gap:6px}
}
@media (max-width: 640px){
  .clone-aijjxs .ajx-chapter-list{grid-template-columns:1fr}
  .clone-aijjxs .ajx-read-title{font-size:22px}
}
/* 兜底: 375px 无横向滚动(行内容均 ellipsis 截断) */
.clone-aijjxs .ajx-home,.clone-aijjxs .ajx-cat,.clone-aijjxs .ajx-book-page,.clone-aijjxs .ajx-toc,.clone-aijjxs .ajx-read,.clone-aijjxs .ajx-ft,.clone-aijjxs .ajx-search,.clone-aijjxs .ajx-full{overflow-x:hidden}
`,
}
