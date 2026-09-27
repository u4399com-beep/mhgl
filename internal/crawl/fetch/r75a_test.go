// ============================================================
// R75-a 回归测试 — 采集链路长稳/反反爬增量
//
//	①[真虫] Cookie jar 无 PublicSuffixList: Domain=公共后缀跨站 Cookie 污染
//	 (浏览器 PSL 语义缺口 — 任一响应可经 Domain=com/.co.uk 把 Cookie 爬坡到
//	 同后缀全部无关域, 重定向链/镜像域共享 jar 的会话跨站泄漏面)
//	②[增强] 传输层 h1 钉扎: 直连+代理传输 TLSNextProto 空表(标准库文档化的
//	 h2 停用开关) — 与 utls 路径「协商出非 h1 即失败」的既有决策口径一致
//	③[增强] httpStatusError 错误串携带最终 URL 片段(任务日志/lastError 消费面
//	 可观测性: 纯 "HTTP 403" 无法定位候选)
//	④[真虫] blockcheck 泛词降档: "正在进行安全验证"/"安全驗證" 强→弱
//	 (虚构正文碰撞整页误拦; 盾页检测由短语级词条+短壳弱臂保留)
//	⑤[增强] 弱标记补 "请完成验证" 短壳漏判
//
// ============================================================
package fetch

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"mhgl/internal/crawl/rule"
)

// ---------------- ① Cookie jar PSL 语义 ----------------

// TestR75aCookieJarPublicSuffixScope PSL 缺口: 公共后缀 Domain Cookie 必须被拒收,
// 不得跨站爬坡泄漏到无关域(修前 nil PSL: evil.com 可 Set-Cookie Domain=com,
// 该 Cookie 随后出现在对任意 .com 目标的请求里 — 浏览器 RFC 6265 §5.3 #5 拒收语义)
func TestR75aCookieJarPublicSuffixScope(t *testing.T) {
	c := New(rule.FetchConfig{Engine: "http", Timeout: 500})
	t.Cleanup(c.Close)

	// TLD 级爬坡: evil.com 下发 Domain=com
	mustSet := func(rawURL string, ck *http.Cookie) {
		t.Helper()
		u, err := url.Parse(rawURL)
		if err != nil {
			t.Fatalf("URL 解析失败: %v", err)
		}
		c.jar.SetCookies(u, []*http.Cookie{ck})
	}
	mustSet("https://evil.com/", &http.Cookie{Name: "poison", Value: "1", Domain: "com"})
	victim, _ := url.Parse("https://victim.com/")
	if got := c.jar.Cookies(victim); len(got) > 0 {
		t.Fatalf("公共后缀 Domain=com Cookie 泄漏到无关域 victim.com: %v", got)
	}

	// 多段公共后缀: a.co.uk 下发 Domain=co.uk 不得泄漏给 b.co.uk
	mustSet("https://a.co.uk/", &http.Cookie{Name: "ukleak", Value: "1", Domain: "co.uk"})
	b, _ := url.Parse("https://b.co.uk/")
	if got := c.jar.Cookies(b); len(got) > 0 {
		t.Fatalf("公共后缀 Domain=co.uk Cookie 泄漏到 b.co.uk: %v", got)
	}

	// 正例保持: 注册域级 Domain Cookie 跨子域共享(镜像域/挑战 Cookie 重放依赖此语义)
	mustSet("https://a.example.com/", &http.Cookie{Name: "site", Value: "1", Domain: "example.com"})
	bb, _ := url.Parse("https://b.example.com/")
	found := false
	for _, ck := range c.jar.Cookies(bb) {
		if ck.Name == "site" {
			found = true
		}
	}
	if !found {
		t.Fatal("注册域级 Domain=example.com Cookie 应继续跨子域共享(PSL 不得误伤)")
	}

	// 正例保持: host-only Cookie 仅同 host 命中
	mustSet("https://only.host.example/", &http.Cookie{Name: "ho", Value: "1"})
	other, _ := url.Parse("https://other.host.example/")
	for _, ck := range c.jar.Cookies(other) {
		if ck.Name == "ho" {
			t.Fatal("host-only Cookie 泄漏到兄弟 host")
		}
	}
}

// ---------------- ② h1 钉扎 ----------------

// TestR75aTransportsPinnedToH1 全部面向源站的传输 TLSNextProto 非空空表
// (net/http 文档: "Setting TLSNextProto to an empty map is a documented way to
// disable HTTP/2") — 直连传输不再依赖 go1.26 自定义拨号器的保守豁免分支
// (旧版工具链该分支不含 DialContext, 行为随版本漂移); 代理传输修前裸 Transport
// 会自动启用内建 h2(Go 默认 SETTINGS/HPACK 指纹与浏览器不可弥合), 钉 h1 与
// utls 路径「协商出非 h1 即刻失败」口径一致
func TestR75aTransportsPinnedToH1(t *testing.T) {
	c := New(rule.FetchConfig{Engine: "http", Timeout: 500})
	t.Cleanup(c.Close)

	direct, ok := c.hc.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("直连传输类型异常: %T", c.hc.Transport)
	}
	if direct.TLSNextProto == nil {
		t.Fatal("直连传输应钉扎 h1(TLSNextProto 空表), 修前依赖工具链保守分支且代理路径无钉扎")
	}

	pu, _ := url.Parse("http://10.0.0.1:8080")
	tr := c.transportFor(pu, true) // httpsTarget + tlsfp 关(生产缺省)
	if tr.TLSNextProto == nil {
		t.Fatal("代理 https 传输应钉扎 h1: 修前裸 Transport 自动启用内建 h2(Go 默认 h2 指纹)")
	}

	c2 := New(rule.FetchConfig{Engine: "http", Timeout: 500, TLSFingerprint: "chrome"})
	t.Cleanup(c2.Close)
	tr2 := c2.transportFor(pu, true) // utls 隧道形态(既有口径自带空表)
	if tr2.TLSNextProto == nil {
		t.Fatal("utls 形态传输应保持 h1 钉扎(既有口径回归)")
	}
}

// ---------------- ③ httpStatusError URL 上下文 ----------------

// TestR75aHttpStatusErrorCarriesURL 状态错误串必须可定位(任务日志消费面):
// "HTTP 400 (最终 URL)" — 修前纯 "HTTP 400", 批量任务日志无法区分是哪个候选失败
func TestR75aHttpStatusErrorCarriesURL(t *testing.T) {
	var hit int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hit++
		http.Error(w, "bad request shell", http.StatusBadRequest)
	}))
	t.Cleanup(srv.Close)

	c := New(rule.FetchConfig{Engine: "http", Timeout: 2000, Retries: 0, GlobalConcurrency: 1, HostGateLimit: 1, AllowLoopback: true})
	t.Cleanup(c.Close)

	target := srv.URL + "/c/1.html"
	_, err := c.Fetch(context.Background(), target, "")
	if err == nil {
		t.Fatal("400 应计失败")
	}
	var se *httpStatusError
	if !errors.As(err, &se) || se.code != 400 {
		t.Fatalf("应返回 httpStatusError{400}: %v", err)
	}
	if !strings.Contains(err.Error(), "HTTP 400") {
		t.Fatalf("错误串应含状态码: %q", err.Error())
	}
	if !strings.Contains(err.Error(), "/c/1.html") {
		t.Fatalf("错误串应携带最终 URL 片段(修前纯 'HTTP 400'): %q", err.Error())
	}
}

// ---------------- ④ blockcheck 泛词降档 ----------------

// r75aLongNormalPage 正常标题长页(>1200 码点, 驱动「长页+正常标题」豁免)
func r75aLongNormalPage(title, bodyInject string) string {
	body := strings.Repeat("正文内容持续推进, 情节稳步展开。", 100) // ≥1200 码点
	return `<html><head><title>` + title + `</title></head><body><div>` + body + bodyInject + `</div></body></html>`
}

// TestR75aGenericCjkPhraseDowngradeToWeak 泛词降档: 虚构正文含 "正在进行安全验证"/
// "安全驗證" 的长页+正常标题不得整页判拦(修前强标记命中 → 等价 403 计失败链 →
// 章节丢采+连败链推进, 与 R74-a iframe 臂 captcha 误拦同族); 盾页检测由弱臂保留
func TestR75aGenericCjkPhraseDowngradeToWeak(t *testing.T) {
	// 误伤反例: 长页+正常标题 + 泛词入文 → 豁免放行
	for _, phrase := range []string{"正在进行安全验证", "安全驗證"} {
		page := r75aLongNormalPage("第七十二章 机关", "门禁系统提示: "+phrase+"。")
		if got := looksBlocked(page, 200, ""); got {
			t.Fatalf("泛词 %q 入文的长页+正常标题应豁免放行(修前强标记整页判拦丢章)", phrase)
		}
	}

	// 盾页保留: 短壳(500~1200 码点, 标题不在盾页黑名单, 绕过空壳/极短臂)命中弱标记仍判拦
	shellOf := func(marker string) string {
		return `<html><head><title>站点提示</title></head><body><div>` + marker +
			`已暂停本次访问` + strings.Repeat("详情请联系管理员处理。", 25) + `</div></body></html>`
	}
	for _, phrase := range []string{"正在进行安全验证", "安全驗證"} {
		if got := looksBlocked(shellOf(phrase), 200, ""); !got {
			t.Fatalf("短壳含 %q 应经弱臂判拦(降档不得丢盾页检测)", phrase)
		}
	}

	// 强词条保留: 短语级/服务声明词条长页+正常标题仍判拦(降档只动四字泛词)
	strongKeeps := []struct{ name, snip, probe string }{
		{"ixdzs 短语级盾页文案", `<div>請稍等，正在進行安全驗證...</div>`, "正在進行安全驗證"},
		{"CF 中文服务声明", `<div>本网站使用安全服务以防止受到在线攻击。</div>`, "本网站使用安全服务"},
	}
	for _, c := range strongKeeps {
		page := strings.Replace(r75aLongNormalPage("第七十三章 破阵", ""),
			"</div></body></html>", c.snip+"</div></body></html>", 1)
		if !strings.Contains(strings.ToLower(page), c.probe) {
			t.Fatalf("%s: fixture 自检失败", c.name)
		}
		if got := looksBlocked(page, 200, ""); !got {
			t.Fatalf("%s: 长页+正常标题下短语级词条应仍判拦(强标记保留回归)", c.name)
		}
	}
}

// TestR75aWeakMarkerPleaseCompleteVerify 弱标记补漏: "请完成验证" 短壳
// (200~500 码点带足可见文本绕过空壳臂, 标题不在盾页黑名单)修前穿透为正文
func TestR75aWeakMarkerPleaseCompleteVerify(t *testing.T) {
	shell := `<html><head><title>访问提示</title></head><body><div>请完成验证后继续访问本站。` +
		strings.Repeat("本站内容受版权保护。", 20) + `</div></body></html>`
	if got := looksBlocked(shell, 200, ""); !got {
		t.Fatal("『请完成验证』短壳应判拦(修前穿透)")
	}
	// 长页+正常标题不误伤(弱臂豁免语义)
	page := r75aLongNormalPage("第七十四章 收网", "长老说道: 请完成验证方可入内。")
	if got := looksBlocked(page, 200, ""); got {
		t.Fatal("『请完成验证』入文的长页+正常标题应豁免放行")
	}
}

// TestR75aChallengeRetryStillRetriesWeakShell 兜底回归: 弱标记判拦的短壳仍走
// challenge 重试链(fetch 层 Blocked 出口, 挑战预算语义零变化)
func TestR75aChallengeRetryStillRetriesWeakShell(t *testing.T) {
	oldBase := challengeBackoffBase
	challengeBackoffBase = time.Millisecond
	t.Cleanup(func() { challengeBackoffBase = oldBase })

	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&hits, 1)
		if n >= 2 { // 第二次放行正常长页
			_, _ = w.Write([]byte(r75aLongNormalPage("第一章 恢复", "")))
			return
		}
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<html><head><title>站点提示</title></head><body><div>正在进行安全验证已暂停本次访问` +
			strings.Repeat("详情请联系管理员处理。", 25) + `</div></body></html>`))
	}))
	t.Cleanup(srv.Close)
	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 2, GlobalConcurrency: 1, HostGateLimit: 1, AllowLoopback: true})
	t.Cleanup(c.Close)

	res, err := c.Fetch(context.Background(), srv.URL, "")
	if err != nil {
		t.Fatalf("挑战壳退避重试后应过关: %v", err)
	}
	if res.Blocked {
		t.Fatal("重试后正常页不得判拦")
	}
	if res.StatusCode != 200 || !strings.Contains(res.HTML, "第一章 恢复") {
		t.Fatalf("应返回重试后的正常页: %d %q", res.StatusCode, res.HTML[:40])
	}
}
