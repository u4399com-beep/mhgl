'use client'

// ============================================================
// [R27-2-8] PSEO 关键词页管理 section(仪表盘内嵌面板)
//   统计卡: 已生成数 / 启用页 / 覆盖书籍 / 启用站
//   生成表单: 范围=全部|指定书籍(名称搜索选书 chips) · 每书页数 · 实时拉词开关(默认关防刷)
//   列表: 标题/关键词/路径/来源/时间/删除 + 清空(双确认)
// API: GET/POST/DELETE /api/admin/pseo, DELETE /api/admin/pseo/[id]
// 视觉: 与 Dashboard 同族 zinc-900 深色卡 + violet 主色。
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, RefreshCw, Search, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from './helpers'
import { fmtDateTime, fmtNum } from './helpers'

// ---------------- 类型(与 /api/admin/pseo 响应一致) ----------------

interface PseoStats {
  total: number
  active: number
  disabled: number
  sourceTemplate: number
  sourceSuggest: number
  booksCovered: number
  sitesEnabled: number
}

interface PseoRow {
  id: string
  keyword: string
  slug: string
  title: string
  status: string
  source: string
  createdAt: string
  primaryBookId: string | null
  primaryBook?: { name: string; author: string } | null
}

interface PseoListResp {
  rows: PseoRow[]
  total: number
  page: number
  size: number
  pages: number
  stats: PseoStats
}

interface PseoGenResp {
  generated: number
  skippedExisting: number
  booksScanned: number
  liveBooks: number
  cappedByRunLimit: boolean
  stats: PseoStats
}

interface BookPick {
  id: string
  name: string
  author: string
}

const PAGE_SIZE = 20

export function PseoSection() {
  const [data, setData] = useState<PseoListResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')

  // 生成表单
  const [scope, setScope] = useState<'all' | 'ids'>('all')
  const [picks, setPicks] = useState<BookPick[]>([])
  const [bookQuery, setBookQuery] = useState('')
  const [bookResults, setBookResults] = useState<BookPick[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [perBook, setPerBook] = useState(10)
  const [live, setLive] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState('')
  const [wiping, setWiping] = useState(false)

  const load = useCallback(
    async (p: number) => {
      setLoading(true)
      setError('')
      try {
        const d = await api.get<PseoListResp>('/api/admin/pseo', { page: p, size: PAGE_SIZE })
        setData(d)
        setPage(d.page)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    load(1)
  }, [load])

  const searchBooks = async () => {
    const q = bookQuery.trim()
    if (!q) return
    setSearching(true)
    setBookResults(null)
    try {
      const d = await api.get<{ books: BookPick[] }>('/api/admin/books', { q, size: 5 })
      setBookResults(d.books || [])
    } catch {
      setBookResults([])
    } finally {
      setSearching(false)
    }
  }

  const generate = async () => {
    setGenerating(true)
    setResult('')
    setError('')
    try {
      const body =
        scope === 'all'
          ? { all: true, perBook, useLiveSuggest: live }
          : { bookIds: picks.map((p) => p.id), all: false, perBook, useLiveSuggest: live }
      if (scope === 'ids' && picks.length === 0) {
        setError('指定书籍模式下请先搜索并添加至少 1 本')
        return
      }
      const r = await api.post<PseoGenResp>('/api/admin/pseo', body)
      const capNote = r.cappedByRunLimit ? '(已达单次生成上限 500, 可再点继续)' : ''
      setResult(
        `本次生成 ${r.generated} 页${capNote}, 跳过重复 ${r.skippedExisting}, 扫描书籍 ${r.booksScanned}` +
          (r.liveBooks > 0 ? `, 实时拉词 ${r.liveBooks} 本` : ''),
      )
      await load(1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const removeOne = async (id: string) => {
    if (!window.confirm('删除该 PSEO 页? 删除后 /p/{slug}.html 将 404。')) return
    try {
      await api.del(`/api/admin/pseo/${id}`)
      await load(page)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const wipeAll = async () => {
    if (!window.confirm('确定清空全部 PSEO 页? 该操作不可恢复。')) return
    if (!window.confirm('二次确认: 全部 PSEO 关键词页将被删除, 继续?')) return
    setWiping(true)
    try {
      const r = await api.del<{ deleted: number }>('/api/admin/pseo', { confirm: 'wipe' })
      setResult(`已清空 ${r.deleted} 页`)
      await load(1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWiping(false)
    }
  }

  const s = data?.stats

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm text-zinc-200">
          <Sparkles className="h-4 w-4 text-violet-400" aria-hidden />
          PSEO 关键词页
        </CardTitle>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-zinc-500 hover:text-zinc-200" onClick={() => load(page)}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        {/* 统计卡 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: '已生成页', value: s?.total ?? 0, sub: `模板 ${s?.sourceTemplate ?? 0} / 下拉词 ${s?.sourceSuggest ?? 0}` },
            { label: '启用中', value: s?.active ?? 0, sub: `停用 ${s?.disabled ?? 0}` },
            { label: '覆盖书籍', value: s?.booksCovered ?? 0, sub: '主书去重数' },
            { label: '启用站点', value: s?.sitesEnabled ?? 0, sub: '站群可用' },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <div className="text-[11px] text-zinc-500">{c.label}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">{fmtNum(c.value)}</div>
              <div className="mt-0.5 truncate text-[10px] text-zinc-600">{c.sub}</div>
            </div>
          ))}
        </div>

        {/* 生成表单 */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            <span className="text-zinc-500">生成范围</span>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="radio" name="pseo-scope" checked={scope === 'all'} onChange={() => setScope('all')} className="accent-violet-500" />
              全部书籍
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="radio" name="pseo-scope" checked={scope === 'ids'} onChange={() => setScope('ids')} className="accent-violet-500" />
              指定书籍
            </label>
            <label className="ml-auto flex items-center gap-1.5">
              每书页数
              <input
                type="number"
                min={1}
                max={30}
                value={perBook}
                onChange={(e) => setPerBook(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
                className="h-7 w-16 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-zinc-200 focus:border-violet-500 focus:outline-none"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-1.5" title="实时调用搜索引擎下拉词(≤50 本, 默认关)">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="accent-violet-500" />
              实时拉词
            </label>
            <Button size="sm" className="h-7 gap-1 bg-violet-600 text-xs text-white hover:bg-violet-700" onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              生成
            </Button>
          </div>

          {scope === 'ids' && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  value={bookQuery}
                  onChange={(e) => setBookQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') searchBooks()
                  }}
                  placeholder="按书名/作者搜索并添加书籍…"
                  className="h-8 min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
                />
                <Button size="sm" variant="outline" className="h-8 gap-1 border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800" onClick={searchBooks} disabled={searching}>
                  {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  搜索
                </Button>
              </div>
              {picks.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {picks.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-300">
                      {p.name}
                      <button type="button" aria-label={`移除 ${p.name}`} onClick={() => setPicks((arr) => arr.filter((x) => x.id !== p.id))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {bookResults && (
                <div className="space-y-1">
                  {bookResults.length === 0 ? (
                    <p className="text-[11px] text-zinc-600">无匹配书籍</p>
                  ) : (
                    bookResults.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setPicks((arr) => (arr.some((x) => x.id === b.id) ? arr : [...arr, b]))
                        }}
                        className="flex w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-left text-[11px] text-zinc-300 hover:border-violet-500/40 hover:text-violet-300"
                      >
                        <span className="truncate">{b.name}</span>
                        <span className="shrink-0 text-zinc-500">{b.author}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {result && <p className="mt-2 text-[11px] text-emerald-400">{result}</p>}
          {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
        </div>

        {/* 列表 */}
        {!data || data.rows.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-600">
            {loading ? '加载中…' : '暂无 PSEO 页; 选择范围后点击「生成」'}
          </div>
        ) : (
          <div className="admin-scroll max-h-80 space-y-2 overflow-y-auto pr-1">
            {data.rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium text-zinc-200" title={r.title}>{r.title}</span>
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${r.source === 'template' ? 'border-sky-500/40 bg-sky-500/10 text-sky-400' : 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-400'}`}>
                      {r.source === 'template' ? '模板' : '下拉词'}
                    </span>
                    {r.status !== 'active' && (
                      <span className="shrink-0 rounded-full border border-zinc-600 bg-zinc-700/40 px-1.5 py-0.5 text-[10px] text-zinc-400">停用</span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-zinc-500">
                    /p/{r.slug}.html · {r.primaryBook?.name || '-'} · {fmtDateTime(r.createdAt)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                  onClick={() => removeOne(r.id)}
                  aria-label={`删除 ${r.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* 分页 + 清空 */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>
              共 {fmtNum(data.total)} 页 · 第 {data.page}/{data.pages} 页
            </span>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-6 border-zinc-700 px-2 text-[11px] text-zinc-400 hover:bg-zinc-800" disabled={data.page <= 1} onClick={() => load(page - 1)}>
                上一页
              </Button>
              <Button size="sm" variant="outline" className="h-6 border-zinc-700 px-2 text-[11px] text-zinc-400 hover:bg-zinc-800" disabled={data.page >= data.pages} onClick={() => load(page + 1)}>
                下一页
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-zinc-600 hover:text-red-400" onClick={wipeAll} disabled={wiping}>
                {wiping ? <Loader2 className="h-3 w-3 animate-spin" /> : '清空全部'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
