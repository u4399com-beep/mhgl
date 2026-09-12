// ============================================================
// 种子脚本: 77读书 (www.77shuku.info) 采集规则 — 杰奇CMS 站
// 用法:
//   bun run scripts/seed-rule-77shuku.ts                      — 入库(默认跳过 live 探针)
//   CN77_PROBE=1 bun run scripts/seed-rule-77shuku.ts         — 入库前先跑四段 live 探针
//   CN_PROXY='<国内IP代理>' bun run scripts/seed-rule-77shuku.ts
//       — 把代理写入规则的 fetch.proxyUrl 再入库/探针(★本站必须走国内 IP 出口, 见下)
//
// 规则来源: Legado 书源 JSON 反译
//  - 上游: yckceo 源仓库 书源 ID 7819「77读书(77shuku)」(LegadoTeam 官方构建,
//    lastUpdateTime 2026-09-12, 书源注释声明搜索/发现/目录均实测)
//  - 目标页(用户指定): http://www.77shuku.info/rank/lastupdate/ (最近更新榜)
//
// 侦察实录(2026-09-15, 沙箱侧如实记录):
//  - DNS: www.77shuku.info / 77shuku.info / m.77shuku.info 全部 CNAME→77shuku.net.wajiasu.com
//    → A 178.107.155.19(美国 Los Angeles, Cnservers LLC); 77shuku.net→178.107.204.127,
//    77shuku.com→23.224.148.6(uucdn.cc 边缘) —— 同站多域, 以 .info 为基准(与书源一致)
//  - 沙箱出口直连 http/https 均 connection timeout(20s 无 SYN 响应) —— 站点仅国内 IP
//    可达(海外/数据中心段被边缘丢弃), 这正是"必须用国内 IP 代理"的原因;
//    ZAI page_reader(境外渲染网)可达但返回 application/octet-stream(站点对非国内
//    出口返回二进制响应体), 亦无法直接取到 HTML —— 四段选择器以下游实测书源为据
//
// ⚠ 未实测声明(参照 seed-rule-wanben.ts 先例):
//  - 本沙箱无国内 IP 代理资源, 四段选择器为 Legado 书源反译(书源作者在可访问环境实测过,
//    且该源 4 小时前仍在更新维护), 结构可信但未在本系统真网四段过线验证
//    (list≥10/toc≥50/content≥2000 未跑)
//  - 解封路径: 拿到国内 IP 代理后
//      CN_PROXY='http://user:pass@cn-proxy-host:port' CN77_PROBE=1 \
//        bun run scripts/seed-rule-77shuku.ts
//    即自动带代理做四段复验; socks5h:// 形态同样支持(bun fetch 不支持 socks5 会即时
//    失败自然落 curl 链, fetcher dd-a 实测记录), 逗号分隔多条代理构成轮换池(≤10 条)
//  - 管理端改法: 采集规则 → 编辑 77读书 → fetch 段 proxyUrl 填代理 → 保存,
//    再用规则编辑器的四段测试面板复验
//
// 反译要点(★=引擎语义差异需注意):
//  - 站点形态: 杰奇CMS(jieqicms) UTF-8, 无需登录, 书源注释声明无搜索频控(实测);
//    书源 concurrentRate 2/1000(每秒≤2 请求) → fetch.waitMs 钉 800ms
//  - UA: 书源 header 钉移动 UA(Pixel 8 / Chrome 126 Mobile)且选择器组在该 UA 下实测
//    有效 → fetch.uaMode='custom' 原样钉住, 不自作主张换桌面 UA
//  - list(rank 排行页): 杰奇排行标准布局 div#articlelist ul li, 字段 span.l1 分类/
//    span.l2 a 书名+链接/span.l3 作者/span.l4 a 最新章/span.l5 字数/span.l7 更新时间
//    ★li 非表格容器, 无 wanben 表格碎片陷阱; 可能存在的表头行(栏目说明 li)无
//    /novel/ 链接 → bookUrl 空值被 runner filter(Boolean) 天然过滤(wanben 同口径)
//    ★目标页 /rank/lastupdate/ 无 {page} 占位符: 杰奇排行页单页全量(书源 8 个排行
//    URL 均不带 {{page}} 为证), 任务范围请设 1..1; 其余 7 榜改路径即用:
//    /rank/{allvisit|monthvisit|weekvisit|postdate|size|allvote|goodnum|toptime}/
//    分类页(带分页)形态: /store/{cat}_{page}.html, cat: 1玄幻 2仙侠 3都市 4穿越
//    6恐怖 7科幻 8网游 9言情 —— 改 urlTemplate 为 /store/1_{page}.html 并开分页即可
//  - book: 杰奇标准 og:novel:* meta 全套(book_name/author/category/status/
//    latest_chapter_name)+ og:image 封面 + div#intro 简介 + div#info span.item 字数
//    (status 为杰奇 4.x 标准头, 缺失时引擎取空交 smartCompleteDetect, 零风险)
//  - toc: 目录内嵌书籍页 div.zjbox dd a(URL 含 /chapter/)→ 无 tocLink, runner 按
//    "tocLink 缺省 → 书籍页本身"语义直采(wanben 内嵌目录同款); 书源侧 dedup 由容器
//    锚定替代(最新章节区在别的容器, 不会混入); 杰奇服务端一次渲染全量目录,
//    分页关闭(书源无 nextTocUrl 为证)
//  - content: div#ChapterContents, 页内 div#content_tip 提示条 removeSelectors 剥除;
//    "txt下载地址"尾部广告块按行级广告词清洗(原 Legado JS 是 indexOf 截断, 本引擎
//    adPatterns 为子串抹除语义, URLs 带 scheme 已掩码保护, 模式组见 clean 段)
//  - search: /modules/article/search.php?searchkey={key} —— 本系统无搜索段概念
//    (用列表/排行发现书籍), 不翻译
import { RuleSeed, seedRuleIdempotent, testSection } from './_seed-lib'

// 书源 header 原样钉住的移动 UA(该 UA 下选择器组实测有效, 不换)
const QS_MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'

// 测试探针(仅 CN77_PROBE=1 时执行; URL 全部已展开无 {page} 占位符 —— rules/test 接口
// 会对占位符原串做 URL 规范化成 %7Bpage%7D 的坑, cc-b/dd-e 口径)。
// PROBE.content 需真实章节 URL(从目录实测结果任取一条 /chapter/ 链接填入), 留空则跳过
const PROBE = {
  list: 'http://www.77shuku.info/rank/lastupdate/',
  book: 'http://www.77shuku.info/novel/1/',
  toc: 'http://www.77shuku.info/novel/1/',
  content: '',
}

// export 供离线验证脚本复用四段规则 — 语义与入库内容同源防漂移
export const rule: RuleSeed = {
  name: '77读书 (77shuku.info)',
  description:
    '77shuku.info 杰奇CMS 站(Legado 书源反译, yckceo 源7819)。★需国内 IP 出口: 站点对海外/数据中心 IP 连接级丢弃(沙箱实测 timeout), 必须在 fetch.proxyUrl 配国内 IP 代理(http(s)://或socks5h://, 逗号分隔多条构成轮换池≤10, 走 curl 链生效)。列表=最近更新榜 /rank/lastupdate/(单页全量, 任务范围 1..1; 其余 7 榜 allvisit/monthvisit/weekvisit/postdate/size/allvote/goodnum/toptime 改路径即用; 分类页 /store/{1玄幻|2仙侠|3都市|4穿越|6恐怖|7科幻|8网游|9言情}_{page}.html 带分页) div#articlelist ul li(span.l2 a 书名/span.l3 作者/span.l1 分类剥[]/span.l4 a 最新章/span.l5 字数/span.l7 时间) / 书籍页 /novel/{id}/ og:novel:* meta 全套+og:image+div#intro+div#info 字数 / 目录内嵌书籍页 div.zjbox dd a(URL 含 /chapter/, 全量单页无翻页) / 正文 div#ChapterContents(去 #content_tip+行级广告词清洗: txt下载地址尾部/站名水印/导导流句)。UTF-8, 无需登录, waitMs 800 遵守书源 2req/s 频控, 移动 UA 钉住(书源同款)。\n⚠ 未实测: 本沙箱无国内代理资源, 四段为书源反译(书源作者实测过, 源 2026-09-12 仍在维护); 拿到代理后 CN_PROXY=… CN77_PROBE=1 重跑种子或管理端编辑 proxyUrl 后用四段测试面板复验。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      // 用户指定目标页: 最近更新榜(杰奇排行单页全量, 无 {page} 占位符;
      // 任务发现范围设 listStart=1/listEnd=1 即单页抓取)。换榜/换分类见头部注释
      urlTemplate: 'http://www.77shuku.info/rank/lastupdate/',
      // 杰奇排行标准布局: div#articlelist 内 ul>li 行式列表(li 非表格, 无碎片陷阱)
      itemSelector: { type: 'css', expression: 'div#articlelist ul li' },
      fields: {
        // span.l2 a = 书名+书籍链接(/novel/{id}/, 绝对或相对由引擎 absolutize 补全)
        name: { type: 'css', expression: 'span.l2 a', attr: 'text' },
        bookUrl: { type: 'css', expression: 'span.l2 a', attr: 'href' },
        author: { type: 'css', expression: 'span.l3', attr: 'text' },
        // 杰奇渲染 "[玄幻]" 带方括号, 剥两端
        category: {
          type: 'css',
          expression: 'span.l1',
          attr: 'text',
          replaceFrom: '\\[|\\]',
          replaceTo: '',
        },
        latestChapter: { type: 'css', expression: 'span.l4 a', attr: 'text' },
        // 字数形如 "1234.56千字"(信息性字段)
        wordCount: { type: 'css', expression: 'span.l5', attr: 'text' },
        // 更新时间(信息性字段)
        updateTime: { type: 'css', expression: 'span.l7', attr: 'text' },
      },
      // 排行页单页全量(书源 8 个排行 URL 均无 {{page}} 为证), 翻页关闭
      pagination: { enabled: false, maxPages: 1 },
    },
    book: {
      enabled: true,
      fields: {
        // 杰奇标准 og:novel:* meta 系列(attr 'content' 走引擎 default 分支 first.attr)
        name: { type: 'css', expression: 'meta[property="og:novel:book_name"]', attr: 'content' },
        author: { type: 'css', expression: 'meta[property="og:novel:author"]', attr: 'content' },
        category: { type: 'css', expression: 'meta[property="og:novel:category"]', attr: 'content' },
        // 杰奇 4.x 标准头(连载中/已完成), 缺失取空交 smartCompleteDetect
        status: { type: 'css', expression: 'meta[property="og:novel:status"]', attr: 'content' },
        latestChapter: { type: 'css', expression: 'meta[property="og:novel:latest_chapter_name"]', attr: 'content' },
        cover: { type: 'css', expression: 'meta[property="og:image"]', attr: 'content' },
        // 简介块 html, 清洗端白名单/normalize 收敛为段落
        intro: { type: 'css', expression: 'div#intro', attr: 'html' },
        // div#info 下的信息 span 中含"字数"的那枚("字数：123456字", 信息性字段;
        // :contains 为引擎既有语义, cssExtract 取首匹配)
        wordCount: {
          type: 'css',
          expression: 'div#info span.item:contains("字数")',
          attr: 'text',
          replaceFrom: '^字数[:：]\\s*|字$',
          replaceTo: '',
        },
      },
    },
    toc: {
      enabled: true,
      // 目录内嵌书籍页: div.zjbox 内 dd>a 列表(★itemSelector 钉在 a 上, 字段表达式
      // 'a' 依赖引擎"容器项独立重解析后根级自匹配"语义, wanben/kanunu8 系同款);
      // 无 tocLink → runner 按"书籍页本身"语义直采, 与杰奇模板吻合
      itemSelector: { type: 'css', expression: 'div.zjbox dd a' },
      fields: {
        title: { type: 'css', expression: 'a', attr: 'text' },
        url: { type: 'css', expression: 'a', attr: 'href' },
      },
      // 杰奇服务端一次渲染全量目录(书源无 nextTocUrl 为证), 翻页关闭
      pagination: { enabled: false, maxPages: 1 },
    },
    content: {
      enabled: true,
      fields: {
        content: { type: 'css', expression: 'div#ChapterContents', attr: 'html' },
      },
      // Legado ruleContent 无翻页规则 → 单页章节
      pagination: { enabled: false, maxPages: 1 },
    },
    fetch: {
      // 杰奇静态页无挑战(书源注释: 无需登录/无搜索频控实测), http 引擎+curl 链足够;
      // 国内 IP 代理经本段 proxyUrl 生效(curl -x, dd-a 实测机制)
      engine: 'http',
      // ★UA 钉移动(书源 header 同款): 选择器组在该 UA 下实测有效
      uaMode: 'custom',
      customUa: QS_MOBILE_UA,
      autoCookie: true,
      referer: true,
      timeout: 25000,
      retries: 2,
      // 书源 concurrentRate 2/1000 → 请求间隔 ≥500ms, 钉 800ms 留余量
      waitMs: 800,
      hostGateLimit: 3,
      // 国内 IP 代理入口: 种子期 CN_PROXY 环境变量注入(见头部用法), 或管理端规则
      // 编辑器直接填; 形态 http://u:p@host:port / socks5h://host:port, 逗号分隔
      // 多条轮换(≤10)。留空=直连(仅当部署机本身具备国内出口时可行)
      proxyUrl: '',
    },
    clean: {
      // #content_tip 为杰奇章节页内嵌提示条(书源 JS remove 同款)
      removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript', '#content_tip'],
      adPatterns: [
        // 正文尾部"txt下载地址"广告块(书源 indexOf 截断目标的行级翻译; 引擎为
        // 子串抹除语义, 带 scheme 的 URL 已掩码保护不受波及)
        'txt下载地址\\S*',
        'txt下载[^<>]*',
        '全集txt\\S*',
        'txt全集\\S*',
        // 站名/域名水印(含历史换域 77dushu 与竞品导流)
        '77shuku[^<>]*',
        '77dushu[^<>]*',
        '记住77[^<>]*',
        '牢记网址[^<>]*',
        '最新网址[^<>]*',
        '请收藏本站[^<>]*',
        '全文免费阅读[^<>]*',
        '(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?',
        // 常见导流句式(整词抹除; 比书源的整行丢弃更温和, 不伤伴随正文)
        '无弹窗',
        '最快更新',
        '手机版|手机端',
        '章节报错[^<>]*',
        'app下载[^<>]*',
        '请分享[^<>]*',
      ],
      whitelist: ['p', 'br', 'b', 'strong', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      normalize: true,
      plainText: false,
    },
  },
}

// CN_PROXY 注入: 种子期把国内代理写进 fetch.proxyUrl(入库/探针共用同一条规则对象)
const CN_PROXY = process.env.CN_PROXY?.trim() || ''
if (CN_PROXY) {
  ;(rule.config as Record<string, any>).fetch.proxyUrl = CN_PROXY
  console.log('已注入国内 IP 代理到 fetch.proxyUrl:', CN_PROXY.replace(/\/\/[^@]*@/, '//***@'))
}

// ---------- 四段测试(仅 CN77_PROBE=1: 配好国内代理后手动跑, 默认跳过不烧请求) ----------
async function liveProbe(): Promise<boolean> {
  const cfg = rule.config as Record<string, any>
  let allPass = true
  console.log('== 77shuku.info 四段 live 探针(CN77_PROBE=1, 经国内 IP 代理, 串行+800ms 限速) ==')
  const list = await testSection(rule, 'list', PROBE.list, cfg.list)
  if (!list || (list.count as number) < 10) allPass = false
  await new Promise((r) => setTimeout(r, 1200))

  const book = await testSection(rule, 'book', PROBE.book, cfg.book)
  if (!book || !book.fields || !(book.fields as Record<string, string>).name) allPass = false
  await new Promise((r) => setTimeout(r, 1200))

  const toc = await testSection(rule, 'toc', PROBE.toc, cfg.toc)
  if (!toc || (toc.count as number) < 50) { allPass = false; console.log('  !! toc<50 未过线') }
  await new Promise((r) => setTimeout(r, 1200))

  if (PROBE.content) {
    const content = await testSection(rule, 'content', PROBE.content, cfg.content)
    if (!content || (content.cleanedLength as number) < 2000) { allPass = false; console.log('  !! content<2000 未过线') }
  } else {
    console.log('  [content] ⊘ 跳过: PROBE.content 未填 — 从上方 toc 实测结果任取一条 /chapter/ 链接填入后重跑')
  }
  console.log(allPass ? '✅ 四段探针通过(list≥10, toc≥50, content≥2000)' : '❌ 存在未过线段落, 见上方日志')
  return allPass
}

async function main() {
  const probe = process.env.CN77_PROBE === '1'
  let allPass = true

  if (probe) {
    allPass = await liveProbe()
  } else {
    console.log('== 未实测模式(默认): 沙箱无国内 IP 代理, 站点对海外出口连接级丢弃, 跳过 live 探针 ==')
    console.log('   复验: CN_PROXY=<国内代理> CN77_PROBE=1 bun run scripts/seed-rule-77shuku.ts')
  }

  // [R11-d-6] 幂等入库收敛至 scripts/_seed-lib.ts(同名规则含历史重复全删后建; 失败 exit(1))
  await seedRuleIdempotent(rule)

  if (!allPass) process.exit(2)
}

// 直接执行时才入库; 被 import(离线验证脚本/gen-builtin-rules 求值提取)时不触发副作用
if (import.meta.main) main()

export {}
