// ============================================================
// [R28-2h] ddyueshu 排行榜克隆 —— 顶点小说模板 /paihangbang/ Wayback 实测 1:1
// 素材: /tmp/r28-2a/ddyueshu/ddyueshu-rank.html + ddyueshu-style-css.raw(rank 段规则逐条)
// 真站 DOM: .wrap.rank > .block.bd(border 3px #88C6E5) ×8: h2(bg #E1ECED h40 边下 1px #88C6E5)
//   + ul.tli > li(lh38 虚线底) [em 圆徽(#B0B0B0, top3 #FA744E) + a 书名(pl30 截断) + span.rate 分类(#888 右浮)]
//   首块「小说总榜」24 项, 后跟 玄幻/武侠/都市/历史/网游/科幻/其他 7 个分类分榜。
// 降级: ①真站榜单为站方票数总榜(单一榜) → 契约三榜 tab 切换(总榜默认=字数榜口径, 声明)
//       ②分类分榜数据面 → 字数热榜池按分类名分组(前缀匹配), 空分类不渲染(声明)
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteRankingProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import type { BookItem } from '../../types'

// [R28-2h] 真站 style.css .rank/.tli 段实测色值
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

/** 分类分榜块名(真站 h2 逐字) */
const CAT_BLOCKS = ['玄幻', '武侠', '都市', '历史', '网游', '科幻', '其他'] as const
/** tab 文案(真站单一总榜 → 三榜口径声明) */
const TAB_LABEL: Record<string, string> = { words: '小说总榜', latest: '更新榜', new: '新书榜' }

export function DdyueshuRanking({ boards, active, onBoard, loading, error }: SiteRankingProps) {
  const { site } = usePublic()
  // 分类分榜数据池(字数热榜 60; 失败回退空)
  const [pool, setPool] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 60 })
      .then((d) => {
        if (alive) setPool(d.books || [])
      })
      .catch(() => {
        if (alive) setPool([])
      })
    return () => {
      alive = false
    }
  }, [site.id])

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
                height: 30,
                lineHeight: '28px',
                padding: '0 14px',
                fontSize: 13,
                fontWeight: on ? 'bold' : 'normal',
                background: on ? C.head : '#fff',
                border: `1px solid ${C.border}`,
                color: on ? C.ink : C.link,
                cursor: 'pointer',
              }}
            >
              {TAB_LABEL[b.key] || b.label}
            </button>
          )
        })}
      </div>

      {error && !cur ? (
        <p style={{ padding: 20, textAlign: 'center', color: '#c00', fontSize: 13 }}>榜单加载失败：{error}</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, alignItems: 'flex-start' }}>
          {/* 主榜块(小说总榜, 实测 24 项) */}
          <RankBlock title={cur ? TAB_LABEL[cur.key] || cur.label : '小说总榜'} books={cur?.books.slice(0, 24) || []} loading={loading && !cur} />
          {/* 分类分榜(真站 7 块; 数据面=热榜池按分类分组, 声明) */}
          {CAT_BLOCKS.map((cat) => {
            const books = (pool || []).filter((b) => (b.category || '').startsWith(cat))
            if (!books.length) return null
            return <RankBlock key={cat} title={cat} books={books.slice(0, 10)} loading={!pool} />
          })}
        </div>
      )}
    </div>
  )
}

/** [R28-2h] .rank .block 单块(实测: 边 3px #88C6E5 + h2 bg#E1ECED h40 + ul.tli) */
function RankBlock({ title, books, loading }: { title: string; books: BookItem[]; loading: boolean }) {
  const { navigate } = usePublic()
  return (
    <section
      style={{
        width: 230,
        maxWidth: '100%',
        flexShrink: 0,
        border: `3px solid ${C.border}`,
        background: '#fff',
        marginBottom: 10,
      }}
    >
      <h2
        style={{
          margin: 0,
          padding: '0 0 0 10px',
          fontWeight: 'bold',
          height: 40,
          lineHeight: '40px',
          fontSize: 14,
          background: C.head,
          borderBottom: `1px solid ${C.border}`,
          color: C.ink,
        }}
      >
        {title}
      </h2>
      <ul style={{ margin: 0, padding: '0 10px 10px', listStyle: 'none', overflow: 'hidden' }}>
        {loading &&
          Array.from({ length: 8 }).map((_, i) => (
            <li key={i} style={{ lineHeight: '38px', borderBottom: `1px dashed ${C.dashed}` }}>
              <span className="inline-block h-[14px] w-4/5 animate-pulse" style={{ background: C.head, marginLeft: 30 }} />
            </li>
          ))}
        {!loading &&
          books.map((b, i) => (
            <li key={b.id} style={{ lineHeight: '38px', borderBottom: `1px dashed ${C.dashed}`, position: 'relative', overflow: 'hidden' }}>
              <em
                style={{
                  fontStyle: 'normal',
                  background: i < 3 ? C.emTop : C.em,
                  position: 'absolute',
                  top: 10,
                  left: 0,
                  width: 22,
                  lineHeight: '22px',
                  textAlign: 'center',
                  color: C.emText,
                  fontSize: 12,
                  borderRadius: 20,
                }}
              >
                {i + 1}
              </em>
              <button
                type="button"
                style={{
                  paddingLeft: 30,
                  width: '100%',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  display: 'block',
                  textAlign: 'left',
                  color: C.link,
                  fontSize: 13,
                  background: 'none',
                  border: 0,
                  cursor: 'pointer',
                  paddingTop: 0,
                  paddingRight: 0,
                  paddingBottom: 0,
                }}
                onClick={() => navigate({ view: 'book', bookId: b.id })}
                title={b.name}
              >
                {b.name}
              </button>
              <span style={{ position: 'absolute', top: 0, right: 0, color: C.rate, fontSize: 12 }}>{b.category || '其他'}</span>
            </li>
          ))}
        {!loading && !books.length && (
          <li style={{ lineHeight: '38px', textAlign: 'center', color: C.rate, fontSize: 12 }}>暂无数据</li>
        )}
      </ul>
    </section>
  )
}
