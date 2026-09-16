// [R31-7] 拆分自 SiteHeader.tsx（纯机械搬移）—— x2552 仿站头部(杰奇 CMS 黑冰模板: 搜书/搜作者搜索框/菜单条/头部)
'use client'

import { useRef } from 'react'
import { Search } from 'lucide-react'
import { usePublic } from '../ctx'
import type { CategoryItem } from '../types'
import { Sk } from '../bits'
import { addSearchHistory } from '../search-history'
import { SuggestDropdown, useSearchBoxLogic } from './search-suggest'
import { SiteSwitcher } from './common'
import type { ImitationHeaderProps } from './registry'

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
export function X2552Header({ cats, pending }: ImitationHeaderProps) {
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
