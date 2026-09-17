// ============================================================
// [R34-2a-2] 书号采集(mode='bookIds')共用纯函数模块
// 消费方: src/app/api/admin/tasks/_shared.ts(API 入参规范化)
//        src/components/admin/TaskWizard.tsx / TaskDialog.tsx(UI 实时计数)
//        src/lib/crawl/runner.ts(书籍页队列构建)
// 零依赖纯模块(不 import 任何运行时), 客户端/服务端均可安全引用。
// ============================================================

/** 书号原文分隔符: 空白(含换行)/半角逗号/全角逗号/顿号/半角分号/全角分号 */
export const BOOK_ID_SPLIT_RE = /[\s,，、;；]+/
/** 单个书号长度上限(超限整条报错, 防把整段文本误当书号灌库) */
export const BOOK_ID_MAX_LEN = 200
/** 单任务书号总数上限(去重后, 超限报错) */
export const BOOK_ID_MAX_COUNT = 2000
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
 */
export function renderBookIdTemplate(template: string, id: string): string {
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
