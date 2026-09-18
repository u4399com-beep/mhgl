// ============================================================
// [R39-2g] qb23 克隆书页 —— mxone 书页形态(封面卡 + 信息区 + 简介折叠 + 章节列表)
//   (真站 /book/5094/ 形态: booktitle 主红 / booktag 标签 / 章节列表 .module-lines-list)
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
import { QbFooter } from './parts'

export function Qb23Book({ data, loading, error }: SiteBookProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const latest = data?.latestChapters ?? []
  const [recs, setRecs] = useState<BookItem[]>([])

  useEffect(() => {
    let alive = true
    if (!book) return
    fetchBooks({ cat: book.categoryId || undefined, page: 1, size: 6, site: site.id })
      .then((d) => { if (alive) setRecs((d.books || []).filter((x) => x.id !== book.id).slice(0, 6)) })
      .catch(() => { if (alive) setRecs([]) })
    return () => { alive = false }
  }, [book?.id, book?.categoryId, site.id, book])

  const first = chapters[0]

  return (
    <main className="qb-wrapper">
      <div className="qb-content">
        <div className="qb-list">
          <div className="qb-box qb-book-box">
            {loading || !book ? (
              error ? <ErrorState message="书籍加载失败" detail={error} /> : <Sk style={{ height: 220 }} />
            ) : (
              <>
                <div className="qb-book-head">
                  <div className="qb-book-pic">
                    <BookCover cover={book.cover} name={book.name}  />
                  </div>
                  <div className="qb-book-info">
                    <h1 className="qb-booktitle">{book.name}</h1>
                    <div className="qb-booktag">
                      <span className="qb-tag-red">{statusLabel(book.status)}</span>
                      <span className="qb-tag">{book.category || '小说'}</span>
                      <span className="qb-tag">{formatWords(book.wordCount)}</span>
                    </div>
                    <p className="qb-book-author">作者：{book.author}</p>
                    <p className="qb-book-time">更新：{fmtDate(book.updatedAt)}</p>
                    <div className="qb-bookmore">
                      <button className="qb-btn-primary" disabled={!first} onClick={() => first && navigate({ view: 'read', chapterId: first.id })}>开始阅读</button>
                      <button className="qb-btn" onClick={() => navigate({ view: 'toc', bookId: book.id })}>完整目录</button>
                    </div>
                  </div>
                  <div className="qb-clear" />
                </div>
                <div className="qb-book-intro">{book.intro || '暂无简介'}</div>
                {/* 最新章节(全书倒数 12, R36-2b 平台字段) */}
                <div className="qb-blocktitle">最新章节</div>
                <div className="qb-chgrid">
                  {latest.map((c) => (
                    <a
                      key={c.id}
                      href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)}
                      onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}
                    >{c.title}</a>
                  ))}
                </div>
                <div className="qb-blocktitle">正文试读 · 前 24 章</div>
                <div className="qb-chgrid">
                  {chapters.slice(0, 24).map((c) => (
                    <a
                      key={c.id}
                      href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)}
                      onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}
                    >{c.title}</a>
                  ))}
                </div>
                <p style={{ textAlign: 'center', margin: '14px 0' }}>
                  <button className="qb-btn-primary" onClick={() => navigate({ view: 'toc', bookId: book.id })}>查看完整目录（共 {data?.tocTotal || chapters.length} 章）</button>
                </p>
                {/* 相关推荐 */}
                <div className="qb-blocktitle">猜您喜欢</div>
                <div className="qb-module">
                  <div className="qb-module-items">
                    {recs.map((b) => (
                      <div className="qb-module-item" key={b.id}>
                        <div className="qb-module-item-cover">
                          <div className="qb-module-item-pic">
                            <a href={viewToUrl({ view: 'book', bookId: b.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}>
                              <BookCover cover={b.cover} name={b.name}  className="qb-cover" />
                            </a>
                          </div>
                        </div>
                        <div className="qb-module-item-titlebox">
                          <a className="qb-module-item-title" href={viewToUrl({ view: 'book', bookId: b.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}>{b.name}</a>
                          <div className="qb-module-item-text">{b.author}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <QbFooter />
    </main>
  )
}
