// ============================================================
// [R76-a] 国别过滤代理源适配器回归(crawl 装配层)
//
//	① AliveProxyAddrsForCountries 国别过滤+健康分降序+存活门(alive=1 AND score>0)
//	② socks5h 归一/非法行过滤/国别码消毒(大小写+去重+非 2 字母丢弃)
//	③ 基础接口 AliveProxyAddrs 透传语义保持(与 *store.DB 直注等价)
//	④ NewManager 装配形态: mgr.proxySource 实现双接口(编译期断言在
//	   proxyfeedback.go, 此处补运行时装配断言)
//
// ============================================================
package crawl

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mhgl/internal/crawl/task"
	"mhgl/internal/store"

	_ "modernc.org/sqlite"
)

// newTaskManagerForTest 测试用空任务管理器(buildPayload 不经 Start, 仅装配面)
func newTaskManagerForTest() *task.Manager { return task.NewManager() }

// countryTestSchema feedbackTestSchema 的 FreeProxy 增补 country 列(适配器查询列)
const countryTestSchema = feedbackTestSchema + `
ALTER TABLE "FreeProxy" ADD COLUMN country TEXT NOT NULL DEFAULT '';
`

// countryTestDB 临时 store 库(与 feedbackTestDB 同构, FreeProxy 多 country 列)
func countryTestDB(t *testing.T) *store.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "r76a-country.db")
	raw, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("raw open: %v", err)
	}
	if _, err := raw.Exec(countryTestSchema); err != nil {
		t.Fatalf("schema: %v", err)
	}
	if err := raw.Close(); err != nil {
		t.Fatalf("raw close: %v", err)
	}
	db, err := store.Open(path)
	if err != nil {
		t.Fatalf("store open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// TestR76aCountryAwareProxySource 国别过滤查询语义
func TestR76aCountryAwareProxySource(t *testing.T) {
	db := countryTestDB(t)
	now := time.Now().UnixMilli()
	seed := `INSERT INTO "FreeProxy" (id, protocol, host, port, country, alive, healthScore, lastCheckedAt, createdAt, updatedAt) VALUES
                ('c1', 'http',   '10.2.1.1', 8080, 'CN', 1, 80, ?, ?, ?),
                ('c2', 'http',   '10.2.1.2', 8081, 'CN', 1, 90, ?, ?, ?),
                ('c3', 'socks5h','10.2.1.3', 1080, 'CN', 1, 70, ?, ?, ?),
                ('c4', 'http',   '10.2.1.4', 8082, 'US', 1, 99, ?, ?, ?),
                ('c5', 'http',   '10.2.1.5', 8083, 'CN', 0, 90, ?, ?, ?),
                ('c6', 'http',   '10.2.1.6', 8084, 'CN', 1, 0,  ?, ?, ?),
                ('c7', 'ftp',    '10.2.1.7', 21,   'CN', 1, 60, ?, ?, ?),
                ('c8', 'http',   '10.2.1.8', 70000,'CN', 1, 60, ?, ?, ?)`
	args := make([]interface{}, 0, 8*3)
	for i := 0; i < 8; i++ {
		args = append(args, now, now, now)
	}
	if _, err := db.Exec(seed, args...); err != nil {
		t.Fatalf("seed: %v", err)
	}
	src := countryAwareProxySource{db: db}

	addrs, err := src.AliveProxyAddrsForCountries(64, []string{"cn", "CN", "x1", "u"})
	if err != nil {
		t.Fatalf("filtered query: %v", err)
	}
	// 期望: c2(90) → c1(80) → c3(70, socks5h 归一 socks5); c5 死/c6 零分排除;
	// c7 非法协议排除; c8 端口越界排除; c4 US 不在过滤集
	want := []string{"http://10.2.1.2:8081", "http://10.2.1.1:8080", "socks5://10.2.1.3:1080"}
	if len(addrs) != len(want) {
		t.Fatalf("过滤结果=%v, want %v", addrs, want)
	}
	for i := range want {
		if addrs[i] != want[i] {
			t.Fatalf("过滤结果=%v, want %v(健康分降序)", addrs, want)
		}
	}

	// 全非法国别 → 空切片非 nil(消费方 len 判断)
	empty, err := src.AliveProxyAddrsForCountries(64, []string{"x1", "123"})
	if err != nil || empty == nil || len(empty) != 0 {
		t.Fatalf("全非法国别应空切片非 nil: %v %v", empty, err)
	}

	// 基础接口透传: 同库全量(含 US) 健康分降序
	all, err := src.AliveProxyAddrs(64)
	if err != nil {
		t.Fatalf("alive addrs: %v", err)
	}
	// c4(99)/c2(90)/c1(80)/c3(70); c5 死排除 c6 零分排除 c7/c8 非法排除
	if len(all) != 4 {
		t.Fatalf("全量存活=%v, want 4 条", all)
	}
}

// TestR76aNewManagerWiresCountryAwareSource NewManager 装配形态: 注入的动态源
// 同时满足 fetch.ProxyAddrSource 与 fetch.CountryFilteredProxySource(运行时装配断言)
func TestR76aNewManagerWiresCountryAwareSource(t *testing.T) {
	db := countryTestDB(t)
	anyMgr, err := NewManager(db)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	ad := anyMgr.(*managerAdapter)
	defer ad.StopAll()
	if _, ok := ad.mgr.ProxySource().(interface {
		AliveProxyAddrs(int) ([]string, error)
	}); !ok {
		t.Fatalf("装配源未实现 fetch.ProxyAddrSource")
	}
	if _, ok := ad.mgr.ProxySource().(interface {
		AliveProxyAddrsForCountries(int, []string) ([]string, error)
	}); !ok {
		t.Fatalf("装配源未实现 fetch.CountryFilteredProxySource(proxyCountries 断链)")
	}
}

// TestR76aBrowserFallbackCapabilityFailClosed [② 旋钮矩阵] fetch.browserFallbackStatus
// 活性形态 = capability fail-closed 门: 模板缺省 [403,412,429,503] 放行; 显式自定义
// (如 [404]) → buildPayload 拒绝启动(单体 Go 无浏览器回退, 不符即拒绝+留痕)
func TestR76aBrowserFallbackCapabilityFailClosed(t *testing.T) {
	db := countryTestDB(t)
	now := time.Now().UnixMilli()
	if _, err := db.Exec(`INSERT INTO "Rule" (id, name, config, enabled, createdAt, updatedAt)
                VALUES ('r-cap', 'cap规则', ?, 1, ?, ?)`,
		`{"list":{"enabled":true,"fields":{}},"book":{"fields":{}},"toc":{"fields":{}},"content":{"fields":{}},
                  "fetch":{"engine":"http","timeout":20000,"retries":2,"browserFallbackStatus":[404,403]}}`, now, now); err != nil {
		t.Fatalf("seed rule: %v", err)
	}
	ad := &managerAdapter{db: db, mgr: newTaskManagerForTest()}
	_, err := ad.buildPayload(&store.Task{ID: "t-cap", RuleID: "r-cap", Mode: "range", StorageMode: "db",
		ThreadMin: 1, ThreadMax: 1, IntervalMin: 100, IntervalMax: 200})
	if err == nil {
		t.Fatalf("自定义 browserFallbackStatus 应被 fail-closed 拒绝")
	}
	if !strings.Contains(err.Error(), "browserFallbackStatus") {
		t.Fatalf("错误未点名能力键: %v", err)
	}

	// 模板缺省形态 [403,412,429,503] 放行(不误报 unsupported)
	if _, err := db.Exec(`UPDATE "Rule" SET config=? WHERE id='r-cap'`,
		`{"list":{"enabled":true,"fields":{}},"book":{"fields":{}},"toc":{"fields":{}},"content":{"fields":{}},
                  "fetch":{"engine":"http","timeout":20000,"retries":2,"browserFallbackStatus":[403,412,429,503]}}`); err != nil {
		t.Fatalf("update rule: %v", err)
	}
	if _, err := ad.buildPayload(&store.Task{ID: "t-cap", RuleID: "r-cap", Mode: "range", StorageMode: "db",
		ThreadMin: 1, ThreadMax: 1, IntervalMin: 100, IntervalMax: 200}); err != nil {
		t.Fatalf("缺省 browserFallbackStatus 不应拒绝: %v", err)
	}
}
