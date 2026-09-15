// ============================================================
// [R26-4] qb23 铅笔小说(www.23qb.net) 分类页克隆 —— 5 页型之 Category
// 真站快照: /tmp/r26/qb23-category.html(/book/lastupdate_0_6_0_0_0_0_0_1_0.html 直抓)
// 真站 DOM: main#main.wrapper > .content
//   ├ .page-heading > .box(白卡 padding 25px / radius 18px / 大投影)
//   │   ├ .library-box×4 筛选行(scroll-content flex: b.library-item.library-item-first 标签 + .library-list 筛选片)
//   │   │   行1 分类(全部/言情/都市/…) 行2 字数 行3 排序(周点击/月点击/…/更新时间/入库时间) 行4 进度(新书连载/已经完本)
//   │   │   chip: padding 0 20px / line-height 35px / 14px / radius 10px;
//   │   │   .library-item.selected  #fef0e5 底 + #ff2a14 字 + 700(未选中透明底)
//   │   └ h1.library-stat「玄幻魔法全部_更新时间_全部」(14px, rgba(0,0,0,.62))
//   ├ .module > .module-list > .module-items > .module-item×N 封面网格(同首页卡型, 无序号角标;
//   │   真站分类页 caption span 为空 → 克隆省略 caption 渐变条)
//   └ .module-footer > .page#page 分页: span 第X/Y页 + a.page-previous + strong 当前页(#ff2a14 白字)
//       + a 页码(#f3f5f7 底 hover #eaedf1, radius 50px, min-width 40px) + a.page-next
// 筛选降级: 字数/排序/进度三行真站可点但数据层无对应查询参数 → 视觉复刻为 aria-disabled 装饰片,
//   仅「分类」行可交互(navigate category)。library-stat 追加「共 N 本」满足页头口径。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchCategories } from '../data'
import type { BookItem, CategoryItem } from '../../types'
import { BookCover } from '../BookCover'
import { ErrorState, Sk, bookNavProps } from '../../bits'

/** [R26-4-5] 真站实测色值(style.css) */
const QB_TEXT = '#282828'
const QB_MUT40 = 'rgba(0,0,0,0.4)'
const QB_MUT62 = 'rgba(0,0,0,0.62)'
const QB_TXT68 = 'rgba(0,0,0,0.68)'
const QB_RED = '#ff2a14'
const QB_APRICOT = '#fef0e5' // .library-item.selected 底

/** [R26-4-6] .module-item 封面卡(分类页形态: 无序号角标/无 caption) */
function QbCatCard({ book }: { book: BookItem }) {
  const { navigate } = usePublic()
  return (
    <div>
      <div
        {...bookNavProps(navigate, book.id)}
        aria-label={`查看《${book.name}》详情`}
        className="qb23-cover relative w-full cursor-pointer overflow-hidden rounded-[5px] pt-[140%]"
      >
        <div className="absolute inset-0">
          <BookCover name={book.name} cover={book.cover} showAuthor={book.author} style={{ borderRadius: 0 }} />
        </div>
      </div>
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
      <p className="mt-[3px] truncate text-center text-[13px] max-sm:mt-px max-sm:text-xs max-sm:text-[#aaadb5]" style={{ color: QB_MUT40 }}>
        {book.author}
      </p>
    </div>
  )
}

/** [R26-4-7] .library-item 筛选片 — active=selected(暖杏底/红字/700; 色彩走 class 保 hover 可覆盖) */
function FilterChip({ label, active, onClick, title }: { label: string; active?: boolean; onClick?: () => void; title?: string }) {
  const cls =
    'inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-[10px] px-5 leading-[35px] text-sm transition-colors'
  const style = active ? { color: QB_RED, fontWeight: 700 as const, background: QB_APRICOT } : { color: QB_TXT68 }
  const hoverCls = active ? '' : ' hover:bg-[#f3f5f7]'
  if (!onClick) {
    // 降级装饰片(真站可点, 克隆数据层无对应维度): aria-disabled + 禁用光标
    return (
      <span className={`${cls} cursor-default opacity-70`} style={style} aria-disabled title={title || '克隆模板未接入该筛选维度'}>
        {label}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cls}${hoverCls}`}
      style={style}
      aria-current={active ? 'true' : undefined}
      aria-label={`筛选 ${label}`}
    >
      {label}
    </button>
  )
}

/** [R26-4-8] .library-box 筛选行 — 行首 <b> 标签 + .library-list 横滚片组 */
function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2.5 flex items-start gap-1 border-t border-[#f3f5f7] pt-2.5 first:mt-0 first:border-t-0 first:pt-0">
      <b className="mr-1 shrink-0 text-sm leading-[35px]" style={{ color: QB_RED }} aria-hidden>
        {label}
      </b>
      <div className="flex flex-1 flex-wrap gap-1 overflow-x-auto" role="group" aria-label={`${label}筛选`}>
        {children}
      </div>
    </div>
  )
}

export function Qb23Category({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()
  const [cats, setCats] = useState<CategoryItem[]>([])
  useEffect(() => {
    let alive = true
    fetchCategories()
      .then((list) => {
        if (alive) setCats(list)
      })
      .catch(() => {
        /* 分类条失败静默: 保留「全部」入口 */
      })
    return () => {
      alive = false
    }
  }, [])

  const books = data?.books || []
  const total = data?.total || 0
  const size = data?.size || 24
  const totalPages = Math.max(1, Math.ceil(total / size))
  const pageWindow = pageWindowOf(page, totalPages)

  return (
    <div className="w-full pb-14" style={{ color: QB_TEXT }}>
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        {error ? (
          <div className="rounded-[18px] bg-white p-6 shadow-[0_7px_21px_rgba(149,157,165,0.22)]">
            <ErrorState message="分类数据加载失败" detail={error} />
          </div>
        ) : (
          <>
            {/* ============ .page-heading > .box: 筛选行 + library-stat ============ */}
            <div className="rounded-[18px] bg-white p-4 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-[25px]">
              <FilterRow label="分类">
                <FilterChip label="全部" active={!cat} onClick={() => navigate({ view: 'category', page: 1 })} />
                {cats.map((c) => (
                  <FilterChip
                    key={c.id}
                    label={c.name}
                    active={cat === c.id}
                    onClick={() => navigate({ view: 'category', cat: c.id, page: 1 })}
                  />
                ))}
              </FilterRow>
              {/* 真站可点筛选, 数据层无参数 → 视觉复刻 + aria-disabled(降级说明见文件头) */}
              <FilterRow label="字数">
                {['全部', '30万以下', '30-50万', '50-100万', '100-200万', '200-300万', '400万以上'].map((t, i) => (
                  <FilterChip key={t} label={t} active={i === 0} />
                ))}
              </FilterRow>
              <FilterRow label="排序">
                {['周点击', '月点击', '周推荐', '月推荐', '新书榜', '字数', '收藏数', '更新时间', '入库时间'].map((t, i) => (
                  <FilterChip key={t} label={t} active={i === 7} />
                ))}
              </FilterRow>
              <FilterRow label="进度">
                {['全部', '新书连载', '已经完本'].map((t, i) => (
                  <FilterChip key={t} label={t} active={i === 0} />
                ))}
              </FilterRow>
              {/* h1.library-stat: 真站「玄幻魔法全部_更新时间_全部」形态, 追加共 N 本 */}
              <h1 className="mt-4 text-sm" style={{ color: QB_MUT62 }}>
                {catName}全部_更新时间_全部
                <span className="ml-2" style={{ color: QB_MUT40 }}>
                  共 {total} 本
                </span>
              </h1>
            </div>

            {/* ============ .module > .module-items: 封面网格 ============ */}
            <div className="mt-3 rounded-[18px] bg-white p-4 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-[25px]">
              {loading ? (
                <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-5 sm:gap-x-5 sm:gap-y-5" aria-label="分类列表加载中">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} aria-hidden>
                      <div className="w-full pt-[140%]">
                        <Sk className="h-full w-full rounded-[5px]" />
                      </div>
                      <Sk className="mx-auto mt-3 h-4 w-4/5" style={{ borderRadius: 4 }} />
                    </div>
                  ))}
                </div>
              ) : books.length ? (
                <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-5 sm:gap-x-5 sm:gap-y-5" aria-label={`${catName}书单`}>
                  {books.map((b) => (
                    <QbCatCard key={b.id} book={b} />
                  ))}
                </div>
              ) : (
                <p className="py-16 text-center text-sm" style={{ color: QB_MUT40 }}>
                  该分类暂无收录书籍
                </p>
              )}

              {/* ============ .module-footer > #page 分页 ============ */}
              {totalPages > 1 && (
                <nav className="pt-6 text-center" aria-label="分页导航">
                  <span className="mr-2 text-sm" style={{ color: QB_MUT40 }}>
                    第{page}/{totalPages}页
                  </span>
                  <QbPageBtn disabled={page <= 1} onClick={() => navigate({ view: 'category', cat, page: page - 1 })} ariaLabel="上一页">
                    上一页
                  </QbPageBtn>
                  {pageWindow.map((p) =>
                    p === page ? (
                      <strong
                        key={p}
                        className="mx-0.5 inline-block min-w-[40px] rounded-[50px] bg-[#ff2a14] px-3 leading-10 text-sm font-bold text-white"
                        aria-current="page"
                      >
                        {p}
                      </strong>
                    ) : (
                      <QbPageBtn key={p} onClick={() => navigate({ view: 'category', cat, page: p })} ariaLabel={`第 ${p} 页`}>
                        {p}
                      </QbPageBtn>
                    ),
                  )}
                  <QbPageBtn disabled={page >= totalPages} onClick={() => navigate({ view: 'category', cat, page: page + 1 })} ariaLabel="下一页">
                    下一页
                  </QbPageBtn>
                </nav>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** [R26-4-9] #page a 页码钮(#f3f5f7 底 hover #eaedf1, radius 50px) */
function QbPageBtn({
  children,
  onClick,
  disabled,
  ariaLabel,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="mx-0.5 inline-block min-w-[40px] rounded-[50px] bg-[#f3f5f7] px-3 text-sm leading-10 transition-colors hover:bg-[#eaedf1] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#f3f5f7]"
      style={{ color: QB_TXT68 }}
    >
      {children}
    </button>
  )
}

/** 页码窗口: 当前页 ±3, 首页恒显(真站罗列 1..10, 克隆窗口化避免长尾) */
function pageWindowOf(page: number, totalPages: number): number[] {
  const out = new Set<number>([1, totalPages])
  for (let p = Math.max(1, page - 3); p <= Math.min(totalPages, page + 3); p++) out.add(p)
  return [...out].sort((a, b) => a - b)
}
