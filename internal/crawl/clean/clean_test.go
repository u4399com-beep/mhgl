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

// ============================================================
// R63-d 引导地址前缀族 + 行锚 nbsp 卡死修复
// ============================================================

// TestFloorNbspLeadContexts [2]/[9] 行锚 nbsp 卡死修复回归: Go \s 不含 U+00A0,
// raw 形态(div 直排 + &nbsp; 前缀 + <br/> 分隔)曾致整行 URL 漏网 924 章。
func TestFloorNbspLeadContexts(t *testing.T) {
	// xyetianlian 22356902 章源站 raw 尾部逐字形态
	in := "<p>正文段落。</p><br /><br />&nbsp;&nbsp;&nbsp;&nbsp;http://www.xyetianlian.com/yt59552/22356902.html<br /><br />&nbsp;&nbsp;&nbsp;&nbsp;请记住本书首发域名：www.xyetianlian.com"
	out := htmlClean(t, in)
	if strings.Contains(out, "http://www.xyetianlian.com") || strings.Contains(out, "请记住本书首发域名") {
		t.Fatalf("nbsp 行首 URL/引导语未回收: %q", out)
	}
	if !strings.Contains(out, "正文段落。") {
		t.Fatalf("正文误伤: %q", out)
	}
	// 纯文本模式同形态(nbsp 前缀行)
	cfg := defaultConfig()
	cfg.PlainText = true
	out2 := CleanContentHTML("正文。\n\u00a0\u00a0http://www.x.com/a/1.html\n结尾。", cfg)
	if strings.Contains(out2, "x.com") {
		t.Fatalf("纯文本 nbsp 行首 URL 未回收: %q", out2)
	}
	// [9] 星号手打行 nbsp 前缀
	out3 := htmlClean(t, "<p>\u00a0\u00a0\u00a0\u00a0★★★手打★шшш..★\u00a0\u00a0</p><p>正文。</p>")
	if strings.Contains(out3, "手打") || strings.Contains(out3, "шшш") {
		t.Fatalf("nbsp 星号手打行未回收: %q", out3)
	}
	if !strings.Contains(out3, "正文。") {
		t.Fatalf("正文误伤: %q", out3)
	}
}

// TestLeadPrefixAddrFamily [0]/[16] 引导地址前缀族回收("无弹窗推荐地址：http://..."
// 用户报告形态 + 复合变体 + 简介面)
func TestLeadPrefixAddrFamily(t *testing.T) {
	cases := []struct{ name, in string }{
		{"p包裹独立段", "<p>无弹窗推荐地址：http://www.xyetianlian.com/yt57528/</p>"},
		{"独立行", "无弹窗推荐地址：http://www.xyetianlian.com/yt57528/"},
		{"裸域名", "<p>无弹窗推荐地址：www.xyetianlian.com/yt57528/</p>"},
		{"变体-本书最新", "<p>本书最新地址：http://www.xbqg777.com/book/12/</p>"},
		{"变体-原文地址", "<p>原文地址：https://www.qimao.com/shuku/123/index.html</p>"},
		{"变体-最新章节", "<p>最新章节地址：http://www.xyetianlian.com/yt57528/21678226.html</p>"},
		{"nbsp行首", "<p>\u00a0\u00a0无弹窗推荐地址：http://www.xyetianlian.com/yt57528/</p>"},
	}
	for _, c := range cases {
		out := htmlClean(t, c.in)
		if strings.Contains(out, "http") || strings.Contains(out, "地址") || strings.Contains(out, ".com") {
			t.Fatalf("%s 未回收: %q", c.name, out)
		}
	}
	// [16] mop-up: 全角混淆域名被 [7] 删后仅剩前缀的行
	out := htmlClean(t, "<p>无弹窗推荐地址：ｗｗｗ.ｘｘ.ｃｏｍ</p>")
	if strings.Contains(out, "地址") || strings.Contains(out, "ｗｗｗ") {
		t.Fatalf("全角域名+前缀未回收: %q", out)
	}
	// 行内正文保留(广告段删除)
	inline := htmlClean(t, "<p>他抬起头。无弹窗推荐地址：http://www.xyetianlian.com/yt57528/<br>他看到远处。</p>")
	if strings.Contains(inline, "无弹窗") || strings.Contains(inline, "http") {
		t.Fatalf("行内广告段未回收: %q", inline)
	}
	if !strings.Contains(inline, "他抬起头。") || !strings.Contains(inline, "他看到远处。") {
		t.Fatalf("行内正文误伤: %q", inline)
	}
	// 简介面(CleanIntro 走缺省 patterns 含底线)
	intro := CleanIntro("这是一个简介。\n无弹窗推荐地址：http://www.xyetianlian.com/yt57528/\n第二行简介。", 0)
	if strings.Contains(intro, "无弹窗") || strings.Contains(intro, "http") {
		t.Fatalf("简介广告行未回收: %q", intro)
	}
	if !strings.Contains(intro, "这是一个简介。") || !strings.Contains(intro, "第二行简介。") {
		t.Fatalf("简介正文误伤: %q", intro)
	}
}

// TestR64bLonelyMaskAndBrFamily R64-b 孤立掩码 token 回收 + 连续 br 串联 URL +
// 裸文本节点孤儿 URL + U+3000 空壳段(R64-b 探针实证四缺口固化)
func TestR64bLonelyMaskAndBrFamily(t *testing.T) {
	// 连续 br 串联第二条 URL(原 [2] 尾组吞 "<br" 留孤儿 '>' 致漏网)
	out := htmlClean(t, "<p>前段。</p><br>http://www.a.com/1/<br>http://www.b.com/2/<br><p>后段。</p>")
	if strings.Contains(out, "a.com") || strings.Contains(out, "b.com") {
		t.Fatalf("连续 br URL 漏网: %q", out)
	}
	if !strings.Contains(out, "前段。") || !strings.Contains(out, "后段。") {
		t.Fatalf("正文误伤: %q", out)
	}
	// </p> 相邻裸 URL(RE2 无前瞻的孤立形态, 代码级回收兜底)
	out = htmlClean(t, "<p>前段。</p>http://www.c.com/3/<br>后段。")
	if strings.Contains(out, "c.com") {
		t.Fatalf("孤儿 URL 漏网: %q", out)
	}
	if !strings.Contains(out, "前段。") || !strings.Contains(out, "后段。") {
		t.Fatalf("正文误伤: %q", out)
	}
	// U+3000 空壳段落(emptyShellBody 族补 \x{3000}; DB 94 章残留实证)
	out = htmlClean(t, "<p>\u3000\u3000正文一！</p><p>\u3000</p><p>\u3000\u3000</p><p>正文二。</p>")
	if strings.Contains(out, "<p>\u3000") || strings.Count(out, "<p>") != 2 {
		t.Fatalf("U+3000 空壳段未回收: %q", out)
	}
	if !strings.Contains(out, "正文一！") || !strings.Contains(out, "正文二。") {
		t.Fatalf("正文误伤: %q", out)
	}
	// 防误伤: 行内 URL(前紧贴可见文字)必须保留
	keep := htmlClean(t, "<p>详见 https://a.com/x?i=1&amp;j=2 说明。</p>")
	if !strings.Contains(keep, "https://a.com/x?i=1&amp;j=2") || !strings.Contains(keep, "详见") {
		t.Fatalf("行内正文 URL 误删: %q", keep)
	}
}

// TestR64bPrefixVariantsUppercase R64-b 引导前缀变体扩展 + 大小写域名 +
// plain 模式 U+3000 行首 URL(探针实证固化)
func TestR64bPrefixVariantsUppercase(t *testing.T) {
	cases := []struct{ name, in string }{
		{"请记住双层前缀", "<p>请记住本书首发地址：http://www.foo.com/123/</p>"},
		{"请记住本站", "<p>请记住本站最新地址：http://www.foo.com/123/</p>"},
		{"手机版地址", "<p>手机版地址：http://m.foo.com/1/</p>"},
		{"移动版地址", "<p>移动版地址：http://m.foo.com/1/</p>"},
		{"手机阅读网址裸域名", "<p>手机阅读网址：m.foo.com</p>"},
		{"请记住最新网址", "<p>请记住最新网址：www.foo.com</p>"},
		{"请访问最新地址带路径", "<p>请访问最新地址：www.foo.com/book/1/</p>"},
		{"u3000行首前缀", "<p>\u3000\u3000无弹窗推荐地址：http://www.e.com/5/</p>"},
		{"大写域名行中", "<p>欢迎访问 WWW.BIQUGE.INFO 阅读本章。</p>"},
		{"大写域名整行", "<p>WWW.BIQUGE.INFO</p>"},
	}
	for _, c := range cases {
		out := htmlClean(t, c.in)
		if strings.Contains(out, "http") || strings.Contains(out, "www.") || strings.Contains(out, "WWW.") ||
			strings.Contains(out, "地址：") || strings.Contains(out, "网址：") || strings.Contains(out, "BIQUGE") {
			t.Fatalf("%s 未回收: %q", c.name, out)
		}
	}
	// 大写域名行中形态: 域名删, 正文保留
	out := htmlClean(t, "<p>欢迎访问 WWW.BIQUGE.INFO 阅读本章。</p>")
	if !strings.Contains(out, "欢迎访问") || !strings.Contains(out, "阅读本章。") {
		t.Fatalf("大写域名行中正文误伤: %q", out)
	}
	// plain 模式: U+3000 缩进整行 URL(lineWs 全角空格族)
	cfg := defaultConfig()
	cfg.PlainText = true
	out = CleanContentHTML("正文。\n\u3000\u3000http://www.d.com/4/\n结尾。", cfg)
	if strings.Contains(out, "d.com") {
		t.Fatalf("plain U+3000 行首 URL 漏网: %q", out)
	}
	if !strings.Contains(out, "正文。") || !strings.Contains(out, "结尾。") {
		t.Fatalf("plain 正文误伤: %q", out)
	}
}

// TestLeadPrefixAddrNoFalsePositive [0]/[16] 防误伤: 无 URL/域名同现的普通正文
func TestLeadPrefixAddrNoFalsePositive(t *testing.T) {
	cases := []string{
		"<p>他说：“这个访问地址：北京市朝阳区某某街道，你记一下。”</p>",
		"<p>他们很快更新了最新地址。</p>",
		"<p>书名《推荐地址不明的旅人》火了。</p>",
		"<p>&nbsp;&nbsp;&nbsp;&nbsp;正文内容正常缩进显示。</p>",
		"<p>本章地址：无。</p>",
		"<p>详情见 https://example.com/page?id=1 的说明。</p>",
	}
	for _, in := range cases {
		out := htmlClean(t, in)
		plain := strings.ReplaceAll(strings.ReplaceAll(in, "<p>", ""), "</p>", "")
		if !strings.Contains(out, strings.TrimPrefix(plain, "&nbsp;&nbsp;&nbsp;&nbsp;")) {
			t.Fatalf("反例误伤: in=%q out=%q", in, out)
		}
	}
}

// TestSanitizeAdPattern R63-d 吞标签消毒: \S*族→[^\s<>]*, 非lazy贪心.*→[^\n<]*,
// lazy(.*?/.+?)保持原样(跨标签是触发词本意)。
func TestSanitizeAdPattern(t *testing.T) {
	cases := []struct{ in, want string }{
		{`无弹窗推荐地址：\S*`, `无弹窗推荐地址：[^\s<>]*`},
		{`(www\.)?xyetianlian\.com\S*`, `(www\.)?xyetianlian\.com[^\s<>]*`},
		{`biquio\S*`, `biquio[^\s<>]*`},
		{`本站所有小说为转载作品.*$`, `本站所有小说为转载作品[^\n<]*$`},
		{`作者：.*?所写的《.*?》无弹窗免费全文阅读`, `作者：.*?所写的《.*?》无弹窗免费全文阅读`},
		{`何以笙箫默小说小说推荐阅读：.*?$`, `何以笙箫默小说小说推荐阅读：.*?$`},
		{`txt全集\S+下载`, `txt全集[^\s<>]+下载`},
		{`普通模式无危险词`, `普通模式无危险词`},
	}
	for _, c := range cases {
		if got := sanitizeAdPattern(c.in); got != c.want {
			t.Errorf("sanitize(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// TestRuleConfigTagSafeDigest R63-d 集成回归: 规则自定义 \S* 模式经 FromRuleRaw 消毒后,
// "无弹窗推荐地址：URL" 段回收不再吞 "</p>"(修前输出孤儿 "<p>")。
func TestRuleConfigTagSafeDigest(t *testing.T) {
	raw := []byte(`{"clean":{"removeSelectors":["script","style","iframe","ins","noscript","a"],"adPatterns":["无弹窗推荐地址：\\S*","(www\\.)?xyetianlian\\.com\\S*"],"whitelist":["p","br","b"],"normalize":true,"plainText":false}}`)
	cfg := FromRuleRaw(raw)
	in := "<p>无弹窗推荐地址：http://www.xyetianlian.com/yt57528/</p>"
	out := CleanContentHTML(in, cfg)
	if strings.Contains(out, "<p>") || strings.Contains(out, "无弹窗") || strings.Contains(out, "http") {
		t.Fatalf("孤儿标签/广告残留: %q", out)
	}
	// 裸域名形态(非掩码路径)同样不吞闭标签
	in2 := "<p>推荐地址：www.xyetianlian.com/yt/</p><p>下一段。</p>"
	out2 := CleanContentHTML(in2, cfg)
	if strings.Contains(out2, "xyetianlian") || strings.Contains(out2, "推荐地址") {
		t.Fatalf("裸域名+前缀未回收: %q", out2)
	}
	if !strings.Contains(out2, "下一段。") {
		t.Fatalf("正文误伤: %q", out2)
	}
}

// TestR66bLonelyMaskTextStart [R66-b] 孤立掩码 token 前向「文本起点即边界」回归:
// 修前 lonelyMaskAt 前向扫描遇文本起点(loc[0]==0 或前缀全空白)恒返回 false, 与注释
// 「或文本起点」语义相悖 —— 章节体首孤立 URL 行(HTML 模式无 <p> 包裹形态 "URL<br>正文",
// [2] br 形态要求 br 在前不可锚; 整章仅 URL 形态)漏网。
func TestR66bLonelyMaskTextStart(t *testing.T) {
	// 体首裸 URL + br 隔断(HTML 模式; 修前 URL 行残留)
	out := htmlClean(t, "http://www.x.com/a/1.html<br>正文开始。第二句。")
	if strings.Contains(out, "x.com") || strings.Contains(out, "http") {
		t.Fatalf("章节体首孤立 URL 未回收: %q", out)
	}
	if !strings.Contains(out, "正文开始。") {
		t.Fatalf("正文误伤: %q", out)
	}
	// 整章仅 URL(体首+体尾双边界; 修前整体残留并被段重建包进 <p>)
	out = htmlClean(t, "http://www.y.com/2/")
	if strings.Contains(out, "y.com") || strings.Contains(out, "http") {
		t.Fatalf("整章仅 URL 未回收: %q", out)
	}
	// 前缀全空白 + 体尾(空白起点同视为文本起点边界)
	out = htmlClean(t, "<p>正文段落。</p>\u00a0\u00a0http://www.z.com/3/\u3000")
	if strings.Contains(out, "z.com") {
		t.Fatalf("空白前缀孤立 URL 未回收: %q", out)
	}
	if !strings.Contains(out, "正文段落。") {
		t.Fatalf("正文误伤: %q", out)
	}
	// 防误伤: 体首 URL 后紧贴可见文字(非标签/终点)必须保留
	keep := htmlClean(t, "http://www.keep.com/home 是这本书的官网链接。")
	if !strings.Contains(keep, "http://www.keep.com/home") || !strings.Contains(keep, "是这本书的官网链接。") {
		t.Fatalf("体首 URL 行内形态误删: %q", keep)
	}
}

// TestR68bJieqiFooterAndPagerPatterns [R68-b] 生产 DB 旁证实证增强的三条缺省模式:
// 杰奇CMS 书页页脚水印行 / 翻页标记变体(方括号+箭头残尾) / 书名【】空壳推广行。
// 同时覆盖防误伤反例(相似但不满足短语链的正文必须保留)。
func TestR68bJieqiFooterAndPagerPatterns(t *testing.T) {
	cases := []struct {
		name string
		in   string
		keep string // 必须保留的正文锚(空串=期望整体回收)
	}{
		{
			name: "杰奇页脚水印行回收",
			in:   "<p>正文段落, 情节继续推进。</p><p>作者：某某某所写的《万相之王》无弹窗免费全文阅读为转载作品,章节由网友发布。</p>",
			keep: "正文段落, 情节继续推进。",
		},
		{
			name: "翻页标记方括号变体回收",
			in:   "<p>情节推进到这里。</p><p>本章未完，点击[下一页]继续阅读&gt;&gt;</p>",
			keep: "情节推进到这里。",
		},
		{
			name: "翻页标记箭头残尾回收",
			in:   "<p>情节推进到这里。</p><p>本章未完,点击「下一页」继续阅读--&gt;&gt;</p>",
			keep: "情节推进到这里。",
		},
		{
			name: "书名空壳推广行回收",
			in:   "<p>段落文字。</p><p>【万相之王】\u00a0\u00a0【】</p>",
			keep: "段落文字。",
		},
		{
			name: "防误伤: 作者+书名但无『无弹窗…转载作品』链",
			in:   "<p>作者：某某所写的《平凡的世界》曾获茅盾文学奖,影响深远。</p>",
			keep: "《平凡的世界》曾获茅盾文学奖",
		},
		{
			name: "防误伤: 本章未完但无『点击…继续阅读』组合",
			in:   "<p>这一卷本章未完,下一卷将展开新的冒险。</p>",
			keep: "下一卷将展开新的冒险",
		},
		{
			name: "防误伤: 书评类双非空【】对",
			in:   "<p>【书评】这本书节奏很好,值得追更。</p>",
			keep: "这本书节奏很好",
		},
	}
	for _, c := range cases {
		out := htmlClean(t, c.in)
		if c.keep == "" {
			continue
		}
		if !strings.Contains(out, c.keep) {
			t.Fatalf("%s: 正文误伤: %q", c.name, out)
		}
	}
	// 回收面断言(整体性噪声必须消失)
	reclaim := []struct{ name, in, forbid string }{
		{"页脚水印", "作者：张三所写的《万相之王》无弹窗章节内容为转载作品请收藏", "无弹窗"},
		{"翻页方括号", "本章未完，点击[下一页]继续阅读&gt;&gt;", "本章未完"},
		{"空壳推广", "【万相之王】\u3000【】", "【】"},
	}
	for _, c := range reclaim {
		out := htmlClean(t, "<p>前文。</p><p>"+c.in+"</p><p>后文。</p>")
		if strings.Contains(out, c.forbid) {
			t.Fatalf("%s: 未回收: %q", c.name, out)
		}
		if !strings.Contains(out, "前文。") || !strings.Contains(out, "后文。") {
			t.Fatalf("%s: 相邻正文误伤: %q", c.name, out)
		}
	}
}
