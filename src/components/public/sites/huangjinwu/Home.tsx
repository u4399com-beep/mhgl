// ============================================================
// [R28-2d-1] huangjinwu(黄金屋) 首页克隆 —— 真站直连实测 1:1
// 素材: /tmp/r28-2d/huangjinwu/hjw-home.html + hjw-style.css(2026-09-16 实抓, 200 OK)
//
// 真站 DOM(main-content > .container max 1180px, 三段):
//   ├ .hot-section    h2.page-title「热门推荐」 + .book-grid > a.book-card×6
//   │                 纯文字卡: .book-title(单行省略) + .book-author「作者：x」 +
//   │                 .book-desc(2 行钳制) + .book-badges(category 实底蓝 / status 浅蓝描边 / words 透明描边)
//   ├ .sort-section   h2.page-title「分类排行榜」 + .category-ranking-grid > .ranking-module×N
//   │                 (.ranking-module-title bg #f0f4fb + :before 3×16px 蓝竖条;
//   │                  .ranking-item 计数徽章 :before counter, 前 3 名蓝系渐层)
//   └ .update-section h2.page-title「最新更新」 + .book-grid 同款卡片
// 注: ①真站头部(headers 折叠导航/搜索/夜间切换)由 SiteHeader 承担, 本组件从 main-content 起
//    ②真站卡为纯文字卡(无封面图), badge 三色 chip 为识别核心 → 逐条复刻
// 降级: ①真站「热门推荐」为站方运营位 → 数据面用字数榜 top6 替代(失败回退 props 前 6)
//      ②真站分类排行榜每榜固定 10 本 → 单次 fetchBooks(sort:words,60) 按 category 分组取 10 本
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SiteHomeProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import type { BookItem } from '../../types'
import { bookNavProps } from '../../bits'
import { formatWords } from '../../seo'

/** [R28-2d-1] 真站 :root 实测色值(hjw-style.css) */
const SECONDARY = '#2563eb' // --secondary-color
const TEXT = '#1e293b' // --text-color
const TEXT_LIGHT = '#64748b' // --text-light
const BORDER = '#dbe4f0' // --border-color
const HOVER_BG = '#e8f1ff' // --hover-color(status badge 底)
const BG_TINT = '#f0f4fb' // --bg-color(ranking 榜头底)
const SHADOW = '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37,99,235,0.06)' // --shadow

// [R34-2c-7] 分类页/搜索页私有副本与本实现逐字节相同 → 收敛为单处定义
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

/** [R28-2d-1] .ranking-module 分类排行榜模块(蓝竖条榜头 + 计数徽章行) */
function RankModule({ title, books, onBook }: { title: string; books: BookItem[]; onBook: (id: string) => void }) {
  return (
    <div className="hjw-module overflow-hidden rounded-[10px] border bg-white" style={{ borderColor: BORDER, boxShadow: SHADOW }}>
      {/* 真站 .ranking-module-title: bg --bg-color + :before 3×16px 蓝竖条(竖条由 css 串补) */}
      <div className="hjw-modtitle flex items-center gap-2 border-b px-4 py-3 text-[18px] font-semibold" style={{ background: BG_TINT, borderColor: BORDER, color: TEXT }}>
        {title}
      </div>
      <div className="flex flex-col py-1">
        {books.slice(0, 10).map((b, i) => (
          <div
            key={b.id}
            role="button" tabIndex={0} onClick={() => onBook(b.id)}
            className="hjw-ritem flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors"
            style={{ borderBottom: `1px solid ${BORDER}` }}
          >
            {/* 真站 .ranking-item:before 计数徽章(前 3 名蓝系) */}
            <span className="hjw-rnum flex h-6 w-6 shrink-0 items-center justify-center rounded-[10px] text-[14px] font-semibold" style={{ background: HOVER_BG, color: TEXT_LIGHT }}>
              {i + 1}
            </span>
            <span className="hjw-rtitle min-w-0 flex-1 truncate text-[16px] font-medium" style={{ color: TEXT }}>
              {b.name}
            </span>
            <span className="max-w-[100px] shrink-0 truncate text-[14px]" style={{ color: TEXT_LIGHT }}>
              {b.author}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function HjwHome({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()

  // [R28-2d-1] 热门 6 卡(字数热榜基因 → 真站热门推荐位; 失败回退 props 前 6)
  const [pool, setPool] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 60 })
      .then((d) => {
        if (alive) setPool(d.books || [])
      })
      .catch(() => {
        if (alive) setPool([])
      })
    return () => {
      alive = false
    }
  }, [site.id])

  const hot = (pool && pool.length ? pool : books).slice(0, 6)
  // 最新更新(props 余量; 真站 update-section 同款卡片)
  const hotIds = useMemo(() => new Set(hot.map((b) => b.id)), [hot])
  const updated = books.filter((b) => !hotIds.has(b.id)).slice(0, 12)

  // [R28-2d-1] 分类排行榜: 单次 60 本按 category 分组(真站逐榜 10 本; 无逐榜接口 → 同源分组, 声明)
  const rankingModules = useMemo(() => {
    const src = pool && pool.length ? pool : books
    const byCat = new Map<string, BookItem[]>()
    for (const b of src) {
      const c = b.category || '其他'
      if (!byCat.has(c)) byCat.set(c, [])
      const arr = byCat.get(c)!
      if (arr.length < 10) arr.push(b)
    }
    return Array.from(byCat.entries())
      .filter(([, arr]) => arr.length >= 3)
      .slice(0, 6)
      .map(([cat, arr]) => ({ cat, arr }))
  }, [pool, books])

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6">
      {/* 热门推荐 — 真站 .hot-section */}
      <section aria-label="热门推荐">
        <h2 className="hjw-title mb-8 text-[21px] font-semibold tracking-[-0.02em]" style={{ color: TEXT }}>
          热门推荐
        </h2>
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {loading && !hot.length
            ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="hjw-card h-[132px] animate-pulse rounded-[10px] border bg-white" style={{ borderColor: BORDER }} />)
            : hot.map((b) => <TextCard key={b.id} book={b} />)}
        </div>
      </section>

      {/* 分类排行榜 — 真站 .sort-section > .category-ranking-grid */}
      <section aria-label="分类排行榜">
        <h2 className="hjw-title mb-8 text-[21px] font-semibold tracking-[-0.02em]" style={{ color: TEXT }}>
          分类排行榜
        </h2>
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {loading && !books.length
            ? Array.from({ length: 2 }).map((_, i) => <div key={i} className="hjw-card h-[420px] animate-pulse rounded-[10px] border bg-white" style={{ borderColor: BORDER }} />)
            : rankingModules.map(({ cat, arr }) => (
                <RankModule key={cat} title={`${cat}榜`} books={arr} onBook={(id) => navigate({ view: 'book', bookId: id })} />
              ))}
        </div>
      </section>

      {/* 最新更新 — 真站 .update-section */}
      <section aria-label="最新更新">
        <h2 className="hjw-title mb-8 text-[21px] font-semibold tracking-[-0.02em]" style={{ color: TEXT }}>
          最新更新
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {loading && !updated.length
            ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="hjw-card h-[132px] animate-pulse rounded-[10px] border bg-white" style={{ borderColor: BORDER }} />)
            : updated.map((b) => <TextCard key={b.id} book={b} />)}
        </div>
      </section>
    </div>
  )
}
