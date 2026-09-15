// ============================================================
// 站群页脚 — 站名 / 描述 / 友情链接+站群链轮 / 备案风格文本，随 flex 布局置底
// [R23-c-11] R23-c 主题化页脚: 顶部渐变条 / patternBg 装饰层 / 首字徽章辉光 / 版权渐变分隔线
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import { Landmark, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { usePublic } from './ctx'
import { siteKeywordList, withAlpha } from './seo'
import { TagCloud, SuggestTagCloud, designVars } from './bits'
import { fetchFooterLinks, type FooterLinksData } from './data'
// [R27-5b-H1] 友链/外链渲染出口白名单(javascript: 伪协议存储型 XSS 防护)
import { safeHref } from './safe-href'
// [R27-5b-L1] 码点安全截断(UTF-16 slice 代理对防劈半)
import { sliceCodePoints } from '@/lib/utils'

export function SiteFooter() {
  const { site, theme, navigate } = usePublic()
  const v = theme.vars
  // [R23-c-11] 设计 token: patternBg 装饰纹理 / glowColor 辉光(全部 ?? 本地 fallback);
  // 命名 dv 避免与下方 fetch 回调参数 d 遮蔽混淆
  const dv = designVars(theme)
  const glow = dv.glowColor ?? v.primary
  const year = new Date().getFullYear()

  // 友链/链轮 — 客户端拉取, 失败静默降级不渲染模块
  const [footerLinks, setFooterLinks] = useState<FooterLinksData | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  useEffect(() => {
    let alive = true
    fetchFooterLinks(false, site.id).then((d) => {
      if (alive) setFooterLinks(d)
    })
    return () => {
      alive = false
    }
  }, [site.id])

  const refreshWheel = () => {
    if (refreshing) return
    setRefreshing(true)
    fetchFooterLinks(true, site.id)
      .then((d) => {
        if (d) setFooterLinks(d)
      })
      .finally(() => setRefreshing(false))
  }

  const hasFriend = !!footerLinks?.friend.length
  const hasWheel = !!footerLinks?.wheel.length
  return (
    // [R23-c-11] relative+overflow-hidden 承载绝对定位装饰层
    // [R24-5] transparent 通用头部已删, footer 恒透明底(每站自绘)
    <footer className="relative overflow-hidden" style={{ borderTop: `1px solid ${v.border}`, background: 'transparent' }}>
      {/* [R23-c-11] patternBg 存在时: surfaceAlt 半透明底 + 装饰纹理层(absolute, 不拦截交互)。
          注意: surfaceAlt 为 rgba 形态时 withAlpha 安全降级为原色(seo.ts 非 #rrggbb 原样返回) */}
      {dv.patternBg && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: withAlpha(v.surfaceAlt, 0.5) }} />
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: dv.patternBg }} />
        </>
      )}
      {/* [R23-c-11] 顶部 3px 主→accent 渐变条(独立 div) */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${v.primary}, ${v.accent})` }} />
      <div className="relative mx-auto w-full max-w-6xl space-y-4 px-4 py-8 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center text-xs font-black"
              // [R23-c-12] 首字徽章升级: 渐变底(原有) + glowColor 辉光
              style={{ background: `linear-gradient(135deg, ${v.primary}, ${v.accent})`, color: v.primaryText, borderRadius: v.radius, boxShadow: `0 0 12px ${withAlpha(glow, 0.45)}` }}
              aria-hidden
            >
              {sliceCodePoints(site.name, 1)}
            </span>
            <span className="text-sm font-bold" style={{ color: v.text }}>{site.title || site.name}</span>
            <span className="text-xs" style={{ color: v.textMuted }}>{site.domain}</span>
          </div>
          <nav className="flex items-center gap-4 text-xs" aria-label="页脚导航">
            <button type="button" onClick={() => navigate({ view: 'home' })} className="transition-opacity hover:opacity-70" style={{ color: v.textMuted }}>
              首页
            </button>
            <button type="button" onClick={() => navigate({ view: 'search', q: '' })} className="transition-opacity hover:opacity-70" style={{ color: v.textMuted }}>
              搜索
            </button>
            <button type="button" onClick={() => navigate({ view: 'category' })} className="transition-opacity hover:opacity-70" style={{ color: v.textMuted }}>
              更多书籍
            </button>
          </nav>
        </div>
        {site.description && (
          <p className="text-xs leading-relaxed" style={{ color: v.textMuted }}>{site.description}</p>
        )}
        <TagCloud tags={siteKeywordList(site)} />
        {/* 随机下拉词(页脚版: 12 个, 无换一批) */}
        <SuggestTagCloud count={12} />
        {footerLinks && (hasFriend || hasWheel) && (
          <nav
            aria-label="友情链接"
            className="space-y-1.5 text-xs leading-relaxed"
            style={{ color: v.textMuted, borderTop: `1px dashed ${withAlpha(v.border, 0.7)}`, paddingTop: 12 }}
          >
            {hasFriend && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="shrink-0 font-medium" style={{ color: v.text }}>
                  友情链接：
                </span>
                {footerLinks!.friend.map((l) => (
                  <a
                    key={l.id}
                    // [R27-5b-H1] 渲染出口 scheme 白名单: 仅 http/https 放行, 其余(含 javascript: 伪协议存量脏数据)置 '#'
                    href={safeHref(l.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={l.name}
                    className="transition-opacity hover:opacity-70"
                  >
                    {l.name}
                  </a>
                ))}
              </div>
            )}
            {hasWheel && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="shrink-0 font-medium" style={{ color: v.text }}>
                  站群链轮：
                </span>
                {footerLinks!.wheel.map((l) => (
                  <a
                    key={l.url}
                    // [R27-5b-H1] 同友链: 链轮出口同样过白名单(数据源为站内生成, 纵深防御)
                    href={safeHref(l.url)}
                    target="_blank"
                    rel="noopener"
                    title={l.text}
                    className="transition-opacity hover:opacity-70"
                  >
                    {l.text}
                  </a>
                ))}
                <button
                  type="button"
                  onClick={refreshWheel}
                  disabled={refreshing}
                  aria-label="换一批链轮链接"
                  className="ml-1 inline-flex shrink-0 items-center gap-1 rounded border border-dashed px-1.5 py-0.5 text-[11px] transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ borderColor: withAlpha(v.border, 0.9) }}
                >
                  {refreshing ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RefreshCw className="h-3 w-3" aria-hidden />}
                  换一批
                </button>
              </div>
            )}
          </nav>
        )}
        {/* [R23-c-13] 版权行上方渐变细分隔线(两端淡出, 替代素面 dashed 边) */}
        <div aria-hidden className="h-px" style={{ background: `linear-gradient(90deg, transparent, ${withAlpha(v.primary, 0.45)}, transparent)` }} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: v.textMuted }}>
          <span className="inline-flex items-center gap-1">
            <Landmark className="h-3 w-3" aria-hidden />
            © {year} {site.name} · {site.domain} · 保留所有权利
          </span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            本站内容来自公开网络采集，仅作技术演示，如有侵权请联系删除
          </span>
          <span>GEO {site.geoRegion} · {site.geoPlacename}</span>
        </div>
      </div>
    </footer>
  )
}
