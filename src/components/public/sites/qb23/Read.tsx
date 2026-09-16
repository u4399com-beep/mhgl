// ============================================================
// [R28-2c] qb23 铅笔小说(www.23qb.net) 章节阅读页克隆 —— 基础五视图之 Read
// 真站快照(R28 实测): /tmp/r28-2c/qb23/qb23-read.html(/book/5094/3644078.html 直抓)
// 真站 DOM: main#main.wrapper > .article.content(max-width 680px)
//   └ .box.view-heading(白卡; .article .box padding-bottom 100px margin-bottom 100px → 克隆收敛为 56/28px)
//       ├ .chepnav 面包屑(「当前位置：铅笔小说 > 都市小说 > 问鼎 >」, color #999, i 不倾斜)
//       ├ h1.article-title(2.75rem/800 line-height 1.4 padding-top 1.75rem; ≤899px padding 20px 5px 10px)
//       ├ h3.text-muted(卷名「正文卷」#999 —— ChapterData 无卷字段, 降级省略)
//       ├ .article-content > p(18px / line-height 1.6 / margin .825rem 0; ≤899px 16px)
//       └ .footer 章节导航(高 70px max-width 768px 居中; a 宽 22.5%/padding 20px 18px/高 60px/
//           底 #f3f5f7 字 14px rgba(0,0,0,.68); .f-left 左半圆 50px / .f-center radius 5px ×2 /
//           .f-right 右半圆; 真站四钮: 上一篇 | +书签 | 目录 | 下一篇, 无下章时文案「没有了~」)
//   └ .fixed_right_bar 悬浮球(36px 圆 rgba(0,0,0,.6) hover #ff2a14) —— 克隆挂 A+/A- 字号钮
//       (真站该栏为日夜模式切换, 字号调节为本站阅读器等价交互, 字号记忆与通用阅读器同键互通)
// 数据降级/推断说明:
//   ① 真站 +书签(sq() 登录态书签)无数据契约 → 该钮位映射为「书页」(返回书籍详情), 位置/形态不变。
//   ② 真站无下章时 f-right 文案「没有了~」→ 克隆以 disabled「没有了~」呈现, 语义一致。
//   ③ h3.text-muted 卷名降级省略(ChapterData 无卷字段); 真站 下一篇 title 空串为站方数据缺失, 非模板形态。
// 阅读记忆: useRecordReading(bookId, chapterId, title) 挂一次(滚动位置 + 时长)。
// 正文渲染: <ChapterContent>(段落规整 + XSS 消毒), 栏宽/行高对齐真站 680px/1.6。
// ============================================================
'use client'

import { useEffect } from 'react'
import { AArrowDown, AArrowUp } from 'lucide-react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { ChapterContent, useReaderFont, useRecordReading } from '../template-kit'
import { ErrorState, Sk } from '../../bits'

/** [R28-2c-18] 真站实测色值(style.css) */
const QB_TEXT = '#282828'
const QB_TXT68 = 'rgba(0,0,0,0.68)'
const QB_GRAY = '#999999' // .chepnav / .text-muted
const QB_GRAY_BG = '#f3f5f7' // .footer a

/** [R28-2c-19] .footer 章节导航钮(f-left/f-center/f-right 半圆语言) */
function FootBtn({
  children,
  onClick,
  side,
  disabled,
  ariaLabel,
}: {
  children: string
  onClick?: () => void
  side: 'left' | 'center' | 'right'
  disabled?: boolean
  ariaLabel: string
}) {
  const radius = side === 'left' ? '50px 0 0 50px' : side === 'right' ? '0 50px 50px 0' : '5px'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="h-[60px] flex-1 truncate px-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45 sm:px-[18px]"
      style={{ background: QB_GRAY_BG, color: QB_TXT68, borderRadius: radius }}
    >
      {children}
    </button>
  )
}

export function Qb23Read({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  const { font, inc, dec } = useReaderFont()

  const chapter = data?.chapter
  const book = data?.book
  const prev = data?.prev
  const next = data?.next
  // [R28-2c-20] 阅读位置/时长记忆(滚动 debounce 300ms + 10s 时长累计), 章节切换自动续记
  useRecordReading(book?.id, chapter?.id, chapter?.title)

  // 真站章节切换整页跳转回顶; SPA 保留滚动位会落在章中, 切章后回顶
  useEffect(() => {
    if (chapter?.id) window.scrollTo({ top: 0 })
  }, [chapter?.id])

  // 键盘 ←/→ 切章(任务要求; 真站 mxui.js 有等价快捷键)
  useEffect(() => {
    if (!data) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return
      if (e.key === 'ArrowLeft' && data.prev) navigate({ view: 'read', chapterId: data.prev.id })
      else if (e.key === 'ArrowRight' && data.next) navigate({ view: 'read', chapterId: data.next.id })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data, navigate])

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[680px] px-3 pt-4" aria-busy>
        <div className="rounded-[18px] bg-white p-5 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-[25px]">
          <Sk className="h-4 w-1/3" style={{ borderRadius: 4 }} />
          <Sk className="mt-5 h-9 w-4/5" style={{ borderRadius: 8 }} />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Sk key={i} className="h-4 w-full" style={{ borderRadius: 4, opacity: 1 - i * 0.05 }} />
            ))}
          </div>
          <div className="mt-8 flex gap-1">
            <Sk className="h-[60px] flex-1" style={{ borderRadius: '50px 0 0 50px' }} />
            <Sk className="h-[60px] flex-1" />
            <Sk className="h-[60px] flex-1" />
            <Sk className="h-[60px] flex-1" style={{ borderRadius: '0 50px 50px 0' }} />
          </div>
        </div>
      </div>
    )
  }

  if (error || !data || !chapter || !book) {
    return (
      <div className="mx-auto w-full max-w-[680px] px-3 pt-4">
        <div className="rounded-[18px] bg-white p-6 shadow-[0_7px_21px_rgba(149,157,165,0.22)]">
          <ErrorState message="章节内容加载失败" detail={error} />
        </div>
      </div>
    )
  }

  return (
    <div className="w-full" style={{ color: QB_TEXT }}>
      {/* ============ .article.content 680px 版心 ============ */}
      <article className="mx-auto w-full max-w-[680px] px-3 pb-10 pt-4 sm:px-4 md:px-0">
        <div className="rounded-[18px] bg-white p-4 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-[25px]">
          {/* .chepnav 面包屑(来源行; 色彩走 class 保 hover 可覆盖) */}
          <nav className="qb23-crumb text-sm text-[#999999]" aria-label="面包屑">
            <span className="not-italic">当前位置：</span>
            <button
              type="button"
              onClick={() => navigate({ view: 'home' })}
              className="transition-colors hover:text-[#ff2a14]"
              aria-label="前往首页"
            >
              铅笔小说
            </button>
            <span aria-hidden> &gt; </span>
            <button
              type="button"
              onClick={() => navigate({ view: 'book', bookId: book.id })}
              className="transition-colors hover:text-[#ff2a14]"
              aria-label={`返回《${book.name}》书页`}
            >
              {book.name}
            </button>
            <span aria-hidden> &gt; </span>
          </nav>
          {/* h1.article-title(2.75rem/800) */}
          <h1 className="pt-6 text-3xl font-extrabold leading-snug sm:text-[2.75rem] sm:leading-[1.4]">{chapter.title}</h1>
          {/* .article-content(18px/1.6/.825rem; 字号由容器 fontSize 驱动 A+/A-) */}
          <div className="qb23-article mt-4" style={{ fontSize: font }}>
            <ChapterContent content={chapter.content} />
          </div>

          {/* ============ .footer 四钮导航(上一篇 | +书签→书页 | 目录 | 下一篇; 真站排布, 降级①) ============ */}
          <nav aria-label="章节导航" className="mx-auto mt-8 flex max-w-[768px] gap-[2px] text-center">
            <FootBtn side="left" disabled={!prev} onClick={prev ? () => navigate({ view: 'read', chapterId: prev.id }) : undefined} ariaLabel="上一章">
              {prev ? prev.title || '上一篇' : '没有了~'}
            </FootBtn>
            <FootBtn side="center" onClick={() => navigate({ view: 'book', bookId: book.id })} ariaLabel="返回书页(真站书签钮位, 降级映射)">
              书页
            </FootBtn>
            <FootBtn side="center" onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })} ariaLabel="返回目录">
              目录
            </FootBtn>
            <FootBtn side="right" disabled={!next} onClick={next ? () => navigate({ view: 'read', chapterId: next.id }) : undefined} ariaLabel="下一章">
              {next ? next.title || '下一篇' : '没有了~'}
            </FootBtn>
          </nav>
          <p className="pt-2 text-center text-xs" style={{ color: QB_GRAY }}>
            键盘 ← → 键可切换上一章/下一章
          </p>
        </div>

        {/* .fixed_right_bar 悬浮字号球(真站日夜切换位; A+/A- 与通用阅读器同键互通) */}
        <div className="pointer-events-none fixed bottom-16 right-4 z-30 flex flex-col gap-2 sm:bottom-20 sm:right-6">
          <button
            type="button"
            onClick={inc}
            aria-label="放大字号"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full text-white shadow-md transition-colors hover:bg-[#ff2a14]"
            style={{ background: 'rgba(0,0,0,0.6)' }}
          >
            <AArrowUp className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={dec}
            aria-label="缩小字号"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full text-white shadow-md transition-colors hover:bg-[#ff2a14]"
            style={{ background: 'rgba(0,0,0,0.6)' }}
          >
            <AArrowDown className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </article>
    </div>
  )
}
