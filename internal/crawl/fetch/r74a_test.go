// ============================================================
// R74-a 回归测试 — 采集链路逐行抓虫修复面
//
//	①cfg.headers 显式 Referer × Sec-Fetch-Site 派生基不一致(不可能指纹):
//	  指纹基改为「线上实际发送的 Referer」(与 R71-a 覆写 UA 同族口径)
//	②iframe 臂 captcha 泛词误拦业务验证码组件(腾讯 TCaptcha/reCAPTCHA 以
//	  <iframe src=captcha…> 嵌在真实章节页评论区 → 长页+正常标题整页判拦丢章)
//	③确定性 5xx(501/505/508) 快速失败扩容([R73-a] 4xx 族同款语义)
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

// TestR74aCustomRefererSecFetchSiteConsistency ①指纹一致性: cfg.headers 显式 Referer
// 原样上线(契约「cfg.headers 可覆盖单项」), Sec-Fetch-Site 必须按该实发值派生 ——
// 修前按缺省臂(同源自源/无 Referer)计算, 产生「跨源 Referer + same-origin」与
// 「带 Referer + none」两类不可能指纹(真实浏览器 Sec-Fetch-Site 按实际 initiator 计算,
// 带跨源 Referer 的导航恒 cross-site, none 恒无 Referer)
func TestR74aCustomRefererSecFetchSiteConsistency(t *testing.T) {
	const customRef = "https://other.example.com/toc/1.html"
	mkSrv := func() (*r71aHeaderRecorder, *httptest.Server) {
		rec := newR71aRecorder()
		rec.add("GET /page", func(w http.ResponseWriter, r *http.Request) {
			rec.record(r)
			r73aOKPage(w, r)
		})
		return rec, rec.serve()
	}
	ctx := context.Background()

	// 形态①: 缺省同源 Referer 臂(cfg.Referer 缺省开) + 自定义跨源 Referer
	rec1, s1 := mkSrv()
	defer s1.Close()
	c1 := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r69aChromeUA,
		Headers: map[string]string{"Referer": customRef}})
	if _, err := c1.Fetch(ctx, s1.URL+"/page", ""); err != nil {
		t.Fatalf("形态①抓取失败: %v", err)
	}
	h1 := rec1.snapshot()
	if got := h1.Get("Referer"); got != customRef {
		t.Fatalf("cfg.headers Referer 应原样上线(可覆盖单项契约): got %q", got)
	}
	if got := h1.Get("Sec-Fetch-Site"); got != "cross-site" {
		t.Fatalf("跨源实发 Referer 的 Sec-Fetch-Site 应为 cross-site(修前 same-origin 不可能指纹): got %q", got)
	}
	c1.Close()

	// 形态②: cfg.Referer=false(无缺省臂) + 自定义跨源 Referer
	rec2, s2 := mkSrv()
	defer s2.Close()
	_ = rec2
	f := false
	c2 := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r69aChromeUA,
		Referer: &f,
		Headers: map[string]string{"Referer": customRef}})
	if _, err := c2.Fetch(ctx, s2.URL+"/page", ""); err != nil {
		t.Fatalf("形态②抓取失败: %v", err)
	}
	h2 := rec2.snapshot()
	if got := h2.Get("Referer"); got != customRef {
		t.Fatalf("形态② cfg.headers Referer 应原样上线: got %q", got)
	}
	if got := h2.Get("Sec-Fetch-Site"); got != "cross-site" {
		t.Fatalf("cfg.Referer=false + 自定义 Referer 的 Sec-Fetch-Site 应为 cross-site(修前 none = 带 Referer 的不可能指纹): got %q", got)
	}
	c2.Close()

	// 零变化回归: 无自定义 Referer 时缺省同源臂仍派生 same-origin(R67-a 口径)
	rec3, s3 := mkSrv()
	defer s3.Close()
	_ = rec3
	c3 := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r69aChromeUA})
	if _, err := c3.Fetch(ctx, s3.URL+"/page", ""); err != nil {
		t.Fatalf("缺省路径抓取失败: %v", err)
	}
	if got := rec3.snapshot().Get("Sec-Fetch-Site"); got != "same-origin" {
		t.Fatalf("无自定义 Referer 缺省路径应保持 same-origin(零变化回归): got %q", got)
	}
	c3.Close()
}

// TestR74aIframeBusinessCaptchaNotBlocked ②iframe 臂收敛: 业务验证码组件 iframe
// (腾讯 TCaptcha/reCAPTCHA 形态, src 含 "captcha" 词形)嵌在长内容页(评论区)不再整页
// 判拦; meta-refresh 臂与 iframe 臂的 WAF 技术指纹词(waf/challenge/jsl 边界/国产 WAF)
// 全量保持(R70-a 正例 + R72-a jsl 边界零回归)
func TestR74aIframeBusinessCaptchaNotBlocked(t *testing.T) {
	longBody := "<p>" + strings.Repeat("正文内容持续推进, 情节稳步展开。", 100) + "</p>"
	wrap := func(inner string) string {
		return `<html><head><title>第九十章 归途</title></head><body>` + inner +
			`<div>` + longBody + `</div></body></html>`
	}
	// 误伤反例: 真实章节页嵌入的业务验证码组件(修前整页判拦丢章)
	negatives := []struct{ name, inner string }{
		{"腾讯 TCaptcha 评论验证码", `<iframe src="https://t.captcha.qq.com/cap_union_prehandle?aid=123&cdata=0"></iframe>`},
		{"腾讯验证码静态域", `<iframe src="https://captcha.gtimg.com/whitespace/v3/whitespace.html"></iframe>`},
		{"Google reCAPTCHA 组件", `<iframe src="https://www.google.com/recaptcha/api2/anchor?ar=1&k=sitekey&co=aHR0cA"></iframe>`},
		{"业务站 captcha 路径组件", `<iframe src="/captcha/index?scene=comment"></iframe>`},
	}
	for _, c := range negatives {
		if got := looksBlocked(wrap(c.inner), 200, ""); got {
			t.Fatalf("%s: 业务验证码 iframe 长页不应判拦(修前 captcha 泛词误拦丢章): %s", c.name, c.inner)
		}
	}
	// 正例保持: meta-refresh 臂全词表(captcha 臂在 meta 形态保留)
	metaPositives := []struct{ name, inner string }{
		{"meta 跳 WAF captcha 端点", `<meta http-equiv="refresh" content="0;url=/waf/captcha.html">`},
		{"meta 跳 captcha 路径", `<meta http-equiv="refresh" content="0;url=/captcha?id=1">`},
		{"meta 跳 challenge 端点", `<META HTTP-EQUIV="Refresh" CONTENT="0; URL=/challenge/verify?x=1">`},
	}
	for _, c := range metaPositives {
		if got := looksBlocked(wrap(c.inner), 200, ""); !got {
			t.Fatalf("%s: 挑战二跳 meta refresh 应判拦(meta 臂全词表零回归)", c.name)
		}
	}
	// 正例保持: iframe 臂 WAF 技术指纹词(waf/challenge/jsl 边界)零回归
	iframePositives := []struct{ name, inner string }{
		{"iframe WAF 路径", `<iframe src="/waf/captcha.html" width="100%" height="600"></iframe>`},
		{"iframe 挑战域 challenge", `<iframe src="https://guard.example.com/challenge/slider"></iframe>`},
		{"iframe 加速乐边界形态", `<iframe src="/jsl/?h=abc123"></iframe>`},
		{"iframe 安全狗路径", `<iframe src="https://guard.safedog.cn/verify"></iframe>`},
	}
	for _, c := range iframePositives {
		if got := looksBlocked(wrap(c.inner), 200, ""); !got {
			t.Fatalf("%s: WAF 技术指纹 iframe 应判拦(iframe 臂收敛不伤正例)", c.name)
		}
	}
}

// TestR74aDeterministic5xxFastFail ③确定性 5xx(501/505/508)快速失败: 与请求形态/
// 服务端软件能力绑定, 同候选重试零胜率 — Retries=3 修前烧 1+3 次尝试+退避链, 修后
// 恰好 1 次请求即失败; 镜像候选不切换(镜像同构克隆, 软件能力类失败同型复现)
func TestR74aDeterministic5xxFastFail(t *testing.T) {
	var hitsPrimary, hitsMirror atomic.Int32
	srvPrimary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hitsPrimary.Add(1)
		http.Error(w, "version not supported", http.StatusHTTPVersionNotSupported) // 505
	}))
	defer srvPrimary.Close()
	srvMirror := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hitsMirror.Add(1)
		r73aOKPage(w, r)
	}))
	defer srvMirror.Close()

	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 3,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r69aChromeUA,
		MirrorDomains: strings.TrimPrefix(srvMirror.URL, "http://")})
	defer c.Close()

	start := time.Now()
	_, err := c.Fetch(context.Background(), srvPrimary.URL+"/x", "")
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("确定性 5xx(505) 应快速失败, 耗时 %v(修前烧满退避链)", elapsed)
	}
	var statusErr *httpStatusError
	if !errors.As(err, &statusErr) || statusErr.code != 505 {
		t.Fatalf("错误面应为 httpStatusError{505}, got %v", err)
	}
	if got := hitsPrimary.Load(); got != 1 {
		t.Fatalf("505 应首击即失败(不再重试), 主 host 请求数 got %d", got)
	}
	if got := hitsMirror.Load(); got != 0 {
		t.Fatalf("505 不应切换镜像(镜像同构克隆同型复现), 镜像请求数 got %d", got)
	}
}

// TestR74aDeterministic5xxStatusTable 状态白名单表: 501/505/508 快速失败;
// 502/503/504/522/524(瞬态)与 403/429(WAF/限流)/408/412/425(挑战/cookie 面)保持可重试;
// R73-a 4xx 族(400/401/405/410/414/431/451)零回归
func TestR74aDeterministic5xxStatusTable(t *testing.T) {
	for _, code := range []int{400, 401, 405, 410, 414, 431, 451, 501, 505, 508} {
		if !deterministicNoRetryStatus(code) {
			t.Fatalf("确定性状态 %d 应快速失败", code)
		}
	}
	for _, code := range []int{402, 403, 406, 407, 408, 409, 412, 413, 415, 416, 418, 421, 422, 423, 424, 425, 426, 428, 429, 500, 502, 503, 504, 511, 522, 524} {
		if deterministicNoRetryStatus(code) {
			t.Fatalf("可重试状态 %d 不应进入快速失败白名单(瞬态/挑战/WAF 面)", code)
		}
	}
}

// TestR74aTransient5xxStillRetried 边界回归: 瞬态 5xx(502)保持既有重试语义 —
// Retries=1 恰好 2 次尝试(快速失败扩容不误伤瞬态面)
func TestR74aTransient5xxStillRetried(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		http.Error(w, "bad gateway", http.StatusBadGateway)
	}))
	defer srv.Close()

	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 1,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r69aChromeUA})
	defer c.Close()

	_, err := c.Fetch(context.Background(), srv.URL+"/x", "")
	var statusErr *httpStatusError
	if !errors.As(err, &statusErr) || statusErr.code != 502 {
		t.Fatalf("错误面应为 httpStatusError{502}, got %v", err)
	}
	if got := hits.Load(); got != 2 {
		t.Fatalf("瞬态 5xx(502) 应保持 1+Retries 次尝试, got %d", got)
	}
}
