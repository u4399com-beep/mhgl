// ============================================================
// [R28-2e-7] shipsay(船说 CMS demo) 全本·完本页克隆 —— R28 扩展页型
// 素材等级: Wayback 实测 —— /tmp/r28-2e/snap/ss-full.html(2024-05-20 快照
// demo.shipsay.com/quanben/xs/「完本」页完整 DOM, 本轮新抓): 与分类页同构 .store 布局:
//   .store > .store_left > i#store_menu + .side_commend > .title「全部小说」 +
//   #after_menu > div(只看全本 checkbox checked="checked" → /xs/ 切回) +
//   div(全部分类 a.onselect + /quanben/xs/{slug}/1/ 分类链) +
//   ul.flex > li(.img_span > a > img + span.full「科幻 / 全本」 + .w100 信息)
// 契约映射(降级声明):
//   ①真站全本页标题「全部小说」(全本态) → 契约语义命名「全本小说」(声明)
//   ②真站 checkbox 按类切全本(/quanben/xs/{cat}/) → 契约全本页为全站级 → 分类链切回
//     分类视图而非按类全本(声明)
//   ③span.full 遮罩: 全本页实测恒 rgba(191,44,36,.75) 系遮罩红; 本页数据全为 completed → 恒红(声明)
//   ④分页钮家族标准形态(快照无分页段, 同分类页声明)
// ============================================================
'use client'

import type { SiteFulltextProps } from '../shared'
import { usePublic } from '../../ctx'
import { useSiteCats } from '../hooks' // [R35-2d-1] 原逐字节重复的 cats 拉取 effect 收敛
import { ErrorState, Sk } from '../../bits'
import { BookCover } from '../../BookCover'
import { Pager } from './Category'
import { SsBookMain } from './_kit' // [R35-2d-2] 原 Search/Fulltext/Category 三处逐字节重复的书条右栏收敛

/** [R28-2e-7] 船说模板实测色值(同 Home) */
const C = {
  bg: '#f4f4f4',
  card: '#ffffff',
  text: '#666666',
  link: '#1a1a1a',
  hover: '#ed4259',
  title: '#555555',
  blue: '#4284ed',
  orange: '#f0643a',
  line: '#e3e3e3',
  maskCompleted: 'rgba(191,44,36,.75)',
} as const

export function ShipsayFulltext({ data, loading, error, page }: SiteFulltextProps) {
  const { navigate } = usePublic()

  // #after_menu 分类链(全本页真站为 /quanben/xs/{slug}/ → 契约降级为切回普通分类, 声明)
  const cats = useSiteCats()

  const books = data?.books || []
  const totalPages = data ? Math.ceil((data.total || 0) / (data.size || 24)) : 0
  const booting = loading && !books.length

  return (
    <div className="ss-home w-full pb-6" style={{ background: C.bg, color: C.text, fontSize: 14 }}>
      <div className="mx-auto w-full max-w-[960px] px-2 pt-3">
        {error ? (
          <div className="ss-card p-6">
            <ErrorState message="全本列表加载失败" detail={error} />
          </div>
        ) : (
          <div className="ss-card ss-store p-3">
            {/* .side_commend > .title(真站全本态「全部小说」) */}
            <h1 className="ss-storetitle m-0 pb-1.5 text-[18px] font-bold" style={{ color: C.title }}>
              全本小说
            </h1>
            {/* #after_menu: 只看全本 checked(实测 checked="checked") → 点击切回全部; 分类链 */}
            <div className="ss-after_menu border-b pb-2" style={{ borderColor: C.line }}>
              <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() => navigate({ view: 'category', page: 1 })}
                  className="inline-flex items-center gap-1.5 text-[13px] hover:underline"
                  aria-label="查看全部小说(含连载)"
                  title="查看全部小说(含连载)"
                >
                  {/* 真站 checked="checked" → 实底红勾框(视觉) */}
                  <span aria-hidden className="inline-block h-[13px] w-[13px] border align-[-2px]" style={{ borderColor: C.hover, background: C.hover }} />
                  只看全本
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'category', page: 1 })}
                  className="text-[13px] font-bold"
                  style={{ color: C.hover }}
                  aria-label="全部分类"
                >
                  全部分类
                </button>
                {cats === null ? (
                  <Sk className="inline-block h-4 w-1/2 align-middle" />
                ) : (
                  cats.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => navigate({ view: 'category', cat: c.id, page: 1 })}
                      className="ss-cat text-[13px]"
                      style={{ color: C.link }}
                      aria-label={`前往 ${c.name} 分类(含连载)`}
                    >
                      {c.name}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* ul.flex 书卡列表(全本页 span.full 恒「{分类} / 全本」) */}
            {booting ? (
              <ul className="ss-flex m-0 grid list-none grid-cols-1 gap-3 pt-3" role="status" aria-label="全本列表加载中">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex">
                    <Sk className="mr-2.5 h-[106px] w-[80px] shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <Sk className="h-4 w-3/4" />
                      <Sk className="h-3 w-full" />
                      <Sk className="h-3 w-1/2" />
                    </div>
                  </li>
                ))}
                <span className="sr-only">加载中…</span>
              </ul>
            ) : books.length ? (
              <ul className="ss-flex m-0 grid list-none grid-cols-1 gap-x-4 gap-y-3 pt-3 sm:grid-cols-2">
                {books.map((b) => (
                  <li key={b.id} className="ss-storeitem flex">
                    <div className="ss-img_span relative mr-2.5 shrink-0 overflow-hidden" style={{ width: 80, height: 106 }}>
                      <button type="button" onClick={() => navigate({ view: 'book', bookId: b.id })} className="block h-full w-full cursor-pointer" aria-label={`查看《${b.name}》详情`}>
                        <BookCover name={b.name} cover={b.cover} className="h-full w-full transition-transform duration-200 hover:scale-[1.08]" style={{ borderRadius: 0 }} />
                        {/* 真站全本页 span.full「科幻 / 全本」遮罩(实测恒完本红) */}
                        <span
                          className="ss-mask ss-full absolute inset-x-0 bottom-0 flex items-center justify-between px-1 py-0.5 text-[11px] text-white"
                          style={{ background: C.maskCompleted }}
                        >
                          <span className="truncate">{b.category || '小说'} / 全本</span>
                        </span>
                      </button>
                    </div>
                    <SsBookMain b={b} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-6 text-center text-sm">暂无全本书籍</p>
            )}
            <Pager page={page} totalPages={totalPages} onGo={(p) => navigate({ view: 'fulltext', page: p })} />
          </div>
        )}
      </div>
    </div>
  )
}
