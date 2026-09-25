// ============================================================
// R66-c — 智能 TDK 引擎回归(抓虫修复钉)
//
//	① 产出长度钳制: 爬虫可控的超长书名/作者/分类经占位符直出时,
//	   title≤40 / description≤160 / keywords≤200 码点(对齐 web/seo.go
//	   composeXxxTdk 站内口径), 修前 BuildTDK 输出无界 <title>。
//	② 站点级覆盖模板(ParseSiteCfg 允许 500 码点入)渲染产出同受钳制。
//	③ 空作者回落「佚名」: 11 套书族模板「{作者}创作的」空洞语法修复。
//	④ 常规长度书名产出不受钳制影响(截断面只命中病态输入)。
//
// ============================================================
package smart

import (
	"strings"
	"testing"
	"unicode/utf8"
)

// tdkLongCtx 病态长输入上下文(书名 300 CJK 码点等, 模拟爬虫直灌数据)。
func tdkLongCtx() TDKCtx {
	return TDKCtx{
		SiteName: strings.Repeat("站", 120),
		BookName: strings.Repeat("书", 300),
		Author:   strings.Repeat("作", 200),
		Category: strings.Repeat("分", 100),
		Status:   "连载中",
		Words:    1_500_000,
		Year:     "2025",
	}
}

// ① 全套 × 全页类型 × 病态长输入: 三件套全部落在站内码点上限内。
func TestR66cTDKOutputClamps(t *testing.T) {
	cfg := tdkAllSets()
	ctx := tdkLongCtx()
	for _, p := range tdkPresets {
		for _, pt := range p.Pages {
			title, desc, kw := BuildTDK(cfg, ctx, pt)
			if title == "" || desc == "" {
				t.Fatalf("套%d/%s 长输入渲染为空(应钳制而非回落)", p.ID, pt)
			}
			if n := utf8.RuneCountInString(title); n > tdkTitleMaxCodePoints {
				t.Fatalf("套%d/%s title %d 码点超上限 %d", p.ID, pt, n, tdkTitleMaxCodePoints)
			}
			if n := utf8.RuneCountInString(desc); n > tdkDescMaxCodePoints {
				t.Fatalf("套%d/%s desc %d 码点超上限 %d", p.ID, pt, n, tdkDescMaxCodePoints)
			}
			if n := utf8.RuneCountInString(kw); n > 200 {
				t.Fatalf("套%d/%s keywords %d 码点超上限 200", p.ID, pt, n)
			}
		}
	}
}

// ② 站点级覆盖模板超长入参 → 渲染产出同样受钳。
func TestR66cTDKOverrideTemplateClamped(t *testing.T) {
	huge := strings.Repeat("超", 500)
	raw := `{"enabled":true,"sets":[1],"pages":{"book":"smart"},"templates":{"1":{"title":"` + huge + `{书名}","description":"` + huge + `{书名}描述"}}}`
	cfg := ParseSiteCfg(raw)
	title, desc, _ := BuildTDK(cfg, tdkFullCtx(), PageBook)
	if title == "" || desc == "" {
		t.Fatalf("覆盖模板渲染为空")
	}
	if n := utf8.RuneCountInString(title); n > tdkTitleMaxCodePoints {
		t.Fatalf("覆盖模板 title %d 码点超上限", n)
	}
	if n := utf8.RuneCountInString(desc); n > tdkDescMaxCodePoints {
		t.Fatalf("覆盖模板 desc %d 码点超上限", n)
	}
}

// ③ 空作者 → 佚名(防「是创作的小说」空洞语法)。
func TestR66cAuthorFallbackAnonymous(t *testing.T) {
	cfg := TDKSiteCfg{Enabled: true, Sets: []int{1}, Pages: map[string]string{PageBook: PageModeSmart}}
	ctx := TDKCtx{SiteName: "测试书站", BookName: "测试书名", Category: "玄幻奇幻", Status: "连载中", Year: "2025"}
	title, desc, _ := BuildTDK(cfg, ctx, PageBook)
	if !strings.Contains(desc, "佚名创作的") {
		t.Fatalf("空作者应回落佚名: %q", desc)
	}
	if strings.Contains(title, "{作者}") || strings.Contains(desc, "{作者}") {
		t.Fatalf("占位符残留: %q | %q", title, desc)
	}
	// 非空作者不受回落影响
	ctx.Author = "真作者"
	_, desc2, _ := BuildTDK(cfg, ctx, PageBook)
	if strings.Contains(desc2, "佚名") || !strings.Contains(desc2, "真作者创作的") {
		t.Fatalf("非空作者被误回落: %q", desc2)
	}
}

// ④ 常规输入不被钳制截断(病态面才有截断)。
func TestR66cNormalInputUnclamped(t *testing.T) {
	cfg := TDKSiteCfg{Enabled: true, Sets: []int{1}, Pages: map[string]string{PageBook: PageModeSmart}}
	ctx := TDKCtx{SiteName: "测试书站", BookName: "平凡书名", Author: "平凡作者", Category: "玄幻奇幻", Status: "连载中", Words: 120_000, Year: "2025"}
	title, desc, _ := BuildTDK(cfg, ctx, PageBook)
	if title != "《平凡书名》- 测试书站" {
		t.Fatalf("常规 title 不应被钳制改写: %q", title)
	}
	if !strings.HasPrefix(desc, "《平凡书名》是平凡作者创作的连载中玄幻奇幻小说") {
		t.Fatalf("常规 desc 前段不应被截断: %q", desc)
	}
}
