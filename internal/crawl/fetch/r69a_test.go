// ============================================================
// R69-a 回归测试 — fetch/utls/blockcheck 逐行抓虫修复面 + 反反爬增强
//
//	①parseRetryAfter 纯数字溢出按钳制上限采纳(修前误判非法兜底 30s)
//	②FetchBinary 子资源指纹形态(<img>: Dest=image/Mode=no-cors/无 User/图片 Accept)
//	③FetchBinary HTML 壳守卫(text/html 拦截壳拒入库; 位图魔数豁免零误伤)
//	④connectTunnel CONNECT 往返感知 ctx deadline(修前已取消请求仍挂满 30s)
//	⑤blockcheck 词表扩充(CF _cf_chl_opt/cf-error-details/1015/1020 + 中文限频变体)
//	⑥utls ClientHello 规格轮换(env MHGL_TLSFP_ROTATE, host 稳定归档)
//	⑦setRateLimited 冷却伴随节奏放宽(×1.5 钳 cap; baseGap=0 零作用)
//
// ============================================================
package fetch

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	utls "github.com/refraction-networking/utls"

	"mhgl/internal/crawl/rule"
)

const r69aChromeUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"

// TestR69aParseRetryAfterOverflowClampsToMax ①纯数字但溢出 int64: 显式超大秒数按
// 钳制上限 120s 采纳(TS parseInt→钳口径); 修前 Atoi 失败误判非法 → 兜底 30s,
// 对持续限流主机过早重撞
func TestR69aParseRetryAfterOverflowClampsToMax(t *testing.T) {
	d, ok := parseRetryAfter("99999999999999999999", time.Now())
	if !ok {
		t.Fatal("纯数字溢出应按显式合法值采纳(ok=true)")
	}
	if d != retryAfterMax {
		t.Fatalf("溢出值应按上限采纳: got %v, want %v", d, retryAfterMax)
	}
	if got := retryAfterCooldown(d, true); got != retryAfterMax {
		t.Fatalf("cooldown 应钳 120s: got %v", got)
	}
}

// TestR69aBinaryFetchSubresourceFingerprint ②二进制抓取按 <img> 子资源形态发头:
// Dest=image/Mode=no-cors/无 Sec-Fetch-User/图片 Accept; 对照 HTML 抓取保持
// document 导航形态(修前封面请求发导航头组, 子资源上 Sec-Fetch-User 即非浏览器指纹)
func TestR69aBinaryFetchSubresourceFingerprint(t *testing.T) {
	var mu sync.Mutex
	last := http.Header{}
	record := func(r *http.Request) {
		mu.Lock()
		last = r.Header.Clone()
		mu.Unlock()
	}
	snapshot := func() http.Header {
		mu.Lock()
		defer mu.Unlock()
		return last
	}
	png := []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /cover.jpg", func(w http.ResponseWriter, r *http.Request) {
		record(r)
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(png)
	})
	mux.HandleFunc("GET /page", func(w http.ResponseWriter, r *http.Request) {
		record(r)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<html><head><title>正常页</title></head><body>" + strings.Repeat("内容。", 120) + "</body></html>"))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	cfg := rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2,
		UaMode: "custom", CustomUa: r69aChromeUA}
	c := New(cfg)
	defer c.Close()

	ctx := context.Background()
	if _, _, err := c.FetchBinary(ctx, srv.URL+"/cover.jpg"); err != nil {
		t.Fatalf("二进制抓取: %v", err)
	}
	h := snapshot()
	if got := h.Get("Sec-Fetch-Dest"); got != "image" {
		t.Fatalf("二进制请求 Sec-Fetch-Dest = %q, want image(<img> 子资源形态)", got)
	}
	if got := h.Get("Sec-Fetch-Mode"); got != "no-cors" {
		t.Fatalf("二进制请求 Sec-Fetch-Mode = %q, want no-cors", got)
	}
	if got := h.Get("Sec-Fetch-User"); got != "" {
		t.Fatalf("二进制请求不应携带 Sec-Fetch-User(仅导航请求上线): %q", got)
	}
	if got := h.Get("Accept"); !strings.HasPrefix(got, "image/avif") {
		t.Fatalf("二进制请求 Accept 应为图片家族形态: %q", got)
	}
	if h.Get("sec-ch-ua") == "" {
		t.Fatal("图片子资源仍应携带 sec-ch-ua(真实浏览器行为)")
	}

	// 对照: HTML 抓取保持 document 导航形态
	if _, err := c.Fetch(ctx, srv.URL+"/page", ""); err != nil {
		t.Fatalf("HTML 抓取: %v", err)
	}
	h = snapshot()
	if got := h.Get("Sec-Fetch-Dest"); got != "document" {
		t.Fatalf("HTML 请求 Sec-Fetch-Dest = %q, want document", got)
	}
	if got := h.Get("Sec-Fetch-User"); got != "?1" {
		t.Fatalf("HTML 请求 Sec-Fetch-User = %q, want ?1", got)
	}
	if got := h.Get("Accept"); !strings.Contains(got, "text/html") {
		t.Fatalf("HTML 请求 Accept 应为 HTML 家族形态: %q", got)
	}
}

// TestR69aFetchBinaryHTMLShellGuard ③封面 HTML 壳守卫: 200+text/html 拦截壳报错
// 不作为图片返回(修前挑战壳 HTML 被 base64 成 corrupt 封面); 位图魔数豁免 —
// 真图即使被滑头源站以 text/html 头发出仍放行
func TestR69aFetchBinaryHTMLShellGuard(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /shell", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>"))
	})
	mux.HandleFunc("GET /real", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10})
	})
	mux.HandleFunc("GET /jpeg-as-html", func(w http.ResponseWriter, r *http.Request) {
		// 滑头源站: 真图配错头(text/html) — 魔数豁免放行
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, Retries: 0,
		AllowLoopback: true, GlobalConcurrency: 2, UaMode: "custom", CustomUa: r69aChromeUA})
	defer c.Close()
	ctx := context.Background()

	if _, _, err := c.FetchBinary(ctx, srv.URL+"/shell"); err == nil {
		t.Fatal("200 HTML 拦截壳应报错, 不得当图片返回(修前被 base64 成 corrupt 封面)")
	}
	data, ct, err := c.FetchBinary(ctx, srv.URL+"/real")
	if err != nil || len(data) == 0 || !strings.Contains(ct, "image/jpeg") {
		t.Fatalf("正常图片抓取应成功: data=%d ct=%q err=%v", len(data), ct, err)
	}
	data2, _, err := c.FetchBinary(ctx, srv.URL+"/jpeg-as-html")
	if err != nil || len(data2) == 0 {
		t.Fatalf("text/html 头+位图魔数应经魔数豁免放行(零误伤): %v", err)
	}
}

// TestR69aConnectTunnelHonorsCtxDeadline ④CONNECT 往返感知 ctx deadline:
// 假代理接受连接后不作 CONNECT 响应, ctx 300ms 截止 — 修前固定 30s 硬超时
// 不感知 ctx, 已取消请求的 CONNECT 往返仍挂满 30s 占住拨号槽
func TestR69aConnectTunnelHonorsCtxDeadline(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			// 仅收养不响应, 制造 CONNECT 往返悬挂(测试退出随进程回收)
			go func(c net.Conn) {
				buf := make([]byte, 4096)
				for {
					if _, err := c.Read(buf); err != nil {
						return
					}
				}
			}(conn)
		}
	}()

	pu, err := url.Parse("http://" + ln.Addr().String())
	if err != nil {
		t.Fatalf("proxy url: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err = connectTunnel(ctx, pu, "203.0.113.1:443")
	el := time.Since(start)
	if err == nil {
		t.Fatal("无 CONNECT 响应应报错")
	}
	if el > 10*time.Second {
		t.Fatalf("connectTunnel 未感知 ctx deadline: 耗时 %v(修前挂满 30s 硬超时)", el)
	}
}

// TestR69aBlockMarkerAdditions ⑤词表扩充回归: CF 2021+ 挑战内联配置/错误页容器/
// 硬限流字面文案强标记无豁免(长页+正常标题仍判拦, 证明命中是新标记而非短壳规则);
// 中文限频变体弱标记短壳判拦+长页正常标题豁免不误伤
func TestR69aBlockMarkerAdditions(t *testing.T) {
	longBody := strings.Repeat("正文内容持续推进, 情节稳步展开。", 80) // ≥1200 码点
	cases := []struct {
		name string
		html string
		want bool
	}{
		{
			name: "强标记: _cf_chl_opt 挑战内联配置(长页正常标题仍判拦)",
			html: `<html><head><title>第十二章 破阵</title></head><body><div>` + longBody +
				`<script>window._cf_chl_opt={"cRay":"abc"};</script></div></body></html>`,
			want: true,
		},
		{
			name: "强标记: cf-error-details 错误页容器(长页正常标题仍判拦)",
			html: `<html><head><title>第十三章 突破</title></head><body><div class="cf-error-details">` + longBody + `</div></body></html>`,
			want: true,
		},
		{
			name: "强标记: CF 硬限流字面文案 1015(长页正常标题仍判拦)",
			html: `<html><head><title>第十四章 备战</title></head><body><div>` + longBody + `error code: 1015</div></body></html>`,
			want: true,
		},
		{
			name: "强标记: CF 防火墙拦截 1020(长页正常标题仍判拦)",
			html: `<html><head><title>第十五章 决战</title></head><body><div>` + longBody + `error code: 1020</div></body></html>`,
			want: true,
		},
		{
			name: "弱标记变体: 请求过于频繁 短壳判拦",
			html: `<html><body>请求过于频繁, 请稍后再试</body></html>`,
			want: true,
		},
		{
			name: "弱标记变体: 操作过于频繁 短壳判拦",
			html: `<html><body>操作过于频繁, 请稍后再试</body></html>`,
			want: true,
		},
		{
			name: "弱标记变体: 访问频率过高 短壳判拦",
			html: `<html><body>访问频率过高, 请稍后重试</body></html>`,
			want: true,
		},
		{
			name: "弱标记变体: 长页正常标题豁免不误伤(n≥1200)",
			html: `<html><head><title>第十六章 归途</title></head><body><div>` +
				strings.Repeat("主角闭关修炼, 气息流转不息, 境界稳步提升。", 60) +
				`(旁白提及: 若操作过于频繁将触发护阵反弹)</div></body></html>`,
			want: false,
		},
	}
	for _, c := range cases {
		if got := looksBlocked(c.html, 200, ""); got != c.want {
			t.Fatalf("%s: looksBlocked = %v, want %v", c.name, got, c.want)
		}
	}
}

// TestR69aUTLSProfileRotation ⑥ClientHello 规格轮换(env opt-in):
// 关 = 恒 HelloChrome_Auto(既有口径); 开 = host 稳定归档三档(同 host 恒同档,
// 异 host 均摊 ≥2 档), 且握手+ALPN 钉 http/1.1 语义不随档位漂移
func TestR69aUTLSProfileRotation(t *testing.T) {
	t.Run("轮换关_恒单规格", func(t *testing.T) {
		prev := utlsRotateEnabled
		utlsRotateEnabled = false
		t.Cleanup(func() { utlsRotateEnabled = prev })
		for _, h := range []string{"a.com", "b.com", "c.com"} {
			if got := utlsProfileFor(h); got != utlsHelloID {
				t.Fatalf("轮换关应恒 utlsHelloID: host=%s got %+v", h, got)
			}
		}
	})
	t.Run("轮换开_host稳定归档", func(t *testing.T) {
		prev := utlsRotateEnabled
		utlsRotateEnabled = true
		t.Cleanup(func() { utlsRotateEnabled = prev })
		if got := utlsProfileFor("stable.example.com"); got != utlsProfileFor("stable.example.com") {
			t.Fatal("同 host 应恒同档(会话一致性口径)")
		}
		distinct := map[utls.ClientHelloID]bool{}
		for i := 0; i < 64; i++ {
			p := utlsProfileFor(r69aHostN(i))
			inSet := false
			for _, cand := range utlsRotateProfiles {
				if p == cand {
					inSet = true
					break
				}
			}
			if !inSet {
				t.Fatalf("归档结果越出档位集: %+v", p)
			}
			distinct[p] = true
		}
		if len(distinct) < 2 {
			t.Fatalf("64 个异 host 仅命中 %d 档 — 轮换未打散", len(distinct))
		}
	})
	t.Run("轮换开_握手语义不漂移", func(t *testing.T) {
		useInsecureUTLSConfig(t)
		prev := utlsRotateEnabled
		utlsRotateEnabled = true
		t.Cleanup(func() { utlsRotateEnabled = prev })
		srv, probe := newTLSPageServer(t)
		host := strings.TrimPrefix(srv.URL, "https://")
		h, _, err := net.SplitHostPort(host)
		if err != nil {
			t.Fatalf("拆分 host: %v", err)
		}
		conn, err := net.DialTimeout("tcp", host, 5*time.Second)
		if err != nil {
			t.Fatalf("TCP 拨号: %v", err)
		}
		defer conn.Close()
		uconn, err := utlsHandshake(context.Background(), conn, h)
		if err != nil {
			t.Fatalf("轮换档位下 utls 握手: %v", err)
		}
		defer uconn.Close()
		// 握手后手写 HTTP/1.1 请求完成往返(命中 /page 使服务端记录 TLS 协商)
		req := "GET /page HTTP/1.1\r\nHost: " + host + "\r\nConnection: close\r\n\r\n"
		if _, err := uconn.Write([]byte(req)); err != nil {
			t.Fatalf("写请求: %v", err)
		}
		buf := make([]byte, 8192)
		total := 0
		for total < len(buf) {
			n, rerr := uconn.Read(buf[total:])
			total += n
			if rerr != nil {
				break
			}
		}
		if !strings.Contains(string(buf[:total]), "utls 测试页") {
			t.Fatalf("轮换档位下 HTTP 往返失败: %q", string(buf[:total]))
		}
		if uc, ok := uconn.(*utls.UConn); !ok || uc.ConnectionState().NegotiatedProtocol != "http/1.1" {
			t.Fatalf("ALPN 钉 http/1.1 应不随档位漂移: %T", uconn)
		}
		if got, _ := probe.snapshot(); got != "http/1.1" {
			t.Fatalf("服务端协商协议 = %q, want http/1.1", got)
		}
	})
}

// TestR69aSetRateLimitedWidensPacing ⑦限流冷却伴随节奏放宽: ×1.5 钳 gateGapCap,
// 成功归位基准; baseGap=0(未注入节奏)零作用不制造节奏
func TestR69aSetRateLimitedWidensPacing(t *testing.T) {
	c := New(rule.FetchConfig{Engine: "http", UaMode: "fixed", AllowLoopback: true})
	defer c.Close()
	c.SetHostGap(100 * time.Millisecond)
	g := c.gateFor("rl.example.com:443")
	g.setRateLimited(50 * time.Millisecond)
	g.mu.Lock()
	minGap, untilSet := g.minGap, !g.rateLimitedUntil.IsZero()
	g.mu.Unlock()
	if minGap != 150*time.Millisecond {
		t.Fatalf("限流后 minGap = %v, want 150ms(×1.5 冷却伴随放宽)", minGap)
	}
	if !untilSet {
		t.Fatal("冷却窗应被置位")
	}
	// 连续限流: ×1.5 累进但钳 gateGapCap
	for i := 0; i < 30; i++ {
		g.mu.Lock()
		g.rateLimitedUntil = time.Time{}
		g.mu.Unlock()
		g.setRateLimited(50 * time.Millisecond)
	}
	g.mu.Lock()
	minGap = g.minGap
	g.mu.Unlock()
	if minGap > gateGapCap {
		t.Fatalf("放宽应钳 gateGapCap(%v), 实际 %v", gateGapCap, minGap)
	}
	// 成功归位基准
	g.noteSuccess()
	g.mu.Lock()
	minGap = g.minGap
	g.mu.Unlock()
	if minGap != 100*time.Millisecond {
		t.Fatalf("成功后 minGap 应归位 100ms, 实际 %v", minGap)
	}
	// baseGap=0: 冷却不制造节奏
	c2 := New(rule.FetchConfig{Engine: "http", UaMode: "fixed", AllowLoopback: true})
	defer c2.Close()
	g2 := c2.gateFor("x.example.com")
	g2.setRateLimited(time.Second)
	g2.mu.Lock()
	minGap2 := g2.minGap
	g2.mu.Unlock()
	if minGap2 != 0 {
		t.Fatalf("baseGap=0 时冷却不应制造节奏, minGap = %v", minGap2)
	}
	// 非法时长: 零作用
	g.setRateLimited(0)
	g.mu.Lock()
	minGap = g.minGap
	g.mu.Unlock()
	if minGap != 100*time.Millisecond {
		t.Fatalf("d<=0 冷却应零作用, minGap = %v", minGap)
	}
}

// TestR69aIsImageMagic 位图魔数判定边界(空体/截断/各家族)
func TestR69aIsImageMagic(t *testing.T) {
	cases := []struct {
		name string
		body []byte
		want bool
	}{
		{"空体", nil, false},
		{"jpeg 魔数截断", []byte{0xFF, 0xD8}, false},
		{"jpeg", []byte{0xFF, 0xD8, 0xFF, 0xE0}, true},
		{"png", []byte{0x89, 'P', 'N', 'G'}, true},
		{"gif", []byte{'G', 'I', 'F', '8'}, true},
		{"webp", []byte{'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P'}, true},
		{"bmp", []byte{'B', 'M', 0, 0}, true},
		{"html 文本", []byte("<html>"), false},
	}
	for _, c := range cases {
		if got := isImageMagic(c.body); got != c.want {
			t.Fatalf("%s: isImageMagic = %v, want %v", c.name, got, c.want)
		}
	}
}

// TestR69aEnvTruthy 环境变量真值判定(轮换开关解析面)
func TestR69aEnvTruthy(t *testing.T) {
	t.Setenv(EnvTLSFPRotate, "")
	if isTruthyEnv(EnvTLSFPRotate) {
		t.Fatal("空值应为假")
	}
	t.Setenv(EnvTLSFPRotate, "1")
	if !isTruthyEnv(EnvTLSFPRotate) {
		t.Fatal("1 应为真")
	}
	t.Setenv(EnvTLSFPRotate, " TRUE ")
	if !isTruthyEnv(EnvTLSFPRotate) {
		t.Fatal("TRUE(含空白)应为真")
	}
	t.Setenv(EnvTLSFPRotate, "off")
	if isTruthyEnv(EnvTLSFPRotate) {
		t.Fatal("off 应为假")
	}
}

// r69aHostN 测试用异构 host 生成(保证 64 次输入互异)
func r69aHostN(i int) string {
	return "host-" + itoa(i) + "-xyz.example.com"
}

// itoa 测试用小整数十进制(免引 strconv 噪音)
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
