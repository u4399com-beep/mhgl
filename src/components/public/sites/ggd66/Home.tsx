// ============================================================
// [R27-6-1] ggd66(格格党) 首页克隆 —— 按 https://www.ggd66.com/ 首页真站快照逐节还原
// (/tmp/r27-f/ggd66-home.html + ggd66-style.css 实测, 2026 抓取)
//
// 真站 DOM(.container 90%/max 1200px > .content):
//   .content①  .content-left#fengtui(73%)      h2 热门小说推荐 + .item×6(两列浮动 50%):
//   │            .image(120px 封面/1px #ccc 边/白底) + dl(dt: 书名 15px 700 + 右浮作者 14px,
//   │            底边 1px dotted #ccc/高 25px; dd: 简介 14px/24px/缩进 2em/高 90pt=120px 钳 5 行)
//   │            .content-right#fengyou(25%)   .search 表单(边 2px #56ccb5/圆角 5px; input 80%/38px/
//   │            │                              底 #f9f9f9/字 #56ccb5; button 右浮 20%/38px 底 #56ccb5 白字)
//   │            │                              + h2 阅读排行榜(移动端 visible-xs) + ul li([分类] 书名 作者,
//   │            │                              高 28px/底边 1px dashed #ccc/行高 28px; a 15px; span 右浮 14px)
//   .content②  .content-right#zuixin           h2 最新小说 + ul li(同 #fengyou 行式)
//   │          .content-left#gengxin           h2 最近更新 + ul li(s1 分类 75px/s2 书名 165px/s3 最新章节
//   │                                          链接/s5 时间 右浮 90px/s4 作者 右浮 90px; 高 28px/dashed)
//   .footer    底 #56ccb5 白字(全站 .site-footer 由 themes customCss 承担, 本组件不重复渲染)
// 注: ①真站 .header(#1abc9c 50px 高白字导航)由 SiteHeader ggd66 头部承担, 本组件从 .content 起渲染
//    ②真站搜索提交 /search 页 → 模板 navigate({view:'search'}); 排行榜/列表行点击 → 书页
// 色板出处(ggd66-style.css): body #f9f9f9/#888/15px · a #00886d · hover #f50 · #56ccb5(×10 按钮底/搜索边)
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteHomeProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../data'
import type { BookItem } from '../../types'
import { BookCover } from '../BookCover'
import { Sk, bookNavProps } from '../bits'

/** [R27-6-1] 真站实测色值(ggd66-style.css 逐条规则) */
const TEAL = '#56ccb5' // .btn-info/.search button/.footer/.pages strong(×10)
const GREEN_LINK = '#00886d' // a 常态色
const TEXT_BODY = '#888' // body 文字
const TEXT_DARK = '#333' // h2 标题
const LINE = '#ccc' // h2 底边/虚线行/封面边
const COVER_BG = '#fff' // .image img 白底衬边

/** [R27-6-1] 短时间格式(真站 #gengxin s5「09-16 01:22」形态) */
function fmtShort(d?: string): string {
  if (!d) return ''
  return d.slice(5, 16).replace('T', ' ')
}

export function Ggd66Home({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()

  // [R27-6-1] 阅读排行榜(真站 #fengyou ul 13 行, 点击榜基因 → 字数热榜喂形; 失败回退 props)
  const [rank, setRank] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 13 })
      .then((d) => {
        if (alive) setRank(d.books || [])
      })
      .catch(() => {
        if (alive) setRank([])
      })
    return () => {
      alive = false
    }
  }, [site.id])
  const rankList: BookItem[] = rank && rank.length ? rank : books.slice(0, 13)

  // [R27-6-1] 最近更新(真站 #gengxin: 分类/书名/最新章节/时间/作者 五段行) — updatedAt 有序的 props 前 16 本
  const updated = books.filter((b) => b.updatedAt).slice(0, 16)

  // [R27-6-1] 真站 .search 表单(input 80% + button 20%)
  const [kw, setKw] = useState('')
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const t = kw.trim()
    if (!t) return
    navigate({ view: 'search', q: t })
  }

  // [R27-6-1] #fengtui 热门推荐 6 本(封面+文案卡, 真站两列浮动 → 网格)
  const recs = books.slice(0, 6)
  // [R27-6-1] #zuixin 最新小说列表(真站 24+ 行 → props 前 24)
  const latest = books.slice(0, 24)

  return (
    <div className="w-full pb-10" style={{ color: TEXT_BODY }}>
      {/* ============ .content① : #fengtui(左 73%) + #fengyou(右 25%) ============ */}
      <div className="mx-auto w-[90%] max-w-[1200px]">
        <div className="flex flex-col gap-5 lg:flex-row lg:gap-[2%]">
          {/* ---- #fengtui 热门小说推荐(左 73%, .item 两列) ---- */}
          <section className="min-w-0 lg:w-[73%]">
            <h2 className="ggd-h2" aria-label="热门小说推荐">
              热门小说推荐
            </h2>
            {loading && !books.length ? (
              <div className="grid grid-cols-1 gap-x-[2%] sm:grid-cols-2" role="status" aria-label="热门推荐加载中">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex py-2.5">
                    <Sk className="mr-2.5 h-[150px] w-[120px] shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <Sk className="h-4 w-4/5" />
                      <Sk className="h-3 w-1/3" />
                      <Sk className="h-3 w-full" />
                      <Sk className="h-3 w-5/6" />
                    </div>
                  </div>
                ))}
                <span className="sr-only">加载中…</span>
              </div>
            ) : recs.length ? (
              <div className="grid grid-cols-1 gap-x-[2%] sm:grid-cols-2">
                {recs.map((b) => (
                  <div key={b.id} className="ggd-item flex py-2.5">
                    {/* .image 封面(120px/1px #ccc 边/白底衬) */}
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: b.id })}
                      className="block h-[150px] w-[120px] shrink-0 overflow-hidden border p-px"
                      style={{ borderColor: LINE, background: COVER_BG }}
                      aria-label={`查看《${b.name}》详情`}
                    >
                      <BookCover name={b.name} cover={b.cover} className="h-full w-full" style={{ borderRadius: 0 }} />
                    </button>
                    <dl className="min-w-0 flex-1 pl-2.5">
                      {/* dt: 书名(左 700 15px) + 作者(右浮 400 14px), 底边 dotted #ccc 高 25px */}
                      <dt className="ggd-item-dt flex items-baseline justify-between gap-2 border-b border-dotted pb-0.5">
                        <button
                          type="button"
                          {...bookNavProps(navigate, b.id)}
                          className="truncate text-left text-[15px] font-bold"
                          style={{ color: GREEN_LINK }}
                          aria-label={`查看《${b.name}》详情`}
                        >
                          {b.name}
                        </button>
                        <span className="shrink-0 text-[14px] font-normal" style={{ color: TEXT_BODY }}>
                          {b.author}
                        </span>
                      </dt>
                      {/* dd: 简介 14px/24px 缩进 2em 钳 5 行(真站高 90pt) */}
                      <dd className="ggd-item-dd h-[120px] overflow-hidden pt-[7px] text-[14px] leading-[24px]" style={{ textIndent: '2em' }}>
                        {b.intro || `${b.category} · ${b.author}`}
                      </dd>
                    </dl>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm">暂无热门书籍</p>
            )}
          </section>

          {/* ---- #fengyou 搜索 + 阅读排行榜(右 25%) ---- */}
          <aside className="min-w-0 lg:w-[25%]">
            {/* .search 表单(边 2px #56ccb5/圆角 5px) */}
            <form onSubmit={submitSearch} role="search" className="ggd-search relative mb-3" aria-label="站内搜索">
              <input
                value={kw}
                onChange={(e) => setKw(e.target.value)}
                type="text"
                placeholder="输入关键词"
                aria-label="搜索书名或作者"
                className="h-[38px] w-full rounded-[5px] border-2 bg-[#f9f9f9] pl-[1em] pr-[21%] text-[16px] outline-none"
                style={{ borderColor: TEAL, color: TEAL }}
              />
              <button
                type="submit"
                className="absolute right-0 top-0 h-[38px] w-[20%] rounded-r-[3px] text-[16px] text-white"
                style={{ background: TEAL }}
                aria-label="搜索"
              >
                搜索
              </button>
            </form>
            <h2 className="ggd-h2">阅读排行榜</h2>
            {loading && !books.length && rank === null ? (
              <ul aria-hidden>
                {Array.from({ length: 8 }).map((_, i) => (
                  <li key={i} className="border-b border-dashed py-1">
                    <Sk className="h-4 w-3/4" />
                  </li>
                ))}
              </ul>
            ) : rankList.length ? (
              <ul className="pt-[5px]">
                {rankList.map((b) => (
                  <li key={b.id} className="ggd-row flex items-center overflow-hidden border-b border-dashed py-1" style={{ borderColor: LINE }}>
                    <span className="shrink-0 text-[14px]" style={{ color: TEXT_BODY }}>
                      [{b.category || '小说'}]
                    </span>
                    <button
                      type="button"
                      {...bookNavProps(navigate, b.id)}
                      className="min-w-0 flex-1 truncate px-1 text-left text-[15px]"
                      style={{ color: GREEN_LINK }}
                      aria-label={`查看《${b.name}》详情`}
                    >
                      {b.name}
                    </button>
                    <span className="shrink-0 text-[14px]" style={{ color: TEXT_BODY }}>
                      {b.author}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm">暂无排行数据</p>
            )}
          </aside>
        </div>

        {/* ============ .content② : #zuixin(右) + #gengxin(左) — 移动端堆叠按 zuixin→gengxin 序 ============ */}
        <div className="mt-2.5 flex flex-col-reverse gap-5 lg:flex-row lg:gap-[2%]">
          {/* ---- #zuixin 最新小说(右 25%, 行式同 #fengyou) ---- */}
          <aside className="min-w-0 lg:w-[25%]">
            <h2 className="ggd-h2">最新小说</h2>
            {loading && !books.length ? (
              <ul aria-hidden>
                {Array.from({ length: 8 }).map((_, i) => (
                  <li key={i} className="border-b border-dashed py-1">
                    <Sk className="h-4 w-3/4" />
                  </li>
                ))}
              </ul>
            ) : latest.length ? (
              <ul className="pt-[5px]">
                {latest.map((b) => (
                  <li key={b.id} className="ggd-row flex items-center overflow-hidden border-b border-dashed py-1" style={{ borderColor: LINE }}>
                    <span className="shrink-0 text-[14px]" style={{ color: TEXT_BODY }}>
                      [{b.category || '小说'}]
                    </span>
                    <button
                      type="button"
                      {...bookNavProps(navigate, b.id)}
                      className="min-w-0 flex-1 truncate px-1 text-left text-[15px]"
                      style={{ color: GREEN_LINK }}
                      aria-label={`查看《${b.name}》详情`}
                    >
                      {b.name}
                    </button>
                    <span className="shrink-0 text-[14px]" style={{ color: TEXT_BODY }}>
                      {b.author}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm">暂无书籍</p>
            )}
          </aside>

          {/* ---- #gengxin 最近更新(左 73%, s1/s2/s3/s5/s4 五段行) ---- */}
          <section className="min-w-0 lg:w-[73%]">
            <h2 className="ggd-h2">最近更新</h2>
            {loading && !books.length ? (
              <ul aria-hidden>
                {Array.from({ length: 10 }).map((_, i) => (
                  <li key={i} className="border-b border-dashed py-1">
                    <Sk className="h-4 w-full" />
                  </li>
                ))}
              </ul>
            ) : updated.length ? (
              <ul className="pt-[5px]">
                {updated.map((b) => (
                  <li key={b.id} className="ggd-row flex items-center gap-2 overflow-hidden border-b border-dashed py-1" style={{ borderColor: LINE }}>
                    <span className="ggd-s1 w-[75px] shrink-0 truncate text-[14px]" style={{ color: TEXT_BODY }}>
                      [{b.category || '小说'}]
                    </span>
                    <button
                      type="button"
                      {...bookNavProps(navigate, b.id)}
                      className="ggd-s2 w-[165px] shrink-0 truncate text-left text-[15px]"
                      style={{ color: GREEN_LINK }}
                      aria-label={`查看《${b.name}》详情`}
                    >
                      {b.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: b.id })}
                      className="ggd-s3 hidden min-w-0 flex-1 truncate text-left text-[14px] hover:underline sm:block"
                      style={{ color: GREEN_LINK }}
                      aria-label={`查看《${b.name}》最新章节`}
                    >
                      {b.latestChapter || b.intro || '—'}
                    </button>
                    <span className="w-[90px] shrink-0 truncate text-right text-[14px]" style={{ color: TEXT_BODY }}>
                      {fmtShort(b.updatedAt)}
                    </span>
                    <span className="ggd-s4 hidden w-[90px] shrink-0 truncate text-[14px] sm:block" style={{ color: TEXT_BODY }}>
                      {b.author}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm">暂无更新</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
