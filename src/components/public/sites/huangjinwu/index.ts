// ============================================================
// [R27-6-12] huangjinwu(黄金屋) 模板集合出口 —— 10 站×5 页型克隆之八
// 站点: www.huangjinwu.org(黄金屋 · 现代蓝调卡片栅格 /static/default/style.css 实测)
// 页型: Home(热门推荐 6 卡+分类排行榜 6×10 计数徽章榜+最新更新 18 卡+最新电子书列表)
//       Category(.filter-bar 筛选白卡(3/5/10 列)+book-grid 纯文字卡+page-info 简分页)
//       Book(detail-header 书档白卡(180×250 封面+meta 点线 chips+四钮)+简介折叠+最新章节+
//            章节目录(分页)+相关小说)
//       Toc(detail-header 简卡+章节目录卡片网格(auto-fill 250px)+分页; 真站无独立目录页, 差异声明)
//       Read(reader-header 字体/行距控件(步进钮)+#f8fafc 纸面(2em 缩进+.2em 字距)+reader-nav
//            三格导航+同作者小说)
// CSS: 全部选择器以 .clone-huangjinwu 作用域开头, 色值出自真站 :root CSS 变量实测
// (实测样本: /tmp/r27-f/huangjinwu-style.css + home/list/book/chapter 四页快照 2026-09 实抓)
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { HjwHome } from './Home' // [R27-6-fix] 对齐文件实际导出名
import { HjwCategory } from './Category'
import { HjwBook } from './Book'
import { HuangjinwuToc } from './Toc'
import { HuangjinwuRead } from './Read'

export const huangjinwuTemplate: SiteTemplateSet = {
  Home: HjwHome,
  Category: HjwCategory,
  Book: HjwBook,
  Toc: HuangjinwuToc,
  Read: HuangjinwuRead,
  // [R27-6-12] 站点级克隆 CSS —— 伪类/复杂选择器/媒体查询集中于此; 逐条注明真站规则出处(style.css 原文)
  css: `
/* [R27-6-12] 基底: 真站 html{font-size:10px} + body 字色 --text-color:#1e293b(rem 体系在组件内按 px 换算) */
.clone-huangjinwu{color:#1e293b;font-size:14px}
/* [R27-6-12] 真站 .page-title/.detail-section-title 左竖条 hover 无态; 蓝描边卡片 hover 态集中此处:
   .book-card{transition:border-color .25s ease,box-shadow .3s ease,transform .25s ease}
   .book-card:hover{border-color:color-mix(in srgb,#2563eb 45%,#dbe4f0);box-shadow:--shadow-hover;
   transform:translatey(-2px)}(color-mix 实测换算 ≈ #89aaee) */
.clone-huangjinwu .hjw-card:hover{border-color:#89aaee;box-shadow:0 8px 24px rgba(37,99,235,0.14),0 2px 8px rgba(15,23,42,0.06);transform:translateY(-2px)}
/* [R27-6-12] 真站 .filter-tag{background:#f0f4fb;border:1px solid #dbe4f0;border-radius:10px;
   color:#1e293b;font-size:1.5rem;padding:.8rem 1.6rem;transition:all .3s ease};
   .filter-tag.active,.filter-tag:hover{background:#2563eb;border-color:#2563eb;color:#fff} */
.clone-huangjinwu .hjw-chip{background-color:#f0f4fb;border:1px solid #dbe4f0;border-radius:10px;color:#1e293b;padding:8px 12px;transition:all .3s ease;cursor:pointer}
.clone-huangjinwu .hjw-chip:hover{background:#2563eb;border-color:#2563eb;color:#fff}
.clone-huangjinwu .hjw-chip-active,.clone-huangjinwu .hjw-chip-active:hover{background:#2563eb;border-color:#2563eb;color:#fff}
/* [R27-6-12] 真站 .pagination-list .page-link{background:#fff;border:1.5px solid #dbe4f0;
   border-radius:10px;color:#1e293b;font-size:1.4rem;font-weight:500;padding:.8rem 2.4rem;
   transition:all .25s cubic-bezier(.4,0,.2,1)}; hover{background:#2563eb;color:#fff;
   transform:translatey(-2px)}; :disabled{opacity:.5;cursor:not-allowed} */
.clone-huangjinwu .hjw-pg{display:inline-block;background-color:#fff;border:1.5px solid #dbe4f0;border-radius:10px;color:#1e293b;cursor:pointer;font-size:14px;font-weight:500;padding:8px 20px;text-decoration:none;transition:all .25s cubic-bezier(0.4,0,0.2,1)}
.clone-huangjinwu .hjw-pg:hover:not(:disabled){background:#2563eb;border-color:#2563eb;box-shadow:0 2px 8px rgba(37,99,235,0.28);color:#fff;transform:translateY(-2px)}
.clone-huangjinwu .hjw-pg:disabled{opacity:.5;cursor:not-allowed}
/* [R27-6-12] 真站 .btn-primary{background:#2563eb;border:none;border-radius:10px;color:#fff;
   box-shadow:0 2px 8px rgba(0,0,0,.1)}; hover{background:#1d4ed8;transform:translatey(-1px)};
   .btn-secondary{background:#fff;border:1px solid #dbe4f0;color:#1e293b};
   hover{background:#e8f1ff;border-color:#2563eb;color:#2563eb;transform:translatey(-1px)} */
.clone-huangjinwu .hjw-btn-primary{display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:10px;background:#2563eb;box-shadow:0 2px 8px rgba(0,0,0,0.1);color:#fff;cursor:pointer;font-size:16px;font-weight:500;gap:8px;line-height:1.5;transition:all .25s ease}
.clone-huangjinwu .hjw-btn-primary:hover:not(:disabled){background:#1d4ed8;color:#fff;transform:translateY(-1px)}
.clone-huangjinwu .hjw-btn-primary:disabled{cursor:not-allowed}
.clone-huangjinwu .hjw-btn-secondary{display:inline-flex;align-items:center;justify-content:center;border-radius:10px;background-color:#fff;border:1px solid #dbe4f0;color:#1e293b;cursor:pointer;font-size:16px;font-weight:500;gap:8px;line-height:1.5;transition:all .25s ease;text-decoration:none}
.clone-huangjinwu .hjw-btn-secondary:hover{background-color:#e8f1ff;border-color:#2563eb;color:#2563eb;transform:translateY(-1px)}
/* [R27-6-12] 真站 .detail-meta span:not(:last-child):after{background:#dbe4f0;width:1px;height:16px}
   + span:before{8px #2563eb 圆点}(竖线在 ≥768 呈现, 蓝点已内联) */
@media (min-width:768px){
  .clone-huangjinwu .hjw-meta-item{position:relative}
  .clone-huangjinwu .hjw-meta-item:not(:last-child):after{content:"";position:absolute;right:0;top:50%;transform:translateY(-50%);width:1px;height:16px;background-color:#dbe4f0}
}
/* [R27-6-12] 真站 .chapter-item a:visited{color:#2563eb}; .chapter-item:hover{background:#e8f1ff;
   border-color:#2563eb} */
.clone-huangjinwu .hjw-chitem:hover{background-color:#e8f1ff;border-color:#2563eb !important}
/* [R27-6-12] 真站 .reader-content p{margin:0 auto 1.5em;max-width:800px;text-indent:2em;
   word-break:break-all;line-break:anywhere;letter-spacing:0.2em;text-align:justify} */
.clone-huangjinwu .hjw-reader p{margin:0 auto 1.5em;max-width:800px;text-indent:2em;word-break:break-all;letter-spacing:0.2em;text-align:justify}
/* [R27-6-12] 真站 ≤480px: .reader-content{background-color:transparent;box-shadow:none;padding:0} */
@media (max-width:480px){
  .clone-huangjinwu .hjw-reader{background:transparent !important;box-shadow:none !important}
}
/* [R27-6-12] 真站 ≤480px: .detail-actions .btn-primary{width:100%} + .btn-secondary{calc(50% - .8rem)} */
@media (max-width:480px){
  .clone-huangjinwu .hjw-btn-primary{width:100%}
  .clone-huangjinwu .hjw-btn-secondary{width:calc(50% - 0.8rem)}
}
`,
}
