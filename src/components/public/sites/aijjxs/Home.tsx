// ============================================================
// [R39-2a] aijjxs 克隆首页 —— 快照 /tmp/r39-snap/aijjxs/home.html(2026-09-18 直连实抓 52.9KB)
//   真站结构(main.layout 两栏):
//     左 section: article.panel.latest-upload(h3「最新上传」+ .body.gird2 > ul.lines.lines-books.lines-books-2col
//       每行: span.cat 分类胶囊 + 书名 a + span.author + span.date(.new 48h 内 #F03))
//     右 aside: article.panel.rank「点击榜」(ul.lines 序号列表 .no + 书名 + .date 作者) +
//       article.panel.rank「一周热榜」(.book_r 头条卡: 封面+标题+meta「作者 · 分类 · 大小」+ .desc) +
//       article.panel「热门作者」(.body.tags > a 胶囊)
//     section.hero「数据统计」(h2+small「数据每30分钟更新」+ p 描述 + .kpi 4 格 .num/.txt)
//     footer.foot(网站简介/帮助/版权声明/网站地图/友情链接/留言建议 + Copyright 行)
//   降级说明: 真站榜单为站方数据 → 平台契约无榜单接口, 以 books 按字数/最新排序切片近似(推断级,
//     同 legacy 口径); hero KPI 以 books 统计折算; 热门作者从 books 作者去重取前 10。
// ============================================================
'use client'

import { useMemo } from 'react'
import type { SiteHomeProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { formatWords } from '../../seo'
import type { BookItem } from '../../types'

export function AijjxsHome({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()

  // 真站榜单(站方数据不可得) → books 切片近似: 点击榜=words 排序 top10; 一周热榜=top10 移除头条
  const rankClick = useMemo(() => [...books].sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0)).slice(0, 10), [books])
  const rankWeek = useMemo(() => [...books].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(1, 11), [books])
  const topBook = rankWeek[0] || rankClick[0] || null
  const authors = useMemo(() => [...new Set(books.map((b) => b.author).filter(Boolean))].slice(0, 10), [books])
  const now48 = Date.now() - 48 * 3600_000

  const go = (b: BookItem) => navigate({ view: 'book', bookId: b.id })
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)

  return (
    <div className="ajx-home">
      <main className="ajx-layout">
        <section>
          {/* 最新上传(双列) */}
          <article className="ajx-panel">
            <h3 className="ajx-h3 ajx-latest-h">
              最新上传
              <small>每日更新 · 全本免费下载</small>
            </h3>
            <div className="ajx-body ajx-gird2">
              {loading ? (
                <ul className="ajx-lines ajx-books-2col">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <li key={i} style={{ display: 'flex', gap: 8, padding: '9px 0' }}>
                      <Sk style={{ width: 44, height: 20, borderRadius: 999 }} />
                      <Sk style={{ flex: 1, height: 20 }} />
                    </li>
                  ))}
                </ul>
              ) : books.length === 0 ? (
                <ErrorState message="暂无上传" />
              ) : (
                <ul className="ajx-lines ajx-books">
                  {books.map((b) => {
                    const isNew = !!b.updatedAt && new Date(b.updatedAt).getTime() > now48
                    return (
                      <li key={b.id} className="ajx-line">
                        <span className="ajx-line-main">
                          <span className="ajx-cat">{b.category || '小说'}</span>
                          <a
                            href={link(b)}
                            onClick={(e) => { e.preventDefault(); go(b) }}
                            title={b.name}
                          >{b.name}</a>
                        </span>
                        <span className="ajx-author">{b.author}</span>
                        <span className={`ajx-date${isNew ? ' ajx-new' : ''}`}>
                          <span>{b.updatedAt ? b.updatedAt.slice(5, 10).replace('-', '-') : ''}</span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </article>
        </section>
        <aside>
          {/* 点击榜 */}
          <article className="ajx-panel ajx-rank">
            <h3 className="ajx-h3">点击榜</h3>
            <div className="ajx-body">
              <ul className="ajx-lines">
                {rankClick.map((b, i) => (
                  <li key={b.id} className="ajx-line">
                    <span className="ajx-no">{i + 1}</span>
                    <a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }} title={b.name}>{b.name}</a>
                    <span className="ajx-date">{b.author}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
          {/* 一周热榜(头条卡 + 列表) */}
          <article className="ajx-panel ajx-rank">
            <h3 className="ajx-h3">一周热榜</h3>
            <div className="ajx-body">
              {topBook && (
                <div className="ajx-book-r">
                  <button className="ajx-br-pic" onClick={() => go(topBook)} aria-label={topBook.name}>
                    <BookCover cover={topBook.cover} name={topBook.name}  />
                  </button>
                  <h4>
                    <a href={link(topBook)} onClick={(e) => { e.preventDefault(); go(topBook) }}>{topBook.name}</a>
                  </h4>
                  <div className="ajx-meta">{topBook.author} · {topBook.category || '小说'} · {formatWords(topBook.wordCount)}</div>
                  <div className="ajx-desc">{(topBook.intro || '').slice(0, 60) || '暂无简介'}..</div>
                </div>
              )}
              <ul className="ajx-lines">
                {rankWeek.filter(Boolean).map((b, i) => (
                  <li key={b.id} className="ajx-line">
                    <span className="ajx-no">{i + 1}</span>
                    <a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }} title={b.name}>{b.name}</a>
                    <span className="ajx-date">{b.author}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
          {/* 热门作者 */}
          <article className="ajx-panel">
            <h3 className="ajx-h3">热门作者</h3>
            <div className="ajx-body ajx-tags">
              {authors.map((a) => (
                <a key={a} href={viewToUrl({ view: 'search', q: a }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'search', q: a }) }}>{a}</a>
              ))}
            </div>
          </article>
        </aside>
      </main>
      {/* 数据统计 hero */}
      <section className="ajx-hero">
        <h2>
          数据统计
          <small>数据每30分钟更新</small>
        </h2>
        <p>每天更新热门小说，覆盖穿越、重生、都市、玄幻等主流分类；支持全站 TXT 免费下载与在线阅读。</p>
        <div className="ajx-kpi">
          <div className="ajx-kpi-item"><div className="ajx-kpi-num">{loading ? '…' : `${books.length}部`}</div><div className="ajx-kpi-txt">最新上传电子书</div></div>
          <div className="ajx-kpi-item"><div className="ajx-kpi-num">{loading ? '…' : formatWords(books.reduce((s, b) => s + (b.wordCount || 0), 0))}</div><div className="ajx-kpi-txt">全站总字数</div></div>
          <div className="ajx-kpi-item"><div className="ajx-kpi-num">{loading ? '…' : `${new Set(books.map((b) => b.author)).size}人`}</div><div className="ajx-kpi-txt">收录作者</div></div>
          <div className="ajx-kpi-item"><div className="ajx-kpi-num">{site.name}</div><div className="ajx-kpi-txt">全站免费开放</div></div>
        </div>
      </section>
    </div>
  )
}
