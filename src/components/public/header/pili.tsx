// [R31-7] 拆分自 SiteHeader.tsx（纯机械搬移）—— pili 仿站头部(搜索框/奶油渐变分类条/头部)
'use client'

import { useRef } from 'react'
import { Library } from 'lucide-react'
import { usePublic } from '../ctx'
import type { CategoryItem } from '../types'
import { Sk } from '../bits'
import { createSearchSubmit, SuggestDropdown, useSearchBoxLogic } from './search-suggest' // [R34-2c-3] +createSearchSubmit
import { SiteMark, SiteSwitcher } from './common'

/** pili 搜索框 — 复古直角输入 + 橙色方块提交钮 + 建议下拉 */
function PiliSearchBox() {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  const wrapRef = useRef<HTMLFormElement | null>(null)
  const logic = useSearchBoxLogic('', wrapRef, (term) => navigate({ view: 'search', q: term }))

  // [R34-2c-3] 原逐字节重复的提交闭包收敛至 search-suggest 单处定义
  const onSubmit = createSearchSubmit(logic, navigate)

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
export function PiliHeader({ cats, pending }: { cats: CategoryItem[]; pending: boolean }) {
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
