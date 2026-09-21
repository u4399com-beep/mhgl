// ============================================================
// [R28-2f] kks101 克隆分类页 —— 复刻真站 /novels/class/{cat}_{page}.html
//   快照: /tmp/r28-2b/kks101/class.html(793 行) + style.css。
//
//   真站结构(container > .mybox, class.html L95-731):
//     ① h3.mytitle「小說分類」+ .weekl_yrank > ul.droplist 分类胶囊
//        (全部分類/玄幻奇幻/…/其他類型 11 项, active 加粗深色, style.css L1902-1941)
//     ② .newnovels.newnovels2「小說推薦」10 张封面卡(20%/14.285% 宽, L1227-1295)
//     ③ li.col-88「點擊排行」+ .newbox > ul#article_list_content 图文行
//        (imgbox 100×140 + h3 18px + labelbox 三标签 + 简介两行 + zxzj 最近章節
//         + newright 红钮「點擊閱讀」/白钮「加入書架」, L1759-1900)
//     ④ .pages > .pagelink 数字分页(<< strong > >>, L2919-2944)
//
//   降级/推断说明:
//   ① 真站行尾「加入書架」为会员收藏(addbookcase ajax)无公共契约 → 换「章節目錄」
//      出口(同为站内导航, 形态保留双钮), 已在 parts.NewBoxRow 统一声明
//   ② 「點擊排行」为真站该列表块标题(带 piaos 排名徽章占位) → 契约行为分类书目列表,
//      保留标题文案, 前三名徽章以真实序号渲染(点击量数据无来源, 不显示数值)
//   ③ 小說推薦 10 卡真站为站方运营位 → 取当前分类列表前 10 本(近似)
//   ④ labelbox 三标签 = 作者/分類/連載狀態, 真站作者可点 /author/ 页 → 作者在本站
//      无独立视图, 纯文本呈现
// ============================================================
'use client'

import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, EmptyState, Sk } from '../../bits'
import type { CategoryItem } from '../../types'
import { K, KContainer, cardStyle, MyTitle, CatDroplist, NewBoxRow, NovelCard, Pager, useCategories } from './parts'

export function Kks101Category({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()
  const cats = useCategories()
  const books = data?.books ?? []
  const total = data?.total ?? 0
  const totalPages = data ? Math.max(1, Math.ceil(total / (data.size || 24))) : 1
  const recommend = books.slice(0, 10)

  const pickCat = (c: CategoryItem) => navigate({ view: 'category', cat: c.id || undefined, page: 1 })

  if (error) {
    return (
      <KContainer>
        <div className="kkx-mybox" style={cardStyle}>
          <ErrorState message="分類列表加載失敗" detail={error} />
        </div>
      </KContainer>
    )
  }

  return (
    <KContainer>
      <div className="kkx-mybox" style={cardStyle}>
        {/* ① 小說分類 droplist */}
        <MyTitle>小說分類</MyTitle>
        <CatDroplist activeName={catName || '全部分類'} onPick={pickCat} cats={cats} />

        {/* ② 小說推薦 封面卡 */}
        <div className="kkx-newnovels kkx-nv2">
          <MyTitle>小說推薦</MyTitle>
          {loading ? (
            <div role="status" aria-label="小說推薦加載中">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 8 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Sk key={i} className="w-full" style={{ height: 170, borderRadius: 3 }} />
                ))}
              </div>
            </div>
          ) : recommend.length > 0 ? (
            <ul style={{ listStyle: 'none', margin: '0 -10px', padding: 0, fontSize: 0 }}>
              {recommend.map((b) => (
                <NovelCard key={b.id} book={b} navigate={navigate} h={180} />
              ))}
            </ul>
          ) : null}
        </div>

        {/* ③ 點擊排行 列表 */}
        <MyTitle>點擊排行</MyTitle>
        {loading ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} role="status" aria-label="列表加載中">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} style={{ borderBottom: `1px solid ${K.line}`, padding: '20px 0' }}>
                <Sk className="h-36 w-full" style={{ borderRadius: 3 }} />
              </li>
            ))}
          </ul>
        ) : books.length === 0 ? (
          <EmptyState text="本分類暫無書籍" hint="換個分類或回首頁看看" />
        ) : (
          <ul className="kkx-newbox" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {books.map((b, i) => (
              <NewBoxRow key={b.id} book={b} navigate={navigate} rank={i < 3 ? i : undefined} showCat />
            ))}
          </ul>
        )}

        {/* ④ .pagelink 分页 */}
        {!loading && data ? <Pager page={page} totalPages={totalPages} onPick={(p) => navigate({ view: 'category', cat, page: p })} /> : null}
      </div>
    </KContainer>
  )
}

