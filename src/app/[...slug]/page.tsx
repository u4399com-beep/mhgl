// ============================================================
// 伪静态路由(catch-all) — /book/*.html / /read/* 直达与刷新
// 服务端宽容解析(pseudostatic-server.resolvePrettyPath):
//   token → 真实 bookId/chapterId → 复用 PublicSite 渲染(与查询串路由同一套 UI/状态机);
//   任何一环解析失败 → notFound(404)。
// query 参数透传: ?site=(站群切换) ?page=(目录翻页) ?theme=(预览覆盖)
// [R21-g-1] generateMetadata SSR 直出 TDK —— 修前本路由无 metadata 导出, SSR 头部
//   只有 layout 默认值, 书籍/章节级 title/description/canonical 要等客户端
//   useSiteSEO 水合后才补上(不执行 JS 的爬虫/分享卡抓不到页面级 TDK)。
//   站点兜底链与 sitemap R15-a1-6 同口径(?site= → 默认站 → 任意启用站)。
// [R27-2-6] PSEO 关键词落地页分支 — /p/{slug}.html → PseoPage 服务端 db 直查 SSR 直出:
//   面包屑/H1=row.title/相关书卡列表(matchedBookIds)/说明文案/站内内链(书页/目录/分类);
//   metadata 输出 title(+站名后缀)/description/keywords/canonical(?site= 同口径);
//   页面未命中或非 active → notFound。该分支优先于 book/read 解析(/p/ 不属其命名空间)。
// ============================================================
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import * as cheerio from 'cheerio'
import PrettyPublicShell from '@/components/public/PrettyPublicShell'
import { resolvePrettyPath, getPseudoPreset } from '@/lib/pseudostatic-server'
import { buildBookPath, type PseudoPreset } from '@/lib/pseudostatic'
import { composeBookTdk, composeTocTdk, composeChapterTdk } from '@/lib/seo-tpl'
import { getSeoTemplates } from '@/lib/seo-tpl-server'
import { db } from '@/lib/db'
import { sliceCodePoints } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// [R21-g-1] HTML/实体文本 → 折叠空白纯文本: 先剥 script/style 整段(含内容)与其余标签
// (标签→空格, 与客户端 ReadView 摘要同口径), 再经 cheerio 解析器完成实体解码
// (&amp;/&lt;/&#x4e2d; 等, 项目无 he/decode-html 依赖, cheerio 已在 deps),
// 与前台 BookView/ReadView 的 TDK 纯文本口径一致(R15-a1-3/4)
function plainText(html: string): string {
  if (!html) return ''
  let stripped = html
  try {
    stripped = stripped
      .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*$/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
    return cheerio
      .load(stripped)
      .root()
      .text()
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
}

// [R21-g-1] 请求 origin(absolute canonical 用) —— 客户端 useSiteSEO 的 canonical
// 同为 origin+path 形态(seo.ts); 经 x-forwarded-* 头兼容反代, 取不到则退回相对路径
async function requestOrigin(): Promise<string | null> {
  try {
    const h = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host')
    if (!host) return null
    const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'http'
    return `${proto}://${host}`
  } catch {
    return null
  }
}

// [R24-4] 站点关键词串(模板引擎 keywords 尾段追加用; 站名自身去重后不再追加)
function siteKeywordsOf(s: { keywords?: string | null; name?: string | null }): string {
  return (s.keywords || '').trim()
}

// ---------------- [R27-2-6] PSEO /p/{slug}.html 分支 ----------------

/** PSEO 路径形态匹配: 返回 slug 段(去 .html 后缀, 已剥查询串); 非 /p/ 路径返回 null */
function matchPseoPath(pathname: string): string | null {
  const p = (pathname || '').split(/[?#]/)[0]
  const m = /^\/p\/(.+?)(?:\.html?)?$/i.exec(p)
  if (!m) return null
  const raw = m[1]
  if (!raw || raw.includes('/') || raw.length > 256) return null
  return raw
}

/**
 * slug 候选: Next 对 catch-all 参数已按段百分号解码; 若直链/外站带 %XX 原文形态
 * (未解码直达), 再尝试一次解码兜底。slug 本身不含 %(生成期已清洗), 仅防双编码链接。
 */
function pseoSlugCandidates(raw: string): string[] {
  const out: string[] = []
  const push = (s?: string) => {
    if (s && s.length <= 256 && !out.includes(s)) out.push(s)
  }
  push(raw)
  if (raw.includes('%')) {
    try {
      push(decodeURIComponent(raw))
    } catch {
      /* 非法编码保留原文 */
    }
  }
  return out
}

/** matchedBookIds(JSON 字符串数组) → 去重 id 列表(脏 JSON 安全) */
function pseoMatchedIds(raw: string): string[] {
  try {
    const v = JSON.parse(raw || '[]')
    if (!Array.isArray(v)) return []
    return v.filter((x): x is string => typeof x === 'string' && !!x)
  } catch {
    return []
  }
}

/** 封面地址(与后台 helpers.coverUrl/前台 coverSrc 同口径: 外链直用, 本地走封面服务) */
function pseoCoverUrl(cover?: string | null): string {
  if (!cover) return ''
  if (/^https?:\/\//i.test(cover)) return cover
  const file = cover.replace(/^covers\//, '').replace(/^\/+/, '')
  return `/api/public/cover?file=${encodeURIComponent(file)}`
}

/** 字数格式化(万缩写; 与 fmtWords 同口径的本地版, 免拉后台 helpers 依赖链) */
function pseoFmtWords(n?: number | null): string {
  const v = Number(n) || 0
  return v < 10000 ? String(v) : `${(v / 10000).toFixed(1)} 万`
}

/** 连载状态文案(PseoBookRow.status: ongoing|completed|unknown) */
function pseoStatusLabel(s?: string | null): string {
  return s === 'completed' ? '已完结' : s === 'ongoing' ? '连载中' : ''
}

/** 查询串/路径书籍链接统一附 ?site= (与 buildViewUrl/canonical 同口径; 回退查询串形态用 & 连接) */
function pseoJoinSite(base: string, siteId: string): string {
  if (!siteId) return base
  return `${base}${base.includes('?') ? '&' : '?'}site=${encodeURIComponent(siteId)}`
}

/** 书籍页链接: 预设可生成伪静态则用之, 否则回退查询串(永不死链) */
function pseoBookHref(b: { id: string; num: number | null }, preset: PseudoPreset, siteId: string): string {
  const path = buildBookPath({ id: b.id, num: b.num }, preset)
  return pseoJoinSite(path || `/?view=book&id=${encodeURIComponent(b.id)}`, siteId)
}

interface PseoBookRow {
  id: string
  num: number | null
  name: string
  author: string
  cover: string
  status: string
  wordCount: number
  latestChapter: string
  intro: string
  categoryId: string | null
  categoryName: string
}

interface PseoLandingRow {
  id: string
  keyword: string
  slug: string
  title: string
  description: string
  keywords: string
  primaryBookId: string | null
  updatedAt: Date
}

/**
 * PSEO 关键词落地页(服务端组件, SSR 直出零客户端水合依赖):
 * 面包屑 → H1(=row.title) → 说明文案(description + 主书简介摘要, 防 thin content)
 * → 相关书籍卡列表(matchedBookIds 顺序, 主书在最前) → 站内内链(书籍页/目录页/分类页)。
 */
function PseoLanding({
  row,
  books,
  siteId,
  siteName,
  preset,
}: {
  row: PseoLandingRow
  books: PseoBookRow[]
  siteId: string
  siteName: string
  preset: PseudoPreset
}) {
  const primary = books.find((b) => b.id === row.primaryBookId) || books[0] || null
  const intro = primary?.intro ? sliceCodePoints(primary.intro.replace(/\s+/g, ' ').trim(), 150) : ''
  const statusText = primary ? pseoStatusLabel(primary.status) : ''
  const desc =
    (row.description || '').trim() ||
    `${row.keyword} — ${siteName || '本站'}聚合相关小说资源，提供全文免费在线阅读。`
  return (
    // [R27-6-fix] min-h-screen flex 列布局: 内容不足一屏时 footer 吸底(sticky footer 规范), 超出时自然下推
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6">
      <div className="min-w-0 flex-1">
      {/* 面包屑 */}
      <nav aria-label="面包屑" className="mb-6 text-xs text-zinc-500">
        <a href={pseoJoinSite('/', siteId)} className="transition-colors hover:text-zinc-800">首页</a>
        <span className="mx-1.5">/</span>
        <span className="text-zinc-400">专题关键词</span>
        <span className="mx-1.5">/</span>
        <span className="text-zinc-700" aria-current="page">{row.title}</span>
      </nav>

      {/* H1 = 标题(生成期模板产出; <title> 为同值 + 站名后缀) */}
      <h1 className="text-2xl font-black leading-snug tracking-wide text-zinc-900 sm:text-3xl">{row.title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-1 font-medium text-violet-700 ring-1 ring-violet-200">关键词: {row.keyword}</span>
        {siteName ? <span>{siteName}</span> : null}
        <span>更新于 {row.updatedAt.toISOString().slice(0, 10)}</span>
      </div>

      {/* 说明文案(防 thin content 主体之一) */}
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm" aria-label="页面说明">
        <p className="text-sm leading-relaxed text-zinc-600">{desc}</p>
        {primary ? (
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            主打作品《{primary.name}》由 {primary.author} 创作，{statusText ? `${statusText}，` : ''}
            全文约 {pseoFmtWords(primary.wordCount)} 字{primary.latestChapter ? `，最新章节「${primary.latestChapter}」` : ''}。
            {intro ? ` 简介：${intro}` : ''}
          </p>
        ) : null}
      </section>

      {/* 相关书籍卡片(matchedBookIds; 主书最前) */}
      <section className="mt-8" aria-label="相关书籍">
        <h2 className="mb-4 text-base font-bold text-zinc-900">相关书籍推荐（{books.length}）</h2>
        {books.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">暂无相关书籍数据</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {books.map((b, i) => (
              <article key={b.id} className="flex gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                <a
                  href={pseoBookHref(b, preset, siteId)}
                  className="h-[120px] w-[90px] shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100"
                  aria-label={`查看《${b.name}》详情`}
                >
                  {pseoCoverUrl(b.cover) ? (
                    <img src={pseoCoverUrl(b.cover)} alt={`《${b.name}》封面`} className="h-full w-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] leading-tight text-zinc-400">{b.name}</span>
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-zinc-900">
                    <a href={pseoBookHref(b, preset, siteId)} className="transition-colors hover:text-violet-700">《{b.name}》</a>
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    {b.author}
                    {b.categoryName ? ` · ${b.categoryName}` : ''}
                    {pseoStatusLabel(b.status) ? ` · ${pseoStatusLabel(b.status)}` : ''}
                    {' · '}
                    {pseoFmtWords(b.wordCount)}字
                  </p>
                  {b.intro ? <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">{sliceCodePoints(b.intro.replace(/\s+/g, ' ').trim(), 76)}</p> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <a href={pseoBookHref(b, preset, siteId)} className="inline-flex rounded-md bg-violet-600 px-2.5 py-1 font-medium text-white transition-colors hover:bg-violet-700">书籍页</a>
                    <a href={pseoJoinSite(`/?view=toc&id=${encodeURIComponent(b.id)}`, siteId)} className="inline-flex rounded-md border border-zinc-300 px-2.5 py-1 text-zinc-600 transition-colors hover:border-violet-400 hover:text-violet-700">章节目录</a>
                    {b.categoryId ? (
                      <a href={pseoJoinSite(`/?view=category&cat=${encodeURIComponent(b.categoryId)}`, siteId)} className="inline-flex rounded-md border border-zinc-300 px-2.5 py-1 text-zinc-600 transition-colors hover:border-violet-400 hover:text-violet-700">{b.categoryName || '分类'}专区</a>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      </div>

      {/* 站内内链(全站入口; 文字链形态利于爬虫顺藤) */}
      <footer className="mt-auto border-t border-zinc-200 pt-5 text-xs text-zinc-500">
        <p className="mb-2 font-medium text-zinc-600">站内导航</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <a href={pseoJoinSite('/', siteId)} className="transition-colors hover:text-violet-700">网站首页</a>
          <a href={pseoJoinSite('/?view=search', siteId)} className="transition-colors hover:text-violet-700">书库搜索</a>
          {books.slice(0, 6).map((b) => (
            <a key={`link-${b.id}`} href={pseoBookHref(b, preset, siteId)} className="transition-colors hover:text-violet-700">{b.name}全文阅读</a>
          ))}
        </div>
      </footer>
    </div>
  )
}

// [R21-g-1] 站点兜底链: 显式 ?site= → 默认站 → 任意启用站(与 sitemap R15-a1-6 同口径;
// 与前台 PublicSite ii-a 修复一致, 停用站不进兜底链)
async function resolveMetaSite(siteId?: string) {
  const select = { id: true, name: true, status: true, keywords: true } as const // [R24-4] +keywords: TDK 模板尾段追加
  if (siteId) {
    const s = await db.site.findUnique({ where: { id: siteId }, select })
    if (s && s.status !== false) return s
  }
  return (
    (await db.site.findFirst({
      where: { isDefault: true, status: { not: false } },
      select,
      orderBy: { createdAt: 'asc' },
    })) ??
    (await db.site.findFirst({
      where: { status: { not: false } },
      select,
      orderBy: { createdAt: 'asc' },
    }))
  )
}

// [R21-g-1] SSR metadata: 解析失败返回空对象(404 由页面渲染 notFound() 负责),
// 任何一环(查库/编码)异常同样降级为极简 metadata, 永不 throw 阻塞渲染
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<Metadata> {
  try {
    const { slug } = await params
    const sp = await searchParams
    const pathname = `/${(slug || []).join('/')}`
    const first = (k: string): string | undefined => {
      const v = sp[k]
      return (Array.isArray(v) ? v[0] : v) || undefined
    }
    const pageN = Number(first('page')) || 1

    // [R27-2-6] PSEO 分支: /p/{slug}.html → PseoPage TDK 直出。
    //   title = row.title(干净标题) + 「 - 站名」后缀(与书籍页 composeBookTdk 尾段同口径);
    //   description/keywords 为生成期固化值; canonical 恒带 ?site=(与 book/read 同规范)。
    //   任何一环异常降级为空对象(404 由页面分支 notFound() 负责), 永不 throw 阻塞渲染。
    const pseoRaw = matchPseoPath(pathname)
    if (pseoRaw !== null) {
      // [R30-5-3] 三者入参互不依赖 → 并行(原 findFirst→resolveMetaSite→requestOrigin 串行链; PSEO 页为 SEO 爬虫热点路径, TTD 直接受益)
      const [row, site, origin] = await Promise.all([
        db.pseoPage.findFirst({
          where: { slug: { in: pseoSlugCandidates(pseoRaw) }, status: 'active' },
          select: { title: true, description: true, keywords: true, keyword: true },
        }),
        resolveMetaSite(first('site')),
        requestOrigin(),
      ])
      if (!row) return {}
      const siteName = plainText(site?.name || '')
      const heading = row.title || row.keyword
      const title = siteName ? `${heading} - ${siteName}` : heading
      return buildMetadata({
        title: title || '专题页',
        description: row.description || title,
        keywords: row.keywords || undefined,
        siteName,
        canonicalPath: site ? `${pathname}?site=${encodeURIComponent(site.id)}` : pathname,
        origin,
        ogType: 'website',
      })
    }

    const resolved = await resolvePrettyPath(pathname)
    if (!resolved) return {}
    // [R30-5-3] site/origin 解析与后继分支的数据查询互不依赖, 并行拿齐(原三段串行)
    const [site, origin] = await Promise.all([resolveMetaSite(first('site')), requestOrigin()])
    if (!site) return {}

    // canonical 恒带 site 查询参数(与前台各视图 canonical/sitemap loc 同口径);
    // prettyPath 即当前路径本身, 目录翻页 ?page= 与预览 ?theme= 不进 canonical
    const canonicalPath = `${pathname}?site=${encodeURIComponent(site.id)}`

    if (resolved.view === 'read' && resolved.chapterId) {
      // [R30-5-3] 章节查询与 SEO 模板读取互不依赖 → 并行
      const [chapter, tpl] = await Promise.all([
        db.chapter.findUnique({
          where: { id: resolved.chapterId },
          select: {
            title: true, content: true, idx: true,
            book: { select: { name: true, author: true, category: { select: { name: true } }, status: true, keywords: true } },
          },
        }),
        getSeoTemplates(),
      ])
      if (!chapter) return {}
      const tdk = composeChapterTdk(
        {
          bookname: plainText(chapter.book?.name || ''),
          author: plainText(chapter.book?.author || ''),
          category: plainText(chapter.book?.category?.name || ''),
          status: chapter.book?.status || '',
          sitename: plainText(site.name),
          chaptername: plainText(chapter.title),
          chapterno: chapter.idx,
          excerpt: sliceCodePoints(plainText(chapter.content || ''), 110),
          siteKeywords: siteKeywordsOf(site),
        },
        tpl,
      )
      return buildMetadata({
        title: tdk.title,
        description: tdk.description,
        keywords: tdk.keywords,
        siteName: plainText(site.name),
        canonicalPath,
        origin,
        ogType: 'article',
      })
    }

    // [R30-5-3] 书籍查询与 SEO 模板读取互不依赖 → 并行
    const [book, tpl] = await Promise.all([
      db.book.findUnique({
        where: { id: resolved.bookId },
        select: {
          name: true, author: true, intro: true, status: true, keywords: true,
          category: { select: { name: true } },
          _count: { select: { chapters: true } },
        },
      }),
      getSeoTemplates(),
    ])
    if (!book) return {}
    // [R24-4] 书籍页 / 章节目录页自动 TDK: 目录翻页(?page>1)用目录模板区分, 避免同书多 URL 标题撞车
    const baseVars = {
      bookname: plainText(book.name),
      author: plainText(book.author),
      category: plainText(book.category?.name || ''),
      status: book.status || '',
      sitename: plainText(site.name),
      intro: plainText(book.intro),
      chapterCount: book._count?.chapters ?? 0,
      siteKeywords: siteKeywordsOf(site),
    }
    const tdk = pageN > 1 ? composeTocTdk(baseVars, tpl) : composeBookTdk(baseVars, tpl)
    return buildMetadata({
      title: tdk.title,
      description: tdk.description,
      keywords: tdk.keywords,
      siteName: plainText(site.name),
      canonicalPath,
      origin,
      ogType: 'website',
    })
  } catch (e) {
    // [R21-g-3] 静默降级不留痕会掩盖配置/数据异常(本轮排查实证), 降级时至少留一行服务端日志
    console.error('[pretty-metadata] SSR 元数据降级为空:', (e as Error)?.message ?? e)
    return {}
  }
}

// [R21-g-1] metadata 组装(openGraph 与 title/description 同值; metadataBase 供
// Next 把相对 canonical 解析为绝对地址, 与客户端 origin+path 形态一致)
// [R24-4] +keywords: 自动 SEO 关键词(模板引擎产出)SSR 直出 —— 爬虫不执行 JS 也能抓全 TDK
function buildMetadata({
  title,
  description,
  keywords,
  siteName,
  canonicalPath,
  origin,
  ogType,
}: {
  title: string
  description: string
  keywords?: string
  siteName: string
  canonicalPath: string
  origin: string | null
  ogType: 'website' | 'article'
}): Metadata {
  return {
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    title,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical: canonicalPath },
    openGraph: { title, description, type: ogType, siteName },
  }
}

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

  // [R27-2-6] PSEO 分支优先(/p/ 命名空间与 book/read 不相交): db 直查 → SSR 直出落地页;
  //   未命中或非 active → notFound。说明文案 + ≥1 本相关书卡(matchedBookIds 生成期保底
  //   拼到 5 本)保证非 thin content。
  const pseoRaw = matchPseoPath(pathname)
  if (pseoRaw !== null) {
    const row = await db.pseoPage.findFirst({
      where: { slug: { in: pseoSlugCandidates(pseoRaw) }, status: 'active' },
    })
    if (!row) notFound()
    const first = (k: string): string | undefined => {
      const v = sp[k]
      return (Array.isArray(v) ? v[0] : v) || undefined
    }
    const site = await resolveMetaSite(first('site'))
    const siteId = site?.id || row.siteId || ''
    const siteName = site?.name ? plainText(site.name) : ''
    const preset = await getPseudoPreset()
    const ids = pseoMatchedIds(row.matchedBookIds)
    const found = ids.length
      ? await db.book.findMany({
          where: { id: { in: ids } },
          select: {
            id: true, num: true, name: true, author: true, cover: true, status: true,
            wordCount: true, latestChapter: true, intro: true, categoryId: true,
            category: { select: { name: true } },
          },
        })
      : []
    // 按 matchedBookIds 顺序渲染(主书最前), 库内已删书自动排除
    const books: PseoBookRow[] = ids
      .map((id) => found.find((b) => b.id === id))
      .filter((b): b is NonNullable<typeof b> => !!b)
      .map((b) => ({ ...b, categoryName: b.category?.name || '' }))
    return (
      <div className="min-h-screen bg-zinc-50">
        <PseoLanding
          row={{
            id: row.id,
            keyword: row.keyword,
            slug: row.slug,
            title: row.title,
            description: row.description,
            keywords: row.keywords,
            primaryBookId: row.primaryBookId,
            updatedAt: row.updatedAt,
          }}
          books={books}
          siteId={siteId}
          siteName={siteName}
          preset={preset}
        />
      </div>
    )
  }

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
