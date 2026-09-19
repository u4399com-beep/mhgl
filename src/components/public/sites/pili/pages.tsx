// ============================================================
// [R39-2j] pili 克隆分类/搜索/全本/排行 —— wmcms 列表形态(in-rank 行 + 封面格)
// [R41-C-2] 页内旧版 PiliFooter(parts.tsx 深棕底)已移除 → 全站唯一页脚为全局克隆页脚
//   (./Footer.tsx 源站 1:1 橙底件, 经 index.ts Footer 挂载, PublicSite CloneFooter 出口)
// ============================================================
'use client'

import type { SiteCategoryProps, SiteSearchProps, SiteFulltextProps, SiteRankingProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { BookCover } from '../../BookCover'
import type { BookItem } from '../../types'

function RankRows({ books, loading, error, empty }: { books: BookItem[]; loading: boolean; error: string; empty: string }) {
  const { site, navigate } = usePublic()
  return loading ? (
    <ol className="pli-in-rank-list">{Array.from({ length: 10 }).map((_, i) => <li key={i}><Sk style={{ height: 24 }} /></li>)}</ol>
  ) : error ? (
    <ol className="pli-in-rank-list"><li><ErrorState message="加载失败" detail={error} /></li></ol>
  ) : books.length === 0 ? (
    <ol className="pli-in-rank-list"><li><ErrorState message={empty} /></li></ol>
  ) : (
    <ol className="pli-in-rank-list">
      {books.map((b, i) => (
        <li key={b.id}>
          <sub className={i < 3 ? 'pli-no-orange' : 'pli-no-gray'}>{i + 1}</sub>
          <a className="pli-rank-name" href={viewToUrl({ view: 'book', bookId: b.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }} title={b.name}>{b.name}</a>
          <em className="pli-rank-author">{b.author}</em>
        </li>
      ))}
    </ol>
  )
}

export function PiliCategory({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 24))
  return (
    <div className="pli-cat">
      <div className="pli-wrap">
        <div className="pli-rank-wr">
          <div className="pli-rank-head">{catName || '全部小说'}<small>（共 {total} 本）</small></div>
          <div className="pli-rank-panel">
            <RankRows books={data?.books || []} loading={loading} error={error} empty="暂无相关书籍" />
            <div className="pli-pager">
              <button disabled={page <= 1} onClick={() => navigate({ view: 'category', cat, page: page - 1 })}>上一页</button>
              <span>第 {page} / {totalPages} 页</span>
              <button disabled={page >= totalPages} onClick={() => navigate({ view: 'category', cat, page: page + 1 })}>下一页</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PiliSearch({ q, data, loading, error }: SiteSearchProps) {
  return (
    <div className="pli-search">
      <div className="pli-wrap">
        <div className="pli-rank-wr">
          <div className="pli-rank-head">「{q}」的搜索结果</div>
          <div className="pli-rank-panel">
            <RankRows books={data?.books || []} loading={loading} error={error} empty="未找到相关书籍" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function PiliFulltext({ data, loading, error, page }: SiteFulltextProps) {
  const { site, navigate } = usePublic()
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 24))
  return (
    <div className="pli-full">
      <div className="pli-wrap">
        <div className="pli-rank-wr">
          <div className="pli-rank-head">全部小说<small>（共 {total} 本）</small></div>
          <div className="pli-rank-panel">
            <div className="pli-latest-grid">
              {(data?.books || []).map((b) => (
                <a key={b.id} className="pli-book-cell" href={viewToUrl({ view: 'book', bookId: b.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}>
                  <BookCover cover={b.cover} name={b.name}  />
                  <span className="pli-book-cell-name">{b.name}</span>
                </a>
              ))}
              {loading && Array.from({ length: 8 }).map((_, i) => <Sk key={i} style={{ height: 150 }} />)}
            </div>
            {error && <ErrorState message="加载失败" detail={error} />}
            <div className="pli-pager">
              <button disabled={page <= 1} onClick={() => navigate({ view: 'fulltext', page: page - 1 })}>上一页</button>
              <span>第 {page} / {totalPages} 页</span>
              <button disabled={page >= totalPages} onClick={() => navigate({ view: 'fulltext', page: page + 1 })}>下一页</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PiliRanking({ boards, active, onBoard, loading, error }: SiteRankingProps) {
  const board = boards.find((b) => b.key === active) || boards[0]
  return (
    <div className="pli-ranking">
      <div className="pli-wrap">
        <div className="pli-rank-wr">
          <div className="pli-rank-head">
            {boards.map((b) => (
              <button key={b.key} className={`pli-tab${b.key === active ? ' is-active' : ''}`} onClick={() => onBoard(b.key)}>{b.label}</button>
            ))}
          </div>
          <div className="pli-rank-panel">
            <RankRows books={board?.books || []} loading={loading} error={error} empty="榜单暂无数据" />
          </div>
        </div>
      </div>
    </div>
  )
}
