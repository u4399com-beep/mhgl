// ============================================================
// [R27-6b-3] x2552(吾爱文学网) 书籍详情页克隆 —— 黑冰模板家族标准还原(降级声明)
// 素材等级: 家族标准 —— 真站书页 /book/{id}.html 无独立 Wayback 存档 → 按黑冰家族结构补全:
// 面包屑(吾爱文学网->分类->书名) + 信息块(h1 书名/作者/分类/字数/简介) + 「最新章节」列表 +
// 「全部目录」入口(Toc 页) + TXT 下载。色值沿用 R24 实测 style.css; 交互口径同 ggd66 先例
// (导航全 button, TXT 为唯一 <a>)。
// ============================================================
'use client'

import { FileDown, Play } from 'lucide-react'
import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate, formatWords } from '../../seo'

/** [R27-6b-3] 黑冰模板实测色值(同 Home) */
const C = {
  text: '#666666',
  link: '#2f468f',
  hover: '#FF6600',
  border: '#E4E4E4',
  face: '#F2F2F2',
} as const
const TITLE_BAR = 'linear-gradient(180deg, #fbfcfe 0%, #e9eef5 100%)'

export function X2552Book({ data, loading, error, tocPage, currentChapterId }: SiteBookProps) {
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
      <div className="mx-auto w-full max-w-[960px] px-2 pb-4" aria-label="书籍详情加载中">
        <Sk className="mb-2 h-9 w-2/3" />
        <div className="x2-book flex flex-col gap-3 border p-2.5 sm:flex-row" style={{ borderColor: C.border, background: '#fff' }}>
          <Sk className="h-[150px] w-[120px] shrink-0" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <Sk className="h-5 w-1/2" />
            <Sk className="h-3 w-1/3" />
            <Sk className="h-3 w-full" />
            <Sk className="h-3 w-5/6" />
          </div>
        </div>
        <span className="sr-only">加载中…</span>
      </div>
    )
  }

  const { book, chapters, tocTotal, tocTotalPages } = data
  const firstChapter = chapters[0]
  // 真站书页「最新章节」为站方倒序若干条; 模板取当前目录页尾部 12 条倒序(口径声明, 同 ggd66 先例)
  const latest12 = [...chapters].slice(-12).reverse()

  return (
    <div className="x2-home w-full px-2 pb-4" style={{ color: C.text, fontSize: 12, lineHeight: 1.2 }}>
      <div className="mx-auto w-full max-w-[960px]">
        {/* 面包屑(黑冰 dt 形态: 首页->分类->书名) */}
        <div style={{ border: `1px solid ${C.border}`, background: TITLE_BAR, lineHeight: '30px', padding: '0 10px', marginTop: 8 }}>
          <button type="button" className="x2-a" style={{ cursor: 'pointer' }} onClick={() => navigate({ view: 'home' })} onKeyDown={(e) => e.key === 'Enter' && navigate({ view: 'home' })}>
            吾爱文学网
          </button>
          {' -> '}
          <button type="button"
            className="x2-a"
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer' }}
            onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 })}
            onKeyDown={(e) => e.key === 'Enter' && navigate({ view: 'category', cat: book.categoryId || undefined, page: 1 })}
          >
            {book.category || '小说'}
          </button>
          {' -> '}
          <span>{book.name}</span>
        </div>

        {/* 信息块(h1 书名 + 信息行 + 简介) */}
        <div style={{ ...{ border: `1px solid ${C.border}`, marginTop: 8 } }}>
          <div style={{ height: 40, lineHeight: '40px', fontSize: 14, background: TITLE_BAR, padding: '0 15px', overflow: 'hidden' }}>
            <i aria-hidden style={{ display: 'inline-block', width: 12, height: 16, background: C.hover, borderRadius: 2, margin: '12px 10px 0 0', verticalAlign: 'top' }} />
            书籍信息
          </div>
          <div className="flex flex-col gap-3 p-2.5 sm:flex-row" style={{ background: '#fff' }}>
            <div className="shrink-0">
              <BookCover name={book.name} cover={book.cover} style={{ width: 120, height: 150, borderRadius: 0, border: `1px solid ${C.border}`, padding: 5, background: '#fff' }} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="m-0 text-[18px] font-bold" style={{ color: C.link }}>
                《{book.name}》
              </h1>
              <p className="my-1.5">
                作者：{book.author} | 分类：{book.category || '小说'} | 字数：{formatWords(book.wordCount)} | 状态：{book.status === 'completed' ? '完本' : '连载'}
              </p>
              <p className="m-0 min-h-[60px] whitespace-pre-wrap leading-[22px]" style={{ textIndent: '2em' }}>
                {book.intro || '暂无简介'}
              </p>
              <p className="my-1.5">更新时间：{fmtDate(book.updatedAt) || '—'}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => firstChapter && navigate({ view: 'read', chapterId: firstChapter.id })}
                  disabled={!firstChapter}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                  style={{ background: C.link, border: `1px solid ${C.link}` }}
                  aria-label="开始阅读"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden />
                  开始阅读
                </button>
                {/* TXT 下载 = 本模板唯一 <a> */}
                <a
                  href={`/api/public/download?book=${book.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-white transition-opacity hover:opacity-85"
                  style={{ background: C.link, border: `1px solid ${C.link}` }}
                  aria-label={`下载《${book.name}》TXT`}
                >
                  <FileDown className="h-3.5 w-3.5" aria-hidden />
                  TXT下载
                </a>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}
                  className="inline-flex items-center px-3 py-1.5 text-[13px]"
                  style={{ background: '#fff', color: C.link, border: `1px solid ${C.border}` }}
                  aria-label="查看全部目录"
                >
                  全部目录
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 最新章节(黑冰家族: blocktitle + 行式列表) */}
        <div style={{ border: `1px solid ${C.border}`, marginTop: 8 }}>
          <div style={{ height: 40, lineHeight: '40px', fontSize: 14, background: TITLE_BAR, padding: '0 15px' }}>
            <i aria-hidden style={{ display: 'inline-block', width: 12, height: 16, background: C.hover, borderRadius: 2, margin: '12px 10px 0 0', verticalAlign: 'top' }} />
            《{book.name}》最新章节
          </div>
          <div className="p-2.5" style={{ background: '#fff' }}>
            <ul className="m-0 grid list-none grid-cols-1 gap-x-4 p-0 sm:grid-cols-2 lg:grid-cols-4" style={{ lineHeight: '30px' }}>
              {latest12.map((c) => (
                <li key={c.id} className="overflow-hidden whitespace-nowrap border-b border-dotted" style={{ borderColor: C.border }}>
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'read', chapterId: c.id })}
                    className="x2-a max-w-full truncate text-left"
                    style={{ color: currentChapterId === c.id ? C.hover : C.link, fontWeight: currentChapterId === c.id ? 700 : 400 }}
                    aria-label={`阅读 ${c.title}`}
                  >
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
            {tocTotalPages > 1 && (
              <p className="mb-0 mt-2 text-right">
                共 {tocTotal} 章 · 当前第 {tocPage}/{tocTotalPages} 页
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
