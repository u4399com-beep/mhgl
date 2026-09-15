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
// ============================================================
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import * as cheerio from 'cheerio'
import PrettyPublicShell from '@/components/public/PrettyPublicShell'
import { resolvePrettyPath } from '@/lib/pseudostatic-server'
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

    const resolved = await resolvePrettyPath(pathname)
    if (!resolved) return {}
    const site = await resolveMetaSite(first('site'))
    if (!site) return {}

    // canonical 恒带 site 查询参数(与前台各视图 canonical/sitemap loc 同口径);
    // prettyPath 即当前路径本身, 目录翻页 ?page= 与预览 ?theme= 不进 canonical
    const canonicalPath = `${pathname}?site=${encodeURIComponent(site.id)}`
    const origin = await requestOrigin()

    if (resolved.view === 'read' && resolved.chapterId) {
      const chapter = await db.chapter.findUnique({
        where: { id: resolved.chapterId },
        select: {
          title: true, content: true, idx: true,
          book: { select: { name: true, author: true, category: { select: { name: true } }, status: true, keywords: true } },
        },
      })
      if (!chapter) return {}
      // [R24-4] 章节页自动 TDK —— 模板引擎单出处(默认模板/管理端覆盖均走 Setting.seoTemplates)
      const tpl = await getSeoTemplates()
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

    const book = await db.book.findUnique({
      where: { id: resolved.bookId },
      select: {
        name: true, author: true, intro: true, status: true, keywords: true,
        category: { select: { name: true } },
        _count: { select: { chapters: true } },
      },
    })
    if (!book) return {}
    // [R24-4] 书籍页 / 章节目录页自动 TDK: 目录翻页(?page>1)用目录模板区分, 避免同书多 URL 标题撞车
    const tpl = await getSeoTemplates()
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
