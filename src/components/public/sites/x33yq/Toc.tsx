// ============================================================
// [R43-2] x33yq(33言情) 克隆目录页 —— 快照 /tmp/r43-snap/toc.html(/read/68759/ 直连实抓)
//   源站结构(笔趣阁家族目录形态): .box_con > .con_top 面包屑 + #sidebar(.sidebartitle「妹纸们都在看：」
//     + .sidebarlist 26 条书链) + #maininfo(a>#fmimg 封面 + #info(h1 书名/作者/类别/动作/更新/最新连载)
//     + #intro 声明行+.introtxt 简介) + 第二 .box_con > #list > dl(dt 卷名 / dd 章节三列) + #footer
//   [R43-2v] 复核轮: list.css 已实抓, 侧栏右浮 264 左虚线界 / maininfo 左浮 700 / fmimg 150×200 #E1ECED 底 /
//     info h1 28px 黑体 / 章节格 dd 33% #ccc 虚线界缩进 10px 链 #444 均按实测对齐(见 index.ts);
//     源站目录无分页(全量单页), 平台分页与「返回书页/开始阅读」动作盒为功能性补充。
// ============================================================
'use client'

import type { SiteTocProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { useWordsPool } from '../hooks'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate } from '../../seo'
import { X33yqPageLink } from './Category'

export function X33yqToc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const totalPages = data?.tocTotalPages || 1
  const pool = useWordsPool(site.id) // 侧栏「妹纸们都在看」书链池(字数热榜近似)

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="xq-toc">
      <div id="xq-main">
        {/* 书信息块(源站首 .box_con: 面包屑 + 侧栏 + maininfo) */}
        <div className="xq-box-con">
          <div className="xq-con-top">
            <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>首页</a>
            {' > '}
            <a href="#" onClick={(e) => { e.preventDefault(); if (book) navigate({ view: 'category', cat: book.categoryId || undefined }) }}>{book?.category || '小说'}</a>
            {' > '}
            <a href="#" onClick={(e) => { e.preventDefault(); if (book) navigate({ view: 'book', bookId: book.id }) }}>{book?.name || ''}</a>
            {' > '}{book ? `${book.name}章节列表` : '目录'}
          </div>
          {loading || !book ? (
            <div style={{ padding: 12 }}>
              {error ? <ErrorState message="目录加载失败" detail={error} /> : <Sk style={{ height: 280, borderRadius: 0 }} />}
            </div>
          ) : (
            <>
              <div id="xq-sidebar">
                <div className="xq-sidebartitle">妹纸们都在看：</div>
                <div className="xq-sidebarlist">
                  {(pool || []).slice(0, 26).map((b) => (
                    <a key={b.id} href={viewToUrl({ view: 'book', bookId: b.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}>{b.name}</a>
                  ))}
                </div>
              </div>
              <div id="xq-maininfo">
                <button className="xq-fmimg" onClick={() => navigate({ view: 'book', bookId: book.id })} aria-label={book.name}>
                  <BookCover cover={book.cover} name={book.name} />
                </button>
                <div id="xq-info">
                  <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: book.id }) }}><h1>{book.name}</h1></a>
                  <p>作&nbsp;&nbsp;&nbsp;&nbsp;者：{book.author}</p>
                  <p>类&nbsp;&nbsp;&nbsp;&nbsp;别：{book.category || '小说'}({book.name})</p>
                  <p>
                    动&nbsp;&nbsp;&nbsp;&nbsp;作：
                    <a href="#" onClick={(e) => { e.preventDefault(); const c = chapters[0]; if (c) navigate({ view: 'read', chapterId: c.id }) }}>开始阅读</a>
                    ,<a href="#xq-list" onClick={(e) => { e.preventDefault(); scrollTo('xq-list') }}><span className="xq-red">直达底部↓</span></a>
                  </p>
                  <p>更新时间：{fmtDate(book.updatedAt)}</p>
                  <p>最新连载：{book.latestChapter || '暂无'}</p>
                </div>
                <div id="xq-intro">
                  <p>《{book.name}》为作者{book.author}创作，33言情为你第一时间提供{book.name}全文免费在线阅读。</p>
                  <p className="xq-introtxt">简介:{book.intro || '暂无简介'}</p>
                </div>
                <div className="xq-clear" />
              </div>
              <div className="xq-clear" />
            </>
          )}
        </div>
        {/* 章节列表块(源站第二 .box_con > #list) */}
        <div className="xq-box-con">
          <div id="xq-list">
            {loading ? (
              <Sk style={{ height: 300, borderRadius: 0 }} />
            ) : error || !book ? (
              <ErrorState message="章节列表加载失败" detail={error} />
            ) : (
              <dl>
                <dt>《{book.name}》正文 · 第 {page} / {totalPages} 页</dt>
                {chapters.map((c) => (
                  <dd key={c.id} className={c.id === currentChapterId ? 'xq-ch-active' : undefined}>
                    <a
                      href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)}
                      onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}
                      title={c.title}
                    >{c.title}</a>
                  </dd>
                ))}
              </dl>
            )}
          </div>
          <X33yqPageLink
            page={page}
            totalPages={totalPages}
            onPage={(p) => { if (book) navigate({ view: 'toc', bookId: book.id, page: p }) }}
          />
          {book && (
            <div className="xq-pages">
              <div className="xq-pagelink">
                <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: book.id }) }}>返回书页</a>
                <a href="#" onClick={(e) => { e.preventDefault(); const c = chapters[0]; if (c) navigate({ view: 'read', chapterId: c.id }) }}>开始阅读</a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
