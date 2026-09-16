// [R31-7] 拆分自 SiteHeader.tsx（纯机械搬移）—— huangjinwu 仿站头部(现代蓝调卡片站: 圆角搜索/毛玻璃报头/移动端侧栏)
'use client'

import { useCallback, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Book,
  BookOpen,
  CircleUserRound,
  Flame,
  Home,
  List,
  Menu,
  Search,
  Tag,
  X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePublic } from '../ctx'
import { Sk } from '../bits'
import { addSearchHistory } from '../search-history'
import { SuggestDropdown, useSearchBoxLogic } from './search-suggest'
import { SiteSwitcher } from './common'
import type { ImitationHeaderProps } from './registry'

// ------------------------------------------------------------
// huangjinwu(黄金屋 huangjinwu.org) — 现代蓝调卡片站(html font-size:10px, 已折算 px):
// .headers: rgba(255,255,255,.92) + backdrop blur(12px) saturate(1.2) + 1px 边线(65% 边框色)
// + 0 8px 32px 阴影; .navbar: flex gap 16px py 16px; .logo 20px/600 #1d4ed8(icon-book);
// .navbar-menu a 16px/500 #1e293b 圆角 10px, hover/active #2563eb 白字; .navbar-search-input
// h36 圆角 10px #f0f4fb 底 250px(focus 300px + 蓝环); .user-toggle 24px 图标;
// 移动端(≤767px): 汉堡绝对右(sidebar 200px 滑入 + 黑 60% 遮罩 blur 4px)。
// ------------------------------------------------------------

/** [R24-6-a-8] huangjinwu 搜索框 — 真站 .navbar-search: 圆角 10px 输入框(#f0f4fb 底,
 * h36, ≥1200px 宽 250px), focus 白底 + #2563eb 边 + 3px 蓝环 + 加宽至 300px; 搜索钮绝对右侧 */
function HuangjinwuSearchBox() {
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
    <form className="relative flex w-[250px] items-center" role="search" onSubmit={onSubmit} ref={wrapRef}>
      <input
        value={logic.q}
        onChange={(e) => {
          logic.setQ(e.target.value)
          logic.setOpen(true)
          logic.setHighlight(-1)
        }}
        onFocus={() => logic.setOpen(true)}
        onKeyDown={logic.onKeyDown}
        placeholder="可搜书名、作者、角色"
        className="h-9 w-full rounded-[10px] border border-[#dbe4f0] bg-[#f0f4fb] pl-4 pr-9 text-sm text-[#1e293b] outline-none transition-all placeholder:font-normal placeholder:text-[#64748b] focus:w-[300px] focus:border-[#2563eb] focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.22)]"
        aria-label="站内搜索"
        autoComplete="off"
      />
      <button
        type="submit"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#64748b] transition-colors hover:text-[#2563eb]"
        aria-label="搜索"
      >
        <Search className="h-4 w-4" aria-hidden />
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

/** [R24-6-a-9] huangjinwu 头部 — 桌面: 白毛玻璃报头([logo][菜单 flex-1][搜索][用户下拉],
 * ≥961px 显示搜索, 768-960 隐藏) + 移动端([用户][logo 居中][汉堡绝对右])。
 * 用户下拉 = 真站 .user-dropdown(临时书架/会员书架…)按本站视图映射; 真 .theme-toggle
 * 为暗色主题开关(本站无对应能力, 不渲染避免死钮) */
export function HuangjinwuHeader({ cats, pending }: ImitationHeaderProps) {
  const { site, embedMode, navigate } = usePublic()
  // [R24-6-a-10] 移动端汉堡侧栏开合态(真站 menuToggle + sidebar-wrapper.active)
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const navItem =
    'flex min-h-[44px] items-center whitespace-nowrap rounded-[10px] px-4 py-1.5 text-base font-medium text-[#1e293b] transition-colors hover:bg-[#2563eb] hover:text-white md:min-h-0'
  const sideItem =
    'flex min-h-[44px] w-full items-center gap-3 rounded-[10px] px-4 text-base font-medium text-[#1e293b] transition-colors hover:bg-[#e8f1ff] hover:text-[#2563eb]'
  // 真站菜单项各配 iconfont 图标, 动态分类按 4 图标循环对应
  const menuIcons: LucideIcon[] = [BookOpen, Flame, List, Tag]
  return (
    <div data-huangjinwu-header className="w-full">
      {/* 毛玻璃报头(.headers) */}
      <div
        className="w-full"
        style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'saturate(1.2) blur(12px)',
          WebkitBackdropFilter: 'saturate(1.2) blur(12px)',
          borderBottom: '1px solid rgba(219,228,240,0.65)',
          boxShadow: '0 1px 0 rgba(219,228,240,0.4), 0 8px 32px rgba(15,23,42,0.06)',
        }}
      >
        <div className="mx-auto w-full max-w-[1180px] px-4">
          <div className="flex items-center gap-4 py-4 max-md:relative max-md:pr-12">
            {/* logo(order: 移动 2 居中 / md 1) */}
            <button
              type="button"
              onClick={() => navigate({ view: 'home' })}
              className="order-2 flex shrink-0 items-center gap-2 text-[20px] font-semibold text-[#1d4ed8] transition-colors hover:text-[#2563eb] max-md:flex-1 max-md:justify-center max-md:text-[18px] max-md:font-medium md:order-1"
              aria-label={`返回 ${site.name} 首页`}
            >
              <Book className="h-5 w-5" aria-hidden />
              {site.name}
            </button>
            {/* 桌面横向菜单(md:order-2; 真站 .active 项 #2563eb 白底, 首页按当前项惯例高亮) */}
            <nav className="hidden min-w-0 flex-1 items-center gap-2.5 md:order-2 md:flex" aria-label="站内菜单">
              <button
                type="button"
                onClick={() => navigate({ view: 'home' })}
                className={`${navItem} bg-[#2563eb] text-white`}
                aria-label="返回首页"
              >
                首页
              </button>
              {pending ? (
                <span className="flex items-center gap-2 px-2" aria-hidden>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Sk key={i} className="h-5 w-14" style={{ backgroundColor: 'rgba(37,99,235,0.12)' }} />
                  ))}
                </span>
              ) : (
                cats.slice(0, 6).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => navigate({ view: 'category', cat: c.id })}
                    className={navItem}
                    aria-label={`浏览 ${c.name} 分类`}
                  >
                    {c.name}
                  </button>
                ))
              )}
            </nav>
            {/* 圆角搜索框(真站 ≥961px 显示; min-[961px] 贴真站断点) */}
            <div className="hidden min-[961px]:order-3 min-[961px]:block">
              <HuangjinwuSearchBox />
            </div>
            {/* 用户下拉(真站 .user-dropdown/.user-dropdown-menu) */}
            <div className="order-1 flex shrink-0 items-center md:order-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center text-[#0f172a] transition-colors hover:text-[#2563eb] md:h-9 md:w-9"
                    aria-label="个人中心"
                  >
                    <CircleUserRound className="h-6 w-6" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="min-w-[160px] p-1"
                  style={{
                    background: '#ffffff',
                    border: '1px solid #dbe4f0',
                    borderRadius: '10px',
                    boxShadow: '0 8px 24px rgba(37,99,235,0.14), 0 2px 8px rgba(15,23,42,0.06)',
                  }}
                >
                  <DropdownMenuItem
                    onClick={() => navigate({ view: 'history' })}
                    className="rounded-[6px] px-4 py-2.5 text-sm text-[#1e293b] transition-colors hover:bg-[#e8f1ff] hover:text-[#2563eb]"
                    aria-label="临时书架"
                  >
                    临时书架
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate({ view: 'category' })}
                    className="rounded-[6px] px-4 py-2.5 text-sm text-[#1e293b] transition-colors hover:bg-[#e8f1ff] hover:text-[#2563eb]"
                    aria-label="全部书库"
                  >
                    全部书库
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {/* 汉堡按钮(真站 .menu-toggle: 绝对右侧 1.6rem) */}
            <button
              type="button"
              onClick={() => setMenuOpen((b) => !b)}
              className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-[#0f172a] transition-colors hover:text-[#2563eb] md:hidden"
              aria-label="菜单"
              aria-expanded={menuOpen}
            >
              <Menu className="h-6 w-6" aria-hidden />
            </button>
          </div>
        </div>
      </div>
      {/* [R24-6-a-10] 遮罩(真站 .menu-overlay: 黑 60% + blur 4px) */}
      <div
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[4px] md:hidden"
        onClick={closeMenu}
        style={{ opacity: menuOpen ? 1 : 0, transition: 'opacity .35s cubic-bezier(.4,0,.2,1)' }}
        aria-hidden="true"
      />
      {/* 侧栏(真站 .sidebar-wrapper: 200px 固定左侧滑入, 阴影 4px 0 20px) */}
      <aside
        className={`fixed left-0 top-0 z-[61] flex h-full w-[200px] max-w-[80vw] flex-col bg-white shadow-[4px_0_20px_rgba(0,0,0,0.15)] transition-[left,visibility] duration-300 md:hidden ${menuOpen ? 'visible left-0' : 'invisible -left-[200px]'}`}
        aria-label="站内菜单"
        aria-hidden={!menuOpen}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#dbe4f0] px-4 py-2">
          <button
            type="button"
            onClick={() => {
              navigate({ view: 'home' })
              closeMenu()
            }}
            className="flex items-center gap-3 text-[20px] font-bold text-[#1d4ed8] transition-colors hover:text-[#2563eb]"
            aria-label={`返回 ${site.name} 首页`}
          >
            <Book className="h-6 w-6" aria-hidden />
            {site.name}
          </button>
          <button
            type="button"
            onClick={closeMenu}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#64748b] transition-all hover:rotate-90 hover:bg-[#e8f1ff] hover:text-[#0f172a]"
            aria-label="关闭菜单"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto p-3">
          <li>
            <button
              type="button"
              onClick={() => {
                navigate({ view: 'home' })
                closeMenu()
              }}
              className={sideItem}
              aria-label="返回首页"
            >
              <Home className="h-4 w-4 shrink-0" aria-hidden />
              首页
            </button>
          </li>
          {pending ? (
            <li className="px-4 py-2" aria-hidden>
              <Sk className="h-4 w-16" style={{ backgroundColor: 'rgba(37,99,235,0.12)' }} />
            </li>
          ) : (
            cats.slice(0, 8).map((c, i) => {
              const Icon = menuIcons[i % menuIcons.length]
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      navigate({ view: 'category', cat: c.id })
                      closeMenu()
                    }}
                    className={sideItem}
                    aria-label={`浏览 ${c.name} 分类`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {c.name}
                  </button>
                </li>
              )
            })
          )}
          <li>
            <button
              type="button"
              onClick={() => {
                navigate({ view: 'search' })
                closeMenu()
              }}
              className={sideItem}
              aria-label="搜索"
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden />
              搜索
            </button>
          </li>
        </ul>
        {embedMode && (
          <div className="shrink-0 border-t border-[#dbe4f0] p-3">
            <SiteSwitcher />
          </div>
        )}
      </aside>
    </div>
  )
}
