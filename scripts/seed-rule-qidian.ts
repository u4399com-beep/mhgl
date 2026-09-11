// 种子脚本: 起点中文(镜像 API full.hnxianxin.cn/qd) 采集规则 —— 由 Legado 书源「小雨的世界 · 起点中文」转换 (R12-b)
// 用法: bun run scripts/seed-rule-qidian.ts
// 书源拉取: https://shuyuan-api.yiove.com/import/book-source/b1ddf6c1-98a2-4867-b91d-6b9eb99373d6
//   (该导入站自身有 Cloudflare managed challenge, 用本系统 cloak-browser:3016 standard 层穿透拉取)
//
// ================= 书源侦察结论(2026-09-11 实测) =================
// 站点形态: 纯 JSON API 镜像(非 HTML 站), 无 WAF 可匿名直连; 底层对接起点小程序数据:
//  1) GET /qd/ranking.php?action=ranking&site_id=11&order=11&page={page}&page_size=20&category_id=0
//     → {Data:{Books:[{BookId,BookName,AuthorName,Description,CategoryName,SubCategoryName,
//        ActionStatusString,WordsCount,...}]×20}} — 发现列表(书源 xyRankingUrl 同构, 站点/榜单/分类
//        筛选参数见描述; 引擎无关键词占位符, 搜索型发现属能力边界留档, 与 qimao 先例同口径)
//  2) GET /qd/detail.php?bookId={id}
//     → {Data:{BaseBookInfo:{BookName,CategoryName,BookStatus:"连载",WordsCnt,Description,
//        ChapterInfo:{LastVipUpdateChapterName,...}}, AuthorInfo:{Author,...}}}
//     → BookStatus 原文透传 → smartCompleteDetect 词表命中(连载→ongoing)
//  3) GET /qd/catalog.php?bookId={id}
//     → {data:[{N:章节名, Vo:是否卷行, C:章节载荷, T:时间/字数信息}]×N}
//     → ★C = "data:;base64,<b64>,{opts}" 形态, b64 解码即
//        {bookId, chapterId, v, epub, time} 签名载荷(time 为时效签名, 过期需重取目录);
//        卷行(Vo=true)C 为空串
//  4) GET /qd/content.php?bookId=..&chapterId=..&t=..&epub=..&v=..
//     → 正文 JSON(信封: 错误={error}|{detail}|{code,msg}; 内容=content|Content|Data.Content,
//        与书源 xyFormatContent 同口径); ★必须携带起点小程序会话凭证请求头
//        Ywkey/Ywguid(书源 loginUi "自订正文凭证"机制), 匿名 → 401 {"error":"缺少用户 token，
//        请先申请游客 token 或登录账号"}; 游客 token 端点全网逐路径探测 404 不存在
//  5) 封面: https://bookcover.yuewen.com/qdbimg/349573/{BookId}/180 (固定前缀对任意 BookId
//     实测有效, 双书验证 200 image/jpeg; 书源 xyCoverUrl 同款)
//
// ================= 外置转换代理 mini-services/qidian-proxy(端口 3017) =================
// 目录 C 载荷 b64 解码 + 签名 URL 合成 + 凭证头注入超出声明式引擎表达力 → 外置代理承载:
//   toc url 字段(const) 直指代理: http://127.0.0.1:3017/chapter?bookId={q.bookId}&index={index}&Vo={Vo}
//   · index = 目录数组 1 基下标(代理重取 catalog 后按行号取章, 签名恒新鲜, 且查询串不携带
//     载荷本体 — 无 '+'/花括号 URL 编码损耗面)
//   · 卷行过滤: 引擎侧 replaceFrom '^.*&Vo=true$' → '' 把卷行 URL 整体清空(引擎过滤空链接
//     目录条目, 不采卷头); 代理侧再校验行数据(卷行/越界报错)双保险
//   fetch.contentProxyUrl = http://127.0.0.1:3017/chapter?url={url}
//   · 该配置是引擎 SSRF 守卫的 loopback 豁免键(loopbackBypassAllowed 按 host:port 比对,
//     与 xjp/deqixs 同口径 —— 缺此配置时 127.0.0.1 章节抓取全拒, R12-c-1 实证 bug);
//   · degrade-native 契约: 引擎 contentProxyUrl 钩子先行探测(url= 形态)被代理故意快速拒绝
//     → 引擎"静默降级原 URL 直连" → 代理按 bookId+index 返回 {ok,len,content} JSON →
//     content 字段(json 类型)直接取纯文本。不走 hook 成功路径的原因: hook 会把文本包成
//     <p> HTML, 而解析器无"多段 <p> 聚合"提取器(css/regex 均取首个), json 字段会拿到空
//   · 正文凭证: 设 mini-services/qidian-proxy 环境变量 QD_YWKEY/QD_YWGUID(起点小程序
//     ywkey/ywguid, 书源自订凭证同源)后重启代理; 未配置时列表/书籍/目录三段照常,
//     正文返回 ok:false 附配置指引(章节正文为空, /health.credentialsConfigured=false 可诊)
//
// 引擎语法契约: types.ts 头注释(json 点路径/const 模板/{q.*}/{index}/两阶段提取);
// 对接先例: scripts/seed-rule-bqg713.ts(纯 JSON API 站)/seed-rule-xjp.ts(外置代理 degrade-native)
import { RuleSeed, seedRuleIdempotent, testSection } from './_seed-lib'

export {}
const rule: RuleSeed = {
  name: '起点中文(镜像API full.hnxianxin.cn)·Legado书源转换',
  description:
    '起点中文经镜像 API full.hnxianxin.cn/qd(Legado 书源「小雨的世界·起点中文」转换)。发现=ranking.php 榜单(男生站 site_id=11 人气最高; 女生/出版改 site_id=12/4, 榜单/分类/状态/字数/付费/标签筛选参数见 ranking.php?action=config),' +
    '书籍=detail.php, 目录=catalog.php(C 载荷 b64 签名), 正文经外置代理 mini-services/qidian-proxy:3017(目录索引→解码→签名 content.php)。\n' +
    '⚠ 正文需起点小程序凭证: 设 mini-services/qidian-proxy 环境变量 QD_YWKEY/QD_YWGUID 后重启代理(书源自订凭证机制同源; 未配置时三段发现/目录照常, 正文为空且 /health.credentialsConfigured=false 可诊)。\n' +
    'toc url 直指代理 + fetch.contentProxyUrl=…?url={url} 为 SSRF loopback 豁免键(degrade-native 契约, 缺失则章节抓取被 SSRF 全拒); 卷行以 Vo 标记在规则侧清空 URL 过滤。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      // ranking.php 男生站·人气榜; {page} 由任务范围(listStart..listEnd)驱动, 每页 20 本
      urlTemplate: 'https://full.hnxianxin.cn/qd/ranking.php?action=ranking&site_id=11&order=11&page={page}&page_size=20&category_id=0',
      itemSelector: { type: 'json', expression: 'Data.Books' },
      fields: {
        bookId: { type: 'json', expression: 'BookId' },
        name: { type: 'json', expression: 'BookName' },
        author: { type: 'json', expression: 'AuthorName' },
        intro: { type: 'json', expression: 'Description' },
        category: { type: 'json', expression: 'CategoryName' },
        // bookUrl 指书籍 API(fetcher 直抓 JSON), 非 SPA 页面
        bookUrl: { type: 'const', expression: 'https://full.hnxianxin.cn/qd/detail.php?bookId={bookId}' },
      },
      pagination: { enabled: false, maxPages: 1 },
    },
    book: {
      enabled: true,
      fields: {
        name: { type: 'json', expression: 'Data.BaseBookInfo.BookName' },
        author: { type: 'json', expression: 'Data.AuthorInfo.Author' },
        category: { type: 'json', expression: 'Data.BaseBookInfo.CategoryName' },
        intro: { type: 'json', expression: 'Data.BaseBookInfo.Description' },
        // "连载"原文透传 → runner smartCompleteDetect 词表命中(ongoing/completed)
        status: { type: 'json', expression: 'Data.BaseBookInfo.BookStatus' },
        latestChapter: { type: 'json', expression: 'Data.BaseBookInfo.ChapterInfo.LastVipUpdateChapterName' },
        // 封面 CDN 固定前缀对任意 BookId 有效(双书实测); {q.bookId} 取书籍页 URL 查询参数
        cover: { type: 'const', expression: 'https://bookcover.yuewen.com/qdbimg/349573/{q.bookId}/180' },
      },
    },
    toc: {
      enabled: true,
      // tocLink: const 模板, {q.bookId} 取书籍页 URL 查询参数(与 bqg713 {q.id} 同款)
      tocLink: { type: 'const', expression: 'https://full.hnxianxin.cn/qd/catalog.php?bookId={q.bookId}' },
      itemSelector: { type: 'json', expression: 'data' },
      fields: {
        title: { type: 'json', expression: 'N' },
        // 卷行标记(Vo=true): 仅供 url 模板引用做整体清空过滤
        Vo: { type: 'json', expression: 'Vo' },
        // url 直指外置转换代理(degrade-native, 见文件头); {index}=目录数组 1 基序号(含卷行,
        // 与代理侧重取的 catalog 行号一一对应); 卷行(Vo=true)URL 被 replaceFrom 整体清空
        // → 引擎过滤空链接条目不采卷头; 章节行保留 &Vo=false 后缀(代理忽略, 无害)
        url: {
          type: 'const',
          expression: 'http://127.0.0.1:3017/chapter?bookId={q.bookId}&index={index}&Vo={Vo}',
          replaceFrom: '^.*&Vo=true$',
          replaceTo: '',
        },
      },
      // JSON 目录 API 单次全量返回, 无翻页
      pagination: { enabled: false, maxPages: 1 },
    },
    content: {
      enabled: true,
      fields: {
        // 代理已完成 解码+签名合成+凭证注入+HTML→纯文本(\n 分段), 返回 {ok,len,content}
        content: { type: 'json', expression: 'content' },
      },
      pagination: { enabled: false, maxPages: 1 },
    },
    fetch: {
      engine: 'http',
      uaMode: 'custom',
      customUa: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      headers: { Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8' },
      autoCookie: false,
      referer: true,
      timeout: 20000,
      retries: 2,
      waitMs: 300,
      // list/book 直连上游 + content 每章 1 次代理(内含 1 次目录缓存读 + 1 次上游正文),
      // 同站(=代理)在飞钳 2 保守起步(与 xjp 同款)
      hostGateLimit: 2,
      // ── SSRF loopback 豁免键 + degrade-native 契约(见文件头) ──
      // 引擎钩子探测(url= 形态)被代理 400 快速拒绝 → 引擎降级直连原 URL(bookId+index 形态)
      // → 代理返回 {ok,len,content} JSON。缺失此配置时 127.0.0.1 章节抓取被 SSRF 全拒(R12-c-1)
      contentProxyUrl: 'http://127.0.0.1:3017/chapter?url={url}',
    },
    clean: {
      removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript'],
      whitelist: ['p', 'br', 'b', 'strong', 'em', 'i', 'u', 'h1', 'h2', 'h3'],
      // 代理输出已是纯文本\n分段: plainText 模式剥标签保段落, 存库即干净文本
      normalize: true,
      plainText: true,
    },
  },
}

async function main() {
  await seedRuleIdempotent(rule)

  // ---- 四段实测(代理 3017 已就绪时) ----
  const cfg = rule.config as Record<string, unknown>
  console.log('---- 四段实测 ----')
  const list = await testSection(rule, 'list', 'https://full.hnxianxin.cn/qd/ranking.php?action=ranking&site_id=11&order=11&page=1&page_size=20&category_id=0', (cfg.list as Record<string, unknown>))
  if (!list) return
  const sample = (list.sample as { bookUrl?: string; url?: string }[] | undefined)?.[0]
  const bookUrl = sample?.bookUrl || sample?.url
  if (!bookUrl) { console.log('  [list] 无 bookUrl 样本, 后续段跳过'); return }
  const book = await testSection(rule, 'book', bookUrl, cfg.book)
  if (!book) return
  const tocUrl = `https://full.hnxianxin.cn/qd/catalog.php?bookId=${bookUrl.split('bookId=')[1] || ''}`
  const toc = await testSection(rule, 'toc', tocUrl, cfg.toc)
  if (!toc) return
  const ch = (toc.sample as { url?: string }[] | undefined)?.[0]?.url
  if (!ch) { console.log('  [toc] 无章节 URL 样本, content 段跳过'); return }
  console.log('  章节URL样本:', ch)
  await testSection(rule, 'content', ch, cfg.content)
}

await main()
