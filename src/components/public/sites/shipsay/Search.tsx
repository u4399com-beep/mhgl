// ============================================================
// [R28-2e-8] shipsay(船说 CMS demo) 搜索结果页克隆 —— R28 扩展页型
// 素材等级: 家族标准(降级声明) —— 真站搜索表单由 /static/shipsay/common.js search()
// 脚本注入(首页快照 #searchbar 处仅 <script>search();</script> 占位, CSS/JS 均无存档,
// /search.html 本轮实测 404 页), 表单与结果页形态不可考 → 按船说家族标准补全:
// 白卡搜索框(input + 主红钮 #ed4259) + .store 封面卡结果列表(同分类页实测卡形态) +
// 相关词(契约 relatedTags)。真站头部搜索框由 SiteHeader Shipsay 分支承担(实测克隆)。
// ============================================================
'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import type { SiteSearchProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { BookCover } from '../../BookCover'
import { SsBookMain } from './_kit' // [R35-2d-2] 原 Search/Fulltext/Category 三处逐字节重复的书条右栏收敛

/** [R28-2e-8] 船说模板实测色值(同 Home) */
const C = {
  bg: '#f4f4f4',
  card: '#ffffff',
  text: '#666666',
  link: '#1a1a1a',
  hover: '#ed4259',
  title: '#555555',
  blue: '#4284ed',
  orange: '#f0643a',
  line: '#e3e3e3',
  maskOngoing: 'rgba(0,0,0,.4)',
  maskCompleted: 'rgba(191,44,36,.75)',
} as const

export function ShipsaySearch({ q, data, loading, error }: SiteSearchProps) {
  const { navigate } = usePublic()
  const [input, setInput] = useState(q)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const word = input.trim()
    if (word) navigate({ view: 'search', q: word })
  }

  const books = data?.books || []

  return (
    <div className="ss-home w-full pb-6" style={{ background: C.bg, color: C.text, fontSize: 14 }}>
      <div className="mx-auto w-full max-w-[960px] px-2 pt-3">
        {/* 搜索框(家族标准: 白卡内 input + 主红钮; 真站表单 JS 注入不可考, 声明) */}
        <form role="search" onSubmit={onSubmit} className="ss-searchbox ss-card flex items-center gap-2 p-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入书名 / 作者"
            className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[14px] outline-none"
            style={{ color: C.link, border: `1px solid ${C.line}`, borderRadius: 3 }}
            aria-label="搜索关键词"
          />
          <button
            type="submit"
            className="shrink-0 rounded-[3px] px-4 py-1.5 text-[14px] text-white transition-opacity hover:opacity-85"
            style={{ background: C.hover }}
            aria-label="搜索"
          >
            搜索
          </button>
        </form>

        {/* 结果区 */}
        <div className="ss-card ss-store mt-3 p-3">
          {error ? (
            <ErrorState message="搜索失败" detail={error} />
          ) : loading ? (
            <ul className="ss-flex m-0 grid list-none grid-cols-1 gap-3" role="status" aria-label="搜索结果加载中">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex">
                  <Sk className="mr-2.5 h-[106px] w-[80px] shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <Sk className="h-4 w-3/4" />
                    <Sk className="h-3 w-full" />
                    <Sk className="h-3 w-1/2" />
                  </div>
                </li>
              ))}
              <span className="sr-only">加载中…</span>
            </ul>
          ) : books.length ? (
            <>
              <p className="m-0 pb-2 text-[13px]">
                “{q}” 的搜索结果：共 {books.length} 本
              </p>
              <ul className="ss-flex m-0 grid list-none grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                {books.map((b) => (
                  <li key={b.id} className="ss-storeitem flex">
                    <div className="ss-img_span relative mr-2.5 shrink-0 overflow-hidden" style={{ width: 80, height: 106 }}>
                      <button type="button" onClick={() => navigate({ view: 'book', bookId: b.id })} className="block h-full w-full cursor-pointer" aria-label={`查看《${b.name}》详情`}>
                        <BookCover name={b.name} cover={b.cover} className="h-full w-full transition-transform duration-200 hover:scale-[1.08]" style={{ borderRadius: 0 }} />
                        <span
                          className="ss-mask absolute inset-x-0 bottom-0 flex items-center justify-between px-1 py-0.5 text-[11px] text-white"
                          style={{ background: b.status === 'completed' ? C.maskCompleted : C.maskOngoing }}
                        >
                          <span className="truncate">{b.category || '小说'} / {b.status === 'completed' ? '全本' : '连载'}</span>
                        </span>
                      </button>
                    </div>
                    <SsBookMain b={b} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="p-6 text-center text-sm">没有找到与“{q}”相关的书籍</p>
          )}

          {/* 相关搜索词(契约 relatedTags → 关键词落地页) */}
          {!loading && data && data.relatedTags.length > 0 && (
            <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-[13px]" style={{ borderColor: C.line }}>
              <span style={{ color: C.title }}>相关搜索：</span>
              {data.relatedTags.map((t) => (
                <button
                  key={`${t.tag}-${t.bookId}`}
                  type="button"
                  onClick={() => navigate({ view: 'keyword', tag: t.tag })}
                  className="hover:underline"
                  style={{ color: C.blue }}
                  aria-label={`查看关键词 ${t.tag}`}
                >
                  {t.tag}
                </button>
              ))}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
