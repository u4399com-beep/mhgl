// ============================================================
// [R39-2a] ddyueshu(顶点小说) 排行榜克隆 —— R39 轮按真站快照 1:1 重克隆
//   快照: /tmp/r39-snap/ddyueshu/r39-ranking.raw.html(/paihangbang/, GB18030 核读)
//   + css-1-style.css .rank/.tli 段
//   真站 DOM: .wrap.rank > .block.bd(border 3px #88C6E5) ×8: h2(bg #E1ECED h40 边下 1px
//   #88C6E5) + ul.tli > li(lh38 虚线底) [em 圆徽(#B0B0B0, top3 #FA744E) + a 书名(pl30 截断)
//   + span.rate 分类(#888 右浮)]。首块「小说排行榜」24 项, 后跟 玄幻/武侠/都市/历史/网游/
//   科幻/其他 7 个分类分榜。
//   降级/推断说明:
//   ①真站榜单为站方票数总榜(单一榜) → 契约三榜 tab 切换(总榜默认=字数榜口径, 声明)
//   ②分类分榜数据面 → 字数热榜池按分类名分组(前缀匹配), 空分类不渲染(声明)
// ============================================================
'use client'

import type { SiteRankingProps } from '../shared'
import { usePublic } from '../../ctx'
import { useWordsPool } from '../hooks' // [R35-2d-1] 共享字数热榜池钩子
import type { BookItem } from '../../types'

// [R39-2a-47] 真站 style.css .rank/.tli 段实测色值(R39 快照)
const C = {
  border: '#88C6E5',
  head: '#E1ECED',
  em: '#B0B0B0',
  emTop: '#FA744E',
  emText: '#eeeeee',
  ink: '#555555',
  link: '#6F78A7',
  rate: '#888888',
  dashed: '#CCCCCC',
} as const

/** 分类分榜块名(真站 h2 逐字, 快照 8 块: 小说排行榜 + 7 分类) */
const CAT_BLOCKS = ['玄幻', '武侠', '都市', '历史', '网游', '科幻', '其他'] as const
/** tab 文案(真站单一总榜 → 三榜口径声明) */
const TAB_LABEL: Record<string, string> = { words: '小说排行榜', latest: '更新榜', new: '新书榜' }

export function DdyueshuRanking({ boards, active, onBoard, loading, error }: SiteRankingProps) {
  const { site } = usePublic()
  // 分类分榜数据池(字数热榜 60; 失败回退空)
  const pool = useWordsPool(site.id)

  const cur = boards.find((b) => b.key === active) || null

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '10px 8px', width: '100%' }}>
      {/* 榜 tab(真站无 tab, 单一总榜 → 三榜切换声明) */}
      <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }} role="tablist" aria-label="榜单切换">
        {boards.map((b) => {
          const on = b.key === active
          return (
            <button
              key={b.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onBoard(b.key)}
              style={{
                border: `1px solid ${on ? C.border : '#DDD'}`,
                background: on ? C.border : '#fff',
                color: on ? '#fff' : C.ink,
                borderRadius: 2,
                padding: '6px 14px',
                fontSize: 14,
                fontWeight: on ? 700 : 400,
                cursor: 'pointer',
              }}
            >
              {TAB_LABEL[b.key] || b.label}
            </button>
          )
        })}
      </div>

      {error ? (
        <p style={{ color: C.rate, padding: 20, textAlign: 'center' }}>榜单加载失败：{error}</p>
      ) : loading || !cur ? (
        <p style={{ color: C.rate, padding: 20, textAlign: 'center' }} role="status">榜单加载中…</p>
      ) : (
        <div className="dy-rank" style={{ display: 'flex', flexWrap: 'wrap' }}>
          {/* 首块: 总榜(真站「小说排行榜」24 项) */}
          <div className="dy-rank-block" style={{ width: 230, minWidth: 220, flex: '1 1 220px', marginRight: 9, marginBottom: 10, border: `3px solid ${C.border}` }}>
            <h2 style={{ padding: 0, fontWeight: 700, height: 40, lineHeight: '40px', fontSize: 14, background: C.head, borderBottom: `1px solid ${C.border}`, margin: 0, paddingLeft: 10 }}>
              {TAB_LABEL[cur.key] || cur.label}
            </h2>
            <ul className="dy-tli" style={{ listStyle: 'none', margin: 0, padding: '0 10px 10px' }}>
              {cur.books.slice(0, 24).map((b, i) => (
                <li key={b.id} style={{ lineHeight: '38px', borderBottom: `1px dashed ${C.dashed}`, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  <RankEm no={i + 1} />
                  <RankLink book={b} />
                  <span style={{ float: 'right', color: C.rate, fontSize: 12, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.author}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 分类分榜块(真站 7 分类; 数据面为字数热榜池分组, 降级②) */}
          {(pool || [])
            .reduce<{ cat: string; books: BookItem[] }[]>((acc, b) => {
              const cat = b.category || '其他'
              const hit = acc.find((g) => g.cat === cat)
              if (hit) hit.books.push(b)
              else acc.push({ cat, books: [b] })
              return acc
            }, [])
            .filter((g) => CAT_BLOCKS.some((k) => g.cat.startsWith(k)) && g.books.length >= 3)
            .slice(0, 7)
            .map((g) => (
              <div key={g.cat} className="dy-rank-block" style={{ width: 230, minWidth: 220, flex: '1 1 220px', marginRight: 9, marginBottom: 10, border: `3px solid ${C.border}` }}>
                <h2 style={{ padding: 0, fontWeight: 700, height: 40, lineHeight: '40px', fontSize: 14, background: C.head, borderBottom: `1px solid ${C.border}`, margin: 0, paddingLeft: 10 }}>
                  {g.cat}排行榜
                </h2>
                <ul className="dy-tli" style={{ listStyle: 'none', margin: 0, padding: '0 10px 10px' }}>
                  {g.books.slice(0, 10).map((b, i) => (
                    <li key={b.id} style={{ lineHeight: '38px', borderBottom: `1px dashed ${C.dashed}`, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      <RankEm no={i + 1} />
                      <RankLink book={b} />
                      <span style={{ float: 'right', color: C.rate, fontSize: 12, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.author}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

/** [R39-2a-48] 序号圆徽(真站 .tli em: #B0B0B0 圆徽 22px, top3 #FA744E) */
function RankEm({ no }: { no: number }) {
  return (
    <em
      style={{
        display: 'inline-block',
        width: 22,
        lineHeight: '22px',
        textAlign: 'center',
        background: no <= 3 ? C.emTop : C.em,
        color: C.emText,
        fontSize: 12,
        borderRadius: 20,
        fontStyle: 'normal',
      }}
    >
      {no}
    </em>
  )
}

function RankLink({ book }: { book: BookItem }) {
  const { navigate } = usePublic()
  return (
    <button
      type="button"
      onClick={() => navigate({ view: 'book', bookId: book.id })}
      className="dy-rank-a"
      style={{
        maxWidth: 'calc(100% - 100px)',
        marginLeft: 10,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        background: 'none',
        border: 0,
        padding: 0,
        cursor: 'pointer',
        color: C.link,
        fontSize: 13,
        textAlign: 'left',
      }}
    >
      {book.name}
    </button>
  )
}