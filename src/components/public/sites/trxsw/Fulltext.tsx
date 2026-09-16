// ============================================================
// [R28-2g-4] trxsw(同人小说网) 全本小说页克隆 —— 杰奇 CMS 默认模板家族标准还原(降级声明)
// 素材等级: 家族标准 —— 真站全本入口 2019 快照导航实证: 「全本小说」→
// /book/0_lastupdate_0_0_2_0_1.html(cat 0 全站 + lastupdate 排序 + 第 5 参数 2 = 完本状态),
// 页本体无存档(R28-2g Wayback 复抓 tx-quanben.html 为 Wayback 404 页) → 按杰奇家族
// 分类/书库列表页结构补全: JqH2 标题条 + s1..s5 行式列表(与首页 .l 同款骨架) +
// 杰奇方块分页(tx-pg 白底灰边/hover 深蓝白字/当前页深蓝白字)。
// 降级声明(逐条):
//   ①真站列表页顶部「分类筛选区」形态无存档 → 沿用家族分类页白卡筛选条(与 Category 同构,
//     点击切分类 navigate category, 声明)
//   ②s5 数值列: 家族列表页为字数 → 契约 BooksData 无点击数, 字数(万)直出(实证家族惯例)
//   ③真站每页条数未知(杰奇默认 20~30) → 契约 size 24(声明)
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { SiteFulltextProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchCategories } from '../../data'
import type { CategoryItem } from '../../types'
import { bookNavProps, EmptyState, ErrorState, Sk } from '../../bits'

/** [R28-2g-4] 杰奇 CMS 家族标准色板(b.css 无存档, R25 轮实证) */
const C = {
  navBlue: '#1C5087',
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

/** [R28-2g-4] 杰奇家族方块分页(白底灰边, hover/当前页深蓝白字) */
function Pager({ page, totalPages, onGo }: { page: number; totalPages: number; onGo: (p: number) => void }) {
  if (totalPages <= 1) return null
  const start = Math.max(1, Math.min(page - 4, totalPages - 9))
  const nums = Array.from({ length: Math.min(10, totalPages) }, (_, i) => start + i)
  const cell = 'tx-pg m-[2px] inline-flex h-[30px] min-w-[30px] items-center justify-center border px-1 text-[13px]'
  return (
    <nav aria-label="分页" className="tx-pages flex flex-wrap items-center justify-center py-3">
      {page > 1 && (
        <button type="button" onClick={() => onGo(page - 1)} className={cell} aria-label="上一页">
          上一页
        </button>
      )}
      {nums.map((n) =>
        n === page ? (
          <strong key={n} className={cell} style={{ background: C.navBlue, borderColor: C.navBlue, color: '#fff' }} aria-current="page">
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
          下一页
        </button>
      )}
    </nav>
  )
}

export function TrxswFulltext({ data, loading, error, page }: SiteFulltextProps) {
  const { navigate } = usePublic()

  // 分类筛选条(家族分类页白卡形态, 声明①)
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

  const books = data?.books || []
  const totalPages = data ? Math.ceil((data.total || 0) / (data.size || 24)) : 0

  return (
    <div className="tx-home mx-auto w-full max-w-[960px] px-2 pb-6 pt-3" style={{ color: C.text, fontSize: 14 }}>
      {/* 分类筛选(声明①) */}
      <div className="tx-cats mb-3 border p-2.5" style={{ borderColor: C.border }}>
        <span className="mr-2 text-[13px]" style={{ color: C.gray }}>
          分类：
        </span>
        {cats === null ? (
          <Sk className="inline-block h-4 w-2/3 align-middle" />
        ) : cats.length ? (
          cats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate({ view: 'category', cat: c.id, page: 1 })}
              className="tx-cat mr-2 text-[14px] hover:underline"
              style={{ color: C.text }}
              aria-label={`前往 ${c.name} 分类`}
            >
              {c.name}
            </button>
          ))
        ) : (
          <span className="text-[13px]">暂无分类</span>
        )}
      </div>

      <section className="tx-sec">
        <JqH2>全本小说</JqH2>
        {error ? (
          <div className="py-6">
            <ErrorState message="全本书库加载失败" detail={error} />
          </div>
        ) : loading && !books.length ? (
          <ul aria-hidden className="m-0 list-none border bg-white" style={{ borderColor: C.border }}>
            {Array.from({ length: 12 }).map((_, i) => (
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
                  {b.latestChapter || b.intro || '—'}
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
            <EmptyState text="暂无全本小说" hint="完本书籍入库后自动收录" />
          </div>
        )}
        <Pager page={page} totalPages={totalPages} onGo={(p) => navigate({ view: 'fulltext', page: p })} />
      </section>
    </div>
  )
}
