// ============================================================
// [R49-2a-4] R49 全页重克隆: trxsw 真站已由 2019 杰奇版换为「唐人小说网」33yq 家族模板(与 x33yq 同族同源,
//   实抓 /tmp/r49-snap/trxsw/ 2026-09-20: home/category/book/toc/read/lastupdate/goodnum + 33yq.css 20033B +
//   read.css 8614B —— 与 x33yq common/style/read.css 逐值一致), 全套组件由 x33yq 已校准实现移植 + 站点文案替换。
// [R43-2] x33yq(33言情 原始注释, 移植自) 克隆阅读页 —— 快照 /tmp/r43-snap/read.html(/read/396391/260443126.html 直连实抓)
//   源站结构: .content_read > .box_con > .con_top 面包屑(站名 > 分类 > 书名 > 章节名) + .toolbar
//     (ul.tools: li.theme 主题模式 7 色板 + li.size 字体大小 -/18/+ + li.reset 恢复默认;
//      ul.links: 作者) + .zhangjieming(h1 章节名 + .bottem1 投票/上一章/目录/下一章/书签)
//     + #content 段落正文 + p.bottem 尾部翻页
//   平台接入: useReaderFont(字号增减) / useThemeLineHeight / useRecordReading / 键盘 ←/→ 翻章
//   [R43-2v] 复核轮: read.css + common.js 已实抓, 全量按实测对齐:
//     ① 主题色板真实值(read.css .night/.pink/.yellow/.blue/.green/.gray): body/center/ink 三层
//        day=站点默认(#E9FAFF/白/#333) night=#222/#111/#999 pink=#fff5f8/#f5e4e4/#7f333d
//        yellow=#f2e8c8/#ddcda1 blue=#dfecf0/#cedce0 green=#e3efe3/#d0e2d0 gray=#e0e0e0/#cfcfcf
//     ② 色板锚为 18×18 白底阴影方块, 激活态画 #fe4e30 对勾(源站无底色)
//     ③ 字号基线 24(common.js size() 默认 24, 页内静态 18 为陈旧标记), 步长 ±2, 范围 10-50
//     ④ 正文 95% 宽 24px 字距 0.2em 行高 150%; 上下章链墨绿 #085308 纯文本; 恢复默认绿钮 #0d8f72
//     ⑤ 投推荐票/加入书签为源站登录交互不克隆, 以「返回书页」功能性替代
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { ChapterContent, useReaderFont, useRecordReading, useThemeFontBase, useThemeLineHeight } from '../template-kit'
import { ErrorState, Sk } from '../../bits'

// 主题色板(read.css .night/.pink/.yellow/.blue/.green/.gray 实测: body 底/center 底/正文墨色三层)
const BG_PRESETS: Array<{ key: string; label: string; body: string; center: string; ink: string }> = [
  { key: 'day', label: '日光', body: '#E9FAFF', center: '#FFFFFF', ink: '#333333' },
  { key: 'night', label: '夜间', body: '#222222', center: '#111111', ink: '#999999' },
  { key: 'pink', label: '粉红', body: '#fff5f8', center: '#f5e4e4', ink: '#7f333d' },
  { key: 'yellow', label: '护眼', body: '#f2e8c8', center: '#ddcda1', ink: '#333333' },
  { key: 'blue', label: '淡蓝', body: '#dfecf0', center: '#cedce0', ink: '#333333' },
  { key: 'green', label: '淡绿', body: '#e3efe3', center: '#d0e2d0', ink: '#333333' },
  { key: 'gray', label: '灰色', body: '#e0e0e0', center: '#cfcfcf', ink: '#333333' },
]

export function TrxswRead({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  const chapter = data?.chapter ?? null
  const book = data?.book ?? null
  const prev = data?.prev ?? null
  const next = data?.next ?? null
  // [R43-2v] 主题覆盖字号基线(common.js size() 默认 24)+行距(read.css #content 行高 150%);
  //   字号增减走通用 localStorage 键, 步长 ±2 范围 10-50 对齐源站
  const base = useThemeFontBase(24)
  const reader = useReaderFont(10, 50)
  const lh = useThemeLineHeight(1.5)
  const [bg, setBg] = useState(BG_PRESETS[0])
  const inc = () => reader.set(Math.min(50, reader.font + 2))
  const dec = () => reader.set(Math.max(10, reader.font - 2))
  const reset = () => { reader.set(base); setBg(BG_PRESETS[0]) }

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
    return <div className="trx-read"><ErrorState message="章节内容加载失败" detail={error} /></div>
  }
  if (loading || !chapter || !book) {
    return (
      <div className="trx-read" role="status" aria-label="章节内容加载中">
        <Sk style={{ height: 48, maxWidth: 980, margin: '10px auto', borderRadius: 0 }} />
        <Sk style={{ height: 420, maxWidth: 980, margin: '10px auto', borderRadius: 0 }} />
        <span className="sr-only">加载中…</span>
      </div>
    )
  }

  const goto = (cid?: string) => { if (cid) navigate({ view: 'read', chapterId: cid }) }

  return (
    <div
      className={bg.key === 'night' ? 'trx-read trx-night' : 'trx-read'}
      style={{ backgroundColor: bg.body }}
    >
      <div className="trx-content-read">
        <div className="trx-box-con" style={{ backgroundColor: bg.center }}>
          {/* 面包屑(源站 .con_top: 站名 > 分类 > 书名 > 章节名; JSX 字符串内用字面 ' > ') */}
          <div className="trx-con-top">
            <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>唐人小说网</a>
            {' > '}
            <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: book.id }) }}>{book.name}</a>
            {' > '}{chapter.title}
          </div>
          {/* 工具条(源站 .toolbar: 主题模式/字体大小/恢复默认 + 作者) */}
          <div className="trx-toolbar">
            <ul className="trx-tools">
              <li className="trx-theme">
                <p>主题模式：</p>
                {BG_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={bg.key === p.key ? 'trx-swatch on' : 'trx-swatch'}
                    title={p.label}
                    aria-label={`主题模式：${p.label}`}
                    aria-pressed={bg.key === p.key}
                    onClick={() => setBg(p)}
                  />
                ))}
              </li>
              <li className="trx-size">
                <p>字体大小：</p>
                <button type="button" className="trx-size-btn" aria-label="减小字号" onClick={dec}>-</button>
                <p id="trx-fontsize">{reader.font}</p>
                <button type="button" className="trx-size-btn" aria-label="增大字号" onClick={inc}>+</button>
              </li>
              <li className="trx-reset">
                <button
                  type="button"
                  className="trx-reset-btn"
                  onClick={reset}
                >恢复默认</button>
              </li>
            </ul>
            <div className="trx-links">
              <p>作者：<i>{book.author}</i></p>
            </div>
            <div className="trx-clear" />
          </div>
          {/* 章节名 + 上/目录/下(源站 .zhangjieming + .bottem1) */}
          <div className="trx-zhangjieming">
            <h1>{chapter.title}</h1>
            <div className="trx-bottem1">
              <a href="#" onClick={(e) => { e.preventDefault(); goto(prev?.id) }} aria-disabled={!prev}>上一章</a>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'toc', bookId: book.id }) }}>章节目录</a>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: book.id }) }}>返回书页</a>
              <a href="#" onClick={(e) => { e.preventDefault(); goto(next?.id) }} aria-disabled={!next}>下一章</a>
            </div>
          </div>
          <div id="trx-content" style={{ color: bg.ink }}>
            <div style={{ fontSize: reader.font, lineHeight: lh }}>
              <ChapterContent content={chapter.content} />
            </div>
          </div>
          {/* 尾部翻页(源站 p.bottem: 上虚线界) */}
          <div className="trx-bottem1 trx-bottem-b">
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
