// ============================================================
// [R39-2g] qb23 克隆目录/阅读页 —— mxone 目录网格 + 阅读页(暗顶工具条+白正文)
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteTocProps, SiteReadProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ChapterContent, useReaderFont, useRecordReading, useThemeLineHeight } from '../template-kit'
import { ErrorState, Sk } from '../../bits'

export function Qb23Toc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const totalPages = data?.tocTotalPages || 1
  return (
    <main className="qb-wrapper">
      <div className="qb-content">
        <div className="qb-list">
          <div className="qb-box">
            <div className="qb-blocktitle">{book ? `《${book.name}》完整目录` : '目录'}<small>（第 {page} / {totalPages} 页）</small></div>
            {loading ? (
              <div className="qb-chgrid">{Array.from({ length: 24 }).map((_, i) => <Sk key={i} style={{ height: 32 }} />)}</div>
            ) : error || !book ? (
              <ErrorState message="目录加载失败" detail={error} />
            ) : (
              <div className="qb-chgrid">
                {chapters.map((c) => (
                  <a
                    key={c.id}
                    className={c.id === currentChapterId ? 'is-active' : undefined}
                    href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)}
                    onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}
                    title={c.title}
                  >{c.title}</a>
                ))}
              </div>
            )}
            <div className="qb-pager">
              <button className="qb-btn" disabled={page <= 1} onClick={() => book && navigate({ view: 'toc', bookId: book.id, page: page - 1 })}>上一页</button>
              <button className="qb-btn" onClick={() => book && navigate({ view: 'book', bookId: book.id })}>返回书页</button>
              <button className="qb-btn" disabled={page >= totalPages} onClick={() => book && navigate({ view: 'toc', bookId: book.id, page: page + 1 })}>下一页</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

const FS_STEPS = [15, 17, 19, 21, 23]

export function Qb23Read({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  const chapter = data?.chapter ?? null
  const book = data?.book ?? null
  const prev = data?.prev ?? null
  const next = data?.next ?? null
  // [R36-2a-fix] 主题覆盖字号基线+行距(未编辑=17/1.9 零回归)
  const reader = useReaderFont()
  const lh = useThemeLineHeight(1.9)
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
    return <main className="qb-wrapper"><div className="qb-content"><ErrorState message="章节内容加载失败" detail={error} /></div></main>
  }
  if (loading || !chapter || !book) {
    return (
      <main className="qb-wrapper" role="status" aria-label="章节内容加载中">
        <div className="qb-content"><Sk style={{ height: 48 }} /><Sk style={{ height: 420, marginTop: 10 }} /></div>
        <span className="sr-only">加载中…</span>
      </main>
    )
  }
  const goto = (cid?: string) => { if (cid) navigate({ view: 'read', chapterId: cid }) }

  return (
    <main className="qb-wrapper">
      <div className="qb-content">
        <div className="qb-list">
          <div className="qb-box qb-read-box">
            <div className="qb-text-set" role="group" aria-label="字号">
              <b>字号：</b>
              {FS_STEPS.map((n, i) => (
                <a key={n} href="#" className={fsIdx === i ? 'is-active' : ''} onClick={(e) => { e.preventDefault(); setFsIdx(i); reader.set(n) }}>{n}px</a>
              ))}
              <b>行距：</b>
              <a href="#" onClick={(e) => { e.preventDefault(); reader.inc() }}>加大</a>
              <a href="#" onClick={(e) => { e.preventDefault(); reader.dec() }}>减小</a>
            </div>
            <h1 className="qb-read-title">{chapter.title}</h1>
            <div className="qb-read-info">{book.name} · {book.author}</div>
            <div className="qb-readcontent" style={{ fontSize: reader.font, lineHeight: lh }}>
              <ChapterContent content={chapter.content} />
            </div>
            <div className="qb-pager">
              <button className="qb-btn-primary" disabled={!prev} onClick={() => goto(prev?.id)}>上一章</button>
              <button className="qb-btn" onClick={() => navigate({ view: 'book', bookId: book.id })}>书页</button>
              <button className="qb-btn-primary" disabled={!next} onClick={() => goto(next?.id)}>下一章</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
