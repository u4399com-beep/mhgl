// ============================================================
// [R39-2h] huangjinwu 共享小件 —— 页脚(:root --footer-bg #e2eaf5)
// ============================================================
'use client'

import { usePublic } from '../../ctx'

export function HjwFooter() {
  const { site } = usePublic()
  return (
    <footer className="hjw-footer">
      <p>{site.name} · 小说免费阅读 · 本站所有内容均由网友上传, 如有侵权请联系删除</p>
    </footer>
  )
}
