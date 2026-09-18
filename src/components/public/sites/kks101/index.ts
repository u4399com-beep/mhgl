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
.clone-kks101 .kks-search{display:flex;flex:1;max-width:340px;border:1px solid #1f6cb2;border-radius:16px;overflow:hidden;height:32px}
.clone-kks101 .kks-search input{flex:1;border:none;outline:none;padding:0 12px;font-size:13px;color:#333;min-width:0}
.clone-kks101 .kks-search button{border:none;width:46px;background:#1f6cb2;color:#fff;cursor:pointer;font-size:13px}
.clone-kks101 .kks-menu1 ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap}
.clone-kks101 .kks-menu1 ul li a{display:block;padding:6px 10px;color:#333;font-size:14px;text-decoration:none}
.clone-kks101 .kks-menu1 ul li a:hover{color:#1f6cb2}
/* 板块标题(真站 .mytitle: 底 1px rgba(150,150,150,.2) 16px) */
.clone-kks101 .kks-mytitle{margin:14px 0 10px;border-bottom:1px solid rgba(150,150,150,.2);padding-bottom:5px;font-size:16px;color:#333}
.clone-kks101 .kks-mytitle small{font-size:12px;color:#818a91;font-weight:400;margin-left:6px}
/* 域名提示条(真站 .adbanner) */
.clone-kks101 .kks-adbanner{background:#fff;border:1px dashed #1f6cb2;color:#1f6cb2;text-align:center;padding:8px;border-radius:6px;margin-bottom:10px;font-size:13px}
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
/* 书单卡(真站 .booklist-card: cover-stack 叠封 + meta) */
.clone-kks101 .kks-booklist-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px;margin-bottom:8px}
.clone-kks101 .kks-booklist-card{background:#fff;border:1px solid #eee;border-radius:8px;overflow:hidden}
.clone-kks101 .kks-booklist-card-link{display:block;text-decoration:none;color:inherit}
.clone-kks101 .kks-booklist-card-content{display:flex;gap:12px;padding:12px}
.clone-kks101 .kks-cover-section{width:64px;flex-shrink:0}
.clone-kks101 .kks-cover-stack{position:relative;width:56px;height:76px}
.clone-kks101 .kks-cover-main img{width:56px;height:76px;object-fit:cover;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,.18);position:relative;z-index:2}
.clone-kks101 .kks-cover-stack::before,.clone-kks101 .kks-cover-stack::after{content:'';position:absolute;background:#dfe6ee;border-radius:4px}
.clone-kks101 .kks-cover-stack::before{left:4px;top:4px;right:-4px;bottom:-2px;z-index:1}
.clone-kks101 .kks-cover-stack::after{left:8px;top:8px;right:-8px;bottom:-4px;z-index:0}
.clone-kks101 .kks-info-section{min-width:0;flex:1}
.clone-kks101 .kks-booklist-title{margin:0 0 5px;font-size:14.5px;color:#333;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clone-kks101 .kks-booklist-meta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px}
.clone-kks101 .kks-meta-item{font-size:12px;color:#818a91}
.clone-kks101 .kks-booklist-desc p{margin:0;font-size:12.5px;color:#666;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
/* 标签云(真站 .tag ul a: 胶囊) */
.clone-kks101 .kks-tag ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.clone-kks101 .kks-tag ul a{display:inline-block;background:#fff;border:1px solid #eee;color:#666;border-radius:14px;padding:3px 12px;font-size:13px;text-decoration:none}
.clone-kks101 .kks-tag ul a:hover{border-color:#1f6cb2;color:#1f6cb2}
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
  .clone-kks101 .kks-booklist-grid{grid-template-columns:1fr}
  .clone-kks101 .kks-chgrid{grid-template-columns:1fr 1fr}
  .clone-kks101 .kks-menu1{display:none}
}
@media (max-width: 480px){
  .clone-kks101 .kks-chgrid{grid-template-columns:1fr}
  .clone-kks101 .kks-search{max-width:100%}
}
.clone-kks101 .kks-container{overflow-x:hidden}
`,
}
