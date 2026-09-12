// ============================================================
// 组合式主题矩阵 — 8 配色 × 8 风格 × 8 布局 = 512 组合 (R18-b 重构)
//
// 前身: 50 配色 × 42 风格 × 24 布局 = 50400 组合(R10-a) —— 组合爆炸导致
// 管理端浏览/搜索信噪比低, 大量配色/风格仅微调差异。R18-b 按用户指令精炼为
// 整齐 8×8×8 = 512 组合: 每个维度都是高质量、差异化明确的精选项。
//
// 不预生成全部 512 个 ThemeDef 对象, 而是按需合成:
//   getThemeById(themeId)      — 单一组合合成完整 ThemeDef
//   getThemeList()             — 全部 512 组合的轻量描述符(id/name/desc/preview)
//   getThemesPage(page, size)  — 分页
//
// 主题 ID 格式: `{colorId}-{styleId}-{layoutId}` (e.g. "amber-glasswa-grid")
// 与 themes.ts 中的 8 个手写 preset 共存: getThemeById 先查 preset, 未命中再走合成;
// 旧版主题 ID(如 50400 时代的 "violet-glasswa-grid-cl")不再可解析, 调用方
// (PublicSite/SiteHeader/admin sites)按约定回退默认主题, 不崩不白屏。
// ============================================================
import type { ThemeDef, ThemeReadConfig, ReadVars } from './themes'

// ---------- 公共类型 ----------
export type HeaderStyleKind = 'solid' | 'gradient' | 'transparent' | 'split' | 'centered' | 'pili'
export type ShadowKind = 'none' | 'sm' | 'md' | 'lg' | 'glow' | 'depth'
export type TextureKind = 'none' | 'paper' | 'vignette'
export type ChapterDecoKind = 'rule' | 'ornament' | 'none'
export type HomeLayoutKind = ThemeDef['layout']
export type ReadLayoutKind = ReadVars['layout']

export interface ColorScheme {
  id: string
  name: string
  dark: boolean
  bg: string
  surface: string
  surfaceAlt: string
  text: string
  textMuted: string
  primary: string
  primaryText: string
  accent: string
  border: string
  /** 预览三色: [bg, primary, accent] */
  preview: [string, string, string]
}

export interface StyleDef {
  id: string
  name: string
  desc: string
  headerStyle: HeaderStyleKind
  cardShadow: ShadowKind
  radius: number
  fontFamily: 'sans' | 'serif' | 'mono' | 'handwritten'
  texture: TextureKind
  chapterDeco: ChapterDecoKind
}

export interface LayoutDef {
  id: string
  /** 布局中文标签(如「网格」「笔趣阁经典」) */
  name: string
  /** 布局形态描述 */
  desc: string
  /** 适用场景说明(管理端选择参考) */
  scene: string
  homeLayout: HomeLayoutKind
  readLayout: ReadLayoutKind
  readVars: ThemeReadConfig
}

// 字体族映射(避免每个 Style 重复长串)
export const FONT_FAMILIES: Record<StyleDef['fontFamily'], string> = {
  sans: '"HarmonyOS Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
  serif: 'Georgia,"Noto Serif SC","Songti SC",serif',
  mono: '"JetBrains Mono","Courier New",monospace',
  handwritten: '"Ma Shan Zheng","Caveat","Noto Serif SC",cursive',
}

// 卡片阴影映射(由配色 primary 派生, 透传给 generateTheme 在合成期生成实际值)
function shadowOf(kind: ShadowKind, primary: string, dark: boolean): string {
  switch (kind) {
    case 'none': return 'none'
    case 'sm': return dark ? `0 2px 6px rgba(0,0,0,0.4)` : `0 2px 6px rgba(0,0,0,0.08)`
    case 'md': return dark ? `0 6px 18px rgba(0,0,0,0.5)` : `0 6px 18px rgba(0,0,0,0.12)`
    case 'lg': return dark ? `0 12px 36px rgba(0,0,0,0.6)` : `0 12px 36px rgba(0,0,0,0.16)`
    case 'glow': {
      // primary 色辉光
      const m = /^#([0-9a-f]{6})$/i.exec(primary.trim())
      if (m) {
        const n = parseInt(m[1], 16)
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
        return `0 8px 32px rgba(${r},${g},${b},0.35)`
      }
      return `0 8px 32px ${primary}`
    }
    case 'depth': return dark ? `0 20px 60px rgba(0,0,0,0.7), 0 8px 16px rgba(0,0,0,0.5)` : `0 20px 60px rgba(0,0,0,0.18), 0 8px 16px rgba(0,0,0,0.08)`
  }
}

// ============================================================
// 1. 8 配色方案 (6 亮 + 2 暗) — R18-b 精选
//    对比度基准(WCAG): text/bg ≥ 7:1, primary/surface ≥ 4.5:1 (已脚本实测)
// ============================================================
export const COLOR_SCHEMES: ColorScheme[] = [
  {
    // 笔趣阁经典暖橙: 米白底 + 深橙红主色 + 金棕点缀
    id: 'amber', name: '琥珀暖橙', dark: false,
    bg: '#f7f2e7', surface: '#fffcf5', surfaceAlt: '#f1e8d7',
    text: '#38261a', textMuted: '#8c7358',
    primary: '#b3401f', primaryText: '#ffffff', accent: '#a16207',
    border: '#e6d9c2', preview: ['#f7f2e7', '#b3401f', '#a16207'],
  },
  {
    id: 'violet', name: '紫罗兰', dark: false,
    bg: '#faf7ff', surface: '#ffffff', surfaceAlt: '#f1e8ff',
    text: '#2e1a47', textMuted: '#7c6da3',
    primary: '#6d28d9', primaryText: '#ffffff', accent: '#0e7490',
    border: '#e2d5ff', preview: ['#faf7ff', '#6d28d9', '#0e7490'],
  },
  {
    id: 'emerald', name: '翡翠绿', dark: false,
    bg: '#f2faf3', surface: '#ffffff', surfaceAlt: '#e3f3e6',
    text: '#0c2b16', textMuted: '#5f8b6d',
    primary: '#047857', primaryText: '#ffffff', accent: '#b45309',
    border: '#cfe8d4', preview: ['#f2faf3', '#047857', '#b45309'],
  },
  {
    // 清爽蓝绿系(8 分之 1 的蓝色取向选项, 非默认)
    id: 'cyan', name: '青碧蓝', dark: false,
    bg: '#f0f9fa', surface: '#ffffff', surfaceAlt: '#e0f1f5',
    text: '#083741', textMuted: '#4f8894',
    primary: '#0369a1', primaryText: '#ffffff', accent: '#0d9488',
    border: '#cfe6ef', preview: ['#f0f9fa', '#0369a1', '#0d9488'],
  },
  {
    id: 'sakura', name: '樱粉', dark: false,
    bg: '#fdf3f7', surface: '#ffffff', surfaceAlt: '#fae3ec',
    text: '#420f2a', textMuted: '#a06a84',
    primary: '#be185d', primaryText: '#ffffff', accent: '#b45309',
    border: '#f4d7e4', preview: ['#fdf3f7', '#be185d', '#b45309'],
  },
  {
    // 高级灰 + 金点缀
    id: 'graphite', name: '墨雅灰金', dark: false,
    bg: '#f5f5f3', surface: '#ffffff', surfaceAlt: '#ecebe6',
    text: '#26261f', textMuted: '#85857a',
    primary: '#4f4b40', primaryText: '#ffffff', accent: '#a16207',
    border: '#e2e1da', preview: ['#f5f5f3', '#4f4b40', '#a16207'],
  },
  {
    id: 'noir', name: '暗夜黑金', dark: true,
    bg: '#131110', surface: '#211d19', surfaceAlt: '#2b2620',
    text: '#f3ead8', textMuted: '#a89c86',
    primary: '#d9a441', primaryText: '#221703', accent: '#e7c877',
    border: '#4a4032', preview: ['#131110', '#d9a441', '#e7c877'],
  },
  {
    // 深底紫青渐变感(暗)
    id: 'aurora', name: '极光暗紫', dark: true,
    bg: 'linear-gradient(160deg, #120b24 0%, #1a1033 50%, #0d142e 100%)',
    surface: 'rgba(255,255,255,0.06)', surfaceAlt: 'rgba(255,255,255,0.1)',
    text: '#ede9fe', textMuted: '#a78bda',
    primary: '#b06cf0', primaryText: '#ffffff', accent: '#22d3ee',
    border: 'rgba(176,108,240,0.28)', preview: ['#1a1033', '#b06cf0', '#22d3ee'],
  },
]

// ============================================================
// 2. 8 风格 — R18-b 精选(差异化: 头部形态/阴影/圆角/字体/纹理/章节装饰)
// ============================================================
export const STYLES: StyleDef[] = [
  { id: 'minimal', name: '极简白', desc: '白底极简·细线分隔·无阴影·sans 字体', headerStyle: 'solid', cardShadow: 'none', radius: 4, fontFamily: 'sans', texture: 'none', chapterDeco: 'rule' },
  { id: 'glasswa', name: '玻璃拟态', desc: '半透磨砂卡片·渐变头·辉光阴影·大圆角', headerStyle: 'gradient', cardShadow: 'glow', radius: 16, fontFamily: 'sans', texture: 'none', chapterDeco: 'none' },
  { id: 'paper', name: '纸面书卷', desc: '宣纸纹理·衬线字体·菱形花饰·小圆角', headerStyle: 'solid', cardShadow: 'sm', radius: 4, fontFamily: 'serif', texture: 'paper', chapterDeco: 'ornament' },
  { id: 'modern', name: '现代卡片', desc: '中圆角卡片·中等阴影·横线分隔·sans 字体', headerStyle: 'solid', cardShadow: 'md', radius: 12, fontFamily: 'sans', texture: 'none', chapterDeco: 'rule' },
  { id: 'magazine', name: '杂志风', desc: '分栏标题·中阴影·衬线·菱形花饰', headerStyle: 'split', cardShadow: 'md', radius: 8, fontFamily: 'serif', texture: 'none', chapterDeco: 'ornament' },
  { id: 'neon', name: '霓虹暗夜', desc: '渐变头·辉光晕染·暗角氛围·无装饰', headerStyle: 'gradient', cardShadow: 'glow', radius: 12, fontFamily: 'sans', texture: 'vignette', chapterDeco: 'none' },
  { id: 'classic', name: '书卷典雅', desc: '居中报头·纸纹·衬线·横线章节头', headerStyle: 'centered', cardShadow: 'sm', radius: 4, fontFamily: 'serif', texture: 'paper', chapterDeco: 'rule' },
  { id: 'pili', name: '霹雳仿站', desc: '仿霹雳书屋·奶油报头分类条·直角小圆角', headerStyle: 'pili', cardShadow: 'sm', radius: 3, fontFamily: 'sans', texture: 'none', chapterDeco: 'rule' },
]

// ============================================================
// 3. 8 布局 — R18-b 重构: 8 首页布局 × 1 阅读版式(精选搭配)
//    7 个经典首页布局(grid/list/shelf/mag/min/theater/pili) + 新增 biquge 笔趣阁经典
// ============================================================
export const LAYOUTS: LayoutDef[] = [
  {
    id: 'grid', name: '网格', homeLayout: 'grid', readLayout: 'classic',
    desc: '封面卡片网格墙, 信息密度均匀',
    scene: '书库量大、封面质量整齐的书站',
    readVars: { layout: 'classic', measure: 680, lineHeight: 2, fontBase: 17, indent: true, justify: false, toolbar: 'inline', texture: 'none', chapterDeco: 'rule' },
  },
  {
    id: 'list', name: '列表', homeLayout: 'list', readLayout: 'immersive',
    desc: '封面+简介横向列表, 浏览效率高',
    scene: '以简介/字数信息驱动选书的读者',
    readVars: { layout: 'immersive', measure: 740, lineHeight: 2.1, fontBase: 18, indent: false, justify: false, toolbar: 'floating', texture: 'none', chapterDeco: 'none' },
  },
  {
    id: 'shelf', name: '书架', homeLayout: 'shelf', readLayout: 'paginated',
    desc: '横向书架陈列, 像图书馆书架一样翻阅',
    scene: '精品推荐位少而精的门户站',
    readVars: { layout: 'paginated', measure: 480, lineHeight: 1.85, fontBase: 17, indent: false, justify: false, toolbar: 'bottom', texture: 'none', chapterDeco: 'rule' },
  },
  {
    id: 'mag', name: '杂志', homeLayout: 'magazine', readLayout: 'pili',
    desc: '杂志双栏编辑排版, 主次分明',
    scene: '有编辑推荐位/专题运营的站点',
    readVars: { layout: 'pili', measure: 680, lineHeight: 1.9, fontBase: 18, indent: true, justify: false, toolbar: 'bottom', texture: 'none', chapterDeco: 'rule' },
  },
  {
    id: 'min', name: '极简', homeLayout: 'minimal', readLayout: 'classic',
    desc: '细线分隔的极简纵列, 零干扰',
    scene: '重阅读轻装饰的轻量书站',
    readVars: { layout: 'classic', measure: 640, lineHeight: 1.95, fontBase: 17, indent: true, justify: false, toolbar: 'inline', texture: 'none', chapterDeco: 'rule' },
  },
  {
    id: 'theater', name: '剧院', homeLayout: 'theater', readLayout: 'immersive',
    desc: '全宽海报式横幅, 影视化呈现',
    scene: '封面视觉冲击力强的漫改/影视向书站',
    readVars: { layout: 'immersive', measure: 780, lineHeight: 2, fontBase: 18, indent: false, justify: false, toolbar: 'bottom', texture: 'none', chapterDeco: 'none' },
  },
  {
    id: 'pili', name: '霹雳', homeLayout: 'pili', readLayout: 'pili',
    desc: '仿霹雳书屋: 左主栏封面网格+右橙头排行榜',
    scene: '白卡复古书城风( pilishuwu 同款结构)',
    readVars: { layout: 'pili', measure: 680, lineHeight: 1.9, fontBase: 18, indent: true, justify: false, toolbar: 'bottom', texture: 'none', chapterDeco: 'rule' },
  },
  {
    id: 'biquge', name: '笔趣阁经典', homeLayout: 'biquge', readLayout: 'classic',
    desc: '经典笔趣阁板块布局: 顶部导航条+三栏主体+分类分组更新表+友链区',
    scene: '经典笔趣阁系小说站(分类导航/点击排行/最新更新分列表)',
    readVars: { layout: 'classic', measure: 760, lineHeight: 2, fontBase: 18, indent: true, justify: true, toolbar: 'inline', texture: 'none', chapterDeco: 'rule' },
  },
]

// 索引: 用 ID 快速查找
const COLOR_BY_ID = new Map(COLOR_SCHEMES.map((c) => [c.id, c]))
const STYLE_BY_ID = new Map(STYLES.map((s) => [s.id, s]))
const LAYOUT_BY_ID = new Map(LAYOUTS.map((l) => [l.id, l]))

export const COLOR_COUNT = COLOR_SCHEMES.length
export const STYLE_COUNT = STYLES.length
export const LAYOUT_COUNT = LAYOUTS.length
export const TOTAL_COMBOS = COLOR_COUNT * STYLE_COUNT * LAYOUT_COUNT

// ============================================================
// 4. 合成函数: colorId + styleId + layoutId → ThemeDef
// ============================================================
export function generateTheme(colorSchemeId: string, styleId: string, layoutId: string): ThemeDef | undefined {
  const c = COLOR_BY_ID.get(colorSchemeId)
  const s = STYLE_BY_ID.get(styleId)
  const l = LAYOUT_BY_ID.get(layoutId)
  if (!c || !s || !l) return undefined
  const id = `${c.id}-${s.id}-${l.id}`
  // 名称: 配色名 + 风格名 + 布局名
  const name = `${c.name}·${s.name}·${l.name}`
  // 描述: 风格 desc + 配色 dark/light + 布局名
  const desc = `${s.desc} · ${c.dark ? '暗色' : '亮色'} · ${l.name}`
  // read: 布局自带 readVars, 但 texture/chapterDeco 由 style 覆盖(保留视觉一致性)
  const read: ThemeReadConfig = {
    ...l.readVars,
    texture: s.texture,
    chapterDeco: s.chapterDeco,
  }
  return {
    id,
    name,
    desc,
    layout: l.homeLayout,
    dark: c.dark,
    read,
    vars: {
      bg: c.bg,
      surface: c.surface,
      surfaceAlt: c.surfaceAlt,
      text: c.text,
      textMuted: c.textMuted,
      primary: c.primary,
      primaryText: c.primaryText,
      accent: c.accent,
      border: c.border,
      radius: `${s.radius}px`,
      fontFamily: FONT_FAMILIES[s.fontFamily],
      cardShadow: shadowOf(s.cardShadow, c.primary, c.dark),
      headerStyle: s.headerStyle,
      titleFont: s.fontFamily === 'serif' ? '"Noto Serif SC","Songti SC",serif' : undefined,
    },
    preview: c.preview,
  }
}

/** 解析主题 ID → (colorId, styleId, layoutId)
 *  ID 形如 `amber-glasswa-grid` —— 三维度 id 均不含 `-`(R18-b 起约定),
 *  但仍按反向拆分消歧: 末段为 layoutId(8 选 1), 倒数第二段为 styleId(8 选 1), 其余为 colorId。
 *  旧版 id(如 `violet-glasswa-grid-cl`)无法命中任何预定义组合 → 返回 undefined, 由调用方兜底。 */
export function parseThemeId(themeId: string): { colorId: string; styleId: string; layoutId: string } | undefined {
  if (!themeId || typeof themeId !== 'string') return undefined
  // 优先精确匹配预定义 layout/style/color id 组合
  // 先尝试匹配 layout (8 个, ID 唯一)
  for (const l of LAYOUTS) {
    if (themeId.endsWith(`-${l.id}`)) {
      const rest = themeId.slice(0, themeId.length - l.id.length - 1) // 去掉 `-${l.id}`
      // 再匹配 style (8 个, ID 唯一)
      for (const s of STYLES) {
        if (rest.endsWith(`-${s.id}`)) {
          const colorId = rest.slice(0, rest.length - s.id.length - 1)
          if (COLOR_BY_ID.has(colorId)) {
            return { colorId, styleId: s.id, layoutId: l.id }
          }
        }
      }
    }
  }
  return undefined
}

/** 单一解析: 主题 ID → 完整 ThemeDef */
export function getThemeById(themeId: string): ThemeDef | undefined {
  if (!themeId) return undefined
  const parsed = parseThemeId(themeId)
  if (!parsed) return undefined
  return generateTheme(parsed.colorId, parsed.styleId, parsed.layoutId)
}

// ============================================================
// 5. 轻量描述符 (admin 列表 API 用)
// ============================================================
export interface ThemeListItem {
  id: string
  name: string
  desc: string
  layout: HomeLayoutKind
  dark: boolean
  read?: { layout: ReadLayoutKind }
  preview: [string, string, string]
}

/** 全部 512 组合的轻量描述符列表(确定性静态派生数据, 体量小可直接全量构建) */
export function getThemeList(): ThemeListItem[] {
  const out: ThemeListItem[] = []
  for (const c of COLOR_SCHEMES) {
    for (const s of STYLES) {
      for (const l of LAYOUTS) {
        out.push({
          id: `${c.id}-${s.id}-${l.id}`,
          name: `${c.name}·${s.name}·${l.name}`,
          desc: `${s.desc} · ${c.dark ? '暗色' : '亮色'} · ${l.name}`,
          layout: l.homeLayout,
          dark: c.dark,
          read: { layout: l.readLayout },
          preview: c.preview,
        })
      }
    }
  }
  return out
}

/** 分页返回主题列表(1-based, 1..N) */
export function getThemesPage(page: number, size: number): {
  page: number
  size: number
  total: number
  totalPages: number
  items: ThemeListItem[]
} {
  const all = getThemeList()
  const total = all.length
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, size)))
  const p = Math.max(1, Math.min(totalPages, Math.floor(page) || 1))
  const sz = Math.max(1, Math.min(500, Math.floor(size) || 50))
  const start = (p - 1) * sz
  const items = all.slice(start, start + sz)
  return { page: p, size: sz, total, totalPages, items }
}

// ============================================================
// 6. [R10-a-1] 全量列表惰性单例缓存 + q 搜索(admin/themes API 搜索分页用)
// ============================================================
// 512 组合时代: 全量仅 ~512 项(≈100KB), 单例缓存仅省去重复笛卡尔积构建, 无内存压力。
// (50400 组合时代的 10MB 取舍说明已随矩阵精炼失效, 保留缓存以稳定 API 复用路径。)
let THEME_LIST_CACHE: ThemeListItem[] | null = null

/** getThemeList() 的单例缓存版 — 仅限需要全量扫描的场景(admin 搜索 API), 纯分页请继续用 getThemesPage */
export function getThemeListCached(): ThemeListItem[] {
  if (!THEME_LIST_CACHE) THEME_LIST_CACHE = getThemeList()
  return THEME_LIST_CACHE
}

/** [R10-a-2] q 搜索: 按 id/name/desc 不区分大小写子串匹配(空 q 返回全量列表)
 *  命中示例: "琥珀"→名称前缀配色(64 组合) / "amber"→ID 片段 / "沉浸"→desc 中的布局/明暗词 */
export function searchThemeList(q: string): ThemeListItem[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return getThemeListCached()
  return getThemeListCached().filter(
    (t) =>
      t.id.toLowerCase().includes(needle) ||
      t.name.toLowerCase().includes(needle) ||
      t.desc.toLowerCase().includes(needle)
  )
}
