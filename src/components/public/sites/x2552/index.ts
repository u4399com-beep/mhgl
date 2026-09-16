// ============================================================
// [R28-2d-x11] x2552(吾爱文学网) 模板集装配 —— 黑冰模板 八页型
// 素材: Wayback 2023-12-04 快照组(/tmp/r28-2d/x2552/) + 家族标准(无存档页型逐文件头注声明)
//   Home=实测 | Category=实测(/list/) | Book=实测(/book/) | Toc=实测(/html/{x}/{id}/)
//   Read=家族标准 | Ranking=家族标准(12 榜入口实链) | Fulltext=实测(/fulltxt/) | Search=家族标准(表单实测)
// css: 全部选择器 .clone-x2552 前缀; 色值出处见 _kit.tsx C 常量(heibing/css/style.css 逐条)
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { X2552Home } from './Home'
import { X2552Category } from './Category'
import { X2552Book } from './Book'
import { X2552Toc } from './Toc'
import { X2552Read } from './Read'
import { X2552Ranking } from './Ranking'
import { X2552Fulltext } from './Fulltext'
import { X2552Search } from './Search'

/** [R28-2d-x11] 站点级克隆 CSS(黑冰模板; 逐条注明真站 style.css 规则出处) */
const css = `
/* a,a:visited{color:#2f468f} + a:hover{color:#ff6600} (style.css 实测) */
.clone-x2552 .x2-a { background: none; border: 0; padding: 0; margin: 0; font: inherit; color: #2f468f; cursor: pointer; text-decoration: none; }
.clone-x2552 .x2-a:hover { color: #ff6600; text-decoration: underline; }
.clone-x2552 .x2-a:disabled { color: #999999; cursor: default; text-decoration: none; }
/* 表格单元格定位族(杰奇/黑冰系 td.L 左对齐 td.C 居中 td.R 右对齐; style.css 实测) */
.clone-x2552 .x2-tbl th, .clone-x2552 .x2-tbl td { vertical-align: middle; }
.clone-x2552 .x2-tbl td.L { text-align: left; }
.clone-x2552 .x2-tbl td.C { text-align: center; }
.clone-x2552 .x2-tbl td.R { text-align: right; }
/* 黑冰灰钮 hover 位移 1px(R27-6b 实测行为, 保留) */
.clone-x2552 .x2-btnlinks-a:hover, .clone-x2552 .x2-a[style*="linear-gradient"]:hover { position: relative; top: 1px; }
/* ultop 行点线(实测: li 底 dotted #F2F2F2) */
.clone-x2552 .x2-ultop li { border-bottom: 1px dotted #f2f2f2; }
/* 移动端: 375px 单列(左栏换行到顶部, 表格容器内横滚; 版心恒 max 960) */
@media (max-width: 640px) {
  .clone-x2552 .x2-centerm { padding-left: 0 !important; margin-top: 8px; }
}
`.trim()

export const x2552Template: SiteTemplateSet = {
  Home: X2552Home,
  Category: X2552Category,
  Book: X2552Book,
  Toc: X2552Toc,
  Read: X2552Read,
  Ranking: X2552Ranking,
  Fulltext: X2552Fulltext,
  Search: X2552Search,
  css,
}
