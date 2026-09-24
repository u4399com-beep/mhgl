// ============================================================
// 种子脚本: 33言情 (www.x33yq.org) 采集规则 [R43-1c]
// 用法: bun run scripts/seed-rule-x33yq.ts
//
// 规则来源(R43-1c 实抓实证, 大陆代理 120.232.115.170:17981 出口):
//  - 快照 /tmp/r43-snap/(home/sort1/top/book/toc/read/history + common.css/style.css)
//  - 结构 = 杰奇家族 alistbox 变体(与 trxsw 同构): 列表 div[id=alistbox](.pic a/.title h2 a/
//    .title span 作者/.info .intro/.info .sys 最新更新), 书页 h1.f21h+em a 作者+.box_intro
//    div.intro+.box_intro .pic img, 目录链 .btopt a(开始阅读)→/read/{bid}/, 目录 #list dl dd,
//    正文 #content(章节页 id=content + h1 章名)
//  - 分类 URL /sort/{1..18}/(分页 /sort/1/{n}/, n>=2; 页1=/sort/1/ — 模板 {page} 1 基,
//    /sort/1/1/ 与 trxsw /sort/4/{page} 同族同构, 试采复验)
//  - 源站需大陆出口 IP(香港直连/cloak 浏览器均连接级拒绝, R43 实测) — fetch.needsProxy=true
//    +proxyCountries=CN, 走 R42 代理池自动匹配链路
// ============================================================
import { RuleSeed, seedRuleIdempotent } from './_seed-lib'

export const rule: RuleSeed = {
  name: '33言情小说网 (x33yq.org)·代理池采集',
  description:
    'x33yq.org 33言情(杰奇家族 alistbox 变体, UTF-8)。列表=/sort/{1..18}/{page}(页码1基), div[id=alistbox] 条目(.pic 封面/.title h2 a 书名/.title span 作者/.info .intro/.info .sys 最新章); 书页 h1.f21h+.box_intro(简介/封面 img.x33yq.org); 目录链 .btopt a→/read/{bid}/(全量单页 #list dl dd); 正文 #content。\n⚠ 源站需大陆出口 IP(R43 实测: 香港直连/cloak 均拒绝, CN 代理 120.232.115.170 HTTP 200) — needsProxy=true+proxyCountries=CN 走代理池自动匹配; 已单本试采验证。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      urlTemplate: 'https://www.x33yq.org/sort/1/{page}',
      itemSelector: { type: 'css', expression: "div[id='alistbox']" },
      fields: {
        name: { type: 'css', expression: '.title h2 a', attr: 'text', replaceFrom: '[《》]', replaceTo: '' },
        bookUrl: { type: 'css', expression: '.pic a', attr: 'href' },
        author: { type: 'css', expression: '.title span', attr: 'text', replaceFrom: '^作者[:：]\\s*', replaceTo: '' },
        intro: { type: 'css', expression: '.info .intro', attr: 'text' },
        latestChapter: { type: 'css', expression: '.info .sys a', attr: 'text' },
        cover: { type: 'css', expression: '.pic img', attr: 'src' },
      },
      pagination: { enabled: false, maxPages: 1 },
    },
    book: {
      enabled: true,
      fields: {
        name: { type: 'css', expression: 'h1.f21h', attr: 'text', replaceFrom: '\\s*作者:.*$', replaceTo: '' },
        author: { type: 'css', expression: 'h1.f21h em a', attr: 'text' },
        intro: { type: 'css', expression: '.box_intro div.intro', attr: 'text', replaceFrom: '^\\s*关于.*?[：:]\\s*', replaceTo: '' },
        cover: { type: 'css', expression: '.box_intro .pic img', attr: 'src' },
        status: { type: 'regex', expression: '小说状态[：</b>\\s]{0,20}(连载|已完成|完本)', attr: '1', flags: 'i' },
      },
    },
    toc: {
      enabled: true,
      tocLink: { type: 'css', expression: '.btopt a', attr: 'href' },
      itemSelector: { type: 'css', expression: '#list dl dd' },
      fields: {
        title: { type: 'css', expression: 'a', attr: 'text' },
        url: { type: 'css', expression: 'a', attr: 'href' },
      },
      pagination: { enabled: false, maxPages: 1 },
    },
    content: {
      enabled: true,
      fields: { content: { type: 'css', expression: '#content', attr: 'html' } },
      pagination: { enabled: false, maxPages: 1 },
    },
    fetch: {
      engine: 'http',
      uaMode: 'custom',
      customUa: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      timeout: 30000,
      retries: 2,
      needsProxy: true,
      proxyCountries: 'CN',
      hostGateLimit: 2,
    },
    clean: {
      removeSelectors: ['script', 'style', '.wudu-bar', '.bottem', '.bottem1', '.con_top', '.toolbar'],
      adPatterns: [],
      whitelist: [],
      normalize: true,
      plainText: false,
    },
  },
}

await seedRuleIdempotent(rule)
console.log('[seed-x33yq] done')
