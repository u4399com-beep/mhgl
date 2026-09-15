// 种子脚本: 久久小说网 (www.aijjxs.com) 排行榜/筛选页(toplist)直连采集规则
// 用法: bun run scripts/seed-rule-aijjxs-toplist.ts
// 背景与本源差异(与 seed-rule-aijjxs.ts 分类列表规则互补, 同站双规则):
//  - 用户实测 URL /txt/toplist-p_0-c_2-n_0-l_10-t_6-p_1-s_0-q_0-r_1-m_0.html
//    用分类规则(div.listbg)取不到数 —— toplist 是另一套紧凑布局, 页面无 div.listbg
//    (2026-09-14 实测 listbg 0 处), 主列表为 div.body.grid2 div.book ×10/页。
//  - ★★0 基翻页(本规则核心坑): 首个 p_ 段是 0 基页码 —— 第1页=p_0, 第2页=p_1,
//    第N页=p_{N-1}(分页条实测: "2"→p_1, "3"→p_2, "10"→p_9, 尾页352→p_352);
//    {page} 占位符是 1 基原值, 直接放 p_{page} 会整体错位一页(漏第1页且末页 404 空转),
//    故 urlTemplate 用 {offset:1}=(页号-1)*1 表达 0 基页码(runner/测试端点同口径展开)。
//  - 筛选参数全表(实测筛选项链接归纳; 均可改模板或任务级 listUrl 覆盖 [R12-a-2]):
//      c_1=女生小说 c_2=男生小说 c_3=耽美小说
//      r_1=最新上传 r_2=下载排行 r_3=收藏排行 r_4=只看推荐
//      n_=年度(0不限/2013..2026) s_=时代背景(0不限/1架空古代/2现代都市/3末世未来/4魔幻异世)
//      q_=文件大小(0不限/1≤500KB/2 500KB-1MB/3 1-2MB/4≥2MB) l_=每页条数(10)
//      t_6/m_0/第二个 p_1 为站点固定参数(全部分页/筛选链接恒定), 模板原样钉死
//  - 页面结构(2026-09-14 实测 P1/P2 各 10 本零重叠):
//      div.saixuan 筛选条(内含大量 toplist 链接, 不构成 item)
//      div.body.grid2 > div.book ×10(唯一容器, 侧栏榜是 article.panel.rank>ul.lines 不误采)
//        h4>a 书名+bookUrl(/txt/{bid}.html) / a[href*=/zuozhe/] 作者
//        div.meta: <small></small>(空)+作者链+<small>分类</small>+· 状态 · 大小 · admin+oldDate 日期
//        div.desc 简介(源站截断尾随 ..) / img 封面(协议相对 //image.jjjjxsw.com absolutize 补全)
//    样本状态仅"已完结"(P1/P2 全样本), 模板仍兼容 连载中/连载/完本 —— 用
//    "· 状态 · 数字MB" 上下文锚定, 防简介文本误命中(正则作用于 item 原始 HTML)。
//  - book/toc/content 四段与分类列表规则完全同构(toplist 条目同指 /txt/{bid}.html 书籍页),
//    选择器原样复用(该站书籍页/目录/正文形态见 seed-rule-aijjxs.ts 头注, 2026-09-01 实测)。
//  - 探针: 列表页 URL 一律传已展开形态({offset:1}→p_0; 第2页附探针 p_1);
//    content 探针复用基础规则已知好章(正文解析与书籍无关)。
import { RuleSeed, seedRuleIdempotent, testSection } from './_seed-lib'

const PROBE = {
  // 第1页 = p_0({offset:1} 对页号 1 的展开结果), 即用户提供的原始 URL
  list: 'https://www.aijjxs.com/txt/toplist-p_0-c_2-n_0-l_10-t_6-p_1-s_0-q_0-r_1-m_0.html',
  // 第2页附探针 = p_1({offset:1} 对页号 2 的展开结果), 验证 0 基翻页链路
  list2: 'https://www.aijjxs.com/txt/toplist-p_1-c_2-n_0-l_10-t_6-p_1-s_0-q_0-r_1-m_0.html',
  // 书籍探针取自 toplist 第1页首条(链路真实性: 列表发现的书籍页可解析)
  book: 'https://www.aijjxs.com/txt/57329.html',
  toc: 'https://www.aijjxs.com/txt/57329.html',
  // 已知好章(seed-rule-aijjxs.ts 2026-09-01 实测), 正文段与书籍无关
  content: 'https://www.aijjxs.com/read/11/57196/3.html',
}

const rule: RuleSeed = {
  name: '久久小说网 排行榜 (aijjxs.com toplist)',
  description:
    'aijjxs.com 排行榜/筛选页(toplist)专用规则, 与分类列表规则(div.listbg)同站互补 —— toplist 是紧凑布局无 listbg, 用分类规则取不到数。★0 基翻页: 首个 p_ 段=页码-1(第1页 p_0/第2页 p_1), urlTemplate 用 {offset:1} 表达, 任务页号 1..N 直接可用; 筛选参数: c_(1女生/2男生/3耽美) r_(1最新上传/2下载排行/3收藏排行/4只看推荐) n_年度 s_背景 q_大小, 变体通过任务级列表页 URL 覆盖改参即可(仅 {page}/{offset:N} 被引擎替换)。列表=div.body.grid2 div.book ×10/页(h4 a 书名/zuozhe 作者/meta small:last-of-type 分类/regex 状态锚定"· 状态 · 大小"/oldDate 上传日期/封面协议相对自动补全/desc 简介) / 书籍页+目录+正文与分类规则同构(/txt/{bid}.html → a[href^=/read/] → /read/{bid}/ ul.chapter-list 全量单页, 正文 #view_content_txt 每章单页翻页关闭)。UTF-8 直连无挑战。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      // ★0 基翻页: {offset:1}=(页号-1)*1 → 页号1→p_0(第1页), 页号2→p_1(第2页)…
      // 参数基线 = 用户提供的 c_2 男生小说 · r_1 最新上传 · n_0/s_0/q_0 全不限;
      // 其余榜单/分类变体(见文件头注全表)在任务 listUrl 里替换 c_/r_/n_/s_/q_ 值即可,
      // 引擎只认 {page}/{offset:N}, 其余花括号字面请求(R12-a-3 防呆)
      urlTemplate:
        'https://www.aijjxs.com/txt/toplist-p_{offset:1}-c_2-n_0-l_10-t_6-p_1-s_0-q_0-r_1-m_0.html',
      // grid2 全页唯一(实测 1 处)且侧栏榜(article.panel.rank>ul.lines)/筛选条(saixuan)
      // 均非 div.book, 双重作用域防未来改版误采
      itemSelector: { type: 'css', expression: 'div.body.grid2 div.book' },
      fields: {
        name: { type: 'css', expression: 'h4 a', attr: 'text' },
        bookUrl: { type: 'css', expression: 'h4 a', attr: 'href' },
        author: { type: 'css', expression: 'a[href*="/zuozhe/"]', attr: 'text' },
        // div.meta 内两个 small: 首个恒空(<small></small>), 分类在第二个 → :last-of-type
        // 取最后一个 small(P1 十本实测全部命中: 都市/玄幻/惊悚…)
        category: { type: 'css', expression: 'div.meta small:last-of-type', attr: 'text' },
        // 状态为 meta 行裸文本("· 已完结 · 2.5 MB ·"), 用后继"数字 KB/MB"上下文锚定,
        // 防简介/书名误命中; 分支长词在前防"连载"吃掉"连载中"; 正则作用于 item 原始 HTML
        status: { type: 'regex', expression: '·\\s*(已完结|连载中|连载|完本)\\s*·\\s*[\\d.]+\\s*[KMG]?B' },
        // 上传日期固定裹在 span.oldDate 内, 锚定标签防正则误配简介中的日期串
        updateTime: { type: 'regex', expression: 'oldDate">(\\d{4}-\\d{2}-\\d{2})' },
        // TXT 文件大小(该站特有元数据, 如 2.5 MB), 信息性字段(下游书籍落库不消费)
        size: { type: 'regex', expression: '·\\s*([\\d.]+\\s*[KMG]B)\\s*·' },
        // 封面协议相对地址 //image.jjjjxsw.com/..., 引擎 absolutize 补全为 https:
        cover: { type: 'css', expression: 'img', attr: 'src' },
        // 源站简介尾部截断符 ".." 原样保留(与分类列表规则口径一致, 不做修饰)
        intro: { type: 'css', expression: 'div.desc', attr: 'text' },
      },
      // {page}/{offset:N} 翻页由任务页号范围驱动(listStart..listEnd), 规则级翻页关闭
      pagination: { enabled: false, maxPages: 1 },
    },
    book: {
      enabled: true,
      fields: {
        // 第一个 article.panel h3 = 书名《xxx》(后续 panel h3 是"内容简介"等板块标题),
        // first() 语义 + replaceFrom 剥书名号
        name: { type: 'css', expression: 'article.panel h3', attr: 'text', replaceFrom: '^《|》$', replaceTo: '' },
        author: { type: 'css', expression: '.kv a[href*="/zuozhe/"]', attr: 'text' },
        category: {
          type: 'css',
          expression: '.kv p:contains("书籍分类")',
          attr: 'text',
          replaceFrom: '^书籍分类：\\s*',
          replaceTo: '',
        },
        // "已完结"等原文, 交 smartCompleteDetect 归一化
        status: { type: 'css', expression: 'span.sfwj', attr: 'text' },
        // 书籍页多个 div.desc(简介块在前, "猜您喜欢"推荐卡在后), first() 取简介
        intro: { type: 'css', expression: 'div.desc', attr: 'text' },
        cover: { type: 'css', expression: '.pic img', attr: 'src' },
        // 该站为 TXT 下载站, 书籍页无"最新章节"字段, 不采 latestChapter(book4 状态缺失同型先例)
      },
    },
    toc: {
      enabled: true,
      // 书籍页仅一个 /read/ 链接("在线阅读全文"), 即目录页 /read/{bid}/
      tocLink: { type: 'css', expression: 'a[href^="/read/"]', attr: 'href' },
      // 全量目录内嵌 /read/{bid}/ 单页(实测 847/921/1368 章无翻页锚); 首个 li 是
      // "内容简介"非真章节, :not(:first-child) 排除(cheerio css-select 实证支持)
      itemSelector: { type: 'css', expression: 'ul.chapter-list li:not(:first-child)' },
      fields: {
        title: { type: 'css', expression: 'a', attr: 'text' },
        url: { type: 'css', expression: 'a', attr: 'href' },
      },
      // 站点无目录翻页机制, 关闭(防未来误跟"下一章"锚)
      pagination: { enabled: false, maxPages: 1 },
    },
    content: {
      enabled: true,
      fields: {
        content: { type: 'css', expression: '#view_content_txt', attr: 'html' },
      },
      // ★每章单页, 翻页必须关闭: 章节页"下一页"锚=下一章(kanunu8 式陷阱),
      // pagination.enabled=false 时 parseContent 不走兜底"下一页"锚, 天然安全
      pagination: { enabled: false, maxPages: 1 },
    },
    fetch: {
      engine: 'http',
      // 直连站: 无挑战/无 UA 门禁, 常规 rotate UA 池 + autoCookie 防御性保留(与基础规则同参)
      uaMode: 'rotate',
      autoCookie: true,
      referer: true,
      timeout: 25000,
      retries: 2,
      waitMs: 800,
      browserFallbackStatus: [403, 412, 429, 503],
      hostGateLimit: 3,
    },
    clean: {
      removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript', '.adsbygoogle'],
      adPatterns: [
        '(www\\.)?aijjxs\\.com\\S*',
        '(www\\.)?jjjjxsw\\.com\\S*',
        '久久小说网[^<>]*',
        '请记住本站[^<>]*',
        '本站内容来源于网络[^。<>]*',
        '本站所收录作品[^<>]*',
        '(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?',
      ],
      whitelist: ['p', 'br', 'b', 'strong', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      normalize: true,
      plainText: false,
    },
  },
}

// ---------- 四段测试(入库前烟测; 列表段以 toplist 第1页为准, 第2页为 0 基翻页附探针) ----------
async function main() {
  const cfg = rule.config as Record<string, any>
  let allPass = true

  console.log('== aijjxs.com toplist 四段烟测 ==')
  const list = await testSection(rule, 'list', PROBE.list, cfg.list)
  if (!list || (list.count as number) < 10) allPass = false

  // 0 基翻页附探针(不设门槛, 仅报告): 页号2 → p_1, 与第1页应为不同书籍集合。
  // [R21-tl-1] 比较键修复: /rules/test 的 sample 为扁平字段对象({name,bookUrl,…}),
  //  原误取 i.fields?.bookUrl 全 undefined → 两页"相同"误报翻页失效(实际数据不同)
  const list2 = await testSection(rule, 'list', PROBE.list2, cfg.list)
  if (list && list2 && (list2.count as number) >= 10) {
    const key = (i: unknown) => (i as { bookUrl?: string; url?: string }).bookUrl || (i as { url?: string }).url || ''
    const u1 = JSON.stringify((list.sample || []).map(key))
    const u2 = JSON.stringify((list2.sample || []).map(key))
    console.log(u1 === u2 ? '  !! 附探针: 第2页与第1页书籍完全相同, 0 基翻页疑似失效' : '  附探针: 第2页(p_1)与第1页(p_0)书籍集合不同, 0 基翻页链路 OK')
  }

  const book = await testSection(rule, 'book', PROBE.book, cfg.book)
  if (!book || !book.fields || !(book.fields as Record<string, string>).name) allPass = false

  const toc = await testSection(rule, 'toc', PROBE.toc, cfg.toc)
  if (!toc || (toc.count as number) < 50) { allPass = false; console.log('  !! toc<50 未过线') }

  const content = await testSection(rule, 'content', PROBE.content, cfg.content)
  if (!content || (content.cleanedLength as number) < 2000) { allPass = false; console.log('  !! content<2000 未过线') }

  // [R11-d-6] 幂等入库收敛至 scripts/_seed-lib.ts(同名规则含历史重复全删后建; 失败 exit(1));
  // 本规则为全新命名, 不会删除任何存量规则
  await seedRuleIdempotent(rule)

  console.log(allPass ? '✅ 四段烟测全部过线(list≥10, toc≥50, content≥2000)' : '❌ 存在未过线段落, 见上方日志')
  if (!allPass) process.exit(2)
}

main()

export {}
