// [R49-9] constTemplate 算术后缀 + parseBook 封面产出 单测(真实 API 响应)
// 用法: bun scripts/verify-r49-9-cover.ts
import { findBuiltinRule } from '../src/lib/crawl/builtin-rules'
import { parseBook } from '../src/lib/crawl/parser'
import { type PageRule } from '../src/lib/crawl/types'

async function main() {
  const rule = findBuiltinRule('bqg713')
  if (!rule) throw new Error('bqg713 builtin rule not found')
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

  let pass = 0
  let fail = 0
  const expect = (cond: boolean, msg: string) => {
    if (cond) { pass++; console.log(`  ✓ ${msg}`) } else { fail++; console.log(`  ✗ ${msg}`) }
  }

  // ---- A) constTemplate 算术后缀边界(经 parseBook const cover 链路间接覆盖) ----
  // 构造最小 JSON 响应 + 各形态书籍 URL, 断言 cover 产出
  const apiJson = JSON.stringify({ id: '1578', title: '测', author: '甲', sortname: '玄幻', full: '连载', intro: 'x', lastchapter: '末章', lastchapterid: '9', lastupdate: '2022-10-17', dirid: '1578' })

  const cases: { url: string; want: string | undefined; tag: string }[] = [
    { url: 'https://www.bqg616.cc/api/book?id=1578', want: 'https://www.bqg616.cc/bookimg/1/1578.jpg', tag: 'floor正整: 1578→1' },
    { url: 'https://www.bqg616.cc/api/book?id=1', want: 'https://www.bqg616.cc/bookimg/0/1.jpg', tag: 'floor小id: 1→0' },
    { url: 'https://www.bqg616.cc/api/book?id=999999', want: 'https://www.bqg616.cc/bookimg/999/999999.jpg', tag: 'floor六位: 999999→999' },
    { url: 'https://www.bqg616.cc/#/book/1578/', want: undefined, tag: 'SPA壳URL无query: cover置空(fail-closed)' },
  ]
  console.log('[A] parseBook cover 产出(真实规则配置)')
  for (const c of cases) {
    const parsed = parseBook(apiJson, c.url, rule.config.book as PageRule)
    expect(parsed.cover === c.want, `${c.tag} → ${parsed.cover ?? '(空)'}`)
  }

  // ---- B) 真实 API 响应端到端(在线) ----
  console.log('[B] 真实 /api/book 端到端')
  try {
    const res = await fetch('https://www.bqg616.cc/api/book?id=1', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
    const html = await res.text()
    const parsed = parseBook(html, 'https://www.bqg616.cc/api/book?id=1', rule.config.book as PageRule)
    expect(parsed.name === '海贼之银狐大将', `书名提取: ${parsed.name}`)
    expect(parsed.cover === 'https://www.bqg616.cc/bookimg/0/1.jpg', `封面URL: ${parsed.cover}`)
    if (parsed.cover) {
      const img = await fetch(parsed.cover, { headers: { 'User-Agent': UA, Referer: 'https://www.bqg616.cc/' }, signal: AbortSignal.timeout(15000) })
      const buf = Buffer.from(await img.arrayBuffer())
      expect(img.ok && buf.length > 1000 && buf.length !== 6909, `封面可下载非占位图: ${img.status} ${buf.length}B`)
    }
  } catch (e: any) {
    fail++
    console.log(`  ✗ 在线端到端异常: ${e?.message}`)
  }

  console.log(`\n结果: ${pass} pass / ${fail} fail`)
  process.exit(fail > 0 ? 1 : 0)
}

main()
