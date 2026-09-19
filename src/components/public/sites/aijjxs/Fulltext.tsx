// ============================================================
// [R39-2a] aijjxs 克隆全站书库页 —— 快照 /tmp/r39-snap/aijjxs/category.html(/txt/{分类}/ 形态实抓),
//   真站 /txt/ 根即全站书库入口; 列表形态与分类页一致(.panel + .lines 行 + .filters 筛选)
// ============================================================
'use client'

import type { SiteFulltextProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { formatWords } from '../../seo'

export function AijjxsFulltext({ data, loading, error, page }: SiteFulltextProps) {
  const { site, navigate } = usePublic()
  const books = data?.books || []
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 24))

  return (
    <div className="ajx-full">
      <main className="ajx-layout ajx-cat-layout">
        <section>
          <div className="ajx-cen-main">
            <div className="ajx-article-info">
              <h1>全站书库</h1>
            </div>
            <div className="ajx-panel">
              <div className="ajx-body">
                {loading ? (
                  <ul className="ajx-lines">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <li key={i} style={{ display: 'flex', gap: 8, padding: '9px 0' }}>
                        <Sk style={{ width: 44, height: 20, borderRadius: 999 }} />
                        <Sk style={{ flex: 1, height: 20 }} />
                      </li>
                    ))}
                  </ul>
                ) : error ? (
                  <ErrorState message="书库加载失败" detail={error} />
                ) : books.length === 0 ? (
                  <ErrorState message="暂无书籍" />
                ) : (
                  <ul className="ajx-lines ajx-books">
                    {books.map((b) => (
                      <li key={b.id} className="ajx-line">
                        <span className="ajx-line-main">
                          <span className="ajx-cat">{b.category || '小说'}</span>
                          <a
                            href={viewToUrl({ view: 'book', bookId: b.id }, site.id)}
                            onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}
                            title={b.name}
                          >{b.name}</a>
                        </span>
                        <span className="ajx-author">{b.author}</span>
                        <span className="ajx-date"><span>{formatWords(b.wordCount)}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="ajx-pager">
              <button disabled={page <= 1} onClick={() => navigate({ view: 'fulltext', page: page - 1 })}>上一页</button>
              <span className="ajx-pager-info">第 {page} / {totalPages} 页 · 共 {total} 本</span>
              <button disabled={page >= totalPages} onClick={() => navigate({ view: 'fulltext', page: page + 1 })}>下一页</button>
            </div>
          </div>
        </section>
        <aside>
          <article className="ajx-panel ajx-rank">
            <h3 className="ajx-h3">书库导航</h3>
            <div className="ajx-body">
              <ul className="ajx-lines">
                <li className="ajx-line">
                  <a
                    href={viewToUrl({ view: 'home' }, site.id)}
                    onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}
                  >返回首页</a>
                </li>
              </ul>
            </div>
          </article>
        </aside>
      </main>
    </div>
  )
}
