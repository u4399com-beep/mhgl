// ============================================================
// [R28-2c] ggd66(格格党) 模板集合出口 —— R28 八页型重建
// 站点: www.ggd66.com(格格党 · 青绿极简模板 /static/simple/style.css, @charset gb2312, R28 实测直连 200)
// 页型覆盖(R28 真站实测): Home / Category(/sort/) / Book(/qu/{id}/) / Toc(书页内 #list-chapterAll
//   目录块独立成页=映射声明) / Read(/qu/{id}/{cid}.html) / Fulltext(/quanben/sort/ 真站导航「全本」实链,
//   R28 新探明) / Search(/search/ POST searchkey) —— 7 视图实现
// Ranking: 真站无排行榜独立页(/top/ /paihang/ /rank/ top.html 全 404 实测; 首页 #fengyou「阅读排行榜」
//   为首页模块非独立页) → 按任务书跳过 Ranking 视图, 视图壳走通用兜底。
// 实测样本: /tmp/r28-2c/ggd66/{ggd66-home,sort,quanben,search,book,read}.html + ggd66-style.css
// CSS: 全部选择器以 .clone-ggd66 作用域开头, 色值/字号/行高均出自真站 /static/simple/style.css 实测
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { Ggd66Home } from './Home'
import { Ggd66Category } from './Category'
import { Ggd66Book } from './Book'
import { Ggd66Toc } from './Toc'
import { Ggd66Read } from './Read'
import { Ggd66Fulltext } from './Fulltext'
import { Ggd66Search } from './Search'

export const ggd66Template: SiteTemplateSet = {
  Home: Ggd66Home,
  Category: Ggd66Category,
  Book: Ggd66Book,
  Toc: Ggd66Toc,
  Read: Ggd66Read,
  Fulltext: Ggd66Fulltext,
  Search: Ggd66Search,
  // [R28-2c] 站点级克隆 CSS —— 伪类/媒体查询集中于此; 逐条注明真站规则出处(ggd66-style.css)
  css: `
/* [R28-2c] 基底: 真站 body{background-color:#f9f9f9;color:#888;font-size:15px;font-family:"微软雅黑";line-height:150%} */
.clone-ggd66{background:#f9f9f9;color:#888;font-size:15px;line-height:1.5}
/* [R28-2c] 真站 a{color:#00886d} a:hover{color:#f50}(组件内交互件已显式配色, 此处兜底原生 <a> 仅 TXT 下载钮) */
.clone-ggd66 a{color:#00886d;text-decoration:none}
/* [R28-2c] 真站 h2{margin-top:10px;padding:0 0 10px;border-bottom:1px solid #ccc;color:#333;font-weight:500;font-size:18px} */
.clone-ggd66 .ggd-h2{margin-top:10px;padding:0 0 10px;border-bottom:1px solid #ccc;color:#333;font-weight:500;font-size:18px;line-height:1.4}
/* [R28-2c] 真站 #fengtui .item dl dt{border-bottom:1px dotted #ccc}(书名行底点线) */
.clone-ggd66 .ggd-item-dt{border-color:#ccc;border-bottom-style:dotted}
/* [R28-2c] 真站 .bookbox:hover .p10{border-color:#f50} + .bookbox:hover .num{background-color:#f50}(书库卡悬停翻橙) */
.clone-ggd66 .ggd-bookbox:hover .ggd-p10{border-color:#f50}
.clone-ggd66 .ggd-bookbox:hover .ggd-num{background-color:#f50}
/* [R28-2c] 真站 .bookbox .delbutton a:hover{border-color:#f50;color:#f50}(阅读钮悬停翻橙) */
.clone-ggd66 .ggd-readbtn:hover{border-color:#f50;color:#f50}
/* [R28-2c] 真站 .booktag a.red:hover{border-color:#bf2c24}(.blue:hover{border-color:#3f5a93} — chips 为非交互 span 不启用) */
/* [R28-2c] 真站 .pages a:hover,.pages strong{background:#56ccb5;color:#fff}(分页钮/当前页 青绿底白字) */
.clone-ggd66 .ggd-pg{background:transparent;color:inherit;transition:background .15s ease,color .15s ease}
.clone-ggd66 .ggd-pg:hover{background:#56ccb5;color:#fff}
.clone-ggd66 .ggd-pages strong,.clone-ggd66 .ggd-pages strong:hover{background:#56ccb5;color:#fff;cursor:default}
/* [R28-2c] 真站 ol.breadcrumb>li+li:before{padding:0 5px;color:#666;content:"\\00BB"}(» 分隔, 分隔符由组件渲染) */
/* [R28-2c] 真站 .read .readcontent{letter-spacing:.1em;font-size:24px;line-height:180%;padding:10px 15px;border-top:1px solid #ccc} */
.clone-ggd66 .ggd-readcontent{font-size:24px;line-height:1.8;letter-spacing:.1em;padding:10px 15px;border-top-color:#ccc}
/* [R28-2c] 真站 .read h1{margin-bottom:10px;font-size:26px}(.read h1 居中 #00886d 由组件承担) */
.clone-ggd66 .ggd-readtitle{font-weight:700}
/* [R28-2c] 真站 .btn-default 悬停(bootstrap 形态 bg #e6e6e6 — 真站模板未自定义, 取 bootstrap 默认) */
.clone-ggd66 .ggd-navbtn:hover:not(:disabled){background:#eee;color:#333}
/* [R28-2c] 响应式(真站 @media 实测): ≤947px 章节列 33.333% → 组件 lg:1/4·sm:1/2 断点近似;
   ≤767px .read .readcontent{padding:10px 0}(左右零内距) + #gengxin s3/s4 隐藏(组件 hidden sm:block);
   ≤467px .read h1{font-size:20px} + .read .readcontent{font-size:18px} + .chapterlist dd{width:100%} */
@media (max-width:767px){
  .clone-ggd66 .ggd-readcontent{padding-left:0;padding-right:0}
}
@media (max-width:467px){
  .clone-ggd66 .ggd-readtitle{font-size:20px}
  .clone-ggd66 .ggd-readcontent{font-size:18px}
}
/* [R28-2c] 375px 防横滚兜底: 版心恒 90%(真站 .container{width:90%;max-width:75pc=1200px}) */
`,
}
