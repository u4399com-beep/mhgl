// ============================================================
// 前台站群站点渲染 SPA 主壳
// - 站点数据加载 + 主题应用（inline vars）
// - 内部视图路由（home/book/read/search/keyword/category）
// - window.history.replaceState 同步查询串
// - embedMode：顶栏站点切换 + 左下角返回后台悬浮按钮
// - 主题预览覆盖：仅首载入口解析 ?theme=<themeId>（后台主题卡片"预览前台"
//   深链），临时覆盖站点主题呈现在线预览；不入 viewToUrl/parseView 持久化，
//   站内 pushState 导航保持预览，切换站点即还原站点自身主题
// ============================================================
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftCircle, Eye } from 'lucide-react'
import { applyThemeOverrides, getTheme } from '@/lib/crawl/themes'
import { parsePrettyPath } from '@/lib/pseudostatic'
import { fetchSites } from './data'
import { parseView, presetOfSites, PublicProvider, viewToUrl, type PublicCtxValue, type ViewParams } from './ctx'
import { useSiteSEO, withAlpha } from './seo'
import { SiteHeader } from './SiteHeader'
import { SiteFooter } from './SiteFooter'
import { HomeView } from './HomeView'
import { BookView } from './BookView'
import { ReadView } from './ReadView'
import { SearchView } from './SearchView'
import { KeywordView } from './KeywordView'
import { CategoryView } from './CategoryView'
import { HistoryView } from './HistoryView'
// [R27-5b-H2] 克隆模板注册表(theme.id → SiteTemplateSet): 五视图分发 + css 注入单一出处
import { getTemplateSet } from './sites/registry'
// [R41-2] 克隆页脚: 模板集命中且声明 Footer 时优先渲染源站仿制页脚(缺省通用 SiteFooter)
const CloneFooter = ({ tplSet }: { tplSet: ReturnType<typeof getTemplateSet> }) => {
  const TF = tplSet?.Footer
  return TF ? <TF /> : <SiteFooter />
}
// [R27-5b-H2] 目录视图壳: renderView 补齐 ctx 已承认的 view='toc' 分支(修深链软死链)
import { TocView } from './TocView'
// [R28-0] 扩展页型视图壳: 排行榜/全本完本
import { RankingView } from './RankingView'
import { FulltextView } from './FulltextView'
import { Sk } from './bits'
import { FeedbackWidget } from './FeedbackWidget'
import { BackToTop } from './BackToTop'
import { InstallPrompt } from './InstallPrompt'
import type { SiteInfo } from './types'

export type { ViewParams, PublicView } from './ctx'

export default function PublicSite({
  initialSiteId,
  initialView,
  onBack,
  embedMode,
}: {
  initialSiteId?: string
  initialView?: { view: 'home' | 'book' | 'read' | 'search' | 'keyword' | 'category' | 'history' | 'toc'; bookId?: string; chapterId?: string; q?: string; tag?: string; cat?: string; page?: number; theme?: string }
  onBack?: () => void
  embedMode?: boolean
}) {
  const [sites, setSites] = useState<SiteInfo[]>([])
  const [siteId, setSiteId] = useState('')
  const [view, setView] = useState<ViewParams>(() => {
    // 深链保真: initialView 已是 parseView 同构的完整参数(cat/page 等), 逐字段透传
    // (原先硬捾 cat: undefined 使 /?view=category&cat=x 深链/刷新丢分类过滤, 而
    //  viewToUrl 自身序列化 cat、parseView 反解 cat —— 只丢首载入口一环)
    if (initialView) {
      // theme 是主题预览覆盖参数, 归 themeOverride state 管, 不混入视图路由参数
      const { theme: _themeOverride, ...rest } = initialView
      return rest as ViewParams
    }
    if (typeof window !== 'undefined') return parseView(window.location.search)
    return { view: 'home' }
  })
  const [loadErr, setLoadErr] = useState('')
  // 主题预览覆盖(?theme=): 仅首载入口参数, 不进 viewToUrl/parseView 持久化 ——
  // 站内导航保持预览; switchSite 切站即清除(语义: 预览只看这一主题, 切站还原)
  const [themeOverride, setThemeOverride] = useState<string | null>(() => {
    if (initialView?.theme) return initialView.theme
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('theme')
      if (t) return t
    }
    return null
  })

  // 挂载：加载站点列表并选定站点
  useEffect(() => {
    let alive = true
    const parsed = initialView ? ({ ...initialView } as ViewParams) : parseView(window.location.search)
    const wantedSite = initialSiteId || parsed.site || ''
    fetchSites()
      .then((list) => {
        if (!alive) return
        // ii-a 修复: 停用站点(status=false)不进前台 —— 站点选择 fallback 链与切换器
        // 均只在启用站内进行, 修前停用站仍可经默认站 fallback/切换器/深链直达
        const active = list.filter((x) => x.status !== false)
        setSites(active)
        // site 参数非法时兜底：默认站点 → 列表第一个，而不是白屏
        const s = active.find((x) => x.id === wantedSite) || active.find((x) => x.isDefault) || active[0]
        if (s) setSiteId(s.id)
        else setLoadErr('暂无可用站点，请先在后台创建站点')
      })
      .catch((e: Error) => {
        if (!alive) return
        setLoadErr(e.message || '站点加载失败')
      })
    return () => {
      alive = false
    }
    // 仅挂载一次: initialSiteId / initialView 是 mount-once 初值, 加入 deps 会令父组件
    // 每次渲染都重拉站点列表并覆盖用户后续切换 —— 故刻意空数组, 仅首载注入。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 浏览器前进/后退：同步 URL → 内部 state（pushState 写入的历史可回退恢复）
  // 伪静态: 历史里可能是 /book/… /read/… 路径(search 无 view 参数) → 走 /api/public/resolve
  //  异步解析回真实 id; 连续快速后退用序号防旧响应覆盖新视图
  const resolveSeqRef = useRef(0)
  useEffect(() => {
    const onPop = () => {
      const sp = new URLSearchParams(window.location.search)
      const site = sp.get('site') || undefined
      if (site && sites.some((s) => s.id === site)) setSiteId(site)
      if (parsePrettyPath(window.location.pathname)) {
        const seq = ++resolveSeqRef.current
        fetch(`/api/public/resolve?path=${encodeURIComponent(window.location.pathname + window.location.search)}`)
          .then((r) => r.json())
          .then((j: { ok?: boolean; data?: { view: 'book' | 'read'; bookId?: string; chapterId?: string } | null }) => {
            if (seq !== resolveSeqRef.current || !j?.ok || !j.data) return
            setView({
              view: j.data.view,
              bookId: j.data.bookId || undefined,
              chapterId: j.data.chapterId || undefined,
              page: Number(sp.get('page')) || 1,
              // [R27-5b-L10] 无效 site 参数不进 view state(修前原样带上, viewToUrl 以旧 siteId 生成链接失同步)
              site: site && sites.some((s) => s.id === site) ? site : undefined,
            })
          })
          .catch(() => {})
        return
      }
      const p = parseView(window.location.search)
      // [R27-5b-L10] 无效 site 参数从 view 参数剥离: 修前 view.site 保留非法值,
      // 后续 viewToUrl 以旧 siteId 生成链接 → view 与 siteId 轻微失同步
      const siteValid = !p.site || sites.some((s) => s.id === p.site)
      setView(siteValid ? p : { ...p, site: undefined })
      if (siteValid && p.site) setSiteId(p.site)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [sites])

  // 伪静态首载兜底: 无 initialView 且路径为伪静态(Shell 重挂载等边缘场景) → resolve 恢复视图。
  // 正常入口两态: catch-all SSR 已传 initialView(零闪烁) / 查询串路由 parseView 即得。
  useEffect(() => {
    if (initialView) return
    if (!parsePrettyPath(window.location.pathname)) return
    const seq = ++resolveSeqRef.current
    fetch(`/api/public/resolve?path=${encodeURIComponent(window.location.pathname + window.location.search)}`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; data?: { view: 'book' | 'read'; bookId?: string; chapterId?: string } | null }) => {
        if (seq !== resolveSeqRef.current || !j?.ok || !j.data) return
        setView({
          view: j.data.view,
          bookId: j.data.bookId || undefined,
          chapterId: j.data.chapterId || undefined,
          site: new URLSearchParams(window.location.search).get('site') || undefined,
        })
      })
      .catch(() => {})
    // initialView 是 mount-once 初值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const site = useMemo(() => sites.find((s) => s.id === siteId) || null, [sites, siteId])
  // 伪静态预设(全局设置, 站点列表接口附带); 预设≠query 时站内书籍页/阅读页链接走伪静态路径
  // (声明先于 navigate: 依赖数组立即求值, 后置声明会触发 TDZ)
  const pseudoPreset = useMemo(() => presetOfSites(sites), [sites])
  // 主题解析: 预览覆盖(?theme=)优先于站点自身主题; getTheme 对非法 id(旧 preset/旧组合/'aurora')自回退 THEMES[0]
  // [R36-2a-6] 主题覆盖(阅读设置+页面底部, 随站点引导下发): 对解析结果应用 applyThemeOverrides;
  //   未下发/未命中/缺省段 → 原样返回等价主题(前台零行为变化)。overrides 引用随 sites 状态稳定,
  //   useMemo 依赖含它保证下发/变更后重算; SSR/CSR 一致(首载两侧均为未合并 base, 数据就绪后同步合并)
  const overridesMap = site?.themeOverrides
  const theme = useMemo(() => {
    const base = getTheme(themeOverride || site?.themeId)
    return applyThemeOverrides(base, overridesMap?.[base.id])
  }, [themeOverride, site?.themeId, overridesMap])
  // [R27-5b-H2] 克隆模板集(registry 命中才有): css 注入 + 视图壳内五视图分发
  const tplSet = getTemplateSet(theme.id)

  // 站内导航：setState + pushState（保留历史，后退可回上一视图）+ 回顶
  // 伪静态: preset≠query 且注册表命中时 push /book/{num}.html / /read/{num}/{idx}.html
  const navigate = useCallback(
    (p: ViewParams) => {
      setView(p)
      window.history.pushState(null, '', viewToUrl(p, siteId, pseudoPreset))
      window.scrollTo({ top: 0 })
    },
    [siteId, pseudoPreset],
  )

  // embedMode 站点切换：切站点回首页并带 site 参数；同时解除主题预览覆盖(还原站点自身主题)
  const switchSite = useCallback(
    (id: string) => {
      setSiteId(id)
      setThemeOverride(null)
      const p: ViewParams = { view: 'home', site: id }
      setView(p)
      window.history.pushState(null, '', viewToUrl(p, id, pseudoPreset))
      window.scrollTo({ top: 0 })
    },
    [pseudoPreset],
  )

  const ctxValue: PublicCtxValue | null = useMemo(
    () =>
      site
        ? {
            site,
            sites,
            theme,
            // [R36-2a-fix-1] 当前主题覆盖下发给克隆阅读器(useReaderFont 基线/行距倍率); 未编辑=undefined
            themeOverride: overridesMap?.[theme.id],
            pseudoPreset,
            embedMode: !!embedMode,
            // embedMode 下切换器走 navigate({view:'home', site:id}) 也可；提供 switchSite 保持语义清晰
            navigate: (p) => {
              if (p.site && p.site !== site.id) {
                switchSite(p.site)
              } else {
                navigate(p)
              }
            },
          }
        : null,
    [site, sites, theme, pseudoPreset, embedMode, navigate, switchSite, overridesMap],
  )

  // 首屏加载期 SEO 兜底（仅站点未就绪时接管 head；站点就绪后完全退位给各视图，防止父子互覆盖）
  useSiteSEO({
    // [R15-a1-7] 错误态标题与 robots: 修前加载失败屏仍挂「站点加载中」标题且 index,follow
    // (错误页可被收录形成软 404); 站点就绪后本 hook 退位, 不影响正常视图 TDK
    title: loadErr ? '站点加载失败' : '站点加载中',
    robots: loadErr ? 'noindex,nofollow' : undefined,
    site: null,
    enabled: !site,
  })

  /* ---------- 加载中 / 失败外壳 ---------- */
  if (loadErr) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#12121a] px-4 text-center" style={{ fontFamily: theme.vars.fontFamily }}>
        <p className="text-lg font-bold text-white">站点加载失败</p>
        <p className="text-sm text-white/60">{loadErr}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-white/10 px-5 py-2 text-sm text-white transition-opacity hover:opacity-80"
        >
          重新加载
        </button>
        {embedMode && onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/60 transition-opacity hover:opacity-80"
            aria-label="返回后台"
          >
            <ArrowLeftCircle className="h-4 w-4" aria-hidden />
            返回后台
          </button>
        )}
      </div>
    )
  }

  if (!ctxValue || !site) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#12121a] px-4" style={{ fontFamily: theme.vars.fontFamily }}>
        <div className="flex items-center gap-2 text-sm text-white/70">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white/70" aria-hidden />
          正在进入阅读站…
        </div>
        <Sk className="mt-2 h-3 w-40" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />
      </div>
    )
  }

  const v = theme.vars

  const renderView = () => {
    switch (view.view) {
      case 'book':
        return <BookView key={`book-${view.bookId || ''}-${site.id}`} bookId={view.bookId} tocPage={view.page || 1} />
      case 'read':
        return <ReadView key={`read-${view.chapterId || ''}`} chapterId={view.chapterId} />
      case 'search':
        return <SearchView key={`search-${view.q || ''}`} q={view.q} />
      case 'history':
        return <HistoryView key={`history-${site.id}`} />
      case 'keyword':
        return <KeywordView key={`kw-${view.tag || ''}`} tag={view.tag} />
      case 'category':
        return <CategoryView key={`cat-${view.cat || ''}-${site.id}`} cat={view.cat} page={view.page || 1} />
      // [R27-5b-H2] 补齐 ctx VIEW_LIST 已承认的 'toc' 视图分支(修前缺 case → 深链静默渲染首页软死链)
      case 'toc':
        return <TocView key={`toc-${view.bookId || ''}-${site.id}`} bookId={view.bookId} page={view.page || 1} />
      // [R28-0] 扩展页型: 排行榜(三榜 tab)/全本·完本(status=completed 列表)
      case 'ranking':
        return <RankingView key={`ranking-${site.id}`} />
      case 'fulltext':
        return <FulltextView key={`fulltext-${site.id}-${view.page || 1}`} page={view.page || 1} />
      default:
        return <HomeView key={`home-${site.id}-${view.cat || ''}`} page={view.page || 1} cat={view.cat} />
    }
  }

  return (
    <PublicProvider value={ctxValue}>
      <div
        // [R24-5] clone-{id} 作用域类: 主题 customCss(每站克隆细节 CSS)以此前缀选择器
        className={`relative flex min-h-screen w-full flex-col clone-${theme.id}`}
        style={{
          background: v.bg,
          color: v.text,
          fontFamily: v.fontFamily,
          minHeight: '100vh',
        }}
      >
        {/* [R24-5] 每站克隆细节 CSS(theme.customCss, 选择器以 .clone-{id} 作用域); 主题切换随 React 重渲染同步更新 */}
        {theme.customCss ? <style data-theme-clone-css>{theme.customCss}</style> : null}
        {/* [R27-5b-H2] 克隆模板 css(registry 命中站点的 SiteTemplateSet.css, 同 .clone-{id} 作用域通道叠加注入) */}
        {tplSet?.css ? <style data-template-clone-css>{tplSet.css}</style> : null}
        {/* [R23-主-1] 全站装饰纹理层: 主题 patternBg 存在时铺底(纯 CSS 图案: 点阵/网格/织锦), 内容层 relative 置于其上 */}
        {v.patternBg && (
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: v.patternBg }} />
        )}
        <div className="relative flex w-full flex-1 flex-col">
          <SiteHeader />
          <main className="w-full flex-1">{renderView()}</main>
          {/* [R41-2] 页脚优先走克隆模板的源站仿制 Footer, 未接入站点回落通用 SiteFooter */}
          <CloneFooter tplSet={tplSet} />
        </div>

        {embedMode && (
          <button
            type="button"
            onClick={onBack}
            className="fixed bottom-5 left-5 z-50 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold shadow-lg transition-transform hover:scale-105"
            style={{
              background: `linear-gradient(120deg, ${v.primary}, ${v.accent})`,
              color: v.primaryText,
              boxShadow: `0 8px 24px ${withAlpha(v.primary, 0.45)}`,
            }}
            aria-label="返回后台管理系统"
          >
            <ArrowLeftCircle className="h-4 w-4" aria-hidden />
            返回后台
          </button>
        )}

        {/* 主题预览指示胶囊: ?theme= 覆盖生效期间展示(不遮内容, 切站后随覆盖解除而消失) */}
        {embedMode && themeOverride && (
          <div
            className="fixed bottom-[72px] left-5 z-50 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-zinc-900/75 px-3 py-1 text-xs text-zinc-300 shadow-lg backdrop-blur"
            aria-label="主题预览指示"
          >
            <Eye className="h-3 w-3 text-teal-300" aria-hidden />
            预览主题：{theme.name}
          </div>
        )}

        {/* feat-round-7: 全站悬浮反馈 + 返回顶部 (与 embedMode 返回后台按钮错位避让) */}
        <BackToTop />
        <FeedbackWidget />
        {/* feat-round-11 B3: PWA 安装提示横幅(仅 beforeinstallprompt 触发时展示, 7 天 dismiss) */}
        <InstallPrompt />
      </div>
    </PublicProvider>
  )
}
