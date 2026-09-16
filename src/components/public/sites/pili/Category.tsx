// ============================================================
// [R26-2-20] 霹雳书屋 克隆分类列表页 —— https://www.pilishuwu.com/{cat}/list/{page}.html
// (wmcms 检索页 ret-* 形态; 样本 /tmp/r26/pili-cat.html 本轮 stealthy 桥直抓 +
//  wmcms.page.comicall.css 全文 + 页内 <style> 覆盖块实测)
//
// 真站 DOM:
//   .ui-wm(1200px) > .ret-side-wr(左栏 300px) + .ret-main-wr(主列 870px, margin-left 30px)
//   侧栏 .category-left-rank(白底 padding 15px): h3.rank-side-title「月点击排行」
//     (20px bold #333 + border-left 5px #ff6600) + ol.custom-rank-list > li.rank-item
//     (12px 0 上下距 + 底线 #f2f2f2; .rank-num 22×22 徽章 #ccd0d7, 前三 #ff4a4a/#ff7e3e/#ffb83d;
//      第一名带封面 85×113 + 18px bold 标题 + 13px #666 42px 简介, 2~10 名仅 标题 16px + 作者 13px #888)
//   主列 .ret-main(白底 1px #dadada 边, min-height 788px):
//     .ret-search-head(40px 高 #f3f3f3):
//       ul#search-condition.ret-search-type 排序 tab「更新/点击/字数」(a 66×39 #666, active 白底 #ff9a6a 字,
//         真站页内 <style> 覆盖 a 宽 45px); .ret-result-num「共<em>N</em>个结果」(em bold #333);
//       #pagination1.ret-head-page(a padding 2px 5px #666, current/hover 白字 #ff9a6a 底)
//     .ret-search-result > ul.ret-search-list > li.ret-search-item(双列 391px, padding 24px 20px 24px 24px,
//       右/下 1px #e8e7e6 分格线):
//       .ret-works-cover(a.mod-cover-list-thumb 133×177 #bebebe 边 + .mod-cover-list-mask 底部 22px
//         rgba(0,0,0,.6) 黑条最新章, SunZX_type.css: 黑条文字 #E8E8E8 16px 行高)
//       .ret-works-info(240px): h3.ret-works-title a 18px/20px 微软雅黑 #333;
//         p.ret-works-author「作者：xx」; p.ret-works-tags(分类：xx #666 hover #fa8729 + 点击：<em>N</em>);
//         p.ret-works-decs(SunZX_type.css: -webkit-line-clamp:3 + line-height 18px #999);
//         a.ret-works-view.ui-btn-pink「开始阅读」90×36 (#fffbf6 底/#b6724d 字/#e0cfb1 边,
//         hover #fcf1e1, active #faead0, radius 3px, 16px/36px 微软雅黑)
//     底部分页 .ret-page-wr.mod-page(a 14px 30px 高 padding 0 10px 白底 1px #e0e0e0 #333;
//       hover/current 白字 #ff9a6a 底 1px #ef7559 边)
//
// 推断/降级: ①真站分类页无独立页标题 DOM(身份由头部导航 active 态表达), 但 comicall.css 含
//   .ret-title(5px #ff9a6a 左线 + 24px 微软雅黑) —— 按任务要求补画页头分类名, 标注 [R26-2-20 推断]。
// ②排序 tab(更新/点击/字数)视图层无 sort 参数, active 恒为「更新」, 点击回到该分类第 1 页。
// ③ret-works-view「开始阅读」真站直链第一章; BookItem 无章节 id → 点击转书籍页(契约内路由),
//   封面/书名同链。④侧栏榜单维度另拉 fetchBooks(sort:'words'), 失败回退当前页数据按字数排序。
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import type { BookItem } from '../../types'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { statusLabel } from '../../seo'

const PILI_ORANGE_LIGHT = '#ff9a6a' // 浅橙(排序 active/分页 current/hover)
const PILI_TEXT = '#333333'
const PILI_MUTED = '#999999'

/** [R26-2-21] 通用分页段(真站 mod-page/ret-head-page 两种规格, compact=顶栏小分页) */
function PiliPager({
  page,
  totalPages,
  go,
  compact,
}: {
  page: number
  totalPages: number
  go: (p: number) => void
  compact?: boolean
}) {
  // 页码窗口: 当前页 ±2, 首尾恒显(与真站「第一页/上一页/数字/下一页/最后页」等价的紧凑形态)
  // [R27-6-fix] useMemo 移到早返回之前, 修条件调用 hook 违规(rules-of-hooks)
  const win = useMemo(() => {
    const arr: (number | '…')[] = []
    const lo = Math.max(1, page - 2)
    const hi = Math.min(totalPages, page + 2)
    if (lo > 1) arr.push(1)
    if (lo > 2) arr.push('…')
    for (let i = lo; i <= hi; i++) arr.push(i)
    if (hi < totalPages - 1) arr.push('…')
    if (hi < totalPages) arr.push(totalPages)
    return arr
  }, [page, totalPages])

  if (totalPages <= 1) return null // [R27-6-fix] 早返回后移到 hook 之后

  const btn = compact
    ? // ret-head-page 规格: line-height 16px + padding 2px 5px, current/hover 白字 #ff9a6a 底
      'inline-flex h-[22px] min-w-[22px] items-center justify-center px-[5px] text-xs transition-colors'
    : // mod-page 规格: 30px 高 + padding 0 10px + 1px #e0e0e0 边, current/hover #ff9a6a 底 #ef7559 边
      'inline-flex h-[30px] min-w-[30px] items-center justify-center border px-2.5 text-sm transition-colors'

  return (
    <nav className="flex flex-wrap items-center gap-x-1 gap-y-1.5" aria-label="分页">
      {page > 1 ? (
        <button type="button" onClick={() => go(page - 1)} className={`${btn} bg-white`} style={{ color: PILI_TEXT, borderColor: '#e0e0e0' }} aria-label="上一页">
          上一页
        </button>
      ) : null}
      {win.map((p, i) =>
        p === '…' ? (
          <span key={`e-${i}`} className={`${btn} cursor-default border-transparent bg-transparent`} style={{ color: PILI_MUTED, borderColor: compact ? 'transparent' : 'transparent' }} aria-hidden>
            …
          </span>
        ) : p === page ? (
          <span key={p} className={`${btn}`} style={compact ? { color: '#fff', background: PILI_ORANGE_LIGHT } : { color: '#fff', background: PILI_ORANGE_LIGHT, borderColor: '#ef7559' }} aria-current="page">
            {p}
          </span>
        ) : (
          <button key={p} type="button" onClick={() => go(p)} className={`${btn} bg-white`} style={{ color: PILI_TEXT, borderColor: '#e0e0e0' }} aria-label={`第 ${p} 页`}>
            {p}
          </button>
        ),
      )}
      {page < totalPages ? (
        <button type="button" onClick={() => go(page + 1)} className={`${btn} bg-white`} style={{ color: PILI_TEXT, borderColor: '#e0e0e0' }} aria-label="下一页">
          下一页
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </nav>
  )
}

/** [R26-2-22] 侧栏「月点击排行」(category-left-rank + custom-rank-list, 真站页内 <style> 实测规格) */
function PiliRankSide({ books, loading }: { books: BookItem[]; loading: boolean }) {
  const { navigate } = usePublic()
  const numBg = (i: number) => (i === 0 ? '#ff4a4a' : i === 1 ? '#ff7e3e' : i === 2 ? '#ffb83d' : '#ccd0d7')
  return (
    <aside className="bg-white p-[15px]" aria-label="月点击排行" style={{ border: '1px solid #dadada' }}>
      <h3
        className="mb-5 border-l-[5px] pl-3 text-xl font-bold leading-none"
        style={{ color: PILI_TEXT, borderColor: '#ff6600' }}
      >
        月点击排行
      </h3>
      {loading ? (
        <div className="space-y-3" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <Sk key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        <ol style={{ listStyle: 'none', counterReset: 'hot-rank' }}>
          {books.slice(0, 10).map((b, i) => (
            <li
              key={b.id}
              className="overflow-hidden border-b py-3 last:border-b-0"
              style={{ borderColor: '#f2f2f2' }}
            >
              <div className="flex gap-2.5">
                <span
                  className="mt-0.5 inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[3px] text-[13px] font-bold text-white"
                  style={{ background: numBg(i) }}
                  aria-label={`第 ${i + 1} 名`}
                >
                  {i + 1}
                </span>
                {/* 第一名带封面 85×113 + 两行标题 + 简介; 2~10 名仅文字(真站 .rank-img/.rank-s 其余 display:none) */}
                {i === 0 ? (
                  <div className="min-w-0 flex-1 cursor-pointer" {...{ role: 'button', tabIndex: 0 }} onClick={() => navigate({ view: 'book', bookId: b.id })} onKeyDown={(e) => { if (e.key === 'Enter') navigate({ view: 'book', bookId: b.id }) }} aria-label={`查看《${b.name}》详情`}>
                    <div className="flex gap-3">
                      <div className="h-[113px] w-[85px] shrink-0 overflow-hidden rounded-[4px]" style={{ boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
                        <BookCover name={b.name} cover={b.cover} showAuthor={b.author} style={{ borderRadius: 4 }} className="h-full w-full" />
                      </div>
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-lg font-bold leading-snug transition-colors hover:text-[#ff6600]" style={{ color: PILI_TEXT }}>{b.name}</p>
                        <p className="mt-1.5 text-[13px]" style={{ color: '#888888' }}>作者：{b.author}</p>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-3 h-[62px] text-[13px] leading-[1.6] text-justify" style={{ color: '#666666' }}>{b.intro || '暂无简介'}</p>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: b.id })}
                      aria-label={`查看《${b.name}》详情`}
                      className="block max-w-full truncate text-left text-base leading-[1.4] transition-colors hover:text-[#ff6600]"
                      style={{ color: PILI_TEXT }}
                    >
                      {b.name}
                    </button>
                    <p className="mt-1.5 truncate text-[13px]" style={{ color: '#888888' }}>作者：{b.author}</p>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}

/** [R26-2-23] 检索条目(真站 li.ret-search-item 双列 391px 规格) */
function PiliSearchItem({ b }: { b: BookItem }) {
  const { navigate } = usePublic()
  const goBook = () => navigate({ view: 'book', bookId: b.id })
  return (
    // 列分格线: 底线全员 + 桌面奇数项右侧线(真站 border-right #e8e7e6, 经 .clone-pili css 注入)
    <li className="pili-cat-item flex gap-3.5 border-b p-6" style={{ borderColor: '#e8e7e6' }}>
      {/* 封面 133×177 #bebebe 边 + 底部 22px rgba(0,0,0,.6) 最新章黑条(mod-cover-list-mask) */}
      <div
        className="relative w-[120px] shrink-0 cursor-pointer overflow-hidden border sm:w-[133px]"
        style={{ borderColor: '#bebebe' }}
        onClick={goBook}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') goBook() }}
        aria-label={`查看《${b.name}》详情`}
      >
        <BookCover name={b.name} cover={b.cover} showAuthor={b.author} style={{ borderRadius: 0 }} className="h-[158px] w-full sm:h-[177px]" />
        <span className="absolute bottom-0 left-0 flex h-[22px] w-full items-center justify-center overflow-hidden bg-black/60 px-1 text-center text-[11px] text-[#e8e8e8]">
          <span className="truncate">{b.latestChapter || '连载中'}</span>
        </span>
      </div>
      {/* 信息列 240px(ret-works-info) */}
      <div className="min-w-0 flex-1">
        <h3 className="mb-2.5 truncate">
          <button
            type="button"
            onClick={goBook}
            aria-label={`查看《${b.name}》详情`}
            className="max-w-full truncate text-left text-lg leading-5 transition-colors hover:text-[#fa8729]"
            style={{ color: PILI_TEXT }}
          >
            {b.name}
          </button>
        </h3>
        <p className="truncate text-[13px]" style={{ color: '#666666' }}>作者：{b.author}</p>
        <p className="mt-[5px] flex items-center gap-2.5 overflow-hidden whitespace-nowrap text-[13px]">
          <button
            type="button"
            onClick={() => navigate({ view: 'category', cat: b.categoryId || undefined })}
            aria-label={`浏览 ${b.category} 分类`}
            className="shrink-0 transition-colors hover:text-[#fa8729]"
            style={{ color: '#666666' }}
          >
            分类：{b.category}
          </button>
          <span className="shrink-0" style={{ color: '#666666' }}>
            <em className="font-bold not-italic">{statusLabel(b.status)}</em>
          </span>
          <span className="shrink-0 tabular-nums" style={{ color: '#666666' }}>{b.wordCount >= 10000 ? `${(b.wordCount / 10000).toFixed(1)}万字` : `${b.wordCount}字`}</span>
        </p>
        {/* 简介(SunZX_type.css: line-clamp 3 + 18px 行高 #999) */}
        <p className="mt-[5px] line-clamp-3 text-left text-[13px]" style={{ color: PILI_MUTED, lineHeight: '18px', height: 54, overflow: 'hidden' }}>
          {b.intro || '暂无简介'}
        </p>
        {/* 开始阅读(ui-btn-pink 90×36; 真站直链第一章, 无章节 id → 转书籍页) */}
        <button
          type="button"
          onClick={goBook}
          aria-label={`开始阅读《${b.name}》`}
          className="mt-2.5 inline-flex h-9 w-[90px] items-center justify-center rounded-[3px] border text-base transition-colors"
          style={{ color: '#b6724d', background: '#fffbf6', borderColor: '#e0cfb1' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#fcf1e1' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#fffbf6' }}
        >
          开始阅读
        </button>
      </div>
    </li>
  )
}

export function PiliCategory({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { site, navigate } = usePublic()

  // [R26-2-24] 侧栏「月点击排行」第二维度(sort:'words'), 失败回退当前页数据按字数排序
  const [rank, setRank] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 10 })
      .then((d) => { if (alive) setRank(d.books || []) })
      .catch(() => { if (alive) setRank([]) })
    return () => { alive = false }
  }, [site.id])
  const rankList = useMemo<BookItem[]>(() => {
    if (rank && rank.length) return rank
    return [...(data?.books || [])].sort((a, b) => b.wordCount - a.wordCount).slice(0, 10)
  }, [rank, data])

  const books = data?.books || []
  const total = data?.total || 0
  const size = data?.size || 24
  const totalPages = Math.max(1, Math.ceil(total / size))
  const go = (p: number) => navigate({ view: 'category', cat: cat || undefined, page: p })
  // 页头分类名: 真站导航标签「全部小说/男频小说/…」, cat 空时视图层下发「全部分类」→ 按 0/list 显示「全部小说」
  const pageTitle = cat ? `${catName}` : '全部小说'

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-5 sm:px-6" style={{ color: PILI_TEXT }}>
      {/* 页头分类名(ret-title: 5px #ff9a6a 左线 + 24px 微软雅黑) [推断补画, 真站身份由导航 active 表达] */}
      <h1 className="mb-5 ml-1 border-l-[5px] pl-3 text-2xl leading-[26px] font-normal" style={{ borderColor: PILI_ORANGE_LIGHT }}>
        {pageTitle}
        <span className="ml-2 text-sm font-normal" style={{ color: PILI_MUTED }}>共 {total} 本</span>
      </h1>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-[30px]">
        {/* ============ 主列(ret-main) ============ */}
        <div className="order-2 min-w-0 lg:order-1">
          {error ? (
            <ErrorState message="分类数据加载失败" detail={error} />
          ) : (
            <div className="min-h-[500px] border bg-white" style={{ borderColor: '#dadada' }}>
              {/* 检索头(ret-search-head 40px #f3f3f3): 排序 tab + 共 N 个结果 + 顶部小分页 */}
              <div className="flex h-10 items-center justify-between rounded-[2px] pr-3" style={{ background: '#f3f3f3', margin: 1 }}>
                <ul className="flex h-full items-stretch" style={{ listStyle: 'none' }} aria-label="排序方式">
                  {['更新', '点击', '字数'].map((t, i) => (
                    <li key={t} className={i === 0 ? 'bg-white' : ''} style={{ borderRight: '1px solid #fff' }}>
                      <button
                        type="button"
                        onClick={() => go(1)}
                        aria-label={`按${t}排序(当前视图层固定按更新时间)`}
                        className="flex h-[38px] w-[64px] items-center justify-center gap-1 text-sm transition-colors"
                        style={{ color: i === 0 ? PILI_ORANGE_LIGHT : '#666666' }}
                      >
                        <span aria-hidden className="inline-block h-0 w-0 border-x-[4px] border-t-[5px] border-b-0 border-x-transparent" style={{ borderTopColor: i === 0 ? PILI_ORANGE_LIGHT : '#c9c9c9' }} />
                        {t}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-4">
                  <span className="text-[13px]" style={{ color: '#666666' }}>
                    共<em className="mx-1 font-bold not-italic" style={{ color: PILI_TEXT }}>{total}</em>个结果
                  </span>
                  <span className="hidden md:block">
                    <PiliPager page={page} totalPages={totalPages} go={go} compact />
                  </span>
                </div>
              </div>

              {/* 列表(ret-search-list 双列分格) */}
              {loading ? (
                <ul className="grid grid-cols-1 lg:grid-cols-2" style={{ listStyle: 'none' }} aria-label="加载中">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <li key={i} className="flex gap-3.5 border-b p-6 lg:border-r" style={{ borderColor: '#e8e7e6' }} aria-hidden>
                      <Sk className="h-[158px] w-[120px] shrink-0 sm:h-[177px] sm:w-[133px]" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Sk className="h-5 w-3/4" />
                        <Sk className="h-3.5 w-1/2" />
                        <Sk className="h-3.5 w-full" />
                        <Sk className="h-9 w-[90px] rounded-[3px]" />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : books.length ? (
                <ul className="pili-cat-list grid grid-cols-1 lg:grid-cols-2" style={{ listStyle: 'none' }}>
                  {books.map((b) => (
                    <PiliSearchItem key={b.id} b={b} />
                  ))}
                </ul>
              ) : (
                <div className="px-6 py-24 text-center" aria-label="暂无结果">
                  <h3 className="text-lg" style={{ color: '#666666' }}>没有找到相关作品</h3>
                  <p className="mt-2 text-xs" style={{ color: PILI_MUTED }}>换个分类或从首页看看最新入库吧</p>
                </div>
              )}

              {/* 底部分页(ret-page-wr.mod-page) */}
              <div className="flex justify-center py-5">
                <PiliPager page={page} totalPages={totalPages} go={go} />
              </div>
            </div>
          )}
        </div>

        {/* ============ 侧栏(ret-side-wr 300px, 桌面居左; 移动端置底) ============ */}
        <div className="order-1 min-w-0 lg:order-2 lg:max-w-[300px]">
          <PiliRankSide books={rankList} loading={loading || (!rank && !data)} />
        </div>
      </div>
    </div>
  )
}
