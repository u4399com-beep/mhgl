// [R54] 模块化声明: 顶层 BASE/PASSWORD 不泄漏进 TS 全局脚本聚合作用域(与 seed-rules-batch-v2.ts 撞名, tsc 2451/2393)
export {}

// 种子脚本: 霹雳书屋 (www.pilishuwu.com) 采集规则
// 用法: bun run scripts/seed-rule-pilishuwu.ts
//
// ================= 真实结构侦察结论(R10-b 实测, 2026-09-11) =================
// 侦察手段: 本机裸 curl 403(Cloudflare) → 改用 z-ai-web-dev-sdk page_reader 后端通道
// 成功抓取 首页/分类列表页 P1 P2/书籍 info 页×2/目录 menu 页/正文 read 页 真实 HTML,
// 证据存档 tool-results/r10b-www_pilishuwu_com_*.html(gitignored)。站点为 wmcms-web
// 模板(/templates/wmcms-web/), 结构与 docker/autofill-rules.json 的 pili 条目互相印证。
//
// URL 结构(实测):
//   * 列表页 = /{cat}/list/0_0_0_0_0_0_0_{page}.html —— ★关键修正: 分页走筛选段格式,
//     旧规则推断的 /sort/{cat}/{page}.html 不存在; 且 /{cat}/list/{page}.html 仅第 1 页有
//     数据(P2 实测 0 项), 必须用 0_0_0_0_0_0_0_{page}.html 形态
//     (cat: 0=全部 1=男频 2=女频 3=电子图书 4=无CP 5=纯爱 6=百合 8=轻小说; 全站 22754 本/1138 页)
//   * 书籍页 = /{catDir}/{bookId}/info.html (catDir=书籍首分类数字, 如 /1/12263/info.html)
//   * 目录页 = /{catDir}/{bookId}/menu/1.html (书籍页"章节目录"按钮链接, 单页全量含全部章节,
//     1360 章实测单页完整返回; 正文卷头为 div.vloume —— 模板原始拼写, 不在条目内部, 卷名不逐条可得)
//   * 正文页 = /{catDir}/{bookId}/read/{chapterId}.html (单页无"下一页"分页)
//   * info 页内嵌"最新章"列表(works-chapter-list, 倒序仅 40 条)≠全量目录, 不可作目录源
//
// 选择器(实测核对, 非推断):
//   * 列表项 li.ret-search-item: h3.ret-works-title a(书名/书链) / p.ret-works-author
//     (文本"作者：x"需剥前缀) / p.ret-works-tags a(文本"分类：x"需剥前缀) /
//     p.ret-works-decs(简介) / a.mod-cover-list-thumb img(封面) / span.mod-cover-list-text(最新章)
//     (侧栏月点击榜 li.rank-item 类名不同, 不会混入)
//   * 书籍页: h2.works-intro-title strong(书名) / a.works-author-name(作者) /
//     label.works-intro-status("已完结"/"连载中", smartCompleteDetect 词表直中) /
//     a.works-ft-new(最新章) / p.works-intro-short(简介, 内含 <br> 换行 → 取 html 交 cleanIntro 转行) /
//     div.works-cover img(封面)。info 页无"分类"字段(标签≠分类), 分类由列表段 listFields 供给
//   * 目录页: span.works-chapter-item > a(正序全量章节)
//   * 正文页: div.j_readContent(纯 <p> 段落; 页尾广告 ins/script 在容器外不入提取, removeSelectors 兜底)
//   * fetch: 站点有 CF 防护(裸 HTTP 403), engine=auto + browserFallbackStatus 含 403/412/429/503
//     自动升级 Obscura 隐身浏览器求解; uaMode=desktop 同站恒定桌面 UA 族(CF 凭证不因换 UA 失效)
const BASE = process.env.BASE || 'http://localhost:3000'
// [R15-c] 缺省密码与 src/lib/auth.ts / scripts/_seed-lib.ts 同源(旧值 heis-admin-2025 与
// 编译期默认 audit-fix-2025 不一致, 无 ADMIN_PASSWORD 环境时必然 401)
const PASSWORD = process.env.ADMIN_PASSWORD || 'audit-fix-2025'

interface RuleSeed {
  name: string
  description: string
  enabled: boolean
  config: unknown
}

const rule: RuleSeed = {
  name: '霹雳书屋(www.pilishuwu.com)·CF防护隐身采集',
  description:
    '[R10-b实测修正] www.pilishuwu.com Cloudflare 防护站(wmcms-web模板, 裸HTTP 403)。engine=auto + browserFallbackStatus[403,412,429,503] 自动升级 Obscura 求解挑战, uaMode=desktop 保持同站UA指纹一致。实测结构: 列表=/0/list/0_0_0_0_0_0_0_{page}.html(旧版 /sort/* 与 /list/{page}.html 分页均无效, P2起0项) li.ret-search-item(h3.ret-works-title a 书名/书链, p.ret-works-author 剥"作者："前缀, p.ret-works-tags a 剥"分类："前缀, p.ret-works-decs 简介, 封面图) / 书籍=/bookId/info.html(h2.works-intro-title strong + a.works-author-name + label.works-intro-status 完结直判 + a.works-ft-new 最新章 + p.works-intro-short 简介<br>转行 + div.works-cover img; 无分类字段由列表段补) / 目录=tocLink a[href*=menu] → /menu/1.html 单页全量 span.works-chapter-item>a 正序 / 正文=/read/{cid}.html div.j_readContent 纯p段落单页。',
  enabled: true,
  config: {
    list: {
      enabled: true,
      // 0=全部小说分类; 分页必须走筛选段形态 0_0_0_0_0_0_0_{page}.html(实测 P2 /list/2.html 为 0 项)
      urlTemplate: 'https://www.pilishuwu.com/0/list/0_0_0_0_0_0_0_{page}.html',
      itemSelector: { type: 'css', expression: 'li.ret-search-item' },
      fields: {
        name: { type: 'css', expression: 'h3.ret-works-title a', attr: 'text' },
        bookUrl: { type: 'css', expression: 'h3.ret-works-title a', attr: 'href' },
        // "作者：皮皮树" → 剥前缀(replaceFrom 编译为 /g, 不用 ^ 锚防文本前导空白)
        author: { type: 'css', expression: 'p.ret-works-author', attr: 'text', replaceFrom: '作者[：:]\\s*', replaceTo: '' },
        // "分类：男频小说" → 剥前缀; runner 用 listFields.category 智能分类兜底
        category: { type: 'css', expression: 'p.ret-works-tags a', attr: 'text', replaceFrom: '分类[：:]\\s*', replaceTo: '' },
        intro: { type: 'css', expression: 'p.ret-works-decs', attr: 'text' },
        cover: { type: 'css', expression: 'a.mod-cover-list-thumb img', attr: 'src' },
        // 列表页"最新更新"章名(仅测试面板展示; 生产以书籍页 a.works-ft-new 为准)
        latestChapter: { type: 'css', expression: 'span.mod-cover-list-text', attr: 'text' },
      },
      pagination: { enabled: true, maxPages: 20 },
    },
    book: {
      enabled: true,
      fields: {
        name: { type: 'css', expression: 'h2.works-intro-title strong', attr: 'text' },
        // 作者卡独立元素(实测两书样本均在); 备选: regex （作者：([^）]{1,30})） 取 h2 标题内嵌作者
        author: { type: 'css', expression: 'a.works-author-name', attr: 'text' },
        // info 页无"分类"(works-intro-tags-item 是题材标签非分类) —— 故意不配 category,
        // 避免标签覆盖列表段真实分类(runner 取 parsed.category || listFields.category)
        status: { type: 'css', expression: 'label.works-intro-status', attr: 'text' },
        latestChapter: { type: 'css', expression: 'a.works-ft-new', attr: 'text' },
        // 简介内 <br> 分行: attr text 会把多行粘连, 取 html 交 cleanIntro 转 \n 并剥标签
        intro: { type: 'css', expression: 'p.works-intro-short', attr: 'html' },
        cover: { type: 'css', expression: 'div.works-cover img', attr: 'src' },
      },
    },
    toc: {
      enabled: true,
      // 书籍页"章节目录"按钮 → /{catDir}/{bookId}/menu/1.html (单页全量正序;
      // info 页内嵌 works-chapter-list 是倒序仅40条的"最新章", 不是目录源)
      // 兜底: 测试面板/runner 目录链接嗅探白名单含"章节目录"文案, 双保险
      // [R10-b2修正] 原稿 tocLink 为 "aref*='/menu/']"(缺 [href 左括号) —— 非法 CSS,
      // cssSelect 静默返回 null 致 tocLink 永远失效只剩嗅探兜底; 修正为合法属性选择器
      tocLink: { type: 'css', expression: "a[href*='/menu/']", attr: 'href' },
      itemSelector: { type: 'css', expression: 'span.works-chapter-item' },
      fields: {
        title: { type: 'css', expression: 'a', attr: 'text' },
        url: { type: 'css', expression: 'a', attr: 'href' },
      },
      // menu 页超长书可能分页(当前无"下一页"链, 哨兵不命中自然停在第1页, 零风险)
      pagination: { enabled: true, maxPages: 10 },
    },
    content: {
      enabled: true,
      fields: {
        // 章名(runner 以目录 title 入库, 此字段供测试面板对账)
        title: { type: 'css', expression: 'h3.j_chapterName', attr: 'text' },
        // 纯 <p> 段落容器; 页尾广告(script/ins)在容器外, removeSelectors 双保险
        content: { type: 'css', expression: 'div.j_readContent', attr: 'html' },
      },
      // 实测章节单页无"下一页"(底部导航仅 上一章/目录/下一章), 不启用正文分页
      pagination: { enabled: false, maxPages: 1 },
    },
    fetch: {
      engine: 'auto',
      // CF 站同站恒定桌面 UA 族(HTTP 阶段全 403 属预期, 浏览器阶段凭证不因换 UA 失效)
      uaMode: 'desktop',
      autoCookie: true,
      referer: true,
      timeout: 25000,
      retries: 2,
      waitMs: 1200,
      browserFallbackStatus: [403, 412, 429, 503],
      hostGateLimit: 2,
      proxyRotationStrategy: 'round-robin',
    },
    clean: {
      removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript', '.adsbygoogle', '.ad', '#ad', '.ads'],
      adPatterns: [
        '(www\\.)?pilishuwu\\.com\\S*',
        '霹雳书屋[^<>]*',
        '请记住本书.*?域名',
        '最新章节请到.*?查看',
        '一秒记住.*?免费读',
        '(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?',
      ],
      whitelist: ['p', 'br', 'b', 'strong', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      normalize: true,
      plainText: false,
    },
  },
}

async function main() {
  // 1. 登录获取 cookie
  console.log('== 霹雳书屋规则入库(R10-b 实测修正版) ==')
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  if (!loginRes.ok) {
    console.error('登录失败:', loginRes.status)
    process.exit(1)
  }
  const setCookie = loginRes.headers.get('set-cookie') || ''
  const cookieMatch = setCookie.match(/heis_admin=([^;]+)/)
  const cookie = cookieMatch ? `heis_admin=${cookieMatch[1]}` : ''
  if (!cookie) {
    console.error('无法获取 auth cookie')
    process.exit(1)
  }
  console.log('登录成功')

  // 2. 幂等: 删同名旧规则
  const listRes = await fetch(`${BASE}/api/admin/rules?take=200`, { headers: { cookie } })
  const listJson = (await listRes.json()) as { ok: boolean; data?: { id: string; name: string }[] }
  const raw = Array.isArray(listJson.data) ? listJson.data : []
  const dups = raw.filter((r) => r.name === rule.name)
  for (const d of dups) {
    await fetch(`${BASE}/api/admin/rules/${d.id}`, { method: 'DELETE', headers: { cookie } })
    console.log('  旧规则已删除:', d.id)
  }

  // 3. 创建规则
  const res = await fetch(`${BASE}/api/admin/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(rule),
  })
  const json = (await res.json()) as { ok: boolean; data?: { id?: string }; message?: string }
  console.log('入库结果:', json.ok ? `OK id=${json.data?.id}` : json.message)
  if (!json.ok) process.exit(1)

  console.log('\n✅ 霹雳书屋规则已入库')
  console.log('注: 选择器已对真实站点 HTML 实测核对(wmcms-web 模板, 证据 tool-results/r10b-*.html)。')
  console.log('    站点有 CF 防护: engine=auto + browserFallbackStatus[403] 自动降级 Obscura 隐身浏览器求解。')
}

main()
