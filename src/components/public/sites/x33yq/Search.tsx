// ============================================================
// [R43-2] x33yq(33言情) 克隆搜索结果页 —— 源站契约: POST /search.html(字段 searchtype=all + searchkey,
//   target=_blank); 快照未含 search.html → 按平台 SearchView 数据契约 + 源站列表块形态渲染:
//   .novelslistss 行式结果块(style.css 实测: 968px 2px #C8D4E1 圆角10 / h2 底 #F6F8FE /
//   行 s1 10% s2 30% s3 30% s4 #B3B3B3 15% 右) + .place 相关词条(common.css 实测)
// ============================================================
'use client'

import type { SiteSearchProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { EmptyState, ErrorState, Sk } from '../../bits'
import type { BookItem } from '../../types'

export function X33yqSearch({ q, data, loading, error }: SiteSearchProps) {
  const { site, navigate } = usePublic()
  const books = data?.books || []
  const go = (b: BookItem) => navigate({ view: 'book', bookId: b.id })
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)

  return (
    <div className="xq-search">
      <div id="xq-main">
        <div className="xq-novelslistss">
          <h2>搜索「{q}」的结果</h2>
          {loading ? (
            <ul>
              {Array.from({ length: 10 }).map((_, i) => <li key={i}><Sk style={{ height: 18 }} /></li>)}
            </ul>
          ) : error ? (
            <ErrorState message="搜索失败" detail={error} />
          ) : books.length === 0 ? (
            <EmptyState text="未找到相关书籍, 换个关键词试试" />
          ) : (
            <ul>
              {books.map((b) => (
                <li key={b.id}>
                  <span className="s1">[{b.category || '小说'}]</span>
                  <span className="s2"><a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a></span>
                  <span className="s3">{(b.intro || '暂无简介').slice(0, 30)}</span>
                  <span className="s4">{b.author}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {(data?.relatedTags?.length || 0) > 0 && (
          <div className="xq-place">
            <span>相关词：</span>
            {data?.relatedTags.slice(0, 10).map((t) => (
              <a key={t.tag + t.bookId} href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'keyword', tag: t.tag }) }}>{t.tag}</a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
