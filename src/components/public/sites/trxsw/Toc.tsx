// ============================================================
// [R27-6b-16] trxsw(同人小说网) 目录页克隆 —— 杰奇 CMS 书页 #list 目录块独立成页
// 素材等级: 家族标准(降级声明) —— 杰奇 CMS 无独立目录 URL(书页 /book/{id}/ 内 #list dd a
// 即完整目录, R25-1 worklog 实证选择器); 按任务书五页型要求将目录块独立成页, 结构/样式逐条
// 对齐杰奇家族标准: JqH2 标题 + #list dd 四列章节行 + 分页。当前章高亮为增强态(声明)。
// ============================================================
'use client'

import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, Sk } from '../../bits'

/** [R27-6b-16] 杰奇 CMS 家族标准色板(同 Home) */
const C = {
  navBlue: '#1C5087',
  text: '#333333',
  gray: '#666666',
  border: '#dddddd',
  dotted: '#cccccc',
} as const

export function TrxswToc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
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
        <Sk className="mb-2 h-9 w-1/2" />
        <div className="tx-toc border bg-white p-2.5" style={{ borderColor: C.border }}>
          <div className="grid grid-cols-1 gap-x-2 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
            {Array.from({ length: 16 }).map((_, i) => (
              <Sk key={i} className="mb-2 h-4" style={{ opacity: 1 - (i % 4) * 0.08 }} />
            ))}
          </div>
          <span className="sr-only">加载中…</span>
        </div>
      </div>
    )
  }

  const { book, chapters, tocTotal, tocTotalPages } = data
  const pg = 'tx-pg m-[2px] inline-flex h-[30px] min-w-[30px] items-center justify-center border px-1 text-[13px]'

  return (
    <div className="tx-home mx-auto w-full max-w-[960px] px-2 pb-6 pt-3" style={{ color: C.text, fontSize: 14 }}>
      {/* 面包屑(杰奇家族 .con) */}
      <p className="tx-crumb m-0 mb-2 text-[13px]" style={{ color: C.gray }}>
        <button type="button" onClick={() => navigate({ view: 'home' })} className="hover:underline" style={{ color: C.text }} aria-label="前往首页">
          首页
        </button>
        <span className="mx-1">&gt;</span>
        <button
          type="button"
          onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 })}
          className="hover:underline"
          style={{ color: C.text }}
          aria-label={`前往 ${book.category} 分类`}
        >
          {book.category || '小说'}
        </button>
        <span className="mx-1">&gt;</span>
        <span>{book.name}目录</span>
      </p>

      <div className="tx-toc border bg-white p-2.5" style={{ borderColor: C.border }}>
        {/* JqH2 标题(真站 h2 底纹 → CSS 渐变等价) */}
        <h2
          className="m-0 flex flex-wrap items-center overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #fafbfc 0%, #e9eef5 100%)',
            borderBottom: `1px solid ${C.border}`,
            borderLeft: `4px solid ${C.navBlue}`,
            fontSize: 14,
            fontWeight: 700,
            lineHeight: '32px',
            minHeight: 32,
            paddingLeft: 8,
            paddingRight: 8,
          }}
        >
          《{book.name}》全部章节目录
          <span className="ml-2 text-[12px] font-normal" style={{ color: C.gray }}>
            共 {tocTotal} 章
          </span>
        </h2>
        {/* #list dd 四列章节行(杰奇家族标准) */}
        <dl className="tx-list m-0 mt-2 flex flex-wrap">
          {chapters.map((c) => (
            <dd key={c.id} className="w-full overflow-hidden whitespace-nowrap border-b border-dotted py-1.5 sm:w-1/2 lg:w-1/4" style={{ borderColor: C.dotted }}>
              <button
                type="button"
                onClick={() => navigate({ view: 'read', chapterId: c.id })}
                className="max-w-full truncate text-left hover:underline"
                style={{ color: currentChapterId === c.id ? '#C00' : C.text, fontWeight: currentChapterId === c.id ? 700 : 400 }}
                aria-label={`阅读 ${c.title}`}
                aria-current={currentChapterId === c.id ? 'true' : undefined}
              >
                {c.title}
              </button>
            </dd>
          ))}
        </dl>
        {/* 分页(契约 100 章/页; 真站单页全量 → 差异声明) */}
        {tocTotalPages > 1 && (
          <nav aria-label="目录分页" className="tx-pages flex flex-wrap items-center justify-center py-2.5">
            {page > 1 && (
              <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: page - 1 })} className={pg} aria-label="上一页">
                上一页
              </button>
            )}
            {Array.from({ length: Math.min(10, tocTotalPages) }, (_, i) => Math.max(1, Math.min(page - 4, tocTotalPages - 9)) + i).map((n) =>
              n === page ? (
                <strong key={n} className={pg} style={{ background: C.navBlue, borderColor: C.navBlue, color: '#fff' }} aria-current="page">
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
            style={{ color: C.text }}
            aria-label={`返回《${book.name}》书页`}
          >
            返回书页
          </button>
        </p>
      </div>
    </div>
  )
}
