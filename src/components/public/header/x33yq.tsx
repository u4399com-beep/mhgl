// ============================================================
// [R43-2] x33yq(33言情 www.x33yq.org) 仿站头部 —— 快照 /tmp/r43-snap/home.html 直连实抓:
//   源站结构: .headds 欢迎条(亲，欢迎光临33言情！) + .head(.head_logo a 站名 30px red + p 域名 20px red;
//     #searchbar .search 表单 POST /search.html searchtype=all+searchkey → 平台站内搜索;
//     .lianxiindex 错缺断章、加书：站内短信 / 后台有人,会尽快回复！) +
//     .daohang 蓝条主导航(#88c6e5 圆角10: 首页/阅读历史/今日更新/上架新书/月点击榜/总收藏榜/新书榜单) +
//     .nav1 黄条分类导航(#FFF9D9 边 #FFCC33 圆角10: /sort/1..18/ 18 分类)
//   声明: 源站 5 个榜单入口(今日更新/上架新书/月点击榜/总收藏榜/新书榜单)→ 平台单排行页(三榜 tab,
//   深链不进 URL); 站内短信为源站站内信入口(nofollow)→ 视觉保留 no-op。
// ============================================================
'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { usePublic } from '../ctx'
import type { CategoryItem } from '../types'

export function X33yqHeader({ cats, pending }: { cats: CategoryItem[]; pending: boolean }) {
  const { site, navigate } = usePublic()
  const [kw, setKw] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (kw.trim()) navigate({ view: 'search', q: kw.trim() })
  }
  // 真站 nav1 为 /sort/1..18/ 固定 18 分类 → 平台分类动态映射(取前 18)
  const navCats = cats.slice(0, 18)

  return (
    <>
      {/* 欢迎条(源站 .headds) */}
      <div className="xq-headds">
        <div className="xq-headds-con">
          <div className="xq-headds-sethome">亲，欢迎光临{site.name}！</div>
        </div>
      </div>
      {/* 头部(源站 .head: logo + 搜索 + 联系块) */}
      <header className="xq-head" role="banner">
        <div className="xq-head-logo">
          <a
            href="/"
            onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}
            aria-label={site.name}
          >{site.name}</a>
          <p>{site.domain || 'www.x33yq.org'}</p>
        </div>
        <div id="xq-searchbar">
          <div className="xq-search">
            <form onSubmit={submit}>
              <input
                className="xq-input-txt"
                aria-label="搜索"
                placeholder="请在此处输入书名或作者。"
                value={kw}
                onChange={(e) => setKw(e.target.value)}
              />
              <button className="xq-input-btn" type="submit">搜索</button>
            </form>
          </div>
        </div>
        <div className="xq-lianxiindex">
          <b><span className="xq-red">错缺断章、加书：</span><a href="#" onClick={(e) => e.preventDefault()}>站内短信</a></b>
          <br />
          <b>后台有人,会尽快回复！</b>
        </div>
      </header>
      {/* 主导航(源站 .daohang 蓝条) */}
      <nav className="xq-daohang" aria-label="主导航">
        <ul>
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>首页</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'history' }) }}>阅读历史</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'ranking' }) }}>今日更新</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'ranking' }) }}>上架新书</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'ranking' }) }}>月点击榜</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'ranking' }) }}>总收藏榜</a></li>
          <li><a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'ranking' }) }}>新书榜单</a></li>
        </ul>
      </nav>
      {/* 分类导航(源站 .nav1 黄条 18 分类) */}
      <nav className="xq-nav1" aria-label="分类导航">
        <ul>
          {navCats.map((c) => (
            <li key={c.id}>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'category', cat: c.id }) }}>{c.name}</a>
            </li>
          ))}
        </ul>
      </nav>
      {pending ? null : null}
    </>
  )
}
