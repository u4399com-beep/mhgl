/** [R46-4] yybsw content 翻页实测(临时, 用毕即删): 验证"下一页"文案兜底跨子页合并 */
import { parseContent } from '../src/lib/crawl/parser'
import { BUILTIN_RULES } from '../src/lib/crawl/builtin-rules'
import type { PageRule } from '../src/lib/crawl/types'
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
async function main() {
  const rule = BUILTIN_RULES.find((r) => r.key === 'yybsw')!
  const content = rule.config.content as unknown as PageRule
  // 先抓目录页拿一个真实章节 URL
  const tocHtml = await (await fetch('https://www.yybsw.com/book/5106/', { headers: { 'User-Agent': UA } })).text()
  const m = tocHtml.match(/href="(\/book\/5106\/\d+\.html)"/)
  if (!m) { console.log('未找到章节链接'); return }
  const url = 'https://www.yybsw.com' + m[1]
  const html = await (await fetch(url, { headers: { 'User-Agent': UA } })).text()
  const out = await parseContent(url, html, content, { pageFetch: async (u: string) => {
    const r = await fetch(u, { headers: { 'User-Agent': UA, Referer: url } })
    return { html: await r.text() } as any
  } } as any)
  const plain = out.content.replace(/<[^>]+>/g, '')
  console.log(`[yybsw] content: pages=${out.pages} plainLen=${plain.length} confidence=${(out.confidence ?? 1).toFixed(2)}`)
  console.log('  尾部150字:', plain.slice(-150).replace(/\s+/g, ' '))
  process.exit(0)
}
main().catch((e) => { console.error('FAILED:', e?.message?.slice(0, 100)); process.exit(1) })
