// ============================================================
// [R28-2c] qb23 铅笔小说 克隆模板集 —— registry 按 theme.id='qb23' 消费
// 真站: https://www.23qb.net/ (mxone/mxstatic 模板系, R28 实测直连可达)
// 页型覆盖(R28 真站实测): 首页 / 分类页 /book/lastupdate_*.html / 书页 /book/{id}/ /
//   目录页 /book/{id}/catalog / 章节页 /book/{id}/{cid}.html /
//   排行榜 /top.html(今日热榜, 扩展视图 Ranking) / 完本 = 分类页进度筛选(扩展视图 Fulltext) /
//   搜索 /search.html?searchkey=(扩展视图 Search) —— 8/8 全覆盖
// 勘察产物: /tmp/r28-2c/qb23/{qb23-home,category,book,toc,read,search,top,complete}.html +
//   qb23-style.css(/mxstatic/css/style.css 125KB 全量取色)
// 真站实测色板(style.css, 全站色频): #f8f9f9 body 底 · #282828 文字 · #ff2a14 主色朱红(×63) ·
//   #eaedf1 分隔线/tag 底/bgys 榜单带 · #e3e6eb hr/搜索框描边 · #f3f5f7 灰钮/#page/页脚 ·
//   #f7f8f9 斑马行/搜索结果卡 · #fef0e5/#fde6dd 暖杏 chip · #ff9800 橙 · #34a853 绿(#7ec53d 渐变伴生) ·
//   #d7dae1 slash/描边 · #c2c6d0 caption 字 · #999 次级 · rgba(0,0,0,.4/.62/.68/.83) 灰阶 ·
//   Impact 序号字族 · 渐变: 红 to right #fc000c→#f9444d(btn-collect) / 橙→红 90deg #ff9800→#ff2a14 /
//   绿 90deg #7ec53d→#34a853(btn-aux)
// css 字段: 真站伪类/媒体查询级细节(封面径向暗角 ::before/≤559 隐 caption/章节行斑马与三列/正文段落
//   规则/悬浮阴影), 全部选择器以 .clone-qb23 开头, 禁全局污染。
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { Qb23Home } from './Home'
import { Qb23Category } from './Category'
import { Qb23Book } from './Book'
import { Qb23Toc } from './Toc'
import { Qb23Read } from './Read'
import { Qb23Ranking } from './Ranking'
import { Qb23Fulltext } from './Fulltext'
import { Qb23Search } from './Search'

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
/* —— .module-item-cover ::before 径向暗角(hover 加深, 真站 opacity .1→1; backdrop-filter 未复刻) —— */
.clone-qb23 .qb23-cover::before{content:'';position:absolute;inset:0;z-index:1;pointer-events:none;border-radius:5px;background-image:radial-gradient(transparent 0%,rgba(0,0,0,0.1) 44%,rgba(0,0,0,0.56) 100%);opacity:.1;transition:opacity .3s ease-in}
.clone-qb23 .qb23-cover:hover::before{opacity:1}
.clone-qb23 .qb23-cover{transition:box-shadow .3s ease-in}
.clone-qb23 .qb23-cover:hover{box-shadow:0 10px 30px rgba(0,0,0,.3)}
/* —— .module-item-caption ≤559px 隐藏(真站 @media max-559 display:none) —— */
@media (max-width:559px){.clone-qb23 .qb23-caption{display:none}}
/* —— .module-row-info 章节行: ≤767 斑马(even #f7f8f9) / min-768 全行 #f7f8f9 + hover 白 /
      当前章 aria-current 恒为暖杏 #fef0e5(真站 selected chip 语言, 任务要求增补) —— */
.clone-qb23 .qb23-rows .qb23-row:nth-child(even){background:#f7f8f9}
.clone-qb23 .qb23-rows .qb23-row:hover{background:#fff}
@media (min-width:768px){.clone-qb23 .qb23-rows .qb23-row{background:#f7f8f9}}
.clone-qb23 .qb23-rows .qb23-row[aria-current='true']{background:#fef0e5!important}
/* —— .article-content 正文段落(18px/1.6/.825rem 对齐真站; 字号由容器 fontSize 驱动 A+/A-) —— */
.clone-qb23 .qb23-article{word-break:break-word}
.clone-qb23 .qb23-article p{font-size:1em;line-height:1.6;margin:.825rem 0;word-wrap:break-word;word-break:break-word}
@media (max-width:899px){.clone-qb23 .qb23-article p{font-size:1em}}
/* —— .chepnav a 面包屑链接(真站 #999 同色, hover 站内红 #ff2a14) —— */
.clone-qb23 .qb23-crumb button{color:inherit}
/* —— 章节导航/分页触控目标(移动端 ≥44px, 真站 footer 60px 高已在组件内) —— */
.clone-qb23 .qb23-row{min-height:44px}
/* —— 375px 防横滚: 版心 max-w-6xl + px-4 组件内已保证; 筛选行 .library-list 横滚 overflow-x-auto —— */
`,
}
