// ============================================================
// [R26-5-2] ddyueshu(顶点小说) 分类页 —— 复刻真站分类列表页(www.ddyueshu.cc/{pinyin}xiaoshuo/)。
//
// 真站勘察: /tmp/r26/ddyueshu-cat.html(玄幻小说分类页, GBK) — 内页用另一套 /css/style.css(15KB 完整实测):
//   .wrap(980px L13) > .hot.bd > .ll(6 个 .item 两列: .image 120×150 + dl padding-left 140, dt 25px 点线
//   #A6D3E8, dd 120px #AAA L41-47) → .up(L87-108): .l(695px border 3px #88C6E5 bg #E1ECED) h2 bg #A6D3E8
//   「好看的玄幻小说最近更新列表」+ li 26px 行线 #DDD(s1 75px/s2 165px/s3 300px/s4 90px 右对齐/s5 右浮,
//   a #6F78A7) + .r(265px) h2「小说相关推荐」+ li(s1 40px/s2/s5 右浮作者)。
//   body 14px #333 Segoe UI/雅黑(L5), a #333 hover #FD5500 橙红下划线(L9-10)。
//   .path 面包屑条(L125): 40px bg #E1ECED 底线 #88C6E5 — 真站分类页未渲染此块, 按其 CSS 补作页头。
//   .page 分页(L149-153): a 白底 1px #BBB padding 4×12 / hover #00A86E / .active 绿底白字。
//   真站分类页无分页(每页固定 30 行), 本视图数据源为 24 本/页 + total → 分页按 .page 实测样式补全 [推断]。
//
// 数据口径: data(BooksData 24 本/页) 供 .ll 头条 6 位(优先带封面) + .l 更新列表; 相关推荐另拉
// fetchBooks({cat, sort:words}) 24 本(真站为同分类推荐位)。cat 空 = 全部分类。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import { BookCover } from '../../BookCover'
import { EmptyState, ErrorState, Sk, bookNavProps } from '../../bits'
import { fmtDate } from '../../seo'
import type { BookItem } from '../../types'

// [R26-5-2a] 真站实测色板 — 出处 /css/style.css(内页), 行号见文件头注释
const C = {
  text: '#333333', // L5 body color
  bg: '#E9FAFF', // L5 body background-color
  teal: '#E1ECED', // L108 .up 面板底 / L125 .path 底
  tealH2: '#A6D3E8', // L108 .up h2 底
  cream: '#FEF9EF', // L40 .hot .l 底(头条容器承袭 .bd 浅蓝框)
  panelBorder: '#C3DFEA', // L38 .bd 外框
  panelBorder2: '#88C6E5', // L88 .up 外框 / L125 .path 底线
  dotted: '#A6D3E8', // L42 .item dt 底点线
  muted: '#B3B3B3', // L54 .lis 列表灰
  dim: '#AAA', // L44 .item dd 简介灰
  border: '#DDDDDD', // L51/90 li 行线
  hover: '#FD5500', // L10 a:hover 橙红
  pager: '#00A86E', // L153 .page active 绿
} as const

/** [R26-5-2b] .page 分页(style.css L149-153): 白底方块 + 绿色 active; 静态样式走 index.ts css 串的 .dy-pg */
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
    <nav className="dy-pager flex flex-wrap items-center justify-center" style={{ margin: '12px 0' }} aria-label="分页导航">
      {current > 1 && (
        <button type="button" className="dy-pg" onClick={() => go(current - 1)} aria-label="上一页">
          上一页
        </button>
      )}
      {Array.from({ length: end - start + 1 }, (_, i) => start + i).map((p) =>
        p === current ? (
          <span key={p} style={{ ...BTN, background: C.pager, color: '#fff', borderColor: C.pager, cursor: 'default' }} aria-current="page">
            {p}
          </span>
        ) : (
          <button key={p} type="button" className="dy-pg" onClick={() => go(p)} aria-label={`第 ${p} 页`}>
            {p}
          </button>
        ),
      )}
      {current < total && (
        <button type="button" className="dy-pg" onClick={() => go(current + 1)} aria-label="下一页">
          下一页
        </button>
      )}
    </nav>
  )
}

export function DdyueshuCategory({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { site, navigate } = usePublic()

  // [R26-5-2c] 相关推荐维度: 同分类字数最多 24 本(真站 .r「小说相关推荐」位)
  const [recs, setRecs] = useState<BookItem[]>([])
  const [recsDone, setRecsDone] = useState(false)
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, cat: cat || undefined, sort: 'words', page: 1, size: 24 })
      .then((d) => {
        if (alive) {
          setRecs(d.books || [])
          setRecsDone(true)
        }
      })
      .catch(() => {
        if (alive) {
          setRecs([])
          setRecsDone(true)
        }
      })
    return () => {
      alive = false
    }
  }, [site.id, cat])

  const books = data?.books || []
  const total = data?.total || 0
  const size = data?.size || 24
  const totalPages = Math.max(1, Math.ceil(total / size))
  // [R26-5-2d] .ll 头条 6 位: 当前页优先带封面的前 6 本
  const featured = (books.filter((b) => b.cover).length >= 6 ? books.filter((b) => b.cover) : books).slice(0, 6)
  // 真站 h2 文案: 「好看的玄幻小说最近更新列表」; 全部分类时用「小说」
  const catLabel = catName === '全部分类' ? '小说' : catName

  const goPage = (p: number) => navigate({ view: 'category', cat: cat || undefined, page: p })

  if (error) {
    return (
      <div className="dy-page dy-category" style={{ background: C.bg, padding: '0 8px 24px' }}>
        <ErrorState message="分类加载失败" detail={error} />
      </div>
    )
  }

  return (
    <div className="dy-page dy-category" style={{ background: C.bg, color: C.text, fontSize: 14, padding: '0 8px 24px' }}>
      <div className="mx-auto w-full max-w-[980px]">
        {/* ============ .path 面包屑页头(style.css L125; 真站分类页未渲染, 按 CSS 补全 [R26-5-2 推断]) ============ */}
        <div className="flex items-center justify-between overflow-hidden" style={{ height: 40, lineHeight: '40px', background: C.teal, borderBottom: `1px solid ${C.panelBorder2}`, padding: '0 6px' }}>
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
              首页
            </a>
            <span className="dy-crumb-p" style={{ padding: '0 6px' }}>&gt;</span>
            <span>{catName}</span>
          </div>
          <span style={{ fontSize: 12, color: '#666' }}>共 {total} 本</span>
        </div>

        {/* ============ .hot.bd > .ll(style.css L38/59-60): 6 个 120×150 图文头条, 两列; 真站 .ll 无底色(透出 body #E9FAFF) ============ */}
        <div className="mt-2" style={{ border: `3px solid ${C.panelBorder}` }}>
          <div className="grid grid-cols-1 min-[640px]:grid-cols-2">
            {loading
              ? [0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-2.5" style={{ minHeight: 156, padding: '10px 10px 10px 10px' }}>
                  <Sk className="h-[152px] w-[122px]" style={{ borderRadius: 0 }} />
                  <div className="min-w-0 flex-1 space-y-2 pt-1">
                    <Sk className="h-5 w-2/3" />
                    <Sk className="h-3 w-full" />
                    <Sk className="h-3 w-5/6" />
                    <Sk className="h-3 w-4/6" />
                  </div>
                </div>
              ))
              : featured.length
                ? featured.map((b) => (
                  <div key={b.id} className="flex gap-2.5" style={{ minHeight: 156, padding: 10 }}>
                    <a
                      className="dy-book shrink-0"
                      style={{ lineHeight: 0, cursor: 'pointer', background: '#fff', border: `1px solid ${C.border}`, padding: 1 }}
                      {...bookNavProps(navigate, b.id)}
                      aria-label={`查看《${b.name}》详情`}
                    >
                      <BookCover name={b.name} cover={b.cover} style={{ width: 120, height: 150, borderRadius: 0 }} />
                    </a>
                    <dl className="min-w-0 flex-1" style={{ margin: 0 }}>
                      <dt
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          height: 25,
                          lineHeight: '25px',
                          fontSize: 14,
                          fontWeight: 700,
                          borderBottom: `1px dotted ${C.dotted}`,
                          overflow: 'hidden',
                        }}
                      >
                        <a
                          className="dy-book"
                          style={{ minWidth: 0, flex: '0 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                          {...bookNavProps(navigate, b.id)}
                        >
                          {b.name}
                        </a>
                        <span style={{ marginLeft: 'auto', flex: '0 0 auto', fontWeight: 400, color: '#999' }}>{b.author}</span>
                      </dt>
                      <dd style={{ margin: 0, padding: '7px 0 0', fontSize: 12, lineHeight: '20px', color: C.dim, height: 100, overflow: 'hidden' }}>
                        {b.intro || `${b.name} — ${b.author}的最新连载作品。`}
                      </dd>
                    </dl>
                  </div>
                ))
                : (
                  <p style={{ padding: '24px 12px', color: C.muted, fontSize: 12 }}>本分类暂无书目</p>
                )}
          </div>
        </div>

        {/* ============ .up(style.css L87-108): 左更新列表 695px + 右相关推荐 265px ============ */}
        <div className="mt-2 grid grid-cols-1 gap-3 min-[1000px]:grid-cols-[minmax(0,1fr)_271px]">
          <div className="min-w-0 overflow-hidden" style={{ background: C.teal, border: `3px solid ${C.panelBorder2}` }}>
            <h2 className="flex items-center justify-between overflow-hidden" style={{ margin: 0, height: 30, lineHeight: '30px', fontSize: 14, fontWeight: 700, background: C.tealH2, borderBottom: `1px solid ${C.border}`, paddingLeft: 10, paddingRight: 10 }}>
              <span>好看的{catLabel}最近更新列表</span>
              <span style={{ fontSize: 12, fontWeight: 400, color: '#555' }}>共 {total} 本</span>
            </h2>
            <ul className="list-none" style={{ margin: 0, padding: 10 }}>
              {loading
                ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <li key={i} style={{ height: 26, paddingTop: 5, display: 'flex', alignItems: 'center' }}>
                    <Sk className="h-4 w-full" />
                  </li>
                ))
                : books.length
                  ? books.map((b) => (
                    <li
                      key={b.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, paddingTop: 5, lineHeight: '26px', borderBottom: `1px solid ${C.border}`, overflow: 'hidden' }}
                    >
                      <span className="max-sm:hidden" style={{ flex: '0 0 auto', width: 75, fontSize: 12, overflow: 'hidden', whiteSpace: 'nowrap' }}>[{b.category}]</span>
                      <a
                        className="dy-book"
                        style={{ flex: '0 1 165px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        title={b.name}
                        {...bookNavProps(navigate, b.id)}
                      >
                        {b.name}
                      </a>
                      {/* 真站 s3 为章节直链; 列表数据无章节 id → 链书籍页降级(同 Home) */}
                      <a
                        className="dy-book flex-1 max-md:hidden"
                        style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        title={b.latestChapter || b.name}
                        {...bookNavProps(navigate, b.id)}
                      >
                        {b.latestChapter || b.name}
                      </a>
                      <span className="max-sm:hidden" style={{ flex: '0 0 auto', width: 84, textAlign: 'right', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.author}</span>
                      <span style={{ flex: '0 0 auto', width: 40, textAlign: 'right', color: C.muted, fontSize: 12 }}>{fmtDate(b.updatedAt).slice(5)}</span>
                    </li>
                  ))
                  : <li style={{ padding: '10px 0', color: C.muted, fontSize: 12 }}>本分类暂无更新</li>}
            </ul>
          </div>
          <aside className="min-w-0 overflow-hidden" style={{ background: C.teal, border: `3px solid ${C.panelBorder2}`, alignSelf: 'start' }}>
            <h2 style={{ margin: 0, height: 30, lineHeight: '30px', fontSize: 14, fontWeight: 700, background: C.tealH2, borderBottom: `1px solid ${C.border}`, paddingLeft: 10 }}>
              小说相关推荐
            </h2>
            <ul className="list-none" style={{ margin: 0, padding: 10 }}>
              {!recsDone
                ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <li key={i} style={{ height: 26, paddingTop: 5, display: 'flex', alignItems: 'center' }}>
                    <Sk className="h-4 w-full" />
                  </li>
                ))
                : recs.length
                  ? recs.map((b) => (
                    <li
                      key={b.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, paddingTop: 5, lineHeight: '26px', borderBottom: `1px solid ${C.border}`, overflow: 'hidden' }}
                    >
                      <span className="max-sm:hidden" style={{ flex: '0 0 auto', width: 40, fontSize: 12, overflow: 'hidden', whiteSpace: 'nowrap' }}>[{b.category.slice(0, 2)}]</span>
                      <a
                        className="dy-book"
                        style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        title={b.name}
                        {...bookNavProps(navigate, b.id)}
                      >
                        {b.name}
                      </a>
                      <span style={{ flex: '0 0 auto', maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right', color: C.muted }}>{b.author}</span>
                    </li>
                  ))
                  : <li style={{ padding: '10px 0', color: C.muted, fontSize: 12 }}>暂无推荐</li>}
            </ul>
          </aside>
        </div>

        {/* ============ .page 分页(style.css L149-153 实测样式) ============ */}
        {!loading && books.length === 0 && total === 0 ? (
          <EmptyState text="暂无书目" hint="换个分类看看吧" />
        ) : (
          <Pager current={page} total={totalPages} go={goPage} />
        )}
      </div>
    </div>
  )
}
