// 种子脚本: 大微小说网 (www.daweixs.com) 笔趣阁模板采集规则
// 用法: bun run scripts/seed-rule-daweixs.ts
// 侦察结论(bb-b 实测):
//  - WAF: nginx 级 403 挑战 —— 首访 403 + 110 字节跳转壳
//    `<html><meta charset="utf-8" /><title></title><div></div></html><script> window.location.href ="/"; </script>`
//    同时种 2 枚 Set-Cookie(域名级): {32位hex壳Cookie} + server_name_session(会话, 关键凭证)。
//    带 Cookie 二连即 200(实测 server_name_session 单枚即可过, 壳枚为干扰项);
//    引擎 http 层 autoCookie 挑战重试链(种 Cookie → 350ms → 重发)原生破解, 无需浏览器。
//  - 站点与 dafengdagengren.com 同平台同模板(GBK 笔趣阁克隆), 四层选择器完全一致。
//  - 改版适配(dd-c 实测): 站点模板改版, 分类路径 /xuanhuan/ → /xuanhuanxiaoshuo/(同族
//    xiuzhen/dushi/lishi/kehuan/wangyou/nvsheng/wanben 全部加 xiaoshuo 后缀); 旧列表源
//    /paihangbang/ 上游故障恒 nginx 502(两站同步, 非挑战/非 404), 列表源改用分类页。
//  - 四层: 列表=/xuanhuanxiaoshuo/ 分类页 ul.txt-list.txt-list-row5 li(最近更新主列表,
//    30 本/页; span.s2 a=书名+链接, span.s4=作者; 精确锚定避开 div.item 推荐卡与
//    txt-list-row3 "最新入库"侧栏块) / 书籍页=.info h1 + 作者regex + .info .desc
//    (现为 class="desc xs-hidden", token 匹配仍命中) + 类别/状态 regex /
//    目录=书籍页内嵌 #section-list li a(相对 NNNNNNNN.html; 首个 section-box 是"最新章节"
//    倒序块, 用 #section-list 精确锚定全量正序列表, 实测 614 链接) / 正文=#content。
//  - 分页形态: /xuanhuanxiaoshuo/ 即第 1 页(共 3299 页/30 本每页), 第 N≥2 页=
//    /list/1_{N}.html; 但 /list/1_1.html 恒 502 → {page} 模板不适用, 列表钉第 1 页
//    (翻页关闭)。runner 列表翻页仅 {page} 替换, 无法表达首页独立路径, 留档。
//  - 编码 GBK(Content-Type: text/html; charset=gbk + meta charset="gbk"),
//    fetcher.decodeBuffer 按 Content-Type 头优先自动解码, 引擎实抓中文无损(FFFD=0)。
//  - 正文无章内翻页(.section-opt 只有 上一章/章节列表/下一章) → content 翻页必须关闭。
//  - 已知源站瑕疵: 部分书籍章节(多为旧章)正文尾部混入其他小说摘录段落(无任何 HTML
//    标记包裹, 无法规则侧剥离); 选书采集时优先验证首章正文人物一致性。本规则四段探针
//    用的 在超自然的世界里低调成神(0_4) 实测首章干净(24KB 页 #content 真实正文)。
import { RuleSeed, seedRuleIdempotent, testSection } from './_seed-lib'

const PROBE = {
  list: 'https://www.daweixs.com/xuanhuanxiaoshuo/',
  book: 'https://www.daweixs.com/0_4/',
  toc: 'https://www.daweixs.com/0_4/',
  content: 'https://www.daweixs.com/0_4/1386.html',
  content2: 'https://www.daweixs.com/0_4/1387.html',
}

const rule: RuleSeed = {
  name: '大微小说网 (daweixs.com)',
  description:
    'daweixs.com GBK 笔趣阁模板站。WAF: nginx 403 双 Set-Cookie 挑战(server_name_session 会话 Cookie 为关键凭证), 引擎 http 层 autoCookie 挑战重试链原生破解(首访种 Cookie 二连过, 无需浏览器)。dd-c 改版适配: 分类路径加 xiaoshuo 后缀, 旧列表源 /paihangbang/ 上游恒 502 已弃用, 列表改用 /xuanhuanxiaoshuo/ 分类页 ul.txt-list-row5 li(30 本/页, /list/1_N.html 第 N≥2 页但首页路径独立无法 {page} 表达)。书籍页 .info h1+作者 regex+.info .desc / 目录 #section-list li a(精确锚定全量正序, 避开首个"最新章节"倒序块) / 正文 #content(<br>×3 段间折叠+第N/M页页码/本章未完引流行剥离 R21-f2-4, 章内翻页关闭防并章)。已知瑕疵: 部分旧章正文尾部混入他书摘录(无标记不可剥离), 采集前建议核对首章。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      // dd-c 改版: 分类页即第 1 页(30 本/页, 主列表="最近更新小说列表")。
      // 第 N≥2 页为 /list/1_{N}.html, 但 /list/1_1.html 恒 502 → {page} 模板不可用,
      // 钉第 1 页翻页关闭。row5 精确锚定: div.item 推荐卡与 txt-list-row3 侧栏不混入
      urlTemplate: 'https://www.daweixs.com/xuanhuanxiaoshuo/',
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
          // "作者：高山大任" (h1.logo 是站名"笔趣阁", 不能用裸 h1)
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
        // [R21-f2-4] 2026-09-14 复测: 与 dafengdagengren 同平台同坑 —— #content 段间 <br>×3
        // 三连分隔(实测 198 处 3+ 连续空行) + 部分章节变体带 "标题(第N/M页)"页码 +
        // "（本章未完，请点击下一页继续阅读）"引流行 + 同章子页锚。replaceFrom 全局收口:
        // ①3+ <br> 折叠 ②剥整个子页锚 ③剥引流行 ④剥残留页码标记。
        content: {
          type: 'css',
          expression: '#content',
          attr: 'html',
          replaceFrom: 'https?:/{2,3}\\d{1,8}/|(?:\\s*<br\\s*\\/?>){3,}|<a[^>]*>\\s*[^<]{0,40}第\\d+\\/\\d+页[^<]{0,10}\\s*<\\/a>|本章未完[^<]{0,40}|第\\d+\\/\\d+页',
          replaceTo: '',
        },
      },
      // 站点无章内翻页(.section-opt 只有 上一章/章节列表/下一章), 开启翻页会并章 ——
      // 2026-09-14 复测实证 pickNextHref 规则候选为空时落到文案兜底必误跟下一章, 翻页保持关闭
      pagination: { enabled: false, maxPages: 1 },
    },
    fetch: {
      // [R13-8] 站点已上线 WAF(直连 403, 2026-09-12 实测): browser 引擎可穿透(20KB 正常页),
      // 升级 auto —— HTTP 链 403 时按 browserFallbackStatus 自动升级浏览器(pilishuwu 同范式)
      engine: 'auto',
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
      // ↑ h4: 正文尾部"作者求捧场月票"块标题(纵向投月票灌水段首)
      adPatterns: [
        // dd-c: 带协议前缀 + 源站断链残骸(http:///N/ 形态)清洁, 同 dafeng 轮口径
        'https?:\\/\\/(www\\.)?daweixs\\.com\\S*',
        'https?:\\/\\/\\/\\S*',
        '本站所有小说为转载作品[^。<>]*',
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

  console.log('== daweixs 四段测试 ==')
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
