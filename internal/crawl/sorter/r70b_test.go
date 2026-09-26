// ============================================================
// [R70-b] 千位分隔符章号回归锚 — replaceThousand 组 1 吞噬真虫修复:
// 修前 s[last:loc[2]] 止于组 1 起点, "第1,234章" 序号被整段截成 234
// (千位章号书整体错序); 修后 prefix+组1+组2 与 TS '$1$2' 同口径。
// ============================================================
package sorter

import (
	"reflect"
	"testing"
)

func TestReplaceThousand_Group1Preserved(t *testing.T) {
	cases := []struct{ in, want string }{
		{"第1,234章", "第1234章"},
		{"第12,345章", "第12345章"},
		{"第1，234章", "第1234章"},         // 中文逗号同口径
		{"第1,234,567章", "第1234,567章"}, // TS 单趟语义对齐(第二段交由解析层既有容错)
		{"第1,23章", "第1,23章"},          // 非三位组不命中
		{"第1,2345章", "第1,2345章"},      // (?!\d): 后随数字 → 本匹配无效原样保留
		{"第1234章", "第1234章"},          // 无分隔符恒等
		{"更新于1,234章之后", "更新于1234章之后"}, // 任意位置千位折叠
	}
	for _, c := range cases {
		if got := replaceThousand(c.in); got != c.want {
			t.Errorf("replaceThousand(%q) = %q, 期望 %q", c.in, got, c.want)
		}
	}
}

func TestReorderToc_ThousandSeparatorOrder(t *testing.T) {
	// 端到端: 千位章号修前以 234 参与排序(1,234→234), 与真实 1234 位书序错乱;
	// 修后按 1234/1000 归位。
	in := []TocItem{
		{Title: "第1,234章 大场面", URL: "http://a/1234"},
		{Title: "第233章 前奏", URL: "http://a/233"},
		{Title: "第1,000章 里程碑", URL: "http://a/1000"},
		{Title: "第100章 开荒", URL: "http://a/100"},
	}
	want := []string{"第100章 开荒", "第233章 前奏", "第1,000章 里程碑", "第1,234章 大场面"}
	if got := titles(ReorderToc(in)); !reflect.DeepEqual(got, want) {
		t.Fatalf("千位章号排序错乱: got %v want %v", got, want)
	}
}
