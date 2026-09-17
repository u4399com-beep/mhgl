// [R31-7] 拆分自 SiteHeader.tsx（纯机械搬移）—— 搜索建议下拉共享逻辑(词池/建议计算/下拉面板/搜索框逻辑 hook)
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Clock, Search, TrendingUp, X } from 'lucide-react'
import { fetchSuggestTags } from '../data'
import { usePublic } from '../ctx'
import { withAlpha } from '../seo'
import { addSearchHistory, clearSearchHistory, getSearchHistory, removeSearchHistory } from '../search-history'

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

export function SuggestDropdown({
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

export function useSearchBoxLogic(
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

// [R34-2c-3] 搜索框表单提交处理器 — 原先 common(通用)与 9 个仿站头部各自持有逐字节相同的
// 私有闭包(trim 空值 → 记录搜索历史 → 关下拉 → navigate 搜索视图), 收敛为单处工厂。
// 注: 不复用 useSearchBoxLogic 内部 submit()(其额外 setHighlight(-1), 语义不同), 保持原行为逐字节等价。
export function createSearchSubmit(
  logic: Pick<ReturnType<typeof useSearchBoxLogic>, 'q' | 'setOpen'>,
  navigate: ReturnType<typeof usePublic>['navigate'],
): (e: React.FormEvent) => void {
  return (e) => {
    e.preventDefault()
    const t = (logic.q || '').trim()
    if (!t) return
    addSearchHistory(t)
    logic.setOpen(false)
    navigate({ view: 'search', q: t })
  }
}
