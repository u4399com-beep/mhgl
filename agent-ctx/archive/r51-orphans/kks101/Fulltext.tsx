// ============================================================
// [R28-2f] kks101 克隆全本·完本页 —— 复刻真站 /novels/full/{cat}_{page}.html
//   快照: /tmp/r28-2b/kks101/full.html(783 行) + style.css。
//
//   真站结构(container > .mybox, full.html L94-715):
//     ① h3.mytitle「小說分類」+ .weekl_yrank > ul.droplist 分类胶囊(L96-123)
//     ② .newnovels.newnovels2「完本小說推薦」10 张封面卡(L124-231)
//     ③ li.col-88「點擊排行」+ .newbox 完本书目行(同分类页行式, L235-714)
//     ④ .pages > .pagelink 数字分页(L715)
//
//   降级/推断说明:
//   ① 分类胶囊真站为完本榜内筛选(/novels/full/{cat}_{page}) → SiteFulltextProps 无
//      cat 契约, 胶囊改为跳转对应分类视图的近似导航(全部分類 active 保留)
//   ② 「完本小說推薦」为运营推荐位 → 取当前页前 10 本(近似)
//   ③ 「點擊排行」沿用真站块标题; 行式统一走 parts.NewBoxRow(加入書架 → 章節目錄 降级)
//   ④ 行 labelbox 真站仅 作者/狀態 两标签(全本页无分类标签) → showCat=false 对齐
// ============================================================
'use client'

import type { SiteFulltextProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, EmptyState, Sk } from '../../bits'
import type { CategoryItem } from '../../types'
import { K, KContainer, cardStyle, MyTitle, CatDroplist, NewBoxRow, NovelCard, Pager, useCategories } from './parts'

export function Kks101Fulltext({ data, loading, error, page }: SiteFulltextProps) {
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
          <ErrorState message="完本列表加載失敗" detail={error} />
        </div>
      </KContainer>
    )
  }

  return (
    <KContainer>
      <div className="kkx-mybox" style={cardStyle}>
        {/* ① 小說分類 droplist */}
        <MyTitle>小說分類</MyTitle>
        <CatDroplist activeName="全部分類" onPick={pickCat} cats={cats} />

        {/* ② 完本小說推薦 封面卡 */}
        <div className="kkx-newnovels kkx-nv2">
          <MyTitle>完本小說推薦</MyTitle>
          {loading ? (
            <div role="status" aria-label="完本推薦加載中">
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

        {/* ③ 點擊排行 完本列表 */}
        <MyTitle>點擊排行</MyTitle>
        {loading ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} role="status" aria-label="完本列表加載中">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} style={{ borderBottom: `1px solid ${K.line}`, padding: '20px 0' }}>
                <Sk className="h-36 w-full" style={{ borderRadius: 3 }} />
              </li>
            ))}
          </ul>
        ) : books.length === 0 ? (
          <EmptyState text="暫無完本書籍" hint="完本書籍正在整理中" />
        ) : (
          <ul className="kkx-newbox" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {books.map((b, i) => (
              <NewBoxRow key={b.id} book={b} navigate={navigate} rank={i < 3 ? i : undefined} showCat={false} />
            ))}
          </ul>
        )}

        {/* ④ .pagelink 分页 */}
        {!loading && data ? <Pager page={page} totalPages={totalPages} onPick={(p) => navigate({ view: 'fulltext', page: p })} /> : null}
      </div>
    </KContainer>
  )
}

