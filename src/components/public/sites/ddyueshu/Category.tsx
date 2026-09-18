// ============================================================
// [R39-2d] ddyueshu 克隆分类页 —— 真站 /xuanhuanxiaoshuo/ 家族形态(box_con 列表) +
//   /paihangbang/ 快照(category.v2.html 13.7KB); biquge 家族列表页: .box_con > .con_top 面包屑
//   + #newscontent(.l 列表 .li s1-s5 行) + 分页
// ============================================================
'use client'

import type { SiteCategoryProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import type { BookItem } from '../../types'
import { DdyFooter } from './parts'

export function DdyueshuCategory({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { site, navigate } = usePublic()
  const books = data?.books || []
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 24))

  const go = (b: BookItem) => navigate({ view: 'book', bookId: b.id })
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)

  return (
    <div className="ddy-cat">
      <div id="ddy-main">
        <div className="ddy-box-con">
          <div className="ddy-con-top">
            <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>{site.name}</a>
            {' > '}{catName}
          </div>
          <div className="ddy-newscontent">
            <div className="ddy-nc-l">
              <h2>{catName}列表</h2>
              <ul>
                {loading
                  ? Array.from({ length: 14 }).map((_, i) => <li key={i}><Sk style={{ height: 24 }} /></li>)
                  : error
                    ? <li><ErrorState message="列表加载失败" detail={error} /></li>
                    : books.length === 0
                      ? <li><ErrorState message="暂无相关书籍" /></li>
                      : books.map((b) => (
                        <li key={b.id}>
                          <span className="ddy-s2"><a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a></span>
                          <span className="ddy-s3">{(b.intro || '').slice(0, 40) || '暂无简介'}</span>
                          <span className="ddy-s5">{b.author}</span>
                        </li>
                      ))}
              </ul>
              {/* 分页(真站 .page 追加形态) */}
              <dl className="ddy-page">
                <dd>
                  <a href="#" onClick={(e) => { e.preventDefault(); if (page > 1) navigate({ view: 'category', cat, page: page - 1 }) }}>上一页</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); if (page < totalPages) navigate({ view: 'category', cat, page: page + 1 }) }}>下一页</a>
                  <span>第 {page} / {totalPages} 页 · 共 {total} 本</span>
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
      <DdyFooter />
    </div>
  )
}
