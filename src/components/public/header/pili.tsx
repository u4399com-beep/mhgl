// ============================================================
// [R39-2j] pili(霹雳书屋 www.pilishuwu.com) 仿站头部
//   快照: /tmp/r39-snap/pili/home.html(2026-09-18 cloak standard 实抓 235KB) + wmcms 4 CSS
//   真站结构: .mod-top-wr(127px 头区: 大 logo + 搜索 470px/44px 高 + hot 标签行) +
//     .mod-top-nav-wr(58px 导航条: 首页/全部小说/排行榜/男频/女频/电子图书/无CP/纯爱/百合/轻小说 斜切 tab)
//   色值(wmcms 实测): 主橙 #fd8929 / 深橙 #f65400 / 棕字 #7d360f / hover #fa8729 /
//     nav-active 米黄底(#fbe4bb 系)/ 版心 1200px
// ============================================================
'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { usePublic } from '../ctx'

export function PiliHeader({ pending }: { cats: { id: string; name: string }[]; pending: boolean }) {
  const { site, navigate } = usePublic()
  const [kw, setKw] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (kw.trim()) navigate({ view: 'search', q: kw.trim() })
  }
  void pending
  const nav: Array<[string, Parameters<typeof navigate>[0]]> = [
    ['首页', { view: 'home' }],
    ['全部小说', { view: 'category' }],
    ['排行榜', { view: 'ranking' }],
    ['完本', { view: 'fulltext' }],
  ]
  return (
    <div className="pli-top-wr">
      {/* 127px 头区: logo + 搜索 */}
      <div className="pli-top-head">
        <a
          className="pli-logo"
          href="#"
          onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}
        >{site.name}</a>
        <form className="pli-search" onSubmit={submit}>
          <input aria-label="搜索" placeholder="书名 / 作者" value={kw} onChange={(e) => setKw(e.target.value)} />
          <button type="submit">搜索</button>
        </form>
        <ul className="pli-top-tag">
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'ranking' }) }}>热门小说</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'fulltext' }) }}>完本推荐</a></li>
        </ul>
      </div>
      {/* 58px 导航条(斜切 tab 形态, 以渐变近似真站切图) */}
      <div className="pli-top-nav-wr">
        <nav className="pli-top-nav" aria-label="主导航">
          <ul className="pli-top-nav-list">
            {nav.map(([label, view], i) => (
              <li key={label} className={i === 0 ? 'active' : undefined}>
                <a href="#" onClick={(e) => { e.preventDefault(); navigate(view) }}><span>{label}</span></a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}
