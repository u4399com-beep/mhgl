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
//
// 主题 ID 格式: `{colorId}-{styleId}-{layoutId}` (e.g. "amber-glasswa-grid")
// 与 themes.ts 中的 9 个手写 preset 共存: getThemeById 先查 preset, 未命中再走合成;
// 旧版主题 ID(如 50400 时代的 "violet-glasswa-grid-cl")不再可解析, 调用方
// (PublicSite/SiteHeader/admin sites)按约定回退默认主题, 不崩不白屏。
//
// R23-a 设计语言 token 层: 8 风格各持鲜明视觉人格(pattern 纹理形态/headingDeco 标题
// 装饰/buttonStyle 按钮形态/cardHover 卡片 hover/gradientText 渐变文字), 8 配色各自
// 手调富渐变 heroBg(多层 radial/linear 叠加, 禁用千篇一律的派生渐变); 全部纯 CSS
// 无图片无新依赖, 由 generateTheme 在合成期写入 vars(patternBg/surfaceGradient 等
// 可选 token 契约见 themes.ts ThemeDef.vars 字段注释)。
// ============================================================
import type { ThemeDef, ThemeReadConfig, ReadVars, HeadingDecoKind, ButtonStyleKind, CardHoverKind } from './themes'

// ---------- 公共类型 ----------
export type HeaderStyleKind = 'solid' | 'gradient' | 'transparent' | 'split' | 'centered' | 'pili'
export type ShadowKind = 'none' | 'sm' | 'md' | 'lg' | 'glow' | 'depth'
export type TextureKind = 'none' | 'paper' | 'vignette'
export type ChapterDecoKind = 'rule' | 'ornament' | 'none'
// [R23-a-12] 全站纹理图案形态(none=不发 patternBg token)
export type PatternKind = 'dots' | 'grid' | 'stripes' | 'diagonal' | 'none'
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
  // [R23-a-13] hero 富背景(可选): generateTheme 优先取用, 缺省回退 `linear-gradient(120deg, primary, accent)`
  heroBg?: string
  // [R23-a-13] hero 主文字色(可选): 缺省回退 primaryText; 深底配色(如 noir 的 primaryText 是金底按钮字色)在此显式手调保证可读
  heroText?: string
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
  // [R23-a-14] 设计语言人格字段(R23-a): 每风格显式赋值, 8 风格人格互不重复
  /** 全站纹理图案形态(dots=细点阵/grid=网格/stripes=斜条纹/diagonal=斜纹织锦; none=不发 patternBg token) */
  pattern: PatternKind
  /** 区块标题装饰形态(枚举定义见 themes.ts HeadingDecoKind) */
  headingDeco: HeadingDecoKind
  /** 主按钮形态(枚举定义见 themes.ts ButtonStyleKind) */
  buttonStyle: ButtonStyleKind
  /** 卡片 hover 形态(枚举定义见 themes.ts CardHoverKind) */
  cardHover: CardHoverKind
  /** hero 标题渐变文字 */
  gradientText: boolean
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

// ============================================================
// [R23-a-15] 设计语言合成 helpers(R23-a): hex→rgba / 纹理 / 卡片表面渐变 / 辉光色
// 全部纯 CSS 无图片无新依赖, 仅在 generateTheme 合成期调用
// ============================================================
/** 6 位 hex → rgba(alpha); 非 hex 形态(rgba/渐变/3 位 hex 等)返回 undefined, 由调用方走中性色兜底 */
function hexToRgba(hex: string, alpha: number): string | undefined {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return undefined
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** 全站纹理 patternBg(完整 background 简写, 自含 size/repeat)
 *  ink = text 色淡化(暗色 0.10 / 亮色 0.06); text 非 hex 时安全回退中性墨色
 *  仅作低透明装饰层, 消费端以 absolute 层渲染; pattern none → undefined(不发 token) */
function patternOf(pattern: PatternKind, scheme: ColorScheme): string | undefined {
  if (pattern === 'none') return undefined
  const alpha = scheme.dark ? 0.1 : 0.06
  const ink = hexToRgba(scheme.text, alpha) ?? (scheme.dark ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`)
  switch (pattern) {
    case 'dots': return `radial-gradient(circle, ${ink} 1.5px, transparent 1.5px) 0 0 / 22px 22px repeat`
    case 'grid': return `linear-gradient(${ink} 1px, transparent 1px) 0 0 / 34px 34px repeat, linear-gradient(90deg, ${ink} 1px, transparent 1px) 0 0 / 34px 34px repeat`
    case 'stripes': return `repeating-linear-gradient(-45deg, ${ink} 0 1px, transparent 1px 14px)`
    case 'diagonal': return `repeating-linear-gradient(45deg, ${ink} 0 2px, transparent 2px 18px)`
  }
}

/** 卡片表面渐变(surfaceGradient): glasswa=半透明白磨砂(暗/亮分档), modern=双色 surface 渐变;
 *  其余风格按契约可省略(undefined → 消费端走 surface fallback) */
function surfaceGradientOf(styleId: string, scheme: ColorScheme): string | undefined {
  if (styleId === 'glasswa') {
    // 暗色=经典磨砂玻璃; 亮色=更高不透明白保证卡片表面可读
    return scheme.dark
      ? 'linear-gradient(150deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 100%)'
      : 'linear-gradient(150deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.55) 100%)'
  }
  if (styleId === 'modern') {
    // 双色调色块: surface → surfaceAlt 两停渐变(rgba 形态 stop 亦为合法 CSS)
    return `linear-gradient(160deg, ${scheme.surface} 0%, ${scheme.surfaceAlt} 100%)`
  }
  return undefined
}

/** 辉光色(glowColor): neon 人格用 accent(青/金点缀更跳), 其余用 primary */
function glowColorOf(styleId: string, scheme: ColorScheme): string {
  return styleId === 'neon' ? scheme.accent : scheme.primary
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
    // [R23-a-16] 赭橙→深赭 ramp + 右上奶油色 radial 高光(白字 hero 全程可读)
    heroBg: 'radial-gradient(circle at 82% 14%, rgba(255,236,200,0.5) 0%, rgba(255,236,200,0) 54%), linear-gradient(135deg, #c96f2e 0%, #b0521c 48%, #8a370e 100%)',
    heroText: '#ffffff',
  },
  {
    id: 'violet', name: '紫罗兰', dark: false,
    bg: '#faf7ff', surface: '#ffffff', surfaceAlt: '#f1e8ff',
    text: '#2e1a47', textMuted: '#7c6da3',
    primary: '#6d28d9', primaryText: '#ffffff', accent: '#0e7490',
    border: '#e2d5ff', preview: ['#faf7ff', '#6d28d9', '#0e7490'],
    // [R23-a-16] 薰衣草→深紫 ramp + 淡紫/青两颗漂浮光斑(radial 光球)
    heroBg: 'radial-gradient(circle at 18% 24%, rgba(196,160,255,0.5) 0%, rgba(196,160,255,0) 42%), radial-gradient(circle at 80% 72%, rgba(34,211,238,0.28) 0%, rgba(34,211,238,0) 46%), linear-gradient(135deg, #7c3aed 0%, #5b21b6 52%, #3b0d6e 100%)',
    heroText: '#ffffff',
  },
  {
    id: 'emerald', name: '翡翠绿', dark: false,
    bg: '#f2faf3', surface: '#ffffff', surfaceAlt: '#e3f3e6',
    text: '#0c2b16', textMuted: '#5f8b6d',
    primary: '#047857', primaryText: '#ffffff', accent: '#b45309',
    border: '#cfe8d4', preview: ['#f2faf3', '#047857', '#b45309'],
    // [R23-a-16] 薄荷→深绿 ramp + 底部翡翠径向光晕
    heroBg: 'radial-gradient(circle at 50% 118%, rgba(52,211,153,0.4) 0%, rgba(52,211,153,0) 56%), linear-gradient(160deg, #2f9e73 0%, #047857 48%, #05452f 100%)',
    heroText: '#ffffff',
  },
  {
    // 清爽蓝绿系(8 分之 1 的蓝色取向选项, 非默认)
    id: 'cyan', name: '青碧蓝', dark: false,
    bg: '#f0f9fa', surface: '#ffffff', surfaceAlt: '#e0f1f5',
    text: '#083741', textMuted: '#4f8894',
    primary: '#0369a1', primaryText: '#ffffff', accent: '#0d9488',
    border: '#cfe6ef', preview: ['#f0f9fa', '#0369a1', '#0d9488'],
    // [R23-a-16] 天青→深青 ramp + 斜向高光带(115° 半透明白带)
    heroBg: 'linear-gradient(115deg, rgba(255,255,255,0) 36%, rgba(186,240,255,0.22) 50%, rgba(255,255,255,0) 64%), linear-gradient(135deg, #0e7db8 0%, #0369a1 46%, #07506f 100%)',
    heroText: '#ffffff',
  },
  {
    id: 'sakura', name: '樱粉', dark: false,
    bg: '#fdf3f7', surface: '#ffffff', surfaceAlt: '#fae3ec',
    text: '#420f2a', textMuted: '#a06a84',
    primary: '#be185d', primaryText: '#ffffff', accent: '#b45309',
    border: '#f4d7e4', preview: ['#fdf3f7', '#be185d', '#b45309'],
    // [R23-a-16] 腮红→玫红 ramp + 双柔焦花瓣感光斑
    heroBg: 'radial-gradient(circle at 22% 28%, rgba(255,214,228,0.55) 0%, rgba(255,214,228,0) 44%), radial-gradient(circle at 76% 70%, rgba(255,175,205,0.35) 0%, rgba(255,175,205,0) 48%), linear-gradient(135deg, #d94f8c 0%, #be185d 48%, #8f1046 100%)',
    heroText: '#ffffff',
  },
  {
    // 高级灰 + 金点缀
    id: 'graphite', name: '墨雅灰金', dark: false,
    bg: '#f5f5f3', surface: '#ffffff', surfaceAlt: '#ecebe6',
    text: '#26261f', textMuted: '#85857a',
    primary: '#4f4b40', primaryText: '#ffffff', accent: '#a16207',
    border: '#e2e1da', preview: ['#f5f5f3', '#4f4b40', '#a16207'],
    // [R23-a-16] 暖灰→炭灰 ramp + 金色细光晕+冷白微光双层 radial
    heroBg: 'radial-gradient(circle at 80% 18%, rgba(196,154,74,0.3) 0%, rgba(196,154,74,0) 46%), radial-gradient(circle at 14% 86%, rgba(226,225,218,0.12) 0%, rgba(226,225,218,0) 42%), linear-gradient(135deg, #6b675c 0%, #4f4b40 46%, #2e2c25 100%)',
    heroText: '#ffffff',
  },
  {
    id: 'noir', name: '暗夜黑金', dark: true,
    bg: '#131110', surface: '#211d19', surfaceAlt: '#2b2620',
    text: '#f3ead8', textMuted: '#a89c86',
    primary: '#d9a441', primaryText: '#221703', accent: '#e7c877',
    border: '#4a4032', preview: ['#131110', '#d9a441', '#e7c877'],
    // [R23-a-16] 深黑底 + 金色 radial 辉光 + 底部金微光
    heroBg: 'radial-gradient(circle at 78% 20%, rgba(217,164,65,0.32) 0%, rgba(217,164,65,0) 50%), radial-gradient(circle at 50% 120%, rgba(231,200,119,0.18) 0%, rgba(231,200,119,0) 55%), linear-gradient(180deg, #1a1512 0%, #0c0a08 100%)',
    // primaryText #221703 是金底按钮字色, 在黑底 hero 上不可读 → 显式手调为亮米色
    heroText: '#f3ead8',
  },
  {
    // 深底紫青渐变感(暗)
    id: 'aurora', name: '极光暗紫', dark: true,
    bg: 'linear-gradient(160deg, #120b24 0%, #1a1033 50%, #0d142e 100%)',
    surface: 'rgba(255,255,255,0.06)', surfaceAlt: 'rgba(255,255,255,0.1)',
    text: '#ede9fe', textMuted: '#a78bda',
    primary: '#b06cf0', primaryText: '#ffffff', accent: '#22d3ee',
    border: 'rgba(176,108,240,0.28)', preview: ['#1a1033', '#b06cf0', '#22d3ee'],
    // [R23-a-16] 更浓紫青双球 mesh(辉光球叠加在深紫 ramp 上)
    heroBg: 'radial-gradient(circle at 22% 26%, rgba(176,108,240,0.55) 0%, rgba(176,108,240,0) 48%), radial-gradient(circle at 76% 72%, rgba(34,211,238,0.4) 0%, rgba(34,211,238,0) 48%), linear-gradient(150deg, #241242 0%, #171034 55%, #0b1030 100%)',
    heroText: '#ffffff',
  },
]

// ============================================================
// 2. 8 风格 — R18-b 精选(差异化: 头部形态/阴影/圆角/字体/纹理/章节装饰)
//    [R23-a-17] R23-a 设计语言人格重定义: 每风格独立纹理/标题装饰/按钮形态/
//    卡片 hover/渐变文字组合, desc 同步为设计语言描述
// ============================================================
export const STYLES: StyleDef[] = [
  {
    // [R23-a-17] 瑞士编辑风: 细点阵纹理 + 竖条标题 + 描边按钮 + 卡片 lift
    id: 'minimal', name: '极简白', desc: '瑞士编辑风·细点阵纹理·竖条标题·描边按钮·克制留白',
    headerStyle: 'solid', cardShadow: 'none', radius: 4, fontFamily: 'sans', texture: 'none', chapterDeco: 'rule',
    pattern: 'dots', headingDeco: 'bar', buttonStyle: 'outline', cardHover: 'lift', gradientText: false,
  },
  {
    // [R23-a-17] 真·玻璃拟态: 无纹理 + mesh 渐变 hero + 渐变下划线标题 + 渐变按钮 + 半透白磨砂卡片
    id: 'glasswa', name: '玻璃拟态', desc: '真·玻璃拟态·mesh 渐变横幅·渐变下划线标题·磨砂半透卡片·辉光悬浮',
    headerStyle: 'gradient', cardShadow: 'glow', radius: 16, fontFamily: 'sans', texture: 'none', chapterDeco: 'none',
    pattern: 'none', headingDeco: 'swash', buttonStyle: 'gradient', cardHover: 'glow', gradientText: true,
  },
  {
    // [R23-a-17] 宣纸书卷: 纸纤维点纹 + 菱形花饰标题 + 实底按钮 + 水墨晕染 hero
    id: 'paper', name: '纸面书卷', desc: '宣纸书卷·纸纤维点纹·菱形花饰标题·水墨晕染横幅·衬线书卷气',
    headerStyle: 'solid', cardShadow: 'sm', radius: 4, fontFamily: 'serif', texture: 'paper', chapterDeco: 'ornament',
    pattern: 'dots', headingDeco: 'ornament', buttonStyle: 'solid', cardHover: 'lift', gradientText: false,
  },
  {
    // [R23-a-17] 双色调色块: 斜条纹纹理 + 缎带标题 + 渐变按钮 + 双色渐变卡片表面
    id: 'modern', name: '现代卡片', desc: '双色调色块·斜条纹纹理·缎带标题·渐变按钮·双色渐变卡片',
    headerStyle: 'solid', cardShadow: 'md', radius: 12, fontFamily: 'sans', texture: 'none', chapterDeco: 'rule',
    pattern: 'stripes', headingDeco: 'ribbon', buttonStyle: 'gradient', cardHover: 'lift', gradientText: false,
  },
  {
    // [R23-a-17] 编辑部大报: 无纹理 + 书名号括角标题 + 实底按钮 + grow 放大卡片 + 报头式 hero
    id: 'magazine', name: '杂志风', desc: '编辑部大报·书名号括角标题·报头式米白横幅·grow 放大卡片·衬线分栏',
    headerStyle: 'split', cardShadow: 'md', radius: 8, fontFamily: 'serif', texture: 'none', chapterDeco: 'ornament',
    pattern: 'none', headingDeco: 'bracket', buttonStyle: 'solid', cardHover: 'grow', gradientText: false,
  },
  {
    // [R23-a-17] 赛博网格: 网格纹理 + 渐变文字/辉光下划线双标题 + 霓虹按钮 + accent 辉光卡片
    id: 'neon', name: '霓虹暗夜', desc: '赛博网格·网格纹理·渐变文字标题·霓虹按钮·accent 辉光卡片',
    headerStyle: 'gradient', cardShadow: 'glow', radius: 12, fontFamily: 'sans', texture: 'vignette', chapterDeco: 'none',
    pattern: 'grid', headingDeco: 'dual', buttonStyle: 'neon', cardHover: 'glow', gradientText: true,
  },
  {
    // [R23-a-17] 传统典籍: 极淡斜纹织锦 + 实底徽章标题 + 静态稳重卡片(无 hover 动效)
    id: 'classic', name: '书卷典雅', desc: '传统典籍·极淡斜纹织锦·徽章标题·静态稳重卡片·居中报头',
    headerStyle: 'centered', cardShadow: 'sm', radius: 4, fontFamily: 'serif', texture: 'paper', chapterDeco: 'rule',
    pattern: 'diagonal', headingDeco: 'badge', buttonStyle: 'solid', cardHover: 'none', gradientText: false,
  },
  {
    // [R23-a-17] 复古书城: 条纹纹理 + 缎带标题 + 胶囊大按钮
    id: 'pili', name: '霹雳仿站', desc: '复古书城·条纹纹理·缎带标题·胶囊大按钮·奶油报头分类条',
    headerStyle: 'pili', cardShadow: 'sm', radius: 3, fontFamily: 'sans', texture: 'none', chapterDeco: 'rule',
    pattern: 'stripes', headingDeco: 'ribbon', buttonStyle: 'pill', cardHover: 'lift', gradientText: false,
  },
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
      // ---------------- [R23-a-18] 设计语言 token 层合成(style × scheme) ----------------
      // hero 富背景: 配色手调 heroBg 优先, 缺省回退双色渐变(向后兼容未来新增配色)
      heroBg: c.heroBg ?? `linear-gradient(120deg, ${c.primary}, ${c.accent})`,
      // hero 主文字色: 配色手调 heroText 优先, 缺省 primaryText
      heroText: c.heroText ?? c.primaryText,
      // hero 次文字色: heroText 80% 不透明度(hex 可算时), 非 hex 原样透传由消费端兜底
      heroMuted: hexToRgba(c.heroText ?? c.primaryText, 0.8) ?? c.heroText ?? c.primaryText,
      // 卡片表面渐变: glasswa 半透明白磨砂 / modern 双色, 其余 undefined 走 surface fallback
      surfaceGradient: surfaceGradientOf(s.id, c),
      // 全站纹理层: pattern none → undefined(不发 token), 其余按形态合成低透明装饰层
      patternBg: patternOf(s.pattern, c),
      headingDeco: s.headingDeco,
      buttonStyle: s.buttonStyle,
      cardHover: s.cardHover,
      // 辉光色: neon 人格用 accent, 其余用 primary
      glowColor: glowColorOf(s.id, c),
      gradientText: s.gradientText,
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

// [R19-a-3] getThemesPage() 已删除: 全库零引用死导出(分页逻辑内联在 admin/themes route
// 的 sliceCombos 惰性切片中), R19-c 横切审移交本线清理。

// ============================================================
// 6. [R10-a-1] 全量列表惰性单例缓存 + q 搜索(admin/themes API 搜索分页用)
// ============================================================
// 512 组合时代: 全量仅 ~512 项(≈100KB), 单例缓存仅省去重复笛卡尔积构建, 无内存压力。
// (50400 组合时代的 10MB 取舍说明已随矩阵精炼失效, 保留缓存以稳定 API 复用路径。)
let THEME_LIST_CACHE: ThemeListItem[] | null = null

/** getThemeList() 的单例缓存版 — 仅限需要全量扫描的场景(admin 搜索 API)
 *  [R19-a-3] 精简: getThemesPage 分页函数已随 R18-b 矩阵精炼失去全部调用方
 *  (分页逻辑内联在 admin/themes route 的惰性切片 sliceCombos 中), 删除死导出 */
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
