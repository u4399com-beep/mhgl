// ============================================================
// [R28-2g-1] trxsw(同人小说网) 首页克隆 —— 杰奇 CMS 默认模板 1:1 还原
// 素材等级: Wayback 实测 —— /tmp/r28-2g/snap/tx-home.html(2019-10-19 快照, 与 R25-1
// /tmp/r25/trxsw-wb.html、R27-f2 同源 DOM)。真站 DOM(#wrapper > #main, 960px 版心):
//   .novelslist ×2 行 × 3 .content(第 3 块 class="content border" 竖线分隔):
//     h2 板块名(同人/玄幻/修真/都市/穿越/网游, 无「更多」钮) + .top 图文头条
//     (.image a img 67×82 杰奇标准图路径 files/article/image/{x}/{id}/{id}s.jpg
//      + dl>dt a 书名 + span 作者 + dd 简介 + .clear) + ul li(`<a>书名</a> /作者`)
//   #newscontent > .l: h2(div.moreLeft 标题 + div.moreRight a 更多>>) + ul li 25 行
//     (s1 [分类]/s2 a 书名/s3 a 最新章(真链 /book/{bid}/{cid}.html)/s4 作者/s5 日期 MM-DD)
//   #newscontent > .r: h2 小说推荐 + ul li 26 行(仅 s2 a 书名 + s5 作者)
//   #firendlink: 「友情连接：」+ a ×14(真站为站方硬链 + 友链交换)
// 降级/推断声明(逐条):
//   ①库内书籍无「站方推荐位」运营数据 → 板块分组 = 按 categoryId 分组取前 6 组(组内首本
//     优先带封面做 .top 头条), 真站固定 6 类目(同人/玄幻/修真/都市/穿越/网游)为编辑固定位(推断)
//   ②s3 最新章列为纯文本(契约 BookItem.latestChapter 无 chapterId, 真站该列为章节深链) 
//   ③.r 小说推荐 26 行 = 字数热榜 60 切片(真站为站方运营推荐位, 无契约, 推断)
//   ④ywtop/head/nav 头部由 SiteHeader Trxsw 分支承担, 本组件不含
//   ⑤封面 67×82 = 杰奇小图规格(真站 178s.jpg 形态), 契约 cover 为原大图 → BookCover 等比缩放
// ============================================================
'use client'

import type { SiteHomeProps } from '../shared'
import { usePublic } from '../../ctx'
import { JqH2Slot as JqH2 } from './_kit' // [R36-2d-11] 原本地 JqH2(右插槽版)收敛至 _kit
import { useFooterLinks, useWordsPool } from '../hooks' // [R35-2d-1] 原逐字节重复的热榜/友链拉取 effect 收敛
import { safeHref } from '../../safe-href'
import { bookNavProps, Sk } from '../../bits'
import { BookCover } from '../../BookCover'
import type { BookItem } from '../../types'

/** [R28-2g-1] 杰奇 CMS 默认模板家族标准色板(b.css 无存档, R25 轮 archive 快照 404 实证) */
const C = {
  navBlue: '#1C5087',
  logoRed: '#C00',
  text: '#333333',
  gray: '#666666',
  light: '#999999',
  border: '#dddddd',
  dotted: '#cccccc',
  topBg: '#f5f5f5',
} as const

// [R28-2g-1] 杰奇默认 h2·右插槽版已收敛至 _kit.JqH2Slot [R36-2d-11]

/** 日期 MM-DD(真站 s5「10-20」形态) */
function fmtMD(d?: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

interface SecBlock {
  key: string
  title: string
  catId?: string
  top: BookItem | null
  rest: BookItem[]
}

/** 书池 → 6 个板块(按 categoryId 分组取前 6 组, 组内首本优先带封面做 .top 图文头条) */
function buildSections(pool: BookItem[]): SecBlock[] {
  const byCat = new Map<string, BookItem[]>()
  for (const b of pool) {
    const k = b.categoryId || b.category || '未分类'
    const arr = byCat.get(k)
    if (arr) arr.push(b)
    else byCat.set(k, [b])
  }
  return [...byCat.entries()]
    .sort((a, z) => z[1].length - a[1].length)
    .slice(0, 6)
    .map(([k, arr]) => {
      const top = arr.find((b) => !!b.cover) || arr[0]
      return {
        key: k,
        title: top?.category || '全部小说',
        catId: top?.categoryId || undefined,
        top,
        rest: arr.filter((b) => b.id !== top.id).slice(0, 8),
      }
    })
}

export function TrxswHome({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()

  // 板块分组 + .r 推荐: 字数热榜 60 一维拉取(失败静默回退 props)
  const hot = useWordsPool(site.id) // [R35-2d-1] 原逐字节重复的热榜/友链拉取 effect 收敛(hooks.ts)
  const links = useFooterLinks()

  const pool: BookItem[] = hot && hot.length ? hot : books
  const sections = buildSections(pool)
  // .l 最近更新 25 行 + .r 小说推荐 26 行(快照实测行数)
  const latest = books.slice(0, 25)
  const recommend = (pool.length >= 26 ? pool : books).slice(0, 26)

  return (
    <div className="tx-home mx-auto w-full max-w-[960px] px-2 pb-6" style={{ color: C.text, fontSize: 14 }}>
      {/* ============ .novelslist ×2(6 板块, 桌面 3 列/移动单列) ============ */}
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading && !books.length
          ? [0, 1, 2, 3, 4, 5].map((i) => (
              <section key={i} className="tx-sec mb-3" role="status">
                <Sk className="mb-2 h-8 w-full" />
                <div className="flex">
                  <Sk className="mr-2 h-[82px] w-[67px] shrink-0" />
                  <div className="flex-1 space-y-1.5 pt-1">
                    <Sk className="h-4 w-3/4" />
                    <Sk className="h-3 w-full" />
                    <Sk className="h-3 w-2/3" />
                  </div>
                </div>
                {Array.from({ length: 5 }).map((_, j) => (
                  <Sk key={j} className="my-1.5 h-4 w-full" />
                ))}
                <span className="sr-only">加载中…</span>
              </section>
            ))
          : sections.map((sec, si) => (
              <section key={sec.key} className={`tx-sec mb-3 min-w-0 ${si % 3 === 2 ? 'lg:border-l lg:pl-3' : ''}`} style={si % 3 === 2 ? { borderColor: C.border } : undefined}>
                {/* 真站板块 h2 为纯标题(无更多钮) */}
                <JqH2>{sec.title}</JqH2>
                {/* .top 图文头条(67×82 封面 + dt 书名 + span 作者 + dd 简介) */}
                {sec.top && (
                  <div className="tx-top flex gap-2 border-b pt-2" style={{ borderColor: C.border }}>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: sec.top!.id })}
                      className="block shrink-0 overflow-hidden"
                      style={{ width: 67, height: 82 }}
                      aria-label={`查看《${sec.top.name}》详情`}
                    >
                      <BookCover name={sec.top.name} cover={sec.top.cover} className="h-full w-full" style={{ borderRadius: 0 }} />
                    </button>
                    <dl className="m-0 min-w-0 flex-1">
                      <dt className="m-0 flex items-baseline justify-between gap-2">
                        <button
                          type="button"
                          {...bookNavProps(navigate, sec.top.id)}
                          className="min-w-0 truncate text-left text-[14px] font-bold"
                          style={{ color: C.text }}
                          aria-label={`查看《${sec.top.name}》详情`}
                        >
                          {sec.top.name}
                        </button>
                        <span className="shrink-0 text-[12px] font-normal" style={{ color: C.gray }}>
                          {sec.top.author}
                        </span>
                      </dt>
                      <dd className="m-0 mt-1 line-clamp-3 text-[12px] leading-[18px]" style={{ color: C.gray }}>
                        {sec.top.intro || `${sec.top.category} · ${sec.top.author}`}
                      </dd>
                    </dl>
                  </div>
                )}
                {/* ul li 书名 /作者(快照实测: <a>书名</a> /作者, 无书名号) */}
                <ul className="m-0 list-none p-0">
                  {sec.rest.map((b) => (
                    <li key={b.id} className="tx-li flex h-9 items-center justify-between gap-2 border-b border-dotted" style={{ borderColor: C.dotted }}>
                      <button
                        type="button"
                        {...bookNavProps(navigate, b.id)}
                        className="min-w-0 truncate text-left"
                        style={{ color: C.text }}
                        aria-label={`查看《${b.name}》详情`}
                      >
                        {b.name}
                      </button>
                      <span className="shrink-0 text-[12px]" style={{ color: C.gray }}>
                        /{b.author}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
      </div>

      {/* ============ #newscontent: .l 最近更新(25 行) + .r 小说推荐(26 行) ============ */}
      <div className="tx-news flex flex-col gap-3 lg:flex-row lg:gap-[10px]">
        <section className="tx-l min-w-0 lg:w-[70%]">
          <JqH2
            right={
              <button
                type="button"
                onClick={() => navigate({ view: 'category', page: 1 })}
                className="shrink-0 text-[12px] font-normal hover:underline"
                style={{ color: C.gray }}
                aria-label="查看全部最近更新"
              >
                更多&gt;&gt;
              </button>
            }
          >
            最近更新小说列表
          </JqH2>
          <ul className="m-0 list-none p-0">
            {loading && !books.length
              ? Array.from({ length: 10 }).map((_, i) => (
                  <li key={i} className="tx-li flex h-9 items-center border-b border-dotted" style={{ borderColor: C.dotted }}>
                    <Sk className="h-4 w-full" />
                  </li>
                ))
              : latest.length
                ? latest.map((b) => (
                    <li key={b.id} className="tx-li flex h-9 items-center gap-2 border-b border-dotted" style={{ borderColor: C.dotted }}>
                      <span className="tx-s1 hidden w-[76px] shrink-0 truncate text-[12px] sm:block" style={{ color: C.gray }}>
                        [{b.category || '小说'}]
                      </span>
                      <button
                        type="button"
                        {...bookNavProps(navigate, b.id)}
                        className="tx-s2 w-[36%] min-w-0 shrink truncate text-left text-[14px]"
                        style={{ color: C.text }}
                        aria-label={`查看《${b.name}》详情`}
                      >
                        {b.name}
                      </button>
                      {/* s3 章节列(无 chapterId → 纯文本, 声明②) */}
                      <span className="tx-s3 hidden min-w-0 flex-1 truncate text-[13px] sm:block" style={{ color: C.gray }}>
                        {b.latestChapter || '—'}
                      </span>
                      <span className="tx-s4 hidden w-[80px] shrink-0 truncate text-right text-[12px] sm:block" style={{ color: C.gray }}>
                        {b.author}
                      </span>
                      <em className="tx-s5 w-[44px] shrink-0 text-right not-italic text-[12px]" style={{ color: C.light }}>
                        {fmtMD(b.updatedAt)}
                      </em>
                    </li>
                  ))
                : (
                    <li className="tx-li flex h-9 items-center justify-center border-b border-dotted" style={{ borderColor: C.dotted, color: C.gray }}>
                      暂无更新
                    </li>
                  )}
          </ul>
        </section>

        <aside className="tx-r min-w-0 lg:w-[30%]">
          <JqH2>小说推荐</JqH2>
          <ul className="m-0 list-none p-0">
            {hot === null && loading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <li key={i} className="tx-li flex h-9 items-center border-b border-dotted" style={{ borderColor: C.dotted }}>
                    <Sk className="h-4 w-3/4" />
                  </li>
                ))
              : recommend.length
                ? recommend.map((b) => (
                    <li key={b.id} className="tx-li flex h-9 items-center justify-between gap-2 border-b border-dotted" style={{ borderColor: C.dotted }}>
                      <button
                        type="button"
                        {...bookNavProps(navigate, b.id)}
                        className="min-w-0 flex-1 truncate text-left text-[14px]"
                        style={{ color: C.text }}
                        aria-label={`查看《${b.name}》详情`}
                      >
                        {b.name}
                      </button>
                      <span className="tx-s5 shrink-0 text-[12px]" style={{ color: C.gray }}>
                        {b.author}
                      </span>
                    </li>
                  ))
                : (
                    <li className="tx-li flex h-9 items-center justify-center border-b border-dotted" style={{ borderColor: C.dotted, color: C.gray }}>
                      暂无推荐
                    </li>
                  )}
          </ul>
        </aside>
      </div>

      {/* ============ #firendlink 友情连接(safeHref 白名单出口, 空则整块不渲染) ============ */}
      {links.length > 0 && (
        <div id="firendlink" className="tx-links mt-3 border-t pt-2" style={{ borderColor: C.border }}>
          <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 py-2">
            <span className="text-[13px]" style={{ color: C.text }}>
              友情连接：
            </span>
            {links.map((l) => (
              <a key={l.id} href={safeHref(l.url)} className="text-[13px] hover:underline" style={{ color: C.gray }} rel="noopener noreferrer" target="_blank">
                {l.name}
              </a>
            ))}
          </p>
        </div>
      )}
    </div>
  )
}
