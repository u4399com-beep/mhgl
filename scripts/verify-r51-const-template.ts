// [R51-3-b] constTemplate 算术后缀 + arithPlaceholderIncomplete 预检 单测(TS 侧移植验证)
// 语义权威: mini-services/crawler-go/internal/rule/parse.go:825-920(预检1/2/3 + 渲染)与
//           internal/rule/rule_test.go TestConstTemplateArithmetic 用例(逐条对齐)
// 用法: bun scripts/verify-r51-const-template.ts
import { extractField, arithPlaceholderIncomplete } from '../src/lib/crawl/parser'
import { type FieldRule } from '../src/lib/crawl/types'

const constRule = (expression: string): FieldRule => ({ type: 'const', expression })

/** 走 extractField const 臂(生产路径: 预检→渲染一体), $/scope/doc 在 const 臂不消费 */
function render(expr: string, vars?: Record<string, string>): string {
  return extractField('', null as unknown as Parameters<typeof extractField>[1], null, null, constRule(expr), { vars })
}

function main() {
  let pass = 0
  let fail = 0
  const expect = (got: unknown, want: unknown, msg: string) => {
    const ok = got === want
    if (ok) { pass++; console.log(`  ✓ ${msg}`) }
    else { fail++; console.log(`  ✗ ${msg} — got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) }
  }

  console.log('[A] 渲染语义(对齐 Go rule_test.go 用例)')
  // floor除法-bqg713封面(R49-9 原始缺陷现场: TS 引擎曾产字面残 URL)
  expect(
    render('https://www.bqg616.cc/bookimg/{q.id|/1000}/{q.id}.jpg', { 'q.id': '4321' }),
    'https://www.bqg616.cc/bookimg/4/4321.jpg',
    'floor除法-bqg713封面: 4321 → 4',
  )
  expect(
    render('https://www.bqg616.cc/bookimg/{q.id|/1000}/{q.id}.jpg', { 'q.id': '123456' }),
    'https://www.bqg616.cc/bookimg/123/123456.jpg',
    'floor除法-bqg713封面: 123456 → 123',
  )
  expect(render('{v|/1000}', { v: '1000' }), '1', 'floor除法-边界1000: 1000 → 1')
  expect(render('{v|+100}', { v: '50' }), '150', '加法: 50+100 → 150')
  expect(render('{v|-10}', { v: '50' }), '40', '减法: 50-10 → 40')
  expect(render('{v|+5}', { v: '2' }), '7', '加法: 2+5 → 7')
  expect(render('{v|-5}', { v: '2' }), '-3', '减法: 2-5 → -3')
  expect(render('hello-{name}', { name: '世界' }), 'hello-世界', '普通占位符渲染')
  expect(render('{v|/0}', { v: '10' }), '', '除零 → 整体置空(fail-closed)')
  expect(render('https://x/{q.id|/1000}/{q.id}.jpg', { other: '1' }), '', '缺变量 → 整体置空(fail-closed)')
  expect(render('{v|/10}', { v: 'abc' }), '', '非数 → 整体置空(fail-closed)')
  expect(render('{v|*2}', { v: '10' }), '', '未知算子 → 整体置空(fail-closed)')
  expect(render('{v|/1000', { v: '10' }), '', '未闭合 {v|/1000 → 整体置空(fail-closed)')
  expect(render('{v|/1.5}', { v: '10' }), '', '非整数 N({v|/1.5}) → 整体置空(fail-closed)')
  expect(render('a{missing}b', { v: '1' }), 'ab', '纯 {name} 缺失 → 仅置空该占位符(既有语义不变)')
  expect(render('https://example.com/static.jpg', { v: '1' }), 'https://example.com/static.jpg', '无占位符 → 原样(既有语义不变)')
  expect(render('p{v}p', { v: '9' }), 'p9p', '纯 {name} 命中(既有语义不变)')

  console.log('[A2] R52-5 P2 双侧对齐向量(TS/Go 逐组一致: Go rule_test.go 同名用例)')
  // a. 空后缀 {v|}: TS 整字段置空(fail-closed); Go 修前按纯占位符渲染原值, 修后同置空
  expect(render('https://x/img/{v|}.jpg', { v: '42' }), '', '空后缀 {v|} → 整体置空(fail-closed, 对齐 Go)')
  // b. 非有限数: TS Number.isFinite 拒绝; Go 修前 ParseFloat 放行渲染 "+Inf"/"NaN", 修后同置空
  expect(render('https://x/img/{v|/1000}/a.jpg', { v: 'Infinity' }), '', 'Infinity 输入 → 整体置空(对齐 Go)')
  expect(render('{v|+5}', { v: '+Inf' }), '', '+Inf 输入 → 整体置空(对齐 Go)')
  expect(render('https://x/img/{v|/1000}/a.jpg', { v: 'NaN' }), '', 'NaN 输入 → 整体置空(对齐 Go)')
  expect(render('{v|-1}', { v: '-NaN' }), '', '-NaN 输入 → 整体置空(对齐 Go)')
  // c. N 上限口径 \d{1,6}: 7 位 N TS 预检即整体置空; Go 修前 [0-9]+ 放行, 修后同置空; 6 位合法
  expect(render('{v|/1234567}', { v: '1234567' }), '', '7位N {v|/1234567} → 整体置空(对齐 Go)')
  expect(render('{v|/123456}', { v: '123456' }), '1', '6位N {v|/123456} 合法 → 1(对齐 Go)')
  // [R52-5 P3] 算术臂值 trim(TS 既有 String(v).trim(); Go 修后同口径) 与 ≥1e21 大数 JS 科学计数
  expect(render('{v|/1000}', { v: ' 42 ' }), '0', '算术臂值 trim → floor(42/1000)=0(对齐 Go)')
  expect(render('{v|+0}', { v: '1e21' }), '1e+21', '1e21 大数 → JS String 科学计数形态(对齐 Go)')

  console.log('[B] arithPlaceholderIncomplete 预检布尔断言')
  expect(arithPlaceholderIncomplete('https://www.bqg616.cc/bookimg/{q.id|/1000}/{q.id}.jpg', { 'q.id': '123456' }), false, '合法算术模板 → false')
  expect(arithPlaceholderIncomplete('{v|/1000}', {}), true, '缺变量 → true')
  expect(arithPlaceholderIncomplete('{v|/0}', { v: '10' }), true, '除零 → true')
  expect(arithPlaceholderIncomplete('{v|/10}', { v: 'abc' }), true, '非数 → true')
  expect(arithPlaceholderIncomplete('{v|/10}', { v: '' }), true, '变量空串 → true')
  expect(arithPlaceholderIncomplete('{v|*2}', { v: '10' }), true, '未知算子 → true')
  expect(arithPlaceholderIncomplete('{v|/1000', { v: '10' }), true, '未闭合 → true')
  expect(arithPlaceholderIncomplete('{v|/1.5}', { v: '10' }), true, '非整数 N → true')
  expect(arithPlaceholderIncomplete('{v|}', { v: '10' }), true, '空后缀 {v|} → true')
  expect(arithPlaceholderIncomplete('hello-{name}', { name: '世界' }), false, '纯 {name} 模板 → false(零回归)')
  expect(arithPlaceholderIncomplete('{missing}', {}), false, '纯 {name} 缺失 → false(渲染期置空该占位)')
  expect(arithPlaceholderIncomplete('https://example.com/static.jpg', undefined), false, '无占位符 → false')
  expect(arithPlaceholderIncomplete('', undefined), false, '空表达式 → false')

  console.log(`\n结果: ${pass} pass / ${fail} fail`)
  process.exit(fail > 0 ? 1 : 0)
}

main()
