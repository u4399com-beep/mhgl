// ============================================================
// [R27-6b-6] x2552(吾爱文学网) 模板集合出口 —— 3 个不可达站 Wayback 补全之一
// 站点: www.x2552.com(吾爱文学网 · 黑冰模板 heibing/css/style.css · 960px/12px 微软雅黑)
// 页型: Home(公告条+bdtop 排行榜横条 6 封面+centeri 更新列表+right 双榜)
//       Category(m_menu 分类条+blocktitle 列表块+灰钮分页)     [家族标准, 无独立存档]
//       Book(面包屑+信息块封面/简介+最新章节 12+TXT 下载)       [家族标准, 无独立存档]
//       Toc(#a_main dt 面包屑+h1+h3 作者+table#at 4 列表格)     [Wayback 实测 2023]
//       Read(h1 居中+白底正文+三钮导航+键盘 ←/→/Enter)          [家族标准, 无独立存档]
// CSS: 全部选择器以 .clone-x2552 作用域开头; 色值出处: R24 真站直连实测 style.css
// (body 12px/120% 微软雅黑,宋体 · 文字 #666 · 链接 #2f468f · hover #FF6600 位移 1px ·
//  块面 #F2F2F2/边 #E4E4E4/dotted · 榜头条 2px #33CCFF+#D9EDFF) + 2023 Wayback DOM 佐证。
// 降级声明: 真站不可达(连接拒绝), 除首页/目录页外按黑冰模板家族标准补全(见各文件头注)。
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { X2552Home } from './Home'
import { X2552Category } from './Category'
import { X2552Book } from './Book'
import { X2552Toc } from './Toc'
import { X2552Read } from './Read'

export const x2552Template: SiteTemplateSet = {
  Home: X2552Home,
  Category: X2552Category,
  Book: X2552Book,
  Toc: X2552Toc,
  Read: X2552Read,
  // [R27-6b-6] 站点级克隆 CSS —— 真站 a 链接行为(hover 变橙+位移 1px)与黑冰分页钮样式
  css: `
/* [R27-6b-6] 真站 style.css: a{color:#2f468f;text-decoration:none} a:hover{color:#FF6600;position:relative;left:1px;top:1px}(位移 1px 实测)
   .x2-a 同时用于交互 button(导航全 button 契约) → 附按钮重置 */
.clone-x2552 .x2-a{color:#2f468f;text-decoration:none;background:none;border:0;padding:0;cursor:pointer;font:inherit;line-height:inherit}
.clone-x2552 .x2-a:visited{color:#2f468f}
.clone-x2552 .x2-a:hover{color:#FF6600;position:relative;left:1px;top:1px}
.clone-x2552 .x2-a:disabled{cursor:default;color:#2f468f}
/* [R27-6b-6] 黑冰家族分页钮: 灰底白卡(hover 加深), 当前页深蓝白字(组件 strong 已配色) */
.clone-x2552 .x2-pg{background:#fff;color:#666;border-color:#E4E4E4;transition:background .15s ease,color .15s ease}
.clone-x2552 .x2-pg:hover:not(:disabled){background:#F2F2F2;color:#2f468f}
/* [R27-6b-6] 目录表格单元悬停(黑冰 td.L 家族标准: 白底, hover 提示色) */
.clone-x2552 .x2-td:hover{color:#FF6600}
/* [R27-6b-6] 基底: 真站 body{font:12px/120% "微软雅黑","宋体";color:#666} — 版心 960px 由组件 max-w 承担 */
`,
}
