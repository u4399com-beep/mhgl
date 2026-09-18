// ============================================================
// [R39-2e] ggd66 克隆分类/搜索/全本/排行 —— 快照 category.html(/sort/)+x2-search.html +
//   家族列表形态(.content-left 列表行 [分类] 书名 作者 + .content-right 排行)
// ============================================================
'use client'

import type { SiteCategoryProps, SiteSearchProps, SiteFulltextProps, SiteRankingProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import type { BookItem } from '../../types'
import { GgdFooter } from './parts'

function Rows({ books, loading, error, empty }: { books: BookItem[]; loading: boolean; error: string; empty: string }) {
  const { site, navigate } = usePublic()
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)
  return (
    <div className="ggd-content-left ggd-list">
      <ul>
        {loading
          ? Array.from({ length: 14 }).map((_, i) => <li key={i}><Sk style={{ height: 26 }} /></li>)
          : error
            ? <li><ErrorState message="加载失败" detail={error} /></li>
            : books.length === 0
              ? <li><ErrorState message={empty} /></li>
              : books.map((b) => (
                <li key={b.id}>
                  <span className="ggd-cat-tag">[{b.category || '小说'}]</span>
                  <a href={link(b)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }} title={b.name}>{b.name}</a>
                  <span>{b.author}</span>
                </li>
              ))}
      </ul>
    </div>
  )
}

export function Ggd66Category({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 24))
  return (
    <div className="ggd-cat">
      <div className="ggd-container">
        <div className="ggd-content">
          <h2>{catName || '全部书籍'} <small>({total} 本)</small></h2>
          <Rows books={data?.books || []} loading={loading} error={error} empty="暂无相关书籍" />
        </div>
        <dl className="ggd-pager">
          <dd>
            <button disabled={page <= 1} onClick={() => navigate({ view: 'category', cat, page: page - 1 })}>上一页</button>
            <span>第 {page} / {totalPages} 页</span>
            <button disabled={page >= totalPages} onClick={() => navigate({ view: 'category', cat, page: page + 1 })}>下一页</button>
          </dd>
        </dl>
      </div>
      <GgdFooter />
    </div>
  )
}

export function Ggd66Search({ q, data, loading, error }: SiteSearchProps) {
  return (
    <div className="ggd-search">
      <div className="ggd-container">
        <div className="ggd-content">
          <h2>「{q}」的搜索结果</h2>
          <Rows books={data?.books || []} loading={loading} error={error} empty="未找到相关书籍" />
        </div>
      </div>
      <GgdFooter />
    </div>
  )
}

export function Ggd66Fulltext({ data, loading, error, page }: SiteFulltextProps) {
  const { navigate } = usePublic()
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 24))
  return (
    <div className="ggd-full">
      <div className="ggd-container">
        <div className="ggd-content">
          <h2>全本小说 <small>({total} 本)</small></h2>
          <Rows books={data?.books || []} loading={loading} error={error} empty="暂无全本书籍" />
        </div>
        <dl className="ggd-pager">
          <dd>
            <button disabled={page <= 1} onClick={() => navigate({ view: 'fulltext', page: page - 1 })}>上一页</button>
            <span>第 {page} / {totalPages} 页</span>
            <button disabled={page >= totalPages} onClick={() => navigate({ view: 'fulltext', page: page + 1 })}>下一页</button>
          </dd>
        </dl>
      </div>
      <GgdFooter />
    </div>
  )
}

export function Ggd66Ranking({ boards, active, onBoard, loading, error }: SiteRankingProps) {
  const board = boards.find((b) => b.key === active) || boards[0]
  return (
    <div className="ggd-ranking">
      <div className="ggd-container">
        <div className="ggd-content">
          <h2>
            {boards.map((b) => (
              <button key={b.key} className={b.key === active ? 'is-active' : ''} onClick={() => onBoard(b.key)}>{b.label}</button>
            ))}
          </h2>
          <Rows books={board?.books || []} loading={loading} error={error} empty="榜单暂无数据" />
        </div>
      </div>
      <GgdFooter />
    </div>
  )
}
