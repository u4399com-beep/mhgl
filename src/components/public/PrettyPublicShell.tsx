// ============================================================
// 伪静态路径客户端壳 — 服务端解析结果 → PublicSite
// (server component 不能直接传函数 prop, onBack 在此客户端壳内定义)
// ============================================================
'use client'

import PublicSite from './PublicSite'

interface PrettyView {
  view: 'book' | 'read'
  bookId: string
  chapterId?: string
  page?: number
  site?: string
}

export default function PrettyPublicShell({ siteId, view }: { siteId?: string; view: PrettyView }) {
  return (
    <PublicSite
      initialSiteId={siteId}
      initialView={{ ...view }}
      embedMode
      onBack={() => {
        window.location.href = '/?admin=1'
      }}
    />
  )
}
