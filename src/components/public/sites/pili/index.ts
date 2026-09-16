// ============================================================
// [R26-2-60] 霹雳书屋 模板集合入口 —— registry 按 theme.id='pili' 消费
// 五页型: Home(首页)/Category(分类列表)/Book(书籍详情)/Toc(完整目录, 独立视图)/Read(章节阅读)
// css: 站点级克隆样式, PublicSite 注入 .clone-pili 作用域(所有选择器以 .clone-pili 开头)。
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { PiliHome } from './Home'
import { PiliCategory } from './Category'
import { PiliBook } from './Book'
import { PiliToc } from './Toc'
import { PiliRead } from './Read'

export const piliTemplate: SiteTemplateSet = {
  Home: PiliHome,
  Category: PiliCategory,
  Book: PiliBook,
  Toc: PiliToc,
  Read: PiliRead,
  // 真站实测伪类/后代选择器集中在此(组件内内联无法表达的 :visited/:hover 派生/段落规则):
  // - a 过渡(pili 全站链接 0.15s 色过渡, 与 themes.ts customCss 同源)
  // - .pili-read-content p ← read.css .main-text-wrap .read-content p{line-height:1.8;margin:1.2em 0;text-indent:2em}
  // - .pili-ch-link:visited ← works.css .works-chapter-item a:visited{color:#A75646}
  // - .pili-ctrl-link:hover ← read.css .chapter-control a:hover{color:#1a1a1a;background:rgba(0,0,0,.03)}
  // - .pili-dock-btn:hover ← read.css .left-bar-list dd a:hover{color:#ed4259}(含 iconfont/svg 同色)
  // - .pili-cat-item ← comicall.css .ret-search-item{border-right:1px solid #e8e7e6}
  //   (真站双列项右分格线 → 桌面奇数项注入, 避免单列移动端出现悬空右线)
  css: `
.clone-pili a{transition:color .15s ease}
.clone-pili .pili-read-content p{margin:1.2em 0;text-indent:2em;line-height:1.8}
.clone-pili .pili-read-content p:first-child{margin-top:0}
.clone-pili .pili-read-content p:last-child{margin-bottom:0}
.clone-pili .pili-ch-link:visited{color:#A75646}
.clone-pili .pili-ctrl-link:not(:disabled):hover{color:#1a1a1a;background:rgba(0,0,0,0.03)}
.clone-pili .pili-dock-btn:hover{color:#ed4259}
.clone-pili .pili-dock-btn:hover svg{color:#ed4259!important}
@media (min-width:1024px){.clone-pili .pili-cat-list > li:nth-child(odd){border-right:1px solid #e8e7e6}}
`.trim(),
}
