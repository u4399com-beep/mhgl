'use client'

// ============================================================
// 主题模板 — 9 套精选主题卡片 / 预览 / 设为默认站点主题
// [R10-a-4] 新增「组合主题浏览器」: 50400 套配色×风格×布局组合主题的
//   搜索(服务端 ?q=, 输入防抖 300ms) + 分页(24|48|96 条/页) + 应用入口,
//   卡片保留「预览前台」「设为默认站点主题」两个动作(与精选卡片同逻辑)
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Layers,
  Loader2,
  Palette,
  RefreshCw,
  Search,
  Star,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, type SiteRow } from './helpers'

interface ThemeRow {
  id: string
  name: string
  desc: string
  layout: string
  dark: boolean
  /** 阅读页布局配置（themes API 直接返回注册表, 旧数据可缺省） */
  read?: { layout?: string }
  preview: [string, string, string]
}

/** 分页模式响应(带 ?q= 搜索时 total 为过滤后总数, totalAll 恒为全库 50409) */
interface ThemesPageResp {
  page: number
  size: number
  total: number
  totalAll: number
  totalPages: number
  items: ThemeRow[]
}

/** 阅读布局中文标签（与 themes.ts READ_LAYOUT_LABEL 对齐, 避免引入服务端模块） */
const READ_LABEL: Record<string, string> = {
  classic: '典书版',
  immersive: '沉浸暗夜',
  paginated: '分页横滑',
  pili: '书屋版',
}

/** [R10-a-4] 首页布局中文标签（与 theme-matrix LAYOUTS.homeLayout 对齐, 前端独立映射） */
const HOME_LABEL: Record<string, string> = {
  grid: '网格',
  list: '列表',
  shelf: '书架',
  magazine: '杂志',
  minimal: '极简',
  theater: '剧院',
  pili: '霹雳',
}

/** [R10-a-4] 组合主题浏览器每页条数档位 */
const PAGE_SIZES = [24, 48, 96]

/** hex → rgba 淡色（缩略图主题色着色用; 非 6 位 hex 色值原样返回兜底） */
function tint(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec((hex || '').trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** 阅读版式缩略示意 — 同时体现 readLayout 版式差异与主题 preview 三色配色差异 */
function ReadMiniPreview({ layout, preview }: { layout: string; preview: [string, string, string] }) {
  const [bg, primary, accent] = preview
  // 外框底色 = 主题 bg 色(preview[0]), 描边 = 主题 primary 淡色
  const frame = { background: bg, border: `1px solid ${tint(primary, 0.35)}` }
  if (layout === 'pili') {
    // 书屋版: 顶部细橙头条 + 暖纸面行 + 底部橙色翻章条
    return (
      <div className="relative h-12 w-full overflow-hidden rounded-md" style={frame} aria-hidden>
        <span className="absolute inset-x-0 top-0 block h-2" style={{ backgroundColor: tint(primary, 0.85) }} />
        <span className="absolute left-1/2 top-[14px] block h-1 w-1/3 -translate-x-1/2 rounded" style={{ backgroundColor: tint(primary, 0.75) }} />
        <span className="absolute left-1/2 top-[22px] block h-0.5 w-3/4 -translate-x-1/2 rounded" style={{ backgroundColor: tint(primary, 0.3) }} />
        <span className="absolute left-1/2 top-[27px] block h-0.5 w-2/3 -translate-x-1/2 rounded" style={{ backgroundColor: tint(primary, 0.26) }} />
        <span className="absolute inset-x-3 bottom-1 flex h-2.5 items-center justify-between rounded-sm px-1" style={{ backgroundColor: tint(primary, 0.88) }}>
          <span className="block h-0.5 w-3 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.9)' }} />
          <span className="block h-0.5 w-3 rounded" style={{ backgroundColor: tint(accent, 0.9) }} />
          <span className="block h-0.5 w-3 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.9)' }} />
        </span>
      </div>
    )
  }
  if (layout === 'immersive') {
    // 全幅暗底 + 底部翻章条 + 右下悬浮胶囊
    return (
      <div className="relative h-12 w-full overflow-hidden rounded-md" style={frame} aria-hidden>
        <span className="absolute inset-x-2 top-2 block h-1 w-10 rounded" style={{ backgroundColor: tint(primary, 0.9) }} />
        <span className="absolute inset-x-2 top-[18px] block h-1 w-full max-w-[85%] rounded" style={{ backgroundColor: tint(primary, 0.45) }} />
        <span className="absolute inset-x-2 top-[28px] block h-1 w-full max-w-[78%] rounded" style={{ backgroundColor: tint(primary, 0.4) }} />
        <span className="absolute inset-x-2 top-[38px] block h-1 w-full max-w-[60%] rounded" style={{ backgroundColor: tint(primary, 0.32) }} />
        <span className="absolute bottom-1 left-1/2 flex h-2.5 w-16 -translate-x-1/2 items-center justify-center rounded-full" style={{ backgroundColor: tint(accent, 0.4) }} />
        <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full" style={{ backgroundColor: tint(accent, 0.85) }} />
      </div>
    )
  }
  if (layout === 'paginated') {
    // 双列对开页 + 页码
    return (
      <div className="flex h-12 w-full gap-1.5 overflow-hidden rounded-md p-1.5" style={frame} aria-hidden>
        <span className="flex-1 space-y-1 rounded-sm p-1" style={{ backgroundColor: tint(primary, 0.14) }}>
          <span className="block h-1 w-3/4 rounded" style={{ backgroundColor: tint(primary, 0.6) }} />
          <span className="block h-0.5 w-full rounded" style={{ backgroundColor: tint(primary, 0.32) }} />
          <span className="block h-0.5 w-full rounded" style={{ backgroundColor: tint(primary, 0.32) }} />
          <span className="block h-0.5 w-5/6 rounded" style={{ backgroundColor: tint(primary, 0.32) }} />
        </span>
        <span className="flex-1 space-y-1 rounded-sm p-1" style={{ backgroundColor: tint(primary, 0.14) }}>
          <span className="block h-0.5 w-full rounded" style={{ backgroundColor: tint(primary, 0.32) }} />
          <span className="block h-0.5 w-full rounded" style={{ backgroundColor: tint(primary, 0.32) }} />
          <span className="block h-0.5 w-2/3 rounded" style={{ backgroundColor: tint(primary, 0.32) }} />
          <span className="ml-auto block h-1 w-6 rounded" style={{ backgroundColor: tint(accent, 0.65) }} />
        </span>
      </div>
    )
  }
  // classic: 居中窄栏纸面 + 三键导航
  return (
    <div className="flex h-12 w-full flex-col items-center overflow-hidden rounded-md px-4 py-1.5" style={frame} aria-hidden>
      <span className="block h-1.5 w-1/2 rounded" style={{ backgroundColor: tint(primary, 0.8) }} />
      <span className="mt-1 block h-0.5 w-1/3 rounded" style={{ backgroundColor: tint(primary, 0.45) }} />
      <span className="mt-1 block h-0.5 w-full max-w-[80%] rounded" style={{ backgroundColor: tint(primary, 0.26) }} />
      <span className="mt-0.5 block h-0.5 w-full max-w-[80%] rounded" style={{ backgroundColor: tint(primary, 0.26) }} />
      <span className="mt-1.5 flex w-full max-w-[80%] items-center justify-between">
        <span className="block h-1 w-8 rounded-sm" style={{ backgroundColor: tint(primary, 0.32) }} />
        <span className="block h-1 w-8 rounded-sm" style={{ backgroundColor: tint(accent, 0.7) }} />
        <span className="block h-1 w-8 rounded-sm" style={{ backgroundColor: tint(primary, 0.32) }} />
      </span>
    </div>
  )
}

interface ThemesSectionProps {
  onPreviewSite?: (themeId?: string) => void
}

export function ThemesSection({ onPreviewSite }: ThemesSectionProps) {
  // ---- 精选 preset 卡片网格 + 站点(默认站回显) ----
  const [themes, setThemes] = useState<ThemeRow[]>([])
  const [sites, setSites] = useState<SiteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState<string>('')

  // ---- [R10-a-4] 组合主题浏览器状态 ----
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('') // 防抖 300ms 后的生效搜索词
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(24)
  const [items, setItems] = useState<ThemeRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalAll, setTotalAll] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [browsing, setBrowsing] = useState(true)
  const [tick, setTick] = useState(0) // 刷新按钮手动触发浏览器重取
  const fetchSeq = useRef(0) // 响应序号: 丢弃竞态过期响应

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ts, ss] = await Promise.all([api.get<ThemeRow[]>('/api/admin/themes'), api.get<SiteRow[]>('/api/admin/sites')])
      setThemes(Array.isArray(ts) ? ts : [])
      setSites(Array.isArray(ss) ? ss : [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载主题失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 搜索防抖 300ms: 输入停顿后才生效, 生效时回到第 1 页
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // [R10-a-4] 浏览器取数: 服务端 ?q= 搜索 + 分页(空 q → 全库顺序分页, 9 精选在前)
  useEffect(() => {
    const seq = ++fetchSeq.current
    setBrowsing(true)
    api.get<ThemesPageResp>('/api/admin/themes', { page, size, q: query || undefined })
      .then((d) => {
        if (seq !== fetchSeq.current || !d) return
        setItems(Array.isArray(d.items) ? d.items : [])
        setTotal(Number(d.total) || 0)
        setTotalAll(Number(d.totalAll) || 0)
        setTotalPages(Math.max(1, Number(d.totalPages) || 1))
        setPage(Math.max(1, Number(d.page) || 1)) // 服务端页码钳制回显(搜索后越界页自动归位)
      })
      .catch((e) => {
        if (seq !== fetchSeq.current) return
        setItems([])
        setTotal(0)
        setTotalPages(1)
        toast.error(e instanceof Error ? e.message : '加载主题列表失败')
      })
      .finally(() => {
        if (seq === fetchSeq.current) setBrowsing(false)
      })
  }, [query, page, size, tick])

  const defaultSite = sites.find((s) => s.isDefault)

  const applyDefault = async (theme: ThemeRow) => {
    if (!defaultSite) {
      toast.error('尚无默认站点, 请先在「站群系统」中设置默认站点')
      return
    }
    setApplying(theme.id)
    try {
      await api.put(`/api/admin/sites/${defaultSite.id}`, { themeId: theme.id })
      toast.success(`已将默认站点「${defaultSite.name}」的主题设为「${theme.name}」`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '设置失败')
    } finally {
      setApplying('')
    }
  }

  const isDefaultTheme = (id: string) => defaultSite?.themeId === id

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            <Palette className="h-5 w-5 text-violet-400" />
            主题模板
            {/* [R10-a-4] 页头总数改为全库真实总数: 9 精选 + 50400 组合 */}
            <span className="text-xs font-normal text-zinc-500">
              {totalAll > 0 ? `(共 ${totalAll} 套: ${themes.length} 精选 + ${totalAll - themes.length} 组合)` : '(主题库统计中…)'}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            每套主题独立配色/布局/字体, 可直接预览前台效果; 默认站点: {defaultSite ? defaultSite.name : '未设置'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
          onClick={() => {
            load()
            setTick((t) => t + 1)
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在加载主题…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {themes.map((t) => (
            <Card key={t.id} className={`overflow-hidden border-zinc-800 bg-zinc-900/60 transition-colors hover:border-zinc-700 ${isDefaultTheme(t.id) ? 'ring-1 ring-amber-500/40' : ''}`}>
              <CardContent className="p-0">
                <div className="flex h-2">
                  {t.preview.map((c, i) => (
                    <span key={i} className="h-full flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="p-4">
                  {/* 阅读版式缩略示意(readLayout 维度 × 主题 preview 配色维度) */}
                  <ReadMiniPreview layout={t.read?.layout || 'classic'} preview={t.preview} />
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="font-medium text-zinc-100">{t.name}</span>
                    <div className="flex items-center gap-1.5">
                      {isDefaultTheme(t.id) && (
                        <Badge className="border-transparent bg-amber-500/15 text-[10px] text-amber-400">
                          <Star className="mr-0.5 h-2.5 w-2.5" />
                          默认
                        </Badge>
                      )}
                      <Badge variant="outline" className="border-zinc-700 bg-zinc-950 text-[10px] text-zinc-300">
                        {t.layout}
                      </Badge>
                      <Badge variant="outline" className="border-teal-800/70 bg-teal-500/10 text-[10px] text-teal-300">
                        阅读·{READ_LABEL[t.read?.layout || 'classic'] || t.read?.layout || 'classic'}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${t.dark ? 'border-zinc-600 bg-zinc-800 text-zinc-300' : 'border-zinc-700 bg-zinc-950 text-zinc-400'}`}>
                        {t.dark ? '暗色' : '亮色'}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1.5 min-h-8 text-xs leading-relaxed text-zinc-500">{t.desc}</p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 flex-1 gap-1.5 border-zinc-700 bg-zinc-950 text-xs text-zinc-300 hover:bg-zinc-800"
                      onClick={() => onPreviewSite?.(t.id)}
                    >
                      <ExternalLink className="h-3 w-3" />
                      预览前台
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 flex-1 gap-1.5 border-amber-500/40 bg-amber-500/10 text-xs text-amber-400 hover:bg-amber-500/20"
                      onClick={() => applyDefault(t)}
                      disabled={applying === t.id}
                    >
                      {applying === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
                      设为默认站点主题
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ============ [R10-a-4] 组合主题浏览器 ============ */}
      <div className="space-y-3 border-t border-zinc-800 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Layers className="h-4 w-4 text-violet-400" />
            组合主题浏览器
            <span className="text-xs font-normal text-zinc-500">
              {totalAll > 0
                ? `全库 ${totalAll} 套(${themes.length} 精选 + ${totalAll - themes.length} 组合) · 当前命中 ${total} 套`
                : '全库统计加载中…'}
            </span>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <Input
                className="h-9 w-64 border-zinc-700 bg-zinc-950 pl-8 text-sm placeholder:text-zinc-600"
                placeholder="搜索 名称/ID/风格, 如 紫罗兰 / violet / grid"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              {browsing && (
                <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-zinc-600" />
              )}
            </div>
            <Select value={String(size)} onValueChange={(v) => { setSize(Number(v) || 24); setPage(1) }}>
              <SelectTrigger className="h-9 w-[108px] border-zinc-700 bg-zinc-950 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-xs">
                    {n} 条/页
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 主题卡片列表(取数中半透明防误点; 每页最多 96 条, 无需虚拟化) */}
        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 ${browsing ? 'pointer-events-none opacity-50 transition-opacity' : ''}`}>
          {items.map((t) => (
            <Card key={t.id} className={`overflow-hidden border-zinc-800 bg-zinc-900/60 transition-colors hover:border-zinc-700 ${isDefaultTheme(t.id) ? 'ring-1 ring-amber-500/40' : ''}`}>
              <CardContent className="p-0">
                {/* 简化缩略图: 三色条 = 主题 preview(bg/primary/accent) */}
                <div className="flex h-2">
                  {t.preview.map((c, i) => (
                    <span key={i} className="h-full flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="truncate text-sm font-medium text-zinc-100" title={t.name}>{t.name}</span>
                    {isDefaultTheme(t.id) && (
                      <Badge className="shrink-0 border-transparent bg-amber-500/15 text-[10px] text-amber-400">
                        <Star className="mr-0.5 h-2.5 w-2.5" />
                        默认
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <Badge variant="outline" className="border-zinc-700 bg-zinc-950 text-[10px] text-zinc-300">
                      {HOME_LABEL[t.layout] || t.layout}
                    </Badge>
                    <Badge variant="outline" className="border-teal-800/70 bg-teal-500/10 text-[10px] text-teal-300">
                      阅读·{READ_LABEL[t.read?.layout || 'classic'] || t.read?.layout || 'classic'}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${t.dark ? 'border-zinc-600 bg-zinc-800 text-zinc-300' : 'border-zinc-700 bg-zinc-950 text-zinc-400'}`}>
                      {t.dark ? '暗色' : '亮色'}
                    </Badge>
                  </div>
                  <p className="mt-1.5 line-clamp-1 text-[11px] leading-relaxed text-zinc-500" title={t.desc}>{t.desc}</p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600" title={t.id}>{t.id}</p>
                  <div className="mt-2.5 flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 flex-1 gap-1 border-zinc-700 bg-zinc-950 text-[11px] text-zinc-300 hover:bg-zinc-800"
                      onClick={() => onPreviewSite?.(t.id)}
                    >
                      <ExternalLink className="h-3 w-3" />
                      预览前台
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 flex-1 gap-1 border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-400 hover:bg-amber-500/20"
                      onClick={() => applyDefault(t)}
                      disabled={applying === t.id}
                    >
                      {applying === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
                      设为默认站点主题
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {!browsing && items.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-800 py-10 text-center text-sm text-zinc-500">
            没有匹配「{query}」的主题, 换个关键词试试(支持 名称/ID/风格, 如 紫罗兰 / neon / shelf)
          </div>
        )}

        {/* 分页控件: 上一页 / 页码 / 下一页 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-zinc-500">
            {browsing ? '加载中…' : `第 ${page} / ${totalPages} 页 · 共 ${total} 套命中`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 border-zinc-700 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800"
              disabled={page <= 1 || browsing}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              上一页
            </Button>
            <span className="min-w-14 text-center text-xs text-zinc-400">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 border-zinc-700 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800"
              disabled={page >= totalPages || browsing}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一页
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
