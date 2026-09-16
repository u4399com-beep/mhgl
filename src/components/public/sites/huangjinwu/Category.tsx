// ============================================================
// [R27-6-h2] huangjinwu(黄金屋) 书库/分类页克隆 —— 按 https://www.huangjinwu.org/list 真站快照逐节还原
// (/tmp/r27-f/hjw-list.html + hjw-style.css 实测)
//
// 真站 DOM(.main-content > .container):
//   ├ nav.breadcrumb           面包屑(15px #64748b; li.gap .8rem; active 当前页; 分隔符「/」形态)
//   ├ h1.page-title            「小说分类」(左 4px #2563eb 竖条/21px/600/letter-spacing -.02em)
//   ├ .filter-bar              白卡(p 1.6rem/10px 圆角/浅影) > .filter-tags(grid 3 列, ≥768 5 列):
//   │                          a.filter-tag(bg #f0f4fb/边 #dbe4f0/15px/10px 圆角; active 实底蓝白字,
//   │                          hover 上浮) — 全部小说 + 九分类
//   ├ .class-section           h2.page-title「全部小说列表」+ .book-grid(1/2/3 列) > a.book-card×24
//   │                          (book-info: 标题/作者/简介 2 行/badge 三色, 同首页卡)
//   └ .pagination              .pagination-list(flex 居中 gap 1.2rem): li.page-info「1 / 1506」(14px) +
//                              a.page-link(bg #fff/边 1.5px #dbe4f0/15px 圆角/p 8px 24px; hover 实底蓝白字上浮)
// 契约映射: 真站「人气/推荐」排序与列表页无对应查询参数 → 模板仅保留分类筛选行(全功能), 其余声明不渲染。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchCategories } from '../../data'
import type { CategoryItem } from '../../types'
import { ErrorState, Sk, bookNavProps } from '../../bits'
import { formatWords } from '../../seo'

/** [R27-6-h2] 真站实测色值(hjw-style.css :root) */
const SECONDARY = '#2563eb'
const TEXT = '#1e293b'
const TEXT_LIGHT = '#64748b'
const BORDER = '#dbe4f0'
const BG_TINT = '#f0f4fb'
const SHADOW = '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37,99,235,0.06)'

function statusText(s?: string | null): string {
  if (s === 'completed') return '全本'
  return '连载'
}

export function HjwCategory({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()

  // [R27-6-h2] .filter-bar 分类 chips(fetchCategories; 真站 9 分档)
  const [cats, setCats] = useState<CategoryItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchCategories()
      .then((d) => {
        if (alive) setCats(d || [])
      })
      .catch(() => {
        if (alive) setCats([])
      })
    return () => {
      alive = false
    }
  }, [])

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
        <ErrorState message="书库加载失败" detail={error} />
      </div>
    )
  }

  const books = data?.books || []
  const total = data?.total || 0
  const size = data?.size || 24
  const totalPages = Math.max(1, Math.ceil(total / size))
  // .page-link 规格(bg #fff/边 1.5px/15px 圆角/p 8px 24px; hover 由 index.ts css 承担)
  const pg = 'hjw-pagelink inline-flex h-[38px] cursor-pointer items-center justify-center rounded-[15px] border-[1.5px] bg-white px-5 text-[14px] font-medium'
  const pgStyle = { borderColor: BORDER, color: TEXT }

  return (
    <div className="w-full pb-10" style={{ color: TEXT }}>
      <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6">
        {/* ============ nav.breadcrumb 面包屑 ============ */}
        <nav aria-label="面包屑" className="mb-4 py-3 text-[15px]" style={{ color: TEXT_LIGHT }}>
          <ol className="flex items-center gap-2">
            <li>
              <button type="button" onClick={() => navigate({ view: 'home' })} className="transition-colors hover:text-[#2563eb]" style={{ color: SECONDARY }} aria-label="返回黄金屋首页">
                黄金屋
              </button>
            </li>
            <li aria-hidden>/</li>
            <li className="truncate font-medium" style={{ color: TEXT }}>
              {catName}
            </li>
          </ol>
        </nav>

        {/* ============ h1.page-title 小说分类 ============ */}
        <h1 className="hjw-pagetitle mb-5 border-l-4 pl-4 text-[21px] font-semibold tracking-tight" style={{ borderLeftColor: SECONDARY, color: TEXT }}>
          小说分类
        </h1>

        {/* ============ .filter-bar 分类筛选白卡 ============ */}
        <div className="mb-8 rounded-[10px] bg-white p-4" style={{ boxShadow: SHADOW }}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {cats === null ? (
              Array.from({ length: 10 }).map((_, i) => <Sk key={i} className="h-9 rounded-[10px]" />)
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'category', page: 1 })}
                  className="hjw-filter-tag rounded-[10px] border px-3 py-2 text-center text-[15px] transition-all"
                  style={cat ? { background: BG_TINT, borderColor: BORDER, color: TEXT } : { background: SECONDARY, borderColor: SECONDARY, color: '#fff' }}
                  aria-label="浏览全部小说"
                >
                  全部小说
                </button>
                {cats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => navigate({ view: 'category', cat: c.id, page: 1 })}
                    className="hjw-filter-tag truncate rounded-[10px] border px-3 py-2 text-center text-[15px] transition-all"
                    style={cat === c.id ? { background: SECONDARY, borderColor: SECONDARY, color: '#fff' } : { background: BG_TINT, borderColor: BORDER, color: TEXT }}
                    aria-label={`浏览 ${c.name}`}
                  >
                    {c.name}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* ============ .class-section 列表 ============ */}
        <section className="mb-8">
          <h2 className="hjw-pagetitle mb-5 border-l-4 pl-4 text-[21px] font-semibold tracking-tight" style={{ borderLeftColor: SECONDARY, color: TEXT }}>
            {catName}列表
          </h2>
          {loading && !books.length ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="书库加载中">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-[10px] border bg-white p-4" style={{ borderColor: BORDER }}>
                  <Sk className="mb-2 h-4 w-2/3" />
                  <Sk className="mb-2 h-3 w-1/3" />
                  <Sk className="mb-2 h-3 w-full" />
                  <Sk className="h-3 w-5/6" />
                </div>
              ))}
              <span className="sr-only">加载中…</span>
            </div>
          ) : books.length ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {books.map((b) => (
                <article
                  key={b.id}
                  {...bookNavProps(navigate, b.id)}
                  aria-label={`查看《${b.name}》详情`}
                  className="hjw-card block cursor-pointer overflow-hidden rounded-[10px] border bg-white transition-all duration-300 hover:-translate-y-0.5"
                  style={{ borderColor: 'rgba(219,228,240,0.85)', boxShadow: SHADOW, color: TEXT }}
                >
                  <div className="p-4">
                    <div className="hjw-card-title mb-2 truncate text-[16px] font-medium leading-[1.4]">{b.name}</div>
                    <div className="mb-2 truncate text-[14px]" style={{ color: TEXT_LIGHT }}>
                      作者：{b.author}
                    </div>
                    <div className="mb-3 line-clamp-2 min-h-[2.55em] text-[14px] leading-[1.5]" style={{ color: TEXT_LIGHT }}>
                      {b.intro || `${b.category} · ${formatWords(b.wordCount)}`}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-block rounded-[10px] px-3 py-1 text-[12px] font-medium leading-[1.5] text-white" style={{ background: SECONDARY }}>
                        {b.category || '小说'}
                      </span>
                      <span className="inline-block rounded-[10px] border px-3 py-1 text-[12px] font-medium leading-[1.5]" style={{ background: '#e8f1ff', borderColor: BORDER, color: TEXT }}>
                        {statusText(b.status)}
                      </span>
                      <span className="inline-block rounded-[10px] border px-3 py-1 text-[12px] font-medium leading-[1.5]" style={{ borderColor: BORDER, color: TEXT_LIGHT }}>
                        {formatWords(b.wordCount)}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm" style={{ color: TEXT_LIGHT }}>
              该分类暂无书籍
            </p>
          )}
        </section>

        {/* ============ .pagination 分页(真站 page-info「1 / N」+ 页码钮) ============ */}
        {totalPages > 1 && (
          <nav aria-label="分页" className="flex flex-wrap items-center justify-center gap-3 py-4">
            <span className="min-w-[80px] text-center text-[14px]" style={{ color: TEXT }}>
              {page} / {totalPages}
            </span>
            {page > 1 && (
              <button type="button" onClick={() => navigate({ view: 'category', cat, page: page - 1 })} className={pg} style={pgStyle} aria-label="上一页">
                上一页
              </button>
            )}
            {page < totalPages && (
              <>
                <button type="button" onClick={() => navigate({ view: 'category', cat, page: page + 1 })} className={pg} style={pgStyle} aria-label="下一页">
                  下一页
                </button>
                <button type="button" onClick={() => navigate({ view: 'category', cat, page: totalPages })} className={pg} style={pgStyle} aria-label="末页">
                  末页
                </button>
              </>
            )}
          </nav>
        )}
      </div>
    </div>
  )
}
