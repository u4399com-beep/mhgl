// ============================================================
// [R28-2g-5] trxsw(同人小说网) 搜索页克隆 —— 杰奇 CMS 默认模板家族标准还原(降级声明)
// 素材等级: 家族标准 —— ①真站搜索框形态: 快照 .head > #searchbar > .search(内容由 b.js
// 注入, 表单本体无存档) → 按杰奇家族默认搜索框补全: 直角输入框(1px #ccc 边) + 深蓝渐变
// 提交钮(SiteHeader TrxswSearchBox 同款, R25-4 实现先例)。②真站搜索路由: 杰奇家族
// 标准 /modules/article/search.php(GET searchkey) 或 /search.html — 伪静态化 2019 快照
// map 页形态无存档; 结果列表区无存档(R28-2g Wayback 复抓 tx-search.html 为 Wayback 404 页)
// → 结果区按家族列表页 s1..s5 行式骨架补全(与首页 .l 同款)。
// 降级声明(逐条):
//   ①搜索提交 navigate({view:'search', q}) 承担(真站 GET searchkey 表单语义等价映射)
//   ②SearchData 无 total/分页契约 → 不渲染计数与分页, 结果行数即返回条数(声明)
//   ③relatedTags 相关搜索词 chips 落地 navigate keyword(杰奇家族无此形态 → 克隆侧增强,
//     与通用 SearchView 同口径)
// ============================================================
'use client'

import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { SiteSearchProps } from '../shared'
import { usePublic } from '../../ctx'
import { bookNavProps, EmptyState, ErrorState, Sk } from '../../bits'

/** [R28-2g-5] 杰奇 CMS 家族标准色板(b.css 无存档, R25 轮实证) */
const C = {
  navBlue: '#1C5087',
  navBlueLight: '#1F5FA9',
  text: '#333333',
  gray: '#666666',
  light: '#999999',
  border: '#dddddd',
  dotted: '#cccccc',
} as const

function JqH2({ children }: { children: ReactNode }) {
  return (
    <h2
      className="flex items-center overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #fafbfc 0%, #e9eef5 100%)',
        borderBottom: `1px solid ${C.border}`,
        borderLeft: `4px solid ${C.navBlue}`,
        color: C.text,
        fontSize: 14,
        fontWeight: 700,
        lineHeight: '32px',
        minHeight: 32,
        margin: 0,
        paddingLeft: 8,
        paddingRight: 8,
      }}
    >
      {children}
    </h2>
  )
}

export function TrxswSearch({ q, data, loading, error }: SiteSearchProps) {
  const { navigate } = usePublic()
  const [input, setInput] = useState(q)

  // 表单提交(声明①: 真站 GET searchkey → navigate search 视图)
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const kw = input.trim()
    if (kw) navigate({ view: 'search', q: kw })
  }

  const books = data?.books || []
  const tags = data?.relatedTags || []

  return (
    <div className="tx-home mx-auto w-full max-w-[960px] px-2 pb-6 pt-3" style={{ color: C.text, fontSize: 14 }}>
      {/* 搜索框(杰奇家族 #searchbar 形态: 直角输入 + 深蓝渐变钮) */}
      <form className="tx-searchbar mb-3 flex" role="search" onSubmit={onSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入书名或作者"
          className="tx-searchinput min-w-0 flex-1 border px-2 py-[7px] text-[14px] outline-none"
          style={{ borderColor: C.border, color: C.text, background: '#fff' }}
          aria-label="搜索关键词"
        />
        <button
          type="submit"
          className="tx-searchbtn shrink-0 px-5 py-[7px] text-[14px] text-white transition-opacity hover:opacity-90"
          style={{ background: `linear-gradient(180deg, ${C.navBlueLight} 0%, ${C.navBlue} 100%)`, border: `1px solid ${C.navBlue}` }}
          aria-label="搜索"
        >
          搜 索
        </button>
      </form>

      <section className="tx-sec">
        <JqH2>{q ? `“${q}” 的搜索结果` : '站内搜索'}</JqH2>
        {error ? (
          <div className="py-6">
            <ErrorState message="搜索失败" detail={error} />
          </div>
        ) : loading ? (
          <ul aria-hidden className="m-0 list-none border bg-white" style={{ borderColor: C.border }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <li key={i} className="tx-li flex h-9 items-center border-b border-dotted" style={{ borderColor: C.dotted }}>
                <Sk className="h-4 w-full" />
              </li>
            ))}
            <li className="sr-only" aria-hidden>加载中…</li>
          </ul>
        ) : books.length ? (
          <ul className="m-0 list-none border bg-white" style={{ borderColor: C.border }}>
            {books.map((b) => (
              <li key={b.id} className="tx-li flex h-9 items-center gap-2 border-b border-dotted" style={{ borderColor: C.dotted }}>
                <span className="tx-s1 hidden w-[76px] shrink-0 truncate text-[12px] sm:block" style={{ color: C.gray }}>
                  [{b.category || '小说'}]
                </span>
                <button
                  type="button"
                  {...bookNavProps(navigate, b.id)}
                  className="tx-s2 w-[36%] min-w-0 shrink truncate text-left text-[14px]"
                  style={{ color: C.text }}
                  aria-label={`查看《${b.name}》详情`}
                >
                  {b.name}
                </button>
                <span className="tx-s3 hidden min-w-0 flex-1 truncate text-[13px] sm:block" style={{ color: C.gray }}>
                  {b.intro || '—'}
                </span>
                <span className="tx-s4 hidden w-[80px] shrink-0 truncate text-right text-[12px] sm:block" style={{ color: C.gray }}>
                  {b.author}
                </span>
                <em className="tx-s5 w-[52px] shrink-0 text-right not-italic text-[12px]" style={{ color: C.light }}>
                  {b.wordCount > 0 ? `${(b.wordCount / 10000).toFixed(1)}万` : ''}
                </em>
              </li>
            ))}
          </ul>
        ) : (
          <div className="border bg-white py-8" style={{ borderColor: C.border }}>
            <EmptyState text={q ? `没有找到与「${q}」相关的书籍` : '输入关键词开始搜索'} hint="可搜书名、作者" />
          </div>
        )}
      </section>

      {/* 相关搜索词(克隆侧增强, 声明③) */}
      {tags.length > 0 && (
        <div className="tx-reltags mt-3 border p-2.5" style={{ borderColor: C.border }}>
          <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[13px]" style={{ color: C.gray }}>
              相关搜索：
            </span>
            {tags.map((t) => (
              <button
                key={`${t.bookId}-${t.tag}`}
                type="button"
                onClick={() => navigate({ view: 'keyword', tag: t.tag })}
                className="text-[13px] hover:underline"
                style={{ color: C.text }}
                aria-label={`搜索 ${t.tag}`}
              >
                {t.tag}
              </button>
            ))}
          </p>
        </div>
      )}
    </div>
  )
}
