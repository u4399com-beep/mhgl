// ============================================================
// 站点头部 — 站名 + 搜索框(带建议下拉) + 分类导航 + (embedMode)站点切换器
// [R23-II-a-1] 按 theme.vars.headerStyle(=SiteCloneId) 以 IMITATION_HEADERS 映射分发仿站头部子组件;
// [R24-6-a-1] 9 个仿站分支: pili/aijjxs/kks101/qb23(真站实测) + ddyueshu/x2552/huangjinwu/
// ggd66/shipsay(按 /tmp/sites/ 真站 HTML/CSS 实测克隆, 替换 R24-5 占位并删除 CloneHeaderShell/CloneNavBtn);
// [R25-4-8] +trxsw 第 10 分支(杰奇 CMS 经典默认模板, /tmp/r25/trxsw-wb.html 快照复刻)
// ============================================================
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, KeyboardEvent } from 'react'
import {
  Book,
  BookOpen,
  ChevronDown,
  CircleUserRound,
  Compass,
  Flame,
  History,
  Home,
  Library,
  List,
  Menu,
  Search,
  Tag,
  TrendingUp,
  X,
  Clock,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getTheme, type SiteCloneId } from '@/lib/crawl/themes'
import { fetchCategories, fetchSuggestTags } from './data'
// [R27-5b-L1] 码点安全截断(UTF-16 slice 代理对防劈半)
import { sliceCodePoints } from '@/lib/utils'
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
    // [R27-5b-M5] 词池改走 fetchSuggestTags 模块级缓存(in-flight 单飞 + sessionStorage 60s TTL):
    // 修前每实例独立 fetch /api/public/tags?n=24 —— 仿站头部桌面+移动双实例同挂, 单页重复请求
    // 3~6 次。120 词池客户端切片 24, 覆盖原 n=24 需求; 失败静默降级语义与原实现一致
    fetchSuggestTags().then((entry) => {
      if (alive) setPool(entry ? entry.tags.slice(0, 24) : [])
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

// ============================================================
// [R24-6-a-14] 5 个新克隆头部(替换 R24-5 占位 CloneHeaderShell/CloneNavBtn, 已删)——
// 逐站依据 /tmp/sites/{name}-home.html + 对应 CSS 实测还原结构/配色/字重/间距/边线。
// 色值全部硬编码为真站实测值; 交互态(hover/active)按真站 CSS 对应规则还原。
// ============================================================

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
function DdyueshuHeader({ cats, pending }: ImitationHeaderProps) {
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

// ------------------------------------------------------------
// x2552(吾爱文学网 x2552.com) — 杰奇 CMS 黑冰 heibing 模板(960px 版心, 12px 微软雅黑密排):
// HTML: div.main.m_head(左 180px logo 图 + 右双行: 口号行/装饰链接行 + 搜索行[搜书|搜作者 70px
// 灰块 + 欢迎登录区]) + div.main.m_menu(40px 菜单条 + 两端 8px 圆头 + 绝对定位 100×30 #666
// 书架块) + 红字灰边公告盒。CSS: a{color:#2f468f} a:hover{color:#ff6600 且位移 1px},
// 菜单条为浅蓝灰渐变雪碧图段(0 -89px repeat-x), 菜单项 14px 加粗不覆写链接色。
// ------------------------------------------------------------

/** [R24-6-a-5] x2552 搜索框 — 真站 .searchbox: 260px 输入区(1px #ccc 边线 + 放大镜) +
 * 70px 灰块「搜书 / 搜作者」双钮(雪碧图按钮以灰块白字还原) */
function X2552SearchBox({ compact }: { compact?: boolean }) {
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
      className={`relative flex items-stretch gap-px ${compact ? 'w-44' : 'w-full max-w-[415px]'}`}
      role="search"
      onSubmit={onSubmit}
      ref={wrapRef}
    >
      <div className="flex min-w-0 flex-1 items-center border border-[#cccccc] bg-white">
        <span className="flex h-full w-7 shrink-0 items-center justify-center" aria-hidden>
          <Search className="h-3.5 w-3.5 text-[#999999]" />
        </span>
        <input
          value={logic.q}
          onChange={(e) => {
            logic.setQ(e.target.value)
            logic.setOpen(true)
            logic.setHighlight(-1)
          }}
          onFocus={() => logic.setOpen(true)}
          onKeyDown={logic.onKeyDown}
          placeholder="搜书名 / 作者"
          className="h-9 w-full min-w-0 bg-transparent pr-2 text-[12px] text-[#666666] outline-none placeholder:opacity-60 sm:h-7"
          aria-label="站内搜索"
          autoComplete="off"
        />
      </div>
      <button
        type="submit"
        className="w-[70px] shrink-0 bg-[#666666] text-[12px] text-white transition-colors hover:bg-[#4d4d4d] max-sm:min-h-[44px]"
        aria-label="按书名搜索"
      >
        搜书
      </button>
      <button
        type="submit"
        className="w-[70px] shrink-0 bg-[#666666] text-[12px] text-white transition-colors hover:bg-[#4d4d4d] max-sm:min-h-[44px]"
        aria-label="按作者搜索"
      >
        搜作者
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

/** [R24-6-a-6] x2552 菜单条 — 真站 .m_menu: 40px 浅蓝灰渐变条(圆头) + 14px 加粗 #2f468f
 * 菜单项, hover #ff6600 且位移 1px(真站 a:hover top/left 1px); 右侧绝对定位 100×30 #666
 * 「我的书架」块(真站 .m_bc); 移动端横滚并隐藏书架块(老模板无移动适配, 按触控惯例放大行高) */
function X2552Nav({ cats, loading }: { cats: CategoryItem[]; loading: boolean }) {
  const { navigate } = usePublic()
  const menuItem =
    'flex min-h-[44px] shrink-0 items-center whitespace-nowrap pl-3 text-[14px] font-bold text-[#2f468f] transition-none hover:translate-x-px hover:translate-y-px hover:text-[#ff6600] md:min-h-[40px]'
  return (
    <div className="mx-auto mt-[5px] w-full max-w-[960px] px-2 md:px-0">
      <div className="relative">
        <div
          className="overflow-x-auto"
          style={{ borderRadius: '4px', background: 'linear-gradient(180deg, #f2f6fa 0%, #dfe8f1 55%, #cdd9e6 100%)' }}
        >
          <ul className="flex w-max min-w-full items-center">
            <li className="w-2 shrink-0" aria-hidden />
            <li>
              <button type="button" onClick={() => navigate({ view: 'home' })} className={menuItem} aria-label="返回首页">
                首页
              </button>
            </li>
            {loading ? (
              <li className="flex items-center gap-3 pl-3" aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Sk key={i} className="h-3.5 w-14" style={{ backgroundColor: 'rgba(47,70,143,0.15)' }} />
                ))}
              </li>
            ) : (
              cats.slice(0, 11).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'category', cat: c.id })}
                    className={menuItem}
                    aria-label={`浏览 ${c.name} 分类`}
                  >
                    {c.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
        <button
          type="button"
          onClick={() => navigate({ view: 'history' })}
          className="absolute right-5 top-1/2 hidden h-[30px] w-[100px] -translate-y-1/2 items-center justify-center bg-[#666666] text-[12px] text-white transition-colors hover:bg-[#4d4d4d] md:flex"
          aria-label="我的书架"
        >
          我的书架
        </button>
      </div>
    </div>
  )
}

/** [R24-6-a-7] x2552 头部 — ①报头(渐变字 logo 180px + 口号行 + 搜索行/欢迎区)
 * ②浅蓝灰菜单条 ③红字公告盒(真站 nav 后 1px #E4E4E4 内联样式公告, 文案按本站口径改写);
 * 装饰链接行(简体版|繁體版|设为首页|联系我们|加入收藏)为纯视觉还原 */
function X2552Header({ cats, pending }: ImitationHeaderProps) {
  const { site, embedMode, navigate } = usePublic()
  const slogan = site.description || site.title || '没有弹窗广告 好看的小说免费阅读'
  return (
    <div
      data-x2552-header
      className="w-full bg-white"
      style={{ fontFamily: '"Microsoft YaHei","微软雅黑",SimSun,Verdana,Arial,sans-serif' }}
    >
      {/* ① 报头(.m_head: 960px, 上边距 10px, 60px 高) */}
      <div className="mx-auto w-full max-w-[960px] px-2 pt-2.5 md:px-0">
        <div className="flex flex-wrap items-stretch gap-x-3 gap-y-2">
          {/* logo — 真站为蓝色渐变字 logo 图(heibing/images/logo.png, 180px), 以渐变裁字还原 */}
          <button
            type="button"
            onClick={() => navigate({ view: 'home' })}
            className="w-[150px] shrink-0 pt-0.5 text-left md:w-[180px]"
            aria-label={`返回 ${site.name} 首页`}
          >
            <span
              className="text-[24px] font-bold leading-tight md:text-[26px]"
              style={{
                backgroundImage: 'linear-gradient(180deg, #5b7bb0, #2f468f)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {site.name}
            </span>
          </button>
          <div className="min-w-0 flex-1">
            {/* 行1: 口号 + 装饰链接(真站右上 12px 链接组, 纯视觉) */}
            <div className="flex items-center justify-between gap-3 text-[12px] leading-5">
              <span className="truncate text-[#666666]">
                {site.name}：{slogan}
              </span>
              <span className="hidden shrink-0 whitespace-nowrap text-[#2f468f] lg:flex" aria-hidden="true">
                <span>简体版</span>
                <span className="px-1 text-[#bbbbbb]">|</span>
                <span>繁體版</span>
                <span className="px-1 text-[#bbbbbb]">|</span>
                <span>设为首页</span>
                <span className="px-1 text-[#bbbbbb]">|</span>
                <span>联系我们</span>
                <span className="px-1 text-[#bbbbbb]">|</span>
                <span>加入收藏</span>
              </span>
            </div>
            {/* 行2: 搜索框 + 欢迎区(真站 loginbox 登录/注册 → 本站书架入口) */}
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <X2552SearchBox />
              <div className="hidden items-center gap-3 text-[12px] text-[#666666] sm:flex">
                <span>
                  欢迎您，[
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'history' })}
                    className="text-[#2f468f] transition-colors hover:text-[#ff6600]"
                  >
                    书架
                  </button>
                  ]
                </span>
                {embedMode && <SiteSwitcher />}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* ② 浅蓝灰菜单条(.m_menu) */}
      <X2552Nav cats={cats} loading={pending} />
      {/* ③ 红字公告盒(真站 nav 下方内联样式公告条: 1px #E4E4E4 边 + 红 12px 25px 行高) */}
      <div className="mx-auto w-full max-w-[960px] px-2 pb-1 pt-[5px] md:px-0">
        <div className="border border-[#e4e4e4] px-2 py-0.5 text-left text-[12px] leading-[25px] text-[#ff0000]">
          <p className="truncate">1、{site.name}：{slogan}，欢迎新老书友前来阅读。</p>
          <p className="truncate">2、感谢大家多年支持，{site.name} 坚持免费小说阅读</p>
        </div>
      </div>
    </div>
  )
}

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
function HuangjinwuHeader({ cats, pending }: ImitationHeaderProps) {
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

// ------------------------------------------------------------
// ggd66(格格党 ggd66.com) — 青绿极简站(simple 模板, 15px 微软雅黑):
// .header: #1abc9c 单条 50px 高(line-height 50px, 阴影 0 1px 1px #1abc9c, 下边距 10px);
// .header-left 18px 白字 text-shadow(1px 1px 2px #000); .header-nav 桌面 300px(项宽 60px,
// 16px, text-shadow 1px 1px 1px #666); .header-right 右侧 15px; a:hover #f50。
// ≤767px: 头部 75pt(100px) 双排 — 导航行 clear + 1px #e9faff 顶边线, 项宽 20% 居中。
// ------------------------------------------------------------

/** [R24-6-a-11] ggd66 头部 — 单条青绿双排响应式(桌面 logo+右链接+300px 导航段 /
 * 移动 100px: 第一行 logo+右链接, 第二行五等分导航) */
function Ggd66Header({ cats, pending }: ImitationHeaderProps) {
  const { site, embedMode, navigate } = usePublic()
  return (
    <div
      data-ggd66-header
      className="mb-2.5 w-full"
      style={{
        background: '#1abc9c',
        boxShadow: '0 1px 1px #1abc9c',
        color: '#ffffff',
        fontFamily: '"Microsoft Yahei","微软雅黑",simsun,arial,sans-serif',
      }}
    >
      <div className="mx-auto flex w-[90%] max-w-[1200px] flex-wrap items-center">
        {/* 第一行: 站名(左) + 阅读历史/切换器(右) */}
        <div className="flex h-[50px] min-w-0 flex-1 items-center">
          <button
            type="button"
            onClick={() => navigate({ view: 'home' })}
            className="mr-5 shrink-0 truncate text-left text-[18px] leading-none"
            style={{ textShadow: '1px 1px 2px #000' }}
            aria-label={`返回 ${site.name} 首页`}
          >
            {site.name}
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-3 text-[15px]">
            <button
              type="button"
              onClick={() => navigate({ view: 'history' })}
              className="transition-colors hover:text-[#ff5500]"
              aria-label="阅读历史"
            >
              阅读历史
            </button>
            {embedMode && <SiteSwitcher />}
          </div>
        </div>
        {/* 桌面导航段(.header-nav: float 300px, 项宽 60px, 白字 text-shadow) */}
        <nav className="hidden w-[300px] shrink-0 items-center md:flex" aria-label="分类导航">
          <button
            type="button"
            onClick={() => navigate({ view: 'home' })}
            className="h-[50px] w-[60px] text-center text-[16px] transition-colors hover:text-[#ff5500]"
            style={{ textShadow: '1px 1px 1px #666' }}
            aria-label="返回首页"
          >
            首 页
          </button>
          {pending ? (
            <span className="flex items-center justify-center px-2" aria-hidden>
              {Array.from({ length: 3 }).map((_, i) => (
                <Sk key={i} className="mx-1 h-4 w-10" style={{ backgroundColor: 'rgba(255,255,255,0.35)' }} />
              ))}
            </span>
          ) : (
            cats.slice(0, 4).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate({ view: 'category', cat: c.id })}
                className="h-[50px] w-[60px] text-center text-[16px] transition-colors hover:text-[#ff5500]"
                style={{ textShadow: '1px 1px 1px #666' }}
                aria-label={`浏览 ${c.name} 分类`}
              >
                {c.name}
              </button>
            ))
          )}
        </nav>
        {/* 移动端第二行导航(≤767px: 1px #e9faff 顶边线, 项宽 20% 居中) */}
        <nav className="flex w-full border-t border-[#e9faff] md:hidden" aria-label="分类导航">
          <button
            type="button"
            onClick={() => navigate({ view: 'home' })}
            className="flex min-h-[44px] w-1/5 items-center justify-center text-center text-[16px] transition-colors hover:text-[#ff5500]"
            style={{ textShadow: '1px 1px 1px #666' }}
            aria-label="返回首页"
          >
            首 页
          </button>
          {cats.slice(0, 4).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate({ view: 'category', cat: c.id })}
              className="flex min-h-[44px] w-1/5 items-center justify-center text-center text-[16px] transition-colors hover:text-[#ff5500]"
              style={{ textShadow: '1px 1px 1px #666' }}
              aria-label={`浏览 ${c.name} 分类`}
            >
              {c.name}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}

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
function ShipsayHeader({ cats, pending }: ImitationHeaderProps) {
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

// ------------------------------------------------------------
// trxsw(同人小说网 trxsw.com) — 杰奇 CMS 经典默认模板(GBK; [R25-4] 结构按 2019-10-19 Wayback
// DOM 快照逐节复刻): div.ywtop > div.ywtop_con(顶部小条) + div.head(div.head_logo > a 站名
// 文字 logo + #searchbar > div.search 搜索框) + div.nav > ul > li(首页/排行榜单/最近更新/同人小说/
// 玄幻奇幻/武侠仙侠/都市言情/历史军事/游戏竞技/科幻灵异/全本小说, 第 12 项为 yuedu() 脚本阅读入口)。
// 真站 b.css 无存档, 配色按杰奇 CMS 默认模板规范还原: .ywtop #f5f5f5 细底边 · logo 红棕 #C00
// 粗体大字 · .nav 深蓝渐变 #1C5087→#1F5FA9 白字(hover 亮蓝) · 顶条灰字 #666。
// ------------------------------------------------------------

/** [R25-4-4] trxsw 搜索框 — 真站 #searchbar .search(SearchBox() 脚本渲染): 直角输入(1px #ccc 边)
 * + 深蓝渐变「搜索」钮(杰奇默认按钮与 nav 同色系) */
function TrxswSearchBox({ compact }: { compact?: boolean }) {
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
      className={`relative flex items-stretch ${compact ? 'w-44' : 'w-[300px]'}`}
      role="search"
      onSubmit={onSubmit}
      ref={wrapRef}
    >
      <div className="flex w-full items-center border bg-white px-2" style={{ borderColor: '#cccccc' }}>
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
          className="h-8 w-full bg-transparent text-sm outline-none placeholder:opacity-55"
          style={{ color: '#333333' }}
          aria-label="站内搜索"
          autoComplete="off"
        />
      </div>
      <button
        type="submit"
        className="shrink-0 px-4 text-sm font-bold text-white transition-[filter] hover:brightness-110 max-sm:min-h-[44px]"
        style={{ background: 'linear-gradient(180deg, #1F5FA9 0%, #1C5087 100%)' }}
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

/** [R25-4-5] trxsw 深蓝渐变分类条 — 真站 div.nav > ul > li(白字链接平铺, hover 亮蓝)。
 *  排行榜单/最近更新/全本小说 真站为排序列表页(0_monthvisit/0_lastupdate/…_2_0), 项目无对应
 *  视图 → 降级书库分类页(同 ShipsayHeader「完本」降级先例); 第 12 项 yuedu() 阅读入口 → 书架 */
function TrxswNav({ cats, loading }: { cats: CategoryItem[]; loading: boolean }) {
  const { navigate } = usePublic()
  const item =
    'inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap px-3.5 text-sm text-white transition-colors hover:bg-[#2569c4] sm:min-h-[36px]'
  return (
    <nav className="overflow-x-auto" style={{ background: 'linear-gradient(180deg, #1F5FA9 0%, #1C5087 100%)' }} aria-label="分类导航">
      <ul className="mx-auto flex w-max min-w-full items-center">
        <li>
          <button type="button" onClick={() => navigate({ view: 'home' })} className={item} aria-label="返回首页">
            首页
          </button>
        </li>
        <li>
          <button type="button" onClick={() => navigate({ view: 'category' })} className={item} aria-label="排行榜单(全部书籍)">
            排行榜单
          </button>
        </li>
        <li>
          <button type="button" onClick={() => navigate({ view: 'category' })} className={item} aria-label="最近更新(全部书籍)">
            最近更新
          </button>
        </li>
        {loading ? (
          <li className="flex items-center gap-3 px-3" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <Sk key={i} className="h-4 w-14" style={{ backgroundColor: 'rgba(255,255,255,0.28)' }} />
            ))}
          </li>
        ) : (
          cats.slice(0, 7).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => navigate({ view: 'category', cat: c.id })}
                className={item}
                aria-label={`浏览 ${c.name} 分类`}
              >
                {c.name}
              </button>
            </li>
          ))
        )}
        <li>
          <button type="button" onClick={() => navigate({ view: 'category' })} className={item} aria-label="全本小说(全部书籍)">
            全本小说
          </button>
        </li>
        <li>
          <button type="button" onClick={() => navigate({ view: 'history' })} className={item} aria-label="我的书架">
            我的书架
          </button>
        </li>
      </ul>
    </nav>
  )
}

/** [R25-4-6] trxsw 头部 — ①.ywtop 浅灰顶条(左站公告 + 右装饰链接行[真站 ywtop_con 内为 d.js
 * 脚本内容, 纯视觉还原不做交互]) ②.head 白底报头(红棕 #C00 粗体文字 logo + #searchbar 搜索框,
 * 移动端紧凑搜索) ③深蓝渐变 .nav 分类条; 960px 版心贴真站 #wrapper 宽度 */
function TrxswHeader({ cats, pending }: ImitationHeaderProps) {
  const { site, embedMode, navigate } = usePublic()
  return (
    <div data-trxsw-header className="w-full bg-white">
      {/* ① .ywtop 顶部小条: 浅灰 #f5f5f5 + 细底边, 12px 灰字 */}
      <div style={{ background: '#f5f5f5', borderBottom: '1px solid #e5e5e5' }}>
        <div className="mx-auto flex w-full max-w-[960px] items-center justify-between gap-3 px-2 py-1.5 text-xs" style={{ color: '#666666' }}>
          <span className="min-w-0 truncate">{site.description || site.title || '本站所有小说均由网友上传，如有侵权请联系我们删除'}</span>
          <span aria-hidden className="hidden shrink-0 sm:block">
            设为首页 ｜ 加入收藏 ｜ 联系我们
          </span>
        </div>
      </div>
      {/* ② .head 报头: 白底, div.head_logo 红棕 #C00 粗体大字 + #searchbar 搜索框 */}
      <div className="mx-auto flex w-full max-w-[960px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-2 py-4">
        <button
          type="button"
          onClick={() => navigate({ view: 'home' })}
          className="shrink-0 text-[26px] font-bold leading-none tracking-wide transition-opacity hover:opacity-80 sm:text-[30px]"
          style={{ color: '#C00' }}
          aria-label={`返回 ${site.name} 首页`}
        >
          {site.name}
        </button>
        <div className="hidden md:block">
          <TrxswSearchBox />
        </div>
        <div className="flex items-center gap-2">
          {embedMode && <SiteSwitcher />}
          <div className="md:hidden">
            <TrxswSearchBox compact />
          </div>
        </div>
      </div>
      {/* ③ .nav 深蓝渐变分类条(#1C5087→#1F5FA9, 白字 hover 亮蓝) */}
      <TrxswNav cats={cats} loading={pending} />
    </div>
  )
}

/** 仿站头部分支统一 props(分类数据由主组件 useCategories 单点拉取后下发) */
interface ImitationHeaderProps {
  cats: CategoryItem[]
  pending: boolean
}

// ============================================================
// [R24-5] 9 站克隆头部 + [R25-4] trxsw 第 10 分支 —— headerStyle(=SiteCloneId) → 各站专属头部子组件。
//   aijjxs/pili/kks101(原 kks)/qb23(原 qb) 为既有真站实测头部, 视觉行为不变;
//   ddyueshu/x2552/huangjinwu/ggd66/shipsay 为 [R24-6] 新增克隆头部(通用样式分支已删);
//   trxsw 为 [R25-4] 新增(杰奇 CMS 经典默认模板, b.css 无存档配色按杰奇默认模板规范还原)。
// ============================================================
const IMITATION_HEADERS: Record<SiteCloneId, ComponentType<ImitationHeaderProps>> = {
  aijjxs: AijjxsHeader,
  pili: PiliHeader,
  kks101: KksHeader,
  qb23: QbHeader,
  ddyueshu: DdyueshuHeader,
  x2552: X2552Header,
  huangjinwu: HuangjinwuHeader,
  ggd66: Ggd66Header,
  shipsay: ShipsayHeader,
  trxsw: TrxswHeader, // [R25-4-7]
}

// [R24-5] 外层底边线特例: aijjxs 真站头部带 1px 边线, 其余站头部自绘边线/无外层边线
const HEADER_BOTTOM_BORDER: Partial<Record<SiteCloneId, 'site-border'>> = { aijjxs: 'site-border' }

export function SiteHeader() {
  const { theme } = usePublic()
  const v = theme.vars
  const { cats, pending } = useCategories()
  const style: SiteCloneId = v.headerStyle

  const Branch = IMITATION_HEADERS[style] || IMITATION_HEADERS.aijjxs
  return (
    <header
      style={{
        background: 'transparent',
        borderBottom: HEADER_BOTTOM_BORDER[style] ? `1px solid ${v.border}` : 'none',
      }}
    >
      <Branch cats={cats} pending={pending} />
    </header>
  )
}
