// ============================================================
// [R26-3-5] kks101(101看書) 章节阅读页克隆 —— 按 https://101kks.com/txt/99/{cid}.html 真站快照逐节还原
// (/tmp/r26/kks101-read.html + kks101-style.css 实测)
//
// 真站 DOM(.container#container > .mybox):
//   ├ h3.mytitle.hide720 > .bread  面包屑 首頁 > 分類 > 目錄頁 > 章節名(≤720px 隐藏整行)
//   ├ .tools > ul                  工具条: 書頁/收藏/目錄/設置/黑夜(li i 图标圆 36px/圆角 100px/底 #4c5356/白字 20px;
//   │                              桌面只显圆钮, 移动端为底部固定条 → 模板取圆钮行, 右对齐, aria-label 全配)
//   ├ .txtnav(padding 0 30px/line-height 2)
//   │    ├ h1 章节标题(text-align center/20px/padding 10px)
//   │    ├ .txtinfo.hide720        来源行(text-align center/14px/pb 15px; 真站: 更新时间 + 作者： 佚名
//   │    │                         → 模板无章节时间字段, 以 全文字数 + 作者 替代, 注释声明)
//   │    └ #txtcontent             正文(段 p: line-height 2/padding 10px 0/text-indent 5%/word-wrap break-word)
//   └ .page1                       上一章 | 書籤 | 目錄 | 下一章(底 #f2f3f4/边 1px #e4e4e4/圆角 3px/flex;
//                                  a 均分 16px/line-height 48px/右边线 rgb(191 191 191 / 24%)/hover #f8f8f8)
// 工具条映射: 書頁→书页视图 · 目錄→toc 视图 · A-/A+→useReaderFont(真站设置弹层 .setbox 的字号项) ·
//            夜間→真站 setbg() 黑夜模式(本地态翻色, 不动全站主题)。
// 差异声明: ①書籤(登录态 addbookcase)不渲染 ②追更/聽書按钮列(chase-book-btn 广告位)为运营位不克隆
//           ③正文下方 .yuedutuijian 推荐列表为外链书墙, 契约外不渲染。
// ============================================================
'use client'

import { useState } from 'react'
import { BookOpen, ListOrdered, Minus, Moon, Plus, Sun } from 'lucide-react'
import type { SiteReadProps } from '../shared'
import { usePublic } from '../../ctx'
import { ChapterContent, useReaderFont, useRecordReading } from '../template-kit'
import { ErrorState, Sk } from '../../bits'

/** [R26-3-5] 真站实测色值(kks101-style.css) */
const BLUE = '#1f6cb2'
const PAGE1_BG = '#f2f3f4' // .page1 底(与 body 同色)
const NIGHT_BG = '#22282b' // 夜间态容器底(真站 setbg 深灰系)
const NIGHT_TEXT = '#b8bcc0' // 夜间态文字

export function Kks101Read({ data, loading, error }: SiteReadProps) {
  const { navigate } = usePublic()
  const { font, inc, dec } = useReaderFont()
  // 真站 setbg() 黑夜/白天切换(容器内局部翻色)
  const [night, setNight] = useState(false)

  // [R26-3-5] 阅读位置/时长记忆(hooks 顺序: 挂载即调, data 未就绪时内部自守)
  useRecordReading(data?.book?.id, data?.chapter?.id, data?.chapter?.title)

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1112px] px-4 py-10 sm:px-6">
        <ErrorState message="章節載入失敗" detail={error} />
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="mx-auto w-full max-w-[1112px] px-4 pb-10 sm:px-6" aria-label="章节加载中">
        <div className="kks-mybox">
          <div className="flex justify-end gap-3 pb-2" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <Sk key={i} className="h-9 w-9 rounded-full" />
            ))}
          </div>
          <Sk className="mx-auto mb-4 h-6 w-2/3" />
          <Sk className="mx-auto mb-6 h-3.5 w-1/3" />
          <div className="space-y-3 px-1 sm:px-[30px]">
            {Array.from({ length: 10 }).map((_, i) => (
              <Sk key={i} className="h-4 w-full" style={{ opacity: 1 - i * 0.06 }} />
            ))}
          </div>
          <span className="sr-only">加载中…</span>
        </div>
      </div>
    )
  }

  const { chapter, book, prev, next } = data
  const cell = 'kks-page1-cell min-w-0 flex-1 text-[16px]'

  return (
    <div className="mx-auto w-full max-w-[1112px] px-4 pb-10 sm:px-6">
      <div className="kks-mybox transition-colors duration-300" style={night ? { background: NIGHT_BG, color: NIGHT_TEXT } : { color: '#333' }}>
        {/* ===== 面包屑(真站 .hide720 ≤720px 隐藏) ===== */}
        <div className="kks-mytitle hidden sm:block">
          <div className="kks-bread text-[14px] font-normal">
            <button type="button" onClick={() => navigate({ view: 'home' })} className="text-[14px] transition-colors hover:underline" style={{ color: BLUE }} aria-label="返回首頁">
              首頁
            </button>
            <span className="mx-1 text-[#999]">&gt;</span>
            <button
              type="button"
              onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}
              className="text-[14px] transition-colors hover:underline"
              style={{ color: BLUE }}
              aria-label={`返回《${book.name}》目錄`}
            >
              目錄頁
            </button>
            <span className="mx-1 text-[#999]">&gt;</span>
            <span className="text-[#333]">{chapter.title}</span>
          </div>
        </div>

        {/* ===== .tools 工具条(圆钮 36px #4c5356, 右对齐) ===== */}
        <div className="mb-1 flex flex-wrap justify-end gap-2 sm:gap-3" role="toolbar" aria-label="閱讀工具">
          <button type="button" onClick={() => navigate({ view: 'book', bookId: book.id })} className="kks-tool" aria-label="返回書頁" title="書頁">
            <BookOpen className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })} className="kks-tool" aria-label="返回目錄" title="目錄">
            <ListOrdered className="h-4 w-4" aria-hidden />
          </button>
          {/* 真站 .setbox 设置层字号项 → A-/A+ 直调 */}
          <button type="button" onClick={dec} disabled={font <= 14} className="kks-tool" style={{ opacity: font <= 14 ? 0.45 : undefined }} aria-label="縮小字號" title="A-">
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={inc} disabled={font >= 24} className="kks-tool" style={{ opacity: font >= 24 ? 0.45 : undefined }} aria-label="放大字號" title="A+">
            <Plus className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={() => setNight((s) => !s)} className="kks-tool" aria-label={night ? '切換白天模式' : '切換黑夜模式'} title={night ? '白天' : '黑夜'}>
            {night ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
          </button>
        </div>

        {/* ===== .txtnav 正文区 ===== */}
        <article className="px-0 sm:px-[30px]" style={{ lineHeight: 2, wordWrap: 'break-word' }}>
          <h1 className="p-2.5 text-center text-[20px]" style={{ fontWeight: 700 }}>
            {chapter.title}
          </h1>
          {/* .txtinfo 来源行(真站: 时间 + 作者; 模板无章节时间 → 全文字数 + 作者) */}
          <div className="pb-[15px] text-center text-[14px]" style={{ color: night ? NIGHT_TEXT : '#757575' }}>
            <span className="mr-4">{chapter.wordCount > 0 ? `全文字數：${chapter.wordCount}` : ''}</span>
            <span>作者： {book.author}</span>
          </div>
          {/* #txtcontent: 段落规格(p line-height 2/padding 10px 0/text-indent 5%)走 css 字符串 .kks-txt p */}
          <ChapterContent content={chapter.content} className="kks-txt" style={{ fontSize: font }} />
        </article>

        {/* ===== .page1 底部导航(上一章/書頁/目錄/下一章 均分 4 格) ===== */}
        <nav aria-label="章節導航" className="kks-page1 mt-1 flex overflow-hidden rounded-[3px]" style={{ background: night ? '#2c3338' : PAGE1_BG, border: night ? '1px solid #3a4247' : '1px solid #e4e4e4' }}>
          <button
            type="button"
            onClick={() => prev && navigate({ view: 'read', chapterId: prev.id })}
            disabled={!prev}
            className={cell}
            style={{ opacity: prev ? undefined : 0.4, color: night ? NIGHT_TEXT : '#333' }}
            aria-label="上一章"
          >
            上一章
          </button>
          <button
            type="button"
            onClick={() => navigate({ view: 'book', bookId: book.id })}
            className={cell}
            style={{ color: night ? NIGHT_TEXT : '#333' }}
            aria-label="返回書頁"
          >
            書頁
          </button>
          <button
            type="button"
            onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}
            className={cell}
            style={{ color: night ? NIGHT_TEXT : '#333' }}
            aria-label="返回目錄"
          >
            目錄
          </button>
          <button
            type="button"
            onClick={() => next && navigate({ view: 'read', chapterId: next.id })}
            disabled={!next}
            className={cell}
            style={{ opacity: next ? undefined : 0.4, color: night ? NIGHT_TEXT : '#333' }}
            aria-label="下一章"
          >
            下一章
          </button>
        </nav>
      </div>
    </div>
  )
}
