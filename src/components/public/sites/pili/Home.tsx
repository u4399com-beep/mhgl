// ============================================================
// [R28-2b-1] 霹雳书屋 克隆首页 —— https://www.pilishuwu.com/ (wmcms 模板)
//
// 真站快照: /tmp/r28-2b/pili/home.html(2026-09-16 cloak-browser 实抓 233K, status 200)
// CSS 存档: /tmp/r28-2b/pili/wmcms.global.css / wmcms.index.css / SunZX.css 实测
//
// 板块顺序(2026 真站 DOM 自上而下):
//   1. .mod-tags-wr    独家推荐米色词条条(#faead0 底 + #eed3a4 边 + 橙块徽标
//                      #ff9126→#fd8929 渐变 + inset 高光 + 1px #ec7d4d 描边)
//   2. .in-banner-con  大封面横幅(h 356px, 底部 #f1823a 书名条, hover 黑纱 50% 出信息)
//      .in-rank-wr     右侧深色热点榜(#373533 深盒, #ff9a6a 栏头, 序号徽章, 虚线分隔)
//   3. .in-strong-wr   精品推荐(2px #ff9a6a 上边线 + 「精品<em>推荐</em>」压线标题;
//                      左大封 214×284 + 右作品行(18px 书名/作者/分类/字数/简介) + 底部封面条)
//   4. .in-vip-wr      双列: 左「最新入库」(100×131 封面 hover 弹简介) + 右「月票排行」
//                      (#ff9a6a 25px 白字栏头, hot/no 序号徽章, 数值 em #ff8a2b)
//   5. .in-main-wr     主列双分类封面列(mod-cover-list 135×177 封面 + 底部章节黑条 rgba(0,0,0,.6))
//      .in-side-wr     侧栏「点击排行」+「小说字数排行榜」+ 最近更新表(斑马纹 #fafafa)
//
// 色板(wmcms.global.css / wmcms.index.css 实测): 主橙 #fd8929 · 浅橙 #ff9a6a ·
// 按钮橙 #f89157(hover #f59966/active #f1854b/边 #ec7d4d) · 米色 #faead0+#eed3a4 ·
// 红强调 #d71704 · 深榜 #373533 · banner 书名条 #f1823a · 页脚 #f69057 · 文字 #333/#555/#666/#999 · 版心 1200px
//
// 数据: props.books = 最新 48 本; 榜单维度 fetchBooks(sort:'words') 内部另拉(失败回退 props 切片);
// 真站点击/月票/鲜花数据契约没有 → 以字数/更新时间近似(见文件尾降级声明)。
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import { BookOpen } from 'lucide-react'
import type { SiteHomeProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import type { BookItem } from '../../types'
import { BookCover } from '../../BookCover'
import { Sk, StatusBadge, bookNavProps } from '../../bits'
import { fmtDate, formatWords } from '../../seo'

// [R28-2b-1] 真站实测色值常量(wmcms.global.css + wmcms.index.css)
const ORANGE = '#fd8929' // 主橙(全局出现 24 处)
const ORANGE_LIGHT = '#ff9a6a' // 浅橙(标题压线/榜单头/分页 current)
const BTN_BORDER = '#ec7d4d' // 按钮橙描边
const BEIGE = '#faead0' // 米色词条条
const BEIGE_BORDER = '#eed3a4'
const DARK = '#373533' // 热点榜深盒
const NAME_BAR = '#f1823a' // banner 底部书名条
const TEXT = '#333333'
const TITLE = '#555555'
const MUTED = '#999999'

/** [R28-2b-1] 独家推荐词条 + hover 封面弹出卡(真站 mod-tags-wr / mod-ani-info) */
function PiliTagBar({ books }: { books: BookItem[] }) {
  const { navigate } = usePublic()
  const picks = books.slice(0, 7)
  if (!picks.length) return null
  return (
    <div className="border-y" style={{ background: BEIGE, borderColor: BEIGE_BORDER }}>
      <div className="mx-auto w-full max-w-6xl px-4 py-1.5 sm:px-6">
        <ul className="flex items-center gap-x-5 overflow-x-auto" style={{ listStyle: 'none' }}>
          <li className="shrink-0">
            <span
              className="inline-flex h-[27px] items-center rounded-[3px] px-2 text-xs text-white"
              style={{ background: `linear-gradient(180deg, #ff9126, ${ORANGE})`, boxShadow: `inset 0 0 1px rgba(255,255,255,0.5), 0 0 0 1px ${BTN_BORDER}` }}
            >
              独家推荐
            </span>
          </li>
          {picks.map((b) => (
            <li key={b.id} className="group relative shrink-0">
              <button
                type="button"
                onClick={() => navigate({ view: 'book', bookId: b.id })}
                aria-label={`查看《${b.name}》详情`}
                className="flex h-11 items-center text-xs text-[#666666] transition-colors hover:text-[#fa8729] md:h-8"
              >
                {b.name}
              </button>
              {/* hover 弹出卡(mod-ani-info: 封面+书名+作者+开始阅读; 移动端不渲染避免占位) */}
              <div
                className="invisible absolute left-0 top-full z-30 hidden w-[290px] rounded-[3px] border bg-white p-3 opacity-0 shadow-[0_6px_20px_rgba(125,54,15,0.18)] transition-opacity duration-200 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 md:block"
                style={{ borderColor: '#e0b070' }}
              >
                <div className="flex gap-3">
                  <div className="h-[80px] w-[60px] shrink-0 overflow-hidden rounded-[2px]">
                    <BookCover name={b.name} cover={b.cover} showAuthor={b.author} style={{ borderRadius: 2 }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold" style={{ color: TITLE }}>{b.name}</p>
                    <p className="mt-0.5 truncate text-xs text-[#666666]">{b.author} · {b.category}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-[18px]" style={{ color: MUTED }}>{b.intro || '暂无简介'}</p>
                    <p className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: ORANGE }}>
                      <BookOpen className="h-3 w-3" aria-hidden />
                      开始阅读
                    </p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** [R28-2b-1] 横幅行 = 大封面 banner + 深色热点榜(in-banner-con + in-rank-wr) */
function PiliBanner({ featured, rankBooks, loading }: { featured?: BookItem; rankBooks: BookItem[]; loading: boolean }) {
  const { navigate } = usePublic()
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 pt-5 sm:px-6 lg:grid-cols-[1fr_257px]">
      {/* banner 主图(h 356px + 底部 #f1823a 书名条 + hover 黑纱信息) */}
      {featured ? (
        <div
          {...bookNavProps(navigate, featured.id)}
          aria-label={`查看《${featured.name}》详情`}
          className="group relative h-[240px] cursor-pointer overflow-hidden sm:h-[300px] lg:h-[356px]"
        >
          <BookCover name={featured.name} cover={featured.cover} showAuthor={featured.author} style={{ borderRadius: 0 }} className="absolute inset-0" />
          <div aria-hidden className="absolute inset-0 bg-black opacity-0 transition-opacity duration-500 group-hover:opacity-50 group-focus-within:opacity-50" />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-within:opacity-100">
            <strong className="text-lg text-white">{featured.name}</strong>
            <span className="text-xs text-white/85">{featured.author} · {featured.category} · {formatWords(featured.wordCount)}</span>
            <span className="line-clamp-2 max-w-[560px] text-xs leading-[18px] text-white/75">{featured.intro}</span>
          </div>
          <span className="absolute bottom-0 left-0 flex h-[30px] max-w-[70%] items-center px-3 text-base text-white" style={{ background: NAME_BAR }}>
            <span className="truncate">{featured.name}</span>
          </span>
        </div>
      ) : (
        <Sk className="h-[240px] w-full rounded-[3px] sm:h-[300px] lg:h-[356px]" />
      )}

      {/* 深色热点榜(in-rank-wr #373533) */}
      <aside className="rounded-[3px] px-3.5 pb-4 pt-2" style={{ background: DARK }} aria-label="热点榜单">
        <h2 className="h-12 text-lg font-normal" style={{ color: ORANGE_LIGHT }}>
          热点榜单
        </h2>
        {loading ? (
          <div className="space-y-2" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <Sk key={i} className="h-[38px] w-full" />
            ))}
          </div>
        ) : (
          <ol style={{ listStyle: 'none' }}>
            {rankBooks.slice(0, 10).map((b, i) => (
              <li key={b.id} className="flex items-center gap-2.5 border-b border-dashed border-white/10 py-[7px] last:border-b-0">
                <span
                  aria-hidden
                  className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[2px] text-xs font-bold italic"
                  style={{ background: i < 3 ? ORANGE : '#5b5854', color: i < 3 ? '#fff' : '#b5b1ac' }}
                >
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'book', bookId: b.id })}
                  className="min-w-0 flex-1 truncate text-left text-[13px] text-[#d7d3ce] transition-colors hover:text-[#ffca68]"
                  aria-label={`查看《${b.name}》详情`}
                >
                  {b.name}
                </button>
                {i < 3 && <span className="shrink-0 text-[11px]" style={{ color: '#ffca68' }}>热</span>}
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  )
}

/** [R28-2b-1] 板块标题(in-title-big 30px 压线 + 2px #ff9a6a 上边线, em 橙色强调) */
function SectionTitle({ text, em }: { text: string; em?: string }) {
  return (
    <div className="border-t-2 pt-1.5" style={{ borderColor: ORANGE_LIGHT }}>
      <h2 className="flex items-baseline gap-2 text-xl font-bold sm:text-2xl" style={{ color: TITLE }}>
        {text}
        {em && <em className="not-italic" style={{ color: ORANGE }}>{em}</em>}
      </h2>
    </div>
  )
}

/** [R28-2b-1] 精品推荐(in-strong-wr: 左大封 214×284 + 右作品行列表 + 底部封面条) */
function PiliStrong({ books }: { books: BookItem[] }) {
  const { navigate } = usePublic()
  const big = books[0]
  const rows = books.slice(1, 9)
  const strip = books.slice(9, 16)
  if (!big && !rows.length) return null
  return (
    <section className="mx-auto mt-8 w-full max-w-6xl px-4 sm:px-6" aria-label="精品推荐">
      <SectionTitle text="精品" em="推荐" />
      <div className="mt-4 grid gap-5 lg:grid-cols-[214px_1fr]">
        {big ? (
          <div {...bookNavProps(navigate, big.id)} aria-label={`查看《${big.name}》详情`} className="group relative h-[284px] cursor-pointer overflow-hidden rounded-[3px]">
            <BookCover name={big.name} cover={big.cover} showAuthor={big.author} style={{ borderRadius: 3 }} className="absolute inset-0" />
            <div aria-hidden className="absolute inset-0 bg-black opacity-0 transition-opacity duration-300 group-hover:opacity-40" />
          </div>
        ) : (
          <Sk className="h-[284px] rounded-[3px]" />
        )}
        <div className="min-w-0">
          <ul style={{ listStyle: 'none' }}>
            {rows.map((b) => (
              <li key={b.id} className="border-b border-solid border-[#f0f0f0] py-2.5 last:border-b-0">
                <div className="flex items-baseline gap-2">
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'book', bookId: b.id })}
                    className="truncate text-left text-base font-bold text-[#333333] transition-colors hover:text-[#fa8729] lg:text-lg"
                    aria-label={`查看《${b.name}》详情`}
                  >
                    《{b.name}》
                  </button>
                  <span className="shrink-0 text-xs" style={{ color: MUTED }}>{b.author}</span>
                  <StatusBadge status={b.status} small />
                </div>
                <p className="mt-1 line-clamp-1 text-xs" style={{ color: MUTED }}>
                  [{b.category}] · {formatWords(b.wordCount)} · {b.intro || '暂无简介'}
                </p>
              </li>
            ))}
            {!rows.length && <Sk className="h-[220px] w-full" />}
          </ul>
          {/* 底部封面条(in-sign-list 100×133 hover 黑纱) */}
          {strip.length > 0 && (
            <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7" style={{ listStyle: 'none' }}>
              {strip.map((b) => (
                <li key={b.id} {...bookNavProps(navigate, b.id)} className="group relative h-[88px] cursor-pointer overflow-hidden rounded-[2px] sm:h-[133px]">
                  <BookCover name={b.name} cover={b.cover} style={{ borderRadius: 2 }} className="absolute inset-0" />
                  <div aria-hidden className="absolute inset-0 bg-black opacity-0 transition-opacity duration-300 group-hover:opacity-50" />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 py-0.5 text-center text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {b.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

/** [R28-2b-1] 最新入库 + 月票排行(in-vip-wr 双列) */
function PiliVip({ books, monRank, monLoading }: { books: BookItem[]; monRank: BookItem[]; monLoading: boolean }) {
  const { navigate } = usePublic()
  return (
    <section className="mx-auto mt-8 w-full max-w-6xl px-4 sm:px-6" aria-label="最新入库与月票排行">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 最新入库(in-rise-item 100×131 封面 + hover 简介黑纱) */}
        <div>
          <SectionTitle text="最新" em="入库" />
          <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5" style={{ listStyle: 'none' }}>
            {books.slice(0, 20).map((b) => (
              <li key={b.id} {...bookNavProps(navigate, b.id)} className="group relative cursor-pointer" aria-label={`查看《${b.name}》详情`}>
                <div className="relative h-[131px] overflow-hidden rounded-[2px] border border-[#bebebe]">
                  <BookCover name={b.name} cover={b.cover} showAuthor={b.author} style={{ borderRadius: 0, borderWidth: 0 }} className="absolute inset-0" />
                  <div aria-hidden className="absolute inset-0 bg-black/70 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100" />
                  <p className="absolute inset-0 line-clamp-4 p-1.5 text-[10px] leading-4 text-white/90 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
                    {b.intro || '暂无简介'}
                  </p>
                </div>
                <p className="mt-1 truncate text-xs font-bold" style={{ color: TEXT }}>{b.name}</p>
                <p className="truncate text-[11px]" style={{ color: MUTED }}>{b.author}</p>
              </li>
            ))}
            {!books.length && Array.from({ length: 10 }).map((_, i) => <Sk key={i} className="h-[131px]" />)}
          </ul>
        </div>
        {/* 月票排行(in-monrank-wr #ff9a6a 栏头 + hot/no 徽章) */}
        <div>
          <SectionTitle text="月票" em="排行" />
          <div className="mt-4 overflow-hidden rounded-[3px]">
            <h3 className="flex h-[48px] items-center px-3 text-lg font-normal text-white" style={{ background: ORANGE_LIGHT }}>
              月票排行榜
            </h3>
            {monLoading ? (
              <div className="space-y-2 p-3" aria-hidden>
                {Array.from({ length: 10 }).map((_, i) => <Sk key={i} className="h-7 w-full" />)}
              </div>
            ) : (
              <ol className="bg-white px-3 py-1" style={{ listStyle: 'none' }}>
                {monRank.slice(0, 10).map((b, i) => (
                  <li key={b.id} className="flex items-center gap-2.5 border-b border-solid border-[#f5f5f5] py-2 last:border-b-0">
                    <span
                      aria-hidden
                      className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[3px] text-xs font-bold"
                      style={{ background: i < 3 ? '#908aa2' : '#f0efee', color: i < 3 ? '#fff' : TEXT }}
                    >
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: b.id })}
                      className="min-w-0 flex-1 truncate text-left text-sm text-[#333333] transition-colors hover:text-[#fa8729]"
                      aria-label={`查看《${b.name}》详情`}
                    >
                      {b.name}
                    </button>
                    <span className="shrink-0 text-xs text-[#999999]">{b.author}</span>
                    {/* 真站票数 em #ff8a2b — 契约无月票字段, 以字数近似(降级①) */}
                    <em className="shrink-0 not-italic text-xs font-bold" style={{ color: '#ff8a2b' }}>{formatWords(b.wordCount)}</em>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/** [R28-2b-1] 分类封面列 + 侧栏点击排行/最近更新表(in-main-wr + in-side-wr) */
function PiliMain({ books, clickRank }: { books: BookItem[]; clickRank: BookItem[] }) {
  const { navigate } = usePublic()
  // 分类封面列: 按 category 分组取前 2 组(真站为 男频/女频 双列)
  const groups = useMemo(() => {
    const map = new Map<string, BookItem[]>()
    for (const b of books) {
      const key = b.category || '其他'
      const arr = map.get(key) || []
      if (arr.length < 4) arr.push(b)
      map.set(key, arr)
      if (map.size >= 2) break
    }
    return [...map.entries()].slice(0, 2)
  }, [books])

  return (
    <section className="mx-auto mt-8 w-full max-w-6xl px-4 pb-10 sm:px-6" aria-label="分类书列与排行">
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* 双分类封面列(mod-cover-list 135×177 封面 + 章节黑条) */}
        <div className="grid gap-6 sm:grid-cols-2">
          {groups.map(([cat, items]) => (
            <div key={cat}>
              <SectionTitle text={cat} />
              <ul className="mt-4 grid grid-cols-2 gap-3" style={{ listStyle: 'none' }}>
                {items.map((b) => (
                  <li key={b.id} {...bookNavProps(navigate, b.id)} className="cursor-pointer" aria-label={`查看《${b.name}》详情`}>
                    <div className="relative h-[177px] overflow-hidden rounded-[2px]">
                      <BookCover name={b.name} cover={b.cover} showAuthor={b.author} style={{ borderRadius: 0 }} className="absolute inset-0" />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-1 text-[11px] text-white">{b.latestChapter || b.name}</span>
                    </div>
                    <p className="mt-1 truncate text-sm font-bold" style={{ color: TEXT }}>{b.name}</p>
                    <p className="line-clamp-1 text-[11px]" style={{ color: MUTED }}>{b.intro || '暂无简介'}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {/* 侧栏: 点击排行(in-phlist) + 最近更新表(in-rise-ta 斑马纹) */}
        <aside>
          <div className="overflow-hidden rounded-[3px]">
            <h3 className="flex h-[48px] items-center px-3 text-lg text-white" style={{ background: ORANGE_LIGHT }}>点击排行</h3>
            <ol className="bg-white px-3 py-1" style={{ listStyle: 'none' }}>
              {clickRank.slice(0, 10).map((b, i) => (
                <li key={b.id} className="flex items-center gap-2 border-b border-solid border-[#f5f5f5] py-2 last:border-b-0">
                  <span aria-hidden className="w-4 shrink-0 text-center text-xs font-bold" style={{ color: i < 3 ? ORANGE : MUTED }}>{i + 1}</span>
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'book', bookId: b.id })}
                    className="min-w-0 flex-1 truncate text-left text-[13px] text-[#333333] transition-colors hover:text-[#fa8729]"
                    aria-label={`查看《${b.name}》详情`}
                  >
                    {b.name}
                  </button>
                </li>
              ))}
              {!clickRank.length && <Sk className="my-2 h-40 w-full" />}
            </ol>
          </div>
          <div className="mt-5 overflow-hidden rounded-[3px] border border-[#ededed]">
            <h3 className="flex h-10 items-center border-b border-solid border-[#ededed] px-3 text-sm font-bold" style={{ color: TITLE }}>最近更新</h3>
            <table className="w-full text-xs">
              <tbody>
                {books.slice(0, 14).map((b, i) => (
                  <tr key={b.id} style={{ background: i % 2 === 0 ? '#fafafa' : '#ffffff', borderBottom: '1px solid #ededed' }}>
                    <td className="max-w-0 truncate px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => navigate({ view: 'book', bookId: b.id })}
                        className="text-left text-[#333333] transition-colors hover:text-[#fa8729]"
                        aria-label={`查看《${b.name}》详情`}
                      >
                        {b.name}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-1 py-1.5 text-right text-[#999999]">{fmtDate(b.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </aside>
      </div>
    </section>
  )
}

export function PiliHome({ books, loading }: SiteHomeProps) {
  const { site } = usePublic()
  // 榜单维度内部另拉(字数榜近似点击/月票; 失败回退 props 切片) — 切站重置用渲染期同步模式
  const [rankBooks, setRankBooks] = useState<BookItem[] | null>(null)
  const [prevSite, setPrevSite] = useState(site.id)
  if (prevSite !== site.id) {
    setPrevSite(site.id)
    setRankBooks(null)
  }
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 10 })
      .then((d) => {
        if (alive) setRankBooks(d.books)
      })
      .catch(() => {
        /* 静默回退 props 切片 */
      })
    return () => {
      alive = false
    }
  }, [site.id])
  const rank = rankBooks ?? books
  const loadingAll = loading && !books.length

  return (
    <div className="bg-white pb-2 text-[#333333]">
      <PiliTagBar books={books} />
      <PiliBanner featured={books[0]} rankBooks={rank} loading={loadingAll} />
      <PiliStrong books={books.slice(1, 17)} />
      <PiliVip books={books.slice(17, 37)} monRank={rank} monLoading={loadingAll} />
      <PiliMain books={books.slice(37)} clickRank={rank} />
      {/* 真站页脚 #f69057 由通用 SiteFooter 呈现, 此处仅保留版心内容 */}
    </div>
  )
}
