// ============================================================
// 船说CMS 克隆首页 —— 按 demo.shipsay.com 首页与真站一模一样还原。
// [R24-6-d-1] 真站结构(shipsay-home.html + style1.css 18KB 实测):
//   .container(960px) 内四个容器块:
//     ① .side_commend(700px)「大神小说」6 li 双列(img_span 100×133 封面卡 + 底部
//        「分类 / 状态」半透明遮罩条 + h2 书名 + p.indent 77px 简介 + li_bottom 统计行
//        (作者 + em.orange 字数 + em.blue 日期)) | aside(250px)「热门小说」12 行
//     ② .section.flex 白面板内 6 个 .sortvisit(312px, ≤959px 半宽, ≤639px 全宽):
//        标题链(粗体 #555 底线) + 特推 div(60×80 封面+书名/作者) + 12 li(书名+/作者 11px)
//     ③ .lastupdate(700px)「最新章节」30 行(「分类」9% + 书名 25% + 章节 41% + 作者日期 25%)
//        | aside(250px)「最新小说」30 行
//     ④ .section.link「友情链接」(fetchFooterLinks, 空则整块不渲染)
//   色值全部真站实测硬编码: 底 #f4f4f4 · 白卡 #ffffff · 文字 #666(14px 微软雅黑) ·
//   链接 #1a1a1a · hover/强调亮红 #ed4259 · 主红 #bf2c24(完本遮罩 rgba(191,44,36,.75))
//   · 深灰标题 #555 · em 蓝 #4284ed / 橙 #f0643a · 点线/虚线 #e6e6e6/#ccc。
//   (头部导航/页脚由 SiteHeader/SiteFooter 分支渲染, 本组件只做主内容区)
//   数据: props.books=最新 48 本(最新章节/最新小说 30 行 + 兜底); 追加 2 维:
//   fetchBooks(sort:words, size:60)(大神小说 6 卡优先带封面 + 热门小说 12 + 6 分类块)
//   与 fetchFooterLinks()(友情链接); alive 防竞态, 失败静默回退 props 口径。
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CircleUserRound, Clock3, Flame, Link2, ThumbsUp } from 'lucide-react'
import type { SiteHomeProps } from './shared'
import { usePublic } from '../ctx'
import { fetchBooks, fetchFooterLinks, type FooterFriendLink } from '../data'
// [R27-5b-H1] 友链渲染出口 scheme 白名单(javascript: 伪协议存储型 XSS 防护)
import { safeHref } from '../safe-href'
import { bookNavProps, Sk } from '../bits'
import { fmtDate, formatWords } from '../seo'
import { BookCover } from '../BookCover'
import type { BookItem } from '../types'

// [R24-6-d-2] 真站实测色板(style1.css)
const C = {
  red: '#bf2c24',
  accent: '#ed4259',
  bg: '#f4f4f4',
  card: '#ffffff',
  text: '#666666',
  dark: '#1a1a1a',
  title: '#555555',
  gray: '#666666',
  border: '#e6e6e6',
  dashed: '#cccccc',
  cream: '#FBF6EC',
  blue: '#4284ed',
  orange: '#f0643a',
} as const

// 真站 font-family
const FONT = '"Microsoft YaHei","Microsoft Yahei",Arial,Tahoma,Verdana,sans-serif'

/** 真站 .title: 1.1em 粗体 #555 + 底边 1px #ddd(面板内通栏) */
function PanelTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex w-full flex-wrap items-center gap-1 border-b pb-2 font-bold" style={{ borderColor: '#ddd', color: C.title, fontSize: '1.1em' }}>
      {icon}
      {children}
    </p>
  )
}

/** 真站更新时间 MM-DD(如 04-19) */
function fmtMD(d?: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

/** [R24-6-d-3] .side_commend li: img_span 100×133 封面卡(遮罩条「分类 / 状态」, 完本红遮罩) + .w100 文案列 */
function DaShenLi({ book }: { book: BookItem }) {
  const { navigate } = usePublic()
  const completed = book.status === 'completed'
  return (
    <li className="group mb-[18px] mr-[6px] mt-[10px] flex w-full leading-[1.7em] min-[768px]:w-[49%]">
      {/* .img_span: 封面(hover scale 1.1) + 底部 25px 半透明遮罩条 */}
      <div className="relative mr-[15px] w-[100px] shrink-0">
        <div
          {...bookNavProps(navigate, book.id)}
          aria-label={`查看《${book.name}》详情`}
          className="block h-[133px] w-[100px] cursor-pointer overflow-hidden transition-transform duration-[400ms] ease-out min-[768px]:group-hover:scale-110"
        >
          <BookCover name={book.name} cover={book.cover} className="h-full w-full rounded-none" />
        </div>
        <span
          className="absolute left-0 top-[108px] flex h-[25px] w-[100px] items-center justify-center overflow-hidden whitespace-nowrap px-1 text-white"
          style={{ background: completed ? 'rgba(191,44,36,0.75)' : 'rgba(0,0,0,0.4)' }}
        >
          {book.category} / {completed ? '完本' : '连载'}
        </span>
      </div>
      {/* .w100: 书名(h2 1.15em/24px) + p.indent(77px 2em 缩进) + .li_bottom 统计行 */}
      <div className="min-w-0 flex-1">
        <div {...bookNavProps(navigate, book.id)} className="cursor-pointer">
          <h2 className="block h-6 overflow-hidden text-ellipsis whitespace-nowrap text-[1.15em] leading-6 hover:text-[#ed4259]" style={{ color: C.dark }}>
            {book.name}
          </h2>
        </div>
        <p className="my-[7px] h-[77px] overflow-hidden" style={{ textIndent: '2em', lineHeight: '1.8em' }}>
          {book.intro}
        </p>
        <div className="flex items-center overflow-hidden">
          <span
            role="button"
            tabIndex={0}
            onClick={() => navigate({ view: 'search', q: book.author })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                navigate({ view: 'search', q: book.author })
              }
            }}
            aria-label={`搜索作者 ${book.author}`}
            className="flex h-5 cursor-pointer items-center gap-1 overflow-hidden text-left hover:text-[#ed4259]"
            style={{ color: C.gray, lineHeight: '20px' }}
          >
            <CircleUserRound className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{book.author}</span>
          </span>
          <div className="ml-auto flex shrink-0">
            <em className="mr-1 border px-0.5 not-italic" style={{ borderColor: '#ccc', borderRadius: 1, color: C.orange, fontSize: 10 }}>
              {formatWords(book.wordCount).replace(/\s+/g, '')}
            </em>
            <em className="border px-0.5 not-italic" style={{ borderColor: '#ccc', borderRadius: 1, color: C.blue, fontSize: 10 }}>
              {fmtDate(book.updatedAt)}
            </em>
          </div>
        </div>
      </div>
    </li>
  )
}

/** [R24-6-d-4] .popular li: 书名(1.1em) + 作者(.gray), 41px 点线行 */
function PopularLi({ book, showAuthor = true }: { book: BookItem; showAuthor?: boolean }) {
  const { navigate } = usePublic()
  return (
    <li className="flex h-[41px] items-center justify-between overflow-hidden border-b border-dotted" style={{ borderColor: C.border }}>
      <span
        {...bookNavProps(navigate, book.id)}
        className="min-w-0 flex-1 cursor-pointer truncate text-[1.1em] hover:text-[#ed4259]"
        style={{ color: C.dark }}
      >
        {book.name}
      </span>
      {showAuthor && (
        <span className="ml-2 shrink-0 truncate text-sm" style={{ color: C.gray }}>
          {book.author}
        </span>
      )}
    </li>
  )
}

/** 分类块数据(真站 6 块: 特推 1 + 列表 12) */
interface SortBlock {
  key: string
  catId: string
  name: string
  books: BookItem[]
}

/** [R24-6-d-5] .sortvisit: 标题链(粗体 #555) + 特推 div(60×80 封面) + 12 li(50% 宽虚线行, /作者 11px) */
function SortVisit({ block }: { block: SortBlock }) {
  const { navigate } = usePublic()
  const openCat = () => navigate(block.catId ? { view: 'category', cat: block.catId } : { view: 'category' })
  const head = block.books[0]
  const rest = block.books.slice(1, 13)
  return (
    <div className="mt-[5px] w-full sm:w-1/2 min-[960px]:w-[312px]">
      <span
        role="button"
        tabIndex={0}
        onClick={openCat}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openCat()
          }
        }}
        className="block cursor-pointer border-b pb-2 pl-2 text-[1.1em] font-bold hover:text-[#ed4259]"
        style={{ borderColor: '#ddd', color: C.title }}
      >
        {block.name}
      </span>
      <ul className="flex flex-wrap justify-between p-[10px]">
        {head && (
          <li className="mb-[10px] flex h-[85px] w-full list-none overflow-hidden">
            <div
              {...bookNavProps(navigate, head.id)}
              aria-label={`查看《${head.name}》详情`}
              className="mr-[15px] mt-[5px] h-[80px] w-[60px] shrink-0 cursor-pointer overflow-hidden"
              style={{ boxShadow: '0 1px 5px rgba(0,0,0,0.35)' }}
            >
              <BookCover name={head.name} cover={head.cover} className="h-full w-full rounded-none" />
            </div>
            <p className="min-w-0 flex-1 overflow-hidden" style={{ lineHeight: '2em' }}>
              <span
                {...bookNavProps(navigate, head.id)}
                className="cursor-pointer text-[1.1em] hover:text-[#ed4259]"
                style={{ color: C.dark }}
              >
                {head.name}
              </span>
              <i className="not-italic text-[11px]" style={{ color: C.gray }}>
                &nbsp;/ {head.author}
              </i>
            </p>
          </li>
        )}
        {rest.map((b) => (
          <li key={b.id} className="h-[38px] w-1/2 overflow-hidden border-b border-dashed" style={{ borderColor: C.dashed, lineHeight: '38px' }}>
            <span
              {...bookNavProps(navigate, b.id)}
              className="cursor-pointer text-sm hover:text-[#ed4259]"
              style={{ color: C.dark }}
            >
              {b.name}
            </span>
            <i className="not-italic text-[11px]" style={{ color: C.gray }}>
              &nbsp;/ {b.author}
            </i>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** [R24-6-d-6] .lastupdate li: 「分类」9% + 书名 25%(1.1em) + 章节 41%(.gray) + 作者/日期 25% 右对齐
 *  (真站断点: ≤959px 隐分类与作者日期列, 书名 40%/章节 59%) */
function LastUpdateLi({ book }: { book: BookItem }) {
  const { navigate } = usePublic()
  return (
    <li className="flex h-[41px] items-center overflow-hidden border-b border-dotted" style={{ borderColor: C.border, lineHeight: '41px' }}>
      <span className="w-[9%] shrink-0 truncate text-sm max-[959px]:hidden" style={{ color: C.text, marginLeft: '-1%' }}>
        「{book.category}」
      </span>
      <span
        {...bookNavProps(navigate, book.id)}
        className="w-[40%] shrink-0 cursor-pointer truncate text-[1.1em] hover:text-[#ed4259] min-[960px]:w-[25%]"
        style={{ color: C.dark }}
      >
        {book.name}
      </span>
      <span className="ml-[1%] w-[59%] shrink-0 truncate text-sm min-[960px]:w-[41%]" style={{ color: C.gray }}>
        {book.latestChapter || ''}
      </span>
      <span className="w-[25%] shrink-0 truncate text-right text-sm max-[959px]:hidden" style={{ color: C.gray }}>
        {book.author}&nbsp;&nbsp;{fmtMD(book.updatedAt)}
      </span>
    </li>
  )
}

/** 书池 → 6 个分类块(按在池条数排序取前 6, 每块特推+12 行) */
function buildSortBlocks(pool: BookItem[]): SortBlock[] {
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
    .map(([k, arr]) => ({ key: k, catId: arr[0]?.categoryId || '', name: arr[0]?.category || '全部小说', books: arr.slice(0, 13) }))
}

/** 封推取书: 优先带封面, 不足补无封面(共 n 本) */
function pickWithCover(list: BookItem[], n: number): BookItem[] {
  const withCover = list.filter((b) => !!b.cover)
  const rest = list.filter((b) => !b.cover)
  return [...withCover, ...rest].slice(0, n)
}

/** 面板白卡容器(真站 .side_commend/.aside/.lastupdate/.section 共通: mt10 白底 p10) */
function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`mt-[10px] p-[10px] ${className || ''}`} style={{ background: C.card }}>
      {children}
    </div>
  )
}

/** [R24-6-d-7] 加载骨架: 三容器位形一致防 CLS */
function HomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[960px]" role="status" aria-label="页面加载中" style={{ background: C.bg, color: C.text, fontFamily: FONT, fontSize: 14 }}>
      <div className="flex flex-wrap">
        <div className="w-full min-[960px]:w-[700px]">
          <Panel className="min-[960px]:mt-0">
            <Sk className="mb-3 h-5 w-32" />
            <div className="flex flex-wrap">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="mb-[18px] mr-[6px] mt-[10px] flex w-full min-[768px]:w-[49%]">
                  <Sk className="mr-[15px] h-[133px] w-[100px] shrink-0" />
                  <div className="min-w-0 flex-1 pt-1">
                    <Sk className="h-4 w-3/4" />
                    <Sk className="mt-3 h-3 w-full" />
                    <Sk className="mt-2 h-3 w-5/6" />
                    <Sk className="mt-4 h-4 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <div className="w-full min-[960px]:ml-[10px] min-[960px]:w-[250px]">
          <Panel className="min-[960px]:mt-0">
            <Sk className="mb-3 h-5 w-28" />
            {Array.from({ length: 8 }).map((_, i) => (
              <Sk key={i} className="mb-2 h-6 w-full" />
            ))}
          </Panel>
        </div>
      </div>
      <Panel>
        <Sk className="mb-3 h-5 w-28" />
        <div className="flex flex-wrap">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mt-[5px] w-full sm:w-1/2 min-[960px]:w-[312px]">
              <Sk className="h-5 w-24" />
              <Sk className="mx-[10px] mt-3 h-[85px]" />
              {Array.from({ length: 6 }).map((_, j) => (
                <Sk key={j} className="mx-[10px] mt-2 h-6" />
              ))}
            </div>
          ))}
        </div>
      </Panel>
      <div className="flex flex-wrap">
        <div className="w-full min-[960px]:w-[700px]">
          <Panel>
            <Sk className="mb-3 h-5 w-28" />
            {Array.from({ length: 10 }).map((_, i) => (
              <Sk key={i} className="mb-2 h-6 w-full" />
            ))}
          </Panel>
        </div>
        <div className="w-full min-[960px]:ml-[10px] min-[960px]:w-[250px]">
          <Panel>
            <Sk className="mb-3 h-5 w-28" />
            {Array.from({ length: 8 }).map((_, i) => (
              <Sk key={i} className="mb-2 h-6 w-full" />
            ))}
          </Panel>
        </div>
      </div>
    </div>
  )
}

export function ShipsayHome({ books, loading }: SiteHomeProps) {
  const { site } = usePublic()
  // [R24-6-d-8] 追加 2 维: 字数降序 60 本(大神小说/热门小说/分类块) + 友情链接; alive 防竞态, 失败静默回退
  const [pool, setPool] = useState<BookItem[] | null>(null)
  const [friends, setFriends] = useState<FooterFriendLink[] | null>(null)
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
    fetchFooterLinks(false, site.id)
      .then((d) => {
        if (alive) setFriends(d?.friend || [])
      })
      .catch(() => {
        if (alive) setFriends([])
      })
    return () => {
      alive = false
    }
  }, [site.id])

  const dashenBooks = useMemo(() => pickWithCover(pool && pool.length ? pool : books, 6), [pool, books])
  const hotBooks = useMemo(() => (pool && pool.length > 12 ? pool.slice(6, 18) : books.slice(6, 18)), [pool, books])
  const sortBlocks = useMemo(() => buildSortBlocks(pool && pool.length ? pool : books), [pool, books])
  const lastBooks = useMemo(() => books.slice(0, 30), [books])
  const newestBooks = useMemo(() => books.slice(0, 30), [books])

  if (loading) return <HomeSkeleton />

  return (
    // [R24-6-d-9] 真站 body 底 #f4f4f4 + 14px 微软雅黑 #666; 容器 960px 容器式布局
    <div className="min-h-full" style={{ background: C.bg, color: C.text, fontFamily: FONT, fontSize: 14 }}>
      {/* 容器① .side_commend 大神小说(700px) | aside 热门小说(250px) */}
      <div className="mx-auto flex w-full max-w-[960px] flex-wrap">
        <div className="w-full min-[960px]:w-[700px]">
          <Panel className="min-[960px]:mt-0">
            <PanelTitle icon={<ThumbsUp size={16} aria-hidden className="shrink-0" />}>大神小说</PanelTitle>
            <ul className="flex flex-wrap">
              {dashenBooks.map((b) => (
                <DaShenLi key={b.id} book={b} />
              ))}
            </ul>
          </Panel>
        </div>
        <aside className="w-full min-[960px]:ml-[10px] min-[960px]:w-[250px]">
          <Panel className="min-[960px]:mt-0">
            <PanelTitle icon={<Flame size={16} aria-hidden className="shrink-0" />}>热门小说</PanelTitle>
            <ul>
              {hotBooks.map((b) => (
                <PopularLi key={b.id} book={b} />
              ))}
            </ul>
          </Panel>
        </aside>
      </div>

      {/* 容器② .section.flex: 6 个 .sortvisit 分类块(312px × 3/行) */}
      <div className="mx-auto w-full max-w-[960px]">
        {sortBlocks.length > 0 && (
          <div className="mt-[10px] flex w-full flex-wrap p-[10px]" style={{ background: C.card }}>
            {sortBlocks.map((m) => (
              <SortVisit key={m.key} block={m} />
            ))}
          </div>
        )}
      </div>

      {/* 容器③ .lastupdate 最新章节(700px) | aside 最新小说(250px) */}
      <div className="mx-auto flex w-full max-w-[960px] flex-wrap">
        <div className="w-full min-[960px]:w-[700px]">
          <Panel>
            <PanelTitle icon={<Clock3 size={16} aria-hidden className="shrink-0" />}>最新章节</PanelTitle>
            <ul>
              {lastBooks.map((b) => (
                <LastUpdateLi key={b.id} book={b} />
              ))}
            </ul>
          </Panel>
        </div>
        <aside className="w-full min-[960px]:ml-[10px] min-[960px]:w-[250px]">
          <Panel>
            <PanelTitle icon={<Flame size={16} aria-hidden className="shrink-0" />}>最新小说</PanelTitle>
            <ul>
              {newestBooks.map((b) => (
                <PopularLi key={b.id} book={b} />
              ))}
            </ul>
          </Panel>
        </aside>
      </div>

      {/* 容器④ .section.link 友情链接(数据空/未达时整块不渲染) */}
      {friends && friends.length > 0 && (
        <div className="mx-auto w-full max-w-[960px]">
          <div className="mt-[10px] w-full p-[10px]" style={{ background: C.card }}>
            <PanelTitle icon={<Link2 size={16} aria-hidden className="shrink-0" />}>友情链接</PanelTitle>
            {friends.map((f) => (
              <a
                key={f.id}
                // [R27-5b-H1] 渲染出口 scheme 白名单: 仅 http/https 放行, 其余置 '#'(javascript: 伪协议 XSS 防护)
                href={safeHref(f.url)}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="inline-block pb-[5px] pr-[10px] pt-[15px] hover:text-[#ed4259]"
                style={{ color: C.dark }}
              >
                {f.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
