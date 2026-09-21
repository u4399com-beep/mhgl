// ============================================================
// [R39-2h] huangjinwu 克隆首页 —— 快照 home.html(2026-09-18 直连实抓 47.3KB)
//   真站结构: .main-content > .container > .hot-section(h2.page-title「热门推荐」左侧 4px
//     secondary 色条) + .book-grid > a.book-card(.book-info: .book-title + .book-author +
//     .book-desc 2 行截断 + .book-badges: .category 蓝底白字/.status 浅底/.words)
// [R51-3-c] 补回导出 statusText/TextCard(R28-2d→R34-2c-7 代次件): 分类页(Category.tsx)/
//   搜索页(Search.tsx)自本文件单处引用 —— 实现按 R34-2c-7 原版逐字节回搬(色值注释同源)。
// ============================================================
'use client'

import type { SiteHomeProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { bookNavProps } from '../../bits'
import { BookCover } from '../../BookCover'
import { formatWords } from '../../seo'
import { statusLabel } from '../../seo'
import type { BookItem } from '../../types'

/** [R28-2d-1] 真站 :root 实测色值(hjw-style.css, TextCard/statusText 专用段) */
const SECONDARY = '#2563eb' // --secondary-color
const TEXT = '#1e293b' // --text-color
const TEXT_LIGHT = '#64748b' // --text-light
const BORDER = '#dbe4f0' // --border-color
const HOVER_BG = '#e8f1ff' // --hover-color(status badge 底)
const SHADOW = '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37,99,235,0.06)' // --shadow

/** [R28-2d-1] 状态字(連載中/全本; Search.tsx 单处引用) */
export function statusText(s?: string | null): string {
  if (s === 'completed') return '全本'
  return '连载'
}

/** [R28-2d-1] .book-card 纯文字卡(标题/作者/简介 2 行/三色 badge 组) — 真站 .book-grid 卡 */
// [R34-2c-7] 分类页(Category)私有副本与本组件逐字节相同 → 收敛为单处定义
export function TextCard({ book }: { book: BookItem }) {
  const { navigate } = usePublic()
  return (
    <article
      {...bookNavProps(navigate, book.id)}
      aria-label={`查看《${book.name}》详情`}
      className="hjw-card block cursor-pointer overflow-hidden rounded-[10px] border bg-white transition-all duration-300"
      style={{ borderColor: 'rgba(219,228,240,0.85)', boxShadow: SHADOW, color: TEXT }}
    >
      <div className="p-4">
        <div className="hjw-card-title mb-2 truncate text-[16px] font-medium leading-[1.4]" style={{ color: TEXT }}>
          {book.name}
        </div>
        <div className="mb-2 truncate text-[14px]" style={{ color: TEXT_LIGHT }}>
          作者：{book.author}
        </div>
        <div className="mb-3 line-clamp-2 min-h-[2.55em] text-[14px] leading-[1.5]" style={{ color: TEXT_LIGHT }}>
          {book.intro || `${book.category} · ${formatWords(book.wordCount)}`}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* 真站 .book-badge.category 实底蓝白字 */}
          <span className="inline-block rounded-[10px] px-3 py-1 text-[12px] font-medium leading-[1.5] text-white" style={{ background: SECONDARY }}>
            {book.category || '小说'}
          </span>
          {/* 真站 .book-badge.status 浅蓝底描边 */}
          <span className="inline-block rounded-[10px] border px-3 py-1 text-[12px] font-medium leading-[1.5]" style={{ background: HOVER_BG, borderColor: BORDER, color: TEXT }}>
            {statusText(book.status)}
          </span>
          {/* 真站 .book-badge.words 透明底描边 */}
          <span className="inline-block rounded-[10px] border px-3 py-1 text-[12px] font-medium leading-[1.5]" style={{ borderColor: BORDER, color: TEXT_LIGHT }}>
            {formatWords(book.wordCount)}
          </span>
        </div>
      </div>
    </article>
  )
}

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
