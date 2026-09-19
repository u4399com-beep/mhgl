// ============================================================
// [R39-2h] huangjinwu 克隆首页 —— 快照 home.html(2026-09-18 直连实抓 47.3KB)
//   真站结构: .main-content > .container > .hot-section(h2.page-title「热门推荐」左侧 4px
//     secondary 色条) + .book-grid > a.book-card(.book-info: .book-title + .book-author +
//     .book-desc 2 行截断 + .book-badges: .category 蓝底白字/.status 浅底/.words)
// ============================================================
'use client'

import type { SiteHomeProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { BookCover } from '../../BookCover'
import { formatWords } from '../../seo'
import { statusLabel } from '../../seo'
import type { BookItem } from '../../types'

export function HjwCard({ b, showDesc = true }: { b: BookItem; showDesc?: boolean }) {
  const { site, navigate } = usePublic()
  return (
    <a
      className="hjw-book-card"
      href={viewToUrl({ view: 'book', bookId: b.id }, site.id)}
      onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}
    >
      <div className="hjw-book-cover">
        <BookCover cover={b.cover} name={b.name}  />
      </div>
      <div className="hjw-book-info">
        <div className="hjw-book-title">{b.name}</div>
        <div className="hjw-book-author">作者：{b.author}</div>
        {showDesc && <div className="hjw-book-desc">{(b.intro || '暂无简介').slice(0, 64)}</div>}
        <div className="hjw-book-badges">
          <span className="hjw-badge hjw-badge-category">{b.category || '小说'}</span>
          <span className="hjw-badge hjw-badge-status">{statusLabel(b.status)}</span>
          <span className="hjw-badge hjw-badge-words">{formatWords(b.wordCount)}</span>
        </div>
      </div>
    </a>
  )
}

export function HuangjinwuHome({ books, loading }: SiteHomeProps) {
  return (
    <div className="hjw-main">
      <div className="hjw-container">
        <div className="hjw-section">
          <h2 className="hjw-page-title">热门推荐</h2>
          {loading ? (
            <div className="hjw-book-grid">
              {Array.from({ length: 8 }).map((_, i) => <Sk key={i} style={{ height: 180, borderRadius: 10 }} />)}
            </div>
          ) : books.length === 0 ? (
            <ErrorState message="暂无推荐书籍" />
          ) : (
            <div className="hjw-book-grid">
              {books.slice(0, 12).map((b) => <HjwCard key={b.id} b={b} />)}
            </div>
          )}
        </div>
        <div className="hjw-section">
          <h2 className="hjw-page-title">最新上架</h2>
          {loading ? (
            <div className="hjw-book-grid">
              {Array.from({ length: 6 }).map((_, i) => <Sk key={i} style={{ height: 180, borderRadius: 10 }} />)}
            </div>
          ) : (
            <div className="hjw-book-grid">
              {books.slice(12, 24).map((b) => <HjwCard key={b.id} b={b} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
