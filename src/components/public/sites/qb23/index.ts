// ============================================================
// [R39-2g] qb23(铅笔小说 www.23qb.net) 8 页型克隆模板集
//   真站: mxone 模板(现代卡片墙, 主红 #ff2a14/渐变 #ff9800→#ff2a14), 快照
//   /tmp/r39-snap/qb23/(2026-09-18 直连实抓 home 45KB + style.css 125.8KB 全量)
//   页型覆盖: H首页 C分类 B书 T目录 R章节 + Ran(家族榜形态) Ful书库(/book/lastupdate 列表实测) Sea(搜索页)
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { Qb23Home } from './Home'
import { Qb23Category, Qb23Search, Qb23Fulltext, Qb23Ranking } from './pages'
import { Qb23Book } from './Book'
import { Qb23Toc, Qb23Read } from './Toc'

export const qb23Template: SiteTemplateSet = {
  Home: Qb23Home,
  Category: Qb23Category,
  Book: Qb23Book,
  Toc: Qb23Toc,
  Read: Qb23Read,
  Ranking: Qb23Ranking,
  Fulltext: Qb23Fulltext,
  Search: Qb23Search,
  css: `
/* ---- mxone style.css 实测主色: #ff2a14 主红 / 渐变 #ff9800→#ff2a14 / 暗底 #282828 / 边灰 #eaedf1 ---- */
.clone-qb23 .qb-wrapper{max-width:1200px;margin:0 auto;padding:0 10px}
.clone-qb23 .qb-clear{clear:both;height:0;overflow:hidden}
/* header(真站 mxone: 顶栏底 #EAEDEF 96% ≈ #eaedf1; 搜索胶囊白底圆角 10 高 45 max 500) */
.clone-qb23 .qb-header{padding:10px 0 0;background:#eaedf1}
.clone-qb23 .qb-nav-search{max-width:500px;margin:0 auto;padding:8px 0}
.clone-qb23 .qb-search-dh{display:flex;background:#fff;border-radius:10px;overflow:hidden;height:45px;box-sizing:border-box} /* [R40-b-10] 去伪红边, 真站白胶囊 */
.clone-qb23 .qb-search-dh input{flex:1;border:none;outline:none;padding:0 14px;font-size:16px;color:#333;background:transparent;min-width:0}
.clone-qb23 .qb-search-dh button{border:none;width:74px;background:transparent;color:#ff2a14;font-size:16px;cursor:pointer} /* 真站 .search-btn .icon-search 主红 */
.clone-qb23 .qb-search-cupfox{display:flex;align-items:center;justify-content:center;width:70px;color:#666;font-size:14px;position:relative}
.clone-qb23 .qb-search-cupfox::after{content:'';position:absolute;left:0;top:12px;bottom:12px;width:1px;background:rgba(55,55,55,.1)} /* 真站 .search-cupfox::after 分隔线 */
.clone-qb23 .qb-search-cupfox:hover{color:#ff2a14}
/* 导航(真站 .nav 实测: 项 line-height 45px/padding 0 10px/16px, a 700 #282828, a:hover 主红;
   selected span::after 渐变下划线 4px bottom 3px left 32.5% w 35% r 5) [R40-b-9] */
.clone-qb23 .qb-nav{display:flex;justify-content:center}
.clone-qb23 .qb-nav-items{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;justify-content:center}
.clone-qb23 .qb-nav-item{line-height:45px;padding:0 10px;font-size:16px}
.clone-qb23 .qb-nav-item a{color:#282828;text-decoration:none}
.clone-qb23 .qb-nav-item a span{font-weight:700;display:inline-block;position:relative}
.clone-qb23 .qb-nav-item a:hover{color:#ff2a14}
.clone-qb23 .qb-nav-item.qb-selected a span::after{content:'';width:35%;height:4px;background:linear-gradient(90deg,#ff9800,#ff2a14);display:inline-block;position:absolute;bottom:3px;left:32.5%;border-radius:5px}
/* 板块标题(真站 .blocktitle: 左侧主红竖条) */
.clone-qb23 .qb-blocktitle{position:relative;padding:12px 0 10px 12px;font-size:17px;font-weight:700;color:#333}
.clone-qb23 .qb-blocktitle::before{content:'';position:absolute;left:0;top:14px;width:4px;height:16px;background:linear-gradient(180deg,#ff9800,#ff2a14);border-radius:2px}
.clone-qb23 .qb-blocktitle small{font-size:12px;color:#999;font-weight:400;margin-left:6px}
/* 卡片容器([R40-b-11] 真站 .box: 白底圆角 18+大投影, .module padding-bottom 20 — R39 漏写致裸内容无白卡) */
.clone-qb23 .qb-box{background:#fff;border-radius:18px;box-shadow:0 7px 21px rgba(149,157,165,.22);padding:25px;margin:10px 0 50px}
.clone-qb23 .qb-module{padding-bottom:20px}
.clone-qb23 .qb-module-item{min-width:0} /* 网格项最小宽归零, 防 nowrap 长题撑破 */
/* 卡片墙(真站 .module-items: grid 自适应列; .module-item-pic 圆角 5 + caption 渐变黑罩 44px) */
.clone-qb23 .qb-module-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:14px}
.clone-qb23 .qb-module-item-cover{position:relative;border-radius:5px;transition:all .3s ease-in}
.clone-qb23 .qb-module-item-cover:hover{box-shadow:0 10px 30px rgba(0,0,0,.3)} /* 真站 .shadow-larger hover */
.clone-qb23 .qb-module-item-pic{position:relative;border-radius:5px;overflow:hidden;padding-top:140%;background:#fde6dd} /* 真站封比 140% */
.clone-qb23 .qb-module-item-pic a{position:absolute;inset:0;display:block}
.clone-qb23 .qb-cover{width:100%;height:100%;object-fit:cover;display:block}
.clone-qb23 .qb-module-item-caption{position:absolute;right:0;bottom:0;left:0;height:44px;padding:12px;box-sizing:border-box;background:linear-gradient(0deg,rgba(0,0,0,.68),transparent);display:flex;flex-wrap:wrap;align-items:flex-start;gap:0}
.clone-qb23 .qb-module-item-caption span{max-width:150px;margin:0 5px 0 0;font-size:12px;color:#c2c6d0;background:rgba(0,0,0,.51);padding:1px 5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clone-qb23 .qb-module-item-titlebox{margin-top:12px;text-align:center} /* 真站居中题区 */
.clone-qb23 .qb-module-item-title{display:block;font-weight:700;font-size:14px;color:#282828;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clone-qb23 .qb-module-item-title:hover{color:#ff2a14}
.clone-qb23 .qb-module-item-text{margin-top:3px;font-size:12px;color:rgba(0,0,0,.4);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* 书页(真站 .booktitle 主红; 信息列避让 150px 浮动封面) */
.clone-qb23 .qb-book-head{padding:6px 0}
.clone-qb23 .qb-book-info{margin-left:166px;min-width:0} /* [R40-b-11] 书页头部双列布局(R39 漏写致文字绕盖) */
.clone-qb23 .qb-book-pic{float:left;margin-right:16px;width:150px}
.clone-qb23 .qb-book-pic img{width:150px;border-radius:5px;display:block}
.clone-qb23 .qb-booktitle{margin:2px 0 8px;font-size:22px;color:#ff2a14;font-weight:700}
.clone-qb23 .qb-booktag{margin-bottom:8px}
.clone-qb23 .qb-tag,.clone-qb23 .qb-tag-red{display:inline-block;font-size:12px;border-radius:3px;padding:2px 8px;margin-right:6px;background:#f3f5f7;color:#888}
.clone-qb23 .qb-tag-red{background:#fde6dd;color:#ff2a14}
.clone-qb23 .qb-book-author,.clone-qb23 .qb-book-time{font-size:13px;color:#888;margin:4px 0}
.clone-qb23 .qb-bookmore{margin-top:12px}
.clone-qb23 .qb-book-intro{clear:both;padding:10px 12px;background:#f3f5f7;border-radius:5px;color:#666;font-size:14px;line-height:1.9}
/* 按钮(真站 .btn 主红实心 + 灰边) */
.clone-qb23 .qb-btn-primary{border:none;border-radius:20px;background:linear-gradient(90deg,#ff9800,#ff2a14);color:#fff;padding:8px 22px;font-size:14px;cursor:pointer;margin-right:10px}
.clone-qb23 .qb-btn-primary[disabled]{opacity:.5;cursor:not-allowed}
.clone-qb23 .qb-btn{border:1px solid #d7dae1;border-radius:20px;background:#fff;color:#666;padding:8px 22px;font-size:14px;cursor:pointer}
.clone-qb23 .qb-btn:hover:not([disabled]){border-color:#ff2a14;color:#ff2a14}
.clone-qb23 .qb-btn[disabled]{opacity:.45;cursor:not-allowed}
/* 章节网格(真站 .module-lines-list) */
.clone-qb23 .qb-chgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px 14px;padding:4px 0 10px}
.clone-qb23 .qb-chgrid a{font-size:13px;color:#555;padding:6px 8px;border-radius:4px;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clone-qb23 .qb-chgrid a:hover{background:#fde6dd;color:#ff2a14}
.clone-qb23 .qb-chgrid a.is-active{color:#ff2a14;font-weight:700}
/* 分页 */
.clone-qb23 .qb-pager{text-align:center;padding:14px 0}
.clone-qb23 .qb-pager span{margin:0 10px;color:#999;font-size:13px}
/* 阅读页(真站 .read: 暗顶工具条+白底正文; overflow 裁出盒圆角防工具条角外露) */
.clone-qb23 .qb-read-box{padding:0 0 14px;overflow:hidden}
.clone-qb23 .qb-text-set{background:#282828;color:#c2c6d0;padding:10px 14px;font-size:13px;border-radius:5px 5px 0 0}
.clone-qb23 .qb-text-set b{font-weight:400;color:#8f8f8f;margin:0 4px}
.clone-qb23 .qb-text-set a{color:#c2c6d0;border:1px solid #444;border-radius:3px;padding:1px 8px;margin:0 2px;text-decoration:none}
.clone-qb23 .qb-text-set a:hover{border-color:#ff2a14;color:#ff2a14;text-decoration:none}
.clone-qb23 .qb-text-set a.is-active{background:#ff2a14;border-color:#ff2a14;color:#fff}
.clone-qb23 .qb-read-title{margin:16px 14px 4px;font-size:20px;color:#333;text-align:center}
.clone-qb23 .qb-read-info{text-align:center;font-size:12px;color:#999;margin-bottom:10px}
.clone-qb23 .qb-readcontent{padding:6px 16px;color:#333;min-height:320px}
.clone-qb23 .qb-readcontent p{margin:0 0 1.1em;text-indent:2em}
/* 页脚(真站 #footer: 浅灰 #f3f5f7 12px rgba(0,0,0,.51)) */
.clone-qb23 .qb-footer{margin-top:20px;background:#f3f5f7;color:rgba(0,0,0,.51);text-align:center;padding:10px 20px;font-size:12px}
.clone-qb23 .qb-footer p{margin:0}
/* 榜单 tab */
.clone-qb23 .qb-tab{border:1px solid #d7dae1;background:#fff;border-radius:14px;padding:3px 14px;margin-right:8px;font-size:13px;cursor:pointer;color:#666}
.clone-qb23 .qb-tab.is-active{background:linear-gradient(90deg,#ff9800,#ff2a14);border-color:transparent;color:#fff}

/* ================= 移动端(375px 无横向滚动) ================= */
@media (max-width: 760px){
  .clone-qb23 .qb-module-items{grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px}
  .clone-qb23 .qb-nav-item{line-height:40px;padding:0 8px;font-size:14px}
  .clone-qb23 .qb-box{padding:14px;border-radius:12px;margin-bottom:20px} /* 窄屏收紧(适配值) */
  .clone-qb23 .qb-book-info{margin-left:122px}
  .clone-qb23 .qb-book-pic{width:110px;margin-right:12px}
  .clone-qb23 .qb-book-pic img{width:110px}
  .clone-qb23 .qb-chgrid{grid-template-columns:1fr 1fr}
}
.clone-qb23 .qb-content,.clone-qb23 .qb-read-box{overflow-x:hidden}
`,
}
