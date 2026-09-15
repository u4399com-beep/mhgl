// ============================================================
// [R26-3-3] kks101(101看書) 书籍详情页克隆 —— 按 https://101kks.com/book/99.html 真站快照逐节还原
// (/tmp/r26/kks101-book.html + kks101-style.css 实测)
//
// 真站 DOM(.container > ul.row > li.col-8 66% + li.col-4 32% 浮动):
//   li.col-8 .mybox①:
//   ├ h3.mytitle > .bread     面包屑 首頁 > 分類 > 書名(.bread 14px; a #1f6cb2)
//   ├ .bookbox                .bookimg2 封面 180×240/阴影 0 1px 3px rgb(0 0 0/30%) + 左上 69×69 連載/完本角标
//   │                         .booknav2(calc(100%-200px)/pl 30px): h1 24px/1.3 mb 10px;
//   │                         p 15px #757575(py 5px): 作者：a / 分類：a / 「417.53萬字 | 連載」/ 更新：2026-09-12
//   ├ .addbtn                 a.btn×N(背景 #1f6cb2 白字/line-height 36px/padding 0 15px/16px/圆角 5px, hover 投影)
//   li.col-8 .mybox②:
//   ├ .infotag                h3.tagtitle 標籤 + ul.tagul(.infotag a: .8rem/1.8rem/边 #56a6c3/圆角 10px/
//   │                         底 rgb(232,244,255)/字 #1f6cb2/padding 0 .5rem)
//   ├ ul.tabs                 目錄|簡介|書評 三等分 tab(33%, 底边 #eee; active 字 #1f6cb2 + 底边 2px #1f6cb2/圆角顶 8px;
//   │                         a 16px flex 居中 py 4px 4px 8px); 本模板无书评实体 → 双 tab, 注释声明
//   ├ #tab_chapters           ul.qustime 章节行(li a: 底边 rgba(150,150,150,.2)/py 15px/16px #222;
//   │                         small 日期右浮 15px #666)
//   ├ #tab_info               ul.infolist(底 #f4f4f4/圆角 8px/flex; li 50% 居中 18px 700; span 12px 300)
//   │                         + .navtxt p(16px/line-height 35px/py 10px)
//   └ a.btn.more-btn          完整目錄(蓝钮)
//   li.col-4 .mybox:          h3.mytitle 本周最強 + .ranking ul(li a flex/border-b #eee/py 11px;
//                             rank_left 75% h3 15px 500 + 序号 span(14px/圆角 2px/底 #eee, 前3 红#f00·橙 rgb(255,111,0)·黄 rgb(222,204,1));
//                             active 首项: .rank_right 封面 80×105 + h4 红字 + p #999)
// 响应式(真站 ≤990px): col 全宽堆叠; .bookimg2 130×180; booknav2 h1 16px; addbtn a 宽 100%。
// 契约映射: 真站「開始閱讀/加入書架/投推薦票」→「開始閱讀/查看完整目錄/TXT下載」(任務书按钮组), 形态沿用 .btn。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import { FileDown, ListOrdered } from 'lucide-react'
import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../data'
import type { BookItem } from '../../types'
import { BookCover } from '../BookCover'
import { ErrorState, Sk } from '../bits'
import { fmtDate, formatWords } from '../../seo'

/** [R26-3-3] 真站实测色值(kks101-style.css) */
const BLUE = '#1f6cb2'
const RANK_GOLD = ['#f00', 'rgb(255,111,0)', 'rgb(222,204,1)']
const LINE = '#eee'
const LINE_SOFT = 'rgba(150,150,150,.2)'

/** 繁体状态文案(真站 status0=連載/status1=完本) */
function twStatus(s?: string | null): string {
  if (s === 'completed') return '完本'
  if (s === 'ongoing') return '連載'
  return '未知'
}

/** [R26-3-3] 面包屑(真站 .bread 14px, a #1f6cb2) — 导航禁 <a>, 用 button */
function KksBread({ items }: { items: { label: string; go?: () => void }[] }) {
  return (
    <div className="kks-bread text-[14px] font-normal">
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`}>
          {i > 0 && <span className="mx-1 text-[#999]">&gt;</span>}
          {it.go ? (
            <button type="button" onClick={it.go} className="text-[14px] transition-colors hover:underline" style={{ color: BLUE }} aria-label={`前往 ${it.label}`}>
              {it.label}
            </button>
          ) : (
            <span className="text-[#333]">{it.label}</span>
          )}
        </span>
      ))}
    </div>
  )
}

/** [R26-3-3] 标签胶囊(.infotag a 规格) */
function KksTag({ t }: { t: string }) {
  const { navigate } = usePublic()
  return (
    <button type="button" onClick={() => navigate({ view: 'keyword', tag: t })} className="kks-tagbtn kks-tagbtn-sm mr-[0.3rem] mb-[0.3rem]" aria-label={`浏览 ${t} 关键词书库`}>
      {t}
    </button>
  )
}

export function Kks101Book({ data, loading, error, tocPage, currentChapterId }: SiteBookProps) {
  const { navigate } = usePublic()
  const [tab, setTab] = useState<'chapters' | 'info'>('chapters')

  // [R26-3-3] 侧栏「本周最強」榜(真站 .ranking, 热门/完本双 tab 简化为热单一榜)
  const [hot, setHot] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBooks({ sort: 'words', page: 1, size: 10 })
      .then((d) => {
        if (alive) setHot(d.books || [])
      })
      .catch(() => {
        if (alive) setHot([])
      })
    return () => {
      alive = false
    }
  }, [])

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1112px] px-4 py-10 sm:px-6">
        <ErrorState message="書籍不存在或載入失敗" detail={error} />
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="mx-auto w-full max-w-[1112px] px-4 pb-10 sm:px-6" aria-label="书籍详情加载中">
        <div className="kks-mybox">
          <Sk className="mb-4 h-4 w-1/2" />
          <div className="flex flex-col gap-5 sm:flex-row">
            <Sk className="aspect-[3/4] w-[130px] shrink-0 sm:w-[180px]" />
            <div className="flex-1 space-y-3 pt-1">
              <Sk className="h-6 w-2/3" />
              <Sk className="h-3.5 w-1/3" />
              <Sk className="h-3.5 w-1/2" />
              <Sk className="h-3.5 w-2/5" />
              <div className="flex gap-2 pt-2">
                <Sk className="h-9 w-28" />
                <Sk className="h-9 w-32" />
                <Sk className="h-9 w-24" />
              </div>
            </div>
          </div>
          <span className="sr-only">加载中…</span>
        </div>
      </div>
    )
  }

  const { book, chapters, tocTotal, tocTotalPages, tags } = data
  const firstChapterId = chapters[0]?.id
  const tagList = (tags.length ? tags.map((t) => t.tag) : (book.keywords || '').split(/[,，、;；]+/)).filter(Boolean).slice(0, 14)

  return (
    <div className="mx-auto w-full max-w-[1112px] px-4 pb-10 sm:px-6" style={{ color: '#333' }}>
      <div className="lg:flex lg:items-start lg:gap-[2%]">
        {/* ================= 左列(真站 li.col-8 66%) ================= */}
        <div className="w-full lg:w-[66%]">
          {/* ---- .mybox① 面包屑 + bookbox + addbtn ---- */}
          <div className="kks-mybox">
            <div className="mb-2">
              <KksBread
                items={[
                  { label: '首頁', go: () => navigate({ view: 'home' }) },
                  { label: book.category || '小說', go: () => navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 }) },
                  { label: book.name },
                ]}
              />
            </div>
            {/* .bookbox */}
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-0">
              <div className="relative w-[130px] shrink-0 self-start sm:w-[180px]" style={{ aspectRatio: '3 / 4', boxShadow: '0 1px 3px rgb(0 0 0 / 30%)' }}>
                <BookCover name={book.name} cover={book.cover} className="absolute inset-0 h-full w-full" style={{ borderRadius: 0 }} />
                {/* 真站 .status0/.status1 69×69 连载角标图 → 文字角标替代(简化, 注释声明) */}
                <span
                  className="absolute left-0 top-0 rounded-br-[10px] px-2 py-0.5 text-[12px] text-white"
                  style={{ background: book.status === 'completed' ? '#4caf50' : BLUE }}
                  aria-label={twStatus(book.status)}
                >
                  {twStatus(book.status)}
                </span>
              </div>
              {/* .booknav2 */}
              <div className="min-w-0 flex-1 sm:pl-[30px]">
                <h1 className="mb-2.5 text-[20px] leading-[1.3] sm:text-[24px]" style={{ fontWeight: 700 }}>
                  {book.name}
                </h1>
                <p className="py-[5px] text-[15px] text-[#757575]">
                  作者：
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'search', q: book.author })}
                    className="text-[15px] transition-colors hover:underline"
                    style={{ color: BLUE }}
                    aria-label={`搜索作者 ${book.author}`}
                  >
                    {book.author}
                  </button>
                </p>
                <p className="py-[5px] text-[15px] text-[#757575]">
                  分類：
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 })}
                    className="text-[15px] transition-colors hover:underline"
                    style={{ color: BLUE }}
                    aria-label={`浏览 ${book.category} 分类`}
                  >
                    {book.category || '小說'}
                  </button>
                </p>
                <p className="py-[5px] text-[15px] text-[#757575]">
                  {formatWords(book.wordCount)} | {twStatus(book.status)}
                </p>
                <p className="py-[5px] text-[15px] text-[#757575]">更新：{fmtDate(book.updatedAt)}</p>
                <p className="py-[5px] text-[15px] text-[#757575]">
                  最新：
                  <button
                    type="button"
                    onClick={() => firstChapterId && tocTotalPages > 1 && navigate({ view: 'toc', bookId: book.id, page: tocTotalPages })}
                    className="text-[15px] transition-colors hover:underline"
                    style={{ color: BLUE }}
                    aria-label="查看最新章節"
                  >
                    {book.latestChapter || '—'}
                  </button>
                </p>
              </div>
            </div>
            {/* .addbtn 按钮组(真站 line-height 36px/padding 0 15px/圆角 5px) */}
            <div className="flex flex-wrap gap-2 pt-2.5 sm:pl-[30px]">
              <button
                type="button"
                onClick={() => firstChapterId && navigate({ view: 'read', chapterId: firstChapterId })}
                disabled={!firstChapterId}
                className="kks-btn text-[16px] disabled:opacity-60"
                aria-label="開始閱讀"
              >
                開始閱讀
              </button>
              <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })} className="kks-btn text-[16px]" aria-label="查看完整目錄">
                查看完整目錄
              </button>
              {/* TXT 下載 —— 全站唯一允许的 <a> */}
              <a href={`/api/public/download?book=${book.id}`} className="kks-btn" aria-label={`下載《${book.name}》TXT`}>
                <FileDown className="mr-1 inline h-4 w-4 align-[-2px]" aria-hidden />
                TXT下載
              </a>
            </div>
          </div>

          {/* ---- .mybox② 標籤 + tabs(目錄/簡介) + 内容 + 完整目錄 ---- */}
          <div className="kks-mybox">
            {/* .infotag */}
            {tagList.length > 0 && (
              <div className="mb-3 flex flex-wrap items-start pb-[5px]">
                <h2 className="mr-2 shrink-0 text-[16px]" style={{ fontWeight: 700, color: '#333' }}>
                  標籤
                </h2>
                <ul className="flex flex-wrap" aria-label="書籍標籤">
                  {tagList.map((t) => (
                    <li key={t}>
                      <KksTag t={t} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* ul.tabs 双 tab(真站三 tab 含書評, 本模板无书评实体) */}
            <ul className="mb-2.5 flex border-b" style={{ borderColor: LINE }} role="tablist">
              {(
                [
                  { key: 'chapters', label: '目錄' },
                  { key: 'info', label: '簡介' },
                ] as const
              ).map((t) => (
                <li key={t.key} className="w-1/2">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex w-full items-center justify-center rounded-t-[8px] py-1.5 pb-2 text-[16px] transition-colors ${tab === t.key ? 'border-b-2' : ''}`}
                    style={tab === t.key ? { color: BLUE, borderColor: BLUE } : { color: '#666' }}
                    aria-label={t.label}
                  >
                    <ListOrdered className="mr-1.5 h-4 w-4 opacity-60" aria-hidden />
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>

            {tab === 'chapters' ? (
              <>
                {/* #tab_chapters · qustime 行式目录(页内预览 + 翻页) */}
                <ul>
                  {chapters.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => navigate({ view: 'read', chapterId: c.id })}
                        className={`block w-full truncate border-b py-[15px] text-left text-[16px] transition-colors hover:text-[#06c] ${c.id === currentChapterId ? 'font-bold' : ''}`}
                        style={{ borderColor: LINE_SOFT, color: c.id === currentChapterId ? BLUE : '#222' }}
                        aria-label={`閱讀 ${c.title}`}
                      >
                        {c.title}
                      </button>
                    </li>
                  ))}
                </ul>
                {/* 目录页内翻页(真站完整目录在 /book/{id}/index.html, 此处按契约提供 tocPage 翻页) */}
                {tocTotalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 text-[14px]">
                    <button
                      type="button"
                      disabled={tocPage <= 1}
                      onClick={() => navigate({ view: 'book', bookId: book.id, page: tocPage - 1 })}
                      className="kks-pg"
                      style={{ opacity: tocPage <= 1 ? 0.45 : undefined }}
                      aria-label="上一頁目錄"
                    >
                      上一頁
                    </button>
                    <span className="text-[#999]">
                      第 {tocPage} / {tocTotalPages} 頁 · 共 {tocTotal} 章
                    </span>
                    <button
                      type="button"
                      disabled={tocPage >= tocTotalPages}
                      onClick={() => navigate({ view: 'book', bookId: book.id, page: tocPage + 1 })}
                      className="kks-pg"
                      style={{ opacity: tocPage >= tocTotalPages ? 0.45 : undefined }}
                      aria-label="下一頁目錄"
                    >
                      下一頁
                    </button>
                  </div>
                )}
                <div className="mt-4 text-center">
                  <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })} className="kks-btn" aria-label="查看完整目錄">
                    完整目錄
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* #tab_info · infolist 数据条 + navtxt 简介 */}
                <ul className="mt-5 flex rounded-[8px] py-2.5" style={{ background: '#f4f4f4' }}>
                  <li className="w-1/2 text-center text-[18px] leading-[18px]" style={{ fontWeight: 700 }}>
                    {formatWords(book.wordCount)}
                    <span className="block text-[12px] font-light">字數</span>
                  </li>
                  <li className="w-1/2 text-center text-[18px] leading-[18px]" style={{ fontWeight: 700 }}>
                    {tocTotal}
                    <span className="block text-[12px] font-light">章節數</span>
                  </li>
                </ul>
                <div className="navtxt">
                  <p className="py-2.5 text-[16px]" style={{ lineHeight: '35px', color: '#333' }}>
                    {book.intro || '暫無簡介'}
                  </p>
                  {book.keywords && <p className="pb-2 text-[13px] text-[#666]">小說關鍵詞：{book.keywords.replace(/[,，、;；]+$/u, '')}</p>}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ================= 右列(真站 li.col-4 32%) ================= */}
        <aside className="w-full lg:w-[32%]">
          <div className="kks-mybox">
            <h2 className="kks-mytitle">本周最強</h2>
            {hot === null ? (
              <ul aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex items-center justify-between border-b py-[11px]" style={{ borderColor: LINE }}>
                    <Sk className="h-4 w-2/3" />
                    <Sk className="h-3 w-8" />
                  </li>
                ))}
                <span className="sr-only">加载中…</span>
              </ul>
            ) : hot.length ? (
              <ul className="kks-ranking">
                {hot.map((b, i) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: b.id })}
                      className="flex w-full items-center justify-between border-b py-[11px] text-left transition-colors"
                      style={{ borderColor: LINE }}
                      aria-label={`查看《${b.name}》详情`}
                    >
                      <span className="w-[75%] min-w-0">
                        <span className="flex items-center text-[15px]" style={{ fontWeight: 500, color: i === 0 ? '#222' : '#333' }}>
                          <span
                            className="mr-2.5 inline-block shrink-0 rounded-[2px] px-[5px] text-center text-[14px] leading-[20px]"
                            style={{ background: i < 3 ? RANK_GOLD[i] : '#eee', color: i < 3 ? '#fff' : '#666' }}
                            aria-hidden
                          >
                            {i + 1}
                          </span>
                          <span className="truncate">{b.name}</span>
                        </span>
                        {i === 0 && (
                          <>
                            <span className="block pb-2.5 pt-[5px] text-[13px] text-[#f00]">本周最強</span>
                            <span className="block truncate text-[13px] text-[#999]">
                              {b.category}.{b.author}
                            </span>
                          </>
                        )}
                      </span>
                      <span className="w-[23%] shrink-0 text-right">
                        {i === 0 ? (
                          <span className="relative mx-auto block overflow-hidden" style={{ width: 80, height: 105, boxShadow: '0 1px 3px rgb(0 0 0 / 30%)' }}>
                            <BookCover name={b.name} cover={b.cover} className="absolute inset-0 h-full w-full" style={{ borderRadius: 0 }} />
                          </span>
                        ) : (
                          <span className="text-[13px] text-[#999]">{twStatus(b.status)}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-[#999]">暫無榜單數據</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
