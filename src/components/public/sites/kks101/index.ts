// ============================================================
// [R28-2f] kks101(101看書 101kks.com) 8 页型克隆模板集
//   基础五视图: Home.tsx 首页 / Category.tsx 分类页 / Book.tsx 书页 / Toc.tsx 目录页 / Read.tsx 章节页
//   扩展三视图: Ranking.tsx 排行榜(hot.html 实证) / Fulltext.tsx 完本(full.html 实证)
//              / Search.tsx 搜索结果(search2.html 实证; search.html 为 0 字节入口壳)
//   共享部件: parts.tsx(色板/MyBox/MyTitle/列表行/封面卡/分类胶囊/分页/面包屑)
//
//   快照(2026-09-16, /tmp/r28-2b/kks101/): home 971 行 / class 793 行 / book 695 行 /
//   toc 469 行 / read 355 行 / hot 1041 行 / last 428 行 / full 783 行 / search2 709 行
//   + style.css 3745 行 + block_booklist.css 400 行 全量。
//
//   css 字段: 仅承载组件内难以表达的 :hover/伪类/媒体查询/断点复刻,
//   全部选择器以 .clone-kks101 开头(PublicSite .clone-{id} 作用域注入, 禁全局污染);
//   每条规则注明快照出处文件+行号。色板摘要见 K(parts.tsx)。
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { Kks101Home } from './Home'
import { Kks101Category } from './Category'
import { Kks101Book } from './Book'
import { Kks101Toc } from './Toc'
import { Kks101Read } from './Read'
import { Kks101Ranking } from './Ranking'
import { Kks101Fulltext } from './Fulltext'
import { Kks101Search } from './Search'

export const kks101Template: SiteTemplateSet = {
  Home: Kks101Home,
  Category: Kks101Category,
  Book: Kks101Book,
  Toc: Kks101Toc,
  Read: Kks101Read,
  Ranking: Kks101Ranking,
  Fulltext: Kks101Fulltext,
  Search: Kks101Search,
  css: `
/* ==== 全局链接(hover/伪类/断点由本串承载; 基色 #666 / hover #06c ====
   style.css a L28-32, a:hover L39-42) ==== */
.clone-kks101 a{transition:color .3s ease}
.clone-kks101 button.kkx-bread-a:hover{color:#06c}
/* 列表行书名 hover 主蓝(style.css .newbox li:hover .newnav h3 a L1797-1799) */
.clone-kks101 button.kkx-rowtitle:hover{color:#1f6cb2}
/* 最近章節链 hover(style.css a:hover L39-42 同色承接) */
.clone-kks101 button.kkx-rowlatest:hover{color:#06c}
.clone-kks101 button.kkx-qustime-a:hover{color:#06c}
.clone-kks101 button.kkx-catalog-a:hover{color:#06c}
/* 标签胶囊 hover(style.css 全局 a:hover #06c L39-42) */
.clone-kks101 button.kkx-taga:hover{color:#06c}
/* 最近更新行书名 hover */
.clone-kks101 button.kkx-ru-name:hover,.clone-kks101 button.kkx-ru-chap:hover,.clone-kks101 button.kkx-yd-name:hover{color:#06c}

/* ==== 按钮系 ==== */
/* .btn:hover 投影(style.css L434-437) */
.clone-kks101 .kkx-btn:not(:disabled):hover{box-shadow:0 0 10px rgba(0,0,0,.2)}
/* 大搜索钮 hover 加深(style.css .error-text form button 无显式 hover → 加深, 推断等价) */
.clone-kks101 button.kkx-searchbtn:hover{color:#333}
/* 大搜索框聚焦 = 真站 .searchInputActive 态影(style.css L3649-3665: shadow 0 2px 8px 1px rgba(64,60,67,.24)) */
.clone-kks101 .kkx-searchinput:focus{box-shadow:0 2px 8px 1px rgba(64,60,67,.24);outline:none}

/* ==== 封面 hover 缩放(真站 .5s 过渡 + scale 1.1) ==== */
/* .newnovels li:hover .imgbox img scale(1.1)(style.css L1281-1291) */
.clone-kks101 .kkx-nvimg img{transition:all .5s}
.clone-kks101 .kkx-nvcard:hover .kkx-nvimg img{transform:scale(1.1)}
/* .newbox li:hover .imgbox img scale(1.1)(style.css L1793-1795) */
.clone-kks101 .kkx-rowimg img{transition:all .5s}
.clone-kks101 .kkx-newrow:hover .kkx-rowimg img{transform:scale(1.1)}

/* ==== 書單卡(hot 首页特色板块; block_booklist.css 逐条) ==== */
/* .booklist-card:hover: translateY(-2px)+shadow 0 6px 20px rgba(0,0,0,.12)+边框加深(L39-43) */
.clone-kks101 .kkx-blcard{transition:all .3s cubic-bezier(.4,0,.2,1)}
.clone-kks101 .kkx-blcard:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.12);border-color:rgba(0,0,0,.1)}
/* 大屏固定 3 列(block_booklist.css @min-width:1200px L16-20; 覆盖内联 auto-fill) */
@media (min-width:1200px){
  .clone-kks101 .kkx-blgrid{grid-template-columns:repeat(3,1fr) !important}
}

/* ==== 分页(.pagelink, style.css L2919-2944) ==== */
.clone-kks101 .kkx-page-a:hover{background-color:#ffffff;color:#1f6cb2}
.clone-kks101 .kkx-page-a.is-strong{background:#caf1ff}

/* ==== 阅读页 page1 hover(style.css .page1 a:hover L2360-2362) ==== */
.clone-kks101 .kkx-page1-a:not(:disabled):hover{background:#f8f8f8}
.clone-kks101 .kkx-black .kkx-page1-a:not(:disabled):hover{background:#3a3e41}

/* ================= 响应式断点(真站 990/1200/767/720 近似复刻; 375px 无横滚) ================= */
/* 真站 @media (max-width:990px): col-8/col-4 单列(L755-768) */
@media (max-width: 990px){
  .clone-kks101 .kkx-bookrow > li{width:100% !important}
  /* .booknav2 h1 降 16px(L797-799) */
  .clone-kks101 .kkx-booknav2 h1{font-size:16px !important}
  /* .newbox .newright/.zxzj 隐藏 + 封面 70×95(L1974-1982) */
  .clone-kks101 .kkx-rowright,.clone-kks101 .kkx-zxzj{display:none !important}
  .clone-kks101 .kkx-rowimg{width:70px !important;height:95px !important}
  /* .shuye 面包屑隐藏 + .titxt 書頁显示(L2076-2082) */
  .clone-kks101 .kkx-toc-bread{display:none}
  .clone-kks101 .kkx-titxt{display:block !important}
  /* 目录三列改单列(L2084-2086) */
  .clone-kks101 .kkx-catalog-ul li{width:100% !important}
}
/* 真站 @media (max-width:1200px): newnovels li 15%(L1462-1465) */
@media (max-width: 1199px){
  .clone-kks101 .kkx-nv2 .kkx-nvcard{width:15%}
}
/* 真站 @media (max-width:767px): newnovels li 23%(L1476-1480) */
@media (max-width: 767px){
  .clone-kks101 .kkx-nv2 .kkx-nvcard{width:23%}
}
/* 真站 @media (max-width:720px) */
@media (max-width: 720px){
  /* .hide720 面包屑/作者行隐藏(L1681-1683, L2284-2286) */
  .clone-kks101 .kkx-hide720{display:none !important}
  /* .txtnav padding 0(L2280-2282) */
  .clone-kks101 .kkx-txtnav{padding:0 !important}
  /* .page1 负边距贴边(L2392-2402) */
  .clone-kks101 .kkx-page1{margin:15px -15px -15px -15px !important}
  /* .indexdaohang li 45% 双列(L3342-3350) */
  .clone-kks101 .kkx-daohang li{width:45% !important;min-width:0 !important;margin:.3rem !important}
  /* .recentupdate2 行收窄: 章节列隐藏(L1745-1752) */
  .clone-kks101 .kkx-ru-chap{display:none !important}
  .clone-kks101 .kkx-ru-name{width:70% !important}
  /* 封面小卡降尺寸(.imgbox 80×115, L1482-1487) */
  .clone-kks101 .kkx-nvimg{width:80px !important;height:115px !important}
}
/* block_booklist.css @max-width:991px: 卡 110px/封面区 100px/栈 80×100(L241-258) */
@media (max-width: 991px){
  .clone-kks101 .kkx-blcard{height:110px !important}
  .clone-kks101 .kkx-blcover{flex:0 0 100px !important}
}
/* block_booklist.css @max-width:480px: 网格单列/卡 100px/封面区 90px(L293-309) */
@media (max-width: 480px){
  .clone-kks101 .kkx-blgrid{grid-template-columns:1fr !important}
  .clone-kks101 .kkx-blcard{height:100px !important}
  .clone-kks101 .kkx-blcover{flex:0 0 90px !important}
  /* 书页封面 130×180/信息区收窄(真站 @990 .bookimg2 130×180 L778-791, 375px 再降) */
  .clone-kks101 .kkx-bookimg2{width:110px !important;height:150px !important}
  .clone-kks101 .kkx-booknav2{min-width:0 !important}
  .clone-kks101 .kkx-bookbox{padding:0 !important;gap:12px !important}
}
/* 兜底: 375px 无横向滚动(行式卡内容均 ellipsis 截断) */
.clone-kks101 .kkx-container,.clone-kks101 .kkx-mybox{overflow-x:hidden}
`,
}

