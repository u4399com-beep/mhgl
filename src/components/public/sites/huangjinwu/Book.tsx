// ============================================================
// [R28-2d-3] huangjinwu(黄金屋) 书页(/novel/{id})克隆 —— 真站直连实测 1:1
// 素材: /tmp/r28-2d/huangjinwu/hjw-novel_262.html(2026-09-16 实抓)
//
// 真站 DOM:
//   nav.breadcrumb > ol.breadcrumb-list(黄金屋 / 分类 / 书名 active)
//   .detail-header 白卡: .detail-cover-wrapper(img 180×250, onerror nocover) +
//     .detail-info: h1.detail-title(32px) + .detail-meta(浅蓝底圆角条: 作者/分类/状态/字数/人气/推荐/
//       更新时间, span 竖线分隔 + :before 8px 蓝点) + .detail-actions(btn-primary 开始阅读 /
//       btn-secondary 收藏/推荐)
//   .detail-section 作品简介: .detail-section-title + .detail-description(7.2em 折叠+展开钮)
//   .detail-section 最新章节: ul.chapter-list(auto-fill 250px 网格卡)
//   .detail-section 章节目录(共N章): 同款网格 + .pagination
//   相关小说 section(.section-title + book-grid)
// 降级: ①真站 detail-meta 的人气/推荐两项无数据契约 → 省略(声明)
//      ②真站 收藏/推荐按钮为登录态(javascript:;) → 契约内以 TXT 下载(唯一允许 <a>)与
//        章节目录钮替代
//      ③真站「相关小说」为站方推荐位 → 同分类小说 fetchBooks 替代(空则不渲染)
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import { EmptyState, ErrorState, bookNavProps } from '../../bits'
import { formatWords, statusLabel } from '../../seo'
import type { BookItem, TocChapter } from '../../types'

/** [R28-2d-1] 真站色值(hjw-style.css :root) */
const SECONDARY = '#2563eb'
const TEXT = '#1e293b'
const TEXT_LIGHT = '#64748b'
const BORDER = '#dbe4f0'
const META_BG = 'rgba(37,99,235,0.06)' // color-mix(in srgb,--secondary 6%,--card) 实测换算
const SHADOW = '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37,99,235,0.06)'

/** [R28-2d-3] .chapter-item 网格卡(真站 auto-fill minmax(250px,1fr)) */
export function ChapterItem({ ch, bookId, current }: { ch: TocChapter; bookId: string; current?: boolean }) {
  const { navigate } = usePublic()
  const go = () => navigate({ view: 'read', bookId, chapterId: ch.id })
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          go()
        }
      }}
      className={`hjw-chitem cursor-pointer overflow-hidden rounded-[10px] border transition-all duration-300 ${current ? 'hjw-chitem-active' : ''}`}
      style={{ borderColor: current ? SECONDARY : BORDER, background: current ? '#e8f1ff' : undefined }}
      aria-current={current}
    >
      <div className="block truncate px-4 py-3 text-[15px]" style={{ color: current ? SECONDARY : TEXT }} title={ch.title}>
        {ch.title}
      </div>
    </div>
  )
}

export function HjwBook({ data, loading, error, tocPage, currentChapterId }: SiteBookProps) {
  const { site, navigate } = usePublic()
  const [related, setRelated] = useState<BookItem[] | null>(null)
  const [introOpen, setIntroOpen] = useState(false)

  const book = data?.book || null
  const chapters = useMemo(() => data?.chapters || [], [data])

  // 相关小说: 同分类 6 本(真站站方推荐位 → 同分类替代, 声明)
  const relCatId = book?.categoryId || undefined
  const relCat = book?.category
  const relBookId = book?.id
  // [R28-fix] 相关书重置改渲染期同步(修 set-state-in-effect): 无分类时直接空数组
  const relKey = `${relCatId || ''}|${relCat || ''}|${relBookId || ''}`
  const [prevRelKey, setPrevRelKey] = useState(relKey)
  if (prevRelKey !== relKey) {
    setPrevRelKey(relKey)
    setRelated(relCatId || relCat ? null : [])
  }
  useEffect(() => {
    if (!relCatId && !relCat) return
    let alive = true
    fetchBooks({ site: site.id, cat: relCatId, page: 1, size: 6 })
      .then((d) => {
        if (alive) setRelated((d.books || []).filter((b) => b.id !== relBookId).slice(0, 6))
      })
      .catch(() => {
        if (alive) setRelated([])
      })
    return () => {
      alive = false
    }
  }, [site.id, relCatId, relCat, relBookId])

  // 最新章节: 当前目录页尾部 12 条倒序(真站为站方最新 12 条; 多页书第 1 页≈最早, 声明)
  const latest = useMemo(() => chapters.slice(-12).reverse(), [chapters])

  // 简介折叠(真站 .detail-intro-content max-height 7.2em + .intro-toggle-btn)
  const longIntro = (book?.intro || '').length > 120

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6">
        <ErrorState message="书籍详情加载失败" detail={error} />
      </div>
    )
  }
  if (loading || !book) {
    return (
      <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6">
        <div className="hjw-card flex flex-col gap-6 rounded-[10px] border bg-white p-6 sm:flex-row" style={{ borderColor: BORDER, boxShadow: SHADOW }}>
          <div className="h-[250px] w-[180px] shrink-0 animate-pulse rounded-[10px]" style={{ background: META_BG }} />
          <div className="flex-1 space-y-4 py-2">
            <div className="h-8 w-2/3 animate-pulse rounded" style={{ background: META_BG }} />
            <div className="h-16 w-full animate-pulse rounded-[10px]" style={{ background: META_BG }} />
            <div className="h-12 w-1/2 animate-pulse rounded" style={{ background: META_BG }} />
          </div>
        </div>
      </div>
    )
  }

  const firstChapter = chapters[0]?.id
  const totalPages = data ? Math.max(1, data.tocTotalPages) : 1

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6">
      {/* 面包屑 — 真站 nav.breadcrumb(黄金屋 / 分类 / 书名) */}
      <nav className="mb-6 truncate text-[15px]" style={{ color: TEXT_LIGHT }} aria-label="面包屑导航">
        <button type="button" className="transition-colors hover:text-[#2563eb]" style={{ color: TEXT_LIGHT }} onClick={() => navigate({ view: 'home' })}>
          黄金屋
        </button>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <button type="button" className="transition-colors hover:text-[#2563eb]" style={{ color: TEXT_LIGHT }} onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined })}>
          {book.category || '小说'}
        </button>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span aria-current="page">{book.name}</span>
      </nav>

      {/* .detail-header 白卡 */}
      <div className="hjw-card mb-6 flex flex-col items-center gap-6 rounded-[10px] border bg-white p-6 sm:flex-row sm:items-start" style={{ borderColor: BORDER, boxShadow: SHADOW }}>
        {/* .detail-cover 180×250 */}
        <div className="shrink-0">
          <div className="hjw-cover h-[250px] w-[180px] overflow-hidden rounded-[10px] border" style={{ borderColor: BORDER, background: SECONDARY, boxShadow: SHADOW }}>
            {book.cover ? (
              <img src={book.cover} alt={book.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-4 text-center text-[18px] font-semibold text-white/90">{book.name}</div>
            )}
          </div>
        </div>
        <div className="w-full min-w-0 flex-1">
          {/* h1.detail-title 32px */}
          <h1 className="mb-5 text-left text-[24px] font-semibold leading-[1.3] tracking-[-0.01em] sm:text-[32px]" style={{ color: TEXT }}>
            {book.name}
          </h1>
          {/* .detail-meta 圆角条(竖线分隔 + 蓝点, ≥768 由 css 串补竖线) */}
          <div className="hjw-meta flex flex-wrap gap-y-2 rounded-[10px] border p-4 text-[15px] sm:gap-8 sm:px-8" style={{ background: META_BG, borderColor: BORDER, color: TEXT_LIGHT }}>
            <span className="hjw-meta-item flex items-center">
              <i className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: SECONDARY }} aria-hidden />
              作者：{book.author}
            </span>
            <span className="hjw-meta-item flex items-center">
              <i className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: SECONDARY }} aria-hidden />
              分类：{book.category || '小说'}
            </span>
            <span className="hjw-meta-item flex items-center">
              <i className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: SECONDARY }} aria-hidden />
              状态：{statusLabel(book.status)}
            </span>
            <span className="hjw-meta-item flex items-center">
              <i className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: SECONDARY }} aria-hidden />
              字数：{formatWords(book.wordCount)}
            </span>
            <span className="hjw-meta-item flex items-center">
              <i className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: SECONDARY }} aria-hidden />
              更新时间：{book.updatedAt ? book.updatedAt.slice(0, 16).replace('T', ' ') : '—'}
            </span>
          </div>
          {/* .detail-actions: 开始阅读(主) / 章节目录 / TXT 下载(次) */}
          <div className="hjw-book-actions mt-6 flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={!firstChapter}
              className="hjw-btn-primary hjw-btn min-w-[128px] rounded-[10px] px-6 py-3 text-[16px] font-medium"
              onClick={() => firstChapter && navigate({ view: 'read', bookId: book.id, chapterId: firstChapter })}
            >
              开始阅读
            </button>
            <button type="button" className="hjw-btn-secondary hjw-btn min-w-[128px] rounded-[10px] border bg-white px-6 py-3 text-[16px] font-medium" onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}>
              章节目录
            </button>
            {/* 唯一允许 <a>: TXT 下载(真站下载位等价物) */}
            <a className="hjw-btn-secondary hjw-btn min-w-[128px] rounded-[10px] border bg-white px-6 py-3 text-[16px] font-medium" href={`/api/public/download?book=${book.id}`}>
              TXT 下载
            </a>
          </div>
        </div>
      </div>

      {/* 作品简介 — .detail-section(7.2em 折叠 + 展开钮) */}
      <section className="mb-4" aria-label="作品简介">
        <h2 className="hjw-sectitle mb-8 text-[20px] font-semibold" style={{ color: TEXT }}>
          作品简介
        </h2>
        <div className="text-[15px] leading-[1.8]" style={{ color: TEXT_LIGHT }}>
          <div
            className={introOpen ? '' : 'hjw-intro'}
            style={introOpen ? undefined : { maxHeight: '7.2em', overflow: 'hidden' }}
          >
            {book.intro ? book.intro.split(/\n+/).filter(Boolean).map((p, i) => <p key={i} className="mb-3">{p}</p>) : <p>暂无简介</p>}
          </div>
          {longIntro && (
            <button type="button" className="hjw-introbtn mt-1 inline-flex items-center gap-1.5 text-[14px] font-medium" style={{ color: SECONDARY }} onClick={() => setIntroOpen((v) => !v)}>
              {introOpen ? '收起' : '展开'}
              <span aria-hidden className="inline-block text-[12px] transition-transform duration-300" style={{ transform: introOpen ? 'rotate(180deg)' : undefined }}>
                ▼
              </span>
            </button>
          )}
        </div>
      </section>

      {/* 最新章节 — .detail-section */}
      <section className="mb-4" aria-label="最新章节">
        <h2 className="hjw-sectitle mb-8 text-[20px] font-semibold" style={{ color: TEXT }}>
          最新章节
        </h2>
        <ul className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {latest.map((ch) => (
            <li key={ch.id}>
              <ChapterItem ch={ch} bookId={book.id} />
            </li>
          ))}
        </ul>
      </section>

      {/* 章节目录(共N章) + 分页 — .detail-section */}
      <section className="mb-4" aria-label="章节目录">
        <h2 className="hjw-sectitle mb-8 text-[20px] font-semibold" style={{ color: TEXT }}>
          章节目录
          <small className="ml-2 text-[14px] font-normal" style={{ color: TEXT_LIGHT }}>
            共{data?.tocTotal ?? 0}章
          </small>
        </h2>
        {!chapters.length ? (
          <EmptyState text="暂无章节" hint="本书尚未收录章节" />
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {chapters.map((ch) => (
              <li key={ch.id}>
                <ChapterItem ch={ch} bookId={book.id} current={ch.id === currentChapterId} />
              </li>
            ))}
          </ul>
        )}
        {/* 真站 .pagination-list(page-info + 下一页/末页; page>1 补首页/上一页) */}
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-3 py-4">
            {tocPage > 1 && (
              <>
                <button type="button" className="hjw-pg rounded-[10px]" onClick={() => navigate({ view: 'book', bookId: book.id, page: 1 })}>
                  首页
                </button>
                <button type="button" className="hjw-pg rounded-[10px]" onClick={() => navigate({ view: 'book', bookId: book.id, page: tocPage - 1 })}>
                  上一页
                </button>
              </>
            )}
            <span className="min-w-[80px] px-4 text-center text-[14px]" style={{ color: TEXT }}>
              {tocPage} / {totalPages}
            </span>
            {tocPage < totalPages && (
              <>
                <button type="button" className="hjw-pg rounded-[10px]" onClick={() => navigate({ view: 'book', bookId: book.id, page: tocPage + 1 })}>
                  下一页
                </button>
                <button type="button" className="hjw-pg rounded-[10px]" onClick={() => navigate({ view: 'book', bookId: book.id, page: totalPages })}>
                  末页
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {/* 相关小说(真站站方推荐位 → 同分类替代, 声明) */}
      {related && related.length > 0 && (
        <section aria-label="相关小说">
          <h2 className="hjw-sectitle mb-8 text-[20px] font-semibold" style={{ color: TEXT }}>
            相关小说
          </h2>
          <RelatedGrid books={related} />
        </section>
      )}
    </div>
  )
}

/** [R28-2d-3] 相关小说行式卡(bookNavProps 键盘可达) */
function RelatedGrid({ books }: { books: BookItem[] }) {
  const { navigate } = usePublic()
  return (
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
            <div className="line-clamp-2 min-h-[2.55em] text-[14px] leading-[1.5]" style={{ color: TEXT_LIGHT }}>
              {b.intro || formatWords(b.wordCount)}
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
