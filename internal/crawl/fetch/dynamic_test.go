// ============================================================
// 动态代理注入单测(R57-2a DB 代理池接线)
//
//	① SetDynamicProxies 合并去重(静态+动态, 归一键) ② 空结果/全非法不清空现有池
//	③ ProxyAddrSource 接口形态(fakesource 即证) ④ ProxyFeedback 回写钩子
//	(成功即报 / 连败达阈值才报 / 阈值内不报) ⑤ [R58-2a] 加权随机选取
//	(成功计数为权+失败减半衰减; "random"/"roundrobin" 显式形态保留)
//
// ============================================================
package fetch

import (
	"net/url"
	"sync"
	"testing"

	"mhgl/internal/crawl/rule"
)

func newProxyTestClient(t *testing.T, static string) *Client {
	t.Helper()
	c := New(rule.FetchConfig{Engine: "http", ProxyURL: static, Timeout: 1000, Retries: 0, GlobalConcurrency: 1, HostGateLimit: 1})
	t.Cleanup(c.Close)
	return c
}

func poolKeys(c *Client) []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]string, 0, len(c.proxies))
	for _, p := range c.proxies {
		out = append(out, p.String())
	}
	return out
}

// TestSetDynamicProxiesMergeDedup 合并去重: 静态条目保留, 动态新条目注入,
// 同一地址(不同书写形态)归一去重, 非法协议跳过
func TestSetDynamicProxiesMergeDedup(t *testing.T) {
	c := newProxyTestClient(t, "http://10.0.0.1:8080")
	if got := c.ProxyCount(); got != 1 {
		t.Fatalf("静态池装载: got %d, want 1", got)
	}
	added := c.SetDynamicProxies([]string{
		"http://10.0.0.1:8080", // 与静态重复(完全同形)
		"10.0.0.1:8080",        // 与静态重复(缺 scheme 归一后同形)
		"socks5://10.0.0.2:1080",
		"socks5h://10.0.0.2:1080", // socks5h 归一 socks5 后同形
		"10.0.0.3:3128",           // 缺 scheme → http://
		"ftp://10.0.0.4:21",       // 不支持协议
		"",                        // 空
	})
	if added != 2 {
		t.Fatalf("SetDynamicProxies added=%d, want 2(仅 socks5://10.0.0.2 与 http://10.0.0.3)", added)
	}
	if got := c.ProxyCount(); got != 3 {
		t.Fatalf("合并后池条数=%d, want 3; pool=%v", got, poolKeys(c))
	}
	// 重复注入零增长(幂等; 注意同 host 不同 scheme 属不同代理, 不算重复)
	if added := c.SetDynamicProxies([]string{"socks5://10.0.0.2:1080", "http://10.0.0.3:3128"}); added != 0 {
		t.Fatalf("重复注入 added=%d, want 0", added)
	}
	if got := c.ProxyCount(); got != 3 {
		t.Fatalf("幂等后池条数=%d, want 3", got)
	}
}

// TestSetDynamicProxiesEmptyNoClear 空结果/全非法不清空现有池(只增不减防抖)
func TestSetDynamicProxiesEmptyNoClear(t *testing.T) {
	c := newProxyTestClient(t, "http://10.0.0.1:8080,socks5://10.0.0.2:1080")
	before := poolKeys(c)
	if n := c.SetDynamicProxies(nil); n != 0 {
		t.Fatalf("nil 注入 added=%d, want 0", n)
	}
	if n := c.SetDynamicProxies([]string{}); n != 0 {
		t.Fatalf("空切片注入 added=%d, want 0", n)
	}
	if n := c.SetDynamicProxies([]string{"ftp://x:21", "", "   "}); n != 0 {
		t.Fatalf("全非法注入 added=%d, want 0", n)
	}
	after := poolKeys(c)
	if len(after) != len(before) {
		t.Fatalf("池被清空/变更: before=%v after=%v", before, after)
	}
	for i := range before {
		if before[i] != after[i] {
			t.Fatalf("池条目变更: before=%v after=%v", before, after)
		}
	}
}

// TestProxyAddrSourceInterface 接口缝形态: 假 source 实现即证 *store.DB(方法集
// AliveProxyAddrs(int) ([]string, error))可注入(SetProxySource 装配点见 task/engine)
type fakeAddrSource struct{ addrs []string }

func (f fakeAddrSource) AliveProxyAddrs(int) ([]string, error) { return f.addrs, nil }

var _ ProxyAddrSource = fakeAddrSource{}

// TestProxyFeedbackHook 回写钩子: 成功即报 true; 连败 <3 不报; 达 3 报 false
func TestProxyFeedbackHook(t *testing.T) {
	c := newProxyTestClient(t, "")
	var mu sync.Mutex
	var events []struct {
		addr string
		ok   bool
	}
	c.ProxyFeedback = func(addr string, ok bool) {
		mu.Lock()
		defer mu.Unlock()
		events = append(events, struct {
			addr string
			ok   bool
		}{addr, ok})
	}
	c.SetDynamicProxies([]string{"http://10.9.9.9:8080"})
	c.mu.Lock()
	pu := c.proxies[0]
	c.mu.Unlock()

	c.markProxyFailed(pu)
	c.markProxyFailed(pu)
	mu.Lock()
	n := len(events)
	mu.Unlock()
	if n != 0 {
		t.Fatalf("连败 2 次即触发回写, want 0 次; events=%v", events)
	}
	c.markProxyFailed(pu) // 第 3 次 → 达 proxyFeedbackFailAfter
	mu.Lock()
	n, last := len(events), events[len(events)-1]
	mu.Unlock()
	if n != 1 || last.ok || last.addr != "http://10.9.9.9:8080" {
		t.Fatalf("连败 3 次回写异常: n=%d last=%+v", n, last)
	}
	c.markProxySuccess(pu)
	mu.Lock()
	n, last = len(events), events[len(events)-1]
	mu.Unlock()
	if n != 2 || !last.ok {
		t.Fatalf("成功回写异常: n=%d last=%+v", n, last)
	}
	// 成功清零连败后再次失败 2 次: 不应再触发(计数已重置)
	c.markProxyFailed(pu)
	c.markProxyFailed(pu)
	mu.Lock()
	n = len(events)
	mu.Unlock()
	if n != 2 {
		t.Fatalf("成功清零后连败 2 次不应触发回写: n=%d", n)
	}
}

// TestWeightedProxyPick [R58-2a] 加权随机选取: 成功计数为权(高成功者压倒性多摊),
// 全员保底权重 1 不饿死; 失败减半衰减; 显式 "roundrobin" 纯轮换保留
func TestWeightedProxyPick(t *testing.T) {
	target := &url.URL{Scheme: "http", Host: "example.com"} // 非回环(回环目标豁免直连)
	c := newProxyTestClient(t, "")
	c.SetDynamicProxies([]string{"http://10.0.1.1:1", "http://10.0.1.2:2", "http://10.0.1.3:3"})
	c.mu.Lock()
	a := c.proxies[0]
	c.mu.Unlock()

	// a 成功 50 次 → 权重 51 vs 1 vs 1: 200 次选取 a 应占压倒性多数
	for i := 0; i < 50; i++ {
		c.markProxySuccess(a)
	}
	counts := map[string]int{}
	for i := 0; i < 200; i++ {
		pu := c.pickProxy(target)
		if pu == nil {
			t.Fatalf("加权选取不应返回 nil(池非空)")
		}
		counts[pu.String()]++
	}
	if counts[a.String()] < 120 {
		t.Errorf("高成功代理流量占比异常: counts=%v(权重 51:1:1 下应 >120/200)", counts)
	}

	// 全员零成功记录(权重全为保底 1): 300 次选取三代理全部出现(不饿死;
	// 均匀随机下 P(缺席)≈(2/3)^300, 统计上不可能)
	c2 := newProxyTestClient(t, "")
	c2.SetDynamicProxies([]string{"http://10.0.0.1:1", "http://10.0.0.2:2", "http://10.0.0.3:3"})
	baseline := map[string]int{}
	for i := 0; i < 300; i++ {
		baseline[c2.pickProxy(target).String()]++
	}
	if len(baseline) != 3 {
		t.Errorf("保底权重 1 不应饿死: baseline=%v", baseline)
	}

	// 失败减半衰减: a 连败(入冷却被跳过), 退冷却后权重为 51/2 的量级而非原值;
	// 这里直接验证记账语义
	c.markProxyFailed(a)
	c.mu.Lock()
	succA := c.proxySuccCount[a.String()]
	c.mu.Unlock()
	if succA != 25 {
		t.Errorf("失败减半: succ=%d, want 25", succA)
	}

	// 冷却中的代理被过滤: a 已入冷却, 全部选取不应命中 a
	for i := 0; i < 50; i++ {
		if pu := c.pickProxy(target); pu != nil && pu.String() == a.String() {
			t.Fatalf("冷却中代理被选中: %s", a.String())
		}
	}

	// 显式 "roundrobin": 纯轮换语义保留(依次命中不重复)
	c3 := newProxyTestClient(t, "http://10.0.2.1:1,http://10.0.2.2:2,http://10.0.2.3:3")
	c3.cfg.ProxyRotation = "roundrobin"
	seen := map[string]int{}
	for i := 0; i < 6; i++ {
		pu := c3.pickProxy(target)
		if pu == nil {
			t.Fatalf("轮换不应返回 nil")
		}
		seen[pu.String()]++
	}
	if len(seen) != 3 {
		t.Errorf("roundrobin 未均匀轮换三代理: %v", seen)
	}
	for _, n := range seen {
		if n != 2 {
			t.Errorf("roundrobin 轮换不均匀: %v", seen)
		}
	}
}
