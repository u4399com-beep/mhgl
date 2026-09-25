// ============================================================
// R66-a 极限压测 harness — 本地 mock 源站 × 引擎矩阵(零外网, 全 loopback)
//
//	形态: net/http/httptest mock 源站 + 本地正向代理回路 + fetch.Client
//	批语义对齐 task/pipeline.crawlContentBatches: 批大小=threads(固定 threadMin=
//	threadMax 消除批随机), 批间 interval 固定中值, 抓取层过 globalSem+hostGate
//
//	可配面: 响应延迟 / token-bucket 限流(429+Retry-After) / 确定性 5xx·403 注入 /
//	正文体量(模拟 5~50KB 章节正文) / hostGate 节奏(gap) 与并发闸(gateLimit) /
//	代理回路(经本地 absolute-URI 正向代理)
//
//	指标: 吞吐(成功章/分) / 错误率(按状态码分账) / p50·p95 延迟 / 内存峰值(HeapAlloc Δ)
//
//	运行分层:
//	  - 默认 go test: 6 个快测单元(确定性断言, <5s, 门禁友好)
//	  - MHGL_STRESS_FULL=1 go test -run TestStressMatrixFull -v: 全矩阵
//	    (threadMax × interval × 代理/直连 × 常规档/极限档), 结果进 worklog
//
// ============================================================
package fetch

import (
	"context"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"mhgl/internal/crawl/rule"
	"mhgl/internal/crawl/util"
)

// ---------------- mock 源站 ----------------

// stressLimiter token-bucket 服务端限流(rate tokens/s, 桶容 burst; nil 不限)
type stressLimiter struct {
	mu     sync.Mutex
	tokens float64
	burst  float64
	rate   float64 // tokens per second
	last   time.Time
}

func newStressLimiter(ratePerSec, burst float64) *stressLimiter {
	return &stressLimiter{tokens: burst, burst: burst, rate: ratePerSec, last: time.Now()}
}

func (l *stressLimiter) Allow() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	l.tokens += l.rate * now.Sub(l.last).Seconds()
	if l.tokens > l.burst {
		l.tokens = l.burst
	}
	l.last = now
	if l.tokens >= 1 {
		l.tokens--
		return true
	}
	return false
}

// stressSite mock 源站: /book/{b}/chapter/{n} 章节页(确定性错误注入 + 限流 + 延迟)
type stressSite struct {
	srv    *httptest.Server
	mu     sync.Mutex
	seq    int             // 请求序号(确定性错误注入基)
	status map[int]int     // 响应状态码分账
	lat    []time.Duration // 服务端观察到的请求间隔(诊断用)
	t0     time.Time
	// 可配面
	delay       time.Duration  // 每请求服务端处理延迟
	bodyMin     int            // 正文字节数下界(模拟章节正文 5~50KB)
	bodyMax     int            // 正文字节数上界
	limiter     *stressLimiter // 服务端限流(nil=不限)
	err5xxEvery int            // 每 N 个请求第 seq%N==0 注入 503(0=不注入)
	err403Every int            // 每 N 个请求第 seq%N==3 注入 403(0=不注入)
	errRand     *rand.Rand     // 正文体量随机源(fixed seed 确定性)
}

func newStressSite(delay time.Duration, bodyMin, bodyMax int) *stressSite {
	s := &stressSite{
		delay:   delay,
		bodyMin: bodyMin,
		bodyMax: bodyMax,
		status:  map[int]int{},
		errRand: rand.New(rand.NewSource(6666)),
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", s.handle)
	s.srv = httptest.NewServer(mux)
	s.t0 = time.Now()
	return s
}

func (s *stressSite) handle(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	s.seq++
	seq := s.seq
	s.lat = append(s.lat, time.Since(s.t0))
	s.mu.Unlock()
	if s.limiter != nil && !s.limiter.Allow() {
		w.Header().Set("Retry-After", "1")
		w.WriteHeader(http.StatusTooManyRequests)
		s.record(http.StatusTooManyRequests)
		return
	}
	// 确定性错误注入(按请求序号取模, 零随机抖动 → 测试零 flake)
	if s.err5xxEvery > 0 && seq%s.err5xxEvery == 0 {
		w.WriteHeader(http.StatusServiceUnavailable)
		s.record(http.StatusServiceUnavailable)
		return
	}
	if s.err403Every > 0 && seq%s.err403Every == 3 {
		w.WriteHeader(http.StatusForbidden)
		s.record(http.StatusForbidden)
		return
	}
	if s.delay > 0 {
		time.Sleep(s.delay)
	}
	_, _ = w.Write([]byte(stressChapterHTML(seq, s.bodySize())))
	s.record(http.StatusOK)
}

// bodySize 正文体量抽样(errRand 非并发安全, handler 并发面必须持 mu;
// bodyMin/Max 构造后只读可无锁读)
func (s *stressSite) bodySize() int {
	size := s.bodyMin
	if s.bodyMax > s.bodyMin {
		s.mu.Lock()
		size += s.errRand.Intn(s.bodyMax - s.bodyMin + 1)
		s.mu.Unlock()
	}
	return size
}

// record 状态码分账
func (s *stressSite) record(code int) {
	s.mu.Lock()
	s.status[code]++
	s.mu.Unlock()
}

func (s *stressSite) close() { s.srv.Close() }

func (s *stressSite) snapshot() (map[int]int, int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[int]int, len(s.status))
	for k, v := range s.status {
		out[k] = v
	}
	return out, s.seq
}

// stressChapterHTML 生成体量≈size 字节的章节页(≥1200 码点+正常标题 → 不判拦)
func stressChapterHTML(n, size int) string {
	filler := strings.Repeat("这一章的正文情节持续推进, 主角在风波中步步为营, 场景与对话交替展开。", 4) // ≈512B
	var b strings.Builder
	b.WriteString("<html><head><title>第 ")
	fmt.Fprintf(&b, "%d", n)
	b.WriteString(" 章 风波暗涌</title></head><body><div>")
	for b.Len() < size {
		b.WriteString(filler)
	}
	out := b.String()
	if len(out) > size {
		out = out[:size/len(filler)*len(filler)+len("<html><head><title>x</title></head><body><div>")] // 防腰斩多字节: 按整段回退
	}
	return out + "</div></body></html>"
}

// ---------------- 本地正向代理(absolute-URI 转发, 不跟随重定向) ----------------

func newStressForwardProxy() (*httptest.Server, *atomic.Int64) {
	var hops atomic.Int64
	out := &http.Client{
		Transport: &http.Transport{MaxIdleConnsPerHost: 16, IdleConnTimeout: 60 * time.Second},
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse // 代理不跟随重定向, 逐跳转发
		},
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hops.Add(1)
		if r.URL.Host == "" {
			http.Error(w, "非代理形态请求(缺 absolute-URI)", http.StatusBadRequest)
			return
		}
		req, err := http.NewRequestWithContext(r.Context(), r.Method, r.URL.String(), nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		resp, err := out.Do(req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		for _, k := range []string{"Content-Type", "Retry-After"} {
			if v := resp.Header.Get(k); v != "" {
				w.Header().Set(k, v)
			}
		}
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, io.LimitReader(resp.Body, maxBodyBytes+1))
	}))
	return srv, &hops
}

// ---------------- 矩阵单元执行器 ----------------

// stressCell 单个压测单元(批语义对齐 pipeline.crawlContentBatches)
type stressCell struct {
	label     string
	threads   int           // 批大小(=threadMax; threadMin 固定同值消除批随机)
	interval  time.Duration // 批间间隔(固定值≈drawInterval 中值)
	gap       time.Duration // SetHostGap 注入(0=不注入 → hostGate 无节奏面)
	gateLimit int           // HostGateLimit
	global    int           // GlobalConcurrency
	retries   int
	proxyURL  string        // 本地正向代理 URL(""=直连)
	requests  int           // 目标请求总数(成功+失败)
	maxWall   time.Duration // 单元时长上限(先到为准)
}

// stressMetrics 单元指标
type stressMetrics struct {
	Label       string
	Requests    int // 实际发出
	Success     int
	HTTPErr     int
	OtherErr    int
	StatusCount map[int]int
	RateLimited int64
	Elapsed     time.Duration
	Throughput  float64 // 成功章/分
	P50, P95    time.Duration
	PeakHeapMB  float64 // HeapAlloc 峰值增量
	ErrRatePct  float64
	SampleNote  string          // 提前截断说明
	lat         []time.Duration // 逐请求延迟(分位数统计原料)
}

// runStressCell 执行单元: 批内并发 Fetch + 批间 interval; 指标聚合
func runStressCell(base context.Context, c *Client, site *stressSite, cell stressCell) stressMetrics {
	ctx, cancel := context.WithTimeout(base, cell.maxWall+3*time.Second)
	defer cancel()
	m := stressMetrics{Label: cell.label, StatusCount: map[int]int{}}

	// 内存峰值采样(HeapAlloc Δ; ReadMemStats STW 代价 5ms 周期可忽略)
	var peakHeap atomic.Int64
	stopSampler := make(chan struct{})
	samplerDone := make(chan struct{})
	runtime.GC()
	var pre runtime.MemStats
	runtime.ReadMemStats(&pre)
	peakHeap.Store(int64(pre.HeapAlloc))
	go func() {
		defer close(samplerDone)
		t := time.NewTicker(5 * time.Millisecond)
		defer t.Stop()
		for {
			select {
			case <-stopSampler:
				return
			case <-t.C:
				var ms runtime.MemStats
				runtime.ReadMemStats(&ms)
				for {
					cur := peakHeap.Load()
					if int64(ms.HeapAlloc) <= cur || peakHeap.CompareAndSwap(cur, int64(ms.HeapAlloc)) {
						break
					}
				}
			}
		}
	}()

	started := time.Now()
	sent := 0
	for sent < cell.requests {
		if ctx.Err() != nil {
			break
		}
		batch := cell.threads
		if rest := cell.requests - sent; rest < batch {
			batch = rest
		}
		type outcome struct {
			lat time.Duration
			err error
			ok  bool
		}
		results := make([]outcome, batch)
		var wg sync.WaitGroup
		for i := 0; i < batch; i++ {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				u := site.srv.URL + fmt.Sprintf("/book/1/chapter/%d", sent+idx+1)
				t0 := time.Now()
				_, err := c.Fetch(ctx, u, "")
				results[idx] = outcome{lat: time.Since(t0), err: err, ok: err == nil}
			}(i)
		}
		wg.Wait()
		sent += batch
		for _, r := range results {
			m.Requests++
			m.lat = append(m.lat, r.lat)
			if r.ok {
				m.Success++
				continue
			}
			var he *httpStatusError
			if asStatusErr(r.err, &he) {
				m.HTTPErr++
				m.StatusCount[he.code]++
			} else {
				m.OtherErr++
			}
		}
		m.Elapsed = time.Since(started)
		if m.Elapsed > cell.maxWall {
			m.SampleNote = fmt.Sprintf("wall-cap 截断(%d/%d 请求)", sent, cell.requests)
			break
		}
		if sent < cell.requests && cell.interval > 0 {
			_ = util.SleepCtx(ctx, cell.interval)
		}
	}
	m.Elapsed = time.Since(started)

	close(stopSampler)
	<-samplerDone
	var post runtime.MemStats
	runtime.ReadMemStats(&post)
	m.PeakHeapMB = float64(peakHeap.Load()-int64(pre.HeapAlloc)) / (1 << 20)

	if m.Requests > 0 {
		m.Throughput = float64(m.Success) / m.Elapsed.Minutes()
		m.ErrRatePct = float64(m.HTTPErr+m.OtherErr) / float64(m.Requests) * 100
	}
	sort.Slice(m.lat, func(i, j int) bool { return m.lat[i] < m.lat[j] })
	if n := len(m.lat); n > 0 {
		m.P50 = m.lat[n*50/100]
		m.P95 = m.lat[min(n-1, n*95/100)]
	}
	m.RateLimited = c.RateLimitedCount()
	return m
}

// asStatusErr 本包内 httpStatusError 断言(免 import errors 的依赖噪声)
func asStatusErr(err error, target **httpStatusError) bool {
	for err != nil {
		if e, ok := err.(*httpStatusError); ok {
			*target = e
			return true
		}
		u, ok := err.(interface{ Unwrap() error })
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}

// newStressClient 压测客户端装配(AllowLoopback 必开 — mock 源站全 loopback)
func newStressClient(cell stressCell, proxyURL string) *Client {
	cfg := rule.FetchConfig{
		Engine:            "http",
		UaMode:            "fixed",
		Timeout:           15000,
		Retries:           cell.retries,
		HostGateLimit:     cell.gateLimit,
		GlobalConcurrency: cell.global,
		AllowLoopback:     true,
		ProxyURL:          proxyURL,
	}
	c := New(cfg)
	if cell.gap > 0 {
		c.SetHostGap(cell.gap)
	}
	return c
}

// pipelineGap 模拟 pipeline.newTask 缺省 gap: max(200ms, interval/threads)
func pipelineGap(interval time.Duration, threads int) time.Duration {
	if threads < 1 {
		threads = 1
	}
	g := interval / time.Duration(threads)
	if g < 200*time.Millisecond {
		g = 200 * time.Millisecond
	}
	return g
}

// formatMetrics 表格行
func formatMetrics(m stressMetrics) string {
	sc := ""
	for _, code := range []int{200, 403, 429, 503} {
		if n := m.StatusCount[code]; n > 0 {
			sc += fmt.Sprintf(" %d×%d", code, n)
		}
	}
	return fmt.Sprintf("%-38s req=%-4d ok=%-4d err=%-3d(%5.1f%%)[%s ] thr=%8.0f章/分 p50=%-8v p95=%-8v heapΔ=%5.1fMB rl=%-3d %s",
		m.Label, m.Requests, m.Success, m.HTTPErr+m.OtherErr, m.ErrRatePct, sc,
		m.Throughput, m.P50, m.P95, m.PeakHeapMB, m.RateLimited, m.SampleNote)
}

// ---------------- 默认门禁快测(确定性断言, 零 flake, 零外网) ----------------

// TestStressHarnessBaseline 基线单元: 单线程零节奏零错误 → 全成功且吞吐>0
func TestStressHarnessBaseline(t *testing.T) {
	site := newStressSite(3*time.Millisecond, 5<<10, 5<<10)
	defer site.close()
	cell := stressCell{label: "baseline t=1 i=0 gap=0", threads: 1, gateLimit: 4, global: 4, requests: 24, maxWall: 10 * time.Second}
	c := newStressClient(cell, "")
	defer c.Close()
	m := runStressCell(context.Background(), c, site, cell)
	t.Log(formatMetrics(m))
	if m.Success != cell.requests {
		t.Fatalf("全成功断言: success=%d want %d, status=%v", m.Success, cell.requests, m.StatusCount)
	}
	if m.Throughput <= 0 || m.P95 <= 0 {
		t.Fatalf("吞吐/延迟指标异常: %+v", m)
	}
}

// TestStressHarnessGatePacingDominates 闸门节奏主导: 16 线程在 gateLimit=3+gap=40ms
// 下吞吐被节奏钉死(总时长 ≥ (requests-1)×gap 下界), 线程加码不产生并发加速
func TestStressHarnessGatePacingDominates(t *testing.T) {
	site := newStressSite(2*time.Millisecond, 5<<10, 5<<10)
	defer site.close()
	cell := stressCell{label: "gate-dominance t=16 gap=40ms", threads: 16, gap: 40 * time.Millisecond, gateLimit: 3, global: 16, requests: 16, maxWall: 10 * time.Second}
	c := newStressClient(cell, "")
	defer c.Close()
	m := runStressCell(context.Background(), c, site, cell)
	t.Log(formatMetrics(m))
	if m.Success != cell.requests {
		t.Fatalf("全成功断言: success=%d want %d", m.Success, cell.requests)
	}
	// 16 请求至少经历 15 次 minGap 准入(降额/抖动只会更长)
	if lb := time.Duration(15) * 35 * time.Millisecond; m.Elapsed < lb {
		t.Fatalf("节奏主导断言: elapsed=%v 应 ≥ %v(15×gap 下界)", m.Elapsed, lb)
	}
}

// TestStressHarnessRateLimit429 服务端限流: 超额请求吃 429 → Retry-After 冷却窗
// 生效(客户端 RateLimitedCount>0), 退避重试消化部分失败
func TestStressHarnessRateLimit429(t *testing.T) {
	site := newStressSite(1*time.Millisecond, 5<<10, 5<<10)
	site.limiter = newStressLimiter(8, 4) // 8 rps 桶容 4: 首批 8 线程必有 429
	defer site.close()
	cell := stressCell{label: "rate-limit t=8 i=0 gap=0", threads: 8, gateLimit: 16, global: 16, retries: 1, requests: 32, maxWall: 15 * time.Second}
	c := newStressClient(cell, "")
	defer c.Close()
	m := runStressCell(context.Background(), c, site, cell)
	t.Log(formatMetrics(m))
	// 429 会被客户端 Retry-After 冷却+退避重试「透明消化」(rl>0 证明消化事件),
	// 最终分账里不再有 429 → 断言必须打在服务端注入分账上(服务端确实发过 429)
	siteStatus, _ := site.snapshot()
	if siteStatus[429] == 0 {
		t.Fatalf("服务端应已发出 429(8rps 限流 vs 8 线程零节奏): site=%v", siteStatus)
	}
	if m.RateLimited == 0 {
		t.Fatalf("客户端 RateLimitedCount 应 >0")
	}
	if m.Success == 0 {
		t.Fatalf("限流冷却窗+退避重试后应有成功: %+v", m)
	}
}

// TestStressHarnessProxyLoop 代理回路: 全部请求经本地正向代理转发(逐跳计数核账)
func TestStressHarnessProxyLoop(t *testing.T) {
	oldExempt := proxyLoopbackExempt
	proxyLoopbackExempt = false // 测试缝: 允许 loopback 目标走代理(生产口径恒直连)
	defer func() { proxyLoopbackExempt = oldExempt }()

	site := newStressSite(2*time.Millisecond, 5<<10, 5<<10)
	defer site.close()
	proxySrv, hops := newStressForwardProxy()
	defer proxySrv.Close()

	cell := stressCell{label: "proxy-loop t=4 i=0 gap=0", threads: 4, gateLimit: 8, global: 8, requests: 24, maxWall: 10 * time.Second}
	c := newStressClient(cell, proxySrv.URL)
	defer c.Close()
	m := runStressCell(context.Background(), c, site, cell)
	t.Log(formatMetrics(m))
	if m.Success != cell.requests {
		t.Fatalf("代理回路全成功断言: success=%d want %d status=%v", m.Success, cell.requests, m.StatusCount)
	}
	if got := hops.Load(); got != int64(cell.requests) {
		t.Fatalf("代理逐跳计数 = %d, want %d(每请求恰好一跳)", got, cell.requests)
	}
}

// TestStressHarnessErrorInjection 确定性错误注入: 1/5 请求 503 + 1/10 请求 403,
// 重试链消化后分账与请求总数守恒
func TestStressHarnessErrorInjection(t *testing.T) {
	site := newStressSite(1*time.Millisecond, 5<<10, 5<<10)
	site.err5xxEvery = 5
	site.err403Every = 10
	defer site.close()
	cell := stressCell{label: "err-inject t=4 retries=2", threads: 4, gateLimit: 8, global: 8, retries: 2, requests: 40, maxWall: 15 * time.Second}
	c := newStressClient(cell, "")
	defer c.Close()
	m := runStressCell(context.Background(), c, site, cell)
	t.Log(formatMetrics(m))
	siteStatus, siteSeq := site.snapshot()
	if siteStatus[503] == 0 || siteStatus[403] == 0 {
		t.Fatalf("服务端应已注入 503/403: %v(seq=%d)", siteStatus, siteSeq)
	}
	if m.Success+m.HTTPErr+m.OtherErr != m.Requests {
		t.Fatalf("分账守恒: ok=%d http=%d other=%d != req=%d", m.Success, m.HTTPErr, m.OtherErr, m.Requests)
	}
	if m.ErrRatePct <= 0 {
		t.Fatalf("错误率应 >0(确定性注入): %+v", m)
	}
}

// BenchmarkStressBatchThreads8 基准: 单批 8 线程章节抓取(零节奏, 5ms 延迟 mock)
func BenchmarkStressBatchThreads8(b *testing.B) {
	site := newStressSite(5*time.Millisecond, 20<<10, 20<<10)
	defer site.close()
	cell := stressCell{label: "bench t=8", threads: 8, gateLimit: 8, global: 8, requests: 8, maxWall: time.Minute}
	c := newStressClient(cell, "")
	defer c.Close()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		runStressCell(context.Background(), c, site, cell)
	}
}

// ---------------- 全矩阵(MHGL_STRESS_FULL=1 时执行; 结果进 worklog) ----------------

// envStressFull 全矩阵开关环境变量(空=默认门禁只跑快测单元, 免 CI flake/长耗时)
func envStressFull() string { return os.Getenv("MHGL_STRESS_FULL") }

// TestStressMatrixFull 矩阵压测:
//
//	常规档 A: pipeline 缺省面 — gap=max(200ms,i/t) gateLimit=3 global=10 retries=3,
//	          清场源站(无限流零错误 delay=15ms 正文 5~50KB) × 直连/代理
//	极限档 B: gap=0 gateLimit=threads global=threads(操作员激进配置面),
//	          源站 25rps 限流+确定性 10% 503 → 吞吐饱和/错误率爬升观测
func TestStressMatrixFull(t *testing.T) {
	if envStressFull() == "" {
		t.Skip("跳过全矩阵(设 MHGL_STRESS_FULL=1 执行; 默认门禁跑快测单元)")
	}

	t.Log("== 矩阵 A: 常规档(pipeline 缺省 gap/gateLimit=3/global=10, 清场源站 delay=15ms body=5~50KB) ==")
	for _, proxyMode := range []string{"direct", "proxy"} {
		proxyURL := ""
		var proxySrv *httptest.Server
		var hops *atomic.Int64
		if proxyMode == "proxy" {
			oldExempt := proxyLoopbackExempt
			proxyLoopbackExempt = false
			t.Cleanup(func() { proxyLoopbackExempt = oldExempt })
			proxySrv, hops = newStressForwardProxy()
			proxyURL = proxySrv.URL
			t.Cleanup(proxySrv.Close)
		}
		for _, threads := range []int{1, 2, 4, 8, 16} {
			for _, iv := range []time.Duration{0, 100 * time.Millisecond, 300 * time.Millisecond, 800 * time.Millisecond} {
				site := newStressSite(15*time.Millisecond, 5<<10, 50<<10)
				cell := stressCell{
					label:     fmt.Sprintf("A-%s t=%d i=%v gap=%v", proxyMode, threads, iv, pipelineGap(iv, threads)),
					threads:   threads,
					interval:  iv,
					gap:       pipelineGap(iv, threads),
					gateLimit: 3,
					global:    10,
					retries:   3,
					proxyURL:  proxyURL,
					requests:  48,
					maxWall:   6 * time.Second,
				}
				c := newStressClient(cell, proxyURL)
				m := runStressCell(context.Background(), c, site, cell)
				c.Close()
				site.close()
				ph := int64(0)
				if hops != nil {
					ph = hops.Load()
				}
				t.Log(formatMetrics(m) + fmt.Sprintf(" proxyHops=%d", ph))
			}
		}
	}

	t.Log("== 矩阵 B: 极限档(gap=0 gateLimit=threads global=threads, 源站 25rps+10% 503 delay=5ms) ==")
	for _, threads := range []int{1, 2, 4, 8, 16} {
		for _, iv := range []time.Duration{0, 100 * time.Millisecond, 300 * time.Millisecond, 800 * time.Millisecond} {
			site := newStressSite(5*time.Millisecond, 5<<10, 50<<10)
			site.limiter = newStressLimiter(25, 25)
			site.err5xxEvery = 10
			cell := stressCell{
				label:     fmt.Sprintf("B-direct t=%d i=%v", threads, iv),
				threads:   threads,
				interval:  iv,
				gap:       0,
				gateLimit: threads,
				global:    threads,
				retries:   3,
				requests:  64,
				maxWall:   6 * time.Second,
			}
			c := newStressClient(cell, "")
			m := runStressCell(context.Background(), c, site, cell)
			c.Close()
			site.close()
			t.Log(formatMetrics(m))
		}
	}
}
