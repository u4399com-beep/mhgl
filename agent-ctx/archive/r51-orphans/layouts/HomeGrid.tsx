// ============================================================
// 首页布局 · grid（活力橙夏 mango）
// 大圆角卡片网格 2/3/4/5/6 列 + 圆角大封面
// R23-b: 富 hero(heroBg+纹理层+漂浮光斑+gradientText 大标题) + 卡片升级(surfaceGradient/cardHover/顶部渐变条)
// ============================================================
'use client'

import type { BookItem } from '../types'
import type { CSSProperties } from 'react'
import { usePublic } from '../ctx'
import { formatWords, withAlpha } from '../seo'
import { BookCover } from '../BookCover'
import { bookNavProps, Sk, StatusBadge } from '../bits'
import { LibraryBig, Sun } from 'lucide-react'

// [R23-b-1] R23-c 主题视觉 token —— 并行时序下 ThemeDef.vars 类型尚未落地, 以可选交叉类型消费,
// 全部取值走 || / ?? 本地 fallback, token 未到位时不炸、到位后自动生效
function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Sk className="aspect-[3/4] w-full" />
          <Sk className="h-4 w-4/5" />
          <Sk className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export function HomeGrid({ books, loading }: { books: BookItem[]; loading: boolean }) {
  const { site, theme, navigate } = usePublic()
  const v = theme.vars

  // [R23-b-1] 新 token 消费(未落地时走本地 fallback)
  const tv = v
  const heroBg = tv.heroBg || `linear-gradient(120deg, ${withAlpha(v.primary, 0.92)}, ${withAlpha(v.accent, 0.85)})`
  const heroText = tv.heroText || v.primaryText
  const heroMuted = tv.heroMuted || withAlpha(heroText, 0.8)
  const surfaceGradient = tv.surfaceGradient || v.surface
  const glowColor = tv.glowColor || v.primary
  const cardHover = tv.cardHover || 'lift'

  if (loading) return <GridSkeleton />
  if (!books.length) return null

  // [R23-b-3] cardHover → 卡片 hover 形态(glow 经 CSS 变量注入辉光色, 纯 CSS 无 JS)
  const hoverClass =
    cardHover === 'lift'
      ? 'hover:-translate-y-1.5'
      : cardHover === 'grow'
        ? 'hover:scale-[1.03]'
        : cardHover === 'glow'
          ? 'hover:shadow-[0_14px_34px_-8px_var(--glow-c)]'
          : ''
  const cardStyle: CSSProperties = {
    background: surfaceGradient,
    border: `1px solid ${v.border}`,
    borderRadius: v.radius,
    boxShadow: v.cardShadow === 'none' ? undefined : v.cardShadow,
  }

  return (
    <div className="space-y-8">
      {/* [R23-b-2] hero 升级: heroBg 富背景 + patternBg 纹理层 + 纯 CSS 漂浮光斑 + gradientText 大标题 */}
      <section
        className="relative overflow-hidden px-6 py-10 sm:px-10 sm:py-14"
        style={{ background: heroBg, borderRadius: v.radius }}
        aria-label="站点欢迎横幅"
      >
        {/* 装饰纹理层(R23-c patternBg 存在才渲染, pointer-events-none 不挡交互) */}
        {tv.patternBg && (
          <div className="pointer-events-none absolute inset-0" style={{ background: tv.patternBg }} aria-hidden />
        )}
        {/* 纯 CSS 漂浮装饰圆: 半透明主色/强调色/heroText + blur */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <span className="absolute -left-8 top-4 h-36 w-36 rounded-full opacity-70 blur-2xl" style={{ background: withAlpha(v.primary, 0.5) }} />
          <span className="absolute -right-4 top-10 h-28 w-28 rounded-full opacity-60 blur-2xl" style={{ background: withAlpha(v.accent, 0.55) }} />
          <span className="absolute bottom-0 left-1/3 h-24 w-24 rounded-full opacity-50 blur-3xl" style={{ background: withAlpha(heroText, 0.35) }} />
        </div>
        <Sun className="absolute -right-6 -top-6 h-36 w-36 opacity-15" style={{ color: heroText }} aria-hidden />
        <div className="relative max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: heroMuted }}>
            今日书单
          </p>
          <h1
            className="mt-2 text-2xl font-black leading-snug sm:text-3xl"
            style={
              tv.gradientText
                ? {
                    background: `linear-gradient(92deg, ${heroText} 30%, ${v.accent})`,
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                  }
                : { color: heroText }
            }
          >
            {site.name} · 好书每天看
          </h1>
          {site.description && (
            <p className="mt-2 line-clamp-2 text-sm" style={{ color: heroMuted }}>
              {site.description}
            </p>
          )}
        </div>
      </section>

      {/* 卡片网格 */}
      <section aria-label="书籍网格">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black" style={{ color: v.text }}>
            <LibraryBig className="h-5 w-5" style={{ color: v.primary }} aria-hidden />
            全部书籍
          </h2>
          <span className="text-xs" style={{ color: v.textMuted }}>持续更新中</span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {books.map((b) => (
            <article
              key={b.id}
              className={`group cursor-pointer overflow-hidden transition-all duration-200 ${hoverClass}`}
              style={cardHover === 'glow' ? ({ ...cardStyle, '--glow-c': glowColor } as CSSProperties) : cardStyle}
              {...bookNavProps(navigate, b.id)}
              aria-label={`查看《${b.name}》详情`}
            >
              {/* [R23-b-3] 卡顶 2px 主色→accent 渐变条 */}
              <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${v.primary}, ${v.accent})` }} aria-hidden />
              <div className="relative">
                <BookCover name={b.name} cover={b.cover} className="aspect-[3/4] w-full" />
                <span className="absolute left-2 top-2"><StatusBadge status={b.status} small /></span>
                <span
                  className="absolute bottom-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ background: withAlpha(v.primaryText, 0.9), color: v.primary }}
                >
                  {formatWords(b.wordCount)}
                </span>
              </div>
              <div className="space-y-1 p-3">
                <h3 className="line-clamp-1 text-sm font-bold" style={{ color: v.text }}>{b.name}</h3>
                <p className="line-clamp-1 text-xs" style={{ color: v.textMuted }}>{b.author}</p>
                <p className="line-clamp-1 text-[11px]" style={{ color: v.textMuted }}>
                  <span className="mr-1 rounded-full px-1.5 py-px" style={{ background: v.surfaceAlt, color: v.accent }}>{b.category}</span>
                  {b.latestChapter || '暂无章节'}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
