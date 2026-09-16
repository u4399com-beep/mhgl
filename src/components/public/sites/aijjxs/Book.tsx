// ============================================================
// [R26-1] 久久小说下载网 克隆书籍详情页 —— 复刻真站 /txt/57361.html
//   (快照 /tmp/r26/aijjxs-book.html + skin/yellow/style.css 实测; body.page-info)。
//
//   真站结构(左列 section > article.panel, 类名注释对应真站):
//     ① article.panel h3《书名》 + .body.detail(grid 122px 1fr 235px; 本站无作者实体数据 → 两列 122px+1fr):
//        .pic: img 112×148(边 #d1d5db padding 1 #fff, radius 0) + .copy-btn(边 #b8ddd6/8px/12px/#0f766e,
//        hover #e5fcfa; 真站文案「加入收藏」→ 本站等位交互「TXT下载」直达下载地址)
//        .kv: p(边距 0 0 4px 4px)+strong 标签 —— 书籍作者/书籍分类/书籍大小(txt KB → 字数)/
//             写作进度(.sfwj 徽章 #09B295 白字 radius 9)/上传时间/下载方式
//     ② article.panel.intro-panel h3 内容简介 + .desc(15px 透明底, 真站 .page-info .intro-panel .desc)
//     ③ article.panel h3 下载与说明 + a.download-btn(渐变 135deg #da5627→#b13e18/白字加粗/radius 12/
//        padding 11px 16px/min-width 184px; hover #c94a20→#9e350f) + .tips(TIP 虚线框 #efd3bb/#8b4a22,
//        ::before「TIP」橙章 #d86a2f)
//     ④ article.panel h3 猜您喜欢 + .body.grid2 div.book 卡(88×122 封面+h4+.meta+.desc)
//   aside(330px):
//     ⑤ article.panel.rank 「热门{分类}小说下载」 ul.lines 12 行
//     ⑥ article.panel h3 「上下部翻页」 ul.lines(真站为同分类上一本/返回列表; 本站无上一本数据 → 返回列表+最新上传)
//
//   契约补充面板(真站无, 按真站 panel/lines 视觉语言还原):
//   - 章节预览(chapters=当前 tocPage 100 章, ul.lines 形态 + currentChapterId 高亮 + 底部 .pager 书页翻页)
//   - 作品标签(tags → keyword 视图, .tags 胶囊形态)
//   - kv 补「最新章节」行(latestChapter 字段, 真站无此行)
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk, bookNavProps } from '../../bits'
import { fmtDate, formatWords, statusLabel } from '../../seo'
import type { BookItem } from '../../types'

// [R26-1-1] 真站 skin/yellow/style.css :root 实测色值(硬编码, 同 Home/Category)
const C = {
  paper: '#fffdf8',
  muted: '#6b7280',
  line: '#e5dccd',
  brand: '#0f766e',
  brandDark: '#115e59',
  brandHover: '#09B295',
  chip: '#eef9f7',
  shadow: '0 10px 30px rgba(17, 24, 39, 0.08)',
  radius: '14px',
} as const

/** [R26-1-30] panel 白底圆角卡(真站 .panel) */
function panelStyle(): CSSProperties {
  return { border: `1px solid ${C.line}`, borderRadius: C.radius, background: C.paper, boxShadow: C.shadow }
}

/** [R26-1-31] panel 标题条(真站 .panel h3::before 渐变竖条, 同 Home/Category) */
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

/** [R26-1-32] a.download-btn(真站实测: 渐变橙/白字加粗/radius 12/min-width 184; hover 由 index.ts 承担) */
function DownloadBtn({ children, onClick, label }: { children: React.ReactNode; onClick?: () => void; label?: string }) {
  return (
    <a
      className="ajx-dl"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 184,
        margin: '0 10px 10px 0',
        borderRadius: 12,
        padding: '11px 16px',
        color: '#fff',
        fontWeight: 700,
        background: 'linear-gradient(135deg, #da5627, #b13e18)',
        boxShadow: '0 10px 18px rgba(184, 70, 29, 0.24)',
        cursor: 'pointer',
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
      aria-label={label}
    >
      {children}
    </a>
  )
}

/** [R26-1-33] .pager a 分页钮(真站同款, 同 Category) */
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

/** [R26-1-34] 猜您喜欢/书卡(真站 div.book: 边 var(--line)/radius 12/#fff/padding 10 + 88×122 浮动封面) */
function LikeCard({ book, navigate }: { book: BookItem; navigate: ReturnType<typeof usePublic>['navigate'] }) {
  const d = fmtDate(book.updatedAt)
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, background: '#fff', padding: 10, overflow: 'hidden' }}>
      <a className="ajx-book" style={{ float: 'left', lineHeight: 0, cursor: 'pointer' }} {...bookNavProps(navigate, book.id)}>
        <BookCover name={book.name} cover={book.cover} showAuthor={book.author} style={{ width: 88, height: 122, borderRadius: 8, marginRight: 10 }} />
      </a>
      <h4 style={{ margin: 0, fontSize: 15, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <a className="ajx-book" style={{ cursor: 'pointer' }} {...bookNavProps(navigate, book.id)}>
          {book.name}
        </a>
      </h4>
      <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
        {book.author} · {book.category}
        {book.wordCount ? ` · ${formatWords(book.wordCount)}` : ''}
        {d ? ` · ${d.slice(5)}` : ''}
      </div>
      <div
        style={{
          marginTop: 4, fontSize: 13, color: '#9ca3af', lineHeight: 1.55,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}
      >
        {book.intro}
      </div>
    </div>
  )
}

export function AijjxsBook({ data, loading, error, tocPage, currentChapterId }: SiteBookProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const tags = data?.tags ?? []

  // [R26-1-35] 猜您喜欢: 同分类最新 4 本(真站为同分类推荐位)
  const [likes, setLikes] = useState<BookItem[]>([])
  const [likesDone, setLikesDone] = useState(false)
  // [R26-1-36] aside 热门榜: 同分类字数最多 12 本(项目口径同首页热榜)
  const [hot, setHot] = useState<BookItem[]>([])
  const [hotDone, setHotDone] = useState(false)
  const catId = book?.categoryId || undefined

  // [R27-6-fix] 换书复位改为渲染期调整(React 认可模式)—— effect 内不再同步 setState
  const likeHotKey = `${site.id}|${book?.id || ''}|${catId || ''}`
  const [prevLikeHotKey, setPrevLikeHotKey] = useState<string | null>(null)
  if (prevLikeHotKey !== likeHotKey) {
    setPrevLikeHotKey(likeHotKey)
    setLikesDone(false)
    setHotDone(false)
  }

  useEffect(() => {
    let alive = true
    if (!book?.id) return
    fetchBooks({ site: site.id, cat: catId, page: 1, size: 4 })
      .then((d) => {
        if (!alive) return
        // 排除自身(真站推荐位不含当前书)
        setLikes((d.books || []).filter((b) => b.id !== book.id).slice(0, 4))
        setLikesDone(true)
      })
      .catch(() => {
        if (alive) {
          setLikes([])
          setLikesDone(true)
        }
      })
    return () => {
      alive = false
    }
  }, [site.id, book?.id, catId])

  useEffect(() => {
    let alive = true
    if (!book?.id) return
    fetchBooks({ site: site.id, cat: catId, sort: 'words', page: 1, size: 12 })
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
  }, [site.id, book?.id, catId])

  // [R26-1-37] 章节预览分页口径: fetchBook(bookId, tocPage, 100), 底部翻页 navigate({view:'book', bookId, page})
  const tocTotal = data?.tocTotal || 0
  const tocSize = data?.tocSize || 100
  const tocTotalPages = data?.tocTotalPages || Math.max(1, Math.ceil(tocTotal / tocSize))

  const goTocPage = (p: number) => book && navigate({ view: 'book', bookId: book.id, page: p })

  // ============ 加载/错误态 ============
  if (error) {
    return (
      <div className="ajx-book-page" style={{ padding: '18px 14px 36px' }}>
        <div className="mx-auto w-full max-w-[1220px]">
          <ErrorState message="书籍详情加载失败" detail={error} />
        </div>
      </div>
    )
  }
  if (loading || !book) {
    return (
      <div className="ajx-book-page" style={{ padding: '18px 14px 36px' }} role="status" aria-label="书籍详情加载中">
        <div className="mx-auto w-full max-w-[1220px]">
          <article style={panelStyle()}>
            <Sk className="h-12 w-full" style={{ borderRadius: '14px 14px 0 0' }} />
            <div className="flex gap-4 p-4">
              <Sk className="h-[148px] w-[112px]" style={{ borderRadius: 0 }} />
              <div className="flex-1 space-y-2 pt-1">
                <Sk className="h-4 w-2/3" />
                <Sk className="h-4 w-1/2" />
                <Sk className="h-4 w-1/2" />
                <Sk className="h-4 w-1/3" />
              </div>
            </div>
          </article>
          <span className="sr-only">加载中…</span>
        </div>
      </div>
    )
  }

  const firstChapterId = chapters[0]?.id

  return (
    <div className="ajx-book-page" style={{ padding: '18px 14px 36px' }}>
      <div className="mx-auto w-full max-w-[1220px]">
        <main className="grid grid-cols-1 gap-3.5 min-[980px]:grid-cols-[minmax(0,1fr)_330px]">
          {/* ============ 左列 section ============ */}
          <section style={{ minWidth: 0 }}>
            {/* ① 详情 panel: h3《书名》 + .body.detail */}
            <article style={panelStyle()}>
              <PanelTitle>{`《${book.name}》`}</PanelTitle>
              <div style={{ padding: '12px 14px' }}>
                <div className="flex flex-col gap-3 min-[680px]:flex-row" style={{ gap: 14 }}>
                  {/* .pic: 112×148 封面(边 #d1d5db padding 1) + .copy-btn 等位「TXT下载」 */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 7, flex: '0 0 auto' }}>
                    <BookCover
                      name={book.name}
                      cover={book.cover}
                      style={{ width: 112, height: 148, borderRadius: 0, border: '1px solid #d1d5db', padding: 1, background: '#fff' }}
                    />
                    {/* 真站 .copy-btn「加入收藏」(会员功能) → 等位放 TXT 下载直达(唯一允许的 <a> 下载出口) */}
                    <a
                      href={`/api/public/download?book=${book.id}`}
                      style={{
                        border: '1px solid #b8ddd6',
                        borderRadius: 8,
                        padding: '6px 10px',
                        fontSize: 12,
                        background: '#fff',
                        color: '#0f766e',
                      }}
                      aria-label={`下载《${book.name}》TXT 电子书`}
                    >
                      TXT下载
                    </a>
                  </div>
                  {/* .kv 元信息行(真站 p strong 标签形态); [R26-1-38] 异构字面量数组显式统一可空字段, 防 TS2339 联合属性访问错 */}
                  <div style={{ minWidth: 0, flex: 1 }}>
                  {(
                    [
                      { k: '书籍作者', v: book.author, search: book.author },
                      { k: '书籍分类', v: book.category, cat: book.categoryId || undefined },
                      { k: '书籍大小', v: formatWords(book.wordCount) },
                      { k: '写作进度', v: '', sfwj: statusLabel(book.status) },
                      { k: '上传时间', v: fmtDate(book.updatedAt) },
                      { k: '最新章节', v: book.latestChapter },
                      { k: '下载方式', v: '全本免费' },
                    ] as { k: string; v?: string; search?: string; cat?: string; sfwj?: string }[]
                  ).map((row) => (
                      <p key={row.k} style={{ margin: '0 0 4px 4px', fontSize: 14, lineHeight: 1.8 }}>
                        <strong style={{ color: '#374151' }}>{row.k}：</strong>
                        {row.cat ? (
                          <a
                            className="ajx-a"
                            style={{ cursor: 'pointer' }}
                            onClick={() => navigate({ view: 'category', cat: row.cat })}
                            role="button"
                            tabIndex={0}
                            aria-label={`浏览 ${row.v} 分类`}
                          >
                            {row.v}
                          </a>
                        ) : row.search ? (
                          <a
                            className="ajx-a"
                            style={{ cursor: 'pointer' }}
                            onClick={() => navigate({ view: 'search', q: row.search })}
                            role="button"
                            tabIndex={0}
                            aria-label={`搜索作者 ${row.search}`}
                          >
                            {row.v}
                          </a>
                        ) : row.sfwj ? (
                          // 真站 .sfwj 徽章: #09B295 底白字 radius 9 padding 1px 8px 3px 6px
                          <span style={{ background: '#09B295', borderRadius: 9, color: '#fff', padding: '1px 8px 3px 6px', fontSize: 13 }}>
                            {row.sfwj}
                          </span>
                        ) : (
                          <span style={{ color: '#374151' }}>{row.v || '--'}</span>
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </article>

            {/* ② 内容简介(intro-panel .desc 15px 透明底) */}
            <article style={{ ...panelStyle(), marginTop: 14 }}>
              <PanelTitle>内容简介</PanelTitle>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: 15, lineHeight: 1.9, color: '#374151', whiteSpace: 'pre-wrap' }}>{book.intro || '暂无简介'}</div>
              </div>
            </article>

            {/* ③ 下载与在线阅读(真站「下载与说明」panel: download-btn 组 + .tips TIP 框) */}
            <article style={{ ...panelStyle(), marginTop: 14 }}>
              <PanelTitle>下载与说明</PanelTitle>
              <div style={{ padding: '12px 14px' }}>
                {/* 契约按钮组: 开始阅读 / 查看完整目录 / TXT下载(唯一允许 <a href> 下载) */}
                <DownloadBtn
                  onClick={() => firstChapterId && navigate({ view: 'read', chapterId: firstChapterId })}
                  label={`开始阅读《${book.name}》`}
                >
                  开始阅读
                </DownloadBtn>
                <DownloadBtn onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })} label={`查看《${book.name}》完整目录`}>
                  查看完整目录
                </DownloadBtn>
                <a
                  className="ajx-dl"
                  href={`/api/public/download?book=${book.id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 184,
                    margin: '0 10px 10px 0',
                    borderRadius: 12,
                    padding: '11px 16px',
                    color: '#fff',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #da5627, #b13e18)',
                    boxShadow: '0 10px 18px rgba(184, 70, 29, 0.24)',
                  }}
                  aria-label={`下载《${book.name}》TXT 电子书`}
                >
                  电子书下载地址
                </a>
                {/* 真站 .tips: 2px dashed #efd3bb / 渐变 #fffdf9→#fff8f1 / #8b4a22 / 「TIP」橙章(#d86a2f) */}
                <div
                  style={{
                    position: 'relative',
                    marginTop: 12,
                    padding: '12px 14px 12px 44px',
                    border: '2px dashed #efd3bb',
                    borderRadius: 10,
                    background: 'linear-gradient(180deg, #fffdf9 0%, #fff8f1 100%)',
                    color: '#8b4a22',
                    lineHeight: 1.8,
                    fontSize: 13,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute', left: 12, top: 24, transform: 'translateY(-50%)',
                      display: 'inline-block', padding: '1px 6px', borderRadius: 999, background: '#d86a2f',
                      color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.3px', lineHeight: '16px',
                    }}
                  >
                    TIP
                  </span>
                  本站所有电子书全本免费下载、无需注册会员；也可点击「开始阅读」直接在线看 TXT 全文内容。
                </div>
              </div>
            </article>

            {/* ④ 章节预览(契约面板: chapters=当前 tocPage 100 章; ul.lines 形态 + 当前章高亮 + 书页翻页) */}
            <article style={{ ...panelStyle(), marginTop: 14 }}>
              <PanelTitle>{`章节预览（第 ${tocPage}/${tocTotalPages} 页）`}</PanelTitle>
              <div style={{ padding: '12px 14px' }}>
                <ul className="list-none" style={{ margin: 0, padding: 0 }}>
                  {chapters.map((c) => {
                    const cur = currentChapterId === c.id
                    return (
                      <li
                        key={c.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 10,
                          alignItems: 'center',
                          padding: '7px 8px',
                          margin: '0 -8px',
                          borderBottom: `1px dashed ${C.line}`,
                          borderRadius: 8,
                          background: cur ? C.chip : 'transparent',
                        }}
                      >
                        <a
                          className="ajx-book"
                          style={{
                            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer',
                            color: cur ? C.brand : undefined, fontWeight: cur ? 700 : undefined,
                          }}
                          onClick={() => navigate({ view: 'read', chapterId: c.id })}
                          role="button"
                          tabIndex={0}
                          aria-label={`阅读 ${c.title}`}
                          aria-current={cur || undefined}
                        >
                          {c.title}
                        </a>
                        <span style={{ flex: '0 0 auto', fontSize: 12, color: C.muted }}>{formatWords(c.wordCount)}</span>
                      </li>
                    )
                  })}
                </ul>
                {tocTotalPages > 1 && (
                  <div
                    className="ajx-pager"
                    style={{ marginTop: 14, display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}
                    role="navigation"
                    aria-label="章节目录翻页"
                  >
                    {tocPage > 1 && (
                      <a className="ajx-a" style={pagerBtn()} onClick={() => goTocPage(tocPage - 1)} role="button" tabIndex={0} aria-label="上一页章节">
                        上一页
                      </a>
                    )}
                    {tocPage < tocTotalPages && (
                      <a className="ajx-a" style={pagerBtn()} onClick={() => goTocPage(tocPage + 1)} role="button" tabIndex={0} aria-label="下一页章节">
                        下一页
                      </a>
                    )}
                    <a
                      className="ajx-a"
                      style={pagerBtn()}
                      onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}
                      role="button"
                      tabIndex={0}
                      aria-label="查看完整目录"
                    >
                      完整目录
                    </a>
                    <span style={{ fontSize: 12, color: C.muted, marginLeft: 6 }}>共 {tocTotal} 章</span>
                  </div>
                )}
              </div>
            </article>

            {/* ⑤ 作品标签(契约面板: tags → keyword; .tags 胶囊形态) */}
            {tags.length > 0 && (
              <article style={{ ...panelStyle(), marginTop: 14 }}>
                <PanelTitle>作品标签</PanelTitle>
                <div style={{ padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {tags.map((t) => (
                    <a
                      key={t.tag}
                      className="ajx-flat"
                      style={{ border: '1px solid #cae8e3', background: C.chip, padding: '4px 10px', borderRadius: 999, fontSize: 13, cursor: 'pointer' }}
                      onClick={() => navigate({ view: 'keyword', tag: t.tag })}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          navigate({ view: 'keyword', tag: t.tag })
                        }
                      }}
                      aria-label={`查看标签 ${t.tag}`}
                    >
                      {t.tag}
                    </a>
                  ))}
                </div>
              </article>
            )}

            {/* ⑥ 猜您喜欢(真站 .body.grid2 .book 卡) */}
            <article style={{ ...panelStyle(), marginTop: 14 }}>
              <PanelTitle>猜您喜欢</PanelTitle>
              <div className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2" style={{ padding: '12px 14px' }}>
                {likes.length
                  ? likes.map((b) => <LikeCard key={b.id} book={b} navigate={navigate} />)
                  : likesDone
                    ? <p style={{ margin: 0, fontSize: 13, color: C.muted }}>暂无同分类推荐</p>
                    : (
                        [0, 1, 2, 3].map((i) => (
                          <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 12, background: '#fff', padding: 10 }}>
                            <div className="flex gap-2.5">
                              <Sk className="h-[122px] w-[88px]" style={{ borderRadius: 8 }} />
                              <div className="flex-1 space-y-2 pt-1">
                                <Sk className="h-4 w-3/4" />
                                <Sk className="h-3 w-1/2" />
                                <Sk className="h-3 w-full" />
                              </div>
                            </div>
                          </div>
                        ))
                      )}
              </div>
            </article>
          </section>

          {/* ============ 右栏 aside 330px ============ */}
          <aside>
            {/* ⑤ 热门{分类}小说下载(panel.rank ul.lines 12 行) */}
            <article style={{ ...panelStyle(), background: '#fff5e6' }}>
              <PanelTitle>{`热门${book.category}小说下载`}</PanelTitle>
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

            {/* ⑥ 上下部翻页(真站 panel: 同分类上一本/返回列表; 本站无相邻书数据 → 返回列表 + 首页最新) */}
            <article style={{ ...panelStyle(), marginTop: 14 }}>
              <PanelTitle>上下部翻页</PanelTitle>
              <div style={{ padding: '12px 14px' }}>
                <ul className="list-none" style={{ margin: 0, padding: 0 }}>
                  <li style={{ padding: '7px 0', borderBottom: `1px dashed ${C.line}` }}>
                    <a
                      className="ajx-a"
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined })}
                      role="button"
                      tabIndex={0}
                      aria-label={`返回 ${book.category} 列表`}
                    >
                      返回{book.category}列表
                    </a>
                  </li>
                  <li style={{ padding: '7px 0' }}>
                    <a
                      className="ajx-a"
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate({ view: 'home' })}
                      role="button"
                      tabIndex={0}
                      aria-label="查看最新上传"
                    >
                      最新上传
                    </a>
                  </li>
                </ul>
              </div>
            </article>
          </aside>
        </main>
      </div>
    </div>
  )
}
