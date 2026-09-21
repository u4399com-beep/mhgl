// ============================================================
// [R28-2c] ggd66(格格党) 搜索页克隆 —— 扩展视图之 Search
// 真站快照(R28 实测): /tmp/r28-2c/ggd66/ggd66-search.html(https://www.ggd66.com/search/ 直抓, 15.4KB)
// 真站 DOM: .container > .content > .search(表单 method=post action=/search/ searchkey) +
//   .content.book .keywords(h2 热门搜索推荐 + .bookbox×10 热书卡)
// 映射声明: ①真站搜索结果为 POST 提交后渲染(无法 GET 复刻) → 结果态沿用真站 bookbox 列表卡语言,
//   卡面/序号/阅读钮与 /sort/、/search/ 热门推荐完全同构; ②空态搜索落地页(无 q)由通用壳呈现
//   (真站 /search/ 热门搜索推荐 + 搜索框同构); ③真站表单为 POST searchkey → 模板 navigate({view:'search',q})。
// GgdBookBox 复用 ./Category 导出(真站同款模板)。
// ============================================================
'use client'

import { useState } from 'react'
import type { SiteSearchProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { GgdBookBox, GGD_LINE, GGD_TEAL, GGD_TEXT_BODY } from './Category'

export function Ggd66Search({ q, data, loading, error }: SiteSearchProps) {
  const { navigate } = usePublic()
  // .search 表单(组件自带 input state + navigate 提交, 真站 POST /search/ searchkey)
  const [kw, setKw] = useState(q)
  const books = data?.books || []

  return (
    <div className="mx-auto w-[90%] max-w-[1200px] pb-10" style={{ color: GGD_TEXT_BODY }}>
      {/* ============ .content > .search 表单(真站 input 80% + button 20%) ============ */}
      <div className="ggd-searchbox mt-2.5 border bg-white px-2.5 py-3 shadow-[0_1px_1px_rgba(0,0,0,0.05)]" style={{ borderColor: GGD_LINE }}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const t = kw.trim()
            if (t) navigate({ view: 'search', q: t })
          }}
          role="search"
          className="ggd-search relative mx-auto max-w-[640px]"
          aria-label="站内搜索"
        >
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            type="text"
            name="searchkey"
            maxLength={50}
            placeholder="搜索从这里开始..."
            aria-label="搜索书名或作者"
            className="h-[38px] w-full rounded-[5px] border-2 bg-[#f9f9f9] pl-[1em] pr-[21%] text-[16px] outline-none"
            style={{ borderColor: GGD_TEAL, color: GGD_TEAL }}
          />
          <button
            type="submit"
            className="absolute right-0 top-0 h-[38px] w-[20%] rounded-r-[3px] text-[16px] text-white"
            style={{ background: GGD_TEAL }}
            aria-label="搜索"
          >
            搜 索
          </button>
        </form>
      </div>

      {/* ============ .content.book 搜索结果(bookbox 同构列表卡) ============ */}
      <div className="ggd-book mt-2.5 border bg-white px-2.5 pb-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.05)]" style={{ borderColor: GGD_LINE }}>
        <h2 className="ggd-h2 text-center" aria-label="搜索结果">
          {loading ? '正在搜索…' : `搜索『${q}』`}
          {!loading && (
            <span className="ml-2 text-[13px] font-normal" style={{ color: GGD_TEXT_BODY }}>
              找到 {books.length} 本
            </span>
          )}
        </h2>
        {error ? (
          <ErrorState message="搜索失败" detail={error} />
        ) : loading ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="搜索结果加载中">
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
                <GgdBookBox key={b.id} book={b} no={i + 1} />
              ))}
            </div>
            {/* SearchData 为单页命中集(无分页字段) → 不渲染 .pages(真站结果页同无分页) */}
          </>
        ) : (
          <p className="py-6 text-center text-sm">没有找到与「{q}」相关的小说，换个关键词试试</p>
        )}
        <div className="clear-both" />
      </div>
    </div>
  )
}
