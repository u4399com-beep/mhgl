// ============================================================
// 首页布局 · pili（仿霹雳书屋 pilishuwu.com）
// 白卡书城 DNA: 左主栏(精品推荐封面网格/最新入库/最近更新表格) + 右侧橙色头排行榜
// 奶油区块标题(左橙竖条) + 复古直角白卡 + 橙色点缀红号次
// R23-b: 跑马灯风格公告条(heroBg+heroText) + 各板块双边框盒(box-shadow 模拟 double border)
// ============================================================
'use client'

import type { BookItem } from '../types'
import type { CSSProperties } from 'react'
import { usePublic } from '../ctx'
import { fmtDate, formatWords, withAlpha } from '../seo'
import { BookCover } from '../BookCover'
import { bookNavProps, Sk, StatusBadge } from '../bits'
import { Megaphone } from 'lucide-react'

/** [R23-b-17] 复古双边框盒: 1px border + box-shadow 外扩 3px 内衬 surface + 1px 外线 = double border 效果 */
function doubleFrameStyle(v: { border: string; surface: string }): CSSProperties {
  return {
    border: `1px solid ${v.border}`,
    boxShadow: `0 0 0 3px ${v.surface}, 0 0 0 4px ${v.border}`,
  }
}

/** 区块标题 — 左橙竖条 + 深色主字 + 橙色副字 + 右侧「更多」(原站 in-title-big DNA) */
function PiliSecTitle({ main, sub, more }: { main: string; sub: string; more?: boolean }) {
  const v = usePublic().theme.vars
  return (
    <div className="mb-4 flex items-end justify-between gap-3 border-b pb-2.5" style={{ borderColor: withAlpha(v.primary, 0.35) }}>
      <h3 className="flex items-center gap-2.5 text-xl font-bold leading-none" style={{ color: v.text }}>
        <span className="inline-block h-5 w-1.5" style={{ background: v.primary }} aria-hidden />
        {main}
        <em className="not-italic" style={{ color: v.primary }}>{sub}</em>
      </h3>
      {more && (
        <span className="shrink-0 text-xs transition-opacity hover:opacity-70" style={{ color: v.textMuted }} aria-hidden>
          更多 »
        </span>
      )}
    </div>
  )
}

/** 封面卡(书名+作者居中, 原站 mod-cover-list DNA) */
function PiliCoverCard({ book }: { book: BookItem }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  return (
    <article
      className="group cursor-pointer p-2 transition-shadow"
      style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius, boxShadow: v.cardShadow === 'none' ? undefined : v.cardShadow }}
      {...bookNavProps(navigate, book.id)}
      aria-label={`查看《${book.name}》详情`}
    >
      <div className="relative">
        <BookCover name={book.name} cover={book.cover} className="aspect-[3/4] w-full" showAuthor={book.author} />
        <span className="absolute left-1 top-1"><StatusBadge status={book.status} small /></span>
      </div>
      <h4 className="mt-2 truncate text-center text-[13px] font-medium leading-5" style={{ color: v.text }} title={book.name}>{book.name}</h4>
      <p className="truncate text-center text-[11px] leading-4" style={{ color: v.textMuted }}>{book.author}</p>
    </article>
  )
}

/** 橙色头排行榜(原站 in-phlist / in-monrank DNA): 渐变橙头 + 名次列表(前3橙号) */
function PiliRankPanel({ books }: { books: BookItem[] }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  const ranked = [...books].sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0)).slice(0, 10)
  if (!ranked.length) return null
  return (
    <section
      data-pili-rank
      // [R23-b-17] 排行榜板块双边框盒
      style={{
        background: v.surface,
        borderRadius: v.radius,
        boxShadow: v.cardShadow === 'none' ? undefined : v.cardShadow,
        ...doubleFrameStyle(v),
      }}
      aria-label="点击排行"
    >
      <header
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold tracking-widest"
        style={{ background: `linear-gradient(90deg, ${v.primary}, #ff9a6a)`, color: v.primaryText, borderRadius: `${v.radius} ${v.radius} 0 0` }}
      >
        <span aria-hidden>榜</span>点击排行
      </header>
      <ol className="px-2 py-1.5">
        {ranked.map((b, i) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => navigate({ view: 'book', bookId: b.id })}
              className="flex min-h-[40px] w-full items-center gap-2.5 border-b px-1.5 py-2 text-left transition-colors last:border-b-0 hover:bg-[#fff8f0]"
              style={{ borderColor: withAlpha(v.border, 0.6) }}
              aria-label={`查看排行榜第${i + 1}名《${b.name}》`}
            >
              <span
                className="w-5 shrink-0 text-center text-sm font-bold tabular-nums"
                style={{ color: i < 3 ? v.accent : v.textMuted }}
              >
                {i + 1}
              </span>
              <span className="line-clamp-1 flex-1 text-[13px]" style={{ color: v.text }}>{b.name}</span>
              <span className="shrink-0 text-[10px] tabular-nums" style={{ color: v.textMuted }}>{formatWords(b.wordCount)}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** 最近更新表格(原站 in-rise-ta DNA: 时间/分类/书名+最新章) */
function PiliUpdateTable({ books }: { books: BookItem[] }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  const rows = books.slice(0, 18)
  if (!rows.length) return null
  return (
    // [R23-b-17] 最近更新板块双边框盒(内层表格外壳保持自身 border, 复古双线感)
    <section
      data-pili-section="latest-updates"
      aria-label="最近更新"
      className="p-3 sm:p-4"
      style={{ ...doubleFrameStyle(v), borderRadius: v.radius }}
    >
      <PiliSecTitle main="最近" sub="更新" more />
      <div className="overflow-x-auto" style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius }}>
        <table data-pili-table className="w-full min-w-[480px] border-collapse text-left text-[13px]">
          <thead>
            <tr style={{ background: v.surfaceAlt, color: v.textMuted }}>
              <th scope="col" className="w-24 whitespace-nowrap px-3 py-2 font-normal">时间</th>
              <th scope="col" className="w-24 whitespace-nowrap px-3 py-2 font-normal">分类</th>
              <th scope="col" className="px-3 py-2 font-normal">书名 / 最新章节</th>
              <th scope="col" className="hidden w-24 px-3 py-2 text-right font-normal sm:table-cell">字数</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t" style={{ borderColor: withAlpha(v.border, 0.55) }}>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums" style={{ color: v.textMuted }}>{fmtDate(b.updatedAt)}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'home' })}
                    className="transition-opacity hover:underline"
                    style={{ color: v.primary }}
                    aria-label={`分类 ${b.category}`}
                  >
                    {b.category}
                  </button>
                </td>
                <td className="min-w-0 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'book', bookId: b.id })}
                    className="block max-w-full truncate text-left transition-colors hover:text-[#fd8929]"
                    style={{ color: v.text }}
                    aria-label={`查看《${b.name}》详情`}
                  >
                    <span className="font-medium">《{b.name}》</span>
                    <span className="ml-1.5" style={{ color: v.textMuted }}>{b.latestChapter || '暂无章节'}</span>
                  </button>
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 text-right tabular-nums sm:table-cell" style={{ color: v.textMuted }}>
                  {formatWords(b.wordCount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PiliSkeleton() {
  return (
    <div className="space-y-8">
      {/* [R23-b-16] 公告条骨架位(与真实结构对齐防 CLS) */}
      <Sk className="h-9 w-full" />
      <div>
        <Sk className="mb-4 h-7 w-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Sk className="aspect-[3/4] w-full" />
              <Sk className="mx-auto h-3.5 w-4/5" />
              <Sk className="mx-auto h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <Sk className="mb-4 h-7 w-40" />
        <div className="space-y-2.5">
          {Array.from({ length: 8 }).map((_, i) => <Sk key={i} className="h-9 w-full" />)}
        </div>
      </div>
    </div>
  )
}

export function HomePili({ books, loading }: { books: BookItem[]; loading: boolean }) {
  const v = usePublic().theme.vars
  // [R23-b-16] token 消费(未落地走 fallback: 主色→强调色渐变 + primaryText, 恰为霹雳橙红复古配色)
  const tv = v
  const heroBg = tv.heroBg || `linear-gradient(120deg, ${withAlpha(v.primary, 0.92)}, ${withAlpha(v.accent, 0.85)})`
  const heroText = tv.heroText || v.primaryText

  if (loading) return <div data-pili-home><PiliSkeleton /></div>
  if (!books.length) return null

  const featured = books.slice(0, 10)
  const fresh = books.slice(10, 22)

  return (
    <div data-pili-home>
      {/* [R23-b-16] 跑马灯风格公告条: heroBg 底 + heroText 公告文案(纯 CSS 静态, 不动画) */}
      <div
        className="mb-6 flex items-center gap-2 overflow-hidden px-4 py-2.5 text-xs"
        style={{ background: heroBg, color: heroText, borderRadius: v.radius }}
        aria-label="书屋公告"
      >
        <Megaphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 truncate tracking-wider">
          公告：本站全部小说免费在线阅读，每日持续更新；使用顶部搜索框可按书名 / 作者查找好书。
        </p>
        <span className="hidden shrink-0 tracking-[0.3em] opacity-80 sm:inline">PILI BOOKSTORE</span>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:gap-6">
      {/* 左主栏 */}
      <div className="min-w-0 flex-1 space-y-8">
        <section
          data-pili-section="featured"
          aria-label="精品推荐"
          className="p-3 sm:p-4"
          style={{ ...doubleFrameStyle(v), borderRadius: v.radius }}
        >
          <PiliSecTitle main="精品" sub="推荐" more />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {featured.map((b) => <PiliCoverCard key={b.id} book={b} />)}
          </div>
        </section>

        {fresh.length > 0 && (
          <section
            data-pili-section="fresh"
            aria-label="最新入库"
            className="p-3 sm:p-4"
            style={{ ...doubleFrameStyle(v), borderRadius: v.radius }}
          >
            <PiliSecTitle main="最新" sub="入库" more />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {fresh.map((b) => <PiliCoverCard key={b.id} book={b} />)}
            </div>
          </section>
        )}

        <PiliUpdateTable books={books} />
      </div>

      {/* 右侧栏: 橙头排行榜(移动端落到底部全宽) */}
      <aside className="w-full shrink-0 lg:w-[264px]">
        <PiliRankPanel books={books} />
        {/* 复古小贴士卡(填充侧栏, 奶油底棕字) */}
        <section
          className="mt-4 hidden px-4 py-3 text-xs leading-relaxed lg:block"
          style={{ background: 'linear-gradient(180deg, #fff5e5, #fee9c4)', color: '#7d360f', border: '1px solid #f0cf9a', borderRadius: v.radius }}
          aria-label="书屋公告"
        >
          <p className="mb-1 font-bold">书屋公告</p>
          <p style={{ opacity: 0.85 }}>本站所有小说均可免费在线阅读，完结好书持续收录中。使用顶部搜索框可按书名 / 作者查找。</p>
        </section>
      </aside>
      </div>
    </div>
  )
}
