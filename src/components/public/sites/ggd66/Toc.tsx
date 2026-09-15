// ============================================================
// [R27-6-4] ggd66(格格党) 目录页克隆 —— 真站无独立目录 URL(https://www.ggd66.com/qu/33779/
// 书页内 #list-chapterAll「全部章节目录」即完整目录, JS「查看全部章节↓」整页展开)。
// 按任务书五页型要求, 将书页内目录块独立成页, 结构/样式逐条对齐 /tmp/r27-f/ggd66-book.html 实测:
//
// DOM 映射(ol.breadcrumb + dl.book.chapterlist#list-chapterAll):
//   ├ ol.breadcrumb   首页 » 分类 » 书名 » 章节列表(active #666; 底 #cdf3eb/边 #ccc/圆角 4px)
//   ├ .book 白卡      h2 《书名》全部章节目录 + 共 N 章(补计数, 真站无 → 增强)
//   │                 + dd 章节 25% 网格(底边 1px dashed #ccc/py 8px/nowrap; 当前章 #f50 加粗高亮=增强态声明)
//   └ .pages          分页(契约 100 章/页; 真站单页全量 JS 展开 → 差异声明)
// ============================================================
'use client'

import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, Sk } from '../bits'

/** [R27-6-4] 真站实测色值(ggd66-style.css) */
const TEAL = '#56ccb5'
const GREEN_LINK = '#00886d'
const TEXT_BODY = '#888'
const LINE = '#ccc'
const CRUMB_BG = '#cdf3eb'

export function Ggd66Toc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { navigate } = usePublic()

  if (error) {
    return (
      <div className="mx-auto w-[90%] max-w-[1200px] py-10">
        <ErrorState message="目录加载失败" detail={error} />
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="mx-auto w-[90%] max-w-[1200px] pb-10" aria-label="目录加载中">
        <Sk className="mb-2.5 h-9 w-1/2 rounded-[4px]" />
        <div className="ggd-book rounded-[4px] border bg-white p-2.5" style={{ borderColor: LINE }}>
          <Sk className="mb-3 h-5 w-1/3" />
          <div className="grid grid-cols-1 gap-x-2 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
            {Array.from({ length: 12 }).map((_, i) => (
              <Sk key={i} className="mb-2 h-4" style={{ opacity: 1 - (i % 4) * 0.08 }} />
            ))}
          </div>
          <span className="sr-only">加载中…</span>
        </div>
      </div>
    )
  }

  const { book, chapters, tocTotal, tocTotalPages } = data
  const pg = 'ggd-pg m-[2px] inline-flex h-[35px] min-w-[35px] items-center justify-center rounded-[3px] border px-1 text-[14px]'

  return (
    <div className="mx-auto w-[90%] max-w-[1200px] pb-10" style={{ color: TEXT_BODY }}>
      {/* ============ ol.breadcrumb 面包屑 ============ */}
      <nav aria-label="面包屑" className="ggd-crumb mb-2.5 rounded-[4px] border px-[15px] py-2 text-[14px]" style={{ borderColor: LINE, background: CRUMB_BG }}>
        <ol className="flex flex-wrap items-center">
          <li className="flex items-center">
            <button type="button" onClick={() => navigate({ view: 'home' })} className="transition-colors hover:text-[#f50]" style={{ color: GREEN_LINK }} aria-label="前往首页">
              首页
            </button>
            <span className="ggd-crumb-sep px-[5px]" style={{ color: '#666' }} aria-hidden>
              »
            </span>
          </li>
          <li className="flex items-center">
            <button
              type="button"
              onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 })}
              className="max-w-[9em] truncate transition-colors hover:text-[#f50]"
              style={{ color: GREEN_LINK }}
              aria-label={`前往 ${book.category} 分类`}
            >
              {book.category || '小说'}
            </button>
            <span className="ggd-crumb-sep px-[5px]" style={{ color: '#666' }} aria-hidden>
              »
            </span>
          </li>
          <li className="flex items-center">
            <button type="button" onClick={() => navigate({ view: 'book', bookId: book.id })} className="max-w-[12em] truncate transition-colors hover:text-[#f50]" style={{ color: GREEN_LINK }} aria-label={`返回《${book.name}》书页`}>
              {book.name}
            </button>
            <span className="ggd-crumb-sep px-[5px]" style={{ color: '#666' }} aria-hidden>
              »
            </span>
          </li>
          <li>
            <span style={{ color: '#666' }}>章节列表</span>
          </li>
        </ol>
      </nav>

      {/* ============ #list-chapterAll 全部章节目录(真站书页内目录块独立成页) ============ */}
      <div className="ggd-book rounded-[4px] border bg-white px-2.5 pb-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.05)]" style={{ borderColor: LINE }}>
        <h2 className="ggd-h2">
          《{book.name}》全部章节目录
          <span className="ml-2 text-[13px] font-normal">共 {tocTotal} 章</span>
        </h2>
        <dl className="ggd-chapterlist mt-2.5 flex flex-wrap">
          {chapters.map((c) => {
            const cur = currentChapterId === c.id
            return (
              <dd key={c.id} className="w-full overflow-hidden whitespace-nowrap border-b border-dashed py-2 sm:w-1/2 lg:w-1/4">
                <button
                  type="button"
                  onClick={() => navigate({ view: 'read', chapterId: c.id })}
                  className="max-w-full truncate text-left transition-colors hover:text-[#f50]"
                  style={{ color: cur ? '#f50' : GREEN_LINK, fontWeight: cur ? 700 : 400 }}
                  aria-label={`阅读 ${c.title}`}
                  aria-current={cur ? 'true' : undefined}
                >
                  {c.title}
                </button>
              </dd>
            )
          })}
        </dl>
        {/* .pages 分页(契约 100 章/页; 真站单页全量展开, 差异声明) */}
        {tocTotalPages > 1 && (
          <nav aria-label="目录分页" className="ggd-pages flex flex-wrap items-center justify-center gap-y-1 py-2.5 text-center">
            {page > 1 && (
              <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: page - 1 })} className={pg} style={{ borderColor: LINE }} aria-label="上一页">
                &lt;
              </button>
            )}
            {Array.from({ length: Math.min(10, tocTotalPages) }, (_, i) => Math.max(1, Math.min(page - 4, tocTotalPages - 9)) + i).map((n) =>
              n === page ? (
                <strong key={n} className={pg} aria-current="page">
                  {n}
                </strong>
              ) : (
                <button key={n} type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: n })} className={pg} style={{ borderColor: LINE }} aria-label={`第 ${n} 页`}>
                  {n}
                </button>
              ),
            )}
            {page < tocTotalPages && (
              <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: page + 1 })} className={pg} style={{ borderColor: LINE }} aria-label="下一页">
                &gt;
              </button>
            )}
            {page < tocTotalPages && (
              <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: tocTotalPages })} className={pg} style={{ borderColor: TEAL }} aria-label="最后一页">
                &gt;&gt;
              </button>
            )}
          </nav>
        )}
        <div className="clear-both" />
      </div>
    </div>
  )
}
