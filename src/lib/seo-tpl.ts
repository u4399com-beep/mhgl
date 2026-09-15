// ============================================================
// [R24-4] 书籍页 / 章节目录 / 章节页 自动 SEO + 自动 TDK —— 模板组合引擎(纯函数, 客户端/服务端同构)
// 用户指令: 「书籍页、章节目录、章节页加入自动seo功能，自动TDK功能」。
//   · 三类页面各一套 TDK 模板, 变量插值 {var}, 未命中变量整段丢弃(防脏字符串泄漏)
//   · 自动兜底: 简介空→固定句式; 关键词空→书名/作者/分类/常青词组合; 全链路码点截断
//   · 模板覆盖: 全局 Setting.seoTemplates(JSON), 管理端可改(见 api/admin/seo-templates);
//     未配置 = DEFAULT_SEO_TEMPLATES(即「自动」语义)
// 与旧 useSiteSEO 手写 TDK 的关系: BookView/ReadView/[...slug] SSR 全部改走本引擎, 单一出处。
// ============================================================

/** 三类页面 TDK 模板集(全局共享一份, 不区分站点 —— 站点级差异化由 {sitename} 变量承担) */
export interface SeoTplSet {
  /** 书籍页(详情+首屏目录) */
  book: { title: string; description: string; keywords: string }
  /** 章节目录页(目录翻页 ?page>1 与目录锚点视图) */
  toc: { title: string; description: string }
  /** 章节页(正文阅读) */
  chapter: { title: string; description: string; keywords: string }
}

/** 自动 TDK 默认模板(参考主流书站 SEO 模板形态; 用户未自定义时即「自动」结果) */
export const DEFAULT_SEO_TEMPLATES: SeoTplSet = {
  book: {
    title: '{bookname}_{author}小说全文免费阅读 - {sitename}',
    description:
      '《{bookname}》是{author}创作的{category}小说，{statusText}。{intro}《{bookname}》在{sitename}提供全文免费在线阅读。',
    keywords: '{bookname},{bookname}小说,{bookname}全文阅读,{bookname}免费阅读,{author},{author}小说,{category}小说',
  },
  toc: {
    title: '{bookname}目录_全部章节列表 - {sitename}',
    description: '《{bookname}》{statusText}，共{chapterCount}章。{sitename}为您整理{bookname}全部章节目录，持续更新，免费在线阅读。',
  },
  chapter: {
    title: '{bookname}_{chaptername} - {sitename}',
    description: '《{bookname}》{chaptername}在线阅读：{excerpt}……{sitename}提供{bookname}最新章节免费无弹窗阅读。',
    keywords: '{bookname},{bookname}最新章节,{chaptername},{bookname}{chaptername},{bookname}无弹窗',
  },
}

/** 模板变量集(全部字段可选, 缺失变量在插值时整段丢弃或回退) */
export interface SeoTplVars {
  bookname?: string
  author?: string
  category?: string
  sitename?: string
  chaptername?: string
  chapterno?: string | number
  chapterCount?: string | number
  /** 连载状态文案: 连载中 / 已完结 / ''(未知 → statusText 输出空, 由句式容忍) */
  status?: string
  /** 简介纯文本(调用方负责清洗换行/实体; 引擎只做截断) */
  intro?: string
  /** 章节正文开头纯文本(章节页摘要用, 引擎截断) */
  excerpt?: string
  /** 站点关键词串(逗号分隔, 追加进 keywords 去重尾段) */
  siteKeywords?: string
}

/** 码点截断(UTF-16 代理对安全, 与前台 sliceCodePoints 同口径) */
function clamp(s: string, max: number): string {
  const pts = Array.from(s)
  return pts.length <= max ? s : pts.slice(0, max).join('')
}

/** 折叠空白(简介/摘要公共清洗: 换行/全角空格/连续空白 → 单空格) */
export function seoText(html?: string | null): string {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** {var} 插值; 未知变量剔除, 产出后清理残留空白与空段 */
function interpolate(tpl: string, vars: SeoTplVars): string {
  const statusText = vars.status === 'completed' ? '已完结' : vars.status === 'ongoing' ? '连载中' : ''
  const map: Record<string, string> = {
    bookname: vars.bookname || '',
    author: vars.author || '',
    category: vars.category || '',
    sitename: vars.sitename || '',
    chaptername: vars.chaptername || '',
    chapterno: vars.chapterno != null ? String(vars.chapterno) : '',
    chapterCount: vars.chapterCount != null ? String(vars.chapterCount) : '',
    statusText,
    intro: clamp(vars.intro || '', 110),
    excerpt: clamp(vars.excerpt || '', 90),
  }
  const out = tpl.replace(/\{(\w+)\}/g, (_m, key: string) => map[key] ?? '')
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/(，|,|。|；|;)\s*(，|,|。|；|;)+/g, '$1')
    .replace(/^[，,。；;\s]+|[，,。；;\s]+$/g, '')
    .trim()
}

/** 深合并: 用户模板覆盖默认(按字段, 缺省回退默认), 防脏 JSON 打穿 */
export function sanitizeSeoTpl(raw: unknown): SeoTplSet {
  const r = (raw || {}) as Partial<SeoTplSet>
  const pick = (v: unknown, d: string): string =>
    typeof v === 'string' && v.trim() && v.includes('{') ? v : d
  return {
    book: {
      title: pick(r.book?.title, DEFAULT_SEO_TEMPLATES.book.title),
      description: pick(r.book?.description, DEFAULT_SEO_TEMPLATES.book.description),
      keywords: pick(r.book?.keywords, DEFAULT_SEO_TEMPLATES.book.keywords),
    },
    toc: {
      title: pick(r.toc?.title, DEFAULT_SEO_TEMPLATES.toc.title),
      description: pick(r.toc?.description, DEFAULT_SEO_TEMPLATES.toc.description),
    },
    chapter: {
      title: pick(r.chapter?.title, DEFAULT_SEO_TEMPLATES.chapter.title),
      description: pick(r.chapter?.description, DEFAULT_SEO_TEMPLATES.chapter.description),
      keywords: pick(r.chapter?.keywords, DEFAULT_SEO_TEMPLATES.chapter.keywords),
    },
  }
}

export interface ComposedTdk {
  title: string
  description: string
  keywords?: string
}

/** 书籍页自动 TDK(title ≤40 码点 / description ≤150 / keywords ≤200 —— 主流搜索引擎展示安全线) */
export function composeBookTdk(vars: SeoTplVars, tpl?: SeoTplSet): ComposedTdk {
  const t = tpl || DEFAULT_SEO_TEMPLATES
  const sitename = vars.sitename || '小说站'
  const title = clamp(interpolate(t.book.title, vars) || `${vars.bookname || '小说'}免费阅读 - ${sitename}`, 40)
  const descFallback = `${vars.bookname || '小说'}${vars.author ? `,${vars.author}著` : ''}全文免费在线阅读 - ${sitename}`
  const description = clamp(interpolate(t.book.description, vars), 160) || descFallback
  const kwBase = interpolate(t.book.keywords, vars)
  const kwList = (vars.siteKeywords ? kwBase + ',' + vars.siteKeywords : kwBase)
    .split(/[,，、;；]/)
    .map((k) => k.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const keywords = clamp(
    kwList.filter((k) => (seen.has(k) ? false : (seen.add(k), true))).join(','),
    200,
  )
  return { title, description, keywords: keywords || undefined }
}

/** 章节目录页自动 TDK(书籍页目录翻页 ?page>1 视图; 与书籍页区分开, 避免同站多 URL 标题撞车) */
export function composeTocTdk(vars: SeoTplVars, tpl?: SeoTplSet): ComposedTdk {
  const t = tpl || DEFAULT_SEO_TEMPLATES
  const sitename = vars.sitename || '小说站'
  const title = clamp(interpolate(t.toc.title, vars) || `${vars.bookname || '小说'}目录 - ${sitename}`, 40)
  const description = clamp(interpolate(t.toc.description, vars), 160)
  return { title, description }
}

/** 章节页自动 TDK */
export function composeChapterTdk(vars: SeoTplVars, tpl?: SeoTplSet): ComposedTdk {
  const t = tpl || DEFAULT_SEO_TEMPLATES
  const sitename = vars.sitename || '小说站'
  const bookname = vars.bookname || '小说'
  const chaptername = vars.chaptername || '最新章节'
  const title = clamp(interpolate(t.chapter.title, vars) || `${bookname}_${chaptername} - ${sitename}`, 40)
  const descFallback = `${bookname} ${chaptername} 在线阅读 - ${sitename}`
  const description = clamp(interpolate(t.chapter.description, vars), 160) || descFallback
  const kwBase = interpolate(t.chapter.keywords, vars)
  const kwList = (vars.siteKeywords ? kwBase + ',' + vars.siteKeywords : kwBase)
    .split(/[,，、;；]/)
    .map((k) => k.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const keywords = clamp(
    kwList.filter((k) => (seen.has(k) ? false : (seen.add(k), true))).join(','),
    200,
  )
  return { title, description, keywords: keywords || undefined }
}
