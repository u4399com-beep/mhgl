// ============================================================
// [R39-2e] ggd66(格格党 www.ggd66.com) 8 页型克隆模板集
//   真站: 简洁绿系(.header #1abc9c/.btn-info #56ccb5), 75pc 版心; 快照 /tmp/r39-snap/ggd66/
//   (2026-09-18 直连实抓: home 18.4KB / sort 10.3KB / quanben 10.2KB / book 12.8KB /
//    chapter 12.1KB + style.css 11.5KB gb2312 全量)
//   页型覆盖: H首页 C分类 B书 T目录 R章节 + Ran(家族榜形态) Ful全本(/quanben/sort/ 实测) Sea(/search/ 实测)
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { Ggd66Home } from './Home'
import { Ggd66Category, Ggd66Search, Ggd66Fulltext, Ggd66Ranking } from './pages'
import { Ggd66Book } from './Book'
import { Ggd66Toc, Ggd66Read } from './Toc'

export const ggd66Template: SiteTemplateSet = {
  Home: Ggd66Home,
  Category: Ggd66Category,
  Book: Ggd66Book,
  Toc: Ggd66Toc,
  Read: Ggd66Read,
  Ranking: Ggd66Ranking,
  Fulltext: Ggd66Fulltext,
  Search: Ggd66Search,
  css: `
/* ---- style.css(gb2312) 实测色值 ---- */
.clone-ggd66 .ggd-container{width:90%;max-width:1200px;margin:0 auto}
.clone-ggd66 .ggd-clear{clear:both;height:0;overflow:hidden}
/* header(真站 .header: #1abc9c 50px 行高 50; nav a 60px 宽) */
.clone-ggd66 .ggd-header{background-color:#1abc9c;margin-bottom:10px;width:100%;height:50px;line-height:50px;display:flex;align-items:center;padding:0 2%}
.clone-ggd66 .ggd-header,.clone-ggd66 .ggd-header a{color:#fff}
.clone-ggd66 .ggd-header .ggd-header-left{float:left;margin-right:20px;text-align:left;font-size:18px;font-weight:700}
.clone-ggd66 .ggd-header .ggd-header-nav{float:left;font-size:1pc}
.clone-ggd66 .ggd-header .ggd-header-nav a{float:left;width:60px;text-align:center;text-decoration:none}
.clone-ggd66 .ggd-header .ggd-header-nav a:hover{background:#56ccb5}
.clone-ggd66 .ggd-header .ggd-header-right{margin-left:auto}
.clone-ggd66 .ggd-header .ggd-header-right form{border:2px solid #56ccb5;border-radius:5px;background:#fff;display:flex;height:32px;line-height:32px;overflow:hidden}
.clone-ggd66 .ggd-header .ggd-header-right input{margin:0;padding:0 8px;border:none;outline:none;background:#f9f9f9;color:#56ccb5;font-size:14px;width:150px}
.clone-ggd66 .ggd-header .ggd-header-right button{border:none;height:32px;width:56px;background:#56ccb5;color:#fff;cursor:pointer}
/* 链接基线(真站 a #00886d hover #f50) */
.clone-ggd66 a{color:#00886d;text-decoration:none}
.clone-ggd66 a:hover{color:#f50}
/* 主体分栏(真站 .content-left 73% / .content-right 25%) */
.clone-ggd66 .ggd-content{margin:10px 0}
.clone-ggd66 .ggd-content-left{float:left;width:73%;box-sizing:border-box}
.clone-ggd66 .ggd-content-right{float:right;width:25%;box-sizing:border-box}
.clone-ggd66 h2{margin:10px 0;padding:0 0 10px;border-bottom:1px solid #ccc;color:#333;font-size:18px}
.clone-ggd66 h2 small{font-size:13px;color:#999;font-weight:400}
/* 推荐卡(真站 #fengtui .item: 双列 50% dt 点线底 dd 90pt) */
.clone-ggd66 #ggd-fengtui .ggd-item{float:left;padding:10px 0 0;width:50%;box-sizing:border-box}
.clone-ggd66 #ggd-fengtui .ggd-item-img{display:block;float:left;margin-right:10px;width:120px;border:0;background:none;padding:0;cursor:pointer}
.clone-ggd66 #ggd-fengtui .ggd-item img{padding:1px;border:1px solid #ccc;background-color:#fff}
.clone-ggd66 #ggd-fengtui .ggd-item dl{padding:0 5px 0 0;margin:0}
.clone-ggd66 #ggd-fengtui .ggd-item dl dt{height:25px;border-bottom:1px dotted #ccc;font-size:15px;line-height:25px;overflow:hidden;margin:0}
.clone-ggd66 #ggd-fengtui .ggd-item dl dt span{float:right;font-size:14px;color:#999;font-weight:400}
.clone-ggd66 #ggd-fengtui .ggd-item dl dd{padding:7px 0 0;height:90pt;font-size:14px;line-height:24px;overflow:hidden;margin:0;color:#888}
/* 排行/最新列表(真站 #fengyou/#zuixin ul li: 虚线底 28px) */
.clone-ggd66 .ggd-content-right ul,.clone-ggd66 .ggd-list ul{list-style:none;margin:0;padding:5px 0 0}
.clone-ggd66 .ggd-content-right ul li,.clone-ggd66 .ggd-list ul li{padding:4px 0;height:28px;border-bottom:1px dashed #ccc;font-size:14px;line-height:28px;overflow:hidden}
.clone-ggd66 .ggd-content-right ul li a,.clone-ggd66 .ggd-list ul li a{font-size:15px}
.clone-ggd66 .ggd-content-right ul li span,.clone-ggd66 .ggd-list ul li span{float:right;display:inline-block;font-size:14px;color:#999}
.clone-ggd66 .ggd-cat-tag{color:#00886d;float:left!important;margin-right:6px;font-size:13px}
/* 面包屑(真站 .breadcrumb: #cdf3eb 底 #ccc 边 圆角 4) */
.clone-ggd66 .ggd-breadcrumb{margin:0 0 10px;padding:8px 15px;border:1px solid #ccc;border-radius:4px;background-color:#cdf3eb;font-size:14px;list-style:none}
.clone-ggd66 .ggd-breadcrumb li{float:left;display:inline-block;color:#666}
.clone-ggd66 .ggd-breadcrumb li+li:before{padding:0 5px;color:#666;content:'/'}
.clone-ggd66 .ggd-breadcrumb li.is-active{color:#666}
/* 书页(真站 .book: 封面左浮 + info) */
.clone-ggd66 .ggd-book-body{padding:10px 0}
.clone-ggd66 .ggd-bookcover{float:left;margin-right:14px}
.clone-ggd66 .ggd-bookcover img{padding:1px;border:1px solid #ccc;background:#fff}
.clone-ggd66 .ggd-booktitle{margin:0 0 6px;font-size:22px;color:#333}
.clone-ggd66 .ggd-booktag a.ggd-red{color:#e4393c;margin-right:10px}
.clone-ggd66 .ggd-booktag .ggd-blue{color:#3b76c0;margin-right:10px}
.clone-ggd66 .ggd-booktag .ggd-red{color:#e4393c}
.clone-ggd66 .ggd-bookintro{color:#888;font-size:14px;line-height:1.9;max-height:110px;overflow:hidden}
.clone-ggd66 .ggd-bookchapter{color:#00886d}
.clone-ggd66 .ggd-booktime{color:#999;font-size:13px}
.clone-ggd66 .ggd-btn-info{display:inline-block;margin:0 6px 0 0;padding:6px 14pt;border:1px solid #56ccb5;border-radius:4px;background-color:#56ccb5;color:#fff;cursor:pointer;font-size:14px}
.clone-ggd66 .ggd-btn-info:hover{background-color:#48b8a4;color:#fff}
.clone-ggd66 .ggd-btn-info[disabled]{opacity:.5;cursor:not-allowed}
/* 章节列表(真站目录格: 三列) */
.clone-ggd66 .ggd-chlist ul li{width:33.3%;float:left;box-sizing:border-box;padding:4px 6px}
.clone-ggd66 .ggd-toc-list li.is-active a{color:#f50;font-weight:700}
/* 分页 */
.clone-ggd66 .ggd-pager{margin:10px 0}
.clone-ggd66 .ggd-pager dd{text-align:center;color:#999;font-size:13px}
.clone-ggd66 .ggd-pager button{border:1px solid #56ccb5;background:#fff;border-radius:4px;padding:5px 16px;margin:0 6px;cursor:pointer;color:#00886d}
.clone-ggd66 .ggd-pager button:hover:not([disabled]){background:#56ccb5;color:#fff}
.clone-ggd66 .ggd-pager button[disabled]{opacity:.45;cursor:not-allowed}
/* 榜单 tab */
.clone-ggd66 h2 button{border:1px solid #56ccb5;background:#fff;border-radius:4px;padding:2px 12px;margin-right:8px;cursor:pointer;color:#00886d;font-size:14px}
.clone-ggd66 h2 button.is-active{background:#56ccb5;color:#fff}
/* 阅读页(真站 .book.read: 白卡 + .readcontent 段落) */
.clone-ggd66 .ggd-read-body,.clone-ggd66 .ggd-toc-body{background:#fff;border:1px solid #eee;border-radius:4px;padding:14px 16px}
.clone-ggd66 .ggd-text-set{padding:6px 0;font-size:13px;color:#888;border-bottom:1px dashed #ccc;margin-bottom:8px}
.clone-ggd66 .ggd-text-set b{font-weight:400;color:#aaa;margin:0 4px}
.clone-ggd66 .ggd-text-set a{border:1px solid #ccc;border-radius:3px;padding:1px 7px;margin:0 2px;color:#888}
.clone-ggd66 .ggd-text-set a:hover{border-color:#56ccb5;color:#00886d;text-decoration:none}
.clone-ggd66 .ggd-text-set a.is-active{background:#56ccb5;border-color:#56ccb5;color:#fff}
.clone-ggd66 .ggd-read-title{text-align:center;font-size:20px;color:#333;margin:10px 0}
.clone-ggd66 .ggd-readcontent{color:#444;min-height:320px}
.clone-ggd66 .ggd-readcontent p{margin:0 0 1em;text-indent:2em}
/* 页脚(真站 .footer #56ccb5 10px padding 白字居中) */
.clone-ggd66 .ggd-footer{padding:10px 0;background-color:#56ccb5;color:#fff;text-align:center;font-size:14px;margin-top:14px}
.clone-ggd66 .ggd-footer p{margin:0}

/* ================= 移动端(375px 无横向滚动) ================= */
@media (max-width: 900px){
  .clone-ggd66 .ggd-content-left,.clone-ggd66 .ggd-content-right{width:100%!important;float:none!important}
  .clone-ggd66 #ggd-fengtui .ggd-item{width:100%!important}
  .clone-ggd66 .ggd-chlist ul li{width:50%!important}
  .clone-ggd66 .ggd-header{flex-wrap:wrap;height:auto;line-height:40px;padding:4px 2%}
  .clone-ggd66 .ggd-header .ggd-header-nav a{width:52px}
}
@media (max-width: 640px){
  .clone-ggd66 .ggd-chlist ul li{width:100%!important}
  .clone-ggd66 .ggd-bookcover{float:none;text-align:center;margin-bottom:8px}
}
.clone-ggd66 .ggd-home,.clone-ggd66 .ggd-cat,.clone-ggd66 .ggd-book,.clone-ggd66 .ggd-toc,.clone-ggd66 .ggd-read,.clone-ggd66 .ggd-search,.clone-ggd66 .ggd-ranking,.clone-ggd66 .ggd-full{overflow-x:hidden}
`,
}
