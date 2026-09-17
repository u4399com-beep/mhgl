// ============================================================
// [R28-2d-x9] x2552(吾爱文学网) 章节阅读页克隆 —— 黑冰模板 家族标准(章节页 Wayback 无存档)
// 素材: 真站章节 URL 形态 /html/{x}/{id}/{cid}.html(快照实链佐证); 页面本体无存档 →
//   按黑冰模板家族标准布局(杰奇系 #a_main bdtop/bdsub + h1 居中章名 + 正文 + bottem 三钮, 推断级)。
// 降级: ①真站章内分页(page_box, 无存档) → 按章推进等价映射 ②正文区样式按黑冰系
//   白底 #fff / #666 正文 14px/200% 家族口径(推断级)
// ============================================================
'use client'

import { useEffect } from 'react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { ChapterContent, useReaderFont, useRecordReading, useThemeLineHeight } from '../template-kit'
import { BdSub, BdTop, C } from './_kit'

export function X2552Read({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  const { font, set } = useReaderFont(14, 24)
  // [R36-2a-fix-5] 主题覆盖行距(未编辑=2 零回归)
  const xLh = useThemeLineHeight(2)
  const chapter = data?.chapter ?? null
  const book = data?.book ?? null

  useRecordReading(book?.id, chapter?.id, chapter?.title)

  // 键盘 ←/→ 翻章(真站温馨提示明示按键; editable-target 守卫)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft' && data?.prev) navigate({ view: 'read', bookId: book?.id, chapterId: data.prev.id })
      else if (e.key === 'ArrowRight' && data?.next) navigate({ view: 'read', bookId: book?.id, chapterId: data.next.id })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data?.prev, data?.next, book?.id, navigate])

  return (
    <div style={{ width: '100%', maxWidth: 960, margin: '0 auto', padding: '0 8px' }}>
      <div style={{ height: 8 }} />
      <BdTop />
      <BdSub>
        <dl style={{ margin: 0, padding: '4px 8px 10px', background: '#fff' }}>
          {error ? (
            <dd style={{ margin: 0, padding: '30px 0', textAlign: 'center', color: 'red', fontSize: 13 }}>章节不存在或加载失败：{error}</dd>
          ) : loading && !chapter ? (
            <dd style={{ margin: '6px 0' }}>
              <span className="block h-[26px] w-1/2 animate-pulse" style={{ background: C.face }} />
              <span className="mt-3 block h-[300px] w-full animate-pulse" style={{ background: C.face }} />
            </dd>
          ) : chapter ? (
            <>
              {/* 面包屑(家族标准: 首页->书名->章名) */}
              <dt style={{ lineHeight: '28px', fontSize: 12, color: C.text }}>
                <button type="button" className="x2-a" onClick={() => navigate({ view: 'home' })}>
                  首页
                </button>
                {'->'}
                {book && (
                  <>
                    {' '}
                    <button type="button" className="x2-a" onClick={() => navigate({ view: 'book', bookId: book.id })}>
                      {book.name}
                    </button>
                    {'->'}
                  </>
                )}{' '}
                {chapter.title}
              </dt>
              <dd style={{ margin: 0 }}>
                <h1 style={{ fontSize: 20, lineHeight: '32px', textAlign: 'center', color: C.text, fontWeight: 'bold', margin: '10px 0 6px' }}>
                  {chapter.title}
                </h1>
              </dd>
              {/* 字号控制(14~24, template-kit 同款) */}
              <dd style={{ margin: 0, textAlign: 'center', fontSize: 12, color: C.text }}>
                <button type="button" className="x2-a" onClick={() => set(font - 1)} aria-label="减小字号">
                  A-
                </button>
                <span style={{ margin: '0 10px' }}>{font}px</span>
                <button type="button" className="x2-a" onClick={() => set(font + 1)} aria-label="增大字号">
                  A+
                </button>
              </dd>
              <dd style={{ margin: 0 }}>
                <div
                  style={{ padding: '12px 6px', fontSize: font, lineHeight: xLh, color: C.text }}
                  className="x2-reader"
                >
                  <ChapterContent content={chapter.content} />
                </div>
              </dd>
              {/* bottem 三钮(家族标准: 上一章 | 目录 | 下一章, 居中) */}
              <dd style={{ margin: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 10,
                    borderTop: `1px dashed ${C.border}`,
                    paddingTop: 12,
                    marginTop: 6,
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    className="x2-a"
                    style={BTN}
                    disabled={!data?.prev}
                    onClick={() => data?.prev && navigate({ view: 'read', bookId: book?.id, chapterId: data.prev.id })}
                  >
                    上一章
                  </button>
                  <button
                    type="button"
                    className="x2-a"
                    style={BTN}
                    onClick={() => book && navigate({ view: 'toc', bookId: book.id })}
                  >
                    目录
                  </button>
                  <button
                    type="button"
                    className="x2-a"
                    style={BTN}
                    disabled={!data?.next}
                    onClick={() => data?.next && navigate({ view: 'read', bookId: book?.id, chapterId: data.next.id })}
                  >
                    下一章
                  </button>
                </div>
              </dd>
            </>
          ) : null}
        </dl>
      </BdSub>
    </div>
  )
}

/** [R28-2d-x9] 三钮形态: GRAY_BTN 渐变+边(黑冰灰钮精灵图等价) */
const BTN = {
  height: 28,
  lineHeight: '26px',
  padding: '0 16px',
  fontSize: 12,
  background: 'linear-gradient(180deg, #ffffff 0%, #e5e5e5 100%)',
  border: `1px solid ${C.border}`,
  color: C.link,
  cursor: 'pointer',
} as const
