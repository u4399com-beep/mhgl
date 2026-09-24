// 种子脚本: 新笔趣阁 www.xbqg777.com (bqg 家族近亲, 静态 HTML) 采集规则
// 用法: bun run scripts/seed-rule-xbqg777.ts
//
// ================= 站点侦察结论(R52-a, 2026-09-21 沙箱实测) =================
// 形态: 纯静态 SSR HTML(「新笔趣阁」, bqg 家族近亲, 前端模板与 bqge 系同源), UTF-8,
//       https, 直连 200; 无 WAF challenge/无 UA 过滤/无 429。
// URL 形态: 列表 /{分类}?page={page}(分类 /ds /xh /xz /cy /wj...; ★分页为查询参数
//       /ds?page=2, page=1 亦 200) | 书籍 /{数字id}(无 .html 后缀!) | 章节 /{书id}/{章id}。
//       纯数字书号 → 亦兼容 mode=bookIds(bookUrl 模板 https://www.xbqg777.com/{bookId})。
// 列表: div.cls .card(分类页)与 .home .card(首页)同构: a 包裹(唯一 <a>, href 即书链)/
//       .cover img 封面/.title 书名/.author 作者/.des 简介。
// 书籍页: .detail .title 书名/.zuthor 作者/.state 状态/.upcont a 最新章节/.des .text 简介
//       (尾部 p.default 推广段, intro 用 replaceFrom 削尾)/.detail .cover img 封面。
// 目录: ★内嵌书籍页 div.chapter ol li a(616 li 实测全量, 正文顺序无倒序段)。
// 正文: article#article(<br> 分行纯文本型); h2 章名/.tj 推荐/.set 阅读器设置面板均在
//       article 外, 天然隔离。
// ★占位封面陷阱(任务书预警): 封面域名 cdn.biquge7.top; R52-a 实测 4 个真实 id 封面全部
//       200 且 md5 各异, 不存在的 id(99999999)返 404 —— 「恒 200 同一默认图」陷阱当日未复现;
//       但家族站点历史上存在该行为, 若发现入库封面高度重复(同一 md5 占比异常)应先核查
//       cdn.biquge7.top 是否退化, 而非规则选择器问题。
// 反爬态势: 无; 站点根曾有 biquge8.xyz 镜像注释(已注释未启用), 未发现可用镜像域声明。
// 引擎推荐: TS/Go 皆可(engine=http)。
import { RuleSeed, seedRuleIdempotent } from './_seed-lib'

export {}
const rule: RuleSeed = {
  name: '新笔趣阁(xbqg777.com)·bqg家族静态站采集',
  description:
    'www.xbqg777.com 新笔趣阁(bqg 家族近亲, R52-a 2026-09-21 实测)。纯静态 SSR HTML/UTF-8/https/无反爬, 直连即可。' +
    'URL 形态: 列表 /{分类}?page={page}(★查询参数分页, 如 /ds?page=2) | 书籍 /{数字id}(无 .html 后缀, 亦兼容 mode=bookIds 模板 /{bookId}) | ' +
    '章节 /{书id}/{章id}。列表 div.cls .card(容器唯一 <a> 即书链)/书籍 .detail(作者 .zuthor/状态 .state)/目录内嵌 div.chapter ol li a(616 章全量)/' +
    '正文 article#article。' +
    '★占位封面陷阱预警: 封面在 cdn.biquge7.top/www.biquge7.top/imgs/{id}.jpg; 实测真实 id 全 200 且图各异、不存在 id 返 404(当日陷阱未复现), ' +
    '但 bqg 家族历史上有「不存在封面恒 200 返同一默认图」行为 —— 若入库封面 md5 高度重复, 先核查 CDN 是否退化再调规则。' +
    '反爬态势: 无 → 推荐引擎 TS/Go 皆可(engine=http)。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      // 都市言情分类, 查询参数分页(?page=N, page=1 有效; 共 419 页)
      urlTemplate: 'https://www.xbqg777.com/ds?page={page}',
      itemSelector: { type: 'css', expression: 'div.cls .card' },
      fields: {
        // card 内唯一 <a> 包裹全部内容, href 即书籍链接(/34807 形态, 引擎 absolutize 补全)
        bookUrl: { type: 'css', expression: 'a', attr: 'href' },
        name: { type: 'css', expression: '.title', attr: 'text' },
        author: { type: 'css', expression: '.author', attr: 'text' },
        intro: { type: 'css', expression: '.des', attr: 'text' },
        cover: { type: 'css', expression: '.cover img', attr: 'src' },
      },
      pagination: { enabled: true, maxPages: 2 },
    },
    book: {
      enabled: true,
      fields: {
        name: { type: 'css', expression: '.detail .title', attr: 'text' },
        author: { type: 'css', expression: '.zuthor', attr: 'text', replaceFrom: '^作者：', replaceTo: '' },
        status: { type: 'css', expression: '.state', attr: 'text', replaceFrom: '^状态：', replaceTo: '' },
        // [R61-1B] 面包屑 .crumb 次级锚 = 分类(实测「都市言情」)
        category: { type: 'css', expression: '.crumb a:nth-of-type(2)', attr: 'text' },
        latestChapter: { type: 'css', expression: '.upcont a', attr: 'text' },
        // .des .text 尾部 p.default 推广段(「最新章节由网友提供…在线阅读。」)一并被 text 提取, 削尾
        intro: {
          type: 'css', expression: '.des .text', attr: 'text',
          replaceFrom: '最新章节由网友提供[\\s\\S]*$', replaceTo: '',
        },
        cover: { type: 'css', expression: '.detail .cover img', attr: 'src' },
      },
    },
    toc: {
      enabled: true,
      // 目录内嵌书籍页(div.chapter ol li a, 全量 616 章实测, 正文顺序无倒序段)
      itemSelector: { type: 'css', expression: 'div.chapter ol li' },
      fields: {
        title: { type: 'css', expression: 'a', attr: 'text' },
        url: { type: 'css', expression: 'a', attr: 'href' },
      },
      pagination: { enabled: false, maxPages: 1 },
    },
    content: {
      enabled: true,
      fields: {
        content: { type: 'css', expression: 'article#article', attr: 'html' },
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
      browserFallbackStatus: [403, 412, 429, 503],
      hostGateLimit: 2,
      hostGateConcurrency: 2,
      globalConcurrency: 6,
    },
    clean: {
      removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript'],
      adPatterns: [
        '本站所有小说为转载作品.*$',
        '笔趣阁免费提供.*?在线阅读。',
        '章节由网友上传',
        '(www\\.)?biquge7\\.top\\S*',
        '(www\\.)?xbqg777\\.com\\S*',
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
