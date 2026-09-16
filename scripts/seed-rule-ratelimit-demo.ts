// ============================================================
// 种子脚本: 模拟源站·校准演示 (127.0.0.1:3040) (Task ab-a)
// 用法: bun run scripts/seed-rule-ratelimit-demo.ts
// 幂等: 同名规则先删后建; import.meta.main 守卫
//
// ================= 结构依据(scripts/ratelimit-site.ts 源码逐行) =================
// 模拟源站返回【HTML】四段页面(与真实小说站同构, 非JSON → 引擎 css 型选择器):
//  1) GET /list/{page} → <ul id="list"><li class="book-item">
//       <a href="/book/{id}">书名</a><span>作者</span></li>×8 (每页恒 8 本)
//  2) GET /book/{id} → <div id="maininfo"><h1>书名</h1>
//       <p>作者：xx</p><p>分类：xx</p>
//       <meta name="keywords" content="书名,分类,作者">
//       <div id="intro">简介</div>
//       <a id="toclink" href="/toc/{id}">查看完整目录</a></div>
//  3) GET /toc/{id} → <dl id="toc"><dd><a href="/chapter/{id}/{n}">第n章 xx</a></dd>×60
//  4) GET /chapter/{id}/{n} → <div id="content"><h2>章名</h2><p>…</p>×4</div>
// 规则本身与校准探测相互独立(校准探"源站耐受度"而非"规则解析力"), 但本规则
// enabled=true 参与 calibrate-all 全量校准; 同时可供真实采集任务端到端验证
// (校准参数落库 + 任务级覆盖 → 观察限流冷却与采集统计)。
// ============================================================
import { seedRuleIdempotent, testSection } from './_seed-lib'

export {}
export const RULE_NAME = '模拟源站·校准演示 (127.0.0.1:3040)'

export const SITE_BASE = 'http://127.0.0.1:3040'

export const ruleConfig = {
  list: {
    enabled: true,
    urlTemplate: `${SITE_BASE}/list/{page}`,
    itemSelector: { type: 'css', expression: 'ul#list li.book-item' },
    fields: {
      name: { type: 'css', expression: 'a', attr: 'text' },
      author: { type: 'css', expression: 'span', attr: 'text' },
      // 相对路径 /book/{id} → parseList 按列表页 URL absolutize 补全 host
      bookUrl: { type: 'css', expression: 'a', attr: 'href' },
    },
    pagination: { enabled: false, maxPages: 1 },
  },
  book: {
    enabled: true,
    fields: {
      name: { type: 'css', expression: '#maininfo h1', attr: 'text' },
      author: {
        type: 'css',
        expression: '#maininfo p:nth-of-type(1)',
        attr: 'text',
        replaceFrom: '^作者：',
        replaceTo: '',
      },
      category: {
        type: 'css',
        expression: '#maininfo p:nth-of-type(2)',
        attr: 'text',
        replaceFrom: '^分类：',
        replaceTo: '',
      },
      keywords: { type: 'css', expression: 'meta[name="keywords"]', attr: 'content' },
      intro: { type: 'css', expression: '#intro', attr: 'text' },
    },
  },
  toc: {
    enabled: true,
    // 书籍页 "查看完整目录" 链接 → /toc/{id}(absolutize 按书籍页 URL)
    tocLink: { type: 'css', expression: 'a#toclink', attr: 'href' },
    itemSelector: { type: 'css', expression: 'dl#toc dd' },
    fields: {
      title: { type: 'css', expression: 'a', attr: 'text' },
      url: { type: 'css', expression: 'a', attr: 'href' },
    },
    // 目录单页全量 60 章, 无翻页
    pagination: { enabled: false, maxPages: 1 },
  },
  content: {
    enabled: true,
    fields: {
      content: { type: 'css', expression: 'div#content', attr: 'html' },
    },
    pagination: { enabled: false, maxPages: 1 },
  },
  fetch: {
    engine: 'http',
    // [R30-5-6] 回写 R28-4-L8 修复(修前只改了生成物 builtin-rules.ts 未回写种子, 种子↔生成物漂移,
    // 重跑生成器会静默回退该修复 —— R30-4 审计 B-1): 四段源站是本机 127.0.0.1:3040 模拟站,
    // 无此声明时经规则测试面板/采集任务的 fetchPage 链路会被 SSRF 守卫必拒(仅 calibrate 可用);
    // sanitize 白名单显式接受该字段(types.ts allowLoopback), 仅放宽 loopback, 私网/元数据仍硬拒
    allowLoopback: true,
    // 校准探测与生产引擎 uaMode=rotate 同款浏览器指纹轮换(strict 档 UA 指纹检测也过得去)
    uaMode: 'rotate',
    autoCookie: true,
    referer: true,
    timeout: 20000,
    retries: 2,
    waitMs: 500,
    // 初始值; 全量校准后由 recommended.hostGateLimit 覆盖落库
    hostGateLimit: 3,
  },
  clean: {
    removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript'],
    // 模拟源站正文无广告形态
    adPatterns: [],
    whitelist: ['p', 'br', 'b', 'strong', 'em', 'i', 'u', 'h2'],
    normalize: true,
    plainText: true,
  },
}

// ---------- 四段测试(播种前验证规则可被引擎解析) ----------
async function main() {
  const cfg = ruleConfig as Record<string, any>
  let allPass = true

  console.log('== 模拟源站(127.0.0.1:3040) 四段测试 ==')
  const list = await testSection({ config: ruleConfig }, 'list', `${SITE_BASE}/list/1`, cfg.list)
  if (!list || (list.count as number) < 8) allPass = false

  const book = await testSection({ config: ruleConfig }, 'book', `${SITE_BASE}/book/1`, cfg.book)
  if (!book || !book.fields || !(book.fields as Record<string, string>).name) allPass = false

  const toc = await testSection({ config: ruleConfig }, 'toc', `${SITE_BASE}/toc/1`, cfg.toc)
  if (!toc || (toc.count as number) < 60) { allPass = false; console.log('  !! toc<60 未过线') }

  const content = await testSection({ config: ruleConfig }, 'content', `${SITE_BASE}/chapter/1/1`, cfg.content)
  if (!content || (content.cleanedLength as number) < 100) { allPass = false; console.log('  !! content<100 未过线') }

  // [R11-d-6] 幂等入库收敛至 scripts/_seed-lib.ts(description 字面量保留原位, 供 import-all extractDescription 全文提取)
  await seedRuleIdempotent({
    name: RULE_NAME,
    description:
      '极限校准演示规则(zz-a 校准系统实战, ab-a): 四段指向本机模拟源站 scripts/ratelimit-site.ts(127.0.0.1:3040, ' +
      'standard 档 60req/60s 窗+2s 突发窗 6+429×5→临时封60s)。HTML 四段 css 型选择器: ' +
      'list=/list/{page}(8本) / book=#maininfo / toc=#toc dd(60章) / content=#content。' +
      '用途: calibrate-all 全量校准 + 校准参数落库后真实采集任务端到端验证。⚠ 源站仅本地 3040 常驻, 生产环境无此站。',
    enabled: true,
    config: ruleConfig,
  })
  if (!allPass) process.exit(2)
  console.log('✅ 四段测试全部过线(list=8, toc=60, content≥100)')
}

if (import.meta.main) main()
