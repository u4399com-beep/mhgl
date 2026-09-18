// ============================================================
// [R39-2a] aijjxs 克隆章节阅读页 —— 快照 /tmp/r39-snap/aijjxs/read2.html(/read/47/57384/2.html 实抓) + css-read.css(13KB)
//   真站结构(body.read-v3, 渐变底):
//     div.view_top 工具条(.sk_gb 面板): 「背景」#skbglist 色板 .c.c1..c6 + 「字号」#fonts .s.s1..s5
//       + 「字体」select#ffamily + 「字体颜色」#yanse #ys_menu(黑/红/绿/蓝/棕) + 「双击滚屏」提示
//     div.view_t: h1「{书名}  {章节名}」 + .view_intro「作者 · 分类 · 大小 · 年月」
//     div.view_content > div#view_content_txt > p 段落(text-indent 2.4em, 首段不缩进)
//     div.view_page 上下章翻页(章尾)
//   平台接入点: 键盘 ←/→ 翻章(真站 pageEvent 37/39) / useReaderFont 主题覆盖基线 /
//     useThemeLineHeight(R36-2a-fix) / useRecordReading 阅读记忆
//   色板(真站 css-read.css 实测): c1 #cde4ff c2 #d8d8d8 c3 #cfe7d4 c4 #f2e7ab c5 #f8f8f8 c6 #f4ced6;
//     字号 .s 边 #d8cab7 圆角 8 字色 #6f4f34, 激活 #fbe8ce/#d8a366/#80410f; 颜色菜单 红 #8c1f19 绿 #2c6b33 蓝 #174f8d 棕 #6e4a2f 黑 #27231f
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { ChapterContent, useReaderFont, useRecordReading, useThemeLineHeight } from '../template-kit'
import { ErrorState, Sk } from '../../bits'

// 真站字号 5 档 → useReaderFont.set 映射(真站 fontsize(1..5): 小/中/大/加大/极大)
const FS_STEPS = [14, 17, 20, 22, 24]
// 真站背景色板(c1..c6)
const BG_SWATCHES = [
  { cls: 'c1', color: '#cde4ff' },
  { cls: 'c2', color: '#d8d8d8' },
  { cls: 'c3', color: '#cfe7d4' },
  { cls: 'c4', color: '#f2e7ab' },
  { cls: 'c5', color: '#f8f8f8' },
  { cls: 'c6', color: '#f4ced6' },
]
// 字体颜色菜单(真站 #ys_menu)
const INK_MENU = [
  { id: 'hei', label: '黑色', color: '#27231f' },
  { id: 'red', label: '红色', color: '#8c1f19' },
  { id: 'lv', label: '绿色', color: '#2c6b33' },
  { id: 'blue', label: '蓝色', color: '#174f8d' },
  { id: 'zong', label: '棕色', color: '#6e4a2f' },
]
const FONT_FAMILIES = [
  { label: '默认', value: '' },
  { label: '宋体', value: '"SimSun","Songti SC",serif' },
  { label: '雅黑', value: '"Microsoft YaHei","PingFang SC",sans-serif' },
  { label: '楷体', value: '"KaiTi","Kaiti SC",serif' },
  { label: '黑体', value: '"SimHei","Heiti SC",sans-serif' },
]

export function AijjxsRead({ data, loading, error }: SiteReadProps) {
  const { navigate, themeOverride } = usePublic()
  const chapter = data?.chapter ?? null
  const book = data?.book ?? null
  const prev = data?.prev ?? null
  const next = data?.next ?? null
  // [R36-2a-fix] 主题覆盖字号基线 + 行距(admin 未编辑=17/1.76 零回归)
  const reader = useReaderFont()
  const ajxLh = useThemeLineHeight(1.76)
  // 真站工具条状态
  const [bg, setBg] = useState('#f8f8f8')
  const [ink, setInk] = useState('#27231f')
  const [family, setFamily] = useState('')
  const [fsIdx, setFsIdx] = useState(1)

  // [R39-2a] 阅读位置/时长记忆(平台接入点, 同 legacy)
  useRecordReading(book?.id, chapter?.id, chapter?.title)

  // 键盘 ←/→ 翻章(真站 pageEvent: key==37/39; 输入态守卫对齐通用 ReadView)
  useEffect(() => {
    if (!book) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft' && prev) navigate({ view: 'read', chapterId: prev.id })
      if (e.key === 'ArrowRight' && next) navigate({ view: 'read', chapterId: next.id })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [book, prev, next, navigate])

  const pageMax = 'min(920px, calc(100% - 24px))'
  const shellStyle = { background: 'linear-gradient(180deg, #f3efe7 0%, #faf6ec 100%)', minHeight: '60vh' } as const

  if (error) {
    return <div className="ajx-read" style={{ ...shellStyle, padding: '40px 15px' }}><ErrorState message="章节内容加载失败" detail={error} /></div>
  }
  if (loading || !chapter || !book) {
    return (
      <div className="ajx-read" style={{ ...shellStyle, padding: '14px 15px 24px' }} role="status" aria-label="章节内容加载中">
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <Sk style={{ height: 56, borderRadius: 14, marginBottom: 10 }} />
          <Sk style={{ height: 64, borderRadius: 14, marginBottom: 10 }} />
          <Sk style={{ height: 420, borderRadius: 16 }} />
          <span className="sr-only">加载中…</span>
        </div>
      </div>
    )
  }

  const goto = (cid?: string) => { if (cid) navigate({ view: 'read', chapterId: cid }) }

  return (
    <div className="ajx-read" style={shellStyle}>
      {/* 工具条 view_top */}
      <div className="ajx-view-top" style={{ maxWidth: pageMax, margin: '10px auto 0' }}>
        <div className="ajx-sk-gb">
          <div className="ajx-duset">
            <b>背景</b>
            <span className="ajx-skbglist" role="group" aria-label="背景色">
              {BG_SWATCHES.map((s) => (
                <a
                  key={s.cls}
                  className={`ajx-c ${bg === s.color ? 'is-active' : ''}`}
                  style={{ background: s.color }}
                  href="#"
                  onClick={(e) => { e.preventDefault(); setBg(s.color) }}
                  aria-label={`背景 ${s.cls}`}
                />
              ))}
            </span>
            <b>字号</b>
            <span className="ajx-fonts" role="group" aria-label="字号">
              {FS_STEPS.map((n, i) => (
                <a
                  key={n}
                  className={`ajx-s${fsIdx === i ? ' is-active' : ''}`}
                  href="#"
                  onClick={(e) => { e.preventDefault(); setFsIdx(i); reader.set(n) }}
                >{['小', '中', '大', '加大', '极大'][i]}</a>
              ))}
            </span>
            <b>字体</b>
            <select className="ajx-ffamily" value={family} onChange={(e) => setFamily(e.target.value)} aria-label="字体">
              {FONT_FAMILIES.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
            </select>
            <b>字体颜色</b>
            <span className="ajx-ys" role="group" aria-label="字体颜色">
              {INK_MENU.map((m) => (
                <a key={m.id} className={ink === m.color ? 'is-active' : ''} style={{ color: m.color }} href="#" onClick={(e) => { e.preventDefault(); setInk(m.color) }}>{m.label}</a>
              ))}
            </span>
            <b>双击滚屏</b>
            <span className="ajx-dushint">(再次双击停止滚屏)</span>
          </div>
        </div>
      </div>
      {/* 标题 view_t */}
      <div className="ajx-view-t" style={{ maxWidth: pageMax, margin: '10px auto 0' }}>
        <h1>{book.name}&nbsp;&nbsp;{chapter.title}</h1>
        <div className="ajx-view-intro">{book.author} · {(book as { category?: string }).category || '小说'}</div>
      </div>
      {/* 正文 view_content */}
      <div className="ajx-view-content" style={{ maxWidth: pageMax, margin: '10px auto 0' }}>
        <div
          id="view_content_txt"
          className="ajx-read-txt"
          style={{ fontSize: reader.font, lineHeight: ajxLh, color: ink, fontFamily: family || undefined, background: bg }}
        >
          <ChapterContent content={chapter.content} />
        </div>
      </div>
      {/* 翻页 view_page(真站 上一页/目录/下一页 按钮组) */}
      <div className="ajx-view-page" style={{ maxWidth: pageMax, margin: '10px auto 24px' }}>
        <button className="ajx-rl" disabled={!prev} onClick={() => goto(prev?.id)}>上一章</button>
        <button className="ajx-rl" onClick={() => navigate({ view: 'toc', bookId: book.id })}>目录</button>
        <button className="ajx-rl" disabled={!next} onClick={() => goto(next?.id)}>下一章</button>
      </div>
      {/* 键盘提示(无障碍) */}
      <p className="sr-only">{themeOverride ? '已应用主题阅读设置' : ''}</p>
    </div>
  )
}
