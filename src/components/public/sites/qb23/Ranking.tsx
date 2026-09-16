// ============================================================
// [R28-2c] qb23 铅笔小说(www.23qb.net) 排行榜页克隆 —— 扩展视图之 Ranking
// 真站快照(R28 实测): /tmp/r28-2c/qb23/qb23-top.html(https://www.23qb.net/top.html 直抓, 今日热榜)
// 真站 DOM: main#main.wrapper.bgys(灰蓝带 #eaedf1, margin 0 0 50px) > .content
//   ├ .page-heading > h1.page-title「今日热榜」(38px/700, color rgba(7,7,10,.92))
//   └ .list > .box(白卡) > .module > .module-items > .module-item×16 封面网格
//       (与首页同款斜角序号卡: top1 #e50914 / top2 #f73 / top3 #ffa82e / 余 #9e9e9e, Impact 30px 白字)
// 真站榜单为单榜(今日热榜); 契约下发三榜(更新榜 latest/字数榜 words/新书榜 new) + onBoard 切榜。
// 映射声明: 三榜切换复用真站分类页 .library-item chip 语言(暖杏 selected/#ff2a14), 真站无此 tab 形态;
//   榜名对齐 RankingView 下发 label(更新榜/字数榜/新书榜), 默认榜=更新榜。
//   榜单数据为站内排序口径, 非真站点击统计 → 榜单语义为推断映射(降级声明)。
// ============================================================
'use client'

import type { SiteRankingProps } from '../shared'
import { usePublic } from '../../ctx'
import { QbGridCard } from './Home'
import { ErrorState, Sk } from '../../bits'
import { QbFilterChip } from './Category'

/** [R28-2c-21] 真站实测色值(style.css) */
const QB_TEXT = '#282828'
const QB_MUT40 = 'rgba(0,0,0,0.4)'
const QB_MUT62 = 'rgba(0,0,0,0.62)'
const QB_TITLE = 'rgba(7,7,10,0.92)'

export function Qb23Ranking({ boards, active, onBoard, loading, error }: SiteRankingProps) {
  const { site } = usePublic()
  const activeBoard = boards.find((b) => b.key === active) || null
  const gridBooks = activeBoard?.books || []

  return (
    <div className="w-full pb-14" style={{ color: QB_TEXT }}>
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        {/* ============ .page-heading > h1.page-title「今日热榜」(真站 38px/700 裸排) ============ */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pb-3 pt-2">
          <h1 className="text-2xl font-bold sm:text-[30px] md:text-[38px]" style={{ color: QB_TITLE }}>
            今日热榜
          </h1>
          <span className="text-sm" style={{ color: QB_MUT62 }}>
            {site.name} · 三榜 TOP60
          </span>
        </div>

        {/* ============ 榜单切换(真站无 tab → .library-item chip 语言映射, 声明) ============ */}
        <div className="flex flex-wrap gap-1.5 pb-2" role="tablist" aria-label="榜单切换">
          {boards.map((b) => (
            <QbFilterChip key={b.key} label={b.label} active={b.key === active} onClick={() => onBoard(b.key)} />
          ))}
        </div>

        {/* ============ .list > .box > .module > .module-items 封面网格(main.bgys 灰蓝带) ============ */}
        <div
          className="rounded-[18px] p-2 shadow-[0_7px_21px_rgba(149,157,165,0.22)] sm:p-4"
          style={{ background: '#eaedf1' }}
        >
          <div className="rounded-[18px] bg-white p-4 sm:p-[25px]">
            {error ? (
              <ErrorState message="榜单加载失败" detail={error} />
            ) : loading && !gridBooks.length ? (
              <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-5 sm:gap-x-5 sm:gap-y-5" aria-label="榜单加载中">
                {Array.from({ length: 15 }).map((_, i) => (
                  <div key={`sk-${i}`} aria-hidden>
                    <div className="w-full pt-[140%]">
                      <Sk className="h-full w-full rounded-[5px]" />
                    </div>
                    <Sk className="mx-auto mt-3 h-4 w-4/5" style={{ borderRadius: 4 }} />
                    <Sk className="mx-auto mt-1.5 h-3 w-2/5" style={{ borderRadius: 4 }} />
                  </div>
                ))}
                <span className="sr-only">加载中…</span>
              </div>
            ) : gridBooks.length ? (
              <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-5 sm:gap-x-5 sm:gap-y-5" aria-label={`${activeBoard?.label || '热榜'}列表`}>
                {gridBooks.map((b, i) => (
                  <QbGridCard key={b.id} book={b} rank={i} />
                ))}
              </div>
            ) : (
              <p className="py-16 text-center text-sm" style={{ color: QB_MUT40 }}>
                暂无榜单数据
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
