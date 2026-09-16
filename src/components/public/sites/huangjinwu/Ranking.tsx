// ============================================================
// [R28-2d-6] huangjinwu(黄金屋) 排行榜页(/rank)克隆 —— 真站直连实测 1:1
// 素材: /tmp/r28-2d/huangjinwu/hjw-rank.html + hjw-rank-size.html(2026-09-16 实抓)
//
// 真站 DOM(/rank 汇总页):
//   h1.page-title「小说排行榜」
//   .filter-bar > .filter-tags: 排行榜(active)/总点击/月点击/周点击/总推荐/月推荐/周推荐/
//     收藏榜/字数榜/新书榜(10 chips, 3/5/10 列网格; /rank/{type} 为独立单榜页)
//   .top-section: h2.page-title「分类排行」 + .category-ranking-grid > .ranking-module×9
//     (每榜 = .ranking-module-title + .ranking-list ×10 .ranking-item 计数徽章行)
// 降级: 真站 10 榜(点击/推荐票数/收藏无数据契约) → 数据面三榜(更新榜 latest/字数榜 words/
//      新书榜 new) chips 用 onBoard 切换, 激活榜模块置前并高亮(声明);
//      真站单榜页为卡片网格 + 分页 → 契约每榜一次性下发 top60, 以汇总页形态呈现(声明)。
// ============================================================
'use client'

import type { SiteRankingProps } from '../shared'
import { usePublic } from '../../ctx'
import { EmptyState, ErrorState, } from '../../bits'
import type { BookItem, RankingBoard } from '../shared'

/** [R28-2d-1] 真站色值(hjw-style.css :root) */
const SECONDARY = '#2563eb'
const TEXT = '#1e293b'
const TEXT_LIGHT = '#64748b'
const BORDER = '#dbe4f0'
const BG_TINT = '#f0f4fb'
const HOVER_BG = '#e8f1ff'
const SHADOW = '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37,99,235,0.06)'

/** [R28-2d-6] .ranking-module(蓝竖条榜头 + 计数徽章行; 前 3 名蓝系渐层与真站一致) */
function RankModule({ board, onBook }: { board: RankingBoard; onBook: (id: string) => void }) {
  return (
    <div className="hjw-module overflow-hidden rounded-[10px] border bg-white transition-shadow duration-300" style={{ borderColor: BORDER, boxShadow: SHADOW }}>
      <div className="hjw-modtitle flex items-center gap-2 border-b px-4 py-3 text-[18px] font-semibold" style={{ background: BG_TINT, borderColor: BORDER, color: TEXT }}>
        {board.label}
      </div>
      <div className="flex flex-col py-1">
        {board.books.slice(0, 10).map((b, i) => (
          <RankItem key={b.id} book={b} rank={i + 1} onBook={onBook} />
        ))}
        {!board.books.length && (
          <div className="px-4 py-6 text-center text-[14px]" style={{ color: TEXT_LIGHT }}>
            暂无数据
          </div>
        )}
      </div>
    </div>
  )
}

/** [R28-2d-6] .ranking-item(计数徽章 24px 方圆; 1/2/3 名蓝→浅蓝, 与真站 color-mix 换算一致) */
function RankItem({ book, rank, onBook }: { book: BookItem; rank: number; onBook: (id: string) => void }) {
  const numBg = rank === 1 ? SECONDARY : rank === 2 ? '#6f92ee' : rank === 3 ? '#a9c1f3' : HOVER_BG
  const numColor = rank <= 3 ? '#fff' : TEXT_LIGHT
  return (
    <div
      role="button" tabIndex={0} onClick={() => onBook(book.id)}
      className="hjw-ritem flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors"
      style={{ borderBottom: `1px solid ${BORDER}` }}
    >
      <span className="hjw-rnum flex h-6 w-6 shrink-0 items-center justify-center rounded-[10px] text-[14px] font-semibold" style={{ background: numBg, color: numColor, textShadow: rank <= 3 ? '0 1px 2px rgba(0,0,0,0.22)' : undefined }}>
        {rank}
      </span>
      <span className="hjw-rtitle min-w-0 flex-1 truncate text-[16px] font-medium" style={{ color: TEXT }}>
        {book.name}
      </span>
      <span className="max-w-[100px] shrink-0 truncate text-right text-[14px]" style={{ color: TEXT_LIGHT }}>
        {book.author}
      </span>
    </div>
  )
}

export function HjwRanking({ boards, active, onBoard, loading, error }: SiteRankingProps) {
  const { navigate } = usePublic()

  // 激活榜模块置前(真站 chip 切换语义的等价落地; 内容为汇总页形态, 声明)
  const ordered = [...boards].sort((a, b) => (a.key === active ? -1 : b.key === active ? 1 : 0))
  const hasData = boards.some((b) => b.books.length)

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6">
      {/* h1 小说排行榜 */}
      <h1 className="hjw-title mb-8 text-[21px] font-semibold tracking-[-0.02em]" style={{ color: TEXT }}>
        小说排行榜
      </h1>

      {/* .filter-bar 榜 chips(真站 10 榜 → 数据面 3 榜, 声明) */}
      <div className="hjw-card mb-8 rounded-[10px] bg-white p-4" style={{ boxShadow: SHADOW }}>
        <div className="hjw-chips grid grid-cols-3 gap-2">
          {boards.map((b) => (
            <button
              key={b.key}
              type="button"
              role="tab"
              aria-selected={b.key === active}
              className={`hjw-chip rounded-[10px] px-3 py-2 text-[15px] transition-all duration-300 ${b.key === active ? 'hjw-chip-active' : ''}`}
              onClick={() => onBoard(b.key)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {error && !hasData ? (
        <ErrorState message="榜单加载失败" detail={error} />
      ) : loading && !hasData ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="hjw-card h-[460px] animate-pulse rounded-[10px] border bg-white" style={{ borderColor: BORDER }} />
          ))}
        </div>
      ) : !hasData ? (
        <EmptyState text="榜单暂无数据" hint="书籍入库后自动生成榜单" />
      ) : (
        <>
          {/* .top-section: h2 分类排行 + 榜模块网格 */}
          <section aria-label="分类排行">
            <h2 className="hjw-title mb-8 text-[21px] font-semibold tracking-[-0.02em]" style={{ color: TEXT }}>
              分类排行
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {ordered.map((b) => (
                <RankModule key={b.key} board={b} onBook={(id) => navigate({ view: 'book', bookId: id })} />
              ))}
            </div>
          </section>
          <p className="py-4 text-center text-[13px]" style={{ color: TEXT_LIGHT }}>
            完整榜单每小时随采集更新 ·{' '}
            <button type="button" className="underline transition-colors" style={{ color: SECONDARY }} onClick={() => navigate({ view: 'category' })}>
              浏览全部分类
            </button>
          </p>
        </>
      )}
    </div>
  )
}
