// [R31-7] 拆分自 SiteHeader.tsx（纯机械搬移）—— qb23 仿站头部(system-ui 圆角搜索/浅色分类条/头部)
'use client'

import { useRef } from 'react'
import { Library, Search } from 'lucide-react'
import { usePublic } from '../ctx'
import { withAlpha } from '../seo'
import type { CategoryItem } from '../types'
import { Sk } from '../bits'
import { createSearchSubmit, SuggestDropdown, useSearchBoxLogic } from './search-suggest' // [R34-2c-3] +createSearchSubmit
import { SiteSwitcher } from './common'

// ============================================================
// [R23-II-a-5] qb 仿站搜索框 — 铅笔小说(www.23qb.com)system-ui 圆角(8px)输入 + 朱红方块提交钮
// ============================================================
function QbSearchBox({ compact }: { compact?: boolean }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  const wrapRef = useRef<HTMLFormElement | null>(null)
  const logic = useSearchBoxLogic('', wrapRef, (term) => navigate({ view: 'search', q: term }))

  // [R34-2c-3] 原逐字节重复的提交闭包收敛至 search-suggest 单处定义
  const onSubmit = createSearchSubmit(logic, navigate)

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
export function QbHeader({ cats, pending }: { cats: CategoryItem[]; pending: boolean }) {
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
