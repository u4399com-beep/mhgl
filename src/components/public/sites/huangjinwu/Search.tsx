// ============================================================
// [R28-2d-7] huangjinwu(黄金屋) 搜索结果页(/search)克隆 —— 真站直连实测 1:1
// 素材: /tmp/r28-2d/huangjinwu/hjw-search-cs.html(keyword=长生, 2026-09-16 实抓)
//
// 真站 DOM:
//   nav.breadcrumb(黄金屋 / 搜索结果)
//   .search-form 白卡 > form.search-form-inline: input.search-input(1.5px 边, focus 蓝环) +
//     button.btn-primary「搜索」
//   h1.page-title「搜索结果」
//   .search-result-info(浅蓝底圆角): 搜索"<strong>长生</strong>"，共找到368条相关结果
//   .book-section > .book-grid(同首页文字卡)
//   .pagination(.page-info + .page-link 下一页)
// 降级: ①真站结果计数为站内全量总数(368) → SearchData 无 total, 显示当前返回条数(声明)
//      ②真站结果分页(/search/{kw}/{page}.html) → SearchData 单次返回无分页契约, 不渲染(声明)
//      ③真站关键词校验(2~10 中文)由后端契约承担, 前端不复制校验文案
// ============================================================
'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import type { SiteSearchProps } from '../shared'
import { usePublic } from '../../ctx'
import { EmptyState, ErrorState, bookNavProps } from '../../bits'
import { formatWords } from '../../seo'

/** [R28-2d-1] 真站色值(hjw-style.css :root) */
const SECONDARY = '#2563eb'
const TEXT = '#1e293b'
const TEXT_LIGHT = '#64748b'
const BORDER = '#dbe4f0'
const HOVER_BG = '#e8f1ff'
const SHADOW = '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37,99,235,0.06)'

function statusText(s?: string | null): string {
  if (s === 'completed') return '全本'
  return '连载'
}

export function HjwSearch({ q, data, loading, error }: SiteSearchProps) {
  const { navigate } = usePublic()
  const [input, setInput] = useState(q)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    navigate({ view: 'search', q: input.trim() })
  }

  const books = data?.books || []

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6">
      {/* 面包屑 */}
      <nav className="mb-6 truncate text-[15px]" style={{ color: TEXT_LIGHT }} aria-label="面包屑导航">
        <button type="button" className="transition-colors hover:text-[#2563eb]" style={{ color: TEXT_LIGHT }} onClick={() => navigate({ view: 'home' })}>
          黄金屋
        </button>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span aria-current="page">搜索结果</span>
      </nav>

      {/* .search-form 白卡 */}
      <div className="hjw-card mb-8 rounded-[10px] border bg-white p-6" style={{ borderColor: BORDER, boxShadow: SHADOW }}>
        <form className="flex flex-col gap-4 sm:flex-row sm:items-stretch" role="search" onSubmit={onSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="可搜书名、作者、角色"
            className="hjw-search-input min-w-0 flex-1 rounded-[10px] px-4 py-3 text-[15px] outline-none"
            style={{ border: `1.5px solid ${BORDER}`, color: TEXT }}
            aria-label="搜索关键词"
          />
          <button type="submit" className="hjw-btn hjw-btn-primary whitespace-nowrap rounded-[10px] px-8 py-3 text-[16px] font-medium">
            搜索
          </button>
        </form>
      </div>

      {/* h1 搜索结果 */}
      <h1 className="hjw-title mb-8 text-[21px] font-semibold tracking-[-0.02em]" style={{ color: TEXT }}>
        搜索结果
      </h1>

      {/* .search-result-info(真站为全量计数 → 当前返回条数, 声明) */}
      {!loading && data && (
        <div className="mb-6 rounded-[10px] px-8 py-4 text-[15px]" style={{ background: HOVER_BG, color: TEXT }}>
          搜索&quot;<strong style={{ color: SECONDARY, fontWeight: 600 }}>{q}</strong>&quot;，共找到{books.length}条相关结果
        </div>
      )}

      {error ? (
        <ErrorState message="搜索失败" detail={error} />
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="hjw-card h-[132px] animate-pulse rounded-[10px] border bg-white" style={{ borderColor: BORDER }} />
          ))}
        </div>
      ) : books.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {books.map((b) => (
            <article
              key={b.id}
              {...bookNavProps(navigate, b.id)}
              className="hjw-card block cursor-pointer overflow-hidden rounded-[10px] border bg-white transition-all duration-300"
              style={{ borderColor: 'rgba(219,228,240,0.85)', boxShadow: SHADOW, color: TEXT }}
            >
              <div className="p-4">
                <div className="hjw-card-title mb-2 truncate text-[16px] font-medium" style={{ color: TEXT }}>
                  {b.name}
                </div>
                <div className="mb-2 truncate text-[14px]" style={{ color: TEXT_LIGHT }}>
                  作者：{b.author}
                </div>
                <div className="mb-3 line-clamp-2 min-h-[2.55em] text-[14px] leading-[1.5]" style={{ color: TEXT_LIGHT }}>
                  {b.intro || `${b.category} · ${formatWords(b.wordCount)}`}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-block rounded-[10px] px-3 py-1 text-[12px] font-medium leading-[1.5] text-white" style={{ background: SECONDARY }}>
                    {b.category || '小说'}
                  </span>
                  <span className="inline-block rounded-[10px] border px-3 py-1 text-[12px] font-medium leading-[1.5]" style={{ background: HOVER_BG, borderColor: BORDER, color: TEXT }}>
                    {statusText(b.status)}
                  </span>
                  <span className="inline-block rounded-[10px] border px-3 py-1 text-[12px] font-medium leading-[1.5]" style={{ borderColor: BORDER, color: TEXT_LIGHT }}>
                    {formatWords(b.wordCount)}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        // .search-empty 空态卡(真站形态: 白卡居中 1.8rem 文案)
        <div className="hjw-card rounded-[10px] px-6 py-12 text-center" style={{ border: `1px solid ${BORDER}`, boxShadow: SHADOW, color: TEXT_LIGHT }}>
          <EmptyState text={`没有找到与「${q}」相关的书籍`} hint="换个关键词试试（可搜书名、作者、角色）" />
        </div>
      )}
    </div>
  )
}
