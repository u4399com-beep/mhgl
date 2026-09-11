/**
 * heis 种子脚本公共库 — [R11-d-6] 整合
 * ============================================================
 * 背景(R11-d 扫描): 22 个 seed-rule-*.ts 存在两段大范围复制的样板:
 *   1) 幂等入库(查同名→删→POST /api/admin/rules→日志→失败 exit(1)) —— 每文件一份,
 *      信封双形态(Array | {rules})与"删首个/删全部重复"口径各写各的, 本库取多数派
 *      严格口径(历史重复全删, 信封双形态兼容);
 *   2) 四段实测 testSection(POST /api/admin/rules/test 带规则 fetch/clean 段) ——
 *      14 个带实测门槛的种子各持一份同款(仅日志 slice 长度 1~2 字符级差异,
 *      断言消费的返回值逐字节同), 本库取并集格式(book fields 截 300 + content 附 tail 行)。
 *
 * 兼容性契约(seed-rules-import-all.ts):
 *   - 模式 A/D/E 的 temp 抽取(extractAllTopLevelConsts)只取顶层字面量 const 声明,
 *     import 语句与函数不进 temp —— 各种子 import 本库不影响抽取;
 *   - 模式 B 的 description 提取(extractDescription)对全文做 regex 扫描, 各种子把
 *     description 字面量内联保留在 seedRuleIdempotent 调用实参中, 提取契约不变。
 *
 * 环境变量: BASE(缺省 http://127.0.0.1:3000 —— 显式 IPv4, bun fetch localhost 会先试
 *   ::1 被仅监听 IPv4 的 next dev 拒连, 见 seed-rule-deqixs.ts 头注)。
 */
export interface RuleSeed {
  name: string
  description: string
  enabled: boolean
  config: unknown
}

const BASE = process.env.BASE || 'http://127.0.0.1:3000'

/** 幂等入库: 同名规则(含历史重复)全部先删后建; POST 失败 exit(1)(与各种子原行为一致)。
 *  description 可选(历史种子 jpxs123 的 rule 对象本就无 description 字段, 语义保持) */
export async function seedRuleIdempotent(rule: Omit<RuleSeed, 'description'> & { description?: string }): Promise<void> {
  const listRes = await fetch(`${BASE}/api/admin/rules?take=100`)
  const listJson = (await listRes.json()) as { ok: boolean; data?: { id: string; name: string }[] | { rules?: { id: string; name: string }[] } }
  const raw = Array.isArray(listJson.data) ? listJson.data : (listJson.data as { rules?: { id: string; name: string }[] })?.rules || []
  for (const d of raw.filter((r) => r.name === rule.name)) {
    const del = await fetch(`${BASE}/api/admin/rules/${d.id}`, { method: 'DELETE' })
    const delJson = (await del.json()) as { ok: boolean }
    console.log('旧规则已删除:', d.id, delJson.ok)
  }
  const res = await fetch(`${BASE}/api/admin/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  })
  const json = (await res.json()) as { ok: boolean; data?: { id?: string }; message?: string }
  console.log('入库结果:', json.ok ? `OK id=${json.data?.id}` : json.message)
  if (!json.ok) process.exit(1)
}

interface TestResp {
  ok: boolean
  message?: string
  data?: Record<string, any>
}

/** 四段实测: POST /api/admin/rules/test(自动带规则 fetch/clean 段), 失败返 null, 成功返 data 并格式化日志 */
export async function testSection(
  ruleLike: { config: unknown },
  section: string,
  url: string,
  ruleSection: unknown,
  extra: Record<string, unknown> = {},
): Promise<Record<string, any> | null> {
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/admin/rules/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      section, url, rule: ruleSection,
      fetch: (ruleLike.config as Record<string, unknown>).fetch,
      clean: (ruleLike.config as Record<string, unknown>).clean,
      ...extra,
    }),
  })
  const json = (await res.json()) as TestResp
  const ms = Date.now() - t0
  if (!json.ok) {
    console.log(`  [${section}] ❌ ${json.message} (${ms}ms)`)
    return null
  }
  const d = json.data as Record<string, any>
  if (section === 'list') {
    console.log(`  [list] ✅ engine=${d.engine} count=${d.count} ${d.ms}ms`)
    for (const it of (d.sample || []).slice(0, 2)) console.log('    ', JSON.stringify(it).slice(0, 150))
  } else if (section === 'book') {
    console.log(`  [book] ✅ engine=${d.engine} ${d.ms}ms fields=${JSON.stringify(d.fields).slice(0, 300)}`)
  } else if (section === 'toc') {
    console.log(`  [toc] ✅ engine=${d.engine} count=${d.count} pages=${d.pages} ${d.ms}ms`)
    for (const it of (d.sample || []).slice(0, 2)) console.log('    ', JSON.stringify(it).slice(0, 130))
  } else {
    console.log(`  [content] ✅ engine=${d.engine} pages=${d.pages} raw=${d.rawLength} clean=${d.cleanedLength} ${d.ms}ms`)
    console.log('    text:', JSON.stringify((d.cleanedText || '').slice(0, 120)))
    console.log('    tail:', JSON.stringify((d.cleanedText || '').slice(-80)))
  }
  return d
}
