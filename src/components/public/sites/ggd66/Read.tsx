// ============================================================
// [R27-6-5] ggd66(格格党) 章节阅读页克隆 —— 按 https://www.ggd66.com/qu/33779/3476058.html 真站快照逐节还原
// (/tmp/r27-f/ggd66-read.html + ggd66-style.css 实测)
//
// 真站 DOM(.container > ol.breadcrumb + .book.read#acontent + p.text-center + .book.tuijian):
//   ├ ol.breadcrumb        首页 » 分类 » 书名 » 章节名(ChapterData 无分类字段 → 首页 » 书名 » 章节名, 声明)
//   ├ .book.read#acontent  米黄纸面(bg #FBF4EC/字 #333/pt 10px):
//   │   ├ h1.pt10          章节名(26px #00886d 居中/mb 10px; ≤467px 20px)
//   │   ├ p.booktag        加入书签(登录态 addbookcase → 不渲染, 声明; .read .booktag 居中 #00886d)
//   │   ├ .readcontent     正文(24px/行高 180%/letter-spacing .1em/padding 10px 15px/顶边 1px #ccc;
//   │   │                  ≤767px 左右 padding 0; ≤467px 18px) + 尾部 ↑返回顶部↑(回顶锚)
//   │   └ (真站含 .fullbar/章内分页「第 1 章（1 / 2）」→ 契约为整章粒度, 分页语义并入上一章/下一章, 声明)
//   ├ p.text-center        #linkPrev 書首頁(真站首页态 void(0)) / #linkIndex 書頁,目录 / #linkNext 下一页
//   │                      btn.btn-default(白底/边 #ccc/字 #333; 桌面各 30%; ≤767px 前二 46%+下一页 94%)
//   │                      模板映射: 書首頁→首页 · 書頁,目录→书页 · 下一页→下一章(补上一章至首钮位, 声明)
//   ├ p 温馨提示           真站提示键盘键(Enter 回书目/← 上一页/→ 下一页) → 模板等价实现 keydown(声明)
//   └ .book.tuijian        相关阅读: 同类书链 10 枚(真站为同分类; ChapterData 无分类 → 字数热榜替代, 声明)
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../data'
import type { BookItem } from '../../types'
import { ChapterContent, useRecordReading } from '../template-kit'
import { ErrorState, Sk, bookNavProps } from '../bits'

/** [R27-6-5] 真站实测色值(ggd66-style.css) */
const GREEN_LINK = '#00886d'
const TEXT_BODY = '#888'
const LINE = '#ccc'
const READ_BG = '#FBF4EC' // .read 米黄纸面
const CRUMB_BG = '#cdf3eb'

export function Ggd66Read({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  // [R27-6-5] 相关阅读(真站同分类书链; 无分类字段 → 字数热榜 10 本替代)
  const [rel, setRel] = useState<BookItem[] | null>(null)

  // [R27-6-5] 阅读位置/时长记忆(hooks 顺序: 挂载即调, data 未就绪时内部自守)
  useRecordReading(data?.book?.id, data?.chapter?.id, data?.chapter?.title)

  const bookId = data?.book?.id
  useEffect(() => {
    if (!bookId) return
    let alive = true
    fetchBooks({ sort: 'words', page: 1, size: 10 })
      .then((d) => {
        if (alive) setRel((d.books || []).filter((b) => b.id !== bookId).slice(0, 10))
      })
      .catch(() => {
        if (alive) setRel([])
      })
    return () => {
      alive = false
    }
  }, [bookId])

  // [R27-6-5] 键盘导航(真站温馨提示: Enter 回书目/← 上一页/→ 下一页 → 章粒度映射)
  useEffect(() => {
    if (!data) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft' && data.prev) navigate({ view: 'read', chapterId: data.prev.id })
      else if (e.key === 'ArrowRight' && data.next) navigate({ view: 'read', chapterId: data.next.id })
      else if (e.key === 'Enter') navigate({ view: 'book', bookId: data.book.id })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data, navigate])

  if (error) {
    return (
      <div className="mx-auto w-[90%] max-w-[1200px] py-10">
        <ErrorState message="章节加载失败" detail={error} />
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="mx-auto w-[90%] max-w-[1200px] pb-10" aria-label="章节加载中">
        <Sk className="mb-2.5 h-9 w-2/3 rounded-[4px]" />
        <div className="rounded-[4px] border p-2.5" style={{ borderColor: LINE, background: READ_BG }}>
          <Sk className="mx-auto mb-4 h-6 w-1/2" />
          <div className="space-y-3 px-1 sm:px-[15px]">
            {Array.from({ length: 10 }).map((_, i) => (
              <Sk key={i} className="h-4 w-full" style={{ opacity: 1 - i * 0.06 }} />
            ))}
          </div>
        </div>
        <span className="sr-only">加载中…</span>
      </div>
    )
  }

  const { chapter, book, prev, next } = data
  // btn.btn-default(白底/边 #ccc/字 #333; 桌面 30%, 移动前二 46%/下一页全宽)
  const navBtn = 'ggd-navbtn m-[2px] inline-flex h-[38px] items-center justify-center rounded-[4px] border bg-white px-2 text-[14px] transition-colors hover:bg-[#eee] disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="mx-auto w-[90%] max-w-[1200px] pb-10" style={{ color: TEXT_BODY }}>
      {/* ============ ol.breadcrumb 面包屑(ChapterData 无分类 → 首页 » 书名 » 章节名, 声明) ============ */}
      <nav aria-label="面包屑" className="ggd-crumb mb-2.5 rounded-[4px] border px-[15px] py-2 text-[14px]" style={{ borderColor: LINE, background: CRUMB_BG }}>
        <ol className="flex flex-wrap items-center">
          <li className="flex items-center">
            <button type="button" onClick={() => navigate({ view: 'home' })} className="transition-colors hover:text-[#f50]" style={{ color: GREEN_LINK }} aria-label="前往首页">
              首页
            </button>
            <span className="ggd-crumb-sep px-[5px]" style={{ color: '#666' }} aria-hidden>
              »
            </span>
          </li>
          <li className="flex items-center">
            <button
              type="button"
              onClick={() => navigate({ view: 'book', bookId: book.id })}
              className="max-w-[12em] truncate transition-colors hover:text-[#f50]"
              style={{ color: GREEN_LINK }}
              aria-label={`返回《${book.name}》书页`}
            >
              {book.name}
            </button>
            <span className="ggd-crumb-sep px-[5px]" style={{ color: '#666' }} aria-hidden>
              »
            </span>
          </li>
          <li>
            <span className="max-w-[14em] truncate" style={{ color: '#666' }}>
              {chapter.title}
            </span>
          </li>
        </ol>
      </nav>

      {/* ============ .book.read#acontent 米黄纸面 ============ */}
      <div className="ggd-read rounded-[4px] border bg-white px-2.5 pb-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.05)]" style={{ borderColor: LINE }}>
        <div className="ggd-readpanel pt-2.5" style={{ background: READ_BG, color: '#333' }}>
          <h1 className="ggd-readtitle mb-2.5 pt-2.5 text-center text-[26px]" style={{ color: GREEN_LINK }}>
            {chapter.title}
          </h1>
          {/* 真站 p.booktag「加入书签」为登录态 → 不渲染(声明); 居中字数信息行等价占位 */}
          <p className="pb-1 text-center text-[13px]" style={{ color: TEXT_BODY }}>
            {chapter.wordCount > 0 ? `${chapter.wordCount} 字` : ''}
          </p>
          {/* .readcontent(24px/180%/ls .1em/左右 padding 15px; ≤767 padding 0; ≤467 18px — 由 index.ts css 承担) */}
          <ChapterContent content={chapter.content} className="ggd-readcontent border-t py-2.5" />
          {/* ↑返回顶部↑(真站回顶锚) */}
          <div className="px-[15px] pb-1 text-right">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="text-[13px] hover:underline"
              style={{ color: GREEN_LINK }}
              aria-label="返回顶部"
            >
              ↑返回顶部↑
            </button>
          </div>
        </div>
      </div>

      {/* ============ p.text-center 三钮导航(真站 書首頁/書頁,目录/下一页 → 首钮位补上一章, 声明) ============ */}
      <nav aria-label="章节导航" className="ggd-readnav mt-1 flex flex-wrap justify-center text-center">
        <button type="button" onClick={() => prev && navigate({ view: 'read', chapterId: prev.id })} disabled={!prev} className={`${navBtn} w-[46%] sm:w-[30%]`} aria-label="上一章">
          上一章
        </button>
        <button type="button" onClick={() => navigate({ view: 'book', bookId: book.id })} className={`${navBtn} w-[46%] sm:w-[30%]`} aria-label="返回书页/目录">
          书页·目录
        </button>
        <button type="button" onClick={() => next && navigate({ view: 'read', chapterId: next.id })} disabled={!next} className={`${navBtn} w-full sm:w-[30%]`} aria-label="下一章">
          下一章
        </button>
      </nav>
      {/* 温馨提示(真站 hidden-xs 桌面显; 键盘键已实现: ←/→ 切章/Enter 回书目) */}
      <p className="hidden pt-2.5 text-center text-[13px] sm:block" style={{ color: TEXT_BODY }}>
        温馨提示：按 回车[Enter]键 返回书目，按 ←键 返回上一章，按 →键 进入下一章
      </p>

      {/* ============ .book.tuijian 相关阅读(真站同分类书链 → 字数热榜替代, 声明) ============ */}
      <div className="ggd-book mt-2.5 rounded-[4px] border bg-white px-2.5 pb-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.05)]" style={{ borderColor: LINE }}>
        <p className="ggd-tuijian flex flex-wrap pt-2.5 text-[14px]">
          <span className="mr-2.5">相关阅读：</span>
          {rel === null ? (
            <Sk className="h-4 w-2/3" />
          ) : rel.length ? (
            rel.map((b) => (
              <button
                key={b.id}
                type="button"
                {...bookNavProps(navigate, b.id)}
                className="mr-2.5 mb-1 max-w-full truncate text-left transition-colors hover:text-[#f50]"
                style={{ color: GREEN_LINK }}
                aria-label={`查看《${b.name}》详情`}
              >
                {b.name}
              </button>
            ))
          ) : (
            <span>暂无推荐</span>
          )}
        </p>
        <div className="clear-both" />
      </div>

      {/* 版权行(真站书页底部声明文字) */}
      <p className="hidden pt-2.5 text-[13px] leading-5 sm:block" style={{ color: TEXT_BODY }}>
        <button type="button" onClick={() => navigate({ view: 'book', bookId: book.id })} className="hover:underline" style={{ color: GREEN_LINK }}>
          《{book.name}》
        </button>
        所有内容均来自互联网，本站只为原作者 {book.author} 的小说进行宣传。欢迎各位书友支持正版。
      </p>
    </div>
  )
}
