'use client'

// ============================================================
// [R24-4] 自动 SEO/TDK 模板 — 后台区块
// 书籍页 / 章节目录 / 章节页三类页面的 Title/Description/Keywords 模板编辑。
//   · 未定制 = 纯「自动」: 引擎按默认模板 + 书籍/章节/站点真实数据组合
//   · 变量: {bookname} {author} {category} {sitename} {chaptername} {chapterno}
//           {chapterCount} {statusText} {intro} {excerpt}
//   · 保存走 /api/admin/seo-templates(60s 缓存即时失效); 「恢复自动」= 清空覆盖
// ============================================================
import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, RotateCcw, Save, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { api } from './helpers'
import type { SeoTplSet } from '@/lib/seo-tpl'

const EMPTY_OVERRIDE = {
  book: { title: '', description: '', keywords: '' },
  toc: { title: '', description: '' },
  chapter: { title: '', description: '', keywords: '' },
}

type OverrideSet = typeof EMPTY_OVERRIDE

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

function Field({ label, hint, value, onChange, textarea, placeholder }: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  textarea?: boolean
  placeholder: string
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
    </div>
  )
}

export function SeoTplSection() {
  const [tpl, setTpl] = useState<SeoTplSet | null>(null)
  const [override, setOverride] = useState<OverrideSet>(EMPTY_OVERRIDE)
  const [customized, setCustomized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载 SEO 模板失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

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
      toast.success('已恢复纯自动 TDK')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '重置失败')
    } finally {
      setSaving(false)
    }
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
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* 书籍页 */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold text-zinc-200">书籍页</h3>
            <Field label="Title" hint="≤40 字最佳" value={override.book.title} onChange={(v) => setOverride((o) => ({ ...o, book: { ...o.book, title: v } }))} placeholder={tpl.book.title} />
            <Field label="Description" hint="≤160 字最佳" textarea value={override.book.description} onChange={(v) => setOverride((o) => ({ ...o, book: { ...o.book, description: v } }))} placeholder={tpl.book.description} />
            <Field label="Keywords" hint="逗号分隔" textarea value={override.book.keywords} onChange={(v) => setOverride((o) => ({ ...o, book: { ...o.book, keywords: v } }))} placeholder={tpl.book.keywords} />
          </CardContent>
        </Card>

        {/* 章节目录页 */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold text-zinc-200">章节目录页</h3>
            <Field label="Title" hint="目录页专用标题" value={override.toc.title} onChange={(v) => setOverride((o) => ({ ...o, toc: { ...o.toc, title: v } }))} placeholder={tpl.toc.title} />
            <Field label="Description" hint="目录页专用描述" textarea value={override.toc.description} onChange={(v) => setOverride((o) => ({ ...o, toc: { ...o.toc, description: v } }))} placeholder={tpl.toc.description} />
            <p className="text-[10px] leading-relaxed text-zinc-600">目录页无独立 Keywords(继承书籍页关键词), 与书籍页标题区分可避免同书多 URL 撞车。</p>
          </CardContent>
        </Card>

        {/* 章节页 */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold text-zinc-200">章节页</h3>
            <Field label="Title" hint="≤40 字最佳" value={override.chapter.title} onChange={(v) => setOverride((o) => ({ ...o, chapter: { ...o.chapter, title: v } }))} placeholder={tpl.chapter.title} />
            <Field label="Description" hint="正文摘要自动截断" textarea value={override.chapter.description} onChange={(v) => setOverride((o) => ({ ...o, chapter: { ...o.chapter, description: v } }))} placeholder={tpl.chapter.description} />
            <Field label="Keywords" hint="逗号分隔" textarea value={override.chapter.keywords} onChange={(v) => setOverride((o) => ({ ...o, chapter: { ...o.chapter, keywords: v } }))} placeholder={tpl.chapter.keywords} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
