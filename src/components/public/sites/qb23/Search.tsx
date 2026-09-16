// ============================================================
// [R28-2c] qb23 铅笔小说(www.23qb.net) 搜索结果页克隆 —— 扩展视图之 Search
// 真站快照(R28 实测): /tmp/r28-2c/qb23/qb23-search.html(/search.html?searchkey=问鼎 直抓)
// 真站 DOM: main#main > .content
//   ├ #search-content > form(action=/search.html) > .search-main > .search-box
//   │   ├ input.search-input(name=searchkey, placeholder 搜索喜欢的小说、作者、标签)
//   │   ├ a.search-btn.search-cupfox(今日热榜入口 → /top.html; 克隆映射 navigate ranking)
//   │   └ button.search-btn.search-go(搜索 icon 钮)
//   ├ .search-stat(居中): h1(38px/700 = 关键词) + h2(14px rgba(0,0,0,.68)「搜索『q』，发现 N 本你要找的小说」)
//   └ .module > .module-items > .module-search-item×N
//       (radius 18px / 底 #f7f8f9 / width calc(50% - 20px) / padding 20px / margin 0 20px 20px 0;
//        .novel-cover 155px 左浮; .novel-info: .novel-serial 分类 chip(右浮 顶角 0 18px 0 10px, 底 #eaedf1
//        字 rgba(0,0,0,.4)) + h3 书名链 + .novel-info-aux tag-link 分类 + 简介)
// 降级/推断说明: ①真站搜索框今日热门下拉(ac_hot)为站方热词接口 → 不复刻;
//   ②真站结果无相关搜索词 → SearchData.relatedTags 不渲染;
//   ③novel-serial 顶角 chip 位置真站为右浮负 margin 悬于卡角 → 简化为行内首片(视觉同族)。
// ============================================================
'use client'

import { useState } from 'react'
import { Search as SearchIcon, TrendingUp } from 'lucide-react'
import type { SiteSearchProps } from '../shared'
import { usePublic } from '../../ctx'
import type { BookItem } from '../../types'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk, bookNavProps } from '../../bits'

/** [R28-2c-24] 真站实测色值(style.css) */
const QB_TEXT = '#282828'
const QB_MUT40 = 'rgba(0,0,0,0.4)'
const QB_TXT68 = 'rgba(0,0,0,0.68)'
const QB_TITLE = 'rgba(7,7,10,0.92)'
const QB_ITEM_BG = '#f7f8f9' // .module-search-item 底

/** [R28-2c-25] .module-search-item 结果卡(封面左 155px + 信息右) */
function QbSearchCard({ book }: { book: BookItem }) {
  const { navigate } = usePublic()
  return (
    <div className="qb23-search-item flex rounded-[18px] p-4 sm:p-5" style={{ background: QB_ITEM_BG }}>
      {/* .novel-cover 155px 左浮(真站 float left margin-right 25px) */}
      <div
        {...bookNavProps(navigate, book.id)}
        aria-label={`查看《${book.name}》详情`}
        className="qb23-cover relative w-[110px] shrink-0 cursor-pointer overflow-hidden rounded-[10px] pt-[140%] sm:w-[155px]"
      >
        <div className="absolute inset-0">
          <BookCover name={book.name} cover={book.cover} showAuthor={book.author} style={{ borderRadius: 0 }} />
        </div>
      </div>
      {/* .novel-info */}
      <div className="min-w-0 flex-1 pl-4 sm:pl-6">
        <div className="flex flex-wrap items-center gap-2">
          {/* .novel-serial 分类 chip(真站右浮顶角 → 行内首片, 降级③) */}
          {book.category && (
            <span className="inline-block shrink-0 rounded-[10px] bg-[#eaedf1] px-3 text-xs leading-[28px]" style={{ color: QB_MUT40 }}>
              {book.category}
            </span>
          )}
          {/* h3 书名链 */}
          <h3 className="min-w-0 flex-1 truncate text-base font-bold sm:text-lg">
            <button
              type="button"
              onClick={() => navigate({ view: 'book', bookId: book.id })}
              className="truncate transition-colors hover:text-[#ff2a14]"
              style={{ color: QB_TITLE }}
              aria-label={`查看《${book.name}》详情`}
            >
              {book.name}
            </button>
          </h3>
        </div>
        {/* .novel-info-aux: 作者 + 字数(真站 aux 为 tag-link 分类 chip, 已前置; 补作者/字数满足信息密度) */}
        <p className="mt-1.5 text-xs" style={{ color: QB_MUT40 }}>
          {book.author} · {book.category || '未知分类'}
        </p>
        {/* 简介(真站 .novel-info-main 简介) */}
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed" style={{ color: QB_TXT68 }}>
          {book.intro || '暂无简介'}
        </p>
      </div>
    </div>
  )
}

export function Qb23Search({ q, data, loading, error }: SiteSearchProps) {
  const { navigate } = usePublic()
  // #search-content 搜索框(组件自带 input state + navigate 提交)
  const [kw, setKw] = useState(q)
  const books = data?.books || []

  return (
    <div className="w-full pb-14" style={{ color: QB_TEXT }}>
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        {/* ============ #search-content 搜索框(真站 form action=/search.html name=searchkey) ============ */}
        <form
          role="search"
          className="mx-auto flex max-w-2xl items-center gap-2 pt-2"
          onSubmit={(e) => {
            e.preventDefault()
            const t = kw.trim()
            if (t) navigate({ view: 'search', q: t })
          }}
        >
          <div
            className="flex w-full items-center gap-2 rounded-full px-5 py-2.5"
            style={{ background: '#fff', border: '1px solid #e3e6eb' }}
          >
            <SearchIcon className="h-4 w-4 shrink-0" style={{ color: QB_MUT40 }} aria-hidden />
            <input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              type="search"
              placeholder="搜索喜欢的小说、作者、标签"
              aria-label="搜索喜欢的小说、作者、标签"
              className="w-full bg-transparent text-sm outline-none placeholder:opacity-60"
              style={{ color: QB_TEXT }}
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-[22px] text-sm text-white transition-opacity hover:opacity-85"
            style={{ background: 'linear-gradient(to right, #fc000c 0, #f9444d 100%)' }}
            aria-label="搜索"
          >
            搜索
          </button>
          {/* .search-cupfox 今日热榜入口(真站 /top.html → ranking 视图) */}
          <button
            type="button"
            onClick={() => navigate({ view: 'ranking' })}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-[16px] text-sm transition-colors hover:bg-[#eaedf1]"
            style={{ background: '#f3f5f7', color: QB_TXT68 }}
            aria-label="查看今日热榜"
          >
            <TrendingUp className="h-4 w-4" aria-hidden />
            热榜
          </button>
        </form>

        {/* ============ .search-stat(居中 h1 关键词 + h2 命中数) ============ */}
        <div className="pt-8 text-center">
          <h1 className="text-2xl font-bold sm:text-[38px] sm:leading-[1.3]" style={{ color: QB_TITLE }}>
            {q}
          </h1>
          <h2 className="mt-1 text-sm" style={{ color: QB_TXT68 }}>
            {loading ? '正在搜索…' : `搜索『${q}』，发现 ${books.length} 本你要找的小说`}
          </h2>
        </div>

        {/* ============ .module > .module-search-item×N(两列 → 移动单列) ============ */}
        <div className="pt-6">
          {error ? (
            <ErrorState message="搜索失败" detail={error} />
          ) : loading ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2" aria-label="搜索结果加载中">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex rounded-[18px] p-4 sm:p-5" style={{ background: QB_ITEM_BG }} aria-hidden>
                  <Sk className="h-[154px] w-[110px] shrink-0 rounded-[10px] sm:w-[155px]" />
                  <div className="flex-1 space-y-2 pl-4 sm:pl-6">
                    <Sk className="h-5 w-2/3" />
                    <Sk className="h-3 w-1/3" />
                    <Sk className="h-3 w-full" />
                    <Sk className="h-3 w-5/6" />
                  </div>
                </div>
              ))}
              <span className="sr-only">加载中…</span>
            </div>
          ) : books.length ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2" aria-label={`『${q}』搜索结果`}>
              {books.map((b) => (
                <QbSearchCard key={b.id} book={b} />
              ))}
            </div>
          ) : (
            <p className="py-16 text-center text-sm" style={{ color: QB_MUT40 }}>
              没有找到与「{q}」相关的小说，换个关键词试试
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
