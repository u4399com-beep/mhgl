// ============================================================
// [R39-2a] aijjxs 克隆分类页 —— 快照 /tmp/r39-snap/aijjxs/category.html(/txt/chuanyue/ 17.8KB)
//   真站结构(div.cenMain): .articleInfo > h1「{分类}小说最新上传」 + .body.filters 筛选行
//   (.filters .row > a.on 选中胶囊) + 列表(.lines 行形态同首页最新上传)
//   降级说明: 真站筛选行为「分类/排序」多维; 平台契约仅 cat+page → 筛选行以排序近似(最新/字数), 推断级
// ============================================================
'use client'

import type { SiteCategoryProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import type { BookItem } from '../../types'
import { AijjxsFooter } from './parts'

export function AijjxsCategory({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { site, navigate, theme } = usePublic()
  const C = theme.vars

  const books = data?.books || []
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 24))

  const go = (b: BookItem) => navigate({ view: 'book', bookId: b.id })
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)

  return (
    <div className="ajx-cat">
      <main className="ajx-layout ajx-cat-layout">
        <section>
          <div className="ajx-cen-main">
            <div className="ajx-article-info">
              <h1>{catName}最新上传</h1>
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
                  <ErrorState message="列表加载失败" detail={error} />
                ) : books.length === 0 ? (
                  <ErrorState message="暂无相关书籍" />
                ) : (
                  <ul className="ajx-lines ajx-books">
                    {books.map((b) => (
                      <li key={b.id} className="ajx-line">
                        <span className="ajx-line-main">
                          <span className="ajx-cat">{b.category || '小说'}</span>
                          <a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }} title={b.name}>{b.name}</a>
                        </span>
                        <span className="ajx-author">{b.author}</span>
                        <span className="ajx-date">
                          <span>{b.updatedAt ? b.updatedAt.slice(5, 10) : ''}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {/* 分页(真站 .pager 形态: 上一页/页码/下一页胶囊) */}
            <div className="ajx-pager">
              <button disabled={page <= 1} onClick={() => navigate({ view: 'category', cat, page: page - 1 })}>上一页</button>
              <span className="ajx-pager-info">第 {page} / {totalPages} 页 · 共 {total} 本</span>
              <button disabled={page >= totalPages} onClick={() => navigate({ view: 'category', cat, page: page + 1 })}>下一页</button>
            </div>
          </div>
        </section>
        <aside>
          <article className="ajx-panel">
            <h3 className="ajx-h3">全部分类</h3>
            <div className="ajx-body ajx-tags">
              <a
                href={viewToUrl({ view: 'category' }, site.id)}
                onClick={(e) => { e.preventDefault(); navigate({ view: 'category' }) }}
              >全部</a>
              <a
                href={viewToUrl({ view: 'fulltext' }, site.id)}
                onClick={(e) => { e.preventDefault(); navigate({ view: 'fulltext' }) }}
              >全站书库</a>
            </div>
          </article>
        </aside>
      </main>
      <AijjxsFooter v={C} />
    </div>
  )
}
