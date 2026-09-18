// ============================================================
// [R39-2i] kks101 共享小件 —— 页脚(快照 .foot: 链接行 + Copyright + 友情連結)
// ============================================================
'use client'

import { usePublic, viewToUrl } from '../../ctx'
import type { ViewParams } from '../../ctx'

export function KksFooter() {
  const { site, navigate } = usePublic()
  const items: Array<[string, ViewParams]> = [
    ['排行榜', { view: 'ranking' }],
    ['最新更新', { view: 'category' }],
    ['完本小說', { view: 'fulltext' }],
    ['全部小說', { view: 'fulltext' }],
  ]
  return (
    <div className="kks-foot">
      <div className="kks-copyright">
        <div>
          {items.map(([label, view]) => (
            <a key={label} href={viewToUrl(view, site.id)} onClick={(e) => { e.preventDefault(); navigate(view) }}>{label}</a>
          ))}
        </div>
        <p>
          Copyright 2023 · Powered by © {site.name}
        </p>
        <div>友情連結：{site.name} · 本站所有小說均由網友上傳, 如有侵權請聯繫刪除</div>
        <div className="kks-clear" />
      </div>
    </div>
  )
}
