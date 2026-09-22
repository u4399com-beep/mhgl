// ============================================================
// 三模式队列构建 — 契约 §5
//
//	single : 队列 = [bookUrl]
//	bookIds: 列表形态 bookIds[] / 范围形态 from..to 展开 → 渲染 {bookId}
//	         (encodeURIComponent) → 渲染后去重保序(10 万级平稳: 纯串操作)
//	range  : 逐页抓 listUrl({page}/{offset:N} 渲染, 页序 listStart..listEnd)
//	         → parseList 出书 → bookStart/bookEnd 序号过滤(1-based, 0=不限, 全局切片)
//	         → 已发现 URL 去重 → 全部入 book 队列
//
// ============================================================
package task

import (
	"fmt"
	"math/rand"
	"time"

	"mhgl/internal/crawl/rule"
	"mhgl/internal/crawl/util"
)

// discovery 常量(对齐 TS runner: DISCOVERY_FAIL_CIRCUIT=20/空页熔断)
const (
	discoveryMaxURLs     = 500000 // range 发现单轮上限(TS DISCOVERY_MAX_URLS 同量级)
	discoveryFailCircuit = 20     // 连续列表页抓取失败 → 判定源站不可用, 提前终止翻页
	discoveryEmptyBreak  = 3      // 连续空页 → 判定已越过站点末页, 提前终止翻页
)

// buildQueue 按模式构建书籍队列(返回去重保序 URL 列表)
func (t *Task) buildQueue() ([]string, error) {
	switch t.info.Mode {
	case "single":
		// single: 队列 = [bookUrl](占位符已渲染后的单本地址)
		return []string{t.info.BookURL}, nil

	case "bookIds":
		return t.buildBookIdsQueue()

	case "range":
		return t.buildRangeQueue()

	default:
		// Validate 已拦截, 防御兜底
		return nil, fmt.Errorf("不支持的 task.mode: %s", t.info.Mode)
	}
}

// buildBookIdsQueue 书号模式队列: 列表形态/范围形态互斥, 渲染后去重保序(契约 §5)。
// 范围形态跨度校验(R51-2-b P1-4): to-from+1 > 10万 → error fail-closed(错误信息说明上限;
// parseIDInt 溢出鈾 1<<62 直灌无上限 for 循环可砖化引擎 OOM 崩溃重启环)
func (t *Task) buildBookIdsQueue() ([]string, error) {
	template := t.info.BookURL // bookIds 模式 bookUrl 即模板(契约 §3)
	if len(t.info.BookIds) > 0 {
		// 列表形态: 已展开去重的书号列表 → 渲染 {bookId} → 渲染后二次去重保序
		return rule.BuildBookIdQueue(t.info.BookIds, template), nil
	}
	// 范围形态: from..to 数字展开(Validate 已拦截跨度; 此处二次防线同口径)
	from := parseIDInt(t.info.BookIdFrom)
	to := parseIDInt(t.info.BookIdTo)
	if to < from {
		from, to = to, from
	}
	if int64(to)-int64(from)+1 > rule.BookIDMaxSpan {
		return nil, fmt.Errorf("bookId 范围跨度过大(to-from+1=%d > 上限 %d), 请分批任务(书号范围 fail-closed 拒绝)",
			int64(to)-int64(from)+1, int64(rule.BookIDMaxSpan))
	}
	return rule.BuildBookIdQueueFromRange(int64(from), int64(to), template), nil
}

// buildRangeQueue range 模式发现: 逐页抓取列表页 → parseList → 去重 → 序号过滤。
// 支持暂停/停止等待门(页边界); 失败/空页熔断防死循环
func (t *Task) buildRangeQueue() ([]string, error) {
	listTpl := t.info.ListURL
	if listTpl == "" {
		listTpl = t.ruleC.List.UrlTemplate // task.listUrl 缺省回退规则列表模板
	}
	t.setPhase("discovery", fmt.Sprintf("列表发现: P%d~P%d", t.info.ListStart, t.info.ListEnd))

	seen := make(map[string]struct{}, 1024) // 进度集合: map[string]struct{}(内存纪律)
	var urls []string
	failStreak, emptyStreak := 0, 0

	for page := t.info.ListStart; page <= t.info.ListEnd; page++ {
		if !t.gate() { // 暂停/停止等待门(页边界; stop 后以已发现部分收尾——stop 语义优先)
			break
		}
		pageURL := rule.ExpandListURL(listTpl, page)
		if rule.HasUnrecognizedPlaceholder(pageURL) {
			t.logf("warn", "列表页 P%d 模板残留未知占位符(按原样请求): %s", page, util.TruncateLog(pageURL, 120))
		}
		res, err := t.fetcher.Fetch(t.ctx, pageURL, "")
		if err != nil {
			failStreak++
			t.mu.Lock()
			t.stats.Errors++
			t.mu.Unlock()
			t.logf("error", "列表页 P%d 抓取失败(%d/%d 连败): %v", page, failStreak, discoveryFailCircuit, err)
			if failStreak >= discoveryFailCircuit {
				t.logf("warn", "连续 %d 页列表抓取失败, 判定源站不可用, 提前终止翻页(已发现 %d 本)", failStreak, len(urls))
				break
			}
			continue
		}
		failStreak = 0

		// parseList 出书: 链接字段 url/bookUrl(契约 §5); 空链接项由解析层收紧过滤
		parsed := rule.ParseList(res.HTML, pageURL, &t.ruleC.List, []string{"url", "bookUrl"})
		added := 0
		for _, it := range parsed.Items {
			u := it["url"]
			if u == "" {
				u = it["bookUrl"]
			}
			if u == "" {
				continue
			}
			if _, dup := seen[u]; dup {
				continue
			}
			seen[u] = struct{}{}
			urls = append(urls, u)
			added++
			if len(urls) >= discoveryMaxURLs {
				t.logf("warn", "发现书籍数已达单轮上限 %d, 停止翻页(余量请用 bookStart/bookEnd 或续采分批)", discoveryMaxURLs)
				break
			}
		}
		if added == 0 {
			emptyStreak++
			if emptyStreak >= discoveryEmptyBreak {
				t.logf("warn", "连续 %d 页列表无新增书籍, 判定已越过站点末页, 提前终止翻页(已发现 %d 本)", emptyStreak, len(urls))
				break
			}
		} else {
			emptyStreak = 0
		}

		// 进度: discovered = 去重后累计发现数(切片过滤前口径, TS 同源)
		t.mu.Lock()
		t.discovered = len(urls)
		t.mu.Unlock()
		t.logf("info", "列表页 P%d 新增 %d 本(累计发现 %d)", page, added, len(urls))
		t.sendProgress(false)

		// 页间小憩(间隔区间的 1/2, 温和发现; 不含 jitterMs——抓取层 pathJitter 已覆盖)
		if page < t.info.ListEnd {
			_ = util.SleepCtx(t.ctx, time.Duration(randInt(t.rnd, t.info.IntervalMin, t.info.IntervalMax)/2)*time.Millisecond)
		}
	}

	// bookStart/bookEnd 序号过滤(1-based, 0=不限; 全局切片, TS runner 同口径)
	filtered := sliceByBookStartEnd(urls, t.info.BookStart, t.info.BookEnd)
	if len(filtered) < len(urls) {
		t.logf("info", "书籍序号过滤: %d → %d 本(bookStart=%d, bookEnd=%d)",
			len(urls), len(filtered), t.info.BookStart, t.info.BookEnd)
	}
	return filtered, nil
}

// sliceByBookStartEnd 全局序号切片(1-based, 0=不限; 纯函数供单测)
func sliceByBookStartEnd(urls []string, bookStart, bookEnd int) []string {
	if bookStart <= 0 && bookEnd <= 0 {
		return urls
	}
	s := bookStart - 1
	if s < 0 {
		s = 0
	}
	e := len(urls)
	if bookEnd > 0 && bookEnd < e {
		e = bookEnd
	}
	if s > e {
		s = e
	}
	return urls[s:e]
}

// parseIDInt 书号字符串转 int(非数字 → 0)
func parseIDInt(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int(c-'0')
		if n > 1<<62 { // 防溢出
			return 1 << 62
		}
	}
	return n
}

// ---------------- 批次随机(纯函数供单测) ----------------

// randInt 闭区间 [min,max] 均匀随机(min>max 时归一)
func randInt(rnd *rand.Rand, minV, maxV int) int {
	if maxV < minV {
		minV, maxV = maxV, minV
	}
	if maxV <= minV {
		return minV
	}
	return minV + rnd.Intn(maxV-minV+1)
}

// drawBatchThreads 每批重抽线程数(契约 §5: 批大小 = threadMin..threadMax 随机抽取,
// 每批重抽; 上限钳到 contents 批 ≤20 章; R51-2-b #8: threadMin 超上限时同步钳到
// 上限 — 原实现 threadMin>20 时依赖 randInt 归一侥幸不越界, 显式钳制防回归)
func drawBatchThreads(rnd *rand.Rand, threadMin, threadMax int) int {
	minT := threadMin
	if minT > MaxContentsBatch {
		minT = MaxContentsBatch
	}
	maxT := threadMax
	if maxT > MaxContentsBatch {
		maxT = MaxContentsBatch
	}
	return randInt(rnd, minT, maxT)
}

// drawInterval 批间间隔: intervalMin..intervalMax 随机 + jitterMs 随机叠加(契约 §5)
func drawInterval(rnd *rand.Rand, intervalMin, intervalMax, jitterMs int) time.Duration {
	base := randInt(rnd, intervalMin, intervalMax)
	jit := 0
	if jitterMs > 0 {
		jit = rnd.Intn(jitterMs + 1)
	}
	return time.Duration(base+jit) * time.Millisecond
}

// fisherYates 批内洗牌(契约 §5: Fisher-Yates; 就地置换)
func fisherYates(rnd *rand.Rand, items []string) {
	for i := len(items) - 1; i > 0; i-- {
		j := rnd.Intn(i + 1)
		items[i], items[j] = items[j], items[i]
	}
}
