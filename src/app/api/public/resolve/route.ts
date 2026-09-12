// 伪静态路径解析 — 供前台 SPA popstate(浏览器前进/后退)恢复视图
// 宽容解析 /book/... /read/... → 真实 bookId/chapterId(cuid); 解析失败返回 ok(null)
// (404 语义由前台判定, 保持 { ok, data } 统一信封)
import { ok } from '@/lib/api'
import { withGuard, str } from '../../_lib/http'
import { resolvePrettyPath } from '@/lib/pseudostatic-server'

export async function GET(req: Request) {
  return withGuard(async () => {
    const url = new URL(req.url)
    const path = str(url.searchParams.get('path'), 512).trim()
    if (!path || !path.startsWith('/')) return ok(null)
    const resolved = await resolvePrettyPath(path)
    return ok(resolved)
  })
}
