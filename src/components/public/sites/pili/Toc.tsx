// ============================================================
// [R28-2b-4] 霹雳书屋 克隆目录页 —— https://www.pilishuwu.com/{cat}/{id}/menu/{page}.html
//
// 真站快照: /tmp/r28-2b/pili/menu.html(2026-09-16 实抓 30K, 独立「章节列表」页)
// CSS 存档: /tmp/r28-2b/pili/wmcms.page.works.css + 页内 <style> 实测
//
// 真站 DOM:
//   .works-chapter-wr(overflow inherit) > ul.words-xone-menu.works-chapter-menu:
//     li.active「章节列表」+ li「返回《第一剑仙退休后》」(橙 tab 族, active 4px #ff9a6a)
//   .works-chapter-list-con > .works-chapter-list-wr(width 1200px height auto):
//     div.vloume「正文」(h 50px lh 50px 20px padding-left 25px, border-bottom 2px #ff9a6a)
//     ol.chapter-page-new.works-chapter-list(height auto):
//       li > p > span.works-chapter-item > a(列宽 294px, 14px #333, :visited #A75646,
//       :hover #fa8729, 溢出省略)
//   分卷卷名 = .vloume 条; 真站按序排列(第1章起)。
//
// 降级: ①真站目录单页全量, 契约 100 章/页 → 末端补 mod_page 分页(页码=当前目录页)
// ②「书籤」(isvip vip 标图标)无契约不渲染。
// ============================================================
'use client'

import { useMemo, useState } from 'react'
import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import { groupTocVolumes } from '../template-kit'
import { ErrorState, Sk } from '../../bits'

const TEXT = '#333333'
const ORANGE_LIGHT = '#ff9a6a'

export function PiliToc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { site, navigate } = usePublic()
  const book = data?.book
  const chapters = useMemo(() => data?.chapters || [], [data])
  const [desc, setDesc] = useState(false) // 倒序开关(真站为正序; JS 翻转功能保留)

  const volumes = useMemo(() => groupTocVolumes(chapters), [chapters])
  const shown = desc ? [...chapters].reverse() : chapters
  const totalPages = data?.tocTotalPages || 1

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <ErrorState message="目录加载失败" detail={error} />
      </div>
    )
  }

  return (
    <div className="min-h-[50vh] bg-white pb-10 text-[#333333]">
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
        {loading || !book ? (
          <div aria-hidden>
            <Sk className="h-10 w-64" />
            <Sk className="mt-4 h-[420px] w-full" />
          </div>
        ) : (
          <section className="mt-2" aria-label="章节目录">
            {/* works-chapter-menu 橙 tab 组 */}
            <ul className="flex flex-wrap items-center gap-1 border-b-2" style={{ borderColor: ORANGE_LIGHT, listStyle: 'none' }}>
              <li>
                <span className="block bg-white px-4 py-2 text-sm font-bold text-[#fa8729]" aria-current="page">
                  章节列表
                </span>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'book', bookId: book.id })}
                  className="block bg-white px-4 py-2 text-sm transition-colors hover:text-[#fa8729]"
                  style={{ color: '#666666' }}
                  aria-label={`返回《${book.name}》详情页`}
                >
                  返回《{book.name}》
                </button>
              </li>
              <li className="ml-auto flex items-center gap-2 pr-1 text-xs" style={{ color: '#666666' }}>
                <span>共 {data?.tocTotal ?? chapters.length} 章</span>
                <button
                  type="button"
                  onClick={() => setDesc((v) => !v)}
                  className="rounded-[3px] px-2 py-1 transition-colors hover:text-[#fa8729]"
                  style={{ border: '1px solid #e8e8e8', color: desc ? '#fa8729' : '#666666' }}
                  aria-label={desc ? '切换为正序' : '切换为倒序'}
                >
                  {desc ? '正序' : '倒序'}
                </button>
              </li>
            </ul>

            {volumes
              ? volumes.map((g) => (
                  <div key={g.volume}>
                    <h3
                      className="mt-4 flex h-[50px] items-center pl-3 text-xl"
                      style={{ borderBottom: `2px solid ${ORANGE_LIGHT}`, color: '#000000' }}
                    >
                      {g.volume || '正文'}
                    </h3>
                    <TocGrid chapters={g.chapters} currentChapterId={currentChapterId} />
                  </div>
                ))
              : (
                <div className="mt-4">
                  <h3 className="flex h-[50px] items-center pl-3 text-xl" style={{ borderBottom: `2px solid ${ORANGE_LIGHT}`, color: '#000000' }}>
                    正文
                  </h3>
                  <TocGrid chapters={shown} currentChapterId={currentChapterId} />
                </div>
              )}

            {/* 末端分页(降级①: 契约 100 章/页) */}
            {totalPages > 1 && (
              <nav aria-label="目录分页" className="flex flex-wrap items-center justify-center gap-1 py-5">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => navigate({ view: 'toc', bookId: book.id, page: n })}
                    className="h-7 min-w-[28px] px-1.5 text-sm leading-5"
                    style={n === page ? { color: '#fff', background: ORANGE_LIGHT, borderRadius: 2 } : { color: '#545655' }}
                    aria-current={n === page ? 'page' : undefined}
                    aria-label={`第 ${n} 页`}
                  >
                    {n}
                  </button>
                ))}
              </nav>
            )}
            <p className="pt-2 text-center text-xs" style={{ color: '#999999' }}>{site.name} · 第 {page} / {totalPages} 页</p>
          </section>
        )}
      </div>
    </div>
  )
}

/** 章节网格(works-chapter-item 294px 列; visited 色在 index.css .pili-toc-link:visited) */
function TocGrid({ chapters, currentChapterId }: { chapters: { id: string; title: string }[]; currentChapterId?: string }) {
  const { navigate } = usePublic()
  return (
    <ol className="grid grid-cols-1 gap-y-3 pt-4 sm:grid-cols-2 lg:grid-cols-4" style={{ listStyle: 'none' }}>
      {chapters.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => navigate({ view: 'read', chapterId: c.id })}
            className={`pili-toc-link block max-w-full truncate text-left text-sm transition-colors hover:text-[#fa8729] ${c.id === currentChapterId ? 'font-bold' : ''}`}
            style={{ color: c.id === currentChapterId ? '#fa8729' : TEXT }}
            aria-label={`阅读 ${c.title}`}
          >
            {c.title}
          </button>
        </li>
      ))}
    </ol>
  )
}
