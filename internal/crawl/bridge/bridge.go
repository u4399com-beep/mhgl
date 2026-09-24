// ============================================================
// 采集桥(单体持久化语义) —— src/app/api/admin/tasks/go-callback/route.ts(722 行)
// 的 Go 全量移植(R55-3a2)。实现 callback.Sink 接口 8 种 kind, 由 task.Manager
// 的 sink 工厂注入(接线缝: task.Task.cb 依赖抽象, HTTP 客户端与桥共同实现;
// pipeline/熔断/暂停门等契约 §5 编排语义零变化)。
//
// 语义保真注记:
//   - 每回调装载 Task 行 + 规则 clean 配置(route.ts loadCallbackCtx 同款, 规则缺失
//     不致命仅 clean 退默认);
//   - 条件状态写: 任一 status 回调仅允许覆写非终态集 pending/running/paused/interrupted
//     ([R53-2b] 终态↔终态互不覆写; 覆写未落地跳过 autoRefresh 排定);
//   - progress 白名单合并 + ≥1 次/秒节流(节流原在 HTTP 客户端, 桥内同口径实现);
//   - stats 双轨: Go 上报键(errors/coversSaved)绝对值合并 / Next-owned 键
//     (books/chapters 计数)json_set 增量累加([R50-1] 单一写者每键);
//   - book/chapters 决策响应 {bookId,skipContent,lastChapterUrl} / {needUrls}
//     直接经函数返回值消费(原 HTTP 响应信封的进程内等价物);
//   - 回调错误即返回 error(pipeline 侧 retry 语义由原 1s/2s/4s 退避承担 —— 进程内
//     无瞬时网络故障面, DB 错误属真实失败, pauseAuto 语义不变)。
//
// ============================================================
package bridge

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"

	"mhgl/internal/crawl/callback"
	"mhgl/internal/crawl/clean"
	"mhgl/internal/crawl/smart"
	"mhgl/internal/crawl/util"
	"mhgl/internal/store"
)

// 常量(对齐 route.ts)
const (
	coverMaxBytes      = 10 << 20         // 契约 §2: b64 解码后 ≤10MB
	contentMaxRunes    = 1_500_000        // [R51-3-b] 超长正文整章 skip(字符口径)
	bookNumRetryTimes  = 3                // withBookNumRetry P2002 重试
	progressThrottle   = time.Second      // progress ≥1 次/秒
	bannedWordsTTLSec  = 60 * time.Second // 违禁词配置 TTL
	defaultCoverSubdir = "covers"         // Book.cover 相对形态前缀
)

// progressKeys/statusWhitelists(契约 §2; 与 runner 字段对齐)
var progressKeys = []string{"phase", "phaseNote", "discovered", "booksDone", "booksTotal", "tocTotal", "contentDone", "contentTotal", "currentBook", "engineRssMB"}
var progressPhases = map[string]bool{"idle": true, "discovery": true, "book": true, "toc": true, "content": true, "done": true}
var statsKeys = []string{"booksCreated", "booksUpdated", "chaptersCreated", "chaptersUpdated", "coversSaved", "errors", "suggestWords"}
var goStatuses = map[string]bool{"running": true, "paused": true, "done": true, "error": true, "stopped": true}
var logLevels = map[string]bool{"info": true, "success": true, "warn": true, "error": true}

// nonTerminalStatuses 条件状态写允许覆写的来源集(非终态集)
var nonTerminalStatuses = []string{"pending", "running", "paused", "interrupted"}

// Bridge 单任务回调桥(实现 callback.Sink)
type Bridge struct {
	db       *store.DB
	taskID   string
	coverDir string              // 封面落盘目录(env COVER_DIR > web/covers)
	onDone   func(taskID string) // 终态 done 钩子(manager autoRefresh 排定; nil=无)

	progMu   sync.Mutex
	lastProg time.Time
}

// NewFactory 构造回调面工厂(task.Manager.SetSinkFactory 注入口)。
// coverDir 为封面物理落盘目录(相对路径锚定 cwd); onDone 在「status=done 条件写
// 实际落地 && 任务 autoRefresh 开启」时触发(进程内 autoRefresh 排定唯一入口)。
func NewFactory(db *store.DB, coverDir string, onDone func(taskID string)) func(taskID string) callback.Sink {
	installBannedWordsProvider(db)
	return func(taskID string) callback.Sink {
		return &Bridge{db: db, taskID: taskID, coverDir: coverDir, onDone: onDone}
	}
}

// cbCtx 每回调装载的上下文(route.ts loadCallbackCtx 同构)
type cbCtx struct {
	task  *store.Task
	clean clean.Config
}

// loadCtx 装载 Task + 规则 clean 配置(规则缺失不致命: clean 退默认)。
func (b *Bridge) loadCtx() (*cbCtx, error) {
	t, err := b.db.GetTask(b.taskID)
	if err != nil {
		return nil, err
	}
	if t == nil {
		return nil, fmt.Errorf("任务不存在")
	}
	cfgRaw := "{}"
	if _, cfg, err := b.db.GetRuleConfig(t.RuleID); err == nil && cfg != "" {
		cfgRaw = cfg
	}
	return &cbCtx{task: t, clean: clean.FromRuleRaw([]byte(cfgRaw))}, nil
}

// taskLog TaskLog 追加(level 已由调用方归一)
func (b *Bridge) taskLog(level, message string) {
	_ = b.db.AppendTaskLog(b.taskID, level, message)
}

func asStr(s string, max int) string {
	if max <= 0 || len(s) <= max {
		return s
	}
	r := []rune(s)
	if len(r) > max {
		r = r[:max]
	}
	return string(r)
}

func asInt(v any) (int, bool) {
	switch x := v.(type) {
	case int:
		return x, true
	case int64:
		return int(x), true
	case float64:
		return int(x), true // json.Unmarshal 数值恒 float64(Math.trunc 同口径)
	default:
		return 0, false
	}
}

func isUniqueErr(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "UNIQUE constraint failed")
}

// ---------------- 违禁词配置提供方(60s TTL 快照, 对齐 cleaner.ts peekBannedWordsConfig) ----------------

var bwOnce sync.Once

func installBannedWordsProvider(db *store.DB) {
	bwOnce.Do(func() {
		var mu sync.Mutex
		var cached clean.BannedWordsConfig
		var at time.Time
		clean.BannedWordsProvider = func() clean.BannedWordsConfig {
			mu.Lock()
			defer mu.Unlock()
			if time.Since(at) < bannedWordsTTLSec {
				return cached
			}
			cfg := clean.BannedWordsConfig{Mode: "mask"}
			var raw struct {
				Enabled *bool    `json:"enabled"`
				Mode    string   `json:"mode"`
				Words   []string `json:"words"`
			}
			if ok, _ := db.SettingJSON("bannedWords", &raw); ok && raw.Enabled != nil && *raw.Enabled {
				cfg.Mode = raw.Mode
				cfg.Words = raw.Words
			}
			cached = cfg
			at = time.Now()
			return cached
		}
	})
}

// ============================================================
// kind: log / status / progress / stats
// ============================================================

// Log kind=log: TaskLog 追加(level 白名单外归一 info; 空消息占位)
func (b *Bridge) Log(_ context.Context, level, message string) error {
	if !logLevels[level] {
		level = "info"
	}
	if message == "" {
		message = "(空日志)"
	}
	b.taskLog(level, asStr(message, 2000))
	return nil
}

// Status kind=status: Task.status 条件迁移 + done 时 autoRefresh 排定钩子。
func (b *Bridge) Status(_ context.Context, status, note string) error {
	status = asStr(status, 20)
	if !goStatuses[status] {
		return fmt.Errorf("非法 status: %s", status)
	}
	landed, err := b.db.CrawlUpdateTaskStatusIfIn(b.taskID, status, nonTerminalStatuses)
	if err != nil {
		return err
	}
	if note != "" {
		b.taskLog("info", asStr(note, 500))
	}
	// [R51-3-b] autoRefresh 闭环: done 条件写实际落地才排定(覆写未落地=终态前提不在库,
	// 排定即悬空; 响应仍 ok —— 调用侧重试无收益, 与 R52-5「4xx 确定性失败不重试」同思路)
	if status == "done" && landed {
		ctx, err := b.loadCtx()
		if err == nil && ctx.task.AutoRefresh {
			mins := ctx.task.RefreshIntervalMin
			if mins < 5 {
				mins = 5
			}
			if mins > 1440 {
				mins = 1440
			}
			b.taskLog("info", fmt.Sprintf("任务完成: autoRefresh 已开启, 已自动重排下一轮采集(%d 分钟后)", mins))
			if b.onDone != nil {
				b.onDone(b.taskID)
			}
		}
	}
	return nil
}

// SendProgress kind=progress: 白名单过滤 + 原子合并; force=false 时 ≥1 次/秒节流
// (超出静默丢弃, 与 HTTP 客户端节流同口径)。
func (b *Bridge) SendProgress(_ context.Context, payload interface{}, force bool) error {
	if !force {
		b.progMu.Lock()
		throttled := time.Since(b.lastProg) < progressThrottle
		b.progMu.Unlock()
		if throttled {
			return nil
		}
	}
	patch := progressPatch(payload)
	if len(patch) == 0 {
		return nil
	}
	if err := b.db.CrawlMergeTaskJSONAtomically(b.taskID, "progress", patch); err != nil {
		return err
	}
	b.progMu.Lock()
	b.lastProg = time.Now()
	b.progMu.Unlock()
	return nil
}

// progressPatch 进度载荷白名单过滤(phase 白名单/字符串钳长/数值整型化)
func progressPatch(payload interface{}) map[string]any {
	m, ok := payload.(map[string]any)
	if !ok {
		return nil
	}
	patch := map[string]any{}
	for _, k := range progressKeys {
		v, present := m[k]
		if !present || v == nil {
			continue
		}
		switch k {
		case "phase":
			if s, ok := v.(string); ok && progressPhases[s] {
				patch[k] = s
			}
		case "phaseNote", "currentBook":
			if s, ok := v.(string); ok {
				patch[k] = asStr(s, 200)
			}
		default:
			if n, ok := asInt(v); ok {
				patch[k] = n
			}
		}
	}
	return patch
}

// Stats kind=stats: 白名单过滤后绝对值合并(Go 侧只发 errors/coversSaved;
// books/chapters 计数由桥内部 mergeStatsDelta 增量累加, 单一写者每键)
func (b *Bridge) Stats(_ context.Context, s callback.StatsPayload) error {
	patch := map[string]any{}
	if s.BooksCreated != 0 {
		patch["booksCreated"] = s.BooksCreated
	}
	if s.BooksUpdated != 0 {
		patch["booksUpdated"] = s.BooksUpdated
	}
	if s.ChaptersCreated != 0 {
		patch["chaptersCreated"] = s.ChaptersCreated
	}
	if s.ChaptersUpdated != 0 {
		patch["chaptersUpdated"] = s.ChaptersUpdated
	}
	if s.CoversSaved != 0 {
		patch["coversSaved"] = s.CoversSaved
	}
	if s.Errors != 0 {
		patch["errors"] = s.Errors
	}
	if len(patch) == 0 {
		return nil
	}
	return b.db.CrawlMergeTaskJSONAtomically(b.taskID, "stats", patch)
}

// mergeStatsDelta Next-owned 计数增量累加(booksCreated/booksUpdated/chaptersCreated/
// chaptersUpdated; statsKeys 白名单子集)
func (b *Bridge) mergeStatsDelta(patch map[string]int64) error {
	for k := range patch {
		allowed := false
		for _, kk := range statsKeys {
			if kk == k {
				allowed = true
				break
			}
		}
		if !allowed {
			return fmt.Errorf("bridge: stats key %q 不在白名单", k)
		}
	}
	return b.db.CrawlMergeStatsDelta(b.taskID, patch)
}

// ============================================================
// kind: book (建书/更新书, 对齐 runner crawlOneBookMeta 建书段)
// ============================================================

// lookupBookForCallback [R61-2c] 回调书身份定位: BookID 直通优先, 空则回落 sourceUrl。
// 背景: 「同名同作者跨源合并」语义下(R28-4-L9), A 源建书后 B 源同名书会合并到同一行,
// A 源任务后续 chapters/contents/cover 若仍按自己的 sourceUrl 重查, 在源地址被改写或
// 并发窗口下会 miss → 「书籍不存在」误暂停。book 回调已把行 id 经 BookDecision 返还引擎,
// 这里优先消费(信任链: id 由同一进程内的 book 回调产出, 非外部输入); 查不到再按 URL。
func (b *Bridge) lookupBookForCallback(bookID, bookURL string) *store.Book {
	if id := asStr(bookID, 40); id != "" {
		if book, err := b.db.GetBook(id); err == nil && book != nil {
			return book
		}
		// id 查不到(极端: 书被后台删除)回落 URL 定位
	}
	book, err := b.db.FindBookBySourceURL(bookURL)
	if err != nil {
		return nil
	}
	return book
}

// Book kind=book: 建书/更新书 + skipContent 增量决策(R53-4 口径)。
func (b *Bridge) Book(_ context.Context, p callback.BookPayload) (callback.BookDecision, error) {
	bookURL := asStr(p.BookURL, 2000)
	if bookURL == "" {
		return callback.BookDecision{}, fmt.Errorf("bookUrl 必填")
	}
	ctx, err := b.loadCtx()
	if err != nil {
		return callback.BookDecision{}, err
	}
	task := ctx.task

	// 字段兜底链对齐 runner ll-c2: detail 解析 → URL 片段 → 未知书名
	urlFragmentName := urlPathFragment(bookURL, 30)
	bookName := clean.CleanTextField(asStr(p.Name, 300), 120)
	if bookName == "" {
		bookName = urlFragmentName
	}
	if bookName == "" {
		bookName = "未知书名"
	}
	author := clean.CleanTextField(asStr(p.Author, 200), 60)
	if author == "" {
		author = "佚名"
	}
	intro := clean.CleanIntro(asStr(p.Intro, 8000), 2000)
	coverURL := asStr(p.CoverURL, 2000)

	// 智能分类(runner 同款: task.smartCategory 开启时归一, 失败保留源站分类)
	categoryName := clean.CleanTextField(asStr(p.Category, 100), 30)
	if task.SmartCategory {
		if names, e := b.listCategoryNames(); e == nil {
			sm := smart.SmartCategory(bookName, intro, categoryName, names)
			if sm.Category != "" {
				categoryName = sm.Category
				b.taskLog("info", fmt.Sprintf("智能分类[%s]: %s → %s", sm.Method, bookName, sm.Category))
			}
		} else {
			// [R9-a-18] 分类表读取失败不阻断建书(退化空表再试一次)
			sm := smart.SmartCategory(bookName, intro, categoryName, nil)
			if sm.Category != "" {
				categoryName = sm.Category
				b.taskLog("info", fmt.Sprintf("智能分类[%s]: %s → %s", sm.Method, bookName, sm.Category))
			}
		}
	}
	var categoryID string
	if categoryName != "" {
		// R4-9/R5-20 同款: 同名分类并发 upsert → 3 次退避重查
		for attempt := 0; attempt < 3; attempt++ {
			categoryID, err = b.db.CrawlUpsertCategory(categoryName)
			if err == nil {
				break
			}
			if attempt < 2 {
				time.Sleep(time.Duration(50*(1<<attempt)) * time.Millisecond)
			} else {
				b.taskLog("warn", fmt.Sprintf("分类「%s」3 次重试后仍未就绪, 本书暂不关联分类", categoryName))
			}
		}
	}

	// 智能完结初判(runner: 先存 unknown, 目录采完后在 chapters 回调侧终判)
	detectedStatus := "unknown"
	if task.SmartComplete {
		det := smart.SmartCompleteDetect(smart.CompleteDetectInput{
			StatusField:        asStr(p.Status, 100),
			Intro:              intro,
			BookName:           bookName,
			LatestChapterTitle: asStr(p.LatestChapter, 300),
		})
		detectedStatus = det.Status
		b.taskLog("info", fmt.Sprintf("智能完结初判: %s(%s)", det.Status, det.Reason))
	}

	// 幂等定位对齐 runner [R28-4-L9]: sourceUrl 或 同名同作者 跨源合并(存量设计语义保留)
	existing, err := b.db.CrawlFindBookForCallback(bookURL, bookName, author)
	if err != nil {
		return callback.BookDecision{}, err
	}
	nowMS := store.NowMS()
	var bookID string
	if existing != nil {
		if task.RecrawlMode == "full" {
			// 完全覆盖对齐 runner: 删旧章节, 重置封面/字数/末章
			if _, err := b.db.Exec(`DELETE FROM "Chapter" WHERE bookId=?`, existing.ID); err != nil {
				return callback.BookDecision{}, err
			}
			cov := coverURL
			wc := int64(0)
			upd := &store.CrawlBookUpdate{
				Name:          bookName,
				Author:        author,
				Intro:         intro,
				Status:        detectedStatus,
				SourceURL:     bookURL,
				SourceRuleID:  nullStr(task.RuleID),
				StorageMode:   task.StorageMode,
				CollectedAt:   &nowMS,
				Cover:         &cov,
				WordCount:     &wc,
				LatestChapter: ptr(""),
			}
			if categoryID != "" {
				upd.CategoryID = &categoryID
			}
			if err := b.db.CrawlUpdateBookFromCallback(existing.ID, upd); err != nil {
				return callback.BookDecision{}, err
			}
			b.taskLog("warn", fmt.Sprintf("完全覆盖重采集: 清除《%s》旧数据", existing.Name))
		} else {
			// 增量更新对齐 runner [R22-c-1]/zz-d: 分类不回写(既有分类保留), 检测无结论不覆写
			// status; [R50-1] coverUrl 暂存: 封面回调落地本地文件前先以外链占位(缺失不覆盖)
			// [R61-2c] 跨源合并身份稳定: 同名同作者命中但 sourceUrl 不同(跨源同名书,
			// 如同一部热门书在多站同时采集)时, 保持首建源的 sourceUrl/sourceRuleId ——
			// 修前无条件覆写成新源 URL = 身份劫持: 首源任务后续 chapters/contents
			// 按 URL 重查 miss → 误暂停; 且每多一个源合并一次身份就漂移一次。
			// 完全覆盖(full)分支不在此限: 语义就是「以本源为准重建」, 显式换源。
			srcURL, srcRuleID := bookURL, nullStr(task.RuleID)
			if existing.SourceURL != "" && existing.SourceURL != bookURL {
				srcURL = existing.SourceURL
				if existing.SourceRuleID.Valid {
					srcRuleID = existing.SourceRuleID
				}
				b.taskLog("info", fmt.Sprintf("跨源同名合并: 《%s》保持首源身份 %s (本次来源 %s)", bookName, util.Truncate(existing.SourceURL, 80), util.Truncate(bookURL, 80)))
			}
			upd := &store.CrawlBookUpdate{
				Name:         bookName,
				Author:       author,
				Intro:        intro,
				Status:       detectedStatus,
				SourceURL:    srcURL,
				SourceRuleID: srcRuleID,
				StorageMode:  task.StorageMode,
				CollectedAt:  &nowMS,
			}
			if coverURL != "" {
				upd.Cover = &coverURL
			}
			// TS: if (existing.categoryId || !categoryId) delete upd.categoryId
			if !existing.CategoryID.Valid && categoryID != "" {
				upd.CategoryID = &categoryID
			}
			// TS: if (detectedStatus === 'unknown') delete upd.status —— Status 为空串时
			// CrawlUpdateBookFromCallback 跳过该列
			if detectedStatus == "unknown" {
				upd.Status = ""
			}
			if err := b.db.CrawlUpdateBookFromCallback(existing.ID, upd); err != nil {
				return callback.BookDecision{}, err
			}
		}
		if err := b.mergeStatsDelta(map[string]int64{"booksUpdated": 1}); err != nil {
			return callback.BookDecision{}, err
		}
		bookID = existing.ID
		b.taskLog("info", fmt.Sprintf("更新书籍: 《%s》(%s)", bookName, bookURL))
	} else {
		// 伪静态书号分配(与 runner 同源 nextBookNum + P2002 重试)
		id, err := b.createBookWithNum(&store.Book{
			Name:         bookName,
			Author:       author,
			CategoryID:   nullStr(categoryID),
			Intro:        intro,
			Status:       detectedStatus,
			Cover:        coverURL,
			SourceURL:    bookURL,
			SourceRuleID: nullStr(task.RuleID),
			StorageMode:  task.StorageMode,
			CollectedAt:  i64Null(nowMS),
		})
		if err != nil {
			return callback.BookDecision{}, err
		}
		if err := b.mergeStatsDelta(map[string]int64{"booksCreated": 1}); err != nil {
			return callback.BookDecision{}, err
		}
		bookID = id
		b.taskLog("success", fmt.Sprintf("新建书籍: 《%s》", bookName))
	}

	// 增量决策(契约 §2 book 行): skipContent = 增量模式 && 完结 && 已有章节
	// [R53-4] ★必须同时「无未采章」: 中断/熔断留下的 fetched=false 空内容章在重跑时
	// 被误判整本跳过 → 增量续采永不恢复且任务秒 done(content 0/0)。新增章不在此判定面
	// (建书时 TOC 尚未解析, 新章由 chapters 回调 needUrls 兜底)
	var dec callback.BookDecision
	if task.RecrawlMode != "full" {
		chapterCount, err := b.db.ChapterCount(bookID)
		if err != nil {
			return callback.BookDecision{}, err
		}
		unfetchedCount, err := b.db.UnfetchedChapterCount(bookID)
		if err != nil {
			return callback.BookDecision{}, err
		}
		existingCompleted := existing != nil && existing.Status == "completed"
		if chapterCount > 0 && unfetchedCount == 0 && (detectedStatus == "completed" || existingCompleted) {
			last, err := b.db.LastChapterURL(bookID)
			if err != nil {
				return callback.BookDecision{}, err
			}
			dec = callback.BookDecision{BookID: bookID, SkipContent: true, LastChapterURL: last}
			b.taskLog("info", fmt.Sprintf("完结书增量跳过: 《%s》已有 %d 章且无未采章, 通知 Go 引擎跳过正文阶段", bookName, chapterCount))
			return dec, nil
		}
	}
	dec = callback.BookDecision{BookID: bookID, SkipContent: false}
	return dec, nil
}

// listCategoryNames 库内分类名表(smartCategory 消费; 读失败返回错误由调用方退化)
func (b *Bridge) listCategoryNames() ([]string, error) {
	rows, err := b.db.QueryMaps(`SELECT name FROM "Category" ORDER BY sortOrder ASC`)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, store.ToStr(r["name"]))
	}
	return out, nil
}

// createBookWithNum 建书(NextBookNum + 唯一约束重试 ×3, withBookNumRetry 同口径)
func (b *Bridge) createBookWithNum(book *store.Book) (string, error) {
	var lastErr error
	for attempt := 0; attempt < bookNumRetryTimes; attempt++ {
		num, err := b.db.NextBookNum()
		if err != nil {
			return "", err
		}
		book.Num = i64Null(num)
		book.ID = b.db.NewID()
		if err := b.db.InsertBook(book); err == nil {
			return book.ID, nil
		} else {
			lastErr = err
			if !isUniqueErr(err) {
				return "", err
			}
		}
	}
	return "", lastErr
}

// urlPathFragment URL path 片段(对齐 new URL(bookUrl).pathname.slice(1,30); 非法 URL 留空)
func urlPathFragment(raw string, max int) string {
	i := strings.Index(raw, "://")
	if i < 0 {
		return ""
	}
	rest := raw[i+3:]
	if j := strings.IndexByte(rest, '/'); j >= 0 {
		rest = rest[j+1:]
	} else {
		return ""
	}
	if k := strings.IndexAny(rest, "?#"); k >= 0 {
		rest = rest[:k]
	}
	r := []rune(rest)
	if len(r) > max {
		r = r[:max]
	}
	return string(r)
}

func nullStr(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func i64Null(n int64) sql.NullInt64 { return sql.NullInt64{Int64: n, Valid: true} }

func ptr(s string) *string { return &s }
