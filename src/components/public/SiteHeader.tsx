// ============================================================
// 站点头部 — 站名 + 搜索框(带建议下拉) + 分类导航 + (embedMode)站点切换器
// [R23-II-a-1] 按 theme.vars.headerStyle(=SiteCloneId) 以 IMITATION_HEADERS 映射分发仿站头部子组件;
// [R24-6-a-1] 9 个仿站分支: pili/aijjxs/kks101/qb23(真站实测) + ddyueshu/x2552/huangjinwu/
// ggd66/shipsay(按 /tmp/sites/ 真站 HTML/CSS 实测克隆, 替换 R24-5 占位并删除 CloneHeaderShell/CloneNavBtn);
// [R25-4-8] +trxsw 第 10 分支(杰奇 CMS 经典默认模板, /tmp/r25/trxsw-wb.html 快照复刻)
// [R31-7] 按现有代码块边界机械拆分至 ./header/*(search-suggest 搜索建议共享逻辑 / common 公共件 /
// 十站头部文件 / registry 注册表); 本文件保留同名导出 SiteHeader 作为组合入口, 外部 import 与 API 不变
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteCloneId } from '@/lib/crawl/themes'
import { fetchCategories } from './data'
import { usePublic } from './ctx'
import type { CategoryItem } from './types'
import { HEADER_BOTTOM_BORDER, IMITATION_HEADERS } from './header/registry'

function useCategories() {
  const [cats, setCats] = useState<CategoryItem[]>([])
  // pending 独立于数据：接口失败时也要退出骨架屏，避免导航区永久闪烁
  const [pending, setPending] = useState(true)
  useEffect(() => {
    let alive = true
    fetchCategories()
      .then((list) => {
        if (!alive) return
        setCats(list)
        setPending(false)
      })
      .catch(() => {
        if (!alive) return
        setCats([])
        setPending(false)
      })
    return () => {
      alive = false
    }
  }, [])
  return { cats, pending }
}

export function SiteHeader() {
  const { theme } = usePublic()
  const v = theme.vars
  const { cats, pending } = useCategories()
  const style: SiteCloneId = v.headerStyle

  const Branch = IMITATION_HEADERS[style] || IMITATION_HEADERS.aijjxs
  return (
    <header
      style={{
        background: 'transparent',
        borderBottom: HEADER_BOTTOM_BORDER[style] ? `1px solid ${v.border}` : 'none',
      }}
    >
      <Branch cats={cats} pending={pending} />
    </header>
  )
}
