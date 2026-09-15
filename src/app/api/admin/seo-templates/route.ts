// ============================================================
// [R24-4] 自动 SEO/TDK 模板管理 — GET/PUT /api/admin/seo-templates
//   GET  → 当前模板集(默认模板 + 用户覆盖合并结果, 供编辑表单回显)
//   PUT  → 保存覆盖(JSON, 按「含 { 才接受」消毒; 全空 = 回归纯自动), 失效 60s 缓存
// 模板变量与默认值见 src/lib/seo-tpl.ts。
// ============================================================
import { db } from '@/lib/db'
import { ok, fail, readBody } from '@/lib/api'
import { withGuard } from '../../_lib/http'
import {
  DEFAULT_SEO_TEMPLATES,
  sanitizeSeoTpl,
  type SeoTplSet,
} from '@/lib/seo-tpl'
import {
  SEO_TPL_SETTING_KEY,
  getSeoTemplates,
  invalidateSeoTplCache,
} from '@/lib/seo-tpl-server'

/** 当前生效模板 + 用户是否已配置覆盖 */
export async function GET() {
  return withGuard(async () => {
    const tpl = await getSeoTemplates()
    const row = await db.setting.findUnique({ where: { key: SEO_TPL_SETTING_KEY }, select: { value: true } })
    let customized = false
    if (row?.value) {
      try {
        const raw = JSON.parse(row.value) as Partial<SeoTplSet>
        customized = !!(raw.book?.title || raw.book?.description || raw.book?.keywords || raw.toc?.title || raw.toc?.description || raw.chapter?.title || raw.chapter?.description || raw.chapter?.keywords)
      } catch {
        customized = false
      }
    }
    return ok({ customized, tpl })
  })
}

/** 保存模板覆盖(整组替换: 未传字段回落默认; 空对象 = 回归纯自动) */
export async function PUT(req: Request) {
  return withGuard(async () => {
    const body = await readBody(req)
    const raw = (body?.tpl ?? body) as Partial<SeoTplSet> | undefined
    if (!raw || typeof raw !== 'object') return fail('缺少模板数据')
    const tpl = sanitizeSeoTpl(raw)
    // 与默认完全一致视为「未定制」→ 落空串, 前台/SSR 走纯自动
    const isDefault = JSON.stringify(tpl) === JSON.stringify(DEFAULT_SEO_TEMPLATES)
    const value = isDefault ? '{}' : JSON.stringify(tpl)
    await db.setting.upsert({
      where: { key: SEO_TPL_SETTING_KEY },
      create: { key: SEO_TPL_SETTING_KEY, value },
      update: { value },
    })
    invalidateSeoTplCache()
    return ok({ saved: true, customized: !isDefault, tpl })
  })
}
