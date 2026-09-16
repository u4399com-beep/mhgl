// ============================================================
// [R28-0] 排行榜视图壳 — R28 扩展页型(真站 /top/、/paihang/ 等榜单页的通用数据壳)
//
// 数据口径: 并行拉取三榜(更新榜 latest / 字数榜 words / 新书榜 new), 每榜 top60,
// 全部走 /api/public/books 同源白名单排序; SEO/TDK 由本壳统一注入。
// registry 命中且模板提供 Ranking → SiteTemplateSet.Ranking 分发;
// 未命中走通用兜底(榜 tab + ThemeBookList 行式列表)。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { fetchBooks } from './data'
import { usePublic } from './ctx'
import { useSiteSEO } from './seo'
import { ErrorState, Sk } from './bits'
import { ThemeBookList } from './BookCard'
import { getTemplateSet } from './sites/registry'
import type { RankingBoard, RankingSort } from './sites/shared'

/** 榜单定义(顺序即默认展示顺序; label 与真站榜单名对齐) */
const BOARDS: { key: RankingSort; label: string }[] = [
  { key: 'latest', label: '更新榜' },
  { key: 'words', label: '字数榜' },
  { key: 'new', label: '新书榜' },
]

export function RankingView() {
  const { site, theme, navigate } = usePublic()
  const v = theme.vars
  const [boards, setBoards] = useState<RankingBoard[] | null>(null)
  const [error, setError] = useState('')
  const [active, setActive] = useState<RankingSort>('latest')

  // 切站重置 — 渲染期同步(React 官方推荐模式, 避免 set-state-in-effect lint 违规)
  const [prevSite, setPrevSite] = useState(site.id)
  if (prevSite !== site.id) {
    setPrevSite(site.id)
    setBoards(null)
    setError('')
  }

  // 三榜并行拉取(一次性; 榜单为站级数据不随交互重拉, tab 切换纯前端)
  useEffect(() => {
    let alive = true
    Promise.all(
      BOARDS.map((b) =>
        fetchBooks({ site: site.id, sort: b.key, page: 1, size: 60 })
          .then((d): RankingBoard => ({ key: b.key, label: b.label, books: d.books, total: d.total }))
          .catch((): RankingBoard => ({ key: b.key, label: b.label, books: [], total: 0 })),
      ),
    ).then((rs) => {
      if (!alive) return
      setBoards(rs)
      if (rs.every((b) => b.total === 0)) setError('榜单数据暂不可用')
    })
    return () => {
      alive = false
    }
  }, [site.id])

  const rankingPath = `/?view=ranking&site=${site.id}`
  useSiteSEO({
    title: `排行榜 - ${site.name}`,
    description: `${site.name}小说排行榜，更新榜/字数榜/新书榜 TOP60，热门小说实时排名，支持在线阅读与TXT下载`,
    keywords: `小说排行榜,热门小说,${site.name}排行榜,${site.keywords}`.replace(/,+$/, ''),
    canonicalPath: rankingPath,
    site,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `排行榜 - ${site.name}`,
        url: `${typeof window !== 'undefined' ? window.location.origin : ''}${rankingPath}`,
        isPartOf: { '@type': 'WebSite', name: site.name },
      },
    ],
  })

  const tplSet = getTemplateSet(theme.id)
  const loading = !boards && !error
  if (tplSet?.Ranking) {
    const TplRanking = tplSet.Ranking
    return (
      <TplRanking
        boards={boards || []}
        active={active}
        onBoard={setActive}
        loading={loading}
        error={error}
      />
    )
  }

  const activeBoard = boards?.find((b) => b.key === active) || null

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center"
          style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius, color: v.primary }}
          aria-hidden
        >
          <TrendingUp className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-black" style={{ color: v.text, fontFamily: v.titleFont }}>排行榜</h1>
          <p className="text-xs" style={{ color: v.textMuted }}>
            {loading ? '加载中' : `${site.name} · 三榜 TOP60`}
          </p>
        </div>
      </div>

      {error && !boards?.some((b) => b.books.length) ? (
        <ErrorState message="榜单加载失败" detail={error} />
      ) : (
        <>
          {/* 榜 tab */}
          <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="榜单切换">
            {BOARDS.map((b) => {
              const on = b.key === active
              return (
                <button
                  key={b.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActive(b.key)}
                  className="px-4 py-1.5 text-sm font-bold transition-opacity"
                  style={{
                    borderRadius: v.radius,
                    background: on ? v.primary : v.surface,
                    color: on ? v.primaryText : v.textMuted,
                    border: `1px solid ${on ? v.primary : v.border}`,
                  }}
                >
                  {b.label}
                </button>
              )
            })}
          </div>
          {activeBoard ? (
            <ThemeBookList books={activeBoard.books} loading={loading} />
          ) : (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Sk key={i} className="h-16 w-full" />
              ))}
            </div>
          )}
        </>
      )}
      {/* 榜单书卡可跳详情; 额外入口: 返回全部分类 */}
      {!loading && (
        <p className="mt-6 text-center text-xs" style={{ color: v.textMuted }}>
          榜单每小时随采集更新 ·{' '}
          <button type="button" className="underline" style={{ color: v.primary }} onClick={() => navigate({ view: 'category' })}>
            浏览全部分类
          </button>
        </p>
      )}
    </div>
  )
}
