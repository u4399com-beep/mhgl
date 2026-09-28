// ============================================================
// [R79-b1] fetch 传输面五轮深审回归(i01-i05)
//
//	i01 读体两阶段分账(网络层/载荷层)+重定向链 Sec-Fetch-Site 逐跳重算
//	i02 重试链与冷却窗(见各轮测试段)
//	i03 TLS 指纹面(见各轮测试段)
//	i04 超时与 ctx 语义(见各轮测试段)
//	i05 错误分类与 blockcheck 集成(见各轮测试段)
//
// ============================================================
package fetch

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"mhgl/internal/crawl/rule"
)

// ---------------- i01: 读体两阶段分账 + Sec-Fetch-Site 逐跳重算 ----------------

// TestR79i01_PayloadErrorNotNetworkFailure [i01 分账①③]: 载荷层错误不得触发直连
// 网络层记账 —— ①CE 声明 gzip 实际明文(gzip 解压失败)与 ②原始体 >10MB 超限, 二者
// 均为目标站 payload 行为, 修前误触发 ProxyPoolExhausted 池刷新钩子+直连失败冷却窗
// (健康站点被当网络故障); 修后钩子零触发。对照组 ③真网络层失败(EOF 断流)钩子照常
// 触发([R76-a] 降级链不回归)
func TestR79i01_PayloadErrorNotNetworkFailure(t *testing.T) {
	// ① corrupt gzip 载荷
	corrupt := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte("<html>plain-not-gzip</html>"))
	}))
	defer corrupt.Close()
	c := New(rule.FetchConfig{Engine: "http", AllowLoopback: true, Timeout: 3000, Retries: 0,
		GlobalConcurrency: 2, HostGateLimit: 2})
	defer c.Close()
	var calls atomic.Int64
	c.ProxyPoolExhausted = func() { calls.Add(1) }
	if _, err := c.Fetch(context.Background(), corrupt.URL+"/page", ""); err == nil {
		t.Fatal("corrupt gzip 载荷应失败")
	}
	if calls.Load() != 0 {
		t.Fatalf("载荷层错误(解压失败)不应触发池刷新钩子: calls=%d", calls.Load())
	}

	// ② 原始体超限(>10MB 未压缩): 响应合法送达, 属策略错误非网络失败
	over := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write(make([]byte, maxBodyBytes+1))
	}))
	defer over.Close()
	calls.Store(0)
	c2 := New(rule.FetchConfig{Engine: "http", AllowLoopback: true, Timeout: 10000, Retries: 0,
		GlobalConcurrency: 2, HostGateLimit: 2})
	defer c2.Close()
	c2.ProxyPoolExhausted = func() { calls.Add(1) }
	if _, err := c2.Fetch(context.Background(), over.URL+"/big", ""); err == nil {
		t.Fatal("超限响应应失败")
	}
	if calls.Load() != 0 {
		t.Fatalf("载荷层错误(超限)不应触发池刷新钩子: calls=%d", calls.Load())
	}

	// ③ 对照: 真网络层失败(先取地址后关 = EOF 断流)钩子照常触发
	eofSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	eofURL := eofSrv.URL
	eofSrv.Close()
	c3 := New(rule.FetchConfig{Engine: "http", AllowLoopback: true, Timeout: 3000, Retries: 0,
		GlobalConcurrency: 2, HostGateLimit: 2})
	defer c3.Close()
	var calls3 atomic.Int64
	c3.ProxyPoolExhausted = func() { calls3.Add(1) }
	if _, err := c3.Fetch(context.Background(), eofURL+"/x", ""); err == nil {
		t.Fatal("对已关闭端口的请求应失败")
	}
	if calls3.Load() != 1 {
		t.Fatalf("网络层失败应照常触发池刷新钩子: calls=%d, want 1", calls3.Load())
	}
}

// TestR79i01_ProxyMidBodyErrorAttribution [i01 分账②]: 经代理请求头到手但响应体中途
// 断流 —— 修前 markProxySuccess 已计成功+错误不打标 proxyChannelError, 断流被 rawFetch
// 当目标 host 故障喂连败链([R53-2a] 误责防御在读体阶段缺失); 修后打标+记代理账+
// 目标 host 闸零喂败
func TestR79i01_ProxyMidBodyErrorAttribution(t *testing.T) {
	// 转发代理: 绝对 URI 请求回 Content-Length 声明 1000 但只写 13 字节(体中途断流)
	proxySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Host == "" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte("not-a-proxy-request"))
			return
		}
		w.Header().Set("Content-Type", "text/html")
		w.Header().Set("Content-Length", "1000")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("<html>partial")) // handler 返回后连接中止 → unexpected EOF
	}))
	defer proxySrv.Close()

	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0, GlobalConcurrency: 2,
		HostGateLimit: 2, AllowLoopback: true, ProxyURL: proxySrv.URL})
	defer c.Close()
	// 目标为 TEST-NET-3 文档段 IP 字面量(非回环, pickProxy 不豁免; 仅出现在代理请求行)
	_, err := c.Fetch(context.Background(), "http://203.0.113.1/page", "")
	if err == nil {
		t.Fatal("响应体中途断流应失败")
	}
	var pe *proxyChannelError
	if !errors.As(err, &pe) {
		t.Fatalf("经代理读体断流应打标 proxyChannelError(与 Do 臂对称): %v", err)
	}
	c.mu.Lock()
	cooled := len(c.proxyFailedUntil)
	c.mu.Unlock()
	if cooled != 1 {
		t.Fatalf("代理中途断流应记代理失败冷却: %d 条, want 1", cooled)
	}
	g := c.gateFor("203.0.113.1")
	g.mu.Lock()
	fails := g.fails
	g.mu.Unlock()
	if fails != 0 {
		t.Fatalf("代理通道断流不应喂目标 host 连败链: fails=%d, want 0", fails)
	}
}

// TestR79i01_ProxyCtxCancelNoAttribution [i01 分账③]: ctx 取消(任务停止)发生在读体
// 阶段 — 取消非目标站/代理故障证据: 不打标 proxyChannelError、不记代理冷却、不喂 host 闸
// (与 client.Do 臂 [R64-a] 误责防御同口径)
func TestR79i01_ProxyCtxCancelNoAttribution(t *testing.T) {
	proxySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Host == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("<html>head"))
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		time.Sleep(2 * time.Second) // 体悬置: 取消发生在读体阶段
		_, _ = w.Write([]byte("tail"))
	}))
	defer proxySrv.Close()

	c := New(rule.FetchConfig{Engine: "http", Timeout: 5000, Retries: 0, GlobalConcurrency: 2,
		HostGateLimit: 2, AllowLoopback: true, ProxyURL: proxySrv.URL})
	defer c.Close()
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(200 * time.Millisecond)
		cancel()
	}()
	defer cancel()
	_, err := c.Fetch(ctx, "http://203.0.113.1/page", "")
	if err == nil {
		t.Fatal("取消期间的抓取应失败")
	}
	var pe *proxyChannelError
	if errors.As(err, &pe) {
		t.Fatalf("ctx 取消期间的读体失败不应打标代理通道: %v", err)
	}
	c.mu.Lock()
	cooled := len(c.proxyFailedUntil)
	c.mu.Unlock()
	if cooled != 0 {
		t.Fatalf("ctx 取消不应记代理失败冷却: %d 条, want 0", cooled)
	}
	g := c.gateFor("203.0.113.1")
	g.mu.Lock()
	fails := g.fails
	g.mu.Unlock()
	if fails != 0 {
		t.Fatalf("ctx 取消不应喂目标 host 连败链: fails=%d, want 0", fails)
	}
}

// TestR79i01_RedirectSecFetchSiteRecompute [i01 指纹]: 重定向链 Sec-Fetch-Site 逐跳重算 —
// 首跳自源 Referer → same-origin; 302 到异 host(不同端口)后第二跳应按「上一跳 URL →
// 新 URL」重算, 不再携带首跳 same-origin 陈旧值(Referer 同跳已被 [R67-a] 改写为
// origin 形态, 交叉断言两头组自洽)。配套纯逻辑: 真异注册域跳 = cross-site
func TestR79i01_RedirectSecFetchSiteRecompute(t *testing.T) {
	var secondSeen string
	var secondReferer string
	second := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		secondSeen = r.Header.Get("Sec-Fetch-Site")
		secondReferer = r.Header.Get("Referer")
		_, _ = w.Write([]byte("<html><head><title>正常页</title></head><body>" + strings.Repeat("正文。", 120) + "</body></html>"))
	}))
	defer second.Close()
	first := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, second.URL+"/end", http.StatusFound)
	}))
	defer first.Close()

	c := New(rule.FetchConfig{Engine: "http", AllowLoopback: true, Timeout: 3000, Retries: 0,
		GlobalConcurrency: 2, HostGateLimit: 2})
	defer c.Close()
	res, err := c.Fetch(context.Background(), first.URL+"/hop", "")
	if err != nil {
		t.Fatalf("重定向链抓取失败: %v", err)
	}
	if res.StatusCode != 200 {
		t.Fatalf("终态状态码=%d, want 200", res.StatusCode)
	}
	if secondSeen == "" {
		t.Fatal("第二跳应携带 Sec-Fetch-Site(池内 UA 均为发 Fetch Metadata 的家族)")
	}
	if secondSeen != "same-site" {
		t.Fatalf("重定向第二跳 Sec-Fetch-Site 应逐跳重算为 same-site(127.0.0.1 异端口, 注册域相等): got %q", secondSeen)
	}
	if secondReferer != first.URL+"/" {
		t.Fatalf("重定向第二跳 Referer 应为 origin 形态([R67-a]): got %q", secondReferer)
	}
	// 纯逻辑配套: 异注册域跳为 cross-site(生产镜像域形态; IP 字面量注册域即自身,
	// 故 httptest 双端口形态只能覆盖 same-site 臂, cross-site 臂在此钉死)
	if got := secFetchSite("https://a.example.com/x", "https://b.example.org/y"); got != "cross-site" {
		t.Fatalf("异注册域跳 secFetchSite=%q, want cross-site", got)
	}
}
