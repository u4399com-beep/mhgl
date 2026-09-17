// ============================================================
// [R34-2a-2] 书号采集(mode='bookIds')共用纯函数模块
// 消费方: src/app/api/admin/tasks/_shared.ts(API 入参规范化)
//        src/components/admin/TaskWizard.tsx / TaskDialog.tsx(UI 实时计数)
//        src/lib/crawl/runner.ts(书籍页队列构建)
// 零依赖纯模块(不 import 任何运行时), 客户端/服务端均可安全引用。
// ============================================================

/** 书号原文分隔符: 空白(含换行)/半角逗号/全角逗号/顿号/半角分号/全角分号
 * [R36-2d-6] 仅本模块内部消费(parseBookIdList), rg 实证零外引 → 去导出 */
const BOOK_ID_SPLIT_RE = /[\s,，、;；]+/
/** 单个书号长度上限(超限整条报错, 防把整段文本误当书号灌库) */
export const BOOK_ID_MAX_LEN = 200
/** 单任务书号总数上限(去重后, 超限报错; 仅约束书号列表形式 —— 范围形式上限已取消 [R37-1]) */
export const BOOK_ID_MAX_COUNT = 2000
/** [R35-2a-1] 书号范围端点形态: 纯数字 1~12 位(非负整数; 12 位可容纳常见站点的数字书号) */
export const BOOK_ID_DIGITS_RE = /^\d{1,12}$/
/** 书籍页 URL 模板占位符字面量(bookIds 模式 bookUrl 必含) */
export const BOOK_ID_PLACEHOLDER = '{bookId}'

/**
 * 书号原文解析: 按 BOOK_ID_SPLIT_RE 拆分 → trim → 去空 → 去重(保序)。
 * 与 tasks/_shared.ts normalizeTaskData 的入库规范化、runner.ts 的队列构建共用同一口径,
 * 保证 UI 实时计数 / API 校验 / 引擎建队列三方看到一致结果。
 */
export function parseBookIdList(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  if (!raw) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(BOOK_ID_SPLIT_RE)) {
    const id = part.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * 书籍页 URL 模板渲染: 把模板中的 {bookId} 占位符替换为 encodeURIComponent(书号)。
 * 使用 split/join 实现全局替换(模板中多处出现同换), 与 {page} 的 replaceAll 口径一致。
 * [R36-2d-6] 仅本模块内部消费(buildBookIdQueue/buildBookIdRangeQueue), rg 实证零外引 → 去导出
 */
function renderBookIdTemplate(template: string, id: string): string {
  return String(template || '').split(BOOK_ID_PLACEHOLDER).join(encodeURIComponent(id))
}

/**
 * 书号采集队列构建: 解析书号原文 → 逐个渲染模板 → 渲染后去重(保序)。
 * runner.ts bookIds 分支的直接实现(抽出为纯函数便于独立验证);
 * encodeURIComponent 对互异输入是单射('%' 自身被编码为 %25), 理论上不碰撞,
 * 渲染后 Set 去重属防御性口径(与 range 分支 Array.from(new Set(...)) 一致)。
 */
export function buildBookIdQueue(raw: unknown, template: string): string[] {
  const ids = parseBookIdList(raw)
  const queue = ids.map((id) => renderBookIdTemplate(template, id))
  return Array.from(new Set(queue))
}

/**
 * [R35-2a-1] 书号范围校验: trim → 纯数字非负整数(BOOK_ID_DIGITS_RE, 1~12 位) → from≤to。
 *  [R37-1] 展开本数上限已取消(用户指令): 不再限制 to-from+1 ≤ 2000, 端点仍限 12 位纯数字
 *  (内存安全由 runner 虚拟队列保障 —— 见 buildBookIdRangeQueue, 不物化数组永不 OOM)。
 *  各失败分支返回精确中文错误文案(与既有 bookIds 校验文案同风格),
 *  供 API(validateTaskPair)/UI(向导与对话框实时提示)共用。
 *  成功时返回数字形态端点(前导零按十进制数值口径归一, 展开/渲染均以数字为准)。
 */
export function parseBookIdRange(
  from: unknown,
  to: unknown,
): { ok: true; from: number; to: number; count: number } | { ok: false; error: string } {
  const f = typeof from === 'string' ? from.trim() : from == null ? '' : String(from).trim()
  const t = typeof to === 'string' ? to.trim() : to == null ? '' : String(to).trim()
  if (!f || !t) return { ok: false, error: '书号范围必须同时填写起始书号与结束书号' }
  if (!BOOK_ID_DIGITS_RE.test(f) || !BOOK_ID_DIGITS_RE.test(t)) {
    return { ok: false, error: '书号范围必须为非负整数(纯数字, 不含小数点/正负号等, 最多 12 位)' }
  }
  const fn = Number(f)
  const tn = Number(t)
  if (fn > tn) return { ok: false, error: '起始书号不能大于结束书号' }
  // [R37-1] 不再做本数上限拦截(原 ≤2000 闸已按用户指令移除)
  return { ok: true, from: fn, to: tn, count: tn - fn + 1 }
}

/** [R37-1] 书号范围虚拟队列描述符: length O(1), at(i) 按需现算, 零物化(不建数组) */
export interface BookIdRangeQueue {
  /** 队列总长(去重等价口径, 见下) */
  length: number
  /** 第 i 个队列元素(0 起; i 越界行为与数组读越界同: 调用方循环边界保证不越界) */
  at: (i: number) => string
}

/**
 * [R37-1] 书号范围虚拟队列(替代旧物化版 buildBookIdQueueFromRange):
 *  旧实现把 from..to 逐个渲染模板后 Set 去重灌 string[](取消上限后 12 位端点理论上
 *  可展开 10^12 条 URL → 毫秒级 OOM), 改为惰性描述符 —— 逐本循环按 bi 现算 URL。
 *  与旧物化口径逐字节等价:
 *  · 模板含 {bookId}: encodeURIComponent 对互异输入单射 → 渲染结果天然互异,
 *    length = to-from+1(即旧 Set 去重后的长度), at(i) = render(from+i);
 *  · 模板不含 {bookId}(含空模板): 渲染结果与书号无关恒为模板字面 → 旧 Set 去重
 *    折叠为单元素, length = 1, at(0) = 模板字面。
 *  runner.ts bookIds 分支范围形式(bookIdFrom/bookIdTo 均非空)的直接实现。
 */
export function buildBookIdRangeQueue(from: number, to: number, template: string): BookIdRangeQueue {
  const tpl = String(template || '')
  const collapsed = !tpl.includes(BOOK_ID_PLACEHOLDER)
  return {
    length: collapsed ? 1 : to - from + 1,
    at: (i: number) => (collapsed ? tpl : renderBookIdTemplate(tpl, String(from + i))),
  }
}
