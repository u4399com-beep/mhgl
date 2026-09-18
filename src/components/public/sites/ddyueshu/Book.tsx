// ============================================================
// [R39-2d] ddyueshu 克隆书页 —— 快照 book.v2.html(/87410_87410200/ 雪中悍刀行 87.8KB 实抓)
//   真站结构(biquge 模板): .box_con > .con_top 面包屑 + #maininfo:
//     #info(h1《书名》 + p「作    者：xx」 + p「动    作：加入书架/直达底部」 + p「最后更新：xx」)
//     #intro(p 简介) + #sidebar #fmimg 封面(120×150) + #listtj「推荐阅读：」横条链接
//     + .box_con #list(dl dt 卷名 / dd 章节链接)—— 目录仅首页 100 章, 完整目录跳 Toc 视图
//   降级: 「加入书架」真站登录交互 → 渲染「在线阅读」主 CTA(推断级); 推荐阅读横条 → 同分类书切片
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteBookProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { fetchBooks } from '../../data'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate } from '../../seo'
import type { BookItem } from '../../types'
import { DdyFooter } from './parts'

export function DdyueshuBook({ data, loading, error }: SiteBookProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const latest = data?.latestChapters ?? []
  const [recs, setRecs] = useState<BookItem[]>([])

  useEffect(() => {
    let alive = true
    if (!book) return
    fetchBooks({ cat: book.categoryId || undefined, page: 1, size: 10, site: site.id })
      .then((d) => { if (alive) setRecs((d.books || []).filter((x) => x.id !== book.id).slice(0, 9)) })
      .catch(() => { if (alive) setRecs([]) })
    return () => { alive = false }
  }, [book?.id, book?.categoryId, site.id, book])

  const go = (b: BookItem) => navigate({ view: 'book', bookId: b.id })
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)
  const first = chapters[0]
  const readFirst = () => { if (first) navigate({ view: 'read', chapterId: first.id }) }

  return (
    <div className="ddy-book">
      <div id="ddy-main">
        <div className="ddy-box-con">
          <div className="ddy-con-top">
            <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>{site.name}</a>
            {' > '}{book?.category || '小说'}{' > '}{book ? `《${book.name}》最新章节` : ''}
          </div>
          {loading || !book ? (
            <div className="ddy-box-con-inner">
              {error ? <ErrorState message="书籍加载失败" detail={error} /> : <Sk style={{ height: 220 }} />}
            </div>
          ) : (
            <>
              <div className="ddy-maininfo">
                <div className="ddy-info">
                  <h1>《{book.name}》</h1>
                  <p>作&nbsp;&nbsp;&nbsp;&nbsp;者：{book.author}</p>
                  <p>
                    动&nbsp;&nbsp;&nbsp;&nbsp;作：
                    <button className="ddy-act" onClick={readFirst} disabled={!first}>开始阅读</button>
                    <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'toc', bookId: book.id }) }}>完整目录</a>
                  </p>
                  <p>最后更新：{fmtDate(book.updatedAt)}</p>
                </div>
                <div className="ddy-intro"><p>{book.intro || '暂无简介'}</p></div>
              </div>
              <div className="ddy-sidebar">
                <div className="ddy-fmimg">
                  <BookCover cover={book.cover} name={book.name}  />
                </div>
              </div>
              <div className="ddy-clear" />
              {/* 推荐阅读横条 */}
              <div className="ddy-listtj">
                <b>推荐阅读：</b>
                {recs.map((b) => (
                  <a key={b.id} href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a>
                ))}
              </div>
              <div className="ddy-clear" />
              {/* 章节列表(首卷前 60 章 + 最新 12 章) */}
              <div className="ddy-box-con ddy-list-con">
                <dl className="ddy-list">
                  <dt>《{book.name}》最新章节</dt>
                  <dd className="ddy-latest-dd">
                    <ul>
                      {latest.map((c) => (
                        <li key={c.id}>
                          <a href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}>{c.title}</a>
                        </li>
                      ))}
                    </ul>
                  </dd>
                  <dt>正文卷 · 前 60 章</dt>
                  {chapters.slice(0, 60).map((c) => (
                    <dd key={c.id}>
                      <a href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}>{c.title}</a>
                    </dd>
                  ))}
                </dl>
                <div className="ddy-toc-more">
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'toc', bookId: book.id }) }}>查看完整目录（共 {data?.tocTotal || chapters.length} 章）</a>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <DdyFooter />
    </div>
  )
}
