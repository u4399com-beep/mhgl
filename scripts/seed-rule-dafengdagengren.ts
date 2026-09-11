// 种子脚本: 大奉打更人 (www.dafengdagengren.com) 笔趣阁模板采集规则
// 用法: bun run scripts/seed-rule-dafengdagengren.ts
// 侦察结论(bb-b 实测):
//  - WAF: 与 daweixs.com 同平台同款 nginx 403 挑战 —— 首访 403 + 110 字节跳转壳
//    `<html><meta charset="utf-8" /><title></title><div></div></html><script> window.location.href ="/"; </script>`
//    同时种 2 枚 Set-Cookie: {32位hex壳Cookie} + server_name_session(会话, 关键凭证)。
//    带 Cookie 二连即 200; 引擎 http 层 autoCookie 挑战重试链原生破解, 无需浏览器。
//  - 站点与 daweixs.com 同平台同模板(GBK 笔趣阁克隆), 四层选择器完全一致(各自实测确认)。
//  - 改版适配(dd-c 实测): 站点模板改版, 分类路径 /xuanhuan/ → /xuanhuanxiaoshuo/(同族
//    xiuzhen/dushi/lishi/kehuan/wangyou/nvsheng/wanben 全部加 xiaoshuo 后缀); 旧列表源
//    /paihangbang/ 上游故障恒 nginx 502(两站同步, 非挑战/非 404), 列表源改用分类页。
//  - 四层: 列表=/xuanhuanxiaoshuo/ 分类页 ul.txt-list.txt-list-row5 li(最近更新主列表,
//    30 本/页; span.s2 a=书名+链接, span.s4=作者; 精确锚定避开 div.item 推荐卡与
//    txt-list-row3 "最新入库"侧栏块, 旧宽选择器 ul.txt-list li 会混入 62 项) /
//    书籍页=.info h1 + 作者regex + .info .desc(现为 class="desc xs-hidden", token 匹配仍命中)
//    / 目录=书籍页内嵌 #section-list li a(逆天邪神实测 2524 链接) / 正文=#content。
//  - 分页形态: /xuanhuanxiaoshuo/ 即第 1 页(共 3975 页/30 本每页), 第 N≥2 页=
//    /list/1_{N}.html; 但 /list/1_1.html 恒 502 → {page} 模板不适用, 列表钉第 1 页
//    (翻页关闭)。runner 列表翻页仅 {page} 替换, 无法表达首页独立路径, 留档。
//  - 编码 GBK(Content-Type: text/html; charset=gbk + meta charset="gbk"),
//    fetcher.decodeBuffer 按 Content-Type 头优先自动解码, 引擎实抓中文无损(FFFD=0)。
//    挑战壳页(403)为 utf-8 纯 ASCII, 不受影响。
//  - 正文无章内翻页(.section-opt 只有 上一章/章节列表/下一章) → content 翻页必须关闭。
//  - 源站瑕疵: 部分章节(纵横中文网转载源)正文尾部带作者求捧场月票灌水块
//    (<h4>作者求捧场月票</h4> + 捧场N纵横币/投N张月票 残行), 已用 removeSelectors(h4)
//    + 广告正则清干净。
import { RuleSeed, seedRuleIdempotent, testSection } from './_seed-lib'

const PROBE = {
  list: 'https://www.dafengdagengren.com/xuanhuanxiaoshuo/',
  book: 'https://www.dafengdagengren.com/0_2/',
  toc: 'https://www.dafengdagengren.com/0_2/',
  content: 'https://www.dafengdagengren.com/0_2/23409004.html',
  content2: 'https://www.dafengdagengren.com/0_2/23409006.html',
}

const rule: RuleSeed = {
  name: '大奉打更人 (dafengdagengren.com)',
  description:
    'dafengdagengren.com GBK 笔趣阁模板站(与 daweixs.com 同平台同模板)。WAF: nginx 403 双 Set-Cookie 挑战(server_name_session 会话 Cookie 为关键凭证), 引擎 http 层 autoCookie 挑战重试链原生破解(首访种 Cookie 二连过, 无需浏览器)。dd-c 改版适配: 分类路径加 xiaoshuo 后缀, 旧列表源 /paihangbang/ 上游恒 502 已弃用, 列表改用 /xuanhuanxiaoshuo/ 分类页 ul.txt-list-row5 li(30 本/页, /list/1_N.html 第 N≥2 页但首页路径独立无法 {page} 表达)。书籍页 .info h1+作者 regex+.info .desc / 目录 #section-list li a / 正文 #content(纵横转载源带捧场月票灌水块, 已清洗)。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      // dd-c 改版: 分类页即第 1 页(30 本/页, 主列表="最近更新小说列表")。
      // 第 N≥2 页为 /list/1_{N}.html, 但 /list/1_1.html 恒 502 → {page} 模板不可用,
      // 钉第 1 页翻页关闭。row5 精确锚定: div.item 推荐卡与 txt-list-row3 侧栏不混入
      urlTemplate: 'https://www.dafengdagengren.com/xuanhuanxiaoshuo/',
      itemSelector: { type: 'css', expression: 'ul.txt-list.txt-list-row5 li' },
      fields: {
        name: { type: 'css', expression: 'span.s2 a', attr: 'text' },
        bookUrl: { type: 'css', expression: 'span.s2 a', attr: 'href' },
        // 新模板列表行自带作者(span.s4 纯文本, s5=日期); 仅供发现阶段展示, runner 以书籍页为准
        author: { type: 'css', expression: 'span.s4', attr: 'text' },
      },
      pagination: { enabled: false, maxPages: 1 },
    },
    book: {
      enabled: true,
      fields: {
        name: { type: 'css', expression: '.info h1', attr: 'text' },
        author: {
          type: 'regex',
          // "作者：火星引力" (h1.logo 是站名"笔趣阁", 不能用裸 h1)
          expression: '作者[:：]\\s*([^\\s<]{1,30})', attr: '1', flags: 'gs',
        },
        intro: { type: 'css', expression: '.info .desc', attr: 'html', replaceFrom: '\\s*【(?:添加微信公众号|我们的YY频道|QQ群|QQ交流群|公众账号)[^】]*】|&nbsp;', replaceTo: '' },
        category: { type: 'regex', expression: '类别[:：]\\s*([^\\s<]{1,12})', attr: '1', flags: 'gs' },
        status: { type: 'regex', expression: '状态[:：]\\s*([^\\s<]{1,10})', attr: '1', flags: 'gs' },
      },
    },
    toc: {
      enabled: true,
      // 书籍页内嵌目录: 首个 section-box 是"最新章节"倒序块, #section-list 是全量正序列表
      itemSelector: { type: 'css', expression: '#section-list li' },
      fields: {
        title: { type: 'css', expression: 'a', attr: 'text' },
        url: { type: 'css', expression: 'a', attr: 'href' },
      },
      pagination: { enabled: false, maxPages: 1 },
    },
    content: {
      enabled: true,
      fields: {
        content: { type: 'css', expression: '#content', attr: 'html', replaceFrom: 'https?:/{2,3}\\d{1,8}/', replaceTo: '' },
      },
      // 站点无章内翻页(.section-opt 只有 上一章/章节列表/下一章), 开启翻页会并章
      pagination: { enabled: false, maxPages: 1 },
    },
    fetch: {
      engine: 'http',
      uaMode: 'rotate',
      autoCookie: true,
      referer: true,
      timeout: 25000,
      retries: 2,
      waitMs: 800,
      browserFallbackStatus: [403, 412, 429, 503],
    },
    clean: {
      removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript', 'h4'],
      // ↑ h4: 纵横转载源正文尾部"作者求捧场月票"灌水块标题
      adPatterns: [
        // dd-c: 带协议前缀, 防止源站畸形外链残骸(http://域名/N/ 被剥域名后剩下 http:///N/)
        'https?:\\/\\/(www\\.)?dafengdagengren\\.com\\S*',
        // dd-c: 源站原生断链残骸(实测第1章 "零级大神</a>http:///19181/" 形态, 域名缺失的三斜杠 URL)
        'https?:\\/\\/\\/\\S*',
        '本站所有小说为转载作品[^。<>]*',
        '捧场\\d*纵横币',
        '投\\d*张月票',
        // bb-f 实测: h4 块标题被 removeSelectors 削掉后, 非 h4 包裹的"抽月票"链接残行漏网
        // (探针章 23409004/23409006 尾部各×1) —— 只加精确短语, 不放宽裸 '月票'(会误伤正文)
        '抽月票',
        '求月票',
        '疯求各种点击、收藏、红票、月票！?',
        '如果觉得本章写的精彩[^<]*',
        '(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?',
      ],
      whitelist: ['p', 'br', 'b', 'strong', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h5', 'h6'],
      normalize: true,
      plainText: false,
    },
  },
}

// ---------- 四段测试 ----------
async function main() {
  const cfg = rule.config as Record<string, any>
  let allPass = true

  console.log('== dafengdagengren 四段测试 ==')
  const list = await testSection(rule, 'list', PROBE.list, cfg.list)
  if (!list || (list.count as number) < 10) allPass = false

  const book = await testSection(rule, 'book', PROBE.book, cfg.book)
  if (!book || !book.fields || !(book.fields as Record<string, string>).name) allPass = false

  const toc = await testSection(rule, 'toc', PROBE.toc, cfg.toc)
  if (!toc || (toc.count as number) < 50) { allPass = false; console.log('  !! toc<50 未过线') }

  const content = await testSection(rule, 'content', PROBE.content, cfg.content)
  if (!content || (content.cleanedLength as number) < 2000) { allPass = false; console.log('  !! content<2000 未过线') }

  console.log('== 附加探针(不设门槛, 仅报告) ==')
  await testSection(rule, 'content', PROBE.content2, cfg.content)

  // [R11-d-6] 幂等入库收敛至 scripts/_seed-lib.ts(同名规则含历史重复全删后建; 失败 exit(1))
  await seedRuleIdempotent(rule)

  console.log(allPass ? '✅ 四段测试全部过线(toc≥50, content≥2000)' : '❌ 存在未过线段落, 见上方日志')
  if (!allPass) process.exit(2)
}

main()

export {}
