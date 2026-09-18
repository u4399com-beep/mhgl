// ============================================================
// [R39-2e] ggd66 克隆目录/阅读页 —— 快照 chapter.html(面包屑+.book.read#acontent+h1.pt10+readcontent)
//   阅读页真站形态: .readcontent#rtext > p 段落 + 章尾翻页
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteTocProps, SiteReadProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ChapterContent, useReaderFont, useRecordReading, useThemeLineHeight } from '../template-kit'
import { ErrorState, Sk } from '../../bits'
import { GgdCrumbs, GgdFooter } from './parts'

export function Ggd66Toc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const totalPages = data?.tocTotalPages || 1
  return (
    <div className="ggd-toc">
      <div className="ggd-container">
        <GgdCrumbs bookName={book ? `${book.name} 目录` : '目录'} />
        <div className="ggd-content ggd-toc-body">
          <h2>{book ? `《${book.name}》完整目录` : '目录'}</h2>
          <div className="ggd-content-left ggd-chlist">
            <ul className="ggd-toc-list">
              {loading
                ? Array.from({ length: 30 }).map((_, i) => <li key={i}><Sk style={{ height: 26 }} /></li>)
                : error || !book
                  ? <li><ErrorState message="目录加载失败" detail={error} /></li>
                  : chapters.map((c) => (
                    <li key={c.id} className={c.id === currentChapterId ? 'is-active' : undefined}>
                      <a
                        href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)}
                        onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}
                        title={c.title}
                      >{c.title}</a>
                    </li>
                  ))}
            </ul>
          </div>
          <div className="ggd-clear" />
          <dl className="ggd-pager">
            <dd>
              <button disabled={page <= 1} onClick={() => book && navigate({ view: 'toc', bookId: book.id, page: page - 1 })}>上一页</button>
              <span>第 {page} / {totalPages} 页</span>
              <button disabled={page >= totalPages} onClick={() => book && navigate({ view: 'toc', bookId: book.id, page: page + 1 })}>下一页</button>
            </dd>
          </dl>
        </div>
      </div>
      <GgdFooter />
    </div>
  )
}

// 字号五档(家族标准)
const FS_STEPS = [14, 16, 18, 20, 22]

export function Ggd66Read({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  const chapter = data?.chapter ?? null
  const book = data?.book ?? null
  const prev = data?.prev ?? null
  const next = data?.next ?? null
  // [R36-2a-fix] 主题覆盖字号基线+行距(未编辑=16/1.9 零回归)
  const reader = useReaderFont()
  const lh = useThemeLineHeight(1.9)
  const [fsIdx, setFsIdx] = useState(1)

  useRecordReading(book?.id, chapter?.id, chapter?.title)

  // 键盘 ←/→ 翻章(输入态守卫)
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
    return <div className="ggd-read"><div className="ggd-container"><ErrorState message="章节内容加载失败" detail={error} /></div></div>
  }
  if (loading || !chapter || !book) {
    return (
      <div className="ggd-read" role="status" aria-label="章节内容加载中">
        <div className="ggd-container">
          <Sk style={{ height: 48 }} />
          <Sk style={{ height: 420, marginTop: 10 }} />
        </div>
        <span className="sr-only">加载中…</span>
      </div>
    )
  }
  const goto = (cid?: string) => { if (cid) navigate({ view: 'read', chapterId: cid }) }

  return (
    <div className="ggd-read">
      <div className="ggd-container">
        <GgdCrumbs bookName={chapter.title} catName={book.name} />
        <div className="ggd-book ggd-read-body">
          {/* 字号工具条(家族标准形态) */}
          <div className="ggd-text-set" role="group" aria-label="字号">
            <b>字号：</b>
            {FS_STEPS.map((n, i) => (
              <a key={n} href="#" className={fsIdx === i ? 'is-active' : ''} onClick={(e) => { e.preventDefault(); setFsIdx(i); reader.set(n) }}>{n}px</a>
            ))}
            <b>行距：</b>
            <a href="#" onClick={(e) => { e.preventDefault(); reader.inc() }}>加大</a>
            <a href="#" onClick={(e) => { e.preventDefault(); reader.dec() }}>减小</a>
          </div>
          <h1 className="ggd-read-title">{chapter.title}</h1>
          <div className="ggd-readcontent" style={{ fontSize: reader.font, lineHeight: lh }}>
            <ChapterContent content={chapter.content} />
          </div>
          <dl className="ggd-pager ggd-read-nav">
            <dd>
              <button className="ggd-btn-info" disabled={!prev} onClick={() => goto(prev?.id)}>上一章</button>
              <button className="ggd-btn-info" onClick={() => navigate({ view: 'book', bookId: book.id })}>返回书页</button>
              <button className="ggd-btn-info" disabled={!next} onClick={() => goto(next?.id)}>下一章</button>
            </dd>
          </dl>
        </div>
      </div>
      <GgdFooter />
    </div>
  )
}
