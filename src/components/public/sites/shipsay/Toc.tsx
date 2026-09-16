// ============================================================
// [R27-6b-10] shipsay(船说 CMS demo) 目录页克隆 —— 船说 V4.2 #catalog 块独立成页
// 素材等级: 家族标准(降级声明) —— 船说 V4.2 无独立目录 URL(书页 /book/{id}/ 内
// #catalog > ul#ul_all_chapters 即完整目录, ss-book2.html 快照实证); 按任务书五页型要求将
// 目录块独立成页, 结构/样式逐条对齐快照实测: 白卡 + .title.jcc 标题 + 三列章节行 + 分页。
// 当前章高亮为增强态(真站无, 声明)。
// ============================================================
'use client'

import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, Sk } from '../../bits'

/** [R27-6b-10] 船说模板实测色值(同 Home) */
const C = {
  text: '#666666',
  link: '#1a1a1a',
  hover: '#ed4259',
  title: '#555555',
  line: '#e3e3e3',
} as const

export function ShipsayToc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { navigate } = usePublic()

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-2 py-10">
        <ErrorState message="目录加载失败" detail={error} />
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-2 pb-6 pt-3" aria-label="目录加载中">
        <Sk className="mb-2 h-8 w-1/2" />
        <div className="ss-card p-3">
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {Array.from({ length: 12 }).map((_, i) => (
              <Sk key={i} className="mb-2 h-4" style={{ opacity: 1 - (i % 3) * 0.08 }} />
            ))}
          </div>
          <span className="sr-only">加载中…</span>
        </div>
      </div>
    )
  }

  const { book, chapters, tocTotal, tocTotalPages } = data
  const pg = 'ss-pg m-[2px] inline-flex h-[32px] min-w-[32px] items-center justify-center rounded-[3px] border px-1.5 text-[13px]'

  return (
    <div className="ss-home w-full pb-6" style={{ background: '#f4f4f4', color: C.text, fontSize: 14 }}>
      <div className="mx-auto w-full max-w-[960px] px-2 pt-3">
        <div className="ss-card p-3">
          {/* .title.jcc 标题(真站《书名》最新章节 同款式) */}
          <div className="ss-title jcc py-1.5 text-center text-[16px] font-bold" style={{ color: C.title }}>
            《{book.name}》目录
            <span className="ml-2 text-[13px] font-normal" style={{ color: C.text }}>
              共 {tocTotal} 章
            </span>
          </div>
          {/* ul#ul_all_chapters(快照实测: 三列章节行, 底虚线) */}
          <ul id="ul_all_chapters" className="m-0 grid list-none grid-cols-1 gap-x-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {chapters.map((c) => (
              <li key={c.id} className="overflow-hidden whitespace-nowrap border-b border-dashed py-1.5" style={{ borderColor: C.line }}>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'read', chapterId: c.id })}
                  className="max-w-full truncate text-left hover:underline"
                  style={{ color: currentChapterId === c.id ? C.hover : C.link, fontWeight: currentChapterId === c.id ? 700 : 400 }}
                  aria-label={`阅读 ${c.title}`}
                  aria-current={currentChapterId === c.id ? 'true' : undefined}
                >
                  {c.title}
                </button>
              </li>
            ))}
          </ul>
          {/* 分页(契约 100 章/页; 真站单页全量 → 差异声明) */}
          {tocTotalPages > 1 && (
            <nav aria-label="目录分页" className="ss-pages flex flex-wrap items-center justify-center py-3">
              {page > 1 && (
                <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: page - 1 })} className={pg} aria-label="上一页">
                  上一页
                </button>
              )}
              {Array.from({ length: Math.min(10, tocTotalPages) }, (_, i) => Math.max(1, Math.min(page - 4, tocTotalPages - 9)) + i).map((n) =>
                n === page ? (
                  <strong key={n} className={pg} style={{ background: C.hover, borderColor: C.hover, color: '#fff' }} aria-current="page">
                    {n}
                  </strong>
                ) : (
                  <button key={n} type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: n })} className={pg} aria-label={`第 ${n} 页`}>
                    {n}
                  </button>
                ),
              )}
              {page < tocTotalPages && (
                <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: page + 1 })} className={pg} aria-label="下一页">
                  下一页
                </button>
              )}
            </nav>
          )}
          <p className="m-0 text-center">
            <button
              type="button"
              onClick={() => navigate({ view: 'book', bookId: book.id })}
              className="text-[13px] hover:underline"
              style={{ color: C.link }}
              aria-label={`返回《${book.name}》书页`}
            >
              返回书页
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
