// ============================================================
// [R39-2a] ddyueshu(顶点小说) 全部小说大全页 —— R39 轮按真站快照 1:1 重克隆
//   快照: /tmp/r39-snap/ddyueshu/r39-fulltext.raw.html(/xiaoshuodaquan/, GB18030 核读,
//   3010 条 <li> 书链单页) + css-1-style.css L190-196
//   页型: 全本(Ful)。真站结构(类名注释对应真站):
//     .MessageDiv 提示条(style.css L190: bg #FFF9D9 边 1px #FFCC33 居中, 「提示：本站收录的
//       全部小说均在此页， 推荐使用Ctrl+F 来查找小说。」)
//     #main > .novellist(style.css L191: 968px 居中 padding 3) × N 组:
//       h2(L192: bg #F6F8FE 底边 #DDD 14px 700 h30 lh30 pl10「{组}小说大全列表」) +
//       ul(L193 padding 10) > li(L194: 浮动 20% 底边 #DDD h25 lh25 pt5 #B3B3B3) >
//       a(L195: #6F78A7)
//   降级/推断说明:
//   ① 真站为全站全量书按大类分组的单页(无分页, Ctrl+F 查找) → 契约 Fulltext 数据为
//      fetchBooks({status:'completed'}) 完本 24 本/页 → 按分类分组 .novellist 呈现 + .page
//      分页(家族标准形态), 每页即「当前页完本大全」口径
//   ② .MessageDiv 提示文案按契约口径改写(保留「推荐使用Ctrl+F」句式)
//   ③ 真站 li 文本为书名(部分混排作者) → 契约 name/author 分字段, 仅呈现 name
//   ④ 真站 a:visited 红色基因(style.css L196)不还原(契约无浏览态数据)
// ============================================================
'use client'

import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { SiteFulltextProps } from '../shared'
import { usePublic } from '../../ctx'
import { EmptyState, ErrorState, Sk } from '../../bits'
import type { BookItem } from '../../types'

// [R39-2a-45] 真站 style.css L9-10/L190-196 实测色值(R39 快照)
const C = {
  page: '#E9FAFF', // biquge.css L2 body bg
  ink: '#555', // biquge L2 body color
  msgBg: '#FFF9D9', // L190 .MessageDiv 底
  msgBorder: '#FFCC33', // L190 .MessageDiv 边
  h2Bg: '#F6F8FE', // L192 .novellist h2 底
  row: '#DDDDDD', // L192/194 h2 底边/li 底边
  liInk: '#B3B3B3', // L194 li 字色
  link: '#6F78A7', // L195 .novellist li a
} as const

// [R39-2d-fix] 原 import { pgBtn } from './Book' — Book 已由主控重写无此导出, 内联同款实现
const pgBtn = (on: boolean): CSSProperties => ({
  padding: '3px 12px',
  margin: '0 4px',
  border: `1px solid ${on ? '#459DF5' : '#A6D3E8'}`,
  borderRadius: 3,
  background: on ? '#459DF5' : '#fff',
  color: on ? '#fff' : '#555',
  cursor: on ? 'default' : 'pointer',
})

export function DdyueshuFulltext({ data, loading, error, page }: SiteFulltextProps) {
  const { navigate } = usePublic()
  const books = useMemo(() => data?.books || [], [data])
  const total = data?.total ?? 0
  const size = data?.size ?? 24
  const totalPages = data ? Math.max(1, Math.ceil(total / size)) : 1

  // [R39-2a-46] 按分类分组(真站 .novellist 分组形态; 降级①)
  const groups = useMemo(() => {
    const map = new Map<string, BookItem[]>()
    for (const b of books) {
      const k = b.category || '其他'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(b)
    }
    return [...map.entries()]
  }, [books])

  if (error) {
    return (
      <div className="dy-page dy-ft" style={{ background: C.page, color: C.ink, padding: '14px 10px' }}>
        <div className="mx-auto w-full" style={{ maxWidth: 980 }}>
          <ErrorState message="大全列表加载失败" detail={error} />
        </div>
      </div>
    )
  }

  return (
    <div className="dy-page dy-ft" style={{ background: C.page, color: C.ink, fontFamily: '"Segoe UI","Microsoft YaHei",sans-serif', fontSize: 12, padding: '0 0 16px' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 980, padding: '10px 10px 0' }}>
        {/* .MessageDiv 提示条(style.css L190, 降级②) */}
        <div className="dy-msg" style={{ background: C.msgBg, border: `1px solid ${C.msgBorder}`, lineHeight: '150%', margin: '10px auto 0', padding: 10, textAlign: 'center', maxWidth: 800 }}>
          <b>提示：本页为完本小说大全， 推荐使用Ctrl+F 来查找小说。</b>
        </div>

        {loading ? (
          <div role="status" aria-label="大全加载中">
            <Sk className="mt-2.5 h-24 w-full" style={{ borderRadius: 0, background: 'rgba(246,248,254,0.9)' }} />
            <Sk className="mt-2.5 h-96 w-full" style={{ borderRadius: 0, background: 'rgba(255,255,255,0.8)' }} />
          </div>
        ) : books.length === 0 ? (
          <EmptyState text="暂无完本书籍" hint="完本清单按最近更新排序" />
        ) : (
          groups.map(([cat, items]) => (
            <div key={cat} className="dy-novellist" style={{ margin: '10px auto', padding: 3 }}>
              <h2 style={{ background: C.h2Bg, borderBottom: `1px solid ${C.row}`, fontSize: 14, fontWeight: 700, height: 30, lineHeight: '30px', padding: '0 0 0 10px', margin: 0 }}>
                {cat}小说大全列表
              </h2>
              <ul style={{ padding: 10, listStyle: 'none', margin: 0, overflow: 'hidden' }}>
                {items.map((b) => (
                  <li key={b.id} style={{ float: 'left', width: '20%', minWidth: 130, padding: '5px 0 0', borderBottom: `1px solid ${C.row}`, height: 25, lineHeight: '25px', display: 'inline-block', color: C.liInk, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={`${b.name}/${b.author}`}>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: b.id })}
                      className="dy-nl-a"
                      style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.link, fontSize: 12, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}
                    >
                      {b.name}
                    </button>
                  </li>
                ))}
                <li style={{ clear: 'both', border: 0, height: 0 }} />
              </ul>
            </div>
          ))
        )}

        {/* .page 分页(降级①) */}
        {!loading && data && totalPages > 1 && (
          <nav aria-label="分页" style={{ width: '100%', margin: '10px auto', overflow: 'hidden', textAlign: 'center' }}>
            {Array.from({ length: Math.min(totalPages, 10) }).map((_, i) => {
              const p = i + 1
              return (
                <button key={p} type="button" onClick={() => navigate({ view: 'fulltext', page: p })} className="dy-pg" style={pgBtn(p === page)}>
                  {p}
                </button>
              )
            })}
            {page < totalPages && (
              <button type="button" onClick={() => navigate({ view: 'fulltext', page: page + 1 })} className="dy-pg" style={pgBtn(false)}>
                下一页
              </button>
            )}
            <b style={{ display: 'inline-block', margin: '4px 0', padding: '4px 12px', color: '#888', fontSize: 12 }}>
              共 {total} 本
            </b>
          </nav>
        )}
      </div>
    </div>
  )
}
