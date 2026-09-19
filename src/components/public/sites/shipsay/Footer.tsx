// ============================================================
// [R41-C-6] shipsay(船说 CMS demo) 源站 1:1 仿制页脚 —— Wayback 版(真站不可达)
// 素材出处: Wayback 2024-05 快照(R28 考据; 真站 demo.shipsay.com 现超时不可达, 全程
//   Wayback, 见本目录 index.ts 头注)。色值出处=R24 真站直连实测(/tmp/r25/shipsay-home.html
//   36KB 逐字节取色: 页脚红底 #bf2c24 / 白字 #fbfbfb; R39 themes.ts 继承记录同值)。
// 源站结构: 船说 demo 页脚为红色横条简单居中版权(demo 站无备案/友链块):
//   <p>Copyright © 2024 船说CMS演示站 All Rights Reserved.</p>
// 站名动态: usePublic().site.name(考据值=船说CMS演示站); 年份按快照逐字节固定 2024
// 版式: 红底 #bf2c24 / 白字 #fbfbfb / 居中 / 12px / padding 16px; 无链接(safeHref 不出场);
//   全宽色条无版心约束, 375px 无横滚
// ============================================================
'use client'

import { usePublic } from '../../ctx'

export function ShipsayFooter() {
  const { site } = usePublic()
  return (
    <footer style={{ background: '#bf2c24', padding: 16 }}>
      <p style={{ margin: 0, textAlign: 'center', color: '#fbfbfb', fontSize: 12, lineHeight: '20px' }}>
        Copyright © 2024 {site.name} All Rights Reserved.
      </p>
    </footer>
  )
}
