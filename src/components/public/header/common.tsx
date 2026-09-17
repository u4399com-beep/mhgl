// [R31-7] 拆分自 SiteHeader.tsx（纯机械搬移）—— 公共件(通用搜索框/站点切换器/书架入口/站名 logo), 供默认头部与仿站头部复用
'use client'

import { useRef } from 'react'
import { ChevronDown, Compass, Library, Search } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getTheme } from '@/lib/crawl/themes'
import { sliceCodePoints } from '@/lib/utils'
import { usePublic } from '../ctx'
import { withAlpha } from '../seo'
import { createSearchSubmit, SuggestDropdown, useSearchBoxLogic } from './search-suggest' // [R34-2c-3] +createSearchSubmit

export function SearchBox({ compact }: { compact?: boolean }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  const wrapRef = useRef<HTMLFormElement | null>(null)
  const logic = useSearchBoxLogic('', wrapRef, (term) => navigate({ view: 'search', q: term }))

  // 表单提交: 走 navigate, 同时记录历史
  // [R34-2c-3] 原逐字节重复的提交闭包收敛至 search-suggest 单处定义
  const onSubmit = createSearchSubmit(logic, navigate)

  return (
    <form
      className={`relative flex items-center gap-2 ${compact ? 'w-44' : 'w-full max-w-md'}`}
      role="search"
      onSubmit={onSubmit}
      ref={wrapRef}
    >
      <div
        className="flex w-full items-center gap-2 px-3 py-1.5"
        style={{
          background: v.surface,
          border: `1px solid ${v.border}`,
          borderRadius: '999px',
        }}
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
          placeholder="搜索书名 / 作者 / 关键词"
          className="w-full bg-transparent text-sm outline-none placeholder:opacity-60"
          style={{ color: v.text }}
          aria-label="站内搜索"
          autoComplete="off"
        />
        <button type="submit" aria-label="搜索" className="shrink-0 transition-opacity hover:opacity-75" style={{ color: v.primary }}>
          <Search className="h-4 w-4" aria-hidden />
        </button>
      </div>
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

/** 站点切换器（仅 embedMode 显示） */
export function SiteSwitcher() {
  const { site, sites, theme, navigate } = usePublic()
  const v = theme.vars
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
          style={{ background: withAlpha(v.primary, theme.dark ? 0.2 : 0.1), color: v.primary, border: `1px solid ${withAlpha(v.primary, 0.4)}` }}
          aria-label="切换站点"
        >
          <Compass className="h-3.5 w-3.5" aria-hidden />
          {site.name}
          <ChevronDown className="h-3 w-3" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        style={{ background: v.surface, border: `1px solid ${v.border}`, color: v.text, borderRadius: v.radius }}
      >
        {/* ii-a 修复: 停用站点(status=false)不进切换器(防御性过滤, 上游 PublicSite 已滤) */}
        {sites.filter((x) => x.status !== false).map((s) => {
          const t = getTheme(s.themeId)
          const active = s.id === site.id
          return (
            <DropdownMenuItem
              key={s.id}
              onClick={() => navigate({ view: 'home', site: s.id })}
              style={{ color: active ? v.primary : v.text, fontSize: 13 }}
              aria-label={`切换到站点 ${s.name}`}
            >
              <span className="flex overflow-hidden rounded-full" style={{ width: 26, height: 12 }} aria-hidden>
                {(t.preview || []).map((c, i) => <span key={i} className="h-full flex-1" style={{ background: c }} />)}
              </span>
              <span className="truncate">{s.name}</span>
              <span className="ml-auto text-[10px] opacity-60">{t.name}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 书架入口按钮 — 桌面带文字, 移动仅图标 */
export function BookshelfButton({ compact }: { compact?: boolean }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  return (
    <button
      type="button"
      onClick={() => navigate({ view: 'history' })}
      className={`inline-flex items-center gap-1.5 rounded-full transition-opacity hover:opacity-80 ${compact ? 'h-9 w-9 justify-center' : 'px-3 py-1.5'}`}
      style={{
        background: withAlpha(v.primary, theme.dark ? 0.18 : 0.1),
        color: v.primary,
        border: `1px solid ${withAlpha(v.primary, 0.35)}`,
        borderRadius: '999px',
      }}
      aria-label="我的书架"
      title="我的书架"
    >
      <Library className="h-4 w-4" aria-hidden />
      {!compact && <span className="text-xs font-medium">书架</span>}
    </button>
  )
}

export function SiteMark() {
  const { site, theme, navigate } = usePublic()
  const v = theme.vars
  return (
    <button
      type="button"
      onClick={() => navigate({ view: 'home' })}
      className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
      aria-label={`返回 ${site.name} 首页`}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black"
        style={{ background: `linear-gradient(135deg, ${v.primary}, ${v.accent})`, color: v.primaryText, borderRadius: v.radius }}
        aria-hidden
      >
        {sliceCodePoints(site.name, 1)}
      </span>
      <span
        className="text-lg font-bold tracking-wide"
        style={{ color: v.text, fontFamily: v.titleFont }}
      >
        {site.name}
      </span>
    </button>
  )
}
