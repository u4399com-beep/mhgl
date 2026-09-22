// ============================================================
// 章节重排「规划 + 阶段E 保守闸」—— src/lib/crawl/chapter-reorder.ts 语义移植
// (R55-3a2; 纯函数: 无 IO / 无 DB)。
// 消费方: bridge chapters 回调 seq=1 全量形态(阶段A~E 的 DB 写入循环在 bridge.go)。
// 阶段语义(与 runner/chapter-reorder 历版注释一致):
//
//	A) 冲突旧章 → 负数临时位(tt-c 动态基线: 压到全书最小 idx 之下, 与存量行严格无交)
//	B) 占住新目标位/负位残留的陈旧章 → 挪尾(x-a: 目标位保留集含 moves)
//	C) 新章按最终 idx 建行
//	D) 旧章回填最终 idx + 分卷名回填(kk-a 只补空缺)
//	E) 目录外陈旧章清理(R36-2c-1 保守闸: 量闸+签名闸双命中才跳过删除)
//
// ============================================================
package bridge

import (
	"strings"

	"mhgl/internal/crawl/clean"
	"mhgl/internal/crawl/sorter"
	"mhgl/internal/store"
)

// plannedChapter 单个目录项归一化结果(title 已清洗 / volume 码点截断 120 / idx=目录序 1..n)。
// IsNew = 增量语义下的「新章」(isFull 恒 true / 增量=未命中既有章)。
type plannedChapter struct {
	Title  string
	URL    string
	Volume string
	Idx    int
	IsNew  bool
}

// chapterMove 阶段A/D 重排计划项
type chapterMove struct {
	ID string
	To int
}

// volumeBackfillItem kk-a 分卷名回填项
type volumeBackfillItem struct {
	ID     string
	Volume string
}

// chapterSyncPlan 重排计划
type chapterSyncPlan struct {
	// items 全部目录项(目录序)
	items []plannedChapter
	// creates 阶段C 建行清单(IsNew 且有 url); 增量 needUrls 亦从此取
	creates []plannedChapter
	// moves 阶段A/D 重排计划(序号变了才入列)
	moves []chapterMove
	// volumeBackfill kk-a 分卷名回填(旧章 volume 为空且本轮目录带卷名)
	volumeBackfill []volumeBackfillItem
}

// planChapterSync 匹配 + 重排计划构建(chapter-reorder.ts planChapterSync 逐语义移植):
// URL 精确命中优先(existUrlMap), 无 URL 章节按 volume+'\x00'+title 分卷内匹配
// ([R31-5-4] 同款键构); isFull 全部按新章处理(完全覆盖重建语义)。
func planChapterSync(tocItems []sorter.TocItem, existChapters []store.CrawlExistChapter, isFull bool, bookName string) chapterSyncPlan {
	existURLMap := map[string]store.CrawlExistChapter{}
	for _, c := range existChapters {
		if c.URL == "" {
			continue
		}
		existURLMap[c.URL] = c // 后行覆盖前行(与 TS Map 构造同语义)
	}
	// [R31-5-4] 键 volume+'\x00'+title(分卷内去重): '\x00' 不出现在正常标题/卷名中
	existTitleMap := map[string]store.CrawlExistChapter{}
	for _, c := range existChapters {
		existTitleMap[c.Volume+"\x00"+c.Title] = c
	}

	plan := chapterSyncPlan{
		items: make([]plannedChapter, 0, len(tocItems)),
	}
	for i, item := range tocItems {
		title := clean.CleanChapterTitle(item.Title, bookName)
		url := item.URL
		// [R25-5a] 码点截断替代 UTF-16 slice; kk-a: 分卷名随章落库
		volume := sorter.SliceCodePoints(strings.TrimSpace(item.Volume), 120)
		var old *store.CrawlExistChapter
		if url != "" {
			if c, ok := existURLMap[url]; ok {
				old = &c
			}
		} else if c, ok := existTitleMap[volume+"\x00"+title]; ok {
			old = &c
		}
		isNew := isFull || old == nil
		entry := plannedChapter{Title: title, URL: url, Volume: volume, Idx: i + 1, IsNew: isNew}
		plan.items = append(plan.items, entry)
		if isNew {
			// 全量: 全部重建 / 增量: 只采不存在的(建行需 url)
			if url != "" {
				plan.creates = append(plan.creates, entry)
			}
		} else if old != nil {
			if old.Idx != entry.Idx {
				plan.moves = append(plan.moves, chapterMove{ID: old.ID, To: entry.Idx})
			}
			// kk-a: 重排与原位不变的既有章都补空缺分卷名
			if volume != "" && old.Volume == "" {
				plan.volumeBackfill = append(plan.volumeBackfill, volumeBackfillItem{ID: old.ID, Volume: volume})
			}
		}
	}
	return plan
}

// chapterTempBase 阶段A 临时负位基线(tt-c 动态基线): 临时位全部压到当前全书最小 idx
// 之下(含崩溃残留负位), 与任何存量行严格无交 —— 修前固定分配 -(mi+1) 在重排中途被杀后
// 会与残留负位 P2002 撞车。
func chapterTempBase(existChapters []store.CrawlExistChapter, moveCount int) int {
	minExistIdx := 0
	for _, c := range existChapters {
		if c.Idx < minExistIdx {
			minExistIdx = c.Idx
		}
	}
	return minExistIdx - moveCount - 1
}

// tailMove 阶段B 挪尾项(插入序=existChapters 序, 与修前逐条 update 落库顺序一致)
type tailMove struct {
	ID     string
	TailID int
}

// chapterTailMoves 阶段B 挪尾计划(纯计算): 与新行 idx 冲突、但已不在当前目录中的陈旧章
// (以及负位残留章)→ 挪到尾部大序号位。目标位保留集含 moves.to(x-a 高危修复):
// 修前只含 creates 会让占位陈旧章在阶段D 回填时撞 @@unique([bookId,idx]) 永久卡负位。
func chapterTailMoves(existChapters []store.CrawlExistChapter, plan chapterSyncPlan) []tailMove {
	movedIDs := map[string]struct{}{}
	for _, m := range plan.moves {
		movedIDs[m.ID] = struct{}{}
	}
	newTargetIdx := map[int]struct{}{}
	for _, c := range plan.creates {
		newTargetIdx[c.Idx] = struct{}{}
	}
	for _, m := range plan.moves {
		newTargetIdx[m.To] = struct{}{}
	}
	maxExistIdx := 0
	for _, c := range existChapters {
		if c.Idx > maxExistIdx {
			maxExistIdx = c.Idx
		}
	}
	tailIdx := len(plan.items)
	if maxExistIdx > tailIdx {
		tailIdx = maxExistIdx
	}
	var out []tailMove
	for _, c := range existChapters {
		if _, moved := movedIDs[c.ID]; moved {
			continue
		}
		// tt-c 增强: 负 idx 残留章(历史重排中途被杀遗留)也是非法位, 一并治愈挪尾
		_, conflict := newTargetIdx[c.Idx]
		if conflict || c.Idx < 0 {
			tailIdx++
			out = append(out, tailMove{ID: c.ID, TailID: tailIdx})
		}
	}
	return out
}

// staleTailGuard [R36-2c-1] 阶段E 批量删除安全闸决策(统一保守闸, 语义权威=runner 版):
// ① 量闸: staleCount > max(50, 30%×既有章节数); ② 签名闸: creates ≤ 10%×tocLen
// (本轮目录 ≥90% 精确命中 = 前缀子集特征); 两闸同时命中才跳过删除(保留数据+告警)。
func staleTailGuard(staleCount, baseline, createsLen, tocLen int) (skip bool, threshold int) {
	threshold = maxInt(50, maxInt(0, baseline)*3/10)
	truncatedSignature := tocLen > 0 && createsLen <= tocLen*10/100
	return staleCount > threshold && truncatedSignature, threshold
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
