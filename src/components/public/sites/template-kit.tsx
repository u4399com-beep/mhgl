// ============================================================
// [R26-c-3] 站点克隆模板工具箱 —— 各站 {Page}.tsx 模板组件共用的阅读侧小件
// (字号调节 / 阅读位置记忆 / 章节正文渲染 / 分卷分组), 让 10 站模板不必各自复制这些逻辑。
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { contentToHtml } from '../read-layouts/shared'
import { getReadTimeMs, saveReadPos, setReadTimeMs } from '../read-layouts/reading-memory'
import type { TocChapter } from '../types'

const READER_FONT_KEY = 'public_reader_fontSize'

function readStoredFont(): number {
  if (typeof window === 'undefined') return 17
  try {
    const n = Number(window.localStorage.getItem(READER_FONT_KEY))
    return Number.isFinite(n) && n >= 14 && n <= 24 ? n : 17
  } catch {
    return 17
  }
}

/**
 * 章节页字号调节(localStorage 与通用阅读器同一键, 用户偏好互通)。
 * 返回当前字号(px)与放大/缩小回调; 模板里 A+/A- 按钮直接接 inc/dec。
 */
export function useReaderFont(min = 14, max = 24): { font: number; inc: () => void; dec: () => void; set: (n: number) => void } {
  const [font, setFont] = useState(readStoredFont)
  useEffect(() => {
    try {
      window.localStorage.setItem(READER_FONT_KEY, String(font))
    } catch {
      /* 隐私模式忽略 */
    }
  }, [font])
  return {
    font,
    inc: () => setFont((s) => Math.min(max, s + 1)),
    dec: () => setFont((s) => Math.max(min, s - 1)),
    set: (n: number) => setFont(Math.min(max, Math.max(min, n))),
  }
}

/**
 * 阅读位置与时长记忆 —— 章节页模板挂一次即可:
 * - 滚动 debounce 300ms 写 saveReadPos(bookId, {chapterId, scrollRatio, title}) [R27-5b-L5 标准防抖]
 * - 阅读时长按可见段累计(10s 采样, 后台标签页不计), setReadTimeMs(bookId, ...) [R27-5b-L5]
 */
export function useRecordReading(bookId?: string, chapterId?: string, title?: string): void {
  useEffect(() => {
    if (!bookId || !chapterId || typeof window === 'undefined') return
    let timer = 0
    const base = getReadTimeMs(bookId)
    // [R27-5b-L5] 阅读时长改按可见段累计: 修前 10s 心跳不看 visibilityState(后台标签页也
    // 累计时长, 与通用 useReadingTimeTracker 的可见判定不一致)且按墙钟 Date.now()-t0 结算
    let visibleMs = 0
    let lastTickAt = Date.now()
    const onScroll = () => {
      // [R27-5b-L5] 标准防抖(重置式): 修前 if (timer) return 为节流, 停止滚动落在 pending
      // 窗内时尾部事件可能不落盘; 改后停滚 300ms 后一次落盘最终位置(滚动中读写合并)
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = 0
        const doc = document.documentElement
        const max = doc.scrollHeight - window.innerHeight
        const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
        // saveReadPos 为四参位置签名(内部保留 readTimeMs), 时长另由 setReadTimeMs 累计
        saveReadPos(bookId, chapterId, ratio, title || '')
      }, 300)
    }
    const tick = window.setInterval(() => {
      const now = Date.now()
      if (document.visibilityState === 'visible') visibleMs += now - lastTickAt
      lastTickAt = now
      setReadTimeMs(bookId, base + visibleMs)
    }, 10_000)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (timer) window.clearTimeout(timer)
      window.clearInterval(tick)
      if (document.visibilityState === 'visible') visibleMs += Date.now() - lastTickAt
      setReadTimeMs(bookId, base + visibleMs)
    }
  }, [bookId, chapterId, title])
}

/**
 * 章节正文渲染 —— 内部走 contentToHtml(段落规整 + 客户端 XSS 消毒),
 * 容器样式由模板按真站规格传入(通常: 固定栏宽 + 行高 + 段距)。
 */
export function ChapterContent({ content, style, className }: { content: string; style?: CSSProperties; className?: string }) {
  // [R30-5-4] 消毒管道缓存: contentToHtml(段落规整+客户端 XSS 消毒)对数十 KB 章节开销显著,
  // 而 useReaderFont 字号增减会触发本组件重渲染 —— 不 memo 则每次调字号都重跑整章正则管道。
  // content 引用稳定时(章节未切换)直接复用消毒产物。
  const html = useMemo(() => contentToHtml(content), [content])
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />
}

/**
 * 目录分卷分组(与通用 BookView 同口径): 连续相同 volume 一组, 空卷归「正文」。
 * 无卷数据返回 null(模板渲染平铺列表)。
 */
export function groupTocVolumes(chapters: TocChapter[]): { volume: string; chapters: TocChapter[] }[] | null {
  if (!chapters.some((c) => c.volume)) return null
  const gs: { volume: string; chapters: TocChapter[] }[] = []
  for (const c of chapters) {
    const vol = c.volume || ''
    const last = gs[gs.length - 1]
    if (last && last.volume === vol) last.chapters.push(c)
    else gs.push({ volume: vol, chapters: [c] })
  }
  return gs
}
