import { cleanContentHtml } from './src/lib/crawl/cleaner'
import { jsonGet, jsonArrayAt } from './src/lib/crawl/parser'
const NO_AD = { adPatterns: [] as string[] }
// P3 HTML 对照: td 必须在 table 容器内(parse5 才构建表格 DOM)
console.log('td-in-table HTML:', JSON.stringify(cleanContentHtml('<table><tr><td>甲</td><td>乙</td></tr></table>', NO_AD)))
console.log('li HTML:', JSON.stringify(cleanContentHtml('<ul><li>甲</li><li>乙</li></ul>', NO_AD)))
// P6 正确形态: 过滤后数组经数字下标取值
const root = { list: [{ name: 'a&b', v: 1 }, { name: 'c', v: 2 }] }
console.log('jsonGet %26 解码:', JSON.stringify(jsonGet(root, 'list[name=a%26b].0.v')))
console.log('jsonGet 字面%26(应undefined):', JSON.stringify(jsonGet(root, 'list[name=a%26b.x].0.v'.replace('%26b.x','a%26b') )))
// 实际测 decode: 用未转义形态对照
console.log('jsonAt 字面:', JSON.stringify(jsonArrayAt(root, 'list[name=a%26b]')))
// R17b 裸域名: 用默认 adPatterns
console.log('裸域名默认patterns:', JSON.stringify(cleanContentHtml('<p>请访问www.77shuku.com阅读</p>')))
// plainText 模式 + 默认广告(广告清洗在换行前跑, 行内抹除语义)
console.log('plainText默认:', JSON.stringify(cleanContentHtml('<p>正文开始</p><p>请访问www.77shuku.com阅读</p><p>正文结束</p>', { plainText: true })))
