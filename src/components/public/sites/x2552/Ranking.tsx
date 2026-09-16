// ============================================================
// [R28-2d-x6] x2552(吾爱文学网) 排行榜页克隆 —— 黑冰模板 家族标准(独立 /top/ 页无存档)
// 素材: 真站 /top/{sort}_{page}.html 12 榜入口实证(x2-list.html #left 快照实链:
//   allvisit/allvote/monthvisit/monthvote/weekvisit/weekvote/postdate/lastupdate/
//   authorupdate/masterupdate/goodnum/size) + toplist.php?sort=monthvisit 实链;
//   页面本体无 Wayback 存档 → 按站内六列表格家族标准布局(推断级)。
// 降级: ①真站 12 榜 → 数据面三榜(更新榜 latest/字数榜 words/新书榜 new), tab 文案
//   对齐黑冰榜名口径(更新时间/字数排行/入库时间) ②榜单数值列(点击/票数)无契约 → 表格
//   「大小」列沿用 K 值口径 ③左栏还原(与站内其他页一致)
// ============================================================
'use client'

import type { SiteRankingProps } from '../shared'
import { BdSub, BdTop, BookTable, C, GRAY_BTN, LeftRail } from './_kit'

/** 真站 12 榜名 → 契约三榜(顺序: 更新/字数/入库; 未覆盖 9 榜为点击/票数类无数据面) */
const TAB_LABEL: Record<string, string> = { latest: '更新时间榜', words: '字数排行', new: '入库时间榜' }

export function X2552Ranking({ boards, active, onBoard, loading, error }: SiteRankingProps) {
  const cur = boards.find((b) => b.key === active) || null
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
              <dt style={{ lineHeight: '30px', fontSize: 14, color: C.text }}>排行榜</dt>
              {/* 榜 tab(黑冰灰钮形态: GRAY_BTN 渐变+边; 激活红字 #FF3300) */}
              <dd style={{ margin: '0 0 6px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="tablist" aria-label="榜单切换">
                  {boards.map((b) => {
                    const on = b.key === active
                    return (
                      <button
                        key={b.key}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => onBoard(b.key)}
                        style={{
                          height: 30,
                          lineHeight: '28px',
                          padding: '0 12px',
                          fontSize: 12,
                          background: on ? C.blueBg : GRAY_BTN,
                          border: `1px solid ${on ? C.blueTop : C.border}`,
                          color: on ? C.hover : C.text,
                          cursor: 'pointer',
                        }}
                      >
                        {TAB_LABEL[b.key] || b.label}
                      </button>
                    )
                  })}
                </div>
              </dd>
              <dd style={{ margin: 0 }}>
                {error && !cur ? (
                  <p style={{ padding: '18px 0', textAlign: 'center', color: 'red', fontSize: 12 }}>加载失败：{error}</p>
                ) : (
                  <BookTable books={cur?.books || []} loading={loading && !cur} empty={!loading && !!cur && !cur.books.length} />
                )}
              </dd>
            </dl>
          </BdSub>
        </div>
      </div>
    </div>
  )
}
