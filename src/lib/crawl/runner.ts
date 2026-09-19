// ============================================================
// 多线程采集任务运行器 (进程内单例)
// - 随机线程数范围 / 随机间隔范围 (每批次动态抽取)
// - 立即执行 / 暂停 / 停止 / 在线调节线程与间隔
// - 完全覆盖重采集 & 只增量更新
// - 单本 & 范围(列表页起止) 采集
// - 存储模式: 数据库 | TXT文件
// ============================================================
import { db } from '@/lib/db'
import { type RuleConfig, type TocItem, type FetchConfig, parseRuleConfig, sanitizeFetchConfig } from './types'
import { fetchPage, fetchBinary, checkBrowser, type FetchResult, effectiveHostGateLimit, registerGracefulShutdown, loadCookieJarFromDisk, hostAdaptiveGapMultiplier } from './fetcher'
import { acquireHostGate, releaseHostGate, reportHostSuccess, reportHostFailure, reportHostRateLimited, hostGateSnapshot, hostGateKeyOf } from './hostgate'
import { parseList, parseBook, parseToc, parseContent, parseJsonBody, absolutize } from './parser'
import { cleanContentHtml, cleanIntro, cleanChapterTitle, cleanTextField } from './cleaner'
import { reorderToc } from './sorter'
import { saveChapterTxt, saveCoverWebp, deleteBookTxt, ensureDirs } from './storage'
import { smartCategory, smartCompleteDetect } from './smart'
import { fetchSuggestKeywords, mergeSuggestWords } from './suggest'
import { sliceCodePoints } from '@/lib/utils' // [R25-5a] 码点截断(UTF-16 slice 会斩半 emoji 代理对)
// [R34-2a-5] 书号采集: 与 API 规范化/UI 计数共用同一纯函数模块
// [R35-2a-5] 书号范围: 范围校验(parseBookIdRange)与序列展开(buildBookIdQueueFromRange)同模块扩展
import {
  buildBookIdQueue,
  buildBookIdQueueFromRange,
  parseBookIdList,
  parseBookIdRange,
  BOOK_ID_PLACEHOLDER,
} from '@/lib/book-ids'
import { nextBookNum, withBookNumRetry } from '@/lib/pseudostatic-server'
// [R42-1] 免费代理池: 启动前按 needsProxy/proxyCountries 匹配 + buildFetch 同步兜底 + 保鲜循环懒激活
import { pickProxiesForRule, getCachedProxyPoolSnapshot, ensurePoolAutoLoop } from './proxy-pool'

// feat-cloak-anticrawler B/E: 启动时加载持久化 cookie jar + 注册 SIGTERM 优雅关闭 hook
// (cookieJar 持久化 / Obscura 关闭 / 等在飞 / exit)。模块加载即触发, 保证 fetcher 模块
// 一旦被 import 进运行时(任何采集路径都必经)就完成注册; dev HMR 多次 import 由
// registerGracefulShutdown 内部 globalThis 标志保证幂等(只注册一次)。
try { loadCookieJarFromDisk() } catch { /* 启动期失败容忍: 静默空罐启动 */ }
try { registerGracefulShutdown() } catch { /* 某些运行时 process 只读, 忽略 */ }

type ControlAction = 'start' | 'pause' | 'stop'

interface TaskRuntime {
  paused: boolean
  stopped: boolean
  running: boolean
  /** 运行代数: 每次全新 start 自增; 旧一轮循环检测到漂移即自行退出 */
  epoch: number
  /** E4: 连续错误熔断触发时间戳; control('start') 在 60s 冷却期内拒绝重启,
   *  防止操作员在故障源上反复硬敲(熔断→重启→再熔断)。epoch 漂移/正常完成时不清零,
   *  作为该 task 的最近一次熔断记忆(冷却过后允许重启) */
  circuitTrippedAt?: number
  /** R3-10: runtime 最后活跃时间戳(每次 start/pause/controlInner 路径更新) —— LRU 驱逐
   *  时优先淘汰 paused 且 1h 未活跃的条目, 避免长期挂起但已不可恢复的任务占住 Map 槽位 */
  lastActiveAt: number
  /** feat-contentproxy-resume(范围任务续采): 已在列表页发现过的书籍 URL 集合。
   *  范围任务重启时, 已发现过的书籍不再加入 bookQueue(节省书籍页抓取/解析/数据库写入),
   *  仅 list 页上新出现的书籍才进入采集队列; 任务进度 progress.discoveredBookUrls 持久化,
   *  本进程内存 Set 由 progress 装载。recrawlMode==='full' 任务启动时清空(重采语义) */
  discoveredBookUrls: Set<string>
  /** feat-contentproxy-resume(范围任务续采): 已完整采集(章节全采完)的【已完结】书籍 URL 集合。
   *  仅 status==='completed' 的书才会加入本集合 —— 完结书不会再有新章节, 重启时整体跳过
   *  (不重抓书籍页/目录/正文)。recrawlMode==='full' 任务启动时清空(重采语义)。
   *  feat-combo-theme-incremental: 区分 completed/ongoing ——
   *  原实现把所有 'ok' 返回的书都加进 completedBookUrls, 但【连载中】书籍重启后仍需
   *  检查新章节, 不应整体跳过。现在只把 detectedStatus==='completed' 的书加入本集合,
   *  连载书改入 ongoingBookUrls + bookLastChapters */
  completedBookUrls: Set<string>
  /** feat-combo-theme-incremental(连载书籍增量): status==='ongoing' 的书籍 URL 集合。
   *  重启时这些书籍【不整体跳过】, 而是抓取书籍页 + 目录, 对比末章 URL 与 stored 末章:
   *  相同 → 跳过(无新章节); 不同 → 增量采新章节(existUrlMap 自动去重已采过的)。
   *  recrawlMode==='full' 任务启动时清空。本集合只增不删 */
  ongoingBookUrls: Set<string>
  /** feat-combo-theme-incremental(连载书籍增量): bookUrl → 末章 URL(上次采集到的最后一章 URL)。
   *  重启时与当前目录末章 URL 对比: 相同 → 跳过; 不同 → 增量采新章节。
   *  recrawlMode==='full' 任务启动时清空 */
  bookLastChapters: Map<string, string>
  /** R8-5: dirty flags —— 跟踪各集合是否在上一轮 saveProgress 后被修改过。
   *  saveProgress 仅序列化 dirty=true 的集合, 跳过未修改集合免重复 JSON.stringify(原实现
   *  每次都把 4 个集合全序列化, 50000 书×60B=3MB×4=12MB, 100ms/次, 长任务累计数小时纯序列化开销)。
   *  集合首次创建时为 true(确保首次 saveProgress 落库), reset 时置 true(确保清空状态写库)。 */
  dirtyDiscovered: boolean
  dirtyCompleted: boolean
  dirtyOngoing: boolean
  dirtyLastChapters: boolean
}

interface TaskProgress {
  phase: 'idle' | 'discovery' | 'book' | 'toc' | 'content' | 'done'
  phaseNote?: string
  discovered: number
  booksDone: number
  booksTotal: number
  tocTotal: number
  contentDone: number
  contentTotal: number
  currentBook?: string
  lastThread?: number
  lastInterval?: number
  engineStats?: Record<string, number>
  /** feat-contentproxy-resume(范围任务续采): 已发现的书籍 URL 列表(持久化进 task.progress)。
   *  范围任务重启时由本字段重建 rt.discoveredBookUrls Set, 用于跳过已发现书籍免再入 bookQueue。
   *  cap 50000 条防 DB 膨胀(50000×~60B URL≈3MB JSON, SQLite TEXT 上限 1GB, 实际无虞但保守钳) */
  discoveredBookUrls?: string[]
  /** feat-contentproxy-resume(范围任务续采): 已完整采集的【已完结】书籍 URL 列表(持久化进 task.progress)。
   *  范围任务重启时由本字段重建 rt.completedBookUrls Set, 用于跳过整体重采(节省书籍页/目录/正文
   *  全链路抓取)。crawlOneBook 在 detectedStatus==='completed' 时追加到 rt.completedBookUrls,
   *  saveProgress 同步落库。cap 50000 条。
   *  feat-combo-theme-incremental: 仅完结书加入本字段, 连载书改入 ongoingBookUrls */
  completedBookUrls?: string[]
  /** feat-combo-theme-incremental(连载书籍增量): status==='ongoing' 的书籍 URL 列表(持久化)。
   *  重启时由本字段重建 rt.ongoingBookUrls Set, 用于增量检查新章节(不整体跳过)。
   *  cap 50000 条 */
  ongoingBookUrls?: string[]
  /** feat-combo-theme-incremental(连载书籍增量): bookUrl → 末章 URL(持久化)。
   *  重启时与当前目录末章 URL 对比, 相同则跳过(无新章节), 不同则增量采新章节。
   *  cap 50000 条 */
  bookLastChapters?: Record<string, string>
}

interface TaskStats {
  booksCreated: number
  booksUpdated: number
  chaptersCreated: number
  chaptersUpdated: number
  coversSaved: number
  errors: number
  suggestWords: number
}

function emptyProgress(): TaskProgress {
  return { phase: 'idle', discovered: 0, booksDone: 0, booksTotal: 0, tocTotal: 0, contentDone: 0, contentTotal: 0 }
}
function emptyStats(): TaskStats {
  return { booksCreated: 0, booksUpdated: 0, chaptersCreated: 0, chaptersUpdated: 0, coversSaved: 0, errors: 0, suggestWords: 0 }
}

/** tt-c: 任务级连续错误熔断阈值 —— 连续 N 个真实章节失败(超时/抓取异常)即中止本书并上抛,
 *  任务转 error 终态(autoRefresh 自动重试自愈)。20 的量级: 正常抖动(单章偶败)远够不着,
 *  站点改版/被全量拦截时 2~3 个批次内即熔断, 不再硬敲 */
const CIRCUIT_ERROR_LIMIT = 20

/** [R36-2c-4] 书籍级连续失败熔断阈值 —— 章节级(CIRCUIT_ERROR_LIMIT)只覆盖"书籍页已抓到
 *  且目录非空"的正文阶段; 书籍页抓取超时/异常/拦截壳页在逐书循环里只计 errors 不熔断,
 *  死站/全站拦截 + 大 bookQueue(范围模式 10 万级/书号模式 2000 上限)时会逐本硬敲到底
 *  (每本一次超时级请求+错误日志)。20 本连续失败与章节熔断同量级: 正常抖动够不着,
 *  站点级故障 2~3 轮内即熔断交由 autoRefresh 自愈 */
const BOOK_CIRCUIT_ERROR_LIMIT = 20

// ================== [R46-2a-1] 两阶段流水线(R46-2 用户指令) ==================
// 用户指令: "先采集书籍+目录名把所有数据支持起来再去批量采集章节内容"。
// 原 crawlOneBook(书籍页→目录→章节入库→正文批次全流程单书内串行, 范围任务逐本硬采)拆为:
//  - crawlOneBookMeta: 书籍页+封面+建书+目录+章节记录入库(重排阶段A~E), 产出 BookCrawlCtx(正文队列+落库上下文);
//    queue 为空(无新章/增量末章未变/跨源去重跳过)时直接收尾返回 'ok', 有新章返回 'deferred'+ctx
//  - crawlBookContentsBatch: 接收【多本书】ctx, 合并章节队列跨书批量并发采正文(既有 threads/interval/
//    hostgate/熔断/暂停停止/断点语义逐项保留), 逐书收尾
// executeTask 书循环改为: 书级并发池跑 meta(并发度 BOOK_META_CONCURRENCY, 环境变量 CRAWL_BOOK_CONCURRENCY
// 缺省 2 上限 4) → 批内 ctx 合并跑正文 → 下一批。批次大小 META_BATCH_SIZE(CRAWL_META_BATCH, 缺省 10)
// 钳内存(ctx 队列不跨批累积)。语义保留: 完结跳过/连载增量检查/跨源去重/智能分类完结/书籍级+章节级熔断/
// 在线调参/epoch 漂移让位。进度语义: booksDone 仍在书收尾时 +1; contentDone/contentTotal 变为批内跨书累计。
/** 两阶段流水线: 元数据段(crawlOneBookMeta)产出、正文段(crawlBookContentsBatch)消费的跨段上下文 */
interface BookCrawlCtx {
  taskId: string
  bookUrl: string
  bookId: string
  bookName: string
  rule: RuleConfig
  taskCfg: { id: string; ruleId: string; recrawlMode: string; storageMode: string; smartCategory: boolean; smartComplete: boolean; autoSuggest: boolean }
  /** 待采正文章节队列(阶段A~E 重排后构建) */
  queue: { chId?: string; title: string; url: string; volume: string; idx: number }[]
  idMap: Map<string, string>
  tocUrlRef: string
  tocItems: TocItem[]
  fetchCfg: Partial<FetchConfig>
  contentFetchCfg: Partial<FetchConfig>
  isFull: boolean
  detectedStatus: 'completed' | 'ongoing' | 'unknown'
  /** 正文段成功采完的章数(逐章累加), 完成日志与收尾统计用 */
  doneCount: number
}

/** [R46-2a-1] 书级并发上限(元数据阶段书籍页/目录页并发度): 4GB 沙箱 + hostgate 同站闸门
 *  已限同站并发, 书级 2 并发主要削"多本书顺序等待"的长尾; 上限 4 防内存(existChapters
 *  每书最多 5 万行 ≈10MB)与请求面失控。环境变量 CRAWL_BOOK_CONCURRENCY 可调 */
const BOOK_META_CONCURRENCY = (() => {
  const n = Number(process.env.CRAWL_BOOK_CONCURRENCY)
  return Number.isFinite(n) && n >= 1 && n <= 4 ? Math.floor(n) : 2
})()
/** [R46-2a-1] meta 批大小: 每批先并发跑 N 本的书籍页+目录(前台即刻可见), 再合并批内全部
 *  章节队列跑正文批次, 完毕才进入下一批 —— "两阶段"在批粒度成立且 ctx/queue 内存有界。
 *  环境变量 CRAWL_META_BATCH 可调(下限=并发数, 上限 50) */
const META_BATCH_SIZE = (() => {
  const n = Number(process.env.CRAWL_META_BATCH)
  return Number.isFinite(n) && n >= BOOK_META_CONCURRENCY && n <= 50 ? Math.floor(n) : Math.max(10, BOOK_META_CONCURRENCY * 5)
})()

// ---------- [R28-4-E3] trafilatura 正文提取兜底(FETCH_EXTRACT_FALLBACK=1 缺省关) ----------
/** 场景: 规则失效/站点改版/低质模板站时 parseContent 产出极短正文(confidence 低), 章节以
 *  近 0 字入库。开关开启后, plainLen<200 且 confidence<0.3 的章节把原始 HTML POST 给
 *  scrapling 桥 /extract(trafilatura 自适应正文提取, R27-1b 已就绪), 返回文本按 \n 段落
 *  wrap <p>(与 fetcher contentProxy 路径同款转义)重过 cleanContentHtml 后落库。
 *  护栏: ①桥调用恒回环直连(桥地址同 scrapling 桥, 引擎侧 SSRF 先例 impersonateOnceViaBridge);
 *  ②兜底产物 plainLen≥100 才采纳(保底长度闸, 导航噪声提取器产物拒收);
 *  ③每 host 连续 3 次兜底失败(桥不可达/桥内失败/提取空)即进程内停用该 host(防慢桥拖任务);
 *  ④POST 超时 20s; ⑤失败静默(落原 cleaned, 不阻断采集链) */
const FETCH_EXTRACT_FALLBACK_ENABLED = process.env.FETCH_EXTRACT_FALLBACK === '1'
const FETCH_EXTRACT_BRIDGE_DEFAULT = process.env.SCRAPLING_BRIDGE_URL || 'http://127.0.0.1:3012'
const FETCH_EXTRACT_MIN_PLAIN = 100
const FETCH_EXTRACT_HOST_FAIL_LIMIT = 3
// 每 host 兜底连败计数(进程内; globalThis 防 HMR 多实例)
const globalForExtractFb = globalThis as unknown as { __novelExtractFbFail_v1?: Map<string, number> }
const extractFbFailStreak: Map<string, number> = globalForExtractFb.__novelExtractFbFail_v1 ?? new Map()
globalForExtractFb.__novelExtractFbFail_v1 = extractFbFailStreak
// [R30-3-2] 进程级 number-Map FIFO 上限(同 fetcher hostRhythm/proxySticky 先例):
// extractFbFailStreak 按 host 逐条累积, 站群长任务(数千 host)下无淘汰会无界增长 ——
// 512 与 fetcher HOST_RHYTHM_CAP 对齐; 计数值 ≤3(达限即停用该 host 兜底), 驱逐最旧条目
// 仅丢"兜底停用"记忆, 下次再败 3 次重新停用, 行为语义不变
const EXTRACT_FB_HOST_CAP = 512
// export 供验证脚本单测 FIFO 有界性(与 fetcher.parseRetryAfterHeaderMs / 本文件 jitteredInterval
// 同款"导出供验证脚本直接单测"先例; 纯函数无状态, 零行为影响)
export function numberMapFifoSet(m: Map<string, number>, key: string, value: number, cap: number): void {
  while (m.size >= cap) {
    const oldest = m.keys().next().value
    if (oldest === undefined) break
    m.delete(oldest)
  }
  m.set(key, value)
}

/** [R28-4-E3] 桥 /extract 兜底提取: 成功返回 wrap 好的 <p> HTML(调用方还需重过 cleanContentHtml),
 *  失败/停用返回 null(静默) */
async function trafilaturaExtractFallback(pageUrl: string, html: string, bridgeUrl: string): Promise<string | null> {
  if (!html) return null
  const host = hostGateKeyOf(pageUrl)
  if (host && (extractFbFailStreak.get(host) || 0) >= FETCH_EXTRACT_HOST_FAIL_LIMIT) return null
  const bridge = (bridgeUrl || '').trim() || FETCH_EXTRACT_BRIDGE_DEFAULT
  try {
    const res = await fetch(`${bridge}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // html 直提形态(url 作提取上下文供 trafilatura 参考坐标, 桥内不重新抓取)
      body: JSON.stringify({ html, url: pageUrl }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const payload = (await res.json()) as { ok?: boolean; text?: string; error?: string }
    if (!payload?.ok || typeof payload.text !== 'string' || !payload.text.trim()) {
      throw new Error(String(payload?.error || 'ok/text 字段缺失').slice(0, 120))
    }
    if (host) numberMapFifoSet(extractFbFailStreak, host, 0, EXTRACT_FB_HOST_CAP) // [R30-3-2] 有界写入
    // \n 段落 wrap <p>(与 contentProxy 路径 fetcher.ts 同款转义)
    return payload.text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `<p>${l.replace(/[<>&]/g, (c) => c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;')}</p>`)
      .join('')
  } catch {
    if (host) numberMapFifoSet(extractFbFailStreak, host, (extractFbFailStreak.get(host) || 0) + 1, EXTRACT_FB_HOST_CAP) // [R30-3-2] 有界写入
    return null
  }
}

/** [R28-4-E1] host 级熔断观测日志节流: 同 host 1min 至多 1 条(防千章任务被熔断快速失败
 *  逐章刷 warn 日志刷屏)。[R30-3-2] 写入走 numberMapFifoSet 有界化(512, 同上) ——
 *  修前按 host 逐条累积永不淘汰, 站群场景无界增长 */
const hostCircuitWarnAt = new Map<string, number>()
const HOST_CIRCUIT_WARN_CAP = 512

/** E4: 熔断后冷却窗口 —— 60s 内拒绝 control('start') 重启, 防止操作员反复硬敲故障源 */
const CIRCUIT_COOLDOWN_MS = 60_000

/** zz-b: 429 限流特征(blocked 壳页体内容, 大小写不敏感)——命中走限流冷却(reportHostRateLimited)
 *  而非连败降额链; 403/验证码等其余特征维持既有降额链不变 */
const RATE_LIMIT_HINT_RE = /429|rate[ _-]?limit|too many requests/i

// ==================== [R18-c-1] 重启恢复 DB 对账(库中无书不跳过) ====================
// 修复用户报告: 采集任务重启后"跳过而不续采"。根因: 恢复段把 progress 里的
// discoveredBookUrls/completedBookUrls/ongoingBookUrls 原样重建为 Set, 若上轮书籍入库失败
// (URL 进了 Set 但 Book 行没建成/没章节)、用户在书籍管理删书、或 progress 被 restore 回滚,
// 重启后这些 URL 仍被发现阶段跳过(L919)/完结整体跳过(L977)挡住 → 库里缺书却
// 永远不再采([R21-e-5] 注: 原 R18-c 注释的 L759/L817 为当时行号已漂移, 改为当轮实测行号)。
// 修法: 恢复段一次性对账(不在消费点逐条查库), 库中实际不存在的 URL 从 Set 剔除 →
// 列表重新发现时重新入队采集。

/** 对账分批查询上限: 每批 IN 子句 URL 数(SQLite 本地毫秒级; 万级 URL 分批循环, 单批参数有界)
 *  [R21-e-5] 精简: 本组对账导出(RESUME_RECONCILE_BATCH/ResumeSetsView/ReconcileDbRow/
 *  ReconcileOutcome/reconcileResumeSetsCore)经 rg 全库含 scripts/archive 实证零外部消费
 *  (R18-c 当轮验证脚本在 /tmp 已删), 依 R19-b-3/R21-d-4 同款口径去 export 保留实现 */
const RESUME_RECONCILE_BATCH = 500

/** [R18-c-1] 对账输入: 三组续采 Set + 末章记忆(传引用, 剔除直接原地 delete) */
interface ResumeSetsView {
  discovered: Set<string>
  completed: Set<string>
  ongoing: Set<string>
  lastChapters: Map<string, string>
}

/** [R18-c-1] 对账查询行: sourceUrl + 该书章节数(0 = 空壳书) */
interface ReconcileDbRow {
  sourceUrl: string
  chapterCount: number
}

/** [R18-c-1] 对账结果: 剔除明细 + 各集合剔除计数(供调用方置 dirty 标志) */
interface ReconcileOutcome {
  removedUrls: string[]
  removedFrom: { discovered: number; completed: number; ongoing: number; lastChapters: number }
  batches: number
  queriedUrls: number
}

/**
 * [R18-c-1] 续采集合 DB 对账核心(纯逻辑, queryDb 注入便于单测):
 *  1. 三组 Set 汇总去重 → 分批(≤RESUME_RECONCILE_BATCH)经 queryDb 查库内实际存在的
 *     sourceUrl + 章节数, 构建 Map(库中不查到的 URL 不入 Map = 不存在);
 *  2. 判定需重采(URL 从所有所在集合剔除, 含 discovered —— 列表模式的书同时在 discovered
 *     中, 只剔 completed/ongoing 会被 L759 发现跳过挡住, "移回待采"不生效):
 *     - 库中无该 sourceUrl 记录 → 剔除(用户口径: 库里实际没有的书不能跳过);
 *     - 库中存在但 0 章节且 URL ∈ completed → 剔除(completed 语义是"整本采完", 空壳书
 *       应重采; 仅 ∈ discovered/ongoing 的 0 章节书按原语义保留不在本对账范围);
 *  3. 形态口径: 发现(absolutize 后)→入库(sourceUrl: bookUrl 逐字)→持久化→恢复 全链
 *     同源同形态, 直接精确比对, 不做 normalize(形态不一致的陈旧数据会被判"库中无记录"
 *     重采, 落到 crawlOneBook 的 findFirst({sourceUrl}) 同口径, 不会误跳过)。
 * 抛错语义: queryDb 抛错时原样上抛且【未做任何剔除】(剔除发生在全部批次成功之后),
 * 调用方按 fail-open 保留原 Set。 */
async function reconcileResumeSetsCore(
  sets: ResumeSetsView,
  queryDb: (batch: string[]) => Promise<ReconcileDbRow[]>,
): Promise<ReconcileOutcome> {
  const union = new Set<string>()
  for (const u of sets.discovered) union.add(u)
  for (const u of sets.completed) union.add(u)
  for (const u of sets.ongoing) union.add(u)
  const empty: ReconcileOutcome = {
    removedUrls: [],
    removedFrom: { discovered: 0, completed: 0, ongoing: 0, lastChapters: 0 },
    batches: 0,
    queriedUrls: 0,
  }
  if (union.size === 0) return empty
  const urls = Array.from(union)
  // 分批查库: sourceUrl 精确 IN 匹配。
  // [R19-b-1] 同 sourceUrl 多行(Book.sourceUrl 列无 unique, 并行任务同书竞态可建重行):
  //  原实现 Map.set 后写覆盖, findMany 无 orderBy 时返回序不定 → "0 章空壳重行"可能覆盖
  //  "千章正主行", 完结书被非确定性误判空壳剔除重采。改取同 URL 行数最大值(保守判定:
  //  只要任一行有章节即视为非空壳), 单行正常场景取值不变, 重复行场景判定确定化
  const chapterCounts = new Map<string, number>()
  let batches = 0
  for (let i = 0; i < urls.length; i += RESUME_RECONCILE_BATCH) {
    const batch = urls.slice(i, i + RESUME_RECONCILE_BATCH)
    batches++
    for (const row of await queryDb(batch)) {
      chapterCounts.set(row.sourceUrl, Math.max(chapterCounts.get(row.sourceUrl) ?? -1, row.chapterCount))
    }
  }
  // 判定需重采: 库中无记录; 或 completed 语义但 0 章节(空壳完结书)
  const stale: string[] = []
  for (const u of urls) {
    const ch = chapterCounts.get(u)
    if (ch === undefined || (ch === 0 && sets.completed.has(u))) stale.push(u)
  }
  const removedFrom = { discovered: 0, completed: 0, ongoing: 0, lastChapters: 0 }
  for (const u of stale) {
    // 从所有所在集合剔除; 末章记忆同步清理(书都不在了, 陈旧末章 URL 只会污染下次比对;
    // 重采成功后 shuntBookStatus 会按新状态重建/清理该记忆)
    if (sets.discovered.delete(u)) removedFrom.discovered++
    if (sets.completed.delete(u)) removedFrom.completed++
    if (sets.ongoing.delete(u)) removedFrom.ongoing++
    if (sets.lastChapters.delete(u)) removedFrom.lastChapters++
  }
  return { removedUrls: stale, removedFrom, batches, queriedUrls: urls.length }
}

/** [R36-2c-1] 阶段E 批量删除安全闸决策(纯函数, export 供验证脚本单测):
 *  修前阶段E 无条件 deleteMany(idx>tocItems.length 且 url 不在当前目录) —— 目录解析
 *  截断/中途失败时(本轮 TOC 只是既有章节的前缀子集), 整本书尾部正章会被当"陈旧章"
 *  批量清掉(实例链路: 翻页中一跳瞬断→TOC 只剩前 N 页→N 章之后全部被删, R35-2c-1
 *  已证明该截断形态真实存在)。判据双闸:
 *  ① 量闸: staleCount > max(50, 30%×既有章节数) —— 正常"源站删了少量旧章"远够不着;
 *  ② 签名闸: creates ≤ 10%×tocLen(本轮目录 ≥90% 与既有章节按 URL/标题精确命中 =
 *     前缀子集特征) —— 源站全量换 URL(迁移)时 creates≈全部, 不拦截(保留原删除+重采语义);
 *  两闸同时命中才跳过删除(保留数据+告警), 其余场景行为与修前逐字节一致 */
export function staleTailGuardDecision(
  staleCount: number,
  baseline: number,
  createsLen: number,
  tocLen: number,
): { skip: boolean; threshold: number } {
  const threshold = Math.max(50, Math.floor(Math.max(0, baseline) * 0.3))
  const truncatedSignature = tocLen > 0 && createsLen <= Math.floor(tocLen * 0.1)
  return { skip: staleCount > threshold && truncatedSignature, threshold }
}

// ---------- 全局单例 ----------
const globalForRunner = globalThis as unknown as { __novelTaskRunner?: TaskRunner }

export class TaskRunner {
  /** 单例创建时刻(新进程首次访问时的时间戳): recoverOnBoot 只回收早于它的孤儿任务 */
  readonly createdAt = Date.now()
  private runtimes = new Map<string, TaskRuntime>()
  /** 自动刷新定时器: 任务终态后按 refreshIntervalMin 重启; stop/delete 时清除 */
  private refreshTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** rr-c2: control 每 task 串行化链(键=taskId, 值=队尾 promise; 尾 settles 后自删防无界增长) */
  private controlChains = new Map<string, Promise<unknown>>()
  /** [R36-2c-2] per-task 单调 epoch 计数器(跨 runtime 条目生命周期存活):
   *  旧实现 epoch 存在 runtime 对象上, 而 stop 路径经 cancelAutoRefresh→disposeRuntime 把
   *  条目从 runtimes 删除 —— 紧接的 start 会创建全新 runtime 并从 epoch=1 重新计数, 与
   *  仍在途的旧循环 myEpoch=1 碰撞: 旧循环 isStale() 永假, 且其 finally 的
   *  `r.epoch === myEpoch` 检查误命中新一轮 runtime → ①清掉新轮 running 标志(isRunning
   *  变 false, ghost sweeper 可能把在跑任务回收为 paused) ②清空新轮续采集合(后续
   *  saveProgress 把半空集合落库 → progress 回退/已完结书重采)。本 Map 独立于 runtimes
   *  存活, 保证同任务每次全新 start 的 epoch 严格单调递增, 旧代循环的 epoch 比较恒漂移。
   *  FIFO 512 上限(与 fetcher hostRhythm/extractFbFailStreak 同款): 驱逐最旧任务计数器
   *  仅使该任务 epoch 基线回落到 rt.epoch(其 runtime 存活期内单调性仍保持), 需 512 个
   *  独立任务先后启动才可达, 实际不可达 */
  private taskEpochs = new Map<string, number>()
  /** R4-8: control() 30s timeout race 修复 —— per-task 状态写串行化链。
   *  原问题: controlInner 卡在 SQLite busy 等待时, Promise.race 30s 超时让 run reject,
   *  但底层 controlInner 继续执行; 后续 control('stop') 入队执行, 其 db.task.update(status='stopped')
   *  与卡住的 db.task.update(status='running') 同时在 SQLite 队列中, 提交顺序不确定, 旧写晚提交
   *  会覆盖新写(status 显示 running 但实际任务已停)。修法: per-task 把所有 db.task.update(status:...)
   *  串行化, 旧写必先完成、新写后发, last-write-wins 保证新 control 的状态写总胜出 */
  private dbStatusChains = new Map<string, Promise<unknown>>()
  /** R9-d-9: 孤儿 running 任务回收 sweeper 定时器(进程级单例, unref 不阻止退出) */
  private ghostSweepTimer: ReturnType<typeof setInterval> | null = null

  /** R9-d-9: 单例创建即挂载孤儿回收 sweeper(每 5 分钟一轮, unref)。
   *  兜底三类幽灵态: ① 备份导入的任务行自带 status:'running'(restore 不改写运行时);
   *  ② recoverOnBoot 之后因异常路径漏回收的 running 行; ③ 手工改库/外部写入的 running 行。
   *  判定精确: DB status==='running' 且本进程内 isRunning(id)===false 且 60s 宽限
   *  (cover control('start') 状态写在途窗口)未过 → 回收为 paused(与 recoverOnBoot 同语义,
   *  保留"可点击继续恢复"的操作员预期)。正常在跑任务 rt.running 恒先于状态写置位, 不会误伤 */
  private ensureGhostSweeper(): void {
    if (this.ghostSweepTimer) return
    const timer = setInterval(() => {
      this.reclaimGhostRunningTasks().catch(() => { /* DB 故障轮静默, 下轮重试 */ })
    }, 5 * 60_000)
    if (typeof timer.unref === 'function') timer.unref()
    this.ghostSweepTimer = timer
  }

  /** R9-d-9: 单轮回收扫描 —— 见 ensureGhostSweeper 注 */
  async reclaimGhostRunningTasks(): Promise<number> {
    let reclaimed = 0
    let rows: Array<{ id: string; updatedAt: Date }> = []
    try {
      rows = await db.task.findMany({
        where: { status: 'running' },
        select: { id: true, updatedAt: true },
        take: 500,
      })
    } catch {
      return 0 // DB 故障: 本轮放弃, 下轮重试
    }
    const now = Date.now()
    for (const t of rows) {
      if (this.isRunning(t.id)) continue // 本进程真实在跑
      const updated = t.updatedAt instanceof Date ? t.updatedAt.getTime() : new Date(t.updatedAt).getTime()
      if (Number.isFinite(updated) && now - updated < 60_000) continue // 60s 宽限(状态写在途窗口)
      try {
        await db.task.update({ where: { id: t.id }, data: { status: 'paused' } })
        reclaimed++
        await this.log(t.id, 'warn', '检测到孤儿运行态(进程内无活跃采集循环, 可能源于服务重启/备份导入), 已自动回收为暂停, 可点击继续恢复')
      } catch { /* P2025 任务已删等: 忽略 */ }
    }
    return reclaimed
  }

  constructor() {
    // R9-d-9: 单例构造即启动兜底 sweeper(recoverOnBoot 只覆盖进程启动一轮, 运行期幽灵态
    // 由本 sweeper 周期回收); globalThis 单例保证构造仅一次, dev HMR 不会重复挂载
    this.ensureGhostSweeper()
  }

  /** [R36-2c-2] 取下一单调 epoch(见 taskEpochs 字段注)。取值优先级: 跨代计数器 > 当前
   *  runtime epoch > 0; 写入经 numberMapFifoSet 有界化。private 但以纯逻辑(零 DB/零 IO)
   *  供临时验证脚本经实例直测 */
  private nextEpochFor(taskId: string, rt: Pick<TaskRuntime, 'epoch'>): number {
    const next = (this.taskEpochs.get(taskId) ?? (rt.epoch || 0)) + 1
    numberMapFifoSet(this.taskEpochs, taskId, next, 512)
    return next
  }

  /** R4-8: per-task status 串行写 —— 把 db.task.update(status:...) 串到 prev 链尾,
   *  保证旧 controlInner(可能已 Promise.race 超时)的写必先完成、新 controlInner 的写后发,
   *  提交序与调用序一致。失败(如 P2025 任务已删)透传给调用方。
   *
   *  R8-13: 给链上每步加 30s 超时 —— 旧实现 prev 永不 settle(SQLite busy lock 卡死)时,
   *  本步永远不执行, 所有后续 control 入队但不动, 内存累积无界。修法: 用 Promise.race 给 prev
   *  加 30s 超时(超时则跳过等待, 继续执行本步); db.task.update 本身也加 30s 超时(超时跳过本步,
   *  继续链; 链上后续步骤可以继续推进, 避免链死锁)。 */
  private async serializeStatusWrite(taskId: string, status: string): Promise<void> {
    const STEP_TIMEOUT_MS = 30_000
    const prev = this.dbStatusChains.get(taskId) ?? Promise.resolve()
    // R9-d-2: 定时器句柄必须持有并在 race 定局后 clearTimeout —— 旧实现两个 30s 定时器
    // (prev 等待超时 + db.update 超时)从不清理: ① 每次调用都遗留一个 30s 才触发的定时器
    // (且未 unref 的分支会拖住进程退出); ② 前置链超时定时器的回调在【prev 已正常完成】时
    // 照样触发, 每次状态写 30s 后都打出一条"30s 未完成"的虚假 warn 日志(日志噪音污染)。
    // 现改为句柄持有 + race 定局(finally)统一清理, 正常路径零残留、零虚假日志
    let prevTimer: ReturnType<typeof setTimeout> | undefined
    let stepTimer: ReturnType<typeof setTimeout> | undefined
    try {
      // R8-13: 给 prev 加 30s 超时 —— 不论 prev resolve 还是 reject, 都归为 undefined 继续本步;
      // 若 prev 在 30s 内未 settle(SQLite busy), 跳过等待(已 log warn), 继续执行本步
      const prevWithTimeout: Promise<void> = Promise.race([
        prev.then(() => undefined, () => undefined),
        new Promise<void>((resolve) => {
          prevTimer = setTimeout(() => {
            console.warn(`[runner] serializeStatusWrite 前置链 30s 未完成, 跳过等待 task=${taskId} status=${status}`)
            resolve()
          }, STEP_TIMEOUT_MS)
          if (typeof prevTimer.unref === 'function') prevTimer.unref()
        }),
      ])
      const next = prevWithTimeout.then(
        () => Promise.race([
          db.task.update({ where: { id: taskId }, data: { status } }),
          new Promise<never>((_, reject) => {
            stepTimer = setTimeout(
              () => reject(new Error(`serializeStatusWrite db.task.update 30s timeout`)),
              STEP_TIMEOUT_MS,
            )
            if (typeof stepTimer.unref === 'function') stepTimer.unref()
          }),
        ]).catch((e: any) => {
          if (e?.code === 'P2025') return // 任务已删, 写无处可去, 视作正常终态
          // R8-13: 超时不视为硬错误, 跳过本步继续链(防链死锁); 其他错误透传给调用方
          if (String(e?.message || e).includes('timeout')) {
            console.warn(`[runner] serializeStatusWrite db.task.update 30s 超时, 跳过 task=${taskId} status=${status}`)
            return
          }
          throw e
        }),
      )
      // tail 不抛错防链断: 调用方通过 await next 收到错误; 链尾只负责串行化顺序
      const tail = next.catch(() => {})
      this.dbStatusChains.set(taskId, tail)
      void tail.then(() => {
        if (this.dbStatusChains.get(taskId) === tail) this.dbStatusChains.delete(taskId)
      })
      await next
    } finally {
      // R9-d-2: race 定局即清理两个超时定时器(正常完成/超时/异常路径统一收口)
      if (prevTimer) clearTimeout(prevTimer)
      if (stepTimer) clearTimeout(stepTimer)
    }
  }

  /**
   * R9-d-1: 崩溃路径统一状态落库 —— 把"异常终止 → status:'error'"的写走 serializeStatusWrite
   * 串行链, 并尊重操作员意图: 用户已显式 stop(明确终止意图, R3-14 口径)或 pause(保留可恢复态)
   * 时不覆写为 error(旧实现无条件写 error 会把用户的 stopped 覆盖掉, autoRefresh 又把已被
   * 手动停止的任务拉起来跑, 与操作意图相反)。任务行已删(P2025)由链内静默容忍。
   */
  private async serializeCrashStatus(taskId: string): Promise<void> {
    const rt = this.runtimes.get(taskId)
    if (rt && (rt.stopped || rt.paused)) return // 操作员已表态: 不降级为 error
    await this.serializeStatusWrite(taskId, 'error')
  }

  /** [R9-cl-4] 整合: 书籍状态分流三处重复(连载复查末章未变/跨源去重/本书完成)—— 完结入
   *  completedBookUrls 并清理连载记忆; 否则按 ongoing 处理(unknown 仍可能后续新增章节, 谨慎跟踪)
   *  入 ongoingBookUrls 并记录末章 URL。dirty 标志与原三处一致(仅末章 URL 实际写入时置 dirtyLastChapters;
   *  R8-5 语义不变)。三处原分支逐行比对等价后合并, 调用点传入各自的末章 URL 取值源 */
  private shuntBookStatus(
    rt: TaskRuntime,
    bookUrl: string,
    detectedStatus: 'completed' | 'ongoing' | 'unknown',
    lastChapterUrl: string | undefined,
  ): void {
    if (detectedStatus === 'completed') {
      rt.completedBookUrls.add(bookUrl)
      rt.ongoingBookUrls.delete(bookUrl)
      rt.bookLastChapters.delete(bookUrl)
      rt.dirtyCompleted = true
      rt.dirtyOngoing = true
      rt.dirtyLastChapters = true // R8-5: mark dirty
    } else {
      rt.ongoingBookUrls.add(bookUrl)
      if (lastChapterUrl) rt.bookLastChapters.set(bookUrl, lastChapterUrl)
      rt.dirtyOngoing = true
      if (lastChapterUrl) rt.dirtyLastChapters = true // R8-5: mark dirty
    }
  }

  static get instance(): TaskRunner {
    if (!globalForRunner.__novelTaskRunner) {
      globalForRunner.__novelTaskRunner = new TaskRunner()
    }
    return globalForRunner.__novelTaskRunner
  }

  /** autoRefresh 开启且任务处于终态时, delayMin 分钟后自动重新采集(jj-e 实时更新) */
  scheduleAutoRefresh(taskId: string, delayMin: number, taskName = '') {
    this.cancelAutoRefresh(taskId)
    // R3-35: 钳制 delayMin 到 [5, 1440] 分钟 —— 防误配 0(立即无限触发循环)或 >1440(>1天
    // 极少刷新)。原实现 Math.max(0, ...) 仅下限 0, 配置 0.01 → 600ms 循环触发, 高频打 hostGate
    // + DB 反复 update → 自伤站点。下限 5 分钟与正常采集批次间隔同量级, 上限 1 天防止定时器
    // 在长生命周期内永久驻留。autoRefresh 自愈语义不变(站点改版场景 5 分钟足够冷启动一次)
    const clampedMin = Math.max(5, Math.min(1440, Math.round(delayMin)))
    // [R36-2c-7] CRAWL_AUTOREFRESH_JITTER=1(缺省关)时触发时刻随机化 ±10%(见 jitterAutoRefreshMs 注)
    const ms = jitterAutoRefreshMs(Math.max(0, Math.round(clampedMin * 60_000)))
    const timer = setTimeout(async () => {
      this.refreshTimers.delete(taskId)
      // 触发时复核: 任务仍存在/autoRefresh 仍开/未在运行/仍处终态(期间被 stop/pause 则放弃)
      // R3-14: 同 recoverOnBoot, 'stopped' 不参与自动刷新(用户手动停止的明确意图, 不应
      // 被定时器拉回)。仅 done(自然完成)/error(异常终止) 触发自愈重采
      try {
        const t = await db.task.findUnique({ where: { id: taskId } })
        if (!t || !t.autoRefresh || this.isRunning(taskId) || !['done', 'error'].includes(t.status)) return
        await this.log(taskId, 'info', `⟳ 自动刷新触发, 重新开始采集「${t.name}」`)
        const res = await this.control(taskId, 'start')
        if (!res.ok) {
          await this.log(taskId, 'warn', `⟳ 自动刷新启动失败: ${res.message}`)
          // R9-d-10: 启动失败后重排一次同间隔定时, 自愈链闭环 —— 旧实现单发定时器失败即死
          // (典型: 触发时刻恰处熔断 60s 冷却窗口, control('start') 被拒), autoRefresh 从此
          // 失效直到进程重启, 违背"定时增量自愈"设计意图。重排会再次走上方复核
          // (任务被删/autoRefresh 关闭/已运行/状态非终态均自动放弃), 不会无限硬敲
          this.scheduleAutoRefresh(taskId, clampedMin, t.name)
        }
      } catch { /* 任务已删除等 */ }
    }, ms)
    // E1: unref 长延时定时器 —— autoRefresh 常为数十分钟到小时的延时, 不 unref 会阻止进程
    // 正常退出(Next.js dev 关闭/部署发 SIGTERM 时进程需等定时器到期才能退, 或强杀睡丢定时器)。
    // bun/node 的 timer.unref 语义: 事件循环空转时本定时器不计入活跃引用, 不阻止退出;
    // 触发时进程仍存活则照常 fire(scheduleAutoRefresh 仍在运行中被调用即如此)。Map 记录便于显式 cancel
    if (typeof timer.unref === 'function') timer.unref()
    this.refreshTimers.set(taskId, timer)
    if (taskName) {
      const label = clampedMin >= 1 ? `${clampedMin} 分钟` : `${Math.round(ms / 1000)} 秒`
      this.log(taskId, 'info', `⟳ 已排定自动刷新: ${label}后重新采集「${taskName}」`).catch(() => {})
    }
  }

  /** 清除自动刷新定时器(stop/delete/手动关闭时); E2: 同时尝试释放已终态 runtime 条目 */
  cancelAutoRefresh(taskId: string) {
    const timer = this.refreshTimers.get(taskId)
    if (timer) {
      clearTimeout(timer)
      this.refreshTimers.delete(taskId)
    }
    // E2: 任务删除/停止路径走到这里时 runtime 多为终态, 顺手释放(活跃任务保留 epoch/cooldown)
    this.disposeRuntime(taskId)
  }

  isRunning(taskId: string): boolean {
    return this.runtimes.get(taskId)?.running || false
  }

  /** E2: LRU 驱逐 —— runtimes Map 上限 200 条。超出时按插入序找最旧的【已终态】条目
   *  (running===false: 含 done/error/stopped) 驱逐; 活跃任务(running===true, 含 paused)
   *  永不驱逐(保留 epoch/cooldown/暂停态)。全部活跃时跳过(不阻塞插入)。
   *  R3-10: 原实现每次仅驱逐一条, 站群场景下大量任务终态时仍可能逐步涨至 200+ 触发持续
   *  分配开销。改为最多驱逐 50 条(或 10% cap), 一次性把当前批次终态条目都释放掉。
   *  另: paused 态条目若 lastActiveAt > 1h 未活跃(操作员忘记 resume/已不可恢复), 视为
   *  "僵尸暂停" 一并驱逐; lastActiveAt 缺失(老条目兼容)用 0 兜底立即驱逐 */
  private pruneRuntimesIfNeeded() {
    if (this.runtimes.size < 200) return
    const now = Date.now()
    const PAUSED_STALE_MS = 60 * 60 * 1000 // 1h
    let evicted = 0
    const MAX_EVICT = Math.max(50, Math.floor(this.runtimes.size * 0.1))
    for (const [k, rt] of this.runtimes) {
      if (evicted >= MAX_EVICT) break
      const last = rt.lastActiveAt || 0
      // [R22-f-2](Low) 修"僵尸暂停驱逐"永不触发的死分支: 旧判定 isPausedStale = rt.paused &&
      //  !rt.running && …, 但 control('pause') 只置 rt.paused 不清 rt.running(运行中任务的
      //  暂停态, running 保持 true 直至 stop/自然终态), !rt.running 恒假 → R3-10 注释宣称的
      //  "paused + 1h 未活跃一并驱逐"从未生效, 僵尸暂停条目可把 runtimes Map 顶到 200 上限
      //  后无候选可驱逐(全部 running=true)。修后仅以 paused + 1h 未活跃判定; 驱逐后操作员
      //  resume 走 control('start') 全新启动路径(从 progress 重建集合, 进度以最近检查点为准),
      //  语义等价可恢复
      const isPausedStale = rt.paused && (now - last) > PAUSED_STALE_MS
      // 优先驱逐无熔断冷却记忆的终态条目; 冷却中的终态条目也优先保留(60s 窗口短, 不碍 LRU)
      // R3-10: paused 态 + 1h 未活跃也驱逐(僵尸暂停, 操作员不会再来 resume)
      if (!rt.running && (!rt.circuitTrippedAt || (now - rt.circuitTrippedAt) >= CIRCUIT_COOLDOWN_MS) || isPausedStale) {
        this.runtimes.delete(k)
        evicted++
      }
    }
    // 全部活跃: 不驱逐(不强杀在跑任务), 待下次终态后自然驱逐
  }

  /** E2: 显式释放 runtime 条目 —— DELETE 路径(经 cancelAutoRefresh)与 stop 路径走到这里。
   *  仅在 task 已终态(running===false)且不在熔断冷却窗口内时释放; 活跃任务/冷却窗口保留。 */
  private disposeRuntime(taskId: string) {
    const rt = this.runtimes.get(taskId)
    if (!rt) return
    if (rt.running) return // 活跃任务(epoch/暂停态在用), 不释放
    if (rt.circuitTrippedAt && Date.now() - rt.circuitTrippedAt < CIRCUIT_COOLDOWN_MS) return // 冷却窗口内, 保留记忆
    this.runtimes.delete(taskId)
  }

  /** 恢复启动时标记: 之前running的任务标记为paused
   *  修复: 原实现被 stats 接口懒触发, 会把【本进程内刚合法启动】的任务也误判为重启孤儿强制暂停;
   *  现在每进程生命周期只执行一次, 且只回收 updatedAt 早于单例创建时刻的孤儿任务 */
  async recoverOnBoot() {
    const g = globalForRunner as unknown as { __novelRecoveredAt?: number }
    if (g.__novelRecoveredAt) return // 本进程已执行过(防 HMR 重触发误伤)
    try {
      const stale = await db.task.findMany({
        where: { status: 'running', updatedAt: { lt: new Date(this.createdAt - 10_000) } },
      })
      for (const t of stale) {
        await db.task.update({ where: { id: t.id }, data: { status: 'paused' } })
        await this.log(t.id, 'warn', '服务重启, 任务自动转入暂停状态, 可点击继续恢复采集')
      }
      // jj-e: 重启后恢复 autoRefresh 任务的定时刷新(进程内 timer 随进程消失; 终态任务重新排定)
      // R3-14: 排除 'stopped' —— 用户手动 stop 是明确意图(不希望任务再跑), 不应被
      // recoverOnBoot 自动重排定触发。原实现把 stopped 与 done/error 一视同仁地恢复
      // autoRefresh, 用户操作"停止任务"后只要 autoRefresh=true, 进程一重启就会立即被
      // 排定时器拉回来跑, 与用户意图相反。done/error 是自然终态/异常终态, 自愈行为合理
      const autoTasks = await db.task.findMany({
        where: { autoRefresh: true, status: { in: ['done', 'error'] } },
        select: { id: true, name: true, refreshIntervalMin: true },
      })
      for (const t of autoTasks) {
        this.scheduleAutoRefresh(t.id, t.refreshIntervalMin)
        await this.log(t.id, 'info', `⟳ 服务已重启, 自动刷新已恢复排定(${t.refreshIntervalMin} 分钟后重新采集)`).catch(() => {})
      }
      // Bug 8 修复: 成功标志必须在所有 DB 操作成功后才置位 —— 修前在进入 try 时即置位,
      // 若 findMany/update 抛错(表未建/磁盘故障), 标志已设为已恢复, 后续调用永远跳过(不重试)。
      // 现仅在全部成功后置位; catch 中不置位(留下次服务器重启或 API 调用重试)
      g.__novelRecoveredAt = Date.now()
    } catch { /* 表不存在等: 不置位标志, 留待下次重试 */ }
  }

  async log(taskId: string, level: 'info' | 'success' | 'warn' | 'error', message: string) {
    try {
      await db.taskLog.create({ data: { taskId, level, message: message.slice(0, 1500) } })
      // [R31-8-1] 修剪检查节流(写放大修复): 原实现每条日志都 count() —— 长任务按批进度打点
      // (≈1131 批/书)时计数查询与业务写入 1:1 放大。3000 条是软水位而非硬不变量, 现按 task
      // 30s 节流: 窗口内只 create 不 count/修剪(单条超限最多多留一个窗口量, 语义不变);
      // 先置时间戳防并发重复检查。日志创建路径零变化; restore/stats 等外部写入不依赖本节流。
      // 进程级 Map 挂 globalThis 防 dev HMR 多实例, FIFO 512 防 long-run 泄漏(numberMapFifoSet 同款)
      const g18 = globalThis as unknown as { __novelLogTrimLast_v1?: Map<string, number> }
      if (!g18.__novelLogTrimLast_v1) g18.__novelLogTrimLast_v1 = new Map()
      const trimLast = g18.__novelLogTrimLast_v1
      const nowMs = Date.now()
      if (nowMs - (trimLast.get(taskId) ?? 0) < 30_000) return
      while (trimLast.size >= 512) {
        const oldest = trimLast.keys().next().value
        if (oldest === undefined) break
        trimLast.delete(oldest)
      }
      trimLast.set(taskId, nowMs)
      // 限制日志量: 保留最近3000条
      const count = await db.taskLog.count({ where: { taskId } })
      if (count > 3000) {
        const oldest = await db.taskLog.findMany({
          where: { taskId },
          orderBy: { id: 'asc' },
          take: count - 3000,
          select: { id: true },
        })
        if (oldest.length) {
          await db.taskLog.deleteMany({ where: { id: { in: oldest.map((o) => o.id) } } })
        }
      }
    } catch { /* ignore */ }
  }

  async control(taskId: string, action: ControlAction): Promise<{ ok: boolean; message: string }> {
    // rr-c2 修复(control 状态写乱序): 并发 control(stop/start) 的 db.task.update 状态写
    // 不保证按调用序提交(SQLite 连接池多连接/busy 重试非FIFO), 探针 probe-rr-c2-control-race
    // 20 轮实锤 3 轮 update('stopped') 晚于 update('running') 提交 → 新一轮循环批次头
    // live.status==='stopped' DB 守卫自杀, 任务卡 stopped(verify-ll-c-runner Part4 的
    // 21/4 即此根因)。修法: 每 task 临界区串行化 —— 入队时机=调用时刻(同步, 先于任何
    // await), stop 的整段 body(含状态写+日志)完成后 start#2 才开始, 状态写调用序=提交序;
    // 与 ll-c epoch 双循环窗口修复互补(那边修内存 epoch 绑定, 这边修 DB 状态写序)。
    // 单次 control 失败不阻断后续(链上吞错); 尾 settles 自删 Map 项防长任务无界增长。
    // R3-13: controlInner 包裹 30s 超时 —— 原 controlInner 持有 db.task.update/日志写入
    // 与(在 start 路径)异步 executeTask 调度, 单次卡死(如 SQLite busy 锁等待)会让后续所有
    // control 串行卡在 prev.then 后, 任务永远停不下来也启不动。Promise.race 上限 30s,
    // 超时则当前 control reject, 链尾 catch 吞错后释放 → 下次 control 可正常入队执行
    const prev = this.controlChains.get(taskId) ?? Promise.resolve()
    // R9-d-2: 30s 超时定时器句柄持有 + race 定局后 clearTimeout —— 旧实现每次 control 调用
    // 都遗留一个存活的 30s 定时器(未 unref, 会拖住事件循环空转/延迟进程退出; 频繁控制操作
    // 时定时器线性堆积)。现 finally 统一清理, 正常路径零残留
    const inner = () => {
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined
      return Promise.race([
        this.controlInner(taskId, action),
        new Promise<never>((_, reject) => {
          timeoutTimer = setTimeout(() => reject(new Error('control timeout(30s)')), 30_000)
          if (typeof timeoutTimer.unref === 'function') timeoutTimer.unref()
        }),
      ]).finally(() => {
        if (timeoutTimer) clearTimeout(timeoutTimer)
      })
    }
    const run = prev.then(() => inner())
    const tail = run.catch(() => {})
    this.controlChains.set(taskId, tail)
    void tail.then(() => {
      if (this.controlChains.get(taskId) === tail) this.controlChains.delete(taskId)
    })
    return run
  }

  private async controlInner(taskId: string, action: ControlAction): Promise<{ ok: boolean; message: string }> {
    // [R42-1-1] include rule.config: start 分支的 needsProxy 自动匹配需读规则 fetch 段
    const task = await db.task.findUnique({ where: { id: taskId }, include: { rule: { select: { config: true } } } })
    if (!task) return { ok: false, message: '任务不存在' }
    const rt = this.runtimes.get(taskId) || {
      paused: false,
      stopped: false,
      running: false,
      epoch: 0,
      lastActiveAt: Date.now(),
      discoveredBookUrls: new Set<string>(),
      completedBookUrls: new Set<string>(),
      ongoingBookUrls: new Set<string>(),
      bookLastChapters: new Map<string, string>(),
      // R8-5: dirty flags 初始为 true(确保首次 saveProgress 落库, 即使集合为空也写入空状态)
      dirtyDiscovered: true,
      dirtyCompleted: true,
      dirtyOngoing: true,
      dirtyLastChapters: true,
    }
    // R3-10: 每次进入 controlInner 都更新 lastActiveAt, 供 pruneRuntimesIfNeeded 判定
    // "僵尸暂停"(paused + 1h 未活跃); 无 operation 直接 update 触发顺序避免 await 间隙
    rt.lastActiveAt = Date.now()

    switch (action) {
      case 'start': {
        // E4: 熔断冷却检查 —— 连续错误熔断后 60s 内拒绝重启(防操作员在故障源上硬胡重启
        // 立即再熔断); 冷却过后放行, autoRefresh 路径(复核终态后调 control('start'))同样适用
        if (rt.circuitTrippedAt && Date.now() - rt.circuitTrippedAt < CIRCUIT_COOLDOWN_MS) {
          const wait = Math.ceil((CIRCUIT_COOLDOWN_MS - (Date.now() - rt.circuitTrippedAt)) / 1000)
          return { ok: false, message: `熔断冷却中，请 ${wait}s 后再试` }
        }
        if (rt.running) {
          if (rt.paused) {
            rt.paused = false
            await this.serializeStatusWrite(taskId, 'running')
            await this.log(taskId, 'success', '▶ 任务已恢复运行')
            return { ok: true, message: '已恢复' }
          }
          return { ok: false, message: '任务已在运行中' }
        }
        // 新启动(修复: stop→立刻 start 时, 旧一轮循环可能还卡在 fetch/sleep 里未退出,
        // 必须自增 epoch 让它自行终止, 否则新旧两个循环会并发采集同一任务)
        // [R36-2c-2] epoch 自增改走跨代单调计数器(taskEpochs): stop 路径 disposeRuntime
        //  已删除 runtime 条目, 旧写法在新对象上从 1 重新计数会与在途旧循环的 myEpoch 碰撞
        //  (碰撞后果见 taskEpochs 字段注); 单调计数器保证新旧两代 epoch 严格不同
        rt.epoch = this.nextEpochFor(taskId, rt)
        rt.running = true
        rt.paused = false
        rt.stopped = false
        // E4: 新一轮 start 重置熔断记忆 —— 上一轮已结束(可能熔断/可能正常完成), 新轮从头计连续错误;
        // 若新轮再次熔断会重新打 circuitTrippedAt。冷却检查只在 start 入口做(本函数顶部),
        // 换代后旧循环不会再次走 start 路径, 重置不破坏冷却语义
        rt.circuitTrippedAt = undefined
        this.runtimes.set(taskId, rt)
        // E2: LRU 上限保护 —— runtimes Map 长期累积终态任务条目无上限增长(任务历史从执行, 后续不再运行),
        // 插入新条目后检查是否超 200, 超过则驱逐最旧的已终态条目(running===false 的 epoch/cooldown)
        this.pruneRuntimesIfNeeded()
        await this.serializeStatusWrite(taskId, 'running')
        // [R42-1-2] 免费代理池自动匹配(needsProxy): 规则/任务标记 needsProxy 且未显式配
        //  proxyUrl 时, 启动前从 FreeProxy 表按 国别/协议/健康分 挑选代理写回任务
        //  fetchConfig.proxyUrl(持久化, 下次启动重选 → 死池自动换新); 池空则告警直连降级
        //  (不阻断启动)。懒激活代理池自动保鲜循环(60s 心跳按 Setting 周期 harvest+check)
        try {
          ensurePoolAutoLoop()
          const ruleFetch = parseRuleConfig(task.rule?.config || '{}').fetch || {} as Partial<FetchConfig>
          const startOverride = parseFetchOverride(task.fetchConfig)
          const startMerged = { ...ruleFetch, ...startOverride }
          if (startMerged.needsProxy === true && !startMerged.proxyUrl) {
            const ccLabel = startMerged.proxyCountries ? `(国别:${startMerged.proxyCountries})` : ''
            const picked = await pickProxiesForRule({ proxyCountries: startMerged.proxyCountries })
            if (picked) {
              await db.task.update({
                where: { id: taskId },
                data: { fetchConfig: JSON.stringify({ ...startOverride, proxyUrl: picked }) },
              })
              await this.log(taskId, 'success', `🔗 代理池自动匹配 ${picked.split(',').length} 条出口代理${ccLabel} → 任务 fetchConfig.proxyUrl`)
            } else {
              await this.log(taskId, 'warn', `⚠ needsProxy 已开启但代理池暂无可用代理${ccLabel}, 直连降级启动; 可到「代理池」页抓取+验证后再重启`)
            }
          }
        } catch (e) {
          await this.log(taskId, 'warn', `代理池匹配异常(直连降级): ${(e as Error)?.message?.slice(0, 140)}`).catch(() => {})
        }
        // [R34-2a-5] 模式文案三元扩映射: single/range 既有文案不变, bookIds 显示 书号×N(N=去重后书号数);
        //  unknown 值防御性回退原样显示(与前端 taskModeLabel 同口径)
        // [R35-2a-5] bookIds 范围形式(bookIdFrom/bookIdTo 均非空)优先显示 书号范围{from}-{to};
        //  此时列表为空, 既有 书号×N 文案会误导为 书号×0, 故由范围文案取代(非法值防御: 非数字/空串均回退列表文案)
        const bookIdRangeLabel = (() => {
          if (task.mode !== 'bookIds') return ''
          const f = String((task as { bookIdFrom?: string }).bookIdFrom ?? '').trim()
          const t = String((task as { bookIdTo?: string }).bookIdTo ?? '').trim()
          return f && t && parseBookIdRange(f, t).ok ? `书号范围${f}-${t}` : ''
        })()
        const modeLabel = task.mode === 'single'
          ? '单本'
          : task.mode === 'range'
            ? '范围'
            : task.mode === 'bookIds'
              ? (bookIdRangeLabel || `书号×${parseBookIdList(task.bookIds).length}`)
              : task.mode
        await this.log(taskId, 'success', `▶ 任务启动 [${task.name}] 模式:${modeLabel} 重采:${task.recrawlMode === 'full' ? '完全覆盖' : '增量更新'} 存储:${task.storageMode === 'db' ? '数据库' : 'TXT文件'} 线程:${task.threadMin}~${task.threadMax} 间隔:${task.intervalMin}~${task.intervalMax}ms`)
        // 异步执行, 不阻塞API
        this.executeTask(taskId).catch(async (e) => {
          await this.log(taskId, 'error', `任务异常终止: ${e?.message || e}`)
          // R9-d-1: 崩溃兜底路径的状态写同样必须走 serializeStatusWrite 串行链 —— 旧实现直接
          // db.task.update('error'), 与并发 control(stop) 的链上状态写提交序不定, 停止写可能被
          // 崩溃写晚提交覆盖(用户点了停止, DB 却显示 error)。且用户已显式 stop/pause 时不再覆写
          await this.serializeCrashStatus(taskId).catch(() => {})
        })
        return { ok: true, message: '已启动' }
      }
      case 'pause': {
        if (!rt.running) return { ok: false, message: '任务未在运行' }
        rt.paused = true
        await this.serializeStatusWrite(taskId, 'paused')
        await this.log(taskId, 'warn', '⏸ 任务已暂停')
        return { ok: true, message: '已暂停' }
      }
      case 'stop': {
        rt.stopped = true
        rt.paused = false
        rt.running = false
        // R3-11: 显式重置熔断冷却记忆 —— 用户手动 stop 是明确意图, 与熔断不同(后者是
        // 上游故障触发的被动中止), 不应让用户在 60s 内无法 restart。原实现保留记忆
        // 导致 stop 后立即 restart 会被 E4 冷却检查拦截("熔断冷却中"提示), 与"我手动
        // 停下, 想立刻再启"的用户预期不符
        rt.circuitTrippedAt = undefined
        this.runtimes.set(taskId, rt)
        // jj-e: 手动停止视为用户明确意图, 同时取消已排定的自动刷新
        this.cancelAutoRefresh(taskId)
        await this.serializeStatusWrite(taskId, 'stopped')
        await this.log(taskId, 'warn', '⏹ 任务已停止(自动刷新已取消)')
        return { ok: true, message: '已停止' }
      }
    }
  }

  /** 每批次从DB读取最新任务配置(支持在线调节线程/间隔/模式) */
  private async loadConfig(taskId: string) {
    const task = await db.task.findUnique({ where: { id: taskId }, include: { rule: true } })
    if (!task) return null
    return {
      task,
      rule: parseRuleConfig(task.rule.config),
      fetchOverride: parseFetchOverride(task.fetchConfig),
      threads: () => randInt(clampMin(task.threadMin, task.threadMax), task.threadMax),
      interval: () => randInt(clampMin(task.intervalMin, task.intervalMax), task.intervalMax),
    }
  }

  // ================== 主执行流 ==================
  /** [R18-c-3] 重启恢复对账包装: 把 rt 三组续采 Set 与 Book 表对账, 剔除库中实际不存在
   *  (或完结语义但 0 章节空壳)的 URL, 让列表重新发现时重新入队采集 —— 修"重启后跳过而
   *  不续采"。一次性成本(分批 ≤RESUME_RECONCILE_BATCH 条 IN 查询, SQLite 本地毫秒级),
   *  不在消费点逐条查库。fail-open: 对账抛错时保留原 Set 仅 log warn, 绝不因对账挂掉任务;
   *  剔除发生时置对应 dirty 标志, 下一次 saveProgress 把对账后状态落库(下次重启不再对
   *  陈旧 progress 重复做同一批剔除, 幂等无害但落库更干净)。 */
  private async reconcileResumeSetsWithDb(taskId: string, rt: TaskRuntime): Promise<void> {
    const before = {
      discovered: rt.discoveredBookUrls.size,
      completed: rt.completedBookUrls.size,
      ongoing: rt.ongoingBookUrls.size,
    }
    let outcome: ReconcileOutcome
    try {
      outcome = await reconcileResumeSetsCore(
        {
          discovered: rt.discoveredBookUrls,
          completed: rt.completedBookUrls,
          ongoing: rt.ongoingBookUrls,
          lastChapters: rt.bookLastChapters,
        },
        async (batch) => {
          const rows = await db.book.findMany({
            where: { sourceUrl: { in: batch } },
            select: { sourceUrl: true, _count: { select: { chapters: true } } },
          })
          return rows.map((r) => ({ sourceUrl: r.sourceUrl, chapterCount: r._count.chapters }))
        },
      )
    } catch (e: any) {
      await this.log(
        taskId,
        'warn',
        `DB 对账失败(保留原续采集合继续, 库中缺书仍会被跳过): ${e?.message?.slice(0, 160)}`,
      ).catch(() => {})
      return
    }
    if (outcome.removedUrls.length === 0) return
    // 剔除生效 → 置 dirty 让下一次 saveProgress 落库对账后状态
    if (outcome.removedFrom.discovered > 0) rt.dirtyDiscovered = true
    if (outcome.removedFrom.completed > 0) rt.dirtyCompleted = true
    if (outcome.removedFrom.ongoing > 0) rt.dirtyOngoing = true
    if (outcome.removedFrom.lastChapters > 0) rt.dirtyLastChapters = true
    await this.log(
      taskId,
      'info',
      `DB 对账: 剔除 ${outcome.removedUrls.length} 本库中已不存在/空壳的记录(将重新采集) ` +
        `[已发现 ${before.discovered}→${rt.discoveredBookUrls.size}, 已完结 ${before.completed}→${rt.completedBookUrls.size}, ` +
        `连载中 ${before.ongoing}→${rt.ongoingBookUrls.size}; 分 ${outcome.batches} 批查 ${outcome.queriedUrls} 个URL]`,
    ).catch(() => {})
    // 剔除明细前 8 条(URL 截 120 字符防单条日志超 1500 字符上限裁切)
    const preview = outcome.removedUrls.slice(0, 8).map((u) => u.slice(0, 120)).join(' , ')
    const more = outcome.removedUrls.length > 8 ? ` …等${outcome.removedUrls.length}条` : ''
    await this.log(taskId, 'info', `DB 对账剔除明细(前${Math.min(8, outcome.removedUrls.length)}条): ${preview}${more}`).catch(() => {})
  }

  private async executeTask(taskId: string) {
    // ll-c 修复(epoch 取消窗口): rt/myEpoch 绑定必须【同步在函数入口】完成 —— 原先在
    // await ensureDirs() + await loadConfig() 两个真实异步点(fs.mkdir×3/db 查询, 毫秒级)
    // 【之后】才读 rt.epoch, 此窗口内 stop→start#2(epoch++)会让旧循环绑定【新一轮】epoch,
    // isStale() 永假 → 新旧双循环并发采集同一任务(重复请求压力/建行冲突/进度互踩)。
    // control('start') 同步段先 runtimes.set 再调本函数, 入口 rt 必在; 与 jj-d
    // crawlOneBook 传入绑定同思路, 从根上关闭最后一个绑定窗口
    const rt = this.runtimes.get(taskId)
    if (!rt) return // control('start') 必先 set, 纯防御
    const myEpoch = rt.epoch
    // 本轮已作废判断: 新一轮 start 会自增 epoch, 旧循环在所有检查点看到漂移即退出
    const isStale = () => rt.epoch !== myEpoch
    // [R36-2c-3] 本循环是否仍持有活跃 runtime 条目: stop 路径 disposeRuntime 会把条目从
    //  runtimes 删除(旧循环闭包仍持 rt 引用), 紧接的 start 又会装入全新对象 —— 旧代收尾写
    //  (已停止进度落库/finally 清标志)必须避开新一代 runtime, 防旧代收尾覆写新循环的
    //  running 标志与续采集合(碰撞后果见 taskEpochs 字段注)
    const rtIsCurrent = () => this.runtimes.get(taskId) === rt
    // [R36-2c-3] 进度收尾写权判定: 本代 runtime 仍是条目(正常运行)→有写权; 条目已被接替
    //  (stop→start, 新循环在跑 isRunning=true)→无写权(进度权归新循环); 条目被删除且无新循环
    //  (普通 stop 收尾)→有写权(保留停止时刻最终进度落库的原语义)
    const progressOwned = () => rtIsCurrent() || !this.isRunning(taskId)
    // zz-d 修复(running 标志泄漏): ensureDirs/loadConfig 与 `!cfg` 提前返回原先都在下方
    // try 之外 —— 二者抛错(磁盘/DB 故障)或任务恰在启动窗口被删(loadConfig 返回 null)
    // 时 finally 不执行, rt.running 永久卡 true: 活任务后续 start 恒被"任务已在运行中"
    // 拒绝(只能手动 stop 解锁)。移入 try 由 finally 统一收尾(epoch 判定不变, 仅清本代
    // 标志); 抛错改走本函数自有 catch 落 error 终态, 终态语义与原 control('start') 外层
    // catch 一致(且经 isStale 门控, 不误伤换代后的新循环)
    let cfg: Awaited<ReturnType<TaskRunner['loadConfig']>> = null
    // Bug 25: done 写入标志 —— 修前 done 状态写成功后, 后续 saveProgress/autoRefresh 排定
    // 抛错会落到下方 catch 重写 status:'error', 把已完成任务降级为崩溃态(进度未丢但终态语义错乱,
    // autoRefresh 不再重排)。设标志: done 落库成功后置 true, catch 中仅 !doneWritten 时写 error
    let doneWritten = false
    try {
      await ensureDirs()
      cfg = await this.loadConfig(taskId)
      if (!cfg) return
      const progress: TaskProgress = { ...emptyProgress(), ...safeJson(cfg.task.progress) }
      const stats: TaskStats = { ...emptyStats(), ...safeJson(cfg.task.stats) }
      // feat-contentproxy-resume(范围任务续采): 从 progress 重建内存 Set; rt 是 control('start')
      // 创建的 TaskRuntime, 初始为空 Set(冷启动场景)。已运行过的任务从 DB progress 装载已发现/
      // 已采集 URL 列表 → Set, 让范围任务重启时按 Set 跳过已处理的书籍(免再抓书籍页/目录/正文)。
      // recrawlMode==='full' 任务启动时清空两 Set(完全覆盖重采语义: 用户明确要重采全部书籍);
      // 增量模式保留 Set 让续采只处理新增书籍(已发现未采完的书同被跳过 —— R18-c 已知边界
      // 留档: 在库连载书增量复查跨重启不触发, 与发现循环跳过同口径)
      if (cfg.task.recrawlMode === 'full') {
        rt.discoveredBookUrls = new Set<string>()
        rt.completedBookUrls = new Set<string>()
        rt.ongoingBookUrls = new Set<string>()
        rt.bookLastChapters = new Map<string, string>()
        progress.discoveredBookUrls = []
        progress.completedBookUrls = []
        progress.ongoingBookUrls = []
        progress.bookLastChapters = {}
        // R8-5: reset 后强制 dirty=true, 确保下一次 saveProgress 把空状态写入 DB
        rt.dirtyDiscovered = true
        rt.dirtyCompleted = true
        rt.dirtyOngoing = true
        rt.dirtyLastChapters = true
      } else {
        // 从 progress 恢复(数组 → Set); 数组非法/缺失时 Set 留空(冷启动零回归)
        const disc = Array.isArray(progress.discoveredBookUrls) ? progress.discoveredBookUrls : []
        const comp = Array.isArray(progress.completedBookUrls) ? progress.completedBookUrls : []
        rt.discoveredBookUrls = new Set(disc.filter((u) => typeof u === 'string' && u))
        rt.completedBookUrls = new Set(comp.filter((u) => typeof u === 'string' && u))
        // feat-combo-theme-incremental: 连载增量恢复 —— ongoingBookUrls + bookLastChapters
        const ongoing = Array.isArray(progress.ongoingBookUrls) ? progress.ongoingBookUrls : []
        rt.ongoingBookUrls = new Set(ongoing.filter((u) => typeof u === 'string' && u))
        const lastChapObj = (progress.bookLastChapters && typeof progress.bookLastChapters === 'object')
          ? progress.bookLastChapters as Record<string, string>
          : {}
        rt.bookLastChapters = new Map<string, string>()
        for (const [k, v] of Object.entries(lastChapObj)) {
          if (typeof k === 'string' && k && typeof v === 'string' && v) rt.bookLastChapters.set(k, v)
        }
        // R8-5: 恢复状态无需立即落库(数据未变), dirty=false 跳过下一轮序列化
        rt.dirtyDiscovered = false
        rt.dirtyCompleted = false
        rt.dirtyOngoing = false
        rt.dirtyLastChapters = false
        const totalResume = rt.discoveredBookUrls.size + rt.completedBookUrls.size + rt.ongoingBookUrls.size
        if (totalResume > 0) {
          await this.log(
            taskId,
            'info',
            `范围续采恢复: 已发现 ${rt.discoveredBookUrls.size} 本 / 已完结 ${rt.completedBookUrls.size} 本 / 连载中 ${rt.ongoingBookUrls.size} 本(从 task.progress 装载; 完结书整体跳过, 连载书增量检查新章节, 新书全量采)`,
          ).catch(() => {})
          // [R18-c-2] DB 对账: progress 集合可能与库脱节(上轮书籍入库失败/用户删书/库被
          // restore 回滚), 先剔除库中实际不存在的 URL 再进发现阶段 —— 否则 L759 发现跳过
          // 会把"库里没有的书"永远跳过(用户报告: 重启后不续采而是跳过)。fail-open: 对账
          // 失败保留原 Set, 不因对账把任务搞崩
          await this.reconcileResumeSetsWithDb(taskId, rt)
        }
      }
      // ---------- 发现书籍URL ----------
      let bookQueue: string[] = []
      // ll-c2: 列表页已提取的书籍字段随行保存(key=absolutized bookUrl) — 部分源站 detail
      // 端点不稳定(番茄聚合API 2026-09-02 实测 data.data 空对象), detail 字段全空时不至于
      // 落到 URL 片段书名(修前入库《api/detail》); single 模式无列表字段, 兜底链零回归
      const listFields = new Map<string, { name?: string; author?: string; intro?: string; category?: string }>()
      if (cfg.task.mode === 'single') {
        bookQueue = [cfg.task.bookUrl]
        progress.discovered = 1
        await this.log(taskId, 'info', `单本模式: ${cfg.task.bookUrl}`)
      } else if (cfg.task.mode === 'bookIds') {
        // [R34-2a-5] 书号采集: 解析 task.bookIds(书号原文) → 逐个渲染书籍页 URL 模板
        //  ({bookId} → encodeURIComponent(书号)) → 灌 bookQueue。进度分母 progress.booksTotal
        //  在下方按 bookQueue.length 自然计算, 零额外适配。续采语义与 single 同口径
        //  (不写 discoveredBookUrls); 重启增量时已完结书仍被下方 completedBookUrls 检查
        //  整体跳过, 连载书走增量复查, 重复书号已在 API 规范化层去重
        // [R35-2a-5] 范围形式优先: bookIdFrom/bookIdTo 均非空 → parseBookIdRange 校验合法后
        //  buildBookIdQueueFromRange 展开为数字序列渲染模板灌 bookQueue(渲染后 Set 去重保序);
        //  非法(恢复导入/API 直建等绕过路径, 正常入库已被 validateTaskPair 拦截)warn 后回落
        //  下方既有书号列表路径(逐字节零变化); 两端点均空也走列表路径(R34 既有语义)
        const template = (cfg.task.bookUrl || '').trim()
        const rawFrom = String((cfg.task as { bookIdFrom?: string }).bookIdFrom ?? '').trim()
        const rawTo = String((cfg.task as { bookIdTo?: string }).bookIdTo ?? '').trim()
        const range = rawFrom && rawTo ? parseBookIdRange(rawFrom, rawTo) : null
        if (range?.ok) {
          bookQueue = buildBookIdQueueFromRange(range.from, range.to, template)
          progress.discovered = bookQueue.length
          // 防呆日志(与列表路径三连同型; API 校验已拦, 此处兜底绕过路径)
          if (!template) {
            await this.log(taskId, 'warn', '书号采集: 书籍页URL模板为空, 无书籍可采集(请补全模板后重跑)')
          } else if (!template.includes(BOOK_ID_PLACEHOLDER)) {
            await this.log(taskId, 'warn', `书号采集: 书籍页URL模板缺少 ${BOOK_ID_PLACEHOLDER} 占位符, 书号无法注入, 队列将折叠为单一字面地址: ${template.slice(0, 160)}`)
          }
          if (bookQueue.length === 0) {
            await this.log(taskId, 'warn', '书号采集: 范围展开后为空, 无书籍可采集')
          } else {
            await this.log(taskId, 'success', `书号采集(范围): ${range.from}-${range.to} 共 ${bookQueue.length} 本书待采集`)
          }
        } else {
          if (range && !range.ok) {
            await this.log(taskId, 'warn', `书号采集: 书号范围非法(${range.error}), 回落按书号列表解析`)
          }
          // [R34-2a-5] 既有书号列表路径([R35-2a-5] 逐字节零变化)
          bookQueue = buildBookIdQueue(cfg.task.bookIds, template)
          progress.discovered = bookQueue.length
          // 防呆日志(API 校验已拦, 此处兜底 API 直建/恢复导入等绕过路径)
          if (!template) {
            await this.log(taskId, 'warn', '书号采集: 书籍页URL模板为空, 无书籍可采集(请补全模板后重跑)')
          } else if (!template.includes(BOOK_ID_PLACEHOLDER)) {
            await this.log(taskId, 'warn', `书号采集: 书籍页URL模板缺少 ${BOOK_ID_PLACEHOLDER} 占位符, 书号无法注入, 队列将折叠为单一字面地址: ${template.slice(0, 160)}`)
          }
          if (bookQueue.length === 0) {
            await this.log(taskId, 'warn', '书号采集: 书号列表为空(或全部无效), 无书籍可采集')
          } else {
            await this.log(taskId, 'success', `书号采集: 模板解析完成, 共 ${bookQueue.length} 本书待采集`)
          }
        }
      } else {
        progress.phase = 'discovery'
        progress.phaseNote = '正在解析列表页…'
        await this.saveProgress(taskId, progress, stats)
        const listRule = cfg.rule.list
        const urls: string[] = []
        // [R12-a-2] 修复(High): 列表 URL 模板取值优先级改为 任务 listUrl > 规则 urlTemplate。
        //  修前 task.listUrl 是"幽灵字段": 任务向导强制要求填写(校验文案"范围模式必须填写
        //  列表页URL(含{page})"), 但发现循环只读规则模板 —— 操作员在任务里填了正确的新
        //  形态 URL(如 pilishuwu 筛选段分页), 实际抓取仍走规则里的旧模板(用户实测: 日志
        //  出现字面 {cat}/list/1.html)。任务级覆盖是该字段的存在意义, 此前从未生效。
        //  兼容: 历史任务存量的 %7Bpage%7D/%7Boffset:N%7D 编码形态(此前 httpUrl 过度编码
        //  所致)在下方展开时双形态同认, 无需修数据即恢复
        // {page}=页号原值; {offset:N}=第p页的列表偏移量(p-1)*N(cc-c: 番茄聚合API
        // searchUrl 用 offset=(page-1)*10 分页, {page} 无法表达算术偏移)
        const rawTemplate = (cfg.task.listUrl?.trim() || listRule.urlTemplate || '')
          // 双形态展开(cc-b: 展开必须先于一切; {page} 与编码形态 %7Bpage%7D 等价,
          // {offset:N} 另有冒号编码 %3A 形态, 与测试端点 expandListPlaceholders 同口径)
          .replace(/\{offset:(\d+)\}/gi, (_, n: string) => `{offset:${Math.max(1, parseInt(n, 10) || 1)}}`)
          .replace(/%7Boffset(?:%3A|:)(\d+)%7D/gi, (_, n: string) => `{offset:${Math.max(1, parseInt(n, 10) || 1)}}`)
          .replace(/%7Bpage%7D/gi, '{page}')
        // [R12-a-3] 防呆: 展开分页占位符后模板仍残留 {xxx}/%7Bxxx%7D 形态(如 {cat} 等
        //  非引擎占位符), 意味着操作员期望"按分类替换"但引擎只认 {page}/{offset:N} ——
        //  原先会拿字面 {cat} 静默请求源站(用户实测日志即此形态), 这里一次性告警点破。
        //  只查花括号对(含编码形态), 不误伤路径中合法的百分号编码(%E4%B8%AD 等)
        if (/\{[^{}]*\}|%7B[^%]*%7D/i.test(rawTemplate.replace(/\{page\}|\{offset:\d+\}/g, ''))) {
          await this.log(taskId, 'warn', `列表URL模板含引擎不识别的占位符(仅支持 {page}/{offset:N}): ${rawTemplate.slice(0, 160)} —— 请将 {cat} 等手工替换为具体值`)
        }
        // [R22-f-5] 防呆: 双来源模板均为空(任务向导强制范围模式填 listUrl, 但 API 直建任务/
        //  规则缺 list 段时可达 —— parseRuleConfig 缺省 list.urlTemplate='')。发现循环每页
        //  url='' 走 continue 空转(零请求零日志), 任务静默"发现 0 本"难以排查, 此处点破
        if (!rawTemplate) {
          await this.log(taskId, 'warn', '列表URL模板为空(任务 listUrl 与规则 urlTemplate 均未配置), 发现阶段无 URL 可抓, 请补全后重跑')
        }
        // R9-d-3: 单轮发现上限熔断 —— listStart/listEnd 允许配置到 100000 页, 极端配置下
        // urls/listFields/discoveredBookUrls 三个集合无上限增长(2M 书 × ~100B ≈ 数百 MB 堆),
        // 且发现阶段不可中断收尾。达上限即停止翻页并落库已发现部分(继续走采集阶段, 可通过
        // bookStart/bookEnd 或续采分批处理余量), 防内存无界。量级: 500000 × 100B ≈ 50MB 安全余量
        const DISCOVERY_MAX_URLS = 500_000
        // [R22-f-4] 连续空页熔断 —— 页码越过站点真实末页后源站通常返回"解析成功但 0 条书籍"
        //  的空列表页, 旧实现会把 listStart..listEnd 逐页请求到底(配置 10 万页 = 10 万次无效
        //  请求+日志), DISCOVERY_MAX_URLS 只计新增书籍数对全空页永不触发。连续 10 空页判定
        //  已越过末页, 提前终止翻页(已发现部分照常进入采集)。口径: 只按"当页解析出 0 条"
        //  计数, 不按"新增 0 本"计数 —— 续采轮 list 页全是已发现书籍(新增 0 但页面非空)不可
        //  误熔断; 抓取失败(404/网络/限流冷却恢复期)走逐页 error 路径不计数, 防误熔断
        const DISCOVERY_EMPTY_PAGE_BREAK = 10
        let consecutiveEmptyPages = 0
        // [R36-2c-5] 发现阶段连续抓取失败熔断 —— 修前抓取失败页只计 errors 不熔断, 死站
        //  + 大 listEnd(上限 10 万页)配置会逐页硬敲到底(每页一次超时级请求+错误日志);
        //  连续 20 页真失败(超时/HTTP 异常/连接拒绝; GlobalSemTimeout 引擎护栏豁免不计)
        //  判定源站不可用, 提前终止翻页(已发现部分照常进入采集, 同 R22-f-4 空页熔断语义)
        const DISCOVERY_FAIL_CIRCUIT = 20
        let consecutivePageFails = 0
        for (let p = cfg.task.listStart; p <= cfg.task.listEnd; p++) {
          if (rt.stopped || isStale()) break
          while (rt.paused && !rt.stopped && !isStale()) await sleep(600)
          if (rt.stopped || isStale()) break
          if (urls.length >= DISCOVERY_MAX_URLS) {
            await this.log(taskId, 'warn', `发现书籍数已达单轮上限 ${DISCOVERY_MAX_URLS}, 停止翻页(已发现的书籍继续采集; 余量请用 bookStart/bookEnd 或续采分批处理)`)
            break
          }
          const url = rawTemplate
            .replace(/\{offset:(\d+)\}/g, (_, n: string) => String((p - 1) * Math.max(1, parseInt(n, 10) || 1)))
            // [R15-d1b-3](Low) 改 replaceAll: 原 replace('{page}',...) 字符串形态只替换首个出现,
            // 模板中出现两次 {page}(如路径+查询串双段携带页号)时第二段残留字面 "{page}" 被原样
            // 请求源站; 上方占位符告警探针本就是全局剔除口径, 展开应与之一致
            .replaceAll('{page}', String(p))
          if (!url) continue
          try {
            // zz-b: 当页间隔取值同时作为同 host 准入最小间隔(逐页重新随机, 取值时机在请求前);
            // 列表页之间的既有 sleepGap(cfg.interval()) 保持每页独立随机, 节奏语义不变
            const pageGapMs = cfg.interval()
            const res = await this.gateFetch(taskId, url, buildFetch(cfg.rule, cfg.fetchOverride), { minGapMs: pageGapMs })
            await this.log(taskId, 'info', `列表页 P${p}: ${url} (引擎:${res.engine})`)
            // 修复: 真实站点规则(101kks/uukanshu/23qb/ixdzs8/5165)的列表书籍链接字段均命名
            // bookUrl 而非 url —— 原 ['url'] 单字段取法使列表页整库采集模式对全部真实规则
            // 静默失效(发现 0 本书)。双字段都做 absolutize, 取值时 url 优先 bookUrl 兜底
            const parsed = parseList(res.html, url, listRule, ['url', 'bookUrl'])
            consecutivePageFails = 0 // [R36-2c-5] 本页抓取+解析成功, 连败归零
            const pageUrls = parsed.items.map((i) => i.fields.url || i.fields.bookUrl).filter(Boolean)
            // feat-contentproxy-resume(范围任务续采): 已发现过的书籍 URL 不再加入 bookQueue
            // (节省后续书籍页/目录/正文抓取; 已采集过的书籍会被 completedBookUrls 跳过整本)
            // 本地 Set 用于本轮内去重(同一 URL 在多页/同页重复出现只入队一次); 跨任务重启时
            // 由 progress.discoveredBookUrls 装载。注意:"续采只处理新增书籍"是刻意口径 ——
            // 已发现未采完的书(含在库连载书的跨重启增量复查)同样被本跳过挡住, 属 R18-c
            // 已知边界留档(其 feat-combo-theme-incremental 增量复查跨重启不触发)
            let newlyDiscovered = 0
            let alreadyDiscovered = 0
            for (const u of pageUrls) {
              if (rt.discoveredBookUrls.has(u)) {
                alreadyDiscovered++
                continue
              }
              rt.discoveredBookUrls.add(u)
              urls.push(u)
              newlyDiscovered++
              rt.dirtyDiscovered = true // R8-5: mark dirty after mutation
            }
            // [R22-f-4] 空页计数与熔断(口径见上方常量注)
            if (pageUrls.length === 0) {
              consecutiveEmptyPages++
              if (consecutiveEmptyPages >= DISCOVERY_EMPTY_PAGE_BREAK) {
                await this.log(taskId, 'warn', `连续 ${consecutiveEmptyPages} 页列表无书籍(P${p}), 判定已越过站点末页, 提前终止翻页(已发现 ${urls.length} 本继续采集; 如需更多请检查 listUrl 模板与 listEnd 配置)`)
                break
              }
            } else {
              consecutiveEmptyPages = 0
            }
            for (const it of parsed.items) {
              const u = it.fields.url || it.fields.bookUrl
              if (!u || listFields.has(u)) continue
              if (it.fields.name || it.fields.author || it.fields.intro || it.fields.category) {
                listFields.set(u, { name: it.fields.name, author: it.fields.author, intro: it.fields.intro, category: it.fields.category })
              }
            }
            progress.discovered = urls.length
            await this.saveProgress(taskId, progress, stats)
            // 跳过日志用单条汇总, 避免万级 URL 逐条刷日志(每条 taskLog 落 SQLite + 上限 1500 字符裁切)
            const skipHint = alreadyDiscovered > 0 ? ` 跳过已发现 ${alreadyDiscovered} 本` : ''
            await this.log(taskId, 'success', `列表页 P${p} 发现 ${pageUrls.length} 本书籍 (新增 ${newlyDiscovered} 本${skipHint}, 累计待采${urls.length})`)
          } catch (e: any) {
            // [R31-3-1] GlobalSemTimeout 豁免(R30-3b 遗留①): fetchPage 入口全局并发信号量 30s
            //  等待超时是引擎侧拥塞而非源站故障 —— 与书籍页 catch 的 HostGateTimeout 既有豁免
            //  同口径不计 errors, 防多任务并行信号量打满时把健康任务的错误计数/熔断链喂脏。
            //  页面保持未抓取态, 重跑任务时发现循环自然重抓(可增量恢复)
            if (e?.name === 'GlobalSemTimeout') {
              await this.log(taskId, 'warn', `列表页 P${p} 引擎并发护栏等待超时(全局信号量), 页面保持未抓取; 稍后重跑可恢复`)
            } else {
              stats.errors++
              consecutivePageFails++ // [R36-2c-5]
              await this.log(taskId, 'error', `列表页 P${p} 抓取失败: ${e?.message}`)
              if (consecutivePageFails >= DISCOVERY_FAIL_CIRCUIT) {
                await this.log(taskId, 'error', `连续 ${consecutivePageFails} 页列表抓取失败(P${p}), 判定源站不可用, 提前终止翻页(已发现 ${urls.length} 本继续采集; 稍后重跑可恢复余量页)`)
                break
              }
            }
          }
          await sleepGap(cfg.interval(), rt, myEpoch)
        }
        // 书籍序号范围
        let sliced = urls
        if (cfg.task.bookStart > 0 || cfg.task.bookEnd > 0) {
          const s = Math.max(0, cfg.task.bookStart - 1)
          const e = cfg.task.bookEnd > 0 ? cfg.task.bookEnd : urls.length
          sliced = urls.slice(s, e)
        }
        bookQueue = Array.from(new Set(sliced))
        // [R31-5-3] P1-4(审计 OOM 报告): bookQueue 是独立新数组(Array.from), 构建完成后 urls
        //  与 sliced 同批 URL 双份驻留(50万URL × ~80B ≈ 40MB/份)至 executeTask 结束。全函数
        //  剩余读点均在本行之前(发现循环内 :1043/:1047 计数与切片 :1063-1067), 此后无读者;
        //  progress.discovered 计数发现期已落值不受影响 —— 就地清空释放一份冗余
        urls.length = 0
        // [R31-5-1] P1-1 残余剪除: bookStart/bookEnd 切片后未入队的书其列表字段永远无消费点
        //  (消费点只在下方书循环内 listFields.get(bookUrl)), 修前会滞留到 executeTask 结束
        //  (极端: 发现 50万 + bookEnd=100 → ~50万条 × ~300B ≈ 150MB 全程驻留)。一次性
        //  O(n) 剪除只留 bookQueue 成员; single 模式不进本分支(listFields 恒空)
        if (listFields.size > 0) {
          const queued = new Set(bookQueue)
          for (const k of listFields.keys()) {
            if (!queued.has(k)) listFields.delete(k)
          }
        }
        if (bookQueue.length === 0) {
          // [R36-2c-6] 0 本任务可观测: 修前 0 本与正常完成同文案(success 级), 操作员难以
          //  区分"真没书"与"配置错/规则字段不匹配"(parseList 只认 url/bookUrl 双字段)
          await this.log(taskId, 'warn', `范围发现完成: 0 本书待采集(请检查 listUrl 模板/listStart~listEnd/bookStart~bookEnd 配置, 及列表页规则字段是否为 url/bookUrl)`)
        } else {
          await this.log(taskId, 'success', `范围发现完成: 共 ${bookQueue.length} 本书待采集`)
        }
      }

      progress.booksTotal = bookQueue.length
      // jj-d: 书籍完成计数按轮归零 —— 修前跨轮累计(上一轮已完成的书计入本轮起点,
      // 重复运行的任务 booksDone 只增不减), TaskMonitor 计数标签会出现"书籍 2/1"
      // (Dashboard 进度条有钳制掩盖, 计数标签仍露馅); 每轮都从 bookQueue[0] 重跑, 归零才是真语义
      progress.booksDone = 0
      progress.phase = 'book'
      await this.saveProgress(taskId, progress, stats)

      // ---------- [R46-2a-1] 两阶段流水线: 元数据并发池(书籍+目录全入库) → 正文合并批量采集 ----------
      // [R36-2c-4] 书籍级连续失败熔断计数(语义同章节级 consecutiveErrs): 严格连续 —— 任一
      //  非失败结局(ok/deferred 之外的正常返回/跳过已完结)即归零; 停止/换代/引擎护栏超时
      //  (AbortError/HostGateTimeout/GlobalSemTimeout)不计入(引擎侧拥塞非源站故障)。
      //  并发池语义: 计数为共享变量(worker 并发推进下"严格连续"弱化为"窗口内连续", 熔断保护面不缩)
      let consecutiveBookErrs = 0
      for (let batchStart = 0; batchStart < bookQueue.length; batchStart += META_BATCH_SIZE) {
        if (rt.stopped || isStale()) break
        while (rt.paused && !rt.stopped && !isStale()) await sleep(600)
        if (rt.stopped || isStale()) break

        const batchSlice = bookQueue.slice(batchStart, batchStart + META_BATCH_SIZE)
        const deferredCtxs: BookCrawlCtx[] = []
        progress.phase = 'book'
        progress.phaseNote = `元数据阶段(书籍+目录): 第 ${Math.floor(batchStart / META_BATCH_SIZE) + 1} 批 ${batchSlice.length} 本(总进度 ${batchStart + batchSlice.length}/${bookQueue.length})`
        await this.saveProgress(taskId, progress, stats)

        // ===== 阶段1: 书级并发池跑 crawlOneBookMeta(书籍页+封面+建书+目录+章节记录) =====
        const metaPtr = { i: 0 }
        // 熔断在并发 worker 内不能直接 throw(Promise.all 会立即 reject, 其余 worker 的在途
        // 请求与收尾写库将与 executeTask 的 error 终态写竞态) —— 改为设置共享中止标志, 待
        // 全部 worker 自然退出后再上抛(与原串行 throw 的"executeTask catch 接管"终点一致)
        const metaAbort: { circuit: boolean; err: Error | null } = { circuit: false, err: null }
        const metaWorker = async () => {
          while (true) {
            if (rt.stopped || isStale() || metaAbort.circuit) return
            while (rt.paused && !rt.stopped && rt.epoch === myEpoch) await sleep(600)
            if (rt.stopped || rt.epoch !== myEpoch || metaAbort.circuit) return
            const bi = metaPtr.i++
            if (bi >= batchSlice.length) return
            const bookUrl = batchSlice[bi]

            // feat-contentproxy-resume + feat-combo-theme-incremental: 已完结书籍整体跳过
            // —— 仅 status==='completed' 的书才会进 rt.completedBookUrls(完结书不会再有新章节);
            // 连载中(status==='ongoing')的书在 rt.ongoingBookUrls 中, 不整体跳过, 走 crawlOneBookMeta
            // 的增量检查逻辑(抓目录→对比末章→无新章跳过/有新章增量采)。recrawlMode==='full' 启动时
            // 两 Set 已被清空, 此分支不触发(完全覆盖重采语义保留)
            if (rt.completedBookUrls.has(bookUrl)) {
              progress.booksDone++
              consecutiveBookErrs = 0 // [R36-2c-4] 跳过非失败, 连败计数归零
              progress.currentBook = bookUrl
              progress.phaseNote = `跳过已完结 (${bi + 1}/${bookQueue.length})`
              await this.log(taskId, 'info', `跳过已完结: ${bookUrl}`)
              // [R31-5-1] P1-1: 本分支不走 crawlOneBookMeta, 列表字段永远无消费点
              listFields.delete(bookUrl)
              await this.saveProgress(taskId, progress, stats)
              continue
            }

            // 每本书重新读配置(支持在线调整)
            cfg = await this.loadConfig(taskId)
            if (!cfg) return
            const rule = cfg.rule

            // [R31-5-1] P1-1(审计 OOM 报告) 生命周期论证: 列表字段条目的全部消费点在 crawlOneBookMeta
            //  内(形参 bookFields → 书名/简介/作者/分类兜底), 值在调用前已捕获到局部
            //  变量(对象引用), 此刻从 Map 删除条目不影响本次调用(引用链由实参维持); bookQueue
            //  同轮去重(Array.from(new Set))保证同 URL 不会二次入队, 删除后无任何后续读者。
            const bookFields = listFields.get(bookUrl)
            listFields.delete(bookUrl)

            try {
              progress.currentBook = bookUrl
              progress.phaseNote = `元数据采集 (${bi + 1}/${bookQueue.length})`
              await this.saveProgress(taskId, progress, stats)

              const { result: bookResult, ctx: bookCtx } = await this.crawlOneBookMeta(
                taskId, bookUrl, rule, cfg.fetchOverride, cfg.task, rt, myEpoch, progress, stats, cfg.interval, bookFields
              )
              if (bookResult === 'blocked' || bookResult === 'empty-toc') {
                // 跳过的书也计入已完成, 防 booksDone/booksTotal 进度条永远到不了头
                progress.booksDone++
                // [R36-2c-4] 拦截壳页计入书籍连败(请求成功但被反爬拦截, 与章节拦截同风险面);
                //  empty-toc 可能是合法空书(书号模式撞无效书号/无章节书), 不计入
                if (bookResult === 'blocked') consecutiveBookErrs++
                else consecutiveBookErrs = 0
              }
              // [R36-2c-4] 采集成功(含 deferred: 元数据就绪待正文)归零连败
              if (bookResult === 'ok' || bookResult === 'deferred') {
                consecutiveBookErrs = 0
              }
              // feat-combo-theme-incremental: 状态分流由 crawlOneBookMeta/finishBookOk 内部完成;
              // 'deferred' 书籍的 ctx 收集到本批正文池, 阶段2 统一跨书批量采
              if (bookResult === 'deferred' && bookCtx) {
                deferredCtxs.push(bookCtx)
              }
            } catch (e: any) {
              if (isStale()) {
                // jj-d: 本轮已被新一轮 start 取代(epoch 漂移) —— 进度/计数权归新循环, 旧循环
                // 在此只吞异常
              } else if (e?.isCircuitBreak) {
                // tt-c: 熔断 —— 并发池不立即 throw(见 metaAbort 注), 记标志待全 worker 退出后上抛
                metaAbort.circuit = true
                metaAbort.err = e
                return
              } else if (e?.isFetchTimeout) {
                // ee-d: 书籍页级 fetch 超时 —— 计失败+可见日志, 书籍保持未完成态, 稍后增量重试可恢复
                stats.errors++
                consecutiveBookErrs++ // [R36-2c-4]
                await this.log(taskId, 'error', `书籍抓取超时(源站在 timeout 内未响应, 书籍保持未完成): ${bookUrl.slice(0, 120)}`)
                await this.saveProgress(taskId, progress, stats)
              } else if (e?.name === 'AbortError' || e?.code === 'ABORT_ERR') {
                // 修复(x-a): stop/换代(abortAll)造成的在途中止不再计入失败
                await this.saveProgress(taskId, progress, stats)
              } else if (e?.name === 'HostGateTimeout' || e?.name === 'GlobalSemTimeout') {
                // bb-d/[R31-3-2]: 同站闸门槽满等待超时/全局信号量超时 —— 引擎侧拥塞非源站故障,
                // 不计 errors, 书籍保持未完成态, 稍后增量重试可恢复
                await this.log(taskId, 'warn', `书籍采集等待引擎并发护栏超时(${e?.name === 'GlobalSemTimeout' ? '全局信号量' : `host:${hostGateKeyOf(bookUrl) || '未知'}, 该站在飞已达上限`}): ${bookUrl}; 书籍保持未完成, 稍后增量重试可恢复`)
                await this.saveProgress(taskId, progress, stats)
              } else {
                stats.errors++
                consecutiveBookErrs++ // [R36-2c-4]
                await this.log(taskId, 'error', `书籍采集失败 ${bookUrl}: ${e?.message}`)
                await this.saveProgress(taskId, progress, stats)
              }
            }
            // [R36-2c-4] 书籍级连续失败熔断检查(每本末) —— 达阈值记标志停取新书
            if (consecutiveBookErrs >= BOOK_CIRCUIT_ERROR_LIMIT && !metaAbort.circuit) {
              rt.circuitTrippedAt = Date.now()
              await this.log(taskId, 'error', `🔴 熔断中止: 连续 ${consecutiveBookErrs} 本书采集失败(源站超时/抓取异常/拦截), 停止继续请求以保护站点与出口 IP; autoRefresh 任务将按计划自动重试; 60s 冷却期内手动重启将被拒绝`)
              await this.saveProgress(taskId, progress, stats)
              metaAbort.circuit = true
              metaAbort.err = new Error(`连续 ${consecutiveBookErrs} 本书采集失败, 触发书籍级连续错误熔断(阈值 ${BOOK_CIRCUIT_ERROR_LIMIT})`)
              ;(metaAbort.err as { isCircuitBreak?: boolean }).isCircuitBreak = true
              return
            }
            await sleepGap(cfg.interval(), rt, myEpoch)
          }
        }
        await Promise.all(Array.from({ length: Math.min(BOOK_META_CONCURRENCY, batchSlice.length) }, () => metaWorker()))
        // [R46-2a-1] 全 worker 退出后统一上抛熔断(终点与原串行 throw 一致: executeTask catch 转 error 终态)
        if (metaAbort.circuit && metaAbort.err) throw metaAbort.err

        // ===== 阶段2: 批内 deferred ctx 合并, 跨书批量并发采正文 =====
        // (任务被删时 loadConfig 恒 null → cfg 可能已为 null, 不再有能力采正文, 直接终止本批)
        if (deferredCtxs.length > 0 && cfg && !rt.stopped && !isStale()) {
          await this.log(taskId, 'info', `📦 批次正文阶段: 本批 ${deferredCtxs.length} 本书元数据已入库, 开始批量采集章节内容(${deferredCtxs.reduce((s, c) => s + c.queue.length, 0)} 章)`)
          const contentResult = await this.crawlBookContentsBatch(deferredCtxs, rt, myEpoch, progress, stats, cfg.threads, cfg.interval)
          if (contentResult === 'stopped') break
        }
      }

      // ---------- 结束 ----------
      if (isStale()) {
        // ee-d ⑤: 本轮已被新一轮 start 取代(epoch 漂移) —— 任务终态权(完成日志/状态/进度)
        // 全归新循环; 修前 rt.stopped 已被新一轮重置为 false, 旧循环在此误写"任务完成"+done
        // (运行中任务被旧循环误标完成的实证见 verify-ee-d-epoch.ts)
      } else if (rt.stopped) {
        // [R36-2c-3] stop→立即 start 场景: 条目已被新一代接替(rtIsCurrent 假 + isRunning 真),
        //  旧循环不得再写"已停止"进度(会用旧 progress 对象回滚新循环刚写的进度 JSON);
        //  普通 stop(条目已删且无新循环)保留原落库语义
        if (progressOwned()) {
          progress.phaseNote = '已停止'
          await this.saveProgress(taskId, progress, stats)
        }
      } else {
        progress.phase = 'done'
        progress.phaseNote = '任务完成'
        await this.log(taskId, 'success', `✅ 任务完成: 新书${stats.booksCreated} 更新${stats.booksUpdated} | 新章节${stats.chaptersCreated} 更新${stats.chaptersUpdated} | 封面${stats.coversSaved} | 下拉词${stats.suggestWords} | 错误${stats.errors}`)
        // zz-d 修复(终态覆写竞态): 完成日志与 done 状态写之间存在 await(saveProgress/log),
        // 期间用户 stop(写 status stopped+cancelAutoRefresh)或新一轮 start(epoch++)落地的
        // 话, 原实现仍无条件写 done 并按旧配置重排 autoRefresh —— 用户的"停止"被完成态
        // 覆盖 + 已取消的定时刷新复活。落笔前重查三个让位条件(与上方分支判定同口径)
        if (!rt.paused && !rt.stopped && !isStale()) {
          // R9-d-1: done 状态写同样走 serializeStatusWrite 串行链 —— 与并发 control(stop/pause)
          // 的状态写保证调用序=提交序(last-write-wins), 消除"完成写与停止写乱序提交"窗口;
          // P2025(任务被删)由链内静默容忍, 其余真 DB 故障上抛走崩溃路径落 error 终态(语义不变)
          await this.serializeStatusWrite(taskId, 'done')
          // Bug 25: done 落库成功 → 置标志, 下方 catch 不再覆盖为 error(后续 saveProgress/
          // autoRefresh 排定抛错仅是收尾噪声, 不应降级已完成任务的终态)
          doneWritten = true
          // jj-e: autoRefresh 开启 → 排定下一次自动采集(实时更新)
          if (cfg?.task.autoRefresh) {
            this.scheduleAutoRefresh(taskId, cfg.task.refreshIntervalMin, cfg.task.name)
          }
        } else if (rt.paused && !isStale()) {
          // [R22-f-3](Low) 队列恰好排空瞬间用户按下暂停: 上方三让位条件含 !rt.paused → 旧实现
          //  跳过 done 写且不留任何状态写, DB 停留 'running' 而循环已退出(内存 paused) ——
          //  幽灵 running 只能靠 ghost sweeper ≤5min 兜底回收为 paused。修后显式落 'paused'
          //  (尊重暂停意图, 终态即刻一致; epoch 漂移时不写, 终态权归新循环; stop 场景不进本
          //  分支 —— control('stop') 已置 rt.paused=false 且自写 'stopped')
          await this.serializeStatusWrite(taskId, 'paused').catch(() => {})
        }
        await this.saveProgress(taskId, progress, stats)
      }
    } catch (e: any) {
      // ee-d ⑤: 旧循环崩溃同样不得误标新一轮运行中的任务(epoch 漂移让位, 与结束块同权)
      // R9-d-1: rt.stopped/rt.paused 同样让位 —— 操作员已显式停止/暂停时, 崩溃不得把
      // 状态覆写为 error(旧实现把用户的"停止"覆盖成 error 后, autoRefresh 又把任务拉起,
      // 直接违背操作意图), 也不得重排自动刷新
      if (!isStale() && !rt.stopped && !rt.paused) {
        await this.log(taskId, 'error', `任务崩溃: ${e?.message || e}`)
        // Bug 25: done 已落库则不再覆盖为 error —— 修前 done 写成功后 saveProgress/autoRefresh
        // 排定抛错会落到本 catch 重写 error, 把已完成任务降级为崩溃态; 保留 done 终态语义,
        // 仅未完成时落 error(autoRefresh 仍按原逻辑在下面排定)
        // R9-d-1: error 写走 serializeStatusWrite 串行链(与并发 control 状态写定序)
        if (!doneWritten) {
          await this.serializeStatusWrite(taskId, 'error').catch(() => {})
        }
        // jj-e: autoRefresh 任务崩溃同样自动重试(实时更新的鲁棒性; 触发时会复核终态)
        try {
          if (cfg?.task.autoRefresh) this.scheduleAutoRefresh(taskId, cfg.task.refreshIntervalMin, cfg.task.name)
        } catch { /* cfg 可能未加载 */ }
      } else if (!isStale() && (rt.stopped || rt.paused)) {
        // R9-d-1: 操作员已让位场景仍要留痕(崩溃原因可查), 但不动状态、不排自动刷新
        await this.log(taskId, 'warn', `任务在${rt.stopped ? '停止' : '暂停'}后发生内部异常(状态未被覆写): ${e?.message || e}`).catch(() => {})
      }
    } finally {
      const r = this.runtimes.get(taskId)
      // 仅当仍是本轮运行时才清 running: 停止后立刻重启的场景下, 旧循环收尾不能抹掉新一轮的 running 标志
      // [R36-2c-3] 增加同代对象判定(r === rt): stop 经 disposeRuntime 删条目后, 紧接的 start
      //  装入全新 runtime 对象 —— 旧代 epoch 计数在新对象上重新从 1 起(跨代计数器修复前)
      //  或即使单调计数器生效后, 对象身份判定也能直接排除旧代收尾误清新代的可能:
      //  修前此处 r.epoch === myEpoch 会误命中新代(两代都是 1), 清掉新代 running 标志
      //  (isRunning 变假 → ghost sweeper 可能把在跑任务回收为 paused)并清空新代续采集合
      if (r && r === rt && r.epoch === myEpoch) {
        r.running = false
        // [R31-5-2] P1-2(审计 OOM 报告): 本轮循环已退出(epoch 未漂移 → 换代让位路径不走此处,
        //  不会踩新一轮的集合), 任务达终态(done/error/stopped)或已自然收尾 —— 四个续采大集合
        //  的全部读者(saveProgress/reconcileResumeSetsWithDb/shuntBookStatus)都只在循环生命期内
        //  运行, 此刻起无读者; 后续 control('start') 走 executeTask 从 DB progress 重建集合
        //  (full 清空/增量 reload), 与 R3-10 驱逐后 resume 同语义(进度以最近检查点为准)。
        //  修前条目滞留至 200 条 LRU 驱逐: 每条 runtime 持 3 Set + 1 Map, 50万书任务实测可达
        //  数百 MB 不释放(理论 200×4×50万×60B ≈ 2.4GB)。保留小标量(epoch/running/paused/
        //  stopped/circuitTrippedAt/lastActiveAt)供 isRunning/熔断冷却/僵尸暂停驱逐查询。
        //  dirty 标志一并落 false: 清空后的集合绝不能被后续 saveProgress 序列化覆盖 DB progress
        //  (终态后本无 saveProgress 调用点, 此处为防御性收口)
        r.discoveredBookUrls.clear()
        r.completedBookUrls.clear()
        r.ongoingBookUrls.clear()
        r.bookLastChapters.clear()
        r.dirtyDiscovered = false
        r.dirtyCompleted = false
        r.dirtyOngoing = false
        r.dirtyLastChapters = false
      }
    }
  }

  // ================== hostGate 同站闸门抓取 ==================
  /**
   * 过闸抓取: fetchPage 前对目标 host 执行 acquireHostGate(槽满等待, 上限30s),
   * 结束后 releaseHostGate —— try/finally 成对, 任务中止(AbortError)路径同样释放不泄漏槽位。
   * 抓取抛错/返回挑战页(且非合法 JSON 体, 与 bqg713 纯API站放行口径一致)计为该 host
   * 连续失败, 喂给降额机制; 命中降额时写 taskLog 观测日志。
   * 多任务并行时同 host 共享同一闸门(globalThis 单例账本)。
   * zz-b: 增 opts.minGapMs 透传 —— 同 host 相邻准入最小间隔(速率维), 与并发 limit
   * 双维独立生效; ab-b 收口: 指向采集目标站本身的全部调用点(列表/书籍/目录/翻页/章节批次)
   * 统一传当次随机 interval(逐次取值, 在线调参立即生效), 不再有"未传=0 瞬时解除节流"的缺口。
   * 429 感知: 响应体(blocked 壳页)含 429/rate limit/Too Many Requests 特征, 或抛错带
   * status===429(HTTP/auto 引擎以错误形态上抛 4xx)时, 走 reportHostRateLimited 限流冷却,
   * 不喂连败降额链; 403/验证码等其余特征维持降额链不变。冷却生效写 taskLog info 观测日志。
   * ab-b: 抛错路径透传 e.retryAfterMs —— fetcher 已在 HTTP 抛错对象上保留 Retry-After 头
   * 毫秒值(整数秒/HTTP 日期双形态解析), 服务端给多少歇多久; 头缺失/非法(以及返回路径的
   * blocked 壳页——体内容无头信息可抢救)仍 undefined → 30s 兜底。上限钳 120s 在 hostgate 侧。
   * 注(设计如此): 封面(fetchBinary 直连封面 CDN)与下拉词(fetchSuggestKeywords 外部搜索引擎)
   * 不指向采集目标站本身, 不经本闸门、无 minGapMs 语义。
   * 注: parser 内部翻页(toc/content pagination)经 FetchConfig.pageFetch 注入本函数
   * (bb-d), 翻页请求与章节抓取同享同一闸门账本; 仅 rules/test 测试路由保持直连。
   */
  private async gateFetch(taskId: string, url: string, cfg: Partial<FetchConfig>, opts?: { minGapMs?: number }): Promise<FetchResult> {
    // mm-b: 浏览器类桥模式(stealthy/playwright)自动钳制 hostGateLimit 至桥内信号量 3 ——
    // 桥内排队不提速只白占槽位; static/native 原值透传(详见 fetcher.effectiveHostGateLimit)
    const ticket = await acquireHostGate(url, { limit: effectiveHostGateLimit(cfg), minGapMs: opts?.minGapMs })
    try {
      const res = await fetchPage(url, cfg)
      if (res.blocked && parseJsonBody(res.html) === undefined) {
        // zz-b: 429 特征壳页 → 限流冷却而非连败降额(降额链只对 403/验证码等真拦截特征);
        // ab-b: 壳页路径无响应头可抢救, 维持缺省 → 30s 兜底(精确 Retry-After 走下方抛错路径)
        if (RATE_LIMIT_HINT_RE.test(res.html)) {
          if (reportHostRateLimited(url)) {
            const s = hostGateSnapshot(url)
            const secs = s ? Math.max(1, Math.round((s.rateLimitedUntil - Date.now()) / 1000)) : 30
            await this.log(taskId, 'info', `同站限流冷却 ${secs}s (${hostGateKeyOf(url)})，恢复后自动续采`)
          }
        } else {
          const ev = reportHostFailure(url)
          if (ev) await this.log(taskId, 'info', `同站连续失败${ev.failStreak}次, 并发上限降至${ev.newLimit} (${ev.host})`)
        }
      } else {
        reportHostSuccess(url)
      }
      return res
    } catch (e: any) {
      // [R28-4-E1] host 级熔断(403 连败长静默)快速失败: 引擎侧闸门行为而非源站故障,
      // 不喂连败降额链/不计 429 冷却(与下方 HostGateTimeout 豁免同口径); 章节错误分类由
      // 调用方按 HostCircuitOpen 分支只记节流后的观测日志
      // [R30-3-3] GlobalSemTimeout 同款豁免: fetchPage 入口全局并发信号量 30s 等待超时
      // (fetcher acquireGlobalSlot)也是引擎侧拥塞而非源站失败 —— 修前落 reportHostFailure
      // 喂连败降额链, 多任务并行信号量打满时把健康站点的 limit 一路降到 1(错误分类漂移)
      if (
        e?.isFetchTimeout ||
        (e?.name !== 'AbortError' && e?.code !== 'ABORT_ERR' &&
         e?.name !== 'HostCircuitOpen' && e?.name !== 'GlobalSemTimeout')
      ) {
        // zz-b: HTTP 429 以抛错形态抵达(fetchHttp/curl/auto 升级链均保留 err.status)——
        // 同样走限流冷却而非降额链, 防止限流站点被误降并发后照旧硬敲。
        // ab-b: 透传 fetcher 抛错对象抢救出的 Retry-After 毫秒值(无值/非法 → undefined → 30s 兜底)
        if (e?.status === 429) {
          if (reportHostRateLimited(url, e?.retryAfterMs)) {
            const s = hostGateSnapshot(url)
            const secs = s ? Math.max(1, Math.round((s.rateLimitedUntil - Date.now()) / 1000)) : 30
            await this.log(taskId, 'info', `同站限流冷却 ${secs}s (${hostGateKeyOf(url)})，恢复后自动续采`)
          }
        } else {
          const ev = reportHostFailure(url)
          if (ev) await this.log(taskId, 'info', `同站连续失败${ev.failStreak}次, 并发上限降至${ev.newLimit} (${ev.host})`)
        }
      }
      throw e
    } finally {
      releaseHostGate(ticket)
    }
  }

  // ================== 单本书采集 · 元数据段 [R46-2a-1] ==================
  /** 元数据段: 书籍页→封面→建书→目录→章节记录入库(A~E 重排)。
   *  返回 result: 'stopped'(停止/漂移) | 'blocked'(拦截壳页) | 'empty-toc'(空目录) |
   *  'ok'(无正文待采, 已收尾) | 'deferred'(有正文待采, ctx 携带跨段上下文) */
  private async crawlOneBookMeta(
    taskId: string,
    bookUrl: string,
    rule: RuleConfig,
    fetchOverride: Partial<FetchConfig>,
    taskCfg: { id: string; ruleId: string; recrawlMode: string; storageMode: string; smartCategory: boolean; smartComplete: boolean; autoSuggest: boolean },
    rt: TaskRuntime,
    myEpoch: number,
    progress: TaskProgress,
    stats: TaskStats,
    // [R46-7] nextThreads 形参已删: 正文段(唯一消费点)迁出至 crawlBookContentsBatch 后,
    //  元数据段无线程消费点 —— 调用面少一个同值函数实参, 签名更贴实
    nextInterval: () => number,
    listFields?: { name?: string; author?: string; intro?: string; category?: string }
  ): Promise<{ result: 'stopped' | 'blocked' | 'empty-toc' | 'ok' | 'deferred'; ctx?: BookCrawlCtx }> {
    // jj-d: myEpoch 改由调用方(executeTask)传入 —— 修前在此重新捕获 rt.epoch, stop→start
    // 恰落在 executeTask 捕获点与本函数调用点之间的 await 窗口(loadConfig/saveProgress,
    // 数毫秒)时, 旧循环会绑定【新一轮】epoch 而永不检出漂移, 双循环并发采集同一任务,
    // 且旧循环结束块 isStale()=false 可误写 done 终态; 传入绑定从根上关闭该窗口
    const waitIfPaused = async () => {
      // epoch 漂移: 本轮已被新一轮 start 取代, 立即退出暂停等待(防旧循环复活)
      while (rt.paused && !rt.stopped && rt.epoch === myEpoch) await sleep(600)
    }

    // ---------- 1. 书籍信息页 ----------
    await waitIfPaused()
    if (rt.stopped || rt.epoch !== myEpoch) return { result: 'stopped' }
    // ab-b: 书籍页同为采集目标站请求, 同款传当次随机 interval 作同 host 准入最小间隔
    // (逐次重新取值, 在线调参语义与章节批次/列表页一致; 关闭 zz-b 遗留"不传=0 瞬时解除节流"缺口)
    const bookRes = await this.gateFetch(taskId, bookUrl, { ...buildFetch(rule, fetchOverride) }, { minGapMs: nextInterval() })
    // 纯JSON API站适配: fetcher 的"极短内容判拦"是 HTML 挑战壳启发式, 会把百来字节的
    // 书籍API JSON(bqg713 /api/book ≈150字符)误判为 blocked —— 响应体是合法JSON时
    // 必然是API数据而非挑战页(挑战页永远是HTML), JSON有效即放行
    const bookBlocked = bookRes.blocked && parseJsonBody(bookRes.html) === undefined
    // 被拦(验证码/挑战壳)的 HTML 解析出来全是垃圾, 直接跳过本书(计入错误, 下次重试), 避免入库脏书
    if (bookBlocked) {
      stats.errors++
      await this.log(taskId, 'error', `书籍页疑似被拦截(验证码/JS挑战), 跳过本书: ${bookUrl}`)
      return { result: 'blocked' }
    }
    await this.log(taskId, 'info', `书籍页: ${bookUrl} (引擎:${bookRes.engine}, ${bookRes.html.length}字节)`)
    const parsed = parseBook(bookRes.html, bookUrl, rule.book)
    // ll-c2: 字段兜底链 detail解析 → 列表页字段(detail端点空数据时不丢书名) → URL片段 → 未知
    // R9-d-4: URL 片段兜底必须容错 —— bookUrl 可能来自备份导入/手工录入的非法 sourceUrl
    // (restore 路径不校验 URL 格式), new URL('垃圾串') 直接抛 TypeError 使本书采集中断;
    // 解析失败时跳过该兜底(落到"未知书名"), 不中断采集链
    let urlFragmentName = ''
    try {
      urlFragmentName = new URL(bookUrl).pathname.slice(1, 30)
    } catch { /* 非法 URL: 留空走下一级兜底 */ }
    const bookName = cleanTextField(parsed.name, 120) || cleanTextField(listFields?.name, 120)
      || urlFragmentName || '未知书名'
    const intro = cleanIntro(parsed.intro) || cleanIntro(listFields?.intro || '')
    const author = cleanTextField(parsed.author, 60) || cleanTextField(listFields?.author, 60) || '佚名'

    // feat-combo-theme-incremental(连载增量): 标记本次是否为连载书的增量检查
    // —— rt.ongoingBookUrls 中的书重启后不整体跳过, 抓目录后与 rt.bookLastChapters 中
    // 存储的末章 URL 对比: 相同 → 跳过新章采集; 不同 → 增量采新章(existUrlMap 自动去重已采过的)
    const isOngoingRecheck = rt.ongoingBookUrls.has(bookUrl)
    const storedLastChapterUrl = isOngoingRecheck ? rt.bookLastChapters.get(bookUrl) : undefined

    // 智能分类
    let categoryName: string | null = cleanTextField(parsed.category, 30) || cleanTextField(listFields?.category, 30) || null
    if (taskCfg.smartCategory) {
      const sm = await smartCategory(bookName, intro, categoryName || undefined)
      if (sm.category) {
        categoryName = sm.category
        await this.log(taskId, 'info', `智能分类[${sm.method}]: ${bookName} → ${sm.category}`)
      }
    }
    let categoryId: string | null = null
    if (categoryName) {
      // R4-9: category.upsert 在并行任务创建同名分类时 @@unique(name) 冲突 P2002;
      //  旧行为未捕获 → crawlOneBook 抛错 → 本书被跳过计为 error。改为 try/catch,
      //  P2002 时 re-findByName 拿到由另一个并行任务创建的分类 ID(其事务已 commit)
      // R5-20: 把单次重试扩为最多 3 次带退避循环 —— 极罕见情况下另一任务的事务 >50ms 才
      //  commit, 单次 50ms 重试仍读到 null, categoryId=null 导致书丢失分类关联; 3 次指数
      //  退避(50/100/200ms)累计等待 350ms 覆盖典型 SQLite busy 锁, 仍失败则记 warn 但不抛错。
      const CATEGORY_P2002_MAX_ATTEMPTS = 3
      for (let attempt = 0; attempt < CATEGORY_P2002_MAX_ATTEMPTS; attempt++) {
        try {
          const cat = await db.category.upsert({
            where: { name: categoryName },
            create: { name: categoryName },
            update: {},
          })
          categoryId = cat.id
          break
        } catch (e: any) {
          if (e?.code !== 'P2002') throw e
          // P2002: 并行任务同时创建同名分类, re-findUnique 拿对方 ID
          const existing = await db.category.findUnique({
            where: { name: categoryName },
            select: { id: true },
          })
          if (existing) {
            categoryId = existing.id
            break
          }
          // 另一事务未提交, findUnique 读不到; 退避后再试(最后一次仍读不到则放弃, categoryId=null)
          if (attempt < CATEGORY_P2002_MAX_ATTEMPTS - 1) {
            await new Promise((r) => setTimeout(r, 50 * Math.pow(2, attempt)))
          } else {
            await this.log(taskId, 'warn', `分类「${categoryName}」3 次重试后仍未就绪, 本书暂不关联分类`).catch(() => {})
          }
        }
      }
    }

    // 智能完结(先存unknown, 目录采完后最终判定)
    let detectedStatus: 'completed' | 'ongoing' | 'unknown' = 'unknown'
    if (taskCfg.smartComplete) {
      const det = smartCompleteDetect({ statusField: parsed.status, intro, bookName, latestChapterTitle: parsed.latestChapter })
      detectedStatus = det.status
      await this.log(taskId, 'info', `智能完结初判: ${det.status}(${det.reason})`)
    }

    // ---------- 2. 封面下载 → webp ----------
    // ab-b 注(设计如此): 封面 fetchBinary 直连外部 CDN(封面常不在目标站域), 不经 gateFetch
    // 同站闸门、不传 minGapMs —— 与列表/书籍/目录/章节的"目标站"口径刻意区分
    let coverPath = ''
    if (parsed.cover) {
      try {
        const bin = await fetchBinary(parsed.cover, { ...buildFetch(rule, fetchOverride), engine: 'http' })
        if (bin) {
          const saved = await saveCoverWebp(bin.buf, `book_${Date.now()}_${Math.floor(Math.random() * 9999)}`)
          if (saved) {
            coverPath = saved
            stats.coversSaved++
            await this.log(taskId, 'success', `封面已转存webp: ${saved}`)
          }
        }
      } catch (e: any) {
        await this.log(taskId, 'warn', `封面下载失败: ${e?.message?.slice(0, 80)}`)
      }
    }

    // ---------- 3. 建库/更新书籍 ----------
    // [R28-4-L9] 设计留档(本轮不改行为): 本查询 OR: [{sourceUrl}, {name, author}] 的
    // "同名同作者"跨源合并是有意的设计权衡 —— 不同作品同名同人(同人/重名书)时, 第二源会被判为
    // "已有更完整数据"跳过或反向增量合并, 章节并入错书; 跨源去重(1594-1622 附近)仅比章数,
    // 不校验 intro/首章内容同源性。可选加固(留档未实施): 跨源合并前加一道低成本校验
    // (intro 前缀相似度或双方 toc 首章 URL host+path 归一比对), 不一致则按不同书处理
    // (复用 nextBookNum 新建)。存量行为(历史轮次未立案), 如实留档供后续轮次决策
    const existing = await db.book.findFirst({ where: { OR: [{ sourceUrl: bookUrl }, { name: bookName, author }] } })
    let bookId: string
    const bookData = {
      name: bookName,
      author,
      categoryId,
      intro,
      status: detectedStatus,
      sourceUrl: bookUrl,
      sourceRuleId: taskCfg.ruleId,
      storageMode: taskCfg.storageMode,
      collectedAt: new Date(),
    }
    if (existing) {
      if (taskCfg.recrawlMode === 'full') {
        // 完全覆盖: 删除旧章节(及txt文件), 重置封面
        await db.chapter.deleteMany({ where: { bookId: existing.id } })
        if (existing.storageMode === 'txt') await deleteBookTxt(existing.id)
        await db.book.update({ where: { id: existing.id }, data: { ...bookData, cover: coverPath, wordCount: 0, latestChapter: '' } })
        await this.log(taskId, 'warn', `完全覆盖重采集: 清除《${existing.name}》旧数据`)
      } else {
        const upd: any = { ...bookData }
        if (coverPath) upd.cover = coverPath
        // [R22-c-1](High·数据破坏, R22-c 智能分类审查移交主控落地): 增量更新不回写分类 ——
        // 修前 bookData 恒含 categoryId(可能为 null), 每次增量刷新都无条件覆盖既有分类:
        // 用户手改的分类被冲掉; 源站无分类字段且智能分类未命中时更是把既有分类清成 null。
        // 新语义: 既有分类(用户手改/历史归类)恒保留; 旧书无分类且本次归出新分类时回填(自愈);
        // 两者皆无时 null 不写。完全覆盖(full)路径不动 —— 全量重建本就重置一切属设计内
        if (existing.categoryId || !categoryId) delete upd.categoryId
        if (detectedStatus !== 'unknown') {
          upd.status = detectedStatus
        } else {
          // zz-d 修复(完结状态静默回退): bookData 展开已携带 status: detectedStatus
          // ('unknown'), 原条件只在"检测成功"时覆写, 检测无结论时 unknown 照样落库 ——
          // 增量刷新把既有 completed/ongoing 书籍状态重置为 unknown(smartComplete 关闭时
          // 每次增量必现; 开启时初判+终判均无结论的书同样中招)。无结论时不写 status 字段,
          // 保留库中原值(完全覆盖路径不动: 全量重建本就重置一切, 且目录采完后终判仍可回填)
          delete upd.status
        }
        await db.book.update({ where: { id: existing.id }, data: upd })
      }
      stats.booksUpdated++
      bookId = existing.id
      await this.log(taskId, 'info', `更新书籍: 《${bookName}》(${bookUrl})`)
    } else {
      // 伪静态: 新书分配数字书号(并发撞号 P2002 重试, 见 pseudostatic-server)
      const nb = await withBookNumRetry(() =>
        nextBookNum(db).then((num) => db.book.create({ data: { ...bookData, cover: coverPath, num } })),
      )
      stats.booksCreated++
      bookId = nb.id
      await this.log(taskId, 'success', `新建书籍: 《${bookName}》`)
    }

    // ---------- 4. 目录页(预留分页 + 乱序重排 + 去重) ----------
    await waitIfPaused()
    if (rt.stopped || rt.epoch !== myEpoch) return { result: 'stopped' }
    const fetchCfgBase = buildFetch(rule, fetchOverride)
    // ff-b②: Referer 链伪造(规则 fetch.refererChain=true 时生效) —— 目录/章节请求携带
    // 书籍页 URL 作 Referer(真实"上一级页面"同链路语义, 很多站校验 Referer 同域/同链路);
    // 未启用时不注入字段, 行为与原先完全一致(零回归)
    const fetchCfg: Partial<FetchConfig> = fetchCfgBase.refererChain
      ? { ...fetchCfgBase, refererUrl: bookUrl }
      : fetchCfgBase

    // 翻页请求过闸注入(bb-d): parseToc/parseContent 内部翻页"下一页"抓取原直连 fetchPage
    // (aa-f 已知边界), 现经 FetchConfig.pageFetch 回调接入同款 acquire/release 闸门语义,
    // 与章节抓取/多任务并行同 host 共享同一账本; rules/test 测试路由不注入保持直连语义。
    // ll-c: Referer 链翻页 —— parser 翻页第2页起回传上一页 URL, 启用 refererChain 时
    // Referer 从"恒书籍页"升级为"翻页链逐页回溯"(真实浏览器翻页导航语义, 第1页仍书籍页);
    // 未启用链时 prevUrl 被忽略(fetchCfg 无 refererUrl), 行为零变化
    // ab-b: 翻页请求同为采集目标站请求, 同款传当次随机 interval 作 minGapMs(逐次取值)
    const pageFetchGated = (u: string, prevUrl?: string) =>
      this.gateFetch(
        taskId, u,
        fetchCfgBase.refererChain && prevUrl ? { ...fetchCfg, refererUrl: prevUrl } : fetchCfg,
        { minGapMs: nextInterval() }
      )
    const tocFetchCfg: Partial<FetchConfig> = { ...fetchCfg, pageFetch: pageFetchGated }
    const contentFetchCfg: Partial<FetchConfig> = { ...fetchCfg, pageFetch: pageFetchGated }

    /** 解析目录页HTML: tocLink规则 → 书籍页本身 → 目录链接自动嗅探兜底
     *  feat-cloak-anticrawler J: 返回值增加 tocUrl 字段, 用于章节请求的 Referer 链强制 */
    const extractToc = async (html: string, baseUrl: string): Promise<{ items: TocItem[]; pages: number; tocUrl: string }> => {
      // 1) 规则显式配置了 tocLink: 从书籍页提取目录页地址
      if (rule.toc.tocLink?.expression) {
        try {
          // const 模板 tocLink 需要 {q.*}/{字段} 占位符取值表(如 bqg713: /api/booklist?id={q.id})
          const { extractField, urlVars } = await import('./parser')
          const ch = await import('cheerio')
          const $ = ch.load(html)
          const link = extractField(html, $, null, null, rule.toc.tocLink, { vars: urlVars(baseUrl) })
          const abs = absolutize(link, baseUrl)
          if (abs && /^https?:\/\//.test(abs) && abs !== baseUrl) {
            // 瞬态韧性: 目录页抓取失败(限流/瞬时 403)退避后重试一次
            let page: Awaited<ReturnType<typeof fetchPage>>
            try {
              page = await this.gateFetch(taskId, abs, fetchCfg, { minGapMs: nextInterval() }) // ab-b
            } catch (_firstErr) {
              await new Promise((r) => setTimeout(r, 800))
              // 二次仍失败则向上抛, 走书籍页回退; ab-b: 重试同样逐次取随机 interval 作 minGapMs
              page = await this.gateFetch(taskId, abs, fetchCfg, { minGapMs: nextInterval() })
            }
            await this.log(taskId, 'info', `目录页(tocLink): ${abs} (${page.html.length}字节)`)
            const r1 = await parseToc(abs, page.html, rule.toc, tocFetchCfg)
            if (r1.items.length) return { ...r1, tocUrl: abs }
          }
        } catch (e: any) {
          await this.log(taskId, 'warn', `tocLink 解析失败: ${e?.message?.slice(0, 80)}`)
        }
      }
      // 2) 书籍页即目录页
      const r2 = await parseToc(baseUrl, html, rule.toc, tocFetchCfg, async (page, found) => {
        if (page % 5 === 0) await this.log(taskId, 'info', `目录解析中… 第${page}页 已发现${found}章`)
      })
      if (r2.items.length) return { ...r2, tocUrl: baseUrl }
      // 3) 兜底: 自动嗅探"目录"链接
      try {
        const ch = await import('cheerio')
        const $ = ch.load(html)
        let guess = ''
        $('a').each((_, el) => {
          if (guess) return
          const t = ($(el).text() || '').trim()
          if (/^(查看目录|章节目录|最新章节列表|章节列表|点击查看目录|全文目录|目录)$/.test(t)) {
            guess = $(el).attr('href') || ''
          }
        })
        const abs = absolutize(guess, baseUrl)
        if (abs && /^https?:\/\//.test(abs) && abs !== baseUrl) {
          const page = await this.gateFetch(taskId, abs, fetchCfg, { minGapMs: nextInterval() }) // ab-b
          await this.log(taskId, 'info', `目录链接自动嗅探: ${abs}`)
          const r3 = await parseToc(abs, page.html, rule.toc, tocFetchCfg)
          if (r3.items.length) return { ...r3, tocUrl: abs }
        }
      } catch (e: any) {
        await this.log(taskId, 'warn', `目录嗅探失败: ${e?.message?.slice(0, 80)}`)
      }
      return { ...r2, tocUrl: baseUrl }
    }

    const tocRes = await extractToc(bookRes.html, bookUrl)
    let tocItems = reorderToc(tocRes.items)
    // feat-cloak-anticrawler J: 章节请求 Referer 强制使用 TOC 页 URL(而非书籍页 URL)。
    // 旧实现: fetchCfg.refererUrl=bookUrl(书籍页), 章节 Referer 是书籍页 → 与真实浏览器
    // 行为不符(用户从目录页点击进入章节, Referer 应是目录页)。新实现: 章节数据抓取时
    // refererUrl=tocUrl(目录页 URL), 与真实浏览器翻页链路对齐; refererChain 关闭时也强制
    // 注入, 让章节请求始终携带 TOC 页 Referer(很多 WAF 校验章节请求的 Referer 来源)
    // 用 let 而非 const: 浏览器重取目录时若拿到更全目录, 同步更新 tocUrlRef
    let tocUrlRef = tocRes.tocUrl || bookUrl
    await this.log(taskId, 'success', `目录解析完成: ${tocItems.length} 章(含翻页${tocRes.pages}页, 乱序重排+去重后)`)

    // 检查点: extractToc 内含多次 fetchPage(tocLink/翻页, 可达数十秒), 暂停/停止/新轮启动要及时生效
    await waitIfPaused()
    if (rt.stopped || rt.epoch !== myEpoch) return { result: 'stopped' }

    // 反反爬增强: HTTP 引擎拿到的书籍页对 AJAX 目录站(ixdzs/101kks 系)只含部分章节甚至为空,
    // 且页面本身不触发拦截特征 → auto 链路不会自动切浏览器; browser 引擎规则也可能因瞬时
    // 限流拿到"渲染成功但 AJAX 目录未注入"的页面。目录为空/异常少时强制重取书籍页再走一遍
    // tocLink→本页→嗅探 流程(只重试一次, 防慢站拖垮任务)
    const httpTocCount = tocItems.length
    if (httpTocCount < 5 && (await checkBrowser())) {
      await this.log(taskId, 'warn', `目录仅${httpTocCount}章(疑似AJAX异步加载/瞬时拦截), 浏览器渲染重取书籍页…`)
      try {
        // ab-b: 浏览器重取书籍页同款传当次随机 interval 作 minGapMs(语义同书籍页首取)
        const bPage = await this.gateFetch(taskId, bookUrl, { ...fetchCfg, engine: 'browser', waitMs: Math.max(fetchCfg.waitMs || 0, 2500) }, { minGapMs: nextInterval() })
        const bToc = await extractToc(bPage.html, bookUrl)
        if (bToc.items.length > httpTocCount) {
          tocItems = reorderToc(bToc.items)
          // feat-cloak-anticrawler J: 浏览器重取到更全目录时, 同步更新 tocUrl(可能从嗅探/翻页拿到的实际目录页 URL)
          tocUrlRef = bToc.tocUrl || tocUrlRef
          await this.log(taskId, 'success', `浏览器渲染目录解析完成: ${tocItems.length} 章(此前仅${httpTocCount}章)`)
        }
      } catch (e: any) {
        await this.log(taskId, 'warn', `浏览器目录重取失败: ${e?.message?.slice(0, 100)}`)
      }
    }
    // 检查点: 浏览器重取同为长操作(渲染+稳定采样可达 40s+), 采纳结果/入库前再查一次
    await waitIfPaused()
    if (rt.stopped || rt.epoch !== myEpoch) return { result: 'stopped' }

    if (tocItems.length === 0) {
      await this.log(taskId, 'error', `《${bookName}》目录为空, 跳过正文采集`)
      return { result: 'empty-toc' }
    }

    // 最终完结判定(目录末章)
    if (taskCfg.smartComplete && detectedStatus === 'unknown') {
      const det = smartCompleteDetect({ lastChapterTitle: tocItems[tocItems.length - 1]?.title, latestChapterTitle: parsed.latestChapter, bookName })
      if (det.status !== 'unknown') {
        detectedStatus = det.status
        await db.book.update({ where: { id: bookId }, data: { status: detectedStatus } })
        await this.log(taskId, 'info', `智能完结终判: ${det.status}(${det.reason})`)
      }
    }

    // ---------- feat-combo-theme-incremental: 连载增量检查 ----------
    // rt.ongoingBookUrls 中的书: 与 rt.bookLastChapters 中存储的末章 URL 对比
    //  - 相同 → 无新章节, 跳过正文采集(仍计入 booksDone, 加入 ongoingBookUrls 维持记忆)
    //  - 不同 → 增量采新章(下方 existUrlMap 自动跳过已采过的)
    // 注: 完结书(rt.completedBookUrls)在外层循环已整体跳过, 不会走到这里
    if (isOngoingRecheck && storedLastChapterUrl) {
      const currentLastChapterUrl = tocItems[tocItems.length - 1]?.url || ''
      // R8-20: URL 规范化比较 —— strip scheme + trailing slash + lowercase host,
      // 避免"源站切换 https / 加减末尾斜杠"被误判为内容变更触发全量重采
      const currentNorm = normalizeUrlForCompare(currentLastChapterUrl)
      const storedNorm = normalizeUrlForCompare(storedLastChapterUrl)
      if (currentLastChapterUrl && currentNorm === storedNorm) {
        // 末章 URL 相同 → 视为无新章节
        await this.log(
          taskId,
          'info',
          `增量检查连载: 《${bookName}》(末章未变, 跳过新章采集; 上次末章: ${storedLastChapterUrl.slice(0, 80)})`,
        ).catch(() => {})
        // [R9-cl-4] 状态分流整合(与本书完成/跨源去重同语义): 完结→completedBookUrls;
        // 连载中/unknown→ongoingBookUrls + 更新末章 URL
        this.shuntBookStatus(rt, bookUrl, detectedStatus, currentLastChapterUrl)
        progress.booksDone++
        await this.saveProgress(taskId, progress, stats)
        return { result: 'ok' }
      }
      // 末章 URL 不同 → 有新章节, 继续走下方增量采集(existUrlMap 自动跳过已采过的)
      if (currentLastChapterUrl) {
        await this.log(
          taskId,
          'info',
          `增量检查连载: 《${bookName}》(上次末章: ${storedLastChapterUrl.slice(0, 80)}, 当前末章: ${currentLastChapterUrl.slice(0, 80)})`,
        ).catch(() => {})
      }
    }

    // ---------- feat-combo-theme-incremental: 跨源去重 ----------
    // existing(同 URL 或 同 name+author) 来自不同 rule(sourceRuleId !== taskCfg.ruleId):
    //  - 比较 chapter 数: 本源新 TOC <= 既有章数 → 跳过(已有更完整数据)
    //  - 本源新 TOC > 既有章数 → 增量合并新章(下方 existUrlMap 自动只采新章)
    // 注: 既有 db.book.findFirst 在第 3 步已取, 这里复用; existing 不存在时本块跳过
    if (existing && existing.sourceRuleId && existing.sourceRuleId !== taskCfg.ruleId) {
      let existingChapCount = 0
      try {
        existingChapCount = await db.chapter.count({ where: { bookId: existing.id } })
      } catch {
        // count 失败兜底: 视为 0, 走下方比较链(若本源有章节则会增量合并)
        existingChapCount = 0
      }
      if (tocItems.length <= existingChapCount) {
        // 其他源已有更完整或同等数据 → 跳过本书采集(不写章节, 不更新统计)
        await this.log(
          taskId,
          'info',
          `跨源去重: 《${bookName}》已存在于其他源(其他源 ${existingChapCount} 章 / 本源 ${tocItems.length} 章), 跳过`,
        ).catch(() => {})
        // [R9-cl-4] 状态分流整合(与本书完成/连载复查同语义): 完结→completedBookUrls;
        // 连载中/unknown→ongoingBookUrls + 记录末章 URL
        this.shuntBookStatus(rt, bookUrl, detectedStatus, tocItems[tocItems.length - 1]?.url)
        progress.booksDone++
        await this.saveProgress(taskId, progress, stats)
        return { result: 'ok' }
      }
      // 本源章数更多 → 增量合并新章, 继续走下方章节入库流程(existUrlMap 跳过既有章)
      await this.log(
        taskId,
        'info',
        `跨源合并: 《${bookName}》其他源 ${existingChapCount} 章 < 本源 ${tocItems.length} 章, 增量合并新章节`,
      ).catch(() => {})
    }

    // ---------- 5. 章节入库(增量/全量) + 正文多线程采集 ----------
    const isFull = taskCfg.recrawlMode === 'full'
    // R4-11: existChapters 限定 10000 行内存上限 —— 10000+ 章节的大部头书原先 findMany 全量加载
    //  每行 ~200B = ~2MB / 书, 并行多任务会乘以倍数。select 已最小化(id/url/title/idx/volume/fetched
    //  各字段后续重排/去重/未采回填都需用到, 不能再裁), 仅用 take 10000 限定内存: 超过 10000 章的
    //  书尾部章节视为"新"(并入 queue, 增量重采语义保持, 多采几次内容, 但内存有界)。
    //
    // R5-1: 但 R4-11 的"10k 之后视为新章"对"已存在但 idx>10000 的章节"反而是灾难 ——
    //  @@unique([bookId,idx]) 让阶段C 的 db.chapter.create 必抛 P2002, catch 吞掉后该章
    //  永远拿不到 chId, 阶段D 回填连锁失败, 连续 20 个 P2002 还会触发熔断使任务卡 error。
    //  修法: 命中 10000 上限时查 count; <=50000 直接全量加载(50000×~200B≈10MB 安全);
    //  >50000 维持 10k 采样并 log 警告(极端大部头防 OOM, 接受潜在重复抓取为可接受代价)
    let existChapters = await db.chapter.findMany({
      where: { bookId },
      select: { id: true, url: true, title: true, fetched: true, idx: true, volume: true },
      take: 10_000,
      orderBy: { idx: 'asc' },
    })
    if (existChapters.length === 10_000) {
      const total = await db.chapter.count({ where: { bookId } })
      if (total > 50_000) {
        await this.log(
          taskId,
          'warn',
          `《${bookName}》章节 ${total} 条 >50000 上限, 仅用前 10000 条做去重基准, 尾部章节可能被重复抓取(为防 OOM 接受此代价)`,
        )
      } else {
        // 全量加载(<=50000, 内存可控), 防尾部章被误判为新章触发 P2002 风暴 + 熔断
        existChapters = await db.chapter.findMany({
          where: { bookId },
          select: { id: true, url: true, title: true, fetched: true, idx: true, volume: true },
          orderBy: { idx: 'asc' },
        })
      }
    }
    const existUrlMap = new Map(existChapters.filter((c) => c.url).map((c) => [c.url, c]))
    // [R31-5-4] P1-6(审计报告): 键从纯 title 改为 volume+'\u0000'+title(分卷内去重) ——
    //  修前源站目录存在跨卷同名章(各卷都有的"序章"/插图页/"(修)"变体)时纯 title 键
    //  后行覆盖前行, 无 URL 章节按 title 匹配增量判定拿错 old: 误入 moves(阶段A/D 挪动
    //  无辜章)或误判已存在跳过采集。'\u0000' 不出现在正常标题/卷名中, (volume,title) 与
    //  键一一对应; 同卷同名章仍按 Map 后行覆盖前行去重(与修前同语义, 只影响同键重复)。
    //  已知取舍: kk-a 之前入库的旧章 volume 为空串, 与当前目录带卷名的同名章不再匹配 →
    //  按新章采集(多采不丢数据, 比误挪/误跳过安全); volume/title 均非空 String(schema
    //  title String / volume String @default("")), ?? '' 仅防御外部直改库
    const existTitleMap = new Map(existChapters.map((c) => [`${c.volume ?? ''}\u0000${c.title ?? ''}`, c]))

    // 修复(高危): 章节表有 @@unique([bookId, idx]) —— 源站中途插入新章时, 新章最终 idx 会与
    // 尚未移位的旧章冲突, 原 create 直接抛错导致整本书采集失败。改为三阶段重排:
    //   A) 冲突旧章挪到唯一负数临时位(不可能与正数目标位冲突)
    //   B) 被挤掉的陈旧章(已不在当前目录中)挪到尾部大序号位
    //   C) 新章按最终 idx 建行(此时正数位已无冲突)
    //   D) 旧章回填最终 idx(目标位一一对应, 无其他占用者)
    const queue: { chId?: string; title: string; url: string; volume: string; idx: number }[] = []
    const creates: { title: string; url: string; volume: string; idx: number }[] = []
    const moves: { id: string; to: number }[] = []
    const volumeBackfill: { id: string; volume: string }[] = []
    for (let i = 0; i < tocItems.length; i++) {
      const item = tocItems[i]
      const title = cleanChapterTitle(item.title, bookName)
      const url = item.url
      // [R25-5a] 码点截断替代 UTF-16 slice(emoji 代理对斩半风险): 语义同旧 trim+120 cap
      const volume = sliceCodePoints((item.volume || '').trim(), 120) // kk-a: 分卷名随章落库
      // [R31-5-4] P1-6: 与上方 existTitleMap 构建键同构(volume+'\u0000'+title); volume 已在
      //  上方 sliceCodePoints((item.volume||'').trim(),120) 归一为串, 与 kk-a 落库值同源
      const old = url ? existUrlMap.get(url) : existTitleMap.get(`${volume}\u0000${title}`)
      if (isFull || !old) {
        // 全量: 全部重建 / 增量: 只采不存在的
        const q = { title, url, volume, idx: i + 1 }
        queue.push(q)
        if (url) creates.push(q)
      } else if (old.idx !== i + 1) {
        // 已存在但序号变了: 记录重排计划(阶段A/D 执行)
        moves.push({ id: old.id, to: i + 1 })
        // kk-a: 重排回填时顺带补分卷名(规则新增 volume 提取后, 旧章 volume 为空)
        if (volume && !old.volume) volumeBackfill.push({ id: old.id, volume })
      } else if (volume && !old.volume) {
        // kk-a: 位置不变的已存在章, 同样补空缺分卷名
        volumeBackfill.push({ id: old.id, volume })
      }
    }
    // 阶段A: 冲突旧章 → 负数临时位
    // tt-c 修复: 原固定分配 -(mi+1)(-1,-2,...) 假设负数位全部空闲 —— 但若上一轮重排中途被杀
    // (进程重启/部署), 阶段A→D 之间的临时负位会残留(P2002 撞车 → catch 吞掉 → 该章未挪动,
    // 后续阶段C建行/阶段D回填连锁失败 + 残留章永久卡负位)。改为动态基线: 临时位全部压到
    // 当前全书最小 idx 之下(含残留负位), 与任何存量行(含崩溃残留)严格无交。
    const minExistIdx = existChapters.reduce((mn, c) => Math.min(mn, c.idx), 0)
    const tempBase = minExistIdx - moves.length - 1
    // R5-9/R5-10: 各阶段开头检查 rt.stopped || rt.epoch !== myEpoch ——
    //  万章+大部头书的阶段A/B/D 是顺序 db.chapter.update 循环, 每条 5-10ms, 全程可达分钟级,
    //  用户点"停止"信号需在每个阶段入口尽快生效, 避免无响应窗口; 若已停止则记日志并直接 return。
    if (rt.stopped || rt.epoch !== myEpoch) {
      await this.log(taskId, 'info', '阶段A: 任务已停止, 中止章节重排').catch(() => {})
      return { result: 'stopped' }
    }
    for (let mi = 0; mi < moves.length; mi++) {
      // Bug 5: 阶段A .catch 改为 swallowExpectedDb —— 仅放行 P2025(记录已删)/P2002(瞬态撞位),
      // 真 DB 故障上抛中止重排(修前 .catch(()=>{}) 无差别吞, 连锁失败致序号永久错乱)
      await db.chapter.update({ where: { id: moves[mi].id }, data: { idx: tempBase + mi } }).catch(swallowExpectedDb)
    }
    // 阶段B: 与新行 idx 冲突、但已不在当前目录中的陈旧章 → 挪到尾部(保留可读顺序, 不参与正文采集)
    // 修复(x-a高危): 目标位保留集只含 creates 不含 moves —— 陈旧章(已从目录消失)恰好占住
    // 某个重排目标位时, 阶段D回填撞 @@unique([bookId,idx]) 且被 catch 吞掉, 该章永久卡在
    // -1 负数临时位(目录头挂负序号/章节丢失); 补 for(m of moves) newTargetIdx.add(m.to)
    // 让阶段B把占位陈旧章挪尾腾位
    const movedIds = new Set(moves.map((m) => m.id))
    const newTargetIdx = new Set(creates.map((c) => c.idx))
    for (const m of moves) newTargetIdx.add(m.to)
    const tailMoves = new Map<string, number>()
    let tailIdx = Math.max(tocItems.length, existChapters.reduce((mx, c) => Math.max(mx, c.idx), 0), 0)
    // R5-9/R5-10: 阶段B 入口 stop/epoch 检查(同阶段A)
    if (rt.stopped || rt.epoch !== myEpoch) {
      await this.log(taskId, 'info', '阶段B: 任务已停止, 中止章节重排').catch(() => {})
      return { result: 'stopped' }
    }
    for (const c of existChapters) {
      if (movedIds.has(c.id)) continue
      // tt-c 增强: 负 idx 残留章(历史重排中途被杀遗留)也是非法位(章序必须 ≥1), 一并治愈摎尾,
      // 防止永久卡在负数位(前台排序置顶/导出错位)
      if (newTargetIdx.has(c.idx) || c.idx < 0) {
        tailIdx += 1
        tailMoves.set(c.id, tailIdx)
        // Bug 5: 阶段B .catch 改为 swallowExpectedDb(同阶段A口径)
        await db.chapter.update({ where: { id: c.id }, data: { idx: tailIdx } }).catch(swallowExpectedDb)
      }
    }
    // 阶段C: 新章按最终 idx 建行; 单章建行失败只计错误, 不再拖垮整本书
    const idMap = new Map<string, string>()
    // R5-9/R5-10: 阶段C 入口 stop/epoch 检查(万章级 creates 循环可达分钟级)
    if (rt.stopped || rt.epoch !== myEpoch) {
      await this.log(taskId, 'info', '阶段C: 任务已停止, 中止章节重排').catch(() => {})
      return { result: 'stopped' }
    }
    for (const q of creates) {
      try {
        const created = await db.chapter.create({
          data: { bookId, idx: q.idx, title: q.title, url: q.url, volume: q.volume, storage: taskCfg.storageMode, fetched: false },
        })
        idMap.set(q.url, created.id)
        stats.chaptersCreated++
      } catch (e: any) {
        // Bug 5: 阶段C 记错后仅放行 P2025(书被删)/P2002(瞬态撞位), 真 DB 故障上抛——
        // 修前本 catch 无差别吞所有异常, 真 DB 故障(磁盘满/连接断)时本书重排静默错乱,
        // 后续阶段D回填撞空位连锁失败。真故障应让本书重排干净 abort(走书籍级 error)
        stats.errors++
        await this.log(taskId, 'error', `章节记录创建失败 ${q.title}: ${e?.message?.slice(0, 80)}`)
        if (e?.code !== 'P2025' && e?.code !== 'P2002') throw e
      }
    }
    // 已存在但未fetched的旧章节也进队列(挪过尾部位的用新序号, 保证txt文件名与DB一致)
    // jj-d: 被"重排"(阶段A/D)的未采章回填后 DB idx=mv.to, 队列仍用快照旧 idx → txt 模式
    // 文件名按旧 idx 落盘(如 00004_xxx.txt)与 DB 最终 idx(5)永久错位; 尾挪章本就取
    // tailMoves, 重排章同样取最终位
    if (!isFull) {
      const moveFinalIdx = new Map(moves.map((m) => [m.id, m.to]))
      const unfetched = existChapters.filter((c) => !c.fetched)
      for (const c of unfetched) {
        if (c.url && !idMap.has(c.url)) {
          queue.push({ chId: c.id, title: c.title, url: c.url, volume: c.volume || '', idx: tailMoves.get(c.id) ?? moveFinalIdx.get(c.id) ?? c.idx })
          idMap.set(c.url, c.id)
        }
      }
    }
    // 阶段D: 旧章回填最终 idx(序号映射一一对应, 目标位已无其他占用者, 可安全回填)
    // R5-9/R5-10: 阶段D 入口 stop/epoch 检查(同阶段A/B/C)
    if (rt.stopped || rt.epoch !== myEpoch) {
      await this.log(taskId, 'info', '阶段D: 任务已停止, 中止章节重排').catch(() => {})
      return { result: 'stopped' }
    }
    for (const mv of moves) {
      // Bug 5: 阶段D .catch 改为 swallowExpectedDb(同阶段A/B口径)
      await db.chapter.update({ where: { id: mv.id }, data: { idx: mv.to } }).catch(swallowExpectedDb)
    }
    // kk-a: 分卷名回填(只补空缺, 不覆盖已有值; 批量逐条, 失败不影响采集)
    for (const vb of volumeBackfill) {
      // Bug 5: 分卷回填 .catch 改为 swallowExpectedDb(同口径)
      await db.chapter.update({ where: { id: vb.id }, data: { volume: vb.volume } }).catch(swallowExpectedDb)
    }

    // 阶段E: 删除超出目录范围的纯尾部陈旧章 —— Bug 10 修复。修前阶段B 只挪走"占住新行
    // 目标位"的陈旧章, idx > tocItems.length 且 url 不在当前目录中的纯尾部陈旧章(无冲突、
    // 不占目标位)既不挪也不删, 永久残留库中(前台分页/导出拖尾脏章)。本阶段清理之。
    // guard: currentUrls 为空(目录项均无 url 的边角)时跳过(notIn:[] 会匹配全部, 误删有效章)
    // R5-9/R5-10: 阶段E 入口 stop/epoch 检查(避免停止后仍跑 deleteMany)
    if (rt.stopped || rt.epoch !== myEpoch) {
      await this.log(taskId, 'info', '阶段E: 任务已停止, 跳过尾部陈旧章清理').catch(() => {})
      return { result: 'stopped' }
    }
    const currentUrls = tocItems.map((it) => it.url).filter(Boolean)
    if (currentUrls.length > 0) {
      // [R36-2c-1] 先 count 后删: 命中安全闸(目录截断签名+超阈值)时跳过删除保留数据,
      //  防把整本书尾部正章当"陈旧章"批量清掉(决策依据见 staleTailGuardDecision 注);
      //  未命中时行为与修前一致(单条 deleteMany, 常规陈旧章清理照常)
      const staleWhere = { bookId, idx: { gt: tocItems.length }, url: { notIn: currentUrls } }
      const staleCount = await db.chapter.count({ where: staleWhere })
      const guard = staleTailGuardDecision(staleCount, existChapters.length, creates.length, tocItems.length)
      if (guard.skip) {
        await this.log(
          taskId,
          'warn',
          `阶段E 已拦截: 待删目录外章节 ${staleCount} 条超过安全阈值 ${guard.threshold}, 且本次目录 ${tocItems.length} 章几乎全部与既有章节匹配(疑似目录翻页截断/中途失败), 已保留全部数据; 请检查目录分页配置后重跑本任务(重跑后目录完整时多余数据会被正常清理)`,
        )
      } else {
        const staleTail = await db.chapter.deleteMany({ where: staleWhere })
        if (staleTail.count > 0) {
          await this.log(taskId, 'info', `阶段E: 清理 ${staleTail.count} 条目录外陈旧章(idx>${tocItems.length})`)
        }
      }
    }

    // ---------- [R46-2a-1] 两阶段切割点: 元数据段到此结束 ----------
    // 语义同原"queue 为空时批次循环不执行直接收尾"(增量末章未变/跨源去重/无新章):
    // 无正文待采 → 就地完成收尾(finishBookOk); 有正文 → 产出 ctx, 由 executeTask 合并
    // 批内其他书的队列统一跨书批量采集(crawlBookContentsBatch)
    const ctx: BookCrawlCtx = { taskId, bookUrl, bookId, bookName, rule, taskCfg, queue, idMap, tocUrlRef, tocItems, fetchCfg, contentFetchCfg, isFull, detectedStatus, doneCount: 0 }
    if (queue.length === 0) {
      return { result: await this.finishBookOk(ctx, rt, myEpoch, progress, stats, true) }
    }
    await this.log(taskId, 'info', `目录就绪: 《${bookName}》 ${tocItems.length} 章, 正文待采 ${queue.length} 章(${isFull ? '完全覆盖' : '增量更新'}) —— 元数据完成, 稍后批量采集`)
    return { result: 'deferred', ctx }
  }

  // ================== 单本书收尾 [R46-2a-1] ==================
  /** 书籍收尾: 书统计聚合(wordCount/latestChapter)恒执行(停止/漂移同样执行, 反映已采实况);
   *  allowFinish=true 且未停止/漂移时: 完成日志+下拉词+PSEO+booksDone+状态分流+进度落库,
   *  返回 'ok'; 停止/漂移时仅统计聚合, 返回 'stopped'(原 crawlOneBook 尾部语义逐项保留) */
  private async finishBookOk(
    ctx: BookCrawlCtx,
    rt: TaskRuntime,
    myEpoch: number,
    progress: TaskProgress,
    stats: TaskStats,
    allowFinish: boolean
  ): Promise<'ok' | 'stopped'> {
    const { taskId, bookUrl, bookId, bookName, taskCfg, tocItems, detectedStatus } = ctx
    // 更新书籍统计(停止/漂移同样执行: wordCount/latestChapter 反映已采实况, 对恢复采集有益)
    const agg = await db.chapter.aggregate({ where: { bookId, fetched: true }, _sum: { wordCount: true }, _count: true })
    // Bug 24: .catch 收口 —— 修前 .catch(()=>{}) 无差别吞错, 真 DB 故障(P2025 以外)
    // 静默丢统计(wordCount/latestChapter 静默不更新, 前台显示与实际不符)。现仅放行 P2025
    // (书被删), 其余打 warn 日志便于运维感知
    await db.book.update({
      where: { id: bookId },
      data: {
        wordCount: agg._sum.wordCount || 0,
        // [R25-5a] 码点截断替代 UTF-16 slice(同上)
        latestChapter: (tocItems.length ? sliceCodePoints(tocItems[tocItems.length - 1]?.title || '', 100) : ''),
      },
    }).catch((e: any) => {
      if (e?.code !== 'P2025') console.warn('[runner] book stats update failed:', e?.message || e)
    })

    // jj-d: 停止/漂移后短路 —— "完成"日志/下拉词网络抓取/booksDone 计数属"本轮推进"语义:
    // 修前停止一册未采完的书仍会(1)误记"《书》完成"(2)发下拉词引擎网络请求(最长8s, 拖住
    // 停止收尾)(3)booksDone 虚增(书未采完)(4)旧进度回写; 漂移时同理且全部归新循环所有
    if (!allowFinish || rt.stopped || rt.epoch !== myEpoch) return 'stopped'
    await this.log(taskId, 'success', `《${bookName}》完成: ${ctx.doneCount}章正文已采集 (共${tocItems.length}章)`)

    // ---------- 6. 搜索引擎下拉关键词 ----------
    // ab-b 注(设计如此): 下拉词走外部搜索引擎(suggest.ts 直连), 不经 gateFetch、不传 minGapMs
    if (taskCfg.autoSuggest && bookName) {
      try {
        const sug = await fetchSuggestKeywords(bookName)
        const words = mergeSuggestWords(bookName, sug, 25)
        let added = 0
        for (const w of words) {
          // R4-10: bookTag.upsert 在并行任务对同书同 tag 操作时 @@unique([bookId, tag]) 冲突 P2002;
          //  旧 .then(added++).catch(()=>{}) 静默吞掉 P2002 → tag 漏写、added 虚低。改为:
          //  P2002 时 re-findByBookIdTag 拿到既有行, 计入 added(不丢统计口径)
          try {
            await db.bookTag.upsert({
              where: { bookId_tag: { bookId, tag: w } },
              create: { bookId, tag: w, source: 'suggest' },
              update: {},
            })
            added++
          } catch (e: any) {
            if (e?.code === 'P2002') {
              // 已由并行任务创建, 视作成功(本任务去重链无需重复入库)
              added++
            } else {
              // 其余错误(真 DB 故障) 静默跳过, 与旧行为兼容(不强断下拉词链)
            }
          }
        }
        stats.suggestWords += added
        const okEngines = sug.filter((s) => s.ok).map((s) => s.engine).join(',')
        await this.log(taskId, 'success', `下拉关键词: ${added}个 (${okEngines || '引擎均不可达, 稍后可手动刷新'})`)
      } catch (e: any) {
        await this.log(taskId, 'warn', `下拉关键词失败: ${e?.message?.slice(0, 80)}`)
      }
    }

    // ---------- 7. PSEO 落地页自动生成钩子 [R27-2-9] ----------
    // Setting pseoAutoGenerate=='1' 时, 书籍入库(含下拉词已合并)后即生成 ≤5 页关键词落地页;
    // 生成失败静默(不影响采集主链计数/进度), 与 autoSuggest 链同风格
    try {
      const { pseoAutoEnabled, generateForBook } = await import('../pseo-server')
      if (await pseoAutoEnabled()) {
        const made = await generateForBook(bookId, 5)
        if (made > 0) await this.log(taskId, 'success', `PSEO 落地页: +${made} 页`)
      }
    } catch {
      /* PSEO 可选增强, 任何失败不阻断采集 */
    }

    progress.booksDone++
    // feat-combo-theme-incremental: 状态分流 ——
    //  - detectedStatus==='completed' → 加入 rt.completedBookUrls(下次重启整体跳过)
    //  - detectedStatus==='ongoing'/'unknown' → 加入 rt.ongoingBookUrls + 记录末章 URL
    //    (下次重启走增量检查: 抓目录→对比末章→无新章跳过/有新章增量采)
    //  - 同时清理可能的"连载→完结"状态跃迁记忆(原在 ongoingBookUrls 中的书若终判完结,
    //    从 ongoingBookUrls + bookLastChapters 中移除, 改入 completedBookUrls)
    //  [R9-cl-4] 三处同语义分支已整合进 shuntBookStatus
    this.shuntBookStatus(rt, bookUrl, detectedStatus, tocItems[tocItems.length - 1]?.url)
    await this.saveProgress(taskId, progress, stats)
    return 'ok'
  }

  // ================== 跨书正文批量采集 [R46-2a-1] ==================
  /** 正文段: 接收同一批 meta 段产出的多本书 ctx, 合并章节队列后沿用原"多线程批次采集"
   *  循环跨书并发采正文(threads/interval 在线调参/hostgate 闸门/Referer 链/抖动/熔断/暂停/
   *  停止/epoch 漂移语义逐项保留)。批内跨书共享 consecutiveErrs 熔断计数(更强保护)。
   *  循环结束后逐书 finishBookOk 收尾(统计聚合恒做; 停止/漂移时不做完成推进)。
   *  返回 'stopped'(停止/漂移) 或 'ok'(批内全部书籍已收尾) */
  private async crawlBookContentsBatch(
    ctxs: BookCrawlCtx[],
    rt: TaskRuntime,
    myEpoch: number,
    progress: TaskProgress,
    stats: TaskStats,
    nextThreads: () => number,
    nextInterval: () => number
  ): Promise<'ok' | 'stopped'> {
    if (!ctxs.length) return 'ok'
    const taskId = ctxs[0].taskId
    const isStale = () => rt.epoch !== myEpoch
    // 合并批内全部章节队列(每项携带所属书 ctx) —— 跨书批量采集的本体
    const items: { ctx: BookCrawlCtx; q: { chId?: string; title: string; url: string; volume: string; idx: number } }[] = []
    let tocSum = 0
    for (const c of ctxs) {
      tocSum += c.tocItems.length
      for (const q of c.queue) items.push({ ctx: c, q })
    }
    // [R46-2a-1] tocTotal 语义对齐原单书形态: 本批目录章总数(原为当前书目录章数)
    // 章节日志按批汇总一条/书(原单书一条"正文队列"日志的跨书等价)
    for (const c of ctxs) {
      if (c.queue.length > 0) {
        await this.log(taskId, 'info', `正文队列: 《${c.bookName}》 ${c.queue.length}/${c.tocItems.length} 章需要采集 (${c.isFull ? '完全覆盖' : '增量更新'})`)
      }
    }
    progress.phase = 'content'
    progress.tocTotal = tocSum
    progress.contentTotal = items.length
    progress.currentBook = ctxs[0].bookName
    progress.phaseNote = `正文批量采集: 本批 ${ctxs.length} 本书共 ${items.length} 章`
    await this.saveProgress(taskId, progress, stats)

    // ---------- 多线程批次采集(跨书) ----------
    let done = 0
    // tt-c: 任务级连续错误熔断 —— 连续真实章节失败(源站超时/抓取异常, 不含无链接/HostGate限流/停止中止)
    // 达阈值即中止本批后续请求: 防止站点改版/被反爬拦截时引擎无休止硬敲(烧站点+烧出口IP),
    // 同时把任务推向 error 终态(autoRefresh 任务会按计划自动重试, 站点恢复后自愈)
    // [R46-2a-1] 跨书共享: 原"本书内"连败升级为"批内跨书"连败(同任务同站, 语义更强)
    // [R22-f-1]: live 状态读失败节流标志(仅状态翻转时打一条, 防 DB 长故障期每 2s 一条刷屏)
    let liveReadFailed = false
    let consecutiveErrs = 0
    while (items.length > 0) {
      if (rt.stopped || isStale()) break
      while (rt.paused && !rt.stopped && rt.epoch === myEpoch) await sleep(600)
      if (rt.stopped || isStale()) break

      // 在线调参即时生效: 每批次实时读任务行(原来用书首快照, 大部头中途调线程/间隔要等下一本书才生效)
      let threads = nextThreads()
      let interval = nextInterval()
      let live
      try {
        live = await db.task.findUnique({
          where: { id: taskId },
          select: { threadMin: true, threadMax: true, intervalMin: true, intervalMax: true, status: true },
        })
      } catch {
        // DB 读取失败: 跳过本批次不推进采集(不确认非暂停就不处理), 有界退避后重试
        if (!liveReadFailed) {
          liveReadFailed = true
          await this.log(taskId, 'warn', '任务状态读取失败(DB 故障), 批次推进挂起(2s 退避重试, DB 恢复后自动续采)').catch(() => {})
        }
        await sleepGap(2000, rt, myEpoch)
        continue
      }
      if (liveReadFailed) liveReadFailed = false
      if (live) {
        // DB 状态守卫: 外部把任务改 paused/stopped(recoverOnBoot/管理操作)时, 内存循环同步停下,
        // 防止"内存运行中/DB已暂停"的僵尸状态各自为政
        if (live.status === 'stopped') { rt.stopped = true; rt.paused = false; break }
        if (live.status === 'paused') {
          if (!rt.paused) {
            rt.paused = true
            await this.log(taskId, 'warn', '检测到任务状态为暂停, 批次循环挂起(点击继续可恢复)')
          }
          continue
        }
        // [R22-f-1] 兜底复位内存暂停标志(与原单书循环同语义)
        if (rt.paused) rt.paused = false
        threads = randInt(clampMin(live.threadMin, live.threadMax), live.threadMax)
        interval = randInt(clampMin(live.intervalMin, live.intervalMax), live.intervalMax)
      }
      const batch = shuffleBatch(items.splice(0, threads)) // [R36-2c-8] 批内顺序随机化(缺省关)
      progress.lastThread = threads
      progress.lastInterval = interval
      await this.log(taskId, 'info', `⚙ 线程批次: ${threads} 线程 × ${batch.length} 章`)

      await Promise.all(
        batch.map(async (item) => {
          const { ctx, q } = item
          try {
            // 无URL章节(纯标题项/javascript:链接被 absolutize 置空): 无法抓取,
            // 保持未采集状态即可 —— 原实现照样 fetchPage('') 每批报 "Obscura: 无效 URL" 噪音错误
            if (!q.url) {
              stats.errors++
              await this.log(ctx.taskId, 'warn', `章节无有效链接, 跳过: ${q.title.slice(0, 60)}`)
              done++
              ctx.doneCount++
              progress.contentDone = done
              return
            }
            // ff-b②/gg-d/feat-cloak-anticrawler J/feat-round-8 B1/[R30-3-E-D] 语义逐项保留:
            // 章节 Referer 强制 tocUrlRef(目录页), per-chapter ±20% 抖动 + jitterMs 叠加,
            // host 行为分自适应(403/429 连败对拉长间隔)
            const contentRefererUrl = ctx.tocUrlRef || ctx.bookUrl
            const contentFetchCfgWithReferer: Partial<FetchConfig> = {
              ...ctx.contentFetchCfg,
              refererUrl: contentRefererUrl,
              refererChain: true,
            }
            const jitteredMinGap = Math.round(jitteredInterval(interval, ctx.fetchCfg.jitterMs) * hostAdaptiveGapMultiplier(q.url))
            const pageRes = await this.gateFetch(ctx.taskId, q.url, contentFetchCfgWithReferer, { minGapMs: jitteredMinGap })
            // 疑似被拦不入库: 保持 fetched=false, 下次增量自动重试; 合法JSON体是API数据非挑战页, 放行
            if (pageRes.blocked && parseJsonBody(pageRes.html) === undefined) throw new Error('章节页疑似被拦截(验证码/JS挑战)')
            const parsedC = await parseContent(q.url, pageRes.html, ctx.rule.content, contentFetchCfgWithReferer)
            // [R28-4-E3] cleaned/plainLen 改 let: trafilatura 兜底采纳时被替换(下方)
            let cleaned = cleanContentHtml(parsedC.content, ctx.rule.clean)
            let plainLen = cleaned.replace(/<[^>]+>/g, '').length
            // [R28-4-E3] trafilatura 正文兜底(FETCH_EXTRACT_FALLBACK=1 缺省关): 极短正文 +
            // 低置信度时 POST 桥 /extract 重提取; 产物重过 cleanContentHtml 且 plainLen≥100
            // 才采纳(保底长度闸), 日志显式记录兜底来源。失败静默落原 cleaned(不阻断)
            if (FETCH_EXTRACT_FALLBACK_ENABLED && plainLen < 200 && (parsedC.confidence ?? 1) < 0.3) {
              const fbHtml = await trafilaturaExtractFallback(q.url, pageRes.html, ctx.contentFetchCfg.scraplingBridgeUrl || '')
              if (fbHtml) {
                const cleanedFb = cleanContentHtml(fbHtml, ctx.rule.clean)
                const plainFb = cleanedFb.replace(/<[^>]+>/g, '').length
                if (plainFb >= FETCH_EXTRACT_MIN_PLAIN) {
                  await this.log(ctx.taskId, 'warn', `正文过短(${plainLen} chars, confidence=${(parsedC.confidence ?? 1).toFixed(2)}), trafilatura 兜底提取 ${plainFb} chars: ${q.url.slice(0, 120)}`)
                  cleaned = cleanedFb
                  plainLen = plainFb
                }
              }
            }
            const chId0 = q.chId || ctx.idMap.get(q.url)
            let rel: string | null = null
            // oo-①修复(qq-c收编): 内容保存路径的 chapter.update 此前无 catch —— 章节行在
            // 任务运行中被并发删除(删书/清空章节/另一任务重采同书)时 Prisma 抛 P2025
            // 且整章记 error。update 失败(P2025 行已删等)不抛, 落到下方 create
            // 兜底重建该章(内容不丢失); create 自身失败仍走外层 catch 计 error(真 DB 故障不吞)
            let chId: string | null | undefined = chId0
            if (ctx.taskCfg.storageMode === 'txt') {
              // [R13-5] txt 落盘文本转换(语义同原单书路径)
              rel = await saveChapterTxt(ctx.bookId, q.idx, q.title, cleaned
                .replace(/<\s*br\s*\/?>/gi, '\n')
                .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
                .replace(/<[^>]+>/g, '')
                .replace(/\n{3,}/g, '\n\n'))
              if (chId) {
                const updated = await db.chapter.update({
                  where: { id: chId },
                  data: { content: null, filePath: rel, storage: 'txt', wordCount: plainLen, fetched: true },
                }).then(() => true).catch(() => false)
                if (!updated) chId = null
              }
            } else {
              if (chId) {
                const updated = await db.chapter.update({
                  where: { id: chId },
                  data: { content: cleaned, storage: 'db', wordCount: plainLen, fetched: true },
                }).then(() => true).catch(() => false)
                if (!updated) chId = null
              }
            }
            if (!chId) {
              // 兜底: 直接建(filePath 用已写盘的 rel, 原占位 '待补' 会让公开API读不到文件)
              // zz-d: create 失败(P2025 书被删/真 DB 故障)必须落外层计 error + 连败熔断推进
              await db.chapter.create({
                data: {
                  bookId: ctx.bookId, idx: q.idx, title: q.title, url: q.url, volume: q.volume,
                  content: ctx.taskCfg.storageMode === 'txt' ? null : cleaned,
                  filePath: rel,
                  storage: ctx.taskCfg.storageMode,
                  wordCount: plainLen, fetched: true,
                },
              })
            }
            stats.chaptersUpdated++
            consecutiveErrs = 0
            done++
            ctx.doneCount++
            progress.contentDone = done
            // R8-5: done%50 节流 saveProgress(50000 章 = 1000 次 → 200 次序列化);
            // book 边界 / 任务完成 / 错误熔断 / 章节完成(contentTotal) 等其他检查点保持原行为不变。
            if (done % 50 === 0 || done === progress.contentTotal) {
              await this.saveProgress(ctx.taskId, progress, stats)
            }
          } catch (e: any) {
            if (e?.isFetchTimeout) {
              // ee-d: 源站超时计失败+可见日志, 章节保持 fetched=false, 增量重试照常优先
              stats.errors++
              consecutiveErrs++
              await this.log(ctx.taskId, 'error', `章节失败(源站超时) ${q.title.slice(0, 60)}: ${q.url.slice(0, 120)}`)
            } else if (e?.name === 'AbortError' || e?.code === 'ABORT_ERR') {
              // 修复(x-a): 停止/换代造成的中止不计章节失败(防停止时批量刷错误+errors虚高)
            } else if (e?.name === 'HostCircuitOpen') {
              // [R28-4-E1] host 级熔断快速失败: 不计 errors/不计连败; 日志节流(同 host 1min 至多 1 条)
              {
                const hkey = hostGateKeyOf(q.url)
                const last = hostCircuitWarnAt.get(hkey) || 0
                if (Date.now() - last > 60_000) {
                  numberMapFifoSet(hostCircuitWarnAt, hkey, Date.now(), HOST_CIRCUIT_WARN_CAP) // [R30-3-2] 有界写入
                  await this.log(ctx.taskId, 'warn', `章节批量跳过: host 级熔断中(${hkey || '未知'}, 源站 403 连败长静默), 章节保持未采集; 熔断解除后增量重试可恢复`)
                }
              }
            } else if (e?.name === 'HostGateTimeout' || e?.name === 'GlobalSemTimeout') {
              // bb-d/[R30-3-3]: 引擎侧并发护栏(源站无关), 不计 errors/不计连败
              await this.log(ctx.taskId, 'warn', `章节 ${q.title.slice(0, 60)} 引擎并发护栏等待超时(${e?.name === 'GlobalSemTimeout' ? '全局信号量' : `host:${hostGateKeyOf(q.url) || '未知'}`}), 章节保持未采集; 稍后增量重试可恢复`)
            } else {
              stats.errors++
              consecutiveErrs++
              // [R12-b-7] 错误响应体摘要: fetcher !res.ok 抛错时响应体挂 err.bodyHtml
              const bodySnippet = String((e as { bodyHtml?: unknown })?.bodyHtml ?? '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 220)
              await this.log(ctx.taskId, 'error', `章节失败 ${q.title}: ${e?.message?.slice(0, 100)}${bodySnippet ? ` | 响应体: ${bodySnippet}` : ''}`)
            }
          }
        })
      )
      // tt-c: 连续错误熔断检查(每批次末) —— 达阈值即刻中止, 不再继续敲站点
      if (consecutiveErrs >= CIRCUIT_ERROR_LIMIT) {
        // E4: 记录熔断触发时间戳, control('start') 入口检查 60s 冷却窗口期内拒绝重启
        rt.circuitTrippedAt = Date.now()
        await this.log(taskId, 'error', `🔴 熔断中止: 连续 ${consecutiveErrs} 章采集失败(上游站点异常/被反爬拦截), 停止继续请求以保护站点与出口 IP; autoRefresh 任务将按计划自动重试; 60s 冷却期内手动重启将被拒绝`)
        await this.saveProgress(taskId, progress, stats)
        const cbErr = new Error(`连续 ${consecutiveErrs} 章采集失败, 触发连续错误熔断(阈值 ${CIRCUIT_ERROR_LIMIT})`)
        ;(cbErr as any).isCircuitBreak = true
        throw cbErr
      }
      // feat-round-8: B1 — 批次间 sleepGap 同款 ±20% 抖动(同任务 fetchCfg 一致, 取批首书 jitterMs)
      await sleepGap(jitteredInterval(interval, ctxs[0].fetchCfg.jitterMs), rt, myEpoch)
    }
    // 收尾保存: 原先仅靠 done===contentTotal 触发, contentTotal 因队列追加/失败章偏低时进度会停在旧值
    // jj-d: epoch 漂移(被新一轮 start 取代)时跳过 —— 进度权归新循环, 旧循环的过期对象不得回滚其刚写进度
    if (rt.epoch === myEpoch) await this.saveProgress(taskId, progress, stats)

    // [R46-2a-1] 逐书收尾: 统计聚合恒做; 停止/漂移时 finishBookOk 内短路(不做完成推进)
    let anyStopped = false
    for (const c of ctxs) {
      const r = await this.finishBookOk(c, rt, myEpoch, progress, stats, true)
      if (r === 'stopped') anyStopped = true
    }
    return anyStopped ? 'stopped' : 'ok'
  }


  private async saveProgress(taskId: string, progress: TaskProgress, stats: TaskStats) {
    // P2025 噪音修复(dd-b, bb-g 存档竞态): 任务被删除后 stop 收尾的 saveProgress 对已删行
    // update 抛 P2025 —— prisma log:['error'] 层在查询失败【瞬间】即打出 "prisma:error …P2025"
    // (P7 实测经 console.log 落 stdout→dev.log, verify 探针实证), catch 只能吞异常追不回日志。
    // 故采用先查存在性: 任务已删=进度无处可写, 属预期终态, 静默跳过(零 prisma error 输出);
    // 查得存在后才 update —— 正常路径仅多一次主键探测(SQLite 本地, 可忽略), 落库行为不变。
    // 查后删除的微秒级竞态窗口仍由 catch 兜底: P2025 静默(此时日志已打出, 有界罕见),
    // 其余异常降为自有 warn(不经 prisma error 层); 整体保持"saveProgress 永不抛"契约
    //
    // feat-contentproxy-resume: 同步把 rt.discoveredBookUrls / rt.completedBookUrls 落库 ——
    // 范围任务重启时由这两数组重建 Set 实现续采。cap 50000 条防 DB 膨胀(50000×~60B URL≈3MB);
    // 同 URL 在 Set 中只 1 次, 数组天然去重。task 进度字段为 JSON 字符串, 数组形态天然可序列化
    //
    // R8-5: 仅序列化 dirty 集合 —— 跳过未修改集合免重复 JSON.stringify(原实现每次都把 4 个集合
    // 全序列化, 50000×60B×4=12MB, 100ms/次, 长任务累计数小时纯序列化开销)。dirty 标志由各
    // mutation 点设置, 序列化后清零。slice(-50000) 保留 LATEST(R8-6: 旧实现 slice(0, 50000)
    // 会丢弃 Set 末尾插入的最新条目, 重启后只能恢复头部 50000, 尾部条目需重新发现重抓)
    const rt = this.runtimes.get(taskId)
    if (rt) {
      if (rt.dirtyDiscovered) {
        // R8-6: 用 slice(-50000) 保留 LATEST 条目(Set 插入序尾部 = 最近发现的 URL),
        // 旧 slice(0, 50000) 保留头部 = 最早发现的 URL, 重启后尾部 URL 需重新发现重抓
        progress.discoveredBookUrls = Array.from(rt.discoveredBookUrls).slice(-50_000)
        rt.dirtyDiscovered = false
      }
      if (rt.dirtyCompleted) {
        progress.completedBookUrls = Array.from(rt.completedBookUrls).slice(-50_000)
        rt.dirtyCompleted = false
      }
      // feat-combo-theme-incremental: 连载增量字段同步落库(ongoingBookUrls + bookLastChapters)
      if (rt.dirtyOngoing) {
        progress.ongoingBookUrls = Array.from(rt.ongoingBookUrls).slice(-50_000)
        rt.dirtyOngoing = false
      }
      // bookLastChapters Map → Object(JSON 序列化友好); cap 50000 条
      // [R15-d1b-4](Low) cap 改保 LATEST —— 原实现在第 50000 条处 break, 保留的是插入序头部
      // (最早入库)的条目, 超限时最新入库的连载书末章记录被静默丢弃, 重启后那些书会误判
      // "末章变更"触发无谓的全量比对; 三个 URL 数组兄弟字段早已按 R8-6 口径 slice(-50000)
      // 保最新, Map 侧对齐同语义(Map 插入序尾部 = 最近追加)
      if (rt.dirtyLastChapters) {
        const lastChapObj: Record<string, string> = {}
        if (rt.bookLastChapters.size > 50_000) {
          // 仅超限时一次性物化数组取尾部(常态路径零分配, 与三数组 slice(-50000) 口径一致)
          let skip = rt.bookLastChapters.size - 50_000
          for (const [k, v] of rt.bookLastChapters) {
            if (skip > 0) { skip--; continue }
            lastChapObj[k] = v
          }
        } else {
          for (const [k, v] of rt.bookLastChapters) lastChapObj[k] = v
        }
        progress.bookLastChapters = lastChapObj
        rt.dirtyLastChapters = false
      }
    }
    try {
      const exists = await db.task.findUnique({ where: { id: taskId }, select: { id: true } })
      if (!exists) return
      // R8-5: 用 JSON.stringify replacer 跳过空集合 —— 集合为空时不写入 progress JSON
      // (老逻辑把空集合写成 [] / {}, 多余字节; replacer 让空集合从 JSON 中省略, DB 体积更小)
      const progressJson = JSON.stringify(progress, (key, value) => {
        if (value === undefined) return undefined
        if (
          (key === 'discoveredBookUrls' || key === 'completedBookUrls' || key === 'ongoingBookUrls')
          && Array.isArray(value) && value.length === 0
        ) return undefined
        if (key === 'bookLastChapters' && value && typeof value === 'object'
          && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0) {
          return undefined
        }
        return value
      })
      await db.task.update({
        where: { id: taskId },
        data: { progress: progressJson, stats: JSON.stringify(stats) },
      })
    } catch (e: any) {
      if (e?.code === 'P2025') return
      console.warn(`[runner] saveProgress 落库失败(task:${taskId}): ${String(e?.message || e).slice(0, 140)}`)
    }
  }
}

// ---------- 工具 ----------
function randInt(min: number, max: number): number {
  min = Math.max(1, min || 1)
  max = Math.max(min, max || min)
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function clampMin(a: number, b: number): number {
  return Math.min(a || 1, b || 1)
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
/**
 * R8-20: URL 规范化用于"末章变更"增量比较 —— 剥离 scheme(http/https 等价)、
 * 去掉末尾斜杠、小写化 host, 避免"源站切换 https / 加减末尾斜杠"被误判为内容变更
 * 触发全量重采(浪费请求)。URL 解析失败返回原串(降级到原始比较, 保守视为有变更)。
 */
function normalizeUrlForCompare(u: string): string {
  if (!u) return ''
  try {
    const url = new URL(u)
    // host 小写 + path 去末尾斜杠 + search 保留(query 变化视为内容变化)
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}${url.search}`
  } catch { return u }
}
/** jj-d: 可中断批次间隔睡眠 — 停止/暂停/换代不再睡满 interval(修前 stop/pause 要等
 *  intervalMax 全额到点才在下一检查点生效, 长间隔配置下响应时延线性于 interval)。
 *  happy path(无控制信号)仍睡满原时长, 采集节奏零变化; 每 600ms 切片探测一次,
 *  与暂停等待循环同粒度; 暂停提前返回后由循环头部的暂停等待接管 */
async function sleepGap(ms: number, rt: TaskRuntime, myEpoch: number): Promise<void> {
  const deadline = Date.now() + Math.max(0, ms)
  while (Date.now() < deadline) {
    if (rt.stopped || rt.paused || rt.epoch !== myEpoch) return
    await sleep(Math.min(600, deadline - Date.now()))
  }
}

/**
 * feat-round-8: B1 — 抖动间隔计算
 *  - 基础抖动: base * (0.8 + random*0.4) ∈ [80%, 120%] base (per-request ±20%)
 *  - 额外抖动: jitterMs > 0 时叠加 random * jitterMs (0~jitterMs)
 * 两者叠加后作为 hostGate 的 minGapMs(闸门实际执行等待), 让请求节奏不规则,
 * 击败简单 rate-pattern 检测。即使任务配置固定 interval(intervalMin==intervalMax),
 * 实际出门间隔仍会变化。jitterMs 缺省 undefined 时仅 ±20% 抖动(零回归, 老 task 行为微变)。
 * [R30-3-E-B] FETCH_GAP_JITTER=1(缺省关): 基础抖动从 ±20% 拓宽到 ±30%
 * (base * (0.7 + random*0.6) ∈ [70%, 130%]) —— 固定宽度抖动窗仍是可聚类的节奏形态,
 * ±30% 更接近人类不均匀点击节奏; 期望值不变(仍为 base), 仅形态更散。关闭时与旧版逐字节一致。
 * export 供验证脚本单测分布边界(与 parseRetryAfterHeaderMs "导出供验证脚本直接单测"同款先例)
 */
const FETCH_GAP_JITTER_ENABLED = process.env.FETCH_GAP_JITTER === '1'
export function jitteredInterval(base: number, jitterMs?: number): number {
  const pct = FETCH_GAP_JITTER_ENABLED
    ? base * (0.7 + Math.random() * 0.6)
    : base * (0.8 + Math.random() * 0.4)
  const extra = typeof jitterMs === 'number' && jitterMs > 0 ? Math.random() * jitterMs : 0
  return Math.max(0, Math.round(pct + extra))
}

/**
 * [R36-2c-7] CRAWL_AUTOREFRESH_JITTER=1(缺省关): 自动刷新触发时刻随机化 ±10%(下限仍钳 5min)
 * —— autoRefresh 任务是同一 URL 集合的周期性重访者, 固定周期整点触发是可聚类机器指纹
 * (源站可见“每 30min 准时一波同 UA 同路径序列抓取”); 随机化后触发时刻在区间内不可预测。
 * 关闭时与原值逐字节一致。env 在函数内读取(非模块常量)供验证脚本双态直测;
 * export 同 jitteredInterval 先例(纯函数零状态)
 */
export function jitterAutoRefreshMs(baseMs: number): number {
  if (process.env.CRAWL_AUTOREFRESH_JITTER !== '1') return baseMs
  const jittered = Math.round(baseMs * (0.9 + Math.random() * 0.2))
  return Math.max(5 * 60_000, jittered)
}

/**
 * [R36-2c-8] CRAWL_BATCH_SHUFFLE=1(缺省关): 章节批次内顺序随机化(Fisher-Yates 原地洗牌)
 * —— 修前每批按目录 idx 升序出门, 源站可见“/book/1.html→/book/2.html→…”的完美递增访问
 * 序列(最强爬虫指纹之一; types.ts pathJitter 注释所称“runner 批次内随机洗牌”语义实际
 * 不存在, 本增强补齐)。仅打乱本批抓取顺序: 章节入库 idx/进度计数/txt 文件名均按各自
 * q.idx/独立计数, 与抓取顺序无关, 关闭时恒等返回原数组(零开销零回归)
 */
export function shuffleBatch<T>(arr: T[]): T[] {
  if (process.env.CRAWL_BATCH_SHUFFLE !== '1') return arr
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}
function safeJson<T>(s: string | null | undefined): Partial<T> {
  try { return s ? JSON.parse(s) : {} } catch { return {} }
}

function parseFetchOverride(raw: string | null | undefined): Partial<FetchConfig> {
  try {
    // 深消毒: task.fetchConfig 是管理员可编辑的 JSON 字符串, 脏值(字符串 "3" 作 retries
    // 参与 "3"+1="31" 次拼接/超大 timeout/未知键)经白名单重建后不再进入 fetcher
    return raw ? sanitizeFetchConfig(JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

function buildFetch(rule: RuleConfig, override: Partial<FetchConfig>): Partial<FetchConfig> {
  const merged: Partial<FetchConfig> = { ...rule.fetch, ...override }
  // [R28-4-E6] FETCH_DEFAULT_PROXY_URL 全局默认池: 规则与任务级 override 均未配 proxyUrl 时
  // 注入(env, 逗号分隔多条, 值过 parseProxyPool/isValidProxySpec 同款校验在 fetcher 消费侧
  // 逐条生效, 非法条目自然被剔除), 免"每条规则逐个填代理"的运维面。缺省未设 env 时行为零变化;
  // 回环目标在 fetcher 侧本就有 isLoopbackTarget 豁免, 默认池不影响 token 转换代理等回环链路
  if (!merged.proxyUrl) {
    const envPool = (process.env.FETCH_DEFAULT_PROXY_URL || '').trim()
    if (envPool) merged.proxyUrl = envPool
    // [R42-1-3] needsProxy 内存快照兜底(proxy-pool.getCachedProxyPoolSnapshot, 60s TTL):
    //  启动注入后代理中途全灭, 或启动时池空但此刻池已补充 → 最近一次池匹配结果同步顶上,
    //  不查库(mergedFetch 在每批 loadConfig 重建, 快照随保鲜循环自然刷新); 无快照直连降级
    if (!merged.proxyUrl && merged.needsProxy === true) {
      const snap = getCachedProxyPoolSnapshot(merged.proxyCountries || '')
      if (snap) merged.proxyUrl = snap
    }
  }
  return merged
}

/** Bug 5: 章节重排四阶段(阶段A/B/D + 分卷回填)的 .catch 收口 —— 修前 `.catch(() => {})`
 *  无差别吞掉所有 Prisma 异常, 真 DB 故障(连接断/磁盘满/约束违反非冲突类)被静默,
 *  重排中途连锁失败: 阶段A挪负位失败 → 阶段C建行撞 @@unique → 阶段D回填撞 @@unique,
 *  全部被吞, 书籍章节序号永久错乱且无任何日志/告警。
 *  仅放行预期错误:
 *    - P2025: 记录已不存在(任务/书籍/章节被并发删除)——重排的幂等语义, 正常
 *    - P2002: 唯一约束冲突(@@unique([bookId,idx]))——重排中转瞬态撞位, 正常
 *  其余(连接断/P2003 外键/P2014 无效关系/磁盘故障等)上抛, 中止本书重排走书籍级 error */
function swallowExpectedDb(e: any): void {
  if (e?.code === 'P2025' || e?.code === 'P2002') return // 预期: 记录已删/瞬态唯一冲突
  throw e // 真 DB 故障: 上抛中止本次重排(走 crawlOneBook catch → 书籍级 error)
}

