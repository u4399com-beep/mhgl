// ============================================================
// [R39-2a] aijjxs 克隆搜索结果页(推断级) —— 真站搜索为 POST /e/search/(未抓到结果页快照),
//   按真站列表形态(.panel + .lines 行)与全站风格还原; 数据契约 fetchSearch(q)
// ============================================================
'use client'

import type { SiteSearchProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { formatWords } from '../../seo'

export function AijjxsSearch({ q, data, loading, error }: SiteSearchProps) {
  const { site, navigate } = usePublic()
  const books = data?.books || []
  const tags = data?.relatedTags || []

  return (
    <div className="ajx-search">
      <main className="ajx-layout ajx-cat-layout">
        <section>
          <div className="ajx-cen-main">
            <div className="ajx-article-info">
              <h1>「{q}」 的搜索结果</h1>
            </div>
            <div className="ajx-panel">
              <div className="ajx-body">
                {loading ? (
                  <ul className="ajx-lines">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <li key={i} style={{ display: 'flex', gap: 8, padding: '9px 0' }}>
                        <Sk style={{ flex: 1, height: 20 }} />
                      </li>
                    ))}
                  </ul>
                ) : error ? (
                  <ErrorState message="搜索失败" detail={error} />
                ) : books.length === 0 ? (
                  <ErrorState message="未找到相关书籍, 换个关键词试试" />
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
          </div>
        </section>
        <aside>
          <article className="ajx-panel">
            <h3 className="ajx-h3">相关阅读</h3>
            <div className="ajx-body ajx-tags">
              {tags.slice(0, 12).map((t) => (
                <a
                  key={t.tag + t.bookId}
                  href={viewToUrl({ view: 'keyword', tag: t.tag }, site.id)}
                  onClick={(e) => { e.preventDefault(); navigate({ view: 'keyword', tag: t.tag }) }}
                >{t.tag}</a>
              ))}
              {tags.length === 0 && <span className="ajx-meta">暂无相关词</span>}
            </div>
          </article>
        </aside>
      </main>
    </div>
  )
}
