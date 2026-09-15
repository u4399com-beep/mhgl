// ============================================================
// [R15-a2] 站点 TDK 自动生成 — POST /api/admin/sites/auto-tdk
// 按站点名/域名 + 书库实况(分类排行/书籍数/章节数)组合 SEO 三件套。
// 纯组合不落库 —— 管理端「站点编辑 → 自动生成 TDK」按钮消费, 生成后
// 填入表单供用户预览手改再保存; 新建站点(无 siteId)同样可用。
// ============================================================
import { db } from '@/lib/db'
import { ok, fail, readBody } from '@/lib/api'
import { withGuard, str } from '../../../_lib/http'

/** 按码点截断(与前台 sliceCodePoints 同口径, 防 UTF-16 代理对被劈半) */
function clampCodePoints(s: string, max: number): string {
  const pts = Array.from(s)
  return pts.length <= max ? s : pts.slice(0, max).join('')
}

export interface AutoTdk {
  title: string
  description: string
  keywords: string
}

/** TDK 组合(导出便于复用; 输入均已消毒) */
export function composeSiteTdk(
  name: string,
  domain: string,
  catNames: string[],
  bookCount: number,
  chapterCount: number,
): AutoTdk {
  const top = catNames.slice(0, 3)
  const catText = top.join('、')
  // T: 有分类 → 「站名｜玄幻、都市、言情小说免费阅读」; 无 → 站名 + 通用价值词
  const title = clampCodePoints(
    catText ? `${name}｜${catText}小说免费阅读` : `${name} - 全本小说免费在线阅读`,
    40,
  )
  // D: 站名(域名) + 类型短语 + 收录量 + 更新/下载价值点, ≤160 码点
  const catPhrase = top.length ? `${catText}等类型小说` : '各类精品小说'
  const chapterPhrase = chapterCount > 0 ? `、${chapterCount} 章节` : ''
  const rawDesc =
    `${name}(${domain || '本站'})提供${catPhrase}免费在线阅读, 现已收录 ${bookCount} 部作品${chapterPhrase}, ` +
    `每日持续更新, 支持全本 TXT 打包下载。`
  const description = clampCodePoints(rawDesc, 160)
  // K: 分类 top5 + 通用词 + 站名, 去重保序 ≤200 码点
  const kws = [...catNames.slice(0, 5), '免费小说', '全本小说', '小说大全', '小说下载', name]
  const seen = new Set<string>()
  const keywords = clampCodePoints(
    kws
      .map((k) => k.trim())
      .filter((k) => {
        if (!k || seen.has(k)) return false
        seen.add(k)
        return true
      })
      .join(','),
    200,
  )
  return { title, description, keywords }
}

export async function POST(req: Request) {
  return withGuard(async () => {
    const body = await readBody(req)
    let name = str(body?.name, 60).trim()
    let domain = str(body?.domain, 200).trim()
    const siteId = str(body?.siteId, 64).trim()
    // 已存站点: 以库内最新值为准(表单改名未保存时仍按真实站点组合, 防半态)
    if (siteId) {
      const site = await db.site.findUnique({ where: { id: siteId }, select: { name: true, domain: true } })
      if (!site) return fail('站点不存在')
      name = site.name
      domain = site.domain
    }
    if (!name) return fail('站点名称必填(或提供 siteId)')

    // 书库实况: 分类按书籍数倒序 top5(仅统计有书的分类) + 全库书籍/章节计数
    const cats = await db.category.findMany({
      orderBy: { books: { _count: 'desc' } },
      take: 5,
      select: { name: true, _count: { select: { books: true } } },
    })
    const catNames = cats.filter((c) => c._count.books > 0).map((c) => c.name)
    const [bookCount, chapterCount] = await Promise.all([db.book.count(), db.chapter.count()])

    return ok(composeSiteTdk(name, domain, catNames, bookCount, chapterCount))
  })
}
