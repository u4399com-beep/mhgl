// ============================================================
// [R27-6-h3] huangjinwu(黄金屋) 书籍详情页克隆 —— 按 https://www.huangjinwu.org/novel/185 真站快照逐节还原
// (/tmp/r27-f/hjw-book.html + hjw-style.css 实测)
//
// 真站 DOM(.main-content > .container):
//   ├ nav.breadcrumb           黄金屋 / 分类 / 书名(active)
//   ├ .detail-header           白卡(10px 圆角/浅影/p 2.4rem; 桌面 flex, 移动纵向居中):
//   │   ├ .detail-cover        封面 180×250(边 #dbe4f0/10px 圆角/浅影; 移动 140×186.67 居中)
//   │   └ .detail-info         h1.detail-title(32px/600; 移动 24px 居中)
//   │   │                      .detail-meta 芯片条(bg 蓝 6% 混白/边 #dbe4f0/15px #64748b/gap 2rem;
//   │   │                      span 竖线分隔: 作者|分类|状态|字数|人气|推荐|更新时间)
//   │   │                      a.reading-progress「已读到 0/0」(登录态 → 不渲染, 声明)
//   │   │                      .detail-actions: btn btn-primary 开始阅读/继续阅读 + btn-secondary 收藏/推荐
//   │   │                      (btn: 10px 圆角/16px/500/min-width 12.8rem/p 1.2rem 2.4rem; primary 底 #2563eb 白字)
//   ├ .detail-section 作品简介 .detail-section-title(左 4px 蓝竖条/20px/600) +
//   │                          .detail-description(15px/1.8; max-height 7.2em 钳制+展开钮 → 本地态展开)
//   │                          + .book-badges「小说标签：」badge.category chips(book.tags→keywords 兜底)
//   └ .detail-section 最新章节 ul.chapter-list(auto-fill minmax 250px 网格) li.chapter-item
//                              (白 chip/边 #dbe4f0/10px 圆角/a 15px p 12px 16px; 真站 :visited 蓝)
// 契约映射: ①「收藏/推荐」登录态 → TXT 下載 btn-secondary 同形(唯一 <a>)+不渲染推荐 ②「人气/推荐」
// meta 项无数据契约 → 不渲染 ③「继续阅读」按 currentChapterId 条件渲染 ④真站完整目录为独立链
// 「完整目录」→ 模板内联「全部章节目录」section(契约 100 章/页分页, 差异声明)
// ============================================================
'use client'

import { useState } from 'react'
import { BookMarked, ChevronDown, ChevronUp, FileDown, Play } from 'lucide-react'
import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import { BookCover } from '../BookCover'
import { ErrorState, Sk } from '../bits'
import { fmtDate, formatWords } from '../../seo'

/** [R27-6-h3] 真站实测色值(hjw-style.css :root) */
const SECONDARY = '#2563eb'
const LOGO = '#1d4ed8'
const TEXT = '#1e293b'
const TEXT_LIGHT = '#64748b'
const BORDER = '#dbe4f0'
const CARD = '#ffffff'
const SHADOW = '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(37,99,235,0.06)'

export function HjwBook({ data, loading, error, tocPage, currentChapterId }: SiteBookProps) {
  const { navigate } = usePublic()
  // 作品简介 钳制/展开(真站 .detail-intro-content max-height 7.2em + introToggleBtn)
  const [expanded, setExpanded] = useState(false)

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
        <ErrorState message="书籍不存在或加载失败" detail={error} />
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-10 sm:px-6" aria-label="书籍详情加载中">
        <Sk className="mb-4 h-6 w-1/2" />
        <div className="flex flex-col items-center gap-6 rounded-[10px] bg-white p-6 sm:flex-row sm:items-start" style={{ boxShadow: SHADOW }}>
          <Sk className="h-[187px] w-[140px] shrink-0 sm:h-[250px] sm:w-[180px]" />
          <div className="min-w-0 flex-1 space-y-3 sm:pt-2">
            <Sk className="h-8 w-2/3" />
            <Sk className="h-12 w-full rounded-[10px]" />
            <Sk className="h-10 w-2/3" />
          </div>
        </div>
        <span className="sr-only">加载中…</span>
      </div>
    )
  }

  const { book, chapters, tocTotal, tocTotalPages } = data
  const firstChapter = chapters[0]
  // 真站最新章节=站方倒序 10 条; 模板取当前目录页尾部 10 条倒序(声明)
  const latest10 = [...chapters].slice(-10).reverse()
  // 标签(book.tags → keywords 兜底)
  const tagList: string[] = (data.tags && data.tags.length ? data.tags.map((t) => t.tag) : book.keywords.split(/[,，、\s]+/).filter(Boolean)).slice(0, 8)
  const continueChapter = currentChapterId ? chapters.find((c) => c.id === currentChapterId) : undefined

  const btn = 'inline-flex min-w-[128px] items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[16px] font-medium transition-all duration-300'

  return (
    <div className="w-full pb-10" style={{ color: TEXT }}>
      <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6">
        {/* ============ nav.breadcrumb ============ */}
        <nav aria-label="面包屑" className="mb-4 py-3 text-[15px]" style={{ color: TEXT_LIGHT }}>
          <ol className="flex items-center gap-2 overflow-hidden whitespace-nowrap">
            <li>
              <button type="button" onClick={() => navigate({ view: 'home' })} className="transition-colors hover:text-[#2563eb]" style={{ color: SECONDARY }} aria-label="返回黄金屋首页">
                黄金屋
              </button>
            </li>
            <li aria-hidden>/</li>
            <li>
              <button
                type="button"
                onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 })}
                className="max-w-[9em] truncate transition-colors hover:text-[#2563eb]"
                style={{ color: SECONDARY }}
                aria-label={`前往 ${book.category} 分类`}
              >
                {book.category}
              </button>
            </li>
            <li aria-hidden>/</li>
            <li className="truncate font-medium" style={{ color: TEXT }}>
              {book.name}
            </li>
          </ol>
        </nav>

        {/* ============ .detail-header 封面信息白卡 ============ */}
        <div className="mb-6 flex flex-col items-center gap-6 rounded-[10px] bg-white p-6 sm:flex-row sm:items-start" style={{ boxShadow: SHADOW }}>
          {/* .detail-cover 180×250(移动 140×187 居中) */}
          <div className="shrink-0">
            <span className="block overflow-hidden rounded-[10px] border bg-white sm:h-[250px] sm:w-[180px]" style={{ borderColor: BORDER, boxShadow: SHADOW }}>
              <span className="block h-[187px] w-[140px] sm:h-[250px] sm:w-[180px]">
                <BookCover name={book.name} cover={book.cover} className="h-full w-full" style={{ borderRadius: 0 }} />
              </span>
            </span>
          </div>
          <div className="min-w-0 flex-1 sm:pt-1">
            <h1 className="mb-5 text-left text-[24px] font-semibold leading-[1.3] sm:text-[32px]" style={{ color: TEXT }}>
              {book.name}
            </h1>
            {/* .detail-meta 芯片条(人气/推荐 无数据契约 → 不渲染, 声明) */}
            <div className="mb-5 flex flex-wrap gap-x-8 gap-y-2 rounded-[10px] border px-5 py-4 text-[15px]" style={{ borderColor: BORDER, background: 'rgba(37,99,235,0.06)', color: TEXT_LIGHT }}>
              <span className="flex items-center">
                作者：
                <button type="button" onClick={() => navigate({ view: 'search', q: book.author })} className="ml-1 transition-colors hover:text-[#2563eb]" style={{ color: SECONDARY }} aria-label={`搜索 ${book.author} 作品`}>
                  {book.author}
                </button>
              </span>
              <span className="flex items-center">
                分类：
                <button type="button" onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 })} className="ml-1 transition-colors hover:text-[#2563eb]" style={{ color: SECONDARY }} aria-label={`浏览 ${book.category}`}>
                  {book.category}
                </button>
              </span>
              <span>{book.status === 'completed' ? '状态：全本' : '状态：连载'}</span>
              <span>字数：{formatWords(book.wordCount)}</span>
              <span>更新时间：{fmtDate(book.updatedAt) || '—'}</span>
            </div>
            {/* .detail-actions 按钮组(收藏/推荐 → TXT 下載/不渲染; 继续阅读按 currentChapterId 条件渲染) */}
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => firstChapter && navigate({ view: 'read', chapterId: firstChapter.id })}
                disabled={!firstChapter}
                className={`${btn} text-white disabled:opacity-50`}
                style={{ background: SECONDARY, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                aria-label="开始阅读"
              >
                <Play className="h-4 w-4" aria-hidden />
                开始阅读
              </button>
              {continueChapter && (
                <button
                  type="button"
                  onClick={() => navigate({ view: 'read', chapterId: continueChapter.id })}
                  className={`${btn} text-white`}
                  style={{ background: SECONDARY, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                  aria-label="继续阅读"
                >
                  <BookMarked className="h-4 w-4" aria-hidden />
                  继续阅读
                </button>
              )}
              <a
                href={`/api/public/download?book=${book.id}`}
                className={`${btn} border bg-white`}
                style={{ borderColor: BORDER, color: TEXT }}
                aria-label={`下载《${book.name}》TXT`}
              >
                <FileDown className="h-4 w-4" aria-hidden />
                TXT下载
              </a>
            </div>
          </div>
        </div>

        {/* ============ .detail-section 作品简介 ============ */}
        <section className="mb-4 rounded-[10px] bg-white p-6" style={{ boxShadow: SHADOW }}>
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className="border-l-4 pl-4 text-[20px] font-semibold" style={{ borderLeftColor: SECONDARY, color: '#0f172a' }}>
              作品简介
            </h2>
            <button
              type="button"
              onClick={() => setExpanded((s) => !s)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[14px] font-medium transition-all"
              style={{ color: SECONDARY }}
              aria-expanded={expanded}
              aria-label={expanded ? '收起简介' : '展开简介'}
            >
              {expanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
              {expanded ? '收起' : '展开'}
            </button>
          </div>
          <div
            className="text-[15px] leading-[1.8] transition-all"
            style={{ color: TEXT, maxHeight: expanded ? 2000 : '7.2em', overflow: 'hidden' }}
          >
            {book.intro || '暂无简介'}
          </div>
          {/* 小说标签 chips(book.tags→keywords 兜底) */}
          {tagList.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[15px]" style={{ color: TEXT_LIGHT }}>
              <b className="font-semibold">小说标签：</b>
              {tagList.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => navigate({ view: 'keyword', tag: t })}
                  className="hjw-card-title rounded-[10px] px-3 py-1 text-[12px] font-medium text-white transition-all"
                  style={{ background: SECONDARY }}
                  aria-label={`浏览 ${t} 标签`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ============ .detail-section 最新章节 ============ */}
        <section className="mb-4 rounded-[10px] bg-white p-6" style={{ boxShadow: SHADOW }}>
          <h2 className="mb-5 border-l-4 pl-4 text-[20px] font-semibold" style={{ borderLeftColor: SECONDARY, color: '#0f172a' }}>
            最新章节
          </h2>
          <ul className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {latest10.map((c) => (
              <li key={c.id} className="overflow-hidden rounded-[10px] border bg-white whitespace-nowrap transition-all duration-300" style={{ borderColor: BORDER }}>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'read', chapterId: c.id })}
                  className="block max-w-full truncate px-4 py-3 text-left text-[15px] transition-colors hover:text-[#2563eb]"
                  style={{ color: TEXT }}
                  aria-label={`阅读 ${c.title}`}
                >
                  {c.title}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* ============ 全部章节目录(真站「完整目录」独立链 → 内联 section+契约分页, 声明) ============ */}
        <section className="mb-4 rounded-[10px] bg-white p-6" style={{ boxShadow: SHADOW }}>
          <h2 className="mb-5 border-l-4 pl-4 text-[20px] font-semibold" style={{ borderLeftColor: SECONDARY, color: '#0f172a' }}>
            全部章节目录
            <span className="ml-3 text-[13px] font-normal" style={{ color: TEXT_LIGHT }}>
              共 {tocTotal} 章
            </span>
          </h2>
          <ul className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {chapters.map((c) => (
              <li key={c.id} className="overflow-hidden rounded-[10px] border bg-white whitespace-nowrap transition-all duration-300" style={{ borderColor: currentChapterId === c.id ? SECONDARY : BORDER }}>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'read', chapterId: c.id })}
                  className="block max-w-full truncate px-4 py-3 text-left text-[15px] transition-colors hover:text-[#2563eb]"
                  style={{ color: currentChapterId === c.id ? SECONDARY : TEXT, fontWeight: currentChapterId === c.id ? 600 : 400 }}
                  aria-label={`阅读 ${c.title}`}
                  aria-current={currentChapterId === c.id ? 'true' : undefined}
                >
                  {c.title}
                </button>
              </li>
            ))}
          </ul>
          {tocTotalPages > 1 && (
            <nav aria-label="目录分页" className="flex flex-wrap items-center justify-center gap-3 py-2">
              <span className="min-w-[80px] text-center text-[14px]" style={{ color: TEXT }}>
                {tocPage} / {tocTotalPages}
              </span>
              {tocPage > 1 && (
                <button
                  type="button"
                  onClick={() => navigate({ view: 'book', bookId: book.id, page: tocPage - 1 })}
                  className="hjw-pagelink inline-flex h-[38px] cursor-pointer items-center justify-center rounded-[15px] border-[1.5px] bg-white px-5 text-[14px] font-medium"
                  style={{ borderColor: BORDER, color: TEXT }}
                  aria-label="上一页"
                >
                  上一页
                </button>
              )}
              {tocPage < tocTotalPages && (
                <>
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'book', bookId: book.id, page: tocPage + 1 })}
                    className="hjw-pagelink inline-flex h-[38px] cursor-pointer items-center justify-center rounded-[15px] border-[1.5px] bg-white px-5 text-[14px] font-medium"
                    style={{ borderColor: BORDER, color: TEXT }}
                    aria-label="下一页"
                  >
                    下一页
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'book', bookId: book.id, page: tocTotalPages })}
                    className="hjw-pagelink inline-flex h-[38px] cursor-pointer items-center justify-center rounded-[15px] border-[1.5px] bg-white px-5 text-[14px] font-medium"
                    style={{ borderColor: BORDER, color: TEXT }}
                    aria-label="末页"
                  >
                    末页
                  </button>
                </>
              )}
            </nav>
          )}
        </section>
      </div>
    </div>
  )
}
