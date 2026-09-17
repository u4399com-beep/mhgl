// ============================================================
// [R28-2a] aijjxs 克隆章节阅读页 —— 复刻真站 /read/47/{bid}/{n}.html
//   (快照 /tmp/r28-2a/aijjxs/aijjxs-chapter.html + skin/yellow/read.css 全量实抓实测;
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
//     .footer(渐变 #faefde→#f4e7d3) — PublicSite 站点页脚已统一渲染 → 不重复渲染
//   body.read-v3 背景渐变 #efe6d8→#eadfcf(全局头部之下由本组件铺底)。
//
//   降级/推断说明:
//   ① 真站背景换肤作用于全页(backcolor 写 cookie); 本站作用于正文/标题/翻页面板局部
//   ② 真站「字体」下拉/字体颜色/双击滚屏无数据契约 → 不渲染
//   ③ .view_intro 元信息「分类/日期」ChapterData 无对应字段 → 作者 · 字数 · 章序
//   ④ 真站翻页为章内分页(本文共 238 页) → 契约按章推进, 等价映射上一章/下一章
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, Sk } from '../../bits'
import { formatWords } from '../../seo'
import { ChapterContent, useReaderFont, useRecordReading, useThemeLineHeight } from '../template-kit'

// [R28-2a-21] 真站 read.css :root 实测色值(阅读页专属暖羊皮纸色系, 硬编码)
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

/** [R28-2a-22] 真站 #skbglist 6 色板(名称/色值均为 read.css + 页面 title 属性实测) */
const BG_SWATCHES: { name: string; color: string; cls: string }[] = [
  { name: '蓝色回忆', color: '#cde4ff', cls: 'c1' },
  { name: '灰色天空', color: '#d8d8d8', cls: 'c2' },
  { name: '青山不老', color: '#cfe7d4', cls: 'c3' },
  { name: '粉红世家', color: '#f4ced6', cls: 'c6' },
  { name: '明黄清俊', color: '#f2e7ab', cls: 'c4' },
  { name: '雪白世界', color: '#f8f8f8', cls: 'c5' },
]

/** [R28-2a-23] 字号 5 档 → useReaderFont.set 映射(真站 fontsize(1..5): 小/中/大/加大/极大) */
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
  // [R36-2a-fix-5] 主题覆盖行距(未编辑=1.76 零回归)
  const ajxLh = useThemeLineHeight(1.76)
  // [R28-2a-24] 正文底色(真站 backcolor(1..6) 全页换肤; 本站作用于正文/翻页面板, 默认纸白)
  const [bg, setBg] = useState<string>(R.paper)

  // [R28-2a-25] 阅读位置/时长记忆(阅读页挂一次)
  useRecordReading(book?.id, chapter?.id, chapter?.title)

  // [R28-2a-26] 键盘 ←/→ 翻章(真站 pageEvent: key==37/39 location=prevpage/nextpage)
  useEffect(() => {
    if (!book) return
    const onKey = (e: KeyboardEvent) => {
      // 输入框/文本域聚焦时不翻章(与通用 ReadView isEditableTarget 守卫对齐)
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

  const activeStep = FONT_STEPS.reduce((acc, s, i) => (reader.font >= s.px ? i : acc), 1)

  // [R28-2a-27] 面板公共形态(read.css .view_* 共用 radius 13~16 + var(--shadow))
  const panelBox: CSSProperties = {
    marginTop: 10,
    border: `1px solid ${R.line}`,
    borderRadius: 14,
    boxShadow: R.shadow,
    background: bg,
  }

  return (
    <div
      className="ajx-read"
      style={{ minHeight: '60vh', padding: '14px 15px 24px', background: `linear-gradient(180deg, ${R.bgTop} 0%, ${R.bgBottom} 100%)`, color: R.ink, fontFamily: '"微软雅黑", Microsoft Yahei, simsun, arial, sans-serif' }}
    >
      <div className="mx-auto w-full" style={{ maxWidth: R.pageMax }}>
        {/* .view_top > .sk_gb 工具条 */}
        <div className="ajx-sk-gb" role="toolbar" aria-label="阅读设置" style={{ border: `1px solid ${R.line}`, borderRadius: 14, background: R.panel, padding: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 16px', boxShadow: R.shadow, marginTop: 10 }}>
          <span className="ajx-duset" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, color: R.muted, fontSize: 14 }}>
            <b style={{ fontWeight: 700 }}>背景</b>
            <span id="skbglist" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {BG_SWATCHES.map((s) => (
                <button
                  key={s.cls}
                  type="button"
                  title={s.name}
                  aria-label={`背景 ${s.name}`}
                  onClick={() => setBg(s.color)}
                  className={`ajx-swatch${bg === s.color ? ' is-active' : ''}`}
                  style={{ display: 'inline-flex', width: 18, height: 18, borderRadius: 999, border: '1px solid rgba(0,0,0,.25)', background: s.color, cursor: 'pointer', padding: 0 }}
                />
              ))}
            </span>
          </span>
          <span className="ajx-duset" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, color: R.muted, fontSize: 14 }}>
            <b style={{ fontWeight: 700 }}>字号</b>
            <span id="fonts" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {FONT_STEPS.map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => reader.set(s.px)}
                  className={`ajx-fs${reader.font === s.px ? ' is-active' : ''}`}
                  aria-pressed={reader.font === s.px}
                  style={{
                    display: 'inline-block',
                    padding: '1px 7px',
                    border: `1px solid ${reader.font === s.px ? '#d8a366' : '#d8cab7'}`,
                    borderRadius: 8,
                    marginRight: 2,
                    color: reader.font === s.px ? '#80410f' : '#6f4f34',
                    background: reader.font === s.px ? '#fbe8ce' : '#fff',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                  data-step={i}
                >
                  {s.label}
                </button>
              ))}
            </span>
            <button type="button" onClick={reader.dec} className="ajx-fs" aria-label="缩小字号" style={{ display: 'inline-block', padding: '1px 9px', border: '1px solid #d8cab7', borderRadius: 8, color: '#6f4f34', background: '#fff', fontSize: 13, cursor: 'pointer' }}>
              A-
            </button>
            <button type="button" onClick={reader.inc} className="ajx-fs" aria-label="放大字号" style={{ display: 'inline-block', padding: '1px 9px', border: '1px solid #d8cab7', borderRadius: 8, color: '#6f4f34', background: '#fff', fontSize: 13, cursor: 'pointer' }}>
              A+
            </button>
            <span aria-hidden style={{ color: R.muted, fontSize: 12 }}>
              当前 {reader.font}px / 默认 {FONT_STEPS[activeStep]?.label ?? '中'}
            </span>
          </span>
        </div>

        {/* .view_t 标题面板 */}
        <div
          className="ajx-view-t"
          style={{
            marginTop: 10,
            padding: '16px 13px 12px',
            borderRadius: 14,
            border: `1px solid ${R.titleBorder}`,
            background: 'linear-gradient(180deg, #fffcf5, #f8eddd)',
            boxShadow: R.shadow,
            textAlign: 'center',
          }}
        >
          <h1 style={{ margin: 0, fontSize: 'clamp(16px, 2.1vw, 22px)', lineHeight: 1.42, fontWeight: 700, letterSpacing: '0.02em', color: R.ink }}>
            {book.name}{'\u3000'}{chapter.title}
          </h1>
          <div style={{ marginTop: 9, paddingTop: 9, borderTop: `1px dashed ${R.introLine}`, fontSize: 13, lineHeight: 1.82, color: R.muted }}>
            {book.author} · {formatWords(chapter.wordCount)} · 第 {chapter.idx + 1} 章
          </div>
        </div>

        {/* .view_content 正文面板 */}
        <div className="ajx-view-content" style={{ ...panelBox, borderRadius: 16, background: bg, padding: 'clamp(24px, 4vw, 40px)' }}>
          <ChapterContent content={chapter.content} className="ajx-read-txt" style={{ fontSize: reader.font, lineHeight: ajxLh, letterSpacing: '0.01em', wordBreak: 'break-word' }} />
        </div>

        {/* .view_page 翻页导航(真站章内分页 → 等价按章推进, 降级声明④) */}
        <div className="ajx-view-page" style={{ ...panelBox, borderRadius: 13, lineHeight: 1.88, fontSize: 16, textAlign: 'center', padding: '10px 9px' }}>
          <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id })} className="ajx-rl" style={{ background: 'none', border: 0, padding: '0 6px', cursor: 'pointer', color: R.link, fontSize: 16 }}>
            章节目录
          </button>
          {' | '}
          <button type="button" disabled={!prev} onClick={() => prev && navigate({ view: 'read', chapterId: prev.id })} className="ajx-rl" style={{ background: 'none', border: 0, padding: '0 6px', cursor: prev ? 'pointer' : 'default', color: prev ? R.link : '#b7a893', fontSize: 16, opacity: prev ? 1 : 0.6 }}>
            上一章
          </button>
          {' ← '}
          <b style={{ color: R.ink }}>{chapter.idx + 1}</b>
          {' → '}
          <button type="button" disabled={!next} onClick={() => next && navigate({ view: 'read', chapterId: next.id })} className="ajx-rl" style={{ background: 'none', border: 0, padding: '0 6px', cursor: next ? 'pointer' : 'default', color: next ? R.link : '#b7a893', fontSize: 16, opacity: next ? 1 : 0.6 }}>
            下一章
          </button>
        </div>

        {/* .view_tips 小提示 */}
        <div
          className="ajx-view-tips"
          style={{ marginTop: 10, padding: '10px 9px', border: `1px dashed ${R.introLine}`, borderRadius: 13, textAlign: 'center', fontSize: 13, color: R.muted, lineHeight: 1.8 }}
        >
          <b>小提示：</b>如您觉着本文好看，可以通过键盘上的方向键←或→快捷地打开上一章、下一章继续在线阅读。
          也可通过书籍页的「电子书下载地址」下载 TXT 到您的看书设备，以获得更快更好的阅读体验！
        </div>
      </div>
    </div>
  )
}

