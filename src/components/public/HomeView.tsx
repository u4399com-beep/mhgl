// ============================================================
// 首页视图 — [R24-5] 按 theme.layout(=站点克隆 id)分发 9 个 {Site}Home 克隆首页组件。
// 数据口径: 一次拉 48 本最新(与旧 12 布局同源 fetchBooks), SEO/TDK 由本壳统一注入。
// 旧 12 种通用布局(与全部旧主题一起)已按用户指令删除 —— 见 [R24-5] themes.ts 头注。
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { fetchBooks, type BooksData } from './data'
import { usePublic } from './ctx'
import { useSiteSEO } from './seo'
import { EmptyState, ErrorState } from './bits'
import type { BookItem } from './types'
import type { SiteHomeProps } from './sites/shared'

// [R24-5] 9 站克隆首页全部按需分包: 站点/主题经客户端 fetch 获知, SSR 首屏命中默认站主题,
// 非默认布局只在数据到达后的客户端渲染分支中触发 chunk 拉取, 无首屏闪烁/CLS 回归面
const AijjxsHome = dynamic(() => import('./sites/AijjxsHome').then((m) => m.AijjxsHome))
const PiliHome = dynamic(() => import('./sites/PiliHome').then((m) => m.PiliHome))
const Kks101Home = dynamic(() => import('./sites/Kks101Home').then((m) => m.Kks101Home))
const Qb23Home = dynamic(() => import('./sites/Qb23Home').then((m) => m.Qb23Home))
const DdyueshuHome = dynamic(() => import('./sites/DdyueshuHome').then((m) => m.DdyueshuHome))
const X2552Home = dynamic(() => import('./sites/X2552Home').then((m) => m.X2552Home))
const HuangjinwuHome = dynamic(() => import('./sites/HuangjinwuHome').then((m) => m.HuangjinwuHome))
const Ggd66Home = dynamic(() => import('./sites/Ggd66Home').then((m) => m.Ggd66Home))
const ShipsayHome = dynamic(() => import('./sites/ShipsayHome').then((m) => m.ShipsayHome))

const SITE_HOMES: Record<string, React.ComponentType<SiteHomeProps>> = {
  aijjxs: AijjxsHome,
  pili: PiliHome,
  kks101: Kks101Home,
  qb23: Qb23Home,
  ddyueshu: DdyueshuHome,
  x2552: X2552Home,
  huangjinwu: HuangjinwuHome,
  ggd66: Ggd66Home,
  shipsay: ShipsayHome,
}

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
  const SiteHome = SITE_HOMES[theme.layout]

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
        // 防御性兜底: 未知布局 id(旧库脏数据) → aijjxs 克隆首页
        <AijjxsHome books={books} loading={loading} />
      )}
    </>
  )
}
