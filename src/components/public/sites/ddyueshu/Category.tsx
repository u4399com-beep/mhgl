// ============================================================
// [R28-2a] ddyueshu 克隆分类页 —— 复刻真站 /xuanhuanxiaoshuo/ 等分类页
//   (快照 /tmp/r28-2a/ddyueshu/ddyueshu-cat.html + css/style.css 15.3KB 全量实抓)
//
//   真站结构(类名注释对应真站):
//     .hot .ll(.bd 边 3px #C3DFEA) > .item×6(封面 120×150 + dt 书名[作者 span 右浮] + dd 简介)
//       (style.css .item: dl dt 边下 dotted #A6D3E8 14px 700; dt span #999 右浮; dd #AAA)
//     .up .l(边 3px #88C6E5 bg #E1ECED) h2「好看的玄幻小说最近更新列表」(bg #A6D3E8 h30)
//       + ul li: .s1 [分类] .s2 书名 .s3 最新章节 .s4 作者 .s5 日期(灰色右浮)
//     真站分类页无分页(每类单页) → 契约 24 本/页 → 尾部 .page 分页(降级声明①)
//
//   降级/推断说明:
//   ① 真站分类页无分页控件 → 契约数据分页, .page 按真站 style.css .page 形态补全
//   ② 真站 .item 封面图为站方 UploadPic → 契约 cover 缺图走 BookCover 占位
//   ③ .up .l li .s3 真站链到章节页 → 契约列表无 chapterId → 链到书页(等价近似)
//   ④ 真站 hot 区 6 卡 → 契约 24 本按封面有无取前 6(数据不足时按实际条数)
// ============================================================
'use client'

import type { CSSProperties } from 'react'
import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { BookCover } from '../../BookCover'
import { EmptyState, ErrorState, Sk } from '../../bits'
import { fmtDate } from '../../seo'

// [R28-2a-32] 真站 style.css/biquge.css 分类页实测色值
const C = {
  page: '#E9FAFF',
  ink: '#555',
  link: '#6F78A7',
  border: '#C3DFEA',
  borderBlue: '#88C6E5',
  head: '#E1ECED',
  head2: '#A6D3E8',
  box: '#FEF9EF',
  dotted: '#A6D3E8',
  dtSpan: '#999999',
  dd: '#AAAAAA',
  row: '#DDDDDD',
} as const

export function DdyueshuCategory({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()
  const books = data?.books || []
  const total = data?.total ?? 0
  const size = data?.size ?? 24
  const totalPages = data ? Math.max(1, Math.ceil(total / size)) : 1

  const hot = books.filter((b) => b.cover).slice(0, 6)
  const rows = books

  // .page 分页钮(真站 style.css .page: bg #fff 边 #BBB, hover/active #00A86E)
  const pgBtn = (on: boolean): CSSProperties => ({
    float: 'none',
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
      <div className="dy-cat" style={{ background: C.page, color: C.ink, padding: '14px 10px' }}>
        <div className="mx-auto w-full" style={{ maxWidth: 980 }}>
          <ErrorState message="分类列表加载失败" detail={error} />
        </div>
      </div>
    )
  }

  return (
    <div className="dy-cat" style={{ background: C.page, color: C.ink, fontFamily: '"Segoe UI","Microsoft YaHei",sans-serif', fontSize: 12, padding: '0 0 16px' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 980, padding: '10px 10px 0' }}>
        {/* .hot .ll 封面卡区 */}
        <div className="dy-hot-ll" style={{ border: `3px solid ${C.border}`, background: C.box, padding: 5, marginBottom: 8 }}>
          <h2 style={{ background: C.head, borderBottom: '1px solid #DDD', fontSize: 14, fontWeight: 700, height: 30, lineHeight: '30px', overflow: 'hidden', margin: 0, padding: '0 0 0 10px' }}>
            {catName}精选
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {loading ? (
              <>
                <Sk className="m-2.5 h-40 w-[300px]" style={{ borderRadius: 0, background: 'rgba(255,255,255,0.75)' }} />
                <Sk className="m-2.5 h-40 w-[300px]" style={{ borderRadius: 0, background: 'rgba(255,255,255,0.75)' }} />
              </>
            ) : hot.length === 0 ? (
              <p style={{ margin: 0, padding: 12, color: C.dd }}>本分类暂无带封面书籍</p>
            ) : (
              hot.map((b) => (
                <div key={b.id} className="dy-item" style={{ width: 313, padding: '5px 0 0 5px', boxSizing: 'border-box' }}>
                  <div style={{ overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: b.id })}
                      style={{ float: 'left', width: 120, padding: 0, border: 0, background: 'none', cursor: 'pointer' }}
                      aria-label={`查看 ${b.name}`}
                    >
                      <BookCover name={b.name} cover={b.cover} style={{ width: 120, height: 150, borderRadius: 0, border: '1px solid #DDD', padding: 1, background: '#fff', boxSizing: 'border-box' }} />
                    </button>
                    <dl style={{ margin: 0, padding: '0 5px 0 0', float: 'right', width: 180, maxWidth: 'calc(100% - 126px)', boxSizing: 'border-box' }}>
                      <dt style={{ borderBottom: `1px dotted ${C.dotted}`, fontSize: 14, fontWeight: 700, height: 25, lineHeight: '25px', overflow: 'hidden' }}>
                        <button
                          type="button"
                          onClick={() => navigate({ view: 'book', bookId: b.id })}
                          className="dy-a"
                          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.link, fontSize: 14, fontWeight: 700, display: 'block', width: '100%', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {b.name}
                        </button>
                        <span style={{ color: C.dtSpan, float: 'right', fontWeight: 400, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 4 }}>{b.author}</span>
                      </dt>
                      <dd style={{ margin: 0, padding: '7px 0 0', lineHeight: '20px', color: C.dd, textIndent: '2em', height: 110, overflow: 'hidden', fontSize: 12 }}>{b.intro || '暂无简介'}</dd>
                    </dl>
                    <div style={{ clear: 'both' }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* .up .l 最近更新列表 */}
        <div className="dy-up" style={{ border: `3px solid ${C.borderBlue}`, background: C.head, overflow: 'hidden' }}>
          <h2 style={{ margin: 0, overflow: 'hidden', padding: '0 0 0 10px', background: C.head2, height: 30, lineHeight: '30px', fontSize: 14, fontWeight: 700, borderBottom: '1px solid #DDD' }}>
            好看的{catName}最近更新列表
          </h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 10 }}>
            {loading ? (
              <>
                {Array.from({ length: 8 }).map((_, i) => (
                  <li key={i} style={{ padding: '5px 0 0 0', borderBottom: `1px solid ${C.row}`, height: 26, lineHeight: '26px' }}>
                    <Sk className="h-4 w-full" style={{ borderRadius: 0, background: 'rgba(255,255,255,0.7)' }} />
                  </li>
                ))}
              </>
            ) : rows.length === 0 ? (
              <EmptyState text="本分类暂无书籍" hint="换个分类或翻页看看" />
            ) : (
              rows.map((b) => (
                <li key={b.id} style={{ padding: '5px 0 0 0', borderBottom: `1px solid ${C.row}`, height: 26, lineHeight: '26px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  <span className="dy-s1" style={{ float: 'left', display: 'inline-block', width: '12%', minWidth: 75, color: C.dtSpan }}>[{b.category || catName}]</span>
                  <span className="dy-s2" style={{ float: 'left', display: 'inline-block', width: '20%', minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: b.id })}
                      className="dy-a"
                      style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.link, fontSize: 12, textAlign: 'left' }}
                    >
                      {b.name}
                    </button>
                  </span>
                  <span className="dy-s3" style={{ float: 'left', display: 'inline-block', width: '38%', minWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: b.id })}
                      className="dy-a"
                      style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.link, fontSize: 12, textAlign: 'left' }}
                      title={b.latestChapter || b.name}
                    >
                      {b.latestChapter || b.name}
                    </button>
                  </span>
                  <span className="dy-s4" style={{ color: C.dtSpan, width: 90, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: 4 }}>{b.author}</span>
                  <span style={{ color: C.dtSpan, float: 'right', textAlign: 'right' }}>{fmtDate(b.updatedAt).slice(5) || '--'}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* .page 分页(降级声明①) */}
        {!loading && data && totalPages > 1 && (
          <div className="dy-pagebar" style={{ width: '100%', margin: '10px auto', overflow: 'hidden' }} aria-label="分页">
            {Array.from({ length: Math.min(totalPages, 10) }).map((_, i) => {
              const p = i + 1
              return (
                <button key={p} type="button" onClick={() => navigate({ view: 'category', cat, page: p })} className="dy-pg" style={pgBtn(p === page)}>
                  {p}
                </button>
              )
            })}
            {page < totalPages && (
              <button type="button" onClick={() => navigate({ view: 'category', cat, page: page + 1 })} className="dy-pg" style={pgBtn(false)}>
                下一页
              </button>
            )}
            <b style={{ float: 'none', display: 'inline-block', margin: '4px 0', padding: '4px 12px', color: '#888', fontSize: 12 }}>
              共 {total} 本
            </b>
          </div>
        )}
      </div>
    </div>
  )
}

