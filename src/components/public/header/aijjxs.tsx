// ============================================================
// [R39-2a] aijjxs(久久小说下载网 www.aijjxs.com) 仿站头部
//   快照: /tmp/r39-snap/aijjxs/home.html(2026-09-18 直连实抓 52.9KB) + css-0-style.css(39.7KB)
//   真站结构:
//     .top-float 固定顶导航(.top-float-inner: nav.top-float-nav 16 分类胶囊 + .top-float-auth 登录/注册)
//     header.top(.top-1: h1.logo「站内搜索」+small + .top-links 站点数据行; form.search 输入+「搜索全站」按钮)
//   色值: --brand #0f766e / --brand-dark #115e59 / --paper #fffdf8 / --line #e5dccd /
//         --ink #1f2937 / --muted #6b7280 / --accent #b45309 / --bg #f3efe7 / radius 14px
//   (全部真站 :root 变量实测, 见 css-0-style.css)
// ============================================================
'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { usePublic, viewToUrl } from '../ctx'
import type { CategoryItem } from '../types'

// 真站 top-float-nav 的 16 个分类胶囊(快照 home.html 实测文案; 平台分类表驱动时按名称匹配, 缺失回落全部分类)
const FLOAT_NAV_FALLBACK = ['穿越', '重生', '古代架空', '现代言情', '总裁豪门', '仙侠幻想', '同人衍生', '无限流', '耽于纯美', '玄幻魔法', '都市异能', '历史军事', '网游小说', '惊悚悬疑', '文学名著']

export function AijjxsHeader({ cats, pending }: { cats: CategoryItem[]; pending: boolean }) {
  const { site, navigate } = usePublic()
  const [kw, setKw] = useState('')
  // 真站顶导航 = 分类胶囊(首页 + /txt/{slug}/ 分类); 平台以分类表映射 navigate({view:'category'})
  const navCats = cats.length ? cats : FLOAT_NAV_FALLBACK.map((n, i) => ({ id: `f${i}`, name: n }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (kw.trim()) navigate({ view: 'search', q: kw.trim() })
  }

  return (
    <>
      {/* .top-float 固定顶导航(真站 sticky) */}
      <div className="ajx-topfloat">
        <nav className="ajx-topfloat-nav" aria-label="分类导航">
          <a className="ajx-tf-a" href={viewToUrl({ view: 'home' }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>首页</a>
          {navCats.slice(0, 15).map((c) => (
            <a
              key={c.id}
              className="ajx-tf-a"
              href={viewToUrl({ view: 'category', cat: c.id }, site.id)}
              onClick={(e) => { e.preventDefault(); navigate({ view: 'category', cat: c.id }) }}
            >
              {c.name}
            </a>
          ))}
        </nav>
      </div>
      {/* header.top: logo + 数据行 + 搜索 */}
      <header className="ajx-top">
        <div className="ajx-top-1">
          <h1 className="ajx-logo">
            站内搜索
            <small>快速找到你想要的TXT电子书</small>
          </h1>
          <div className="ajx-top-links">
            <em>{pending ? '…' : `${cats.length || 15}`}</em> 个分类 ·
            <a
              href={viewToUrl({ view: 'fulltext' }, site.id)}
              onClick={(e) => { e.preventDefault(); navigate({ view: 'fulltext' }) }}
            >全站书库</a>
            <span className="ajx-strong">{site.name}</span>
          </div>
        </div>
        <form className="ajx-search" onSubmit={submit}>
          <input
            aria-label="搜索全站"
            placeholder="输入书名 / 作者关键词…"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
          />
          <button type="submit">搜索全站</button>
        </form>
      </header>
    </>
  )
}
