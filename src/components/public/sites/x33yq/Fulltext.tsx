// ============================================================
// [R43-2] x33yq(33言情) 克隆全本·完本页 —— 源站无独立完本列表页(规格书声明) → 复用 ddyueshu 同款
//   布局思路按平台 FulltextView 契约渲染, CSS 全挂 .clone-x33yq:
//   .MessageDiv 提示条(common.css 实测: lh140% margin 3px auto auto padding 3 居中 958px) +
//   .novelslistss 分类分组块(style.css 实测: 968px 2px #C8D4E1 圆角10 / h2 底 #F6F8FE 30px /
//   行 s1-s5) + .pages > .pagelink 分页(style.css 实测)
// ============================================================
'use client'

import { useMemo } from 'react'
import type { SiteFulltextProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { EmptyState, ErrorState, Sk } from '../../bits'
import { fmtDate } from '../../seo'
import type { BookItem } from '../../types'
import { X33yqPageLink } from './Category'

export function X33yqFulltext({ data, loading, error, page }: SiteFulltextProps) {
  const { site, navigate } = usePublic()
  const books = useMemo(() => data?.books || [], [data])
  const total = data?.total ?? 0
  const size = data?.size ?? 24
  const totalPages = data ? Math.max(1, Math.ceil(total / size)) : 1
  // 按分类分组(复用 ddyueshu 全本页布局思路: 分组列表块)
  const groups = useMemo(() => {
    const map = new Map<string, BookItem[]>()
    for (const b of books) {
      const k = b.category || '其他'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(b)
    }
    return [...map.entries()]
  }, [books])

  const go = (b: BookItem) => navigate({ view: 'book', bookId: b.id })
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)

  return (
    <div className="xq-full">
      <div id="xq-main">
        {/* 提示条(common.css .MessageDiv 实测形态) */}
        <div className="xq-MessageDiv"><b>提示：本页为完本小说大全， 推荐使用Ctrl+F 来查找小说。</b></div>
        {loading ? (
          <div role="status" aria-label="大全加载中">
            <Sk style={{ height: 60, margin: '10px auto', borderRadius: 10 }} />
            <Sk style={{ height: 320, margin: '0 auto 10px', borderRadius: 10 }} />
          </div>
        ) : error ? (
          <div className="xq-novelslistss"><ErrorState message="大全列表加载失败" detail={error} /></div>
        ) : books.length === 0 ? (
          <EmptyState text="暂无完本书籍" hint="完本清单按最近更新排序" />
        ) : (
          groups.map(([cat, items]) => (
            <div className="xq-novelslistss" key={cat}>
              <h2>{cat}完本小说列表</h2>
              <ul>
                {items.map((b) => (
                  <li key={b.id} title={`${b.name}/${b.author}`}>
                    <span className="s1">[{b.category || '小说'}]</span>
                    <span className="s2"><a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a></span>
                    <span className="s3">{b.author}</span>
                    <span className="s4">{fmtDate(b.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        {!loading && data && totalPages > 1 && (
          <X33yqPageLink page={page} totalPages={totalPages} onPage={(p) => navigate({ view: 'fulltext', page: p })} />
        )}
      </div>
    </div>
  )
}
