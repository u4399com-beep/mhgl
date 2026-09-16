// ============================================================
// [R28-2d-4] huangjinwu(黄金屋) 目录页克隆 —— 真站直连实测 + 独立成页映射声明
// 素材: /tmp/r28-2d/huangjinwu/hjw-novel_262.html(2026-09-16 实抓)
//
// 差异声明: 真站无独立目录页 —— 章节目录位于书页 .detail-section(「章节目录(共N章)」
// + .pagination), 本书库无 /toc 类路由。本视图按契约(view=toc)将书页目录区块独立成页,
// DOM/样式逐条取自真站书页目录区块。
//
// 真站 DOM(取自书页对应区块):
//   nav.breadcrumb(黄金屋 / 分类 / 书名)
//   .detail-section: h2「章节目录<small>共N章</small>」 + ul.chapter-list
//     (auto-fill minmax(250px,1fr) 网格, .chapter-item 白卡边框, hover 蓝边浅蓝底,
//      a:visited 蓝) + .pagination(.page-info「x / y」+.page-link)
// ============================================================
'use client'

import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import { EmptyState, ErrorState } from '../../bits'

/** [R28-2d-1] 真站色值(hjw-style.css :root) */
const SECONDARY = '#2563eb'
const TEXT = '#1e293b'
const TEXT_LIGHT = '#64748b'
const BORDER = '#dbe4f0'
const SHADOW = '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37,99,235,0.06)'

export function HuangjinwuToc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { navigate } = usePublic()
  const book = data?.book || null
  const chapters = data?.chapters || []
  const totalPages = data ? Math.max(1, data.tocTotalPages) : 1

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6">
      {/* 面包屑(真站 nav.breadcrumb) */}
      <nav className="mb-6 truncate text-[15px]" style={{ color: TEXT_LIGHT }} aria-label="面包屑导航">
        <button type="button" className="transition-colors hover:text-[#2563eb]" style={{ color: TEXT_LIGHT }} onClick={() => navigate({ view: 'home' })}>
          黄金屋
        </button>
        <span className="mx-2" aria-hidden>
          /
        </span>
        {book && (
          <>
            <button type="button" className="transition-colors hover:text-[#2563eb]" style={{ color: TEXT_LIGHT }} onClick={() => navigate({ view: 'book', bookId: book.id })}>
              {book.name}
            </button>
            <span className="mx-2" aria-hidden>
              /
            </span>
          </>
        )}
        <span aria-current="page">章节目录</span>
      </nav>

      {/* .detail-section 章节目录卡 */}
      <section className="hjw-card rounded-[10px] border bg-white p-6" style={{ borderColor: BORDER, boxShadow: SHADOW }} aria-label="章节目录">
        <h1 className="hjw-sectitle mb-8 text-[20px] font-semibold" style={{ color: TEXT }}>
          章节目录
          {book && (
            <small className="ml-2 text-[14px] font-normal" style={{ color: TEXT_LIGHT }}>
              共{data?.tocTotal ?? 0}章 · {book.name}
            </small>
          )}
        </h1>

        {error ? (
          <ErrorState message="目录加载失败" detail={error} />
        ) : loading || !book ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="h-[46px] animate-pulse rounded-[10px] border" style={{ borderColor: BORDER, background: 'rgba(219,228,240,0.25)' }} />
            ))}
          </div>
        ) : !chapters.length ? (
          <EmptyState text="暂无章节" hint="本书尚未收录章节" />
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {chapters.map((ch) => {
                const current = ch.id === currentChapterId
                const go = () => navigate({ view: 'read', bookId: book.id, chapterId: ch.id })
                return (
                  <li key={ch.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={go}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          go()
                        }
                      }}
                      className={`hjw-chitem cursor-pointer overflow-hidden rounded-[10px] border transition-all duration-300 ${current ? 'hjw-chitem-active' : ''}`}
                      style={{ borderColor: current ? SECONDARY : BORDER, background: current ? '#e8f1ff' : undefined }}
                      aria-current={current}
                    >
                      <div className="block truncate px-4 py-3 text-[15px]" style={{ color: current ? SECONDARY : TEXT }} title={ch.title}>
                        {ch.title}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
            {/* .pagination-list(真站形态) */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-3 py-4">
                {page > 1 && (
                  <>
                    <button type="button" className="hjw-pg rounded-[10px]" onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}>
                      首页
                    </button>
                    <button type="button" className="hjw-pg rounded-[10px]" onClick={() => navigate({ view: 'toc', bookId: book.id, page: page - 1 })}>
                      上一页
                    </button>
                  </>
                )}
                <span className="min-w-[80px] px-4 text-center text-[14px]" style={{ color: TEXT }}>
                  {page} / {totalPages}
                </span>
                {page < totalPages && (
                  <>
                    <button type="button" className="hjw-pg rounded-[10px]" onClick={() => navigate({ view: 'toc', bookId: book.id, page: page + 1 })}>
                      下一页
                    </button>
                    <button type="button" className="hjw-pg rounded-[10px]" onClick={() => navigate({ view: 'toc', bookId: book.id, page: totalPages })}>
                      末页
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
