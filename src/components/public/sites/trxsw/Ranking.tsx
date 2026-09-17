// ============================================================
// [R28-2g-3] trxsw(同人小说网) 排行榜单页克隆 —— 杰奇 CMS 默认模板家族标准还原(降级声明)
// 素材等级: 家族标准 —— 真站排行入口 2019 快照导航实证: 「排行榜单」→
// /book/0_monthvisit_0_0_0_0_1.html(cat 0 全站 + monthvisit 月点击排序), 页本体无存档
// (R28-2g Wayback 复抓 tx-top.html 为 Wayback 404 页) → 按杰奇家族排行页结构补全:
// JqH2 标题条 + 榜单 tab + 带名次徽章的 s1..s5 行式列表(与首页 .l 同款骨架) + 分页不适用
// (契约每榜一次性下发 top60)。
// 降级声明(逐条):
//   ①真站唯一榜单 = monthvisit 月点击(点击数无数据契约) → 契约三榜(最近更新 latest/
//     字数榜 words/新书榜 new) tab 承接, 激活榜即当前渲染列表(声明)
//   ②名次徽章 1/2/3 名配色为杰奇家族排行惯例红橙蓝近似(推断, b.css 无存档)
//   ③数值列: 真站为月点击数 → 字数(万)近似(声明)
// ============================================================
'use client'

import { JqH2 } from './_kit' // [R34-2c-4] 三文件逐字节重复的 JqH2 收敛
import type { SiteRankingProps } from '../shared'
import { usePublic } from '../../ctx'
import { EmptyState, ErrorState, Sk } from '../../bits'
import type { BookItem } from '../shared'

/** [R28-2g-3] 杰奇 CMS 家族标准色板(b.css 无存档, R25 轮实证) */
const C = {
  navBlue: '#1C5087',
  rankRed: '#C00',
  rankOrange: '#FF6600',
  rankBlue: '#1F5FA9',
  text: '#333333',
  gray: '#666666',
  light: '#999999',
  border: '#dddddd',
  dotted: '#cccccc',
} as const

/** 数值列: 真站月点击 → 字数(万)近似(声明③) */
function rankValue(b: BookItem): string {
  if (b.wordCount > 0) return `${(b.wordCount / 10000).toFixed(1)}万`
  return ''
}

/** 名次徽章配色(1/2/3 名红/橙/蓝, 杰奇家族排行惯例近似; 声明②) */
function rankBadgeColor(rank: number): { bg: string; fg: string } {
  if (rank === 1) return { bg: C.rankRed, fg: '#fff' }
  if (rank === 2) return { bg: C.rankOrange, fg: '#fff' }
  if (rank === 3) return { bg: C.rankBlue, fg: '#fff' }
  return { bg: 'transparent', fg: C.light }
}

function RankRow({ book, rank, onBook }: { book: BookItem; rank: number; onBook: (id: string) => void }) {
  const badge = rankBadgeColor(rank)
  return (
    <li className="tx-li flex h-9 items-center gap-2 border-b border-dotted" style={{ borderColor: C.dotted }}>
      <span
        className="tx-rank w-[22px] shrink-0 text-center text-[12px] font-bold"
        style={{ color: badge.fg, background: badge.bg, borderRadius: rank <= 3 ? 2 : 0 }}
        aria-label={`第 ${rank} 名`}
      >
        {rank}
      </span>
      <span className="tx-s1 hidden w-[76px] shrink-0 truncate text-[12px] sm:block" style={{ color: C.gray }}>
        [{book.category || '小说'}]
      </span>
      <button
        type="button"
        onClick={() => onBook(book.id)}
        className="tx-s2 w-[30%] min-w-0 shrink truncate text-left text-[14px]"
        style={{ color: C.text }}
        aria-label={`查看《${book.name}》详情`}
      >
        {book.name}
      </button>
      <span className="tx-s3 hidden min-w-0 flex-1 truncate text-[13px] sm:block" style={{ color: C.gray }}>
        {book.latestChapter || book.intro || '—'}
      </span>
      <span className="tx-s4 hidden w-[80px] shrink-0 truncate text-right text-[12px] sm:block" style={{ color: C.gray }}>
        {book.author}
      </span>
      <em className="tx-s5 w-[52px] shrink-0 text-right not-italic text-[12px]" style={{ color: C.light }}>
        {rankValue(book)}
      </em>
    </li>
  )
}

export function TrxswRanking({ boards, active, onBoard, loading, error }: SiteRankingProps) {
  const { navigate } = usePublic()
  const board = boards.find((b) => b.key === active) || boards[0]
  const books = board?.books || []
  const hasData = boards.some((b) => b.books.length)

  return (
    <div className="tx-home mx-auto w-full max-w-[960px] px-2 pb-6 pt-3" style={{ color: C.text, fontSize: 14 }}>
      <JqH2>排行榜单</JqH2>

      {/* 榜单 tab(真站 monthvisit 单榜 → 契约三榜, 声明①) */}
      <div className="tx-ranktabs flex flex-wrap items-center gap-1 py-2.5" role="tablist" aria-label="榜单切换">
        {boards.map((b) => (
          <button
            key={b.key}
            type="button"
            role="tab"
            aria-selected={b.key === active}
            onClick={() => onBoard(b.key)}
            className={`tx-pg m-[2px] inline-flex h-[30px] items-center justify-center border px-3 text-[13px] ${b.key === active ? 'tx-pg-on' : ''}`}
            style={
              b.key === active
                ? { background: C.navBlue, borderColor: C.navBlue, color: '#fff' }
                : { background: '#fff', borderColor: C.border, color: C.text }
            }
          >
            {b.label}
          </button>
        ))}
      </div>

      {error && !hasData ? (
        <div className="py-6">
          <ErrorState message="榜单加载失败" detail={error} />
        </div>
      ) : loading && !hasData ? (
        <ul aria-hidden className="m-0 list-none border bg-white" style={{ borderColor: C.border }}>
          {Array.from({ length: 15 }).map((_, i) => (
            <li key={i} className="tx-li flex h-9 items-center border-b border-dotted" style={{ borderColor: C.dotted }}>
              <Sk className="h-4 w-full" />
            </li>
          ))}
          <li className="sr-only" aria-hidden>加载中…</li>
        </ul>
      ) : books.length ? (
        <section className="tx-sec border bg-white" style={{ borderColor: C.border }}>
          <div className="px-2.5">
            <ul className="m-0 list-none p-0">
              {books.map((b, i) => (
                <RankRow key={b.id} book={b} rank={i + 1} onBook={(id) => navigate({ view: 'book', bookId: id })} />
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <div className="border bg-white py-8" style={{ borderColor: C.border }}>
          <EmptyState text="榜单暂无数据" hint="书籍入库后自动生成榜单" />
        </div>
      )}
    </div>
  )
}
