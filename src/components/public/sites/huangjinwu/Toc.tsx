// ============================================================
// [R27-6-10] huangjinwu(黄金屋) 目录页克隆(独立 toc 视图) —— 依据真站书页「章节目录」板块形态还原
// (快照: /tmp/r27-f/huangjinwu-book.html 实抓 + /static/default/style.css 逐条提取)
//
// 真站形态: huangjinwu 无独立目录页 —— 书页(/novel/{id})内 .detail-section「章节目录 共N章」即目录本体
//   (真站由前端按需展开全量 3682 章)。独立 toc 视图按该板块形态逐节还原:
//   ├ nav.breadcrumb            黄金屋 / {分类} / 书名(链书页) / active 章节目录
//   ├ .detail-header 简卡       .detail-cover 60×80 缩略 + 书名 24px/600 + 作者/共 N 章 + 去书页/阅读钮
//   └ .detail-section           h2.flex-title 章节目录<small>共N章</small> + ul.chapter-list
//                               (grid auto-fill minmax(250px,1fr); ≤768 2 列; ≤480 1 列; a:visited 蓝)
//                               + .pagination 分页
// 差异声明: ①真站目录与书档同页且前端展开全量 → 契约 100 章/页 + .pagination 分页
//           ②当前章高亮(#e8f1ff 底/#2563eb 边字)为增强态(真站无, 阅读回跳定位需要)
//           ③有卷数据用 groupTocVolumes 分卷分组(卷名做分组条); 真站无分卷概念, 为契约增强。
// ============================================================
'use client'

import { useState } from 'react'
import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import { groupTocVolumes } from '../template-kit'
import type { TocChapter } from '../../types'
import { BookCover } from '../BookCover'
import { ErrorState, Sk } from '../bits'

/** [R27-6-10] 真站实测色值(style.css :root) */
const C = {
  secondary: '#2563eb',
  text: '#1e293b',
  textLight: '#64748b',
  textMuted: '#94a3b8',
  border: '#dbe4f0',
  hover: '#e8f1ff',
  card: '#ffffff',
  shadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37,99,235,0.06)',
} as const

const FONT = '-apple-system,BlinkMacSystemFont,"Microsoft YaHei","PingFang SC","Segoe UI","Helvetica Neue",Arial,sans-serif'

/** [R27-6-10] 章节网格(桌面 auto-fill minmax(250px,1fr), ≤768 2 列, ≤480 1 列) */
function ChapterGrid({ items, currentId, onGo }: { items: TocChapter[]; currentId?: string; onGo: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
      {items.map((c) => (
        <li
          key={c.id}
          className="hjw-chitem min-w-0 overflow-hidden rounded-[10px] border transition-colors"
          style={{ background: c.id === currentId ? C.hover : C.card, borderColor: c.id === currentId ? C.secondary : C.border }}
        >
          <button
            type="button"
            onClick={() => onGo(c.id)}
            className={`block w-full truncate px-4 py-3 text-left text-[15px] ${c.id === currentId ? 'font-medium' : ''}`}
            style={{ color: c.id === currentId ? C.secondary : C.text }}
            aria-label={`阅读 ${c.title}`}
            aria-current={c.id === currentId ? 'true' : undefined}
          >
            {c.title}
          </button>
        </li>
      ))}
    </ul>
  )
}

export function HuangjinwuToc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { navigate } = usePublic()

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1180px] px-4 py-10" style={{ fontFamily: FONT }}>
        <ErrorState message="目录载入失败" detail={error} />
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="mx-auto w-full max-w-[1180px] px-4 py-4 md:py-8" aria-label="目录加载中" style={{ color: C.text, fontFamily: FONT }}>
        <Sk className="mb-6 h-5 w-64" />
        <div className="mb-6 flex items-center gap-4 rounded-[10px] border p-6" style={{ background: C.card, borderColor: C.border, boxShadow: C.shadow }}>
          <Sk className="h-[80px] w-[60px] shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Sk className="h-6 w-1/2" />
            <Sk className="h-4 w-1/3" />
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]" aria-hidden>
          {Array.from({ length: 18 }).map((_, i) => (
            <li key={i}>
              <Sk className="h-[46px] rounded-[10px]" />
            </li>
          ))}
        </ul>
        <span className="sr-only">加载中…</span>
      </div>
    )
  }

  const { book, chapters, tocTotal, tocTotalPages } = data
  const totalPages = Math.max(1, tocTotalPages)
  const vols = groupTocVolumes(chapters)

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-4 md:py-8" style={{ color: C.text, fontFamily: FONT }}>
      {/* ===== nav.breadcrumb: 黄金屋 / {分类} / 书名 / 章节目录 ===== */}
      <nav aria-label="面包屑导航" className="mb-6 -mt-2 text-[15px]" style={{ color: C.textLight }}>
        <ol className="flex items-center gap-2 list-none p-0">
          <li>
            <button type="button" onClick={() => navigate({ view: 'home' })} className="transition-colors hover:text-[#2563eb]" style={{ color: C.textLight }} aria-label="返回黄金屋首页">
              黄金屋
            </button>
          </li>
          <li aria-hidden style={{ color: C.textMuted }}>/</li>
          <li className="min-w-0 truncate">
            <button type="button" onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 })} className="truncate transition-colors hover:text-[#2563eb]" style={{ color: C.textLight }} aria-label={`浏览 ${book.category} 分类`}>
              {book.category || '小说'}
            </button>
          </li>
          <li aria-hidden style={{ color: C.textMuted }}>/</li>
          <li className="min-w-0 truncate">
            <button type="button" onClick={() => navigate({ view: 'book', bookId: book.id })} className="truncate transition-colors hover:text-[#2563eb]" style={{ color: C.textLight }} aria-label={`返回《${book.name}》书页`}>
              {book.name}
            </button>
          </li>
          <li aria-hidden style={{ color: C.textMuted }}>/</li>
          <li className="truncate" aria-current="page">
            章节目录
          </li>
        </ol>
      </nav>

      {/* ===== .detail-header 简卡(60×80 缩略 + 书名/作者/共 N 章 + 去书页) ===== */}
      <div className="mb-6 flex items-center gap-4 rounded-[10px] border p-6" style={{ background: C.card, borderColor: C.border, boxShadow: C.shadow }}>
        <span className="block h-[80px] w-[60px] shrink-0 overflow-hidden rounded-[10px] border" style={{ borderColor: C.border, boxShadow: C.shadow }}>
          <BookCover name={book.name} cover={book.cover} className="h-full w-full" style={{ borderRadius: 10 }} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[24px] font-semibold leading-[1.3]" style={{ color: C.text, letterSpacing: '-0.01em' }}>
            {book.name}
          </h1>
          <p className="pt-1 text-[15px]" style={{ color: C.textLight }}>
            {book.author} · 共 {tocTotal} 章
          </p>
        </div>
        <button type="button" onClick={() => navigate({ view: 'book', bookId: book.id })} className="hjw-btn-secondary shrink-0 px-5 py-2.5" aria-label="返回书页">
          去书页
        </button>
      </div>

      {/* ===== .detail-section 章节目录(flex-title + 共N章 small) ===== */}
      <section>
        <div className="mb-5 flex items-baseline gap-3">
          <h2 className="hjw-title flex items-center text-[20px] font-semibold" style={{ borderLeft: `4px solid ${C.secondary}`, borderRadius: '2px 0 0 2px', color: '#0f172a', letterSpacing: '-0.02em', paddingLeft: 16 }}>
            章节目录
          </h2>
          <small className="shrink-0 text-[14px] font-normal" style={{ color: C.textMuted }}>
            共{tocTotal}章
          </small>
        </div>

        {chapters.length ? (
          vols ? (
            vols.map((g) => (
              <div key={g.volume} className="mb-6">
                <h3 className="mb-3 flex items-center gap-2 text-[16px] font-semibold" style={{ color: C.text }} aria-label={`分卷 ${g.volume || '正文'}`}>
                  <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-[6px]" style={{ background: C.secondary }} />
                  {g.volume || '正文'}
                  <small className="text-[13px] font-normal" style={{ color: C.textMuted }}>
                    ({g.chapters.length}章)
                  </small>
                </h3>
                <ChapterGrid items={g.chapters} currentId={currentChapterId} onGo={(id) => navigate({ view: 'read', chapterId: id })} />
              </div>
            ))
          ) : (
            <ChapterGrid items={chapters} currentId={currentChapterId} onGo={(id) => navigate({ view: 'read', chapterId: id })} />
          )
        ) : (
          <p className="py-4 text-center text-sm" style={{ color: C.textMuted }}>
            暂无章节
          </p>
        )}

        {/* .pagination(真站整页全量 → 契约 100 章/页, 声明) */}
        {totalPages > 1 && (
          <nav aria-label="目录分页" className="flex flex-wrap items-center justify-center gap-3 py-4">
            <span className="page-info min-w-[60px] px-2 text-center text-[14px] max-[480px]:hidden" style={{ color: C.text }}>
              {page} / {totalPages}
            </span>
            {page > 1 && (
              <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: page - 1 })} className="hjw-pg" aria-label="上一页">
                上一页
              </button>
            )}
            {page < totalPages && (
              <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: page + 1 })} className="hjw-pg" aria-label="下一页">
                下一页
              </button>
            )}
            {page < totalPages && (
              <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: totalPages })} className="hjw-pg" aria-label="末页">
                末页
              </button>
            )}
          </nav>
        )}
      </section>
    </div>
  )
}
