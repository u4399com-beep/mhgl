// ============================================================
// [R28-2f] kks101 克隆目录页 —— 复刻真站 /book/{id}/index.html
//   快照: /tmp/r28-2b/kks101/toc.html(469 行) + style.css。
//
//   真站结构(container > .mybox min-height 50vh, toc.html L35-373):
//     ① h3.mytitle.shuye(flex 两端): .bread 面包屑(首頁>分類>書名>章節列表)
//        + .titxt「書頁」(<990px 显示, style.css L2071-2082) + .sorting 正序/倒序切换
//        (toc.html L42-45, JS 按data-num重排)
//     ② .catalog > h3「書籤」(会员书籤, 登录态) — 空 ul
//     ③ .catalog > h3「目錄」+ #allchapter ul li(data-num) 33.33% 三列
//        (a: #222 16px padding 15px 0 底线 rgba(150,150,150,.2), style.css L2028-2046)
//     ④ 真站章節全量由 /ajax_novels/chapterlist 一次拉取, 无分页
//
//   降级/推断说明:
//   ① 「書籤」块为登录态书籤(#bookcase 隐藏) → 契约无书籤数据, 整块不渲染
//   ② 真站无分页(ajax 全量) → 契约目录按 100 章/页下发, 以 .pagelink 数字分页承接
//   ③ 正序/倒序为前端重排(真站同款交互) → 本地 state 翻转, 保留「倒序/正序」文案切换
//   ④ 面包屑分類链接依赖 book.categoryId, 缺失时退回首頁
// ============================================================
'use client'

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, EmptyState, Sk } from '../../bits'
import { K, cardStyle, Bread, Pager } from './parts'

export function Kks101Toc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { navigate } = usePublic()
  const [desc, setDesc] = useState(false)
  const book = data?.book ?? null
  const chapters = useMemo(() => data?.chapters ?? [], [data])

  const list = useMemo(() => (desc ? [...chapters].reverse() : chapters), [chapters, desc])
  const totalPages = data && data.tocSize > 0 ? Math.max(1, Math.ceil(data.tocTotal / data.tocSize)) : 1

  const sortingBtn: CSSProperties = { background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 400, color: K.link }

  if (error) {
    return (
      <div className="kkx-container" style={{ maxWidth: 1112, margin: '0 auto', width: '100%' }}>
        <div className="kkx-mybox" style={cardStyle}>
          <ErrorState message="章節目錄加載失敗" detail={error} />
        </div>
      </div>
    )
  }

  return (
    <div className="kkx-container" style={{ maxWidth: 1112, margin: '0 auto', width: '100%' }}>
      <div className="kkx-mybox" style={{ ...cardStyle, minHeight: '50vh' }}>
        {loading || !book ? (
          <div role="status" aria-label="章節目錄加載中">
            <Sk className="h-7 w-2/3" style={{ borderRadius: 3, marginBottom: 16 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '0 16px' }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <Sk key={i} className="h-6 w-full" style={{ borderRadius: 2, marginBottom: 10 }} />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* ① h3.mytitle.shuye */}
            <h3
              className="kkx-mytitle"
              style={{ margin: '0 0 10px', paddingBottom: 5, borderBottom: `1px solid ${K.cardLine}`, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}
            >
              <span className="kkx-toc-bread" style={{ minWidth: 0 }}>
                <Bread
                  items={[
                    { label: '首頁', onClick: () => navigate({ view: 'home' }) },
                    { label: book.category, onClick: () => navigate({ view: 'category', cat: book.categoryId || undefined }) },
                    { label: book.name, onClick: () => navigate({ view: 'book', bookId: book.id }) },
                    { label: `${book.name}章節列表` },
                  ]}
                />
              </span>
              {/* .titxt 書頁(真站 <990px 才显示, 桌面隐藏) */}
              <span className="kkx-titxt" style={{ display: 'none' }}>
                <button type="button" onClick={() => navigate({ view: 'book', bookId: book.id })} className="kkx-bread-a" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 14, color: K.primary, fontWeight: 400 }}>
                  書頁
                </button>
              </span>
              {/* .sorting 正序/倒序 */}
              <span className="kkx-sorting" style={{ fontSize: 14, fontWeight: 400, whiteSpace: 'nowrap' }}>
                {desc ? (
                  <button type="button" onClick={() => setDesc(false)} style={sortingBtn}>正序</button>
                ) : (
                  <button type="button" onClick={() => setDesc(true)} style={sortingBtn}>倒序</button>
                )}
              </span>
            </h3>

            {/* ③ .catalog 目錄 */}
            <div className="kkx-catalog">
              <h3 className="kkx-catalog-h3" style={{ background: 'rgba(140,140,140,.05)', padding: '5px 15px', position: 'relative', color: K.primary, margin: '15px 0', fontSize: 16, fontWeight: 700 }}>
                目錄
              </h3>
              {list.length === 0 ? (
                <EmptyState text="暫無章節" hint="本書尚未收錄任何章節" />
              ) : (
                <ul className="kkx-catalog-ul" style={{ listStyle: 'none', margin: 0, padding: 0, overflow: 'hidden' }}>
                  {list.map((c) => {
                    const cur = currentChapterId === c.id
                    return (
                      <li key={c.id} style={{ width: '33.333333%', float: 'left' }}>
                        <button
                          type="button"
                          onClick={() => navigate({ view: 'read', bookId: book.id, chapterId: c.id })}
                          className={`kkx-catalog-a${cur ? ' is-current' : ''}`}
                          style={{
                            display: 'block',
                            width: '100%',
                            color: cur ? K.primary : K.dark,
                            fontWeight: cur ? 700 : 400,
                            padding: '15px 0',
                            fontSize: 16,
                            borderBottom: `1px solid ${K.cardLine}`,
                            background: 'none',
                            border: 0,
                            borderBottomStyle: 'solid',
                            cursor: 'pointer',
                            textAlign: 'left',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={c.title}
                        >
                          {c.title}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* ④ 分页(契约 100 章/页, 降级说明②) */}
            <Pager page={page} totalPages={totalPages} onPick={(p) => navigate({ view: 'toc', bookId: book.id, page: p })} />
          </>
        )}
      </div>
    </div>
  )
}

