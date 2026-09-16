// ============================================================
// [R27-6b-11] shipsay(船说 CMS demo) 章节阅读页克隆 —— 船说 V4.2 家族标准还原(降级声明)
// 素材等级: 家族标准 —— 真站章节页 /{bookId}/{cid}.html 无 Wayback 存档(快照章节实链
// 80001/14.html 形态实证, 页本体未存档) → 按船说 V4.2 家族结构补全: 白卡 + h1 章节名居中 +
// 正文段 + 上一章/目录/下一章 钮 + 键盘 ←/→/Enter。色值沿用实测(#f4f4f4/#fff/#ed4259/#555);
// 阅读位置记忆走 template-kit; 图标 fa → lucide。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import { List, Play, StepBack, StepForward } from 'lucide-react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import type { BookItem } from '../../types'
import { ChapterContent, useRecordReading } from '../template-kit'
import { bookNavProps, ErrorState, Sk } from '../../bits'

/** [R27-6b-11] 船说模板实测色值(同 Home) */
const C = {
  text: '#666666',
  link: '#1a1a1a',
  hover: '#ed4259',
  title: '#555555',
  line: '#e3e3e3',
} as const

export function ShipsayRead({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  // 相关阅读(家族惯例书链; ChapterData 无分类字段 → 字数热榜 10 本替代, 声明)
  const [rel, setRel] = useState<BookItem[] | null>(null)

  // 阅读位置/时长记忆(hooks 顺序: 挂载即调)
  useRecordReading(data?.book?.id, data?.chapter?.id, data?.chapter?.title)

  const bookId = data?.book?.id
  useEffect(() => {
    if (!bookId) return
    let alive = true
    fetchBooks({ sort: 'words', page: 1, size: 10 })
      .then((d) => {
        if (alive) setRel((d.books || []).filter((b) => b.id !== bookId).slice(0, 10))
      })
      .catch(() => {
        if (alive) setRel([])
      })
    return () => {
      alive = false
    }
  }, [bookId])

  // 键盘导航(船说家族惯例: Enter 回目录/← 上一章/→ 下一章)
  useEffect(() => {
    if (!data) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft' && data.prev) navigate({ view: 'read', chapterId: data.prev.id })
      else if (e.key === 'ArrowRight' && data.next) navigate({ view: 'read', chapterId: data.next.id })
      else if (e.key === 'Enter') navigate({ view: 'book', bookId: data.book.id })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data, navigate])

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-2 py-10">
        <ErrorState message="章节加载失败" detail={error} />
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-2 pb-6 pt-3" aria-label="章节加载中">
        <Sk className="mb-2 h-8 w-1/2" />
        <div className="ss-card p-3">
          <Sk className="mx-auto mb-4 h-6 w-1/2" />
          <div className="space-y-3 px-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <Sk key={i} className="h-4 w-full" style={{ opacity: 1 - i * 0.06 }} />
            ))}
          </div>
        </div>
        <span className="sr-only">加载中…</span>
      </div>
    )
  }

  const { chapter, book, prev, next } = data
  const navBtn = 'ss-navbtn m-[2px] inline-flex h-[34px] items-center justify-center gap-1 rounded-[3px] px-2 text-[13px] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="ss-home w-full pb-6" style={{ background: '#f4f4f4', color: C.text, fontSize: 14 }}>
      <div className="mx-auto w-full max-w-[960px] px-2 pt-3">
        <div className="ss-card p-3">
          {/* 章节标题(真站章节页 h1 居中 + 返回书页链) */}
          <h1 className="m-0 pb-1.5 text-center text-[20px] font-bold leading-snug" style={{ color: C.title }}>
            {chapter.title}
          </h1>
          <p className="m-0 pb-2 text-center text-[13px]">
            <button
              type="button"
              onClick={() => navigate({ view: 'book', bookId: book.id })}
              className="hover:underline"
              style={{ color: C.link }}
              aria-label={`返回《${book.name}》书页`}
            >
              《{book.name}》
            </button>
            <span className="ml-2">{chapter.wordCount > 0 ? `${chapter.wordCount} 字` : ''}</span>
          </p>
          {/* 正文(船说家族: 16px/行高 26px 段落 2em 缩进) */}
          <ChapterContent content={chapter.content} className="ss-readcontent border-t pt-3" style={{ fontSize: 16, lineHeight: '26px', color: '#333' }} />
          <div className="pb-1 pt-2 text-right">
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="text-[13px] hover:underline" style={{ color: C.link }} aria-label="返回顶部">
              返回顶部
            </button>
          </div>
        </div>

        {/* 三钮导航(上一章/目录/下一章) */}
        <nav aria-label="章节导航" className="ss-readnav mt-2 flex flex-wrap justify-center">
          <button
            type="button"
            onClick={() => prev && navigate({ view: 'read', chapterId: prev.id })}
            disabled={!prev}
            className={`${navBtn} w-[46%] text-white sm:w-[30%]`}
            style={{ background: C.hover }}
            aria-label="上一章"
          >
            <StepBack className="h-3.5 w-3.5" aria-hidden />
            上一章
          </button>
          <button
            type="button"
            onClick={() => navigate({ view: 'book', bookId: book.id })}
            className={`${navBtn} w-[46%] sm:w-[30%]`}
            style={{ background: '#fff', color: C.hover, border: `1px solid ${C.hover}` }}
            aria-label="返回目录"
          >
            <List className="h-3.5 w-3.5" aria-hidden />
            目录
          </button>
          <button
            type="button"
            onClick={() => next && navigate({ view: 'read', chapterId: next.id })}
            disabled={!next}
            className={`${navBtn} w-full text-white sm:w-[30%]`}
            style={{ background: C.hover }}
            aria-label="下一章"
          >
            下一章
            <StepForward className="h-3.5 w-3.5" aria-hidden />
          </button>
        </nav>

        {/* 相关阅读(家族惯例 → 字数热榜替代, 声明) */}
        <div className="ss-card mt-3 p-3">
          <div className="ss-sechead mb-1.5 border-b pb-1.5" style={{ borderColor: C.line }}>
            <h2 className="m-0 flex items-center gap-1.5 text-[16px] font-bold" style={{ color: C.title }}>
              <Play className="h-4 w-4" aria-hidden />
              相关阅读
            </h2>
          </div>
          <p className="m-0 flex flex-wrap gap-x-3 gap-y-1">
            {rel === null ? (
              <Sk className="h-4 w-2/3" />
            ) : rel.length ? (
              rel.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  {...bookNavProps(navigate, b.id)}
                  className="mb-0.5 max-w-full truncate text-left text-[13px] hover:underline"
                  style={{ color: C.link }}
                  aria-label={`查看《${b.name}》详情`}
                >
                  {b.name}
                </button>
              ))
            ) : (
              <span className="text-[13px]">暂无推荐</span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
