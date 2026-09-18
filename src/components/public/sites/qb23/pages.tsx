// ============================================================
// [R39-2g] qb23 克隆分类/搜索/全本/排行 —— mxone 列表页形态(.box + .module 卡片墙)
// ============================================================
'use client'

import type { SiteCategoryProps, SiteSearchProps, SiteFulltextProps, SiteRankingProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { BookCover } from '../../BookCover'
import type { BookItem } from '../../types'
import { QbFooter } from './parts'

function QbRowCard({ b }: { b: BookItem }) {
  const { site, navigate } = usePublic()
  return (
    <div className="qb-module-item">
      <div className="qb-module-item-cover">
        <div className="qb-module-item-pic">
          <a href={viewToUrl({ view: 'book', bookId: b.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }} aria-label={b.name}>
            <BookCover cover={b.cover} name={b.name}  className="qb-cover" />
          </a>
          <div className="qb-module-item-caption"><span>{b.author}</span><span>{b.category || '小说'}</span></div>
        </div>
      </div>
      <div className="qb-module-item-titlebox">
        <a className="qb-module-item-title" href={viewToUrl({ view: 'book', bookId: b.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}>{b.name}</a>
        <div className="qb-module-item-text">{b.author}</div>
      </div>
    </div>
  )
}

function QbGrid({ books, loading, error, empty }: { books: BookItem[]; loading: boolean; error: string; empty: string }) {
  return loading ? (
    <div className="qb-module-items">{Array.from({ length: 8 }).map((_, i) => <Sk key={i} style={{ height: 220, borderRadius: 5 }} />)}</div>
  ) : error ? (
    <ErrorState message="加载失败" detail={error} />
  ) : books.length === 0 ? (
    <ErrorState message={empty} />
  ) : (
    <div className="qb-module-items">{books.map((b) => <QbRowCard key={b.id} b={b} />)}</div>
  )
}

export function Qb23Category({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 24))
  return (
    <main className="qb-wrapper">
      <div className="qb-content">
        <div className="qb-list">
          <div className="qb-box">
            <div className="qb-blocktitle">{catName || '全部分类'}<small>（共 {total} 本）</small></div>
            <div className="qb-module">
              <QbGrid books={data?.books || []} loading={loading} error={error} empty="暂无相关书籍" />
            </div>
            <div className="qb-pager">
              <button className="qb-btn" disabled={page <= 1} onClick={() => navigate({ view: 'category', cat, page: page - 1 })}>上一页</button>
              <span>第 {page} / {totalPages} 页</span>
              <button className="qb-btn" disabled={page >= totalPages} onClick={() => navigate({ view: 'category', cat, page: page + 1 })}>下一页</button>
            </div>
          </div>
        </div>
      </div>
      <QbFooter />
    </main>
  )
}

export function Qb23Search({ q, data, loading, error }: SiteSearchProps) {
  return (
    <main className="qb-wrapper">
      <div className="qb-content">
        <div className="qb-list">
          <div className="qb-box">
            <div className="qb-blocktitle">「{q}」的搜索结果</div>
            <div className="qb-module">
              <QbGrid books={data?.books || []} loading={loading} error={error} empty="未找到相关书籍, 换个关键词试试" />
            </div>
          </div>
        </div>
      </div>
      <QbFooter />
    </main>
  )
}

export function Qb23Fulltext({ data, loading, error, page }: SiteFulltextProps) {
  const { navigate } = usePublic()
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 24))
  return (
    <main className="qb-wrapper">
      <div className="qb-content">
        <div className="qb-list">
          <div className="qb-box">
            <div className="qb-blocktitle">全部书库<small>（共 {total} 本）</small></div>
            <div className="qb-module">
              <QbGrid books={data?.books || []} loading={loading} error={error} empty="暂无书籍" />
            </div>
            <div className="qb-pager">
              <button className="qb-btn" disabled={page <= 1} onClick={() => navigate({ view: 'fulltext', page: page - 1 })}>上一页</button>
              <span>第 {page} / {totalPages} 页</span>
              <button className="qb-btn" disabled={page >= totalPages} onClick={() => navigate({ view: 'fulltext', page: page + 1 })}>下一页</button>
            </div>
          </div>
        </div>
      </div>
      <QbFooter />
    </main>
  )
}

export function Qb23Ranking({ boards, active, onBoard, loading, error }: SiteRankingProps) {
  const board = boards.find((b) => b.key === active) || boards[0]
  return (
    <main className="qb-wrapper">
      <div className="qb-content">
        <div className="qb-list">
          <div className="qb-box">
            <div className="qb-blocktitle">
              {boards.map((b) => (
                <button key={b.key} className={`qb-tab${b.key === active ? ' is-active' : ''}`} onClick={() => onBoard(b.key)}>{b.label}</button>
              ))}
            </div>
            <div className="qb-module">
              <QbGrid books={board?.books || []} loading={loading} error={error} empty="榜单暂无数据" />
            </div>
          </div>
        </div>
      </div>
      <QbFooter />
    </main>
  )
}
