// ============================================================
// [R26-3-4] kks101(101看書) 目录页克隆(独立 toc 视图) —— 按 https://101kks.com/book/99/index.html 真站快照还原
// (/tmp/r26/kks101-toc.html + kks101-style.css 实测)
//
// 真站 DOM(.container > .mybox(min-height 50vh)):
//   ├ h3.mytitle.shuye(flex; align-items center; justify-content space-between)
//   │    ├ .bread      面包屑 首頁 > 分類 > 書名 > 「書名章節列表」(a #1f6cb2 14px)
//   │    ├ .titxt      書頁(≤990px 显示; 桌面 display:none — .shuye .titxt)
//   │    └ .sorting    正序/倒序切换(14px normal; 点击互斥显示)
//   └ .catalog
//        ├ h3 書籤 / 目錄   分组标题条(底 rgba(140,140,140,.05)/padding 5px 15px/字 #1f6cb2/圆 15px 外距;
//        │                  :before 左侧 4px×50% #1f6cb2 竖条, left 5px/top 25%)
//        └ #allchapter ul  章节三列(li float 33.333%; a: 底边 rgba(150,150,150,.2)/py 15px/16px #222/
//                           nowrap ellipsis; data-num 序号)
// 差异声明: 真站目录整页一次展开(jQuery LoadMore 展开 1465 章, 无分页条) → 按任務书契約改为
//           100 章/页 + .pages/.pagelink 分页; 書籤(登录态)区块无数据不渲染; 正序/倒序为本地态切换。
//           当前章高亮(#1f6cb2 加粗)为增强(真站无此态, 阅读回跳定位需要)。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import { groupTocVolumes } from '../template-kit'
import { BookCover } from '../BookCover'
import { ErrorState, Sk } from '../bits'

/** [R26-3-4] 真站实测色值(kks101-style.css) */
const BLUE = '#1f6cb2'
const LINE_SOFT = 'rgba(150,150,150,.2)'
const CAT_H3_BG = 'rgba(140,140,140,.05)' // .catalog h3 底纹

/** [R26-3-4] 面包屑(同书页规格 .bread; 根元素用 span 以便嵌在 h1.shuye 页头行内) */
function KksBread({ items }: { items: { label: string; go?: () => void }[] }) {
  return (
    <span className="kks-bread block min-w-0 text-[14px] font-normal">
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`}>
          {i > 0 && <span className="mx-1 text-[#999]">&gt;</span>}
          {it.go ? (
            <button type="button" onClick={it.go} className="text-[14px] transition-colors hover:underline" style={{ color: BLUE }} aria-label={`前往 ${it.label}`}>
              {it.label}
            </button>
          ) : (
            <span className="text-[#333]">{it.label}</span>
          )}
        </span>
      ))}
    </span>
  )
}

/** [R26-3-4] .catalog 分组标题条(底纹 + #1f6cb2 左竖条) */
function CatalogH3({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="relative mb-[15px] mt-[15px] px-[15px] py-[5px] text-[16px]"
      style={{ background: CAT_H3_BG, color: BLUE, fontWeight: 700 }}
    >
      <span aria-hidden className="absolute left-[5px] top-1/4 h-1/2 w-1" style={{ background: BLUE }} />
      {children}
    </h2>
  )
}

export function Kks101Toc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { navigate } = usePublic()
  // .sorting 正序/倒序(真站 jQuery 互斥切换, 本地态实现)
  const [desc, setDesc] = useState(false)

  useEffect(() => {
    // 翻页/换书回正序(与真站 LoadMore 展开后的默认顺序一致)
    setDesc(false)
  }, [page, data?.book.id])

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1112px] px-4 py-10 sm:px-6">
        <ErrorState message="目錄載入失敗" detail={error} />
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="mx-auto w-full max-w-[1112px] px-4 pb-10 sm:px-6" aria-label="目录加载中">
        <div className="kks-mybox" style={{ minHeight: '50vh' }}>
          <Sk className="mb-4 h-4 w-2/3" />
          <Sk className="mb-4 h-8 w-1/3" />
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {Array.from({ length: 24 }).map((_, i) => (
              <li key={i} className="border-b px-1 py-[15px]" style={{ borderColor: LINE_SOFT }}>
                <Sk className="h-4 w-4/5" />
              </li>
            ))}
          </ul>
          <span className="sr-only">加载中…</span>
        </div>
      </div>
    )
  }

  const { book, chapters, tocTotal, tocTotalPages } = data
  const vols = groupTocVolumes(chapters)
  const ordered = desc ? [...chapters].reverse() : chapters
  const totalPages = Math.max(1, tocTotalPages)

  /** 章节三列(移动单列/平板双列, 对齐真站 .catalog li 33.333% 桌面) */
  const renderList = (list: typeof chapters) => (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-6">
      {list.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => navigate({ view: 'read', chapterId: c.id })}
            className={`block w-full truncate border-b py-[15px] text-left text-[16px] transition-colors hover:text-[#06c] ${c.id === currentChapterId ? 'font-bold' : ''}`}
            style={{ borderColor: LINE_SOFT, color: c.id === currentChapterId ? BLUE : '#222' }}
            aria-label={`閱讀 ${c.title}`}
            aria-current={c.id === currentChapterId ? 'true' : undefined}
          >
            {c.title}
          </button>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="mx-auto w-full max-w-[1112px] px-4 pb-10 sm:px-6" style={{ color: '#333' }}>
      <div className="kks-mybox" style={{ minHeight: '50vh' }}>
        {/* ===== h3.mytitle.shuye: 面包屑 + 書頁 + 正序/倒序 ===== */}
        <h1 className="kks-mytitle flex flex-wrap items-center justify-between gap-2">
          <span className="block min-w-0 flex-1">
            <KksBread
              items={[
                { label: '首頁', go: () => navigate({ view: 'home' }) },
                { label: book.category || '小說', go: () => navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 }) },
                { label: book.name, go: () => navigate({ view: 'book', bookId: book.id }) },
                { label: `${book.name}章節列表` },
              ]}
            />
          </span>
          {/* .titxt 書頁(移动显示) */}
          <button
            type="button"
            onClick={() => navigate({ view: 'book', bookId: book.id })}
            className="text-[14px] transition-colors hover:underline lg:hidden"
            style={{ color: BLUE }}
            aria-label="返回書頁"
          >
            書頁
          </button>
          {/* .sorting 正序/倒序 */}
          <span className="shrink-0 text-[14px] font-normal">
            <button
              type="button"
              onClick={() => setDesc(false)}
              className={`text-[14px] transition-colors hover:underline ${desc ? '' : 'hidden'}`}
              style={{ color: BLUE }}
              aria-label="正序排列"
            >
              正序
            </button>
            <button
              type="button"
              onClick={() => setDesc(true)}
              className={`text-[14px] transition-colors hover:underline ${desc ? 'hidden' : ''}`}
              style={{ color: BLUE }}
              aria-label="倒序排列"
            >
              倒序
            </button>
          </span>
        </h1>

        {/* ===== .catalog: 書名页头块 + 共 N 章 ===== */}
        <section className="kks-catalog">
          <div className="mt-4 flex items-center gap-3">
            <span className="relative block shrink-0 overflow-hidden" style={{ width: 60, height: 80, boxShadow: '0 1px 3px rgb(0 0 0 / 30%)' }}>
              <BookCover name={book.name} cover={book.cover} className="absolute inset-0 h-full w-full" style={{ borderRadius: 0 }} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[20px]" style={{ fontWeight: 700 }}>
                {book.name}
              </h2>
              <p className="pt-1 text-[14px] text-[#757575]">
                {book.author} · 共 {tocTotal} 章
              </p>
            </div>
          </div>

          <CatalogH3>目錄（共 {tocTotal} 章）</CatalogH3>

          {/* 无卷: 平铺三列(真站 #allchapter); 有卷: 每卷一条 .catalog h3 + 列表 */}
          {vols ? (
            vols.map((g) => (
              <div key={g.volume}>
                <CatalogH3>{g.volume || '正文'}</CatalogH3>
                {renderList(desc ? [...g.chapters].reverse() : g.chapters)}
              </div>
            ))
          ) : (
            renderList(ordered)
          )}

          {/* ===== .pages > .pagelink 分页(真站整页展开无分页 → 契约改为分页, 差异已声明) ===== */}
          {totalPages > 1 && (
            <nav aria-label="分頁" className="flex flex-wrap items-center justify-center py-[21px] text-center">
              {page > 1 && (
                <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })} className="kks-pg" aria-label="第一頁">
                  &lt;&lt;
                </button>
              )}
              {page > 1 && (
                <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: page - 1 })} className="kks-pg" aria-label="上一頁">
                  &lt;
                </button>
              )}
              {(() => {
                const start = Math.max(1, Math.min(page - 4, totalPages - 9))
                return Array.from({ length: Math.min(10, totalPages) }, (_, i) => start + i).map((n) =>
                  n === page ? (
                    <strong key={n} className="kks-pg kks-pg-cur">
                      {n}
                    </strong>
                  ) : (
                    <button key={n} type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: n })} className="kks-pg" aria-label={`第 ${n} 頁`}>
                      {n}
                    </button>
                  ),
                )
              })()}
              {page < totalPages && (
                <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: page + 1 })} className="kks-pg" aria-label="下一頁">
                  &gt;
                </button>
              )}
              {page < totalPages && (
                <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: totalPages })} className="kks-pg" aria-label="最後一頁">
                  &gt;&gt;
                </button>
              )}
            </nav>
          )}
        </section>
      </div>
    </div>
  )
}
