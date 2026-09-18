// ============================================================
// [R39-2d] ddyueshu 克隆首页 —— 快照 home.v2.html(2026-09-18 直连实抓, gb18030 解码)
//   真站结构(biquge 模板): #main > #hotcontent(.l 4 张封面推荐卡 + .r 上期强推列表) +
//     .novelslist(3 列分类块: h2 分类名 + .top 封面卡(67×82) + ul 双列章节链接)
//   色值(biquge.css 实测): body #E9FAFF / nav #88C6E5 / .l·.r 底 #FEF9EF 边 3px #C3DFEA /
//     novelslist 边 3px #A6D3E8 / h2 底 #F6F8FE / li a #6F78A7 / 弱字 #B3B3B3
//   降级: 真站分类块含各分类最新章节行 → 契约按分类拉最新书列表近似(推断级, 同 legacy 口径)
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteHomeProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { fetchBooks, fetchCategories } from '../../data'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import type { BookItem, CategoryItem } from '../../types'
import { DdyFooter } from './parts'

export function DdyueshuHome({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()
  // 强推榜: books 前 10(真站「上期强推」站方数据, 以最新书列表近似)
  const push = books.slice(0, 10)
  const [cats, setCats] = useState<CategoryItem[]>([])
  const [blocks, setBlocks] = useState<Array<{ cat: CategoryItem; books: BookItem[] }>>([])

  useEffect(() => {
    let alive = true
    fetchCategories().then((cs) => { if (alive) setCats(cs.slice(0, 3)) }).catch(() => {})
    return () => { alive = false }
  }, [])
  // 3 个分类块(真站 novelslist 为多列分类块, 平台契约逐分类拉 8 本)
  useEffect(() => {
    let alive = true
    Promise.all(cats.map((c) => fetchBooks({ cat: c.id, page: 1, size: 8, site: site.id }).catch(() => null)))
      .then((rs) => {
        if (!alive) return
        setBlocks(cats.map((c, i) => ({ cat: c, books: rs[i]?.books || [] })))
      })
    return () => { alive = false }
  }, [cats, site.id])

  const go = (b: BookItem) => navigate({ view: 'book', bookId: b.id })
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)
  const top4 = books.slice(0, 4)

  return (
    <div className="ddy-home">
      <div id="ddy-main">
        <div className="ddy-hotcontent">
          <div className="ddy-hot-l">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <Sk key={i} style={{ height: 150, margin: 10, borderRadius: 0 }} />)
              : top4.map((b) => (
                <div className="ddy-hot-item" key={b.id}>
                  <button className="ddy-hot-img" onClick={() => go(b)} aria-label={b.name}>
                    <BookCover cover={b.cover} name={b.name}  />
                  </button>
                  <dl>
                    <dt>
                      <span>{b.author}</span>
                      <a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a>
                    </dt>
                    <dd>{(b.intro || '暂无简介').slice(0, 52)}</dd>
                  </dl>
                  <div className="ddy-clear" />
                </div>
              ))}
            {!loading && top4.length === 0 && <ErrorState message="暂无推荐书籍" />}
          </div>
          <div className="ddy-hot-r">
            <h2>上期强推</h2>
            <ul>
              {push.map((b) => (
                <li key={b.id}>
                  <span className="ddy-s1">[{b.category || '小说'}]</span>
                  <span className="ddy-s2"><a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a></span>
                  <span className="ddy-s5">{b.author}</span>
                </li>
              ))}
              {loading && Array.from({ length: 8 }).map((_, i) => <li key={i}><Sk style={{ height: 16 }} /></li>)}
            </ul>
          </div>
          <div className="ddy-clear" />
        </div>
        {/* 分类块 ×3 */}
        {blocks.map(({ cat, books: bs }) => (
          <div className="ddy-novelslist" key={cat.id}>
            <div className="ddy-nl-content">
              <h2>{cat.name}</h2>
              {bs[0] && (
                <div className="ddy-nl-top">
                  <button className="ddy-nl-img" onClick={() => go(bs[0])} aria-label={bs[0].name}>
                    <BookCover cover={bs[0].cover} name={bs[0].name}  />
                  </button>
                  <dl>
                    <dt><a href={link(bs[0])} onClick={(e) => { e.preventDefault(); go(bs[0]) }}>{bs[0].name}</a></dt>
                    <dd>{(bs[0].intro || '暂无简介').slice(0, 40)}</dd>
                  </dl>
                  <div className="ddy-clear" />
                </div>
              )}
              <ul>
                {bs.slice(1, 7).map((b) => (
                  <li key={b.id}><a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a></li>
                ))}
              </ul>
            </div>
            <div className="ddy-nl-content">
              <h2>{cat.name}·更多</h2>
              <ul className="ddy-nl-more">
                {bs.slice(0, 8).map((b) => (
                  <li key={b.id}><a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a></li>
                ))}
              </ul>
            </div>
            <div className="ddy-nl-content ddy-nl-last">
              <h2>最新入库</h2>
              <ul className="ddy-nl-more">
                {books.slice(0, 8).map((b) => (
                  <li key={b.id}><a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a></li>
                ))}
              </ul>
            </div>
            <div className="ddy-clear" />
          </div>
        ))}
        {cats.length === 0 && <Sk style={{ height: 260, margin: '8px 0' }} />}
      </div>
      <DdyFooter />
    </div>
  )
}
