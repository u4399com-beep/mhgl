// ============================================================
// [R41-C-8] trxsw(同人小说网) 源站 1:1 仿制页脚 —— Wayback 版(真站不可达)
// 素材出处: Wayback 2019-10-19 首页快照(R28 实测, /tmp/r28-2g/snap/tx-home.html; R25-1/
//   R27-6b 同源 DOM 复核)。真站 2019 年后不可达(美国出口 IP 限制, R40-1 四通道实测)
//   → 按 R28 考据记录实现: 杰奇 CMS 默认模板 .footer 版权组标准; 配色=R39 themes.ts
//   继承记录(页脚区 #f5f5f5 底 / 顶边 1px solid #e5e5e5 / 灰 #999 / 12px / 链接 #666;
//   b.css 无存档 → 家族标准级, 同 index.ts 头注三级标注口径)
// 源站结构(杰奇默认模板页脚标准):
//   <div id="firendlink">友情链接：…</div>
//   <div class="footer">
//     <p>本站所有小说为转载作品，所有章节均由网友上传，转载至本站只是为了宣传本书让更多读者欣赏。</p>
//     <p>Copyright © 2019 同人小说网 All Rights Reserved.</p>
//   </div>
// 降级声明: #firendlink 友链块由 Home.tsx 页内动态渲染(fetchFooterLinks, 快照实测位于
//   页脚上方) → 本组件不重复渲染, 免首页双友链块; 链接 #666 口径随块留页内, 本页脚无链接
// 站名动态: usePublic().site.name(考据值=同人小说网); 年份按快照逐字节固定 2019
// 版心: 该站 960px(index.ts 头注) → max-width:960 + width:100% 响应式, 375px 无横滚
// ============================================================
'use client'

import { usePublic } from '../../ctx'

export function TrxswFooter() {
  const { site } = usePublic()
  return (
    <footer style={{ background: '#f5f5f5', borderTop: '1px solid #e5e5e5' }}>
      <div style={{ maxWidth: 960, width: '100%', margin: '0 auto', padding: '12px 10px', boxSizing: 'border-box', textAlign: 'center', color: '#999', fontSize: 12 }}>
        <p style={{ margin: 0, lineHeight: '20px' }}>本站所有小说为转载作品，所有章节均由网友上传，转载至本站只是为了宣传本书让更多读者欣赏。</p>
        <p style={{ margin: 0, lineHeight: '20px' }}>Copyright © 2019 {site.name} All Rights Reserved.</p>
      </div>
    </footer>
  )
}
