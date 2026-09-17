// [R31-7] 拆分自 SiteHeader.tsx（纯机械搬移）—— kks101 仿站头部(直角蓝框搜索/米黄公告条/蓝色导航条/头部)
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
// [R23-II-a-2] kks 仿站搜索框 — 101看書(www.101kks.com)直角蓝框输入 + 蓝色方块提交钮
// (真站 4px 圆角扁平无阴影 14px 紧凑气质; compact=窄输入+图标钮, 参考通用 SearchBox 做法)
// ============================================================
function KksSearchBox({ compact }: { compact?: boolean }) {
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
export function KksHeader({ cats, pending }: { cats: CategoryItem[]; pending: boolean }) {
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
