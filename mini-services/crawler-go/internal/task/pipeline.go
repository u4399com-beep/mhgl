// ============================================================
// 单书流水线 — 契约 §5 编排语义
//
//	书籍页抓取 → parseBook → book 回调(skipContent=true 短路本毕)
//	→ 定位目录(tocLink 或书籍页本体) → 目录翻页(ParseToc 内建 maxPages 防死循环)
//	→ chapters 回调拿 needUrls(增量决策核心; >5000 章分片 seq/final)
//	→ needUrls 空 = 本毕(不计失败) → 正文批次(批大小每批重抽+批内 Fisher-Yates
//	+批间随机间隔+jitterMs) → 封面下载(≤10MB→b64 cover 回调) → 书收尾
//
//	内存纪律: 目录条目在 chapters 回调后仅保留 needUrls 的 title 映射;
//	每章正文回调完即弃(不持有跨批); 队列/进度集合均为轻量串/struct
//
// ============================================================
package task

import (
	"context"
	"encoding/base64"
	"fmt"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"crawler-go/internal/callback"
	"crawler-go/internal/fetch"
	"crawler-go/internal/rule"
	"crawler-go/internal/util"
)

// coverMaxBytes 封面二进制上限(契约 §2: b64 解码后 ≤10MB; fetch 层 maxBodyBytes 同量级)
const coverMaxBytes = 10 << 20

// run 任务主循环: 队列构建 → 逐书流水线 → 终态
func (t *Task) run() {
	// R51-2-b #5: panic recover 兜底 — run 协程内任意 panic 原先直接杀进程(run.sh 重启
	// 但任务全丢); 现 recover → errored=true + lastError + logf, 随 finish 正常收尾。
	// 注册顺序: recover defer 晚于 finish defer 注册(LIFO) → panic 时先执行 recover
	// 置位 errored, finish 再读到并发出 error 终态(顺序颠倒会让终态误报 done)
	defer t.finish()
	defer func() {
		if r := recover(); r != nil {
			t.mu.Lock()
			t.errored = true
			t.lastError = fmt.Sprintf("任务协程 panic: %v", r)
			t.mu.Unlock()
			t.logf("error", "任务协程 panic(已兜底, 转 error 收尾): %v\n%s", r, debug.Stack())
		}
	}()

	t.mu.Lock()
	t.running = true
	t.startedAt = time.Now()
	t.phase = "idle"
	t.mu.Unlock()
	t.logf("info", "任务启动: mode=%s 重采=%s 线程=%d~%d 间隔=%d~%dms",
		t.info.Mode, t.info.RecrawlMode, t.info.ThreadMin, t.info.ThreadMax,
		t.info.IntervalMin, t.info.IntervalMax)
	t.asyncStatus("running", "任务启动")

	// ---- 队列构建(三模式) ----
	queue, err := t.buildQueue()
	if err != nil {
		t.mu.Lock()
		t.errored = true
		t.lastError = err.Error()
		t.mu.Unlock()
		t.logf("error", "队列构建失败: %v", err)
		return
	}
	t.mu.Lock()
	t.booksTotal = len(queue)
	t.mu.Unlock()
	t.sendProgress(true)

	if len(queue) == 0 {
		// 空队列 → status=done(stats 留痕, 契约 §5)
		t.logf("warn", "队列为空(0 本书待采集), 任务完成")
		t.mu.Lock()
		t.phase = "done"
		t.mu.Unlock()
		return
	}

	// ---- 逐书流水线 ----
	// 回调失败自动暂停时不推进游标(恢复后重试当前书; 断点续采语义)
	idx := 0
	for idx < len(queue) {
		if !t.gate() { // 暂停/停止等待门(书边界; 跑完在飞批次后挂起点)
			return
		}
		if t.isErrored() { // 书级熔断 → error 终态
			return
		}
		retrySameBook := t.processBook(queue[idx])
		if !retrySameBook {
			idx++
		}
		// retrySameBook: 任务已自动暂停, 循环头顶部 gate 阻塞至恢复/停止
	}

	if t.isErrored() {
		return
	}
	// 全部队列走完 → done
	t.mu.Lock()
	t.phase = "done"
	t.phaseNote = fmt.Sprintf("任务完成: %d 本书", t.booksDone)
	t.mu.Unlock()
	t.sendProgress(true)
}

// finish run 协程收尾: 终态状态迁移 + 回调 + 注册表清理协作
func (t *Task) finish() {
	t.fetcher.Close()
	t.mu.Lock()
	final := "done"
	note := "任务完成"
	switch {
	case t.stopped:
		final = "stopped"
		note = "任务停止"
		t.phase = "stopped"
	case t.errored:
		final = "error"
		note = "任务错误(熔断/队列失败)"
		t.phase = "error"
	case t.paused:
		// 罕见路径: 暂停态收尾(不应发生——暂停时 run 阻塞在 gate); 归一为 paused
		final = "paused"
		note = "任务暂停"
		t.phase = "paused"
	}
	t.running = false
	snap := t.snapshotLocked()
	t.mu.Unlock()

	// 终态状态回调(决策面; 失败仅本地留痕——进程重启后 Next.js 重发 start 天然幂等)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	_ = t.cb.Status(ctx, final, note)
	_ = t.cb.SendProgress(ctx, t.progressPayloadNow(), true)
	cancel()
	level := "success"
	if final == "stopped" || final == "paused" {
		level = "warn"
	} else if final == "error" {
		level = "error"
	}
	t.logf(level, "任务收尾: %s (books %d/%d, content %d/%d, errors=%d)",
		final, snap.Progress.BooksDone, snap.Progress.BooksTotal,
		snap.Progress.ContentDone, snap.Progress.ContentTotal, snap.Stats.Errors)

	close(t.exitCh)
	// 终态任务保留 10 分钟供 status 查询, 之后自动出注册表(防长生命周期累积);
	// stop 已先行安排收割, 双路径幂等(仅当注册表内仍是本任务才删, 防 id 复用误删)
	id := t.ID
	mgr := t.mgr
	time.AfterFunc(terminalTTLMs, func() {
		mgr.mu.Lock()
		if cur, ok := mgr.tasks[id]; ok && cur == t {
			delete(mgr.tasks, id)
		}
		mgr.mu.Unlock()
	})
}

// progressPayloadLocked 进度载荷构建(sendProgress/progressPayloadNow 共用实现,
// 调用方已持 t.mu; R51-3-a 收敛原两份逐字重复的 map 构建)
func (t *Task) progressPayloadLocked() map[string]interface{} {
	return map[string]interface{}{
		"phase":        t.phase,
		"discovered":   t.discovered,
		"booksDone":    t.booksDone,
		"booksTotal":   t.booksTotal,
		"tocTotal":     t.tocTotal,
		"contentDone":  t.contentDone,
		"contentTotal": t.contentTotal,
		"currentBook":  t.currentBook,
		"engineRssMB":  RSSMB(),
	}
}

// progressPayloadNow 当前进度载荷(终态强制发送用)
func (t *Task) progressPayloadNow() map[string]interface{} {
	t.mu.Lock()
	defer t.mu.Unlock()
	p := t.progressPayloadLocked()
	if t.phaseNote != "" {
		p["phaseNote"] = t.phaseNote
	}
	return p
}

// ---------------- 单书流水线 ----------------

// processBook 单书流水线。
// 返回 true = 决策类回调失败已自动暂停(书保持未采, 恢复后重试本书, 游标不推进);
// 返回 false = 书已收尾(成功/跳过/失败弃书均含, booksDone 已推进)
func (t *Task) processBook(bookURL string) bool {
	t.mu.Lock()
	t.currentBook = bookURL
	t.mu.Unlock()
	t.setPhase("book", "书籍元数据: "+util.TruncateLog(bookURL, 120))

	// ---- 1. 抓书籍页/API ----
	res, err := t.fetcher.Fetch(t.ctx, bookURL, "")
	if err != nil {
		if t.bookFailed(fmt.Sprintf("书籍页抓取失败: %v", err), bookURL) {
			return false
		}
		t.bookFinish(false) // 失败书也计入已完成, 防进度条卡死(TS 同口径)
		return false
	}
	if res.Blocked {
		// 拦截页等价 httpStatusError{403} 计失败链(R51-3-a 反反爬 ⑤:
		// blockcheck.go 出口判定, 内容不入解析层)
		if t.bookFailed(fmt.Sprintf("书籍页拦截页判定(等价 HTTP 403 计失败): %s", util.TruncateLog(bookURL, 120)), bookURL) {
			return false
		}
		t.bookFinish(false)
		return false
	}
	bookHTML := res.HTML

	// ---- 2. parseBook + book 回调(skipContent 决策必须消费) ----
	parsed := rule.ParseBook(bookHTML, bookURL, &t.ruleC.Book)
	dec, err := t.cb.Book(t.ctx, callback.BookPayload{
		BookURL:       bookURL,
		Name:          parsed.Name,
		Author:        parsed.Author,
		Category:      parsed.Category,
		Keywords:      parsed.Keywords,
		Intro:         parsed.Intro,
		CoverURL:      parsed.Cover,
		Status:        parsed.Status,
		LatestChapter: parsed.LatestChapter,
	})
	if err != nil {
		// 契约 §0: 重试耗尽仍败 → 任务转 paused; 书不入库, 恢复后重试本书
		t.pauseAuto(fmt.Sprintf("book 回调失败: %v", err))
		return true
	}
	bookName := parsed.Name
	if bookName == "" {
		bookName = util.TruncateLog(bookURL, 120)
	}
	t.logf("success", "建书回调完成: 《%s》 bookId=%s skipContent=%v lastChapterUrl=%s",
		bookName, dec.BookID, dec.SkipContent, util.TruncateLog(dec.LastChapterURL, 120))

	// ---- 2b. 封面下载([R53-2a](审计 R52-c「封面跳过面」) 移至 book 回调后/skipContent 短路前) ----
	// 对齐 TS 元数据段口径(runner.ts crawlOneBookMeta: 封面段在建库前后必然尝试, 对
	// skipContent=true 完结书与空 needUrls 已存书同样下载): 修前 Go 仅在正文阶段完成后
	// 下载 —— 完结书增量跳过/全量已存/正文熔断弃书三类书永远没有封面(首次入库的完结
	// 书封面永久缺失)。封面失败不影响书的完成(装饰性资源, warn 降级)语义不变
	t.downloadCover(bookURL, parsed.Cover)

	// skipContent=true(完结书且增量模式) → 整本跳过(契约 §2: 本毕, 不进正文阶段)
	if dec.SkipContent {
		t.logf("info", "增量跳过(完结书): 《%s》", bookName)
		t.bookFinish(true)
		return false
	}

	// ---- 3. 定位目录(toc.tocLink 或书籍页本体) ----
	tocURL, tocHTML := bookURL, bookHTML
	if link := t.extractRuleField(bookHTML, t.ruleC.Toc.TocLink); link != "" {
		if abs := rule.AbsolutizeURL(link, bookURL); abs != "" {
			tocRes, err := t.fetcher.Fetch(t.ctx, abs, bookURL) // 目录页带书籍页 Referer(契约 §4)
			if err != nil {
				if t.bookFailed(fmt.Sprintf("目录页抓取失败: %v", err), bookURL) {
					return false
				}
				t.bookFinish(false) // 失败书也计入已完成(R51-3-a bookFinish 合并语义)
				return false
			}
			if tocRes.Blocked {
				// 拦截页等价 httpStatusError{403} 计失败链(R51-3-a 反反爬 ⑤)
				if t.bookFailed(fmt.Sprintf("目录页拦截页判定(等价 HTTP 403 计失败): %s", util.TruncateLog(abs, 120)), bookURL) {
					return false
				}
				t.bookFinish(false)
				return false
			}
			tocURL, tocHTML = abs, tocRes.HTML
		}
	}

	// ---- 4. parseToc(含翻页; maxPages 防死循环由解析层内建) ----
	t.setPhase("toc", "目录解析: 《"+bookName+"》")
	tocItems, pagesUsed := rule.ParseToc(t.ctx, tocURL, tocHTML, &t.ruleC.Toc, t.pageFetch, nil)
	t.mu.Lock()
	t.tocTotal = len(tocItems)
	t.mu.Unlock()
	t.logf("info", "目录解析完成: 《%s》 %d 章(%d 页)", bookName, len(tocItems), pagesUsed)

	// ---- 5. chapters 回调(全书目录; >5000 章分片 seq/final) → needUrls 决策 ----
	needURLs, err := t.sendChapters(bookURL, tocItems)
	if err != nil {
		t.pauseAuto(fmt.Sprintf("chapters 回调失败: %v", err))
		return true
	}
	if len(needURLs) == 0 {
		// needUrls 空 = 本毕(不计失败, 契约 §5: 增量去重结果无新章)
		t.logf("info", "增量无新章: 《%s》 %d 章全量已存, 本毕", bookName, len(tocItems))
		t.bookFinish(true)
		return false
	}

	// ---- 6. needUrls → title 映射后即弃全书目录(内存纪律) ----
	titleMap := make(map[string]string, len(needURLs))
	{
		needSet := make(map[string]struct{}, len(needURLs))
		for _, u := range needURLs {
			needSet[u] = struct{}{}
		}
		for _, it := range tocItems {
			if _, ok := needSet[it.URL]; ok {
				titleMap[it.URL] = it.Title
			}
		}
	}
	tocItems = nil // 全书目录释放(仅需 needUrls+title)

	// ---- 7. 正文批次 ----
	completed := t.crawlContentBatches(bookURL, bookName, tocURL, needURLs, titleMap)
	titleMap = nil // 正文批次完成即弃(每章正文回调完即弃, 不持有跨批)
	if !completed {
		if t.chapterCircuitTripped() {
			// 连续 20 章真实失败 → 放弃本书(计 errors; 契约 §5)
			if t.bookFailed(fmt.Sprintf("连续 %d 章失败, 弃书", ChapterFailCircuit), bookURL) {
				return false
			}
			t.bookFinish(false) // 弃书也计入已完成(R51-3-a bookFinish 合并语义)
			return false
		}
		// 暂停/停止中断: 恢复后重试本书(Next.js needUrls 增量语义 = 批级断点续采);
		// 停止态则 run 循环顶部 gate 直接收尾
		return true
	}

	// ---- 8. 书收尾(成功; 封面已前移至 book 回调后下载, 见 processBook 2b 段) ----
	t.bookFinish(true)
	return false
}

// extractRuleField 整页单值提取(无容器借道 ParseList; tocLink 定位用)
func (t *Task) extractRuleField(htmlStr string, fr *rule.FieldRule) string {
	if fr == nil {
		return ""
	}
	res := rule.ParseList(htmlStr, "", &rule.PageRule{Fields: map[string]*rule.FieldRule{"f": fr}}, nil)
	if len(res.Items) == 0 {
		return ""
	}
	return res.Items[0]["f"]
}

// sendChapters chapters 回调: 全书目录分片(每片 ≤5000, 契约 §2 {seq,final});
// 累加各片 needUrls(Next.js 重排+建章后返回的实际待抓列表)。
// [R53-2a](审计 R52-c「appendChapterSlice 无去重」) 累积面保序去重: 同片内去重由 Next.js
// 承担(契约 seq≥2「同片内 URL 去重」), 跨片/回调重叠重复在此兜底 —— 防同章双抓双计
// (contentDone 虚高 + contents 回调重复项)
func (t *Task) sendChapters(bookURL string, items []rule.TocItem) ([]string, error) {
	var need []string
	seen := make(map[string]struct{}, len(items))
	total := len(items)
	emptySent := false
	for start, seq := 0, 1; start < total || !emptySent; start, seq = start+TocChunkSize, seq+1 {
		end := start + TocChunkSize
		if end > total {
			end = total
		}
		chunk := make([]callback.TocItemPayload, 0, end-start)
		for _, it := range items[start:end] {
			chunk = append(chunk, callback.TocItemPayload{Title: it.Title, URL: it.URL, Volume: it.Volume})
		}
		final := end >= total
		dec, err := t.cb.Chapters(t.ctx, callback.ChaptersPayload{
			BookURL: bookURL,
			Items:   chunk,
			Seq:     seq,
			Final:   final,
		})
		if err != nil {
			return nil, err
		}
		need = appendNeedDedup(need, seen, dec.NeedURLs)
		emptySent = true // 空目录也发一次(items=[], final=true)让 Next.js 记录
		if final {
			break
		}
	}
	return need, nil
}

// appendNeedDedup needURLs 累积去重追加(保序, 首现优先; 纯函数供单测)
func appendNeedDedup(need []string, seen map[string]struct{}, urls []string) []string {
	for _, u := range urls {
		if _, dup := seen[u]; dup {
			continue
		}
		seen[u] = struct{}{}
		need = append(need, u)
	}
	return need
}

// accountContentTotal contentTotal 书粒度记账(R51-2-b #9 判重 + [R53-2a] 重入重算;
// 调用方已持 t.mu; 记账规则纯状态机, 单测见 TestContentTotalResumeAccounting):
//
//   - 首次进入某书正文阶段: 记录总量基线(contentTotalBookBase=当前 contentTotal)与
//     done 快照(contentDoneAtBookEntry=当前 contentDone), contentTotal += len(needURLs)
//   - 同书重入(auto-pause→resume 整书重跑): 本书贡献重建为
//     「(contentDone-done快照) + 本轮 len(needURLs)」, contentTotal = 基线 + 新贡献
//
// 典型增量续跑(重跑 needURLs=首跑剩余)新贡献=原贡献, 总量不变(R51-2-b #9 语义保持);
// 重跑 needURLs 含新增章/全量重采章(full 模式)时总量正确抬升, done 不再越 total;
// 站点章节回撤时总量如实回落。done 语义不变: 仅 contents 回调成功章累计
func (t *Task) accountContentTotal(bookURL string, needCount int) {
	if t.contentTotalBook != bookURL {
		t.contentTotalBookBase = t.contentTotal
		t.contentDoneAtBookEntry = t.contentDone
		t.contentTotalBook = bookURL
		t.contentTotal += needCount
		return
	}
	contribution := (t.contentDone - t.contentDoneAtBookEntry) + needCount
	t.contentTotal = t.contentTotalBookBase + contribution
}

// crawlContentBatches 正文批次循环(契约 §5):
// 批大小 = threadMin..threadMax 随机(每批重抽, 鉗 ≤20 章) → 批内 Fisher-Yates 洗牌
// → 批内并发抓取解析 → 单次 contents 回调(批 ≤20 章) → 批间 intervalMin..intervalMax
// 随机 + jitterMs。pause 在批边界挂起(跑完在飞批次后挂起)。
// contents 回调失败 → 任务自动暂停(恢复后整书流水线重跑, Next.js needUrls 增量
// 语义天然从断点续采, 等价批级断点)。
// 返回 false = 被暂停/停止/章节熔断中断(调用方区分处置)
func (t *Task) crawlContentBatches(bookURL, bookName, tocURL string, needURLs []string, titleMap map[string]string) bool {
	t.setPhase("content", fmt.Sprintf("正文采集: 《%s》 %d 章", bookName, len(needURLs)))
	t.mu.Lock()
	// R51-2-b #9 + [R53-2a](审计 R52-c「contentTotal 续跑漂移」): contentTotal 书粒度记账 ——
	// auto-pause→resume 整书流水线重跑时按「本书已采(done 快照增量)+本轮 needURLs」
	// 重算本书总量贡献, 修两类漂移: ①修前书粒度判重只防重复累加, 重跑 needURLs 含
	// 新增章/全量重采章时总量偏低(done 可越 total); ②站点章节变动/空正文重试等使
	// 重跑 needURLs ≠ 首跑剩余时总量与实际工作量脱钩。详见 accountContentTotal
	t.accountContentTotal(bookURL, len(needURLs))
	t.mu.Unlock()
	t.sendProgress(true)
	t.logf("info", "正文队列: 《%s》 %d 章需要采集", bookName, len(needURLs))

	queue := needURLs
	batchNo := 0
	for len(queue) > 0 {
		if !t.gate() { // 批边界等待门(在飞批次已完成, contents 已回调)
			return false // 暂停/停止中断: 调用方区分处置(停止→收尾/暂停→重试本书)
		}
		batchNo++
		threads := drawBatchThreads(t.rnd, t.info.ThreadMin, t.info.ThreadMax)
		if threads > len(queue) {
			threads = len(queue)
		}
		batch := make([]string, threads)
		copy(batch, queue[:threads])
		queue = queue[threads:]
		fisherYates(t.rnd, batch) // 批内洗牌(Fisher-Yates)

		// ---- 批内并发抓取+解析(hostGate/globalConcurrency 闸在抓取层) ----
		results := make([]callback.ChapterItem, 0, len(batch))
		var resMu sync.Mutex
		var wg sync.WaitGroup
		for _, u := range batch {
			wg.Add(1)
			go func(chapterURL string) {
				defer wg.Done()
				item, ok := t.crawlChapter(chapterURL, titleMap[chapterURL], tocURL)
				// [R52-5 P3] 空正文不入 results: 修前空正文章计入 contentDone(虚计)且
				// 发往 contents 回调 —— Next.js 侧对空 contentHtml 本就 skip(章节保持
				// fetched=false), 计数与回调双双虚高; 修后口径=仅真实落库章计入。
				// 空正文属内容质量问题不喂连败链(crawlChapter 内 chapterOK 语义不变)
				if ok && strings.TrimSpace(item.ContentHTML) != "" {
					resMu.Lock()
					results = append(results, item)
					resMu.Unlock()
				}
			}(u)
		}
		wg.Wait()

		// ---- 章节熔断检查(连续 20 章真实失败 → 弃书, 由调用方收尾) ----
		if t.chapterCircuitTripped() {
			t.logf("error", "《%s》章节连败达 %d, 放弃本书(余 %d 章未采, 下次任务增量续采)",
				bookName, ChapterFailCircuit, len(queue))
			return false // 熔断中断(调用方按 chapterCircuitTripped 分支收尾)
		}

		// ---- contents 回调(批 ≤20 章; 一次回调带全部成功项) ----
		if len(results) > 0 {
			if err := t.cb.Contents(t.ctx, callback.ContentsPayload{BookURL: bookURL, Items: results}); err != nil {
				// 重试耗尽仍败 → 自动暂停; 本批未入库, 恢复后整书重跑时
				// Next.js needUrls 会重新包含未持久化章节(增量决策幂等)
				t.pauseAuto(fmt.Sprintf("contents 回调失败: %v", err))
				return false // 回调类失败自动暂停(书保持未采, 恢复后重试)
			}
			t.mu.Lock()
			t.contentDone += len(results)
			t.mu.Unlock()
		}
		t.logf("info", "《%s》批次 #%d: %d 线程 × %d 章, 成功 %d(累计 %d/%d)",
			bookName, batchNo, threads, len(batch), len(results), t.snapshot().Progress.ContentDone, t.snapshot().Progress.ContentTotal)
		t.sendProgress(false)

		// ---- 批间间隔(intervalMin..intervalMax 随机 + jitterMs); 末批不睡 ----
		if len(queue) > 0 {
			_ = util.SleepCtx(t.ctx, drawInterval(t.rnd, t.info.IntervalMin, t.info.IntervalMax, t.ruleC.Fetch.JitterMs))
		}
	}
	return true // 全部批次完成
}

// crawlChapter 单章抓取+解析(章节页带目录页 Referer, 契约 §4 refererChain)。
// 返回 false = 真实失败(网络层, 计入连败链); 空/短正文按解析原样回调(清洗在 Next.js 侧)
func (t *Task) crawlChapter(chapterURL, title, tocReferer string) (callback.ChapterItem, bool) {
	res, err := t.fetcher.FetchContentRef(t.ctx, chapterURL, tocReferer)
	if err != nil {
		t.chapterFailed(chapterURL, err)
		return callback.ChapterItem{}, false
	}
	if res.Blocked {
		// 拦截页等价 httpStatusError{403} 计失败链(R51-3-a 反反爬 ⑤):
		// 计连败/errors, 不调 chapterOK(), 内容不进 contents 回调
		t.chapterFailed(chapterURL, fetch.ErrBlocked)
		return callback.ChapterItem{}, false
	}
	parsed := rule.ParseContent(t.ctx, chapterURL, res.HTML, &t.ruleC.Content, t.pageFetch)
	t.chapterOK() // 抓取成功即归零连败链(空正文为内容质量问题, 非真实失败)
	if strings.TrimSpace(parsed.Content) == "" {
		// [R52-5 P3] 空正文: 不入 contents 回调/不计 contentDone(Next.js 侧对空
		// contentHtml 本就 skip, 计入=虚计), 章节保持未采由增量重试承担
		t.logf("warn", "章节正文为空(不入库不计完成, 增量重试可恢复): %s", util.TruncateLog(chapterURL, 120))
	}
	return callback.ChapterItem{URL: chapterURL, Title: title, ContentHTML: parsed.Content}, true
}

// downloadCover 封面下载: ≤10MB → base64 → cover 回调(契约 §2)。
// 封面失败不影响书的完成(装饰性资源, warn 降级)
func (t *Task) downloadCover(bookURL, coverURL string) {
	if strings.TrimSpace(coverURL) == "" {
		return
	}
	data, contentType, err := t.fetcher.FetchBinary(t.ctx, coverURL)
	if err != nil {
		t.logf("warn", "封面下载失败(跳过): %s: %v", util.TruncateLog(coverURL, 120), err)
		return
	}
	if len(data) == 0 {
		return
	}
	if len(data) > coverMaxBytes {
		t.logf("warn", "封面超限(%d bytes > 10MB), 跳过: %s", len(data), util.TruncateLog(coverURL, 120))
		return
	}
	if strings.TrimSpace(contentType) == "" {
		contentType = "image/jpeg"
	}
	if err := t.cb.Cover(t.ctx, callback.CoverPayload{
		BookURL:     bookURL,
		B64:         base64.StdEncoding.EncodeToString(data),
		ContentType: contentType,
	}); err != nil {
		t.logf("warn", "封面回调失败(跳过): %v", err)
		return
	}
	t.mu.Lock()
	t.stats.CoversSaved++
	t.mu.Unlock()
	t.logf("info", "封面回调完成: %s (%d bytes, %s)", util.TruncateLog(coverURL, 120), len(data), contentType)
}
