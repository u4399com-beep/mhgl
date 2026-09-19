// ============================================================
// [R39-2d] ddyueshu(顶点小说 www.ddyueshu.cc) 8 页型克隆模板集
//   真站: biquge 经典模板(GBK), 980px 版心; 快照 /tmp/r39-snap/ddyueshu/(2026-09-18 直连实抓
//   home.v2 26KB / book.v2 87.8KB 雪中悍刀行 / paihangbang 13.7KB + biquge.css 全量)
//   页型覆盖: H首页 C分类 B书 T目录 R章节 + Ran排行(/paihangbang/ 快照 8 榜块, R39-2a agent 实测) Ful全部小说(/xiaoshuodaquan/) Sea搜索(家族标准 GET /modules/article/search.php)
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { DdyueshuHome } from './Home'
import { DdyueshuCategory } from './Category'
import { DdyueshuBook } from './Book'
import { DdyueshuToc } from './Toc'
import { DdyueshuRead } from './Read'
import { DdyueshuSearch } from './Search'
import { DdyueshuRanking } from './Ranking'
import { DdyueshuFulltext } from './Fulltext'

export const ddyueshuTemplate: SiteTemplateSet = {
  Home: DdyueshuHome,
  Category: DdyueshuCategory,
  Book: DdyueshuBook,
  Toc: DdyueshuToc,
  Read: DdyueshuRead,
  Ranking: DdyueshuRanking,
  Fulltext: DdyueshuFulltext,
  Search: DdyueshuSearch,
  css: `
/* ---- biquge.css 家族实测色值 ---- */
/* 版心(真站 #main 980px 居中) */
.clone-ddyueshu #ddy-main{width:980px;margin:0 auto;padding:0 0 10px}
.clone-ddyueshu .ddy-clear{clear:both;height:0;overflow:hidden}
/* header(真站 .header 61px: logo 左浮 250×60 文字缩进, 搜索 450px 左距 30) */
.clone-ddyueshu .ddy-header{height:61px;width:980px;margin:0 auto;display:flex;align-items:center}
.clone-ddyueshu .ddy-logo{display:block;width:250px;height:60px;line-height:60px;font-size:26px;font-weight:800;color:#459DF5;text-indent:0;overflow:hidden;white-space:nowrap}
.clone-ddyueshu .ddy-header-search{width:450px;margin-left:30px}
.clone-ddyueshu .ddy-header-search form{width:420px;height:32px;border-radius:2px;border:2px solid #88C6E5;position:relative;overflow:hidden;display:flex}
.clone-ddyueshu .ddy-search-text{flex:1;line-height:20px;padding:6px 0 6px 6px;border:none;outline:none;font-size:14px;color:#555;background:#fff}
.clone-ddyueshu .ddy-search-btn{border:none;width:100px;height:32px;background:#88C6E5;color:#fff;font-size:16px;cursor:pointer;-webkit-appearance:none}
/* [R40-b-3] 导航条基线规则(真站 biquge.css .nav 实测: #88C6E5 蓝底 40px 横排) — R39 轮漏写致裸文本竖排 */
.clone-ddyueshu .ddy-nav{background:#88C6E5;height:40px;overflow:hidden;width:980px;margin:10px auto auto}
.clone-ddyueshu .ddy-nav ul{list-style:none;margin:0;padding:0}
.clone-ddyueshu .ddy-nav ul:after{content:'';display:block;clear:both} /* 窄屏高度自适应时收拢浮动项 */
.clone-ddyueshu .ddy-nav ul li{float:left;line-height:44px}
.clone-ddyueshu .ddy-nav ul li a{color:#FFF;font-size:15px;font-weight:700;padding:0 14px;text-decoration:none}
/* [R40-b-4] 搜索框 hover(真站 .header_search form:hover 系) */
.clone-ddyueshu .ddy-header-search form:hover{border-color:#459DF5}
.clone-ddyueshu .ddy-header-search form:hover .ddy-search-btn{background:#459DF5}
/* 热点区(真站 #hotcontent: .l 695px 330px 米黄 3px #C3DFEA + .r 265px) */
.clone-ddyueshu .ddy-hotcontent{padding-top:10px}
.clone-ddyueshu .ddy-hot-l{background:#FEF9EF;border:3px solid #C3DFEA;float:left;height:330px;overflow:hidden;width:695px;padding:0 0 10px;box-sizing:border-box}
.clone-ddyueshu .ddy-hot-item{float:left;width:335px;padding:10px 0 0 10px;box-sizing:border-box}
.clone-ddyueshu .ddy-hot-img{display:block;float:left;width:120px;border:0;background:none;padding:0;cursor:pointer}
.clone-ddyueshu .ddy-hot-item dl{float:right;width:190px;padding:0 5px 0 0;margin:0}
.clone-ddyueshu .ddy-hot-item dl dt{border-bottom:1px dotted #A6D3E8;font-size:14px;font-weight:700;height:25px;line-height:25px;overflow:hidden;margin:0}
.clone-ddyueshu .ddy-hot-item dl dt span{color:#B3B3B3;float:right;font-weight:400}
.clone-ddyueshu .ddy-hot-item dl dd{height:120px;line-height:20px;overflow:hidden;text-indent:2em;padding:7px 0 0;margin:0;color:#555;font-size:12px}
.clone-ddyueshu .ddy-hot-r{border:3px solid #C3DFEA;float:right;width:265px;background:#FEF9EF;box-sizing:border-box}
.clone-ddyueshu .ddy-hot-r h2{font-size:14px;height:30px;line-height:30px;margin:0;padding-left:10px;border-bottom:1px solid #A6D3E8;background:#F6F8FE}
.clone-ddyueshu .ddy-hot-r ul{list-style:none;padding:10px;margin:0}
.clone-ddyueshu .ddy-hot-r li span{display:inline-block;float:left}
.clone-ddyueshu .ddy-hot-r li .ddy-s1{width:44px;color:#555}
.clone-ddyueshu .ddy-hot-r li .ddy-s2{flex:1;color:#B3B3B3;overflow:hidden}
.clone-ddyueshu .ddy-hot-r li .ddy-s5{float:right;text-align:right;color:#B3B3B3}
/* 分类块(真站 .novelslist: 968px 3px #A6D3E8 边 米黄; .content 315px 点线右界) */
.clone-ddyueshu .ddy-novelslist{margin:2px auto;border:3px solid #A6D3E8;width:968px;padding:3px;background:#FEF9EF;box-sizing:border-box}
.clone-ddyueshu .ddy-nl-content ul li a{font-size:13px;color:#6F78A7} /* [R40-b-5] 真站 .novelslist .content ul li a */
.clone-ddyueshu .ddy-nl-content{border-right:dotted 1px #A6D3E8;padding:0 3px;float:left;width:315px;box-sizing:border-box}
.clone-ddyueshu .ddy-nl-content h2{border-bottom:solid 1px #A6D3E8;background:#F6F8FE;font-size:14px;font-weight:bold;padding-left:5px;line-height:25px;height:25px;overflow:hidden;margin:0}
.clone-ddyueshu .ddy-nl-img{display:block;float:left;width:71px;padding:10px 0 0 5px;border:0;background:none;cursor:pointer}
.clone-ddyueshu .ddy-nl-top dl{padding:10px 0 0 0;float:right;width:219px;margin:0}
.clone-ddyueshu .ddy-nl-top dl dt{height:25px;line-height:25px;overflow:hidden;font-weight:bold;margin:0}
.clone-ddyueshu .ddy-nl-top dl dd{line-height:20px;height:60px;overflow:hidden;margin:0;color:#555;font-size:12px}
.clone-ddyueshu .ddy-nl-content ul{list-style:none;padding:10px 0 0 0;margin:0;overflow:hidden} /* BFC 收拢浮动行, 令列分隔线与盒高等齐 */
.clone-ddyueshu .ddy-nl-content ul li{color:#B3B3B3;height:20px;line-height:20px;font-size:12px;overflow:hidden;float:left;width:150px;padding-left:5px} /* 宽 150≈真站 155(border-box 换算, 两列适配) */
/* 列表页(真站 #newscontent .l: 白底 边) */
.clone-ddyueshu .ddy-box-con{background:#fff;border:1px solid #A6D3E8;width:980px;box-sizing:border-box;margin-bottom:8px}
/* 面包屑(真站 .con_top: 底 #E1ECED 高 40 下界 #88C6E5) */
.clone-ddyueshu .ddy-con-top{height:40px;line-height:40px;padding:0 10px;font-size:12px;color:#555;background:#E1ECED;border-bottom:1px solid #88C6E5}
/* [R40-b-7] 加载/错误内衬(Book/Toc .ddy-box-con-inner 使用, R39 漏定义) */
.clone-ddyueshu .ddy-box-con-inner{padding:10px}
.clone-ddyueshu .ddy-con-top a{color:#6F78A7}
.clone-ddyueshu .ddy-newscontent{padding:10px}
.clone-ddyueshu .ddy-nc-l{width:100%}
.clone-ddyueshu .ddy-nc-l h2{font-size:15px;border-bottom:2px solid #88C6E5;line-height:28px;height:28px;margin:0 0 6px}
.clone-ddyueshu .ddy-ul-list{list-style:none;margin:0;padding:0}
.clone-ddyueshu .ddy-ul-list li{border-bottom:1px solid #eee;height:30px;line-height:30px;overflow:hidden;font-size:13px}
.clone-ddyueshu .ddy-ul-list li .ddy-s1{float:left;width:64px;color:#555}
.clone-ddyueshu .ddy-ul-list li .ddy-s2{float:left;width:170px;overflow:hidden}
.clone-ddyueshu .ddy-ul-list li .ddy-s3{float:left;color:#999;font-size:12px}
.clone-ddyueshu .ddy-ul-list li .ddy-s5{float:right;color:#B3B3B3}
.clone-ddyueshu .ddy-ul-list li a{color:#6F78A7} /* [R40-b-5] 真站列表行链接色 */
/* 首页最近更新/最新入库(真站 #newscontent 实测: .l 695px/.r 265px 边 3px #88C6E5 底 #E1ECED, h2 底 #A6D3E8) */
.clone-ddyueshu .ddy-news{margin:0 auto}
.clone-ddyueshu .ddy-news h2{margin:0;padding:0 0 0 10px;background:#A6D3E8;height:30px;line-height:30px;font-size:14px;font-weight:bold;border-bottom:1px solid #DDD;overflow:hidden}
.clone-ddyueshu .ddy-news-l{border:3px solid #88C6E5;float:left;width:695px;background:#E1ECED;box-sizing:border-box}
.clone-ddyueshu .ddy-news-r{float:right;width:265px;border:3px solid #88C6E5;background:#E1ECED;box-sizing:border-box}
.clone-ddyueshu .ddy-news ul{list-style:none;padding:10px;margin:0}
.clone-ddyueshu .ddy-news li{padding:5px 0 0 0;border-bottom:1px solid #DDD;height:25px;line-height:25px;overflow:hidden}
.clone-ddyueshu .ddy-news li span{float:left;display:inline-block}
.clone-ddyueshu .ddy-news-l li .ddy-s1{width:75px}
.clone-ddyueshu .ddy-news-l li .ddy-s2{width:165px}
.clone-ddyueshu .ddy-news-l li .ddy-s3{width:300px;color:#B3B3B3;font-size:12px}
.clone-ddyueshu .ddy-news-l li .ddy-s4{color:#B3B3B3;width:90px;text-align:right}
.clone-ddyueshu .ddy-news-l li .ddy-s5{color:#B3B3B3;float:right;text-align:right}
.clone-ddyueshu .ddy-news-r li .ddy-s1{width:40px}
.clone-ddyueshu .ddy-news-r li .ddy-s2{color:#B3B3B3;max-width:150px;overflow:hidden}
.clone-ddyueshu .ddy-news-r li .ddy-s5{color:#B3B3B3;float:right;text-align:right}
/* 书页(真站 #maininfo 800px 右浮 + #sidebar 120px) */
.clone-ddyueshu .ddy-maininfo{float:right;width:800px;box-sizing:border-box}
.clone-ddyueshu .ddy-info h1{font-size:28px;line-height:36px;margin:6px 0;color:#1f2937} /* [R40-b-6] 真站 #info h1 28px */
.clone-ddyueshu .ddy-info p{margin:4px 0;color:#555;font-size:13px}
.clone-ddyueshu .ddy-info .ddy-act{border:1px solid #88C6E5;background:#fff;color:#459DF5;border-radius:3px;padding:2px 10px;cursor:pointer;margin-right:6px;font-size:13px}
.clone-ddyueshu .ddy-info p a{color:#6F78A7;margin-right:6px}
.clone-ddyueshu .ddy-intro{margin:8px 0;padding:10px;border-top:1px dashed #88C6E5;color:#555;font-size:13px;line-height:1.9} /* [R40-b-6] 真站 #intro: 虚线上界无底色 */
.clone-ddyueshu .ddy-intro p{margin:0;text-indent:2em}
.clone-ddyueshu .ddy-sidebar{float:left;width:140px}
.clone-ddyueshu .ddy-fmimg{background:#E1ECED;width:140px;margin:10px 0;padding:10px;box-sizing:border-box} /* [R40-b-6] 真站 #fmimg 蓝灰封面板(150 收进 140 侧栏, 近似) */
.clone-ddyueshu .ddy-hot-img>div,.clone-ddyueshu .ddy-nl-img>div,.clone-ddyueshu .ddy-fmimg>div{border-radius:0!important;border:1px solid #DDD;background:#fff} /* [R40-b-6] 真站封面直角+灰边(覆盖 BookCover 主题圆角) */
.clone-ddyueshu .ddy-listtj{height:30px;line-height:30px;padding:0 10px;overflow:hidden;font-size:13px;margin-top:8px} /* [R40-b-6] 真站 #listtj 无底色横条 */
.clone-ddyueshu .ddy-listtj a{color:#6F78A7;margin-right:12px}
.clone-ddyueshu .ddy-listtj a:hover{color:#459DF5;text-decoration:underline}
/* 章节列表(真站 #list dl: dt 卷标题 #C3DFEA 居中 / dd 章节三列 虚线底) */
.clone-ddyueshu .ddy-list{margin:8px 10px}
.clone-ddyueshu .ddy-list dt{background:#C3DFEA;font-size:14px;font-weight:bold;line-height:28px;padding:5px 10px;margin:0 0 5px;text-align:center}
.clone-ddyueshu .ddy-list dd{float:left;width:33.3%;height:30px;line-height:30px;overflow:hidden;margin:0;font-size:13px;padding-left:6px;box-sizing:border-box;border-bottom:1px dashed #CCC}
/* [R40-b-7] 书页「最新章节」块: 真站每章一格 dd, 组件以单 dd+ul 承载 → CSS 展平为三列章格 */
.clone-ddyueshu .ddy-list .ddy-latest-dd{float:none;width:100%;height:auto;border-bottom:0;padding-left:0;overflow:hidden}
.clone-ddyueshu .ddy-latest-dd ul{list-style:none;margin:0;padding:0}
.clone-ddyueshu .ddy-latest-dd ul li{float:left;width:33.3%;height:30px;line-height:30px;overflow:hidden;font-size:13px;border-bottom:1px dashed #CCC}
.clone-ddyueshu .ddy-list dd a{color:#6F78A7}
.clone-ddyueshu .ddy-list dd a:hover{color:#459DF5;text-decoration:underline}
.clone-ddyueshu .ddy-list .ddy-ch-active a{color:#459DF5;font-weight:700} /* [R40-b-7] 目录当前章高亮(类在 Toc 使用, R39 漏定义) */
.clone-ddyueshu .ddy-list-con:after{content:'';display:block;clear:both}
.clone-ddyueshu .ddy-toc-more{clear:both;padding:10px;text-align:center;font-size:14px}
.clone-ddyueshu .ddy-toc-more a{color:#459DF5}
/* 分页(真站 .page dd: 胶囊钮) */
.clone-ddyueshu .ddy-page{margin:10px;padding:0}
.clone-ddyueshu .ddy-page dd{text-align:center;line-height:32px;color:#999;font-size:13px}
.clone-ddyueshu .ddy-page dd a{border:1px solid #A6D3E8;background:#fff;border-radius:3px;padding:3px 12px;margin:0 4px;color:#555;display:inline-block}
.clone-ddyueshu .ddy-page dd a.is-active{background:#88C6E5;border-color:#88C6E5;color:#fff} /* [R40-b-8] 修正 R39 误写 .ddy-tab(类不存在) */
/* 阅读页(真站 biquge 阅读版: 白底 940 版心) */
.clone-ddyueshu .ddy-read{background:#fff;min-height:70vh;padding-bottom:20px}
.clone-ddyueshu .ddy-read-wrap{width:940px;margin:0 auto}
.clone-ddyueshu .ddy-text-set{padding:8px 0;font-size:13px;color:#555}
.clone-ddyueshu .ddy-text-set b{font-weight:400;color:#999;margin:0 4px}
.clone-ddyueshu .ddy-text-set a{color:#459DF5;text-decoration:none} /* [R40-b-7] 字号档位钮(R39 漏定义) */
.clone-ddyueshu .ddy-text-set a.is-active{font-weight:700}
.clone-ddyueshu .ddy-path{border-bottom:1px solid #eee;line-height:26px;height:26px;font-size:12px;color:#999;margin-top:4px}
.clone-ddyueshu .ddy-path a{color:#6F78A7}
.clone-ddyueshu .ddy-ch-title{font-size:25px;line-height:35px;text-align:center;margin:18px 0 10px;color:#1f2937} /* [R40-b-7] 真站 .bookname h1 25px/35px */
.clone-ddyueshu .ddy-ch-content{padding:6px 10px;font-size:16px;color:#333;min-height:320px}
.clone-ddyueshu .ddy-page-nav dd{text-align:center;margin-top:14px}
.clone-ddyueshu .ddy-page-nav button{border:1px solid #A6D3E8;background:#fff;border-radius:3px;padding:6px 20px;margin:0 8px;cursor:pointer;font-size:14px;color:#555}
/* 页脚(真站 #footer 980 居中 10px) */
.clone-ddyueshu #ddy-footer{overflow:hidden;text-align:center;width:980px;margin:10px auto auto;padding:10px 0 20px;color:#999;font-size:12px;line-height:2}

/* ================= 移动端(375px 无横向滚动; biquge 家族断点 980 单列化) ================= */
@media (max-width: 980px){
  .clone-ddyueshu .ddy-nav,.clone-ddyueshu #ddy-main,.clone-ddyueshu .ddy-header{width:100%;box-sizing:border-box}
  .clone-ddyueshu .ddy-nav{height:auto;min-height:40px} /* [R40-b-3] 窄屏项换行(真站移动端走 wap 域, 此为无横滚适配) */
  .clone-ddyueshu .ddy-nav ul li{line-height:38px}
  .clone-ddyueshu .ddy-news-l,.clone-ddyueshu .ddy-news-r{width:100%!important;float:none}
  .clone-ddyueshu .ddy-hotcontent .ddy-hot-l{width:100%!important}
  .clone-ddyueshu .ddy-hotcontent .ddy-hot-r{width:100%!important;float:none}
  .clone-ddyueshu .ddy-novelslist .ddy-nl-content{width:100%!important;border-right:0!important;float:none}
  .clone-ddyueshu .ddy-maininfo{width:100%!important;float:none!important}
  .clone-ddyueshu .ddy-sidebar{display:none}
  .clone-ddyueshu .ddy-header{padding:0 8px;max-width:100%}
  .clone-ddyueshu .ddy-header-search{width:auto!important;flex:1!important;margin-left:10px!important;min-width:0}
  .clone-ddyueshu .ddy-header-search form{width:100%!important;max-width:100%}
  .clone-ddyueshu .ddy-logo{width:auto!important;font-size:20px!important}
}
@media (max-width: 640px){
  .clone-ddyueshu .ddy-nav ul li a{padding:0 9px;font-size:13px}
  .clone-ddyueshu .ddy-ul-list li .ddy-s3{display:none}
  .clone-ddyueshu .ddy-news-l li .ddy-s3,.clone-ddyueshu .ddy-news-l li .ddy-s4{display:none}
  .clone-ddyueshu .ddy-hot-item{width:auto!important}
}
.clone-ddyueshu .ddy-home,.clone-ddyueshu .ddy-cat,.clone-ddyueshu .ddy-book,.clone-ddyueshu .ddy-toc,.clone-ddyueshu .ddy-read,.clone-ddyueshu .ddy-search,.clone-ddyueshu .ddy-ranking,.clone-ddyueshu .ddy-full{overflow-x:hidden}
`,
}
