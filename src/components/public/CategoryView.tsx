// ============================================================
// 分类视图 — 分类书籍列表（复用主题化列表/卡片）+ 分页
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { fetchBooks, fetchCategories, type BooksData } from './data'
import { usePublic } from './ctx'
import { useSiteSEO } from './seo'
import { ErrorState, Sk } from './bits'
import { Pagination } from './Pagination'
import { ThemeBookList } from './BookCard'
// [R27-5b-H2] 克隆模板接线: registry 命中(theme.id ∈ 克隆五站)→ SiteTemplateSet.Category 分发
import { getTemplateSet } from './sites/registry'

export function CategoryView({ cat, page }: { cat?: string; page: number }) {
  const { site, theme, navigate } = usePublic()
  const v = theme.vars
  const [data, setData] = useState<BooksData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [catName, setCatName] = useState('')
  const listKey = `${site.id}|${cat || ''}|${page}`
  const [prevKey, setPrevKey] = useState(listKey)
  if (prevKey !== listKey) {
    setPrevKey(listKey)
    setData(null)
    setError('')
    setLoading(true)
    setCatName('') // 同步清除上一分类的名称，避免闪烁旧分类名
  }
  const label = !cat ? '全部分类' : catName || '分类书籍'

  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, cat, page, size: 24 })
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
  }, [site.id, cat, page])

  useEffect(() => {
    if (!cat) return
    let alive = true
    fetchCategories()
      .then((list) => {
        if (!alive) return
        // [R49-2a-3] 合成锚点形态(cat:{name})在分类列表未命中时回退用锚点名直显,
        // 避免 h1/TDK 落「分类书籍」泛称(稀薄库窗口期锚点名=导航可见名, 语义等价)
        setCatName(list.find((c) => c.id === cat)?.name || (cat.startsWith('cat:') ? cat.slice(4) : '分类书籍'))
      })
      .catch(() => {
        if (alive) setCatName(cat.startsWith('cat:') ? cat.slice(4) : '分类书籍')
      })
    return () => {
      alive = false
    }
  }, [cat])

  // [R15-a1-8] 分类页规范地址抽取为单变量: canonical 与 JSON-LD url 同源
  // (修前 JSON-LD url 缺 page 参数且 cat 未编码, 与 canonical 不同地址)
  const catPath = `/?view=category&cat=${encodeURIComponent(cat || '')}${page > 1 ? `&page=${page}` : ''}&site=${site.id}`
  useSiteSEO({
    title: `${label} - ${site.name}`,
    description: `${site.name}${label}分类下的小说列表，共 ${data?.total ?? 0} 本，支持在线阅读与TXT下载`,
    keywords: `${label},${label}小说,${site.keywords}`.replace(/,+$/, ''),
    // 首页与 page=1 共享同一 canonical，避免重复收录
    canonicalPath: catPath,
    site,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `${label} - ${site.name}`,
        url: `${typeof window !== 'undefined' ? window.location.origin : ''}${catPath}`,
        isPartOf: { '@type': 'WebSite', name: site.name },
      },
    ],
  })

  // [R27-5b-H2] 克隆模板接线: registry 命中且有 Category 克隆 → 模板组件(错误态由模板内部呈现)。
  // props 按 SiteTemplateSet 契约从本壳数据流直传; SEO/TDK(含 catName 解析)仍由本壳统一负责
  // (数据口径 fetchBooks({cat, page, size:24}) 与契约一致, 零回归面)
  const tplSet = getTemplateSet(theme.id)
  if (tplSet?.Category) {
    const TplCategory = tplSet.Category
    return <TplCategory data={data} loading={loading} error={error} catName={label} cat={cat} page={page} />
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center"
          style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius, color: v.primary }}
          aria-hidden
        >
          <FolderOpen className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-black" style={{ color: v.text, fontFamily: v.titleFont }}>{label}</h1>
          <p className="text-xs" style={{ color: v.textMuted }}>
            {loading ? '加载中' : `共 ${data?.total ?? 0} 本 · 第 ${data?.page ?? page} 页`}
          </p>
        </div>
      </div>

      {error ? (
        <ErrorState message="分类列表加载失败" detail={error} />
      ) : (
        <>
          <ThemeBookList books={data?.books || []} loading={loading} />
          {!loading && data && (
            <Pagination
              page={data.page}
              total={data.total}
              size={data.size}
              onPage={(p) => navigate({ view: 'category', cat, page: p })}
              center
            />
          )}
          {loading && <Sk className="mx-auto mt-4 h-9 w-64" />}
        </>
      )}
    </div>
  )
}
