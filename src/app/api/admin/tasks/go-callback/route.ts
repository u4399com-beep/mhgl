// ============================================================
// [R50-1] Go 采集引擎回调持久化路由 — POST /api/admin/tasks/go-callback
// 契约: agent-ctx/go-engine/CONTRACT.md §2(唯一事实源, 8 种 kind 分发)
// 鉴权: 本路由在 /api/admin/* 之下, proxy.ts 对该确切路径豁免会话鉴权与 admin 限流
//       (回调来自本机 Go 服务 127.0.0.1:3032, 无管理会话; progress 类回调 ≥1 次/秒会烧穿
//       admin 令牌桶) —— 真实防线在本路由: x-go-callback-secret 共享密钥强校验, 不匹配 403。
// 职责: DB 唯一写者 —— 书/章/正文/封面持久化(Prisma+sharp)与增量决策(needUrls/skipContent),
//       建书/建章语义对齐 src/lib/crawl/runner.ts(只读参照, 引擎本体零改动)。
// 响应: 契约 §1 统一 {ok:false, error} / §2 各 kind 决策字段(扁平 JSON, 非站内 {ok,data} 信封,
//       Go 侧按契约直接消费顶层字段)。
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readBody } from '@/lib/api'
import { withGuard } from '../../../_lib/http'
import { logger } from '@/lib/logger'
import { parseRuleConfig, type CleanConfig, type TocItem } from '@/lib/crawl/types'
import { cleanContentHtml, cleanIntro, cleanChapterTitle, cleanTextField } from '@/lib/crawl/cleaner'
import { reorderToc } from '@/lib/crawl/sorter'
import { saveCoverWebp, deleteBookTxt } from '@/lib/crawl/storage'
import { smartCategory, smartCompleteDetect } from '@/lib/crawl/smart'
import { nextBookNum, withBookNumRetry } from '@/lib/pseudostatic-server'
import { sliceCodePoints } from '@/lib/utils'
import { verifyGoCallbackSecret } from '@/lib/crawl/go-engine'
// [R51-4] TaskLog 三写者收敛: 本路由 taskLog 与 runner.log/_go-control 共用单实现(cap 2000+修剪)
import { appendTaskLog as taskLog, type TaskLogLevel } from '@/lib/crawl/task-log'
// [R51-4] 章节重排规划/挪尾计划/阶段E 保守闸统一下沉(与 runner 单一实现, 语义权威=runner 口径)
import { planChapterSync, chapterTempBase, chapterTailMoves, staleTailGuardDecision } from '@/lib/crawl/chapter-reorder'
// [R51-3-b] autoRefresh 遗留①闭环: status done + autoRefresh 时经 TaskRunner 排定下一轮采集
import { TaskRunner } from '@/lib/crawl/runner'

// 回调体上限 64MB: 契约 cover b64 解码后 ≤10MB(b64 膨胀 ~1.37x)+ contents 批 ≤20 章 HTML,
// 留足余量; 超限 413 由 readBody/withGuard 契约承担
const CALLBACK_MAX_BODY_BYTES = 64 * 1024 * 1024

/** Task.progress 可合并键白名单(契约 §2 progress 行; 与 runner TaskProgress 字段对齐) */
const PROGRESS_KEYS = ['phase', 'phaseNote', 'discovered', 'booksDone', 'booksTotal', 'tocTotal', 'contentDone', 'contentTotal', 'currentBook', 'engineRssMB'] as const
const PROGRESS_PHASES = ['idle', 'discovery', 'book', 'toc', 'content', 'done']
/** Task.stats 可合并键白名单(契约 §2 stats 行; 与 runner TaskStats 字段对齐) */
const STATS_KEYS = ['booksCreated', 'booksUpdated', 'chaptersCreated', 'chaptersUpdated', 'coversSaved', 'errors', 'suggestWords'] as const
/** status kind 白名单(契约 §2 status 行; 与 runner 状态机终态集对齐, 不含 interrupted/pending) */
const GO_STATUSES = ['running', 'paused', 'done', 'error', 'stopped']
const LOG_LEVELS = ['info', 'success', 'warn', 'error']

// ---------------- 防御式取值 ----------------
function asStr(v: unknown, max: number): string {
  if (v === null || v === undefined) return ''
  return String(v).slice(0, max)
}
function asInt(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}
function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** 契约响应(扁平 JSON) */
function reply(body: Record<string, unknown>, status = 200): Response {
  return NextResponse.json(body, { status })
}

// ---------------- Task/规则装载(每回调一次, 全 kind 共用) ----------------
interface CallbackCtx {
  task: { id: string; name: string; ruleId: string; recrawlMode: string; storageMode: string; smartCategory: boolean; smartComplete: boolean; autoSuggest: boolean; autoRefresh: boolean; refreshIntervalMin: number }
  clean: CleanConfig
}

async function loadCallbackCtx(taskId: string): Promise<{ ctx?: CallbackCtx; error?: string }> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true, name: true, ruleId: true, recrawlMode: true, storageMode: true,
      smartCategory: true, smartComplete: true, autoSuggest: true, autoRefresh: true,
      // [R51-3-b] 补 refreshIntervalMin: status done + autoRefresh 分支排定自动刷新需要
      refreshIntervalMin: true,
    },
  })
  if (!task) return { error: '任务不存在' }
  const rule = await db.rule.findUnique({ where: { id: task.ruleId }, select: { config: true } })
  // 规则缺失不致命: 仅 contents 的 clean 配置退默认清洗, 其余 kind 无依赖
  const clean = parseRuleConfig(rule?.config || '{}').clean
  return { ctx: { task, clean } }
}

// ---------------- kind: progress / stats 合并辅助 ----------------
// [R50-1 联调修复·二轮] 计数语义拆分(单一写者每键, 杜绝混写):
//   ① progress 合并与 Go stats kind(errors/coversSaved 累计值)→【绝对值覆盖】,
//      原子 json_patch(COALESCE(col,'{}'), ?) 单语句, 无读旧值窗口;
//   ② Next.js 内部 book/chapters/contents 回调传的是【增量】(+N) → 原子累加:
//      UPDATE Task SET stats = json_set(stats, '$.k',
//        COALESCE(json_extract(stats,'$.k'),0) + ?) —— 首版两处实现的共同缺陷是
//      把增量当绝对值写(obj[k]=delta/json_patch 覆盖), 6 章建行只记 1 即此根因,
//      与并发无关(RMW 竞态只是次要风险)。json_set 嵌套表达式每层均基于原始列值取
//      旧数, 每键恰好出现一次, 单条 UPDATE 在 SQLite 写锁下天然串行。
//   ③ 键名一律来自 STATS_KEYS/PROGRESS_KEYS 白名单(无引号/反斜杠)才可拼接进 '$.k',
//      数值经绑定参数传递, 无注入面。
async function mergeTaskJsonAtomically(
  taskId: string,
  column: 'stats' | 'progress',
  patch: Record<string, unknown>,
): Promise<void> {
  const patchJson = JSON.stringify(patch)
  try {
    await db.$executeRawUnsafe(
      `UPDATE Task SET ${column} = json_patch(COALESCE(${column}, '{}'), ?) WHERE id = ?`,
      patchJson,
      taskId,
    )
    return
  } catch {
    // json_patch 不可用(老 SQLite)/行不存在等 → 降级 RMW 一次(含脏 JSON 重建)
  }
  const t = await db.task.findUnique({ where: { id: taskId }, select: { [column]: true } })
  const raw = (t as Record<string, string | undefined> | null)?.[column]
  let obj: Record<string, unknown> = {}
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed
    } catch {
      /* 脏 JSON: 重建 */
    }
  }
  Object.assign(obj, patch)
  await db.task
    .update({ where: { id: taskId }, data: { [column]: JSON.stringify(obj) } })
    .catch(() => {})
}

/** 内部增量累加(stats 专用, Next-owned 计数: booksCreated/booksUpdated/chaptersCreated/chaptersUpdated)。
 *  单语句原子累加, 每键基于原始列值取旧数(每键恰好出现一次, 见头部注记②); 失败降级 RMW 一次 */
async function mergeStatsDelta(taskId: string, patch: Record<string, number>): Promise<void> {
  const keys = Object.keys(patch).filter((k) => (STATS_KEYS as readonly string[]).includes(k) && patch[k] !== 0)
  if (keys.length === 0) return
  let expr = `COALESCE(stats, '{}')`
  const params: number[] = []
  for (const k of keys) {
    expr = `json_set(${expr}, '$.${k}', COALESCE(json_extract(COALESCE(stats, '{}'), '$.${k}'), 0) + ?)`
    params.push(patch[k])
  }
  try {
    await db.$executeRawUnsafe(`UPDATE Task SET stats = ${expr} WHERE id = ?`, ...params, taskId)
    return
  } catch {
    /* 降级 RMW */
  }
  const t = await db.task.findUnique({ where: { id: taskId }, select: { stats: true } })
  let obj: Record<string, number> = {}
  try {
    const parsed = JSON.parse(t?.stats || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed
  } catch {
    /* 脏 JSON: 重建 */
  }
  for (const k of keys) obj[k] = (obj[k] || 0) + patch[k]
  await db.task.update({ where: { id: taskId }, data: { stats: JSON.stringify(obj) } }).catch(() => {})
}

// ---------------- kind: book (建书/更新书, 对齐 runner crawlOneBookMeta 建书段) ----------------
async function handleBook(ctx: CallbackCtx, taskId: string, p: Record<string, unknown>): Promise<Response> {
  const bookUrl = asStr(p.bookUrl, 2000)
  if (!bookUrl) return reply({ ok: false, error: 'bookUrl 必填' })
  const { task } = ctx

  // 字段兜底链对齐 runner ll-c2: detail 解析 → (列表字段, Go 流程无) → URL 片段 → 未知书名
  let urlFragmentName = ''
  try {
    urlFragmentName = new URL(bookUrl).pathname.slice(1, 30)
  } catch { /* 非法 URL: 留空走下一级兜底(与 runner R9-d-4 同容错) */ }
  const bookName = cleanTextField(asStr(p.name, 300), 120) || urlFragmentName || '未知书名'
  const author = cleanTextField(asStr(p.author, 200), 60) || '佚名'
  const intro = cleanIntro(asStr(p.intro, 8000))
  const coverUrl = asStr(p.coverUrl, 2000)

  // 智能分类(runner 同款: task.smartCategory 开启时 LLM 归一, 失败保留源站分类)
  let categoryName: string | null = cleanTextField(asStr(p.category, 100), 30) || null
  if (task.smartCategory) {
    try {
      const sm = await smartCategory(bookName, intro, categoryName || undefined)
      if (sm.category) {
        categoryName = sm.category
        await taskLog(taskId, 'info', `智能分类[${sm.method}]: ${bookName} → ${sm.category}`)
      }
    } catch { /* 分类失败不阻断建书(与 runner 同容错) */ }
  }
  let categoryId: string | null = null
  if (categoryName) {
    // R4-9/R5-20 同款: 同名分类并发 upsert P2002 → 3 次退避重查(50/100/200ms)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const cat = await db.category.upsert({ where: { name: categoryName }, create: { name: categoryName }, update: {} })
        categoryId = cat.id
        break
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e
        const existingCat = await db.category.findUnique({ where: { name: categoryName }, select: { id: true } })
        if (existingCat) { categoryId = existingCat.id; break }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 50 * Math.pow(2, attempt)))
        else await taskLog(taskId, 'warn', `分类「${categoryName}」3 次重试后仍未就绪, 本书暂不关联分类`)
      }
    }
  }

  // 智能完结初判(runner: 先存 unknown, 目录采完后在 chapters 回调侧终判)
  let detectedStatus: 'completed' | 'ongoing' | 'unknown' = 'unknown'
  if (task.smartComplete) {
    const det = smartCompleteDetect({
      statusField: asStr(p.status, 100) || undefined,
      intro,
      bookName,
      latestChapterTitle: asStr(p.latestChapter, 300) || undefined,
    })
    detectedStatus = det.status
    await taskLog(taskId, 'info', `智能完结初判: ${det.status}(${det.reason})`)
  }

  // 幂等定位对齐 runner [R28-4-L9]: sourceUrl 或 同名同作者 跨源合并(存量设计, 语义保留)
  const existing = await db.book.findFirst({ where: { OR: [{ sourceUrl: bookUrl }, { name: bookName, author }] } })
  const bookData = {
    name: bookName,
    author,
    categoryId,
    intro,
    status: detectedStatus,
    sourceUrl: bookUrl,
    sourceRuleId: task.ruleId,
    storageMode: task.storageMode,
    collectedAt: new Date(),
  }
  let bookId: string
  if (existing) {
    if (task.recrawlMode === 'full') {
      // 完全覆盖对齐 runner: 删旧章节(及 txt 文件), 重置封面/字数/末章
      await db.chapter.deleteMany({ where: { bookId: existing.id } })
      if (existing.storageMode === 'txt') await deleteBookTxt(existing.id)
      await db.book.update({
        where: { id: existing.id },
        data: { ...bookData, cover: coverUrl, wordCount: 0, latestChapter: '' },
      })
      await taskLog(taskId, 'warn', `完全覆盖重采集: 清除《${existing.name}》旧数据`)
    } else {
      // 增量更新对齐 runner [R22-c-1]/zz-d: 分类不回写(既有分类保留), 检测无结论不覆写 status;
      // [R50-1] coverUrl 暂存: Go 封面回调(cover kind)落地本地 webp 前先以外链占位(缺失不覆盖)
      const upd: Record<string, unknown> = { ...bookData }
      if (coverUrl) upd.cover = coverUrl
      if (existing.categoryId || !categoryId) delete upd.categoryId
      if (detectedStatus === 'unknown') delete upd.status
      await db.book.update({ where: { id: existing.id }, data: upd })
    }
    await mergeStatsDelta(taskId, { booksUpdated: 1 })
    bookId = existing.id
    await taskLog(taskId, 'info', `更新书籍: 《${bookName}》(${bookUrl})`)
  } else {
    // 伪静态书号分配(与 runner 同源 nextBookNum + withBookNumRetry P2002 重试)
    const nb = await withBookNumRetry(() =>
      nextBookNum(db).then((num) => db.book.create({ data: { ...bookData, cover: coverUrl, num } })),
    )
    await mergeStatsDelta(taskId, { booksCreated: 1 })
    bookId = nb.id
    await taskLog(taskId, 'success', `新建书籍: 《${bookName}》`)
  }

  // 增量决策(契约 §2 book 行): skipContent = 增量模式 && 完结(smartCompleteDetect/status 判定) && 已有章节
  let skipContent = false
  let lastChapterUrl: string | undefined
  if (task.recrawlMode !== 'full') {
    const chapterCount = await db.chapter.count({ where: { bookId } })
    if (chapterCount > 0 && (detectedStatus === 'completed' || existing?.status === 'completed')) {
      skipContent = true
      const last = await db.chapter.findFirst({ where: { bookId }, orderBy: { idx: 'desc' }, select: { url: true } })
      lastChapterUrl = last?.url || undefined
      await taskLog(taskId, 'info', `完结书增量跳过: 《${bookName}》已有 ${chapterCount} 章, 通知 Go 引擎跳过正文阶段`)
    }
  }
  return reply({ ok: true, bookId, skipContent, ...(lastChapterUrl ? { lastChapterUrl } : {}) })
}

// ---------------- kind: chapters (目录重排 + 建缺章记录, 对齐 runner existUrlMap/阶段A~E) ----------------
interface ExistChapter { id: string; url: string; title: string; idx: number; volume: string; fetched: boolean }

/** 既有章节装载(runner R4-11/R5-1 同款: 10k 上限 + ≤50k 全量回退, 防 OOM 与 P2002 风暴) */
async function loadExistChapters(bookId: string): Promise<ExistChapter[]> {
  let rows = await db.chapter.findMany({
    where: { bookId },
    select: { id: true, url: true, title: true, idx: true, volume: true, fetched: true },
    take: 10_000,
    orderBy: { idx: 'asc' },
  })
  if (rows.length === 10_000) {
    const total = await db.chapter.count({ where: { bookId } })
    if (total <= 50_000) {
      rows = await db.chapter.findMany({
        where: { bookId },
        select: { id: true, url: true, title: true, idx: true, volume: true, fetched: true },
        orderBy: { idx: 'asc' },
      })
    }
  }
  return rows
}

async function handleChapters(ctx: CallbackCtx, taskId: string, p: Record<string, unknown>): Promise<Response> {
  const bookUrl = asStr(p.bookUrl, 2000)
  if (!bookUrl) return reply({ ok: false, error: 'bookUrl 必填' })
  const rawItems = Array.isArray(p.items) ? p.items : []
  if (rawItems.length === 0) return reply({ ok: true, needUrls: [] })
  const { task } = ctx

  const book = await db.book.findFirst({ where: { sourceUrl: bookUrl }, select: { id: true, name: true } })
  if (!book) {
    await taskLog(taskId, 'error', `chapters 回调: 书籍不存在(sourceUrl=${bookUrl.slice(0, 120)}), 忽略本批目录`)
    return reply({ ok: false, error: '书籍不存在(先发 book 回调建书)' })
  }
  const bookId = book.id
  const isFull = task.recrawlMode === 'full'
  const existChapters = await loadExistChapters(bookId)

  // [R50-1] 多段目录(契约 §2 >5000 章分多次带 seq/final): seq>1 视为顺序增量追加
  //  (Go 按序切片, 不重排/不重编号; 仅首个/单次回调做全书 reorderToc + 重编号)
  // [R52-5][P1 修复 seq off-by-one] 判定从 seq>0 改为 seq>1: Go 侧 sendChapters 固定从
  //  seq=1 起发(pipeline.go `for start, seq := 0, 1; ...`), 修前首批(seq=1)即命中增量臂,
  //  全书重排/阶段A~E/保守闸/智能完结终判/末章回写整条路径对 Go 流量不可达(R51-4 接线
  //  对 Go 实为 no-op)。修后首批(seq=1)走下方全书重排路径, seq≥2 后续片走增量追加 ——
  //  Go 已上线语义(首片=1)不动, 语义对齐改 Next 侧。
  //  注: seq 仅由 Go 引擎携带(pipeline.go sendChapters 分片循环); TS 引擎(runner.ts)的目录
  //  同步在进程内直连 chapter-reorder 完成, 不经本路由, 无 seq 概念, 本判定对 TS 流量零影响。
  const seq = asInt(p.seq) ?? 0
  if (seq > 1) {
    const res = await appendChapterSlice(taskId, bookId, rawItems, existChapters, isFull)
    return reply({ ok: true, needUrls: res.needUrls })
  }

  // ---------- 全量形态: reorderToc + 匹配/建缺 + 阶段A~E 重编号(runner 语义对齐) ----------
  const tocItems: TocItem[] = reorderToc(
    rawItems
      .map((it) => {
        const o = asObj(it)
        return { title: asStr(o.title, 300), url: asStr(o.url, 2000), volume: asStr(o.volume, 150) }
      })
      .filter((it) => it.title || it.url),
  )
  if (tocItems.length === 0) return reply({ ok: true, needUrls: [] })

  // [R51-4] 匹配/建行/挪动/分卷回填计划统一下沉 @/lib/crawl/chapter-reorder(与 runner 单一实现;
  //  URL 精确命中优先, 无 URL 章节按 volume+'\u0000'+title 分卷内匹配, 同 runner 构建口径)
  const plan = planChapterSync(tocItems, existChapters, { isFull, bookName: book.name })

  // 阶段A: 冲突旧章 → 负数临时位(tt-c 动态基线同款: 压到全书最小 idx 之下, 与存量行严格无交)
  const tempBase = chapterTempBase(existChapters, plan.moves.length)
  for (let mi = 0; mi < plan.moves.length; mi++) {
    await db.chapter.update({ where: { id: plan.moves[mi].id }, data: { idx: tempBase + mi } }).catch(() => {})
  }
  // 阶段B: 占住新目标位的陈旧章(目录已消失)→ 挪尾(x-a 同款: 目标位保留集含 moves)
  const tailMoves = chapterTailMoves(existChapters, plan)
  for (const [tailId, tailIdx] of tailMoves) {
    await db.chapter.update({ where: { id: tailId }, data: { idx: tailIdx } }).catch(() => {})
  }
  // 阶段C: 新章按最终 idx 建行(单行失败计错误不拖垮整本, runner Bug 5 同口径)
  // [R50-1 联调修复] 批内聚合: 章级 mergeStats 每行一次 → 循环完一次合并(降写量+免竞态叠加)
  let createdCount = 0
  let createErrCount = 0
  for (const q of plan.creates) {
    try {
      await db.chapter.create({
        data: { bookId, idx: q.idx, title: q.title, url: q.url, volume: q.volume, storage: task.storageMode, fetched: false },
      })
      createdCount += 1
    } catch (e: any) {
      createErrCount += 1
      await taskLog(taskId, 'error', `章节记录创建失败 ${q.title.slice(0, 60)}: ${String(e?.message || e).slice(0, 120)}`)
      if (e?.code !== 'P2025' && e?.code !== 'P2002') throw e
    }
  }
  if (createdCount > 0 || createErrCount > 0) {
    // [R50-1 联调修复·二轮] 仅累加 chaptersCreated(Next-owned); errors 归 Go 累计计数(单一写者每键)
    if (createdCount > 0) await mergeStatsDelta(taskId, { chaptersCreated: createdCount })
  }
  // 阶段D: 旧章回填最终 idx + 分卷名回填(kk-a)
  for (const mv of plan.moves) {
    await db.chapter.update({ where: { id: mv.id }, data: { idx: mv.to } }).catch(() => {})
  }
  for (const vb of plan.volumeBackfill) {
    await db.chapter.update({ where: { id: vb.id }, data: { volume: vb.volume } }).catch(() => {})
  }
  // 阶段E: 目录外陈旧章清理([R51-4] 统一保守闸收紧到 runner 口径: 量闸 stale>max(50, 30%×
  //  既有章数) + creates≤10%×tocLen 截断签名闸, 双命中才跳过删除保留数据 —— 修前本侧为
  //  max(10,20%) 无签名闸(阈值漂移), 收紧即审计认定的正确方向; 回调侧无规则复验面, 宁可残留不可误删)
  const currentUrls = tocItems.map((it) => it.url).filter(Boolean)
  if (currentUrls.length > 0) {
    const staleWhere = { bookId, idx: { gt: tocItems.length }, url: { notIn: currentUrls } }
    const staleCount = await db.chapter.count({ where: staleWhere })
    const guard = staleTailGuardDecision(staleCount, existChapters.length, plan.creates.length, tocItems.length)
    if (guard.skip) {
      await taskLog(taskId, 'warn', `阶段E 已拦截: 待删目录外章节 ${staleCount} 条超过保守阈值 ${guard.threshold}, 疑似目录截断, 已保留全部数据`)
    } else if (staleCount > 0) {
      const staleTail = await db.chapter.deleteMany({ where: staleWhere })
      if (staleTail.count > 0) await taskLog(taskId, 'info', `阶段E: 清理 ${staleTail.count} 条目录外陈旧章(idx>${tocItems.length})`)
    }
  }

  await taskLog(taskId, 'success', `目录解析完成: 《${book.name}》${tocItems.length} 章(乱序重排+去重后)`)

  // 智能完结终判(runner 同款: 目录末章标题, 仅初判无结论/库里 unknown 时回填)
  if (task.smartComplete) {
    const cur = await db.book.findUnique({ where: { id: bookId }, select: { status: true } })
    if (cur && cur.status === 'unknown') {
      const det = smartCompleteDetect({
        lastChapterTitle: tocItems[tocItems.length - 1]?.title,
        bookName: book.name,
      })
      if (det.status !== 'unknown') {
        await db.book.update({ where: { id: bookId }, data: { status: det.status } }).catch(() => {})
        await taskLog(taskId, 'info', `智能完结终判: ${det.status}(${det.reason})`)
      }
    }
  }

  // 末章回写(finishBookOk 同款: latestChapter=目录末章标题, 码点截断 100)
  await db.book
    .update({ where: { id: bookId }, data: { latestChapter: sliceCodePoints(tocItems[tocItems.length - 1]?.title || '', 100) } })
    .catch(() => {})

  // 增量决策(契约 §2 chapters 行): full=全部 url; incremental=新章 url + 未采旧章 url(runner
  //  「已存在但未 fetched 的旧章节也进正文队列」语义对齐); 空 → Go 跳过该书正文阶段
  const needSet = new Set<string>()
  const needUrls: string[] = []
  const pushNeed = (u: string) => {
    if (u && !needSet.has(u)) {
      needSet.add(u)
      needUrls.push(u)
    }
  }
  if (isFull) {
    for (const it of tocItems) pushNeed(it.url)
  } else {
    for (const c of plan.creates) pushNeed(c.url)
    for (const c of existChapters) {
      if (!c.fetched) pushNeed(c.url)
    }
  }
  await taskLog(taskId, 'info', `正文队列: 《${book.name}》 ${needUrls.length}/${tocItems.length} 章需要采集 (${isFull ? '完全覆盖' : '增量更新'})`)
  return reply({ ok: true, needUrls })
}

/** 多段目录追加(seq>0): 按 Go 给定顺序尾插建缺章, 不重排既有章(顺序切片的前提是 Go 已按序切分) */
async function appendChapterSlice(
  taskId: string,
  bookId: string,
  rawItems: unknown[],
  existChapters: ExistChapter[],
  isFull: boolean,
): Promise<{ needUrls: string[] }> {
  const existUrlMap = new Map(existChapters.filter((c) => c.url).map((c) => [c.url, c]))
  // [R52-5 P3] 同片去重: 修前仅按 existUrlMap(本回调请求起点快照)判重 —— 同一片内重复
  //  URL(源站目录重复项/分片边界重叠)会重复尾插建行; 跨片重复由每片重读 existChapters
  //  天然覆盖, 此处只补片内窗口
  const sliceSeen = new Set<string>()
  let tailIdx = existChapters.reduce((mx, c) => Math.max(mx, c.idx), 0)
  const needUrls: string[] = []
  let createdCount2 = 0
  let errCount2 = 0
  for (const it of rawItems) {
    const o = asObj(it)
    const title = cleanChapterTitle(asStr(o.title, 300))
    const url = asStr(o.url, 2000)
    const volume = sliceCodePoints(asStr(o.volume, 150).trim(), 120)
    if (!title && !url) continue
    if (url && sliceSeen.has(url)) continue // [R52-5 P3] 片内重复 URL 只建/决策一次
    if (url) sliceSeen.add(url)
    const old = url ? existUrlMap.get(url) : undefined
    if (old) {
      if (volume && !old.volume) {
        await db.chapter.update({ where: { id: old.id }, data: { volume } }).catch(() => {})
      }
      if (isFull || !old.fetched) needUrls.push(url)
      continue
    }
    if (!url) continue
    tailIdx += 1
    try {
      await db.chapter.create({
        data: { bookId, idx: tailIdx, title: title || '未命名章节', url, volume, storage: 'db', fetched: false },
      })
      createdCount2 += 1
      needUrls.push(url)
    } catch (e: any) {
      errCount2 += 1
      await taskLog(taskId, 'error', `章节记录创建失败(多段) ${title.slice(0, 60)}: ${String(e?.message || e).slice(0, 120)}`)
    }
  }
  if (createdCount2 > 0 || errCount2 > 0) {
    if (createdCount2 > 0) await mergeStatsDelta(taskId, { chaptersCreated: createdCount2 })
  }
  return { needUrls }
}

// ---------------- kind: contents (清洗 + 正文落库, db 模式简化版) ----------------
async function handleContents(ctx: CallbackCtx, taskId: string, p: Record<string, unknown>): Promise<Response> {
  const bookUrl = asStr(p.bookUrl, 2000)
  const rawItems = Array.isArray(p.items) ? p.items : []
  if (!bookUrl || rawItems.length === 0) return reply({ ok: true })
  // [R50-1] ctx.task 在本分支未直接消费(书籍定位走 sourceUrl), 只取 clean
  const { clean } = ctx

  const book = await db.book.findFirst({ where: { sourceUrl: bookUrl }, select: { id: true } })
  if (!book) {
    await taskLog(taskId, 'error', `contents 回调: 书籍不存在(sourceUrl=${bookUrl.slice(0, 120)}), 忽略本批正文`)
    return reply({ ok: false, error: '书籍不存在(先发 book 回调建书)' })
  }

  // 批量定位章节(按 bookId+url, 幂等; 乱序/重发安全)
  const urls = rawItems.map((it) => asStr(asObj(it).url, 2000)).filter(Boolean)
  const chapRows = urls.length
    ? await db.chapter.findMany({ where: { bookId: book.id, url: { in: urls } }, select: { id: true, url: true } })
    : []
  const chapByUrl = new Map(chapRows.map((c) => [c.url, c]))

  let saved = 0
  for (const it of rawItems) {
    const o = asObj(it)
    const url = asStr(o.url, 2000)
    // [R51-3-b] 超长正文防静默截断: asStr 的 slice(0, max) 会把 >1.5MB 正文裁切为残 HTML
    // (截断处标签断裂/文意断裂)当正文入库 —— 改为整章 skip + taskLog warn(宁缺毋残),
    // 章节保持 fetched=false 由下轮增量重试承担
    const rawHtml = typeof o.contentHtml === 'string' ? o.contentHtml : ''
    if (!url) continue
    if (rawHtml.length > 1_500_000) {
      await taskLog(taskId, 'warn', `章节正文超长(${rawHtml.length} 字符 > 1.5MB 上限), 跳过本章防截断残文入库: ${url.slice(0, 120)}`)
      continue
    }
    const contentHtml = rawHtml
    if (!contentHtml) continue
    // Go 不做内容清洗(契约 §4): 回调侧复用 TS 清洗链(cleanContentHtml + 该任务规则 clean 配置)
    const cleaned = cleanContentHtml(contentHtml, clean)
    const plainLen = cleaned.replace(/<[^>]+>/g, '').length
    const ch = chapByUrl.get(url)
    if (ch) {
      // oo-① 同款容错: 章节行被并发删除(P2025)时降级建行兜底, 内容不丢失
      const updated = await db.chapter
        .update({ where: { id: ch.id }, data: { content: cleaned, storage: 'db', wordCount: plainLen, fetched: true } })
        .then(() => true)
        .catch(() => false)
      if (!updated) await createChapterWithContent(book.id, o, url, cleaned, plainLen)
    } else {
      // 建章链缺章兜底(chapters 回调遗漏/乱序): 尾插建行直接带正文
      await createChapterWithContent(book.id, o, url, cleaned, plainLen)
    }
    saved++
  }
  // [R50-1 联调修复·二轮] 章级增量一次累加(原每行覆盖写)
  if (saved > 0) await mergeStatsDelta(taskId, { chaptersUpdated: saved })

  // 书籍字数聚合(finishBookOk 同款统计语义; latestChapter 由 chapters 回调维护)
  if (saved > 0) {
    const agg = await db.chapter.aggregate({ where: { bookId: book.id, fetched: true }, _sum: { wordCount: true } })
    await db.book.update({ where: { id: book.id }, data: { wordCount: agg._sum.wordCount || 0 } }).catch(() => {})
  }
  return reply({ ok: true })
}

/** 缺章兜底建行: idx 用尾插(maxIdx+1), 防 @@unique([bookId,idx]) 冲突; 失败静默(下轮增量重试) */
async function createChapterWithContent(
  bookId: string,
  o: Record<string, unknown>,
  url: string,
  cleaned: string,
  plainLen: number,
): Promise<void> {
  try {
    const maxAgg = await db.chapter.aggregate({ where: { bookId }, _max: { idx: true } })
    const idx = (maxAgg._max.idx ?? 0) + 1
    await db.chapter.create({
      data: {
        bookId, idx,
        title: cleanChapterTitle(asStr(o.title, 300)) || '未命名章节',
        url, content: cleaned, storage: 'db', wordCount: plainLen, fetched: true,
      },
    })
  } catch { /* 极端竞态下放弃本章, 下轮增量按 fetched=false 重采 */ }
}

// ---------------- kind: cover (base64 → saveCoverWebp → 回写 Book.cover) ----------------
async function handleCover(ctx: CallbackCtx, taskId: string, p: Record<string, unknown>): Promise<Response> {
  const bookUrl = asStr(p.bookUrl, 2000)
  const b64 = typeof p.b64 === 'string' ? p.b64 : ''
  if (!bookUrl || !b64) return reply({ ok: false, error: 'bookUrl/b64 必填' })
  const buf = Buffer.from(b64, 'base64')
  // 契约 §2: b64 解码后 ≤10MB
  if (buf.length === 0 || buf.length > 10 * 1024 * 1024) {
    await taskLog(taskId, 'warn', `封面回调非法(解码后 ${buf.length} 字节), 跳过`)
    return reply({ ok: false, error: '封面数据非法(解码后需 ≤10MB)' })
  }
  const coverPath = await saveCoverWebp(buf, `book_${Date.now()}_${Math.floor(Math.random() * 9999)}`)
  if (!coverPath) {
    await taskLog(taskId, 'warn', '封面转存 webp 失败, 保留原外链封面')
    return reply({ ok: true })
  }
  const book = await db.book.findFirst({ where: { sourceUrl: bookUrl }, select: { id: true } })
  if (book) {
    await db.book.update({ where: { id: book.id }, data: { cover: coverPath } }).catch(() => {})
    // coversSaved 归 Go 累计计数(asyncStats 绝对值覆盖, 单一写者每键); 此处不再重复累加
    await taskLog(taskId, 'success', `封面已转存webp: ${coverPath}`)
  }
  return reply({ ok: true, coverPath })
}

// ---------------- 主分发 ----------------
export async function POST(req: Request) {
  return withGuard(async () => {
    // 0) 共享密钥强校验(proxy.ts 已豁免本路径的会话鉴权/限流, 本层为 403 兜底 + 纵深防御)
    if (!verifyGoCallbackSecret(req.headers.get('x-go-callback-secret'))) {
      return reply({ ok: false, error: '回调密钥校验失败' }, 403)
    }
    const body = asObj(await readBody(req, CALLBACK_MAX_BODY_BYTES))
    const taskId = asStr(body.taskId, 64)
    const kind = asStr(body.kind, 32)
    const payload = asObj(body.payload)
    if (!taskId || !kind) return reply({ ok: false, error: 'taskId/kind 必填' })

    // 任务装载(防御式: taskId 不存在时无法写 TaskLog(FK), 仅服务端日志留痕)
    const loaded = await loadCallbackCtx(taskId).catch(
      (e): { ctx?: CallbackCtx; error?: string } => ({ error: String(e?.message || e).slice(0, 200) }),
    )
    if (!loaded.ctx) {
      logger.warn('go-callback task missing', { taskId, kind, err: loaded.error })
      return reply({ ok: false, error: loaded.error || '任务不存在' })
    }
    const ctx = loaded.ctx

    try {
      switch (kind) {
        case 'log': {
          const rawLevel = asStr(payload.level, 10)
          const level: TaskLogLevel = LOG_LEVELS.includes(rawLevel) ? (rawLevel as TaskLogLevel) : 'info'
          await taskLog(taskId, level, asStr(payload.message, 2000) || '(空日志)')
          return reply({ ok: true })
        }
        case 'status': {
          // 契约 §2 status 行: Task.status 迁移(paused 保留进度)
          const status = asStr(payload.status, 20)
          if (!GO_STATUSES.includes(status)) return reply({ ok: false, error: `非法 status: ${status || '(空)'}` })
          // [R53-2b][R52-c P3 两端异步状态写竞态] 全状态条件写(R51-3-b 'running' 先例统一扩全):
          //  Go 异步回调与 TS 控制面(_go-control markGoStarted/pause 条件写/stop writeStatus)、
          //  ghost sweeper(recovery interrupted)并发写 Task.status, 迟到/重试回调乱序到达会以
          //  旧状态覆写新状态(标签漂移): ① 迟到 paused 覆写 done/error/stopped → 终态任务复活成
          //  paused 僵尸(autoRefresh 复核只认 done/error, 自愈链静默断头); ② 迟到 done 覆写操作员
          //  stop 落地的 stopped → scheduleAutoRefresh 复核恰好放行, 用户已停止的任务被定时器拉起
          //  (违背操作意图, 与 runner serializeCrashStatus「操作员表态优先」同语义)。统一口径:
          //  任一 status 回调仅允许覆写非终态集(pending/running/paused/interrupted), 终态↔终态
          //  互不覆写(重复终态回调本就幂等无写面)。覆写未落地(count=0)时跳过其后 autoRefresh
          //  排定 —— done 状态前提不在库, 排定即悬空; 响应仍 {ok:true}, Go 侧重试无收益
          //  (与 R52-5「4xx 确定性失败不重试」同思路)。
          const landed = await db.task
            .updateMany({ where: { id: taskId, status: { in: ['pending', 'running', 'paused', 'interrupted'] } }, data: { status } })
            .catch(() => null)
          if (asStr(payload.note, 500)) await taskLog(taskId, 'info', asStr(payload.note, 500))
          if (status === 'done' && landed !== null && landed.count > 0 && ctx.task.autoRefresh) {
            // [R51-3-b] autoRefresh 遗留①闭环: done 后自动重排下一轮采集(v1 仅记日志提示手动重开)。
            //  scheduleAutoRefresh 内部钳制间隔 [5,1440]min, 触发时复核 任务存在/autoRefresh/运行态/
            //  终态 后调 control('start') 重启; 'stopped' 状态天然不参与自动刷新(R3-14 同口径)
            TaskRunner.instance.scheduleAutoRefresh(taskId, ctx.task.refreshIntervalMin, ctx.task.name)
            await taskLog(taskId, 'info', `任务完成: autoRefresh 已开启, 已自动重排下一轮采集(${Math.max(5, Math.round(ctx.task.refreshIntervalMin))} 分钟后)`)
          }
          return reply({ ok: true })
        }
        case 'progress': {
          // 契约 §2: merge 进 Task.progress JSON, 仅覆盖出现的键(节流由 Go 侧保证 ≥1 次/秒)。
          // [R50-1 联调修复] 原读改写与并发回调竞态 → 末次 done 进度被旧值挤掉(phase 停在
          //  content); 现走白名单过滤 + 原子 json_patch 单语句合并
          const patch: Record<string, unknown> = {}
          for (const k of PROGRESS_KEYS) {
            if (payload[k] === undefined) continue
            const v = payload[k]
            if (k === 'phase') {
              if (typeof v === 'string' && PROGRESS_PHASES.includes(v)) patch[k] = v
            } else if (k === 'phaseNote' || k === 'currentBook') {
              patch[k] = asStr(v, 200)
            } else {
              const n = asInt(v)
              if (n !== undefined) patch[k] = n
            }
          }
          if (Object.keys(patch).length > 0) await mergeTaskJsonAtomically(taskId, 'progress', patch)
          return reply({ ok: true })
        }
        case 'stats': {
          // 白名单过滤后原子合并(Go 侧只发 errors/coversSaved, 防御式收敛不信任载荷)
          const patch: Record<string, unknown> = {}
          for (const k of STATS_KEYS) {
            const n = asInt(payload[k])
            if (n !== undefined) patch[k] = n
          }
          if (Object.keys(patch).length > 0) await mergeTaskJsonAtomically(taskId, 'stats', patch)
          return reply({ ok: true })
        }
        case 'book':
          return await handleBook(ctx, taskId, payload)
        case 'chapters':
          return await handleChapters(ctx, taskId, payload)
        case 'contents':
          return await handleContents(ctx, taskId, payload)
        case 'cover':
          return await handleCover(ctx, taskId, payload)
        default:
          return reply({ ok: false, error: `未知 kind: ${kind}` })
      }
    } catch (e: any) {
      // 全程防御式: 单 kind 内部异常 → 500(触发 Go 侧重试 1s/2s/4s)+ TaskLog 留痕
      logger.error('go-callback handler error', { taskId, kind, err: String(e?.message || e).slice(0, 200) })
      await taskLog(taskId, 'error', `Go 回调处理异常(${kind}): ${String(e?.message || e).slice(0, 160)}`)
      return reply({ ok: false, error: '回调处理内部错误' }, 500)
    }
  })
}
