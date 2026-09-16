// ============================================================
// [R24-4] SEO 模板服务端读取(Setting.seoTemplates, 60s 缓存) — 仅限服务端导入
// 模式与 pseudostatic-server.getPseudoPreset 同构: 缓存读取 + 保存后失效钩子。
// ============================================================
import { db } from '@/lib/db'
import { sanitizeSeoTpl, type SeoTplSet } from './seo-tpl'

export const SEO_TPL_SETTING_KEY = 'seoTemplates'

let tplCache: { at: number; tpl: SeoTplSet } | null = null
const TPL_TTL_MS = 60_000

/** 管理端保存 SEO 模板后调用, 立即失效缓存 */
export function invalidateSeoTplCache(): void {
  tplCache = null
}

/** 当前 SEO 模板(Setting.seoTemplates, 消毒兜底; 60s 缓存; 未配置 = 全默认「自动」) */
export async function getSeoTemplates(): Promise<SeoTplSet> {
  if (tplCache && Date.now() - tplCache.at < TPL_TTL_MS) return tplCache.tpl
  let tpl: SeoTplSet | null = null
  try {
    const row = await db.setting.findUnique({ where: { key: SEO_TPL_SETTING_KEY }, select: { value: true } })
    // DB 可达但未配置 → 默认模板即真实配置, 可缓存; DB 异常 → 不写缓存(下次请求重试)
    tpl = sanitizeSeoTpl(row?.value ? JSON.parse(row.value) : null)
  } catch {
    // [R27-5b-L6] 瞬态 DB 错误不把「默认值」写进 60s 缓存(修前抖动期间全站 TDK 按默认渲染 1 分钟)
    return sanitizeSeoTpl(null)
  }
  tplCache = { at: Date.now(), tpl }
  return tpl
}
