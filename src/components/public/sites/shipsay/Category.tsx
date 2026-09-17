// ============================================================
// [R28-2e-2] shipsay(船说 CMS demo) 分类/书库页克隆 —— 船说 V4.2 store 页还原
// 素材等级: Wayback 实测 —— /tmp/r28-2e/snap/ss-cat.html(2024-05-20 快照
// demo.shipsay.com/xs/xuanhuan/1/ 完整 DOM) + /tmp/r28-2e/snap/ss-store.html
// (/xs/ 书库总页, 同布局). 真站结构:
//   .store > .store_left > i#store_menu(fa-bars 筛选菜单) + .side_commend >
//     .title(分类名「玄幻魔法」) + #after_menu >
//       div(只看全本 checkbox → /quanben/xs/{slug}/1/) +
//       div(全部分类 + a.onselect 当前类 + 其余分类链) +
//     ul.flex > li(.img_span > a > img.lazy + span「玄幻 / 连载」 + .w100 >
//       a > h2 书名 + p.indent 简介 + .li_bottom > i.fa-user-circle-o 作者 +
//       div > em.orange 字数 + em.blue 日期)
// 契约映射(降级声明):
//   ①「只看全本」真站跳 /quanben/{cat}/ → 本轮已建 Fulltext 视图, checkbox 接
//     navigate(fulltext) 做全站级全本页(契约无按类全本过滤, 声明)
//   ②真站 8 分类 slug(xuanhuan/wuxia/dushi/lishi/kehuan/youxi/nvsheng/qita) → 库内动态分类
//   ③快照无分页段(单页 demo) → 分页钮为家族标准形态(声明)
// 色值: 同首页实测(#f4f4f4/#fff/#666/#1a1a1a/#ed4259/#555/#4284ed/#f0643a/遮罩两色)。
// ============================================================
'use client'

import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { useSiteCats } from '../hooks' // [R35-2d-1] 原逐字节重复的 cats 拉取 effect 收敛
import { ErrorState, Sk } from '../../bits'
import { BookCover } from '../../BookCover'
import { SsBookMain } from './_kit' // [R35-2d-2] 原 Search/Fulltext/Category 三处逐字节重复的书条右栏收敛

/** [R28-2e-2] 船说模板实测色值(同 Home) */
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
  maskOngoing: 'rgba(0,0,0,.4)',
  maskCompleted: 'rgba(191,44,36,.75)',
} as const

/** [R28-2e-2] 船说分页(家族标准: 圆角按钮, 当前页主红; 快照无分页段 → 家族标准声明) */
export function Pager({ page, totalPages, onGo }: { page: number; totalPages: number; onGo: (p: number) => void }) {
  if (totalPages <= 1) return null
  const start = Math.max(1, Math.min(page - 4, totalPages - 9))
  const nums = Array.from({ length: Math.min(10, totalPages) }, (_, i) => start + i)
  const cell = 'ss-pg m-[2px] inline-flex h-[32px] min-w-[32px] items-center justify-center rounded-[3px] border px-1.5 text-[13px]'
  return (
    <nav aria-label="分页" className="ss-pages flex flex-wrap items-center justify-center py-3">
      {page > 1 && (
        <button type="button" onClick={() => onGo(page - 1)} className={cell} aria-label="上一页">
          上一页
        </button>
      )}
      {nums.map((n) =>
        n === page ? (
          <strong key={n} className={cell} style={{ background: C.hover, borderColor: C.hover, color: '#fff' }} aria-current="page">
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

export function ShipsayCategory({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()

  // #after_menu 分类链(库内动态分类; 真站 onselect 高亮)
  const cats = useSiteCats()

  const books = data?.books || []
  // BooksData 契约: total/page/size(无 totalPages) → ceil(total/size) 计算分页
  const totalPages = data ? Math.ceil((data.total || 0) / (data.size || 24)) : 0
  const booting = loading && !books.length

  return (
    <div className="ss-home w-full pb-6" style={{ background: C.bg, color: C.text, fontSize: 14 }}>
      <div className="mx-auto w-full max-w-[960px] px-2 pt-3">
        {error ? (
          <div className="ss-card p-6">
            <ErrorState message="书库加载失败" detail={error} />
          </div>
        ) : (
          <div className="ss-card ss-store p-3">
            {/* .side_commend > .title 分类名 */}
            <h1 className="ss-storetitle m-0 pb-1.5 text-[18px] font-bold" style={{ color: C.title }}>
              {catName}
            </h1>
            {/* #after_menu: div(只看全本 → Fulltext 视图) + div(分类链 onselect) */}
            <div className="ss-after_menu border-b pb-2" style={{ borderColor: C.line }}>
              <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() => navigate({ view: 'fulltext', page: 1 })}
                  className="inline-flex items-center gap-1.5 text-[13px] hover:underline"
                  aria-label="查看全本小说"
                  title="查看全本小说"
                >
                  {/* 真站 label>input checkbox → 视觉空框(交互由按钮承担, 免嵌套表单件) */}
                  <span aria-hidden className="inline-block h-[13px] w-[13px] border align-[-2px]" style={{ borderColor: '#999', background: '#fff' }} />
                  只看全本
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'category', page: 1 })}
                  className={`text-[13px] ${!cat ? 'font-bold' : ''}`}
                  style={{ color: !cat ? C.hover : C.link }}
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
                      className={`ss-cat text-[13px] ${cat === c.id ? 'font-bold' : ''}`}
                      style={{ color: cat === c.id ? C.hover : C.link }}
                      aria-label={`前往 ${c.name} 分类`}
                      aria-current={cat === c.id ? 'true' : undefined}
                    >
                      {c.name}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* ul.flex 书卡列表(img_span 封面 + w100 信息, 真站单列全宽; 移动单列/平板双列) */}
            {booting ? (
              <ul className="ss-flex m-0 grid list-none grid-cols-1 gap-3 pt-3" role="status" aria-label="书库加载中">
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
                        {/* 真站 .img_span > span 遮罩「玄幻 / 连载」(quanben 页为 span.full 全本, 见 Fulltext.tsx) */}
                        <span
                          className="ss-mask absolute inset-x-0 bottom-0 flex items-center justify-between px-1 py-0.5 text-[11px] text-white"
                          style={{ background: b.status === 'completed' ? C.maskCompleted : C.maskOngoing }}
                        >
                          <span className="truncate">{b.category || '小说'} / {b.status === 'completed' ? '全本' : '连载'}</span>
                        </span>
                      </button>
                    </div>
                    <SsBookMain b={b} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-6 text-center text-sm">该分类暂无书籍</p>
            )}
            <Pager page={page} totalPages={totalPages} onGo={(p) => navigate({ view: 'category', cat, page: p })} />
          </div>
        )}
      </div>
    </div>
  )
}
