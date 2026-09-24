// ============================================================
// 清洗底线层/管线防回归测试 —— R59 注释宣称的 clean_test.go 补建(R62-c3)。
// 约定: 增删 coreAdPatterns/defaultAdPatterns 条目须在此配正例+防误伤反例。
// 正例来源: DB 只读副本实证残留(R59-2c/R62-c3 两轮抽样); 反例=同形正文防误杀。
// ============================================================
package clean

import (
	"regexp"
	"strings"
	"testing"
)

// TestAllAdPatternsCompile 全表编译巡检: compileAdPattern 对编译失败静默跳过,
// 字节转义笔误(如 \xa0)曾致整条底线模式失效(R62-c3 [2]/[9] 实证), 在此兜底。
func TestAllAdPatternsCompile(t *testing.T) {
	pats := defaultAdPatterns()
	if len(pats) == 0 {
		t.Fatal("defaultAdPatterns empty")
	}
	for i, p := range pats {
		if _, err := regexp.Compile(p); err != nil {
			t.Errorf("defaultAdPatterns[%d] COMPILE FAIL: %v (%q)", i, err, p)
		}
	}
}

func htmlClean(t *testing.T, in string) string {
	t.Helper()
	return CleanContentHTML(in, defaultConfig())
}

// TestFloorWholeLineURL [2] 整行仅 URL 回收(纯文本行 + <p> 包裹双形态; NBSP 缩进)
func TestFloorWholeLineURL(t *testing.T) {
	in := "<p>上一段正文。</p><p>\u00a0\u00a0\u00a0\u00a0http://www.xyetianlian.com/yt59552/22356902.html</p><p>\u00a0\u00a0\u00a0\u00a0</p><p>下一段正文。</p>"
	out := htmlClean(t, in)
	if strings.Contains(out, "xyetianlian") {
		t.Fatalf("整行 URL 未回收: %q", out)
	}
	if !strings.Contains(out, "上一段正文。") || !strings.Contains(out, "下一段正文。") {
		t.Fatalf("正文误伤: %q", out)
	}
	cfg := defaultConfig()
	cfg.PlainText = true
	out2 := CleanContentHTML("上一段正文。\nhttp://www.x.com/a/1.html\n下一段正文。", cfg)
	if strings.Contains(out2, "x.com") {
		t.Fatalf("纯文本整行 URL 未回收: %q", out2)
	}
	if !strings.Contains(out2, "上一段正文。") || !strings.Contains(out2, "下一段正文。") {
		t.Fatalf("纯文本正文误伤: %q", out2)
	}
}

// TestFloorInlineURLPreserved 防误杀: 句中内联 URL(掩码验签还原)必须保留
func TestFloorInlineURLPreserved(t *testing.T) {
	out := htmlClean(t, "<p>详情见 https://example.com/page?id=1 的说明,再无其他。</p>")
	if !strings.Contains(out, "https://example.com/page?id=1") {
		t.Fatalf("内联 URL 被误删: %q", out)
	}
}

// TestFloorFullwidthDomainAndBrand [7] 全角句号混淆域名 + [8] 顿号/＆隔品牌
func TestFloorFullwidthDomainAndBrand(t *testing.T) {
	in := "<p>了，哪里还有心情去猎奇看女人啊。笔、趣、阁www。biquge。info</p><p>笔＆趣＆阁也回收。</p>"
	out := htmlClean(t, in)
	if strings.Contains(out, "biquge") || strings.Contains(out, "笔、趣、阁") || strings.Contains(out, "笔＆趣＆阁") {
		t.Fatalf("全角混淆品牌/域名未回收: %q", out)
	}
	if !strings.Contains(out, "哪里还有心情去猎奇看女人啊") || !strings.Contains(out, "也回收。") {
		t.Fatalf("正文误伤: %q", out)
	}
	ok := htmlClean(t, "<p>这支笔、趣味盎然的阁楼。</p><p>句号后接中文www。测试不误杀。</p>")
	if !strings.Contains(ok, "笔、趣味盎然的阁楼") || !strings.Contains(ok, "www。测试不误杀。") {
		t.Fatalf("反例误杀: %q", ok)
	}
}

// TestFloorPageMarkers [13]/[14] 翻页与未完待续标记
func TestFloorPageMarkers(t *testing.T) {
	in := "<p>\u00a0\u00a0\u00a0\u00a0（本章未完，请翻页）</p><p>吕清儿直视姜青娥。</p><p>\u00a0\u00a0\u00a0\u00a0（未完待续）</p>"
	out := htmlClean(t, in)
	if strings.Contains(out, "请翻页") || strings.Contains(out, "未完待续") {
		t.Fatalf("翻页/未完待续标记未回收: %q", out)
	}
	if !strings.Contains(out, "吕清儿直视姜青娥。") {
		t.Fatalf("正文误伤: %q", out)
	}
	ok := htmlClean(t, "<p>他说：本章未完，请翻页再看。故事还未完待续。</p>")
	if !strings.Contains(ok, "他说：本章未完，请翻页再看。故事还未完待续。") {
		t.Fatalf("反例误杀: %q", ok)
	}
}

// TestFloorSiteNavLine [15] 站点导流行整行回收
func TestFloorSiteNavLine(t *testing.T) {
	in := "<p>\u00a0\u00a0\u00a0\u00a0阅读本书最新章节请到999OM,手机同步阅读请访问sj.999om,清爽无广告。敬请记住我们最新网址999om</p><p>下一段。</p>"
	out := htmlClean(t, in)
	if strings.Contains(out, "999om") || strings.Contains(out, "999OM") {
		t.Fatalf("导流行未回收: %q", out)
	}
	if !strings.Contains(out, "下一段。") {
		t.Fatalf("正文误伤: %q", out)
	}
	ok := htmlClean(t, "<p>阅读本书，最新章节等你来看。</p>")
	if !strings.Contains(ok, "阅读本书，最新章节等你来看。") {
		t.Fatalf("反例误杀: %q", ok)
	}
}

// TestFloorHandEditLine [9] 星饰手打行(编译修复后复活)
func TestFloorHandEditLine(t *testing.T) {
	out := htmlClean(t, "<p>★★手打★шшш..★</p><p>正文保留。</p>")
	if strings.Contains(out, "手打") {
		t.Fatalf("手打行未回收: %q", out)
	}
	ok := htmlClean(t, "<p>他手打了一下篮球。</p>")
	if !strings.Contains(ok, "他手打了一下篮球。") {
		t.Fatalf("反例误杀: %q", ok)
	}
}

// TestFloorOneSecondRemember 一秒记住({0,60} 修): 裸尾与全角 URL 前缀双形态
func TestFloorOneSecondRemember(t *testing.T) {
	out := htmlClean(t, "<p>仿佛知道他什么人。\u00a0一秒记住</p><p>正文。</p>")
	if strings.Contains(out, "一秒记住") {
		t.Fatalf("裸尾一秒记住未回收: %q", out)
	}
	out2 := htmlClean(t, "<p>好恐怖的杀意！</p><p>\u00a0\u00a0\u00a0\u00a0一秒记住hｔｔps：//</p><p>正文。</p>")
	if strings.Contains(out2, "一秒记住") || strings.Contains(out2, "ｔｔps") {
		t.Fatalf("一秒记住+全角URL 未回收: %q", out2)
	}
}

// TestHTMLCommentStrip 2.7 注释剥离(xbqg777 go/over 标记)
func TestHTMLCommentStrip(t *testing.T) {
	in := "<p><!--go-->\n\u00a0\u00a0\u00a0\u00a0庄睿看着手里的珠宝。</p><p>光晕就消失不见了。<!--over--></p>"
	out := htmlClean(t, in)
	if strings.Contains(out, "<!--") {
		t.Fatalf("HTML 注释残留: %q", out)
	}
	if !strings.Contains(out, "庄睿看着手里的珠宝。") || !strings.Contains(out, "光晕就消失不见了。") {
		t.Fatalf("正文误伤: %q", out)
	}
}

// TestEmptyShellNBSP 空壳 <p> 含 U+00A0 形态清理
func TestEmptyShellNBSP(t *testing.T) {
	out := htmlClean(t, "<p>正文一。</p><p></p><p> </p><p>\u00a0</p><p>正文二。</p>")
	if strings.Contains(out, "\u00a0") {
		t.Fatalf("NBSP 空壳残留: %q", out)
	}
	if strings.Count(out, "<p>") != 2 || !strings.Contains(out, "正文一。") || !strings.Contains(out, "正文二。") {
		t.Fatalf("段落结构异常: %q", out)
	}
}
