// [R31-7] 拆分自 SiteHeader.tsx（纯机械搬移）—— ggd66 仿站头部(青绿极简单条双排响应式)
'use client'

import { usePublic } from '../ctx'
import { Sk } from '../bits'
import { SiteSwitcher } from './common'
import type { ImitationHeaderProps } from './registry'

// ------------------------------------------------------------
// ggd66(格格党 ggd66.com) — 青绿极简站(simple 模板, 15px 微软雅黑):
// .header: #1abc9c 单条 50px 高(line-height 50px, 阴影 0 1px 1px #1abc9c, 下边距 10px);
// .header-left 18px 白字 text-shadow(1px 1px 2px #000); .header-nav 桌面 300px(项宽 60px,
// 16px, text-shadow 1px 1px 1px #666); .header-right 右侧 15px; a:hover #f50。
// ≤767px: 头部 75pt(100px) 双排 — 导航行 clear + 1px #e9faff 顶边线, 项宽 20% 居中。
// ------------------------------------------------------------

/** [R24-6-a-11] ggd66 头部 — 单条青绿双排响应式(桌面 logo+右链接+300px 导航段 /
 * 移动 100px: 第一行 logo+右链接, 第二行五等分导航) */
export function Ggd66Header({ cats, pending }: ImitationHeaderProps) {
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
