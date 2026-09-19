// ============================================================
// [R39-2e] ggd66 克隆首页 —— 快照 home.html(2026-09-18 直连实抓 18.4KB)
//   真站结构: .container > .content > .content-left#fengtui「热门小说推荐」(4-6 张 .item 封面卡
//     双列: .image 90pt 封面 + dl(dt span 作者 + a 书名, dd 简介 90pt)) +
//     .content-right#fengyou「阅读排行榜」(ul li: [分类] a 书名 span 作者, 虚线底) + #zuixin「最新小说」
//   色值(style.css 实测): body #f9f9f9 / header #1abc9c / a #00886d hover #f50 /
//     h2 底线 1px #ccc / item dt 点线底 / li 虚线底 #ccc
//   降级: 「4828人读过」真站计数 → 契约无阅读人数, 不渲染(保留字数/状态)
// ============================================================
'use client'

import type { SiteHomeProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { BookCover } from '../../BookCover'
import type { BookItem } from '../../types'

function RankList({ books, loading, title }: { books: BookItem[]; loading: boolean; title: string }) {
  const { site, navigate } = usePublic()
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)
  return (
    <div className="ggd-content-right">
      <h2>{title}</h2>
      <ul>
        {loading
          ? Array.from({ length: 12 }).map((_, i) => <li key={i}><Sk style={{ height: 24 }} /></li>)
          : books.map((b) => (
            <li key={b.id}>
              <span className="ggd-cat-tag">[{b.category || '小说'}]</span>
              <a href={link(b)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }} title={b.name}>{b.name}</a>
              <span>{b.author}</span>
            </li>
          ))}
        {!loading && books.length === 0 && <li><ErrorState message="暂无数据" /></li>}
      </ul>
    </div>
  )
}

export function Ggd66Home({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)
  const go = (b: BookItem) => navigate({ view: 'book', bookId: b.id })
  const fengtui = books.slice(0, 6)
  const rank = [...books].sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0)).slice(0, 14)

  return (
    <div className="ggd-home">
      <div className="ggd-container">
        <div className="ggd-content">
          <div className="ggd-content-left" id="ggd-fengtui">
            <h2>热门小说推荐</h2>
            {fengtui.map((b) => (
              <div className="ggd-item" key={b.id}>
                <button className="ggd-item-img" onClick={() => go(b)} aria-label={b.name}>
                  <BookCover cover={b.cover} name={b.name}  />
                </button>
                <dl>
                  <dt>
                    <span>{b.author}</span>
                    <a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a>
                  </dt>
                  <dd>{(b.intro || '暂无简介').slice(0, 60)}</dd>
                </dl>
                <div className="ggd-clear" />
              </div>
            ))}
            {loading && Array.from({ length: 4 }).map((_, i) => <Sk key={i} style={{ height: 150, margin: 10 }} />)}
            {!loading && fengtui.length === 0 && <ErrorState message="暂无推荐" />}
          </div>
          <RankList books={rank} loading={loading} title="阅读排行榜" />
          <div className="ggd-clear" />
        </div>
        <div className="ggd-content">
          <RankList books={books.slice(0, 14)} loading={loading} title="最新小说" />
          <div className="ggd-clear" />
        </div>
      </div>
    </div>
  )
}
