// ============================================================
// [R28-2d-x5] x2552(吾爱文学网) 全本·完本页克隆 —— 黑冰模板 Wayback 实测 1:1
// 素材: /tmp/r28-2d/x2552/x2-fulltxt.html(2023-12-04 /fulltxt/1_1.html 快照)
// 真站 DOM: 与分类页同构(#left 双 block + #centerm), 仅 dt 为「全本列表」;
//   表格数据行状态列全为「完结」(快照实证)。
// 降级: 真站全本 URL 为 /fulltxt/{分类}_{页码}.html(带分类维度) → 契约无分类参数, 固定全站完本(声明)
// ============================================================
'use client'

import type { SiteFulltextProps } from '../shared'
import { usePublic } from '../../ctx'
import { BdSub, BdTop, BookTable, C, LeftRail, Pagelink } from './_kit'

export function X2552Fulltext({ data, loading, error, page }: SiteFulltextProps) {
  const { navigate } = usePublic()
  const total = data?.total ?? 0
  const size = data?.size || 24
  const totalPages = data ? Math.max(1, Math.ceil(total / size)) : 1

  return (
    <div style={{ width: '100%', maxWidth: 960, margin: '0 auto', padding: '0 8px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ width: 190, flexShrink: 0, maxWidth: '100%' }}>
          <LeftRail />
        </div>
        <div style={{ flex: '1 1 0%', minWidth: 0, paddingLeft: 10, width: '100%' }} className="x2-centerm">
          <div style={{ height: 8 }} />
          <BdTop />
          <BdSub>
            <dl style={{ margin: 0, padding: '4px 8px 8px' }}>
              <dt style={{ lineHeight: '30px', fontSize: 14, color: C.text }}>全本列表</dt>
              <dd style={{ margin: 0 }}>
                {error ? (
                  <p style={{ padding: '18px 0', textAlign: 'center', color: 'red', fontSize: 12 }}>加载失败：{error}</p>
                ) : (
                  <BookTable books={data?.books || []} loading={loading && !data} empty={!loading && !data?.books?.length} />
                )}
              </dd>
            </dl>
          </BdSub>
          <Pagelink page={page} totalPages={totalPages} onPage={(p) => navigate({ view: 'fulltext', page: p })} />
        </div>
      </div>
    </div>
  )
}
