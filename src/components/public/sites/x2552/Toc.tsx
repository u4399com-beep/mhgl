// ============================================================
// [R27-6b-4] x2552(吾爱文学网) 目录页克隆 —— 黑冰模板「最新章节列表页」还原
// 素材等级: Wayback 实测 —— /tmp/r27-f2/x2552-book.html(2023 快照 /html/1/1326/ 完整 DOM):
//   #a_main > .bdtop + .bdsub > dl >
//     dt: 面包屑「吾爱文学网 -&gt; 玄幻魔法 -&gt; 十方神王最新章节」+ p.fr(加入书架 | 推荐本书 | 返回书页)
//     dd: h1「十方神王最新章节」
//     dd: h3「作者：贪睡的龙」
//     dd: table#at(bgcolor #E4E4E4/cellspacing 1) > tr > td.L > a 章节 —— 4 列表格, 单元格白底
//     末尾 .cl 清浮动 + dd.tags/dd.tips(站方文字, 不渲染)
// 契约映射: ①p.fr「加入书架/推荐本书」登录态功能无契约 → 不渲染, 保留「返回书页」(声明)
//           ②表格 4 列 → 契约 100 章/页分页(真站单页全量, 差异声明)
// 色值: 表格底 #E4E4E4/单元格白底来自快照内联 bgcolor 与黑冰家族标准; 其余沿用 R24 实测。
// ============================================================
'use client'

import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, Sk } from '../../bits'

/** [R27-6b-4] 黑冰模板实测色值(同 Home) */
const C = {
  text: '#666666',
  link: '#2f468f',
  hover: '#FF6600',
  border: '#E4E4E4',
} as const
const TITLE_BAR = 'linear-gradient(180deg, #fbfcfe 0%, #e9eef5 100%)'

export function X2552Toc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { navigate } = usePublic()

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-2 py-10">
        <ErrorState message="目录加载失败" detail={error} />
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-2 pb-4" aria-label="目录加载中">
        <Sk className="mt-2 mb-2 h-8 w-1/2" />
        <div className="x2-toc border p-2" style={{ borderColor: C.border, background: C.border }}>
          <div className="grid grid-cols-2 gap-px sm:grid-cols-4" aria-hidden>
            {Array.from({ length: 16 }).map((_, i) => (
              <Sk key={i} className="h-8" style={{ opacity: 1 - (i % 4) * 0.08 }} />
            ))}
          </div>
          <span className="sr-only">加载中…</span>
        </div>
      </div>
    )
  }

  const { book, chapters, tocTotal, tocTotalPages } = data
  // dt 面包屑 + p.fr(真站三链 → 仅「返回书页」有契约)
  const tdCell = 'x2-td block h-full w-full px-2 py-1.5 text-left'

  return (
    <div className="x2-home w-full px-2 pb-4" style={{ color: C.text, fontSize: 12, lineHeight: 1.2 }}>
      <div className="mx-auto w-full max-w-[960px]">
        {/* ============ #a_main: .bdtop + .bdsub > dl ============ */}
        <div style={{ marginTop: 8, border: `1px solid ${C.border}` }}>
          <div aria-hidden style={{ height: 2, border: `1px solid #33CCFF`, background: '#D9EDFF', fontSize: 0 }} />
          <div style={{ padding: 1, background: '#FFFFFF' }}>
            <dl className="m-0">
              {/* dt: 面包屑 + p.fr */}
              <dt className="border-b px-2.5 py-1.5 font-normal" style={{ borderColor: C.border, background: TITLE_BAR, lineHeight: '25px' }}>
                <button type="button" className="x2-a" style={{ cursor: 'pointer' }} onClick={() => navigate({ view: 'home' })} onKeyDown={(e) => e.key === 'Enter' && navigate({ view: 'home' })}>
                  吾爱文学网
                </button>
                {' -> '}
                <button type="button"
                  className="x2-a"
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 })}
                  onKeyDown={(e) => e.key === 'Enter' && navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 })}
                >
                  {book.category || '小说'}
                </button>
                {' -> '}
                <span>{book.name}最新章节</span>
                <span className="float-right hidden sm:inline">
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'book', bookId: book.id })}
                    className="x2-a"
                    style={{ color: C.link, cursor: 'pointer' }}
                    aria-label={`返回《${book.name}》书页`}
                  >
                    返回书页
                  </button>
                </span>
              </dt>
              {/* dd: h1 章节列表标题 */}
              <dd className="m-0 px-2.5 pt-2">
                <h1 className="m-0 py-1 text-[16px] font-bold" style={{ color: C.text }}>
                  {book.name}最新章节
                </h1>
              </dd>
              {/* dd: h3 作者(快照实测 dd h3「作者：贪睡的龙」) */}
              <dd className="m-0 px-2.5 pb-1">
                <h3 className="m-0 py-1 text-[13px] font-bold" style={{ color: C.text }}>
                  作者：{book.author}
                </h3>
              </dd>
              {/* dd: table#at(bgcolor #E4E4E4/cellspacing 1) → 网格等价实现, 4 列(移动 2 列) */}
              <dd className="m-0 p-2.5 pt-1">
                <div className="x2-at grid grid-cols-2 gap-px sm:grid-cols-4" style={{ background: '#E4E4E4' }} role="table" aria-label={`${book.name} 章节目录`}>
                  {chapters.map((c) => (
                    <div key={c.id} role="cell" style={{ background: '#fff' }}>
                      <button
                        type="button"
                        onClick={() => navigate({ view: 'read', chapterId: c.id })}
                        className={`${tdCell} x2-a truncate`}
                        style={{ color: currentChapterId === c.id ? C.hover : C.link, fontWeight: currentChapterId === c.id ? 700 : 400 }}
                        aria-label={`阅读 ${c.title}`}
                        aria-current={currentChapterId === c.id ? 'true' : undefined}
                      >
                        {c.title}
                      </button>
                    </div>
                  ))}
                </div>
                {/* 分页(契约 100 章/页; 真站单页全量 → 差异声明) */}
                {tocTotalPages > 1 && (
                  <nav aria-label="目录分页" className="x2-pages flex flex-wrap items-center justify-center py-2.5">
                    {page > 1 && (
                      <button
                        type="button"
                        onClick={() => navigate({ view: 'toc', bookId: book.id, page: page - 1 })}
                        className="x2-pg m-[2px] inline-flex h-[30px] min-w-[30px] items-center justify-center border px-1 text-[12px]"
                        style={{ borderColor: C.border }}
                        aria-label="上一页"
                      >
                        上一页
                      </button>
                    )}
                    {Array.from({ length: Math.min(10, tocTotalPages) }, (_, i) => Math.max(1, Math.min(page - 4, tocTotalPages - 9)) + i).map((n) =>
                      n === page ? (
                        <strong
                          key={n}
                          className="x2-pg m-[2px] inline-flex h-[30px] min-w-[30px] items-center justify-center border px-1 text-[12px]"
                          style={{ background: C.link, color: '#fff' }}
                          aria-current="page"
                        >
                          {n}
                        </strong>
                      ) : (
                        <button
                          key={n}
                          type="button"
                          onClick={() => navigate({ view: 'toc', bookId: book.id, page: n })}
                          className="x2-pg m-[2px] inline-flex h-[30px] min-w-[30px] items-center justify-center border px-1 text-[12px]"
                          style={{ borderColor: C.border }}
                          aria-label={`第 ${n} 页`}
                        >
                          {n}
                        </button>
                      ),
                    )}
                    {page < tocTotalPages && (
                      <button
                        type="button"
                        onClick={() => navigate({ view: 'toc', bookId: book.id, page: page + 1 })}
                        className="x2-pg m-[2px] inline-flex h-[30px] min-w-[30px] items-center justify-center border px-1 text-[12px]"
                        style={{ borderColor: C.border }}
                        aria-label="下一页"
                      >
                        下一页
                      </button>
                    )}
                  </nav>
                )}
                <p className="mb-0 text-center" style={{ color: C.text }}>
                  共 {tocTotal} 章
                </p>
              </dd>
            </dl>
            <div className="clear-both" />
          </div>
        </div>
      </div>
    </div>
  )
}
