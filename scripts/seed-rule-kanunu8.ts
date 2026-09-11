// 种子脚本: 努努书坊 (www.kanunu8.com) 中文综合书坊采集规则
// 用法: bun run scripts/seed-rule-kanunu8.ts
// 侦察结论(实测):
//  - 直连 200 无防护(极简 UA "Mozilla/5.0" 会被 403, UA_POOL 全量 UA 均放行); GBK 编码,
//    fetcher.decodeBuffer 按 <meta charset=gbk> 自动解码
//  - 四层: 列表(分类页, 表格行 <table><td><a target='_blank'>书名</a>, {page} 分页如
//    /files/chinese/29-{page}.html 1~10 页; /wuxia/ 类分类用 2.html 数字页码, 模板不同)
//    / 书籍页 / 目录(内嵌书籍页) / 正文(相对 NNNNN.html)
//  - 站点存在三代页面布局, 规则用组合选择器兼容:
//    * 书籍页: 新版 css2024(.catalog h1 + .info + .intro) 与 旧版 book_2015(表格 h1 +
//      "作者：X 发布时间" td + 内容简介 td.p10-24) —— h1/作者regex/td.p10-24:contains 全兼容
//    * 目录: 新旧布局章节链接均为相对 <a href="NNNNNN.html">标题</a>(导航链接带 / 或 http
//      前缀), 用 regex itemSelector 一次通吃三代书籍页
//    * 正文三容器: 新版 #neirong / 旧版 td[width="820"] / html5版 #Article .text
//  - 正文"下一页"指向下一章(非章内分页), content 翻页必须关闭, 否则多章被并进一章
//  - 已知源站瑕疵: 站内敏感词替换(如"乳房"→"Rx房")烙在源文本里, 清洗无法还原;
//    &nbsp; 缩进由 cleaner normalize 处理
import { RuleSeed, seedRuleIdempotent, testSection } from './_seed-lib'

// 测试探针(覆盖三代布局):
//  - list: /files/chinese/ 第1页(表格列表)
//  - book/toc: 听雪楼 /book2/11009/ (新版书籍页, 目录 87 项 ≥50)
//  - content: 听雪楼 html5 版正文页(约 5700 字 ≥2000)
//  - 附加布局兼容性探针(仅报告不设门槛): 新版 #neirong 正文 / 旧版 丰乳肥臀 书籍页+目录(71项)+正文
const PROBE = {
  list: 'https://www.kanunu8.com/files/chinese/29-1.html',
  book: 'https://www.kanunu8.com/book2/11009/index.html',
  toc: 'https://www.kanunu8.com/book2/11009/index.html',
  content: 'https://www.kanunu8.com/book2/11009/198281.html',
  // 布局兼容性附加探针
  contentNew: 'https://www.kanunu8.com/book5/chandlizhi/39362.html',
  tocOld: 'https://www.kanunu8.com/book3/8255/',
  bookOld: 'https://www.kanunu8.com/book3/8255/',
  contentOld: 'https://www.kanunu8.com/book3/8255/182598.html',
}

const rule: RuleSeed = {
  name: '努努书坊(www.kanunu8.com)·中文综合书坊采集',
  description:
    'kanunu8.com 直连无防护 GBK 老站。列表=分类表格行 table a[target=_blank](29-{page}.html 分页, /zt/ 专题链接置空剔除) / 书籍页 h1+作者regex+简介(新版 .intro 与旧版 td.p10-24:contains 双兼容) / 目录 regex 兼容三代书籍页内嵌章节链(相对 NNNNN.html) / 正文三容器兼容(#neirong, td[width=820], #Article .text)。正文"下一页"是下一章 → content 翻页关闭。源站自带敏感词替换(Rx房)无法清洗。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      // 分类页分页模板: /files/chinese/ 29-1.html~29-10.html(每页约 217 本)。
      // 其他分类分页路径不同(/wuxia/ 是 2.html 数字页码), 需要更多书时换分类变体:
      //   https://www.kanunu8.com/files/world/8-{page}.html / /files/yuanchuang/ 等
      urlTemplate: 'https://www.kanunu8.com/files/chinese/29-{page}.html',
      itemSelector: { type: 'css', expression: "table a[target='_blank']" },
      fields: {
        name: { type: 'css', expression: 'a', attr: 'text' },
        bookUrl: {
          type: 'css', expression: 'a', attr: 'href',
          // /zt/ 专题页是多书聚合页非单本, 置空 bookUrl 使 runner 丢弃(runner 按 url||bookUrl 过滤)
          replaceFrom: '^/zt/.*$', replaceTo: '',
        },
      },
      pagination: { enabled: false, maxPages: 1 },
    },
    book: {
      enabled: true,
      fields: {
        name: { type: 'css', expression: 'h1', attr: 'text' },
        author: {
          type: 'regex',
          // 兼容新版 "作者：马伯庸" 与旧版 "作者：莫言 发布时间：2012-10-12"
          expression: '作者[:：]\\s*([^\\s<]{1,30})', attr: '1', flags: 'gs',
        },
        intro: { type: 'css', expression: '.intro, td.p10-24:contains("内容简介")', attr: 'html' },
      },
    },
    toc: {
      enabled: true,
      // 三代书籍页章节链接统一为相对 <a href="NNNNNN.html">标题</a>;
      // 导航/作品集链接带 / 或 http 前缀, index.html 非纯数字, regex 天然排除
      itemSelector: { type: 'regex', expression: '<a href="\\d{4,8}\\.html">[^<]{1,120}</a>', attr: '0', flags: 'gi' },
      fields: {
        title: { type: 'regex', expression: '<a href="\\d+\\.html">([^<]+)</a>', attr: '1', flags: 'gi' },
        url: { type: 'regex', expression: 'href="(\\d+\\.html)"', attr: '1', flags: 'gi' },
      },
      pagination: { enabled: false, maxPages: 1 },
    },
    content: {
      enabled: true,
      fields: {
        content: { type: 'css', expression: '#neirong, td[width="820"], #Article .text', attr: 'html' },
      },
      // 关键: 站点"下一页"链接指向下一章, 开启翻页会把多章并进一章
      pagination: { enabled: false, maxPages: 1 },
    },
    fetch: {
      engine: 'http',
      uaMode: 'rotate',
      autoCookie: true,
      referer: true,
      timeout: 25000,
      retries: 2,
      waitMs: 800,
      browserFallbackStatus: [403, 412, 429, 503],
    },
    clean: {
      removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript', '.adsbygoogle', 'p[align="center"]'],
      // ↑ p[align=center]: html5 版正文容器内嵌的 上一页/回目录/下一页 导航段(cleaner 导航
      //   链接正则只剥 <a> 不识别"回目录"文本, 直接移除整段最稳; 其余布局正文无此结构)
      adPatterns: [
        '(www\\.)?kanunu8\\.com\\S*',
        '本站内容来源于网络[^。<>]*',
        '本站作品收集整理自网络[^<>]*',
        '请记住本站[^<>]*',
        '(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?',
        '本章未完.*?点击下一页继续阅读',
      ],
      whitelist: ['p', 'br', 'b', 'strong', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      normalize: true,
      plainText: false,
    },
  },
}

// ---------- 四段测试 ----------
async function main() {
  const cfg = rule.config as Record<string, any>
  let allPass = true

  console.log('== kanunu8 四段测试 ==')
  const list = await testSection(rule, 'list', PROBE.list, cfg.list)
  if (!list || (list.count as number) < 10) allPass = false

  const book = await testSection(rule, 'book', PROBE.book, cfg.book)
  if (!book || !book.fields || !(book.fields as Record<string, string>).name) allPass = false

  const toc = await testSection(rule, 'toc', PROBE.toc, cfg.toc)
  if (!toc || (toc.count as number) < 50) { allPass = false; console.log('  !! toc<50 未过线') }

  const content = await testSection(rule, 'content', PROBE.content, cfg.content)
  if (!content || (content.cleanedLength as number) < 2000) { allPass = false; console.log('  !! content<2000 未过线') }

  console.log('== 布局兼容性附加探针(不设门槛, 仅报告) ==')
  await testSection(rule, 'content', PROBE.contentNew, cfg.content) // 新版 #neirong
  await testSection(rule, 'book', PROBE.bookOld, cfg.book) // 旧版 2015 表格书籍页
  await testSection(rule, 'toc', PROBE.tocOld, cfg.toc) // 旧版表格目录(71项)
  await testSection(rule, 'content', PROBE.contentOld, cfg.content) // 旧版 td[width=820] 正文

  // [R11-d-6] 幂等入库收敛至 scripts/_seed-lib.ts(同名规则含历史重复全删后建; 失败 exit(1))
  await seedRuleIdempotent(rule)

  console.log(allPass ? '✅ 四段测试全部过线(toc≥50, content≥2000)' : '❌ 存在未过线段落, 见上方日志')
  if (!allPass) process.exit(2)
}

main()

export {}

