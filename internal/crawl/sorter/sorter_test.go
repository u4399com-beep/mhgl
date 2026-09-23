// ============================================================
// sorter 单测(R57-2a 清理回归锚) — sortStable 换 stdlib 稳定排序后行为不变:
//
//	① 序号排序 ② 同号稳定(输入序) ③ 无号回退原序 ④ URL/标题去重 ⑤ 分卷分组
//
// ============================================================
package sorter

import (
	"reflect"
	"testing"
)

func titles(items []TocItem) []string {
	out := make([]string, 0, len(items))
	for _, it := range items {
		out = append(out, it.Title)
	}
	return out
}

func TestReorderTocChapterNumbers(t *testing.T) {
	in := []TocItem{
		{Title: "第3章 三", URL: "http://a/3"},
		{Title: "序章", URL: "http://a/0"},
		{Title: "第1章 一", URL: "http://a/1"},
		{Title: "第10章 十", URL: "http://a/10"},
		{Title: "第2章 二", URL: "http://a/2"},
	}
	got := ReorderToc(in)
	want := []string{"序章", "第1章 一", "第2章 二", "第3章 三", "第10章 十"}
	if !reflect.DeepEqual(titles(got), want) {
		t.Fatalf("序号重排错误: got %v want %v", titles(got), want)
	}
}

// TestReorderTocStableSameNo 同号/无号条目保持输入序(sortStable 稳定性回归锚)
func TestReorderTocStableSameNo(t *testing.T) {
	in := []TocItem{
		{Title: "第1章 上", URL: "http://a/1a"},
		{Title: "番外一", URL: "http://a/x1"},
		{Title: "第1章 下", URL: "http://a/1b"},
		{Title: "番外二", URL: "http://a/x2"},
	}
	got := ReorderToc(in)
	// 序号比例 <0.6(2/4) → 无号回退路径: ≥8 项才做倒序检测, 4 项原序返回
	want := []string{"第1章 上", "番外一", "第1章 下", "番外二"}
	if !reflect.DeepEqual(titles(got), want) {
		t.Fatalf("无号小列表应原序: got %v", titles(got))
	}
	// 构造 ≥8 项且同号并列, 验证并列项相对序稳定
	in2 := make([]TocItem, 0, 8)
	for i := 0; i < 4; i++ {
		in2 = append(in2, TocItem{Title: "第1章 上" + string(rune('a'+i)), URL: "http://b/1" + string(rune('a'+i))})
		in2 = append(in2, TocItem{Title: "第2章 下" + string(rune('a'+i)), URL: "http://b/2" + string(rune('a'+i))})
	}
	got2 := ReorderToc(in2)
	for i := 0; i < 4; i++ {
		if got2[i].Title != "第1章 上"+string(rune('a'+i)) {
			t.Fatalf("并列同号相对序不稳定(位置 %d): %v", i, titles(got2))
		}
	}
}

func TestReorderTocDedup(t *testing.T) {
	in := []TocItem{
		{Title: "第1章", URL: "http://a/1"},
		{Title: "第1章", URL: "http://a/1/"}, // URL 归一后同键(尾斜杠)
		{Title: "第2章", URL: "http://a/2"},
	}
	got := ReorderToc(in)
	if len(got) != 2 {
		t.Fatalf("URL 去重失败: %v", titles(got))
	}
}

func TestReorderTocVolumeGrouping(t *testing.T) {
	// 注: 同标题跨卷去重属 TS 移植语义(sorter.ts seenTitle 全局去重), 测试用异题验证分组
	in := []TocItem{
		{Title: "第2章 二卷其二", URL: "http://a/v2c2", Volume: "第二卷"},
		{Title: "第一卷 风起", URL: "http://a/v1"},
		{Title: "第1章 一卷其一", URL: "http://a/v1c1", Volume: "第一卷"},
		{Title: "第2章 一卷其二", URL: "http://a/v1c2", Volume: "第一卷"},
		{Title: "第1章 二卷其一", URL: "http://a/v2c1", Volume: "第二卷"},
	}
	got := ReorderToc(in)
	want := []string{"第一卷 风起", "第1章 一卷其一", "第2章 一卷其二", "第1章 二卷其一", "第2章 二卷其二"}
	// 卷间: 第一卷(先现) → 第二卷; 卷内按章号, 卷扉(锚点)排最前
	if !reflect.DeepEqual(titles(got), want) {
		t.Fatalf("分卷重排错误: got %v want %v", titles(got), want)
	}
}
