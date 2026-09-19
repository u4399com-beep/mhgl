// ============================================================
// [R43-2] x33yq(33言情 www.x33yq.org) 克隆页脚 —— 源站快照 /tmp/r43-snap/home.html 尾部实抓 1:1:
//   ① #firendlink 友链条(h2「友情链接：」+ 3 条链接: 33言情 / 33言情小说 / 菇凉们爱不释手的言情小说网,
//      源站三条均指向 www.x33yq.org 本站 → safeHref 白名单真实外链 + target _blank + rel noopener)
//   ② .footer > .footer_cont 两行版权(逐字节对齐快照, 首尾空格为源站原文):
//      「 33言情所有免费小说阅读网络小说为转载作品，转载至33言情只是为了宣传本书让更多读者欣赏。 」
//      「 Copyright © 33言情https://www.x33yq.org All Rights Reserved. 」
//   样式: style.css 实测值(#firendlink 972px 2px #A6D3E8 白底圆角10 / h2 #DAEDF5 / a hover #ff6600 /
//   .footer 980 居中 / p lh20 #302B35), 规则全挂 .clone-x33yq 作用域(见 index.ts 页脚段)。
//   [R43-2] 页脚走 R41 模板级 Footer 槽(PublicSite CloneFooter 渲染), 各页型组件内不内嵌页脚。
// ============================================================
'use client'

import { safeHref } from '../../safe-href'

const FRIEND_LINKS: Array<{ label: string; url: string }> = [
  // [R43-2] 三条友链逐字对齐快照(源站均为本站自引用链接)
  { label: '33言情', url: 'https://www.x33yq.org/' },
  { label: '33言情小说', url: 'https://www.x33yq.org/' },
  { label: '菇凉们爱不释手的言情小说网', url: 'https://www.x33yq.org/' },
]

export function X33yqFooter() {
  return (
    <>
      {/* 友链条(源站 #firendlink: h2 友情链接： + 3 链接) */}
      <div id="xq-firendlink">
        <h2>友情链接：</h2>
        {FRIEND_LINKS.map((l) => (
          <a key={l.label} href={safeHref(l.url)} target="_blank" rel="noopener noreferrer">{l.label}</a>
        ))}
      </div>
      {/* 版权块(源站 .footer > .footer_cont 两行; 首尾空格为快照原文, 逐字节保留) */}
      <footer className="xq-footer">
        <div className="xq-footer-cont">
          <p>{' 33言情所有免费小说阅读网络小说为转载作品，转载至33言情只是为了宣传本书让更多读者欣赏。 '}</p>
          <p>{' Copyright © 33言情https://www.x33yq.org All Rights Reserved. '}</p>
        </div>
      </footer>
    </>
  )
}
