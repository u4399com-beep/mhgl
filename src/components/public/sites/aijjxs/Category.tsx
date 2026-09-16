// ============================================================
// [R26-1] 久久小说下载网 克隆分类页 —— 复刻真站 /txt/chuanyue/ 列表页
//   (快照 /tmp/r26/aijjxs-category.html + skin/yellow/style.css 实测)。
//
//   真站结构(自上而下, 类名注释对应真站):
//   main.layout > div.cenMain(左列, 边 var(--line)/radius var(--radius)/bg var(--paper)/padding 14px 16px)
//     ① .path 面包屑: 边 dashed #ddcfb8 / bg #fff8ee / #7a6750 13px / radius 10 / padding 9px 12px
//     ② .articleInfo h1: 20px 居中 #1f3f3a / 底边 #eadfcd / padding-bottom 10 (真站文案「穿越小说电子书下载」)
//     ③ .body.filters .row: 胶囊筛选芯片(边 var(--line)/radius 999/padding 5px 10px/13px/#fff;
//        .on = var(--brand) 底白字)。真站 4 行(排序/大小/时间…), 数据契约仅支持最新上传 → 其余如实禁用
//     ④ .catalog > .listbg 图文块: min-height 144px / padding 16px 16px 14px 118px / 边 #ecdcc6 / radius 14 /
//        bg 渐变 #fffefa→#fffaf1 / shadow 0 8px 18px rgba(146,109,58,.08); .img 92×128 绝对定位 left16 top16
//        (边 #d8d8d8 padding 1); .title a 18px 加粗 #0b3b2e(hover #09B295) + .new 12px「{日期} 上传」;
//        简介 div 14px #555 lh 1.82; .mainGreen 元信息行 13px(small 标签 #aaa): 书籍作者/文件大小/写作进度/下载方式
//     ⑤ .pager: flex gap 3px; a/span min-width 34 高 30 radius 8 边 var(--line) #fff;
//        .pager > b 当前页 = var(--brand) 底白字; a:hover #f3ede1。真站形态: [总数 pill][当前页][页码…][下一页][尾页]
//   aside(330px):
//     ⑥ article.panel.rank 「热门{分类}下载」 ul.lines(.no 序号 + 书名 + .date 作者列)
//     ⑦ article.panel 「热门作者」 .body.tags 胶囊
//     ⑧ article.panel 「相关分类」 ul.lines(真站为相关榜单链接, 本站以真实分类列表还原)
//
//   降级说明: 真站 .badge「荐」标记无对应数据字段 → 不渲染; 大小/时间筛选行数据契约不支持 →
//   渲染但 aria-disabled(保留真站视觉, 不造假交互); 文件大小以 formatWords(字数) 替代 txt KB。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks, fetchCategories } from '../../data'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk, bookNavProps } from '../../bits'
import { fmtDate, formatWords, statusLabel } from '../../seo'
import type { BookItem, CategoryItem } from '../../types'

// [R26-1-1] 真站 skin/yellow/style.css :root 实测色值(硬编码, 同 Home.tsx)
const C = {
  paper: '#fffdf8',
  muted: '#6b7280',
  line: '#e5dccd',
  brand: '#0f766e',
  brandDark: '#115e59',
  accent: '#b45309',
  shadow: '0 10px 30px rgba(17, 24, 39, 0.08)',
  radius: '14px',
} as const

/** [R26-1-20] panel 白底圆角卡(真站 .panel) */
function panelStyle(): CSSProperties {
  return { border: `1px solid ${C.line}`, borderRadius: C.radius, background: C.paper, boxShadow: C.shadow }
}

/** [R26-1-21] panel 标题条(真站 .panel h3::before 渐变竖条, 同 Home PanelTitle) */
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

/** [R26-1-22] .catalog .listbg 图文块(真站分类列表行: 绝对定位封面 + 标题行 + 简介 + mainGreen 元信息) */
function ListRow({ book, navigate }: { book: BookItem; navigate: ReturnType<typeof usePublic>['navigate'] }) {
  const d = fmtDate(book.updatedAt)
  return (
    <div
      style={{
        position: 'relative',
        marginBottom: 14,
        minHeight: 144,
        padding: '16px 16px 14px 118px',
        border: '1px solid #ecdcc6',
        borderRadius: 14,
        background: 'linear-gradient(180deg, #fffefa 0%, #fffaf1 100%)',
        boxShadow: '0 8px 18px rgba(146, 109, 58, 0.08)',
        overflow: 'hidden',
      }}
    >
      {/* 真站 .img: absolute left16 top16 92×128 边 #d8d8d8 padding 1(无图走 BookCover 渐变占位) */}
      <a
        className="ajx-book"
        style={{ position: 'absolute', left: 16, top: 16, width: 92, height: 128, lineHeight: 0, cursor: 'pointer' }}
        {...bookNavProps(navigate, book.id)}
        aria-label={`查看《${book.name}》详情`}
      >
        <BookCover name={book.name} cover={book.cover} style={{ width: 92, height: 128, borderRadius: 0 }} />
      </a>
      {/* .title a: 18px 加粗 #0b3b2e(hover #09B295 由 index.ts .ajx-cat-title 承担) + .new「{日期} 上传」 */}
      <div style={{ lineHeight: 1.5 }}>
        <a
          className="ajx-cat-title"
          style={{ color: '#0b3b2e', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
          {...bookNavProps(navigate, book.id)}
        >
          {book.name}
        </a>
        {d && (
          <span style={{ marginLeft: 8, fontSize: 12, color: '#F03' }}>
            {d} 上传
          </span>
        )}
      </div>
      {/* 简介 div: 14px #555 lh 1.82(两行截断) */}
      <div
        style={{
          marginTop: 8,
          color: '#555',
          fontSize: 14,
          lineHeight: 1.82,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {book.intro}
      </div>
      {/* .mainGreen 元信息行: 13px #555, small 标签 #aaa(真站: 书籍作者/文件大小/写作进度/下载方式) */}
      <div style={{ marginTop: 6, color: '#555', fontSize: 13, lineHeight: 1.85, wordBreak: 'break-word' }}>
        <small style={{ color: '#aaa', marginRight: 1 }}>书籍作者：</small>
        <a
          className="ajx-book"
          style={{ fontSize: 13, cursor: 'pointer' }}
          onClick={() => navigate({ view: 'search', q: book.author })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              navigate({ view: 'search', q: book.author })
            }
          }}
          aria-label={`搜索作者 ${book.author}`}
        >
          {book.author}
        </a>
        <small style={{ color: '#aaa', margin: '0 1px 0 3px' }}>文件大小：</small>
        {formatWords(book.wordCount)}
        <small style={{ color: '#aaa', margin: '0 1px 0 3px' }}>写作进度：</small>
        {statusLabel(book.status)}
        <small style={{ color: '#aaa', margin: '0 1px 0 3px' }}>下载方式：</small>
        全本免费
      </div>
    </div>
  )
}

export function AijjxsCategory({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { site, navigate } = usePublic()

  // [R26-1-23] aside 热门榜: 本分类字数最多 12 本当「热门XX下载」榜(真站为点击统计, 项目口径同首页热榜)
  const [hot, setHot] = useState<BookItem[]>([])
  const [hotDone, setHotDone] = useState(false)
  // [R26-1-24] 相关分类面板: 真站为榜单链接组, 以真实分类列表还原(书量前 8)
  const [cats, setCats] = useState<CategoryItem[]>([])
  const [catsDone, setCatsDone] = useState(false)

  // [R27-6-fix] 换分类复位改为渲染期调整(React 认可模式), effect 内不再同步 setState
  const hotKey = `${site.id}|${cat || ''}`
  const [prevHotKey, setPrevHotKey] = useState<string | null>(null)
  if (prevHotKey !== hotKey) {
    setPrevHotKey(hotKey)
    setHotDone(false)
  }

  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, cat: cat || undefined, sort: 'words', page: 1, size: 12 })
      .then((d) => {
        if (!alive) return
        setHot(d.books || [])
        setHotDone(true)
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
  }, [site.id, cat])

  useEffect(() => {
    let alive = true
    fetchCategories()
      .then((list) => {
        if (!alive) return
        setCats([...list].sort((a, b) => (b._count?.books || 0) - (a._count?.books || 0)).slice(0, 8))
        setCatsDone(true)
      })
      .catch(() => {
        if (alive) {
          setCats([])
          setCatsDone(true)
        }
      })
    return () => {
      alive = false
    }
  }, [site.id])

  const books = data?.books || []
  const total = data?.total || 0
  // [R26-1-25] 分页口径: fetchBooks size 24(契约), 真站每页 10; 页码窗 = 当前页起 10 个(真站 1..10 形态)
  const pageSize = data?.size || 24
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const winStart = Math.max(1, Math.min(page - 5, totalPages - 9))
  const winPages: number[] = []
  for (let p = winStart; p <= Math.min(totalPages, winStart + 9); p++) winPages.push(p)

  const goPage = (p: number) => navigate({ view: 'category', cat: cat || undefined, page: p })

  return (
    <div className="ajx-cat" style={{ padding: '18px 14px 36px' }}>
      <div className="mx-auto w-full max-w-[1220px]">
        <main className="grid grid-cols-1 gap-3.5 min-[980px]:grid-cols-[minmax(0,1fr)_330px]">
          {/* ============ 左列: div.cenMain ============ */}
          <div
            style={{
              minWidth: 0,
              border: `1px solid ${C.line}`,
              borderRadius: C.radius,
              background: C.paper,
              boxShadow: C.shadow,
              padding: '14px 16px',
            }}
          >
            {/* ① .path 面包屑(真站 .cenMain .path 规则: dashed #ddcfb8 / #fff8ee / #7a6750) */}
            <div
              style={{
                margin: '0 0 10px',
                padding: '9px 12px',
                border: '1px dashed #ddcfb8',
                borderRadius: 10,
                background: '#fff8ee',
                color: '#7a6750',
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              当前位置：
              <a className="ajx-a" style={{ cursor: 'pointer' }} onClick={() => navigate({ view: 'home' })} role="button" tabIndex={0} aria-label="返回首页">
                首页
              </a>
              {' » '}
              {catName}
              {total > 0 && <span style={{ marginLeft: 6 }}>（共 {total} 本）</span>}
            </div>

            {/* ② .articleInfo h1: 真站文案「穿越小说电子书下载」 */}
            <h1
              style={{
                margin: '0 0 12px',
                paddingBottom: 10,
                borderBottom: '1px solid #eadfcd',
                fontSize: 20,
                lineHeight: 1.35,
                color: '#1f3f3a',
                textAlign: 'center',
              }}
            >
              {catName === '全部分类' ? '全部小说电子书下载' : `${catName}电子书下载`}
            </h1>

            {/* ③ .body.filters 排序行(真站首行: 最新上传/人气最高/收藏最多/只看推荐);
                数据契约仅支持最新上传 → 其余 aria-disabled 保留视觉不造假交互 */}
            <div style={{ margin: '8px 0 2px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <span
                  className="ajx-flat"
                  aria-current="true"
                  style={{ border: `1px solid ${C.brand}`, borderRadius: 999, padding: '5px 10px', fontSize: 13, background: C.brand, color: '#fff' }}
                >
                  最新上传
                </span>
                {['人气最高', '收藏最多', '只看推荐'].map((t) => (
                  <span
                    key={t}
                    aria-disabled
                    title="数据源未提供该排序"
                    style={{ border: `1px solid ${C.line}`, borderRadius: 999, padding: '5px 10px', fontSize: 13, background: '#fff', color: '#9ca3af', cursor: 'default' }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* ④ .catalog 图文块列表 */}
            <div style={{ marginTop: 4 }}>
              {error ? (
                <ErrorState message="分类列表加载失败" detail={error} />
              ) : loading ? (
                <div role="status" aria-label="分类列表加载中">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      style={{
                        position: 'relative',
                        marginBottom: 14,
                        minHeight: 144,
                        padding: '16px 16px 14px 118px',
                        border: '1px solid #ecdcc6',
                        borderRadius: 14,
                        background: 'linear-gradient(180deg, #fffefa 0%, #fffaf1 100%)',
                      }}
                    >
                      <Sk className="absolute left-4 top-4 h-[128px] w-[92px]" style={{ borderRadius: 0 }} />
                      <Sk className="h-5 w-2/3" />
                      <Sk className="mt-2 h-4 w-full" />
                      <Sk className="mt-2 h-4 w-1/2" />
                    </div>
                  ))}
                  <span className="sr-only">加载中…</span>
                </div>
              ) : books.length ? (
                books.map((b) => <ListRow key={b.id} book={b} navigate={navigate} />)
              ) : (
                <p style={{ margin: '10px 0', fontSize: 13, color: C.muted }}>该分类暂无书籍，去看看其他分类吧。</p>
              )}
            </div>

            {/* ⑤ .pager 分页(真站: [总数][当前页 b][页码…][下一页][尾页]) */}
            {total > 0 && (
              <div
                className="ajx-pager"
                style={{ marginTop: 14, display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}
                role="navigation"
                aria-label="分类分页"
              >
                <b
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 34, height: 30,
                    borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', padding: '5px 9px', fontSize: 13, color: C.muted, fontWeight: 700,
                  }}
                  title="总数"
                >
                  {total}
                </b>
                {page > 1 && (
                  <a className="ajx-a" style={pagerBtn()} onClick={() => goPage(page - 1)} role="button" tabIndex={0} aria-label="上一页">
                    上一页
                  </a>
                )}
                {winPages.map((p) =>
                  p === page ? (
                    <b
                      key={p}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 34, height: 30,
                        borderRadius: 8, border: `1px solid ${C.brand}`, background: C.brand, color: '#fff', padding: '5px 9px',
                        fontSize: 13, fontWeight: 700, lineHeight: 1,
                      }}
                      aria-current="page"
                    >
                      {p}
                    </b>
                  ) : (
                    <a key={p} className="ajx-a" style={pagerBtn()} onClick={() => goPage(p)} role="button" tabIndex={0} aria-label={`第 ${p} 页`}>
                      {p}
                    </a>
                  ),
                )}
                {page < totalPages && (
                  <a className="ajx-a" style={pagerBtn()} onClick={() => goPage(page + 1)} role="button" tabIndex={0} aria-label="下一页">
                    下一页
                  </a>
                )}
                {page < totalPages && (
                  <a className="ajx-a" style={pagerBtn()} onClick={() => goPage(totalPages)} role="button" tabIndex={0} aria-label="尾页">
                    尾页
                  </a>
                )}
              </div>
            )}
          </div>

          {/* ============ 右栏 aside ============ */}
          <aside>
            {/* ⑥ panel.rank 热门{分类}下载 */}
            <article style={{ ...panelStyle(), background: '#fff5e6' }}>
              <PanelTitle>{`热门${catName === '全部分类' ? '小说' : catName}下载`}</PanelTitle>
              <div style={{ padding: '12px 14px' }}>
                {hot.length ? (
                  <ul className="list-none" style={{ margin: 0, padding: 0 }}>
                    {hot.map((b, i) => (
                      <li
                        key={b.id}
                        style={{
                          display: 'flex', justifyContent: 'flex-start', gap: 4, alignItems: 'center',
                          minHeight: 40, padding: '7px 0', borderBottom: `1px dashed ${C.line}`,
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
                  <p style={{ margin: 0, padding: '10px 0', fontSize: 13, color: C.muted }}>热榜数据暂缺</p>
                ) : (
                  <div role="status" aria-label="热榜加载中">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Sk key={i} className="mb-2 h-6 w-full" />
                    ))}
                  </div>
                )}
              </div>
            </article>

            {/* ⑦ 热门作者(.body.tags 胶囊) */}
            <article style={{ ...panelStyle(), marginTop: 14 }}>
              <PanelTitle>热门作者</PanelTitle>
              <div style={{ padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {hot.length ? (
                  Array.from(new Set(hot.map((b) => b.author).filter(Boolean))).slice(0, 10).map((a) => (
                    <a
                      key={a}
                      className="ajx-flat"
                      style={{ border: '1px solid #cae8e3', background: '#eef9f7', padding: '4px 10px', borderRadius: 999, fontSize: 13, cursor: 'pointer' }}
                      onClick={() => navigate({ view: 'search', q: a })}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          navigate({ view: 'search', q: a })
                        }
                      }}
                      aria-label={`搜索作者 ${a}`}
                    >
                      {a}
                    </a>
                  ))
                ) : (
                  Array.from({ length: 8 }).map((_, i) => <Sk key={i} className="h-7 w-16 rounded-full" />)
                )}
              </div>
            </article>

            {/* ⑧ 相关分类(真站为榜单链接组 ul.lines; 以真实分类列表还原) */}
            <article style={{ ...panelStyle(), marginTop: 14 }}>
              <PanelTitle>相关分类</PanelTitle>
              <div style={{ padding: '12px 14px' }}>
                {cats.length ? (
                  <ul className="list-none" style={{ margin: 0, padding: 0 }}>
                    {cats.map((c) => (
                      <li
                        key={c.id}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px dashed ${C.line}` }}
                      >
                        <a
                          className="ajx-a"
                          style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                          onClick={() => navigate({ view: 'category', cat: c.id })}
                          role="button"
                          tabIndex={0}
                          aria-label={`浏览 ${c.name} 分类`}
                        >
                          {c.name}
                        </a>
                        {typeof c._count?.books === 'number' && (
                          <span style={{ flex: '0 0 auto', fontSize: 12, color: C.muted }}>{c._count.books} 本</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : catsDone ? (
                  <p style={{ margin: 0, padding: '10px 0', fontSize: 13, color: C.muted }}>暂无分类数据</p>
                ) : (
                  <div role="status" aria-label="分类加载中">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Sk key={i} className="mb-2 h-6 w-full" />
                    ))}
                  </div>
                )}
              </div>
            </article>
          </aside>
        </main>
      </div>
    </div>
  )
}

/** [R26-1-26] .pager a 分页钮(真站: min-width 34/高 30/radius 8/边 var(--line)/#fff; hover #f3ede1 由 index.ts 承担) */
function pagerBtn(): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
    height: 30,
    borderRadius: 8,
    border: '1px solid #e5dccd',
    background: '#fff',
    padding: '4px 9px',
    fontSize: 13,
    lineHeight: 1,
    cursor: 'pointer',
  }
}
