// ============================================================
// R65-b — 智能 TDK 引擎测试
//
//	① 18 套预设完备性(编号连续唯一/风格名/支持页类型/示例渲染长度 70-160/keywords 4-8)
//	② 占位符替换完整(满上下文/空上下文渲染均无 {xxx} 与〔〕残留, 无空括号/悬挂标点)
//	③ 字数段回落(未知 → 可裁段整段裁掉; 已知 → 100万+字 进产出)
//	④ 随机性(多次调用命中不同套 → 产出去重)与页类型过滤(启用套不支持该页 → 空回落)
//	⑤ 未配置/关闭回落(零配置解析 → disabled → BuildTDK 空三元组)
//	⑥ 配置消毒(越界套/未知页键/半残覆盖模板剔除)与站点级模板覆盖生效
//
// ============================================================
package smart

import (
	"strings"
	"testing"
	"unicode/utf8"
)

// tdkFullCtx 满上下文(全部占位符可命中)。
func tdkFullCtx() TDKCtx {
	return TDKCtx{
		SiteName: "测试书站", BookName: "测试书名", Author: "测试作者",
		Category: "玄幻奇幻", Status: "连载中", Words: 1_050_000, Year: "2025",
	}
}

// tdkAllSets 全 18 套启用 + 全页类型 smart。
func tdkAllSets() TDKSiteCfg {
	sets := make([]int, 0, TDKPresetCount)
	pages := map[string]string{}
	for i := 1; i <= TDKPresetCount; i++ {
		sets = append(sets, i)
	}
	for pt := range tdkPageTypes {
		pages[pt] = PageModeSmart
	}
	return TDKSiteCfg{Enabled: true, Sets: sets, Pages: pages}
}

// assertNoResidual 产出断言: 无占位符残留/无可裁段残留/无空括号对/无首尾悬挂标点。
func assertNoResidual(t *testing.T, label, s string) {
	t.Helper()
	if strings.ContainsAny(s, "{}〔〕") {
		t.Fatalf("%s 占位符/可裁段残留: %q", label, s)
	}
	for _, pair := range []string{"《》", "（）", "()", "「」", "『』", "【】"} {
		if strings.Contains(s, pair) {
			t.Fatalf("%s 空括号对残留: %q", label, s)
		}
	}
	if strings.HasPrefix(s, "_") || strings.HasPrefix(s, "-") || strings.HasPrefix(s, "，") {
		t.Fatalf("%s 首部悬挂标点: %q", label, s)
	}
	if strings.HasSuffix(s, "_") || strings.HasSuffix(s, "-") || strings.HasSuffix(s, "，") {
		t.Fatalf("%s 尾部悬挂标点: %q", label, s)
	}
}

// ① 18 套预设完备性 + 示例渲染长度区间。
func TestTDKPresetsCompleteness(t *testing.T) {
	if len(tdkPresets) != 18 {
		t.Fatalf("预设套数 = %d, 期望 18", len(tdkPresets))
	}
	ctx := tdkFullCtx()
	for i, p := range tdkPresets {
		if p.ID != i+1 {
			t.Fatalf("套 %d 编号错位: ID=%d", i+1, p.ID)
		}
		if strings.TrimSpace(p.Name) == "" || strings.TrimSpace(p.Note) == "" {
			t.Fatalf("套 %d 风格名/注释缺失", p.ID)
		}
		if len(p.Pages) == 0 {
			t.Fatalf("套 %d 未声明支持页类型", p.ID)
		}
		for _, pt := range p.Pages {
			if !tdkPageTypes[pt] {
				t.Fatalf("套 %d 非法页类型 %q", p.ID, pt)
			}
		}
		if !strings.Contains(p.T, "{") || !strings.Contains(p.D, "{") || !strings.Contains(p.K, "{") {
			t.Fatalf("套 %d 模板缺占位符(title/desc/kw)", p.ID)
		}
		// 示例渲染: desc 70-160 码点(keywords 拆分去重后 4-8 个)
		desc := renderTdkTpl(p.D, ctx)
		if n := utf8.RuneCountInString(desc); n < 70 || n > 160 {
			t.Fatalf("套 %d description 示例长度 %d 越界(70-160): %q", p.ID, n, desc)
		}
		kw := renderTdkKw(p.K, ctx)
		nk := len(strings.Split(kw, ","))
		if nk < 4 || nk > 8 {
			t.Fatalf("套 %d keywords 数量 %d 越界(4-8): %q", p.ID, nk, kw)
		}
		assertNoResidual(t, "套 "+itoa(p.ID)+" 示例", desc)
	}
	// TDKPresets 元信息表与常量表一一对应
	metas := TDKPresets()
	if len(metas) != 18 {
		t.Fatalf("TDKPresets 元信息 = %d 套", len(metas))
	}
	for i, m := range metas {
		if m.ID != i+1 || m.ExampleT == "" || m.ExampleD == "" {
			t.Fatalf("元信息套 %d 异常: %+v", i+1, m)
		}
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [8]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

// ② 占位符替换完整: 满/缺/空上下文 × 全套 × 支持页类型, 产出零残留。
func TestTDKPlaceholderSubstitution(t *testing.T) {
	cfg := tdkAllSets()
	cases := map[string]TDKCtx{
		"满上下文":  tdkFullCtx(),
		"缺字数":   {SiteName: "测试书站", BookName: "测试书名", Author: "测试作者", Category: "玄幻奇幻", Status: "连载中", Year: "2025"},
		"缺作者状态": {SiteName: "测试书站", BookName: "测试书名", Category: "玄幻奇幻", Words: 120_000, Year: "2025"},
		"空上下文":  {},
	}
	for label, ctx := range cases {
		for _, p := range tdkPresets {
			for _, pt := range p.Pages {
				title, desc, kw := BuildTDK(cfg, ctx, pt)
				if title == "" && desc == "" {
					// 空上下文下书名族套渲染失败回落是预期行为
					if label == "空上下文" {
						continue
					}
					t.Fatalf("%s/套%d/%s 渲染为空", label, p.ID, pt)
				}
				assertNoResidual(t, label+"/套"+itoa(p.ID)+"/title", title)
				assertNoResidual(t, label+"/套"+itoa(p.ID)+"/desc", desc)
				assertNoResidual(t, label+"/套"+itoa(p.ID)+"/kw", kw)
			}
		}
	}
	// 空上下文下首页套(17/18)应可渲染(仅依赖站名/热词/年份, 年份引擎自动补当前年)
	cfgHome := TDKSiteCfg{Enabled: true, Sets: []int{17, 18}, Pages: map[string]string{PageHome: PageModeSmart}}
	title, desc, _ := BuildTDK(cfgHome, TDKCtx{SiteName: "测试书站"}, PageHome)
	if title == "" || desc == "" {
		t.Fatalf("首页套空上下文应可渲染(站名命中): %q/%q", title, desc)
	}
	if !strings.Contains(title, "测试书站") {
		t.Fatalf("首页套 title 应含站名: %q", title)
	}
}

// ③ 字数段回落: 未知 → 可裁段整段裁掉且不出现空括号; 已知 → 段值进产出。
func TestTDKWordBandFallback(t *testing.T) {
	if WordBand(0) != "" || WordBand(-5) != "" {
		t.Fatalf("未知字数段应为空串")
	}
	if WordBand(1_500_000) != "100万+字" || WordBand(150_000) != "10万+字" || WordBand(20_000) != "1万+字" {
		t.Fatalf("字数段分档不符")
	}
	// 套 11 标题含 〔{字数段}〕 可裁段
	ctxKnown := TDKCtx{SiteName: "测试书站", BookName: "巨作", Author: "甲", Category: "玄幻奇幻", Status: "连载中", Words: 1_500_000, Year: "2025"}
	cfg11 := TDKSiteCfg{Enabled: true, Sets: []int{11}, Pages: map[string]string{PageBook: PageModeSmart}}
	title, desc, _ := BuildTDK(cfg11, ctxKnown, PageBook)
	if !strings.Contains(title, "100万+字") || !strings.Contains(desc, "100万+字") {
		t.Fatalf("字数已知时 title/desc 应含 100万+字: %q | %q", title, desc)
	}
	ctxUnknown := ctxKnown
	ctxUnknown.Words = 0
	title, desc, _ = BuildTDK(cfg11, ctxUnknown, PageBook)
	if strings.Contains(title, "字") && strings.Contains(title, "〔") {
		t.Fatalf("可裁段残留: %q", title)
	}
	if !strings.Contains(title, "《巨作》完整版") {
		t.Fatalf("字数未知时 title 应整段裁掉可裁段: %q", title)
	}
	if !strings.Contains(desc, "《巨作》完整版免费开放阅读") {
		t.Fatalf("字数未知时 desc 应整段裁掉可裁段: %q", desc)
	}
	assertNoResidual(t, "字数回落 title", title)
	assertNoResidual(t, "字数回落 desc", desc)
}

// ④ 随机性: 多次调用命中不同套(产出出现 ≥2 种形态)。
func TestTDKRandomness(t *testing.T) {
	cfg := tdkAllSets()
	seen := map[string]bool{}
	for i := 0; i < 60; i++ {
		title, _, _ := BuildTDK(cfg, tdkFullCtx(), PageBook)
		if title == "" {
			t.Fatalf("第 %d 次调用渲染为空", i)
		}
		seen[title] = true
	}
	if len(seen) < 2 {
		t.Fatalf("60 次调用应命中多个不同套, 实际仅 %d 种产出", len(seen))
	}
	// {热词} 随机: 套 18 多次渲染 title 热词段可变化
	cfg18 := TDKSiteCfg{Enabled: true, Sets: []int{18}, Pages: map[string]string{PageHome: PageModeSmart}}
	hotSeen := map[string]bool{}
	for i := 0; i < 60; i++ {
		title, _, _ := BuildTDK(cfg18, TDKCtx{SiteName: "测试书站"}, PageHome)
		hotSeen[title] = true
	}
	if len(hotSeen) < 2 {
		t.Fatalf("热词池随机应产出多种 title, 实际仅 %d 种", len(hotSeen))
	}
}

// ④b 页类型过滤: 启用套不支持当前页 → 空三元组(调用方回落原逻辑)。
func TestTDKPageTypeFiltering(t *testing.T) {
	cfg := TDKSiteCfg{Enabled: true, Sets: []int{12}, Pages: tdkAllSets().Pages} // 12 仅 toc
	if title, _, _ := BuildTDK(cfg, tdkFullCtx(), PageBook); title != "" {
		t.Fatalf("套12 不支持 book, 应空回落: %q", title)
	}
	if title, _, _ := BuildTDK(cfg, tdkFullCtx(), PageHome); title != "" {
		t.Fatalf("套12 不支持 home, 应空回落: %q", title)
	}
	if title, _, _ := BuildTDK(cfg, tdkFullCtx(), PageToc); title == "" {
		t.Fatalf("套12 支持 toc, 应产出")
	}
	// 未启用页类型策略 → off
	cfg2 := TDKSiteCfg{Enabled: true, Sets: []int{1}, Pages: map[string]string{PageBook: PageModeOff}}
	if title, _, _ := BuildTDK(cfg2, tdkFullCtx(), PageBook); title != "" {
		t.Fatalf("off 策略应空回落: %q", title)
	}
	// 未知页类型 → off
	if title, _, _ := BuildTDK(tdkAllSets(), tdkFullCtx(), "search"); title != "" {
		t.Fatalf("未知页类型应空回落: %q", title)
	}
}

// ⑤ 未配置/关闭回落: 零配置/脏 JSON/disabled 一律空三元组。
func TestTDKDisabledFallback(t *testing.T) {
	for _, raw := range []string{"", "   ", "not-json", `{}`, `{"enabled":false,"sets":[1,2],"pages":{"book":"smart"}}`, `{"enabled":true,"sets":[1,2]}`} {
		cfg := ParseSiteCfg(raw)
		if title, _, _ := BuildTDK(cfg, tdkFullCtx(), PageBook); title != "" {
			t.Fatalf("raw=%q 应空回落(未启用/无策略), 得 %q", raw, title)
		}
	}
	// enabled 但 sets 为空 → 空
	cfg := ParseSiteCfg(`{"enabled":true,"sets":[],"pages":{"book":"smart"}}`)
	if title, _, _ := BuildTDK(cfg, tdkFullCtx(), PageBook); title != "" {
		t.Fatalf("空 sets 应空回落")
	}
}

// ⑥ 配置消毒 + 站点级模板覆盖。
func TestTDKCfgSanitizeAndOverride(t *testing.T) {
	cfg := ParseSiteCfg(`{
                "enabled": true,
                "sets": [0, 1, 1, 19, -3, 5],
                "pages": {"book": "smart", "home": "on", "hacker": "smart", "toc": "banana"},
                "templates": {"1": {"title": "{站名}覆盖标题{书名}", "description": "覆盖描述{书名}完整版在线阅读通道，{站名}提供全文免费阅读服务，支持无弹窗界面与全本TXT下载，追更收藏两不误。"}, "99": {"title": "x", "description": "y"}}
        }`)
	if got := cfg.Sets; len(got) != 2 || got[0] != 1 || got[1] != 5 {
		t.Fatalf("sets 消毒结果不符(期望 [1 5]): %v", got)
	}
	if cfg.PageMode(PageBook) != PageModeSmart || cfg.PageMode(PageHome) != PageModeSmart {
		t.Fatalf("book/home 策略应为 smart: %v", cfg.Pages)
	}
	if cfg.PageMode(PageToc) != PageModeOff || cfg.PageMode("hacker") != PageModeOff {
		t.Fatalf("非法键/非法值应回落 off")
	}
	if _, ok := cfg.Templates["99"]; ok {
		t.Fatalf("越界覆盖键应剔除")
	}
	cfgB := cfg // 钉死单套(1 号), 消除随机选套对断言的干扰
	cfgB.Sets = []int{1}
	title, desc, _ := BuildTDK(cfgB, tdkFullCtx(), PageBook)
	if title != "测试书站覆盖标题测试书名" {
		t.Fatalf("站点级覆盖 title 未生效: %q", title)
	}
	if !strings.HasPrefix(desc, "覆盖描述测试书名完整版在线阅读") {
		t.Fatalf("站点级覆盖 desc 未生效: %q", desc)
	}
	assertNoResidual(t, "覆盖 title", title)
	// 覆盖模板仅作用于指定套
	cfg5 := ParseSiteCfg(`{"enabled":true,"sets":[5],"pages":{"book":"smart"},"templates":{"1":{"title":"只覆盖1号","description":"描述"}}}`)
	title, _, _ = BuildTDK(cfg5, tdkFullCtx(), PageBook)
	if strings.Contains(title, "只覆盖1号") {
		t.Fatalf("覆盖模板不应跨套生效: %q", title)
	}
}
