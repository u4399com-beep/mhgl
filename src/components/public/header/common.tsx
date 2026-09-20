// [R31-7] 拆分自 SiteHeader.tsx（纯机械搬移）—— 公共件(站点切换器), 供仿站头部复用。
// [R49-3-1] SearchBox/BookshelfButton/SiteMark 三个零引用死件删除(R31-7 拆分时迁入的默认头部
//   消费点早已随各站仿制头部落地而消失, ts-prune+rg 双确认零引用; 各站搜索框均为独立仿站件)
'use client'

import { ChevronDown, Compass } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getTheme } from '@/lib/crawl/themes'
import { usePublic } from '../ctx'
import { withAlpha } from '../seo'

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

