// ============================================================
// [R36-2a-3] 主题覆盖配置读侧(Setting.theme_overrides) — 服务端领域逻辑(含 Prisma)
// ⚠️ 仅限服务端(API 路由)导入; 客户端组件禁止 import 本文件
//    (Prisma 会被打进客户端包), 纯类型/合并逻辑请用 ./crawl/themes。
// 语义: 逐主题覆盖(阅读设置+页面底部), 管理端写入后 invalidateThemeOverridesCache()
//    立即失效, 下次公共请求(站点引导/主题列表)按新值下发。
// ============================================================
import { db } from '@/lib/db'
import { THEME_OVERRIDES_SETTING_KEY, sanitizeThemeOverride, type ThemeOverride } from './crawl/themes'

const OVERRIDES_TTL_MS = 60_000

let cache: { at: number; map: Record<string, ThemeOverride> } | null = null

/** 管理端保存/重置主题覆盖后调用, 立即失效读侧缓存 */
export function invalidateThemeOverridesCache(): void {
  cache = null
}

/** 单条覆盖条目消毒(逐条隔离: 垃圾条目跳过, 不拖垮全量 map) */
function sanitizeEntry(entry: unknown): ThemeOverride | null {
  const r = sanitizeThemeOverride(entry)
  return r.ok ? r.value : null
}

/**
 * 全量主题覆盖 map (key=themeId; 60s 内存 TTL 缓存)。
 * - DB 不可达/解析失败: 返回空 map 且不写缓存(下次请求重试, 防抖动期错误值固化 60s)
 * - 条目级消毒: 非法条目(历史脏数据/手工改库)整条跳过 → 该主题走注册表默认
 */
export async function getThemeOverrides(): Promise<Record<string, ThemeOverride>> {
  if (cache && Date.now() - cache.at < OVERRIDES_TTL_MS) return cache.map
  const map: Record<string, ThemeOverride> = {}
  try {
    const row = await db.setting.findUnique({ where: { key: THEME_OVERRIDES_SETTING_KEY }, select: { value: true } })
    if (row?.value) {
      let raw: unknown = null
      try {
        raw = JSON.parse(row.value)
      } catch {
        raw = null
      }
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
          const v = sanitizeEntry(entry)
          if (v) map[id] = v
        }
      }
    }
  } catch {
    // 瞬态 DB 错误: 返回空 map(全主题走默认)但不缓存, 与 pseudostatic-server 同款防固化策略
    return map
  }
  cache = { at: Date.now(), map }
  return map
}
