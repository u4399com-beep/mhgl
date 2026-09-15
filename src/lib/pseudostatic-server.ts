// ============================================================
// 伪静态 URL — 服务端领域逻辑(Prisma/Setting)
// ⚠️ 仅限服务端(API 路由/服务端组件)导入; 客户端请用 ./pseudostatic
// ============================================================
import type { PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'
import {
  PSEUDO_DEFAULT,
  PSEUDO_SETTING_KEY,
  parsePrettyPath,
  sanitizePseudoPreset,
  tokenIsCuid,
  tokenToNum,
  type PseudoPreset,
} from './pseudostatic'

// ---------------- 预设读取(60s 缓存) ----------------

let presetCache: { at: number; preset: PseudoPreset } | null = null
const PRESET_TTL_MS = 60_000

/** 管理端保存伪静态设置后调用, 立即失效预设缓存 */
export function invalidatePseudoPresetCache(): void {
  presetCache = null
}

/** 当前伪静态预设(Setting.pseudostatic, 消毒兜底; 60s 缓存) */
export async function getPseudoPreset(): Promise<PseudoPreset> {
  if (presetCache && Date.now() - presetCache.at < PRESET_TTL_MS) return presetCache.preset
  let preset: PseudoPreset | null = null
  try {
    const row = await db.setting.findUnique({ where: { key: PSEUDO_SETTING_KEY }, select: { value: true } })
    if (row?.value) {
      try {
        preset = sanitizePseudoPreset(JSON.parse(row.value))
      } catch {
        preset = sanitizePseudoPreset(row.value)
      }
    } else {
      // DB 可达但未配置 → 默认预设即真实配置, 可缓存
      preset = PSEUDO_DEFAULT
    }
  } catch {
    // [R27-5b-L6] 瞬态 DB 错误不把「默认值」写进 60s 缓存(下次请求重试, 防抖动期全站伪静态按默认渲染)
    return PSEUDO_DEFAULT
  }
  presetCache = { at: Date.now(), preset: preset! }
  return preset!
}

// ---------------- 路径解析(直达/刷新/后退共用) ----------------

export interface ResolvedPretty {
  view: 'book' | 'read'
  bookId: string
  chapterId?: string
}

/**
 * 伪静态路径 → 真实视图参数(cuid)。
 * token 宽容解析: 数字/b数字/c数字 → num/idx 查库; cuid 形态 → id 直查(章节需校验归属书)。
 * 任何一环无法落库命中 → null(调用方 404)。
 */
export async function resolvePrettyPath(pathname: string): Promise<ResolvedPretty | null> {
  const parsed = parsePrettyPath(pathname)
  if (!parsed) return null
  const book = await resolveBookToken(parsed.bookToken)
  if (!book) return null
  if (parsed.view === 'book' || !parsed.chapterToken) return { view: 'book', bookId: book.id }
  const chapter = await resolveChapterToken(parsed.chapterToken, book.id)
  if (!chapter) return null
  return { view: 'read', bookId: book.id, chapterId: chapter.id }
}

async function resolveBookToken(token: string): Promise<{ id: string } | null> {
  const num = tokenToNum(token)
  if (num !== null) {
    return db.book.findUnique({ where: { num }, select: { id: true } })
  }
  if (tokenIsCuid(token)) {
    return db.book.findUnique({ where: { id: token }, select: { id: true } })
  }
  return null
}

async function resolveChapterToken(token: string, bookId: string): Promise<{ id: string } | null> {
  const idx = tokenToNum(token)
  if (idx !== null) {
    return db.chapter.findUnique({ where: { bookId_idx: { bookId, idx } }, select: { id: true } })
  }
  if (tokenIsCuid(token)) {
    const c = await db.chapter.findUnique({ where: { id: token }, select: { id: true, bookId: true } })
    // cuid 直查必须校验归属书, 防跨书拼接路径串读
    return c && c.bookId === bookId ? { id: c.id } : null
  }
  return null
}

// ---------------- 数字书号分配 ----------------

/** Prisma Int = Int32 上限 */
const INT32_MAX = 2_147_483_647

type BookDelegate = PrismaClient['book']

/** 当前最大书号 + 1(并发创建可能撞号, 调用方用 withBookNumRetry 重试) */
export async function nextBookNum(tx: { book: BookDelegate }): Promise<number> {
  const agg = await tx.book.aggregate({ _max: { num: true } })
  const cur = agg._max.num ?? 0
  if (cur >= INT32_MAX) throw new Error('数字书号已耗尽')
  return cur + 1
}

/**
 * P2002(num 唯一冲突)重试包装 —— 并发建书时 nextBookNum 撞号的兜底。
 * 仅对 Prisma 唯一约束错误重试(书表唯一键仅 id/num, id 冲突本就不该发生)。
 */
export async function withBookNumRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const code = e && typeof e === 'object' ? (e as { code?: string }).code : undefined
      if (code === 'P2002') continue
      throw e
    }
  }
  throw lastErr
}
