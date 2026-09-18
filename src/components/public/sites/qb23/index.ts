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
/* header 搜索(真站 .search-main: 圆角胶囊+主红按钮) */
.clone-qb23 .qb-header{padding:10px 0 0}
.clone-qb23 .qb-nav-search{max-width:640px;margin:0 auto;padding:8px 0}
.clone-qb23 .qb-search-dh{display:flex;border:2px solid #ff2a14;border-radius:22px;overflow:hidden;background:#fff;height:40px}
.clone-qb23 .qb-search-dh input{flex:1;border:none;outline:none;padding:0 14px;font-size:14px;color:#333}
.clone-qb23 .qb-search-dh button{border:none;width:84px;background:#ff2a14;color:#fff;font-size:14px;cursor:pointer}
.clone-qb23 .qb-search-cupfox{display:flex;align-items:center;justify-content:center;width:70px;background:#f3f5f7;color:#666;font-size:14px;border-left:1px solid #eaedf1}
.clone-qb23 .qb-search-cupfox:hover{color:#ff2a14}
/* 导航(真站 .nav: 白底, 选中 span 渐变下划线 4px + 主红字) */
.clone-qb23 .qb-nav{border-bottom:1px solid #eaedf1}
.clone-qb23 .qb-nav-items{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap}
.clone-qb23 .qb-nav-item a{display:block;padding:10px 14px;color:#666;font-size:15px;text-decoration:none}
.clone-qb23 .qb-nav-item a:hover{color:#ff2a14}
.clone-qb23 .qb-nav-item.qb-selected a{color:#ff2a14;font-weight:700}
.clone-qb23 .qb-nav-item.qb-selected a span{position:relative}
.clone-qb23 .qb-nav-item.qb-selected a span::after{content:'';position:absolute;left:32%;bottom:-8px;width:36%;height:4px;background:linear-gradient(90deg,#ff9800,#ff2a14);border-radius:2px}
/* 板块标题(真站 .blocktitle: 左侧主红竖条) */
.clone-qb23 .qb-blocktitle{position:relative;padding:12px 0 10px 12px;font-size:17px;font-weight:700;color:#333}
.clone-qb23 .qb-blocktitle::before{content:'';position:absolute;left:0;top:14px;width:4px;height:16px;background:linear-gradient(180deg,#ff9800,#ff2a14);border-radius:2px}
.clone-qb23 .qb-blocktitle small{font-size:12px;color:#999;font-weight:400;margin-left:6px}
/* 卡片墙(真站 .module-items: grid 自适应列; .module-item-pic 圆角 5 + caption 渐变黑罩) */
.clone-qb23 .qb-module-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:14px}
.clone-qb23 .qb-module-item-cover{position:relative}
.clone-qb23 .qb-module-item-pic{position:relative;border-radius:5px;overflow:hidden;padding-top:135%;background:#fde6dd}
.clone-qb23 .qb-module-item-pic a{position:absolute;inset:0;display:block}
.clone-qb23 .qb-cover{width:100%;height:100%;object-fit:cover;display:block}
.clone-qb23 .qb-module-item-caption{position:absolute;right:0;bottom:0;left:0;padding:12px 8px 6px;background:linear-gradient(0deg,rgba(0,0,0,.68),transparent);display:flex;flex-wrap:wrap;gap:4px}
.clone-qb23 .qb-module-item-caption span{max-width:150px;font-size:11px;color:#c2c6d0;background:rgba(0,0,0,.51);border-radius:3px;padding:1px 5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clone-qb23 .qb-module-item-titlebox{padding:6px 2px}
.clone-qb23 .qb-module-item-title{display:block;font-weight:700;font-size:14px;color:#333;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clone-qb23 .qb-module-item-title:hover{color:#ff2a14}
.clone-qb23 .qb-module-item-text{font-size:12px;color:#c2c6d0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* 书页(真站 .booktitle 主红) */
.clone-qb23 .qb-book-box{padding:14px}
.clone-qb23 .qb-book-head{padding:6px 0}
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
/* 阅读页(真站 .read: 暗顶工具条+白底正文) */
.clone-qb23 .qb-read-box{padding:0 0 14px}
.clone-qb23 .qb-text-set{background:#282828;color:#c2c6d0;padding:10px 14px;font-size:13px;border-radius:5px 5px 0 0}
.clone-qb23 .qb-text-set b{font-weight:400;color:#8f8f8f;margin:0 4px}
.clone-qb23 .qb-text-set a{color:#c2c6d0;border:1px solid #444;border-radius:3px;padding:1px 8px;margin:0 2px;text-decoration:none}
.clone-qb23 .qb-text-set a:hover{border-color:#ff2a14;color:#ff2a14;text-decoration:none}
.clone-qb23 .qb-text-set a.is-active{background:#ff2a14;border-color:#ff2a14;color:#fff}
.clone-qb23 .qb-read-title{margin:16px 14px 4px;font-size:20px;color:#333;text-align:center}
.clone-qb23 .qb-read-info{text-align:center;font-size:12px;color:#999;margin-bottom:10px}
.clone-qb23 .qb-readcontent{padding:6px 16px;color:#333;min-height:320px}
.clone-qb23 .qb-readcontent p{margin:0 0 1.1em;text-indent:2em}
/* 页脚(真站 .footer 暗底) */
.clone-qb23 .qb-footer{margin-top:20px;background:#282828;color:#8f8f8f;text-align:center;padding:18px 10px;font-size:13px}
.clone-qb23 .qb-footer p{margin:0}
/* 榜单 tab */
.clone-qb23 .qb-tab{border:1px solid #d7dae1;background:#fff;border-radius:14px;padding:3px 14px;margin-right:8px;font-size:13px;cursor:pointer;color:#666}
.clone-qb23 .qb-tab.is-active{background:linear-gradient(90deg,#ff9800,#ff2a14);border-color:transparent;color:#fff}

/* ================= 移动端(375px 无横向滚动) ================= */
@media (max-width: 760px){
  .clone-qb23 .qb-module-items{grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px}
  .clone-qb23 .qb-nav-item a{padding:8px 10px;font-size:13px}
  .clone-qb23 .qb-book-pic{width:110px;margin-right:12px}
  .clone-qb23 .qb-book-pic img{width:110px}
  .clone-qb23 .qb-chgrid{grid-template-columns:1fr 1fr}
}
.clone-qb23 .qb-content,.clone-qb23 .qb-read-box{overflow-x:hidden}
`,
}
