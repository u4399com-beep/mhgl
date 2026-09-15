// ============================================================
// 首页布局 · list（纸墨书香 paper）
// 居中报头 + 编号排行榜式行列表，衬线书卷气
// R23-b: 窄条 hero(heroBg+标语) + 本站速览统计条(真实推导) + top3 渐变序号徽章
// ============================================================
'use client'

import type { BookItem } from '../types'
import { usePublic } from '../ctx'
import { fmtDate, formatWords, withAlpha } from '../seo'
import { BookCover } from '../BookCover'
import { bookNavProps, Sk, StatusBadge } from '../bits'
import { BookOpen, Feather } from 'lucide-react'

function ListSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3">
          <Sk className="h-6 w-8" />
          <Sk className="aspect-[3/4] w-14 shrink-0" />
          <div className="flex-1 space-y-2">
            <Sk className="h-4 w-1/2" />
            <Sk className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function HomeList({ books, loading }: { books: BookItem[]; loading: boolean }) {
  const { site, theme, navigate } = usePublic()
  const v = theme.vars

  // [R23-b-4] token 消费(未落地走 fallback)
  const tv = v
  const heroBg = tv.heroBg || `linear-gradient(120deg, ${withAlpha(v.primary, 0.92)}, ${withAlpha(v.accent, 0.85)})`
  const heroText = tv.heroText || v.primaryText

  if (loading) return <ListSkeleton />
  if (!books.length) return null

  // [R23-b-5] 本站速览: 三个数字块全部由当前书单真实推导(本页收录/今日有更新/连载中), 不造假精确数据
  const todayStr = fmtDate(new Date().toISOString())
  const todayCount = books.filter((b) => !!b.updatedAt && fmtDate(b.updatedAt) === todayStr).length
  const ongoingCount = books.filter((b) => b.status === 'ongoing').length
  const stats: Array<{ label: string; value: number; hint: string }> = [
    { label: '收书量', value: books.length, hint: '本页在架书籍数' },
    { label: '今日更新', value: todayCount, hint: '本页今日有更新的书籍数' },
    { label: '在更作品', value: ongoingCount, hint: '本页连载中作品数' },
  ]

  return (
    <div className="mx-auto max-w-3xl">
      {/* [R23-b-4] 窄条 hero 横幅(heroBg + 标语); 报头 h1 保持全页唯一, 此处仅标语不设标题 */}
      <div
        className="mb-6 flex min-h-[44px] items-center justify-center gap-2.5 px-4 py-2"
        style={{ background: heroBg, color: heroText, borderRadius: v.radius }}
      >
        <BookOpen className="h-3.5 w-3.5 shrink-0" style={{ color: heroText }} aria-hidden />
        <p className="truncate text-xs font-medium tracking-[0.35em]">好书如约 · 日日更新 · 免费畅读</p>
      </div>

      {/* 居中报头 */}
      <div className="mb-8 text-center">
        <h1
          className="text-3xl font-black tracking-[0.2em] sm:text-4xl"
          style={{ color: v.text, fontFamily: v.titleFont }}
        >
          {site.name}
        </h1>
        <div className="mt-3 flex items-center justify-center gap-3" aria-hidden>
          <span className="h-px w-16" style={{ background: withAlpha(v.primary, 0.5) }} />
          <Feather className="h-4 w-4" style={{ color: v.accent }} />
          <span className="h-px w-16" style={{ background: withAlpha(v.primary, 0.5) }} />
        </div>
        {site.description && (
          <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed tracking-widest" style={{ color: v.textMuted }}>
            {site.description}
          </p>
        )}
      </div>

      {/* [R23-b-5] 本站速览统计条: 3 数字块(数据源=当前书单可推导真实量, 口径见注释) */}
      <section className="mb-8" aria-label="本站速览">
        <div
          className="grid grid-cols-3 overflow-hidden"
          style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius, boxShadow: v.cardShadow === 'none' ? undefined : v.cardShadow }}
        >
          {stats.map((s, i) => (
            <div
              key={s.label}
              className="flex flex-col items-center gap-1 px-2 py-3.5"
              style={{ borderLeft: i > 0 ? `1px dashed ${withAlpha(v.border, 0.9)}` : undefined }}
            >
              <span className="text-xl font-black tabular-nums" style={{ color: v.primary, fontFamily: v.titleFont }} title={s.hint}>
                {s.value}
              </span>
              <span className="text-[11px] tracking-widest" style={{ color: v.textMuted }}>{s.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-center text-[10px]" style={{ color: v.textMuted }}>统计口径: 当前书单页实时推导</p>
      </section>

      {/* 排行榜式编号行列表 */}
      <section
        className="overflow-hidden"
        style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius, boxShadow: v.cardShadow === 'none' ? undefined : v.cardShadow }}
        aria-label="书籍排行"
      >
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${v.border}`, background: v.surfaceAlt }}
        >
          <h2 className="flex items-center gap-2 text-sm font-bold tracking-widest" style={{ color: v.text, fontFamily: v.titleFont }}>
            <BookOpen className="h-4 w-4" style={{ color: v.primary }} aria-hidden />
            书籍排行
          </h2>
          <span className="text-[11px]" style={{ color: v.textMuted }}>按最近更新排序</span>
        </div>
        <ol>
          {books.map((b, i) => {
            const top = i < 3
            return (
              <li
                key={b.id}
                className="group cursor-pointer px-4 py-3.5 transition-colors sm:px-5"
                style={{ borderBottom: i < books.length - 1 ? `1px dashed ${withAlpha(v.border, 0.9)}` : undefined }}
                {...bookNavProps(navigate, b.id)}
                aria-label={`查看《${b.name}》详情`}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  {/* [R23-b-6] 序号徽章: top3 实底主色→accent 渐变圆形徽章, 其余主色描边 */}
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black tabular-nums"
                    style={
                      top
                        ? {
                            background: `linear-gradient(135deg, ${v.primary}, ${v.accent})`,
                            color: v.primaryText,
                            boxShadow: `0 2px 8px ${withAlpha(v.primary, 0.35)}`,
                            fontFamily: v.titleFont,
                          }
                        : { border: `1.5px solid ${withAlpha(v.primary, 0.45)}`, color: v.textMuted }
                    }
                    aria-label={`第 ${i + 1} 名`}
                  >
                    {i + 1}
                  </span>
                  <BookCover name={b.name} cover={b.cover} showAuthor={b.author} className="aspect-[3/4] w-14 shrink-0 sm:w-16" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        className="text-base font-bold transition-colors"
                        style={{ color: top ? v.primary : v.text, fontFamily: v.titleFont }}
                      >
                        {b.name}
                      </h3>
                      <StatusBadge status={b.status} small />
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs" style={{ color: v.textMuted }}>
                      <span>{b.author}</span>
                      <span style={{ color: v.accent }}>{b.category}</span>
                      <span>{formatWords(b.wordCount)}</span>
                    </p>
                    <p className="mt-1.5 line-clamp-1 text-xs leading-relaxed" style={{ color: v.textMuted }}>
                      {b.intro || `最新章节：${b.latestChapter || '暂无'}`}
                    </p>
                    <p className="mt-1 line-clamp-1 text-[11px]" style={{ color: withAlpha(v.primary, 0.85) }}>
                      最新：{b.latestChapter || '暂无章节'}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}
