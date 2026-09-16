// ============================================================
// [R26-5-6] ddyueshu(顶点小说 www.ddyueshu.cc) 5 页型克隆模板集 —— 经典笔趣阁老式模板。
//   真站勘察: 首页+书页+章节页用 /images/biquge.css(21KB 完整实测), 分类页/排行页用 /css/style.css
//   (15KB 完整实测), 全部值逐行核对(见各页型文件头注释)。页型导出名/SiteTemplateSet 契约见 ../shared。
//   css 字符串集中承载伪类/复合选择器(hover/分页/按钮/当前章), 全部 .clone-ddyueshu 作用域禁全局污染;
//   静态结构值在组件内联, 交互态颜色不可内联(会被 inline 覆盖)故走此处。
// ============================================================
'use client'

import type { SiteTemplateSet } from '../shared'
import { DdyueshuHome } from './Home'
import { DdyueshuCategory } from './Category'
import { DdyueshuBook } from './Book'
import { DdyueshuToc } from './Toc'
import { DdyueshuRead } from './Read'

export const ddyueshuTemplate: SiteTemplateSet = {
  Home: DdyueshuHome,
  Category: DdyueshuCategory,
  Book: DdyueshuBook,
  Toc: DdyueshuToc,
  Read: DdyueshuRead,
  // [R26-5-6a] 站点克隆 CSS — 选择器全部以 .clone-ddyueshu 开头
  css: `
/* 页面底色/基色(biquge.css L2 body: bg #E9FAFF · color #555) */
.clone-ddyueshu .dy-page{background:#E9FAFF;color:#555}
/* 链接基色(biquge L4 a #6F78A7)与 hover(css/style.css L10 #FD5500 下划线; biquge L5 top:-1px 对 static 定位无效, 不还原) */
.clone-ddyueshu .dy-page a{color:#6F78A7;text-decoration:none}
.clone-ddyueshu .dy-page a:hover{color:#FD5500;text-decoration:underline}
/* 目录 dd 行(#list dd a #444, biquge L155) — 置于 :hover 之前, 同特异度下 hover 胜出 */
.clone-ddyueshu .dy-page .dy-dd a{color:#444}
/* 操作按钮组(style.css L132 .downtxt: #459DF5 白字 圆角 2px lh 34px, hover #118860; .book_more L188 #88C6E5) */
.clone-ddyueshu .dy-page .dy-btn{display:block;width:100%;line-height:34px;margin:8px 0;border:none;border-radius:2px;font-size:14px;color:#fff;background:#459DF5;text-align:center;text-decoration:none;cursor:pointer}
.clone-ddyueshu .dy-page .dy-btn:hover{background:#118860}
.clone-ddyueshu .dy-page .dy-btn-more{background:#88C6E5}
.clone-ddyueshu .dy-page .dy-btn-more:hover{background:#68ACFA}
.clone-ddyueshu .dy-page .dy-btn:disabled{opacity:.5;cursor:default}
/* .page 分页(style.css L149-153: 白底 1px #BBB 方块, hover/active #00A86E 绿) */
.clone-ddyueshu .dy-page .dy-pg{margin:4px 10px 4px 0;padding:4px 12px;background:#fff;color:#666;border:1px solid #BBB;font-size:12px;line-height:16px;cursor:pointer}
.clone-ddyueshu .dy-page .dy-pg:hover{border-color:#00A86E;color:#00A86E}
/* 阅读页三连导航(biquge L169 .bottem1/.bottem2 a #085308 14px) */
.clone-ddyueshu .dy-page .dy-bt-link{color:#085308}
.clone-ddyueshu .dy-page .dy-bt-link:hover{color:#FD5500;text-decoration:underline}
/* 目录当前章高亮(真站 .novellist li a:visited{COLOR:red} 基因, style.css L196) */
.clone-ddyueshu .dy-page .dy-cur a{color:#CC3300}
/* .novelslist .content 右点线(biquge L77); <1000px 降单列时去右线 */
.clone-ddyueshu .dy-page .dy-cell{border-right:1px dotted #A6D3E8}
@media (max-width:999px){.clone-ddyueshu .dy-page .dy-cell{border-right:none}}
/* 移动端禁横向滚动(行内容均省略号截断, 此处兜底) */
.clone-ddyueshu .dy-page{overflow-x:hidden}
`,
}
