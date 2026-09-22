// 种子脚本: 错层小说网 m.cuoceng.com (移动站, UUID 书号, 静态 HTML) 采集规则
// 用法: bun run scripts/seed-rule-cuoceng.ts
//
// ================= 站点侦察结论(R52-a, 2026-09-21 沙箱实测) =================
// 形态: 纯静态 SSR HTML(Bootstrap 风格移动站), UTF-8, https; 站点挂 Cloudflare(页面
//       onclick 带 __cfRLUnblockHandlers 痕迹)但对 curl 直连无 challenge, 实测全部 200。
// URL 形态: 列表 /book/finish/{page}.html(全本榜, 第 1 页亦可 /book/finish/1.html, 共 100 页
//       约 20 本/页; 另有 /book/ranking.html 排行与 /book/category/catalog.html 书库) |
//       书籍 /book/{UUID}.html | 章节 /book/{书UUID}/{章UUID}.html | 目录 /book/chapter/{书UUID}.html。
//       ★UUID 书号 → 不可用 mode=bookIds, 必须 mode=list。
// 列表: div.bookbox(.bookname a 书链+书名/.author 作者/.author 字数(两枚同 class, regex 取字数)/
//       .cat a 最新章节/.update 简介)。
// 书籍页: h1.booktitle 书名/.bookcover img.thumbnail 封面(img.cuoceng.com webp)/
//       .booktag(a.red=作者链接, a.blue=分类, span.blue=字数+阅读数, span.red=状态 全本/连载)/
//       p.bookintro 简介(尾部「本书由错层小说为您呈现…」推广句, replaceFrom 削尾)/
//       a.bookchapter 最新章节。
// 目录: 书籍页仅内嵌最新 3 条(#allchapter, dd data-num 倒序)+「查看全部章节」链接 →
//       独立目录页 /book/chapter/{书UUID}.html(500 dd/页实测全为章节链), ★目录分页
//       /book/chapter/{书UUID}/{页}.html, nextLink=a#linkNext; 实测该 book 5 页中第 5 页空
//       (章节<2000, 页数以站点实际为准), 空页 0 dd 引擎自然收敛。
// 正文: #content(div.readcontent) 单页全章 p 段落, 无正文翻页; 站点水印句极少入容器。
// 反爬态势: Cloudflare 在位但未启用 challenge(静态内容 curl 可取); 无 403/429。
// 引擎推荐: TS/Go 皆可(engine=http); 若 CF 未来收紧可升 browser(TS 引擎 obscura 渲染)。
import { RuleSeed, seedRuleIdempotent } from './_seed-lib'

export {}
const rule: RuleSeed = {
  name: '错层小说网(m.cuoceng.com)·移动站UUID书号采集',
  description:
    'm.cuoceng.com 错层小说网移动版(R52-a 2026-09-21 实测)。纯静态 SSR/UTF-8/https; Cloudflare 在位但未启用 challenge(curl 直连全 200)。' +
    'URL 形态: 列表 /book/finish/{page}.html(全本榜 100 页×20 本) | 书籍 /book/{UUID}.html(★UUID 书号, 不可用 mode=bookIds, 必须 mode=list) | ' +
    '章节 /book/{书UUID}/{章UUID}.html | 目录 /book/chapter/{书UUID}.html(500 章/页, 分页 /book/chapter/{UUID}/{页}.html, nextLink=a#linkNext)。' +
    '列表 div.bookbox/书籍 h1.booktitle+.booktag 组(a.red 作者/a.blue 分类/span.red 状态)/正文 #content 单页全章。' +
    '书籍页目录仅内嵌最新 3 条(倒序), 全量走 tocLink 指向独立目录页。简介尾部「本书由错层小说为您呈现…」推广句由 replaceFrom/clean 段清除。' +
    '反爬态势: CF 未启用 challenge → 推荐引擎 TS/Go 皆可(engine=http); 若 CF 收紧可切 browser(TS 引擎渲染)。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      // 全本榜 /book/finish/{page}.html(实测 1..100 页, 20 本/页)
      urlTemplate: 'https://m.cuoceng.com/book/finish/{page}.html',
      itemSelector: { type: 'css', expression: 'div.bookbox' },
      fields: {
        bookUrl: { type: 'css', expression: '.bookname a', attr: 'href' },
        name: { type: 'css', expression: '.bookname a', attr: 'text' },
        author: { type: 'css', expression: '.author', attr: 'text', replaceFrom: '^作者：', replaceTo: '' },
        // .author 有两枚(作者/字数), 字数从 item html regex 提取避开 nth 问题
        wordCount: { type: 'regex', expression: '字数：([0-9.]+万)' },
        latestChapter: { type: 'css', expression: '.cat a', attr: 'text' },
        intro: { type: 'css', expression: '.update', attr: 'text', replaceFrom: '^简介：', replaceTo: '' },
      },
      pagination: { enabled: true, maxPages: 2 },
    },
    book: {
      enabled: true,
      fields: {
        name: { type: 'css', expression: 'h1.booktitle', attr: 'text' },
        author: { type: 'css', expression: '.booktag a.red', attr: 'text' },
        category: { type: 'css', expression: '.booktag a.blue', attr: 'text' },
        wordCount: { type: 'css', expression: '.booktag span.blue', attr: 'text' },
        status: { type: 'css', expression: '.booktag span.red', attr: 'text' },
        latestChapter: { type: 'css', expression: 'a.bookchapter', attr: 'text' },
        // 尾部推广句(「本书由错层小说为您呈现…实时更新。」)削尾
        intro: {
          type: 'css', expression: 'p.bookintro', attr: 'text',
          replaceFrom: '本书由错层小说为您呈现[\\s\\S]*$', replaceTo: '',
        },
        cover: { type: 'css', expression: '.bookcover img', attr: 'src' },
      },
    },
    toc: {
      enabled: true,
      // 书籍页仅内嵌最新 3 条; 「查看全部章节」链接 → 独立目录页 /book/chapter/{UUID}.html
      tocLink: { type: 'css', expression: 'dd a[href*="/book/chapter/"]', attr: 'href' },
      itemSelector: { type: 'css', expression: 'div.chapterlist dd' },
      fields: {
        title: { type: 'css', expression: 'a', attr: 'text' },
        url: { type: 'css', expression: 'a', attr: 'href' },
      },
      pagination: {
        enabled: true,
        // 分页 /book/chapter/{UUID}/{页}.html, 500 章/页; 末页/空页自然收敛
        nextLink: { type: 'css', expression: 'a#linkNext', attr: 'href' },
        maxPages: 5,
        joinWith: '',
      },
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
      removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript'],
      adPatterns: [
        '错层小说.*?呈现',
        '(www\\.)?cuoceng\\.(com|org)\\S*',
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
