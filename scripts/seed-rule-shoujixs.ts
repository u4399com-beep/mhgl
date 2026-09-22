// 种子脚本: 手机小说 www.shoujixs.net (杰奇 WAP 模板系, GBK) 采集规则
// 用法: bun run scripts/seed-rule-shoujixs.ts
//
// ================= 站点侦察结论(R52-a, 2026-09-21 沙箱实测) =================
// 形态: 纯静态 SSR HTML(杰奇 WAP 模板, 与 xyetianlian 同款 div.item 结构), ★GBK 编码
//       (meta charset=gbk 与实际字节一致; 引擎 fetcher 已把 gbk/gb2312 升级 gb18030 解码,
//       R28-4-L4 嗅探窗 + FFFD 密度兜底), https, 直连 200 无 WAF。
// URL 形态: 列表 /{分类缩写}_{page}.html(玄幻奇幻 /xhqh_{page}.html, 实测 1..4324 页) |
//       书籍 /shoujixs_{数字id}/ | 章节 /shoujixs_{书id}_{章id}.html。
//       纯数字书号 → 亦兼容 mode=bookIds(bookUrl 模板 https://www.shoujixs.net/shoujixs_{bookId}/)。
// 列表: div.item(.image a 书链+封面/dl dt span 作者/dl dt a 书名/dl dd 简介)。
//       ★封面占位: 无封面书统一 nocover.jpg(modules/article/images/ 或 images.shoujixs.net),
//       属站点级真实占位图, 非反爬。
// 书籍页: #muluzuoceh h1 书名/p 系(作者：/更新时间/最新章节链接/字数：, regex 提取)/
//       #shojixsinto 简介区(首 p 为简介, 尾部推广文本与 TXT 下载行在 p 外)/#fmimg img 封面。
// 目录: 书籍页内嵌 #lbks dl(「最新8章节(倒叙)」8 dd + 「正文」前 80 章); ★全量目录分页
//       形态 /shoujixs_{书id}_{目录页}/ (80 章/页), 页面下拉框 select[name=pageselect] option
//       的 value 即各目录页地址(★value 域名为镜像站 www.shoujixsw.com, 实测同源同内容 200)。
//       → tocLink 取首个 option value(=第 1 页), 目录翻页 nextLink=span.right a(下一页,
//       href 相对 /shoujixs_{id}_{n+1}/); 末页下一页无 href 自然收敛。
// 正文: #zjny 单页全章 p 段落, 无正文翻页; 章节页 上一章/返回目录/下一章 链接在 #zjny 外。
// ★镜像域: www.shoujixsw.com 与 www.shoujixs.net 同源同内容(实测 200) —— fetch.mirrorDomains
//       配置互为故障切换(tocLink 天然落镜像域, 主域故障时正文请求亦可切换)。
// 反爬态势: 无; txt.shoujixs.net 为 TXT 下载子域(规则未用)。
// 引擎推荐: TS/Go 皆可(engine=http; GBK 解码引擎层已内置)。
import { RuleSeed, seedRuleIdempotent } from './_seed-lib'

export {}
const rule: RuleSeed = {
  name: '手机小说(shoujixs.net)·杰奇WAP模板GBK站采集',
  description:
    'www.shoujixs.net 手机小说(杰奇 WAP 模板系, R52-a 2026-09-21 实测)。纯静态 SSR, ★GBK 编码(meta 与实际字节一致; 引擎 fetcher 自动升' +
    '级 gb18030 解码), https, 无反爬直连 200。URL 形态: 列表 /{分类缩写}_{page}.html(如 /xhqh_1.html) | 书籍 /shoujixs_{数字id}/ ' +
    '(亦兼容 mode=bookIds 模板 /shoujixs_{bookId}/) | 章节 /shoujixs_{书id}_{章id}.html。' +
    '目录: 书籍页内嵌 #lbks(最新 8 章倒序 + 正文前 80 章), 全量目录分页 /shoujixs_{id}_{页}/(80 章/页), tocLink 取书籍页内 ' +
    'select[name=pageselect] 首个 option value(★镜像域 www.shoujixsw.com, 实测同内容), 目录翻页 nextLink=span.right a。' +
    '正文 #zjny 单页全章。封面占位: 无封面书统一 nocover.jpg(站点真实占位, 非反爬)。' +
    '★镜像域: www.shoujixsw.com ≡ www.shoujixs.net(实测 200 同源), fetch.mirrorDomains 互为故障切换。' +
    '反爬态势: 无 → 推荐引擎 TS/Go 皆可(engine=http, GBK 解码引擎层内置)。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      // 玄幻奇幻分类 /xhqh_{page}.html(实测 4324 页, 约 20 本/页)
      urlTemplate: 'https://www.shoujixs.net/xhqh_{page}.html',
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
        name: { type: 'css', expression: '#muluzuoceh h1', attr: 'text' },
        author: { type: 'regex', expression: '作者：([^<]+)' },
        wordCount: { type: 'regex', expression: '字数：([0-9.]+万字)' },
        latestChapter: { type: 'regex', expression: '最新章节：<a[^>]*>([^<]+)</a>' },
        // #shojixsinto 首 p 即简介(尾部推广文本/TXT 下载行在 p 外, 天然隔离)
        intro: { type: 'css', expression: '#shojixsinto p', attr: 'text' },
        cover: { type: 'css', expression: '#fmimg img', attr: 'src' },
      },
    },
    toc: {
      enabled: true,
      // 全量目录分页: 书籍页下拉框 option value(=https://www.shoujixsw.com/shoujixs_{id}_{页}/)
      tocLink: { type: 'css', expression: 'select[name="pageselect"] option', attr: 'value' },
      itemSelector: { type: 'css', expression: '#lbks dl dd' },
      fields: {
        title: { type: 'css', expression: 'a', attr: 'text' },
        url: { type: 'css', expression: 'a', attr: 'href' },
      },
      pagination: {
        enabled: true,
        // 每页底部 span.right > a「下一页」(href=/shoujixs_{id}_{n+1}/; 末页无 href 自然收敛)
        nextLink: { type: 'css', expression: 'span.right a', attr: 'href' },
        maxPages: 5,
        joinWith: '',
      },
    },
    content: {
      enabled: true,
      fields: {
        content: { type: 'css', expression: '#zjny', attr: 'html' },
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
      // dd-b 镜像故障切换: 目录下拉框天然落镜像域; 主域网络故障时互切(两域实测同源同内容)
      mirrorDomains: 'www.shoujixs.net,www.shoujixsw.com',
    },
    clean: {
      // 正文容器 #zjny 天然隔离站点头部/TXT下载行/推广文本, removeSelectors 保持最小集
      removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript', 'a'],
      adPatterns: [
        'www\\.shoujixsw?\\.com\\S*',
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
