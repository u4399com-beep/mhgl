// ============================================================
// [R26-5-3] ddyueshu(顶点小说) 书籍详情页 —— 复刻真站 /2_2219/ 形态(经典笔趣阁 biquge.css)。
//
// 真站勘察: /tmp/r26/ddyueshu-book.html(圣墟书页, GBK) + biquge.css L132-155:
//   .box_con(border 2px #88C6E5 976px) > .con_top 面包屑条(40px bg #E1ECED 底线 #88C6E5:
//   「顶点小说 > 玄幻小说 > 圣墟最新章节」) > #maininfo(右浮 800px): #info(h1 黑体 28px/700;
//   p 行 25px 宽 350px: 作者/动作/最后更新) + #intro(上虚线 #88C6E5, 13px, p 缩进 2em 上距 10px)
//   + #sidebar(左浮 140px): #fmimg(bg #E1ECED 12px 边距+内距, 封面 120×150, 真站 HTML 内联 152×195
//   覆盖 CSS — 按取 CSS 值还原并注明) > .box_con#2 > #list: dl dt(#C3DFEA 章组头条 14px 居中 lh28
//   pad 5×10) + dd(33% 宽 float, 底虚线 #CCC, lh 200%, text-indent 10px, a #444)+ #listtj 关键词推荐行
//   (真站 /kw/ 链接 → 本项目 keyword 视图)。页脚 .footer_link 新书推荐由全局 SiteFooter 承担。
//
// [R26-5-3 增强] 操作按钮: 真站老模板无按钮组, 按本站新模板 /css/style.css L132 实测 .downtxt
//   (bg #459DF5 白字 lh 34px 圆角 2px, hover #118860)还原「开始阅读/查看完整目录/TXT下载」竖排封面下;
//   「查看完整目录」另配 .book_more 全宽条(L188: bg #88C6E5 圆角 6px lh 42px 白字 16px)。
//   分页: 真站书页整本目录无分页, 数据层 toc 100 章/页 → .page 样式(style.css L149-153)补全 [推断]。
//   当前章高亮: 借真站 .novellist li a:visited{COLOR:red} 基因(#CC3300 加粗)。
// ============================================================
'use client'

import type { KeyboardEvent } from 'react'
import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import type { ViewParams } from '../../ctx'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate, formatWords, statusLabel } from '../../seo'
import type { TocChapter } from '../../types'

// [R26-5-3a] 真站实测色板 — 出处 biquge.css(书页) + css/style.css(按钮/分页)
const C = {
  text: '#555555',
  bg: '#E9FAFF',
  boxBorder: '#88C6E5', // biquge L132 .box_con 外框
  teal: '#E1ECED', // L133 .con_top / L137 #fmimg 底
  volBar: '#C3DFEA', // L153 #list dt 组头条底
  border: '#DDD', // L53 封面细框
  dim: '#B2B2B2', // L173 footer_cont 灰
  btnBlue: '#459DF5', // style L132 .downtxt a
  btnMore: '#88C6E5', // style L188 .book_more
  pager: '#00A86E', // style L153 .page active
  cur: '#CC3300', // style L143 .reader h1 红 / L196 :visited red 基因
} as const

/** [R26-5-3b] 章节行键盘可达属性(章节页跳转, 与 bookNavProps 同构) */
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

/** [R26-5-3c] #list 目录分页(.page 实测样式, 静态样式走 index.ts css 串的 .dy-pg, 激活态此处内联) */
const BTN: React.CSSProperties = {
  margin: '4px 10px 4px 0',
  padding: '4px 12px',
  background: '#fff',
  color: '#666',
  border: '1px solid #BBB',
  fontSize: 12,
  lineHeight: '16px',
}

function TocPager({ current, total, go }: { current: number; total: number; go: (p: number) => void }) {
  if (total <= 1) return null
  const win = 7
  let start = Math.max(1, current - 3)
  const end = Math.min(total, start + win - 1)
  start = Math.max(1, end - win + 1)
  const btn = 'dy-pg'
  return (
    <nav className="dy-pager flex flex-wrap items-center justify-center" style={{ margin: '12px 0 4px' }} aria-label="目录分页导航">
      {current > 1 && (
        <button type="button" className={btn} onClick={() => go(current - 1)} aria-label="上一页目录">
          上一页
        </button>
      )}
      {Array.from({ length: end - start + 1 }, (_, i) => start + i).map((p) =>
        p === current ? (
          <span key={p} style={{ ...BTN, background: C.pager, color: '#fff', borderColor: C.pager, cursor: 'default' }} aria-current="page">
            {p}
          </span>
        ) : (
          <button key={p} type="button" className={btn} onClick={() => go(p)} aria-label={`目录第 ${p} 页`}>
            {p}
          </button>
        ),
      )}
      {current < total && (
        <button type="button" className={btn} onClick={() => go(current + 1)} aria-label="下一页目录">
          下一页
        </button>
      )}
    </nav>
  )
}

export function DdyueshuBook({ data, loading, error, tocPage, currentChapterId }: SiteBookProps) {
  const { site, navigate } = usePublic()

  if (error) {
    return (
      <div className="dy-page dy-book" style={{ background: C.bg, padding: '0 8px 24px' }}>
        <ErrorState message="书籍不存在" detail={error} />
      </div>
    )
  }

  const book = data?.book
  const chapters: TocChapter[] = data?.chapters || []
  const totalPages = data?.tocTotalPages || 1
  const tags = data?.tags || []
  const firstChapterId = chapters[0]?.id

  // [R26-5-3d] 简介按行拆段(真站 #intro p{text-indent:2em;margin-top:10px})
  const introParas = (book?.intro || '').split(/\n+/).map((s) => s.trim()).filter(Boolean)

  const goTocPage = (p: number) => navigate({ view: 'book', bookId: book?.id, page: p })

  const boxCon: React.CSSProperties = { border: `2px solid ${C.boxBorder}`, overflow: 'hidden' }

  return (
    <div className="dy-page dy-book" style={{ background: C.bg, color: C.text, fontFamily: '宋体,SimSun,serif', fontSize: 12, padding: '0 8px 24px' }}>
      <div className="mx-auto w-full max-w-[976px] space-y-2">
        {/* ============ .box_con #1: 面包屑 + 信息区(biquge L132-149) ============ */}
        <div style={{ ...boxCon, background: '#fff' }}>
          {/* .con_top: 40px bg #E1ECED 底线 #88C6E5 */}
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
              {book?.categoryId ? (
                <a
                  className="dy-crumb"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 })} // [R27-6-fix] 闭包内属性收窄丢失, 显式归一 null→undefined
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 }) // [R27-6-fix] 闭包内属性收窄丢失, 显式归一 null→undefined
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`浏览 ${book.category} 分类`}
                >
                  {book.category}
                </a>
              ) : (
                <span>{book?.category || '小说'}</span>
              )}
              <span style={{ padding: '0 6px' }}>&gt;</span>
              <span>{book ? `${book.name}最新章节` : '书籍详情'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 min-[768px]:grid-cols-[150px_minmax(0,1fr)]">
            {/* #sidebar > #fmimg(bg #E1ECED 12px 内距) + .downtxt 按钮列(style.css L132 实测) */}
            <div style={{ margin: 12 }}>
              <div style={{ background: C.teal, padding: 12 }}>
                {loading ? (
                  <Sk className="h-[150px] w-[120px]" style={{ borderRadius: 0 }} />
                ) : (
                  <BookCover name={book?.name || ''} cover={book?.cover} style={{ width: 120, height: 150, borderRadius: 0, border: `1px solid ${C.border}` }} />
                )}
              </div>
              {!loading && book && (
                <div style={{ margin: '0 12px' }}>
                  <button
                    type="button"
                    className="dy-btn dy-btn-read"
                    onClick={() => firstChapterId && navigate({ view: 'read', chapterId: firstChapterId })}
                    disabled={!firstChapterId}
                    aria-label={`开始阅读《${book.name}》第一章`}
                  >
                    开始阅读
                  </button>
                  <button
                    type="button"
                    className="dy-btn dy-btn-more"
                    onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}
                    aria-label={`查看《${book.name}》完整目录`}
                  >
                    查看完整目录
                  </button>
                  {/* 站内唯一允许的 <a href>: TXT 下载 */}
                  <a
                    href={`/api/public/download?book=${book.id}`}
                    className="dy-btn dy-btn-dl"
                    aria-label={`下载《${book.name}》TXT 全本`}
                  >
                    TXT下载
                  </a>
                </div>
              )}
            </div>

            {/* #maininfo > #info + #intro (biquge L145-149) */}
            <div className="min-w-0" style={{ padding: 10 }}>
              <div style={{ margin: 10 }}>
                <h1 style={{ margin: 0, padding: '1px 0', fontFamily: '黑体,SimHei,"Microsoft YaHei",sans-serif', fontSize: 28, fontWeight: 700, color: '#333', overflow: 'hidden' }}>
                  {loading ? <Sk className="h-8 w-48" style={{ borderRadius: 0 }} /> : book?.name}
                </h1>
                {!loading && book && (
                  <div className="flex flex-wrap" style={{ fontSize: 15, color: '#333' }}>
                    {(
                      [
                        ['作 者', book.author],
                        ['分 类', book.category],
                        ['状 态', statusLabel(book.status)],
                        ['字 数', formatWords(book.wordCount)],
                        ['最 新', book.latestChapter],
                        ['更新于', fmtDate(book.updatedAt)],
                      ] as const
                    ).map(([k, v]) => (
                      <p key={k} style={{ width: 350, maxWidth: '100%', height: 25, lineHeight: '25px', paddingTop: 2, margin: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {k}：{v}
                      </p>
                    ))}
                  </div>
                )}
                {loading && (
                  <div className="flex flex-wrap gap-y-1 pt-2">
                    {[0, 1, 2, 3].map((i) => <Sk key={i} className="h-5 w-[350px] max-w-full" style={{ borderRadius: 0 }} />)}
                  </div>
                )}
              </div>
              {/* #intro: 上虚线 13px p 缩进 2em */}
              <div style={{ width: '96%', overflow: 'hidden', lineHeight: 1.5, borderTop: `1px dashed ${C.boxBorder}`, padding: 10, fontSize: 13 }}>
                {loading
                  ? [0, 1, 2].map((i) => <Sk key={i} className="mb-2 h-4 w-full" style={{ borderRadius: 0 }} />)
                  : introParas.length
                    ? introParas.map((p, i) => (
                      <p key={i} style={{ margin: i === 0 ? 0 : '10px 0 0', textIndent: '2em' }}>{p}</p>
                    ))
                    : <p style={{ margin: 0, textIndent: '2em' }}>暂无简介</p>}
              </div>
              {/* #listtj: 关键词推荐(真站 /kw/ 链接形态) */}
              {!loading && tags.length > 0 && (
                <div style={{ padding: 5, lineHeight: '22px', fontSize: 13 }}>
                  《{book?.name}》推荐阅读：
                  {tags.map((t) => (
                    <a
                      key={t.tag}
                      className="dy-tag"
                      style={{ marginRight: 9, cursor: 'pointer' }}
                      onClick={() => navigate({ view: 'keyword', tag: t.tag })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          navigate({ view: 'keyword', tag: t.tag })
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`浏览关键词 ${t.tag}`}
                    >
                      {t.tag}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ============ .box_con #2: #list 目录预览(biquge L151-155) ============ */}
        <div style={{ ...boxCon, background: '#fff' }}>
          <div style={{ padding: 2 }}>
            {/* dt 组头条: bg #C3DFEA 居中 lh 28 pad 5×10 */}
            <div style={{ background: C.volBar, fontSize: 14, lineHeight: '28px', textAlign: 'center', margin: '0 auto 5px', padding: '5px 10px', overflow: 'hidden' }}>
              {loading ? <Sk className="mx-auto h-5 w-64" style={{ borderRadius: 0 }} /> : <>《{book?.name}》正文（共 {data?.tocTotal ?? 0} 章）</>}
            </div>
            {/* dd 33% 宽三列(biquge L154): grid 实现, <768px 单列防横滚 */}
            <dl className="grid grid-cols-1 min-[768px]:grid-cols-3" style={{ margin: 2, overflow: 'hidden' }}>
              {loading
                ? Array.from({ length: 12 }, (_, i) => (
                  <div key={i} className="px-2.5" style={{ marginBottom: 5 }}>
                    <Sk className="h-6 w-full" style={{ borderRadius: 0 }} />
                  </div>
                ))
                : chapters.map((ch) => (
                  <dd
                    key={ch.id}
                    className={ch.id === currentChapterId ? 'dy-cur' : 'dy-dd'}
                    style={{
                      display: 'block',
                      minWidth: 0,
                      boxSizing: 'border-box',
                      height: 25,
                      lineHeight: '25px',
                      margin: 0,
                      padding: 0,
                      marginBottom: 5,
                      textIndent: 10,
                      borderBottom: '1px dashed #CCC',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                    }}
                  >
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
            {!loading && chapters.length === 0 && <p style={{ padding: '12px', color: C.dim, textAlign: 'center' }}>暂无章节</p>}
            {!loading && chapters.length > 0 && (
              <TocPager current={tocPage} total={totalPages} go={goTocPage} />
            )}
          </div>
          {/* .book_more 全宽「查看完整目录」条(style.css L188 实测) */}
          {!loading && book && (
            <div className="dy-more" style={{ width: '90%', margin: '10px auto', lineHeight: '42px', background: C.btnMore, borderRadius: 6, textAlign: 'center' }}>
              <a
                style={{ color: '#EEE', fontSize: 16, cursor: 'pointer', textDecoration: 'none', display: 'block' }}
                onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate({ view: 'toc', bookId: book.id, page: 1 })
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`查看《${book.name}》完整章节目录`}
              >
                查看完整目录
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
