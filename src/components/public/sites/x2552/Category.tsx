// ============================================================
// [R28-2d-x4] x2552(吾爱文学网) 分类页克隆 —— 黑冰模板 Wayback 实测 1:1
// 素材: /tmp/r28-2d/x2552/x2-list.html(2023-12-04 /list/1_1.html 快照)
// 真站 DOM: .main > #left(会员推荐+排行榜双 block, 见 _kit.LeftRail) + #centerm
//   (#centerm: .cl 8px + .bdtop + .bdsub > dl#content: dt「{分类名} - 分类列表」
//    + dd > table 六列 18/46/13/8/9/6(见 _kit.BookTable) + .pagelink 分页条)
// 降级: ①dt 副标题真站为「全部列表」类文案 → 统一「分类列表」 ②大小列 K 值换算口径见 BookTable
// ============================================================
'use client'

import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { BdSub, BdTop, BookTable, C, LeftRail, Pagelink } from './_kit'

export function X2552Category({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()
  const total = data?.total ?? 0
  const size = data?.size || 24
  const totalPages = data ? Math.max(1, Math.ceil(total / size)) : 1

  return (
    <div style={{ width: '100%', maxWidth: 960, margin: '0 auto', padding: '0 8px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* #left 双 block(实测) */}
        <div style={{ width: 190, flexShrink: 0, maxWidth: '100%' }}>
          <LeftRail />
        </div>
        {/* #centerm */}
        <div style={{ flex: '1 1 0%', minWidth: 0, paddingLeft: 10, width: '100%' }} className="x2-centerm">
          <div style={{ height: 8 }} />
          <BdTop />
          <BdSub>
            <dl style={{ margin: 0, padding: '4px 8px 8px' }}>
              <dt style={{ lineHeight: '30px', fontSize: 14, color: C.text }}>{catName || '全部分类'} - 分类列表</dt>
              <dd style={{ margin: 0 }}>
                {error ? (
                  <p style={{ padding: '18px 0', textAlign: 'center', color: 'red', fontSize: 12 }}>加载失败：{error}</p>
                ) : (
                  <BookTable books={data?.books || []} loading={loading && !data} empty={!loading && !data?.books?.length} />
                )}
              </dd>
            </dl>
          </BdSub>
          {/* 真站 .pagelink: border #E4E4E4 bg #F2F2F2 分页条(见 _kit.Pagelink) */}
          <Pagelink page={page} totalPages={totalPages} onPage={(p) => navigate({ view: 'category', cat, page: p })} />
        </div>
      </div>
    </div>
  )
}
