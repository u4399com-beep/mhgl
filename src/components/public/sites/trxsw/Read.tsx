// ============================================================
// [R28-2g-2] trxsw(同人小说网) 章节阅读页克隆 —— 杰奇 CMS 默认模板家族标准还原(降级声明)
// 素材等级: 家族标准 —— 真站章节页 /book/{id}/{cid}.html(2019 快照章节实链形态实证, 页本体
// 无存档) → 按杰奇家族章节页结构补全: h1 章节名 + #content 正文(14px 宋体系/行高 200%) +
// 上一章/目录/下一章 三钮 + 键盘 ←/→(Enter 回目录)。色值家族标准(b.css 无存档, R25 实证:
// #C00 红/#333/#666/#ccc 点线); 阅读位置记忆/字号调节走 template-kit。
// 降级声明: ①A+/A- 字号钮为克隆侧增强(杰奇原版无此工具, useReaderFont 14~24 与全站阅读器
// 偏好互通) ②「相关推荐」= 字数热榜 10 本替代(ChapterData 无分类字段, 家族惯例书链声明)
// ============================================================
'use client'

import { useEffect } from 'react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { useRelatedBooks } from '../hooks' // [R35-2d-1] 原逐字节重复的 rel 拉取 effect 收敛
import { ChapterContent, useReaderFont, useRecordReading, useThemeLineHeight } from '../template-kit'
import { bookNavProps, ErrorState, Sk } from '../../bits'

/** [R27-6b-17] 杰奇 CMS 家族标准色板(同 Home) */
const C = {
  navBlue: '#1C5087',
  text: '#333333',
  gray: '#666666',
  light: '#999999',
  border: '#dddddd',
  dotted: '#cccccc',
} as const

export function TrxswRead({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  // 字号调节(克隆侧增强, 与通用阅读器偏好互通; 声明①)
  const { font, inc, dec } = useReaderFont()
  // [R36-2a-fix-5] 主题覆盖行距(未编辑=2 零回归)
  const txLh = useThemeLineHeight(2)
  // 阅读位置/时长记忆(hooks 顺序: 挂载即调)
  useRecordReading(data?.book?.id, data?.chapter?.id, data?.chapter?.title)

  // 相关阅读(家族惯例书链; ChapterData 无分类字段 → 字数热榜 10 本替代, 声明) [R35-2d-1] 拉取 effect 收敛至 hooks.ts
  const bookId = data?.book?.id
  const rel = useRelatedBooks(bookId)

  // 键盘导航(杰奇家族惯例: Enter 回目录/← 上一页/→ 下一页)
  useEffect(() => {
    if (!data) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
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
        <div className="tx-read border bg-white p-2.5" style={{ borderColor: C.border }}>
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
  const navBtn = 'tx-navbtn m-[2px] inline-flex h-[32px] items-center justify-center border px-2 text-[13px] transition-colors hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="tx-home mx-auto w-full max-w-[960px] px-2 pb-6 pt-3" style={{ color: C.text, fontSize: 14 }}>
      {/* 面包屑(杰奇家族 .con) */}
      <p className="tx-crumb m-0 mb-2 text-[13px]" style={{ color: C.gray }}>
        <button type="button" onClick={() => navigate({ view: 'home' })} className="hover:underline" style={{ color: C.text }} aria-label="前往首页">
          首页
        </button>
        <span className="mx-1">&gt;</span>
        <button
          type="button"
          onClick={() => navigate({ view: 'book', bookId: book.id })}
          className="max-w-[12em] truncate hover:underline"
          style={{ color: C.text }}
          aria-label={`返回《${book.name}》书页`}
        >
          {book.name}
        </button>
        <span className="mx-1">&gt;</span>
        <span>{chapter.title}</span>
      </p>

      {/* ============ #content 正文(杰奇家族: 白底/14px/行高 200%) ============ */}
      <div className="tx-read border bg-white p-2.5" style={{ borderColor: C.border }}>
        <h1 className="m-0 pb-1.5 text-center text-[18px] font-bold" style={{ color: C.text }}>
          {chapter.title}
        </h1>
        <p className="m-0 flex items-center justify-center gap-3 pb-2 text-[12px]" style={{ color: C.light }}>
          <span>{chapter.wordCount > 0 ? `${chapter.wordCount} 字` : ''}</span>
          <span className="tx-fontctl inline-flex items-center gap-1">
            <button
              type="button"
              onClick={dec}
              className="tx-fontbtn inline-flex h-[20px] w-[20px] items-center justify-center border text-[12px] leading-none"
              style={{ borderColor: C.border, color: C.gray }}
              aria-label="缩小字号"
            >
              A-
            </button>
            <span aria-hidden>
              {font}px
            </span>
            <button
              type="button"
              onClick={inc}
              className="tx-fontbtn inline-flex h-[20px] w-[20px] items-center justify-center border text-[12px] leading-none"
              style={{ borderColor: C.border, color: C.gray }}
              aria-label="放大字号"
            >
              A+
            </button>
          </span>
        </p>
        <ChapterContent content={chapter.content} className="tx-content border-t pt-2.5" style={{ fontSize: font, lineHeight: txLh, color: C.text }} />
        <div className="pb-1 pt-2 text-right">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="text-[12px] hover:underline" style={{ color: C.gray }} aria-label="返回顶部">
            返回顶部
          </button>
        </div>
      </div>

      {/* 三钮导航(上一页/目录/下一页; 杰奇家族桌面 30%/移动 46%+全宽) */}
      <nav aria-label="章节导航" className="tx-readnav mt-1 flex flex-wrap justify-center text-center">
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

      {/* 相关阅读(家族惯例 → 字数热榜替代, 声明) */}
      <div className="tx-rel mt-3 border bg-white p-2.5" style={{ borderColor: C.border }}>
        <p className="m-0 flex flex-wrap items-center py-1 text-[13px]">
          <span className="mr-2.5" style={{ color: C.gray }}>
            相关推荐：
          </span>
          {rel === null ? (
            <Sk className="h-4 w-2/3" />
          ) : rel.length ? (
            rel.map((b) => (
              <button
                key={b.id}
                type="button"
                {...bookNavProps(navigate, b.id)}
                className="mb-0.5 mr-2.5 max-w-full truncate text-left hover:underline"
                style={{ color: C.text }}
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
  )
}
