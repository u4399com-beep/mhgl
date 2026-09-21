// ============================================================
// [R28-2f] kks101 克隆章节阅读页 —— 复刻真站 /txt/{book}/{chap}.html
//   快照: /tmp/r28-2b/kks101/read.html(355 行) + style.css。
//
//   真站结构(container#container > .mybox, read.html L41-252):
//     ① h3.mytitle.hide720 面包屑(首頁>分類>目錄頁> 章节名, <720px 隐藏)
//     ② .tools 工具条(ul 右对齐, 圆形图标钮 36px #4c5356): 書頁/收藏/目錄/設置/黑夜
//        (style.css L2226-2250; <720px 变为底部固定深条 #424e52)
//     ③ .txtnav 正文区: h1 章名(居中 20px) + .txtinfo(时间 + 作者, 居中 14px)
//        + #txtcontent(段落 lh2 / padding 10px 0 / text-indent 5%, L2251-2274)
//     ④ .page1 翻页条(4 等分: 上一章/書籤/目錄/下一章, #f2f3f4 底 #e4e4e4 边框,
//        a lh48px 分隔线, hover #f8f8f8, L2340-2366)
//     ⑤ .yuedutuijian 阅读推荐列表(li: 书名 #222 + 右侧 連載 状态)
//     ⑥ .setbox 设置面板(背景 5 圆点 / 字體 4 档 / 字號 input+- / 語速; L2115-2202)
//     黑夜模式 body.black: .mybox rgb(32,40,46) 文字 rgb(153,153,153),
//     .page1 a #474b4e hover #3a3e41(L2093-2104, L2368-2379)
//
//   降级/推断说明:
//   ① .tools「收藏」(addbookcase 会员态) → 不渲染; 書頁/目錄/設置/黑夜 四钮保留真站排布
//   ② .page1 真站 4 钮含「書籤」(addbookcase 章节書籤) → 无契约, 保留 上一章/目錄/下一章
//      三钮等分布局; 键盘 ←/→ 翻章与真站提示语一致
//   ③ .setbox 仅实现「字號」一档(契约共享阅读字号键 14-24, 默认 17; 真站默认 22);
//      背景 5 圆点(色值由 JS 注入, 快照不可提取)由「黑夜」按钮承担暗色;
//      字體 4 档(雅黑/粉圓/手寫/鋼筆为远端字体)与「語速」朗读无契约 → 不渲染
//   ④ .txtinfo 真站显示「更新时间 + 作者」; ChapterData 无时间字段 → 仅作者;
//      面包屑真站为「首頁>分類>目錄頁>章名」, ChapterData 无分类字段 → 以
//      「首頁>書名>目錄頁>章名」承接(推断级)
//   ⑤ 正文内 .chase-book-btn 追更广告钮组与 .txtad 广告位 → 不渲染
//   ⑥ 阅读推荐列表(#tuijian ajax 加载)契约无对应 → 以最近更新榜前 15 本近似,
//      块名沿用真站「閱讀推薦」字样(推断级)
// ============================================================
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import { ErrorState, Sk } from '../../bits'
import { ChapterContent, useReaderFont, useRecordReading, useThemeLineHeight } from '../template-kit'
import type { BookItem } from '../../types'
import { K, KContainer, cardStyle, MyTitle, kkStatus } from './parts'

/** [R28-2f-22] 真站 .tools 图标钮(36px 圆形 #4c5356, style.css L2233-2244) */
function ToolBtn({ label, glyph, onClick }: { label: string; glyph: string; onClick?: () => void }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="kkx-toolbtn"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          background: 'none',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          color: K.ink,
          fontSize: 14,
        }}
      >
        <span aria-hidden style={{ display: 'block', background: '#4c5356', color: '#fff', borderRadius: 100, width: 36, height: 36, textAlign: 'center', lineHeight: '36px', fontSize: 17 }}>
          {glyph}
        </span>
        <span className="kkx-toolbtn-txt">{label}</span>
      </button>
    </li>
  )
}

export function Kks101Read({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  const { font, inc, dec } = useReaderFont()
  // [R36-2a-fix-5] 主题覆盖行距(未编辑=2 零回归)
  const kLh = useThemeLineHeight(2)
  const [night, setNight] = useState(false)
  const [setOpen, setSetOpen] = useState(false)
  const [recommends, setRecommends] = useState<BookItem[]>([])

  const chapter = data?.chapter ?? null
  const book = data?.book ?? null

  // [R28-2f-23] 阅读位置/时长记忆(阅读页模板挂载一次)
  useRecordReading(book?.id, chapter?.id, chapter?.title)

  // [R28-2f-24] 阅读推荐数据(最近更新榜前 15, 近似, 见说明⑥)
  useEffect(() => {
    let alive = true
    fetchBooks({ sort: 'latest', page: 1, size: 15 })
      .then((d) => {
        if (alive) setRecommends(d.books)
      })
      .catch(() => {
        /* 推荐拉取失败静默 */
      })
    return () => {
      alive = false
    }
  }, [])

  // [R28-2f-25] 键盘 ←/→ 翻章(与真站 .view_tips 提示语同款交互)
  const goPrev = useCallback(() => {
    if (data?.prev) navigate({ view: 'read', bookId: book?.id, chapterId: data.prev.id })
  }, [data, book, navigate])
  const goNext = useCallback(() => {
    if (data?.next) navigate({ view: 'read', bookId: book?.id, chapterId: data.next.id })
  }, [data, book, navigate])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext])

  if (error) {
    return (
      <KContainer>
        <div className="kkx-mybox" style={cardStyle}>
          <ErrorState message="章節內容加載失敗" detail={error} />
        </div>
      </KContainer>
    )
  }
  if (loading || !chapter || !book) {
    return (
      <KContainer>
        <div className="kkx-mybox" style={cardStyle} role="status" aria-label="章節內容加載中">
          <Sk className="h-7 w-1/2 mx-auto" style={{ borderRadius: 3, marginBottom: 14 }} />
          <Sk className="h-4 w-1/3 mx-auto" style={{ borderRadius: 3, marginBottom: 22 }} />
          {Array.from({ length: 8 }).map((_, i) => (
            <Sk key={i} className="h-4 w-full" style={{ borderRadius: 2, marginBottom: 10 }} />
          ))}
        </div>
      </KContainer>
    )
  }

  const boxStyle: CSSProperties = night
    ? { ...cardStyle, background: K.night, color: K.nightText }
    : cardStyle
  const txtStyle: CSSProperties = { lineHeight: kLh, fontSize: font, wordWrap: 'break-word', color: night ? K.nightText : K.ink }
  const pageBtn: CSSProperties = {
    width: '100%',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: '48px',
    background: 'none',
    border: 0,
    borderRight: '1px solid rgba(191,191,191,.24)',
    cursor: 'pointer',
    color: night ? '#fff' : K.ink,
  }

  return (
    <KContainer>
      <div className={`kkx-mybox kkx-readbox${night ? ' kkx-black' : ''}`} style={boxStyle}>
        {/* ① 面包屑(<720px 由 css 隐藏) */}
        <MyTitle>
          <span className="kkx-hide720">
            <span style={{ fontSize: 14, fontWeight: 400, color: K.ink }}>
              <button type="button" onClick={() => navigate({ view: 'home' })} className="kkx-bread-a" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 14, color: K.primary }}>首頁</button>
              {' > '}
              <button type="button" onClick={() => navigate({ view: 'book', bookId: book.id })} className="kkx-bread-a" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 14, color: K.primary }}>{book.name}</button>
              {' > '}
              <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id })} className="kkx-bread-a" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 14, color: K.primary }}>目錄頁</button>
              {' > '}
              <span>{chapter.title}</span>
            </span>
          </span>
        </MyTitle>

        {/* ② .tools 工具条 */}
        <div className="kkx-tools" style={{ padding: '10px 0 0', marginBottom: -8 }}>
          <ul style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 18, listStyle: 'none', margin: 0, padding: 0, flexWrap: 'wrap' }}>
            <ToolBtn label="書頁" glyph="📖" onClick={() => navigate({ view: 'book', bookId: book.id })} />
            <ToolBtn label="目錄" glyph="📑" onClick={() => navigate({ view: 'toc', bookId: book.id })} />
            <ToolBtn label="設置" glyph="⚙️" onClick={() => setSetOpen((v) => !v)} />
            <ToolBtn label={night ? '白天' : '黑夜'} glyph={night ? '☀️' : '🌙'} onClick={() => setNight((v) => !v)} />
          </ul>
        </div>

        {/* ③ .txtnav 正文 */}
        <div className="kkx-txtnav" style={{ padding: '0 30px' }}>
          <h1 style={{ textAlign: 'center', fontSize: 20, padding: 10, margin: 0, color: night ? '#fff' : K.ink, overflowWrap: 'anywhere' }}>{chapter.title}</h1>
          <div className="kkx-txtinfo kkx-hide720" style={{ textAlign: 'center', fontSize: 14, paddingBottom: 15, color: night ? K.nightText : K.muted }}>
            <span>作者： {book.author}</span>
          </div>
          {/* #txtcontent */}
          <div id="kkx-txtcontent" style={txtStyle}>
            <ChapterContent content={chapter.content} style={txtStyle} />
          </div>
        </div>

        {/* ⑥ .setbox 设置面板(仅字号, 见说明③) */}
        {setOpen ? (
          <div className="kkx-setbox" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 0, width: 'min(500px, 100%)', background: '#fff', zIndex: 60, borderRadius: '5px 5px 0 0', boxShadow: K.cardShadow, padding: '40px 30px 30px' }}>
            <button
              type="button"
              onClick={() => setSetOpen(false)}
              className="kkx-setclose"
              style={{ position: 'absolute', right: 0, top: 0, padding: 15, background: 'none', border: 0, cursor: 'pointer', fontSize: 14, color: K.link }}
            >
              關閉
            </button>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              <li style={{ display: 'flex', alignItems: 'center', padding: '10px 0', gap: 10 }}>
                <label style={{ width: 50, flexShrink: 0, color: '#888', fontSize: 14 }}>字號</label>
                <div className="kkx-setfontsize" style={{ position: 'relative', flex: 1 }}>
                  <input className="kkx-sizenum" type="text" value={font} readOnly aria-label="當前字號" style={{ width: '100%', textAlign: 'center', border: `1px solid ${K.line}`, lineHeight: '30px', fontSize: 15, color: K.ink }} />
                  <button type="button" onClick={dec} aria-label="縮小字號" style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '33%', border: 0, borderRight: `1px solid ${K.line}`, background: 'none', cursor: 'pointer', fontSize: 16, color: K.ink }}>-</button>
                  <button type="button" onClick={inc} aria-label="放大字號" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '33%', border: 0, borderLeft: `1px solid ${K.line}`, background: 'none', cursor: 'pointer', fontSize: 16, color: K.ink }}>+</button>
                </div>
              </li>
            </ul>
          </div>
        ) : null}

        {/* ④ .page1 翻页条(三钮: 書籤降级说明②) */}
        <div className="kkx-page1" style={{ background: K.bg, borderRadius: 3, display: 'flex', alignItems: 'center', overflow: 'hidden', border: '1px solid #e4e4e4', marginTop: 14 }}>
          <button type="button" onClick={goPrev} disabled={!data?.prev} className="kkx-page1-a" style={{ ...pageBtn, cursor: data?.prev ? 'pointer' : 'default', opacity: data?.prev ? 1 : 0.45 }}>上一章</button>
          <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id })} className="kkx-page1-a" style={pageBtn}>目錄</button>
          <button type="button" onClick={goNext} disabled={!data?.next} className="kkx-page1-a" style={{ ...pageBtn, borderRight: 'none', cursor: data?.next ? 'pointer' : 'default', opacity: data?.next ? 1 : 0.45 }}>下一章</button>
        </div>
      </div>

      {/* ⑤ .yuedutuijian 阅读推荐(真站白底列表块) */}
      <div className="kkx-mybox" style={{ ...cardStyle, background: '#fff' }}>
        <MyTitle>閱讀推薦</MyTitle>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {recommends.map((b) => (
            <li key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, borderBottom: `1px solid ${K.line}`, padding: '10px 0' }}>
              <button
                type="button"
                onClick={() => navigate({ view: 'book', bookId: b.id })}
                className="kkx-yd-name"
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 15, color: '#222', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}
              >
                {b.name}
              </button>
              <span style={{ color: K.dim, fontSize: 13, flexShrink: 0 }}>{kkStatus(b)}</span>
            </li>
          ))}
          {recommends.length === 0 ? (
            <Sk className="h-10 w-full" style={{ borderRadius: 2 }} />
          ) : null}
        </ul>
      </div>
    </KContainer>
  )
}

