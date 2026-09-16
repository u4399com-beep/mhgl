// ============================================================
// [R28-2d-5] huangjinwu(黄金屋) 章节页(/novel/{id}/{cid})克隆 —— 真站直连实测 1:1
// 素材: /tmp/r28-2d/huangjinwu/hjw-chapter.html(2026-09-16 实抓)
//
// 真站 DOM:
//   nav.breadcrumb(黄金屋 / 分类 / 书名 / 章节名 active)
//   .reader-header 白卡: .reader-title(书名链接 20px) + .reader-controls
//     (字体 range 1.4~3 / 行距 range 1.4~3, value 2/1.8)
//   .reader-content(#f8fafc 圆角卡): h1(24px 居中, 真站含 <small>(1/2) 分页序号) +
//     p(2em 缩进 / 0.2em 字距 / 两端对齐 / max-width 800px)
//   .reader-nav(max-width 800 三段): 上一章 | 目录+书签 | 下一页
//   .related-section: h2.section-title「同作者小说」 + book-grid
// 降级: ①真站章节内分页(1/2 + 下一页 → /2.html)无契约 → 下一钮固定为「下一章」(声明)
//      ②书签钮为登录态(javascript:;) → 省略(声明)
//      ③同作者小说无作者检索契约 → 优先站内搜索作者名, 空则同分类热榜(声明)
//      ④字号 range 契约 14~24px(真站 1.4~3rem=14~30px), 行距 range 1.4~3 与真站同
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteReadProps } from '../shared'
import { ChapterContent, useReaderFont, useRecordReading } from '../template-kit'
import { usePublic } from '../../ctx'
import { fetchBooks, fetchSearch } from '../../data'
import { ErrorState, bookNavProps } from '../../bits'
import type { BookItem } from '../../types'

/** [R28-2d-1] 真站色值(hjw-style.css :root) */
const TEXT = '#1e293b'
const TEXT_LIGHT = '#64748b'
const BORDER = '#dbe4f0'
const READER_BG = '#f8fafc' // --reader-bg
const READER_BORDER = '#d8e3f0' // --reader-border
const SHADOW = '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37,99,235,0.06)'

/** 键盘事件是否来自输入控件(通用壳同款守卫) */
function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}

export function HuangjinwuRead({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  const { font, set: setFont } = useReaderFont(14, 24)
  const [lineHeight, setLineHeight] = useState(1.8)
  const [related, setRelated] = useState<BookItem[] | null>(null)

  const chapter = data?.chapter || null
  const book = data?.book || null

  useRecordReading(book?.id, chapter?.id, chapter?.title)

  // 键盘 ←/→ 翻章(真站正文提示「←→」翻页)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      if (e.key === 'ArrowLeft' && data?.prev) navigate({ view: 'read', bookId: data.book.id, chapterId: data.prev.id })
      if (e.key === 'ArrowRight' && data?.next) navigate({ view: 'read', bookId: data.book.id, chapterId: data.next.id })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data, navigate])

  // 同作者小说(真站 related-section; 契约无作者检索 → fetchSearch(author) 近似, 空则同分类热榜)
  // [R28-fix] 同作者推荐重置改渲染期同步(修 set-state-in-effect)
  const bookId = book?.id || ''
  const [prevBookId, setPrevBookId] = useState(bookId)
  if (prevBookId !== bookId) {
    setPrevBookId(bookId)
    setRelated(null)
  }
  useEffect(() => {
    if (!book) return
    let alive = true
    fetchSearch(book.author)
      .then((d) => {
        if (!alive) return
        const hits = (d.books || []).filter((b) => b.id !== book.id).slice(0, 6)
        if (hits.length) {
          setRelated(hits)
          return
        }
        return fetchBooks({ page: 1, size: 6 })
          .then((dd) => {
            if (alive) setRelated((dd.books || []).filter((b) => b.id !== book.id).slice(0, 6))
          })
          .catch(() => {
            if (alive) setRelated([])
          })
      })
      .catch(() => {
        if (!alive) return
        fetchBooks({ page: 1, size: 6 })
          .then((dd) => {
            if (alive) setRelated((dd.books || []).filter((b) => b.id !== book.id).slice(0, 6))
          })
          .catch(() => {
            if (alive) setRelated([])
          })
      })
    return () => {
      alive = false
    }
  }, [book])

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6">
        <ErrorState message="章节加载失败" detail={error} />
      </div>
    )
  }
  if (loading || !chapter || !book) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6">
        <div className="hjw-card mb-4 flex items-center justify-between rounded-[10px] border bg-white p-4" style={{ borderColor: BORDER, boxShadow: SHADOW }}>
          <div className="h-6 w-40 animate-pulse rounded" style={{ background: 'rgba(219,228,240,0.4)' }} />
          <div className="h-8 w-56 animate-pulse rounded" style={{ background: 'rgba(219,228,240,0.4)' }} />
        </div>
        <div className="rounded-[10px] border p-8" style={{ borderColor: READER_BORDER, background: READER_BG, boxShadow: SHADOW }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="mx-auto mb-4 h-4 animate-pulse rounded" style={{ background: 'rgba(219,228,240,0.4)', width: `${92 - (i % 4) * 8}%` }} />
          ))}
        </div>
      </div>
    )
  }

  const navBtn = 'hjw-btn hjw-btn-primary min-w-[104px] flex-1 rounded-[10px] px-4 py-3 text-[15px] font-medium sm:flex-none'

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6">
      {/* 面包屑(黄金屋 / 书名 / 章节名) */}
      <nav className="mb-6 truncate text-[15px]" style={{ color: TEXT_LIGHT }} aria-label="面包屑导航">
        <button type="button" className="transition-colors hover:text-[#2563eb]" style={{ color: TEXT_LIGHT }} onClick={() => navigate({ view: 'home' })}>
          黄金屋
        </button>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <button type="button" className="transition-colors hover:text-[#2563eb]" style={{ color: TEXT_LIGHT }} onClick={() => navigate({ view: 'book', bookId: book.id })}>
          {book.name}
        </button>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span aria-current="page">{chapter.title}</span>
      </nav>

      {/* .reader-header: 书名 + 字体/行距 range */}
      <div className="hjw-card mb-4 flex flex-wrap items-center justify-between gap-4 rounded-[10px] bg-white p-4" style={{ boxShadow: SHADOW }}>
        <button type="button" className="hjw-reader-title min-w-[200px] flex-1 truncate text-left text-[20px] font-semibold" style={{ color: TEXT }} onClick={() => navigate({ view: 'book', bookId: book.id })}>
          {book.name}
        </button>
        <div className="hjw-controls flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[14px]" style={{ color: TEXT_LIGHT }}>
            字体：
            <input type="range" min={14} max={24} step={1} value={font} onChange={(e) => setFont(Number(e.target.value))} className="hjw-range w-28 accent-[#2563eb]" aria-label="字体大小" />
          </label>
          <label className="flex items-center gap-2 text-[14px]" style={{ color: TEXT_LIGHT }}>
            行距：
            <input
              type="range"
              min={1.4}
              max={3}
              step={0.2}
              value={lineHeight}
              onChange={(e) => setLineHeight(Number(e.target.value))}
              className="hjw-range w-28 accent-[#2563eb]"
              aria-label="行距"
            />
          </label>
        </div>
      </div>

      {/* .reader-content 纸面 */}
      <div className="hjw-reader mb-8 rounded-[10px] border p-8" style={{ background: READER_BG, borderColor: READER_BORDER, color: TEXT, boxShadow: SHADOW }}>
        <h1 className="mx-auto mb-12 mt-4 flex max-w-[900px] items-center justify-center text-[24px] font-semibold" style={{ color: TEXT }}>
          {chapter.title}
        </h1>
        <ChapterContent
          content={chapter.content}
          className="hjw-content"
          style={{ fontSize: font, lineHeight, color: TEXT }}
        />
      </div>

      {/* .reader-nav 三段: 上一章 | 目录 | 下一章 */}
      <div className="mx-auto mb-8 flex max-w-[800px] items-center justify-between gap-4">
        <button type="button" disabled={!data?.prev} className={navBtn} style={data?.prev ? undefined : { opacity: 0.5, cursor: 'not-allowed' }} onClick={() => data?.prev && navigate({ view: 'read', bookId: book.id, chapterId: data.prev.id })}>
          上一章
        </button>
        <button type="button" className={navBtn} onClick={() => navigate({ view: 'book', bookId: book.id })}>
          目录
        </button>
        <button type="button" disabled={!data?.next} className={navBtn} style={data?.next ? undefined : { opacity: 0.5, cursor: 'not-allowed' }} onClick={() => data?.next && navigate({ view: 'read', bookId: book.id, chapterId: data.next.id })}>
          下一章
        </button>
      </div>

      {/* related-section 同作者小说(降级声明见头注) */}
      {related && related.length > 0 && (
        <section aria-label="同作者小说">
          <h2 className="hjw-sectitle mb-6 text-[20px] font-semibold" style={{ color: TEXT }}>
            同作者小说
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((b) => (
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
                  <div className="truncate text-[14px]" style={{ color: TEXT_LIGHT }}>
                    作者：{b.author}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
