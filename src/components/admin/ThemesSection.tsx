'use client'

// ============================================================
// 主题模板 — [R24-5] 9 套「站点克隆」主题卡片 / 预览 / 设为默认站点主题。
//   旧 512 组合主题浏览器已随「删除全部旧主题」指令下线(theme-matrix 已删)。
//   每张卡片: 三色预览条 + 阅读版式缩略 + 克隆站点徽章 + 预览前台/设为默认动作。
// [R36-2a-8] 逐主题「阅读设置 + 页面底部」编辑: 卡片「编辑」按钮 → Dialog(阅读设置/页面底部
//   两区) → PUT/DELETE /api/admin/themes/override; 覆盖命中的卡片展示「已自定义」徽章。
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ExternalLink, Loader2, Palette, Pencil, Plus, RefreshCw, RotateCcw, Save, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, type SiteRow } from './helpers'
import type { ThemeOverride } from '@/lib/crawl/themes'

interface ThemeRow {
  id: string
  name: string
  desc: string
  layout: string
  dark: boolean
  /** [R36-2a-4] 阅读设置(themes API 已深合并注册表+覆盖, 全量 9 键) */
  read?: {
    layout?: string
    measure?: number
    lineHeight?: number
    fontBase?: number
    indent?: boolean
    justify?: boolean
    toolbar?: string
    texture?: string
    chapterDeco?: string
  }
  /** [R36-2a-4] 页面底部(themes API 已全量投影, 空串=默认文案) */
  footer?: { copyright: string; notice: string; links: { name: string; url: string }[] }
  preview?: string[]
}

/** 阅读布局中文标签（与 themes.ts READ_LAYOUT_LABEL 对齐, 避免引入服务端模块） */
const READ_LABEL: Record<string, string> = {
  classic: '典书版',
  immersive: '沉浸暗夜',
  paginated: '分页横滑',
  pili: '书屋版',
}

/** [R24-5] 克隆站点中文标签(与 themes.ts SITE_CLONE_LABEL 对齐, 前端独立映射) */
const CLONE_LABEL: Record<string, string> = {
  aijjxs: '久久小说',
  pili: '霹雳书屋',
  kks101: '101看書',
  qb23: '铅笔小说',
  ddyueshu: '顶点小说',
  x2552: '吾爱文学',
  huangjinwu: '黄金屋',
  ggd66: '格格党',
  shipsay: '船说CMS',
  trxsw: '同人小说', // [R25-5a] 第 10 套克隆主题(与 themes.ts SITE_CLONE_LABEL 对齐)
}

// [R36-2a-8] 编辑器选项集/边界(与 themes.ts sanitizeThemeOverride 校验口径一致)
const EDIT_READ_LABELS: Record<string, string> = { classic: '典书版', immersive: '沉浸暗夜', paginated: '分页横滑', pili: '书屋版' }
const EDIT_TOOLBAR_OPTIONS = [
  { value: 'inline', label: '文头工具条' },
  { value: 'floating', label: '悬浮胶囊' },
  { value: 'bottom', label: '底部固定条' },
]
const EDIT_TEXTURE_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'paper', label: '纸纹噪点' },
  { value: 'vignette', label: '暗角氛围' },
]
const EDIT_DECO_OPTIONS = [
  { value: 'rule', label: '横线' },
  { value: 'ornament', label: '菱形花饰' },
  { value: 'none', label: '无' },
]
const EDIT_MEASURE_MIN = 480
const EDIT_MEASURE_MAX = 900
const EDIT_FONT_MIN = 14
const EDIT_FONT_MAX = 24
const EDIT_LINE_MIN = 1.4
const EDIT_LINE_MAX = 2.6
const EDIT_FOOTER_TEXT_MAX = 300
const EDIT_LINKS_MAX = 20

/** 编辑器表单(阅读设置全量 9 键 + 页脚三要素) */
interface EditForm {
  read: {
    layout: string
    toolbar: string
    texture: string
    chapterDeco: string
    measure: number
    lineHeight: number
    fontBase: number
    indent: boolean
    justify: boolean
  }
  copyright: string
  notice: string
  links: { name: string; url: string }[]
}

function emptyForm(): EditForm {
  return {
    read: { layout: 'classic', toolbar: 'inline', texture: 'none', chapterDeco: 'rule', measure: 680, lineHeight: 2, fontBase: 17, indent: true, justify: false },
    copyright: '',
    notice: '',
    links: [],
  }
}

/** hex → rgba 淡色（缩略图主题色着色用; 非 6 位 hex 色值原样返回兜底） */
function tint(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec((hex || '').trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** 阅读版式缩略示意 — 同时体现 readLayout 版式差异与主题 preview 三色配色差异 */
function ReadMiniPreview({ layout, preview }: { layout: string; preview: string[] }) {
  const [bg = '#fff', primary = '#888', accent = '#aaa'] = preview || []
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

/** [R36-2a-8] 枚举选项 RadioGroup 行(2 列栅格内横向胶囊) */
function OptionRow({ idPrefix, label, value, options, onChange }: { idPrefix: string; label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs text-zinc-400">{label}</Label>
      <RadioGroup value={value} onValueChange={onChange} className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {options.map((o) => (
          <label key={o.value} htmlFor={`${idPrefix}-${o.value}`} className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-300">
            <RadioGroupItem value={o.value} id={`${idPrefix}-${o.value}`} className="border-zinc-600 text-violet-500" />
            {o.label}
          </label>
        ))}
      </RadioGroup>
    </div>
  )
}

interface ThemesSectionProps {
  onPreviewSite?: (themeId?: string) => void
}

export function ThemesSection({ onPreviewSite }: ThemesSectionProps) {
  const [themes, setThemes] = useState<ThemeRow[]>([])
  const [sites, setSites] = useState<SiteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState<string>('')
  // [R36-2a-8] 主题覆盖 map(编辑器回显 + 「已自定义」徽章判定)
  const [overrides, setOverrides] = useState<Record<string, ThemeOverride>>({})
  const [editId, setEditId] = useState<string>('')
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<EditForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ts, ss, ovs] = await Promise.all([
        api.get<ThemeRow[]>('/api/admin/themes'),
        api.get<SiteRow[]>('/api/admin/sites'),
        api.get<Record<string, ThemeOverride>>('/api/admin/themes/override'),
      ])
      setThemes(Array.isArray(ts) ? ts : [])
      setSites(Array.isArray(ss) ? ss : [])
      setOverrides(ovs && typeof ovs === 'object' && !Array.isArray(ovs) ? ovs : {})
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载主题失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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

  // [R36-2a-8] 打开编辑器: 预填生效值(themes API 已合并注册表+覆盖, 全量 read + 全量 footer)
  const openEdit = (t: ThemeRow) => {
    setEditId(t.id)
    setForm({
      read: {
        layout: t.read?.layout || 'classic',
        toolbar: t.read?.toolbar || 'inline',
        texture: t.read?.texture || 'none',
        chapterDeco: t.read?.chapterDeco || 'rule',
        measure: typeof t.read?.measure === 'number' ? t.read.measure : 680,
        lineHeight: typeof t.read?.lineHeight === 'number' ? t.read.lineHeight : 2,
        fontBase: typeof t.read?.fontBase === 'number' ? t.read.fontBase : 17,
        indent: t.read?.indent ?? true,
        justify: t.read?.justify ?? false,
      },
      copyright: t.footer?.copyright || '',
      notice: t.footer?.notice || '',
      links: (t.footer?.links || []).map((l) => ({ name: l.name, url: l.url })),
    })
    setEditOpen(true)
  }

  const setRead = (patch: Partial<EditForm['read']>) => setForm((f) => ({ ...f, read: { ...f.read, ...patch } }))

  const saveEdit = async () => {
    if (!editId || saving) return
    setSaving(true)
    try {
      await api.put('/api/admin/themes/override', {
        themeId: editId,
        read: { ...form.read },
        footer: {
          copyright: form.copyright.trim(),
          notice: form.notice.trim(),
          links: form.links.map((l) => ({ name: l.name.trim(), url: l.url.trim() })),
        },
      })
      toast.success('阅读设置与页面底部已保存，前台页面刷新后生效')
      setEditOpen(false)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const resetEdit = async () => {
    if (!editId || resetting) return
    const name = themes.find((t) => t.id === editId)?.name || editId
    if (!window.confirm(`确定将「${name}」的阅读设置与页面底部恢复为主题默认? 该主题的所有自定义将被清除。`)) return
    setResetting(true)
    try {
      await api.del('/api/admin/themes/override', { themeId: editId })
      toast.success('已重置为主题默认')
      setEditOpen(false)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '重置失败')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            <Palette className="h-5 w-5 text-violet-400" />
            主题模板
            <span className="text-xs font-normal text-zinc-500">
              {themes.length > 0 ? `${themes.length} 套站点克隆主题` : '(主题库统计中…)'}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            每套主题 1:1 克隆真实小说站(风格/布局/结构/配色), 可直接预览前台效果; 默认站点: {defaultSite ? defaultSite.name : '未设置'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
          onClick={load}
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
                  {(t.preview || []).map((c, i) => (
                    <span key={i} className="h-full flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="p-4">
                  {/* 阅读版式缩略示意(readLayout 维度 × 主题 preview 配色维度) */}
                  <ReadMiniPreview layout={t.read?.layout || 'classic'} preview={t.preview || []} />
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="font-medium text-zinc-100">{t.name}</span>
                    <div className="flex items-center gap-1.5">
                      {isDefaultTheme(t.id) && (
                        <Badge className="border-transparent bg-amber-500/15 text-[10px] text-amber-400">
                          <Star className="mr-0.5 h-2.5 w-2.5" />
                          默认
                        </Badge>
                      )}
                      {/* [R36-2a-8] 覆盖命中徽章(阅读设置/页面底部有自定义) */}
                      {overrides[t.id] && (
                        <Badge className="border-transparent bg-violet-500/15 text-[10px] text-violet-300">已自定义</Badge>
                      )}
                      <Badge variant="outline" className="border-zinc-700 bg-zinc-950 text-[10px] text-zinc-300">
                        克隆·{CLONE_LABEL[t.layout] || t.layout}
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
                  <p className="truncate font-mono text-[10px] text-zinc-600" title={t.id}>{t.id}</p>
                  <div className="mt-3 flex gap-2">
                    {/* [R36-2a-8] 编辑阅读设置/页面底部(与预览/设默认同排) */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 flex-1 gap-1.5 border-violet-500/40 bg-violet-500/10 text-xs text-violet-300 hover:bg-violet-500/20"
                      onClick={() => openEdit(t)}
                    >
                      <Pencil className="h-3 w-3" />
                      编辑
                    </Button>
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

      {/* [R36-2a-8] 阅读设置 + 页面底部 编辑器(两区) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto border-zinc-800 bg-zinc-900 text-zinc-100 sm:max-w-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base font-semibold">
              编辑主题 — {themes.find((t) => t.id === editId)?.name || editId}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              阅读设置作用于该主题全部阅读页; 页面底部空文本框表示使用内置默认文案。保存后前台页面刷新生效。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* ---------- 阅读设置 ---------- */}
            <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
              <h4 className="mb-3 text-xs font-semibold tracking-wide text-violet-300">阅读设置</h4>
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                <OptionRow
                  idPrefix="tr-layout"
                  label="阅读布局"
                  value={form.read.layout}
                  onChange={(v) => setRead({ layout: v })}
                  options={(Object.keys(EDIT_READ_LABELS) as string[]).map((k) => ({ value: k, label: EDIT_READ_LABELS[k] }))}
                />
                <OptionRow idPrefix="tr-toolbar" label="工具条形态" value={form.read.toolbar} onChange={(v) => setRead({ toolbar: v })} options={EDIT_TOOLBAR_OPTIONS} />
                <OptionRow idPrefix="tr-texture" label="纸面纹理" value={form.read.texture} onChange={(v) => setRead({ texture: v })} options={EDIT_TEXTURE_OPTIONS} />
                <OptionRow idPrefix="tr-deco" label="章节头装饰" value={form.read.chapterDeco} onChange={(v) => setRead({ chapterDeco: v })} options={EDIT_DECO_OPTIONS} />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-400">字号基准</Label>
                    <span className="text-xs font-medium text-zinc-200">{form.read.fontBase}px</span>
                  </div>
                  <Slider
                    min={EDIT_FONT_MIN}
                    max={EDIT_FONT_MAX}
                    step={1}
                    value={[form.read.fontBase]}
                    onValueChange={([v]) => setRead({ fontBase: v })}
                    className="mt-2"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-400">行高</Label>
                    <span className="text-xs font-medium text-zinc-200">{form.read.lineHeight.toFixed(1)}倍</span>
                  </div>
                  <Slider
                    min={EDIT_LINE_MIN}
                    max={EDIT_LINE_MAX}
                    step={0.1}
                    value={[form.read.lineHeight]}
                    onValueChange={([v]) => setRead({ lineHeight: Math.round(v * 10) / 10 })}
                    className="mt-2"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-400">栏宽</Label>
                    <span className="text-xs font-medium text-zinc-200">{form.read.measure}px</span>
                  </div>
                  <Slider
                    min={EDIT_MEASURE_MIN}
                    max={EDIT_MEASURE_MAX}
                    step={10}
                    value={[form.read.measure]}
                    onValueChange={([v]) => setRead({ measure: v })}
                    className="mt-2"
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                <label htmlFor="tr-indent" className="flex items-center gap-2 text-xs text-zinc-300">
                  <Switch id="tr-indent" checked={form.read.indent} onCheckedChange={(v) => setRead({ indent: v })} />
                  段首缩进
                </label>
                <label htmlFor="tr-justify" className="flex items-center gap-2 text-xs text-zinc-300">
                  <Switch id="tr-justify" checked={form.read.justify} onCheckedChange={(v) => setRead({ justify: v })} />
                  两端对齐
                </label>
              </div>
            </section>

            {/* ---------- 页面底部 ---------- */}
            <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
              <h4 className="mb-3 text-xs font-semibold tracking-wide text-violet-300">页面底部</h4>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="tr-copyright" className="text-xs text-zinc-400">版权行</Label>
                    <span className={`text-[10px] ${form.copyright.length > EDIT_FOOTER_TEXT_MAX ? 'text-red-400' : 'text-zinc-500'}`}>
                      {form.copyright.length}/{EDIT_FOOTER_TEXT_MAX}
                    </span>
                  </div>
                  <Textarea
                    id="tr-copyright"
                    rows={2}
                    maxLength={EDIT_FOOTER_TEXT_MAX}
                    value={form.copyright}
                    onChange={(e) => setForm((f) => ({ ...f, copyright: e.target.value }))}
                    placeholder={`留空使用默认: © ${new Date().getFullYear()} 站点名 · 域名 · 保留所有权利`}
                    className="mt-1 border-zinc-800 bg-zinc-900 text-xs text-zinc-200 placeholder:text-zinc-600"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="tr-notice" className="text-xs text-zinc-400">声明行</Label>
                    <span className={`text-[10px] ${form.notice.length > EDIT_FOOTER_TEXT_MAX ? 'text-red-400' : 'text-zinc-500'}`}>
                      {form.notice.length}/{EDIT_FOOTER_TEXT_MAX}
                    </span>
                  </div>
                  <Textarea
                    id="tr-notice"
                    rows={2}
                    maxLength={EDIT_FOOTER_TEXT_MAX}
                    value={form.notice}
                    onChange={(e) => setForm((f) => ({ ...f, notice: e.target.value }))}
                    placeholder="留空使用默认: 本站内容来自公开网络采集，仅作技术演示，如有侵权请联系删除"
                    className="mt-1 border-zinc-800 bg-zinc-900 text-xs text-zinc-200 placeholder:text-zinc-600"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-400">自定义链接(≤{EDIT_LINKS_MAX} 条)</Label>
                    <span className="text-[10px] text-zinc-500">{form.links.length}/{EDIT_LINKS_MAX}</span>
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {form.links.map((l, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={l.name}
                          maxLength={40}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              links: f.links.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                            }))
                          }
                          placeholder="名称"
                          aria-label={`第 ${i + 1} 条链接名称`}
                          className="h-8 w-32 border-zinc-800 bg-zinc-900 text-xs text-zinc-200 placeholder:text-zinc-600"
                        />
                        <Input
                          value={l.url}
                          maxLength={500}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              links: f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                            }))
                          }
                          placeholder="https://"
                          aria-label={`第 ${i + 1} 条链接 URL`}
                          className="h-8 flex-1 border-zinc-800 bg-zinc-900 text-xs text-zinc-200 placeholder:text-zinc-600"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                          aria-label={`删除第 ${i + 1} 条链接`}
                          onClick={() => setForm((f) => ({ ...f, links: f.links.filter((_, j) => j !== i) }))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 gap-1 border-dashed border-zinc-700 bg-transparent text-[11px] text-zinc-400 hover:bg-zinc-800"
                    disabled={form.links.length >= EDIT_LINKS_MAX}
                    onClick={() => setForm((f) => ({ ...f, links: [...f.links, { name: '', url: '' }] }))}
                  >
                    <Plus className="h-3 w-3" />
                    添加链接
                  </Button>
                </div>
              </div>
            </section>
          </div>

          <DialogFooter className="mt-2 flex items-center justify-between gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-red-500/40 bg-red-500/5 text-xs text-red-400 hover:bg-red-500/15"
              onClick={resetEdit}
              disabled={resetting || saving}
            >
              {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              重置为默认
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-violet-600 text-xs text-white hover:bg-violet-500"
              onClick={saveEdit}
              disabled={saving || resetting}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
