// ============================================================
// [R36-2a-2] 主题覆盖配置 API — 逐主题「阅读设置 + 页面底部」自定义
//   PUT    { themeId, read?, footer? }  → 保存覆盖(校验+钳制, 读取-合并-写回全量 map)
//   DELETE ?themeId=                    → 重置该主题为注册表默认(从 map 删键写回, 幂等;
//                                         不要求命中注册表 —— 允许清理注册表已移除主题的残留键)
//   GET                                 → 当前全量 overrides map(admin UI 回显)
// 存储: Setting key='theme_overrides'(单 key JSON, 100KB 上限, 与 admin settings 同口径)。
// 写后 invalidateThemeOverridesCache(): 站点引导/主题列表读侧 60s 缓存立即失效。
// ============================================================
import { db } from '@/lib/db'
import { ok, fail, readBody } from '@/lib/api'
// 注: 本文件位于 admin/themes/override/ 深一层, 相对路径三层上溯到 src/app/api/_lib/http
import { withGuard, isPlainObject } from '../../../_lib/http'
import { THEMES, THEME_OVERRIDES_SETTING_KEY, sanitizeThemeOverride, type ThemeOverride } from '@/lib/crawl/themes'
import { getThemeOverrides, invalidateThemeOverridesCache } from '@/lib/theme-overrides'

/** 单 key value JSON 上限(与 admin settings VALUE_MAX 同口径), 防DB膨胀 */
const VALUE_MAX = 100_000

/** 注册表命中集合(THEMES 10 套克隆) */
const THEME_IDS = new Set<string>(THEMES.map((t) => t.id))

/** 直读 DB 的全量覆盖 map(写路径专用: 不走 60s 读缓存, 防读旧值覆盖合并) */
async function loadOverridesFresh(): Promise<Record<string, ThemeOverride>> {
  const row = await db.setting.findUnique({ where: { key: THEME_OVERRIDES_SETTING_KEY }, select: { value: true } })
  if (!row?.value) return {}
  let raw: unknown = null
  try {
    raw = JSON.parse(row.value)
  } catch {
    return {}
  }
  if (!isPlainObject(raw)) return {}
  const map: Record<string, ThemeOverride> = {}
  for (const [id, entry] of Object.entries(raw)) {
    const r = sanitizeThemeOverride(entry)
    if (r.ok) map[id] = r.value
  }
  return map
}

async function writeOverrides(map: Record<string, ThemeOverride>): Promise<string | null> {
  let serialized: string
  try {
    serialized = JSON.stringify(map)
  } catch {
    return '配置不可序列化(含循环引用等)'
  }
  if (serialized.length > VALUE_MAX) return '主题自定义配置过大(上限100KB), 请精简后重试'
  await db.setting.upsert({
    where: { key: THEME_OVERRIDES_SETTING_KEY },
    create: { key: THEME_OVERRIDES_SETTING_KEY, value: serialized },
    update: { value: serialized },
  })
  invalidateThemeOverridesCache()
  return null
}

export async function GET() {
  return withGuard(async () => {
    return ok(await getThemeOverrides())
  })
}

export async function PUT(req: Request) {
  return withGuard(async () => {
    const body = await readBody<Record<string, unknown>>(req)
    if (!isPlainObject(body)) return fail('请求体必须是对象')
    const themeId = typeof body.themeId === 'string' ? body.themeId.trim() : ''
    if (!themeId) return fail('缺少 themeId')
    if (!THEME_IDS.has(themeId)) return fail(`未知主题: ${themeId.slice(0, 32)}`)
    const r = sanitizeThemeOverride({ read: body.read, footer: body.footer })
    if (!r.ok) return fail(r.message)
    const map = await loadOverridesFresh()
    map[themeId] = r.value
    const err = await writeOverrides(map)
    if (err) return fail(err)
    return ok(map)
  })
}

export async function DELETE(req: Request) {
  return withGuard(async () => {
    const url = new URL(req.url)
    const themeId = (url.searchParams.get('themeId') || '').trim()
    if (!themeId) return fail('缺少 themeId')
    const map = await loadOverridesFresh()
    if (themeId in map) {
      delete map[themeId]
      const err = await writeOverrides(map)
      if (err) return fail(err)
    }
    // 未命中视为已重置, 幂等返回当前 map
    return ok(map)
  })
}
