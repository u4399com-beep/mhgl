// ============================================================
// 违禁词 — 服务端领域逻辑(Setting 读取 + 60s 缓存) [R21-h-1]
// ⚠️ 仅限服务端(API 路由)导入; 纯引擎见 ./banned-words, 管理端编辑
//    见 src/components/admin/BannedWordsSection.tsx
// 模式与 src/lib/pseudostatic-server.ts 一致: 60s 内存 TTL 缓存 +
// 管理端保存(settings API PUT)时失效钩子, 前台即时按新词表生效。
// ============================================================
import { db } from '@/lib/db'
import {
  BANNED_WORDS_SETTING_KEY,
  DEFAULT_BANNED_WORDS_CONFIG,
  sanitizeBannedWordsConfig,
  type BannedWordsConfig,
} from './banned-words'

let cfgCache: { at: number; cfg: BannedWordsConfig } | null = null
const BANNED_WORDS_TTL_MS = 60_000

/** 管理端保存违禁词设置后调用, 立即失效配置缓存(settings API 挂钩) */
export function invalidateBannedWordsCache(): void {
  cfgCache = null
}

/**
 * 当前违禁词配置(Setting.bannedWords, 消毒兜底; 60s 缓存)。
 * 无记录/解析失败/读库失败 → 默认空词表(fail-open: 不过滤, 不影响前台渲染)。
 */
export async function getBannedWordsConfig(): Promise<BannedWordsConfig> {
  if (cfgCache && Date.now() - cfgCache.at < BANNED_WORDS_TTL_MS) return cfgCache.cfg
  let cfg: BannedWordsConfig = DEFAULT_BANNED_WORDS_CONFIG
  try {
    const row = await db.setting.findUnique({ where: { key: BANNED_WORDS_SETTING_KEY }, select: { value: true } })
    if (row?.value) {
      try {
        cfg = sanitizeBannedWordsConfig(JSON.parse(row.value))
      } catch {
        cfg = sanitizeBannedWordsConfig(row.value)
      }
    }
  } catch {
    cfg = DEFAULT_BANNED_WORDS_CONFIG
  }
  cfgCache = { at: Date.now(), cfg }
  return cfg
}
