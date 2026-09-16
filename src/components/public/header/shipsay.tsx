// [R31-7] 拆分自 SiteHeader.tsx（纯机械搬移）—— shipsay 仿站头部(船说 CMS: 浅灰报头/图标竖排入口/深灰导航条)
'use client'

import { useRef } from 'react'
import { BookOpen, History, Home, Search } from 'lucide-react'
import { usePublic } from '../ctx'
import { Sk } from '../bits'
import { addSearchHistory } from '../search-history'
import { SuggestDropdown, useSearchBoxLogic } from './search-suggest'
import { SiteSwitcher } from './common'
import type { ImitationHeaderProps } from './registry'

// ------------------------------------------------------------
// shipsay(船说CMS demo.shipsay.com) — 浅灰报头 + 深灰导航条(14px 微软雅黑, 960px 版心):
// header>.container.head: flex space-between py 16px; #logo 双行(站名 21px/700 #3e3d43
// 字距 .15em + 域名 #bf2c24); header form 300×36(input 1px #e6e6e6 圆角左 3px + #bf2c24
// 红钮圆角右 3px, hover #ed4259); .header_right 图标在上文字在下(#1a1a1a, 间隔 30px,
// #home 仅移动端显示); .navigation: #3e3d43 深灰, nav a 16px 白字 41px 高 px20,
// hover #252428 底 + 2px #ed4259 顶边线; #user_panel 右侧用户区; ≤767px 导航条整条隐藏。
// ------------------------------------------------------------

/** [R24-6-a-12] shipsay 搜索框 — 真站 header form: 300×36, 左圆角输入(1px #e6e6e6) +
 * 右 #bf2c24 红钮(hover #ed4259) */
function ShipsaySearchBox() {
  const { navigate } = usePublic()
  const wrapRef = useRef<HTMLFormElement | null>(null)
  const logic = useSearchBoxLogic('', wrapRef, (term) => navigate({ view: 'search', q: term }))

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const t = (logic.q || '').trim()
    if (!t) return
    addSearchHistory(t)
    logic.setOpen(false)
    navigate({ view: 'search', q: t })
  }

  return (
    <form
      className="relative mx-auto flex h-9 w-[300px] max-w-full items-center max-sm:w-full"
      role="search"
      onSubmit={onSubmit}
      ref={wrapRef}
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
        placeholder="搜索书名 / 作者"
        className="h-full min-w-0 flex-grow rounded-l-[3px] border border-r-0 border-[#e6e6e6] bg-white text-[14px] text-[#666666] outline-none placeholder:text-[#999999]"
        style={{ textIndent: '10px' }}
        aria-label="站内搜索"
        autoComplete="off"
      />
      <button
        type="submit"
        className="h-full shrink-0 rounded-r-[3px] bg-[#bf2c24] px-[13px] text-[#fbfbfb] transition-colors hover:bg-[#ed4259]"
        aria-label="搜索"
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
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

/** [R24-6-a-13] shipsay 头部 — ①浅灰报头(双行 logo + 红钮搜索 + 图标竖排入口区:
 * 桌面 书库/足迹, 移动 首页/书库/足迹 均分) ②#3e3d43 深灰导航条(≤767px 整条隐藏贴真站);
 * 真站「完本」入口无对应视图, 以 首页/书库/足迹 三入口对应 home/category/history */
export function ShipsayHeader({ cats, pending }: ImitationHeaderProps) {
  const { site, embedMode, navigate } = usePublic()
  const navLink =
    'flex h-[41px] items-center whitespace-nowrap border-t-2 border-transparent px-5 text-[16px] text-[#fbfbfb] transition-colors hover:border-[#ed4259] hover:bg-[#252428]'
  const entryLink =
    'flex flex-col items-center text-[15px] text-[#1a1a1a] transition-colors hover:text-[#ed4259]'
  return (
    <div
      data-shipsay-header
      className="w-full"
      style={{ background: '#f4f4f4', fontFamily: '"微软雅黑","Microsoft Yahei",Arial,Tahoma,Verdana,sans-serif' }}
    >
      {/* ① 报头(.container.head: 960px, py 16px, space-between) */}
      <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between px-[5px] py-4">
        {/* logo(#logo 双行: 站名 + 域名红字; ≤639px 隐藏贴真站) */}
        <button type="button" onClick={() => navigate({ view: 'home' })} className="text-center max-sm:hidden" aria-label={`返回 ${site.name} 首页`}>
          <span className="block text-[21px] font-bold tracking-[0.15em] text-[#3e3d43]">{site.name}</span>
          <span className="block text-[14px] font-bold leading-snug text-[#bf2c24]">{site.domain}</span>
        </button>
        <ShipsaySearchBox />
        {/* 右侧图标竖排入口(.header_right: 图标上/文字下, 间隔 30px; 移动端全宽均分) */}
        <div className="flex items-end pt-2 max-md:w-full max-md:flex-wrap max-md:justify-between max-md:pt-5">
          {/* 真站 #home 仅移动端显示 */}
          <button
            type="button"
            onClick={() => navigate({ view: 'home' })}
            className={`${entryLink} hidden max-md:flex`}
            aria-label="返回首页"
          >
            <Home className="mb-0.5 h-[18px] w-[18px]" aria-hidden />
            首页
          </button>
          <button
            type="button"
            onClick={() => navigate({ view: 'category' })}
            className={entryLink}
            aria-label="书库"
          >
            <BookOpen className="mb-0.5 h-[18px] w-[18px]" aria-hidden />
            书库
          </button>
          <button
            type="button"
            onClick={() => navigate({ view: 'history' })}
            className={`${entryLink} md:pl-[30px]`}
            aria-label="足迹"
          >
            <History className="mb-0.5 h-[18px] w-[18px]" aria-hidden />
            足迹
          </button>
          {embedMode && (
            <span className="md:hidden">
              <SiteSwitcher />
            </span>
          )}
        </div>
      </div>
      {/* ② 深灰导航条(.navigation #3e3d43; ≤767px 整条隐藏贴真站) */}
      <div className="hidden md:block" style={{ background: '#3e3d43' }}>
        <nav className="mx-auto flex max-w-[960px] items-center px-[5px]" aria-label="分类导航">
          <button type="button" onClick={() => navigate({ view: 'home' })} className={navLink} aria-label="返回首页">
            首页
          </button>
          {pending ? (
            <span className="flex items-center gap-3 px-4" aria-hidden>
              {Array.from({ length: 5 }).map((_, i) => (
                <Sk key={i} className="h-4 w-12" style={{ backgroundColor: 'rgba(251,251,251,0.25)' }} />
              ))}
            </span>
          ) : (
            cats.slice(0, 8).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate({ view: 'category', cat: c.id })}
                className={navLink}
                aria-label={`浏览 ${c.name} 分类`}
              >
                {c.name}
              </button>
            ))
          )}
          {/* #user_panel: 真站 nav 右侧用户区(margin-left auto) → embedMode 站点切换 */}
          {embedMode && (
            <div className="ml-auto flex items-center pr-1">
              <SiteSwitcher />
            </div>
          )}
        </nav>
      </div>
    </div>
  )
}
