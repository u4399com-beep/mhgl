// ============================================================
// [R39-2a] aijjxs(久久小说下载网 www.aijjxs.com) 8 页型克隆模板集
//   基础五视图: Home.tsx 首页 / Category.tsx 分类页 / Book.tsx 书页 / Toc.tsx 目录页 / Read.tsx 章节页
//   扩展三视图: Fulltext.tsx 全站书库(真站 /txt/) / Search.tsx 搜索结果(推断级, 真站 POST 搜索无结果页快照)
//   Ranking 不实现: 真站无独立排行页(榜单仅为首页 aside「点击榜/一周热榜」板块, 见 Home.tsx;
//   快照 2026-09-18 直连实抓复核无 /top/ /paihang/ 类路由)。
//
//   勘察产物(/tmp/r39-snap/aijjxs/, 2026-09-18 直连实抓; R40 复核 /tmp/r40-snap/aijjxs*):
//   home.html(52.9KB→57.8KB) / category.html(/txt/chuanyue/ 17.8KB) / book.html(/txt/57384.html 12.7KB)
//   / read.html(/read/57384/ 章节列表) / read2.html(/read/47/57384/2.html 正文页 27.7KB)
//   + css-0-style.css(39.7KB) / css-1-Common.css(18.9KB) / css-read.css(read.css 13.0KB) 三份真站样式全量。
//
//   [R41-A] 页脚: 源站 footer.foot 1:1 仿制迁至 Footer.tsx(AijjxsFooter, /tmp/r41-snap/aijjxs.com.html 尾部实抓),
//   经 index.ts Footer 槽由 PublicSite CloneFooter 统一渲染; 各页型内嵌的旧 parts.tsx 页脚已同步摘除,
//   旧 parts.tsx 仅含页脚组件 → 文件随之删除。
//
//   css 字段: [R40-a] 补齐全量布局 CSS(R39 轮仅写了 hover/伪类/媒体查询导致整页裸文本流)。
//   全部以 .clone-aijjxs 作用域开头(PublicSite 以 <style data-template-clone-css> 注入, 禁止全局污染);
//   色值/字号/间距一律取真站 style.css :root 与具体类实测值, 每条规则行注释标注出处;
//   组件内联样式(style={{}})已有的属性不在 CSS 重复定义, CSS 只补组件未内联的布局/排版/间距/响应式。
//   已知近似(read.css 13KB 未随 R40 快照存档, 阅读页部分尺寸按家族面板形态还原): 见各「近似」注释。
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { AijjxsHome } from './Home'
import { AijjxsCategory } from './Category'
import { AijjxsBook } from './Book'
import { AijjxsToc } from './Toc'
import { AijjxsRead } from './Read'
import { AijjxsFulltext } from './Fulltext'
import { AijjxsSearch } from './Search'
import { AijjxsFooter } from './Footer'

export const aijjxsTemplate: SiteTemplateSet = {
  Home: AijjxsHome,
  Category: AijjxsCategory,
  Book: AijjxsBook,
  Toc: AijjxsToc,
  Read: AijjxsRead,
  Fulltext: AijjxsFulltext,
  Search: AijjxsSearch,
  // [R41-A] 源站 1:1 仿制页脚(PublicSite CloneFooter 渲染, 替换通用 SiteFooter)
  Footer: AijjxsFooter,
  css: `
/* ================= [R40-a] 基线(真站 style.css body/:root 实测) ================= */
/* 真站 body: line-height 1.7 + padding-top 58px 补偿 fixed 顶导航(680 断点 54px, 见媒体查询) */
.clone-aijjxs{line-height:1.7;padding-top:58px}
/* 真站 a 基线: color var(--brand-dark)=#115e59, hover var(--brand)=#0f766e */
.clone-aijjxs a{color:#115e59;text-decoration:none}
.clone-aijjxs a:hover{color:#0f766e;text-decoration:underline}
/* 版心(真站 .wrap: max-width 1220 居中 padding 18 14 36; 页面根容器均等价 .wrap, header.top 由 .ajx-top 自行居中) */
/* [R49-2a-1] 版心选择器原含 .ajx-cat —— 与列表行「分类胶囊」<span class=ajx-cat> 同名碰撞, width:100% 被注入胶囊 →
   胶囊占满整行把书名 <a> 压到 0 宽(实测 offsetWidth=0, 书名不可见, 用户报障根因之一);
   页根类名 Category.tsx 改 .ajx-catpage, 胶囊 .ajx-cat(对齐真站 .cat)仅由 L114/L287 胶囊规则承载 */
.clone-aijjxs .ajx-home,.clone-aijjxs .ajx-catpage,.clone-aijjxs .ajx-book-page,.clone-aijjxs .ajx-toc,.clone-aijjxs .ajx-full,.clone-aijjxs div.ajx-search{max-width:1220px;width:100%;margin:0 auto;padding:0 14px 36px}
/* ---- 行内链接既有语义(保留 R39 轮已实测的行级色值) ---- */
.clone-aijjxs .ajx-line a{color:#115e59;text-decoration:none}
.clone-aijjxs .ajx-line a:hover{color:#0f766e;text-decoration:underline}
/* 真站 .book a:hover: #09B295 无下划线(style.css .book a:hover 实测) */
.clone-aijjxs .ajx-book-card a{color:#115e59;text-decoration:none}
.clone-aijjxs .ajx-book-card a:hover{color:#09B295;text-decoration:none}

/* ================= 顶部固定导航(真站 .top-float 深酒红条, style.css 1721-1757 实测) ================= */
/* [R49-2a-2] 按真站 2026-09-20 实抓 style.css 终态级联校准: 末段 "top-float deeper-bg" 覆盖为
   平涂 rgba(52,6,16,.86)(弃 R18 期三段深酒红渐变), 边框 rgba(255,214,224,.28), 单层投影 0 8px 24px rgba(60,10,20,.28) */
.clone-aijjxs .ajx-topfloat{position:fixed;top:0;left:0;right:0;z-index:1200;display:flex;align-items:center;padding:8px 9px;background:rgba(52,6,16,.86);border-bottom:1px solid rgba(255,214,224,.28);backdrop-filter:blur(12px) saturate(145%);box-shadow:0 8px 24px rgba(60,10,20,.28)}
/* 真站 .top-float-inner(padding 8 9 + 居中)并入外壳; margin auto 居中兼容 overflow-x 滚动(防左端不可达) */
.clone-aijjxs .ajx-topfloat-nav{display:flex;gap:5px;margin:0 auto;overflow-x:auto;white-space:nowrap;scrollbar-width:none;-ms-overflow-style:none}
.clone-aijjxs .ajx-topfloat-nav::-webkit-scrollbar{width:0;height:0;display:none}
/* [R40-a-1] 修正: R39 轮误写深青字色(#115e59)于深酒红条上不可读; 真站 .top-float-nav a 为白字 13px w800 padding 7 8, hover 白26%底+圆角8 */
.clone-aijjxs .ajx-tf-a{color:#ffffff;font-weight:800;font-size:13px;line-height:1.3;padding:7px 8px;border:0;border-radius:0;background:transparent;text-decoration:none}
.clone-aijjxs .ajx-tf-a:hover{color:#ffffff;background:rgba(255,255,255,.26);border-radius:8px;text-decoration:none}
/* [R40-a-2] 外层 SiteHeader 壳(header registry site-border 特例)的 1px 底边与 .ajx-top 自身边框叠加成双线 → 去壳线(壳为无类 header 元素) */
.clone-aijjxs header:not(.ajx-top){border-bottom:0!important;background:transparent!important}

/* ================= header.top(真站 .top/.top-1/.logo/.top-links/.search 实测) ================= */
.clone-aijjxs .ajx-top{max-width:1192px;width:calc(100% - 28px);margin:18px auto 0;padding:16px;background:rgba(255,253,248,.9);border:1px solid #e5dccd;border-radius:14px;box-shadow:0 10px 30px rgba(17,24,39,.08)}
.clone-aijjxs .ajx-top-1{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
/* 真站 .top .logo: baseline 内联 small + 琥珀渐变下划线 ::after */
.clone-aijjxs .ajx-logo{position:relative;display:inline-flex;align-items:baseline;gap:8px;margin:0;font-size:clamp(18px,2.6vw,22px);font-weight:800;letter-spacing:1.2px;line-height:1.2;color:#7c2d12;text-shadow:0 1px 0 rgba(255,255,255,.65)}
.clone-aijjxs .ajx-logo::after{content:"";position:absolute;left:0;bottom:-8px;width:min(210px,58%);height:4px;border-radius:999px;background:linear-gradient(90deg,#b45309,rgba(180,83,9,0))}
.clone-aijjxs .ajx-logo small{font-size:13px;color:#6b7280;letter-spacing:0;font-weight:400}
/* 真站 .top-links: 数据行 + em 数字徽章(琥珀) + 链接青绿 w600 */
.clone-aijjxs .ajx-top-links{display:flex;gap:8px 10px;font-size:14px;flex-wrap:wrap;align-items:center;color:#475569;line-height:1.7}
.clone-aijjxs .ajx-top-links em{color:#b45309;font-style:normal;font-weight:700;background:#fff4d9;border:1px solid #f2d8a5;border-radius:999px;padding:1px 8px}
.clone-aijjxs .ajx-top-links a{color:#0f766e;font-weight:600}
.clone-aijjxs .ajx-top-links a:hover{color:#0b5f58;text-decoration:none}
.clone-aijjxs .ajx-strong{font-weight:700}
/* 真站 .search: grid 1fr/128px gap10, input 44px 圆角10, 品牌渐变按钮 —— 限定 form 元素, 避免命中搜索结果页根 div.ajx-search [R40-a-3] */
.clone-aijjxs form.ajx-search{margin-top:12px;display:grid;grid-template-columns:1fr 128px;gap:10px}
.clone-aijjxs form.ajx-search input{height:44px;border-radius:10px;border:1px solid #e5dccd;padding:0 13px;font-size:15px;background:#fffdf8;color:#1f2937}
.clone-aijjxs form.ajx-search input:hover{border-color:#d6c6ad}
.clone-aijjxs .ajx-search input:focus{border-color:rgba(15,118,110,.45);box-shadow:0 0 0 3px rgba(15,118,110,.12);outline:none}
.clone-aijjxs form.ajx-search button{border:0;border-radius:10px;background:linear-gradient(135deg,#0f766e,#115e59);color:#fff;padding:3px 0;font-size:15px;cursor:pointer}
.clone-aijjxs form.ajx-search button:hover{background:linear-gradient(135deg,#0b5f58,#0f766e)}

/* ================= 双栏骨架与面板(真站 .layout/.panel/.panel h3/.body 实测) ================= */
/* 真站 .layout: margin-top 16, 1fr/330 gap14 */
.clone-aijjxs .ajx-layout{margin-top:16px;display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:14px;align-items:start}
/* 真站 .layout > aside: sticky top70 + height fit-content(980 内回落静态) */
.clone-aijjxs .ajx-layout > aside{position:sticky;top:70px;display:flex;flex-direction:column;gap:14px;height:fit-content}
/* 真站 .panel: 米黄纸面圆角卡 */
.clone-aijjxs .ajx-panel{border:1px solid #e5dccd;border-radius:14px;background:#fffdf8;box-shadow:0 10px 30px rgba(17,24,39,.08);min-width:0}
/* 同列面板纵向节奏(真站 aside 第二块起内联 margin-top:14px 同值) */
.clone-aijjxs .ajx-layout section > .ajx-panel + .ajx-panel{margin-top:14px}
/* 真站 .panel h3(合并 style.css 两处定义): 左侧青-琥珀竖条 ::before + 底边 */
.clone-aijjxs .ajx-h3{position:relative;margin:0;padding:12px 12px 12px 20px;border-bottom:1px solid rgba(255,214,224,.28);font-size:18px;font-weight:700;color:#1f3f3a;letter-spacing:.4px}
.clone-aijjxs .ajx-h3::before{content:"";position:absolute;left:10px;top:50%;transform:translateY(-50%);width:4px;height:18px;border-radius:3px;background:linear-gradient(180deg,#0f766e,#b45309)}
/* 真站 .latest small: 琥珀色 small 说明字 */
.clone-aijjxs .ajx-latest-h small{font-size:13px;color:#b45309;margin-left:8px;font-weight:400}
.clone-aijjxs .ajx-body{padding:12px 14px;min-width:0}

/* ================= 列表行(真站 .lines/.lines-books/.rank/.book_r 实测) ================= */
.clone-aijjxs .ajx-lines{list-style:none;margin:0;padding:0}
.clone-aijjxs .ajx-line{display:flex;justify-content:space-between;gap:10px;border-bottom:1px dashed #e5dccd;padding:7px 0;min-width:0}
.clone-aijjxs .ajx-line:last-child{border-bottom:0}
.clone-aijjxs .ajx-books .ajx-line{align-items:center;padding:9px 0}
.clone-aijjxs .ajx-line-main{display:flex;align-items:center;gap:8px;min-width:0;flex:1}
/* 真站 .lines-books .cat: 青绿分类胶囊 11px */
.clone-aijjxs .ajx-cat{flex:0 0 auto;font-size:11px;line-height:1;color:#0f766e;background:#e8f7f4;border:1px solid #b9e3dc;border-radius:999px;padding:4px 8px}
.clone-aijjxs .ajx-line-main > a{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clone-aijjxs .ajx-author{flex:0 0 auto;font-size:12px;color:#64748b}
.clone-aijjxs .ajx-date{flex:0 0 auto;min-width:42px;text-align:left;color:#6b7280;font-size:12px;white-space:nowrap}
/* 真站 .new: 48h 内新章日期红 #F03 */
.clone-aijjxs .ajx-new{color:#F03}
/* 真站 .rank: 米黄底 + 序号 .no 棕红 */
.clone-aijjxs .ajx-rank{background:#fff5e6}
.clone-aijjxs .ajx-rank .ajx-line{justify-content:flex-start}
.clone-aijjxs .ajx-rank .ajx-line > a{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clone-aijjxs .ajx-no{display:inline-block;min-width:18px;text-align:center;font-weight:700;color:#9a3412;flex:0 0 auto;margin-right:4px}
.clone-aijjxs .ajx-rank .ajx-date{margin-left:auto;text-align:right}
/* 首页最新上传双列(真站 .lines-books-2col: 2列网格 col-gap14, 末两行去虚线; .gird2 为真站原始 typo 无规则, 双列由列表类承载 [R40-a-4]) */
.clone-aijjxs .ajx-books-2col,.clone-aijjxs .ajx-gird2 .ajx-books{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px}
.clone-aijjxs .ajx-books-2col .ajx-line:nth-last-child(-n+2),.clone-aijjxs .ajx-gird2 .ajx-books .ajx-line:nth-last-child(-n+2){border-bottom:0}
/* 一周热榜头条卡(真站 .book_r: 封面78x106 跨3行网格 + 右列 h4/meta/desc) */
.clone-aijjxs .ajx-book-r{display:grid;grid-template-columns:auto 1fr;column-gap:8px;align-items:start;margin-bottom:8px;overflow:hidden}
.clone-aijjxs .ajx-br-pic{grid-column:1;grid-row:1 / span 3;display:block;border:0;background:none;padding:0;margin:0;cursor:pointer}
.clone-aijjxs .ajx-br-pic > div{width:78px;height:106px;border:1px solid #d1d1d1;border-radius:0!important;overflow:hidden}
.clone-aijjxs .ajx-book-r h4{grid-column:2;grid-row:1;margin:0;font-size:15px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clone-aijjxs .ajx-book-r .ajx-meta{grid-column:2;grid-row:2}
.clone-aijjxs .ajx-book-r .ajx-desc{grid-column:2;grid-row:3;margin-top:2px;color:#6b7280}
/* 真站 .meta/.desc 基线(卡片上下文: 13px 灰) */
.clone-aijjxs .ajx-meta{color:#6b7280;font-size:12px;margin-top:4px}
.clone-aijjxs .ajx-desc{margin-top:4px;font-size:13px;color:#9ca3af;line-height:1.55}
/* 真站 .tags: 标签胶囊 */
.clone-aijjxs .ajx-tags{display:flex;flex-wrap:wrap;gap:8px}
.clone-aijjxs .ajx-tags a{border:1px solid #cae8e3;background:#eef9f7;padding:4px 10px;border-radius:999px;font-size:13px}

/* ================= 数据统计 hero(真站 .hero/.kpi 实测) ================= */
.clone-aijjxs .ajx-hero{margin-top:14px;border:1px solid #e5dccd;border-radius:14px;background:linear-gradient(120deg,rgba(15,118,110,.12),rgba(180,83,9,.12));padding:18px}
.clone-aijjxs .ajx-hero h2{position:relative;display:inline-block;margin:0 0 6px;padding-right:8px;font-size:clamp(18px,2.6vw,22px);font-weight:800;color:#0f4f4a;letter-spacing:1px}
.clone-aijjxs .ajx-hero h2::after{content:"";position:absolute;left:0;bottom:-6px;width:100%;height:3px;border-radius:999px;background:linear-gradient(90deg,rgba(15,118,110,.72),rgba(180,83,9,.18))}
.clone-aijjxs .ajx-hero h2 small{font-size:13px;color:#6b7280;margin-left:8px;font-weight:400}
.clone-aijjxs .ajx-hero p{margin:6px 0 0;color:#374151;font-size:13px}
.clone-aijjxs .ajx-kpi{margin-top:12px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.clone-aijjxs .ajx-kpi-item{border:1px solid #e5dccd;background:#fff;border-radius:12px;padding:10px;text-align:center;min-width:0}
.clone-aijjxs .ajx-kpi-num{font-size:22px;color:#115e59;font-weight:700;line-height:1.2;overflow:hidden;text-overflow:ellipsis}
.clone-aijjxs .ajx-kpi-txt{font-size:12px;color:#6b7280}

/* ================= 分类/书库/搜索列表页(真站 .layout > .cenMain + .articleInfo h1 + .pager 实测) ================= */
.clone-aijjxs .ajx-cen-main{min-width:0;border:1px solid #e5dccd;border-radius:14px;background:#fffdf8;box-shadow:0 10px 30px rgba(17,24,39,.08);padding:14px 16px}
.clone-aijjxs .ajx-article-info h1{margin:0 0 12px;padding-bottom:10px;border-bottom:1px solid #eadfcd;font-size:20px;line-height:1.35;color:#1f3f3a;text-align:center}
/* 真站 .pager: 30px 高胶囊钮, 当前页指示品牌底白字 */
.clone-aijjxs .ajx-pager{margin-top:14px;display:flex;gap:3px;flex-wrap:wrap;align-items:center}
.clone-aijjxs .ajx-pager button{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:30px;padding:4px 5px;border-radius:8px;border:1px solid #e5dccd;background:#fff;color:#115e59;cursor:pointer}
.clone-aijjxs .ajx-pager button[disabled]{opacity:.45;cursor:not-allowed}
.clone-aijjxs .ajx-pager-info{display:inline-flex;align-items:center;height:30px;padding:4px 9px;border-radius:8px;border:1px solid #0f766e;background:#0f766e;color:#fff;font-weight:700;font-size:13px;white-space:nowrap}

/* ================= 书页(真站 .detail/.kv/.sfwj/.copy-btn/.download-btn/.tips/.book/.badge 实测) ================= */
/* 真站 .detail: 封面列 122 + 内容列(本克隆无 author-side 第三列) */
.clone-aijjxs .ajx-detail{display:grid;grid-template-columns:122px minmax(0,1fr);gap:14px;align-items:start}
.clone-aijjxs .ajx-pic{padding:6px 0 0;display:flex;flex-direction:column;align-items:flex-start;gap:7px}
.clone-aijjxs .ajx-pic > div{width:112px;height:148px;border:1px solid #d1d5db;border-radius:0!important;background:#fff;padding:1px;box-sizing:border-box}
.clone-aijjxs .ajx-copy-btn{display:inline-block;border:1px solid #b8ddd6;border-radius:8px;padding:6px 10px;font-size:12px;background:#fff;color:#0f766e;text-decoration:none;cursor:pointer}
.clone-aijjxs .ajx-copy-btn:hover{background:#e5fcfa;text-decoration:none;color:#0f766e}
.clone-aijjxs .ajx-kv{min-width:0}
.clone-aijjxs .ajx-kv p{margin:0 0 4px 4px}
.clone-aijjxs .ajx-kv a:hover{color:#09B295;text-decoration:none}
/* 真站 .sfwj: 青底白字胶囊(写作进度) */
.clone-aijjxs .ajx-sfwj{background:#09B295;border-radius:9px;color:#fff;padding:1px 8px 3px 6px}
/* 真站 .page-info .intro-panel .desc: 15px 无边透明 */
.clone-aijjxs .ajx-intro-panel .ajx-desc{margin-top:0;font-size:15px;color:#374151;line-height:1.7}
/* 真站 .download-btn: 橙渐变 #da5627→#b13e18; 阅读钮沿用 R39 品牌青变体(与既有 hover 规则一致) */
.clone-aijjxs .ajx-download-btn{display:inline-flex;align-items:center;justify-content:center;min-width:184px;margin:0 10px 10px 0;border-radius:12px;padding:11px 16px;color:#fff!important;text-decoration:none;font-weight:700;background:linear-gradient(135deg,#da5627,#b13e18);box-shadow:0 10px 18px rgba(184,70,29,.24);cursor:pointer;transition:background .2s ease,box-shadow .2s ease}
.clone-aijjxs .ajx-dl-read{background:linear-gradient(135deg,#0f766e,#0b5f58);box-shadow:0 10px 18px rgba(15,118,110,.24)}
.clone-aijjxs .ajx-dl-read[disabled]{opacity:.55;cursor:not-allowed}
/* 真站 .page-info .panel .body .tips: TIP 徽章虚线提示条 */
.clone-aijjxs .ajx-tips{position:relative;margin-top:12px;padding:12px 14px 12px 44px;border:2px dashed #efd3bb;border-radius:10px;background:linear-gradient(180deg,#fffdf9 0%,#fff8f1 100%);color:#8b4a22;line-height:1.8;font-size:13px}
.clone-aijjxs .ajx-tips::before{content:"TIP";position:absolute;left:12px;top:24px;transform:translateY(-50%);display:inline-block;padding:1px 6px;border-radius:999px;background:#d86a2f;color:#fff;font-size:11px;font-weight:700;letter-spacing:.3px;line-height:16px}
/* 真站 .grid2 + .book 卡 + .badge(猜您喜欢) */
.clone-aijjxs .ajx-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.clone-aijjxs .ajx-book-card{border:1px solid #e5dccd;border-radius:12px;background:#fff;padding:10px;overflow:hidden;cursor:pointer}
.clone-aijjxs .ajx-book-card h4{margin:0;font-size:15px;line-height:1.4}
.clone-aijjxs .ajx-badge{display:inline-block;font-size:12px;color:#fff;background:#b45309;border-radius:5px;padding:1px 6px;margin-right:6px}

/* ================= 目录页(真站 read-wrap/read-panel/chapter-list; read.css 未随 R40 存档, 面板与格子按家族面板形态还原=近似) ================= */
/* 真站 .read-wrap(宽度未存档→近似 1000 居中); margin-top 16 与 .ajx-layout 节奏一致 */
.clone-aijjxs .ajx-read-wrap{max-width:1000px;margin:16px auto 0}
.clone-aijjxs .ajx-read-panel{border:1px solid #e5dccd;border-radius:14px;background:#fffdf8;box-shadow:0 10px 30px rgba(17,24,39,.08);padding:16px 16px 18px}
.clone-aijjxs .ajx-read-title{margin:0 0 6px;font-size:26px;line-height:1.35;color:#1f3f3a;font-weight:700}
.clone-aijjxs .ajx-read-meta{font-size:13px;color:#6b7280;line-height:1.7}
.clone-aijjxs .ajx-read-meta a{color:#115e59;margin-left:10px}
.clone-aijjxs .ajx-read-intro{margin-top:10px;padding:10px 12px;border:1px solid #ece2d2;border-radius:10px;background:#fff;color:#374151;font-size:14px;line-height:1.7}
/* 章节格(auto-fill minmax200 与组件加载骨架一致); hover/active 见下方既有规则 */
.clone-aijjxs .ajx-chapter-list{margin:14px 0 0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.clone-aijjxs .ajx-chapter-list li{min-width:0}
.clone-aijjxs .ajx-chapter-list a{display:block;padding:9px 10px;border:1px solid #e5dccd;border-radius:8px;background:#fff;color:#115e59;font-size:14px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none}
.clone-aijjxs .ajx-chapter-list a{transition:border-color .15s ease,background .15s ease}
.clone-aijjxs .ajx-chapter-list a:hover{border-color:#cfd9e8;background:#f9fbff}
.clone-aijjxs .ajx-chapter-list a.is-active{border-color:#0f766e;color:#0f766e;background:#e8f7f4}

/* ================= 阅读页(真站 body.read-v3=组件内联渐变; 工具条/正文面板按 read.css 残留注释值还原) ================= */
.clone-aijjxs .ajx-read{padding:0 0 8px}
/* 工具条面板(真站 .sk_gb; 近似: 与 .view_page 同族面板形态 边#e5dccd 圆角13 半透明纸底) */
.clone-aijjxs .ajx-sk-gb{border:1px solid #e5dccd;border-radius:13px;background:rgba(255,253,248,.86);padding:10px 12px}
.clone-aijjxs .ajx-duset{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;font-size:13px;color:#6f4f34}
.clone-aijjxs .ajx-duset b{color:#6f4f34;font-weight:700}
/* 真站 #skbglist .c: 18px 圆形色板 边 rgba(0,0,0,.25) */
.clone-aijjxs .ajx-skbglist{display:inline-flex;align-items:center;gap:6px}
.clone-aijjxs .ajx-c{display:inline-block;width:18px;height:18px;border-radius:50%;border:1px solid rgba(0,0,0,.25);cursor:pointer}
.clone-aijjxs .ajx-c.is-active{box-shadow:0 0 0 2px rgba(15,118,110,.55)}
/* 真站 #fonts .s: 边#d8cab7 圆角8 字色#6f4f34 */
.clone-aijjxs .ajx-fonts{display:inline-flex;align-items:center;gap:6px}
.clone-aijjxs .ajx-s{display:inline-block;padding:4px 9px;border:1px solid #d8cab7;border-radius:8px;background:#fff;color:#6f4f34;font-size:13px;text-decoration:none;cursor:pointer;transition:background .15s ease,border-color .15s ease}
.clone-aijjxs .ajx-s:hover{border-color:#d8a366}
.clone-aijjxs .ajx-s.is-active{background:#fbe8ce;border-color:#d8a366;color:#80410f}
.clone-aijjxs .ajx-ffamily{height:30px;border:1px solid #d8cab7;border-radius:8px;padding:0 8px;background:#fff;color:#6f4f34;font-size:13px;cursor:pointer}
/* 真站 #ys_menu 字体颜色菜单 */
.clone-aijjxs .ajx-ys{display:inline-flex;align-items:center}
.clone-aijjxs .ajx-ys a{margin-right:8px;display:inline-block;padding:3px 8px;border:1px solid #e5dccd;border-radius:8px;background:#fff;font-size:13px;font-weight:600;text-decoration:none}
.clone-aijjxs .ajx-ys a:hover{background:#f5efe6}
.clone-aijjxs .ajx-ys a.is-active{border-color:#d8a366;background:#fbe8ce}
.clone-aijjxs .ajx-dushint{font-size:12px;color:#9ca3af}
/* 章节标题区(真站 .view_t/.view_intro; 尺寸近似: read.css 未存档) */
.clone-aijjxs .ajx-view-t{text-align:center}
.clone-aijjxs .ajx-view-t h1{margin:0 0 4px;font-size:24px;line-height:1.4;color:#1f2937;font-weight:700}
.clone-aijjxs .ajx-view-intro{font-size:13px;color:#6b7280}
/* 正文面板(真站 #view_content_txt; 字号/行距/字色/底色由组件内联工具条状态驱动) */
.clone-aijjxs .ajx-read-txt{padding:18px 20px 24px;border:1px solid #e5dccd;border-radius:13px;min-height:320px}
/* 真站 read.css #view_content_txt p: 段距 1.2em/缩进 2.4em/首段不缩进 */
.clone-aijjxs .ajx-read-txt p{margin:0 0 1.2em;text-indent:2.4em}
.clone-aijjxs .ajx-read-txt p:first-child{text-indent:0}
/* 真站 .view_page 面板形态翻页钮 */
.clone-aijjxs .ajx-view-page{display:flex;justify-content:center;gap:10px;padding:10px 9px;border:1px solid #e5dccd;border-radius:13px;background:rgba(255,253,248,.86)}
.clone-aijjxs .ajx-view-page button{padding:8px 18px;border:1px solid #d8cab7;border-radius:10px;background:#fff;color:#6b3418;font-size:14px;cursor:pointer}
.clone-aijjxs .ajx-view-page button:hover:not([disabled]){background:#fbe8ce;border-color:#d8a366;color:#80410f}
.clone-aijjxs .ajx-view-page button[disabled]{opacity:.45;cursor:not-allowed}

/* ---- 分页钮 hover(真站 .pager a:hover: bg #f3ede1) ---- */
.clone-aijjxs .ajx-pager button:hover:not([disabled]){background:#f3ede1}
/* ---- 首页「展示更多」按钮 hover(真站 .latest-upload-more:hover: #d6a63d/#b27400/#fffaf0; 按钮本体为 JS 行为本克隆未渲染, 规则保留) ---- */
.clone-aijjxs button.ajx-more:hover,.clone-aijjxs a.ajx-more:hover{border-color:#d6a63d;color:#b27400;background:#fffaf0}
/* ---- 书页下载钮 hover(真站 .download-btn:hover: #c94a20→#9e350f 加深+投影) ---- */
.clone-aijjxs .ajx-dl-read:hover{background:linear-gradient(135deg,#0f766e,#0b5f58)!important;box-shadow:0 12px 20px rgba(15,118,110,.28);color:#fff}
.clone-aijjxs .ajx-dl-toc:hover{background:linear-gradient(135deg,#c94a20,#9e350f)!important;box-shadow:0 12px 20px rgba(184,70,29,.3);color:#fff}

/* ================= 页脚(真站 .foot: margin-top 24 + padding-top 12 + 上边框 --line + 13px --muted 实测;
   版心随 .wrap 1220 居中, 左右 14 同 .wrap padding) [R41-A]
   [R41-主-2] E2E 截图对比修正: 源站页脚左对齐(源站 .foot 无 text-align 居中), 链接色继承全局 a=--brand-dark #115e59 ================= */
.clone-aijjxs .ajx-ft{margin-top:24px;padding-top:12px;border-top:1px solid #e5dccd;font-size:13px;color:#6b7280;text-align:left;max-width:1220px;width:100%;box-sizing:border-box;margin-left:auto;margin-right:auto;padding-left:14px;padding-right:14px}
.clone-aijjxs .ajx-ft a{color:#115e59}
.clone-aijjxs .ajx-ft a:hover{text-decoration:underline}

/* ================= 移动端(真站断点 980/900/680/640/560; 560 仅签到栅格无对应类, 375px 无横向滚动) ================= */
@media (max-width: 980px){
  /* 真站 @980: .layout 单列 / .grid2/.grid3 单列 / .kpi 2列 / .lines-books-2col 单列 */
  .clone-aijjxs .ajx-layout{grid-template-columns:1fr}
  .clone-aijjxs .ajx-layout > aside{position:static;height:auto}
  .clone-aijjxs .ajx-grid2{grid-template-columns:1fr}
  .clone-aijjxs .ajx-kpi{grid-template-columns:repeat(2,minmax(0,1fr))}
  .clone-aijjxs .ajx-books-2col,.clone-aijjxs .ajx-gird2 .ajx-books{grid-template-columns:1fr}
  .clone-aijjxs .ajx-books-2col .ajx-line:nth-last-child(-n+2),.clone-aijjxs .ajx-gird2 .ajx-books .ajx-line:nth-last-child(-n+2){border-bottom:1px dashed #e5dccd}
  .clone-aijjxs .ajx-books-2col .ajx-line:last-child,.clone-aijjxs .ajx-gird2 .ajx-books .ajx-line:last-child{border-bottom:0}
}
@media (max-width: 900px){
  /* 真站 @900: .detail 102px 起排 */
  .clone-aijjxs .ajx-detail{grid-template-columns:102px minmax(0,1fr);gap:10px}
}
@media (max-width: 680px){
  /* 真站 body padding-top 54 + 顶条 padding 7 10 */
  .clone-aijjxs{padding-top:54px}
  .clone-aijjxs .ajx-topfloat{padding:7px 10px}
  .clone-aijjxs .ajx-logo{font-size:20px;letter-spacing:.6px}
  .clone-aijjxs .ajx-logo::after{bottom:-6px;height:3px;width:52%}
  /* 真站 @680: .search 单列堆叠 + iOS 16px 防缩放 */
  .clone-aijjxs form.ajx-search{grid-template-columns:1fr}
  .clone-aijjxs form.ajx-search input{font-size:16px}
  /* 真站 @680: .detail 84px 起排 + 封面 84x115 */
  .clone-aijjxs .ajx-detail{grid-template-columns:84px minmax(0,1fr);gap:8px}
  .clone-aijjxs .ajx-pic > div{width:84px;height:115px}
  /* 真站 @680: 行内 gap 收窄/分类胶囊缩小/作者列隐藏 */
  .clone-aijjxs .ajx-line-main{gap:6px}
  .clone-aijjxs .ajx-cat{padding:3px 6px;font-size:10px}
  .clone-aijjxs .ajx-books .ajx-author{display:none}
  .clone-aijjxs .ajx-cen-main{padding:11px 12px}
  .clone-aijjxs .ajx-article-info h1{margin-bottom:10px;font-size:18px}
  .clone-aijjxs .ajx-duset{gap:6px}
}
@media (max-width: 640px){
  .clone-aijjxs .ajx-chapter-list{grid-template-columns:1fr}
  .clone-aijjxs .ajx-read-title{font-size:22px}
}
/* 兜底: 375px 无横向滚动(行内容均 ellipsis 截断) */
.clone-aijjxs .ajx-home,.clone-aijjxs .ajx-catpage,.clone-aijjxs .ajx-book-page,.clone-aijjxs .ajx-toc,.clone-aijjxs .ajx-read,.clone-aijjxs .ajx-ft,.clone-aijjxs .ajx-search,.clone-aijjxs .ajx-full{overflow-x:hidden}
`,
}
