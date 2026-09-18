// ============================================================
// [R39-2i] kks101(101看書 https://101kks.com) 仿站头部
//   快照: /tmp/r39-snap/kks101/home.html(2026-09-18 cloak 实抓 40.9KB, 繁体站) + style.css(60.2KB)
//   真站结构: .menu2 侧滑菜单 + header(.headbox: menubtn + logo「101看書」+ search + lang 繁簡切换
//     + menu1 顶导航) ; 主色 #1f6cb2 蓝 / 边 #eee / 字 #333/#666/#818a91
// ============================================================
'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { usePublic } from '../ctx'
import type { CategoryItem } from '../types'

export function KksHeader({ cats, pending }: { cats: CategoryItem[]; pending: boolean }) {
  const { site, navigate } = usePublic()
  const [kw, setKw] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (kw.trim()) navigate({ view: 'search', q: kw.trim() })
  }
  void pending
  return (
    <>
      <div className="kks-menu2" aria-hidden>
        <ul>
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>首頁</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'ranking' }) }}>排行榜</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'fulltext' }) }}>完本小說</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'category' }) }}>小說分類</a></li>
        </ul>
      </div>
      <header className="kks-header">
        <div className="kks-headbox">
          <div className="kks-logo">
            <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>{site.name}</a>
          </div>
          <form className="kks-search" onSubmit={submit}>
            <input aria-label="搜索" placeholder="搜書名 / 作者" value={kw} onChange={(e) => setKw(e.target.value)} />
            <button type="submit" aria-label="搜索">🔍</button>
          </form>
          <div className="kks-menu1">
            <ul>
              <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>首頁</a></li>
              <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'ranking' }) }}>排行</a></li>
              <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'fulltext' }) }}>完本</a></li>
              {cats.slice(0, 4).map((c) => (
                <li key={c.id}><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'category', cat: c.id }) }}>{c.name}</a></li>
              ))}
            </ul>
          </div>
        </div>
      </header>
    </>
  )
}
