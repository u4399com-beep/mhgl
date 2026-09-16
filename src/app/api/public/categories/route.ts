// 前台分类列表 — 非空分类 + 计数(首页分类卡; [R30-5-1] rep 代表书载荷已随消费方删除一并移除)
import { db } from '@/lib/db'
import { ok } from '@/lib/api'
import { withGuard, clampInt } from '../../_lib/http'

export async function GET(req: Request) {
  return withGuard(async () => {
    const url = new URL(req.url)
    // 返回分类数钳制 1~60(缺省 24), 前台展示取前 6
    const limit = clampInt(url.searchParams.get('limit'), 24, 1, 60)

    // 非空过滤: books:{some:{}} → 空分类不进图文卡
    const cats = await db.category.findMany({
      where: { books: { some: {} } },
      orderBy: { sortOrder: 'asc' },
      take: limit,
      include: { _count: { select: { books: true } } },
    })

    // [R30-5-1] rep 代表书死载荷移除: 唯一消费者 CategoryShowcase.tsx 已在 R28-5-2 整文件删除,
    // 现 rep 字段全项目零读取 —— 移除后同时消除了原「每分类最多 2 次 findFirst、单请求最多 ~120
    // 个 SQLite 查询」的 N+1(原 API-18 评估注释随载荷一并作废)。消费方 data.ts:fetchCategories
    // 只读 id/name/bookCount, 响应契约收窄为纯分类计数。
    const items = cats.map((c) => ({ id: c.id, name: c.name, bookCount: c._count.books }))

    return ok({ items })
  })
}
