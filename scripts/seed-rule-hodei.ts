// 种子脚本: 好读小说网 (www.hodei.net) 直连 SSR 采集规则
// 用法: bun run scripts/seed-rule-hodei.ts
// 侦察结论(实测 curl 2025):
//  - 直连 200 无任何防护, UTF-8 SSR (text/html; charset=utf-8), 章节页 ~12KB/目录页 ~18KB
//  - 四层:
//    * 列表 = 分类页 /xuanhuan.html 系列: div#newscontent div.l ul>li, 每页 40 本;
//      span.s1=分类 / span.s2>a(/book/ID/)=书名 / span.s3>a(/read/)=最新章 / span.s4>a(/author/)=作者
//      分页 /xuanhuan/{page}.html (1=首页, 2~7 尾页; /xuanhuan/1.html 实测 200 与首页同内容)
//    * 书籍页 = /book/ID/: h1>a(title=书名) + og:novel:* meta 全套(author/category/status/
//      latest_chapter_name/latest_chapter_url) + 简介在 #intro 下第二个 .normal-intro-box
//      (第一个 .ai-intro-box 是 AI 生成的"导读"营销文, 用 .normal-intro-box 前缀选择器天然跳过;
//       第三 .normal-intro-box 是"作者其他作品推荐", cssExtract 取 first() 恰好命中真简介)
//    * 目录 = 独立页 /mulu/{id}.html (书籍页 a.dir-link "查看完整目录"), dl>dt(卷名)+dd>a(章节),
//      每页 50 章, 分页 ?page=N, a.next"下一页"(parser 默认 a:contains("下一页") 命中)
//    * 正文 = /read/{bid}/{cid}.html: div#content 内 <p> 段落; "下一章"指向下一章(非章内分页)
//      → content 翻页必须关闭, 否则多章并一章
//  - 已知源站数据坑(不阻塞规则): 部分书籍章节页 #content 为空(如 25811 的 21/1431 章, 源站数据洞,
//    runner 按失败标记); 多数老书章节只有 ~1000 字符, 过线探针选章节本身较长的书(诡秘之主 2400~3800 字/章)
//  - 测试探针: list=玄幻第1页(40本) / book=toc=诡秘之主(og meta 全) / content=诡秘之主第4章(3829字符)
import { RuleSeed, seedRuleIdempotent, testSection } from './_seed-lib'

const PROBE = {
  list: 'https://www.hodei.net/xuanhuan/1.html',
  book: 'https://www.hodei.net/book/5608/',
  toc: 'https://www.hodei.net/book/5608/',
  content: 'https://www.hodei.net/read/5608/4.html',
}

const rule: RuleSeed = {
  name: '好读小说网(www.hodei.net)·直连SSR采集',
  description:
    'hodei.net 直连无防护 UTF-8 SSR 站。列表=分类页 #newscontent .l li(s2书名/s3最新章/s4作者/s1分类, {page} 分页 /xuanhuan/{page}.html) / 书籍页 h1+og:novel:* meta(作者/分类/状态/最新章)+.normal-intro-box 简介(跳过 AI 导读)+#fmimg 封面 / 目录=tocLink a.dir-link 独立页 /mulu/{id}.html dd>a, ?page=N 翻页(50章/页) / 正文 div#content 段落, "下一章"=下一章故翻页关闭。注意: 源站部分章节页正文为空(数据洞按失败标记), 多数老书单章仅约千字。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      urlTemplate: 'https://www.hodei.net/xuanhuan/{page}.html',
      itemSelector: { type: 'css', expression: '#newscontent .l li' },
      fields: {
        name: { type: 'css', expression: 'span.s2 a', attr: 'text' },
        bookUrl: { type: 'css', expression: 'span.s2 a', attr: 'href' },
        latestChapter: { type: 'css', expression: 'span.s3 a', attr: 'text' },
        author: { type: 'css', expression: 'span.s4 a', attr: 'text' },
        category: { type: 'css', expression: 'span.s1', attr: 'text' },
      },
    },
    book: {
      enabled: true,
      fields: {
        name: { type: 'css', expression: 'h1', attr: 'text' },
        author: { type: 'css', expression: "meta[property='og:novel:author']", attr: 'content' },
        category: { type: 'css', expression: "meta[property='og:novel:category']", attr: 'content' },
        status: { type: 'css', expression: "meta[property='og:novel:status']", attr: 'content' },
        latestChapter: { type: 'css', expression: "meta[property='og:novel:latest_chapter_name']", attr: 'content' },
        intro: { type: 'css', expression: '.normal-intro-box .intro-content', attr: 'html' },
        cover: { type: 'css', expression: '#fmimg img', attr: 'src' },
      },
    },
    toc: {
      enabled: true,
      // 书籍页 "查看完整目录" → 独立目录页 /mulu/{id}.html
      tocLink: { type: 'css', expression: 'a.dir-link', attr: 'href' },
      itemSelector: { type: 'css', expression: 'dd a' },
      fields: {
        title: { type: 'css', expression: 'a', attr: 'text' },
        url: { type: 'css', expression: 'a', attr: 'href' },
      },
      // 目录页 a.next "下一页" → /mulu/{id}.html?page=N; parser 默认 a:contains("下一页") 兜底命中
      pagination: { enabled: true, maxPages: 100 },
    },
    content: {
      enabled: true,
      fields: {
        content: { type: 'css', expression: '#content', attr: 'html' },
      },
      // 关键: "下一章"链接指向下一章(非章内分页), 开启翻页会把多章并进一章
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
    },
    clean: {
      removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript', '.adsbygoogle'],
      adPatterns: [
        '(www\\.)?hodei\\.net\\S*',
        '本站内容来源于网络[^。<>]*',
        '本站所有小说[^<>]*',
        '请记住本站[^<>]*',
        // [R22-a-1] 实测章节尾 UI 噪声行「加入书签，方便阅读」(伴随 2+ 空格缩进)不入正文;
        // 词形同 parser 评分用 AD_MARKER_RE 的「加入书签」标记口径
        '加入书签[^<>]*',
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

  console.log('== hodei.net 四段测试 ==')
  const list = await testSection(rule, 'list', PROBE.list, cfg.list)
  if (!list || (list.count as number) < 10) allPass = false

  const book = await testSection(rule, 'book', PROBE.book, cfg.book)
  if (!book || !book.fields || !(book.fields as Record<string, string>).name) allPass = false

  const toc = await testSection(rule, 'toc', PROBE.toc, cfg.toc)
  if (!toc || (toc.count as number) < 50) { allPass = false; console.log('  !! toc<50 未过线') }

  const content = await testSection(rule, 'content', PROBE.content, cfg.content)
  if (!content || (content.cleanedLength as number) < 2000) { allPass = false; console.log('  !! content<2000 未过线') }

  // [R11-d-6] 幂等入库收敛至 scripts/_seed-lib.ts(同名规则含历史重复全删后建; 失败 exit(1))
  await seedRuleIdempotent(rule)

  console.log(allPass ? '✅ 四段测试全部过线(list≥10, toc≥50, content≥2000)' : '❌ 存在未过线段落, 见上方日志')
  if (!allPass) process.exit(2)
}

main()

export {}
