// ============================================================
// [R39-2h] huangjinwu(黄金屋 www.huangjinwu.org) 仿站头部
//   快照: /tmp/r39-snap/huangjinwu/home.html(2026-09-18 直连实抓 47.3KB) + style.css(44.5KB)
//   真站结构: 顶栏(dropdown 用户菜单 + a.logo 黄金屋 + theme-toggle) + sidebar-wrapper
//     (.sidebar-header logo + ul.navbar-menu: 首页/排行榜/书库/标签/作者/电子书/搜索)
//   色值(:root 实测): --bg #f0f4fb 渐变 #f5f8ff→#eef3fb / --secondary #2563eb / --logo #1d4ed8 /
//     --text #1e293b / --text-light #64748b / --border #dbe4f0 / --card #fff / radius 10px
// ============================================================
'use client'

import { usePublic } from '../ctx'
import type { CategoryItem } from '../types'

export function HuangjinwuHeader({ cats, pending }: { cats: CategoryItem[]; pending: boolean }) {
  const { site, navigate } = usePublic()
  void pending
  const menus: Array<{ label: string; view: 'home' | 'ranking' | 'category' | 'search' }> = [
    { label: '首页', view: 'home' },
    { label: '排行榜', view: 'ranking' },
    { label: '书库', view: 'category' },
    { label: '搜索', view: 'search' },
  ]
  return (
    <header className="hjw-header">
      <a
        className="hjw-logo"
        href="#"
        onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}
      >
        <span className="hjw-logo-icon" aria-hidden>📖</span>
        {site.name}
      </a>
      <nav className="hjw-navbar-menu" aria-label="主导航">
        {menus.map((m) => (
          <a key={m.view} href="#" onClick={(e) => { e.preventDefault(); navigate({ view: m.view }) }}>
            <span className="hjw-menu-text">{m.label}</span>
          </a>
        ))}
        {cats.slice(0, 6).map((c) => (
          <a key={c.id} href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'category', cat: c.id }) }}>
            <span className="hjw-menu-text">{c.name}</span>
          </a>
        ))}
      </nav>
    </header>
  )
}
