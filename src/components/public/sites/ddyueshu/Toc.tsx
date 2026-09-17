// ============================================================
// [R28-2a] ddyueshu 克隆目录页 —— 真站无独立目录页(书页 #list 即全量目录,
//   快照 /tmp/r28-2a/ddyueshu/ddyueshu-book.html 实证), 本页为「书页 #list 独立成页」映射:
//   .con_top 面包屑 + #list dl(dt 分卷/正文 + dd 33% 网格) + .page 分页, 家族标准形态。
//
//   降级/推断说明:
//   ① 真站无此独立页型 → 形态按书页 #list 逐类名复刻(dt bg #C3DFEA / dd w33% dashed #CCC)
//   ② 当前章高亮: 真站 .novellist li a:visited{COLOR:red} 基因 → #CC3300
//   ③ 真站全量单页 → 契约 100 章/页分页(.page 家族标准形态)
// ============================================================
'use client'

import type { CSSProperties } from 'react'
import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { groupTocVolumes } from '../template-kit'
import { pgBtn } from './Book' // [R34-2c-8] 三组件内部逐字节相同的 pgBtn 收敛为单处定义

const C = {
  page: '#E9FAFF',
  ink: '#555',
  link: '#6F78A7',
  ddInk: '#444444',
  cur: '#CC3300', // visited 基因红
  boxBorder: '#88C6E5',
  conTopBg: '#E1ECED',
  dtBg: '#C3DFEA',
  row: '#CCCCCC',
} as const

export function DdyueshuToc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const totalPages = data ? Math.max(1, data.tocTotalPages || 1) : 1
  const vols = groupTocVolumes(chapters)

  if (error) {
    return (
      <div className="dy-toc" style={{ background: C.page, color: C.ink, padding: '14px 10px' }}>
        <div className="mx-auto w-full" style={{ maxWidth: 980 }}>
          <ErrorState message="目录加载失败" detail={error} />
        </div>
      </div>
    )
  }

  if (loading || !book) {
    return (
      <div className="dy-toc" style={{ background: C.page, color: C.ink, padding: '14px 10px 24px' }} role="status" aria-label="目录加载中">
        <div className="mx-auto w-full" style={{ maxWidth: 980 }}>
          <Sk className="h-10 w-full" style={{ borderRadius: 0, background: 'rgba(225,236,237,0.9)' }} />
          <Sk className="mt-2.5 h-96 w-full" style={{ borderRadius: 0, background: 'rgba(255,255,255,0.8)' }} />
        </div>
      </div>
    )
  }

  const ddStyle: CSSProperties = {
    borderBottom: `1px dashed ${C.row}`,
    display: 'inline-block',
    width: '33%',
    minWidth: 200,
    height: 25,
    lineHeight: '200%',
    margin: 0,
    marginBottom: 5,
    overflow: 'hidden',
    textAlign: 'left',
    textIndent: 10,
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    boxSizing: 'border-box',
    verticalAlign: 'middle',
  }

  const renderDl = (title: string, list: typeof chapters) => (
    <dl style={{ margin: '0 0 10px', overflow: 'hidden' }}>
      <dt style={{ background: C.dtBg, display: 'block', fontSize: 14, lineHeight: '28px', overflow: 'hidden', textAlign: 'center', width: '98%', margin: '0 auto 5px', color: '#333' }}>
        {title}
      </dt>
      {list.map((c) => {
        const current = currentChapterId === c.id
        return (
          <dd key={c.id} style={ddStyle}>
            <button
              type="button"
              onClick={() => navigate({ view: 'read', chapterId: c.id })}
              className={`dy-dd${current ? ' dy-cur' : ''}`}
              style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: current ? C.cur : C.ddInk, fontSize: 12, textAlign: 'left', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {c.title}
            </button>
          </dd>
        )
      })}
    </dl>
  )

  return (
    <div className="dy-toc" style={{ background: C.page, color: C.ink, fontFamily: '"Segoe UI","Microsoft YaHei",sans-serif', fontSize: 12, padding: '0 0 16px' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 980, padding: '10px 10px 0' }}>
        <div className="dy-boxcon" style={{ border: `2px solid ${C.boxBorder}`, overflow: 'hidden' }}>
          {/* .con_top 面包屑 */}
          <div className="dy-con-top" style={{ borderBottom: `1px solid ${C.boxBorder}`, textAlign: 'left', padding: '0 10px', lineHeight: '40px', height: 40, background: C.conTopBg }}>
            <button type="button" onClick={() => navigate({ view: 'home' })} className="dy-a" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.link, fontSize: 12 }}>
              顶点小说
            </button>
            {' &gt; '}
            <span>{book.name}章节目录</span>
          </div>
          <div style={{ padding: 2, overflow: 'hidden' }}>
            {vols ? (
              vols.map((g) => renderDl(g.volume || '正文', g.chapters))
            ) : (
              renderDl(`《${book.name}》正文`, chapters)
            )}

            {/* .page 分页(降级声明③) */}
            {totalPages > 1 && (
              <div className="dy-pagebar" style={{ width: '100%', margin: '10px auto', overflow: 'hidden' }} aria-label="目录分页">
                {Array.from({ length: Math.min(totalPages, 10) }).map((_, i) => {
                  const p = i + 1
                  return (
                    <button key={p} type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: p })} className="dy-pg" style={pgBtn(p === page)}>
                      {p}
                    </button>
                  )
                })}
                {page < totalPages && (
                  <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: page + 1 })} className="dy-pg" style={pgBtn(false)}>
                    下一页
                  </button>
                )}
                <b style={{ float: 'none', display: 'inline-block', margin: '4px 0', padding: '4px 12px', color: '#888', fontSize: 12 }}>
                  共 {data?.tocTotal ?? chapters.length} 章 · {totalPages} 页
                </b>
              </div>
            )}
            <div style={{ textAlign: 'center', padding: '6px 0 8px' }}>
              <button
                type="button"
                onClick={() => navigate({ view: 'book', bookId: book.id })}
                className="dy-a"
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.link, fontSize: 13 }}
              >
                返回书籍详情页
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

