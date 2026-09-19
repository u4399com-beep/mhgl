// [R46-2c-1] 分类同类收敛 — POST /api/admin/categories/consolidate
// 把存量碎片分类(都市生活/玄幻奇幻/现代言情…)按语义归一映射并集到 ≤15 个主分类
// ( smart.canonicalizeCategoryName/consolidateCategories )。
// 入参 { dryRun?: boolean }: 缺省 true 仅预览合并计划(不落库); 显式 dryRun:false 才执行
// 迁移+删除。返回 { before, after, kept, merges, created, deleted } 全量明细。
import { ok, readBody } from '@/lib/api'
import { withGuard } from '../../../_lib/http'
import { consolidateCategories } from '@/lib/crawl/smart'

export async function POST(req: Request) {
  return withGuard(async () => {
    const body = await readBody<Record<string, unknown>>(req)
    // 安全缺省: 忘传 dryRun 时只预览, 防误触批量迁移/删除(破坏性动作需显式 dryRun:false)
    const dryRun = body?.dryRun !== false
    const result = await consolidateCategories({ dryRun })
    return ok(result)
  })
}
