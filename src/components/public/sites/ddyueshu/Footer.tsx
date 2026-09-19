// ============================================================
// [R41-A-4] ddyueshu 克隆页脚 —— 源站快照 /tmp/r41-snap/ddyueshu.cc.html 尾部实抓 + /images/bqg.js
//   footer() document.writeln 实抓(.footer_cont 三行文案逐字节对齐):
//   ① #firendlink 友链条(源站 3 条真实外链: wap 顶点小说 / app 顶点小说APP / 主站 顶点小说app官网下载;
//   [R41-主-1] 文案以 GBK 解码实抓快照为准: 「友情连接：顶点小说/顶点小说APP/顶点小说app官网下载 (邮箱见顶端)」——
//   规格初稿的「手机小说/每日阅读APP」系未解码误读, 已切回实抓版)
//   ② .footer 版权块(内含空友链列表占位 .footer_link = 2px #88C6E5 蓝色横线 + .footer_cont 三行版权)
//   真外链走 safeHref 白名单(渲染出口伪协议兜底) + target="_blank" rel="noopener noreferrer"。
//   源站 CSS(/tmp/r41-css/ddyueshu.css): #firendlink 949px / .footer 980px 定宽 → max-width+width:100%
//   无横滚适配; 细节见 index.ts 页脚段(逐条注明源站出处)。
//   [R41-A-5] 挂载方式: index.ts Footer 槽 → PublicSite CloneFooter 统一渲染(替换通用 SiteFooter),
//   各页型内嵌的旧 parts.tsx 页脚(DdyFooter 近似版)已同步摘除, 旧 parts.tsx 随之删除。
// ============================================================
'use client'

import { safeHref } from '../../safe-href'

const FRIEND_LINKS: Array<{ label: string; url: string }> = [
  // [R41-主-1] 文案按 GBK 解码实抓快照逐字节对齐(顶点小说系, 非规格初稿误读版)
  { label: '顶点小说', url: 'https://wap.ddyueshu.cc/' },
  { label: '顶点小说APP', url: 'https://app.ddyueshu.cc' },
  { label: '顶点小说app官网下载', url: 'https://www.ddyueshu.cc/' },
]

export function DdyueshuFooter() {
  return (
    <>
      {/* 友链条(源站 #firendlink; [R41-主-1] 文案对齐 GBK 解码实抓快照: 「连接」非「链接」/「(邮箱见顶端)」半角括号) */}
      <div className="ddy-firendlink">
        友情连接：
        {FRIEND_LINKS.map((l) => (
          <a key={l.url} href={safeHref(l.url)} target="_blank" rel="noopener noreferrer">{l.label}</a>
        ))}
        (邮箱见顶端)
      </div>
      {/* 版权块(源站 .footer: 空友链列表蓝线 + 三行版权; 粤ICP 行尾空格为源站原文) */}
      <footer id="ddy-footer">
        <div className="ddy-footer-link" />
        <div className="ddy-footer-cont">
          <p>本站所有小说为转载作品，所有章节均由网友上传，转载至本站只是为了宣传本书让更多读者欣赏。</p>
          <p>Copyright © 2015 笔趣阁 All Rights Reserved.</p>
          <p>{'粤ICP备8888888号 '}</p>
        </div>
      </footer>
    </>
  )
}
