// ============================================================
// [R26-4] qb23 铅笔小说(www.23qb.net) 首页克隆 —— 5 页型之 Home
// 真站快照: /tmp/r26/probe-www.23qb.net.html(首页) + /tmp/r26/qb23-style.css(/mxstatic/css/style.css 直抓)
// 真站 DOM: body.homepage > header#header.wrapper > main#main.wrapper > .content > .list
//   ├ .box(白卡 padding 25px / radius 18px / shadow 0 7px 21px rgba(149,157,165,.22))
//   │   └ .module > .module-list.module-lines-list > .module-items > .module-item×16(真站 1740 版心 8×2;
//   │       本克隆版心 1152px, 取 15 本 = 5×3, 卡宽 ~204px 对齐真站 .module-item 200px)
//   │       ├ .module-item-cover(padding-top 140% / radius 5px / ::before 径向暗角 opacity .1→hover 1)
//   │       │   ├ .module-item-top  斜角序号(Impact 900 30px 白字 + 45° 色块 top1 #e50914 top2 #f73 top3 #ffa82e 余 #9e9e9e)
//   │       │   ├ .module-item-pic  封面图
//   │       │   └ .module-item-caption(高 44px padding 12px 底部渐变, span bg rgba(0,0,0,.51) 色 #c2c6d0; ≤559px display:none)
//   │       ├ .module-item-titlebox(margin-top 12px 居中, .module-item-title 700)
//   │       └ .module-item-text(居中, rgba(0,0,0,.4))
//   └ .list-item×12 分类榜单列(.item-title #ECEEF1 底/1px #f5f5f5 底线/高 60px/22px 400 + icon-hot 火焰;
//       .item 行 padding 15px 0 16px 16px 字号; 序号 .one #fc4274 .two #ff8155 .three #fcb80a 余默认;
//       hover 行底 #fff + .keyword #ff2a14)
// 真站 CSS 实测色板(style.css): body #f8f9f9 / 文字 #282828 / a hover #ff2a14 / 边线 #eaedf1 /
//   灰钮底 #f3f5f7 / 斑马行 #f7f8f9 / 暖杏 chip #fef0e5(hover #fde6dd) / 绿 #34a853 / 橙 #ff9800
// 数据口径: 封面网格 = 字数最多 15 本(点击榜代理, fetchBooks sort:words); 榜单 = props.books(最新 48)+
//   字数 60 合并去重后按分类分组, 组内按字数降序取前 10, 收录量前 12 组 —— 与旧 Qb23Home 口径一致。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import { Flame } from 'lucide-react'
import type { SiteHomeProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import type { BookItem } from '../../types'
import { BookCover } from '../../BookCover'
import { Sk, bookNavProps } from '../../bits'

/** [R26-4-1] 真站 /mxstatic/css/style.css 实测色值(仅 qb23 克隆组件消费, 硬编码) */
const QB_TEXT = '#282828'
const QB_MUT40 = 'rgba(0,0,0,0.4)' // .module-item-text
const QB_RED = '#ff2a14' // a:hover / 关键词 hover
const QB_RANK_1 = '#fc4274' // .list-item .one
const QB_RANK_2 = '#ff8155' // .two
const QB_RANK_3 = '#fcb80a' // .three
const QB_RANK_REST = '#b0b0b0' // 默认序号(旧版实测, style.css 未单列, 与 .order 默认色一致)
const QB_TOP_BG = ['#e50914', '#f73', '#ffa82e', '#9e9e9e'] // .module-item-top::after(top1~3/其余)
const QB_IMPACT = '"Impact", "system-ui", "Helvetica Neue", sans-serif' // .impact/.module-item-top 字族

/** [R26-4-2] .module-item —— 斜角序号封面卡(首页网格核心卡型, 结构对齐真站 DOM) */
function QbGridCard({ book, rank }: { book: BookItem; rank: number }) {
  const { navigate } = usePublic()
  return (
    <div className="group">
      {/* .module-item-cover: padding-top 140% 撑高 + .qb23-cover 复用 index.css 的 ::before 径向暗角 */}
      <div
        {...bookNavProps(navigate, book.id)}
        aria-label={`查看《${book.name}》详情`}
        className="qb23-cover relative w-full cursor-pointer overflow-hidden rounded-[5px] pt-[140%] transition-shadow duration-300"
      >
        {/* .module-item-pic 封面图 */}
        <div className="absolute inset-0">
          <BookCover name={book.name} cover={book.cover} showAuthor={book.author} style={{ borderRadius: 0 }} />
        </div>
        {/* .module-item-top: 45° 斜角色块 + Impact 白字序号(左上角标) */}
        <span aria-hidden className="absolute left-0 top-0 z-[2] block h-[42px] w-[46px] overflow-hidden rounded-[8px]">
          <span
            className="absolute -left-[26px] -top-[26px] z-[-1] block h-[56px] w-[56px] rotate-45 rounded-[12px]"
            style={{ background: QB_TOP_BG[Math.min(rank, 3)] }}
          />
          <span
            className="absolute left-[8px] top-[2px] text-[24px] leading-[36px] font-black text-white sm:text-[30px]"
            style={{ fontFamily: QB_IMPACT, textShadow: '1px 1px 0 rgba(0,0,0,0.1)', textIndent: '2px' }}
          >
            {rank + 1}
          </span>
        </span>
        {/* .module-item-caption: 底部渐变条 + tag 片(≤559px 由 index.css 隐藏, 对齐真站) */}
        <div className="qb23-caption absolute inset-x-0 bottom-0 z-[1] flex h-11 items-center px-3">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.68), transparent)' }}
          />
          <span className="relative z-[1] max-w-[84px] truncate rounded-[5px] bg-black/50 px-[5px] text-xs leading-5 text-[#c2c6d0]">
            {book.author}
          </span>
          {book.category && (
            <span className="relative z-[1] ml-[5px] max-w-[64px] truncate rounded-[5px] bg-black/50 px-[5px] text-xs leading-5 text-[#c2c6d0]">
              {book.category}
            </span>
          )}
        </div>
      </div>
      {/* .module-item-titlebox / .module-item-title */}
      <div className="mt-3 max-sm:mt-[7px]">
        <button
          type="button"
          onClick={() => navigate({ view: 'book', bookId: book.id })}
          className="block w-full truncate text-center text-sm font-bold text-[#282828] transition-colors hover:text-[#ff2a14] max-sm:font-normal"
          aria-label={`查看《${book.name}》详情`}
        >
          {book.name}
        </button>
      </div>
      {/* .module-item-text */}
      <p className="mt-[3px] truncate text-center text-[13px] max-sm:mt-px max-sm:text-xs max-sm:text-[#aaadb5]" style={{ color: QB_MUT40 }}>
        {book.author}
      </p>
    </div>
  )
}

/** [R26-4-3] .list-item 分类榜单列(栏头 #ECEEF1 + 彩色序号 10 行) */
function QbRankColumn({ title, items }: { title: string; items: BookItem[] }) {
  const { navigate } = usePublic()
  if (!items.length) return null
  return (
    <section className="overflow-hidden rounded-[4px] border border-[#f5f5f5]" aria-label={`${title}排行榜`}>
      {/* .item-title: #ECEEF1 底 + 1px #f5f5f5 底线, 高 60px 22px 400, 火焰 icon 左距 24px */}
      <h3 className="flex h-[52px] items-center border-b border-[#f5f5f5] bg-[#ECEEF1] text-lg font-normal sm:h-[60px] sm:text-[22px]">
        <Flame className="ml-5 mr-2 h-5 w-5 sm:ml-6" style={{ color: QB_RED }} aria-hidden />
        <span className="truncate">{title}</span>
      </h3>
      <ul style={{ listStyle: 'none' }}>
        {items.map((b, i) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => navigate({ view: 'book', bookId: b.id })}
              aria-label={`查看《${b.name}》详情`}
              className="group flex w-full items-center overflow-hidden bg-transparent py-[13px] text-base transition-colors hover:bg-white sm:py-[15px]"
            >
              {/* .order 序号: .one/.two/.three 彩色, 其余灰 */}
              <span
                className="ml-5 mr-[14px] w-6 shrink-0 text-right font-bold tabular-nums sm:ml-6 sm:mr-[21px]"
                style={{ color: i === 0 ? QB_RANK_1 : i === 1 ? QB_RANK_2 : i === 2 ? QB_RANK_3 : QB_RANK_REST }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              {/* .keyword: hover #ff2a14(色彩走 class 保 hover 可覆盖) */}
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

  // [R26-4-4] 一维数据: 字数榜 60 本(封面网格前 15 + 榜单分组池), 与 props.books(最新 48)合并去重
  const [pool, setPool] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 60 })
      .then((d) => {
        if (alive) setPool(d.books || [])
      })
      .catch(() => {
        if (alive) setPool([]) // 失败静默: 回退 props.books
      })
    return () => {
      alive = false
    }
  }, [site.id])

  const merged = pool && pool.length ? pool : books
  const seen = new Set<string>()
  const all: BookItem[] = []
  for (const b of [...merged, ...books]) {
    if (seen.has(b.id)) continue
    seen.add(b.id)
    all.push(b)
  }
  // 封面网格: 字数前 15(真站 16 本 8×2, 1152 版心 5×3 取 15 保证整行)
  const gridBooks = all.slice(0, 15)
  const gridReady = Boolean(pool) || !loading

  // 分类榜单: 按 categoryId 分组 → 组内字数降序取 10 → 收录量前 12 组
  const groups = new Map<string, { name: string; items: BookItem[] }>()
  for (const b of all) {
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
      {/* 版心: 真站 .content max-width 1740px, 此处收窄 1152px 与站内 qb 头部版心一致(头身对齐优先) */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        {/* ============ .box 白卡: module-items 封面网格(18px 圆角 + 大投影) ============ */}
        <div className="rounded-[18px] bg-white p-4 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-[25px]">
          <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-5 sm:gap-x-5 sm:gap-y-5" aria-label="热门点击榜">
            {loading && !gridReady
              ? Array.from({ length: 15 }).map((_, i) => (
                  <div key={`sk-${i}`} aria-hidden>
                    <div className="w-full pt-[140%]">
                      <Sk className="h-full w-full rounded-[5px]" />
                    </div>
                    <Sk className="mx-auto mt-3 h-4 w-4/5" style={{ borderRadius: 4 }} />
                    <Sk className="mx-auto mt-1.5 h-3 w-2/5" style={{ borderRadius: 4 }} />
                  </div>
                ))
              : gridBooks.map((b, i) => <QbGridCard key={b.id} book={b} rank={i} />)}
          </div>
          {!loading && !gridBooks.length && (
            <p className="py-16 text-center text-sm" style={{ color: QB_MUT40 }}>
              暂无书籍数据
            </p>
          )}
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
            : rankLists.map((g, gi) => <QbRankColumn key={`${g.name}-${gi}`} title={g.name} items={g.items} />)}
        </div>
      </div>
    </div>
  )
}
