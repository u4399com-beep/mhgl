// ============================================================
// [R28-2b-5] 霹雳书屋 克隆章节阅读页 —— https://www.pilishuwu.com/{cat}/{id}/read/{cid}.html
//            (read/read.css, 起点系阅读器皮)
//
// 真站快照: /tmp/r28-2b/pili/read63.html(2026-09-16 实抓 44K, body.theme-0.w900)
// CSS 存档: /tmp/r28-2b/pili/read.css(207K) 实测
//
// 真站 DOM:
//   body{background:#ede7da url(body_base_bg.png) repeat; color:#262626;
//        font-family:PingFangSC-Regular,...,'Microsoft YaHei'}
//   .wrap > .read-main-wrap(w 900px, inline font-size:18px):
//     .text-wrap(min-h 600px, mb 24px, 1px #d8d8d8 边, basic_bg.png 米白纹理 → 平替 #faf5eb)
//       .main-text-wrap(padding 60px 64px):
//         .text-head: h3.j_chapterName(24px/32px) + .text-info(12px/16px h 34px,
//           出处行 a/i rgba(0,0,0,.4) margin-right 16px: 书名/作者/字数/更新时间)
//         .read-content: p{line-height:1.8; margin:1.2em 0; text-indent:2em}
//     .chapter-control(h 70px mb 24px 居中 1px #d8d8d8 边): 上一章|目录|下一章
//       (a 18px/70px width 33.2%; hover #1a1a1a + rgba(0,0,0,.03))
//   .float-wrap > .left-bar-list 侧坞 dd(1px rgba(0,0,0,.1) 边, 58×58, 12px 字
//     rgba(0,0,0,.4), hover 图标/文字 #ed4259): 目录/设置/书页/首页/排行
//     设置面板: 阅读主题 theme-0(默认 #faf5eb)/字号 A- A+
//
// 复刻口径: ①画布 #ede7da + 纸面 #faf5eb + #d8d8d8 边线 1:1 ②正文栏 900px(maxW) −
// padding 64×2 ③字号基准 18px, 偏好键与通用阅读器互通(17 基准) → 偏移平移(17→18)
// ④三钮导航 = 真站文末控制条原位复刻 + 移动端底部固定条 ⑤A-/A+ 置于页头(真站在侧坞
// 设置面板内, 为触达性提出) ⑥键盘 ←/→ 翻章(真站无, 家族标准)。
// ============================================================
'use client'

import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, Home, ListTree, Minus, Plus, TrendingUp } from 'lucide-react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { ChapterContent, useReaderFont, useRecordReading } from '../template-kit'
import { ErrorState, Sk } from '../../bits'
import { formatWords } from '../../seo'

const CANVAS = '#ede7da' // body_base_bg.png 画布
const PAPER = '#faf5eb' // basic_bg.png 米白纸面(theme-0)
const LINE = '#d8d8d8' // 边线
const TEXT = '#262626' // 正文
const META = 'rgba(0,0,0,0.4)' // 出处行

export function PiliRead({ data, loading, error }: SiteReadProps) {
  const { site, navigate } = usePublic()
  const { font, inc, dec } = useReaderFont()
  const ch = data?.chapter
  const bk = data?.book

  // [R28-2b-5] 阅读位置/时长记忆(滚动位置 + 每 10s 时长)
  useRecordReading(bk?.id, ch?.id, ch?.title)

  // 字号: 真站 read-main-wrap inline font-size:18px; 偏好以 17 基底存取 → 平移对齐
  const fontPx = 18 + (font - 17)

  // 换章回顶(真站整页跳转语义)
  useEffect(() => {
    if (ch?.id) window.scrollTo({ top: 0 })
  }, [ch?.id])

  const goToc = () => bk && navigate({ view: 'toc', bookId: bk.id, page: 1 })
  const goBook = () => bk && navigate({ view: 'book', bookId: bk.id })

  // 键盘 ←/→ 翻章(家族标准; 输入态不劫持)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft' && data?.prev) navigate({ view: 'read', chapterId: data.prev.id })
      if (e.key === 'ArrowRight' && data?.next) navigate({ view: 'read', chapterId: data.next.id })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data?.prev, data?.next, navigate])

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <ErrorState message="章节加载失败" detail={error} />
      </div>
    )
  }

  const ctrlCell = 'flex min-h-[44px] flex-1 items-center justify-center gap-1 text-[15px] transition-colors lg:text-lg'

  /** 上一章|目录|下一章 控制条(chapter-control DNA; inFlow=文末原位 / fixed=移动端底栏) */
  const ctrlBar = (fixed: boolean) => (
    <nav
      aria-label="章节控制条"
      className={fixed ? 'fixed inset-x-0 bottom-0 z-50 border-t lg:hidden' : 'mx-auto mb-6 hidden w-full border lg:flex'}
      style={{
        maxWidth: 900,
        borderColor: LINE,
        background: PAPER,
        height: fixed ? 56 : 70,
        boxShadow: fixed ? '0 -2px 10px rgba(90,62,27,0.12)' : undefined,
      }}
    >
      <button
        type="button"
        disabled={!data?.prev}
        onClick={() => data?.prev && navigate({ view: 'read', chapterId: data.prev.id })}
        className={`${ctrlCell} pili-ctrl-link`}
        style={{ color: data?.prev ? TEXT : '#cccccc', cursor: data?.prev ? 'pointer' : 'default' }}
        aria-label="阅读上一章"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        上一章
      </button>
      <span aria-hidden className="self-center" style={{ height: 32, borderRight: `1px solid ${LINE}` }} />
      <button type="button" onClick={goToc} className={`${ctrlCell} pili-ctrl-link`} style={{ color: TEXT }} aria-label="打开章节目录">
        目录
      </button>
      <span aria-hidden className="self-center" style={{ height: 32, borderRight: `1px solid ${LINE}` }} />
      <button
        type="button"
        disabled={!data?.next}
        onClick={() => data?.next && navigate({ view: 'read', chapterId: data.next.id })}
        className={`${ctrlCell} pili-ctrl-link`}
        style={{ color: data?.next ? TEXT : '#cccccc', cursor: data?.next ? 'pointer' : 'default' }}
        aria-label="阅读下一章"
      >
        下一章
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </nav>
  )

  return (
    <div className="min-h-screen pb-24" style={{ background: CANVAS, color: TEXT }}>
      {/* 页头条(read-header: 书名返回 + 字号调节) */}
      <header className="sticky top-0 z-40 border-b" style={{ background: 'rgba(255,255,255,0.85)', borderColor: 'rgba(0,0,0,0.08)', backdropFilter: 'blur(6px)' }}>
        <div className="mx-auto flex h-[60px] w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={goBook}
            className="min-w-0 truncate text-sm font-bold transition-colors hover:text-[#fa8729]"
            style={{ color: TEXT }}
            aria-label="返回书页"
          >
            {bk ? `《${bk.name}》` : '书页'}
          </button>
          <div className="flex shrink-0 items-center gap-2" role="group" aria-label="字号调节">
            <button
              type="button"
              onClick={dec}
              className="flex h-8 w-8 items-center justify-center rounded-[3px] border transition-colors"
              style={{ borderColor: LINE, color: TEXT, background: PAPER }}
              aria-label="缩小字号"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="w-8 text-center text-xs" style={{ color: META }}>{fontPx}px</span>
            <button
              type="button"
              onClick={inc}
              className="flex h-8 w-8 items-center justify-center rounded-[3px] border transition-colors"
              style={{ borderColor: LINE, color: TEXT, background: PAPER }}
              aria-label="放大字号"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-0 py-4 sm:px-6 sm:py-6">
        {loading || !ch ? (
          <div className="mx-auto max-w-[900px] px-4 sm:px-0" aria-hidden>
            <Sk className="h-8 w-2/3" />
            <Sk className="mt-3 h-4 w-1/3" />
            <div className="mt-6 space-y-3">
              {Array.from({ length: 10 }).map((_, i) => <Sk key={i} className="h-4 w-full" />)}
            </div>
          </div>
        ) : (
          <div className="mx-auto" style={{ maxWidth: 900 }}>
            {/* text-wrap 米白纸面 */}
            <article className="mb-6 border" style={{ borderColor: LINE, background: PAPER, minHeight: 600 }}>
              <div className="px-5 py-10 sm:px-12 sm:py-14 lg:px-16">
                {/* text-head: 章题 + 出处行 */}
                <h1 className="text-2xl font-normal leading-8" style={{ color: TEXT }}>{ch.title}</h1>
                <div className="flex h-[34px] flex-wrap items-center gap-x-4 text-xs" style={{ color: META }}>
                  <button type="button" onClick={goBook} className="transition-colors hover:text-[#ed4259]" aria-label={`查看《${bk?.name}》详情`}>
                    {bk?.name}
                  </button>
                  <span>{bk?.author}</span>
                  <i className="not-italic">{formatWords(ch.wordCount)}</i>
                </div>
                {/* 正文(read-content p: indent 2em / lh 1.8 规则在 index.css) */}
                <div className="pili-read-content mt-2 text-left" style={{ fontSize: fontPx }}>
                  <ChapterContent content={ch.content} />
                </div>
              </div>
            </article>
            {ctrlBar(false)}
          </div>
        )}
      </div>

      {/* 侧坞(left-bar-list: 目录/书页/首页/排行; hover #ed4259 在 index.css) */}
      <nav
        aria-label="阅读侧坞"
        className="fixed right-3 top-1/3 z-40 hidden w-[58px] -translate-y-1/2 flex-col overflow-hidden rounded-[3px] border shadow-sm md:flex"
        style={{ borderColor: 'rgba(0,0,0,0.1)', background: PAPER }}
      >
        <button type="button" onClick={goToc} className="pili-dock-btn flex flex-col items-center gap-1 py-2.5 text-xs" style={{ color: META, borderBottom: '1px solid rgba(0,0,0,0.1)' }} aria-label="打开目录">
          <ListTree className="h-4 w-4" aria-hidden />
          目录
        </button>
        <button type="button" onClick={goBook} className="pili-dock-btn flex flex-col items-center gap-1 py-2.5 text-xs" style={{ color: META, borderBottom: '1px solid rgba(0,0,0,0.1)' }} aria-label="返回书页">
          书页
        </button>
        <button type="button" onClick={() => navigate({ view: 'home' })} className="pili-dock-btn flex flex-col items-center gap-1 py-2.5 text-xs" style={{ color: META, borderBottom: '1px solid rgba(0,0,0,0.1)' }} aria-label="返回首页">
          <Home className="h-4 w-4" aria-hidden />
          首页
        </button>
        <button type="button" onClick={() => navigate({ view: 'ranking' })} className="pili-dock-btn flex flex-col items-center gap-1 py-2.5 text-xs" style={{ color: META }} aria-label="前往排行榜">
          <TrendingUp className="h-4 w-4" aria-hidden />
          排行
        </button>
      </nav>

      {ctrlBar(true)}
      <p className="pb-16 pt-2 text-center text-xs lg:pb-4" style={{ color: META }}>{site.name} · 左右方向键翻章</p>
    </div>
  )
}
