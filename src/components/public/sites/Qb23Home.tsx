// ============================================================
// [R24-6-c] 铅笔小说 克隆首页 —— 按 https://www.23qb.net/ 首页真站结构 1:1 还原。
// 真站结构(样本 /tmp/sites/23qb-home.html + mxstatic/css/style.css 实测):
//   main#main.wrapper > .content > .list
//     ├ .box(白卡 18px 圆角/25px 内距/0 7px 21px rgba(149,157,165,.22) 大投影)
//     │   └ .module > .module-lines-list > .module-items > .module-item×N
//     │       ├ .module-item-cover(140% 高封面/5px 圆角/径向暗角 ::before)
//     │       │   ├ .module-item-top  角标序号(Impact 30px 白字 + 45° 斜角色块:
//     │       │   │   top1 #e50914 / top2 #f73 / top3 #ffa82e / 其余 #9e9e9e)
//     │       │   ├ .module-item-pic  封面图
//     │       │   └ .module-item-caption  底部渐变条(黑 51% 半透明 tag 片 #c2c6d0)
//     │       ├ .module-item-titlebox  书名(居中/加粗)
//     │       └ .module-item-text      作者(居中/40% 黑)
//     └ .list-item×12  分类榜单列(inline-block/1px #f5f5f5 边/4px 圆角)
//         ├ .item-title  栏头(#ECEEF1 底/60px 高/22px 字/火焰 icon)
//         └ .item×10     榜单行(01/02/03 彩色序号 #fc4274/#ff8155/#fcb80a,
//                        其余 #b0b0b0; 书名 hover #ff2a14)
// 数据口径: 网格 = 字数最多(点击榜)前 10; 榜单 = 最新 48 本按分类分组取 12 列×10 行。
// 颜色均为真站 CSS 实测硬编码; 桌面 5 列/≤899 5 列小距/≤559 3 列隐藏 caption 同真站断点。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import { Flame } from 'lucide-react'
import type { SiteHomeProps } from './shared'
import { usePublic } from '../ctx'
import { fetchBooks } from '../data'
import type { BookItem } from '../types'
import { BookCover } from '../BookCover'
import { Sk, bookNavProps } from '../bits'

/** [R24-6-c-6] 真站实测色值常量(23qb /mxstatic/css/style.css) */
const QB_TEXT = '#282828'
const QB_MUTED = 'rgba(0,0,0,0.4)'
const QB_RANK_1 = '#fc4274'
const QB_RANK_2 = '#ff8155'
const QB_RANK_3 = '#fcb80a'
const QB_RANK_REST = '#b0b0b0'
const QB_TOP_BG = ['#e50914', '#f73', '#ffa82e', '#9e9e9e'] // module-item-top 斜角色块(top1~3/其余)
const QB_IMPACT = '"Impact", "system-ui", "Helvetica Neue", sans-serif'

/** [R24-6-c-7] module-item —— 带角标序号的封面卡(真站首页核心卡型) */
function QbModuleItem({ book, rank }: { book: BookItem; rank: number }) {
  const { navigate } = usePublic()
  return (
    <div className="group">
      {/* .module-item-cover: padding-top 140% 撑高, 径向暗角覆盖 */}
      <div
        {...bookNavProps(navigate, book.id)}
        aria-label={`查看《${book.name}》详情`}
        className="relative w-full cursor-pointer overflow-hidden rounded-[5px] pt-[140%] transition-shadow duration-300"
      >
        {/* ::before 径向暗角(hover 加深) */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] opacity-10 transition-opacity group-hover:opacity-100"
          style={{ background: 'radial-gradient(transparent 0%, rgba(0,0,0,0.1) 44%, rgba(0,0,0,0.56) 100%)' }}
        />
        {/* 封面图(.module-item-pic) */}
        <div className="absolute inset-0">
          <BookCover name={book.name} cover={book.cover} showAuthor={book.author} style={{ borderRadius: 0 }} />
        </div>
        {/* 序号角标(.module-item-top): 45° 斜角色块 + Impact 白字 */}
        <span aria-hidden className="absolute left-0 top-0 z-[2] block h-[42px] w-[46px] overflow-hidden rounded-[8px]">
          <span
            className="absolute -left-[26px] -top-[26px] z-[-1] block h-[56px] w-[56px] rotate-45 rounded-[12px]"
            style={{ background: QB_TOP_BG[Math.min(rank, 3)] }}
          />
          <span
            className="absolute left-[8px] top-[2px] text-[24px] font-bold text-white sm:text-[30px] sm:leading-[36px]"
            style={{ fontFamily: QB_IMPACT, textShadow: '1px 1px 0 rgba(0,0,0,0.1)', textIndent: '2px' }}
          >
            {rank + 1}
          </span>
        </span>
        {/* 底部渐变 caption(真站 ≤559px 隐藏): tag 片 = 作者 / 分类 */}
        <div className="absolute inset-x-0 bottom-0 z-[1] flex h-11 items-center px-3 max-sm:hidden">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.68), transparent)' }}
          />
          <span className="relative z-[1] max-w-[84px] truncate rounded-[5px] bg-black/50 px-[5px] py-0 text-xs leading-5 text-[#c2c6d0]">
            {book.author}
          </span>
          <span className="relative z-[1] ml-[5px] max-w-[64px] truncate rounded-[5px] bg-black/50 px-[5px] py-0 text-xs leading-5 text-[#c2c6d0]">
            {book.category}
          </span>
        </div>
      </div>
      {/* 书名(.module-item-titlebox) */}
      <div className="mt-3 text-center max-sm:mt-[7px]">
        <button
          type="button"
          onClick={() => navigate({ view: 'book', bookId: book.id })}
          className="block w-full truncate text-sm font-bold text-[#282828] transition-colors hover:text-[#ff2a14] max-sm:font-normal"
          aria-label={`查看《${book.name}》详情`}
        >
          {book.name}
        </button>
      </div>
      {/* 作者(.module-item-text) */}
      <p className="mt-[3px] truncate text-center text-[13px] max-sm:mt-px max-sm:text-xs" style={{ color: QB_MUTED }}>
        {book.author}
      </p>
    </div>
  )
}

/** [R24-6-c-8] list-item 分类榜单列(栏头 #ECEEF1 + 10 行彩色序号榜单) */
function QbRankList({ title, items }: { title: string; items: BookItem[] }) {
  const { navigate } = usePublic()
  if (!items.length) return null
  return (
    <section className="overflow-hidden rounded-[4px] border border-[#f5f5f5]" aria-label={`${title}排行榜`}>
      <h3 className="flex h-[52px] items-center bg-[#ECEEF1] text-lg font-normal text-[#282828] sm:h-[60px] sm:text-[22px]">
        <Flame className="ml-5 mr-2 h-5 w-5 text-[#ff2a14] sm:ml-6" aria-hidden />
        <span className="truncate">{title}</span>
      </h3>
      <ul style={{ listStyle: 'none' }}>
        {items.map((b, i) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => navigate({ view: 'book', bookId: b.id })}
              aria-label={`查看《${b.name}》详情`}
              className="group flex w-full items-center overflow-hidden py-[13px] text-base sm:py-[15px]"
            >
              <span
                className="ml-5 mr-[14px] w-6 shrink-0 text-right font-bold tabular-nums sm:ml-6 sm:mr-[21px]"
                style={{ color: i === 0 ? QB_RANK_1 : i === 1 ? QB_RANK_2 : i === 2 ? QB_RANK_3 : QB_RANK_REST }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="truncate text-[15px] leading-4 text-[#282828] transition-colors group-hover:text-[#ff2a14] sm:text-base">
                {b.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Qb23Home({ books, loading }: SiteHomeProps) {
  const { site } = usePublic()

  // [R24-6-c-9] 维度: 字数最多(点击榜)喂封面网格; 分类榜单由最新 48 本(props.books)分组。
  const [hot, setHot] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 10 })
      .then((d) => {
        if (alive) setHot(d.books || [])
      })
      .catch(() => {
        if (alive) setHot([]) // 失败静默: 回退 props.books
      })
    return () => {
      alive = false
    }
  }, [site.id])

  const gridBooks: BookItem[] = hot && hot.length ? hot : books.slice(0, 10)

  // 最新 48 本按 categoryId 分组 → 榜单列(每组按字数降序, 前 10; 组按收录量取前 12)
  const groups = new Map<string, { name: string; items: BookItem[] }>()
  for (const b of books) {
    const key = b.categoryId || b.category || 'other'
    const g = groups.get(key)
    if (g) g.items.push(b)
    else groups.set(key, { name: b.category || '其他', items: [b] })
  }
  const rankLists = [...groups.values()]
    .map((g) => ({ name: g.name, items: [...g.items].sort((a, b) => b.wordCount - a.wordCount).slice(0, 10) }))
    .sort((a, b) => b.items.length - a.items.length)
    .slice(0, 12)

  return (
    <div className="w-full pb-14" style={{ color: QB_TEXT }}>
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        {/* ============ .box 白卡: module-item 封面网格(真站大投影/18px 圆角) ============ */}
        <div className="rounded-[18px] bg-white p-4 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-[25px]">
          <div
            className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-5 sm:gap-x-5 sm:gap-y-5"
            aria-label="热门点击榜"
          >
            {loading && hot === null
              ? Array.from({ length: 10 }).map((_, i) => (
                  <div key={`sk-${i}`} className={i === 9 ? 'max-sm:hidden' : undefined} aria-hidden>
                    <div className="w-full pt-[140%]">
                      <Sk className="h-full w-full rounded-[5px]" />
                    </div>
                    <Sk className="mx-auto mt-3 h-4 w-4/5" style={{ borderRadius: 4 }} />
                    <Sk className="mx-auto mt-1.5 h-3 w-2/5" style={{ borderRadius: 4 }} />
                  </div>
                ))
              : gridBooks.map((b, i) => (
                  <div key={b.id} className={i === 9 ? 'max-sm:hidden' : undefined}>
                    <QbModuleItem book={b} rank={i} />
                  </div>
                ))}
          </div>
        </div>

        {/* ============ .list-item×12 分类榜单列(桌面 4 列/平板 2 列/手机 1 列) ============ */}
        <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {loading && !books.length
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-[4px] border border-[#f5f5f5]" aria-hidden>
                  <Sk className="h-[52px] w-full rounded-none sm:h-[60px]" />
                  <div className="space-y-4 py-4">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <Sk key={j} className="ml-14 h-4 w-2/3" style={{ borderRadius: 4 }} />
                    ))}
                  </div>
                </div>
              ))
            : rankLists.map((g) => <QbRankList key={g.name} title={g.name} items={g.items} />)}
        </div>
      </div>
    </div>
  )
}
