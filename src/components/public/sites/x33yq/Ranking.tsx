// ============================================================
// [R43-2] x33yq(33言情) 克隆排行榜页 —— 快照 /tmp/r43-snap/top.html(/top/lastupdate/ 直连实抓)
//   源站结构: 分类 .nav1(头部已有) + 第二 .nav1 榜型栏(总点击/月点击/…/最近更新 li.on 强推榜/新书榜,
//   共 12 榜型) + #main > #hotcontent > .l > #alist(h3 榜名 + #alistbox ×50 + .pagelink 分页)
//   契约映射声明: 源站 12 榜型 → 平台 RankingBoard 三榜(words/latest/new), tab 文案对齐源站榜名
//   (总字数/最近更新/新书榜); 榜单页内列表卡与分类页同形态(X33yqAlistRows 复用), 单页 24 卡。
// ============================================================
'use client'

import type { SiteRankingProps } from '../shared'
import { ErrorState } from '../../bits'
import { X33yqAlistRows } from './Category'

/** 榜型 tab 文案(源站 /top/* 榜名口径 → 契约三榜映射) */
const RANK_TAB: Record<string, string> = { words: '总字数', latest: '最近更新', new: '新书榜' }

export function X33yqRanking({ boards, active, onBoard, loading, error }: SiteRankingProps) {
  const cur = boards.find((b) => b.key === active) || null
  return (
    <div className="xq-ranking">
      <div id="xq-main">
        {/* 榜型栏(源站 top.html 第二 .nav1: 榜名行, li.on 高亮) */}
        <div className="xq-nav1 xq-nav1-rank" role="tablist" aria-label="榜单切换">
          <ul>
            {boards.map((b) => {
              const on = b.key === active
              return (
                <li key={b.key} className={on ? 'xq-on' : undefined}>
                  <a
                    href="#"
                    role="tab"
                    aria-selected={on}
                    onClick={(e) => { e.preventDefault(); onBoard(b.key) }}
                  >{RANK_TAB[b.key] || b.label}</a>
                </li>
              )
            })}
          </ul>
        </div>
        <div id="xq-hotcontent">
          <div className="xq-l">
            <div className="xq-alist">
              <h3 className="xq-alist-h3">{cur ? `${RANK_TAB[cur.key] || cur.label}榜 · 共 ${cur.total} 本` : '榜单'}</h3>
              {error ? (
                <div className="xq-alist-body"><ErrorState message="榜单加载失败" detail={error} /></div>
              ) : (
                <X33yqAlistRows books={cur?.books.slice(0, 24) || []} loading={loading || !cur} error="" empty="榜单暂无书籍" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
