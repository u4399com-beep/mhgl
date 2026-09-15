// ============================================================
// [R26-5-1] ddyueshu(顶点小说 www.ddyueshu.cc) 首页 —— 经典笔趣阁模板 /images/biquge.css 一比一还原。
//
// 真站勘察(2025 实抓, GBK→UTF-8): /tmp/r26/ddyueshu-home.html + /tmp/r26/ddyueshu-biquge.css(21KB 完整可读,
// 修正 R24 期 CSS 损坏只能按"任务书基因"推断的旧版)。真站 DOM 板块(自上而下):
//   #wrapper > .header(logo+搜索) / .nav(ul>li 10 项) / #main > #content > #main:
//   ① #hotcontent: .l(无标题条! 4 个 .item 两列: .image 120×150 + dl[dt(书名+右浮作者 span) dd 简介 indent 2em])
//                + .r(h2「上期强推」+ 8 li: s1[分类]40px / s2 书名 / s5 右浮作者)
//   ② .novelslist ×2(每块 3 个 .content): h2 分类名 / .top(.image 67×82 + dl dt 书名 dd 简介 60px)
//                / ul li 两列 155px(12px 灰 #B3B3B3: a 书名 13px + "/作者")
//   ③ #newscontent: .l(695px) h2「最近更新小说列表」+ 30 li(s1 75px [分类] / s2 165px 书名 / s3 300px
//                最新章节 / s4 90px 作者 / s5 日期) + .r(265px) h2「最新入库小说」+ 30 li(s1/s2/s5)
//   ④ #firendlink 友链(由全局 SiteFooter 承担避免双友链, 同旧版决策)
// biquge.css 实测关键值(行号): body bg #E9FAFF color #555 宋体 12px(L2); a #6F78A7 hover 下划线(L4-5,
// top:-1px 对 static 定位是 no-op 故只还原下划线); .nav bg #88C6E5 40px 白字 15px/700(L35-37);
// #hotcontent .l/.r bg #FEF9EF border 3px #C3DFEA(L46/64); .r h2 bg #E1ECED 30px(L65); li 28px 行线 #DDD(L68);
// .novelslist 外框 3px #A6D3E8 bg #FEF9EF(L76), .content h2 bg #F6F8FE 行线 #A6D3E8 25px pl 5px(L78 特异度
// 压过 L88 的 30px 通配); li 12px #B3B3B3 宽 155px(L85); #newscontent .l/.r border 3px #88C6E5 bg #E1ECED
// (L101/111), h2 bg #A6D3E8(L121), li 25px 行线 #DDD s1 75/s2 165/s3 300/s4 90(L103-109); 版心 #main 980px(L44)。
//
// 数据口径(沿旧 DdyueshuHome): 热门位 fetchBooks(sort:words) 12 本 = 4 大书目位 + 上期强推 8 行;
// 分类板块 fetchCategories 书量前 6 × 各分类最新 13 本(1 本 .top 位 + 12 行); 更新列表用 props.books 前 30 行
// (.l/.r 真站本就互为镜像)。全部 navigate() 站内跳转; 空数组/拉取失败安全降级(骨架/占位文案)。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteHomeProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks, fetchCategories } from '../../data'
import { BookCover } from '../../BookCover'
import { Sk, bookNavProps } from '../../bits'
import { fmtDate } from '../../seo'
import type { BookItem, CategoryItem } from '../../types'

// [R26-5-1a] 真站实测色板 — 出处 biquge.css(首页) / css/style.css(内页), 见文件头注释行号
const C = {
  text: '#555555', // biquge.css L2 body color
  bg: '#E9FAFF', // biquge.css L2 body background-color(浅青蓝纸面)
  blue: '#88C6E5', // L35 .nav / L101 #newscontent 外框
  teal: '#E1ECED', // L8 .ywtop / L101 #newscontent 面板底 / L65 hotcontent h2 底
  tealH2: '#A6D3E8', // L121 #newscontent h2 底
  cream: '#FEF9EF', // L46/64/76 hotcontent·novelslist 面板底
  panelBorder: '#C3DFEA', // L46/64 hotcontent 外框
  panelBorder2: '#A6D3E8', // L76 novelslist 外框 + 各级点线
  faintH2: '#F6F8FE', // L88 novelslist h2 底
  muted: '#B3B3B3', // L49/85 列表灰字
  border: '#DDDDDD', // L68/103 li 行线
} as const

/** [R26-5-1b] MM-DD 短日期(真站 s5 列形态「09-15」) */
function mmdd(b: BookItem): string {
  const d = fmtDate(b.updatedAt)
  return d ? d.slice(5) : '--'
}

/** [R26-5-1c] #hotcontent .l .item — 120×150 封面 + dt(书名 14px/700 + 右浮作者 #B3B3B3, 底点线 #A6D3E8)
 *  + dd 两行简介(text-indent 2em, biquge L48-53; 真站 dd 高 120px 六行, 移动端钳两行防撑爆) */
function HotItem({ book, compact }: { book: BookItem; compact?: boolean }) {
  const { navigate } = usePublic()
  return (
    <div className="flex gap-2.5" style={{ minHeight: 156, padding: '10px 0 0 10px' }}>
      <a
        className="dy-book shrink-0"
        style={{ lineHeight: 0, cursor: 'pointer', background: '#fff', border: `1px solid ${C.border}`, padding: 1 }}
        {...bookNavProps(navigate, book.id)}
        aria-label={`查看《${book.name}》详情`}
      >
        <BookCover name={book.name} cover={book.cover} style={{ width: 120, height: 150, borderRadius: 0 }} />
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
            borderBottom: `1px dotted ${C.panelBorder2}`,
            overflow: 'hidden',
          }}
        >
          <a
            className="dy-book"
            style={{ minWidth: 0, flex: '0 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
            {...bookNavProps(navigate, book.id)}
          >
            {book.name}
          </a>
          <span style={{ marginLeft: 'auto', flex: '0 0 auto', fontSize: 12, fontWeight: 400, color: C.muted }}>{book.author}</span>
        </dt>
        <dd
          style={{
            margin: 0,
            padding: '7px 0 0',
            fontSize: 12,
            lineHeight: '20px',
            color: compact ? C.muted : C.text,
            textIndent: '2em',
            height: compact ? 60 : 100,
            overflow: 'hidden',
          }}
        >
          {book.intro || `${book.name} — ${book.author}的最新连载作品。`}
        </dd>
      </dl>
    </div>
  )
}

export function DdyueshuHome({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()

  // [R26-5-1d] 热门维度: 字数最多 12 本(4 大书目位 + 上期强推 8 行)
  const [hot, setHot] = useState<BookItem[]>([])
  const [hotDone, setHotDone] = useState(false) // 结束标志(含失败), 失败后骨架不永久态
  // [R26-5-1e] 分类板块维度: 书量前 6 分类 × 各分类最新 13 本
  const [blocks, setBlocks] = useState<{ cat: CategoryItem; top: BookItem | null; rows: BookItem[] }[]>([])
  const [blocksDone, setBlocksDone] = useState(false)

  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 12 })
      .then((d) => {
        if (alive) {
          setHot(d.books || [])
          setHotDone(true)
        }
      })
      .catch(() => {
        if (alive) {
          setHot([])
          setHotDone(true)
        }
      })
    return () => {
      alive = false
    }
  }, [site.id])

  useEffect(() => {
    let alive = true
    fetchCategories()
      .then(async (cats) => {
        const top = [...cats].sort((a, b) => (b._count?.books || 0) - (a._count?.books || 0)).slice(0, 6)
        if (!top.length) {
          if (alive) setBlocksDone(true)
          return
        }
        const results = await Promise.all(
          top.map((c) => fetchBooks({ site: site.id, cat: c.id, page: 1, size: 13 }).catch(() => null)),
        )
        if (!alive) return
        setBlocks(
          top.map((cat, i) => {
            const list = results[i]?.books ?? []
            const topBook = list.find((b) => b.cover) ?? list[0] ?? null
            return { cat, top: topBook, rows: list.filter((b) => b.id !== topBook?.id).slice(0, 12) }
          }),
        )
        setBlocksDone(true)
      })
      .catch(() => {
        if (alive) {
          setBlocks([])
          setBlocksDone(true)
        }
      })
    return () => {
      alive = false
    }
  }, [site.id])

  // [R26-5-1f] 热门位切片: 前 4 大位(优先带封面) + 剩余 8 行强推
  const hotFeatured = (hot.filter((b) => b.cover).length >= 4 ? hot.filter((b) => b.cover) : hot).slice(0, 4)
  const hotRecs = hot.filter((b) => !hotFeatured.some((f) => f.id === b.id)).slice(0, 8)
  const newsRows = books.slice(0, 30)

  return (
    <div className="dy-page dy-home" style={{ background: C.bg, color: C.text, fontFamily: '宋体,SimSun,serif', fontSize: 12, padding: '0 8px 24px' }}>
      <div className="mx-auto w-full max-w-[980px]">
        {/* ============ ① #hotcontent(biquge L45-75): 左 .l 无标题条 2×2 大书目位 + 右 .r 上期强推 ============ */}
        <div id="hotcontent" className="grid grid-cols-1 gap-3 pt-2.5 min-[1000px]:grid-cols-[minmax(0,1fr)_271px]">
          <div
            className="min-w-0 overflow-hidden"
            style={{ background: C.cream, border: `3px solid ${C.panelBorder}`, padding: '0 0 10px' }}
          >
            <div className="grid grid-cols-1 min-[640px]:grid-cols-2">
              {loading
                ? [0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-2.5" style={{ minHeight: 156, padding: '10px 0 0 10px' }}>
                      <Sk className="h-[152px] w-[122px]" style={{ borderRadius: 0 }} />
                      <div className="min-w-0 flex-1 space-y-2 pt-1">
                        <Sk className="h-5 w-2/3" />
                        <Sk className="h-3 w-full" />
                        <Sk className="h-3 w-5/6" />
                        <Sk className="h-3 w-4/6" />
                      </div>
                    </div>
                  ))
                : hotFeatured.length
                  ? hotFeatured.map((b) => <HotItem key={b.id} book={b} />)
                  : (
                    <p style={{ padding: '24px 12px', color: C.muted }}>暂无推荐书目</p>
                  )}
            </div>
          </div>
          <aside
            className="min-w-0 overflow-hidden"
            style={{ background: C.cream, border: `3px solid ${C.panelBorder}`, alignSelf: 'start' }}
          >
            {/* #hotcontent h2: bg #E1ECED 30px 底线 #DDD pl 10px (L65) */}
            <h2 style={{ margin: 0, height: 30, lineHeight: '30px', fontSize: 14, fontWeight: 700, background: C.teal, borderBottom: `1px solid ${C.border}`, paddingLeft: 10 }}>
              上期强推
            </h2>
            <ul className="list-none" style={{ margin: 0, padding: 10 }}>
              {loading || !hotDone
                ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <li key={i} style={{ height: 28, paddingTop: 5, display: 'flex', alignItems: 'center' }}>
                      <Sk className="h-4 w-full" />
                    </li>
                  ))
                : hotRecs.length
                  ? hotRecs.map((b) => (
                    <li
                      key={b.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, height: 28, paddingTop: 5, lineHeight: '28px', borderBottom: `1px solid ${C.border}`, overflow: 'hidden' }}
                    >
                      {/* s1 40px / s2 书名 / s5 右浮作者 (L70-74) */}
                      <span style={{ flex: '0 0 auto', width: 40, overflow: 'hidden', whiteSpace: 'nowrap' }}>[{b.category.slice(0, 2)}]</span>
                      <a
                        className="dy-book"
                        style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        title={b.name}
                        {...bookNavProps(navigate, b.id)}
                      >
                        {b.name}
                      </a>
                      <span style={{ flex: '0 0 auto', maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{b.author}</span>
                    </li>
                  ))
                  : hotDone
                    ? <li style={{ padding: '6px 0', color: C.muted }}>暂无强推数据</li>
                    : null}
            </ul>
          </aside>
        </div>

        {/* ============ ② .novelslist(biquge L76-98): 两行, 每行 3 个 .content 分类块 ============ */}
        <div className="mt-2 space-y-1.5">
          {!blocksDone || loading ? (
            [0, 1].map((row) => (
              <div
                key={`sk-${row}`}
                className="grid grid-cols-1 gap-x-0 min-[640px]:grid-cols-2 min-[1000px]:grid-cols-3"
                style={{ background: C.cream, border: `3px solid ${C.panelBorder2}`, padding: 3 }}
              >
                {[0, 1, 2].map((i) => (
                  <div key={i} className="min-w-0 p-1.5">
                    <Sk className="h-[25px] w-full" style={{ borderRadius: 0 }} />
                    <div className="mt-2.5 flex gap-2.5">
                      <Sk className="h-[84px] w-[69px]" style={{ borderRadius: 0 }} />
                      <div className="flex-1 space-y-2">
                        <Sk className="h-4 w-3/4" />
                        <Sk className="h-3 w-full" />
                        <Sk className="h-3 w-5/6" />
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-2">
                      {[0, 1, 2, 3].map((j) => <Sk key={j} className="h-5 w-full" />)}
                    </div>
                  </div>
                ))}
              </div>
            ))
          ) : !blocks.length ? (
            // [R26-5-1g] 分类拉取失败/空数据降级提示(避免空框带)
            <div style={{ background: C.cream, border: `3px solid ${C.panelBorder2}`, padding: 3 }}>
              <p style={{ margin: 0, padding: '16px 10px', color: C.muted }}>分类板块暂无数据</p>
            </div>
          ) : (
            [0, 1].map((row) => (
              <div
                key={row}
                className="grid grid-cols-1 gap-x-0 min-[640px]:grid-cols-2 min-[1000px]:grid-cols-3"
                style={{ background: C.cream, border: `3px solid ${C.panelBorder2}`, padding: 3 }}
              >
                {blocks.slice(row * 3, row * 3 + 3).map(({ cat, top, rows }) => (
                  <div
                    key={cat.id}
                    className="dy-cell min-w-0"
                    style={{ padding: '0 3px' }}
                  >
                    {/* .content h2: bg #F6F8FE 行线 #A6D3E8 25px pl 5px (L78) */}
                    <h2 style={{ margin: 0, height: 25, lineHeight: '25px', fontSize: 14, fontWeight: 700, background: C.faintH2, borderBottom: `1px solid ${C.panelBorder2}`, paddingLeft: 5, overflow: 'hidden' }}>
                      {cat.name}
                    </h2>
                    {top && (
                      <div className="flex gap-2.5" style={{ paddingTop: 10 }}>
                        <a
                          className="dy-book shrink-0"
                          style={{ lineHeight: 0, cursor: 'pointer', background: '#fff', border: `1px solid ${C.border}`, padding: 1 }}
                          {...bookNavProps(navigate, top.id)}
                          aria-label={`查看《${top.name}》详情`}
                        >
                          <BookCover name={top.name} cover={top.cover} style={{ width: 67, height: 82, borderRadius: 0 }} />
                        </a>
                        <dl className="min-w-0 flex-1" style={{ margin: 0 }}>
                          <dt style={{ height: 25, lineHeight: '25px', fontWeight: 700, overflow: 'hidden' }}>
                            <a
                              className="dy-book"
                              style={{ cursor: 'pointer' }}
                              {...bookNavProps(navigate, top.id)}
                            >
                              {top.name}
                            </a>
                          </dt>
                          <dd style={{ margin: 0, fontSize: 12, lineHeight: '20px', height: 60, overflow: 'hidden' }}>{top.intro}</dd>
                        </dl>
                      </div>
                    )}
                    {/* ul li 两列 155px: 12px #B3B3B3, a 书名 13px + /作者 (L85-86) */}
                    <ul className="list-none grid grid-cols-1 min-[480px]:grid-cols-2" style={{ margin: 0, padding: '10px 0 0' }}>
                      {rows.map((b) => (
                        <li key={b.id} style={{ minWidth: 0, height: 20, lineHeight: '20px', fontSize: 12, color: C.muted, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          <a
                            className="dy-book"
                            style={{ fontSize: 13, cursor: 'pointer' }}
                            title={`${b.name}/${b.author}`}
                            {...bookNavProps(navigate, b.id)}
                          >
                            {b.name}
                          </a>
                          /{b.author}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* ============ ③ #newscontent(biquge L100-121): 左最近更新(s1-s5) + 右最新入库(s1/s2/s5) ============ */}
        <div id="newscontent" className="mt-3 grid grid-cols-1 gap-3 min-[1000px]:grid-cols-[minmax(0,1fr)_271px]">
          <div className="min-w-0 overflow-hidden" style={{ background: C.teal, border: `3px solid ${C.blue}` }}>
            <h2 style={{ margin: 0, height: 30, lineHeight: '30px', fontSize: 14, fontWeight: 700, background: C.tealH2, borderBottom: `1px solid ${C.border}`, paddingLeft: 10 }}>
              最近更新小说列表
            </h2>
            <ul className="list-none" style={{ margin: 0, padding: 10 }}>
              {loading
                ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <li key={i} style={{ height: 25, paddingTop: 5, display: 'flex', alignItems: 'center' }}>
                    <Sk className="h-4 w-full" />
                  </li>
                ))
                : newsRows.map((b) => (
                  <li
                    key={b.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, height: 25, paddingTop: 5, lineHeight: '25px', borderBottom: `1px solid ${C.border}`, overflow: 'hidden' }}
                  >
                    <span className="max-sm:hidden" style={{ flex: '0 0 auto', width: 75, overflow: 'hidden', whiteSpace: 'nowrap' }}>[{b.category}]</span>
                    <a
                      className="dy-book"
                      style={{ flex: '0 1 165px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                      title={b.name}
                      {...bookNavProps(navigate, b.id)}
                    >
                      {b.name}
                    </a>
                    {/* 真站 s3 为章节直链; 列表数据无章节 id → 链书籍页(R24 同款降级) */}
                    <a
                      className="dy-book flex-1 max-md:hidden"
                      style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                      title={b.latestChapter || b.name}
                      {...bookNavProps(navigate, b.id)}
                    >
                      {b.latestChapter || b.name}
                    </a>
                    <span className="max-sm:hidden" style={{ flex: '0 0 auto', width: 72, textAlign: 'right', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.author}</span>
                    <span style={{ flex: '0 0 auto', width: 40, textAlign: 'right', color: C.muted }}>{mmdd(b)}</span>
                  </li>
                ))}
            </ul>
          </div>
          <aside className="min-w-0 overflow-hidden" style={{ background: C.teal, border: `3px solid ${C.blue}`, alignSelf: 'start' }}>
            <h2 style={{ margin: 0, height: 30, lineHeight: '30px', fontSize: 14, fontWeight: 700, background: C.tealH2, borderBottom: `1px solid ${C.border}`, paddingLeft: 10 }}>
              最新入库小说
            </h2>
            <ul className="list-none" style={{ margin: 0, padding: 10 }}>
              {loading
                ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <li key={i} style={{ height: 25, paddingTop: 5, display: 'flex', alignItems: 'center' }}>
                    <Sk className="h-4 w-full" />
                  </li>
                ))
                : newsRows.map((b) => (
                  <li
                    key={b.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, height: 25, paddingTop: 5, lineHeight: '25px', borderBottom: `1px solid ${C.border}`, overflow: 'hidden' }}
                  >
                    <span className="max-sm:hidden" style={{ flex: '0 0 auto', width: 40, overflow: 'hidden', whiteSpace: 'nowrap' }}>[{b.category.slice(0, 2)}]</span>
                    <a
                      className="dy-book"
                      style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                      title={b.name}
                      {...bookNavProps(navigate, b.id)}
                    >
                      {b.name}
                    </a>
                    <span style={{ flex: '0 0 auto', width: 40, textAlign: 'right', color: C.muted }}>{mmdd(b)}</span>
                  </li>
                ))}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  )
}
