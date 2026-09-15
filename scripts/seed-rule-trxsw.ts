// ============================================================
// 种子脚本: 同人小说网 (www.trxsw.com) 采集规则 [R25-1-0]
// 用法: bun run scripts/seed-rule-trxsw.ts
//       (可选) TRXSW_PROBE=1 bun run scripts/seed-rule-trxsw.ts — 入库前先跑四段 live 探针
//       (仅当站点传输层恢复后才有意义, 默认跳过 — 见下方未实测声明)
//
// 规则来源(无书源可反译, 唯一结构依据 = Wayback 快照真实 DOM):
//  - 2019-10-19 Wayback 快照 /tmp/r25/trxsw-wb.html(存档时点真站原始 HTML, 40KB, 源站 GBK —
//    快照文件已由 reader 解码为 UTF-8 文本; 真站抓取时 fetcher.decodeBuffer 按 meta charset=gbk
//    自动升级 gb18030 解码, 规则侧零特殊处理)
//    → 离线解析验证(项目引擎 parseList 直接跑快照, 非自造解析):
//      list 并集 95 项 / 94 书, name 95, bookUrl 95, author 58, category 26,
//      latestChapter 26, intro 6, cover 6(命中明细见下方各段注释)
//
// ⚠ 未实测声明(2026-09-15, 参照 wanbenshenzhan 规则 WANBEN_PROBE=1 先例):
//  - 真站状态: HTTP/2 framing 层拒绝所有出口 —— bun fetch / Playwright(trx-bridge 实录
//    ERR_HTTP2_PROTOCOL_ERROR) / 外部 reader(含 Jina)全部同型失败, 协议层拒绝非封锁页,
//    无内容可判, 无法四段实测; scrapling 桥同样走浏览器 h2 亦不可达(不采用 fetchMode=scrapling-*)
//  - 传输画像注记(R9-a-14 C.2 host 钉扎): curlTlsProfileIndex('www.trxsw.com')=2(Chrome TLS1.2
//    套件表, h2 默认)、'trxsw.com'=0(h2 默认) —— 两 host 均落不进画像 1(--http1.1), 即引擎现有
//    配置面无法对本站强制 http1.1 绕开 h2 framing 拒绝(如实留档, 非遗漏); 换出口 IP 或站点
//    修复协议层后: TRXSW_PROBE=1 bun run scripts/seed-rule-trxsw.ts 复验四段
//  - list 段选择器 = 快照真实 DOM 实证(见上); book/toc/content 三段无存档, 按杰奇 CMS 家族
//    惯例书写并在合成夹具上回归(og:novel meta 与 作者：/类别：/状态：/字数： 文本两种形态 +
//    #list dd a 目录 + #content 正文), 真站命中与否待复验; 引擎 parseContent 自带 R9-c-6
//    最大文本容器兜底(主选择器落空时启用)
//  - 章节页 URL 实证形态: 杰奇标准 /book/{bookid}/{chapterid}.html(快照 #newscontent .l
//    s3 真链 /book/4989/8657169.html 等)
//
// 结构要点(快照实证, 除注明"推测"外):
//  - 首页: div#wrapper > .ywtop(顶条) / .head(div.head_logo 站名链 + 搜索) / .nav > ul > li
//    (首页/排行榜单/最近更新/同人小说/玄幻奇幻/武侠仙侠/都市言情/历史军事/游戏竞技/科幻灵异/全本小说)
//  - 分类列表 URL(nav 实链实证): /book/{catid}_{sort}_0_0_0_0_{page}.html, 页码 1 基;
//    cat 1=玄幻奇幻 2=武侠仙侠 3=都市言情 4=历史军事 5=游戏竞技 6=科幻灵异 7=同人小说,
//    0=全分类; sort=lastupdate(最近更新)/monthvisit(排行); 全本形态 /book/0_lastupdate_0_0_2_0_1.html
//  - 首页板块: div.novelslist×2(各 3 个 div.content(其一带 border): h2 板块名(同人/玄幻/修真/都市/
//    穿越/网游小说) + div.top 图文推荐(div.image>a>img 67x82 /files/article/image/{x}/{id}/{id}s.jpg
//    + dl dt>a 书名+span 作者 + dd 简介) + ul li×~10(li>a 书名 + " /作者" 文本)) 
//    / #newscontent(div.l「最近更新小说列表」li×26 + div.r「小说推荐」li×26: s1 [分类] / s2 书名 /
//    s3 最新章链 / s4 作者 / s5 日期(仅 .l 有 s3/s4; .r 无 s4 作者在 s5))
//  - book/toc/content 三段为杰奇家族惯例(推测, 见上声明)
// ============================================================
import { RuleSeed, seedRuleIdempotent, testSection } from './_seed-lib'

// [R25-1-1] 测试探针(仅 TRXSW_PROBE=1 时执行; URL 全部取自快照实链 — 书 178=修罗武神,
// 章节 /book/4989/8657169.html=超凡黎明第0593章; rules/test 接口禁止 {page} 原串占位符)
const PROBE = {
  list: 'https://www.trxsw.com/book/0_lastupdate_0_0_0_0_1.html',
  book: 'https://www.trxsw.com/book/178/',
  toc: 'https://www.trxsw.com/book/178/',
  content: 'https://www.trxsw.com/book/4989/8657169.html',
}

// export 供离线验证脚本复用四段规则 — 语义与入库内容同源防漂移(wanben 先例)
export const rule: RuleSeed = {
  name: '同人小说网(www.trxsw.com)·杰奇GBK采集',
  description:
    // [R25-1-11] description ≤500 字符: 管理端入库截断 500(wanben 628 同例), 关键信息收进限额内
    'trxsw.com 同人小说网(杰奇 CMS 经典模板, GBK — fetcher 自动升级 gb18030 解码)。列表=/book/{cat}_{sort}_0_0_0_0_{page}.html(cat 1..7 分类/0 全站, sort=lastupdate|monthvisit, 页码1基), .top+#novelslist li+#newscontent li 并集兼容列表页同构 s1..s5 行, 快照实测 95 项/94 书。\n⚠ 未实测(2026-09-15): 真站 HTTP/2 framing 层拒绝所有出口(ERR_HTTP2_PROTOCOL_ERROR), 无法四段实测; list 段=2019-10-19 Wayback 快照实证, book/toc/content 按杰奇惯例写+合成夹具回归(og:novel meta+文本正则双保险/#list dd a/#content 并集+引擎兜底); 章节页实证 /book/{bid}/{cid}.html; host 钉扎无 --http1.1 画像(留档)。恢复后 TRXSW_PROBE=1 复验。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      // [R25-1-2] 最近更新·全分类(nav 实链同形态): /book/0_lastupdate_0_0_0_0_{page}.html,
      // 页码 1 基; 改 catid/sort 即得分类/排行源(7_lastupdate=同人, monthvisit=月点击排行)
      urlTemplate: 'https://www.trxsw.com/book/0_lastupdate_0_0_0_0_{page}.html',
      // [R25-1-3] 三板块并集(快照实测 95 项/94 书; 首页实证, 杰奇列表页同构):
      //   div.novelslist .top ×6 — 图文推荐(img 封面 + dl dt>a 书名 + dt span 作者 + dd 简介)
      //   div.novelslist .content ul li ×37 — 分类块行(li>a 书名, " /作者" 无独立节点)
      //   #newscontent li ×52 — .l 最近更新(s1..s5 全) + .r 小说推荐(s2 书名 + s5 作者)
      itemSelector: {
        type: 'css',
        expression: 'div.novelslist .top, div.novelslist .content ul li, #newscontent li',
      },
      fields: {
        // [R25-1-4] name/bookUrl 跨三板块统一选择器(cssExtract 首匹配, 并集按文档序):
        //   .top → dt a(书名链; div.image a 封面链不在表达式内) / .s2 a → newscontent 行
        //   li > a → 分类块裸 li 行(item 自身为 li, 碎片重解析后根级 li>a 命中)
        name: { type: 'css', expression: 'dt a, .s2 a, li > a', attr: 'text' },
        bookUrl: { type: 'css', expression: 'dt a, .s2 a, li > a', attr: 'href' },
        // .top: dt span(书名链后) / .l 行: .s4(文档序先于 s5 日期) / .r 行: .s5(无 s4 故安全)
        author: { type: 'css', expression: 'dt span, .s4, .s5', attr: 'text' },
        category: { type: 'css', expression: '.s1', attr: 'text', replaceFrom: '\\[|\\]', replaceTo: '' },
        latestChapter: { type: 'css', expression: '.s3 a', attr: 'text' },
        intro: { type: 'css', expression: 'dl dd', attr: 'text' },
        cover: { type: 'css', expression: 'img', attr: 'src' },
      },
      // 分类页 1 基真分页(jieqi articlelist): runner listStart~listEnd 逐页展开 {page};
      // 列表页内无"下一页"锚驱动的规则级翻页需求(板块页码由任务侧 listStart/listEnd 控制)
      pagination: { enabled: false, maxPages: 1 },
    },
    book: {
      enabled: true,
      // [R25-1-5] 书籍页 /book/{id}/ 结构未存档 — 双保险策略: og:novel meta 优先(文档序在前),
      // 缺失时回落 文本标签 正则(作者：/类别：/状态：/字数：, (?:<[^>]*>)* 容忍标签间隔),
      // 两种形态已在合成夹具回归; 均落空时 runner 侧 smartCompleteDetect/intro 兜底
      fields: {
        name: { type: 'css', expression: 'h1', attr: 'text', replaceFrom: '^《|》$', replaceTo: '' },
        author: {
          type: 'regex',
          expression: '(?:og:novel:author"\\s*content="|作\\s*者[：:](?:<[^>]*>)*\\s*)([^"\\s<]{1,40})',
          attr: '1',
        },
        category: {
          type: 'regex',
          expression: '(?:og:novel:category"\\s*content="|类\\s*别[：:](?:<[^>]*>)*\\s*\\[?)([^"\\]\\s<]{1,12})',
          attr: '1',
        },
        status: {
          type: 'regex',
          expression: '(?:og:novel:status"\\s*content="|状\\s*态[：:](?:<[^>]*>)*\\s*)([^"\\]\\s<]{1,10})',
          attr: '1',
        },
        wordCount: {
          type: 'regex',
          expression: '字\\s*数[：:](?:<[^>]*>)*\\s*([\\d.,]+\\s*万?[字]?)',
          attr: '1',
        },
        latestChapter: {
          type: 'regex',
          expression: '(?:og:novel:latest_chapter_name"\\s*content="|最新章节[：:](?:<[^>]*>)*\\s*)([^"<]{1,80})',
          attr: '1',
        },
        intro: { type: 'css', expression: '#intro, .intro, #bookintro, .bookintro', attr: 'text' },
        // /files/article/image/{x}/{id}/{id}s.jpg 为首页快照实证(杰奇标准图路径), 书籍页大图同目录
        cover: {
          type: 'css',
          expression: 'img[src*="files/article/image"], img[src*="/img/"], #imgbox img, .imgbox img, .cover img, #img img',
          attr: 'src',
        },
      },
    },
    toc: {
      enabled: true,
      // [R25-1-6] 目录内嵌书籍页(杰奇惯例): div#list > dl > dd > a(含首个"最新章节"块,
      // 引擎 toc 去重+重排吸收); 另备 #chapterlist/.chapterlist/#booklist 系变体并集兜底
      itemSelector: {
        type: 'css',
        expression: '#list dd a, #chapterlist dd a, #chapterlist li a, .chapterlist dd a, .chapterlist li a, #booklist dd a',
      },
      fields: {
        title: { type: 'css', expression: 'a', attr: 'text' },
        url: { type: 'css', expression: 'a', attr: 'href' },
      },
      // 单页目录无"下一页"锚 → 翻页链自然收敛; 杰奇部分模板目录有分页形态时自动续页
      pagination: {
        enabled: true,
        maxPages: 20,
        nextLink: { type: 'css', expression: 'a:contains("下一页")', attr: 'href' },
      },
    },
    content: {
      enabled: true,
      // [R25-1-7] 章节页 /book/{bookid}/{chapterid}.html(快照 s3 实链)正文容器未存档:
      // 家族常用容器并集(#content 为主), 全落空时引擎 R9-c-6 最大文本容器兜底生效
      fields: {
        content: { type: 'css', expression: '#content, #chaptercontent, #booktxt, .showtxt', attr: 'html' },
      },
      // 杰奇章节页"下一章"=下一章: 关闭防多章并一章(biqugetw 同款口径)
      pagination: { enabled: false, maxPages: 1 },
    },
    fetch: {
      // [R25-1-8] 引擎 auto: bun fetch(h2 拒绝)→ curl 链(host 钉扎画像2 h2+Chrome TLS 套件)
      // → 浏览器升级(browserFallbackStatus 仅状态码触发, 本站为协议层拒绝不在其列 —
      // 如实留档: 传输层恢复前四段必然失败, 探针仅换出口 IP 后有意义)
      engine: 'auto',
      uaMode: 'rotate',
      autoCookie: true,
      referer: true,
      timeout: 25000,
      retries: 2,
      waitMs: 1000,
      browserFallbackStatus: [403, 412, 429, 503],
      hostGateLimit: 3,
    },
    clean: {
      removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript', '.adsbygoogle'],
      adPatterns: [
        '(www\\.)?trxsw\\.com\\S*',
        '同人小说网[^<>]*',
        // 杰奇系章节页常见页脚水印变体
        '本站所有小说均由网友上传[^<>]*',
        '请记住本书首发域名[^<>]*',
        '(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?',
        '一秒记住.*?免费读',
      ],
      whitelist: ['p', 'br', 'b', 'strong', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      normalize: true,
      plainText: false,
    },
  },
}

// ---------- 四段测试(仅 TRXSW_PROBE=1: 传输层恢复后手动跑, 默认跳过不烧请求) ----------
async function liveProbe(): Promise<boolean> {
  const cfg = rule.config as Record<string, any>
  let allPass = true
  console.log('== trxsw.com 四段 live 探针(TRXSW_PROBE=1, 串行+引擎内置限速) ==')
  const list = await testSection(rule, 'list', PROBE.list, cfg.list)
  if (!list || (list.count as number) < 10) allPass = false
  await new Promise((r) => setTimeout(r, 1200))

  const book = await testSection(rule, 'book', PROBE.book, cfg.book)
  if (!book || !book.fields || !(book.fields as Record<string, string>).name) allPass = false
  await new Promise((r) => setTimeout(r, 1200))

  const toc = await testSection(rule, 'toc', PROBE.toc, cfg.toc)
  if (!toc || (toc.count as number) < 50) allPass = false
  await new Promise((r) => setTimeout(r, 1200))

  if (PROBE.content) {
    const content = await testSection(rule, 'content', PROBE.content, cfg.content)
    if (!content || (content.cleanedLength as number) < 2000) allPass = false
  }
  console.log(allPass ? '✅ 四段全部过线(list≥10, toc≥50, content≥2000)' : '❌ 存在未过线段落, 见上方日志')
  return allPass
}

async function main() {
  const probe = process.env.TRXSW_PROBE === '1'
  let allPass = true

  if (probe) {
    allPass = await liveProbe()
  } else {
    // [R25-1-9] 未实测模式(默认): HTTP/2 framing 层拒绝所有出口, live 探针必然失败, 跳过不烧请求
    console.log('== 未实测模式(默认): 站点对沙箱出口不可达(HTTP/2 framing 层拒绝), 跳过 live 探针 ==')
    console.log('   传输层恢复后: TRXSW_PROBE=1 bun run scripts/seed-rule-trxsw.ts')
  }

  // [R25-1-10] 幂等入库(_seed-lib 同名规则含历史重复全删后建; 失败 exit(1))
  await seedRuleIdempotent(rule)

  if (!allPass) process.exit(2)
}

// 直接执行时才入库; 被 import(离线验证脚本复用 rule)时不触发副作用
if (import.meta.main) main()

export {}
