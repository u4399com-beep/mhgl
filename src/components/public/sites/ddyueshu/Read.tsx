// ============================================================
// [R39-2d] ddyueshu 克隆章节阅读页 —— biquge 家族阅读页标准形态
//   (.path 面包屑 + h1 章节名 + #content 正文 + .page_nav 上/目录/下 三钮)
//   平台接入点: 键盘 ←/→ 翻章 / useReaderFont 主题覆盖基线 / useThemeLineHeight / useRecordReading
//   色值(biquge.css 家族标准): 正文 16px/行高 2/底 #F6F8FE 面板; 阅读页以白底 #FFF 为主
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { ChapterContent, useReaderFont, useRecordReading, useThemeLineHeight } from '../template-kit'
import { ErrorState, Sk } from '../../bits'

// 字号三档(真站 A-/A/A+)
const FS_STEPS = [14, 16, 18, 20, 22]

export function DdyueshuRead({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  const chapter = data?.chapter ?? null
  const book = data?.book ?? null
  const prev = data?.prev ?? null
  const next = data?.next ?? null
  // [R36-2a-fix] 主题覆盖字号基线+行距(admin 未编辑=16/2 零回归)
  const reader = useReaderFont()
  const lh = useThemeLineHeight(2)
  const [fsIdx, setFsIdx] = useState(1)

  useRecordReading(book?.id, chapter?.id, chapter?.title)

  // 键盘 ←/→ 翻章(biquge 家族 pageEvent 37/39; 输入态守卫)
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
    return <div className="ddy-read"><ErrorState message="章节内容加载失败" detail={error} /></div>
  }
  if (loading || !chapter || !book) {
    return (
      <div className="ddy-read" role="status" aria-label="章节内容加载中">
        <Sk style={{ height: 48, maxWidth: 940, margin: '10px auto' }} />
        <Sk style={{ height: 420, maxWidth: 940, margin: '10px auto' }} />
        <span className="sr-only">加载中…</span>
      </div>
    )
  }

  const goto = (cid?: string) => { if (cid) navigate({ view: 'read', chapterId: cid }) }

  return (
    <div className="ddy-read">
      <div className="ddy-read-wrap">
        {/* 工具条: 字号 A-/A/A+(真站 .text_set 形态) */}
        <div className="ddy-text-set" role="group" aria-label="字号">
          <b>字号：</b>
          {FS_STEPS.map((n, i) => (
            <a key={n} href="#" className={fsIdx === i ? 'is-active' : ''} onClick={(e) => { e.preventDefault(); setFsIdx(i); reader.set(n) }}>{n}px</a>
          ))}
          <b>行距：</b>
          <a href="#" onClick={(e) => { e.preventDefault(); reader.inc() }}>加大</a>
          <a href="#" onClick={(e) => { e.preventDefault(); reader.dec() }}>减小</a>
        </div>
        {/* 面包屑 path */}
        <div className="ddy-path">
          <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>{book.name}</a>
          {' > '}
          <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: book.id }) }}>《{book.name}》</a>
          {' > '}{chapter.title}
        </div>
        <h1 className="ddy-ch-title">{chapter.title}</h1>
        <div className="ddy-ch-content" style={{ fontSize: reader.font, lineHeight: lh }}>
          <ChapterContent content={chapter.content} />
        </div>
        {/* 翻页 .page_nav */}
        <dl className="ddy-page-nav">
          <dd>
            <button disabled={!prev} onClick={() => goto(prev?.id)}>上一章</button>
            <button onClick={() => navigate({ view: 'book', bookId: book.id })}>返回书页</button>
            <button disabled={!next} onClick={() => goto(next?.id)}>下一章</button>
          </dd>
        </dl>
      </div>
    </div>
  )
}
