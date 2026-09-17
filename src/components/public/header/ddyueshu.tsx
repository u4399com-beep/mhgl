// [R31-7] 拆分自 SiteHeader.tsx（纯机械搬移）—— ddyueshu 仿站头部(笔趣阁经典模板: 搜索框/深蓝导航条/头部)
'use client'

import { useRef } from 'react'
import { Library } from 'lucide-react'
import { usePublic } from '../ctx'
import type { CategoryItem } from '../types'
import { Sk } from '../bits'
import { createSearchSubmit, SuggestDropdown, useSearchBoxLogic } from './search-suggest' // [R34-2c-3] +createSearchSubmit
import { SiteSwitcher } from './common'
import type { ImitationHeaderProps } from './registry'

// ------------------------------------------------------------
// ddyueshu(顶点小说 ddyueshu.cc) — 经典笔趣阁模板:
// HTML: div.header(div.header_logo 文字 logo + bqg_panel() 搜索面板) + div.nav(ul>li 白字导航
// 首页/我的书架/玄幻…/科幻/排行榜单/全部小说)。真站 biquge.css 抓取损坏(329B 乱码),
// 按笔趣阁模板通例还原: 白底报头 + #2b5b84 深蓝导航条 40px 白字 16px。
// ------------------------------------------------------------

/** [R24-6-a-2] ddyueshu 搜索框 — 笔趣阁经典直角输入(2px 深蓝边线) + 深蓝实底「搜索」钮 */
function DdyueshuSearchBox({ compact }: { compact?: boolean }) {
  const { navigate } = usePublic()
  const wrapRef = useRef<HTMLFormElement | null>(null)
  const logic = useSearchBoxLogic('', wrapRef, (term) => navigate({ view: 'search', q: term }))

  // [R34-2c-3] 原逐字节重复的提交闭包收敛至 search-suggest 单处定义
  const onSubmit = createSearchSubmit(logic, navigate)

  return (
    <form
      className={`relative flex items-stretch ${compact ? 'w-44' : 'w-full max-w-[320px]'}`}
      role="search"
      onSubmit={onSubmit}
      ref={wrapRef}
    >
      <div
        className="flex w-full items-center border-2 border-r-0 bg-white px-2.5"
        style={{ borderColor: '#2b5b84', borderRadius: '4px 0 0 4px' }}
      >
        <input
          value={logic.q}
          onChange={(e) => {
            logic.setQ(e.target.value)
            logic.setOpen(true)
            logic.setHighlight(-1)
          }}
          onFocus={() => logic.setOpen(true)}
          onKeyDown={logic.onKeyDown}
          placeholder="搜索书名 / 作者名"
          className="h-9 w-full bg-transparent text-sm outline-none placeholder:opacity-55"
          style={{ color: '#333333' }}
          aria-label="站内搜索"
          autoComplete="off"
        />
      </div>
      <button
        type="submit"
        className="shrink-0 bg-[#2b5b84] px-4 text-sm font-bold text-white transition-colors hover:bg-[#1e496d]"
        style={{ borderRadius: '0 4px 4px 0' }}
        aria-label="搜索"
      >
        搜索
      </button>
      {logic.open && (
        <SuggestDropdown
          state={logic.state}
          highlight={logic.highlight}
          onPick={logic.onPick}
          onRemoveHistory={logic.removeHistory}
          onClearHistory={logic.clearHistory}
        />
      )}
    </form>
  )
}

/** [R24-6-a-3] ddyueshu 深蓝导航条 — 真站 div.nav: 40px 高 #2b5b84 白字 16px 平铺链接,
 * hover 加深(#1e496d); 项序=首页/我的书架/分类×8(对应真站 首页/我的书架/玄幻…科幻/榜单/全部) */
function DdyueshuNav({ cats, loading }: { cats: CategoryItem[]; loading: boolean }) {
  const { navigate } = usePublic()
  const item =
    'inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap px-4 text-[16px] text-white transition-colors hover:bg-[#1e496d] sm:min-h-[40px]'
  return (
    <nav className="overflow-x-auto" style={{ background: '#2b5b84' }} aria-label="分类导航">
      <div className="mx-auto flex w-full max-w-[980px] items-center px-1 sm:px-2">
        <button type="button" onClick={() => navigate({ view: 'home' })} className={item} aria-label="返回首页">
          首页
        </button>
        <button type="button" onClick={() => navigate({ view: 'history' })} className={item} aria-label="我的书架">
          我的书架
        </button>
        {loading ? (
          <span className="flex items-center gap-3 px-3" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <Sk key={i} className="h-4 w-14" style={{ backgroundColor: 'rgba(255,255,255,0.28)' }} />
            ))}
          </span>
        ) : (
          cats.slice(0, 8).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate({ view: 'category', cat: c.id })}
              className={item}
              aria-label={`浏览 ${c.name} 分类`}
            >
              {c.name}
            </button>
          ))
        )}
      </div>
    </nav>
  )
}

/** [R24-6-a-4] ddyueshu 头部 — ①白底报头(左大号深蓝文字 logo + 中搜索 + 右书架入口)
 * ②#2b5b84 深蓝导航条; 980px 版心贴真站 #wrapper 宽度 */
export function DdyueshuHeader({ cats, pending }: ImitationHeaderProps) {
  const { site, embedMode, navigate } = usePublic()
  return (
    <div data-ddyueshu-header className="w-full bg-white">
      {/* ① 白底报头行 */}
      <div className="mx-auto flex w-full max-w-[980px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-3 py-4 sm:px-4">
        <button
          type="button"
          onClick={() => navigate({ view: 'home' })}
          className="shrink-0 text-[26px] font-bold leading-none tracking-wide text-[#2b5b84] transition-opacity hover:opacity-80 sm:text-[30px]"
          aria-label={`返回 ${site.name} 首页`}
        >
          {site.name}
        </button>
        <div className="hidden md:block">
          <DdyueshuSearchBox />
        </div>
        <div className="flex items-center gap-2">
          {/* 书架入口(笔趣阁扁平描边风) — 桌面带文字, 移动仅图标 */}
          <button
            type="button"
            onClick={() => navigate({ view: 'history' })}
            className="hidden min-h-[36px] items-center gap-1.5 border border-[#2b5b84] bg-[rgba(43,91,132,0.06)] px-3.5 text-[13px] font-bold text-[#2b5b84] transition-colors hover:bg-[rgba(43,91,132,0.12)] sm:inline-flex"
            style={{ borderRadius: '4px' }}
            aria-label="我的书架"
          >
            <Library className="h-3.5 w-3.5" aria-hidden />
            书架
          </button>
          <div className="md:hidden">
            <DdyueshuSearchBox compact />
          </div>
          <button
            type="button"
            onClick={() => navigate({ view: 'history' })}
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center border border-[#2b5b84] bg-[rgba(43,91,132,0.06)] text-[#2b5b84] sm:hidden"
            style={{ borderRadius: '4px' }}
            aria-label="我的书架"
          >
            <Library className="h-4 w-4" aria-hidden />
          </button>
          {embedMode && <SiteSwitcher />}
        </div>
      </div>
      {/* ② 深蓝导航条(真站 div.nav) */}
      <DdyueshuNav cats={cats} loading={pending} />
    </div>
  )
}
