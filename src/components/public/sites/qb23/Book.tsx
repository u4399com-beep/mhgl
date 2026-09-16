// ============================================================
// [R26-4] qb23 铅笔小说(www.23qb.net) 书籍详情页克隆 —— 5 页型之 Book
// 真站快照: /tmp/r26/qb23-book.html(/book/100/ 大官人 直抓)
// 真站 DOM: main#main > .content
//   ├ .box.view-heading(白卡 radius 18px + 大投影; 渐变玻璃底)
//   │   ├ .novel-cover(桌面 float right 宽 200px radius 10px; ≤559px 居中 46vw 白描边投影)
//   │   └ .novel-info
//   │       ├ .novel-info-header > h1.page-title(38px/700, color rgba(7,7,10,.92), text-shadow 1px 1px 0 #a9a9a9)
//   │       │   └ .novel-info-aux > .tag-link chips(padding 0 10px / line-height 28px / 14px / radius 10px;
//   │       │       底 #eaedf1, 首片(作者) #fef0e5 hover #fde6dd, hover #e3e6eb; 标签间 .slash 分隔 #d7dae1)
//   │       ├ .novel-info-main > .novel-info-content(简介, padding 20px 0, min-height 200px)
//   │       └ .novel-info-footer > 按钮组 —— 真站: 收藏 .btn-collect(红渐变 to right #fc000c→#f9444d,
//   │           radius 50px padding 0 30px 16px 白字)/推荐 .btn-aux-o(绿字 #34a853 底 #ecf9f0 描边 50px);
//   │           克隆映射: 开始阅读=btn-collect 红渐变 / 查看完整目录=.btn-aux 绿渐变(90deg #7ec53d→#34a853) /
//   │           TXT下载=.btn-aux-o 绿描边(唯一允许 <a>)
//   ├ .box > .module > .module-heading.newchapter(h2.module-title 26px/600 + time.itemtitle 更新时间)
//   │   └ .module-row-info×N(最新章节; padding 10px 15px / radius 10px / min-768 三列 33% inline-block /
//   │       底 #f7f8f9; .icon-video-file 18px #34a853; 行文字 14px rgba(0,0,0,.83))
//   │   └ a.catalog-more「完整目录」(2.75rem 行高居中, #34a853)
//   ├ (克隆增补, 任务要求) .box 章节列表预览: 目录页同款 module-row 三列 + 分卷 h2.module-title.type +
//   │   #page 分页(navigate book page); currentChapterId 行按真站 selected chip 语言高亮(#fef0e5/#ff2a14)
//   └ .box 相关作品(真站 module-items 网格; 克隆以同分类书单替代协同过滤, 空则整框不渲染)
// 数据降级: ①真站「最新章节」为全站最新 10 条(含外篇), 克隆取当前 tocPage 尾部倒序(单页书完全一致,
//   多页书第 1 页尾部≈最早章节, 已注释) ②真站章节行无当前章高亮, 增补高亮为任务要求。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { BookOpen, Download, FileText, ListOrdered } from 'lucide-react'
import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import { groupTocVolumes } from '../template-kit'
import type { BookItem, TocChapter } from '../../types'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk, bookNavProps } from '../../bits'
import { fmtDate, formatWords, statusLabel } from '../../seo'

/** [R26-4-10] 真站实测色值(style.css) */
const QB_TEXT = '#282828'
const QB_MUT40 = 'rgba(0,0,0,0.4)'
const QB_MUT62 = 'rgba(0,0,0,0.62)'
const QB_TXT68 = 'rgba(0,0,0,0.68)'
const QB_TXT83 = 'rgba(0,0,0,0.83)'
const QB_TITLE = 'rgba(7,7,10,0.92)' // .page-title color
const QB_RED = '#ff2a14'
const QB_GREEN = '#34a853'
const QB_LINE = '#eaedf1' // .tag-link 默认底
const QB_RED_GRAD = 'linear-gradient(to right, #fc000c 0, #f9444d 100%)' // .btn-collect
const QB_GREEN_GRAD = 'linear-gradient(90deg, #7ec53d, #34a853)' // .btn-aux

/** [R26-4-11] .tag-link 信息 chip(author 首片暖杏 / 其余 #eaedf1 / hover 对齐真站) */
function InfoChip({
  children,
  first,
  onClick,
  title,
}: {
  children: ReactNode
  first?: boolean
  onClick?: () => void
  title?: string
}) {
  // 色彩走 class(真站: 底 #eaedf1 首片 #fef0e5 hover #fde6dd/#e3e6eb), inline style 会压死 hover
  const bgCls = first ? 'bg-[#fef0e5] hover:bg-[#fde6dd]' : 'bg-[#eaedf1] hover:bg-[#e3e6eb]'
  const cls = `inline-flex shrink-0 items-center whitespace-nowrap rounded-[10px] px-2.5 text-sm leading-7 transition-colors ${bgCls}`
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} style={{ color: QB_TXT68 }} title={title} aria-label={title}>
        {children}
      </button>
    )
  }
  return (
    <span className={cls} style={{ color: QB_TXT68 }}>
      {children}
    </span>
  )
}

/** [R26-4-12] .module-row-info 章节行(绿文件 icon + 标题; 行底/斑马/高亮由 index.css 按 aria-current 统一驱动) */
function ChapterRow({ ch, current, onClick }: { ch: TocChapter; current?: boolean; onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      aria-label={`阅读 ${ch.title}`}
      aria-current={current ? 'true' : undefined}
      className="qb23-row flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[10px] px-4 py-2.5 transition-colors"
      style={{ color: current ? QB_RED : QB_TXT83 }}
    >
      <FileText className="h-4 w-4 shrink-0" style={{ color: QB_GREEN }} aria-hidden />
      <span className={`truncate text-sm ${current ? 'font-bold' : ''}`}>{ch.title}</span>
      <span className="ml-auto hidden shrink-0 pl-2 text-xs sm:block" style={{ color: QB_MUT40 }} aria-hidden>
        {formatWords(ch.wordCount)}
      </span>
    </div>
  )
}

/** [R26-4-13] 相关作品卡(同首页分类页卡型, 无角标) */
function RelatedCard({ book }: { book: BookItem }) {
  const { navigate } = usePublic()
  return (
    <div>
      <div
        {...bookNavProps(navigate, book.id)}
        aria-label={`查看《${book.name}》详情`}
        className="qb23-cover relative w-full cursor-pointer overflow-hidden rounded-[5px] pt-[140%]"
      >
        <div className="absolute inset-0">
          <BookCover name={book.name} cover={book.cover} showAuthor={book.author} style={{ borderRadius: 0 }} />
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigate({ view: 'book', bookId: book.id })}
        className="block w-full truncate text-center text-sm font-bold text-[#282828] transition-colors hover:text-[#ff2a14]"
        aria-label={`查看《${book.name}》详情`}
      >
        {book.name}
      </button>
      <p className="mt-[3px] truncate text-center text-[13px]" style={{ color: QB_MUT40 }}>
        {book.author}
      </p>
    </div>
  )
}

/** [R26-4-14] #page 页码钮(分类页同款, 独立声明避免跨文件依赖) */
function QbPageBtn({
  children,
  onClick,
  disabled,
  ariaLabel,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="mx-0.5 inline-block min-w-[40px] rounded-[50px] bg-[#f3f5f7] px-3 text-sm leading-10 transition-colors hover:bg-[#eaedf1] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#f3f5f7]"
      style={{ color: QB_TXT68 }}
    >
      {children}
    </button>
  )
}

function pageWindowOf(page: number, totalPages: number): number[] {
  const out = new Set<number>([1, totalPages])
  for (let p = Math.max(1, page - 3); p <= Math.min(totalPages, page + 3); p++) out.add(p)
  return [...out].sort((a, b) => a - b)
}

export function Qb23Book({ data, loading, error, tocPage, currentChapterId }: SiteBookProps) {
  const { site, navigate } = usePublic()

  // [R26-4-15] 相关作品: 同分类字数前 6(真站相关作品框降级, 失败/空整框不渲染)
  const [related, setRelated] = useState<BookItem[]>([])
  const catId = data?.book.categoryId || ''
  useEffect(() => {
    if (!catId) return
    let alive = true
    fetchBooks({ site: site.id, cat: catId, sort: 'words', page: 1, size: 6 })
      .then((d) => {
        if (alive) setRelated((d.books || []).filter((b) => b.id !== data?.book.id).slice(0, 6))
      })
      .catch(() => {
        if (alive) setRelated([])
      })
    return () => {
      alive = false
    }
  }, [site.id, catId, data?.book.id])

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        <div className="rounded-[18px] bg-white p-6 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-[25px]" aria-busy>
          <div className="flex flex-col gap-5 md:flex-row-reverse">
            <Sk className="h-[240px] w-[170px] shrink-0 rounded-[10px]" />
            <div className="flex-1 space-y-3">
              <Sk className="h-9 w-2/3" style={{ borderRadius: 8 }} />
              <div className="flex gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Sk key={i} className="h-7 w-20" style={{ borderRadius: 10 }} />
                ))}
              </div>
              <Sk className="h-4 w-full" />
              <Sk className="h-4 w-11/12" />
              <Sk className="h-4 w-3/5" />
              <div className="flex gap-3 pt-3">
                <Sk className="h-10 w-32 rounded-full" />
                <Sk className="h-10 w-32 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        <div className="rounded-[18px] bg-white p-6 shadow-[0_7px_21px_rgba(149,157,165,0.22)]">
          <ErrorState message="书籍详情加载失败" detail={error} />
        </div>
      </div>
    )
  }

  const { book, chapters, tocTotal, tocTotalPages, tags } = data
  const tagList = (tags || []).slice(0, 4)
  // 真站「最新章节」为倒序最新 10 条; 克隆取当前 tocPage 尾部倒序(单页书即真最新, 见文件头降级①)
  const latestRows = [...chapters].slice(-10).reverse()
  const volumeGroups = groupTocVolumes(chapters)
  const pageWindow = pageWindowOf(tocPage, tocTotalPages)

  return (
    <div className="w-full pb-14" style={{ color: QB_TEXT }}>
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        {/* ============ .box.view-heading: 封面 + 信息 + 按钮组 ============ */}
        <div
          className="rounded-[18px] bg-white p-4 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-[25px]"
          style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, #fff 80%, #fff 100%)' }}
        >
          <div className="flex flex-col items-center gap-6 md:flex-row-reverse md:items-start md:gap-0">
            {/* .novel-cover: 桌面右浮 200px / 移动居中 46vw 白描边(真站 ≤559 规格缩放) */}
            <div className="w-40 shrink-0 md:ml-[25px] md:w-[200px] max-md:w-[min(46vw,176px)]">
              <div
                className="w-full pt-[140%]"
                style={{
                  borderRadius: 10,
                  border: '2px solid rgba(255,255,255,0.9)',
                  boxShadow: '0 25px 50px -25px rgba(0,0,0,0.5)',
                }}
              >
                <BookCover name={book.name} cover={book.cover} showAuthor={book.author} style={{ borderRadius: 8 }} />
              </div>
            </div>

            {/* .novel-info */}
            <div className="min-w-0 flex-1 text-center md:text-left">
              <h1
                className="text-2xl font-bold leading-tight sm:text-[30px] md:text-[38px] md:leading-[1.3]"
                style={{ color: QB_TITLE, textShadow: '1px 1px 0 #a9a9a9' }}
              >
                {book.name}
              </h1>
              {/* .novel-info-aux chips: 作者(暖杏首片)/分类/标签(slash 分隔)/字数/状态 */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 md:justify-start">
                <InfoChip first>作者：{book.author}</InfoChip>
                {book.category && (
                  <InfoChip
                    onClick={book.categoryId ? () => navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 }) : undefined}
                    title="浏览该分类"
                  >
                    {book.category}
                  </InfoChip>
                )}
                {tagList.length > 0 && (
                  <span className="inline-flex shrink-0 items-center rounded-[10px] px-2.5 text-sm leading-7" style={{ background: QB_LINE }}>
                    {tagList.map((t, i) => (
                      <span key={`${t.tag}-${i}`} className="inline-flex items-center">
                        {i > 0 && (
                          <span aria-hidden className="px-[7px]" style={{ color: '#d7dae1' }}>
                            /
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => navigate({ view: 'keyword', tag: t.tag })}
                          className="text-[rgba(0,0,0,0.68)] transition-colors hover:text-[#ff2a14]"
                          aria-label={`浏览标签 ${t.tag}`}
                        >
                          {t.tag}
                        </button>
                      </span>
                    ))}
                  </span>
                )}
                <InfoChip>{formatWords(book.wordCount)}</InfoChip>
                <InfoChip>{statusLabel(book.status)}</InfoChip>
              </div>

              {/* .novel-info-main > .novel-info-content 简介 */}
              <p
                className="mx-auto mt-5 whitespace-pre-line text-sm leading-relaxed md:mx-0 md:min-h-[120px]"
                style={{ color: QB_TXT68 }}
              >
                {book.intro || '暂无简介'}
              </p>

              {/* .novel-info-footer 按钮组: 红渐变主钮/绿渐变/绿描边(真站 btn-collect · btn-aux · btn-aux-o) */}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 md:justify-start">
                <button
                  type="button"
                  onClick={() => navigate({ view: 'read', chapterId: chapters[0]?.id })}
                  disabled={!chapters.length}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full px-[30px] text-base text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                  style={{ background: QB_RED_GRAD }}
                  aria-label={`开始阅读《${book.name}》`}
                >
                  <BookOpen className="h-4 w-4" aria-hidden />
                  开始阅读
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full px-[30px] text-base text-white transition-opacity hover:opacity-85"
                  style={{ background: QB_GREEN_GRAD }}
                  aria-label={`查看《${book.name}》完整目录`}
                >
                  <ListOrdered className="h-4 w-4" aria-hidden />
                  查看完整目录
                </button>
                {/* 唯一允许的 <a>: TXT 下载 */}
                <a
                  href={`/api/public/download?book=${book.id}`}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full px-[30px] text-base transition-opacity hover:opacity-85"
                  style={{ background: '#ecf9f0', color: QB_GREEN, border: `1px solid ${QB_GREEN}` }}
                  aria-label={`下载《${book.name}》TXT`}
                >
                  <Download className="h-4 w-4" aria-hidden />
                  TXT下载
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ============ 最新章节(.module-heading.newchapter + module-row-info) ============ */}
        <div className="mt-3 rounded-[18px] bg-white p-4 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-[25px]">
          <div className="mb-4 flex flex-wrap items-baseline">
            <h2 className="text-xl font-semibold sm:text-[26px]">最新章节</h2>
            {book.updatedAt && (
              <time className="pl-5 text-sm" style={{ color: QB_MUT62 }}>
                更新时间：{fmtDate(book.updatedAt)}
              </time>
            )}
          </div>
          {latestRows.length ? (
            <>
              <div className="qb23-rows grid grid-cols-1 gap-[5px] md:grid-cols-3">
                {latestRows.map((ch) => (
                  <ChapterRow
                    key={ch.id}
                    ch={ch}
                    current={currentChapterId === ch.id}
                    onClick={() => navigate({ view: 'read', chapterId: ch.id })}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}
                className="mt-3 block w-full text-center text-xl leading-[2.75rem] transition-opacity hover:opacity-80"
                style={{ color: QB_GREEN }}
                aria-label="查看完整目录"
              >
                完整目录
              </button>
            </>
          ) : (
            <p className="py-6 text-center text-sm" style={{ color: QB_MUT40 }}>
              暂无章节
            </p>
          )}
        </div>

        {/* ============ 章节列表预览(真站独立目录页样式, 页内分页; 任务要求增补) ============ */}
        {chapters.length > 0 && (
          <div className="mt-3 rounded-[18px] bg-white p-4 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-[25px]">
            <div className="mb-1 flex flex-wrap items-baseline">
              <h2 className="text-xl font-semibold sm:text-[26px]">章节目录</h2>
              <time className="pl-5 text-sm" style={{ color: QB_MUT62 }}>
                共 {tocTotal} 章
              </time>
            </div>
            {volumeGroups ? (
              volumeGroups.map((g, gi) => (
                <div key={`${g.volume}-${gi}`}>
                  <h3 className="mb-3 mt-6 text-lg font-semibold" style={{ color: QB_TEXT }}>
                    {g.volume || '正文'}
                  </h3>
                  <div className="qb23-rows grid grid-cols-1 gap-[5px] md:grid-cols-3">
                    {g.chapters.map((ch) => (
                      <ChapterRow
                        key={ch.id}
                        ch={ch}
                        current={currentChapterId === ch.id}
                        onClick={() => navigate({ view: 'read', chapterId: ch.id })}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="qb23-rows grid grid-cols-1 gap-[5px] md:grid-cols-3">
                {chapters.map((ch) => (
                  <ChapterRow
                    key={ch.id}
                    ch={ch}
                    current={currentChapterId === ch.id}
                    onClick={() => navigate({ view: 'read', chapterId: ch.id })}
                  />
                ))}
              </div>
            )}
            {/* 页内目录翻页: book 视图 ?page= 与 BookView tocPage 同步 */}
            {tocTotalPages > 1 && (
              <nav className="pt-6 text-center" aria-label="目录分页">
                <span className="mr-2 text-sm" style={{ color: QB_MUT40 }}>
                  第{tocPage}/{tocTotalPages}页
                </span>
                <QbPageBtn
                  disabled={tocPage <= 1}
                  onClick={() => navigate({ view: 'book', bookId: book.id, page: tocPage - 1 })}
                  ariaLabel="上一页"
                >
                  上一页
                </QbPageBtn>
                {pageWindow.map((p) =>
                  p === tocPage ? (
                    <strong
                      key={p}
                      className="mx-0.5 inline-block min-w-[40px] rounded-[50px] bg-[#ff2a14] px-3 leading-10 text-sm font-bold text-white"
                      aria-current="page"
                    >
                      {p}
                    </strong>
                  ) : (
                    <QbPageBtn key={p} onClick={() => navigate({ view: 'book', bookId: book.id, page: p })} ariaLabel={`第 ${p} 页`}>
                      {p}
                    </QbPageBtn>
                  ),
                )}
                <QbPageBtn
                  disabled={tocPage >= tocTotalPages}
                  onClick={() => navigate({ view: 'book', bookId: book.id, page: tocPage + 1 })}
                  ariaLabel="下一页"
                >
                  下一页
                </QbPageBtn>
              </nav>
            )}
          </div>
        )}

        {/* ============ 相关作品(同分类书单替代真站协同过滤; 空/失败整框不渲染) ============ */}
        {related.length > 0 && (
          <div className="mt-3 rounded-[18px] bg-white p-4 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-[25px]">
            <h2 className="mb-4 text-xl font-semibold sm:text-[26px]">相关作品</h2>
            <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-6 sm:gap-x-5">
              {related.map((b) => (
                <RelatedCard key={b.id} book={b} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
