// ============================================================
// [R39-2e] ggd66 共享小件 —— 面包屑(.breadcrumb: #cdf3eb 底 #ccc 边 圆角) + 页脚(#56ccb5)
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

export function GgdFooter() {
  const { site } = usePublic()
  return (
    <footer className="ggd-footer">
      <p>{site.name} · 小说免费阅读 · 内容均系网友上传, 如有侵权请联系删除</p>
    </footer>
  )
}

export function GgdCrumbs({ bookName, catName }: { bookName?: string; catName?: string }) {
  const { navigate } = usePublic()
  const items: Array<{ label: string; onClick?: () => void }> = [{ label: '首页', onClick: () => navigate({ view: 'home' }) }]
  if (catName) items.push({ label: catName, onClick: () => navigate({ view: 'category' }) })
  if (bookName) items.push({ label: bookName })
  return <GgdBreadcrumb items={items} />
}
