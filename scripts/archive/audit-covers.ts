// ============================================================
// [R49-8] 全采集规则封面获取审计 v2 —— 用户指令②
// ------------------------------------------------------------
// 规则库为「页形定义」(列表入口在任务级), 故本审计按规则注入样本入口:
//   book 直探 / list→首本书链探 / 无封面配置规则做「源站是否提供封面」鉴定
// 全链: fetchPage(引擎本体) → parseBook 提取 cover → fetchBinary 二进制校验
// 结论分级: OK / 源站无封面数据 / 规则未配置封面字段(源站有) / 封面提取失败 /
//           封面URL不可达 / 站点不可达 / SKIP
// 报告: agent-ctx/r49-8-cover-audit.md
// 用法: bun scripts/audit-covers.ts
// ============================================================
import { fetchPage, fetchBinary } from '../src/lib/crawl/fetcher'
import { parseList, parseBook } from '../src/lib/crawl/parser'
import { BUILTIN_RULES } from '../src/lib/crawl/builtin-rules'
import { appendFileSync, writeFileSync } from 'node:fs'

interface Probe { book?: string; list?: string; note?: string }

// 样本入口出处: scripts/seed-rule-*.ts(规则制作时的实抓样本, 2026-09 存档)
const PROBES: Record<string, Probe> = {
  '77shuku': { book: 'http://www.77shuku.info/novel/1/' },
  '80ge': { list: 'http://www.80ge.info/top/lastupdate/1.html' },
  'aijjxs-toplist': { book: 'https://www.aijjxs.com/txt/57329.html' },
  aijjxs: { book: 'https://www.aijjxs.com/txt/57196.html' },
  biqugetw: { book: 'https://www.biquge.tw/book/9002.html' },
  book4: { book: 'https://book4.cc/AU%E6%96%87%E5%AD%A6/%E4%BB%99%E4%BE%A0/411853/' },
  // bqg713 源 API 实测字段: id,title,sortname,author,full,intro,lastchapterid,lastchapter,lastupdate,dirid —— 无任何封面字段
  bqg713: { note: '源站 JSON API 无封面字段(实测 /api/book 返回 10 字段), 规则无从提取' },
  dafengdagengren: { book: 'https://www.dafengdagengren.com/0_2/' },
  daweixs: { book: 'https://www.daweixs.com/0_4/' },
  deqixs: { list: 'https://www.deqixs.cc/sort/1/1.html' },
  fanqianxs: { book: 'https://www.fanqianxs.com/book/22270/' },
  fanqie: { list: 'https://fq.taijiwang.top/api/search?key=%E5%89%91&tab_type=3&offset=0' },
  hodei: { book: 'https://www.hodei.net/book/5608/' },
  iidcr: { book: 'https://www.iidcr.com/book/p25225/' },
  jpxs123: { list: 'https://jpxs123.com/' },
  kanunu8: { book: 'https://www.kanunu8.com/book7/meihua94/' },
  moli: { book: 'https://www.molixs.com/6_6041/' },
  piaotia: { book: 'https://www.piaotia.com/bookinfo/15/15701.html' },
  pilishuwu: { list: 'https://www.pilishuwu.com/0/list/0_0_0_0_0_0_0_1.html' },
  qidian: { list: 'https://full.hnxianxin.cn/qd/ranking.php?action=ranking&site_id=11&order=11&page=1&page_size=20&category_id=0' },
  qimao: { note: '七猫官方 API(api-bc.wtzw.com)需签名代理, 无静态样本, 配置面已含 book.cover 提取' },
  'ratelimit-demo': { note: '本地演示站(mock), 封面链路不适用' },
  shudugu: { book: 'https://www.shudugu.org/51/' },
  trxsw: { book: 'https://www.trxsw.com/book/178/' },
  wanben: { book: 'https://www.wanbenshenzhan.com/1/' },
  wuxiaworld: { list: 'https://lite.wuxiaworld.com/novels?sort=chapters' },
  xjp: { list: 'https://www.xinjianpan.com/sort/xuanhuan-1.html' },
  yybsw: { book: 'https://www.yybsw.com/book/27714/' },
  zxcs: { book: 'https://www.zxcs.click/dushi/2463.html' },
}

const REPORT = 'agent-ctx/r49-8-cover-audit.md'
const rows: { key: string; status: string; detail: string; ms: number }[] = []

function emit(line: string) {
  console.log(line)
  try { appendFileSync(REPORT, line + '\n') } catch { /* ignore */ }
}

function probeFetch(cfg: Record<string, any>): Record<string, any> {
  return { ...(cfg.fetch || {}), engine: 'http', timeout: 15000, retries: 0, waitMs: 0, browserFallbackStatus: [] }
}

/** 无封面配置规则的「源站是否提供封面」鉴定: og:image / 常见封面选择器探针 */
function detectCoverOnPage(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
  if (og?.[1]) return `og:image → ${og[1].slice(0, 80)}`
  const m = html.match(/<img[^>]+(?:class=["'][^"']*(?:cover|fmimg|item|backcover|thumbnail|book[-_]?img)[^"']*["']|id=["'][^"']*(?:cover|fmimg)[^"']*["'])[^>]*src=["']([^"']+)["']/i)
  if (m?.[1]) return `常见封面选择器命中 → ${m[1].slice(0, 80)}`
  return '页面未发现明显封面形态'
}

async function auditRule(key: string, name: string, cfg: Record<string, any>): Promise<void> {
  const t0 = Date.now()
  const probe = PROBES[key] || {}
  const f = probeFetch(cfg)
  const step = (status: string, detail: string) => {
    rows.push({ key, status, detail, ms: Date.now() - t0 })
    emit(`| ${key} | ${status} | ${detail.slice(0, 120)} | ${((Date.now() - t0) / 1000).toFixed(1)}s |`)
  }
  try {
    if (probe.note) return step('SKIP', probe.note)
    if (!cfg.book?.fields) return step('SKIP', '规则无 book 段')

    let bookUrl = probe.book
    if (!bookUrl && probe.list) {
      const lr = await fetchPage(probe.list, f as any)
      const items = parseList(lr.html, probe.list, cfg.list || {}, ['url', 'name']).items
      bookUrl = items.map((i) => i.fields.url).find(Boolean)
      if (!bookUrl) return step('列表零项', `list 探针 ${probe.list.slice(0, 70)} 无书籍项`)
    }
    if (!bookUrl) return step('SKIP', '无样本入口')

    const br = await fetchPage(bookUrl, f as any)
    const coverCfg = cfg.book.fields.cover
    if (!coverCfg) {
      const det = detectCoverOnPage(br.html)
      return step(det.includes('→') ? '规则未配置封面字段(源站有)' : '源站无封面形态', `书籍页可达; ${det}`)
    }
    const parsed = parseBook(br.html, bookUrl, cfg.book)
    if (!parsed.cover) return step('封面提取失败', `cover 配置(${String(coverCfg.expression).slice(0, 50)})未提取到 URL: ${bookUrl.slice(0, 60)}`)

    const bin = await fetchBinary(parsed.cover, f as any)
    if (!bin) return step('封面URL不可达', `提取到 ${parsed.cover.slice(0, 80)} 但二进制抓取失败(防盗链/失效)`)
    const ct = bin.contentType || ''
    if (!/image\//i.test(ct) && !/\.(jpe?g|png|webp|gif|bmp)(\?|$)/i.test(parsed.cover)) {
      return step('封面非图片', `${bin.buf.length}B ct=${ct} ${parsed.cover.slice(0, 60)}`)
    }
    step('OK', `${bin.buf.length}B ${ct || '(无ct)'} ← ${parsed.cover.slice(0, 78)}`)
  } catch (e: any) {
    step('站点不可达/异常', String(e?.message || e).slice(0, 120))
  }
}

async function main() {
  writeFileSync(REPORT, `# R49-8 全规则封面获取审计 v2 (${new Date().toISOString()})\n\n| 规则 | 结论 | 明细 | 耗时 |\n|---|---|---|---|\n`)
  emit(`共 ${BUILTIN_RULES.length} 条内置规则\n`)
  for (const r of BUILTIN_RULES) {
    emit(`\n[probe] ${r.key} …`)
    await auditRule(r.key, r.name, (r.config || {}) as Record<string, any>)
  }
  const okN = rows.filter((x) => x.status === 'OK').length
  emit(`\n=== 汇总: OK ${okN} / ${rows.length} ===`)
  for (const x of rows.filter((x) => x.status !== 'OK' && x.status !== 'OK')) emit(`- [${x.status}] ${x.key}: ${x.detail.slice(0, 110)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
