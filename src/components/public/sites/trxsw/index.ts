// ============================================================
// [R49-2a2-1] trxsw(唐人小说网 www.trxsw.com) 模板集合出口 —— R49-2a2 CSS 层移植完成版
// 沿革: R28-2g Wayback 杰奇旧版(2019 同人小说网) → R46-2b 页脚/友链/配色对齐真站 →
//   R49-2a-4 八页型组件全量重克隆(33yq 家族, 100+ trx-* 类) → **本轮 R49-2a2 css 字段全量移植**
//   (上轮组件层就绪但 css 字段仍是 R28 杰奇旧版 3 类 → 100 类零样式, 页面裸渲染)。
// 素材(持久化快照 /home/z/my-project/agent-ctx/r49-snap/trxsw/ 2026-09-20 CN 代理实抓):
//   home/category/book/toc/read/goodnum/lastupdate/ranking 8 页 HTML + 33yq.css(20033B) +
//   read.css(8614B) + common.js —— 与 x33yq 同族同源(520xs 家族), 逐值实测。
// CSS 纪律(对齐 x33yq/index.ts 已精校实现的结构组织):
//   · 全部值取自 33yq.css/read.css 实测; 快照缺失处(容器级 .novelslistss/面包屑/.MessageDiv/
//     ui_tb1 等)按同族 x33yq 校准值移植并注明 [R43-2v] 出处
//   · 规则全挂 .clone-trxsw 作用域; 定宽(980/978/976/968/958 等)→ max-width:100%+box-sizing
//     375px 零横滚; .trx-alistbox 按源站 content-box 语义显式还原(Tailwind preflight border-box
//     会压缩双列, R43-2v 实测踩坑先例)
//   · 页脚槽沿用 R46-2b 真站实测版(.trx-footer/.trx-footer-cont, 无底色 #302b35 字)
//   · 真站头部(headds/head/daohang/nav1)由 src/components/public/header/trxsw.tsx 承载(自带头部
//     样式), 组件层唯一用到的头部件是 Ranking 榜型栏 .trx-nav1(真站 top 页第二 .nav1 li.on 形态)
//   · 源站精灵图按钮(.btopt a yuedu.gif/.txtopt a btbg.gif + a span{visibility:hidden}) →
//     同族 x33yq 校准的实底近似(#67B5E2 白字圆角钮), span 保持可见承载文案
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
  // [R49-2a2-2] 站点级克隆 CSS —— 按 33yq.css/read.css 快照实测全量移植, 分段同 x33yq/index.ts:
  //   基线/版心/榜型导航/首页热点卡/新书排行/最近更新/分类列表/分页/书页/目录/阅读器/工具条/
  //   色板/搜索完本/页脚/封面守卫/窄屏
  css: `
/* ---- [R49-2a2-3] 基线(33yq.css 实测: body 14px #555 底 #e9faff; a #6f78a7; a:hover Red 下划线 L209/L220) ---- */
.clone-trxsw{font-size:14px;color:#555555;background-color:#e9faff}
.clone-trxsw a{color:#6f78a7;text-decoration:none}
.clone-trxsw a:hover{color:red;text-decoration:underline}
.clone-trxsw .trx-red{color:red}
.clone-trxsw .trx-clear{clear:both;height:0;overflow:hidden;font-size:0;line-height:0}
/* ---- [R49-2a2-3] 版心(33yq.css #main: width 980 margin auto padding 0 0 10px L170/L224) ---- */
.clone-trxsw #trx-main{width:980px;max-width:100%;margin:0 auto;padding:0 0 10px;box-sizing:border-box}
/* ---- [R49-2a2-3] 榜型导航(33yq.css .nav1 L187-190: #fff9d9 30px 边 #fc3 圆角10; li ml8 lh30;
     a 15px 700 #282828 雅黑 padding5; hover/激活 li.on #fff/#88c6e5 —— Ranking 榜型栏专用,
     组件层唯一头部件; 真站 top/goodnum/lastupdate 页第二 .nav1 li.on 实证) ---- */
.clone-trxsw .trx-nav1{margin:10px auto 0;width:978px;max-width:100%;height:30px;overflow:hidden;background:#fff9d9;border:1px solid #fc3;border-radius:10px;box-sizing:border-box}
.clone-trxsw .trx-nav1 ul{list-style:none;margin:0;padding:0}
.clone-trxsw .trx-nav1 ul:after{content:'';display:block;clear:both}
.clone-trxsw .trx-nav1 ul li{float:left;line-height:30px;margin-left:8px;overflow:hidden}
.clone-trxsw .trx-nav1 ul li a{padding:5px;color:#282828;font-weight:bold;font-size:15px;font-family:'Microsoft YaHei','微软雅黑','宋体',sans-serif;overflow:hidden;text-decoration:none}
.clone-trxsw .trx-nav1 ul li a:hover{color:#fff;background:#88c6e5;padding-top:5px;padding-bottom:5px;text-decoration:none}
.clone-trxsw .trx-nav1 ul li.trx-on a{color:#fff;background:#88c6e5}
/* [R49-2a2-3] 榜型栏变体标记类(与主导航同款几何, 在 #trx-main 内随版心收口) */
.clone-trxsw .trx-nav1.trx-nav1-rank{margin:10px auto 0}
/* ---- [R49-2a2-4] 首页热点区(33yq.css #hotcontent pt10 L145; .l 980 2px #a6d3e8 #fef9ef 圆角10
     L260 终态覆盖 L146; .item 310 左浮 pl10 pt10; .image 100; dl 170 右浮; dt 25 虚点下边
     #a6d3e8; dt span #b3b3b3; dd 120 缩进2em) ---- */
.clone-trxsw #trx-hotcontent{padding-top:10px}
.clone-trxsw #trx-hotcontent:after{content:'';display:block;clear:both}
.clone-trxsw #trx-hotcontent .trx-l{float:left;overflow:hidden;width:980px;max-width:100%;padding:0 0 10px;border:2px solid #a6d3e8;border-radius:10px;background:#fef9ef;box-sizing:border-box}
.clone-trxsw #trx-hotcontent .trx-item{width:310px;float:left;padding:10px 0 0 10px;box-sizing:border-box}
.clone-trxsw #trx-hotcontent .trx-item .trx-image{float:left;width:100px;cursor:pointer;border:0;background:none;padding:0}
.clone-trxsw #trx-hotcontent .trx-item .trx-image>div{border:1px solid #dddddd;background-color:#fff;box-sizing:border-box}
.clone-trxsw #trx-hotcontent .trx-item dl{float:right;padding:0 5px 0 0;width:170px;margin:0}
.clone-trxsw #trx-hotcontent .trx-item dl dt{height:25px;line-height:25px;overflow:hidden;font-size:14px;border-bottom:1px dotted #a6d3e8;font-weight:bold;margin:0}
.clone-trxsw #trx-hotcontent .trx-item dl dt span{float:right;font-weight:normal;color:#b3b3b3}
.clone-trxsw #trx-hotcontent .trx-item dl dd{padding:7px 0 0 0;line-height:20px;text-indent:2em;height:120px;overflow:hidden;margin:0}
/* ---- [R49-2a2-4] 新书排行榜块(33yq.css .novelslist 968 2px #a6d3e8 #fef9ef 圆角10 L5;
     .GARAN 960 L15; .top 315 左浮 L16; .image 71 图 67×82 边 #ddd L18-19; dl 219 右浮 dt25
     #b3b3b3 dd60 L20-23) ---- */
.clone-trxsw .trx-novelslist{margin:10px auto;border:2px solid #a6d3e8;width:968px;max-width:100%;padding:3px;background:#fef9ef;border-radius:10px;box-sizing:border-box}
.clone-trxsw .trx-GARAN{padding:0 3px;float:left;width:960px;max-width:100%;overflow:hidden;box-sizing:border-box}
.clone-trxsw .trx-GARAN h2{overflow:hidden;margin:0;padding-left:5px;height:25px;border-bottom:1px solid #a6d3e8;font-weight:bold;font-size:14px;line-height:25px}
.clone-trxsw .trx-GARAN .trx-top{width:315px;float:left;padding:0;box-sizing:border-box}
.clone-trxsw .trx-GARAN .trx-top .trx-image{float:left;padding:10px 0 0 5px;width:71px;cursor:pointer;border:0;background:none}
.clone-trxsw .trx-GARAN .trx-top .trx-image>div{border:1px solid #dddddd;background-color:#fff;box-sizing:border-box}
.clone-trxsw .trx-GARAN .trx-top dl{float:right;padding:10px 0 0;width:219px;margin:0}
.clone-trxsw .trx-GARAN .trx-top dl dt{overflow:hidden;height:25px;line-height:25px;color:#b3b3b3;margin:0}
.clone-trxsw .trx-GARAN .trx-top dl dt a{font-weight:bold}
.clone-trxsw .trx-GARAN .trx-top dl dd{overflow:hidden;height:60px;line-height:20px;margin:0}
/* ---- [R49-2a2-4] 最近更新/最新上架(33yq.css #newscontent .l 695 2px #a6d3e8 #f7fbfd 圆角10
     L156 / .r 265 L26; h2 底 #88c6e5 30px L36; 行 s1 75 s2 185 s3 300 s4 #b3b3b3 70 右
     s5 #b3b3b3 右浮 L160-164; .r s1 50 s2 160 #b3b3b3 L30-33) ---- */
.clone-trxsw #trx-newscontent{margin:0 auto}
.clone-trxsw #trx-newscontent:after{content:'';display:block;clear:both}
.clone-trxsw #trx-newscontent .trx-nc-l{border:2px solid #a6d3e8;float:left;width:695px;max-width:100%;background:#f7fbfd;border-radius:10px;box-sizing:border-box}
.clone-trxsw #trx-newscontent .trx-nc-l ul{padding:10px;list-style:none;margin:0}
.clone-trxsw #trx-newscontent .trx-nc-l li{padding:5px 0 0 0;border-bottom:solid 1px #dddddd;height:25px;line-height:25px;overflow:hidden}
.clone-trxsw #trx-newscontent .trx-nc-l li span{float:left;display:inline-block}
.clone-trxsw #trx-newscontent .trx-nc-l li .s1{width:75px}
.clone-trxsw #trx-newscontent .trx-nc-l li .s2{width:185px}
.clone-trxsw #trx-newscontent .trx-nc-l li .s3{width:300px}
.clone-trxsw #trx-newscontent .trx-nc-l li .s4{width:70px;color:#b3b3b3;text-align:right}
.clone-trxsw #trx-newscontent .trx-nc-l li .s5{float:right;color:#b3b3b3;text-align:right}
.clone-trxsw #trx-newscontent .trx-nc-r{float:right;width:265px;max-width:100%;border:2px solid #a6d3e8;background:#f7fbfd;border-radius:10px;box-sizing:border-box}
.clone-trxsw #trx-newscontent .trx-nc-r ul{padding:10px;list-style:none;margin:0}
.clone-trxsw #trx-newscontent .trx-nc-r li{padding:5px 0 0 0;border-bottom:solid 1px #dddddd;height:25px;line-height:25px;overflow:hidden}
.clone-trxsw #trx-newscontent .trx-nc-r li span{float:left;display:inline-block}
.clone-trxsw #trx-newscontent .trx-nc-r li .s1{width:50px}
.clone-trxsw #trx-newscontent .trx-nc-r li .s2{color:#b3b3b3;overflow:hidden;width:160px}
.clone-trxsw #trx-newscontent .trx-nc-r li .s5{float:right;text-align:right}
.clone-trxsw #trx-newscontent h2{margin:0;overflow:hidden;padding:0 0 0 10px;background-color:#88c6e5;height:30px;line-height:30px;font-size:14px;font-weight:bold;border-bottom:solid 1px #dddddd}
/* ---- [R49-2a2-5] 分类/排行列表卡(33yq.css #alist L226-229 + #alistbox L230-243 逐条实测;
     #conn 平台结构间距同族 x33yq #xq-conn 形态) ---- */
.clone-trxsw #trx-conn{padding-top:10px}
.clone-trxsw .trx-alist{display:block;padding-bottom:10px}
.clone-trxsw .trx-alist-h3{margin:0;overflow:hidden;padding:0 10px;background-color:#88c6e5;height:40px;line-height:40px;font-size:20px;font-weight:bold;color:#333333;border-bottom:solid 1px #dddddd}
.clone-trxsw .trx-alist-body{padding:0 0 10px}
.clone-trxsw .trx-alist-body:after{content:'';display:block;clear:both}
/* [R49-2a2-5] 实测 #alistbox width 460 padding 5 → 内容盒 460(总 470); pic 125 + info 330 =
   455 ≤ 460 才能同行双列 —— Tailwind preflight 全局 border-box 压缩双列(R43-2v 实测踩坑),
   此处显式还原 content-box */
.clone-trxsw .trx-alistbox{float:left;width:460px;padding:5px;margin:5px 0 5px 5px;border-bottom:1px solid #dddddd;box-sizing:content-box}
.clone-trxsw .trx-alistbox .trx-pic{float:left;width:125px;padding:0;border:0;background:transparent;cursor:pointer;box-sizing:border-box}
.clone-trxsw .trx-alistbox .trx-pic>div{width:115px;height:160px;padding:5px;background-color:#eeeeee;box-sizing:content-box}
.clone-trxsw .trx-alistbox .trx-pic:hover>div{background-color:#5187c3}
.clone-trxsw .trx-alistbox .trx-info{float:left;width:330px;height:150px;box-sizing:border-box}
.clone-trxsw .trx-alistbox .trx-title{height:30px;line-height:30px;margin:0 10px;overflow:hidden;border-bottom:1px solid #eeeeee}
.clone-trxsw .trx-alistbox .trx-title span{float:right;font-weight:normal;text-align:right}
.clone-trxsw .trx-alistbox .trx-sys{height:20px;line-height:20px;margin:0 10px;color:#c42205;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.clone-trxsw .trx-alistbox .trx-sys a{color:#c42205}
.clone-trxsw .trx-alistbox .trx-intro-list{margin:5px 10px;height:80px;overflow:hidden;word-wrap:break-word}
.clone-trxsw .trx-alistbox .trx-yuedu{margin:0 20px;height:30px}
/* [R49-2a2-5] 灰底圆角钮(L243 实测 #f3f3f3); 源站 a 为默认 inline: 行盒 28px 收进 30px 容器
   不撑高(R43-2v 踩坑先例, 垂直 padding 仅绘制不参与布局 → 卡高不越界) */
.clone-trxsw .trx-alistbox .trx-yuedu a{line-height:28px;padding:5px 8px;border:0;border-radius:10px;background-color:#f3f3f3;margin:0 6px 0 0}
.clone-trxsw .trx-alistbox .trx-yuedu a:hover{text-decoration:underline}
/* ---- [R49-2a2-5] 分页(33yq.css .articlepage L255-259 实测: 灰底 #f9f9f9 40px, 页码 a #ccc 边
     3/10 内距, 当前页 strong #333 边 5/10; .trx-next/.trx-ngroup 无独立样式由通用 a 规则承载,
     选择器显式列入防审计漏项) ---- */
.clone-trxsw .trx-articlepage{border:1px solid #dddddd;background:#f9f9f9;height:40px;line-height:40px;margin:5px 0;padding:0 20px;overflow:hidden}
.clone-trxsw .trx-articlepage .trx-pagelink{text-align:left;padding:0;line-height:40px}
.clone-trxsw .trx-articlepage .trx-pagelink a,.clone-trxsw .trx-articlepage .trx-pagelink .trx-next,.clone-trxsw .trx-articlepage .trx-pagelink .trx-ngroup{display:inline-block;border:1px solid #cccccc;background:#f9f9f9;color:#333333;padding:3px 10px;margin:5px;line-height:22px}
.clone-trxsw .trx-articlepage .trx-pagelink a:hover{border:1px solid #333333;background:#f9f9f9;color:#333333;text-decoration:none}
.clone-trxsw .trx-articlepage .trx-pagelink strong{display:inline-block;border:1px solid #333333;background:#f9f9f9;color:#333333;padding:5px 10px;margin:5px;line-height:22px;font-weight:bold}
/* [R49-2a2-5] Toc 页动作盒(真站快照无 .pages → 平台功能性补充, 沿用同族 x33yq [R43-2v]
   校准形态: 蓝盒无圆角 #A6D3E8; 通用 .trx-pagelink 居中白钮) */
.clone-trxsw .trx-pages{width:964px;max-width:100%;border:2px solid #a6d3e8;padding:5px;margin:5px auto 0;box-sizing:border-box}
.clone-trxsw .trx-pages .trx-pagelink{text-align:center;padding:5px;line-height:29px}
.clone-trxsw .trx-pages .trx-pagelink a{display:inline-block;border:1px solid #e5e5e5;background:#fff;padding:5px;margin-left:2px}
.clone-trxsw .trx-pages .trx-pagelink a:hover{border:1px solid #88c6e5;background:#f4fbff;text-decoration:none}
/* ---- [R49-2a2-6] 书页(33yq.css L120 .box_con,.ui-box: 2px #88c6e5 圆角10(无宽度→块级随
     版心填充, 总宽 980 与源站一致); 面包屑系 x33yq 同族校准(真站 book.html 无面包屑 DOM,
     平台补充, 边色对齐书页盒 #c3dfea 系); .ui_bg6 687 L43; .box_intro .pic 130+5 边 #c3dfea
     L172; .box_info ml165 L50; .f21h simHei 30/32 L57; .intro 90px 缩进 L173; .option L52;
     .txtopt/.btopt 精灵图钮 L55-63 → 实底近似 #67b5e2 白字(x33yq 同族校准), span 不隐藏) ---- */
.clone-trxsw .trx-ui-box{overflow:hidden;margin:10px auto 0;border:2px solid #88c6e5;border-radius:10px;line-height:100%}
.clone-trxsw .trx-bread-crumb-nav{height:24px;line-height:24px;overflow:hidden;padding:4px 0;border:2px solid #c3dfea;background-color:#fef9ef;border-radius:10px}
.clone-trxsw .trx-bread-crumbs{list-style:none;margin:0;padding:0}
.clone-trxsw .trx-bread-crumbs li{float:left;font-size:14px;padding:0 10px 0 18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.clone-trxsw .trx-bread-crumbs li.trx-home{padding-left:13px}
.clone-trxsw .trx-bread-crumbs li a{margin:0 5px;color:#6f78a7}
.clone-trxsw .trx-bread-crumbs li em{font-style:normal}
.clone-trxsw .trx-detail-cols:after{content:'';display:block;clear:both}
.clone-trxsw .trx-bg6{zoom:1;float:left;padding:12px;width:687px;max-width:100%;box-sizing:border-box}
.clone-trxsw .trx-box-intro:after{content:'';display:block;clear:both}
.clone-trxsw .trx-box-intro .trx-pic{float:left;width:130px;padding:5px;border:1px solid #c3dfea;background:#ffffff;box-sizing:content-box;margin-top:8px;cursor:pointer}
.clone-trxsw .trx-box-intro .trx-box-info{margin-left:165px}
.clone-trxsw .trx-f21h{font-family:SimHei,'黑体',sans-serif;font-size:30px;line-height:32px;font-weight:normal;margin:6px 0}
.clone-trxsw .trx-f21h em{margin-left:10px;font-weight:normal;font-size:13px;font-style:normal}
.clone-trxsw .trx-intro{color:#666666;height:90px;line-height:22px;overflow-y:auto;text-indent:2em;font-size:14px;margin:4px 0}
.clone-trxsw .trx-ui-tb1{width:100%;font-size:14px;line-height:26px;border-collapse:collapse}
.clone-trxsw .trx-ui-tb1 td{padding:2px 8px 2px 0;vertical-align:top}
.clone-trxsw .trx-ui-tb1 b{font-weight:bold}
.clone-trxsw .trx-infotop{height:30px}
.clone-trxsw .trx-option{font-size:14px;color:#cccccc;height:40px;border-top:1px solid #c3dfea;margin-top:5px;overflow:hidden}
.clone-trxsw .trx-option a{color:#f60}
.clone-trxsw .trx-txtopt{float:right}
.clone-trxsw .trx-txtopt a{display:block;float:left;margin:6px 0 6px 10px;width:80px;height:27px;overflow:hidden;color:#6f78a7;text-align:center;line-height:27px}
/* btopt/txtopt 置于 .trx-option a 之后: 同特异性后者胜(白字钮不被 option #f60 覆盖) */
.clone-trxsw .trx-btopt{float:left;height:27px;margin:6px 0}
.clone-trxsw .trx-btopt a{display:block;float:left;margin:6px 0 6px 10px;width:80px;height:27px;overflow:hidden;text-align:center;line-height:27px;color:#fff;background-color:#67b5e2;border-radius:10px;font-size:14px;text-decoration:none}
.clone-trxsw .trx-btopt a:hover{background-color:#88c6e5;color:#fff;text-decoration:none}
/* ---- [R49-2a2-6] 最新章节播放列表(33yq.css .play-list-box 720 L64; .caption 25px 下界
     #c3dfea L65; h4 14px strong #6f78a7 L70-71; .txt 右浮 #e12160 L75-76; .play-list 400 限高
     700 L77; a 385×28 边 #c3dfea 底 #e1eced hover 白字 #88c6e5 L79-80) ---- */
.clone-trxsw .trx-play-list-box{width:720px;max-width:100%;overflow:hidden;padding:0 0 5px 0;box-sizing:border-box}
.clone-trxsw .trx-play-list-box .trx-caption{overflow:hidden;margin-top:11px;margin-right:15px;height:25px;border-bottom:1px solid #c3dfea}
.clone-trxsw .trx-play-list-box .trx-caption h4{float:left;overflow:hidden;margin:0;font-size:14px;line-height:25px}
.clone-trxsw .trx-play-list-box .trx-caption h4 strong{color:#6f78a7}
.clone-trxsw .trx-play-list-box .trx-txt{float:right;height:25px;line-height:25px;overflow:hidden;max-width:55%}
.clone-trxsw .trx-play-list-box .trx-txt a{color:#e12160}
.clone-trxsw .trx-play-list-box .trx-txt a:hover{color:#e12160;text-decoration:underline}
.clone-trxsw .trx-play-content{width:720px;max-width:100%}
.clone-trxsw .trx-play-content:after{content:'';display:block;clear:both}
/* a 为块内浮动: 外层 div(React key 包裹)高塌缩, 由同 BFC 浮动互斥排布(x33yq 同构已验证) */
.clone-trxsw .trx-play-list{width:400px;max-width:100%;max-height:700px;overflow:auto;overflow-x:hidden;clear:both;position:relative;float:left;margin:0;padding:0}
.clone-trxsw .trx-play-list a{width:385px;max-width:100%;height:28px;line-height:28px;overflow:hidden;display:block;color:#6f78a7;float:left;position:relative;margin:5px 5px 0 0;border:1px solid #c3dfea;background-color:#e1eced;padding-left:10px;box-sizing:border-box}
.clone-trxsw .trx-play-list a:hover{color:#fff;text-decoration:none;border-color:#88c6e5;background:#88c6e5}
/* ---- [R49-2a2-6] 书页右栏(33yq.css .wudu-bar 253 右浮 左界 #c3dfea L85; .ui-title1 55px
     下界 #c3dfea h2 16px 700 lh200% L89-90; .ui-ranking 213 pl15 L92; .ranking-list 行 32
     虚点下界 #c3dfea span #999 11px L95-96) ---- */
.clone-trxsw .trx-wudu-bar{width:253px;float:right;border-left:1px solid #c3dfea;background-color:#e9faff;box-sizing:border-box;min-height:200px}
.clone-trxsw .trx-ui-title1{height:55px;position:relative;border-bottom:1px solid #c3dfea;overflow:hidden}
.clone-trxsw .trx-ui-title1 h2{height:30px;padding:12px 0 0 15px;font-weight:bold;line-height:200%;font-size:16px;margin:0}
.clone-trxsw .trx-ui-title1 h2 em{margin-left:6px;font-weight:normal;font-size:11px;font-style:normal;color:#999999}
.clone-trxsw .trx-ui-ranking{width:213px;padding:0 15px;overflow:hidden;box-sizing:border-box}
.clone-trxsw .trx-ranking-list{padding:0 0 5px;list-style:none;margin:0}
.clone-trxsw .trx-ranking-list li{height:32px;line-height:32px;overflow:hidden;border-bottom:1px dotted #c3dfea}
.clone-trxsw .trx-ranking-list li span{float:right;color:#999999;font-size:11px}
/* ---- [R49-2a2-6] 「大神还喜欢」封面墙(33yq.css #comment .ui-title 40px 底 #e1eced 上距
     L100; #like-focus li 139×205 L107; .play-img 110×150 边白 hover #259e33 L111-112;
     .mask 黑 30% L114-115; .text 白字 L116) ---- */
.clone-trxsw #trx-comment{margin-top:14px}
.clone-trxsw #trx-comment .trx-ui-title{height:40px;line-height:40px;overflow:hidden;padding:0 19px;color:#666666;font-size:14px;border-bottom:1px solid #c3dfea;background-color:#e1eced;border-radius:10px}
.clone-trxsw #trx-comment .trx-ui-title h2{padding-top:1px;font-weight:bold;font-size:14px;margin:0}
.clone-trxsw #trx-like-focus{overflow:hidden;position:relative}
.clone-trxsw #trx-like-focus .trx-img-list{margin:0 10px;list-style:none;padding:0;overflow:hidden}
.clone-trxsw #trx-like-focus .trx-img-list li{width:139px;height:205px;float:left;overflow:hidden;box-sizing:border-box}
.clone-trxsw .trx-play-img{width:110px;height:150px;display:block;overflow:hidden;margin:10px auto 0;padding:3px;position:relative;border:1px solid #fff;background-color:#fff;box-sizing:border-box;cursor:pointer}
.clone-trxsw .trx-play-img:hover{border-color:#259e33;box-shadow:0 1px 1px rgba(0,0,0,0.07)}
.clone-trxsw .trx-mask{width:110px;height:20px;display:block;overflow:hidden;background-color:#000;position:absolute;left:3px;bottom:3px;opacity:.3;z-index:1}
.clone-trxsw .trx-text{width:100px;height:20px;line-height:20px;display:block;overflow:hidden;font-size:12px;position:absolute;left:3px;bottom:3px;padding:0 5px;text-align:center;z-index:2;color:#fff;white-space:nowrap}
.clone-trxsw .trx-play-a{margin-left:9px;display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#6f78a7}
/* ---- [R49-2a2-7] 目录页(33yq.css .box_con/.con_top L120-121 + #sidebar L123 +
     .sidebartitle/.sidebarlist L125-127 + #fmimg 150×200 #e1eced L128-129 + #info 210 h1 28px
     黑体 L130-133 + #intro 上虚线 L135 + #list dt #c3dfea/dd 33% 虚线界 L136-141 +
     .introtxt 680×50 L142) ---- */
.clone-trxsw .trx-box-con{border:2px solid #88c6e5;border-radius:10px;margin:10px auto 0;overflow:hidden;position:relative}
.clone-trxsw .trx-con-top{background:#e1eced;border-bottom:1px solid #88c6e5;height:40px;line-height:40px;padding:0 10px;font-size:16px;overflow:hidden}
.clone-trxsw #trx-sidebar{float:right;width:264px;box-sizing:border-box;border-left:1px dashed #88c6e5;text-align:left}
.clone-trxsw .trx-sidebartitle{font-weight:bold;font-size:11pt;line-height:150%;padding:2px 0 0 10px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.clone-trxsw .trx-sidebarlist{padding:0 0 0 20px;margin-bottom:5px;overflow:hidden;line-height:100%}
.clone-trxsw .trx-sidebarlist:after{content:'';display:block;clear:both}
.clone-trxsw .trx-sidebarlist a{float:left;width:49.5%;line-height:200%;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.clone-trxsw #trx-maininfo{float:left;width:700px;max-width:100%;max-height:470px;box-sizing:border-box;overflow:hidden}
/* [R49-2a2-12] 原写 #trx-fmimg(id 选择器)与组件 className="trx-fmimg"(Toc.tsx L62 button)失配致规则不生效 → 改类选择器对齐 */
.clone-trxsw .trx-fmimg{float:left;width:150px;padding:0;border:0;background:#e1eced;margin:12px;cursor:pointer;box-sizing:border-box}
.clone-trxsw .trx-fmimg>div{width:150px;height:200px}
.clone-trxsw #trx-info{padding:0 10px;margin:10px;font-size:15px;height:210px;max-height:210px;overflow:hidden}
.clone-trxsw #trx-info h1{font-size:28px;font-family:SimHei,'黑体',sans-serif;font-weight:bold;height:44px;line-height:44px;margin:0;padding:1px;overflow:hidden;color:#555555}
.clone-trxsw #trx-info p{height:25px;line-height:25px;padding-top:2px;float:left;width:500px;max-width:100%;margin:0;color:#555555;font-size:15px;overflow:hidden;box-sizing:border-box}
.clone-trxsw #trx-info p a{color:#6f78a7;margin-right:4px}
.clone-trxsw #trx-intro{margin:0;padding:10px;border-top:1px dashed #88c6e5;width:100%;line-height:180%;font-size:15px;overflow:hidden;box-sizing:border-box}
.clone-trxsw #trx-intro p{margin:0}
.clone-trxsw .trx-introtxt{width:680px;max-width:100%;color:#666666;height:50px;line-height:26px;overflow:hidden;text-overflow:ellipsis;padding-bottom:10px}
.clone-trxsw #trx-list{padding:2px}
.clone-trxsw #trx-list:after{content:'';display:block;clear:both}
.clone-trxsw #trx-list dl{margin:0}
.clone-trxsw #trx-list dt{background:#c3dfea;font-size:14px;line-height:28px;padding:5px 10px;margin:0 0 5px;width:98%;text-align:center;float:left;box-sizing:border-box}
.clone-trxsw #trx-list dd{float:left;width:33%;height:25px;line-height:200%;overflow:hidden;margin:0 0 5px;text-indent:10px;box-sizing:border-box;border-bottom:1px dashed #cccccc}
.clone-trxsw #trx-list dd a{color:#444444;font-size:15px}
.clone-trxsw #trx-list dd.trx-ch-active a{color:#e12160;font-weight:bold}
/* ---- [R49-2a2-8] 阅读页(read.css 实测: .content_read 980 L19; .toolbar 50px 灰底 #f7f7f7
     L198; ul.tools 白钮/色板 18×18 阴影激活对勾 #fe4e30/字号钮 #e3e3e3/恢复默认绿钮 #0d8f72
     L199-210; ul.links 右浮 #999 分隔 L194-197; .zhangjieming 25/35 黑体 虚线界 L23-24;
     .bottem/.bottem1 墨绿 #085308 L34-37; #content 95% 24px 字距 0.2em 行高 150% L178-193;
     .night 工具条 #444 链 #ddd L211-215) ---- */
.clone-trxsw .trx-content-read{width:980px;max-width:100%;margin:0 auto;box-sizing:border-box}
.clone-trxsw .trx-toolbar{position:relative;height:50px;border:1px solid #d8d8d8;background-color:#f7f7f7;overflow:hidden}
.clone-trxsw .trx-toolbar ul.trx-tools{list-style:none;margin:0;padding:0;position:absolute;top:9px;left:15px;height:30px;line-height:20px}
.clone-trxsw .trx-tools li{float:left;margin-right:10px;padding:0 5px;background-color:#ffffff;border:1px solid #d8d8d8;border-radius:3px;font-size:13px;color:#333333}
.clone-trxsw .trx-tools li p{float:left;margin:5px;line-height:20px}
.clone-trxsw .trx-tools #trx-fontsize{min-width:22px;text-align:center}
.clone-trxsw .trx-tools li.trx-theme .trx-swatch{float:left;display:block;width:18px;height:18px;line-height:18px;margin:6px;border-radius:2px;position:relative;background-color:#ffffff;border:0;box-shadow:0 0 2px 1px rgba(0,0,0,0.2);cursor:pointer;padding:0;font-family:inherit}
.clone-trxsw .trx-tools li.trx-theme .trx-swatch.on{box-shadow:0 0 4px 1px rgba(0,0,0,0.4)}
.clone-trxsw .trx-tools li.trx-theme .trx-swatch.on:after{content:'';position:absolute;top:3px;left:2px;width:12px;height:6px;border-left:2px solid #fe4e30;border-bottom:2px solid #fe4e30;transform:rotate(-45deg)}
.clone-trxsw .trx-tools li.trx-size .trx-size-btn{float:left;display:block;width:18px;height:18px;line-height:15px;margin:6px;border-radius:2px;background-color:#e3e3e3;color:#333333;font-size:15px;text-align:center;cursor:pointer;border:0;padding:0;font-family:inherit}
.clone-trxsw .trx-tools li.trx-size .trx-size-btn:hover{background-color:#eeeeee;color:#555555}
.clone-trxsw .trx-tools li.trx-reset{padding:5px 15px;background-color:#0d8f72;border-color:#0d8f72;color:#ffffff;cursor:pointer}
.clone-trxsw .trx-tools li.trx-reset:hover{background-color:#4aa994}
.clone-trxsw .trx-tools li.trx-reset .trx-reset-btn{display:block;border:0;background:transparent;color:#ffffff;font-size:13px;line-height:18px;cursor:pointer;padding:0;font-family:inherit}
.clone-trxsw .trx-toolbar .trx-links{position:absolute;top:15px;right:15px;line-height:20px;font-size:13px;color:#555555;text-align:right}
.clone-trxsw .trx-links p{display:inline;margin:0}
.clone-trxsw .trx-links p+p{margin-left:5px;padding-left:8px;border-left:1px solid #999999}
.clone-trxsw .trx-links i{font-style:normal}
.clone-trxsw .trx-zhangjieming{border-bottom:1px dashed #88c6e5;line-height:30px}
.clone-trxsw .trx-zhangjieming h1{font-family:SimHei,'黑体',sans-serif;font-size:25px;line-height:35px;text-align:center;padding:10px 0 0;margin:0;color:#333333}
/* 上下章链实测(read.css .bottem/.bottem1: 墨绿 #085308 纯文本链; 底部块 .bottem 上虚线界) */
.clone-trxsw .trx-bottem1{text-align:center;margin:5px;padding:4px 0;clear:both}
.clone-trxsw .trx-bottem1 a{font-size:14px;color:#085308;margin:0 10px}
.clone-trxsw .trx-bottem1 a:hover{text-decoration:underline}
.clone-trxsw .trx-bottem-b{border-top:1px dashed #88c6e5;margin:5px 15px;padding:10px;clear:both}
.clone-trxsw #trx-content{margin:25px auto;width:95%;word-wrap:break-word;line-height:150%;font-size:24px;letter-spacing:0.2em;color:#333333;overflow:hidden;min-height:320px}
.clone-trxsw #trx-content p{line-height:150%;margin:0 0 20px;text-align:left;text-indent:2em}
/* [R49-2a2-8] 夜间模式联动(read.css .night: 工具条 #444/链 #ddd; 正文墨色由组件内联
   style bg.ink 三层挂色, 7 色板真值见 Read.tsx BG_PRESETS) */
.clone-trxsw .trx-night .trx-toolbar{background-color:#444444;border-color:#444444}
.clone-trxsw .trx-night .trx-con-top{color:#dddddd}
.clone-trxsw .trx-night .trx-con-top a{color:#dddddd}
.clone-trxsw .trx-night .trx-bottem1 a{color:#dddddd}
.clone-trxsw .trx-night .trx-links a{color:#dddddd}
/* ---- [R49-2a2-9] 搜索/完本列表块(33yq.css .novelslistss li .s1-s5 列宽实测 L1-4; 容器级
     规则快照缺失 → 同族 x33yq style.css 校准值: 968 2px #c8d4e1 圆角10 / h2 底 #f6f8fe 30px) ---- */
.clone-trxsw .trx-novelslistss{margin:5px auto;border:2px solid #c8d4e1;width:968px;max-width:100%;padding:3px;overflow:hidden;border-radius:10px;box-sizing:border-box}
.clone-trxsw .trx-novelslistss h2{background-color:#f6f8fe;border-bottom:1px solid #dddddd;font-size:14px;font-weight:bold;height:30px;line-height:30px;overflow:hidden;padding:0 0 0 10px;margin:0}
.clone-trxsw .trx-novelslistss ul{padding:10px;list-style:none;margin:0}
.clone-trxsw .trx-novelslistss li{padding:5px 0 0 0;border-bottom:solid 1px #dddddd;height:25px;line-height:25px;overflow:hidden}
.clone-trxsw .trx-novelslistss li span{float:left;display:inline-block}
.clone-trxsw .trx-novelslistss li .s1{width:10%}
.clone-trxsw .trx-novelslistss li .s2,.clone-trxsw .trx-novelslistss li .s3{width:30%}
.clone-trxsw .trx-novelslistss li .s4{width:15%;color:#b3b3b3;text-align:right}
.clone-trxsw .trx-novelslistss li .s5{float:right;color:#b3b3b3;text-align:right}
/* ---- [R49-2a2-9] 相关词条(read.css .place L2-17: 958 28px #ffffcc 边 #c0d9cf;
     链接/词条 #004d00 margin 0 5) ---- */
.clone-trxsw .trx-place{width:958px;max-width:100%;padding:0 10px;height:28px;line-height:28px;margin:5px auto 0;border:1px solid #c0d9cf;font-size:14px;overflow:hidden;background:#ffffcc;box-sizing:border-box}
.clone-trxsw .trx-place a,.clone-trxsw .trx-place span{margin:0 5px;color:#004d00}
/* ---- [R49-2a2-9] 提示条(快照缺失 → 同族 x33yq common.css .MessageDiv 校准: lh140%
     margin 3px auto auto padding 3 居中 958px) ---- */
.clone-trxsw .trx-MessageDiv{line-height:140%;margin:3px auto auto;padding:3px;text-align:center;width:958px;max-width:100%;box-sizing:border-box;color:#555555}
/* ---- [R49-2a2-10] 页脚(33yq.css L168-169/L201-202 实测: .footer 980 居中无底色;
     .footer_cont mt10; p lh20 #302b35) [R46-2b-1 真站实抓版沿值, 模板槽渲染] ---- */
.clone-trxsw .trx-footer{margin:0 auto;overflow:hidden;max-width:980px;width:100%;text-align:center;box-sizing:border-box}
.clone-trxsw .trx-footer .trx-footer-cont{margin:10px auto auto;padding:0 10px}
.clone-trxsw .trx-footer .trx-footer-cont p{line-height:20px;color:#302b35;margin:0}
.clone-trxsw .trx-footer .trx-footer-cont a{color:#6f78a7}
.clone-trxsw .trx-footer .trx-footer-cont a:hover{text-decoration:underline}
/* ---- [R49-2a2-10] 封面直角守卫(BookCover 主题圆角覆盖; 源站封面直角+白衬边) ---- */
.clone-trxsw .trx-image>div,.clone-trxsw .trx-pic>div,.clone-trxsw .trx-fmimg>div,.clone-trxsw .trx-play-img>div{border-radius:0!important}
/* ================= [R49-2a2-11] 窄屏(375px 零横滚; 源站定宽 PC 模板无响应式 → 克隆纪律自适配) ================= */
@media (max-width: 980px){
  .clone-trxsw #trx-main,.clone-trxsw .trx-novelslist,.clone-trxsw .trx-GARAN,.clone-trxsw .trx-footer,.clone-trxsw .trx-pages,.clone-trxsw .trx-articlepage,.clone-trxsw .trx-place,.clone-trxsw .trx-content-read,.clone-trxsw .trx-MessageDiv,.clone-trxsw .trx-novelslistss,.clone-trxsw .trx-nav1{width:100%;box-sizing:border-box}
  .clone-trxsw .trx-nav1{height:auto;min-height:30px}
  .clone-trxsw #trx-newscontent .trx-nc-l{width:100%;float:none}
  .clone-trxsw #trx-newscontent .trx-nc-r{width:100%;float:none;margin-top:8px}
  .clone-trxsw #trx-newscontent .trx-nc-l li .s3{width:auto;max-width:38%}
  .clone-trxsw .trx-GARAN .trx-top{width:50%}
  .clone-trxsw .trx-bg6{width:100%;float:none}
  .clone-trxsw .trx-wudu-bar{width:100%;float:none;border-left:0;border-top:1px solid #c3dfea}
  .clone-trxsw #trx-like-focus .trx-img-list li{width:33.33%}
  .clone-trxsw #trx-sidebar{display:none}
  .clone-trxsw #trx-maininfo{width:100%;float:none;max-height:none;overflow:visible;padding:0 12px 12px}
  .clone-trxsw .trx-fmimg{float:none;margin:12px auto 0;display:block}
  .clone-trxsw #trx-info{height:auto;max-height:none}
  .clone-trxsw #trx-info p{width:100%;float:none}
  .clone-trxsw .trx-articlepage{height:auto;min-height:40px;line-height:34px;padding:2px 10px}
  .clone-trxsw .trx-toolbar{height:auto;overflow:visible;padding:6px 8px}
  .clone-trxsw .trx-toolbar ul.trx-tools{position:static}
  .clone-trxsw .trx-toolbar ul.trx-tools:after{content:'';display:block;clear:both}
  .clone-trxsw .trx-toolbar .trx-links{position:static;text-align:left;padding:4px 5px}
  .clone-trxsw .trx-play-list-box,.clone-trxsw .trx-play-content{width:100%}
  .clone-trxsw .trx-bottem1{width:auto}
}
@media (max-width: 640px){
  .clone-trxsw .trx-nav1 ul li a{padding:3px 5px;font-size:13px}
  .clone-trxsw #trx-hotcontent .trx-item{width:100%}
  .clone-trxsw .trx-GARAN .trx-top{width:100%}
  .clone-trxsw .trx-alistbox{width:100%;box-sizing:border-box;max-width:100%;margin-left:0}
  .clone-trxsw .trx-alistbox .trx-info{width:auto;max-width:calc(100% - 132px);height:auto}
  .clone-trxsw .trx-introtxt{height:auto;min-height:50px}
  .clone-trxsw #trx-like-focus .trx-img-list li{width:50%}
  .clone-trxsw #trx-list dd{width:50%}
  .clone-trxsw #trx-newscontent .trx-nc-l li .s3,.clone-trxsw #trx-newscontent .trx-nc-l li .s4{display:none}
  .clone-trxsw .trx-box-intro .trx-pic{float:none;margin:10px auto}
  .clone-trxsw .trx-box-intro .trx-box-info{margin-left:0}
  .clone-trxsw .trx-f21h{font-size:22px;line-height:30px}
  .clone-trxsw .trx-footer{padding-left:8px;padding-right:8px}
}
/* [R49-2a2-11] 页型根横向溢出兜底(x33yq/aijjxs 同款; .trx-cat 为页根专用名, 与列表元素无碰撞) */
.clone-trxsw .trx-home,.clone-trxsw .trx-cat,.clone-trxsw .trx-book,.clone-trxsw .trx-toc,.clone-trxsw .trx-read,.clone-trxsw .trx-search,.clone-trxsw .trx-ranking,.clone-trxsw .trx-full{overflow-x:hidden}
`,
}
