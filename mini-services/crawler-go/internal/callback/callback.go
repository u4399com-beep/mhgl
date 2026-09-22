// ============================================================
// 回调客户端 — 契约 §2 (Go → Next.js http://127.0.0.1:3000/api/admin/tasks/go-callback)
//
//   - POST body: {taskId, kind, payload}
//   - 鉴权: header x-go-callback-secret (payload.secret → env GO_CALLBACK_SECRET → 缺省 go-cb-2025-mhgl)
//   - 8 种 kind: log/status/progress/stats/book/chapters/contents/cover
//   - progress 类节流: 同类 ≥1 次/秒(超出静默丢弃, 合并语义由 Next.js 侧承担)
//   - 失败重试 3 次(间隔 1s/2s/4s)仍败返回 error, 调用方(任务编排)据此把任务转 paused
//   - book 响应 {ok,bookId,skipContent,lastChapterUrl} 与 chapters 响应 {ok,needUrls}
//     必须解析并消费(增量语义核心)
//   - 单次回调超时 30s
//
// ============================================================
package callback

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"crawler-go/internal/util"
)

// DefaultSecret 契约 §0: 两侧一致实现 —— env 缺失用缺省值
const DefaultSecret = "go-cb-2025-mhgl"

// CallbackPath 回调端点路径(挂在 Next.js baseUrl 下)
const CallbackPath = "/api/admin/tasks/go-callback"

// kind 常量(契约 §2 表)
const (
	KindLog      = "log"
	KindStatus   = "status"
	KindProgress = "progress"
	KindStats    = "stats"
	KindBook     = "book"
	KindChapters = "chapters"
	KindContents = "contents"
	KindCover    = "cover"
)

// 单次回调超时(契约 §2: book/chapters/contents 均 30s; 其余同口径统一 30s)
const perAttemptTimeout = 30 * time.Second

// retryDelays 失败重试间隔(契约 §0/§2: 3 次, 1s/2s/4s) —— 总计最多 4 次尝试
var retryDelays = []time.Duration{time.Second, 2 * time.Second, 4 * time.Second}

// permanentCallbackError 不可重试回调错误: HTTP 4xx(除 429) —— 鉴权失败(403 secret
// 不匹配)/载荷非法(400/413)/路由不存在(404)等确定性失败, 重试无收益只会空烧 3 轮退避
// [R52-5 P3](审计 R52-c「403 回调重试」): postOnce 打标, send/SendWithDecision 识别即
// 快速失败返回; 429 仍走既有退避重试(限流是瞬时故障, 与 5xx/网络错误同口径)
type permanentCallbackError struct{ err error }

func (e *permanentCallbackError) Error() string { return e.err.Error() }
func (e *permanentCallbackError) Unwrap() error { return e.err }

// progressThrottle 节流窗口: progress 同类回调 ≥1 次/秒
const progressThrottle = time.Second

// responseCap 响应体上限(R51-3-a ⑭): chapters/book 决策类 8MB —— 大书 needUrls
// (5000 章×长 URL ≈1.1MB+) 可越 1MB 帽, LimitReader 截断 → JSON 解析必败 → 决策
// 回调永远失败 → auto-pause 死循环; 其余 kind 响应均为小信封, 1MB 足够
func responseCap(kind string) int64 {
	switch kind {
	case KindBook, KindChapters:
		return 8 << 20
	default:
		return 1 << 20
	}
}

// Response 回调统一响应(Next.js → Go): 所有 kind 都含 ok;
// book 额外携带 bookId/skipContent/lastChapterUrl, chapters 携带 needUrls
type Response struct {
	OK             bool     `json:"ok"`
	Error          string   `json:"error,omitempty"`
	BookID         string   `json:"bookId,omitempty"`
	SkipContent    bool     `json:"skipContent"`
	LastChapterURL string   `json:"lastChapterUrl,omitempty"`
	CoverPath      string   `json:"coverPath,omitempty"`
	NeedURLs       []string `json:"needUrls,omitempty"`
}

// BookDecision book 回调决策结果(必须消费: skipContent=true → 整本跳过正文阶段)
type BookDecision struct {
	BookID         string
	SkipContent    bool
	LastChapterURL string
}

// ChaptersDecision chapters 回调决策结果(必须消费: needUrls 空 → 本毕跳过正文阶段)
type ChaptersDecision struct {
	NeedURLs []string
}

// ChapterItem contents 回调条目(批 ≤20 章)
type ChapterItem struct {
	URL         string `json:"url"`
	Title       string `json:"title,omitempty"`
	ContentHTML string `json:"contentHtml"`
}

// Client 任务级回调客户端(每任务一个)
type Client struct {
	taskID   string
	endpoint string
	secret   string
	hc       *http.Client

	progMu   sync.Mutex
	lastProg time.Time // progress 节流游标
}

// New 创建回调客户端。
// secret 取值链: payload 显式提供 → env GO_CALLBACK_SECRET → DefaultSecret(契约 §0 两侧一致)
func New(taskID, baseURL, secret string) *Client {
	s := strings.TrimSpace(secret)
	if s == "" {
		s = strings.TrimSpace(os.Getenv("GO_CALLBACK_SECRET"))
	}
	if s == "" {
		s = DefaultSecret
	}
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	return &Client{
		taskID:   taskID,
		endpoint: base + CallbackPath,
		secret:   s,
		hc:       &http.Client{Timeout: perAttemptTimeout},
	}
}

// envelope 回调请求信封(契约 §2 POST body)
type envelope struct {
	TaskID  string      `json:"taskId"`
	Kind    string      `json:"kind"`
	Payload interface{} `json:"payload"`
}

// Send 发送回调(带重试); kind=progress 时节流(≥1 次/秒, 超出静默丢弃)。
// 返回 error 表示重试耗尽仍失败 —— 调用方应把任务转 paused(契约 §0)。
func (c *Client) Send(ctx context.Context, kind string, payload interface{}) error {
	return c.send(ctx, kind, payload, kind == KindProgress)
}

// SendProgress 进度回调: force=true 跳过节流(阶段切换/终态等重要节点必达),
// 否则同类 ≥1 次/秒节流(超出静默丢弃, 合并语义由 Next.js 侧承担)。
// [R50-1 联调修复] 原实现把 force 直接当 throttle 形参传入 —— 语义反转:
// force=true 的终态/阶段切换进度恰落在 1s 窗口内被静默丢弃(实测任务 done 后
// progress.phase 停在 content), 而 force=false 的常规进度反而永不节流。
// 正确语义: force=true → 不节流(throttle=false), force=false → 节流(throttle=true)。
func (c *Client) SendProgress(ctx context.Context, payload interface{}, force bool) error {
	return c.send(ctx, KindProgress, payload, !force)
}

// send 内部发送: throttle=false 时跳过 progress 节流前置检查
func (c *Client) send(ctx context.Context, kind string, payload interface{}, throttle bool) error {
	if ctx == nil {
		ctx = context.Background()
	}
	// 节流前置检查(仅 progress): 窗口内静默丢弃, 不算失败
	if kind == KindProgress && throttle {
		c.progMu.Lock()
		throttled := time.Since(c.lastProg) < progressThrottle
		c.progMu.Unlock()
		if throttled {
			return nil
		}
	}

	body, err := json.Marshal(envelope{TaskID: c.taskID, Kind: kind, Payload: payload})
	if err != nil {
		return fmt.Errorf("回调载荷序列化失败(kind=%s): %w", kind, err)
	}

	var lastErr error
	for attempt := 0; attempt <= len(retryDelays); attempt++ {
		if attempt > 0 {
			// 重试退避: 任务停止/取消时立即中止(不阻塞 stop)
			if err := util.SleepCtx(ctx, retryDelays[attempt-1]); err != nil {
				return fmt.Errorf("回调重试中止(kind=%s): %w", kind, err)
			}
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		// [R54-2a](R53 遗留② lastError "%!w(<nil>)" 根因) 修前 `if _, err := c.postOnce(...)`
		// 的 err 是 if 语句作用域内的遮蔽变量, 循环尾 `lastErr = err` 实际读到外层
		// json.Marshal 的 err(能走到循环说明序列化已成功, 恒为 nil) —— 重试耗尽后
		// fmt.Errorf %w(lastErr=nil) 产出 "…已重试 3 次): %!w(<nil>)": 真实失败原因
		// (contents 超时/5xx/网络错误)全部丢失, /status lastError 残留无意义格式串。
		// 修后显式捕获单次尝试错误再入 lastErr, 末次真实原因保留可追溯
		_, attemptErr := c.postOnce(ctx, kind, body)
		if attemptErr == nil {
			if kind == KindProgress {
				c.progMu.Lock()
				c.lastProg = time.Now()
				c.progMu.Unlock()
			}
			return nil
		}
		var perm *permanentCallbackError
		if errors.As(attemptErr, &perm) {
			// [R52-5 P3] 确定性 4xx: 不再退避重试, 立即上抛(调用方转 paused/错误处置)
			return fmt.Errorf("回调失败(kind=%s, 不可重试): %w", kind, attemptErr)
		}
		lastErr = attemptErr
	}
	// 防御兜底(格式化前判 nil): 正常路径能走到此处必然 4 轮尝试全败(lastErr 非 nil),
	// 但 %w(nil) 会产出 %!w(<nil>) 格式串 —— nil 时给确定语义错误, 绝不格式化空错误
	if lastErr == nil {
		lastErr = errors.New("未知失败(全部重试轮次未产生错误对象)")
	}
	return fmt.Errorf("回调失败(kind=%s, 已重试 %d 次): %w", kind, len(retryDelays), lastErr)
}

// SendWithDecision 发送 book/chapters 回调并解析响应决策字段(契约 §2 必须消费)。
func (c *Client) SendWithDecision(ctx context.Context, kind string, payload interface{}) (Response, error) {
	var resp Response
	if ctx == nil {
		ctx = context.Background()
	}
	body, err := json.Marshal(envelope{TaskID: c.taskID, Kind: kind, Payload: payload})
	if err != nil {
		return resp, fmt.Errorf("回调载荷序列化失败(kind=%s): %w", kind, err)
	}
	var lastErr error
	for attempt := 0; attempt <= len(retryDelays); attempt++ {
		if attempt > 0 {
			if err := util.SleepCtx(ctx, retryDelays[attempt-1]); err != nil {
				return resp, err
			}
		}
		if err := ctx.Err(); err != nil {
			return resp, err
		}
		resp, err = c.postOnce(ctx, kind, body)
		if err == nil {
			return resp, nil
		}
		var perm *permanentCallbackError
		if errors.As(err, &perm) {
			// [R52-5 P3] 确定性 4xx: 不再退避重试, 立即上抛(book/chapters 回调失败
			// 由 pipeline 转 pauseAuto, 语义不变, 仅省掉无收益的 3 轮退避)
			return resp, fmt.Errorf("回调失败(kind=%s, 不可重试): %w", kind, err)
		}
		lastErr = err
	}
	// [R54-2a] 同 send() 防御兜底(格式化前判 nil): lastErr 正常路径必非 nil, 但
	// %w(nil) 产出 %!w(<nil>) 格式串 —— nil 时给确定语义错误
	if lastErr == nil {
		lastErr = errors.New("未知失败(全部重试轮次未产生错误对象)")
	}
	return resp, fmt.Errorf("回调失败(kind=%s, 已重试 %d 次): %w", kind, len(retryDelays), lastErr)
}

// postOnce 单次 POST(30s 超时由 client 承担 + ctx 双保险);
// 2xx 且响应体 ok:true 才算成功, 其余(网络/HTTP 状态/ok:false)一律视为失败进入重试
func (c *Client) postOnce(ctx context.Context, kind string, body []byte) (Response, error) {
	var resp Response
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return resp, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-go-callback-secret", c.secret)
	httpResp, err := c.hc.Do(req)
	if err != nil {
		return resp, err
	}
	defer httpResp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(httpResp.Body, responseCap(kind)))
	if err != nil {
		return resp, fmt.Errorf("读响应失败: %w", err)
	}
	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
		err := fmt.Errorf("HTTP %d: %s", httpResp.StatusCode, util.TruncateLog(string(raw), 120))
		// [R52-5 P3] 4xx(除 429) → 不可重试快速失败(见 permanentCallbackError 注)
		if httpResp.StatusCode >= 400 && httpResp.StatusCode < 500 && httpResp.StatusCode != http.StatusTooManyRequests {
			return resp, &permanentCallbackError{err}
		}
		return resp, err
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return resp, fmt.Errorf("响应非 JSON(ok 缺失): %s", util.TruncateLog(string(raw), 120))
	}
	if !resp.OK {
		return resp, fmt.Errorf("响应 ok:false: %s", util.TruncateLog(resp.Error, 120))
	}
	return resp, nil
}

// ---------------- 8 种 kind 的语义化封装(契约 §2 payload 形状) ----------------

// Log log 回调: {level, message}
func (c *Client) Log(ctx context.Context, level, message string) error {
	return c.Send(ctx, KindLog, map[string]string{"level": level, "message": message})
}

// StatusPayload status 回调载荷: Task.status 迁移(paused 保留进度)
type StatusPayload struct {
	Status string `json:"status"`
	Note   string `json:"note,omitempty"`
}

// Status status 回调: {status, note?}
func (c *Client) Status(ctx context.Context, status, note string) error {
	return c.Send(ctx, KindStatus, StatusPayload{Status: status, Note: note})
}

// StatsPayload stats 回调载荷(merge 进 Task.stats, 仅覆盖出现的键)
type StatsPayload struct {
	BooksCreated    int64 `json:"booksCreated,omitempty"`
	BooksUpdated    int64 `json:"booksUpdated,omitempty"`
	ChaptersCreated int64 `json:"chaptersCreated,omitempty"`
	ChaptersUpdated int64 `json:"chaptersUpdated,omitempty"`
	CoversSaved     int64 `json:"coversSaved,omitempty"`
	Errors          int64 `json:"errors,omitempty"`
}

// Stats stats 回调
func (c *Client) Stats(ctx context.Context, s StatsPayload) error {
	return c.Send(ctx, KindStats, s)
}

// BookPayload book 回调载荷(建书/更新书; 字段来自 parseBook)
type BookPayload struct {
	BookURL       string `json:"bookUrl"`
	Name          string `json:"name,omitempty"`
	Author        string `json:"author,omitempty"`
	Category      string `json:"category,omitempty"`
	Keywords      string `json:"keywords,omitempty"`
	Intro         string `json:"intro,omitempty"`
	CoverURL      string `json:"coverUrl,omitempty"`
	Status        string `json:"status,omitempty"`
	LatestChapter string `json:"latestChapter,omitempty"`
}

// Book book 回调: 响应 {ok, bookId, skipContent, lastChapterUrl} 必须消费
func (c *Client) Book(ctx context.Context, p BookPayload) (BookDecision, error) {
	resp, err := c.SendWithDecision(ctx, KindBook, p)
	if err != nil {
		return BookDecision{}, err
	}
	return BookDecision{
		BookID:         resp.BookID,
		SkipContent:    resp.SkipContent,
		LastChapterURL: resp.LastChapterURL,
	}, nil
}

// TocItemPayload chapters 回调目录条目
type TocItemPayload struct {
	Title  string `json:"title"`
	URL    string `json:"url"`
	Volume string `json:"volume,omitempty"`
}

// ChaptersPayload chapters 回调载荷(全书目录; >5000 章分多次带 seq/final)
type ChaptersPayload struct {
	BookURL string           `json:"bookUrl"`
	Items   []TocItemPayload `json:"items"`
	Seq     int              `json:"seq,omitempty"`
	Final   bool             `json:"final"`
}

// Chapters chapters 回调: 响应 {ok, needUrls} 必须消费(增量去重决策)
func (c *Client) Chapters(ctx context.Context, p ChaptersPayload) (ChaptersDecision, error) {
	resp, err := c.SendWithDecision(ctx, KindChapters, p)
	if err != nil {
		return ChaptersDecision{}, err
	}
	need := resp.NeedURLs
	if need == nil {
		need = []string{}
	}
	return ChaptersDecision{NeedURLs: need}, nil
}

// ContentsPayload contents 回调载荷(批 ≤20 章)
type ContentsPayload struct {
	BookURL string        `json:"bookUrl"`
	Items   []ChapterItem `json:"items"`
}

// Contents contents 回调(Next.js 按 url 幂等 upsert)
func (c *Client) Contents(ctx context.Context, p ContentsPayload) error {
	return c.Send(ctx, KindContents, p)
}

// CoverPayload cover 回调载荷(b64 解码后 ≤10MB, 由调用方保证)
type CoverPayload struct {
	BookURL     string `json:"bookUrl"`
	B64         string `json:"b64"`
	ContentType string `json:"contentType"`
}

// Cover cover 回调: Next.js sharp→webp 存盘并回写 Book.cover
func (c *Client) Cover(ctx context.Context, p CoverPayload) error {
	return c.Send(ctx, KindCover, p)
}

// R51-3-a 清理收敛: 本文件原私有 sleepCtx/truncateStr 与 fetch/task 各自的逐字重复
// 实现已统一收敛到 internal/util(SleepCtx/TruncateLog); 死代码 ErrAborted 已删除
// (全库无引用; R51-2-b 清理项)
