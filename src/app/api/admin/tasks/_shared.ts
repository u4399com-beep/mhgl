// 任务创建/更新入参规范化 (POST/PUT 共用)
import { clampInt, str, httpUrl, isPlainObject } from '../../_lib/http'
// [R34-2a-3] 书号采集: 书号解析/规范化与引擎(runner)、前端(TaskWizard/TaskDialog)共用同一纯函数模块
// [R35-2a-3] 书号范围: parseBookIdRange 与引擎(runner)、前端共用同一校验口径
import {
  parseBookIdList,
  parseBookIdRange,
  BOOK_ID_MAX_LEN,
  BOOK_ID_MAX_COUNT,
  BOOK_ID_PLACEHOLDER,
} from '@/lib/book-ids'

// [R31-5-0] 补 'interrupted'(R31-3 移交项①): recovery.ts 服务重启后把孤儿 running 标为
//  'interrupted', 列表路由 GET ?status= 过滤白名单按本数组执法, 缺值会导致中断任务筛不出来。
//  注: normalizeTaskData 不校验/不接受 status 字段(状态只由 runner 控制链与恢复机制写入),
//  validateTaskPair 亦不涉及, 扩值对创建/更新入参校验零影响
export const TASK_STATUSES = ['pending', 'running', 'paused', 'stopped', 'done', 'error', 'interrupted'] as const

export interface NormalizedTask {
  name: string
  // [R34-2a-3] 扩 'bookIds'(书号): bookUrl 复用存「书籍页 URL 模板」(必含 {bookId}), 零新增 URL 列
  mode: 'single' | 'range' | 'bookIds'
  bookUrl: string
  // [R34-2a-3] 书号原文(规范化后为换行分隔的去重书号列表; 非 bookIds 模式恒空串)
  bookIds: string
  // [R35-2a-3] 书号范围(bookIds 模式范围子形态): 存数字字符串(trim); 两者均非空=范围形式,
  //  与 bookIds 列表互斥(validateTaskPair 执法); 非 bookIds 模式恒空串
  bookIdFrom: string
  bookIdTo: string
  listUrl: string
  listStart: number
  listEnd: number
  bookStart: number
  bookEnd: number
  recrawlMode: 'full' | 'incremental'
  storageMode: 'db' | 'txt'
  fetchConfig: string
  threadMin: number
  threadMax: number
  intervalMin: number
  intervalMax: number
  smartCategory: boolean
  smartComplete: boolean
  autoSuggest: boolean
}

/**
 * 任务字段白名单规范化: 全量模式(POST)时给默认值, 增量模式(PUT)时仅返回出现的字段。
 * 返回 { data, error } — error 为面向用户的错误消息。
 */
export function normalizeTaskData(
  body: Record<string, any>,
  mode: 'full' | 'partial'
): { data: Partial<NormalizedTask> & Record<string, unknown>; error?: string } {
  const out: Record<string, unknown> = {}
  const full = mode === 'full'

  // 名称
  if (full || body?.name !== undefined) {
    const name = str(body?.name, 100).trim()
    if (!name) return { data: {}, error: '任务名称必填' }
    out.name = name
  }

  // 模式(显式提供非法值时报错, 不静默改写为 range 造成误解)
  // [R34-2a-3] 白名单扩 'bookIds'(书号); 缺省/未提供时仍回退 'range'(与既有 full 缺省语义逐字节一致)
  if (full || body?.mode !== undefined) {
    if (body?.mode !== undefined && !['single', 'range', 'bookIds'].includes(body.mode)) {
      return { data: {}, error: '采集模式必须是 single(单本)、range(范围) 或 bookIds(书号)' }
    }
    out.mode = ['single', 'range', 'bookIds'].includes(body?.mode) ? body.mode : 'range'
  }

  // URL 字段: 必须是合法 http(s) 或空串
  if (full || body?.bookUrl !== undefined) {
    const u = httpUrl(body?.bookUrl) || ''
    if (body?.bookUrl && !u) return { data: {}, error: '书籍页URL格式非法(需 http/https)' }
    out.bookUrl = u
  }
  if (full || body?.listUrl !== undefined) {
    const u = httpUrl(body?.listUrl) || ''
    if (body?.listUrl && !u) return { data: {}, error: '列表页URL格式非法(需 http/https)' }
    out.listUrl = u
  }

  // [R34-2a-3] 书号采集: 书号原文规范化 —— 混合分隔符拆分(空白/逗号/顿号/分号)→trim→去空→去重(保序)
  //  → 单项≤200 字→去重后总数≤2000(超限报错)→ 换行 join 写回, 保证 UI 与 runner 拿到干净数据。
  //  httpUrl 已把 {bookId} 字面还原(R12-a-1 %7B/%7D 还原口径), 模板占位符在存库/回显/替换各环节保持原样
  if (full || body?.bookIds !== undefined) {
    const raw = typeof body?.bookIds === 'string' ? body.bookIds : body?.bookIds == null ? '' : String(body.bookIds)
    const ids = parseBookIdList(raw)
    const tooLong = ids.find((id) => id.length > BOOK_ID_MAX_LEN)
    if (tooLong) return { data: {}, error: `单个书号长度超过 ${BOOK_ID_MAX_LEN} 字符上限` }
    if (ids.length > BOOK_ID_MAX_COUNT) {
      return { data: {}, error: `书号数量超过上限(去重后 ${ids.length} 个, 最多 ${BOOK_ID_MAX_COUNT} 个)` }
    }
    out.bookIds = ids.join('\n')
  }

  // [R35-2a-3] 书号范围端点规范化: trim 存数字字符串(空串=未用范围形式), 与 bookIds 既有语义对齐:
  //  full 恒输出(空串或值), partial 仅显式携带时输出(不误清空)。纯数字/互斥/上限等语义校验统一
  //  由 validateTaskPair 用合并后生效值调 parseBookIdRange 执法(保证 PUT 合并场景同一口径),
  //  本段只做形态规范化
  if (full || body?.bookIdFrom !== undefined) {
    const raw =
      typeof body?.bookIdFrom === 'string'
        ? body.bookIdFrom.trim()
        : body?.bookIdFrom == null
          ? ''
          : String(body.bookIdFrom).trim()
    out.bookIdFrom = raw
  }
  if (full || body?.bookIdTo !== undefined) {
    const raw =
      typeof body?.bookIdTo === 'string'
        ? body.bookIdTo.trim()
        : body?.bookIdTo == null
          ? ''
          : String(body.bookIdTo).trim()
    out.bookIdTo = raw
  }

  // 页码/序号范围: 钳制 + 起≥止自动交换
  if (full || body?.listStart !== undefined) out.listStart = clampInt(body?.listStart, 1, 1, 100_000)
  if (full || body?.listEnd !== undefined) out.listEnd = clampInt(body?.listEnd, 1, 1, 100_000)
  if (Number(out.listEnd) < Number(out.listStart)) {
    const s = out.listStart
    out.listStart = out.listEnd
    out.listEnd = s
  }
  if (full || body?.bookStart !== undefined) out.bookStart = clampInt(body?.bookStart, 0, 0, 100_000)
  if (full || body?.bookEnd !== undefined) out.bookEnd = clampInt(body?.bookEnd, 0, 0, 100_000)
  if (
    Number(out.bookStart) > 0 && Number(out.bookEnd) > 0 &&
    Number(out.bookEnd) < Number(out.bookStart)
  ) {
    const s = out.bookStart
    out.bookStart = out.bookEnd
    out.bookEnd = s
  }

  // 枚举
  if (full || body?.recrawlMode !== undefined) {
    out.recrawlMode = body?.recrawlMode === 'full' ? 'full' : 'incremental'
  }
  if (full || body?.storageMode !== undefined) {
    out.storageMode = body?.storageMode === 'txt' ? 'txt' : 'db'
  }

  // 反反爬覆盖配置: 对象→JSON, 大小限制
  if (full || body?.fetchConfig !== undefined) {
    if (isPlainObject(body?.fetchConfig)) {
      const s = JSON.stringify(body.fetchConfig)
      if (s.length > 50_000) return { data: {}, error: '反反爬配置过大' }
      out.fetchConfig = s
    } else if (typeof body?.fetchConfig === 'string') {
      if (body.fetchConfig.length > 50_000) return { data: {}, error: '反反爬配置过大' }
      out.fetchConfig = body.fetchConfig
    } else {
      out.fetchConfig = '{}'
    }
  }

  // 线程/间隔: 钳制 + min≤max
  if (full || body?.threadMin !== undefined) out.threadMin = clampInt(body?.threadMin, 1, 1, 32)
  if (full || body?.threadMax !== undefined) out.threadMax = clampInt(body?.threadMax, 3, 1, 32)
  if (Number(out.threadMax) < Number(out.threadMin)) out.threadMax = out.threadMin
  if (full || body?.intervalMin !== undefined) out.intervalMin = clampInt(body?.intervalMin, 500, 0, 600_000)
  if (full || body?.intervalMax !== undefined) out.intervalMax = clampInt(body?.intervalMax, 2000, 0, 600_000)
  if (Number(out.intervalMax) < Number(out.intervalMin)) out.intervalMax = out.intervalMin

  // 开关
  if (full || body?.smartCategory !== undefined) out.smartCategory = body?.smartCategory !== false
  if (full || body?.smartComplete !== undefined) out.smartComplete = body?.smartComplete !== false
  if (full || body?.autoSuggest !== undefined) out.autoSuggest = body?.autoSuggest !== false

  // 自动刷新(jj-e 实时更新): 完成后按分钟间隔自动重启; 间隔钳 5~1440
  if (full || body?.autoRefresh !== undefined) out.autoRefresh = body?.autoRefresh === true
  if (full || body?.refreshIntervalMin !== undefined) {
    out.refreshIntervalMin = clampInt(body?.refreshIntervalMin, 30, 5, 1440)
  }

  return { data: out }
}

/** 模式与URL联动校验(用合并后的生效值调用) */
export function validateTaskPair(
  mode: string | undefined,
  bookUrl: string | undefined,
  listUrl: string | undefined,
  // [R34-2a-3] 书号采集联动校验入参(合并后的生效值); 旧调用点(不传)对 single/range 零影响
  bookIds?: string,
  // [R35-2a-3] 书号范围端点(合并后的生效值): bookIds 模式下列表与范围二选一互斥执法
  bookIdFrom?: string,
  bookIdTo?: string
): string | undefined {
  if (mode === 'single' && !bookUrl) return '单本模式必须填写书籍页URL'
  // [R12-a-4] 文案补充占位符语义: 引擎仅自动替换 {page}/{offset:N}(R12-a-2 起任务级
  //  listUrl 覆盖规则模板), {cat} 等其他花括号写法不会被替换, 需写成具体值
  if (mode === 'range' && !listUrl) return '范围模式必须填写列表页URL(仅 {page}/{offset:N} 会被自动替换)'
  // [R34-2a-3] 书号模式: bookUrl 复用为「书籍页 URL 模板」, 必含 {bookId} 字面量; 书号原文(解析后)非空
  if (mode === 'bookIds') {
    if (!bookUrl || !bookUrl.includes(BOOK_ID_PLACEHOLDER)) {
      return `书号采集必须填写书籍页URL模板(需含 ${BOOK_ID_PLACEHOLDER} 占位符)`
    }
    // [R35-2a-3] 列表与范围二选一: 范围端点任一非空即视为用了范围形式, 此时列表必须为空;
    //  范围合法性(纯数字/起止齐备/from≤to/≤2000)透传 parseBookIdRange 的精确文案;
    //  两者都空沿用既有「书号采集必须填写书号列表」文案
    const from = (bookIdFrom ?? '').trim()
    const to = (bookIdTo ?? '').trim()
    const listCount = parseBookIdList(bookIds).length
    if ((from || to) && listCount > 0) return '书号列表与书号范围只能二选一'
    if (from || to) {
      const range = parseBookIdRange(from, to)
      if (!range.ok) return range.error
      return undefined
    }
    if (listCount === 0) return '书号采集必须填写书号列表'
  }
  return undefined
}
