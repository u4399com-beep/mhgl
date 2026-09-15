// ============================================================
// 首页布局 · magazine（玫瑰剧场 rose）
// 编辑部头版: 头条大卡(左封面右文案) + 次级要目榜单 + 栏目化分区, 红金戏剧化
// R23-b: 头条大卡(surfaceGradient 底 + heroBg 细顶条 + 今日焦点 ribbon) + 板块标题 SecTitle 化
// ============================================================
'use client'

import type { BookItem } from '../types'
import { usePublic } from '../ctx'
import { formatWords, withAlpha } from '../seo'
import { BookCover } from '../BookCover'
import { bookNavProps, SecTitle, Sk, StatusBadge } from '../bits'
import { Drama, Flame } from 'lucide-react'

function MagazineSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        <Sk className="aspect-[3/4] w-full max-w-sm" />
        <div className="space-y-4 py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Sk className="h-5 w-2/3" />
              <Sk className="h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Sk className="aspect-[3/4] w-full" />
            <Sk className="h-4 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function HomeMagazine({ books, loading }: { books: BookItem[]; loading: boolean }) {
  const { site, theme, navigate } = usePublic()
  const v = theme.vars

  // [R23-b-9] token 消费(未落地走 fallback)
  const tv = v
  const heroBg = tv.heroBg || `linear-gradient(120deg, ${withAlpha(v.primary, 0.92)}, ${withAlpha(v.accent, 0.85)})`
  const heroText = tv.heroText || v.primaryText
  const surfaceGradient = tv.surfaceGradient || v.surface

  if (loading) return <MagazineSkeleton />
  if (!books.length) return null

  const [cover, ...rest] = books
  const headlines = rest.slice(0, 5)

  // 栏目化：按分类分区
  const columns = new Map<string, BookItem[]>()
  for (const b of rest.slice(5)) {
    const key = b.category || '未分类'
    const arr = columns.get(key) || []
    if (arr.length < 4) arr.push(b)
    columns.set(key, arr)
  }

  return (
    <div className="space-y-10">
      {/* [R23-b-9] 编辑部头版: 第一本书「头条」大卡 — surfaceGradient 底 + heroBg 细顶条 + 今日焦点 ribbon */}
      <section
        className="relative overflow-hidden"
        style={{
          background: surfaceGradient,
          border: `1px solid ${v.border}`,
          borderRadius: v.radius,
          boxShadow: v.cardShadow === 'none' ? undefined : v.cardShadow,
        }}
        aria-label="今日焦点头条"
      >
        {/* heroBg 细顶条(4px, 头版上缘) */}
        <div className="h-1 w-full" style={{ background: heroBg }} aria-hidden />
        {/* 今日焦点 ribbon(纯 CSS 右侧斜切小旗) */}
        <span
          className="absolute right-0 top-4 z-10 px-3 py-1 text-xs font-bold tracking-widest"
          style={{ background: heroBg, color: heroText, clipPath: 'polygon(10px 0, 100% 0, 100% 100%, 0 100%)' }}
        >
          今日焦点
        </span>
        <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[220px_1fr] md:gap-8">
          {/* 左: 头条封面 */}
          <div
            className="mx-auto w-52 cursor-pointer overflow-hidden sm:w-60 md:mx-0"
            style={{ border: `2px solid ${v.accent}`, borderRadius: v.radius, padding: 4, background: v.bg }}
            {...bookNavProps(navigate, cover.id)}
            aria-label={`查看《${cover.name}》详情`}
          >
            <BookCover name={cover.name} cover={cover.cover} className="aspect-[3/4] w-full" />
          </div>
          {/* 右: 头条文案 */}
          <div className="flex min-w-0 flex-col justify-center gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: v.textMuted }}>
              <StatusBadge status={cover.status} />
              <span>{cover.author}</span>
              <span style={{ color: v.primary }}>{cover.category}</span>
              <span>{formatWords(cover.wordCount)}</span>
            </div>
            <h1 className="text-xl font-black leading-snug sm:text-2xl" style={{ color: v.text, fontFamily: v.titleFont }}>
              <button
                type="button"
                onClick={() => navigate({ view: 'book', bookId: cover.id })}
                className="transition-opacity hover:opacity-80"
                style={{ color: 'inherit', font: 'inherit' }}
                aria-label={`查看《${cover.name}》详情`}
              >
                {cover.name}
              </button>
            </h1>
            <p className="line-clamp-3 max-w-xl text-sm leading-relaxed" style={{ color: v.textMuted }}>
              {cover.intro || '暂无简介'}
            </p>
            <p className="text-xs" style={{ color: v.textMuted }}>
              最新：<span style={{ color: v.accent }}>{cover.latestChapter || '暂无章节'}</span>
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => navigate({ view: 'book', bookId: cover.id })}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold transition-opacity hover:opacity-85"
                style={{ background: v.primary, color: v.primaryText, borderRadius: v.radius }}
              >
                阅读头条
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* [R23-b-10] 次级要目: 头条之外的前 5 本(SecTitle 板块标题, R23-c headingDeco 自动升级装饰) */}
      <section aria-label="本期要目">
        <SecTitle
          icon={<Flame className="h-4 w-4" aria-hidden />}
          right={<span className="text-[10px] tracking-widest" style={{ color: v.textMuted }}>{site.name}</span>}
        >
          本期要目
        </SecTitle>
        <ol className="grid gap-x-8 sm:grid-cols-2">
          {headlines.map((b, i) => (
            <li
              key={b.id}
              className="group cursor-pointer border-b py-3"
              style={{ borderColor: withAlpha(v.border, 0.6) }}
              {...bookNavProps(navigate, b.id)}
              aria-label={`查看《${b.name}》详情`}
            >
              <div className="flex items-baseline gap-3">
                <span className="text-lg font-black italic" style={{ color: withAlpha(v.accent, 0.8), fontFamily: v.titleFont }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      className="text-base font-bold leading-snug transition-colors group-hover:opacity-80"
                      style={{ color: v.text, fontFamily: v.titleFont }}
                    >
                      {b.name}
                    </h3>
                    <StatusBadge status={b.status} small />
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs" style={{ color: v.textMuted }}>
                    {b.intro || `${b.author} · ${b.category}`}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 栏目化分区 */}
      {[...columns.entries()].map(([col, list]) => (
        <section key={col} aria-label={`${col}栏目`}>
          {/* [R23-b-11] 栏目标题统一 SecTitle(区块装饰交由 R23-c headingDeco 自动升级) */}
          <SecTitle icon={<Drama className="h-4 w-4" aria-hidden />}>{col}</SecTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {list.map((b) => (
              <article
                key={b.id}
                className="cursor-pointer overflow-hidden transition-transform duration-200 hover:-translate-y-1"
                style={{ background: v.surfaceAlt, border: `1px solid ${withAlpha(v.border, 0.7)}`, borderRadius: v.radius }}
                {...bookNavProps(navigate, b.id)}
                aria-label={`查看《${b.name}》详情`}
              >
                <BookCover name={b.name} cover={b.cover} className="aspect-[3/4] w-full" />
                <div className="p-2.5">
                  <h3 className="line-clamp-1 text-sm font-bold" style={{ color: v.text, fontFamily: v.titleFont }}>{b.name}</h3>
                  <p className="line-clamp-1 text-[11px]" style={{ color: v.textMuted }}>{b.author}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
