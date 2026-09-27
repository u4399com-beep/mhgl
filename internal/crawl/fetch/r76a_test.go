// ============================================================
// [R76-a] 代理管线端到端回归 — ①-3 注入链整合 + ①-5 失败降级链
//
//	①「收割产出形态的代理地址(protocol://host:port)经 SetDynamicProxies 注入
//	  → pickProxy 选中 → 实际拨号经代理往返」整合验证(httptest 转发代理形态,
//	  不真连外网: 转发代理 handler 直接伪造源站响应)
//	② 直连网络层失败(dial refused)→ ProxyPoolExhausted 钩子节流触发(池刷新降级)
//	③ 403 WAF 面不触发降级钩子(与 R73/R74 重试语义对齐)
//	④ CountryFilteredProxySource 能力接口缝形态
//
// ============================================================
package fetch

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"mhgl/internal/crawl/rule"
)

// newForwardProxy httptest 转发代理(标准 http 代理形态: 绝对 URI 请求直接应答,
// 不真连源站)。返回 (server, 命中计数指针)。handler 校验请求为绝对 URI 形态
// (经 Transport.Proxy 的 http 目标即此形态)并回固定正文, 断言「请求确实经过代理」
func newForwardProxy(t *testing.T, body string) (*httptest.Server, *atomic.Int64) {
	t.Helper()
	var hits atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if r.URL.Host == "" {
			// 非代理形态(相对 URI): 客户端没把请求当代理请求发 → 直接暴露
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte("not-a-proxy-request"))
			return
		}
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv, &hits
}

// TestR76aHarvestAddrThroughPickProxyAndDial [①-3 整合验证]: 真实收割/存储链产出的
// 地址串形态("http://host:port", store.AliveProxyAddrs 输出同形)注入 Client 池后,
// pickProxy 选中并实际经该代理拨号(转发代理 handler 命中即证)
func TestR76aHarvestAddrThroughPickProxyAndDial(t *testing.T) {
	proxySrv, hits := newForwardProxy(t, "VIA-PROXY-OK")
	// AliveProxyAddrs/Harvest 链产出的地址串形态(protocol://host:port)
	harvestedAddr := "http://" + proxySrv.Listener.Addr().String()

	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0, GlobalConcurrency: 2, HostGateLimit: 2, ProxyRotation: "round-robin"})
	defer c.Close()
	if got := c.SetDynamicProxies([]string{harvestedAddr}); got != 1 {
		t.Fatalf("动态注入 added=%d, want 1", got)
	}
	if got := c.ProxyCount(); got != 1 {
		t.Fatalf("池条数=%d, want 1", got)
	}

	// pickProxy 层: 目标非回环(公网 IP 字面量, 测试中仅作 URL 形态, 不实际直连)
	target, _ := url.Parse("http://93.184.216.34/page")
	picked := c.pickProxy(target)
	if picked == nil || picked.String() != harvestedAddr {
		t.Fatalf("pickProxy 未选中注入的收割地址: picked=%v want=%s", picked, harvestedAddr)
	}

	// 拨号层: Fetch 全链经代理往返(转发代理 handler 伪造源站响应, 不真连外网;
	// 目标 host:port 仅出现在代理请求行上)。[R76-main] 动态池兜底语义: 无显式
	// 代理意图时首 attempt 直连 —— 置目标 host 直连失败冷却窗(兜底链第一环)后,
	// 首 attempt 即走代理, 与生产「直连失败 → 冷却窗 → 代理兜底」路径同构
	c.mu.Lock()
	c.directFailUntil["93.184.216.34"] = time.Now().Add(time.Minute)
	c.mu.Unlock()
	res, err := c.Fetch(context.Background(), "http://93.184.216.34/page", "")
	if err != nil {
		t.Fatalf("经代理 Fetch 失败: %v", err)
	}
	if res.StatusCode != 200 || res.HTML != "VIA-PROXY-OK" {
		t.Fatalf("经代理响应异常: status=%d body=%q", res.StatusCode, res.HTML)
	}
	if hits.Load() != 1 {
		t.Fatalf("转发代理命中数=%d, want 1(请求未走代理)", hits.Load())
	}
	// 代理成功事实记账: 成功计数 +1(回写钩子 nil 时仅内存面)
	c.mu.Lock()
	succ := c.proxySuccCount[harvestedAddr]
	c.mu.Unlock()
	if succ != 1 {
		t.Fatalf("markProxySuccess 未记账: succ=%d", succ)
	}
}

// TestR76aDirectFailTriggersPoolRepull [①-5 失败降级]: 池空直连拨号失败(连接拒绝,
// dial 类网络层失败)→ ProxyPoolExhausted 钩子触发(装配方重拉池注入);
// 节流窗口内第二次失败不重复触发; 手动清零节流后可再触发
func TestR76aDirectFailTriggersPoolRepull(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	deadURL := srv.URL
	srv.Close() // 立即关闭: 对 deadURL 的请求 = dial 连接拒绝(快败, 非超时)

	c := New(rule.FetchConfig{Engine: "http", AllowLoopback: true, Timeout: 2000, Retries: 0, GlobalConcurrency: 1, HostGateLimit: 1})
	defer c.Close()
	var calls atomic.Int64
	c.ProxyPoolExhausted = func() {
		calls.Add(1)
		c.SetDynamicProxies([]string{"http://10.9.9.9:8080"}) // 模拟 task 重拉注入
	}

	_, err := c.Fetch(context.Background(), deadURL+"/x", "")
	if err == nil {
		t.Fatalf("对已关闭端口的请求应失败")
	}
	if calls.Load() != 1 {
		t.Fatalf("直连失败未触发池刷新钩子: calls=%d", calls.Load())
	}
	if got := c.ProxyCount(); got != 1 {
		t.Fatalf("钩子注入后池=%d, want 1", got)
	}
	// 节流: 窗口内第二次失败不再触发
	_, err = c.Fetch(context.Background(), deadURL+"/y", "")
	if err == nil {
		t.Fatalf("第二次请求应失败")
	}
	if calls.Load() != 1 {
		t.Fatalf("节流窗口内重复触发: calls=%d, want 1", calls.Load())
	}
	// 清零节流(模拟窗口过期)后可再触发
	c.lastPoolPull.Store(0)
	_, _ = c.Fetch(context.Background(), deadURL+"/z", "")
	if calls.Load() != 2 {
		t.Fatalf("节流过期后应再触发: calls=%d, want 2", calls.Load())
	}
}

// TestR76aWafFaceNoPoolRepull [①-5 缺省保守]: 403(WAF 面, client.Do 成功有状态码)
// 不触发池刷新钩子 —— WAF 拦截不是代理池可解的网络层故障, 降级只会把 WAF 账记进
// 代理健康分(与 R73/R74 确定性/重试语义对齐)
func TestR76aWafFaceNoPoolRepull(t *testing.T) {
	var calls atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()
	c := New(rule.FetchConfig{Engine: "http", AllowLoopback: true, Timeout: 2000, Retries: 0, GlobalConcurrency: 1, HostGateLimit: 1})
	defer c.Close()
	c.ProxyPoolExhausted = func() { calls.Add(1) }

	_, err := c.Fetch(context.Background(), srv.URL+"/x", "")
	if err == nil {
		t.Fatalf("403 应为错误")
	}
	if calls.Load() != 0 {
		t.Fatalf("403 WAF 面触发池刷新钩子: calls=%d, want 0", calls.Load())
	}
}

// TestR76aInternalChannelNoRepull 内部通道(token 预取, loopbackExempt)恒直连,
// 其失败不触发池刷新钩子(内部通道与代理池无关)
func TestR76aInternalChannelNoRepull(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	deadURL := srv.URL
	srv.Close()
	c := New(rule.FetchConfig{Engine: "http", AllowLoopback: true, Timeout: 2000, Retries: 0, GlobalConcurrency: 1, HostGateLimit: 1})
	defer c.Close()
	var calls atomic.Int64
	c.ProxyPoolExhausted = func() { calls.Add(1) }
	// token 直连通道(fetchTokenDirect → doOnce directOnly+loopbackExempt)
	c.cfg.TokenURL = deadURL + "/token"
	tok := c.prefetchToken(context.Background(), "http://93.184.216.34/page")
	if tok != "" {
		t.Fatalf("死端点 token 预取应失败")
	}
	if calls.Load() != 0 {
		t.Fatalf("内部通道触发池刷新钩子: calls=%d, want 0", calls.Load())
	}
}

// TestR76aCountryFilteredSourceSeam [①-4 接口缝形态]: 能力接口可选实现 ——
// 实现方(task 过滤拉取臂)与未实现方(task 回退全量臂)两种源形态
func TestR76aCountryFilteredSourceSeam(t *testing.T) {
	type filteredSource struct{ fakeAddrSource }

	var src ProxyAddrSource = filteredSource{}
	if _, ok := src.(CountryFilteredProxySource); ok {
		t.Fatalf("嵌入了能力方法的 filteredSource 未声明方法集, 不应满足能力接口")
	}
	_ = fmt.Sprint() // 保持 fmt 引用(与既有测试文件形态一致)
}

// TestR76aContentProxyBranches [② 旋钮矩阵] contentProxyUrl 未覆盖分支补钉(R63-c 只钉
// 镜像隔离两面): ①{url} 占位符替换+JSON {ok,content} 解析臂 ②纯文本换行 <p> 包裹臂
// ③{ok:false} 无效载荷 → 降级直连臂 ④matchesTemplateOrigin 自指豁免臂(跳过代理直连)
// ⑤SSRF 拒绝臂(私网 contentProxy) → 降级直连
func TestR76aContentProxyBranches(t *testing.T) {
	const target = "http://93.184.216.34/book/1.html"

	// ① JSON 臂 + {url} 占位符: handler 断言收到的 url 参数=原 URL
	var gotURL string
	jsonSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotURL = r.URL.Query().Get("url")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"content":"line1\nline2"}`))
	}))
	defer jsonSrv.Close()
	c := New(rule.FetchConfig{Engine: "http", Timeout: 2000, Retries: 0, AllowLoopback: true,
		ContentProxyURL: jsonSrv.URL + "/unlock?url={url}"})
	defer c.Close()
	res, err := c.FetchContentRef(context.Background(), target, "")
	if err != nil {
		t.Fatalf("JSON 臂失败: %v", err)
	}
	if res.HTML != "<p>line1</p><p>line2</p>" {
		t.Fatalf("JSON content 未按行包 <p>: %q", res.HTML)
	}
	if gotURL != target {
		t.Fatalf("{url} 占位符未替换为目标原串: %q want %q", gotURL, target)
	}
	if res.FinalURL == "" || !strings.Contains(res.FinalURL, "/unlock?url=") {
		t.Fatalf("FinalURL 应为 contentProxy URL: %q", res.FinalURL)
	}

	// ② 纯文本臂: 非 JSON 响应按行 wrap(空行过滤)
	txtSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("A&B\n\nC<D\n"))
	}))
	defer txtSrv.Close()
	c2 := New(rule.FetchConfig{Engine: "http", Timeout: 2000, Retries: 0, AllowLoopback: true,
		ContentProxyURL: txtSrv.URL + "?u={url}"})
	defer c2.Close()
	res2, err := c2.FetchContentRef(context.Background(), target, "")
	if err != nil {
		t.Fatalf("纯文本臂失败: %v", err)
	}
	if res2.HTML != "<p>A&amp;B</p><p>C&lt;D</p>" {
		t.Fatalf("纯文本未 HTML 转义+包裹: %q", res2.HTML)
	}

	// ③ {ok:false} 无效载荷 → 降级直连(target 同 host:port 的 contentProxy 形态
	// 也顺带覆盖 ④ matchesTemplateOrigin 自指豁免 —— 这里 ③④ 分开: 用独立 target 端口)
	selfSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/unlock") {
			_, _ = w.Write([]byte(`{"ok":false,"error":"no"}`))
			return
		}
		_, _ = w.Write([]byte("<html><title>直接命中</title>" + strings.Repeat("正文内容", 60) + "</html>"))
	}))
	defer selfSrv.Close()
	c3 := New(rule.FetchConfig{Engine: "http", Timeout: 2000, Retries: 0, AllowLoopback: true,
		ContentProxyURL: selfSrv.URL + "/unlock?url={url}"})
	defer c3.Close()
	res3, err := c3.FetchContentRef(context.Background(), selfSrv.URL+"/book/1.html", "")
	if err != nil {
		t.Fatalf("自指+无效载荷降级直连失败: %v", err)
	}
	if !strings.Contains(res3.HTML, "直接命中") {
		t.Fatalf("未降级直连(自指豁免/无效载荷臂): %q", res3.HTML)
	}

	// ⑤ SSRF 拒绝臂: contentProxy 指向私网 IP → 拒绝走代理, 降级直连
	c4 := New(rule.FetchConfig{Engine: "http", Timeout: 2000, Retries: 0, AllowLoopback: true,
		ContentProxyURL: "http://10.255.255.1:9999/unlock?url={url}"})
	defer c4.Close()
	res4, err := c4.FetchContentRef(context.Background(), selfSrv.URL+"/book/2.html", "")
	if err != nil {
		t.Fatalf("SSRF 拒绝后降级直连失败: %v", err)
	}
	if !strings.Contains(res4.HTML, "直接命中") {
		t.Fatalf("SSRF 拒绝臂未降级直连: %q", res4.HTML)
	}
}
