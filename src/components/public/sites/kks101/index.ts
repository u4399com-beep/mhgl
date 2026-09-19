// ============================================================
// [R39-2i] kks101(101看書 https://101kks.com) 8 页型克隆模板集
//   真站: 繁体现代风(主蓝 #1f6cb2), 快照 /tmp/r39-snap/kks101/(2026-09-18 cloak 实抓
//   home 40.9KB + style.css 60.2KB + iconfont + block_booklist.css + search 11.5KB)
//   页型覆盖: H首页 C分类 B书 T目录 R章节 + Ran(/novels/hot) Ful(/novels/full 实测) Sea(搜索实测)
// ============================================================
import type { SiteTemplateSet } from '../shared'
import { Kks101Home } from './Home'
import { Kks101Category, Kks101Search, Kks101Fulltext, Kks101Ranking } from './pages'
import { Kks101Book, Kks101Toc, Kks101Read } from './Book'

export const kks101Template: SiteTemplateSet = {
  Home: Kks101Home,
  Category: Kks101Category,
  Book: Kks101Book,
  Toc: Kks101Toc,
  Read: Kks101Read,
  Ranking: Kks101Ranking,
  Fulltext: Kks101Fulltext,
  Search: Kks101Search,
  css: `
/* ---- style.css 实测主色: #1f6cb2 蓝 / 边 #eee / 字 #333 #666 #818a91 ---- */
.clone-kks101 .kks-main{background:#f5f6f7;min-height:72vh;color:#333;font-size:14.5px}
.clone-kks101 .kks-container{max-width:1000px;margin:0 auto;padding:10px 12px 24px}
.clone-kks101 .kks-clear{clear:both;height:0;overflow:hidden}
/* 侧菜单(真站 .menu2: 固定左侧, 窄屏隐藏) */
.clone-kks101 .kks-menu2{display:none}
/* header(真站 .headbox: 白底 logo 左 + 搜索中 + menu1 右) */
.clone-kks101 .kks-header{background:#fff;border-bottom:1px solid #eee;position:sticky;top:0;z-index:20}
.clone-kks101 .kks-headbox{max-width:1000px;margin:0 auto;padding:8px 12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.clone-kks101 .kks-logo a{font-size:19px;font-weight:800;color:#1f6cb2;text-decoration:none}
/* [R40-c-2] 搜索表单类碰撞收口: 搜索结果页根 div.kks-search(pages.tsx) 与头部 form.kks-search 同名,
   旧规则把整页压成 32px 高的胶囊 → 表单规则收窄至 .kks-headbox 之内(与 R40-a-3 aijjxs 同范式) */
.clone-kks101 .kks-headbox .kks-search{display:flex;flex:1;max-width:340px;border:1px solid #1f6cb2;border-radius:16px;overflow:hidden;height:32px}
.clone-kks101 .kks-headbox .kks-search input{flex:1;border:none;outline:none;padding:0 12px;font-size:13px;color:#333;min-width:0}
.clone-kks101 .kks-headbox .kks-search button{border:none;width:46px;background:#1f6cb2;color:#fff;cursor:pointer;font-size:13px}
.clone-kks101 .kks-menu1 ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap}
.clone-kks101 .kks-menu1 ul li a{display:block;padding:6px 10px;color:#333;font-size:14px;text-decoration:none}
.clone-kks101 .kks-menu1 ul li a:hover{color:#1f6cb2}
/* 板块标题(真站 .mytitle: 底 1px rgba(150,150,150,.2) 16px) */
.clone-kks101 .kks-mytitle{margin:14px 0 10px;border-bottom:1px solid rgba(150,150,150,.2);padding-bottom:5px;font-size:16px;color:#333}
.clone-kks101 .kks-mytitle small{font-size:12px;color:#818a91;font-weight:400;margin-left:6px}
/* [R40-c-3] 真站 .mytitle2 实测: margin 23px 10px 10px(≤720 为 10px 全向) */
.clone-kks101 .kks-mytitle2{margin:23px 10px 10px}
/* 域名提示条(真站 .headerad: #fff2df 奶油底 40px 行高条, ≤720 30px/13px) [R40-c-4]
   与 kks-mybox 同元素双类, 复合选择器压过 mybox 白卡态 */
.clone-kks101 .kks-adbanner.kks-mybox{background:#fff2df;border:none;border-radius:0;height:40px;line-height:40px;padding:0;font-size:16px;color:#333;text-align:center}
/* mybox 白卡(真站 .mybox) */
.clone-kks101 .kks-mybox{background:#fff;border:1px solid #eee;border-radius:8px;padding:10px;margin-bottom:8px}
/* 书卡(真站 .bookbox: 封面左 90×120 + info) */
.clone-kks101 .kks-bookbox{padding:10px 2px;border-bottom:1px solid #f2f2f2}
.clone-kks101 .kks-bookbox:last-child{border-bottom:0}
.clone-kks101 .kks-bookimg{display:block;float:left;width:90px;position:relative}
.clone-kks101 .kks-bookimg img{width:90px;height:120px;object-fit:cover;border-radius:5px;display:block}
.clone-kks101 .kks-bookimg-lg img{width:110px;height:148px}
.clone-kks101 .kks-rank{position:absolute;left:-4px;top:-4px;width:20px;height:20px;border-radius:4px;color:#fff;font-size:12px;line-height:20px;text-align:center;background:#818a91}
.clone-kks101 .kks-rank-1{background:#ff5722}
.clone-kks101 .kks-rank-2{background:#ff9800}
.clone-kks101 .kks-rank-3{background:#ffc107}
.clone-kks101 .kks-bookinfo{margin-left:102px;min-width:0}
.clone-kks101 .kks-bookinfo h1{font-size:19px;margin:0 0 6px;color:#333}
.clone-kks101 .kks-bookinfo h3{font-size:15px;margin:0 0 4px;font-weight:600}
.clone-kks101 .kks-bookinfo h3 a{color:#333;text-decoration:none}
.clone-kks101 .kks-bookinfo h3 a:hover{color:#1f6cb2}
.clone-kks101 .kks-author{font-size:12.5px;color:#818a91;margin:2px 0}
.clone-kks101 .kks-intro{font-size:13px;color:#666;margin:4px 0;line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.clone-kks101 .kks-meta{font-size:12px;color:#818a91;margin:4px 0 0}
.clone-kks101 .kks-meta span{margin-right:10px}
/* 书单卡(真站 /css/block_booklist.css 实测: 紫渐变封面带 + 白衬三叠封 + 128px 卡) [R40-c-5] */
.clone-kks101 .kks-booklist-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:8px}
.clone-kks101 .kks-booklist-card{background:#fff;border:1px solid rgba(0,0,0,0.06);border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.08);overflow:hidden;height:128px;transition:all 0.3s cubic-bezier(0.4,0,0.2,1)}
.clone-kks101 .kks-booklist-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.12);border-color:rgba(0,0,0,0.1)}
.clone-kks101 .kks-booklist-card-link{display:block;text-decoration:none;color:inherit;height:100%}
.clone-kks101 .kks-booklist-card-content{display:flex;height:100%}
.clone-kks101 .kks-cover-section{flex:0 0 120px;position:relative;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}
.clone-kks101 .kks-cover-stack{position:relative;width:90px;height:110px;display:flex;align-items:center;justify-content:center}
.clone-kks101 .kks-cover-main{position:relative;z-index:3;width:50px;height:70px;background:rgba(255,255,255,0.9);border-radius:3px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.15);overflow:hidden}
.clone-kks101 .kks-cover-main > div{border-radius:0 !important}
.clone-kks101 .kks-cover-main img{width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block}
.clone-kks101 .kks-cover-stack::before{content:'';position:absolute;top:8px;left:50%;z-index:2;width:44px;height:58px;background:rgba(255,255,255,0.7);border-radius:2px;transform:rotate(-3deg)}
.clone-kks101 .kks-cover-stack::after{content:'';position:absolute;top:14px;left:75%;z-index:1;width:38px;height:52px;background:rgba(255,255,255,0.5);border-radius:2px;transform:rotate(5deg)}
.clone-kks101 .kks-info-section{flex:1;padding:12px 16px;display:flex;flex-direction:column;justify-content:space-between;min-width:0}
.clone-kks101 .kks-booklist-title{margin:0 0 8px;font-size:14px;font-weight:600;color:#2c3e50;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.clone-kks101 .kks-booklist-meta{display:flex;align-items:center;gap:12px;margin-bottom:8px;font-size:12px;color:#7f8c8d}
.clone-kks101 .kks-meta-item{display:flex;align-items:center;gap:3px}
.clone-kks101 .kks-booklist-desc{font-size:11px;color:#7f8c8d;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;flex:1}
.clone-kks101 .kks-booklist-desc p{margin:0}
@media (max-width: 991px){
  .clone-kks101 .kks-booklist-grid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
  .clone-kks101 .kks-booklist-card{height:110px}
  .clone-kks101 .kks-cover-section{flex:0 0 100px}
  .clone-kks101 .kks-cover-stack{width:80px;height:100px}
  .clone-kks101 .kks-cover-main{width:45px;height:65px}
  .clone-kks101 .kks-cover-stack::before{width:39px;height:52px;top:7px;left:45%}
  .clone-kks101 .kks-cover-stack::after{width:34px;height:45px;top:12px;left:75%}
  .clone-kks101 .kks-info-section{padding:10px 14px}
  .clone-kks101 .kks-booklist-title{font-size:13px}
  .clone-kks101 .kks-booklist-meta{gap:10px;font-size:11px}
}
@media (max-width: 480px){
  .clone-kks101 .kks-booklist-grid{grid-template-columns:1fr;gap:10px}
  .clone-kks101 .kks-booklist-card{height:100px}
  .clone-kks101 .kks-cover-section{flex:0 0 90px}
  .clone-kks101 .kks-cover-stack{width:70px;height:90px}
  .clone-kks101 .kks-cover-main{width:40px;height:55px}
  .clone-kks101 .kks-cover-stack::before{width:34px;height:46px;top:6px;left:40%}
  .clone-kks101 .kks-cover-stack::after{width:30px;height:40px;top:10px;left:70%}
  .clone-kks101 .kks-info-section{padding:6px 10px}
  .clone-kks101 .kks-booklist-title{font-size:12px}
  .clone-kks101 .kks-booklist-meta{flex-wrap:wrap;gap:4px 6px;font-size:9px}
  .clone-kks101 .kks-meta-item{gap:2px}
}
@media (max-width: 360px){
  .clone-kks101 .kks-booklist-card{height:90px}
  .clone-kks101 .kks-cover-section{flex:0 0 80px}
  .clone-kks101 .kks-cover-stack{width:65px;height:80px}
  .clone-kks101 .kks-cover-main{width:38px;height:52px}
  .clone-kks101 .kks-cover-stack::before{width:31px;height:42px;top:5px;left:35%}
  .clone-kks101 .kks-cover-stack::after{width:28px;height:38px;top:8px;left:65%}
  .clone-kks101 .kks-info-section{padding:6px 10px}
  .clone-kks101 .kks-booklist-title{font-size:11px}
  .clone-kks101 .kks-booklist-meta{flex-wrap:wrap;gap:4px 6px;font-size:9px}
}
/* 标签云(真站 .tag ul: justify; .tag ul a: 浅蓝底 rgb(232,244,255) 边 #56a6c3 胶囊) [R40-c-6] */
.clone-kks101 .kks-tag ul{list-style:none;margin:0;padding:0;text-align:justify}
.clone-kks101 .kks-tag ul a{display:inline-block;background:rgb(232,244,255);border:1px solid #56a6c3;color:#1f6cb2;border-radius:10px;padding:0 0.725rem;margin:0.5rem;font-size:0.8rem;line-height:1.8rem;text-align:center;text-decoration:none}
/* 状态文本(熱門標籤載入占位, [R40-c-1] 配套) */
.clone-kks101 .kks-meta-empty{font-size:13px;color:#818a91}
/* 按钮/分页 */
.clone-kks101 .kks-btn-primary{border:none;border-radius:16px;background:#1f6cb2;color:#fff;padding:7px 20px;font-size:14px;cursor:pointer;margin-right:8px}
.clone-kks101 .kks-btn-primary:hover:not([disabled]){background:#185a97}
.clone-kks101 .kks-btn-primary[disabled]{opacity:.5;cursor:not-allowed}
.clone-kks101 .kks-btn{border:1px solid #ddd;border-radius:16px;background:#fff;color:#666;padding:7px 20px;font-size:14px;cursor:pointer}
.clone-kks101 .kks-btn:hover:not([disabled]){border-color:#1f6cb2;color:#1f6cb2}
.clone-kks101 .kks-btn[disabled]{opacity:.45;cursor:not-allowed}
.clone-kks101 .kks-pager{text-align:center;padding:14px 0}
.clone-kks101 .kks-pager span{margin:0 10px;color:#818a91;font-size:13px}
.clone-kks101 .kks-tabs{margin-bottom:10px}
.clone-kks101 .kks-tabs button{border:1px solid #ddd;background:#fff;border-radius:14px;padding:3px 14px;margin-right:8px;cursor:pointer;color:#666;font-size:13px}
.clone-kks101 .kks-tabs button.is-active{background:#1f6cb2;border-color:#1f6cb2;color:#fff}
/* 章节格(真站目录格) */
.clone-kks101 .kks-chgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:2px 12px;background:#fff;border:1px solid #eee;border-radius:8px;padding:10px}
.clone-kks101 .kks-chgrid a{font-size:13px;color:#333;padding:6px 8px;border-radius:4px;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clone-kks101 .kks-chgrid a:hover{background:#eaf2fb;color:#1f6cb2}
.clone-kks101 .kks-chgrid a.is-active{color:#1f6cb2;font-weight:700}
/* 书页简介 */
.clone-kks101 .kks-bookintro{font-size:13.5px;color:#666;line-height:1.9}
.clone-kks101 .kks-btns{margin-top:10px}
/* 阅读页(真站 .read: 白底) */
.clone-kks101 .kks-text-set{background:#fff;border:1px solid #eee;border-radius:8px;padding:8px 12px;font-size:13px;color:#666;margin-bottom:10px}
.clone-kks101 .kks-text-set b{font-weight:400;color:#818a91;margin:0 4px}
.clone-kks101 .kks-text-set a{border:1px solid #ddd;border-radius:3px;padding:1px 8px;margin:0 2px;color:#666;text-decoration:none}
.clone-kks101 .kks-text-set a:hover{border-color:#1f6cb2;color:#1f6cb2;text-decoration:none}
.clone-kks101 .kks-text-set a.is-active{background:#1f6cb2;border-color:#1f6cb2;color:#fff}
.clone-kks101 .kks-read-title{margin:14px 0 4px;font-size:19px;color:#333;text-align:center}
.clone-kks101 .kks-read-info{text-align:center;font-size:12.5px;color:#818a91;margin-bottom:10px}
.clone-kks101 .kks-readcontent{background:#fff;border:1px solid #eee;border-radius:8px;padding:14px;color:#333;min-height:320px}
.clone-kks101 .kks-readcontent p{margin:0 0 1.1em;text-indent:2em}
/* 页脚(真站 .foot: 白底居中链接行) */
.clone-kks101 .kks-foot{background:#fff;border-top:1px solid #eee;margin-top:16px;padding:14px 12px 20px;text-align:center;font-size:13px;color:#818a91}
.clone-kks101 .kks-copyright a{color:#1f6cb2;text-decoration:none;margin:0 6px}
.clone-kks101 .kks-copyright p{margin:8px 0}

/* ================= 移动端(375px 无横向滚动) ================= */
@media (max-width: 860px){
  .clone-kks101 .kks-menu2{display:block;position:static;background:#fff;border-bottom:1px solid #eee}
  .clone-kks101 .kks-menu2 ul{list-style:none;margin:0;padding:6px 10px;display:flex;flex-wrap:wrap;gap:4px}
  .clone-kks101 .kks-menu2 ul li a{padding:4px 10px;font-size:13px;color:#333;text-decoration:none}
  .clone-kks101 .kks-chgrid{grid-template-columns:1fr 1fr}
  .clone-kks101 .kks-menu1{display:none}
}
@media (max-width: 480px){
  .clone-kks101 .kks-chgrid{grid-template-columns:1fr}
  .clone-kks101 .kks-headbox .kks-search{max-width:100%}
}

/* ================= 页级类补齐(R40-c 类审计: 真站值实测) ================= */
/* 真站目录页 .catalog: 3 列 + 15px 行 + rgba 底线(≤990 单列) [R40-c-7] */
.clone-kks101 .kks-toc .kks-chgrid{grid-template-columns:repeat(3,1fr);gap:0}
.clone-kks101 .kks-toc .kks-chgrid a{display:block;font-size:16px;color:#222;padding:15px 0;border-bottom:1px solid rgba(150,150,150,0.2);border-radius:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clone-kks101 .kks-toc .kks-chgrid a:hover{background:none;color:#06c}
.clone-kks101 .kks-toc .kks-chgrid a.is-active{color:#1f6cb2;font-weight:700}
@media (max-width: 990px){
  .clone-kks101 .kks-toc .kks-chgrid{grid-template-columns:1fr}
}
/* 书页头部(真站 .bookbox/.bookimg2/.booknav2: 180×240 硬阴影封面 + calc(100%-200px) 文本列 30px 缩进,
   h1 24px/1.3, p 15px #757575; ≤990 封面 130×180; 卡壳取 .mybox 实测组合, 书页 HTML 未快照属近似) [R40-c-8] */
.clone-kks101 .kks-bookhead{background:#fff;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,0.12),0 1px 2px rgba(0,0,0,0.24);padding:16px;margin:24px 0}
.clone-kks101 .kks-bookhead .kks-bookimg{width:180px}
.clone-kks101 .kks-bookhead .kks-bookimg > div{border-radius:0 !important}
.clone-kks101 .kks-bookhead .kks-bookimg img{width:180px;height:240px;border-radius:0;box-shadow:0 1px 3px rgba(0,0,0,0.3)}
.clone-kks101 .kks-bookhead .kks-bookinfo{margin-left:0;float:left;width:calc(100% - 200px);padding-left:30px;box-sizing:border-box}
.clone-kks101 .kks-bookhead .kks-bookinfo h1{font-size:24px;line-height:1.3;margin:0 0 10px}
.clone-kks101 .kks-bookhead .kks-bookinfo p{font-size:15px;color:#757575;padding:5px 0}
.clone-kks101 .kks-bookhead .kks-btns{padding-top:10px}
@media (max-width: 990px){
  .clone-kks101 .kks-bookhead{padding:10px}
  .clone-kks101 .kks-bookhead .kks-bookimg{width:130px}
  .clone-kks101 .kks-bookhead .kks-bookimg img{width:130px;height:180px}
  .clone-kks101 .kks-bookhead .kks-bookinfo{width:calc(100% - 130px);padding-left:10px}
}
/* 阅读页(真站 .txtnav h1 20px / .txtinfo 14px / .txtnav p 缩进 5%) [R40-c-9] */
.clone-kks101 .kks-read .kks-read-title{font-size:20px}
.clone-kks101 .kks-read .kks-read-info{font-size:14px;padding-bottom:15px}
.clone-kks101 .kks-read .kks-readcontent p{text-indent:5%}
/* 排行页(真站 .tabs: 底线 tab 16px 激活 #1f6cb2 2px 下划线; .ranking 前 3 徽章 red/rgb(255,111,0)/rgb(222,204,1)) [R40-c-10] */
.clone-kks101 .kks-ranking .kks-tabs{display:flex;border-bottom:1px solid #eee}
.clone-kks101 .kks-ranking .kks-tabs button{flex:1;border:none;background:none;border-radius:0;margin:0;padding:4px 4px 8px;font-size:16px;color:#333;cursor:pointer;border-bottom:2px solid transparent}
.clone-kks101 .kks-ranking .kks-tabs button.is-active{background:none;border-radius:8px 8px 0 0;border-bottom-color:#1f6cb2;color:#1f6cb2}
.clone-kks101 .kks-ranking .kks-rank-1{background:#ff0000}
.clone-kks101 .kks-ranking .kks-rank-2{background:#ff6f00}
.clone-kks101 .kks-ranking .kks-rank-3{background:#decc01}
/* 真站 .mytitle2 ≤720: 10px 全向 */
@media (max-width: 720px){
  .clone-kks101 .kks-mytitle2{margin:10px}
  .clone-kks101 .kks-adbanner.kks-mybox{height:30px;line-height:30px;font-size:13px}
}
/* 375px 无横滚兜底 */
.clone-kks101 .kks-container{overflow-x:hidden}
`,
}
