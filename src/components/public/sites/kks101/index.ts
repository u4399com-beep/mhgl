// ============================================================
// [R26-3-6] kks101(101看書) 模板集合出口 —— 10 站×5 页型克隆之三
// 站点: 101kks.com(101看書 · 蓝白经典繁体书站 · 杰奇系新版模板)
// 页型: Home(大站标+圆角搜索+蓝快捷入口+书单卡/行式列表+标签云)
//       Category(小說分類筛选条+封面网格+點擊排行列表+pagelink 分页)
//       Book(面包屑+封面信息+按钮组+标签+目录/简介 tab+本周最強榜)
//       Toc(shuye 页头+正序/倒序+.catalog 三列章节列表+分页)
//       Read(工具圆钮条+居中标题+来源行+2 倍行高正文+page1 四格导航)
// CSS: 全部选择器以 .clone-kks101 作用域开头, 色值/字号/行高均出自真站 /css/style.css 实测
// (实测样本: /tmp/r26/kks101-style.css + probe-101kks.com.html + cat3/book/toc/read 四内页快照)
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { Kks101Home } from './Home'
import { Kks101Category } from './Category'
import { Kks101Book } from './Book'
import { Kks101Toc } from './Toc'
import { Kks101Read } from './Read'

export const kks101Template: SiteTemplateSet = {
  Home: Kks101Home,
  Category: Kks101Category,
  Book: Kks101Book,
  Toc: Kks101Toc,
  Read: Kks101Read,
  // [R26-3-6] 站点级克隆 CSS —— 伪类/复杂选择器集中于此; 逐条注明真站规则出处
  css: `
/* [R26-3-6] 基底: 真站 body{background:#f2f3f4;color:#333;font-size:14px;font-family:"Microsoft YaHei"} */
.clone-kks101{background:#f2f3f4;color:#333;font-size:14px}
/* [R26-3-6] .mybox 白卡: 阴影 0 1px 3px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.24)/圆角 3px/padding 16px/margin 24px 0 */
.clone-kks101 .kks-mybox{background-color:#fff;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.24);padding:16px;margin:24px 0}
/* [R26-3-6] .mytitle 板块标题: 16px/底边 rgba(150,150,150,.2)/pb 5px(不设 top 外距, 让位 Tailwind mt-* 工具类) */
.clone-kks101 .kks-mytitle{margin-bottom:10px;border-bottom:1px solid rgba(150,150,150,.2);padding-bottom:5px;font-size:16px;font-weight:700}
/* [R26-3-6] .bread 面包屑: a #1f6cb2, 站内 hover #06c(真站 a:hover) */
.clone-kks101 .kks-bread button{color:#1f6cb2;transition:color .3s ease}
.clone-kks101 .kks-bread button:hover{color:#06c;text-decoration:underline}
/* [R26-3-6] .btn 蓝钮(.addbtn .btn: line-height 36px/padding 0 15px/16px/圆角 5px; hover 投影 0 0 10px rgba(0,0,0,.2)) */
.clone-kks101 .kks-btn{text-align:center;border-radius:5px;background:#1f6cb2;cursor:pointer;border:none;color:#fff;line-height:36px;padding:0 15px;font-size:16px;transition:box-shadow .3s ease}
.clone-kks101 .kks-btn:hover{box-shadow:0 0 10px rgba(0,0,0,.2);color:#fff}
/* [R26-3-6] .infotag a/.tag ul a 标签胶囊: .8rem/line-height 1.8rem/边 1px #56a6c3/圆角 10px/底 rgb(232,244,255)/字 #1f6cb2 */
.clone-kks101 .kks-tagbtn{font-size:.8rem;line-height:1.8rem;display:inline-block;padding:0 .725rem;text-align:center;border:1px solid #56a6c3;border-radius:10px;background:rgb(232,244,255);color:#1f6cb2;transition:opacity .2s ease}
.clone-kks101 .kks-tagbtn:hover{opacity:.8}
/* .infotag a 的 padding 0 .5rem 变体(书页標籤区) */
.clone-kks101 .kks-tagbtn-sm{padding:0 .5rem}
/* [R26-3-6] 正文段落(真站 .txtnav p: line-height 2/padding 10px 0/text-indent 5%/word-wrap break-word) */
.clone-kks101 .kks-txt p{line-height:2;padding:10px 0;text-indent:5%;word-wrap:break-word}
/* [R26-3-6] .page1 四格导航: 16px/line-height 48px/右边线 rgb(191 191 191 / 24%)/hover #f8f8f8 */
.clone-kks101 .kks-page1-cell{text-align:center;line-height:48px;border-right:1px solid rgb(191 191 191 / 24%);transition:background .2s ease;cursor:pointer;background:transparent}
.clone-kks101 .kks-page1-cell:last-child{border-right:none}
.clone-kks101 .kks-page1-cell:hover:not(:disabled){background:#f8f8f8}
/* [R26-3-6] .tools li i 圆钮: 36px/圆角 100px/底 #4c5356/白字 */
.clone-kks101 .kks-tool{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:100px;background:#4c5356;color:#fff;transition:opacity .2s ease}
.clone-kks101 .kks-tool:hover{opacity:.85}
/* [R26-3-6] .pages a + .pagelink 分页(a: 底 #f1f1f1/字 #7a7a7a/min-width 45px/高 35px/圆角 3px, hover 白底;
   strong 当前页: .pagelink strong 后载覆盖 → 底 #caf1ff/字 #1f6cb2/700) */
.clone-kks101 .kks-pg{display:inline-block;margin:2px;padding:0 6px;min-width:45px;border-radius:3px;text-align:center;height:35px;line-height:35px;background:#f1f1f1;color:#7a7a7a;font-size:16px;cursor:pointer;transition:background .2s ease}
.clone-kks101 .kks-pg:hover{background-color:#ffffff}
.clone-kks101 .kks-pg:disabled{cursor:default}
.clone-kks101 .kks-pg-cur,.clone-kks101 .kks-pg-cur:hover{font-weight:bold;color:#1f6cb2;background:#caf1ff}
/* [R26-3-6] .booklist li hover(首页行式列表): hover #f9f9f9 + 封面 scale 1.1(transition all .5s) */
.clone-kks101 .kks-bookrow{transition:background .3s ease}
.clone-kks101 .kks-bookrow:hover{background:#f9f9f9}
.clone-kks101 .kks-bookrow img,.clone-kks101 .kks-cell img{transition:all .5s}
.clone-kks101 .kks-bookrow:hover img,.clone-kks101 .kks-cell:hover img{transform:scale(1.1)}
/* [R26-3-6] .newbox .newnav h3 a hover #1f6cb2(分類列表行标题) */
.clone-kks101 .kks-newtitle{transition:color .3s ease}
.clone-kks101 .kks-newtitle:hover{color:#1f6cb2}
/* [R26-3-6] .newbox .labelbox label: 右边线 1px #ddd/padding-right 10px/margin-right 10px(末项无线) */
.clone-kks101 .kks-labelbox-item{border-right:1px solid #ddd;line-height:1;padding-right:10px;margin-right:10px}
.clone-kks101 .kks-labelbox-item:last-child{border-right:none}
/* [R26-3-6] 响应式: <768px 收窄白盒内距/外距(真站 .mybox 恒 16px, 此处为窄屏可读性微调), 页1 行高 44px; 单列由组件网格断点保证, 禁横向滚动 */
@media (max-width:767px){
  .clone-kks101 .kks-mybox{padding:12px;margin:16px 0}
  .clone-kks101 .kks-page1-cell{line-height:44px}
  .clone-kks101 .kks-pg{min-width:34px;padding:0 4px}
}
`,
}
