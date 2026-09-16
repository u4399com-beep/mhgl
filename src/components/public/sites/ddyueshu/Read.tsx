// ============================================================
// [R26-5-5] ddyueshu(顶点小说) 章节阅读页 —— 复刻真站 /2_2219/{cid}.html 形态(经典笔趣阁 biquge.css)。
//
// 真站勘察: /tmp/r26/ddyueshu-read.html(GBK) + biquge.css L157-169:
//   .content_read(980px 居中) > .box_con(border 2px #88C6E5) > .con_top 面包屑条(40px bg #E1ECED:
//   「顶点小说 > 玄幻小说 > 圣墟 > 番外预告【…】」) > .bookname(底虚线 #88C6E5): h1(25px/35px 黑体
//   居中 pt 10px) + .bottem1(居中: 上一章 ← 章节目录 → 下一章, a #085308 14px) + .lm 热门推荐行
//   (数据层无推荐源 → 省略, 与 footer 新书推荐同由全局承担) > #content(方正启体简体/雅黑 19pt≈25px,
//   letter-spacing 0.2em, line-height 150%, width 85%, pt 15px — 字号用 useReaderFont 用户偏好
//   14~24px 承接[任务书要求 A+/A-, 真站 19pt 超出偏好上限, 字距/行高/栏宽照抄]) > .bottem2(上虚线,
//   同款三连导航)。章节页键盘 ← → 翻页为真站行为(read.html jumpPage), 一并还原。
//   .textinfo 字数行(style.css L147: 12px #999 居中)补本章字数。
// ============================================================
'use client'

import { useEffect } from 'react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { useReaderFont, useRecordReading, ChapterContent } from '../template-kit'
import { ErrorState, Sk } from '../../bits'
import { formatWords } from '../../seo'

// [R26-5-5a] 真站实测色板 — 出处 biquge.css(L157-169) + css/style.css(L143/147)
const C = {
  text: '#555555',
  bg: '#E9FAFF',
  boxBorder: '#88C6E5', // biquge L132 .box_con 外框
  teal: '#E1ECED', // L133 .con_top 底
  dash: '#88C6E5', // L157/168 .bookname/.bottem2 虚线
  btLink: '#085308', // L169 .bottem1/.bottem2 a 墨绿
  info: '#999999', // style L147 .textinfo 灰
} as const

export function DdyueshuRead({ data, loading, error }: SiteReadProps) {
  const { site, navigate } = usePublic()
  const font = useReaderFont(14, 24)
  const chapter = data?.chapter
  const book = data?.book
  // [R26-5-5b] 阅读位置/时长记忆(任务书: 章节页挂一次)
  useRecordReading(book?.id, chapter?.id, chapter?.title)

  // [R26-5-5c] 键盘 ← → 翻章(真站 read.html jumpPage: 37=上一章 39=下一章)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && data?.prev) navigate({ view: 'read', chapterId: data.prev.id })
      if (e.key === 'ArrowRight' && data?.next) navigate({ view: 'read', chapterId: data.next.id })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data?.prev, data?.next, navigate])

  if (error) {
    return (
      <div className="dy-page dy-read" style={{ background: C.bg, padding: '0 8px 24px' }}>
        <ErrorState message="章节加载失败" detail={error} />
      </div>
    )
  }

  /** 真站 .bottem1/.bottem2 三连导航(上一章 ← 章节目录 → 下一章, a #085308 14px) */
  const chapterNav = (bottom: boolean) => (
    <div
      className={bottom ? 'dy-bt' : ''}
      style={{
        textAlign: 'center',
        ...(bottom ? { borderTop: `1px dashed ${C.dash}`, margin: '0 20px', padding: 15 } : {}),
      }}
    >
      {data?.prev ? (
        <a
          className="dy-bt-link"
          style={{ fontSize: 14, margin: '0 10px', cursor: 'pointer' }}
          onClick={() => navigate({ view: 'read', chapterId: data.prev!.id })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              navigate({ view: 'read', chapterId: data.prev!.id })
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="阅读上一章"
        >
          上一章
        </a>
      ) : (
        <span style={{ color: C.info, fontSize: 14, margin: '0 10px' }}>上一章</span>
      )}
      <span style={{ color: C.btLink }}>←</span>
      {book && (
        <a
          className="dy-bt-link"
          style={{ fontSize: 14, margin: '0 10px', cursor: 'pointer' }}
          onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              navigate({ view: 'toc', bookId: book.id, page: 1 })
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={`查看《${book.name}》章节目录`}
        >
          章节目录
        </a>
      )}
      <span style={{ color: C.btLink }}>→</span>
      {data?.next ? (
        <a
          className="dy-bt-link"
          style={{ fontSize: 14, margin: '0 10px', cursor: 'pointer' }}
          onClick={() => navigate({ view: 'read', chapterId: data.next!.id })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              navigate({ view: 'read', chapterId: data.next!.id })
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="阅读下一章"
        >
          下一章
        </a>
      ) : (
        <span style={{ color: C.info, fontSize: 14, margin: '0 10px' }}>下一章</span>
      )}
    </div>
  )

  return (
    <div className="dy-page dy-read" style={{ background: C.bg, color: C.text, fontSize: 12, padding: '0 8px 24px' }}>
      <div className="mx-auto w-full max-w-[980px]">
        {/* ============ .content_read > .box_con(biquge L132/167) ============ */}
        <div style={{ border: `2px solid ${C.boxBorder}`, background: '#fff', overflow: 'hidden' }}>
          {/* .con_top 面包屑条 */}
          <div className="flex items-center overflow-hidden" style={{ height: 40, lineHeight: '40px', background: C.teal, borderBottom: `1px solid ${C.boxBorder}`, padding: '0 10px', fontSize: 12 }}>
            <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap" style={{ textOverflow: 'ellipsis' }}>
              <a
                className="dy-crumb"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate({ view: 'home' })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate({ view: 'home' })
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="返回首页"
              >
                {site.name}
              </a>
              <span style={{ padding: '0 6px' }}>&gt;</span>
              {book && (
                <a
                  className="dy-crumb"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate({ view: 'book', bookId: book.id })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate({ view: 'book', bookId: book.id })
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`查看《${book.name}》详情`}
                >
                  {book.name}
                </a>
              )}
              <span style={{ padding: '0 6px' }}>&gt;</span>
              <span>{chapter?.title || '正文'}</span>
            </div>
            {/* A+/A- 字号工具(真站无, 任务书要求; 挂面包屑行右端) */}
            <div className="flex shrink-0 items-center gap-1" style={{ fontSize: 12 }}>
              <button
                type="button"
                onClick={font.dec}
                disabled={font.font <= 14}
                style={{ padding: '2px 7px', background: '#fff', border: `1px solid ${C.boxBorder}`, cursor: 'pointer' }}
                aria-label="缩小字号"
              >
                A-
              </button>
              <span style={{ color: C.info }}>{font.font}px</span>
              <button
                type="button"
                onClick={font.inc}
                disabled={font.font >= 24}
                style={{ padding: '2px 7px', background: '#fff', border: `1px solid ${C.boxBorder}`, cursor: 'pointer' }}
                aria-label="放大字号"
              >
                A+
              </button>
            </div>
          </div>

          {/* .bookname: h1 黑体 25px/35px 居中 + .bottem1 三连导航 */}
          <div style={{ borderBottom: `1px dashed ${C.dash}`, lineHeight: '30px', paddingTop: 10, marginBottom: 10 }}>
            <h1 style={{ margin: 0, padding: '10px 12px 0', fontFamily: '黑体,SimHei,"Microsoft YaHei",sans-serif', fontSize: 25, lineHeight: '35px', fontWeight: 700, textAlign: 'center', color: '#333' }}>
              {loading ? <Sk className="mx-auto h-8 w-72" style={{ borderRadius: 0 }} /> : chapter?.title}
            </h1>
            {chapterNav(false)}
          </div>

          {/* #content: 19pt/字距 0.2em/行高 150%/宽 85%(biquge L161); 正文渲染必须走 ChapterContent */}
          <div style={{ width: '85%', margin: '0 auto', paddingTop: 15 }}>
            {loading ? (
              <div className="space-y-3 py-2" role="status" aria-live="polite" aria-label="章节内容加载中">
                {Array.from({ length: 10 }, (_, i) => (
                  <Sk key={i} className="h-5 w-full" style={{ borderRadius: 0 }} />
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
                    fontFamily: '"Microsoft YaHei",微软雅黑,宋体,serif',
                    color: '#333',
                    wordBreak: 'break-word',
                  }}
                />
                {/* .textinfo 本章字数行(style.css L147) */}
                <p style={{ margin: '6px 0', fontSize: 12, textAlign: 'center', color: C.info }}>
                  本章字数：{formatWords(chapter.wordCount)}（按 ← → 键翻章）
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
