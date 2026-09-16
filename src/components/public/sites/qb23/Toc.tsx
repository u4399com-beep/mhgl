// ============================================================
// [R28-2c] qb23 铅笔小说(www.23qb.net) 目录页克隆 —— 基础五视图之 Toc(独立视图)
// 真站快照(R28 实测): /tmp/r28-2c/qb23/qb23-toc.html(/book/5094/catalog 直抓, 732KB 全量目录页)
// 真站 DOM: main#main > .content
//   ├ .heading(裸排于 #f8f9f9 底): h1.page-title(38px/700, 链接书籍页) + span.novel-tag-icon「作者：x」
//   │   + time.itemtitle「更新时间：x」
//   └ .module > .box(白卡)
//       ├ span#shuqian > h2.module-title.type「阅读进度」(真站书签位; 克隆以 currentChapterId 呈现, 无则省略)
//       ├ 每卷 h2.module-title.type「正文卷」(.box .type: margin 30px 0 20px, 首个 margin-top 0)
//       └ .module-row-info×N 章节行(可点): padding 10px 15px / radius 10px / 底 #f7f8f9(min-768 全行,
//           ≤767 斑马 even)/ .icon-video-file 18px #34a853 / 行文字 14px rgba(0,0,0,.83)
// 真站目录单页罗列全部章节无分页(732KB); 克隆数据层 100 章/页 → 复用真站 #page 分页形态(红底当前页)。
// 真站行无当前章高亮, 增补 #fef0e5/#ff2a14 selected chip 语言(任务要求)。
// 真站行 .module-row-shortcuts「阅读/下载」悬浮钮未复刻(数据层无对应端点, TXT 走书页)。
// ============================================================
'use client'

import { FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import { groupTocVolumes } from '../template-kit'
import { pageWindowOf } from './Category' // [R28-5-1] 同站逐字重复(Toc 私有副本与 Category 导出同实现) → 改为单处定义
import type { TocChapter } from '../../types'
import { ErrorState, Sk } from '../../bits'
import { fmtDate, formatWords } from '../../seo'

/** [R28-2c-16] 真站实测色值(style.css) */
const QB_TEXT = '#282828'
const QB_MUT40 = 'rgba(0,0,0,0.4)'
const QB_MUT62 = 'rgba(0,0,0,0.62)'
const QB_TXT83 = 'rgba(0,0,0,0.83)'
const QB_TITLE = 'rgba(7,7,10,0.92)'
const QB_RED = '#ff2a14'
const QB_GREEN = '#34a853'
const QB_APRICOT = '#fef0e5'

/** [R28-2c-17] .module-row-info 章节行(min-768 三列; 行底/斑马/高亮由 index.css 统一驱动) */
function TocRow({ ch, current, onClick }: { ch: TocChapter; current?: boolean; onClick: () => void }) {
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
      style={{ color: QB_TEXT }}
    >
      {children}
    </button>
  )
}

export function Qb23Toc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { navigate } = usePublic()

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6" aria-busy>
        <div className="space-y-3 py-2">
          <Sk className="h-9 w-1/3" style={{ borderRadius: 8 }} />
          <Sk className="h-4 w-1/4" style={{ borderRadius: 4 }} />
        </div>
        <div className="rounded-[18px] bg-white p-4 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-[25px]">
          <div className="grid grid-cols-1 gap-[5px] md:grid-cols-3">
            {Array.from({ length: 24 }).map((_, i) => (
              <Sk key={i} className="h-10" style={{ borderRadius: 10 }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        <div className="rounded-[18px] bg-white p-6 shadow-[0_7px_21px_rgba(149,157,165,0.22)]">
          <ErrorState message="目录加载失败" detail={error} />
        </div>
      </div>
    )
  }

  const { book, chapters, tocTotal, tocTotalPages } = data
  const volumeGroups = groupTocVolumes(chapters)
  const current = chapters.find((c) => c.id === currentChapterId)
  const pageWindow = pageWindowOf(page, tocTotalPages)

  return (
    <div className="w-full pb-14" style={{ color: QB_TEXT }}>
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        {/* ============ .heading 页头(裸排) ============ */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pb-4 pt-1">
          <h1 className="text-2xl font-bold sm:text-[30px] md:text-[38px]" style={{ color: QB_TITLE }}>
            <button
              type="button"
              onClick={() => navigate({ view: 'book', bookId: book.id })}
              className="transition-colors hover:text-[#ff2a14]"
              aria-label={`查看《${book.name}》详情`}
            >
              {book.name}
            </button>
          </h1>
          <span className="text-sm" style={{ color: QB_TEXT }}>
            作者：{book.author}
          </span>
          {book.updatedAt && (
            <time className="text-sm" style={{ color: QB_MUT62 }}>
              更新时间：{fmtDate(book.updatedAt)}
            </time>
          )}
          <span className="text-sm" style={{ color: QB_MUT40 }}>
            共 {tocTotal} 章
          </span>
        </div>

        {/* ============ .module > .box 章节列表 ============ */}
        <div className="rounded-[18px] bg-white p-4 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-[25px]">
          {/* 阅读进度(真站 #shuqian 书签位): 有当前章时呈现 */}
          {current && (
            <div className="mb-5 flex flex-wrap items-center gap-2 rounded-[10px] px-4 py-2.5" style={{ background: QB_APRICOT }}>
              <h2 className="text-base font-bold" style={{ color: QB_RED }}>
                阅读进度
              </h2>
              <span className="truncate text-sm" style={{ color: QB_TXT83 }}>
                {current.title}
              </span>
              <button
                type="button"
                onClick={() => navigate({ view: 'read', chapterId: current.id })}
                className="ml-auto shrink-0 text-sm font-bold transition-opacity hover:opacity-75"
                style={{ color: QB_RED }}
                aria-label={`继续阅读 ${current.title}`}
              >
                继续阅读
              </button>
            </div>
          )}

          {chapters.length ? (
            volumeGroups ? (
              volumeGroups.map((g, gi) => (
                <div key={`${g.volume}-${gi}`}>
                  {/* h2.module-title.type 分卷标(.box .type: 30px 0 20px) */}
                  <h2 className="mb-5 mt-7 text-lg font-semibold first:mt-0 sm:text-2xl" style={{ color: QB_TEXT }}>
                    {g.volume || '正文'}
                  </h2>
                  <div className="qb23-rows grid grid-cols-1 gap-[5px] md:grid-cols-3">
                    {g.chapters.map((ch) => (
                      <TocRow
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
                  <TocRow
                    key={ch.id}
                    ch={ch}
                    current={currentChapterId === ch.id}
                    onClick={() => navigate({ view: 'read', chapterId: ch.id })}
                  />
                ))}
              </div>
            )
          ) : (
            <p className="py-16 text-center text-sm" style={{ color: QB_MUT40 }}>
              暂无章节
            </p>
          )}

          {/* ============ #page 分页(真站目录无分页, 数据层 100 章/页 → 复用真站分页形态) ============ */}
          {tocTotalPages > 1 && (
            <nav className="pt-6 text-center" aria-label="目录分页">
              <span className="mr-2 text-sm" style={{ color: QB_MUT40 }}>
                第{page}/{tocTotalPages}页
              </span>
              <QbPageBtn disabled={page <= 1} onClick={() => navigate({ view: 'toc', bookId: book.id, page: page - 1 })} ariaLabel="上一页">
                上一页
              </QbPageBtn>
              {pageWindow.map((p) =>
                p === page ? (
                  <strong
                    key={p}
                    className="mx-0.5 inline-block min-w-[40px] rounded-[50px] bg-[#ff2a14] px-3 leading-10 text-sm font-bold text-white"
                    aria-current="page"
                  >
                    {p}
                  </strong>
                ) : (
                  <QbPageBtn key={p} onClick={() => navigate({ view: 'toc', bookId: book.id, page: p })} ariaLabel={`第 ${p} 页`}>
                    {p}
                  </QbPageBtn>
                ),
              )}
              <QbPageBtn
                disabled={page >= tocTotalPages}
                onClick={() => navigate({ view: 'toc', bookId: book.id, page: page + 1 })}
                ariaLabel="下一页"
              >
                下一页
              </QbPageBtn>
            </nav>
          )}
        </div>
      </div>
    </div>
  )
}
