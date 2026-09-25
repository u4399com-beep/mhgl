// ============================================================
// 免费代理池 — 收割器 + 校验器(R56-2a 并入, R55 遗留项)
// 语义权威: /home/z/my-project/src/lib/crawl/proxy-pool.ts(harvester/validator/selector)
//
// 职责(与采集抓取层完全解耦):
//
//	① Harvest: 从公开免费代理源(GitHub raw / 静态 API / JSON API)并发抓取 → 解析
//	   → 跨源去重(键=protocol://host:port, 首见源标注优先) → 经注入的 *sql.DB
//	   幂等写入 FreeProxy 表(已存在条目保持既有验证数据不覆盖)
//	② Check: 从 FreeProxy 表取候选(unchecked/stale/alive 三模式) → 并发验证
//	   (经代理请求 ip-api 探针: CONNECT 连通性 + 延迟 + 出口国别) → 回写健康数据
//
// 隔离边界(反反爬体系约束):
//   - 本包自持 http.Client, 不经 fetch.Client 的 hostGate/全局闸/连败链 —— 免费代理源
//     与校验失败的账绝不混入采集目标的 host 连败/降额链(计数面物理隔离)
//   - 并发上限 32(缺省 16, 对齐 TS checkProxies concurrency 钳制); 源抓取单源 20s 超时;
//     校验单代理 9s 超时; 调用方经 ctx 传总超时
//
// 接线缝: NewHarvester(db *sql.DB) — internal/store.DB 内嵌 *sql.DB(store.DB.DB),
// 主控装配时 proxy.NewHarvester(storeDB.DB) 即可注入, 本包不 import store(依赖单向)。
// FreeProxy 表结构由 Prisma 历轮建好(DateTime=INTEGER ms / Boolean=0|1, PLAN §1 口径),
// 本包零迁移直写。
// ============================================================
package proxy

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// ---------------- 常量(对齐 proxy-pool.ts) ----------------

const (
	// SourceFetchTimeout 单源抓取超时(TS fetchSource AbortController 20s)
	SourceFetchTimeout = 20 * time.Second
	// SourceBodyMax 源响应体上限(TS 5MB 疑似异常防线)
	SourceBodyMax = 5 << 20
	// CheckTimeout 单代理校验超时(TS curlProxyCheck timeoutSec=9)
	CheckTimeout = 9 * time.Second
	// CheckConcurrencyDefault / CheckConcurrencyMax 并发校验上限(TS min(32, max(1, n||16)))
	CheckConcurrencyDefault = 16
	CheckConcurrencyMax     = 32
	// CheckLimitDefault 单轮校验条数缺省(TS DEFAULT_SETTING.checkBatch=250; 钳 1~2000)
	CheckLimitDefault = 250
	CheckLimitMax     = 2000
	// LatencyCapMs 延迟记录上限(TS Math.min(latencyMs, 60_000))
	LatencyCapMs = 60_000
	// IPAPIURL 校验探针(TS IPAPI_URL; 出口 IP/国别/匿名度判定源)
	IPAPIURL = "http://ip-api.com/json/?fields=status,message,country,countryCode,query,isp"
	// insertBatch SQLite 变量上限防线: 每行 8 字段 → 批 100 行(800 变量)安全(TS 同口径)
	insertBatch = 100
)

// SourceKind 源格式形态(TS SourceKind)
type SourceKind string

const (
	KindPlain      SourceKind = "plain"      // 每行 host:port(个别带 scheme 前缀容错)
	KindProxifly   SourceKind = "proxifly"   // "protocol://host:port" 新形态 / "protocol host:port CC anonymity" 旧形态
	KindRoosterkid SourceKind = "roosterkid" // "host:port | latency | CC | anonymity | ..."
	KindGeonode    SourceKind = "geonode"    // JSON {data:[{ip,port,protocols,country,...}]}
)

// Source 单个免费代理源
type Source struct {
	ID       string     `json:"id"`
	URL      string     `json:"url"`
	Kind     SourceKind `json:"kind"`
	Protocol string     `json:"protocol,omitempty"` // kind=plain 时整源固定协议; 其余从行内/JSON 解析
}

// PROXY_SOURCES 免费代理源清单(2025 活跃源; 对齐 TS PROXY_SOURCES 逐条移植)
var PROXY_SOURCES = []Source{
	{ID: "thespeedx-http", URL: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt", Kind: KindPlain, Protocol: "http"},
	{ID: "thespeedx-socks5", URL: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt", Kind: KindPlain, Protocol: "socks5"},
	{ID: "thespeedx-socks4", URL: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt", Kind: KindPlain, Protocol: "socks4"},
	{ID: "monosans-http", URL: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt", Kind: KindPlain, Protocol: "http"},
	{ID: "monosans-socks5", URL: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt", Kind: KindPlain, Protocol: "socks5"},
	{ID: "monosans-socks4", URL: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt", Kind: KindPlain, Protocol: "socks4"},
	{ID: "proxyscrape-http", URL: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all", Kind: KindPlain, Protocol: "http"},
	{ID: "proxyscrape-socks5", URL: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000", Kind: KindPlain, Protocol: "socks5"},
	{ID: "proxyscrape-socks4", URL: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000", Kind: KindPlain, Protocol: "socks4"},
	// 行格式: "protocol://host:port"(新) / "protocol host:port Country CC anonymity"(旧)
	{ID: "proxifly-all", URL: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.txt", Kind: KindProxifly},
	{ID: "mmpx12-http", URL: "https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt", Kind: KindPlain, Protocol: "http"},
	// 行格式: "host:port | latency | CC | anonymity | ..."
	{ID: "roosterkid-https", URL: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt", Kind: KindRoosterkid, Protocol: "http"},
	{ID: "roosterkid-socks5", URL: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt", Kind: KindRoosterkid, Protocol: "socks5"},
	// JSON API(带国别元数据; 公共端点限流, 429 时该源自然跳过)
	{ID: "geonode-http", URL: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc&protocols=http%2Chttps", Kind: KindGeonode},
	{ID: "geonode-socks", URL: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc&protocols=socks4%2Csocks5", Kind: KindGeonode},
	{ID: "proxyspace-http", URL: "https://proxyspace.pro/http.txt", Kind: KindPlain, Protocol: "http"},
	{ID: "proxyspace-socks5", URL: "https://proxyspace.pro/socks5.txt", Kind: KindPlain, Protocol: "socks5"},
}

// ---------------- 解析 ----------------

// ParsedProxy 解析产物(TS ParsedProxy)
type ParsedProxy struct {
	Protocol  string // http|socks5|socks4(存储归一后)
	Host      string
	Port      int
	Country   string // ISO 3166-1 alpha-2, 可空
	Anonymity string // transparent|anonymous|elite|"", 可空
	Source    string // 首见源标注
}

// normalizeProtocol 存储协议归一(TS normalizeProtocol 同口径):
// https→http(免费列表 "https" 实为支持 CONNECT 隧道的 http 代理), socks5h→socks5,
// socks4a→socks4; 非法返回 ""
func normalizeProtocol(raw string) string {
	p := strings.ToLower(strings.TrimSpace(raw))
	switch p {
	case "http", "https":
		return "http"
	case "socks5", "socks5h":
		return "socks5"
	case "socks4", "socks4a":
		return "socks4"
	}
	return ""
}

var (
	ipv4Re       = regexp.MustCompile(`^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$`)
	hostPort     = regexp.MustCompile(`^([\w.-]+):(\d{1,5})$`)
	schemeLineRe = regexp.MustCompile(`^(?:(https?|socks5h?|socks4a?)://)([\w.-]+):(\d{1,5})$`)
	domainRe     = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$`)
	ccRe         = regexp.MustCompile(`^[A-Z]{2}$`)
)

// isValidHostPort host:port 严格校验(TS isValidHostPort 同口径):
// IPv4 各段 0~255; 域名至少两点+标签字符集; 端口 1~65535
func isValidHostPort(host string, port int) bool {
	if port < 1 || port > 65535 {
		return false
	}
	if host == "" || len(host) > 253 {
		return false
	}
	if m := ipv4Re.FindStringSubmatch(host); m != nil {
		for _, seg := range m[1:] {
			n, err := strconv.Atoi(seg)
			if err != nil || n > 255 {
				return false
			}
		}
		return true
	}
	return domainRe.MatchString(strings.ToLower(host))
}

// ParseSourceBody 源响应体 → 代理列表(TS parseSourceBody 逐语义移植)
func ParseSourceBody(src Source, body string) []ParsedProxy {
	out := []ParsedProxy{}
	if src.Kind == KindGeonode {
		return parseGeonode(src, body)
	}
	for _, line := range strings.Split(body, "\n") {
		raw := strings.TrimSpace(line)
		if raw == "" || strings.HasPrefix(raw, "#") || strings.HasPrefix(raw, "//") {
			continue
		}
		switch src.Kind {
		case KindPlain:
			// host:port (个别源带 scheme 前缀也容错剥掉)
			if m := schemeLineRe.FindStringSubmatch(raw); m != nil {
				protocol := normalizeProtocol(m[1])
				if protocol == "" {
					protocol = src.Protocol
				}
				port, err := strconv.Atoi(m[3])
				if err == nil && protocol != "" && isValidHostPort(m[2], port) {
					out = append(out, ParsedProxy{Protocol: protocol, Host: m[2], Port: port, Source: src.ID})
				}
				continue
			}
			m := hostPort.FindStringSubmatch(raw)
			if m == nil || src.Protocol == "" {
				continue
			}
			port, err := strconv.Atoi(m[2])
			if err == nil && isValidHostPort(m[1], port) {
				out = append(out, ParsedProxy{Protocol: src.Protocol, Host: m[1], Port: port, Source: src.ID})
			}

		case KindProxifly:
			// [R46-2c-2] 源格式漂移适配: 新形态 "protocol://host:port" 优先;
			// 旧行(含空格) "protocol host:port Country CC anonymity" 保历史兼容
			if m := schemeLineRe.FindStringSubmatch(raw); m != nil {
				protocol := normalizeProtocol(m[1])
				port, err := strconv.Atoi(m[3])
				if err == nil && protocol != "" && isValidHostPort(m[2], port) {
					out = append(out, ParsedProxy{Protocol: protocol, Host: m[2], Port: port, Source: src.ID})
				}
				continue
			}
			parts := strings.Fields(raw)
			if len(parts) < 2 {
				continue
			}
			protocol := normalizeProtocol(parts[0])
			hm := hostPort.FindStringSubmatch(parts[1])
			if protocol == "" || hm == nil {
				continue
			}
			port, err := strconv.Atoi(hm[2])
			if err != nil || !isValidHostPort(hm[1], port) {
				continue
			}
			entry := ParsedProxy{Protocol: protocol, Host: hm[1], Port: port, Source: src.ID}
			if len(parts) > 3 {
				cc := strings.ToUpper(parts[3])
				if ccRe.MatchString(cc) {
					entry.Country = cc
				}
			}
			if len(parts) > 4 {
				entry.Anonymity = parts[4]
			}
			out = append(out, entry)

		case KindRoosterkid:
			// "host:port | latency | CC | anonymity | ..."
			if src.Protocol == "" {
				continue
			}
			seg := strings.Split(raw, "|")
			for i := range seg {
				seg[i] = strings.TrimSpace(seg[i])
			}
			hm := hostPort.FindStringSubmatch(seg[0])
			if hm == nil {
				continue
			}
			port, err := strconv.Atoi(hm[2])
			if err != nil || !isValidHostPort(hm[1], port) {
				continue
			}
			entry := ParsedProxy{Protocol: src.Protocol, Host: hm[1], Port: port, Source: src.ID}
			if len(seg) > 2 {
				cc := strings.ToUpper(seg[2])
				if ccRe.MatchString(cc) {
					entry.Country = cc
				}
			}
			if len(seg) > 3 {
				entry.Anonymity = seg[3]
			}
			out = append(out, entry)
		}
	}
	return out
}

// parseGeonode geonode JSON 形态(整体解析, 不逐行):
// { data: [{ ip, port, protocols:['http']|旧 protocol:[], anonymityLevel|anonymity, country }] }
// [R46-2c-2] 字段名漂移适配: protocols(数组)/anonymityLevel 为现行字段,
// protocol/anonymity 旧字段名兼容保留
func parseGeonode(src Source, body string) []ParsedProxy {
	out := []ParsedProxy{}
	var payload struct {
		Data []struct {
			IP             string      `json:"ip"`
			Port           interface{} `json:"port"`
			Protocols      []string    `json:"protocols"`
			Protocol       []string    `json:"protocol"`
			AnonymityLevel interface{} `json:"anonymityLevel"`
			Anonymity      interface{} `json:"anonymity"`
			Country        string      `json:"country"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		return out
	}
	for _, it := range payload.Data {
		if it.IP == "" {
			continue
		}
		port := jsonToInt(it.Port)
		protos := append(append([]string{}, it.Protocols...), it.Protocol...)
		protocol := ""
		for _, p := range protos {
			if np := normalizeProtocol(p); np != "" {
				protocol = np
				break
			}
		}
		if protocol == "" || !isValidHostPort(it.IP, port) {
			continue
		}
		entry := ParsedProxy{Protocol: protocol, Host: it.IP, Port: port, Source: src.ID}
		switch {
		case it.AnonymityLevel != nil:
			entry.Anonymity = fmt.Sprintf("%v", it.AnonymityLevel)
		case it.Anonymity != nil:
			entry.Anonymity = fmt.Sprintf("%v", it.Anonymity)
		}
		cc := strings.ToUpper(strings.TrimSpace(it.Country))
		if ccRe.MatchString(cc) {
			entry.Country = cc
		}
		out = append(out, entry)
	}
	return out
}

// jsonToInt 宽松数值还原(port 字段可能为 number 或 string)
func jsonToInt(v interface{}) int {
	switch x := v.(type) {
	case float64:
		return int(x)
	case string:
		n, _ := strconv.Atoi(strings.TrimSpace(x))
		return n
	case json.Number:
		n, _ := strconv.Atoi(string(x))
		return n
	}
	return 0
}

// ---------------- Harvester ----------------

// SourceResult 单源抓取结果(TS HarvestResult.perSource)
type SourceResult struct {
	ID    string `json:"id"`
	OK    bool   `json:"ok"`
	Count int    `json:"count"`
	Error string `json:"error,omitempty"`
}

// HarvestResult 收割结果(TS HarvestResult)
type HarvestResult struct {
	StartedAtMs int64          `json:"startedAtMs"`
	ElapsedMs   int64          `json:"elapsedMs"`
	Parsed      int            `json:"parsed"`
	Added       int64          `json:"added"`
	PerSource   []SourceResult `json:"perSource"`
}

// Harvester 免费代理收割/校验器(db 注入缝: store.DB.DB / 独立 *sql.DB 均可)
type Harvester struct {
	db *sql.DB
	hc *http.Client
	// probeURL 校验探针(缺省 IPAPI_URL; 测试注入 httptest 端点)
	probeURL string
	// idSeq 进程内序号(cuid 形态 id 防同毫秒碰撞)
	idSeq atomic.Uint64
}

// NewHarvester 构造收割器。db 由主控注入(internal/store.DB 内嵌 *sql.DB,
// 装配点: proxy.NewHarvester(storeDB.DB)); 单连接串行化策略由上层 DB 持有者保证。
func NewHarvester(db *sql.DB) *Harvester {
	return &Harvester{
		db:       db,
		hc:       &http.Client{Timeout: SourceFetchTimeout},
		probeURL: IPAPIURL,
	}
}

// fetchSource 单源抓取+解析(TS fetchSource: 20s 超时 + 5MB 体量防线 + UA 伪装)
func (h *Harvester) fetchSource(ctx context.Context, src Source) ([]ParsedProxy, error) {
	fctx, cancel := context.WithTimeout(ctx, SourceFetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(fctx, http.MethodGet, src.URL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36")
	req.Header.Set("Accept", "*/*")
	resp, err := h.hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, SourceBodyMax+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > SourceBodyMax {
		return nil, errors.New("响应体超 5MB, 疑似异常")
	}
	return ParseSourceBody(src, string(raw)), nil
}

// Harvest 并发抓取全部源 → 跨源去重 → 幂等入库(TS harvestProxies 同口径)。
// 源失败不阻断其余源(perSource 留痕); 已存在条目保持既有验证数据不覆盖。
func (h *Harvester) Harvest(ctx context.Context) HarvestResult {
	startedAt := time.Now()
	result := HarvestResult{StartedAtMs: startedAt.UnixMilli()}

	type srcOut struct {
		idx     int
		proxies []ParsedProxy
		err     error
	}
	outputs := make([]srcOut, len(PROXY_SOURCES))
	var wg sync.WaitGroup
	sem := make(chan struct{}, CheckConcurrencyMax) // 源并发上限 32(源清单 17 条, 实际不排队)
	for i, src := range PROXY_SOURCES {
		wg.Add(1)
		go func(idx int, src Source) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-ctx.Done():
				outputs[idx] = srcOut{idx: idx, err: ctx.Err()}
				return
			}
			proxies, err := h.fetchSource(ctx, src)
			outputs[idx] = srcOut{idx: idx, proxies: proxies, err: err}
		}(i, src)
	}
	wg.Wait()

	// 跨源去重: 键=protocol://host:port, 首见源标注优先(TS Map has 跳过)
	all := make([]ParsedProxy, 0, 4096)
	seen := make(map[string]struct{}, 4096)
	for _, out := range outputs {
		src := PROXY_SOURCES[out.idx]
		if out.err != nil {
			result.PerSource = append(result.PerSource, SourceResult{ID: src.ID, OK: false, Error: truncate(out.err.Error(), 120)})
			continue
		}
		count := 0
		for _, p := range out.proxies {
			key := p.Protocol + "://" + p.Host + ":" + strconv.Itoa(p.Port)
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}
			all = append(all, p)
			count++
		}
		result.PerSource = append(result.PerSource, SourceResult{ID: src.ID, OK: true, Count: count})
	}
	result.Parsed = len(all)

	// 分批幂等入库(先查已存键过滤, 再插入; TS createMany 前置 findMany 同口径)
	for i := 0; i < len(all); i += insertBatch {
		if err := ctx.Err(); err != nil {
			break
		}
		end := i + insertBatch
		if end > len(all) {
			end = len(all)
		}
		added, err := h.insertFresh(ctx, all[i:end])
		if err != nil {
			result.PerSource = append(result.PerSource, SourceResult{ID: "db", OK: false, Error: truncate(err.Error(), 120)})
			break
		}
		result.Added += added
	}
	result.ElapsedMs = time.Since(startedAt).Milliseconds()
	return result
}

// insertFresh 批内查已存键 → 仅插入新条目(返回实际插入数)
func (h *Harvester) insertFresh(ctx context.Context, batch []ParsedProxy) (int64, error) {
	// 查已存: OR(protocol,host,port) × batch ≤100
	exist := make(map[string]struct{}, len(batch))
	conds := make([]string, 0, len(batch))
	args := make([]interface{}, 0, len(batch)*3)
	for _, p := range batch {
		conds = append(conds, `(protocol=? AND host=? AND port=?)`)
		args = append(args, p.Protocol, p.Host, p.Port)
	}
	query := `SELECT protocol, host, port FROM "FreeProxy" WHERE ` + strings.Join(conds, " OR ")
	rows, err := h.db.QueryContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	for rows.Next() {
		var protocol, host string
		var port int
		if err := rows.Scan(&protocol, &host, &port); err == nil {
			exist[protocol+"//"+host+":"+strconv.Itoa(port)] = struct{}{}
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	var added int64
	now := time.Now().UnixMilli()
	for _, p := range batch {
		key := p.Protocol + "//" + p.Host + ":" + strconv.Itoa(p.Port)
		if _, dup := exist[key]; dup {
			continue
		}
		res, err := h.db.ExecContext(ctx,
			`INSERT INTO "FreeProxy" (id, protocol, host, port, country, anonymity, source, lastError, createdAt, updatedAt)
                         VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?)`,
			h.newID(), p.Protocol, p.Host, p.Port, p.Country, p.Anonymity, p.Source, now, now)
		if err != nil {
			if isUniqueErr(err) { // 并发收割竞态: 已被收录即幂等跳过
				continue
			}
			return added, err
		}
		n, _ := res.RowsAffected()
		added += n
	}
	return added, nil
}

// isUniqueErr SQLite 唯一约束冲突(bridge 同口径串匹配)
func isUniqueErr(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}

// idRand 随机源(懒加载; id 生成专用)
var idRand = struct {
	sync.Mutex
	r *rand.Rand
}{r: rand.New(rand.NewSource(time.Now().UnixNano()))}

// newID cuid 形态主键('c' 前缀 + 小写 base36, 形态对齐 store 层: 时间有序+进程内唯一)
func (h *Harvester) newID() string {
	idRand.Lock()
	defer idRand.Unlock()
	seq := h.idSeq.Add(1)
	return "c" + strconv.FormatInt(time.Now().UnixNano(), 36) +
		strconv.FormatUint(uint64(seq%46656), 36) +
		strconv.FormatUint(idRand.r.Uint64()>>16, 36)
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

// ---------------- 校验器 ----------------

// CheckOptions 校验选项(TS CheckOptions)
type CheckOptions struct {
	// Mode: unchecked(缺省, 只验未验过的) | stale(全量最旧优先, 可复活死代理) | alive(只刷活代理)
	Mode        string
	Limit       int      // 1~2000, 缺省 250
	Concurrency int      // 1~32, 缺省 16
	Countries   []string // ISO 3166-1 alpha-2 过滤(大写)
	Protocols   []string // http|socks5|socks4 过滤(小写)
}

// CheckResult 校验结果(TS CheckResult)
type CheckResult struct {
	StartedAtMs int64  `json:"startedAtMs"`
	ElapsedMs   int64  `json:"elapsedMs"`
	Checked     int    `json:"checked"`
	Alive       int    `json:"alive"`
	Dead        int    `json:"dead"`
	Mode        string `json:"mode"`
}

// candidateRow 校验候选行(回写所需的既有验证数据快照)
type candidateRow struct {
	ID          string
	Protocol    string
	Host        string
	Port        int
	Anonymity   string
	Country     string
	HealthScore int
}

// Check 并发批量校验(TS checkProxies 同口径): 经代理请求探针判定连通性/延迟/出口
// 国别 → 回写 alive/healthScore/计数/lastError。免费代理典型存活率 2~15%, 校验是
// 池子价值的核心。校验失败的账只记在代理自身(绝不回流采集 host 连败链)。
func (h *Harvester) Check(ctx context.Context, opts CheckOptions) (CheckResult, error) {
	startedAt := time.Now()
	mode := opts.Mode
	if mode == "" {
		mode = "unchecked"
	}
	switch mode {
	case "unchecked", "stale", "alive":
	default:
		return CheckResult{}, fmt.Errorf("非法 mode: %s(应为 unchecked/stale/alive)", mode)
	}
	limit := opts.Limit
	if limit <= 0 {
		limit = CheckLimitDefault
	}
	if limit > CheckLimitMax {
		limit = CheckLimitMax
	}
	conc := opts.Concurrency
	if conc <= 0 {
		conc = CheckConcurrencyDefault
	}
	if conc > CheckConcurrencyMax {
		conc = CheckConcurrencyMax
	}

	where := []string{"1=1"}
	var args []interface{}
	switch mode {
	case "unchecked":
		where = append(where, "lastCheckedAt IS NULL")
	case "alive":
		where = append(where, "alive=1")
	}
	if len(opts.Countries) > 0 {
		where = append(where, "country IN ("+placeholders(len(opts.Countries))+")")
		for _, c := range opts.Countries {
			args = append(args, strings.ToUpper(strings.TrimSpace(c)))
		}
	}
	if len(opts.Protocols) > 0 {
		where = append(where, "protocol IN ("+placeholders(len(opts.Protocols))+")")
		for _, p := range opts.Protocols {
			args = append(args, strings.ToLower(strings.TrimSpace(p)))
		}
	}
	orderBy := "lastCheckedAt ASC, createdAt ASC"
	if mode == "alive" {
		orderBy = "lastCheckedAt ASC, healthScore DESC"
	}
	query := `SELECT id, protocol, host, port, anonymity, country, healthScore FROM "FreeProxy"
                WHERE ` + strings.Join(where, " AND ") + ` ORDER BY ` + orderBy + ` LIMIT ?`
	args = append(args, limit)
	rows, err := h.db.QueryContext(ctx, query, args...)
	if err != nil {
		return CheckResult{}, err
	}
	var candidates []candidateRow
	for rows.Next() {
		var r candidateRow
		if err := rows.Scan(&r.ID, &r.Protocol, &r.Host, &r.Port, &r.Anonymity, &r.Country, &r.HealthScore); err == nil {
			candidates = append(candidates, r)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return CheckResult{}, err
	}

	result := CheckResult{StartedAtMs: startedAt.UnixMilli(), Mode: mode}
	jobs := make(chan candidateRow)
	var mu sync.Mutex
	var wg sync.WaitGroup
	n := conc
	if n > len(candidates) {
		n = len(candidates)
	}
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for row := range jobs {
				if ctx.Err() != nil {
					return
				}
				out := h.validate(ctx, row)
				mu.Lock()
				result.Checked++
				if out.ok {
					result.Alive++
				} else {
					result.Dead++
				}
				mu.Unlock()
				h.applyCheckResult(ctx, row, out)
			}
		}()
	}
dispatch:
	for _, row := range candidates {
		select {
		case jobs <- row:
		case <-ctx.Done():
			break dispatch
		}
	}
	close(jobs)
	wg.Wait()
	result.ElapsedMs = time.Since(startedAt).Milliseconds()
	return result, nil
}

func placeholders(n int) string {
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}

// validateOutcome 单代理校验结论(TS ValidateOutcome)
type validateOutcome struct {
	ok          bool
	latencyMs   int
	country     string
	countryName string
	exitIp      string
	err         string
}

// validate 经代理请求探针(TS curlProxyCheck 的 Go 原生等价: 不起 curl 子进程,
// 按协议构造 Transport 直发探针请求, 9s 超时)
func (h *Harvester) validate(ctx context.Context, row candidateRow) validateOutcome {
	pu, err := proxyURL(row.Protocol, row.Host, row.Port)
	if err != nil {
		return validateOutcome{err: err.Error()}
	}
	tr, err := h.transportFor(row.Protocol, pu, row.Host, row.Port)
	if err != nil {
		return validateOutcome{err: err.Error()}
	}
	defer tr.CloseIdleConnections()
	client := &http.Client{Transport: tr, Timeout: CheckTimeout}

	vctx, cancel := context.WithTimeout(ctx, CheckTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(vctx, http.MethodGet, h.probeURL, nil)
	if err != nil {
		return validateOutcome{err: err.Error()}
	}
	t0 := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return validateOutcome{err: err.Error()}
	}
	defer resp.Body.Close()
	latency := int(time.Since(t0).Milliseconds())
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if err != nil {
		return validateOutcome{err: "读探针响应失败: " + err.Error()}
	}
	var payload struct {
		Status      string `json:"status"`
		Message     string `json:"message"`
		Country     string `json:"country"`
		CountryCode string `json:"countryCode"`
		Query       string `json:"query"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return validateOutcome{err: "响应非 JSON: " + truncate(strings.TrimSpace(string(raw)), 80)}
	}
	if payload.Status != "success" {
		msg := payload.Message
		if msg == "" {
			msg = "failed"
		}
		return validateOutcome{err: "ip-api: " + msg}
	}
	out := validateOutcome{
		ok:          true,
		latencyMs:   latency,
		country:     strings.ToUpper(payload.CountryCode),
		countryName: payload.Country,
		exitIp:      payload.Query,
	}
	if out.latencyMs > LatencyCapMs {
		out.latencyMs = LatencyCapMs
	}
	return out
}

// proxyURL 代理存储协议 → 校验用代理 URL(socks4 无 URL 形态, 返回 nil 由 transportFor
// 走自实现拨号器)
func proxyURL(protocol, host string, port int) (*url.URL, error) {
	switch protocol {
	case "http", "socks5":
		return url.Parse(protocol + "://" + host + ":" + strconv.Itoa(port))
	case "socks4":
		return nil, nil
	}
	return nil, fmt.Errorf("不支持的协议: %s", protocol)
}

// transportFor 按协议构造校验传输(http/socks5 走 Transport.Proxy 原生支持;
// socks4/4a Go 标准库不支持 → 自实现最小握手拨号器)
func (h *Harvester) transportFor(protocol string, pu *url.URL, host string, port int) (*http.Transport, error) {
	tr := &http.Transport{
		MaxIdleConns:          2,
		IdleConnTimeout:       10 * time.Second,
		TLSHandshakeTimeout:   CheckTimeout,
		ResponseHeaderTimeout: CheckTimeout,
	}
	switch protocol {
	case "http", "socks5":
		tr.Proxy = http.ProxyURL(pu)
		return tr, nil
	case "socks4":
		tr.Proxy = nil
		tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
			thost, tport, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			tn, err := strconv.Atoi(tport)
			if err != nil {
				return nil, err
			}
			return dialSOCKS4(ctx, net.JoinHostPort(host, strconv.Itoa(port)), thost, tn)
		}
		return tr, nil
	}
	return nil, fmt.Errorf("不支持的协议: %s", protocol)
}

// dialSOCKS4 socks4/4a 最小握手拨号(VER=4 CMD=1 CONNECT; 域名目标走 4a 形态:
// IP 置 0.0.0.x + 尾部附 hostname; 响应 CD=90 即成功)
func dialSOCKS4(ctx context.Context, proxyAddr, targetHost string, targetPort int) (net.Conn, error) {
	d := &net.Dialer{Timeout: CheckTimeout}
	conn, err := d.DialContext(ctx, "tcp", proxyAddr)
	if err != nil {
		return nil, err
	}
	deadline := time.Now().Add(CheckTimeout)
	_ = conn.SetDeadline(deadline)

	var ip [4]byte
	useSocks4a := false
	if parsed := net.ParseIP(targetHost); parsed != nil {
		if v4 := parsed.To4(); v4 != nil {
			copy(ip[:], v4)
		}
	}
	if ip == [4]byte{} {
		// 域名: 本地解析得 IPv4 则走 socks4, 否则 socks4a(代理解析)
		if ips, lerr := net.DefaultResolver.LookupIPAddr(ctx, targetHost); lerr == nil {
			for _, ia := range ips {
				if v4 := ia.IP.To4(); v4 != nil {
					copy(ip[:], v4)
					break
				}
			}
		}
		if ip == [4]byte{} {
			ip = [4]byte{0, 0, 0, 1} // 4a 约定: 0.0.0.x(x≠0) + hostname
			useSocks4a = true
		}
	}

	req := []byte{0x04, 0x01, byte(targetPort >> 8), byte(targetPort & 0xFF), ip[0], ip[1], ip[2], ip[3], 0x00}
	if useSocks4a {
		// [R68-a] 4a 规范线形: USERID 终止 NUL 必须保留, hostname+NUL 追加其后
		// (socks4a 协议: VER CMD DSTPORT DSTIP=0.0.0.x USERID NUL HOSTNAME NUL)。
		// 修前 append(req[:len(req)-1], ...) 把 USERID 终止 NUL 剥掉 —— 严格解析的
		// 服务端会把 hostname 当 USERID 读, 随后阻塞等待 hostname 终止符 → 握手超时,
		// 代理被误判死(本地 lenient mock 测不出, 仅真实 4a 服务端暴露)
		req = append(req, []byte(targetHost+"\x00")...)
	}
	if _, err := conn.Write(req); err != nil {
		conn.Close()
		return nil, fmt.Errorf("socks4 握手写失败: %w", err)
	}
	resp := make([]byte, 8)
	if _, err := io.ReadFull(conn, resp); err != nil {
		conn.Close()
		return nil, fmt.Errorf("socks4 握手读失败: %w", err)
	}
	if resp[1] != 90 {
		conn.Close()
		return nil, fmt.Errorf("socks4 连接被拒(CD=%d)", resp[1])
	}
	_ = conn.SetDeadline(time.Time{})
	return conn, nil
}

// applyCheckResult 校验结论回写(TS applyCheckResult 同口径):
// 成功 alive=1 + healthScore min(100, +15) + successCount+1; 失败 alive=0 +
// healthScore floor(×0.3) + failCount+1; 匿名度推定(出口 IP==代理自身 → transparent)
func (h *Harvester) applyCheckResult(ctx context.Context, row candidateRow, out validateOutcome) {
	now := time.Now().UnixMilli()
	proxyKey := row.Protocol + "://" + row.Host + ":" + strconv.Itoa(row.Port)
	if out.ok {
		score := row.HealthScore + 15
		if score > 100 {
			score = 100
		}
		_, err := h.db.ExecContext(ctx,
			`UPDATE "FreeProxy" SET alive=1, healthScore=?, successCount=successCount+1, latencyMs=?,
                         country=CASE WHEN ?<>'' THEN ? ELSE country END, countryName=?, exitIp=?, anonymity=?,
                         lastError='', lastCheckedAt=?, lastSuccessAt=?, updatedAt=? WHERE id=?`,
			score, out.latencyMs, out.country, out.country, out.countryName, out.exitIp,
			deriveAnonymity(row.Anonymity, row.Host, out.exitIp), now, now, now, row.ID)
		_ = err // 单行回写失败不影响整轮(下轮 stale 模式可复验)
		return
	}
	score := row.HealthScore * 3 / 10 // floor(×0.3)
	lastErr := truncate(proxyKey+" → "+out.err, 200)
	_, err := h.db.ExecContext(ctx,
		`UPDATE "FreeProxy" SET alive=0, healthScore=?, failCount=failCount+1, lastError=?,
                 lastCheckedAt=?, updatedAt=? WHERE id=?`,
		score, lastErr, now, now, row.ID)
	_ = err
}

// deriveAnonymity 匿名度推定(TS deriveAnonymity: 出口 IP===代理自身 host → 透明泄漏)
func deriveAnonymity(existing, proxyHost, exitIp string) string {
	if existing != "" {
		return existing
	}
	if exitIp != "" && exitIp == proxyHost {
		return "transparent"
	}
	return "anonymous"
}
