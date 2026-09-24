// ============================================================
// R64-c — Web SSR 查询串收口回归(clampInput: 搜索 q/关键词 tag/分类锚名)
// (纯函数测试, 无 DB 依赖)
// ============================================================
package web

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestClampInput(t *testing.T) {
	// 常规输入透传
	if got := clampInput("斗破苍穹", 100); got != "斗破苍穹" {
		t.Fatalf("常规输入被改动: %q", got)
	}
	// trim
	if got := clampInput("  abc  ", 100); got != "abc" {
		t.Fatalf("trim 失效: %q", got)
	}
	// ASCII 超长按码点钳
	if got := clampInput(strings.Repeat("A", 3000), 100); len(got) != 100 {
		t.Fatalf("超长未钳: len=%d", len(got))
	}
	// CJK 超长按码点钳且不产生非法 UTF-8
	in := strings.Repeat("书", 3000)
	got := clampInput(in, 100)
	if n := utf8.RuneCountInString(got); n != 100 {
		t.Fatalf("CJK 码点钳长失效: runes=%d", n)
	}
	if !utf8.ValidString(got) {
		t.Fatalf("钳长产出非法 UTF-8")
	}
	// 空串安全
	if got := clampInput("", 100); got != "" {
		t.Fatalf("空串异常: %q", got)
	}
	// max<=0 = 不钳制(clampCodePoints 契约; 调用方恒传正常量)
	if got := clampInput("abc", 0); got != "abc" {
		t.Fatalf("max=0 应不钳制透传: %q", got)
	}
}
