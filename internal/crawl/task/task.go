// ============================================================
// 任务注册表与控制面 — 契约 §1/§3/§5
//
//   - 注册表: map + mutex; 同 taskId running/paused 时拒绝重复 start(409),
//     终态(done/error/stopped)任务保留 10 分钟供 status 查询后自动出表, 新 start 可替换
//   - pause: 跑完在飞批次后在循环边界挂起(进度保留内存); resume: 从断点续跑
//   - stop: 置位+取消 ctx, run 协程自然退出后从注册表移除(异步收割不阻塞控制面)
//   - 熔断: 连续 20 章真实失败弃书; 连续 20 本书级失败任务转 error(契约 §5)
//   - 内存纪律: 每章正文回调完即弃; 进度集合 map[string]struct{}; 队列仅为 URL 串
//
// ============================================================
package task

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"mhgl/internal/crawl/callback"
	"mhgl/internal/crawl/fetch"
	"mhgl/internal/crawl/rule"
	"mhgl/internal/crawl/util"
)

// 熔断与节流常量(契约 §2/§5; 对齐 TS runner CIRCUIT_ERROR_LIMIT/BOOK_CIRCUIT_ERROR_LIMIT)
const (
	ChapterFailCircuit = 20               // 连续 20 章真实失败 → 放弃本书(计 errors)
	BookFailCircuit    = 20               // 连续 20 本书级失败 → 任务转 error
	MaxContentsBatch   = 20               // contents 批 ≤20 章(契约 §2)
	TocChunkSize       = 5000             // chapters 回调 >5000 章分多次(契约 §2)
	terminalTTLMs      = 10 * time.Minute // 终态任务注册表保留时长
)

// ErrTaskExists 同 taskId 已存在(running/paused) —— HTTP 层映射 409
var ErrTaskExists = errors.New("task already exists")

// Stats 任务本地统计(契约 §2 stats 回调; R55 单体后回调面=bridge 直连 store, 计数权威
// 在 Go 侧自身; blocked/rateLimited 为 R51-3-a 可观测新增: 拦截页命中/429+503 收到,
// 经 status 面暴露)
type Stats struct {
	Errors      int64 `json:"errors,omitempty"`
	CoversSaved int64 `json:"coversSaved,omitempty"`
	Blocked     int64 `json:"blocked,omitempty"`
	RateLimited int64 `json:"rateLimited,omitempty"`
}

// Progress 进度快照(契约 §5 进度字段)
type Progress struct {
	Phase        string `json:"phase"`
	PhaseNote    string `json:"phaseNote,omitempty"`
	Discovered   int    `json:"discovered,omitempty"`
	BooksDone    int    `json:"booksDone"`
	BooksTotal   int    `json:"booksTotal"`
	TocTotal     int    `json:"tocTotal,omitempty"`
	ContentDone  int    `json:"contentDone"`
	ContentTotal int    `json:"contentTotal"`
	CurrentBook  string `json:"currentBook,omitempty"`
}

// StatusInfo GET /task/{id}/status 响应体(不含 ok 包装)
type StatusInfo struct {
	Exists      bool     `json:"exists"`
	Running     bool     `json:"running"`
	Phase       string   `json:"phase"`
	Progress    Progress `json:"progress"`
	Stats       Stats    `json:"stats"`
	RssMB       float64  `json:"rssMB"`
	StartedAtMs int64    `json:"startedAtMs"`
	LastError   string   `json:"lastError,omitempty"`
}

// TaskBrief GET /tasks 列表项
type TaskBrief struct {
	ID      string  `json:"id"`
	Running bool    `json:"running"`
	Phase   string  `json:"phase"`
	RssMB   float64 `json:"rssMB"`
}

// Task 单个采集任务(内存态)
type Task struct {
	ID      string
	payload rule.TaskStartPayload
	info    rule.TaskInfo // 任务参数快捷引用(= payload.Task)
	ruleC   rule.RuleConfig
	mgr     *Manager // 所属注册表(stop 收割/终态 TTL 出表用)

	cb        callback.Sink // R55 单体: 经 Manager.sink 工厂注入(HTTP 客户端或直连 store 的桥)
	fetcher   *fetch.Client
	pageFetch rule.PageFetch // 解析层翻页过闸注入(契约 §4 refererChain)
	// proxySource 动态代理源(R57-2a): newTask 时从 Manager 快照(Start 持锁内注册,
	// 运行期无锁读取安全; SetProxySource 契约要求先于任何 Start)
	proxySource fetch.ProxyAddrSource

	ctx    context.Context
	cancel context.CancelFunc

	mu   sync.Mutex
	cond *sync.Cond // paused 等待门(run 协程 Wait, control 侧 Broadcast)

	// ---- 进度内存态(契约 §5) ----
	phase        string
	phaseNote    string
	discovered   int
	booksDone    int
	booksTotal   int
	tocTotal     int
	contentDone  int
	contentTotal int
	// R51-2-b #10: contentTotal 按书粒度记账(auto-pause→resume 整书重跑时,
	// 只对首次进入正文阶段的书累加, 防重复累加虚增总量)
	// [R53-2a](审计 R52-c「contentTotal 续跑漂移」)升级为重入重算: 另记录本书首次进入
	// 正文阶段时的总量基线与 done 快照(contentTotalBookBase/contentDoneAtBookEntry),
	// 重入时按「已采增量+本轮 needURLs」重建本书贡献 —— 典型续跑(重跑 needURLs=剩余)
	// 总量不变; 重跑含新增章/全量重采章时总量正确抬升, done 不再越 total。实现见
	// accountContentTotal(pipeline.go)
	contentTotalBook       string
	contentTotalBookBase   int
	contentDoneAtBookEntry int
	currentBook            string
	lastError              string
	stats                  Stats

	// ---- 生命周期 ----
	running   bool
	paused    bool
	stopped   bool
	errored   bool
	startedAt time.Time
	exitCh    chan struct{} // run 协程退出信号(stop 收割用)

	// ---- 熔断连败计数(契约 §5) ----
	chapterFailStreak int
	bookFailStreak    int

	rnd *rand.Rand // 批次/间隔随机源(仅 run 协程使用)
}

// Manager 任务注册表
type Manager struct {
	mu        sync.Mutex
	tasks     map[string]*Task
	startedAt time.Time
	// sinkFactory 回调面工厂(R55 单体注入缝): 非空时新任务经此取得回调 Sink
	// (单体=直连 store 的 bridge); nil 时保持原 HTTP 回调客户端(callback.New)。
	// 仅改变回调出站通道, 编排/熔断/暂停门等契约 §5 语义零变化
	sinkFactory func(taskID string) callback.Sink
	// proxySource 动态代理源(R57-2a DB 代理池接线, 可选): 非空时新任务启动即拉一次
	// 存活代理注入 fetch 池, 运行期每 proxyRefreshEvery 重拉(接口注入, 本包不 import store)
	proxySource fetch.ProxyAddrSource
	// proxyFeedback 代理结果回写钩子(R57-2a, 可选): fetch 层按请求事实回调,
	// engine 装配 store 轻量 UPDATE(异步防阻塞)
	proxyFeedback func(addr string, ok bool)
}

// NewManager 创建注册表
func NewManager() *Manager {
	return &Manager{tasks: map[string]*Task{}, startedAt: time.Now()}
}

// SetSinkFactory 注入回调面工厂(必须在任何 Start 之前调用; R55 单体装配点)。
// factory 返回的 Sink 需实现 callback.Sink 全部 8 方法(桥/HTTP 客户端共同口径)
func (m *Manager) SetSinkFactory(f func(taskID string) callback.Sink) {
	m.mu.Lock()
	m.sinkFactory = f
	m.mu.Unlock()
}

// SetProxySource 注入动态代理源(R57-2a DB 代理池接线; 必须在任何 Start 之前调用)。
// 传入 *store.DB(实现 fetch.ProxyAddrSource)即完成装配, 本包不 import store
func (m *Manager) SetProxySource(src fetch.ProxyAddrSource) {
	m.mu.Lock()
	m.proxySource = src
	m.mu.Unlock()
}

// SetProxyFeedback 注入代理结果回写钩子(R57-2a; 必须在任何 Start 之前调用)
func (m *Manager) SetProxyFeedback(fn func(addr string, ok bool)) {
	m.mu.Lock()
	m.proxyFeedback = fn
	m.mu.Unlock()
}

// Start 启动任务: 消毒→校验→注册→异步执行。
// 同 taskId 存在 running/paused 态时返回 ErrTaskExists(HTTP 409);
// 终态任务允许同 id 重启(替换注册表条目, 对齐"Go 进程重启后 Next.js 重发 start"语义)
func (m *Manager) Start(p rule.TaskStartPayload) error {
	p.Sanitize()
	if err := p.Validate(); err != nil {
		return err
	}
	m.mu.Lock()
	if old, ok := m.tasks[p.Task.ID]; ok && old.busy() {
		m.mu.Unlock()
		return ErrTaskExists
	}
	t := newTask(p, m)
	// R51-2-b #6: 持锁期间置 running 再入表 — 原实现置位发生在 run 协程内,
	// 同 id 二次 start 在注册与 run 置位窗口间可绕过 busy() 判定(双跑竞态)
	// [R67-b] startedAt/phase 同锁初始化: 修前二者由 run 协程稍后置位, Start 至 run
	// 首行之间的窗口内 Status 快照 StartedAtMs 为零值时刻(负值 ≈ -6.2e13 ms)、phase
	// 为空串, 管理面启动瞬间呈现「1970 年前启动」幻象
	t.mu.Lock()
	t.running = true
	t.startedAt = time.Now()
	t.phase = "idle"
	t.mu.Unlock()
	m.tasks[p.Task.ID] = t
	m.mu.Unlock()
	go t.run()
	return nil
}

// Control 控制面: pause/resume/stop; 返回控制后状态串
func (m *Manager) Control(id, action string) (string, error) {
	m.mu.Lock()
	t := m.tasks[id]
	m.mu.Unlock()
	if t == nil {
		return "", fmt.Errorf("task not found: %s", id)
	}
	switch action {
	case "pause":
		return t.pause("管理面暂停")
	case "resume":
		return t.resume()
	case "stop":
		return m.stop(t)
	default:
		return "", fmt.Errorf("不支持的 action: %s", action)
	}
}

// Status 任务状态快照(不存在时 exists=false)
func (m *Manager) Status(id string) StatusInfo {
	m.mu.Lock()
	t := m.tasks[id]
	m.mu.Unlock()
	if t == nil {
		return StatusInfo{Exists: false, RssMB: RSSMB()}
	}
	return t.snapshot()
}

// List 调试面任务列表
func (m *Manager) List() []TaskBrief {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]TaskBrief, 0, len(m.tasks))
	for _, t := range m.tasks {
		out = append(out, t.brief())
	}
	return out
}

// [R67-b] Counts 删除(孤儿代码): 全仓零消费者(api/engine 的健康面各自实现,
// cmd/server /healthz 直读 MemStats); 且其 running 计数未排除 stopped(与 R53-5
// snapshot/brief 口径不一致) —— 与其留下一个语义陈旧的死方法, 不如删除,
// 未来接线时按 snapshotLocked 口径重写
// [R68 死代码清退] UptimeMs 删除(全仓零消费者)。

// removeIfSelf 身份校验移除(仅当注册表内该 id 仍指向 cur 才删)。
// [R54-2a] stop 收割与终态 TTL 双路径共用 —— 修前 stop 收割走无条件 remove(delete id),
// 若收割落地前同 id 新任务已被替换入表(旧任务 run 退出 → running=false → 新 start 抢先
// 入表; 或 60s 兜底定时器期间新 start 重建), 会误删新任务条目 → 新任务对
// /status、/tasks、/control 全部隐身且可被再次重建(同 id 双跑)。finish() 的 TTL 路径
// 本就有身份校验(仅当注册表内仍是本任务才删), 本方法把该口径收敛为单一实现
func (m *Manager) removeIfSelf(id string, cur *Task) {
	m.mu.Lock()
	if t, ok := m.tasks[id]; ok && t == cur {
		delete(m.tasks, id)
	}
	m.mu.Unlock()
}

// ---------------- Task 内部 ----------------

func newTask(p rule.TaskStartPayload, m *Manager) *Task {
	ctx, cancel := context.WithCancel(context.Background())
	t := &Task{
		ID:      p.Task.ID,
		payload: p,
		info:    p.Task,
		ruleC:   p.Rule,
		mgr:     m,
		ctx:     ctx,
		cancel:  cancel,
		exitCh:  make(chan struct{}),
		rnd:     rand.New(rand.NewSource(time.Now().UnixNano())),
	}
	t.cond = sync.NewCond(&t.mu)
	// R55 单体: sink 工厂在册(bridge 注入)时直连持久化; 否则保持原 HTTP 回调
	// (契约 §2; mini-services 独立进程形态与既有 *_test.go 的 httptest mock 链路)
	if m.sinkFactory != nil {
		t.cb = m.sinkFactory(p.Task.ID)
	} else {
		t.cb = callback.New(p.Task.ID, p.Callback.BaseURL, p.Callback.Secret)
	}
	t.fetcher = fetch.New(p.Rule.Fetch)
	// per-host 准入节奏缺省 gap: max(200ms, interval 均值/批内线程均值)
	// (R51-3-a 反反爬 ⑥: 同 host 请求至少间隔一个节奏, 防同 host 连发簇)
	threads := (p.Task.ThreadMin + p.Task.ThreadMax) / 2
	if threads < 1 {
		threads = 1
	}
	gapMs := ((p.Task.IntervalMin + p.Task.IntervalMax) / 2) / threads
	if gapMs < 200 {
		gapMs = 200
	}
	t.fetcher.SetHostGap(time.Duration(gapMs) * time.Millisecond)
	// R57-2a DB 代理池接线: 回写钩子(set-once, 先于任何请求) + 动态代理刷新循环
	// (启动即拉一次 + 每 30min 重拉; 任务 ctx 取消即退出, 见 dynamicProxyLoop)
	if m.proxyFeedback != nil {
		t.fetcher.ProxyFeedback = m.proxyFeedback
	}
	t.proxySource = m.proxySource
	if t.proxySource != nil {
		go t.dynamicProxyLoop()
	}
	t.pageFetch = func(pctx context.Context, u, referer string) (string, error) {
		res, err := t.fetcher.Fetch(pctx, u, referer)
		if err != nil {
			return "", err
		}
		if res.Blocked {
			// 拦截页等价 HTTP 403 失败(解析层翻页/正文段按错误处置, R51-3-a ⑤)
			return "", fetch.ErrBlocked
		}
		return res.HTML, nil
	}
	return t
}

// busy running/paused 态判定(重复 start 拒绝口径)
func (t *Task) busy() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.running || t.paused
}

// snapshot 状态快照(自带锁)
func (t *Task) snapshot() StatusInfo {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.snapshotLocked()
}

// snapshotLocked 状态快照(调用方已持锁)
func (t *Task) snapshotLocked() StatusInfo {
	stats := t.stats
	stats.Blocked = t.fetcher.BlockedCount()         // 可观测: 拦截页命中(fetch 层原子计数)
	stats.RateLimited = t.fetcher.RateLimitedCount() // 可观测: 429/503 收到
	return StatusInfo{
		Exists: true,
		// [R53-5] Running 语义与 brief(/tasks)/health 对齐: 排除 paused —— 修前 paused 任务在
		// /status 恒报 running=true, Next.js start 守卫(_go-control「running → 拒绝」)据此把
		// 引擎侧暂停任务(如回调失败自挂起)挡在 resume 路径之外, 操作员无法从控制面恢复(死锁);
		// brief 早已是 running&&!paused, 两口必须一致(R53 生产实测复现)
		Running: t.running && !t.stopped && !t.paused,
		Phase:   t.phase,
		Progress: Progress{
			Phase:        t.phase,
			PhaseNote:    t.phaseNote,
			Discovered:   t.discovered,
			BooksDone:    t.booksDone,
			BooksTotal:   t.booksTotal,
			TocTotal:     t.tocTotal,
			ContentDone:  t.contentDone,
			ContentTotal: t.contentTotal,
			CurrentBook:  t.currentBook,
		},
		Stats:       stats,
		RssMB:       RSSMB(),
		StartedAtMs: t.startedAt.UnixMilli(),
		LastError:   t.lastError,
	}
}

func (t *Task) brief() TaskBrief {
	t.mu.Lock()
	defer t.mu.Unlock()
	// [R54-2a] Running 排除 stopped(与 snapshotLocked R53-5 口径完全对齐): stop 已表态
	// 但 run 协程尚未退出/收割的窗口内, /tasks 不应把该任务计为 running
	return TaskBrief{ID: t.ID, Running: t.running && !t.paused && !t.stopped, Phase: t.phase, RssMB: RSSMB()}
}

// gate 暂停/停止等待门: 在书籍/批次循环边界调用(契约 §5: pause=跑完在飞批次后挂起)。
// 阻塞直至 resume(cond.Broadcast) 或 stop; 返回 false = 任务已停止, 调用方立即收尾
func (t *Task) gate() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	for t.paused && !t.stopped {
		t.cond.Wait()
	}
	return !t.stopped && t.ctx.Err() == nil
}

// pause 手动暂停(控制面): 置位后在下一个循环边界挂起
func (t *Task) pause(reason string) (string, error) {
	t.mu.Lock()
	if t.stopped {
		t.mu.Unlock()
		return "stopped", nil
	}
	if !t.running {
		t.mu.Unlock()
		return t.phase, fmt.Errorf("task not running")
	}
	already := t.paused
	t.paused = true
	t.phaseNote = reason
	t.mu.Unlock()
	if !already {
		t.logf("warn", "任务暂停: %s (在飞批次完成后挂起, 进度保留)", reason)
		t.asyncStatus("paused", reason)
	}
	return "paused", nil
}

// resume 恢复: 唤醒等待门
func (t *Task) resume() (string, error) {
	t.mu.Lock()
	if t.stopped {
		t.mu.Unlock()
		return "stopped", fmt.Errorf("task stopped")
	}
	if !t.running {
		t.mu.Unlock()
		return t.phase, fmt.Errorf("task not running")
	}
	if !t.paused {
		t.mu.Unlock()
		return "running", nil
	}
	t.paused = false
	t.mu.Unlock()
	t.cond.Broadcast()
	t.logf("info", "任务恢复(从断点续采)")
	t.asyncStatus("running", "恢复采集")
	return "running", nil
}

// stop 终止: 置位+取消 ctx+唤醒; run 协程退出后从注册表移除(异步收割)
func (m *Manager) stop(t *Task) (string, error) {
	t.mu.Lock()
	wasRunning := t.running
	t.stopped = true
	t.paused = false
	t.mu.Unlock()
	t.cond.Broadcast()
	t.cancel()
	if wasRunning {
		// 异步收割: run 协程自然退出(在飞请求随 ctx 取消)后移出注册表
		// [R54-2a] 身份校验移除: 收割落地前同 id 新任务可能已入表(见 removeIfSelf 注)
		go func() {
			select {
			case <-t.exitCh:
			case <-time.After(60 * time.Second): // 兜底: 极端挂死也不永久泄漏
			}
			m.removeIfSelf(t.ID, t)
		}()
	} else {
		m.removeIfSelf(t.ID, t) // 已终态: 直接移除(同 id 复用防误删口径一致)
	}
	t.logf("warn", "任务停止(注册表移除中)")
	return "stopped", nil
}

// pauseAuto 回调类失败自动暂停(契约 §0: 重试 3 次仍败 → 任务转 paused 并记本地日志)。
// 与手动 pause 相同: 在飞批次完成后在循环边界挂起; 恢复后从断点(重试当前书/批)续采
func (t *Task) pauseAuto(reason string) {
	t.mu.Lock()
	// [R54-2a] stop 已表态则不拉回 paused 态(与手动 pause 的 stopped 守卫同口径):
	// 修前已停任务仍会被置 paused(busy 恒真, 同 id start 被 409 拒至收割完成)且向
	// Next.js 发出 paused 状态回调(依赖对端终态条件写兜底)
	if t.stopped {
		t.mu.Unlock()
		return
	}
	already := t.paused
	t.paused = true
	t.lastError = reason
	t.mu.Unlock()
	if !already {
		t.logf("warn", "%s —— 任务自动暂停(恢复后从断点续采)", reason)
		t.asyncStatus("paused", reason)
	}
}

// asyncStatus 异步发送状态回调(不阻塞控制面/流水线挂起; 端点不可达时本地留痕)
func (t *Task) asyncStatus(status, note string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		if err := t.cb.Status(ctx, status, note); err != nil {
			fmt.Printf("[%s] 状态回调失败(%s): %v\n", t.ID, status, err)
		}
	}()
}

// ---------------- 熔断计数(契约 §5) ----------------

// chapterFailed 章节真实失败(网络层): 连败链 +1
func (t *Task) chapterFailed(u string, err error) {
	t.mu.Lock()
	t.stats.Errors++
	t.chapterFailStreak++
	streak := t.chapterFailStreak
	t.mu.Unlock()
	if streak <= 3 || streak%5 == 0 { // 限频防刷屏(首 3 条+每 5 条)
		t.logf("warn", "章节失败(%d/%d 连败): %s: %v", streak, ChapterFailCircuit, util.TruncateLog(u, 120), err)
	}
}

// chapterOK 章节成功: 连败链归零
func (t *Task) chapterOK() {
	t.mu.Lock()
	t.chapterFailStreak = 0
	t.mu.Unlock()
}

// chapterCircuitTripped 章节连败是否达弃书阈值
func (t *Task) chapterCircuitTripped() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.chapterFailStreak >= ChapterFailCircuit
}

// bookFailed 书级失败: 连败 +1; 达 BookFailCircuit → 任务转 error(返回 true)
func (t *Task) bookFailed(reason, bookURL string) bool {
	t.mu.Lock()
	t.stats.Errors++
	t.bookFailStreak++
	streak := t.bookFailStreak
	t.lastError = reason
	t.mu.Unlock()
	t.logf("error", "书籍失败(%d/%d 连败): %s: %s", streak, BookFailCircuit, util.TruncateLog(bookURL, 120), reason)
	if streak >= BookFailCircuit {
		t.mu.Lock()
		t.errored = true
		t.mu.Unlock()
		t.logf("error", "连续 %d 本书级失败, 任务熔断转 error", streak)
		return true
	}
	return false
}

// bookFinish 书收尾合并实现(原 bookOK/bookDoneCount 双实现收敛): booksDone+1 +
// currentBook 清位; ok=true 时归零书级连败(成功/跳过/空 needUrls 均非失败),
// ok=false 仅推进计数不归零连败链(熔断计数口径, 失败书也计入已完成防进度条卡死)
func (t *Task) bookFinish(ok bool) {
	t.mu.Lock()
	t.booksDone++
	t.currentBook = ""
	if ok {
		t.bookFailStreak = 0
	}
	t.mu.Unlock()
	t.asyncStats()
	t.sendProgress(false)
}

// isErrored 任务是否已被熔断置为 error
func (t *Task) isErrored() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.errored
}

// ---------------- 进度/统计回调 ----------------

// sendProgress 发送进度回调(契约 §2 merge 语义; progress 节流由回调客户端承担)。
// force=true 跳过节流(阶段切换/终态等重要节点必达)。
// 载荷构建复用 progressPayloadLocked(R51-3-a 收敛: 原与 progressPayloadNow 各持一份逐字重复)
func (t *Task) sendProgress(force bool) {
	t.mu.Lock()
	p := t.progressPayloadLocked()
	note := t.phaseNote
	t.mu.Unlock()
	if note != "" {
		p["phaseNote"] = note
	}
	// 进度回调失败不熔断(纯进度面; 决策类回调才触发自动暂停)
	_ = t.cb.SendProgress(t.ctx, p, force)
}

// asyncStats 统计回调(books/chapters 计数权威在 Next.js; Go 上报 errors/coversSaved)
func (t *Task) asyncStats() {
	t.mu.Lock()
	s := callback.StatsPayload{Errors: t.stats.Errors, CoversSaved: t.stats.CoversSaved}
	t.mu.Unlock()
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		_ = t.cb.Stats(ctx, s) // 统计回调失败不熔断(纯展示面)
	}()
}

// setPhase 阶段迁移(force progress)
func (t *Task) setPhase(phase, note string) {
	t.mu.Lock()
	t.phase = phase
	t.phaseNote = note
	t.mu.Unlock()
	t.sendProgress(true)
}

// logf 本地 stdout 日志(taskId 前缀, 契约 §1) + log 回调(best-effort;
// 日志回调失败不熔断 —— 决策类回调才承担 pause 语义)
func (t *Task) logf(level, format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	fmt.Printf("[%s] %s: %s\n", t.ID, level, msg)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		_ = t.cb.Log(ctx, level, msg)
	}()
}

var (
	rssCached      atomic.Uint64 // float64 bits
	rssSamplerOnce sync.Once
)

func sampleRSS() {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	rssCached.Store(math.Float64bits(float64(ms.Sys) / (1 << 20)))
}

func RSSMB() float64 {
	rssSamplerOnce.Do(func() {
		sampleRSS()
		go func() {
			tk := time.NewTicker(time.Second)
			for range tk.C {
				sampleRSS()
			}
		}()
	})
	return math.Float64frombits(rssCached.Load())
}
