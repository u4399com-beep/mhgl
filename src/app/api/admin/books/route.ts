// 书籍管理(列表/手动新增)
import { db } from '@/lib/db'
import { ok, fail, readBody } from '@/lib/api'
import { withGuard, str, likeSafe, httpUrl, clampInt } from '../../_lib/http'
import { nextBookNum, withBookNumRetry } from '@/lib/pseudostatic-server'

const BOOK_STATUSES = ['unknown', 'ongoing', 'completed'] as const

export async function GET(req: Request) {
  return withGuard(async () => {
    const url = new URL(req.url)
    const q = likeSafe(url.searchParams.get('q'))
    const categoryId = str(url.searchParams.get('categoryId'), 64).trim()
    const status = str(url.searchParams.get('status'), 20).trim()
    // [R11-a-2] 越界页钳制到末页, 顺带闭合超大 OFFSET 扫描面 —— 修前 page 上限 100 万 ×
    //  size 上限 50 → skip 可达 5000 万行, 单请求可令 SQLite 全表扫(OFFSET 需逐行跳过)
    //  数秒, 60/min 限流下足以饱和 DB。与 themes 分页同款: 先取 total, page 钳到
    //  ceil(total/size), 合法页行为不变, 越界页从"空列表"变为"末页"(skip 上界=表行数)
    const page0 = clampInt(url.searchParams.get('page'), 1, 1, 1_000_000)
    const size = clampInt(url.searchParams.get('size'), 20, 1, 50)

    const where: Record<string, unknown> = {}
    if (q) where.OR = [{ name: { contains: q } }, { author: { contains: q } }]
    if (categoryId) where.categoryId = categoryId
    // 状态白名单: 非法值忽略(不报错, 保持列表可用), 防任意字符串进查询
    if (status && (BOOK_STATUSES as readonly string[]).includes(status)) where.status = status

    const total = await db.book.count({ where })
    const page = Math.max(1, Math.min(page0, Math.ceil(total / size) || 1))
    const books = await db.book.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
      include: {
        category: true,
        _count: { select: { chapters: true, tags: true } },
      },
    })
    return ok({ total, page, size, books })
  })
}

export async function POST(req: Request) {
  return withGuard(async () => {
    const body = await readBody(req)
    const name = str(body?.name, 200).trim()
    if (!name) return fail('书名必填')

    // 分类: 优先 id(须存在), 其次按名称 upsert
    let categoryId: string | null = str(body?.categoryId, 64).trim() || null
    if (categoryId) {
      const cat = await db.category.findUnique({ where: { id: categoryId } })
      if (!cat) return fail('所选分类不存在', 404)
    } else {
      const categoryName = str(body?.categoryName, 50).trim()
      if (categoryName) {
        const cat = await db.category.upsert({
          where: { name: categoryName },
          create: { name: categoryName },
          update: {},
        })
        categoryId = cat.id
      }
    }

    // 状态白名单
    const status = (BOOK_STATUSES as readonly string[]).includes(body?.status)
      ? body.status
      : 'unknown'
    // 来源URL: 有值时必须是合法 http(s)
    const sourceUrl = httpUrl(body?.sourceUrl) || ''
    if (body?.sourceUrl && !sourceUrl) return fail('来源地址格式非法(需 http/https)')

    let book
    try {
      // 伪静态: 新书分配数字书号(并发撞号 P2002 重试)
      book = await withBookNumRetry(() =>
        nextBookNum(db).then((num) =>
          db.book.create({
            data: {
              num,
              name,
              author: str(body?.author, 100).trim() || '佚名',
              intro: str(body?.intro, 20_000),
              cover: str(body?.cover, 2000),
              status,
              keywords: str(body?.keywords, 500),
              categoryId,
              sourceUrl,
              // API-19: POST 走 lenient-but-safe —— 仅 'txt' 显式接受, 其余任意值(含 null/undefined
              // 与拼写错的 'TXT'/'db '等)一律回退 'db'(默认存储模式); 与 PUT 的 strict 模式
              // (非 ['db','txt'] 直接 400 拒绝)有意区分: POST 是新建, 默认值兜底更友好;
              // PUT 是编辑, 错值回退会静默改写已有 storageMode, 应当报错让用户感知
              storageMode: body?.storageMode === 'txt' ? 'txt' : 'db',
            },
          }),
        ),
      )
    } catch (e: any) {
      // 修复(y-c): 预检与 create 之间存在微竞态(目标分类恰被并发删除), 外键约束错误
      // 落入 withGuard 变裸 500 —— 转 409 引导刷新重试
      if (e?.code === 'P2003') return fail('分类不存在或已被删除, 请刷新后重试', 409)
      throw e
    }
    return ok(book)
  })
}
