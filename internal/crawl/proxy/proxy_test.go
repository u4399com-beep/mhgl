// ============================================================
// 代理收割器测试(R56-2a) — httptest 假源 + 内存 SQLite:
//
//	① 协议归一/host:port 校验 ② 四种源格式解析 ③ 收割跨源去重+幂等入库
//	④ HTTP 代理校验(假代理回 ip-api JSON; 死代理计败) ⑤ socks4 握手校验
//	⑥ 过滤/limit/concurrency 钳制 ⑦ 匿名度推定
//
// ============================================================
package proxy

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// openTestDB 内存 SQLite(共享缓存防 :memory: 多连接空库问题; 单写者串行化)
var testDBSeq atomic.Int64

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:harvest_test_%d?mode=memory&cache=shared", testDBSeq.Add(1))
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	db.SetMaxOpenConns(1)
	schema := `CREATE TABLE IF NOT EXISTS "FreeProxy" (
                id TEXT PRIMARY KEY,
                protocol TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL,
                anonymity TEXT NOT NULL DEFAULT '',
                country TEXT NOT NULL DEFAULT '',
                countryName TEXT NOT NULL DEFAULT '',
                exitIp TEXT NOT NULL DEFAULT '',
                latencyMs INTEGER,
                alive INTEGER NOT NULL DEFAULT 0,
                successCount INTEGER NOT NULL DEFAULT 0,
                failCount INTEGER NOT NULL DEFAULT 0,
                healthScore INTEGER NOT NULL DEFAULT 0,
                lastError TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT '',
                lastCheckedAt INTEGER,
                lastSuccessAt INTEGER,
                lastUsedAt INTEGER,
                createdAt INTEGER NOT NULL,
                updatedAt INTEGER NOT NULL,
                UNIQUE(protocol, host, port)
        )`
	if _, err := db.Exec(schema); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// insertRow 测试直插一条代理
func insertRow(t *testing.T, db *sql.DB, protocol, host string, port int) {
	t.Helper()
	_, err := db.Exec(`INSERT INTO "FreeProxy" (id, protocol, host, port, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?)`, "c-test-"+host+"-"+strconv.Itoa(port), protocol, host, port,
		time.Now().UnixMilli(), time.Now().UnixMilli())
	if err != nil {
		t.Fatalf("insert row: %v", err)
	}
}

// insertRowCC 测试直插一条带国别代理
func insertRowCC(t *testing.T, db *sql.DB, protocol, host string, port int, cc string) {
	t.Helper()
	_, err := db.Exec(`INSERT INTO "FreeProxy" (id, protocol, host, port, country, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?)`, "c-test-"+host+"-"+strconv.Itoa(port), protocol, host, port, cc,
		time.Now().UnixMilli(), time.Now().UnixMilli())
	if err != nil {
		t.Fatalf("insert row: %v", err)
	}
}

func countRows(t *testing.T, db *sql.DB, where string, args ...interface{}) int {
	t.Helper()
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM "FreeProxy" WHERE `+where, args...).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	return n
}

// ---------------- 解析单测 ----------------

func TestNormalizeProtocol(t *testing.T) {
	cases := map[string]string{
		"http": "http", "https": "http", "HTTPS": "http",
		"socks5": "socks5", "socks5h": "socks5",
		"socks4": "socks4", "socks4a": "socks4",
		"ftp": "", "": "",
	}
	for in, want := range cases {
		if got := normalizeProtocol(in); got != want {
			t.Fatalf("normalizeProtocol(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestIsValidHostPort(t *testing.T) {
	valid := [][2]interface{}{
		{"1.2.3.4", 8080}, {"255.255.255.255", 1}, {"0.0.0.0", 65535},
		{"proxy.example.com", 3128}, {"a-b.co", 80},
	}
	for _, c := range valid {
		host := c[0].(string)
		port := c[1].(int)
		if !isValidHostPort(host, port) {
			t.Fatalf("isValidHostPort(%s, %d) = false, want true", host, port)
		}
	}
	invalid := [][2]interface{}{
		{"256.1.1.1", 80}, {"a..b", 80}, {"-a.b", 80}, {"localhost", 80}, // 单标签域名拒
		{"a.b", 0}, {"a.b", 65536}, {"", 80}, {"a.b.c.", 80},
	}
	for _, c := range invalid {
		host := c[0].(string)
		port := c[1].(int)
		if isValidHostPort(host, port) {
			t.Fatalf("isValidHostPort(%s, %d) = true, want false", host, port)
		}
	}
}

func TestParsePlain(t *testing.T) {
	src := Source{ID: "plain-test", Kind: KindPlain, Protocol: "http"}
	body := strings.Join([]string{
		"# comment line",
		"// slash comment",
		"1.2.3.4:8080",
		"http://5.6.7.8:3128",   // scheme 前缀容错
		"socks5://9.9.9.9:1080", // scheme 决定协议(覆盖整源 protocol)
		"not-a-proxy",
		"1.2.3.999:80",    // IPv4 段越界
		"host.only:70000", // 端口越界
		"",
	}, "\n")
	got := ParseSourceBody(src, body)
	if len(got) != 3 {
		t.Fatalf("parsed = %d, want 3: %+v", len(got), got)
	}
	if got[0].Protocol != "http" || got[0].Host != "1.2.3.4" || got[0].Port != 8080 {
		t.Fatalf("entry0 = %+v", got[0])
	}
	if got[1].Protocol != "http" || got[1].Host != "5.6.7.8" || got[1].Port != 3128 {
		t.Fatalf("entry1 = %+v", got[1])
	}
	if got[2].Protocol != "socks5" || got[2].Host != "9.9.9.9" || got[2].Port != 1080 {
		t.Fatalf("entry2 = %+v", got[2])
	}
}

func TestParseProxifly(t *testing.T) {
	src := Source{ID: "proxifly-test", Kind: KindProxifly}
	body := strings.Join([]string{
		"http://1.2.3.4:8080",                 // 新形态(2026 漂移后)
		"socks5 5.6.7.8:1080 Canada CA elite", // 旧形态(空格分隔元数据)
		"https 9.9.9.9:3128 UnitedStates US",  // 旧形态无 anonymity 段
		"junkline",
	}, "\n")
	got := ParseSourceBody(src, body)
	if len(got) != 3 {
		t.Fatalf("parsed = %d, want 3: %+v", len(got), got)
	}
	if got[0].Protocol != "http" || got[0].Port != 8080 || got[0].Country != "" {
		t.Fatalf("entry0 = %+v", got[0])
	}
	if got[1].Protocol != "socks5" || got[1].Country != "CA" || got[1].Anonymity != "elite" {
		t.Fatalf("entry1 = %+v", got[1])
	}
	if got[2].Protocol != "http" || got[2].Country != "US" {
		t.Fatalf("entry2 = %+v", got[2])
	}
}

func TestParseRoosterkid(t *testing.T) {
	src := Source{ID: "rk-test", Kind: KindRoosterkid, Protocol: "socks5"}
	body := strings.Join([]string{
		"1.2.3.4:1080 | 123 | DE | elite | extra",
		"5.6.7.8:5678 | 456 | FR | anonymous |",
		"bad line no pipe",
	}, "\n")
	got := ParseSourceBody(src, body)
	if len(got) != 2 {
		t.Fatalf("parsed = %d, want 2: %+v", len(got), got)
	}
	if got[0].Protocol != "socks5" || got[0].Country != "DE" || got[0].Anonymity != "elite" {
		t.Fatalf("entry0 = %+v", got[0])
	}
	if got[1].Port != 5678 || got[1].Country != "FR" {
		t.Fatalf("entry1 = %+v", got[1])
	}
}

func TestParseGeonode(t *testing.T) {
	src := Source{ID: "geonode-test", Kind: KindGeonode}
	body := `{"data":[
                {"ip":"1.2.3.4","port":8080,"protocols":["http"],"anonymityLevel":"elite","country":"HK"},
                {"ip":"5.6.7.8","port":"1080","protocols":["socks5"],"country":"us"},
                {"ip":"9.9.9.9","port":3128,"protocol":["https"],"anonymity":"anonymous"},
                {"ip":"bad","port":80,"protocols":["http"]},
                {"port":80,"protocols":["http"]}
        ]}`
	got := ParseSourceBody(src, body)
	if len(got) != 3 {
		t.Fatalf("parsed = %d, want 3: %+v", len(got), got)
	}
	if got[0].Protocol != "http" || got[0].Anonymity != "elite" || got[0].Country != "HK" {
		t.Fatalf("entry0 = %+v", got[0])
	}
	if got[1].Port != 1080 || got[1].Country != "US" { // 字符串端口 + 小写 CC 归一
		t.Fatalf("entry1 = %+v", got[1])
	}
	if got[2].Protocol != "http" || got[2].Anonymity != "anonymous" { // https→http 归一 + 旧字段名兼容
		t.Fatalf("entry2 = %+v", got[2])
	}
}

// ---------------- 收割(假源 E2E) ----------------

// withFakeSources 临时替换 PROXY_SOURCES(收割测试互不并行)
func withFakeSources(t *testing.T, sources ...Source) {
	t.Helper()
	old := PROXY_SOURCES
	PROXY_SOURCES = sources
	t.Cleanup(func() { PROXY_SOURCES = old })
}

func TestHarvestDedupAndIdempotentInsert(t *testing.T) {
	db := openTestDB(t)
	// 源A(plain): 3 条; 源B(geonode): 与 A 重叠 1 条 + 新增 2 条(含 1 条非法被解析层丢弃)
	srcA := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("1.2.3.4:8080\n5.6.7.8:3128\n9.9.9.9:1080\n"))
	}))
	defer srcA.Close()
	srcB := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[
                        {"ip":"1.2.3.4","port":8080,"protocols":["http"],"country":"JP"},
                        {"ip":"2.2.2.2","port":9999,"protocols":["socks5"],"country":"KR"},
                        {"ip":"3.3.3.3","port":7777,"protocols":["http"],"country":"SG"}
                ]}`))
	}))
	defer srcB.Close()
	withFakeSources(t,
		Source{ID: "fake-plain", URL: srcA.URL, Kind: KindPlain, Protocol: "http"},
		Source{ID: "fake-geonode", URL: srcB.URL, Kind: KindGeonode})

	h := NewHarvester(db)
	res := h.Harvest(context.Background())
	if res.Parsed != 5 {
		t.Fatalf("parsed = %d, want 5(去重后): %+v", res.Parsed, res)
	}
	if res.Added != 5 {
		t.Fatalf("added = %d, want 5", res.Added)
	}
	if n := countRows(t, db, "1=1"); n != 5 {
		t.Fatalf("rows = %d, want 5", n)
	}
	// 跨源去重: 1.2.3.4:8080 首见源=plain(geonode 的 JP 国别条目不覆盖)
	var source string
	if err := db.QueryRow(`SELECT source FROM "FreeProxy" WHERE host='1.2.3.4' AND port=8080`).Scan(&source); err != nil {
		t.Fatalf("query: %v", err)
	}
	if source != "fake-plain" {
		t.Fatalf("首见源标注 = %q, want fake-plain", source)
	}
	// 幂等: 二轮同源收割 added=0(已存在条目保持既有验证数据不覆盖)
	res2 := h.Harvest(context.Background())
	if res2.Parsed != 5 || res2.Added != 0 {
		t.Fatalf("二轮 parsed=%d added=%d, want 5/0", res2.Parsed, res2.Added)
	}
	if n := countRows(t, db, "1=1"); n != 5 {
		t.Fatalf("二轮 rows = %d, want 5", n)
	}
	// 源失败不阻断其余源: 源A 404 后仅源B 产出(去重集按轮重建 → parsed=3; 条目已入库 added=0)
	srcA.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	res3 := h.Harvest(context.Background())
	if res3.Parsed != 3 || res3.Added != 0 {
		t.Fatalf("源失败后 parsed=%d added=%d, want 3/0: %+v", res3.Parsed, res3.Added, res3)
	}
	for _, ps := range res3.PerSource {
		if ps.ID == "fake-plain" && ps.OK {
			t.Fatalf("源A 应报失败: %+v", res3.PerSource)
		}
	}
}

// ---------------- 校验(假代理 E2E) ----------------

// ipapiBody ip-api 探针响应体
const ipapiBody = `{"status":"success","country":"United States","countryCode":"US","query":"9.8.7.6"}`

// newFakeHTTPProxy 假 HTTP 代理: 接收绝对形态 GET 请求即回探针 JSON(不真转发)
func newFakeHTTPProxy(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(ipapiBody))
	}))
	t.Cleanup(srv.Close)
	return srv
}

// newFakeSocks4Proxy 假 socks4 代理: 最小握手(CD=90)后直接在同一连接上回探针 HTTP 响应
func newFakeSocks4Proxy(t *testing.T) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				defer c.Close()
				hdr := make([]byte, 8)
				if _, err := readFull(c, hdr); err != nil {
					return
				}
				// userid 段(NULL 结尾)
				one := make([]byte, 1)
				for {
					if _, err := readFull(c, one); err != nil || one[0] == 0 {
						break
					}
				}
				if hdr[1] != 0x01 { // 仅支持 CONNECT
					_, _ = c.Write([]byte{0x00, 0x5B, 0, 0, 0, 0, 0, 0})
					return
				}
				if _, err := c.Write([]byte{0x00, 0x5A, 0, 0, 0, 0, 0, 0}); err != nil {
					return
				}
				// 直读 HTTP 请求后回 canned 响应(假代理不真转发)
				buf := make([]byte, 4096)
				_, _ = c.Read(buf)
				_, _ = c.Write([]byte("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " +
					strconv.Itoa(len(ipapiBody)) + "\r\nConnection: close\r\n\r\n" + ipapiBody))
			}(conn)
		}
	}()
	return ln.Addr().String()
}

func readFull(c net.Conn, buf []byte) (int, error) {
	total := 0
	for total < len(buf) {
		n, err := c.Read(buf[total:])
		if err != nil {
			return total, err
		}
		total += n
	}
	return total, nil
}

func TestCheckHTTPProxyAliveAndDead(t *testing.T) {
	db := openTestDB(t)
	fake := newFakeHTTPProxy(t)
	// 死端口: 监听后立即关闭
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	deadAddr := ln.Addr().String()
	_ = ln.Close()

	insertRow(t, db, "http", hostOf(fake.URL), portOf(fake.URL))
	insertRow(t, db, "http", hostOf(deadAddr), portOf(deadAddr))

	h := NewHarvester(db)
	h.probeURL = "http://ip-api.com/json/" // 假代理不真转发, 探针 URL 仅作请求行
	res, err := h.Check(context.Background(), CheckOptions{Mode: "unchecked"})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if res.Checked != 2 || res.Alive != 1 || res.Dead != 1 {
		t.Fatalf("res = %+v, want checked=2 alive=1 dead=1", res)
	}
	// 活代理回写断言
	var alive, score, success, fail, latency int
	var country, countryName, exitIp, anonymity string
	if err := db.QueryRow(`SELECT alive, healthScore, successCount, failCount, COALESCE(latencyMs,-1),
                country, countryName, exitIp, anonymity FROM "FreeProxy" WHERE host=? AND port=?`,
		hostOf(fake.URL), portOf(fake.URL)).
		Scan(&alive, &score, &success, &fail, &latency, &country, &countryName, &exitIp, &anonymity); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if alive != 1 || score != 15 || success != 1 || fail != 0 {
		t.Fatalf("alive=%d score=%d success=%d fail=%d", alive, score, success, fail)
	}
	if latency < 0 {
		t.Fatalf("latencyMs 未记录: %d", latency)
	}
	if country != "US" || countryName != "United States" || exitIp != "9.8.7.6" {
		t.Fatalf("country=%q countryName=%q exitIp=%q", country, countryName, exitIp)
	}
	if anonymity != "anonymous" {
		t.Fatalf("anonymity = %q, want anonymous", anonymity)
	}
	// 死代理回写断言
	var dAlive, dScore, dFail int
	var dErr string
	if err := db.QueryRow(`SELECT alive, healthScore, failCount, lastError FROM "FreeProxy" WHERE host=? AND port=?`,
		hostOf(deadAddr), portOf(deadAddr)).Scan(&dAlive, &dScore, &dFail, &dErr); err != nil {
		t.Fatalf("scan dead: %v", err)
	}
	if dAlive != 0 || dScore != 0 || dFail != 1 || dErr == "" {
		t.Fatalf("dead row: alive=%d score=%d fail=%d lastError=%q", dAlive, dScore, dFail, dErr)
	}
	// 二轮 unchecked 模式: 已验条目不再入选
	res2, err := h.Check(context.Background(), CheckOptions{Mode: "unchecked"})
	if err != nil {
		t.Fatalf("check2: %v", err)
	}
	if res2.Checked != 0 {
		t.Fatalf("unchecked 二轮 checked = %d, want 0", res2.Checked)
	}
}

func TestCheckSocks4Handshake(t *testing.T) {
	db := openTestDB(t)
	addr := newFakeSocks4Proxy(t)
	insertRow(t, db, "socks4", hostOf(addr), portOf(addr))
	h := NewHarvester(db)
	h.probeURL = "http://ip-api.com/json/"
	res, err := h.Check(context.Background(), CheckOptions{Mode: "unchecked", Concurrency: 4})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if res.Alive != 1 || res.Dead != 0 {
		t.Fatalf("res = %+v, want alive=1", res)
	}
	var score int
	if err := db.QueryRow(`SELECT healthScore FROM "FreeProxy" WHERE protocol='socks4'`).Scan(&score); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if score != 15 {
		t.Fatalf("socks4 活代理 healthScore = %d, want 15", score)
	}
}

// newFakeProxyOn 在指定回环 IP 上起假 HTTP 代理(Linux 整个 127/8 可绑定),
// 用于构造「主机互异且全部可达」的测试行(修前用 10.0.0.x 不可达 → 全判死)。
func newFakeProxyOn(t *testing.T, ip string) (host string, port int) {
	t.Helper()
	ln, err := net.Listen("tcp", ip+":0")
	if err != nil {
		t.Fatalf("listen %s: %v", ip, err)
	}
	hs := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(ipapiBody))
	})}
	go func() { _ = hs.Serve(ln) }()
	t.Cleanup(func() { _ = hs.Close() })
	addr := ln.Addr().(*net.TCPAddr)
	return addr.IP.String(), addr.Port
}

func TestCheckFiltersAndLimit(t *testing.T) {
	db := openTestDB(t)
	h := NewHarvester(db)
	h.probeURL = "http://ip-api.com/json/"

	// 4 条 US/http 各指向独立可达回环假代理 + 1 条 DE/socks5 指向不可达地址
	// (DE 行被国别过滤排除, 恒不被拨号——顺带证明过滤语义)
	for _, ip := range []string{"127.0.0.2", "127.0.0.3", "127.0.0.4", "127.0.0.5"} {
		host, port := newFakeProxyOn(t, ip)
		insertRowCC(t, db, "http", host, port, "US")
	}
	insertRowCC(t, db, "socks5", "10.0.0.5", 1, "DE")

	// US 过滤: DE 行不入选; limit=3 钳单轮条数; 全部 http 行指向假代理应全活
	res, err := h.Check(context.Background(), CheckOptions{Mode: "unchecked", Limit: 3, Countries: []string{"US"}})
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if res.Checked != 3 {
		t.Fatalf("checked = %d, want 3(4 条 US 中 limit 钳 3): %+v", res.Checked, res)
	}
	if res.Alive != 3 || res.Dead != 0 {
		t.Fatalf("res = %+v, want alive=3 dead=0", res)
	}
	// 国别回写断言(CASE WHEN 保底: 探针国别覆盖)
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM "FreeProxy" WHERE country='US' AND alive=1`).Scan(&n); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if n != res.Alive {
		t.Fatalf("country 回写数 = %d, want %d", n, res.Alive)
	}
	// 非法 mode fail-closed
	if _, err := h.Check(context.Background(), CheckOptions{Mode: "bogus"}); err == nil {
		t.Fatal("非法 mode 应报错")
	}
}

func TestDeriveAnonymity(t *testing.T) {
	if got := deriveAnonymity("elite", "1.2.3.4", "9.9.9.9"); got != "elite" {
		t.Fatalf("既有标注应保留: %q", got)
	}
	if got := deriveAnonymity("", "1.2.3.4", "1.2.3.4"); got != "transparent" {
		t.Fatalf("出口 IP==代理自身 → transparent: %q", got)
	}
	if got := deriveAnonymity("", "1.2.3.4", "9.9.9.9"); got != "anonymous" {
		t.Fatalf("其余 → anonymous: %q", got)
	}
}

// hostOf/portOf "http://127.0.0.1:12345" → host / port
func hostOf(addr string) string {
	addr = strings.TrimPrefix(strings.TrimPrefix(addr, "http://"), "https://")
	if i := strings.LastIndex(addr, ":"); i >= 0 {
		return addr[:i]
	}
	return addr
}

func portOf(addr string) int {
	addr = strings.TrimPrefix(strings.TrimPrefix(addr, "http://"), "https://")
	if i := strings.LastIndex(addr, ":"); i >= 0 {
		n, _ := strconv.Atoi(addr[i+1:])
		return n
	}
	return 0
}
