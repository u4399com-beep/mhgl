// ============================================================
// Obscura — 本项目自研轻量无头浏览器引擎（--stealth 隐身模式）
//
// 设计要点:
//  - 基于 Playwright chromium 复用: 全局单例浏览器常驻 + 页面池(默认并发 2),
//    避免每次渲染冷启动 launch(~1s+) 的开销
//  - 默认开启 --stealth 隐身模式: STEALTH_INIT_SCRIPTS(静态抹平)+buildIdentityInitScript(按 UA 参数化身份脚本)
//    在每个页面文档创建前注入(全 frame), 抹平 navigator.webdriver / window.chrome / plugins /
//    WebGL / canvas / userAgentData / permissions 等 常见自动化指纹 (参考 puppeteer-extra-stealth
//    思路的本地精简实现); hh-d2: 另经 CDP Network.setUserAgentOverride(+userAgentMetadata) 让
//    【网络层 sec-ch-ua* 头】与 JS userAgentData 与 UA 字符串三方自洽(头组侧 JS 抹平不可达)
//  - 指纹随机化: 每个域名槽位首次创建时随机 视口/UA/dpr/locale/时区(移动性按 UA 派生, hh-d2)
//  - 挑战自动等待: 命中 Cloudflare("Just a moment...")/JS跳转壳等特征时,
//    每 1s 轮询 content 最多 challengeWaitMs, 等待站点侧自动放行
//  - Cookie 回传: 渲染完成后将 context.cookies() 转成 Set-Cookie 风格字符串
//    返回给 fetcher 写入 CookieJar —— HTTP 引擎与浏览器引擎凭证打通的关键
//    (如 cf_clearance 回流后, 纯 HTTP 抓取也能过盾)
//
// 隔离说明(重要): 页面池的每个槽位持有独立 BrowserContext(浏览器级隔离)。
//  - 同域名复用同一 context: 保留 cookie(挑战凭证/会话), 指纹稳定, 像真实回访用户
//  - 跨域名复用前销毁重建 context 并换新指纹: 杜绝 cookie/localStorage 跨站串扰
//    (若未来出现同域多账号等更细粒度隔离需求, 可将槽位桶改为 Map<domain, Slot[]>)
// ============================================================
import type { Browser, BrowserContext, CDPSession, Page } from 'playwright'

// ---------- 类型定义 ----------
/** Obscura 渲染选项(全部可选) */
export interface ObscuraFetchOptions {
  /** 覆盖 UA(默认用随机指纹自带 UA); 传入后本次槽位使用该 UA */
  userAgent?: string
  /** [R9-b-7] 增强: 本次请求的出口代理 URL(http/socks5, 可带凭据 http://user:pass@host:port)。
   *  传入后槽位隔离到独立代理浏览器实例(per-context proxy), 与直连槽位互不串扰;
   *  缺省 undefined 走原直连路径(零回归)。代理槽位与直连槽位不互复 */
  proxy?: string
  /** goto 超时 ms, 默认 20000 */
  timeout?: number
  /** 渲染后等待出现的选择器(容忍超时) */
  waitSelector?: string
  /** 渲染后额外等待 ms */
  waitMs?: number
  /** 挑战特征等待上限 ms, 默认 15000 */
  challengeWaitMs?: number
  /** 渲染稳定化采样上限 ms(HTML 尺寸连续 2 次几乎不增长则提前结束), 默认 6000;
   *  解决 AJAX 页面在 waitMs 后仍持续注入内容(如章节列表延迟加载)被提前截取的问题 */
  settleMs?: number
  /** 渲染后需要点击以展开懒加载内容的选择器(如"点击展开完整目录"按钮);
   *  点击后自动等待 AJAX 注入, 再进入 settle 采样。找不到元素时静默跳过 */
  clickSelector?: string
  /** goto 时携带的 Referer */
  referer?: string
}

/** Obscura 抓取结果 */
export interface ObscuraFetchResult {
  html: string
  /** Set-Cookie 风格字符串数组: "name=value; path=/; domain=.example.com" */
  cookies: string[]
  /** 最终 URL(挑战页可能发生跳转) */
  finalUrl: string
  /** 本次是否经历了挑战等待 */
  challengeWaited: boolean
}

/** 浏览器指纹(用于 context 创建) */
export interface ObscuraFingerprint {
  viewport: { width: number; height: number }
  userAgent: string
  locale: string
  timezoneId: string
  colorScheme: 'light' | 'dark'
  deviceScaleFactor: number
  /** 是否移动端视口(用于 UA/触屏一致性) */
  mobile: boolean
  /** [R9-b-3] 增强: per-context 稳定硬件指纹(navigator.hardwareConcurrency/deviceMemory)。
   *  旧静态脚本每 document 随机一次 cores —— 同 context 跨导航核数漂移本身即指纹;
   *  改为指纹创建期定死、身份脚本按 context 注入(覆盖静态脚本) */
  hardwareConcurrency?: number
  /** [R9-b-3] 增强: deviceMemory 按 W3C 规范上限 8, 加权池 8 为主(8/8/8/4/2) */
  deviceMemory?: number
  /** [R9-b-4] 增强: WebGL vendor/renderer 池化 —— 按 UA 平台从真实形态 GPU 池抽取,
   *  同 context 稳定(静态脚本 6 的 Intel Iris 通用掩蔽值被身份脚本覆盖) */
  gpu?: { vendor: string; renderer: string }
}

// ---------- 指纹池 ----------
/** 桌面常见分辨率池 */
const DESKTOP_SIZES: Array<[number, number]> = [
  [1366, 768], [1440, 900], [1536, 864], [1600, 900], [1920, 1080], [2560, 1440],
]
/** 移动端常见分辨率池(逻辑像素) */
const MOBILE_SIZES: Array<[number, number]> = [
  [390, 844], [393, 852], [414, 896], [360, 800], [412, 915],
]
/** 与视口类别匹配的精简 UA 池(hh-d2: Chrome 137~140, 与 fetcher UA_POOL(ff 轮 http 链)同版本纪律。
 *  收窄为 Chromium 家族: 本引擎即 Chromium, Safari/Firefox UA 与之结构性不自洽
 *  (真 Safari 无 window.chrome/userAgentData/sec-ch-ua, 引擎侧无法完整伪装出该语义);
 *  HTTP 链池(ff UA_POOL)仍保留 Safari/Firefox 条目 —— 纯头组语义无 JS 配对面, 两者不冲突 */
const DESKTOP_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  // E4: Edge UA 池 —— parseUaIdentity 已支持 Edge 品牌(brands 末追加 Microsoft Edge + Edg/ 版本),
  // 但原 UA 池无 Edge 条目, Edge 分支代码长期未实际执行; 加入 2 条 Windows/macOS Edge UA
  // 让 Edge brand 逻辑被实际路径覆盖(2-fetcher fingerprintHeadersFor 同步识别并加 sec-ch-ua-full-version-list)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
]
const MOBILE_UAS = [
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; U; Android 13; zh-cn; M2102J2SC Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/137.0.0.0 Mobile Safari/537.36',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
/** [R9-b-3] 简单字符串哈希(DJB2 32位, 无依赖) —— UA → 确定性硬件缺省值 */
function hashUa32(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h >>> 0
}
function jitter(n: number, max: number): number {
  const d = Math.floor(Math.random() * (max * 2 + 1)) - max
  return Math.max(1, n + d)
}

/** UA 移动性判定(与 fetcher.isMobileUa 同语义; obscura 禁止反向 import fetcher 防循环依赖, 本地复制) */
export function isMobileUaLocal(ua: string): boolean {
  return /iPhone|iPad|Android|Mobile Safari|;\s*Mobile\//.test(ua)
}

/** 随机生成一份浏览器指纹(桌面/移动池 + 小幅抖动)
 *  hh-d2: 传入 UA 覆盖时移动性按 UA 派生(原先纯随机 22% —— Android UA 可能拿到桌面视口/
 *  无触屏 context, sec-ch-ua-mobile ?1 配 maxTouchPoints=0 自相矛盾, 探针实证暴露)
 *  E3: locale/timezone/deviceScaleFactor 加权池 —— 原实现 locale/timezone 恒 zh-CN/Asia/Shanghai,
 *  deviceScaleFactor 仅桌面 1/2 二值+移动 1/2 二值, 与真机分布偏离(creepjs 类检测会聚成同一指纹面);
 *  引入 zh-TW/en-US/en-GB 少量配比(总权重 ≤30%, 主流仍中文), deviceScaleFactor 加入 1.25/1.5
 *  高分屏常见值, 桌面 1 仍占多数(60%), 移动以 2/3 为主, 1.5 次之 */
// E3: locale/timezone 加权配对池 —— 与 Accept-Language 头组(newStealthContext 动态构造)及
// 静态脚本 4(per-context 动态 init 覆盖)三方对齐
const LOCALE_POOL: Array<{ locale: string; timezone: string; weight: number }> = [
  { locale: 'zh-CN', timezone: 'Asia/Shanghai', weight: 70 },
  { locale: 'zh-TW', timezone: 'Asia/Taipei', weight: 12 },
  { locale: 'en-US', timezone: 'America/New_York', weight: 12 },
  { locale: 'en-GB', timezone: 'Europe/London', weight: 6 },
]
function pickLocale(): { locale: string; timezone: string } {
  const total = LOCALE_POOL.reduce((s, e) => s + e.weight, 0)
  let r = Math.random() * total
  for (const e of LOCALE_POOL) {
    if (r < e.weight) return { locale: e.locale, timezone: e.timezone }
    r -= e.weight
  }
  return { locale: 'zh-CN', timezone: 'Asia/Shanghai' }
}
// E3: deviceScaleFactor 桌面加权池 —— 1 占多数(普通显示器), 1.25/1.5 高分屏常见, 2 Retina
function pickDesktopDsf(): number {
  const r = Math.random()
  if (r < 0.6) return 1
  if (r < 0.7) return 1.25
  if (r < 0.85) return 1.5
  return 2
}
// E3: deviceScaleFactor 移动加权池 —— 2/3 为主流手机, 1.5 次之, 1 少量低端机
function pickMobileDsf(): number {
  const r = Math.random()
  if (r < 0.1) return 1
  if (r < 0.25) return 1.5
  if (r < 0.85) return 2
  return 3
}

// [R9-b-3] 硬件指纹加权池 —— hardwareConcurrency 8 核为主流, deviceMemory 按 W3C 规范
// 封顶 8(旧静态脚本恒 8 亦可, 但与核数组合单一化; 此处引入少量 4/2 低配机形态)
const CORES_POOL = [4, 6, 8, 8, 8, 10, 12, 16]
const DEVICE_MEM_POOL = [8, 8, 8, 8, 8, 4, 4, 2]

/** [R9-b-4] 从 UA 推导平台(与 parseUaIdentity 的 os 分支同构, 本地复制避免先解析整份身份) */
function uaOsOf(ua: string): UaIdentity['os'] {
  return /Android/.test(ua) ? 'android' : /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Windows/.test(ua) ? 'windows' : /Mac OS|Macintosh/.test(ua) ? 'macos' : /X11|Linux|CrOS/.test(ua) ? 'linux' : 'other'
}

export function randomFingerprint(overrides?: { userAgent?: string }): ObscuraFingerprint {
  const mobile = overrides?.userAgent ? isMobileUaLocal(overrides.userAgent) : Math.random() < 0.22
  const { locale, timezone } = pickLocale()
  if (mobile) {
    const [w, h] = pick(MOBILE_SIZES)
    const ua = overrides?.userAgent || pick(MOBILE_UAS)
    const os = uaOsOf(ua)
    return {
      viewport: { width: w, height: h },
      userAgent: ua,
      locale,
      timezoneId: timezone,
      colorScheme: 'light',
      deviceScaleFactor: pickMobileDsf(),
      mobile: true,
      // [R9-b-3/4] 硬件指纹 + GPU 池化(移动分支按 UA 平台取池)
      hardwareConcurrency: pick(CORES_POOL),
      deviceMemory: pick(DEVICE_MEM_POOL),
      gpu: pick(GPU_POOLS[os] || GPU_POOLS.other),
    }
  }
  const [w, h] = pick(DESKTOP_SIZES)
  const ua = overrides?.userAgent || pick(DESKTOP_UAS)
  const os = uaOsOf(ua)
  return {
    viewport: { width: jitter(w, 8), height: jitter(h, 8) },
    userAgent: ua,
    locale,
    timezoneId: timezone,
    colorScheme: 'light',
    deviceScaleFactor: pickDesktopDsf(),
    mobile: false,
    hardwareConcurrency: pick(CORES_POOL),
    deviceMemory: pick(DEVICE_MEM_POOL),
    gpu: pick(GPU_POOLS[os] || GPU_POOLS.other),
  }
}

/** E3: 按 fp.locale 派生 Accept-Language 头 —— 与 newContext(locale)(影响 navigator.language 与
 *  默认 Accept-Language) 及 per-context 动态 init 脚本(覆盖 navigator.language/languages)三方对齐 */
function acceptLanguageFor(locale: string): string {
  if (locale.startsWith('zh-CN')) return 'zh-CN,zh;q=0.9,en;q=0.6'
  if (locale.startsWith('zh-TW')) return 'zh-TW,zh;q=0.9,en;q=0.6'
  if (locale.startsWith('en-US')) return 'en-US,en;q=0.9,zh;q=0.6'
  if (locale.startsWith('en-GB')) return 'en-GB,en;q=0.9,zh;q=0.6'
  return 'zh-CN,zh;q=0.9,en;q=0.6'
}

// ---------- UA 身份解析 + 参数化身份脚本(hh-d2 增强) ----------
// 目标: 同一 UA 下 navigator.userAgent/appVersion/platform/vendor/userAgentData(含高熵值)/
// window.chrome 有无/WebGL GPU 字符串/maxTouchPoints 全部自洽 —— 与 ff 轮 http 链指纹头组
// (fingerprintHeadersFor)同一套版本纪律: brands 版本 == UA Chrome 版本, Edge UA 必含 Edge 品牌,
// 移动 UA 必配 mobile:true + Android 平台。
type UaFamily = 'chromium' | 'safari' | 'firefox' | 'unknown'
interface UaIdentity {
  ua: string
  family: UaFamily
  os: 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'other'
  mobile: boolean
  chromeVer: string
  edgeVer: string
  fullVersion: string
  navPlatform: string
  chPlatform: string
  vendor: string
  model: string
  platformVersion: string
  architecture: string
  bitness: string
  brands: Array<{ brand: string; version: string }>
  fullVersionList: Array<{ brand: string; version: string }>
  gpu: { vendor: string; renderer: string }
  /** [R9-b-3] 硬件指纹确定性缺省(UA 哈希派生; 指纹池可经 buildIdentityInitScript extra 覆盖) */
  cores: number
  deviceMemory: number
  /** [R9-b-5] 屏幕/窗口几何(仅指纹池路径注入; UA-only 解析路径缺省 undefined → 脚本跳过) */
  screen?: { width: number; height: number; availWidth: number; availHeight: number; x: number; y: number }
}

/** WebGL UNMASKED vendor/renderer 按 UA 平台取真实形态字符串(无 SwiftShader/Mesa 软渲染字样);
 *  原静态脚本统一掩蔽为 Intel Iris(macOS 形态) —— Windows/Linux/Android UA 下 GPU 字符串
 *  与平台矛盾本身即指纹(creepjs 类检测), hh-d2 改为按平台自洽 */
export const GPU_BY_OS: Record<UaIdentity['os'], { vendor: string; renderer: string }> = {
  windows: { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E9B) Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  macos: { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)' },
  linux: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060/PCIe/SSE2, OpenGL 4.6.0 NVIDIA 530.41.03)' },
  android: { vendor: 'Google Inc. (Qualcomm)', renderer: 'ANGLE (Qualcomm, Adreno (TM) 740, OpenGL ES 3.2)' },
  ios: { vendor: 'Apple Inc.', renderer: 'Apple GPU' },
  other: { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E9B) Direct3D11 vs_5_0 ps_5_0, D3D11)' },
}

/** [R9-b-4] 增强: WebGL vendor/renderer 按平台池化 —— 原 GPU_BY_OS 每 OS 单一 GPU 字符串,
 *  同平台所有 context 聚成同一 renderer 指纹面(creepjs 类检测可聚簇); 扩为真实形态池
 *  (真实设备 ID 0x25xx/0x73FF/0x9A49 等 + 各 OS 原生 ANGLE 格式), 随机指纹从池中抽取,
 *  同 context 内稳定(fp.gpu 随指纹保存)。randomFingerprint 引用本表(声明提升: const 在
 *  模块顶层先于调用执行, randomFingerprint 仅运行时调用无 TDZ 问题) */
const GPU_POOLS: Record<UaIdentity['os'], Array<{ vendor: string; renderer: string }>> = {
  windows: [
    GPU_BY_OS.windows,
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6600 (0x000073FF) Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  ],
  macos: [
    GPU_BY_OS.macos,
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)' },
  ],
  linux: [
    GPU_BY_OS.linux,
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CML GT2), OpenGL 4.6)' },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 7900 XTX (radeonsi navi31 LLVM 17.0.6), OpenGL 4.6)' },
  ],
  android: [
    GPU_BY_OS.android,
    { vendor: 'Google Inc. (ARM)', renderer: 'ANGLE (ARM, Mali-G715-MC11, OpenGL ES 3.2)' },
  ],
  ios: [GPU_BY_OS.ios],
  other: [GPU_BY_OS.other],
}

/** 从 UA 解析身份(brands 结构与 ff 轮 fingerprintHeadersFor 同构: Chromium/Google Chrome[/Edge]/Not:A-Brand) */
export function parseUaIdentity(ua: string): UaIdentity {
  const family: UaFamily = /Firefox\//.test(ua) ? 'firefox' : /Chrome\/|\bEdg\b/.test(ua) ? 'chromium' : /Safari\//.test(ua) ? 'safari' : 'unknown'
  const os: UaIdentity['os'] = /Android/.test(ua) ? 'android' : /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Windows/.test(ua) ? 'windows' : /Mac OS|Macintosh/.test(ua) ? 'macos' : /X11|Linux|CrOS/.test(ua) ? 'linux' : 'other'
  const mobile = isMobileUaLocal(ua)
  const chromeVer = ua.match(/Chrome\/(\d+)/)?.[1] || ''
  const edgeVer = ua.match(/Edg(?:e|A|iOS)?\/(\d+)/)?.[1] || ''
  const navPlatform = /Android/.test(ua) ? 'Linux armv8l' : /iPad/.test(ua) ? 'MacIntel' : /iPhone/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Win32' : /Mac OS|Macintosh/.test(ua) ? 'MacIntel' : 'Linux x86_64'
  const chPlatform = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'Chrome OS' : /X11|Linux/.test(ua) ? 'Linux' : 'Windows'
  // ii-c 修前缺陷: 旧正则 /Android[^;)]*[;)]\s*([^;)]+?)(?:\s+Build\/\S+)?\s*\)/ 只认
  // "Android <ver>; <model>"两段形态, 三段 UA(Linux; U; Android 13; zh-cn; M2102J2SC Build/…)
  // 在捕获前存在 locale 中间段 → 整体失配 model=''(探针实证), 与 UA 字符串内可见机型矛盾;
  // 改为允许任意个 "; 分隔中间段后取最后一个段为机型(每段不含 ;/), 分词无歧义无回溯风险
  const model = /Android/.test(ua) ? ((ua.match(/Android[^;)]*(?:;[^;)]+)*;\s*([^;)]+?)(?:\s+Build\/\S+)?\s*\)/)?.[1] || '').trim()) : ''
  const platformVersion = /Android/.test(ua) ? (ua.match(/Android\s+([\d.]+)/)?.[1] || '') : /iPhone|iPad|iPod/.test(ua) ? (ua.match(/OS\s+(\d+[._]\d+)/)?.[1]?.replace('_', '.') || '') : /Windows/.test(ua) ? '10.0.0' : /Mac OS|Macintosh/.test(ua) ? '10.15.7' : ''
  const fullVersion = chromeVer ? `${chromeVer}.0.0.0` : ''
  const brands: Array<{ brand: string; version: string }> = []
  const fullVersionList: Array<{ brand: string; version: string }> = []
  if (chromeVer) {
    brands.push({ brand: 'Chromium', version: chromeVer }, { brand: 'Google Chrome', version: chromeVer })
    fullVersionList.push({ brand: 'Chromium', version: fullVersion }, { brand: 'Google Chrome', version: fullVersion })
    if (edgeVer) {
      brands.push({ brand: 'Microsoft Edge', version: edgeVer })
      fullVersionList.push({ brand: 'Microsoft Edge', version: `${edgeVer}.0.0.0` })
    }
    brands.push({ brand: 'Not:A-Brand', version: '24' })
    fullVersionList.push({ brand: 'Not:A-Brand', version: '24.0.0.0' })
  }
  // [R9-b-3] 硬件指纹确定性缺省: 同 UA 恒定(跨 context 稳定), 不同 UA 哈希分散;
  // newStealthContext 会用 fp.hardwareConcurrency/deviceMemory 覆盖(指纹级变化)
  const uaHash = hashUa32(ua)
  return {
    ua,
    family,
    os,
    mobile,
    chromeVer,
    edgeVer,
    fullVersion,
    navPlatform,
    chPlatform,
    vendor: family === 'chromium' ? 'Google Inc.' : family === 'safari' ? 'Apple Computer, Inc.' : '',
    model,
    platformVersion,
    architecture: os === 'android' || os === 'ios' ? 'arm' : 'x86',
    bitness: '64',
    brands,
    fullVersionList,
    gpu: GPU_BY_OS[os],
    cores: CORES_POOL[uaHash % CORES_POOL.length],
    deviceMemory: DEVICE_MEM_POOL[(uaHash >>> 3) % DEVICE_MEM_POOL.length],
  }
}

/** CDP Network.setUserAgentOverride 的 userAgentMetadata(仅 Chromium 家族; 实验证据: 传入后
 *  引擎按 metadata 生成 sec-ch-ua/sec-ch-ua-mobile/sec-ch-ua-platform 头并原生填充 JS
 *  userAgentData —— route 改写实验(基线③)证明 route.continue 删不掉原生 CH 头, CDP 是唯一通路) */
export function buildUaMetadata(id: UaIdentity): Record<string, unknown> {
  return {
    brands: id.brands,
    fullVersionList: id.fullVersionList,
    fullVersion: id.fullVersion,
    mobile: id.mobile,
    platform: id.chPlatform,
    platformVersion: id.platformVersion,
    architecture: id.architecture,
    bitness: id.bitness,
    model: id.model,
    wow64: false,
  }
}

/**
 * 按 UA 参数化的身份脚本(附加在 STEALTH_INIT_SCRIPTS 之后注入, 每个 frame 文档创建前执行):
 *  - UA/appVersion/platform/vendor/productSub 钉到身份值
 *  - Chromium 家族: navigator.userAgentData(brands/mobile/platform + getHighEntropyValues 全量高熵)
 *  - 非 Chromium(Safari/Firefox 语义): userAgentData 整体摘除(own+原型链 delete,
 *    in 判定与真 Safari 同为 false; 原型槽不可删时退回 own undefined 遮蔽)+ window.chrome 删除
 *    (真引擎无此物)
 *  - maxTouchPoints: 移动 5 / 桌面 0(与 context hasTouch 自洽; 原静态脚本强制 0 会与移动 UA 矛盾)
 *  - WebGL vendor/renderer 按 UA 平台自洽(覆盖静态脚本的通用掩蔽值)
 *  - [R9-b-3] hardwareConcurrency/deviceMemory 按身份钉死(静态脚本 5 每 document 随机, 跨文档
 *    漂移即指纹; 本脚本后注册覆盖为 context 稳定值)
 *  - [R9-b-5] 屏幕/窗口几何自洽(传入 extra.screen 时): window.screen.width/height/avail* +
 *    outerWidth/outerHeight + screenX/Y/Left/Top 与视口一致 —— headless 下 --window-size 固定
 *    1366x900 而 viewport 随机, innerWidth > outerWidth 在真机不可能出现, 是探针可检的自相矛盾
 * 注: 必须在静态脚本之后注册 —— 覆盖其 UA/maxTouchPoints/WebGL/硬件/窗口位置定义, 并在 Safari 分支
 * 抹掉静态脚本伪造的 window.chrome(原静态脚本 9 会在 DOMContentLoaded 把父页 chrome 重新
 * 挂进 iframe, 已随本增强移除, iframe 一致性改由 per-frame 身份脚本原生保证)
 */
export function buildIdentityInitScript(
  ua: string,
  extra?: {
    cores?: number
    deviceMemory?: number
    gpu?: { vendor: string; renderer: string }
    screen?: { width: number; height: number; availWidth: number; availHeight: number; x: number; y: number }
  },
): string {
  const id = parseUaIdentity(ua)
  // [R9-b-3/4/5] 指纹池覆盖项合入身份(extra 缺省时用 parseUaIdentity 的确定性缺省)
  if (extra?.cores) id.cores = extra.cores
  if (extra?.deviceMemory) id.deviceMemory = extra.deviceMemory
  if (extra?.gpu) id.gpu = extra.gpu
  if (extra?.screen) id.screen = extra.screen
  return '(function () {\n' +
    '  try {\n' +
    `    var I = ${JSON.stringify(id)};\n` +
    '    var nav = navigator;\n' +
    '    function def(obj, key, getter) { try { Object.defineProperty(obj, key, { get: getter, configurable: true }); } catch (e) {} }\n' +
    '    var appVersion = String(I.ua).replace(/^Mozilla\\//, \'\');\n' +
    "    def(nav, 'userAgent', function () { return I.ua; });\n" +
    "    def(nav, 'appVersion', function () { return appVersion; });\n" +
    "    def(nav, 'platform', function () { return I.navPlatform; });\n" +
    "    def(nav, 'vendor', function () { return I.vendor; });\n" +
    "    def(nav, 'vendorSub', function () { return ''; });\n" +
    "    def(nav, 'productSub', function () { return I.family === 'firefox' ? '20100101' : '20030107'; });\n" +
    "    def(nav, 'maxTouchPoints', function () { return I.mobile ? 5 : 0; });\n" +
    "    def(nav, 'hardwareConcurrency', function () { return I.cores; });\n" +
    "    def(nav, 'deviceMemory', function () { return I.deviceMemory; });\n" +
    "    if (I.family === 'chromium') {\n" +
    '      var uad = {\n' +
    '        brands: I.brands.map(function (b) { return { brand: b.brand, version: b.version }; }),\n' +
    '        mobile: I.mobile,\n' +
    '        platform: I.chPlatform,\n' +
    '        toJSON: function () { return { brands: this.brands, mobile: this.mobile, platform: this.platform }; },\n' +
    '        getHighEntropyValues: function (hints) {\n' +
    '          return Promise.resolve().then(function () {\n' +
    '            var all = {\n' +
    '              architecture: I.architecture,\n' +
    '              bitness: I.bitness,\n' +
    '              model: I.model,\n' +
    '              mobile: I.mobile,\n' +
    '              platform: I.chPlatform,\n' +
    '              platformVersion: I.platformVersion,\n' +
    '              uaFullVersion: I.fullVersion,\n' +
    '              fullVersionList: I.fullVersionList.map(function (b) { return { brand: b.brand, version: b.version }; }),\n' +
    '              wow64: false,\n' +
    "              formFactors: [I.mobile ? 'Mobile' : 'Desktop']\n" +
    '            };\n' +
    '            var out = {};\n' +
    '            (hints || []).forEach(function (h) { if (Object.prototype.hasOwnProperty.call(all, h)) out[h] = all[h]; });\n' +
    '            return out;\n' +
    '          });\n' +
    '        }\n' +
    '      };\n' +
    "      def(nav, 'userAgentData', function () { return uad; });\n" +
    '    } else {\n' +
    // ii-c 修前残留: 仅 own delete + own undefined 遮蔽 —— Chromium 引擎下 userAgentData 若挂
    // 在 Navigator.prototype(own delete 删不掉原型槽), 探针实证 'userAgentData' in navigator
    // 恒 true(真 Safari: false, 值 undefined 但 in=false)反成特征。改为 own+原型链逐层 delete,
    // 全部删净则不落任何 own 属性(in=false 与真 Safari 一致); 原型槽不可配置删不掉时才退回
    // own undefined 遮蔽(旧行为兜底)
    '      try { delete nav.userAgentData; } catch (e) {}\n' +
    '      try {\n' +
    '        var up = Object.getPrototypeOf(nav);\n' +
    '        var uh = 0;\n' +
    '        while (up && uh < 4) {\n' +
    "          if (Object.prototype.hasOwnProperty.call(up, 'userAgentData')) {\n" +
    '            try { delete up.userAgentData; } catch (e2) {}\n' +
    '          }\n' +
    '          up = Object.getPrototypeOf(up);\n' +
    '          uh++;\n' +
    '        }\n' +
    '      } catch (e) {}\n' +
    "      if ('userAgentData' in nav) def(nav, 'userAgentData', function () { return undefined; });\n" +
    '    }\n' +
    "    if (I.family !== 'chromium') {\n" +
    '      try { delete window.chrome; } catch (e) { try { window.chrome = undefined; } catch (e2) {} }\n' +
    '    }\n' +
    '    (function () {\n' +
    '      try {\n' +
    '        var vendor = I.gpu.vendor, renderer = I.gpu.renderer;\n' +
    '        var patch = function (proto) {\n' +
    '          if (!proto || !proto.getParameter) return;\n' +
    '          var orig = proto.getParameter;\n' +
    '          proto.getParameter = function (p) {\n' +
    '            try {\n' +
    '              if (p === 37445) return vendor;\n' +
    '              if (p === 37446) return renderer;\n' +
    '              if (p === 7936) return \'WebKit\';\n' +
    '              if (p === 7937) return \'WebKit WebGL\';\n' +
    '            } catch (e) {}\n' +
    '            return orig.call(this, p);\n' +
    '          };\n' +
    '        };\n' +
    '        if (window.WebGLRenderingContext) patch(window.WebGLRenderingContext.prototype);\n' +
    '        if (window.WebGL2RenderingContext) patch(window.WebGL2RenderingContext.prototype);\n' +
    '      } catch (e) {}\n' +
    '    })();\n' +
    // [R9-b-5] 屏幕/窗口几何自洽(仅 I.screen 存在即指纹池路径): screen 尺寸=视口(最大化全屏形),
    // 桌面 availHeight 减任务栏, outer=inner(headless 无 chrome UI), 窗口位置 per-context 稳定
    // (覆盖静态脚本 12 的每 document 随机 —— 跨文档窗口位置漂移同样是指纹)
    '    (function () {\n' +
    '      try {\n' +
    '        var sc = I.screen;\n' +
    '        if (sc && window.screen) {\n' +
    "          def(window.screen, 'width', function () { return sc.width; });\n" +
    "          def(window.screen, 'height', function () { return sc.height; });\n" +
    "          def(window.screen, 'availWidth', function () { return sc.availWidth; });\n" +
    "          def(window.screen, 'availHeight', function () { return sc.availHeight; });\n" +
    '        }\n' +
    "        def(window, 'outerWidth', function () { return sc ? sc.width : window.innerWidth; });\n" +
    "        def(window, 'outerHeight', function () { return sc ? sc.height : window.innerHeight; });\n" +
    "        def(window, 'screenX', function () { return sc ? sc.x : 0; });\n" +
    "        def(window, 'screenY', function () { return sc ? sc.y : 0; });\n" +
    "        def(window, 'screenLeft', function () { return sc ? sc.x : 0; });\n" +
    "        def(window, 'screenTop', function () { return sc ? sc.y : 0; });\n" +
    '      } catch (e) {}\n' +
    '    })();\n' +
    '  } catch (e) {}\n' +
    '})();'
}

// ---------- --stealth 注入脚本 ----------
// 每段脚本独立 try/catch 包裹, 任何一段异常都不影响页面正常运行。
// 说明: 脚本以字符串形式保存, 由 addInitScript 在每个文档(含 iframe)创建前执行。
export const STEALTH_INIT_SCRIPTS: string[] = [
  // 1. navigator.webdriver 抹平(hh-d2 重做): --disable-blink-features=AutomationControlled 下
  //    引擎原生即 real-Chrome 形态(prototype getter → false, 无 own 属性) —— 原方案
  //    "own 属性返回 undefined"反成特征('webdriver' in nav 为真但值 undefined, 真站
  //    bot.sannysoft.com "WebDriver (New)" 行实测标记 present/failed)。改为删 own 属性+
  //    兜底把 prototype 值钉 false(异常环境), 与真 Chrome 观测面逐点一致
  `(() => { try {
      const nav = navigator;
      try { delete nav.webdriver; } catch (e) {}
      try {
        let cur; try { cur = nav.webdriver; } catch (e) { cur = undefined; }
        if (cur !== false) {
          const proto = Object.getPrototypeOf(nav) || nav;
          Object.defineProperty(proto, 'webdriver', { get: function () { return false; }, configurable: true });
        }
      } catch (e) {}
      if ('webdriver' in window) { try { delete window.webdriver; } catch (e) {} }
    } catch (e) {} })();`,

  // 2. 伪 window.chrome 对象 (runtime/app/csi/loadTimes 细节)
  `(() => { try {
      if (window.chrome && window.chrome.runtime && window.chrome.app) return;
      const c = window.chrome || {};
      if (!c.app) {
        c.app = {
          isInstalled: false,
          InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
          RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
          getDetails: function () { return null; },
          installState: function () { return 'not_installed'; },
        };
      }
      if (!c.runtime) {
        c.runtime = {
          PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
          PlatformArch: { ARM: 'arm', ARM64: 'arm64', X86_32: 'x86-32', X86_64: 'x86-64', MIPS: 'mips', MIPS64: 'mips64' },
          PlatformNaclArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64', MIPS: 'mips', MIPS64: 'mips64' },
          RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
          OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
          OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
          connect: function () { return null; },
          sendMessage: function () {},
          id: undefined,
        };
      }
      if (!c.csi) {
        c.csi = function () { return { onloadT: Date.now(), startE: Date.now(), pageT: Math.floor(Math.random() * 3000) + 100 }; };
      }
      if (!c.loadTimes) {
        c.loadTimes = function () {
          const t = Date.now() / 1000;
          return { requestTime: t, startLoadTime: t, commitLoadTime: t, finishDocumentLoadTime: t, finishLoadTime: t, firstPaintTime: t, firstPaintAfterLoadTime: 0, navigationType: 'Other', wasFetchedViaSpdy: false, wasNpnNegotiated: true, npnNegotiatedProtocol: 'h2', wasAlternateProtocolAvailable: false, connectionInfo: 'h2' };
        };
      }
      window.chrome = c;
    } catch (e) {} })();`,

  // 3. navigator.plugins / mimeTypes 伪造 (PDF Viewer 等 5 项, 数组行为完整)
  `(() => { try {
      const nav = navigator;
      const data = [
        { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', type: 'application/pdf', suffixes: 'pdf' },
        { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', type: 'application/pdf', suffixes: 'pdf' },
        { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', type: 'application/pdf', suffixes: 'pdf' },
        { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', type: 'application/pdf', suffixes: 'pdf' },
        { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format', type: 'application/pdf', suffixes: 'pdf' },
      ];
      const mtEnabled = function () { return this.enabledPlugin != null; };
      const plugins = data.map(function (p) {
        const plugin = { name: p.name, filename: p.filename, description: p.description, length: 1 };
        const mime = { type: p.type, suffixes: p.suffixes, description: p.description, enabledPlugin: plugin };
        Object.defineProperty(mime, 'enabledPlugin', { get: function () { return plugin; }, configurable: true });
        Object.defineProperty(plugin, '0', { value: mime, enumerable: true, configurable: true });
        plugin.item = function (i) { return i === 0 ? mime : null; };
        plugin.namedItem = function (n) { return n === p.type ? mime : null; };
        return plugin;
      });
      const mimeTypes = plugins.map(function (plugin, i) { return plugins[i]['0']; });
      const makeCollection = function (list, nameKey) {
        const coll = { length: list.length };
        list.forEach(function (item, i) { Object.defineProperty(coll, String(i), { value: item, enumerable: true, configurable: true }); });
        coll.item = function (i) { return i >= 0 && i < list.length ? list[i] : null; };
        coll.namedItem = function (n) {
          for (let i = 0; i < list.length; i++) { if (list[i][nameKey] === n) return list[i]; }
          // hh-d2: plugins 集合按 MIME 名二次命中(application/pdf) —— 各 PDF 插件均只挂
          // application/pdf 一个 MIME, 检测面常以 MIME 名直接检索 plugins.namedItem
          if (nameKey === 'name') {
            for (let i = 0; i < list.length; i++) { const m = list[i]['0']; if (m && m.type === n) return list[i]; }
          }
          return null;
        };
        coll.refresh = function () {};
        // hh-d2: 挂原生原型使 instanceof 通过(bot.sannysoft.com "Plugins is of type PluginArray"
        // 行实测 failed) —— own 的 item/namedItem/refresh/Symbol.iterator 遮蔽原型方法, 不会触发
        // 原生方法的 Illegal invocation; 逐 frame init 脚本在真引擎无 PluginArray 接口时静默跳过
        try {
          if (nameKey === 'name' && window.PluginArray) Object.setPrototypeOf(coll, window.PluginArray.prototype);
          else if (nameKey === 'type' && window.MimeTypeArray) Object.setPrototypeOf(coll, window.MimeTypeArray.prototype);
        } catch (e) {}
        try { Object.defineProperty(coll, Symbol.iterator, { value: Array.prototype[Symbol.iterator], configurable: true }); } catch (e) {}
        return coll;
      };
      // qq-e: 集合按文档缓存一次 —— 原实现 getter 每次访问都 makeCollection 新建,
      // navigator.plugins !== navigator.plugins 恒 true(真浏览器返回同一 PluginArray
      // 对象), 访问稳定性本身即指纹面。首次访问构建, 之后返回同一对象(逐 document
      // 独立: init 脚本在每个 frame/文档创建前重跑, 缓存变量随之重置, 无跨文档泄漏)
      // qq-e2 修正: 本数组是【注入浏览器的原生 JS 字符串】, 不得写 TS 类型注解 ——
      // addInitScript 原样下发, 带 unknown 注解的 let 声明在浏览器是 SyntaxError,
      // 整段 plugins/mimeTypes 伪装脚本静默全灭(new Function 编译实证, probe4 O2)。
      // 保留缓存语义, 仅去注解(守卫断言见 verify-qq-e2-obscura):
      let pluginsColl = null
      let mimeColl = null
      Object.defineProperty(nav, 'plugins', { get: function () { if (!pluginsColl) pluginsColl = makeCollection(plugins, 'name'); return pluginsColl; }, configurable: true });
      Object.defineProperty(nav, 'mimeTypes', { get: function () { if (!mimeColl) mimeColl = makeCollection(mimeTypes, 'type'); return mimeColl; }, configurable: true });
      try { Object.defineProperty(nav, 'javaEnabled', { value: function () { return false; }, configurable: true }); } catch (e) {}
    } catch (e) {} })();`,

  // 4. navigator.languages 固定为中文环境
  `(() => { try {
      Object.defineProperty(navigator, 'languages', { get: function () { return ['zh-CN', 'zh', 'en']; }, configurable: true });
      Object.defineProperty(navigator, 'language', { get: function () { return 'zh-CN'; }, configurable: true });
    } catch (e) {} })();`,

  // 5. hardwareConcurrency(4~16核)/deviceMemory(8GB) 随机合理值
  `(() => { try {
      const cores = [4, 6, 8, 8, 10, 12, 16][Math.floor(Math.random() * 7)];
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: function () { return cores; }, configurable: true });
      Object.defineProperty(navigator, 'deviceMemory', { get: function () { return 8; }, configurable: true });
      try { Object.defineProperty(navigator, 'maxTouchPoints', { get: function () { return 0; }, configurable: true }); } catch (e) {}
    } catch (e) {} })();`,

  // 6. WebGL vendor/renderer 掩蔽 (UNMASKED_VENDOR_WEBGL=37445 / UNMASKED_RENDERER_WEBGL=37446)
  `(() => { try {
      const vendor = 'Intel Inc.';
      const renderer = 'Intel Iris OpenGL Engine';
      const patch = function (proto) {
        if (!proto) return;
        const orig = proto.getParameter;
        if (!orig) return;
        proto.getParameter = function (p) {
          try {
            if (p === 37445) return vendor;
            if (p === 37446) return renderer;
            if (p === 7936) return 'WebKit';              // VENDOR
            if (p === 7937) return 'WebKit WebGL';        // RENDERER
          } catch (e) {}
          return orig.call(this, p);
        };
      };
      if (window.WebGLRenderingContext) patch(window.WebGLRenderingContext.prototype);
      if (window.WebGL2RenderingContext) patch(window.WebGL2RenderingContext.prototype);
    } catch (e) {} })();`,

  // 7. canvas 指纹噪声 (toDataURL/toBlob/getImageData 注入不可见微扰动; 不破坏正常渲染)
  `(() => { try {
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      const addNoise = function (ctx, w, h) {
        try {
          if (!ctx || !w || !h || w * h > 4000000) return;
          const img = origGetImageData.call(ctx, 0, 0, w, h);
          const d = img.data;
          // 仅对 <0.1% 像素的 alpha 做 ±1 微扰, 视觉不可见但足以打乱哈希
          for (let i = 3; i < d.length; i += 4 * 128) {
            if (Math.random() < 0.35) d[i] = Math.max(0, Math.min(255, d[i] + (Math.random() < 0.5 ? 1 : -1)));
          }
          ctx.putImageData(img, 0, 0);
        } catch (e) {}
      };
      HTMLCanvasElement.prototype.toDataURL = function () {
        try { addNoise(this.getContext('2d'), this.width, this.height); } catch (e) {}
        return origToDataURL.apply(this, arguments);
      };
      HTMLCanvasElement.prototype.toBlob = function (cb) {
        try { addNoise(this.getContext('2d'), this.width, this.height); } catch (e) {}
        const rest = Array.prototype.slice.call(arguments, 1);
        return origToBlob.apply(this, [cb].concat(rest));
      };
      CanvasRenderingContext2D.prototype.getImageData = function () {
        const img = origGetImageData.apply(this, arguments);
        try {
          const d = img.data;
          for (let i = 3; i < d.length; i += 4 * 257) { if (d[i] > 0) d[i] = d[i] - 1; }
        } catch (e) {}
        return img;
      };
    } catch (e) {} })();`,

  // 8. permissions.query 对 notifications 恒返回 granted (headless 经典检测点)
  `(() => { try {
      const nav = navigator;
      if (!nav.permissions || !nav.permissions.query) return;
      const origQuery = nav.permissions.query.bind(nav.permissions);
      nav.permissions.query = function (parameters) {
        try {
          if (parameters && parameters.name === 'notifications') {
            return Promise.resolve({ state: 'granted', name: 'notifications', onchange: null });
          }
        } catch (e) {}
        return origQuery(parameters);
      };
      // hh-d2: Notification.permission 同步 granted —— 仅 query=granted 而 Notification.permission
      // 恒 denied 是自相矛盾的双暴露面(修前探针实证: query=granted Notification=denied)
      try {
        if (typeof Notification !== 'undefined') {
          Object.defineProperty(Notification, 'permission', { get: function () { return 'granted'; }, configurable: true });
        }
      } catch (e) {}
    } catch (e) {} })();`,

  // 9. [hh-d2 已移除] 原"同源 iframe 补挂 window.chrome"脚本 —— addInitScript 本就逐 frame
  //    执行(脚本 2 已在每 frame 造 chrome), 此脚本在 DOMContentLoaded 把父页 chrome 重新挂进
  //    iframe 反而破坏非 Chromium UA(Safari/Firefox 语义)下身份脚本删 chrome 后的一致性;
  //    iframe 指纹一致性改由 per-frame 身份脚本(buildIdentityInitScript)原生保证

  // 10. 屏蔽 HeadlessChrome 特征: UA/appVersion 中的 HeadlessChrome 字样替换为 Chrome
  `(() => { try {
      const fix = function (s) { return typeof s === 'string' ? s.replace(/HeadlessChrome/g, 'Chrome') : s; };
      const ua = fix(navigator.userAgent);
      const av = fix(navigator.appVersion);
      Object.defineProperty(navigator, 'userAgent', { get: function () { return ua; }, configurable: true });
      Object.defineProperty(navigator, 'appVersion', { get: function () { return av; }, configurable: true });
      if (navigator.vendor) {
        Object.defineProperty(navigator, 'vendor', { get: function () { return 'Google Inc.'; }, configurable: true });
      }
    } catch (e) {} })();`,

  // 11. navigator.connection / getBattery stub (E1) —— NetworkInformation 与 BatteryManager
  //     是真 Chrome 普遍存在的对象, headless 默认缺失即指纹面(creepjs 类检测会标 missing);
  //     effectiveType=4g/rtt=50/downlink=10 是中等带宽典型值, saveData=false 普遍;
  //     getBattery 返回 charging=true/level=1/chargingTime=0 模拟插电满电(桌面常态)
  `(() => { try {
      const nav = navigator;
      try {
        if (!nav.connection) {
          const conn = {
            effectiveType: '4g',
            rtt: 50,
            downlink: 10,
            saveData: false,
            type: 'wifi',
            onchange: null
          };
          try { Object.defineProperty(nav, 'connection', { get: function () { return conn; }, configurable: true }); } catch (e) {}
        }
      } catch (e) {}
      try {
        if (!nav.getBattery) {
          const bat = function () {
            return Promise.resolve({
              charging: true,
              chargingTime: 0,
              dischargingTime: Infinity,
              level: 1,
              onchargingchange: null,
              onchargingtimechange: null,
              ondischargingtimechange: null,
              onlevelchange: null
            });
          };
          try { Object.defineProperty(nav, 'getBattery', { value: bat, configurable: true, writable: true }); } catch (e) {}
        }
      } catch (e) {}
    } catch (e) {} })();`,

  // 12. window.screenX / screenY / screenLeft / screenTop (E1) —— 真浏览器窗口位置非零
  //     (用户拖动过), headless 默认 0,0 是特征面; 随机 0-100 模拟常规窗口位置
  `(() => { try {
      const x = Math.floor(Math.random() * 101);
      const y = Math.floor(Math.random() * 101);
      try { Object.defineProperty(window, 'screenX', { get: function () { return x; }, configurable: true }); } catch (e) {}
      try { Object.defineProperty(window, 'screenY', { get: function () { return y; }, configurable: true }); } catch (e) {}
      try { Object.defineProperty(window, 'screenLeft', { get: function () { return x; }, configurable: true }); } catch (e) {}
      try { Object.defineProperty(window, 'screenTop', { get: function () { return y; }, configurable: true }); } catch (e) {}
    } catch (e) {} })();`,
]

// ---------- 挑战特征识别 ----------
/** 强挑战特征(结构化标记, 一旦命中基本必是挑战页) */
const CHALLENGE_STRONG_MARKERS = [
  'just a moment', 'cf-browser-verification', 'cf_chl_', 'challenge-platform',
  'cf-chl', 'checking your browser', 'attention required', 'ddos-guard', 'challenge.js',
  'cf-turnstile',
  // Cloudflare 中文版 Turnstile 拦截页特征("请稍候…"标题 + 安全验证提示)
  '正在进行安全验证', '本网站使用安全服务',
  // 繁体变体(ixdzs 系"請稍等，正在進行安全驗證..."盾页), 与 fetcher.STRONG_BLOCK_MARKERS 对齐 ——
  // 原先 obscura 不识别繁体盾页, 挑战循环不等待直接把盾页当渲染结果返回给上层入库
  '正在進行安全驗證', '正在驗證瀏覽器', '正在验证浏览器', '安全驗證',
]
/** 软挑战特征(普通长页面正文中也可能出现, 需配合标题/长度守卫) */
const CHALLENGE_SOFT_MARKERS = [
  'captcha', '验证码', '人机验证', '安全验证', '滑动验证',
  '请开启javascript', 'enable javascript',
]

/** JS 跳转壳: 极短 + location 跳转脚本, 或 meta refresh 短页 */
export function isJsRedirectShell(html: string): boolean {
  const s = (html || '').trim()
  if (!s) return true
  const hasRedirect = /window\.location\s*[.[]|location\.href\s*=|location\.replace\s*\(|location\.assign\s*\(/.test(s)
  const hasRefresh = /http-equiv\s*=\s*["']?refresh/i.test(s)
  if (s.length < 1200 && hasRedirect) return true
  if (s.length < 1200 && hasRefresh) return true
  return false
}

function hasNormalTitle(html: string): boolean {
  const m = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i)
  if (!m) return false
  const t = m[1].trim().toLowerCase()
  if (t.length < 2) return false
  // 标题本身就是挑战提示的不算正常标题
  const bad = ['just a moment', 'attention required', 'access denied', 'forbidden', '请开启', '验证', '驗證', '请稍候', '请稍後']
  return !bad.some((k) => t.includes(k))
}

/** 浏览器侧挑战判定: 命中强特征 / 软特征且非"长+正常标题"页 / JS跳转壳 */
export function looksLikeChallenge(html: string): boolean {
  if (isJsRedirectShell(html)) return true
  const lower = (html || '').toLowerCase()
  // CF JS Detections 脚本(challenge-platform/scripts/jsd/main.js)是 Bot Management 下
  // 正常页面普遍内嵌的探测脚本 —— 页面有正常标题且足够长时不算挑战(否则真实内容页
  // 会误触发 40s 挑战等待循环后抛超时, 101kks 实测)
  const jsdBenign = lower.includes('challenge-platform/scripts/jsd') && lower.length >= 1200 && hasNormalTitle(html)
  if (!jsdBenign && CHALLENGE_STRONG_MARKERS.some((k) => lower.includes(k))) return true
  if (CHALLENGE_SOFT_MARKERS.some((k) => lower.includes(k))) {
    // 长且带正常标题的真实内容页, 不因正文/导航提及"验证码"等词误判
    if (lower.length >= 1200 && hasNormalTitle(html)) return false
    return true
  }
  return false
}

// ---------- 单例浏览器 + 页面池 ----------
interface PoolSlot {
  ctx: BrowserContext
  page: Page
  /** 槽位当前绑定的 origin */
  domain: string
  fp: ObscuraFingerprint
  busy: boolean
  /** hh-d2: 保活的 CDP 会话(Network.setUserAgentOverride 随会话存活), 随槽位 context 一起销毁 */
  cdp?: CDPSession | null
  /** E5: 最后一次释放(busy=false)的时间戳; 心跳回收线程据此判定 10min 未用即 close ctx 释放资源
   *  (槽位本身保留, 下次获取时 page.isClosed() 触发 recreateSlot 重建) */
  lastUsedAt: number
  /** R3-17: 连续重建失败计数 —— recreateSlot 失败时累加, 成功时清零。
   *  达 3 次后该槽位从 S.slots 移除, 避免持续重试占用 MAX_CONCURRENCY 名额 */
  consecutiveFailures?: number
  /** feat-cloak-anticrawler C/D: 指纹创建时间戳 + 派生 device ID(IMEI-like 15 位数字)。
   *  - fpCreatedAt 用于"30 分钟指纹轮换"判定: 老指纹视为长期跟踪目标, 强制 recreate 新指纹
   *    (UA/viewport/locale/timezone 全换, 击败"同源指纹长期跟踪"探针)。
   *  - deviceId 来自 fp 种子哈希, 同 fp 内稳定; recreate 换 fp 时同时换 deviceId。
   *    deviceId 注入到 navigator.userAgentData(brand 一项) + cookie(_devid=), 让浏览器
   *    看起来像一台真实设备, 跨页保持同一设备 ID(用户视角一致性) */
  fpCreatedAt?: number
  deviceId?: string
  /** [R9-b-7] 槽位所属代理出口(''=直连默认浏览器); 复用/重建时亲和匹配 */
  proxyKey?: string
}

/** chromium 启动参数: 防检测 + 容器环境兼容 */
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-infobars',
  '--window-size=1366,900',
  '--lang=zh-CN',
  // [R9-b-6] 增强: WebRTC 泄漏封堵 —— 禁止非代理 UDP + 隐藏本地 IP(mDNS 候选仍可, 但
  // 内网 RFC1918 地址不再进 SDP), 堵住 WebRTC.localIP 泄漏探针; 仅影响 WebRTC 面,
  // 纯 HTML 采集零影响
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
]

/** 页面池并发上限(可用 OBSCURA_CONCURRENCY 环境变量覆盖) */
const MAX_CONCURRENCY = (() => {
  const n = Number(process.env.OBSCURA_CONCURRENCY || '')
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2
})()
/** 空闲自动回收: 5 分钟无活动页面则关闭整个浏览器 */
const IDLE_CLOSE_MS = 5 * 60 * 1000
/** E5: 槽位级心跳回收阈值 —— 单个槽位 10 分钟未用即 close 其 ctx 释放浏览器侧资源
 *  (槽位本身保留在 S.slots 中, 下次获取时 page.isClosed() 触发 recreateSlot 重建)。
 *  补充 IDLE_CLOSE_MS(5min 全空闲关浏览器): 长任务持槽时, 其他空闲槽位仍可被回收,
 *  避免每槽位都常驻一个 BrowserContext 撑资源 */
const SLOT_IDLE_RECLAIM_MS = 10 * 60 * 1000
/** E5: 心跳回收扫描间隔 —— 60s 扫一次, 平衡回收及时性与 CPU 开销 */
const SLOT_RECLAIM_INTERVAL_MS = 60_000
/** 探测失败后的重试间隔(避免服务器长时间反复白等 launch) */
const PROBE_RETRY_MS = 60_000

// 全局单例状态 (挂到 globalThis, 防 Next dev 热更新多实例)
interface ObscuraGlobal {
  pwModule?: typeof import('playwright') | null
  browser?: Browser | null
  launchPromise?: Promise<Browser> | null
  /** [R9-b-7] per-proxy 独立浏览器实例表(key=proxy URL 原串) —— per-context 代理要求
   *  browser 级挂占位全局 proxy, 不能与直连浏览器混用; 按 proxy 分桶隔离 */
  proxyBrowsers: Map<string, { browser: Browser | null; launchPromise: Promise<Browser> | null }>
  slots: PoolSlot[]
  pendingCreates: number
  waiters: Array<() => void>
  /** [R9-b-8] 指纹学习表: host → 过盾成功指纹(同站复用, 学习行为); 仅进程内, 上限 200 LRU */
  fpWins: Map<string, { fp: ObscuraFingerprint; wins: number; ts: number }>
  idleTimer?: ReturnType<typeof setTimeout> | null
  /** E5: 槽位级心跳回收定时器(60s 扫描一次, 关闭 10min 未用的槽位 ctx) */
  reclaimTimer?: ReturnType<typeof setInterval> | null
  probeOk: boolean | null
  probeAt: number
  hooksRegistered: boolean
  /** R4-12: shutdownObscura 进行中标志 —— withObscuraPage 获取/重建槽位后须检查,
   *  命中即关闭自身 ctx 并抛错, 防止 recreateSlot 在 shutdownObscura 已 splice 全部槽位
   *  之后又创建新 ctx/page 写回已被释放的 slot 对象(orphan 泄漏 BrowserContext + Page) */
  shuttingDown?: boolean
}
const globalForObscura = globalThis as unknown as { __obscuraState?: ObscuraGlobal }
const S: ObscuraGlobal = globalForObscura.__obscuraState ?? {
  pwModule: null,
  browser: null,
  launchPromise: null,
  proxyBrowsers: new Map(),
  slots: [],
  pendingCreates: 0,
  waiters: [],
  fpWins: new Map(),
  idleTimer: null,
  reclaimTimer: null,
  probeOk: null,
  probeAt: 0,
  hooksRegistered: false,
}
globalForObscura.__obscuraState = S

function originOf(url: string): string {
  try { return new URL(url).origin } catch { return '' }
}

/** hh-d2: CDP Network.setUserAgentOverride(+userAgentMetadata) —— 网络层 sec-ch-ua* 头与原生 JS
 *  userAgentData 由 metadata 驱动(route 改写删不掉引擎原生 CH 头, CDP 是唯一通路, 实验证据
 *  tmp/hh-d/baseline.json experiments.cdpMetadata: headerApplied=true + jsBrandsOk=true)。
 *  chromium 家族带 metadata(brands==UA 版本/移动性/平台全自洽); 非 chromium 家族(Safari/Firefox
 *  语义)仅覆 UA 字符串, JS 面一致性由身份脚本负责。失败容忍: 会话建立失败不阻塞渲染(JS 面仍有身份脚本) */
export async function applyUaCdpOverride(page: Page, ua: string): Promise<CDPSession | null> {
  try {
    const cdp = await page.context().newCDPSession(page)
    const id = parseUaIdentity(ua)
    const params: Record<string, unknown> = { userAgent: ua, platform: id.navPlatform }
    if (id.family === 'chromium') params.userAgentMetadata = buildUaMetadata(id)
    await (cdp as unknown as { send(method: string, p?: Record<string, unknown>): Promise<unknown> }).send(
      'Network.setUserAgentOverride',
      params,
    )
    return cdp
  } catch {
    return null
  }
}

/** [R9-b-7] 清扫已无任何槽位引用的代理浏览器实例(excludeKey 除外 —— 当前正在创建的桶)。
 *  槽位总量被 MAX_CONCURRENCY 上限钉死, 故有槽位的代理桶天然有界; 本清扫只回收
 *  "代理不再被任何槽位使用”的孤儿实例, 防长任务轮换多代理时 chromium 进程累积 */
function sweepIdleProxyBrowsers(excludeKey: string): void {
  for (const [key, entry] of S.proxyBrowsers) {
    if (key === excludeKey) continue
    if (entry.launchPromise) continue // 创建中, 交给 launch 后自然写入 entry.browser
    const hasSlot = S.slots.some((s) => (s.proxyKey || '') === key)
    if (hasSlot) continue
    S.proxyBrowsers.delete(key)
    if (entry.browser) {
      const b = entry.browser
      void b.close().catch(() => { /* 已死则忽略 */ })
    }
  }
}

async function ensureBrowser(proxyKey = ''): Promise<Browser> {
  // [R9-b-1] 修复: shutdownObscura 进行中禁止(重)拉浏览器 —— 旧行为下排队等待者被唤醒后会走
  //  createSlot → ensureBrowser 把 S.browser=null 的实例重新 launch 出来, 与正在 await b.close()
  //  的 shutdown 流程并发: 轻则多起一个无人管理的 chromium 实例(慢泄漏), 重则把新建 ctx 写进
  //  已被 splice 的 slot(orphan)。统一在入口拦截, 抛错让调用方走降级链
  if (S.shuttingDown) throw new Error('Obscura: 浏览器正在关闭, 拒绝拉起新实例')
  // [R9-b-7] 代理浏览器分桶: per-context 代理要求 browser 级挂占位全局 proxy,
  // 故代理槽位隔离到独立实例, 互不影响直连浏览器
  if (proxyKey) {
    let entry = S.proxyBrowsers.get(proxyKey)
    if (!entry) {
      // [R9-b-7] 资源护栏: 开新代理浏览器前清扫"已无槽位引用"的旧代理实例 ——
      // 引擎侧轮换多代理时防 chromium 实例随代理组合数无界累积(每个实例都是独立进程)
      sweepIdleProxyBrowsers(proxyKey)
      entry = { browser: null, launchPromise: null }
      S.proxyBrowsers.set(proxyKey, entry)
    }
    if (entry.browser && entry.browser.isConnected()) return entry.browser
    if (entry.launchPromise) return entry.launchPromise
    entry.launchPromise = launchBrowser(proxyKey)
    try {
      entry.browser = await entry.launchPromise
      return entry.browser
    } finally {
      entry.launchPromise = null
    }
  }
  if (S.browser && S.browser.isConnected()) return S.browser
  if (S.launchPromise) return S.launchPromise
  S.launchPromise = launchBrowser('')
  try {
    return await S.launchPromise
  } finally {
    S.launchPromise = null
  }
}

/** [R9-b-7] 实际拉起一个 chromium 实例(proxyKey='' 为默认直连浏览器, 否则为代理占位浏览器)。
 *  代理浏览器实例同样需要 launch 级占位 proxy(Playwright 契约: 所有 context 覆盖代理后
 *  全局值永不使用, 可为任意串) —— newStealthContext 对每个 ctx 都显式覆盖真实代理 */
async function launchBrowser(proxyKey: string): Promise<Browser> {
  if (!S.pwModule) {
    // 惰性 import('playwright'): 避免未用浏览器引擎时加载 ~几十ms 的模块开销
    S.pwModule = await import('playwright')
  }
  // playwright 类型无 any 滥用: launch 参数全部字面量
  const b = await S.pwModule.chromium.launch({
    headless: true,
    args: LAUNCH_ARGS,
    ...(proxyKey ? { proxy: { server: 'http://per-context-placeholder' } } : {}),
  })
  // 浏览器重启(旧实例崩溃)时清空【同分桶】旧槽位, 避免持有已死 context
  // (仅清本桶: 代理浏览器崩溃不应连带销毁直连/其他代理的活槽位, 反之亦然)
  const stale = S.slots.filter((s) => (s.proxyKey || '') === proxyKey)
  for (const s of stale) {
    const idx = S.slots.indexOf(s)
    if (idx >= 0) S.slots.splice(idx, 1)
  }
  await Promise.allSettled(stale.map((s) => s.ctx.close().catch(() => {})))
  if (!proxyKey) {
    S.browser = b
    registerExitHooks()
    // E5: 启动心跳回收定时器(幂等: 已存在则直接返回); 浏览器实例生命周期内常驻,
    // shutdownObscura 时一并清理
    scheduleReclaim()
  }
  return b
}

/** [R9-b-7] 代理 URL → Playwright per-context proxy 参数(server/username/password)。
 *  与 fetcher.playwrightProxyParts 同语义(obscura 禁止反向 import fetcher, 本地复制) */
function parseProxyParts(proxy: string): { server: string; username?: string; password?: string } {
  try {
    const u = new URL(proxy)
    const server = `${u.protocol}//${u.host}`
    const username = u.username ? decodeURIComponent(u.username) : ''
    const password = u.password ? decodeURIComponent(u.password) : ''
    return {
      server,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
    }
  } catch {
    return { server: proxy }
  }
}

async function newStealthContext(fp: ObscuraFingerprint, proxyKey = ''): Promise<BrowserContext> {
  const browser = await ensureBrowser(proxyKey)
  const ctx = await browser.newContext({
    userAgent: fp.userAgent,
    viewport: fp.viewport,
    locale: fp.locale,
    timezoneId: fp.timezoneId,
    colorScheme: fp.colorScheme,
    deviceScaleFactor: fp.deviceScaleFactor,
    isMobile: fp.mobile,
    hasTouch: fp.mobile,
    // E3: Accept-Language 头按 fp.locale 动态构造(原硬编码 zh-CN 与随机 locale 池冲突)
    extraHTTPHeaders: { 'Accept-Language': acceptLanguageFor(fp.locale) },
    // [R9-b-5] 增强: 原生 screen 尺寸与视口一致(最大化/全屏形) —— 先在引擎层自洽,
    // 身份脚本再补 availHeight/outer/窗口位置等引擎层无选项的面
    screen: { width: fp.viewport.width, height: fp.viewport.height },
    // [R9-b-7] 增强: per-context 真实代理(browser 级挂的是占位串, 此处覆盖才生效)
    ...(proxyKey ? { proxy: parseProxyParts(proxyKey) } : {}),
  })
  for (const script of STEALTH_INIT_SCRIPTS) {
    await ctx.addInitScript(script)
  }
  // E3: per-context 动态 init 脚本 —— 静态脚本 4 硬编码 navigator.language='zh-CN' / languages=
  // ['zh-CN','zh','en'], 与随机 locale 池(zh-TW/en-US/en-GB)冲突会被探针暴露(语言不自洽);
  // 按 fp.locale 覆盖 navigator.language/languages, 与 newContext(locale)(Playwright 原生)+ 头组
  // 三方对齐。在静态脚本之后注册(覆盖其 zh-CN 定义), 在身份脚本之前注册(身份脚本不碰 language)
  const lang = fp.locale
  const langs = lang.startsWith('zh') ? [lang, 'zh', 'en'] : [lang, 'en', 'zh']
  await ctx.addInitScript(
    `(() => { try {
      Object.defineProperty(navigator, 'language', { get: function () { return ${JSON.stringify(lang)}; }, configurable: true });
      Object.defineProperty(navigator, 'languages', { get: function () { return ${JSON.stringify(langs)}; }, configurable: true });
    } catch (e) {} })();`,
  )
  // hh-d2: 按 UA 参数化的身份脚本 —— 必须在静态脚本之后注册(覆盖其 UA/platform/vendor/
  // maxTouchPoints/WebGL 定义), 使 JS 面与 UA 身份(含移动分支/Safari·Firefox 语义)逐 frame 自洽
  // [R9-b-3/4/5]: 硬件指纹/GPU 池/屏幕几何随指纹注入(context 级稳定)
  await ctx.addInitScript(
    buildIdentityInitScript(fp.userAgent, {
      ...(fp.hardwareConcurrency ? { cores: fp.hardwareConcurrency } : {}),
      ...(fp.deviceMemory ? { deviceMemory: fp.deviceMemory } : {}),
      ...(fp.gpu ? { gpu: fp.gpu } : {}),
      screen: {
        width: fp.viewport.width,
        height: fp.viewport.height,
        availWidth: fp.viewport.width,
        // 桌面任务栏扣除 48px(真实最大化窗口形态), 移动端全屏无任务栏
        availHeight: fp.mobile ? fp.viewport.height : Math.max(320, fp.viewport.height - 48),
        x: fp.mobile ? 0 : Math.floor(Math.random() * 30),
        y: fp.mobile ? 0 : Math.floor(Math.random() * 20),
      },
    }),
  )
  return ctx
}

/**
 * feat-cloak-anticrawler D: 从指纹种子派生稳定 device ID(IMEI-like 15 位数字)。
 *  同一 fp 内多次调用返回同 deviceId(跨页/跨请求一致, 模拟真实设备 ID);
 *  fp 重建时(fpCreatedAt 变)deviceId 随之变更, 实现长期跟踪对抗。
 *  使用 fp.userAgent + viewport + locale + timezoneId 作种子哈希, 简单 DJB2 实现(无依赖) */
function deriveDeviceId(fp: ObscuraFingerprint): string {
  const seedStr = `${fp.userAgent}|${fp.viewport.width}x${fp.viewport.height}|${fp.locale}|${fp.timezoneId}|${fp.deviceScaleFactor}|${fp.mobile ? 'm' : 'd'}`
  // DJB2 hash: 32 位 → 转为 10 位数字; 再拼前缀 '86' + 3 位随机补充凑够 15 位 IMEI 格式
  let h = 5381
  for (let i = 0; i < seedStr.length; i++) {
    h = ((h << 5) + h + seedStr.charCodeAt(i)) | 0
  }
  // 取绝对值的 32 位值, 然后转成 10 位数字 (mod 10^10)
  const hashNum = (h >>> 0) % 1_000_000_000
  const hashStr = String(hashNum).padStart(10, '0').slice(-10)
  // 前缀 86(中国 IMEI 区段) + 3 位 deviceId-内序号(基于 viewport width 派生, 同 fp 一致)
  const seq3 = String((fp.viewport.width * 7) % 1000).padStart(3, '0').slice(-3)
  // 15 位数字: '86' + seq3 + 10 位 hash = 15 位 IMEI-like
  return '86' + seq3 + hashStr.slice(0, 10)
}

/** feat-cloak-anticrawler D: 注入 device ID 到 navigator.userAgentData + cookie。
 *  - 在每 frame 创建时自动注册 _devid cookie(同源站点首次访问即带上, 模拟设备级追踪 ID)
 *  - 在 navigator.userAgentData.brands 末尾追加 DevID brand(供服务端审计关联同设备会话)
 *  [R9-b-2] 修复(默认关闭, OBSCURA_DEVID=1 显式开启): 本特性对反检测是【净伤害】——
 *  ① 真实 Chrome 的 brands 永远不会含 "DevID" 这种非标准品牌, 任何指纹探针逐 brand 检查
 *     即判定为伪装浏览器; ② 身份脚本/CDP userAgentMetadata 的 brands 不含 DevID, 而 JS 层
 *     getter 追加了 DevID —— sec-ch-ua 请求头组与 navigator.userAgentData.brands 不自洽,
 *     是自报家门级矛盾面。改为环境变量显式开启(保留服务端审计用途), 缺省零注入 */
const DEVID_ENABLED = process.env.OBSCURA_DEVID === '1'
function buildDeviceIdInitScript(deviceId: string): string {
  return `(() => { try {
    // _devid cookie: 同源站点首次访问即种, max-age 1 天(同设备 ID 的稳定窗口)
    if (document.cookie.indexOf('_devid=') === -1) {
      document.cookie = '_devid=${deviceId}; path=/; max-age=86400; SameSite=Lax';
    }
    // navigator.userAgentData.brands 末尾追加 DevID brand(chromium 家族才有 userAgentData)
    if (navigator.userAgentData && navigator.userAgentData.brands) {
      const origBrands = navigator.userAgentData.brands;
      // brands 是只读数组, 用 Proxy 拦截 toArray 追加 brand
      try {
        Object.defineProperty(navigator.userAgentData, 'brands', {
          get: function () {
            return origBrands.concat([{ brand: 'DevID', version: '${deviceId.slice(0, 4)}' }]);
          },
          configurable: true,
        });
      } catch (e) {}
    }
  } catch (e) {} })();`
}

async function createSlot(domain: string, fp: ObscuraFingerprint, proxyKey = ''): Promise<PoolSlot> {
  const ctx = await newStealthContext(fp, proxyKey)
  try {
    const page = await ctx.newPage()
    const cdp = await applyUaCdpOverride(page, fp.userAgent)
    // feat-cloak-anticrawler D: 派生 device ID + 注入 init 脚本(brand + cookie)
    // [R9-b-2]: 默认关闭(OBSCURA_DEVID=1 开启) —— 非标准 brand 是自报家门指纹面
    let deviceId: string | undefined
    if (DEVID_ENABLED) {
      deviceId = deriveDeviceId(fp)
      await ctx.addInitScript(buildDeviceIdInitScript(deviceId))
    }
    const slot: PoolSlot = {
      ctx, page, domain, fp, busy: true, cdp,
      lastUsedAt: Date.now(),
      fpCreatedAt: Date.now(),
      ...(deviceId ? { deviceId } : {}),
      proxyKey,
    }
    S.slots.push(slot)
    return slot
  } catch (e) {
    // 修复: newPage 失败时关闭已创建的 context, 防止每次失败泄漏一个空 context
    try { await ctx.close().catch(() => {}) } catch { /* ignore */ }
    throw e
  }
}

/** 就地重建槽位: 关旧 context → 建新 context/page, 槽位对象引用保持不变(仍在 S.slots 中)
 *  Bug4 修复(Task 4-a): 原实现先 `await slot.ctx.close()` 关旧 ctx, 再 `newStealthContext()` +
 *  `ctx.newPage()` + `applyUaCdpOverride()` 全部裸跑 —— 一旦 newPage/CDP 失败, 新建的 ctx 既
 *  没挂到 slot 又没 close, 每次失败泄漏一个空 BrowserContext(进程级浏览器资源, 累计会撑爆文件
 *  描述符/内存)。且 slot.ctx/page/cdp 仍是已关的旧引用, 调用方拿到的 page 一访问就抛
 *  "Target closed"。改为 try/catch 包裹 newPage+CDP, 失败时 await ctx.close() 回收新 ctx 再抛;
 *  slot 各字段不更新(保持旧已关 ctx 引用), 调用方 withObscuraPage 的 free.page.isClosed()
 *  会再次触发 recreateSlot 重建 —— 旧 ctx 已关被 recreateSlot 第一行 close().catch() 容错
 *  R3-17: consecutiveFailures 计数 —— 失败 3 次后认为该槽位"不可恢复"(chromium 进程异常/
 *  系统资源耗尽/page 损坏持续态), 把槽位从 S.slots 移除以缩减池容量, 避免持续重试占用
 *  MAX_CONCURRENCY 名额。同时触发 checkObscuraAvailable() 重探测: 若 chromium 整体不可用,
 *  probeOk 立即转 false, 后续请求直接走裸 Playwright 降级路径不再卡 obscura */
async function recreateSlot(slot: PoolSlot, domain: string, fp: ObscuraFingerprint, proxyKey = ''): Promise<void> {
  try { await slot.ctx.close().catch(() => {}) } catch { /* ignore */ }
  // [R9-b-7]: 重建可跨代理分桶(槽位亲和切换) —— newStealthContext 按 proxyKey 从对应浏览器建 ctx
  const ctx = await newStealthContext(fp, proxyKey)
  try {
    const page = await ctx.newPage()
    const cdp = await applyUaCdpOverride(page, fp.userAgent)
    // feat-cloak-anticrawler D: 派生 device ID + 注入 init 脚本(brand + cookie)
    // [R9-b-2]: 默认关闭(OBSCURA_DEVID=1 开启)
    let deviceId: string | undefined
    if (DEVID_ENABLED) {
      deviceId = deriveDeviceId(fp)
      await ctx.addInitScript(buildDeviceIdInitScript(deviceId))
    }
    slot.ctx = ctx
    slot.page = page
    slot.domain = domain
    slot.fp = fp
    slot.cdp = cdp
    slot.busy = true
    slot.lastUsedAt = Date.now()
    // feat-cloak-anticrawler C: 指纹创建时间戳重置(30 分钟轮换判定基准)
    slot.fpCreatedAt = Date.now()
    // [R9-b-2]: TS 精确可选属性写入(undefined 时删除旧值, 避免脏 deviceId 残留)
    if (deviceId) slot.deviceId = deviceId
    else delete slot.deviceId
    slot.proxyKey = proxyKey
    // R3-17: 重建成功 → 清零连续失败计数
    slot.consecutiveFailures = 0
  } catch (e) {
    // 新 ctx 已建但 newPage/CDP 失败: 关掉新 ctx 防泄漏, 旧 ctx 已关保持不变(下次获取时重建)
    await ctx.close().catch(() => {})
    // R3-17: 累计失败次数, 达阈值把槽位移出 S.slots 缩减池容量, 避免持续重试占用名额
    slot.consecutiveFailures = (slot.consecutiveFailures || 0) + 1
    if (slot.consecutiveFailures >= 3) {
      const idx = S.slots.indexOf(slot)
      if (idx >= 0) S.slots.splice(idx, 1)
      console.warn(`[obscura] recreateSlot 连续失败 ${slot.consecutiveFailures} 次, 移除该槽位缩减池容量(slots=${S.slots.length})`)
      // 触发重探测: 若 chromium 整体不可用, probeOk 转 false, 后续请求走降级路径
      S.probeOk = null
      S.probeAt = 0
    }
    throw e
  }
}

/**
 * feat-cloak-anticrawler C: 30 分钟指纹轮换阈值 —— 同域槽位若 fpCreatedAt 老于此阈值,
 * 视为"长期跟踪目标", 强制 recreate 新指纹(UA/viewport/locale/timezone 全换)。
 * 与 IDLE_CLOSE_MS(5min)/SLOT_IDLE_RECLAIM_MS(10min)独立: 后两者管"空闲资源回收",
 * 本阈值管"指纹新鲜度"。即使槽位每分钟都在被使用, 满 30min 仍会触发 recreate。
 * 防御长期爬虫被反爬指纹库锁定(同源同指纹跑数小时 → 探针标记为爬虫)。 */
const FINGERPRINT_ROTATE_MS = 30 * 60 * 1000

function resetIdleTimer(): void {
  if (S.idleTimer) clearTimeout(S.idleTimer)
  // unref: 不阻止 CLI/一次性脚本自然退出
  S.idleTimer = setTimeout(() => {
    S.idleTimer = null
    if (S.slots.length > 0 && S.slots.every((s) => !s.busy)) {
      void shutdownObscura()
    }
  }, IDLE_CLOSE_MS)
  if (typeof S.idleTimer.unref === 'function') S.idleTimer.unref()
}

/**
 * E5: 启动槽位级心跳回收定时器 —— 每 60s 扫描所有非 busy 槽位, 释放 10 分钟未用的 ctx
 *  (槽位本身保留在 S.slots 中, 下次获取时 free.page.isClosed()=true 触发 recreateSlot 重建)。
 *  补充 IDLE_CLOSE_MS(5min 全空闲关浏览器): 长任务持槽时其他空闲槽位仍可被回收,
 *  避免每槽位都常驻 BrowserContext 撑资源(每个 ctx 持独立进程内堆+CDP 会话+至少 1 page)。
 *  幂等: 已存在定时器则直接返回(防 ensureBrowser 多次调用累积定时器) */
function scheduleReclaim(): void {
  if (S.reclaimTimer) return
  S.reclaimTimer = setInterval(() => {
    const now = Date.now()
    for (const slot of S.slots) {
      // R8-9: busy 槽位 stuck-busy 检测 —— busy 持续 >5min 视为 page.goto 卡死
      // (Playwright 内部 deadlock / chromium crash), 强制 close page + ctx 释放资源,
      // 重置 busy=false 让该槽位可被下次 acquire 重建。仅靠"非 busy 才回收"会让 stuck 槽位
      // 永远占住 MAX_CONCURRENCY 名额, 全部 stuck 后 Obscura 引擎彻底死亡。
      if (slot.busy) {
        const lastUsed = slot.lastUsedAt || 0
        if (lastUsed && now - lastUsed > 5 * 60 * 1000) {
          console.warn(`[obscura] scheduleReclaim: busy 槽位 stuck>5min(domain=${slot.domain || '未知'}), 强制关闭释放资源`)
          try { if (slot.page && !slot.page.isClosed()) slot.page.close().catch(() => {}) } catch { /* 静默 */ }
          try { slot.ctx.close().catch(() => {}) } catch { /* 静默 */ }
          slot.busy = false
          slot.lastUsedAt = now
        }
        continue
      }
      if (!slot.lastUsedAt) continue
      if (now - slot.lastUsedAt < SLOT_IDLE_RECLAIM_MS) continue
      // 已关的 ctx 跳过(recreateSlot 失败/上次回收后未重建)
      try { if (slot.page && !slot.page.isClosed()) {
        // 主动 close ctx 释放浏览器侧资源; ctx.close 自动级联关闭其所有 page,
        // 槽位 page 引用随之失效, 下次 withObscuraPage 取槽时 free.page.isClosed()=true 触发 recreateSlot
        void slot.ctx.close().catch(() => {})
      } } catch { /* 静默 */ }
    }
  }, SLOT_RECLAIM_INTERVAL_MS)
  // unref: 不阻止 CLI/一次性脚本自然退出(浏览器常驻仅在长跑服务进程中有意义)
  if (typeof S.reclaimTimer.unref === 'function') S.reclaimTimer.unref()
}

/** 进程退出/信号时尽力回收浏览器 */
function registerExitHooks(): void {
  if (S.hooksRegistered || typeof process === 'undefined') return
  S.hooksRegistered = true
  try {
    process.once('exit', () => { void shutdownObscura() })
    process.once('SIGINT', () => { void shutdownObscura().finally(() => process.exit(0)) })
    process.once('SIGTERM', () => { void shutdownObscura().finally(() => process.exit(0)) })
  } catch { /* 某些运行时只读, 忽略 */ }
}

/** 唤醒一个排队中的等待者(信号量释放/容量空出/失败重试路径都要调, 防等待者饿死) */
function wakeNext(): void {
  const next = S.waiters.shift()
  if (next) next()
}

/**
 * 从页面池获取一个 stealth 页面执行 fn, 用完释放不销毁。
 * - 同域名复用槽位: 保留 cookie(挑战凭证) 与指纹
 * - 跨域名复用: 销毁重建 context + 新指纹, 做好 cookie 隔离(见文件头隔离说明)
 * - 池满时排队等待(信号量语义, 并发默认 2)
 */
// ---------- 点击助手(主 frame + 跨域 iframe 全遍历, gg) ----------
/**
 * gg: clickSelector 跨域 iframe 支持(dd-d 上报引擎缺口) ——
 * page.click 只作用于主 frame, Turnstile/hCaptcha 类"复选框在 challenges.cloudflare.com
 * 跨域 iframe 内"的挑战无法交互。Playwright 的 frame 抽象原生支持跨源 frame 定位:
 * 遍历 page.frames() 逐 frame 尝试点击(首 frame=主 frame, 与原 page.click 行为一致),
 * 任一命中即返回 true; 全部未命中(含主 frame 无该元素 —— 列表页/正文页常态)返回 false,
 * 调用方保持既有"找不到静默跳过"语义不变。
 * 总闸 9s + 最多 8 frame: 防多 iframe 页面最坏 3s×N 拖慢采集; 单 frame 超时默认 3000ms
 * (与原 page.click 超时一致)。如实记录: 真实 Turnstile 无法在本沙箱验证(域内 iframe
 * 从未物化, dd-d 留档), 本增强为能力面补齐(verify-gg-a-frameclick 同构 mock 实证)。
 */
export async function clickSelectorAnywhere(page: Page, selector: string, perFrameTimeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + 9000
  const frames = page.frames()
  for (let i = 0; i < frames.length && i < 8; i++) {
    const remain = deadline - Date.now()
    if (remain <= 200) break
    try {
      // count() 立即返回不等待: 该 frame 明确无此元素则零开销跳过
      // (不烧 perFrame 超时 —— 主 frame 无按钮时不再白等 3s)
      const cnt = await frames[i].locator(selector).count()
      if (cnt === 0) continue
      await frames[i].click(selector, { timeout: Math.min(perFrameTimeoutMs, remain) })
      return true
    } catch { /* 有元素但点击失败(被遮挡/不可点/竞态消失): 换下一个 */ }
  }
  return false
}

// ---------- 指纹学习(过盾成功指纹按站复用) ----------
/** [R9-b-8] 增强: 学习有效期 —— 指纹过盾成功后 2h 内同站复用(与 30min 轮换阈值独立:
 *  学到的"已验证可过盾"指纹优先于随机轮换, 过期后重新随机, 直到下一次成功重新学习);
 *  避免把已证明能过盾的指纹过早轮换掉(30min 轮换面向"随机新指纹"的跟踪对抗,
 *  本学习面向"已知可用指纹"的同站复用, 两者按 TTL 取平衡) */
const FP_WIN_TTL_MS = 2 * 60 * 60 * 1000
/** [R9-b-8] 学习表容量上限(防多站点爬取撑爆内存) */
const FP_WIN_MAX = 200

function hostnameOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase() } catch { return '' }
}

/** [R9-b-8] 选指纹: 同站存在未过期的"过盾成功"指纹且未指定 UA 覆盖时复用之(同站指纹稳定
 *  像回访老用户), 否则随机新指纹。学习指纹命中时 touch ts 作 LRU */
function pickFingerprint(host: string, uaOverride?: string): ObscuraFingerprint {
  if (host && !uaOverride) {
    const learned = S.fpWins.get(host)
    if (learned && Date.now() - learned.ts < FP_WIN_TTL_MS) {
      learned.ts = Date.now()
      return { ...learned.fp }
    }
  }
  return randomFingerprint({ userAgent: uaOverride })
}

/** [R9-b-8] 记录过盾成功: 渲染终态非挑战页时调用(挑战等待中通过也算 —— 指纹+会话组合已证明可过) */
function recordFpWin(host: string, fp: ObscuraFingerprint): void {
  if (!host) return
  const prev = S.fpWins.get(host)
  S.fpWins.set(host, { fp: { ...fp }, wins: (prev?.wins || 0) + 1, ts: Date.now() })
  if (S.fpWins.size > FP_WIN_MAX) {
    // LRU: 淘汰最久未命中的站点
    let oldestKey = ''
    let oldestTs = Infinity
    for (const [k, v] of S.fpWins) {
      if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k }
    }
    if (oldestKey) S.fpWins.delete(oldestKey)
  }
}

export async function withObscuraPage<T>(
  url: string,
  fn: (page: Page, ctx: BrowserContext, meta: { fp: ObscuraFingerprint; proxyKey: string }) => Promise<T>,
  opts: { userAgent?: string; proxy?: string } = {}
): Promise<T> {
  const domain = originOf(url)
  if (!domain) throw new Error(`Obscura: 无效 URL: ${url}`)
  const host = hostnameOf(url)
  // [R9-b-7]: 代理亲和键(''=直连) —— 同代理槽位复用/互不复用, 防代理出口与 cookie/指纹错配
  const proxyKey = opts.proxy || ''
  let slot: PoolSlot | null = null
  try {
    // 信号量获取
    for (;;) {
      // 修复: 优先复用同域空闲槽位 —— 原先 find(!busy) 拿到哪个算哪个, 两个空闲槽
      // 分属不同域时跨域请求会撞掉另一个域的 context(cookie/指纹被无谓销毁重建)
      // [R9-b-7]: 三级匹配: 同域+同代理(理想) → 同代理(换域重建 ctx) → 任意空闲(跨桶重建)
      const free = S.slots.find((s) => !s.busy && (s.proxyKey || '') === proxyKey && s.domain === domain && !s.page.isClosed())
        ?? S.slots.find((s) => !s.busy && (s.proxyKey || '') === proxyKey)
        ?? S.slots.find((s) => !s.busy)
      if (free) {
        free.busy = true // 先占位再异步重建, 防止并发抢占同一空槽
        // R4-12: shutdownObscura 已开始时(shuttingDown=true), 即使拿到 free 槽位也立即放弃:
        //  recreateSlot 内 newStealthContext 会因 S.browser=null 重新拉浏览器, 与 shutdownObscura
        //  正在 await b.close() 冲突, 拉起的新 ctx 会写回已被 splice 的 slot 对象(orphan)
        if (S.shuttingDown) {
          free.busy = false
          wakeNext()
          throw new Error('Obscura: 浏览器正在关闭, 请稍后重试')
        }
        // feat-cloak-anticrawler C: 30 分钟指纹轮换 —— 同域槽位若 fpCreatedAt 老于阈值,
        //  视为"长期跟踪目标", 强制 recreate 新指纹(UA/viewport/locale/timezone 全换)。
        //  与 page.isClosed() / domain 变化 的 recreate 路径同入口, 复用现有失败兜底链
        //  (consecutiveFailures 计数 + 重建失败唤醒等待者); fpCreatedAt 缺失(老槽位兼容)
        //  用 lastUsedAt 兜底(若也缺失则当前时间兜底 → 不触发轮换, 零回归)
        const fpAge = Date.now() - (free.fpCreatedAt ?? free.lastUsedAt ?? Date.now())
        const sameAffinity = free.domain === domain && (free.proxyKey || '') === proxyKey
        const needRotate = sameAffinity && !free.page.isClosed() && fpAge > FINGERPRINT_ROTATE_MS
        if (!sameAffinity || free.page.isClosed() || needRotate) {
          try {
            // [R9-b-8]: 重建时优先复用同站"过盾成功"指纹(学习行为), 无学习记录则随机
            await recreateSlot(free, domain, pickFingerprint(host, opts.userAgent), proxyKey)
          } catch (e) {
            free.busy = false // 重建失败归还槽位(旧 ctx 已关, 下次获取时会再次重建)
            // 修复: 失败路径也必须唤醒一个等待者, 否则排队的请求会永久饥饿挂起
            wakeNext()
            throw e
          }
        }
        // [R9-b-1] 修复: recreateSlot 期间 shutdownObscura 可能已启动(此前只覆盖 createSlot
        //  路径) —— recreate 完成后再次检查, 命中则关掉新建 ctx 并抛错, 防 fn 在已关浏览器上跑
        if (S.shuttingDown) {
          try { await free.ctx.close().catch(() => {}) } catch { /* ignore */ }
          free.busy = false
          wakeNext()
          throw new Error('Obscura: 浏览器正在关闭, 请稍后重试')
        }
        slot = free
        break
      }
      if (S.slots.length + S.pendingCreates < MAX_CONCURRENCY) {
        S.pendingCreates++
        try {
          // [R9-b-8]: 建槽时同站学习指纹优先(同站连续请求拿到同一身份, 像同一设备回访)
          slot = await createSlot(domain, pickFingerprint(host, opts.userAgent), proxyKey)
        } finally {
          S.pendingCreates--
          // 建槽失败时容量已释放, 唤醒一个等待者去重试(否则等待队列可能永久挂起)
          wakeNext()
        }
        // R4-12: createSlot 完成后再次检查 shuttingDown —— shutdownObscura 在 createSlot
        //  期间(splice 全部槽位)刚发生时, 新建的 slot 已不在 S.slots 中(被 splice 清掉),
        //  ctx/page 即将 orphan。手动关闭 ctx 并抛错, 不让 fn 在已关 ctx 上跑
        if (S.shuttingDown) {
          try { await slot.ctx.close().catch(() => {}) } catch { /* ignore */ }
          slot = null
          throw new Error('Obscura: 浏览器正在关闭, 请稍后重试')
        }
        break
      }
      // R3-16: 排队等待需有 30s 超时 —— 原实现 push(resolve) 后无超时, 槽位持有者若
      // 因 page.goto 卡死(timeout 未生效/无限等待 selector)永远不释放 busy, 排队者
      // 永远卡在 await new Promise 处, 调用方 gateFetch 也跟着卡死 → 整个 obscura 路径死锁。
      // 30s 超时后 reject 触发到 gateFetch 的 catch → 落 HTTP 引擎, 链路自愈。醒来后
      // 须从 waiters 数组中把自己摘掉(否则槽位释放时 wakeNext 调用空 resolve 不报错但浪费)
      //
      // R5-18: TDZ 兜底 —— 原 setTimeout 回调引用 `resolver`, 而 `const resolver` 在
      //  setTimeout 之后声明。30s 延时下 resolver 早已赋值, 但若未来为测试改成 0ms 延时
      //  或事件循环高压下同步 fire, 会触发 TDZ ReferenceError。先 let 声明占位, 再赋值。
      let resolver: (() => void) | null = null
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => {
          // 从 waiters 中移除自己(若仍存在), 防 wakeNext 调到已 reject 的 resolver
          if (resolver) {
            const idx = S.waiters.indexOf(resolver)
            if (idx >= 0) S.waiters.splice(idx, 1)
          }
          reject(new Error('obscura slot timeout(30s): 池满且所有槽位长期被占用'))
        }, 30_000)
        // R5-18: 用局部 const 包装, 让 waiters.push 拿到 () => void 而非可能为 null 的引用
        const r: () => void = () => {
          clearTimeout(t)
          resolve()
        }
        resolver = r
        S.waiters.push(r)
      })
    }
    resetIdleTimer()
    // [R9-b-8]: 向 fn 透传槽位指纹(供 renderStealth 学习"过盾成功指纹")
    return await fn(slot.page, slot.ctx, { fp: slot.fp, proxyKey: slot.proxyKey || '' })
  } finally {
    if (slot) {
      slot.busy = false
      // E5: 更新 lastUsedAt 供心跳回收定时器判定(10min 未用即 close ctx 释放资源)
      slot.lastUsedAt = Date.now()
      wakeNext()
      resetIdleTimer()
    }
  }
}

// ---------- 可用性探测 ----------
/**
 * 探测 Obscura 是否可用(成功后浏览器实例保留为单例直接复用, 不浪费 launch)。
 * 失败结果缓存 PROBE_RETRY_MS, 之后允许重新探测(例如 chromium 后装场景)。
 */
export async function checkObscuraAvailable(): Promise<boolean> {
  if (S.probeOk === true && S.browser && S.browser.isConnected()) return true
  if (S.probeOk === false && Date.now() - S.probeAt < PROBE_RETRY_MS) return false
  try {
    const b = await ensureBrowser()
    S.probeOk = b.isConnected()
  } catch (e: unknown) {
    // any 规避: 统一取 message 即可
    const msg = (e as { message?: string })?.message
    console.warn('[obscura] chromium 不可用:', (msg || String(e)).slice(0, 120))
    S.probeOk = false
  }
  S.probeAt = Date.now()
  return S.probeOk
}

// ---------- 挑战自动等待渲染 ----------
/**
 * E2: 检测 CF 挑战 UI 元素是否仍可见 —— 配合 looksLikeChallenge(HTML 内容关键词判定)
 * 双重校验, 避免仅靠 HTML 误判(JS Detections 脚本内嵌但 UI 已消失的过渡态会被关键词
 * 持续命中, 白白耗满 challengeWaitMs)。判定为"挑战仍在进行"的充分条件: ① URL 仍在
 * /cdn-cgi/challenge 路径; ② 任意挑战 UI 元素(#challenge-running / #challenge-form /
 * .cf-turnstile / challenges.cloudflare.com iframe)仍在 DOM 中存在 */
async function isChallengeUIVisible(page: Page): Promise<boolean> {
  // URL 仍在 /cdn-cgi/challenge 路径 → 挑战进行中(CF 验证页固定路径)
  try {
    if (/\/cdn-cgi\/challenge/.test(page.url())) return true
  } catch {
    // R8-17: page 已销毁(TargetClosedError) → 不视为挑战进行中, 让上层轮询提前退出,
    // 避免在死页面上空耗 challengeWaitMs(40s); 旧实现返回 true 导致死页 40s 全程被等
    return false
  }
  // 任意挑战 UI 元素仍存在 → 挑战进行中
  const selectors = [
    '#challenge-running',
    '#challenge-form',
    '.cf-turnstile',
    'iframe[src*="challenges.cloudflare.com"]',
  ]
  for (const sel of selectors) {
    try {
      const cnt = await page.locator(sel).count()
      if (cnt > 0) return true
    } catch {
      // R8-17: locator 失败(页死/TargetClosedError/Page.closed) → 不视为挑战进行中,
      // 让上层提前退出挑战等待循环(返回 false 即可让 uiGone=true, 提前 break loop)
      return false
    }
  }
  return false
}

/**
 * E2: 尝试点击 Cloudflare Turnstile 复选框(interactive 模式需要用户点击才能继续验证)。
 *  managed / non-interactive 模式 checkbox 不存在, count()=0 静默跳过; 跨域 iframe 内的
 *  checkbox 由 Playwright 的 frame 抽象跨源访问(与 clickSelectorAnywhere 同语义, gg)。
 *  主 frame 用 .cf-turnstile 限定选择器(防误点站内常规 checkbox); CF 跨域 iframe 内通常
 *  仅有一个 input[type=checkbox](即 Turnstile widget), 用通用选择器无歧义命中 */
async function tryClickTurnstile(page: Page): Promise<void> {
  // R4-13: 整体 8s 截止时间 —— 旧行为只对单 frame click 设 1500ms 超时, 但 8 个 frame
  //  最坏情况 12s, 多次调用累计接近 challengeWaitMs 40s, 浪费在 hopeless 页面上
  const deadline = Date.now() + 8000
  const frames = page.frames()
  for (let i = 0; i < frames.length && i < 8; i++) {
    if (Date.now() >= deadline) return // 整体预算耗尽, 剩余 frame 跳过(留时间给上层循环复查)
    let frameUrl = ''
    try { frameUrl = frames[i].url() || '' } catch {}
    const isCfFrame = /challenges\.cloudflare\.com|cdn-cgi\/challenge-platform/.test(frameUrl)
    // 主 frame 用 .cf-turnstile 限定(避免误点站内常规 checkbox);
    // CF 跨域 iframe 内用 input[type=checkbox](iframe 内通常仅 Turnstile 复选框)
    const sel = isCfFrame ? 'input[type=checkbox]' : '.cf-turnstile input[type=checkbox]'
    // 单 frame click 超时不得超出整体剩余预算(避免单次 click 用尽 1500ms 后整体超 8s)
    const remaining = Math.max(200, deadline - Date.now())
    try {
      const cnt = await frames[i].locator(sel).count()
      if (cnt === 0) continue
      await frames[i].click(sel, { timeout: Math.min(1500, remaining) })
      return
    } catch { /* 静默: 元素消失/被遮挡/不可点 — 换下一个 frame */ }
  }
}

/**
 * --stealth 模式渲染:
 * 1. goto(domcontentloaded) → 读 content
 * 2. 命中挑战特征 → 每 1~3s 轮询 content+url+UI, 最多 challengeWaitMs(默认 40s), 通过即止
 *    E2 增强: ① 1-3s 人类延迟 + Turnstile 复选框点击(interactive 模式需用户交互)
 *           ② 结构化消失判定(#challenge-running/.cf-turnstile 等元素消失 + URL 不含 /cdn-cgi/challenge)
 *           ③ 超时不再抛错 —— 返回当前页面状态, 由 fetcher.looksBlocked 检测并降级;
 *              obscura 期间拿到的 cf_clearance 等 cookie 仍会写入 CookieJar 供 HTTP 引擎直连复用
 * 3. waitSelector(容忍超时)/waitMs 支持
 * 4. 全量回传 context.cookies() 为 Set-Cookie 风格字符串数组
 */
export async function renderStealth(url: string, opts: ObscuraFetchOptions = {}): Promise<ObscuraFetchResult> {
  const timeout = opts.timeout ?? 20000
  // Turnstile 管理型挑战(无交互自动验证)常需 10~25s, 慢尾可达 35s+, 默认 40s 上限
  const challengeWaitMs = opts.challengeWaitMs ?? 40000
  return withObscuraPage(url, async (page, ctx, meta) => {
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout,
        ...(opts.referer ? { referer: opts.referer } : {}),
      })
    } catch (e: any) {
      // 修复: CF 管理型挑战会扣住导航直至验证通过, goto 常在 domcontentloaded 前超时,
      // 但页面其实活着且后续会自动 reload —— 只有超时类错误才落入下方挑战等待循环抢救,
      // 其余(DNS/连接拒绝)照常抛出; about:blank 空页也不抢救防把空壳当成功内容
      const msg = String(e?.message || e)
      if (!/timeout|timed?\s?out/i.test(msg) || page.url() === 'about:blank') throw e
    }
    let html = await page.content()
    let challengeWaited = false

    // —— 挑战等待循环: CF 等盾会自动验证并刷新页面; E2 增强:
    //  ① 1-3s 人类随机延迟(模拟阅读挑战提示后操作, 防被识别为机器行为)
    //  ② 尝试点击 Turnstile 复选框(interactive 模式需要用户交互才能继续验证)
    //  ③ 结构化消失判定(#challenge-running/.cf-turnstile 等元素消失 + URL 不含 /cdn-cgi/challenge)
    //  ④ 超时不再抛错 —— 返回当前页面状态, 由 fetcher.looksBlocked 检测并降级
    const start = Date.now()
    while (looksLikeChallenge(html) && Date.now() - start < challengeWaitMs) {
      challengeWaited = true
      // E2 ①: 1-3s 随机延迟(原实现固定 1s 轮询节奏过于规律, 易被 CF 行为分析识别)
      await page.waitForTimeout(1000 + Math.floor(Math.random() * 2000)).catch(() => {})
      // E2 ②: 尝试点击 Turnstile 复选框(interactive 模式无 checkbox 时静默跳过)
      await tryClickTurnstile(page).catch(() => {})
      // E2 ③: 检查挑战 UI 是否结构化消失(UI 消失但 HTML 关键词仍命中的过渡态可提前出循环)
      let uiGone = false
      try { uiGone = !(await isChallengeUIVisible(page)) } catch { uiGone = false }
      if (uiGone) {
        // UI 消失后等 DOM 稳定再取新内容(盾通过后页面常自动 reload)
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
      }
      try {
        html = await page.content()
      } catch {
        // 修复: 盾通过时页面正在 reload, content() 会抛 "Execution context destroyed";
        // 置空让 isJsRedirectShell('')=true 继续轮询, 下一轮即可拿到真实页面
        html = ''
      }
      // UI 已消失且内容不再像挑战 → 提前退出循环(无需耗满 challengeWaitMs)
      if (uiGone && !looksLikeChallenge(html)) break
    }
    if (challengeWaited) {
      // 盾通过后页面通常自动 reload, 等 DOM 稳定再取内容
      await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
      await page.waitForTimeout(500)
      try { html = await page.content() } catch { /* 保持上一轮内容 */ }
    }

    // E2 ④: 挑战超时不再抛错 —— 返回当前页面状态(可能仍是挑战页), 由 fetcher 的
    // looksBlocked 检测并降级; obscura 期间拿到的 cf_clearance 等挑战凭证 cookie 仍会
    // 写入 CookieJar(fetcher.renderWithBrowser: cookieJar.store(originHost(url), res.cookies)),
    // 后续 HTTP 引擎直连可凭其过盾 —— 原 throw 会丢失这部分关键凭证, 让降级裸 Playwright
    // 也过不了盾。waitSelector/settle/click 等下游处理仍正常进行, 或许能进一步加载出真内容

    if (opts.waitSelector) {
      await page.waitForSelector(opts.waitSelector, { timeout: opts.waitMs || 8000 }).catch(() => { /* 容忍超时 */ })
    }
    if (opts.waitMs) await page.waitForTimeout(opts.waitMs)

    // —— 点击展开懒加载内容(ixdzs/101kks 系"点击展开全部目录"交互)——
    // AJAX 预取了数据但只有点击才注入 DOM; gg: 主 frame+跨域 iframe 全遍历
    // (Turnstile/hCaptcha 类挑战复选框在跨域 iframe 内, dd-d 缺口补齐);
    // 找不到元素(列表页/正文页)时静默跳过(全 frame 未命中=false → 跳过, 语义不变)
    if (opts.clickSelector) {
      const clicked = await clickSelectorAnywhere(page, opts.clickSelector)
      if (clicked) await page.waitForTimeout(1200)
    }

    // —— 渲染稳定化采样: AJAX 页面在 waitMs 后仍可能持续注入内容(章节列表延迟加载、
    // 段落客户端组装等), 每 700ms 采样 HTML 尺寸, 连续 2 次增长 <0.5% 视为稳定;
    // 最多再等 settleMs(默认 6000), 稳定后提前退出避免无谓延迟
    const settleMs = opts.settleMs ?? 6000
    if (settleMs > 0) {
      const settleStart = Date.now()
      let lastLen = html.length
      try { lastLen = (await page.content()).length } catch { /* 导航中: 用上一轮长度 */ }
      let stable = 0
      while (Date.now() - settleStart < settleMs && stable < 2) {
        await page.waitForTimeout(700)
        let len = lastLen
        try { len = (await page.content()).length } catch { break /* 页面导航中 */ }
        if (Math.abs(len - lastLen) <= Math.max(64, lastLen * 0.005)) stable++
        else stable = 0
        lastLen = len
      }
    }

    let finalHtml = html
    // 点击"展开"按钮可能实为链接触发整页导航: content() 在导航提交期间会抛
    // "Execution context destroyed", 单次失败退回上一轮采样会把点击前的空目录当最终结果;
    // 短退避重试拿导航后的真实内容, 重试耗尽仍失败才退回上一轮
    for (let retry = 0; retry < 3; retry++) {
      try { finalHtml = await page.content(); break } catch {
        if (retry === 2) break
        try { await page.waitForTimeout(700) } catch { break /* 页面已销毁 */ }
      }
    }

    // E2 ④(续): 渲染最终结果仍为挑战页(如二次盾)也不再抛错 —— 与挑战超时同策略,
    // 由 fetcher 的 looksBlocked 检测并降级处理(blocked=true 走 cookie 重试/裸 Playwright);
    // obscura 期间拿到的 cf_clearance 等凭证 cookie 仍会写入 CookieJar 供后续 HTTP 引擎直连复用
    // if (looksLikeChallenge(finalHtml)) { /* 不抛: 交 fetcher.looksBlocked 处理 */ }

    // [R9-b-8] 增强: 过盾成功指纹学习 —— 终态非挑战页且未指定 UA 覆盖时, 把本槽位指纹记入
    // 学习表(host 键, 2h TTL, 上限 200), 同站后续请求优先复用该指纹(同站指纹稳定像回访;
    // UA 覆盖请求的指纹由调用方钦定, 不具随机代表性, 不学习)
    const learnHost = hostnameOf(url)
    if (learnHost && meta?.fp && !opts.userAgent && !looksLikeChallenge(finalHtml)) {
      recordFpWin(learnHost, meta.fp)
    }

    // —— Cookie 回传: 转为 Set-Cookie 风格字符串, 供 fetcher 写入 CookieJar ——
    // Bug18 修复(Task 4-a): 原实现按 `new URL(url).hostname` 过滤 ctx.cookies(), 用的是【请求
    // URL】而非【page.url() 最终URL】—— 挑战通过后页面常发生同 host 跳转(如 /cdn-cgi/challenge
    // → /), 但跨子域跳转(www.example.com → example.com)或重定向链会令 host 不匹配, 关键的
    // cf_clearance / sessionId 等 cookie 会被 domainMatch 误删, 回传给 fetcher 时已无挑战凭证,
    // 后续 HTTP 直连仍过盾失败。改用更稳健策略: 全量回传 ctx.cookies(), 由 fetcher 侧
    // cookieJar.store(originHost(url), ...) 按请求 URL host 分桶存储 —— 同源 cookie 自然落入目标
    // 域罐, 第三方 cookie 即便被存入也只是无害冗余(目标站不识别即忽略, 不会被回送原第三方域);
    // 关键凭证 cf_clearance 零丢失, HTTP 引擎后续直连可凭其过盾。Obscura 槽位本就按 origin
    // 隔离(同域复用/跨域重建), 第三方 cookie 在槽位生命周期内本就少且短命
    const cookies = await ctx.cookies()
    const cookieStrings = cookies.map((c) => {
      const parts = [`${c.name}=${c.value}`, `path=${c.path || '/'}`, `domain=${c.domain}`]
      if (c.secure) parts.push('Secure')
      if (c.httpOnly) parts.push('HttpOnly')
      return parts.join('; ')
    })

    return {
      html: finalHtml,
      cookies: cookieStrings,
      finalUrl: page.url(),
      challengeWaited,
    }
  }, { userAgent: opts.userAgent, proxy: opts.proxy })
}

// ---------- 统一入口 ----------
/** Obscura 抓取: 不可用时抛错(由调用方决定降级策略) */
export async function obscuraFetch(url: string, opts: ObscuraFetchOptions = {}): Promise<ObscuraFetchResult> {
  const ok = await checkObscuraAvailable()
  if (!ok) throw new Error('Obscura 不可用: chromium 未安装或启动失败')
  return renderStealth(url, opts)
}

/** 主动关闭浏览器与页面池(空闲回收/进程退出/测试收尾时调用) */
export async function shutdownObscura(): Promise<void> {
  // R4-12: 设置 shuttingDown 标志, withObscuraPage 获取/重建槽位路径会检测本标志并立即抛错,
  //  防止 shutdownObscura splice 全部槽位后又有新槽位被创建(orphan ctx/page 泄漏)
  S.shuttingDown = true
  if (S.idleTimer) { clearTimeout(S.idleTimer); S.idleTimer = null }
  // E5: 取消心跳回收定时器(浏览器实例已关, 不再需要扫描)
  if (S.reclaimTimer) { clearInterval(S.reclaimTimer); S.reclaimTimer = null }
  const slots = S.slots.splice(0, S.slots.length)
  await Promise.allSettled(slots.map((s) => s.ctx.close().catch(() => {})))
  const b = S.browser
  S.browser = null
  S.probeOk = null
  S.probeAt = 0
  // [R9-b-7]: 代理浏览器实例一并关闭(否则空闲关停后代理 chromium 常驻残留)
  const proxyEntries = [...S.proxyBrowsers.values()]
  S.proxyBrowsers.clear()
  // 唤醒所有等待者: 让它们重新评估(浏览器已关, 按需重建或快速失败), 防止永久挂起
  // (ensureBrowser 入口的 shuttingDown 拦截会让它们快速失败, 不会重启浏览器)
  const waiters = S.waiters.splice(0, S.waiters.length)
  for (const w of waiters) w()
  if (b) {
    try { await b.close() } catch { /* 已死则忽略 */ }
  }
  await Promise.allSettled(
    proxyEntries.map((e) => (e.browser ? e.browser.close().catch(() => {}) : Promise.resolve())),
  )
  // 清除 shuttingDown 标志(收尾完成, 后续 ensureBrowser 重新拉起时不再被拦截)
  S.shuttingDown = false
}
