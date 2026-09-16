// ============================================================
// [R28-2c] ggd66(格格党) 分类/书库页克隆 —— 基础五视图之 Category
// 真站快照(R28 实测): /tmp/r28-2c/ggd66/ggd66-sort.html(https://www.ggd66.com/sort/ 直抓, 15.3KB)
//
// 真站 DOM(.container > .class + .content.book#fengtui):
//   ├ .class                    分类导航白盒(边 1px #ccc/圆角 4px; li 两列浮动 11.111%=8 列/16px 居中;
//   │                           a #00886d; 真站无当前分类高亮 → 模板补 #f50 加粗增强态, 注释声明)
//   ├ .content.book#fengtui     h2.text-center 「{分类}小说列表」(真站文案「全部小说小说列表」= 分类名拼接)
//   │                           + .bookbox×10(三列 31.333%/margin 1%):
//   │                             .p10(1px dashed #ccc; :hover 边 #f50) > .num 序号角标(abs 顶 50%/左 10px/
//   │                             22px 见方/圆角 4px/底 #56ccb5/字 #eee 700; :hover 底 #f50)
//   │                             .bookinfo(pl 30px): h4.bookname a(#00886d 16px 700);
//   │                             .author×2(作者：X/字数：N万字); .cat(更新到：最新章节链);
//   │                             .update(简介：…) — 真站第三行「阅读量：N」无数据契约 → 以分类名替代, 注释声明
//   │                             .delbutton(abs 右 10px): a 阅读(边 #56ccb5 圆角 3px 字 #56ccb5; hover #f50)
//   └ .pages                    分页(a: 35px 见方/边 1px #e6e6e6/圆角 3px/margin 2px; hover/strong 底 #56ccb5 白字)
// 响应式: ≤sm 两列/移动单列(真站浮动布局 375px 仍三列挤压, 模板按可读性降列, 声明)。
// GgdPages/GgdBookBox 导出供 Fulltext.tsx/Search.tsx 复用(真站完本页/搜索页同款 bookbox 模板)。
// ============================================================
'use client'

import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { useEffect, useState } from 'react'
import { fetchCategories } from '../../data'
import type { BookItem, CategoryItem } from '../../types'
import { ErrorState, Sk, bookNavProps } from '../../bits'
import { formatWords } from '../../seo'

/** [R28-2c-8] 真站实测色值(ggd66-style.css) */
export const GGD_TEAL = '#56ccb5'
export const GGD_GREEN_LINK = '#00886d'
export const GGD_TEXT_BODY = '#888'
export const GGD_LINE = '#ccc'

/** [R28-2c-9] .pages 分页(真站形态: << strong 当前页 数字 >>; a hover 底 #56ccb5) */
export function GgdPages({ page, totalPages, onGo }: { page: number; totalPages: number; onGo: (p: number) => void }) {
  if (totalPages <= 1) return null
  const start = Math.max(1, Math.min(page - 4, totalPages - 9))
  const nums = Array.from({ length: Math.min(10, totalPages) }, (_, i) => start + i)
  const cell = 'ggd-pg m-[2px] inline-flex h-[35px] min-w-[35px] items-center justify-center rounded-[3px] border px-1 text-[14px]'
  return (
    <nav aria-label="分页" className="ggd-pages flex flex-wrap items-center justify-center py-2.5 text-center">
      {page > 1 && (
        <button type="button" onClick={() => onGo(1)} className={cell} aria-label="第一页">
          &lt;&lt;
        </button>
      )}
      {page > 1 && (
        <button type="button" onClick={() => onGo(page - 1)} className={cell} aria-label="上一页">
          &lt;
        </button>
      )}
      {nums.map((n) =>
        n === page ? (
          <strong key={n} className={cell} aria-current="page">
            {n}
          </strong>
        ) : (
          <button key={n} type="button" onClick={() => onGo(n)} className={cell} aria-label={`第 ${n} 页`}>
            {n}
          </button>
        ),
      )}
      {page < totalPages && (
        <button type="button" onClick={() => onGo(page + 1)} className={cell} aria-label="下一页">
          &gt;
        </button>
      )}
      {page < totalPages && (
        <button type="button" onClick={() => onGo(totalPages)} className={cell} aria-label="最后一页">
          &gt;&gt;
        </button>
      )}
    </nav>
  )
}

/** [R28-2c-10] .bookbox 列表卡(书库/完本/搜索热榜通用卡型; no=序号) */
export function GgdBookBox({ book, no }: { book: BookItem; no: number }) {
  const { navigate } = usePublic()
  return (
    <div className="ggd-bookbox relative">
      <div className="ggd-p10 h-full overflow-hidden rounded-[4px] border border-dashed p-2.5 pl-9" style={{ borderColor: GGD_LINE }}>
        <span
          className="ggd-num absolute left-2.5 top-1/2 mt-[-12px] block h-6 w-[22px] rounded-[4px] text-center text-[13px] font-bold leading-6"
          style={{ background: GGD_TEAL, color: '#eee' }}
          aria-hidden
        >
          {no}
        </span>
        <div className="pl-0.5">
          <h4 className="mb-0.5 truncate text-[16px] font-bold leading-snug">
            <button
              type="button"
              {...bookNavProps(navigate, book.id)}
              className="max-w-full truncate text-left"
              style={{ color: GGD_GREEN_LINK }}
              aria-label={`查看《${book.name}》详情`}
            >
              {book.name}
            </button>
          </h4>
          <div className="truncate text-[14px]">作者：{book.author}</div>
          {/* 真站第三行「阅读量：N」无数据契约 → 分类名替代(声明) */}
          <div className="truncate text-[14px]">分类：{book.category || '—'}</div>
          <div className="truncate text-[14px]">字数：{formatWords(book.wordCount)}</div>
          <div className="truncate text-[14px]">
            <span>更新到：</span>
            <button
              type="button"
              onClick={() => navigate({ view: 'book', bookId: book.id })}
              className="truncate hover:underline"
              style={{ color: GGD_GREEN_LINK }}
              aria-label={`查看《${book.name}》最新章节`}
            >
              {book.latestChapter || '—'}
            </button>
          </div>
          <div className="ggd-update mt-0.5 line-clamp-2 text-[14px] leading-[20px]">
            <span>简介：</span>
            {book.intro || '暂无简介'}
          </div>
        </div>
        <div className="absolute right-2.5 top-1/2 mt-[-12px]">
          <button
            type="button"
            onClick={() => navigate({ view: 'book', bookId: book.id })}
            className="ggd-readbtn rounded-[3px] border px-2.5 py-1 text-[14px] transition-colors"
            style={{ borderColor: GGD_TEAL, color: GGD_TEAL }}
            aria-label={`阅读《${book.name}》`}
          >
            阅读
          </button>
        </div>
      </div>
    </div>
  )
}

export function Ggd66Category({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()

  // [R28-2c-11] .class 分类导航条(fetchCategories; 真站 8 分类 11.111% 等分)
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
      <div className="mx-auto w-[90%] max-w-[1200px] py-10">
        <ErrorState message="书库加载失败" detail={error} />
      </div>
    )
  }

  const books = data?.books || []
  const total = data?.total || 0
  const size = data?.size || 24
  const totalPages = Math.max(1, Math.ceil(total / size))

  return (
    <div className="mx-auto w-[90%] max-w-[1200px] pb-10" style={{ color: GGD_TEXT_BODY }}>
      {/* ============ .class 分类导航白盒 ============ */}
      <div className="ggd-class mt-2.5 overflow-hidden rounded-[4px] border bg-white">
        {cats === null ? (
          <div className="flex flex-wrap py-1" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <Sk key={i} className="m-1 h-6 w-[11%] min-w-[64px]" />
            ))}
          </div>
        ) : cats.length ? (
          <ul className="flex flex-wrap">
            <li className="w-1/2 py-2.5 text-center text-[16px] sm:w-1/4 lg:w-[11.111%]">
              <button
                type="button"
                onClick={() => navigate({ view: 'category', page: 1 })}
                className="transition-colors hover:text-[#f50]"
                style={{ color: !cat ? '#f50' : GGD_GREEN_LINK, fontWeight: !cat ? 700 : 400 }}
                aria-label="浏览全部分类"
              >
                全部
              </button>
            </li>
            {cats.map((c) => (
              <li key={c.id} className="w-1/2 py-2.5 text-center text-[16px] sm:w-1/4 lg:w-[11.111%]">
                <button
                  type="button"
                  onClick={() => navigate({ view: 'category', cat: c.id, page: 1 })}
                  className="transition-colors hover:text-[#f50]"
                  style={{ color: cat === c.id ? '#f50' : GGD_GREEN_LINK, fontWeight: cat === c.id ? 700 : 400 }}
                  aria-label={`浏览 ${c.name} 分类`}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* ============ .content.book 列表白盒 ============ */}
      <div className="ggd-book mt-2.5 border bg-white px-2.5 pb-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.05)]" style={{ borderColor: GGD_LINE }}>
        <h2 className="ggd-h2 text-center" aria-label={`${catName}小说列表`}>
          {catName}小说列表
        </h2>
        {loading && !books.length ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="书库加载中">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-[4px] border border-dashed p-2.5 pl-10">
                <Sk className="mb-2 h-4 w-3/4" />
                <Sk className="mb-1.5 h-3 w-1/2" />
                <Sk className="mb-1.5 h-3 w-2/3" />
                <Sk className="h-3 w-full" />
              </div>
            ))}
            <span className="sr-only">加载中…</span>
          </div>
        ) : books.length ? (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {books.map((b, i) => (
                // .bookbox: .p10 dashed 白盒(hover #f50) + .num 序号角标(hover #f50)
                <GgdBookBox key={b.id} book={b} no={(page - 1) * size + i + 1} />
              ))}
            </div>
            {/* .pages 分页(真站 2497 页窗口化 ±4) */}
            <GgdPages page={page} totalPages={totalPages} onGo={(p) => navigate({ view: 'category', cat, page: p })} />
          </>
        ) : (
          <p className="py-6 text-center text-sm">该分类暂无书籍</p>
        )}
        <div className="clear-both" />
      </div>
    </div>
  )
}
