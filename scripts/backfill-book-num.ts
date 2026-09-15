// ============================================================
// Book.num 存量回填 — 伪静态数字书号
// 按 createdAt 升序给所有 num 为空的书补号(max+1 递增), 幂等可重跑。
// 用法: bun scripts/backfill-book-num.ts
// ============================================================
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const INT32_MAX = 2_147_483_647

async function main() {
  const agg = await db.book.aggregate({ _max: { num: true } })
  let cur = agg._max.num ?? 0
  const rows = await db.book.findMany({
    where: { num: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  })
  if (!rows.length) {
    console.log('[backfill-book-num] 无待回填书籍')
    return
  }
  console.log(`[backfill-book-num] 待回填 ${rows.length} 本, 起始书号 ${cur + 1}`)
  for (const b of rows) {
    cur += 1
    if (cur > INT32_MAX) throw new Error('书号耗尽')
    await db.book.update({ where: { id: b.id }, data: { num: cur } })
    console.log(`  #${cur} ← ${b.name} (${b.id})`)
  }
  console.log(`[backfill-book-num] 完成, 共 ${rows.length} 本`)
}

main()
  .catch((e) => {
    console.error('[backfill-book-num] 失败:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
