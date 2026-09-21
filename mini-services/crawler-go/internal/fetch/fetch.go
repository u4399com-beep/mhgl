// ============================================================
// 抓取客户端 — 契约 §4 fetch 子集
// UA 池+同域钉扎(mobile/desktop 子集筛选) / 头组仿真 v1(fingerprint.go) / headers
// / cookies(静态种子注入 Jar + Set-Cookie 跟随, 直连+代理双路径接线)
// / Referer 链 / timeout+retries(400ms×2^a 指数退避钳 8s) / hostGate per-host
// 并发闸(缺省3, 降额回升, minGap 准入节奏+限流冷却窗) / 全局并发(缺省10)
// / http(s)/socks5 代理池轮换(失败指数冷却) / contentProxyUrl / token 预取
// (不过闸直连+host 缓存 5min, 嵌套过闸死锁修复) / mirrorDomains 故障切换+成功域
// sticky / pathJitter / SSRF 守卫(allowLoopback + tokenUrl/contentProxyUrl 隐式
// 豁免 + 拨号后 RemoteAddr 复检防 DNS rebinding) / Retry-After 尊重(钳 120s/兜底 30s)
// / 拦截页检测(blockcheck.go, Result.Blocked 出口判定)
// 语义权威: /home/z/my-project/src/lib/crawl/fetcher.ts(子集移植)
// ============================================================
package fetch

import (
	"bytes"
	"compress/flate"
	"compress/gzip"
	"compress/zlib"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"crawler-go/internal/rule"
	"crawler-go/internal/util"
)

// 响应体上限 10MB(与 TS 引擎 maxResponseBytes 同量级; cover b64 解码后 ≤10MB 契约对齐)
const maxBodyBytes = 10 << 20

// token 预取缓存 TTL(按 host; 模板含 {url} 的逐请求签名形态按完整 tokenUrl 键)
const tokenCacheTTL = 5 * time.Minute

// Retry-After 冷却参数(契约: 显式合法值钳 120s 上限; 缺失/非法/<1s 兜底 30s)
const (
	retryAfterMax      = 120 * time.Second
	retryAfterFallback = 30 * time.Second
)

// 重试退避(400ms×2^a 指数, 钳 8s, 保留抖动)
const (
	backoffBase = 400 * time.Millisecond
	backoffMax  = 8 * time.Second
)

// 代理失败冷却(30s×2^n 指数, 钳 10min)
const (
	proxyFailBase = 30 * time.Second
	proxyFailMax  = 10 * time.Minute
)

// UA 池(对齐 TS UA_POOL 摘要: Chrome 137~142/Edge/Safari17-18/Firefox126-130/移动端,
// 完整列表以 TS 侧为准; Go 侧维护同版本段等效池; 含移动端条目 → uaMode=mobile/desktop
// 可按子集筛选, capability 不再报 unsupported)
var UA_POOL = []string{
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 Edg/137.0.0.0",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
	"Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
	"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
	"Mozilla/5.0 (Linux; Android 14; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
}

// uaMode=mobile/desktop 的池子集(包初始化时按 isMobileUA 一次筛定; R51-3-a 头组仿真
// 落地后解除 unsupported, 子集筛选保证移动 UA 只配移动指纹)
var (
	mobileUAPool  = filterUA(true)
	desktopUAPool = filterUA(false)
)

func filterUA(mobile bool) []string {
	out := make([]string, 0, len(UA_POOL))
	for _, ua := range UA_POOL {
		if isMobileUA(ua) == mobile {
			out = append(out, ua)
		}
	}
	return out
}

// ---------------- hostGate per-host 并发闸+节奏 ----------------

type hostGate struct {
	mu               sync.Mutex
	inflight         int
	base             int           // 基准上限(hostGateLimit)
	limit            int           // 当前生效上限(降额后可回升)
	fails            int           // 连续失败计数
	oks              int           // 连续成功计数
	minGap           time.Duration // 当前准入间隔(自适应后可放大)
	baseGap          time.Duration // 基准准入间隔(pipeline 缺省 max(200ms, interval/threads))
	lastAdmit        time.Time     // 上次放行时刻(minGap 节奏锚点)
	rateLimitedUntil time.Time     // 限流冷却窗(429/503 Retry-After)
}

func newHostGate(base int, gap time.Duration) *hostGate {
	return &hostGate{base: base, limit: base, minGap: gap, baseGap: gap}
}

const (
	gateFailTrip   = 3 // 连续失败 3 次 → 降额至 1
	gateOkRecover  = 5 // 连续成功 5 次 → 回升 1 档(不超过基准)
	gatePollPeriod = 20 * time.Millisecond
	gateAdaptTrip  = 3               // 连续失败 ≥3 → minGap ×1.5 自适应
	gateGapCap     = 3 * time.Second // 自适应 gap 上限(对齐 TS HOST_RHYTHM_ENFORCE_CAP)
)

// acquire 过闸: 限流冷却期内单 timer 阻塞等待(勿 20ms 轮询空转); minGap 未到点
// 同样 timer 等待; 槽位满时保持既有短轮询(升档/释放的亚秒级事件)
func (g *hostGate) acquire(ctx context.Context) error {
	for {
		g.mu.Lock()
		now := time.Now()
		if g.rateLimitedUntil.After(now) {
			d := g.rateLimitedUntil.Sub(now)
			g.mu.Unlock()
			if err := util.SleepCtx(ctx, d); err != nil {
				return err
			}
			continue
		}
		if g.inflight < g.limit {
			if g.minGap > 0 && !g.lastAdmit.IsZero() {
				if el := now.Sub(g.lastAdmit); el < g.minGap {
					d := g.minGap - el
					g.mu.Unlock()
					if err := util.SleepCtx(ctx, d); err != nil {
						return err
					}
					continue
				}
			}
			g.inflight++
			g.lastAdmit = time.Now()
			g.mu.Unlock()
			return nil
		}
		g.mu.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(gatePollPeriod):
		}
	}
}

func (g *hostGate) release() {
	g.mu.Lock()
	if g.inflight > 0 {
		g.inflight--
	}
	g.mu.Unlock()
}

func (g *hostGate) noteFailure() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.fails++
	g.oks = 0
	if g.fails >= gateFailTrip {
		g.limit = 1 // 连续失败降额至 1
	}
	// 简版自适应: 连败 ≥3 → 准入 gap ×1.5, 钳 3s(基准 gap 为 0 时不惩罚)
	if g.fails >= gateAdaptTrip && g.baseGap > 0 {
		g.minGap = time.Duration(float64(g.minGap) * 1.5)
		if g.minGap > gateGapCap {
			g.minGap = gateGapCap
		}
	}
}

func (g *hostGate) noteSuccess() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.fails = 0
	g.oks++
	if g.oks >= gateOkRecover && g.limit < g.base {
		g.limit++ // 连续成功回升(不超过基准)
		g.oks = 0
	}
	g.minGap = g.baseGap // 成功即恢复基准节奏
}

// setRateLimited 限流冷却窗(Retry-After): 仅当新窗更晚才推进(避免旧值回拨)
func (g *hostGate) setRateLimited(d time.Duration) {
	if d <= 0 {
		return
	}
	until := time.Now().Add(d)
	g.mu.Lock()
	if until.After(g.rateLimitedUntil) {
		g.rateLimitedUntil = until
	}
	g.mu.Unlock()
}

// ---------------- SSRF 守卫 ----------------

var loopbackHostRe = regexp.MustCompile(`(?i)^(localhost|.*\.localhost|127\.[0-9.]+|\[?::1\]?)$`)

func isLoopbackIP(ip net.IP) bool { return ip.IsLoopback() }

func isDeniedIP(ip net.IP) bool {
	// 私网/链路本地(含云元数据 169.254.169.254)/未指定/组播 一律拒绝(仅 loopback 可豁免)
	return ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified() || ip.IsMulticast()
}

// dnsCache 带 TTL 的 DNS 缓存(R51-2-b #10: 无 TTL 缓存放大 DNS rebinding 窗口)
var dnsCache = struct {
	sync.Mutex
	m map[string]dnsEntry
}{m: map[string]dnsEntry{}}

type dnsEntry struct {
	ips []net.IP
	exp time.Time
}

const dnsCacheTTL = 60 * time.Second

func resolveHost(host string) ([]net.IP, error) {
	dnsCache.Lock()
	if ent, ok := dnsCache.m[host]; ok && time.Now().Before(ent.exp) {
		dnsCache.Unlock()
		return ent.ips, nil
	}
	dnsCache.Unlock()
	ips, err := net.LookupIP(host)
	if err != nil {
		return nil, err
	}
	dnsCache.Lock()
	if len(dnsCache.m) > 4096 { // 有界缓存
		dnsCache.m = map[string]dnsEntry{}
	}
	dnsCache.m[host] = dnsEntry{ips: ips, exp: time.Now().Add(dnsCacheTTL)}
	dnsCache.Unlock()
	return ips, nil
}

// ssrfCheck 目标地址安全校验: loopback 需显式豁免; 私网/元数据恒拒(对齐 TS assertSafeTarget)
func ssrfCheck(rawURL string, allowLoopback bool) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("URL 解析失败: %v", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("仅允许 http/https 目标: %s", u.Scheme)
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("目标缺少 host")
	}
	if loopbackHostRe.MatchString(host) {
		if !allowLoopback {
			return fmt.Errorf("loopback 目标未获豁免: %s", host)
		}
		return nil
	}
	if ip := net.ParseIP(host); ip != nil {
		if isLoopbackIP(ip) {
			if !allowLoopback {
				return fmt.Errorf("loopback 目标未获豁免: %s", host)
			}
			return nil
		}
		if isDeniedIP(ip) {
			return fmt.Errorf("私网/元数据目标拒绝: %s", host)
		}
		return nil
	}
	ips, err := resolveHost(host)
	if err != nil || len(ips) == 0 {
		return fmt.Errorf("DNS 解析失败: %v", err)
	}
	for _, ip := range ips {
		if isLoopbackIP(ip) && !allowLoopback {
			return fmt.Errorf("loopback 目标未获豁免: %s", host)
		}
		if isDeniedIP(ip) {
			return fmt.Errorf("私网/元数据目标拒绝: %s", host)
		}
	}
	return nil
}

// ---------------- Client ----------------

// Result 抓取结果(HTML 已按 charset 解码为 UTF-8; Blocked=拦截页/挑战壳判定, 编排层按失败消费)
type Result struct {
	HTML       string
	FinalURL   string
	StatusCode int
	Blocked    bool
}

// ErrBlocked 拦截页判定错误(编排层等价 httpStatusError{403} 计失败路径, 不入 contents 回调)
var ErrBlocked = errors.New("内容疑似拦截页/挑战壳(等价 HTTP 403 计失败)")

// Client 任务级抓取客户端(每任务一个: CookieJar 会话/UA 钉扎/闸门状态随任务存续)
type Client struct {
	cfg rule.FetchConfig

	jar     *cookiejar.Jar // 直连+代理双路径接线(契约 §4 autoCookie 恒开)
	hc      *http.Client   // 无代理共享传输(连接池+拨号级 SSRF 复检)
	hcLocal *http.Client   // loopback 豁免通道(token 预取/contentProxy 内部直连; 拨号级复检放行回环)

	globalSem chan struct{} // 全局在飞闸

	mu               sync.Mutex
	hostGates        map[string]*hostGate
	hostGap          time.Duration     // 新建闸门的基准准入间隔(SetHostGap 注入)
	uaPin            map[string]string // 同域 UA 钉扎(FIFO cap 200)
	uaOrder          []string
	lastPath         string        // pathJitter: 上一次请求 path
	proxyIdx         atomic.Uint64 // 代理池轮换游标
	proxies          []*url.URL    // 解析后的代理池
	proxyTans        map[string]*http.Transport
	proxyFailedUntil map[string]time.Time  // per-proxy 失败冷却(key=代理串)
	proxyFailCount   map[string]int        // per-proxy 连败计数(指数冷却底数)
	lastProxyWarn    time.Time             // 全冷却 warn 限频
	mirrorSticky     map[string]string     // 镜像组成功域 sticky(key=注册域 eTLD+1, R51-4 对齐 TS registrableDomainOf: 同注册域多子域共享 sticky; 值=上次成功 host)
	jarSeeded        map[string]bool       // 静态 Cookie 已注入 host 集合(每 host 一次)
	tokenCache       map[string]tokenEntry // token 预取缓存
	blockedCount     atomic.Int64          // 可观测: 拦截页命中数
	rateLimitedCount atomic.Int64          // 可观测: 429/503 收到数
}

type tokenEntry struct {
	token string
	exp   time.Time
}

// New 创建抓取客户端
func New(cfg rule.FetchConfig) *Client {
	// 防御性下限(正常路径由 Sanitize 钳制; 直构 Client 的调用方/测试零值安全:
	// globalSem 容量 0 会因 select 双 case 无法推进而死锁, hostGate limit 0 永不方行)
	if cfg.GlobalConcurrency < 1 {
		cfg.GlobalConcurrency = 1
	}
	if cfg.HostGateLimit < 1 {
		cfg.HostGateLimit = 1
	}
	c := &Client{
		cfg:              cfg,
		globalSem:        make(chan struct{}, cfg.GlobalConcurrency),
		hostGates:        map[string]*hostGate{},
		uaPin:            map[string]string{},
		proxyTans:        map[string]*http.Transport{},
		proxyFailedUntil: map[string]time.Time{},
		proxyFailCount:   map[string]int{},
		mirrorSticky:     map[string]string{},
		jarSeeded:        map[string]bool{},
		tokenCache:       map[string]tokenEntry{},
	}
	jar, err := cookiejar.New(nil)
	if err != nil {
		jar, _ = cookiejar.New(&cookiejar.Options{})
	}
	c.jar = jar
	// CookieJar 恒开(契约 §4: autoCookie; 静态 Cookie 按目标 host 懒注入 jar, 见 seedJar)
	// 直连传输带拨号级 SSRF 复检(dial 后 RemoteAddr 复用 isDeniedIP — DNS rebinding
	// TOCTOU 防护: ssrfCheck 的 DNS 校验与实际拨号之间窗口)
	c.hc = &http.Client{
		Transport: &http.Transport{
			MaxIdleConnsPerHost: 8,
			MaxConnsPerHost:     0,
			IdleConnTimeout:     60 * time.Second,
			DialContext:         c.safeDialContext(cfg.AllowLoopback),
		},
		Jar: c.jar,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("重定向次数过多")
			}
			return nil
		},
	}
	// loopback 豁免通道(R51-3-a 补全): token 预取/contentProxy 的隐式 loopback 豁免
	// 仅在 URL 校验层放行还不够 —— 拨号级 SSRF 复检同样按豁免口径构造, 否则
	// ssrfCheck(tu,true) 过了、dial-guard 依然拒绝本地 token 端点, 契约声明语义失效
	c.hcLocal = &http.Client{
		Transport: &http.Transport{
			MaxIdleConnsPerHost: 4,
			IdleConnTimeout:     60 * time.Second,
			DialContext:         c.safeDialContext(true),
		},
		Jar:           c.jar,
		CheckRedirect: c.hc.CheckRedirect,
	}
	// 代理池解析(http/https/socks5 — Go Transport 原生支持 socks5:// scheme;
	// socks5h 归一为 socks5; 非法条目跳过)
	if cfg.ProxyURL != "" {
		for _, raw := range strings.Split(cfg.ProxyURL, ",") {
			raw = strings.TrimSpace(raw)
			if raw == "" {
				continue
			}
			if !strings.Contains(raw, "://") {
				raw = "http://" + raw
			}
			if pu, err := url.Parse(raw); err == nil {
				switch pu.Scheme {
				case "http", "https", "socks5":
					c.proxies = append(c.proxies, pu)
				case "socks5h":
					pu.Scheme = "socks5"
					c.proxies = append(c.proxies, pu)
				}
			}
		}
	}
	return c
}

// SetHostGap 注入 per-host 准入节奏(对已有闸门不追溯, 仅作用于其后新建闸门)
func (c *Client) SetHostGap(d time.Duration) {
	c.mu.Lock()
	c.hostGap = d
	c.mu.Unlock()
}

// BlockedCount 拦截页命中计数(可观测)
func (c *Client) BlockedCount() int64 { return c.blockedCount.Load() }

// RateLimitedCount 429/503 收到计数(可观测)
func (c *Client) RateLimitedCount() int64 { return c.rateLimitedCount.Load() }

// safeDialContext 拨号级 SSRF 复检: 拨号完成后校验 RemoteAddr 实连 IP(封 DNS rebinding
// TOCTOU: 域名校验时解析到公网 IP, 实拨时被 rebinding 到私网的攻击面)。仅作用于直连
// 传输; 代理传输的目标解析发生在代理侧, 操作员自担其代理配置。
func (c *Client) safeDialContext(allowLoopback bool) func(ctx context.Context, network, addr string) (net.Conn, error) {
	d := &net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		conn, err := d.DialContext(ctx, network, addr)
		if err != nil {
			return nil, err
		}
		ra := conn.RemoteAddr()
		var ip net.IP
		if tcp, ok := ra.(*net.TCPAddr); ok {
			ip = tcp.IP
		} else if s := ra.String(); strings.Contains(s, ":") {
			if h, _, serr := net.SplitHostPort(s); serr == nil {
				ip = net.ParseIP(h)
			}
		}
		if ip == nil {
			conn.Close()
			return nil, fmt.Errorf("SSRF dial-guard: RemoteAddr 不可解析(%s)", ra)
		}
		if isDeniedIP(ip) || (!allowLoopback && ip.IsLoopback()) {
			conn.Close()
			return nil, fmt.Errorf("SSRF dial-guard: 实拨 IP 被拒(%s) — DNS rebinding 防护", ip)
		}
		return conn, nil
	}
}

// Close 释放空闲连接
func (c *Client) Close() {
	for _, hc := range []*http.Client{c.hc, c.hcLocal} {
		if tr, ok := hc.Transport.(*http.Transport); ok {
			tr.CloseIdleConnections()
		}
	}
	c.mu.Lock()
	for _, tr := range c.proxyTans {
		tr.CloseIdleConnections()
	}
	c.mu.Unlock()
}

// gateFor 取(或建)host 闸门
func (c *Client) gateFor(host string) *hostGate {
	c.mu.Lock()
	defer c.mu.Unlock()
	g, ok := c.hostGates[host]
	if !ok {
		g = newHostGate(c.cfg.HostGateLimit, c.hostGap)
		c.hostGates[host] = g
	}
	return g
}

// pickUA UA 选取: custom → customUa; mobile/desktop → 池子集; 其余 → 池内随机+同域钉扎
func (c *Client) pickUA(host string) string {
	if c.cfg.UaMode == "custom" && c.cfg.CustomUa != "" {
		return c.cfg.CustomUa
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if ua, ok := c.uaPin[host]; ok {
		return ua
	}
	pool := UA_POOL
	switch c.cfg.UaMode {
	case "mobile":
		pool = mobileUAPool
	case "desktop":
		pool = desktopUAPool
	}
	ua := pool[int(randomIndex())%len(pool)]
	if host != "" {
		if len(c.uaOrder) >= 200 { // FIFO 淘汰 20 最旧(R3-1 同口径)
			drop := 20
			if drop > len(c.uaOrder) {
				drop = len(c.uaOrder)
			}
			for _, k := range c.uaOrder[:drop] {
				delete(c.uaPin, k)
			}
			c.uaOrder = c.uaOrder[drop:]
		}
		c.uaPin[host] = ua
		c.uaOrder = append(c.uaOrder, host)
	}
	return ua
}

// randomIndex crypto/rand 派生索引(独立于 pickUA 的历史实现, 复用时间熵回退)
func randomIndex() uint64 {
	var b [8]byte
	if _, err := rand.Read(b[:]); err == nil {
		return uint64(b[0]) | uint64(b[1])<<8 | uint64(b[2])<<16 | uint64(b[3])<<24
	}
	return uint64(time.Now().UnixNano())
}

// pickProxy 代理选取: 回环目标豁免直连; 冷却中代理过滤; 全冷却回退直连+warn(限频)
func (c *Client) pickProxy(target *url.URL) *url.URL {
	if len(c.proxies) == 0 || target == nil {
		return nil
	}
	if loopbackHostRe.MatchString(target.Hostname()) {
		return nil // 回环豁免直连(本地 mock/token 代理经代理转发出不去)
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	alive := make([]*url.URL, 0, len(c.proxies))
	for _, p := range c.proxies {
		if until, bad := c.proxyFailedUntil[p.String()]; bad && now.Before(until) {
			continue // 失败冷却中, 跳过
		}
		alive = append(alive, p)
	}
	if len(alive) == 0 {
		if now.Sub(c.lastProxyWarn) > 30*time.Second { // warn 限频 30s
			c.lastProxyWarn = now
			fmt.Printf("[fetcher] warn: 代理池全部处于失败冷却(%d 条), 回退直连\n", len(c.proxies))
		}
		return nil
	}
	var idx uint64
	switch c.cfg.ProxyRotation {
	case "random":
		idx = randomIndex()
	default: // round-robin(least-used/sticky-host v1 简并为轮换, 契约仅要求轮换语义)
		idx = c.proxyIdx.Add(1) - 1
	}
	return alive[idx%uint64(len(alive))]
}

// markProxyFailed 代理失败冷却: 30s×2^n 指数, 钳 10min
func (c *Client) markProxyFailed(pu *url.URL) {
	if pu == nil {
		return
	}
	key := pu.String()
	c.mu.Lock()
	defer c.mu.Unlock()
	c.proxyFailCount[key]++
	n := c.proxyFailCount[key]
	d := proxyFailBase << uint(n-1)
	if d > proxyFailMax || d <= 0 {
		d = proxyFailMax
	}
	c.proxyFailedUntil[key] = time.Now().Add(d)
}

// markProxySuccess 代理成功: 清零连败与冷却
func (c *Client) markProxySuccess(pu *url.URL) {
	if pu == nil {
		return
	}
	key := pu.String()
	c.mu.Lock()
	delete(c.proxyFailCount, key)
	delete(c.proxyFailedUntil, key)
	c.mu.Unlock()
}

// transportFor 代理传输复用(池内每代理一个 Transport)
func (c *Client) transportFor(pu *url.URL) *http.Transport {
	if pu == nil {
		return c.hc.Transport.(*http.Transport)
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if tr, ok := c.proxyTans[pu.String()]; ok {
		return tr
	}
	tr := &http.Transport{
		Proxy:           http.ProxyURL(pu),
		MaxConnsPerHost: 8,
		IdleConnTimeout: 60 * time.Second,
	}
	c.proxyTans[pu.String()] = tr
	return tr
}

// mirrorGroup 镜像组展开: 当前 URL host + mirrorDomains 全组(URL host 置换);
// sticky 成功域重排(上次成功 host 提至首位, 防每次都先撞死主域)
func (c *Client) mirrorGroup(rawURL string) []string {
	group := []string{rawURL}
	if c.cfg.MirrorDomains == "" {
		return group
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return group
	}
	curHost := strings.ToLower(u.Host)
	for _, d := range strings.Split(c.cfg.MirrorDomains, ",") {
		d = strings.ToLower(strings.TrimSpace(d))
		if d == "" || d == curHost {
			continue
		}
		mu := *u
		mu.Host = d
		group = append(group, mu.String())
	}
	// sticky 重排: 上次成功 host 首位(持锁访问; key=注册域, R51-4 与 TS 口径对齐:
	// 同注册域多子域镜像共享 sticky 记忆, 修前 key=整 host 使子域间不互享)
	c.mu.Lock()
	sticky := c.mirrorSticky[registrableDomain(curHost)]
	c.mu.Unlock()
	if sticky != "" {
		head := []string{}
		rest := []string{}
		for i, cand := range group {
			if i > 0 && urlHostOf(cand) == sticky {
				head = append(head, cand)
			} else {
				rest = append(rest, cand)
			}
		}
		if len(head) > 0 {
			group = append(head, rest...)
		}
	}
	return group
}

func urlHostOf(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return strings.ToLower(u.Host)
}

// noteMirrorSuccess 记录镜像成功域 sticky(key=注册域 eTLD+1, R51-4 对齐 TS registrableDomainOf;
// 值仍为完整候选 host, 重排时按 host 全等匹配组内条目)
func (c *Client) noteMirrorSuccess(primaryHost, candHost string) {
	key := registrableDomain(primaryHost)
	if key == "" || candHost == "" {
		return
	}
	c.mu.Lock()
	c.mirrorSticky[key] = candHost
	c.mu.Unlock()
}

// clearMirrorSticky 整组耗尽即清 sticky(防死镜像钉死; key=注册域同 noteMirrorSuccess)
func (c *Client) clearMirrorSticky(primaryHost string) {
	key := registrableDomain(primaryHost)
	if key == "" {
		return
	}
	c.mu.Lock()
	delete(c.mirrorSticky, key)
	c.mu.Unlock()
}

// Fetch 页面抓取主入口(refererURL: refererChain 启用时作本请求 Referer)
func (c *Client) Fetch(ctx context.Context, rawURL, refererURL string) (Result, error) {
	return c.fetch(ctx, rawURL, refererURL, false)
}

// FetchBinary 二进制抓取(封面图): 不做 charset 解码/不走 contentProxy
func (c *Client) FetchBinary(ctx context.Context, rawURL string) ([]byte, string, error) {
	res, err := c.rawFetch(ctx, rawURL, "", false, false)
	if err != nil {
		return nil, "", err
	}
	return res.body, res.contentType, nil
}

// FetchContent content 段抓取: contentProxyUrl 包裹优先(响应 JSON {ok,content} 或纯文本行
// → <p> wrap), 失败降级直连原 URL(契约 §4)。无 Referer 形态, 委托 FetchContentRef
func (c *Client) FetchContent(ctx context.Context, rawURL string) (Result, error) {
	return c.FetchContentRef(ctx, rawURL, "")
}

// FetchContentRef 带 Referer 的正文段抓取: contentProxyUrl 包裹优先, 降级直连时
// 注入显式 Referer(契约 §4 refererChain: 章节页带目录页 Referer)
func (c *Client) FetchContentRef(ctx context.Context, rawURL, refererURL string) (Result, error) {
	cp := strings.TrimSpace(c.cfg.ContentProxyURL)
	if cp == "" {
		return c.fetch(ctx, rawURL, refererURL, false)
	}
	if !matchesTemplateOrigin(rawURL, cp) {
		if proxyURL := strings.ReplaceAll(cp, "{url}", rule.EncodeURIComponent(rawURL)); proxyURL != "" {
			if err := ssrfCheck(proxyURL, true); err == nil { // contentProxy 隐式 loopback 豁免
				html, err := c.fetchViaContentProxy(ctx, proxyURL)
				if err == nil && html != "" {
					return Result{HTML: html, FinalURL: proxyURL, StatusCode: 200}, nil
				}
				fmt.Printf("[fetcher] contentProxyUrl 未给出有效内容, 降级直连原 URL: %v (proxy=%s)\n", err, util.Truncate(proxyURL, 120))
			} else {
				fmt.Printf("[fetcher] contentProxyUrl SSRF 拒绝: %v (proxy=%s)\n", err, util.Truncate(proxyURL, 120))
			}
		}
	}
	// 降级直连原 URL
	return c.fetch(ctx, rawURL, refererURL, false)
}

// fetchViaContentProxy 经转换代理取正文: JSON {ok,content} 或纯文本行 → <p> wrap
func (c *Client) fetchViaContentProxy(ctx context.Context, proxyURL string) (string, error) {
	// 转换代理为 loopback 服务: 剥离出口代理直连(R8-16 同口径)
	res, err := c.rawFetch(ctx, proxyURL, "", true, true)
	if err != nil {
		return "", err
	}
	var obj struct {
		OK      bool   `json:"ok"`
		Content string `json:"content"`
		Error   string `json:"error"`
	}
	if json.Unmarshal([]byte(res.bodyText()), &obj) == nil && obj.OK && strings.TrimSpace(obj.Content) != "" {
		return wrapLinesToParagraphs(obj.Content), nil
	}
	// 纯文本形态: 非 JSON 响应按行 wrap(契约 §4)
	txt := strings.TrimSpace(res.bodyText())
	if txt != "" && !strings.HasPrefix(txt, "{") {
		return wrapLinesToParagraphs(txt), nil
	}
	return "", fmt.Errorf("代理响应无效: %s", util.Truncate(obj.Error, 100))
}

// wrapLinesToParagraphs 纯文本行 → <p>(HTML 转义 + 过滤空行, 对齐 TS 引擎)
func wrapLinesToParagraphs(text string) string {
	var b strings.Builder
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		line = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(line)
		b.WriteString("<p>" + line + "</p>")
	}
	return b.String()
}

// rawFetch 单次传输(含 mirror 组轮换 + retries; 带 SSRF/闸门/UA/Cookie/Referer)。
// loopbackExempt: 内部通道(token 预取/contentProxy)的回环豁免 —— URL 校验层与拨号
// 级复检层(ssrfCheck + safeDialContext)两处均按豁免口径放行, 仅限 directOnly 直连
func (c *Client) rawFetch(ctx context.Context, rawURL, refererURL string, directOnly, loopbackExempt bool) (rawResult, error) {
	if err := ssrfCheck(rawURL, c.cfg.AllowLoopback || loopbackExempt); err != nil {
		return rawResult{}, fmt.Errorf("SSRF blocked: %v", err)
	}
	// pathJitter: 跨不同 URL path 切换时插入 100~500ms 随机延迟(契约 §4)
	if c.cfg.PathJitter {
		if u, err := url.Parse(rawURL); err == nil {
			c.mu.Lock()
			changed := c.lastPath != "" && c.lastPath != u.Path
			c.lastPath = u.Path
			c.mu.Unlock()
			if changed {
				_ = util.SleepCtx(ctx, time.Duration(100+int64(time.Now().UnixNano()%400))*time.Millisecond)
			}
		}
	}

	// token 预取(bb-d): 在取闸【之前】完成 — prefetchToken 内部不再走 rawFetch 抢闸,
	// 否则并发 ≥ 闸容量时(全局闸+host 闸双持)嵌套等待形成死锁(R51-2-b P1-1)
	reqURL := rawURL
	extraHeaders := map[string]string{}
	if strings.TrimSpace(c.cfg.TokenURL) != "" {
		if token := c.prefetchToken(ctx, reqURL); token != "" {
			reqURL, extraHeaders = injectToken(reqURL, token, &c.cfg)
		}
	}

	// 全局在飞闸(契约 §4: globalConcurrency 缺省 10, 跨 host 共享总量上限)
	select {
	case c.globalSem <- struct{}{}:
		defer func() { <-c.globalSem }()
	case <-ctx.Done():
		return rawResult{}, ctx.Err()
	}
	primaryHost := ""
	if u, err := url.Parse(reqURL); err == nil {
		primaryHost = strings.ToLower(u.Host)
	}
	gate := c.gateFor(primaryHost)
	if err := gate.acquire(ctx); err != nil {
		return rawResult{}, err
	}
	defer gate.release()

	group := c.mirrorGroup(reqURL)
	attempts := 1 + c.cfg.Retries
	var lastErr error
	for _, cand := range group {
		for a := 0; a < attempts; a++ {
			if err := ctx.Err(); err != nil {
				return rawResult{}, err
			}
			if a > 0 {
				// 重试间重过闸(R51-3-a ⑥): release+re-acquire 使重试链尊重
				// Retry-After 冷却窗(acquire 单 timer 阻塞等待, 不轮询)与
				// minGap 节奏 —— 429 后立刻重发只会再次撞限流
				gate.release()
				if err := gate.acquire(ctx); err != nil {
					return rawResult{}, err
				}
			}
			res, err := c.doOnce(ctx, cand, refererURL, extraHeaders, directOnly, gate, loopbackExempt)
			if err == nil {
				gate.noteSuccess()
				if len(group) > 1 {
					c.noteMirrorSuccess(primaryHost, urlHostOf(cand)) // 成功域 sticky
				}
				return res, nil
			}
			gate.noteFailure()
			lastErr = err
			var httpErr *httpStatusError
			if errors.As(err, &httpErr) && (httpErr.code == 404 || httpErr.code < 400) {
				// 404/3xx: 换镜像无意义, 直接返回错误(TS 镜像 404 不切换口径)
				return rawResult{}, err
			}
			// 退避: 400ms×2^a 指数, 钳 8s, 保留抖动
			boff := backoffBase << uint(a)
			if boff > backoffMax || boff <= 0 {
				boff = backoffMax
			}
			_ = util.SleepCtx(ctx, boff+time.Duration(time.Now().UnixNano()%200)*time.Millisecond)
		}
	}
	// 整组耗尽: 清 sticky(防死镜像钉死)
	if len(group) > 1 {
		c.clearMirrorSticky(primaryHost)
	}
	if lastErr == nil {
		lastErr = errors.New("抓取失败")
	}
	return rawResult{}, lastErr
}

// rawResult 原始响应
type rawResult struct {
	body        []byte
	contentType string
	finalURL    string
	status      int
	server      string // Server 头(WAF 联合判定消费)
}

func (r rawResult) bodyText() string { return string(r.body) }

// httpStatusError HTTP 状态错误(403/404/429/5xx 触发重试/换镜像/失败计数)
type httpStatusError struct{ code int }

func (e *httpStatusError) Error() string { return fmt.Sprintf("HTTP %d", e.code) }

// parseRetryAfter 解析 Retry-After(整数秒与 HTTP 日期双形态; 对齐 TS parseRetryAfterHeaderMs)
// ok=false = 缺失/非法(调用方兜底 30s); HTTP 日期已过期返回 0(<1s 噪声底 → 兜底 30s)
func parseRetryAfter(raw string, now time.Time) (time.Duration, bool) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return 0, false
	}
	if isPlainDigits(s) {
		n, err := strconv.Atoi(s)
		if err != nil || n <= 0 {
			return 0, false
		}
		return time.Duration(n) * time.Second, true
	}
	if t, err := http.ParseTime(s); err == nil {
		d := t.Sub(now)
		if d < 0 {
			d = 0
		}
		return d, true
	}
	return 0, false
}

// retryAfterCooldown 冷却窗参数对齐 TS 契约: 显式合法值 ≥1s 如实采纳、钳 120s 上限、
// 缺失/非法/<1s 兜底 30s
func retryAfterCooldown(d time.Duration, ok bool) time.Duration {
	switch {
	case !ok, d < time.Second:
		return retryAfterFallback
	case d > retryAfterMax:
		return retryAfterMax
	default:
		return d
	}
}

func isPlainDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// doOnce 单次 HTTP 请求(ua+头组仿真/headers/cookies(Jar)/referer/代理/超时/Retry-After)
// gate: 归属的 host 闸(限流冷却窗写入; token 直连等无闸调用传 nil);
// loopbackExempt: 强制走 hcLocal 回环豁免直连(跳过代理池)
func (c *Client) doOnce(ctx context.Context, rawURL, refererURL string, extraHeaders map[string]string, directOnly bool, gate *hostGate, loopbackExempt bool) (rawResult, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawResult{}, fmt.Errorf("URL 解析失败: %v", err)
	}
	timeout := time.Duration(c.cfg.Timeout) * time.Millisecond
	if timeout <= 0 {
		timeout = 20 * time.Second
	}
	tctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(tctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return rawResult{}, err
	}
	ua := c.pickUA(strings.ToLower(u.Host))
	family := uaFamily(ua)
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Accept", acceptForFamily(family)) // 家族化 Accept(Safari 不发 avif/apng)
	req.Header.Set("Accept-Language", acceptLanguageFor(ua))
	// 显式 Accept-Encoding: gzip, deflate(不发 br/zstd — Go 标准库解不了); 声明后
	// Transport 不再自动解压, 由 readBody 按响应 Content-Encoding 手动解压
	req.Header.Set("Accept-Encoding", "gzip, deflate")
	req.Header.Set("Upgrade-Insecure-Requests", "1")
	// Referer 解析提前(指纹 Sec-Fetch-Site 依赖生效 Referer)
	effReferer := ""
	if refererURL != "" && c.cfg.RefererChain != nil && *c.cfg.RefererChain {
		effReferer = refererURL
	} else if c.cfg.Referer == nil || *c.cfg.Referer {
		effReferer = u.Scheme + "://" + u.Host + "/"
	}
	// 指纹头组(sec-ch-ua*/Sec-Fetch-* 按 UA 家族; 先于规则头 — cfg.headers 可覆盖单项)
	for k, v := range fingerprintHeaders(ua, effReferer, rawURL) {
		req.Header.Set(k, v)
	}
	// 附加规则头
	for k, v := range c.cfg.Headers {
		req.Header.Set(k, v)
	}
	if effReferer != "" {
		req.Header.Set("Referer", effReferer)
	}
	// token header 注入
	for k, v := range extraHeaders {
		req.Header.Set(k, v)
	}
	// 静态 Cookie 种子(每 host 一次注入 jar; 同名键由 jar 统一出口去重 —
	// 服务端 Set-Cookie 覆盖静态种子)
	c.seedJar(u)

	client := c.hc
	var pu *url.URL
	if loopbackExempt {
		// 内部通道(token 预取/contentProxy): 回环豁免直连, 不经代理
		client = c.hcLocal
	} else if !directOnly {
		if pu = c.pickProxy(u); pu != nil {
			client = &http.Client{Transport: c.transportFor(pu), Timeout: timeout, Jar: c.jar, CheckRedirect: c.hc.CheckRedirect}
		}
	}
	resp, err := client.Do(req)
	if err != nil {
		if pu != nil {
			c.markProxyFailed(pu) // 代理失败指数冷却
		}
		return rawResult{}, err // 网络层/超时 → 触发重试与镜像切换
	}
	defer resp.Body.Close()
	if pu != nil {
		c.markProxySuccess(pu)
	}
	// 429/503 → Retry-After 尊重 + per-host 限流冷却窗
	if resp.StatusCode == 429 || resp.StatusCode == 503 {
		c.rateLimitedCount.Add(1)
		if gate != nil {
			d, ok := parseRetryAfter(resp.Header.Get("Retry-After"), time.Now())
			gate.setRateLimited(retryAfterCooldown(d, ok))
		}
	}
	body, readErr := readBodyDecompressed(resp)
	if readErr != nil {
		// 部分读也当失败(R51-2-b #2: len(body)>0 但中途断流 → 半截正文不得入库)
		return rawResult{}, readErr
	}
	res := rawResult{body: body, contentType: resp.Header.Get("Content-Type"), finalURL: resp.Request.URL.String(), status: resp.StatusCode, server: resp.Header.Get("Server")}
	if resp.StatusCode == 404 {
		// 404 语义对齐 TS !res.ok: 资源不存在即失败, 不交解析层(R51-2-b #8)
		return res, &httpStatusError{code: 404}
	}
	if resp.StatusCode == 403 || resp.StatusCode == 429 || resp.StatusCode >= 500 {
		return res, &httpStatusError{code: resp.StatusCode}
	}
	return res, nil
}

// readBodyDecompressed 读响应体(≤10MB)+按 Content-Encoding 手动解压
// (请求已显式声明 Accept-Encoding: gzip, deflate → Transport 不自动解压)
func readBodyDecompressed(resp *http.Response) ([]byte, error) {
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes))
	if err != nil {
		return raw, err
	}
	switch strings.ToLower(strings.TrimSpace(resp.Header.Get("Content-Encoding"))) {
	case "gzip":
		zr, zerr := gzip.NewReader(bytes.NewReader(raw))
		if zerr != nil {
			return nil, fmt.Errorf("gzip 解压失败: %v", zerr)
		}
		defer zr.Close()
		return io.ReadAll(io.LimitReader(zr, maxBodyBytes))
	case "deflate":
		// deflate 双形态: zlib 包裹(常见)与裸 flate; 先试 zlib 失败回退裸 flate
		if zr, zerr := zlib.NewReader(bytes.NewReader(raw)); zerr == nil {
			if out, derr := io.ReadAll(io.LimitReader(zr, maxBodyBytes)); derr == nil {
				zr.Close()
				return out, nil
			}
			zr.Close()
		}
		fr := flate.NewReader(bytes.NewReader(raw))
		defer fr.Close()
		return io.ReadAll(io.LimitReader(fr, maxBodyBytes))
	default:
		return raw, nil
	}
}

// seedJar 静态 Cookie 按 host 懒注入(每 host 首次请求时注入一次; jar 统一出口
// 天然去重: 服务端 Set-Cookie 同名覆盖静态种子)
func (c *Client) seedJar(u *url.URL) {
	if c.cfg.Cookies == "" {
		return
	}
	key := strings.ToLower(u.Host)
	c.mu.Lock()
	if c.jarSeeded[key] {
		c.mu.Unlock()
		return
	}
	c.jarSeeded[key] = true
	c.mu.Unlock()
	if cookies := parseCookieHeader(c.cfg.Cookies); len(cookies) > 0 {
		c.jar.SetCookies(u, cookies)
	}
}

// parseCookieHeader "a=1; b=2" 形态静态 Cookie 串 → []*http.Cookie(无属性种子)
func parseCookieHeader(s string) []*http.Cookie {
	var out []*http.Cookie
	for _, part := range strings.Split(s, ";") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		eq := strings.Index(part, "=")
		if eq <= 0 {
			continue
		}
		name := strings.TrimSpace(part[:eq])
		val := strings.TrimSpace(part[eq+1:])
		if name == "" {
			continue
		}
		out = append(out, &http.Cookie{Name: name, Value: val})
	}
	return out
}

// fetch 完整抓取: 传输 + charset 解码 + 拦截页出口判定
func (c *Client) fetch(ctx context.Context, rawURL, refererURL string, directOnly bool) (Result, error) {
	res, err := c.rawFetch(ctx, rawURL, refererURL, directOnly, false)
	if err != nil {
		// 404 与其余错误统一失败语义(与 TS !res.ok 口径一致)
		return Result{}, err
	}
	charset := rule.SniffCharset([]byte(res.contentType), res.body)
	htmlStr := rule.DecodeBody(res.body, charset)
	// 拦截页/挑战壳出口判定(blockcheck.go; 词表语义权威在 TS fetcher.ts)
	blocked := LooksBlocked(htmlStr, res.status, res.server)
	if blocked {
		c.blockedCount.Add(1)
	}
	return Result{HTML: htmlStr, FinalURL: res.finalURL, StatusCode: res.status, Blocked: blocked}, nil
}

// ---------------- token 预取(bb-d) ----------------

// prefetchToken 预取 token: {url} 占位符替换后经 fetchTokenDirect 直连获取(不过闸),
// 按 host(或含 {url} 的按完整 tokenUrl)缓存 5min
func (c *Client) prefetchToken(ctx context.Context, reqURL string) string {
	tpl := strings.TrimSpace(c.cfg.TokenURL)
	if tpl == "" {
		return ""
	}
	tu := strings.ReplaceAll(tpl, "{url}", rule.EncodeURIComponent(reqURL))
	if tu == "" {
		return ""
	}
	cacheKey := ""
	if u, err := url.Parse(tu); err == nil {
		if strings.Contains(tpl, "{url}") {
			cacheKey = "url:" + tu // 逐请求签名形态: 同 URL 重试复用, 跨 URL 不复用
		} else {
			cacheKey = "host:" + strings.ToLower(u.Host)
		}
	}
	if cacheKey != "" {
		c.mu.Lock()
		ent, ok := c.tokenCache[cacheKey]
		c.mu.Unlock()
		if ok && time.Now().Before(ent.exp) {
			return ent.token
		}
	}
	token := c.fetchTokenDirect(ctx, tu)
	if token != "" && cacheKey != "" {
		c.mu.Lock()
		c.tokenCache[cacheKey] = tokenEntry{token: token, exp: time.Now().Add(tokenCacheTTL)}
		c.mu.Unlock()
	}
	return token
}

// fetchTokenDirect token 直连获取: ssrfCheck 隐式 loopback 豁免(契约文件头声明语义,
// 本地签名/转换代理形态; R51-2-b P1-3 修复: 原实现误走 cfg.AllowLoopback) →
// 直接 doOnce(不过 globalSem/hostGate — 嵌套过闸死锁修复的另一半)
func (c *Client) fetchTokenDirect(ctx context.Context, tu string) string {
	if err := ssrfCheck(tu, true); err != nil {
		fmt.Printf("[fetcher] token 预取 SSRF 拒绝: %v (tokenUrl=%s)\n", err, util.Truncate(tu, 120))
		return ""
	}
	res, err := c.doOnce(ctx, tu, "", nil, true, nil, true)
	if err != nil {
		fmt.Printf("[fetcher] token 预取失败: %v (tokenUrl=%s)\n", err, util.Truncate(tu, 120))
		return ""
	}
	return extractToken(res.bodyText(), c.cfg.TokenPattern)
}

// extractToken token 提取: regex: 前缀正则(第一捕获组, 编译结果缓存)或 JSON 点路径
func extractToken(body, pat string) string {
	pat = strings.TrimSpace(pat)
	if pat == "" {
		return strings.TrimSpace(body)
	}
	if strings.HasPrefix(pat, "regex:") {
		expr := strings.TrimPrefix(pat, "regex:")
		var re *regexp.Regexp
		if v, ok := tokenPatCache.Load(expr); ok {
			re = v.(*regexp.Regexp)
		} else {
			var err error
			re, err = regexp.Compile(expr)
			if err != nil {
				return ""
			}
			tokenPatCache.Store(expr, re)
		}
		m := re.FindStringSubmatch(body)
		if m == nil {
			return ""
		}
		if len(m) > 1 {
			return m[1]
		}
		return m[0]
	}
	// JSON 点路径(rule 包导出实现收敛, 语义同解析层)
	root := rule.ParseJSONBody(body)
	if root == nil {
		return ""
	}
	v := rule.JSONGet(root, pat)
	if s, ok := v.(string); ok {
		return s
	}
	if n, ok := v.(json.Number); ok {
		return string(n)
	}
	if v != nil {
		return fmt.Sprintf("%v", v)
	}
	return ""
}

// tokenPatCache tokenPattern 正则编译缓存(热路径免重复编译)
var tokenPatCache sync.Map // pattern → *regexp.Regexp

// injectToken token 注入: 'header' → 请求头; 'url'(缺省) → {token}/%7Btoken%7D 占位符
// 替换, 无占位符时追加 ?token=/&token= 查询参数
func injectToken(reqURL, token string, cfg *rule.FetchConfig) (string, map[string]string) {
	if cfg.TokenInjection == "header" {
		name := cfg.TokenHeaderName
		if name == "" {
			name = "X-Token"
		}
		return reqURL, map[string]string{name: token}
	}
	if strings.Contains(reqURL, "{token}") {
		return strings.ReplaceAll(reqURL, "{token}", rule.EncodeURIComponent(token)), nil
	}
	if strings.Contains(reqURL, "%7Btoken%7D") {
		return strings.ReplaceAll(reqURL, "%7Btoken%7D", rule.EncodeURIComponent(token)), nil
	}
	sep := "?"
	if strings.Contains(reqURL, "?") {
		sep = "&"
	}
	return reqURL + sep + "token=" + rule.EncodeURIComponent(token), nil
}

// matchesTemplateOrigin 目标 URL host:port 与模板一致(自指防护, R30-3-1 同口径)
func matchesTemplateOrigin(rawURL, template string) bool {
	t := strings.ReplaceAll(template, "{url}", rule.EncodeURIComponent("https://example.com/"))
	tu, err1 := url.Parse(t)
	u, err2 := url.Parse(rawURL)
	if err1 != nil || err2 != nil {
		return false
	}
	return strings.EqualFold(tu.Hostname(), u.Hostname()) && tu.Port() == u.Port()
}
