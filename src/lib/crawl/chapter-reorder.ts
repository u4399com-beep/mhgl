// ============================================================
// [R51-4] 章节重排「规划 + 阶段E 保守闸」单一实现(纯函数: 无 IO / 无 DB / 不 import runner)
// 消费方: ① runner.ts crawlOneBookMeta 阶段A~E(TS 引擎, 语义权威)
//        ② api/admin/tasks/go-callback/route.ts handleChapters(Go 引擎回调, runner 语义对齐)
// 修前两处各 ~80 行同构规划代码 + 保守闸阈值漂移(runner: max(50,30%)+creates≤10% 签名闸;
// go-callback: max(10,20%) 无签名) —— 本模块统一为 runner 口径, 两侧只保留 DB 写入循环与
// 各自的 stop/epoch 检查/错误吞噬策略。
// 阶段语义(与 runner 历版注释一致):
//   A) 冲突旧章 → 负数临时位(tt-c 动态基线: 压到全书最小 idx 之下, 与存量行严格无交)
//   B) 占住新目标位/负位残留的陈旧章 → 挪尾(x-a: 目标位保留集含 moves)
//   C) 新章按最终 idx 建行
//   D) 旧章回填最终 idx + 分卷名回填(kk-a 只补空缺)
//   E) 目录外陈旧章清理(R36-2c-1 保守闸: 量闸+签名闸双命中才跳过删除)
// ============================================================
import type { TocItem } from './types'
import { cleanChapterTitle } from './cleaner'
import { sliceCodePoints } from '@/lib/utils'

/** 既有章节行形态(runner db.chapter.findMany select 与 go-callback ExistChapter 同构) */
export interface ReorderExistChapter {
  id: string
  url: string
  title: string
  idx: number
  volume: string
  fetched: boolean
}

/** 单个目录项归一化结果(title 已清洗 / volume 码点截断 120 / idx=目录序 1..n)。
 *  isNew = 增量语义下的「新章」(isFull 恒 true / 增量=未命中既有章): runner 正文队列
 *  (isFull || !old 才入队)与 go-callback 建行共用此判定 */
export interface PlannedChapter {
  title: string
  url: string
  volume: string
  idx: number
  isNew: boolean
}

export interface ChapterSyncPlan {
  /** 全部目录项(目录序): runner 全量形态正文队列 = items.filter(isNew)(isFull 时=全部) */
  items: PlannedChapter[]
  /** 阶段C 建行清单(isNew 且有 url): 增量 needUrls 亦从此取 */
  creates: PlannedChapter[]
  /** 阶段A/D 重排计划: 既有章 → 新目标位(序号变了才入列) */
  moves: { id: string; to: number }[]
  /** kk-a 分卷名回填(旧章 volume 为空且本轮目录带卷名) */
  volumeBackfill: { id: string; volume: string }[]
}

/** 匹配 + 重排计划构建(runner 与 go-callback 修前同构循环的单一实现):
 *  URL 精确命中优先(existUrlMap), 无 URL 章节按 volume+'\u0000'+title 分卷内匹配
 *  ([R31-5-4] P1-6 同款键构); isFull 全部按新章处理(完全覆盖重建语义) */
export function planChapterSync(
  tocItems: TocItem[],
  existChapters: ReorderExistChapter[],
  opts: { isFull: boolean; bookName?: string },
): ChapterSyncPlan {
  const existUrlMap = new Map(existChapters.filter((c) => c.url).map((c) => [c.url, c]))
  // [R31-5-4] 键 volume+'\u0000'+title(分卷内去重): '\u0000' 不出现在正常标题/卷名中,
  //  (volume,title) 与键一一对应; 同卷同名章仍按 Map 后行覆盖前行去重(与历史语义一致)
  const existTitleMap = new Map(existChapters.map((c) => [`${c.volume ?? ''}\u0000${c.title ?? ''}`, c]))

  const items: PlannedChapter[] = []
  const creates: PlannedChapter[] = []
  const moves: { id: string; to: number }[] = []
  const volumeBackfill: { id: string; volume: string }[] = []
  for (let i = 0; i < tocItems.length; i++) {
    const item = tocItems[i]
    const title = cleanChapterTitle(item.title, opts.bookName)
    const url = item.url
    // [R25-5a] 码点截断替代 UTF-16 slice(emoji 代理对斩半风险); kk-a: 分卷名随章落库
    const volume = sliceCodePoints((item.volume || '').trim(), 120)
    const old = url ? existUrlMap.get(url) : existTitleMap.get(`${volume}\u0000${title}`)
    const isNew = opts.isFull || !old
    const entry: PlannedChapter = { title, url, volume, idx: i + 1, isNew }
    items.push(entry)
    if (isNew) {
      // 全量: 全部重建 / 增量: 只采不存在的(建行需 url; 无 url 项仅进 runner 队列由下游兜底)
      if (url) creates.push(entry)
    } else if (old) {
      if (old.idx !== entry.idx) {
        // 已存在但序号变了: 记录重排计划(阶段A/D 执行)
        moves.push({ id: old.id, to: entry.idx })
      }
      // kk-a: 重排与原位不变的既有章都补空缺分卷名(规则新增 volume 提取后旧章 volume 为空)
      if (volume && !old.volume) volumeBackfill.push({ id: old.id, volume })
    }
  }
  return { items, creates, moves, volumeBackfill }
}

/** 阶段A 临时负位基线(tt-c 动态基线): 临时位全部压到当前全书最小 idx 之下(含崩溃残留负位),
 *  与任何存量行严格无交 —— 修前固定分配 -(mi+1) 在重排中途被杀后会与残留负位 P2002 撞车 */
export function chapterTempBase(existChapters: ReorderExistChapter[], moveCount: number): number {
  const minExistIdx = existChapters.reduce((mn, c) => Math.min(mn, c.idx), 0)
  return minExistIdx - moveCount - 1
}

/** 阶段B 挪尾计划(纯计算): 与新行 idx 冲突、但已不在当前目录中的陈旧章(以及负位残留章)
 *  → 挪到尾部大序号位。返回 Map<章节id, 目标尾idx>(插入序=existChapters 序, 与修前逐条
 *  update 的落库顺序一致)。修前(x-a 高危): 目标位保留集只含 creates 不含 moves 会让占位
 *  陈旧章在阶段D 回填时撞 @@unique([bookId,idx]) 永久卡负位 —— 本函数已含 moves.to。 */
export function chapterTailMoves(
  existChapters: ReorderExistChapter[],
  plan: ChapterSyncPlan,
): Map<string, number> {
  const movedIds = new Set(plan.moves.map((m) => m.id))
  const newTargetIdx = new Set<number>(plan.creates.map((c) => c.idx))
  for (const m of plan.moves) newTargetIdx.add(m.to)
  const tailMoves = new Map<string, number>()
  let tailIdx = Math.max(plan.items.length, existChapters.reduce((mx, c) => Math.max(mx, c.idx), 0), 0)
  for (const c of existChapters) {
    if (movedIds.has(c.id)) continue
    // tt-c 增强: 负 idx 残留章(历史重排中途被杀遗留)也是非法位(章序必须 ≥1), 一并治愈挪尾
    if (newTargetIdx.has(c.idx) || c.idx < 0) {
      tailIdx += 1
      tailMoves.set(c.id, tailIdx)
    }
  }
  return tailMoves
}

/** [R36-2c-1] 阶段E 批量删除安全闸决策(统一保守闸, 语义权威=runner 版; export 供验证脚本单测):
 *  修前阶段E 无条件 deleteMany(idx>tocItems.length 且 url 不在当前目录) —— 目录解析
 *  截断/中途失败时(本轮 TOC 只是既有章节的前缀子集), 整本书尾部正章会被当"陈旧章"
 *  批量清掉(实例链路: 翻页中一跳瞬断→TOC 只剩前 N 页→N 章之后全部被删, R35-2c-1
 *  已证明该截断形态真实存在)。判据双闸:
 *  ① 量闸: staleCount > max(50, 30%×既有章节数) —— 正常"源站删了少量旧章"远够不着;
 *  ② 签名闸: creates ≤ 10%×tocLen(本轮目录 ≥90% 与既有章节按 URL/标题精确命中 =
 *     前缀子集特征) —— 源站全量换 URL(迁移)时 creates≈全部, 不拦截(保留原删除+重采语义);
 *  两闸同时命中才跳过删除(保留数据+告警), 其余场景行为与修前逐字节一致。
 *  [R51-4] go-callback 修前为 max(10,20%) 无签名闸(漂移), 本统一即审计认定的收紧方向。 */
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
