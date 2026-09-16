// ============================================================
// [R28-2c] ggd66(格格党) 书籍详情页克隆 —— 基础五视图之 Book
// 真站快照(R28 实测): /tmp/r28-2c/ggd66/ggd66-book.html(https://www.ggd66.com/qu/33779/ 直抓, 17.9KB)
//
// 真站 DOM(.container > ol.breadcrumb + .book.pt10 + dl.book.chapterlist):
//   ├ ol.breadcrumb             面包屑(底 #cdf3eb/边 1px #ccc/圆角 4px/padding 8px 15px/14px;
//   │                           li+li:before 「»」#666; active #666)
//   ├ .book.pt10                白卡(边 #ccc/圆角 4px/阴影 0 1px 1px rgba(0,0,0,.05)/padding 0 10px 10px):
//   │   ├ .bookcover(hidden-xs) .thumbnail 封面 140×190(padding 4px/边 #ddd/圆角 4px/白底)
//   │   └ .bookinfo             h1.booktitle(#56ccb5 22px/mb 5px); p.booktag chips(高 24px/padding 0 10px/
//   │   │                       圆角 3px/边 1px; red: 边 #ffb0b4 字 #bf2c24, blue: 边 #89d4ff 字 #3f5a93)
//   │   │                       p.bookintro(高 63px 钳 3 行/14px/20px); p 最新章节：a.bookchapter;
//   │   │                       p.booktime 更新时间; .bookmore a.btn.btn-info(底 #56ccb5 白字/圆角 4px/padding 6px 12px)
//   ├ dl.book.chapterlist       h2 《书名》最新章节 + dd(25% 一行/底边 1px dashed #ccc/py 8px/nowrap)
//   └ #list-chapterAll          h2 《书名》全部章节目录 + dd 全章节(真站 JS「查看全部章节↓」整页展开)
// 契约映射: ①真站「加入书架」按钮 → TXT 下载(任务书唯一 <a href="/api/public/download?book=">, .btn-info 同形)
//           ②真站 chips「N人读过」无数据契约 → 阅读数 chip 以分类名替代(声明)
//           ③真站最新章节为站方倒序 12 条; 模板取当前目录页尾部 12 条倒序(多页书第 1 页≈最早, 声明)
//           ④全部章节目录按契约 100 章/页分页(真站单页全量 JS 展开, 差异声明)
// ============================================================
'use client'

import { FileDown, Play } from 'lucide-react'
import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate, formatWords } from '../../seo'

/** [R28-2c-12] 真站实测色值(ggd66-style.css) */
const TEAL = '#56ccb5'
const GREEN_LINK = '#00886d'
const TEXT_BODY = '#888'
const LINE = '#ccc'
const CRUMB_BG = '#cdf3eb' // ol.breadcrumb 底色
const TAG_RED = '#bf2c24' // .booktag .red 字
const TAG_RED_BORDER = '#ffb0b4' // .booktag .red 边
const TAG_BLUE = '#3f5a93' // .booktag .blue 字
const TAG_BLUE_BORDER = '#89d4ff' // .booktag .blue 边

/** [R28-2c-13] 状态文案(真站 span.red「连载」) */
function statusText(s?: string | null): string {
  if (s === 'completed') return '完本'
  if (s === 'ongoing') return '连载'
  return '连载'
}

/** [R28-2c-14] 面包屑(ol.breadcrumb: #cdf3eb 底/» 分隔, 导航禁 <a> 用 button) */
function Crumb({ items }: { items: { label: string; go?: () => void }[] }) {
  return (
    <nav aria-label="面包屑" className="ggd-crumb mb-2.5 rounded-[4px] border px-[15px] py-2 text-[14px]" style={{ borderColor: LINE, background: CRUMB_BG }}>
      <ol className="flex flex-wrap items-center">
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="flex items-center">
            {i > 0 && (
              <span className="ggd-crumb-sep px-[5px]" style={{ color: '#666' }} aria-hidden>
                »
              </span>
            )}
            {it.go ? (
              <button type="button" onClick={it.go} className="transition-colors hover:text-[#f50]" style={{ color: GREEN_LINK }} aria-label={`前往 ${it.label}`}>
                {it.label}
              </button>
            ) : (
              <span style={{ color: '#666' }}>{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** [R28-2c-15] .booktag chips(red: 作者/状态 · blue: 字数/分类) */
function Chip({ tone, children }: { tone: 'red' | 'blue'; children: React.ReactNode }) {
  const red = tone === 'red'
  return (
    <span
      className="ggd-chip mr-[5px] inline-block h-6 overflow-hidden whitespace-nowrap rounded-[3px] border px-2.5 text-[14px] leading-[22px]"
      style={{ borderColor: red ? TAG_RED_BORDER : TAG_BLUE_BORDER, color: red ? TAG_RED : TAG_BLUE }}
    >
      {children}
    </span>
  )
}

export function Ggd66Book({ data, loading, error, tocPage, currentChapterId }: SiteBookProps) {
  const { navigate } = usePublic()

  if (error) {
    return (
      <div className="mx-auto w-[90%] max-w-[1200px] py-10">
        <ErrorState message="书籍不存在或加载失败" detail={error} />
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="mx-auto w-[90%] max-w-[1200px] pb-10" aria-label="书籍详情加载中">
        <Sk className="mb-2.5 h-9 w-2/3 rounded-[4px]" />
        <div className="ggd-book flex flex-col gap-4 rounded-[4px] border bg-white p-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.05)] sm:flex-row" style={{ borderColor: LINE }}>
          <Sk className="h-[190px] w-[140px] shrink-0" />
          <div className="min-w-0 flex-1 space-y-2.5 pt-1">
            <Sk className="h-6 w-2/3" />
            <Sk className="h-6 w-1/2" />
            <Sk className="h-12 w-full" />
            <Sk className="h-8 w-1/3" />
          </div>
        </div>
        <span className="sr-only">加载中…</span>
      </div>
    )
  }

  const { book, chapters, tocTotal, tocTotalPages } = data
  const firstChapter = chapters[0]
  // 真站「最新章节」= 站方倒序 12 条; 模板取当前页尾部 12 条倒序(声明)
  const latest12 = [...chapters].slice(-12).reverse()
  const pg = 'ggd-pg m-[2px] inline-flex h-[35px] min-w-[35px] items-center justify-center rounded-[3px] border px-1 text-[14px]'

  return (
    <div className="mx-auto w-[90%] max-w-[1200px] pb-10" style={{ color: TEXT_BODY }}>
      {/* ============ ol.breadcrumb 面包屑 ============ */}
      <Crumb
        items={[
          { label: '首页', go: () => navigate({ view: 'home' }) },
          { label: book.category || '小说', go: () => navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 }) },
          { label: book.name },
        ]}
      />

      {/* ============ .book.pt10 白卡(封面 + 信息) ============ */}
      <div className="ggd-book flex flex-col gap-4 rounded-[4px] border bg-white p-2.5 pt-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.05)] sm:flex-row" style={{ borderColor: LINE }}>
        {/* .bookcover .thumbnail(140×190, 移动端隐藏) */}
        <div className="hidden shrink-0 sm:block">
          <span className="ggd-thumbnail block border bg-white p-1" style={{ borderColor: '#ddd' }}>
            <span className="block h-[190px] w-[140px] overflow-hidden">
              <BookCover name={book.name} cover={book.cover} className="h-full w-full" style={{ borderRadius: 0 }} />
            </span>
          </span>
        </div>
        <div className="ggd-bookinfo min-w-0 flex-1">
          <h1 className="ggd-booktitle mb-[5px] text-[22px] leading-snug" style={{ color: TEAL }}>
            {book.name}
          </h1>
          {/* p.booktag chips(真站: 作者 red a / 18万字 blue / 4828人读过 blue / 连载 red) */}
          <p className="ggd-booktag mb-[5px] flex flex-wrap items-center">
            <Chip tone="red">{book.author}</Chip>
            <Chip tone="blue">{formatWords(book.wordCount)}</Chip>
            {/* 「N人读过」无数据契约 → 分类名替代(声明) */}
            <Chip tone="blue">{book.category || '小说'}</Chip>
            <Chip tone="red">{statusText(book.status)}</Chip>
          </p>
          {/* p.bookintro(真站高 63px 钳 3 行) */}
          <p className="ggd-bookintro mb-1.5 line-clamp-3 h-[60px] overflow-hidden text-[14px] leading-5">
            {book.intro || '暂无简介'}
          </p>
          <p className="truncate text-[14px]">
            最新章节：
            <button
              type="button"
              onClick={() => navigate({ view: 'book', bookId: book.id })}
              className="ggd-bookchapter truncate hover:underline"
              style={{ color: GREEN_LINK }}
              aria-label="查看最新章节"
            >
              {book.latestChapter || '—'}
            </button>
          </p>
          <p className="mb-1.5 text-[14px]">更新时间：{fmtDate(book.updatedAt) || '—'}</p>
          {/* .bookmore 按钮组(真站 开始阅读/加入书架 → 开始阅读/TXT下载; TXT 为唯一 <a>) */}
          <div className="ggd-bookmore flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => firstChapter && navigate({ view: 'read', chapterId: firstChapter.id })}
              disabled={!firstChapter}
              className="ggd-btn-info inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-[14px] text-white transition-opacity hover:opacity-85 disabled:opacity-50"
              style={{ background: TEAL }}
              aria-label="开始阅读"
            >
              <Play className="h-3.5 w-3.5" aria-hidden />
              开始阅读
            </button>
            <a
              href={`/api/public/download?book=${book.id}`}
              className="ggd-btn-info inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-[14px] text-white transition-opacity hover:opacity-85"
              style={{ background: TEAL }}
              aria-label={`下载《${book.name}》TXT`}
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden />
              TXT下载
            </a>
          </div>
        </div>
      </div>

      {/* ============ dl.book.chapterlist 最新章节 ============ */}
      <div className="ggd-book mt-2.5 rounded-[4px] border bg-white px-2.5 pb-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.05)]" style={{ borderColor: LINE }}>
        <h2 className="ggd-h2">《{book.name}》最新章节</h2>
        <dl className="ggd-chapterlist mt-2.5 flex flex-wrap">
          {latest12.map((c) => (
            <dd key={c.id} className="w-full overflow-hidden whitespace-nowrap border-b border-dashed py-2 sm:w-1/2 lg:w-1/4">
              <button
                type="button"
                onClick={() => navigate({ view: 'read', chapterId: c.id })}
                className="max-w-full truncate text-left transition-colors hover:text-[#f50]"
                style={{ color: GREEN_LINK }}
                aria-label={`阅读 ${c.title}`}
              >
                {c.title}
              </button>
            </dd>
          ))}
        </dl>
        <div className="clear-both" />
      </div>

      {/* ============ #list-chapterAll 全部章节目录(契约 100 章/页, 真站 JS 整页展开) ============ */}
      <div className="ggd-book mt-2.5 rounded-[4px] border bg-white px-2.5 pb-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.05)]" style={{ borderColor: LINE }}>
        <h2 className="ggd-h2" id="list-chapterAll">
          《{book.name}》全部章节目录
          <span className="ml-2 text-[13px] font-normal" style={{ color: TEXT_BODY }}>
            共 {tocTotal} 章
          </span>
        </h2>
        <dl className="ggd-chapterlist mt-2.5 flex flex-wrap">
          {chapters.map((c) => (
            <dd key={c.id} className="w-full overflow-hidden whitespace-nowrap border-b border-dashed py-2 sm:w-1/2 lg:w-1/4">
              <button
                type="button"
                onClick={() => navigate({ view: 'read', chapterId: c.id })}
                className="max-w-full truncate text-left transition-colors hover:text-[#f50]"
                style={{ color: currentChapterId === c.id ? '#f50' : GREEN_LINK, fontWeight: currentChapterId === c.id ? 700 : 400 }}
                aria-label={`阅读 ${c.title}`}
                aria-current={currentChapterId === c.id ? 'true' : undefined}
              >
                {c.title}
              </button>
            </dd>
          ))}
        </dl>
        {/* .pages 分页(真站单页全量展开 → 契约分页, 差异声明) */}
        {tocTotalPages > 1 && (
          <nav aria-label="目录分页" className="ggd-pages flex flex-wrap items-center justify-center gap-y-1 py-2.5 text-center">
            {tocPage > 1 && (
              <button
                type="button"
                onClick={() => navigate({ view: 'book', bookId: book.id, page: tocPage - 1 })}
                className={pg}
                style={{ borderColor: LINE }}
                aria-label="上一页"
              >
                &lt;
              </button>
            )}
            {Array.from({ length: Math.min(10, tocTotalPages) }, (_, i) => Math.max(1, Math.min(tocPage - 4, tocTotalPages - 9)) + i).map((n) =>
              n === tocPage ? (
                <strong key={n} className={pg} aria-current="page">
                  {n}
                </strong>
              ) : (
                <button
                  key={n}
                  type="button"
                  onClick={() => navigate({ view: 'book', bookId: book.id, page: n })}
                  className={pg}
                  style={{ borderColor: LINE }}
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
                className={pg}
                style={{ borderColor: LINE }}
                aria-label="下一页"
              >
                &gt;
              </button>
            )}
          </nav>
        )}
        <div className="clear-both" />
      </div>
    </div>
  )
}
