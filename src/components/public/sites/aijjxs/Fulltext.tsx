// ============================================================
// [R28-2a] aijjxs 克隆全站书库页(Fulltext 视图) —— 复刻真站 /txt/ 全站最新上传书库
//   (快照 /tmp/r28-2a/aijjxs/aijjxs-txtlist.html + style.css .saixuan 段实测)
//
//   真站结构(类名注释对应真站):
//     section.panel h3「女生小说最新上传」+ .saixuan 筛选面板(边 #ead7bc radius 12,
//       渐变 #fffdf9→#fff7ec, dl 行 dashed #e8d7bf: 排序/时代/大小/年度)
//       → 契约数据面仅 status:'completed' 分页清单 → 筛选面板以静态「最新上传/下载排行/
//          收藏排行/只看推荐」首项激活呈现(其余筛维无数据, 不渲染不造假)
//     .body.grid2 > .book 卡(h4 title + .badge 荐 + .meta 作者·分类·进度·大小·日期 + .desc)
//     .pager 数字分页
//
//   页型映射声明: 真站 /txt/ 为「全站书库筛选列表」(非严格意义完本列表); 本站 Fulltext
//   视图契约固定拉取 status:'completed' → 以真站书库页形态呈现完本清单, 标题取
//   「全本小说最新上传」; 真站无独立 /quanben/ 页, 此为最近似页型(推断级)。
//
//   降级/推断说明:
//   ① 真站 .badge 荐 为站方推荐位 → 数据无推荐标记, 不渲染
//   ② .meta 行「admin」上传者 → 契约无上传者字段, 不渲染
//   ③ 筛选面板其余筛维(时代背景/文件大小/年度)契约无对应 → 不渲染
// ============================================================
'use client'

import type { CSSProperties } from 'react'
import type { SiteFulltextProps } from '../shared'
import { usePublic } from '../../ctx'
import { BookCover } from '../../BookCover'
import { EmptyState, ErrorState, Sk } from '../../bits'
import { fmtDate } from '../../seo'
import type { BookItem } from '../../types'

const C = {
  bg: '#f3efe7',
  paper: '#fffdf8',
  muted: '#6b7280',
  line: '#e5dccd',
  brandDark: '#115e59',
  radius: '14px',
  shadow: '0 10px 30px rgba(17, 24, 39, 0.08)',
} as const

function kb(n?: number | null): string {
  return `${Math.max(1, Math.round((n || 0) / 1024))} KB`
}

export function AijjxsFulltext({ data, loading, error, page }: SiteFulltextProps) {
  const { navigate } = usePublic()
  const books = data?.books || []
  const total = data?.total ?? 0
  const size = data?.size ?? 24
  const totalPages = data ? Math.max(1, Math.ceil(total / size)) : 1

  const panel: CSSProperties = { border: `1px solid ${C.line}`, borderRadius: C.radius, background: C.paper, boxShadow: C.shadow, overflow: 'hidden' }

  const bookCard = (b: BookItem): React.ReactNode => (
    <div key={b.id} className="ajx-book" style={{ border: `1px solid ${C.line}`, borderRadius: 12, background: '#fff', padding: 10, overflow: 'hidden' }}>
      <div style={{ overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => navigate({ view: 'book', bookId: b.id })}
          style={{ float: 'left', marginRight: 10, padding: 0, border: 0, background: 'none', cursor: 'pointer' }}
          aria-label={`查看 ${b.name}`}
        >
          <BookCover name={b.name} cover={b.cover} style={{ width: 88, height: 122, borderRadius: 8 }} />
        </button>
        <h4 style={{ margin: '2px 0 4px', fontSize: 15, lineHeight: 1.5 }}>
          <button
            type="button"
            onClick={() => navigate({ view: 'book', bookId: b.id })}
            className="ajx-book"
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.brandDark, fontSize: 15, fontWeight: 600, textAlign: 'left' }}
          >
            {b.name}
          </button>
        </h4>
        <div className="ajx-meta" style={{ color: C.muted, fontSize: 12, marginTop: 4, clear: 'both' }}>
          <span className="ajx-a">{b.author}</span> · <small style={{ color: '#2a7b5f' }}>{b.category}</small> ·{' '}
          {b.status === 'completed' ? '已完结' : b.status === 'ongoing' ? '连载中' : '未知'} · {kb(b.wordCount)} · {fmtDate(b.updatedAt) || '--'} 上传
        </div>
      </div>
      <div style={{ marginTop: 8, padding: 10, borderRadius: 10, border: '1px solid #ece2d2', background: '#fff', color: '#374151', fontSize: 14, lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {b.intro || '暂无简介'}
      </div>
    </div>
  )

  if (error) {
    return (
      <div className="ajx-ft" style={{ background: C.bg, padding: '18px 14px' }}>
        <div className="mx-auto w-full" style={{ maxWidth: 1220 }}>
          <ErrorState message="书库加载失败" detail={error} />
        </div>
      </div>
    )
  }

  return (
    <div className="ajx-ft" style={{ background: C.bg, padding: '0 0 24px' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 1220, padding: '18px 14px 0' }}>
        <section style={panel}>
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
            全本小说最新上传
            <small style={{ fontSize: 13, color: C.muted, marginLeft: 8 }}>{loading ? '加载中…' : `共 ${total} 本`}</small>
          </h3>

          {/* .saixuan 静态首项激活(降级声明③) */}
          <div
            className="ajx-saixuan"
            style={{
              margin: '12px 14px 0',
              padding: '12px 14px',
              border: '1px solid #ead7bc',
              borderRadius: 12,
              background: 'linear-gradient(180deg, #fffdf9 0%, #fff7ec 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
            }}
          >
            <dl style={{ margin: 0, padding: '8px 0', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <dt style={{ flex: '0 0 auto', color: '#7a6750', fontSize: 13 }}>排序：</dt>
              <dd style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ border: `1px solid ${C.brandDark}`, borderRadius: 999, padding: '3px 10px', fontSize: 13, background: '#e8f7f4', color: C.brandDark, fontWeight: 600 }}>最新上传</span>
                <span style={{ border: `1px solid ${C.line}`, borderRadius: 999, padding: '3px 10px', fontSize: 13, background: '#fff', color: C.muted }}>下载排行</span>
                <span style={{ border: `1px solid ${C.line}`, borderRadius: 999, padding: '3px 10px', fontSize: 13, background: '#fff', color: C.muted }}>收藏排行</span>
                <span style={{ border: `1px solid ${C.line}`, borderRadius: 999, padding: '3px 10px', fontSize: 13, background: '#fff', color: C.muted }}>只看推荐</span>
              </dd>
            </dl>
          </div>

          {/* .body.grid2 书卡 */}
          <div style={{ padding: 14 }}>
            {loading ? (
              <div className="ajx-grid2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }} role="status" aria-label="书库加载中">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Sk key={i} className="h-44 w-full" style={{ borderRadius: 12, background: 'rgba(255,250,241,0.9)' }} />
                ))}
              </div>
            ) : books.length === 0 ? (
              <EmptyState text="书库暂无完本书籍" hint="去分类页看看连载中的书吧" />
            ) : (
              <div className="ajx-grid2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
                {books.map(bookCard)}
              </div>
            )}

            {/* .pager 数字分页 */}
            {!loading && data && totalPages > 1 && (
              <nav className="ajx-pager" aria-label="书库分页" style={{ marginTop: 14, display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                {Array.from({ length: Math.min(totalPages, 10) }).map((_, i) => {
                  const p = i + 1
                  const on = p === page
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => navigate({ view: 'fulltext', page: p })}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 34,
                        height: 30,
                        borderRadius: 8,
                        border: `1px solid ${on ? C.brandDark : C.line}`,
                        background: on ? C.brandDark : '#fff',
                        color: on ? '#fff' : C.brandDark,
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
                    onClick={() => navigate({ view: 'fulltext', page: page + 1 })}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 30, borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.brandDark, padding: '0 10px', fontSize: 13, cursor: 'pointer' }}
                  >
                    下一页
                  </button>
                )}
                <span style={{ marginLeft: 6, fontSize: 12, color: C.muted }}>
                  第 {page}/{totalPages} 页
                </span>
              </nav>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

