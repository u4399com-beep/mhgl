// ============================================================
// [R51-4] 章节重排统一模块 + 代理解析单实现 回归哨兵
// 覆盖: staleTailGuardDecision(R36-2c-1 原版 13 断言语义, 实现下沉 chapter-reorder 后不回归)
//      + planChapterSync/chapterTempBase/chapterTailMoves(两调用点行为不变性核心场景)
//      + parseProxyParts(R17-d-2 逐组件安全解码 + P3-11 obscura 副本漂移消除)
// 运行: bun scripts/verify-r51-4-chapter-reorder.ts
// ============================================================
import { planChapterSync, chapterTempBase, chapterTailMoves, staleTailGuardDecision, type ReorderExistChapter } from '../src/lib/crawl/chapter-reorder'
import { parseProxyParts } from '../src/lib/crawl/proxy-parts'

let pass = 0
let fail = 0
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}: got ${a}, want ${b}`)
  }
}
function ok(name: string, cond: boolean) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}`)
  }
}

const ex = (id: string, url: string, title: string, idx: number, volume = '', fetched = true): ReorderExistChapter => ({
  id, url, title, idx, volume, fetched,
})

// ---------------- staleTailGuardDecision(R36-2c-1 语义保持) ----------------
console.log('— staleTailGuardDecision(统一保守闸, 语义权威=runner 口径) —')
// 斗破式: 1600 章书 TOC 翻页截到 500 → stale=1100, 基线 1600(阈值 480), 本轮 500 章全部与既有
// 精确命中(前缀子集) → creates=0(≤10% 签名闸命中)
ok('斗破式截断拦截', staleTailGuardDecision(1100, 1600, 0, 500).skip === true)
// 常规清理放行: 少量陈旧章 + creates 占比高(正常追更)
ok('常规清理放行(量不足)', staleTailGuardDecision(3, 1600, 100, 1600).skip === false)
// 迁移场景放行: 源站全量换 URL, creates≈全部 → 签名闸不命中
ok('迁移场景放行(签名闸不命中)', staleTailGuardDecision(1100, 1600, 480, 500).skip === false)
// 小书截断拦截: 200 章书 TOC 截到 20 → stale 180 > max(50,60) 且 creates 20≤2? 否 — creates=20/20 全新
ok('小书全量重建不拦截(签名闸)', staleTailGuardDecision(180, 200, 20, 20).skip === false)
ok('小书前缀截断拦截', staleTailGuardDecision(180, 200, 2, 20).skip === true)
// 50 地板: 基线 0 → 阈值 50
eq('50 地板阈值', staleTailGuardDecision(51, 0, 0, 10).threshold, 50)
// creates 恰 10% 边界(≤ 命中签名)
ok('creates 恰 10% 命中签名', staleTailGuardDecision(100, 100, 10, 100).skip === true)
ok('creates 超 10% 不命中签名', staleTailGuardDecision(100, 100, 11, 100).skip === false)
// stale 恰等阈值(> 才拦)
ok('stale 恰等阈值放行', staleTailGuardDecision(30, 100, 5, 100).skip === false)
ok('负基线钳 0(阈值仍 50)', staleTailGuardDecision(51, -10, 1, 100).skip === true && staleTailGuardDecision(51, -10, 1, 100).threshold === 50)
// 空 TOC: 签名闸 false(tocLen=0)
ok('空 TOC 不拦截', staleTailGuardDecision(100, 100, 0, 0).skip === false)

// ---------------- planChapterSync(匹配/建行/挪动/分卷回填) ----------------
console.log('— planChapterSync(增量匹配场景) —')
// 场景1: 增量 + 末尾新章 → 旧章不挪, 新章建行
{
  const exist = [ex('a', 'u1', '第一章', 1)]
  const plan = planChapterSync(
    [{ title: '第一章', url: 'u1' }, { title: '第二章', url: 'u2' }],
    exist, { isFull: false },
  )
  eq('creates=新章', plan.creates.map((c) => [c.url, c.idx]), [['u2', 2]])
  eq('moves=空', plan.moves, [])
  eq('queue 成员(isNew)=两项', plan.items.filter((i) => i.isNew).map((i) => i.url), ['u2'])
  eq('volumeBackfill=空', plan.volumeBackfill, [])
}
// 场景2: 序号漂移 → moves(阶段A/D), kk-a 分卷回填顺带
{
  const exist = [ex('a', 'u1', '第一章', 2), ex('b', 'u2', '第二章', 1)]
  const plan = planChapterSync(
    [{ title: '第一章', url: 'u1', volume: '卷一' }, { title: '第二章', url: 'u2' }],
    exist, { isFull: false },
  )
  eq('moves=双挪', plan.moves, [{ id: 'a', to: 1 }, { id: 'b', to: 2 }])
  eq('kk-a 回填(挪动章)', plan.volumeBackfill, [{ id: 'a', volume: '卷一' }])
}
// 场景3: [R31-5-4] 跨卷同名章(无 URL)按 volume+'\u0000'+title 精确匹配
{
  const exist = [ex('a', '', '序章', 1, '卷一'), ex('b', '', '序章', 2, '卷二')]
  const plan = planChapterSync(
    [{ title: '序章', url: '', volume: '卷一' }, { title: '序章', url: '', volume: '卷二' }],
    exist, { isFull: false },
  )
  eq('跨卷同名不误挪', plan.moves, [])
  eq('无 URL 章不建行', plan.creates, [])
}
// 场景4: isFull → 全部 isNew(含无 URL 项), creates 仅含 url 项
{
  const exist = [ex('a', 'u1', '第一章', 1)]
  const plan = planChapterSync(
    [{ title: '第一章', url: 'u1' }, { title: '插图页', url: '' }],
    exist, { isFull: true },
  )
  eq('全量 isNew=全部', plan.items.every((i) => i.isNew), true)
  eq('全量 creates=有 url 项', plan.creates.map((c) => c.url), ['u1'])
  eq('全量 moves=空', plan.moves, [])
}
// 场景5: 标题清洗消费(cleanChapterTitle 去书名前缀)与 volume 码点截断
{
  const plan = planChapterSync([{ title: '书名 第一章', url: 'u1', volume: '卷'.repeat(150) }], [], { isFull: true, bookName: '书名' })
  ok('书名前缀已清洗', plan.creates[0].title === '第一章')
  eq('volume 码点截断 120', plan.creates[0].volume.length, 120)
}

// ---------------- chapterTempBase / chapterTailMoves(tt-c/x-a 场景) ----------------
console.log('— chapterTempBase / chapterTailMoves —')
// tt-c: 崩溃残留负位 -1 在库 → 动态基线压到其下
{
  const exist = [ex('a', 'u1', '一', 1), ex('res', 'u9', '残留', -1)]
  eq('残留负位 -1 → tempBase -3(moves=1)', chapterTempBase(exist, 1), -3)
  eq('空库 → tempBase(moves=2)', chapterTempBase([], 2), -3)
}
// x-a: 陈旧章占住 moves 目标位 → 挪尾; 负位残留 → 治愈挪尾; movedIds 不重复挪
{
  const exist = [
    ex('stale', 'u-stale', '陈旧', 2), // 占住目标位 idx=2
    ex('neg', 'u-neg', '负残', -1),    // 负位残留
    ex('keep', 'u-keep', '保留', 3),
  ]
  const plan = planChapterSync(
    [{ title: '新一', url: 'n1' }, { title: '新二', url: 'n2' }],
    exist, { isFull: false },
  )
  // n1/n2 均为新章(creates idx 1/2), keep idx=3 不冲突不动
  const tailMoves = chapterTailMoves(exist, plan)
  // tailIdx 基线=max(tocLen=2, 存量最大 idx=3)=3 → 首个尾位 4(与修前算法一致)
  eq('占位陈旧章+负残均挪尾', [...tailMoves.entries()], [['stale', 4], ['neg', 5]])
}

// ---------------- parseProxyParts(单一实现, R17-d-2 + P3-11) ----------------
console.log('— parseProxyParts —')
{
  const r = parseProxyParts('http://user:p%40ss@host.example:8080')
  eq('凭证拆出+合法解码', r, { server: 'http://host.example:8080', username: 'user', password: 'p@ss' })
  ok('server 恒无凭证', !r.server.includes('@'))
}
{
  // P3-11 修复锚点: 密码含非法 % 序列 → 仅该组件回退原编码值, 凭证绝不落 server
  const r = parseProxyParts('http://u:a%80b@h:1')
  eq('非法 % 序列逐组件回退', r, { server: 'http://h:1', username: 'u', password: 'a%80b' })
  const r2 = parseProxyParts('http://u%zz:p@h:1')
  eq('用户名非法 % 序列同容错', r2, { server: 'http://h:1', username: 'u%zz', password: 'p' })
}
{
  eq('无凭证原样返回', parseProxyParts('socks5://h:1080'), { server: 'socks5://h:1080' })
  eq('非法 URL 原样返回', parseProxyParts('not a url'), { server: 'not a url' })
}

console.log(`\n结果: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
