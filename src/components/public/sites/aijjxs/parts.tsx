// ============================================================
// [R39-2a] aijjxs 共享小件 —— 页脚(快照 home.html 尾部实测)
//   footer.foot: 网站简介/网站帮助/版权声明/网站地图/友情链接/留言建议 + Copyright 两行
// ============================================================
'use client'

import type { CSSProperties } from 'react'
import { usePublic } from '../../ctx'

export function AijjxsFooter({ v }: { v?: { textMuted?: string; border?: string; paper?: string } }) {
  const { site } = usePublic()
  const links = ['网站简介', '网站帮助', '版权声明', '网站地图', '友情链接', '留言建议']
  const style: CSSProperties = {
    borderTop: `1px solid ${v?.border || '#e5dccd'}`,
    padding: '18px 14px 30px',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 2,
    color: v?.textMuted || '#6b7280',
    background: v?.paper || '#fffdf8',
  }
  return (
    <footer className="ajx-ft" style={style}>
      <div>
        {links.map((l, i) => (
          <span key={l}>
            <a href="#" onClick={(e) => e.preventDefault()} style={{ margin: '0 8px' }}>{l}</a>
            {i < links.length - 1 ? <span aria-hidden>·</span> : null}
          </span>
        ))}
      </div>
      <div>Copyright © {site.name} All Rights Reserved</div>
      <div>本站所有小说电子书均系网友上传，仅供书友之间免费下载预览！</div>
    </footer>
  )
}
