// ============================================================
// [R28-2a2] ddyueshu(顶点小说) 章节阅读页 —— 复刻真站 /2_2096/{cid}.html 形态(经典笔趣阁 biquge.css)
//   (快照 /tmp/r28-2a/ddyueshu/ddyueshu-chapter.html(GBK→UTF8) + biquge.css L157-169 全量实测;
//    前轮 R26 版 Read.tsx(git 5bb96cb) 考据结论沿用, 本轮按 R28 契约重建为 button+navigate 版)
//
//   真站结构(类名注释对应真站; 快照逐层核对):
//     .content_read(980px 居中) > .box_con(border 2px #88C6E5) >
//     .con_top 面包屑条(40px bg #E1ECED:「顶点小说 > 玄幻小说 > 我是至尊 > 楔子」) >
//     .bookname(底虚线 #88C6E5): h1(25px/35px 黑体 居中 pt 10px) +
//       .bottem1(居中: 上一章 &larr; 章节目录 &rarr; 下一章 加入书签, a #085308 14px biquge L169) +
//       .lm 热门推荐行 > #content(方正启体简体/雅黑 19pt, letter-spacing 0.2em,
//       line-height 150%, width 85%, pt 15px — biquge L161) > .bottem2(上虚线, 同款三连导航)
//   键盘翻章为真站原生行为(read.html jumpPage: 37=上一章 39=下一章 13=回目录), 原样还原
//   并加 input/textarea/contentEditable 守卫。
//
//   降级/推断说明:
//   ① 真站正文 19pt≈25.3px 超出通用阅读器偏好区间 → 字号用 useReaderFont(14~24) 用户偏好
//      承接(A+/A- 为任务书要求, 真站无此控件, 挂 .con_top 右端); 字距/行高/栏宽照抄真站
//   ② 「加入书签」真站为登录态 JS(addBookMark) → 省略; 阅读位置/时长由 useRecordReading
//      自动记忆(等价能力, 滚动防抖 300ms + 可见段计时)
//   ③ .lm 热门推荐行为站方固定推荐位(快照内 10 条硬链) → 契约无对应数据源, 省略
//   ④ .bottem1/.bottem2 真站 width:900px 固定 → max-width:900 居中适配窄屏(375px 无横滚)
//   ⑤ .textinfo 本章字数行(style.css L147: 12px #999 居中)承接契约 chapter.wordCount
//   ⑥ 字体栈「方正启体简体」为商业字体按真站原样声明, 无字体环境自然回落雅黑/宋体
// ============================================================
'use client'

import { useEffect } from 'react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { useReaderFont, useRecordReading, ChapterContent } from '../template-kit'
import { ErrorState, Sk } from '../../bits'
import { formatWords } from '../../seo'

// [R28-2a2-1] 真站实测色板 — 出处 biquge.css(L132-169) + css/style.css(L147)
const C = {
  text: '#555555', // biquge L2 body color
  bg: '#E9FAFF', // biquge L2 body background
  boxBorder: '#88C6E5', // L132 .box_con 外框 2px
  teal: '#E1ECED', // L133 .con_top 底色
  dash: '#88C6E5', // L157/168 .bookname/.bottem2 虚线
  btLink: '#085308', // L169 .bottem1/.bottem2 a 墨绿
  info: '#999999', // style.css L147 .textinfo 灰
} as const

export function DdyueshuRead({ data, loading, error }: SiteReadProps) {
  const { site, navigate } = usePublic()
  // [R28-2a2-2] 字号偏好(与通用阅读器同键互通; 降级声明①)
  const font = useReaderFont(14, 24)
  const chapter = data?.chapter
  const book = data?.book
  // [R28-2a2-3] 阅读位置/时长记忆(降级声明②)
  useRecordReading(book?.id, chapter?.id, chapter?.title)

  // [R28-2a2-4] 键盘翻章(真站 jumpPage: 37=←上一章 39=→下一章 13=回目录; 加编辑态守卫)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft' && data?.prev) navigate({ view: 'read', chapterId: data.prev.id })
      else if (e.key === 'ArrowRight' && data?.next) navigate({ view: 'read', chapterId: data.next.id })
      else if (e.key === 'Enter' && data?.book) navigate({ view: 'toc', bookId: data.book.id, page: 1 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data?.prev, data?.next, data?.book, navigate])

  if (error) {
    return (
      <div className="dy-page dy-read" style={{ background: C.bg, color: C.text, padding: '14px 8px 24px' }}>
        <div className="mx-auto w-full" style={{ maxWidth: 980 }}>
          <ErrorState message="章节加载失败" detail={error} />
        </div>
      </div>
    )
  }

  // 真站 .bottem1/.bottem2 三连导航(上一章 &larr; 章节目录 &rarr; 下一章, a #085308 14px)
  const navBtn = (label: string, onClick: (() => void) | null, aria: string) =>
    onClick ? (
      <button type="button" onClick={onClick} className="dy-bt-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 14, margin: '0 10px' }} aria-label={aria}>
        {label}
      </button>
    ) : (
      <span style={{ color: C.info, fontSize: 14, margin: '0 10px' }}>{label}</span>
    )

  const chapterNav = (bottom: boolean) => (
    <div
      className={bottom ? 'dy-bt2' : 'dy-bt1'}
      style={{
        textAlign: 'center',
        width: '100%',
        maxWidth: 900,
        ...(bottom ? { borderTop: `1px dashed ${C.dash}`, margin: '0 auto', padding: 15 } : { margin: '5px auto', clear: 'both' as const }),
      }}
    >
      {navBtn('上一章', data?.prev ? () => navigate({ view: 'read', chapterId: data.prev!.id }) : null, '阅读上一章')}
      <span style={{ color: C.btLink }} aria-hidden="true">&larr;</span>
      {book && navBtn('章节目录', () => navigate({ view: 'toc', bookId: book.id, page: 1 }), `查看《${book.name}》章节目录`)}
      <span style={{ color: C.btLink }} aria-hidden="true">&rarr;</span>
      {navBtn('下一章', data?.next ? () => navigate({ view: 'read', chapterId: data.next!.id }) : null, '阅读下一章')}
    </div>
  )

  return (
    <div className="dy-page dy-read" style={{ background: C.bg, color: C.text, fontFamily: '"Segoe UI","Microsoft YaHei",sans-serif', fontSize: 12, padding: '0 8px 24px' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 980 }}>
        {/* .content_read > .box_con(biquge L132/167) */}
        <div className="dy-boxcon" style={{ border: `2px solid ${C.boxBorder}`, background: '#fff', overflow: 'hidden' }}>
          {/* .con_top 面包屑条(biquge L133) + A-/A+ 字号工具(降级声明①) */}
          <div className="dy-con-top flex items-center overflow-hidden" style={{ height: 40, lineHeight: '40px', background: C.teal, borderBottom: `1px solid ${C.boxBorder}`, padding: '0 10px', fontSize: 12 }}>
            <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap" style={{ textOverflow: 'ellipsis' }}>
              <button type="button" onClick={() => navigate({ view: 'home' })} className="dy-crumb" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 12 }} aria-label="返回首页">
                {site.name}
              </button>
              <span style={{ padding: '0 6px' }}>&gt;</span>
              {book && (
                <button type="button" onClick={() => navigate({ view: 'book', bookId: book.id })} className="dy-crumb" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 12 }} aria-label={`查看《${book.name}》详情`}>
                  {book.name}
                </button>
              )}
              <span style={{ padding: '0 6px' }}>&gt;</span>
              <span>{chapter?.title || (loading ? '加载中…' : '正文')}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1" style={{ fontSize: 12 }}>
              <button
                type="button"
                onClick={font.dec}
                disabled={font.font <= 14}
                style={{ padding: '2px 7px', background: '#fff', border: `1px solid ${C.boxBorder}`, cursor: font.font <= 14 ? 'default' : 'pointer', opacity: font.font <= 14 ? 0.5 : 1 }}
                aria-label="缩小字号"
              >
                A-
              </button>
              <span style={{ color: C.info }}>{font.font}px</span>
              <button
                type="button"
                onClick={font.inc}
                disabled={font.font >= 24}
                style={{ padding: '2px 7px', background: '#fff', border: `1px solid ${C.boxBorder}`, cursor: font.font >= 24 ? 'default' : 'pointer', opacity: font.font >= 24 ? 0.5 : 1 }}
                aria-label="放大字号"
              >
                A+
              </button>
            </div>
          </div>

          {/* .bookname: h1 黑体 25px/35px 居中(biquge L158) + .bottem1 三连导航(L159/169) */}
          <div className="dy-bookname" style={{ borderBottom: `1px dashed ${C.dash}`, lineHeight: '30px', paddingTop: 10, marginBottom: 10 }}>
            <h1 style={{ margin: 0, padding: '10px 12px 0', fontFamily: '黑体,SimHei,"Microsoft YaHei",sans-serif', fontSize: 25, lineHeight: '35px', fontWeight: 700, textAlign: 'center', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {loading ? <Sk className="mx-auto h-8 w-72" style={{ borderRadius: 0, background: 'rgba(225,236,237,0.9)' }} /> : chapter?.title}
            </h1>
            {chapterNav(false)}
          </div>

          {/* #content(biquge L161): 宽 85% 居中 pt15; 正文渲染必须走 ChapterContent(XSS 消毒) */}
          <div className="dy-content" style={{ width: '85%', margin: '0 auto', paddingTop: 15, minWidth: 0 }}>
            {loading ? (
              <div className="space-y-3 py-2" role="status" aria-live="polite" aria-label="章节内容加载中">
                {Array.from({ length: 10 }, (_, i) => (
                  <Sk key={i} className="h-5 w-full" style={{ borderRadius: 0, background: 'rgba(225,236,237,0.7)' }} />
                ))}
                <span className="sr-only">加载中…</span>
              </div>
            ) : chapter ? (
              <>
                <ChapterContent
                  content={chapter.content}
                  style={{
                    fontSize: font.font,
                    lineHeight: 1.5,
                    letterSpacing: '0.2em',
                    fontFamily: '"方正启体简体","Microsoft YaHei",微软雅黑,宋体,serif',
                    color: '#333',
                    wordBreak: 'break-word',
                  }}
                />
                {/* .textinfo 本章字数行(style.css L147, 降级声明⑤) */}
                <p style={{ margin: '6px 0', fontSize: 12, textAlign: 'center', color: C.info }}>
                  本章字数：{formatWords(chapter.wordCount)}（按 ← → 键翻章，Enter 回目录）
                </p>
              </>
            ) : (
              <p style={{ padding: '24px 0', textAlign: 'center', color: C.info }}>暂无正文</p>
            )}
          </div>

          {/* .bottem2: 上虚线三连导航(biquge L168) */}
          {!loading && chapter && chapterNav(true)}
        </div>
      </div>
    </div>
  )
}

