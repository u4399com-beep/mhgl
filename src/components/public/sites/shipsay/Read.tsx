// ============================================================
// [R28-2e-4] shipsay(船说 CMS demo) 章节阅读页克隆 —— 船说 V4.2 read 页还原
// 素材等级: Wayback 实测 —— /tmp/r28-2e/snap/ss-read.html(2024-05 快照章节页
// demo.shipsay.com/82512/5794336.html 完整 DOM, 本轮新抓, 较 R27-6b 家族标准级升级):
//   .read_bg > main.container > section.section_style >
//     .text > .text_set(i.fa-cog 设置 + #text_control: .fontsize[A-/A/A+] +
//       [书签 fa-bookmark / 夜间 fa-moon-o / 极简 fa-minus-square]) +
//     .text_title > p.style_h1 章节名(「第608章（1 / 2）」) + .text_info(span 书名链 +
//       span 作者链 + span 4198 字 + span 日期) +
//     article#article.content > p 段落 +
//   .read_nav > a#prev_url(fa-backward 上一章) + a#info_url(书页/目录) +
//     a#next_url(fa-forward 下一章)
// 契约映射(降级声明):
//   ①字号 A-/A/A+ → useReaderFont(min/normal 17px/max), 与通用阅读器同键互通
//   ②书签/夜间/极简 三图标钮为真站 JS(alert 敬请期待/isnight/ismini) → 装饰性保留不接行为(声明)
//   ③.text_info 日期 span → ChapterData 契约无章节更新时间 → 不渲染(声明)
//   ④真站章节内分页(1 / 2 → {cid}_2.html) → 契约单章全量无分页 → 标题不带「(n/N)」(声明)
//   ⑤.read_nav 钮底色真站 CSS 未存档 → 白底圆角钮家族标准形态(声明)
// 键盘 ←/→ 前后章 + 正文 <ChapterContent/> 客户端消毒。
// ============================================================
'use client'

import { useEffect } from 'react'
import { Bookmark, MinusSquare, Moon, Settings, StepBack, StepForward } from 'lucide-react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { ChapterContent, useReaderFont, useRecordReading } from '../template-kit'
import { ErrorState, Sk } from '../../bits'

/** [R28-2e-4] 船说模板实测色值(同 Home; .read_bg 底色真站 CSS 未存档 → 沿用全站 #f4f4f4) */
const C = {
  bg: '#f4f4f4',
  card: '#ffffff',
  text: '#666666',
  link: '#1a1a1a',
  hover: '#ed4259',
  title: '#555555',
  line: '#e3e3e3',
} as const

export function ShipsayRead({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  // 字号调节(真站 .fontsize A-/A/A+ → changeSize('min'/'normal'/'plus'))
  const { font, inc, dec, set } = useReaderFont()

  // 阅读位置/时长记忆(hooks 顺序: 挂载即调)
  useRecordReading(data?.book?.id, data?.chapter?.id, data?.chapter?.title)

  // 键盘导航(船说家族惯例: ← 上一章 / → 下一章)
  useEffect(() => {
    if (!data) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft' && data.prev) navigate({ view: 'read', chapterId: data.prev.id })
      else if (e.key === 'ArrowRight' && data.next) navigate({ view: 'read', chapterId: data.next.id })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data, navigate])

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-2 py-10">
        <ErrorState message="章节加载失败" detail={error} />
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-2 pb-6 pt-3" aria-label="章节加载中">
        <div className="ss-card p-3">
          <Sk className="mx-auto mb-4 h-6 w-1/2" />
          <div className="space-y-3 px-1">
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
  const iconBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-[3px] text-[13px] transition-colors'
  const navBtn = 'ss-navbtn m-[2px] inline-flex h-[34px] items-center justify-center gap-1.5 rounded-[3px] border px-3 text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="ss-home ss-read_bg w-full pb-6" style={{ background: C.bg, color: C.text, fontSize: 14 }}>
      <main className="mx-auto w-full max-w-[960px] px-2 pt-3">
        <section className="ss-card ss-section_style p-3">
          {/* ============ .text > .text_set 设置区(fa-cog + A-/A/A+ + 书签/夜间/极简) ============ */}
          <div className="ss-text mb-2 flex items-start justify-between border-b pb-2" style={{ borderColor: C.line }}>
            <span className="ss-cog mt-0.5 inline-flex items-center gap-1 text-[12px]" style={{ color: C.hover }}>
              <Settings className="h-4 w-4" aria-hidden />
              阅读设置
            </span>
            <div className="ss-text_control flex items-center gap-3">
              {/* .fontsize A-/ A / A+ → useReaderFont(真站 changeSize('min'/'normal'/'plus')) */}
              <span className="ss-fontsize inline-flex items-center gap-1">
                <button type="button" onClick={dec} className={`${iconBtn} border`} style={{ borderColor: C.line, color: C.link, background: C.card }} aria-label="缩小字号">
                  A-
                </button>
                <button type="button" onClick={() => set(17)} className={`${iconBtn} border`} style={{ borderColor: C.line, color: C.link, background: C.card }} aria-label="标准字号">
                  A
                </button>
                <button type="button" onClick={inc} className={`${iconBtn} border`} style={{ borderColor: C.line, color: C.link, background: C.card }} aria-label="放大字号">
                  A+
                </button>
              </span>
              {/* 书签/夜间/极简: 真站 JS(alert 敬请期待/isnight/ismini) → 装饰性保留(声明) */}
              <span className="ss-tools hidden items-center gap-2 sm:inline-flex" aria-hidden>
                <span className={iconBtn} style={{ color: C.text }} title="加入书签">
                  <Bookmark className="h-4 w-4" />
                </span>
                <span className={iconBtn} style={{ color: C.text }} title="白天夜间模式">
                  <Moon className="h-4 w-4" />
                </span>
                <span className={iconBtn} style={{ color: C.text }} title="极简模式">
                  <MinusSquare className="h-4 w-4" />
                </span>
              </span>
            </div>
          </div>

          {/* ============ .text_title(p.style_h1 章节名 + .text_info 元信息) ============ */}
          <div className="ss-text_title py-2 text-center">
            <h1 className="style_h1 m-0 text-[20px] font-bold leading-snug" style={{ color: C.title }}>
              {chapter.title}
            </h1>
            <div className="text_info mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px]">
              <span>
                <button type="button" onClick={() => navigate({ view: 'book', bookId: book.id })} className="hover:underline" style={{ color: C.link }} aria-label={`返回《${book.name}》书页`}>
                  {book.name}
                </button>
              </span>
              <span>
                <button type="button" onClick={() => navigate({ view: 'search', q: book.author })} className="hover:underline" style={{ color: C.link }} aria-label={`搜索 ${book.author} 的作品`}>
                  {book.author}
                </button>
              </span>
              <span style={{ color: C.text }}>{chapter.wordCount > 0 ? `${chapter.wordCount} 字` : ''}</span>
              {/* 真站第 4 span 日期 → 契约无章节更新时间, 不渲染(声明) */}
            </div>
          </div>

          {/* ============ article#article.content 正文 ============ */}
          <ChapterContent
            content={chapter.content}
            className="ss-readcontent border-t pt-3"
            style={{ fontSize: font, lineHeight: `${Math.round(font * 1.7)}px`, color: '#333' }}
          />
        </section>

        {/* ============ .read_nav 三钮导航(真站排布: 上一章 | 书页/目录 | 下一章) ============ */}
        <nav aria-label="章节导航" className="ss-read_nav mt-2 flex flex-wrap justify-center">
          <button
            type="button"
            onClick={() => prev && navigate({ view: 'read', chapterId: prev.id })}
            disabled={!prev}
            className={`${navBtn} min-w-[31%] flex-1`}
            style={{ background: C.card, borderColor: C.line, color: C.link }}
            aria-label="上一章"
          >
            <StepBack className="h-3.5 w-3.5" aria-hidden />
            上一章
          </button>
          <button
            type="button"
            onClick={() => navigate({ view: 'book', bookId: book.id })}
            className={`${navBtn} min-w-[31%] flex-1`}
            style={{ background: C.card, borderColor: C.line, color: C.link }}
            aria-label="返回书页目录"
          >
            书页/目录
          </button>
          <button
            type="button"
            onClick={() => next && navigate({ view: 'read', chapterId: next.id })}
            disabled={!next}
            className={`${navBtn} min-w-[31%] flex-1`}
            style={{ background: C.card, borderColor: C.line, color: C.link }}
            aria-label="下一章"
          >
            下一章
            <StepForward className="h-3.5 w-3.5" aria-hidden />
          </button>
        </nav>
      </main>
    </div>
  )
}
