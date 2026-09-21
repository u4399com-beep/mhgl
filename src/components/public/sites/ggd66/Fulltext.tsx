// ============================================================
// [R28-2c] ggd66(格格党) 全本·完本页克隆 —— 扩展视图之 Fulltext
// 真站快照(R28 实测): /tmp/r28-2c/ggd66/ggd66-quanben.html
// (https://www.ggd66.com/quanben/sort/ 直抓, 14.9KB —— R28 新探明: 真站导航「全本」实链,
//  R27 时未发现; 页面模板与 /sort/ 书库完全同构, 差异仅 h2 文案「已完本全部小说小说列表」)
// 真站 DOM: .container > .class(8 分类导航) + .content.book#fengtui(h2.text-center 已完本全部小说小说列表
//   + .bookbox×10) + .pages(共 2 页)
// 映射声明: ①分类导航跳 category 视图(数据层完本为全局筛选, 不与分类叠加);
//   ②h2 文案保留真站「已完本全部小说小说列表」形态; ③bookbox 卡序号全局从 1 起。
// GgdPages/GgdBookBox 复用 ./Category 导出(真站同款模板)。
// ============================================================
'use client'

import type { SiteFulltextProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { GgdBookBox, GgdPages, GGD_LINE, GGD_TEXT_BODY } from './Category'

export function Ggd66Fulltext({ data, loading, error, page }: SiteFulltextProps) {
  const { navigate } = usePublic()

  if (error) {
    return (
      <div className="mx-auto w-[90%] max-w-[1200px] py-10">
        <ErrorState message="完本书单加载失败" detail={error} />
      </div>
    )
  }

  const books = data?.books || []
  const total = data?.total || 0
  const size = data?.size || 24
  const totalPages = Math.max(1, Math.ceil(total / size))

  return (
    <div className="mx-auto w-[90%] max-w-[1200px] pb-10" style={{ color: GGD_TEXT_BODY }}>
      {/* ============ .content.book#fengtui 已完本书单(真站无独立 class 导航差异, 同款白盒) ============ */}
      <div className="ggd-book mt-2.5 border bg-white px-2.5 pb-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.05)]" style={{ borderColor: GGD_LINE }}>
        {/* h2.text-center 真站文案「已完本全部小说小说列表」(模板语义化去重为「已完本全部小说列表」) */}
        <h2 className="ggd-h2 text-center" aria-label="已完本小说列表">
          已完本全部小说列表
          <span className="ml-2 text-[13px] font-normal" style={{ color: GGD_TEXT_BODY }}>
            共 {total} 本
          </span>
        </h2>
        {loading && !books.length ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="完本书单加载中">
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
                <GgdBookBox key={b.id} book={b} no={(page - 1) * size + i + 1} />
              ))}
            </div>
            {/* .pages 分页(真站全本页共 2 页 → 契约 24 本/页) */}
            <GgdPages page={page} totalPages={totalPages} onGo={(p) => navigate({ view: 'fulltext', page: p })} />
          </>
        ) : (
          <p className="py-6 text-center text-sm">暂无已完本小说</p>
        )}
        <div className="clear-both" />
      </div>
    </div>
  )
}
