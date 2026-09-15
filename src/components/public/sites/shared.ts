// ============================================================
// [R24-5] 站点克隆首页共享契约 —— 9 个 {Site}Home 组件统一 props 与数据口径。
//   books = 首页一次拉取的 48 本最新书(与旧布局同源 fetchBooks), loading = 拉取中。
//   组件内部用 usePublic() 拿 site/theme/navigate, 各站自绘「与真站一模一样」的首页结构。
// ============================================================
'use client'

import type { BookItem } from '../types'

export interface SiteHomeProps {
  books: BookItem[]
  loading: boolean
}
