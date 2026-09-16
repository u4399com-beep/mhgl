// ============================================================
// [R27-6b-2] x2552(吾爱文学网) 分类/书库页克隆 —— 黑冰模板家族标准还原(降级声明)
// 素材等级: 家族标准 —— 真站分类页 /list/{cat}_{page}.html(2023 Wayback 快照内导航实链证实
// URL 形态)无独立存档页 → 按黑冰模板家族公认结构补全: 列表块(blocktitle + ul.update 行式)
// 与首页 #centeri 同款式, 灰按钮数字分页。色值沿用 R24 实测 style.css。
// 真站分类: 玄幻魔法/武侠修真/都市言情/历史军事/侦探推理/网游动漫/科幻小说/恐怖灵异/文学名著/其他
// (快照 m_menu 实测 10 类 + 全本 fulltxt) —— 本站分类由库内 fetchCategories 动态提供。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchCategories } from '../../data'
import type { CategoryItem } from '../../types'
import { ErrorState, Sk, bookNavProps } from '../../bits'
import { fmtDate } from '../../seo'

/** [R27-6b-2] 黑冰模板实测色值(同 Home) */
const C = {
  text: '#666666',
  link: '#2f468f',
  hover: '#FF6600',
  border: '#E4E4E4',
  dot: '#F2F2F2',
} as const
const TITLE_BAR = 'linear-gradient(180deg, #fbfcfe 0%, #e9eef5 100%)'

/** [R27-6b-2] 黑灰数字分页(家族标准: 灰按钮位 35px 见方, 当前页深蓝) */
function Pager({ page, totalPages, onGo }: { page: number; totalPages: number; onGo: (p: number) => void }) {
  if (totalPages <= 1) return null
  const start = Math.max(1, Math.min(page - 4, totalPages - 9))
  const nums = Array.from({ length: Math.min(10, totalPages) }, (_, i) => start + i)
  const cell = 'x2-pg m-[2px] inline-flex h-[30px] min-w-[30px] items-center justify-center border px-1 text-[12px]'
  return (
    <nav aria-label="分页" className="x2-pages flex flex-wrap items-center justify-center py-2.5">
      {page > 1 && (
        <button type="button" onClick={() => onGo(page - 1)} className={cell} aria-label="上一页">
          上一页
        </button>
      )}
      {nums.map((n) =>
        n === page ? (
          <strong key={n} className={cell} style={{ background: C.link, color: '#fff' }} aria-current="page">
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

export function X2552Category({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()

  // 分类导航条(快照 m_menu 10 分类实链; 库内动态分类映射)
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
  // BooksData 契约: total/page/size(无 totalPages) → ceil(total/size) 计算分页
  const totalPages = data ? Math.ceil((data.total || 0) / (data.size || 24)) : 0
  const block: CSSProperties = { border: `1px solid ${C.border}`, marginTop: 8 }

  return (
    <div className="x2-home w-full px-2 pb-4" style={{ color: C.text, fontSize: 12, lineHeight: 1.2 }}>
      <div className="mx-auto w-full max-w-[960px]">
        {/* 分类导航(黑冰家族: m_menu 同款灰渐变条行) */}
        <div style={{ ...block, background: TITLE_BAR, padding: '8px 10px', lineHeight: '25px' }}>
          <span className="mr-1">分类：</span>
          {cats === null ? (
            <Sk className="inline-block h-4 w-2/3 align-middle" />
          ) : cats.length ? (
            cats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate({ view: 'category', cat: c.id, page: 1 })}
                className={`x2-a mr-2 ${cat === c.id ? 'font-bold' : ''}`}
                style={{ color: cat === c.id ? C.hover : C.link, cursor: 'pointer' }}
                aria-label={`前往 ${c.name} 分类`}
                aria-current={cat === c.id ? 'true' : undefined}
              >
                {c.name}
              </button>
            ))
          ) : (
            <span>暂无分类</span>
          )}
        </div>

        <div style={block}>
          <div style={{ height: 40, lineHeight: '40px', fontSize: 14, background: TITLE_BAR, overflow: 'hidden', padding: '0 15px' }}>
            <i aria-hidden style={{ display: 'inline-block', width: 12, height: 16, background: C.hover, borderRadius: 2, margin: '12px 10px 0 0', verticalAlign: 'top' }} />
            {catName}小说列表
          </div>
          <div style={{ padding: 10 }}>
            {error ? (
              <div className="py-6">
                <ErrorState message="书库加载失败" detail={error} />
              </div>
            ) : loading && !books.length ? (
              <ul aria-hidden>
                {Array.from({ length: 10 }).map((_, i) => (
                  <li key={i} style={{ borderBottom: `1px dotted ${C.border}`, padding: '0 10px', minHeight: 40, display: 'flex', alignItems: 'center' }}>
                    <Sk className="h-4 w-full" />
                  </li>
                ))}
              </ul>
            ) : books.length ? (
              <ul className="list-none" style={{ margin: 0, padding: 0, lineHeight: '30px' }}>
                {books.map((b) => (
                  <li
                    key={b.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px dotted ${C.border}`, padding: '0 10px', minHeight: 40, fontSize: 12 }}
                  >
                    <p className="min-w-0 flex-[0_1_250px] truncate text-left">
                      <button type="button"
                        className="x2-a"
                        role="button"
                        tabIndex={0}
                        style={{ cursor: 'pointer' }}
                        onClick={() => b.categoryId && navigate({ view: 'category', cat: b.categoryId })}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && b.categoryId) {
                            e.preventDefault()
                            navigate({ view: 'category', cat: b.categoryId })
                          }
                        }}
                      >
                        [{b.category}]
                      </button>
                      《
                      <button type="button" className="x2-a" style={{ cursor: 'pointer' }} title={b.name} {...bookNavProps(navigate, b.id)}>
                        {b.name}
                      </button>
                      》
                    </p>
                    <p className="hidden min-w-0 flex-[0_1_340px] truncate text-left min-[640px]:block" style={{ color: C.text }}>
                      {b.latestChapter || b.intro || '—'}
                    </p>
                    <span className="ml-auto shrink-0">
                      {b.author}&nbsp;&nbsp;{fmtDate(b.updatedAt).slice(2) || '--'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center" style={{ color: C.text }}>
                该分类暂无书籍
              </p>
            )}
            <Pager page={page} totalPages={totalPages} onGo={(p) => navigate({ view: 'category', cat, page: p })} />
          </div>
        </div>
      </div>
    </div>
  )
}
