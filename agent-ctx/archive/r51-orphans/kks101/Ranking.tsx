// ============================================================
// [R28-2f] kks101 克隆排行榜页 —— 复刻真站 /novels/newhot_..../weekvisit_..../allvote_....
//   快照: /tmp/r28-2b/kks101/hot.html(1041 行, 抓取时为 newhot 新書榜) + style.css。
//
//   真站结构(container > .mybox(bg:none), hot.html L91-976):
//     ① .weekl_yrank 榜型切换条(hot.html L93-100): 不限/連載/全本/人氣/推薦/新書 六钮,
//        浅蓝盒(#56a6c3 边 rgb(232,244,255) 底), active 深色加粗, style.css L1902-1941
//     ② .listbox.clearfix: .listleft 左栏 .droplist 分类过滤(全部分類+10 类, 120px 宽,
//        active 白底左蓝条 3px, style.css L2661-2685) + .listright .newbox 榜单行
//        (imgbox 封面 + h3 + labelbox 作者/連載 + 简介两行 + 最近章節 + newright
//         序号圆徽 26px(前3红/橙/黄) + 點擊閱讀/加入書架 双钮, L1841-1900)
//     ③ .pages > .pagelink 数字分页(hot.html L976, 16 页)
//
//   降级/推断说明:
//   ① 真站六档榜型(連載/全本/人氣/推薦/新書×不限) → 契约三榜 words/latest/new,
//      榜名以 RankingBoard.label 下发(words≈人氣·推薦近似, latest≈更新, new≈新書),
//      連載/全本 切换无契约 → 不渲染
//   ② .listleft 分类过滤为榜内筛选(换 URL 重取) → 契约榜单为全站, 分类胶囊改为
//      跳转对应分类视图的近似导航(真站文案保留)
//   ③ 榜单行序号徽章真站由 CSS counter 逐行编号(1-3 名红/橙/黄) → 按真实序号渲染
//   ④ 真站榜单行 newright.piaos span 为空占位(点击/票数由服务端注入, 快照中无值)
//      → 不显示数值; 分页契约无对应(boards 一次性 top60) → 不渲染分页
//   ⑤ 行尾「加入書架」会员按钮 → 以「章節目錄」出口替代(同 parts.NewBoxRow 统一降级)
// ============================================================
'use client'

import type { SiteRankingProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, EmptyState, Sk } from '../../bits'
import type { CategoryItem } from '../../types'
import { K, KContainer, cardStyle, CatDroplist, NewBoxRow, useCategories } from './parts'

export function Kks101Ranking({ boards, active, onBoard, loading, error }: SiteRankingProps) {
  const { navigate } = usePublic()
  const cats = useCategories()
  const current = boards.find((b) => b.key === active) ?? boards[0] ?? null

  const pickCat = (c: CategoryItem) => navigate({ view: 'category', cat: c.id || undefined, page: 1 })

  return (
    <KContainer>
      <div className="kkx-mybox" style={{ ...cardStyle, background: 'none', padding: 0, boxShadow: 'none', margin: '16px 0' }}>
        {/* ① .weekl_yrank 榜型切换条 */}
        <div className="kkx-droplist" style={{ border: `1px solid ${K.chipLine}`, background: K.chipBg, borderRadius: 5, padding: 15, marginBottom: 15, textAlign: 'center' }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 0 }}>
            {boards.map((b) => {
              const on = b.key === active
              return (
                <li key={b.key} style={{ display: 'inline-block', fontSize: 14 }}>
                  <button
                    type="button"
                    onClick={() => onBoard(b.key)}
                    className={`kkx-droplist-a${on ? ' is-active' : ''}`}
                    style={{
                      background: 'none',
                      border: 0,
                      borderRight: '1px solid #dfecf0',
                      padding: '0 10px 0 0',
                      margin: '0 10px 0 0',
                      cursor: 'pointer',
                      lineHeight: '16px',
                      fontSize: on ? 15 : 14,
                      fontWeight: on ? 700 : 400,
                      color: on ? '#404040' : K.chipText,
                    }}
                  >
                    {b.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* ② .listbox: listleft 分类栏 + listright 榜单行 */}
        <div className="kkx-listbox" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="kkx-listleft" style={{ width: 120, flexShrink: 0 }}>
            <CatDroplist activeName="__none__" onPick={pickCat} cats={cats} />
          </div>
          <div className="kkx-listright" style={{ flex: 1, minWidth: 0, background: '#fff', borderRadius: 3, padding: '0 15px 15px', boxShadow: K.cardShadow }}>
            {error ? (
              <div style={{ padding: '24px 0' }}>
                <ErrorState message="榜單加載失敗" detail={error} />
              </div>
            ) : loading ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} role="status" aria-label="榜單加載中">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} style={{ borderBottom: `1px solid ${K.line}`, padding: '20px 0' }}>
                    <Sk className="h-32 w-full" style={{ borderRadius: 3 }} />
                  </li>
                ))}
              </ul>
            ) : !current || current.books.length === 0 ? (
              <div style={{ padding: '24px 0' }}>
                <EmptyState text="榜單暫無書籍" />
              </div>
            ) : (
              <div className="kkx-newbox">
                <ul id="kkx-rank-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {current.books.map((b, i) => (
                    <NewBoxRow key={b.id} book={b} navigate={navigate} rank={i} showCat={false} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </KContainer>
  )
}

