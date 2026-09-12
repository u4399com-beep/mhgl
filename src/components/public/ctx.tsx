// ============================================================
// 前台站群上下文 — 主题 / 站点 / 站内导航
// ============================================================
'use client'

import { createContext, useContext } from 'react'
import { buildBookPath, buildReadPath, buildViewUrl, sanitizePseudoPreset, type PseudoPreset } from '@/lib/pseudostatic'
import type { ThemeDef } from '@/lib/crawl/themes'
import type { SiteInfo } from './types'

export type PublicView = 'home' | 'book' | 'read' | 'search' | 'keyword' | 'category' | 'history'

export interface ViewParams {
  view: PublicView
  bookId?: string
  chapterId?: string
  q?: string
  tag?: string
  cat?: string
  page?: number
  site?: string
}

export interface PublicCtxValue {
  site: SiteInfo
  sites: SiteInfo[]
  theme: ThemeDef
  /** 伪静态预设(query/numeric/alnum/directory/restful/compact) — 书籍页/阅读页链接形态 */
  pseudoPreset: PseudoPreset
  embedMode: boolean
  /** 站内视图切换（onClick，不做整页跳转），自动同步查询串 */
  navigate: (p: ViewParams) => void
}

const PublicCtx = createContext<PublicCtxValue | null>(null)

export const PublicProvider = PublicCtx.Provider

export function usePublic(): PublicCtxValue {
  const v = useContext(PublicCtx)
  if (!v) throw new Error('PublicSite 上下文缺失')
  return v
}

/** 可选上下文（未挂 Provider 时返回 null，供加载外壳等场景兜底） */
export function usePublicOptional(): PublicCtxValue | null {
  return useContext(PublicCtx)
}

/** 从站点列表取全局伪静态预设(任一行的 pseudoPreset; 非法值回退 query) */
export function presetOfSites(sites: SiteInfo[] | undefined | null): PseudoPreset {
  return sanitizePseudoPreset(sites?.[0]?.pseudoPreset)
}

/**
 * 视图参数 → 站内 URL。
 * 预设≠query 时书籍页/阅读页走伪静态路径(内部查 id→num/idx 注册表, 未命中回退查询串);
 * 其余视图始终查询串形态。
 */
export function viewToUrl(v: ViewParams, siteId: string, preset: PseudoPreset = 'query'): string {
  return buildViewUrl(v, siteId, preset)
}

/** 书籍页规范地址(canonical/JSON-LD 用): 伪静态可用则伪静态, 否则查询串; 恒带 site 参数 */
export function bookCanonicalPath(
  book: { id: string; num?: number | null },
  siteId: string,
  preset: PseudoPreset,
): string {
  const path = buildBookPath(book, preset)
  const base = path || `/?view=book&id=${encodeURIComponent(book.id)}`
  return siteId ? `${base}?site=${encodeURIComponent(siteId)}` : base
}

/** 阅读页规范地址(canonical/JSON-LD 用): 书号/序号齐备则伪静态, 否则按章节 cuid 查询串 */
export function readCanonicalPath(
  book: { num?: number | null },
  chapter: { id: string; idx?: number | null },
  siteId: string,
  preset: PseudoPreset,
): string {
  const path = book.num ? buildReadPath({ id: '', num: book.num }, chapter, preset) : ''
  const base = path || `/?view=read&chapter=${encodeURIComponent(chapter.id)}`
  return siteId ? `${base}?site=${encodeURIComponent(siteId)}` : base
}

const VIEW_LIST: PublicView[] = ['home', 'book', 'read', 'search', 'keyword', 'category', 'history']

/** 查询串 → 视图参数 */
export function parseView(search: string): ViewParams {
  const sp = new URLSearchParams(search)
  const raw = sp.get('view') || 'home'
  const view: PublicView = (VIEW_LIST as string[]).includes(raw) ? (raw as PublicView) : 'home'
  const pageN = Number(sp.get('page')) || 1
  return {
    view,
    bookId: sp.get('id') || undefined,
    chapterId: sp.get('chapter') || undefined,
    q: sp.get('q') || undefined,
    tag: sp.get('tag') || undefined,
    cat: sp.get('cat') || undefined,
    page: pageN > 0 ? pageN : 1,
    site: sp.get('site') || undefined,
  }
}
