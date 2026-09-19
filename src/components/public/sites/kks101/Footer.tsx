// ============================================================
// [R41-B-3] kks101 克隆页脚 —— 源站 .foot 1:1 仿制(繁体站, 文案逐字节保留)
//   素材: /tmp/r41-snap/101kks.com.html 尾段(2026-09-19 实抓) + /tmp/r41-css/kks101-main.css
//   实测: .foot{text-align:center;background:#fff;padding:20px 0}
//     .foot a{display:inline-block;padding:0 10px;line-height:200%}
//     .foot p{padding:10px 0;color:#888;font-size:12px}; 链接色取源站全局 a #666 / a:hover #06c;
//     源站 .black .foot{background:#242729} 暗色变体未实现——本应用主题表无 dark 实例(记录)
// ============================================================
'use client'

import { Fragment } from 'react'
import { usePublic, viewToUrl } from '../../ctx'
import { safeHref } from '../../safe-href'
import type { ViewParams } from '../../ctx'

export function Kks101Footer() {
  const { site, navigate } = usePublic()
  // [R41-B-4] 源站 6 导航链接 → 克隆视图映射(规格: 排行榜→ranking / 最新更新→home /
  //   書單推薦→category / 熱門書評→ranking / 全部小說→category / 熱門標籤→keyword)
  const navs: Array<[string, ViewParams]> = [
    ['排行榜', { view: 'ranking' }],
    ['最新更新', { view: 'home' }],
    ['書單推薦', { view: 'category' }],
    ['熱門書評', { view: 'ranking' }],
    ['全部小說', { view: 'category' }],
    ['熱門標籤', { view: 'keyword' }],
  ]
  const home = { view: 'home' as const }
  return (
    <footer className="kks-fsec">
      <div>
        {/* 源站各链接间有换行空白 → 渲染为单空格, 以 {' '} 保真 */}
        {navs.map(([label, view], i) => (
          <Fragment key={label}>
            {i > 0 ? ' ' : null}
            <a href={viewToUrl(view, site.id)} onClick={(e) => { e.preventDefault(); navigate(view) }}>{label}</a>
          </Fragment>
        ))}
      </div>
      {/* 文案逐字节对齐源站快照: 「Powered by  」双空格与末尾空 <a> 均为源站原样 */}
      <p>
        {'Copyright 2023 '}
        <a href={viewToUrl(home, site.id)} onClick={(e) => { e.preventDefault(); navigate(home) }}>{'Powered by  © 101看書（https://101kks.com）'}</a>
        <a href={viewToUrl(home, site.id)} onClick={(e) => { e.preventDefault(); navigate(home) }} />
      </p>
      <div>
        {/* 源站渲染形态: 竖线紧贴前链接、后随折叠空格 → {'| '} 保真;
            101看書 为真实外链(源站自身域名)走 safeHref 白名单, Cookies Policy/DMCA
            源站路径无克隆视图 → navigate home 保视觉(规格口径) */}
        {'友情連結：'}
        <a href={safeHref('https://101kks.com')} target="_blank" rel="noopener noreferrer" title="101看書">101看書</a>
        {'| '}
        <a href={viewToUrl(home, site.id)} onClick={(e) => { e.preventDefault(); navigate(home) }}>Cookies Policy</a>
        {'| '}
        <a href={viewToUrl(home, site.id)} onClick={(e) => { e.preventDefault(); navigate(home) }}>DMCA</a>
        <div className="kks-clear" />
      </div>
    </footer>
  )
}
