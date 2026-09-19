// ============================================================
// [R43-2] x33yq(33言情) 克隆阅读页 —— 快照 /tmp/r43-snap/read.html(/read/396391/260443126.html 直连实抓)
//   源站结构: .content_read > .box_con > .con_top 面包屑(站名 > 分类 > 书名 > 章节名) + .toolbar
//     (ul.tools: li.theme 主题模式 7 色板 + li.size 字体大小 -/18/+ + li.reset 恢复默认;
//      ul.links: 作者) + .zhangjieming(h1 章节名 + .bottem1 投票/上一章/目录/下一章/书签)
//     + #content 段落正文 + p.bottem 尾部翻页
//   平台接入: useReaderFont(字号增减, 源站默认 18) / useThemeLineHeight / useRecordReading / 键盘 ←/→ 翻章
//   降级声明: 源站 read.css 未在素材内 → 工具条/正文样式按 common/style.css 实测同族值组合;
//     主题色板 7 色取自源站实测底色族(#FFFFFF/#555555/#FEF9EF/#FFF9D9/#E9FAFF/#F7FBFD/#E1ECED);
//     投推荐票/加入书签为源站登录交互不克隆。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { ChapterContent, useReaderFont, useRecordReading, useThemeFontBase, useThemeLineHeight } from '../template-kit'
import { ErrorState, Sk } from '../../bits'

// 主题色板(源站 li.theme 7 色板形态; 色值取自源站实测底色族, read.css 缺失 → 近似映射)
const BG_PRESETS: Array<{ key: string; label: string; bg: string; ink: string }> = [
  { key: 'day', label: '日光', bg: '#FFFFFF', ink: '#555555' },
  { key: 'night', label: '夜间', bg: '#555555', ink: '#E9FAFF' },
  { key: 'pink', label: '粉红', bg: '#FEF9EF', ink: '#555555' },
  { key: 'yellow', label: '护眼', bg: '#FFF9D9', ink: '#555555' },
  { key: 'blue', label: '淡蓝', bg: '#E9FAFF', ink: '#555555' },
  { key: 'green', label: '淡绿', bg: '#F7FBFD', ink: '#555555' },
  { key: 'gray', label: '灰色', bg: '#E1ECED', ink: '#555555' },
]

export function X33yqRead({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  const chapter = data?.chapter ?? null
  const book = data?.book ?? null
  const prev = data?.prev ?? null
  const next = data?.next ?? null
  // [R43-2] 主题覆盖字号基线(源站 #fontsize 默认 18)+行距; 字号增减走通用 localStorage 键
  const base = useThemeFontBase(18)
  const reader = useReaderFont(14, 26)
  const lh = useThemeLineHeight(2)
  const [bg, setBg] = useState(BG_PRESETS[0])

  useRecordReading(book?.id, chapter?.id, chapter?.title)

  // 键盘 ←/→ 翻章(输入态守卫)
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

  if (error) {
    return <div className="xq-read"><ErrorState message="章节内容加载失败" detail={error} /></div>
  }
  if (loading || !chapter || !book) {
    return (
      <div className="xq-read" role="status" aria-label="章节内容加载中">
        <Sk style={{ height: 48, maxWidth: 974, margin: '10px auto', borderRadius: 0 }} />
        <Sk style={{ height: 420, maxWidth: 974, margin: '10px auto', borderRadius: 0 }} />
        <span className="sr-only">加载中…</span>
      </div>
    )
  }

  const goto = (cid?: string) => { if (cid) navigate({ view: 'read', chapterId: cid }) }

  return (
    <div className="xq-read">
      <div className="xq-content-read">
        <div className="xq-box-con">
          {/* 面包屑(源站 .con_top: 站名 &gt; 分类 &gt; 书名 &gt; 章节名) */}
          <div className="xq-con-top">
            <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>33言情</a>
            {' &gt; '}
            <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: book.id }) }}>{book.name}</a>
            {' &gt; '}{chapter.title}
          </div>
          {/* 工具条(源站 .toolbar: 主题模式/字体大小/恢复默认 + 作者) */}
          <div className="xq-toolbar">
            <ul className="xq-tools">
              <li className="xq-theme">
                <p>主题模式：</p>
                {BG_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className="xq-swatch"
                    style={{ backgroundColor: p.bg }}
                    title={p.label}
                    aria-label={`主题模式：${p.label}`}
                    aria-pressed={bg.key === p.key}
                    onClick={() => setBg(p)}
                  />
                ))}
              </li>
              <li className="xq-size">
                <p>字体大小：</p>
                <button type="button" className="xq-size-btn" aria-label="减小字号" onClick={reader.dec}>-</button>
                <p id="xq-fontsize">{reader.font}</p>
                <button type="button" className="xq-size-btn" aria-label="增大字号" onClick={reader.inc}>+</button>
              </li>
              <li className="xq-reset">
                <button
                  type="button"
                  className="xq-size-btn"
                  style={{ width: 'auto', padding: '0 8px' }}
                  onClick={() => { reader.set(base); setBg(BG_PRESETS[0]) }}
                >恢复默认</button>
              </li>
            </ul>
            <div className="xq-links">
              <p>作者：<i>{book.author}</i></p>
            </div>
            <div className="xq-clear" />
          </div>
          {/* 章节名 + 上/目录/下(源站 .zhangjieming + .bottem1) */}
          <div className="xq-zhangjieming">
            <h1>{chapter.title}</h1>
            <div className="xq-bottem1">
              <a href="#" onClick={(e) => { e.preventDefault(); goto(prev?.id) }} aria-disabled={!prev}>上一章</a>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'toc', bookId: book.id }) }}>章节目录</a>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: book.id }) }}>返回书页</a>
              <a href="#" onClick={(e) => { e.preventDefault(); goto(next?.id) }} aria-disabled={!next}>下一章</a>
            </div>
          </div>
          <div id="xq-content" style={{ backgroundColor: bg.bg, color: bg.ink }}>
            <div style={{ fontSize: reader.font, lineHeight: lh }}>
              <ChapterContent content={chapter.content} />
            </div>
          </div>
          {/* 尾部翻页(源站 p.bottem) */}
          <div className="xq-bottem1" style={{ paddingBottom: 14 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); goto(prev?.id) }} aria-disabled={!prev}>上一章</a>
            <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'toc', bookId: book.id }) }}>章节目录</a>
            <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: book.id }) }}>返回书页</a>
            <a href="#" onClick={(e) => { e.preventDefault(); goto(next?.id) }} aria-disabled={!next}>下一章</a>
          </div>
        </div>
      </div>
    </div>
  )
}
