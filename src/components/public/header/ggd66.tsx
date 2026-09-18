// ============================================================
// [R39-2e] ggd66(格格党 www.ggd66.com) 仿站头部
//   快照: /tmp/r39-snap/ggd66/home.html(2026-09-18 直连实抓 18.4KB) + css-1-style.css(11.5KB, gb2312)
//   真站结构: .header(#1abc9c 绿 50px: header-left 站名 + header-nav 首 页/书 库/全本/搜索 + header-right)
//   色值: header #1abc9c / btn·search·footer #56ccb5 / a #00886d hover #f50 / body #f9f9f9
// ============================================================
'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { usePublic } from '../ctx'

export function Ggd66Header({ pending }: { cats: { id: string; name: string }[]; pending: boolean }) {
  const { site, navigate } = usePublic()
  const [kw, setKw] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (kw.trim()) navigate({ view: 'search', q: kw.trim() })
  }
  return (
    <header className="ggd-header">
      <div className="ggd-header-left">{site.name}</div>
      <nav className="ggd-header-nav" aria-label="主导航">
        <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>首 页</a>
        <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'category' }) }}>书 库</a>
        <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'fulltext' }) }}>全 本</a>
        <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'search' }) }}>搜 索</a>
      </nav>
      <div className="ggd-header-right">
        <form onSubmit={submit}>
          <input aria-label="搜索" placeholder="书名/作者" value={kw} onChange={(e) => setKw(e.target.value)} />
          <button type="submit">{pending ? '…' : '搜索'}</button>
        </form>
      </div>
    </header>
  )
}
