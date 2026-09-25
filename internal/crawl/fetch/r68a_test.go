// ============================================================
// R68-a 回归测试 — 逐行抓虫修复面
//
//	①Cf-Mitigated: challenge 响应头判定(200 壳挑战零误伤补判: body 无特征
//	  也能按挑战消费, 走既有退避重试链)
//	②blockcheck 词表扩充(challenges.cloudflare.com 强标记 + 中文 WAP 拦截
//	  弱标记, 弱标记正常标题豁免不回归)
//	③mirrorGroup 同 host 重复镜像域(闸门按候选 host 归属的不变式来源)
//	④rawFetch 同 host 双候选链路(修前未持闸进入 attempts 循环 + 错误路径
//	  无条件 release 超发闸票; 修后进 attempt 前置闸不变式)
//
// ============================================================
package fetch

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"mhgl/internal/crawl/rule"
)

// TestR68aCfMitigatedHeaderTreatedAsChallenge [R68-a] Cf-Mitigated: challenge 响应头
// 即 CF 官方挑战信令, body 特征缺失(JSON 豁免/长页+正常标题/非常规形态)时也必须按
// 挑战消费 —— 走既有退避重试链, 预算耗尽按 Blocked 返回。
func TestR68aCfMitigatedHeaderTreatedAsChallenge(t *testing.T) {
	var mu sync.Mutex
	n := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		n++
		mu.Unlock()
		// 200 + 无任何 body 级挑战特征(普通短文本), 仅官方信令头
		w.Header().Set("Cf-Mitigated", "challenge")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("<html><body>ok</body></html>"))
	}))
	t.Cleanup(srv.Close)

	oldBase := challengeBackoffBase
	challengeBackoffBase = 2 * time.Millisecond
	defer func() { challengeBackoffBase = oldBase }()

	c := New(rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 3000,
		AllowLoopback: true, GlobalConcurrency: 2, Retries: 5})
	defer c.Close()

	res, err := c.Fetch(context.Background(), srv.URL+"/c", "")
	if err != nil {
		t.Fatalf("信令头挑战应按 Blocked 返回而非 error: %v", err)
	}
	if !res.Blocked {
		t.Fatal("Cf-Mitigated: challenge 应判定 Blocked=true")
	}
	mu.Lock()
	defer mu.Unlock()
	if n != 1+challengeRetryMax {
		t.Fatalf("请求数 = %d, want %d(1+min(Retries=5,2) 挑战重试链)", n, 1+challengeRetryMax)
	}
	if got := c.BlockedCount(); got != int64(1+challengeRetryMax) {
		t.Fatalf("blockedCount = %d, want %d", got, 1+challengeRetryMax)
	}
}

// TestR68aBlockMarkerExpansions [R68-a] 词表扩充回归:
// 强标记 challenges.cloudflare.com 无论体量/标题恒判拦; 中文 WAP 弱标记
// 短页无标题判拦、长页正常标题豁免不误伤。
func TestR68aBlockMarkerExpansions(t *testing.T) {
	cases := []struct {
		name string
		html string
		want bool
	}{
		{
			name: "强标记: turnstile 脚本域引用(短页无标题)",
			html: `<html><head></head><body><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script></body></html>`,
			want: true,
		},
		{
			name: "强标记: 长页正常标题提及脚本域仍判拦(强标记无豁免)",
			html: `<html><head><title>第十二章 破阵</title></head><body><div>` +
				strings.Repeat("正文内容持续推进。 challenges.cloudflare.com 组件地址仅在正文提及。", 40) + `</div></body></html>`,
			want: true,
		},
		{
			name: "弱标记(中文WAP): 短页无标题判拦",
			html: `<html><head></head><body>访问过于频繁, 请稍后再试</body></html>`,
			want: true,
		},
		{
			name: "弱标记(中文WAP): 长页正常标题豁免不误伤(n≥1200)",
			html: `<html><head><title>第十三章 突破</title></head><body><div>` +
				strings.Repeat("主角闭关修炼, 终于突破到了新的境界, 气息流转不息。", 60) +
				`(评论区提示: 访问过于频繁时请稍后再试)</div></body></html>`,
			want: false,
		},
		{
			name: "弱标记: 启用javascript 短页判拦",
			html: `<html><head></head><body>请启用javascript后继续访问</body></html>`,
			want: true,
		},
	}
	for _, c := range cases {
		if got := looksBlocked(c.html, 200, ""); got != c.want {
			t.Fatalf("%s: looksBlocked = %v, want %v", c.name, got, c.want)
		}
	}
}

// TestR68aMirrorGroupDuplicateDomainHosts [R68-a] 同 host 候选对存在性证明:
// MirrorDomains 重复配置成对同域时, mirrorGroup 产出两条同 host 候选
// (闸门按候选 host 归属的不变式来源; sticky 重排会把同域对提到队首)。
func TestR68aMirrorGroupDuplicateDomainHosts(t *testing.T) {
	c := New(rule.FetchConfig{Engine: "http", UaMode: "fixed", MirrorDomains: "b.com,b.com"})
	defer c.Close()
	group := c.mirrorGroup("http://a.com/x")
	if len(group) != 3 {
		t.Fatalf("mirrorGroup 长度 = %d, want 3(主候选+两个同域镜像)", len(group))
	}
	if h1, h2 := urlHostOf(group[1]), urlHostOf(group[2]); h1 != "b.com" || h2 != "b.com" {
		t.Fatalf("镜像候选 host = %q / %q, want 同为 b.com(同 host 候选对)", h1, h2)
	}
}

// TestR68aRawFetchSameHostCandidatesGateInvariant [R68-a-fix] 同 host 双候选链路
// 回归: 修前候选 1 末轮失败 release 后, 候选 2(同 host)在未持闸状态进入 attempts
// 循环 —— 绕过 pacing 且错误路径无条件 release 超发闸票。修后「进 attempt 前置闸」
// 不变式: 逐候选全部失败仍精确收放, 连续两轮调用行为一致(闸未被破坏)。
// 本测试同时以 -race 覆盖持闸状态机路径。
func TestR68aRawFetchSameHostCandidatesGateInvariant(t *testing.T) {
	var n int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 前 6 请求(两轮×3候选)恒 503 + 足量体量 body(防短页判拦卷入挑战重试链),
		// 之后恢复 200 —— 末尾断言闸状态完好
		if atomic.AddInt32(&n, 1) <= 6 {
			// Retry-After: 1 → 冷却窗钳到 1s(缺省兜底 30s 会让用例白等); 候选 3 的
			// acquire 仍走「冷却窗单 timer 等待」路径, 不变式覆盖不缩水
			w.Header().Set("Retry-After", "1")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte("<html><body>" + strings.Repeat("服务暂时不可用, 请求过多。", 60) + "</body></html>"))
			return
		}
		_, _ = w.Write([]byte("<html><head><title>第十二章</title></head><body>" +
			strings.Repeat("正文内容持续推进, 页面体量充足。", 40) + "</body></html>"))
	}))
	t.Cleanup(srv.Close)

	// 主候选 = 127.0.0.1:PORT, 镜像域重复配置 localhost:PORT×2 → 末尾两条同 host 候选
	host := strings.TrimPrefix(srv.URL, "http://")
	mirrorHost := "localhost:" + strings.SplitN(host, ":", 2)[1]
	c := New(rule.FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 3000,
		AllowLoopback: true, GlobalConcurrency: 2, Retries: 0, MirrorDomains: mirrorHost + "," + mirrorHost})
	defer c.Close()

	// 轮间重置两 host 闸的限流冷却窗与自适应 gap(503 触发 Retry-After 兜底 30s 冷却,
	// 测试断言的是闸票收放记账与 pacing 不变式, 非冷却时长本身; 不重置则用例白等 60s)
	resetGates := func() {
		for _, h := range []string{host, mirrorHost} {
			g := c.gateFor(h)
			g.mu.Lock()
			g.rateLimitedUntil = time.Time{}
			g.minGap = g.baseGap
			g.mu.Unlock()
		}
	}
	for round := 1; round <= 2; round++ {
		// loopbackExempt=false: 镜像组展开(R63-c: 该通道才做 mirror 展开), SSRF 由
		// cfg.AllowLoopback 放行回环
		if _, err := c.rawFetch(context.Background(), srv.URL+"/x", "", false, false); err == nil {
			t.Fatalf("round %d: 全候选 503 应返回错误", round)
		}
		resetGates()
	}
	// 闸未被超发破坏: 恢复源站后下一轮应正常成功
	if _, err := c.rawFetch(context.Background(), srv.URL+"/x", "", false, false); err != nil {
		t.Fatalf("闸状态应完好(修前超发只增不放, 收放记账被破坏): %v", err)
	}
}
