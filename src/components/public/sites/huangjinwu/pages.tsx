// ============================================================
// [R39-2h] huangjinwu 克隆分类/搜索/全本/排行 —— book-grid 卡片网格复用
// ============================================================
'use client'

import type { SiteCategoryProps, SiteSearchProps, SiteFulltextProps, SiteRankingProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import type { BookItem } from '../../types'
import { HjwFooter } from './parts'
import { HjwCard } from './Home'

function Grid({ books, loading, error, empty }: { books: BookItem[]; loading: boolean; error: string; empty: string }) {
  return loading ? (
    <div className="hjw-book-grid">{Array.from({ length: 8 }).map((_, i) => <Sk key={i} style={{ height: 180, borderRadius: 10 }} />)}</div>
  ) : error ? (
    <ErrorState message="加载失败" detail={error} />
  ) : books.length === 0 ? (
    <ErrorState message={empty} />
  ) : (
    <div className="hjw-book-grid">{books.map((b) => <HjwCard key={b.id} b={b} showDesc={false} />)}</div>
  )
}

export function HuangjinwuCategory({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 24))
  return (
    <div className="hjw-main">
      <div className="hjw-container">
        <div className="hjw-section">
          <h2 className="hjw-page-title">{catName || '全部书籍'}<small className="hjw-title-sub">（共 {total} 本）</small></h2>
          <Grid books={data?.books || []} loading={loading} error={error} empty="暂无相关书籍" />
          <div className="hjw-pager">
            <button className="hjw-btn" disabled={page <= 1} onClick={() => navigate({ view: 'category', cat, page: page - 1 })}>上一页</button>
            <span>第 {page} / {totalPages} 页</span>
            <button className="hjw-btn" disabled={page >= totalPages} onClick={() => navigate({ view: 'category', cat, page: page + 1 })}>下一页</button>
          </div>
        </div>
      </div>
      <HjwFooter />
    </div>
  )
}

export function HuangjinwuSearch({ q, data, loading, error }: SiteSearchProps) {
  return (
    <div className="hjw-main">
      <div className="hjw-container">
        <div className="hjw-section">
          <h2 className="hjw-page-title">「{q}」的搜索结果</h2>
          <Grid books={data?.books || []} loading={loading} error={error} empty="未找到相关书籍" />
        </div>
      </div>
      <HjwFooter />
    </div>
  )
}

export function HuangjinwuFulltext({ data, loading, error, page }: SiteFulltextProps) {
  const { navigate } = usePublic()
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 24))
  return (
    <div className="hjw-main">
      <div className="hjw-container">
        <div className="hjw-section">
          <h2 className="hjw-page-title">书库·全部小说<small className="hjw-title-sub">（共 {total} 本）</small></h2>
          <Grid books={data?.books || []} loading={loading} error={error} empty="暂无书籍" />
          <div className="hjw-pager">
            <button className="hjw-btn" disabled={page <= 1} onClick={() => navigate({ view: 'fulltext', page: page - 1 })}>上一页</button>
            <span>第 {page} / {totalPages} 页</span>
            <button className="hjw-btn" disabled={page >= totalPages} onClick={() => navigate({ view: 'fulltext', page: page + 1 })}>下一页</button>
          </div>
        </div>
      </div>
      <HjwFooter />
    </div>
  )
}

export function HuangjinwuRanking({ boards, active, onBoard, loading, error }: SiteRankingProps) {
  const board = boards.find((b) => b.key === active) || boards[0]
  return (
    <div className="hjw-main">
      <div className="hjw-container">
        <div className="hjw-section">
          <h2 className="hjw-page-title">
            {boards.map((b) => (
              <button key={b.key} className={`hjw-tab${b.key === active ? ' is-active' : ''}`} onClick={() => onBoard(b.key)}>{b.label}</button>
            ))}
          </h2>
          <Grid books={board?.books || []} loading={loading} error={error} empty="榜单暂无数据" />
        </div>
      </div>
      <HjwFooter />
    </div>
  )
}
