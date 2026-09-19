// ============================================================
// [R39-2a] aijjxs 克隆书页(书籍详情) —— 快照 /tmp/r39-snap/aijjxs/book.html(/txt/57384.html 12.7KB)
//   真站结构(body.page-info > main.layout):
//     article.panel h3「《书名》」 + .body.detail(grid 封面 112x148 + .kv 六行):
//       .pic 封面 + a.copy-btn「加入收藏」(真站登录交互 → 契约无收藏, 位置渲染为「TXT 下载」引导, 推断级)
//       .kv: 书籍作者(链接)/书籍分类/书籍大小(KB)/写作进度(.sfwj 青底胶囊)/上传时间/下载方式(全本免费)
//     article.panel.intro-panel「内容简介」(.desc 长简介)
//     article.panel「下载与说明」: a.download-btn「电子书下载地址」(渐变 #da5627→#b13e18) +
//       a.download-btn「在线阅读全文」 + .tips「只有会员才可以下载电子书…」
//     article.panel「猜您喜欢」(.body.grid2 > .book 卡: h4+badge+meta「作者 · 分类 · 大小 · 日期」+ .desc)
//     aside: article.panel.rank「热门{分类}小说下载」(ul.lines 序号列表)
//   降级说明: 「猜您喜欢」真站为站方推荐 → 以同分类最新书近似(fetchBooks 同分类切片, 同 legacy 口径);
//     「电子书下载地址」→ 平台 TXT 下载走 navigate 全站下载能力, 以「在线阅读全文」为主 CTA
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteBookProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { fetchBooks } from '../../data'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk, bookNavProps } from '../../bits'
import { fmtDate, statusLabel } from '../../seo'
import type { BookItem } from '../../types'

function kb(n?: number | null): string {
  return `${Math.max(1, Math.round((n || 0) / 1024))} KB`
}

export function AijjxsBook({ data, loading, error }: SiteBookProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const catId = book?.categoryId || ''
  const catName = book?.category || ''

  // 猜您喜欢: 同分类最新书(推断级)
  const [recs, setRecs] = useState<BookItem[]>([])
  useEffect(() => {
    let alive = true
    if (!book) return
    fetchBooks({ cat: catId || undefined, page: 1, size: 8, site: site.id })
      .then((d) => { if (alive) setRecs((d.books || []).filter((x) => x.id !== book.id).slice(0, 4)) })
      .catch(() => { if (alive) setRecs([]) })
    return () => { alive = false }
  }, [book?.id, catId, site.id, book])

  const go = (b: BookItem) => navigate({ view: 'book', bookId: b.id })
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)
  const readFirst = () => {
    const first = data?.chapters?.[0]
    if (first) navigate({ view: 'read', chapterId: first.id })
  }

  return (
    <div className="ajx-book-page">
      <main className="ajx-layout ajx-cat-layout">
        <section>
          {loading || !book ? (
            <article className="ajx-panel">
              <div className="ajx-body">
                {error ? <ErrorState message="书籍加载失败" detail={error} /> : <Sk style={{ height: 220, borderRadius: 12 }} />}
              </div>
            </article>
          ) : (
            <>
              {/* 书籍详情 */}
              <article className="ajx-panel">
                <h3 className="ajx-h3">《{book.name}》</h3>
                <div className="ajx-body ajx-detail">
                  <div className="ajx-pic">
                    <BookCover cover={book.cover} name={book.name}  />
                    <a className="ajx-copy-btn" href={viewToUrl({ view: 'fulltext' }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'fulltext' }) }}>全站书库</a>
                  </div>
                  <div className="ajx-kv">
                    <p><strong>书籍作者：</strong>{book.author}</p>
                    <p><strong>书籍分类：</strong>{catName || '未分类'}</p>
                    <p><strong>书籍大小：</strong>{kb(book.wordCount)}</p>
                    <p><strong>写作进度：</strong><span className="ajx-sfwj">{statusLabel(book.status)}</span></p>
                    <p><strong>上传时间：</strong>{fmtDate(book.updatedAt)}</p>
                    <p><strong>下载方式：</strong>全本免费</p>
                  </div>
                </div>
              </article>
              {/* 内容简介 */}
              <article className="ajx-panel ajx-intro-panel">
                <h3 className="ajx-h3">内容简介</h3>
                <div className="ajx-body">
                  <div className="ajx-desc">{book.intro || '暂无简介'}</div>
                </div>
              </article>
              {/* 下载与说明 */}
              <article className="ajx-panel">
                <h3 className="ajx-h3">下载与说明</h3>
                <div className="ajx-body">
                  <button className="ajx-download-btn ajx-dl-read" onClick={readFirst} disabled={!data?.chapters?.length}>在线阅读全文</button>
                  <a className="ajx-download-btn ajx-dl-toc" href={viewToUrl({ view: 'toc', bookId: book.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'toc', bookId: book.id }) }}>查看完整目录</a>
                  <div className="ajx-tips">本站所有小说均可免费在线阅读与下载，注册会员可获取 TXT 全本电子书。</div>
                </div>
              </article>
              {/* 猜您喜欢 */}
              <article className="ajx-panel">
                <h3 className="ajx-h3">猜您喜欢</h3>
                <div className="ajx-body ajx-grid2">
                  {recs.map((b) => (
                    <div key={b.id} className="ajx-book-card" {...bookNavProps(navigate, b.id)}>
                      <h4><span className="ajx-badge">{b.category || '小说'}</span>
                        <a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a>
                      </h4>
                      <div className="ajx-meta">{b.author} · {b.category || '小说'} · {kb(b.wordCount)} · {fmtDate(b.updatedAt)?.slice(0, 10)}</div>
                      <div className="ajx-desc">{(b.intro || '').slice(0, 56) || '暂无简介'}…</div>
                    </div>
                  ))}
                  {recs.length === 0 && <div className="ajx-meta">暂无推荐</div>}
                </div>
              </article>
            </>
          )}
        </section>
        <aside>
          <article className="ajx-panel ajx-rank">
            <h3 className="ajx-h3">热门{catName || '小说'}下载</h3>
            <div className="ajx-body">
              <ul className="ajx-lines">
                {recs.slice(0, 8).map((b, i) => (
                  <li key={b.id} className="ajx-line">
                    <span className="ajx-no">{i + 1}</span>
                    <a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }} title={b.name}>{b.name}</a>
                    <span className="ajx-date">{b.author}</span>
                  </li>
                ))}
                {recs.length === 0 && <li className="ajx-meta">加载中…</li>}
              </ul>
            </div>
          </article>
        </aside>
      </main>
    </div>
  )
}
