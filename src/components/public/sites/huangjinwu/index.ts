// ============================================================
// [R39-2h] huangjinwu(黄金屋 www.huangjinwu.org) 8 页型克隆模板集
//   真站: 现代蓝系 CSS 变量设计(--secondary #2563eb/--card #fff/渐变底 #f5f8ff→#eef3fb);
//   快照 /tmp/r39-snap/huangjinwu/(2026-09-18 直连实抓 home 47.3KB + style.css 44.5KB 全量)
//   页型覆盖: H首页 C分类 B书 T目录 R章节 + Ran(/rank 实测) Ful(/list 书库) Sea(/search)
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { HuangjinwuHome } from './Home'
import { HuangjinwuCategory, HuangjinwuSearch, HuangjinwuFulltext, HuangjinwuRanking } from './pages'
import { HuangjinwuBook, HuangjinwuToc, HuangjinwuRead } from './Book'

export const huangjinwuTemplate: SiteTemplateSet = {
  Home: HuangjinwuHome,
  Category: HuangjinwuCategory,
  Book: HuangjinwuBook,
  Toc: HuangjinwuToc,
  Read: HuangjinwuRead,
  Ranking: HuangjinwuRanking,
  Fulltext: HuangjinwuFulltext,
  Search: HuangjinwuSearch,
  css: `
/* ---- style.css :root 实测变量 ---- */
.clone-huangjinwu .hjw-main{background:linear-gradient(180deg,#f5f8ff 0%,#eef3fb 100%);min-height:72vh;color:#1e293b;font-size:14.5px;line-height:1.65}
.clone-huangjinwu .hjw-container{max-width:1080px;margin:0 auto;padding:16px 14px 30px}
.clone-huangjinwu .hjw-clear{clear:both;height:0;overflow:hidden}
/* header(真站 sidebar-header 形态: logo + 横向菜单) */
.clone-huangjinwu .hjw-header{background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border-bottom:1px solid #dbe4f0;padding:10px 4%;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.clone-huangjinwu .hjw-logo{font-size:19px;font-weight:800;color:#1d4ed8;text-decoration:none;display:flex;align-items:center;gap:6px}
.clone-huangjinwu .hjw-logo-icon{font-size:20px}
.clone-huangjinwu .hjw-navbar-menu{display:flex;flex-wrap:wrap;gap:2px}
.clone-huangjinwu .hjw-navbar-menu a{padding:6px 12px;border-radius:8px;color:#1e293b;font-size:14px;text-decoration:none}
.clone-huangjinwu .hjw-navbar-menu a:hover{background:#e8f1ff;color:#1d4ed8}
/* 标题(真站 .page-title: 左 4px secondary 色条) */
.clone-huangjinwu .hjw-page-title{border-left:4px solid #2563eb;border-radius:2px 0 0 2px;color:#1e293b;font-size:17px;font-weight:600;letter-spacing:-.02em;margin:0 0 16px;padding-left:13px}
.clone-huangjinwu .hjw-title-sub{font-size:12px;color:#94a3b8;font-weight:400;margin-left:6px}
/* 卡片(真站 .book-card: 白底 边 #dbe4f0 radius 10 shadow; hover 上浮) */
.clone-huangjinwu .hjw-book-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-bottom:20px}
.clone-huangjinwu .hjw-book-card{background:#fff;border:1px solid rgba(219,228,240,.85);border-radius:10px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 4px 16px rgba(37,99,235,.06);display:flex;gap:10px;padding:12px;text-decoration:none;transition:border-color .25s ease,box-shadow .3s ease,transform .25s ease;color:inherit}
.clone-huangjinwu .hjw-book-card:hover{border-color:#2563eb;box-shadow:0 8px 24px rgba(37,99,235,.14),0 2px 8px rgba(15,23,42,.06);transform:translateY(-2px)}
.clone-huangjinwu .hjw-book-cover img{width:96px;height:128px;object-fit:cover;border-radius:6px;display:block}
.clone-huangjinwu .hjw-book-info{min-width:0;flex:1}
.clone-huangjinwu .hjw-book-title{font-size:15px;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clone-huangjinwu .hjw-book-author{font-size:12.5px;color:#64748b;margin:3px 0}
.clone-huangjinwu .hjw-book-desc{color:#64748b;font-size:13px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.5;min-height:2.55em;margin-bottom:8px}
/* 徽章(真站 .book-badge: category 蓝底白字/status 浅底边/words) */
.clone-huangjinwu .hjw-book-badges{display:flex;flex-wrap:wrap;gap:5px}
.clone-huangjinwu .hjw-badge{display:inline-block;font-size:11.5px;border-radius:4px;padding:1px 7px}
.clone-huangjinwu .hjw-badge-category{background:#2563eb;border:none;color:#fff}
.clone-huangjinwu .hjw-badge-status{background-color:#e8f1ff;border:1px solid #dbe4f0;color:#1e293b}
.clone-huangjinwu .hjw-badge-words{background:#fff;border:1px solid #dbe4f0;color:#64748b}
/* 书页 hero */
.clone-huangjinwu .hjw-book-hero{background:#fff;border:1px solid rgba(219,228,240,.85);border-radius:10px;box-shadow:0 4px 16px rgba(37,99,235,.06);display:flex;gap:16px;padding:16px}
.clone-huangjinwu .hjw-book-hero-cover img{width:140px;height:188px;object-fit:cover;border-radius:8px}
.clone-huangjinwu .hjw-book-hero-title{margin:0 0 6px;font-size:20px;color:#1e293b}
.clone-huangjinwu .hjw-book-hero-desc{color:#64748b;font-size:13.5px;line-height:1.8;margin:8px 0}
.clone-huangjinwu .hjw-book-time{color:#94a3b8;font-size:12.5px}
.clone-huangjinwu .hjw-hero-actions{margin-top:12px}
/* 章节列表(真站 .chapter-list: 双列格) */
.clone-huangjinwu .hjw-chlist{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:4px}
.clone-huangjinwu .hjw-chlist a{font-size:13.5px;color:#1e293b;padding:7px 10px;border-radius:6px;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid transparent}
.clone-huangjinwu .hjw-chlist a:hover{background:#e8f1ff;color:#1d4ed8}
.clone-huangjinwu .hjw-chlist a.is-active{border-color:#2563eb;color:#1d4ed8;background:#e8f1ff;font-weight:600}
/* 按钮(真站 .btn-primary #2563eb hover #1d4ed8) */
.clone-huangjinwu .hjw-btn-primary{border:none;border-radius:8px;background:#2563eb;color:#fff;padding:8px 20px;font-size:14px;cursor:pointer;margin-right:10px}
.clone-huangjinwu .hjw-btn-primary:hover:not([disabled]){background:#1d4ed8}
.clone-huangjinwu .hjw-btn-primary[disabled]{opacity:.5;cursor:not-allowed}
.clone-huangjinwu .hjw-btn{border:1px solid #dbe4f0;border-radius:8px;background:#fff;color:#1e293b;padding:8px 20px;font-size:14px;cursor:pointer}
.clone-huangjinwu .hjw-btn:hover:not([disabled]){border-color:#2563eb;color:#1d4ed8;background:#e8f1ff}
.clone-huangjinwu .hjw-btn[disabled]{opacity:.45;cursor:not-allowed}
/* 分页/榜 tab */
.clone-huangjinwu .hjw-pager{text-align:center;padding:16px 0}
.clone-huangjinwu .hjw-pager span{margin:0 10px;color:#94a3b8;font-size:13px}
.clone-huangjinwu .hjw-tab{border:1px solid #dbe4f0;background:#fff;border-radius:16px;padding:3px 14px;margin-right:8px;font-size:13px;cursor:pointer;color:#64748b}
.clone-huangjinwu .hjw-tab.is-active{background:#2563eb;border-color:#2563eb;color:#fff}
/* 阅读卡(真站 --reader-bg #f8fafc/--reader-border #d8e3f0) */
.clone-huangjinwu .hjw-read-card{background:#fff;border:1px solid #d8e3f0;border-radius:10px;padding:14px 16px 20px;box-shadow:0 4px 16px rgba(37,99,235,.06)}
.clone-huangjinwu .hjw-text-set{padding:8px 0;font-size:13px;color:#64748b;border-bottom:1px solid #d8e3f0;margin-bottom:10px}
.clone-huangjinwu .hjw-text-set b{font-weight:400;color:#94a3b8;margin:0 4px}
.clone-huangjinwu .hjw-text-set a{border:1px solid #dbe4f0;border-radius:5px;padding:1px 8px;margin:0 2px;color:#64748b;text-decoration:none}
.clone-huangjinwu .hjw-text-set a:hover{border-color:#2563eb;color:#1d4ed8;text-decoration:none}
.clone-huangjinwu .hjw-text-set a.is-active{background:#2563eb;border-color:#2563eb;color:#fff}
.clone-huangjinwu .hjw-read-title{margin:14px 0 4px;font-size:19px;color:#1e293b;text-align:center}
.clone-huangjinwu .hjw-read-info{text-align:center;font-size:12.5px;color:#94a3b8;margin-bottom:12px}
.clone-huangjinwu .hjw-readcontent{color:#1e293b;min-height:320px}
.clone-huangjinwu .hjw-readcontent p{margin:0 0 1.1em;text-indent:2em}
/* 页脚(真站 --footer-bg #e2eaf5) */
.clone-huangjinwu .hjw-footer{background:#e2eaf5;color:#64748b;text-align:center;padding:16px 10px;font-size:13px;margin-top:20px}
.clone-huangjinwu .hjw-footer p{margin:0}

/* ================= 移动端(375px 无横向滚动) ================= */
@media (max-width: 760px){
  .clone-huangjinwu .hjw-book-grid{grid-template-columns:1fr 1fr;gap:10px}
  .clone-huangjinwu .hjw-book-hero{flex-direction:column;align-items:center;text-align:center}
  .clone-huangjinwu .hjw-chlist{grid-template-columns:1fr 1fr}
  .clone-huangjinwu .hjw-navbar-menu{gap:0}
  .clone-huangjinwu .hjw-navbar-menu a{padding:5px 8px;font-size:13px}
}
@media (max-width: 480px){
  .clone-huangjinwu .hjw-chlist{grid-template-columns:1fr}
}
.clone-huangjinwu .hjw-container{overflow-x:hidden}
`,
}
