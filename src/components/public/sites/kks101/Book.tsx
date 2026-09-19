// ============================================================
// [R39-2i] kks101 克隆书页/目录/阅读 —— 繁体现代风(bookbox 卡 + 目录格 + 阅读器)
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

export function Kks101Book({ data, loading, error }: SiteBookProps) {
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
    <div className="kks-book">
      <div className="kks-main">
        <div className="kks-container">
          {loading || !book ? (
            error ? <ErrorState message="書籍加載失敗" detail={error} /> : <Sk style={{ height: 220, borderRadius: 8 }} />
          ) : (
            <>
              <div className="kks-bookhead">
                <div className="kks-bookimg kks-bookimg-lg"><BookCover cover={book.cover} name={book.name}  /></div>
                <div className="kks-bookinfo">
                  <h1>{book.name}</h1>
                  <p className="kks-author">作者：{book.author} · {statusLabel(book.status)} · {formatWords(book.wordCount)}</p>
                  <p className="kks-meta"><span>{book.category || '小說'}</span><span>更新：{fmtDate(book.updatedAt)}</span></p>
                  <div className="kks-btns">
                    <button className="kks-btn-primary" disabled={!first} onClick={() => first && navigate({ view: 'read', chapterId: first.id })}>開始閱讀</button>
                    <button className="kks-btn" onClick={() => navigate({ view: 'toc', bookId: book.id })}>完整目錄</button>
                  </div>
                </div>
                <div className="kks-clear" />
              </div>
              <div className="kks-mybox kks-bookintro">{book.intro || '暫無簡介'}</div>
              <h3 className="kks-mytitle">最新章節</h3>
              <div className="kks-chgrid">
                {latest.map((c) => (
                  <a key={c.id} href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}>{c.title}</a>
                ))}
              </div>
              <h3 className="kks-mytitle kks-mytitle2">正文 · 前 24 章</h3>
              <div className="kks-chgrid">
                {chapters.slice(0, 24).map((c) => (
                  <a key={c.id} href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}>{c.title}</a>
                ))}
              </div>
              <p style={{ textAlign: 'center', margin: '14px 0' }}>
                <button className="kks-btn-primary" onClick={() => navigate({ view: 'toc', bookId: book.id })}>查看完整目錄（共 {data?.tocTotal || chapters.length} 章）</button>
              </p>
              <h3 className="kks-mytitle">猜您喜歡</h3>
              <div className="kks-mybox">
                {recs.map((b) => (
                  <div className="kks-bookbox" key={b.id}>
                    <a className="kks-bookimg" href={viewToUrl({ view: 'book', bookId: b.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}>
                      <BookCover cover={b.cover} name={b.name}  />
                    </a>
                    <div className="kks-bookinfo">
                      <h3><a href={viewToUrl({ view: 'book', bookId: b.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}>{b.name}</a></h3>
                      <p className="kks-author"><span>{b.author}</span></p>
                    </div>
                    <div className="kks-clear" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function Kks101Toc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const totalPages = data?.tocTotalPages || 1
  return (
    <div className="kks-toc">
      <div className="kks-main">
        <div className="kks-container">
          <h3 className="kks-mytitle">{book ? `《${book.name}》完整目錄` : '目錄'}<small>（第 {page} / {totalPages} 頁）</small></h3>
          {loading ? (
            <div className="kks-chgrid">{Array.from({ length: 24 }).map((_, i) => <Sk key={i} style={{ height: 30 }} />)}</div>
          ) : error || !book ? (
            <ErrorState message="目錄加載失敗" detail={error} />
          ) : (
            <div className="kks-chgrid">
              {chapters.map((c) => (
                <a key={c.id} className={c.id === currentChapterId ? 'is-active' : undefined} href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }} title={c.title}>{c.title}</a>
              ))}
            </div>
          )}
          <div className="kks-pager">
            <button disabled={page <= 1} onClick={() => book && navigate({ view: 'toc', bookId: book.id, page: page - 1 })}>上一頁</button>
            <button onClick={() => book && navigate({ view: 'book', bookId: book.id })}>返回書頁</button>
            <button disabled={page >= totalPages} onClick={() => book && navigate({ view: 'toc', bookId: book.id, page: page + 1 })}>下一頁</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const FS_STEPS = [15, 17, 19, 21, 23]

export function Kks101Read({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  const chapter = data?.chapter ?? null
  const book = data?.book ?? null
  const prev = data?.prev ?? null
  const next = data?.next ?? null
  // [R36-2a-fix] 主题覆盖字号基线+行距(kks101 真站行距 2)
  const reader = useReaderFont()
  const lh = useThemeLineHeight(2)
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
    return <div className="kks-read"><div className="kks-container"><ErrorState message="章節內容加載失敗" detail={error} /></div></div>
  }
  if (loading || !chapter || !book) {
    return (
      <div className="kks-read" role="status" aria-label="章節內容加載中">
        <div className="kks-container"><Sk style={{ height: 44 }} /><Sk style={{ height: 420, marginTop: 10 }} /></div>
        <span className="sr-only">加載中…</span>
      </div>
    )
  }
  const goto = (cid?: string) => { if (cid) navigate({ view: 'read', chapterId: cid }) }

  return (
    <div className="kks-read">
      <div className="kks-main">
        <div className="kks-container">
          <div className="kks-text-set" role="group" aria-label="字號">
            <b>字號：</b>
            {FS_STEPS.map((n, i) => (
              <a key={n} href="#" className={fsIdx === i ? 'is-active' : ''} onClick={(e) => { e.preventDefault(); setFsIdx(i); reader.set(n) }}>{n}px</a>
            ))}
            <b>行距：</b>
            <a href="#" onClick={(e) => { e.preventDefault(); reader.inc() }}>加大</a>
            <a href="#" onClick={(e) => { e.preventDefault(); reader.dec() }}>減小</a>
          </div>
          <h1 className="kks-read-title">{chapter.title}</h1>
          <div className="kks-read-info">{book.name} · {book.author}</div>
          <div className="kks-readcontent" style={{ fontSize: reader.font, lineHeight: lh }}>
            <ChapterContent content={chapter.content} />
          </div>
          <div className="kks-pager">
            <button className="kks-btn-primary" disabled={!prev} onClick={() => goto(prev?.id)}>上一章</button>
            <button className="kks-btn" onClick={() => navigate({ view: 'book', bookId: book.id })}>書頁</button>
            <button className="kks-btn-primary" disabled={!next} onClick={() => goto(next?.id)}>下一章</button>
          </div>
        </div>
      </div>
    </div>
  )
}
