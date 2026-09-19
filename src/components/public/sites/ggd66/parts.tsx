// ============================================================
// [R39-2e] ggd66 共享小件 —— 面包屑(.breadcrumb: #cdf3eb 底 #ccc 边 圆角)
//   [R41-A] 页脚已迁至 Footer.tsx(Ggd66Footer, 源站 1:1 仿制), 本件不再含页脚。
// ============================================================
'use client'

import { usePublic } from '../../ctx'

export function GgdBreadcrumb({ items }: { items: Array<{ label: string; onClick?: () => void }> }) {
  return (
    <ol className="ggd-breadcrumb">
      {items.map((it, i) => (
        <li key={i} className={i === items.length - 1 && !it.onClick ? 'is-active' : undefined}>
          {it.onClick ? (
            <a href="#" onClick={(e) => { e.preventDefault(); it.onClick?.() }}>{it.label}</a>
          ) : it.label}
        </li>
      ))}
    </ol>
  )
}

export function GgdCrumbs({ bookName, catName }: { bookName?: string; catName?: string }) {
  const { navigate } = usePublic()
  const items: Array<{ label: string; onClick?: () => void }> = [{ label: '首页', onClick: () => navigate({ view: 'home' }) }]
  if (catName) items.push({ label: catName, onClick: () => navigate({ view: 'category' }) })
  if (bookName) items.push({ label: bookName })
  return <GgdBreadcrumb items={items} />
}
