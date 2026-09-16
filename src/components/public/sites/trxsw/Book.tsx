// ============================================================
// [R27-6b-15] trxsw(同人小说网) 书籍详情页克隆 —— 杰奇 CMS 默认模板家族标准还原(降级声明)
// 素材等级: 家族标准 —— 真站书页 /book/{id}/(2019 快照书页实链 94 条实证 URL 形态, 页本体
// 无存档) → 按杰奇家族书页结构补全: 面包屑 + #content(h1 书名 + 信息行 + 封面 + 简介) +
// 最新章节 + #list dd 目录(契约 100 章/页) + TXT 下载。色值家族标准(b.css 无存档, R25 实证);
// 杰奇书页「#list dd a」选择器实证见 R25-1 worklog。
// ============================================================
'use client'

import { FileDown, Play } from 'lucide-react'
import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate, formatWords } from '../../seo'

/** [R27-6b-15] 杰奇 CMS 家族标准色板(同 Home) */
const C = {
  navBlue: '#1C5087',
  logoRed: '#C00',
  text: '#333333',
  gray: '#666666',
  light: '#999999',
  border: '#dddddd',
  dotted: '#cccccc',
} as const

export function TrxswBook({ data, loading, error, tocPage, currentChapterId }: SiteBookProps) {
  const { navigate } = usePublic()

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
        <Sk className="mb-2 h-9 w-2/3" />
        <div className="tx-book flex flex-col gap-3 border p-2.5 sm:flex-row" style={{ borderColor: C.border, background: '#fff' }}>
          <Sk className="h-[120px] w-[90px] shrink-0" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <Sk className="h-6 w-1/2" />
            <Sk className="h-4 w-1/3" />
            <Sk className="h-14 w-full" />
          </div>
        </div>
        <span className="sr-only">加载中…</span>
      </div>
    )
  }

  const { book, chapters, tocTotal, tocTotalPages } = data
  const firstChapter = chapters[0]
  // 真站书页「最新章节」为站方倒序若干条; 模板取当前目录页尾部 12 条倒序(声明, 同 ggd66 先例)
  const latest12 = [...chapters].slice(-12).reverse()

  return (
    <div className="tx-home mx-auto w-full max-w-[960px] px-2 pb-6 pt-3" style={{ color: C.text, fontSize: 14 }}>
      {/* 面包屑(杰奇家族 .con: 首页 > 分类 > 书名) */}
      <p className="tx-crumb m-0 mb-2 text-[13px]" style={{ color: C.gray }}>
        <button type="button" onClick={() => navigate({ view: 'home' })} className="hover:underline" style={{ color: C.text }} aria-label="前往首页">
          首页
        </button>
        <span className="mx-1">&gt;</span>
        <button
          type="button"
          onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 })}
          className="hover:underline"
          style={{ color: C.text }}
          aria-label={`前往 ${book.category} 分类`}
        >
          {book.category || '小说'}
        </button>
        <span className="mx-1">&gt;</span>
        <span>{book.name}</span>
      </p>

      {/* ============ #content: 封面 + h1 + 信息 + 简介 ============ */}
      <div className="tx-book border bg-white p-2.5" style={{ borderColor: C.border }}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="shrink-0" style={{ width: 90, height: 120 }}>
            <BookCover name={book.name} cover={book.cover} className="h-full w-full" style={{ borderRadius: 0, border: `1px solid ${C.border}` }} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-[20px] font-bold leading-snug" style={{ color: C.logoRed }}>
              《{book.name}》
            </h1>
            <p className="my-1.5 text-[13px]" style={{ color: C.gray }}>
              作者：{book.author} | 分类：{book.category || '小说'} | 字数：{formatWords(book.wordCount)} | 状态：{book.status === 'completed' ? '完本' : '连载'}
            </p>
            <p className="m-0 min-h-[56px] whitespace-pre-wrap text-[13px] leading-[22px]" style={{ color: C.gray, textIndent: '2em' }}>
              {book.intro || '暂无简介'}
            </p>
            <p className="my-1.5 text-[13px]" style={{ color: C.gray }}>
              更新时间：{fmtDate(book.updatedAt) || '—'}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => firstChapter && navigate({ view: 'read', chapterId: firstChapter.id })}
                disabled={!firstChapter}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[14px] text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                style={{ background: C.navBlue }}
                aria-label="开始阅读"
              >
                <Play className="h-3.5 w-3.5" aria-hidden />
                开始阅读
              </button>
              {/* TXT 下载 = 本模板唯一 <a> */}
              <a
                href={`/api/public/download?book=${book.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[14px] text-white transition-opacity hover:opacity-85"
                style={{ background: C.navBlue }}
                aria-label={`下载《${book.name}》TXT`}
              >
                <FileDown className="h-3.5 w-3.5" aria-hidden />
                TXT下载
              </a>
              <button
                type="button"
                onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}
                className="inline-flex items-center px-3 py-1.5 text-[14px]"
                style={{ background: '#fff', color: C.text, border: `1px solid ${C.border}` }}
                aria-label="查看全部目录"
              >
                全部目录
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============ 最新章节(杰奇家族 h2 + dd 行) ============ */}
      <div className="tx-latest mt-3 border bg-white p-2.5" style={{ borderColor: C.border }}>
        <h2
          className="m-0 flex items-center overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #fafbfc 0%, #e9eef5 100%)',
            borderBottom: `1px solid ${C.border}`,
            borderLeft: `4px solid ${C.navBlue}`,
            fontSize: 14,
            fontWeight: 700,
            lineHeight: '32px',
            minHeight: 32,
            paddingLeft: 8,
          }}
        >
          《{book.name}》最新章节
        </h2>
        <dl className="m-0 mt-2 flex flex-wrap">
          {latest12.map((c) => (
            <dd key={c.id} className="w-full overflow-hidden whitespace-nowrap border-b border-dotted py-1.5 sm:w-1/2 lg:w-1/4" style={{ borderColor: C.dotted }}>
              <button
                type="button"
                onClick={() => navigate({ view: 'read', chapterId: c.id })}
                className="max-w-full truncate text-left hover:underline"
                style={{ color: currentChapterId === c.id ? C.logoRed : C.text }}
                aria-label={`阅读 ${c.title}`}
              >
                {c.title}
              </button>
            </dd>
          ))}
        </dl>
      </div>

      {/* ============ #list dd 全部目录(契约 100 章/页; 杰奇家族「#list dd a」实证选择器) ============ */}
      <div className="tx-toc mt-3 border bg-white p-2.5" style={{ borderColor: C.border }}>
        <h2
          className="m-0 flex items-center overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #fafbfc 0%, #e9eef5 100%)',
            borderBottom: `1px solid ${C.border}`,
            borderLeft: `4px solid ${C.navBlue}`,
            fontSize: 14,
            fontWeight: 700,
            lineHeight: '32px',
            minHeight: 32,
            paddingLeft: 8,
          }}
        >
          《{book.name}》全部章节目录
          <span className="ml-2 text-[12px] font-normal" style={{ color: C.gray }}>
            共 {tocTotal} 章
          </span>
        </h2>
        <dl className="tx-list m-0 mt-2 flex flex-wrap">
          {chapters.map((c) => (
            <dd key={c.id} className="w-full overflow-hidden whitespace-nowrap border-b border-dotted py-1.5 sm:w-1/2 lg:w-1/4" style={{ borderColor: C.dotted }}>
              <button
                type="button"
                onClick={() => navigate({ view: 'read', chapterId: c.id })}
                className="max-w-full truncate text-left hover:underline"
                style={{ color: currentChapterId === c.id ? C.logoRed : C.text }}
                aria-label={`阅读 ${c.title}`}
                aria-current={currentChapterId === c.id ? 'true' : undefined}
              >
                {c.title}
              </button>
            </dd>
          ))}
        </dl>
        {tocTotalPages > 1 && (
          <nav aria-label="目录分页" className="tx-pages flex flex-wrap items-center justify-center py-2.5">
            {tocPage > 1 && (
              <button
                type="button"
                onClick={() => navigate({ view: 'book', bookId: book.id, page: tocPage - 1 })}
                className="tx-pg m-[2px] inline-flex h-[30px] min-w-[30px] items-center justify-center border px-1 text-[13px]"
                aria-label="上一页"
              >
                上一页
              </button>
            )}
            {Array.from({ length: Math.min(10, tocTotalPages) }, (_, i) => Math.max(1, Math.min(tocPage - 4, tocTotalPages - 9)) + i).map((n) =>
              n === tocPage ? (
                <strong
                  key={n}
                  className="tx-pg m-[2px] inline-flex h-[30px] min-w-[30px] items-center justify-center border px-1 text-[13px]"
                  style={{ background: C.navBlue, borderColor: C.navBlue, color: '#fff' }}
                  aria-current="page"
                >
                  {n}
                </strong>
              ) : (
                <button
                  key={n}
                  type="button"
                  onClick={() => navigate({ view: 'book', bookId: book.id, page: n })}
                  className="tx-pg m-[2px] inline-flex h-[30px] min-w-[30px] items-center justify-center border px-1 text-[13px]"
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
                className="tx-pg m-[2px] inline-flex h-[30px] min-w-[30px] items-center justify-center border px-1 text-[13px]"
                aria-label="下一页"
              >
                下一页
              </button>
            )}
          </nav>
        )}
      </div>
    </div>
  )
}
