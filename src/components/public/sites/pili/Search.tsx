// ============================================================
// [R28-2b2-7] 霹雳书屋 克隆搜索结果页 —— https://www.pilishuwu.com/module/search/search.php
//
// 真站证据(搜索入口, home.html 全站表单实测):
//   form action="/module/search/search.php" method="get"(另有一份 method="post" 悬浮条)
//   hidden: module=novel / type=0 + input.mod-search-input name="key"
//   placeholder: 「可搜索小说名/作者名」(顶部条) /「可搜索小说名/作者名/标签」(悬浮条)
//   → 真站有搜索结果页, Search 扩展视图必须实现。
//
// 搜索框 CSS 存档: /tmp/r28-2b/pili/wmcms.global.css(750-830 行)实测:
//   .mod-top-search(h 44px padding 4px 底 #ece8e6) > .mod-search-input-wr
//   (w 386px h 42px 1px #dcd8d4 边右无 + 白底) > .mod-search-input(14px padding 11px 5px)
//   + .mod-search-submit(74×44 圆角 0 2px 2px 0, 真站为 ac_global.png 雪碧图放大镜
//   → 以 pili 按钮橙 #f89157 + 白色放大镜图标平替, 声明)
//
// 结果列表布局: search.php 直连与 cloak-browser 桥(lite/standard/maximum 三档)实抓均命中
//   Cloudflare「Just a moment...」挑战(前轮 search.html/search.json/tagsearch.html 同为
//   挑战页, 31K), 结果页 DOM 不可得 → 按同模板族 wmcms 检索组件复刻: 结果卡复用真站
//   all-list.html 的 .ret-search-item(分类页同源列表组件, 见 wmcms.page.comicall.css),
//   结果头条 .ret-search-head(#f3f3f3) + .ret-result-num「共N个结果」(em 700)。
//
// 降级: ①真站 module/type 隐藏参数为 wmcms 站内路由语义 → 契约 navigate({view:'search',q})
//   承担, 不复制隐藏域 ②搜索框雪碧图按钮 → 图标平替(声明) ③SearchData 无 total/分页
//   契约 → 不渲染结果分页, 计数显示当前返回条数 ④相关词 chips: 真站存在标签搜索
//   (tagsearch 表单) → SearchData.relatedTags 按 SearchView 通用壳同口径跳关键词落地页。
// ============================================================
'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import type { SiteSearchProps } from '../shared'
import { usePublic } from '../../ctx'
import { EmptyState, ErrorState, Sk } from '../../bits'
import { PiliResultCard } from './_kit' // [R35-2d-3] 原 Search/Category 逐字节重复的结果卡收敛

// [R28-2b2-7] 真站色值(wmcms.global.css 搜索框 + comicall 检索卡)
const SEARCH_BG = '#ece8e6' // .mod-top-search 底
const SEARCH_LINE = '#dcd8d4' // .mod-search-input-wr 边
const TEXT = '#333333'
const TITLE = '#555555'
const MUTED = '#999999'
const BTN_ORANGE = '#f89157' // ui-btn-orange 提交钮(雪碧图平替)

/** [R28-2b2-7] 搜索框(mod-top-search 44px #ece8e6 + 白底输入格 + 74×44 提交钮) */
function PiliSearchBox({ initial }: { initial: string }) {
  const { navigate } = usePublic()
  const [input, setInput] = useState(initial)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const kw = input.trim()
    if (kw) navigate({ view: 'search', q: kw })
  }

  return (
    <form
      role="search"
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-[470px] items-stretch gap-0 p-1"
      style={{ background: SEARCH_BG, height: 44 }}
    >
      {/* .mod-search-input-wr 白底格(1px #dcd8d4, 右无边) */}
      <div className="flex min-w-0 flex-1 items-center border bg-white px-2.5" style={{ borderColor: SEARCH_LINE, borderRight: 'none' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="可搜索小说名/作者名/标签"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          style={{ color: TEXT, height: 40 }}
          aria-label="搜索关键词"
        />
        {input && (
          <button
            type="button"
            onClick={() => setInput('')}
            className="shrink-0 px-1 text-xs"
            style={{ color: MUTED }}
            aria-label="清空输入"
          >
            ×
          </button>
        )}
      </div>
      {/* .mod-search-submit 74×44(真站雪碧图放大镜 → 按钮橙 + 图标平替, 声明②) */}
      <button
        type="submit"
        className="flex w-[62px] shrink-0 items-center justify-center rounded-r-[2px] text-white transition-colors sm:w-[74px]"
        style={{ background: BTN_ORANGE, border: '1px solid #ec7d4d', boxShadow: 'inset 0 0 1px rgba(255,255,255,0.5)' }}
        aria-label="搜索"
      >
        <SearchIcon className="h-4 w-4" aria-hidden />
      </button>
    </form>
  )
}

export function PiliSearch({ q, data, loading, error }: SiteSearchProps) {
  const { navigate } = usePublic()
  const books = data?.books || []
  const related = data?.relatedTags || []

  return (
    <div className="min-h-[50vh] bg-white pb-10 text-[#333333]">
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
        {/* 搜索框(真站全站顶部条同构) */}
        <PiliSearchBox initial={q} />

        {/* 结果头条(ret-search-head #f3f3f3 + ret-result-num) */}
        <div className="mt-5 flex h-10 items-center justify-between gap-3 px-3" style={{ background: '#f3f3f3' }}>
          <h1 className="truncate text-sm font-bold" style={{ color: TITLE }}>
            搜索：{q}
          </h1>
          {!loading && (
            <span className="shrink-0 truncate text-xs" style={{ color: '#666666' }}>
              共<em className="mx-0.5 font-bold not-italic" style={{ color: TITLE }}>{books.length}</em>个结果
            </span>
          )}
        </div>

        {error ? (
          <ErrorState message="搜索失败" detail={error} />
        ) : loading ? (
          <div className="grid gap-px bg-white sm:grid-cols-2" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => <Sk key={i} className="h-[180px] rounded-none" />)}
          </div>
        ) : books.length ? (
          <ul className="grid bg-white sm:grid-cols-2" style={{ listStyle: 'none' }}>
            {books.map((b) => <PiliResultCard key={b.id} book={b} />)}
          </ul>
        ) : (
          <div className="bg-white p-6">
            <EmptyState text={`没有找到与「${q}」相关的书籍`} hint="换个关键词试试，可搜索小说名/作者名/标签" />
          </div>
        )}

        {/* 相关搜索词(真站标签搜索 tagsearch 形态 → relatedTags 关键词落地, 与通用壳同口径) */}
        {!loading && related.length > 0 && (
          <section className="mt-6" aria-label="相关搜索词">
            <h2 className="mb-3 text-sm font-bold" style={{ color: TITLE }}>相关搜索词</h2>
            <div className="flex flex-wrap gap-2">
              {related.slice(0, 12).map((t) => (
                <button
                  key={`${t.tag}-${t.bookId}`}
                  type="button"
                  onClick={() => navigate({ view: 'keyword', tag: t.tag })}
                  className="rounded-[3px] px-2.5 py-1 text-xs transition-colors hover:bg-[#faead0]"
                  style={{ background: '#f7f7f7', color: '#666666', border: '1px solid #e8e8e8' }}
                  aria-label={`查看关键词 ${t.tag}`}
                >
                  {t.tag}
                  <span className="ml-1" style={{ color: MUTED }}>{t.bookName}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
