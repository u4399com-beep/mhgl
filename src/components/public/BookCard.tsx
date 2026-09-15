// ============================================================
// 主题化书籍卡片 / 行 / 海报 / 通用结果列表
// [R23-c-8] R23-c 设计语言化: cardHover 四形态(lift/glow/grow/none) + surfaceGradient 卡面
// ============================================================
'use client'

import { useState } from 'react'
import { BookOpen, Clock3, User } from 'lucide-react'
import type { BookItem } from './types'
import { usePublic } from './ctx'
import { fmtDate, formatWords, withAlpha } from './seo'
import { BookCover } from './BookCover'
import { bookNavProps, designVars, EmptyState, Sk, StatusBadge, BookGridSkeleton } from './bits'

/** 通用书籍卡片（网格布局，主题化圆角/阴影/描边） */
export function BookCard({ book }: { book: BookItem }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  // [R23-c-8] cardHover 四形态 + surfaceGradient 卡面 + glowColor 辉光(全部 ?? 本地 fallback)
  const d = designVars(theme)
  const hover = d.cardHover ?? 'lift'
  const glow = d.glowColor ?? v.primary
  const [hov, setHov] = useState(false)

  // 位移/缩放走静态 Tailwind 类(与原 hover:-translate-y-1 / hover:scale-[1.03] 同一 JIT 词汇);
  // 阴影/描边染色需 withAlpha 动态配色, 走 hover 态内联样式(onMouseEnter/Leave + 焦点对等)。
  const hoverCls = hover === 'lift' ? ' hover:-translate-y-1' : hover === 'grow' ? ' hover:scale-[1.03]' : ''
  const baseShadow = v.cardShadow === 'none' ? undefined : v.cardShadow
  const hoverShadow =
    hover === 'glow'
      ? `0 8px 30px ${withAlpha(glow, 0.55)}`
      : hover === 'lift'
        ? `0 14px 30px ${withAlpha(glow, 0.22)}, ${v.cardShadow === 'none' ? '0 10px 24px rgba(0,0,0,0.14)' : v.cardShadow}`
        : undefined
  const borderColor = hov && hover === 'glow' ? withAlpha(glow, 0.4) : v.border

  return (
    <article
      className={`group relative cursor-pointer overflow-hidden transition-all duration-200${hoverCls}`}
      style={{
        background: d.surfaceGradient ?? v.surface,
        border: `1px solid ${borderColor}`,
        borderRadius: v.radius,
        boxShadow: hov && hoverShadow ? hoverShadow : baseShadow,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onFocus={() => setHov(true)}
      onBlur={() => setHov(false)}
      {...bookNavProps(navigate, book.id)}
      aria-label={`查看《${book.name}》详情`}
    >
      {/* feat-round-5 S1: 封面梯度光晕 (hover 时显现) */}
      <div aria-hidden className="pointer-events-none absolute -inset-2 -z-10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-70" style={{ background: `radial-gradient(circle at 50% 25%, ${withAlpha(v.primary, 0.5)}, transparent 70%)` }} />
      <div className="relative">
        <BookCover name={book.name} cover={book.cover} className="aspect-[3/4] w-full" />
        <span className="absolute left-2 top-2">
          <StatusBadge status={book.status} small />
        </span>
      </div>
      <div className="space-y-1 p-2.5">
        <h3 className="line-clamp-1 text-sm font-semibold" style={{ color: v.text }}>{book.name}</h3>
        <p className="flex items-center gap-1 text-xs" style={{ color: v.textMuted }}>
          <User className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{book.author}</span>
        </p>
        <p className="flex items-center justify-between text-[11px]" style={{ color: v.textMuted }}>
          <span className="truncate" style={{ color: v.primary }}>{book.category}</span>
          <span>{formatWords(book.wordCount)}</span>
        </p>
      </div>
    </article>
  )
}

/** 通用书籍行（列表布局：横向封面 + 信息） */
export function BookLine({ book, index }: { book: BookItem; index?: number }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  // [R23-c-9] 行 hover: 行首序号徽章变实底主色(有 index 时) + 行面 surfaceGradient(40%)
  const d = designVars(theme)
  const [hov, setHov] = useState(false)
  const sg = d.surfaceGradient
  const rowBg = hov ? (sg ? withAlpha(sg, 0.4) : withAlpha(v.surface, 0.4)) : undefined
  return (
    <article
      className="group flex cursor-pointer items-center gap-3 py-3 transition-colors"
      style={{ borderBottom: `1px solid ${withAlpha(v.border, 0.7)}`, background: rowBg }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onFocus={() => setHov(true)}
      onBlur={() => setHov(false)}
      {...bookNavProps(navigate, book.id)}
      aria-label={`查看《${book.name}》详情`}
    >
      {typeof index === 'number' && (
        <span
          className="w-8 shrink-0 rounded-md py-0.5 text-center text-lg font-bold tabular-nums transition-colors"
          style={{
            color: hov ? v.primaryText : index < 3 ? v.primary : v.textMuted,
            background: hov ? v.primary : 'transparent',
            fontFamily: v.titleFont,
          }}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
      )}
      <BookCover name={book.name} cover={book.cover} className="aspect-[3/4] w-14 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="line-clamp-1 text-sm font-semibold" style={{ color: v.text }}>{book.name}</h3>
          <StatusBadge status={book.status} small />
        </div>
        <p className="flex flex-wrap items-center gap-x-3 text-xs" style={{ color: v.textMuted }}>
          <span className="truncate">{book.author}</span>
          <span style={{ color: v.primary }}>{book.category}</span>
          <span>{formatWords(book.wordCount)}</span>
        </p>
        <p className="line-clamp-1 text-xs" style={{ color: v.textMuted }}>{book.intro || book.latestChapter}</p>
      </div>
      <span className="hidden shrink-0 items-center gap-1 text-xs sm:flex" style={{ color: v.textMuted }}>
        <Clock3 className="h-3 w-3" aria-hidden />
        {fmtDate(book.updatedAt)}
      </span>
    </article>
  )
}

/** 影院海报卡（底部渐变遮罩标题） */
export function BookPoster({ book }: { book: BookItem }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  // [R23-c-10] cardHover(默认 grow) + 底部遮罩渐变叠主色 tint(withAlpha(primary,0.25))
  const d = designVars(theme)
  const hover = d.cardHover ?? 'grow'
  const glow = d.glowColor ?? v.primary
  const [hov, setHov] = useState(false)
  const hoverCls = hover === 'lift' ? ' hover:-translate-y-1' : hover === 'grow' ? ' hover:scale-[1.03]' : ''
  const hoverShadow = hover === 'glow' ? `0 8px 30px ${withAlpha(glow, 0.55)}` : undefined
  return (
    <article
      className={`group relative cursor-pointer overflow-hidden transition-all duration-200${hoverCls}`}
      style={{ borderRadius: v.radius, boxShadow: hov && hoverShadow ? hoverShadow : v.cardShadow === 'none' ? undefined : v.cardShadow }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onFocus={() => setHov(true)}
      onBlur={() => setHov(false)}
      {...bookNavProps(navigate, book.id)}
      aria-label={`查看《${book.name}》详情`}
    >
      {/* feat-round-5 S1: 海报梯度光晕 (hover 时显现) */}
      <div aria-hidden className="pointer-events-none absolute -inset-2 -z-10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-70" style={{ background: `radial-gradient(circle at 50% 25%, ${withAlpha(v.primary, 0.5)}, transparent 70%)` }} />
      <BookCover name={book.name} cover={book.cover} className="aspect-[3/4] w-full" />
      <div
        className="absolute inset-x-0 bottom-0 p-2.5 pt-8"
        style={{
          // [R23-c-10] 双层背景: 主色 tint(自下而上 55% 内衰减)叠于原暗部渐变之上, 白字对比度不降级
          background: `linear-gradient(to top, ${withAlpha(v.primary, 0.25)} 0%, transparent 55%), linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 55%, transparent 100%)`,
        }}
      >
        <div className="mb-1 flex items-center gap-1.5">
          <StatusBadge status={book.status} small />
          <span className="text-[10px]" style={{ color: v.accent }}>{formatWords(book.wordCount)}</span>
        </div>
        <h3 className="line-clamp-1 text-sm font-semibold text-white">{book.name}</h3>
        <p className="line-clamp-1 text-[11px] text-white/70">{book.author}</p>
      </div>
    </article>
  )
}

/**
 * 通用主题结果列表 — 供 搜索/分类 页复用：
 * 按 theme.layout 自动切换 卡片网格 / 文字行 / 海报墙
 */
export function ThemeBookList({ books, loading }: { books: BookItem[]; loading?: boolean }) {
  const { theme } = usePublic()
  const layout = theme.layout

  if (loading) {
    if (layout === 'list' || layout === 'minimal') {
      return (
        <div className="space-y-4 py-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Sk className="aspect-[3/4] w-14 shrink-0" />
              <div className="flex-1 space-y-2">
                <Sk className="h-4 w-1/3" />
                <Sk className="h-3 w-1/2" />
                <Sk className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )
    }
    // feat-round-7 B3: 网格布局 loading 用通用 BookGridSkeleton
    return <BookGridSkeleton count={12} />
  }

  if (!books.length) return <EmptyState text="没有找到相关书籍" hint="换个关键词或分类试试" />

  if (layout === 'list' || layout === 'minimal') {
    return (
      <div className="divide-y-0">
        {books.map((b, i) => <BookLine key={b.id} book={b} index={i} />)}
      </div>
    )
  }
  if (layout === 'theater') {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {books.map((b) => <BookPoster key={b.id} book={b} />)}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {books.map((b) => <BookCard key={b.id} book={b} />)}
    </div>
  )
}

/** 开始阅读入口按钮（跳第一章） */
export function ReadFirstButton({ firstChapterId, label = '开始阅读' }: { firstChapterId?: string; label?: string }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  return (
    <button
      type="button"
      disabled={!firstChapterId}
      onClick={() => firstChapterId && navigate({ view: 'read', chapterId: firstChapterId })}
      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
      style={{ background: v.primary, color: v.primaryText, borderRadius: v.radius }}
      aria-label={label}
    >
      <BookOpen className="h-4 w-4" aria-hidden />
      {label}
    </button>
  )
}
