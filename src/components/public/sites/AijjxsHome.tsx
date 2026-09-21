// ============================================================
// [R24-6] 久久小说下载网(www.aijjxs.com) 克隆首页 —— 与真站一模一样的结构/配色/板块。
//   真站样本: /tmp/sites/aijjxs-home.html + skin/yellow/style.css(:root 实测):
//   --bg:#f3efe7 --paper:#fffdf8 --ink:#1f2937 --muted:#6b7280 --line:#e5dccd
//   --brand:#0f766e --brand-dark:#115e59 --accent:#b45309 --chip:#eef9f7 --rank:#fff5e6
//   --radius:14px --shadow:0 10px 30px rgba(17,24,39,0.08)
//
//   板块还原清单(自上而下, 与真站 <main class="layout"> 一致):
//   左列(1fr):
//     ① panel.latest-upload 「最新上传」 h3(白底+青绿→琥珀渐变竖条) + 2 栏 lines-books
//        行=[分类胶囊][书名][作者]|[MM-DD(当日红 #FF0033)], 首屏 16 条 + 「展示更多」按钮(+10/次)
//     ② panel 「封面推荐」 grid2: book 卡(88×122 浮动封面+新徽章+meta 行+简介)
//     ③ panel.latest-upload 「小说分类」 grid2: 4 组(分类 h4 渐变条+更多>>胶囊+10 行列表)
//     ④ panel 「专题书单」 grid3: 3 张 desc 卡(真站原文案)
//   右栏(330px):
//     ⑤ panel.rank(米杏底 #fff5e6) 「24小时热榜」 book_r(78×106 封面+标题+meta+简介) + 10 行
//     ⑥ panel.rank 「一周热榜」 同构
//     ⑦ panel 「热门作者」 tags 胶囊(真站形态)
//   底部: section.hero 「数据统计」 KPI 4 格(青绿→琥珀淡渐变面板)
//   (真站 aside 的「今日已签到」为会员签到数据, 本站无对应数据源 → 不渲染, 不造假;
//    真站 .foot 页脚由全局 SiteFooter 承担, 头部/搜索由 AijjxsHeader 承担)
//
//   数据口径: books = 最新 48 本(props); 热榜用 fetchBooks(sort:'words') 字数最多当点击榜;
//   分类板块用 fetchCategories + 各分类最新 10 本; 全部站内跳转走 navigate()。
//   [R24-6-b] 克隆首页 B 组实现 —— 桩实现升级为全结构还原。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SiteHomeProps } from './shared'
import { usePublic } from '../ctx'
import { fetchBooks, fetchCategories } from '../data'
import { BookCover } from '../BookCover'
import { Sk, bookNavProps } from '../bits'
import { fmtDate, formatWords } from '../seo'
import type { BookItem, CategoryItem } from '../types'

// [R24-6-b-1] 真站 skin/yellow/style.css :root 实测色值(克隆要求一模一样, 硬编码)
const C = {
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
  shadow: '0 10px 30px rgba(17, 24, 39, 0.08)',
  radius: '14px',
} as const

/** [R24-6-b-2] MM-DD 短日期(真站最新列表列形态); 无日期回退 '--' */
function mmdd(b: BookItem): string {
  const d = fmtDate(b.updatedAt)
  return d ? d.slice(5) : '--'
}

/** [R24-6-b-3] 是否今日上传(真站 .date.new 红字判定) */
function isToday(b: BookItem): boolean {
  if (!b.updatedAt) return false
  const d = new Date(b.updatedAt)
  if (isNaN(d.getTime())) return false
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

/** [R24-6-b-4] 站内链接 hover 行为: 默认深青→青绿下划线 / 书卡内青绿无下划线(真站 .book a:hover)。
 *  inline style 压不住 :hover, 用组件局部 <style> 作用域类实现(不依赖 themes.ts customCss) */
const LINK_CSS = `
.ajx-home a.ajx-a{color:${C.brandDark};text-decoration:none;transition:color .15s ease}
.ajx-home a.ajx-a:hover{color:${C.brand};text-decoration:underline}
.ajx-home a.ajx-book{color:${C.brandDark};text-decoration:none;transition:color .15s ease}
.ajx-home a.ajx-book:hover{color:${C.brandHover};text-decoration:none}
.ajx-home a.ajx-flat{color:${C.brand};text-decoration:none}
.ajx-home a.ajx-flat:hover{color:#0b5f58;text-decoration:none}
`

/** [R24-6-b-5] panel 白底圆角卡(真站 .panel) */
function panelStyle(): CSSProperties {
  return { border: `1px solid ${C.line}`, borderRadius: C.radius, background: C.paper, boxShadow: C.shadow }
}

/** [R24-6-b-6] panel 标题条: 白底 + 左侧 4×18px 青绿→琥珀渐变竖条(真站 .panel h3::before 纯 CSS 等价) */
function PanelTitle({ children }: { children: React.ReactNode }) {
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
    </h3>
  )
}

/** [R24-6-b-7] 最新上传/分类列表行: [分类胶囊][书名][作者]|[日期] —— 真站 .lines-books li 结构;
 *  hidden 仅「最新上传」展开交互用(真站 .latest-upload-hidden 隐藏态) */
function BookLine({
  book,
  navigate,
  hidden,
}: {
  book: BookItem
  navigate: ReturnType<typeof usePublic>['navigate']
  hidden?: boolean
}) {
  const today = isToday(book)
  return (
    <li
      style={{
        display: hidden ? 'none' : 'flex',
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
          }}
        >
          {book.category}
        </span>
        <a
          className="ajx-book"
          style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
          {...bookNavProps(navigate, book.id)}
        >
          {book.name}
        </a>
        <span style={{ flex: '0 0 auto', fontSize: 12, color: '#64748b' }}>{book.author}</span>
      </span>
      <span style={{ flex: '0 0 auto', minWidth: 42, fontSize: 12, color: today ? C.newRed : C.muted, textAlign: 'left' }}>
        {mmdd(book)}
      </span>
    </li>
  )
}

/** [R24-6-b-8] 列表加载骨架(与真站行等高的占位行) */
function LineSkeleton({ count, twoCol }: { count: number; twoCol?: boolean }) {
  return (
    <div className={twoCol ? 'grid gap-x-3.5 min-[980px]:grid-cols-2' : ''} role="status" aria-label="加载中">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '9px 0', borderBottom: `1px dashed ${C.line}` }}>
          <Sk className="h-4 w-12 rounded-full" />
          <Sk className="h-4 flex-1" />
          <Sk className="h-3 w-10" />
        </div>
      ))}
      <span className="sr-only">加载中…</span>
    </div>
  )
}

export function AijjxsHome({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()

  // [R24-6-b-9] 热榜维度: fetchBooks(sort:'words') 字数最多当点击榜(项目口径, 真站为点击统计无对应数据源)
  const [hot, setHot] = useState<BookItem[]>([])
  const [hotTotal, setHotTotal] = useState(0)
  const [hotDone, setHotDone] = useState(false) // 结束标志(含失败), 避免失败后骨架屏永久态
  // [R24-6-b-10] 分类板块维度: 分类列表 + 各分类最新 10 本(对应真站 女生/纯美/男生/悬疑 4 组)
  const [catBlocks, setCatBlocks] = useState<Array<{ cat: CategoryItem; books: BookItem[] }>>([])
  const [catDone, setCatDone] = useState(false) // 结束标志(含失败)
  // [R24-6-b-11] 「展示更多最近上传的电子书」交互: 真站初始 16 条 + 每次 +10
  const [visibleCount, setVisibleCount] = useState(16)

  useEffect(() => {
    let alive = true
    // [R24-6-修] effect 起始同步 setState 会触发级联渲染(react-hooks/set-state-in-effect), 移除; 站点切换由 HomeView key 重挂载兜底
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 24 })
      .then((d) => {
        if (!alive) return
        setHot(d.books || [])
        setHotTotal(d.total || 0)
        setHotDone(true)
      })
      .catch(() => {
        if (alive) {
          setHot([]) // 失败静默: 热榜板块渲染空态行
          setHotDone(true)
        }
      })
    return () => {
      alive = false
    }
  }, [site.id])

  useEffect(() => {
    let alive = true
    // [R24-6-修] effect 起始同步 setState 会触发级联渲染(react-hooks/set-state-in-effect), 移除; 站点切换由 HomeView key 重挂载兜底
    fetchCategories()
      .then(async (cats) => {
        // [R24-6-b-12] 取书量最多的 4 个分类并行拉最新 10 本(对应真站 4 组「分类名 + 更多>> + 10 行」)
        const top = [...cats]
          .sort((a, b) => (b._count?.books || 0) - (a._count?.books || 0))
          .slice(0, 4)
        if (!top.length) return
        const results = await Promise.all(
          top.map((c) => fetchBooks({ site: site.id, cat: c.id, page: 1, size: 10 }).catch(() => null)),
        )
        if (!alive) return
        setCatBlocks(top.map((cat, i) => ({ cat, books: results[i]?.books ?? [] })))
        setCatDone(true)
      })
      .catch(() => {
        if (alive) {
          setCatBlocks([]) // 失败静默: 分类板块渲染失败文案
          setCatDone(true)
        }
      })
    return () => {
      alive = false
    }
  }, [site.id])

  // [R24-6-b-13] 封面推荐: 最新两本带封面的书(真站为最新书 + 一本靠后的推荐书, 首本带「新」徽章)
  const coverRecs = books.filter((b) => b.cover).slice(0, 2)
  // [R24-6-b-14] 热榜切片: 24h 榜 = [0]封面位 + [1..10] 列表; 一周榜 = [11] + [12..21]
  const hotTop = hot[0]
  const hot24Rows = hot.slice(1, 11)
  const weekTop = hot[11]
  const weekRows = hot.slice(12, 22)
  // [R24-6-b-15] 热门作者: 从热榜书单去重取前 10(真站为作者页链接, 本站无作者视图 → 搜索该作者)
  const hotAuthors = Array.from(new Set(hot.map((b) => b.author).filter(Boolean))).slice(0, 10)
  // [R24-6-b-16] KPI 口径全部真实推导(真站为站方统计 + 会员注册数, 无对应数据源 → 换真实可推导口径):
  //   今日上传/本月上传 = books.updatedAt 当日/当月计数; 在库电子书 = fetchBooks total; 最近上传 = 最新 updatedAt
  const todayCount = books.filter(isToday).length
  const now = new Date()
  const monthCount = books.filter((b) => {
    if (!b.updatedAt) return false
    const d = new Date(b.updatedAt)
    return !isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length
  const lastUpload = books[0]?.updatedAt ? fmtDate(books[0].updatedAt) : '--'

  return (
    <div className="ajx-home" style={{ padding: '18px 14px 36px' }}>
      <style>{LINK_CSS}</style>
      <div className="mx-auto w-full max-w-[1220px]">
        <main
          className="grid grid-cols-1 gap-3.5 min-[980px]:grid-cols-[minmax(0,1fr)_330px]"
          style={{ marginTop: 2 }}
        >
          {/* ============ 左列 ============ */}
          <section>
            {/* ① 最新上传 */}
            <article style={panelStyle()}>
              <PanelTitle>最新上传</PanelTitle>
              <div style={{ padding: '12px 14px' }}>
                {loading ? (
                  <LineSkeleton count={12} twoCol />
                ) : (
                  <>
                    <ul className="list-none grid gap-x-3.5 min-[980px]:grid-cols-2" style={{ margin: 0, padding: 0 }}>
                      {books.map((b, i) => (
                        // 真站交互: 初始 16 条可见, 「展示更多」每次 +10(真站 .latest-upload-hidden 隐藏态)
                        <BookLine key={b.id} book={b} navigate={navigate} hidden={i >= visibleCount} />
                      ))}
                    </ul>
                    {visibleCount < books.length && (
                      <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 2px' }}>
                        <button
                          type="button"
                          onClick={() => setVisibleCount((n) => n + 10)}
                          style={{
                            border: '1px solid #e5e7eb',
                            background: '#fff',
                            color: '#555',
                            borderRadius: 6,
                            padding: '10px 22px',
                            fontSize: 14,
                            cursor: 'pointer',
                            minHeight: 44,
                          }}
                        >
                          展示更多最近上传的电子书
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </article>

            {/* ② 封面推荐 */}
            <article style={{ ...panelStyle(), marginTop: 14 }}>
              <PanelTitle>封面推荐</PanelTitle>
              <div className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2" style={{ padding: '12px 14px' }}>
                {loading
                  ? [0, 1].map((i) => (
                      <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 12, background: '#fff', padding: 10 }}>
                        <div className="flex gap-2.5">
                          <Sk className="h-[122px] w-[88px]" style={{ borderRadius: 8 }} />
                          <div className="flex-1 space-y-2 pt-1">
                            <Sk className="h-4 w-3/4" />
                            <Sk className="h-3 w-1/2" />
                            <Sk className="h-3 w-full" />
                            <Sk className="h-3 w-5/6" />
                          </div>
                        </div>
                      </div>
                    ))
                  : coverRecs.map((b, idx) => (
                      <div
                        key={b.id}
                        style={{ border: `1px solid ${C.line}`, borderRadius: 12, background: '#fff', padding: 10, overflow: 'hidden' }}
                      >
                        <a className="ajx-book" style={{ float: 'left', lineHeight: 0, cursor: 'pointer' }} {...bookNavProps(navigate, b.id)}>
                          <BookCover
                            name={b.name}
                            cover={b.cover}
                            showAuthor={b.author}
                            style={{ width: 88, height: 122, borderRadius: 8, marginRight: 10 }}
                          />
                        </a>
                        <h4 style={{ margin: 0, fontSize: 15, lineHeight: 1.4 }}>
                          {idx === 0 && (
                            <span
                              style={{
                                display: 'inline-block',
                                fontSize: 12,
                                color: '#fff',
                                background: C.accent,
                                borderRadius: 5,
                                padding: '1px 6px',
                                marginRight: 6,
                              }}
                            >
                              新
                            </span>
                          )}
                          <a className="ajx-book" style={{ cursor: 'pointer' }} {...bookNavProps(navigate, b.id)}>
                            {b.name}
                          </a>
                        </h4>
                        <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                          {b.author} · {b.category} · {formatWords(b.wordCount)} · {mmdd(b)}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 13,
                            color: '#9ca3af',
                            lineHeight: 1.55,
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {b.intro}
                        </div>
                      </div>
                    ))}
              </div>
            </article>

            {/* ③ 小说分类(4 组) */}
            <article style={{ ...panelStyle(), marginTop: 14 }}>
              <PanelTitle>小说分类</PanelTitle>
              <div className="grid grid-cols-1 gap-3 min-[980px]:grid-cols-2" style={{ padding: '12px 14px' }}>
                {catBlocks.length === 0 ? (
                  catDone ? (
                    // [R24-6-b-39] 失败/空分类静默文案(避免骨架屏永久态)
                    <p style={{ margin: 0, padding: '10px 0', fontSize: 13, color: C.muted }}>分类板块暂无数据</p>
                  ) : (
                    [0, 1, 2, 3].map((i) => (
                      <div key={i}>
                        <Sk className="mb-2 h-9 w-full" style={{ borderRadius: 10 }} />
                        <LineSkeleton count={4} />
                      </div>
                    ))
                  )
                ) : (
                  catBlocks.map(({ cat, books: cb }) => (
                      <div key={cat.id}>
                        {/* 真站 .panel.latest-upload .body.grid2 > div > h4: 青绿系渐变标题条 + 更多>>胶囊 */}
                        <h4
                          style={{
                            margin: '0 0 8px',
                            padding: '8px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            border: '1px solid #d8ece7',
                            borderRadius: 10,
                            background: 'linear-gradient(90deg, #f4fbf9 0%, #ffffff 100%)',
                            color: '#134e4a',
                            fontSize: 15,
                            fontWeight: 700,
                            lineHeight: 1.35,
                          }}
                        >
                          {cat.name}
                          <a
                            className="ajx-flat"
                            style={{
                              flex: '0 0 auto',
                              fontSize: 12,
                              fontWeight: 600,
                              background: '#e9f8f4',
                              border: '1px solid #bfe5dc',
                              borderRadius: 999,
                              padding: '4px 9px',
                              cursor: 'pointer',
                            }}
                            onClick={() => navigate({ view: 'category', cat: cat.id })}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                navigate({ view: 'category', cat: cat.id })
                              }
                            }}
                          >
                            更多&gt;&gt;
                          </a>
                        </h4>
                        {cb.length ? (
                          <ul className="list-none" style={{ margin: 0, padding: 0 }}>
                            {cb.map((b) => (
                              <BookLine key={b.id} book={b} navigate={navigate} />
                            ))}
                          </ul>
                        ) : (
                          <p style={{ margin: 0, padding: '10px 0', fontSize: 13, color: C.muted }}>该分类暂无书籍</p>
                        )}
                      </div>
                    )))}
              </div>
            </article>

            {/* ④ 专题书单(真站原文案静态编辑内容) */}
            <article style={{ ...panelStyle(), marginTop: 14 }}>
              <PanelTitle>专题书单</PanelTitle>
              <div className="grid grid-cols-1 gap-2.5 min-[980px]:grid-cols-3" style={{ padding: '12px 14px' }}>
                {[
                  { t: '高分重生文', d: '节奏快、反转多、女性成长线清晰。' },
                  { t: '穿越种田合集', d: '日常经营、家长里短、慢热耐看。' },
                  { t: '都市爽文精选', d: '升级流、事业线、金手指开局。' },
                ].map((it) => (
                  <div
                    key={it.t}
                    style={{
                      marginTop: 0,
                      padding: 10,
                      borderRadius: 10,
                      border: '1px solid #ece2d2',
                      background: '#fff',
                      color: '#374151',
                      fontSize: 14,
                    }}
                  >
                    <strong style={{ color: C.brandDark }}>{it.t}</strong>
                    <br />
                    {it.d}
                  </div>
                ))}
              </div>
            </article>
          </section>

          {/* ============ 右栏 330px ============ */}
          <aside>
            {/* ⑤ 24小时热榜(panel.rank 米杏底) */}
            <article style={{ ...panelStyle(), background: C.rank }}>
              <PanelTitle>24小时热榜</PanelTitle>
              <div style={{ padding: '12px 14px' }}>
                {hotTop ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr',
                      columnGap: 8,
                      alignItems: 'start',
                      marginBottom: 8,
                      overflow: 'hidden',
                    }}
                  >
                    <a
                      className="ajx-book"
                      style={{ gridColumn: 1, gridRow: '1 / span 3', lineHeight: 0, cursor: 'pointer' }}
                      {...bookNavProps(navigate, hotTop.id)}
                    >
                      <BookCover
                        name={hotTop.name}
                        cover={hotTop.cover}
                        style={{ width: 78, height: 106, borderRadius: 0, border: '1px solid #d1d1d1', background: '#fff', padding: 1 }}
                      />
                    </a>
                    <h4 style={{ gridColumn: 2, gridRow: 1, margin: 0, fontSize: 15, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <a className="ajx-book" style={{ cursor: 'pointer' }} {...bookNavProps(navigate, hotTop.id)}>
                        {hotTop.name}
                      </a>
                    </h4>
                    <div style={{ gridColumn: 2, gridRow: 2, color: C.muted, fontSize: 12, marginTop: 4 }}>
                      {hotTop.author} · {hotTop.category} · {formatWords(hotTop.wordCount)}
                    </div>
                    <div
                      style={{
                        gridColumn: 2,
                        gridRow: 3,
                        marginTop: 2,
                        fontSize: 13,
                        color: C.muted,
                        lineHeight: 1.55,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {hotTop.intro}
                    </div>
                  </div>
                ) : (
                  <div className="mb-2 flex gap-2">
                    <Sk className="h-[106px] w-[78px]" style={{ borderRadius: 0 }} />
                    <div className="flex-1 space-y-2 pt-1">
                      <Sk className="h-4 w-3/4" />
                      <Sk className="h-3 w-1/2" />
                      <Sk className="h-3 w-full" />
                    </div>
                  </div>
                )}
                {hot24Rows.length ? (
                  <ul className="list-none" style={{ margin: 0, padding: 0 }}>
                    {hot24Rows.map((b, i) => (
                      <li
                        key={b.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-start',
                          gap: 4,
                          alignItems: 'center',
                          minHeight: 40,
                          padding: '7px 0',
                          borderBottom: `1px dashed ${C.line}`,
                        }}
                      >
                        <span style={{ display: 'inline-block', minWidth: 18, textAlign: 'center', fontWeight: 'bold', color: '#9a3412', flex: '0 0 auto' }}>
                          {i + 1}
                        </span>
                        <a
                          className="ajx-book"
                          style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                          title={b.name}
                          {...bookNavProps(navigate, b.id)}
                        >
                          {b.name}
                        </a>
                        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.muted, flex: '0 0 auto', textAlign: 'right', maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.author}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : hotDone ? (
                  // [R24-6-修] hotDone 结束标志接入渲染: 失败/空数据显示占位而非永久骨架
                  <p style={{ margin: 0, padding: '10px 0', fontSize: 13, color: C.muted }}>热榜数据暂缺</p>
                ) : (
                  <LineSkeleton count={5} />
                )}
              </div>
            </article>

            {/* ⑥ 一周热榜 */}
            <article style={{ ...panelStyle(), background: C.rank, marginTop: 14 }}>
              <PanelTitle>一周热榜</PanelTitle>
              <div style={{ padding: '12px 14px' }}>
                {weekTop ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr',
                      columnGap: 8,
                      alignItems: 'start',
                      marginBottom: 8,
                      overflow: 'hidden',
                    }}
                  >
                    <a
                      className="ajx-book"
                      style={{ gridColumn: 1, gridRow: '1 / span 3', lineHeight: 0, cursor: 'pointer' }}
                      {...bookNavProps(navigate, weekTop.id)}
                    >
                      <BookCover
                        name={weekTop.name}
                        cover={weekTop.cover}
                        style={{ width: 78, height: 106, borderRadius: 0, border: '1px solid #d1d1d1', background: '#fff', padding: 1 }}
                      />
                    </a>
                    <h4 style={{ gridColumn: 2, gridRow: 1, margin: 0, fontSize: 15, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <a className="ajx-book" style={{ cursor: 'pointer' }} {...bookNavProps(navigate, weekTop.id)}>
                        {weekTop.name}
                      </a>
                    </h4>
                    <div style={{ gridColumn: 2, gridRow: 2, color: C.muted, fontSize: 12, marginTop: 4 }}>
                      {weekTop.author} · {weekTop.category} · {formatWords(weekTop.wordCount)}
                    </div>
                    <div
                      style={{
                        gridColumn: 2,
                        gridRow: 3,
                        marginTop: 2,
                        fontSize: 13,
                        color: C.muted,
                        lineHeight: 1.55,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {weekTop.intro}
                    </div>
                  </div>
                ) : (
                  <div className="mb-2 flex gap-2">
                    <Sk className="h-[106px] w-[78px]" style={{ borderRadius: 0 }} />
                    <div className="flex-1 space-y-2 pt-1">
                      <Sk className="h-4 w-3/4" />
                      <Sk className="h-3 w-1/2" />
                      <Sk className="h-3 w-full" />
                    </div>
                  </div>
                )}
                {weekRows.length ? (
                  <ul className="list-none" style={{ margin: 0, padding: 0 }}>
                    {weekRows.map((b, i) => (
                      <li
                        key={b.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-start',
                          gap: 4,
                          alignItems: 'center',
                          minHeight: 40,
                          padding: '7px 0',
                          borderBottom: `1px dashed ${C.line}`,
                        }}
                      >
                        <span style={{ display: 'inline-block', minWidth: 18, textAlign: 'center', fontWeight: 'bold', color: '#9a3412', flex: '0 0 auto' }}>
                          {i + 1}
                        </span>
                        <a
                          className="ajx-book"
                          style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                          title={b.name}
                          {...bookNavProps(navigate, b.id)}
                        >
                          {b.name}
                        </a>
                        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.muted, flex: '0 0 auto', textAlign: 'right', maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.author}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : hotDone ? (
                  // [R24-6-修] hotDone 结束标志接入渲染: 失败/空数据显示占位而非永久骨架
                  <p style={{ margin: 0, padding: '10px 0', fontSize: 13, color: C.muted }}>热榜数据暂缺</p>
                ) : (
                  <LineSkeleton count={5} />
                )}
              </div>
            </article>

            {/* ⑦ 热门作者(真站为作者空间链接; 本站无作者视图 → 跳转搜索该作者) */}
            <article style={{ ...panelStyle(), marginTop: 14 }}>
              <PanelTitle>热门作者</PanelTitle>
              <div style={{ padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {hotAuthors.length
                  ? hotAuthors.map((a) => (
                      <a
                        key={a}
                        className="ajx-flat"
                        style={{
                          border: '1px solid #cae8e3',
                          background: C.chip,
                          padding: '10px 12px',
                          borderRadius: 999,
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                        onClick={() => navigate({ view: 'search', q: a })}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            navigate({ view: 'search', q: a })
                          }
                        }}
                      >
                        {a}
                      </a>
                    ))
                  : Array.from({ length: 8 }).map((_, i) => <Sk key={i} className="h-7 w-16 rounded-full" />)}
              </div>
            </article>
          </aside>
        </main>

        {/* 数据统计 hero(真站 section.hero: 青绿→琥珀淡渐变面板 + 3px 渐变下划线标题 + KPI 4 格) */}
        <section
          style={{
            marginTop: 14,
            border: `1px solid ${C.line}`,
            borderRadius: C.radius,
            background: 'linear-gradient(120deg, rgba(15,118,110,0.12), rgba(180,83,9,0.12))',
            padding: 18,
          }}
        >
          <div style={{ display: 'inline-block', marginRight: 8, marginBottom: 6 }}>
            <h2 style={{ position: 'relative', margin: 0, paddingRight: 8, fontSize: 20, fontWeight: 800, color: '#0f4f4a', letterSpacing: 1 }}>
              数据统计
            </h2>
            <span
              aria-hidden
              style={{
                display: 'block',
                height: 3,
                borderRadius: 999,
                background: 'linear-gradient(90deg, rgba(15,118,110,0.72), rgba(180,83,9,0.18))',
              }}
            />
          </div>
          <small style={{ fontSize: 13, color: C.muted, marginLeft: 8 }}>数据每30分钟更新</small>
          <p style={{ margin: '6px 0 0', color: '#374151', fontSize: 13 }}>
            每天更新热门小说，覆盖穿越、重生、都市、玄幻等主流分类；支持在线阅读与TXT免费下载。
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5 min-[980px]:grid-cols-4">
            {[
              { num: `${todayCount}部`, txt: '今日上传电子书' },
              { num: `${monthCount}部`, txt: '本月上传电子书' },
              { num: `${hotTotal}部`, txt: '在库电子书' },
              { num: lastUpload, txt: '最近上传日期' },
            ].map((k) => (
              <div key={k.txt} style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 12, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 22, color: C.brandDark, fontWeight: 'bold', lineHeight: 1.2 }}>{k.num}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{k.txt}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
