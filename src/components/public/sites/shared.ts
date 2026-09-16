// ============================================================
// [R26-c-2] 站点克隆模板共享契约 —— 10 站 × 5 页型(首页/分类页/书页/目录页/章节页)
//
// 目录结构(每站一目录, 文件所有权归各站克隆 agent):
//   sites/{id}/Home.tsx | Category.tsx | Book.tsx | Toc.tsx | Read.tsx | index.ts
//
// 数据获取与 SEO/TDK 一律由通用视图层(HomeView/CategoryView/BookView/TocView/ReadView)
// 统一完成后以 props 下发; 各站模板组件是纯展示层, 内部用 usePublic() 拿 site/theme/navigate。
// ============================================================
'use client'

import type { ComponentType } from 'react'
import type { BooksData, BookDetailData } from '../data'
import type { ChapterData } from '../types'

/** 首页 props —— books = 首页一次拉取的 48 本最新书(fetchBooks 同源), loading = 拉取中 */
export interface SiteHomeProps {
  books: import('../types').BookItem[]
  loading: boolean
}

/** 分类页 props —— data = fetchBooks({cat, page, size:24}) 结果 */
export interface SiteCategoryProps {
  data: BooksData | null
  loading: boolean
  error: string
  /** 分类名(未指定分类时为「全部分类」) */
  catName: string
  /** 分类 id(空 = 全部) */
  cat?: string
  page: number
}

/** 书页(书籍详情) props —— data = fetchBook(bookId, tocPage, 100) 结果 */
export interface SiteBookProps {
  data: BookDetailData | null
  loading: boolean
  error: string
  /** 目录页码(?page=) */
  tocPage: number
  /** ?chapter= 高亮的当前章节 id(从阅读页跳回时) */
  currentChapterId?: string
}

/** 目录页 props —— 独立完整章节列表视图(view=toc), data = fetchBook(bookId, page, 100) */
export interface SiteTocProps {
  data: BookDetailData | null
  loading: boolean
  error: string
  /** 目录页码 */
  page: number
  /** 当前章节 id(高亮) */
  currentChapterId?: string
}

/** 章节页 props —— data = fetchChapter(chapterId) 结果 */
export interface SiteReadProps {
  data: ChapterData | null
  loading: boolean
  error: string
}

/**
 * 每站模板集合(registry.tsx 按 theme.id 索引消费)。
 * css: 站点级克隆 CSS —— PublicSite 在 .clone-{id} 作用域下统一注入;
 *      其中所有选择器必须以 .clone-{id} 开头, 禁止全局污染。
 */
export interface SiteTemplateSet {
  Home: ComponentType<SiteHomeProps>
  Category: ComponentType<SiteCategoryProps>
  Book: ComponentType<SiteBookProps>
  Toc: ComponentType<SiteTocProps>
  Read: ComponentType<SiteReadProps>
  css?: string
}
