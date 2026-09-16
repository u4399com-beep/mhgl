// ============================================================
// [R27-6b-18] trxsw(同人小说网) 模板集合出口 —— 3 个不可达站 Wayback 补全之三
// 站点: www.trxsw.com(同人小说网 · 杰奇 CMS 默认模板 · /images/b.css · GBK · 960px 版心)
// 页型: Home(.novelslist×2×3 板块 h2+图文头条+«书名»/作者 li + #newscontent .l 25 行 s1..s5
//       + .r 推荐 26 行 + #firendlink 友链)                                     [Wayback 实测 2019]
//       Category(JqH2 + s1..s5 更新列表 + 分页)                                [家族标准]
//       Book(面包屑+#content 封面/简介+最新章节+#list dd 目录+TXT 下载)          [家族标准]
//       Toc(杰奇书页 #list dd a 目录块独立成页+分页)                            [家族标准]
//       Read(h1+#content 正文 14px/200%+三钮导航+键盘 ←/→/Enter)                [家族标准]
// CSS: 全部选择器以 .clone-trxsw 作用域开头; 色值出处: 杰奇 CMS 家族标准(b.css 无存档 ——
// R25 轮 archive 快照 css-2018/2020/2021 全 404 实证): 白底 14px 宋体/arial 系 · 链接 #333 /
// hover #C00 红 · h2 浅渐变底+左 4px #1C5087 竖条+下边线 · li 36px 底部点线 #ccc · 灰 #666/
// 弱灰 #999/边 #ddd/ywtop #f5f5f5 · nav 深蓝渐变 #1C5087→#1F5FA9。结构按 2019 快照逐节复刻,
// 真站 HTTP/2 framing 拒绝不可达, Category/Book/Toc/Read 按家族标准补全(见各文件头注)。
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { TrxswHome } from './Home'
import { TrxswCategory } from './Category'
import { TrxswBook } from './Book'
import { TrxswToc } from './Toc'
import { TrxswRead } from './Read'

export const trxswTemplate: SiteTemplateSet = {
  Home: TrxswHome,
  Category: TrxswCategory,
  Book: TrxswBook,
  Toc: TrxswToc,
  Read: TrxswRead,
  // [R27-6b-18] 站点级克隆 CSS —— 伪类/媒体查询集中于此; 逐条注明家族标准出处
  css: `
/* [R27-6b-18] 杰奇家族 body{font:14px arial,"SimSun";color:#333;background:#fff} — 主题 vars 已对齐, 此处兜底 */
.clone-trxsw{color:#333;font-size:14px}
/* [R27-6b-18] 杰奇家族 a{color:#333} a:hover{color:#C00}(b.css 无存档 → 家族标准; 原生 <a> 仅 TXT 钮/友链) */
.clone-trxsw a{color:#333;text-decoration:none}
.clone-trxsw a:hover{color:#C00}
/* [R27-6b-18] 杰奇家族分页钮: 白底灰边, hover 深蓝白字; 当前页 strong 深蓝白字(组件已配色) */
.clone-trxsw .tx-pg{background:#fff;color:#333;border-color:#ddd;transition:background .15s ease,color .15s ease}
.clone-trxsw .tx-pg:hover:not(:disabled){background:#1C5087;color:#fff}
/* [R27-6b-18] 杰奇家族正文段(家族标准: 段落 2em 缩进) */
.clone-trxsw .tx-content p{margin:0 0 12px;text-indent:2em}
/* [R27-6b-18] 响应式: 真站 2019 年固定 960px 非响应式 → 移动端单列堆叠/隐藏 s1/s3/s4 列(组件承担), 375px 无横滚 */
`,
}
