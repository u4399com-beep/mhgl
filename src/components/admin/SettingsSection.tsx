'use client'

// ============================================================
// 系统设置 — 下载默认站点信息 / 伪静态设置 / 数据目录说明
// ============================================================
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, FolderOpen, Link2, Loader2, Save, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { api, safeJsonParse } from './helpers'
import { PSEUDO_PRESETS, PSEUDO_DEFAULT, type PseudoPreset } from '@/lib/pseudostatic'

interface DownloadSetting {
  siteName?: string
  siteUrl?: string
}

export function SettingsSection() {
  const [siteName, setSiteName] = useState('')
  const [siteUrl, setSiteUrl] = useState('')
  const [preset, setPreset] = useState<PseudoPreset>(PSEUDO_DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingPseudo, setSavingPseudo] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const settings = await api.get<Record<string, unknown>>('/api/admin/settings')
        const dl = safeJsonParse<DownloadSetting>(
          typeof settings.download === 'string' ? settings.download : JSON.stringify(settings.download ?? null),
          {},
        )
        setSiteName(dl.siteName || '')
        setSiteUrl(dl.siteUrl || '')
        const ps = safeJsonParse<{ preset?: string }>(
          typeof settings.pseudostatic === 'string' ? settings.pseudostatic : JSON.stringify(settings.pseudostatic ?? null),
          {},
        )
        const found = PSEUDO_PRESETS.find((p) => p.id === ps.preset)
        if (found) setPreset(found.id)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '加载设置失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/api/admin/settings', { download: { siteName, siteUrl } })
      toast.success('设置已保存')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const savePseudo = async (next: PseudoPreset) => {
    const prev = preset
    setPreset(next) // 乐观更新, 选择即生效的即时反馈
    setSavingPseudo(true)
    try {
      await api.put('/api/admin/settings', { pseudostatic: { preset: next } })
      toast.success(`伪静态已切换: ${PSEUDO_PRESETS.find((p) => p.id === next)?.name || next}`, {
        description: next === 'query' ? '前台链接已恢复查询串形态' : '前台书籍页/阅读页链接已按新预设生成(60s 内全量生效)',
      })
    } catch (e) {
      setPreset(prev)
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSavingPseudo(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
          <Settings className="h-5 w-5 text-violet-400" />
          系统设置
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">TXT 生成默认站点信息 / 前台伪静态 URL / 数据目录说明</p>
      </div>

      {/* ---------- 伪静态设置 ---------- */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm text-zinc-200">
            <Link2 className="h-4 w-4 text-teal-400" />
            伪静态设置（前台阅读模块 URL 形态）
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500">
            书籍页与阅读页的地址预设：选中即保存并全站生效；历史形态链接宽容解析仍可访问，永不断链
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-zinc-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载中…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {PSEUDO_PRESETS.map((p) => {
                  const active = p.id === preset
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={`伪静态预设: ${p.name}`}
                      disabled={savingPseudo}
                      onClick={() => !active && savePseudo(p.id)}
                      className={`rounded-lg border p-3 text-left transition-all ${
                        active
                          ? 'border-teal-500/70 bg-teal-500/10 ring-1 ring-teal-500/40'
                          : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-600'
                      } ${savingPseudo ? 'cursor-wait opacity-70' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-semibold ${active ? 'text-teal-300' : 'text-zinc-200'}`}>{p.name}</span>
                        {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-400" aria-hidden />}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{p.desc}</p>
                      <div className="mt-2 space-y-1 font-mono text-[11px] leading-snug">
                        <div className="truncate rounded bg-zinc-900 px-2 py-1 text-emerald-400" title={p.sampleBook.replace('{id}', '书号')}>
                          {p.sampleBook}
                        </div>
                        <div className="truncate rounded bg-zinc-900 px-2 py-1 text-sky-300" title={p.sampleRead.replace('{cid}', '章序号')}>
                          {p.sampleRead}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-500">
                说明：数字书号在书籍入库时自动分配（存量书可用 <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-emerald-400">bun scripts/backfill-book-num.ts</code> 回补）。
                「动态查询」为原生形态（默认）；其余预设下，站内书籍页/阅读页、sitemap、链轮与 canonical 将统一按所选形态生成；
                切换预设后旧地址仍按宽容解析直达，不影响已被搜索引擎收录的链接。
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-zinc-200">下载默认站点信息</CardTitle>
            <CardDescription className="text-xs text-zinc-500">TXT 生成表单将预填此处配置的站点名称与域名</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-sm text-zinc-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载中…
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">站点名称</Label>
                  <Input className="h-9 border-zinc-700 bg-zinc-950 text-sm" placeholder="例: 笔趣阁" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">站点域名 / 地址</Label>
                  <Input className="h-9 border-zinc-700 bg-zinc-950 font-mono text-xs" placeholder="www.example.com" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
                </div>
                <Button size="sm" className="gap-1.5" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  保存设置
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm text-zinc-200">
              <FolderOpen className="h-4 w-4 text-amber-400" />
              数据目录说明
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">TXT 存储模式与封面转存的落盘位置</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-2.5">
              <DirRow dir="data/novels" desc="章节 TXT 存储 — 每本书一个子文件夹, 每章一个 txt 文件" />
              <DirRow dir="data/covers" desc="封面存储 — 采集的封面图自动转为 webp 格式" />
              <DirRow dir="data/downloads" desc="下载成品 — 合成后的完整 TXT 电子书文件" />
              <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-500">
                提示: 数据库存储模式下章节正文保存在 SQLite 中, 无需依赖文件目录; TXT 模式的章节会在采集时同步落盘,
                删除书籍时会连带清理对应文件夹。
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function DirRow({ dir, desc }: { dir: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
      <code className="shrink-0 rounded bg-zinc-800 px-2 py-1 font-mono text-xs text-emerald-400">{dir}</code>
      <span className="text-xs text-zinc-400">{desc}</span>
    </div>
  )
}
