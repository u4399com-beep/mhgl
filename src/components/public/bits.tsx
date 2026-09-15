// ============================================================
// 前台通用小组件 — 状态徽章 / 标签云 / 空态 / 错误态 / 主题化骨架
// [R23-c-1] R23-c 设计语言化: SecTitle 七种标题装饰 / 标签五形态 / 设计 token 镜像
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { AlertCircle, BookOpen, Feather, Inbox, RefreshCw } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { usePublic, usePublicOptional, type ViewParams } from './ctx'
import { statusLabel, statusStyle, withAlpha } from './seo'
import { fetchSuggestTags } from './data'
import type { ThemeDef } from '@/lib/crawl/themes'

/** [R23-a 对账] 设计 token 契约已合入 ThemeDef.vars(枚举见 themes.ts HeadingDecoKind/ButtonStyleKind/CardHoverKind),
 *  直读之 —— 并行时序期的本地镜像+断言壳已拆除; 消费点一律 ?? 本地 fallback */
export function designVars(theme: ThemeDef): ThemeDef['vars'] {
  return theme.vars
}

/** 可点击书籍卡片的键盘可达属性（Enter/Space 触发，配合 onClick 使用） */
export function bookNavProps(navigate: (p: ViewParams) => void, bookId: string) {
  const open = () => navigate({ view: 'book', bookId })
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        open()
      }
    },
  }
}

/** 完结状态徽章（连载中/已完结/未知，主题化配色） */
export function StatusBadge({ status, small }: { status?: string | null; small?: boolean }) {
  const { theme } = usePublic()
  const st = statusStyle(theme, status)
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-medium ${small ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs'}`}
      // [R23-c-2] 精致化: statusStyle 语义不变, 仅叠加顶部高光渐变 + 内描细边(1px inset 高光)
      style={{
        ...st,
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0) 70%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14)',
      }}
    >
      <Feather className={small ? 'h-2.5 w-2.5' : 'h-3 w-3'} aria-hidden />
      {statusLabel(status)}
    </span>
  )
}

// [R23-c-3] 标签芯片五形态 — buttonStyle token 驱动(TagCloud/SuggestTagCloud/换一批 共用);
// 返回完整 className+style, 调用方零样式逻辑。dark 主题对比度: primary/surface ≥4.5 由主题矩阵保证。
function chipVisual(theme: ThemeDef): { className: string; style: CSSProperties } {
  const v = theme.vars
  const d = designVars(theme)
  const bs = d.buttonStyle ?? 'solid'
  const glow = d.glowColor ?? v.primary
  const className = 'rounded-full px-3 py-1 text-xs transition-opacity hover:opacity-80'
  switch (bs) {
    case 'outline': // 透明底 + 1.5px 主色边 + 主色字
      return {
        className,
        style: { background: 'transparent', color: v.primary, border: `1.5px solid ${withAlpha(v.primary, 0.8)}`, borderRadius: v.radius },
      }
    case 'gradient': // 主→accent 渐变底 + primaryText 字
      return {
        className,
        style: { background: `linear-gradient(120deg, ${v.primary}, ${v.accent})`, color: v.primaryText, border: '1px solid transparent', borderRadius: v.radius },
      }
    case 'pill': // 全圆角胶囊 + 主色浅底
      return {
        className,
        style: { background: withAlpha(v.primary, theme.dark ? 0.2 : 0.1), color: v.primary, border: `1px solid ${withAlpha(v.primary, 0.28)}`, borderRadius: '999px' },
      }
    case 'neon': {
      // 深色底(暗主题 surfaceAlt / 亮主题深色 10%)+ glowColor 辉光边 + 轻辉光
      const bg = theme.dark ? v.surfaceAlt : withAlpha(v.text, 0.1)
      return {
        className,
        style: {
          background: bg,
          color: v.primary,
          border: `1px solid ${glow}`,
          borderRadius: v.radius,
          boxShadow: `0 0 8px ${withAlpha(glow, 0.35)}, inset 0 0 6px ${withAlpha(glow, 0.12)}`,
        },
      }
    }
    default: // solid(默认): 现状药丸
      return {
        className,
        style: { background: withAlpha(v.primary, theme.dark ? 0.16 : 0.08), color: v.primary, border: `1px solid ${withAlpha(v.primary, 0.35)}`, borderRadius: v.radius },
      }
  }
}

/** 标签云（点击跳关键词落地页） */
export function TagCloud({ tags, align }: { tags: string[]; align?: 'center' | 'left' }) {
  const { theme, navigate } = usePublic()
  if (!tags.length) return null
  // [R23-c-3] 芯片形态由 buttonStyle token 驱动(默认 solid = 原药丸)
  const chip = chipVisual(theme)
  return (
    <div className={`flex flex-wrap gap-2 ${align === 'center' ? 'justify-center' : ''}`}>
      {tags.map((t, i) => (
        <button
          key={`${t}-${i}`}
          type="button"
          onClick={() => navigate({ view: 'keyword', tag: t })}
          className={chip.className}
          style={chip.style}
          aria-label={`关键词 ${t}`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

/** Fisher-Yates 洗牌(返回新数组, 不修改入参) */
function shufflePick(pool: readonly string[], n: number): string[] {
  const a = [...pool]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a.slice(0, Math.max(0, n))
}

/**
 * 随机下拉词云(全站搜索热词) — 词池由 fetchSuggestTags 缓存, 客户端洗牌抽 count 个;
 * 「换一批」仅 setRound 重洗不重新请求; 加载中骨架 8 个; 词池为空/拉取失败静默 null。
 * 点击跳搜索页(区别于 TagCloud 的关键词落地页)。
 */
export function SuggestTagCloud({ count, refresh }: { count: number; refresh?: boolean }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  // [R23-c-4] 芯片与「换一批」按钮同步 buttonStyle 形态
  const chip = chipVisual(theme)
  const [pool, setPool] = useState<string[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [round, setRound] = useState(0)

  useEffect(() => {
    let alive = true
    fetchSuggestTags().then((d) => {
      if (!alive) return
      if (d && d.tags.length) {
        setPool(d.tags)
        setFailed(false)
      } else {
        setFailed(true) // 词池空/拉取失败 → 整块静默不渲染
      }
    })
    return () => {
      alive = false
    }
  }, [])

  // round 变化 → 重洗一批; pool 就绪前返回空数组走骨架分支
  // eslint-disable-next-line react-hooks/exhaustive-deps -- round 仅作触发器, 不在 callback 内消费
  const picks = useMemo(() => shufflePick(pool || [], count), [pool, count, round])

  if (failed) return null
  if (!pool) {
    return (
      <div className="flex flex-wrap items-center gap-2" aria-hidden>
        {Array.from({ length: 8 }).map((_, i) => (
          <Sk key={i} className="h-7 w-16" style={{ borderRadius: v.radius }} />
        ))}
      </div>
    )
  }
  if (!picks.length) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {picks.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => navigate({ view: 'search', q: t })}
          className={chip.className}
          style={chip.style}
          aria-label={`搜索 ${t}`}
        >
          {t}
        </button>
      ))}
      {refresh && (
        <button
          type="button"
          onClick={() => setRound((r) => r + 1)}
          className={`${chip.className} inline-flex shrink-0 items-center gap-1`}
          style={chip.style}
          aria-label="换一批搜索推荐词"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          换一批
        </button>
      )}
    </div>
  )
}

/**
 * 区块标题（主题化）
 * [R23-c-5] headingDeco 七形态装饰(纯 CSS/字符, 零图片零依赖):
 *   bar(默认)=渐变竖条 / swash=主→accent 楔形渐变下划线 / ribbon=skew 实底色块+accent 补边 /
 *   bracket=『』括角(衬线) / badge=实底圆角块+accent 方点 / ornament=✦ 花饰+点线 / dual=渐变文字+辉光线。
 * props 签名 {icon?, children, right?} 与外层 mb-4/justify-between 布局行为完全不变。
 */
export function SecTitle({ icon, children, right }: { icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
  const { theme } = usePublic()
  const v = theme.vars
  const d = designVars(theme)
  const deco = d.headingDeco ?? 'bar'
  const glow = d.glowColor ?? v.primary

  // 图标色: 实底块形态(ribbon/badge)内用 primaryText 保证可读, 其余用 primary
  const iconOnBlock = deco === 'ribbon' || deco === 'badge'
  const iconNode = icon ? <span style={{ color: iconOnBlock ? v.primaryText : v.primary }}>{icon}</span> : null

  const title = (() => {
    switch (deco) {
      case 'swash':
        // 文字下方 3px 主→accent 渐变下划线, clipPath 楔形模拟"左端粗右端细"; 文字保持 v.text
        return (
          <>
            {iconNode}
            <span className="relative inline-block pb-1">
              {children}
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-[3px]"
                style={{ background: `linear-gradient(90deg, ${v.primary}, ${v.accent})`, clipPath: 'polygon(0 0, 100% 0, 100% 30%, 0 100%)', borderRadius: 2 }}
              />
            </span>
          </>
        )
      case 'ribbon':
        // 左侧 skew(-8deg) 实底色块(v.primary)内嵌白字, 块外右下补 accent 细边(offset 阴影)
        return (
          <span
            className="inline-flex items-center"
            style={{ transform: 'skewX(-8deg)', background: v.primary, color: v.primaryText, borderRadius: 2, padding: '3px 12px', boxShadow: `3px 3px 0 0 ${withAlpha(v.accent, 0.9)}` }}
          >
            <span className="inline-flex items-center gap-1.5" style={{ transform: 'skewX(8deg)' }}>
              {iconNode}
              {children}
            </span>
          </span>
        )
      case 'bracket':
        // 文字两侧『』括角装饰(accent + 主题衬线 titleFont)
        return (
          <>
            {iconNode}
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="text-base leading-none" style={{ color: v.accent, fontFamily: v.titleFont }}>『</span>
              {children}
              <span aria-hidden className="text-base leading-none" style={{ color: v.accent, fontFamily: v.titleFont }}>』</span>
            </span>
          </>
        )
      case 'badge':
        // 整块标题装进实底 v.primary 圆角小块, 左上角叠一枚小 accent 方点
        return (
          <span className="relative inline-flex items-center">
            <span aria-hidden className="absolute -left-1 -top-1 h-2 w-2" style={{ background: v.accent, borderRadius: 2 }} />
            <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1" style={{ background: v.primary, color: v.primaryText }}>
              {iconNode}
              {children}
            </span>
          </span>
        )
      case 'ornament':
        // 文字两侧 ✦ 菱形花饰(accent) + 下方细点线
        return (
          <>
            {iconNode}
            <span className="relative inline-block pb-1.5">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden style={{ color: v.accent }}>✦</span>
                {children}
                <span aria-hidden style={{ color: v.accent }}>✦</span>
              </span>
              <span aria-hidden className="absolute inset-x-0 bottom-0" style={{ borderBottom: `1px dotted ${withAlpha(v.accent, 0.55)}` }} />
            </span>
          </>
        )
      case 'dual':
        // 主→accent 渐变文字(background-clip:text) + 底部辉光细线(glowColor, blur 感 box-shadow)
        return (
          <>
            {iconNode}
            <span className="relative inline-block pb-1.5">
              <span
                style={{
                  background: `linear-gradient(90deg, ${v.primary} 15%, ${v.accent} 100%)`,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                }}
              >
                {children}
              </span>
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] rounded-full" style={{ background: glow, boxShadow: `0 0 8px ${withAlpha(glow, 0.65)}` }} />
            </span>
          </>
        )
      default:
        // bar(默认): 现状竖条微调为主→accent 纵向渐变
        return (
          <>
            {iconNode || (
              <span aria-hidden className="inline-block h-4 w-1 rounded-full" style={{ background: `linear-gradient(180deg, ${v.primary}, ${withAlpha(v.accent, 0.85)})` }} />
            )}
            {children}
          </>
        )
    }
  })()

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-wide" style={{ color: v.text }}>
        {title}
      </h2>
      {right}
    </div>
  )
}

/** 空状态 */
export function EmptyState({ text = '暂无内容', hint }: { text?: string; hint?: string }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  const d = designVars(theme)
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      {/* [R23-c-6] 圆形底改 surfaceGradient(?? surface) + 淡 pattern 感虚线环 */}
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full" style={{ background: d.surfaceGradient ?? v.surface, color: v.textMuted }}>
        <span aria-hidden className="absolute -inset-1.5 rounded-full" style={{ border: `1.5px dashed ${withAlpha(v.primary, 0.35)}` }} />
        <Inbox className="relative h-6 w-6" aria-hidden />
      </span>
      <p className="text-sm font-medium" style={{ color: v.text }}>{text}</p>
      {hint && <p className="text-xs" style={{ color: v.textMuted }}>{hint}</p>}
      <button
        type="button"
        onClick={() => navigate({ view: 'home' })}
        className="mt-1 rounded-full px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-85"
        style={{ background: v.primary, color: v.primaryText, borderRadius: v.radius }}
      >
        返回首页
      </button>
    </div>
  )
}

/** 错误态（如"书籍不存在"） */
export function ErrorState({ message = '内容加载失败', detail }: { message?: string; detail?: string }) {
  const { theme, navigate } = usePublic()
  const v = theme.vars
  const d = designVars(theme)
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      {/* [R23-c-7] 圆形底改 surfaceGradient(?? surface) + 淡 pattern 感虚线环(与 EmptyState 同语言) */}
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full" style={{ background: d.surfaceGradient ?? v.surface, color: v.primary }}>
        <span aria-hidden className="absolute -inset-1.5 rounded-full" style={{ border: `1.5px dashed ${withAlpha(v.primary, 0.35)}` }} />
        <AlertCircle className="relative h-6 w-6" aria-hidden />
      </span>
      <p className="text-base font-semibold" style={{ color: v.text }}>{message}</p>
      {detail && <p className="max-w-md text-xs leading-relaxed" style={{ color: v.textMuted }}>{detail}</p>}
      <button
        type="button"
        onClick={() => navigate({ view: 'home' })}
        className="mt-1 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-85"
        style={{ background: v.primary, color: v.primaryText, borderRadius: v.radius }}
      >
        <BookOpen className="h-3.5 w-3.5" aria-hidden />
        返回首页
      </button>
    </div>
  )
}

/** 主题化骨架块（未挂载 Provider 时使用中性色兜底） */
export function Sk({ className, style }: { className?: string; style?: CSSProperties }) {
  const ctx = usePublicOptional()
  return <Skeleton className={className} style={{ backgroundColor: ctx?.theme.vars.surfaceAlt || 'rgba(255,255,255,0.12)', ...style }} />
}

/**
 * feat-round-7 B3: 通用加载骨架
 * BookGridSkeleton — N 个书籍卡骨架 (封面 + 标题/作者两行文字)
 * ChapterListSkeleton — N 个章节行骨架
 * 均使用主题化 Sk (未挂载 Provider 时退化为中性灰)
 */

export function BookGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 py-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" role="status" aria-live="polite" aria-label="书籍列表加载中">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Sk className="aspect-[3/4] w-full" />
          <Sk className="h-4 w-4/5" />
          <Sk className="h-3 w-1/2" />
        </div>
      ))}
      <span className="sr-only">加载中…</span>
    </div>
  )
}

export function ChapterListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite" aria-label="章节列表加载中">
      {Array.from({ length: count }).map((_, i) => (
        <Sk key={i} className="h-9 w-full" />
      ))}
      <span className="sr-only">加载中…</span>
    </div>
  )
}
