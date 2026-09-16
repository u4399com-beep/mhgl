'use client'

// ============================================================
// [R24-4] 自动 SEO/TDK 模板 — 后台区块
// 书籍页 / 章节目录 / 章节页三类页面的 Title/Description/Keywords 模板编辑。
//   · 未定制 = 纯「自动」: 引擎按默认模板 + 书籍/章节/站点真实数据组合
//   · 变量: {bookname} {author} {category} {sitename} {chaptername} {chapterno}
//           {chapterCount} {statusText} {intro} {excerpt}
//   · 保存走 /api/admin/seo-templates(60s 缓存即时失效); 「恢复自动」= 清空覆盖
// [R30-1-5] 预设矩阵增强:
//   · 「随机组合」按钮: 8 字段从 18 套预设池独立抽取(可跨预设), 一键换一批, 来源徽章可追溯
//   · 实时预览: sampleSeoVars + compose* 对当前编辑中的模板渲染 T/D/K 实际效果(码点数标注)
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, RotateCcw, Save, Shuffle, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { api } from './helpers'
// [R30-1-5] 引入预设矩阵(随机组合/样本变量)与 compose* 引擎 + 码点计数
import { SEO_TPL_PRESETS, randomSeoTplSet, sampleSeoVars, type SeoRandomFieldSource } from '@/lib/seo-presets'
import {
  DEFAULT_SEO_TEMPLATES,
  composeBookTdk,
  composeChapterTdk,
  composeTocTdk,
  seoCodePoints,
  type SeoTplSet,
} from '@/lib/seo-tpl'

const EMPTY_OVERRIDE = {
  book: { title: '', description: '', keywords: '' },
  toc: { title: '', description: '' },
  chapter: { title: '', description: '', keywords: '' },
}

type OverrideSet = typeof EMPTY_OVERRIDE

/** [R30-1-6] 字段来源徽章表(键 = 'book.title' 等 8 个字段路径; 手动编辑该字段后即清除) */
type SourceMap = Record<string, SeoRandomFieldSource>

const VARIABLES: { var: string; desc: string }[] = [
  { var: '{bookname}', desc: '书名' },
  { var: '{author}', desc: '作者' },
  { var: '{category}', desc: '分类名' },
  { var: '{sitename}', desc: '站点名' },
  { var: '{chaptername}', desc: '章节名(仅章节页)' },
  { var: '{chapterno}', desc: '章节序号(仅章节页)' },
  { var: '{chapterCount}', desc: '章节总数(书籍/目录页)' },
  { var: '{statusText}', desc: '连载中/已完结' },
  { var: '{intro}', desc: '简介摘要(自动截断)' },
  { var: '{excerpt}', desc: '正文摘要(仅章节页, 自动截断)' },
]

function Field({ label, hint, value, onChange, textarea, placeholder, source }: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  textarea?: boolean
  placeholder: string
  /** [R30-1-7] 随机组合来源徽章(如 'title ← 悬念型·隐藏结局'); 手动编辑该字段后清除 */
  source?: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs font-medium text-zinc-300">{label}</label>
        <span className="text-[10px] text-zinc-600">{hint}</span>
      </div>
      {textarea ? (
        <Textarea
          className="min-h-[64px] border-zinc-700 bg-zinc-950 text-xs text-zinc-200 placeholder:text-zinc-600"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <Input
          className="h-9 border-zinc-700 bg-zinc-950 text-xs text-zinc-200 placeholder:text-zinc-600"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
      {source ? (
        <div>
          <Badge className="border-transparent bg-amber-500/15 text-[10px] font-normal text-amber-300">
            <Shuffle className="mr-1 h-3 w-3" />
            {source}
          </Badge>
        </div>
      ) : null}
    </div>
  )
}

/** [R30-1-11] 预览行: 渲染结果 + 码点数标注(N/上限, 与 compose* 截断线一致) */
function PreviewRow({ label, text, limit }: { label: string; text: string; limit: number }) {
  const n = seoCodePoints(text)
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 w-3 shrink-0 text-[10px] font-semibold text-zinc-500">{label}</span>
      <p className="min-w-0 flex-1 break-all text-xs leading-relaxed text-zinc-300">{text}</p>
      <Badge
        variant="outline"
        className={
          n > limit
            ? 'shrink-0 border-red-500/40 text-[10px] text-red-400'
            : 'shrink-0 border-zinc-700 text-[10px] text-zinc-500'
        }
      >
        {n}/{limit}
      </Badge>
    </div>
  )
}

/** [R30-1-12] 预览分组卡(书籍页/章节目录页/章节页) */
function PreviewGroup({ name, rows }: { name: string; rows: { label: string; text: string; limit: number }[] }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{name}</p>
      <div className="mt-2 space-y-2">
        {rows.map((r) => (
          <PreviewRow key={r.label} label={r.label} text={r.text} limit={r.limit} />
        ))}
      </div>
    </div>
  )
}

export function SeoTplSection() {
  const [tpl, setTpl] = useState<SeoTplSet | null>(null)
  const [override, setOverride] = useState<OverrideSet>(EMPTY_OVERRIDE)
  const [customized, setCustomized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // [R30-1-6] 随机组合来源徽章表(空 = 无随机产物)
  const [lastSources, setLastSources] = useState<SourceMap>({})

  const load = async () => {
    setLoading(true)
    try {
      const d = await api.get<{ customized: boolean; tpl: SeoTplSet }>('/api/admin/seo-templates')
      setTpl(d.tpl)
      setCustomized(!!d.customized)
      // 回显: 已定制的字段填入表单, 未定制字段留空(占位展示默认模板)
      const cur = d.tpl || EMPTY_OVERRIDE
      const def = EMPTY_OVERRIDE
      setOverride({
        book: {
          title: cur.book?.title && cur.book.title !== def.book.title ? cur.book.title : '',
          description: cur.book?.description && cur.book.description !== def.book.description ? cur.book.description : '',
          keywords: cur.book?.keywords && cur.book.keywords !== def.book.keywords ? cur.book.keywords : '',
        },
        toc: {
          title: cur.toc?.title && cur.toc.title !== def.toc.title ? cur.toc.title : '',
          description: cur.toc?.description && cur.toc.description !== def.toc.description ? cur.toc.description : '',
        },
        chapter: {
          title: cur.chapter?.title && cur.chapter.title !== def.chapter.title ? cur.chapter.title : '',
          description: cur.chapter?.description && cur.chapter.description !== def.chapter.description ? cur.chapter.description : '',
          keywords: cur.chapter?.keywords && cur.chapter.keywords !== def.chapter.keywords ? cur.chapter.keywords : '',
        },
      })
      // [R30-1-6] 重新加载后旧随机来源徽章作废
      setLastSources({})
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载 SEO 模板失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  /** [R30-1-10] 手动编辑字段 → 同步清掉该字段的随机来源徽章(徽章只标注自动组合产物) */
  const clearSource = (key: string) =>
    setLastSources((m) => {
      if (!(key in m)) return m
      const next = { ...m }
      delete next[key]
      return next
    })

  /** [R30-1-8] 随机组合: 8 字段从 18 套预设池独立抽取(可跨预设), 结果与当前生效模板必不相同。
   *  比对基线 = 当前编辑值(空字段回落当前生效模板), 连点必出「换一批」效果 */
  const randomFill = () => {
    if (!tpl) return
    const base: SeoTplSet = {
      book: {
        title: override.book.title.trim() || tpl.book.title,
        description: override.book.description.trim() || tpl.book.description,
        keywords: override.book.keywords.trim() || tpl.book.keywords,
      },
      toc: {
        title: override.toc.title.trim() || tpl.toc.title,
        description: override.toc.description.trim() || tpl.toc.description,
      },
      chapter: {
        title: override.chapter.title.trim() || tpl.chapter.title,
        description: override.chapter.description.trim() || tpl.chapter.description,
        keywords: override.chapter.keywords.trim() || tpl.chapter.keywords,
      },
    }
    const { set, sources } = randomSeoTplSet(base)
    setOverride({ book: { ...set.book }, toc: { ...set.toc }, chapter: { ...set.chapter } })
    const map: SourceMap = {}
    for (const f of sources.fields) map[f.key] = f
    setLastSources(map)
    toast.success(`已随机组合 8 个字段模板（组合空间 ${SEO_TPL_PRESETS.length}^8），保存后前台生效`)
  }

  const save = async () => {
    setSaving(true)
    try {
      // 仅提交非空字段(空 = 回落默认); 全空 = 回归纯自动
      const clean: OverrideSet = JSON.parse(JSON.stringify(override))
      for (const k of Object.keys(clean) as (keyof OverrideSet)[]) {
        for (const f of Object.keys(clean[k]) as (keyof OverrideSet[keyof OverrideSet])[]) {
          const v = (clean[k][f] as string) || ''
          ;(clean[k][f] as string) = v.trim()
        }
      }
      const d = await api.put<{ saved: boolean; customized: boolean; tpl: SeoTplSet }>('/api/admin/seo-templates', { tpl: clean })
      setTpl(d.tpl)
      setCustomized(!!d.customized)
      toast.success(d.customized ? 'SEO/TDK 模板已保存, 前台与 SSR 即时生效' : '已恢复纯自动 TDK(与默认模板一致)')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    setSaving(true)
    try {
      const d = await api.put<{ saved: boolean; customized: boolean; tpl: SeoTplSet }>('/api/admin/seo-templates', { tpl: {} })
      setTpl(d.tpl)
      setCustomized(false)
      setOverride(EMPTY_OVERRIDE)
      setLastSources({}) // [R30-1-6] 恢复自动后随机来源徽章一并清除
      toast.success('已恢复纯自动 TDK')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '重置失败')
    } finally {
      setSaving(false)
    }
  }

  /** [R30-1-9] 当前生效模板(编辑值优先, 空字段回落服务端模板/默认) —— 与保存后 sanitize 行为一致 */
  const effectiveTpl: SeoTplSet = useMemo(() => {
    const base = tpl || DEFAULT_SEO_TEMPLATES
    return {
      book: {
        title: override.book.title.trim() || base.book.title,
        description: override.book.description.trim() || base.book.description,
        keywords: override.book.keywords.trim() || base.book.keywords,
      },
      toc: {
        title: override.toc.title.trim() || base.toc.title,
        description: override.toc.description.trim() || base.toc.description,
      },
      chapter: {
        title: override.chapter.title.trim() || base.chapter.title,
        description: override.chapter.description.trim() || base.chapter.description,
        keywords: override.chapter.keywords.trim() || base.chapter.keywords,
      },
    }
  }, [override, tpl])

  /** [R30-1-9] 实时预览: sampleSeoVars + compose* 渲染当前编辑中的模板(三页型), 所见即所得 */
  const preview = useMemo(
    () => ({
      book: composeBookTdk(sampleSeoVars, effectiveTpl),
      toc: composeTocTdk(sampleSeoVars, effectiveTpl),
      chapter: composeChapterTdk(sampleSeoVars, effectiveTpl),
    }),
    [effectiveTpl],
  )

  /** [R30-1-13] 来源概览串(从 8 字段徽章表按页型去重聚合), 供随机组合后总览 */
  const sourceSummary = useMemo(() => {
    const keys = Object.keys(lastSources)
    if (keys.length === 0) return null
    const join = (prefix: string) => {
      const names: string[] = []
      for (const k of keys) {
        if (!k.startsWith(prefix)) continue
        const n = lastSources[k].presetName
        if (!names.includes(n)) names.push(n)
      }
      return names.join('、')
    }
    return { book: join('book.'), toc: join('toc.'), chapter: join('chapter.') }
  }, [lastSources])

  /** [R30-1-13] 字段来源徽章文本(如 'title ← 悬念型·隐藏结局') */
  const srcBadge = (key: string, field: string): string | undefined => {
    const s = lastSources[key]
    return s ? `${field} ← ${s.presetName}` : undefined
  }

  if (loading || !tpl) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在加载 SEO 模板…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            <SlidersHorizontal className="h-5 w-5 text-violet-400" />
            自动 SEO / TDK 模板
            <Badge className={customized ? 'border-transparent bg-violet-500/15 text-[10px] text-violet-300' : 'border-transparent bg-emerald-500/15 text-[10px] text-emerald-300'}>
              {customized ? '已定制' : '纯自动'}
            </Badge>
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            书籍页 / 章节目录 / 章节页的 Title·Description·Keywords 自动生成模板; 留空的字段使用内置自动模板。
          </p>
        </div>
        <div className="flex gap-2">
          {/* [R30-1-13] 随机组合按钮: 8 字段从 18 套预设矩阵独立抽取, 一键换一批 */}
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-amber-600/50 bg-zinc-900 text-amber-300 hover:bg-zinc-800"
            onClick={randomFill}
            disabled={saving}
          >
            <Shuffle className="h-3.5 w-3.5" />
            随机组合
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
            onClick={reset}
            disabled={saving || !customized}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复自动
          </Button>
          <Button
            size="sm"
            className="h-9 gap-1.5 bg-violet-600 text-white hover:bg-violet-500"
            onClick={save}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            保存模板
          </Button>
        </div>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-4">
          <p className="text-xs text-zinc-500">可用变量(保存后自动插值; 缺数据的变量自动剔除):</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {VARIABLES.map((v) => (
              <Badge key={v.var} variant="outline" className="border-zinc-700 bg-zinc-950 font-mono text-[10px] font-normal text-zinc-400">
                {v.var} <span className="ml-1 font-sans text-zinc-600">{v.desc}</span>
              </Badge>
            ))}
          </div>
          {/* [R30-1-13] 随机组合来源总览(仅在产生随机组合后显示) */}
          {sourceSummary ? (
            <p className="mt-3 border-t border-zinc-800 pt-2 text-[10px] leading-relaxed text-zinc-500">
              本次随机组合来源 — 书籍页：{sourceSummary.book} ｜ 目录页：{sourceSummary.toc} ｜ 章节页：{sourceSummary.chapter}
              <span className="ml-1 text-zinc-600">（{SEO_TPL_PRESETS.length} 套预设 8 字段独立抽取，组合空间 {SEO_TPL_PRESETS.length}^8 ≈ 110 亿）</span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* 书籍页 */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold text-zinc-200">书籍页</h3>
            <Field
              label="Title"
              hint="≤40 字最佳"
              value={override.book.title}
              onChange={(v) => {
                setOverride((o) => ({ ...o, book: { ...o.book, title: v } }))
                clearSource('book.title') // [R30-1-10]
              }}
              placeholder={tpl.book.title}
              source={srcBadge('book.title', 'title')}
            />
            <Field
              label="Description"
              hint="≤160 字最佳"
              textarea
              value={override.book.description}
              onChange={(v) => {
                setOverride((o) => ({ ...o, book: { ...o.book, description: v } }))
                clearSource('book.description') // [R30-1-10]
              }}
              placeholder={tpl.book.description}
              source={srcBadge('book.description', 'description')}
            />
            <Field
              label="Keywords"
              hint="逗号分隔"
              textarea
              value={override.book.keywords}
              onChange={(v) => {
                setOverride((o) => ({ ...o, book: { ...o.book, keywords: v } }))
                clearSource('book.keywords') // [R30-1-10]
              }}
              placeholder={tpl.book.keywords}
              source={srcBadge('book.keywords', 'keywords')}
            />
          </CardContent>
        </Card>

        {/* 章节目录页 */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold text-zinc-200">章节目录页</h3>
            <Field
              label="Title"
              hint="目录页专用标题"
              value={override.toc.title}
              onChange={(v) => {
                setOverride((o) => ({ ...o, toc: { ...o.toc, title: v } }))
                clearSource('toc.title') // [R30-1-10]
              }}
              placeholder={tpl.toc.title}
              source={srcBadge('toc.title', 'title')}
            />
            <Field
              label="Description"
              hint="目录页专用描述"
              textarea
              value={override.toc.description}
              onChange={(v) => {
                setOverride((o) => ({ ...o, toc: { ...o.toc, description: v } }))
                clearSource('toc.description') // [R30-1-10]
              }}
              placeholder={tpl.toc.description}
              source={srcBadge('toc.description', 'description')}
            />
            <p className="text-[10px] leading-relaxed text-zinc-600">目录页无独立 Keywords(继承书籍页关键词), 与书籍页标题区分可避免同书多 URL 撞车。</p>
          </CardContent>
        </Card>

        {/* 章节页 */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold text-zinc-200">章节页</h3>
            <Field
              label="Title"
              hint="≤40 字最佳"
              value={override.chapter.title}
              onChange={(v) => {
                setOverride((o) => ({ ...o, chapter: { ...o.chapter, title: v } }))
                clearSource('chapter.title') // [R30-1-10]
              }}
              placeholder={tpl.chapter.title}
              source={srcBadge('chapter.title', 'title')}
            />
            <Field
              label="Description"
              hint="正文摘要自动截断"
              textarea
              value={override.chapter.description}
              onChange={(v) => {
                setOverride((o) => ({ ...o, chapter: { ...o.chapter, description: v } }))
                clearSource('chapter.description') // [R30-1-10]
              }}
              placeholder={tpl.chapter.description}
              source={srcBadge('chapter.description', 'description')}
            />
            <Field
              label="Keywords"
              hint="逗号分隔"
              textarea
              value={override.chapter.keywords}
              onChange={(v) => {
                setOverride((o) => ({ ...o, chapter: { ...o.chapter, keywords: v } }))
                clearSource('chapter.keywords') // [R30-1-10]
              }}
              placeholder={tpl.chapter.keywords}
              source={srcBadge('chapter.keywords', 'keywords')}
            />
          </CardContent>
        </Card>
      </div>

      {/* [R30-1-13] 实时预览: sampleSeoVars + compose* 对当前编辑中的模板渲染 T/D/K 实际效果(三页型分组, 码点数标注) */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-200">实时预览（所见即所得）</h3>
            <span className="text-[10px] text-zinc-500">
              样本变量：《{sampleSeoVars.bookname}》· {sampleSeoVars.author} · {sampleSeoVars.category} · 站名「{sampleSeoVars.sitename}」· {sampleSeoVars.chapterCount}章
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <PreviewGroup
              name="书籍页"
              rows={[
                { label: 'T', text: preview.book.title, limit: 40 },
                { label: 'D', text: preview.book.description, limit: 160 },
                ...(preview.book.keywords ? [{ label: 'K', text: preview.book.keywords, limit: 200 }] : []),
              ]}
            />
            <PreviewGroup
              name="章节目录页"
              rows={[
                { label: 'T', text: preview.toc.title, limit: 40 },
                { label: 'D', text: preview.toc.description, limit: 160 },
              ]}
            />
            <PreviewGroup
              name="章节页"
              rows={[
                { label: 'T', text: preview.chapter.title, limit: 40 },
                { label: 'D', text: preview.chapter.description, limit: 160 },
                ...(preview.chapter.keywords ? [{ label: 'K', text: preview.chapter.keywords, limit: 200 }] : []),
              ]}
            />
          </div>
          <p className="text-[10px] leading-relaxed text-zinc-600">
            {'预览即前台渲染结果：空字段回落当前生效模板；{intro}/{excerpt} 长度由引擎自动截断，Title ≤40 / Description ≤160 / Keywords ≤200 码点兜底。'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
