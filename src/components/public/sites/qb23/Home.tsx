// ============================================================
// [R39-2g] qb23 克隆首页 —— 快照 home.html(2026-09-18 直连实抓 45KB) + style.css 125.8KB
//   真站结构(main.wrapper#main > .content > .list > .box > .module):
//     .module-list.module-lines-list > .module-items > .module-item(封面卡):
//       .module-item-cover > .module-item-pic(圆角 5, hover 黑罩+白圆播放钮) +
//       .module-item-caption(底部渐变黑罩: span 作者/分类) + .module-item-titlebox >
//       a.module-item-title(主红 #ff2a14 700) + .module-item-text(作者灰)
//   降级: 真站首页多板块(今日推荐/限免/完本) → 平台契约单 books 流, 以「今日推荐」「热门榜单」
//     「最新上架」三板块复刻 mxone 卡片墙节奏(推断级)
// ============================================================
'use client'

import { useMemo } from 'react'
import type { SiteHomeProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import type { BookItem } from '../../types'

function QbCard({ b }: { b: BookItem }) {
  const { site, navigate } = usePublic()
  return (
    <div className="qb-module-item">
      <div className="qb-module-item-cover">
        <div className="qb-module-item-pic">
          <a
            href={viewToUrl({ view: 'book', bookId: b.id }, site.id)}
            onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}
            aria-label={b.name}
          >
            <BookCover cover={b.cover} name={b.name}  className="qb-cover" />
          </a>
          <div className="qb-module-item-caption">
            <span>{b.author}</span>
            <span>{b.category || '小说'}</span>
          </div>
        </div>
      </div>
      <div className="qb-module-item-titlebox">
        <a
          className="qb-module-item-title"
          href={viewToUrl({ view: 'book', bookId: b.id }, site.id)}
          onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}
        >{b.name}</a>
        <div className="qb-module-item-text">{b.author}</div>
      </div>
    </div>
  )
}

function QbSection({ title, books, loading, count }: { title: string; books: BookItem[]; loading: boolean; count?: number }) {
  const list = count ? books.slice(0, count) : books
  return (
    <div className="qb-list">
      <div className="qb-box">
        <div className="qb-blocktitle">{title}</div>
        <div className="qb-module">
          {loading ? (
            <div className="qb-module-items">
              {Array.from({ length: 6 }).map((_, i) => <Sk key={i} style={{ height: 220, borderRadius: 5 }} />)}
            </div>
          ) : list.length === 0 ? (
            <ErrorState message="暂无数据" />
          ) : (
            <div className="qb-module-items">
              {list.map((b) => <QbCard key={b.id} b={b} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function Qb23Home({ books, loading }: SiteHomeProps) {
  const hot = useMemo(() => [...books].sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0)), [books])
  return (
    <main className="qb-wrapper">
      <div className="qb-content">
        <QbSection title="今日推荐" books={books} loading={loading} count={12} />
        <QbSection title="热门榜单" books={hot} loading={loading} count={6} />
        <QbSection title="最新上架" books={books} loading={loading} count={12} />
      </div>
    </main>
  )
}
