// ============================================================
// 黄金屋 克隆首页 —— 按 www.huangjinwu.org 首页与真站一模一样还原。
// [R24-6-d-1] 真站结构(huangjinwu-home.html + style0.css 44KB 实测, light 主题为准):
//   .container(1180px/内距 16px) 内三板块:
//     ① .hot-section   热门推荐   6 张 book-card(book-grid 栅格 1/2/3 列, 间距 24px)
//     ② .sort-section  分类排行榜 6 个 ranking-module(玄幻/仙侠/都市/历史/网游/科幻), 每榜 10 行
//     ③ .update-section 最新更新 18 张 book-card
//   book-card 为纯文字信息卡(真站首页无封面图, 封面仅存在于书库/详情页):
//   .book-info > .book-title(16px/500) / .book-author(14px) / .book-desc(14px 两行钳制
//   min-height 2.55em) / .book-badges(category 实底蓝白字 + status 浅蓝底描边 + words 透明描边)。
//   ranking-module 行首计数徽章(24×24 圆角 10px): 第 1 名 #2563eb / 第 2 名 70% 混白
//   #6692f1 / 第 3 名 38% 混白 #acc4f7(真站 color-mix 实测换算), 其余 #e8f1ff 底 #64748b 字;
//   榜单标题条 #f0f4fb 底 + 3×16px 蓝竖条。
//   色值全部真站 :root 实测硬编码(light): #2563eb/#1e293b/#64748b/#94a3b8/#dbe4f0/#e8f1ff/
//   #f0f4fb; 阴影 0 1px 2px rgba(15,23,42,.04)+0 4px 16px rgba(37,99,235,.06), hover
//   0 8px 24px rgba(37,99,235,.14)+0 2px 8px rgba(15,23,42,.06); 圆角 6/10px。
//   字号对齐真站 html 10px 基准: 21/18/16/14/12px; 版块标题 h2 4px 蓝左线。
//   数据: props.books=最新 48 本(「最新更新」18 卡 + 各区兜底口径); 追加 1 维
//   fetchBooks(sort:words, size:48) 供「热门推荐」6 卡与「分类排行榜」6×10
//   (按 categoryId 分组取前 6 榜, alive 防竞态, 失败静默回退 props 口径)。
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { BarChart3, Clock3, Flame } from 'lucide-react'
import type { SiteHomeProps } from './shared'
import { usePublic } from '../ctx'
import { fetchBooks } from '../data'
import { bookNavProps, Sk } from '../bits'
import { formatWords } from '../seo'
import type { BookItem } from '../types'

// [R24-6-d-2] 真站实测色板(light 主题 :root)
const C = {
  secondary: '#2563eb',
  text: '#1e293b',
  textLight: '#64748b',
  textMuted: '#94a3b8',
  border: '#dbe4f0',
  hover: '#e8f1ff',
  bg: '#f0f4fb',
  card: '#ffffff',
  shadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37,99,235,0.06)',
  shadowHover: '0 8px 24px rgba(37,99,235,0.14), 0 2px 8px rgba(15,23,42,0.06)',
} as const

// 真站 --font-family-ui
const FONT = '-apple-system,BlinkMacSystemFont,"Microsoft YaHei","PingFang SC","Segoe UI","Helvetica Neue",Arial,sans-serif'

// 计数徽章 top3 底色(color-mix(#2563eb, #fff) 100%/70%/38% 实测换算)
const TOP_BG = ['#2563eb', '#6692f1', '#acc4f7']

/** 真站状态徽章文案: 完结→全本 / 其余→连载 */
const statusText = (s?: string | null) => (s === 'completed' ? '全本' : '连载')

/** [R24-6-d-3] 真站 .page-title: 21px/600 + 4px 蓝左线(圆角 2px 0 0 2px) + 16px 左距 + -0.02em 字距 */
function PageTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h2
      className="mb-5 flex items-center gap-2 text-[21px] font-semibold"
      style={{
        borderLeft: `4px solid ${C.secondary}`,
        borderRadius: '2px 0 0 2px',
        color: C.text,
        letterSpacing: '-0.02em',
        paddingLeft: 16,
      }}
    >
      {icon}
      {children}
    </h2>
  )
}

/** [R24-6-d-4] 真站 .book-card: 纯文字信息卡(白底/描边/10px 圆角/蓝调浅影, hover 抬升 2px + 蓝描边 + 深影) */
function HjwBookCard({ book }: { book: BookItem }) {
  const { navigate } = usePublic()
  return (
    <article
      className="group block cursor-pointer overflow-hidden rounded-[10px] border transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-[#89aaee] hover:shadow-[0_8px_24px_rgba(37,99,235,0.14),0_2px_8px_rgba(15,23,42,0.06)]"
      style={{ background: C.card, borderColor: 'rgba(219,228,240,0.85)', boxShadow: C.shadow }}
      {...bookNavProps(navigate, book.id)}
      aria-label={`查看《${book.name}》详情`}
    >
      <div className="p-4">
        {/* .book-title: 16px/500 单行省略, hover #2563eb */}
        <div className="mb-2 truncate text-base font-medium leading-[1.4] group-hover:text-[#2563eb]" style={{ color: C.text }}>
          {book.name}
        </div>
        {/* .book-author: 14px #64748b */}
        <div className="mb-2 truncate text-sm" style={{ color: C.textLight }}>
          作者：{book.author}
        </div>
        {/* .book-desc: 14px 两行钳制 min-height 2.55em */}
        <div className="mb-3 line-clamp-2 min-h-[2.55em] text-sm leading-[1.5]" style={{ color: C.textLight }}>
          {book.intro}
        </div>
        {/* .book-badges: category 实底蓝 / status 浅蓝底描边 / words 透明描边(12px, 内距 4×12, 圆角 10px) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-block rounded-[10px] px-3 py-1 text-xs font-medium leading-[1.5] text-white" style={{ background: C.secondary }}>
            {book.category}
          </span>
          <span className="inline-block rounded-[10px] border px-3 py-1 text-xs font-medium leading-[1.5]" style={{ background: C.hover, borderColor: C.border, color: C.text }}>
            {statusText(book.status)}
          </span>
          <span className="inline-block rounded-[10px] border px-3 py-1 text-xs font-medium leading-[1.5]" style={{ borderColor: C.border, color: C.textLight }}>
            {formatWords(book.wordCount).replace(/\s+/g, '')}
          </span>
        </div>
      </div>
    </article>
  )
}

/** 分类榜单数据(真站 6 榜 × 10 行) */
interface RankModule {
  key: string
  title: string
  books: BookItem[]
}

/** [R24-6-d-5] 真站 .ranking-module: 标题条(#f0f4fb 底+3×16 蓝竖条) + 计数徽章榜单 */
function RankModuleCard({ mod }: { mod: RankModule }) {
  const { navigate } = usePublic()
  return (
    <div className="overflow-hidden rounded-[10px] border" style={{ background: C.card, borderColor: C.border, boxShadow: C.shadow }}>
      <div className="flex items-center gap-2 border-b py-3.5 px-4 text-lg font-semibold max-md:py-3" style={{ background: C.bg, borderColor: C.border, color: C.text }}>
        <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-[6px]" style={{ background: C.secondary }} />
        {mod.title}
      </div>
      <ol className="flex flex-col py-1">
        {mod.books.map((b, i) => (
          <li
            key={b.id}
            className="flex items-center gap-3 border-b px-4 py-2 transition-colors last:border-b-0 hover:bg-[#e8f1ff] max-md:min-h-[44px] max-md:py-3"
            style={{ borderColor: C.border }}
          >
            {/* 行首计数徽章: top3 蓝阶实底白字, 其余浅蓝底 */}
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[10px] text-sm font-semibold"
              style={{ background: TOP_BG[i] ?? C.hover, color: i < 3 ? '#fff' : C.textLight, textShadow: i < 3 ? '0 1px 2px rgba(0,0,0,0.22)' : undefined }}
            >
              {i + 1}
            </span>
            <span
              {...bookNavProps(navigate, b.id)}
              className="min-w-0 flex-1 cursor-pointer truncate text-base font-medium transition-colors hover:text-[#2563eb]"
              style={{ color: C.text }}
            >
              {b.name}
            </span>
            <span className="max-w-[100px] shrink-0 truncate text-sm" style={{ color: C.textLight }}>
              {b.author}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** 书池 → 6 个分类榜单(按在池条数排序取前 6 榜, 每榜 10 行) */
function buildRankModules(pool: BookItem[]): RankModule[] {
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
    .map(([k, arr]) => ({ key: k, title: arr[0]?.category || '全部小说', books: arr.slice(0, 10) }))
}

/** [R24-6-d-6] 加载骨架: 三板块位形一致防 CLS */
function HomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-4 md:py-8" role="status" aria-label="页面加载中" style={{ fontFamily: FONT }}>
      <Sk className="mb-5 h-6 w-44 rounded" />
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 min-[1200px]:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Sk key={i} className="h-[140px] rounded-[10px]" />
        ))}
      </div>
      <Sk className="mb-5 h-6 w-44 rounded" />
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 min-[960px]:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Sk key={i} className="h-[280px] rounded-[10px]" />
        ))}
      </div>
      <Sk className="mb-5 h-6 w-44 rounded" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 min-[1200px]:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Sk key={i} className="h-[140px] rounded-[10px]" />
        ))}
      </div>
    </div>
  )
}

export function HuangjinwuHome({ books, loading }: SiteHomeProps) {
  const { site } = usePublic()
  // [R24-6-d-7] 追加维度: 字数降序 48 本(热门推荐 + 分类排行榜); alive 防竞态, 失败静默用 props 兜底
  const [pool, setPool] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    // [R24-6-修] effect 起始同步 setState 会触发级联渲染(react-hooks/set-state-in-effect), 移除; 站点切换由 HomeView key 重挂载兜底
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 48 })
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

  const hotBooks = useMemo(() => (pool && pool.length ? pool.slice(0, 6) : books.slice(0, 6)), [pool, books])
  const rankModules = useMemo(() => buildRankModules(pool && pool.length ? pool : books), [pool, books])
  const updateBooks = useMemo(() => books.slice(0, 18), [books])

  if (loading) return <HomeSkeleton />

  return (
    // [R24-6-d-8] 真站 .container(1180px/px16) + .main-content(py 32px, 移动 16px); 背景渐变由主题 customCss(.clone-huangjinwu)铺底
    <div className="mx-auto w-full max-w-[1180px] px-4 py-4 md:py-8" style={{ color: C.text, fontFamily: FONT }}>
      {/* ① .hot-section 热门推荐 */}
      <section className="mb-8">
        <PageTitle icon={<Flame size={20} aria-hidden className="shrink-0" />}>热门推荐</PageTitle>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 min-[1200px]:grid-cols-3">
          {hotBooks.map((b) => (
            <HjwBookCard key={b.id} book={b} />
          ))}
        </div>
      </section>

      {/* ② .sort-section 分类排行榜 */}
      {rankModules.length > 0 && (
        <section className="mb-8">
          <PageTitle icon={<BarChart3 size={20} aria-hidden className="shrink-0" />}>分类排行榜</PageTitle>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 min-[960px]:grid-cols-3">
            {rankModules.map((m) => (
              <RankModuleCard key={m.key} mod={m} />
            ))}
          </div>
        </section>
      )}

      {/* ③ .update-section 最新更新 */}
      <section>
        <PageTitle icon={<Clock3 size={20} aria-hidden className="shrink-0" />}>最新更新</PageTitle>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 min-[1200px]:grid-cols-3">
          {updateBooks.map((b) => (
            <HjwBookCard key={b.id} book={b} />
          ))}
        </div>
      </section>
    </div>
  )
}
