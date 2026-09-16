// ============================================================
// [R28-2b-6] 霹雳书屋 克隆排行榜页 —— https://www.pilishuwu.com/top/index.html
//
// 真站快照: /tmp/r28-2b/pili/top.html(2026-09-16 实抓 89K)
// CSS 存档: /tmp/r28-2b/pili/wmcms.page.rank.css(20K) + wmcms.global.css 实测
//
// 真站 DOM:
//   .mod-rank-wrap = 左 .mod-rank-menu(160px 白盒, 1px #dad8d4 边 + 阴影):
//     h2.ui-rank-tit「排行榜」(42px 高 #ff9a6a 底白字 20px 居中)
//     span.ui-rank-ft-tit「数据榜」+ ul.mod-rank-menu-list(全部榜单/最新入库/全部点击/
//       本年/本月/本周/本日点击) + 「分类榜」(男频/女频/电子图书/无CP/纯爱/百合/轻小说)
//   右 .ran-wrapp > .ran-main-top:
//     h3.ran-rank-title「人气排行榜」(24px, 左竖条 5px #ff9126)
//     .rank-box1 > .mod-rank-subtit ul.mod-rank-sublist: 3 组表头(li_1/li_2/li-3:
//       b 作品 / strong 作者 / em 点击量)
//     .ran-top-month 内 3 个 ol.mod-rank-list.mod-rank-month-list(各 293px 宽, 每 ol
//       10 项): li(h 34px, 底 dashed #e5e5e5) > sub.mod-rank-keep(1-3 名, #484848 白字
//       15×14) / sub.mod-rank-light(4+, #f0efee #333) + a.mod-rank-name(14px #666,
//       hover #ff9a6a) + b.mod-rank-money(#ff9a6a) + span.mod-rank-num(作者 #666)
//
// 降级: ①真站数据榜 7 档(总/年/月/周/日点击等) → 契约三榜(更新榜/字数榜/新书榜)
// tab 切换 ②「点击量」数值无契约 → 更新榜显更新日期 / 字数·新书榜显字数
// ③分类榜(7 类)无独立榜单数据 → 左栏以站内分类导航替代 ④真站三列并排 30 项 →
// active 榜单 top30 三列分栏复刻。
// ============================================================
'use client'

import type { SiteRankingProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchCategories } from '../../data'
import { useEffect, useState } from 'react'
import { ErrorState, Sk, bookNavProps } from '../../bits'
import { fmtDate, formatWords } from '../../seo'

const ORANGE_HEADER = '#ff9a6a' // ui-rank-tit / mod-rank-money
const ORANGE_BAR = '#ff9126' // ran-rank-title 左竖条
const TEXT = '#333333'
const MUTED = '#666666'
const BADGE_DARK = '#484848' // mod-rank-keep 1-3 名
const BADGE_LIGHT = '#f0efee' // mod-rank-light 4+ 名

export function PiliRanking({ boards, active, onBoard, loading, error }: SiteRankingProps) {
  const { site, navigate } = usePublic()
  const [cats, setCats] = useState<{ id: string; name: string }[]>([])
  const [prevSite, setPrevSite] = useState(site.id)
  if (prevSite !== site.id) {
    setPrevSite(site.id)
    setCats([])
  }
  useEffect(() => {
    let alive = true
    fetchCategories()
      .then((list) => alive && setCats(list.map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => {
        /* 分类榜静默 */
      })
    return () => {
      alive = false
    }
  }, [site.id])

  const cur = boards.find((b) => b.key === active) || null
  const valueLabel = active === 'latest' ? '更新日期' : '字数'

  return (
    <div className="bg-white py-6 text-[#333333]">
      <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 sm:px-6 lg:grid-cols-[160px_1fr]">
        {/* 左栏榜单菜单(mod-rank-menu) */}
        <aside className="rounded-[3px] border shadow-[0_1px_1px_rgba(0,0,0,0.1)]" style={{ borderColor: '#dad8d4', background: '#fff' }} aria-label="榜单菜单">
          <h2 className="flex h-[42px] items-center justify-center text-xl text-white" style={{ background: ORANGE_HEADER }}>
            排行榜
          </h2>
          <div className="px-3.5 py-2">
            <p className="py-1 text-xs" style={{ color: '#999999' }}>数据榜</p>
            <ul style={{ listStyle: 'none' }} role="tablist" aria-label="榜单切换">
              {boards.map((b) => {
                const on = b.key === active
                return (
                  <li key={b.key} className={on ? 'font-bold' : ''}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => onBoard(b.key)}
                      className="block w-full py-1.5 text-left text-sm transition-colors hover:text-[#fa8729]"
                      style={{ color: on ? '#fa8729' : TEXT }}
                    >
                      {b.label}
                    </button>
                  </li>
                )
              })}
            </ul>
            {/* 分类榜(降级③): 真站为分类榜单数据, 此处以分类导航替代 */}
            <p className="py-1 pt-3 text-xs" style={{ color: '#999999' }}>分类榜</p>
            <ul style={{ listStyle: 'none' }}>
              {cats.slice(0, 7).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'category', cat: c.id })}
                    className="block w-full py-1.5 text-left text-sm transition-colors hover:text-[#fa8729]"
                    style={{ color: TEXT }}
                    aria-label={`查看${c.name}分类`}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
              {!cats.length && <Sk className="my-1 h-24 w-full" />}
            </ul>
          </div>
        </aside>

        {/* 主区 人气排行榜(ran-wrapp) */}
        <div className="min-w-0">
          <h1 className="pl-3 text-2xl leading-6" style={{ borderLeft: `5px solid ${ORANGE_BAR}`, color: '#000000' }}>
            人气排行榜
          </h1>
          {error && !boards.some((b) => b.books.length) ? (
            <div className="pt-5"><ErrorState message="榜单加载失败" detail={error} /></div>
          ) : loading ? (
            <div className="grid gap-6 pt-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
              {Array.from({ length: 3 }).map((_, i) => <Sk key={i} className="h-[380px] w-full rounded-[3px]" />)}
            </div>
          ) : cur ? (
            <>
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-bold" style={{ color: TEXT }}>{cur.label}</p>
                <p className="text-xs" style={{ color: '#999999' }}>共 {cur.total} 本 · TOP{cur.books.length}</p>
              </div>
              {/* 三列分栏(真站 3×10 项 ol.mod-rank-month-list; 每列表头 b 作品/strong 作者/em 数值) */}
              <div className="mt-2 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((col) => {
                  const items = cur.books.slice(col * 10, col * 10 + 10)
                  if (!items.length) return null
                  return (
                    <div key={col}>
                      <ul className="flex items-center border-b border-solid border-[#e5e5e5] py-1 text-xs" style={{ color: '#999999', listStyle: 'none' }}>
                        <b className="flex-1 font-normal">作品</b>
                        <strong className="w-[64px] shrink-0 font-normal">作者</strong>
                        <em className="w-[72px] shrink-0 not-italic text-right">{valueLabel}</em>
                      </ul>
                      <ol style={{ listStyle: 'none' }}>
                        {items.map((b, i) => {
                          const rank = col * 10 + i + 1
                          const top = rank <= 3
                          return (
                            <li key={b.id} className="flex items-center gap-2" style={{ height: 34, borderBottom: '1px dashed #e5e5e5' }}>
                              <sub
                                aria-hidden
                                className="inline-flex shrink-0 items-center justify-center font-sans text-[11px]"
                                style={{ width: 15, height: 14, lineHeight: '14px', background: top ? BADGE_DARK : BADGE_LIGHT, color: top ? '#fff' : TEXT }}
                              >
                                {rank}
                              </sub>
                              <button
                                type="button"
                                {...bookNavProps(navigate, b.id)}
                                className="pili-rank-name min-w-0 flex-1 truncate text-left text-sm"
                                aria-label={`查看《${b.name}》详情`}
                              >
                                {b.name}
                              </button>
                              <span className="w-[64px] shrink-0 truncate text-xs" style={{ color: MUTED }}>{b.author}</span>
                              <span className="w-[72px] shrink-0 truncate text-right text-xs" style={{ color: ORANGE_HEADER }}>
                                {active === 'latest' ? fmtDate(b.updatedAt) : formatWords(b.wordCount)}
                              </span>
                            </li>
                          )
                        })}
                      </ol>
                    </div>
                  )
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
