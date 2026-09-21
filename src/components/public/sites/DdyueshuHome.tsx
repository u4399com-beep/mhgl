// ============================================================
// [R24-6] 顶点小说(www.ddyueshu.cc) 克隆首页 —— 经典笔趣阁模板(/images/biquge.css)一模一样还原。
//   真站样本: /tmp/sites/ddyueshu-home.html(GBK) + 任务书实测基因: 白底 + 深蓝 #2b5b84 导航基因
//   + 橙 #ff6600 强调(hover) + 经典链接蓝 #06c(主题 customCss 已有 .clone-ddyueshu a 同款)。
//   注: 真站 biquge.css 抓取落盘时 gzip 损坏不可读, 结构尺寸按经典笔趣阁模板通行实现重建
//   (#wrapper 960 / hotcontent 左 660+右 278 / novelslist 3 列 / newscontent 左 660+右 278)。
//
//   板块还原清单(自上而下, 与真站 #main 一致):
//   ① #hotcontent: 左 .l = 4 个大书目位(120×150 封面 + dt[书名 16px 粗体 | 右浮作者] + dd 两行简介);
//                 右 .r = 带边框盒「上期强推」h2 深蓝条白字 + 8 行 [分类]书名|右浮作者
//   ② .novelslist: 6 个 .content(深蓝条 h2 分类名 + .top[67×82 封面+书名+简介] + 12 行 书名/作者 两列)
//   ③ #newscontent: 左 .l = 「最近更新小说列表」30 行 [分类]书名|最新章节|作者|日期;
//                 右 .r = 「最新入库小说」30 行 [分类]书名|右浮日期
//   (真站 #firendlink 友链区由全局 SiteFooter 承担避免双友链; 头部/导航由 DdyueshuHeader 承担)
//
//   数据口径: 热门位用 fetchBooks(sort:'words') 字数最多当热门(项目口径); 分类板块用
//   fetchCategories + 各分类最新 13 本; 更新列表用 props.books(最新 48)前 30 行。
//   站内跳转全部 navigate()。 [R24-6-b] 克隆首页 B 组实现 —— 桩实现升级为全结构还原。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteHomeProps } from './shared'
import { usePublic } from '../ctx'
import { fetchBooks, fetchCategories } from '../data'
import { BookCover } from '../BookCover'
import { Sk, bookNavProps } from '../bits'
import { fmtDate } from '../seo'
import type { BookItem, CategoryItem } from '../types'

// [R24-6-b-17] 经典笔趣阁模板实测色值(任务书基因 + 主题 customCss 同源, 硬编码)
const C = {
  text: '#333333',
  link: '#06c',
  linkHover: '#f60',
  blue: '#2b5b84',
  muted: '#666666',
  dim: '#999999',
  border: '#dddddd',
  line: '#eeeeee',
  dash: '#e3e3e3',
} as const

/** [R24-6-b-18] 链接 hover 行为: 经典蓝→橙下划线(真站 biquge.css 基因; inline 压不住 :hover → 局部 style 作用域类) */
const LINK_CSS = `
.dy-home a.dy-a{color:${C.link};text-decoration:none}
.dy-home a.dy-a:hover{color:${C.linkHover};text-decoration:underline}
.dy-home a.dy-book{color:${C.link};text-decoration:none}
.dy-home a.dy-book:hover{color:${C.linkHover};text-decoration:underline}
`

/** [R24-6-b-19] 深蓝标题条(真站模板 h2: 深蓝底白字 14px, 高 32) */
function BlueBar({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        margin: 0,
        height: 32,
        lineHeight: '32px',
        background: C.blue,
        color: '#fff',
        fontSize: 14,
        fontWeight: 400,
        paddingLeft: 10,
      }}
    >
      {children}
    </h2>
  )
}

/** [R24-6-b-20] MM-DD 短日期(真站 s5 列形态) */
function mmdd(b: BookItem): string {
  const d = fmtDate(b.updatedAt)
  return d ? d.slice(5) : '--'
}

/** [R24-6-b-21] hotcontent 左列大书目位: 120×150 封面 + dt(书名/右浮作者) + dd 两行简介 */
function HotItem({ book, navigate }: { book: BookItem; navigate: ReturnType<typeof usePublic>['navigate'] }) {
  return (
    <div className="flex gap-3.5" style={{ padding: '12px 0', borderBottom: `1px solid ${C.line}` }}>
      <a
        className="dy-book"
        style={{ flex: '0 0 auto', lineHeight: 0, cursor: 'pointer' }}
        {...bookNavProps(navigate, book.id)}
        aria-label={`查看《${book.name}》详情`}
      >
        <BookCover name={book.name} cover={book.cover} showAuthor={book.author} style={{ width: 120, height: 150, borderRadius: 0, border: `1px solid ${C.border}` }} />
      </a>
      <dl className="min-w-0 flex-1" style={{ margin: 0 }}>
        <dt style={{ minHeight: 40, display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          <a
            className="dy-book"
            style={{ fontSize: 16, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
            {...bookNavProps(navigate, book.id)}
          >
            {book.name}
          </a>
          <span style={{ marginLeft: 'auto', flex: '0 0 auto', fontSize: 14, fontWeight: 400, color: C.muted }}>{book.author}</span>
        </dt>
        <dd
          style={{
            margin: 0,
            color: C.muted,
            fontSize: 13,
            lineHeight: '20px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {book.intro}
        </dd>
      </dl>
    </div>
  )
}

/** [R24-6-b-22] 更新列表行(真站 newscontent li: [分类]书名 章节 作者 日期) */
function NewsRow({ book, navigate }: { book: BookItem; navigate: ReturnType<typeof usePublic>['navigate'] }) {
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 40,
        lineHeight: '30px',
        padding: '0 5px',
        borderBottom: `1px dashed ${C.dash}`,
        fontSize: 14,
      }}
    >
      <span style={{ flex: '0 0 auto', color: C.muted }}>[{book.category}]</span>
      <a
        className="dy-book"
        style={{ flex: '0 1 34%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
        title={book.name}
        {...bookNavProps(navigate, book.id)}
      >
        {book.name}
      </a>
      {/* 真站 s3 为最新章节链接; 列表数据无章节 id → 链到书籍页(由阅读入口进入章节) */}
      <a
        className="dy-book"
        style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', color: C.dim }}
        title={book.latestChapter || book.name}
        {...bookNavProps(navigate, book.id)}
      >
        {book.latestChapter || book.name}
      </a>
      <span style={{ flex: '0 0 auto', color: C.dim, maxWidth: '20%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.author}</span>
      <span style={{ flex: '0 0 auto', width: 44, textAlign: 'right', color: C.dim }}>{mmdd(book)}</span>
    </li>
  )
}

interface CatBlock {
  cat: CategoryItem
  top: BookItem | null
  rows: BookItem[]
}

export function DdyueshuHome({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()

  // [R24-6-b-23] 热门维度: 字数最多 12 本当热门(4 大书目位 + 上期强推 8 行)
  const [hot, setHot] = useState<BookItem[]>([])
  const [hotDone, setHotDone] = useState(false) // 结束标志(含失败), 避免失败后骨架屏永久态
  // [R24-6-b-24] 分类板块维度: 分类列表 + 各分类最新 13 本(6 块 novelslist)
  const [blocks, setBlocks] = useState<CatBlock[]>([])
  const [blocksDone, setBlocksDone] = useState(false) // 结束标志(含失败)

  useEffect(() => {
    let alive = true
    // [R24-6-修] effect 起始同步 setState 会触发级联渲染(react-hooks/set-state-in-effect), 移除; 站点切换由 HomeView key 重挂载兜底
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 12 })
      .then((d) => {
        if (alive) {
          setHot(d.books || [])
          setHotDone(true)
        }
      })
      .catch(() => {
        if (alive) {
          setHot([]) // 失败静默
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
        // [R24-6-b-25] 书量最多 6 分类并行拉最新 13 本: 1 本带封面做 .top 位 + 12 行书名/作者
        const top = [...cats]
          .sort((a, b) => (b._count?.books || 0) - (a._count?.books || 0))
          .slice(0, 6)
        if (!top.length) return
        const results = await Promise.all(
          top.map((c) => fetchBooks({ site: site.id, cat: c.id, page: 1, size: 13 }).catch(() => null)),
        )
        if (!alive) return
        setBlocks(
          top.map((cat, i) => {
            const list = results[i]?.books ?? []
            // .top 位 = 首本带封面的书(无封面书兜底第一本); 12 行列表剔除 top 本身
            const topBook = list.find((b) => b.cover) ?? list[0] ?? null
            return { cat, top: topBook, rows: list.filter((b) => b.id !== topBook?.id).slice(0, 12) }
          }),
        )
        setBlocksDone(true)
      })
      .catch(() => {
        if (alive) {
          setBlocks([]) // 失败静默
          setBlocksDone(true)
        }
      })
    return () => {
      alive = false
    }
  }, [site.id])

  // [R24-6-b-26] 热门位切片: 前 4 大位(优先带封面) + 后 8 行强推
  const hotFeatured = (hot.filter((b) => b.cover).length >= 4 ? hot.filter((b) => b.cover) : hot).slice(0, 4)
  const hotRecs = hot.filter((b) => !hotFeatured.some((f) => f.id === b.id)).slice(0, 8)
  // [R24-6-b-27] 更新列表切片: 最新 30 行(props.books)
  const newsRows = books.slice(0, 30)

  return (
    <div className="dy-home" style={{ padding: '8px 8px 24px', color: C.text, fontSize: 14 }}>
      <style>{LINK_CSS}</style>
      <div className="mx-auto w-full max-w-[960px]">
        {/* ============ ① #hotcontent ============ */}
        <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-[minmax(0,1fr)_278px]">
          <div className="min-w-0">
            {loading ? (
              [0, 1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3.5" style={{ padding: '12px 0', borderBottom: `1px solid ${C.line}` }}>
                  <Sk className="h-[150px] w-[120px]" style={{ borderRadius: 0 }} />
                  <div className="min-w-0 flex-1 space-y-2 pt-1">
                    <Sk className="h-5 w-2/3" />
                    <Sk className="h-3 w-full" />
                    <Sk className="h-3 w-5/6" />
                  </div>
                </div>
              ))
            ) : hotFeatured.length ? (
              hotFeatured.map((b) => <HotItem key={b.id} book={b} navigate={navigate} />)
            ) : (
              <p style={{ padding: '20px 0', color: C.dim, fontSize: 13 }}>暂无推荐书目</p>
            )}
          </div>
          <aside className="min-w-0" style={{ border: `1px solid ${C.border}`, alignSelf: 'start' }}>
            <BlueBar>上期强推</BlueBar>
            <ul className="list-none" style={{ margin: 0, padding: '0 0 4px' }}>
              {hotRecs.length
                ? hotRecs.map((b) => (
                    <li
                      key={b.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        minHeight: 40,
                        lineHeight: '28px',
                        padding: '0 10px',
                        borderBottom: `1px dashed ${C.line}`,
                        fontSize: 14,
                      }}
                    >
                      <span style={{ flex: '0 0 auto', color: C.blue }}>[{b.category}]</span>
                      <a
                        className="dy-book"
                        style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        title={b.name}
                        {...bookNavProps(navigate, b.id)}
                      >
                        {b.name}
                      </a>
                      <span style={{ flex: '0 0 auto', color: C.dim }}>{b.author}</span>
                    </li>
                  ))
                : hotDone
                  ? // [R24-6-b-40] 失败/空数据静默文案(避免骨架屏永久态)
                    (
                      <li style={{ padding: '10px', color: C.dim, fontSize: 13 }}>暂无强推数据</li>
                    )
                  : [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <li key={i} style={{ padding: '0 10px', minHeight: 40, display: 'flex', alignItems: 'center' }}>
                      <Sk className="h-4 w-full" />
                    </li>
                  ))}
            </ul>
          </aside>
        </div>

        {/* ============ ② novelslist: 6 分类块(3 列) ============ */}
        <div className="mt-2 grid grid-cols-1 gap-2.5 min-[640px]:grid-cols-2 min-[900px]:grid-cols-3">
          {blocks.length === 0 ? (
            blocksDone ? (
              // [R24-6-b-41] 失败/空分类静默文案(避免骨架屏永久态)
              <p style={{ margin: 0, padding: '12px 0', color: C.dim, fontSize: 13 }}>分类板块暂无数据</p>
            ) : (
              [0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ border: `1px solid ${C.border}` }}>
                  <Sk className="h-8 w-full" style={{ borderRadius: 0 }} />
                  <div className="flex gap-2.5 p-2.5">
                    <Sk className="h-[82px] w-[67px]" style={{ borderRadius: 0 }} />
                    <div className="flex-1 space-y-2">
                      <Sk className="h-4 w-3/4" />
                      <Sk className="h-3 w-full" />
                      <Sk className="h-3 w-5/6" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 px-2.5 pb-2">
                    {[0, 1, 2, 3].map((j) => (
                      <Sk key={j} className="h-5 w-full" />
                    ))}
                  </div>
                </div>
              ))
            )
          ) : (
            blocks.map(({ cat, top, rows }) => (
                <div key={cat.id} style={{ border: `1px solid ${C.border}` }}>
                  <BlueBar>{cat.name}</BlueBar>
                  {top && (
                    <div className="flex gap-2.5" style={{ padding: '10px 10px 4px' }}>
                      <a
                        className="dy-book"
                        style={{ flex: '0 0 auto', lineHeight: 0, cursor: 'pointer' }}
                        {...bookNavProps(navigate, top.id)}
                        aria-label={`查看《${top.name}》详情`}
                      >
                        <BookCover name={top.name} cover={top.cover} style={{ width: 67, height: 82, borderRadius: 0, border: `1px solid ${C.border}` }} />
                      </a>
                      <dl className="min-w-0 flex-1" style={{ margin: 0 }}>
                        <dt style={{ minHeight: 28, lineHeight: '28px', overflow: 'hidden' }}>
                          <a
                            className="dy-book"
                            style={{ fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                            {...bookNavProps(navigate, top.id)}
                          >
                            {top.name}
                          </a>
                        </dt>
                        <dd
                          style={{
                            margin: 0,
                            color: C.muted,
                            fontSize: 12,
                            lineHeight: '18px',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {top.intro}
                        </dd>
                      </dl>
                    </div>
                  )}
                  <ul className="list-none grid grid-cols-2 gap-x-2" style={{ margin: 0, padding: '4px 10px 8px' }}>
                    {rows.map((b) => (
                      <li
                        key={b.id}
                        style={{
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          lineHeight: '25px',
                          minHeight: 40,
                          fontSize: 13,
                        }}
                      >
                        <a
                          className="dy-book"
                          style={{ cursor: 'pointer' }}
                          title={`${b.name}/${b.author}`}
                          {...bookNavProps(navigate, b.id)}
                        >
                          {b.name}
                        </a>
                        <span style={{ color: C.dim }}>/{b.author}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
        </div>

        {/* ============ ③ #newscontent ============ */}
        <div className="mt-2 grid grid-cols-1 gap-5 min-[900px]:grid-cols-[minmax(0,1fr)_278px]">
          <div className="min-w-0">
            <BlueBar>最近更新小说列表</BlueBar>
            <ul className="list-none" style={{ margin: 0, padding: '0 0 6px' }}>
              {loading
                ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <li key={i} style={{ padding: '0 5px', minHeight: 40, display: 'flex', alignItems: 'center' }}>
                      <Sk className="h-4 w-full" />
                    </li>
                  ))
                : newsRows.map((b) => <NewsRow key={b.id} book={b} navigate={navigate} />)}
            </ul>
          </div>
          <aside className="min-w-0" style={{ alignSelf: 'start' }}>
            <BlueBar>最新入库小说</BlueBar>
            <ul className="list-none" style={{ margin: 0, padding: '0 0 6px' }}>
              {loading
                ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <li key={i} style={{ padding: '0 5px', minHeight: 40, display: 'flex', alignItems: 'center' }}>
                      <Sk className="h-4 w-full" />
                    </li>
                  ))
                : newsRows.map((b) => (
                    <li
                      key={b.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        minHeight: 40,
                        lineHeight: '28px',
                        padding: '0 5px',
                        borderBottom: `1px dashed ${C.line}`,
                        fontSize: 14,
                      }}
                    >
                      <span style={{ flex: '0 0 auto', color: C.muted }}>[{b.category}]</span>
                      <a
                        className="dy-book"
                        style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        title={b.name}
                        {...bookNavProps(navigate, b.id)}
                      >
                        {b.name}
                      </a>
                      <span style={{ flex: '0 0 auto', width: 44, textAlign: 'right', color: C.dim }}>{mmdd(b)}</span>
                    </li>
                  ))}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  )
}
