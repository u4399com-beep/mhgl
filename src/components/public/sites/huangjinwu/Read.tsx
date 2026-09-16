// ============================================================
// [R27-6-11] huangjinwu(黄金屋) 章节阅读页克隆 —— 按 https://www.huangjinwu.org/novel/16/11129 真站快照逐节还原
// (/tmp/r27-f/huangjinwu-chapter.html 2026-09 实抓 + /static/default/style.css 逐条提取)
//
// 真站 DOM(.main-content > .container.reader-container(900px)):
//   ├ nav.breadcrumb             黄金屋 / {分类} / 书名(链书页) / active 章节名
//   ├ .reader-header             白卡 flex(≤768 纵排): .reader-title(20px/600 a 链书名) +
//   │       │                    .reader-controls(.control-group「字体：」range 1.4~3 + 「行距：」range 1.4~3)
//   │       └ reader-settings    齿轮按钮(移动端设置面板; 控件语义等价映射为 A-/A+ 步进钮, 声明)
//   ├ .reader-content            #f8fafc 底/圆角 10/阴影/padding 3.2rem(≤480 透明无底无内距):
//   │       ├ h1                 章节名 24px 居中(真站带 <small>(1/3)> 章内分页 → 契约章粒度省略, 声明)
//   │       └ p                  max-w 800/text-indent 2em/letter-spacing .2em/justify/margin-b 1.5em
//   │       (字号走 --reader-font-size 默认 2rem=20px; useReaderFont 共享偏好 14~24 对齐)
//   ├ .reader-nav                a#prevChapter.btn.btn-secondary(无上章「没有了」) + 目录/书签(btn-primary 组)
//   │       │                    + a#nextChapter.btn.btn-primary 下一页(真站章内分页语义 → 映射 上一章/下一章)
//   │       └ 书签=addbookcaseWithChapter 登录态 JS → 不渲染(声明)
//   └ .related-section           h2.section-title 同作者小说 + .book-grid a.book-card
//                                (真站同作者过滤无契约 → 同分类书单替代, 声明)
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import type { BookItem } from '../../types'
import { ChapterContent, useReaderFont, useRecordReading } from '../template-kit'
import { ErrorState, Sk, bookNavProps } from '../../bits'

/** [R27-6-11] 真站实测色值(style.css :root) */
const C = {
  secondary: '#2563eb',
  primaryHover: '#1d4ed8',
  text: '#1e293b', // --reader-text
  textLight: '#64748b',
  textMuted: '#94a3b8',
  border: '#dbe4f0',
  readerBg: '#f8fafc', // --reader-bg
  readerBorder: '#d8e3f0', // --reader-border
  card: '#ffffff',
  shadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37,99,235,0.06)',
} as const

const FONT = '-apple-system,BlinkMacSystemFont,"Microsoft YaHei","PingFang SC","Segoe UI","Helvetica Neue",Arial,sans-serif'

/** 真站行距 range 1.4~3 step .2 默认 1.8 → 步进钮四档(等价映射, 声明) */
const LINE_STEPS = [1.5, 1.8, 2.1, 2.4]

export function HuangjinwuRead({ data, loading, error }: SiteReadProps) {
  const { navigate, site } = usePublic()
  // 字体(真站 range → A-/A+ 步进; 共享阅读器偏好 14~24, 默认 17≈真站 2rem 20px 档)
  const { font, inc, dec } = useReaderFont(14, 24)
  // 行距(真站 range 1.4~3 → 四档步进)
  const [lineIdx, setLineIdx] = useState(1)
  const lineHeight = LINE_STEPS[lineIdx]
  // 同作者小说(真站同作者过滤, 契约无作者书单维度 → 热门书单替代, 声明)
  const [rel, setRel] = useState<{ key: string; items: BookItem[] } | null>(null)

  // [R27-6-11] 阅读位置/时长记忆
  useRecordReading(data?.book?.id, data?.chapter?.id, data?.chapter?.title)

  const bookMaybe = data?.book // [R27-6-fix] 早返回前仅作可选探测, 主渲染用卫兵后重取非空 book
  const relKey = bookMaybe?.id ? `${bookMaybe.id}:read` : ''
  useEffect(() => {
    const bookId = bookMaybe?.id
    if (!bookId) return
    let alive = true
    const key = `${bookId}:read`
    fetchBooks({ site: site.id, page: 1, size: 12 })
      .then((d) => {
        if (alive) setRel({ key, items: (d.books || []).filter((b) => b.id !== bookId).slice(0, 6) })
      })
      .catch(() => {
        if (alive) setRel({ key, items: [] })
      })
    return () => {
      alive = false
    }
  }, [site.id, bookMaybe?.id])

  const relItems = useMemo(() => (rel && rel.key === relKey ? rel.items : null), [rel, relKey])

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-10" style={{ fontFamily: FONT }}>
        <ErrorState message="章节载入失败" detail={error} />
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-4 md:py-8" aria-label="章节加载中" style={{ color: C.text, fontFamily: FONT }}>
        <Sk className="mb-4 h-14 w-full rounded-[10px]" />
        <Sk className="mx-auto mb-6 h-7 w-2/3" />
        <div className="space-y-3 rounded-[10px] p-8" style={{ background: C.readerBg }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Sk key={i} className="mx-auto h-4" style={{ opacity: 1 - i * 0.05, width: i % 4 === 3 ? '82%' : '100%', maxWidth: 800 }} />
          ))}
        </div>
        <span className="sr-only">加载中…</span>
      </div>
    )
  }

  if (!data.book) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-10" style={{ fontFamily: FONT }}>
        <ErrorState message="章节书档暂缺" /> {/* [R27-6-fix] book 非空卫兵 */}
      </div>
    )
  }

  const { chapter, prev, next } = data
  const book = data.book // [R27-6-fix] 卫兵后重取, 非空类型

  return (
    // 真站 .reader-container .container(max-width 900px)
    <div className="mx-auto w-full max-w-[900px] px-4 py-4 md:py-8" style={{ color: C.text, fontFamily: FONT }}>
      {/* ===== nav.breadcrumb: 黄金屋 / 书名 / 章节名(真站中段分类链因 ChapterData 无分类字段省略, 声明) ===== */}
      <nav aria-label="面包屑导航" className="mb-6 -mt-2 text-[15px]" style={{ color: C.textLight }}>
        <ol className="flex items-center gap-2 list-none overflow-hidden p-0">
          <li>
            <button type="button" onClick={() => navigate({ view: 'home' })} className="transition-colors hover:text-[#2563eb]" style={{ color: C.textLight }} aria-label="返回黄金屋首页">
              黄金屋
            </button>
          </li>
          <li aria-hidden style={{ color: C.textMuted }}>/</li>
          <li className="min-w-0 truncate">
            <button type="button" onClick={() => navigate({ view: 'book', bookId: book.id })} className="truncate transition-colors hover:text-[#2563eb]" style={{ color: C.textLight }} aria-label={`返回《${book.name}》书页`}>
              {book.name}
            </button>
          </li>
          <li aria-hidden style={{ color: C.textMuted }}>/</li>
          <li className="truncate" aria-current="page">
            {chapter.title}
          </li>
        </ol>
      </nav>

      {/* ===== .reader-header 白卡: 书名 + 字体/行距控件(真站 range → 步进钮, 声明) ===== */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-[10px] p-4" style={{ background: C.card, boxShadow: C.shadow }}>
        <div className="hjw-reader-title min-w-[200px] flex-1 truncate text-[20px] font-semibold" style={{ color: '#0f172a' }}>
          <button type="button" onClick={() => navigate({ view: 'book', bookId: book.id })} className="transition-colors hover:text-[#2563eb]" style={{ color: '#0f172a' }} aria-label={`返回《${book.name}》书页`}>
            {book.name}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4" role="toolbar" aria-label="阅读设置">
          <div className="flex items-center gap-2 text-[14px]" style={{ color: C.textLight }}>
            <label htmlFor="hjw-font-dec">字体：</label>
            <button id="hjw-font-dec" type="button" onClick={dec} disabled={font <= 14} className="hjw-btn-secondary h-8 w-8 !px-0 !py-0 disabled:opacity-50" aria-label="缩小字体">
              −
            </button>
            <span className="inline-block min-w-[36px] text-center text-[13px]" style={{ color: C.textMuted }}>
              {font}px
            </span>
            <button type="button" onClick={inc} disabled={font >= 24} className="hjw-btn-secondary h-8 w-8 !px-0 !py-0 disabled:opacity-50" aria-label="放大字体">
              +
            </button>
          </div>
          <div className="flex items-center gap-2 text-[14px]" style={{ color: C.textLight }}>
            <span>行距：</span>
            <button
              type="button"
              onClick={() => setLineIdx((i) => Math.max(0, i - 1))}
              disabled={lineIdx <= 0}
              className="hjw-btn-secondary h-8 w-8 !px-0 !py-0 disabled:opacity-50"
              aria-label="缩小行距"
            >
              −
            </button>
            <span className="inline-block min-w-[36px] text-center text-[13px]" style={{ color: C.textMuted }}>
              {lineHeight.toFixed(1)}
            </span>
            <button
              type="button"
              onClick={() => setLineIdx((i) => Math.min(LINE_STEPS.length - 1, i + 1))}
              disabled={lineIdx >= LINE_STEPS.length - 1}
              className="hjw-btn-secondary h-8 w-8 !px-0 !py-0 disabled:opacity-50"
              aria-label="放大行距"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* ===== .reader-content 正文纸面(#f8fafc/圆角 10/阴影; ≤480 透明无底, 声明走 css 字符串) ===== */}
      <div className="hjw-reader mb-8 rounded-[10px] p-4 max-[480px]:p-0 min-[768px]:p-8" style={{ background: C.readerBg, boxShadow: C.shadow }}>
        <h1 className="mx-auto mb-8 mt-4 max-w-[900px] text-center text-[22px] font-semibold min-[768px]:text-[24px]" style={{ color: C.text }}>
          {chapter.title}
          {/* 真站 <small>(1/3)> 章内分页标记 → 契约整章下发, 省略(声明) */}
        </h1>
        {/* 段落规格(p: indent 2em/letter-spacing .2em/justify/margin-b 1.5em/max-w 800)走 css 字符串 .hjw-reader p */}
        <ChapterContent content={chapter.content} style={{ fontSize: font, lineHeight, color: C.text }} />
      </div>

      {/* ===== .reader-nav: 上一章(没有了) | 目录 | 下一章 ===== */}
      <nav aria-label="章节导航" className="mx-auto mb-8 flex max-w-[800px] flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => prev && navigate({ view: 'read', chapterId: prev.id })}
          disabled={!prev}
          className="hjw-btn-secondary min-w-[104px] flex-1 px-4 py-3 disabled:opacity-50 max-[768px]:min-w-0"
          aria-label="上一章"
        >
          {prev ? '上一章' : '没有了'}
        </button>
        {/* 真站中组为 目录+书签 双钮; 书签=登录态 JS 不渲染(声明) */}
        <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })} className="hjw-btn-primary min-w-[104px] px-6 py-3" aria-label="返回目录">
          目录
        </button>
        <button
          type="button"
          onClick={() => next && navigate({ view: 'read', chapterId: next.id })}
          disabled={!next}
          className="hjw-btn-primary min-w-[104px] flex-1 px-4 py-3 disabled:opacity-50 max-[768px]:min-w-0"
          aria-label="下一章"
        >
          {next ? '下一章' : '没有了'}
        </button>
      </nav>

      {/* ===== .related-section 同作者小说(真站同作者过滤无契约 → 热门书单替代, 声明) ===== */}
      {relItems && relItems.length > 0 && (
        <section>
          <h2 className="hjw-title mb-4 flex items-center text-[20px] font-semibold" style={{ borderLeft: `4px solid ${C.secondary}`, borderRadius: '2px 0 0 2px', color: '#0f172a', letterSpacing: '-0.02em', paddingLeft: 16 }}>
            同作者小说
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 min-[1200px]:grid-cols-3">
            {relItems.map((b) => (
              <article
                key={b.id}
                className="hjw-card group block cursor-pointer overflow-hidden rounded-[10px] border transition-[transform,border-color,box-shadow] duration-300"
                style={{ background: C.card, borderColor: 'rgba(219,228,240,0.85)', boxShadow: C.shadow }}
                {...bookNavProps(navigate, b.id)}
                aria-label={`查看《${b.name}》详情`}
              >
                <div className="p-4">
                  <div className="mb-2 truncate text-base font-medium leading-[1.4] group-hover:text-[#2563eb]" style={{ color: C.text }}>
                    {b.name}
                  </div>
                  <div className="mb-2 truncate text-sm" style={{ color: C.textLight }}>
                    作者：{b.author}
                  </div>
                  <div className="mb-3 line-clamp-2 min-h-[2.55em] text-sm leading-[1.5]" style={{ color: C.textLight }}>
                    {b.intro}
                  </div>
                  <span className="inline-block rounded-[10px] px-3 py-1 text-xs font-medium leading-[1.5] text-white" style={{ background: C.secondary }}>
                    {b.category || '小说'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
