/** [R46-4] 抽样实测翻页链(临时, 用毕即删): yybsw(文案兜底翻页) + wanben(显式 nextLink) */
import { parseToc, parseContent } from '../src/lib/crawl/parser'
import { BUILTIN_RULES } from '../src/lib/crawl/builtin-rules'
import type { PageRule } from '../src/lib/crawl/types'

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'

async function probeToc(key: string, tocUrl: string) {
  const rule = BUILTIN_RULES.find((r) => r.key === key)!
  const toc = rule.config.toc as unknown as PageRule
  const res = await fetch(tocUrl, { headers: { 'User-Agent': UA } })
  const html = await res.text()
  const out = await parseToc(tocUrl, html, toc, { pageFetch: async (u: string) => {
    const r = await fetch(u, { headers: { 'User-Agent': UA, Referer: tocUrl } })
    return { html: await r.text() } as any
  } } as any)
  console.log(`[${key}] toc: ${out.pages}页 ${out.items.length}章 | 首章: ${out.items[0]?.title?.slice(0, 20)} | 末章: ${out.items[out.items.length - 1]?.title?.slice(0, 20)}`)
  return out
}

async function main() {
  // yybsw: 目录内嵌书籍页 #all-chapter 全量单页(描述如此, 验证); content 走"下一页"锚翻页
  try { await probeToc('yybsw', 'https://www.yybsw.com/book/5106/') } catch (e: any) { console.log('[yybsw] FAILED:', e?.message?.slice(0, 80)) }
  // wanben: 完本站 toc mp=20 显式 nextLink
  try { await probeToc('wanben', 'https://www.wanbenxinshu.com/kan/1/') } catch (e: any) { console.log('[wanben] FAILED:', e?.message?.slice(0, 80)) }
  process.exit(0)
}
main()
