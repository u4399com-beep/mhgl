// ============================================================
// [R39-2d] ddyueshu 共享小件 —— 页脚(biquge.css #footer: 980px 居中 10px 顶部距 文本居中)
// ============================================================
'use client'

import { usePublic } from '../../ctx'

export function DdyFooter() {
  const { site } = usePublic()
  return (
    <footer id="ddy-footer">
      <div>{site.name} · 精品小说免费阅读</div>
      <div>本站所有小说均由网友上传，如有侵权请联系删除。若侵犯了您的权益，请通知我们，我们会及时删除侵权内容。</div>
    </footer>
  )
}
