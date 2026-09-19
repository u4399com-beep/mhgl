'use client'

// ============================================================
// [R42-1] 代理池管理区块 — 免费代理 抓取/验证/匹配/定向测试/清理
// 数据源: /api/admin/proxy-pool(GET 列表+统计+作业态 / PATCH 设置 / DELETE 清空)
//        /harvest(抓取) /check(验证) /test-target(定向测试) /prune(清理死代理)
// 消费链: 规则/任务 fetchConfig.needsProxy=true → runner 启动前自动从池中按
//        国别/健康分匹配写回 fetchConfig.proxyUrl(见 runner.ts R42-1-2)
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Activity,
  Eraser,
  Crosshair,
  Globe2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Signal,
} from 'lucide-react'
import { api } from './helpers'
import { useAliveRef } from './hooks'

interface FreeProxyRow {
  id: string
  protocol: string
  host: string
  port: number
  anonymity: string
  country: string
  countryName: string
  latencyMs: number | null
  alive: boolean
  successCount: number
  failCount: number
  healthScore: number
  lastError: string
  source: string
  lastCheckedAt: string | null
  lastSuccessAt: string | null
}

interface PoolStats {
  total: number
  alive: number
  unchecked: number
  avgLatency: number | null
  byCountry: Array<{ country: string; count: number }>
  byProtocol: Array<{ protocol: string; count: number }>
}

interface PoolJob {
  harvesting: boolean
  checking: boolean
  lastHarvest?: { parsed: number; added: number; elapsedMs: number; perSource: Array<{ id: string; ok: boolean; count: number; error?: string }> }
  lastCheck?: { checked: number; alive: number; dead: number; elapsedMs: number; mode: string }
  lastError?: string
}

interface PoolSetting {
  auto: boolean
  intervalMin: number
  checkBatch: number
  pickLimit: number
}

interface ListResp {
  stats: PoolStats
  setting: PoolSetting
  job: PoolJob
  total: number
  page: number
  pageSize: number
  list: FreeProxyRow[]
}

interface TargetItem {
  proxy: string
  code: number | null
  ms: number
  ok: boolean
  error?: string
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

export function ProxyPoolSection() {
  const aliveRef = useAliveRef()
  const [data, setData] = useState<ListResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [aliveFilter, setAliveFilter] = useState('')
  const [protocolFilter, setProtocolFilter] = useState('')
  const [sortKey, setSortKey] = useState('health')
  const [testUrl, setTestUrl] = useState('')
  const [testCountry, setTestCountry] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<TargetItem[] | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async (silent = false) => {
    try {
      const d = await api.get<ListResp>('/api/admin/proxy-pool', {
        page,
        pageSize: 50,
        alive: aliveFilter || undefined,
        protocol: protocolFilter || undefined,
        sort: sortKey,
      })
      if (!aliveRef.current) return
      setData(d)
    } catch (e) {
      if (!silent && aliveRef.current) toast.error(`加载失败: ${(e as Error).message}`)
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }, [page, aliveFilter, protocolFilter, sortKey, aliveRef])

  const job = data?.job
  const busy = !!(job?.harvesting || job?.checking)

  // 轮询: 作业进行中 2s 一次; 空闲 15s 一次
  useEffect(() => {
    void load()
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = setInterval(() => { void load(true) }, busy ? 2000 : 15000)
    return () => { if (pollTimer.current) clearInterval(pollTimer.current) }
  }, [load, busy])

  const doHarvest = async () => {
    try {
      await api.post('/api/admin/proxy-pool/harvest')
      toast.success('抓取作业已启动(后台执行, 完成后自动刷新)')
      await load(true)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const doCheck = async (mode: 'unchecked' | 'stale' | 'alive') => {
    try {
      await api.post('/api/admin/proxy-pool/check', { mode, limit: data?.setting?.checkBatch })
      toast.success(`验证作业已启动(${mode === 'unchecked' ? '未验证优先' : mode === 'stale' ? '全量刷旧' : '活代理刷新'})`)
      await load(true)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const doPrune = async () => {
    try {
      const r = await api.post<{ deleted: number }>('/api/admin/proxy-pool/prune')
      toast.success(`已清理 ${r.deleted} 条死代理`)
      await load(true)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const doTestTarget = async () => {
    if (!/^https?:\/\/\S+$/i.test(testUrl.trim())) {
      toast.error('请输入合法的目标地址(http/https)')
      return
    }
    setTesting(true)
    setTestResults(null)
    try {
      const r = await api.post<{ results: TargetItem[]; hitCount: number }>('/api/admin/proxy-pool/test-target', {
        url: testUrl.trim(),
        countries: testCountry.trim(),
        limit: 10,
      })
      setTestResults(r.results)
      toast.success(`定向测试完成: ${r.hitCount}/${r.results.length} 条可达`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  const patchSetting = async (patch: Partial<PoolSetting>) => {
    try {
      await api.patch('/api/admin/proxy-pool', { ...(data?.setting || {}), ...patch })
      await load(true)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const stats = data?.stats
  const setting = data?.setting
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="space-y-4">
      {/* 标题 + 统计卡 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-1"><CardTitle className="flex items-center gap-1.5 text-xs font-medium text-zinc-400"><Globe2 className="h-3.5 w-3.5" /> 池内总量</CardTitle></CardHeader>
          <CardContent className="py-2"><div className="text-2xl font-bold tabular-nums">{stats?.total ?? '—'}</div></CardContent>
        </Card>
        <Card className="border-emerald-900/50 bg-zinc-900/60">
          <CardHeader className="pb-1"><CardTitle className="flex items-center gap-1.5 text-xs font-medium text-zinc-400"><ShieldCheck className="h-3.5 w-3.5" /> 存活可用</CardTitle></CardHeader>
          <CardContent className="py-2"><div className="text-2xl font-bold tabular-nums text-emerald-400">{stats?.alive ?? '—'}</div></CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-1"><CardTitle className="flex items-center gap-1.5 text-xs font-medium text-zinc-400"><Activity className="h-3.5 w-3.5" /> 待验证</CardTitle></CardHeader>
          <CardContent className="py-2"><div className="text-2xl font-bold tabular-nums text-amber-400">{stats?.unchecked ?? '—'}</div></CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-1"><CardTitle className="flex items-center gap-1.5 text-xs font-medium text-zinc-400"><Signal className="h-3.5 w-3.5" /> 平均延迟</CardTitle></CardHeader>
          <CardContent className="py-2"><div className="text-2xl font-bold tabular-nums">{stats?.avgLatency != null ? `${stats.avgLatency}ms` : '—'}</div></CardContent>
        </Card>
      </div>

      {/* 国别分布 */}
      {!!stats?.byCountry?.length && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
          <span className="text-zinc-500">存活国别分布:</span>
          {stats.byCountry.map((c) => (
            <Badge key={c.country} variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
              {c.country} ×{c.count}
            </Badge>
          ))}
        </div>
      )}

      {/* 作业状态行 */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {job?.harvesting && (
          <Badge className="gap-1 bg-sky-500/15 text-sky-300"><Loader2 className="h-3 w-3 animate-spin" /> 抓取进行中…</Badge>
        )}
        {job?.checking && (
          <Badge className="gap-1 bg-violet-500/15 text-violet-300"><Loader2 className="h-3 w-3 animate-spin" /> 验证进行中…</Badge>
        )}
        {job?.lastHarvest && !job.harvesting && (
          <span className="text-zinc-500">上次抓取: 解析 {job.lastHarvest.parsed} / 新增 {job.lastHarvest.added} 条 · {(job.lastHarvest.elapsedMs / 1000).toFixed(1)}s</span>
        )}
        {job?.lastCheck && !job.checking && (
          <span className="text-zinc-500">上次验证: 存活 {job.lastCheck.alive} / 验证 {job.lastCheck.checked} 条 · {(job.lastCheck.elapsedMs / 1000).toFixed(1)}s</span>
        )}
        {job?.lastError && <span className="text-red-400">{job.lastError}</span>}
      </div>

      {/* 操作行 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={doHarvest} disabled={busy} className="gap-1.5">
          {job?.harvesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe2 className="h-3.5 w-3.5" />}
          抓取新代理
        </Button>
        <Button size="sm" variant="outline" onClick={() => doCheck('unchecked')} disabled={busy} className="gap-1.5 border-zinc-700 bg-zinc-900">
          {job?.checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          验证未验证
        </Button>
        <Button size="sm" variant="outline" onClick={() => doCheck('stale')} disabled={busy} className="gap-1.5 border-zinc-700 bg-zinc-900">
          <RefreshCw className="h-3.5 w-3.5" />
          全量刷旧
        </Button>
        <Button size="sm" variant="outline" onClick={doPrune} disabled={busy} className="gap-1.5 border-zinc-700 bg-zinc-900">
          <Eraser className="h-3.5 w-3.5" />
          清理死代理
        </Button>
        <div className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
          <Switch
            checked={setting?.auto ?? true}
            onCheckedChange={(v) => patchSetting({ auto: v })}
            aria-label="自动保鲜循环"
          />
          <span>自动保鲜</span>
          <Input
            type="number"
            value={setting?.intervalMin ?? 30}
            onChange={(e) => patchSetting({ intervalMin: Number(e.target.value) })}
            className="h-7 w-16 border-zinc-700 bg-zinc-900 text-xs"
            aria-label="保鲜周期(分钟)"
          />
          <span>分钟</span>
        </div>
      </div>

      {/* 定向测试 */}
      <Card className="border-zinc-800 bg-zinc-900/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm"><Crosshair className="h-4 w-4 text-violet-400" /> 定向测试(对目标站点用池内代理探活)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Input
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              placeholder="https://www.trxsw.com/ (目标站点)"
              className="h-8 min-w-56 flex-1 border-zinc-700 bg-zinc-900 text-xs"
            />
            <Input
              value={testCountry}
              onChange={(e) => setTestCountry(e.target.value)}
              placeholder="国别过滤 US,CN(可空)"
              className="h-8 w-40 border-zinc-700 bg-zinc-900 text-xs"
            />
            <Button size="sm" onClick={doTestTarget} disabled={testing} className="gap-1.5">
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
              测试
            </Button>
          </div>
          {testResults && (
            <div className="max-h-40 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/60 p-2 text-xs">
              {testResults.length === 0 ? (
                <div className="text-zinc-500">池中无匹配代理(先抓取+验证)</div>
              ) : testResults.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 border-b border-zinc-900 py-1 last:border-0">
                  <span className="font-mono text-zinc-300">{r.proxy}</span>
                  <span className="flex items-center gap-2">
                    {r.ok ? <Badge className="bg-emerald-500/15 text-emerald-300">HTTP {r.code} · {r.ms}ms</Badge> : <Badge variant="outline" className="border-red-900 text-red-400">{r.error || '失败'}</Badge>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 筛选 + 列表 */}
      <Card className="border-zinc-800 bg-zinc-900/40">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-sm">代理列表</CardTitle>
            <div className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
              <select
                value={aliveFilter}
                onChange={(e) => { setPage(1); setAliveFilter(e.target.value) }}
                className="h-7 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-xs"
                aria-label="存活筛选"
              >
                <option value="">全部状态</option>
                <option value="true">仅存活</option>
                <option value="false">仅失效</option>
              </select>
              <select
                value={protocolFilter}
                onChange={(e) => { setPage(1); setProtocolFilter(e.target.value) }}
                className="h-7 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-xs"
                aria-label="协议筛选"
              >
                <option value="">全部协议</option>
                <option value="http">HTTP</option>
                <option value="socks5">SOCKS5</option>
                <option value="socks4">SOCKS4</option>
              </select>
              <select
                value={sortKey}
                onChange={(e) => { setPage(1); setSortKey(e.target.value) }}
                className="h-7 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-xs"
                aria-label="排序"
              >
                <option value="health">按健康分</option>
                <option value="latency">按延迟</option>
                <option value="checked">按验证时间</option>
                <option value="created">按收录时间</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> 加载中…</div>
          ) : !data?.list?.length ? (
            <div className="py-10 text-center text-sm text-zinc-500">
              池为空 — 点上方「抓取新代理」从 17 个免费源采集, 完成后「验证未验证」筛选可用代理
            </div>
          ) : (
            <div className="pool-scroll max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-zinc-900 text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">协议</th>
                    <th className="px-3 py-2 font-medium">地址</th>
                    <th className="px-3 py-2 font-medium">国别</th>
                    <th className="px-3 py-2 font-medium">匿名</th>
                    <th className="px-3 py-2 font-medium">延迟</th>
                    <th className="px-3 py-2 font-medium">健康分</th>
                    <th className="px-3 py-2 font-medium">成/败</th>
                    <th className="px-3 py-2 font-medium">最近验证</th>
                    <th className="px-3 py-2 font-medium">来源</th>
                  </tr>
                </thead>
                <tbody>
                  {data.list.map((p) => (
                    <tr key={p.id} className="border-t border-zinc-800/60 hover:bg-zinc-900/60">
                      <td className="px-3 py-1.5"><Badge variant="outline" className="border-zinc-700 text-[10px] uppercase">{p.protocol}</Badge></td>
                      <td className="px-3 py-1.5 font-mono text-zinc-300">{p.host}:{p.port}</td>
                      <td className="px-3 py-1.5">{p.country || <span className="text-zinc-600">—</span>}</td>
                      <td className="px-3 py-1.5 text-zinc-400">{p.anonymity || '—'}</td>
                      <td className="px-3 py-1.5 tabular-nums">{p.latencyMs != null ? `${p.latencyMs}ms` : '—'}</td>
                      <td className="px-3 py-1.5 tabular-nums">
                        <span className={p.healthScore >= 60 ? 'text-emerald-400' : p.healthScore >= 30 ? 'text-amber-400' : 'text-zinc-500'}>{p.healthScore}</span>
                      </td>
                      <td className="px-3 py-1.5 tabular-nums text-zinc-400">{p.successCount}/{p.failCount}</td>
                      <td className="px-3 py-1.5 text-zinc-500">{fmtTime(p.lastCheckedAt)}</td>
                      <td className="max-w-36 truncate px-3 py-1.5 text-zinc-600" title={p.lastError || p.source}>{p.source || p.lastError || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && data.total > data.pageSize && (
            <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-2 text-xs text-zinc-400">
              <span>共 {data.total} 条 · 第 {data.page}/{totalPages} 页</span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-6 border-zinc-700 bg-zinc-900 px-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
                <Button size="sm" variant="outline" className="h-6 border-zinc-700 bg-zinc-900 px-2" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 用法说明 */}
      <Card className="border-zinc-800/60 bg-zinc-900/20">
        <CardContent className="py-3 text-xs leading-relaxed text-zinc-500">
          <span className="text-zinc-400">采集联动:</span> 在采集规则(或任务的 fetchConfig 覆盖)中配置{' '}
          <code className="rounded bg-zinc-900 px-1 py-0.5 text-[11px] text-violet-300">"needsProxy": true</code> 与可选{' '}
          <code className="rounded bg-zinc-900 px-1 py-0.5 text-[11px] text-violet-300">"proxyCountries": "US,CN"</code>,
          任务启动时自动从本池按国别/健康分挑选代理注入(无需手工填 proxyUrl); 自动保鲜循环默认{' '}
          {setting?.intervalMin ?? 30} 分钟执行一轮 抓取→验证, 保证池内代理新鲜度。
        </CardContent>
      </Card>

      <style dangerouslySetInnerHTML={{ __html: `
        .pool-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .pool-scroll::-webkit-scrollbar-track { background: transparent; }
        .pool-scroll::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
        .pool-scroll { scrollbar-width: thin; scrollbar-color: #3f3f46 transparent; }
      ` }} />
    </div>
  )
}
