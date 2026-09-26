// ============================================================
// R67-c — internal/sanitize 公共包回归
// (正文消毒器自 web 下沉后的独立回归面; bypass 向量全集在 web_test.go 保留)
// ============================================================
package sanitize

import (
	"strings"
	"testing"
)

// TestChapterHTML_DangerousStripped 危险面剥离(script 块/on* 属性/出链 scheme 白名单外)。
func TestChapterHTML_DangerousStripped(t *testing.T) {
	in := `<p>正文</p><script>alert(1)</script><img src=x onerror=alert(1)>` +
		`<a href="javascript:alert(1)">x</a><a href="jav&#x09;ascript:alert(1)">y</a>` +
		`<iframe src="https://evil"></iframe>尾段`
	out := ChapterHTML(in)
	for _, bad := range []string{"alert(1)", "onerror", "javascript", "ascript:", "iframe", "evil"} {
		if strings.Contains(strings.ToLower(out), strings.ToLower(bad)) {
			t.Fatalf("消毒泄漏 %q: out=%q", bad, out)
		}
	}
	if !strings.Contains(out, "<p>正文</p>") || !strings.Contains(out, "尾段") {
		t.Fatalf("安全内容被误删: %q", out)
	}
}

// TestChapterHTML_NoSemicolonEntityRef [R69-c] 数字/十六进制字符引用「无分号形态」回归。
// HTML5 属性值中数字实体(&#58 / &#x3a)本就免分号合法, 浏览器正确解码为 ':';
// 修前探测解码把末位数字当分号剥掉(&#58 → chr(5)), scheme 探测失配 →
// href="javascript&#58alert(1)" 整条属性 fail-open 直通(存储型 XSS 向量)。
func TestChapterHTML_NoSemicolonEntityRef(t *testing.T) {
	// 判定面: 无分号实体走私的 scheme 必须识别为不安全
	// (十六进制形态用 prompt 载荷: 'a' 属 hex 字符会被贪婪吞并, 浏览器与探测端同口径)
	for _, u := range []string{
		"javascript&#58alert(1)",                              // 十进制无分号冒号
		"javascript&#x3aprompt(1)",                            // 十六进制无分号冒号(p 非 hex 停止)
		"javascript&#X3a;alert(1)",                            // 大写 X 前缀(有分号)
		"JAVASCRIPT&#58;alert(1)",                             // 有分号(既有口径, 防回归)
		"java&#115;cript:alert(1)", "java&#115cript:alert(1)", // 无分号 's'
	} {
		if IsSafeURLValue(u) {
			t.Fatalf("IsSafeURLValue(%q)=true, want false", u)
		}
	}
	// 端到端: 出链属性整体剥离, 文本保留
	in := `<a href="javascript&#58alert(1)">点我</a>正文`
	out := ChapterHTML(in)
	if strings.Contains(strings.ToLower(out), "javascript") {
		t.Fatalf("无分号实体走私未拦截: out=%q", out)
	}
	if !strings.Contains(out, "点我") || !strings.Contains(out, "正文") {
		t.Fatalf("安全内容被误删: %q", out)
	}
	// 误伤面: 正常值中的无分号实体(解码后仍为相对地址)必须放行
	if !IsSafeURLValue("/a?x=1&#58y") {
		t.Fatalf("相对地址含无分号实体被误杀")
	}
}

// TestChapterHTML_KeepsSafeContent 合法内容直通(http/https 出链与相对地址保留)。
func TestChapterHTML_KeepsSafeContent(t *testing.T) {
	in := `<p>第一章 风起</p><a href="https://example.com/a?b=1">合法外链</a><a href="/book/1.html">站内</a><br/>`
	out := ChapterHTML(in)
	for _, want := range []string{`<p>第一章 风起</p>`, `href="https://example.com/a?b=1"`, `href="/book/1.html"`, "<br/>"} {
		if !strings.Contains(out, want) {
			t.Fatalf("安全内容被误删: want %q in %q", want, out)
		}
	}
}

// TestChapterHTML_Idempotent 幂等(输出面与 SSR 面可能二次过同一消毒器)。
func TestChapterHTML_Idempotent(t *testing.T) {
	for _, in := range []string{
		`<p>a</p><script>x</script><img src=x onerror=alert(1)>`,
		`<a href="javascript:x()">y</a>正文`,
		`<p>干净内容</p>`,
	} {
		once := ChapterHTML(in)
		twice := ChapterHTML(once)
		if once != twice {
			t.Fatalf("消毒非幂等:\n once=%q\ntwice=%q", once, twice)
		}
	}
}

// TestStripBlocks 块级剥离独立面(plainText 摘要链复用)。
func TestStripBlocks(t *testing.T) {
	out := StripBlocks(`<p>a</p><style>.x{}</style>正文`)
	if strings.Contains(out, "style") || strings.Contains(out, ".x") {
		t.Fatalf("块级剥离失效: %q", out)
	}
	if !strings.Contains(out, "正文") {
		t.Fatalf("正文被误删: %q", out)
	}
}
