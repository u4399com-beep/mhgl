// ============================================================
// [R27-2-4] PSEO 生成服务(服务端专属: Prisma 写库 + 可选实时下拉词)
//   输入书籍集合(全部/指定) → 每书取关联词(模板族 + 书籍 keywords + BookTag
//   下拉词; 可选 fetchSuggestKeywords 实时拉取, 默认关防刷) → 关键词候选去重
//   (全站 keyword 唯一) → 逐页生成 TDK(composePseoTdk) + matchedBookIds → 落库。
// 纯函数层见 ./pseo; 管理端 API 见 src/app/api/admin/pseo。
// ⚠️ 仅限服务端导入(含 fetcher 链)。
// ============================================================
import { db } from '@/lib/db'
import { composePseoTdk } from './seo-tpl'
import { fetchSuggestKeywords, mergeSuggestWords } from './crawl/suggest'
import {
  keywordFromSuggestWord,
  normalizeKeyword,
  pseoSlugOf,
  pickMatchedBookIds,
  templateKeywordsOf,
  PSEO_RUN_LIMIT,
} from './pseo'

/** Setting 表 key: 采集入库后自动生成本书 PSEO 页(可选轻量钩子, 默认 '0') */
const PSEO_AUTO_SETTING_KEY = 'pseoAutoGenerate'
/** 每书默认页数上限 / 钳制范围 */
const PER_BOOK_DEFAULT = 10
const PER_BOOK_MIN = 1
const PER_BOOK_MAX = 30
/** 实时拉词模式最多覆盖书籍数(外部搜索引擎防刷; 超出部分仅用库内词) */
const LIVE_BOOKS_MAX = 50
/** 单次全量生成的书籍数上限 */
const ALL_BOOKS_MAX = 500
/** 每书累计页数硬顶(跨多次生成; 防重复点击/标签增长致单书页数无限膨胀) */
const PER_BOOK_TOTAL_MAX = 30
/** 书籍分片并发(关键词组装为纯 CPU + 可选网络, 小分片控内存) */
const BOOK_CHUNK = 8
/** slug P2002 重试次数(附随机熵) */
const SLUG_RETRIES = 3

interface PseoGenerateInput {
  /** 指定书籍 id 列表(与 all 二选一; 都空 = 全部) */
  bookIds?: string[]
  all?: boolean
  /** 实时调用搜索引擎下拉词(默认 false, 只用库内已存词, 防刷) */
  useLiveSuggest?: boolean
  /** 每书生成页数上限 */
  perBook?: number
}

interface PseoGenerateResult {
  generated: number
  skippedExisting: number
  booksScanned: number
  liveBooks: number
  cappedByRunLimit: boolean
}

export interface PseoStats {
  total: number
  active: number
  disabled: number
  sourceTemplate: number
  sourceSuggest: number
  booksCovered: number
  sitesEnabled: number
}

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/** 站点兜底链(默认启用站 → 第一个启用站; 无启用站 null) — 与 [...slug] resolveMetaSite 同口径的生成期版本 */
async function defaultPseoSite(): Promise<{ id: string; name: string } | null> {
  return (
    (await db.site.findFirst({
      where: { isDefault: true, status: { not: false } },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    })) ??
    (await db.site.findFirst({
      where: { status: { not: false } },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    })) ??
    null
  )
}

/** 自动生成开关(Setting.pseoAutoGenerate == '1'; 可选 runner 钩子读取) */
export async function pseoAutoEnabled(): Promise<boolean> {
  try {
    const row = await db.setting.findUnique({ where: { key: PSEO_AUTO_SETTING_KEY }, select: { value: true } })
    return (row?.value || '').trim() === '1'
  } catch {
    return false
  }
}

/**
 * 单本书同步生成 PSEO 页(可选轻量钩子入口: runner.ts 在 mergeSuggestWords 落库后,
 * 若 pseoAutoEnabled() 则 generateForBook(bookId, 5); try/catch 包裹不影响采集主链)。
 */
export async function generateForBook(bookId: string, perBook = 5): Promise<number> {
  const r = await generatePseoPages({ bookIds: [bookId], perBook, useLiveSuggest: false })
  return r.generated
}

// ---------------- 主入口 ----------------

export async function generatePseoPages(input: PseoGenerateInput): Promise<PseoGenerateResult> {
  const perBook = clampInt(input.perBook, PER_BOOK_DEFAULT, PER_BOOK_MIN, PER_BOOK_MAX)
  const useLive = !!input.useLiveSuggest

  // 1) 书籍集合
  const ids = (Array.isArray(input.bookIds) ? input.bookIds : [])
    .filter((x) => typeof x === 'string' && x)
    .slice(0, 200)
  const books =
    ids.length > 0
      ? await db.book.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, author: true, keywords: true, categoryId: true, wordCount: true, category: { select: { name: true } } },
        })
      : await db.book.findMany({
          orderBy: [{ wordCount: 'desc' }, { updatedAt: 'desc' }],
          take: ALL_BOOKS_MAX,
          select: { id: true, name: true, author: true, keywords: true, categoryId: true, wordCount: true, category: { select: { name: true } } },
        })
  const usable = books.filter((b) => (b.name || '').trim())

  // 2) 库内已存下拉词(BookTag)一次取齐, 按 bookId 分组
  const tagMap = new Map<string, string[]>()
  if (usable.length > 0) {
    const tags = await db.bookTag.findMany({
      where: { bookId: { in: usable.map((b) => b.id) } },
      select: { bookId: true, tag: true },
    })
    for (const t of tags) {
      const arr = tagMap.get(t.bookId) || []
      arr.push(t.tag)
      tagMap.set(t.bookId, arr)
    }
  }

  // 3) 既有关键词集合(全站唯一约束的生成前快查, 少走 P2002)
  const existingKeywords = new Set(
    (await db.pseoPage.findMany({ select: { keyword: true } })).map((r) => r.keyword),
  )
  const seenKeywords = new Set<string>(existingKeywords)

  // 3b) 每书已有页数(PER_BOOK_TOTAL_MAX 跨次累计上限)
  const perBookCount = new Map<string, number>()
  if (usable.length > 0) {
    const grouped = await db.pseoPage.groupBy({
      by: ['primaryBookId'],
      where: { primaryBookId: { in: usable.map((b) => b.id) } },
      _count: { _all: true },
    })
    for (const g of grouped) {
      if (g.primaryBookId) perBookCount.set(g.primaryBookId, g._count._all)
    }
  }

  // 4) 相关书池(同分类优先 + 字数榜补位; 页面非 thin content ≥3 本)
  const pool = await db.book.findMany({
    orderBy: { wordCount: 'desc' },
    take: 100,
    select: { id: true, categoryId: true, wordCount: true },
  })

  // 5) 站名(生成期 TDK 用)
  const site = await defaultPseoSite()
  const sitename = site?.name || '小说站'

  let generated = 0
  let skippedExisting = 0
  let liveBooks = 0
  let capped = false

  for (let i = 0; i < usable.length; i += BOOK_CHUNK) {
    if (generated >= PSEO_RUN_LIMIT) {
      capped = true
      break
    }
    const chunk = usable.slice(i, i + BOOK_CHUNK)
    // 实时拉词: 分片内串行(外部引擎礼貌抓取; LIVE_BOOKS_MAX 硬顶)
    const liveWords = new Map<string, string[]>()
    if (useLive) {
      for (const b of chunk) {
        if (liveBooks >= LIVE_BOOKS_MAX) break
        liveBooks++
        try {
          const sug = await fetchSuggestKeywords(b.name)
          liveWords.set(b.id, mergeSuggestWords(b.name, sug, 15))
        } catch {
          /* 单书实时拉词失败不影响整轮 */
        }
      }
    }

    const rows = chunk.map((b) => {
      const meta = { name: b.name, author: b.author, category: b.category?.name || null }
      // 关键词候选: 模板族 → 实时下拉词 → 书籍 keywords → BookTag(生成序即优先级)
      const cands: { keyword: string; source: 'template' | 'suggest' }[] = []
      for (const k of templateKeywordsOf(meta)) cands.push({ keyword: k, source: 'template' })
      for (const w of liveWords.get(b.id) || []) {
        const k = keywordFromSuggestWord(meta, w)
        if (k) cands.push({ keyword: k, source: 'suggest' })
      }
      for (const w of String(b.keywords || '').split(/[,，、;；]/)) {
        const k = keywordFromSuggestWord(meta, w)
        if (k) cands.push({ keyword: k, source: 'suggest' })
      }
      for (const w of tagMap.get(b.id) || []) {
        const k = keywordFromSuggestWord(meta, w)
        if (k) cands.push({ keyword: k, source: 'suggest' })
      }
      // 去重 + 每书限量(本次 perBook, 且受跨次累计 PER_BOOK_TOTAL_MAX 硬顶; 书名裸词跳过:
      // 已有书籍页承接, 避免内耗)
      const remainingTotal = Math.max(0, PER_BOOK_TOTAL_MAX - (perBookCount.get(b.id) || 0))
      const runQuota = Math.min(perBook, remainingTotal)
      const bookSeen = new Set<string>()
      const picked: { keyword: string; source: 'template' | 'suggest' }[] = []
      for (const c of cands) {
        if (picked.length >= runQuota) break
        const k = normalizeKeyword(c.keyword)
        if (!k || k === normalizeKeyword(b.name) || bookSeen.has(k) || seenKeywords.has(k)) continue
        bookSeen.add(k)
        seenKeywords.add(k)
        picked.push({ keyword: k, source: c.source })
      }
      const matched = pickMatchedBookIds(b, pool)
      return { book: b, picked, matched }
    })

    for (const { book: b, picked, matched } of rows) {
      for (const c of picked) {
        if (generated >= PSEO_RUN_LIMIT) {
          capped = true
          break
        }
        const created = await createPseoRow({
          keyword: c.keyword,
          source: c.source,
          book: { id: b.id, name: b.name, author: b.author },
          matched,
          sitename,
          siteId: site?.id || null,
        })
        if (created) generated++
        else skippedExisting++
      }
      if (capped) break
    }
  }

  return { generated, skippedExisting, booksScanned: usable.length, liveBooks, cappedByRunLimit: capped }
}

/** 单行落库: keyword 冲突 → false(统计 skipped); slug 冲突 → 附随机熵重试 */
async function createPseoRow(args: {
  keyword: string
  source: 'template' | 'suggest'
  book: { id: string; name: string; author: string }
  matched: string[]
  sitename: string
  siteId: string | null
}): Promise<boolean> {
  // 生成期 TDK 固化(composePseoTdk: title=干净标题兼 H1; 站名后缀由 SSR 按站群追加)
  const tdk = composePseoTdk({
    keyword: args.keyword,
    bookname: args.book.name,
    author: args.book.author,
    bookCount: args.matched.length,
    sitename: args.sitename,
  })
  let slug = pseoSlugOf(args.keyword)
  for (let attempt = 0; attempt <= SLUG_RETRIES; attempt++) {
    try {
      await db.pseoPage.create({
        data: {
          siteId: args.siteId,
          keyword: args.keyword,
          slug,
          title: tdk.title,
          description: tdk.description,
          keywords: tdk.keywords || '',
          primaryBookId: args.book.id,
          matchedBookIds: JSON.stringify(args.matched),
          status: 'active',
          source: args.source,
        },
      })
      return true
    } catch (e) {
      const code = (e as { code?: string })?.code
      if (code !== 'P2002') return false
      // meta.target 含 'slug' → slug 撞车(关键词不同但哈希/清洗同形), 附随机熵重试;
      // 其余(keyword 唯一) → 既有关键词, 视为跳过
      const target = ((e as { meta?: { target?: unknown } }).meta?.target ?? '') as string | string[]
      const targetStr = Array.isArray(target) ? target.join(',') : String(target)
      if (!targetStr.includes('slug')) return false
      slug = `${pseoSlugOf(args.keyword)}${Math.random().toString(36).slice(2, 2 + 4)}`
    }
  }
  return false
}

// ---------------- 读取侧(API 消费) ----------------

export async function getPseoStats(): Promise<PseoStats> {
  const [total, active, sourceTemplate, booksCovered, sitesEnabled] = await Promise.all([
    db.pseoPage.count(),
    db.pseoPage.count({ where: { status: 'active' } }),
    db.pseoPage.count({ where: { source: 'template' } }),
    db.pseoPage.findMany({ where: { primaryBookId: { not: null } }, select: { primaryBookId: true }, distinct: ['primaryBookId'] }),
    db.site.count({ where: { status: { not: false } } }),
  ])
  return {
    total,
    active,
    disabled: total - active,
    sourceTemplate,
    sourceSuggest: total - sourceTemplate,
    booksCovered: booksCovered.length,
    sitesEnabled,
  }
}

export async function listPseoPages(page: number, size: number) {
  const page0 = Math.max(1, Math.trunc(page) || 1)
  const size0 = Math.min(50, Math.max(1, Math.trunc(size) || 20))
  const [rows, total] = await Promise.all([
    db.pseoPage.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page0 - 1) * size0,
      take: size0,
      select: {
        id: true, keyword: true, slug: true, title: true, status: true, source: true,
        createdAt: true, primaryBookId: true,
        primaryBook: { select: { name: true, author: true } },
      },
    }),
    db.pseoPage.count(),
  ])
  return { rows, total, page: page0, size: size0, pages: Math.max(1, Math.ceil(total / size0)) }
}
