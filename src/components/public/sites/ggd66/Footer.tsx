// ============================================================
// [R41-A-6] ggd66(格格党) 克隆页脚 —— 源站快照 /tmp/r41-snap/ggd66.com.html 尾部实抓, 文案逐字节对齐:
//   ① <div class="content tuijian hidden-xs">友情链接：</div> —— 源站友链列表为空, 仅渲染标签行;
//      hidden-xs 语义 = 桌面端显示/移动端隐藏 → Tailwind `hidden sm:block`(R41 规格约定)。
//   ② <div class="footer"> 绿底 #56ccb5 白字居中 14px, 两行 p 同为 hidden-xs(移动端仅剩纯色带, 与真站一致)。
//   源站 CSS(/tmp/r41-css/ggd66.css): .footer{padding:10px 0;background-color:#56ccb5;
//   box-shadow:0 -1px 1px #56ccb5;color:#fff;text-align:center;font-size:14px} +
//   .footer p{width:90%;max-width:75pc=1200px}(@767→95% / @347→98% 三档, 见 index.ts 页脚段)。
//   [R41-A-7] 挂载方式: index.ts Footer 槽 → PublicSite CloneFooter 统一渲染(替换通用 SiteFooter),
//   各页型内嵌的旧 parts.tsx 页脚(GgdFooter 近似版)已同步摘除。
// ============================================================
'use client'

export function Ggd66Footer() {
  return (
    <>
      {/* 友链标签行(源站 .content.tuijian.hidden-xs, 空列表; 版心 90%/1200 见 index.ts CSS) */}
      <div className="ggd-ft-tuijian hidden sm:block">友情链接：</div>
      <footer className="ggd-footer">
        <p className="hidden sm:block">本站所有小说为转载作品，所有章节均由网友上传，转载至本站只是为了宣传本书让更多读者欣赏。</p>
        <p className="hidden sm:block">Copyright 2026 格格党(www.ggd66.com) All Rights Reserved.</p>
      </footer>
    </>
  )
}
