// ============================================================
// [R26-1] aijjxs(久久小说下载网 www.aijjxs.com) 5 页型克隆模板集
//   Home.tsx 首页 / Category.tsx 分类页 / Book.tsx 书页 / Toc.tsx 目录页 / Read.tsx 章节页
//
//   勘察产物: /tmp/r26/probe-www.aijjxs.com.html(首页快照) + aijjxs-category/book/read/chapter
//   四内页快照 + aijjxs-style.css / aijjxs-read.css / aijjxs-yecha.css 三份真站样式全量实抓。
//
//   css 字段: 仅承载组件内难以表达的 :hover/伪类/段落选择器, 全部以 .clone-aijjxs 开头
//   (PublicSite 在 .clone-{id} 作用域注入, 禁止全局污染); 色值出处见各规则行注释。
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { AijjxsHome } from './Home'
import { AijjxsCategory } from './Category'
import { AijjxsBook } from './Book'
import { AijjxsToc } from './Toc'
import { AijjxsRead } from './Read'

export const aijjxsTemplate: SiteTemplateSet = {
  Home: AijjxsHome,
  Category: AijjxsCategory,
  Book: AijjxsBook,
  Toc: AijjxsToc,
  Read: AijjxsRead,
  css: `
/* ---- 全局链接过渡(真站 a 交互基线) ---- */
.clone-aijjxs a{transition:color .15s ease}
/* ---- 站内链接 hover 三态(真站 a:hover: brandDark→brand+下划线; .book a:hover: #09B295 无下划线) ---- */
.clone-aijjxs a.ajx-a{color:#115e59;text-decoration:none}
.clone-aijjxs a.ajx-a:hover{color:#0f766e;text-decoration:underline}
.clone-aijjxs a.ajx-book{color:#115e59;text-decoration:none}
.clone-aijjxs a.ajx-book:hover{color:#09B295;text-decoration:none}
.clone-aijjxs a.ajx-flat{color:#0f766e;text-decoration:none}
.clone-aijjxs a.ajx-flat:hover{color:#0b5f58;text-decoration:none}
/* ---- 阅读页链接(真站 read.css a: #6b3418, hover #a85a2a, 无下划线) ---- */
.clone-aijjxs a.ajx-rl{color:#6b3418;text-decoration:none}
.clone-aijjxs a.ajx-rl:hover{color:#a85a2a;text-decoration:none}
/* ---- 首页「展示更多」按钮 hover(真站 .latest-upload-more:hover: #d6a63d/#b27400/#fffaf0) ---- */
.clone-aijjxs .ajx-more:hover{border-color:#d6a63d;color:#b27400;background:#fffaf0}
/* ---- 书籍页 download-btn hover(真站 .download-btn:hover: #c94a20→#9e350f 加深) ---- */
.clone-aijjxs a.ajx-dl:hover{background:linear-gradient(135deg,#c94a20,#9e350f);box-shadow:0 12px 20px rgba(184,70,29,.3);text-decoration:none;color:#fff}
/* ---- 分类页图文书名 hover(真站 .cenMain .catalog .listbg .title a:hover: #09B295) ---- */
.clone-aijjxs a.ajx-cat-title:hover{color:#09B295}
/* ---- 分页钮 hover(真站 .pager a:hover: #f3ede1) ---- */
.clone-aijjxs .ajx-pager a:hover{background:#f3ede1;text-decoration:none}
/* ---- 目录页章节格子 hover(真站 /read/{bid}/ 内联 .chapter-list li:hover: #cfd9e8/#f9fbff) ---- */
.clone-aijjxs .ajx-toc-item{transition:border-color .15s ease,background .15s ease}
.clone-aijjxs .ajx-toc-item:hover{border-color:#cfd9e8;background:#f9fbff}
/* ---- 阅读页工具条字号钮(真站 #fonts .s: 边 #d8cab7 radius 8 #6f4f34; 激活 #fbe8ce/#d8a366/#80410f) ---- */
.clone-aijjxs .ajx-fs{border:1px solid #d8cab7;border-radius:8px;padding:1px 7px;color:#6f4f34;background:#fff;cursor:pointer;font-size:13px}
.clone-aijjxs .ajx-fs:hover{border-color:#d8a366}
.clone-aijjxs .ajx-fs.is-active{background:#fbe8ce;border-color:#d8a366;color:#80410f}
/* ---- 阅读页背景色板圆点(真站 #skbglist .c: 18px 圆 + rgba(0,0,0,.25) 边; 激活外圈 brand) ---- */
.clone-aijjxs .ajx-swatch{display:inline-flex;width:18px;height:18px;border-radius:999px;border:1px solid rgba(0,0,0,.25);cursor:pointer;padding:0}
.clone-aijjxs .ajx-swatch.is-active{box-shadow:0 0 0 2px rgba(15,118,110,.55)}
/* ---- 正文段落规格(真站 read.css #view_content_txt p: 段距 1.2em/缩进 2.4em/首段不缩进) ---- */
.clone-aijjxs .ajx-read-txt p{margin:0 0 1.2em;text-indent:2.4em}
.clone-aijjxs .ajx-read-txt p:first-child{text-indent:0}
`,
}
