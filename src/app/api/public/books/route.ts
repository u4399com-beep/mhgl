// 前台书籍列表 — 支持站群偏移量/分类/搜索/分页; [R27-5b-M4] +ids 批量直查(我的书架去 N+1)
import { db } from '@/lib/db'
import { ok } from '@/lib/api'
import { withGuard, str, likeSafe, clampInt } from '../../_lib/http'

/** 单本书公开 DTO(与列表/批量两出口共用, 字段口径不变) */
function toBookDto(b: {
  id: string
  num: number | null
  name: string
  author: string
  intro: string | null
  cover: string | null
  status: string
  wordCount: number
  latestChapter: string | null
  categoryId: string | null
  updatedAt: Date
  category: { name: string } | null
}) {
  return {
    id: b.id,
    // 伪静态数字书号: 前台据此生成 /book/{num}.html 链接
    num: b.num,
    name: b.name,
    author: b.author,
    intro: (b.intro || '').slice(0, 120),
    cover: b.cover,
    status: b.status,
    wordCount: b.wordCount,
    latestChapter: b.latestChapter,
    category: b.category?.name || '未分类',
    categoryId: b.categoryId,
    updatedAt: b.updatedAt,
  }
}

export async function GET(req: Request) {
  return withGuard(async () => {
    const url = new URL(req.url)
    const siteId = str(url.searchParams.get('site'), 64).trim()
    const q = likeSafe(url.searchParams.get('q'))
    const cat = str(url.searchParams.get('cat'), 64).trim()
    const status = str(url.searchParams.get('status'), 20).trim()
    const sort = str(url.searchParams.get('sort'), 20).trim() || 'latest'
    // [R27-5b-M4] 批量 ids 直查(我的书架 N+1 修复): 逗号分隔 id 列表(≤50, 字符集白名单,
    // 去重)。命中时忽略分页/站群偏移/排序, 一次 inList 取齐 —— 修前 HistoryView 挂载即
    // 并发最多 50 个 /api/public/book(每请求 book+chapters+tags 三类查询)扇出风暴
    const idsParam = str(url.searchParams.get('ids'), 64 * 50 + 64).trim()
    const ids = idsParam
      ? [...new Set(idsParam.split(',').map((s) => s.trim()).filter((s) => /^[a-zA-Z0-9]{8,64}$/.test(s)))].slice(0, 50)
      : []
    if (ids.length) {
      const rows = await db.book.findMany({
        where: { id: { in: ids } },
        take: ids.length,
        include: { category: true },
      })
      // 按传入顺序返回(调用方按 bookId 索引消费, 顺序仅兜底可读性)
      const byId = new Map(rows.map((b) => [b.id, b]))
      const books = ids.flatMap((id) => {
        const b = byId.get(id)
        return b ? [toBookDto(b)] : []
      })
      return ok({ total: books.length, page: 1, size: ids.length, books })
    }
    // 分页边界: page≥1 / size 1~60, 防 skip/take 负数导致 Prisma 500
    const page = clampInt(url.searchParams.get('page'), 1, 1, 1_000_000)
    const size = clampInt(url.searchParams.get('size'), 24, 1, 60)

    // 站群: 偏移量 + 可选域名 (站点不存在时 offset 保持 0)
    let offset = 0
    if (siteId) {
      const site = await db.site.findUnique({ where: { id: siteId } })
      if (site) offset = Math.max(0, site.offset)
    }

    const where: Record<string, unknown> = {}
    if (q) where.OR = [{ name: { contains: q } }, { author: { contains: q } }, { keywords: { contains: q } }]
    // [R47-1] 分类锚双形态: ①常规 categoryId 精确直查; ②前端分类稀薄兜底合成的 `cat:{name}`
    //  锚点(fetchCategories 兜底, DB 分类<8 时导航才可见)按【分类名】命中 —— 采集跑起来后
    //  分类合并引擎建出同名分类即自然接上; 全无同名分类时空结果(合法空态, 非报错)
    if (cat) {
      if (cat.startsWith('cat:')) {
        let name = cat.slice(4)
        try { name = decodeURIComponent(name) } catch { /* 已解码形态原样 */ }
        const byName = await db.category.findFirst({ where: { name }, select: { id: true } })
        where.categoryId = byName?.id ?? '__no_match__'
      } else {
        where.categoryId = cat
      }
    }
    // 状态白名单: 非法值忽略(不报错), 防任意字符串进查询
    if (status && ['unknown', 'ongoing', 'completed'].includes(status)) where.status = status

    // 排序白名单(防 orderBy 注入任意字段); [R28-0] +new(新书榜, createdAt desc) 供排行榜页型
    const orderBy =
      sort === 'words'
        ? { wordCount: 'desc' as const }
        : sort === 'new'
          ? { createdAt: 'desc' as const }
          : { updatedAt: 'desc' as const }

    // 站群偏移量仅在"无筛选"浏览时生效(首页书库翻页轮换);
    // 带 cat(分类) / q(搜索) / status 筛选时忽略 offset —— 否则会跳过该分类/搜索结果内前 offset 条
    // (bug 修复: 例 dewew 站点 offset=4 + 仙侠分类仅 1 本 → skip 4 跳过唯一那本 → 空结果)
    const hasFilter = !!(q || cat || status)
    const effectiveOffset = hasFilter ? 0 : offset

    // API-7: 公共路由 skip 上限 —— 修前 page 可达 1_000_000, 配合 size=60 形成 skip=60_000_000
    // 大跳过触发 SQLite OFFSET 全表扫描/内存膨胀(DoS); 上限 10000 即 50 万行表(size=50)的合理边界
    const requestedSkip = effectiveOffset + (page - 1) * size
    const effectiveSkip = Math.min(requestedSkip, 10000)
    const skipCapped = requestedSkip > 10000

    const [total, books] = await Promise.all([
      db.book.count({ where }),
      db.book.findMany({
        where,
        orderBy,
        skip: effectiveSkip,
        take: size,
        include: { category: true },
      }),
    ])

    return ok({
      total: Math.max(0, total - effectiveOffset),
      page,
      size,
      // 超出 skip 上限时返回空数组而非报错(公共路由, 容错优先), 通过 note 字段提示上游
      books: skipCapped
        ? []
        : books.map(toBookDto),
      note: skipCapped ? '已超出最大可分页深度(10000), 请使用搜索或分类筛选缩小范围' : undefined,
    })
  })
}
