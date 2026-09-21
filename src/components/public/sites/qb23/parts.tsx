// ============================================================
// [R39-2g] qb23 共享小件 —— 页脚(mxone 暗底形态)
// ============================================================
'use client'

import { usePublic } from '../../ctx'

export function QbFooter() {
  const { site } = usePublic()
  return (
    <footer className="qb-footer">
      <p>{site.name} · 小说免费阅读 · 本站所有小说均由网友上传, 如有侵权请联系删除</p>
    </footer>
  )
}
