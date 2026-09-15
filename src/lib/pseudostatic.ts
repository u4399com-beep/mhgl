// ============================================================
// 伪静态 URL 引擎 — 前台阅读模块(书籍页/阅读页)路径预设
// ------------------------------------------------------------
// 预设清单(管理端「系统设置→伪静态设置」可选):
//   query     动态查询(原生)  /?view=book&id=1001            /?view=read&chapter=3
//   numeric   纯数字          /book/1001.html                /read/1001/3.html
//   alnum     字母+数字       /book/b1001.html               /read/b1001/c3.html
//   directory 目录式          /book/1001/                    /read/1001/3/
//   restful   简洁无后缀      /book/1001                     /read/1001/3
//   compact   紧凑双段        /book/1001.html                /read/1001_3.html
//
// 标识符映射:
//   书籍页 token = Book.num(数字列, 应用层分配; 无 num 时回退查询串, 永不死链)
//   阅读页 token = Book.num + Chapter.idx(每书内 1 起序号, 天然存在)
//   宽容解析: 直达/刷新路径不区分预设形态统一解析(数字/b前缀/c前缀/cuid 兼容),
//             生成按预设、解析按宽容 —— 换预设后旧链接依然可达。
//
// 本模块为纯函数 + 内存注册表, 无 Prisma/无 DOM 依赖, 客户端与服务端通用。
// 服务端专属(Setting 读取/路径解析落库)见 src/lib/pseudostatic-server.ts。
// ============================================================

/** 预设 id 集合 */
export type PseudoPreset = 'query' | 'numeric' | 'alnum' | 'directory' | 'restful' | 'compact'

/** 缺省预设(原生查询串, 升级零回归) */
export const PSEUDO_DEFAULT: PseudoPreset = 'query'

/** Setting 表存储 key */
export const PSEUDO_SETTING_KEY = 'pseudostatic'

export interface PseudoPresetMeta {
  id: PseudoPreset
  name: string
  desc: string
  /** 示例(书籍页/阅读页) */
  sampleBook: string
  sampleRead: string
}

/** 预设元数据(管理端选择卡 + 示例展示) */
export const PSEUDO_PRESETS: readonly PseudoPresetMeta[] = [
  {
    id: 'query',
    name: '动态查询（原生）',
    desc: '查询串路由，无需数字编号，最稳妥（默认）',
    sampleBook: '/?view=book&id={id}',
    sampleRead: '/?view=read&chapter={cid}',
  },
  {
    id: 'numeric',
    name: '纯数字',
    desc: '全数字路径，经典静态化形态，URL 最短',
    sampleBook: '/book/1001.html',
    sampleRead: '/read/1001/3.html',
  },
  {
    id: 'alnum',
    name: '字母+数字',
    desc: 'b=书籍 / c=章节 前缀，形态更天然、防遍历猜测',
    sampleBook: '/book/b1001.html',
    sampleRead: '/read/b1001/c3.html',
  },
  {
    id: 'directory',
    name: '目录式',
    desc: '无后缀目录层级 + 末尾斜杠，仿目录结构',
    sampleBook: '/book/1001/',
    sampleRead: '/read/1001/3/',
  },
  {
    id: 'restful',
    name: '简洁无后缀',
    desc: 'RESTful 短路径，无 .html 无斜杠',
    sampleBook: '/book/1001',
    sampleRead: '/read/1001/3',
  },
  {
    id: 'compact',
    name: '紧凑双段',
    desc: '书籍页与纯数字一致，阅读页「书号_章号」单段合并',
    sampleBook: '/book/1001.html',
    sampleRead: '/read/1001_3.html',
  },
] as const

const PSEUDO_IDS: readonly string[] = PSEUDO_PRESETS.map((p) => p.id)

/** 任意来源(设置表 JSON/表单) → 合法预设 id */
export function sanitizePseudoPreset(raw: unknown): PseudoPreset {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    // 允许传配置对象 { preset: '...' }
    raw = (raw as Record<string, unknown>).preset
  }
  const s = typeof raw === 'string' ? raw.trim() : ''
  return (PSEUDO_IDS as readonly string[]).includes(s) ? (s as PseudoPreset) : PSEUDO_DEFAULT
}

// ---------------- token 形态 ----------------

/** Prisma Int = Int32: 数字编号上限钳制 */
const INT32_MAX = 2_147_483_647
/** 纯数字 token(书号/章号) */
const NUM_TOKEN_RE = /^\d{1,10}$/
/** 字母+数字 token: b=书籍 c=章节 */
const ALNUM_BOOK_RE = /^b\d{1,10}$/
const ALNUM_CH_RE = /^c\d{1,10}$/
/** cuid 形态(25 位左右字母数字, 兼容宽容解析) */
const CUID_TOKEN_RE = /^[a-z0-9]{16,36}$/i

function clampInt(n: number): number | null {
  if (!Number.isFinite(n)) return null
  const i = Math.trunc(n)
  return i >= 1 && i <= INT32_MAX ? i : null
}

// ---------------- 内存注册表(客户端喂数据, 服务端空表安全) ----------------

const bookNumById = new Map<string, number>()
const chapterRefById = new Map<string, { bookId: string; idx: number }>()

// [R27-5b-L3] 客户端注册表上限(长会话防无界增长): 超限淘汰最早写入项(Map 保插入序,
// 重复 set 先删后插刷新新近度, LRU 近似)。服务端从不调用 register*, 本上限零服务端影响
const REGISTRY_MAX = 500

function registrySet<V>(map: Map<string, V>, key: string, value: V): void {
  if (map.has(key)) map.delete(key)
  map.set(key, value)
  if (map.size > REGISTRY_MAX) {
    const oldest = map.keys().next().value
    if (oldest !== undefined) map.delete(oldest)
  }
}

/** 登记书籍 id→num(来自公共 API 返回的 book 对象) */
export function registerBookRef(id: string | null | undefined, num: number | null | undefined): void {
  const n = clampInt(Number(num))
  if (id && n) registrySet(bookNumById, id, n)
}

/** 登记章节 id→(书id, 书内序号)(来自 chapter/book API) */
export function registerChapterRef(
  chapterId: string | null | undefined,
  bookId: string | null | undefined,
  idx: number | null | undefined,
): void {
  const i = clampInt(Number(idx))
  if (chapterId && bookId && i) registrySet(chapterRefById, chapterId, { bookId, idx: i })
}

function lookupBookNum(bookId: string): number | null {
  return bookNumById.get(bookId) ?? null
}

function lookupChapterRef(chapterId: string): { bookId: string; idx: number } | null {
  return chapterRefById.get(chapterId) ?? null
}

// ---------------- 构建(按预设生成) ----------------

export interface BookRef {
  id: string
  num?: number | null
}

export interface ChapterRef {
  id: string
  idx?: number | null
}

/** 书籍 token: numeric/directory/restful/compact → '1001'; alnum → 'b1001'; query/无num → null */
export function bookTokenFor(book: BookRef | string, preset: PseudoPreset): string | null {
  if (preset === 'query') return null
  const ref: BookRef = typeof book === 'string' ? { id: book } : book
  const num = clampInt(Number(ref.num ?? lookupBookNum(ref.id)))
  if (!num) return null
  return preset === 'alnum' ? `b${num}` : String(num)
}

/** 章节 token: alnum → 'c3'; 其余 → '3'; query/无idx → null */
export function chapterTokenFor(chapter: ChapterRef | string, preset: PseudoPreset): string | null {
  if (preset === 'query') return null
  const ref: ChapterRef = typeof chapter === 'string' ? { id: chapter } : chapter
  const idx = clampInt(Number(ref.idx ?? lookupChapterRef(ref.id)?.idx))
  if (!idx) return null
  return preset === 'alnum' ? `c${idx}` : String(idx)
}

/**
 * 书籍页伪静态路径(不带查询串)。无法生成(预设=query / 缺 num)返回 '' → 调用方回退查询串。
 */
export function buildBookPath(book: BookRef | string, preset: PseudoPreset): string {
  const tok = bookTokenFor(book, preset)
  if (!tok) return ''
  switch (preset) {
    case 'directory':
      return `/book/${tok}/`
    case 'restful':
      return `/book/${tok}`
    case 'compact':
    case 'numeric':
    case 'alnum':
    default:
      return `/book/${tok}.html`
  }
}

/**
 * 阅读页伪静态路径(不带查询串)。无法生成返回 '' → 调用方回退查询串。
 * chapter 需带 idx(或已注册); book 需带 num(或已注册)。
 */
export function buildReadPath(
  book: BookRef | string,
  chapter: ChapterRef | string,
  preset: PseudoPreset,
): string {
  if (preset === 'query') return ''
  const bTok = bookTokenFor(book, preset)
  const cTok = chapterTokenFor(chapter, preset)
  if (!bTok || !cTok) return ''
  if (preset === 'compact') {
    const bNum = bTok.replace(/^b/, '')
    const cNum = cTok.replace(/^c/, '')
    return `/read/${bNum}_${cNum}.html`
  }
  if (preset === 'directory') return `/read/${bTok}/${cTok}/`
  if (preset === 'restful') return `/read/${bTok}/${cTok}`
  return `/read/${bTok}/${cTok}.html` // numeric / alnum
}

/** 视图参数(结构化, 与 ctx.ViewParams 同构, 避免循环依赖不直接 import) */
export interface ViewUrlParams {
  view: string
  bookId?: string
  chapterId?: string
  q?: string
  tag?: string
  cat?: string
  page?: number
  site?: string
}

/**
 * 视图 → 站内 URL(唯一序列化出口)。
 * - 阅读模块(book/read) + 预设≠query 且可解析 token → 伪静态路径(站点/翻页以查询串附加)
 * - 其余视图 / 预设=query / 注册表未命中 → 查询串风格(永不死链)
 */
export function buildViewUrl(v: ViewUrlParams, siteId: string, preset: PseudoPreset): string {
  const siteQs = new URLSearchParams()
  if (siteId) siteQs.set('site', siteId)

  if (preset !== 'query' && v.view === 'book' && v.bookId) {
    const path = buildBookPath({ id: v.bookId }, preset)
    if (path) {
      if (v.page && v.page > 1) siteQs.set('page', String(v.page))
      const qs = siteQs.toString()
      return qs ? `${path}?${qs}` : path
    }
  }
  if (preset !== 'query' && v.view === 'read' && v.chapterId) {
    const ref = lookupChapterRef(v.chapterId)
    const path = ref ? buildReadPath({ id: ref.bookId }, { id: v.chapterId, idx: ref.idx }, preset) : ''
    if (path) {
      const qs = siteQs.toString()
      return qs ? `${path}?${qs}` : path
    }
  }

  // 查询串风格(原生形态, 全视图通用兜底)
  const sp = new URLSearchParams(siteQs)
  sp.set('view', v.view)
  if (v.bookId) sp.set('id', v.bookId)
  if (v.chapterId) sp.set('chapter', v.chapterId)
  if (v.q) sp.set('q', v.q)
  if (v.tag) sp.set('tag', v.tag)
  if (v.cat) sp.set('cat', v.cat)
  if (v.page && v.page > 1) sp.set('page', String(v.page))
  const qs = sp.toString()
  return qs ? `/?${qs}` : '/'
}

// ---------------- 解析(宽容, 直达/刷新/后退共用) ----------------

export interface ParsedPrettyPath {
  view: 'book' | 'read'
  /** 书籍 token(数字 / b数字 / cuid) */
  bookToken: string
  /** 章节 token(数字 / c数字 / cuid; view=read 时必有) */
  chapterToken?: string
}

/**
 * 宽容解析伪静态路径 → token 集合(不做数据库解析, 见 pseudostatic-server)。
 * 形态全预设兼容: /book/{tok}[/|.html] 与 /read/{btok}/{ctok}[/|.html] 与 /read/{btok}_{ctok}.html;
 * 仅接受首段 book|read, 其余一律 null(交 404)。token 形态合法性在此校验。
 */
export function parsePrettyPath(pathname: string): ParsedPrettyPath | null {
  let p = (pathname || '').split(/[?#]/)[0]
  if (!p.startsWith('/')) p = `/${p}`
  // 去末尾斜杠(目录式)与 .html 后缀, 逐段处理
  const segments = p
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => {
      let x = s
      try {
        x = decodeURIComponent(s)
      } catch {
        /* 非法编码保留原文 */
      }
      return x.replace(/\.html?$/i, '')
    })
  if (segments.length < 2) return null
  const kind = segments[0].toLowerCase()
  const rawBook = segments[1]

  if (kind === 'book') {
    // /book/{tok} → 书籍页(忽略多余段, 保持宽容)
    if (!validBookToken(rawBook)) return null
    return { view: 'book', bookToken: rawBook }
  }
  if (kind !== 'read') return null

  if (segments.length === 2) {
    // /read/{btok}_{ctok} 紧凑双段(带 .html 已在分段时剥离)
    // (先于 validBookToken 校验: '1001_3' 含下划线不属任何单 token 形态)
    const compact = parseCompactToken(rawBook)
    if (compact) return { view: 'read', bookToken: compact.bookToken, chapterToken: compact.chapterToken }
    // /read/{btok} 缺章节段 → 落到书籍详情页(比 404 更友好)
    if (!validBookToken(rawBook)) return null
    return { view: 'book', bookToken: rawBook }
  }

  if (!validBookToken(rawBook)) return null
  const rawCh = segments[2]
  if (!validChapterToken(rawCh)) return null
  return { view: 'read', bookToken: rawBook, chapterToken: rawCh }
}

/** 紧凑双段解析(供 parsePrettyPath 内部使用: /read/1001_3)
 *  [R19-c-4] 取消导出 —— 全库无外部引用, 仅 parsePrettyPath 内部消费 */
function parseCompactToken(token: string): { bookToken: string; chapterToken: string } | null {
  const i = token.indexOf('_')
  if (i <= 0 || i === token.length - 1) return null
  const b = token.slice(0, i)
  const c = token.slice(i + 1)
  if (!validBookToken(b) || !validChapterToken(c)) return null
  return { bookToken: b, chapterToken: c }
}

function validBookToken(t: string): boolean {
  return NUM_TOKEN_RE.test(t) || ALNUM_BOOK_RE.test(t) || CUID_TOKEN_RE.test(t)
}

function validChapterToken(t: string): boolean {
  return NUM_TOKEN_RE.test(t) || ALNUM_CH_RE.test(t) || CUID_TOKEN_RE.test(t)
}

/**
 * token → 数字编号(供服务端解析用)。
 * '1001'→1001; 'b1001'→1001; 'c3'→3; cuid 形态 → null(走 id 查询)。
 */
export function tokenToNum(token: string): number | null {
  if (NUM_TOKEN_RE.test(token)) return clampInt(Number(token))
  if (ALNUM_BOOK_RE.test(token)) return clampInt(Number(token.slice(1)))
  if (ALNUM_CH_RE.test(token)) return clampInt(Number(token.slice(1)))
  return null
}

/** token 是否为 cuid 形态(走 id 直查) */
export function tokenIsCuid(token: string): boolean {
  return CUID_TOKEN_RE.test(token) && !NUM_TOKEN_RE.test(token) && !ALNUM_BOOK_RE.test(token) && !ALNUM_CH_RE.test(token)
}
