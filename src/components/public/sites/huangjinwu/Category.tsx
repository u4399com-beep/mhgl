// ============================================================
// [R28-2d-2] huangjinwu(黄金屋) 分类页(书库 /list)克隆 —— 真站直连实测 1:1
// 素材: /tmp/r28-2d/huangjinwu/hjw-list.html(2026-09-16 实抓)
//
// 真站 DOM:
//   h1.page-title「小说分类」
//   .filter-bar 白卡 > .filter-tags(3/5/10 列网格) > a.filter-tag(全部小说 active / 10 分类)
//   .class-section > h2.page-title「{分类名}列表」 + .book-grid(同首页文字卡) 
//   .pagination > .pagination-list: .page-info「1 / 1507」 + .page-link 下一页/末页
// 降级: 真站分类为固定 9 类(/list/1..9) → 数据面分类来自 fetchCategories()(声明);
//      真站分页无「首页/上一页」钮(page=1 时) → 本组件按真站 page>1 形态补齐。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchCategories } from '../../data'
import { EmptyState, ErrorState, bookNavProps } from '../../bits'
import { formatWords } from '../../seo'
import type { BookItem, CategoryItem } from '../../types'

/** [R28-2d-1] 真站色值(与 Home 同源, hjw-style.css) */
const SECONDARY = '#2563eb'
const TEXT = '#1e293b'
const TEXT_LIGHT = '#64748b'
const BORDER = '#dbe4f0'
const HOVER_BG = '#e8f1ff'
const SHADOW = '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37,99,235,0.06)'
/** [R28-2d-2] 骨架占位色(--border-color 40%) */
const BG_SKELETON = 'rgba(219,228,240,0.4)'

function statusText(s?: string | null): string {
  if (s === 'completed') return '全本'
  return '连载'
}

/** [R28-2d-2] .book-card 纯文字卡(真站列表页与首页同款) */
function TextCard({ book }: { book: BookItem }) {
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
          <span className="inline-block rounded-[10px] px-3 py-1 text-[12px] font-medium leading-[1.5] text-white" style={{ background: SECONDARY }}>
            {book.category || '小说'}
          </span>
          <span className="inline-block rounded-[10px] border px-3 py-1 text-[12px] font-medium leading-[1.5]" style={{ background: HOVER_BG, borderColor: BORDER, color: TEXT }}>
            {statusText(book.status)}
          </span>
          <span className="inline-block rounded-[10px] border px-3 py-1 text-[12px] font-medium leading-[1.5]" style={{ borderColor: BORDER, color: TEXT_LIGHT }}>
            {formatWords(book.wordCount)}
          </span>
        </div>
      </div>
    </article>
  )
}

export function HjwCategory({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()
  const [cats, setCats] = useState<CategoryItem[] | null>(null)

  // 分类 chip 源(真站为固定 9 类; 数据面动态分类列表)
  useEffect(() => {
    let alive = true
    fetchCategories()
      .then((list) => {
        if (alive) setCats(list || [])
      })
      .catch(() => {
        if (alive) setCats([])
      })
    return () => {
      alive = false
    }
  }, [])

  const totalPages = data && data.size > 0 ? Math.max(1, Math.ceil(data.total / data.size)) : 1
  const goPage = (p: number) => navigate({ view: 'category', cat, page: p })

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6">
      {/* h1 小说分类 — 真站 .page-title */}
      <h1 className="hjw-title mb-8 text-[21px] font-semibold tracking-[-0.02em]" style={{ color: TEXT }}>
        小说分类
      </h1>

      {/* .filter-bar 白卡 + .filter-tags 分类 chips */}
      <div className="hjw-card mb-8 rounded-[10px] bg-white p-4" style={{ boxShadow: SHADOW }}>
        <div className="hjw-chips grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-10">
          <button
            type="button"
            className={`hjw-chip rounded-[10px] px-3 py-2 text-[15px] transition-all duration-300 ${!cat ? 'hjw-chip-active' : ''}`}
            onClick={() => navigate({ view: 'category' })}
            aria-current={!cat}
          >
            全部小说
          </button>
          {(cats || []).map((c) => (
            <button
              key={c.id}
              type="button"
              className={`hjw-chip rounded-[10px] px-3 py-2 text-[15px] transition-all duration-300 ${cat === c.id ? 'hjw-chip-active' : ''}`}
              onClick={() => navigate({ view: 'category', cat: c.id, page: 1 })}
              aria-current={cat === c.id}
            >
              {c.name}
            </button>
          ))}
          {cats === null && Array.from({ length: 9 }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded-[10px]" style={{ background: BG_SKELETON }} />)}
        </div>
      </div>

      {/* .class-section: h2 {分类}列表 + book-grid */}
      <section aria-label={`${catName}列表`}>
        <h2 className="hjw-title mb-8 text-[21px] font-semibold tracking-[-0.02em]" style={{ color: TEXT }}>
          {catName}列表
        </h2>
        {error ? (
          <ErrorState message="分类列表加载失败" detail={error} />
        ) : loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="hjw-card h-[132px] animate-pulse rounded-[10px] border bg-white" style={{ borderColor: BORDER }} />
            ))}
          </div>
        ) : !data || !data.books.length ? (
          <EmptyState text="本分类暂无书籍" hint="换个分类或返回全部小说看看" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {data.books.map((b) => (
                <TextCard key={b.id} book={b} />
              ))}
            </div>

            {/* .pagination > .pagination-list: page-info + 下一页/末页(真站形态; page>1 补首页/上一页) */}
            <div className="flex flex-wrap items-center justify-center gap-3 py-4">
              {page > 1 && (
                <button type="button" className="hjw-pg rounded-[10px]" onClick={() => goPage(1)}>
                  首页
                </button>
              )}
              {page > 1 && (
                <button type="button" className="hjw-pg rounded-[10px]" onClick={() => goPage(page - 1)}>
                  上一页
                </button>
              )}
              {/* 真站 .page-info: 「1 / 1507」 */}
              <span className="min-w-[80px] px-4 text-center text-[14px]" style={{ color: TEXT }}>
                {page} / {totalPages}
              </span>
              {page < totalPages && (
                <button type="button" className="hjw-pg rounded-[10px]" onClick={() => goPage(page + 1)}>
                  下一页
                </button>
              )}
              {page < totalPages && (
                <button type="button" className="hjw-pg rounded-[10px]" onClick={() => goPage(totalPages)}>
                  末页
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
