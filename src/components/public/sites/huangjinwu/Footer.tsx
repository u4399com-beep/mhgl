// ============================================================
// [R41-B-1] huangjinwu 克隆页脚 —— 源站 .footers 1:1 仿制
//   素材: /tmp/r41-snap/huangjinwu.org.html 尾段(2026-09-19 实抓) + /tmp/r41-css/huangjinwu.css
//   实测: .footers{background:var(--footer-bg #e2eaf5);border-top:1px solid
//     color-mix(in srgb,var(--border-color #dbe4f0) 70%,transparent);font-size:1.4rem;
//     line-height:1.7;padding:2.8rem 0;color:var(--text-light #64748b);text-align:center}
//     .footers .sitemap{display:inline-flex;gap:2px}; html{font-size:10px} → 1.4rem=14px/2.8rem=28px;
//     margin-top:-1.6rem 省略(本地布局无该负边距语境, 页脚由外壳 flex 置底)
// ============================================================
'use client'

import { Fragment } from 'react'
import { usePublic, viewToUrl } from '../../ctx'
import type { ViewParams } from '../../ctx'

export function HuangjinwuFooter() {
  const { site, navigate } = usePublic()
  // [R41-B-2] 源站 sitemap 6 站内链接 → 克隆视图映射(规格: 小说→category / 标签→keyword /
  //   电子书→fulltext / 其余无对应视图→home, 保视觉即可)
  const items: Array<[string, ViewParams]> = [
    ['小说', { view: 'category' }],
    ['相关小说', { view: 'home' }],
    ['标签', { view: 'keyword' }],
    ['作者', { view: 'home' }],
    ['电子书', { view: 'fulltext' }],
    ['相关电子书', { view: 'home' }],
  ]
  return (
    <footer className="hjw-fsec">
      <div className="hjw-fsec-in">
        {/* 竖线为源站原样裸文本节点(.sitemap inline-flex 下与 a 同为 flex 项, gap 2px) */}
        <p className="hjw-fmap">
          {items.map(([label, view], i) => (
            <Fragment key={label}>
              {i > 0 ? '|' : null}
              <a href={viewToUrl(view, site.id)} onClick={(e) => { e.preventDefault(); navigate(view) }}>{label}</a>
            </Fragment>
          ))}
        </p>
        {/* 以下两行文案逐字节对齐源站快照(含「Copyright ©2026黄金屋」无空格原样) */}
        <p>本站小说由根据搜索引擎转码，只为让更多读者欣赏，不保存小说内及数据，仅作宣传展示。</p>
        <p>Copyright ©2026黄金屋</p>
      </div>
    </footer>
  )
}
