// ============================================================
// R70-a 回归测试 — 70-a 遗留改动甄别合入的驱动面 + 反反爬增量
//
//	①国产 WAF 强标记扩容(长页+正常标题仍判拦, 技术指纹零正文碰撞)
//	②国产 WAF 弱标记扩容(短壳判拦 + 长页正常标题豁免不误伤 + 前 4000 码点窗口)
//	③meta-refresh/iframe 嵌套挑战跳转(isWafJumpChallenge; 裸跳转/业务 iframe 不误伤)
//	④parseRetryAfter ×1e9 纳秒换算溢出预钳(与 Atoi 溢出臂同归钳制上限)
//	⑤Server 头国产 WAF 指纹(仅 403/429/503 联合判定消费)
//	⑥runeHead 码点截断边界(共用助手回归)
//	⑦proxyTans 传输缓存有界化(超 proxyTransportCap 整表重置)
//
// ============================================================
package fetch

import (
	"fmt"
	"net/url"
	"strings"
	"testing"
	"time"

	"mhgl/internal/crawl/rule"
)

// r70aLongBody 长页正文(≥1200 码点, 驱动「长页+正常标题」豁免路径)
func r70aLongBody() string {
	return strings.Repeat("正文内容持续推进, 情节稳步展开。", 100) // 15 码点 × 100
}

// r70aNormalPage 无标记基准长页(正常标题 + 长正文 → 豁免放行)
func r70aNormalPage() string {
	return `<html><head><title>第七十一章 破阵</title></head><body><div>` + r70aLongBody() + `</div></body></html>`
}

// TestR70aDomesticWafStrongMarkers ①国产 WAF 强标记: 技术指纹命中即拦, 长页+正常标题
// 豁免不适用(修前这些页面均因标题豁免漏判 → 拦截壳 HTML 被当正文送进解析层); 尾部
// 反例证明「同形态无标记页」仍被豁免放行, 命中确实来自新词条而非豁免失效
func TestR70aDomesticWafStrongMarkers(t *testing.T) {
	base := r70aNormalPage()
	cases := []struct {
		name  string
		snip  string // 注入到长页 body 尾部的标记形态(合成拦截页技术指纹)
		probe string // 标记本体(自检: 必须真实出现在合成页内, 防 fixture 失真)
	}{
		{"宝塔 getWafJs 挑战加载器", `<script src="/bt-waf/getWafJs?token=x"></script>`, "getwafjs"},
		{"宝塔 bt-waf 拦截资源路径", `<link rel="stylesheet" href="/bt-waf/style.css">`, "bt-waf"},
		{"宝塔产品全称", `<div class="btwaf-info">宝塔网站防火墙</div>`, "宝塔网站防火墙"},
		{"安全狗脚本域", `<script src="https://static.safedog.cn/sd.js"></script>`, "safedog"},
		{"云锁会话 Cookie 族", `<script>document.cookie="yunsuo_session_verify=abc";</script>`, "yunsuo_session"},
		{"雷池 SafeLine ASCII 标识", `<meta name="generator" content="SafeLine">`, "safeline"},
		{"雷池拦截文案", `<div>请求被waf拦截, 请联系站点管理员</div>`, "请求被waf拦截"},
		{"加速乐 uid Cookie", `<script>document.cookie="__jsluid=abc";</script>`, "__jsluid"},
		{"百度云加速脚本域", `<script src="https://static.yunjiasu.com/js/protect.js"></script>`, "yunjiasu"},
		{"知道创宇网站卫士 Cookie", `<script>var wzws_cid="abc";</script>`, "wzws_cid"},
		{"创宇盾产品名", `<div>创宇盾安全防护</div>`, "创宇盾"},
	}
	for _, c := range cases {
		page := strings.Replace(base, "</div></body></html>", c.snip+"</div></body></html>", 1)
		if !strings.Contains(strings.ToLower(page), c.probe) {
			t.Fatalf("%s: fixture 自检失败(标记未注入合成页)", c.name)
		}
		if got := looksBlocked(page, 200, ""); !got {
			t.Fatalf("%s: 长页+正常标题下强标记应判拦(修前豁免漏判), looksBlocked = false", c.name)
		}
	}
	// 反例: 同形态无标记页豁免放行(豁免机制未失效, 命中确为新词条)
	if got := looksBlocked(base, 200, ""); got {
		t.Fatal("无标记长页+正常标题应豁免放行(误伤反例)")
	}
}

// TestR70aDomesticWafWeakMarkers ②国产 WAF 中文产品名弱标记: 无正常标题豁免路径
// (n<1200)短壳判拦; 长页+正常标题正文提及不误伤; 弱标记仅扫前 4000 码点(TS
// lower.slice(0,4000) 同口径)
func TestR70aDomesticWafWeakMarkers(t *testing.T) {
	// 短壳: n<500 且可见文本 ≥50(绕过空壳规则), 标题不在盾页黑名单 → 弱标记为唯一判拦依据
	shell := func(marker string) string {
		return `<html><head><title>站点提示</title></head><body><div>` + marker +
			`已拦截本次访问` + strings.Repeat("详情请联系管理员处理。", 25) + `</div></body></html>`
	}
	for _, m := range []string{"安全狗", "云锁", "雷池WAF", "百度云加速", "知道创宇网站卫士"} {
		page := shell(m)
		if n := len([]rune(page)); n >= 1200 {
			t.Fatalf("%s: fixture 体量失控(%d 码点), 未走「无豁免」路径", m, n)
		}
		if got := looksBlocked(page, 200, ""); !got {
			t.Fatalf("弱标记 %q 短壳应判拦(修前无词条漏判)", m)
		}
	}
	// 长页+正常标题豁免: 武侠文本「云锁」等自然入文不误伤
	long := `<html><head><title>第八十二章 云锁雾岭</title></head><body><div>` +
		strings.Repeat("远山云锁雾未开, 少年提剑独行, 剑气纵横三万里。", 60) + `</div></body></html>`
	if got := looksBlocked(long, 200, ""); got {
		t.Fatal("长页+正常标题正文提及「云锁」应豁免放行(误伤反例)")
	}
	// 前 4000 码点窗口: 无标题页弱标记越过窗口不判拦(TS slice(0,4000) 口径)
	beyond := `<html><body>` + strings.Repeat("铺垫文本。", 900) /* 4500 码点 */ +
		`安全狗` + strings.Repeat("收尾文本。", 10) + `</body></html>`
	if got := looksBlocked(beyond, 200, ""); got {
		t.Fatal("弱标记越过前 4000 码点窗口不应判拦(TS slice(0,4000) 口径)")
	}
}

// TestR70aWafJumpChallenge ③meta-refresh/iframe 嵌套挑战跳转: 长页+正常标题形态
// (强/弱标记与豁免均放行的盲区)由跳转目标技术关键词补判; 裸 meta refresh(分页跳转)
// 与业务 iframe 不误伤; meta 标签属性序无关(http-equiv 值恒随其后)
func TestR70aWafJumpChallenge(t *testing.T) {
	longBody := r70aLongBody()
	wrap := func(inner string) string {
		return `<html><head><title>第九十章 归途</title></head><body>` + inner +
			`<div>` + longBody + `</div></body></html>`
	}
	positives := []struct {
		name  string
		inner string
	}{
		{"meta refresh 跳挑战端点", `<meta http-equiv="refresh" content="0;url=/waf/captcha.html">`},
		{"meta refresh 属性序反转", `<meta content="0;url=/waf/captcha.html" http-equiv="refresh">`},
		{"meta refresh 大写+空格", `<META HTTP-EQUIV="Refresh" CONTENT="0; URL=/challenge/verify?x=1">`},
		{"iframe 嵌套挑战页", `<iframe src="/waf/captcha.html" width="100%" height="600"></iframe>`},
		{"iframe 绝对地址挑战域", `<iframe src="https://guard.example.com/challenge/slider"></iframe>`},
	}
	for _, c := range positives {
		if got := looksBlocked(wrap(c.inner), 200, ""); !got {
			t.Fatalf("%s: 长页+正常标题下挑战跳转应判拦(isWafJumpChallenge 补判面), looksBlocked = false", c.name)
		}
	}
	negatives := []struct {
		name  string
		inner string
	}{
		{"裸 meta refresh 分页跳转", `<meta http-equiv="refresh" content="5;url=/book/12_3.html">`},
		{"业务 iframe(播放器)", `<iframe src="https://player.example.com/embed/XNjM"></iframe>`},
		{"业务 iframe(评论区)", `<iframe src="//comment.example.com/frame?id=9"></iframe>`},
	}
	for _, c := range negatives {
		if got := looksBlocked(wrap(c.inner), 200, ""); got {
			t.Fatalf("%s: 非挑战跳转不应判拦(误伤反例)", c.name)
		}
	}
}

// TestR70aParseRetryAfterMultiplicationOverflow ④修前分桶不一致: 能被 Atoi 容纳但
// ×1e9 纳秒换算越过 int64 的秒数(如 10 位九)乘出负 Duration → retryAfterCooldown
// 误判 d<1s 走 30s 兜底, 与 [R69-a] Atoi 溢出臂(钳 120s)自相矛盾; 修后乘法前预判同归
// 钳制上限
func TestR70aParseRetryAfterMultiplicationOverflow(t *testing.T) {
	// 10 位九: Atoi 通过, ×1e9 溢出 int64(修前负 Duration)
	d, ok := parseRetryAfter("9999999999", time.Now())
	if !ok {
		t.Fatal("10 位九应按显式合法秒数采纳(ok=true)")
	}
	if d != retryAfterMax {
		t.Fatalf("×1e9 会溢出的秒数应预钳上限: got %v, want %v", d, retryAfterMax)
	}
	if got := retryAfterCooldown(d, true); got != retryAfterMax {
		t.Fatalf("cooldown 应采 120s(修前负值误入 30s 兜底): got %v", got)
	}
	// 恰好不溢出的边界: maxRetryAfterSeconds × 1e9 仍可被 int64 表示
	d2, ok2 := parseRetryAfter("9223372036", time.Now())
	if !ok2 || d2 != time.Duration(9223372036)*time.Second {
		t.Fatalf("边界值 9223372036s 不应预钳(原样采纳): d=%v ok=%v", d2, ok2)
	}
	if got := retryAfterCooldown(d2, true); got != retryAfterMax {
		t.Fatalf("边界值经 cooldown 仍应钳 120s: got %v", got)
	}
	// 边界 +1: ×1e9 越过 int64 → 预钳上限
	d3, ok3 := parseRetryAfter("9223372037", time.Now())
	if !ok3 || d3 != retryAfterMax {
		t.Fatalf("边界 +1 应预钳上限: d=%v ok=%v", d3, ok3)
	}
	// 既有口径不回归: 常规值/零值/过期日期
	if d, ok := parseRetryAfter("42", time.Now()); !ok || d != 42*time.Second {
		t.Fatalf("常规秒数应原样采纳: d=%v ok=%v", d, ok)
	}
	if d, ok := parseRetryAfter("0", time.Now()); ok || d != 0 {
		t.Fatalf("0 应判非法走兜底: d=%v ok=%v", d, ok)
	}
	if d, ok := parseRetryAfter("Wed, 21 Oct 2015 07:28:00 GMT",
		time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)); !ok || d != 0 {
		t.Fatalf("过期 HTTP 日期应返回 0(ok=true, cooldown 兜底): d=%v ok=%v", d, ok)
	}
}

// TestR70aWafServerHeaderFingerprint ⑤Server 头国产 WAF 指纹: 仅 403/429/503 联合
// 判定消费(体面状态码下的同头不判拦, 误报面限缩)
func TestR70aWafServerHeaderFingerprint(t *testing.T) {
	body := `<html><head><title>第十一章 风起</title></head><body><div>` + r70aLongBody() + `</div></body></html>`
	for _, srv := range []string{"safedog", "yunsuo", "SafeLine", "yunjiasu"} {
		if got := looksBlocked(body, 403, srv); !got {
			t.Fatalf("403 + WAF Server 头(%s)应联合判拦", srv)
		}
	}
	// 200 + 同头: 不联合判拦(体面状态码下 Server 头不构成拦截证据)
	if got := looksBlocked(body, 200, "safedog"); got {
		t.Fatal("200 + WAF Server 头不应判拦(联合判定仅限 403/429/503)")
	}
	// 无关 Server 头不判拦
	if got := looksBlocked(body, 403, "nginx"); got {
		t.Fatal("403 + nginx 不应判拦(非 WAF 指纹)")
	}
}

// TestR70aRuneHead ⑥runeHead 码点截断边界(弱标记扫描与挑战跳转扫描共用助手):
// 按码点不斩多字节字符; 总码点 ≤n 原样返回; n<=0 恒空
func TestR70aRuneHead(t *testing.T) {
	s := "一二三四五六七八九十" // 10 码点 30 字节
	cases := []struct {
		n    int
		want string
	}{
		{0, ""}, {-1, ""},
		{1, "一"}, {2, "一二"}, {9, "一二三四五六七八九"}, {10, s}, {11, s}, {100, s},
	}
	for _, c := range cases {
		if got := runeHead(s, c.n); got != c.want {
			t.Fatalf("runeHead(%q, %d) = %q, want %q", s, c.n, got, c.want)
		}
	}
	// 截断点落在多字节字符内: 按码点完整截断, 不斩半个汉字
	wide := strings.Repeat("汉", 4500)
	if got := runeHead(wide, 4000); len(got) != 4000*len("汉") || !strings.HasSuffix(got, "汉") {
		t.Fatalf("多字节边界截断异常: 字节数 %d", len(got))
	}
}

// TestR70aProxyTransportMapBounded ⑦proxyTans 传输缓存有界化: 动态代理池只增不减
// (R57-2a 防抖)且逐条取用, 修前 proxyTans 键集随历次注入的异地址数无界增长(万级代理
// = 万级常驻 Transport); 修后超 proxyTransportCap 整表重置, 键集恒 ≤ cap; 同键命中
// 复用不触发重置(连接复用语义不回归)
func TestR70aProxyTransportMapBounded(t *testing.T) {
	c := New(rule.FetchConfig{Engine: "http", UaMode: "fixed", AllowLoopback: true})
	defer c.Close()

	proxyAt := func(i int) *url.URL {
		pu, err := url.Parse(fmt.Sprintf("http://10.%d.%d.%d:8080", (i>>16)&255, (i>>8)&255, i&255))
		if err != nil {
			t.Fatalf("proxy url: %v", err)
		}
		return pu
	}

	// 同键命中复用(未达 cap 时零重置)
	first := c.transportFor(proxyAt(0), false)
	if again := c.transportFor(proxyAt(0), false); again != first {
		t.Fatal("同键 transportFor 应复用同一 Transport(连接复用语义)")
	}

	// 注入 cap+64 个异地址: 表始终有界
	for i := 0; i < proxyTransportCap+64; i++ {
		_ = c.transportFor(proxyAt(i), false)
		c.mu.Lock()
		n := len(c.proxyTans)
		c.mu.Unlock()
		if n > proxyTransportCap {
			t.Fatalf("proxyTans 越界: %d > %d(重置守卫未生效)", n, proxyTransportCap)
		}
	}
	c.mu.Lock()
	final := len(c.proxyTans)
	c.mu.Unlock()
	// 重置语义=满即清空再续填: 第 cap+1 个异地址触发一次整表重置,
	// 终态 = (cap+64) - cap = 64 个重置后新键(有界性已由循环内逐次断言保证)。
	if final != 64 {
		t.Fatalf("重置后应只剩重置后新键 64 个: %d", final)
	}
}
