// ============================================================
// R71-b 回归测试 — 清洗领地逐行抓虫修复面(承接前轮中断改动收口)
//
//	①parseHex/parseIntDec 溢出防护: 超长数字实体在 int64 上回绕的合法码点伪装
//	　(2^64+65 → 'A')被拒收 —— fromCodePointSafe(-1) 空串, 与浏览器 U+FFFD/拒收对齐
//	②fieldSiteDomain 末级标签 {2,}→{1,}: 单字符末级标签短域(t.cn/x.com 类)尾巴漏剥
//	③CleanChapterTitle 书名前缀剥离补分隔符消费("万古神帝_第100章" 残留)
//	④titleURLTailRe: scheme/www 形态标题尾巴(空格/括号/无分隔符)与切割后悬空残尾
//	　("风起_https://")回收; CJK 止步不误杀 URL 后接真文本; 剥后为空保留原标题
//	⑤噪声清洗电池(承接草稿探针转正式断言)
//
// ============================================================
package clean

import (
	"strings"
	"testing"
)

// TestR71bEntityParseOverflow ①超长数字实体溢出拒收
func TestR71bEntityParseOverflow(t *testing.T) {
	// 2^64+65 = 0x10000000000000041 → 修前 int64 回绕恰为 65('A')
	if got := parseHex("10000000000000041"); got != -1 {
		t.Fatalf("超长 hex 实体应溢出拒收回 -1(修前回绕为 65), got %d", got)
	}
	// 2^64+65 的十进制形态
	if got := parseIntDec("18446744073709551681"); got != -1 {
		t.Fatalf("超长十进制实体应溢出拒收回 -1, got %d", got)
	}
	// 合法码点不受影响
	if got := parseHex("4e00"); got != 0x4e00 {
		t.Fatalf("合法 hex 码点回退被破坏: %d", got)
	}
	if got := parseIntDec("19968"); got != 19968 {
		t.Fatalf("合法十进制码点回退被破坏: %d", got)
	}
	// 端到端: 越界实体不得产出回绕码点字符
	out := decodeEntitiesOnce("&#x10000000000000041;&#18446744073709551681;")
	if strings.ContainsAny(out, "A一") {
		t.Fatalf("越界实体不得产出回绕码点字符(浏览器拒收语义), got %q", out)
	}
	// 掩码还原臂(v<1 丢token)安全性: -1 不参与合法还原
	if got := parseHex("zz"); got != 0 {
		t.Fatalf("非 hex 字符应保持原 0 口径, got %d", got)
	}
}

// TestR71bShortDomainTail ②单字符末级标签短域尾巴剥离
func TestR71bShortDomainTail(t *testing.T) {
	cases := []string{
		"第12章 风起 www.xy.com",
		"第12章 风起-www.xy.com",
		"第12章 风起（www.xy.com）",
		"第12章 风起 www.t.cn",
	}
	for _, c := range cases {
		if got := CleanChapterTitle(c, ""); strings.Contains(got, ".") || strings.Contains(got, "www") {
			t.Errorf("短域尾巴未剥离: in=%q out=%q", c, got)
		}
	}
}

// TestR71bBookNameSeparator ③书名后分隔符消费
func TestR71bBookNameSeparator(t *testing.T) {
	if got := CleanChapterTitle("万古神帝_第100章_首发", "万古神帝"); got != "第100章" {
		t.Fatalf("书名后分隔符应被消费(修前残留 _第100章), got %q", got)
	}
	if got := CleanChapterTitle("万古神帝 第100章", "万古神帝"); got != "第100章" {
		t.Fatalf("空格形态回归: got %q", got)
	}
}

// TestR71bTitleURLTail ④scheme/www 形态标题尾巴全形态回收
func TestR71bTitleURLTail(t *testing.T) {
	spam := []string{
		"第12章 风起http://www.xy.com/1", // 无分隔符
		"第12章 风起_https://x.com/a",    // 切割后悬空残尾 "_https://"
		"第12章 风起https://x.com",       // 无分隔符 scheme
		"第12章 风起（https://x.com）",     // 全角括号
		"第12章 风起(https://x.com)",     // 半角括号
		"第12章 风起 http://x.com",       // 空格
		"第12章 风起https://x.com/a?b=1", // 带参
	}
	for _, c := range spam {
		if got := CleanChapterTitle(c, ""); got != "第12章 风起" {
			t.Errorf("URL 尾巴未回收: in=%q out=%q", c, got)
		}
	}
	keep := []string{
		"第12章:更新公告",       // 真冒号标题(无 scheme 信号不误伤)
		"第12章 风起",         // 纯净标题零变化
		"转折_www.x.com首发",  // 既有 junk 切割路径回归
		"龙争-虎斗 www.y.com", // 既有 junk 切割路径回归
	}
	for _, c := range keep {
		want := map[string]string{
			"第12章:更新公告": "第12章:更新公告", "第12章 风起": "第12章 风起",
			"转折_www.x.com首发": "转折", "龙争-虎斗 www.y.com": "龙争-虎斗",
		}[c]
		if got := CleanChapterTitle(c, ""); got != want {
			t.Errorf("误伤或回归: in=%q out=%q want=%q", c, got, want)
		}
	}
	// URL 后接真文本: CJK 止步不误杀
	if got := CleanChapterTitle("第12章 https://x.com，好看", ""); !strings.Contains(got, "好看") {
		t.Errorf("URL 后接真文本被误杀: got %q", got)
	}
}

// TestR71bNoiseBattery ⑤噪声清洗电池(承接草稿探针转正式断言)
func TestR71bNoiseBattery(t *testing.T) {
	cases := []struct{ name, in, mustGo, mustKeep string }{
		{"起点式推荐语", "<p>求收藏，求推荐票！</p><p>正文内容。</p>", "", "正文内容。"},
		{"章节地址尾巴", "<p>万古神帝最新章节地址：/12192/</p><p>正文。</p>", "最新章节地址", "正文。"},
		{"百度搜索引导", "<p>最新章节百度搜索：万古神帝</p><p>正文。</p>", "百度搜索", "正文。"},
		{"最快更新", "<p>《万古神帝》最快更新最新章节！</p><p>正文。</p>", "最快更新最新章节", "正文。"},
		{"括号URL水印", "<p>正文一句。</p><p>（http://www.bi qi ge.info）</p>", "bi qi ge", "正文一句。"},
		{"括号URL水印b", "<p>正文一句。</p><p>（https://www.biquge.info/book/123.html）</p>", "biquge", "正文一句。"},
		{"破折URL", "<p>正文一句。</p><p>—— https://www.biquge.info ——</p>", "biquge", "正文一句。"},
		{"书名空壳推广", "<p>正文。</p><p>【万古神帝】 【】</p>", "【】", "正文。"},
		{"全角URL", "<p>正文。</p><p>一秒记住ｈｔｔps：//ｗｗｗ.ｂｉｑｕｇｅ.ｃｏｍ</p>", "ｂｉｑｕｇｅ", "正文。"},
		{"手机用户插语", "<p>手机用户请浏览m.bqg.com阅读，更优质的阅读体验。</p><p>正文。</p>", "更优质的阅读体验", "正文。"},
		{"杰奇页脚", "<p>作者：天蚕土豆所写的《万古神帝》无弹窗免费全文阅读为转载作品,章节由网友发布。</p><p>正文。</p>", "转载作品", "正文。"},
		{"本章未完点击", "<p>本章未完，点击下一页继续阅读&gt;&gt;</p><p>正文。</p>", "继续阅读", "正文。"},
		{"访问地址正文防误杀", "<p>他的访问地址：朝阳区某某街道。</p>", "", "访问地址：朝阳区"},
	}
	for _, c := range cases {
		out := CleanContentHTML(c.in, defaultConfig())
		if c.mustGo != "" && strings.Contains(out, c.mustGo) {
			t.Errorf("[%s] 噪声未清: %q", c.name, out)
		}
		if c.mustKeep != "" && !strings.Contains(out, c.mustKeep) {
			t.Errorf("[%s] 正文误杀: %q", c.name, out)
		}
	}
}
