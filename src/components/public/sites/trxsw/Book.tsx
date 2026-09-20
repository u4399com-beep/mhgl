// ============================================================
// [R49-2a-4] R49 全页重克隆: trxsw 真站已由 2019 杰奇版换为「唐人小说网」33yq 家族模板(与 x33yq 同族同源,
//   实抓 /tmp/r49-snap/trxsw/ 2026-09-20: home/category/book/toc/read/lastupdate/goodnum + 33yq.css 20033B +
//   read.css 8614B —— 与 x33yq common/style/read.css 逐值一致), 全套组件由 x33yq 已校准实现移植 + 站点文案替换。
// [R43-2] x33yq(33言情 原始注释, 移植自) 克隆书页 —— 快照 /tmp/r43-snap/book.html(/xiaoshuo_68759.html 直连实抓)
//   源站结构: .ui-box > .bread-crumb-nav(首页 > 分类 > 书名) + .detail-cols:
//     .ui_bg6 > .box_intro(.pic 封面 130×170 + .box_info table.ui_tb1(h1.f21h 书名+作者 em /
//     .intro 简介 166px 滚动 / 信息行 / .option .btopt 开始阅读 + .txtopt 操作链)) +
//     #qvod-pl-list.play-list-box(.caption《书名》已更新到 + .txt 最新章 / .play-list 章节块链 385×28) +
//     .wudu-bar(.ui-title1 热门点击 + .ui-ranking .ranking-list 前 15 行 a+日期) +
//     #comment.ui-box(.ui-title「看《书名》的大神还喜欢」+ #like-focus 封面墙 110×150)
//   色值(style.css 实测): ui-box 边 2px #C3DFEA 底 #E9FAFF 圆角10 / breadcrumb #FEF9EF /
//     f21h simHei 30px / intro #666 lh22 缩进 / 主按钮 #67B5E2 hover #88C6E5 / txt 链 #e12160
//   降级声明: 点击总数/收藏总数/TXT下载/投票 站方数据与登录交互不克隆; 热门点击用字数热榜池近似。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteBookProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { useWordsPool } from '../hooks'
import { fetchBooks } from '../../data'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate } from '../../seo'
import type { BookItem } from '../../types'

/** 字数 → 万字口径(源站「386万字」形态) */
function fmtWords(n: number): string {
  if (!n) return '0'
  return n >= 10000 ? `${Math.round(n / 1000) / 10}万字` : `${n}字`
}

/** 状态口径(源站「已完成/连载中」) */
function fmtStatus(s: BookItem['status']): string {
  if (s === 'completed') return '已完成'
  if (s === 'ongoing') return '连载中'
  return typeof s === 'string' && s ? s : '未知'
}

export function TrxswBook({ data, loading, error }: SiteBookProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const latest = data?.latestChapters ?? []
  const pool = useWordsPool(site.id) // 热门点击栏(字数热榜 60; 站方点击数无契约 → 近似)
  const [likes, setLikes] = useState<BookItem[]>([])

  // 「大神还喜欢」封面墙: 同分类书 14 本(排除自身)
  useEffect(() => {
    let alive = true
    if (!book) return
    fetchBooks({ cat: book.categoryId || undefined, page: 1, size: 16, site: site.id })
      .then((d) => { if (alive) setLikes((d.books || []).filter((x) => x.id !== book.id).slice(0, 14)) })
      .catch(() => { if (alive) setLikes([]) })
    return () => { alive = false }
  }, [book?.id, book?.categoryId, site.id, book])

  const go = (b: BookItem) => navigate({ view: 'book', bookId: b.id })
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)
  const first = latest[0]

  return (
    <div className="trx-book">
      <div id="trx-main">
        {loading || !book ? (
          <div className="trx-ui-box" style={{ padding: 12 }}>
            {error ? <ErrorState message="书籍加载失败" detail={error} /> : <Sk style={{ height: 320, borderRadius: 0 }} />}
          </div>
        ) : (
          <>
            <div className="trx-ui-box">
              {/* 面包屑(源站 .bread-crumb-nav: 首页 >分类 >书名) */}
              <div className="trx-bread-crumb-nav">
                <ul className="trx-bread-crumbs">
                  <li className="trx-home">
                    <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>{site.name}</a>
                    {' >'}
                    <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'category', cat: book.categoryId || undefined }) }}>{book.category || '小说'}</a>
                    {' >'}<em>{book.name} </em>
                  </li>
                </ul>
              </div>
              <div className="trx-detail-cols">
                <div className="trx-bg6">
                  <div className="trx-box-intro">
                    <div className="trx-pic">
                      <BookCover cover={book.cover} name={book.name} />
                    </div>
                    <div className="trx-box-info">
                      <table className="trx-ui-tb1">
                        <tbody>
                          <tr>
                            <td colSpan={3}>
                              <h1 className="trx-f21h">{book.name}<em>作者:{book.author}</em></h1>
                            </td>
                          </tr>
                          <tr>
                            <td colSpan={3}>
                              <div className="trx-intro">{book.intro || '暂无简介'}</div>
                            </td>
                          </tr>
                          <tr className="trx-infotop">
                            <td><b>小说分类：</b>{book.category || '小说'} </td>
                            <td><b>小说状态：</b>{fmtStatus(book.status)} </td>
                            <td><b>全文字数：</b>{fmtWords(book.wordCount)} </td>
                          </tr>
                          <tr>
                            <td colSpan={2}><b>更新时间：</b>{fmtDate(book.updatedAt)} </td>
                            <td><b>最新连载：</b>{book.latestChapter || '暂无'}</td>
                          </tr>
                        </tbody>
                      </table>
                      <div className="trx-option">
                        <span className="trx-btopt">
                          <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); if (first) navigate({ view: 'read', chapterId: first.id }) }}
                          ><span>开始阅读</span></a>
                        </span>
                        <span className="trx-txtopt">
                          <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'toc', bookId: book.id }) }}><span>完整目录</span></a>
                        </span>
                      </div>
                    </div>
                    <div className="trx-clear" />
                  </div>
                  {/* 最新更新章节(源站 #qvod-pl-list 播放列表块; 契约最新 12 章) */}
                  <div className="trx-play-list-box">
                    <div className="trx-caption">
                      <h4><strong>《{book.name}》已更新到</strong></h4>
                      <div className="trx-txt">
                        {first && (
                          <a href={viewToUrl({ view: 'read', chapterId: first.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: first.id }) }}>{first.title}</a>
                        )}
                      </div>
                    </div>
                    <div className="trx-play-content">
                      <div className="trx-play-list">
                        {latest.map((c) => (
                          <div key={c.id}>
                            <a
                              href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)}
                              onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}
                            >{c.title}</a>
                          </div>
                        ))}
                      </div>
                      <div className="trx-clear" />
                    </div>
                  </div>
                </div>
                {/* 右栏: 热门点击(源站 .wudu-bar; 站方点击数无契约 → 字数热榜池近似) */}
                <div className="trx-wudu-bar">
                  <div className="trx-ui-title1"><h2>热门点击<em>Categories New</em></h2></div>
                  <div className="trx-ui-ranking">
                    <ul className="trx-ranking-list">
                      {(pool || []).slice(0, 15).map((b) => (
                        <li key={b.id}>
                          <a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a>
                          <span>({(fmtDate(b.updatedAt) || '').slice(5)})</span>
                        </li>
                      ))}
                      {!pool && Array.from({ length: 8 }).map((_, i) => <li key={i}><Sk style={{ height: 20 }} /></li>)}
                    </ul>
                  </div>
                </div>
                <div className="trx-clear" />
              </div>
            </div>
            {/* 「大神还喜欢」封面墙(源站 #comment.ui-box + #like-focus) */}
            <div className="trx-ui-box" id="trx-comment">
              <div className="trx-ui-title"><h2>看《{book.name}》的大神还喜欢</h2></div>
              <div id="trx-like-focus">
                <ul className="trx-img-list">
                  {likes.map((b) => (
                    <li key={b.id}>
                      <button className="trx-play-img" onClick={() => go(b)} aria-label={b.name}>
                        <BookCover cover={b.cover} name={b.name} />
                        <span className="trx-mask" aria-hidden />
                        <span className="trx-text">{b.author}</span>
                      </button>
                      <h5><a className="trx-play-a" href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a></h5>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
