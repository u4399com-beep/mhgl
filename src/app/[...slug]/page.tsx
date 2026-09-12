// ============================================================
// 伪静态路由(catch-all) — /book/*.html / /read/* 直达与刷新
// 服务端宽容解析(pseudostatic-server.resolvePrettyPath):
//   token → 真实 bookId/chapterId → 复用 PublicSite 渲染(与查询串路由同一套 UI/状态机);
//   任何一环解析失败 → notFound(404)。
// query 参数透传: ?site=(站群切换) ?page=(目录翻页) ?theme=(预览覆盖)
// ============================================================
import { notFound } from 'next/navigation'
import PrettyPublicShell from '@/components/public/PrettyPublicShell'
import { resolvePrettyPath } from '@/lib/pseudostatic-server'

export const dynamic = 'force-dynamic'

export default async function PrettyPathPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const sp = await searchParams
  const pathname = `/${(slug || []).join('/')}`
  const resolved = await resolvePrettyPath(pathname)
  if (!resolved) notFound()

  const first = (k: string): string | undefined => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }
  const siteId = first('site') || undefined
  const pageN = Number(first('page')) || 1

  return (
    <PrettyPublicShell
      siteId={siteId}
      view={{
        view: resolved.view,
        bookId: resolved.bookId,
        chapterId: resolved.chapterId,
        page: pageN > 0 ? pageN : 1,
        site: siteId,
      }}
    />
  )
}
