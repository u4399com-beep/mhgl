// ============================================================
// 首页布局 · timeline（长河编年 chronicle, light）
// 垂直中轴 + 左右交错书卡(md+ 交错/移动端单侧), 中文卷号(卷一…卷十二), 余量折叠徽章
// [R23-II-b] 全新第 12 布局, 与 themes.ts chronicle preset 一一对应
// ============================================================
'use client'

import type { BookItem } from '../types'
import { usePublic } from '../ctx'
import { formatWords, withAlpha } from '../seo'
import { BookCover } from '../BookCover'
import { bookNavProps, SecTitle, Sk } from '../bits'
import { BookOpen, Hourglass } from 'lucide-react'

/** 中文卷号(前 12 卷, 与任务书"前 12 本+余量徽章"对齐) */
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'] as const

function TimelineSkeleton() {
  return (
    <div className="space-y-6">
      <Sk className="h-28 w-full" />
      <Sk className="mx-auto h-5 w-40" />
      <div className="relative">
        <span aria-hidden className="absolute bottom-0 left-4 top-0 w-px -translate-x-1/2 md:left-1/2" />
        <div className="space-y-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`flex pl-10 md:pl-0 ${i % 2 === 0 ? 'md:justify-start' : 'md:justify-end'}`}
            >
              <Sk className="h-28 w-full max-w-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function HomeTimeline({ books, loading }: { books: BookItem[]; loading: boolean }) {
  const { site, theme, navigate } = usePublic()
  const v = theme.vars

  // token 消费(缺省走 fallback): heroBg=卷轴米黄渐变 / cardHover=lift
  const tv = v
  const heroBg = tv.heroBg || `linear-gradient(120deg, ${withAlpha(v.primary, 0.92)}, ${withAlpha(v.accent, 0.85)})`
  const heroText = tv.heroText || v.primaryText
  const heroMuted = tv.heroMuted || withAlpha(heroText, 0.8)
  const serif = v.titleFont || v.fontFamily
  const cardHover = tv.cardHover || 'lift'
  const hoverClass =
    cardHover === 'lift'
      ? 'hover:-translate-y-1'
      : cardHover === 'grow'
        ? 'hover:scale-[1.03]'
        : cardHover === 'glow'
          ? 'hover:shadow-[0_14px_34px_-8px_var(--glow-c)]'
          : ''

  if (loading) return <TimelineSkeleton />
  // 空态由 HomeView 的 EmptyState 统一渲染(与其他 8 布局同约定)
  if (!books.length) return null

  const items = books.slice(0, 12)
  const overflow = books.length - items.length

  return (
    <div className="space-y-6">
      {/* [R23-II-b-12] 卷轴式 hero: heroBg 打底 + 卷轴轴杆(左右竖杆) + 菱形花饰标题(✦ 自绘,
          镜像 bits headingDeco='ornament' 形态; hero 大标题需衬线大字与 SecTitle 固定字号冲突, 故自绘) */}
      <section
        className="relative overflow-hidden px-8 py-9 sm:px-12"
        style={{ background: heroBg, borderRadius: v.radius, color: heroText }}
        aria-label="长卷横幅"
      >
        {/* 卷轴纹理层(patternBg 存在才渲染, pointer-events-none) */}
        {tv.patternBg && <div className="pointer-events-none absolute inset-0" style={{ background: tv.patternBg }} aria-hidden />}
        {/* 卷轴轴杆: 左右两根铜棕→松绿竖杆 */}
        <span aria-hidden className="absolute inset-y-0 left-0 w-2 rounded-r-full" style={{ background: `linear-gradient(180deg, ${v.primary}, ${withAlpha(v.accent, 0.8)})` }} />
        <span aria-hidden className="absolute inset-y-0 right-0 w-2 rounded-l-full" style={{ background: `linear-gradient(180deg, ${v.primary}, ${withAlpha(v.accent, 0.8)})` }} />
        <div className="relative mx-auto max-w-2xl text-center">
          <p className="text-[11px] tracking-[0.45em]" style={{ color: heroMuted }}>
            长河编年 · 书卷长廊
          </p>
          <h1 className="mt-2 flex items-center justify-center gap-3 text-2xl font-black leading-snug tracking-[0.15em] sm:text-3xl" style={{ fontFamily: serif }}>
            <span aria-hidden className="text-base" style={{ color: v.accent }}>✦</span>
            {site.name}
            <span aria-hidden className="text-base" style={{ color: v.accent }}>✦</span>
          </h1>
          {site.description && (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed sm:text-sm" style={{ color: heroMuted }}>
              {site.description}
            </p>
          )}
          {/* 卷轴收口: 渐变细线 + 中央菱形 */}
          <div className="mt-4 flex items-center gap-2" aria-hidden>
            <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${withAlpha(v.primary, 0.6)})` }} />
            <span className="inline-block h-2 w-2 rotate-45" style={{ background: v.accent }} />
            <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${withAlpha(v.primary, 0.6)}, transparent)` }} />
          </div>
        </div>
      </section>

      {/* 编年书卷(SecTitle: chronicle headingDeco='ornament' 自动套菱形花饰装饰) */}
      <SecTitle icon={<BookOpen className="h-4 w-4" aria-hidden />}>编年书卷</SecTitle>

      {/* [R23-II-b-13] 垂直中轴(1px 主题 border) + 左右交错书卡: md+ 偶数卷居左/奇数卷居右, 移动端单侧 */}
      <section aria-label="编年时间轴">
        <div className="relative">
          {/* 中轴线 + 顶端菱形起点 */}
          <span aria-hidden className="absolute bottom-2 left-4 top-0 w-px -translate-x-1/2 md:left-1/2" style={{ background: withAlpha(v.border, 0.9) }} />
          <span aria-hidden className="absolute left-4 top-0 inline-block h-2.5 w-2.5 -translate-x-1/2 rotate-45 md:left-1/2" style={{ background: v.primary }} />

          <ol>
            {items.map((b, i) => {
              const left = i % 2 === 0
              return (
                <li key={b.id} className="relative pb-7 pl-10 md:grid md:grid-cols-2 md:gap-14 md:pl-0">
                  {/* 铜棕轴点(主题 primary, 外扩淡晕) */}
                  <span
                    aria-hidden
                    className="absolute left-4 top-2 inline-block h-3 w-3 -translate-x-1/2 rounded-full md:left-1/2"
                    style={{ background: v.primary, boxShadow: `0 0 0 4px ${withAlpha(v.primary, 0.18)}` }}
                  />
                  <article
                    className={`group cursor-pointer p-3 transition-transform duration-200 sm:p-3.5 ${hoverClass} ${
                      left ? 'md:col-start-1 md:justify-self-end' : 'md:col-start-2 md:justify-self-start'
                    }`}
                    style={{
                      background: v.surface,
                      border: `1px solid ${v.border}`,
                      borderRadius: v.radius,
                      boxShadow: v.cardShadow === 'none' ? undefined : v.cardShadow,
                    }}
                    {...bookNavProps(navigate, b.id)}
                    aria-label={`查看《${b.name}》详情`}
                  >
                    <div className="flex gap-3">
                      <BookCover name={b.name} cover={b.cover} className="aspect-[3/4] w-20 shrink-0" />
                      <div className="min-w-0 flex-1">
                        {/* 中文卷号徽章: 卷一/卷二… 铜棕实底衬线 */}
                        <span
                          className="inline-block px-2 py-0.5 text-[11px] font-bold tracking-[0.2em]"
                          style={{ background: v.primary, color: v.primaryText, borderRadius: v.radius, fontFamily: serif }}
                        >
                          卷{CN_NUM[i]}
                        </span>
                        <h3 className="mt-1.5 line-clamp-1 text-base font-bold leading-snug transition-opacity group-hover:opacity-80" style={{ color: v.text, fontFamily: serif }}>
                          {b.name}
                        </h3>
                        <p className="mt-0.5 line-clamp-1 text-[11px]" style={{ color: v.textMuted }}>
                          {b.author} · <span style={{ color: v.accent }}>{b.category}</span> · {formatWords(b.wordCount)}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: v.textMuted }}>
                          {b.intro || `${b.latestChapter || '新书入卷'} — 点击开卷阅读。`}
                        </p>
                      </div>
                    </div>
                  </article>
                </li>
              )
            })}

            {/* [R23-II-b-14] 余量折叠徽章: 超过 12 卷不展开, 收进「余 N 部待编」徽章 */}
            {overflow > 0 && (
              <li className="relative flex items-center pl-10 md:justify-center md:pl-0">
                <span
                  aria-hidden
                  className="absolute left-4 top-1/2 inline-block h-3 w-3 -translate-x-1/2 rounded-full md:left-1/2"
                  style={{ border: `2px solid ${withAlpha(v.primary, 0.7)}`, background: v.surface }}
                />
                <span
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium tracking-wider"
                  style={{ border: `1px dashed ${withAlpha(v.primary, 0.55)}`, color: v.primary, borderRadius: 999, background: withAlpha(v.primary, 0.06) }}
                >
                  <Hourglass className="h-3.5 w-3.5" aria-hidden />
                  余 {overflow} 部待编入长卷
                </span>
              </li>
            )}
          </ol>
        </div>
      </section>
    </div>
  )
}
