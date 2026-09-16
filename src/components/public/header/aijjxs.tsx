// [R31-7] 拆分自 SiteHeader.tsx（纯机械搬移）—— aijjxs 仿站头部(深酒红渐变导航条 + 米白报头)
'use client'

import { usePublic } from '../ctx'
import type { CategoryItem } from '../types'
import { BookshelfButton, SearchBox, SiteMark, SiteSwitcher } from './common'

/** [R23-II-a-10] aijjxs 仿站双层头部 — 原 switch 内联分支逐字提取为独立子组件(视觉行为不变):
 * 上层深酒红渐变导航条(白字分类链接+浅粉悬浮) + 下层米白报头(站名+搜索+书架) */
export function AijjxsHeader({ cats, pending }: { cats: CategoryItem[]; pending: boolean }) {
  const { embedMode, navigate } = usePublic()
  return (
    <div className="w-full">
      <nav
        aria-label="站内分类导航"
        style={{
          background: 'linear-gradient(180deg, rgba(85,15,28,0.96) 0%, rgba(60,8,20,0.96) 50%, rgba(38,4,12,0.97) 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,220,230,0.18), 0 4px 10px rgba(40,5,12,0.22)',
        }}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-1 px-3 py-1.5">
          {pending ? (
            <span className="py-1.5 text-[13px] text-white/60" aria-hidden>分类加载中…</span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => navigate({ view: 'home' })}
                className="rounded-lg px-2.5 py-1.5 text-[13px] font-bold text-white transition-colors hover:bg-white/20"
              >
                首页
              </button>
              {(cats || []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate({ view: 'category', cat: c.id })}
                  className="rounded-lg px-2.5 py-1.5 text-[13px] font-bold text-white transition-colors hover:bg-white/20"
                >
                  {c.name}
                </button>
              ))}
            </>
          )}
        </div>
      </nav>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <SiteMark />
          <div className="hidden md:block"><SearchBox /></div>
          <div className="flex items-center gap-2">
            <BookshelfButton />
            {/* md 以下用紧凑搜索框(与常规分支同策略) */}
            <div className="md:hidden"><SearchBox compact /></div>
            {embedMode && <SiteSwitcher />}
          </div>
        </div>
      </div>
    </div>
  )
}
