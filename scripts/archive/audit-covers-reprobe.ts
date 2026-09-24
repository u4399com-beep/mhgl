// ============================================================
// [R49-8] 封面审计定向复探 v3 —— 403/browser 强制站用原生引擎配置
// (v2 探针强制 engine:http 禁升级, 对 auto/browser 型规则是伪影; 本轮原样放行)
// 用法: bun scripts/audit-covers-reprobe.ts
// ============================================================
import { fetchPage, fetchBinary } from '../src/lib/crawl/fetcher'
import { parseBook } from '../src/lib/crawl/parser'
import { BUILTIN_RULES } from '../src/lib/crawl/builtin-rules'
import { appendFileSync } from 'node:fs'

// 复探入口(v2 同源 seed 样本)
const ENTRIES: Record<string, string> = {
  book4: 'https://book4.cc/AU%E6%96%87%E5%AD%A6/%E4%BB%99%E4%BE%A0/411853/',
  biqugetw: 'https://www.biquge.tw/book/9002.html',
  dafengdagengren: 'https://www.dafengdagengren.com/0_2/',
  daweixs: 'https://www.daweixs.com/0_4/',
  fanqianxs: 'https://www.fanqianxs.com/book/22270/',
  pilishuwu: 'https://www.pilishuwu.com/0/list/0_0_0_0_0_0_0_1.html',
  wanben: 'https://www.wanbenshenzhan.com/1/',
}

async function main() {
  for (const [key, bookOrList] of Object.entries(ENTRIES)) {
    const rule = BUILTIN_RULES.find((r) => r.key === key)
    if (!rule) continue
    const cfg = (rule.config || {}) as Record<string, any>
    // 原生 fetch 配置(保留 engine/browserFallback/升级链), 仅收紧超时与重试
    const f = { ...(cfg.fetch || {}), timeout: 25000, retries: 0, waitMs: 0 }
    const t0 = Date.now()
    let bookUrl = bookOrList
    let verdict = ''
    try {
      // pilishuwu 给的是列表页: 先通用书链发现
      if (key === 'pilishuwu') {
        const lr = await fetchPage(bookOrList, f as any)
        const m = lr.html.match(/href="([^"]*(?:\/\d+_\d+\/|book\/\d+|xiaoshuo\/[^"]+))"/i)
        if (!m) {
          console.log(`[${key}] FAIL 列表页无书链 (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
          continue
        }
        bookUrl = new URL(m[1], bookOrList).toString()
      }
      const br = await fetchPage(bookUrl, f as any)
      const parsed = parseBook(br.html, bookUrl, cfg.book)
      if (!parsed.cover) {
        verdict = `FAIL 书籍页未提取到封面(engine=${String(f.engine)})`
      } else {
        const bin = await fetchBinary(parsed.cover, f as any)
        verdict = bin
          ? `OK ${bin.buf.length}B ${bin.contentType || ''} ← ${parsed.cover.slice(0, 70)}`
          : `FAIL 封面URL不可达: ${parsed.cover.slice(0, 70)}`
      }
    } catch (e: any) {
      verdict = `FAIL ${String(e?.message || e).slice(0, 100)}`
    }
    const line = `| ${key} | ${verdict} | ${((Date.now() - t0) / 1000).toFixed(1)}s |`
    console.log(line)
    try { appendFileSync('agent-ctx/r49-8-cover-reprobe.md', line + '\n') } catch { /* ignore */ }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
