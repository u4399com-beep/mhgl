// ============================================================
// R71-b 回归测试 — sanitize 逐行抓虫修复面(承接前轮中断改动收口)
//
//	①IsSafeURLValue scheme 大小写归一: "HTTP://X.COM"(浏览器合法形态, 写侧
//	　clean.isHTTPURL 亦 ToLower 放行)修前被误判 unsafe 整属性剥离, 出链 href 丢失
//	②URL 属性面扩容 srcset/cite/ping: 修前 <img srcset="javascript:..."> 完全穿透
//	　消毒面(探针实证原样保留; 纵深防御缺口)
//	③srcset 多候选逐段复验: "a.jpg 1x, javascript:x 2x" 混合候选单点检查漏判
//	④XSS 变体电池(承接草稿探针转正式断言)
//
// ============================================================
package sanitize

import (
	"strings"
	"testing"
)

// TestR71bSchemeCaseInsensitive ①scheme 大小写归一
func TestR71bSchemeCaseInsensitive(t *testing.T) {
	safe := []string{"HTTP://example.com/a", "Https://example.com/a", "HTTP://A.COM", "https://x.cn/b"}
	for _, c := range safe {
		if !IsSafeURLValue(c) {
			t.Errorf("大写 scheme 被误判 unsafe(修前丢失出链): %q", c)
		}
	}
	unsafe := []string{"JAVASCRIPT:x", "JavaScript:alert(1)", "DATA:text/html,x", "VBSscript:x"}
	for _, c := range unsafe {
		if IsSafeURLValue(c) {
			t.Errorf("危险 scheme 大小写走私被放行: %q", c)
		}
	}
	// 端到端: 大写 scheme href 保持(修前整属性剥离)
	out := ChapterHTML(`<a href="HTTPS://example.com/book/1">链接</a>正文`)
	if !strings.Contains(out, "example.com/book/1") || !strings.Contains(out, "<a ") {
		t.Errorf("大写 scheme 出链 href 被剥离: %q", out)
	}
	if !strings.Contains(out, "正文") {
		t.Errorf("正文丢失: %q", out)
	}
}

// TestR71bSrcsetHardening ②③srcset/cite/ping 消毒
func TestR71bSrcsetHardening(t *testing.T) {
	// js: srcset 整属性剥离
	out := ChapterHTML(`<img srcset="javascript:alert(1)">正文`)
	if strings.Contains(strings.ToLower(out), "javascript:") {
		t.Errorf("srcset 危险 scheme 未剥离: %q", out)
	}
	if !strings.Contains(out, "正文") {
		t.Errorf("正文丢失: %q", out)
	}
	// 混合候选: 单段危险 → 整属性剥离
	out = ChapterHTML(`<img srcset="a.jpg 1x, javascript:x 2x">图`)
	if strings.Contains(strings.ToLower(out), "javascript:") {
		t.Errorf("srcset 混合候选漏判: %q", out)
	}
	// 正常多候选保持
	out = ChapterHTML(`<img srcset="a.jpg 1x, b.jpg 2x">图`)
	if !strings.Contains(out, "a.jpg") || !strings.Contains(out, "b.jpg") {
		t.Errorf("正常 srcset 被误剥: %q", out)
	}
	// cite/ping 危险值剥离
	out = ChapterHTML(`<blockquote cite="javascript:x">引</blockquote><a ping="javascript:y">p</a>文`)
	if strings.Contains(strings.ToLower(out), "javascript:") {
		t.Errorf("cite/ping 危险 scheme 未剥离: %q", out)
	}
}

// TestR71bXSSVariants ④XSS 变体电池(承接草稿探针转正式断言)
func TestR71bXSSVariants(t *testing.T) {
	variants := []string{
		`<a href="java&Tab;script:alert(1)">x</a>`,
		`<a href="&#x6A;avascript:alert(1)">x</a>`,
		`<a href="jav&#x0D;ascript:alert(1)">x</a>`,
		`<a href=" &#14; javascript:alert(1)">x</a>`,
		`<a href="jAvAsCrIpT&#x3a;alert(1)">x</a>`,
		`<a href="&NewLine;javascript:alert(1)">x</a>`,
		`<a href="javascript&NewLine;:alert(1)">x</a>`,
		`<form action="javascript:alert(1)"><input></form>正文`,
		`<svg><script>alert(1)</script></svg>ok`,
		`<a href="javascript&#0000058alert(1)">x</a>`,
		`<img src="javascript:alert(1)">`,
	}
	for _, v := range variants {
		out := strings.ToLower(ChapterHTML(v))
		if strings.Contains(out, "javascript:") || strings.Contains(out, "onerror=") ||
			strings.Contains(out, "<script") {
			t.Errorf("XSS 变体穿透: in=%q out=%q", v, out)
		}
	}
}
