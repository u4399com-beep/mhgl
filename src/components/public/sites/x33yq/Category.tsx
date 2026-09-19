// ============================================================
// [R43-2] x33yq(33言情) 克隆分类页 —— 快照 /tmp/r43-snap/sort1.html(/sort/1/ 直连实抓)
//   源站结构: #conn > #hotcontent > .l > #alist > h3「{分类}小说列表」+ #alistbox ×20(每页) +
//     .pic 封面 115×160 + .info(.title《书名》+ 作者 / .sys 最新更新：xx / .intro 简介 / .yuedu 开始阅读)
//     + #pagelink.pagelink(首页/页码/下一页/尾页)
//   [R43-2v] 复核轮: stylelist.css 已实抓, 分页条实测为 .articlepage 灰底 #f9f9f9 40px 形态;
//     列表卡/分页条样式均按实测对齐(见 index.ts); 「加入书架」为源站登录交互不克隆, 仅保留功能性「开始阅读」。
// ============================================================
'use client'

import type { SiteCategoryProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { BookCover } from '../../BookCover'
import { EmptyState, ErrorState, Sk } from '../../bits'
import type { BookItem } from '../../types'

/** 单页页码窗口(当前页起最多 8 个, 与源站 /sort/1/2/ 分页形态一致) */
function pageWindow(page: number, total: number): number[] {
  const out: number[] = []
  const end = Math.min(total, page + 7)
  for (let p = Math.max(1, page - 3); p <= end; p++) out.push(p)
  return out
}

/** 列表卡行(分类页/排行页共用形态; 源站 #alistbox) */
export function X33yqAlistRows({ books, loading, error, empty }: { books: BookItem[]; loading: boolean; error: string; empty: string }) {
  const { site, navigate } = usePublic()
  const go = (b: BookItem) => navigate({ view: 'book', bookId: b.id })
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)
  if (loading) {
    return (
      <div className="xq-alist-body" role="status" aria-label="列表加载中">
        {Array.from({ length: 6 }).map((_, i) => <Sk key={i} style={{ height: 180, margin: 10, borderRadius: 0 }} />)}
      </div>
    )
  }
  if (error) return <div className="xq-alist-body"><ErrorState message="列表加载失败" detail={error} /></div>
  if (books.length === 0) return <div className="xq-alist-body"><EmptyState text={empty} hint="换个分类看看" /></div>
  return (
    <div className="xq-alist-body">
      {books.map((b) => (
        <div className="xq-alistbox" key={b.id}>
          <button className="xq-pic" onClick={() => go(b)} aria-label={b.name}>
            <BookCover cover={b.cover} name={b.name} />
          </button>
          <div className="xq-info">
            <div className="xq-title">
              <a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>《{b.name}》</a>
              <span>作者：{b.author}</span>
            </div>
            <div className="xq-sys">最新更新：{b.latestChapter || '暂无章节'}</div>
            <div className="xq-intro-list">{(b.intro || '暂无简介').slice(0, 88)}</div>
            <div className="xq-yuedu">
              <a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>开始阅读</a>
            </div>
          </div>
          <div className="xq-clear" />
        </div>
      ))}
      <div className="xq-clear" />
    </div>
  )
}

/** 分页条(源站 .articlepage > #pagelink.pagelink: 首页/页码/下一页/尾页, 当前页为 strong; 灰底 40px 实测形态) */
export function X33yqPageLink({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  const nums = pageWindow(page, totalPages)
  return (
    <div className="xq-articlepage">
      <div className="xq-pagelink" role="navigation" aria-label="分页">
        <a href="#" onClick={(e) => { e.preventDefault(); onPage(1) }}>首页</a>
        {nums.map((p) => (
          p === page
            ? <strong key={p}>{p}</strong>
            : <a key={p} href="#" onClick={(e) => { e.preventDefault(); onPage(p) }}>{p}</a>
        ))}
        {page < totalPages && <a href="#" className="xq-next" onClick={(e) => { e.preventDefault(); onPage(page + 1) }}>下一页</a>}
        {page < totalPages && <a href="#" className="xq-ngroup" onClick={(e) => { e.preventDefault(); onPage(totalPages) }}>尾页</a>}
      </div>
    </div>
  )
}

export function X33yqCategory({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()
  const books = data?.books || []
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 24))
  const onPage = (p: number) => navigate({ view: 'category', cat, page: p })

  return (
    <div className="xq-cat">
      <div id="xq-main">
        <div id="xq-conn">
          <div id="xq-hotcontent">
            <div className="xq-l">
              <div className="xq-alist">
                <h3 className="xq-alist-h3">{catName}小说列表</h3>
                <X33yqAlistRows books={books} loading={loading} error={error} empty="暂无相关书籍" />
                <X33yqPageLink page={page} totalPages={totalPages} onPage={onPage} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
