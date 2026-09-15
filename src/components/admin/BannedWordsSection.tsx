'use client'

// ============================================================
// 违禁词过滤 — 后台区块 [R21-h-1]
// 词表编辑(每行一词) + 处理方式(打码/删除) + 保存
// 存储: Setting 表 key 'bannedWords' → JSON { mode, words[] }
// 保存走 settings API PUT, 服务端读侧缓存(60s)即时失效 → 前台章节
// 正文(/api/public/chapter)立即按新词表过滤(只过滤文本, 不动标签)
// 引擎/上限常量与消毒逻辑复用 src/lib/banned-words.ts
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Loader2, RefreshCw, Save, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { api } from './helpers'
import {
  BANNED_MASK_MAX_STARS,
  BANNED_WORD_MAX_LEN,
  BANNED_WORDS_MAX_COUNT,
  type BannedWordsConfig,
  type BannedWordsMode,
} from '@/lib/banned-words'

/** 文本框输入 → 词表(去空行/去首尾空白/按大小写去重/截断超长/钳总量), 与服务端消毒口径一致 */
function parseWordsInput(input: string): { words: string[]; dropped: number } {
  const seen = new Set<string>()
  const words: string[] = []
  let dropped = 0
  for (const line of input.split(/\r?\n/)) {
    const w = line.trim()
    if (!w) continue
    if (words.length >= BANNED_WORDS_MAX_COUNT) {
      dropped++
      continue
    }
    const key = w.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    words.push(w.length > BANNED_WORD_MAX_LEN ? w.slice(0, BANNED_WORD_MAX_LEN) : w)
  }
  return { words, dropped }
}

export function BannedWordsSection() {
  const [mode, setMode] = useState<BannedWordsMode>('mask')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const parsed = useMemo(() => parseWordsInput(text), [text])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<Record<string, unknown>>('/api/admin/settings')
      const raw = data?.bannedWords
      const cfg = raw as BannedWordsConfig | undefined
      setMode(cfg?.mode === 'remove' ? 'remove' : 'mask')
      const words = Array.isArray(cfg?.words) ? cfg.words.filter((w): w is string => typeof w === 'string') : []
      setText(words.join('\n'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载违禁词配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/api/admin/settings', { bannedWords: { mode, words: parsed.words } })
      toast.success(
        parsed.dropped > 0
          ? `违禁词配置已保存(超出上限的 ${parsed.dropped} 行未收录), 前台即时生效`
          : '违禁词配置已保存, 前台即时生效',
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            <ShieldAlert className="h-5 w-5 text-violet-400" />
            违禁词过滤
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">前台章节正文自动屏蔽指定词语, 可打码或直接删除</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
          onClick={load}
          disabled={loading}
          aria-label="重新加载已保存的违禁词配置"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          重置
        </Button>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="space-y-5 p-4 sm:p-5">
          {/* 处理方式 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-zinc-300">处理方式</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as BannedWordsMode)}
              className="flex flex-col gap-1 sm:flex-row sm:gap-6"
              aria-label="违禁词处理方式"
            >
              <div className="flex min-h-[44px] items-center">
                <RadioGroupItem value="mask" id="bw-mode-mask" className="border-zinc-600 text-violet-500" />
                <Label htmlFor="bw-mode-mask" className="ml-2 cursor-pointer text-sm text-zinc-200">
                  打码 <span className="text-zinc-500">(命中词替换为 * 号)</span>
                </Label>
              </div>
              <div className="flex min-h-[44px] items-center">
                <RadioGroupItem value="remove" id="bw-mode-remove" className="border-zinc-600 text-violet-500" />
                <Label htmlFor="bw-mode-remove" className="ml-2 cursor-pointer text-sm text-zinc-200">
                  删除 <span className="text-zinc-500">(命中词直接移除)</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* 词表编辑 */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="bw-words" className="text-sm font-medium text-zinc-300">
                违禁词列表
              </Label>
              <span
                className={`text-[11px] tabular-nums ${parsed.words.length >= BANNED_WORDS_MAX_COUNT ? 'text-amber-400' : 'text-zinc-500'}`}
              >
                {parsed.words.length}/{BANNED_WORDS_MAX_COUNT} 词
              </span>
            </div>
            <Textarea
              id="bw-words"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'每行一个词, 例如:\n坏词\n敏感词'}
              className="min-h-[180px] resize-y border-zinc-700 bg-zinc-950/60 font-mono text-sm placeholder:text-zinc-600 focus-visible:border-violet-500 focus-visible:ring-violet-500/30"
              aria-label="违禁词列表, 每行一个词"
              spellCheck={false}
            />
            <p className="text-xs leading-relaxed text-zinc-500">
              每行一个词; 英文不区分大小写; 最多 {BANNED_WORDS_MAX_COUNT} 条、每条 {BANNED_WORD_MAX_LEN} 字。
              打码时长词最多以 {BANNED_MASK_MAX_STARS} 个 * 代替; 仅作用于前台章节正文(不动标签与标题), 保存后立即生效。
              {parsed.dropped > 0 && (
                <span className="text-amber-400"> 超出上限的 {parsed.dropped} 行保存时将被忽略。</span>
              )}
            </p>
          </div>

          {/* 保存 */}
          <div className="flex items-center justify-end border-t border-zinc-800 pt-4">
            <Button
              size="sm"
              className="h-11 gap-1.5 bg-violet-600 px-5 hover:bg-violet-500"
              onClick={save}
              disabled={saving || loading}
              aria-label="保存违禁词配置"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存配置
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
