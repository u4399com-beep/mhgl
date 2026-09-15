'use client'

// ============================================================
// BuiltinRulesDialog — 内置规则库浏览器 (R15-b2)
// 数据源: GET /api/admin/rules/builtin(scripts 种子规则注册表, R15-b1 生成)
// 导入:   POST /api/admin/rules/import-builtin(幂等: 同名旧规则先删后建, 与 seed 脚本口径一致)
//
// 视觉规范: 对齐 RuleTemplateDialog(feat-round-8) —
//   主对话框 max-w-4xl, max-h-[85vh], 内层 admin-scroll 滚动;
//   筛选条 sticky top, bg-zinc-950/80 backdrop-blur;
//   卡片: border-zinc-800 bg-zinc-900/60 hover:border-violet-600 transition;
//   桌面 2 列 / 移动 1 列网格, gap-4。
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from './ConfirmDialog'
import { CheckCircle2, Circle, FileJson, Library, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { api } from './helpers'

/** GET /api/admin/rules/builtin 单条形态 */
interface BuiltinRuleRow {
  key: string
  name: string
  description: string
  enabled: boolean
  source: string
  config: Record<string, unknown>
  imported: boolean
  importedIds: string[]
}

/** POST /api/admin/rules/import-builtin 响应形态 */
interface ImportResp {
  created: number
  removedOld: number
  results: { key: string; name: string; id?: string; deletedOld: number; error?: string }[]
}

interface BuiltinRulesDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** 导入成功后回调(供父组件刷新规则列表) */
  onImported?: () => void
}

/** fetch 错误 → 用户可读文案: 401(登录过期)/网络错误/业务错误信封统一转换 */
function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : ''
  if (!m) return '网络错误, 请稍后重试'
  if (/fetch|network/i.test(m)) return '网络错误, 请检查服务是否可用'
  if (/未登录|会话已过期|401/.test(m)) return '登录已过期, 请重新登录后台后再试'
  return m
}

export function BuiltinRulesDialog({ open, onOpenChange, onImported }: BuiltinRulesDialogProps) {
  const [rules, setRules] = useState<BuiltinRuleRow[] | null>(null) // null = 加载中
  const [loadError, setLoadError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [importingKey, setImportingKey] = useState<string | null>(null) // 单条导入 loading
  const [importingAll, setImportingAll] = useState(false)
  const [confirmAllOpen, setConfirmAllOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set()) // 配置 JSON 展开 key 集合

  const fetchRules = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await api.get<{ rules: BuiltinRuleRow[] }>('/api/admin/rules/builtin')
      setRules(Array.isArray(data?.rules) ? data.rules : [])
    } catch (e) {
      setRules([])
      setLoadError(errMsg(e))
    }
  }, [])

  // 每次打开都重新拉取(导入状态可能已被 seed 脚本/其他会话改变)
  useEffect(() => {
    if (open) void fetchRules()
  }, [open, fetchRules])

  const filtered = useMemo(() => {
    if (!rules) return []
    const kw = keyword.trim().toLowerCase()
    if (!kw) return rules
    return rules.filter(
      (r) =>
        r.name.toLowerCase().includes(kw) ||
        r.description.toLowerCase().includes(kw) ||
        r.source.toLowerCase().includes(kw),
    )
  }, [rules, keyword])

  const importedCount = useMemo(() => rules?.filter((r) => r.imported).length ?? 0, [rules])

  // ---- 单条导入(已导入也允许重新导入: 服务端先删同名旧规则再重建) ----
  const handleImport = async (row: BuiltinRuleRow) => {
    setImportingKey(row.key)
    try {
      const res = await api.post<ImportResp>('/api/admin/rules/import-builtin', { keys: [row.key] })
      const r = res.results[0]
      if (r?.error) {
        toast.error(`导入「${row.name}」失败: ${r.error}`)
      } else {
        await fetchRules()
        onImported?.()
        toast.success(
          res.removedOld > 0
            ? `已重新导入「${row.name}」(替换 ${res.removedOld} 条同名旧规则)`
            : `已导入规则「${row.name}」`,
        )
      }
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setImportingKey(null)
    }
  }

  // ---- 全部导入: 单次 POST 传 keys 数组(服务端逐条处理, 单条失败不中断) ----
  const handleImportAll = async () => {
    setConfirmAllOpen(false)
    if (!rules || rules.length === 0) return
    setImportingAll(true)
    const tid = toast.loading(`正在导入 ${rules.length} 条内置规则…`)
    try {
      const res = await api.post<ImportResp>('/api/admin/rules/import-builtin', {
        keys: rules.map((r) => r.key),
      })
      const failed = res.results.filter((r) => r.error)
      await fetchRules()
      onImported?.()
      if (failed.length === 0) {
        toast.success(`全部导入完成: 成功 ${res.created} 条(替换旧规则 ${res.removedOld} 条)`, { id: tid })
      } else {
        toast.warning(`导入完成: 成功 ${res.created} 条 / 失败 ${failed.length} 条`, {
          id: tid,
          description: failed.map((f) => `${f.name || f.key}: ${f.error}`).join('\n'),
        })
      }
    } catch (e) {
      toast.error(errMsg(e), { id: tid })
    } finally {
      setImportingAll(false)
    }
  }

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex max-h-[85vh] flex-col gap-0 border-zinc-800 bg-zinc-950 p-0 sm:max-w-4xl"
          showCloseButton
        >
          {/* 头部 */}
          <DialogHeader className="flex-shrink-0 border-b border-zinc-800 p-6 pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
              <Library className="h-5 w-5 text-violet-400" />
              内置规则库
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-500">
              来自 scripts 种子规则库的实测采集规则, 一键幂等导入; 同名旧规则会先删除再重建, 已导入的规则可重新导入以恢复默认配置。
            </DialogDescription>
          </DialogHeader>

          {/* 筛选条 (sticky top) */}
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950/80 p-4 backdrop-blur">
            <Input
              className="h-9 min-w-[180px] flex-1 border-zinc-700 bg-zinc-900 text-sm text-zinc-200 placeholder:text-zinc-600"
              placeholder="按名称 / 描述 / 来源脚本搜索…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              aria-label="搜索内置规则"
            />
            <div className="flex-shrink-0 text-xs text-zinc-500">
              {filtered.length} / {rules?.length ?? 0} 条 · 已导入 {importedCount}
            </div>
          </div>

          {/* 规则网格 (scroll) */}
          <div className="admin-scroll flex-1 overflow-y-auto p-4 sm:p-6">
            {rules === null ? (
              <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在加载内置规则…
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-zinc-500">
                <Library className="h-8 w-8 text-zinc-700" />
                <p>{loadError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 border-zinc-700 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800"
                  onClick={() => void fetchRules()}
                >
                  <RefreshCw className="h-3 w-3" />
                  重试
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-zinc-500">
                <Library className="h-8 w-8 text-zinc-700" />
                <p>没有匹配的内置规则, 换个关键字试试。</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filtered.map((row) => (
                  <BuiltinRuleCard
                    key={row.key}
                    row={row}
                    importing={importingAll || importingKey === row.key}
                    expanded={expanded.has(row.key)}
                    onImport={() => void handleImport(row)}
                    onToggleConfig={() => toggleExpanded(row.key)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 底部: 幂等说明 + 全部导入 */}
          <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950/80 px-6 py-3 backdrop-blur">
            <p className="text-xs text-zinc-600">
              导入为幂等操作: 每条规则先删除库中全部同名旧规则(含历史重复)再按注册表重建。
            </p>
            <Button
              size="sm"
              className="h-9 gap-1.5 bg-violet-600 text-white hover:bg-violet-500"
              disabled={importingAll || importingKey !== null || !rules || rules.length === 0}
              onClick={() => setConfirmAllOpen(true)}
            >
              {importingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Library className="h-3.5 w-3.5" />}
              全部导入
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 全部导入确认 */}
      <ConfirmDialog
        open={confirmAllOpen}
        onOpenChange={setConfirmAllOpen}
        title={`确认导入全部 ${rules?.length ?? 0} 条内置规则?`}
        description="将对每条规则执行幂等导入: 先删除库中全部同名旧规则再按注册表配置重建。同名规则的自定义修改会被覆盖; 单条失败不会中断其余导入。"
        confirmText="全部导入"
        tone="teal"
        onConfirm={() => void handleImportAll()}
      />
    </>
  )
}

// ============================================================
// 内置规则卡片 — 网格单元 (R15-b2)
// ============================================================
interface BuiltinRuleCardProps {
  row: BuiltinRuleRow
  importing: boolean
  expanded: boolean
  onImport: () => void
  onToggleConfig: () => void
}

function BuiltinRuleCard({ row, importing, expanded, onImport, onToggleConfig }: BuiltinRuleCardProps) {
  return (
    <Card className="group flex flex-col gap-3 border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-violet-600 hover:bg-zinc-900">
      {/* 头部: 来源徽章 + 导入状态徽章 */}
      <div className="flex items-start justify-between gap-2">
        <Badge
          variant="outline"
          className="max-w-[70%] truncate border-zinc-700/70 bg-zinc-800/60 px-2 py-0.5 font-mono text-[10px] text-zinc-400"
          title={row.source}
        >
          {row.source}
        </Badge>
        {row.imported ? (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-600/50 bg-zinc-800/60 px-2 py-0.5 text-[10px] text-emerald-400"
            title={row.importedIds.length > 1 ? `库中存在 ${row.importedIds.length} 条同名规则` : '库中已存在同名规则'}
          >
            <CheckCircle2 className="h-3 w-3" />
            已导入
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="gap-1 border-violet-600/60 px-2 py-0.5 text-[10px] text-violet-300"
          >
            <Circle className="h-2.5 w-2.5" />
            未导入
          </Badge>
        )}
      </div>

      {/* 名称 */}
      <h3 className="text-sm font-semibold text-zinc-100">{row.name}</h3>

      {/* 描述 (2 行省略) */}
      <p className="line-clamp-2 text-xs leading-relaxed text-zinc-400" title={row.description}>
        {row.description}
      </p>

      {/* 配置 JSON 展开(轻量 details 形态: 只读 <pre>) */}
      {expanded && (
        <pre className="admin-scroll max-h-56 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
          {JSON.stringify(row.config, null, 2)}
        </pre>
      )}

      {/* 按钮组 */}
      <div className="mt-auto flex items-center gap-2 pt-1">
        <Button
          size="sm"
          className="h-8 flex-1 gap-1.5 bg-violet-600 text-xs text-white hover:bg-violet-500"
          disabled={importing}
          onClick={onImport}
          title={
            row.imported
              ? '重新导入: 会先删除库中同名旧规则(含历史重复)后按注册表配置重建'
              : '按注册表配置创建同名采集规则'
          }
        >
          {importing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {row.imported ? '重新导入' : '导入'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-zinc-700 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800"
          onClick={onToggleConfig}
        >
          <FileJson className="h-3 w-3" />
          {expanded ? '收起配置' : '配置'}
        </Button>
      </div>
    </Card>
  )
}
