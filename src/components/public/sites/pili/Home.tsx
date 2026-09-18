// ============================================================
// [R39-2j] pili 克隆首页 —— 快照 home.html(2026-09-18 cloak 实抓 235KB)
//   真站结构: .newyear-bg-wrap > .mod-tags-wr「独家推荐」(li.first 独家大卡 + mod-animate 卡:
//     mod-ani-img 封面 + text1 书名/作者 + text2 浏览量+开始阅读章节链接) +
//     排行榜区(mod-tab 日榜/周榜 tab + ol.in-rank-list 双列: no-orange 前3橙徽/no-gray 灰徽)
//   降级: 「浏览量107916」真站计数 → 契约无浏览量, 以字数近似展示(推断级)
// ============================================================
'use client'

import { useMemo } from 'react'
import type { SiteHomeProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { formatWords } from '../../seo'
import type { BookItem } from '../../types'
import { PiliFooter } from './parts'

export function PiliHome({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)
  const go = (b: BookItem) => navigate({ view: 'book', bookId: b.id })
  // 独家推荐: 最新前 5; 榜单: 字数 top20 双列(真站站方数据, 以平台排序近似, 推断级)
  const feat = books.slice(0, 5)
  const rank = useMemo(() => [...books].sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0)).slice(0, 20), [books])
  const first = books[0]

  return (
    <div className="pli-home">
      <div className="pli-wrap">
        {/* 独家推荐 */}
        <div className="pli-tags-wr">
          <ul className="pli-animate-list">
            <li className="pli-first">
              <span className="pli-ico-animate">独家推荐</span>
              {first && (
                <div className="pli-ani-info">
                  <a className="pli-ani-img" href={link(first)} onClick={(e) => { e.preventDefault(); go(first) }} aria-label={first.name}>
                    <BookCover cover={first.cover} name={first.name}  />
                  </a>
                  <div className="pli-ani-text">
                    <div className="pli-ani-text1">
                      <a className="pli-ani-title" href={link(first)} onClick={(e) => { e.preventDefault(); go(first) }}>{first.name}</a>
                      <a className="pli-ani-author" href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'search', q: first.author }) }}>{first.author}</a>
                    </div>
                    <div className="pli-ani-text2">
                      <p className="pli-ani-fplay">{formatWords(first.wordCount)} · {first.category || '小说'}</p>
                      <span>开始阅读：</span>
                      <a
                        href={viewToUrl({ view: 'book', bookId: first.id }, site.id)}
                        onClick={(e) => { e.preventDefault(); go(first) }}
                      >《{first.name}》最新章节</a>
                    </div>
                    <p className="pli-ani-desc">{(first.intro || '暂无简介').slice(0, 80)}…</p>
                  </div>
                  <div className="pli-clear" />
                </div>
              )}
              {loading && <Sk style={{ height: 220, marginTop: 10 }} />}
            </li>
            {feat.slice(1).map((b) => (
              <li key={b.id}>
                <a className="pli-ani-a" href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a>
                <div className="pli-ani-info">
                  <a className="pli-ani-img pli-ani-img-sm" href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }} aria-label={b.name}>
                    <BookCover cover={b.cover} name={b.name}  />
                  </a>
                  <div className="pli-ani-text">
                    <div className="pli-ani-text1">
                      <a className="pli-ani-title" href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a>
                      <a className="pli-ani-author" href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'search', q: b.author }) }}>{b.author}</a>
                    </div>
                    <div className="pli-ani-text2">
                      <p className="pli-ani-fplay">{formatWords(b.wordCount)}</p>
                    </div>
                  </div>
                  <div className="pli-clear" />
                </div>
              </li>
            ))}
          </ul>
        </div>
        {/* 排行榜(双列 ol) */}
        <div className="pli-rank-wr">
          <div className="pli-rank-head">热门排行榜<small>（按字数, 推断级近似真站榜单）</small></div>
          <div className="pli-rank-panel">
            <ol className="pli-in-rank-list pli-pr10">
              {rank.slice(0, 10).map((b, i) => (
                <li key={b.id}>
                  <sub className={i < 3 ? 'pli-no-orange' : 'pli-no-gray'}>{i + 1}</sub>
                  <a className="pli-rank-name" href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a>
                </li>
              ))}
              {loading && Array.from({ length: 8 }).map((_, i) => <li key={i}><Sk style={{ height: 22 }} /></li>)}
            </ol>
            <ol className="pli-in-rank-list">
              {rank.slice(10, 20).map((b, i) => (
                <li key={b.id}>
                  <sub className="pli-no-gray">{i + 11}</sub>
                  <a className="pli-rank-name" href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a>
                </li>
              ))}
            </ol>
            <div className="pli-clear" />
            {loading && rank.length === 0 && <ErrorState message="榜单加载中" />}
          </div>
        </div>
        {/* 最新上架 */}
        <div className="pli-rank-wr">
          <div className="pli-rank-head">最新上架</div>
          <div className="pli-rank-panel">
            <div className="pli-latest-grid">
              {books.slice(0, 12).map((b) => (
                <a key={b.id} className="pli-book-cell" href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>
                  <BookCover cover={b.cover} name={b.name}  />
                  <span className="pli-book-cell-name">{b.name}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
      <PiliFooter />
    </div>
  )
}
