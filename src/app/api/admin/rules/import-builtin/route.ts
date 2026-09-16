// [R15-b2] 内置规则库幂等导入
// 口径: 与 scripts/_seed-lib.ts seedRuleIdempotent 一致 —— 先删库中全部同名旧规则(含历史重复)再创建;
//       config 校验与 POST /api/admin/rules 同款(regexGate 四正则入口防线 + 200KB 大小上限)。
//       校验失败/未知 key 的单条跳过并在 results 标注 error, 不中断其余导入;
//       删除+创建包进事务, 避免"删了旧规则但创建失败"的半程状态。
import { db } from '@/lib/db'
import { ok, fail, readBody } from '@/lib/api'
import { collectRegexIssues } from '@/lib/crawl/types'
import { BUILTIN_RULES, findBuiltinRule } from '@/lib/crawl/builtin-rules'
import { withGuard, str, isPlainObject, errText } from '../../../_lib/http'

/** [R15-d2-1] keys 数量上限 —— 与 api/_lib/batch.ts BATCH_MAX_IDS(500) 同口径:
 *  修前 keys 数组不钳量, 塞 10 万个(未知)key 会逐条产出 results 明细(数 MB 信封)
 *  并白耗 findBuiltinRule 循环; 有效 key 至多 BUILTIN_RULES 全量, 上限 500 零误伤 */
const MAX_IMPORT_KEYS = 500

/** 规则配置序列化: 对象→JSON字符串; 字符串→原样; 均限制大小防DB膨胀(与 rules/route.ts 同款) */
function configToString(v: unknown): string | null {
  if (isPlainObject(v)) {
    const s = JSON.stringify(v)
    return s.length > 200_000 ? null : s
  }
  if (typeof v === 'string') return v.length > 200_000 ? null : v
  return null
}

/** regex 入口防线(gg-a, 与 rules/route.ts POST 同款): 非法正则/灾难型嵌套量词拒绝保存 */
function regexGate(v: unknown): string | null {
  const issues = collectRegexIssues(v)
  if (!issues.length) return null
  return `规则配置存在非法/危险正则, 已拒绝保存: ${issues.map((i) => `${i.field} ${i.reason}`).join('; ')}`
}

/** 单条导入结果(错误文案已消毒, 不含 Prisma 内部细节) */
interface ImportResult {
  key: string
  name: string
  id?: string
  deletedOld: number
  error?: string
}

export async function POST(req: Request) {
  return withGuard(async () => {
    const body = await readBody<{ keys?: unknown; all?: unknown }>(req)
    // keys 容错: 单条字符串也接受; all=true 或 keys 省略(null/undefined) → 全量导入
    let keys: string[]
    if (body?.all === true) {
      keys = BUILTIN_RULES.map((r) => r.key)
    } else if (typeof body?.keys === 'string') {
      keys = [body.keys]
    } else if (Array.isArray(body?.keys)) {
      keys = body.keys.filter((k): k is string => typeof k === 'string')
    } else {
      keys = BUILTIN_RULES.map((r) => r.key)
    }
    // 去重保序(重复 key 会造成无意义的删了再建), 空 key 剔除
    keys = [...new Set(keys.map((k) => k.trim()).filter(Boolean))]
    // [R15-d2-1] 超量整体拒绝(与 parseBatchBody 同语义, 不静默截断)
    if (keys.length > MAX_IMPORT_KEYS) {
      return fail(`单次最多导入 ${MAX_IMPORT_KEYS} 条规则(内置规则库共 ${BUILTIN_RULES.length} 条)`)
    }

    const results: ImportResult[] = []
    let created = 0
    let removedOld = 0
    for (const key of keys) {
      const rule = findBuiltinRule(key)
      if (!rule) {
        // 未知 key: 跳过并标注, 不中断其余导入
        results.push({ key, name: '', deletedOld: 0, error: '未知规则 key' })
        continue
      }
      const name = str(rule.name, 100).trim()
      try {
        // 创建前与 rules/route.ts POST 同款 config 校验; 失败跳过该条不中断其余
        const regexError = regexGate(rule.config)
        if (regexError) {
          results.push({ key, name, deletedOld: 0, error: regexError })
          continue
        }
        const config = configToString(rule.config)
        if (config === null) {
          results.push({ key, name, deletedOld: 0, error: '规则配置过大或类型非法' })
          continue
        }
        // 幂等口径(同 seedRuleIdempotent): 先删全部同名旧规则再创建; 事务保证原子性
        const { del, row } = await db.$transaction(async (tx) => {
          const del = await tx.rule.deleteMany({ where: { name } })
          const row = await tx.rule.create({
            data: {
              name,
              description: str(rule.description, 500),
              config,
              enabled: rule.enabled !== false,
            },
          })
          return { del, row }
        })
        created++
        removedOld += del.count
        results.push({ key, name, id: row.id, deletedOld: del.count })
      } catch (e) {
        // 单条失败不中断其余导入; errText 消毒错误文本(不带出 Prisma 内部细节)并留服务端日志
        results.push({ key, name, deletedOld: 0, error: errText(e) })
      }
    }
    return ok({ created, removedOld, results })
  })
}
