// ============================================================
// 首页布局 · dashboard（控制中心 mission, dark）
// 数据面板气质: KPI 指标条(tabular-nums) + 左「热门榜」右「最新入库」双面板
// 荧光网格纹理背景由全站 patternBg 层提供(PublicSite 已铺), 组件内不重铺
// [R23-II-b] 全新第 11 布局, 与 themes.ts mission preset 一一对应
// ============================================================
'use client'

import type { BookItem } from '../types'
import { usePublic } from '../ctx'
import { fmtDate, formatWords, withAlpha } from '../seo'
import { bookNavProps, Sk, StatusBadge } from '../bits'
import { Activity, Flame, LibraryBig, Megaphone, ScrollText } from 'lucide-react'

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      {/* KPI 条骨架 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Sk key={i} className="h-24 w-full" />
        ))}
      </div>
      {/* 双面板骨架 */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Sk key={i} className="h-96 w-full" />
        ))}
      </div>
    </div>
  )
}

export function HomeDashboard({ books, loading }: { books: BookItem[]; loading: boolean }) {
  const { site, theme, navigate } = usePublic()
  const v = theme.vars

  if (loading) return <DashboardSkeleton />
  // 空态由 HomeView 的 EmptyState 统一渲染(与其他 8 布局同约定)
  if (!books.length) return null

  // [R23-II-b-8] KPI 全部由当前书单真实推导(口径标注于 hint, 禁造假接口数据):
  //   藏书量=books.length / 字数体量=本页 wordCount 求和 / 今日更新=updatedAt 为今日的计数 / 公告=站点描述占位
  const todayStr = fmtDate(new Date().toISOString())
  const todayCount = books.filter((b) => !!b.updatedAt && fmtDate(b.updatedAt) === todayStr).length
  const totalWords = books.reduce((acc, b) => acc + (b.wordCount || 0), 0)
  const kpis: Array<{ label: string; value: string; hint: string; icon: typeof LibraryBig; tone: 'primary' | 'accent'; kind: 'metric' | 'note' }> = [
    { label: '藏书量', value: String(books.length), hint: '本页在架书目数', icon: LibraryBig, tone: 'primary', kind: 'metric' },
    { label: '字数体量', value: formatWords(totalWords), hint: '本页书目字数合计(wordCount 求和)', icon: ScrollText, tone: 'primary', kind: 'metric' },
    { label: '今日更新', value: String(todayCount), hint: '本页今日有更新的书目数', icon: Activity, tone: 'accent', kind: 'metric' },
    { label: '站点公告', value: site.description || '系统在线 · 欢迎畅读', hint: '站点描述占位', icon: Megaphone, tone: 'accent', kind: 'note' },
  ]

  // [R23-II-b-10] 左面板=热门榜(wordCount 降序前 8) / 右面板=最新入库(列表序前 8, 时间徽章)
  // (数据量 ≤48, 直接派生不用 useMemo —— 避免在 early-return 之后调用 hooks 违反 rules-of-hooks)
  const hotList = [...books].sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0)).slice(0, 8)
  const newList = books.slice(0, 8)

  return (
    <div className="space-y-5">
      {/* [R23-II-b-9] KPI 指标条: 等宽数字 tabular-nums, 主色/强调色高亮, 边框=主题 rgba 荧光绿 */}
      <section aria-label="数据指标" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon
          return (
            <article
              key={k.label}
              className="relative overflow-hidden p-4"
              style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius }}
              title={k.hint}
            >
              {/* 卡顶 2px 信号色条: primary/accent 交替高亮 */}
              <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: k.tone === 'primary' ? v.primary : v.accent }} aria-hidden />
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[11px] font-bold tracking-[0.25em]" style={{ color: v.textMuted }}>
                  {k.label}
                </h2>
                <Icon className="h-4 w-4 shrink-0" style={{ color: k.tone === 'primary' ? v.primary : v.accent }} aria-hidden />
              </div>
              {/* 公告卡为文案占位(截断), 其余为等宽数字 */}
              {k.kind === 'note' ? (
                <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed" style={{ color: v.text }}>
                  {k.value}
                </p>
              ) : (
                <p className="mt-2 text-2xl font-black leading-none tabular-nums" style={{ color: k.tone === 'primary' ? v.primary : v.accent }}>
                  {k.value}
                </p>
              )}
              <p className="mt-1.5 text-[10px]" style={{ color: v.textMuted }}>
                {k.hint}
              </p>
            </article>
          )
        })}
      </section>

      {/* [R23-II-b-10] 双面板: 面板头条(surfaceAlt 条) + 行列表; 行 hover 用透明度过渡(不硬编码色值) */}
      <section aria-label="数据面板" className="grid gap-4 lg:grid-cols-2">
        {/* 左: 热门榜 */}
        <div className="overflow-hidden" style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius }}>
          <header className="flex items-center justify-between gap-2 px-4 py-2.5" style={{ background: v.surfaceAlt, borderBottom: `1px solid ${v.border}` }}>
            <h2 className="flex items-center gap-2 text-sm font-bold tracking-widest" style={{ color: v.text }}>
              <Flame className="h-4 w-4" style={{ color: v.primary }} aria-hidden />
              热门榜
            </h2>
            <span className="text-[10px] tabular-nums tracking-[0.2em]" style={{ color: v.textMuted }}>
              RANK · TOP 8
            </span>
          </header>
          <ol>
            {hotList.map((b, i) => {
              const top = i < 3
              return (
                <li
                  key={b.id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-opacity hover:opacity-80"
                  style={{ borderBottom: i < hotList.length - 1 ? `1px solid ${withAlpha(v.border, 0.6)}` : undefined }}
                  {...bookNavProps(navigate, b.id)}
                  aria-label={`查看《${b.name}》详情`}
                >
                  {/* 排名徽章: 01/02/03… top3 荧光薄荷实底, 其余描边 */}
                  <span
                    className="flex h-8 w-9 shrink-0 items-center justify-center text-sm font-black tabular-nums"
                    style={
                      top
                        ? { background: v.primary, color: v.primaryText, borderRadius: v.radius, boxShadow: `0 0 10px ${withAlpha(v.primary, 0.4)}` }
                        : { border: `1px solid ${v.border}`, color: v.textMuted, borderRadius: v.radius }
                    }
                    aria-label={`第 ${i + 1} 名`}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-1 text-sm font-bold" style={{ color: v.text }}>
                      {b.name}
                    </h3>
                    <p className="mt-0.5 line-clamp-1 text-[11px]" style={{ color: v.textMuted }}>
                      {b.author} · {b.category}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: v.accent }}>
                    {formatWords(b.wordCount)}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>

        {/* 右: 最新入库 */}
        <div className="overflow-hidden" style={{ background: v.surface, border: `1px solid ${v.border}`, borderRadius: v.radius }}>
          <header className="flex items-center justify-between gap-2 px-4 py-2.5" style={{ background: v.surfaceAlt, borderBottom: `1px solid ${v.border}` }}>
            <h2 className="flex items-center gap-2 text-sm font-bold tracking-widest" style={{ color: v.text }}>
              <Activity className="h-4 w-4" style={{ color: v.accent }} aria-hidden />
              最新入库
            </h2>
            <span className="text-[10px] tabular-nums tracking-[0.2em]" style={{ color: v.textMuted }}>
              INTAKE · NEW
            </span>
          </header>
          <ol>
            {newList.map((b, i) => (
              <li
                key={b.id}
                className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-opacity hover:opacity-80"
                style={{ borderBottom: i < newList.length - 1 ? `1px solid ${withAlpha(v.border, 0.6)}` : undefined }}
                {...bookNavProps(navigate, b.id)}
                aria-label={`查看《${b.name}》详情`}
              >
                {/* 时间徽章: 入库/更新日期(缺 updatedAt 显示「最新」) */}
                <span
                  className="shrink-0 px-1.5 py-0.5 text-[10px] tabular-nums"
                  style={{ background: v.surfaceAlt, color: v.textMuted, border: `1px solid ${withAlpha(v.border, 0.8)}`, borderRadius: v.radius }}
                >
                  {fmtDate(b.updatedAt) || '最新'}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-1 text-sm font-bold" style={{ color: v.text }}>
                    {b.name}
                  </h3>
                  <p className="mt-0.5 line-clamp-1 text-[11px]" style={{ color: v.textMuted }}>
                    {b.author} · {b.latestChapter || '暂无章节'}
                  </p>
                </div>
                <span className="shrink-0">
                  <StatusBadge status={b.status} small />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  )
}
