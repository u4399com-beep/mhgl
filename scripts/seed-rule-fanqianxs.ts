// ============================================================
// 种子脚本: 番茄小说网 (www.fanqianxs.com) 采集规则 [R25-1-0]
// 用法: bun run scripts/seed-rule-fanqianxs.ts
//       (可选) FANQ_PROBE=1 bun run scripts/seed-rule-fanqianxs.ts — 入库前先跑四段 live 探针
//       (仅当站点对本沙箱出口解封后才有意义, 默认跳过 — 见下方未实测声明)
//
// 规则来源(无书源可反译, 唯一结构依据 = Wayback 快照真实 DOM):
//  - 2023-03-31 Wayback 快照 /tmp/r25/fanqianxs-2022.html(存档时点真站原始 HTML, 56KB)
//    → 离线解析验证(项目引擎 parseList 直接跑快照, 非自造解析):
//      list 并集 133 项 / 127 书, name 133, bookUrl 133, author 73, category 69,
//      latestChapter 30, intro 4, cover 4(命中明细见下方各段注释)
//
// ⚠ 未实测声明(2026-09-15, 参照 wanbenshenzhan 规则 WANBEN_PROBE=1 先例):
//  - 真站状态: 沙箱直连 + 外部 reader 均被 Cloudflare IP 级封锁(403 Attention Required);
//    且 2024 年末域名 301 → fehuu.com(fehuu 亦 403 openresty) —— 全链路不可达, 无法四段实测
//  - list 段选择器 = 快照真实 DOM 实证(见上); book/toc/content 三段无存档,
//    按该模板家族(bxwx 笔下文学系「推荐皮」, 与首页实证结构同族)惯例书写并在合成夹具上
//    回归(og:novel meta 与 作者：/类别：/状态： 文本两种形态 + #list dd a 目录 + #content 正文),
//    真站命中与否待复验; 引擎 parseContent 自带 R9-c-6 最大文本容器兜底(主选择器落空时启用)
//  - 章节页 URL 实证形态 /html/{bookid}/{chapterid}.html(快照 #newslist s3 真链
//    /html/15479/16413180.html), 非部分家族站惯用的 /book/{bid}/{cid}.html ——
//    目录段按实际 href 提取故不受模板差异影响, 此处仅作探针与描述留档
//  - 换出口 IP(FetchConfig.proxyUrl, dd-a2 已实证机制)或站点解封后:
//    FANQ_PROBE=1 bun run scripts/seed-rule-fanqianxs.ts 复验四段
//
// 结构要点(快照实证, 除注明"推测"外):
//  - 首页 nav 分类: /xuanhuan/ /xiuzhen/ /dushi/ /lishi/ /wangyou/ /kehuan/ /yanqing/ /qita/
//    + /top/allvisit.html 排行 + /quanben/allvisit.html 全本(分类列表页结构未存档 → 推测)
//  - 首页板块: div#header / div#recommend(div.left>div.item×4 图文推荐 + div.right h2「本站强推」+ul)
//    / div#novelslist×2(各 3 个 div.content: h2 分类 + div.image+dl 特推 + ul li×10)
//    / div#newslist(div.left「分类最近更新」li×30 + div.right「最新添加」li×30)
//    / div#firendlink / div#footer; JS 注入 login_page()/search_page()/footer()(common.js)
//  - list 段取首页多板块并集做发现源(127 书): 分类列表页 /xuanhuan/ 家族标准形态(.content li)
//    未存档不入库, 任务侧可用任务 listUrl 直填分类页 URL + 家族选择器驱动(见 description)
// ============================================================
import { RuleSeed, seedRuleIdempotent, testSection } from './_seed-lib'

// [R25-1-1] 桌面 Chrome UA: CF 站按 UA/指纹分流, scrapling-stealthy 桥经 extra_headers 透传
// 规则 headers(桥内隐身浏览器自身头组的一致性由 Scrapling 维护); native 降级链走 customUa 同串
const FANQ_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// [R25-1-2] 测试探针(仅 FANQ_PROBE=1 时执行; URL 全部取自快照实链 — 书 id 22270=都市极品医神,
// 章节 /html/15479/16413180.html=超自然事件调查笔记第33章; rules/test 接口禁止 {page} 原串占位符)
const PROBE = {
  list: 'https://www.fanqianxs.com/',
  book: 'https://www.fanqianxs.com/book/22270/',
  toc: 'https://www.fanqianxs.com/book/22270/',
  content: 'https://www.fanqianxs.com/html/15479/16413180.html',
}

// export 供离线验证脚本复用四段规则 — 语义与入库内容同源防漂移(wanben 先例)
export const rule: RuleSeed = {
  name: '番茄小说网(www.fanqianxs.com)·CF隐身桥采集',
  description:
    // [R25-1-12] description ≤500 字符: 管理端入库截断 500(wanben 628 同例), 关键信息收进限额内
    'fanqianxs.com CF 封锁站(bxwx 系笔趣阁模板, UTF-8)。列表=首页多板块并集(#recommend div.item+#novelslist li+#recommend .right li+#newslist li, name/bookUrl="dt a,.s2 a,li>a" 首匹配), 快照实测 133 项/127 书; 分类页 /xuanhuan/ 未存档(任务 listUrl 可驱动)。\n⚠ 未实测(2026-09-15): CF IP 级 403+域名 301→fehuu.com(亦 403), 无法四段实测; list 段=2023-03-31 Wayback 快照实证, book/toc/content 按家族惯例写+合成夹具回归(og:novel meta+文本标签正则双保险/#list dd a 目录/#content 正文并集+引擎最大容器兜底); 章节页实证 /html/{bid}/{cid}.html。解封/换出口 IP 后 FANQ_PROBE=1 复验。fetch=scrapling-stealthy 桥+桌面 Chrome UA。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      // [R25-1-3] 发现源=首页(唯一实证页面)。无 {page} 占位符: 任务侧建议 listStart=listEnd=1;
      // 分类/排行页(结构未存档)可经任务 listUrl 直填驱动, 如 /xuanhuan/ /top/allvisit.html
      urlTemplate: 'https://www.fanqianxs.com/',
      // [R25-1-4] 四板块并集(快照实测 133 项/127 书):
      //   div#recommend div.item ×4 — 图文推荐(div.image>a>img 120x150 + dl dt span 作者 + dt a 书名 + dd 简介)
      //   #novelslist .content ul li ×60 — 8 个分类块各 10 条(li>a 书名 / 作者 跟在 a 后文本, 无独立节点)
      //   #recommend .right ul li ×9 — 本站强推(s1 [分类] / s2 书名 / s5 作者)
      //   #newslist ul li ×60 — 分类最近更新+最新添加(s1 [分类] / s2 书名 / s3 最新章 / s4 作者 / s5 日期)
      itemSelector: {
        type: 'css',
        expression:
          '#recommend div.item, #novelslist .content ul li, #recommend .right ul li, #newslist ul li',
      },
      fields: {
        // [R25-1-5] name/bookUrl 跨四板块统一选择器(引擎 cssExtract 首匹配语义, 并集按文档序):
        //   div.item → dt a(书名链; div.image a 封面链不在表达式内故不干扰)
        //   .s2 a → 强推/最近更新行书名链; li > a → 分类块裸 li 行书名链
        name: { type: 'css', expression: 'dt a, .s2 a, li > a', attr: 'text' },
        bookUrl: { type: 'css', expression: 'dt a, .s2 a, li > a', attr: 'href' },
        // div.item: dt span(作者在书名链前) / 强推行: .s5(无 s4 故安全) / 更新行: .s4(文档序先于 s5 日期)
        author: { type: 'css', expression: 'dt span, .s4, .s5', attr: 'text' },
        category: { type: 'css', expression: '.s1', attr: 'text', replaceFrom: '\\[|\\]', replaceTo: '' },
        latestChapter: { type: 'css', expression: '.s3 a', attr: 'text' },
        intro: { type: 'css', expression: 'dl dd', attr: 'text' },
        cover: { type: 'css', expression: 'img', attr: 'src' },
      },
      // 首页无分页: 关闭(runner 单页即整源; 分类页分页形态未存档不预设)
      pagination: { enabled: false, maxPages: 1 },
    },
    book: {
      enabled: true,
      // [R25-1-6] 书籍页 /book/{id}/ 结构未存档 — 双保险策略: og:novel meta 优先(文档序在前),
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
        // /img/{x}/{id}.jpg 路径为首页快照实证(封面缩略图), 书籍页大图按同族同路径惯例;
        // "/img/"(带尾斜杠)不会误命中 /images/logo 类(无尾斜杠)
        cover: {
          type: 'css',
          expression: 'img[src*="files/article/image"], img[src*="/img/"], #imgbox img, .imgbox img, .cover img, #img img',
          attr: 'src',
        },
      },
    },
    toc: {
      enabled: true,
      // [R25-1-7] 目录内嵌书籍页(bxwx 家族惯例): div#list > dl > dd > a(含首个"最新章节"块,
      // 引擎 toc 去重+重排吸收); 另备 .chapterlist/#chapterlist 系变体并集 — 家族模板变体兜底
      itemSelector: {
        type: 'css',
        expression: '#list dd a, #chapterlist li a, .chapterlist li a, #chapter_list dd a',
      },
      fields: {
        title: { type: 'css', expression: 'a', attr: 'text' },
        url: { type: 'css', expression: 'a', attr: 'href' },
      },
      // 单页目录无"下一页"锚 → 翻页链自然收敛; 家族部分站目录有分页形态时自动续页
      pagination: {
        enabled: true,
        maxPages: 20,
        nextLink: { type: 'css', expression: 'a:contains("下一页")', attr: 'href' },
      },
    },
    content: {
      enabled: true,
      // [R25-1-8] 章节页 /html/{bookid}/{chapterid}.html(快照实链)正文容器未存档:
      // 家族四常用容器并集(#content 为主), 全落空时引擎 R9-c-6 最大文本容器兜底生效
      fields: {
        content: { type: 'css', expression: '#content, #chaptercontent, #booktxt, .showtxt', attr: 'html' },
      },
      // 家族章节页无章内分页("下一章"=下一章): 关闭防多章并一章(biqugetw 同款口径)
      pagination: { enabled: false, maxPages: 1 },
    },
    fetch: {
      // [R25-1-9] CF IP 级封锁站 → 整次抓取交 scrapling-stealthy 桥(patchright 隐身浏览器
      // + CF 挑战自动求解); 桥不可达/桥内异常时引擎自动降级 native 链一次(engine=auto
      // 提供 http→浏览器升级路径, 引擎对 403/盾页 looksBlocked 正确判拦不入库)
      engine: 'auto',
      fetchMode: 'scrapling-stealthy',
      uaMode: 'custom',
      customUa: FANQ_UA,
      headers: { 'User-Agent': FANQ_UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
      autoCookie: true,
      referer: true,
      // 60s: stealthy 首启含浏览器冷启动+CF 挑战求解耗时(客户端护栏 max(timeout+15s, 45s))
      timeout: 60000,
      retries: 2,
      waitMs: 2000,
      browserFallbackStatus: [403, 412, 429, 503],
      hostGateLimit: 3,
    },
    clean: {
      removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript', '.adsbygoogle'],
      adPatterns: [
        '(www\\.)?fanqianxs\\.com\\S*',
        '(www\\.)?fehuu\\.com\\S*', // 301 目标域水印防御
        '番茄小说网[^<>]*',
        // 首页页脚声明(快照实证)与章节页同族变体
        '本站所有小说为转载作品[^<>]*',
        '(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?',
        '本章未完.*?点击下一页继续阅读',
        '一秒记住.*?免费读',
      ],
      whitelist: ['p', 'br', 'b', 'strong', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      normalize: true,
      plainText: false,
    },
  },
}

// ---------- 四段测试(仅 FANQ_PROBE=1: 站点解封后手动跑, 默认跳过不烧请求) ----------
async function liveProbe(): Promise<boolean> {
  const cfg = rule.config as Record<string, any>
  let allPass = true
  console.log('== fanqianxs.com 四段 live 探针(FANQ_PROBE=1, 串行+引擎内置限速) ==')
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
  const probe = process.env.FANQ_PROBE === '1'
  let allPass = true

  if (probe) {
    allPass = await liveProbe()
  } else {
    // [R25-1-10] 未实测模式(默认): CF IP 级封锁 + 301→fehuu(403), live 探针必然失败, 跳过不烧请求
    console.log('== 未实测模式(默认): 站点对沙箱出口不可达(Cloudflare IP 级 403, 301→fehuu 亦 403), 跳过 live 探针 ==')
    console.log('   解封后: FANQ_PROBE=1 bun run scripts/seed-rule-fanqianxs.ts')
  }

  // [R25-1-11] 幂等入库(_seed-lib 同名规则含历史重复全删后建; 失败 exit(1))
  await seedRuleIdempotent(rule)

  if (!allPass) process.exit(2)
}

// 直接执行时才入库; 被 import(离线验证脚本复用 rule)时不触发副作用
if (import.meta.main) main()

export {}
