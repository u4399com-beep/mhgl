// ============================================================
// 目录视图(view=toc) — [R27-5b-H2] ctx VIEW_LIST 早已承认 'toc'(parseView/VIEW_LIST/
// 模板内 30+ 处 navigate({view:'toc'})) 但 PublicSite renderView 此前缺分支, 深链
// /?view=toc 静默回落首页(软死链) —— 本壳补齐该视图。
//
// 分层与既有视图壳一致: 数据获取(fetchBook)/SEO/TDK/伪静态注册由本壳统一完成,
// registry 命中(theme.id ∈ 克隆五站)时按 SiteTemplateSet 契约渲染模板 Toc 组件;
// 未命中走通用目录形态兜底(借用 BookView 目录 tab 的行式列表 + 分页, 最小实现)。
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchBook, type BookDetailData } from './data'
import { bookCanonicalPath, usePublic } from './ctx'
import { formatWords, useSiteSEO } from './seo'
import { composeTocTdk, seoText, type SeoTplVars } from '@/lib/seo-tpl'
import { getTemplateSet } from './sites/registry'
import { ErrorState, Sk } from './bits'
import { Pagination } from './Pagination'
import type { TocChapter } from './types'

interface FetchState {
  key: string
  data?: BookDetailData
  error?: string
}

export function TocView({ bookId, page }: { bookId?: string; page: number }) {
  const { site, theme, navigate, pseudoPreset } = usePublic()
  const v = theme.vars
  const [state, setState] = useState<FetchState | null>(null)

  const key = `${bookId || ''}|${page}|${site.id}`

  useEffect(() => {
    if (!bookId) return
    let alive = true
    fetchBook(bookId, page, 100)
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
  }, [key, bookId, page])

  const loading = !state || state.key !== key
  const data = loading ? null : state.data || null
  const error = loading ? '' : state.error || ''
  const book = data?.book
  const chapters: TocChapter[] = data?.chapters || []

  // 当前章节高亮 — 与 BookView 同源(?chapter=<id>, 阅读页跳回目录时)
  const currentChapterId = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    return new URLSearchParams(window.location.search).get('chapter') || undefined
    // 仅随 bookId 变化重取(换书才可能带新 chapter 参数)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const tocSelfPath = `/?view=toc&id=${encodeURIComponent(bookId || '')}${page > 1 ? `&page=${page}` : ''}&site=${site.id}`
  // [R24-4] 目录页自动 TDK —— 与 BookView 目录翻页(?page>1)同走 composeTocTdk, 引擎单出处
  const introText = book ? seoText(book.intro) : ''
  const bookVars: SeoTplVars = {
    bookname: book?.name || '',
    author: book?.author || '',
    category: book?.category || '',
    status: book?.status || '',
    sitename: site.name,
    intro: introText,
    chapterCount: data?.tocTotal || chapters.length,
    siteKeywords: book?.keywords || '',
  }
  const tdk = useMemo(() => {
    if (!book) return undefined
    return composeTocTdk(bookVars, site.seoTpl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, site.id, site.seoTpl, introText])
  useSiteSEO({
    title: tdk ? tdk.title : `章节目录 - ${site.name}`,
    description: tdk?.description,
    keywords: tdk?.keywords,
    // 加载/错误态不设 canonical; 错误态 noindex 防软 404 被收录
    robots: error ? 'noindex,follow' : undefined,
    canonicalPath: book ? tocSelfPath : undefined,
    site,
    jsonLd: book
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: '首页', item: `${origin}/?site=${site.id}` },
              ...(book.categoryId
                ? [
                    {
                      '@type': 'ListItem',
                      position: 2,
                      name: book.category,
                      item: `${origin}/?view=category&cat=${book.categoryId}&site=${site.id}`,
                    },
                  ]
                : []),
              {
                '@type': 'ListItem',
                position: book.categoryId ? 3 : 2,
                name: book.name,
                item: `${origin}${bookCanonicalPath(book, site.id, pseudoPreset)}`,
              },
              { '@type': 'ListItem', position: book.categoryId ? 4 : 3, name: '章节目录', item: `${origin}${tocSelfPath}` },
            ],
          },
        ]
      : [],
  })

  if (!bookId) return <ErrorState message="缺少书籍参数" />

  // [R27-5b-H2] 克隆模板接线: registry 命中且有 Toc 克隆 → 模板组件
  // (props 按 SiteTemplateSet 契约: data/page/currentChapterId 从本壳数据流直传)
  const tplSet = getTemplateSet(theme.id)
  if (tplSet?.Toc) {
    const TplToc = tplSet.Toc
    return <TplToc data={data} loading={loading} error={error} page={page} currentChapterId={currentChapterId} />
  }

  // ---------- 通用目录形态兜底(未接线站点): 借用 BookView 目录 tab 的行式列表 + 分页 ----------
  // 声明: 旧渲染路径无现成独立目录视图, 此为最小实现(主题变量化, 非真站 1:1 克隆)
  if (error) return <ErrorState message="章节目录加载失败" detail={error} />

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {loading || !book ? (
        <div className="space-y-4" aria-label="目录加载中">
          <Sk className="h-8 w-2/3" />
          <Sk className="h-4 w-1/3" />
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 18 }).map((_, i) => (
              <Sk key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <header className="mb-5">
            <h1 className="text-xl font-bold" style={{ color: v.text, fontFamily: v.titleFont }}>
              {book.name}
              <span className="ml-2 text-sm font-normal" style={{ color: v.textMuted }}>
                章节目录
              </span>
            </h1>
            <p className="mt-1 text-xs" style={{ color: v.textMuted }}>
              {book.author ? `${book.author} · ` : ''}共 {data?.tocTotal ?? chapters.length} 章
              {data && data.tocTotalPages > 1 ? ` · 第 ${page}/${data.tocTotalPages} 页` : ''}
            </p>
          </header>
          {chapters.length ? (
            <div className="divide-y" style={{ borderColor: v.border }}>
              {chapters.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => navigate({ view: 'read', chapterId: ch.id })}
                  className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:opacity-80"
                  style={ch.id === currentChapterId ? { color: v.primary } : { color: v.text }}
                  aria-current={ch.id === currentChapterId ? 'true' : undefined}
                  aria-label={`阅读 ${ch.title}`}
                >
                  <span className="shrink-0 text-[11px] tabular-nums" style={{ color: v.textMuted }}>
                    {ch.idx}.
                  </span>
                  <span className="line-clamp-1 flex-1 text-sm">{ch.title}</span>
                  <span className="shrink-0 text-[10px] tabular-nums" style={{ color: v.textMuted }}>
                    {formatWords(ch.wordCount)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm" style={{ color: v.textMuted }}>
              暂无章节
            </p>
          )}
          {data && (
            <div className="pt-6">
              <Pagination
                page={data.tocPage}
                total={data.tocTotal}
                size={data.tocSize}
                onPage={(p) => navigate({ view: 'toc', bookId, page: p })}
                center
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
