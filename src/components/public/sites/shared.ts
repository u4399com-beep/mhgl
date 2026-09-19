// ============================================================
// [R28-0] 站点克隆模板共享契约 —— 10 站 × 8 页型
//   基础五视图(必实现): 首页 Home / 分类页 Category / 书页 Book / 目录页 Toc / 章节页 Read
//   扩展三视图(按真站有无选实现): 排行榜 Ranking / 全本·完本 Fulltext / 搜索结果页 Search
//
// 目录结构(每站一目录, 文件所有权归各站克隆 agent):
//   sites/{id}/Home.tsx | Category.tsx | Book.tsx | Toc.tsx | Read.tsx
//              | Ranking.tsx? | Fulltext.tsx? | Search.tsx? | index.ts
//
// 数据获取与 SEO/TDK 一律由通用视图层(HomeView/CategoryView/BookView/TocView/ReadView/
// RankingView/FulltextView/SearchView)统一完成后以 props 下发; 各站模板组件是纯展示层,
// 内部用 usePublic() 拿 site/theme/navigate。
// ============================================================
'use client'

import type { ComponentType } from 'react'
import type { BooksData, BookDetailData } from '../data'
import type { ChapterData, SearchData } from '../types'
import type { BookItem } from '../types'
// [R28-2] re-export: 克隆模板(Ranking 等)直接从本契约取 BookItem 类型
export type { BookItem } from '../types'

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

// ---------------- [R28-0] 扩展三视图(按真站有无选实现, 无则视图壳走通用兜底) ----------------

/** 排行榜榜单排序键(与 /api/public/books sort 白名单一致) */
export type RankingSort = 'words' | 'latest' | 'new'

/** 单个榜单(真站榜单页常见多榜并列: 点击/收藏/推荐/字数/更新榜; 数据面可用的三类) */
export interface RankingBoard {
  key: RankingSort
  /** 榜单名(更新榜/字数榜/新书榜) */
  label: string
  books: BookItem[]
  total: number
}

/** 排行榜页 props —— boards = RankingView 并行拉取的三榜(每榜 top60) */
export interface SiteRankingProps {
  boards: RankingBoard[]
  /** 当前激活榜(RankingView 内部 state, 深链不进 URL) */
  active: RankingSort
  /** 榜 tab 点击回调(切榜; 视图壳内部 state, 不走路由) */
  onBoard: (key: RankingSort) => void
  loading: boolean
  error: string
}

/** 全本·完本页 props —— data = fetchBooks({status:'completed', page, size:24}) 结果 */
export interface SiteFulltextProps {
  data: BooksData | null
  loading: boolean
  error: string
  page: number
}

/** 搜索结果页 props —— data = fetchSearch(q) 结果(仅有 q 时接管; 空态搜索首页仍由通用壳呈现) */
export interface SiteSearchProps {
  q: string
  data: SearchData | null
  loading: boolean
  error: string
}

/**
 * 每站模板集合(registry.tsx 按 theme.id 索引消费)。
 * css: 站点级克隆 CSS —— PublicSite 在 .clone-{id} 作用域下统一注入;
 *      其中所有选择器必须以 .clone-{id} 开头, 禁止全局污染。
 * Footer: [R41-2] 站点克隆页脚 —— 源站页脚 1:1 仿制(逐站结构/文案/配色对齐真站快照);
 *      缺省走通用 SiteFooter(未接入克隆页脚的站点)。
 */
export interface SiteTemplateSet {
  Home: ComponentType<SiteHomeProps>
  Category: ComponentType<SiteCategoryProps>
  Book: ComponentType<SiteBookProps>
  Toc: ComponentType<SiteTocProps>
  Read: ComponentType<SiteReadProps>
  /** [R28-0] 排行榜页(真站有榜单页才实现; 缺省走 RankingView 通用兜底) */
  Ranking?: ComponentType<SiteRankingProps>
  /** [R28-0] 全本·完本页(真站有完本列表页才实现; 缺省走 FulltextView 通用兜底) */
  Fulltext?: ComponentType<SiteFulltextProps>
  /** [R28-0] 搜索结果页(真站有搜索页才实现; 缺省走 SearchView 通用兜底) */
  Search?: ComponentType<SiteSearchProps>
  /** [R41-2] 克隆页脚(真站页脚 1:1 仿制; 缺省走通用 SiteFooter) */
  Footer?: ComponentType
  css?: string
}
