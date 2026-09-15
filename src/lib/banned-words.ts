// ============================================================
// 违禁词引擎 [R21-h-1] — 纯函数 + 编译缓存, 无 DOM/Prisma 依赖
// ------------------------------------------------------------
// 配置存储: Setting 表 key 'bannedWords' → JSON { mode:'mask'|'remove', words:string[] }
//   mask   = 打码: 命中词替换为 '*'(与命中文本等长, 最多 6 个星)
//   remove = 删除: 命中词直接剔除
// 安全面:
//   - 词表上限 500 条 / 单词上限 50 字符(sanitize 层钳制), 正则逐词转义 → 防病态正则/ReDoS
//   - 编译缓存(compileOnce): 同一配置只编译一次正则, 命中 O(1) 复用; 超限整体清空防膨胀
//   - 空词表零开销直通(不建正则不切分)
//   - latin 词条大小写不敏感('gi' 标志); 替换按命中文本码点长度打码
//   - 长词优先排序: 同位置多个词可命中时取最长(如词表含 ab/abcd 优先 abcd)
// 服务端 Setting 读取缓存见 ./banned-words-server.ts (60s TTL + 保存失效钩子)
// ============================================================

/** Setting 表存储 key(与管理端 BannedWordsSection / settings API 约定一致) */
export const BANNED_WORDS_SETTING_KEY = 'bannedWords'

export type BannedWordsMode = 'mask' | 'remove'

export interface BannedWordsConfig {
  mode: BannedWordsMode
  words: string[]
}

/** 词表条数上限(防病态正则/配置膨胀) */
export const BANNED_WORDS_MAX_COUNT = 500
/** 单个词条字符上限 */
export const BANNED_WORD_MAX_LEN = 50
/** 打码星号上限(长词不产出无限长星串) */
export const BANNED_MASK_MAX_STARS = 6
/** 编译缓存条目上限(管理端配置形态有限, 正常远达不到; 超限整体清空防内存膨胀) */
const COMPILE_CACHE_MAX = 32

export const DEFAULT_BANNED_WORDS_CONFIG: BannedWordsConfig = { mode: 'mask', words: [] }

/** 提取词表(防御非数组/非字符串项, 调用方可传未消毒配置) */
function wordsOf(cfg: BannedWordsConfig | null | undefined): string[] {
  const w = (cfg as BannedWordsConfig | undefined)?.words
  return Array.isArray(w) ? w.filter((x): x is string => typeof x === 'string') : []
}

/** 任意来源(Setting JSON / 表单) → 合法配置: mode 非法回退 mask, 词去空/截断/去重(不区分大小写)/钳量 */
export function sanitizeBannedWordsConfig(raw: unknown): BannedWordsConfig {
  const mode: BannedWordsMode =
    raw && typeof raw === 'object' && (raw as { mode?: unknown }).mode === 'remove' ? 'remove' : 'mask'
  const seen = new Set<string>()
  const words: string[] = []
  const list = raw && typeof raw === 'object' ? (raw as { words?: unknown }).words : null
  if (Array.isArray(list)) {
    for (const item of list) {
      if (typeof item !== 'string') continue
      const w = item.trim()
      if (!w) continue
      const key = w.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      words.push(w.length > BANNED_WORD_MAX_LEN ? w.slice(0, BANNED_WORD_MAX_LEN) : w)
      if (words.length >= BANNED_WORDS_MAX_COUNT) break
    }
  }
  return { mode, words }
}

function escapeRegExp(s: string): string {
  // 转义正则元字符, 词表内容永远按字面量匹配
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface CompiledBannedWords {
  mode: BannedWordsMode
  /** null = 词表为空(直通) */
  re: RegExp | null
}

const compileCache = new Map<string, CompiledBannedWords>()

/** 编译缓存键: mode + 排序去重后词表(同集合不同顺序共享缓存) */
function compileKey(mode: BannedWordsMode, words: string[]): string {
  return `${mode}\u0000${words.join('\u0001')}`
}

/** compile-once: 同一配置全局只编译一次; 词表为空返回 re=null(调用方直通) */
function compileBannedWords(cfg: BannedWordsConfig | null | undefined): CompiledBannedWords {
  const mode: BannedWordsMode = cfg?.mode === 'remove' ? 'remove' : 'mask'
  const words = [...new Set(wordsOf(cfg).map((w) => w.trim()).filter(Boolean))]
    .map((w) => (w.length > BANNED_WORD_MAX_LEN ? w.slice(0, BANNED_WORD_MAX_LEN) : w))
    .sort((a, b) => b.length - a.length) // 长词优先 → alternation 同位置取最长命中
  const key = compileKey(mode, words)
  const hit = compileCache.get(key)
  if (hit) return hit
  const compiled: CompiledBannedWords = {
    mode,
    re: words.length
      ? new RegExp(words.map(escapeRegExp).join('|'), 'gi')
      : null,
  }
  if (compileCache.size >= COMPILE_CACHE_MAX) compileCache.clear()
  compileCache.set(key, compiled)
  return compiled
}

/**
 * 对纯文本应用违禁词过滤 [R21-h-1]
 * - mask:   每处命中替换为 '*'(与命中文本码点等长, 最多 BANNED_MASK_MAX_STARS 个)
 * - remove: 每处命中直接删除
 * 空文本/空词表原样返回; latin 词条大小写不敏感。
 */
export function applyBannedWords(text: string, cfg: BannedWordsConfig | null | undefined): string {
  if (typeof text !== 'string' || text === '') return typeof text === 'string' ? text : ''
  const { mode, re } = compileBannedWords(cfg)
  if (!re) return text
  if (mode === 'remove') return text.replace(re, '')
  return text.replace(re, (m) => '*'.repeat(Math.min([...m].length, BANNED_MASK_MAX_STARS)))
}

const HTML_TAG_SPLIT_RE = /(<[^>]*>)/
const FULL_TAG_RE = /^<[^>]*>$/

/**
 * 对 HTML 内容应用违禁词过滤(章节正文渲染点) [R21-h-1]
 * 按 <tag> 切分, 只过滤文本段 —— 防止词表命中 <p>/src/class 等标签与属性破坏 HTML 结构;
 * 非完整标签的散落 '<' 仍按文本过滤(字面量场景, 过滤是正确语义)。
 */
export function applyBannedWordsToHtml(html: string, cfg: BannedWordsConfig | null | undefined): string {
  if (typeof html !== 'string' || html === '') return typeof html === 'string' ? html : ''
  if (!wordsOf(cfg).length) return html // 空词表零开销直通(不做无谓切分)
  return html
    .split(HTML_TAG_SPLIT_RE)
    .map((seg) => (FULL_TAG_RE.test(seg) ? seg : applyBannedWords(seg, cfg)))
    .join('')
}
