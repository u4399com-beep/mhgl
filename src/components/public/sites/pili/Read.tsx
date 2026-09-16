// ============================================================
// [R26-2-50] 霹雳书屋 克隆章节阅读页 —— https://www.pilishuwu.com/{cat}/{id}/read/{cid}.html
// (wmcms 阅读器 = 起点系 read.css 移植皮; 样本 /tmp/sites/pilishuwu-chapter.html +
//  /tmp/r26/pili-read.css(read/read.css 207KB) 实测)
//
// 真站 DOM(body.theme-0.w900, body{background:#ede7da url(body_base_bg.png) repeat}):
//   .read-header(高 60px, margin-bottom 16px, bg rgba(255,255,255,.4), z-104)
//     .wrap-center(900px, 高 64px): .left-nav(pin-logo 160×41 + 快速导航下拉) + .read-login(搜索)
//   .wrap > .read-main-wrap(width 800px auto, inline font-size:18px, font-family01 雅黑优先):
//     .text-wrap(min-height 600px, mb 24px, 1px #d8d8d8 边, basic_bg.png 米白纹理 → 平替 #faf5eb,
//       theme-0 设置面板色值实证 .left-bar-list .panel-wrap.setting span.theme-0{background:#faf5eb})
//       .main-text-wrap(padding 60px 64px):
//         .text-head(mb 12px): h3.j_chapterName(font 24px/32px, h 32px, mb 12px, #262626 继承)
//           .text-info(font 12px/16px, h 34px): a 书名/作者 + i 字数/时间
//           (margin-right 16px, #999/rgba(0,0,0,.4), a:hover #ed4259 红)
//         .read-content(mb 24px): p{line-height:1.8; margin:1.2em 0; text-indent:2em}
//     .chapter-control(高 70px, mb 24px, 居中, 1px #d8d8d8 边, basic_bg 纹理):
//       a(font 18px/70px, width 33.2%)「上一章|目录|下一章」+ span 分隔(32px 高, 右 1px #d8d8d8 边);
//       a:hover{color:#1a1a1a; background:rgba(0,0,0,.03)}; a.disabled{color:#ccc}
//   .float-wrap#j_floatWrap > .left-bar-list(fixed 60px 宽侧坞): dd(1px #d8d8d8 边, a 58×58,
//     12px/16px, 图标 16px #000, 文字 rgba(0,0,0,.4); hover 图标/文字 #ed4259)
//     「目录/设置/书页/首页/排行」+ 设置面板(阅读主题 theme-0~6 / 字体 / 字号 A- A+)
//
// 复刻口径: ①画布 #ede7da + 纸面 #faf5eb + #d8d8d8 边线 1:1; ②正文 800px 栏
// (measure 680 由主题 read 变量控制 — 主栏 800 − padding 64×2 ≈ 672, 主题 680 同容差);
// ③字号: 真站基准 18px, 用户偏好键与通用阅读器互通(17 基准) → 以偏移量平移(17→18);
// ④「上一章|目录|下一章」真站为文末 in-flow 控制条 → 原位复刻, 移动端(<lg)追加底部固定条;
// ⑤A-/A+ 置于 read-header 右侧(真站在左侧坞设置面板内, 移出来便于单手调);
// ⑥橙 tab 基因(works-xone-menu active 4px #ff9a6a)迁移到章题下划短线 —— 真站阅读页章题无
// 橙饰, 此处按任务「橙色章头」要求以站内既有橙 tab DNA 补充 [R26-2-50 推断]。
// ============================================================
'use client'

import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, Home, ListTree, BookOpen } from 'lucide-react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { useReaderFont, useRecordReading, ChapterContent } from '../template-kit'
import { ErrorState, Sk } from '../../bits'
import { formatWords } from '../../seo'

const CANVAS = '#ede7da' // body_base_bg.png 画布
const PAPER = '#faf5eb' // basic_bg.png 米白纸面(theme-0 色值实证)
const LINE = '#d8d8d8' // 边线
const TEXT = '#262626' // 正文
const META = 'rgba(0,0,0,0.4)' // 出处行(等价 #999); 链接 hover 红 #ed4259 用 tailwind hover: 类
const ORANGE_TAB = '#ff9a6a' // works-xone-menu 橙 tab(章题短线迁移)

export function PiliRead({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  const { font, inc, dec } = useReaderFont()
  const ch = data?.chapter
  const bk = data?.book

  // [R26-2-51] 阅读位置/时长记忆(滚动位置 + 每 10s 时长)
  useRecordReading(bk?.id, ch?.id, ch?.title)

  // 字号: 真站 read-main-wrap inline font-size:18px; 偏好以 17 为基底存取 → 平移对齐真站基准
  const fontPx = 18 + (font - 17)

  // 换章回顶(真站整页跳转语义)
  useEffect(() => {
    if (ch?.id) window.scrollTo({ top: 0 })
  }, [ch?.id])

  const goToc = () => bk && navigate({ view: 'toc', bookId: bk.id, page: 1 })
  const goBook = () => bk && navigate({ view: 'book', bookId: bk.id })

  const ctrlLink = 'flex min-h-[44px] flex-1 items-center justify-center text-[15px] transition-colors lg:text-lg'
  const dockBtn = 'flex w-[58px] flex-col items-center gap-1 py-2.5 text-xs transition-colors'

  /** 上一章|目录|下一章 控制条(chapter-control DNA, inFlow=文末原位 / fixed=移动端底栏) */
  const ctrlBar = (fixed: boolean) => (
    <nav
      aria-label="章节控制条"
      className={
        fixed
          ? 'fixed inset-x-0 bottom-0 z-50 border-t lg:hidden'
          : 'mx-auto mb-6 hidden w-full border lg:flex'
      }
      style={{
        maxWidth: 800,
        borderColor: LINE,
        background: PAPER,
        height: fixed ? 56 : 70,
        boxShadow: fixed ? '0 -2px 10px rgba(125,54,15,0.08)' : undefined,
      }}
    >
      <button
        type="button"
        disabled={!data?.prev}
        onClick={() => data?.prev && navigate({ view: 'read', chapterId: data.prev.id })}
        className={`${ctrlLink} pili-ctrl-link`}
        style={{ color: data?.prev ? TEXT : '#cccccc', cursor: data?.prev ? 'pointer' : 'default' }}
        aria-label="阅读上一章"
      >
        <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
        上一章
      </button>
      <span aria-hidden className="self-center" style={{ height: 32, borderRight: `1px solid ${LINE}` }} />
      <button type="button" onClick={goToc} className={`${ctrlLink} pili-ctrl-link`} style={{ color: TEXT }} aria-label="打开章节目录">
        <ListTree className="mr-1 h-4 w-4" aria-hidden />
        目录
      </button>
      <span aria-hidden className="self-center" style={{ height: 32, borderRight: `1px solid ${LINE}` }} />
      <button
        type="button"
        disabled={!data?.next}
        onClick={() => data?.next && navigate({ view: 'read', chapterId: data.next.id })}
        className={`${ctrlLink} pili-ctrl-link`}
        style={{ color: data?.next ? TEXT : '#cccccc', cursor: data?.next ? 'pointer' : 'default' }}
        aria-label="阅读下一章"
      >
        下一章
        <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
      </button>
    </nav>
  )

  return (
    <div className="min-h-screen w-full pb-6" style={{ background: CANVAS, color: TEXT }}>
      {/* ============ 顶部细条(read-header 60px, rgba(255,255,255,.4)) ============ */}
      <header className="mb-4 border-b" style={{ background: 'rgba(255,255,255,0.4)', borderColor: 'rgba(0,0,0,0.06)' }}>
        <div className="mx-auto flex h-[60px] w-full max-w-4xl items-center gap-2 px-3 sm:px-6">
          <button
            type="button"
            onClick={goBook}
            aria-label={`返回《${bk?.name || ''}》书籍页`}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1 text-sm transition-colors hover:text-[#ed4259]"
            style={{ color: META }}
          >
            <BookOpen className="h-4 w-4" aria-hidden />
            {bk?.name || '书页'}
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-sm" style={{ color: META }}>
            {ch ? ch.title : loading ? '加载中…' : ''}
          </p>
          {/* A- A+(真站在左坞设置面板内; 平移到顶条便于触达, 按钮形态同左坞 dd) */}
          <div role="group" aria-label="字号调节" className="flex shrink-0 items-center overflow-hidden rounded-[2px] border" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
            <button
              type="button"
              onClick={dec}
              aria-label="减小字号"
              className="flex h-9 w-9 items-center justify-center transition-colors hover:text-[#ed4259]"
              style={{ color: META }}
            >
              <span className="text-xs font-bold">A-</span>
            </button>
            <span aria-hidden style={{ height: 20, borderRight: `1px solid rgba(0,0,0,0.1)` }} />
            <button
              type="button"
              onClick={inc}
              aria-label="增大字号"
              className="flex h-9 w-9 items-center justify-center transition-colors hover:text-[#ed4259]"
              style={{ color: META }}
            >
              <span className="text-sm font-bold">A+</span>
            </button>
          </div>
        </div>
      </header>

      {/* ============ 左侧坞(≥lg 固定, left-bar-list 60px DNA) ============ */}
      <div
        className="fixed left-3 top-24 z-40 hidden w-[60px] overflow-hidden rounded-[3px] border bg-white lg:block"
        style={{ borderColor: LINE, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        aria-label="阅读侧边坞"
      >
        <button type="button" onClick={goToc} className={`${dockBtn} pili-dock-btn`} style={{ color: META, borderBottom: `1px solid ${LINE}` }} aria-label="打开章节目录">
          <ListTree className="h-4 w-4" aria-hidden style={{ color: '#000000' }} />
          目录
        </button>
        <button type="button" onClick={goBook} className={`${dockBtn} pili-dock-btn`} style={{ color: META, borderBottom: `1px solid ${LINE}` }} aria-label="返回书籍页">
          <BookOpen className="h-4 w-4" aria-hidden style={{ color: '#000000' }} />
          书页
        </button>
        <button type="button" onClick={() => navigate({ view: 'home' })} className={`${dockBtn} pili-dock-btn`} style={{ color: META }} aria-label="返回首页">
          <Home className="h-4 w-4" aria-hidden style={{ color: '#000000' }} />
          首页
        </button>
      </div>

      {/* ============ 正文主栏(read-main-wrap 800px) ============ */}
      <main className="w-full px-3 sm:px-6">
        <article className="mx-auto border" style={{ maxWidth: 800, borderColor: LINE, background: PAPER, minHeight: 400 }}>
          <div className="px-5 py-8 sm:px-10 sm:py-[60px]" style={{ maxWidth: 800 }}>
            {error ? (
              <div className="bg-white/0">
                <ErrorState message="章节内容加载失败" detail={error} />
              </div>
            ) : loading || !ch || !bk ? (
              <div aria-hidden>
                <Sk className="mx-auto h-8 w-1/2" style={{ backgroundColor: '#e6ddcb' }} />
                <div className="mx-auto mt-4 max-w-[672px] space-y-4 pt-6">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Sk key={i} className="h-4 w-full" style={{ backgroundColor: '#e6ddcb', opacity: 1 - i * 0.07 }} />
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* 章头(text-head: 24px/32px 标题 + 12px/16px 出处行 + 橙 tab 短线) */}
                <header className="mb-6">
                  <h1 className="text-2xl font-bold leading-8" style={{ color: TEXT }}>{ch.title}</h1>
                  <span aria-hidden className="mt-2.5 block h-[3px] w-12" style={{ background: ORANGE_TAB }} />
                  <p className="mt-3 flex h-[34px] flex-wrap items-center gap-x-4 text-xs leading-4" style={{ color: META }}>
                    <button type="button" onClick={goBook} aria-label={`查看《${bk.name}》书籍页`} className="transition-colors hover:text-[#ed4259]">
                      {bk.name}
                    </button>
                    <span>{bk.author}</span>
                    <i className="not-italic tabular-nums">{formatWords(ch.wordCount) || `${ch.wordCount}字`}</i>
                  </p>
                </header>

                {/* 正文(read-content: 1.8 行高 / 1.2em 段距 / 2em 缩进 — 段落规则在 index.ts css) */}
                <ChapterContent
                  content={ch.content}
                  className="pili-read-content"
                  style={{ fontSize: fontPx, lineHeight: 1.8, color: TEXT }}
                />
              </>
            )}
          </div>
        </article>

        {/* 文末控制条(真站 in-flow chapter-control: 与纸面同宽独立块, 非 paper 内部) */}
        {!error && !loading && ch && bk ? ctrlBar(false) : null}
      </main>

      {/* ============ 移动端底部固定条(同一控制条 DNA, <lg 显示) ============ */}
      <div className="h-16 lg:hidden" aria-hidden />
      {ctrlBar(true)}
    </div>
  )
}
