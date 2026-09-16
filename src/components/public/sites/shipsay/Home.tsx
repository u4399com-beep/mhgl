// ============================================================
// [R27-6b-7] shipsay(船说 CMS demo) 首页克隆 —— 船说 V4.2 默认模板 1:1 还原
// 素材等级: Wayback 实测 —— /tmp/r27-f2/shipsay-home.html(2024 快照 demo.shipsay.com 完整
// DOM) + R24 轮真站直连实测 /tmp/r25/shipsay-home.html(36KB, 现 demo 站超时不可达)。
//
// 真站 DOM(.container 960px / body #f4f4f4):
//   ① .side_commend(700px)大神小说 6 li 双列(img_span 100×133 封面 + 底部「分类 / 状态」
//      遮罩条 rgba(0,0,0,.4)/完本 rgba(191,44,36,.75) + h2 1.15em + p.indent 简介钳行 +
//      li_bottom 作者 + em.orange 字数 + em.blue 日期) | aside(250px)热门小说 12 行
//   ② 6 个 sortvisit 分类块(白面板, 312px/移动半宽, 12 li 38px 虚线行)
//   ③ .lastupdate(700px)最新章节 30 行 | aside 最新小说 30 行
//   ④ section.link 友情链接(数据空整块不渲染)
// 注: ①真站头部(#logo/header_right/navigation)由 SiteHeader Shipsay 头部承担
//    ②色值: bg #f4f4f4/卡 #fff/#666/#1a1a1a 链接/#ed4259 hover/#555 标题/em 蓝 #4284ed 橙 #f0643a
//    ③真站章节列(s3)无 chapterId 数据契约 → 降级书页链(同 R24 单文件先例, 声明)
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteHomeProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks, fetchFooterLinks, type FooterFriendLink } from '../../data'
// [R27-5b-H1] 友链渲染出口 scheme 白名单
import { safeHref } from '../../safe-href'
import { bookNavProps, Sk } from '../../bits'
import { BookCover } from '../../BookCover'
import { fmtDate, formatWords } from '../../seo'
import type { BookItem } from '../../types'

/** [R27-6b-7] 船说模板实测色值(R24 直测 + 2024 Wayback DOM 佐证) */
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
} as const

/** 日期短格式(真站 em.blue MM-DD 形态) */
function fmtShort(d?: string): string {
  const s = fmtDate(d)
  return s ? s.slice(5) : '--'
}

/** 状态遮罩条文案(真站 span「分类 / 状态」) */
function statusText(s?: string | null): string {
  return s === 'completed' ? '全本' : '连载'
}

export function ShipsayHome({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()

  // 大神小说(真站 6 li 双列, 优先带封面) + 热门 12 + 分类块 + 推荐 26: 字数热榜 60 一次拉取
  const [hot, setHot] = useState<BookItem[] | null>(null)
  const [links, setLinks] = useState<FooterFriendLink[]>([])
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 60 })
      .then((d) => {
        if (alive) setHot(d.books || [])
      })
      .catch(() => {
        if (alive) setHot([])
      })
    fetchFooterLinks()
      .then((d) => {
        if (alive) setLinks(d?.friend || [])
      })
      .catch(() => {
        if (alive) setLinks([])
      })
    return () => {
      alive = false
    }
  }, [site.id])

  const pool: BookItem[] = hot && hot.length ? hot : books
  // ① 大神小说 6 本(优先带封面)
  const stars = (pool.filter((b) => b.cover).length >= 6 ? pool.filter((b) => b.cover) : pool).slice(0, 6)
  // aside 热门 12 行
  const popular = pool.slice(6, 18)
  // ③ 最新章节 30 行(props 最新序)
  const lastUpdate = books.slice(0, 30)
  const newest = books.slice(0, 30)
  // ② 分类块 4 个(按 categoryId 分组取前 4 组, 组内 10 行)
  const byCat = new Map<string, BookItem[]>()
  for (const b of pool) {
    const k = b.categoryId || b.category || '未分类'
    const arr = byCat.get(k)
    if (arr) arr.push(b)
    else byCat.set(k, [b])
  }
  const sections = [...byCat.entries()].sort((a, z) => z[1].length - a[1].length).slice(0, 4)

  return (
    <div className="ss-home w-full pb-6" style={{ background: C.bg, color: C.text, fontSize: 14 }}>
      <div className="mx-auto w-full max-w-[960px] px-2">
        {/* ============ ① side_commend 大神小说(700px) + aside 热门(250px) ============ */}
        <div className="flex flex-col gap-3 pt-3 lg:flex-row lg:gap-[10px]">
          <section className="ss-card min-w-0 lg:w-[70%]">
            <div className="ss-sechead border-b px-3 py-2" style={{ borderColor: C.line }}>
              <h2 className="m-0 text-[16px] font-bold" style={{ color: C.title }}>
                大神小说
              </h2>
            </div>
            {loading && !books.length ? (
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-3 sm:grid-cols-2" role="status" aria-label="大神小说加载中">
                {Array.from({ length: 4 }).map((_, i) => (
                  <li key={i} className="flex">
                    <Sk className="mr-2.5 h-[133px] w-[100px] shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <Sk className="h-4 w-4/5" />
                      <Sk className="h-3 w-full" />
                      <Sk className="h-3 w-2/3" />
                    </div>
                  </li>
                ))}
                <span className="sr-only">加载中…</span>
              </ul>
            ) : stars.length ? (
              <ul className="ss-cards m-0 grid list-none grid-cols-1 gap-x-4 gap-y-3 p-3 sm:grid-cols-2">
                {stars.map((b) => (
                  <li key={b.id} className="ss-star flex">
                    <div className="ss-img_span relative mr-2.5 shrink-0 overflow-hidden" style={{ width: 100, height: 133 }}>
                      <button type="button" onClick={() => navigate({ view: 'book', bookId: b.id })} className="block h-full w-full cursor-pointer" aria-label={`查看《${b.name}》详情`}>
                        <BookCover name={b.name} cover={b.cover} className="h-full w-full transition-transform hover:scale-[1.08]" style={{ borderRadius: 0 }} />
                        <span
                          className="ss-mask absolute inset-x-0 bottom-0 flex items-center justify-between px-1.5 py-0.5 text-[12px] text-white"
                          style={{ background: b.status === 'completed' ? 'rgba(191,44,36,.75)' : 'rgba(0,0,0,.4)' }}
                        >
                          <span className="truncate">{b.category || '小说'}</span>
                          <span className="shrink-0">{statusText(b.status)}</span>
                        </span>
                      </button>
                    </div>
                    <div className="ss-w100 min-w-0 flex-1">
                      <button
                        type="button"
                        {...bookNavProps(navigate, b.id)}
                        className="ss-h2 block max-w-full truncate text-left text-[16px] font-bold leading-snug"
                        style={{ color: C.title }}
                        aria-label={`查看《${b.name}》详情`}
                      >
                        {b.name}
                      </button>
                      <p className="ss-indent m-0 mt-1 line-clamp-3 text-[13px] leading-[20px]" style={{ textIndent: '2em' }}>
                        {b.intro || `${b.category} · ${b.author}`}
                      </p>
                      <p className="ss-li_bottom m-0 mt-1 flex items-center text-[12px]">
                        <button type="button" onClick={() => navigate({ view: 'search', q: b.author })} className="truncate" style={{ color: C.link }} aria-label={`搜索 ${b.author} 的作品`}>
                          {b.author}
                        </button>
                        <em className="ss-orange ml-auto shrink-0 not-italic" style={{ color: C.orange }}>
                          {formatWords(b.wordCount)}
                        </em>
                        <em className="ss-blue ml-2 shrink-0 not-italic" style={{ color: C.blue }}>
                          {fmtShort(b.updatedAt)}
                        </em>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-6 text-center text-sm">暂无书籍</p>
            )}
          </section>

          <aside className="ss-card min-w-0 lg:w-[30%]">
            <div className="ss-sechead border-b px-3 py-2" style={{ borderColor: C.line }}>
              <h2 className="m-0 text-[16px] font-bold" style={{ color: C.title }}>
                热门小说
              </h2>
            </div>
            {loading && !books.length && hot === null ? (
              <ul aria-hidden className="m-0 list-none p-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <li key={i} className="border-b border-dashed py-1.5">
                    <Sk className="h-4 w-3/4" />
                  </li>
                ))}
              </ul>
            ) : popular.length ? (
              <ul className="ss-popular m-0 list-none p-3">
                {popular.map((b) => (
                  <li key={b.id} className="ss-poprow flex items-center border-b border-dashed py-1.5" style={{ borderColor: C.line }}>
                    <button
                      type="button"
                      {...bookNavProps(navigate, b.id)}
                      className="min-w-0 flex-1 truncate text-left text-[14px]"
                      style={{ color: C.link }}
                      aria-label={`查看《${b.name}》详情`}
                    >
                      {b.name}
                    </button>
                    <span className="ss-gray shrink-0 pl-2 text-[12px]">{b.author}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-6 text-center text-sm">暂无数据</p>
            )}
          </aside>
        </div>

        {/* ============ ② sortvisit 分类块 ×4(真站 6 块 → 按库内分类取前 4, 声明) ============ */}
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {loading && !books.length
            ? [0, 1, 2, 3].map((i) => (
                <section key={i} className="ss-card p-3" role="status">
                  <Sk className="mb-2 h-5 w-1/3" />
                  {Array.from({ length: 6 }).map((_, j) => (
                    <Sk key={j} className="mb-1.5 h-4 w-full" />
                  ))}
                  <span className="sr-only">加载中…</span>
                </section>
              ))
            : sections.map(([k, arr]) => (
                <section key={k} className="ss-card p-3">
                  <div className="mb-1.5 flex items-baseline justify-between border-b pb-1.5" style={{ borderColor: C.line }}>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'category', cat: arr[0]?.categoryId || undefined, page: 1 })}
                      className="text-[16px] font-bold"
                      style={{ color: C.title }}
                      aria-label={`查看 ${arr[0]?.category || k} 分类`}
                    >
                      {arr[0]?.category || k}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'category', cat: arr[0]?.categoryId || undefined, page: 1 })}
                      className="text-[12px] hover:underline"
                      style={{ color: C.hover }}
                      aria-label="更多"
                    >
                      更多&gt;&gt;
                    </button>
                  </div>
                  <ul className="m-0 list-none p-0">
                    {arr.slice(0, 10).map((b) => (
                      <li key={b.id} className="ss-sortrow flex items-center border-b border-dashed py-1.5" style={{ borderColor: C.line, lineHeight: '22px' }}>
                        <button
                          type="button"
                          {...bookNavProps(navigate, b.id)}
                          className="min-w-0 flex-1 truncate text-left text-[14px]"
                          style={{ color: C.link }}
                          aria-label={`查看《${b.name}》详情`}
                        >
                          {b.name}
                        </button>
                        <span className="ss-gray w-[64px] shrink-0 truncate pl-2 text-right text-[12px]">{b.author}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
        </div>

        {/* ============ ③ lastupdate 最新章节(700px) + aside 最新小说 ============ */}
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:gap-[10px]">
          <section className="ss-card min-w-0 lg:w-[70%]">
            <div className="ss-sechead border-b px-3 py-2" style={{ borderColor: C.line }}>
              <h2 className="m-0 text-[16px] font-bold" style={{ color: C.title }}>
                最新章节
              </h2>
            </div>
            {loading && !books.length ? (
              <ul aria-hidden className="m-0 list-none p-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <li key={i} className="border-b border-dashed py-1.5">
                    <Sk className="h-4 w-full" />
                  </li>
                ))}
              </ul>
            ) : lastUpdate.length ? (
              <ul className="ss-lastupdate m-0 list-none p-3">
                {lastUpdate.map((b) => (
                  <li key={b.id} className="ss-uprow flex items-center border-b border-dashed py-1.5" style={{ borderColor: C.line }}>
                    <span className="ss-c1 hidden w-[70px] shrink-0 truncate text-[12px] sm:block" style={{ color: C.text }}>
                      [{b.category || '小说'}]
                    </span>
                    <button
                      type="button"
                      {...bookNavProps(navigate, b.id)}
                      className="ss-c2 w-[40%] min-w-0 shrink truncate text-left text-[14px]"
                      style={{ color: C.link }}
                      aria-label={`查看《${b.name}》详情`}
                    >
                      {b.name}
                    </button>
                    {/* 真站 s3 为章节链接 → 列表无 chapterId 降级书页链(声明) */}
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: b.id })}
                      className="ss-c3 hidden min-w-0 flex-1 truncate text-left text-[13px] hover:underline sm:block"
                      style={{ color: C.text }}
                      aria-label={`查看《${b.name}》最新章节`}
                    >
                      {b.latestChapter || '—'}
                    </button>
                    <span className="ss-c4 ml-auto shrink-0 pl-2 text-[12px]" style={{ color: C.text }}>
                      {b.author}
                    </span>
                    <em className="ss-blue w-[52px] shrink-0 pl-1 text-right text-[12px] not-italic" style={{ color: C.blue }}>
                      {fmtShort(b.updatedAt)}
                    </em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-6 text-center text-sm">暂无更新</p>
            )}
          </section>

          <aside className="ss-card min-w-0 lg:w-[30%]">
            <div className="ss-sechead border-b px-3 py-2" style={{ borderColor: C.line }}>
              <h2 className="m-0 text-[16px] font-bold" style={{ color: C.title }}>
                最新小说
              </h2>
            </div>
            {loading && !books.length ? (
              <ul aria-hidden className="m-0 list-none p-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <li key={i} className="border-b border-dashed py-1.5">
                    <Sk className="h-4 w-3/4" />
                  </li>
                ))}
              </ul>
            ) : newest.length ? (
              <ul className="m-0 list-none p-3">
                {newest.map((b) => (
                  <li key={b.id} className="flex items-center border-b border-dashed py-1.5" style={{ borderColor: C.line }}>
                    <button
                      type="button"
                      {...bookNavProps(navigate, b.id)}
                      className="min-w-0 flex-1 truncate text-left text-[14px]"
                      style={{ color: C.link }}
                      aria-label={`查看《${b.name}》详情`}
                    >
                      {b.name}
                    </button>
                    <span className="ss-gray shrink-0 pl-2 text-[12px]">{b.author}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-6 text-center text-sm">暂无书籍</p>
            )}
          </aside>
        </div>

        {/* ============ ④ section.link 友情链接(fetchFooterLinks, 空则整块不渲染) ============ */}
        {links.length > 0 && (
          <section className="ss-card mt-3 p-3">
            <div className="ss-sechead mb-1.5 border-b pb-1.5" style={{ borderColor: C.line }}>
              <h2 className="m-0 text-[16px] font-bold" style={{ color: C.title }}>
                友情链接
              </h2>
            </div>
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1">
              {links.map((l) => (
                <a key={l.id} href={safeHref(l.url)} className="text-[13px] hover:underline" style={{ color: C.link }} rel="noopener noreferrer" target="_blank">
                  {l.name}
                </a>
              ))}
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
