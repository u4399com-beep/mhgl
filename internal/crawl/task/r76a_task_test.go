// ============================================================
// [R76-a] 任务级代理管线回归 — ①-4 proxyCountries 过滤拉取 + ①-5 失败降级接线
//
//	① parseProxyCountries 国别串解析(分隔/归一/非法丢弃/去重)
//	② 规则声明国别 + 源支持能力接口 → 过滤拉取臂(断言国别透传+注入)
//	③ 过滤后空池 → 不回退全量/不注入(维持直连, 缺省保守)
//	④ 源不支持能力接口 → 回退全量拉取(warn-once, 配置不静默失效)
//	⑤ 直连失败 → ProxyPoolExhausted 钩子 → 即时重拉注入(fetch 侧节流清零后复验)
//
// ============================================================
package task

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"mhgl/internal/crawl/fetch"
	"mhgl/internal/crawl/rule"
)

// fakeCountrySource 国别过滤能力假源(可编程返回值/调用计数)
type fakeCountrySource struct {
	fakeProxySource
	mu       sync.Mutex
	cnAddrs  []string
	ccCalled int
	lastCC   []string
}

func (f *fakeCountrySource) AliveProxyAddrsForCountries(_ int, countries []string) ([]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.ccCalled++
	f.lastCC = append([]string(nil), countries...)
	return f.cnAddrs, nil
}

// TestR76aParseProxyCountries 国别串解析表
func TestR76aParseProxyCountries(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"CN", []string{"CN"}},
		{"cn", []string{"CN"}},
		{"cn, jp", []string{"CN", "JP"}},
		{"CN;JP SG", []string{"CN", "JP", "SG"}}, // 分号/空白混排
		{" CN ,jp,,;  ", []string{"CN", "JP"}},
		{"CN,CN,cn", []string{"CN"}},   // 去重保序
		{"", nil},                      // 空 → nil(不过滤)
		{"xyz,1A,C N", nil},            // 全非法 → nil
		{"CN,x1,USA", []string{"CN"}},  // 非法 token 丢弃合法保留
		{"  \t JP \n", []string{"JP"}}, // unicode 空白
	}
	for _, c := range cases {
		got := parseProxyCountries(c.in)
		if len(got) != len(c.want) {
			t.Fatalf("parseProxyCountries(%q)=%v, want %v", c.in, got, c.want)
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Fatalf("parseProxyCountries(%q)=%v, want %v", c.in, got, c.want)
			}
		}
	}
}

// TestR76aProxyCountriesFilteredPull 国别过滤拉取臂
func TestR76aProxyCountriesFilteredPull(t *testing.T) {
	src := &fakeCountrySource{}
	tk := newProxyFeedTask(t, src)
	tk.ruleC.Fetch.ProxyCountries = "cn, jp;SG  x1"

	// ① 过滤臂: 国别透传(大小写归一+非法丢弃) + 注入
	src.mu.Lock()
	src.cnAddrs = []string{"http://10.8.8.8:8080", "socks5://10.8.8.9:1080"}
	src.mu.Unlock()
	tk.pullDynamicProxies()
	if got := tk.fetcher.ProxyCount(); got != 2 {
		t.Fatalf("过滤臂注入后池=%d, want 2", got)
	}
	src.mu.Lock()
	ccCalled, lastCC := src.ccCalled, src.lastCC
	src.mu.Unlock()
	if ccCalled != 1 {
		t.Fatalf("过滤臂调用次数=%d, want 1", ccCalled)
	}
	if len(lastCC) != 3 || lastCC[0] != "CN" || lastCC[1] != "JP" || lastCC[2] != "SG" {
		t.Fatalf("国别透传异常: %v, want [CN JP SG]", lastCC)
	}

	// ② 过滤后空池: 不回退全量(基础源臂零调用)/不注入(池保持), 维持直连
	src.mu.Lock()
	src.cnAddrs = nil
	src.mu.Unlock()
	tk.pullDynamicProxies()
	if got := tk.fetcher.ProxyCount(); got != 2 {
		t.Fatalf("空池后池被变更=%d, want 2(不回退全量不注入)", got)
	}
	src.mu.Lock()
	baseCalled := src.called
	src.mu.Unlock()
	if baseCalled != 0 {
		t.Fatalf("空池回退了全量拉取: baseCalled=%d, want 0", baseCalled)
	}
}

// TestR76aProxyCountriesFallbackUnfiltered 源不支持能力接口 → 回退全量拉取
func TestR76aProxyCountriesFallbackUnfiltered(t *testing.T) {
	src := &fakeProxySource{}
	tk := newProxyFeedTask(t, src)
	tk.ruleC.Fetch.ProxyCountries = "CN"
	src.set([]string{"http://10.7.7.7:8080"}, nil)

	tk.pullDynamicProxies()
	if got := tk.fetcher.ProxyCount(); got != 1 {
		t.Fatalf("回退全量臂注入后池=%d, want 1", got)
	}
	if !tk.pcWarned.Load() {
		t.Fatalf("回退臂应置 warn-once 标志")
	}
}

// TestR76aExhaustedHookRepull 失败降级接线: 直连拨号失败 → 钩子(=pullDynamicProxies)
// → 即时重拉注入 → 池增长(节流窗口行为由 fetch 包 TestR76aDirectFailTriggersPoolRepull 钉死)
func TestR76aExhaustedHookRepull(t *testing.T) {
	src := &fakeProxySource{}
	src.set([]string{"http://10.6.6.6:8080", "socks5://10.6.6.7:1080"}, nil) // 池有货(收割/校验已完成)
	tk := newProxyFeedTask(t, src)
	// 回环目标需豁免(ssrfCheck)才能走到直连拨号失败分支; 与 fetch 包同款构形
	tk.fetcher = fetch.New(rule.FetchConfig{Engine: "http", AllowLoopback: true, Timeout: 1000})
	tk.fetcher.ProxyPoolExhausted = tk.pullDynamicProxies // 与 newTask 装配同形

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	deadURL := srv.URL
	srv.Close()

	// 直连失败 → 钩子触发 → 重拉 → 注入(降级链闭合: 后续请求即可经代理)
	_, err := tk.fetcher.Fetch(context.Background(), deadURL+"/x", "")
	if err == nil {
		t.Fatalf("死端口请求应失败")
	}
	src.mu.Lock()
	c1 := src.called
	src.mu.Unlock()
	if c1 != 1 {
		t.Fatalf("直连失败未触发重拉: called=%d", c1)
	}
	if got := tk.fetcher.ProxyCount(); got != 2 {
		t.Fatalf("重拉注入后池=%d, want 2", got)
	}
}

// TestR76aNewTaskWiresExhaustedHook newTask 装配形态: proxySource 在册时
// fetcher.ProxyPoolExhausted 必须被接线(直连失败降级链的装配钉子)
func TestR76aNewTaskWiresExhaustedHook(t *testing.T) {
	m := NewManager()
	src := &fakeProxySource{}
	m.SetProxySource(src)
	p := rule.TaskStartPayload{
		Task: rule.TaskInfo{
			ID: "t-r76a-hook", Mode: "single", BookURL: "http://93.184.216.34/book/1",
			ThreadMin: 1, ThreadMax: 1, IntervalMin: 50, IntervalMax: 50,
		},
		Rule:     rule.RuleConfig{},
		Callback: rule.CallbackInfo{BaseURL: "http://127.0.0.1:1/cb"},
	}
	p.Sanitize()
	if err := m.Start(p); err != nil {
		t.Fatalf("start: %v", err)
	}
	m.mu.Lock()
	tk := m.tasks["t-r76a-hook"]
	m.mu.Unlock()
	if tk == nil {
		t.Fatalf("任务未入注册表")
	}
	if tk.fetcher.ProxyPoolExhausted == nil {
		t.Fatalf("newTask 未接线 ProxyPoolExhausted 钩子(失败降级链断裂)")
	}
	m.Control("t-r76a-hook", "stop")
}
