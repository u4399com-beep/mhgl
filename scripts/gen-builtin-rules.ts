// ============================================================
// [R15-b1] 内置规则库生成器 — scripts/seed-rule-*.ts → src/lib/crawl/builtin-rules.ts
// ============================================================
// 用法: bun run scripts/gen-builtin-rules.ts
//
// 背景: 24 个 seed-rule-*.ts 各自内联一份规则信封(RuleSeed), 只能靠 CLI 手动灌库,
// 后台规则系统看不见它们。本脚本把全部种子规则「求值提取」为单一数据源
// src/lib/crawl/builtin-rules.ts, 供管理端 /api/admin/rules/builtin + 内置规则库
// 对话框一键导入; 种子脚本保持可独立运行(后续规则修好后重跑本脚本同步即可)。
//
// 提取原理(求值而非正则, 规避大字面量截取风险):
//   1. 每个种子生成 /tmp 副本: `./_seed-lib` 导入改指「记录桩」(authFetch/
//      seedRuleIdempotent/testSection 全部记账并返回 ok 响应, 不出网),
//      `import.meta.main` 替换为 true 强制执行原本受守卫的 main();
//   2. 子进程(bun) import 副本 —— 顶层的 seed 调用被桩原样记录;
//   3. 桩还接管全局 fetch(pilishuwu 用裸 fetch 走登录/删旧/建新), 拦截所有
//      /api/admin/rules 的 POST/PUT 请求体作为候选信封;
//   4. 父进程逐文件汇总 → 校验(name 非空 + config 为对象) → 生成注册表 TS 文件。
//
// 说明:
//   - 子进程隔离: 单个种子异常/exit() 不影响其余种子(失败清单在结尾打印);
//   - 本脚本只读 scripts/, 只写 src/lib/crawl/builtin-rules.ts 与 /tmp 临时目录;
//   - 修改某条规则后: 先跑对应 seed-rule-*.ts 验证, 再重跑本脚本同步注册表。
//   - [R30-5-6] ⚠ 重跑须知: 生成物 builtin-rules.ts 中存在历史手工补丁(R28-4-L8 的 allowLoopback
//     修复注释等) —— 本脚本 JSON.stringify 输出不保留注释, 重跑会丢弃生成物内注释但语义不受损
//     (种子源已回写全部功能性修复, 种子是语义唯一权威)。重跑前先跑种子↔生成物语义对账, 重跑后
//     diff 只应出现「注释丢失/键序归一」类差异, 任何字段值差异都说明种子漂移未回写, 须先补种子。
// ============================================================
import { readdir, mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPTS_DIR = join(ROOT, 'scripts')
const OUT_FILE = join(ROOT, 'src/lib/crawl/builtin-rules.ts')
const TMP_DIR = '/tmp/heis-gen-builtin'

interface Envelope {
  name?: unknown
  description?: unknown
  enabled?: unknown
  config?: unknown
}

interface BuiltinRule {
  key: string
  name: string
  description: string
  enabled: boolean
  config: Record<string, unknown>
  source: string
}

/** 子进程桩代码: 记录 seed 信封 + 全部管理端写请求体, 永不出网 */
function stubSource(stubPath: string): string {
  return `// 自动生成临时桩(gen-builtin-rules) — 记录种子脚本的入库信封, 永不出网
export type RuleSeed = Record<string, unknown>
export const RuleSeed = undefined

interface Rec { url: string; method: string; body: unknown }
export const __capture: Rec[] = []

function record(url: string, method: string, body: unknown): void {
  try { __capture.push({ url, method, body }) } catch { /* ignore */ }
}

function okPayload(url: string, method: string): unknown {
  if (url.includes('/rules/test')) {
    return { ok: true, data: {
      ms: 1, engine: 'gen', count: 30, pages: 1, rawLength: 9999, cleanedLength: 8888,
      sample: [{ name: '测试书名', author: '测试作者', url: 'https://gen.local/book/1',
        latest: '第1章 测试', category: '玄幻', intro: '简介'.repeat(40), cover: 'https://gen.local/c.jpg' }],
      fields: { name: '测试书名', author: '测试作者', status: 'completed',
        cover: 'https://gen.local/c.jpg', intro: '简介'.repeat(60), category: '玄幻',
        latestChapter: '第1章 测试', keywords: '测试' },
      chapters: [{ title: '第1章 测试', url: 'https://gen.local/book/1/1' }],
    } }
  }
  // 列表类: 数组形态(80ge 直接迭代 data, pilishuwu Array.isArray 判定, _seed-lib 双形态兼容)
  if (url.includes('/api/admin/rules') && method === 'GET') return { ok: true, data: [] }
  if (url.includes('/api/admin/rules')) return { ok: true, data: { id: 'gen-rule-id' } }
  return { ok: true, data: {} }
}

function okResponse(url: string, method: string): Response {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (url.includes('/api/auth/login')) headers.set('set-cookie', 'heis_admin=gen-stub; Path=/')
  return new Response(JSON.stringify(okPayload(url, method)), { status: 200, headers })
}

/** 录制型 authFetch: 拦截管理端写请求体, 其余返回 ok 响应, 永不出网 */
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase()
  let body: unknown
  if (typeof init.body === 'string') { try { body = JSON.parse(init.body) } catch { body = init.body } }
  if (method === 'POST' || method === 'PUT') record(String(url), method, body)
  return okResponse(String(url), method)
}

/** 录制型全局 fetch(pilishuwu 等用裸 fetch 走登录/删旧/建新) */
const __origFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
  const url = String(typeof input === 'string' ? input : (input as Request).url ?? input)
  const method = (init.method || 'GET').toUpperCase()
  let body: unknown
  if (typeof init.body === 'string') { try { body = JSON.parse(init.body) } catch { body = init.body } }
  if (method === 'POST' || method === 'PUT') record(url, method, body)
  return okResponse(url, method)
}) as typeof fetch

/** 幂等入库桩: 信封原样记账 */
export async function seedRuleIdempotent(rule: Record<string, unknown>): Promise<void> {
  record('/api/admin/rules#seedRuleIdempotent', 'POST', rule)
}

/** 四段实测桩: 返回带全字段的 ok 数据(断言失败只影响日志不影响信封采集) */
export async function testSection(
  _ruleLike: { config: unknown },
  _section: string,
  _url?: string,
  _extra?: unknown,
): Promise<{ ok: boolean; message?: string; data?: Record<string, unknown> }> {
  return okPayload('/api/admin/rules/test') as { ok: boolean; data: Record<string, unknown> }
}

export const STUB_MARKER = '${stubPath}'
`
}

/** 子进程入口代码: import 桩 + import 转换后的种子副本, 落盘采集结果 */
function childSource(stubFile: string): string {
  return `// 自动生成临时子进程(gen-builtin-rules)
import * as stub from '${stubFile}'
import { writeFileSync } from 'node:fs'

const target = process.argv[2]
const out = process.argv[3]

function flush(): void {
  try {
    const mod = globalThis.__heisGenMod as Record<string, unknown> | undefined
    const fallback: Record<string, unknown>[] = []
    if (mod && typeof mod === 'object') {
      if (mod.rule && typeof mod.rule === 'object' && (mod.rule as Record<string, unknown>).name) {
        fallback.push(mod.rule as Record<string, unknown>)
      } else if (mod.ruleConfig && typeof mod.RULE_NAME === 'string') {
        fallback.push({ name: mod.RULE_NAME, config: mod.ruleConfig, enabled: true })
      }
    }
    writeFileSync(out, JSON.stringify({ capture: stub.__capture, fallback }))
  } catch { /* 落盘失败则让位给父进程报错 */ }
}

// 种子脚本在四段实测失败路径会直接 process.exit(2) —— 劫持为先落盘采集结果再退
const __origExit = process.exit.bind(process)
process.exit = ((code?: number): never => {
  flush()
  return __origExit(code ?? 0)
}) as typeof process.exit
process.on('unhandledRejection', (e) => {
  console.error('child-unhandled-rejection:', (e as Error)?.stack || String(e))
  flush()
  __origExit(3)
})

async function main(): Promise<void> {
  const mod = (await import(target)) as Record<string, unknown>
  ;(globalThis as unknown as { __heisGenMod?: Record<string, unknown> }).__heisGenMod = mod
  // [R52-a2] 竞态修复: 种子 main() 是「模块体内 fire-and-forget 调用」, 动态 import 只等待
  // 模块体求值完成, 不等待 main() 的 await 链结束 —— 桩环境下全部 Promise 均微任务级解析,
  // child 的 main().then(flush+exit) 可能抢在目标 main() 完成前执行(当前 bun 1.3.x 对
  // kanunu8 这类「≥2 个顺序 testSection await」的种子实测触发: 信封丢失/提前 exit 0)。
  // 修法: import 后等待记账长度稳定(50ms 采样 ×3 次不变)再返回, 让位给目标 main 的
  // 微任务链; 无记账种子 ~150ms 收敛, 硬顶 5s 防悬挂。兜底: exit 劫持内的 flush 语义不变。
  let last = -1
  let stable = 0
  for (let i = 0; i < 100; i++) {
    const n = stub.__capture.length
    if (n === last) { stable++; if (stable >= 3) break } else { stable = 0 }
    last = n
    await new Promise((r) => setTimeout(r, 50))
  }
}

main().then(
  () => { flush(); process.exit(0) },
  (e) => { console.error('child-import-failed:', (e as Error)?.stack || String(e)); flush(); process.exit(1) },
)
`
}

/** 信封有效性: name 非空字符串 + config 为对象(JSON 字符串自动解析 —— jpxs123 等历史种子 config 入库前本就是 JSON 串) */
function validEnvelope(e: Envelope): e is { name: string; description?: string; enabled?: boolean; config: Record<string, unknown> } {
  if (!e || typeof e !== 'object') return false
  if (typeof e.name !== 'string' || !e.name.trim()) return false
  let cfg = e.config
  if (typeof cfg === 'string') {
    try { cfg = JSON.parse(cfg) } catch { return false }
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return false
  e.config = cfg
  return true
}

/** 从采集记录中按优先级提取信封: seedRuleIdempotent 记账 > 管理端写请求体 */
function envelopesFromCapture(capture: { url: string; method: string; body: unknown }[]): Envelope[] {
  const out: Envelope[] = []
  for (const rec of capture) {
    if (rec.url.includes('#seedRuleIdempotent') && rec.body && typeof rec.body === 'object') {
      out.push(rec.body as Envelope)
      continue
    }
    if (rec.url.includes('/api/admin/rules') && rec.body && typeof rec.body === 'object') {
      const b = rec.body as Envelope
      if (typeof b.name === 'string' && b.config) out.push(b)
    }
  }
  return out
}

/** 子进程采集结果落盘结构 */
interface ParsedPayload {
  capture?: { url: string; method: string; body: unknown }[]
  fallback?: Envelope[]
}

/** 跑单个子进程(30s 看门狗; stderr 尾部保留诊断) */
function runChild(childFile: string, targetFile: string, outFile: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn('bun', [childFile, targetFile, outFile], {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
      if (stderr.length > 8192) stderr = stderr.slice(-8192)
    })
    let done = false
    const finish = (code: number) => {
      if (!done) {
        done = true
        resolve({ code, stderr })
      }
    }
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch { /* ignore */ }
      finish(124)
    }, 30_000)
    proc.on('error', (e) => {
      clearTimeout(timer)
      stderr += String(e)
      finish(-1)
    })
    proc.on('close', (c) => {
      clearTimeout(timer)
      finish(c ?? -1)
    })
  })
}

async function main(): Promise<void> {
  const targets = (await readdir(SCRIPTS_DIR))
    .filter((f) => /^seed-rule-.+\.ts$/.test(f))
    .sort()

  await mkdir(TMP_DIR, { recursive: true })
  const stubFile = join(TMP_DIR, 'stub.ts')
  const childFile = join(TMP_DIR, 'child.ts')
  await writeFile(stubFile, stubSource(stubFile))
  await writeFile(childFile, childSource(stubFile))

  const rules: BuiltinRule[] = []
  const failures: { file: string; reason: string }[] = []

  for (const file of targets) {
    const key = file.replace(/^seed-rule-/, '').replace(/\.ts$/, '')
    const src = await readFile(join(SCRIPTS_DIR, file), 'utf8')
    // 1) _seed-lib 导入 → 记录桩; 2) import.meta.main → true(强制执行守卫的 main)
    const transformed = src
      .replace(/from ['"]\.\/_seed-lib['"]/g, `from '${stubFile}'`)
      .replace(/import\.meta\.main/g, 'true')
    const targetFile = join(TMP_DIR, `${key}.ts`)
    const outFile = join(TMP_DIR, `${key}.json`)
    await writeFile(targetFile, transformed)

    const { code, stderr } = await runChild(childFile, targetFile, outFile)

    // 无论退出码都尝试读落盘结果 —— 子进程劫持了 process.exit,
    // 种子脚本在实测失败路径 exit(2) 前信封已落盘, 退出码仅作诊断
    let parsed: ParsedPayload | null = null
    if (existsSync(outFile)) {
      try {
        parsed = JSON.parse(await readFile(outFile, 'utf8')) as ParsedPayload
      } catch { parsed = null }
    }

    const candidates = (parsed
      ? [...envelopesFromCapture(parsed.capture ?? []), ...(parsed.fallback ?? [])].filter(validEnvelope)
      : [])
    if (!candidates.length) {
      failures.push({ file, reason: `无有效信封(退出码 ${code}): ${stderr.slice(-240).trim() || '无 stderr'}` })
      continue
    }

    // 同文件多规则全收; 同名取首个
    const seen = new Set<string>()
    for (const env of candidates) {
      const name = (env.name as string).trim()
      if (seen.has(name)) continue
      seen.add(name)
      rules.push({
        key: seen.size > 1 ? `${key}-${seen.size}` : key,
        name,
        description: typeof env.description === 'string' ? env.description : '',
        enabled: env.enabled !== false,
        config: env.config as Record<string, unknown>,
        source: `scripts/${file}`,
      })
    }
    console.log(`✓ ${file} → ${candidates.length} 条规则`)
  }

  // 名称全局查重(跨文件冲突加 key 后缀)
  const byName = new Map<string, number>()
  for (const r of rules) {
    const n = byName.get(r.name) ?? 0
    byName.set(r.name, n + 1)
    if (n > 0) r.key = `${r.key}-${n}`
  }

  // 校验规则 config 四段形态(告警不阻断 —— 个别规则按站点语义缺段)
  for (const r of rules) {
    const segs = ['list', 'book', 'toc', 'content'].filter((s) => (r.config as Record<string, unknown>)[s])
    if (segs.length < 4) console.warn(`⚠ ${r.key}(${r.name}) 仅含段: ${segs.join(',') || '无'}`)
  }

  if (!rules.length) {
    console.error('未提取到任何规则, 不写出注册表')
    process.exit(1)
  }

  // ---- 生成注册表 ----
  const head = `// ============================================================
// [R15-b1] 内置规则库 — 由 scripts/gen-builtin-rules.ts 自动生成, 勿手改
// ============================================================
// 数据来源: scripts/seed-rule-*.ts(24 站种子规则, R13 轮 19/22 四段实测全链 PASS)
// 重新生成: bun run scripts/gen-builtin-rules.ts
// 消费方: /api/admin/rules/builtin(元数据+导入状态) / POST /api/admin/rules/import-builtin
//         (幂等导入) / 管理端「采集规则 → 内置规则库」对话框
// 修改规则的正确姿势: 改对应 seed-rule-*.ts → 四段实测 → 重跑生成器同步本文件
// ============================================================

/** 内置规则(种子规则注册表条目) */
export interface BuiltinRule {
  /** 稳定 key(种子文件名派生, 导入请求用) */
  key: string
  /** 规则名(与种子入库名一致, 幂等导入按名查重) */
  name: string
  description: string
  enabled: boolean
  /** 完整 RuleConfig(list/book/toc/content 四段 + fetch + clean) */
  config: Record<string, unknown>
  /** 生成来源脚本(相对项目根) */
  source: string
}

`

  const body = rules
    .map((r) => {
      const cfg = JSON.stringify(r.config, null, 2)
        .split('\n')
        .map((l, i) => (i === 0 ? l : '    ' + l))
        .join('\n')
      return `  {\n    key: ${JSON.stringify(r.key)},\n    name: ${JSON.stringify(r.name)},\n    description: ${JSON.stringify(r.description)},\n    enabled: ${r.enabled},\n    source: ${JSON.stringify(r.source)},\n    config: ${cfg},\n  },`
    })
    .join('\n')

  const tail = `\n]\n\n/** 按 key 查找内置规则 */\nexport function findBuiltinRule(key: string): BuiltinRule | undefined {\n  return BUILTIN_RULES.find((r) => r.key === key)\n}\n\n/** 按规则名查找(幂等导入的查重口径) */\nexport function findBuiltinRuleByName(name: string): BuiltinRule | undefined {\n  return BUILTIN_RULES.find((r) => r.name === name)\n}\n`

  await writeFile(OUT_FILE, head + `export const BUILTIN_RULES: BuiltinRule[] = [\n` + body + tail, 'utf8')

  console.log('----')
  console.log(`注册表已生成: ${OUT_FILE}`)
  console.log(`规则总数: ${rules.length}; 失败: ${failures.length}`)
  for (const f of failures) console.error(`✗ ${f.file}: ${f.reason}`)
  if (failures.length) process.exitCode = 2
}

main().catch((e) => {
  console.error('gen-builtin-rules failed:', e?.message || e)
  process.exit(1)
})
