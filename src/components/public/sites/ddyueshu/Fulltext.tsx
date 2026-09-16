// ============================================================
// [R28-2a2] ddyueshu 全部小说大全页 —— 复刻真站 /xiaoshuodaquan/(「全部小说」导航落点)
//   (快照 /tmp/r28-2a/ddyueshu/ddyueshu-fulltext.html(GBK→UTF8, 265KB) + css/style.css
//    L190-196 全量实测; 真站单页 3010 条 <li> 书链实证)
//
//   真站结构(类名注释对应真站):
//     .MessageDiv 提示条(style.css L190: bg #FFF9D9 边 1px #FFCC33 居中, 「本站收录的全部
//       小说均在此页， 推荐使用Ctrl+F 来查找小说。」) >
//     #main > .novellist(L191: 968px 居中 padding 3) × N 组: h2(L192: bg #F6F8FE 底边 #DDD
//       14px 700 h30 lh30 pl10, 「奇幻、玄幻小说大全列表」) + ul(L193 padding 10) >
//       li(L194: 浮动 20% 底边 #DDD h25 lh25 pt5 #B3B3B3) > a(L195: #6F78A7, :visited red)
//
//   降级/推断说明:
//   ① 真站为全站全量书 3010 条按大类分组的单页(无分页, Ctrl+F 查找) → 契约 Fulltext 数据
//      为 fetchBooks({status:'completed'}) 完本 24 本/页 → 按分类分组 .novellist 呈现 +
//      .page 分页(家族标准形态), 每页即「当前页完本大全」口径
//   ② .MessageDiv 提示文案按契约口径改写(原意为全站收录提示, 保留「推荐使用Ctrl+F」句式)
//   ③ 真站 li 文本为书名(部分混排作者, 如「永生方寒方清雪」) → 契约 name/author 分字段,
//      仅呈现 name, author 进 title 提示
//   ④ 真站 a:visited 红色基因(style.css L196)不还原(契约无浏览态数据)
//   ⑤ 移动端 li 20% 五列过窄 → <640px 降双列(css 字段 media, 选择器 .clone-ddyueshu 作用域)
// ============================================================
'use client'

import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { SiteFulltextProps } from '../shared'
import { usePublic } from '../../ctx'
import { EmptyState, ErrorState, Sk } from '../../bits'
import type { BookItem } from '../../types'

// [R28-2a2-5] 真站 style.css L9-10/L190-196 实测色值
const C = {
  page: '#E9FAFF', // biquge.css L2 body bg(style.css 页面同底)
  ink: '#555', // biquge L2 body color
  msgBg: '#FFF9D9', // L190 .MessageDiv 底
  msgBorder: '#FFCC33', // L190 .MessageDiv 边
  h2Bg: '#F6F8FE', // L192 .novellist h2 底
  row: '#DDDDDD', // L192/194 h2 底边/li 底边
  liInk: '#B3B3B3', // L194 li 字色
  link: '#6F78A7', // L195 .novellist li a
} as const

export function DdyueshuFulltext({ data, loading, error, page }: SiteFulltextProps) {
  const { navigate } = usePublic()
  const books = useMemo(() => data?.books || [], [data])
  const total = data?.total ?? 0
  const size = data?.size ?? 24
  const totalPages = data ? Math.max(1, Math.ceil(total / size)) : 1

  // [R28-2a2-6] 按分类分组(真站 .novellist 按大类多组并列; 契约 24 本/页 → 组内 1~N 本)
  const groups = useMemo(() => {
    const map = new Map<string, BookItem[]>()
    for (const b of books) {
      const cat = b.category || '其他'
      const arr = map.get(cat)
      if (arr) arr.push(b)
      else map.set(cat, [b])
    }
    return Array.from(map.entries()).map(([cat, items]) => ({ cat, items }))
  }, [books])

  // .page 分页钮(真站无分页 → 家族标准形态补全, 降级声明①; style.css L149-153 形态)
  const pgBtn = (on: boolean): CSSProperties => ({
    display: 'inline-block',
    margin: '4px 10px 4px 0',
    padding: '4px 12px',
    background: on ? '#00A86E' : '#fff',
    color: on ? '#fff' : '#666',
    border: `1px solid ${on ? '#00A86E' : '#BBB'}`,
    fontSize: 12,
    lineHeight: '16px',
    cursor: 'pointer',
  })

  if (error) {
    return (
      <div className="dy-fulltext" style={{ background: C.page, color: C.ink, padding: '14px 10px' }}>
        <div className="mx-auto w-full" style={{ maxWidth: 980 }}>
          <ErrorState message="全部小说列表加载失败" detail={error} />
        </div>
      </div>
    )
  }

  return (
    <div className="dy-fulltext" style={{ background: C.page, color: C.ink, fontFamily: '"Segoe UI","Microsoft YaHei",sans-serif', fontSize: 12, padding: '0 0 16px' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 980, padding: '10px 10px 0' }}>
        {/* .MessageDiv 提示条(style.css L190; 文案按完本口径改写, 降级声明②) */}
        <div className="dy-msg" style={{ background: C.msgBg, border: `1px solid ${C.msgBorder}`, lineHeight: '150%', maxWidth: 800, width: '100%', margin: '10px auto 0', padding: 10, textAlign: 'center', boxSizing: 'border-box' }}>
          提示：本页为全站完本小说大全列表（每页 {size} 本，共 {total} 本），推荐使用Ctrl+F 来查找小说。
        </div>

        {/* #main > .novellist × N 组(style.css L191-196) */}
        <div className="dy-nl" style={{ margin: '10px auto', padding: 3 }}>
          {loading ? (
            <div role="status" aria-label="全部小说列表加载中">
              {Array.from({ length: 2 }).map((_, gi) => (
                <div key={gi} style={{ marginBottom: 10 }}>
                  <Sk className="h-[30px] w-full" style={{ borderRadius: 0, background: 'rgba(246,248,254,0.9)' }} />
                  <div style={{ padding: 10, display: 'flex', flexWrap: 'wrap' }}>
                    {Array.from({ length: 10 }).map((_, i) => (
                      <Sk key={i} className="mr-2 mt-1.5 h-5 w-[19%]" style={{ borderRadius: 0, background: 'rgba(255,255,255,0.8)' }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : groups.length === 0 ? (
            <EmptyState text="暂无完本小说" hint="翻页或稍后再来看看" />
          ) : (
            groups.map((g) => (
              <section key={g.cat} style={{ marginBottom: 10 }}>
                <h2 style={{ background: C.h2Bg, borderBottom: `1px solid ${C.row}`, fontSize: 14, fontWeight: 700, height: 30, lineHeight: '30px', overflow: 'hidden', padding: '0 0 0 10px', margin: 0 }}>
                  {g.cat}小说大全列表
                </h2>
                <ul style={{ padding: 10, listStyle: 'none', margin: 0, display: 'flex', flexWrap: 'wrap' }}>
                  {g.items.map((b) => (
                    <li
                      key={b.id}
                      style={{ color: C.liInk, padding: '5px 0 0 0', borderBottom: `1px solid ${C.row}`, height: 25, lineHeight: '25px', overflow: 'hidden', boxSizing: 'border-box', minWidth: 135, whiteSpace: 'nowrap' }}
                      title={b.author ? `${b.name} / ${b.author}` : b.name}
                    >
                      <button
                        type="button"
                        onClick={() => navigate({ view: 'book', bookId: b.id })}
                        className="dy-nl-a"
                        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 12, textAlign: 'left', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        aria-label={`查看 ${b.name}`}
                      >
                        {b.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        {/* .page 分页(降级声明①) */}
        {!loading && data && totalPages > 1 && (
          <div className="dy-pagebar" style={{ width: '100%', margin: '10px auto', overflow: 'hidden' }} aria-label="分页">
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
              共 {total} 本 · {totalPages} 页
            </b>
          </div>
        )}
      </div>
    </div>
  )
}

