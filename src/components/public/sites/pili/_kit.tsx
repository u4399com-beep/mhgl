// ============================================================
// [R35-2d-3] 霹雳书屋(pili) 共享小件 —— 原 PiliSearchCard(Search.tsx)/
// PiliCatCard(Category.tsx)为逐字节重复(仅函数名与缩进差异, 同源 wmcms
// .ret-search-item 结果卡: 封面黑条 + 标题/作者/分类字数/简介/开始阅读),
// 收敛为单处定义, 消费方各自以原 JSX 调用点形态引用。
// ============================================================
'use client'

import type { BookItem } from '../../types'
import { usePublic } from '../../ctx'
import { bookNavProps } from '../../bits'
import { BookCover } from '../../BookCover'
import { formatWords } from '../../seo'

/** [R28-2b-2] 色值(与两页文件同名常量同值; 卡内书名/作者为字面色) */
const MUTED = '#999999' // ret-works-decs/author 次级灰
const GRID_LINE = '#e8e7e6' // ret-search-item 格线(comicall.css)

/** [R28-2b2-7] 结果卡(ret-search-item: 封面黑条 + 标题/作者/分类字数/简介/开始阅读) */
export function PiliResultCard({ book }: { book: BookItem }) {
  const { navigate } = usePublic()
  return (
    <li className="flex gap-4 p-4" style={{ borderRight: `1px solid ${GRID_LINE}`, borderBottom: `1px solid ${GRID_LINE}` }}>
      <div
        {...bookNavProps(navigate, book.id)}
        className="relative h-[133px] w-[100px] shrink-0 cursor-pointer overflow-hidden rounded-[2px]"
        aria-label={`查看《${book.name}》详情`}
      >
        <BookCover name={book.name} cover={book.cover} showAuthor={book.author} style={{ borderRadius: 0 }} className="absolute inset-0" />
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-1 text-center text-[10px] text-white">
          {book.latestChapter || book.name}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => navigate({ view: 'book', bookId: book.id })}
          className="block max-w-full truncate text-left text-lg leading-5 text-[#333333] transition-colors hover:text-[#fa8729]"
          aria-label={`查看《${book.name}》详情`}
        >
          {book.name}
        </button>
        <p className="mt-1.5 truncate text-xs" style={{ color: '#666666' }}>作者：{book.author}</p>
        <p className="mt-1 truncate text-xs" style={{ color: MUTED }}>
          <span>分类：{book.category}</span>
          <span className="ml-2">字数：{formatWords(book.wordCount)}</span>
        </p>
        <p className="mt-1 line-clamp-3 text-xs leading-[18px]" style={{ color: MUTED }}>{book.intro || '暂无简介'}</p>
        <button
          type="button"
          onClick={() => navigate({ view: 'book', bookId: book.id })}
          className="mt-2 h-9 rounded-[3px] px-4 text-sm text-[#5a4b32] transition-colors hover:bg-[#faead0]"
          style={{ background: 'linear-gradient(180deg, #fffdf9, #fef8f0)', border: '1px solid #e0cfb1' }}
          aria-label={`开始阅读《${book.name}》`}
        >
          开始阅读
        </button>
      </div>
    </li>
  )
}
