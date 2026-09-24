// ============================================================
// R64-c — API 面抓虫修复回归: sitemap Host 收口 / lastmod 空值省略
// (纯函数测试, 无 DB 依赖)
// ============================================================
package api

import (
	"strings"
	"testing"
	"time"
)

func TestValidHostHeader(t *testing.T) {
	valid := []string{
		"a.com", "a.b-c.com:443", "localhost", "localhost:3000",
		"127.0.0.1", "[::1]", "[::1]:3000", "www.example.com",
	}
	invalid := []string{
		"", "a b", "a<b>", `a"b`, `a\b`, "a.com/", "a%^b", "a|b",
		strings.Repeat("a", 254), // 超长(>253)
		"-a.com",                 // 前导连字符
		"a.com:",                 // 空端口
	}
	for _, h := range valid {
		if !validHostHeader(h) {
			t.Fatalf("validHostHeader(%q)=false, want true", h)
		}
	}
	for _, h := range invalid {
		if validHostHeader(h) {
			t.Fatalf("validHostHeader(%q)=true, want false", h)
		}
	}
}

func TestSitemapURLEntry_LastmodOmitted(t *testing.T) {
	// lastmodMS<=0 → 不再输出空 <lastmod></lastmod> 元素
	out := sitemapURLEntry("https://a.com/book/1.html", 0, "daily", "0.8")
	if strings.Contains(out, "<lastmod>") {
		t.Fatalf("lastmodMS=0 应省略 <lastmod> 元素: %q", out)
	}
	if !strings.Contains(out, "<loc>https://a.com/book/1.html</loc>") {
		t.Fatalf("loc 丢失: %q", out)
	}
	// lastmodMS>0 → W3C datetime 形态
	out = sitemapURLEntry("https://a.com/", 1700000000000, "daily", "1.0")
	want := time.UnixMilli(1700000000000).UTC().Format("2006-01-02T15:04:05Z")
	if !strings.Contains(out, "<lastmod>"+want+"</lastmod>") {
		t.Fatalf("lastmod 形态异常: %q want %q", out, want)
	}
	// loc 经 xmlEscape
	out = sitemapURLEntry(`https://a.com/?a=1&b=<2>`, 0, "daily", "0.6")
	if !strings.Contains(out, `a=1&amp;b=&lt;2&gt;`) {
		t.Fatalf("loc 未转义: %q", out)
	}
}
