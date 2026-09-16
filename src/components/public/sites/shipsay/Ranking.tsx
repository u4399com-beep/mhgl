// ============================================================
// [R28-2e-6] shipsay(船说 CMS demo) 排行榜页克隆 —— R28 扩展页型
// 素材等级: 家族标准(降级声明) —— 2024 Wayback 快照实证真站 header_right/nav 均
// 无「排行」入口(/top/ 猜测 URL 无存档, 本轮实测 404 页), 独立排行榜页在船说 V4.2
// demo 模板中不存在; 真站排行呈现 = 首页「热门小说」ul.popular 行式板块(ss-home.html
// 实测: a 书名 + a.gray 作者, 虚线行)。本页按该实测行式形态扩展: 白卡 + p.title 板块头
// + 三榜 tab(更新榜/字数榜/新书榜, 契约 onBoard 切换) + 名次行式列表, 色值全站实测。
// 名次角标为家族增强态(真站无, 声明)。
// ============================================================
'use client'

import type { SiteRankingProps } from '../shared'
import type { RankingBoard } from '../shared'
import { usePublic } from '../../ctx'
import { bookNavProps, ErrorState, Sk } from '../../bits'
import { formatWords } from '../../seo'
import type { BookItem } from '../../types'

/** [R28-2e-6] 船说模板实测色值(同 Home) */
const C = {
  bg: '#f4f4f4',
  card: '#ffffff',
  text: '#666666',
  link: '#1a1a1a',
  hover: '#ed4259',
  title: '#555555',
  blue: '#4284ed',
  orange: '#f0643a',
  line: '#e3e3e3',
} as const

export function ShipsayRanking({ boards, active, onBoard, loading, error }: SiteRankingProps) {
  const { navigate } = usePublic()
  const board: RankingBoard | undefined = boards.find((b) => b.key === active)

  return (
    <div className="ss-home w-full pb-6" style={{ background: C.bg, color: C.text, fontSize: 14 }}>
      <div className="mx-auto w-full max-w-[960px] px-2 pt-3">
        <section className="ss-card p-3">
          {/* p.title 板块头(首页热门板块同款实测形态) + 三榜 tab */}
          <div className="ss-rank_head flex flex-wrap items-center justify-between gap-2 border-b pb-2" style={{ borderColor: C.line }}>
            <p className="ss-title m-0 text-[16px] font-bold" style={{ color: C.title }}>
              <span aria-hidden className="mr-1 inline-block align-[-2px] text-[13px]" style={{ color: C.hover }}>
                🔥
              </span>
              排行榜
            </p>
            <div role="tablist" aria-label="榜单切换" className="flex flex-wrap gap-1.5">
              {boards.map((b) => {
                const on = b.key === active
                return (
                  <button
                    key={b.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => onBoard(b.key)}
                    className="ss-tab rounded-[3px] px-3 py-1 text-[13px] transition-colors"
                    style={{ background: on ? C.hover : '#f4f4f4', color: on ? '#fff' : C.link }}
                    aria-label={`切换到${b.label}`}
                  >
                    {b.label}
                  </button>
                )
              })}
            </div>
          </div>

          {error && !boards.some((b) => b.books.length) ? (
            <ErrorState message="榜单加载失败" detail={error} />
          ) : loading && !boards.length ? (
            <ul aria-hidden className="m-0 list-none p-1">
              {Array.from({ length: 12 }).map((_, i) => (
                <li key={i} className="border-b border-dashed py-1.5" style={{ borderColor: C.line }}>
                  <Sk className="h-4 w-2/3" />
                </li>
              ))}
              <span className="sr-only">加载中…</span>
            </ul>
          ) : board && board.books.length ? (
            <ol className="ss-ranklist m-0 list-none p-1">
              {board.books.map((b, i) => (
                <RankRow key={b.id} book={b} rank={i + 1} />
              ))}
            </ol>
          ) : (
            <p className="p-6 text-center text-sm">该榜单暂无数据</p>
          )}
          <p className="m-0 border-t pt-2 text-center text-[12px]" style={{ borderColor: C.line }}>
            榜单每小时随采集更新 ·{' '}
            <button type="button" className="hover:underline" style={{ color: C.hover }} onClick={() => navigate({ view: 'category' })} aria-label="浏览全部分类">
              浏览全部分类
            </button>
          </p>
        </section>
      </div>
    </div>
  )
}

/** 名次行(热门板块行式形态 + 家族增强名次角标: 前三 em.orange 主橙, 其后弱灰) */
function RankRow({ book: b, rank }: { book: BookItem; rank: number }) {
  const { navigate } = usePublic()
  return (
    <li className="ss-rankrow flex items-center border-b border-dashed py-1.5" style={{ borderColor: C.line }}>
      <em
        className="ss-ranknum mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] text-[12px] not-italic"
        style={rank <= 3 ? { background: C.orange, color: '#fff' } : { background: '#f4f4f4', color: C.text }}
        aria-label={`第 ${rank} 名`}
      >
        {rank}
      </em>
      <button
        type="button"
        {...bookNavProps(navigate, b.id)}
        className="min-w-0 flex-1 truncate text-left text-[14px]"
        style={{ color: C.link, fontWeight: rank <= 3 ? 700 : 400 }}
        aria-label={`查看《${b.name}》详情`}
      >
        {b.name}
      </button>
      <span className="ss-gray hidden shrink-0 pl-2 text-[12px] sm:inline">{b.category || '小说'}</span>
      <span className="ss-gray w-[72px] shrink-0 truncate pl-2 text-right text-[12px]">{b.author}</span>
      <em className="ss-orange ml-2 w-[64px] shrink-0 text-right text-[12px] not-italic" style={{ color: C.orange }}>
        {formatWords(b.wordCount)}
      </em>
    </li>
  )
}
