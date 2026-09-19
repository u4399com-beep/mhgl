// ============================================================
// [R39-2a] aijjxs 克隆目录页 —— 快照 /tmp/r39-snap/aijjxs/read.html(/read/57384/ 2026-09-18 实抓)
//   真站「在线阅读全文」落地页即完整章节列表: div.read-wrap > article.read-panel:
//     h1.read-title「{书名}全文阅读」 + .read-meta「作者：xx | 大小：xx KB | 上传时间… TXT下载」
//     + .read-intro「内容提要：…」 + ul.chapter-list 格子(li > a 章名, 网格多列)
//   降级说明: 真站列表首项「内容简介」→ 平台契约无独立简介章, 以「返回书页」同位替代(推断级)
// ============================================================
'use client'

import type { SiteTocProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { formatWords } from '../../seo'

export function AijjxsToc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const totalPages = data?.tocTotalPages || 1

  return (
    <div className="ajx-toc">
      <div className="ajx-read-wrap">
        <article className="ajx-read-panel">
          <h1 className="ajx-read-title">{book ? `${book.name}全文阅读` : '全文阅读'}</h1>
          <div className="ajx-read-meta">
            {book ? <>作者：{book.author}&nbsp; | &nbsp;大小：{formatWords(book.wordCount)}&nbsp; | &nbsp;上传时间：{(book.updatedAt || '').slice(0, 10)}</> : null}
            <a
              href={book ? viewToUrl({ view: 'book', bookId: book.id }, site.id) : '#'}
              onClick={(e) => { e.preventDefault(); if (book) navigate({ view: 'book', bookId: book.id }) }}
            >书籍页</a>
          </div>
          {book?.intro && <div className="ajx-read-intro">内容提要：{book.intro.slice(0, 120)}…</div>}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {Array.from({ length: 24 }).map((_, i) => <Sk key={i} style={{ height: 34, borderRadius: 8 }} />)}
            </div>
          ) : error ? (
            <ErrorState message="目录加载失败" detail={error} />
          ) : (
            <ul className="ajx-chapter-list">
              {chapters.map((c) => {
                const active = c.id === currentChapterId
                return (
                  <li key={c.id}>
                    <a
                      className={active ? 'is-active' : undefined}
                      href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)}
                      onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}
                      title={c.title}
                    >{c.title}</a>
                  </li>
                )
              })}
            </ul>
          )}
          {/* 分页 */}
          <div className="ajx-pager" style={{ marginTop: 14 }}>
            <button disabled={page <= 1} onClick={() => book && navigate({ view: 'toc', bookId: book.id, page: page - 1 })}>上一页</button>
            <span className="ajx-pager-info">第 {page} / {totalPages} 页</span>
            <button disabled={page >= totalPages} onClick={() => book && navigate({ view: 'toc', bookId: book.id, page: page + 1 })}>下一页</button>
          </div>
        </article>
      </div>
    </div>
  )
}
