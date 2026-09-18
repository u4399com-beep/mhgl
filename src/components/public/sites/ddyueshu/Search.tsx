// ============================================================
// [R39-2d] ddyueshu 克隆搜索/排行/全本 —— 家族标准形态(biquge 列表行 s1-s5)
//   Search: 真站搜索 GET /modules/article/search.php(家族标准); Ranking: /paihangbang/ 快照实测
//   Fulltext: /xiaoshuodaquan/ 全部小说
// ============================================================
'use client'

import type { SiteSearchProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { DdyFooter } from './parts'
import type { BookItem } from '../../types'

function DdyListRows({ books, loading, error, empty }: { books: BookItem[]; loading: boolean; error: string; empty: string }) {
  const { site, navigate } = usePublic()
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)
  return (
    <ul className="ddy-ul-list">
      {loading
        ? Array.from({ length: 12 }).map((_, i) => <li key={i}><Sk style={{ height: 24 }} /></li>)
        : error
          ? <li><ErrorState message="加载失败" detail={error} /></li>
          : books.length === 0
            ? <li><ErrorState message={empty} /></li>
            : books.map((b) => (
              <li key={b.id}>
                <span className="ddy-s1">[{b.category || '小说'}]</span>
                <span className="ddy-s2"><a href={link(b)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}>{b.name}</a></span>
                <span className="ddy-s3">{(b.intro || '').slice(0, 42) || '暂无简介'}</span>
                <span className="ddy-s5">{b.author}</span>
              </li>
            ))}
    </ul>
  )
}

export function DdyueshuSearch({ q, data, loading, error }: SiteSearchProps) {
  const { navigate } = usePublic()
  return (
    <div className="ddy-search">
      <div id="ddy-main">
        <div className="ddy-box-con">
          <div className="ddy-con-top">搜索「{q}」的结果</div>
          <div className="ddy-newscontent">
            <div className="ddy-nc-l">
              <h2>相关书籍</h2>
              <DdyListRows books={data?.books || []} loading={loading} error={error} empty="未找到相关书籍, 换个关键词试试" />
              {(data?.relatedTags?.length || 0) > 0 && (
                <div className="ddy-listtj">
                  <b>相关词：</b>
                  {data?.relatedTags.slice(0, 10).map((t) => (
                    <a key={t.tag + t.bookId} href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'keyword', tag: t.tag }) }}>{t.tag}</a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <DdyFooter />
    </div>
  )
}
