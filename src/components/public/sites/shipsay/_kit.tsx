// ============================================================
// [R35-2d-2] 船说(shipsay) 共享小件 —— 原书条右栏(标题/简介/作者·字数·日期行,
// 22 行 JSX)在 Search/Fulltext/Category 三处逐字节重复, 收敛为单处定义。
// 左侧封面+状态遮罩三页形态各异(Search/Category 条件连载色, Fulltext 恒全本红),
// 仍保留各页文件本地; 页面级 Pager 暂留 Category.tsx(既有跨文件先例)。
// ============================================================
'use client'

import { usePublic } from '../../ctx'
import { bookNavProps } from '../../bits'
import { fmtDate, formatWords } from '../../seo'
import type { BookItem } from '../../types'

/** [R28-2e-7] 船说模板实测色值(R24 直测 style.css 逐字节 + 2024 Wayback DOM 佐证)
 * [R36-2d-5] 原各页文件同值色板(Home/Category/Search 11 键全量, Ranking 9 键,
 * Book/Fulltext/Toc 与本件旧 C 各为其子集)收敛为单处全量定义; 页面文件 `SS_C as C` 消费 */
export const SS_C = {
  bg: '#f4f4f4',
  card: '#ffffff',
  text: '#666666',
  link: '#1a1a1a',
  hover: '#ed4259',
  title: '#555555',
  blue: '#4284ed',
  orange: '#f0643a',
  line: '#e3e3e3',
  maskOngoing: 'rgba(0,0,0,.4)',
  maskCompleted: 'rgba(191,44,36,.75)',
} as const

const C = SS_C

/** [R35-2d-2] 书条右栏 —— <div class="ss-w100"> 标题钮(bookNavProps)/三行简介钳制/作者链+字数+更新日期行 */
export function SsBookMain({ b }: { b: BookItem }) {
  const { navigate } = usePublic()
  return (
    <div className="ss-w100 min-w-0 flex-1">
      <button
        type="button"
        {...bookNavProps(navigate, b.id)}
        className="ss-h2 block max-w-full truncate text-left text-[15px] font-bold leading-snug"
        style={{ color: C.title }}
        aria-label={`查看《${b.name}》详情`}
      >
        {b.name}
      </button>
      <p className="ss-indent m-0 mt-1 line-clamp-3 text-[12px] leading-[19px]" style={{ textIndent: '2em' }}>
        {b.intro || `${b.category} · ${b.author}`}
      </p>
      <p className="ss-li_bottom m-0 mt-1 flex items-center text-[12px]">
        <button type="button" onClick={() => navigate({ view: 'search', q: b.author })} className="truncate" style={{ color: C.link }} aria-label={`搜索 ${b.author} 的作品`}>
          {b.author}
        </button>
        <em className="ss-orange ml-auto shrink-0 not-italic" style={{ color: C.orange }}>
          {formatWords(b.wordCount)}
        </em>
        <em className="ss-blue ml-2 shrink-0 not-italic" style={{ color: C.blue }}>
          {fmtDate(b.updatedAt).slice(5) || '--'}
        </em>
      </p>
    </div>
  )
}
