// ============================================================
// [R28-2a] aijjxs(久久小说下载网 www.aijjxs.com) 克隆首页 —— 8 页型完整重建(第 1 站)
//
//   真站快照(2026-09-16 直连 200): /tmp/r28-2a/aijjxs/aijjxs-home.html + aijjxs-style.css
//   (skin/yellow/style.css?t=20260509 全量实抓, :root 实测):
//   --bg:#f3efe7 --paper:#fffdf8 --ink:#1f2937 --muted:#6b7280 --line:#e5dccd
//   --brand:#0f766e --brand-dark:#115e59 --accent:#b45309 --chip:#eef9f7
//   --rank:#fff5e6 --shadow:0 10px 30px rgba(17,24,39,.08) --radius:14px
//   版心 .wrap max-width:1220px; .layout grid [minmax(0,1fr) 330px] gap:14px
//
//   板块还原(与真站 <main class="layout"> 逐块一致, 类名注释对应真站):
//   左列(1fr):
//     ① article.panel.latest-upload h3.latest「最新上传」 .body.gird2 > ul.lines.lines-books.lines-books-2col
//        行=[.cat 分类胶囊 11px][书名][.author 12px #64748b]|[.date MM-DD 当日 .new #F03],
//        首屏 16 条 + .latest-upload-more「展示更多」按钮(+10/次, hover #d6a63d/#b27400/#fffaf0)
//     ② article.panel h3「封面推荐」 .grid2 > .book: img 88×122 radius 8 + h4(.badge 新)+.meta+.desc
//     ③ article.panel.latest-upload h3「小说分类」 grid2: 4 组(h4+更多>>胶囊+10 行 lines-books)
//     ④ article.panel h3「专题书单」 grid3: 3 张 .desc 卡(真站原文案)
//   右栏(330px):
//     ⑤ aside article.panel.rank(米杏底 #fff5e6)「24小时热榜」 .book_r(封面 78×106+标题+.meta)
//        + ul.lines 10 行(.no 序号 #9a3412)
//     ⑥ article.panel.rank「一周热榜」 同构
//     ⑦ article.panel「热门作者」 .body.tags 胶囊(#cae8e3/#eef9f7, 4px 10px)
//   底部: section.hero「数据统计」(渐变 120deg rgba(15,118,110,.12),rgba(180,83,9,.12)) + .kpi 4 格
//
//   降级/推断说明:
//   ① 真站 .badge 新=当日上传判定(沿用); 「荐」badge 真站出自分类页 → 首页不使用
//   ② KPI 真站口径 今日上传/本月上传/24h会员注册/最新注册会员, 会员数据无数据源 →
//      换真实可推导四项(今日上传/本月上传/最近上传在库/最近上传日期), 不造假
//   ③ 真站 aside 首块「今日已签到」(会员签到头像墙)无数据源 → 不渲染, 不造假
//   ④ aside 双热榜(24h/一周)契约无对应榜单数据 → 以 fetchBooks 字数榜/新书榜切片近似,
//      榜单名保留真站「24小时热榜/一周热榜」字样(推断级)
//   ⑤ 「小说分类」4 组真站为站方运营分组(女生/纯美/男生/悬疑) → 按在库分类出现频次取前 4 组
//   ⑥ 尺寸展示真站为 txt 文件 KB 数, 数据源无文件体积 → wordCount/1024 折算 KB(推断)
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SiteHomeProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks, fetchCategories } from '../../data'
import { BookCover } from '../../BookCover'
import { Sk, bookNavProps } from '../../bits'
import { fmtDate } from '../../seo'
import type { BookItem, CategoryItem } from '../../types'

// [R28-2a-1] 真站 skin/yellow/style.css :root 实测色值(硬编码, 一致性由注释锚定)
const C = {
  bg: '#f3efe7',
  paper: '#fffdf8',
  ink: '#1f2937',
  muted: '#6b7280',
  line: '#e5dccd',
  brand: '#0f766e',
  brandDark: '#115e59',
  brandHover: '#09B295', // 真站 .book a:hover 实测色
  accent: '#b45309',
  chip: '#eef9f7',
  rank: '#fff5e6',
  newRed: '#FF0033', // 真站 .new{color:#F03}
  no: '#9a3412', // 真站 .rank .no
  author: '#64748b', // 真站 .lines-books .author
  shadow: '0 10px 30px rgba(17, 24, 39, 0.08)',
  radius: '14px',
} as const

/** [R28-2a-2] MM-DD 短日期(真站最新列表 .date 列形态); 无日期回退 '--' */
function mmdd(b: BookItem): string {
  const d = fmtDate(b.updatedAt)
  return d ? d.slice(5) : '--'
}

/** [R28-2a-3] 是否今日上传(真站 .date.new 红字 + .badge 新 判定) */
function isToday(b: BookItem): boolean {
  if (!b.updatedAt) return false
  const d = new Date(b.updatedAt)
  if (isNaN(d.getTime())) return false
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

/** [R28-2a-4] 字数 → 真站「文件大小 KB」近似(数据无文件体积, wordCount/1024 折算) */
function kb(b: { wordCount?: number | null }): string {
  const n = Math.max(1, Math.round((b.wordCount || 0) / 1024))
  return `${n} KB`
}

/** [R28-2a-5] panel 白底圆角卡(真站 .panel: 边 var(--line)/radius var(--radius)/bg var(--paper)/var(--shadow)) */
function panelStyle(): CSSProperties {
  return { border: `1px solid ${C.line}`, borderRadius: C.radius, background: C.paper, boxShadow: C.shadow }
}

/** [R28-2a-6] panel 标题条(真站 .panel h3: 左侧 4×18px #0f766e→#b45309 渐变竖条 + 底边 rgba(255,214,224,.28)) */
function PanelTitle({ children, small }: { children: React.ReactNode; small?: string }) {
  return (
    <h3
      style={{
        position: 'relative',
        margin: 0,
        padding: '12px 12px 12px 20px',
        fontSize: 18,
        fontWeight: 700,
        color: '#1f3f3a',
        letterSpacing: '0.4px',
        borderBottom: '1px solid rgba(255, 214, 224, 0.28)',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 4,
          height: 18,
          borderRadius: 3,
          background: 'linear-gradient(180deg, #0f766e, #b45309)',
        }}
      />
      {children}
      {small ? <small style={{ fontSize: 13, color: C.accent, marginLeft: 8, fontWeight: 400 }}>{small}</small> : null}
    </h3>
  )
}

type Nav = ReturnType<typeof usePublic>['navigate']

/** [R28-2a-7] 最新上传/分类列表行(真站 ul.lines.lines-books li): [.cat 胶囊][书名][.author]|[.date] */
function BookLine({ book, navigate }: { book: BookItem; navigate: Nav }) {
  return (
    <li
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
        alignItems: 'center',
        minHeight: 40,
        padding: '9px 0',
        borderBottom: `1px dashed ${C.line}`,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
        <span
          style={{
            flex: '0 0 auto',
            fontSize: 11,
            lineHeight: 1,
            color: C.brand,
            background: '#e8f7f4',
            border: '1px solid #b9e3dc',
            borderRadius: 999,
            padding: '4px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {book.category || '小说'}
        </span>
        <button
          type="button"
          onClick={() => navigate({ view: 'book', bookId: book.id })}
          className="ajx-a"
          style={{
            background: 'none',
            border: 0,
            padding: 0,
            cursor: 'pointer',
            color: C.brandDark,
            fontSize: 14,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'left',
          }}
        >
          {book.name}
        </button>
        <span style={{ flex: '0 0 auto', fontSize: 12, color: C.author }}>{book.author}</span>
      </span>
      <span style={{ color: isToday(book) ? C.newRed : C.muted, fontSize: 12, whiteSpace: 'nowrap' }}>{mmdd(book)}</span>
    </li>
  )
}

/** [R28-2a-8] 封面推荐卡(真站 .grid2 > .book: img 88×122 float-left + h4 .badge 新 + .meta + .desc) */
function CoverCard({ book, navigate }: { book: BookItem; navigate: Nav }) {
  return (
    <div className="ajx-book" style={{ border: `1px solid ${C.line}`, borderRadius: 12, background: '#fff', padding: 10, overflow: 'hidden' }}>
      <div style={{ overflow: 'hidden' }}>
        <button
          type="button"
          {...bookNavProps(navigate, book.id)}
          style={{ float: 'left', marginRight: 10, padding: 0, border: 0, background: 'none', cursor: 'pointer', width: 88, height: 122 }}
        >
          <BookCover name={book.name} cover={book.cover} style={{ width: 88, height: 122, borderRadius: 8 }} />
        </button>
        <h4 style={{ margin: '2px 0 4px', fontSize: 15, lineHeight: 1.5 }}>
          {isToday(book) && (
            <span style={{ display: 'inline-block', fontSize: 12, color: '#fff', background: C.accent, borderRadius: 5, padding: '1px 6px', marginRight: 6 }}>
              新
            </span>
          )}
          <button
            type="button"
            onClick={() => navigate({ view: 'book', bookId: book.id })}
            className="ajx-book"
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.brandDark, fontSize: 15, fontWeight: 600 }}
          >
            {book.name}
          </button>
        </h4>
        <div className="ajx-meta" style={{ color: C.muted, fontSize: 12, marginTop: 4, clear: 'both' }}>
          {book.author} · {book.category} · {kb(book)} · {fmtDate(book.updatedAt) || '--'}
        </div>
      </div>
      <div
        className="ajx-desc"
        style={{
          marginTop: 8,
          padding: 10,
          borderRadius: 10,
          border: '1px solid #ece2d2',
          background: '#fff',
          color: '#374151',
          fontSize: 14,
          lineHeight: 1.7,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {book.intro || '暂无简介'}
      </div>
    </div>
  )
}

/** [R28-2a-9] 热榜行(真站 .rank .lines li: .no 序号 #9a3412 + 书名 + .date 作者) */
function RankLine({ book, no, navigate }: { book: BookItem; no: number; navigate: Nav }) {
  return (
    <li style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'center', borderBottom: `1px dashed ${C.line}`, padding: '7px 0' }}>
      <span style={{ display: 'inline-block', minWidth: 18, textAlign: 'center', fontWeight: 700, color: C.no }}>{no}</span>
      <button
        type="button"
        onClick={() => navigate({ view: 'book', bookId: book.id })}
        className="ajx-a"
        style={{
          flex: 1,
          minWidth: 0,
          background: 'none',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          color: C.brandDark,
          fontSize: 14,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'left',
        }}
      >
        {book.name}
      </button>
      <span style={{ color: C.muted, fontSize: 12, whiteSpace: 'nowrap' }}>{book.author}</span>
    </li>
  )
}

export function AijjxsHome({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()
  // [R28-2a-10] aside 双热榜 + 作者池(真站 24小时热榜/一周热榜/热门作者; 契约外补充数据, 推断级)
  const [hot24, setHot24] = useState<BookItem[] | null>(null)
  const [hotWeek, setHotWeek] = useState<BookItem[] | null>(null)
  const [cats, setCats] = useState<CategoryItem[] | null>(null)

  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 11 })
      .then((d) => {
        if (alive) setHot24(d.books)
      })
      .catch(() => {
        if (alive) setHot24([])
      })
    fetchBooks({ site: site.id, sort: 'new', page: 1, size: 11 })
      .then((d) => {
        if (alive) setHotWeek(d.books)
      })
      .catch(() => {
        if (alive) setHotWeek([])
      })
    fetchCategories()
      .then((list) => {
        if (alive) setCats(list)
      })
      .catch(() => {
        if (alive) setCats([])
      })
    return () => {
      alive = false
    }
  }, [site.id])

  const [shown, setShown] = useState(16)
  const latest = useMemo(() => books.slice(0, shown), [books, shown])

  // [R28-2a-11] 「小说分类」4 组: 按在库书分类频次取前 4(真站为站方运营分组)
  const groups = useMemo(() => {
    const freq = new Map<string, number>()
    for (const b of books) freq.set(b.category, (freq.get(b.category) || 0) + 1)
    const top4 = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([cat]) => cat)
    return top4.map((cat) => ({ cat, items: books.filter((b) => b.category === cat).slice(0, 10) })).filter((g) => g.items.length > 0)
  }, [books])

  // [R28-2a-12] 封面推荐: 最新 2 本带封面书(真站 2 张卡)
  const covers = useMemo(() => books.filter((b) => b.cover).slice(0, 2), [books])

  // [R28-2a-13] KPI 真实可推导四项(降级声明②)
  const kpis = useMemo(() => {
    const today = books.filter((b) => isToday(b)).length
    const month = books.filter((b) => {
      if (!b.updatedAt) return false
      const d = new Date(b.updatedAt)
      const now = new Date()
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    }).length
    const latestDate = books.reduce((acc, b) => (b.updatedAt && b.updatedAt > acc ? b.updatedAt : acc), '')
    return [
      { num: `${today}部`, txt: '今日上传电子书' },
      { num: `${month}部`, txt: '本月上传电子书' },
      { num: `${books.length}部`, txt: '最近上传在库' },
      { num: fmtDate(latestDate) || '--', txt: '最近上传日期' },
    ]
  }, [books])

  if (loading && !books.length) {
    return (
      <div className="ajx-home" style={{ background: C.bg, minHeight: '50vh', padding: 14 }} role="status" aria-label="首页加载中">
        <div className="mx-auto w-full" style={{ maxWidth: 1220 }}>
          <Sk className="h-64 w-full" style={{ borderRadius: 14, background: 'rgba(255,253,248,0.9)' }} />
          <Sk className="mt-3.5 h-72 w-full" style={{ borderRadius: 14, background: 'rgba(255,253,248,0.9)' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="ajx-home" style={{ background: C.bg, padding: '0 0 24px' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 1220, padding: '18px 14px 0' }}>
        <main className="ajx-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 330px', gap: 14, alignItems: 'start' }}>
          {/* ============ 左列 ============ */}
          <section style={{ minWidth: 0 }}>
            {/* ① 最新上传(真站 article.panel.latest-upload.latest-upload-expand) */}
            <article style={{ ...panelStyle(), overflow: 'hidden' }}>
              <PanelTitle small="快速找到你想要的TXT电子书">最新上传</PanelTitle>
              <div style={{ padding: '4px 12px 12px' }}>
                <ul className="ajx-lines-2col" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {latest.map((b) => (
                    <BookLine key={b.id} book={b} navigate={navigate} />
                  ))}
                </ul>
                {shown < books.length ? (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 2px' }}>
                    <button
                      type="button"
                      onClick={() => setShown((s) => s + 10)}
                      className="ajx-more"
                      style={{ border: '1px solid #e5e7eb', background: '#fff', color: '#555', borderRadius: 6, padding: '8px 22px', fontSize: 14, cursor: 'pointer' }}
                    >
                      展示更多最近上传的电子书
                    </button>
                  </div>
                ) : (
                  books.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 2px' }}>
                      <button
                        type="button"
                        onClick={() => navigate({ view: 'category' })}
                        className="ajx-more"
                        style={{ border: '1px solid #e5e7eb', background: '#fff', color: '#555', borderRadius: 6, padding: '8px 22px', fontSize: 14, cursor: 'pointer' }}
                      >
                        进入全部分类继续浏览
                      </button>
                    </div>
                  )
                )}
              </div>
            </article>

            {/* ② 封面推荐(真站 article.panel > h3 封面推荐 + .grid2 > .book) */}
            {covers.length > 0 && (
              <article style={{ ...panelStyle(), marginTop: 14, overflow: 'hidden' }}>
                <PanelTitle>封面推荐</PanelTitle>
                <div className="ajx-grid2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, padding: 12 }}>
                  {covers.map((b) => (
                    <CoverCard key={b.id} book={b} navigate={navigate} />
                  ))}
                </div>
              </article>
            )}

            {/* ③ 小说分类(真站 article.panel.latest-upload: h4 渐变条 + 更多>> + 10 行) */}
            {groups.length > 0 && (
              <article style={{ ...panelStyle(), marginTop: 14, overflow: 'hidden' }}>
                <PanelTitle>小说分类</PanelTitle>
                <div className="ajx-grid2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, padding: 12 }}>
                  {groups.map((g) => (
                    <div key={g.cat} style={{ minWidth: 0 }}>
                      <h4
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          margin: 0,
                          padding: '7px 10px',
                          border: '1px solid #d8ece7',
                          borderRadius: 10,
                          background: 'linear-gradient(180deg, #f4fbf9, #fff)',
                          color: '#134e4a',
                          fontSize: 15,
                          fontWeight: 700,
                        }}
                      >
                        <span>{g.cat}小说</span>
                        <button
                          type="button"
                          onClick={() => navigate({ view: 'category' })}
                          className="ajx-flat"
                          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.brand, fontSize: 12 }}
                        >
                          更多&gt;&gt;
                        </button>
                      </h4>
                      <ul style={{ listStyle: 'none', margin: 0, padding: '2px 2px 0' }}>
                        {g.items.map((b) => (
                          <BookLine key={b.id} book={b} navigate={navigate} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </article>
            )}

            {/* ④ 专题书单(真站 article.panel > h3 专题书单 + grid3 desc 卡; 真站原文案) */}
            <article style={{ ...panelStyle(), marginTop: 14, overflow: 'hidden' }}>
              <PanelTitle>专题书单</PanelTitle>
              <div className="ajx-grid3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, padding: 12 }}>
                {[
                  { t: '高分重生文', d: '节奏快、反转多、女性成长线清晰。' },
                  { t: '穿越种田合集', d: '日常经营、家长里短、慢热耐看。' },
                  { t: '都市爽文精选', d: '升级流、事业线、金手指开局。' },
                ].map((s) => (
                  <button
                    key={s.t}
                    type="button"
                    onClick={() => navigate({ view: 'category' })}
                    className="ajx-desc ajx-topic"
                    style={{
                      textAlign: 'left',
                      cursor: 'pointer',
                      margin: 0,
                      padding: 10,
                      borderRadius: 10,
                      border: '1px solid #ece2d2',
                      background: '#fff',
                      color: '#374151',
                      fontSize: 14,
                      lineHeight: 1.7,
                    }}
                  >
                    <strong style={{ color: C.brandDark, display: 'block', marginBottom: 4 }}>{s.t}</strong>
                    {s.d}
                  </button>
                ))}
              </div>
            </article>
          </section>

          {/* ============ 右栏 330px ============ */}
          <aside style={{ minWidth: 0 }}>
            {/* ⑤ 24小时热榜(真站 .panel.rank 米杏底; 契约外数据降级声明④) */}
            <article style={{ ...panelStyle(), background: C.rank, overflow: 'hidden' }}>
              <PanelTitle>24小时热榜</PanelTitle>
              <div style={{ padding: 12 }}>
                {hot24 === null ? (
                  <Sk className="h-40 w-full" style={{ borderRadius: 10, background: 'rgba(255,250,240,0.9)' }} />
                ) : hot24.length > 0 ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 8, alignItems: 'start', marginBottom: 8 }}>
                      <button
                        type="button"
                        {...bookNavProps(navigate, hot24[0].id)}
                        style={{ padding: 0, border: 0, background: 'none', cursor: 'pointer', lineHeight: 0 }}
                      >
                        <BookCover name={hot24[0].name} cover={hot24[0].cover} style={{ width: 78, height: 106, borderRadius: 0, border: '1px solid #d1d1d1' }} />
                      </button>
                      <div style={{ minWidth: 0 }}>
                        <button
                          type="button"
                          onClick={() => navigate({ view: 'book', bookId: hot24[0].id })}
                          className="ajx-book"
                          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.brandDark, fontWeight: 700, fontSize: 15, lineHeight: 1.5, textAlign: 'left' }}
                        >
                          {hot24[0].name}
                        </button>
                        <div className="ajx-meta" style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                          {hot24[0].author} · {hot24[0].category} · {kb(hot24[0])}
                        </div>
                      </div>
                    </div>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {hot24.slice(1, 11).map((b, i) => (
                        <RankLine key={b.id} book={b} no={i + 1} navigate={navigate} />
                      ))}
                    </ul>
                  </>
                ) : (
                  <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>榜单暂无数据</p>
                )}
              </div>
            </article>

            {/* ⑥ 一周热榜(真站 .panel.rank 同构; 降级声明④) */}
            <article style={{ ...panelStyle(), background: C.rank, marginTop: 14, overflow: 'hidden' }}>
              <PanelTitle>一周热榜</PanelTitle>
              <div style={{ padding: 12 }}>
                {hotWeek === null ? (
                  <Sk className="h-40 w-full" style={{ borderRadius: 10, background: 'rgba(255,250,240,0.9)' }} />
                ) : hotWeek.length > 0 ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 8, alignItems: 'start', marginBottom: 8 }}>
                      <button
                        type="button"
                        {...bookNavProps(navigate, hotWeek[0].id)}
                        style={{ padding: 0, border: 0, background: 'none', cursor: 'pointer', lineHeight: 0 }}
                      >
                        <BookCover name={hotWeek[0].name} cover={hotWeek[0].cover} style={{ width: 78, height: 106, borderRadius: 0, border: '1px solid #d1d1d1' }} />
                      </button>
                      <div style={{ minWidth: 0 }}>
                        <button
                          type="button"
                          onClick={() => navigate({ view: 'book', bookId: hotWeek[0].id })}
                          className="ajx-book"
                          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.brandDark, fontWeight: 700, fontSize: 15, lineHeight: 1.5, textAlign: 'left' }}
                        >
                          {hotWeek[0].name}
                        </button>
                        <div className="ajx-meta" style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                          {hotWeek[0].author} · {hotWeek[0].category} · {kb(hotWeek[0])}
                        </div>
                      </div>
                    </div>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {hotWeek.slice(1, 11).map((b, i) => (
                        <RankLine key={b.id} book={b} no={i + 1} navigate={navigate} />
                      ))}
                    </ul>
                  </>
                ) : (
                  <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>榜单暂无数据</p>
                )}
              </div>
            </article>

            {/* ⑦ 热门作者(真站 .panel > .body.tags 胶囊) */}
            <article style={{ ...panelStyle(), marginTop: 14, overflow: 'hidden' }}>
              <PanelTitle>热门作者</PanelTitle>
              <div className="ajx-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
                {(hot24 || books.slice(0, 10)).slice(0, 10).map((b) => (
                  <span key={`au-${b.id}`} style={{ border: '1px solid #cae8e3', background: C.chip, padding: '4px 10px', borderRadius: 999, fontSize: 13, color: '#115e59' }}>
                    {b.author || '佚名'}
                  </span>
                ))}
              </div>
              {cats !== null && cats.length > 0 && (
                <div className="ajx-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 12px 12px' }}>
                  {cats.slice(0, 8).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => navigate({ view: 'category', cat: c.id })}
                      className="ajx-cat-pill"
                      style={{ border: '1px solid #cae8e3', background: '#fff', padding: '4px 10px', borderRadius: 999, fontSize: 13, color: C.brandDark, cursor: 'pointer' }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </article>
          </aside>
        </main>

        {/* 底部 hero 数据统计(真站 section.hero 渐变 + .kpi 4 格; KPI 口径降级声明②) */}
        <section
          className="ajx-hero"
          style={{
            marginTop: 14,
            border: `1px solid ${C.line}`,
            borderRadius: C.radius,
            background: 'linear-gradient(120deg, rgba(15,118,110,.12), rgba(180,83,9,.12))',
            padding: 18,
          }}
        >
          <h2 style={{ position: 'relative', display: 'inline-block', margin: '0 0 6px', fontSize: 'clamp(18px, 2.6vw, 22px)', fontWeight: 800, color: '#0f4f4a', letterSpacing: 1 }}>
            数据统计
            <span aria-hidden style={{ position: 'absolute', left: 0, bottom: -6, width: '100%', height: 3, borderRadius: 999, background: 'linear-gradient(90deg, rgba(15,118,110,.72), rgba(180,83,9,.18))' }} />
          </h2>
          <small style={{ fontSize: 13, color: C.muted, marginLeft: 8 }}>数据每30分钟更新</small>
          <div className="ajx-kpi" style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10 }}>
            {kpis.map((k) => (
              <div key={k.txt} style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 12, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 22, color: C.brandDark, fontWeight: 700, lineHeight: 1.2 }}>{k.num}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{k.txt}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

