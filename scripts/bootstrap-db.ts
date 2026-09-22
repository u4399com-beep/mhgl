// ============================================================
// 空库一键引导脚本 (R54) —— 沙箱重置/DB 清空后完整重建运行态
// 用法: bun run scripts/bootstrap-db.ts [--start]
//   --start   重建后立即启动三大部头任务(缺省只创建不启动)
// 前置: dev server 已在 3000 端口运行(bun run dev), Go 引擎已启动
//       (mini-services/crawler-go)。幂等: 重复执行安全(规则先删后建/
//       站点按域名查重/任务按名称查重)。
// 步骤:
//   1. 登录取 heis_admin cookie(ADMIN_PASSWORD 可覆盖, 缺省同登录页)
//   2. POST /api/admin/rules/import-builtin 全量幂等导入内置规则库
//   3. Site 表为空时创建默认站点(localhost:3000 / aijjxs 主题)
//   4. 按 name 幂等创建三大部头任务(全部 engine=go, R53 档案参数)
//   5. --start 时逐个 control start
// ============================================================
// [模块化] 显式 export 空类型: 本文件顶层声明(BASE/PASSWORD/login 等)不泄漏进 TS 全局
// 脚本聚合作用域(修前与 seed-rule-*.ts 的同名顶层声明冲突, tsc 2451/2393)
export {}

const BASE = process.env.BASE || 'http://localhost:3000'
const PASSWORD = process.env.ADMIN_PASSWORD || 'audit-fix-2025'
const START = process.argv.includes('--start')

interface TaskDef {
  name: string
  ruleMatch: string
  mode: 'bookIds' | 'range'
  bookUrl?: string
  bookIds?: string
  listUrl?: string
  listStart?: number
  listEnd?: number
  threadMin: number
  threadMax: number
  intervalMin: number
  intervalMax: number
  note: string
}

// [R53 档案] 三大部头任务参数(②指令「三站大部头切 Go 引擎批量续采」的固化形态):
//  - xbqg777 内容页有 CF 挑战(R53 事故链A), 固化降速参数 1 线程 1.5~4s 间隔
const MAJOR_TASKS: TaskDef[] = [
  {
    name: '神马小说·大部头批量(yueyouxs)',
    ruleMatch: 'yueyouxs',
    mode: 'bookIds',
    bookUrl: 'https://sma.yueyouxs.com/b/{bookId}.html',
    bookIds: '23070\n23069',
    threadMin: 3,
    threadMax: 8,
    intervalMin: 500,
    intervalMax: 2000,
    note: 'R52-a 实测无反爬',
  },
  {
    name: '仙侠天恋·分类批量(xyetianlian)',
    ruleMatch: 'xyetianlian',
    mode: 'range',
    listUrl: 'http://www.xyetianlian.com/fenlei/1/{page}.html',
    listStart: 1,
    listEnd: 1,
    threadMin: 3,
    threadMax: 8,
    intervalMin: 500,
    intervalMax: 2000,
    note: 'R52-a 实测无反爬; 杰奇WAP http 站',
  },
  {
    name: '新笔趣阁·大部头批量(xbqg777)',
    ruleMatch: 'xbqg777',
    mode: 'bookIds',
    bookUrl: 'https://www.xbqg777.com/{bookId}',
    bookIds: '34807\n34808',
    threadMin: 1,
    threadMax: 1,
    intervalMin: 1500,
    intervalMax: 4000,
    note: '内容页 CF 挑战(R53 事故链A), 固化降速参数',
  },
]

async function api(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, init)
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

async function login(): Promise<string> {
  const { status, body } = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  const cookie = (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
    .then((r) => r.headers.get('set-cookie') || '')
    .catch(() => ''))
  const m = /heis_admin=([^;]+)/.exec(cookie)
  if (status !== 200 || !m) throw new Error(`登录失败 HTTP ${status}`)
  return `heis_admin=${m[1]}`
}

async function main() {
  console.log(`[bootstrap] BASE=${BASE} START=${START}`)
  const cookie = await login()
  const auth = { Cookie: cookie, 'Content-Type': 'application/json' }

  // 1. 内置规则全量导入(幂等)
  const imp = await api('/api/admin/rules/import-builtin', { method: 'POST', headers: auth, body: '{}' })
  const impOk = imp.body?.data?.results?.filter((r: any) => !r.error).length ?? 0
  const impErr = imp.body?.data?.results?.filter((r: any) => r.error) ?? []
  console.log(`[bootstrap] rules imported ok=${impOk} err=${impErr.length}${impErr.length ? ' -> ' + impErr.map((r: any) => `${r.key}:${r.error}`).join('; ').slice(0, 300) : ''}`)

  // 2. 默认站点(仅 Site 表为空时)
  const sites = await api('/api/admin/sites', { headers: auth })
  const siteList: any[] = sites.body?.data ?? []
  if (siteList.length === 0) {
    const created = await api('/api/admin/sites', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: '小说聚合站', domain: 'localhost:3000', themeId: 'aijjxs' }),
    })
    console.log(`[bootstrap] default site created: ${created.status === 200 ? 'ok' : JSON.stringify(created.body).slice(0, 200)}`)
  } else {
    console.log(`[bootstrap] sites exist (${siteList.length}), skip`)
  }

  // 3. 规则清单(取 ruleId 用)
  const rules = await api('/api/admin/rules', { headers: auth })
  const ruleList: any[] = rules.body?.data ?? []

  // 4. 三大部头任务(按 name 幂等)
  const tasks = await api('/api/admin/tasks', { headers: auth })
  const taskList: any[] = tasks.body?.data ?? []
  const createdIds: string[] = []
  for (const def of MAJOR_TASKS) {
    if (taskList.some((t) => t.name === def.name)) {
      console.log(`[bootstrap] task exists: ${def.name}`)
      continue
    }
    const rule = ruleList.find((r) => (r.name || '').toLowerCase().includes(def.ruleMatch))
    if (!rule) {
      console.log(`[bootstrap] !! rule not found for ${def.ruleMatch}, skip task`)
      continue
    }
    const payload: Record<string, unknown> = {
      name: def.name,
      ruleId: rule.id,
      mode: def.mode,
      engine: 'go', // [R54] Golang-first
      recrawlMode: 'incremental',
      storageMode: 'db',
      threadMin: def.threadMin,
      threadMax: def.threadMax,
      intervalMin: def.intervalMin,
      intervalMax: def.intervalMax,
    }
    if (def.mode === 'bookIds') {
      payload.bookUrl = def.bookUrl
      payload.bookIds = def.bookIds
    } else {
      payload.listUrl = def.listUrl
      payload.listStart = def.listStart
      payload.listEnd = def.listEnd
    }
    const created = await api('/api/admin/tasks', { method: 'POST', headers: auth, body: JSON.stringify(payload) })
    if (created.status === 200 && created.body?.data?.id) {
      createdIds.push(created.body.data.id)
      console.log(`[bootstrap] task created: ${def.name} (id=${created.body.data.id}, ${def.note})`)
    } else {
      console.log(`[bootstrap] !! task create failed: ${def.name} -> ${JSON.stringify(created.body).slice(0, 200)}`)
    }
  }

  // 5. 可选启动
  if (START && createdIds.length > 0) {
    for (const id of createdIds) {
      const r = await api(`/api/admin/tasks/${id}/control`, { method: 'POST', headers: auth, body: JSON.stringify({ action: 'start' }) })
      console.log(`[bootstrap] start ${id}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`)
    }
  }
  console.log('[bootstrap] done')
}

main().catch((e) => {
  console.error('[bootstrap] FAILED:', e?.message || e)
  process.exit(1)
})
