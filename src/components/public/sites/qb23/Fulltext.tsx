// ============================================================
// [R28-2c] qb23 铅笔小说(www.23qb.net) 全本·完本页克隆 —— 扩展视图之 Fulltext
// 真站快照(R28 实测): /tmp/r28-2c/qb23/qb23-complete.html
//   (/book/lastupdate_0_0_0_0_0_0_5_1_0.html 直抓 —— 真站无独立「全本」页面,
//    完本入口 = 分类页「进度」行「已经完本」筛选片, 页面模板与分类页完全同构)
// 真站 DOM: 同 Category(page-heading 筛选行 + library-stat + .module-items 封面网格 + #page 分页),
//   差异仅: 进度行 selected=已经完本(URL 第 7 段=5)。
// 映射声明: ①页头标题用真站 .library-stat 语言「全部已经完本_更新时间_全部」+ 共 N 本;
//   ②进度行 selected 固定「已经完本」(数据层 status=completed 单维筛选);
//   ③分类/首字/字数/排序行与分类页一致降级(装饰片), 分类行跳 category 视图。
// QbFilterRow/QbFilterChip/QbPageBtn/pageWindowOf 复用 ./Category 导出(真站同款模板)。
// ============================================================
'use client'

import type { SiteFulltextProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { QbCatCard, QbFilterChip, QbFilterRow, QbPageBtn, pageWindowOf } from './Category' // [R34-2c-5] +QbCatCard(私有副本 QbFullCard 逐字节相同, 收敛)

/** [R28-2c-22] 真站实测色值(style.css) */
const QB_TEXT = '#282828'
const QB_MUT40 = 'rgba(0,0,0,0.4)'
const QB_MUT62 = 'rgba(0,0,0,0.62)'

export function Qb23Fulltext({ data, loading, error, page }: SiteFulltextProps) {
  const { navigate } = usePublic()

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
            <ErrorState message="完本书单加载失败" detail={error} />
          </div>
        ) : (
          <>
            {/* ============ .page-heading > .box: 筛选行(进度=已经完本) + library-stat ============ */}
            <div className="rounded-[18px] bg-white p-4 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-[25px]">
              {/* 分类行: 跳 category 视图(真站分类链) */}
              <QbFilterRow label="分类">
                <QbFilterChip label="全部" onClick={() => navigate({ view: 'category', page: 1 })} />
                <QbFilterChip label="浏览全部分类" onClick={() => navigate({ view: 'category', page: 1 })} />
              </QbFilterRow>
              <QbFilterRow label="首字">
                {['全部', '[A]', '[B]', '[C]', '[D]', '[E]', '[F]', '[G]', '[H]', '[I]', '[J]', '[K]'].map((t, i) => (
                  <QbFilterChip key={t} label={t} active={i === 0} />
                ))}
              </QbFilterRow>
              <QbFilterRow label="字数">
                {['全部', '30万以下', '30-50万', '50-100万', '100-200万', '200-300万', '400万以上'].map((t, i) => (
                  <QbFilterChip key={t} label={t} active={i === 0} />
                ))}
              </QbFilterRow>
              <QbFilterRow label="排序">
                {['周点击', '月点击', '周推荐', '月推荐', '新书榜', '字数', '收藏数', '更新时间', '入库时间'].map((t, i) => (
                  <QbFilterChip key={t} label={t} active={i === 7} />
                ))}
              </QbFilterRow>
              <QbFilterRow label="进度">
                {/* 真站完本页: 全部/新书连载/已经完本(selected) */}
                <QbFilterChip label="全部" onClick={() => navigate({ view: 'category', page: 1 })} />
                <QbFilterChip label="新书连载" onClick={() => navigate({ view: 'category', page: 1 })} />
                <QbFilterChip label="已经完本" active />
              </QbFilterRow>
              {/* h1.library-stat: 真站语言 + 共 N 本 */}
              <h1 className="mt-4 text-sm" style={{ color: QB_MUT62 }}>
                全部已经完本_更新时间_全部
                <span className="ml-2" style={{ color: QB_MUT40 }}>
                  共 {total} 本
                </span>
              </h1>
            </div>

            {/* ============ .module > .module-items: 封面网格 ============ */}
            <div className="mt-3 rounded-[18px] bg-white p-4 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-[25px]">
              {loading ? (
                <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-5 sm:gap-x-5 sm:gap-y-5" aria-label="完本书单加载中">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} aria-hidden>
                      <div className="w-full pt-[140%]">
                        <Sk className="h-full w-full rounded-[5px]" />
                      </div>
                      <Sk className="mx-auto mt-3 h-4 w-4/5" style={{ borderRadius: 4 }} />
                    </div>
                  ))}
                  <span className="sr-only">加载中…</span>
                </div>
              ) : books.length ? (
                <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-5 sm:gap-x-5 sm:gap-y-5" aria-label="已经完本书单">
                  {books.map((b) => (
                    <QbCatCard key={b.id} book={b} />
                  ))}
                </div>
              ) : (
                <p className="py-16 text-center text-sm" style={{ color: QB_MUT40 }}>
                  暂无完本书籍
                </p>
              )}

              {/* ============ .module-footer > #page 分页 ============ */}
              {totalPages > 1 && (
                <nav className="pt-6 text-center" aria-label="分页导航">
                  <span className="mr-2 text-sm" style={{ color: QB_MUT40 }}>
                    第{page}/{totalPages}页
                  </span>
                  <QbPageBtn disabled={page <= 1} onClick={() => navigate({ view: 'fulltext', page: page - 1 })} ariaLabel="上一页">
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
                      <QbPageBtn key={p} onClick={() => navigate({ view: 'fulltext', page: p })} ariaLabel={`第 ${p} 页`}>
                        {p}
                      </QbPageBtn>
                    ),
                  )}
                  <QbPageBtn disabled={page >= totalPages} onClick={() => navigate({ view: 'fulltext', page: page + 1 })} ariaLabel="下一页">
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
