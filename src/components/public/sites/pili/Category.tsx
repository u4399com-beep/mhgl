// ============================================================
// [R28-2b-2] 霹雳书屋 克隆分类页 —— https://www.pilishuwu.com/0/list/1.html
//            (真站 /{cat}/list/{page}.html, wmcms.page.comicall.css)
//
// 真站快照: /tmp/r28-2b/pili/all-list.html(2026-09-16 实抓 69K)
// CSS 存档: /tmp/r28-2b/pili/wmcms.page.comicall.css + SunZX_type.css + 页内 <style>(侧栏排行)
//
// 真站 DOM:
//   .category-left-rank(左 300px 白盒): h3.rank-side-title「月点击排行」(20px/700/#333,
//     左竖条 5px #ff6600) + ol.custom-rank-list(rank-item 行: rank-num 22px 徽章底
//     #ccd0d7, 前 3 名 #ff4a4a/#ff7e3e/#ffb83d; 第一名带 85×113 封面; rank-t 16px
//     标题 hover #ff6600 / rank-a 13px #888 作者 / rank-s 13px #666 简介)
//   .ret-search-head(h 40px 底 #f3f3f3): ul#search-condition 排序 tab(更新/点击/字数,
//     active 橙) + .ret-head-page 顶部分页 + .ret-result-num「共N个结果」(em 700 #333)
//   ul.ret-search-list: li.ret-search-item(宽 391px 高 180px, 右/底 1px #e8e7e6 格线,
//     padding 24px 20px 24px 24px) = 左 .ret-works-cover(封面 + mod-cover-list-updata
//     底部章节黑条) + 右 .ret-works-info(h3.ret-works-title 18px/20px 微软雅黑 #333 ·
//     .ret-works-author 作者 · .ret-works-tags(分类+点击) · .ret-works-decs 54px #999
//     3 行省略 · .ret-works-view ui-btn-pink「开始阅读」90×36 圆角 3px)
//   .mod_page 分页: a(#545655) hover/current(白字 底 #ff9a6a)
//
// 降级: ①真站「点击：N」计数无契约 → 以分类名/字数替代 ②排序 tab 为本页客户端排序
// (真站服务端全量排序) ③月点击排行侧栏 = fetchBooks(sort:'words') 字数近似。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks, fetchCategories } from '../../data'
import type { BookItem } from '../../types'
import { BookCover } from '../../BookCover'
import { EmptyState, ErrorState, Sk, bookNavProps } from '../../bits'
import { PiliResultCard } from './_kit' // [R35-2d-3] 原 Search/Category 逐字节重复的结果卡收敛

const ORANGE = '#fd8929'
const ORANGE_LIGHT = '#ff9a6a'
const TITLE = '#333333'
// 真站 rank-num 徽章色(页内 <style> 实测)
const RANK_BADGE = ['#ff4a4a', '#ff7e3e', '#ffb83d']
const RANK_BADGE_REST = '#ccd0d7'

type SortKey = 'update' | 'click' | 'words'

/** [R28-2b-2] 排序 tab(真站 #search-condition 更新/点击/字数; 本页客户端排序) */
function SortTabs({ active, onSort }: { active: SortKey; onSort: (k: SortKey) => void }) {
  const items: { key: SortKey; label: string }[] = [
    { key: 'update', label: '更新' },
    { key: 'click', label: '点击' },
    { key: 'words', label: '字数' },
  ]
  return (
    <ul className="flex items-center gap-1" style={{ listStyle: 'none' }} role="tablist" aria-label="排序方式">
      {items.map((it) => {
        const on = it.key === active
        return (
          <li key={it.key}>
            <button
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSort(it.key)}
              className="px-2.5 py-1 text-xs transition-colors"
              style={{ color: on ? ORANGE : '#666666', fontWeight: on ? 700 : 400 }}
            >
              {it.label}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function sortBooks(books: BookItem[], key: SortKey): BookItem[] {
  const arr = [...books]
  if (key === 'update') arr.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  else arr.sort((a, b) => b.wordCount - a.wordCount) // 点击→字数近似(降级②)
  return arr
}

/** [R28-2b-2] 左栏月点击排行(category-left-rank, 第一名带大封面) */
function PiliCatRank({ books }: { books: BookItem[] }) {
  const { navigate } = usePublic()
  if (!books.length) return null
  return (
    <aside className="rounded-[3px] border border-[#f0f0f0] bg-white p-4" aria-label="月点击排行">
      <h3 className="mb-4 border-l-[5px] pl-3 text-xl font-bold leading-none" style={{ color: TITLE, borderColor: '#ff6600' }}>
        月点击排行
      </h3>
      <ol style={{ listStyle: 'none' }}>
        {books.slice(0, 8).map((b, i) => (
          <li key={b.id} className="flex gap-3 py-3" style={{ borderBottom: i < 7 ? '1px solid #f2f2f2' : undefined }}>
            <span
              aria-hidden
              className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[3px] text-[13px] font-bold text-white"
              style={{ background: i < 3 ? RANK_BADGE[i] : RANK_BADGE_REST }}
            >
              {i + 1}
            </span>
            {i === 0 && (
              <div {...bookNavProps(navigate, b.id)} className="relative h-[113px] w-[85px] shrink-0 cursor-pointer overflow-hidden rounded-[4px] shadow-[0_4px_8px_rgba(0,0,0,0.1)]" aria-label={`查看《${b.name}》详情`}>
                <BookCover name={b.name} cover={b.cover} style={{ borderRadius: 4 }} className="absolute inset-0 h-full w-full" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => navigate({ view: 'book', bookId: b.id })}
                className="block max-w-full truncate text-left text-base text-[#333333] transition-colors hover:text-[#ff6600]"
                aria-label={`查看《${b.name}》详情`}
              >
                {b.name}
              </button>
              <p className="mt-1.5 text-[13px]" style={{ color: '#888888' }}>作者：{b.author}</p>
              {i === 0 && <p className="mt-2 line-clamp-2 text-[13px] leading-normal" style={{ color: '#666666' }}>{b.intro || '暂无简介'}</p>}
            </div>
          </li>
        ))}
      </ol>
    </aside>
  )
}

export function PiliCategory({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { site, navigate } = usePublic()
  const [sort, setSort] = useState<SortKey>('update')
  // 侧栏点击榜: 字数近似(降级③), 切站/分类切换不重拉(站级数据)
  const [sideRank, setSideRank] = useState<BookItem[]>([])
  // 分类筛选条: 通用分类接口(与视图壳同源)
  const [cats, setCats] = useState<{ id: string; name: string }[]>([])
  const [prevSite, setPrevSite] = useState(site.id)
  if (prevSite !== site.id) {
    setPrevSite(site.id)
    setSideRank([])
    setCats([])
  }
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 8 })
      .then((d) => alive && setSideRank(d.books))
      .catch(() => {
        /* 侧栏榜失败静默 */
      })
    fetchCategories()
      .then((list) => alive && setCats(list.map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => {
        /* 筛选条失败静默 */
      })
    return () => {
      alive = false
    }
  }, [site.id])

  const books = data?.books || []
  const shown = sortBooks(books, sort)
  const total = data?.total ?? 0
  const totalPages = data ? Math.max(1, Math.ceil(total / data.size)) : 1

  return (
    <div className="bg-[#fbfbfb] py-5 text-[#333333]">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* 分类筛选条(真站频道导航为 mod-top-nav; 此处复用侧栏语义补全分类跳转) */}
        <nav aria-label="分类频道" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[3px] bg-white px-4 py-2.5 text-sm">
          <button
            type="button"
            onClick={() => navigate({ view: 'category' })}
            className="font-bold transition-colors hover:text-[#fa8729]"
            style={{ color: !cat ? ORANGE : '#333333' }}
          >
            全部小说
          </button>
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate({ view: 'category', cat: c.id })}
              className="transition-colors hover:text-[#fa8729]"
              style={{ color: cat === c.id ? ORANGE : '#666666', fontWeight: cat === c.id ? 700 : 400 }}
            >
              {c.name}
            </button>
          ))}
        </nav>

        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <div className="order-2 lg:order-1">
            <PiliCatRank books={sideRank} />
          </div>

          <div className="order-1 min-w-0 lg:order-2">
            {/* ret-search-head: 排序 + 共N个结果 */}
            <div className="flex h-10 items-center justify-between gap-3 px-3" style={{ background: '#f3f3f3' }}>
              <SortTabs active={sort} onSort={setSort} />
              <span className="truncate text-xs" style={{ color: '#666666' }}>
                {catName} · 共<em className="mx-0.5 font-bold not-italic" style={{ color: TITLE }}>{total}</em>个结果
              </span>
            </div>

            {error ? (
              <ErrorState message="分类列表加载失败" detail={error} />
            ) : loading ? (
              <div className="grid gap-px bg-white sm:grid-cols-2" aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => <Sk key={i} className="h-[180px] rounded-none" />)}
              </div>
            ) : shown.length ? (
              <ul className="grid bg-white sm:grid-cols-2" style={{ listStyle: 'none' }}>
                {shown.map((b) => <PiliResultCard key={b.id} book={b} />)}
              </ul>
            ) : (
              <div className="bg-white p-6">
                <EmptyState text="本分类暂无书籍" hint="换个分类或翻页看看" />
              </div>
            )}

            {/* mod_page 分页(current #ff9a6a) */}
            {totalPages > 1 && (
              <nav aria-label="分页" className="flex flex-wrap items-center justify-center gap-1 py-5">
                {page > 1 && (
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'category', cat, page: page - 1 })}
                    className="px-2 py-1 text-sm text-[#545655]"
                    aria-label="上一页"
                  >
                    上一页
                  </button>
                )}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                  const n = start + i
                  if (n > totalPages) return null
                  const on = n === page
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => navigate({ view: 'category', cat, page: n })}
                      className="h-6 min-w-[24px] px-1.5 text-sm leading-4 transition-colors"
                      style={on ? { color: '#fff', background: ORANGE_LIGHT } : { color: '#545655' }}
                      aria-current={on ? 'page' : undefined}
                      aria-label={`第 ${n} 页`}
                    >
                      {n}
                    </button>
                  )
                })}
                {page < totalPages && (
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'category', cat, page: page + 1 })}
                    className="px-2 py-1 text-sm text-[#545655]"
                    aria-label="下一页"
                  >
                    下一页
                  </button>
                )}
              </nav>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
