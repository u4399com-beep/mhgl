// ============================================================
// [R28-2e-1] shipsay(船说 CMS demo) 首页克隆 —— 船说 V4.2 默认模板 1:1 还原
// 素材等级: Wayback 实测 —— /tmp/r28-2e/snap/ss-home.html(2024-05-20 快照
// demo.shipsay.com 完整 DOM, 本轮重新抓取) + R24 轮真站直连实测色板(/tmp/r25/
// shipsay-home.html 36KB 逐字节, demo 站现超时不可达)。
//
// 真站 DOM(.container 960px / body #f4f4f4, 逐节核对):
//   ① .side_commend.side_commend_width(700px) > p.title(i.fa-thumbs-o-up 大神小说)
//      + ul.flex > li×6(双列: .img_span 100×133 封面 a>img + span 遮罩「科幻 / 连载」
//      [连载 rgba(0,0,0,.4) / 完本 rgba(191,44,36,.75)] + .w100 > a>h2 书名 +
//      p.indent 简介钳行 + .li_bottom > a>i.fa-user-circle-o 作者 + div > em.orange
//      字数 + em.blue 日期) | aside(250px) > p.title(i.fa-fire 热门小说) +
//      ul.popular.odd > li(a 书名 + a.gray 作者) [实测 12 行]
//   ② .section.flex > .sortvisit ×6(白面板 312px 三列): a 分类名 + ul > div(头牌:
//      a>img 封面 + p > a 书名 + i /作者 + br + 简介) + li×11(a 书名 + i /作者)
//   ③ .lastupdate > p.title(i.fa-clock-o 最新章节) + ul.odd > li×60(span「玄幻」 +
//      a 书名 + a.gray 章节名 + span > a.gray 作者 + MM-DD)
//      | aside > p.title 最新小说 + ul.popular.odd ×30(同热门行形态)
//   ④ .section.link > p.title(i.fa-link 友情链接) + a 友链
// 契约映射(降级声明):
//   ①真站最新章节列 a.gray 为章节链 → BookItem 无 chapterId → 降级书页链(沿用 R24 先例)
//   ②真站 sortvisit 头牌简介来自站方 → 用 BookItem.intro 钳行
//   ③真站 60 行最新章节 → props.books=48 条全用(接口单页上限)
//   ④分类块按库内 categoryId 分组取前 6(真站为固定 8 类)
// ============================================================
'use client'

import type { SiteHomeProps } from '../shared'
import { usePublic } from '../../ctx'
import { useFooterLinks, useWordsPool } from '../hooks' // [R35-2d-1] 原逐字节重复的热榜/友链拉取 effect 收敛
// [R27-5b-H1] 友链渲染出口 scheme 白名单
import { safeHref } from '../../safe-href'
import { bookNavProps, Sk } from '../../bits'
import { BookCover } from '../../BookCover'
import { fmtDate, formatWords } from '../../seo'
import { SS_C as C } from './_kit' // [R36-2d-5] 原与 Category/Search/Ranking 同值色板收敛单处
import type { BookItem } from '../../types'

/** 日期短格式(真站 em.blue「2020-04-19」/ lastupdate span「04-19」形态) */
function fmtShort(d?: string): string {
  const s = fmtDate(d)
  return s ? s.slice(5) : '--'
}

/** 遮罩条文案(真站 span「科幻 / 连载」) */
function maskText(b: BookItem): string {
  return `${b.category || '小说'} / ${b.status === 'completed' ? '全本' : '连载'}`
}

/** 真站 p.title 板块头(左侧 fa 图标 + 标题, 白卡面板首行) */
function SecTitle({ icon, children }: { icon: string; children: string }) {
  return (
    <p className="ss-title m-0 border-b px-3 py-2 text-[16px] font-bold" style={{ borderColor: C.line, color: C.title }}>
      <span aria-hidden className="mr-1 inline-block align-[-2px] text-[13px]" style={{ color: C.hover }}>
        {icon}
      </span>
      {children}
    </p>
  )
}

/** 行式列表骨架(热门/最新小说 aside 形态) */
function RowSkeleton({ rows }: { rows: number }) {
  return (
    <ul aria-hidden className="m-0 list-none p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="border-b border-dashed py-1.5" style={{ borderColor: C.line }}>
          <Sk className="h-4 w-3/4" />
        </li>
      ))}
    </ul>
  )
}

export function ShipsayHome({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()

  // 大神 6(带封面优先) + 热门 12 + 分类块池: 字数热榜 60 一次拉取; 友链独立拉取
  const hot = useWordsPool(site.id) // [R35-2d-1] 原逐字节重复的热榜/友链拉取 effect 收敛(hooks.ts)
  const links = useFooterLinks()

  const pool: BookItem[] = hot && hot.length ? hot : books
  // ① 大神小说 6 本(优先带封面, 真站 ul.flex 双列)
  const stars = (pool.filter((b) => b.cover).length >= 6 ? pool.filter((b) => b.cover) : pool).slice(0, 6)
  // aside 热门 12 行(接在大神 6 之后, 同真站口序)
  const popular = pool.slice(6, 18)
  // ③ 最新章节(props 最新序 48 条; 真站 60 行 → 接口单页 48 上限, 声明) + 最新小说 30
  const lastUpdate = books.slice(0, 48)
  const newest = books.slice(0, 30)
  // ② sortvisit 分类块 ×6(按 categoryId 分组取前 6 组; 真站固定 8 类, 声明)
  const byCat = new Map<string, BookItem[]>()
  for (const b of pool) {
    const k = b.categoryId || b.category || '未分类'
    const arr = byCat.get(k)
    if (arr) arr.push(b)
    else byCat.set(k, [b])
  }
  const sections = [...byCat.entries()].sort((a, z) => z[1].length - a[1].length).slice(0, 6)
  const booting = loading && !books.length

  return (
    <div className="ss-home w-full pb-6" style={{ background: C.bg, color: C.text, fontSize: 14 }}>
      <div className="mx-auto w-full max-w-[960px] px-2">
        {/* ============ ① side_commend 大神小说(700px) + aside 热门小说(250px) ============ */}
        <div className="flex flex-col gap-3 pt-3 lg:flex-row lg:gap-[10px]">
          <section className="ss-card min-w-0 lg:w-[70%]">
            <SecTitle icon="👍">大神小说</SecTitle>
            {booting ? (
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
                        <BookCover name={b.name} cover={b.cover} className="h-full w-full transition-transform duration-200 hover:scale-[1.08]" style={{ borderRadius: 0 }} />
                        {/* 真站 .img_span > span 遮罩条: 连载 rgba(0,0,0,.4) / 完本 rgba(191,44,36,.75)(实测) */}
                        <span
                          className="ss-mask absolute inset-x-0 bottom-0 flex items-center justify-between px-1.5 py-0.5 text-[12px] text-white"
                          style={{ background: b.status === 'completed' ? C.maskCompleted : C.maskOngoing }}
                        >
                          <span className="truncate">{maskText(b)}</span>
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
            <SecTitle icon="🔥">热门小说</SecTitle>
            {booting && hot === null ? (
              <RowSkeleton rows={10} />
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

        {/* ============ ② .section.flex sortvisit 分类块 ×6(头牌卡 + 11 行) ============ */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {booting
            ? [0, 1, 2, 3, 4, 5].map((i) => (
                <section key={i} className="ss-card p-3" role="status">
                  <Sk className="mb-2 h-5 w-1/3" />
                  <Sk className="mb-2 h-[90px] w-full" />
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Sk key={j} className="mb-1.5 h-4 w-full" />
                  ))}
                  <span className="sr-only">加载中…</span>
                </section>
              ))
            : sections.map(([k, arr]) => {
                const head = arr.find((b) => b.cover) || arr[0]
                return (
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
                    {/* 真站 sortvisit 头牌: 封面 + 书名 /作者 + 简介钳行(实测) */}
                    {head && (
                      <div className="mb-2 flex gap-2 border-b border-dashed pb-2" style={{ borderColor: C.line }}>
                        <div className="ss-img_span relative shrink-0 overflow-hidden" style={{ width: 72, height: 96 }}>
                          <button type="button" onClick={() => navigate({ view: 'book', bookId: head.id })} className="block h-full w-full cursor-pointer" aria-label={`查看《${head.name}》详情`}>
                            <BookCover name={head.name} cover={head.cover} className="h-full w-full transition-transform duration-200 hover:scale-[1.08]" style={{ borderRadius: 0 }} />
                          </button>
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            {...bookNavProps(navigate, head.id)}
                            className="block max-w-full truncate text-left text-[14px] font-bold"
                            style={{ color: C.title }}
                            aria-label={`查看《${head.name}》详情`}
                          >
                            {head.name}
                            <i className="not-italic opacity-80">&nbsp;/&nbsp;{head.author}</i>
                          </button>
                          <p className="m-0 mt-1 line-clamp-3 text-[12px] leading-[19px]">{head.intro || `${head.category} · ${head.author}`}</p>
                        </div>
                      </div>
                    )}
                    <ul className="m-0 list-none p-0">
                      {arr.slice(1, 11).map((b) => (
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
                          <i className="ss-gray w-[64px] shrink-0 truncate pl-2 text-right text-[12px] not-italic">/ {b.author}</i>
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
        </div>

        {/* ============ ③ lastupdate 最新章节(700px) + aside 最新小说 ============ */}
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:gap-[10px]">
          <section className="ss-card min-w-0 lg:w-[70%]">
            <SecTitle icon="🕒">最新章节</SecTitle>
            {booting ? (
              <RowSkeleton rows={10} />
            ) : lastUpdate.length ? (
              <ul className="ss-lastupdate m-0 list-none p-3">
                {lastUpdate.map((b) => (
                  <li key={b.id} className="ss-uprow flex items-center border-b border-dashed py-1.5" style={{ borderColor: C.line }}>
                    <span className="ss-c1 hidden w-[70px] shrink-0 truncate text-[12px] sm:block">「{(b.category || '小说').slice(0, 3)}」</span>
                    <button
                      type="button"
                      {...bookNavProps(navigate, b.id)}
                      className="ss-c2 w-[40%] min-w-0 shrink truncate text-left text-[14px]"
                      style={{ color: C.link }}
                      aria-label={`查看《${b.name}》详情`}
                    >
                      {b.name}
                    </button>
                    {/* 真站 a.gray 为章节链 → 契约无 chapterId, 降级书页链(声明) */}
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: b.id })}
                      className="ss-c3 hidden min-w-0 flex-1 truncate text-left text-[13px] hover:underline sm:block"
                      style={{ color: C.text }}
                      aria-label={`查看《${b.name}》最新章节`}
                    >
                      {b.latestChapter || '—'}
                    </button>
                    <span className="ss-c4 ml-auto shrink-0 pl-2 text-[12px]">
                      {b.author}&nbsp;&nbsp;{fmtShort(b.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-6 text-center text-sm">暂无更新</p>
            )}
          </section>

          <aside className="ss-card min-w-0 lg:w-[30%]">
            <SecTitle icon="✨">最新小说</SecTitle>
            {booting ? (
              <RowSkeleton rows={10} />
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

        {/* ============ ④ .section.link 友情链接(fetchFooterLinks, 空则整块不渲染) ============ */}
        {links.length > 0 && (
          <section className="ss-card mt-3 p-3">
            <p className="ss-title m-0 mb-1.5 border-b pb-1.5 text-[16px] font-bold" style={{ borderColor: C.line, color: C.title }}>
              <span aria-hidden className="mr-1 inline-block align-[-2px] text-[13px]" style={{ color: C.hover }}>
                🔗
              </span>
              友情链接
            </p>
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
