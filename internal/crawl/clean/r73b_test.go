package clean

import (
	"strings"
	"testing"
)

// R73-b: DB 只读副本整章复采实证(xyetianlian 现役残留, 原探针 /tmp/r73b/ch296.txt
// 的三形态内联转正; 清洗断言对当前缺省管线)。

func TestR73b_ReadxFingerprintParagraph(t *testing.T) {
	// 防采集指纹串独立段落整段回收; 变体(带属性/无分号/空白内衬)同口径
	cases := []string{
		`<p>正文一。</p><p>readx;</p><p>正文二。</p>`,
		`<p>正文一。</p><p class="c">readx</p><p>正文二。</p>`,
	}
	for _, doc := range cases {
		got := CleanContentHTML(doc, defaultConfig())
		if strings.Contains(got, "readx") {
			t.Errorf("指纹段残留: %s", got)
		}
		if !strings.Contains(got, "正文一。") || !strings.Contains(got, "正文二。") {
			t.Errorf("正文误伤: %s", got)
		}
	}
	// 反例: 正文行内出现 readx 字样(非独立段)不回收 —— 段落锚零误伤
	keep := `<p>他说这本书的 readx 版本不错。</p>`
	if got := CleanContentHTML(keep, defaultConfig()); !strings.Contains(got, "readx") {
		t.Errorf("行内 readx 被误伤: %s", got)
	}
}

func TestR73b_BrandFullwidthPercentSeparator(t *testing.T) {
	// [8] 隔符类 ％% 补齐: "笔％趣％阁" 整形回收; 正文 "笔％利润…" 无阁字收尾不命中
	got := CleanContentHTML(`<p>他走进书屋，笔％趣％阁的招牌挂在门口。</p>`, defaultConfig())
	if strings.Contains(got, "笔％趣％阁") {
		t.Errorf("全角％隔符品牌残留: %s", got)
	}
	keep := CleanContentHTML(`<p>成本里笔％利润占比很低，阁下怎么看。</p>`, defaultConfig())
	if !strings.Contains(keep, "笔％利润") {
		t.Errorf("正文笔％利润被误伤: %s", keep)
	}
}

func TestR73b_HandLineParagraphShellRegression(t *testing.T) {
	// [9] 段壳手打行(★★手打★шшш..★) — DB 实证形态回归(现行为已清, 钉住防回归)
	got := CleanContentHTML(`<p>正文。</p><p>★★手打★шшш..★</p><p>续文。</p>`, defaultConfig())
	if strings.Contains(got, "手打") {
		t.Errorf("段壳手打行残留: %s", got)
	}
	if !strings.Contains(got, "正文。") || !strings.Contains(got, "续文。") {
		t.Errorf("正文误伤: %s", got)
	}
}
