// ============================================================
// 主题模版注册表 — 9 套精选前台主题 (R18-b 精选 8 套, R18-d +aijjxs 第 9 套)
// 样式 / 颜色 / 布局 / 阅读版式 全部差异化, 均适配 TDK / SEO / GEO
//
// 双布局维度:
//   layout     → 首页布局 (grid/list/shelf/magazine/minimal/theater/pili/biquge)
//   read       → 阅读页布局与排版参数 (经典典书版 / 沉浸暗色 / 分页横滑 / 书屋版)
// read 可缺省: readOf() 会按 READ_DEFAULTS 回退, 旧调用点零破坏
//
// R18-b 组合主题矩阵: 8 配色 × 8 风格 × 8 布局 = 512 组合(theme-matrix)。
// theme-matrix 仅依赖本模块的类型(type-only import, 编译期擦除无运行时循环依赖);
// 本模块在 getThemeById 中静态引入组合解析器, preset 命中优先, 未命中回退组合。
//
// R23-a 设计语言 token 层: vars 新增 10 个可选 token(heroBg/heroText/heroMuted/
// surfaceGradient/patternBg/headingDeco/buttonStyle/cardHover/glowColor/gradientText),
// 全部向后兼容(缺省时消费端按字段注释 fallback); 9 个 preset 逐一补齐, 组合主题由
// theme-matrix 的 generateTheme 在合成期产出。装饰形态三枚举(HeadingDeco/ButtonStyle/
// CardHoverKind)在本模块统一定义, 供 preset 与矩阵共用。
//
// 兜底链(旧主题 id 不崩不白屏):
//   getThemeById(id)  = THEMES preset → 512 组合解析 → undefined
//   getTheme(id)      = getThemeById(id) || THEMES[0] (aurora 恒兜底)
//   50400 组合时代的旧组合 id(如 "violet-glasswa-grid-cl")与已下架 preset
//   (scrolls/nocturne)均解析失败 → 上层(PublicSite/SiteHeader)回退 THEMES[0]。
// ============================================================
import { getThemeById as resolveComboTheme } from './theme-matrix'

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
// [R23-a-1] 设计语言装饰形态枚举(与 vars.headingDeco/buttonStyle/cardHover 共用)
// 在此统一定义, theme-matrix 以 type-only import 复用(编译期擦除, 无运行时循环依赖)
// ============================================================
/** 区块标题装饰形态: bar=竖条 / swash=渐变下划线 / ribbon=色块缎带 / bracket=书名号括角 / badge=实底徽章 / ornament=菱形花饰 / dual=渐变文字+辉光下划线 */
export type HeadingDecoKind = 'bar' | 'swash' | 'ribbon' | 'bracket' | 'badge' | 'ornament' | 'dual'
/** 主按钮形态: solid=实底 / gradient=渐变 / outline=描边 / pill=胶囊 / neon=霓虹辉光 */
export type ButtonStyleKind = 'solid' | 'gradient' | 'outline' | 'pill' | 'neon'
/** 卡片 hover 形态: lift=上浮 / glow=辉光 / grow=放大 / none=静态 */
export type CardHoverKind = 'lift' | 'glow' | 'grow' | 'none'

/** 中文标签（后台预览/调试用） */
export const READ_LAYOUT_LABEL: Record<ReadLayoutKind, string> = {
  classic: '典书版',
  immersive: '沉浸暗夜',
  paginated: '分页横滑',
  pili: '书屋版',
}

export interface ThemeDef {
  id: string
  name: string
  desc: string
  /** 首页布局风格 (R18-b: +biquge 笔趣阁经典) */
  layout: 'grid' | 'list' | 'shelf' | 'magazine' | 'minimal' | 'theater' | 'pili' | 'biquge'
  dark: boolean
  /** 阅读页布局与排版（缺省走 readOf 回退值） */
  read?: ThemeReadConfig
  /** CSS 变量集 */
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
    // [R18-d-1] +aijjxs 仿站深酒红导航条(仅精选 preset 使用; 矩阵组合 HeaderStyleKind 仍为 6 种, 8×8×8=512 不变)
    headerStyle: 'solid' | 'gradient' | 'transparent' | 'split' | 'centered' | 'pili' | 'aijjxs'
    titleFont?: string
    // ----------------------------------------------------------
    // [R23-a-2] 设计语言 token 层(全部可选、向后兼容; 消费端按注释 fallback)
    // ----------------------------------------------------------
    /** hero/横幅区富背景(可多层渐变叠加), fallback: `linear-gradient(120deg, primary, accent)` */
    heroBg?: string
    /** hero 主文字色, fallback: primaryText */
    heroText?: string
    /** hero 次文字色, fallback: heroText 80% 不透明度 */
    heroMuted?: string
    /** 卡片表面背景(可渐变), fallback: surface */
    surfaceGradient?: string
    /** 全站装饰纹理层(完整 background 简写, 自含 size/repeat; 例: `radial-gradient(circle, rgba(56,38,26,0.06) 1.5px, transparent 1.5px) 0 0 / 22px 22px repeat`), 缺省=无纹理 */
    patternBg?: string
    /** 区块标题装饰形态, fallback 'bar' */
    headingDeco?: HeadingDecoKind
    /** 主按钮形态, fallback 'solid' */
    buttonStyle?: ButtonStyleKind
    /** 卡片 hover 形态, fallback 'lift' */
    cardHover?: CardHoverKind
    /** 辉光色(neon/glass 用), fallback: primary */
    glowColor?: string
    /** hero 标题渐变文字, fallback false */
    gradientText?: boolean
  }
  /** 预览用小色块 */
  preview: [string, string, string]
}

export const THEMES: ThemeDef[] = [
  {
    id: 'aurora',
    name: '星夜幻紫',
    desc: '深色玻璃拟态·横向书架·渐变光效·悬浮沉浸阅读',
    layout: 'shelf',
    dark: true,
    read: {
      layout: 'immersive', measure: 720, lineHeight: 2.05, fontBase: 18,
      indent: false, justify: false, toolbar: 'floating', texture: 'vignette', chapterDeco: 'none',
    },
    vars: {
      bg: 'linear-gradient(160deg, #0f0a1e 0%, #1a1033 50%, #120b24 100%)',
      surface: 'rgba(255,255,255,0.06)',
      surfaceAlt: 'rgba(255,255,255,0.1)',
      text: '#ede9fe',
      textMuted: '#a78bda',
      primary: '#a855f7',
      primaryText: '#ffffff',
      accent: '#22d3ee',
      border: 'rgba(168,85,247,0.25)',
      radius: '18px',
      fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif',
      cardShadow: '0 8px 32px rgba(168,85,247,0.25)',
      headerStyle: 'gradient',
      // [R23-a-3] aurora=neon 系人格: 赛博网格纹理 + 渐变文字标题 + accent 青辉光卡片 + 紫青双球 hero
      heroBg: 'radial-gradient(circle at 20% 25%, rgba(168,85,247,0.5) 0%, rgba(168,85,247,0) 50%), radial-gradient(circle at 78% 70%, rgba(34,211,238,0.38) 0%, rgba(34,211,238,0) 50%), linear-gradient(150deg, #241242 0%, #150e2e 55%, #0b1030 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.8)',
      surfaceGradient: 'linear-gradient(150deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 100%)',
      patternBg: 'linear-gradient(rgba(237,233,254,0.1) 1px, transparent 1px) 0 0 / 34px 34px repeat, linear-gradient(90deg, rgba(237,233,254,0.1) 1px, transparent 1px) 0 0 / 34px 34px repeat',
      headingDeco: 'dual',
      buttonStyle: 'neon',
      cardHover: 'glow',
      glowColor: '#22d3ee',
      gradientText: true,
    },
    preview: ['#1a1033', '#a855f7', '#22d3ee'],
  },
  {
    id: 'paper',
    name: '纸墨书香',
    desc: '复古宣纸质感·衬线字体·典雅书卷气·典书版阅读',
    layout: 'list',
    dark: false,
    read: {
      layout: 'classic', measure: 680, lineHeight: 2, fontBase: 18,
      indent: true, justify: true, toolbar: 'inline', texture: 'paper', chapterDeco: 'ornament',
    },
    vars: {
      bg: '#f5efe0',
      surface: '#fdf9ee',
      surfaceAlt: '#f0e8d2',
      text: '#3d2f1e',
      textMuted: '#8a7355',
      primary: '#8b3a2f',
      primaryText: '#fdf9ee',
      accent: '#b8860b',
      border: '#d9c9a3',
      radius: '4px',
      fontFamily: 'Georgia,"Noto Serif SC","Songti SC",serif',
      cardShadow: '0 2px 8px rgba(61,47,30,0.12)',
      headerStyle: 'centered',
      titleFont: '"Noto Serif SC","Songti SC",serif',
      // [R23-a-4] paper=宣纸书卷人格: 纸纤维点纹 + 菱形花饰标题 + 实底按钮 + 水墨晕染 hero(浅米底配深墨字, heroText 不取 primaryText)
      heroBg: 'radial-gradient(circle at 24% 28%, rgba(139,58,47,0.16) 0%, rgba(139,58,47,0) 46%), radial-gradient(circle at 78% 20%, rgba(184,134,11,0.16) 0%, rgba(184,134,11,0) 42%), radial-gradient(circle at 62% 92%, rgba(61,47,30,0.12) 0%, rgba(61,47,30,0) 52%), linear-gradient(135deg, #f3e7cd 0%, #ecd9b4 55%, #e2c79c 100%)',
      heroText: '#3a2c1a',
      heroMuted: 'rgba(58,44,26,0.8)',
      patternBg: 'radial-gradient(circle, rgba(61,47,30,0.06) 1.5px, transparent 1.5px) 0 0 / 22px 22px repeat',
      headingDeco: 'ornament',
      buttonStyle: 'solid',
      cardHover: 'lift',
      gradientText: false,
    },
    preview: ['#f5efe0', '#8b3a2f', '#b8860b'],
  },
  {
    id: 'mango',
    name: '活力橙夏',
    desc: '明亮暖色·大圆角卡片·网格瀑布流·分页横滑阅读',
    layout: 'grid',
    dark: false,
    read: {
      layout: 'paginated', measure: 480, lineHeight: 1.85, fontBase: 17,
      indent: false, justify: false, toolbar: 'bottom', texture: 'none', chapterDeco: 'rule',
    },
    vars: {
      bg: '#fff8f0',
      surface: '#ffffff',
      surfaceAlt: '#fff1e0',
      text: '#43301c',
      textMuted: '#a08468',
      primary: '#f97316',
      primaryText: '#ffffff',
      accent: '#16a34a',
      border: '#ffe0c2',
      radius: '22px',
      fontFamily: '"HarmonyOS Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
      cardShadow: '0 10px 24px rgba(249,115,22,0.14)',
      headerStyle: 'solid',
      // [R23-a-5] mango=现代 ribbon 人格: 斜条纹纹理 + 缎带标题 + 渐变按钮 + 双色渐变卡片
      heroBg: 'radial-gradient(circle at 82% 16%, rgba(255,236,190,0.6) 0%, rgba(255,236,190,0) 55%), linear-gradient(135deg, #fb923c 0%, #f97316 45%, #c2540a 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.8)',
      surfaceGradient: 'linear-gradient(160deg, #ffffff 0%, #fff1e0 100%)',
      patternBg: 'repeating-linear-gradient(-45deg, rgba(67,48,28,0.06) 0 1px, transparent 1px 14px)',
      headingDeco: 'ribbon',
      buttonStyle: 'gradient',
      cardHover: 'lift',
      gradientText: false,
    },
    preview: ['#fff8f0', '#f97316', '#16a34a'],
  },
  {
    id: 'bamboo',
    name: '青竹听雨',
    desc: '极简留白·细线分隔·纵向目录式排版·轻典书阅读',
    layout: 'minimal',
    dark: false,
    read: {
      layout: 'classic', measure: 640, lineHeight: 1.95, fontBase: 17,
      indent: true, justify: false, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
    vars: {
      bg: '#fafdf7',
      surface: '#ffffff',
      surfaceAlt: '#eef5ea',
      text: '#26382b',
      textMuted: '#7d9482',
      primary: '#16a34a',
      primaryText: '#ffffff',
      accent: '#0d9488',
      border: '#d7e6d5',
      radius: '10px',
      fontFamily: '"Source Han Sans SC","PingFang SC",sans-serif',
      cardShadow: 'none',
      headerStyle: 'split',
      // [R23-a-6] bamboo=瑞士编辑极简人格: 细点阵纹理 + 竖条标题 + 描边按钮 + 浅绿编辑横幅(深墨字)
      heroBg: 'radial-gradient(circle at 84% 18%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 52%), linear-gradient(135deg, #dcefe0 0%, #c4e3cb 55%, #a8d4b4 100%)',
      heroText: '#26382b',
      heroMuted: 'rgba(38,56,43,0.8)',
      patternBg: 'radial-gradient(circle, rgba(38,56,43,0.06) 1.5px, transparent 1.5px) 0 0 / 22px 22px repeat',
      headingDeco: 'bar',
      buttonStyle: 'outline',
      cardHover: 'lift',
      gradientText: false,
    },
    preview: ['#fafdf7', '#16a34a', '#0d9488'],
  },
  {
    id: 'rose',
    name: '玫瑰剧场',
    desc: '暗黑红金·杂志双栏·戏剧化排版·对开分页阅读',
    layout: 'magazine',
    dark: true,
    read: {
      layout: 'paginated', measure: 560, lineHeight: 1.95, fontBase: 18,
      indent: true, justify: true, toolbar: 'bottom', texture: 'vignette', chapterDeco: 'ornament',
    },
    vars: {
      bg: '#160b0e',
      surface: '#241016',
      surfaceAlt: '#33161e',
      text: '#f5e6e8',
      textMuted: '#c497a0',
      primary: '#e11d48',
      primaryText: '#ffffff',
      accent: '#d4a853',
      border: 'rgba(225,29,72,0.35)',
      radius: '8px',
      fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif',
      cardShadow: '0 12px 40px rgba(225,29,72,0.3)',
      headerStyle: 'transparent',
      titleFont: '"Noto Serif SC",serif',
      // [R23-a-7] rose=杂志 bracket 人格: 书名号括角标题 + grow 放大卡片 + 暗夜报头式 hero(无纹理)
      heroBg: 'radial-gradient(circle at 50% -18%, rgba(225,29,72,0.4) 0%, rgba(225,29,72,0) 55%), linear-gradient(180deg, #2a1016 0%, #160b0e 100%)',
      heroText: '#f5e6e8',
      heroMuted: 'rgba(245,230,232,0.8)',
      headingDeco: 'bracket',
      buttonStyle: 'solid',
      cardHover: 'grow',
      gradientText: false,
    },
    preview: ['#160b0e', '#e11d48', '#d4a853'],
  },
  {
    id: 'ocean',
    name: '深海影院',
    desc: '冷色沉浸·全宽横幅·影视海报式封面·宽幅沉浸阅读',
    layout: 'theater',
    dark: true,
    read: {
      layout: 'immersive', measure: 780, lineHeight: 2, fontBase: 18,
      indent: false, justify: false, toolbar: 'bottom', texture: 'none', chapterDeco: 'none',
    },
    vars: {
      bg: '#0a1628',
      surface: '#122238',
      surfaceAlt: '#1a3250',
      text: '#e2ecf5',
      textMuted: '#7fa3c0',
      primary: '#38bdf8',
      primaryText: '#082032',
      accent: '#fbbf24',
      border: 'rgba(56,189,248,0.25)',
      radius: '14px',
      fontFamily: '"HarmonyOS Sans SC","PingFang SC",sans-serif',
      cardShadow: '0 8px 28px rgba(2,12,27,0.6)',
      headerStyle: 'transparent',
      // [R23-a-8] ocean=影院人格: 渐变文字标题(swash 渐变下划线) + 天青辉光卡片 + 深海底光横幅(无纹理)
      heroBg: 'radial-gradient(circle at 78% 18%, rgba(56,189,248,0.3) 0%, rgba(56,189,248,0) 50%), radial-gradient(circle at 15% 85%, rgba(251,191,36,0.14) 0%, rgba(251,191,36,0) 45%), linear-gradient(160deg, #10263f 0%, #0a1628 60%, #060f1d 100%)',
      heroText: '#e2ecf5',
      heroMuted: 'rgba(226,236,245,0.8)',
      headingDeco: 'swash',
      buttonStyle: 'gradient',
      cardHover: 'glow',
      glowColor: '#38bdf8',
      gradientText: true,
    },
    preview: ['#0a1628', '#38bdf8', '#fbbf24'],
  },
  {
    // R18-b 新增: 笔趣阁经典布局展示主题(对应矩阵精选组合位 amber×classic×biquge)
    id: 'biquge',
    name: '笔趣阁经典',
    desc: '仿经典笔趣阁·米白暖橙·顶部导航条·三栏板块·分类分组更新表',
    layout: 'biquge',
    dark: false,
    read: {
      layout: 'classic', measure: 760, lineHeight: 2, fontBase: 18,
      indent: true, justify: true, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
    vars: {
      bg: '#f7f2e7',
      surface: '#fffcf5',
      surfaceAlt: '#f1e8d7',
      text: '#38261a',
      textMuted: '#8c7358',
      primary: '#b3401f',
      primaryText: '#ffffff',
      accent: '#a16207',
      border: '#e6d9c2',
      radius: '4px',
      fontFamily: '"Microsoft YaHei","PingFang SC","HarmonyOS Sans SC",sans-serif',
      cardShadow: '0 2px 8px rgba(56,38,26,0.1)',
      headerStyle: 'solid',
      titleFont: '"Noto Serif SC","Songti SC",serif',
      // [R23-a-9] biquge=书卷典雅人格: 极淡斜纹织锦 + 实底徽章标题 + 静态稳重卡片(hover none) + 赭橙报头
      heroBg: 'radial-gradient(circle at 82% 14%, rgba(255,240,214,0.5) 0%, rgba(255,240,214,0) 54%), linear-gradient(135deg, #c96f2e 0%, #b0521c 48%, #8a370e 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.8)',
      patternBg: 'repeating-linear-gradient(45deg, rgba(56,38,26,0.05) 0 2px, transparent 2px 18px)',
      headingDeco: 'badge',
      buttonStyle: 'solid',
      cardHover: 'none',
      gradientText: false,
    },
    preview: ['#f7f2e7', '#b3401f', '#a16207'],
  },
  {
    // [R18-d-2] aijjxs 仿站精选(第 9 个 preset) — 色值全部取自 www.aijjxs.com 真站实测:
    //   :root{ --bg:#f3efe7 --paper:#fffdf8 --ink:#1f2937 --muted:#6b7280 --line:#e5dccd
    //          --brand:#0f766e --brand-dark:#115e59 --accent:#b45309 --chip:#eef9f7
    //          --shadow:0 10px 30px rgba(17,24,39,.08) --radius:14px }
    //   头部: top-float 深酒红渐变固定导航条(白字链接) — headerStyle:'aijjxs' 专属分支(SiteHeader)
    //   布局: 真站为「最新上传/封面推荐/小说分类/专题书单/热榜」多板块列表站 → 'biquge' 板块布局最贴近
    //   与真站差异: ①导航条随页滚动(真站为 fixed 吸顶) ②板块标题条为主色渐变底(真站为白底+左侧青绿→琥珀渐变竖条)
    //   ③无 KPI 数据统计带/签到/搜索历史 chips(数据源未提供) — 均在后台组合浏览器不可达, 不影响色值还原
    id: 'aijjxs',
    name: '久久小说(仿)',
    desc: '仿 aijjxs.com 久久小说下载网·深酒红导航条+米黄纸面+青绿主色+琥珀强调(真站实测取色)·笔趣阁式板块布局',
    layout: 'biquge',
    dark: false,
    read: {
      layout: 'classic', measure: 680, lineHeight: 1.85, fontBase: 17,
      indent: true, justify: false, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
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
      // [R23-a-10] aijjxs=仿站气质: 竖条标题(真站青绿→琥珀渐变竖条)+ 稳重实底按钮 + 青绿报头+琥珀高光(无纹理, 贴近真站)
      heroBg: 'radial-gradient(circle at 88% 18%, rgba(180,83,9,0.35) 0%, rgba(180,83,9,0) 45%), linear-gradient(135deg, #0f766e 0%, #115e59 60%, #0b4a45 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.8)',
      headingDeco: 'bar',
      buttonStyle: 'solid',
      cardHover: 'lift',
      gradientText: false,
    },
    preview: ['#f3efe7', '#0f766e', '#b45309'],
  },
  {
    id: 'pili',
    name: '霹雳书屋',
    desc: '仿霹雳书屋·白底暖橙复古书城·奶油分类条·橙色大按钮·书屋版阅读',
    layout: 'pili',
    dark: false,
    read: {
      layout: 'pili', measure: 680, lineHeight: 1.9, fontBase: 18,
      indent: true, justify: false, toolbar: 'bottom', texture: 'none', chapterDeco: 'rule',
    },
    vars: {
      bg: '#f0efee',
      surface: '#ffffff',
      surfaceAlt: '#f7f3ec',
      text: '#333333',
      textMuted: '#999999',
      primary: '#fd8929',
      primaryText: '#ffffff',
      accent: '#d71704',
      border: '#e6ddd0',
      radius: '3px',
      fontFamily: '"Microsoft YaHei","PingFang SC","HarmonyOS Sans SC",sans-serif',
      cardShadow: '0 1px 4px rgba(125,54,15,0.08)',
      headerStyle: 'pili',
      // [R23-a-11] pili=复古书城人格: 条纹纹理 + 缎带标题 + 胶囊大按钮 + 橙头横幅
      heroBg: 'radial-gradient(circle at 85% 15%, rgba(255,214,170,0.55) 0%, rgba(255,214,170,0) 50%), linear-gradient(135deg, #fd8929 0%, #f06a0e 55%, #c2540a 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.8)',
      patternBg: 'repeating-linear-gradient(-45deg, rgba(51,51,51,0.05) 0 1px, transparent 1px 14px)',
      headingDeco: 'ribbon',
      buttonStyle: 'pill',
      cardHover: 'lift',
      gradientText: false,
    },
    preview: ['#ffffff', '#fd8929', '#d71704'],
  },
]

/** getTheme — 恒不失败的主题解析: preset → 512 组合 → THEMES[0] 兜底
 *  R18-b 起组合 id 也可命中(此前仅 preset, SiteHeader 站点切换器对组合 id 会显示兜底主题);
 *  未知/旧版 id(50400 组合时代)解析失败 → THEMES[0](aurora), 不崩不白屏 */
export function getTheme(id: string | null | undefined): ThemeDef {
  return getThemeById(id) || THEMES[0]
}

/** 组合主题解析入口(R18-b: 8 配色 × 8 风格 × 8 布局 = 512 组合)
 *  - 先查 9 个手写 preset( THEMES ) —— 命中即返回(向后兼容)
 *  - 否则按 `{colorId}-{styleId}-{layoutId}` 解析组合主题(8×8×8=512)
 *  - 全部未命中返回 undefined, 由调用方回退 THEMES[0](aurora) 兜底:
 *    PublicSite `|| THEMES[0]` / getTheme `|| THEMES[0]` / admin sites 归一化 'aurora'
 *  本函数是 PublicSite / SiteHeader / admin 校验的唯一入口 */
export function getThemeById(id: string | null | undefined): ThemeDef | undefined {
  if (!id) return undefined
  const preset = THEMES.find((t) => t.id === id)
  if (preset) return preset
  const combo = resolveComboTheme(id)
  if (combo) return combo
  return undefined
}
