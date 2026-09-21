// ============================================================
// [R39-2j] pili 共享小件 —— 页脚(wmcms 深棕底白字)
// ============================================================
'use client'

import { usePublic } from '../../ctx'

export function PiliFooter() {
  const { site } = usePublic()
  return (
    <footer className="pli-footer">
      <p>{site.name} · 小说免费阅读 · 本站所有小说均由网友上传, 如有侵权请联系删除</p>
    </footer>
  )
}
