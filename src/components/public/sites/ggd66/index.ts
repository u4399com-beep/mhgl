// ============================================================
// [R27-6-6] ggd66(格格党) 模板集合出口 —— 10 站×5 页型克隆之五(ggd66 补全)
// 站点: www.ggd66.com(格格党 · 青绿极简模板 /static/simple/style.css, @charset gb2312)
// 页型: Home(fengtui 封面推荐两列+fengyou 搜索/排行+zuixin 最新+gengxin 五段更新行)
//       Category(.class 分类条+bookbox 三列文字卡+num 序号+.pages 分页)
//       Book(面包屑+thumbnail 封面+booktag chips+bookmore 按钮组+最新/全部章节 dd 网格)
//       Toc(书页内 #list-chapterAll 目录块独立成页+当前章高亮+分页)
//       Read(米黄 #FBF4EC 纸面+24px 正文+三钮导航+键盘 ←/→/Enter+相关阅读)
// CSS: 全部选择器以 .clone-ggd66 作用域开头, 色值/字号/行高均出自真站 /static/simple/style.css 实测
// (实测样本: /tmp/r27-f/ggd66-style.css + ggd66-home/sort/book/read 四页快照)
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { Ggd66Home } from './Home'
import { Ggd66Category } from './Category'
import { Ggd66Book } from './Book'
import { Ggd66Toc } from './Toc'
import { Ggd66Read } from './Read'

export const ggd66Template: SiteTemplateSet = {
  Home: Ggd66Home,
  Category: Ggd66Category,
  Book: Ggd66Book,
  Toc: Ggd66Toc,
  Read: Ggd66Read,
  // [R27-6-6] 站点级克隆 CSS —— 伪类/媒体查询集中于此; 逐条注明真站规则出处(ggd66-style.css)
  css: `
/* [R27-6-6] 基底: 真站 body{background-color:#f9f9f9;color:#888;font-size:15px;font-family:"微软雅黑";line-height:150%} */
.clone-ggd66{background:#f9f9f9;color:#888;font-size:15px;line-height:1.5}
/* [R27-6-6] 真站 a{color:#00886d} a:hover{color:#f50}(组件内交互件已显式配色, 此处兜底原生 <a> 仅 TXT 下载钮) */
.clone-ggd66 a{color:#00886d;text-decoration:none}
/* [R27-6-6] 真站 h2{margin-top:10px;padding:0 0 10px;border-bottom:1px solid #ccc;color:#333;font-weight:500;font-size:18px} */
.clone-ggd66 .ggd-h2{margin-top:10px;padding:0 0 10px;border-bottom:1px solid #ccc;color:#333;font-weight:500;font-size:18px;line-height:1.4}
/* [R27-6-6] 真站 #fengtui .item dl dt{border-bottom:1px dotted #ccc}(书名行底点线) */
.clone-ggd66 .ggd-item-dt{border-color:#ccc;border-bottom-style:dotted}
/* [R27-6-6] 真站 .bookbox:hover .p10{border-color:#f50} + .bookbox:hover .num{background-color:#f50}(书库卡悬停翻橙) */
.clone-ggd66 .ggd-bookbox:hover .ggd-p10{border-color:#f50}
.clone-ggd66 .ggd-bookbox:hover .ggd-num{background-color:#f50}
/* [R27-6-6] 真站 .bookbox .delbutton a:hover{border-color:#f50;color:#f50}(阅读钮悬停翻橙) */
.clone-ggd66 .ggd-readbtn:hover{border-color:#f50;color:#f50}
/* [R27-6-6] 真站 .booktag a.red:hover{border-color:#bf2c24}(.blue:hover{border-color:#3f5a93} — chips 为非交互 span 不启用) */
/* [R27-6-6] 真站 .pages a:hover,.pages strong{background:#56ccb5;color:#fff}(分页钮/当前页 青绿底白字) */
.clone-ggd66 .ggd-pg{background:transparent;color:inherit;transition:background .15s ease,color .15s ease}
.clone-ggd66 .ggd-pg:hover{background:#56ccb5;color:#fff}
.clone-ggd66 .ggd-pages strong,.clone-ggd66 .ggd-pages strong:hover{background:#56ccb5;color:#fff;cursor:default}
/* [R27-6-6] 真站 ol.breadcrumb>li+li:before{padding:0 5px;color:#666;content:"\\00BB"}(» 分隔, 分隔符由组件渲染) */
/* [R27-6-6] 真站 .read .readcontent{letter-spacing:.1em;font-size:24px;line-height:180%;padding:10px 15px;border-top:1px solid #ccc} */
.clone-ggd66 .ggd-readcontent{font-size:24px;line-height:1.8;letter-spacing:.1em;padding:10px 15px;border-top-color:#ccc}
/* [R27-6-6] 真站 .read h1{margin-bottom:10px;font-size:26px}(.read h1 居中 #00886d 由组件承担) */
.clone-ggd66 .ggd-readtitle{font-weight:700}
/* [R27-6-6] 真站 .btn-default 悬停(bootstrap 形态 bg #e6e6e6 — 真站模板未自定义, 取 bootstrap 默认) */
.clone-ggd66 .ggd-navbtn:hover:not(:disabled){background:#eee;color:#333}
/* [R27-6-6] 响应式(真站 @media 实测): ≤947px 章节列 33.333% → 组件 lg:1/4·sm:1/2 断点近似;
   ≤767px .read .readcontent{padding:10px 0}(左右零内距) + #gengxin s3/s4 隐藏(组件 hidden sm:block);
   ≤467px .read h1{font-size:20px} + .read .readcontent{font-size:18px} + .chapterlist dd{width:100%} */
@media (max-width:767px){
  .clone-ggd66 .ggd-readcontent{padding-left:0;padding-right:0}
}
@media (max-width:467px){
  .clone-ggd66 .ggd-readtitle{font-size:20px}
  .clone-ggd66 .ggd-readcontent{font-size:18px}
}
/* [R27-6-6] 375px 防横滚兜底: 版心恒 90%(真站 .container{width:90%;max-width:75pc=1200px}) */
`,
}
