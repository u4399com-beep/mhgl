// ============================================================
// R72-b 回归测试 — rule 领地抓虫修复面
//
//	①absolutize/cleanTextFieldMinimal 实体解码口径: html.UnescapeString(HTML5 文本
//	 上下文, 无分号 legacy 实体照解) → clean.UnescapeEntitiesOnce(白名单, 分号必需)。
//	 修前 css 路径 goquery 属性解码产物 "...a=1&current=2" 在二次解码时 &current 被
//	 解成 ¤(¤t=2)、&region→®、&copy→©、&note→¬ —— 查询参数名命中 legacy 实体名的
//	 真实章节/封面 URL 全部损坏(TS 权威 decodeEntitiesOnce 与浏览器属性上下文均不损坏)。
//	②白名单分号必需面回归: &amp; 解码保留(参数连接修复), 无分号 &amp/&copy 原样。
//	③absolutize 其余口径回归: 相对地址解析/协议过滤/自引用过滤不受换解码器影响。
//
// ============================================================
package rule

import "testing"

// TestR72bAbsolutizeLegacyEntityParams ①legacy 实体名参数不再被解码损坏
func TestR72bAbsolutizeLegacyEntityParams(t *testing.T) {
	cases := []struct{ in, want string }{
		{"http://www.x.com/read.php?a=1&current=2", "http://www.x.com/read.php?a=1&current=2"},
		{"http://www.x.com/read.php?a=1&region=5", "http://www.x.com/read.php?a=1&region=5"},
		{"http://www.x.com/book?cid=9&copy=1", "http://www.x.com/book?cid=9&copy=1"},
		{"http://www.x.com/book?id=3&note=abc", "http://www.x.com/book?id=3&note=abc"},
		{"http://www.x.com/book?reg=1&count=2", "http://www.x.com/book?reg=1&count=2"},
		{"http://www.x.com/book?sect=2&times=3", "http://www.x.com/book?sect=2&times=3"},
	}
	for _, c := range cases {
		if got := absolutize(c.in, ""); got != c.want {
			t.Errorf("legacy 实体名参数被解码损坏: in=%q got=%q want=%q", c.in, got, c.want)
		}
	}
}

// TestR72bAbsolutizeAmpDecode ②参数连接修复(&amp;)+无分号形态保留(浏览器/TS 对齐)
func TestR72bAbsolutizeAmpDecode(t *testing.T) {
	// 字面 &amp; → & (regex/JSON 路径拿到的 href 含实体的主修复面, 语义保留)
	if got := absolutize("http://www.x.com/book?a=1&amp;b=2", ""); got != "http://www.x.com/book?a=1&b=2" {
		t.Errorf("&amp; 应解码为 &: got %q", got)
	}
	// 无分号 &amp / &copy: 浏览器属性上下文不解码 → 原样保留(TS 同口径)
	if got := absolutize("http://www.x.com/book?a=1&ampb=2", ""); got != "http://www.x.com/book?a=1&ampb=2" {
		t.Errorf("无分号 &amp 不应解码: got %q", got)
	}
	if got := absolutize("http://www.x.com/book?a=1&copy=2", ""); got != "http://www.x.com/book?a=1&copy=2" {
		t.Errorf("无分号 &copy 不应解码: got %q", got)
	}
}

// TestR72bAbsolutizeRegression ③既有口径回归: 相对解析/协议过滤/自引用过滤/数字实体
func TestR72bAbsolutizeRegression(t *testing.T) {
	if got := absolutize("/book/123.html", "http://www.x.com/toc/"); got != "http://www.x.com/book/123.html" {
		t.Errorf("相对地址解析回归: got %q", got)
	}
	if got := absolutize("javascript:void(0)", "http://www.x.com/"); got != "" {
		t.Errorf("协议过滤回归: got %q", got)
	}
	if got := absolutize("http://www.x.com/toc/", "http://www.x.com/toc/"); got != "" {
		t.Errorf("自引用过滤回归: got %q", got)
	}
	// 带分号数字实体仍解码(混淆形态面保留)
	if got := absolutize("http://www.x.com/a&#x3f;b=1", ""); got != "http://www.x.com/a?b=1" {
		t.Errorf("数字实体解码回归: got %q", got)
	}
}

// TestR72bCleanTextFieldMinimalEntity ②简版字段清洗同口径(whitelist 分号必需)
func TestR72bCleanTextFieldMinimalEntity(t *testing.T) {
	if got := cleanTextFieldMinimal("连载中&amp;", 0); got != "连载中&" {
		t.Errorf("&amp; 解码回归: got %q", got)
	}
	if got := cleanTextFieldMinimal("状态&noted=1", 0); got != "状态&noted=1" {
		t.Errorf("无分号 legacy 实体不应解码: got %q", got)
	}
}
