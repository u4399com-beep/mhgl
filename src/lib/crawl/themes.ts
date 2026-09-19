// ============================================================
// 主题模版注册表 — [R24-5] 9 套「站点克隆」主题(唯一主题集); [R25-4] 扩至 10 套
// [R36-2a] 主题覆盖层: ThemeFooterCfg(页面底部) + ThemeOverride(阅读设置/页脚逐主题自定义),
//   经 applyThemeOverrides 在解析点合并, 存储走 Setting.theme_overrides(读侧 src/lib/theme-overrides.ts)
// 用户指令: 删除现在所有的主题模版, 克隆 9 个真实站点, 要求风格/布局/结构/配色完全一样:
//   aijjxs(久久小说) / pili(霹雳书屋) / kks101(101看書) / qb23(铅笔小说) /
//   ddyueshu(顶点小说) / x2552(吾爱文学网) / huangjinwu(黄金屋) / ggd66(格格党) / shipsay(船说CMS)
//   [R25-4] + trxsw(同人小说网, 第 10 套 —— 杰奇 CMS 经典默认模板; 结构按真站 2019-10-19
//   Wayback DOM 快照逐节复刻, b.css 无存档, 配色按杰奇 CMS 默认模板规范还原)
//
// 架构:
//   · layout/headerStyle 联合类型 = 9 个站点 id —— 首页布局与头部形态一一对应,
//     每站一个专属首页组件(src/components/public/sites/{Site}Home.tsx)与专属头部(SiteHeader IMITATION_HEADERS)
//   · vars 保留全量 CSS 变量契约(既有 BookView/ReadView/BookCard 等消费端零改动)
//   · customCss: 每站一条注入的裸 CSS(挂在 .clone-{id} 作用域下), 用于组件粒度难以
//     一比一还原的真站细节(边线/底纹/链接色/表格斑马纹等), PublicSite 统一注入
//
// 兜底链(旧主题 id 不崩不白屏):
//   getThemeById(id) = 9 套 preset 精确匹配 → undefined
//   getTheme(id)     = getThemeById(id) || THEMES[0] (aijjxs 恒兜底)
//   旧 preset id(amber-magazine-biquge 等)/旧组合 id(violet-glasswa-grid-cl)/
//   默认 themeId 'aurora' 全部解析失败 → 上层(PublicSite/SiteHeader)回退 THEMES[0]
// ============================================================

/** 阅读页布局原型 */
export type ReadLayoutKind = 'classic' | 'immersive' | 'paginated' | 'pili'

/** 阅读专属变量（全部字段可在主题里按需覆写, 缺省走 READ_DEFAULTS） */
export interface ReadVars {
  /** 阅读布局原型 */
  layout: ReadLayoutKind
  /** 正文栏宽 px（单栏阅读列最大宽度 / 分页模式单列宽） */
  measure: number
  /** 正文行高（倍数） */
  lineHeight: number
  /** 正文字号基准 px（用户调节档在其上 ±, 基准 17 = 旧行为） */
  fontBase: number
  /** 段首缩进 */
  indent: boolean
  /** 两端对齐 */
  justify: boolean
  /** 工具条形态: inline=文头工具条 / floating=悬浮胶囊 / bottom=底部固定条 */
  toolbar: 'inline' | 'floating' | 'bottom'
  /** 纸面/氛围纹理: none / paper=纸纹噪点 / vignette=暗角氛围 */
  texture: 'none' | 'paper' | 'vignette'
  /** 章节头装饰: rule=横线 / ornament=菱形花饰 / none */
  chapterDeco: 'rule' | 'ornament' | 'none'
}

/** 阅读缺省值（theme.read 缺字段/整体缺省时回退, 保证向后兼容） */
export const READ_DEFAULTS: ReadVars = {
  layout: 'classic',
  measure: 680,
  lineHeight: 2,
  fontBase: 17,
  indent: true,
  justify: false,
  toolbar: 'inline',
  texture: 'none',
  chapterDeco: 'rule',
}

/** 主题里允许只写部分阅读字段 */
export type ThemeReadConfig = Partial<ReadVars>

/** 取主题的完整阅读配置（缺省回退） */
export function readOf(theme?: { read?: ThemeReadConfig } | null): ReadVars {
  return { ...READ_DEFAULTS, ...(theme?.read || {}) }
}

// ============================================================
// [R36-2a-1] 页面底部可编辑配置 + 主题覆盖(阅读设置/页脚)纯合并与校验
//   —— 静态注册表 10 套 preset 数据零变化; 覆盖仅经 applyThemeOverrides 在解析点生效
// ============================================================

/** 页面底部可编辑三要素: 空串=渲染内置默认文案(逐字节零回归); links 缺省空数组 */
export interface ThemeFooterCfg {
  /** 版权行(空串=默认「© {year} {site.name} · {site.domain} · 保留所有权利」) */
  copyright: string
  /** 声明行(空串=默认「本站内容来自公开网络采集，仅作技术演示，如有侵权请联系删除」) */
  notice: string
  /** 自定义底部链接组(非空渲染「自定义链接：」行, safeHref 白名单出口) */
  links: { name: string; url: string }[]
}

/** 页脚缺省配置(空值语义: SiteFooter 渲染既有硬编码默认文案) */
export const THEME_FOOTER_DEFAULTS: ThemeFooterCfg = {
  copyright: '',
  notice: '',
  links: [],
}

/** 取主题的完整页脚配置(缺省回退, 与 readOf 对称) */
export function footerOf(theme?: { footer?: Partial<ThemeFooterCfg> | null } | null): ThemeFooterCfg {
  return { ...THEME_FOOTER_DEFAULTS, ...(theme?.footer || {}) }
}

/** 单主题覆盖(Setting.theme_overrides 的逐主题条目; 缺省段=该维度不覆盖) */
export interface ThemeOverride {
  read?: Partial<ReadVars>
  footer?: Partial<ThemeFooterCfg>
}

/** 覆盖配置在 Setting 表中的 key(与 admin settings KEY_RE 兼容) */
export const THEME_OVERRIDES_SETTING_KEY = 'theme_overrides'

/** read 仅接受这 9 个合法键(白名单外键在合并时剔除) */
const READ_OVERRIDE_KEYS = ['layout', 'measure', 'lineHeight', 'fontBase', 'indent', 'justify', 'toolbar', 'texture', 'chapterDeco'] as const
/** footer 仅接受这 3 个合法键 */
const FOOTER_OVERRIDE_KEYS = ['copyright', 'notice', 'links'] as const

/**
 * [R36-2a-1] 对解析出的主题应用覆盖(纯函数, 不修改入参, 返回新对象)。
 * - ov 缺省/非对象/read+footer 全空段 → 原样返回入参(引用相等, 前台零行为变化)
 * - read 浅合并: 仅 READ_OVERRIDE_KEYS 白名单键, 非法键剔除
 * - footer 浅合并: 仅 FOOTER_OVERRIDE_KEYS 白名单键, 且从 THEME_FOOTER_DEFAULTS 起底(合并结果恒全量)
 */
export function applyThemeOverrides(theme: ThemeDef, ov?: ThemeOverride | null): ThemeDef {
  if (!ov || typeof ov !== 'object' || Array.isArray(ov)) return theme
  const rawRead = (ov as { read?: unknown }).read
  const rawFooter = (ov as { footer?: unknown }).footer
  const hasRead = !!rawRead && typeof rawRead === 'object' && !Array.isArray(rawRead)
  const hasFooter = !!rawFooter && typeof rawFooter === 'object' && !Array.isArray(rawFooter)
  if (!hasRead && !hasFooter) return theme
  // 惰性拷贝: 白名单键全空(空段/仅非法键)的维度不注入, 双段皆空 → 原样返回入参(引用相等)
  let next: ThemeDef | null = null
  if (hasRead) {
    const src = rawRead as Record<string, unknown>
    const picked: Record<string, unknown> = {}
    for (const k of READ_OVERRIDE_KEYS) {
      if (src[k] !== undefined) picked[k] = src[k]
    }
    if (Object.keys(picked).length > 0) {
      next ??= { ...theme }
      next.read = { ...(theme.read || {}), ...picked } as ThemeReadConfig
    }
  }
  if (hasFooter) {
    const src = rawFooter as Record<string, unknown>
    const picked: Record<string, unknown> = {}
    for (const k of FOOTER_OVERRIDE_KEYS) {
      if (src[k] !== undefined) picked[k] = src[k]
    }
    if (Object.keys(picked).length > 0) {
      next ??= { ...theme }
      next.footer = { ...THEME_FOOTER_DEFAULTS, ...(theme.footer || {}), ...picked } as ThemeFooterCfg
    }
  }
  return next ?? theme
}

// ---------------- [R36-2a-2] 覆盖配置纯校验+钳制(零 IO, API 路由与 bun 单测共用) ----------------

export interface ThemeOverrideSanitizeOk {
  ok: true
  value: ThemeOverride
}
export interface ThemeOverrideSanitizeErr {
  ok: false
  message: string
}

/** 枚举白名单(与 READ_DEFAULTS/ReadVars 联合类型一一对应) */
export const READ_LAYOUT_OPTIONS: readonly ReadLayoutKind[] = ['classic', 'immersive', 'paginated', 'pili']
export const READ_TOOLBAR_OPTIONS = ['inline', 'floating', 'bottom'] as const
export const READ_TEXTURE_OPTIONS = ['none', 'paper', 'vignette'] as const
export const READ_CHAPTER_DECO_OPTIONS = ['rule', 'ornament', 'none'] as const

/** 数值边界(校验钳制口径, admin Slider 同界) */
export const READ_MEASURE_MIN = 480
export const READ_MEASURE_MAX = 900
export const READ_FONT_MIN = 14
export const READ_FONT_MAX = 24
export const READ_LINE_MIN = 1.4
export const READ_LINE_MAX = 2.6
/** 页脚文本/链接边界 */
export const FOOTER_TEXT_MAX = 300
export const FOOTER_LINKS_MAX = 20
export const FOOTER_LINK_NAME_MAX = 40
export const FOOTER_LINK_URL_MAX = 500

/** 链接 URL 存储侧白名单(与 public/safe-href 渲染出口同口径: 字面 https?:// 前缀, 实体编码形态天然不匹配) */
const FOOTER_LINK_URL_RE = /^https?:\/\//i

function isPlainObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 有限数字→钳制后的整数(非有限返回 null) */
function clampIntRange(n: unknown, min: number, max: number): number | null {
  const x = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(x)) return null
  return Math.min(max, Math.max(min, Math.round(x)))
}

/** 有限数字→钳制后保留 1 位小数(lineHeight 档位口径; 非有限返回 null) */
function clampLineHeight(n: unknown): number | null {
  const x = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(x)) return null
  const r = Math.round(x * 10) / 10
  return Math.min(READ_LINE_MAX, Math.max(READ_LINE_MIN, r))
}

/**
 * 覆盖配置消毒: 任意来源(JSON body) → 合法 ThemeOverride | 明确错误文案。
 * 校验失败返回 { ok:false, message }(API 直接 400 透传); 通过值仅含合法键与钳制后数值。
 */
export function sanitizeThemeOverride(raw: unknown): ThemeOverrideSanitizeOk | ThemeOverrideSanitizeErr {
  if (!isPlainObj(raw)) return { ok: false, message: '配置必须是对象' }
  const o = raw as Record<string, unknown>
  const out: ThemeOverride = {}

  const rawRead = o.read
  if (rawRead !== undefined && rawRead !== null) {
    if (!isPlainObj(rawRead)) return { ok: false, message: '阅读设置(read)必须是对象' }
    const r = rawRead as Record<string, unknown>
    const read: Record<string, unknown> = {}
    if (r.layout !== undefined) {
      if (!(READ_LAYOUT_OPTIONS as readonly string[]).includes(String(r.layout))) {
        return { ok: false, message: `非法的阅读布局: ${String(r.layout).slice(0, 32)}(允许: ${READ_LAYOUT_OPTIONS.join('/')})` }
      }
      read.layout = r.layout
    }
    if (r.measure !== undefined) {
      const m = clampIntRange(r.measure, READ_MEASURE_MIN, READ_MEASURE_MAX)
      if (m === null) return { ok: false, message: '栏宽必须是数字(480~900)' }
      read.measure = m
    }
    if (r.lineHeight !== undefined) {
      const l = clampLineHeight(r.lineHeight)
      if (l === null) return { ok: false, message: `行高必须是数字(${READ_LINE_MIN}~${READ_LINE_MAX})` }
      read.lineHeight = l
    }
    if (r.fontBase !== undefined) {
      const f = clampIntRange(r.fontBase, READ_FONT_MIN, READ_FONT_MAX)
      if (f === null) return { ok: false, message: `字号必须是数字(${READ_FONT_MIN}~${READ_FONT_MAX})` }
      read.fontBase = f
    }
    if (r.indent !== undefined) {
      if (typeof r.indent !== 'boolean') return { ok: false, message: '段首缩进必须是布尔值' }
      read.indent = r.indent
    }
    if (r.justify !== undefined) {
      if (typeof r.justify !== 'boolean') return { ok: false, message: '两端对齐必须是布尔值' }
      read.justify = r.justify
    }
    if (r.toolbar !== undefined) {
      if (!(READ_TOOLBAR_OPTIONS as readonly string[]).includes(String(r.toolbar))) {
        return { ok: false, message: `非法的工具条形态: ${String(r.toolbar).slice(0, 32)}(允许: ${READ_TOOLBAR_OPTIONS.join('/')})` }
      }
      read.toolbar = r.toolbar
    }
    if (r.texture !== undefined) {
      if (!(READ_TEXTURE_OPTIONS as readonly string[]).includes(String(r.texture))) {
        return { ok: false, message: `非法的纹理: ${String(r.texture).slice(0, 32)}(允许: ${READ_TEXTURE_OPTIONS.join('/')})` }
      }
      read.texture = r.texture
    }
    if (r.chapterDeco !== undefined) {
      if (!(READ_CHAPTER_DECO_OPTIONS as readonly string[]).includes(String(r.chapterDeco))) {
        return { ok: false, message: `非法的章节装饰: ${String(r.chapterDeco).slice(0, 32)}(允许: ${READ_CHAPTER_DECO_OPTIONS.join('/')})` }
      }
      read.chapterDeco = r.chapterDeco
    }
    if (Object.keys(read).length > 0) out.read = read as Partial<ReadVars>
  }

  const rawFooter = o.footer
  if (rawFooter !== undefined && rawFooter !== null) {
    if (!isPlainObj(rawFooter)) return { ok: false, message: '页面底部(footer)必须是对象' }
    const f = rawFooter as Record<string, unknown>
    const footer: Record<string, unknown> = {}
    if (f.copyright !== undefined && f.copyright !== null) {
      if (typeof f.copyright !== 'string') return { ok: false, message: '版权行必须是字符串' }
      const c = f.copyright.trim()
      if (c.length > FOOTER_TEXT_MAX) return { ok: false, message: `版权行不能超过 ${FOOTER_TEXT_MAX} 字(当前 ${c.length} 字)` }
      if (c) footer.copyright = c
    }
    if (f.notice !== undefined && f.notice !== null) {
      if (typeof f.notice !== 'string') return { ok: false, message: '声明行必须是字符串' }
      const n = f.notice.trim()
      if (n.length > FOOTER_TEXT_MAX) return { ok: false, message: `声明行不能超过 ${FOOTER_TEXT_MAX} 字(当前 ${n.length} 字)` }
      if (n) footer.notice = n
    }
    if (f.links !== undefined && f.links !== null) {
      if (!Array.isArray(f.links)) return { ok: false, message: '自定义链接必须是数组' }
      if (f.links.length > FOOTER_LINKS_MAX) return { ok: false, message: `自定义链接最多 ${FOOTER_LINKS_MAX} 条(当前 ${f.links.length} 条)` }
      const links: { name: string; url: string }[] = []
      for (let i = 0; i < f.links.length; i++) {
        const item = f.links[i]
        if (!isPlainObj(item)) return { ok: false, message: `第 ${i + 1} 条链接必须是对象` }
        const it = item as Record<string, unknown>
        if (typeof it.name !== 'string' || !it.name.trim()) return { ok: false, message: `第 ${i + 1} 条链接名称不能为空` }
        const name = it.name.trim()
        if (name.length > FOOTER_LINK_NAME_MAX) return { ok: false, message: `第 ${i + 1} 条链接名称不能超过 ${FOOTER_LINK_NAME_MAX} 字` }
        if (typeof it.url !== 'string' || !it.url.trim()) return { ok: false, message: `第 ${i + 1} 条链接 URL 不能为空` }
        const url = it.url.trim()
        if (url.length > FOOTER_LINK_URL_MAX) return { ok: false, message: `第 ${i + 1} 条链接 URL 不能超过 ${FOOTER_LINK_URL_MAX} 字符` }
        if (!FOOTER_LINK_URL_RE.test(url)) return { ok: false, message: `第 ${i + 1} 条链接 URL 仅支持 http/https 协议` }
        links.push({ name, url })
      }
      if (links.length > 0) footer.links = links
    }
    if (Object.keys(footer).length > 0) out.footer = footer as Partial<ThemeFooterCfg>
  }

  if (!out.read && !out.footer) return { ok: false, message: '没有需要保存的配置项' }
  return { ok: true, value: out }
}

// ============================================================
// [R24-5] 9 站点克隆 id —— layout/headerStyle/首页组件共用同一命名空间; [R25-4] +trxsw
// ============================================================
export type SiteCloneId =
  | 'aijjxs'
  | 'pili'
  | 'kks101'
  | 'qb23'
  | 'ddyueshu'
  | 'x2552'
  | 'huangjinwu'
  | 'ggd66'
  | 'shipsay'
  | 'trxsw' // [R25-4-1] 第 10 套: 同人小说网(杰奇 CMS 经典默认模板)
  | 'x33yq' // [R43-2] 第 12 套: 33言情(520xs/笔趣阁近亲模板)

/** 中文标签（后台预览/调试用） */
export const READ_LAYOUT_LABEL: Record<ReadLayoutKind, string> = {
  classic: '典书版',
  immersive: '沉浸暗夜',
  paginated: '分页横滑',
  pili: '书屋版',
}

/** 站点克隆主题中文名（后台站点表单/主题卡片共用） */
export const SITE_CLONE_LABEL: Record<SiteCloneId, string> = {
  aijjxs: '久久小说',
  pili: '霹雳书屋',
  kks101: '101看書',
  qb23: '铅笔小说',
  ddyueshu: '顶点小说',
  x2552: '吾爱文学',
  huangjinwu: '黄金屋',
  ggd66: '格格党',
  shipsay: '船说CMS',
  trxsw: '同人小说', // [R25-4-1]
  x33yq: '33言情', // [R43-2]
}

export interface ThemeDef {
  id: SiteCloneId
  name: string
  desc: string
  /** 首页布局 = 站点克隆 id(每站专属首页组件) */
  layout: SiteCloneId
  dark: boolean
  /** 阅读页布局与排版（缺省走 readOf 回退值） */
  read?: ThemeReadConfig
  /** [R36-2a-1] 页面底部可编辑配置(preset 不含此字段, 经 applyThemeOverrides 合并后恒全量) */
  footer?: ThemeFooterCfg
  /** [R24-5] 每站注入的裸 CSS —— 选择器一律以 .clone-{id} 开头(作用域挂 PublicSite 根) */
  customCss?: string
  /** 后台主题卡片预览色 */
  preview?: string[]
  vars: {
    bg: string
    surface: string
    surfaceAlt: string
    text: string
    textMuted: string
    primary: string
    primaryText: string
    accent: string
    border: string
    radius: string
    fontFamily: string
    cardShadow: string
    /** 头部形态 = 站点克隆 id(每站专属头部) */
    headerStyle: SiteCloneId
    titleFont?: string
    heroBg?: string
    heroText?: string
    heroMuted?: string
    surfaceGradient?: string
    patternBg?: string
    headingDeco?: 'bar' | 'swash' | 'ribbon' | 'bracket' | 'badge' | 'ornament' | 'dual'
    buttonStyle?: 'solid' | 'gradient' | 'outline' | 'pill' | 'neon'
    cardHover?: 'lift' | 'glow' | 'grow' | 'none'
    glowColor?: string
    gradientText?: boolean
  }
}

// ============================================================
// [R24-5] 9 套 + [R25-4] 1 套站点克隆 —— 色值来自各真站 HTML/CSS 实测(采样文件 /tmp/sites/、
// /tmp/r25/, 见各 preset 注释); trxsw 为杰奇默认模板规范还原(真站 b.css 无存档)
// ============================================================
export const THEMES: ThemeDef[] = [
  {
    // ① 久久小说 www.aijjxs.com — :root 实测: --bg:#f3efe7 --paper:#fffdf8 --ink:#1f2937
    //    --muted:#6b7280 --line:#e5dccd --brand:#0f766e --accent:#b45309 --radius:14px;
    //    头部 top-float 深酒红→青绿渐变固定导航条(白字链接)
    id: 'aijjxs',
    name: '久久小说(克隆)',
    desc: '仿 aijjxs.com 久久小说下载网·深酒红导航条+米黄纸面+青绿主色+琥珀强调(真站实测取色)',
    layout: 'aijjxs',
    dark: false,
    read: {
      layout: 'classic', measure: 680, lineHeight: 1.85, fontBase: 17,
      indent: true, justify: false, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
    customCss: [
      `.clone-aijjxs a{transition:color .15s ease}`,
      `.clone-aijjxs .site-footer{background:#f0ebe1}`,
    ].join('\n'),
    preview: ['#f3efe7', '#0f766e', '#b45309'],
    vars: {
      bg: '#f3efe7',
      surface: '#fffdf8',
      surfaceAlt: '#eef9f7',
      text: '#1f2937',
      textMuted: '#6b7280',
      primary: '#0f766e',
      primaryText: '#ffffff',
      accent: '#b45309',
      border: '#e5dccd',
      radius: '14px',
      fontFamily: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Arial,sans-serif',
      cardShadow: '0 10px 30px rgba(17,24,39,0.08)',
      headerStyle: 'aijjxs',
      heroBg: 'linear-gradient(135deg, #0f766e 0%, #115e59 60%, #0b4a45 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.8)',
      headingDeco: 'bar',
      buttonStyle: 'solid',
      cardHover: 'lift',
      gradientText: false,
    },
  },
  {
    // ② 霹雳书屋 www.pilishuwu.com — wmcms 模板实测: 主色 #fd8929(×24)/红强调 #d71704(×9)/
    //    渐变橙系 #ff9a6a→#f65400/米色 #faead0(×9)/背景 #fafafa(×9)/边线 #dcd8d4(×9)
    id: 'pili',
    name: '霹雳书屋(克隆)',
    desc: '仿 pilishuwu.com 霹雳书屋·白底暖橙复古书城(#fd8929 真站实测取色)·橙色大按钮·书屋版阅读',
    layout: 'pili',
    dark: false,
    read: {
      layout: 'pili', measure: 680, lineHeight: 1.9, fontBase: 18,
      indent: true, justify: false, toolbar: 'bottom', texture: 'none', chapterDeco: 'rule',
    },
    customCss: [
      `.clone-pili a{transition:color .15s ease}`,
      `.clone-pili .site-footer{background:#f5efe4}`,
    ].join('\n'),
    preview: ['#fafafa', '#fd8929', '#d71704'],
    vars: {
      bg: '#fafafa',
      surface: '#ffffff',
      surfaceAlt: '#faead0',
      text: '#333333',
      textMuted: '#999999',
      primary: '#fd8929',
      primaryText: '#ffffff',
      accent: '#d71704',
      border: '#dcd8d4',
      radius: '3px',
      fontFamily: '"Microsoft YaHei","PingFang SC","HarmonyOS Sans SC",sans-serif',
      cardShadow: '0 1px 4px rgba(125,54,15,0.08)',
      headerStyle: 'pili',
      heroBg: 'linear-gradient(135deg, #ff9a6a 0%, #fd8929 45%, #f65400 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.8)',
      headingDeco: 'ribbon',
      buttonStyle: 'pill',
      cardHover: 'lift',
      gradientText: false,
    },
  },
  {
    // ③ 101看書 101kks.com — /css/style.css 实测: body #f2f3f4/#333 yahei 14px;
    //    主色 #1f6cb2(×32) 蓝色导航/按钮/链接 · 辅助 #56a6c3 · 公告条 #fff2df · 边线 #ddd
    id: 'kks101',
    name: '101看書(克隆)',
    desc: '仿 101kks.com 101看書·蓝白经典繁体书站(#1f6cb2 真站实测取色)·米黄公告条·紧凑板块布局',
    layout: 'kks101',
    dark: false,
    read: {
      layout: 'classic', measure: 720, lineHeight: 2, fontBase: 17,
      indent: true, justify: true, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
    customCss: [
      `.clone-kks101 a{transition:color .15s ease}`,
      `.clone-kks101 .site-footer{background:#e8ebee}`,
    ].join('\n'),
    preview: ['#f2f3f4', '#1f6cb2', '#56a6c3'],
    vars: {
      bg: '#f2f3f4',
      surface: '#ffffff',
      surfaceAlt: '#f5f6fa',
      text: '#333333',
      textMuted: '#818a91',
      primary: '#1f6cb2',
      primaryText: '#ffffff',
      accent: '#56a6c3',
      border: '#dddddd',
      radius: '4px',
      fontFamily: '"Microsoft YaHei","PingFang SC","HarmonyOS Sans SC",sans-serif',
      cardShadow: '0 1px 3px rgba(0,0,0,0.06)',
      headerStyle: 'kks101',
      heroBg: 'linear-gradient(135deg, #1f6cb2 0%, #1a5f9e 55%, #17508a 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.8)',
      headingDeco: 'bar',
      buttonStyle: 'solid',
      cardHover: 'none',
      gradientText: false,
    },
  },
  {
    // ④ 铅笔小说 www.23qb.net — /mxstatic/css/style.css 实测: body #f8f9f9/#282828 system-ui;
    //    主色 #ff2a14(×63) 朱红 · 强调 #ff9800 橙(×11)/#34a853 绿(×11) · chip 暖杏色 · 边线 #e3e6eb
    id: 'qb23',
    name: '铅笔小说(克隆)',
    desc: '仿 23qb.net 铅笔小说·朱红主色+橙绿强调(#ff2a14 真站实测取色)·浅灰蓝纸面·封面网格布局',
    layout: 'qb23',
    dark: false,
    read: {
      layout: 'classic', measure: 680, lineHeight: 1.9, fontBase: 17,
      indent: true, justify: false, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
    customCss: [
      `.clone-qb23 a{transition:color .15s ease}`,
      `.clone-qb23 .site-footer{background:#f0f2f4}`,
    ].join('\n'),
    preview: ['#f8f9f9', '#ff2a14', '#ff9800'],
    vars: {
      bg: '#f8f9f9',
      surface: '#ffffff',
      surfaceAlt: '#f3f5f7',
      text: '#282828',
      textMuted: '#8f8f8f',
      primary: '#ff2a14',
      primaryText: '#ffffff',
      accent: '#ff9800',
      border: '#e3e6eb',
      radius: '8px',
      fontFamily: '-apple-system,"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei",sans-serif',
      cardShadow: '0 2px 8px rgba(40,40,40,0.06)',
      headerStyle: 'qb23',
      heroBg: 'linear-gradient(135deg, #ff2a14 0%, #ea2611 50%, #c81f0e 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.8)',
      headingDeco: 'ribbon',
      buttonStyle: 'gradient',
      cardHover: 'lift',
      gradientText: false,
    },
  },
  {
    // ⑤ 顶点小说 www.ddyueshu.cc — 经典笔趣阁模板(/images/biquge.css): 白底纸面+经典蓝导航+
    //    橙色强调+衬线书名。真站 GBK 编码老式三栏: header/logo+nav/main(hotcontent 左列表+右栏)/novelslist
    id: 'ddyueshu',
    name: '顶点小说(克隆)',
    desc: '仿 ddyueshu.cc 顶点小说·经典笔趣阁模板·白底蓝导航+橙强调·老式三栏板块布局',
    layout: 'ddyueshu',
    dark: false,
    read: {
      layout: 'classic', measure: 760, lineHeight: 2, fontBase: 18,
      indent: true, justify: true, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
    customCss: [
      `.clone-ddyueshu a{color:#06c;text-decoration:none}`,
      `.clone-ddyueshu a:hover{color:#f60;text-decoration:underline}`,
      `.clone-ddyueshu .site-footer{background:#f2f2f2;border-top:1px solid #ddd}`,
    ].join('\n'),
    preview: ['#ffffff', '#2b5b84', '#f60'],
    vars: {
      bg: '#ffffff',
      surface: '#fbfbfb',
      surfaceAlt: '#f4f6f9',
      text: '#333333',
      textMuted: '#999999',
      primary: '#2b5b84',
      primaryText: '#ffffff',
      accent: '#ff6600',
      border: '#dddddd',
      radius: '0px',
      fontFamily: '"Microsoft YaHei","PingFang SC","SimSun",sans-serif',
      cardShadow: 'none',
      headerStyle: 'ddyueshu',
      headingDeco: 'bar',
      buttonStyle: 'solid',
      cardHover: 'none',
      gradientText: false,
    },
  },
  {
    // ⑥ 吾爱文学网 www.x2552.com — 黑冰模板(heibing/css/style.css)实测:
    //    body #666 12px 微软雅黑/宋体 · 块底 #F2F2F2(×5) · 橙强调 #FF6600(×4)/#FF3300(×3) ·
    //    白面 #FFFFFF · sprite wamcc.png(菜单条 40px 蓝灰基因) · blocktitle 精灵图标题条
    id: 'x2552',
    name: '吾爱文学(克隆)',
    desc: '仿 x2552.com 吾爱文学网·黑冰经典模板·12px 密排+#F2F2F2 块面+#FF6600 橙强调',
    layout: 'x2552',
    dark: false,
    read: {
      layout: 'classic', measure: 740, lineHeight: 1.9, fontBase: 16,
      indent: true, justify: true, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
    customCss: [
      `.clone-x2552{font-size:12px}`,
      `.clone-x2552 a{color:#333;text-decoration:none}`,
      `.clone-x2552 a:hover{color:#FF6600}`,
      `.clone-x2552 .site-footer{background:#F2F2F2;border-top:2px solid #cfcfcf;font-size:12px}`,
    ].join('\n'),
    preview: ['#ffffff', '#4a5c78', '#FF6600'],
    vars: {
      bg: '#ffffff',
      surface: '#F2F2F2',
      surfaceAlt: '#f1f5fa',
      text: '#666666',
      textMuted: '#999999',
      primary: '#4a5c78',
      primaryText: '#ffffff',
      accent: '#FF6600',
      border: '#d9d9d9',
      radius: '0px',
      fontFamily: '"Microsoft YaHei","SimSun",Verdana,Arial,sans-serif',
      cardShadow: 'none',
      headerStyle: 'x2552',
      headingDeco: 'badge',
      buttonStyle: 'solid',
      cardHover: 'none',
      gradientText: false,
    },
  },
  {
    // ⑦ 黄金屋 www.huangjinwu.org — /static/default/style.css 实测(:root CSS 变量系统):
    //    --bg-color:#f0f4fb(渐变 #f5f8ff→#eef3fb) --card-bg:#fff --secondary-color:#2563eb
    //    --logo-color:#1d4ed8 --text:#1e293b --text-light:#64748b --border:#dbe4f0
    //    --radius:6px/10px --shadow:蓝调浅影 · 现代卡片栅格站(book-grid/book-info/badges)
    id: 'huangjinwu',
    name: '黄金屋(克隆)',
    desc: '仿 huangjinwu.org 黄金屋·现代蓝调卡片栅格(#2563eb 真站实测取色)·圆角卡片+蓝调浅影',
    layout: 'huangjinwu',
    dark: false,
    read: {
      layout: 'classic', measure: 700, lineHeight: 1.9, fontBase: 18,
      indent: true, justify: false, toolbar: 'floating', texture: 'none', chapterDeco: 'ornament',
    },
    customCss: [
      `.clone-huangjinwu{background:linear-gradient(180deg,#f5f8ff 0%,#eef3fb 100%)}`,
      `.clone-huangjinwu a{transition:color .2s ease}`,
      `.clone-huangjinwu .site-footer{background:#e2eaf5}`,
    ].join('\n'),
    preview: ['#f0f4fb', '#2563eb', '#1d4ed8'],
    vars: {
      bg: '#f0f4fb',
      surface: '#ffffff',
      surfaceAlt: '#f8fafc',
      text: '#1e293b',
      textMuted: '#64748b',
      primary: '#2563eb',
      primaryText: '#ffffff',
      accent: '#1d4ed8',
      border: '#dbe4f0',
      radius: '10px',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Microsoft YaHei","PingFang SC","Segoe UI",Arial,sans-serif',
      cardShadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37,99,235,0.06)',
      headerStyle: 'huangjinwu',
      heroBg: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 60%, #3b82f6 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.82)',
      headingDeco: 'swash',
      buttonStyle: 'solid',
      cardHover: 'lift',
      gradientText: false,
    },
  },
  {
    // ⑧ 格格党 www.ggd66.com — /static/simple/style.css 实测(@charset gb2312):
    //    body #f9f9f9/#888 15px 微软雅黑 · header #1abc9c 50px 白字 · hover #f50 ·
    //    分页/按钮强调 #56ccb5(×10) · 深绿 #00886d · 极简单页头导航(.header 高 75pt 移动双排)
    id: 'ggd66',
    name: '格格党(克隆)',
    desc: '仿 ggd66.com 格格党·青绿极简模板(#1abc9c/#56ccb5 真站实测取色)·白卡面+封推横排',
    layout: 'ggd66',
    dark: false,
    read: {
      layout: 'classic', measure: 720, lineHeight: 2, fontBase: 17,
      indent: true, justify: false, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
    customCss: [
      `.clone-ggd66 a:hover{color:#f50}`,
      `.clone-ggd66 .site-footer{background:#f0f0f0;border-top:1px solid #e5e5e5}`,
    ].join('\n'),
    preview: ['#f9f9f9', '#1abc9c', '#56ccb5'],
    vars: {
      bg: '#f9f9f9',
      surface: '#ffffff',
      surfaceAlt: '#f4f4f4',
      text: '#888888',
      textMuted: '#999999',
      primary: '#1abc9c',
      primaryText: '#ffffff',
      accent: '#56ccb5',
      border: '#eeeeee',
      radius: '2px',
      fontFamily: '"Microsoft YaHei",Microsoft Yahei,simsun,arial,sans-serif',
      cardShadow: 'none',
      headerStyle: 'ggd66',
      heroBg: 'linear-gradient(135deg, #1abc9c 0%, #16a085 60%, #00886d 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.85)',
      headingDeco: 'bar',
      buttonStyle: 'solid',
      cardHover: 'lift',
      gradientText: false,
    },
  },
  {
    // ⑨ 船说CMS demo.shipsay.com — /static/shipsay/style.css 实测:
    //    主色 #bf2c24(×11 深红)/#ed4259(×6 亮红) · 底 #fbfbfb(×12) · 文字 #555/#969ba3 ·
    //    米黄面板 #FBF6EC · 白卡 #ffffff · 容器式头部(.container.head)+侧栏推荐列(side_commend)
    id: 'shipsay',
    name: '船说CMS(克隆)',
    desc: '仿 demo.shipsay.com 船说CMS·深红主色+亮红强调(#bf2c24 真站实测取色)·米黄侧栏面板·容器式头部',
    layout: 'shipsay',
    dark: false,
    read: {
      layout: 'classic', measure: 700, lineHeight: 2, fontBase: 18,
      indent: true, justify: true, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
    customCss: [
      `.clone-shipsay{background:#f4f4f4}`, // [R24-6-d] agent 实测真站首页底色比 #fbfbfb 深一档
      `.clone-shipsay a{transition:color .15s ease}`,
      `.clone-shipsay .site-footer{background:#bf2c24;color:#fbfbfb}`,
      `.clone-shipsay .site-footer a{color:#fbfbfb}`,
    ].join('\n'),
    preview: ['#fbfbfb', '#bf2c24', '#ed4259'],
    vars: {
      bg: '#fbfbfb',
      surface: '#ffffff',
      surfaceAlt: '#FBF6EC',
      text: '#555555',
      textMuted: '#969ba3',
      primary: '#bf2c24',
      primaryText: '#ffffff',
      accent: '#ed4259',
      border: '#e8e8e8',
      radius: '4px',
      fontFamily: '"Microsoft YaHei","PingFang SC","Hiragino Sans GB",sans-serif',
      cardShadow: '0 1px 4px rgba(0,0,0,0.05)',
      headerStyle: 'shipsay',
      heroBg: 'linear-gradient(135deg, #bf2c24 0%, #a62418 55%, #8c1d13 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.82)',
      headingDeco: 'ribbon',
      buttonStyle: 'solid',
      cardHover: 'lift',
      gradientText: false,
    },
  },
  {
    // ⑩ 同人小说网 www.trxsw.com — 杰奇 CMS(jieqi)经典默认模板, GBK 编码(展示层已由 fetcher 解码)。
    //    结构依据: 真站 2019-10-19 Wayback 完整 DOM 快照(/tmp/r25/trxsw-wb.html)逐节复刻
    //    (ywtop 顶条/head 文字 logo+搜索框/nav 分类条×12/novelslist 2 行×3 板块[top 图文头条
    //    67×82 封面+书名/作者/简介 + li «书名 /作者»]/#newscontent .l 最近更新 s1~s5 + .r 小说推荐/
    //    #firendlink 友链/.footer)。真站 b.css 无存档(css 快照全为 Wayback 错误页),
    //    配色按杰奇 CMS 默认模板家族公认规范还原: body 白底 #fff 宋体/arial 12~14px 系 ·
    //    .ywtop 浅灰 #f5f5f5 细底边 · logo 红棕 #C00 粗体大字 · .nav 深蓝渐变 #1C5087→#1F5FA9
    //    白字 · 链接 #333 / hover #C00 红 · h2 浅色渐变底+左竖条+下边线 · li 36px 行高点线 #ccc ·
    //    .footer #f5f5f5 居中灰字。
    id: 'trxsw',
    name: '同人小说(克隆)',
    desc: '仿 trxsw.com 同人小说网·杰奇CMS经典默认模板·白底红棕logo+深蓝渐变导航(b.css 无存档, 配色按杰奇默认模板规范还原)',
    layout: 'trxsw',
    dark: false,
    read: {
      layout: 'classic', measure: 740, lineHeight: 2, fontBase: 18,
      indent: true, justify: true, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
    customCss: [
      // [R25-4-1] 杰奇默认模板细节(组件粒度难还原处): 链接 #333 / hover #C00 红 · 页脚浅灰居中灰字
      `.clone-trxsw{font-size:14px}`,
      `.clone-trxsw a{color:#333;text-decoration:none}`,
      `.clone-trxsw a:hover{color:#C00}`,
      `.clone-trxsw .site-footer{background:#f5f5f5;border-top:1px solid #e5e5e5;color:#999}`,
      `.clone-trxsw .site-footer a{color:#666}`,
    ].join('\n'),
    preview: ['#ffffff', '#1C5087', '#C00'],
    vars: {
      bg: '#ffffff',
      surface: '#ffffff',
      surfaceAlt: '#f5f5f5',
      text: '#333333',
      textMuted: '#999999',
      primary: '#1C5087',
      primaryText: '#ffffff',
      accent: '#C00',
      border: '#dddddd',
      radius: '0px',
      fontFamily: 'arial,"SimSun","Microsoft YaHei",sans-serif',
      cardShadow: 'none',
      headerStyle: 'trxsw',
      headingDeco: 'bar',
      buttonStyle: 'solid',
      cardHover: 'none',
      gradientText: false,
    },
  },
  {
    // ⑫ 33言情 www.x33yq.org — 520xs/笔趣阁近亲模板(/tpl/pc/css/common.css+style.css)实测:
    //    body #E9FAFF 14px #555555 · 蓝导航 #88c6e5 圆角10 · 黄分类条 #FFF9D9 边 #FFCC33 ·
    //    块边 2px #C3DFEA/#A6D3E8 · newscontent 底 #F7FBFD h2 底 #88C6E5 · 链接 #6F78A7 hover Red ·
    //    搜索框边 #18c2c8 · 强调 #e12160(播放列表 txt/view-mode current) · 圆角 10px 全站基线。
    //    结构依据: /tmp/r43-snap/ 7 页快照逐节复刻(headds/head/searchbar/lianxiindex/daohang/nav1/
    //    hotcontent/novelslist.GARAN/newscontent/firendlink/footer)。
    id: 'x33yq',
    name: '33言情(克隆)',
    desc: '仿 x33yq.org 33言情·520xs 言情模板·浅蓝纸面+蓝圆角导航+黄分类条+蓝边圆角板块',
    layout: 'x33yq',
    dark: false,
    read: {
      layout: 'classic', measure: 760, lineHeight: 2, fontBase: 18,
      indent: true, justify: true, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
    customCss: [
      // [R43-2] 源站全局基线(common.css body/a + style.css L184 a:hover 实测)
      `.clone-x33yq{font-size:14px;color:#555555;background-color:#E9FAFF}`,
      `.clone-x33yq a{color:#6F78A7;text-decoration:none}`,
      `.clone-x33yq a:hover{color:red;text-decoration:underline}`,
    ].join('\n'),
    preview: ['#E9FAFF', '#88C6E5', '#e12160'],
    vars: {
      bg: '#E9FAFF',
      surface: '#FFFFFF',
      surfaceAlt: '#FEF9EF',
      text: '#555555',
      textMuted: '#B3B3B3',
      primary: '#88C6E5',
      primaryText: '#FFFFFF',
      accent: '#e12160',
      border: '#A6D3E8',
      radius: '0px',
      fontFamily: '"Microsoft YaHei","SimSun",sans-serif',
      cardShadow: 'none',
      headerStyle: 'x33yq',
      headingDeco: 'bar',
      buttonStyle: 'solid',
      cardHover: 'none',
      gradientText: false,
    },
  },
]

/** getTheme — 恒不失败的主题解析: preset 精确匹配 → THEMES[0] 兜底
 *  旧 preset id(biquge/amber-magazine-biquge 等)/旧组合 id/'aurora' 默认值均解析失败 → THEMES[0](aijjxs), 不崩不白屏 */
export function getTheme(id?: string | null): ThemeDef {
  return getThemeById(id) || THEMES[0]
}

/** getThemeById — 仅 9 套克隆主题精确匹配; 全部未命中返回 undefined, 由调用方回退 THEMES[0] */
export function getThemeById(id?: string | null): ThemeDef | undefined {
  if (!id) return undefined
  return THEMES.find((t) => t.id === id)
}
