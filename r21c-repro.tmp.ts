// R21-c 复现脚本 — 用完即删。逐项证实/证伪清洗链可疑点。
import { cleanContentHtml, cleanTextField, cleanIntro, cleanChapterTitle } from './src/lib/crawl/cleaner'
import { parseToc, parseList, jsonGet, jsonArrayAt } from './src/lib/crawl/parser'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, detail?: string) => {
  if (cond) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name}${detail ? '  => ' + detail : ''}`) }
}
const NO_AD = { adPatterns: [] as string[] }

// ---------- P1: parseToc regex itemSelector + css 字段(疑似全页提取而非逐段) ----------
const tocHtml = `<html><body><h3>页首干扰标题</h3>
<div class="item"><h3>第一章</h3><a href="/1.html">l1</a></div>
<div class="item"><h3>第二章</h3><a href="/2.html">l2</a></div></body></html>`
const tocRule: any = {
  itemSelector: { type: 'regex', expression: '<div class="item">[\\s\\S]*?</div>', flags: 'gi' },
  fields: {
    title: { type: 'css', expression: 'h3' },
    url: { type: 'regex', expression: 'href="([^"]+)"', flags: 'gi' },
  },
}
const tocRes = await parseToc('https://x.com/toc.html', tocHtml, tocRule, undefined as any)
const tocTitles = tocRes.items.map((i) => i.title).join('|')
ok('P1-list-parseList对照(逐段提取, 预期两章各自标题)',
  (() => { const r = parseList(tocHtml, 'https://x.com/toc.html', tocRule); return r.items.map((i) => i.fields.title).join('|') })() === '第一章|第二章',
  (() => { const r = parseList(tocHtml, 'https://x.com/toc.html', tocRule); return r.items.map((i) => i.fields.title).join('|') })())
ok('P1-parseToc(预期 第一章|第二章, 若为 页首干扰标题|页首干扰标题 即证实全页提取 bug)',
  tocTitles === '第一章|第二章', tocTitles)

// ---------- P2: plainText 模式未闭合 <p> 链粘连 ----------
const p2 = cleanContentHtml('<p>段1<p>段2</p>', { ...NO_AD, plainText: true })
ok('P2-plainText未闭合<p>(预期含换行分段, 现状粘连=证实)', p2.includes('段1') && p2.includes('段2') && /\n/.test(p2.trim().replace(/\n+/, (m) => (m.length > 1 ? m : 'X'))), JSON.stringify(p2))
console.log('  P2 现状输出:', JSON.stringify(p2))

// ---------- P3: plainText 模式块级闭标签集合过窄(td/table/section 等粘连) ----------
const p3 = cleanContentHtml('<table><tr><td>甲</td><td>乙</td></tr></table>', { ...NO_AD, plainText: true })
console.log('  P3 plainText 现状输出:', JSON.stringify(p3))
ok('P3-plainText td 分段(预期 甲/乙 分行)', /甲/.test(p3) && /乙/.test(p3) && !/甲乙/.test(p3), JSON.stringify(p3))
const p3h = cleanContentHtml('<td>甲</td><td>乙</td>', NO_AD)
ok('P3-HTML模式对照(td 已由 cheerio 链修复, 预期两段)', /<p>甲<\/p>/.test(p3h) && /<p>乙<\/p>/.test(p3h), JSON.stringify(p3h))

// ---------- P4: 零宽/双向控制符存活 + 幽灵段落 + 全角空格行对照 ----------
const p4a = cleanContentHtml('第一段\n\u200b\n第二段', { ...NO_AD, plainText: true })
console.log('  P4a 纯零宽行现状输出:', JSON.stringify(p4a))
ok('P4a-纯零宽字符行应按空行折叠(幽灵段落=证实)', !p4a.includes('\u200b'), JSON.stringify(p4a))
const p4b = cleanContentHtml('<p>段A\u202e转置\u202c</p>', NO_AD)
console.log('  P4b 双向控制符现状输出:', JSON.stringify(p4b))
ok('P4b-双向控制符应剥离(HTML出口)', !p4b.includes('\u202e') && !p4b.includes('\u202c'), JSON.stringify(p4b))
const p4c = cleanTextField('书\u200b名\uFEFF号')
ok('P4c-cleanTextField 零宽剥离', !p4c.includes('\u200b') && !p4c.includes('\uFEFF'), JSON.stringify(p4c))
const p4d = cleanContentHtml('第一段\n\u3000\n第二段', { ...NO_AD, plainText: true })
ok('P4d-证伪对照: 全角空格行现状已被 trim 折叠(无幽灵)', p4d === '第一段\n\n第二段', JSON.stringify(p4d))

// ---------- P5: 属性内 > 的标签剥离残留 ----------
const p5a = cleanTextField('<img alt="4>3" src="x.png">正文开始')
console.log('  P5a cleanTextField 现状输出:', JSON.stringify(p5a))
ok('P5a-属性内>残留(证实)', p5a === '正文开始', JSON.stringify(p5a))
const p5b = cleanContentHtml('<img alt="4>3" src="https://x/a.png"><p>正文</p>', NO_AD)
ok('P5b-HTML模式证伪对照(cheerio 解析无残留)', p5b.includes('>正文') === false && /正文/.test(p5b) && !p5b.includes('src'), JSON.stringify(p5b))

// ---------- P6: jsonArrayWalk 与 jsonGet [k=v] 语义不一致(%26 解码缺失) ----------
const root6 = { list: [{ name: 'a&b', v: 1 }, { name: 'c', v: 2 }] }
const g6 = jsonGet(root6, 'list[name=a%26b].v')
const a6 = jsonArrayAt(root6, 'list[name=a%26b]')
console.log('  P6 jsonGet:', JSON.stringify(g6), ' jsonArrayAt:', JSON.stringify(a6))
ok('P6-jsonGet %26 解码在位(既有)', g6 === 1)
ok('P6-jsonArrayAt %26 解码缺失(证实不一致)', JSON.stringify(a6) === JSON.stringify([{ name: 'a&b', v: 1 }]), JSON.stringify(a6))

// ---------- P7: replaceAll 替换串 $ 语义注入(通用 JS 语义证明, 修复点在 downloader) ----------
const corrupted = '《{book}》'.replaceAll('{book}', '天价$&宠婚')
console.log('  P7 现状展开结果:', JSON.stringify(corrupted))
ok('P7-replaceAll $& 注入(证实: $& 展开为被替换串)', corrupted === '《天价$&宠婚》', JSON.stringify(corrupted))

// ---------- P8: downloader.stripHtmlToText 块级清单过窄(li 缺失) — 用同款正则证明 ----------
const p8 = '<ul><li>甲</li><li>乙</li></ul>'
  .replace(/<\s*br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|h[1-6])>/gi, '\n')
  .replace(/<[^>]+>/g, '')
console.log('  P8 现状同款正则输出:', JSON.stringify(p8))
ok('P8-下载链 li 闭标签无 \n(粘连=证实)', !/甲乙/.test(p8), JSON.stringify(p8))

// ---------- R13 回归基线(修复后必须全数保持) ----------
ok('R13-形态1 多<p>保真', cleanContentHtml('<p>段一</p><p>段二</p><p>段三</p>', NO_AD) === '<p>段一</p><p>段二</p><p>段三</p>', JSON.stringify(cleanContentHtml('<p>段一</p><p>段二</p><p>段三</p>', NO_AD)))
const legacy = cleanContentHtml('<p>段一\n段二\n段三</p>', NO_AD)
ok('R13-形态2 存量单<p>+内部\\n 不重排', legacy.startsWith('<p>') && legacy.split('</p>').length === 2 && legacy.includes('段一\n段二'), JSON.stringify(legacy))
const plain = cleanContentHtml('段一\n\n段二\n\n段三', NO_AD)
ok('R13-形态3 纯文本 \\n\\n 重建段落', plain === '<p>段一</p><p>段二</p><p>段三</p>', JSON.stringify(plain))
const br = cleanContentHtml('段一<br><br>段二', NO_AD)
ok('R13-形态4 纯br分段包裹替换', br === '<p>段一</p><p>段二</p>', JSON.stringify(br))
ok('R13-空段清理', cleanContentHtml('<p>段一</p><p></p><p>段二</p>', NO_AD) === '<p>段一</p><p>段二</p>')

// ---------- R17-b URL 掩码回归基线 ----------
ok('R17b-协议相对URL保留', cleanContentHtml('<p>阅读地址：//77shuku.net/x 看正文</p>', NO_AD).includes('//77shuku.net/x'), JSON.stringify(cleanContentHtml('<p>阅读地址：//77shuku.net/x 看正文</p>', NO_AD)))
ok('R17b-裸域名照删', !cleanContentHtml('<p>请访问www.77shuku.com阅读</p>', NO_AD).includes('77shuku'), JSON.stringify(cleanContentHtml('<p>请访问www.77shuku.com阅读</p>', NO_AD)))
ok('R17b-带scheme完整URL保留', cleanContentHtml('<p>访问https://example.com/book看正文</p>', NO_AD).includes('https://example.com/book'), JSON.stringify(cleanContentHtml('<p>访问https://example.com/book看正文</p>', NO_AD)))

// ---------- 其他基线 ----------
ok('标题清洗基线1', cleanChapterTitle('第1章 转折_www.x.com首发') === '第1章 转折', JSON.stringify(cleanChapterTitle('第1章 转折_www.x.com首发')))
ok('标题清洗基线2', cleanChapterTitle('第2章 龙争-虎斗 www.y.com') === '第2章 龙争-虎斗', JSON.stringify(cleanChapterTitle('第2章 龙争-虎斗 www.y.com')))
ok('简介基线', cleanIntro('<p>简介一</p><p>简介二</p>', NO_AD as any) === '简介一\n简介二', JSON.stringify(cleanIntro('<p>简介一</p><p>简介二</p>')))
ok('实体单遍解码基线', cleanTextField('&amp;lt;保持字面') === '&lt;保持字面', JSON.stringify(cleanTextField('&amp;lt;保持字面')))
ok('CRLF归一基线(plainText)', cleanContentHtml('段一\r\n段二', { ...NO_AD, plainText: true }) === '段一\n\n段二', JSON.stringify(cleanContentHtml('段一\r\n段二', { ...NO_AD, plainText: true })))
ok('0段边界', cleanContentHtml('   \n\n  ', NO_AD) === '' && cleanContentHtml('', NO_AD) === '')

console.log(`\n==== 复现结果: PASS=${pass} FAIL=${fail} (FAIL=证实存在缺陷/回归点) ====`)
