// ============================================================
// [R26-1] 久久小说下载网 克隆目录页(独立视图 view=toc) —— 复刻真站 /read/57361/
//   「{书名}全文阅读 + 完整章节列表」页(快照 /tmp/r26/aijjxs-read.html, 页内 <style> 实测)。
//
//   真站结构(div.read-wrap > article.read-panel, 内联样式实测):
//     .read-wrap   max-width 1200px / margin 14px auto / padding 0 10px
//     .read-panel  #fff / 边 #e5e8ed / radius 12 / shadow 0 10px 24px rgba(12,22,40,.06) / padding 18px
//     h1.read-title 28px #1f2d3d(「{书名}全文阅读」)
//     .read-meta   14px #607189(「作者：x | 大小：x | 上传时间：x | TXT下载」, 链接 #1f8b4c)
//     .read-intro  bg #f8fafc / 边 #e7edf3 / radius 10 / padding 12px 14px / lh 1.8 / #34495e(「内容提要：…」)
//     ul.chapter-list  grid 3 列 gap 8px(≤960px 2 列, ≤640px 1 列);
//       li: #fff / 边 #e9eef5 / radius 8 / padding 8px 10px / 单行省略; a #2d3b50(已读 #999);
//       hover 边 #cfd9e8 / bg #f9fbff(由 index.ts .ajx-toc-item:hover 承担)
//     .read-foot   margin-top 14 / #68798e / 13px(「《书名》由{作者}创作，章节内容由网友上传整理…」)
//
//   契约补充(真站整页单列表无分页; 本站目录 100 章/页 → 底部补真站 .pager 同款分页):
//   - 共 N 章计数值 + 「查看书籍详情」入口(去书页按钮)
//   - currentChapterId 高亮(brand 边 + chip 底, aria-current)
//   - 分卷分组 groupTocVolumes: 卷名行占满整行(grid-column 1/-1, 青绿系渐变小标题, 同首页 h4 形态)
// ============================================================
'use client'

import type { CSSProperties } from 'react'
import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate, formatWords } from '../../seo'
import { groupTocVolumes } from '../template-kit'

// [R26-1-1] 真站主样式 :root 实测色值(硬编码, 同其余页型)
const C = {
  brand: '#0f766e',
  brandDark: '#115e59',
  muted: '#6b7280',
  line: '#e5dccd',
  shadow: '0 10px 30px rgba(17, 24, 39, 0.08)',
  radius: '14px',
} as const

export function AijjxsToc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const volumes = groupTocVolumes(chapters)

  const tocTotal = data?.tocTotal || 0
  const tocSize = data?.tocSize || 100
  const totalPages = data?.tocTotalPages || Math.max(1, Math.ceil(tocTotal / tocSize))
  const goPage = (p: number) => book && navigate({ view: 'toc', bookId: book.id, page: p })

  if (error) {
    return (
      <div className="ajx-toc" style={{ padding: '14px 10px 36px' }}>
        <div className="mx-auto w-full" style={{ maxWidth: 1200 }}>
          <ErrorState message="章节目录加载失败" detail={error} />
        </div>
      </div>
    )
  }
  if (loading || !book) {
    return (
      <div className="ajx-toc" style={{ padding: '14px 10px 36px' }} role="status" aria-label="章节目录加载中">
        <div className="mx-auto w-full" style={{ maxWidth: 1200 }}>
          <div style={{ background: '#fff', border: '1px solid #e5e8ed', borderRadius: 12, boxShadow: '0 10px 24px rgba(12,22,40,.06)', padding: 18 }}>
            <Sk className="h-8 w-2/3" />
            <Sk className="mt-3 h-4 w-1/2" />
            <Sk className="mt-3 h-16 w-full" style={{ borderRadius: 10 }} />
            <div className="mt-3 grid grid-cols-1 gap-2 min-[640px]:grid-cols-2 min-[960px]:grid-cols-3">
              {Array.from({ length: 18 }).map((_, i) => (
                <Sk key={i} className="h-9 w-full" style={{ borderRadius: 8 }} />
              ))}
            </div>
          </div>
          <span className="sr-only">加载中…</span>
        </div>
      </div>
    )
  }

  // [R26-1-40] 章节格子渲染(平铺或分卷两种形态): grid 3 列 → 960px 2 列 → 640px 1 列(真站断点)
  const renderGrid = (items: { key: string; node: React.ReactNode }[]) => (
    <ul
      className="list-none grid grid-cols-1 gap-2 min-[640px]:grid-cols-2 min-[960px]:grid-cols-3"
      style={{ margin: 0, padding: 0, gap: 8 }}
    >
      {items.map((it) => it.node)}
    </ul>
  )

  const chapterCell = (id: string, title: string, idx: number) => {
    const cur = currentChapterId === id
    return (
      <li
        key={id}
        className="ajx-toc-item"
        style={{
          background: cur ? '#f0faf6' : '#fff',
          border: `1px solid ${cur ? C.brand : '#e9eef5'}`,
          borderRadius: 8,
          padding: '8px 10px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={title}
      >
        <a
          className="ajx-book"
          style={{ color: cur ? C.brand : '#2d3b50', fontWeight: cur ? 700 : undefined, cursor: 'pointer' }}
          onClick={() => navigate({ view: 'read', chapterId: id })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              navigate({ view: 'read', chapterId: id })
            }
          }}
          aria-label={`阅读 ${title}`}
          aria-current={cur || undefined}
        >
          {title || `第 ${idx + 1} 章`}
        </a>
      </li>
    )
  }

  // 分卷头行: 占满整行(真站无分卷数据形态, 按站点视觉语言补青绿渐变小标题条)
  const volumeHeader = (vol: string, count: number, key: string) => (
    <li
      key={key}
      style={{
        gridColumn: '1 / -1',
        margin: '4px 0 0',
        padding: '7px 10px',
        border: '1px solid #d8ece7',
        borderRadius: 8,
        background: 'linear-gradient(90deg, #f4fbf9 0%, #ffffff 100%)',
        color: '#134e4a',
        fontSize: 14,
        fontWeight: 700,
        listStyle: 'none',
      }}
    >
      {vol || '正文'}
      <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: C.muted }}>{count} 章</span>
    </li>
  )

  const cells: { key: string; node: React.ReactNode }[] = []
  if (volumes) {
    volumes.forEach((g, gi) => {
      cells.push({ key: `vol-${gi}`, node: volumeHeader(g.volume, g.chapters.length, `vol-${gi}`) }) // [R27-6-fix] 包裹 {key,node} 对齐 cells 类型
      g.chapters.forEach((c) => cells.push({ key: c.id, node: chapterCell(c.id, c.title, c.idx) }))
    })
  } else {
    chapters.forEach((c) => cells.push({ key: c.id, node: chapterCell(c.id, c.title, c.idx) }))
  }

  const pagerBtn: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
    height: 30,
    borderRadius: 8,
    border: '1px solid #e5e8ed',
    background: '#fff',
    padding: '4px 9px',
    fontSize: 13,
    lineHeight: 1,
    cursor: 'pointer',
  }

  return (
    <div className="ajx-toc" style={{ padding: '14px 10px 36px' }}>
      {/* .read-wrap max-width 1200 */}
      <div className="mx-auto w-full" style={{ maxWidth: 1200 }}>
        {/* .read-panel */}
        <article style={{ background: '#fff', border: '1px solid #e5e8ed', borderRadius: 12, boxShadow: '0 10px 24px rgba(12,22,40,.06)', padding: 18 }}>
          {/* h1.read-title: 真站文案「{书名}全文阅读」 */}
          <h1 style={{ fontSize: 28, lineHeight: 1.3, margin: '6px 0 10px', color: '#1f2d3d' }}>{`${book.name}全文阅读`}</h1>
          {/* .read-meta(14px #607189, 链接 #1f8b4c; 契约补: 共 N 章 + 去书页按钮) */}
          <div style={{ fontSize: 14, color: '#607189', marginBottom: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 0' }}>
            <span>作者：{book.author}</span>
            <span style={{ margin: '0 8px' }}>|</span>
            <span>共 {tocTotal} 章</span>
            <span style={{ margin: '0 8px' }}>|</span>
            <span>大小：{formatWords(book.wordCount)}</span>
            <span style={{ margin: '0 8px' }}>|</span>
            <span>上传时间：{fmtDate(book.updatedAt)}</span>
            <span style={{ margin: '0 8px' }}>|</span>
            <a
              className="ajx-book"
              href={`/api/public/download?book=${book.id}`}
              style={{ color: '#1f8b4c' }}
              aria-label={`下载《${book.name}》TXT 电子书`}
            >
              TXT下载
            </a>
            <span style={{ margin: '0 8px' }}>|</span>
            <a
              className="ajx-book"
              style={{ color: '#1f8b4c', cursor: 'pointer' }}
              onClick={() => navigate({ view: 'book', bookId: book.id })}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate({ view: 'book', bookId: book.id })
                }
              }}
              aria-label={`查看《${book.name}》详情`}
            >
              查看书页
            </a>
            {/* 封面缩略(右侧悬浮, 无图走渐变占位; 真站此页无封面, 供快速辨识书籍) */}
            <span style={{ marginLeft: 'auto', display: 'inline-flex' }} aria-hidden>
              <BookCover name={book.name} cover={book.cover} style={{ width: 42, height: 58, borderRadius: 4, border: '1px solid #d8d8d8' }} />
            </span>
          </div>
          {/* .read-intro 内容提要 */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e7edf3',
              borderRadius: 10,
              padding: '12px 14px',
              lineHeight: 1.8,
              color: '#34495e',
              marginBottom: 14,
              fontSize: 14,
            }}
          >
            内容提要：{book.intro || '暂无简介'}
          </div>
          {/* ul.chapter-list(3 列格子; 分卷头行占满整行) */}
          {renderGrid(cells)}
          {/* .pager 分页(真站整页单列无分页; 本站 100 章/页 → 真站 .pager 同款补齐) */}
          {totalPages > 1 && (
            <div
              className="ajx-pager"
              style={{ marginTop: 14, display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}
              role="navigation"
              aria-label="目录分页"
            >
              {page > 1 && (
                <a className="ajx-a" style={pagerBtn} onClick={() => goPage(page - 1)} role="button" tabIndex={0} aria-label="上一页目录">
                  上一页
                </a>
              )}
              {page < totalPages && (
                <a className="ajx-a" style={pagerBtn} onClick={() => goPage(page + 1)} role="button" tabIndex={0} aria-label="下一页目录">
                  下一页
                </a>
              )}
              <span style={{ fontSize: 12, color: C.muted, marginLeft: 6 }}>
                第 {page}/{totalPages} 页 · 共 {tocTotal} 章
              </span>
            </div>
          )}
          {/* .read-foot(真站原文案形态) */}
          <div style={{ marginTop: 14, color: '#68798e', fontSize: 13, lineHeight: 1.8 }}>
            《{book.name}》由{book.author}创作，章节内容由网友上传整理，本站提供在线阅读与TXT下载服务。
          </div>
        </article>
      </div>
    </div>
  )
}
