// ============================================================
// [R28-2a] aijjxs 克隆分类页 —— 复刻真站 /txt/chuanyue/ 等分类列表页
//   (快照 /tmp/r28-2a/aijjxs/aijjxs-cat.html + style.css .cenMain/.catalog 段实测)
//
//   真站结构(类名注释对应真站; 版心 = .cenMain 白卡内):
//     .articleInfo h1「{分类}小说电子书下载」(#1f3f3a 20px 居中, 底边 #eadfcd)
//     .body.filters 三行筛选胶囊(排序/大小/时间; pill: 边 var(--line) radius 999 bg #fff)
//       → 契约无排序/大小/时间参数 → 静态呈现「最新上传」激活态, 其余不渲染(降级声明②)
//     .catalog > .listbg 封面图文卡(渐变 #fffefa→#fffaf1, 边 #ecdcc6, radius 14,
//       padding-left 118: .img 92×128 + .title a 18px #0b3b2e(hover #09B295)
//       + .new/.old 上传日期 + 简介 div + .mainGreen 元信息行(small #aaa))
//     .pager 数字分页(白底方块, hover #f3ede1)
//     aside .panel.rank 「热门{分类}小说下载」 ul.lines(.no 序号 #9a3412)
//
//   降级/推断说明:
//   ① 真站封面卡第三行「文件大小：464 KB」为 txt 体积 → wordCount/1024 折算 KB
//   ② 真站筛选行(最新上传/人气最高/收藏最多/只看推荐 + 大小/时间筛选)契约无对应参数 →
//      仅渲染「最新上传」激活态静态 pill, 其余项不渲染不造假
//   ③ 真站「荐」badge 为站方推荐位 → 数据无推荐标记, 不渲染
//   ④ aside 热门榜契约外补充 fetchBooks 字数榜切片(推断级, 与首页同口径)
//   ⑤ 真站行内日期「2026-09-15 21:02:57 上传」精确到秒 → 契约 updatedAt 展示 YYYY-MM-DD
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import { BookCover } from '../../BookCover'
import { EmptyState, ErrorState, Sk } from '../../bits'
import { fmtDate } from '../../seo'
import type { BookItem } from '../../types'

// [R28-2a-14] 真站 style.css :root + .cenMain 段实测色值
const C = {
  bg: '#f3efe7',
  paper: '#fffdf8',
  muted: '#6b7280',
  line: '#e5dccd',
  brand: '#0f766e',
  brandDark: '#115e59',
  titleInk: '#0b3b2e', // .listbg .title a
  green: '#2a7b5f', // .classname chip
  no: '#9a3412',
  radius: '14px',
  shadow: '0 10px 30px rgba(17, 24, 39, 0.08)',
} as const

/** [R28-2a-15] 字数 → KB 近似(降级声明①) */
function kb(n?: number | null): string {
  return `${Math.max(1, Math.round((n || 0) / 1024))} KB`
}

export function AijjxsCategory({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()

  // [R28-2a-16] aside 热门榜(真站 .panel.rank; 契约外补充, 降级声明④)
  const [hot, setHot] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBooks({ cat, sort: 'words', page: 1, size: 10 })
      .then((d) => {
        if (alive) setHot(d.books)
      })
      .catch(() => {
        if (alive) setHot([])
      })
    return () => {
      alive = false
    }
  }, [cat])

  const books = data?.books || []
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1

  const listCard: CSSProperties = {
    position: 'relative',
    margin: '0 0 14px',
    minHeight: 144,
    padding: '16px 16px 14px 118px',
    border: '1px solid #ecdcc6',
    borderRadius: 14,
    background: 'linear-gradient(180deg, #fffefa 0%, #fffaf1 100%)',
    boxShadow: '0 8px 18px rgba(146, 109, 58, 0.08)',
    overflow: 'hidden',
  }

  if (error) {
    return (
      <div className="ajx-cat" style={{ background: C.bg, padding: '18px 14px' }}>
        <div className="mx-auto w-full" style={{ maxWidth: 1220 }}>
          <ErrorState message="分类列表加载失败" detail={error} />
        </div>
      </div>
    )
  }

  return (
    <div className="ajx-cat" style={{ background: C.bg, padding: '0 0 24px' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 1220, padding: '18px 14px 0' }}>
        <div className="ajx-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 330px', gap: 14, alignItems: 'start' }}>
          {/* 左列: 真站 .layout > .cenMain */}
          <div style={{ minWidth: 0, border: `1px solid ${C.line}`, borderRadius: C.radius, background: C.paper, boxShadow: C.shadow, padding: '14px 16px' }}>
            {/* .articleInfo h1 */}
            <h1
              style={{
                margin: '0 0 12px',
                paddingBottom: 10,
                borderBottom: '1px solid #eadfcd',
                fontSize: 20,
                lineHeight: 1.35,
                color: '#1f3f3a',
                textAlign: 'center',
              }}
            >
              {catName}电子书下载
            </h1>

            {/* .body.filters 静态激活 pill(降级声明②) */}
            <div style={{ margin: '8px 0 2px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <span style={{ border: `1px solid ${C.brand}`, borderRadius: 999, padding: '5px 10px', fontSize: 13, background: '#e8f7f4', color: C.brandDark, fontWeight: 600 }}>
                  最新上传
                </span>
              </div>
            </div>

            {/* .catalog > .listbg 封面图文卡 */}
            {loading ? (
              <div role="status" aria-label="分类列表加载中">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Sk key={i} className="mb-3.5 h-36 w-full" style={{ borderRadius: 14, background: 'rgba(255,250,241,0.9)' }} />
                ))}
              </div>
            ) : books.length === 0 ? (
              <EmptyState text="本分类暂无书籍" hint="去其他分类或首页看看" />
            ) : (
              <div className="ajx-catalog" style={{ marginTop: 4 }}>
                {books.map((b) => (
                  <div key={b.id} className="ajx-listbg" style={listCard}>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: b.id })}
                      aria-label={`查看 ${b.name}`}
                      style={{ position: 'absolute', left: 16, top: 16, width: 92, height: 128, padding: 1, border: '1px solid #d8d8d8', borderRadius: 0, background: '#fff', cursor: 'pointer' }}
                    >
                      <BookCover name={b.name} cover={b.cover} style={{ width: 88, height: 124, borderRadius: 0 }} />
                    </button>
                    <span className="ajx-title" style={{ display: 'inline-block', verticalAlign: 'baseline' }}>
                      <button
                        type="button"
                        onClick={() => navigate({ view: 'book', bookId: b.id })}
                        className="ajx-cat-title"
                        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.titleInk, fontSize: 18, fontWeight: 700, lineHeight: 1.5, textAlign: 'left' }}
                      >
                        {b.name}
                      </button>
                    </span>
                    <span style={{ marginLeft: 8, fontSize: 12, color: C.muted }}>
                      <span style={{ color: '#999' }}>{fmtDate(b.updatedAt) || '--'}</span> 上传
                    </span>
                    <div style={{ marginTop: 8, color: '#555', fontSize: 14, lineHeight: 1.82, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {b.intro || '暂无简介'}
                    </div>
                    <div style={{ display: 'block', wordBreak: 'break-word', color: '#555', fontSize: 13, lineHeight: 1.85, marginTop: 6 }}>
                      <small style={{ color: '#aaa', marginLeft: 0, marginRight: 1 }}>书籍作者：</small>
                      <span className="ajx-a" style={{ color: C.brandDark }}>
                        {b.author}
                      </span>
                      <small style={{ color: '#aaa', marginLeft: 3, marginRight: 1 }}>文件大小：</small>
                      {kb(b.wordCount)}
                      <small style={{ color: '#aaa', marginLeft: 3, marginRight: 1 }}>写作进度：</small>
                      {b.status === 'completed' ? '已完结' : b.status === 'ongoing' ? '连载中' : '未知'}
                      <small style={{ color: '#aaa', marginLeft: 3, marginRight: 1 }}>下载方式：</small>
                      全本免费
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* .pager 数字分页(真站 .pager 方块钮) */}
            {!loading && data && (
              <nav className="ajx-pager" aria-label="分页" style={{ marginTop: 14, display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                {Array.from({ length: Math.min(totalPages, 10) }).map((_, i) => {
                  const p = i + 1
                  const on = p === page
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => navigate({ view: 'category', cat, page: p })}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 34,
                        height: 30,
                        borderRadius: 8,
                        border: `1px solid ${on ? C.brand : C.line}`,
                        background: on ? C.brand : '#fff',
                        color: on ? '#fff' : C.brandDark,
                        padding: '4px 5px',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      {p}
                    </button>
                  )
                })}
                {page < totalPages && (
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'category', cat, page: page + 1 })}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 34, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.brandDark, padding: '4px 8px', fontSize: 13, cursor: 'pointer' }}
                  >
                    下一页
                  </button>
                )}
                {totalPages > 1 && (
                  <span style={{ marginLeft: 6, fontSize: 12, color: C.muted }}>
                    共 {data.total} 本 · {totalPages} 页
                  </span>
                )}
              </nav>
            )}
          </div>

          {/* aside .panel.rank 热门榜(降级声明④) */}
          <aside style={{ minWidth: 0 }}>
            <article style={{ border: `1px solid ${C.line}`, borderRadius: C.radius, background: '#fff5e6', boxShadow: C.shadow, overflow: 'hidden' }}>
              <h3
                style={{
                  position: 'relative',
                  margin: 0,
                  padding: '12px 12px 12px 20px',
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#1f3f3a',
                  borderBottom: '1px solid rgba(255, 214, 224, 0.28)',
                }}
              >
                <span aria-hidden style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 4, height: 18, borderRadius: 3, background: 'linear-gradient(180deg, #0f766e, #b45309)' }} />
                热门{catName}下载
              </h3>
              <div style={{ padding: '4px 12px 12px' }}>
                {hot === null ? (
                  <Sk className="h-48 w-full" style={{ borderRadius: 10, background: 'rgba(255,250,240,0.9)' }} />
                ) : hot.length === 0 ? (
                  <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>榜单暂无数据</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {hot.map((b, i) => (
                      <li key={b.id} style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'center', borderBottom: `1px dashed ${C.line}`, padding: '7px 0' }}>
                        <span style={{ display: 'inline-block', minWidth: 18, textAlign: 'center', fontWeight: 700, color: C.no }}>{i + 1}</span>
                        <button
                          type="button"
                          onClick={() => navigate({ view: 'book', bookId: b.id })}
                          className="ajx-a"
                          style={{ flex: 1, minWidth: 0, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.brandDark, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}
                        >
                          {b.name}
                        </button>
                        <span style={{ color: C.muted, fontSize: 12, whiteSpace: 'nowrap' }}>{b.author}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          </aside>
        </div>
      </div>
    </div>
  )
}

