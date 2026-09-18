// ============================================================
// [R39-2e] ggd66 克隆书页 —— 快照 book.html(/qu/33779/ 12.8KB 实抓)
//   真站结构: .breadcrumb + .book.pt10(.bookcover 封面 120×160 + .bookinfo:
//     h1.booktitle + p.booktag(a.red 作者 + span.blue 字数/读过 + span.red 状态) +
//     p.bookintro 简介 + p「最新章节：」a.bookchapter + p.booktime 更新时间 +
//     .bookmore(a.btn.btn-info 开始阅读/加入书架)) + 章节列表
//   色值: .btn-info #56ccb5 / .red 红 / .blue 蓝; 「4828人读过」契约无数据不渲染
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteBookProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { fetchBooks } from '../../data'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate, formatWords, statusLabel } from '../../seo'
import type { BookItem } from '../../types'
import { GgdCrumbs, GgdFooter } from './parts'

export function Ggd66Book({ data, loading, error }: SiteBookProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const latest = data?.latestChapters ?? []
  const [recs, setRecs] = useState<BookItem[]>([])

  useEffect(() => {
    let alive = true
    if (!book) return
    fetchBooks({ cat: book.categoryId || undefined, page: 1, size: 12, site: site.id })
      .then((d) => { if (alive) setRecs((d.books || []).filter((x) => x.id !== book.id).slice(0, 10)) })
      .catch(() => { if (alive) setRecs([]) })
    return () => { alive = false }
  }, [book?.id, book?.categoryId, site.id, book])

  const go = (b: BookItem) => navigate({ view: 'book', bookId: b.id })
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)
  const first = chapters[0]

  return (
    <div className="ggd-book">
      <div className="ggd-container">
        <GgdCrumbs bookName={book?.name} catName={book?.category} />
        {loading || !book ? (
          <div className="ggd-book-body">{error ? <ErrorState message="书籍加载失败" detail={error} /> : <Sk style={{ height: 220 }} />}</div>
        ) : (
          <>
            <div className="ggd-book-body">
              <div className="ggd-bookcover">
                <BookCover cover={book.cover} name={book.name}  />
              </div>
              <div className="ggd-bookinfo">
                <h1 className="ggd-booktitle">{book.name}</h1>
                <p className="ggd-booktag">
                  <a className="ggd-red" href={viewToUrl({ view: 'search', q: book.author }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'search', q: book.author }) }}>{book.author}</a>
                  <span className="ggd-blue">{formatWords(book.wordCount)}</span>
                  <span className="ggd-red">{statusLabel(book.status)}</span>
                </p>
                <p className="ggd-bookintro">{book.intro || '暂无简介'}</p>
                <p>
                  最新章节：
                  {latest[0] ? (
                    <a
                      className="ggd-bookchapter"
                      href={viewToUrl({ view: 'read', chapterId: latest[0].id }, site.id)}
                      onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: latest[0].id }) }}
                    >{latest[0].title}</a>
                  ) : '暂无'}
                </p>
                <p className="ggd-booktime">更新时间：{fmtDate(book.updatedAt)}</p>
                <div className="ggd-bookmore">
                  <button className="ggd-btn-info" disabled={!first} onClick={() => first && navigate({ view: 'read', chapterId: first.id })}>开始阅读</button>
                  <button className="ggd-btn-info" onClick={() => navigate({ view: 'toc', bookId: book.id })}>完整目录</button>
                </div>
              </div>
              <div className="ggd-clear" />
            </div>
            {/* 章节列表 */}
            <div className="ggd-content">
              <h2>《{book.name}》最新章节</h2>
              <div className="ggd-content-left ggd-chlist">
                <ul>
                  {latest.map((c) => (
                    <li key={c.id}>
                      <a href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}>{c.title}</a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="ggd-content-right ggd-chlist ggd-chlist-r">
                <ul>
                  {chapters.slice(0, 14).map((c) => (
                    <li key={c.id}>
                      <a href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}>{c.title}</a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="ggd-clear" />
              <p style={{ textAlign: 'center', margin: '12px 0' }}>
                <a className="ggd-btn-info" href={viewToUrl({ view: 'toc', bookId: book.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'toc', bookId: book.id }) }}>查看完整目录（共 {data?.tocTotal || chapters.length} 章）</a>
              </p>
            </div>
            {/* 猜您喜欢(同分类, 推断级) */}
            <div className="ggd-content">
              <h2>猜您喜欢</h2>
              <div className="ggd-content-left ggd-list">
                <ul>
                  {recs.map((b) => (
                    <li key={b.id}>
                      <span className="ggd-cat-tag">[{b.category || '小说'}]</span>
                      <a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a>
                      <span>{b.author}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="ggd-clear" />
            </div>
          </>
        )}
      </div>
      <GgdFooter />
    </div>
  )
}
