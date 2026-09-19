// ============================================================
// [R28-2g-6] trxsw(同人小说网) 模板集合出口 —— R28 十站克隆(Wayback 路线)
// 站点: www.trxsw.com(同人小说网 · 杰奇 CMS 默认模板 · /images/b.css · GBK · 960px 版心)
// 素材: 首页 2019-10-19 Wayback 快照实测(/tmp/r28-2g/snap/tx-home.html, R25-1/R27-6b 同源
// DOM 复核); 内页(Category/Book/Toc/Read/Ranking/Fulltext/Search)Wayback 全 404 实证
// (R28-2g-0 复抓 tx-book/tx-read/tx-top/tx-full/tx-search/tx-quanben 均为 Wayback 错误页)
// → 按杰奇 CMS 家族标准补全(先例: R27-6b)。
//
// 页型覆盖表:
//   Home      = Wayback 实测(2019-10-19 快照逐节复刻: .novelslist×2×3 + 图文头条 67×82
//               + «书名 /作者» li + #newscontent .l s1..s5 + .r + #firendlink)
//   Category  = 家族标准(真站分类 URL 形态 /book/{cat}_{sort}_0_0_0_0_{page}.html cat1..7
//               快照导航实证, 页本体无存档)
//   Book      = 家族标准(书 URL /book/{id}/ 快照 94 条实链实证, 页本体无存档)
//   Toc       = 家族标准(杰奇书页 #list dd 目录块独立成页)
//   Read      = 家族标准(章节 URL /book/{bid}/{cid}.html 快照 s3 实链实证, 页本体无存档)
//   Ranking   = 家族标准(真站排行入口 /book/0_monthvisit_0_0_0_0_1.html 快照导航实证)
//   Fulltext  = 家族标准(真站全本入口 /book/0_lastupdate_0_0_2_0_1.html 快照导航实证)
//   Search    = 家族标准(杰奇 /modules/article/search.php GET searchkey 家族惯例 + 快照
//               #searchbar 搜索框壳实证)
//
// CSS 色板出处(三级标注): 全部为「杰奇 CMS 默认模板家族标准」级(b.css 无存档, R25 轮
// archive css 快照全 404 实证); 结构级 DOM 按 Wayback 实测快照复刻:
//   白底 #fff / 14px 宋体 arial 系        —— 家族标准
//   nav 深蓝渐变 #1C5087→#1F5FA9 白字     —— 家族标准(任务书色板; R25-4 主题层已复刻)
//   logo/hover 红 #C00                    —— 家族标准
//   正文 #333 / 灰 #666 / 弱灰 #999       —— 家族标准
//   边线 #ddd / li 底部点线 #ccc          —— 家族标准(36px 行高)
//   ywtop/页脚 #f5f5f5                    —— 家族标准
//   h2 渐变 #fafbfc→#e9eef5 + 左 4px 竖条 —— 家族标准(真站 h2 为底纹图 → CSS 渐变等价)
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { TrxswHome } from './Home'
import { TrxswCategory } from './Category'
import { TrxswBook } from './Book'
import { TrxswToc } from './Toc'
import { TrxswRead } from './Read'
import { TrxswRanking } from './Ranking'
import { TrxswFulltext } from './Fulltext'
import { TrxswSearch } from './Search'
import { TrxswFooter } from './Footer' // [R46-2b-1] 真站实抓重校准页脚(唐人小说网 33yq 家族 .footer/.footer_cont, 无底色 #302b35 字)

export const trxswTemplate: SiteTemplateSet = {
  Home: TrxswHome,
  Category: TrxswCategory,
  Book: TrxswBook,
  Toc: TrxswToc,
  Read: TrxswRead,
  Ranking: TrxswRanking,
  Fulltext: TrxswFulltext,
  Search: TrxswSearch,
  // [R41-C-9] 页脚挂载(通用 SiteFooter 退位)
  Footer: TrxswFooter,
  // [R28-2g-6] 站点级克隆 CSS —— 伪类/媒体查询集中于此; 逐条注明出处(家族标准级)
  css: `
/* [R46-2b-3] body 基线校准: 33yq.css 实测 body{background:#e9faff;color:#555;font-size:14px;
   font-family:Arial,'Microsoft YaHei','宋体'} — 主题 vars.bg/text 已同步对齐(见 themes.ts) */
.clone-trxsw{color:#555;font-size:14px}
/* [R46-2b-3] 全局链接色校准: 33yq.css 实测 a{color:#6f78a7} a:hover{text-decoration:underline}
   (旧值 #333/hover #C00 系 2019 杰奇家族推定, 真站现模板无此规则) */
.clone-trxsw a{color:#6f78a7;text-decoration:none}
.clone-trxsw a:hover{text-decoration:underline}
/* [R28-2g-6] 杰奇家族分页/榜 tab 钮: 白底灰边, hover 深蓝白字; 当前页 strong 深蓝白字(组件内联已配色, 此处兜底伪类) */
.clone-trxsw .tx-pg{background:#fff;color:#333;border-color:#ddd;transition:background .15s ease,color .15s ease}
.clone-trxsw .tx-pg:hover:not(:disabled):not(.tx-pg-on){background:#1C5087;color:#fff}
/* [R28-2g-6] 杰奇家族正文段(家族标准: 段落 2em 缩进) */
.clone-trxsw .tx-content p{margin:0 0 12px;text-indent:2em}
/* [R28-2g-6] 杰奇家族 h2 等价底纹(真站为底纹图 → 线性渐变等价; 组件内联承担, 此处兜底动态节点) */
.clone-trxsw .tx-sec h2{background:linear-gradient(180deg,#fafbfc 0%,#e9eef5 100%)}
/* [R46-2b-1] 页脚: 33yq.css 实测 .footer{margin:auto;width:980px;text-align:center} +
   .footer_cont{margin:10px auto auto} + .footer_cont p{color:#302b35;line-height:20px};
   真站无底色(透出 body #e9faff, 见 themes.ts vars.bg [R46-2b-3]); 980 定宽 → max-width+width:100% 无横滚适配 */
.clone-trxsw .trx-footer{margin:0 auto;max-width:980px;width:100%;box-sizing:border-box;text-align:center}
.clone-trxsw .trx-footer-cont{margin:10px auto 0;padding:0 10px}
.clone-trxsw .trx-footer-cont p{margin:0;color:#302b35;line-height:20px}
/* [R46-2b-1] 页脚备案链接: 真站 a 全局色 #6f78a7(33yq.css a{color:#6f78a7}), hover 下划线 */
.clone-trxsw .trx-footer-cont a{color:#6f78a7}
.clone-trxsw .trx-footer-cont a:hover{text-decoration:underline}
/* [R46-2b-2] #firendlink 友链条: 33yq.css 实测逐条(padding 1px/2px #a6d3e8 边/圆角 10/#fff 底/22px 行;
   h2 30px 高 #daedf5 底条+1px #ddd 下界/左缩进 10px/700 14px; a margin-left 5px, hover #f60;
   真站 972 定宽 → max-width+width:100%) */
.clone-trxsw .trx-firendlink{overflow:hidden;margin:14px auto 0;padding:1px;max-width:972px;width:100%;box-sizing:border-box;border:2px solid #a6d3e8;border-radius:10px;background:#fff;line-height:22px}
.clone-trxsw .trx-firendlink h2{overflow:hidden;margin:0;padding:0 0 0 10px;height:30px;border-bottom:1px solid #ddd;background-color:#daedf5;font-weight:700;font-size:14px;line-height:30px}
.clone-trxsw .trx-firendlink a{margin-left:5px;margin-right:5px;color:#6f78a7}
.clone-trxsw .trx-firendlink a:hover{color:#f60;text-decoration:none}
/* [R28-2g-6] 响应式: 真站 2019 年固定 960px 非响应式 → 组件端栅格降级已承担(sm/lg 断点),
   375px 无横滚(列表行 min-w-0 + truncate 截断 + 外层 px-2) */
/* [R46-2b-2] 友链/页脚窄屏: 972/980 已 max-width 收口, 仅补内边距防贴边(真站移动端无快照, 近似) */
@media (max-width: 640px) {
  .clone-trxsw .trx-firendlink{margin-left:8px;margin-right:8px;width:auto}
  .clone-trxsw .trx-footer{padding-left:8px;padding-right:8px}
}
`,
}
