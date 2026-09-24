// ============================================================
// [R49-9] bqg713 家族封面规律落地: DB 规则补 cover 字段 + 存量书封面回填
// ------------------------------------------------------------
// 背景: /api/book 响应无封面字段, 封面由 SPA 前端 url_img(id) 固定规律构造:
//   //www.{host}/bookimg/{Math.floor(id/1000)}/{id}.jpg
// 实测: id=1 → https://www.bqg616.cc/bookimg/0/1.jpg → 200 image/jpeg 180x240。
// 陷阱: 错目录/不存在的书【恒 200】返回全站同一张 6909B 默认占位图
//   (md5 eb7cfc788e22a7e79b1d4e1dabfc192a), 勿以 200 判定封面正确。
// 引擎侧: parser.constTemplate 已支持安全算术后缀 {q.id|/1000}(floor除法)。
// 本脚本(幂等):
//   1) DB Rule(按内置 key=bqg713 的规则名定位) book.fields.cover 补 const 字段
//      + description 同步内置版(含 R49-9 封面规律要点);
//   2) 存量书回填: sourceUrl 为 bqg 家族 /api/book?id=N 且 cover 为空的书 →
//      构造封面 URL 下载 → 占位图指纹校验 → saveCoverWebp 转存 → 入库。
// 用法: bun scripts/backfill-bqg-covers.ts
// ============================================================
import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'
import { findBuiltinRule } from '../src/lib/crawl/builtin-rules'
import { saveCoverWebp } from '../src/lib/crawl/storage'
import { type PageRule } from '../src/lib/crawl/types'

const db = new PrismaClient()

// 源站默认占位封面指纹(全站同一张, 实测多主机/多路径均返回此图)
const PLACEHOLDER_MD5 = 'eb7cfc788e22a7e79b1d4e1dabfc192a'
// bqg 家族: 书籍 sourceUrl 可识别的 host 尾巴
const FAMILY_HOST_RE = /https?:\/\/(?:www\.)?(?:bqg713|bqg616|bqg413|apige)\.cc\/api\/book\?id=(\d+)/i

function coverUrlFor(bookId: string): string {
  const n = parseInt(bookId, 10)
  return `https://www.bqg616.cc/bookimg/${Math.floor(n / 1000)}/${bookId}.jpg`
}

/** 下载并校验封面: 非占位图返回 buffer, 否则 null */
async function fetchRealCover(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: 'https://www.bqg616.cc/',
      },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!ct.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 1000) return null
    const md5 = createHash('md5').update(buf).digest('hex')
    return md5 === PLACEHOLDER_MD5 ? null : buf
  } catch {
    return null
  }
}

async function main() {
  // ---- 1) DB 规则同步: book.fields.cover + description ----
  const builtin = findBuiltinRule('bqg713')
  if (builtin) {
    const dbRule = await db.rule.findFirst({ where: { name: builtin.name } })
    if (dbRule) {
      const cfg = JSON.parse(dbRule.config || '{}') as Record<string, any>
      const bookCfg = (builtin.config as Record<string, any>).book as PageRule | undefined
      const coverField = bookCfg?.fields?.cover
      const before = JSON.stringify(cfg.book?.fields?.cover ?? null)
      if (coverField && before !== JSON.stringify(coverField)) {
        cfg.book = cfg.book || {}
        cfg.book.fields = cfg.book.fields || {}
        cfg.book.fields.cover = coverField
        await db.rule.update({
          where: { id: dbRule.id },
          data: { config: JSON.stringify(cfg, null, 2), description: builtin.description },
        })
        console.log(`[rule] 已补 cover 字段: ${dbRule.name}`)
      } else {
        console.log('[rule] cover 字段已就绪, 跳过')
      }
    } else {
      console.log('[rule] DB 未找到内置同名规则(未导入过?), 跳过规则同步')
    }
  }

  // ---- 2) 存量书回填 ----
  const candidates = await db.book.findMany({
    where: { cover: '', sourceUrl: { contains: '/api/book?id=' } },
    select: { id: true, name: true, sourceUrl: true },
  })
  const targets = candidates.filter((b) => FAMILY_HOST_RE.test(b.sourceUrl || ''))
  console.log(`[backfill] 待回填书籍: ${targets.length}/${candidates.length}(候选/家族过滤后)`)

  let ok = 0
  let miss = 0
  for (const b of targets) {
    const m = FAMILY_HOST_RE.exec(b.sourceUrl || '')
    const bookId = m?.[1]
    if (!bookId) continue
    const url = coverUrlFor(bookId)
    const buf = await fetchRealCover(url)
    if (!buf) {
      miss++
      console.log(`  ✗ 《${b.name}》 bookId=${bookId} 封面缺失/占位图: ${url}`)
      continue
    }
    const saved = await saveCoverWebp(buf, `book_${Date.now()}_${Math.floor(Math.random() * 9999)}`)
    if (!saved) {
      miss++
      console.log(`  ✗ 《${b.name}》 webp 转存失败: ${url}`)
      continue
    }
    await db.book.update({ where: { id: b.id }, data: { cover: saved } })
    ok++
    console.log(`  ✓ 《${b.name}》 bookId=${bookId} → ${saved} (${Math.round(buf.length / 1024)}KB)`)
  }
  console.log(`[backfill] 完成: 成功 ${ok} / 缺失 ${miss}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
