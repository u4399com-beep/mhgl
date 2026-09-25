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
// / TLS 指纹仿真(utls.go, fetch.tlsFingerprint=chrome: 直连/代理隧道后 Chrome
// ClientHello 重放, ALPN 钉 h1; 缺省关, 内部通道 token/contentProxy 不启用)
// / [R67-a] 重定向链逐跳 Referer 浏览器语义(strict-origin-when-cross-origin:
// 降级不发/跨源仅 origin/同源全 URL — 修前标准库对显式 Referer 原样透传到所有
// 后续跳, 泄漏给重定向链上任一异源目标且本身即非浏览器指纹)
// / [R67-a] 代理地址缺省端口(http:80/https:443/socks5:1080)/ CGNAT 100.64/10
// 纳入 SSRF 拒绝面 / 负 Retries 零值防御
// / 头序评估结论: Go 标准库 h1 头序为字典序不可控, 头序仿真需 fork net/http,
// 只评估不动手(详见 fingerprint.go 文件头与 worklog R67-a)
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
	"crypto/tls"
	"encoding/binary"
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

	"github.com/andybalholm/brotli"
	"github.com/klauspost/compress/zstd"

	"mhgl/internal/crawl/rule"
	"mhgl/internal/crawl/util"
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

// [R66-a] challenge 形态退避重试(200 壳挑战页): 退避曲线 base×2^attempt 钳 max,
// 附 +0~50% 抖动; 重试次数预算 = min(cfg.Retries, challengeRetryMax)(Retries=0 保持
// 旧口径零重试)。base 为包级变量仅供测试注入缩短等待, 生产恒 400ms
const (
	challengeRetryMax   = 2
	challengeBackoffMax = 3 * time.Second
)

var challengeBackoffBase = 400 * time.Millisecond

// 代理失败冷却(30s×2^n 指数, 钳 10min)
const (
	proxyFailBase = 30 * time.Second
	proxyFailMax  = 10 * time.Minute
)

// proxyFeedbackFailAfter 代理结果回写钩子的连败阈值(连败达此值 → ProxyFeedback(addr,false),
// 装配方据以把 DB 池条目 alive=0 + healthScore-5; 成功事件则 lastUsedAt+healthScore+1。
// fetch 只报事实, 增量记账在 crawl 包回写泵与 store 侧执行)
const proxyFeedbackFailAfter = 3

// ProxyAddrSource 动态代理源接口(R57-2a DB 代理池接线缝): fetch 包不 import store,
// engine/bridge 装配点传入 *store.DB(实现 AliveProxyAddrs)即完成注入。
// 返回 "protocol://host:port" 健康分降序; 空切片=池空(消费方不得据此清空现有池)
type ProxyAddrSource interface {
	AliveProxyAddrs(limit int) ([]string, error)
}

// UA 池([R59-2c-batch2] 新鲜度刷新: Chrome 140~143/Edge 143/Safari 17.4~18.4/
// Firefox 141~143/移动端 iOS 17~18.4/Android 14 — 修前池内 Chrome 137~141 与注释
// "137~142"、Firefox 125 与注释 "126~130" 三方脱节, FF125/Chrome137 已入大版本黑名单
// 风险区间; 单体 Go 引擎以本池为权威, TS 历史池(obscura.ts 137~139)不再同步;
// 含移动端条目 → uaMode=mobile/desktop 可按子集筛选, capability 不再报 unsupported)
var uaPool = []string{
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0",
	"Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
	"Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
	"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36",
	"Mozilla/5.0 (Linux; Android 14; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
}

// uaMode=mobile/desktop 的池子集(包初始化时按 isMobileUA 一次筛定; R51-3-a 头组仿真
// 落地后解除 unsupported, 子集筛选保证移动 UA 只配移动指纹)
var (
	mobileUAPool  = filterUA(true)
	desktopUAPool = filterUA(false)
)

func filterUA(mobile bool) []string {
	out := make([]string, 0, len(uaPool))
	for _, ua := range uaPool {
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
	admitJitterDen = 4               // [R64-a] 准入抖动分母(附加 +0~1/4 等待量)
)

// admitJitter 准入节奏抖动: d 的 +0~d/4 随机附加量(crypto/rand 独立源; d<=0 恒 0)。
// 并发等待者各抖各的, 同时打散「同锚点睡眠同醒」的请求簇
func admitJitter(d time.Duration) time.Duration {
	if d <= 0 {
		return 0
	}
	return time.Duration(randomIndex() % uint64(d/admitJitterDen+1))
}

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
					// [R64-a](节奏抖动) 准入等待附加 +0~25% 抖动: 恒定间隔
					// 节拍本身是机器指纹(服务端测相邻请求间隔方差≈0 即可判
					// 机器人); 只增不减 —— 永远不低于配置节奏, 限流冷却窗
					// (上方分支)保持精确不抖
					d += admitJitter(d)
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

// noteChallenge 挑战页证据反馈([R66-a] 反反爬 ③配套): 200 壳挑战页(looksBlocked 命中)
// 是目标站压速信号 —— 仅自适应放宽准入节奏(×1.5 钳 gateGapCap, 与连败自适应同款曲线),
// 不动并发降额链(200 挑战的证据强度低于 429/503 限流, 不应直接枪毙并发额度);
// 成功请求会把 minGap 归位基准(noteSuccess), 瞬态挑战只影响紧随其后的准入
func (g *hostGate) noteChallenge() {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.baseGap > 0 {
		g.minGap = time.Duration(float64(g.minGap) * 1.5)
		if g.minGap > gateGapCap {
			g.minGap = gateGapCap
		}
	}
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
	// [R67-a] CGNAT 100.64.0.0/10(RFC 6598 运营商/云厂商内网段): net.IP.IsPrivate
	// 不覆盖该段, 补齐防 SSRF 内网探测面
	if v4 := ip.To4(); v4 != nil && v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127 {
		return true
	}
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

	// ProxyFeedback 代理结果回写钩子(可选, R57-2a/R58-2a): 经该代理的请求成功 → (addr,true);
	// 连败达 proxyFeedbackFailAfter → (addr,false)。异步消费由装配方承担(本侧仅轻判
	// 阈值不阻塞热路径); 装配方(回写泵)按事件增量记账 DB 侧 healthScore(+1/-5 钳界)。
	// set-once 语义: 必须在首个请求前设置(无锁读取)
	ProxyFeedback func(addr string, ok bool)

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
	proxyIdx         atomic.Uint64 // 代理池轮换游标("roundrobin" 形态用)
	proxies          []*url.URL    // 解析后的代理池
	proxyTans        map[string]*http.Transport
	proxyFailedUntil map[string]time.Time  // per-proxy 失败冷却(key=代理串)
	proxyFailCount   map[string]int        // per-proxy 连败计数(指数冷却底数)
	proxySuccCount   map[string]int64      // [R58-2a] per-proxy 成功计数(加权随机权重; 失败减半衰减)
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
	// [R67-a] 负 Retries 防御: rawFetch attempts=1+Retries ≤0 时重试循环整体跳过,
	// 每次抓取必以「抓取失败」告终(与 Timeout 的零值回退同理兜直构调用方; Sanitize
	// 正常路径已锥 0..5 不受影响)
	if cfg.Retries < 0 {
		cfg.Retries = 0
	}
	c := &Client{
		cfg:              cfg,
		globalSem:        make(chan struct{}, cfg.GlobalConcurrency),
		hostGates:        map[string]*hostGate{},
		uaPin:            map[string]string{},
		proxyTans:        map[string]*http.Transport{},
		proxyFailedUntil: map[string]time.Time{},
		proxyFailCount:   map[string]int{},
		proxySuccCount:   map[string]int64{},
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
	// TOCTOU 防护: ssrfCheck 的 DNS 校验与实际拨号之间窗口); TLS 指纹仿真开启时
	// https 目标经 newDirectTransport 的 DialTLSContext(utls)接管
	c.hc = &http.Client{
		Transport: c.newDirectTransport(cfg.AllowLoopback),
		Jar:       c.jar,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("重定向次数过多")
			}
			// [R67-a] 逐跳 Referer 按浏览器 strict-origin-when-cross-origin 缺省
			// 策略重写: Go 标准库对显式 Referer(net/http client.go refererForURL
			// explicitRef 早退臂)恒原样透传到所有后续跳 —— 修前首跳 Referer
			// (含 cfg.headers 配置的全 URL 形态)会泄漏给重定向链上任一异源目标,
			// 且跨源跳仍带原站 Referer 本身即非浏览器指纹。语义:
			// ①https→http 降级不发 ②跨源仅发来源 origin ③同源发完整 URL(剥
			// userinfo, 与 Go 内建 refererForURL 口径一致)。cfg.headers Referer
			// 的覆盖语义只作用于首跳(与浏览器「重定向后 Referer 永远重算」一致)
			if len(via) > 0 {
				if prev := via[len(via)-1].URL; prev != nil {
					switch {
					case prev.Scheme == "https" && req.URL.Scheme == "http":
						req.Header.Del("Referer")
					case prev.Scheme != req.URL.Scheme || prev.Host != req.URL.Host:
						req.Header.Set("Referer", prev.Scheme+"://"+prev.Host+"/")
					default:
						ref := *prev
						ref.User = nil
						req.Header.Set("Referer", ref.String())
					}
				}
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
			if pu, ok := parseProxyAddr(raw); ok {
				c.proxies = append(c.proxies, pu)
			}
		}
	}
	return c
}

// parseProxyAddr 代理地址串 → 代理 URL(缺省 http 前缀; socks5h 归一 socks5;
// 无端口条目补缺省端口 [R67-a]: http:80/https:443/socks5:1080, curl 同口径 —
// 修前无端口条目通过解析却在拨号期以 missing port 失败, 错误面漂移到传输层;
// 非法/不支持协议返回 false)。New(静态池)与 SetDynamicProxies(动态池)共用单一实现
func parseProxyAddr(raw string) (*url.URL, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, false
	}
	if !strings.Contains(raw, "://") {
		raw = "http://" + raw
	}
	pu, err := url.Parse(raw)
	if err != nil {
		return nil, false
	}
	if pu.Scheme == "socks5h" {
		pu.Scheme = "socks5"
	}
	// [R67-a] 无端口形态补缺省(JoinHostPort 保 IPv6 literal 括号形态)
	if pu.Port() == "" {
		switch pu.Scheme {
		case "http":
			pu.Host = net.JoinHostPort(pu.Hostname(), "80")
		case "https":
			pu.Host = net.JoinHostPort(pu.Hostname(), "443")
		case "socks5":
			pu.Host = net.JoinHostPort(pu.Hostname(), "1080")
		}
	}
	switch pu.Scheme {
	case "http", "https", "socks5":
		return pu, true
	}
	return nil, false
}

// SetDynamicProxies 合并注入动态代理地址(R57-2a DB 代理池接线): 与既有池
// (静态 cfg.ProxyURL + 历次注入)合并去重, 只增不减 —— 空结果/全部非法不清空现有池
// (防抖: DB 侧短暂全死/查询抖动不应导致采集裸奔直连); 已有 per-proxy 冷却/连败
// 状态按地址键自然保留。返回实际新增条数
func (c *Client) SetDynamicProxies(addrs []string) int {
	if len(addrs) == 0 {
		return 0
	}
	add := make([]*url.URL, 0, len(addrs))
	for _, raw := range addrs {
		if pu, ok := parseProxyAddr(raw); ok {
			add = append(add, pu)
		}
	}
	if len(add) == 0 {
		return 0
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	have := make(map[string]struct{}, len(c.proxies)+len(add))
	for _, p := range c.proxies {
		have[p.String()] = struct{}{}
	}
	added := 0
	for _, p := range add {
		key := p.String()
		if _, dup := have[key]; dup {
			continue
		}
		have[key] = struct{}{}
		c.proxies = append(c.proxies, p)
		added++
	}
	return added
}

// ProxyCount 当前代理池条数(静态+动态合并后; 可观测/测试用)
func (c *Client) ProxyCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.proxies)
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

// newDirectTransport 直连传输: 既有口径(DialContext=SSRF 复检拨号, 定制后无内建 h2);
// fetch.tlsFingerprint=chrome 时 https 目标改走 DialTLSContext(TCP 拨号+SSRF 复检
// 后 utls 握手, 见 utls.go), 空表 TLSNextProto 锁死 h1 与既有口径一致
func (c *Client) newDirectTransport(allowLoopback bool) *http.Transport {
	tr := &http.Transport{
		MaxIdleConnsPerHost: 8,
		MaxConnsPerHost:     0,
		IdleConnTimeout:     60 * time.Second,
		DialContext:         c.safeDialContext(allowLoopback),
	}
	if tlsFingerprintEnabled(c.cfg.TLSFingerprint) {
		tr.DialTLSContext = c.safeTLSDialContext(allowLoopback)
		tr.TLSNextProto = map[string]func(string, *tls.Conn) http.RoundTripper{}
	}
	return tr
}

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
	pool := uaPool
	switch c.cfg.UaMode {
	case "mobile":
		pool = mobileUAPool
	case "desktop":
		pool = desktopUAPool
	}
	// [R64-a] 子集池空防御: 池演化若移除全部移动(或桌面)条目, len(pool)==0 时
	// 取模除零 panic; 回落全量池(有 pinned 域名永远拿得到 UA)
	if len(pool) == 0 {
		pool = uaPool
	}
	// [R63-b 协同修复] randomIndex 全量 64 位后先模后转 int: 修前 int(randomIndex())%len
	// 在 uint64 高位为 1 时 int 溢出为负 → 池内负索引 panic
	ua := pool[int(randomIndex()%uint64(len(pool)))]
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

// randomIndex crypto/rand 派生索引(独立于 pickUA 的历史实现, 复用时间熵回退)。
// [R63-c] 修前读 8 字节却只拼接低 4 字节(熵截半), 全量 64 位经 LittleEndian 还原
func randomIndex() uint64 {
	var b [8]byte
	if _, err := rand.Read(b[:]); err == nil {
		return binary.LittleEndian.Uint64(b[:])
	}
	return uint64(time.Now().UnixNano())
}

// noteChallengePacing 挑战证据按 host 反馈到对应闸门(Challenge 重试路径消费;
// finalURL 解析失败/host 空则静默忽略)
func (c *Client) noteChallengePacing(finalURL string) {
	u, err := url.Parse(finalURL)
	if err != nil {
		return
	}
	if host := strings.ToLower(u.Host); host != "" {
		c.gateFor(host).noteChallenge()
	}
}

// challengeExtraRetries challenge 重试额外次数预算(总尝试 = 1+本值):
// min(cfg.Retries, challengeRetryMax) —— Retries=0 的规则保持旧口径(挑战即失败不重试)
func (c *Client) challengeExtraRetries() int {
	if c.cfg.Retries < challengeRetryMax {
		return c.cfg.Retries
	}
	return challengeRetryMax
}

// challengeBackoff 挑战退避: base×2^attempt 指数钳 max, 附 +0~50% 抖动
// (等间隔重试序列本身是机器指纹, 抖动打散; randomIndex crypto/rand 独立源)
func challengeBackoff(attempt int) time.Duration {
	d := challengeBackoffBase << uint(attempt)
	if d > challengeBackoffMax || d <= 0 {
		d = challengeBackoffMax
	}
	return d + time.Duration(randomIndex()%uint64(d/2+1))
}

// proxyLoopbackExempt 回环目标直连豁免开关(缺省 true = 生产口径: 本地 mock/token
// 代理经代理转发出不去, 回环目标恒直连)。仅压测 harness 置 false 以便本地 mock 源站
// 也走代理回路测量代理层开销(R66-a 测试缝; 不得在非测试路径改写)
var proxyLoopbackExempt = true

// pickProxy 代理选取: 回环目标豁免直连; 冷却中代理过滤; 全冷却回退直连+warn(限频)。
// 轮换形态(R58-2a): 缺省加权随机(成功计数为权, 实证可用者多摊流量且全员保底权重 1,
// 避免健康分降序静态切片头部被集中打爆); "random" 均匀随机; "roundrobin"/"round-robin"
// 纯轮换(历史缺省形态显式保留)
func (c *Client) pickProxy(target *url.URL) *url.URL {
	if len(c.proxies) == 0 || target == nil {
		return nil
	}
	if proxyLoopbackExempt && loopbackHostRe.MatchString(target.Hostname()) {
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
	switch c.cfg.ProxyRotation {
	case "random":
		return alive[randomIndex()%uint64(len(alive))]
	case "roundrobin", "round-robin":
		return alive[(c.proxyIdx.Add(1)-1)%uint64(len(alive))]
	default:
		return c.weightedProxyPick(alive) // 持锁调用(读 proxySuccCount 同锁)
	}
}

// weightedProxyPick 加权随机([R58-2a]): weight = 1 + per-proxy 成功计数(markProxySuccess
// 记账/markProxyFailed 减半衰减) —— 好代理多摊、新代理与近期失败者保底权重 1 不饿死;
// 随机落点而非确定性首选, 单点不被打爆。调用方须持 c.mu
func (c *Client) weightedProxyPick(alive []*url.URL) *url.URL {
	total := int64(0)
	weights := make([]int64, len(alive))
	for i, p := range alive {
		w := int64(1)
		if n := c.proxySuccCount[p.String()]; n > 0 {
			w += n
		}
		weights[i] = w
		total += w
	}
	r := int64(randomIndex() % uint64(total))
	for i, w := range weights {
		if r < w {
			return alive[i]
		}
		r -= w
	}
	return alive[len(alive)-1] // 不可达防御(浮点/整除误差兜底)
}

// markProxyFailed 代理失败冷却: 30s×2^n 指数, 钳 10min; [R58-2a] 成功计数减半衰减
// (近期失败者权重回落但不归零, 冷却结束再入池时以减半权重重新竞争)
func (c *Client) markProxyFailed(pu *url.URL) {
	if pu == nil {
		return
	}
	key := pu.String()
	c.mu.Lock()
	c.proxyFailCount[key]++
	n := c.proxyFailCount[key]
	d := proxyFailBase << uint(n-1)
	if d > proxyFailMax || d <= 0 {
		d = proxyFailMax
	}
	c.proxyFailedUntil[key] = time.Now().Add(d)
	c.proxySuccCount[key] /= 2
	c.mu.Unlock()
	// [R57-2a/R58-2a] 连败达阈值 → 回写钩子(装配方异步落库 alive=0+healthScore-5;
	// 钩子自身必须非阻塞, 故意在锁外分发)
	if n >= proxyFeedbackFailAfter && c.ProxyFeedback != nil {
		c.ProxyFeedback(key, false)
	}
}

// markProxySuccess 代理成功: 清零连败与冷却; [R58-2a] 成功计数 +1(加权随机权重;
// 回写钩子同步报 DB 侧 healthScore+1 增量)
func (c *Client) markProxySuccess(pu *url.URL) {
	if pu == nil {
		return
	}
	key := pu.String()
	c.mu.Lock()
	delete(c.proxyFailCount, key)
	delete(c.proxyFailedUntil, key)
	c.proxySuccCount[key]++
	c.mu.Unlock()
	// [R57-2a/R58-2a] 成功 → 回写钩子(装配方异步刷 lastUsedAt+healthScore+1; 锁外分发)
	if c.ProxyFeedback != nil {
		c.ProxyFeedback(key, true)
	}
}

// transportFor 代理传输复用(池内每代理一个 Transport)。httpsTarget 且开启
// TLS 指纹仿真时改用 utls 隧道形态(独立键隔离, 不与普通形态互串):
//
//	普通形态: Proxy=代理URL(https 目标由 Transport 内建 CONNECT+crypto/tls)
//	utls 形态: Proxy 置空(DialTLSContext 自管 CONNECT/SOCKS5 隧道+utls 握手,
//	           Go Transport 对代理 https 的内建 TLS 无法注入); http 目标不经本形态,
//	           DialContext 回落直连 SSRF 复检拨号(仅承接跨 scheme 重定向等边缘路径)
func (c *Client) transportFor(pu *url.URL, httpsTarget bool) *http.Transport {
	if pu == nil {
		return c.hc.Transport.(*http.Transport)
	}
	useTLSFP := httpsTarget && tlsFingerprintEnabled(c.cfg.TLSFingerprint)
	key := pu.String()
	if useTLSFP {
		key += "|tlsfp"
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if tr, ok := c.proxyTans[key]; ok {
		return tr
	}
	tr := &http.Transport{
		MaxConnsPerHost:     8,
		MaxIdleConnsPerHost: 8, // [R59-2c-batch2] 缺省 2 < MaxConnsPerHost=8: 批内 8 线程下每请求冷启拨号+代理隧道重握手, 连接churn放大时延与指纹异常; 与直连传输(hc)同口径对齐
		IdleConnTimeout:     60 * time.Second,
	}
	if useTLSFP {
		tr.Proxy = nil
		tr.DialTLSContext = c.proxyTLSDialContext(pu)
		tr.DialContext = c.safeDialContext(c.cfg.AllowLoopback)
		tr.TLSNextProto = map[string]func(string, *tls.Conn) http.RoundTripper{}
	} else {
		tr.Proxy = http.ProxyURL(pu)
	}
	c.proxyTans[key] = tr
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
	// [R53-2a](审计 R52-c「端口 sticky 键」) Hostname() 剥端口: TS mirrorStickyKeyFor 用
	// new URL(url).hostname(不含端口)作键基 —— 修前取 u.Host(含端口), registrableDomain
	// 对 "host:port" 走 IP/IPv6/单标签原样返回臂 → 键=完整 host:port, 与 noteMirrorSuccess/
	// clearMirrorSticky 的注册域键口径不一致(带端口 URL 的 sticky 永不命中/互享)
	curHost := strings.ToLower(u.Hostname())
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
// 值仍为完整候选 host, 重排时按 host 全等匹配组内条目)。
// [R53-2a] primaryHostname 形参应为剥端口 hostname(rawFetch 传 u.Hostname())——
// 注册域键基不含端口(TS mirrorStickyKeyFor 同口径)
func (c *Client) noteMirrorSuccess(primaryHostname, candHost string) {
	key := registrableDomain(primaryHostname)
	if key == "" || candHost == "" {
		return
	}
	c.mu.Lock()
	c.mirrorSticky[key] = candHost
	c.mu.Unlock()
}

// clearMirrorSticky 整组耗尽即清 sticky(防死镜像钉死; key=注册域同 noteMirrorSuccess,
// [R53-2a] 入参为剥端口 hostname)
func (c *Client) clearMirrorSticky(primaryHostname string) {
	key := registrableDomain(primaryHostname)
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
	primaryHostname := "" // [R53-2a] 剥端口 hostname(TS new URL(url).hostname 口径) — mirrorSticky 键基
	if u, err := url.Parse(reqURL); err == nil {
		primaryHost = strings.ToLower(u.Host)
		primaryHostname = strings.ToLower(u.Hostname())
	}
	gate := c.gateFor(primaryHost)
	if err := gate.acquire(ctx); err != nil {
		return rawResult{}, err
	}
	// [R52-5 P3] 持闸所有权跟踪: 退避 sleep 前 release、醒后 re-acquire(合并 R51-3-a ⑥
	// 「重试间 release+re-acquire」为一处) —— 修前退避 400ms~8s 期间持闸空睡, 同 host
	// 其他请求被无谓阻塞; defer 按 gateHeld 精确释放一次, 防 acquire 中断路径重复 release
	gateHeld := true
	defer func() {
		if gateHeld {
			gate.release()
		}
	}()

	// [R63-c] 内部通道(contentProxy/token 直连, loopbackExempt=true)不做镜像组展开:
	// mirrorGroup 会把 contentProxy URL 的 host 改写成源站镜像域 —— bqg713 实配
	// contentProxyUrl(127.0.0.1:3010/unlock?url={url})+mirrorDomains(apige.cc 等)并存,
	// 修前主代理失败一次即把 /unlock?url= 探针打向源站镜像(烧配额+向源站泄漏 unlock
	// 代理形态), 且镜像站返回的 200 HTML 会被 contentProxy 通道当纯文本包进 <p> 污染
	// 正文。token 预取本就经 doOnce 直连不走 rawFetch, 与此处豁免口径天然一致
	group := []string{reqURL}
	if !loopbackExempt {
		group = c.mirrorGroup(reqURL)
	}
	attempts := 1 + c.cfg.Retries
	var lastErr error
	// [R53-2a] 非 403/429 的 4xx(400/401/405/412...)不可切换镜像(TS isMirrorSwitchableError
	// 仅 403/5xx 可切换): 同候选退避重试耗尽后快速失败, 不再轮换镜像
	failNoMirror := false
	for mi, cand := range group {
		for a := 0; a < attempts; a++ {
			if err := ctx.Err(); err != nil {
				return rawResult{}, err
			}
			res, err := c.doOnce(ctx, cand, refererURL, extraHeaders, directOnly, gate, loopbackExempt)
			if err == nil {
				gate.noteSuccess()
				if len(group) > 1 {
					c.noteMirrorSuccess(primaryHostname, urlHostOf(cand)) // 成功域 sticky
				}
				return res, nil
			}
			// [R64-a](误责防御) ctx 取消(任务停止/暂停/总闸取消)发生在 doOnce 期间时,
			// 传输失败不是目标站故障证据: 直接终止重试链, 不喂 host 连败/降额 ——
			// 修前每次停止都会把在飞请求的取消误记到无辜目标站头上
			if ctx.Err() != nil {
				return rawResult{}, err
			}
			// [R53-2a](代理误责) 代理通道层失败不喂目标 host 连败/降额链 —— 故障归属代理
			// 自身(已在 doOnce 内 markProxyFailed), 目标站健康状态未被本次请求证明; TS 侧
			// 代理循环同样只记代理账, hostgate 只见最终直连/成功结果。重试/镜像语义不变
			// (网络层失败在 TS isMirrorSwitchableError 下可切换镜像)
			var pxyErr *proxyChannelError
			if !errors.As(err, &pxyErr) {
				gate.noteFailure()
			}
			lastErr = err
			var httpErr *httpStatusError
			if errors.As(err, &httpErr) {
				if httpErr.code == 404 || httpErr.code < 400 {
					// 404/3xx: 换镜像无意义, 直接返回错误(TS 镜像 404 不切换口径)
					return rawResult{}, err
				}
				// [R53-2a](400 壳不喂降额链) 其余非 403/429 的 4xx: 同候选退避重试已按下方
				// 既有路径进行, 但不换镜像 —— Go 口径 403/429/5xx/网络层失败可切换镜像
				// (429 换镜像目标为异 host, 不受本 host 限流冷却约束)
				if httpErr.code >= 400 && httpErr.code < 500 && httpErr.code != 403 && httpErr.code != 429 {
					failNoMirror = true
				}
			}
			// 退避: 400ms×2^a 指数, 钳 8s, 保留抖动
			boff := backoffBase << uint(a)
			if boff > backoffMax || boff <= 0 {
				boff = backoffMax
			}
			// [R52-5 P3] 退避 sleep 前 release(醒后重过闸): 修前持闸空睡, 同 host 在飞被
			// 无谓占住一档; 末轮(本候选最后一次尝试)不退避不重过闸 —— 错误即返回, 避免
			// 无谓再吃一次 minGap/限流冷却等待(与修前时序一致)
			gate.release()
			gateHeld = false
			if a == attempts-1 && mi == len(group)-1 {
				break // 末候选末轮: 错误即返回, 不退避不重过闸(与修前返回时序一致)
			}
			_ = util.SleepCtx(ctx, boff+time.Duration(time.Now().UnixNano()%200)*time.Millisecond)
			// 醒后重过闸(R51-3-a ⑥ 语义合并于此): acquire 内单 timer 阻塞等待, 尊重
			// Retry-After 冷却窗与 minGap 节奏 —— 429 后立刻重发只会再次撞限流
			if err := gate.acquire(ctx); err != nil {
				return rawResult{}, err
			}
			gateHeld = true
		}
		// [R53-2a] 不可切换 4xx(400/401/405/412...): 同候选重试已耗尽, 快速失败
		// 不轮换镜像(与 TS isMirrorSwitchableError 口径一致); sticky 保持不清
		// (镜像组未被真正逐个证伪)
		if failNoMirror {
			return rawResult{}, lastErr
		}
	}
	// 整组耗尽: 清 sticky(防死镜像钉死)
	if len(group) > 1 {
		c.clearMirrorSticky(primaryHostname)
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

// proxyChannelError 代理通道层失败(经代理出口的拨号/连接未成功, 无 HTTP 状态):
// [R53-2a](审计 R52-c「代理误责」) client.Do 失败且本次走了代理时打标 —— 代理通道故障
// 已记在代理自身账上(markProxyFailed 指数冷却), rawFetch 据此豁免目标 host 的
// gate.noteFailure(不计连败/不降额)。TS 口径对齐: fetcher.ts 代理轮换循环对网络层失败
// 只 markProxyFailed+换下一条/降级直连, hostgate 只见最终成功/直连结果, 代理通道失败
// 从不喂 reportHostFailure —— 修前 Go 把死代理的失败记到健康目标站头上, 连败 3 次即
// 把无辜站点降额至 1 并发+放宽准入节奏(采集速率被代理故障绑架)
type proxyChannelError struct{ err error }

func (e *proxyChannelError) Error() string { return "代理通道失败: " + e.err.Error() }
func (e *proxyChannelError) Unwrap() error { return e.err }

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
	// 显式家族化 Accept-Encoding([R67-a] 头集完整性: 真实浏览器全家族广告 br,
	// Chrome/Firefox 额外 zstd — 与响应解压能力成对, 见 readBodyDecompressed);
	// 声明后 Transport 不再自动解压, 由 readBody 按响应 Content-Encoding 手动解压
	req.Header.Set("Accept-Encoding", acceptEncodingFor(family))
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
	// 显式 Referer 注入([R64-a] cfg.headers 已显式配置 Referer 时不覆盖 —— 头组注释
	// 「cfg.headers 可覆盖单项」的契约口径; 修前此处无条件 Set 使规则自定义 Referer
	// 恒被同源缺省 Referer 覆盖失效)
	if effReferer != "" && !headersHaveKey(c.cfg.Headers, "Referer") {
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
			client = &http.Client{Transport: c.transportFor(pu, u.Scheme == "https"), Timeout: timeout, Jar: c.jar, CheckRedirect: c.hc.CheckRedirect}
		}
	}
	resp, err := client.Do(req)
	if err != nil {
		// [R64-a](误责防御) 任务停止/总闸 ctx 取消期间的传输失败不是代理故障证据:
		// 取消即中止(不记代理冷却/不回写 alive=0) —— 修前每次停止都把在飞代理请求
		// 的取消当代理失败记冷却+喂回写泵(连败 3 次即误杀 DB 池健康条目)
		if ctx.Err() != nil {
			return rawResult{}, err
		}
		if pu != nil {
			c.markProxyFailed(pu) // 代理失败指数冷却
			// [R53-2a](代理误责) 打标代理通道失败: rawFetch 据此豁免目标 host
			// 连败计数(故障归属代理自身, 见 proxyChannelError 注)
			return rawResult{}, &proxyChannelError{err}
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
	// [R53-2a](审计 R52-c「400 壳不喂降额链」) 非 2xx 全量失败口径(对齐 TS fetchHttp
	// `!res.ok` 抛错): 修前仅 404/403/429/5xx 产状态错误, 其余 4xx(400/401/405/412...)
	// 按成功返回 —— 错误壳/拦截壳被当正常内容送进解析层, 且上层 noteSuccess 把目标站
	// 连败链归零(TS 对同响应抛错并喂 reportHostFailure 降额链)。修后其余非 2xx 同产
	// httpStatusError(含无 Location 的 3xx 终态); 403/429/5xx 走既有重试/镜像/限流链,
	// 其余 4xx 在 rawFetch 侧不换镜像(TS isMirrorSwitchableError 口径)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return res, &httpStatusError{code: resp.StatusCode}
	}
	return res, nil
}

// bodyOverLimitError 响应体超 10MB 上限错误(对齐 TS RangeError 语义):
// TS native/curl 两轨超限均 reject(截断 HTML 会被解析成半截正文/目录入库,
// R4-2 同源缺陷), Go 修前 LimitReader 静默截断 —— 封面图截 10MB 后
// len(data)>coverMaxBytes 守卫永不触发, 损图当完整封面入库
type bodyOverLimitError struct{ size int }

func (e *bodyOverLimitError) Error() string {
	return fmt.Sprintf("响应体过大(%d > %d字节上限), 已中止(截断内容不入库)", e.size, maxBodyBytes)
}

// readBodyDecompressed 读响应体(≤10MB, 超限报错不截断)+按 Content-Encoding 手动解压
// (请求已显式声明家族化 Accept-Encoding → Transport 不自动解压)
// [R52-5 P3] 修前 io.LimitReader(body, 10MB) 静默截断超限响应; 修后读 maxBodyBytes+1
// 探测超限 → bodyOverLimitError 走上层既有重试/镜像切换/失败链(与 TS reject 口径一致)
// [R67-a] 补 br(brotli)/zstd 解压(与 acceptEncodingFor 广告面成对; 均为既有间接依赖)
func readBodyDecompressed(resp *http.Response) ([]byte, error) {
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes+1))
	if err != nil {
		return raw, err
	}
	if len(raw) > maxBodyBytes {
		return nil, &bodyOverLimitError{size: len(raw)}
	}
	switch strings.ToLower(strings.TrimSpace(resp.Header.Get("Content-Encoding"))) {
	case "gzip":
		zr, zerr := gzip.NewReader(bytes.NewReader(raw))
		if zerr != nil {
			return nil, fmt.Errorf("gzip 解压失败: %v", zerr)
		}
		defer zr.Close()
		return readAllCapped(zr)
	case "deflate":
		// deflate 双形态: zlib 包裹(常见)与裸 flate; 先试 zlib 失败回退裸 flate
		if zr, zerr := zlib.NewReader(bytes.NewReader(raw)); zerr == nil {
			if out, derr := readAllCapped(zr); derr == nil {
				zr.Close()
				return out, nil
			} else if over := (*bodyOverLimitError)(nil); errors.As(derr, &over) {
				zr.Close()
				return nil, derr
			}
			zr.Close()
		}
		fr := flate.NewReader(bytes.NewReader(raw))
		defer fr.Close()
		return readAllCapped(fr)
	case "br":
		// [R67-a] brotli(andybalholm/brotli 既有间接依赖; Reader 无 Close 语义)
		br := brotli.NewReader(bytes.NewReader(raw))
		return readAllCapped(br)
	case "zstd":
		// [R67-a] zstd(klauspost/compress 既有间接依赖; 解码器有状态, 每请求新建)
		zr, zerr := zstd.NewReader(bytes.NewReader(raw))
		if zerr != nil {
			return nil, fmt.Errorf("zstd 解压失败: %v", zerr)
		}
		defer zr.Close()
		return readAllCapped(zr)
	default:
		return raw, nil
	}
}

// readAllCapped 解压流读取(≤10MB, 超限报错不截断)
func readAllCapped(r io.Reader) ([]byte, error) {
	out, err := io.ReadAll(io.LimitReader(r, maxBodyBytes+1))
	if err != nil {
		return out, err
	}
	if len(out) > maxBodyBytes {
		return nil, &bodyOverLimitError{size: len(out)}
	}
	return out, nil
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

// fetch 完整抓取: 传输 + charset 解码 + 拦截页出口判定。
// [R66-a](反反爬 ③) challenge 形态退避重试: rawFetch 的退避链只覆盖传输层/HTTP 状态
// 错误, 200 壳挑战页此前以「成功返回」穿出后被编排层直接按失败消费(计连败/弃书) ——
// 瞬态软挑战(rate-limit 壳/挑战 cookie 未带)本可退避后过关。修后此处对 Blocked 结果
// 按 exponential+jitter 退避重试(预算 min(cfg.Retries, 2) 次), 每次重试经 rawFetch
// 重过 hostGate(minGap 节奏准入)且 CookieJar 会话持续 —— 挑战 Set-Cookie 回写后携带
// 重放, 与浏览器「领挑战→解题→带证重访」行为同构; 每次挑战命中同步放宽本 host
// 准入节奏(noteChallengePacing), 挑战计数照旧逐次累加(blockedCount 可观测口径不变)
func (c *Client) fetch(ctx context.Context, rawURL, refererURL string, directOnly bool) (Result, error) {
	for attempt := 0; ; attempt++ {
		res, err := c.rawFetch(ctx, rawURL, refererURL, directOnly, false)
		if err != nil {
			// 404 与其余错误统一失败语义(与 TS !res.ok 口径一致)
			return Result{}, err
		}
		charset := rule.SniffCharset([]byte(res.contentType), res.body)
		htmlStr := rule.DecodeBody(res.body, charset)
		// 拦截页/挑战壳出口判定(blockcheck.go; 词表语义权威在 TS fetcher.ts)
		blocked := looksBlocked(htmlStr, res.status, res.server)
		if !blocked {
			return Result{HTML: htmlStr, FinalURL: res.finalURL, StatusCode: res.status}, nil
		}
		c.blockedCount.Add(1)
		c.noteChallengePacing(res.finalURL)
		if attempt >= c.challengeExtraRetries() {
			return Result{HTML: htmlStr, FinalURL: res.finalURL, StatusCode: res.status, Blocked: true}, nil
		}
		if serr := util.SleepCtx(ctx, challengeBackoff(attempt)); serr != nil {
			// ctx 取消(停止/暂停): 不再重试, 按挑战失败返回(编排层等价 403 失败链)
			return Result{HTML: htmlStr, FinalURL: res.finalURL, StatusCode: res.status, Blocked: true}, nil
		}
	}
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
		// [R56-2a] 插入时机泪扫过期项: {url} 逐请求签名形态按完整 tokenUrl 作键, 长任务
		// 键集随已抓章节数线性增长且此前永不出表(仅同键覆盖) —— 10 万章任务即 10 万
		// 条 token 常驻。miss 重取是唯一插入点, 全表清扫 O(n) 摊还可控, 修后键集有界于
		// TTL 窗口内的活跃 URL 数
		now := time.Now()
		for k, ent := range c.tokenCache {
			if !now.Before(ent.exp) {
				delete(c.tokenCache, k)
			}
		}
		c.tokenCache[cacheKey] = tokenEntry{token: token, exp: now.Add(tokenCacheTTL)}
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

// headersHaveKey 头组键存在性判定(大小写不敏感; nil/空表恒 false)
func headersHaveKey(h map[string]string, key string) bool {
	for k := range h {
		if strings.EqualFold(k, key) {
			return true
		}
	}
	return false
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
