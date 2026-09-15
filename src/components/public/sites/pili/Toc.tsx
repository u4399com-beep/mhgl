// ============================================================
// [R26-2-40] 霹雳书屋 克隆目录页(独立视图) —— https://www.pilishuwu.com/{cat}/{id}/menu/{page}.html
// (wmcms 章节目录页; 样本 /tmp/r26/pili-menu.html 本轮 stealthy 桥直抓 +
//  wmcms.page.works.css 复用实测)
//
// 真站 DOM:
//   #special_bg(padding-top 20px) > .ui-wm(1200px, 白底 1px #e0dedc 边) > .works-chapter-wr
//     ul.words-xone-menu.works-chapter-menu(52px, 底线 1px #dbd9d6; li a 53px/53px
//       24px 微软雅黑 #555 padding 0 25px 右 1px #dbd9d6 边; li.active a 高 49px + 底 4px #ff9a6a 橙 tab):
//       li.active a「章节列表」(本页) + li.active a「返回《书名》」(→ info.html 书页)
//     .works-chapter-list-wr(width 1200px, height:auto 覆盖):
//       div.vloume「正文 / 第1卷 xxx」卷分隔(真站该类在 works.css 无样式规则 → 浏览器默认块级文本;
//         此处按默认形态复刻, 仅加最小间距, 不额外装饰)
//       ol.chapter-page-new.works-chapter-list(height:auto): li > p > span.works-chapter-item
//         (float 294px, pt 20px) × 4 列网格; a 14px #333 省略号(hover #fa8729, :visited #A75646)
//       div.chapter-end(height 40px 分隔)
//   分页: 真站章节 ≤ 500 时不渲染分页(样本页 190 章单页); 大书按 works.css
//   .chapter-page-pager 规格补画(.chapter-page-btn 68×30 #f1f1f1 #666, active/hover #ff9a6a 白字)。
//
// 数据: data.book + data.chapters(100/页) + tocTotal/tocTotalPages; 分卷用 groupTocVolumes
// (连续同名卷分组, 空卷归「正文」); currentChapterId 高亮橙字加粗。页头任务要求「书名/共 N 章/
// 去书页」: 真站 tab 行第二 tab 即「返回《书名》」, 共 N 章置于 tab 行右端(#999 小字)。
// ============================================================
'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import { groupTocVolumes } from '../template-kit'
import { ErrorState, Sk } from '../../bits'

const PILI_ORANGE_LIGHT = '#ff9a6a' // 橙 tab/分页 current
const PILI_TITLE = '#555555' // tab 文字
const PILI_TEXT = '#333333'
const PILI_HOVER = '#fa8729' // 章节链 hover(works-chapter-item a:hover); :visited #A75646 见 index.ts css

export function PiliToc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { navigate } = usePublic()
  const book = data?.book
  const chapters = data?.chapters || []
  const volumes = groupTocVolumes(chapters)
  const totalPages = data?.tocTotalPages || 1

  const goPage = (p: number) => book && navigate({ view: 'toc', bookId: book.id, page: p })

  /** 单个章节链接(works-chapter-item: 14px #333 省略号, hover #fa8729) */
  const chapterLink = (c: { id: string; title: string }, active: boolean) => (
    <button
      key={c.id}
      type="button"
      onClick={() => navigate({ view: 'read', chapterId: c.id })}
      aria-label={active ? `正在阅读:${c.title}` : `阅读 ${c.title}`}
      aria-current={active ? 'true' : undefined}
      className="pili-ch-link block max-w-full truncate text-left text-sm transition-colors hover:text-[#fa8729]"
      style={{ color: active ? PILI_HOVER : PILI_TEXT, fontWeight: active ? 700 : 400 }}
    >
      {c.title}
    </button>
  )

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-5 sm:px-6" aria-hidden>
        <div className="border bg-white p-6" style={{ borderColor: '#e0dedc' }}>
          <Sk className="h-[52px] w-2/3" />
          <Sk className="mt-6 h-4 w-20" />
          <div className="mt-4 grid grid-cols-2 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 24 }).map((_, i) => (
              <Sk key={i} className="h-4 w-[90%]" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !book) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-10 sm:px-6">
        <ErrorState message={error ? '章节目录加载失败' : '书籍不存在'} detail={error || undefined} />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-5 sm:px-6" style={{ color: PILI_TEXT }}>
      <div className="border bg-white px-4 py-1 sm:px-6" style={{ borderColor: '#e0dedc' }}>
        {/* tab 头(words-xone-menu: 章节列表 active 橙 tab + 返回《书名》 + 共 N 章) */}
        <div className="flex flex-wrap items-end justify-between border-b" style={{ borderColor: '#dbd9d6' }}>
          <ul className="flex flex-wrap" style={{ listStyle: 'none' }}>
            <li>
              <span
                className="inline-block border-b-4 px-[16px] pb-[5px] text-lg leading-[49px] sm:px-[25px] sm:text-2xl"
                style={{ color: PILI_TITLE, borderColor: PILI_ORANGE_LIGHT }}
                aria-current="page"
              >
                章节列表
              </span>
            </li>
            <li className="max-w-[60vw] sm:max-w-none">
              <button
                type="button"
                onClick={() => navigate({ view: 'book', bookId: book.id })}
                aria-label={`返回《${book.name}》书籍页`}
                className="inline-block max-w-full truncate border-b-4 border-transparent px-[16px] pb-[5px] text-lg leading-[49px] transition-colors hover:text-[#fa8729] sm:px-[25px] sm:text-2xl"
                style={{ color: PILI_TITLE }}
              >
                返回《{book.name}》
              </button>
            </li>
          </ul>
          <p className="pb-2 pr-1 text-sm" style={{ color: '#999999' }}>
            共 <em className="mx-0.5 font-bold not-italic" style={{ color: PILI_TEXT }}>{data?.tocTotal ?? chapters.length}</em> 章
            {totalPages > 1 ? <span> · 第 {page}/{totalPages} 页</span> : null}
          </p>
        </div>

        {/* 章节列表(works-chapter-list-wr): 分卷(vloume + ol 四列)或平铺 */}
        <div className="py-2">
          {chapters.length ? (
            volumes ? (
              volumes.map((g, gi) => (
                <div key={`${g.volume}-${gi}`}>
                  {/* 卷名(真站 .vloume 无样式规则 → 默认块级文本形态) */}
                  <div className="pt-5 text-base" style={{ color: PILI_TEXT }}>
                    {g.volume || '正文'}
                  </div>
                  <ol className="mt-1 grid grid-cols-1 gap-y-3 pb-4 sm:grid-cols-2 lg:grid-cols-4" style={{ listStyle: 'none' }}>
                    {g.chapters.map((c) => (
                      <li key={c.id} className="min-w-0 pr-4 pt-1">
                        {chapterLink(c, !!currentChapterId && c.id === currentChapterId)}
                      </li>
                    ))}
                  </ol>
                  {/* 卷间分隔(chapter-end 40px) */}
                  {gi < volumes.length - 1 ? <div style={{ height: 20 }} aria-hidden /> : null}
                </div>
              ))
            ) : (
              <ol className="grid grid-cols-1 gap-y-3 py-4 sm:grid-cols-2 lg:grid-cols-4" style={{ listStyle: 'none' }}>
                {chapters.map((c) => (
                  <li key={c.id} className="min-w-0 pr-4 pt-1">
                    {chapterLink(c, !!currentChapterId && c.id === currentChapterId)}
                  </li>
                ))}
              </ol>
            )
          ) : (
            <p className="py-16 text-center text-sm" style={{ color: '#999999' }}>暂无章节</p>
          )}
        </div>

        {/* 分页(chapter-page-pager: 68×30 #f1f1f1, active #ff9a6a; 真站单页不渲染) */}
        {totalPages > 1 ? (
          <nav className="flex flex-wrap items-center justify-center gap-1 pb-6 pt-2" aria-label="目录翻页">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
              className="inline-flex h-[30px] items-center justify-center gap-0.5 border-none px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: '#f1f1f1', color: '#666666' }}
              aria-label="上一页目录"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              上一页
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
              let p = i + 1
              if (totalPages > 7 && page > 4) p = Math.min(totalPages - 6 + i, totalPages)
              const active = p === page
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => goPage(p)}
                  aria-label={`第 ${p} 页目录`}
                  aria-current={active ? 'page' : undefined}
                  className="inline-flex h-[30px] w-[34px] items-center justify-center border-none text-sm transition-colors"
                  style={active ? { background: PILI_ORANGE_LIGHT, color: '#ffffff' } : { background: '#f1f1f1', color: '#666666' }}
                >
                  {p}
                </button>
              )
            })}
            {totalPages > 7 ? <span className="px-1 text-sm" style={{ color: '#666666' }}>…共 {totalPages} 页</span> : null}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
              className="inline-flex h-[30px] items-center justify-center gap-0.5 border-none px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: '#f1f1f1', color: '#666666' }}
              aria-label="下一页目录"
            >
              下一页
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  )
}
