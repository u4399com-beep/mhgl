// ============================================================
// 小说管理系统 — 主入口 (唯一路由)
// 通过查询串在 后台管理 / 前台站群站点 之间切换:
//   /                → 后台管理
//   /?view=home|book|read|search|keyword|category → 前台站点
//   /?admin=1        → 强制后台
//   /book/*.html / /read/* (伪静态)  → SPA 内由前台 navigate() pushState 产生;
//     Next Router 会同步外部 pushState 并重渲染本 Shell, 故 pathname 为伪静态形态时
//     同样视为前台视图(否则无 view 参数 → 误渲染后台)。
//     直达/刷新由 [...slug]/page.tsx 服务端解析后直渲染 PublicSite。
// 站群: /?view=...&site=<siteId> 指定站点(或按域名自动匹配)
// ============================================================
'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useMemo } from 'react'
import AdminApp from '@/components/admin/AdminApp'
import PublicSite from '@/components/public/PublicSite'
import { LoginGate } from '@/components/admin/LoginGate'
import { parsePrettyPath } from '@/lib/pseudostatic'

function Shell() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  // 伪静态路径识别(纯函数客户端可解析; token→id 的落库解析由 PublicSite 内 resolve API 完成)
  const pretty = useMemo(() => parsePrettyPath(pathname || '/'), [pathname])
  const view = searchParams.get('view')
  const forceAdmin = searchParams.get('admin') === '1'
  const isSite = (!!view || !!pretty) && !forceAdmin

  const publicView = isSite
    ? {
        // 伪静态 pushState 场景: SPA 实例已在前台(PublicSite 同位置同类型复用, initialView 仅首载
        // 生效), 此处仅占位声明视图族, 真实 bookId/chapterId 由既有 state/resolve API 持有
        view: (pretty?.view || view) as 'home' | 'book' | 'read' | 'search' | 'keyword' | 'category' | 'history',
        bookId: searchParams.get('id') || undefined,
        chapterId: searchParams.get('chapter') || undefined,
        q: searchParams.get('q') || undefined,
        tag: searchParams.get('tag') || undefined,
        cat: searchParams.get('cat') || undefined,
        site: searchParams.get('site') || undefined,
        page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
        // 主题预览覆盖(?theme=): 仅首载入口参数, PublicSite 用后即弃不入持久化路由
        theme: searchParams.get('theme') || undefined,
      }
    : undefined

  if (isSite) {
    return (
      <PublicSite
        initialSiteId={publicView?.site}
        initialView={publicView}
        embedMode
        onBack={() => {
          window.location.href = '/?admin=1'
        }}
      />
    )
  }

  return (
    <LoginGate>
      <AdminApp
        onPreviewSite={(themeId) => {
          // 主题卡片"预览前台"携带 themeId → 前台以 ?theme= 覆盖预览对应主题
          // (PublicSite 仅首载入口解析该参数, 站内导航/切站后自然还原站点自身主题)
          window.location.href = themeId ? `/?view=home&theme=${encodeURIComponent(themeId)}` : '/?view=home'
        }}
      />
    </LoginGate>
  )
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400 text-sm">
          正在加载系统…
        </div>
      }
    >
      <Shell />
    </Suspense>
  )
}
