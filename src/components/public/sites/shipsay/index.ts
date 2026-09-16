// ============================================================
// [R27-6b-12] shipsay(船说 CMS demo) 模板集合出口 —— 3 个不可达站 Wayback 补全之二
// 站点: demo.shipsay.com(船说 CMS V4.2 官方 demo · 默认模板 /static/shipsay/style.css +
// font-awesome 4.7 · 960px 版心/body #f4f4f4)
// 页型: Home(side_commend 大神 6+热门 12+分类块+lastupdate 30+最新 30+友链)  [Wayback 实测 2024]
//       Category(store 页 #after_menu 分类链+封面卡列表+分页)                  [Wayback 实测 2024]
//       Book(novel_info_main+ulcard tabs+#info+#catalog 全章节)                [Wayback 实测 2023]
//       Toc(#catalog 块独立成页, 三列章节行+分页)                              [家族标准]
//       Read(白卡+h1 居中+正文+三钮导航+键盘)                                  [家族标准]
// CSS: 全部选择器以 .clone-shipsay 作用域开头; 色值出处: R24 真站直连实测
// (/tmp/r25/shipsay-home.html 36KB 逐字节分析: #f4f4f4 底/#fff 卡/#666 14px/#1a1a1a 链接/
//  #ed4259 hover/#555 标题/em 蓝 #4284ed 橙 #f0643a/完本遮罩 rgba(191,44,36,.75))
// + 2024 Wayback DOM 佐证。真站超时不可达, Toc/Read 按船说家族标准补全(见各文件头注)。
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { ShipsayHome } from './Home'
import { ShipsayCategory } from './Category'
import { ShipsayBook } from './Book'
import { ShipsayToc } from './Toc'
import { ShipsayRead } from './Read'

export const shipsayTemplate: SiteTemplateSet = {
  Home: ShipsayHome,
  Category: ShipsayCategory,
  Book: ShipsayBook,
  Toc: ShipsayToc,
  Read: ShipsayRead,
  // [R27-6b-12] 站点级克隆 CSS —— 伪类/媒体查询集中于此; 逐条注明真站规则出处
  css: `
/* [R27-6b-12] 真站 body{background:#f4f4f4}(实测; theme vars.bg=#fbfbfb 差一档, 以组件底色铺满为准) */
.clone-shipsay{background:#f4f4f4;color:#666;font-size:14px}
/* [R27-6b-12] 真站白卡面(.side_commend/.lastupdate/section 等 960px 面板均 #fff 无圆角) */
.clone-shipsay .ss-card{background:#fff}
/* [R27-6b-12] 真站 a{color:#1a1a1a} a:hover{color:#ed4259}(实测; 组件内交互件已显式配色, 此处兜底原生 <a> 仅 TXT 钮/友链) */
.clone-shipsay a{color:#1a1a1a;text-decoration:none}
.clone-shipsay a:hover{color:#ed4259}
/* [R27-6b-12] 真站 .img_span a:hover img{transform:scale(1.1)}(封面悬停微放大, 组件 transition 承担) */
/* [R27-6b-12] 真站分页钮: 白底灰边圆角, hover/当前页 #ed4259 白字(家族标准形态) */
.clone-shipsay .ss-pg{background:#fff;color:#666;border-color:#e3e3e3;transition:background .15s ease,color .15s ease}
.clone-shipsay .ss-pg:hover:not(:disabled){background:#ed4259;color:#fff;border-color:#ed4259}
/* [R27-6b-12] 真站阅读页正文(家族标准: 16px/26px 段落 2em 缩进) */
.clone-shipsay .ss-readcontent p{margin:0 0 10px;text-indent:2em}
/* [R27-6b-12] 响应式: 真站 ≤959px 大神卡半宽/≤639px 全宽 → 组件 sm/lg 断点近似; 375px 单列无横滚 */
`,
}
