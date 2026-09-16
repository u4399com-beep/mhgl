// ============================================================
// 首页视图 — [R24-5] 按 theme.layout(=站点克隆 id)分发克隆首页组件;
// [R25-4] +trxsw(同人小说网)第 10 套; [R27-6/R27-6b] 十站全部六文件化并入
// sites/registry(SiteTemplateSet.Home) 接管, 旧单文件 fallback 表已全部删除,
// 兜底为 registry 内 aijjxs。数据口径: 一次拉 48 本最新(与旧 12 布局同源 fetchBooks),
// SEO/TDK 由本壳统一注入。旧 12 种通用布局(与全部旧主题一起)已按用户指令删除 —— 见 [R24-5] themes.ts 头注。
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchBooks, type BooksData } from './data'
import { usePublic } from './ctx'
import { useSiteSEO } from './seo'
import { EmptyState, ErrorState } from './bits'
import { BookCard } from './BookCard'
import type { BookItem } from './types'
// [R27-5b-H2] 克隆模板注册表(theme.id → SiteTemplateSet)
import { getTemplateSet } from './sites/registry'

// [R24-5] 克隆首页按需分包存档: 站点/主题经客户端 fetch 获知, SSR 首屏命中默认站主题。
// [R27-6/R27-6b] 十站全部六文件克隆(sites/registry 静态接管全五视图), 旧单文件
// XxxHome.tsx 共 10 个已全部删除; registry 静态打包(审计遗留项: 如在意主 chunk
// 体积可后续改 React.lazy 分包)。

interface FetchState {
  key: string
  data?: BooksData
  error?: string
}

export function HomeView({ page, cat }: { page: number; cat?: string }) {
  const { site, theme } = usePublic()
  const [sort] = useState<'latest' | 'words'>('latest')
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
  // [R28-1] 克隆模板接线: registry 命中(theme.id ∈ 克隆十站)→ SiteTemplateSet.Home;
  // R28 删除全部克隆模板重建期间, 兜底从 aijjxs 模板改为通用网格(见下方最终分支)
  const tplSet = getTemplateSet(theme.id)
  const SiteHome = tplSet?.Home

  return (
    <>
      {error ? (
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <ErrorState message="书籍列表加载失败" detail={error} />
        </div>
      ) : !loading && !books.length && !data ? (
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <EmptyState />
        </div>
      ) : !loading && !books.length ? (
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <EmptyState text="本页暂无书籍" hint="换个分类或翻页看看" />
        </div>
      ) : SiteHome ? (
        <SiteHome books={books} loading={loading} />
      ) : (
        // [R28-1] 通用首页兜底: R28 删模板重建窗口期/未接线主题的渲染保障(旧兜底 aijjxs 已随模板删除)
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h1 className="text-xl font-black">最新书籍</h1>
            <span className="text-xs opacity-60">共 {books.length} 本</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {books.map((b) => (
              <BookCard key={b.id} book={b} />
            ))}
          </div>
          {loading && !books.length && (
            <div className="space-y-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded bg-black/5" />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
