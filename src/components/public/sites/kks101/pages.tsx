// ============================================================
// [R39-2i] kks101 克隆分类/搜索/全本/排行 —— mybox 书卡列表复用(繁体文案)
// ============================================================
'use client'

import type { SiteCategoryProps, SiteSearchProps, SiteFulltextProps, SiteRankingProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { BookCover } from '../../BookCover'
import { formatWords } from '../../seo'
import type { BookItem } from '../../types'
import { KksFooter } from './parts'

function Box({ books, loading, error, empty, withRank }: { books: BookItem[]; loading: boolean; error: string; empty: string; withRank?: boolean }) {
  const { site, navigate } = usePublic()
  return loading ? (
    <div className="kks-mybox">{Array.from({ length: 5 }).map((_, i) => <Sk key={i} style={{ height: 110, borderRadius: 8 }} />)}</div>
  ) : error ? (
    <div className="kks-mybox"><ErrorState message="加載失敗" detail={error} /></div>
  ) : books.length === 0 ? (
    <div className="kks-mybox"><ErrorState message={empty} /></div>
  ) : (
    <div className="kks-mybox">
      {books.map((b, i) => {
        const rank = withRank && i < 3 ? i : undefined
        return (
          <div className="kks-bookbox" key={b.id}>
            <a
              className="kks-bookimg"
              href={viewToUrl({ view: 'book', bookId: b.id }, site.id)}
              onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}
              aria-label={b.name}
            >
              <BookCover cover={b.cover} name={b.name}  />
              {rank !== undefined && <span className={`kks-rank kks-rank-${rank + 1}`}>{rank + 1}</span>}
            </a>
            <div className="kks-bookinfo">
              <h3><a href={viewToUrl({ view: 'book', bookId: b.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}>{b.name}</a></h3>
              <p className="kks-author"><span>{b.author}</span></p>
              <p className="kks-intro">{(b.intro || '暫無簡介').slice(0, 52)}…</p>
              <p className="kks-meta"><span>{b.category || '小說'}</span><span>{formatWords(b.wordCount)}</span></p>
            </div>
            <div className="kks-clear" />
          </div>
        )
      })}
    </div>
  )
}

function Pager({ page, totalPages, onPrev, onNext }: { page: number; totalPages: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="kks-pager">
      <button disabled={page <= 1} onClick={onPrev}>上一頁</button>
      <span>第 {page} / {totalPages} 頁</span>
      <button disabled={page >= totalPages} onClick={onNext}>下一頁</button>
    </div>
  )
}

export function Kks101Category({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 24))
  return (
    <div className="kks-cat">
      <div className="kks-main">
        <div className="kks-container">
          <h3 className="kks-mytitle">{catName || '全部分類'}<small>（共 {total} 本）</small></h3>
          <Box books={data?.books || []} loading={loading} error={error} empty="暫無相關書籍" />
          <Pager page={page} totalPages={totalPages} onPrev={() => navigate({ view: 'category', cat, page: page - 1 })} onNext={() => navigate({ view: 'category', cat, page: page + 1 })} />
        </div>
      </div>
      <KksFooter />
    </div>
  )
}

export function Kks101Search({ q, data, loading, error }: SiteSearchProps) {
  return (
    <div className="kks-search">
      <div className="kks-main">
        <div className="kks-container">
          <h3 className="kks-mytitle">「{q}」的搜索結果</h3>
          <Box books={data?.books || []} loading={loading} error={error} empty="未找到相關書籍" />
        </div>
      </div>
      <KksFooter />
    </div>
  )
}

export function Kks101Fulltext({ data, loading, error, page }: SiteFulltextProps) {
  const { navigate } = usePublic()
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 24))
  return (
    <div className="kks-full">
      <div className="kks-main">
        <div className="kks-container">
          <h3 className="kks-mytitle">完本小說<small>（共 {total} 本）</small></h3>
          <Box books={data?.books || []} loading={loading} error={error} empty="暫無書籍" />
          <Pager page={page} totalPages={totalPages} onPrev={() => navigate({ view: 'fulltext', page: page - 1 })} onNext={() => navigate({ view: 'fulltext', page: page + 1 })} />
        </div>
      </div>
      <KksFooter />
    </div>
  )
}

export function Kks101Ranking({ boards, active, onBoard, loading, error }: SiteRankingProps) {
  const board = boards.find((b) => b.key === active) || boards[0]
  return (
    <div className="kks-ranking">
      <div className="kks-main">
        <div className="kks-container">
          <div className="kks-tabs">
            {boards.map((b) => (
              <button key={b.key} className={b.key === active ? 'is-active' : ''} onClick={() => onBoard(b.key)}>{b.label}</button>
            ))}
          </div>
          <Box books={board?.books || []} loading={loading} error={error} empty="榜單暫無數據" withRank />
        </div>
      </div>
      <KksFooter />
    </div>
  )
}
