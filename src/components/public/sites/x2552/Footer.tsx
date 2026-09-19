// ============================================================
// [R41-C-4] x2552(吾爱文学网) 源站 1:1 仿制页脚 —— Wayback 版(真站不可达)
// 素材出处: Wayback 2023-12-04 快照组(R28 考据, /tmp/r28-2d/x2552/); 真站现已不可达,
//   本组件按 R28 考据记录实现 —— 结构=杰奇家族标准 .footer 版权组, 配色=R28 黑冰
//   heibing/css/style.css 实测(R39 themes.ts 继承记录: 页脚底 #F2F2F2 / 顶边 2px solid
//   #cfcfcf / 字号 12px / 灰 #999 系居中; 黑冰链接 #2f468f/hover #ff6600 本页脚无链接不出场)
// 源站结构(杰奇家族标准):
//   <div class="footer">
//     <p>本站所有小说为转载作品，所有章节均由网友上传，转载至本站只是为了宣传本书让更多读者欣赏。</p>
//     <p>Copyright © 2023 吾爱文学网 All Rights Reserved.</p>
//   </div>
// 站名动态: usePublic().site.name(考据值=吾爱文学网); 年份按快照逐字节固定 2023
// 版心: 黑冰模板 960px(index.ts 头注同口径) → max-width:960 + width:100% 响应式, 375px 无横滚
// ============================================================
'use client'

import { usePublic } from '../../ctx'

export function X2552Footer() {
  const { site } = usePublic()
  return (
    <footer style={{ background: '#F2F2F2', borderTop: '2px solid #cfcfcf', fontSize: 12 }}>
      <div style={{ maxWidth: 960, width: '100%', margin: '0 auto', padding: '12px 10px', boxSizing: 'border-box', textAlign: 'center', color: '#999' }}>
        <p style={{ margin: 0, lineHeight: '20px' }}>本站所有小说为转载作品，所有章节均由网友上传，转载至本站只是为了宣传本书让更多读者欣赏。</p>
        <p style={{ margin: 0, lineHeight: '20px' }}>Copyright © 2023 {site.name} All Rights Reserved.</p>
      </div>
    </footer>
  )
}
