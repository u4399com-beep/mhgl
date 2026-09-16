// ============================================================
// [R27-6-h1] huangjinwu(黄金屋) 首页克隆 —— 按 https://www.huangjinwu.org/ 首页真站快照逐节还原
// (/tmp/r27-f/hjw-home.html + hjw-style.css 实测, 2026 抓取)
//
// 真站 DOM(.main-content > .container max 1180px):
//   ├ .hot-section    h2.page-title(左 4px #2563eb 竖条/21px/600)「热门推荐」+ .book-grid(1/2/3 列响应)
//   │                 > a.book-card×6(白卡 10px 圆角/边 #dbe4f0/蓝调浅影; hover 上浮 2px+深影+标题变蓝):
//   │                 .book-info(p 1.6rem): .book-title(16px/500/单行省略) + .book-author(14px #64748b) +
//   │                 .book-desc(14px/1.5/2 行钳制/min-h 2.55em) + .book-badges(badge.category 实底蓝白字 /
//   │                 badge.status 浅蓝底描边 / badge.words 透明底描边 #64748b)
//   ├ .sort-section   h2.page-title「分类排行榜」+ .category-ranking-grid(2/3 列) > .ranking-module×N
//   │                 (白卡; .ranking-module-title: bg #f0f4fb/18px/600/:before 3×16px 蓝竖条;
//   │                 .ranking-item: 底边 #dbe4f0/p 8px 16px/a.ranking-title 16px/500 + span.ranking-author 14px)
//   └ .update-section h2.page-title「最新更新」+ .book-grid 同款卡片
// 注: ①真站头部(headers 折叠导航/搜索/夜间切换)由 SiteHeader huangjinwu 头部承担, 本组件从 main-content 起
//    ②真站卡为纯文字卡(无封面图), badge 三色 chip 为其识别核心 → 逐条复刻
//    ③分类排行榜各榜=同分类 10 本 → 单次 fetchBooks(sort:words,60) 按 category 分组替代逐榜请求(声明)
// 色板出处(hjw-style.css :root 变量, 亮色主题): --bg #f0f4fb/渐变 #f5f8ff→#eef3fb · --card #fff ·
//   --secondary #2563eb · --logo #1d4ed8 · --text #1e293b · --text-light #64748b · --border #dbe4f0
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clock, Flame, ListOrdered } from 'lucide-react'
import type { SiteHomeProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import type { BookItem } from '../../types'
import { Sk, bookNavProps } from '../../bits'
import { formatWords } from '../../seo'

/** [R27-6-h1] 真站实测色值(hjw-style.css :root) */
const SECONDARY = '#2563eb' // --secondary-color(×N: 竖条/主钮/分类 badge/hover 标题)
const TEXT = '#1e293b' // --text-color
const TEXT_LIGHT = '#64748b' // --text-light
const BORDER = '#dbe4f0' // --border-color
const HOVER_BG = '#e8f1ff' // --hover-color(status badge 底)
const BG_TINT = '#f0f4fb' // --bg-color(ranking 榜头底)
const SHADOW = '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37,99,235,0.06)' // --shadow

function statusText(s?: string | null): string {
  if (s === 'completed') return '全本'
  return '连载'
}

/** [R27-6-h1] .book-card 纯文字卡(标题/作者/简介 2 行/三色 badge 组) */
function BookCard({ book }: { book: BookItem }) {
  const { navigate } = usePublic()
  return (
    <article
      {...bookNavProps(navigate, book.id)}
      aria-label={`查看《${book.name}》详情`}
      className="hjw-card block cursor-pointer overflow-hidden rounded-[10px] border bg-white transition-all duration-300 hover:-translate-y-0.5"
      style={{ borderColor: 'rgba(219,228,240,0.85)', boxShadow: SHADOW, color: TEXT }}
    >
      <div className="p-4">
        <div className="hjw-card-title mb-2 truncate text-[16px] font-medium leading-[1.4]" style={{ color: TEXT }}>
          {book.name}
        </div>
        <div className="mb-2 truncate text-[14px]" style={{ color: TEXT_LIGHT }}>
          作者：{book.author}
        </div>
        <div className="mb-3 line-clamp-2 min-h-[2.55em] text-[14px] leading-[1.5]" style={{ color: TEXT_LIGHT }}>
          {book.intro || `${book.category} · ${formatWords(book.wordCount)}`}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-block rounded-[10px] px-3 py-1 text-[12px] font-medium leading-[1.5] text-white" style={{ background: SECONDARY }}>
            {book.category || '小说'}
          </span>
          <span className="inline-block rounded-[10px] border px-3 py-1 text-[12px] font-medium leading-[1.5]" style={{ background: HOVER_BG, borderColor: BORDER, color: TEXT }}>
            {statusText(book.status)}
          </span>
          <span className="inline-block rounded-[10px] border px-3 py-1 text-[12px] font-medium leading-[1.5]" style={{ borderColor: BORDER, color: TEXT_LIGHT }}>
            {formatWords(book.wordCount)}
          </span>
        </div>
      </div>
    </article>
  )
}

export function HjwHome({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()

  // [R27-6-h1] 热门 6 卡(字数热榜基因 → 真站热门推荐位; 失败回退 props 前 6)
  const [pool, setPool] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 60 })
      .then((d) => {
        if (alive) setPool(d.books || [])
      })
      .catch(() => {
        if (alive) setPool([])
      })
    return () => {
      alive = false
    }
  }, [site.id])

  const hot = (pool && pool.length ? pool : books).slice(0, 6)
  // 最新更新(props 余量前 12; 真站 update-section 同款卡片)
  const hotIds = useMemo(() => new Set(hot.map((b) => b.id)), [hot])
  const updated = books.filter((b) => !hotIds.has(b.id)).slice(0, 12)

  // [R27-6-h1] 分类排行榜: 单次 60 本按 category 分组(真站逐榜 10 本; 无逐榜接口 → 同源分组, 声明)
  const rankingModules = useMemo(() => {
    const src = pool && pool.length ? pool : books
    const byCat = new Map<string, BookItem[]>()
    for (const b of src) {
      const c = b.category || '其他'
      if (!byCat.has(c)) byCat.set(c, [])
      const arr = byCat.get(c)!
      if (arr.length < 10) arr.push(b)
    }
    return Array.from(byCat.entries())
      .filter(([, arr]) => arr.length >= 3)
      .slice(0, 6)
      .map(([cat, arr]) => ({ cat, arr }))
  }, [pool, books])

  const grid = 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'

  return (
    <div className="w-full pb-10" style={{ color: TEXT }}>
      <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6">
        {/* ============ .hot-section 热门推荐 ============ */}
        <section className="mb-8">
          <h2 className="hjw-pagetitle mb-5 flex items-center gap-2 text-[21px] font-semibold" style={{ color: TEXT }} aria-label="热门推荐">
            <Flame className="h-5 w-5" style={{ color: SECONDARY }} aria-hidden />
            热门推荐
          </h2>
          {loading && !books.length ? (
            <div className={grid} role="status" aria-label="热门推荐加载中">
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
          ) : hot.length ? (
            <div className={grid}>
              {hot.map((b) => (
                <BookCard key={b.id} book={b} />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm" style={{ color: TEXT_LIGHT }}>
              暂无热门书籍
            </p>
          )}
        </section>

        {/* ============ .sort-section 分类排行榜(真站 2/3 列 ranking-module 白卡) ============ */}
        <section className="mb-8">
          <h2 className="hjw-pagetitle mb-5 flex items-center gap-2 text-[21px] font-semibold" style={{ color: TEXT }} aria-label="分类排行榜">
            <ListOrdered className="h-5 w-5" style={{ color: SECONDARY }} aria-hidden />
            分类排行榜
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rankingModules.map(({ cat, arr }) => (
              <div key={cat} className="overflow-hidden rounded-[10px] border bg-white transition-shadow duration-300" style={{ borderColor: BORDER, boxShadow: SHADOW }}>
                {/* .ranking-module-title(:before 3×16 蓝竖条由 css 承担) */}
                <div className="hjw-module-title flex items-center gap-2 border-b px-4 py-3.5 text-[18px] font-semibold" style={{ background: BG_TINT, borderColor: BORDER, color: TEXT }}>
                  {cat}小说榜
                </div>
                <ul>
                  {arr.map((b, i) => (
                    <li key={b.id} className="flex items-center gap-3 border-b px-4 py-2 last:border-b-0" style={{ borderColor: BORDER }}>
                      <span className="w-4 shrink-0 text-center text-[13px] font-medium" style={{ color: i < 3 ? SECONDARY : TEXT_LIGHT }} aria-hidden>
                        {i + 1}
                      </span>
                      <button
                        type="button"
                        {...bookNavProps(navigate, b.id)}
                        className="hjw-ranking-title min-w-0 flex-1 truncate text-left text-[16px] font-medium"
                        style={{ color: TEXT }}
                        aria-label={`查看《${b.name}》详情`}
                      >
                        {b.name}
                      </button>
                      <span className="max-w-[100px] shrink-0 truncate text-[14px]" style={{ color: TEXT_LIGHT }}>
                        {b.author}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ============ .update-section 最新更新(同款 book-card 网格) ============ */}
        <section className="mb-4">
          <h2 className="hjw-pagetitle mb-5 flex items-center gap-2 text-[21px] font-semibold" style={{ color: TEXT }} aria-label="最新更新">
            <Clock className="h-5 w-5" style={{ color: SECONDARY }} aria-hidden />
            最新更新
          </h2>
          {loading && !books.length ? (
            <div className={grid} aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-[10px] border bg-white p-4" style={{ borderColor: BORDER }}>
                  <Sk className="mb-2 h-4 w-1/2" />
                  <Sk className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          ) : updated.length ? (
            <div className={grid}>
              {updated.map((b) => (
                <BookCard key={b.id} book={b} />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm" style={{ color: TEXT_LIGHT }}>
              暂无更新
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
