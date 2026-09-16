// ============================================================
// [R28-2g] 本轮复核: 2019 快照复用 + Wayback 内页复抓(tx-{book,read,top,full,search,quanben}.html)全为 Wayback 404 页, 家族标准结论维持; 文件按 R28-2g 重建并入模板集。
// [R27-6b-14] trxsw(同人小说网) 分类/书库页克隆 —— 杰奇 CMS 默认模板家族标准还原(降级声明)
// 素材等级: 家族标准 —— 真站分类页 /book/{cat}_{sort}_0_0_0_0_{page}.html(cat 1..7 全实证于
// 2019 快照导航, 页本体无存档) → 按杰奇家族分类页结构补全: JqH2 标题条 + 更新列表行式
// (s1..s5 与首页 .l 同款) + 杰奇分页。色值沿用家族标准(b.css 无存档, R25 实证)。
// 真站导航 cat 1..7 + 排行(monthvisit)/全本(lastupdate) 形态见 R25-1 worklog。
// ============================================================
'use client'

import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchCategories } from '../../data'
import type { CategoryItem } from '../../types'
import { bookNavProps, ErrorState, Sk } from '../../bits'

/** [R27-6b-14] 杰奇 CMS 家族标准色板(同 Home) */
const C = {
  navBlue: '#1C5087',
  text: '#333333',
  gray: '#666666',
  light: '#999999',
  border: '#dddddd',
  dotted: '#cccccc',
} as const

/** [R27-6b-14] 杰奇默认 h2(同 Home) */
function JqH2({ children, more }: { children: ReactNode; more?: () => void }) {
  return (
    <h2
      className="flex items-center justify-between gap-2 overflow-hidden"
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
      {more && (
        <button type="button" onClick={more} className="shrink-0 text-[12px] font-normal hover:underline" style={{ color: C.gray }} aria-label="更多">
          更多&gt;&gt;
        </button>
      )}
    </h2>
  )
}

/** [R27-6b-14] 杰奇家族分页(白底灰边方块, 当前页深蓝白字) */
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

export function TrxswCategory({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()

  // 分类导航(真站 .nav 深蓝条分类 ×7; 库内动态分类)
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
      {/* 分类导航条(杰奇家族: 白卡 h2 条) */}
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
              className={`tx-cat mr-2 text-[14px] ${cat === c.id ? 'font-bold' : ''}`}
              style={{ color: cat === c.id ? C.navBlue : C.text }}
              aria-label={`前往 ${c.name} 分类`}
              aria-current={cat === c.id ? 'true' : undefined}
            >
              {c.name}
            </button>
          ))
        ) : (
          <span className="text-[13px]">暂无分类</span>
        )}
      </div>

      {/* JqH2 + s1..s5 更新列表(杰奇家族分类页标准) */}
      <section className="tx-sec">
        <JqH2>{catName}列表</JqH2>
        {error ? (
          <div className="py-6">
            <ErrorState message="书库加载失败" detail={error} />
          </div>
        ) : loading && !books.length ? (
          <ul aria-hidden className="m-0 list-none p-0">
            {Array.from({ length: 12 }).map((_, i) => (
              <li key={i} className="tx-li flex h-9 items-center border-b border-dotted" style={{ borderColor: C.dotted }}>
                <Sk className="h-4 w-full" />
              </li>
            ))}
          </ul>
        ) : books.length ? (
          <ul className="m-0 list-none p-0">
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
                <em className="tx-s5 w-[44px] shrink-0 text-right not-italic text-[12px]" style={{ color: C.light }}>
                  {b.wordCount > 0 ? `${Math.round(b.wordCount / 10000)}万` : ''}
                </em>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center" style={{ color: C.gray }}>
            该分类暂无书籍
          </p>
        )}
        <Pager page={page} totalPages={totalPages} onGo={(p) => navigate({ view: 'category', cat, page: p })} />
      </section>
    </div>
  )
}
