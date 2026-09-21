// ============================================================
// [R39-2g] qb23 克隆首页 —— 快照 home.html(2026-09-18 直连实抓 45KB) + style.css 125.8KB
//   真站结构(main.wrapper#main > .content > .list > .box > .module):
//     .module-list.module-lines-list > .module-items > .module-item(封面卡):
//       .module-item-cover > .module-item-pic(圆角 5, hover 黑罩+白圆播放钮) +
//       .module-item-caption(底部渐变黑罩: span 作者/分类) + .module-item-titlebox >
//       a.module-item-title(主红 #ff2a14 700) + .module-item-text(作者灰)
//   降级: 真站首页多板块(今日推荐/限免/完本) → 平台契约单 books 流, 以「今日推荐」「热门榜单」
//     「最新上架」三板块复刻 mxone 卡片墙节奏(推断级)
// [R51-3-c] 补回导出 QbGridCard(R28-2c-2 代次件): 排行榜页(Ranking.tsx)自本文件单处引用
//   (真站 /top.html 与首页同款 module-item 卡) —— 实现按 R28-2c-2 原版逐字节回搬。
// ============================================================
'use client'

import { useMemo } from 'react'
import type { SiteHomeProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk, bookNavProps } from '../../bits'
import type { BookItem } from '../../types'

/** [R28-2c-2] QbGridCard 专用色值段(style.css 实测, 仅该卡消费) */
const QB_MUT40 = 'rgba(0,0,0,0.4)' // .module-item-text
const QB_TOP_BG = ['#e50914', '#f73', '#ffa82e', '#9e9e9e'] // .module-item-top::after(top1~3/其余)
const QB_IMPACT = '"Impact", "system-ui", "Helvetica Neue", sans-serif' // .module-item-top 字族

/** [R28-2c-2] .module-item —— 斜角序号封面卡(首页/今日热榜核心卡型, 结构对齐真站 DOM; rank=-1 无角标) */
export function QbGridCard({ book, rank }: { book: BookItem; rank: number }) {
  const { navigate } = usePublic()
  const noRank = rank < 0
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
        {/* .module-item-top: 45° 斜角色块 + Impact 白字序号(左上角标; 真站 text-indent 9px/30px/700) */}
        {!noRank && (
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
        )}
        {/* .module-item-caption: 底部渐变条 + tag 片(≤559px 由 index.css 隐藏, 对齐真站) */}
        <div className="qb23-caption absolute inset-x-0 bottom-0 z-[1] flex h-11 items-center px-3">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.68), transparent)' }}
          />
          {book.category && (
            <span className="relative z-[1] max-w-[84px] truncate rounded-[5px] bg-black/50 px-[5px] text-xs leading-5 text-[#c2c6d0]">
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
      {/* .module-item-text(真站为作者名) */}
      <p className="mt-[3px] truncate text-center text-[13px] max-sm:mt-px max-sm:text-xs max-sm:text-[#aaadb5]" style={{ color: QB_MUT40 }}>
        {book.author}
      </p>
    </div>
  )
}

function QbCard({ b }: { b: BookItem }) {
  const { site, navigate } = usePublic()
  return (
    <div className="qb-module-item">
      <div className="qb-module-item-cover">
        <div className="qb-module-item-pic">
          <a
            href={viewToUrl({ view: 'book', bookId: b.id }, site.id)}
            onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}
            aria-label={b.name}
          >
            <BookCover cover={b.cover} name={b.name}  className="qb-cover" />
          </a>
          <div className="qb-module-item-caption">
            <span>{b.author}</span>
            <span>{b.category || '小说'}</span>
          </div>
        </div>
      </div>
      <div className="qb-module-item-titlebox">
        <a
          className="qb-module-item-title"
          href={viewToUrl({ view: 'book', bookId: b.id }, site.id)}
          onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}
        >{b.name}</a>
        <div className="qb-module-item-text">{b.author}</div>
      </div>
    </div>
  )
}

function QbSection({ title, books, loading, count }: { title: string; books: BookItem[]; loading: boolean; count?: number }) {
  const list = count ? books.slice(0, count) : books
  return (
    <div className="qb-list">
      <div className="qb-box">
        <div className="qb-blocktitle">{title}</div>
        <div className="qb-module">
          {loading ? (
            <div className="qb-module-items">
              {Array.from({ length: 6 }).map((_, i) => <Sk key={i} style={{ height: 220, borderRadius: 5 }} />)}
            </div>
          ) : list.length === 0 ? (
            <ErrorState message="暂无数据" />
          ) : (
            <div className="qb-module-items">
              {list.map((b) => <QbCard key={b.id} b={b} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function Qb23Home({ books, loading }: SiteHomeProps) {
  const hot = useMemo(() => [...books].sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0)), [books])
  return (
    <>
      <main className="qb-wrapper">
        <div className="qb-content">
          <QbSection title="今日推荐" books={books} loading={loading} count={12} />
          <QbSection title="热门榜单" books={hot} loading={loading} count={6} />
          <QbSection title="最新上架" books={books} loading={loading} count={12} />
        </div>
      </main>
      {/* [R46-2b-4] #friendlink 友链区块: 源站首页 main 之后/footer 之前(wrapper.hidden-xs >
          .content > h2「友情链接：」, 空列表仅标签行) —— 样式见 index.ts .qb-friendlink 段
          (实测 padding 15px 0 + ::after 顶 1px #eaedf1 半像素线全宽 + h2 14px 700); hidden-xs
          语义 → hidden sm:block(R41 口径); 版心 .qb-friendlink-in 取 .qb-wrapper 同款几何 */}
      <div className="qb-friendlink hidden sm:block">
        <div className="qb-friendlink-in">
          <h2>友情链接：</h2>
        </div>
      </div>
    </>
  )
}
