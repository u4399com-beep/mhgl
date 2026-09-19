// ============================================================
// [R41-B-5] qb23 克隆页脚 —— 源站 #footer 1:1 仿制(mxone 模板)
//   素材: /tmp/r41-snap/23qb.net.html 尾段(2026-09-19 实抓) + /tmp/r41-css/qb23.css
//   实测: #footer{background:#f3f5f7;font-size:12px;color:rgba(0,0,0,.51);padding:10px 20px;
//     text-align:center;position:relative} + ::after 顶 1px #eaedf1 scaleY(.5) 细线;
//     .sitemap .space-line-bold{display:inline-block;width:1px;margin:0 5px;height:8px}
//     底色取基类 .space-line-bold #c2c6d0(基类另有 border-radius:5px 一并保留);
//     ≤559px #footer/.sitemap 10px。源站 logo img(高 10px)无法复刻 → 按规格省略;
//     RSS/Google/Bing 为源站 /rss*.xml 站内资源, 克隆无 RSS 资源 → 保链接视觉 navigate home
// ============================================================
'use client'

import { Fragment } from 'react'
import { usePublic, viewToUrl } from '../../ctx'

export function Qb23Footer() {
  const { site, navigate } = usePublic()
  const feeds = ['RSS', 'Google', 'Bing']
  const home = { view: 'home' as const }
  return (
    <footer className="qb-fsec">
      <p className="qb-fmap">
        {feeds.map((label, i) => (
          <Fragment key={label}>
            {i > 0 ? <span className="qb-fsep" /> : null}
            <a href={viewToUrl(home, site.id)} onClick={(e) => { e.preventDefault(); navigate(home) }}>{label}</a>
          </Fragment>
        ))}
      </p>
      {/* 文案逐字节对齐源站快照(规格引文为字面站名, 未走 site.name 动态) */}
      <p>铅笔小说</p>
    </footer>
  )
}
