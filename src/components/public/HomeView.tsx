// ============================================================
// 首页视图 — 随机下拉词 + 6 分类图文卡 + 排序切换 + 按 theme.layout 分发 8 种布局（全主题去分页, 一次拉 48 本）
// R23-b: 排序按钮消费 buttonStyle token + 共享 HomeHero 小节(待命, 防与布局内自建 hero 叠加)
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import type { CSSProperties } from 'react'
import { ArrowDownWideNarrow, Flame, Hash, Home } from 'lucide-react'
import { fetchBooks, type BooksData } from './data'
import { usePublic } from './ctx'
import { siteKeywordList, useSiteSEO, withAlpha } from './seo'
import { EmptyState, ErrorState, SuggestTagCloud, TagCloud, BookGridSkeleton } from './bits'
import { CategoryShowcase } from './CategoryShowcase'
// 默认主题 aurora → shelf: 首屏保证, 保持静态 import; 其余 7 布局按需分包(ab-d 懒加载试点)
// —— 布局仅在本组件内引用且站点/主题经客户端 fetch 获知, SSR 首屏只会命中 shelf,
//    非默认布局只会在数据到达后的客户端渲染分支中触发 chunk 拉取, 无首屏闪烁/CLS 回归面
import { HomeShelf } from './layouts/HomeShelf'
const HomeList = dynamic(() => import('./layouts/HomeList').then((m) => m.HomeList))
const HomeGrid = dynamic(() => import('./layouts/HomeGrid').then((m) => m.HomeGrid))
const HomeMinimal = dynamic(() => import('./layouts/HomeMinimal').then((m) => m.HomeMinimal))
const HomeMagazine = dynamic(() => import('./layouts/HomeMagazine').then((m) => m.HomeMagazine))
const HomeTheater = dynamic(() => import('./layouts/HomeTheater').then((m) => m.HomeTheater))
const HomePili = dynamic(() => import('./layouts/HomePili').then((m) => m.HomePili))
const HomeBiquge = dynamic(() => import('./layouts/HomeBiquge').then((m) => m.HomeBiquge))
import type { BookItem } from './types'

interface FetchState {
  key: string
  data?: BooksData
  error?: string
}

// [R23-b-22] 共享 HomeHero 小节(可选渲染, h2 语义避免与布局内 h1 叠加):
// R23-b 规格下 grid/theater/magazine/shelf 四布局均在布局内部自建差异化 hero(heroBg 富横幅/书架搁板/头条大卡/影院海报),
// list/minimal/pili/biquge 亦有各自顶部板块(窄横幅/标语区/跑马灯公告/通知条),
// 因此 8 布局全部有自建顶部板块 —— 为避免「布局内 hero + 共享 hero」双重叠加, 本共享 hero 保持待命(空表 = 不渲染);
// 未来新增无自建 hero 的布局时, 将其 layout id 加入下表即可挂载。
const SHARED_HERO_LAYOUTS: string[] = []

function HomeHero({ name, description }: { name: string; description?: string }) {
  const { theme } = usePublic()
  const v = theme.vars
  const tv = v
  const heroBg = tv.heroBg || `linear-gradient(120deg, ${withAlpha(v.primary, 0.92)}, ${withAlpha(v.accent, 0.85)})`
  const heroText = tv.heroText || v.primaryText
  const heroMuted = tv.heroMuted || withAlpha(heroText, 0.8)
  return (
    <section className="mb-6 px-5 py-6 sm:px-8" style={{ background: heroBg, borderRadius: v.radius }} aria-label="站点导语">
      <h2 className="text-xl font-black leading-snug sm:text-2xl" style={{ color: heroText }}>
        {name}
      </h2>
      {description && (
        <p className="mt-1.5 line-clamp-2 text-sm" style={{ color: heroMuted }}>
          {description}
        </p>
      )}
    </section>
  )
}

export function HomeView({ page, cat }: { page: number; cat?: string }) {
  const { site, theme, navigate } = usePublic()
  const v = theme.vars
  // [R23-b-21] token 消费: 排序按钮 active 态按 buttonStyle 渲染(未落地走 'solid' fallback)
  const tv = v
  const buttonStyle = tv.buttonStyle || 'solid'
  const glowColor = tv.glowColor || v.primary
  const activeSortStyle = (): CSSProperties => {
    switch (buttonStyle) {
      case 'gradient':
        return { background: `linear-gradient(90deg, ${v.primary}, ${v.accent})`, color: v.primaryText, border: '1px solid transparent' }
      case 'outline':
        return { background: v.surface, color: v.primary, border: `1.5px solid ${v.primary}` }
      case 'pill':
        return { background: v.primary, color: v.primaryText, border: `1px solid ${v.primary}`, borderRadius: '999px' }
      case 'neon':
        return { background: withAlpha(v.primary, 0.1), color: v.primary, border: `1px solid ${v.primary}`, boxShadow: `0 0 12px ${withAlpha(glowColor, 0.55)}` }
      default: // solid
        return { background: v.primary, color: v.primaryText, border: `1px solid ${v.primary}` }
    }
  }
  // inactive 统一 surface+border(主题化圆角)
  const sortBtnStyle = (active: boolean): CSSProperties =>
    active
      ? activeSortStyle()
      : { background: v.surface, color: v.text, border: `1px solid ${v.border}` }
  const [sort, setSort] = useState<'latest' | 'words'>('latest')
  const [state, setState] = useState<FetchState | null>(null)

  const key = `${site.id}|${cat || ''}|${sort}|${page}`

  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, cat, sort, page, size: 48 })
      .then((d) => {
        if (!alive) return
        setState({ key, data: d })
      })
      .catch((e: Error) => {
        if (!alive) return
        setState({ key, error: e.message })
      })
    return () => {
      alive = false
    }
  }, [key, site.id, cat, sort, page])

  const loading = !state || state.key !== key
  const data = loading ? null : state.data || null
  const error = loading ? '' : state.error || ''

  const catName = cat ? data?.books[0]?.category || '当前分类' : ''

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  useSiteSEO({
    title: site.title || `${site.name} - 精品小说在线阅读`,
    description: site.description || `${site.name}提供各类小说在线阅读`,
    keywords: site.keywords || '小说,在线阅读',
    canonicalPath: cat ? `/?cat=${cat}&site=${site.id}` : `/?site=${site.id}`,
    site,
    jsonLd: useMemo(
      () => [
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: site.name,
          url: `${origin}/`,
          description: site.description,
          inLanguage: 'zh-CN',
          potentialAction: {
            '@type': 'SearchAction',
            target: `${origin}/?view=search&q={search_term_string}&site=${site.id}`,
            'query-input': 'required name=search_term_string',
          },
        },
      ],
      [origin, site.id, site.name, site.description],
    ),
  })

  const books: BookItem[] = data?.books || []

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* [R23-b-22] 共享 hero 条(仅无自建顶部板块的布局渲染; 当前 8 布局均有自建板块, 恒待命) */}
      {SHARED_HERO_LAYOUTS.includes(theme.layout) && <HomeHero name={site.name} description={site.description} />}

      {/* 页头区: 随机下拉词(全站搜索热词) + 换一批 */}
      <section className="mb-5" aria-label="搜索热词">
        <SuggestTagCloud count={16} refresh />
      </section>

      {/* 6 分类图文卡(代表书封面) */}
      <div className="mb-6">
        <CategoryShowcase />
      </div>

      {/* 排序切换 + 分类筛选提示 */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSort('latest')
              navigate({ view: 'home', cat, page: 1 })
            }}
            // [R23-b-21] active 态按 buttonStyle 渲染, inactive 统一 surface+border
            className="inline-flex min-h-[44px] items-center gap-1 px-3.5 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
            style={sortBtnStyle(sort === 'latest')}
            aria-pressed={sort === 'latest'}
          >
            <Home className="h-3.5 w-3.5" aria-hidden />
            最新更新
          </button>
          <button
            type="button"
            onClick={() => {
              setSort('words')
              navigate({ view: 'home', cat, page: 1 })
            }}
            className="inline-flex min-h-[44px] items-center gap-1 px-3.5 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
            style={sortBtnStyle(sort === 'words')}
            aria-pressed={sort === 'words'}
          >
            <ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden />
            字数最多
          </button>
        </div>
        {cat && (
          <button
            type="button"
            onClick={() => navigate({ view: 'home' })}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs"
            style={{ background: withAlpha(v.accent, 0.14), color: v.accent, border: `1px solid ${withAlpha(v.accent, 0.4)}` }}
            aria-label="清除分类筛选"
          >
            分类：{catName} · 点击清除
          </button>
        )}
      </div>

      {error ? (
        <ErrorState message="书籍列表加载失败" detail={error} />
      ) : !loading && !books.length && !data ? (
        <EmptyState />
      ) : !loading && !books.length ? (
        <EmptyState text="本页暂无书籍" hint="换个分类或翻页看看" />
      ) : (
        <>
          {theme.layout === 'shelf' && <HomeShelf books={books} loading={loading} />}
          {theme.layout === 'list' && <HomeList books={books} loading={loading} />}
          {theme.layout === 'grid' && <HomeGrid books={books} loading={loading} />}
          {theme.layout === 'minimal' && <HomeMinimal books={books} loading={loading} />}
          {theme.layout === 'magazine' && <HomeMagazine books={books} loading={loading} />}
          {theme.layout === 'theater' && <HomeTheater books={books} loading={loading} />}
          {theme.layout === 'pili' && <HomePili books={books} loading={loading} />}
          {theme.layout === 'biquge' && <HomeBiquge books={books} loading={loading} />}
          {/* feat-round-7 B3: 防御性兜底 — 未知布局/loading 期无任何布局命中时用 BookGridSkeleton */}
          {!['shelf', 'list', 'grid', 'minimal', 'magazine', 'theater', 'pili', 'biquge'].includes(theme.layout) && loading && (
            <BookGridSkeleton count={12} />
          )}
        </>
      )}

      {/* 热门标签云 */}
      {!loading && books.length > 0 && (
        <section className="pt-8" aria-label="热门标签">
          <div className="mb-3 flex items-center gap-2">
            <Hash className="h-4 w-4" style={{ color: v.primary }} aria-hidden />
            <h2 className="text-sm font-bold tracking-widest" style={{ color: v.text }}>热门标签</h2>
            <Flame className="h-3.5 w-3.5" style={{ color: v.accent }} aria-hidden />
          </div>
          <TagCloud tags={siteKeywordList(site)} />
        </section>
      )}
    </div>
  )
}
