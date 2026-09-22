// ============================================================
// 引擎接线缝(R55-3a3 整文件替换, 3-a 所有; 3-b 只许消费) —
// 采集管理器装配 + 任务控制面适配器 + 规则试采。
//
//	NewManager(db): task.Manager + SetSinkFactory(bridge 直连 store)
//	                → 返回实现 api.TaskController 语义的适配器(any, main 断言)
//	Start/Control/Status/StopAll: 对齐 TS src/app/api/admin/tasks/_go-control.ts
//	                的引擎分支语义(单体 Go 引擎无 TS 回退 → 不符即拒绝并留痕)
//	TestRule: 对齐 TS /api/admin/rules/test 四段试采(list/book/toc/content)
//
// import 环规避: 适配器在 crawl 包内实现, 不 import api 包 —— 方法集与
// api.TaskController 形状一致, main 装配时以接口断言衔接(鸭子类型)。
// ============================================================
package crawl

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"

	"mhgl/internal/crawl/bridge"
	"mhgl/internal/crawl/clean"
	"mhgl/internal/crawl/fetch"
	"mhgl/internal/crawl/rule"
	"mhgl/internal/crawl/task"
	"mhgl/internal/store"
)

const (
	// testGuardMs 规则试采硬护栏(对齐 TS TEST_GUARD_MS=90s)
	testGuardMs = 90 * time.Second
	// testSampleLimit 四段试采样本条数上限(对齐 TS limit 缺省 20)
	testSampleLimit = 20
	// previewMaxChars 试采正文预览按码点截断(对齐 TS PREVIEW_MAX_CHARS=1500)
	previewMaxChars = 1500
	// defaultCoverDir 封面落盘目录缺省值(env COVER_DIR 可覆盖)
	defaultCoverDir = "web/covers"
	// internalCallbackBase 单体内回调走进程内桥; TaskStartPayload.Validate 要求
	// callback.baseUrl 非空, 引擎侧 sink 工厂已注入桥, 该字段实际不被消费
	internalCallbackBase = "bridge://internal"
)

// terminalStatuses 终态集(DB 侧; 对齐 api.finalStatuses)
var terminalStatuses = map[string]bool{"done": true, "error": true, "stopped": true}

// apiTaskControllerShape 与 internal/api.TaskController 结构等价的编译期断言
// (不 import api 包防环; 方法集一致即鸭子类型满足, main 装配断言必过)
var _ interface {
	Start(taskID string) error
	Control(taskID, action string) (string, error)
	Status(taskID string) (exists, running bool, phase string)
	StopAll()
} = (*managerAdapter)(nil)

// ---------------- 管理器装配 ----------------

// managerAdapter 任务控制面适配器(api.TaskController 鸭子类型实现, 不 import api 防环)
type managerAdapter struct {
	db  *store.DB
	mgr *task.Manager
}

// NewManager 构造任务管理器: task.NewManager + SetSinkFactory(bridge.NewFactory 直连
// store 的回调桥; 封面目录 env COVER_DIR 可覆盖, 缺省 web/covers) + autoRefresh
// 终态钩子。返回 any 以避免并行期/装配期 import 环; main 断言 api.TaskController。
func NewManager(db *store.DB) (any, error) {
	if db == nil {
		return nil, errors.New("crawl: NewManager 需要 *store.DB")
	}
	mgr := task.NewManager()
	ad := &managerAdapter{db: db, mgr: mgr}
	coverDir := strings.TrimSpace(os.Getenv("COVER_DIR"))
	if coverDir == "" {
		coverDir = defaultCoverDir
	}
	mgr.SetSinkFactory(bridge.NewFactory(db, coverDir, ad.scheduleAutoRefresh))
	return ad, nil
}

// ---------------- api.TaskController 语义面 ----------------

// Start 启动/续跑任务(语义对齐 TS goEngineControl start 分支):
//  1. 任务行不存在 → 错误; DB status=running → 幂等拒绝「任务已在运行中」;
//  2. 引擎侧在册: running → 幂等拒绝; paused → resume 断点续跑;
//     终态残留在册(10 分钟 TTL 内) → resume 必败, 落到下方重新 Start(注册表替换,
//     对齐「Go 重启后任务态丢失 → 重发 start 等价断点续采」契约 §5);
//  3. 装载规则 → 能力/存储模式 fail-closed 检查(单体无 TS 回退, 不符即拒绝+TaskLog error)
//     → mgr.Start → DB 终态条件重置+running(CrawlMarkTaskStarted) + 启动日志。
func (a *managerAdapter) Start(taskID string) error {
	t, err := a.db.GetTask(taskID)
	if err != nil {
		return err
	}
	if t == nil {
		return fmt.Errorf("任务不存在")
	}
	if t.Status == "running" {
		return fmt.Errorf("任务已在运行中")
	}
	if st := a.mgr.Status(taskID); st.Exists {
		if st.Running {
			return fmt.Errorf("任务已在运行中")
		}
		if _, rerr := a.mgr.Control(taskID, "resume"); rerr == nil {
			_ = a.db.CrawlMarkTaskStarted(taskID)
			_ = a.db.AppendTaskLog(taskID, "success", "▶ 任务已恢复运行(Go 引擎, 断点续采)")
			return nil
		}
	}
	p, err := a.buildPayload(t)
	if err != nil {
		_ = a.db.AppendTaskLog(taskID, "error", err.Error())
		return err
	}
	if err := a.mgr.Start(p); err != nil {
		if errors.Is(err, task.ErrTaskExists) {
			return fmt.Errorf("任务已在运行中")
		}
		return err
	}
	_ = a.db.CrawlMarkTaskStarted(taskID)
	_ = a.db.AppendTaskLog(taskID, "success", fmt.Sprintf(
		"▶ 任务启动 [%s] 模式:%s 重采:%s 存储:数据库 线程:%d~%d 间隔:%d~%dms (Go 引擎, 单体内嵌)",
		t.Name, modeLabel(t.Mode), recrawlLabel(t.RecrawlMode),
		t.ThreadMin, t.ThreadMax, t.IntervalMin, t.IntervalMax))
	return nil
}

// Control pause|resume|stop → 迁移后状态串。
// 引擎侧不在册(exists=false): pause/resume → 报错「任务未在运行」;
// stop → 幂等 ok(DB 仍处非终态时条件写 stopped 留痕, 兜底进程内注册表已出的残留)。
// 引擎侧在册时 DB 状态迁移由桥的 status 回调承担(条件写非终态集)。
func (a *managerAdapter) Control(taskID, action string) (string, error) {
	action = strings.TrimSpace(action)
	st := a.mgr.Status(taskID)
	switch action {
	case "pause":
		if !st.Exists {
			return "", fmt.Errorf("任务未在运行")
		}
		return a.mgr.Control(taskID, action)
	case "resume":
		if !st.Exists {
			// [R55-修复] 服务重启后注册表为空而 DB 行为 paused/非终态 —— resume 必须回落
			// Start(等价断点续采, 契约 §5「Go 重启后任务态丢失 → 重发 start 等价断点续采」);
			// 修前直接报「任务未在运行」导致重启后任何任务都无法从 UI 恢复(实测卡死)。
			if err := a.Start(taskID); err != nil {
				return "", err
			}
			t, gerr := a.db.GetTask(taskID)
			if gerr != nil || t == nil {
				return "running", nil
			}
			return t.Status, nil
		}
		return a.mgr.Control(taskID, action)
	case "stop":
		if !st.Exists {
			if t, err := a.db.GetTask(taskID); err == nil && t != nil && !terminalStatuses[t.Status] {
				if _, uerr := a.db.UpdateTaskStatusIf(taskID, "stopped", t.Status); uerr == nil {
					_ = a.db.AppendTaskLog(taskID, "warn", "任务停止: 引擎侧已无运行体, 状态直接落 stopped")
				}
			}
			return "stopped", nil
		}
		return a.mgr.Control(taskID, "stop")
	default:
		return "", fmt.Errorf("不支持的 action: %s", action)
	}
}

// Status 引擎侧任务态快照(exists/running/phase)
func (a *managerAdapter) Status(taskID string) (exists, running bool, phase string) {
	st := a.mgr.Status(taskID)
	return st.Exists, st.Running, st.Phase
}

// StopAll 全量 stop 收割(进程优雅退出用): 遍历注册表逐个 stop;
// 终态残留(done/error/stopped)跳过, 其余(running/paused/未知)一律收割。
func (a *managerAdapter) StopAll() {
	for _, b := range a.mgr.List() {
		if terminalStatuses[b.Phase] {
			continue
		}
		_, _ = a.mgr.Control(b.ID, "stop")
	}
}

// buildPayload Task 行 + Rule.config JSON → rule.TaskStartPayload
// (装配口径对齐 TS buildTaskStartPayload: bookIds 列表形态已展开去重,
// 范围形态传端点原串, 二者互斥由 API 层执法; recrawlMode 非 full 归一增量;
// storageMode 单体恒 db, txt fail-closed 拒绝 —— 无 TS 回退)。
func (a *managerAdapter) buildPayload(t *store.Task) (rule.TaskStartPayload, error) {
	var p rule.TaskStartPayload
	_, cfgJSON, err := a.db.GetRuleConfig(t.RuleID)
	if err != nil {
		return p, fmt.Errorf("规则配置读取失败(规则缺失或已删除): %v", err)
	}
	var rc rule.RuleConfig
	if err := json.Unmarshal([]byte(cfgJSON), &rc); err != nil {
		return p, fmt.Errorf("规则配置 JSON 解析失败: %v", err)
	}
	rc.Sanitize()
	// 能力校验(契约 §4 不支持清单): 单体 Go 引擎无 TS 回退 → 不启动 + error 留痕
	if uns := rc.Unsupported(); len(uns) > 0 {
		return p, fmt.Errorf("规则含 Go 引擎不支持的能力(%s), 单体 Go 引擎无 TS 回退, 任务拒绝启动; "+
			"请调整规则(仅支持 http 引擎 + css/regex/json/const 字段, 无需代理/浏览器特性)", strings.Join(uns, ", "))
	}
	if t.StorageMode != "db" {
		return p, fmt.Errorf("存储模式 %s 不受 Go 引擎支持(仅 db), 无 TS 回退, 任务拒绝启动", t.StorageMode)
	}
	mode := strings.TrimSpace(t.Mode)
	if mode == "" {
		mode = "range" // 对齐 TS normalizeTaskData: 未提供回退 range
	}
	from, to := strings.TrimSpace(t.BookIDFrom), strings.TrimSpace(t.BookIDTo)
	var bookIds []string
	if mode == "bookIds" && !(from != "" && to != "") {
		// 列表形态: 书号原文展开去重(rule.ParseBookIdList, 对齐 TS parseBookIdList);
		// 范围形态(from&&to)互斥传端点原串, 上限 100000 由 payload.Validate fail-closed
		bookIds = rule.ParseBookIdList(t.BookIDs)
	}
	p = rule.TaskStartPayload{
		Task: rule.TaskInfo{
			ID:          t.ID,
			Mode:        mode,
			BookURL:     t.BookURL,
			BookIds:     bookIds,
			BookIdFrom:  from,
			BookIdTo:    to,
			ListURL:     t.ListURL,
			ListStart:   t.ListStart,
			ListEnd:     t.ListEnd,
			BookStart:   t.BookStart,
			BookEnd:     t.BookEnd,
			RecrawlMode: t.RecrawlMode,
			StorageMode: "db",
			ThreadMin:   t.ThreadMin,
			ThreadMax:   t.ThreadMax,
			IntervalMin: t.IntervalMin,
			IntervalMax: t.IntervalMax,
		},
		Rule:     rc,
		Callback: rule.CallbackInfo{BaseURL: internalCallbackBase},
	}
	return p, nil
}

// scheduleAutoRefresh autoRefresh 终态钩子(bridge.Status 在「done 条件写实际落地 &&
// 任务行 autoRefresh=true」后触发): goroutine 睡眠 clamp(5~1440) 分钟后重走 Start 流程
// (幂等安全: Start 内部裁决 running/在跑态); 服务退出即弃(可接受, PLAN §7)。
func (a *managerAdapter) scheduleAutoRefresh(taskID string) {
	go func() {
		t, err := a.db.GetTask(taskID)
		if err != nil || t == nil || !t.AutoRefresh {
			return
		}
		mins := t.RefreshIntervalMin
		if mins < 5 {
			mins = 5
		}
		if mins > 1440 {
			mins = 1440
		}
		time.Sleep(time.Duration(mins) * time.Minute)
		// 等待期间任务可能被删除/关闭 autoRefresh/已在跑: 复查后再启动(幂等安全)
		t2, err := a.db.GetTask(taskID)
		if err != nil || t2 == nil || !t2.AutoRefresh || t2.Status == "running" {
			return
		}
		if err := a.Start(taskID); err != nil {
			if cur, gerr := a.db.GetTask(taskID); gerr == nil && cur != nil {
				_ = a.db.AppendTaskLog(taskID, "warn", "autoRefresh 自动重启失败: "+err.Error())
			}
		}
	}()
}

// modeLabel/recrawlLabel 启动日志文案(对齐 TS goEngineControl 控制日志)
func modeLabel(mode string) string {
	switch strings.TrimSpace(mode) {
	case "single":
		return "单本"
	case "range":
		return "范围"
	case "bookIds":
		return "书号"
	default:
		return strings.TrimSpace(mode)
	}
}

func recrawlLabel(m string) string {
	if strings.TrimSpace(m) == "full" {
		return "完全覆盖"
	}
	return "增量更新"
}

// ---------------- 规则试采(api.TaskController 缝: TestRule) ----------------

// TestRule 规则试采(list/book/toc/content 四段按 sampleURL 实抓+解析, 复用
// internal/rule 解析器与 fetch 包)。返回形态对齐 TS /api/admin/rules/test:
// 成功 {ok:true, stage, type, data:{...样本字段}}; 失败返回 error(调用侧兜 502 信封
// {ok:false, error})。段判定: 配置 JSON 中非空的 list/book/toc/content 键即测试段
// (api 层按 {<section>: rule, fetch, clean} 组装单段配置)。
func TestRule(ruleConfigJSON, sampleURL string) (map[string]any, error) {
	sampleURL = strings.TrimSpace(sampleURL)
	if sampleURL == "" {
		return nil, errors.New("缺少测试 URL")
	}
	if !isHTTPURL(sampleURL) {
		return nil, errors.New("URL 非法(仅支持 http/https)")
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal([]byte(ruleConfigJSON), &raw); err != nil {
		return nil, fmt.Errorf("规则 JSON 解析失败: %v", err)
	}
	stage := ""
	for _, s := range []string{"list", "book", "toc", "content"} {
		if v, ok := raw[s]; ok {
			sv := strings.TrimSpace(string(v))
			if sv != "" && sv != "null" && sv != "{}" {
				stage = s
				break
			}
		}
	}
	if stage == "" {
		return nil, errors.New("非法测试段(应为 list/book/toc/content)")
	}
	var cfg rule.RuleConfig
	if err := json.Unmarshal([]byte(ruleConfigJSON), &cfg); err != nil {
		return nil, fmt.Errorf("规则 JSON 解析失败: %v", err)
	}
	cfg.Sanitize()

	started := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), testGuardMs)
	defer cancel()
	fc := fetch.New(cfg.Fetch)
	defer fc.Close()

	// list 段: 占位符固定展开第 1 页(TS expandListPlaceholders 同口径: {offset:N}→0, {page}→1)
	fetchURL := sampleURL
	if stage == "list" {
		fetchURL = rule.ExpandListURL(sampleURL, 1)
	}
	res, err := fc.Fetch(ctx, fetchURL, "")
	if err != nil {
		return nil, fmt.Errorf("抓取失败: %v", err)
	}
	// 拦截页判定 + JSON 站豁免(TS assertNotBlocked 同口径: 合法 JSON 响应放行)
	if res.Blocked && rule.ParseJSONBody(res.HTML) == nil {
		return nil, errors.New("目标站点返回了反爬拦截页(验证码/JS挑战/空壳响应), 请更换引擎或稍后重试")
	}
	// 翻页/子页传输回调(拦截页等价 HTTP 403 失败, 由解析层回退链承接)
	pageFetch := rule.PageFetch(func(pctx context.Context, u, referer string) (string, error) {
		r2, ferr := fc.Fetch(pctx, u, referer)
		if ferr != nil {
			return "", ferr
		}
		if r2.Blocked {
			return "", fetch.ErrBlocked
		}
		return r2.HTML, nil
	})
	ms := time.Since(started).Milliseconds()

	switch stage {
	case "list":
		parsed := rule.ParseList(res.HTML, fetchURL, &cfg.List, []string{"url", "bookUrl"})
		sample := make([]map[string]string, 0, len(parsed.Items))
		for _, it := range parsed.Items {
			if len(sample) >= testSampleLimit {
				break
			}
			sample = append(sample, it)
		}
		return map[string]any{"ok": true, "stage": "list", "type": "list", "data": map[string]any{
			"htmlSize": len(res.HTML), "ms": ms,
			"count": len(parsed.Items), "sample": sample,
		}}, nil

	case "book":
		parsed := rule.ParseBook(res.HTML, fetchURL, &cfg.Book)
		return map[string]any{"ok": true, "stage": "book", "type": "book", "data": map[string]any{
			"htmlSize": len(res.HTML), "ms": ms, "fields": parsed,
		}}, nil

	case "toc":
		items, pages, htmlSize := testResolveToc(ctx, fc, pageFetch, fetchURL, res.HTML, &cfg.Toc)
		sample := make([]map[string]string, 0, len(items))
		for _, it := range items {
			if len(sample) >= testSampleLimit {
				break
			}
			sample = append(sample, map[string]string{"title": it.Title, "url": it.URL, "volume": it.Volume})
		}
		return map[string]any{"ok": true, "stage": "toc", "type": "toc", "data": map[string]any{
			"htmlSize": htmlSize, "ms": ms,
			"count": len(items), "pages": pages, "sample": sample,
		}}, nil

	case "content":
		parsed := rule.ParseContent(ctx, fetchURL, res.HTML, &cfg.Content, pageFetch)
		cleaned := clean.CleanContentHTML(parsed.Content, clean.FromRuleRaw([]byte(ruleConfigJSON)))
		return map[string]any{"ok": true, "stage": "content", "type": "content", "data": map[string]any{
			"htmlSize": len(res.HTML), "ms": ms, "pages": parsed.Pages,
			"rawLength":     len([]rune(parsed.Content)),
			"cleanedLength": len([]rune(cleaned)),
			"cleanedText":   cutRunes(cleaned, previewMaxChars),
			"cleanedHtml":   cutRunes(parsed.Content, previewMaxChars),
		}}, nil
	}
	return nil, errors.New("非法测试段(应为 list/book/toc/content)") // 防御兜底(上方已判定)
}

// testResolveToc 试采目录段(tocLink 流程模拟, 对齐 TS resolveToc / runner.extractToc 同序):
// ① 显式 tocLink → 提取目录页地址 → 抓取(失败 800ms 退避重试一次) → 解析(0 章回退);
// ② 书籍页即目录页; ③ 目录链接自动嗅探回退(文案白名单)。
// 返回 (items, pagesUsed, 首个解析页 htmlSize)。
func testResolveToc(ctx context.Context, fc *fetch.Client, pageFetch rule.PageFetch, bookURL, bookHTML string, toc *rule.PageRule) ([]rule.TocItem, int, int) {
	// 1) 显式 tocLink
	if toc != nil && toc.TocLink != nil && strings.TrimSpace(toc.TocLink.Expression) != "" {
		extracted := rule.ParseList(bookHTML, bookURL, &rule.PageRule{Fields: map[string]*rule.FieldRule{"f": toc.TocLink}}, nil)
		if len(extracted.Items) > 0 {
			if abs := rule.AbsolutizeURL(extracted.Items[0]["f"], bookURL); abs != "" && abs != bookURL && isHTTPURL(abs) {
				var tocHTML string
				var err error
				for attempt := 0; attempt < 2; attempt++ { // 瞬态韧性: 与 runner 同款退避重试一次
					tocHTML, err = testFetchPage(ctx, fc, abs, bookURL)
					if err == nil {
						break
					}
					select {
					case <-ctx.Done():
					case <-time.After(800 * time.Millisecond):
					}
				}
				if err == nil {
					items, pages := rule.ParseToc(ctx, abs, tocHTML, toc, pageFetch, nil)
					if len(items) > 0 {
						return items, pages, len(tocHTML)
					}
					// 0 章 → 回退书籍页本页重解析(不直接返回 0)
				}
			}
		}
	}
	// 2) 书籍页即目录页
	items, pages := rule.ParseToc(ctx, bookURL, bookHTML, toc, pageFetch, nil)
	if len(items) > 0 {
		return items, pages, len(bookHTML)
	}
	// 3) 兜底: 自动嗅探"目录"链接(与 runner.extractToc 同款文案白名单)
	if guess := sniffTocLink(bookHTML, bookURL); guess != "" {
		if tocHTML, err := testFetchPage(ctx, fc, guess, bookURL); err == nil {
			items, pages := rule.ParseToc(ctx, guess, tocHTML, toc, pageFetch, nil)
			if len(items) > 0 {
				return items, pages, len(tocHTML)
			}
		}
	}
	return items, pages, len(bookHTML)
}

// testFetchPage 试采子页抓取(拦截页按错误处置, 由调用方回退链承接)
func testFetchPage(ctx context.Context, fc *fetch.Client, u, referer string) (string, error) {
	res, err := fc.Fetch(ctx, u, referer)
	if err != nil {
		return "", err
	}
	if res.Blocked {
		return "", fetch.ErrBlocked
	}
	return res.HTML, nil
}

// tocTextRe 目录链接嗅探文案白名单(TS runner.extractToc 同款)
var tocTextRe = regexp.MustCompile(`^(查看目录|章节目录|最新章节列表|章节列表|点击查看目录|全文目录|目录)$`)

// sniffTocLink 书籍页目录链接嗅探(首个文案命中且可绝对化且非自引用)
func sniffTocLink(bookHTML, baseURL string) string {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(bookHTML))
	if err != nil {
		return ""
	}
	link := ""
	doc.Find("a").EachWithBreak(func(_ int, s *goquery.Selection) bool {
		if !tocTextRe.MatchString(strings.TrimSpace(s.Text())) {
			return true
		}
		if abs := rule.AbsolutizeURL(s.AttrOr("href", ""), baseURL); abs != "" && abs != baseURL {
			link = abs
			return false
		}
		return true
	})
	return link
}

// isHTTPURL http/https 绝对地址判定
func isHTTPURL(s string) bool {
	u, err := url.Parse(s)
	return err == nil && u.Host != "" && (u.Scheme == "http" || u.Scheme == "https")
}

// cutRunes 按码点截断(emoji 代理对不斩半; 对齐 TS sliceCodePoints)
func cutRunes(s string, max int) string {
	if max <= 0 {
		return s
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}
