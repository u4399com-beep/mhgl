// [R31-7] 拆分自 SiteHeader.tsx（纯机械搬移）—— trxsw 仿站头部(杰奇 CMS 经典默认模板: 浅灰顶条/红棕 logo 报头/深蓝渐变分类条)
'use client'

import { useRef } from 'react'
import { usePublic } from '../ctx'
import type { CategoryItem } from '../types'
import { Sk } from '../bits'
import { createSearchSubmit, SuggestDropdown, useSearchBoxLogic } from './search-suggest' // [R34-2c-3] +createSearchSubmit
import { SiteSwitcher } from './common'
import type { ImitationHeaderProps } from './registry'

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

  // [R34-2c-3] 原逐字节重复的提交闭包收敛至 search-suggest 单处定义
  const onSubmit = createSearchSubmit(logic, navigate)

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
export function TrxswHeader({ cats, pending }: ImitationHeaderProps) {
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
