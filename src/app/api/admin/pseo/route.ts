// ============================================================
// [R27-2-5] PSEO 关键词页管理 — GET/POST/DELETE /api/admin/pseo
//   GET   → 列表(?page&size) + 统计(已生成/启用/来源/覆盖书籍/启用站)
//   POST  → 生成 { bookIds?|all?, useLiveSuggest?, perBook? }
//           默认只消费库内已存词(书籍 keywords + BookTag 下拉词), useLiveSuggest=true
//           才实时调搜索引擎下拉词(≤50 本防刷)。
//   DELETE → 清空全部(body.confirm='wipe'; 单条删除见 [id]/route.ts)
// 鉴权走 proxy.ts /api/admin/* 会话校验(与相邻 admin 路由同模式, 本文件无需重复实现);
// 信封统一 { ok, data, message }(src/lib/api.ok/fail)。
// 生成服务见 src/lib/pseo-server.ts。
// ============================================================
import { db } from '@/lib/db'
import { ok, fail, readBody } from '@/lib/api'
import { withGuard, clampInt } from '../../_lib/http'
import { generatePseoPages, getPseoStats, listPseoPages } from '@/lib/pseo-server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return withGuard(async () => {
    const url = new URL(req.url)
    const page = clampInt(url.searchParams.get('page'), 1, 1, 1_000_000)
    const size = clampInt(url.searchParams.get('size'), 20, 1, 50)
    const [list, stats] = await Promise.all([listPseoPages(page, size), getPseoStats()])
    return ok({ ...list, stats })
  })
}

interface PseoGenBody {
  bookIds?: string[]
  all?: boolean
  useLiveSuggest?: boolean
  perBook?: number
}

export async function POST(req: Request) {
  return withGuard(async () => {
    const body = (await readBody<PseoGenBody>(req)) || {}
    const bookIds = Array.isArray(body.bookIds)
      ? body.bookIds.filter((x: unknown) => typeof x === 'string' && x.trim()).slice(0, 200)
      : []
    const useAll = !!body.all || bookIds.length === 0
    // 显式选择指定书籍但全部无效 → 拒绝, 防止误把「空范围」当「全部」全库跑
    if (!useAll && Array.isArray(body.bookIds) && body.bookIds.length > 0 && bookIds.length === 0) {
      return fail('指定的书籍 id 均无效')
    }
    const result = await generatePseoPages({
      bookIds: useAll ? undefined : bookIds,
      all: useAll,
      useLiveSuggest: !!body.useLiveSuggest,
      perBook: clampInt(body.perBook, 10, 1, 30),
    })
    const stats = await getPseoStats()
    return ok({ ...result, stats })
  })
}

/** 便捷: 清空全部 PSEO 页(危险操作, confirm 必须为 'wipe'; 查询串或 body 均可携带) */
export async function DELETE(req: Request) {
  return withGuard(async () => {
    const body = (await readBody<{ confirm?: string }>(req)) || {}
    const url = new URL(req.url)
    const confirm = url.searchParams.get('confirm') || body.confirm
    if (confirm !== 'wipe') return fail("缺少 confirm:'wipe', 已拒绝清空")
    const r = await db.pseoPage.deleteMany({})
    return ok({ deleted: r.count })
  })
}
