// ============================================================
// 首页布局 · biquge（经典笔趣阁小说站板块布局, R18-b 新增第 8 种首页布局）
// 结构还原 xbiquge 系经典首页 DNA:
//   ① 顶部导航条: 主色底 logo 站名 + 横向站内导航 + 搜索框(提交 search 视图)
//   ② 主体三栏: 左分类竖导航 / 中间(本周强推·编辑推荐·今日更新) / 右侧(点击排行 Top10·本站推荐·最近更新)
//   ③ 「最新更新」大板块: 按分类分组的多列小表格(分类名主色表头 + 该分类最新 8 本)
//   ④ 底部: 友情链接占位区 + 版权条
// 数据口径: books props(首页 48 本最新, 与其他布局同源) + 既有公开 API
//   (/api/public/categories 分类, /api/public/books?cat= 分类最新, /api/public/links 友链),
//   不新增后端接口。响应式: <lg 折叠单列, 分类导航转横向滚动条; 触控目标 ≥44px。
// ============================================================
'use client'

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import type { ThemeDef } from '@/lib/crawl/themes'
import type { BookItem, CategoryItem } from '../types'
import { usePublic } from '../ctx'
import { fmtDate, formatWords, withAlpha } from '../seo'
import { fetchBooks, fetchCategories, fetchFooterLinks, type FooterLinksData } from '../data'
import { BookCover } from '../BookCover'
import { bookNavProps, Sk, StatusBadge } from '../bits'

/** [R23-b-19] 渐变标题条 token 解析(heroBg 底 + heroText 白字), BiqugeBar 与独立板块头共用 */
function biqugeBarVars(v: ThemeDef['vars']) {
  const tv = v
  return {
    heroBg: tv.heroBg || `linear-gradient(120deg, ${withAlpha(v.primary, 0.92)}, ${withAlpha(v.accent, 0.85)})`,
    heroText: tv.heroText || v.primaryText,
  }
}

/** [R23-b-19] 板块标题条 → 渐变标题条: heroBg 底 + heroText 白字 + 左侧 4px accent 竖条(全宽板块头)。
 *  attached=true 时仅上圆角(贴卡片顶); level=2 用于独立板块 h2 语义; right 放右侧附加信息 */
function BiqugeBar({
  title,
  onMore,
  attached = true,
  level = 3,
  right,
  className,
}: {
  title: string
  onMore?: () => void
  attached?: boolean
  level?: 2 | 3
  right?: ReactNode
  className?: string
}) {
  const v = usePublic().theme.vars
  const { heroBg, heroText } = biqugeBarVars(v)
  const Tag = (level === 2 ? 'h2' : 'h3') as 'h2' | 'h3'
  return (
    <div
      className={`flex min-h-[44px] items-center gap-3 px-4 py-2 ${className || ''}`}
      style={{
        background: heroBg,
        color: heroText,
        borderRadius: attached ? `${v.radius} ${v.radius} 0 0` : v.radius,
      }}
    >
      {/* 左侧 4px accent 竖条 */}
      <span className="inline-block h-4 w-1 shrink-0" style={{ background: v.accent }} aria-hidden />
      <Tag className="text-sm font-bold tracking-[0.2em]">{title}</Tag>
      <div className="ml-auto flex min-w-0 items-center gap-3">
        {right}
        {onMore && (
          <button
            type="button"
            onClick={onMore}
            className="shrink-0 text-xs opacity-80 transition-opacity hover:opacity-100"
            style={{ color: heroText }}
            aria-label={`查看更多 ${title}`}
          >
            更多 »
          </button>
        )}
      </div>
    </div>
  )
}

/** 白卡容器 — 板块通用外壳(主色标题条 + surface 内容区) */
function BiqugeCard({ title, onMore, tag, children }: { title: string; onMore?: () => void; tag?: string; children: ReactNode }) {
  const v = usePublic().theme.vars
  return (
    <section
      {...(tag ? { 'data-biquge': tag } : {})}
      style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius, boxShadow: v.cardShadow === 'none' ? undefined : v.cardShadow }}
    >
      <BiqugeBar title={title} onMore={onMore} />
      {children}
    </section>
  )
}

/** 分类链接键盘可达(role=button + Enter/Space, 与 CategoryShowcase 同款) */
function catNavProps(navigate: (p: { view: 'category'; cat?: string }) => void, catId?: string) {
  const open = () => navigate({ view: 'category', cat: catId })
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        open()
      }
    },
  }
}

/** 顶部导航条: logo 站名(主色底白字) + 横向导航 + 搜索框(提交 search 视图) */
function BiqugeNav() {
  const { site, theme, navigate } = usePublic()
  const v = theme.vars
  const [q, setQ] = useState('')

  const links: Array<{ label: string; onClick: () => void }> = [
    { label: '首页', onClick: () => navigate({ view: 'home' }) },
    { label: '全部分类', onClick: () => navigate({ view: 'category' }) },
    { label: '排行榜', onClick: () => document.getElementById('biquge-rank')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
    { label: '我的书架', onClick: () => navigate({ view: 'history' }) },
  ]

  return (
    <nav data-biquge="nav" aria-label="站内导航" style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius }}>
      {/* 上行: logo 站名 + 搜索框 */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => navigate({ view: 'home' })}
          className="flex min-h-[44px] items-center gap-2.5 transition-opacity hover:opacity-85"
          aria-label={`返回 ${site.name} 首页`}
        >
          <span
            className="flex h-9 min-w-9 items-center justify-center px-1.5 text-base font-black"
            style={{ background: v.primary, color: v.primaryText, borderRadius: v.radius }}
            aria-hidden
          >
            {site.name.slice(0, 2)}
          </span>
          <span className="text-lg font-bold tracking-wide" style={{ color: v.primary, fontFamily: v.titleFont }}>
            {site.name}
          </span>
        </button>
        <form
          className="flex min-h-[44px] w-full max-w-md items-stretch overflow-hidden sm:w-auto sm:flex-1"
          style={{ border: `1px solid ${v.border}`, borderRadius: v.radius, background: v.bg }}
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            navigate({ view: 'search', q: q.trim() })
          }}
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入书名 / 作者，回车搜索"
            aria-label="站内搜索"
            className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
            style={{ color: v.text }}
          />
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center gap-1 px-4 text-sm font-bold transition-opacity hover:opacity-90"
            style={{ background: v.primary, color: v.primaryText }}
            aria-label="搜索"
          >
            <Search className="h-4 w-4" aria-hidden />
            搜索
          </button>
        </form>
      </div>
      {/* 下行: 横向导航(移动端横向滚动) */}
      <div className="overflow-x-auto border-t" style={{ borderColor: withAlpha(v.border, 0.7) }}>
        <div className="flex items-center">
          {links.map((l) => (
            <button
              key={l.label}
              type="button"
              onClick={l.onClick}
              className="inline-flex min-h-[44px] shrink-0 items-center px-4 text-sm font-medium transition-colors hover:opacity-75"
              style={{ color: v.text }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}

/** 左侧分类竖导航(lg+) / 移动端横向滚动条(二者互斥渲染) */
function BiqugeCats({ cats }: { cats: CategoryItem[] | null }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  const items = useMemo(() => (cats || []).filter((c) => (c._count?.books ?? 0) > 0), [cats])

  if (!cats) {
    return (
      <>
        <div className="lg:hidden"><Sk className="h-11 w-full" /></div>
        <aside className="hidden w-[176px] shrink-0 lg:block" aria-hidden><Sk className="h-64 w-full" /></aside>
      </>
    )
  }

  return (
    <>
      {/* 桌面端: 竖导航 */}
      <aside className="hidden w-[176px] shrink-0 lg:block" aria-label="分类导航">
        <div style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius, boxShadow: v.cardShadow === 'none' ? undefined : v.cardShadow }}>
          <div
            className="flex min-h-[44px] items-center px-4 text-sm font-bold tracking-[0.2em]"
            style={{ background: `linear-gradient(90deg, ${v.primary}, ${withAlpha(v.primary, 0.82)})`, color: v.primaryText, borderRadius: `${v.radius} ${v.radius} 0 0` }}
          >
            分类导航
          </div>
          <ul className="py-1">
            <li>
              <button
                type="button"
                onClick={() => navigate({ view: 'category' })}
                className="flex min-h-[44px] w-full items-center px-4 text-left text-sm font-semibold transition-opacity hover:opacity-70"
                style={{ color: v.primary }}
              >
                全部分类
              </button>
            </li>
            {items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'category', cat: c.id })}
                  className="flex min-h-[44px] w-full items-center justify-between gap-2 border-t px-4 text-left text-sm transition-opacity hover:opacity-70"
                  style={{ color: v.text, borderColor: withAlpha(v.border, 0.6) }}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 text-[10px] tabular-nums" style={{ color: v.textMuted }}>{c._count?.books ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* 移动端: 横向滚动分类条 */}
      <div className="overflow-x-auto lg:hidden" data-biquge="cats-mobile" aria-label="分类快捷导航">
        <div className="flex gap-2 py-1">
          <button
            type="button"
            onClick={() => navigate({ view: 'category' })}
            className="inline-flex min-h-[44px] shrink-0 items-center px-3.5 text-sm font-medium"
            style={{ background: v.primary, color: v.primaryText, borderRadius: v.radius }}
          >
            全部
          </button>
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate({ view: 'category', cat: c.id })}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1 px-3.5 text-sm"
              style={{ background: v.surfaceAlt, color: v.text, border: `1px solid ${v.border}`, borderRadius: v.radius }}
            >
              {c.name}
              <span className="text-[10px]" style={{ color: v.textMuted }}>{c._count?.books ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/** 强推大卡 — 封面左 + 信息右(原站强推位 DNA) */
function BiqugeFeatureCard({ book }: { book: BookItem }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  return (
    <article
      className="group flex cursor-pointer gap-3 p-3 transition-shadow"
      style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius, boxShadow: v.cardShadow === 'none' ? undefined : v.cardShadow }}
      {...bookNavProps(navigate, book.id)}
      aria-label={`查看《${book.name}》详情`}
    >
      <div className="relative w-24 shrink-0 sm:w-28">
        <BookCover name={book.name} cover={book.cover} className="aspect-[3/4] w-full" />
        <span className="absolute left-1 top-1"><StatusBadge status={book.status} small /></span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h4 className="truncate text-base font-bold" style={{ color: v.text }} title={book.name}>{book.name}</h4>
        <p className="mt-0.5 truncate text-xs" style={{ color: v.textMuted }}>
          {book.author} · {book.category}
          {book.wordCount ? ` · ${formatWords(book.wordCount)}` : ''}
        </p>
        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed" style={{ color: v.textMuted }}>{book.intro || '暂无简介'}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span className="truncate text-[11px]" style={{ color: v.textMuted }}>最新：{book.latestChapter || '暂无章节'}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate({ view: 'book', bookId: book.id }) }}
            className="inline-flex min-h-[44px] shrink-0 items-center px-3.5 text-xs font-bold transition-opacity hover:opacity-90"
            style={{ background: v.primary, color: v.primaryText, borderRadius: v.radius }}
            aria-label={`立即阅读《${book.name}》`}
          >
            立即阅读
          </button>
        </div>
      </div>
    </article>
  )
}

/** 编辑推荐小卡 — 封面上 + 书名/作者下 */
function BiqugeSmallCard({ book }: { book: BookItem }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  return (
    <article
      className="group cursor-pointer p-2 transition-shadow"
      style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius }}
      {...bookNavProps(navigate, book.id)}
      aria-label={`查看《${book.name}》详情`}
    >
      <div className="relative">
        <BookCover name={book.name} cover={book.cover} className="aspect-[3/4] w-full" showAuthor={book.author} />
        <span className="absolute left-1 top-1"><StatusBadge status={book.status} small /></span>
      </div>
      <h4 className="mt-2 truncate text-center text-[13px] font-medium leading-5" style={{ color: v.text }} title={book.name}>{book.name}</h4>
      <p className="truncate text-center text-[11px] leading-4" style={{ color: v.textMuted }}>{book.author}</p>
    </article>
  )
}

/** 更新行: 书名 + 最新章节 + 时间(经典笔趣阁更新列表 DNA); idx 用于斑马纹交替 */
function BiqugeUpdateRow({ book, showCat, idx }: { book: BookItem; showCat?: boolean; idx?: number }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  return (
    // [R23-b-20] 表格感增强: 奇偶行斑马纹(surfaceAlt 40% 交替; 非.hex 色值时 withAlpha 原样返回, 视觉安全)
    <li
      className="border-t last:border-b-0"
      style={{
        borderColor: withAlpha(v.border, 0.55),
        background: idx !== undefined && idx % 2 === 1 ? withAlpha(v.surfaceAlt, 0.4) : undefined,
      }}
    >
      <button
        type="button"
        onClick={() => navigate({ view: 'book', bookId: book.id })}
        className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left transition-opacity hover:opacity-75"
        aria-label={`查看《${book.name}》详情`}
      >
        <span aria-hidden style={{ color: v.primary }}>·</span>
        {showCat && <span className="hidden shrink-0 text-[11px] sm:inline" style={{ color: v.accent }}>[{book.category}]</span>}
        <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: v.text }}>
          <span className="font-medium">《{book.name}》</span>
          <span className="ml-1 hidden md:inline" style={{ color: v.textMuted }}>{book.latestChapter || '暂无章节'}</span>
        </span>
        <span className="shrink-0 text-[11px] tabular-nums" style={{ color: v.textMuted }}>{fmtDate(book.updatedAt)}</span>
      </button>
    </li>
  )
}

/** 右栏 · 点击排行榜 Top10(前 3 名主色底白字序号) */
function BiqugeRank({ books }: { books: BookItem[] }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  const ranked = useMemo(() => [...books].sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0)).slice(0, 10), [books])
  if (!ranked.length) return null
  return (
    <BiqugeCard title="点击排行榜" tag="rank">
      <ol className="px-1.5 py-1.5" id="biquge-rank">
        {ranked.map((b, i) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => navigate({ view: 'book', bookId: b.id })}
              className="flex min-h-[44px] w-full items-center gap-2.5 border-b px-2 py-1.5 text-left transition-opacity last:border-b-0 hover:opacity-75"
              style={{ borderColor: withAlpha(v.border, 0.55) }}
              aria-label={`查看排行榜第 ${i + 1} 名《${b.name}》`}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold tabular-nums"
                style={i < 3
                  ? { background: i === 0 ? v.primary : withAlpha(v.primary, 0.85), color: v.primaryText }
                  : { background: v.surfaceAlt, color: v.textMuted }}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: i < 3 ? v.primary : v.text }}>{b.name}</span>
              <span className="shrink-0 text-[10px] tabular-nums" style={{ color: v.textMuted }}>{formatWords(b.wordCount)}</span>
            </button>
          </li>
        ))}
      </ol>
    </BiqugeCard>
  )
}

/** 「最新更新」大板块 — 按分类分组的多列小表格(经典笔趣阁首页 DNA) */
function BiqugeGroupedLatest({ cats, siteId }: { cats: CategoryItem[] | null; siteId: string }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  // grouped=null 表示尚未拉到数据; pending 派生计算(避免 effect 内同步 setState)
  const [grouped, setGrouped] = useState<Array<{ id: string; name: string; books: BookItem[] }> | null>(null)

  // 取书量前 6 的非空分类, 各拉最新 8 本(既有公开 books 接口, 与前台其它视图同口径)
  const topCats = useMemo(
    () => (cats || []).filter((c) => (c._count?.books ?? 0) > 0).slice(0, 6),
    [cats],
  )
  const pending = !cats || (topCats.length > 0 && grouped === null)

  useEffect(() => {
    if (!topCats.length) return
    let alive = true
    Promise.all(
      topCats.map((c) =>
        fetchBooks({ site: siteId, cat: c.id, sort: 'latest', page: 1, size: 8 })
          .then((d) => ({ id: c.id, name: c.name, books: (d.books || []).slice(0, 8) }))
          .catch(() => null),
      ),
    ).then((rs) => {
      if (!alive) return
      setGrouped(rs.filter((x): x is { id: string; name: string; books: BookItem[] } => !!x && x.books.length > 0))
    })
    return () => { alive = false }
  }, [topCats, siteId])

  return (
    <section data-biquge="grouped-latest" aria-label="最新更新">
      {/* [R23-b-19] 最新更新升级渐变标题条(全宽板块头 + 副说明) */}
      <BiqugeBar
        title="最新更新"
        attached={false}
        level={2}
        className="mb-3"
        right={<span className="hidden truncate text-xs opacity-85 sm:inline">按分类分组 · 每列展示该分类最新 8 本</span>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pending || !cats || !grouped
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} aria-hidden>
                <Sk className="h-11 w-full" />
                <div className="space-y-2 p-3" style={{ background: v.surface, border: `1px solid ${v.border}`, borderTop: 'none', borderRadius: `0 0 ${v.radius} ${v.radius}` }}>
                  {Array.from({ length: 5 }).map((_, j) => <Sk key={j} className="h-9 w-full" />)}
                </div>
              </div>
            ))
          : grouped.map((g) => (
              <div key={g.id} style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius, boxShadow: v.cardShadow === 'none' ? undefined : v.cardShadow }}>
                {/* 分类名表头: 主色底白字(经典笔趣阁分列小表格样式), 点击进分类视图 */}
                <div {...catNavProps(navigate, g.id)} role="button" aria-label={`查看分类 ${g.name} 全部书籍`}>
                  <span
                    className="flex min-h-[44px] cursor-pointer items-center justify-between px-3 text-sm font-bold tracking-wider"
                    style={{ background: `linear-gradient(90deg, ${v.primary}, ${withAlpha(v.primary, 0.82)})`, color: v.primaryText, borderRadius: `${v.radius} ${v.radius} 0 0` }}
                  >
                    {g.name}
                    <span className="text-[10px] font-normal opacity-80">更多 ›</span>
                  </span>
                </div>
                <ul>
                  {g.books.map((b, i) => <BiqugeUpdateRow key={b.id} book={b} idx={i} />)}
                </ul>
              </div>
            ))}
      </div>
      {!pending && cats && (!grouped || grouped.length === 0) && (
        <p className="py-6 text-center text-sm" style={{ color: v.textMuted }}>各分类暂无书籍, 采集入库后此处将按分类展示最新更新</p>
      )}
    </section>
  )
}

/** 底部: 友情链接占位区 + 版权条 */
function BiqugeFooterBits({ siteId }: { siteId: string }) {
  const { site, theme } = usePublic()
  const v = theme.vars
  const [links, setLinks] = useState<FooterLinksData | null>(null)

  useEffect(() => {
    let alive = true
    fetchFooterLinks(false, siteId).then((d) => { if (alive) setLinks(d) }).catch(() => {})
    return () => { alive = false }
  }, [siteId])

  const friend = links?.friend || []
  const year = new Date().getFullYear()

  return (
    <div className="space-y-4">
      {/* 友情链接占位区 */}
      <section
        data-biquge="friend-links"
        aria-label="友情链接"
        className="px-4 py-3 text-xs leading-relaxed"
        style={{ background: v.surface, border: `1px dashed ${v.border}`, borderRadius: v.radius, color: v.textMuted }}
      >
        <span className="mr-3 font-bold" style={{ color: v.text }}>友情链接：</span>
        {friend.length ? (
          friend.map((l) => (
            <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="mr-3 inline-block transition-colors hover:underline" style={{ color: v.primary }}>
              {l.name}
            </a>
          ))
        ) : (
          <span>虚位以待，可在后台「友链/链轮」配置后在此展示…</span>
        )}
      </section>
      {/* 版权条 */}
      <footer className="space-y-1 py-4 text-center text-xs" style={{ color: v.textMuted, borderTop: `1px solid ${withAlpha(v.border, 0.7)}` }}>
        <p>© {year} {site.title || site.name} · {site.domain}</p>
        {site.description && <p className="mx-auto max-w-3xl">{site.description}</p>}
        <p>本站所有小说内容均收集自互联网，版权归原作者所有；如有侵权请联系删除。</p>
      </footer>
    </div>
  )
}

function BiqugeSkeleton() {
  return (
    <div data-biquge="home" aria-hidden>
      <Sk className="mb-4 h-28 w-full" />
      {/* [R23-b-18] 公告条骨架位(与真实结构对齐防 CLS) */}
      <Sk className="mb-5 h-10 w-full" />
      <div className="grid gap-4 lg:grid-cols-[176px_minmax(0,1fr)_264px]">
        <Sk className="hidden h-64 w-full lg:block" />
        <div className="space-y-4">
          <Sk className="h-40 w-full" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Sk key={i} className="aspect-[3/4] w-full" />)}
          </div>
        </div>
        <Sk className="h-96 w-full" />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Sk key={i} className="h-48 w-full" />)}
      </div>
    </div>
  )
}

export function HomeBiquge({ books, loading }: { books: BookItem[]; loading: boolean }) {
  const { site, theme, navigate } = usePublic()
  const v = theme.vars
  const [cats, setCats] = useState<CategoryItem[] | null>(null)

  useEffect(() => {
    let alive = true
    fetchCategories()
      .then((list) => { if (alive) setCats(list) })
      .catch(() => { if (alive) setCats([]) })
    return () => { alive = false }
  }, [])

  if (loading) return <BiqugeSkeleton />
  if (!books.length) return null

  const featured = books.slice(0, 2) // 本周强推
  const editors = books.slice(2, 6) // 编辑推荐
  const today = books.slice(6, 18) // 今日更新
  const sideRec = books.slice(2, 10) // 本站推荐
  const sideLatest = books.slice(0, 12) // 右栏最近更新
  const moreCats = () => navigate({ view: 'category' })

  return (
    <div data-biquge="home" className="space-y-5">
      {/* [R23-b-18] 公告通知条: 主色 4px 左边框 + 浅底(经典笔趣阁公告 DNA) */}
      <aside
        className="flex items-start gap-2 px-4 py-2.5 text-xs leading-relaxed"
        style={{
          borderLeft: `4px solid ${v.primary}`,
          background: withAlpha(v.primary, 0.06),
          color: v.textMuted,
          borderRadius: `0 ${v.radius} ${v.radius} 0`,
        }}
        aria-label="本站公告"
      >
        <span className="shrink-0 font-bold" style={{ color: v.primary }}>公告：</span>
        <span className="min-w-0 flex-1">
          本站小说均收集自互联网，仅供学习交流；每日持续更新，完结好书持续收录，使用顶部搜索框可按书名 / 作者查找。
        </span>
      </aside>

      {/* [R18-d-4] aijjxs 仿站: 深酒红导航条+米白报头已由 SiteHeader headerStyle='aijjxs' 呈现, 不再重复渲染导航卡 */}
      {v.headerStyle !== 'aijjxs' && <BiqugeNav />}

      {/* 主体三栏(移动端自然折叠单列; 分类导航桌面竖栏 + 移动横条由 BiqugeCats 内部切换) */}
      <div className="grid items-start gap-4 lg:grid-cols-[176px_minmax(0,1fr)_264px]">
        <BiqugeCats cats={cats} />

        {/* 中间主内容区 */}
        <div className="min-w-0 space-y-5">
          {featured.length > 0 && (
            <section aria-label="本周强推">
              {/* [R23-b-19] 本周强推升级渐变标题条(独立全宽板块头, h2 语义) */}
              <BiqugeBar title="本周强推" attached={false} level={2} className="mb-3" />
              <div className="grid gap-3 md:grid-cols-2">
                {featured.map((b) => <BiqugeFeatureCard key={b.id} book={b} />)}
              </div>
            </section>
          )}

          {editors.length > 0 && (
            <BiqugeCard title="编辑推荐" onMore={moreCats}>
              <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
                {editors.map((b) => <BiqugeSmallCard key={b.id} book={b} />)}
              </div>
            </BiqugeCard>
          )}

          {today.length > 0 && (
            <BiqugeCard title="今日更新" onMore={moreCats}>
              <ul>
                {today.map((b, i) => <BiqugeUpdateRow key={b.id} book={b} showCat idx={i} />)}
              </ul>
            </BiqugeCard>
          )}
        </div>

        {/* 右侧栏 */}
        <aside className="min-w-0 space-y-4">
          <BiqugeRank books={books} />
          {sideRec.length > 0 && (
            <BiqugeCard title="本站推荐" onMore={moreCats}>
              <ol>
                {sideRec.map((b, i) => <BiqugeUpdateRow key={b.id} book={b} idx={i} />)}
              </ol>
            </BiqugeCard>
          )}
          {sideLatest.length > 0 && (
            <BiqugeCard title="最近更新" onMore={moreCats}>
              <ol>
                {sideLatest.map((b, i) => <BiqugeUpdateRow key={b.id} book={b} idx={i} />)}
              </ol>
            </BiqugeCard>
          )}
        </aside>
      </div>

      {/* 最新更新大板块: 分类分组多列小表格 */}
      <BiqugeGroupedLatest cats={cats} siteId={site.id} />

      {/* 友情链接占位区 + 版权条 */}
      <BiqugeFooterBits siteId={site.id} />
    </div>
  )
}
