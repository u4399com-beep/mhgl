// 种子脚本: 茉莉小说 (www.molixs.com) 17mbCMS GBK 女频站采集规则
// 用法: bun run scripts/seed-rule-moli.ts
// 侦察结论(实测 curl 2026-09-14, R21-f2; R21-f 首轮探针证据 /tmp/r21f-moli-probe.html 等):
//  - 直连 200 无任何防护(无 CF), GBK 编码(Content-Type 头不带 charset, 由 <meta charset=gbk> 提供
//    → 引擎 decodeBuffer meta 探测升级 gb18030 解码, piaotia/kanunu8 同链路); 桌面 UA 放行
//  - 17mb CMS 模板(/17mb/css/web.css), 桌面站 uaredirect 跳 m.molixs.com 仅 JS 层, http 引擎无感
//  - 四层:
//    * 列表 = 分类真分页页 /{cat}_{page}.html: div.articlelist .listcon li(30 本/页),
//      p.articlename a(书名+href)+span(连载/完结) / p.p2(作者：<a>|字数) / p.p3 简介 /
//      div.l2 img 封面(lazy data-original 属性取图)
//      8 类: xiaoyuan 校园 / guyan 古言 / chuangyue 穿越 / danmei 耽美 / xianyan 现言 /
//            tianchong 甜宠 / meiwen 美文 / qita 其他; pagelink 含 下页/尾页 真分页(古言 15 页)
//      排行榜变体 /paihang/{type}_{page}.html 12 榜(allvisit/monthvisit/weekvisit/dayvisit/
//            allvote/monthvote/weekvote/dayvote/goodnum/size/postdate/lastupdate) ul.lists li 同构
//      首页 block1/block2 网格无 author/intro 不作列表源
//    * 书籍页 = /{cat}_{id}/(og:novel:url 权威形态; /book/{id}/ 301 归一): og:novel:* meta 全套
//      (book_name/author/category/status/lastest_chapter_name/og:image) + div.articleinfo p.p3 简介
//    * 目录 = 内嵌书籍页 div.chapterlist ul li a 全量单页(小站无目录翻页锚, 长书不截断面待观察)
//    * 正文 = /{cat}_{id}/{chapterid}.html: div#content 单 <p>, 段间 <br /><br />+换行+<br />
//      三连分隔(&nbsp; 缩进) —— HTML 模式下该形态经块级换行转换必产生 3+ 连续空行,
//      故 clean.plainText=true 由引擎按行 trim+空行压缩归一为 \n\n 段落(deqixs/xjp 同款口径);
//      章节页仅 上一章/返回目录/下一章 无章内分页 → content 翻页必须关闭(否则并章, hodei 同坑)
//  - 测试探针: list=古言第1页(30本) / book=toc=锁细腰(og meta 全) / content=锁细腰第1章(~3000字)
//  - [R21-f2-2] 本种子随规则一并落地; 验证期纪律(DB 零写入)未执行入库 —— 入库时运行本脚本即可
import { RuleSeed, seedRuleIdempotent, testSection } from './_seed-lib'

const PROBE = {
  list: 'https://www.molixs.com/guyan_1.html',
  book: 'https://www.molixs.com/6_6041/',
  toc: 'https://www.molixs.com/6_6041/',
  content: 'https://www.molixs.com/6_6041/511551.html',
}

const rule: RuleSeed = {
  name: '茉莉小说(www.molixs.com)·17mbCMS GBK采集',
  description:
    'molixs.com 茉莉小说(17mbCMS 女频站) GBK 直连无防护, 编码由 <meta charset=gbk> 提供给引擎 gb18030 解码。列表=分类真分页页 /{cat}_{page}.html 的 .listcon li(30本/页; 8 类 xiaoyuan/guyan/chuangyue/danmei/xianyan/tianchong/meiwen/qita, 排行榜 /paihang/{type}_{page}.html 12 榜同构) / 书籍页 /{cat}_{id}/ og:novel:* meta 全套+div.articleinfo p.p3 简介 / 目录内嵌书籍页 div.chapterlist ul li a 全量单页 / 正文 #content 单 <p> 内 <br /> 三连分隔, clean.plainText 按行归一为 \\n\\n 段落(零连续空行)。章节页仅上一章/下一章, content 翻页关闭。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      urlTemplate: 'https://www.molixs.com/guyan_{page}.html',
      itemSelector: { type: 'css', expression: 'div.articlelist .listcon li' },
      fields: {
        name: { type: 'css', expression: 'p.articlename a', attr: 'text' },
        bookUrl: { type: 'css', expression: 'p.articlename a', attr: 'href' },
        author: { type: 'css', expression: 'p.p2 span a', attr: 'text' },
        intro: { type: 'css', expression: 'p.p3', attr: 'text' },
        cover: { type: 'css', expression: 'div.l2 img', attr: 'data-original' },
      },
      pagination: { enabled: false, maxPages: 1 },
    },
    book: {
      enabled: true,
      fields: {
        name: { type: 'css', expression: "meta[property='og:novel:book_name']", attr: 'content' },
        author: { type: 'css', expression: "meta[property='og:novel:author']", attr: 'content' },
        category: { type: 'css', expression: "meta[property='og:novel:category']", attr: 'content' },
        status: { type: 'css', expression: "meta[property='og:novel:status']", attr: 'content' },
        latestChapter: { type: 'css', expression: "meta[property='og:novel:lastest_chapter_name']", attr: 'content' },
        intro: { type: 'css', expression: 'div.articleinfo p.p3', attr: 'text' },
        cover: { type: 'css', expression: "meta[property='og:image']", attr: 'content' },
      },
    },
    toc: {
      enabled: true,
      // 目录内嵌书籍页(无 tocLink, runner 书籍页本身语义); 章链相对(511551.html)由 absolutize 补全
      itemSelector: { type: 'css', expression: 'div.chapterlist ul li' },
      fields: {
        title: { type: 'css', expression: 'a', attr: 'text' },
        url: { type: 'css', expression: 'a', attr: 'href' },
      },
      pagination: { enabled: false, maxPages: 1 },
    },
    content: {
      enabled: true,
      fields: {
        content: { type: 'css', expression: '#content', attr: 'html' },
      },
      // 关键: 章节页 "下一章" 指向下一章(非章内分页), 开启翻页会把多章并进一章(hodei 同坑)
      pagination: { enabled: false, maxPages: 1 },
    },
    fetch: {
      engine: 'http',
      uaMode: 'rotate',
      autoCookie: true,
      referer: true,
      timeout: 20000,
      retries: 2,
      waitMs: 800,
      browserFallbackStatus: [403, 412, 429, 503],
      hostGateLimit: 3,
    },
    clean: {
      removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript', '.adsbygoogle'],
      adPatterns: [
        '(www\\.)?molixs\\.com\\S*',
        '茉莉小说[^<>]*',
        '本站所有小说为转载作品[^。<>]*',
        '(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?',
        '本章未完.*?点击下一页继续阅读',
      ],
      whitelist: ['p', 'br', 'b', 'strong', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      normalize: true,
      plainText: true,
    },
  },
}

// ---------- 四段测试 ----------
async function main() {
  const cfg = rule.config as Record<string, any>
  let allPass = true

  console.log('== molixs.com 茉莉小说 四段测试 ==')
  const list = await testSection(rule, 'list', PROBE.list, cfg.list)
  if (!list || (list.count as number) < 10) allPass = false

  const book = await testSection(rule, 'book', PROBE.book, cfg.book)
  if (!book || !book.fields || !(book.fields as Record<string, string>).name) allPass = false

  const toc = await testSection(rule, 'toc', PROBE.toc, cfg.toc)
  if (!toc || (toc.count as number) < 5) { allPass = false; console.log('  !! toc<5 未过线') }

  const content = await testSection(rule, 'content', PROBE.content, cfg.content)
  if (!content || (content.cleanedLength as number) < 800) { allPass = false; console.log('  !! content<800 未过线') }

  // [R11-d-6] 幂等入库收敛至 scripts/_seed-lib.ts(同名规则含历史重复全删后建; 失败 exit(1))
  await seedRuleIdempotent(rule)

  console.log(allPass ? '✅ 四段测试全部过线(list≥10, toc≥5, content≥800)' : '❌ 存在未过线段落, 见上方日志')
  if (!allPass) process.exit(2)
}

main()

export {}
