// ============================================================
// [R27-6b-5] x2552(吾爱文学网) 章节阅读页克隆 —— 黑冰模板家族标准还原(降级声明)
// 素材等级: 家族标准 —— 真站章节页 /html/{x}/{id}/{cid}.html 无 Wayback 存档 → 按黑冰家族
// 章节页结构补全: h1 章节名(居中) + 正文块(白底/1px 边/行式段落) + 上一页/目录/下一页 灰钮 +
// 键盘 ←/→/Enter(家族惯例)。色值沿用 R24 实测 style.css; 阅读位置记忆走 template-kit。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import type { BookItem } from '../../types'
import { ChapterContent, useRecordReading } from '../template-kit'
import { ErrorState, Sk, bookNavProps } from '../../bits'

/** [R27-6b-5] 黑冰模板实测色值(同 Home) */
const C = {
  text: '#666666',
  link: '#2f468f',
  hover: '#FF6600',
  border: '#E4E4E4',
} as const
const TITLE_BAR = 'linear-gradient(180deg, #fbfcfe 0%, #e9eef5 100%)'

export function X2552Read({ data, loading, error }: SiteReadProps) {
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

  // 键盘导航(黑冰家族惯例: Enter 回目录/← 上一页/→ 下一页)
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
      <div className="mx-auto w-full max-w-[960px] px-2 pb-4" aria-label="章节加载中">
        <Sk className="mt-2 mb-2 h-8 w-1/2" />
        <div className="x2-read border p-2.5" style={{ borderColor: C.border, background: '#fff' }}>
          <Sk className="mx-auto mb-4 h-5 w-1/2" />
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
  const navBtn = 'x2-navbtn m-[2px] inline-flex h-[32px] items-center justify-center border px-2 text-[13px] transition-colors hover:bg-[#eee] disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="x2-home w-full px-2 pb-4" style={{ color: C.text, fontSize: 12, lineHeight: 1.2 }}>
      <div className="mx-auto w-full max-w-[960px]">
        {/* 面包屑条(家族 dt 形态) */}
        <div style={{ border: `1px solid ${C.border}`, background: TITLE_BAR, lineHeight: '30px', padding: '0 10px', marginTop: 8 }}>
          <button type="button" className="x2-a" style={{ cursor: 'pointer' }} onClick={() => navigate({ view: 'home' })} onKeyDown={(e) => e.key === 'Enter' && navigate({ view: 'home' })}>
            吾爱文学网
          </button>
          {' -> '}
          <button type="button"
            className="x2-a"
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer' }}
            onClick={() => navigate({ view: 'book', bookId: book.id })}
            onKeyDown={(e) => e.key === 'Enter' && navigate({ view: 'book', bookId: book.id })}
          >
            {book.name}
          </button>
          {' -> '}
          <span>{chapter.title}</span>
        </div>

        {/* 正文块(h1 居中 + 正文 16px/行高 180%) */}
        <div style={{ border: `1px solid ${C.border}`, marginTop: 8, background: '#fff' }}>
          <div className="x2-readpanel px-2.5 pb-2.5 pt-2">
            <h1 className="m-0 pb-2 text-center text-[20px] font-bold" style={{ color: C.text }}>
              {chapter.title}
            </h1>
            <p className="pb-1 text-center text-[12px]" style={{ color: C.text }}>
              {chapter.wordCount > 0 ? `${chapter.wordCount} 字` : ''}
            </p>
            <ChapterContent content={chapter.content} className="x2-content border-t pt-2.5" style={{ fontSize: 16, lineHeight: 1.8, color: '#333' }} />
            <div className="pb-1 pt-2 text-right">
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="x2-a text-[12px] hover:underline"
                style={{ color: C.link }}
                aria-label="返回顶部"
              >
                ↑返回顶部↑
              </button>
            </div>
          </div>
        </div>

        {/* 三钮导航(家族标准: 上一页/目录/下一页, 桌面 30%, 移动 46%/全宽) */}
        <nav aria-label="章节导航" className="x2-readnav mt-1 flex flex-wrap justify-center text-center">
          <button type="button" onClick={() => prev && navigate({ view: 'read', chapterId: prev.id })} disabled={!prev} className={`${navBtn} w-[46%] sm:w-[30%]`} style={{ borderColor: C.border, background: '#fff', color: C.text }} aria-label="上一章">
            上一章
          </button>
          <button type="button" onClick={() => navigate({ view: 'book', bookId: book.id })} className={`${navBtn} w-[46%] sm:w-[30%]`} style={{ borderColor: C.border, background: '#fff', color: C.text }} aria-label="返回目录">
            目录
          </button>
          <button type="button" onClick={() => next && navigate({ view: 'read', chapterId: next.id })} disabled={!next} className={`${navBtn} w-full sm:w-[30%]`} style={{ borderColor: C.border, background: '#fff', color: C.text }} aria-label="下一章">
            下一章
          </button>
        </nav>
        <p className="hidden pt-2 text-center text-[12px] sm:block" style={{ color: C.text }}>
          温馨提示：按 回车[Enter]键 返回书目，按 ←键 返回上一章，按 →键 进入下一章
        </p>

        {/* 相关阅读(家族惯例 → 字数热榜替代, 声明) */}
        <div style={{ border: `1px solid ${C.border}`, marginTop: 8, background: '#fff' }}>
          <div style={{ height: 32, lineHeight: '32px', fontSize: 13, background: TITLE_BAR, padding: '0 15px' }}>相关阅读</div>
          <p className="m-0 flex flex-wrap p-2.5 text-[13px]">
            {rel === null ? (
              <Sk className="h-4 w-2/3" />
            ) : rel.length ? (
              rel.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  {...bookNavProps(navigate, b.id)}
                  className="x2-a mb-1 mr-2.5 max-w-full truncate text-left"
                  style={{ color: C.link }}
                  aria-label={`查看《${b.name}》详情`}
                >
                  {b.name}
                </button>
              ))
            ) : (
              <span>暂无推荐</span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
