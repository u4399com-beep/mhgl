// ============================================================
// [R26-5-4] ddyueshu(顶点小说) 目录页 —— view=toc 独立完整章节列表。
//
// 真站勘察: ddyueshu.cc 无独立目录页(整本目录直接铺在书籍页第二个 .box_con > #list 里, 圣墟快照
// 1668 章一页铺完), 故本视图按其 #list(dl dt 章组条 + dd 33% 行)形态承载, 配色/行距逐值同源:
//   biquge.css L151-155: #list dt(bg #C3DFEA, 14px, lh 28px, 居中, 宽 98%, margin auto auto 5px,
//   padding 5×10) / dd(33% 宽, 底虚线 #CCC, lh 200%≈25px, margin-bottom 5px, text-indent 10px,
//   dd a #444)。分卷分组用 groupTocVolumes(每卷一条 dt, 无卷数据平铺单组)。
//   页头补 .con_top 面包屑条 + 副行(书名/作者/共 N 章 — 真站书籍页 dt 自带《书名》前缀形态) [推断]。
//   分页: 真站整本单页, 数据层 100 章/页 → .page 样式(style.css L149-153)补全 [推断]。
//   当前章高亮: 真站 .novellist li a:visited{COLOR:red} 基因 → #CC3300 加粗(同 Book 页)。
// ============================================================
'use client'

import type { KeyboardEvent } from 'react'
import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import type { ViewParams } from '../../ctx'
import { groupTocVolumes } from '../template-kit'
import { ErrorState, Sk } from '../../bits'
import { formatWords } from '../../seo'
import type { TocChapter } from '../../types'

// [R26-5-4a] 真站实测色板 — 出处 biquge.css(L2/151-155) + css/style.css(L149-153/196)
const C = {
  text: '#555555',
  bg: '#E9FAFF',
  boxBorder: '#88C6E5', // biquge L132 .box_con 外框
  teal: '#E1ECED', // L133 .con_top 底
  volBar: '#C3DFEA', // L153 #list dt 组头条底
  pager: '#00A86E', // style L153 .page active
  cur: '#CC3300', // style L196 a:visited red 基因
} as const

/** [R26-5-4b] 章节行键盘可达属性(同 Book.chapterNavProps) */
function chapterNavProps(navigate: (p: ViewParams) => void, chapterId: string) {
  const open = () => navigate({ view: 'read', chapterId })
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        open()
      }
    },
  }
}

/** [R26-5-4c] #list 分页(.page 实测样式; 静态样式走 index.ts css 串 .dy-pg, 激活态内联) */
const BTN: React.CSSProperties = {
  margin: '4px 10px 4px 0',
  padding: '4px 12px',
  background: '#fff',
  color: '#666',
  border: '1px solid #BBB',
  fontSize: 12,
  lineHeight: '16px',
}

function Pager({ current, total, go }: { current: number; total: number; go: (p: number) => void }) {
  if (total <= 1) return null
  const win = 7
  let start = Math.max(1, current - 3)
  const end = Math.min(total, start + win - 1)
  start = Math.max(1, end - win + 1)
  return (
    <nav className="dy-pager flex flex-wrap items-center justify-center" style={{ margin: '12px 0 4px' }} aria-label="目录分页导航">
      {current > 1 && (
        <button type="button" className="dy-pg" onClick={() => go(current - 1)} aria-label="上一页目录">
          上一页
        </button>
      )}
      {Array.from({ length: end - start + 1 }, (_, i) => start + i).map((p) =>
        p === current ? (
          <span key={p} style={{ ...BTN, background: C.pager, color: '#fff', borderColor: C.pager, cursor: 'default' }} aria-current="page">
            {p}
          </span>
        ) : (
          <button key={p} type="button" className="dy-pg" onClick={() => go(p)} aria-label={`目录第 ${p} 页`}>
            {p}
          </button>
        ),
      )}
      {current < total && (
        <button type="button" className="dy-pg" onClick={() => go(current + 1)} aria-label="下一页目录">
          下一页
        </button>
      )}
    </nav>
  )
}

export function DdyueshuToc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { site, navigate } = usePublic()

  if (error) {
    return (
      <div className="dy-page dy-toc" style={{ background: C.bg, padding: '0 8px 24px' }}>
        <ErrorState message="目录加载失败" detail={error} />
      </div>
    )
  }

  const book = data?.book
  const chapters: TocChapter[] = data?.chapters || []
  const totalPages = data?.tocTotalPages || 1
  // [R26-5-4d] 分卷分组(连续同卷一组, 空卷归「正文」; 无卷数据 → null 平铺)
  const volGroups = groupTocVolumes(chapters)
  const ddStyle: React.CSSProperties = {
    minWidth: 0,
    height: 25,
    lineHeight: '25px',
    margin: 0,
    padding: 0,
    marginBottom: 5,
    textIndent: 10,
    borderBottom: '1px dashed #CCC',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
  }

  const goPage = (p: number) => book && navigate({ view: 'toc', bookId: book.id, page: p })

  return (
    <div className="dy-page dy-toc" style={{ background: C.bg, color: C.text, fontFamily: '宋体,SimSun,serif', fontSize: 12, padding: '0 8px 24px' }}>
      <div className="mx-auto w-full max-w-[976px]">
        {/* ============ .box_con(biquge L132): 面包屑 + 目录头 ============ */}
        <div style={{ border: `2px solid ${C.boxBorder}`, background: '#fff', overflow: 'hidden' }}>
          <div className="flex items-center justify-between overflow-hidden" style={{ height: 40, lineHeight: '40px', background: C.teal, borderBottom: `1px solid ${C.boxBorder}`, padding: '0 10px', fontSize: 12 }}>
            <div>
              <a
                className="dy-crumb"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate({ view: 'home' })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate({ view: 'home' })
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="返回首页"
              >
                {site.name}
              </a>
              <span style={{ padding: '0 6px' }}>&gt;</span>
              {book ? (
                <a
                  className="dy-crumb"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate({ view: 'book', bookId: book.id })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate({ view: 'book', bookId: book.id })
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`查看《${book.name}》详情`}
                >
                  {book.name}
                </a>
              ) : (
                <span>章节目录</span>
              )}
              <span style={{ padding: '0 6px' }}>&gt;</span>
              <span>章节目录</span>
            </div>
            {!loading && book && <span style={{ fontSize: 12, color: '#666' }}>{book.author} · {formatWords(book.wordCount)}</span>}
          </div>

          {/* #list: dt 卷组条(#C3DFEA) + dd 33% 三列(虚线 #CCC) */}
          <div style={{ padding: 2 }}>
            <div style={{ background: C.volBar, fontSize: 14, lineHeight: '28px', textAlign: 'center', margin: '0 auto 5px', padding: '5px 10px', overflow: 'hidden' }}>
              {loading ? (
                <Sk className="mx-auto h-5 w-64" style={{ borderRadius: 0 }} />
              ) : (
                <>《{book?.name}》章节目录（共 {data?.tocTotal ?? 0} 章）</>
              )}
            </div>

            {loading ? (
              <dl className="grid grid-cols-1 min-[768px]:grid-cols-3" style={{ margin: 2 }}>
                {Array.from({ length: 12 }, (_, i) => (
                  <div key={i} style={{ ...ddStyle }}>
                    <Sk className="h-6 w-full" style={{ borderRadius: 0 }} />
                  </div>
                ))}
              </dl>
            ) : chapters.length === 0 ? (
              <p style={{ padding: '12px', color: '#B2B2B2', textAlign: 'center' }}>暂无章节</p>
            ) : volGroups ? (
              /* 有卷数据: 每卷一条 dt 组条 */
              volGroups.map((g) => (
                <div key={g.volume}>
                  <div style={{ background: C.volBar, fontSize: 14, lineHeight: '28px', textAlign: 'center', margin: '0 auto 5px', padding: '5px 10px', overflow: 'hidden' }}>
                    {g.volume}
                  </div>
                  <dl className="grid grid-cols-1 min-[768px]:grid-cols-3" style={{ margin: 2 }}>
                    {g.chapters.map((ch) => (
                      <dd key={ch.id} className={ch.id === currentChapterId ? 'dy-cur' : 'dy-dd'} style={ddStyle}>
                        <a
                          style={ch.id === currentChapterId ? { color: C.cur, fontWeight: 700 } : undefined}
                          title={ch.title}
                          {...chapterNavProps(navigate, ch.id)}
                        >
                          {ch.title}
                        </a>
                      </dd>
                    ))}
                  </dl>
                </div>
              ))
            ) : (
              /* 无卷数据: 平铺三列 */
              <dl className="grid grid-cols-1 min-[768px]:grid-cols-3" style={{ margin: 2 }}>
                {chapters.map((ch) => (
                  <dd key={ch.id} className={ch.id === currentChapterId ? 'dy-cur' : 'dy-dd'} style={ddStyle}>
                    <a
                      style={ch.id === currentChapterId ? { color: C.cur, fontWeight: 700 } : undefined}
                      title={ch.title}
                      {...chapterNavProps(navigate, ch.id)}
                    >
                      {ch.title}
                    </a>
                  </dd>
                ))}
              </dl>
            )}

            {!loading && chapters.length > 0 && <Pager current={page} total={totalPages} go={goPage} />}
          </div>
        </div>
      </div>
    </div>
  )
}
