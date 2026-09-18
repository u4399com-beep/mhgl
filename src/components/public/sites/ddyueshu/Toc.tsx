// ============================================================
// [R39-2d] ddyueshu 克隆目录页 —— biquge 家族完整目录形态(.box_con #list dl: dt 卷 / dd 章)
//   (真站 book 页内嵌首页目录; 完整目录以同形态分页展开, 平台 Toc 视图契约)
// ============================================================
'use client'

import type { SiteTocProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { DdyFooter } from './parts'

export function DdyueshuToc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const totalPages = data?.tocTotalPages || 1

  return (
    <div className="ddy-toc">
      <div id="ddy-main">
        <div className="ddy-box-con">
          <div className="ddy-con-top">
            <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>{site.name}</a>
            {' > '}{book ? `《${book.name}》完整目录` : '目录'}
          </div>
          {loading ? (
            <div className="ddy-box-con-inner"><Sk style={{ height: 300 }} /></div>
          ) : error || !book ? (
            <div className="ddy-box-con-inner"><ErrorState message="目录加载失败" detail={error} /></div>
          ) : (
            <dl className="ddy-list">
              <dt>《{book.name}》正文 · 第 {page} / {totalPages} 页</dt>
              {chapters.map((c) => (
                <dd key={c.id} className={c.id === currentChapterId ? 'ddy-ch-active' : undefined}>
                  <a
                    href={viewToUrl({ view: 'read', chapterId: c.id }, site.id)}
                    onClick={(e) => { e.preventDefault(); navigate({ view: 'read', chapterId: c.id }) }}
                    title={c.title}
                  >{c.title}</a>
                </dd>
              ))}
            </dl>
          )}
          <dl className="ddy-page ddy-toc-page">
            <dd>
              <a href="#" onClick={(e) => { e.preventDefault(); if (book && page > 1) navigate({ view: 'toc', bookId: book.id, page: page - 1 }) }}>上一页</a>
              <a href="#" onClick={(e) => { e.preventDefault(); if (book && page < totalPages) navigate({ view: 'toc', bookId: book.id, page: page + 1 }) }}>下一页</a>
              {book && (
                <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: book.id }) }}>返回书页</a>
              )}
            </dd>
          </dl>
        </div>
      </div>
      <DdyFooter />
    </div>
  )
}
