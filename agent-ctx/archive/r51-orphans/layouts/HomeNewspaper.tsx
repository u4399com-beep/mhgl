// ============================================================
// 首页布局 · newspaper（玄墨报馆 inkstone, dark）
// 报纸头版气质: 报头(日期线+刊号+双细线) + 头版头条大字衬线 + 多栏分栏排布
// [R23-II-b] 全新第 9 布局, 与 themes.ts inkstone preset 一一对应
// ============================================================
'use client'

import type { BookItem } from '../types'
import type { CSSProperties } from 'react'
import { usePublic } from '../ctx'
import { fmtDate, formatWords, withAlpha } from '../seo'
import { BookCover } from '../BookCover'
import { bookNavProps, Sk, StatusBadge } from '../bits'
import { Feather, Newspaper } from 'lucide-react'

// 骨架: 报头(含双细线位) + 头条 + 三栏, 预演版式节奏防 CLS
function NewspaperSkeleton() {
  return (
    <div className="space-y-8">
      {/* 报头骨架 */}
      <div className="space-y-2">
        <Sk className="mx-auto h-8 w-64" />
        <Sk className="mx-auto h-3 w-40" />
        <Sk className="h-[3px] w-full" />
        <Sk className="h-px w-full" />
      </div>
      {/* 头条骨架 */}
      <div className="grid gap-6 md:grid-cols-[1fr_240px]">
        <div className="space-y-3 py-1">
          <Sk className="h-4 w-24" />
          <Sk className="h-8 w-4/5" />
          <Sk className="h-3 w-full" />
          <Sk className="h-3 w-11/12" />
          <Sk className="h-3 w-2/3" />
        </div>
        <Sk className="aspect-[3/4] w-full" />
      </div>
      {/* 分栏骨架 */}
      <div className="grid gap-6 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-4">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="space-y-2">
                <Sk className="h-4 w-3/4" />
                <Sk className="h-3 w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function HomeNewspaper({ books, loading }: { books: BookItem[]; loading: boolean }) {
  const { site, theme, navigate } = usePublic()
  const v = theme.vars

  // [R23-II-b-1] token 消费(缺省走 fallback): 报馆人格 heroBg=墨面晕染/cardHover=none
  const tv = v
  const heroBg = tv.heroBg || `linear-gradient(120deg, ${withAlpha(v.primary, 0.92)}, ${withAlpha(v.accent, 0.85)})`
  const heroText = tv.heroText || v.primaryText
  const heroMuted = tv.heroMuted || withAlpha(heroText, 0.8)
  const serif = v.titleFont || v.fontFamily

  if (loading) return <NewspaperSkeleton />
  // 空态由 HomeView 的 EmptyState 统一渲染(与其他 8 布局同约定)
  if (!books.length) return null

  const [headline, ...rest] = books
  // 刊号 = 当前书单收录量(纯前端编号, 非发行数据)
  const issueNo = books.length
  const dateline = fmtDate(new Date().toISOString())

  // 头条之外按分类分板块(报纸栏目化, 全量展示不截断)
  const columns = new Map<string, BookItem[]>()
  for (const b of rest) {
    const key = b.category || '未分类'
    const arr = columns.get(key) || []
    arr.push(b)
    columns.set(key, arr)
  }

  // cardHover 消费: 报馆默认 none(静态排印), 其他主题误挂时仍给出对应 hover
  const cardHover = tv.cardHover || 'none'
  const hoverClass =
    cardHover === 'lift'
      ? 'hover:-translate-y-1.5'
      : cardHover === 'grow'
        ? 'hover:scale-[1.03]'
        : cardHover === 'glow'
          ? 'hover:shadow-[0_14px_34px_-8px_var(--glow-c)]'
          : ''
  const cardStyle: CSSProperties = {
    background: v.surface,
    border: `1px solid ${v.border}`,
    borderRadius: v.radius,
    boxShadow: v.cardShadow === 'none' ? undefined : v.cardShadow,
  }

  return (
    <div className="space-y-8">
      {/* [R23-II-b-2] 报头 masthead: 报名衬线大字 + 日期线/刊号线 + 报纸经典双细线(粗 3px+细 1px) */}
      <header
        className="px-4 pb-4 pt-5 sm:px-6"
        style={{ background: heroBg, borderRadius: v.radius, color: heroText }}
        aria-label="报头"
      >
        <div className="mx-auto max-w-3xl text-center">
          <p className="flex items-center justify-center gap-2 text-[10px] tracking-[0.4em]" style={{ color: heroMuted }}>
            <Feather className="h-3 w-3" aria-hidden />
            {site.name} · 在线晨晚刊
          </p>
          <h1 className="mt-1.5 text-3xl font-black leading-tight tracking-[0.18em] sm:text-4xl" style={{ fontFamily: serif }}>
            {site.name}
          </h1>
          {/* 日期线(左) + 刊号线(右), 中缝以点串接 */}
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] tabular-nums" style={{ color: heroMuted }}>
            <span>{dateline} · 星期{['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()]}</span>
            <span aria-hidden style={{ color: v.accent }}>◆</span>
            <span>第 {issueNo} 期 · 收录 {issueNo} 部</span>
          </div>
        </div>
        {/* 报头双细线: 粗线压细线, 报纸版式经典分隔 */}
        <div className="mt-4" aria-hidden>
          <div className="h-[3px] w-full" style={{ background: v.text }} />
          <div className="mt-[3px] h-px w-full" style={{ background: v.text }} />
        </div>
      </header>

      {/* 头版头条: 第一本书 — 大号衬线标题 + 导语 + 封面缩略(相框式) */}
      <section aria-label="头版头条">
        <article
          className={`grid gap-5 overflow-hidden p-5 sm:p-6 md:grid-cols-[1fr_220px] md:gap-7 ${hoverClass}`}
          style={cardStyle}
        >
          <div className="flex min-w-0 flex-col justify-center gap-3">
            {/* 头条眉标: 朱砂实底小块 + 加宽字距 */}
            <p className="inline-flex w-fit items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold tracking-[0.3em]" style={{ background: v.primary, color: v.primaryText, borderRadius: v.radius }}>
              <Newspaper className="h-3 w-3" aria-hidden />
              头版头条
            </p>
            <h2
              className="cursor-pointer text-2xl font-black leading-snug tracking-wide transition-opacity hover:opacity-80 sm:text-3xl"
              style={{ color: v.text, fontFamily: serif }}
              onClick={() => navigate({ view: 'book', bookId: headline.id })}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate({ view: 'book', bookId: headline.id })
                }
              }}
              aria-label={`阅读《${headline.name}》`}
            >
              {headline.name}
            </h2>
            {/* 导语: 报纸 lead 段, 左侧朱砂粗线引导 */}
            <p className="line-clamp-3 border-l-[3px] pl-3 text-sm leading-relaxed sm:text-[15px]" style={{ borderColor: v.primary, color: v.textMuted }}>
              {headline.intro || `${headline.author} 著 · ${headline.category} · ${formatWords(headline.wordCount)}。暂无导语，点击标题即刻开卷。`}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs" style={{ color: v.textMuted }}>
              <span>{headline.author} 著</span>
              <span style={{ color: v.accent }}>{headline.category}</span>
              <span className="tabular-nums">{formatWords(headline.wordCount)}</span>
              <StatusBadge status={headline.status} small />
            </div>
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => navigate({ view: 'book', bookId: headline.id })}
                className="px-4 py-1.5 text-xs font-bold tracking-[0.2em] transition-opacity hover:opacity-80"
                style={{ border: `1.5px solid ${v.primary}`, color: v.primary, borderRadius: v.radius }}
              >
                阅读全文
              </button>
            </div>
          </div>
          {/* 封面缩略: 相框式细边 + 图注 */}
          <figure
            className="mx-auto w-40 cursor-pointer p-1.5 sm:w-48 md:mx-0 md:w-full"
            style={{ border: `1px solid ${v.border}`, background: v.surfaceAlt, borderRadius: v.radius }}
            {...bookNavProps(navigate, headline.id)}
            aria-label={`查看《${headline.name}》详情`}
          >
            <BookCover name={headline.name} cover={headline.cover} className="aspect-[3/4] w-full" />
            <figcaption className="pt-1 text-center text-[10px] tracking-[0.25em]" style={{ color: v.textMuted }}>
              本期主打 · {headline.category}
            </figcaption>
          </figure>
        </article>
      </section>

      {/* [R23-II-b-4] 多栏分栏排布: md 2 栏 / lg 3 栏, 栏间 1px 主题 border 细分隔线(column-rule);
          各板块 break-inside-avoid 整块不跨栏, 模拟报纸分栏流 */}
      <section
        aria-label="报刊栏目"
        className="gap-8 md:columns-2 lg:columns-3"
        style={{ columnRule: `1px solid ${withAlpha(v.border, 0.8)}` }}
      >
        {[...columns.entries()].map(([col, list]) => (
          <section key={col} className="mb-8 break-inside-avoid" aria-label={`${col}板块`}>
            {/* [R23-II-b-3] 报头式板块标题: 细线上下夹住 + 小字号加宽字距; 书名号括角自绘
                (镜像 bits headingDeco='bracket' 形态 — SecTitle 固定字号/间距与双线报头版式冲突, 按任务书"不易则自绘"条款自绘) */}
            <h2
              className="flex items-center justify-center gap-2 border-y py-1.5 text-xs font-bold tracking-[0.35em]"
              style={{ borderColor: withAlpha(v.border, 0.9), color: v.text }}
            >
              <span aria-hidden className="text-sm leading-none" style={{ color: v.accent, fontFamily: serif }}>『</span>
              {col}
              <span aria-hidden className="text-sm leading-none" style={{ color: v.accent, fontFamily: serif }}>』</span>
            </h2>
            <ol>
              {list.map((b, i) => (
                <li
                  key={b.id}
                  className="cursor-pointer py-3 transition-opacity hover:opacity-80"
                  style={{ borderBottom: i < list.length - 1 ? `1px dashed ${withAlpha(v.border, 0.7)}` : undefined }}
                  {...bookNavProps(navigate, b.id)}
                  aria-label={`查看《${b.name}》详情`}
                >
                  <div className="flex items-baseline gap-2.5">
                    {/* 条目序号: 铜金衬线斜体, 报纸分类广告风 */}
                    <span className="shrink-0 text-sm font-black italic tabular-nums" style={{ color: withAlpha(v.accent, 0.85), fontFamily: serif }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-1 text-sm font-bold leading-snug tracking-wide" style={{ color: v.text, fontFamily: serif }}>
                        {b.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed" style={{ color: v.textMuted }}>
                        {b.intro || `${b.author} · ${formatWords(b.wordCount)} · ${b.latestChapter || '连载中'}`}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] tabular-nums" style={{ color: v.textMuted }}>
                        <span>{b.author}</span>
                        <span style={{ color: withAlpha(v.primary, 0.95) }}>{formatWords(b.wordCount)}</span>
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </section>
    </div>
  )
}
