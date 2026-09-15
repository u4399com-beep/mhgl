// ============================================================
// 同人小说网 克隆首页 —— 按 www.trxsw.com 首页与真站一模一样还原。
// [R25-4-2] 结构依据: 真站 2019-10-19 Wayback 完整 DOM 快照(/tmp/r25/trxsw-wb.html,
//   WAYBACK TOOLBAR 已剥除, href /web/20191019…/ 前缀已脑内剥除)逐节复刻:
//   #main
//     .novelslist ×2 —— 每行 3 个 .content(第 3 个 .border 竖线分隔, 行尾 .clear):
//       h2 板块名(真站: 同人/玄幻/修真/都市/穿越/网游小说) + .top 图文头条
//       (.image > a > img 67×82 + dl > dt > a 书名 + span 作者 + dd 简介 + div.clear)
//       + ul > li(«书名» /作者)
//     #newscontent: .l 最近更新小说列表(h2: moreLeft 标题 + moreRight 更多>>) 25 行
//       (s1 [分类] / s2 书名 / s3 最新章节 / s4 作者 / s5 日期 MM-DD)
//       + .r 小说推荐 26 行(s2 书名 + s5 作者)
//     #firendlink 友情连接(fetchFooterLinks, 数据空/失败整块不渲染)
//   真站 b.css 无存档(archive 的 css 快照全为 Wayback 错误页), 配色按杰奇 CMS 默认模板
//   家族公认规范还原(依据见 themes.ts ⑩ preset 注释): 白底 14px 宋体/arial 系 ·
//   链接 #333 / hover #C00 红 · h2 浅色渐变底+左竖条+下边线 · li 36px 行高底部点线 #ccc ·
//   分类/作者灰字 #666 · 日期弱灰 #999。(头部 ywtop/head/nav 与页脚由 SiteHeader/SiteFooter
//   分支渲染, 本组件只做 #main 主内容区)
//   数据: props.books=最新 48 本(.l 最近更新 25 行 + 各区兜底); 追加 1 维
//   fetchBooks(sort:words, size:60)(6 个 novelslist 板块按 categoryId 分组取前 6 组
//   [参考 HuangjinwuHome 做法] + .r 小说推荐 26 行, alive 防竞态, 失败静默回退 props 口径)。
//   还原偏差(有意): ①真站 .l 的 s3 章节列为章节链接, 列表数据无 chapterId → 降级纯文本
//   (同 Ggd66Home 先例) ②真站 2019 年站为固定 960px 非响应式, 移动端按触控惯例单列堆叠 +
//   行级触控目标 ≥44px(max-md 限域) ③真站板块名为固定 6 类, 本站按库内实际分类分组取前 6。
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SiteHomeProps } from './shared'
import { usePublic } from '../ctx'
import { fetchBooks, fetchFooterLinks, type FooterFriendLink } from '../data'
import { bookNavProps, Sk } from '../bits'
import { BookCover } from '../BookCover'
import type { BookItem } from '../types'

// [R25-4-3] 杰奇 CMS 默认模板规范色板(b.css 无存档, 按杰奇模板家族公认标准还原)
const C = {
  navBlue: '#1C5087',      // 深蓝导航基色(渐变深端/h2 左竖条)
  navBlueLight: '#1F5FA9', // 深蓝导航渐变亮端
  logoRed: '#C00',         // 红棕 logo/链接 hover 红色(杰奇默认)
  text: '#333333',         // 链接/正文默认色
  gray: '#666666',         // 次级灰(作者/分类/章节)
  light: '#999999',        // 弱灰(日期)
  border: '#dddddd',       // 常规边线
  dotted: '#cccccc',       // li 底部点线
  topBg: '#f5f5f5',        // ywtop/页脚浅灰
} as const

// 真站 GBK 时代字体(宋体/arial 系)
const FONT = 'arial,"SimSun","Microsoft YaHei",sans-serif'

/** 真站更新日期格式 MM-DD(如 10-20) */
function fmtMD(d?: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

/** [R25-4-4] 杰奇默认 h2: 浅色渐变底纹 + 左侧 4px 深蓝竖条 + 下边线
 *  (真站 h2 为底纹图, b.css 无存档 → 以 CSS 渐变还原; .l 版带 moreRight 更多>>) */
function JqH2({ children }: { children: ReactNode }) {
  return (
    <h2
      className="flex items-center justify-between gap-2 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #fafbfc 0%, #e9eef5 100%)',
        borderBottom: `1px solid ${C.border}`,
        borderLeft: `4px solid ${C.navBlue}`,
        color: C.text,
        fontSize: 14,
        fontWeight: 700,
        lineHeight: '32px',
        minHeight: 32,
        paddingLeft: 8,
        paddingRight: 8,
      }}
    >
      {children}
    </h2>
  )
}

/** novelslist 板块数据(真站 2 行 × 3 板块) */
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

/** [R25-4-5] 真站 .novelslist .content: h2 + .top 图文头条(67×82 封面+书名/作者/简介) + ul li(书名 /作者) */
function SectionBlock({ block, withBorder }: { block: SecBlock; withBorder: boolean }) {
  const { navigate } = usePublic()
  const top = block.top
  return (
    <section
      className={`min-w-0 flex-1 px-2 py-2 first:pl-0 last:pr-0 max-md:px-0 max-md:py-1.5 ${withBorder ? 'md:border-l md:first:border-l-0' : ''}`}
      style={{ borderColor: C.border }}
    >
      <JqH2>
        <button
          type="button"
          onClick={() => block.catId && navigate({ view: 'category', cat: block.catId })}
          className="min-h-[32px] cursor-pointer transition-colors hover:text-[#C00]"
          aria-label={`浏览 ${block.title} 分类`}
        >
          {block.title}
        </button>
      </JqH2>
      {/* .top 图文头条: .image(67×82) + dl(dt 书名+span 作者 / dd 简介) + div.clear */}
      {top && (
        <div className="flex gap-2.5 pt-2.5">
          <div className="w-[67px] shrink-0 cursor-pointer" {...bookNavProps(navigate, top.id)} aria-label={`查看《${top.name}》详情`}>
            <BookCover name={top.name} cover={top.cover} className="h-[82px] w-[67px] rounded-none" />
          </div>
          <dl className="min-w-0 flex-1">
            <dt className="flex items-baseline gap-2 overflow-hidden">
              <span
                {...bookNavProps(navigate, top.id)}
                className="min-w-0 cursor-pointer truncate text-sm font-bold transition-colors hover:text-[#C00]"
                style={{ color: C.text }}
              >
                {top.name}
              </span>
              <span className="shrink-0 truncate text-xs" style={{ color: C.gray }}>
                {top.author}
              </span>
            </dt>
            <dd className="mt-1 line-clamp-4 text-xs leading-5" style={{ color: C.gray }}>
              {top.intro}
            </dd>
          </dl>
        </div>
      )}
      <ul className="pt-1.5">
        {block.rest.map((b) => (
          <li
            key={b.id}
            className="flex h-9 items-center overflow-hidden border-b border-dotted max-md:min-h-[44px]"
            style={{ borderColor: C.dotted, fontSize: 14 }}
            {...bookNavProps(navigate, b.id)}
          >
            <span className="min-w-0 cursor-pointer truncate transition-colors hover:text-[#C00]" style={{ color: C.text }}>
              {b.name}
            </span>
            <span className="shrink-0 pl-1 text-xs" style={{ color: C.gray }}>
              &nbsp;/{b.author}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** [R25-4-6] 真站 #newscontent .l 行: s1 [分类] / s2 书名 / s3 最新章节 / s4 作者 / s5 日期 MM-DD
 *  (断点: 移动端隐 s1/s3/s4, s2 弹性占位; s3 真站为章节链接, 无 chapterId 降级纯文本) */
function UpdateLi({ book }: { book: BookItem }) {
  const { navigate } = usePublic()
  return (
    <li
      className="flex h-9 items-center gap-1 overflow-hidden border-b border-dotted max-md:min-h-[44px]"
      style={{ borderColor: C.dotted }}
    >
      <span className="s1 w-[86px] shrink-0 truncate text-xs max-md:hidden" style={{ color: C.gray }}>
        [{book.category}]
      </span>
      <span
        {...bookNavProps(navigate, book.id)}
        className="s2 w-[150px] shrink-0 cursor-pointer truncate text-sm transition-colors hover:text-[#C00] max-md:w-auto max-md:flex-1"
        style={{ color: C.text }}
      >
        {book.name}
      </span>
      <span className="s3 min-w-0 flex-1 truncate text-xs max-md:hidden" style={{ color: C.gray }} title={book.latestChapter || undefined}>
        {book.latestChapter || ''}
      </span>
      <span className="s4 w-[90px] shrink-0 truncate text-right text-xs max-md:hidden" style={{ color: C.gray }}>
        {book.author}
      </span>
      <span className="s5 w-[44px] shrink-0 text-right text-xs" style={{ color: C.light }}>
        {fmtMD(book.updatedAt)}
      </span>
    </li>
  )
}

/** [R25-4-7] 真站 #newscontent .r 行: s2 书名 + s5 作者(右对齐) */
function RecommendLi({ book }: { book: BookItem }) {
  const { navigate } = usePublic()
  return (
    <li
      className="flex h-9 items-center overflow-hidden border-b border-dotted max-md:min-h-[44px]"
      style={{ borderColor: C.dotted }}
    >
      <span
        {...bookNavProps(navigate, book.id)}
        className="min-w-0 flex-1 cursor-pointer truncate text-sm transition-colors hover:text-[#C00]"
        style={{ color: C.text }}
      >
        {book.name}
      </span>
      <span className="shrink-0 pl-2 text-xs" style={{ color: C.gray }}>
        {book.author}
      </span>
    </li>
  )
}

/** [R25-4-8] 加载骨架: novelslist 2 行×3 板块 + #newscontent .l/.r 位形一致防 CLS */
function HomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[960px] px-2 py-2" role="status" aria-label="页面加载中" style={{ color: C.text, fontFamily: FONT, fontSize: 14 }}>
      {[0, 1].map((row) => (
        <div key={row} className="flex flex-col md:flex-row">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="min-w-0 flex-1 px-2 py-2 max-md:px-0 max-md:py-1.5">
              <Sk className="h-8 w-full" />
              <div className="flex gap-2.5 pt-2.5">
                <Sk className="h-[82px] w-[67px] shrink-0" />
                <div className="min-w-0 flex-1">
                  <Sk className="h-4 w-3/4" />
                  <Sk className="mt-2 h-3 w-full" />
                  <Sk className="mt-1.5 h-3 w-5/6" />
                  <Sk className="mt-1.5 h-3 w-2/3" />
                </div>
              </div>
              {Array.from({ length: 5 }).map((_, j) => (
                <Sk key={j} className="mt-2 h-5 w-full" />
              ))}
            </div>
          ))}
        </div>
      ))}
      <div className="mt-3 flex flex-col md:flex-row md:gap-3">
        <div className="min-w-0 flex-1">
          <Sk className="h-8 w-full" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Sk key={i} className="mt-2 h-5 w-full" />
          ))}
        </div>
        <div className="w-full md:w-[270px] md:shrink-0">
          <Sk className="h-8 w-full" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Sk key={i} className="mt-2 h-5 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function TrxswHome({ books, loading }: SiteHomeProps) {
  const { site } = usePublic()
  // [R25-4-9] 追加 2 维: 字数降序 60 本(6 个 novelslist 板块分组 + .r 推荐 26 行) + 友情链接;
  // alive 防竞态, 失败静默回退 props 口径
  const [pool, setPool] = useState<BookItem[] | null>(null)
  const [friends, setFriends] = useState<FooterFriendLink[] | null>(null)
  useEffect(() => {
    let alive = true
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

  const sections = useMemo(() => buildSections(pool && pool.length ? pool : books), [pool, books])
  const recBooks = useMemo(() => (pool && pool.length ? pool.slice(0, 26) : books.slice(0, 26)), [pool, books])
  const updateBooks = useMemo(() => books.slice(0, 25), [books])

  if (loading) return <HomeSkeleton />

  return (
    // [R25-4-10] 真站 #main 960px 版心 + body 白底 14px 宋体/arial 系(头部由 SiteHeader 的 TrxswHeader 分支渲染)
    <div id="main" className="mx-auto w-full max-w-[960px] px-2 pb-4" style={{ color: C.text, fontFamily: FONT, fontSize: 14 }}>
      {/* .novelslist 行①: 板块 ×3(第 2/3 块 md 竖线分隔, 对应真站 .content/.border) */}
      <div className="flex flex-col md:flex-row">
        {sections.slice(0, 3).map((m, i) => (
          <SectionBlock key={m.key} block={m} withBorder={i > 0} />
        ))}
      </div>
      {/* .novelslist 行②(真站行尾 .clear, flex 布局天然清浮动) */}
      {sections.length > 3 && (
        <div className="flex flex-col md:flex-row">
          {sections.slice(3, 6).map((m, i) => (
            <SectionBlock key={m.key} block={m} withBorder={i > 0} />
          ))}
        </div>
      )}

      {/* #newscontent: .l 最近更新小说列表(700px) | .r 小说推荐(270px) */}
      <div className="mt-3 flex flex-col md:flex-row md:gap-4">
        <div className="l min-w-0 flex-1">
          <JqH2>
            <span>最近更新小说列表</span>
            <MoreRight />
          </JqH2>
          <ul className="pt-1.5">
            {updateBooks.map((b) => (
              <UpdateLi key={b.id} book={b} />
            ))}
          </ul>
        </div>
        <aside className="r w-full md:w-[270px] md:shrink-0 md:border-l md:pl-4" style={{ borderColor: C.border }}>
          <JqH2>
            <span>小说推荐</span>
          </JqH2>
          <ul className="pt-1.5">
            {recBooks.map((b) => (
              <RecommendLi key={b.id} book={b} />
            ))}
          </ul>
        </aside>
      </div>

      {/* #firendlink 友情连接(数据空/未达时整块不渲染, 同 ShipsayHome 先例) */}
      {friends && friends.length > 0 && (
        <div id="firendlink" className="mt-3 border-t pt-2 text-xs leading-6" style={{ borderColor: C.border, color: C.gray }}>
          友情连接：
          {friends.map((f) => (
            <a
              key={f.id}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mr-3 transition-colors hover:text-[#C00] hover:underline"
              style={{ color: C.gray }}
            >
              {f.name}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

/** .l h2 右侧「更多>>」(真站 moreRight, 指向最近更新排序列表页 → 项目无对应视图降级全库分类页) */
function MoreRight() {
  const { navigate } = usePublic()
  return (
    <button
      type="button"
      onClick={() => navigate({ view: 'category' })}
      className="shrink-0 cursor-pointer text-xs font-normal transition-colors hover:text-[#C00]"
      style={{ color: C.gray }}
      aria-label="查看更多最近更新"
    >
      更多&gt;&gt;
    </button>
  )
}
