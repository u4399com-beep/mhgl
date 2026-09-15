// ============================================================
// 格格党 克隆首页 —— 按 www.ggd66.com 首页与真站一模一样还原。
// [R24-6-d-1] 真站结构(ggd66-home.html + style1.css 11KB 实测):
//   .container(90%/max 900px) 内两行 .content(73% 左 + 25% 右双栏, 移动单列):
//     行① #fengtui 热门小说推荐(6 item 两列: 120×150 封面 + dt 作者右浮/书名粗体
//         + dd 简介 120px 2em 缩进) | #fengyou 搜索框 + 阅读排行榜 13 行([分类] 书名 作者)
//     行② #zuixin 最新小说 30 行 | #gengxin 最近更新 30 行(s1 分类 75px / s2 书名 165px /
//         s3 最新章节 / s4 作者右浮 90px / s5 时间右浮 90px)
//   色值全部真站实测硬编码: 底 #f9f9f9 · 字 #888(15px 微软雅黑 150%) · 链接 #00886d
//   · hover #f50 · 标题 #333 18px/500 底边 1px #ccc · 虚线/点线 #ccc · 搜索框描边/按钮
//   #56ccb5 · header 青 #1abc9c(头部由 SiteHeader 分支渲染, 本组件只做主内容区)。
//   行高 36px(28px 内容+4px 上下内距), 移动端行抬升至 ≥44px 触控目标。
//   数据: props.books=最新 48 本(最新小说/最近更新 30 行 + 兜底); 追加 1 维
//   fetchBooks(sort:words, size:60) 供 封推 6 项(优先带封面) + 阅读排行榜 13 行
//   (alive 防竞态, 失败静默回退 props 口径)。
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SiteHomeProps } from './shared'
import { usePublic } from '../ctx'
import { fetchBooks } from '../data'
import { bookNavProps, Sk } from '../bits'
import { BookCover } from '../BookCover'
import type { BookItem } from '../types'

// [R24-6-d-2] 真站实测色板(style1.css)
const C = {
  teal: '#1abc9c',
  tealLight: '#56ccb5',
  link: '#00886d',
  hover: '#f50',
  text: '#888888',
  heading: '#333333',
  border: '#cccccc',
} as const

// 真站 font-family
const FONT = '"Microsoft YaHei",Microsoft Yahei,simsun,arial,sans-serif'

/** 真站 h2: 18px/500 #333 + 底边 1px #ccc + 上距 10px 下距 10px */
function GgH2({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h2 className={`mt-2.5 border-b pb-2.5 text-lg font-medium ${className || ''}`} style={{ borderColor: C.border, color: C.heading }}>
      {children}
    </h2>
  )
}

/** [R24-6-d-3] #fengtui .item: 120×150 白底描边封面 + dt(书名粗体 #00886d + 作者右浮) + dd(120px 简介区 2em 缩进 14px/24px) */
function FengtuiItem({ book }: { book: BookItem }) {
  const { navigate } = usePublic()
  return (
    <div className="flex pt-2.5">
      <div className="mr-2.5 w-[120px] shrink-0">
        <div style={{ background: '#fff', border: `1px solid ${C.border}`, padding: 1 }}>
          <BookCover name={book.name} cover={book.cover} className="h-[148px] w-[118px] rounded-none" />
        </div>
      </div>
      <dl className="min-w-0 flex-1 pr-[5px]">
        <dt className="flex h-[25px] items-center overflow-hidden border-b border-dotted" style={{ borderColor: C.border }}>
          <span
            {...bookNavProps(navigate, book.id)}
            className="min-w-0 flex-1 cursor-pointer truncate text-[15px] font-bold leading-[25px] hover:text-[#f50]"
            style={{ color: C.link }}
          >
            {book.name}
          </span>
          <span className="shrink-0 pl-2 text-sm font-normal leading-[25px]" style={{ color: C.text }}>
            {book.author}
          </span>
        </dt>
        <dd className="h-[120px] overflow-hidden pt-[7px] text-sm leading-6" style={{ color: C.text, textIndent: '2em' }}>
          {book.intro}
        </dd>
      </dl>
    </div>
  )
}

/** [R24-6-d-4] #fengyou 搜索框: 2px 青描边 5px 圆角, 输入 #f9f9f9/#56ccb5 80% + 按钮 20% 白字(桌面版真站 hidden-xs) */
function FengyouSearch() {
  const { navigate } = usePublic()
  const [q, setQ] = useState('')
  return (
    <form
      className="mb-2.5 hidden overflow-hidden rounded-[5px] border-2 md:block"
      style={{ borderColor: C.tealLight, background: '#fff' }}
      onSubmit={(e) => {
        e.preventDefault()
        const k = q.trim()
        if (k) navigate({ view: 'search', q: k })
      }}
    >
      <div className="relative flex h-[38px] items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={50}
          placeholder="搜索从这里开始..."
          aria-label="站内搜索"
          className="h-full w-[80%] border-none bg-[#f9f9f9] text-base outline-none"
          style={{ color: C.tealLight, textIndent: '1em' }}
        />
        <button type="submit" className="absolute right-0 top-0 h-full w-[20%] cursor-pointer border-none text-base text-white" style={{ background: C.tealLight }}>
          搜&nbsp;&nbsp;索
        </button>
      </div>
    </form>
  )
}

/** [R24-6-d-5] #fengyou/#zuixin 行: [分类] 书名(15px #00886d) + 作者右浮(14px), 36px 虚线行(移动 ≥44px) */
function CatBookLi({ book }: { book: BookItem }) {
  const { navigate } = usePublic()
  return (
    <li
      className="flex h-9 items-center overflow-hidden border-b border-dashed max-md:min-h-[44px]"
      style={{ borderColor: C.border, lineHeight: '28px' }}
    >
      <span className="shrink-0 text-sm" style={{ color: C.text }}>
        [{book.category}]&nbsp;
      </span>
      <span
        {...bookNavProps(navigate, book.id)}
        className="min-w-0 flex-1 cursor-pointer truncate text-[15px] hover:text-[#f50]"
        style={{ color: C.link }}
      >
        {book.name}
      </span>
      <span className="shrink-0 pl-1 text-sm" style={{ color: C.text }}>
        {book.author}
      </span>
    </li>
  )
}

/** [R24-6-d-6] #gengxin 行: s1 分类 75px / s2 书名 165px / s3 最新章节 / s4 作者 90px / s5 时间 90px 右对齐
 *  (真站断点: ≤947px 隐 s4, ≤767px 隐 s3+s4; 移动行高 ≥44px) */
function GengxinLi({ book }: { book: BookItem }) {
  const { navigate } = usePublic()
  return (
    <li
      className="flex h-9 items-center overflow-hidden border-b border-dashed max-md:min-h-[44px]"
      style={{ borderColor: C.border, lineHeight: '28px' }}
    >
      <span className="w-[75px] shrink-0 truncate text-sm" style={{ color: C.text }}>
        [{book.category}]
      </span>
      <span
        {...bookNavProps(navigate, book.id)}
        className="w-[165px] shrink-0 cursor-pointer truncate text-[15px] hover:text-[#f50]"
        style={{ color: C.link }}
      >
        {book.name}
      </span>
      <span className="ml-1 min-w-0 flex-1 truncate text-sm max-md:hidden" style={{ color: C.text }}>
        {book.latestChapter || ''}
      </span>
      <span className="ml-auto w-[90px] shrink-0 truncate text-sm max-[947px]:hidden" style={{ color: C.text }}>
        {book.author}
      </span>
      <span className="w-[90px] shrink-0 text-right text-sm" style={{ color: C.text }}>
        {fmtMDHM(book.updatedAt)}
      </span>
    </li>
  )
}

/** 真站更新时间格式 MM-DD HH:mm(如 09-15 19:18) */
function fmtMDHM(d?: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`
}

/** 封推取书: 优先带封面, 不足补无封面(共 n 本) */
function pickWithCover(list: BookItem[], n: number): BookItem[] {
  const withCover = list.filter((b) => !!b.cover)
  const rest = list.filter((b) => !b.cover)
  return [...withCover, ...rest].slice(0, n)
}

/** [R24-6-d-7] 加载骨架: 双栏位形一致防 CLS */
function HomeSkeleton() {
  return (
    <div className="mx-auto w-[90%] max-w-[900px]" role="status" aria-label="页面加载中" style={{ color: C.text, fontFamily: FONT, fontSize: 15 }}>
      <div className="my-2.5 flex flex-col md:flex-row">
        <div className="w-full md:w-[73%]">
          <Sk className="mb-3 mt-2.5 h-5 w-36" />
          <div className="grid grid-cols-1 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex pt-2.5">
                <Sk className="mr-2.5 h-[150px] w-[120px] shrink-0" />
                <div className="min-w-0 flex-1 pt-1">
                  <Sk className="h-4 w-3/4" />
                  <Sk className="mt-3 h-3 w-full" />
                  <Sk className="mt-2 h-3 w-5/6" />
                  <Sk className="mt-2 h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="w-full md:ml-[2%] md:w-[25%]">
          <Sk className="mb-3 mt-2.5 h-10 w-full" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Sk key={i} className="mt-2 h-6 w-full" />
          ))}
        </div>
      </div>
      <div className="my-2.5 flex flex-col md:flex-row">
        <div className="w-full md:w-[25%]">
          <Sk className="mb-3 mt-2.5 h-5 w-28" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Sk key={i} className="mt-2 h-6 w-full" />
          ))}
        </div>
        <div className="w-full md:ml-[2%] md:w-[73%]">
          <Sk className="mb-3 mt-2.5 h-5 w-28" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Sk key={i} className="mt-2 h-6 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function Ggd66Home({ books, loading }: SiteHomeProps) {
  const { site } = usePublic()
  // [R24-6-d-8] 追加维度: 字数降序 60 本(封推 6 + 阅读排行榜 13); alive 防竞态, 失败静默用 props 兜底
  const [pool, setPool] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    // [R24-6-修] effect 起始同步 setState 会触发级联渲染(react-hooks/set-state-in-effect), 移除; 站点切换由 HomeView key 重挂载兜底
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 60 })
      .then((d) => {
        if (alive) setPool(d.books || [])
      })
      .catch(() => {
        /* 静默降级: 沿用 props(最新 48) 口径 */
      })
    return () => {
      alive = false
    }
  }, [site.id])

  const tuiBooks = useMemo(() => pickWithCover(pool && pool.length ? pool : books, 6), [pool, books])
  const rankBooks = useMemo(() => (pool && pool.length ? pool.slice(0, 13) : books.slice(0, 13)), [pool, books])
  const newestBooks = useMemo(() => books.slice(0, 30), [books])
  const updateList = useMemo(() => books.slice(0, 30), [books])

  if (loading) return <HomeSkeleton />

  return (
    // [R24-6-d-9] 真站 .container(90%/max 900px) + body 15px 微软雅黑 #888(头部由 SiteHeader 的 Ggd66Header 分支渲染)
    <div className="mx-auto w-[90%] max-w-[900px]" style={{ color: C.text, fontFamily: FONT, fontSize: 15, lineHeight: 1.5 }}>
      {/* 行① #fengtui 热门小说推荐 | #fengyou 搜索+阅读排行榜 */}
      <div className="my-2.5 flex flex-col md:flex-row">
        <div className="w-full md:w-[73%]">
          <GgH2>热门小说推荐</GgH2>
          <div className="grid grid-cols-1 md:grid-cols-2">
            {tuiBooks.map((b) => (
              <FengtuiItem key={b.id} book={b} />
            ))}
          </div>
        </div>
        <div className="w-full md:ml-[2%] md:w-[25%]">
          <FengyouSearch />
          {/* 真站 h2.visible-xs: 阅读排行榜标题仅移动端显示 */}
          <GgH2 className="md:hidden">阅读排行榜</GgH2>
          <ul className="pt-[5px]">
            {rankBooks.map((b) => (
              <CatBookLi key={b.id} book={b} />
            ))}
          </ul>
        </div>
      </div>

      {/* 行② #zuixin 最新小说 | #gengxin 最近更新(真站 DOM 右栏在前) */}
      <div className="my-2.5 flex flex-col md:flex-row">
        <div className="w-full md:w-[25%]">
          <GgH2>最新小说</GgH2>
          <ul className="pt-[5px]">
            {newestBooks.map((b) => (
              <CatBookLi key={b.id} book={b} />
            ))}
          </ul>
        </div>
        <div className="w-full md:ml-[2%] md:w-[73%]">
          <GgH2>最近更新</GgH2>
          <ul className="pt-[5px]">
            {updateList.map((b) => (
              <GengxinLi key={b.id} book={b} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
