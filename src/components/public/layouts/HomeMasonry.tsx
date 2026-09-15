// ============================================================
// 首页布局 · masonry（珊瑚便签 drift, light）
// CSS columns 瀑布便签墙: 三色便签(珊瑚/松绿/柠黄, 按 id hash 确定性取色) + 窄幅撞色 hero
// [R23-II-b] 全新第 10 布局, 与 themes.ts drift preset 一一对应
// ============================================================
'use client'

import type { BookItem } from '../types'
import { usePublic } from '../ctx'
import { withAlpha } from '../seo'
import { BookCover } from '../BookCover'
import { bookNavProps, Sk } from '../bits'
import { StickyNote } from 'lucide-react'

function MasonrySkeleton() {
  const { theme } = usePublic()
  return (
    <div className="space-y-6">
      <Sk className="h-16 w-full" />
      <div className="columns-2 gap-4 md:columns-3 lg:columns-4">
        {/* 高低错落的便签骨架, 预演瀑布流节奏防 CLS */}
        {['h-28', 'h-36', 'h-24', 'h-32', 'h-28', 'h-40', 'h-24', 'h-32', 'h-28', 'h-36'].map((h, i) => (
          <div key={i} className="mb-4 break-inside-avoid">
            <Sk className={`${h} w-full`} style={{ borderRadius: theme.vars.radius }} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** [R23-II-b-6] 书 id 字符串 hash(确定性, 刷新/翻页不跳色) — 简单 31 进制滚动哈希取非负 int */
function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function HomeMasonry({ books, loading }: { books: BookItem[]; loading: boolean }) {
  const { site, theme, navigate } = usePublic()
  const v = theme.vars

  // [R23-II-b-5] token 消费: heroBg 已配三色气泡横幅; cardHover 默认 grow(轻放大)
  const tv = v
  const heroBg = tv.heroBg || `linear-gradient(120deg, ${withAlpha(v.primary, 0.92)}, ${withAlpha(v.accent, 0.85)})`
  const heroText = tv.heroText || v.primaryText
  const heroMuted = tv.heroMuted || withAlpha(heroText, 0.8)
  const cardHover = tv.cardHover || 'grow'

  if (loading) return <MasonrySkeleton />
  // 空态由 HomeView 的 EmptyState 统一渲染(与其他 8 布局同约定)
  if (!books.length) return null

  // [R23-II-b-5] 便签三色: 珊瑚/松绿直接取 drift 主题 primary/accent(primary=#ff6b6b, accent=#0ca678
  // 与 drift preset 色值一致); 柠黄 #fcc419 为 drift 珊瑚便签主题专属第三撞色 —— 主题 token 无对应色,
  // 经任务书豁免用固定值【仅 drift 主题配本色】, 其他主题误挂 masonry 布局时作中性暖黄点缀不破坏可读性
  const noteColors: [string, string, string] = [v.primary, v.accent, '#fcc419']
  const hoverClass =
    cardHover === 'grow'
      ? 'hover:scale-[1.03]'
      : cardHover === 'lift'
        ? 'hover:-translate-y-1.5'
        : cardHover === 'glow'
          ? 'hover:shadow-[0_14px_34px_-8px_var(--glow-c)]'
          : ''

  return (
    <div className="space-y-6">
      {/* [R23-II-b-5] 窄幅撞色 hero 横幅: 直接消费 vars.heroBg(drift 三色气泡渐变) */}
      <section
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-7"
        style={{ background: heroBg, color: heroText, borderRadius: v.radius }}
        aria-label="站点导语横幅"
      >
        <div className="min-w-0">
          <h1 className="text-xl font-black leading-snug sm:text-2xl">{site.name}</h1>
          {site.description && (
            <p className="mt-1 line-clamp-1 text-xs sm:text-sm" style={{ color: heroMuted }}>
              {site.description}
            </p>
          )}
        </div>
        {/* 右侧三色便签圆点装饰(呼应便签墙撞色) */}
        <div className="flex items-center gap-2" aria-hidden>
          {noteColors.map((c, i) => (
            <span key={i} className="inline-block h-3.5 w-3.5 rounded-full" style={{ background: c, boxShadow: `0 2px 6px ${withAlpha(c, 0.45)}` }} />
          ))}
          <StickyNote className="ml-1 h-5 w-5" style={{ color: heroMuted }} aria-hidden />
        </div>
      </section>

      {/* [R23-II-b-7] CSS columns 瀑布流: 2/3/4 栏响应, 便签卡 break-inside-avoid 不拆卡 */}
      <section aria-label="便签书墙" className="columns-2 gap-4 md:columns-3 lg:columns-4">
        {books.map((b) => {
          const h = hashId(b.id)
          const color = noteColors[h % 3]
          // 底色透明度 10%~14% 三档(与色号解耦取 hash 另一段, 分布更散)
          const tint = withAlpha(color, 0.1 + ((h >> 3) % 3) * 0.02)
          return (
            <article
              key={b.id}
              className={`mb-4 cursor-pointer break-inside-avoid transition-transform duration-200 ${hoverClass}`}
              style={{
                background: tint,
                borderLeft: `4px solid ${color}`,
                borderRadius: v.radius,
                boxShadow: v.cardShadow === 'none' ? undefined : v.cardShadow,
              }}
              {...bookNavProps(navigate, b.id)}
              aria-label={`查看《${b.name}》详情`}
            >
              <div className="flex gap-3 p-3.5">
                {/* 左: 封面小图 */}
                <BookCover name={b.name} cover={b.cover} className="aspect-[3/4] w-16 shrink-0 sm:w-20" />
                {/* 右: 书名+作者+简介截断 */}
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-sm font-bold leading-snug" style={{ color: v.text }}>
                    {b.name}
                  </h3>
                  <p className="mt-1 line-clamp-1 text-[11px]" style={{ color: v.textMuted }}>
                    {b.author}
                  </p>
                  <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed" style={{ color: v.textMuted }}>
                    {b.intro || `《${b.name}》正在连载，点击开始阅读。`}
                  </p>
                </div>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
