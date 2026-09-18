// ============================================================
// [R39-2d] ddyueshu(顶点小说 www.ddyueshu.cc) 仿站头部
//   快照: /tmp/r39-snap/ddyueshu/home.v2.html(2026-09-18 直连实抓 26KB, GBK→gb18030 解码)
//   真站结构: #wrapper > .header(61px: .header_logo 250×60 图标 + .header_search 450px 表单) +
//     .nav(#88C6E5 蓝 40px: 首页/我的书架/玄幻小说/修真小说/都市小说/穿越小说/网游小说/科幻小说/排行榜单/全部小说)
//   色值: body #E9FAFF / nav #88C6E5 / search 边 #88C6E5 hover #459DF5 / 文字 #555 (biquge.css 实测)
// ============================================================
'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { usePublic } from '../ctx'
import type { CategoryItem } from '../types'

export function DdyueshuHeader({ cats, pending }: { cats: CategoryItem[]; pending: boolean }) {
  const { site, navigate } = usePublic()
  const [kw, setKw] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (kw.trim()) navigate({ view: 'search', q: kw.trim() })
  }
  // 真站 nav 分类项(去掉 首页/我的书架/排行榜单/全部小说 的固定项)与平台分类映射
  const fixed = new Set(['首页', '我的书架', '排行榜单', '全部小说'])
  const navCats = cats.filter((c) => !fixed.has(c.name)).slice(0, 6)

  return (
    <>
      <header className="ddy-header" role="banner">
        <a
          className="ddy-logo"
          href="/"
          onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}
          aria-label={site.name}
        >{site.name}</a>
        <div className="ddy-header-search">
          <form onSubmit={submit}>
            <input
              className="ddy-search-text"
              aria-label="搜索"
              placeholder="可搜索小说名、作者名"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
            />
            <button className="ddy-search-btn" type="submit">搜索</button>
          </form>
        </div>
      </header>
      <nav className="ddy-nav" aria-label="主导航">
        <ul>
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>首页</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'fulltext' }) }}>全部小说</a></li>
          {navCats.map((c) => (
            <li key={c.id}>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'category', cat: c.id }) }}>{c.name}</a>
            </li>
          ))}
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'ranking' }) }}>排行榜单</a></li>
        </ul>
      </nav>
      {pending ? null : null}
    </>
  )
}
