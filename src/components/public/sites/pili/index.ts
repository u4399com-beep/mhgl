// ============================================================
// [R39-2j] pili(霹雳书屋 www.pilishuwu.com) 8 页型克隆模板集
//   真站: wmcms 模板(橙棕系 #fd8929/#f65400/#7d360f, 1200px 版心); 快照 /tmp/r39-snap/pili/
//   (2026-09-18 cloak standard 实抓 home 235KB + 排行榜 89KB + 分类 69KB + wmcms 4 CSS 全量)
//   页型覆盖: H首页 C分类 B书 T目录 R章节 + Ran(/top/index.html 实测) Ful(家族列表形态) Sea(CF 拦截, 家族标准补全)
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { PiliHome } from './Home'
import { PiliCategory, PiliSearch, PiliFulltext, PiliRanking } from './pages'
import { PiliBook, PiliToc, PiliRead } from './Book'

export const piliTemplate: SiteTemplateSet = {
  Home: PiliHome,
  Category: PiliCategory,
  Book: PiliBook,
  Toc: PiliToc,
  Read: PiliRead,
  Ranking: PiliRanking,
  Fulltext: PiliFulltext,
  Search: PiliSearch,
  css: `
/* ---- wmcms.global.css + main-header-*.css 实测色值: #fd8929 主橙/#f65400 深橙/#7d360f 棕/#fa8729 hover ---- */
.clone-pili .pli-wrap{width:1200px;max-width:100%;margin:0 auto;padding:0 0 20px}
.clone-pili .pli-clear{clear:both;height:0;overflow:hidden}
/* 头区(真站 .mod-top-tool-wr 127px: logo 384px + 搜索 470px) */
.clone-pili .pli-top-wr{background:linear-gradient(180deg,#fffdf8 0%,#fdf3e4 100%);border-bottom:1px solid #f1e4d0}
.clone-pili .pli-top-head{width:1200px;max-width:100%;margin:0 auto;padding:20px 0 12px;display:flex;align-items:center;gap:24px;flex-wrap:wrap}
.clone-pili .pli-logo{width:260px;font-size:30px;font-weight:800;color:#f65400;text-decoration:none;letter-spacing:2px;text-shadow:0 1px 0 #fff}
.clone-pili .pli-search{display:flex;width:470px;max-width:100%;height:44px;border:2px solid #fd8929;border-radius:2px;overflow:hidden;background:#fff}
.clone-pili .pli-search input{flex:1;border:none;outline:none;padding:0 14px;font-size:14px;color:#333}
.clone-pili .pli-search button{border:none;width:74px;background:linear-gradient(180deg,#fd8929,#f65400);color:#fff;font-size:15px;cursor:pointer}
.clone-pili .pli-top-tag{list-style:none;margin:0 0 0 auto;padding:0;display:flex;gap:12px}
.clone-pili .pli-top-tag a{color:#717171;font-size:13px;text-decoration:none}
.clone-pili .pli-top-tag a:hover{color:#fa8729;text-decoration:underline}
/* 导航条(真站 58px 斜切 tab; 以渐变+斜切 clip-path 近似切图) */
.clone-pili .pli-top-nav-wr{background:linear-gradient(180deg,#fd8929 0%,#f65400 100%)}
.clone-pili .pli-top-nav{width:1200px;max-width:100%;margin:0 auto}
.clone-pili .pli-top-nav-list{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap}
.clone-pili .pli-top-nav-list li{position:relative}
.clone-pili .pli-top-nav-list a{display:block;height:52px;line-height:52px;text-decoration:none;padding:0 4px}
.clone-pili .pli-top-nav-list a span{display:block;padding:0 22px;font-size:16px;font-family:'微软雅黑',sans-serif;color:#fff}
.clone-pili .pli-top-nav-list li.active a span,.clone-pili .pli-top-nav-list a:hover span{color:#7d360f;font-weight:700}
.clone-pili .pli-top-nav-list li.active a{background:#fdf3e4;border-radius:6px 6px 0 0}
/* 独家推荐(真站 .mod-tags-wr/.mod-animate-list) */
.clone-pili .pli-tags-wr{margin-top:14px}
.clone-pili .pli-animate-list{list-style:none;margin:0;padding:0}
.clone-pili .pli-ico-animate{display:inline-block;background:linear-gradient(90deg,#fd8929,#f65400);color:#fff;font-size:14px;padding:4px 14px;border-radius:4px 4px 0 0}
/* [R40-c-11] ani 卡信息面板: 真站 .mod-ani-info 白底/边 #c6c5c5/padding 14px 14px 0(真站末位 .mod-ani-ul 供底距, 克隆无 ul 取 12px 近似) */
.clone-pili .pli-ani-info{background:#fff;border:1px solid #c6c5c5;border-radius:0 4px 4px 4px;padding:14px 14px 12px}
/* [R40-c-12] 封面实测尺寸: 真站 .mod-ani-img 区 214 宽 + 内图 210×280; 小卡变体同比例缩小(真站为 hover 弹层无静态小卡, 尺寸近似) */
.clone-pili .pli-ani-img{display:block;float:left;margin-right:14px;width:210px;height:280px;overflow:hidden;position:relative}
.clone-pili .pli-ani-img > div{width:100%;height:100%}
.clone-pili .pli-ani-img img{width:100%;height:100%;object-fit:cover;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,.16)}
.clone-pili .pli-ani-img-sm{width:120px;height:160px}
/* [R40-c-13] 文本列: 容器 overflow:hidden 成 BFC 与浮动封面并排; 真站 .mod-ani-text1 padding-top 10 + a 22px 行 #333
   (hover #fd8929), .mod-ani-text2 padding-top 6 行 22px, 内链 #333, 浏览量文本继承 #666 无高亮 */
.clone-pili .pli-ani-text{overflow:hidden;min-width:0}
.clone-pili .pli-ani-text1{display:flex;justify-content:space-between;align-items:center;gap:10px;padding-top:10px}
.clone-pili .pli-ani-title{font-size:18px;font-weight:400;line-height:22px;height:22px;color:#333;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.clone-pili .pli-ani-title:hover{color:#fd8929}
.clone-pili .pli-ani-author{color:#333;font-weight:700;font-size:14px;line-height:22px;text-decoration:none}
.clone-pili .pli-ani-author:hover{color:#fd8929}
.clone-pili .pli-ani-text2{padding-top:6px;font-size:13.5px;color:#666}
.clone-pili .pli-ani-text2 p,.clone-pili .pli-ani-text2 a,.clone-pili .pli-ani-text2 span{line-height:22px}
.clone-pili .pli-ani-fplay{display:inline;margin-right:10px;color:#666;font-weight:400}
.clone-pili .pli-ani-text2 a{color:#333;text-decoration:none}
.clone-pili .pli-ani-desc{margin:8px 0 0;color:#888;font-size:13px;line-height:1.8}
.clone-pili .pli-first{margin-bottom:12px}
/* [R40-c-14] 小卡名链(真站 .mod-top-ani-a: 高 34/行 18/#666/左缩进 20/hover #ff9a6a; 精灵箭头以 CSS 三角近似) */
.clone-pili .pli-ani-a{display:block;height:34px;line-height:18px;color:#666;font-size:14px;padding-left:20px;margin-top:6px;overflow:hidden;text-decoration:none}
.clone-pili .pli-ani-a::before{content:'';display:inline-block;width:0;height:0;border-top:4px solid transparent;border-bottom:4px solid transparent;border-left:6px solid #f65400;margin-right:7px;vertical-align:middle}
.clone-pili .pli-ani-a:hover{color:#ff9a6a}
.clone-pili .pli-animate-list > li:not(.pli-first){float:left;width:49.5%;margin-bottom:10px;box-sizing:border-box}
.clone-pili .pli-animate-list > li:not(.pli-first):nth-child(2n){float:right}
/* 面板/榜单(真站 .mod-tab-content + ol.in-rank-list) */
.clone-pili .pli-rank-wr,.clone-pili .pli-panel{margin-top:14px}
.clone-pili .pli-rank-head{font-size:17px;font-weight:700;color:#333;border-left:4px solid #fd8929;padding-left:10px;margin-bottom:8px}
.clone-pili .pli-rank-head small{font-size:12px;color:#999;font-weight:400}
.clone-pili .pli-rank-panel,.clone-pili .pli-panel-body{background:#fff;border:1px solid #dcd8d4;border-radius:4px;padding:12px}
.clone-pili .pli-in-rank-list{list-style:none;float:left;width:50%;margin:0;padding:0 10px 0 0;counter-reset:none}
.clone-pili .pli-in-rank-list li{height:30px;line-height:30px;overflow:hidden;font-size:14px}
.clone-pili .pli-in-rank-list li sub{display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;border-radius:3px;margin-right:8px;font-size:12px;color:#fff;vertical-align:middle}
.clone-pili .pli-no-orange{background:#fd8929}
.clone-pili .pli-no-gray{background:#ccc}
.clone-pili .pli-rank-name{color:#333;text-decoration:none}
.clone-pili .pli-rank-name:hover{color:#f65400;text-decoration:underline}
.clone-pili .pli-rank-author{float:right;color:#999;font-size:12.5px;font-style:normal}
.clone-pili .pli-pr10{padding-right:16px;border-right:1px dashed #eee}
/* 封面格(最新上架/全本) */
.clone-pili .pli-latest-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:14px}
.clone-pili .pli-book-cell{display:block;text-decoration:none;text-align:center}
.clone-pili .pli-book-cell img{width:100%;border-radius:4px;box-shadow:0 3px 8px rgba(0,0,0,.14)}
.clone-pili .pli-book-cell-name{display:block;margin-top:6px;font-size:13px;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clone-pili .pli-book-cell:hover .pli-book-cell-name{color:#f65400}
/* 书页(真站 info 页) */
.clone-pili .pli-book-head{padding:16px}
.clone-pili .pli-book-title{margin:0 0 8px;font-size:22px;color:#333}
.clone-pili .pli-book-badge{display:inline-block;font-size:12px;border-radius:3px;padding:2px 8px;margin:0 6px 6px 0;background:#fafafa;border:1px solid #e5e0da;color:#666}
.clone-pili .pli-badge-orange{background:#fff3e6;border-color:#fd8929;color:#f65400}
.clone-pili .pli-book-intro{margin:8px 0;color:#666;font-size:13.5px;line-height:1.9}
.clone-pili .pli-book-time{color:#999;font-size:12.5px}
.clone-pili .pli-btns{margin-top:10px}
.clone-pili .pli-btn-orange{border:none;border-radius:3px;background:linear-gradient(180deg,#fd8929,#f65400);color:#fff;padding:8px 22px;font-size:14px;cursor:pointer;margin-right:10px}
.clone-pili .pli-btn-orange:hover:not([disabled]){background:linear-gradient(180deg,#fa8729,#e84e00)}
.clone-pili .pli-btn-orange[disabled]{opacity:.5;cursor:not-allowed}
.clone-pili .pli-btn-line{border:1px solid #d4351b;border-radius:3px;background:#fff;color:#d4351b;padding:8px 22px;font-size:14px;cursor:pointer}
.clone-pili .pli-btn-line:hover:not([disabled]){background:#fff3e6}
.clone-pili .pli-in-panel{float:none;width:100%;padding:0}
/* 章节格/分页 */
.clone-pili .pli-chgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:2px 14px}
.clone-pili .pli-chgrid a{font-size:13.5px;color:#333;padding:7px 8px;border-radius:3px;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clone-pili .pli-chgrid a:hover{background:#fff3e6;color:#f65400}
.clone-pili .pli-chgrid a.is-active{color:#f65400;font-weight:700}
.clone-pili .pli-pager{text-align:center;padding:14px 0 4px}
.clone-pili .pli-pager span{margin:0 10px;color:#999;font-size:13px}
.clone-pili .pli-pager button{border:1px solid #dcd8d4;background:#fff;border-radius:3px;padding:6px 18px;margin:0 5px;cursor:pointer;color:#666;font-size:13.5px}
.clone-pili .pli-pager button:hover:not([disabled]){border-color:#fd8929;color:#f65400;background:#fff9f2}
.clone-pili .pli-pager button[disabled]{opacity:.45;cursor:not-allowed}
.clone-pili .pli-tab{border:1px solid #dcd8d4;background:#fff;border-radius:3px;padding:3px 14px;margin-right:8px;cursor:pointer;color:#666;font-size:13.5px}
.clone-pili .pli-tab.is-active{background:#fd8929;border-color:#fd8929;color:#fff}
/* 阅读页(真站 read) */
.clone-pili .pli-text-set{background:#fff;border:1px solid #dcd8d4;border-radius:4px 4px 0 0;padding:10px 14px;font-size:13px;color:#666;border-bottom:0}
.clone-pili .pli-text-set b{font-weight:400;color:#999;margin:0 4px}
.clone-pili .pli-text-set a{border:1px solid #e5e0da;border-radius:3px;padding:1px 8px;margin:0 2px;color:#666;text-decoration:none}
.clone-pili .pli-text-set a:hover{border-color:#fd8929;color:#f65400;text-decoration:none}
.clone-pili .pli-text-set a.is-active{background:#fd8929;border-color:#fd8929;color:#fff}
.clone-pili .pli-panel.pli-read-panel{border-radius:0 4px 4px 4px}
.clone-pili .pli-read-title{margin:16px 0 4px;font-size:20px;color:#333;text-align:center}
.clone-pili .pli-read-info{text-align:center;font-size:12.5px;color:#999;margin-bottom:12px}
.clone-pili .pli-readcontent{color:#444;min-height:320px;padding:0 14px}
.clone-pili .pli-readcontent p{margin:0 0 1.1em;text-indent:2em}
/* 页脚(真站 wmcms 深棕底) */
.clone-pili .pli-footer{margin-top:20px;background:#7d360f;color:#fbe4bb;text-align:center;padding:16px 10px;font-size:13px}
.clone-pili .pli-footer p{margin:0}

/* ================= 移动端(375px 无横向滚动) ================= */
@media (max-width: 1220px){
  .clone-pili .pli-wrap,.clone-pili .pli-top-head,.clone-pili .pli-top-nav{padding-left:10px;padding-right:10px;box-sizing:border-box}
}
@media (max-width: 860px){
  .clone-pili .pli-animate-list > li:not(.pli-first){width:100%!important;float:none!important}
  .clone-pili .pli-in-rank-list{width:100%!important;border-right:0!important;padding-right:0}
  .clone-pili .pli-latest-grid{grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:10px}
  .clone-pili .pli-top-head{gap:12px}
  .clone-pili .pli-logo{width:auto;font-size:24px}
  .clone-pili .pli-top-nav-list a span{padding:0 12px;font-size:14px}
}
/* [R40-c-15] ≤480 首卡封面缩半(375px 可读性/防文本列过窄; 真站无此断点口径, 近似) */
@media (max-width: 480px){
  .clone-pili .pli-ani-img:not(.pli-ani-img-sm){width:110px;height:146px}
}
.clone-pili .pli-wrap,.clone-pili .pli-home,.clone-pili .pli-cat,.clone-pili .pli-book,.clone-pili .pli-toc,.clone-pili .pli-read,.clone-pili .pli-search,.clone-pili .pli-ranking,.clone-pili .pli-full{overflow-x:hidden}
`,
}
