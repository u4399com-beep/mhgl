// 种子脚本: 神马小说 sma.yueyouxs.com (移动子域 WAP 站) 采集规则
// 用法: bun run scripts/seed-rule-yueyouxs.ts
//
// ================= 站点侦察结论(R52-a, 2026-09-21 沙箱实测) =================
// 形态: 纯静态服务端渲染 HTML(首页 73KB 全量书单内联), UTF-8, 无 WAF/无 challenge/
//       无 UA 过滤(桌面/移动 UA 均 200), 未观测 403/429; 直连可用。
// URL 形态: 书籍页 /b/{数字id}.html; 章节页 /r/{书id}/{章id}.html; 目录页 /c/{书id}.html;
//       列表页 /l/{类型}/{分类}/{page}.html(如男频榜 /l/s/29/{page}.html, 女频 /l/sc/0/21.html)。
//       纯数字书号 → 亦兼容 mode=bookIds(bookUrl 模板 https://sma.yueyouxs.com/b/{bookId}.html)。
// ★ 特殊点: 列表项无 <a> 标签! 跳转全靠容器 div.v-list-item 的 onclick 属性
//       (newWebView('/b/23070.html'...)/gotoPage('/b/23070.html')), bookUrl 需 regex 从
//       item html 提取(/b/\d+\.html), 引擎 absolutize 补全; 容器 d 属性含 Go 指针地址
//       泄漏(0xc00144fa00, 站点模板瑕疵, 与采集无关)。
// 目录: 书籍页「查看目录」链接 → 独立页 /c/{id}.html, 单页全量(2228 章 416KB 实测),
//       ul.catalog_ls li a; 页面底部「上一页/下一页」为 JS 展示分页, 数据全量内联无需翻页。
// 正文: 章节页把整章内联(var total=5 与 div.section 数一致): div.book 容器内 5 个
//       div.section(各含 h2 标题 + div.con 正文), 尾部 .wanzheng-dl/.dibu-dl 广告块内联,
//       靠 clean.removeSelectors 清洗; 每段尾部「（本章未完，请翻页）」占位行 adPatterns 清洗。
// 反爬态势: 无。保守采集即可(hostGate 2 + 任务间隔 800~1500ms)。
// 引擎推荐: TS/Go 皆可(纯静态), 本规则 fetch.engine=http 不依赖浏览器。
import { RuleSeed, seedRuleIdempotent } from './_seed-lib'

export {}
const rule: RuleSeed = {
  name: '神马小说(sma.yueyouxs.com)·移动站静态HTML采集',
  description:
    'sma.yueyouxs.com 神马小说移动子域 WAP 站(R52-a 2026-09-21 实测)。纯静态 SSR HTML/UTF-8/无反爬(无 WAF 无 UA 过滤), 直连即可。' +
    'URL 形态: 列表 /l/s/29/{page}.html(男生必读榜, {page} 分页) | 书籍 /b/{数字id}.html(亦兼容 mode=bookIds 模板 /b/{bookId}.html) | ' +
    '目录 /c/{id}.html(单页全量) | 章节 /r/{书id}/{章id}.html(整章 5 段 div.section 全内联, 无正文翻页)。' +
    '★列表项无 <a> 标签: 跳转在容器 onclick 属性里(newWebView/gotoPage), bookUrl 用 regex 从 item html 提取(/b/\\d+\\.html)。' +
    '书籍页作者/分类/字数为「作者：xx」文本段, 用 regex 提取; 目录页底部上一页/下一页是 JS 展示分页(数据全量内联), 规则不翻页。' +
    '正文 div.book 整体提取(attr html)后靠 clean 段去 h2 段标题/下载广告块(.wanzheng-dl/.dibu-dl)/「（本章未完，请翻页）」占位行。' +
    '反爬态势: 无 → 推荐引擎 TS/Go 皆可(engine=http 纯 HTTP 链路, 无需浏览器)。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      // 男生必读榜单页, {page} 形态 /l/s/29/1.html,2.html...(实测 page=2 存在)
      urlTemplate: 'https://sma.yueyouxs.com/l/s/29/{page}.html',
      itemSelector: { type: 'css', expression: 'div.v-list-item' },
      fields: {
        // 列表项无 <a>: 跳转 URL 在容器 onclick 属性(newWebView('/b/23070.html',...) 或 gotoPage(...))
        bookUrl: { type: 'regex', expression: '(/b/[0-9]+\\.html)' },
        name: { type: 'css', expression: '.v-title', attr: 'text' },
        author: { type: 'css', expression: '.v-author', attr: 'text', replaceFrom: '\\u00a0', replaceTo: '' },
        intro: { type: 'css', expression: '.v-intro', attr: 'text' },
        cover: { type: 'css', expression: '.v-cover-img', attr: 'src' },
        wordCount: { type: 'css', expression: '.v-words', attr: 'text' },
      },
      pagination: { enabled: true, maxPages: 2 },
    },
    book: {
      enabled: true,
      fields: {
        name: { type: 'css', expression: 'p.face-info-title', attr: 'text' },
        author: { type: 'regex', expression: '作者：([^<]+)' },
        category: { type: 'regex', expression: '分类：([^<]+)' },
        wordCount: { type: 'regex', expression: '字数：([^<]+)' },
        // 状态标签: 完结/连载
        status: { type: 'css', expression: '.content-tag .content-label', attr: 'text' },
        intro: { type: 'css', expression: '#intro', attr: 'text' },
        cover: { type: 'css', expression: '.face .face-cover img', attr: 'src' },
      },
    },
    toc: {
      enabled: true,
      // 书籍页「查看目录」链接(/c/{id}.html); 若站点改版失去该链接, 可退化为书籍页内嵌目录提取
      tocLink: { type: 'css', expression: 'a[href^="/c/"]', attr: 'href' },
      itemSelector: { type: 'css', expression: 'ul.catalog_ls li' },
      fields: {
        title: { type: 'css', expression: 'a', attr: 'text' },
        url: { type: 'css', expression: 'a', attr: 'href' },
      },
      // 目录单页全量(2228 章实测 416KB); 底部「下一页」为 JS 展示分页, 数据无翻页
      pagination: { enabled: false, maxPages: 1 },
    },
    content: {
      enabled: true,
      fields: {
        // 整章内联: div.book 含 5 个 div.section(h2 段标题 + div.con 正文)+尾部下载广告,
        // 整体取 html 后由 clean 段清洗(removeSelectors h2/广告块 + adPatterns 占位行)
        content: { type: 'css', expression: 'div.book', attr: 'html' },
      },
      pagination: { enabled: false, maxPages: 1 },
    },
    fetch: {
      engine: 'http',
      uaMode: 'mobile',
      autoCookie: true,
      referer: true,
      refererChain: true,
      timeout: 20000,
      retries: 2,
      waitMs: 500,
      browserFallbackStatus: [403, 429, 503],
      hostGateLimit: 2,
      hostGateConcurrency: 2,
      globalConcurrency: 6,
    },
    clean: {
      removeSelectors: [
        'script', 'style', 'iframe', 'ins', 'noscript',
        // 章节页 div.book 内: 5 段 h2 段标题 + 底部下载广告块(万本小说永久免费读/客户端引导)
        'h2', '.wanzheng-dl', '.dibu-dl', 'div[style*="padding:0 10px"]', 'a',
      ],
      adPatterns: [
        '（本章未完，请翻页）',
        '（本章完）',
        '万本小说\\s*永久免费读',
        '页面篇幅有限.*?算我输！',
        '(www\\.)?yueyouxs\\.com\\S*',
        '(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?',
      ],
      whitelist: ['p', 'br', 'b', 'strong', 'em', 'i', 'u', 'h1', 'h2', 'h3'],
      normalize: true,
      plainText: false,
    },
  },
}

async function main() {
  await seedRuleIdempotent(rule)
}

main()
