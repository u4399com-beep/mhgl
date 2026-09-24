// 种子脚本: 努努书坊 (www.kanunu8.com) 中文综合书坊采集规则
// 用法: bun run scripts/seed-rule-kanunu8.ts
// [R30-2-3] 依据 2025-09-16 全站活体考据重写(/tmp/r30-kanunu/recon.md, 100+ 样本落盘):
//  - 直连 200 无防护 GBK 老站, fetcher.decodeBuffer 按 <meta charset=gbk/gb2312> 自动 gb18030 解码
//    ([R28-4-L4] FFFD 密度兜底), 规则不硬编码 charset(引擎 FetchConfig 无此字段)
//  - 首页 13 频道: 华文小说 /files/chinese/ 29-{page}.html 为全站最大频道(约 3460 本;
//    页脚只标 1~10, 实测 1~28 页有书, p1 217 本/p11~22 每页约 95 本/23 页后渐变为单文件文章主导);
//    外国文学 8-{page} / 短篇 6-{page} / 科幻 11-{page} / 穿越 /files/yqxs 裸数字 / 武侠 /wuxia/{page}.html /
//    推理 /tuili/list-{page}.html, 其余频道(古代/玄幻/青春/都市/网络原创)单页或同构 —— 换 urlTemplate 即用
//  - 列表条目=三代频道页同构 <table><td><a href='/bookN/…' target='_blank'>作者：书名</a>;
//    采「正则白名单」而非 CSS table a[target=_blank]: 深档(p23+)单文件文章页(/files/....html、/wuxia/….html,
//    无 h1 无章节链采不了目录)、/zt/ 专题聚合页(多书合集)、/files/critic/ 杂项全部被正向排除,
//    旧方案(CSS + /zt/ 置空)对深档文章页无能为力(recon 实测 29-11~28 页混入数百条死条目)
//  - 「作者：书名」列表前缀: name 剥前缀 + author 捕获(书籍页字段优先, 列表仅兜底)
//  - 书籍页三代布局兼容(recon 实测字段结论):
//    * 一代(现行 html5, class=catalog): h1 书名 + .info「作者：X」+ .intro 简介 + .mulu-list 章节链
//      (/book2/ /book4/新 /book5/ /book7/ /101/ /book/部分)
//    * 二代(book_2015 表格布局): h1 内嵌 font/strong + 「作者：X 发布时间」td +
//      td.p10-24:contains(内容简介) 简介(首个 p10-24 是作品集链接, 必须锁定含内容简介者)+
//      4 列表格章节链(/book3/ /tuili/ /book4/旧 /book/旧)
//    * 三代(单文件文章页): 无 h1 无 .intro 无章节链, 无法作书籍采集 —— 已由列表白名单剔除
//    * 源站无封面/分类/状态/字数字段(无 img 封面, 面包屑无分类, 无连载状态)→ 规则不设该四字段, 库中留空
//  - 目录=书籍页内嵌章节链, 统一相对 \d{4,8}.html(实测 id 4~7 位), 单双引号+夹层属性容错;
//    文档序即阅读序(lanxiangyuan 326 链单调递增); 推荐块「看过此书的人还喜欢」链接为 /bookN/ 路径形态
//    (非纯数字相对链)天然不误收; 页脚上一篇/下一篇指向相邻书也不误收; 分卷名(.mulu-title h2)不提取留档
//  - 正文三容器: 新版 #neirong / 旧版表格 td[width=820] / 过渡版 #Article .text(容器内首尾导航段
//    p[align=center] 由 clean.removeSelectors 整段移除); 「下一页」实测=下一章(长章 17K 字不拆页),
//    content 翻页必须关闭, 否则多章被并进一章
//  - 已知残留(如实声明): 源站自带敏感词替换烙在源文本(如"乳房"→"Rx房"), 清洗无法还原;
//    正文 &nbsp;x4 缩进+<br/> 分段由 cleaner normalize 处置
import { RuleSeed, seedRuleIdempotent, testSection } from './_seed-lib'

// 测试探针(覆盖三代布局, recon.md 样本同源):
//  - list: /files/chinese/ 第1页(表格列表, 正则白名单条目)
//  - book/toc: 一代 /book7/meihua94/ (目录 99 项 ≥50)
//  - content: 一代 #neirong 正文页(约 4600 字 ≥2000)
//  - 布局兼容性附加探针(仅报告不设门槛): 二代丰乳肥臀 书籍页+目录(71项)+正文 / 过渡版听雪楼 书籍页+目录(87项)+正文 /
//    长目录兰香缘(326项) / 长章 #neirong 正文(约1.8万字)
const PROBE = {
  list: 'https://www.kanunu8.com/files/chinese/29-1.html',
  book: 'https://www.kanunu8.com/book7/meihua94/',
  toc: 'https://www.kanunu8.com/book7/meihua94/',
  content: 'https://www.kanunu8.com/book7/meihua94/485462.html',
  // 布局兼容性附加探针
  bookOld: 'https://www.kanunu8.com/book3/8255/',
  tocOld: 'https://www.kanunu8.com/book3/8255/',
  contentOld: 'https://www.kanunu8.com/book3/8255/182598.html',
  bookTrans: 'https://www.kanunu8.com/book2/11009/index.html',
  tocTrans: 'https://www.kanunu8.com/book2/11009/index.html',
  contentTrans: 'https://www.kanunu8.com/book2/11009/198281.html',
  tocLong: 'https://www.kanunu8.com/101/lanxiangyuan/',
  contentLong: 'https://www.kanunu8.com/book5/chandlizhi/39362.html',
}

const rule: RuleSeed = {
  name: '努努书坊(www.kanunu8.com)·中文综合书坊采集',
  // [R30-2-3] ≤500 码点(管理 API str(description,500) 截断线), 与 builtin-rules.ts 同文
  description:
    'kanunu8.com 努努书坊, 直连无防护 GBK 站(引擎自动 gb18030 解码)。13 频道, 主用华文小说 29-{page}.html(约3460本, 页脚标10页实测有效至28页), 8-/6-/11-、/wuxia/ 裸数字、/tuili/list- 等换模板即用。列表=正则白名单 /(bookN|tuili|101)/ target=_blank 只收书籍页链, 剔除 /zt/ 专题与 /files|/wuxia/ 单文件文章页(不可采); 「作者：书名」前缀剥离+author 兜底。书籍页三代兼容: 一代 .catalog(h1+.info+.intro) / 二代 book_2015 表格(td.p10-24:contains(内容简介)) / 三代单文件列表已剔; 无封面/分类/状态留空。目录=内嵌相对链 \\d{4,8}.html, 文档序即阅读序。正文三容器 #neirong/td[width=820]/#Article .text; 长章不拆页 → 翻页关闭。残留: 敏感词(Rx房)烙于正文; &nbsp; 由 cleaner 处置; 分卷名不采。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      // /files/chinese/ 29-1~28 实测有效(页脚只标到 10); 其他频道换模板:
      //   https://www.kanunu8.com/files/world/8-{page}.html / /wuxia/{page}.html / /tuili/list-{page}.html 等
      urlTemplate: 'https://www.kanunu8.com/files/chinese/29-{page}.html',
      // [R30-2-3] 正则白名单: href=/(bookN|tuili|101)/ 且 target=_blank(频道页条目全部表格内单/双引号),
      // 正向排除 /zt/ 专题、/files|/wuxia/ 单文件文章页、/files/critic/ 杂项与全部导航链
      itemSelector: {
        type: 'regex',
        expression: '<a\\s+href=["\']/(?:book\\d*|tuili|101)/[^"\']*["\']\\s+target=["\']_blank["\']\\s*>[^<]{1,100}</a>',
        attr: '0',
        flags: 'gi',
      },
      fields: {
        // 「作者：长相思(全集)」形态: 剥「作者：」前缀得纯书名(作者捕获失败时列表仍可入队)
        name: {
          type: 'regex', expression: '>([^<]{1,100})</a>', attr: '1', flags: 'gi',
          replaceFrom: '^[^<>：:]{1,25}[：:]\\s*', replaceTo: '',
        },
        author: { type: 'regex', expression: '>\\s*([^<>：:]{1,25})[：:]', attr: '1', flags: 'gi' },
        bookUrl: { type: 'regex', expression: 'href=["\']([^"\']+)["\']', attr: '1', flags: 'gi' },
      },
      pagination: { enabled: false, maxPages: 1 },
    },
    book: {
      enabled: true,
      fields: {
        // 三代首个 h1 即书名(二代内嵌 font 由块级感知 text 提取剥净)
        name: { type: 'css', expression: 'h1', attr: 'text' },
        // 兼容一代「作者：美华」与二代「作者：莫言 发布时间：2012-10-12」, 首匹配即正主
        author: { type: 'regex', expression: '作者[:：]\\s*([^\\s<]{1,30})', attr: '1', flags: 'gs' },
        // 双候选: 一代 .intro / 二代 td.p10-24:contains(内容简介)(cheerio 并集按文档序首个命中);
        // 剥二代「内容简介：」标签与尾随 br
        intro: {
          type: 'css', expression: '.intro, td.p10-24:contains("内容简介")', attr: 'html',
          replaceFrom: '^(?:<(?:strong|b)>\\s*)?内容简介[:：]?\\s*(?:</(?:strong|b)>)?\\s*(?:<br\\s*/?>\\s*)?', replaceTo: '',
        },
        // [R61-1B] 书页无最新章节行: 贪婪前缀+尾锚 </ul> 使首匹配落在最后一个 .mulu-list 末 li
        // (=真末章, 单卷/多卷通吃; 容忍末尾 <li>&nbsp; 填充行, kanunu8 书页目录内嵌形态)
        latestChapter: { type: 'regex', expression: '[\\s\\S]*<li><a href="[^"]*">([^<]{1,60})</a></li>\\s*(?:<li>[^<]{0,10}</li>\\s*)?</ul>', attr: '1' },
      },
    },
    toc: {
      enabled: true,
      // 三代书籍页内嵌章节链统一相对 \d{4,8}.html; \s*[^>]* 容错夹层属性;
      // 导航/作品集/推荐块链接带 / 或 http 前缀非纯数字, regex 天然排除
      itemSelector: {
        type: 'regex',
        expression: '<a\\s+href=["\']\\d{4,8}\\.html["\']\\s*[^>]*>[^<]{1,120}</a>',
        attr: '0', flags: 'gi',
      },
      fields: {
        title: { type: 'regex', expression: '<a\\s+href=["\']\\d{4,8}\\.html["\'][^>]*>([^<]{1,120})</a>', attr: '1', flags: 'gi' },
        url: { type: 'regex', expression: 'href=["\'](\\d{4,8}\\.html)["\']', attr: '1', flags: 'gi' },
      },
      pagination: { enabled: false, maxPages: 1 },
    },
    content: {
      enabled: true,
      fields: {
        // 三容器: 新版 #neirong / 旧版表格 td[width=820](每页恰 1 个) / 过渡版 #Article .text
        content: { type: 'css', expression: '#neirong, td[width="820"], #Article .text', attr: 'html' },
      },
      // 关键: 站点"下一页"实测指向下一章(长章 17K 字不拆页), 开启翻页会把多章并进一章
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
      // ↑ p[align=center]: 过渡版正文容器内嵌的 上一页/回目录/下一页 导航段(整段移除最稳)
      adPatterns: [
        '(www\\.)?kanunu8\\.com\\S*',
        '本站内容来源于网络[^。<>]*',
        '本站作品收集整理自网络[^<>]*',
        '请记住本站[^<>]*',
        '(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?',
        '本章未完.*?点击下一页继续阅读',
        // [R30-2-3] 过渡版容器内导航文本行级兜底(与 p[align=center] 整段移除双保险)
        '上一页\\s*回目录\\s*下一页',
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
  await testSection(rule, 'book', PROBE.bookOld, cfg.book) // 二代 2015 表格书籍页
  await testSection(rule, 'toc', PROBE.tocOld, cfg.toc) // 二代表格目录(71项)
  await testSection(rule, 'content', PROBE.contentOld, cfg.content) // 二代 td[width=820] 正文
  await testSection(rule, 'book', PROBE.bookTrans, cfg.book) // 过渡版书籍页(听雪楼)
  await testSection(rule, 'toc', PROBE.tocTrans, cfg.toc) // 过渡版目录(87项)
  await testSection(rule, 'content', PROBE.contentTrans, cfg.content) // 过渡版 #Article .text 正文
  await testSection(rule, 'toc', PROBE.tocLong, cfg.toc) // 长目录兰香缘(326项)
  await testSection(rule, 'content', PROBE.contentLong, cfg.content) // 长章 #neirong 正文(约1.8万字)

  // [R11-d-6] 幂等入库收敛至 scripts/_seed-lib.ts(同名规则含历史重复全删后建; 失败 exit(1))
  await seedRuleIdempotent(rule)

  console.log(allPass ? '✅ 四段测试全部过线(toc≥50, content≥2000)' : '❌ 存在未过线段落, 见上方日志')
  if (!allPass) process.exit(2)
}

main()

export {}
