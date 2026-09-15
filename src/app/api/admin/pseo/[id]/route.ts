// ============================================================
// [R27-2-5] PSEO 单页管理 — DELETE /api/admin/pseo/[id]
// 鉴权走 proxy.ts /api/admin/* 会话校验(与相邻 admin [id] 路由同模式)。
// ============================================================
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { withGuard } from '../../../_lib/http'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withGuard(async () => {
    const { id } = await params
    if (!id) return fail('缺少 id')
    try {
      await db.pseoPage.delete({ where: { id } })
    } catch (e) {
      const code = (e as { code?: string })?.code
      if (code === 'P2025') return fail('页面不存在或已被删除', 404)
      throw e
    }
    return ok({ deleted: true, id })
  })
}
