// [R15-b2] 内置规则库 — 注册表元数据 + 导入状态查询
// 数据源: src/lib/crawl/builtin-rules.ts(R15-b1 由 scripts/gen-builtin-rules.ts 生成, 勿手改)
// 导入: POST /api/admin/rules/import-builtin(幂等); 管理端入口: 「采集规则 → 内置规则库」
import { db } from '@/lib/db'
import { ok } from '@/lib/api'
import { BUILTIN_RULES } from '@/lib/crawl/builtin-rules'
import { withGuard } from '../../../_lib/http'

export async function GET() {
  return withGuard(async () => {
    // 导入状态判定: 一次拉全 Rule 表(id+name 两个标量列, 规则表量级小)按名分组,
    // 再与注册表逐条精确同名匹配 —— 避免 N+1 查询。name 在 Rule 表无唯一约束,
    // 历史上可能出现同名多行(如 seed 脚本重复执行前的旧版), importedIds 全量回传。
    const existing = await db.rule.findMany({ select: { id: true, name: true } })
    const idsByName = new Map<string, string[]>()
    for (const r of existing) {
      const arr = idsByName.get(r.name)
      if (arr) arr.push(r.id)
      else idsByName.set(r.name, [r.id])
    }
    const rules = BUILTIN_RULES.map((r) => {
      const importedIds = idsByName.get(r.name) ?? []
      return {
        key: r.key,
        name: r.name,
        description: r.description,
        enabled: r.enabled,
        source: r.source,
        // config 原样返回(管理端已鉴权, 供导入前预览 JSON)
        config: r.config,
        imported: importedIds.length > 0,
        importedIds,
      }
    })
    return ok({ rules })
  })
}
