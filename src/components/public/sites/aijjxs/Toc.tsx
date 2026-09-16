// ============================================================
// [R28-2a] aijjxs 克隆目录页 —— 复刻真站 /read/57361/ (书内章节列表独立页)
//   (快照 /tmp/r28-2a/aijjxs/aijjxs-toc.html 内联 <style> 全量实测)
//
//   真站结构(类名注释对应真站; 独立 read-wrap 白卡, 与主站米黄皮不同色系):
//     .read-wrap max-1200 → .read-panel(bg #fff 边 #e5e8ed radius 12 shadow
//       rgba(12,22,40,.06) padding 18):
//       .read-title h1 28px #1f2d3d「{书名}全文阅读」(≤640px 22px)
//       .read-meta 14px #607189「作者：X | 大小：X KB | 上传时间：X」+ a TXT下载(#1f8b4c)
//       .read-intro 内容提要(bg #f8fafc 边 #e7edf3 radius 10 #34495e lh 1.8)
//       .chapter-list grid 3 列 gap 8(≤960px 2 列, ≤640px 1 列):
//         li(bg #fff 边 #e9eef5 radius 8 padding 8px 10px nowrap ellipsis,
//            a #2d3b50 visited #999, hover 边 #cfd9e8 bg #f9fbff)
//       .read-foot 13px #68798e
//
//   降级/推断说明:
//   ① 真站单页平铺全部章节无分页 → 契约 fetchBook 100 章/页 → 尾部补 .pager 翻页
//   ② 当前章高亮: 真站以 :visited #999 标已读 → 契约有 currentChapterId → 当前章
//      以 #999 弱化 + 左侧青竖条双语义呈现(visited 近似)
//   ③ .read-meta「大小」为 txt 体积 → wordCount/1024 折算 KB
// ============================================================
'use client'

import type { CSSProperties } from 'react'
import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { fmtDate } from '../../seo'

// [R28-2a-20] 真站 toc 内联 <style> 实测色值
const R = {
  wrap: 1200,
  panelBg: '#ffffff',
  panelBorder: '#e5e8ed',
  shadow: '0 10px 24px rgba(12, 22, 40, 0.06)',
  title: '#1f2d3d',
  meta: '#607189',
  metaLink: '#1f8b4c',
  introBg: '#f8fafc',
  introBorder: '#e7edf3',
  introInk: '#34495e',
  liBorder: '#e9eef5',
  liInk: '#2d3b50',
  visited: '#999999',
  hoverBorder: '#cfd9e8',
  hoverBg: '#f9fbff',
  foot: '#68798e',
} as const

function kb(n?: number | null): string {
  return `${Math.max(1, Math.round((n || 0) / 1024))} KB`
}

export function AijjxsToc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const totalPages = data ? Math.max(1, data.tocTotalPages || 1) : 1

  const liStyle = (current: boolean): CSSProperties => ({
    background: '#fff',
    border: `1px solid ${current ? R.hoverBorder : R.liBorder}`,
    borderRadius: 8,
    padding: '8px 10px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: current ? R.visited : R.liInk,
  })

  if (error) {
    return (
      <div className="ajx-toc" style={{ background: '#f3efe7', padding: '18px 10px' }}>
        <ErrorState message="目录加载失败" detail={error} />
      </div>
    )
  }

  if (loading || !book) {
    return (
      <div className="ajx-toc" style={{ background: '#f3efe7', padding: '14px 10px 24px' }} role="status" aria-label="目录加载中">
        <div className="mx-auto w-full" style={{ maxWidth: R.wrap }}>
          <Sk className="h-24 w-full" style={{ borderRadius: 12, background: 'rgba(255,255,255,0.9)' }} />
          <Sk className="mt-3 h-96 w-full" style={{ borderRadius: 12, background: 'rgba(255,255,255,0.9)' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="ajx-toc" style={{ background: '#f3efe7', padding: '14px 10px 24px' }}>
      {/* .read-wrap > .read-panel */}
      <div className="mx-auto w-full" style={{ maxWidth: R.wrap }}>
        <article style={{ background: R.panelBg, border: `1px solid ${R.panelBorder}`, borderRadius: 12, boxShadow: R.shadow, padding: 18 }}>
          {/* .read-title */}
          <h1 style={{ fontSize: 28, lineHeight: 1.3, margin: '6px 0 10px', color: R.title }} className="ajx-read-title">
            {book.name}全文阅读
          </h1>
          {/* .read-meta */}
          <div style={{ fontSize: 14, color: R.meta, marginBottom: 12 }}>
            作者：{book.author} &nbsp;|&nbsp; 大小：{kb(book.wordCount)} &nbsp;|&nbsp; 上传时间：{fmtDate(book.updatedAt) || '--'} &nbsp;|&nbsp;{' '}
            <a
              href={`/api/public/download?book=${encodeURIComponent(book.id)}`}
              target="_blank"
              rel="noreferrer"
              className="ajx-toc-dl"
              style={{ color: R.metaLink, textDecoration: 'none' }}
            >
              TXT下载
            </a>
          </div>
          {/* .read-intro 内容提要 */}
          <div style={{ background: R.introBg, border: `1px solid ${R.introBorder}`, borderRadius: 10, padding: '12px 14px', lineHeight: 1.8, color: R.introInk, marginBottom: 14, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            内容提要：{book.intro || '暂无简介'}
          </div>
          {/* .chapter-list */}
          {chapters.length === 0 ? (
            <p style={{ margin: 0, color: R.meta, fontSize: 14 }}>暂无章节数据</p>
          ) : (
            <ul className="ajx-chapter-list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
              {chapters.map((c) => {
                const current = currentChapterId === c.id
                return (
                  <li key={c.id} className="ajx-toc-item" style={liStyle(current)}>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'read', chapterId: c.id })}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'none',
                        border: 0,
                        padding: 0,
                        cursor: 'pointer',
                        color: current ? R.visited : R.liInk,
                        fontSize: 14,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {current && <span aria-hidden style={{ flex: '0 0 auto', width: 3, height: 14, borderRadius: 2, background: '#1f8b4c' }} />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {/* 翻页(降级声明①) */}
          {totalPages > 1 && (
            <nav className="ajx-pager" aria-label="目录分页" style={{ marginTop: 14, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {Array.from({ length: Math.min(totalPages, 10) }).map((_, i) => {
                const p = i + 1
                const on = p === page
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => navigate({ view: 'toc', bookId: book.id, page: p })}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 34,
                      height: 30,
                      borderRadius: 8,
                      border: `1px solid ${on ? '#1f8b4c' : R.panelBorder}`,
                      background: on ? '#1f8b4c' : '#fff',
                      color: on ? '#fff' : R.liInk,
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
                  onClick={() => navigate({ view: 'toc', bookId: book.id, page: page + 1 })}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 30, borderRadius: 8, border: `1px solid ${R.panelBorder}`, background: '#fff', color: R.liInk, padding: '0 10px', fontSize: 13, cursor: 'pointer' }}
                >
                  下一页
                </button>
              )}
            </nav>
          )}
          {/* .read-foot */}
          <div style={{ marginTop: 14, color: R.foot, fontSize: 13, lineHeight: 1.8 }}>
            共 {data?.tocTotal ?? chapters.length} 章 · 当前第 {page} 页 · 点击章节开始阅读，支持键盘 ←/→ 翻章。
          </div>
        </article>
      </div>
    </div>
  )
}

