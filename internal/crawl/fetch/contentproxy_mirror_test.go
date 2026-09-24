// ============================================================
// [R63-c] contentProxy 内部通道镜像隔离单测
//
//	复现 bqg713 实配形态(contentProxyUrl=127.0.0.1:3010/unlock?url={url} +
//	mirrorDomains=源站镜像域 并存): 修前 rawFetch 对 contentProxy URL 应用
//	mirrorGroup —— 主代理失败一次即把 /unlock?url= 探针打向镜像域
//	(烧源站配额+泄漏 unlock 代理形态), 且镜像站返回的 200 纯文本会被
//	contentProxy 通道当正文采纳(内容污染)。修后内部通道(loopbackExempt)
//	不做镜像组展开: 镜像域零请求。
//
// ============================================================
package fetch

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"mhgl/internal/crawl/rule"
)

func TestContentProxyNoMirrorRotation(t *testing.T) {
	// 镜像站: 返回 200 纯文本 POLLUTED(修前会被 contentProxy 通道包进 <p> 当正文)
	var mirrorHits int32
	mirrorSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&mirrorHits, 1)
		_, _ = w.Write([]byte("POLLUTED-MIRROR-HTML"))
	}))
	defer mirrorSrv.Close()

	// 主 contentProxy: 恒 500(模拟 unlock 转换代理重启窗口)
	proxySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer proxySrv.Close()

	c := New(rule.FetchConfig{
		Engine:          "http",
		Timeout:         1000,
		Retries:         0, // attempts=1: 主代理一败即换候选(修前即命中镜像)
		AllowLoopback:   true,
		ContentProxyURL: proxySrv.URL + "/unlock?url={url}",
		MirrorDomains:   mirrorSrv.Listener.Addr().String(), // 镜像域=可回环测试服(可观测请求)
	})
	defer c.Close()

	res, err := c.FetchContent(context.Background(), "http://target.example/book/1.html")
	// 修后: 镜像零请求; 主代理 500 → 降级直连 target.example(DNS 不可达) → 最终错误
	if err == nil {
		t.Fatalf("主代理 500+直连不可达应报错; got res.HTML=%q", res.HTML)
	}
	if n := atomic.LoadInt32(&mirrorHits); n != 0 {
		t.Fatalf("contentProxy 请求被镜像域轮换污染: 镜像收到 %d 次请求(应为 0)", n)
	}
}

// TestContentProxyMirrorStillWorksForNormalFetch 反向对照: 普通内容抓取(非内部通道)
// 的镜像组语义不受本修影响 —— 主域失败仍应切换镜像域
func TestContentProxyMirrorStillWorksForNormalFetch(t *testing.T) {
	var primaryHits, mirrorHits int32
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&primaryHits, 1)
		http.Error(w, "down", http.StatusInternalServerError)
	}))
	defer primary.Close()
	mirror := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&mirrorHits, 1)
		body := make([]byte, 400)
		for i := range body {
			body[i] = 'x' // >200B 可见文本, 防 looksBlocked 短页判定干扰断言
		}
		_, _ = w.Write(body)
	}))
	defer mirror.Close()

	c := New(rule.FetchConfig{
		Engine:        "http",
		Timeout:       1000,
		Retries:       0,
		AllowLoopback: true,
		MirrorDomains: mirror.Listener.Addr().String(),
	})
	defer c.Close()

	res, err := c.Fetch(context.Background(), "http://"+primary.Listener.Addr().String()+"/book/1.html", "")
	if err != nil {
		t.Fatalf("镜像切换应成功: %v", err)
	}
	if atomic.LoadInt32(&mirrorHits) == 0 {
		t.Fatalf("普通抓取的镜像切换不应受内部通道隔离影响")
	}
	if atomic.LoadInt32(&primaryHits) == 0 {
		t.Fatalf("主域应先被尝试")
	}
	_ = res
}
