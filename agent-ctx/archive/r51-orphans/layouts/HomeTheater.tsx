// ============================================================
// 首页布局 · theater（深海影院 ocean）
// 全宽沉浸横幅（heroBg 打底 + 封面氛围 + 渐变遮罩）+ 海报式封面卡
// R23-b: 「正在热映」横幅重构(左文右封面 + gradientText 标题) + 海报卡 cardHover 消费
// ============================================================
'use client'

import type { BookItem } from '../types'
import type { CSSProperties } from 'react'
import { usePublic } from '../ctx'
import { coverSrc, formatWords, withAlpha } from '../seo'
import { BookCover } from '../BookCover'
import { bookNavProps, Sk, StatusBadge } from '../bits'
import { Clapperboard, Play, Star } from 'lucide-react'

function TheaterSkeleton() {
  return (
    <div className="space-y-8">
      <Sk className="h-[300px] w-full sm:h-[380px]" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Sk key={i} className="aspect-[3/4] w-full" />
        ))}
      </div>
    </div>
  )
}

export function HomeTheater({ books, loading }: { books: BookItem[]; loading: boolean }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars

  // [R23-b-14] token 消费(未落地走 fallback)
  const tv = v
  const heroBg = tv.heroBg || `linear-gradient(120deg, ${withAlpha(v.primary, 0.92)}, ${withAlpha(v.accent, 0.85)})`
  const glowColor = tv.glowColor || v.primary
  const cardHover = tv.cardHover || 'grow'

  if (loading) return <TheaterSkeleton />
  if (!books.length) return null

  const [featured, ...rest] = books
  const bg = coverSrc(featured.cover)

  // [R23-b-15] 海报卡 hover: 消费 cardHover token(默认 grow), glow 经 CSS 变量注入辉光色
  const posterHoverClass =
    cardHover === 'grow'
      ? 'hover:scale-[1.03]'
      : cardHover === 'lift'
        ? 'hover:-translate-y-1.5'
        : cardHover === 'glow'
          ? 'hover:shadow-[0_14px_34px_-8px_var(--glow-c)]'
          : ''
  const posterStyle: CSSProperties = {
    borderRadius: v.radius,
    boxShadow: v.cardShadow === 'none' ? undefined : v.cardShadow,
  }

  return (
    <div className="space-y-8">
      {/* 全宽沉浸横幅 */}
      <section
        className="relative -mx-4 overflow-hidden px-4 pb-10 pt-24 sm:-mx-6 sm:px-6 sm:pt-32"
        aria-label="正在热映"
        style={{ minHeight: 320 }}
      >
        {/* 背景层: heroBg 打底 + 封面氛围(半透明模糊) + 底部渐变遮罩 */}
        <div className="absolute inset-0" aria-hidden>
          <div className="absolute inset-0" style={{ background: heroBg }} />
          {bg && (
            <img
              src={bg}
              alt=""
              loading="lazy"
              className="h-full w-full scale-110 object-cover opacity-40 blur-md"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          )}
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(to top, ${withAlpha(v.bg, 0.98)} 0%, ${withAlpha(v.bg, 0.62)} 55%, ${withAlpha(v.bg, 0.25)} 100%)` }}
          />
        </div>
        <div className="relative mx-auto flex max-w-6xl items-end gap-6">
          {/* 左: 文案 */}
          <div className="flex-1 space-y-3 pb-1">
            <span
              className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
              style={{ background: v.accent, color: v.primaryText }}
            >
              <Clapperboard className="h-3.5 w-3.5" aria-hidden />
              正在热映
            </span>
            <h1
              className="text-3xl font-black leading-tight sm:text-5xl"
              style={
                tv.gradientText
                  ? {
                      backgroundImage: `linear-gradient(92deg, ${v.text} 20%, ${v.accent})`,
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                    }
                  : { color: v.text, textShadow: '0 2px 12px rgba(0,0,0,0.6)' }
              }
            >
              <button
                type="button"
                onClick={() => navigate({ view: 'book', bookId: featured.id })}
                className="transition-opacity hover:opacity-80"
                style={{ color: 'inherit', font: 'inherit' }}
                aria-label={`查看《${featured.name}》详情`}
              >
                {featured.name}
              </button>
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: v.textMuted }}>
              <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" style={{ color: v.accent }} aria-hidden />{featured.category}</span>
              <span>{featured.author}</span>
              <span>{formatWords(featured.wordCount)}</span>
              <StatusBadge status={featured.status} />
            </div>
            <p className="line-clamp-2 max-w-2xl text-sm leading-relaxed" style={{ color: v.textMuted }}>
              {featured.intro || '暂无简介'}
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-85"
                style={{ background: v.primary, color: v.primaryText, borderRadius: v.radius }}
                onClick={() => navigate({ view: 'book', bookId: featured.id })}
              >
                <Play className="h-4 w-4" aria-hidden />
                立即观看
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-85"
                style={{ border: `1px solid ${v.border}`, color: v.text, borderRadius: v.radius, background: withAlpha(v.surface, 0.6) }}
                onClick={() => navigate({ view: 'book', bookId: featured.id })}
              >
                查看详情
              </button>
            </div>
          </div>
          {/* 右: 封面海报(左文右封面) */}
          <div
            className="hidden w-44 shrink-0 cursor-pointer overflow-hidden transition-transform duration-200 hover:-translate-y-1 sm:block"
            style={{ borderRadius: v.radius, boxShadow: v.cardShadow === 'none' ? undefined : v.cardShadow }}
            {...bookNavProps(navigate, featured.id)}
            aria-label={`查看《${featured.name}》详情`}
          >
            <BookCover name={featured.name} cover={featured.cover} className="aspect-[3/4] w-full" />
          </div>
        </div>
      </section>

      {/* 海报墙 */}
      <section aria-label="海报书库">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black" style={{ color: v.text }}>
            <Clapperboard className="h-5 w-5" style={{ color: v.primary }} aria-hidden />
            热映书库
          </h2>
          <span className="text-xs" style={{ color: v.textMuted }}>每日更新排片</span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {rest.map((b) => (
            <article
              key={b.id}
              className={`group relative cursor-pointer overflow-hidden transition-all duration-200 ${posterHoverClass}`}
              style={
                cardHover === 'glow'
                  ? ({ ...posterStyle, '--glow-c': glowColor } as CSSProperties)
                  : posterStyle
              }
              {...bookNavProps(navigate, b.id)}
              aria-label={`查看《${b.name}》详情`}
            >
              <BookCover name={b.name} cover={b.cover} className="aspect-[3/4] w-full" />
              <div
                className="absolute inset-x-0 bottom-0 p-3 pt-10"
                style={{ background: 'linear-gradient(to top, rgba(2,8,20,0.92) 0%, rgba(2,8,20,0.5) 60%, transparent 100%)' }}
              >
                <span className="absolute right-2 top-2"><StatusBadge status={b.status} small /></span>
                <h3 className="line-clamp-1 text-sm font-bold" style={{ color: v.text }}>{b.name}</h3>
                <p className="mt-0.5 line-clamp-1 text-[11px]" style={{ color: v.textMuted }}>
                  {b.author} · {formatWords(b.wordCount)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
