// ============================================================
// [R39-2h] huangjinwu 克隆书页/目录/阅读 —— 现代卡片风(真站 /novel/{id} 形态)
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteBookProps, SiteTocProps, SiteReadProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { fetchBooks } from '../../data'
import { ChapterContent, useReaderFont, useRecordReading, useThemeLineHeight } from '../template-kit'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate, formatWords, statusLabel } from '../../seo'
import type { BookItem } from '../../types'
import { HjwFooter } from './parts'

export function HuangjinwuBook({ data, loading, error }: SiteBookProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const latest = data?.latestChapters ?? []
  const [recs, setRecs] = useState<BookItem[]>([])

  useEffect(() => {
    let alive = true
    if (!book) return
    fetchBooks({ cat: book.categoryId || undefined, page: 1, size: 6, site: site.id })
      .then((d) => { if (alive) setRecs((d.books || []).filter((x) => x.id !== book.id).slice(0, 6)) })
      .catch(() => { if (alive) setRecs([]) })
    return () => { alive = false }
  }, [book?.id, book?.categoryId, site.id, book])

  const first = chapters[0]

  return (
    <div className="hjw-main">
      <div className="hjw-container">
        <div className="hjw-section">
          {loading || !book ? (
            error ? <ErrorState message="书籍加载失败" detail={error} /> : <Sk style={{ height: 220, borderRadius: 10 }} />
          ) : (
            <>
              <div className="hjw-book-hero">
                <div className="hjw-book-hero-cover"><BookCover cover={book.cover} name={book.name}  /></div>
                <div className="hjw-book-hero-info">
                  <h1 className="hjw-book-hero-title">{book.name}</h1>
                  <div className="hjw-book-author">作者：{book.author}</div>
                  <div className="hjw-book-badges">
                    <span className="hjw-badge hjw-badge-category">{book.category || '小说'}</span>
                    <span className="hjw-badge hjw-badge-status">{statusLabel(book.status)}</span>
                    <span className="hjw-badge hjw-badge-words">{formatWords(book.wordCount)}</span>
                  </div>
                  <p className="hjw-book-hero-desc">{book.intro || '暂无简介'}</p>
                  <p className="hjw-book-time">更新：{fmtDate(book.updatedAt)}</p>
                  <div className="hjw-hero-actions">
                    <button className="hjw-btn-primary" disabled={!first} onClick={() => first && navigate({ view: 'read', chapterId: first.id })}>开始阅读</button>
                    <button className="hjw-btn" onClick={() => navigate({ view: 'toc', bookId: book.id })}>完整目录</button>
                  </div>
                </div>
              </div>
              <div className="hjw-clear" />
              <h2 className="hjw-page-title">最新章节</h2>
              <div className="hjw-chlist">
                {latest.map((c) => (
                  <a key={c.id} href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}>{c.title}</a>
                ))}
              </div>
              <h2 className="hjw-page-title">正文 · 前 24 章</h2>
              <div className="hjw-chlist">
                {chapters.slice(0, 24).map((c) => (
                  <a key={c.id} href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}>{c.title}</a>
                ))}
              </div>
              <p style={{ textAlign: 'center', margin: '16px 0' }}>
                <button className="hjw-btn-primary" onClick={() => navigate({ view: 'toc', bookId: book.id })}>查看完整目录（共 {data?.tocTotal || chapters.length} 章）</button>
              </p>
              <h2 className="hjw-page-title">猜您喜欢</h2>
              <div className="hjw-book-grid">
                {recs.map((b) => (
                  <a key={b.id} className="hjw-book-card" href={viewToUrl({ view: 'book', bookId: b.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}>
                    <div className="hjw-book-info">
                      <div className="hjw-book-title">{b.name}</div>
                      <div className="hjw-book-author">作者：{b.author}</div>
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <HjwFooter />
    </div>
  )
}

export function HuangjinwuToc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const totalPages = data?.tocTotalPages || 1
  return (
    <div className="hjw-main">
      <div className="hjw-container">
        <div className="hjw-section">
          <h2 className="hjw-page-title">{book ? `《${book.name}》完整目录` : '目录'}<small className="hjw-title-sub">（第 {page} / {totalPages} 页）</small></h2>
          {loading ? (
            <div className="hjw-chlist">{Array.from({ length: 24 }).map((_, i) => <Sk key={i} style={{ height: 30 }} />)}</div>
          ) : error || !book ? (
            <ErrorState message="目录加载失败" detail={error} />
          ) : (
            <div className="hjw-chlist">
              {chapters.map((c) => (
                <a key={c.id} className={c.id === currentChapterId ? 'is-active' : undefined} href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }} title={c.title}>{c.title}</a>
              ))}
            </div>
          )}
          <div className="hjw-pager">
            <button className="hjw-btn" disabled={page <= 1} onClick={() => book && navigate({ view: 'toc', bookId: book.id, page: page - 1 })}>上一页</button>
            <button className="hjw-btn" onClick={() => book && navigate({ view: 'book', bookId: book.id })}>返回书页</button>
            <button className="hjw-btn" disabled={page >= totalPages} onClick={() => book && navigate({ view: 'toc', bookId: book.id, page: page + 1 })}>下一页</button>
          </div>
        </div>
      </div>
      <HjwFooter />
    </div>
  )
}

const FS_STEPS = [15, 17, 19, 21, 23]

export function HuangjinwuRead({ data, loading, error }: SiteReadProps) {
  const { navigate, themeOverride } = usePublic()
  const chapter = data?.chapter ?? null
  const book = data?.book ?? null
  const prev = data?.prev ?? null
  const next = data?.next ?? null
  // [R36-2a-fix] 主题覆盖字号基线+行距(huangjinwu 真站行距 1.8)
  const reader = useReaderFont()
  const lh = useThemeLineHeight(1.8)
  const [fsIdx, setFsIdx] = useState(1)

  useRecordReading(book?.id, chapter?.id, chapter?.title)

  useEffect(() => {
    if (!book) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft' && prev) navigate({ view: 'read', chapterId: prev.id })
      if (e.key === 'ArrowRight' && next) navigate({ view: 'read', chapterId: next.id })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [book, prev, next, navigate])

  if (error) {
    return <div className="hjw-main"><div className="hjw-container"><ErrorState message="章节内容加载失败" detail={error} /></div></div>
  }
  if (loading || !chapter || !book) {
    return (
      <div className="hjw-main" role="status" aria-label="章节内容加载中">
        <div className="hjw-container"><Sk style={{ height: 48, borderRadius: 10 }} /><Sk style={{ height: 420, borderRadius: 10, marginTop: 10 }} /></div>
        <span className="sr-only">加载中…</span>
      </div>
    )
  }
  const goto = (cid?: string) => { if (cid) navigate({ view: 'read', chapterId: cid }) }

  return (
    <div className="hjw-main">
      <div className="hjw-container">
        <div className="hjw-read-card">
          <div className="hjw-text-set" role="group" aria-label="字号">
            <b>字号：</b>
            {FS_STEPS.map((n, i) => (
              <a key={n} href="#" className={fsIdx === i ? 'is-active' : ''} onClick={(e) => { e.preventDefault(); setFsIdx(i); reader.set(n) }}>{n}px</a>
            ))}
            <b>行距：</b>
            <a href="#" onClick={(e) => { e.preventDefault(); reader.inc() }}>加大</a>
            <a href="#" onClick={(e) => { e.preventDefault(); reader.dec() }}>减小</a>
          </div>
          <h1 className="hjw-read-title">{chapter.title}</h1>
          <div className="hjw-read-info">{book.name} · {book.author}</div>
          <div className="hjw-readcontent" style={{ fontSize: reader.font, lineHeight: lh }}>
            <ChapterContent content={chapter.content} />
          </div>
          <div className="hjw-pager">
            <button className="hjw-btn-primary" disabled={!prev} onClick={() => goto(prev?.id)}>上一章</button>
            <button className="hjw-btn" onClick={() => navigate({ view: 'book', bookId: book.id })}>书页</button>
            <button className="hjw-btn-primary" disabled={!next} onClick={() => goto(next?.id)}>下一章</button>
          </div>
        </div>
      </div>
      <HjwFooter />
      <span className="sr-only">{themeOverride ? '已应用主题阅读设置' : ''}</span>
    </div>
  )
}
