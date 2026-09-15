// ============================================================
// [R26-1] 久久小说下载网 克隆章节阅读页 —— 复刻真站 /read/47/{bid}/{n}.html
//   (快照 /tmp/r26/aijjxs-chapter2.html + skin/yellow/read.css 全量实抓实测;
//    真站阅读器为「夜车」内核 + read-v3 暖羊皮纸皮肤, 与主站米黄皮不同色系)。
//
//   真站结构(类名注释对应真站; 版心 = .view_* 共用 width min(1080px, 100%-30px)):
//     .view_top > .sk_gb 工具条面板(bg #fff8ec / 边 #e2d6c5 / radius 14 / padding 12):
//       「背景」#skbglist 6 色板圆点 18px(.c1 #cde4ff 蓝色回忆 / .c2 #d8d8d8 灰色天空 /
//        .c3 #cfe7d4 青山不老 / .c6 #f4ced6 粉红世家 / .c4 #f2e7ab 明黄清俊 / .c5 #f8f8f8 雪白世界)
//       「字号」#fonts 5 档(.s 小/中/大/加大/极大: 边 #d8cab7 radius 8 #6f4f34;
//        激活态 bg #fbe8ce 边 #d8a366 #80410f) — 本站以 useReaderFont 映射 set(14/17/20/22/24)
//       「字体」下拉(默认/宋体/雅黑/楷体/黑体) + 字体颜色/双击滚屏 —— 无对应数据/交互面 → 不渲染
//     .view_t 标题面板(边 #d9c4a6 / 渐变 #fffcf5→#f8eddd / radius 14 / 居中):
//       h1「{书名}  {章节标题}」clamp(16px,2.1vw,22px); .view_intro(上边 dashed #d8c6af, 13px #75695b:
//       「作者 · 分类 · 大小 · 日期」— 数据源无分类/日期 → 作者 · 字数 · 章序)
//     .view_content 正文面板(边 #e2d6c5 / radius 16 / bg #fffcf6 72% / padding clamp(24px,4vw,40px)):
//       #view_content_txt 23px / lh 1.76 / p 缩进 2.4em 段距 1.2em(p: 首段缩进 0)
//     .view_page 翻页导航(16px lh 1.88 居中面板): 章节目录 | 首页 | 上一页 ← n → 下一页 | 尾页
//       (真站为章内分页; 本站按章推进 → 上一章/下一章 + 章节目录)
//     .view_tips 小提示(边 dashed #d8c6af 居中 13px; 真站含 ←/→ 键盘翻页提示 — 本站同款实现键盘翻章)
//     .footer(渐变 #faefde→#f4e7d3): 版权/书籍信息
//   body.read-v3 背景渐变 #efe6d8→#eadfcf(全局头部之下由本组件铺底)。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { formatWords, statusLabel, withAlpha } from '../../seo'
import { ChapterContent, useReaderFont, useRecordReading } from '../template-kit'

// [R26-1-1] 真站 read.css 实测色值(阅读页专属暖羊皮纸色系, 硬编码)
const R = {
  bgTop: '#efe6d8',
  bgBottom: '#eadfcf',
  panel: '#fff8ec',
  paper: '#fffcf6',
  ink: '#27231f',
  muted: '#75695b',
  line: '#e2d6c5',
  titleBorder: '#d9c4a6',
  introLine: '#d8c6af',
  link: '#6b3418',
  linkHover: '#a85a2a',
  footer1: '#faefde',
  footer2: '#f4e7d3',
  shadow: '0 10px 28px rgba(33, 21, 11, 0.1)',
  pageMax: 1080,
} as const

/** [R26-1-50] 真站 #skbglist 6 色板(名称/色值均为 read.css + 页面 title 属性实测) */
const BG_SWATCHES: { name: string; color: string; cls: string }[] = [
  { name: '蓝色回忆', color: '#cde4ff', cls: 'c1' },
  { name: '灰色天空', color: '#d8d8d8', cls: 'c2' },
  { name: '青山不老', color: '#cfe7d4', cls: 'c3' },
  { name: '粉红世家', color: '#f4ced6', cls: 'c6' },
  { name: '明黄清俊', color: '#f2e7ab', cls: 'c4' },
  { name: '雪白世界', color: '#f8f8f8', cls: 'c5' },
]

/** [R26-1-51] 字号 5 档 → useReaderFont.set 映射(真站 fontsize(1..5): 小/中/大/加大/极大) */
const FONT_STEPS: { label: string; px: number }[] = [
  { label: '小', px: 14 },
  { label: '中', px: 17 },
  { label: '大', px: 20 },
  { label: '加大', px: 22 },
  { label: '极大', px: 24 },
]

export function AijjxsRead({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  const chapter = data?.chapter ?? null
  const book = data?.book ?? null
  const prev = data?.prev ?? null
  const next = data?.next ?? null
  const reader = useReaderFont()
  // [R26-1-52] 正文底色(真站 backcolor(1..6) 全页换肤; 本站作用于正文/翻页面板, 默认纸白)
  const [bg, setBg] = useState<string>(R.paper)

  // [R26-1-53] 阅读位置/时长记忆(阅读页挂一次)
  useRecordReading(book?.id, chapter?.id, chapter?.title)

  // [R26-1-54] 键盘 ←/→ 翻章(真站 pageEvent: key==37/39 location=prevpage/nextpage)
  useEffect(() => {
    if (!book) return
    const onKey = (e: KeyboardEvent) => {
      // [R27-5b-L8] 输入框/文本域聚焦时不翻章(与通用 ReadView isEditableTarget 守卫对齐,
      // 修前在头部搜索框按 ←/→ 会翻章丢输入)
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft' && prev) navigate({ view: 'read', chapterId: prev.id })
      if (e.key === 'ArrowRight' && next) navigate({ view: 'read', chapterId: next.id })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [book, prev, next, navigate])

  if (error) {
    return (
      <div className="ajx-read" style={{ minHeight: '60vh', padding: '18px 15px', background: `linear-gradient(180deg, ${R.bgTop} 0%, ${R.bgBottom} 100%)` }}>
        <ErrorState message="章节内容加载失败" detail={error} />
      </div>
    )
  }
  if (loading || !chapter || !book) {
    return (
      <div
        className="ajx-read"
        style={{ padding: '14px 15px 24px', background: `linear-gradient(180deg, ${R.bgTop} 0%, ${R.bgBottom} 100%)` }}
        role="status"
        aria-label="章节内容加载中"
      >
        <div className="mx-auto w-full" style={{ maxWidth: R.pageMax }}>
          <Sk className="h-14 w-full" style={{ borderRadius: 14, background: 'rgba(255,248,236,0.9)' }} />
          <Sk className="mt-2.5 h-16 w-full" style={{ borderRadius: 14, background: 'rgba(255,248,236,0.9)' }} />
          <Sk className="mt-2.5 h-[420px] w-full" style={{ borderRadius: 16, background: 'rgba(255,252,246,0.9)' }} />
          <span className="sr-only">加载中…</span>
        </div>
      </div>
    )
  }

  // [R26-1-55] 正文字号: useReaderFont(14~24) + 4 ≈ 真站 --reading-size 23px 基准(默认 17+4=21, 极大 24+4=28)
  const fontSize = reader.font + 4
  const activeStep = FONT_STEPS.reduce((acc, s, i) => (Math.abs(s.px - reader.font) < Math.abs(FONT_STEPS[acc].px - reader.font) ? i : acc), 0)
  const step = chapter.idx + 1

  const navBtn = (enabled: boolean): CSSProperties => ({
    color: enabled ? R.link : '#b9aa97',
    cursor: enabled ? 'pointer' : 'default',
    fontWeight: 700,
  })

  return (
    <div
      className="ajx-read"
      style={{ minHeight: '60vh', padding: '14px 15px 24px', background: `linear-gradient(180deg, ${R.bgTop} 0%, ${R.bgBottom} 100%)` }}
    >
      <div className="mx-auto w-full" style={{ maxWidth: R.pageMax }}>
        {/* .view_top > .sk_gb 工具条(背景色板 + 字号 5 档; 真站字体/字体颜色/滚屏无对应数据面 → 不渲染) */}
        <div
          style={{
            border: `1px solid ${R.line}`,
            borderRadius: 14,
            background: R.panel,
            padding: 12,
            boxShadow: '0 6px 18px rgba(33, 21, 11, 0.06)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '7px 16px',
            fontSize: 14,
            color: R.muted,
          }}
        >
          <b style={{ fontWeight: 700 }}>背景</b>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {BG_SWATCHES.map((s) => (
              <button
                key={s.cls}
                type="button"
                className={`ajx-swatch${bg === s.color ? ' is-active' : ''}`}
                onClick={() => setBg(s.color)}
                aria-label={`背景：${s.name}`}
                aria-pressed={bg === s.color}
                style={{ background: s.color }}
              />
            ))}
            {/* 默认纸白(真站 .c5 雪白世界等位; 默认态补一枚, 保持 6+1 可回退) */}
            <button
              type="button"
              className={`ajx-swatch${bg === R.paper ? ' is-active' : ''}`}
              onClick={() => setBg(R.paper)}
              aria-label="背景：默认纸白"
              aria-pressed={bg === R.paper}
              style={{ background: R.paper }}
            />
          </span>
          <b style={{ fontWeight: 700 }}>字号</b>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {FONT_STEPS.map((s, i) => (
              <button
                key={s.label}
                type="button"
                className={`ajx-fs${i === activeStep ? ' is-active' : ''}`}
                onClick={() => reader.set(s.px)}
                aria-label={`字号：${s.label}`}
                aria-pressed={i === activeStep}
              >
                {s.label}
              </button>
            ))}
            {/* A+/A-(契约要求, 接 useReaderFont inc/dec) */}
            <button type="button" className="ajx-fs" onClick={reader.inc} aria-label="放大字号">
              A+
            </button>
            <button type="button" className="ajx-fs" onClick={reader.dec} aria-label="缩小字号">
              A-
            </button>
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 12 }}>{fontSize}px</span>
        </div>

        {/* .view_t 标题面板(居中; h1 = 书名 + 章节标题) */}
        <div
          style={{
            marginTop: 10,
            padding: '16px 13px 12px',
            borderRadius: 14,
            border: `1px solid ${R.titleBorder}`,
            background: 'linear-gradient(180deg, #fffcf5 0%, #f8eddd 100%)',
            boxShadow: R.shadow,
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(16px, 2.1vw, 22px)',
              lineHeight: 1.42,
              fontWeight: 700,
              letterSpacing: '0.02em',
              color: R.ink,
            }}
          >
            {`${book.name}  ${chapter.title}`}
          </h1>
          {/* .view_intro(数据源无分类/日期 → 作者 · 字数 · 章序 · 状态) */}
          <div
            style={{
              marginTop: 9,
              paddingTop: 9,
              borderTop: `1px dashed ${R.introLine}`,
              fontSize: 13,
              lineHeight: 1.82,
              color: R.muted,
            }}
          >
            {`${book.author} · ${formatWords(chapter.wordCount)} · 第 ${step} 章 · ${statusLabel(book.status)}`}
          </div>
        </div>

        {/* .view_content 正文面板(#view_content_txt: 23px 基准 / lh 1.76 / p 缩进 2.4em) */}
        <div
          style={{
            marginTop: 10,
            border: `1px solid ${R.line}`,
            borderRadius: 16,
            background: withAlpha(bg, 0.72),
            padding: 'clamp(24px, 4vw, 40px)',
            boxShadow: R.shadow,
          }}
        >
          <ChapterContent
            content={chapter.content}
            className="ajx-read-txt"
            style={{ fontSize, lineHeight: 1.76, letterSpacing: '0.01em', wordBreak: 'break-word', color: R.ink }}
          />
        </div>

        {/* .view_page 翻页导航(真站: 章节目录 | 首页 | 上一页 ← n → 下一页 | 尾页; 按章推进映射) */}
        <div
          style={{
            marginTop: 10,
            padding: '10px 9px',
            border: `1px solid ${R.line}`,
            borderRadius: 13,
            background: withAlpha('#ffffff', 0.7),
            lineHeight: 1.88,
            fontSize: 16,
            textAlign: 'center',
            color: R.muted,
          }}
          role="navigation"
          aria-label="章节导航"
        >
          <a className="ajx-rl" style={{ color: R.link, cursor: 'pointer', fontWeight: 700 }} onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })} role="button" tabIndex={0} aria-label="返回章节目录">
            章节目录
          </a>
          {'　　'}
          <a
            className="ajx-rl"
            style={navBtn(!!prev)}
            onClick={() => prev && navigate({ view: 'read', chapterId: prev.id })}
            role="button"
            tabIndex={prev ? 0 : -1}
            aria-disabled={!prev}
            aria-label={prev ? `上一章：${prev.title}` : '没有上一章'}
          >
            上一章
          </a>
          {' ← '}
          {`第 ${step} 章`}
          {' → '}
          <a
            className="ajx-rl"
            style={navBtn(!!next)}
            onClick={() => next && navigate({ view: 'read', chapterId: next.id })}
            role="button"
            tabIndex={next ? 0 : -1}
            aria-disabled={!next}
            aria-label={next ? `下一章：${next.title}` : '没有下一章'}
          >
            下一章
          </a>
        </div>

        {/* .view_tips 小提示(真站文案形态 + 同款键盘翻页功能) */}
        <div
          style={{
            marginTop: 10,
            padding: '10px 9px',
            border: `1px dashed ${R.introLine}`,
            borderRadius: 13,
            fontSize: 13,
            textAlign: 'center',
            color: withAlpha(R.muted, 0.86),
          }}
        >
          <b>小提示：</b>如您觉着本文好看，可以通过键盘上的方向键←或→快捷地打开上一章、下一章继续在线阅读。
          也可下载
          <a
            className="ajx-rl"
            href={`/api/public/download?book=${book.id}`}
            style={{ color: R.link }}
            aria-label={`下载《${book.name}》TXT 电子书`}
          >
            {`${book.name}txt电子书`}
          </a>
          到您的看书设备，以获得更快更好的阅读体验！
        </div>

        {/* .footer(渐变 #faefde→#f4e7d3; 书籍信息 + 返回书页) */}
        <div
          style={{
            marginTop: 10,
            marginBottom: 18,
            padding: '12px 10px',
            border: `1px solid ${R.line}`,
            borderRadius: 13,
            background: `linear-gradient(180deg, ${R.footer1} 0%, ${R.footer2} 100%)`,
            fontSize: 14,
            lineHeight: 1.8,
            textAlign: 'center',
            color: R.muted,
          }}
        >
          <div>
            《{book.name}》 作者：{book.author} · {statusLabel(book.status)}
            {book.keywords ? ` · ${book.keywords.split(/[,，、;；\s]+/).filter(Boolean).slice(0, 4).join(' / ')}` : ''}
          </div>
          <div style={{ marginTop: 4 }}>
            <a className="ajx-rl" style={{ color: R.link, cursor: 'pointer', fontWeight: 700 }} onClick={() => navigate({ view: 'book', bookId: book.id })} role="button" tabIndex={0} aria-label={`返回《${book.name}》详情页`}>
              返回书页
            </a>
            {'　·　'}
            <a className="ajx-rl" style={{ color: R.link, cursor: 'pointer', fontWeight: 700 }} onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })} role="button" tabIndex={0} aria-label="查看完整目录">
              章节目录
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
