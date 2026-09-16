// ============================================================
// [R28-2d-8] huangjinwu(黄金屋) 模板集合出口 —— R28 八页型克隆(基础五 + 排行榜 + 搜索)
// 站点: www.huangjinwu.org(现代蓝调卡片栅格, /static/default/style.css 实测)
// 素材: /tmp/r28-2d/huangjinwu/ 2026-09-16 直连实抓(home/rank/rank-size/list/novel/
//       chapter/search/dzss 七页 HTML + style.css 44KB 全量)
// 页型覆盖: Home=实测 | Category=实测(/list) | Book=实测(/novel) | Toc=实测(书页目录区块
//           独立成页, 真站无 /toc 路由) | Read=实测(/novel/{id}/{cid}) | Ranking=实测(/rank)
//           | Fulltext=跳过(真站无全本/完本列表页; /dzss 为电子书独立内容形态, 契约无数据源)
//           | Search=实测(/search?keyword=)
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { HjwHome } from './Home'
import { HjwCategory } from './Category'
import { HjwBook } from './Book'
import { HuangjinwuToc } from './Toc'
import { HuangjinwuRead } from './Read'
import { HjwRanking } from './Ranking'
import { HjwSearch } from './Search'

export const huangjinwuTemplate: SiteTemplateSet = {
  Home: HjwHome,
  Category: HjwCategory,
  Book: HjwBook,
  Toc: HuangjinwuToc,
  Read: HuangjinwuRead,
  Ranking: HjwRanking,
  Search: HjwSearch,
  // [R28-2d-8] 站点级克隆 CSS —— 伪类/媒体查询集中于此; 每条注明真站 style.css 规则出处
  css: `
/* [R28-2d-8] 基底: 真站 html{font-size:10px} rem 体系 → 组件内 px 直写; body 字色 --text-color:#1e293b */
.clone-huangjinwu{color:#1e293b}
/* [R28-2d-8] 真站 .page-title/.detail-section-title/.section-title 左竖条:
   border-left:4px solid var(--secondary-color);padding-left:1.6rem(蓝竖条标题) */
.clone-huangjinwu .hjw-title,.clone-huangjinwu .hjw-sectitle{border-left:4px solid #2563eb;border-radius:2px 0 0 2px;padding-left:16px}
/* [R28-2d-8] 真站 .book-card:hover{border-color:color-mix(--secondary 45%,--border);
   box-shadow:var(--shadow-hover);transform:translatey(-2px)} + .book-title 变蓝(color-mix 实测换算 #89aaee) */
.clone-huangjinwu .hjw-card:hover{border-color:#89aaee;box-shadow:0 8px 24px rgba(37,99,235,0.14),0 2px 8px rgba(15,23,42,0.06);transform:translateY(-2px)}
.clone-huangjinwu .hjw-card:hover .hjw-card-title{color:#2563eb}
/* [R28-2d-8] 真站 .filter-tag{background:#f0f4fb;border:1px solid #dbe4f0;color:#1e293b;
   transition:all .3s ease}; .filter-tag.active,.filter-tag:hover{background:#2563eb;color:#fff} */
.clone-huangjinwu .hjw-chip{background-color:#f0f4fb;border:1px solid #dbe4f0;color:#1e293b;cursor:pointer;text-align:center}
.clone-huangjinwu .hjw-chip:hover{background:#2563eb;border-color:#2563eb;color:#fff}
.clone-huangjinwu .hjw-chip-active,.clone-huangjinwu .hjw-chip-active:hover{background:#2563eb;border-color:#2563eb;color:#fff}
/* [R28-2d-8] 真站 .pagination-list .page-link{background:#fff;border:1.5px solid #dbe4f0;
   padding:.8rem 2.4rem;transition:all .25s cubic-bezier(.4,0,.2,1)};
   :hover{background:#2563eb;color:#fff;transform:translatey(-2px)}; :disabled{opacity:.5} */
.clone-huangjinwu .hjw-pg{display:inline-block;background-color:#fff;border:1.5px solid #dbe4f0;color:#1e293b;cursor:pointer;font-size:14px;font-weight:500;padding:8px 20px;transition:all .25s cubic-bezier(0.4,0,0.2,1)}
.clone-huangjinwu .hjw-pg:hover:not(:disabled){background:#2563eb;border-color:#2563eb;box-shadow:0 2px 8px rgba(37,99,235,0.28);color:#fff;transform:translateY(-2px)}
/* [R28-2d-8] 真站 .btn-primary{background:#2563eb;box-shadow:0 2px 8px rgba(0,0,0,.1)};
   :hover{background:#1d4ed8;transform:translatey(-1px)}; .btn-secondary{background:#fff;
   border:1px solid #dbe4f0}; :hover{background:#e8f1ff;border-color:#2563eb;color:#2563eb;
   transform:translatey(-1px)}(hjw-btn 二类共通 hover 过渡) */
.clone-huangjinwu .hjw-btn{align-items:center;justify-content:center;line-height:1.5;transition:all .25s ease}
.clone-huangjinwu .hjw-btn-primary{background:#2563eb;border:none;box-shadow:0 2px 8px rgba(0,0,0,0.1);color:#fff}
.clone-huangjinwu .hjw-btn-primary:hover:not(:disabled){background:#1d4ed8;color:#fff;transform:translateY(-1px)}
.clone-huangjinwu .hjw-btn-primary:disabled{cursor:not-allowed;opacity:.6}
.clone-huangjinwu .hjw-btn-secondary{background-color:#fff;border:1px solid #dbe4f0;color:#1e293b}
.clone-huangjinwu .hjw-btn-secondary:hover{background-color:#e8f1ff;border-color:#2563eb;color:#2563eb;transform:translateY(-1px)}
/* [R28-2d-8] 真站 .detail-meta span:not(:last-child):after{1×16px #dbe4f0 竖线}(≥768 呈现) */
@media (min-width:768px){
  .clone-huangjinwu .hjw-meta-item{position:relative}
  .clone-huangjinwu .hjw-meta-item:not(:last-child):after{content:"";position:absolute;right:0;top:50%;transform:translateY(-50%);width:1px;height:16px;background-color:#dbe4f0}
}
/* [R28-2d-8] 真站 .ranking-module-title:before{3×16px #2563eb 竖条;border-radius:6px} */
.clone-huangjinwu .hjw-modtitle:before{content:"";display:inline-block;width:3px;height:16px;background:#2563eb;border-radius:6px;flex-shrink:0}
/* [R28-2d-8] 真站 .ranking-item:hover{background-color:var(--hover-color)} */
.clone-huangjinwu .hjw-ritem:hover{background-color:#e8f1ff}
/* [R28-2d-8] 真站 .chapter-item a:visited{color:#2563eb}; .chapter-item:hover{background:#e8f1ff;
   border-color:#2563eb}(交互钮等价 hover) */
.clone-huangjinwu .hjw-chitem:hover{background-color:#e8f1ff;border-color:#2563eb !important}
/* [R28-2d-8] 真站 .search-input:focus{border-color:#2563eb;box-shadow:0 0 0 3px
   color-mix(in srgb,#2563eb 22%,transparent)} */
.clone-huangjinwu .hjw-search-input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,0.22)}
/* [R28-2d-8] 真站 .reader-content p{margin:0 auto 1.5em;max-width:800px;text-indent:2em;
   letter-spacing:0.2em;text-align:justify;word-break:break-all;line-break:anywhere} */
.clone-huangjinwu .hjw-reader .hjw-content p{margin:0 auto 1.5em;max-width:800px;text-indent:2em;word-break:break-all;letter-spacing:0.2em;text-align:justify}
/* [R28-2d-8] 真站 .intro-toggle-btn:after{content:"\\25BC"} 展开钮(箭头已在组件内联) */
.clone-huangjinwu .hjw-introbtn:hover{opacity:.8}
/* [R28-2d-8] 真站 ≤768px: .chapter-list{grid-template-columns:repeat(2,1fr)} 由组件断点承担;
   ≤480px: .reader-content{background-color:transparent;box-shadow:none;padding:0} */
@media (max-width:480px){
  .clone-huangjinwu .hjw-reader{background:transparent !important;box-shadow:none !important;border-color:transparent !important;padding:0}
}
/* [R28-2d-8] 真站 ≤480px: .detail-actions .btn-primary{width:100%} +
   .btn-secondary{width:calc(50% - .8rem)} */
@media (max-width:480px){
  .clone-huangjinwu .hjw-book-actions .hjw-btn-primary{width:100%}
}
/* [R28-2d-8] 真站 .detail-cover:hover{box-shadow:var(--shadow-hover)}(封面悬停深影) */
.clone-huangjinwu .hjw-cover:hover{box-shadow:0 8px 24px rgba(37,99,235,0.14),0 2px 8px rgba(15,23,42,0.06)}
/* [R28-2d-8] 真站 range 无专属样式(原生控件); accent-color 蓝为通用壳等价, 非真站规则(声明) */
`,
}
