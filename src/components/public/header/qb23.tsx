// ============================================================
// [R39-2g] qb23(铅笔小说 www.23qb.net) 仿站头部
//   快照: /tmp/r39-snap/qb23/home.html(2026-09-18 直连实抓 45KB) + mxstatic/css/style.css(125.8KB)
//   真站结构(mxone 模板): .header(search 搜索区) + .nav(ul.nav-menu-items: 首页+13 分类
//     + .nav-menu-item.drop 全部分类下拉) + #search-content(大搜索框+今日热门热词行)
//   主色(style.css 实测): 主红 #ff2a14 / 选中下划线渐变 linear-gradient(90deg,#ff9800,#ff2a14) /
//     暗底 #282828 / 边灰 #eaedf1 / 字灰 #c2c6d0 / 绿 #34a853
// ============================================================
'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { usePublic } from '../ctx'
import type { CategoryItem } from '../types'

// 真站 nav 分类文案(快照实测): 言情/都市/唯美/穿越/青春/玄幻/武侠/军事/竞技/科幻/悬疑/同人/职场
export const QB_NAV_LABELS = ['言情', '都市', '唯美', '穿越', '青春', '玄幻', '武侠', '军事', '竞技', '科幻', '悬疑', '同人', '职场']

export function QbHeader({ cats, pending }: { cats: CategoryItem[]; pending: boolean }) {
  const { navigate } = usePublic()
  const [kw, setKw] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (kw.trim()) navigate({ view: 'search', q: kw.trim() })
  }
  const navCats = cats.slice(0, 13)

  return (
    <>
      <div className="qb-header">
        <div className="qb-nav-search">
          <form className="qb-search-dh" onSubmit={submit}>
            <input
              aria-label="搜索"
              placeholder="书名 / 作者"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
            />
            <button type="submit">{pending ? '…' : '搜索'}</button>
            <a
              className="qb-search-cupfox"
              href="#"
              onClick={(e) => { e.preventDefault(); navigate({ view: 'fulltext' }) }}
            >书库</a>
          </form>
        </div>
        <nav className="qb-nav" aria-label="主导航">
          <ul className="qb-nav-items">
            <li className="qb-nav-item qb-selected">
              <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}><span>首页</span></a>
            </li>
            {navCats.map((c) => (
              <li className="qb-nav-item" key={c.id}>
                <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'category', cat: c.id }) }}><span>{c.name}</span></a>
              </li>
            ))}
            <li className="qb-nav-item">
              <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'fulltext' }) }}><span>书库</span></a>
            </li>
          </ul>
        </nav>
      </div>
    </>
  )
}
