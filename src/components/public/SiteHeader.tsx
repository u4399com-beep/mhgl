// ============================================================
// 站点头部 — 站名 + 搜索框(带建议下拉) + 分类导航(计数 pill) + (embedMode)站点切换器
// [R23-II-a-1] 按 theme.vars.headerStyle 呈现 10 种取值: 仿站 5 分支(pili / aijjxs / kks / qb /
// biquge-x)各自独立子组件, 主组件 early-return 映射统一分发; 通用 5 分支(centered 居中 /
// split 分列 / 常规两行=solid·gradient·transparent 共用)仍走主 switch 尾段
// ============================================================
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, CSSProperties, KeyboardEvent } from 'react'
import { ChevronDown, Compass, Library, Search, TrendingUp, X, Clock } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getTheme } from '@/lib/crawl/themes'
import { fetchCategories } from './data'
import { usePublic } from './ctx'
import { withAlpha } from './seo'
import type { CategoryItem } from './types'
import { Sk } from './bits'
import { addSearchHistory, clearSearchHistory, getSearchHistory, removeSearchHistory } from './search-history'

function useCategories() {
  const [cats, setCats] = useState<CategoryItem[]>([])
  // pending 独立于数据：接口失败时也要退出骨架屏，避免导航区永久闪烁
  const [pending, setPending] = useState(true)
  useEffect(() => {
    let alive = true
    fetchCategories()
      .then((list) => {
        if (!alive) return
        setCats(list)
        setPending(false)
      })
      .catch(() => {
        if (!alive) return
        setCats([])
        setPending(false)
      })
    return () => {
      alive = false
    }
  }, [])
  return { cats, pending }
}

// ============================================================
// 搜索建议下拉 — 共享逻辑
// - 词池: 挂载时一次性拉取 /api/public/tags?n=24 (容错, 失败静默)
// - 显示: input 为空时显示前 8 个热词; 有输入时按 includes 过滤(大小写不敏感)取 8
// - 搜索历史: input 为空时在热词上方展示, 每条带 X 移除, 底部"清空历史"
// - 键盘: ↑↓ 移动高亮, Enter 选中, Esc 关闭
// - 点击外部关闭 (ref + mousedown 监听)
// ============================================================

const SUGGEST_LIMIT = 8

function useSuggestPool() {
  const [pool, setPool] = useState<string[] | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/public/tags?n=24', { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((j: { ok?: boolean; data?: { tags?: unknown } } | null) => {
        if (!alive) return
        if (!j?.ok || !j.data) {
          setPool([])
          return
        }
        const tags = Array.isArray(j.data.tags)
          ? (j.data.tags as unknown[]).filter((t): t is string => typeof t === 'string' && !!t.trim())
          : []
        setPool(tags)
      })
      .catch(() => {
        if (alive) setPool([])
      })
    return () => {
      alive = false
    }
  }, [])
  return pool
}

interface SuggestState {
  open: boolean
  history: string[]
  hot: string[]
  matched: string[]
  highlight: number
}

function computeSuggest(input: string, pool: string[] | null): Omit<SuggestState, 'open' | 'highlight'> {
  const history = getSearchHistory()
  if (input.trim()) {
    const q = input.trim().toLowerCase()
    const matched = (pool || [])
      .filter((t) => t.toLowerCase().includes(q))
      .slice(0, SUGGEST_LIMIT)
    return { history: [], hot: [], matched }
  }
  return { history, hot: (pool || []).slice(0, SUGGEST_LIMIT), matched: [] }
}

function SuggestDropdown({
  state,
  highlight,
  onPick,
  onRemoveHistory,
  onClearHistory,
}: {
  state: Omit<SuggestState, 'open' | 'highlight'>
  highlight: number
  onPick: (term: string) => void
  onRemoveHistory: (term: string) => void
  onClearHistory: () => void
}) {
  const { theme } = usePublic()
  const v = theme.vars
  const history = state.history
  const hot = state.hot
  const matched = state.matched
  const isEmpty = !history.length && !hot.length && !matched.length
  if (isEmpty) return null
  // highlight 全局序号: history 在前, 然后是 matched/hot
  const hotStart = history.length
  return (
    <div
      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-lg shadow-xl"
      style={{
        background: v.surface,
        border: `1px solid ${v.border}`,
        borderRadius: v.radius,
        color: v.text,
      }}
      role="listbox"
      aria-label="搜索建议"
    >
      {/* 搜索历史(仅 input 空时显示) */}
      {history.length > 0 && (
        <div className="border-b" style={{ borderColor: withAlpha(v.border, 0.6) }}>
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <span className="text-[11px] font-medium tracking-wider" style={{ color: v.textMuted }}>
              搜索历史
            </span>
            <button
              type="button"
              onClick={onClearHistory}
              className="text-[11px] transition-opacity hover:opacity-70"
              style={{ color: v.textMuted }}
              aria-label="清空搜索历史"
            >
              清空历史
            </button>
          </div>
          <ul>
            {history.map((term, i) => (
              <li
                key={`h-${term}`}
                role="option"
                aria-selected={highlight === i}
              >
                <button
                  type="button"
                  onMouseEnter={() => {
                    /* hover 仅视觉, 键盘 highlight 由外层管 */
                  }}
                  onClick={() => onPick(term)}
                  className="group flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
                  style={{
                    background: highlight === i ? withAlpha(v.primary, theme.dark ? 0.18 : 0.1) : 'transparent',
                    color: v.text,
                  }}
                >
                  <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: v.textMuted }} aria-hidden />
                  <span className="flex-1 truncate">{term}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveHistory(term)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.stopPropagation()
                        onRemoveHistory(term)
                      }
                    }}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-70 focus:opacity-70"
                    style={{ color: v.textMuted }}
                    aria-label={`移除 ${term}`}
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 热搜词 / 匹配建议 */}
      {(matched.length > 0 || hot.length > 0) && (
        <div>
          {history.length > 0 && (
            <div className="px-3 pt-2 pb-1">
              <span className="text-[11px] font-medium tracking-wider" style={{ color: v.textMuted }}>
                {matched.length > 0 ? '匹配建议' : '热门搜索'}
              </span>
            </div>
          )}
          <ul>
            {(matched.length > 0 ? matched : hot).map((term, i) => {
              const idx = hotStart + i
              const isHot = matched.length === 0
              return (
                <li
                  key={`s-${term}`}
                  role="option"
                  aria-selected={highlight === idx}
                >
                  <button
                    type="button"
                    onClick={() => onPick(term)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
                    style={{
                      background: highlight === idx ? withAlpha(v.primary, theme.dark ? 0.18 : 0.1) : 'transparent',
                      color: v.text,
                    }}
                  >
                    {isHot ? (
                      <TrendingUp className="h-3.5 w-3.5 shrink-0" style={{ color: v.primary }} aria-hidden />
                    ) : (
                      <Search className="h-3.5 w-3.5 shrink-0" style={{ color: v.textMuted }} aria-hidden />
                    )}
                    <span className="flex-1 truncate">{term}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function useSearchBoxLogic(
  initialQ: string,
  wrapRef: React.RefObject<HTMLFormElement | null>,
  onNavigate: (term: string) => void,
) {
  const [q, setQ] = useState(initialQ)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [tick, setTick] = useState(0) // 强制重渲染读取最新 localStorage (移除/清空后)
  const pool = useSuggestPool()

  // 重新计算建议 (基于 q 与 pool; tick 变化时重读 history)
  // tick 不在 memo 体内消费, 仅作 history 重读触发器 — 显式 disable lint
  const state = useMemo<Omit<SuggestState, 'open' | 'highlight'>>(
    () => computeSuggest(q, pool),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick 触发 history 重读
    [q, pool, tick],
  )

  const totalItems = state.history.length + (state.matched.length || state.hot.length)

  // 高亮值在渲染期裁剪到合法范围 (避免 setState in effect; totalItems 变化时自然收紧)
  // - highlight = -1 表示无高亮 (input 变化时重置)
  // - highlight >= 0 时裁剪到 [0, totalItems-1]; totalItems 为 0 时回退 -1
  const safeHighlight = totalItems === 0
    ? -1
    : highlight < 0
      ? -1
      : Math.min(highlight, totalItems - 1)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, wrapRef])

  const submit = useCallback((term: string) => {
    const t = (term || '').trim()
    if (!t) return
    addSearchHistory(t)
    setOpen(false)
    setHighlight(-1)
    onNavigate(t)
  }, [onNavigate])

  const onPick = useCallback(
    (term: string) => {
      setQ(term)
      submit(term)
    },
    [submit],
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!open) {
        if (e.key === 'ArrowDown' && totalItems > 0) {
          setOpen(true)
          setHighlight(0)
          e.preventDefault()
        }
        return
      }
      if (e.key === 'Escape') {
        setOpen(false)
        setHighlight(-1)
        e.preventDefault()
        return
      }
      // 用 safeHighlight 计算下一项 (合法范围)
      const cur = totalItems === 0
        ? -1
        : highlight < 0
          ? -1
          : Math.min(highlight, totalItems - 1)
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (totalItems > 0) {
          if (cur < 0) setHighlight(0)
          else setHighlight((cur + 1) % totalItems)
        }
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (totalItems > 0) {
          if (cur < 0) setHighlight(totalItems - 1)
          else setHighlight((cur - 1 + totalItems) % totalItems)
        }
        return
      }
      if (e.key === 'Enter' && cur >= 0) {
        // 选中高亮项 (history 在前, hot/matched 在后)
        const item =
          cur < state.history.length
            ? state.history[cur]
            : (state.matched.length ? state.matched : state.hot)[cur - state.history.length]
        if (item) {
          e.preventDefault()
          setQ(item)
          submit(item)
        }
      }
    },
    [open, highlight, totalItems, state.history, state.matched, state.hot, submit],
  )

  const removeHistory = useCallback((term: string) => {
    removeSearchHistory(term)
    setTick((t) => t + 1)
  }, [])

  const clearHistory = useCallback(() => {
    clearSearchHistory()
    setTick((t) => t + 1)
  }, [])

  return {
    q,
    setQ,
    open,
    setOpen,
    highlight: safeHighlight,
    setHighlight,
    state,
    onPick,
    onKeyDown,
    removeHistory,
    clearHistory,
    submit,
  }
}

function SearchBox({ compact }: { compact?: boolean }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  const wrapRef = useRef<HTMLFormElement | null>(null)
  const logic = useSearchBoxLogic('', wrapRef, (term) => navigate({ view: 'search', q: term }))

  // 表单提交: 走 navigate, 同时记录历史
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

function CategoryNav({ cats, loading }: { cats: CategoryItem[]; loading: boolean }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  if (loading) {
    return (
      <div className="flex gap-3 py-1">
        {Array.from({ length: 6 }).map((_, i) => <Sk key={i} className="h-4 w-14" />)}
      </div>
    )
  }
  return (
    <nav className="flex items-center gap-1 overflow-x-auto pb-0.5" aria-label="分类导航">
      <button
        type="button"
        onClick={() => navigate({ view: 'home' })}
        className="shrink-0 rounded-full px-3 py-1 text-sm transition-opacity hover:opacity-80"
        style={{ color: v.primary, background: withAlpha(v.primary, theme.dark ? 0.16 : 0.08) }}
      >
        全部
      </button>
      {cats.slice(0, 10).map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => navigate({ view: 'category', cat: c.id })}
          className="shrink-0 rounded-full px-3 py-1 text-sm transition-colors hover:opacity-80"
          style={{ color: v.text }}
        >
          {c.name}
          {c._count?.books ? (
            <span
              className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/10 px-1 text-[9px] tabular-nums opacity-70"
              aria-label={`${c.name} ${c._count.books} 本`}
            >
              {c._count.books}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  )
}

/** 站点切换器（仅 embedMode 显示） */
function SiteSwitcher() {
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
                {t.preview.map((c, i) => <span key={i} className="h-full flex-1" style={{ background: c }} />)}
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
function BookshelfButton({ compact }: { compact?: boolean }) {
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

/** pili 搜索框 — 复古直角输入 + 橙色方块提交钮 + 建议下拉 */
function PiliSearchBox() {
  const { theme, navigate } = usePublic()
  const v = theme.vars
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
      className={`relative flex items-stretch w-full max-w-md`}
      role="search"
      onSubmit={onSubmit}
      ref={wrapRef}
    >
      <div
        className="flex w-full items-center border border-r-0 px-3"
        style={{ borderColor: '#e0b070', background: v.surface, borderRadius: `${v.radius} 0 0 ${v.radius}` }}
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
          placeholder="可搜索小说名 / 作者名"
          className="h-9 w-full bg-transparent text-sm outline-none placeholder:opacity-55"
          style={{ color: v.text }}
          aria-label="站内搜索"
          autoComplete="off"
        />
      </div>
      <button
        type="submit"
        className="shrink-0 px-4 text-sm font-bold transition-opacity hover:opacity-85"
        style={{ background: `linear-gradient(180deg, ${v.primary}, #e96c07)`, color: v.primaryText, borderRadius: `0 ${v.radius} ${v.radius} 0` }}
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

/** pili 奶油渐变分类导航条（原站 mod-top-nav-wr DNA: 奶油底棕字 + 首项高亮） */
function PiliCategoryNav({ cats, loading }: { cats: CategoryItem[]; loading: boolean }) {
  const { navigate } = usePublic()
  const item = 'shrink-0 whitespace-nowrap px-3.5 py-2 text-sm font-medium transition-colors min-h-[44px] inline-flex items-center'
  return (
    <nav
      data-pili-nav
      className="overflow-x-auto border-y"
      style={{
        background: 'linear-gradient(180deg, #fff5e5, #fee9c4)',
        borderColor: '#eed3a4',
      }}
      aria-label="分类导航"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center px-2 sm:px-4">
        <button
          type="button"
          onClick={() => navigate({ view: 'home' })}
          className={`${item} font-bold`}
          style={{ color: '#7d360f', background: 'linear-gradient(180deg, #ffdca0, #ffefd3)', boxShadow: 'inset 0 0 0 1px #e8bd7d' }}
          aria-label="返回首页"
        >
          首页
        </button>
        {loading ? (
          <span className="flex items-center gap-3 px-3 py-2">
            {Array.from({ length: 6 }).map((_, i) => <Sk key={i} className="h-4 w-14" style={{ backgroundColor: 'rgba(125,54,15,0.12)' }} />)}
          </span>
        ) : (
          cats.slice(0, 12).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate({ view: 'category', cat: c.id })}
              className={`${item} hover:underline`}
              style={{ color: '#7d360f' }}
              aria-label={`浏览 ${c.name} 分类`}
            >
              {c.name}
              {c._count?.books ? (
                <span
                  className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] tabular-nums"
                  style={{ background: 'rgba(125,54,15,0.12)', color: '#7d360f' }}
                  aria-label={`${c.name} ${c._count.books} 本`}
                >
                  {c._count.books}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </nav>
  )
}

/** pili 头部 — 白底 logo+搜索+右侧按钮, 下方奶油渐变分类条 */
function PiliHeader({ cats, pending }: { cats: CategoryItem[]; pending: boolean }) {
  const { theme, embedMode, navigate } = usePublic()
  const v = theme.vars
  return (
    <div data-pili-header>
      <div style={{ background: v.surface, borderBottom: '1px solid #f0e6d2' }}>
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <SiteMark />
          <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1 sm:px-6">
            <div className="mx-auto sm:max-w-md">
              <PiliSearchBox />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 书架入口 (pili 复古风格) */}
            <button
              type="button"
              onClick={() => navigate({ view: 'history' })}
              className="hidden min-h-[36px] items-center gap-1.5 border px-3.5 text-sm font-bold transition-colors hover:brightness-105 sm:inline-flex"
              style={{ borderColor: '#cc6007', background: '#fbe4bb', color: '#7d360f', borderRadius: v.radius }}
              aria-label="我的书架"
            >
              <Library className="h-3.5 w-3.5" aria-hidden />
              书架
            </button>
            {/* pili 复古顶钮: 充值风奶油按钮(浏览全部) */}
            <button
              type="button"
              onClick={() => navigate({ view: 'category' })}
              className="hidden min-h-[36px] items-center border px-3.5 text-sm font-bold transition-colors hover:brightness-105 sm:inline-flex"
              style={{ borderColor: '#cc6007', background: '#fbe4bb', color: '#7d360f', borderRadius: v.radius }}
              aria-label="浏览全部小说分类"
            >
              全部小说
            </button>
            {/* 移动端书架图标按钮 */}
            <button
              type="button"
              onClick={() => navigate({ view: 'history' })}
              className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center border sm:hidden"
              style={{ borderColor: '#cc6007', background: '#fbe4bb', color: '#7d360f', borderRadius: v.radius }}
              aria-label="我的书架"
            >
              <Library className="h-4 w-4" aria-hidden />
            </button>
            {embedMode && <SiteSwitcher />}
          </div>
        </div>
      </div>
      <PiliCategoryNav cats={cats} loading={pending} />
    </div>
  )
}

// ============================================================
// [R23-II-a-2] kks 仿站搜索框 — 101看書(www.101kks.com)直角蓝框输入 + 蓝色方块提交钮
// (真站 4px 圆角扁平无阴影 14px 紧凑气质; compact=窄输入+图标钮, 参考通用 SearchBox 做法)
// ============================================================
function KksSearchBox({ compact }: { compact?: boolean }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
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
      className={`relative flex items-stretch ${compact ? 'w-44' : 'w-full max-w-md'}`}
      role="search"
      onSubmit={onSubmit}
      ref={wrapRef}
    >
      <div
        className="flex w-full items-center border border-r-0 bg-white px-2.5"
        style={{ borderColor: '#1f6cb2', borderRadius: '4px 0 0 4px' }}
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
          placeholder="搜小說名 / 作者名"
          className="h-8 w-full bg-transparent text-[13px] outline-none placeholder:opacity-55"
          style={{ color: v.text }}
          aria-label="站内搜索"
          autoComplete="off"
        />
      </div>
      <button
        type="submit"
        className="shrink-0 bg-[#1f6cb2] px-3 transition-colors hover:bg-[#17508a]"
        style={{ borderRadius: '0 4px 4px 0' }}
        aria-label="搜索"
      >
        <Search className="h-4 w-4 text-white" aria-hidden />
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

/** [R23-II-a-3] kks 米黄公告条 — 真站 .headerad{background:#fff2df;text-align:center}:
 * 站名+slogan 深棕 #6b5b3e 13px 居中, 超长省略 */
function KksAnnounce() {
  const { site } = usePublic()
  const slogan = site.description || site.title || '每日更新，免费阅读'
  return (
    <div className="overflow-hidden" style={{ background: '#fff2df' }}>
      <div
        className="mx-auto w-full max-w-6xl truncate px-4 py-[5px] text-center text-[13px]"
        style={{ color: '#6b5b3e' }}
      >
        {site.name} · {slogan}
      </div>
    </div>
  )
}

/** [R23-II-a-3] kks 蓝色导航条 — 真站 background:#1f6cb2 白字 14px 紧凑链接, hover #17508a;
 * 移动端 overflow-x-auto 横向滚动(骨架屏同步蓝底半透明白) */
function KksNav({ cats, loading }: { cats: CategoryItem[]; loading: boolean }) {
  const { navigate } = usePublic()
  const item = 'inline-flex min-h-[40px] shrink-0 items-center whitespace-nowrap px-3.5 text-sm text-white transition-colors hover:bg-[#17508a]'
  return (
    <nav className="overflow-x-auto" style={{ background: '#1f6cb2' }} aria-label="分类导航">
      <div className="mx-auto flex w-full max-w-6xl items-center px-2 sm:px-4">
        <button
          type="button"
          onClick={() => navigate({ view: 'home' })}
          className={`${item} font-bold`}
          aria-label="返回首页"
        >
          首页
        </button>
        {loading ? (
          <span className="flex items-center gap-3 px-3 py-2" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => <Sk key={i} className="h-3.5 w-14" style={{ backgroundColor: 'rgba(255,255,255,0.28)' }} />)}
          </span>
        ) : (
          cats.slice(0, 12).map((c) => (
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

/** [R23-II-a-4] kks 头部 — 三行结构: ①白底报头(主题蓝 #1f6cb2 加粗站名 logo+搜索+书架)
 * ②#fff2df 米黄公告条(站名+slogan) ③#1f6cb2 蓝色导航条; 全程扁平 4px 圆角无阴影 */
function KksHeader({ cats, pending }: { cats: CategoryItem[]; pending: boolean }) {
  const { theme, site, embedMode, navigate } = usePublic()
  const v = theme.vars
  return (
    <div data-kks-header>
      {/* ① 白底报头行 — 纯文字站名 logo(真站气质, 无徽章无阴影) */}
      <div style={{ background: v.surface }}>
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => navigate({ view: 'home' })}
            className="shrink-0 text-xl font-bold tracking-wide transition-opacity hover:opacity-80"
            style={{ color: v.primary, fontFamily: v.titleFont }}
            aria-label={`返回 ${site.name} 首页`}
          >
            {site.name}
          </button>
          <div className="hidden md:block"><KksSearchBox /></div>
          <div className="flex items-center gap-2">
            {/* 书架入口(kks 蓝白扁平风) — 桌面带文字, 移动仅图标 */}
            <button
              type="button"
              onClick={() => navigate({ view: 'history' })}
              className="hidden min-h-[36px] items-center gap-1.5 border px-3.5 text-[13px] font-bold transition-opacity hover:opacity-80 sm:inline-flex"
              style={{ borderColor: '#1f6cb2', background: withAlpha('#1f6cb2', 0.06), color: '#1f6cb2', borderRadius: '4px' }}
              aria-label="我的书架"
            >
              <Library className="h-3.5 w-3.5" aria-hidden />
              书架
            </button>
            <div className="md:hidden"><KksSearchBox compact /></div>
            <button
              type="button"
              onClick={() => navigate({ view: 'history' })}
              className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center border sm:hidden"
              style={{ borderColor: '#1f6cb2', background: withAlpha('#1f6cb2', 0.06), color: '#1f6cb2', borderRadius: '4px' }}
              aria-label="我的书架"
            >
              <Library className="h-4 w-4" aria-hidden />
            </button>
            {embedMode && <SiteSwitcher />}
          </div>
        </div>
      </div>
      {/* ② 米黄公告条(真站 .headerad) */}
      <KksAnnounce />
      {/* ③ 蓝色导航条(真站 #1f6cb2) */}
      <KksNav cats={cats} loading={pending} />
    </div>
  )
}

// ============================================================
// [R23-II-a-5] qb 仿站搜索框 — 铅笔小说(www.23qb.com)system-ui 圆角(8px)输入 + 朱红方块提交钮
// ============================================================
function QbSearchBox({ compact }: { compact?: boolean }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
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
      className={`relative flex items-stretch ${compact ? 'w-44' : 'w-full max-w-md'}`}
      role="search"
      onSubmit={onSubmit}
      ref={wrapRef}
    >
      <div
        className="flex w-full items-center border border-r-0 bg-white px-3"
        style={{ borderColor: '#e3e6eb', borderRadius: '8px 0 0 8px' }}
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
          className="h-9 w-full bg-transparent text-sm outline-none placeholder:opacity-55"
          style={{ color: v.text }}
          aria-label="站内搜索"
          autoComplete="off"
        />
      </div>
      <button
        type="submit"
        className="shrink-0 bg-[#ff2a14] px-3 transition-colors hover:bg-[#ea2611]"
        style={{ borderRadius: '0 8px 8px 0' }}
        aria-label="搜索"
      >
        <Search className="h-4 w-4 text-white" aria-hidden />
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

/** [R23-II-a-6] qb 浅色分类条 — 真站 #f8f9f9 浅底 + 底部 1px #e3e6eb 边线, 菜单 700 加重 #282828,
 * 当前项/hover 主题朱红 #ff2a14 — 注意真站导航不是红底白字, 是浅底黑体粗字+红色高亮;
 * 头部无当前视图态, 首页按真站首项高亮惯例作当前项(同 PiliCategoryNav 先例); 移动端横滚 */
function QbNav({ cats, loading }: { cats: CategoryItem[]; loading: boolean }) {
  const { navigate } = usePublic()
  const item = 'inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap px-3.5 text-[15px] font-bold transition-colors'
  return (
    <nav
      className="overflow-x-auto"
      style={{ background: '#f8f9f9', borderBottom: '1px solid #e3e6eb' }}
      aria-label="分类导航"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center px-2 sm:px-4">
        <button
          type="button"
          onClick={() => navigate({ view: 'home' })}
          className={`${item} text-[#ff2a14]`}
          aria-label="返回首页"
        >
          首页
        </button>
        {loading ? (
          <span className="flex items-center gap-3 px-3 py-2" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => <Sk key={i} className="h-4 w-14" style={{ backgroundColor: 'rgba(40,40,40,0.1)' }} />)}
          </span>
        ) : (
          cats.slice(0, 11).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate({ view: 'category', cat: c.id })}
              className={`${item} text-[#282828] hover:text-[#ff2a14]`}
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

/** [R23-II-a-7] qb 头部 — 双行: ①白底报头(#ff2a14 朱红粗体 logo+搜索+书架) ②浅色分类条;
 * system-ui 字族气质, 8px 圆角 */
function QbHeader({ cats, pending }: { cats: CategoryItem[]; pending: boolean }) {
  const { theme, site, embedMode, navigate } = usePublic()
  const v = theme.vars
  return (
    <div data-qb-header>
      {/* ① 白底报头行 — 朱红粗体纯文字 logo(真站红字报头基因) */}
      <div style={{ background: v.surface }}>
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => navigate({ view: 'home' })}
            className="shrink-0 text-xl font-bold tracking-wide transition-opacity hover:opacity-80"
            style={{ color: '#ff2a14' }}
            aria-label={`返回 ${site.name} 首页`}
          >
            {site.name}
          </button>
          <div className="hidden md:block"><QbSearchBox /></div>
          <div className="flex items-center gap-2">
            {/* 书架入口(qb 朱红浅底 chip 风) — 桌面带文字, 移动仅图标 */}
            <button
              type="button"
              onClick={() => navigate({ view: 'history' })}
              className="hidden min-h-[36px] items-center gap-1.5 border px-3.5 text-sm font-bold transition-opacity hover:opacity-80 sm:inline-flex"
              style={{ borderColor: withAlpha('#ff2a14', 0.35), background: withAlpha('#ff2a14', 0.06), color: '#ff2a14', borderRadius: '8px' }}
              aria-label="我的书架"
            >
              <Library className="h-3.5 w-3.5" aria-hidden />
              书架
            </button>
            <div className="md:hidden"><QbSearchBox compact /></div>
            <button
              type="button"
              onClick={() => navigate({ view: 'history' })}
              className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center border sm:hidden"
              style={{ borderColor: withAlpha('#ff2a14', 0.35), background: withAlpha('#ff2a14', 0.06), color: '#ff2a14', borderRadius: '8px' }}
              aria-label="我的书架"
            >
              <Library className="h-4 w-4" aria-hidden />
            </button>
            {embedMode && <SiteSwitcher />}
          </div>
        </div>
      </div>
      {/* ② 浅色分类条(真站 #f8f9f9 + 底部边线, 黑体粗字红色高亮) */}
      <QbNav cats={cats} loading={pending} />
    </div>
  )
}

// ============================================================
// [R23-II-a-8] biquge-x 仿站搜索框 — 笔趣阁 laoniu1 模板(www.biquge.tw)粉框输入 + 粉色方块提交钮
// ============================================================
function BiqugeXSearchBox({ compact }: { compact?: boolean }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
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
      className={`relative flex items-stretch ${compact ? 'w-44' : 'w-full max-w-md'}`}
      role="search"
      onSubmit={onSubmit}
      ref={wrapRef}
    >
      <div
        className="flex w-full items-center border border-r-0 bg-white px-2.5"
        style={{ borderColor: '#F47983', borderRadius: '4px 0 0 4px' }}
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
          placeholder="搜索小说名 / 作者名"
          className="h-8 w-full bg-transparent text-[13px] outline-none placeholder:opacity-55"
          style={{ color: v.text }}
          aria-label="站内搜索"
          autoComplete="off"
        />
      </div>
      <button
        type="submit"
        className="shrink-0 bg-[#F47983] px-3 transition-colors hover:bg-[#f85c7d]"
        style={{ borderRadius: '0 4px 4px 0' }}
        aria-label="搜索"
      >
        <Search className="h-4 w-4 text-white" aria-hidden />
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

/** [R23-II-a-9] biquge-x 粉红导航条 — 真站 .header-common-nav{background:#F47983;height:2.2rem;
 * line-height:2.2rem} .header-common-nav a{color:#ffffff}: 白字 0.8rem 链接均分排布
 * (真站 width:10% float:left → 此处 flex-1 等分, 桌面全宽不设 max-w 上限贴真站;
 * w-max+min-w-full: 项少铺满均分/项多横滚), hover #f85c7d(主题 accent) */
function BiqugeXNav({ cats, loading }: { cats: CategoryItem[]; loading: boolean }) {
  const { navigate } = usePublic()
  const item = 'flex flex-1 items-center justify-center whitespace-nowrap px-2 text-[0.8rem] text-white transition-colors hover:bg-[#f85c7d]'
  return (
    <nav
      className="overflow-x-auto"
      style={{ background: '#F47983', height: '2.2rem', lineHeight: '2.2rem' }}
      aria-label="分类导航"
    >
      <div className="mx-auto flex h-full w-max min-w-full sm:w-auto">
        <button
          type="button"
          onClick={() => navigate({ view: 'home' })}
          className={item}
          aria-label="返回首页"
        >
          首页
        </button>
        {loading ? (
          Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="flex flex-1 items-center justify-center" aria-hidden>
              <Sk className="h-3 w-10" style={{ backgroundColor: 'rgba(255,255,255,0.3)' }} />
            </span>
          ))
        ) : (
          cats.slice(0, 9).map((c) => (
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

/** [R23-II-a-9] biquge-x 头部 — 双行: ①白底报头(#F47983 粗体 logo+搜索, 高 3rem)
 * ②粉红导航条(真站 #F47983 高 2.2rem 白字均分) */
function BiqugeXHeader({ cats, pending }: { cats: CategoryItem[]; pending: boolean }) {
  const { theme, site, embedMode, navigate } = usePublic()
  const v = theme.vars
  return (
    <div data-biquge-x-header>
      {/* ① 白底报头行(真站高约 3rem: min-h-12 + py-1.5; flex-wrap 兜底窄屏不溢出) */}
      <div style={{ background: v.surface }}>
        <div className="mx-auto flex min-h-12 w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-1.5 sm:px-6">
          <button
            type="button"
            onClick={() => navigate({ view: 'home' })}
            className="shrink-0 text-[22px] font-bold tracking-wide transition-opacity hover:opacity-80"
            style={{ color: '#F47983', fontFamily: v.titleFont }}
            aria-label={`返回 ${site.name} 首页`}
          >
            {site.name}
          </button>
          <div className="hidden md:block"><BiqugeXSearchBox /></div>
          <div className="flex items-center gap-2">
            {/* 书架入口(biquge 粉描边扁平风) — 桌面带文字, 移动仅图标 */}
            <button
              type="button"
              onClick={() => navigate({ view: 'history' })}
              className="hidden min-h-[36px] items-center gap-1.5 border px-3.5 text-[13px] font-bold transition-opacity hover:opacity-80 sm:inline-flex"
              style={{ borderColor: '#F47983', background: '#ffffff', color: '#F47983', borderRadius: '4px' }}
              aria-label="我的书架"
            >
              <Library className="h-3.5 w-3.5" aria-hidden />
              书架
            </button>
            <div className="md:hidden"><BiqugeXSearchBox compact /></div>
            <button
              type="button"
              onClick={() => navigate({ view: 'history' })}
              className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center border sm:hidden"
              style={{ borderColor: '#F47983', background: '#ffffff', color: '#F47983', borderRadius: '4px' }}
              aria-label="我的书架"
            >
              <Library className="h-4 w-4" aria-hidden />
            </button>
            {embedMode && <SiteSwitcher />}
          </div>
        </div>
      </div>
      {/* ② 粉红导航条(真站 .header-common-nav) */}
      <BiqugeXNav cats={cats} loading={pending} />
    </div>
  )
}

function SiteMark() {
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
        {site.name.slice(0, 1)}
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

/** [R23-II-a-10] aijjxs 仿站双层头部 — 原 switch 内联分支逐字提取为独立子组件(视觉行为不变):
 * 上层深酒红渐变导航条(白字分类链接+浅粉悬浮) + 下层米白报头(站名+搜索+书架) */
function AijjxsHeader({ cats, pending }: { cats: CategoryItem[]; pending: boolean }) {
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

/** 仿站头部分支统一 props(分类数据由主组件 useCategories 单点拉取后下发) */
interface ImitationHeaderProps {
  cats: CategoryItem[]
  pending: boolean
}

type ImitationHeaderStyle = 'pili' | 'aijjxs' | 'kks' | 'qb' | 'biquge-x'

/** [R23-II-a-11] 仿站分支映射 — headerStyle 五个仿站值 → 各自独立子组件, 主组件 early-return 统一分发
 * (替代原三元链, 通用分支 solid/gradient/transparent/split/centered 仍走尾段 switch) */
const IMITATION_HEADERS: Record<ImitationHeaderStyle, ComponentType<ImitationHeaderProps>> = {
  pili: PiliHeader,
  aijjxs: AijjxsHeader,
  kks: KksHeader,
  qb: QbHeader,
  'biquge-x': BiqugeXHeader,
}

export function SiteHeader() {
  const { theme, embedMode } = usePublic() // navigate 已随 aijjxs 分支提取下沉到 AijjxsHeader
  const v = theme.vars
  const { cats, pending } = useCategories()
  const style = v.headerStyle

  // [R23-II-a-11] 仿站分支 early-return(pili/aijjxs 视觉行为与改造前逐像素一致):
  // 仿站分支全部自绘层级(报头/公告条/导航条), 外层 header 保持透明底;
  // aijjxs 原本叠有 1px v.border 外层底边线, 在此原样保留, 其余仿站分支无外层边线
  if (style === 'pili' || style === 'aijjxs' || style === 'kks' || style === 'qb' || style === 'biquge-x') {
    const Branch = IMITATION_HEADERS[style]
    return (
      <header
        style={{
          background: 'transparent',
          borderBottom: style === 'aijjxs' ? `1px solid ${v.border}` : 'none',
        }}
      >
        <Branch cats={cats} pending={pending} />
      </header>
    )
  }

  const headerBg: CSSProperties =
    v.headerStyle === 'gradient'
      ? { background: `linear-gradient(120deg, ${withAlpha(v.primary, theme.dark ? 0.24 : 0.14)}, ${withAlpha(v.accent, theme.dark ? 0.16 : 0.1)})` }
      : v.headerStyle === 'solid' || v.headerStyle === 'centered'
        ? { background: v.surface }
        : { background: 'transparent' }

  // pili「无外层底边线」特例已随仿站 early-return 移入映射层; 其余分支行为不变
  const bottomBorder = `1px solid ${v.headerStyle === 'transparent' ? withAlpha(v.border, 0.5) : v.border}`

  return (
    <header style={{ ...headerBg, borderBottom: bottomBorder, backdropFilter: v.headerStyle === 'gradient' ? 'blur(10px)' : undefined }}>
      {v.headerStyle === 'centered' ? (
        // 报头居中式（paper）：站名居中 + 搜索居中 + 分类导航居中
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-4 py-5">
          {embedMode && (
            <div className="flex w-full justify-end">
              <SiteSwitcher />
            </div>
          )}
          <SiteMark />
          <SearchBox />
          <div className="w-full">
            <div className="flex justify-center">
              <CategoryNav cats={cats} loading={pending} />
            </div>
          </div>
          <BookshelfButton />
        </div>
      ) : v.headerStyle === 'split' ? (
        // 左右分列式（bamboo）：极简细线
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 py-5">
            <SiteMark />
            <div className="hidden items-center gap-3 sm:flex">
              <SearchBox compact />
              <BookshelfButton />
            </div>
            <div className="flex items-center gap-2 sm:hidden">
              <BookshelfButton compact />
            </div>
            {embedMode && <SiteSwitcher />}
          </div>
          <div className="border-t py-2" style={{ borderColor: withAlpha(v.border, 0.6) }}>
            <CategoryNav cats={cats} loading={pending} />
          </div>
        </div>
      ) : (
        // 常规两行式（solid/gradient/transparent）：上行 站名+搜索+切换，下行分类
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <SiteMark />
            <div className="hidden md:block"><SearchBox /></div>
            <div className="flex items-center gap-2">
              <BookshelfButton />
              {/* md 以下用紧凑搜索框（原 sm 断点会在平板区间丢失搜索入口） */}
              <div className="md:hidden"><SearchBox compact /></div>
              {embedMode && <SiteSwitcher />}
            </div>
          </div>
          <div className="pb-2">
            <CategoryNav cats={cats} loading={pending} />
          </div>
        </div>
      )}
    </header>
  )
}
