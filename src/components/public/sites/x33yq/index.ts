// ============================================================
// [R43-2] x33yq(33言情 www.x33yq.org) 8 页型克隆模板集 —— 第 12 前台主题
//   源站: 520xs/笔趣阁近亲模板(PC 定宽 980, 无响应式), 快照 /tmp/r43-snap/(www.x33yq.org 直连实抓):
//   home.html 64KB / sort1.html 56KB / top.html 68KB / book.html 15.6KB / toc.html 75.9KB /
//   read.html 11.6KB / history.html 4.3KB / common.css 7.5KB / style.css 26KB
//   页型覆盖: H首页 C分类 B书 T目录 R章节 Ran排行 Ful全本 Sea搜索 + Footer 槽(R41 范式, 页内零页脚)
//   CSS 纪律: 全部值取自 common.css/style.css 实测; 源站 sort/top/toc/read 四页另有 stylelist.css/
//   list.css/read.css 未在素材内 → 其规则以 common/style.css 实测同族值组合并已在近段注释声明;
//   规则全挂 .clone-x33yq 作用域; 375px 零横滚(980/974/968/958 等定宽 → max-width+width:100%+box-sizing)。
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { X33yqHome } from './Home'
import { X33yqCategory } from './Category'
import { X33yqBook } from './Book'
import { X33yqToc } from './Toc'
import { X33yqRead } from './Read'
import { X33yqSearch } from './Search'
import { X33yqRanking } from './Ranking'
import { X33yqFulltext } from './Fulltext'
import { X33yqFooter } from './Footer'

export const x33yqTemplate: SiteTemplateSet = {
  Home: X33yqHome,
  Category: X33yqCategory,
  Book: X33yqBook,
  Toc: X33yqToc,
  Read: X33yqRead,
  Ranking: X33yqRanking,
  Fulltext: X33yqFulltext,
  Search: X33yqSearch,
  // [R43-2] 源站 1:1 仿制页脚(PublicSite CloneFooter 渲染, 替换通用 SiteFooter)
  Footer: X33yqFooter,
  css: `
/* ---- 基线(common.css 实测: body 14px #555555 底 #E9FAFF; a #6F78A7; style.css L184 a:hover Red 下划线) ---- */
.clone-x33yq{font-size:14px;color:#555555;background-color:#E9FAFF}
.clone-x33yq a{color:#6F78A7;text-decoration:none}
.clone-x33yq a:hover{color:red;text-decoration:underline}
.clone-x33yq .xq-red{color:red}
.clone-x33yq .xq-clear{clear:both;height:0;overflow:hidden;font-size:0;line-height:0}
/* ---- 版心(style.css #main: width 980 margin auto padding 0 0 10px) ---- */
.clone-x33yq #xq-main{width:980px;max-width:100%;margin:0 auto;padding:0 0 10px;box-sizing:border-box}
/* ---- 顶部欢迎条(common.css .headds #E1ECED 35px 下边 #A6D3E8; .headds_con lh35 缩进16 宽980) ---- */
.clone-x33yq .xq-headds{background-color:#E1ECED;border-bottom:1px solid #A6D3E8;color:#808080;height:35px;width:100%}
.clone-x33yq .xq-headds-con{line-height:35px;margin:0 auto;text-indent:16px;width:980px;max-width:100%;box-sizing:border-box}
.clone-x33yq .xq-headds a{color:#808080}
/* ---- 头部(common.css .head 980×61; .head_logo 250×60 a 30px/38px red p 20px/22px red) ---- */
.clone-x33yq .xq-head{width:980px;max-width:100%;margin:0 auto;height:61px;box-sizing:border-box}
.clone-x33yq .xq-head-logo{float:left;padding:1px;display:block;overflow:hidden;width:250px;height:60px;text-align:center;box-sizing:border-box}
.clone-x33yq .xq-head-logo a{font-size:30px;line-height:38px;color:red;text-decoration:none;font-weight:bold}
.clone-x33yq .xq-head-logo p{font-size:20px;line-height:22px;color:red;margin:0;overflow:hidden}
/* 搜索(common.css #searchbar 430px ml20 mt20 左浮; .search 454×32 边 1px #18c2c8; .input-txt 324px
   lh31 pl30 #666 左/上边 #e6e6e6 底 #E9FAFF; .input-btn 98×32 右浮 — 精灵图钮 → 实测边色 #18c2c8 实底近似) */
.clone-x33yq #xq-searchbar{width:430px;max-width:100%;margin:20px auto auto 20px;float:left}
.clone-x33yq .xq-search{width:454px;max-width:100%;height:32px;overflow:hidden;border:1px solid #18c2c8;display:flex}
.clone-x33yq .xq-search .xq-input-txt{flex:1;height:31px;line-height:31px;border:0;padding:0 0 0 30px;color:#666;border-left:1px solid #e6e6e6;border-top:1px solid #e6e6e6;background-color:#E9FAFF;outline:none;font-size:14px;min-width:0}
.clone-x33yq .xq-search .xq-input-btn{width:98px;height:32px;flex:none;overflow:hidden;border:0;cursor:pointer;background-color:#18c2c8;color:#fff;font-size:14px;font-family:inherit}
/* 联系块(common.css .lianxiindex: 点线 #88C6E5 圆角10 220×50 字距2 行高20pt 右浮) */
.clone-x33yq .xq-lianxiindex{border:1px dotted #88C6E5;color:#6F78A7;float:right;border-radius:10px;height:50px;letter-spacing:2px;line-height:20pt;margin-right:5px;margin-top:3px;padding:5px 3px;text-align:center;width:220px;box-sizing:border-box;overflow:hidden}
.clone-x33yq .xq-lianxiindex b{color:#6F78A7;font-weight:bold}
/* ---- 主导航(common.css .daohang: #88c6e5 40px 圆角10; li ml8 lh40; a 15px 700 #FFF padding 0 15;
     hover #0099CC/#fff) ---- */
.clone-x33yq .xq-daohang{margin:10px auto 0;width:980px;max-width:100%;height:40px;overflow:hidden;background:#88c6e5;border-radius:10px}
.clone-x33yq .xq-daohang ul{list-style:none;margin:0;padding:0}
.clone-x33yq .xq-daohang ul:after{content:'';display:block;clear:both}
.clone-x33yq .xq-daohang ul li{float:left;line-height:40px;margin-left:8px;overflow:hidden}
.clone-x33yq .xq-daohang ul li a{padding:0 15px;color:#FFF;font-weight:bold;font-size:15px;overflow:hidden;text-decoration:none}
.clone-x33yq .xq-daohang ul li a:hover{color:#0099CC;background:#fff;padding-top:5px;padding-bottom:5px;text-decoration:none}
/* ---- 分类导航(common.css .nav1: #FFF9D9 30px 边 #FFCC33 圆角10; a 15px 700 #282828 padding5;
     hover #fff/#88C6E5) ---- */
.clone-x33yq .xq-nav1{margin:10px auto 0;width:978px;max-width:100%;height:30px;overflow:hidden;background:#FFF9D9;border:1px solid #FFCC33;border-radius:10px;box-sizing:border-box}
.clone-x33yq .xq-nav1 ul{list-style:none;margin:0;padding:0}
.clone-x33yq .xq-nav1 ul:after{content:'';display:block;clear:both}
.clone-x33yq .xq-nav1 ul li{float:left;line-height:30px;margin-left:8px;overflow:hidden}
.clone-x33yq .xq-nav1 ul li a{padding:5px;color:#282828;font-weight:bold;font-size:15px;overflow:hidden;text-decoration:none}
.clone-x33yq .xq-nav1 ul li a:hover{color:#fff;background:#88C6E5;padding-top:5px;padding-bottom:5px;text-decoration:none}
.clone-x33yq .xq-nav1 ul li.xq-on a{color:#fff;background:#88C6E5}
/* ---- 首页热点区(style.css #hotcontent pt10; .l 974 2px #C3DFEA #FEF9EF 圆角10; .item 310 左浮
     pl10 pt10; .image 图 120×150 边 1px #DDD; dl 170 右浮; dt 25 虚点下边 #A6D3E8; dd 120 缩进2em) ---- */
.clone-x33yq #xq-hotcontent{padding-top:10px}
.clone-x33yq #xq-hotcontent:after{content:'';display:block;clear:both}
.clone-x33yq #xq-hotcontent .xq-l{border:2px solid #C3DFEA;padding:0 0 10px;float:left;width:974px;max-width:100%;overflow:hidden;background:#FEF9EF;border-radius:10px;box-sizing:border-box}
.clone-x33yq #xq-hotcontent .xq-item{width:310px;float:left;padding:10px 0 0 10px;box-sizing:border-box}
.clone-x33yq #xq-hotcontent .xq-item .xq-image{float:left;width:122px;cursor:pointer;border:0;background:none;padding:0}
.clone-x33yq #xq-hotcontent .xq-item dl{padding:0 5px 0 0;float:right;width:170px;margin:0}
.clone-x33yq #xq-hotcontent .xq-item dl dt{height:25px;line-height:25px;overflow:hidden;font-size:14px;border-bottom:dotted 1px #A6D3E8;font-weight:bold;margin:0}
.clone-x33yq #xq-hotcontent .xq-item dl dt span{float:right;font-weight:normal;color:#B3B3B3}
.clone-x33yq #xq-hotcontent .xq-item dl dd{padding:7px 0 0 0;line-height:20px;text-indent:2em;height:120px;overflow:hidden;margin:0}
/* ---- 新书排行榜块(style.css .novelslist 968 2px #A6D3E8 #FEF9EF 圆角10; .GARAN 960; .top 315 左浮;
     .image 71 图 67×82; dl 219 右浮 dt25 dd60) ---- */
.clone-x33yq .xq-novelslist{margin:10px auto;border:2px solid #A6D3E8;width:968px;max-width:100%;padding:3px;background:#FEF9EF;border-radius:10px;box-sizing:border-box}
.clone-x33yq .xq-GARAN{padding:0 3px;float:left;width:960px;max-width:100%;overflow:hidden;box-sizing:border-box}
.clone-x33yq .xq-GARAN h2{border-bottom:solid 1px #A6D3E8;font-size:14px;font-weight:bold;padding-left:5px;line-height:25px;height:25px;overflow:hidden;margin:0}
.clone-x33yq .xq-GARAN .xq-top{width:315px;float:left;padding:0 0 6px 0;box-sizing:border-box}
.clone-x33yq .xq-GARAN .xq-top .xq-image{padding:10px 0 0 5px;float:left;width:71px;cursor:pointer;border:0;background:none}
.clone-x33yq .xq-GARAN .xq-top .xq-image>div{border:1px solid #DDDDDD;background-color:#fff}
.clone-x33yq .xq-GARAN .xq-top dl{padding:10px 0 0 0;float:right;width:219px;margin:0}
.clone-x33yq .xq-GARAN .xq-top dl dt{height:25px;line-height:25px;overflow:hidden;font-weight:bold;margin:0}
.clone-x33yq .xq-GARAN .xq-top dl dd{line-height:20px;height:60px;overflow:hidden;margin:0}
/* ---- 最近更新/最新上架(style.css #newscontent .l 695 2px #A6D3E8 #F7FBFD 圆角10 / .r 265 /
     h2 底 #88C6E5; 行 s1 75 s2 185 s3 300 s4 #B3B3B3 70 右 s5 #B3B3B3 右浮; .r s1 50 s2 160 #B3B3B3) ---- */
.clone-x33yq #xq-newscontent{margin:0 auto}
.clone-x33yq #xq-newscontent:after{content:'';display:block;clear:both}
.clone-x33yq #xq-newscontent .xq-nc-l{border:2px solid #A6D3E8;float:left;width:695px;max-width:100%;background:#F7FBFD;border-radius:10px;box-sizing:border-box}
.clone-x33yq #xq-newscontent .xq-nc-l ul{padding:10px;list-style:none;margin:0}
.clone-x33yq #xq-newscontent .xq-nc-l li{padding:5px 0 0 0;border-bottom:solid 1px #DDDDDD;height:25px;line-height:25px;overflow:hidden}
.clone-x33yq #xq-newscontent .xq-nc-l li span{float:left;display:inline-block}
.clone-x33yq #xq-newscontent .xq-nc-l li .s1{width:75px}
.clone-x33yq #xq-newscontent .xq-nc-l li .s2{width:185px}
.clone-x33yq #xq-newscontent .xq-nc-l li .s3{width:300px}
.clone-x33yq #xq-newscontent .xq-nc-l li .s4{color:#B3B3B3;width:70px;text-align:right}
.clone-x33yq #xq-newscontent .xq-nc-l li .s5{color:#B3B3B3;float:right;text-align:right}
.clone-x33yq #xq-newscontent .xq-nc-r{float:right;width:265px;max-width:100%;border:2px solid #A6D3E8;background:#F7FBFD;border-radius:10px;box-sizing:border-box}
.clone-x33yq #xq-newscontent .xq-nc-r ul{padding:10px;list-style:none;margin:0}
.clone-x33yq #xq-newscontent .xq-nc-r li{padding:5px 0 0 0;border-bottom:solid 1px #DDDDDD;height:25px;line-height:25px;overflow:hidden}
.clone-x33yq #xq-newscontent .xq-nc-r li span{float:left;display:inline-block}
.clone-x33yq #xq-newscontent .xq-nc-r li .s1{width:50px}
.clone-x33yq #xq-newscontent .xq-nc-r li .s2{color:#B3B3B3;overflow:hidden;width:160px}
.clone-x33yq #xq-newscontent .xq-nc-r li .s5{float:right;text-align:right}
.clone-x33yq #xq-newscontent h2{margin:0;overflow:hidden;padding:0 0 0 10px;background-color:#88C6E5;height:30px;line-height:30px;font-size:14px;font-weight:bold;border-bottom:solid 1px #DDDDDD}
/* ---- 列表页(sort1/top: #conn > #hotcontent > .l > #alist; 源站 stylelist.css 未在素材内 →
     h3 沿用 #newscontent h2 实测蓝条形态, alistbox 卡以实测值组合) ---- */
.clone-x33yq #xq-conn{padding-top:10px}
.clone-x33yq .xq-alist-h3{margin:0;overflow:hidden;padding:0 0 0 10px;background-color:#88C6E5;height:30px;line-height:30px;font-size:14px;font-weight:bold;border-bottom:solid 1px #DDDDDD}
.clone-x33yq .xq-alist-body{padding:10px}
.clone-x33yq .xq-alist-body:after{content:'';display:block;clear:both}
.clone-x33yq .xq-alistbox{float:left;width:50%;padding:10px;box-sizing:border-box;border-bottom:1px dashed #DDDDDD}
.clone-x33yq .xq-alistbox .xq-pic{float:left;width:117px;padding:1px;border:1px solid #DDDDDD;background-color:#fff;box-sizing:border-box;cursor:pointer}
.clone-x33yq .xq-alistbox .xq-info{margin-left:127px;min-height:160px}
.clone-x33yq .xq-alistbox .xq-title{height:25px;line-height:25px;overflow:hidden;font-weight:bold}
.clone-x33yq .xq-alistbox .xq-title span{float:right;font-weight:normal;color:#B3B3B3}
.clone-x33yq .xq-alistbox .xq-sys{line-height:22px;font-size:13px;color:#555555;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.clone-x33yq .xq-alistbox .xq-intro-list{color:#666666;line-height:22px;height:66px;overflow:hidden;text-indent:2em;font-size:13px}
.clone-x33yq .xq-alistbox .xq-yuedu{height:30px;padding-top:4px}
/* 章节块链(.play-list a 实测: 385×28 边 #C3DFEA 底 #E1ECED hover 白字 #88C6E5) */
.clone-x33yq .xq-alistbox .xq-yuedu a{display:inline-block;height:24px;line-height:22px;padding:0 10px;border:1px solid #C3DFEA;background-color:#E1ECED;color:#6F78A7;margin:0 6px 0 0}
.clone-x33yq .xq-alistbox .xq-yuedu a:hover{color:#fff;border-color:#88C6E5;background:#88C6E5;text-decoration:none}
/* ---- 分页(style.css .pages 964 2px #A6D3E8 圆角10; .pagelink 居中 a/em/strong 边 #e5e5e5 白底
     padding5; a:hover 边 #88C6E5 底 #F4FBFF) ---- */
.clone-x33yq .xq-pages{width:964px;max-width:100%;border:2px solid #A6D3E8;padding:5px;margin:5px auto 0;border-radius:10px;box-sizing:border-box}
.clone-x33yq .xq-pagelink{text-align:center;padding:5px;line-height:29px}
.clone-x33yq .xq-pagelink a,.clone-x33yq .xq-pagelink strong,.clone-x33yq .xq-pagelink em{font-style:normal;border:1px solid #e5e5e5;background:#FFF;padding:5px;margin-left:2px}
.clone-x33yq .xq-pagelink a:hover{border:1px solid #88C6E5;background:#F4FBFF}
/* ---- 书页(style.css .ui-box 2px #C3DFEA #E9FAFF 圆角10; .bread-crumb-nav 2px #C3DFEA #FEF9EF;
     .ui_bg6 687 左浮; .wudu-bar 253 右浮 左界 #C3DFEA 底 #E9FAFF; .box_info ml165; .f21h simHei 30px;
     .intro #666 lh22 缩进2em 高166; .option 上界 #C3DFEA; .txtopt a 80×27; 按钮实测 ui-button
     #67B5E2 圆角10 hover #88C6E5) ---- */
.clone-x33yq .xq-ui-box{margin-top:10px;border:2px solid #C3DFEA;background-color:#E9FAFF;border-radius:10px}
.clone-x33yq .xq-bread-crumb-nav{height:24px;line-height:24px;overflow:hidden;padding:4px 0;border:2px solid #C3DFEA;background-color:#FEF9EF;border-radius:10px}
.clone-x33yq .xq-bread-crumbs{list-style:none;margin:0;padding:0}
.clone-x33yq .xq-bread-crumbs li{float:left;font-size:14px;padding:0 10px 0 18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.clone-x33yq .xq-bread-crumbs li.xq-home{padding-left:13px}
.clone-x33yq .xq-bread-crumbs li a{margin:0 5px;color:#6F78A7}
.clone-x33yq .xq-bread-crumbs li em{font-style:normal}
.clone-x33yq .xq-detail-cols:after{content:'';display:block;clear:both}
.clone-x33yq .xq-bg6{zoom:1;float:left;padding:12px;width:687px;background:#E9FAFF;box-sizing:border-box}
.clone-x33yq .xq-box-intro:after{content:'';display:block;clear:both}
/* .pic 实测: 边 1px #C3DFEA 底 #E9FAFF; 源站盒宽 120 与 img 属性 130 冲突 → 收 132 含图(近似) */
.clone-x33yq .xq-box-intro .xq-pic{float:left;width:132px;padding:4px;border:1px solid #C3DFEA;background:#FFFFFF;box-sizing:border-box;margin-top:8px;cursor:pointer}
.clone-x33yq .xq-box-intro .xq-box-info{margin-left:165px}
.clone-x33yq .xq-f21h{font-family:SimHei;font-size:30px;line-height:32px;font-weight:normal;margin:6px 0}
.clone-x33yq .xq-f21h em{margin-left:10px;font-weight:normal;font-size:13px;font-style:normal}
.clone-x33yq .xq-intro{color:#666666;height:166px;line-height:22px;overflow-y:auto;text-indent:2em;font-size:14px;margin:4px 0}
.clone-x33yq .xq-ui-tb1{width:100%;font-size:14px;line-height:26px;border-collapse:collapse}
.clone-x33yq .xq-ui-tb1 td{padding:2px 8px 2px 0;vertical-align:top}
.clone-x33yq .xq-ui-tb1 b{font-weight:bold}
.clone-x33yq .xq-infotop{height:30px}
.clone-x33yq .xq-option{font-size:14px;color:#ccc;height:40px;border-top:1px solid #C3DFEA;margin-top:5px;overflow:hidden}
.clone-x33yq .xq-txtopt{float:right}
.clone-x33yq .xq-txtopt a{display:block;margin:6px 0;width:80px;height:27px;overflow:hidden;color:#6F78A7;text-align:center;float:left;line-height:27px;margin-left:10px}
.clone-x33yq .xq-btopt{float:left;height:27px;margin:6px 0}
.clone-x33yq .xq-btopt a{display:block;width:80px;height:27px;overflow:hidden;text-align:center;line-height:27px;color:#fff;background-color:#67B5E2;border-radius:10px;font-size:14px;text-decoration:none}
.clone-x33yq .xq-btopt a:hover{background-color:#88C6E5;text-decoration:none;color:#fff}
/* ---- 最新章节播放列表(style.css .play-list-box 720; .caption 45px 下界 #C3DFEA h4 #666 mt15
     strong #6F78A7; .txt #e12160 右浮; .play-list 400 高限700 滚动; a 385×28 边 #C3DFEA 底 #E1ECED
     hover 白字 #88C6E5) ---- */
.clone-x33yq .xq-play-list-box{width:720px;max-width:100%;overflow:hidden;padding:0 0 5px 0;box-sizing:border-box}
.clone-x33yq .xq-play-list-box .xq-caption{margin-right:15px;height:45px;overflow:hidden;border-bottom:1px solid #C3DFEA}
.clone-x33yq .xq-play-list-box .xq-caption h4{height:40px;float:left;overflow:hidden;margin:15px 0 0 0;color:#666;font-size:14px}
.clone-x33yq .xq-play-list-box .xq-caption h4 strong{color:#6F78A7}
.clone-x33yq .xq-play-list-box .xq-txt{height:22px;line-height:22px;overflow:hidden;margin-top:11px;float:right;padding-right:5px;max-width:55%}
.clone-x33yq .xq-play-list-box .xq-txt a{color:#e12160}
.clone-x33yq .xq-play-list-box .xq-txt a:hover{color:#e12160;text-decoration:underline}
.clone-x33yq .xq-play-content{width:720px;max-width:100%}
.clone-x33yq .xq-play-content:after{content:'';display:block;clear:both}
.clone-x33yq .xq-play-list{width:400px;max-width:100%;max-height:700px;overflow:auto;overflow-x:hidden;clear:both;position:relative;float:left;margin:0;padding:0}
.clone-x33yq .xq-play-list a{width:385px;max-width:100%;height:28px;line-height:28px;overflow:hidden;display:block;color:#6F78A7;float:left;position:relative;margin:5px 5px 0 0;border:1px solid #C3DFEA;background-color:#E1ECED;padding-left:10px;box-sizing:border-box}
.clone-x33yq .xq-play-list a:hover{color:#fff;text-decoration:none;border-color:#88C6E5;background:#88C6E5}
/* ---- 书页右栏(style.css .wudu-bar 253 右浮 左界 #C3DFEA; .ui-title1 55px 下界 #C3DFEA h2 16px
     700; .ui-ranking 213 pl15; .ranking-list 行 32 虚点下界 #C3DFEA span #999 11px) ---- */
.clone-x33yq .xq-wudu-bar{width:253px;float:right;border-left:1px solid #C3DFEA;background-color:#E9FAFF;box-sizing:border-box;min-height:200px}
.clone-x33yq .xq-ui-title1{height:55px;position:relative;border-bottom:1px solid #C3DFEA;overflow:hidden}
.clone-x33yq .xq-ui-title1 h2{height:30px;padding:12px 0 0 15px;font-weight:bold;line-height:150%;font-size:16px;margin:0}
.clone-x33yq .xq-ui-title1 h2 em{margin-left:6px;font-weight:normal;font-size:11px;font-style:normal;color:#999}
.clone-x33yq .xq-ui-ranking{width:213px;padding:0 15px;overflow:hidden;box-sizing:border-box}
.clone-x33yq .xq-ranking-list{padding:0 0 5px;list-style:none;margin:0}
.clone-x33yq .xq-ranking-list li{height:32px;line-height:32px;overflow:hidden;border-bottom:1px dotted #C3DFEA}
.clone-x33yq .xq-ranking-list li span{float:right;color:#999;font-size:11px}
/* ---- 「大神还喜欢」封面墙(style.css #comment .ui-title 40px 底 #E1ECED 上距 -4 圆角10;
     #like-focus li 139×205; .play-img 110×150 边白; .mask 黑 30%; .text 白字右下 12px) ---- */
.clone-x33yq #xq-comment{margin-top:14px}
.clone-x33yq #xq-comment .xq-ui-title{height:40px;line-height:40px;overflow:hidden;padding:0 19px;color:#666;font-size:14px;border-bottom:1px solid #C3DFEA;background-color:#E1ECED;border-radius:10px}
.clone-x33yq #xq-comment .xq-ui-title h2{padding-top:1px;font-weight:bold;font-size:14px;margin:0}
.clone-x33yq #xq-like-focus{overflow:hidden;position:relative}
.clone-x33yq #xq-like-focus .xq-img-list{margin:0 10px;list-style:none;padding:0;overflow:hidden}
.clone-x33yq #xq-like-focus .xq-img-list li{width:139px;height:205px;float:left;overflow:hidden;box-sizing:border-box}
.clone-x33yq .xq-play-img{width:110px;height:150px;display:block;overflow:hidden;margin:10px auto 0;padding:3px;position:relative;border:1px solid #fff;background-color:#fff;box-sizing:border-box;cursor:pointer}
.clone-x33yq .xq-mask{width:110px;height:20px;display:block;overflow:hidden;background-color:#000;position:absolute;left:3px;bottom:3px;opacity:.3;z-index:1}
.clone-x33yq .xq-text{width:100px;height:20px;line-height:20px;display:block;overflow:hidden;font-size:12px;position:absolute;left:3px;bottom:3px;padding:0 5px;text-align:right;z-index:2;color:#fff;white-space:nowrap}
.clone-x33yq .xq-play-a{margin-left:9px;display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#6F78A7}
/* ---- 目录页(toc: .box_con/.con_top 家族形态, 值取实测同族: 盒 974 2px #C3DFEA 白底圆角10;
     con_top #E1ECED 35px 下界 #A6D3E8; #sidebar 250 + #maininfo 右浮; #list dt 底 #C3DFEA 居中
     dd 三列 虚线下界 #DDD; 当前章 #e12160) ---- */
.clone-x33yq .xq-box-con{background:#fff;border:2px solid #C3DFEA;border-radius:10px;margin:10px auto 0;width:974px;max-width:100%;box-sizing:border-box;overflow:hidden}
.clone-x33yq .xq-box-con:after{content:'';display:block;clear:both}
.clone-x33yq .xq-con-top{background:#E1ECED;border-bottom:1px solid #A6D3E8;color:#808080;height:35px;line-height:35px;padding:0 10px;font-size:14px;overflow:hidden}
.clone-x33yq .xq-con-top a{color:#808080}
.clone-x33yq #xq-sidebar{float:left;width:250px;box-sizing:border-box;padding:10px}
.clone-x33yq .xq-sidebartitle{font-weight:bold;height:25px;line-height:25px;border-bottom:1px solid #A6D3E8;background:#F6F8FE;padding-left:5px;overflow:hidden}
.clone-x33yq .xq-sidebarlist{padding:8px 0 0;line-height:24px}
.clone-x33yq .xq-sidebarlist a{display:inline-block;margin-right:10px;font-size:13px;color:#6F78A7}
.clone-x33yq #xq-maininfo{float:right;width:706px;box-sizing:border-box;padding:0 12px 12px 0}
.clone-x33yq #xq-fmimg{float:left;width:120px;padding:4px;border:1px solid #C3DFEA;background:#FFFFFF;box-sizing:border-box;margin:10px 12px 0 0;cursor:pointer}
.clone-x33yq #xq-info h1{font-size:24px;line-height:32px;margin:6px 0;font-weight:bold}
.clone-x33yq #xq-info p{margin:4px 0;color:#555555;font-size:13px}
.clone-x33yq #xq-info p a{color:#6F78A7;margin-right:4px}
.clone-x33yq #xq-intro{margin:8px 0;padding:10px;border-top:1px dashed #C3DFEA;color:#666666;font-size:13px;line-height:22px;overflow:hidden}
.clone-x33yq #xq-intro p{margin:0}
.clone-x33yq .xq-introtxt{text-indent:2em}
.clone-x33yq #xq-list{padding:10px}
.clone-x33yq #xq-list:after{content:'';display:block;clear:both}
.clone-x33yq #xq-list dl{margin:0}
.clone-x33yq #xq-list dt{background:#C3DFEA;font-size:14px;font-weight:bold;line-height:28px;padding:5px 10px;margin:0 0 5px;text-align:center}
.clone-x33yq #xq-list dd{float:left;width:33.3%;height:30px;line-height:30px;overflow:hidden;margin:0;font-size:13px;padding-left:6px;box-sizing:border-box;border-bottom:1px dashed #DDDDDD}
.clone-x33yq #xq-list dd a{color:#6F78A7}
.clone-x33yq #xq-list dd.xq-ch-active a{color:#e12160;font-weight:bold}
/* ---- 阅读页(read.css 未在素材内 → 家族形态+实测值组合: 盒 974; 工具条 #FEF9EF 边 #C3DFEA
     圆角10; 正文默认 18px(源站 #fontsize 18)行高2; 章题居中 24px) ---- */
.clone-x33yq .xq-content-read{width:974px;max-width:100%;margin:10px auto 0;box-sizing:border-box}
.clone-x33yq .xq-toolbar{border:1px solid #C3DFEA;background:#FEF9EF;border-radius:10px;margin:0 0 8px;padding:6px 10px;overflow:hidden}
.clone-x33yq .xq-toolbar ul.xq-tools{list-style:none;margin:0;padding:0}
.clone-x33yq .xq-toolbar ul.xq-tools:after{content:'';display:block;clear:both}
.clone-x33yq .xq-tools li{float:left;margin-right:16px;line-height:24px;font-size:13px;color:#555555}
.clone-x33yq .xq-tools li p{display:inline;margin:0}
.clone-x33yq .xq-tools #xq-fontsize{display:inline-block;min-width:22px;text-align:center;font-weight:bold;color:#555555;margin:0}
.clone-x33yq .xq-tools .xq-swatch{display:inline-block;width:16px;height:16px;border:1px solid #DDDDDD;margin:0 3px;vertical-align:middle;cursor:pointer;padding:0}
.clone-x33yq .xq-tools .xq-size-btn{display:inline-block;width:20px;height:20px;line-height:18px;text-align:center;border:1px solid #C3DFEA;background-color:#E1ECED;color:#6F78A7;cursor:pointer;margin:0 4px;padding:0;font-family:inherit}
.clone-x33yq .xq-links{float:right;font-size:13px;color:#555555;line-height:24px;text-align:right}
.clone-x33yq .xq-links p{margin:0}
.clone-x33yq .xq-zhangjieming h1{font-size:24px;line-height:34px;text-align:center;margin:10px 0;color:#555555}
/* 翻页链(.play-list a 实测同款块链) */
.clone-x33yq .xq-bottem1{text-align:center;padding:4px 0}
.clone-x33yq .xq-bottem1 a{display:inline-block;height:24px;line-height:22px;padding:0 10px;border:1px solid #C3DFEA;background-color:#E1ECED;color:#6F78A7;margin:0 4px}
.clone-x33yq .xq-bottem1 a:hover{color:#fff;border-color:#88C6E5;background:#88C6E5;text-decoration:none}
.clone-x33yq #xq-content{padding:10px;font-size:18px;line-height:2;color:#555555;overflow:hidden;min-height:320px}
.clone-x33yq #xq-content p{margin:0 0 10px;text-indent:2em}
/* ---- 搜索/完本列表块(style.css .novelslistss: 968 2px #C8D4E1 圆角10; h2 底 #F6F8FE 下界 #DDD;
     行 s1 10% s2 30% s3 30% s4 #B3B3B3 15% 右 s5 #B3B3B3 右浮) ---- */
.clone-x33yq .xq-novelslistss{margin:5px auto;border:2px solid #C8D4E1;width:968px;max-width:100%;padding:3px;overflow:hidden;border-radius:10px;box-sizing:border-box}
.clone-x33yq .xq-novelslistss h2{background-color:#F6F8FE;border-bottom:1px solid #DDDDDD;font-size:14px;font-weight:bold;height:30px;line-height:30px;overflow:hidden;padding:0 0 0 10px;margin:0}
.clone-x33yq .xq-novelslistss ul{padding:10px;list-style:none;margin:0}
.clone-x33yq .xq-novelslistss li{padding:5px 0 0 0;border-bottom:solid 1px #DDDDDD;height:25px;line-height:25px;overflow:hidden}
.clone-x33yq .xq-novelslistss li span{float:left;display:inline-block}
.clone-x33yq .xq-novelslistss li .s1{width:10%}
.clone-x33yq .xq-novelslistss li .s2{width:30%}
.clone-x33yq .xq-novelslistss li .s3{width:30%}
.clone-x33yq .xq-novelslistss li .s4{color:#B3B3B3;width:15%;text-align:right}
.clone-x33yq .xq-novelslistss li .s5{color:#B3B3B3;float:right;text-align:right}
.clone-x33yq .xq-novelslistss li a{color:#6F78A7}
/* ---- 相关词条(common.css .place: 958 28px #FFFFCC 边 #c0d9cf 上边 0; .fr a/span #004d00 margin 0 5) ---- */
.clone-x33yq .xq-place{width:958px;max-width:100%;padding:0 10px;height:28px;line-height:28px;margin:5px auto 0;border:1px solid #c0d9cf;font-size:14px;overflow:hidden;background:#FFFFCC;box-sizing:border-box}
.clone-x33yq .xq-place a,.clone-x33yq .xq-place span{margin:0 5px;color:#004d00}
/* ---- 提示条(common.css .MessageDiv: lh140% margin 3px auto auto padding 3 居中 958px) ---- */
.clone-x33yq .xq-MessageDiv{line-height:140%;margin:3px auto auto;padding:3px;text-align:center;width:958px;max-width:100%;box-sizing:border-box;color:#555555}
/* ---- 页脚(style.css #firendlink 972 2px #A6D3E8 白底 圆角10 lh22; h2 底 #DAEDF5 30px 下界 #DDD;
     a ml5 hover #ff6600; .footer 980 居中; .footer_cont mt10; p lh20 #302B35) [R43-2 模板槽] ---- */
.clone-x33yq #xq-firendlink{width:972px;max-width:100%;padding:1px;border:solid 2px #A6D3E8;line-height:22px;overflow:hidden;background:#fff;border-radius:10px;margin:0 auto;box-sizing:border-box}
.clone-x33yq #xq-firendlink h2{margin:0;overflow:hidden;padding:0 0 0 10px;background-color:#DAEDF5;height:30px;line-height:30px;font-size:14px;font-weight:bold;border-bottom:solid 1px #DDDDDD}
.clone-x33yq #xq-firendlink a{margin-left:5px;color:#6F78A7}
.clone-x33yq #xq-firendlink a:hover{color:#ff6600;text-decoration:none}
.clone-x33yq .xq-footer{margin:0 auto;overflow:hidden;width:980px;max-width:100%;text-align:center}
.clone-x33yq .xq-footer .xq-footer-cont{margin:10px auto auto}
.clone-x33yq .xq-footer .xq-footer-cont p{line-height:20px;color:#302B35}
/* ---- 封面直角守卫(BookCover 主题圆角覆盖; 源站封面直角+1px #DDDDDD 边) ---- */
.clone-x33yq .xq-image>div,.clone-x33yq .xq-pic>div,.clone-x33yq .xq-fmimg>div,.clone-x33yq .xq-play-img>div{border-radius:0!important}
.clone-x33yq #xq-hotcontent .xq-item .xq-image>div{border:1px solid #DDDDDD;background-color:#fff}
/* ================= 移动端(375px 无横向滚动; 源站为定宽 PC 模板无响应式 → 克隆纪律自适配) ================= */
@media (max-width: 980px){
  .clone-x33yq #xq-main,.clone-x33yq .xq-headds-con,.clone-x33yq .xq-head,.clone-x33yq .xq-daohang,.clone-x33yq .xq-nav1,.clone-x33yq .xq-novelslist,.clone-x33yq .xq-GARAN,.clone-x33yq .xq-footer,.clone-x33yq .xq-pages,.clone-x33yq .xq-place,.clone-x33yq .xq-box-con,.clone-x33yq .xq-content-read,.clone-x33yq .xq-MessageDiv,.clone-x33yq .xq-novelslistss{width:100%;box-sizing:border-box}
  .clone-x33yq .xq-daohang,.clone-x33yq .xq-nav1{height:auto;min-height:40px}
  .clone-x33yq .xq-head{height:auto;overflow:hidden;padding:6px 8px}
  .clone-x33yq .xq-head-logo{float:left;width:auto;max-width:38%;height:auto}
  .clone-x33yq .xq-head-logo a{font-size:22px;line-height:28px}
  .clone-x33yq .xq-head-logo p{font-size:13px;line-height:16px}
  .clone-x33yq #xq-searchbar{width:calc(60% - 18px);margin:4px 0 0 10px}
  .clone-x33yq .xq-search{width:100%}
  .clone-x33yq .xq-lianxiindex{display:none}
  .clone-x33yq #xq-hotcontent .xq-l{float:none}
  .clone-x33yq #xq-newscontent .xq-nc-l{width:100%;float:none}
  .clone-x33yq #xq-newscontent .xq-nc-r{width:100%;float:none;margin-top:8px}
  .clone-x33yq #xq-newscontent .xq-nc-l li .s3{width:auto;max-width:38%}
  .clone-x33yq .xq-GARAN .xq-top{width:50%}
  .clone-x33yq .xq-bg6{width:100%;float:none}
  .clone-x33yq .xq-wudu-bar{width:100%;float:none;border-left:0;border-top:1px solid #C3DFEA}
  .clone-x33yq #xq-like-focus .xq-img-list li{width:33.33%}
  .clone-x33yq #xq-sidebar{display:none}
  .clone-x33yq #xq-maininfo{width:100%;float:none;padding:0 12px 12px}
  .clone-x33yq .xq-play-list-box,.clone-x33yq .xq-play-content{width:100%}
}
@media (max-width: 640px){
  .clone-x33yq .xq-daohang ul li a{padding:0 9px;font-size:13px}
  .clone-x33yq .xq-nav1 ul li a{padding:3px 5px;font-size:13px}
  .clone-x33yq #xq-hotcontent .xq-item{width:100%}
  .clone-x33yq .xq-GARAN .xq-top{width:100%}
  .clone-x33yq .xq-alistbox{width:100%}
  .clone-x33yq #xq-like-focus .xq-img-list li{width:50%}
  .clone-x33yq #xq-list dd{width:50%}
  .clone-x33yq #xq-newscontent .xq-nc-l li .s3,.clone-x33yq #xq-newscontent .xq-nc-l li .s4{display:none}
  .clone-x33yq .xq-box-intro .xq-pic{float:none;margin:10px auto}
  .clone-x33yq .xq-box-intro .xq-box-info{margin-left:0}
  .clone-x33yq .xq-f21h{font-size:22px;line-height:30px}
}
/* 页型根横向溢出兜底(ddyueshu 先例) */
.clone-x33yq .xq-home,.clone-x33yq .xq-cat,.clone-x33yq .xq-book,.clone-x33yq .xq-toc,.clone-x33yq .xq-read,.clone-x33yq .xq-search,.clone-x33yq .xq-ranking,.clone-x33yq .xq-full{overflow-x:hidden}
`,
}
