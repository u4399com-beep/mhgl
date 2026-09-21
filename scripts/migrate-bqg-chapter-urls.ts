// ============================================================
// [R49-8] 一次性迁移: 剥离烤进存量 URL 的环回代理前缀
// ------------------------------------------------------------
// 背景: bqg713 规则 toc.fields.url 曾以 const 直存代理包裹形态
//   http://127.0.0.1:3010/unlock?url=https://apige.cc/api/chapter?...
// 镜像轮换把环回 host 换成远端域名(端口 :3010 保留) → 远端端口被防火墙丢包
// → curl 28 连接超时; 且代理双重包裹守卫(urlMatchesTemplateOrigin)失效。
// 引擎侧已在 mirrorGroupFor 加回环豁免(fetcher.ts), 本脚本清洗存量数据:
//   1) Rule.config.toc.fields.url.expression → 原始章节 URL 模板
//   2) Chapter.url → 原始章节 URL(逐条)
//   3) Book.sourceUrl → 原始书籍 URL(若有包裹形态)
// 幂等: 已是原始形态的记录零改动。去重键=Chapter.url(runner:2314 有 url 只查
// url 映射), 迁移必须先于任务续采执行, 否则新旧形态撞车产生重复章节。
// 用法: bun scripts/migrate-bqg-chapter-urls.ts
// ============================================================
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// 环回代理包裹形态: http(s)://回环地址[:port]/<path>?url=<内层URL>
const WRAP_RE = /^https?:\/\/(?:127\.\d{1,3}\.\d{1,3}\.\d{1,3}|localhost|\[::1\]|::1)(?::\d+)?\/[^\s]*?url=(https?%3A.+|https?:\/\/.+)$/i

/** 剥离包裹: 内层已编码形态先解码; 非包裹原样返回 null(调用方跳过) */
function unwrap(raw: string): string | null {
  const m = WRAP_RE.exec(raw.trim())
  if (!m) return null
  let inner = m[1]
  if (/^https?%3A/i.test(inner)) {
    try {
      inner = decodeURIComponent(inner)
    } catch {
      /* 解码失败保留原文 */
    }
  }
  return /^https?:\/\//i.test(inner) ? inner : null
}

async function main() {
  // ---- 1) 规则配置: toc 章节 url 表达式去包裹 ----
  const rules = await db.rule.findMany({ select: { id: true, name: true, config: true } })
  let ruleFixed = 0
  for (const r of rules) {
    let cfg: Record<string, unknown>
    try {
      cfg = JSON.parse(r.config) as Record<string, unknown>
    } catch {
      continue
    }
    const toc = cfg.toc as { fields?: { url?: { expression?: string } } } | undefined
    const expr = toc?.fields?.url?.expression
    if (!expr) continue
    const inner = unwrap(expr)
    if (!inner) continue
    toc!.fields!.url!.expression = inner
    await db.rule.update({ where: { id: r.id }, data: { config: JSON.stringify(cfg) } })
    ruleFixed++
    console.log(`[rule] ${r.name}: expression → ${inner}`)
  }

  // ---- 2) 章节 URL 逐条清洗 ----
  let chapFixed = 0
  let chapScanned = 0
  const CHUNK = 500
  let cursor: string | undefined
  for (;;) {
    const batch = await db.chapter.findMany({
      where: { url: { contains: '/unlock?url=' } },
      take: CHUNK,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, url: true },
      orderBy: { id: 'asc' },
    })
    if (batch.length === 0) break
    for (const c of batch) {
      chapScanned++
      const inner = unwrap(c.url)
      if (inner && inner !== c.url) {
        await db.chapter.update({ where: { id: c.id }, data: { url: inner } })
        chapFixed++
      }
      cursor = c.id
    }
    if (batch.length < CHUNK) break
  }

  // ---- 3) 书籍源 URL 清洗 ----
  let bookFixed = 0
  const books = await db.book.findMany({
    where: { sourceUrl: { contains: '/unlock?url=' } },
    select: { id: true, sourceUrl: true },
  })
  for (const b of books) {
    const inner = unwrap(b.sourceUrl)
    if (inner && inner !== b.sourceUrl) {
      await db.book.update({ where: { id: b.id }, data: { sourceUrl: inner } })
      bookFixed++
    }
  }

  console.log(`\n=== 迁移完成 ===`)
  console.log(`规则配置: 扫描 ${rules.length}, 修复 ${ruleFixed}`)
  console.log(`章节 URL: 扫描 ${chapScanned}, 修复 ${chapFixed}`)
  console.log(`书籍 sourceUrl: 修复 ${bookFixed}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
