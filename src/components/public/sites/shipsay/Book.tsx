// ============================================================
// [R28-2e-3] shipsay(船说 CMS demo) 书籍详情页克隆 —— 船说 V4.2 novel 页还原
// 素材等级: Wayback 实测 —— /tmp/r28-2e/snap/ss-book.html(2024-05-20 快照
// demo.shipsay.com/book/80001/《多情剑客无情剑》完整 DOM, 本轮重新抓取):
//   .container > section.section > .novel_info_main(img 封面 + .novel_info_title >
//     h1 书名 + i 作者：a + p > span 分类 + span 字数 + span.fullflag 全本 +
//     .flex.to100 最新章节：a + em.s_gray 日期 + .flex > a.l_btn(fa-file-text 开始阅读) +
//     a.l_btn_0(fa-tag 最近阅读)) +
//   ul.flex.ulcard > li.act > a#a_info 作品信息 / li > a#a_catalog 目录 span（89章） +
//   #info > .intro(简介 p) + .section.chapter_list > .title.jcc《书名》最新章节 +
//     ul li(站方倒序 12) + #catalog > .section.chapter_list > ul#ul_all_chapters(全量)
// 契约映射(降级声明):
//   ①「最近阅读」按钮(l_btn_0 → /history.html) → TXT 下载同形钮(唯一允许 <a>, 声明)
//   ②作品信息/目录 tab 双态(真站 JS a_info/a_catalog 显隐) → 单页顺序展示 + tab 头锚点滚动(声明)
//   ③最新章节 12 条: 真站为站方倒序 → 取当前目录页尾部 12 条倒序(多页书第 1 页≈最早, 声明)
//   ④目录分页: 真站单页全量 → 契约 100 章/页分页(声明)
// 色值: 实测快照(同首页); 图标 fa → lucide。
// ============================================================
'use client'

import { useState } from 'react'
import { FileDown, Home as HomeIcon, List, Play, Tag } from 'lucide-react'
import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate, formatWords } from '../../seo'

/** [R28-2e-3] 船说模板实测色值(同 Home) */
const C = {
  bg: '#f4f4f4',
  card: '#ffffff',
  text: '#666666',
  link: '#1a1a1a',
  hover: '#ed4259',
  title: '#555555',
  blue: '#4284ed',
  line: '#e3e3e3',
} as const

export function ShipsayBook({ data, loading, error, tocPage, currentChapterId }: SiteBookProps) {
  const { navigate } = usePublic()
  // ulcard tab(真站 JS a_info/a_catalog 切换 → 本模板单页顺序展示 + tab 头锚点, 声明)
  const [tab, setTab] = useState<'info' | 'catalog'>('info')

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-2 py-10">
        <ErrorState message="书籍不存在或加载失败" detail={error} />
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-2 pb-6 pt-3" aria-label="书籍详情加载中">
        <div className="ss-card p-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Sk className="h-[133px] w-[100px] shrink-0" />
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <Sk className="h-6 w-2/3" />
              <Sk className="h-4 w-1/3" />
              <Sk className="h-4 w-1/2" />
            </div>
          </div>
          <Sk className="mt-3 h-16 w-full" />
        </div>
        <span className="sr-only">加载中…</span>
      </div>
    )
  }

  const { book, chapters, tocTotal, tocTotalPages } = data
  const firstChapter = chapters[0]
  // 真站「最新章节」为站方倒序 12 条; 模板取当前目录页尾部 12 条倒序(声明, 同 ggd66 先例)
  const latest12 = [...chapters].slice(-12).reverse()

  const lbtn = 'inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1.5 text-[14px] text-white transition-opacity hover:opacity-85 disabled:opacity-50'

  return (
    <div className="ss-home w-full pb-6" style={{ background: C.bg, color: C.text, fontSize: 14 }}>
      <div className="mx-auto w-full max-w-[960px] px-2 pt-3">
        <div className="ss-card p-3">
          {/* ============ .novel_info_main ============ */}
          <div className="ss-novel_info flex flex-col gap-3 sm:flex-row">
            <div className="shrink-0" style={{ width: 100, height: 133 }}>
              <BookCover name={book.name} cover={book.cover} className="h-full w-full" style={{ borderRadius: 0 }} />
            </div>
            <div className="ss-novel_info_title min-w-0 flex-1">
              <h1 className="m-0 text-[20px] font-bold leading-snug" style={{ color: C.title }}>
                {book.name}
              </h1>
              <i className="mt-1 block not-italic">
                作者：
                <button type="button" onClick={() => navigate({ view: 'search', q: book.author })} className="hover:underline" style={{ color: C.link }} aria-label={`搜索 ${book.author} 的作品`}>
                  {book.author}
                </button>
              </i>
              <p className="my-1.5 flex flex-wrap items-center gap-2">
                <span className="ss-tag inline-block rounded-[3px] px-1.5 py-px text-[12px]" style={{ background: '#f4f4f4', color: C.text }}>
                  {book.category || '小说'}
                </span>
                <span className="ss-tag inline-block rounded-[3px] px-1.5 py-px text-[12px]" style={{ background: '#f4f4f4', color: C.text }}>
                  {formatWords(book.wordCount)}
                </span>
                {/* 真站 span.fullflag「全本」: 遮罩完本红的实底等价(R24 实测 rgba(191,44,36,.75)) */}
                <span className="ss-fullflag inline-block rounded-[3px] px-1.5 py-px text-[12px] text-white" style={{ background: book.status === 'completed' ? '#bf2c24' : C.blue }}>
                  {book.status === 'completed' ? '全本' : '连载'}
                </span>
              </p>
              {/* .flex.to100 最新章节行 */}
              <div className="ss-flex flex items-baseline gap-1.5 border-b pb-1.5" style={{ borderColor: C.line }}>
                <span className="shrink-0">最新章节：</span>
                <button
                  type="button"
                  onClick={() => firstChapter && navigate({ view: 'read', chapterId: firstChapter.id })}
                  className="min-w-0 truncate hover:underline"
                  style={{ color: C.link }}
                  aria-label="阅读最新章节"
                >
                  {book.latestChapter || '—'}
                </button>
                <em className="ss-gray ml-auto shrink-0 not-italic text-[12px]">{fmtDate(book.updatedAt) || ''}</em>
              </div>
              {/* .flex 按钮组(开始阅读 / TXT 下载 ← 唯一 <a>) */}
              <div className="ss-flex mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => firstChapter && navigate({ view: 'read', chapterId: firstChapter.id })}
                  disabled={!firstChapter}
                  className={lbtn}
                  style={{ background: C.hover }}
                  aria-label="开始阅读"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden />
                  开始阅读
                </button>
                <a
                  href={`/api/public/download?book=${book.id}`}
                  className={`${lbtn} ss-lbtn0`}
                  style={{ background: 'transparent', color: C.hover, border: `1px solid ${C.hover}` }}
                  aria-label={`下载《${book.name}》TXT`}
                >
                  <FileDown className="h-3.5 w-3.5" aria-hidden />
                  TXT下载
                </a>
              </div>
            </div>
          </div>

          {/* ============ ul.flex.ulcard tab 头(真站 作品信息/目录（N章）) ============ */}
          <ul className="ss-ulcard m-0 mt-3 flex list-none border-b p-0" style={{ borderColor: C.line }}>
            <li className={tab === 'info' ? 'act' : ''}>
              <button
                type="button"
                onClick={() => {
                  setTab('info')
                  document.getElementById('info')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="inline-flex items-center gap-1 px-3 py-2 text-[14px]"
                style={{ color: tab === 'info' ? C.hover : C.link, borderBottom: tab === 'info' ? `2px solid ${C.hover}` : '2px solid transparent' }}
                aria-label="作品信息"
                aria-current={tab === 'info' ? 'true' : undefined}
              >
                <Tag className="h-3.5 w-3.5" aria-hidden />
                作品信息
              </button>
            </li>
            <li className={tab === 'catalog' ? 'act' : ''}>
              <button
                type="button"
                onClick={() => {
                  setTab('catalog')
                  document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="inline-flex items-center gap-1 px-3 py-2 text-[14px]"
                style={{ color: tab === 'catalog' ? C.hover : C.link, borderBottom: tab === 'catalog' ? `2px solid ${C.hover}` : '2px solid transparent' }}
                aria-label="目录"
                aria-current={tab === 'catalog' ? 'true' : undefined}
              >
                <List className="h-3.5 w-3.5" aria-hidden />
                目录<span>（{tocTotal}章）</span>
              </button>
            </li>
          </ul>

          {/* ============ #info(.intro 简介 + 最新章节 12) ============ */}
          <div id="info" className="pt-3">
            <div className="ss-intro text-[14px] leading-[24px]" style={{ color: C.text }}>
              {(book.intro || '暂无简介').split(/\n+/).map((p, i) => (
                <p key={i} className="m-0 mb-2" style={{ textIndent: '2em' }}>
                  {p}
                </p>
              ))}
            </div>
            <div className="ss-section chapter_list mt-3">
              <div className="ss-title jcc py-1.5 text-center text-[15px] font-bold" style={{ color: C.title }}>
                《{book.name}》最新章节
              </div>
              <ul className="m-0 grid list-none grid-cols-1 gap-x-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {latest12.map((c) => (
                  <li key={c.id} className="overflow-hidden whitespace-nowrap border-b border-dashed py-1.5" style={{ borderColor: C.line }}>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'read', chapterId: c.id })}
                      className="max-w-full truncate text-left hover:underline"
                      style={{ color: currentChapterId === c.id ? C.hover : C.link }}
                      aria-label={`阅读 ${c.title}`}
                    >
                      {c.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ============ #catalog(ul#ul_all_chapters 全部章节 + 契约分页) ============ */}
          <div id="catalog" className="pt-3">
            <div className="ss-section chapter_list">
              <div className="ss-title jcc py-1.5 text-center text-[15px] font-bold" style={{ color: C.title }}>
                《{book.name}》全部章节
              </div>
              <ul id="ul_all_chapters" className="m-0 grid list-none grid-cols-1 gap-x-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {chapters.map((c) => (
                  <li key={c.id} className="overflow-hidden whitespace-nowrap border-b border-dashed py-1.5" style={{ borderColor: C.line }}>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'read', chapterId: c.id })}
                      className="max-w-full truncate text-left hover:underline"
                      style={{ color: currentChapterId === c.id ? C.hover : C.link }}
                      aria-label={`阅读 ${c.title}`}
                      aria-current={currentChapterId === c.id ? 'true' : undefined}
                    >
                      {c.title}
                    </button>
                  </li>
                ))}
              </ul>
              {tocTotalPages > 1 && (
                <nav aria-label="目录分页" className="ss-pages flex flex-wrap items-center justify-center py-3">
                  {tocPage > 1 && (
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: book.id, page: tocPage - 1 })}
                      className="ss-pg m-[2px] inline-flex h-[32px] min-w-[32px] items-center justify-center rounded-[3px] border px-1.5 text-[13px]"
                      aria-label="上一页"
                    >
                      上一页
                    </button>
                  )}
                  {Array.from({ length: Math.min(10, tocTotalPages) }, (_, i) => Math.max(1, Math.min(tocPage - 4, tocTotalPages - 9)) + i).map((n) =>
                    n === tocPage ? (
                      <strong
                        key={n}
                        className="ss-pg m-[2px] inline-flex h-[32px] min-w-[32px] items-center justify-center rounded-[3px] border px-1.5 text-[13px]"
                        style={{ background: C.hover, borderColor: C.hover, color: '#fff' }}
                        aria-current="page"
                      >
                        {n}
                      </strong>
                    ) : (
                      <button
                        key={n}
                        type="button"
                        onClick={() => navigate({ view: 'book', bookId: book.id, page: n })}
                        className="ss-pg m-[2px] inline-flex h-[32px] min-w-[32px] items-center justify-center rounded-[3px] border px-1.5 text-[13px]"
                        aria-label={`第 ${n} 页`}
                      >
                        {n}
                      </button>
                    ),
                  )}
                  {tocPage < tocTotalPages && (
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: book.id, page: tocPage + 1 })}
                      className="ss-pg m-[2px] inline-flex h-[32px] min-w-[32px] items-center justify-center rounded-[3px] border px-1.5 text-[13px]"
                      aria-label="下一页"
                    >
                      下一页
                    </button>
                  )}
                </nav>
              )}
            </div>
            {/* 返回书页顶部(真站 #footer 上方 Home 图标链接等价) */}
            <p className="m-0 pb-1 text-center">
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="inline-flex items-center gap-1 text-[13px] hover:underline"
                style={{ color: C.link }}
                aria-label="返回顶部"
              >
                <HomeIcon className="h-3.5 w-3.5" aria-hidden />
                返回顶部
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
