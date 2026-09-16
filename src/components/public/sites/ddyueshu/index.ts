// ============================================================
// [R28-2a2] ddyueshu(顶点小说 www.ddyueshu.cc) 6 页型克隆模板集 —— 经典笔趣阁老式模板。
//   基础五视图: Home.tsx 首页 / Category.tsx 分类页 / Book.tsx 书页 / Toc.tsx 目录页 / Read.tsx 章节页
//   扩展一视图: Fulltext.tsx 全部小说大全(真站 /xiaoshuodaquan/ 实测)
//   Search 不实现: 真站无站内搜索结果页 —— 2026-09-16 直连实测: header 搜索表单
//   (bqg_panel() 注入 .header_search)action= https://so.biqusoso.com/s1.php target=_blank
//   为第三方站外搜索引擎(参数 ie/siteid/s/q); GET /modules/article/search.php?searchkey=
//   实测 200/0 字节(空壳无结果页); 前轮 POST 探针快照亦 0 字节。view:'search' 深链由
//   SearchView 通用兜底承接(契约默认行为)。
//   Ranking 已补齐([R28-2h] 主控据快照 ddyueshu-rank.html 补建: .wrap.rank 8 块结构,
//   top3 #FA744E 圆徽/.tli lh38 虚线行逐条实测; 真站单一总榜 → 契约三榜 tab 声明)。
//
//   勘察产物(/tmp/r28-2a/ddyueshu/, 2026-09-16 直连实抓, GB18030→UTF8 存 .html):
//   ddyueshu-home(-utf8).html / ddyueshu-cat.html / ddyueshu-book.html / ddyueshu-chapter.html
//   / ddyueshu-fulltext.html(265KB, 3010 条书链) / ddyueshu-rank.html
//   + ddyueshu-biquge-css.raw(/images/biquge.css 21KB, 首页/书页/章节页样式)
//   + ddyueshu-style-css.raw(/css/style.css 15KB, 分类页/大全页样式) 全量。
//
//   css 字段: 仅承载组件内难以表达的 :hover/伪类/复合选择器与响应式断点(交互态颜色不可
//   内联, 会被 inline 覆盖), 全部以 .clone-ddyueshu 开头(PublicSite 在 .clone-{id} 作用域
//   注入, 禁止全局污染); 静态结构值在组件内联。色值逐条注真站出处。
// ============================================================
'use client'

import type { SiteTemplateSet } from '../shared'
import { DdyueshuHome } from './Home'
import { DdyueshuCategory } from './Category'
import { DdyueshuBook } from './Book'
import { DdyueshuToc } from './Toc'
import { DdyueshuRead } from './Read'
import { DdyueshuFulltext } from './Fulltext'
import { DdyueshuRanking } from './Ranking'

export const ddyueshuTemplate: SiteTemplateSet = {
  Home: DdyueshuHome,
  Category: DdyueshuCategory,
  Book: DdyueshuBook,
  Toc: DdyueshuToc,
  Read: DdyueshuRead,
  Fulltext: DdyueshuFulltext,
  Ranking: DdyueshuRanking,
  // [R28-2a2-1] 站点克隆 CSS — 选择器全部以 .clone-ddyueshu 开头, 每条注真站 CSS 出处
  css: `
/* 页面底色/基色(biquge.css L2 body: bg #E9FAFF · color #555) */
.clone-ddyueshu .dy-page{background:#E9FAFF;color:#555}
/* 链接基色(biquge L4 a #6F78A7)与 hover(css/style.css L10 a:hover #FD5500 下划线; biquge L5 top:-1px 对 static 定位无效, 不还原) */
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
.clone-ddyueshu .dy-page .dy-bt-link{color:#085308;text-decoration:none}
.clone-ddyueshu .dy-page .dy-bt-link:hover{color:#FD5500;text-decoration:underline}
/* 阅读页面包屑(con_top 内链接, biquge L133; 基色同全局 a, hover 走 style.css L10 #FD5500) */
.clone-ddyueshu .dy-page .dy-crumb{color:#6F78A7;text-decoration:none}
.clone-ddyueshu .dy-page .dy-crumb:hover{color:#FD5500;text-decoration:underline}
/* 目录当前章高亮(真站 .novellist li a:visited{COLOR:red} 基因, style.css L195-196) */
.clone-ddyueshu .dy-page .dy-cur{color:#CC3300}
.clone-ddyueshu .dy-page .dy-cur a{color:#CC3300}
/* .novelslist .content 右点线(biquge L77); <1000px 降单列时去右线 */
.clone-ddyueshu .dy-page .dy-cell{border-right:1px dotted #A6D3E8}
@media (max-width:999px){.clone-ddyueshu .dy-page .dy-cell{border-right:none}}
/* 全部小说大全 .MessageDiv 提示条(style.css L190: bg #FFF9D9 · 边 1px #FFCC33 · 居中) */
.clone-ddyueshu .dy-page .dy-msg{background:#FFF9D9;border:1px solid #FFCC33}
/* 全部小说大全 .novellist(style.css L191-196: li 浮动 20% 底边 #DDD #B3B3B3, a #6F78A7; visited 红基因不还原) — li 宽走 css 以便响应式断点覆盖 */
.clone-ddyueshu .dy-page .dy-nl li{width:20%}
.clone-ddyueshu .dy-page .dy-nl li .dy-nl-a{color:#6F78A7;text-decoration:none}
.clone-ddyueshu .dy-page .dy-nl li .dy-nl-a:hover{color:#FD5500;text-decoration:underline}
/* 大全页 li 五列→窄屏双列(<640px, 375px 无横滚) */
@media (max-width:639px){.clone-ddyueshu .dy-page .dy-nl li{width:50%}}
/* 移动端禁横向滚动(行内容均省略号截断, 此处兜底) */
.clone-ddyueshu .dy-page{overflow-x:hidden}
`,
}
