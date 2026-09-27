package fetch

// R76-main 回归 — blockcheck CF challenge-platform precursor 变体良性豁免
//
// 背景(R76-b handoff, m.cuoceng.com 实站实证): CF Bot Management 站点的真实内容页
// 内嵌 challenge-platform/scripts/precursor/main.js 探测脚本, 修前 jsdBenign 豁免
// 仅认 scripts/jsd 前缀, precursor 变体落进强标记 "challenge-platform" 硬判拦 →
// 200 真内容页被误判挑战页(等价 403 计失败 → 整站不可采)。
// 豁免标准与 jsd 同口径: n≥1200 + hasNormalTitle(盾页标题黑名单防挑战壳穿闸)。

import (
	"net/url"
	"strings"
	"testing"
	"time"

	"mhgl/internal/crawl/rule"
)

// precursorContentPage cuoceng 实页形态: 正常内容页 + precursor 探测脚本内嵌
func precursorContentPage() string {
	var b strings.Builder
	b.WriteString("<!DOCTYPE html><html><head><meta charset=\"utf-8\">")
	b.WriteString("<title>我在精神病院学斩神最新章节列表_错层小说网</title>")
	b.WriteString("<script src='/cdn-cgi/challenge-platform/scripts/precursor/main.js'></script>")
	b.WriteString("</head><body><div class='bookbox'>")
	// 填充到 >1200 码点: 书籍列表条目形态
	for i := 0; i < 40; i++ {
		b.WriteString("<div class='bookinfo'><h2>都市异能小说")
		b.WriteString(strings.Repeat("章节内容简介文字", 3))
		b.WriteString("</h2><a href='/book/uuid-x.html'>阅读</a></div>")
	}
	b.WriteString("</div></body></html>")
	return b.String()
}

func TestR76mainPrecursorProbePageNotBlocked(t *testing.T) {
	h := precursorContentPage()
	if got := looksBlocked(h, 200, ""); got {
		t.Fatalf("precursor 变体真实内容页被误判拦截(修前形态复现): n=%d", len([]rune(h)))
	}
}

func TestR76mainJsdBenignKept(t *testing.T) {
	// 既有 jsd 豁免语义保持(R72-a 口径): 仅把 precursor 并入, jsd 路径零变化
	h := strings.Replace(precursorContentPage(),
		"challenge-platform/scripts/precursor/main.js",
		"challenge-platform/scripts/jsd/main.js", 1)
	if got := looksBlocked(h, 200, ""); got {
		t.Fatalf("jsd 豁免回归破坏: 正常内容页被误判拦截")
	}
}

func TestR76mainPrecursorShortShellStillBlocked(t *testing.T) {
	// 保守反例①: 短壳(<1200 码点)+无正常标题 —— 不满足豁免标准, 强标记仍判拦
	h := "<html><head><script src='/cdn-cgi/challenge-platform/scripts/precursor/main.js'>" +
		"</script></head><body>loading</body></html>"
	if got := looksBlocked(h, 200, ""); !got {
		t.Fatalf("短壳 precursor 页未判拦(豁免条件被稀释): n=%d", len([]rune(h)))
	}
}

func TestR76mainPrecursorChallengeTitleStillBlocked(t *testing.T) {
	// 保守反例②: 长页+盾页标题("Just a moment...") —— hasNormalTitle=false,
	// 豁免不生效, 强标记判拦(挑战壳无法借 precursor 探测脚本穿闸)
	h := "<!DOCTYPE html><html><head><title>Just a moment...</title>" +
		"<script src='/cdn-cgi/challenge-platform/scripts/precursor/main.js'></script></head><body>"
	h += strings.Repeat("<p>challenge padding text for length</p>", 60)
	h += "</body></html>"
	if got := looksBlocked(h, 200, ""); !got {
		t.Fatalf("盾页标题+precursor 长页未判拦(豁免被挑战壳利用)")
	}
}

// ─────────────────────────────────────────────────────────────
// [R76-main] 动态代理池兜底语义回归 — proxyFirst 策略表
//
// 背景: R57-2a 既有语义「池非空→全量走代理」在 R76 代理池实网收割入库(39k 条)
// 后被激活 —— 直连健康的站点被免费代理全面劫持劣化(fq.taijiwang.top 实证:
// 直连 200 完好, 引擎经代理报 Bad Request)。修后: 显式意图(静态 ProxyURL/
// proxyCountries)代理优先; 无显式意图时直连优先, 动态池只做韧性兜底
// (重试链 attempt>0 或 per-host 直连失败冷却窗内才走代理)。
// ─────────────────────────────────────────────────────────────

func TestR76mainProxyFirstPolicyTable(t *testing.T) {
	target, _ := url.Parse("http://93.184.216.34/page")

	// ① 无显式意图+空池: 首 attempt 直连(兜底门全关)
	c1 := New(rule.FetchConfig{Engine: "http"})
	defer c1.Close()
	if c1.proxyFirst(target, 0) {
		t.Fatal("① 无显式意图首 attempt 不应代理优先")
	}
	if !c1.proxyFirst(target, 1) {
		t.Fatal("① 重试链(attempt=1)应允许代理兜底")
	}
	if c1.explicitProxy {
		t.Fatal("① 空配置不应构成显式代理意图")
	}

	// ② SetDynamicProxies 注入不构成显式意图(动态池=兜底, 非主路由)
	if got := c1.SetDynamicProxies([]string{"http://10.9.9.9:8080"}); got != 1 {
		t.Fatalf("② 动态注入 added=%d, want 1", got)
	}
	if c1.proxyFirst(target, 0) {
		t.Fatal("② 动态池注入后首 attempt 仍应直连(修前此处劫持, fq 实证劣化形态)")
	}

	// ③ 静态 ProxyURL = 显式意图: 代理优先
	c2 := New(rule.FetchConfig{Engine: "http", ProxyURL: "http://10.9.9.9:8080"})
	defer c2.Close()
	if !c2.explicitProxy || !c2.proxyFirst(target, 0) {
		t.Fatal("③ 静态 ProxyURL 应显式代理优先")
	}

	// ④ proxyCountries 声明 = 显式意图(合法码); 非法 token 不构成意图
	c3 := New(rule.FetchConfig{Engine: "http", ProxyCountries: "CN,HK"})
	defer c3.Close()
	if !c3.explicitProxy || !c3.proxyFirst(target, 0) {
		t.Fatal("④ 合法 proxyCountries 声明应显式代理优先")
	}
	c4 := New(rule.FetchConfig{Engine: "http", ProxyCountries: "needsX,1"})
	defer c4.Close()
	if c4.explicitProxy {
		t.Fatal("④ 全非法 token 不应构成显式代理意图")
	}

	// ⑤ per-host 直连失败冷却窗: 窗内首 attempt 走代理, 过期回归直连
	c1.mu.Lock()
	c1.directFailUntil["93.184.216.34"] = time.Now().Add(time.Minute)
	c1.mu.Unlock()
	if !c1.proxyFirst(target, 0) {
		t.Fatal("⑤ 冷却窗内首 attempt 应走代理兜底")
	}
	other, _ := url.Parse("http://198.51.100.7/page")
	if c1.proxyFirst(other, 0) {
		t.Fatal("⑤ 冷却窗按 host 隔离, 无关 host 不受影响")
	}
	c1.mu.Lock()
	c1.directFailUntil["93.184.216.34"] = time.Now().Add(-time.Second)
	c1.mu.Unlock()
	if c1.proxyFirst(target, 0) {
		t.Fatal("⑤ 冷却窗过期应回归直连优先")
	}

	// ⑥ 回环目标: pickProxy 恒豁免直连(生产口径, 兜底语义之上不变)
	loop, _ := url.Parse("http://127.0.0.1:1/x")
	if got := c2.pickProxy(loop); got != nil {
		t.Fatalf("⑥ 回环目标应豁免代理: got=%v", got)
	}
}
