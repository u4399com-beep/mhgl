// R52-a 五站规则四段实测: 对 5 个新规则逐段调 /api/admin/rules/test 验证
// 用法: bun run scripts/verify-r52-rules.ts [siteKey ...]
// siteKey ∈ yueyouxs|xyetianlian|xbqg777|shoujixs|cuoceng (缺省全部)
import { db } from '../src/lib/db'

const BASE = process.env.BASE || 'http://127.0.0.1:3000'
const PW = process.env.ADMIN_PASSWORD || 'audit-fix-2025'

const RULE_NAMES: Record<string, string> = {
  yueyouxs: '神马小说(sma.yueyouxs.com)·移动站静态HTML采集',
  xyetianlian: '仙侠天恋(xyetianlian.com)·杰奇WAP模板http站采集',
  xbqg777: '新笔趣阁(xbqg777.com)·bqg家族静态站采集',
  shoujixs: '手机小说(shoujixs.net)·杰奇WAP模板GBK站采集',
  cuoceng: '错层小说网(m.cuoceng.com)·移动站UUID书号采集',
}

// 每站四段的入口 URL(与规则 urlTemplate/侦察结论一致)
const LIST_URLS: Record<string, string> = {
  yueyouxs: 'https://sma.yueyouxs.com/l/s/29/1.html',
  xyetianlian: 'http://www.xyetianlian.com/fenlei/1/1.html',
  xbqg777: 'https://www.xbqg777.com/ds?page=1',
  shoujixs: 'https://www.shoujixs.net/xhqh_1.html',
  cuoceng: 'https://m.cuoceng.com/book/finish/1.html',
}

let cookie = ''
async function api(path: string, body?: unknown): Promise<{ ok: boolean; data?: any; message?: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cookie) headers.cookie = cookie
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const sc = res.headers.get('set-cookie') || ''
  if (sc.includes('heis_admin=')) cookie = `heis_admin=${sc.match(/heis_admin=([^;]+)/)![1]}`
  return (await res.json()) as { ok: boolean; data?: any; message?: string }
}

async function testSection(cfg: unknown, section: string, url: string): Promise<{ ok: boolean; msg: string; data?: Record<string, any> }> {
  const c = cfg as { fetch?: unknown; clean?: unknown; [k: string]: unknown }
  const json = await api('/api/admin/rules/test', {
    section,
    url,
    rule: c[section],
    fetch: c.fetch,
    clean: c.clean,
  })
  if (!json.ok) return { ok: false, msg: json.message || 'fail' }
  const d = json.data as Record<string, any>
  if (section === 'list') {
    const items = (d.sample || d.items || []) as Record<string, string>[]
    const first = items[0] || {}
    return {
      ok: (d.count || 0) > 0,
      msg: `count=${d.count} engine=${d.engine} first=${JSON.stringify(first).slice(0, 220)}`,
      data: d,
    }
  }
  if (section === 'book') {
    return { ok: !!d.fields?.name, msg: `fields=${JSON.stringify(d.fields).slice(0, 300)}` }
  }
  if (section === 'toc') {
    const items = (d.sample || []) as Record<string, string>[]
    return {
      ok: (d.count || 0) > 0,
      msg: `count=${d.count} pages=${d.pages} engine=${d.engine} first=${JSON.stringify(items[0] || {}).slice(0, 180)}`,
    }
  }
  return {
    ok: (d.cleanedLength || 0) > 100,
    msg: `raw=${d.rawLength} clean=${d.cleanedLength} pages=${d.pages} head=${JSON.stringify((d.cleanedText || '').slice(0, 100))} tail=${JSON.stringify((d.cleanedText || '').slice(-60))}`,
  }
}

async function main() {
  const targets = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(RULE_NAMES)
  const login = await api('/api/auth/login', { password: PW })
  if (!login.ok) { console.error('登录失败'); process.exit(1) }

  let pass = 0, fail = 0
  for (const key of targets) {
    const name = RULE_NAMES[key]
    if (!name) { console.error(`未知 siteKey: ${key}`); continue }
    const rules = (await api('/api/admin/rules?take=500')).data as { id: string; name: string; config: string }[]
    const rule = rules.find((r) => r.name === name)
    if (!rule) { console.error(`✗ ${key}: 规则未入库`); fail++; continue }
    const cfg = JSON.parse(rule.config)
    console.log(`\n======== ${key} (${rule.id}) ========`)
    const listR = await testSection(cfg, 'list', LIST_URLS[key])
    console.log(`[list]    ${listR.ok ? '✅' : '❌'} ${listR.msg}`)
    // [R52-a2] book 探针取前 3 个列表项逐个尝试: 部分站榜单含陈旧条目(yueyouxs /l/s/29 榜
    // 实测轮换且首项 id 可能 404), 只探首项会把「站点数据陈旧」误报成「规则失败」
    const listItems = (listR.data?.sample || listR.data?.items || []) as Record<string, string>[]
    const candidates = listItems
      .map((it) => it.bookUrl || it.url || '')
      .filter((u) => /^https?:\/\//.test(u))
      .slice(0, 3)
    let bookUrl = ''
    let bookR: { ok: boolean; msg: string } = { ok: false, msg: 'list 未取得 bookUrl' }
    for (const cand of candidates) {
      const r = await testSection(cfg, 'book', cand)
      if (r.ok || !bookUrl) { bookR = r; bookUrl = cand }
      if (r.ok) break
    }
    console.log(`[book]    ${bookR.ok ? '✅' : '❌'} ${bookR.msg} (url=${bookUrl})`)
    const tocR = bookUrl ? await testSection(cfg, 'toc', bookUrl) : { ok: false, msg: 'skip' }
    console.log(`[toc]     ${tocR.ok ? '✅' : '❌'} ${tocR.msg}`)
    let chUrl = ''
    try {
      const m = (tocR.msg.match(/"url":"(https?:\/\/[^"]+)"/) || [])[1]
      chUrl = m ? JSON.parse(`"${m}"`) : ''
    } catch { /* ignore */ }
    const ctR = chUrl ? await testSection(cfg, 'content', chUrl) : { ok: false, msg: 'toc 未取得章节 URL' }
    console.log(`[content] ${ctR.ok ? '✅' : '❌'} ${ctR.msg} (url=${chUrl})`)
    if (listR.ok && bookR.ok && tocR.ok && ctR.ok) pass++
    else fail++
  }
  console.log(`\n==== 结果: ${pass} 站全通过, ${fail} 站有失败段 ====`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
