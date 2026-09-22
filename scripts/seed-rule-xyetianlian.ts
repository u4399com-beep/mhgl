// 种子脚本: 仙侠天恋 www.xyetianlian.com (杰奇 WAP 模板系, http + UTF-8) 采集规则
// 用法: bun run scripts/seed-rule-xyetianlian.ts
//
// ================= 站点侦察结论(R52-a, 2026-09-21 沙箱实测) =================
// 形态: 纯静态 SSR HTML, UTF-8(meta 声明与实际字节一致; 任务书提示的「编码注意」已核实
//       全站 utf-8, 无 GBK 页)。★仅 http 无 https; 直连 200 无 WAF/无 UA 过滤。
//       ⚠ 传输小坑: 源站部分页面(如分类页)无视请求头恒返 gzip —— 引擎 bun fetch 自动解压,
//       curl 链自带 --compressed(fetcher curlOnce 固定参数), 实测无影响。
// URL 形态: 列表 /fenlei/{分类}/{page}.html(1..N, 玄幻=1) | 书籍 /yt{数字id}/ 或拼音 slug
//       (/heyishengxiaomo/ —— 混合形态, 不能用 bookIds 模板, 必须 mode=list) |
//       章节 /{书slug}/{数字章id}.html。
// 列表: div.item 与手机小说(shoujixs)同款杰奇 WAP 模板(.image a 封面链接/dl dt a 书名/
//       dl dt span 作者/dl dd 简介); 分类页 /fenlei/1/2.html 实测存在(4.5KB/页约 10 本)。
//       排行榜 /paihangbang/ 与完本 /wanben/ 均单页无分页。
// 书籍页: div.info h2 书名/.cover img 封面/.small span 一组(作者：/分类：/状态：/字数：,
//       regex 逐个提取)/.small .last a 最新章节/div.intro 简介(尾部带推广文案, clean 段清)。
// 目录: ★内嵌书籍页 div.listmain dl(先「最新章节列表」12 条倒序 dd, 再「正文卷」全量 dd;
//       1646 dd 实测) —— tocLink 不配置, 引擎回落书籍页本身提取(runner extractToc 书籍页兜底)。
//       章节顺序: 最新 12 条倒序在前, 由 runner 章节重排阶段(R51-4)归位。
// 正文: #content(div.showtxt) 单页全章无翻页; 章节页 div.link 推荐块在 #content 外, 天然隔离。
// 反爬态势: 无(200 直连, 无 challenge/Cookie 盾); 服务端 Cache-Control max-age=3000。
// 引擎推荐: TS/Go 皆可(engine=http)。
import { RuleSeed, seedRuleIdempotent } from './_seed-lib'

export {}
const rule: RuleSeed = {
  name: '仙侠天恋(xyetianlian.com)·杰奇WAP模板http站采集',
  description:
    'www.xyetianlian.com 仙侠天恋(R52-a 2026-09-21 实测)。杰奇 WAP 模板系纯静态 SSR, ★仅 http 无 https, UTF-8(meta 与实际字节一致; ' +
    '部分页面无视请求头恒返 gzip, 引擎 bun fetch/curl --compressed 均自动解压无影响)。无反爬, 直连 200。' +
    'URL 形态: 列表 /fenlei/{分类}/{page}.html | 书籍 /yt{数字id}/ 或拼音 slug(混合形态, 不适用 mode=bookIds) | 章节 /{slug}/{章id}.html。' +
    '目录内嵌书籍页 div.listmain dl(最新 12 条倒序 + 正文卷全量, 1646 dd 实测) —— 无 tocLink, 引擎书籍页兜底提取, 倒序头部由章节重排归位。' +
    '正文 #content 单页全章。书籍页/正文尾部推广文案(无弹窗推荐地址/转载作品声明)由 clean 段清除。' +
    '反爬态势: 无 → 推荐引擎 TS/Go 皆可(engine=http)。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      // 玄幻分类 /fenlei/1/{page}.html, 实测 page=2 存在(约 10 本/页)
      urlTemplate: 'http://www.xyetianlian.com/fenlei/1/{page}.html',
      itemSelector: { type: 'css', expression: 'div.item' },
      fields: {
        bookUrl: { type: 'css', expression: '.image a', attr: 'href' },
        name: { type: 'css', expression: 'dl dt a', attr: 'text' },
        author: { type: 'css', expression: 'dl dt span', attr: 'text' },
        intro: { type: 'css', expression: 'dl dd', attr: 'text' },
        cover: { type: 'css', expression: '.image img', attr: 'src' },
      },
      pagination: { enabled: true, maxPages: 2 },
    },
    book: {
      enabled: true,
      fields: {
        name: { type: 'css', expression: 'div.info h2', attr: 'text' },
        author: { type: 'regex', expression: '作者：([^<]+)' },
        category: { type: 'regex', expression: '分类：([^<]+)' },
        status: { type: 'regex', expression: '状态：([^<]+)' },
        wordCount: { type: 'regex', expression: '字数：([0-9]+)' },
        latestChapter: { type: 'css', expression: '.small .last a', attr: 'text' },
        intro: { type: 'css', expression: 'div.intro', attr: 'text', replaceFrom: '^简介：', replaceTo: '' },
        cover: { type: 'css', expression: 'div.info .cover img', attr: 'src' },
      },
    },
    toc: {
      enabled: true,
      // 目录内嵌书籍页(div.listmain dl dd), 不配 tocLink —— runner 回落书籍页 HTML 提取
      itemSelector: { type: 'css', expression: 'div.listmain dl dd' },
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
      pagination: { enabled: false, maxPages: 1 },
    },
    fetch: {
      engine: 'http',
      uaMode: 'rotate',
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
      removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript', 'a'],
      adPatterns: [
        '作者：.*?所写的《.*?》无弹窗免费全文阅读为转载作品,?章节由网友发布。',
        '无弹窗推荐地址：\\S*',
        '无弹窗.*?阅读',
        '何以笙箫默小说小说推荐阅读：.*?$',
        '(www\\.)?xyetianlian\\.com\\S*',
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
