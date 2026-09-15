// ============================================================
// [R24-6-c] 霹雳书屋 克隆首页 —— 按 https://www.pilishuwu.com/ 首页真站结构 1:1 还原。
// 真站结构(样本 /tmp/sites/pilishuwu-home.html + style0/4.css 实测, wmcms 模板):
//   1. .mod-tags-wr            独家推荐词条条(米色带 #faead0 + 橙块徽标 + 书名词链,
//                              桌面 hover 弹出封面卡)
//   2. .in-banner-wrap         横幅行 = 大封面 banner(356px 高/底部橙条书名/hover 黑纱
//                              出信息) + .in-rank-wr 深色热点榜(#373533/橙色栏头/橙灰
//                              序号徽章/虚线分隔/黄字推荐行)
//   3. .in-strong-wr 强档推荐  2px 橙上边线 + 30px 大标题压线 + 左大封(214×284) +
//                              右横向作品卡(书名 18px/作者/简介) + 底部 7 封面条
//                              (100×133/hover 黑纱)
//   4. .in-main-wr+.in-side-wr 主列 = 两个分类封面列(mod-cover-list: 135×177 封面 +
//                              底部章节黑条 + 书名/简介/标签) ; 侧栏 = .in-phlist-wrap
//                              点击排行(#ff9a6a 栏头 48px/#f7f7f7 列头) +
//                              .in-rise-ta 最近更新表(斑马纹 #fafafa/行线 #ededed)
// 数据口径: props.books=最新 48 本(横幅/强档/分类列/最近更新); 另拉 字数最多(点击榜)
// 喂热点榜与点击排行侧栏。完结/连载徽章用 StatusBadge(pili 首页允许)。
// 颜色均为真站 CSS 实测硬编码(#fd8929/#ff9a6a/#faead0/#d71704 基因), 结构照搬。
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import { BookOpen, ChevronRight, Clock3, Flame, TrendingUp } from 'lucide-react'
import type { SiteHomeProps } from './shared'
import { usePublic } from '../ctx'
import { fetchBooks } from '../data'
import type { BookItem } from '../types'
import { BookCover } from '../BookCover'
import { Sk, StatusBadge, bookNavProps } from '../bits'
import { fmtDate, formatWords } from '../seo'

/** [R24-6-c-10] 真站实测色值常量(pilishuwu style0/style4.css) */
const PILI_ORANGE = '#fd8929' // 主橙(×24)
const PILI_ORANGE_LIGHT = '#ff9a6a' // 浅橙强调(标题压线/榜单头/hover)
const PILI_BTN_BORDER = '#ec7d4d'
const PILI_RED = '#d71704' // 红强调(×9)
const PILI_BEIGE = '#faead0' // 米色分类条
const PILI_BEIGE_BORDER = '#eed3a4'
const PILI_DARK = '#373533' // 横幅右侧热点榜深底(原 sprite 深盒)
const PILI_TEXT = '#333333'
const PILI_TITLE = '#555555'
const PILI_MUTED = '#999999'

/** [R24-6-c-11] 独家推荐词条 + hover 封面弹出卡(真站 mod-animate-list/mod-ani-info) */
function PiliTagBar({ books }: { books: BookItem[] }) {
  const { navigate } = usePublic()
  const picks = books.slice(0, 7)
  if (!picks.length) return null
  return (
    <div className="border-y" style={{ background: PILI_BEIGE, borderColor: PILI_BEIGE_BORDER }}>
      <div className="mx-auto w-full max-w-6xl px-4 py-1.5 sm:px-6">
        <ul className="flex items-center gap-x-5 overflow-x-auto" style={{ listStyle: 'none' }}>
          <li className="shrink-0">
            <span
              className="inline-flex h-[27px] items-center rounded-[3px] px-2 text-xs text-white"
              style={{ background: `linear-gradient(180deg, #ff9126, ${PILI_ORANGE})`, boxShadow: `inset 0 0 1px rgba(255,255,255,0.5), 0 0 0 1px ${PILI_BTN_BORDER}` }}
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
              {/* hover 弹出卡(真站 mod-ani-info: 封面+书名+作者+开始阅读), 桌面悬浮/移动端不渲染占位 */}
              <div
                className="invisible absolute left-0 top-full z-30 hidden w-[290px] cursor-default rounded-[3px] border bg-white p-3 opacity-0 shadow-[0_6px_20px_rgba(125,54,15,0.18)] transition-opacity duration-200 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 md:block"
                style={{ borderColor: '#e0b070' }}
              >
                <div className="flex gap-3">
                  <div className="h-[80px] w-[60px] shrink-0 overflow-hidden rounded-[2px]">
                    <BookCover name={b.name} cover={b.cover} showAuthor={b.author} style={{ borderRadius: 2 }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold" style={{ color: PILI_TITLE }}>{b.name}</p>
                    <p className="mt-0.5 truncate text-xs text-[#666666]">{b.author} · {b.category}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-[18px] text-[#999999]">{b.intro || '暂无简介'}</p>
                    <p className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: PILI_ORANGE }}>
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

/** [R24-6-c-12] 横幅行 = 大封面 banner + 深色热点榜(真站 in-banner + in-rank-wr) */
function PiliBanner({ featured, rankBooks, loading }: { featured?: BookItem; rankBooks: BookItem[]; loading: boolean }) {
  const { navigate } = usePublic()
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 pt-5 sm:px-6 lg:grid-cols-[1fr_257px]">
      {/* banner 主图(真站 356px 高, 底部橙条书名, hover 黑纱出信息) */}
      {featured ? (
        <div
          {...bookNavProps(navigate, featured.id)}
          aria-label={`查看《${featured.name}》详情`}
          className="group relative h-[240px] cursor-pointer overflow-hidden sm:h-[300px] lg:h-[356px]"
        >
          <BookCover name={featured.name} cover={featured.cover} showAuthor={featured.author} style={{ borderRadius: 0 }} className="absolute inset-0" />
          {/* hover 黑纱(in-banner-bg) + 居中信息(in-banner-info) */}
          <div aria-hidden className="absolute inset-0 bg-black opacity-0 transition-opacity duration-500 group-hover:opacity-50 group-focus-within:opacity-50" />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-within:opacity-100">
            <strong className="text-lg text-white">{featured.name}</strong>
            <span className="text-xs text-white/85">{featured.author} · {featured.category} · {formatWords(featured.wordCount)}</span>
            <span className="line-clamp-2 max-w-[560px] text-xs leading-[18px] text-white/75">{featured.intro}</span>
          </div>
          {/* 底部书名橙条(in-banner-name, 真站 #f1823a 底白字 30px 条) */}
          <span className="absolute bottom-0 left-0 flex h-[30px] max-w-[70%] items-center bg-[#f1823a] px-3 text-base text-white">
            <span className="truncate">{featured.name}</span>
          </span>
        </div>
      ) : (
        <Sk className="h-[240px] w-full rounded-[3px] sm:h-[300px] lg:h-[356px]" />
      )}

      {/* 深色热点榜(in-rank-wr) */}
      <aside className="rounded-[3px] px-3.5 pb-4 pt-2" style={{ background: PILI_DARK }} aria-label="热点榜单">
        <h2 className="h-12 text-lg font-normal" style={{ color: PILI_ORANGE_LIGHT }}>
          热点榜单
        </h2>
        {loading ? (
          <div className="space-y-2" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <Sk key={i} className="h-4 w-full" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
            ))}
          </div>
        ) : (
          <ul style={{ listStyle: 'none' }}>
            {rankBooks.slice(0, 8).map((b, i) => (
              <li key={b.id} className="mb-2 flex h-[18px] items-center overflow-hidden">
                <span
                  className="mr-2.5 inline-block h-[12px] w-[14px] shrink-0 rounded-[2px] text-center text-[10px] leading-[12px]"
                  style={
                    i < 3
                      ? { color: '#ffffff', backgroundColor: PILI_ORANGE_LIGHT, border: '1px solid #393939' }
                      : { color: '#9a9a9a', backgroundColor: '#353334', border: '1px solid #454545' }
                  }
                >
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'book', bookId: b.id })}
                  aria-label={`查看《${b.name}》详情`}
                  className="truncate text-xs text-[#cfcfcf] transition-colors hover:text-white"
                >
                  {b.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* 虚线分隔(in-rank-spacing) + 黄字推荐行(in-rank-recommend) */}
        <div aria-hidden className="mb-2 mt-3 border-y" style={{ borderTop: '1px dashed #6b6b6b', borderBottom: '1px dashed #474747' }} />
        <div className="grid grid-cols-2 gap-x-2.5">
          {rankBooks.slice(8, 12).map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => navigate({ view: 'book', bookId: b.id })}
              aria-label={`查看《${b.name}》详情`}
              className="flex h-7 min-w-0 items-center truncate text-xs text-[#ffca68] transition-colors hover:text-white"
            >
              <TrendingUp className="mr-1 h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{b.name}</span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  )
}

/** [R24-6-c-13] 强档推荐区块标题(真站 in-title-wr: 2px 橙上边线 + 30px 大字压线) */
function PiliSectionTitle({ title, more }: { title: string; more?: { label: string; go: () => void } }) {
  const { navigate } = usePublic()
  return (
    <div className="border-t-2" style={{ borderColor: PILI_ORANGE_LIGHT }}>
      <div className="flex items-end justify-between">
        <h2 className="inline-block -translate-y-2 bg-[#fafafa] pr-6 text-2xl font-normal leading-[30px] sm:text-[30px]" style={{ color: PILI_TITLE }}>
          {title}
        </h2>
        {more ? (
          <button
            type="button"
            onClick={more.go}
            className="mb-1 inline-flex items-center gap-0.5 text-base transition-colors hover:text-[#ff9a6a]"
            style={{ color: PILI_TEXT }}
          >
            {more.label}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate({ view: 'category' })}
            className="mb-1 inline-flex items-center gap-0.5 text-base transition-colors hover:text-[#ff9a6a]"
            style={{ color: PILI_TEXT }}
          >
            更多
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}

/** [R24-6-c-14] 强档推荐 = 左大封 + 右作品行×3 + 底部封面横条(真站 in-sign-* / in-sign-list) */
function PiliStrong({ books, loading }: { books: BookItem[]; loading: boolean }) {
  const { navigate } = usePublic()
  const featured = books[0]
  const rows = books.slice(1, 4)
  const strip = books.slice(4, 11)
  if (loading) {
    return (
      <div className="mt-8" aria-hidden>
        <Sk className="h-8 w-40" />
        <div className="mt-4 grid gap-5 lg:grid-cols-[214px_1fr]">
          <Sk className="h-[284px] w-full rounded-[3px] lg:w-[214px]" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Sk className="h-5 w-1/2" />
                <Sk className="h-3.5 w-1/3" />
                <Sk className="h-3.5 w-5/6" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }
  return (
    <section className="mx-auto mt-8 w-full max-w-6xl px-4 sm:px-6">
      <PiliSectionTitle title="强档推荐" />
      <div className="mt-4 grid gap-5 lg:grid-cols-[214px_1fr]">
        {/* 左侧大封(in-sign-cover 214×284) */}
        {featured ? (
          <div
            {...bookNavProps(navigate, featured.id)}
            aria-label={`查看《${featured.name}》详情`}
            className="hidden w-[214px] shrink-0 cursor-pointer overflow-hidden rounded-[3px] border border-[#eeeded] shadow-[0_1px_0_#eeeded] lg:block"
          >
            <BookCover name={featured.name} cover={featured.cover} showAuthor={featured.author} style={{ borderRadius: 0 }} className="h-[284px] w-[214px]" />
          </div>
        ) : null}
        <div className="min-w-0">
          {/* 右侧作品行(in-sign-work: 书名 18px/作者/简介) */}
          <div className="flex flex-col gap-4">
            {rows.map((b) => (
              <div
                key={b.id}
                {...bookNavProps(navigate, b.id)}
                aria-label={`查看《${b.name}》详情`}
                className="group cursor-pointer overflow-hidden py-1"
              >
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-lg leading-[30px] transition-colors group-hover:text-[#fa8729]" style={{ color: PILI_TITLE }}>
                    {b.name}
                  </h3>
                  <StatusBadge status={b.status} small />
                </div>
                <p className="pt-1 text-xs text-[#666666]">
                  作者：<strong className="font-normal">{b.author}</strong>
                  <span className="ml-3" style={{ color: PILI_ORANGE }}>{b.category}</span>
                  <span className="ml-3">{formatWords(b.wordCount)}</span>
                </p>
                <p className="line-clamp-2 pt-1 text-[13px] leading-[22px] text-[#666666] transition-colors group-hover:text-[#333333]">
                  {b.intro || '暂无简介'}
                </p>
              </div>
            ))}
          </div>
          {/* 底部封面横条(in-sign-list: 100×133 封面 + 26px 书名行, hover 黑纱) */}
          {strip.length ? (
            <div className="mt-4 flex gap-4 overflow-x-auto pb-1 lg:mt-5 lg:gap-[21px]">
              {strip.map((b) => (
                <div key={b.id} className="group w-[86px] shrink-0 cursor-pointer sm:w-[100px]" {...bookNavProps(navigate, b.id)} aria-label={`查看《${b.name}》详情`}>
                  <div className="relative overflow-hidden rounded-[2px] border border-[#eeeded] shadow-[0_1px_0_#eeeded]">
                    <BookCover name={b.name} cover={b.cover} showAuthor={b.author} style={{ borderRadius: 0 }} className="h-[114px] w-full sm:h-[133px]" />
                    <span aria-hidden className="absolute inset-0 bg-black opacity-0 transition-opacity group-hover:opacity-20" />
                  </div>
                  <p className="truncate text-xs leading-[26px] text-[#333333]">{b.name}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

/** [R24-6-c-15] 分类封面列(mod-cover-list: 135×177 封面 + 章节黑条 + 书名/简介) */
function PiliCoverColumn({ title, books }: { title: string; books: BookItem[] }) {
  const { navigate } = usePublic()
  if (!books.length) return null
  return (
    <section aria-label={`${title}推荐`}>
      <div className="mb-3 flex items-center justify-between border-b border-[#f0e6d2] pb-2">
        <h3 className="flex items-center gap-1.5 text-xl font-normal" style={{ color: PILI_TITLE }}>
          <Flame className="h-4 w-4" style={{ color: PILI_ORANGE }} aria-hidden />
          {title}
        </h3>
        <button
          type="button"
          onClick={() => books[0] && navigate({ view: 'category', cat: books[0].categoryId || undefined })}
          aria-label={`更多${title}作品`}
          className="inline-flex min-h-[44px] items-center gap-0.5 text-sm transition-colors hover:text-[#ff9a6a] lg:min-h-0"
          style={{ color: PILI_TEXT }}
        >
          更多
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex gap-[21px] overflow-x-auto pb-1">
        {books.map((b) => (
          <div key={b.id} className="group w-[135px] shrink-0" {...bookNavProps(navigate, b.id)} aria-label={`查看《${b.name}》详情`}>
            {/* 封面 + 底部章节黑条(mod-cover-list-mask) */}
            <div className="relative w-full cursor-pointer overflow-hidden rounded-[2px] transition-shadow group-hover:shadow-[0_0_0_2px_#ff9a6a]">
              <BookCover name={b.name} cover={b.cover} showAuthor={b.author} style={{ borderRadius: 0 }} className="h-[177px] w-full" />
              <span className="absolute bottom-0 left-0 flex h-[22px] w-full items-center justify-center overflow-hidden bg-black/60 px-1 text-center text-[11px] text-white">
                <span className="truncate">{b.latestChapter || '连载中'}</span>
              </span>
            </div>
            {/* 书名 / 简介 / 标签(mod-cover-list-name/intro/tag) */}
            <p className="mt-[7px] truncate text-sm text-[#333333] transition-colors group-hover:text-[#ff9a6a]">{b.name}</p>
            <p className="h-[22px] truncate text-xs leading-[22px] text-[#999999]">{b.intro || b.author}</p>
            <p className="h-5 truncate text-xs text-[#999999]">
              <span className="transition-colors group-hover:text-[#ff9a6a]">{b.category}</span> · {b.author}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

/** [R24-6-c-16] 侧栏: 点击排行(in-phlist-wrap) + 最近更新表(in-rise-ta) */
function PiliSide({ hot, latest, loading }: { hot: BookItem[]; latest: BookItem[]; loading: boolean }) {
  const { navigate } = usePublic()
  return (
    <aside className="min-w-0">
      {/* 点击排行(#ff9a6a 栏头 48px + #f7f7f7 列头 40px) */}
      <div className="border" style={{ borderColor: '#d3d3d3' }} aria-label="点击排行">
        <div className="flex h-12 items-center justify-between" style={{ background: PILI_ORANGE_LIGHT }}>
          <h3 className="pl-3 text-[22px] font-normal text-white">点击排行</h3>
          <TrendingUp className="mr-3 h-5 w-5 text-white/85" aria-hidden />
        </div>
        <div className="flex h-10 items-center text-sm" style={{ background: '#f7f7f7', color: PILI_TEXT }}>
          <span className="w-[46px] pl-3">排名</span>
          <span className="flex-1">书目</span>
          <span className="pr-3">点击</span>
        </div>
        {loading ? (
          <div className="space-y-3 p-3" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <Sk key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : (
          <ul style={{ listStyle: 'none' }}>
            {hot.slice(0, 10).map((b, i) => (
              <li
                key={b.id}
                className="flex items-center border-b border-[#ededed] last:border-b-0"
                style={{ background: i % 2 === 1 ? '#fafafa' : undefined }}
              >
                <span className="w-[46px] pl-3 text-sm font-bold tabular-nums" style={{ color: i < 3 ? PILI_ORANGE : PILI_MUTED, fontFamily: 'Arial' }}>
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'book', bookId: b.id })}
                  aria-label={`查看《${b.name}》详情`}
                  className="min-w-0 flex-1 truncate py-[9px] pr-2 text-left text-[13px] transition-colors hover:text-[#ff9a6a]"
                  style={{ color: PILI_TEXT }}
                >
                  {b.name}
                </button>
                <span className="pr-3 text-xs tabular-nums" style={{ color: PILI_MUTED }}>
                  {formatWords(b.wordCount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 最近更新表(in-rise-ta: 分类/书名+章节/时间, 斑马纹) */}
      <div className="mt-6" aria-label="最近更新">
        <h3 className="flex items-center gap-1.5 text-xl font-normal" style={{ color: PILI_TITLE }}>
          <Clock3 className="h-4 w-4" style={{ color: PILI_ORANGE }} aria-hidden />
          最近更新
        </h3>
        <div className="mt-3 border pt-1" style={{ borderColor: '#cfc8be', background: '#ffffff' }}>
          {(loading ? Array.from({ length: 8 }).map(() => null) : latest).map((b, i) =>
            b ? (
              <div
                key={b.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 border-b border-[#ededed] px-2 py-[9px] last:border-b-0"
                style={{ background: i % 2 === 1 ? '#fafafa' : undefined }}
              >
                <button
                  type="button"
                  onClick={() => navigate({ view: 'category', cat: b.categoryId || undefined })}
                  aria-label={`浏览 ${b.category} 分类`}
                  className="rounded-[2px] px-1.5 py-0.5 text-[11px] transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(253,137,41,0.12)', color: PILI_RED }}
                >
                  {b.category || '小说'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'book', bookId: b.id })}
                  aria-label={`查看《${b.name}》详情`}
                  className="min-w-0 text-left"
                >
                  <span className="block truncate text-[13px] font-bold transition-colors hover:text-[#ff9a6a]" style={{ color: PILI_TEXT }}>
                    {b.name}
                  </span>
                  <span className="block truncate text-[11px] text-[#666666] max-lg:hidden">{b.latestChapter || '暂无章节'}</span>
                </button>
                <span className="text-[11px] tabular-nums" style={{ color: PILI_MUTED }}>
                  {fmtDate(b.updatedAt)}
                </span>
              </div>
            ) : (
              <div key={`sk-${i}`} className="border-b border-[#ededed] px-2 py-[9px]" aria-hidden>
                <Sk className="h-4 w-full" />
              </div>
            ),
          )}
        </div>
      </div>
    </aside>
  )
}

export function PiliHome({ books, loading }: SiteHomeProps) {
  const { site } = usePublic()

  // [R24-6-c-17] 维度: 字数最多(点击榜基因)喂 热点榜/点击排行 侧栏; 其余板块消费 props.books。
  const [hot, setHot] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 12 })
      .then((d) => {
        if (alive) setHot(d.books || [])
      })
      .catch(() => {
        if (alive) setHot([]) // 失败静默: 回退 props.books
      })
    return () => {
      alive = false
    }
  }, [site.id])

  const hotList = useMemo<BookItem[]>(() => {
    if (hot && hot.length) return hot
    return [...books].sort((a, b) => b.wordCount - a.wordCount).slice(0, 12)
  }, [hot, books])

  // 分类封面列: 最新 48 本按分类分组, 取书目最多的两组(对应真站 男频/女频 双列)
  const catColumns = useMemo(() => {
    const groups = new Map<string, { name: string; items: BookItem[] }>()
    for (const b of books) {
      const key = b.categoryId || b.category || 'other'
      const g = groups.get(key)
      if (g) g.items.push(b)
      else groups.set(key, { name: b.category || '其他', items: [b] })
    }
    return [...groups.values()]
      .sort((a, b) => b.items.length - a.items.length)
      .slice(0, 2)
      .map((g) => ({ name: g.name, items: g.items.slice(0, 4) }))
  }, [books])

  return (
    <div className="w-full pb-12" style={{ color: PILI_TEXT }}>
      {/* ============ 独家推荐米色词条条(mod-tags-wr) ============ */}
      {!loading && <PiliTagBar books={books} />}
      {loading && (
        <div style={{ background: PILI_BEIGE, borderColor: PILI_BEIGE_BORDER }} className="border-y">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 overflow-hidden px-4 py-1.5 sm:px-6" aria-hidden>
            <Sk className="h-[27px] w-16 shrink-0 rounded-[3px]" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Sk key={i} className="h-4 w-20 shrink-0" style={{ backgroundColor: 'rgba(125,54,15,0.1)' }} />
            ))}
          </div>
        </div>
      )}

      {/* ============ 横幅行: 大封面 banner + 深色热点榜 ============ */}
      <PiliBanner featured={books[0]} rankBooks={hotList} loading={loading} />

      {/* ============ 强档推荐(in-strong-wr) ============ */}
      <PiliStrong books={books} loading={loading} />

      {/* ============ 主列(双分类封面列) + 侧栏(点击排行/最近更新) ============ */}
      <div className="mx-auto mt-8 grid w-full max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_246px]">
        <div className="flex min-w-0 flex-col gap-8">
          {loading && !books.length
            ? Array.from({ length: 2 }).map((_, i) => (
                <div key={i} aria-hidden>
                  <Sk className="h-7 w-36" />
                  <div className="mt-3 flex gap-[21px] overflow-hidden">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} className="w-[135px] shrink-0 space-y-2">
                        <Sk className="h-[177px] w-full rounded-[2px]" />
                        <Sk className="h-3.5 w-4/5" />
                        <Sk className="h-3 w-full" />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            : catColumns.map((g) => <PiliCoverColumn key={g.name} title={g.name} books={g.items} />)}
        </div>
        <PiliSide hot={hotList} latest={books.slice(0, 14)} loading={loading} />
      </div>
    </div>
  )
}
