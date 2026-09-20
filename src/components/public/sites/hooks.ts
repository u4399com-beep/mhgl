// ============================================================
// [R35-2d-1] 站点克隆模板「alive-guard 客户端拉取」钩子族 —— 原 12 处逐字节重复的
//   useState+useEffect(alive 竞态守卫)收敛为单处定义, 逐字节等价语义:
//   挂载/依赖变更时拉取; 卸载(或依赖变更)先置 alive=false → 不再 setState;
//   成功 settle 为 pick 结果, 失败 settle 为回退值(各钩子与原文件同口径)。
// 消费方均为站点模板('use client' 展示层); 主体数据仍由通用视图层 props 下发,
// 此处仅为克隆侧增强拉取(热榜池/分类条/友链)的共享机械部分。
// [R49-3-2] useRelatedBooks 删除: 原 trxsw·ggd66 Read 两处消费点随 R49-2a trxsw 33yq 家族
//   重写消失, ts-prune+rg 双确认零引用。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import { fetchBooks, fetchCategories, fetchFooterLinks, type FooterFriendLink } from '../data'
import type { BookItem, CategoryItem } from '../types'

/** 分类条拉取(失败回退空数组) —— trxsw/Category·Fulltext, shipsay/Category·Fulltext, ggd66/Category 五处共用 */
export function useSiteCats(): CategoryItem[] | null {
  const [cats, setCats] = useState<CategoryItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchCategories()
      .then((d) => {
        if (alive) setCats(d || [])
      })
      .catch(() => {
        if (alive) setCats([])
      })
    return () => {
      alive = false
    }
  }, [])
  return cats
}

/** 字数热榜书池 60 本(失败回退空数组) —— x2552·huangjinwu Home, ddyueshu/Ranking, trxsw·shipsay Home 五处共用 */
export function useWordsPool(siteId: string): BookItem[] | null {
  const [pool, setPool] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBooks({ site: siteId, sort: 'words', page: 1, size: 60 })
      .then((d) => {
        if (alive) setPool(d.books || [])
      })
      .catch(() => {
        if (alive) setPool([])
      })
    return () => {
      alive = false
    }
  }, [siteId])
  return pool
}

/** 页脚友链(空数组初值, 失败保持空数组) —— trxsw·shipsay Home 两处共用 */
export function useFooterLinks(): FooterFriendLink[] {
  const [links, setLinks] = useState<FooterFriendLink[]>([])
  useEffect(() => {
    let alive = true
    fetchFooterLinks()
      .then((d) => {
        if (alive) setLinks(d?.friend || [])
      })
      .catch(() => {
        if (alive) setLinks([])
      })
    return () => {
      alive = false
    }
  }, [])
  return links
}
