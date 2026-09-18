// ============================================================
// [R39-2j] pili 克隆书页/目录/阅读 —— wmcms info/read 形态
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
import { PiliFooter } from './parts'

export function PiliBook({ data, loading, error }: SiteBookProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const latest = data?.latestChapters ?? []
  const [recs, setRecs] = useState<BookItem[]>([])

  useEffect(() => {
    let alive = true
    if (!book) return
    fetchBooks({ cat: book.categoryId || undefined, page: 1, size: 10, site: site.id })
      .then((d) => { if (alive) setRecs((d.books || []).filter((x) => x.id !== book.id).slice(0, 8)) })
      .catch(() => { if (alive) setRecs([]) })
    return () => { alive = false }
  }, [book?.id, book?.categoryId, site.id, book])

  const first = chapters[0]

  return (
    <div className="pli-book">
      <div className="pli-wrap">
        {loading || !book ? (
          <div className="pli-panel">{error ? <ErrorState message="书籍加载失败" detail={error} /> : <Sk style={{ height: 220 }} />}</div>
        ) : (
          <>
            <div className="pli-panel pli-book-head">
              <a className="pli-ani-img" href="#" onClick={(e) => e.preventDefault()} aria-label={book.name}>
                <BookCover cover={book.cover} name={book.name}  />
              </a>
              <div className="pli-ani-text">
                <h1 className="pli-book-title">{book.name}</h1>
                <div className="pli-ani-text1">
                  <a className="pli-ani-author" href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'search', q: book.author }) }}>{book.author}</a>
                  <span className="pli-book-badge">{statusLabel(book.status)}</span>
                  <span className="pli-book-badge pli-badge-orange">{book.category || '小说'}</span>
                  <span className="pli-book-badge">{formatWords(book.wordCount)}</span>
                </div>
                <p className="pli-book-intro">{book.intro || '暂无简介'}</p>
                <p className="pli-book-time">更新：{fmtDate(book.updatedAt)}</p>
                <div className="pli-btns">
                  <button className="pli-btn-orange" disabled={!first} onClick={() => first && navigate({ view: 'read', chapterId: first.id })}>开始阅读</button>
                  <button className="pli-btn-line" onClick={() => navigate({ view: 'toc', bookId: book.id })}>完整目录</button>
                </div>
              </div>
              <div className="pli-clear" />
            </div>
            <div className="pli-panel">
              <div className="pli-rank-head">最新章节</div>
              <ol className="pli-in-rank-list pli-in-panel">
                {latest.map((c) => (
                  <li key={c.id}>
                    <a className="pli-rank-name" href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}>{c.title}</a>
                  </li>
                ))}
              </ol>
              <div className="pli-rank-head">正文 · 前 20 章</div>
              <ol className="pli-in-rank-list pli-in-panel">
                {chapters.slice(0, 20).map((c) => (
                  <li key={c.id}>
                    <a className="pli-rank-name" href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}>{c.title}</a>
                  </li>
                ))}
              </ol>
              <p style={{ textAlign: 'center', margin: '12px 0' }}>
                <button className="pli-btn-orange" onClick={() => navigate({ view: 'toc', bookId: book.id })}>查看完整目录（共 {data?.tocTotal || chapters.length} 章）</button>
              </p>
            </div>
            <div className="pli-panel">
              <div className="pli-rank-head">相关推荐</div>
              <div className="pli-latest-grid">
                {recs.map((b) => (
                  <a key={b.id} className="pli-book-cell" href={viewToUrl({ view: 'book', bookId: b.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}>
                    <BookCover cover={b.cover} name={b.name}  />
                    <span className="pli-book-cell-name">{b.name}</span>
                  </a>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <PiliFooter />
    </div>
  )
}

export function PiliToc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const totalPages = data?.tocTotalPages || 1
  return (
    <div className="pli-toc">
      <div className="pli-wrap">
        <div className="pli-panel">
          <div className="pli-rank-head">{book ? `《${book.name}》完整目录` : '目录'}<small>（第 {page} / {totalPages} 页）</small></div>
          <div className="pli-panel-body">
            {loading ? (
              <div className="pli-chgrid">{Array.from({ length: 24 }).map((_, i) => <Sk key={i} style={{ height: 30 }} />)}</div>
            ) : error || !book ? (
              <ErrorState message="目录加载失败" detail={error} />
            ) : (
              <div className="pli-chgrid">
                {chapters.map((c) => (
                  <a key={c.id} className={c.id === currentChapterId ? 'is-active' : undefined} href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }} title={c.title}>{c.title}</a>
                ))}
              </div>
            )}
            <div className="pli-pager">
              <button disabled={page <= 1} onClick={() => book && navigate({ view: 'toc', bookId: book.id, page: page - 1 })}>上一页</button>
              <button onClick={() => book && navigate({ view: 'book', bookId: book.id })}>返回书页</button>
              <button disabled={page >= totalPages} onClick={() => book && navigate({ view: 'toc', bookId: book.id, page: page + 1 })}>下一页</button>
            </div>
          </div>
        </div>
      </div>
      <PiliFooter />
    </div>
  )
}

const FS_STEPS = [15, 17, 19, 21, 23]

export function PiliRead({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  const chapter = data?.chapter ?? null
  const book = data?.book ?? null
  const prev = data?.prev ?? null
  const next = data?.next ?? null
  // [R36-2a-fix] 主题覆盖字号基线+行距(pili 真站行距 1.75)
  const reader = useReaderFont()
  const lh = useThemeLineHeight(1.75)
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
    return <div className="pli-read"><div className="pli-wrap"><ErrorState message="章节内容加载失败" detail={error} /></div></div>
  }
  if (loading || !chapter || !book) {
    return (
      <div className="pli-read" role="status" aria-label="章节内容加载中">
        <div className="pli-wrap"><Sk style={{ height: 44 }} /><Sk style={{ height: 420, marginTop: 10 }} /></div>
        <span className="sr-only">加载中…</span>
      </div>
    )
  }
  const goto = (cid?: string) => { if (cid) navigate({ view: 'read', chapterId: cid }) }

  return (
    <div className="pli-read">
      <div className="pli-wrap">
        <div className="pli-text-set" role="group" aria-label="字号">
          <b>字号：</b>
          {FS_STEPS.map((n, i) => (
            <a key={n} href="#" className={fsIdx === i ? 'is-active' : ''} onClick={(e) => { e.preventDefault(); setFsIdx(i); reader.set(n) }}>{n}px</a>
          ))}
          <b>行距：</b>
          <a href="#" onClick={(e) => { e.preventDefault(); reader.inc() }}>加大</a>
          <a href="#" onClick={(e) => { e.preventDefault(); reader.dec() }}>减小</a>
        </div>
        <div className="pli-panel">
          <h1 className="pli-read-title">{chapter.title}</h1>
          <div className="pli-read-info">{book.name} · {book.author}</div>
          <div className="pli-readcontent" style={{ fontSize: reader.font, lineHeight: lh }}>
            <ChapterContent content={chapter.content} />
          </div>
          <div className="pli-pager">
            <button className="pli-btn-orange" disabled={!prev} onClick={() => goto(prev?.id)}>上一章</button>
            <button className="pli-btn-line" onClick={() => navigate({ view: 'book', bookId: book.id })}>书页</button>
            <button className="pli-btn-orange" disabled={!next} onClick={() => goto(next?.id)}>下一章</button>
          </div>
        </div>
      </div>
      <PiliFooter />
    </div>
  )
}
