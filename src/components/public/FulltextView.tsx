// ============================================================
// [R28-0] 全本·完本视图壳 — R28 扩展页型(真站 /quanben/、完本列表页的通用数据壳)
//
// 数据口径: fetchBooks({status:'completed', page, size:24}) 与分类页同源;
// SEO/TDK 由本壳统一注入。registry 命中且模板提供 Fulltext → SiteTemplateSet.Fulltext
// 分发; 未命中走通用兜底(ThemeBookList 网格 + 分页)。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { fetchBooks, type BooksData } from './data'
import { usePublic } from './ctx'
import { useSiteSEO } from './seo'
import { ErrorState, Sk } from './bits'
import { Pagination } from './Pagination'
import { ThemeBookList } from './BookCard'
import { getTemplateSet } from './sites/registry'

export function FulltextView({ page }: { page: number }) {
  const { site, theme, navigate } = usePublic()
  const v = theme.vars
  const [data, setData] = useState<BooksData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const listKey = `${site.id}|${page}`
  const [prevKey, setPrevKey] = useState(listKey)
  if (prevKey !== listKey) {
    setPrevKey(listKey)
    setData(null)
    setError('')
    setLoading(true)
  }

  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, status: 'completed', page, size: 24 })
      .then((d) => {
        if (!alive) return
        setData(d)
        setLoading(false)
      })
      .catch((e: Error) => {
        if (!alive) return
        setError(e.message)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [site.id, page])

  const ftPath = `/?view=fulltext${page > 1 ? `&page=${page}` : ''}&site=${site.id}`
  useSiteSEO({
    title: `全本小说 - ${site.name}`,
    description: `${site.name}全本完本小说大全，共 ${data?.total ?? 0} 本完结好书，支持在线阅读与TXT全本下载`,
    keywords: `全本小说,完本小说,完结小说,TXT下载,${site.keywords}`.replace(/,+$/, ''),
    canonicalPath: ftPath,
    site,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `全本小说 - ${site.name}`,
        url: `${typeof window !== 'undefined' ? window.location.origin : ''}${ftPath}`,
        isPartOf: { '@type': 'WebSite', name: site.name },
      },
    ],
  })

  const tplSet = getTemplateSet(theme.id)
  if (tplSet?.Fulltext) {
    const TplFulltext = tplSet.Fulltext
    return <TplFulltext data={data} loading={loading} error={error} page={page} />
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center"
          style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius, color: v.primary }}
          aria-hidden
        >
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-black" style={{ color: v.text, fontFamily: v.titleFont }}>全本小说</h1>
          <p className="text-xs" style={{ color: v.textMuted }}>
            {loading ? '加载中' : `共 ${data?.total ?? 0} 本 · 第 ${data?.page ?? page} 页`}
          </p>
        </div>
      </div>

      {error ? (
        <ErrorState message="全本列表加载失败" detail={error} />
      ) : (
        <>
          <ThemeBookList books={data?.books || []} loading={loading} />
          {!loading && data && (
            <Pagination
              page={data.page}
              total={data.total}
              size={data.size}
              onPage={(p) => navigate({ view: 'fulltext', page: p })}
              center
            />
          )}
          {loading && <Sk className="mx-auto mt-4 h-9 w-64" />}
        </>
      )}
    </div>
  )
}
