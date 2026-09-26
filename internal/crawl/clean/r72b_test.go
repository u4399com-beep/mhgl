// ============================================================
// R72-b 回归测试 — clean 领地抓虫修复面(正例来源: DB 只读复采实证残留;
// 反例=同形正文防误杀, 沿用 clean_test.go 约定)
//
//	①withFloorPatterns 底线扩容: 规则自定义 clean.adPatterns 为替换语义, 修前底线只含
//	 coreAdPatterns 子集, R59-2c/R68-b 缺省增强条目(百度搜索引导/一秒记住族/本章未完
//	 点击族/杰奇页脚族)对 31/35 自定义规则整体失效 —— DB 实证「我有一剑」R71-main 新采
//	 章节 "最新章节百度搜索：" 残留 39/600。修后底线=缺省全集(自定义与缺省为并集)。
//	②[7] 全角混淆域名混合大小写形态: "ｗWｗ。ｂiquge。ｉｎｆｏ"(码点 0xFF57/0x57/0xFF57
//	 混排) —— 修前 [wｗ]{3} 不含 ASCII 大写 W 整条失配漏网。
//	③[8] 品牌隔符问号形态: "笔？趣？阁…" —— 修前隔符类不含 ？ 漏网。
//	④章末翻页标记前缀变体: "这章没有结束，请点击下一页继续阅读！"。
//	⑤双头推广行: "最新首发《我有一剑》最新内容”"。
//
// ============================================================
package clean

import (
	"strings"
	"testing"
)

// customLikeConfig 复刻「我有一剑」现役规则的自定义 clean.adPatterns(替换缺省语义)
func customLikeConfig() Config {
	cfg := defaultConfig()
	cfg.AdPatterns = []string{
		`作者：.*?所写的《.*?》无弹窗免费全文阅读为转载作品,?章节由网友发布。`,
		`无弹窗推荐地址：[^\s<>]*`,
		`无弹窗.*?阅读`,
		`(www\.)?xyetianlian\.com[^\s<>]*`,
		`(www\.)?[a-z0-9-]+\.(com|net|cc|org|info|top|xyz|vip|site)(/[^\s<>]*)?`,
	}
	return cfg
}

// TestR72bFloorDefaultsAdditive ①自定义 adPatterns 与缺省清单为并集
func TestR72bFloorDefaultsAdditive(t *testing.T) {
	cfg := customLikeConfig()
	in := "<p>詹青看着那棵天行生命树。</p><p>我有一剑最新章节百度搜索：</p><p>作者：某某所写的《我有一剑》无弹窗免费全文阅读为转载作品,章节由网友发布。</p><p>靖初点了点头。</p>"
	out := CleanContentHTML(in, cfg)
	if strings.Contains(out, "百度搜索") {
		t.Fatalf("底线扩容后百度搜索引导仍未回收(修前底线不含 R59-2c 增强条目): %q", out)
	}
	if strings.Contains(out, "转载作品") {
		t.Fatalf("规则自定义清单条目失效(并集不应破坏自定义面): %q", out)
	}
	if !strings.Contains(out, "詹青看着那棵天行生命树。") || !strings.Contains(out, "靖初点了点头。") {
		t.Fatalf("正文误伤: %q", out)
	}
	// 缺省路径零回归: 底线并入缺省全集后整表去重, 行为与缺省配置一致
	out2 := CleanContentHTML("<p>正文一句。</p><p>最新章节必应搜索：</p>", defaultConfig())
	if strings.Contains(out2, "必应搜索") || !strings.Contains(out2, "正文一句。") {
		t.Fatalf("缺省路径回归: %q", out2)
	}
}

// TestR72bMixedCaseFullwidthWWW ②混合大小写全角域名 + ③问号隔符品牌
func TestR72bMixedCaseFullwidthWWW(t *testing.T) {
	in := "<p>金胖子闻言又惊又喜。</p><p>笔？趣？阁ｗWｗ。ｂiquge。ｉｎｆｏ</p><p>老师要是能恢复视力。</p>"
	out := CleanContentHTML(in, defaultConfig())
	if strings.Contains(out, "ｂiquge") || strings.Contains(out, "ｉｎ") || strings.Contains(out, "笔？趣？阁") {
		t.Fatalf("混合大小写全角域名/问号隔符品牌未回收: %q", out)
	}
	if !strings.Contains(out, "金胖子闻言又惊又喜。") || !strings.Contains(out, "老师要是能恢复视力。") {
		t.Fatalf("正文误伤: %q", out)
	}
	// 防误伤反例: 问号隔符后无阁字收尾的正文不命中
	ok := CleanContentHTML("<p>这支笔？趣味盎然的阁楼。</p>", defaultConfig())
	if !strings.Contains(ok, "这支笔？趣味盎然的阁楼。") {
		t.Fatalf("反例误杀: %q", ok)
	}
}

// TestR72bNewNoiseVariants ④章末翻页标记前缀变体 + ⑤双头推广行
func TestR72bNewNoiseVariants(t *testing.T) {
	in := "<p>叶观突然笑道。</p><p>这章没有结束，请点击下一页继续阅读！</p><p>燧古今看着他。</p><p>我并非彼岸世界之人。最新首发《我有一剑》最新内容”</p>"
	out := CleanContentHTML(in, defaultConfig())
	if strings.Contains(out, "没有结束") || strings.Contains(out, "继续阅读") {
		t.Fatalf("章末翻页标记前缀变体未回收: %q", out)
	}
	if strings.Contains(out, "最新首发") || strings.Contains(out, "最新内容") {
		t.Fatalf("双头推广行未回收: %q", out)
	}
	if !strings.Contains(out, "叶观突然笑道。") || !strings.Contains(out, "燧古今看着他。") || !strings.Contains(out, "我并非彼岸世界之人。”") {
		t.Fatalf("正文误伤: %q", out)
	}
	// 防误伤反例: 本章未完/这章没有结束 出现在对话叙述中且无「点击…继续阅读」锚不误杀
	ok := CleanContentHTML("<p>他说这一章没有结束的意思，主角还会回来。</p>", defaultConfig())
	if !strings.Contains(ok, "这一章没有结束的意思，主角还会回来。") {
		t.Fatalf("反例误杀: %q", ok)
	}
}
