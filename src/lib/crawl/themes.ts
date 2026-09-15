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
// [R23-II-1] 精仿 5 站 + 全新 12 套(用户指令: 精仿 101kks/pilishuwu/aijjxs/biquge/23qb 要求
// 一模一样; 另加完全不同风格/配色/布局的 12 套):
//   · 精仿: kks101(101看書, 蓝白 #1f6cb2)/qb23(铅笔小说, 朱红 #ff2a14) 新增;
//     biquge 升级为 laoniu1 真站模板精仿(粉红 #F47983 导航条); pili 色板校准真站实测;
//     aijjxs 已有(R18-d 实测取色)仅复验。色值全部取自各真站 CSS 实测(见各自 preset 注释)
//   · 全新 12 套(inkstone/drift/mission/chronicle/lilac/matcha/noirgold/typewriter/
//     soda/sunset/woodland/graphite): 12 套↔12 布局一一对应 —— 既有 8 布局(grid/list/
//     shelf/magazine/minimal/theater/pili/biquge) + 新增 4 布局(newspaper 报馆版式/
//     masonry 瀑布撞色/dashboard 控制台/timeline 编年时间轴, 组件见 layouts/),
//     配色空间与既有 9 套精选+4 精仿零重叠(墨黑朱砂/珊瑚撞色/深板岩荧光/卷轴铜棕/香芋紫/
//     抹茶绿/黑金/打字机米棕/苏打青柠/落日橘紫/苔藓深绿/石墨瑞士)
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
  /** 首页布局风格 (R18-b: +biquge 笔趣阁经典; [R23-II-1] +newspaper/masonry/dashboard/timeline 全新四布局, 仅精选 preset 使用) */
  layout: 'grid' | 'list' | 'shelf' | 'magazine' | 'minimal' | 'theater' | 'pili' | 'biquge' | 'newspaper' | 'masonry' | 'dashboard' | 'timeline'
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
    // [R18-d-1] +aijjxs 仿站深酒红导航条; [R23-II-1] +kks/qb/biquge-x 仿站头部(仅精选 preset; 矩阵组合 HeaderStyleKind 仍 6 种, 8×8×8=512 不变)
    headerStyle: 'solid' | 'gradient' | 'transparent' | 'split' | 'centered' | 'pili' | 'aijjxs' | 'kks' | 'qb' | 'biquge-x'
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
    // [R23-II-2] 升级为「精仿笔趣阁」— laoniu1 模板真站实测取色(www.biquge.tw, /static/laoniu1/style.css):
    //   body 无底色区块 .header-common-nav { background:#F47983; height:2.2rem; 白字链接均分 10 列 }
    //   背景 #f0f2f7(×26 处最高频) / 强调 #f85c7d / 文字 #333/#666/#999 / 边线 #ddd / yahei 字体
    //   头部: headerStyle:'biquge-x' 专属分支(SiteHeader) = 白底报头 + 粉红导航条(真站双行结构)
    //   布局: 真站为「推荐/最新/排行」板块列表站 → 'biquge' 板块布局
    id: 'biquge',
    name: '笔趣阁(精仿)',
    desc: '仿笔趣阁 laoniu1 经典模板·粉红导航条+浅灰蓝纸面(#F47983 真站实测取色)·三栏板块布局',
    layout: 'biquge',
    dark: false,
    read: {
      layout: 'classic', measure: 760, lineHeight: 2, fontBase: 18,
      indent: true, justify: true, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
    vars: {
      bg: '#f0f2f7',
      surface: '#ffffff',
      surfaceAlt: '#f7f8fa',
      text: '#333333',
      textMuted: '#999999',
      primary: '#F47983',
      primaryText: '#ffffff',
      accent: '#f85c7d',
      border: '#dddddd',
      radius: '4px',
      fontFamily: '"Microsoft YaHei","PingFang SC","HarmonyOS Sans SC",sans-serif',
      cardShadow: '0 1px 4px rgba(51,51,51,0.08)',
      headerStyle: 'biquge-x',
      titleFont: '"Microsoft YaHei","PingFang SC",sans-serif',
      // 精仿气质: 粉红报头 + 徽章标题 + 稳重实底按钮 + 静态卡片(真站无 hover 动效)
      heroBg: 'linear-gradient(135deg, #F47983 0%, #f85c7d 60%, #e75a70 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.82)',
      headingDeco: 'badge',
      buttonStyle: 'solid',
      cardHover: 'none',
      gradientText: false,
    },
    preview: ['#f0f2f7', '#F47983', '#f85c7d'],
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
    // [R23-II-3] 升级为「精仿霹雳书屋」— 色板按真站 CSS 实测校准(www.pilishuwu.com, wmcms 模板):
    //   主色 #fd8929(×24)/红强调 #d71704(×9)/渐变橙系 #ff9a6a→#f65400/米色 #faead0(×9)/
    //   背景 #fafafa(×9)/边线 #dcd8d4(×9)/文字 #333/#666/#999/微软雅黑 —— 原 preset 主色已吻合,
    //   本轮仅校准 bg/border/surfaceAlt 与 hero 渐变(真站头部橙系渐变基因)
    id: 'pili',
    name: '霹雳书屋(精仿)',
    desc: '仿 pilishuwu.com 霹雳书屋·白底暖橙复古书城(#fd8929 真站实测取色)·奶油分类条·橙色大按钮·书屋版阅读',
    layout: 'pili',
    dark: false,
    read: {
      layout: 'pili', measure: 680, lineHeight: 1.9, fontBase: 18,
      indent: true, justify: false, toolbar: 'bottom', texture: 'none', chapterDeco: 'rule',
    },
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
      // 精仿气质: 真站橙系渐变(#ff9a6a→#f65400) + 缎带标题 + 胶囊大按钮
      heroBg: 'radial-gradient(circle at 85% 15%, rgba(255,177,76,0.55) 0%, rgba(255,177,76,0) 50%), linear-gradient(135deg, #ff9a6a 0%, #fd8929 45%, #f65400 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.8)',
      patternBg: 'repeating-linear-gradient(-45deg, rgba(51,51,51,0.05) 0 1px, transparent 1px 14px)',
      headingDeco: 'ribbon',
      buttonStyle: 'pill',
      cardHover: 'lift',
      gradientText: false,
    },
    preview: ['#fafafa', '#fd8929', '#d71704'],
  },
  {
    // [R23-II-4] 精仿 101看書 — 色值全部取自 www.101kks.com 真站实测(/css/style.css):
    //   body { background:#f2f3f4; color:#333; font:"Microsoft YaHei" 14px }
    //   主色 #1f6cb2(×32) 蓝色导航/按钮/链接 · 辅助 #56a6c3 · 公告条 #fff2df ·
    //   灰系 #818a91/#666/#999 · 边线 #ddd/#ebebeb · 紧凑 14px 字号密集列表站
    //   头部: headerStyle:'kks' 专属分支(SiteHeader) = 白底报头 + 蓝色导航条(真站双行结构)
    //   布局: 真站为「分类导航+更新列表+排行」板块站 → 'biquge' 板块布局最贴近
    id: 'kks101',
    name: '101看書(精仿)',
    desc: '仿 101kks.com 101看書·蓝白经典繁体书站(#1f6cb2 真站实测取色)·米黄公告条·紧凑板块布局',
    layout: 'biquge',
    dark: false,
    read: {
      layout: 'classic', measure: 720, lineHeight: 2, fontBase: 17,
      indent: true, justify: true, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
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
      headerStyle: 'kks',
      titleFont: '"Microsoft YaHei","PingFang SC",sans-serif',
      // 精仿气质: 蓝色报头 + 竖条标题 + 实底按钮 + 静态卡片(真站无 hover 动效) + 米黄公告条基因
      heroBg: 'linear-gradient(135deg, #1f6cb2 0%, #1a5f9e 55%, #17508a 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.8)',
      headingDeco: 'bar',
      buttonStyle: 'solid',
      cardHover: 'none',
      gradientText: false,
    },
    preview: ['#f2f3f4', '#1f6cb2', '#56a6c3'],
  },
  {
    // [R23-II-5] 精仿铅笔小说 — 色值全部取自 www.23qb.com 真站实测(/mxstatic/css/style.css):
    //   body { color:#282828; background:#f8f9f9; system-ui 字族, 导航 700 加重 }
    //   主色 #ff2a14(×63) 朱红 · 强调 #ff9800 橙(×11)/#34a853 绿(×11) ·
    //   chip #fef0e5/#fde6dd 暖杏色 · 边线 #e3e6eb/#d7dae1 · 封面网格站(module-item)
    //   头部: headerStyle:'qb' 专属分支(SiteHeader) = 白底报头 + 红色导航条(真站双行结构)
    //   布局: 真站首页为封面网格 → 'grid' 布局
    id: 'qb23',
    name: '铅笔小说(精仿)',
    desc: '仿 23qb.com 铅笔小说·朱红主色+橙绿强调(#ff2a14 真站实测取色)·浅灰蓝纸面·封面网格布局',
    layout: 'grid',
    dark: false,
    read: {
      layout: 'classic', measure: 680, lineHeight: 1.9, fontBase: 17,
      indent: true, justify: false, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
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
      headerStyle: 'qb',
      // 精仿气质: 朱红报头 + 缎带标题 + 红→橙渐变按钮(真站大按钮基因) + 杏色卡片渐变
      heroBg: 'radial-gradient(circle at 82% 16%, rgba(255,152,0,0.4) 0%, rgba(255,152,0,0) 50%), linear-gradient(135deg, #ff2a14 0%, #ea2611 50%, #c81f0e 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.8)',
      surfaceGradient: 'linear-gradient(160deg, #ffffff 0%, #fef0e5 100%)',
      headingDeco: 'ribbon',
      buttonStyle: 'gradient',
      cardHover: 'lift',
      gradientText: false,
    },
    preview: ['#f8f9f9', '#ff2a14', '#ff9800'],
  },
  // ============================================================
  // [R23-II-6] 全新 12 套 —— 12 套↔12 布局一一对应, 配色空间与既有主题零重叠
  //   (newspaper/masonry/dashboard/timeline 为全新布局组件, 见 layouts/Home*.tsx)
  // ============================================================
  {
    // 01 玄墨报馆 × newspaper(报馆版式): 墨黑纸面+朱砂头条+铜金细线, 衬线排印
    id: 'inkstone',
    name: '玄墨报馆',
    desc: '墨黑报纸版式·朱砂头条+铜金细线·衬线竖题·分栏排印·典书版阅读',
    layout: 'newspaper',
    dark: true,
    read: {
      layout: 'classic', measure: 680, lineHeight: 2, fontBase: 18,
      indent: true, justify: true, toolbar: 'inline', texture: 'paper', chapterDeco: 'ornament',
    },
    vars: {
      bg: '#12110f',
      surface: '#1c1a17',
      surfaceAlt: '#252219',
      text: '#e8e4da',
      textMuted: '#8a857a',
      primary: '#c0392b',
      primaryText: '#ffffff',
      accent: '#d4a017',
      border: 'rgba(212,160,23,0.28)',
      radius: '2px',
      fontFamily: 'Georgia,"Noto Serif SC","Songti SC",serif',
      cardShadow: '0 2px 12px rgba(0,0,0,0.5)',
      headerStyle: 'centered',
      titleFont: '"Noto Serif SC","Songti SC",serif',
      // 报馆人格: 墨面晕染报头 + 书名号括角标题 + 描边按钮 + 报纸细线纹理
      heroBg: 'radial-gradient(circle at 20% 20%, rgba(192,57,43,0.22) 0%, rgba(192,57,43,0) 50%), radial-gradient(circle at 85% 75%, rgba(212,160,23,0.14) 0%, rgba(212,160,23,0) 45%), linear-gradient(180deg, #1c1a17 0%, #12110f 100%)',
      heroText: '#e8e4da',
      heroMuted: 'rgba(232,228,218,0.75)',
      patternBg: 'repeating-linear-gradient(0deg, rgba(232,228,218,0.04) 0 1px, transparent 1px 26px)',
      headingDeco: 'bracket',
      buttonStyle: 'outline',
      cardHover: 'none',
      gradientText: false,
    },
    preview: ['#12110f', '#c0392b', '#d4a017'],
  },
  {
    // 02 珊瑚撞色 × masonry(瀑布撞色): 奶油底+珊瑚/松绿/柠黄三色便签墙
    id: 'drift',
    name: '珊瑚便签',
    desc: '瀑布流便签墙·珊瑚红+松绿+柠黄撞色·奶油底·活泼圆角·分页横滑阅读',
    layout: 'masonry',
    dark: false,
    read: {
      layout: 'paginated', measure: 520, lineHeight: 1.85, fontBase: 17,
      indent: false, justify: false, toolbar: 'bottom', texture: 'none', chapterDeco: 'rule',
    },
    vars: {
      bg: '#fdfbf7',
      surface: '#ffffff',
      surfaceAlt: '#fff3ee',
      text: '#2b2b28',
      textMuted: '#98938a',
      primary: '#ff6b6b',
      primaryText: '#ffffff',
      accent: '#0ca678',
      border: '#f0e9dd',
      radius: '14px',
      fontFamily: '"HarmonyOS Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
      cardShadow: '0 6px 18px rgba(255,107,107,0.12)',
      headerStyle: 'split',
      // 撞色人格: 三色气泡报头 + 渐变下划线标题 + 胶囊按钮 + 放大卡片
      heroBg: 'radial-gradient(circle at 16% 30%, rgba(255,107,107,0.5) 0%, rgba(255,107,107,0) 42%), radial-gradient(circle at 52% 12%, rgba(252,196,25,0.45) 0%, rgba(252,196,25,0) 40%), radial-gradient(circle at 84% 40%, rgba(12,166,120,0.35) 0%, rgba(12,166,120,0) 42%), linear-gradient(140deg, #fff4ec 0%, #ffe9e0 55%, #fdfbf7 100%)',
      heroText: '#2b2b28',
      heroMuted: 'rgba(43,43,40,0.72)',
      surfaceGradient: 'linear-gradient(165deg, #ffffff 0%, #fff3ee 100%)',
      headingDeco: 'swash',
      buttonStyle: 'pill',
      cardHover: 'grow',
      gradientText: true,
    },
    preview: ['#fdfbf7', '#ff6b6b', '#0ca678'],
  },
  {
    // 03 控制中心 × dashboard(控制台): 深板岩+荧光薄荷+信号黄, 数据面板气质
    id: 'mission',
    name: '控制中心',
    desc: '数据面板风·深板岩底+荧光薄荷主色+信号黄告警·网格纹理·悬浮沉浸阅读',
    layout: 'dashboard',
    dark: true,
    read: {
      layout: 'immersive', measure: 740, lineHeight: 1.9, fontBase: 17,
      indent: false, justify: false, toolbar: 'floating', texture: 'vignette', chapterDeco: 'none',
    },
    vars: {
      bg: '#101418',
      surface: '#171d24',
      surfaceAlt: '#1e262f',
      text: '#dce3ea',
      textMuted: '#6e7b88',
      primary: '#2dd4a7',
      primaryText: '#06251b',
      accent: '#f5d90a',
      border: 'rgba(45,212,167,0.22)',
      radius: '10px',
      fontFamily: '"HarmonyOS Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
      cardShadow: '0 6px 24px rgba(0,0,0,0.45)',
      headerStyle: 'solid',
      // 控制台人格: 荧光网格纹理 + 竖条标题 + 霓虹辉光按钮 + 薄荷辉光卡片
      heroBg: 'radial-gradient(circle at 78% 22%, rgba(45,212,167,0.2) 0%, rgba(45,212,167,0) 48%), radial-gradient(circle at 12% 82%, rgba(245,217,10,0.1) 0%, rgba(245,217,10,0) 40%), linear-gradient(155deg, #1a2129 0%, #101418 65%, #0b0e12 100%)',
      heroText: '#dce3ea',
      heroMuted: 'rgba(220,227,234,0.72)',
      patternBg: 'linear-gradient(rgba(45,212,167,0.06) 1px, transparent 1px) 0 0 / 30px 30px repeat, linear-gradient(90deg, rgba(45,212,167,0.06) 1px, transparent 1px) 0 0 / 30px 30px repeat',
      headingDeco: 'bar',
      buttonStyle: 'neon',
      cardHover: 'glow',
      glowColor: '#2dd4a7',
      gradientText: false,
    },
    preview: ['#101418', '#2dd4a7', '#f5d90a'],
  },
  {
    // 04 长河编年 × timeline(编年时间轴): 卷轴米黄+铜棕+松绿, 历史长卷气质
    id: 'chronicle',
    name: '长河编年',
    desc: '编年时间轴布局·卷轴米黄+铜棕+松绿·书卷气衬线·典书版阅读',
    layout: 'timeline',
    dark: false,
    read: {
      layout: 'classic', measure: 660, lineHeight: 2, fontBase: 17,
      indent: true, justify: true, toolbar: 'inline', texture: 'paper', chapterDeco: 'rule',
    },
    vars: {
      bg: '#f6f1e7',
      surface: '#fffcf5',
      surfaceAlt: '#f0e8d5',
      text: '#3b2f1e',
      textMuted: '#96825f',
      primary: '#9c6b2f',
      primaryText: '#fffcf5',
      accent: '#4a7c59',
      border: '#e0d3b4',
      radius: '6px',
      fontFamily: 'Georgia,"Noto Serif SC","Songti SC",serif',
      cardShadow: '0 2px 10px rgba(59,47,30,0.1)',
      headerStyle: 'centered',
      titleFont: '"Noto Serif SC","Songti SC",serif',
      // 长卷人格: 横向卷轴纹理 + 菱形花饰标题 + 实底按钮 + 抬升卡片
      heroBg: 'radial-gradient(circle at 30% 24%, rgba(156,107,47,0.18) 0%, rgba(156,107,47,0) 48%), radial-gradient(circle at 80% 70%, rgba(74,124,89,0.16) 0%, rgba(74,124,89,0) 44%), linear-gradient(150deg, #f3e9d2 0%, #ecdcb8 60%, #e4cf9f 100%)',
      heroText: '#3b2f1e',
      heroMuted: 'rgba(59,47,30,0.78)',
      patternBg: 'repeating-linear-gradient(0deg, rgba(59,47,30,0.045) 0 1px, transparent 1px 30px)',
      headingDeco: 'ornament',
      buttonStyle: 'solid',
      cardHover: 'lift',
      gradientText: false,
    },
    preview: ['#f6f1e7', '#9c6b2f', '#4a7c59'],
  },
  {
    // 05 香芋牧野 × grid: 香芋紫+薄荷绿浅色系, 圆润牧野气质(与暗夜紫 aurora 区隔: 浅底低饱和)
    id: 'lilac',
    name: '香芋牧野',
    desc: '香芋紫+薄荷绿浅色系·圆润大卡片·柔和渐变横幅·分页横滑阅读',
    layout: 'grid',
    dark: false,
    read: {
      layout: 'paginated', measure: 520, lineHeight: 1.9, fontBase: 17,
      indent: false, justify: false, toolbar: 'bottom', texture: 'none', chapterDeco: 'ornament',
    },
    vars: {
      bg: '#f7f5fb',
      surface: '#ffffff',
      surfaceAlt: '#f0ecf8',
      text: '#37323f',
      textMuted: '#9a92ab',
      primary: '#8e7cc3',
      primaryText: '#ffffff',
      accent: '#7fc8a9',
      border: '#e6e0f0',
      radius: '20px',
      fontFamily: '"HarmonyOS Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
      cardShadow: '0 8px 22px rgba(142,124,195,0.14)',
      headerStyle: 'gradient',
      // 牧野人格: 香芋渐变报头 + 渐变文字标题 + 渐变按钮 + 辉光卡片
      heroBg: 'radial-gradient(circle at 78% 20%, rgba(127,200,169,0.45) 0%, rgba(127,200,169,0) 50%), linear-gradient(135deg, #a99ad8 0%, #8e7cc3 50%, #7464ad 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.82)',
      surfaceGradient: 'linear-gradient(160deg, #ffffff 0%, #f0ecf8 100%)',
      patternBg: 'radial-gradient(circle, rgba(142,124,195,0.07) 1.5px, transparent 1.5px) 0 0 / 24px 24px repeat',
      headingDeco: 'dual',
      buttonStyle: 'gradient',
      cardHover: 'glow',
      glowColor: '#8e7cc3',
      gradientText: true,
    },
    preview: ['#f7f5fb', '#8e7cc3', '#7fc8a9'],
  },
  {
    // 06 抹茶庭园 × list: 抹茶绿+原木棕, 侘寂留白庭园气质
    id: 'matcha',
    name: '抹茶庭园',
    desc: '抹茶绿+原木棕·侘寂留白·细线列表·和风书卷·轻典书阅读',
    layout: 'list',
    dark: false,
    read: {
      layout: 'classic', measure: 640, lineHeight: 2, fontBase: 17,
      indent: true, justify: false, toolbar: 'inline', texture: 'paper', chapterDeco: 'ornament',
    },
    vars: {
      bg: '#f8f7f0',
      surface: '#ffffff',
      surfaceAlt: '#eef0e4',
      text: '#2f3628',
      textMuted: '#8a9077',
      primary: '#5a7247',
      primaryText: '#ffffff',
      accent: '#c98f4e',
      border: '#dee0cf',
      radius: '8px',
      fontFamily: '"Source Han Sans SC","Noto Serif SC","PingFang SC",serif',
      cardShadow: '0 2px 8px rgba(47,54,40,0.07)',
      headerStyle: 'split',
      titleFont: '"Noto Serif SC","Songti SC",serif',
      // 庭园人格: 苔点纹理 + 菱形花饰标题 + 描边按钮 + 抬升卡片
      heroBg: 'radial-gradient(circle at 22% 30%, rgba(90,114,71,0.2) 0%, rgba(90,114,71,0) 46%), radial-gradient(circle at 82% 24%, rgba(201,143,78,0.16) 0%, rgba(201,143,78,0) 42%), linear-gradient(140deg, #eef0e0 0%, #e2e7cd 55%, #d5dcb9 100%)',
      heroText: '#2f3628',
      heroMuted: 'rgba(47,54,40,0.78)',
      patternBg: 'radial-gradient(circle, rgba(90,114,71,0.08) 1.5px, transparent 1.5px) 0 0 / 26px 26px repeat',
      headingDeco: 'ornament',
      buttonStyle: 'outline',
      cardHover: 'lift',
      gradientText: false,
    },
    preview: ['#f8f7f0', '#5a7247', '#c98f4e'],
  },
  {
    // 07 黑金殿堂 × shelf: 纯金+墨黑殿堂气质(与玫瑰剧场红金区隔: 无红, 冷金象牙)
    id: 'noirgold',
    name: '黑金殿堂',
    desc: '黑金殿堂·纯金主色+象牙文字·横向书架·戏剧化横幅·沉浸暗夜阅读',
    layout: 'shelf',
    dark: true,
    read: {
      layout: 'immersive', measure: 760, lineHeight: 2, fontBase: 18,
      indent: false, justify: false, toolbar: 'floating', texture: 'vignette', chapterDeco: 'ornament',
    },
    vars: {
      bg: '#141414',
      surface: '#1e1d1a',
      surfaceAlt: '#2a2822',
      text: '#efe9dc',
      textMuted: '#97907e',
      primary: '#d4af37',
      primaryText: '#1a1608',
      accent: '#f0e6c8',
      border: 'rgba(212,175,55,0.3)',
      radius: '10px',
      fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif',
      cardShadow: '0 10px 30px rgba(0,0,0,0.55)',
      headerStyle: 'transparent',
      titleFont: '"Noto Serif SC",serif',
      // 殿堂人格: 金辉报头 + 渐变文字标题 + 实底按钮 + 金辉光卡片
      heroBg: 'radial-gradient(circle at 50% -10%, rgba(212,175,55,0.28) 0%, rgba(212,175,55,0) 55%), radial-gradient(circle at 88% 80%, rgba(212,175,55,0.12) 0%, rgba(212,175,55,0) 40%), linear-gradient(180deg, #201e18 0%, #141414 100%)',
      heroText: '#efe9dc',
      heroMuted: 'rgba(239,233,220,0.75)',
      headingDeco: 'dual',
      buttonStyle: 'solid',
      cardHover: 'glow',
      glowColor: '#d4af37',
      gradientText: true,
    },
    preview: ['#141414', '#d4af37', '#f0e6c8'],
  },
  {
    // 08 打字机手札 × minimal: 米棕纸面+墨字+赭红缎带, 打字机手稿气质
    id: 'typewriter',
    name: '打字机手札',
    desc: '打字机手稿风·米棕纸面+墨字+赭红缎带·等宽排印细节·极简目录式',
    layout: 'minimal',
    dark: false,
    read: {
      layout: 'classic', measure: 620, lineHeight: 2.05, fontBase: 17,
      indent: true, justify: false, toolbar: 'inline', texture: 'paper', chapterDeco: 'rule',
    },
    vars: {
      bg: '#f4f1ea',
      surface: '#fdfcf8',
      surfaceAlt: '#eae5d9',
      text: '#2d2a26',
      textMuted: '#8d867a',
      primary: '#2d2a26',
      primaryText: '#f4f1ea',
      accent: '#a63d2f',
      border: '#dcd6c8',
      radius: '3px',
      fontFamily: '"Courier New","Noto Serif SC","Songti SC",monospace',
      cardShadow: 'none',
      headerStyle: 'centered',
      titleFont: '"Noto Serif SC","Songti SC",serif',
      // 手札人格: 纸纤维纹理 + 缎带标题(赭红) + 实底按钮 + 抬升卡片
      heroBg: 'radial-gradient(circle at 76% 22%, rgba(166,61,47,0.1) 0%, rgba(166,61,47,0) 42%), linear-gradient(135deg, #efe9dc 0%, #e6dfcf 55%, #dcd3bf 100%)',
      heroText: '#2d2a26',
      heroMuted: 'rgba(45,42,38,0.76)',
      patternBg: 'radial-gradient(circle, rgba(45,42,38,0.05) 1px, transparent 1px) 0 0 / 18px 18px repeat',
      headingDeco: 'ribbon',
      buttonStyle: 'solid',
      cardHover: 'lift',
      gradientText: false,
    },
    preview: ['#f4f1ea', '#2d2a26', '#a63d2f'],
  },
  {
    // 09 苏打汽水 × magazine: 苏打青+青柠撞色, 气泡杂志气质
    id: 'soda',
    name: '苏打汽水',
    desc: '苏打青+青柠气泡·杂志双栏·明快撞色·对开分页阅读',
    layout: 'magazine',
    dark: false,
    read: {
      layout: 'paginated', measure: 560, lineHeight: 1.9, fontBase: 17,
      indent: true, justify: true, toolbar: 'bottom', texture: 'none', chapterDeco: 'ornament',
    },
    vars: {
      bg: '#f2fbf9',
      surface: '#ffffff',
      surfaceAlt: '#e4f6f0',
      text: '#1f3833',
      textMuted: '#7ba39a',
      primary: '#00a896',
      primaryText: '#ffffff',
      accent: '#8bc34a',
      border: '#cfe9e2',
      radius: '12px',
      fontFamily: '"HarmonyOS Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
      cardShadow: '0 8px 20px rgba(0,168,150,0.12)',
      headerStyle: 'gradient',
      // 汽水人格: 双色气泡报头 + 渐变文字标题 + 渐变按钮 + 辉光卡片 + 气泡纹理
      heroBg: 'radial-gradient(circle at 18% 28%, rgba(139,195,74,0.5) 0%, rgba(139,195,74,0) 44%), radial-gradient(circle at 82% 30%, rgba(0,168,150,0.4) 0%, rgba(0,168,150,0) 48%), linear-gradient(140deg, #e0f7f1 0%, #cdf0e6 55%, #f2fbf9 100%)',
      heroText: '#1f3833',
      heroMuted: 'rgba(31,56,51,0.72)',
      patternBg: 'radial-gradient(circle, rgba(0,168,150,0.08) 2px, transparent 2px) 0 0 / 20px 20px repeat',
      headingDeco: 'dual',
      buttonStyle: 'gradient',
      cardHover: 'glow',
      glowColor: '#00a896',
      gradientText: true,
    },
    preview: ['#f2fbf9', '#00a896', '#8bc34a'],
  },
  {
    // 10 落日大道 × pili(书城版式): 落日橘红+暮紫, 复古书城骨架换新装(与 pili 橙区隔: 橘红+暮紫双色)
    id: 'sunset',
    name: '落日大道',
    desc: '落日橘红+暮紫双色·复古书城版式·奶油分类条·渐变大按钮·书屋版阅读',
    layout: 'pili',
    dark: false,
    read: {
      layout: 'pili', measure: 680, lineHeight: 1.9, fontBase: 18,
      indent: true, justify: false, toolbar: 'bottom', texture: 'none', chapterDeco: 'rule',
    },
    vars: {
      bg: '#fdf3ee',
      surface: '#ffffff',
      surfaceAlt: '#fbe9e2',
      text: '#3a2a26',
      textMuted: '#a0877e',
      primary: '#e26a4f',
      primaryText: '#ffffff',
      accent: '#8e5aa8',
      border: '#f2ded5',
      radius: '6px',
      fontFamily: '"Microsoft YaHei","PingFang SC","HarmonyOS Sans SC",sans-serif',
      cardShadow: '0 4px 14px rgba(226,106,79,0.14)',
      headerStyle: 'solid',
      // 落日人格: 橘红→暮紫渐变报头 + 缎带标题 + 渐变按钮 + 抬升卡片
      heroBg: 'radial-gradient(circle at 80% 18%, rgba(142,90,168,0.5) 0%, rgba(142,90,168,0) 52%), linear-gradient(120deg, #e26a4f 0%, #d75f5e 45%, #8e5aa8 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.82)',
      surfaceGradient: 'linear-gradient(165deg, #ffffff 0%, #fbe9e2 100%)',
      headingDeco: 'ribbon',
      buttonStyle: 'gradient',
      cardHover: 'lift',
      gradientText: false,
    },
    preview: ['#fdf3ee', '#e26a4f', '#8e5aa8'],
  },
  {
    // 11 苔藓影院 × theater: 深林底+苔绿+萤火黄, 影院海报墙换森林剧场(与深海蓝 ocean 区隔)
    id: 'woodland',
    name: '苔藓影院',
    desc: '森林剧场·深林底+苔绿主色+萤火黄·海报墙布局·宽幅沉浸阅读',
    layout: 'theater',
    dark: true,
    read: {
      layout: 'immersive', measure: 780, lineHeight: 2, fontBase: 18,
      indent: false, justify: false, toolbar: 'bottom', texture: 'vignette', chapterDeco: 'none',
    },
    vars: {
      bg: '#0f1a12',
      surface: '#16241a',
      surfaceAlt: '#1e3024',
      text: '#e2eee4',
      textMuted: '#7fa089',
      primary: '#6fbf8f',
      primaryText: '#0a1a10',
      accent: '#e8c46b',
      border: 'rgba(111,191,143,0.25)',
      radius: '14px',
      fontFamily: '"HarmonyOS Sans SC","PingFang SC",sans-serif',
      cardShadow: '0 8px 26px rgba(4,12,7,0.6)',
      headerStyle: 'transparent',
      // 森林剧场人格: 苔绿渐变文字标题 + 萤火辉光卡片 + 林间光斑报头
      heroBg: 'radial-gradient(circle at 22% 22%, rgba(111,191,143,0.24) 0%, rgba(111,191,143,0) 46%), radial-gradient(circle at 82% 68%, rgba(232,196,107,0.14) 0%, rgba(232,196,107,0) 42%), linear-gradient(160deg, #16241a 0%, #0f1a12 60%, #0a120d 100%)',
      heroText: '#e2eee4',
      heroMuted: 'rgba(226,238,228,0.75)',
      headingDeco: 'swash',
      buttonStyle: 'gradient',
      cardHover: 'glow',
      glowColor: '#6fbf8f',
      gradientText: true,
    },
    preview: ['#0f1a12', '#6fbf8f', '#e8c46b'],
  },
  {
    // 12 石墨瑞士 × biquge(板块版式): 石墨黑白+安全橙, 瑞士国际主义排版(与竹青 minimal/笔趣阁粉 区隔)
    id: 'graphite',
    name: '石墨瑞士',
    desc: '瑞士国际主义·石墨黑白+安全橙强调·粗黑标题·网格板块·经典版阅读',
    layout: 'biquge',
    dark: false,
    read: {
      layout: 'classic', measure: 700, lineHeight: 1.95, fontBase: 17,
      indent: true, justify: true, toolbar: 'inline', texture: 'none', chapterDeco: 'rule',
    },
    vars: {
      bg: '#f2f2f0',
      surface: '#ffffff',
      surfaceAlt: '#e9e9e6',
      text: '#1a1a1a',
      textMuted: '#7d7d78',
      primary: '#1a1a1a',
      primaryText: '#ffffff',
      accent: '#ff4d00',
      border: '#d8d8d4',
      radius: '2px',
      fontFamily: '"Helvetica Neue","HarmonyOS Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
      cardShadow: '0 2px 6px rgba(26,26,26,0.08)',
      headerStyle: 'solid',
      // 瑞士人格: 安全橙报头 + 粗竖条标题 + 实底按钮 + 静态卡片 + 网格基线纹理
      heroBg: 'linear-gradient(120deg, #1a1a1a 0%, #2b2b28 62%, #3a3a36 100%)',
      heroText: '#ffffff',
      heroMuted: 'rgba(255,255,255,0.72)',
      patternBg: 'linear-gradient(rgba(26,26,26,0.05) 1px, transparent 1px) 0 0 / 40px 40px repeat, linear-gradient(90deg, rgba(26,26,26,0.05) 1px, transparent 1px) 0 0 / 40px 40px repeat',
      headingDeco: 'bar',
      buttonStyle: 'solid',
      cardHover: 'lift',
      gradientText: false,
    },
    preview: ['#f2f2f0', '#1a1a1a', '#ff4d00'],
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
