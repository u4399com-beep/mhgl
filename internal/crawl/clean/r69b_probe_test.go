package clean

import (
	"strings"
	"testing"
)

// ---- 探针: 1.8 data-id 乱序段落重排 ----

func dataIDPage(ids []int, wrap string) string {
	var b strings.Builder
	for _, id := range ids {
		switch wrap {
		case "p":
			b.WriteString(`<p data-id="` + itoaProbe(id) + `"><p>段落` + itoaProbe(id) + `</p></p>`)
		case "plain":
			b.WriteString(`<div data-id="` + itoaProbe(id) + `">段落` + itoaProbe(id) + `</div>`)
		case "tail":
			// data-id 节点后紧跟非 data-id 兄弟(同组尾随节点)
			b.WriteString(`<div data-id="` + itoaProbe(id) + `">段落` + itoaProbe(id) + `</div><span>尾注` + itoaProbe(id) + `</span>`)
		}
	}
	return b.String()
}

func itoaProbe(n int) string {
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

func TestProbeReorderByDataIDShuffle(t *testing.T) {
	in := `<div id="__wrap">` + dataIDPage([]int{3, 1, 2}, "plain") + `</div>`
	out := CleanContentHTML(in, defaultConfig())
	// 乱序 → 升序重组
	i1 := strings.Index(out, "段落1")
	i2 := strings.Index(out, "段落2")
	i3 := strings.Index(out, "段落3")
	if i1 < 0 || i2 < 0 || i3 < 0 {
		t.Fatalf("段落丢失: %q", out)
	}
	if !(i1 < i2 && i2 < i3) {
		t.Fatalf("data-id 乱序未重排: %q", out)
	}
}

func TestProbeReorderByDataIDMonotonicUntouched(t *testing.T) {
	in := `<div id="__wrap">` + dataIDPage([]int{1, 2, 3}, "plain") + `</div>`
	out := CleanContentHTML(in, defaultConfig())
	i1 := strings.Index(out, "段落1")
	i2 := strings.Index(out, "段落2")
	i3 := strings.Index(out, "段落3")
	if !(i1 < i2 && i2 < i3) {
		t.Fatalf("单调序列被扰动: %q", out)
	}
}

func TestProbeReorderByDataIDTailGrouping(t *testing.T) {
	// 尾随节点(尾注N)应随其 data-id 头节点同组移动
	in := `<div id="__wrap">` + dataIDPage([]int{2, 1}, "tail") + `<div data-id="3">段落3</div><span>尾注3</span></div>`
	out := CleanContentHTML(in, defaultConfig())
	i1 := strings.Index(out, "段落1")
	i2 := strings.Index(out, "段落2")
	i3 := strings.Index(out, "段落3")
	if !(i1 < i2 && i2 < i3) {
		t.Fatalf("data-id 重排未生效: %q", out)
	}
	// 尾注1 应紧随 段落1(同组尾随)
	if !strings.Contains(out, "段落1") || !strings.Contains(out, "尾注1") {
		t.Fatalf("尾随节点丢失: %q", out)
	}
	seg := out[i1:]
	if !strings.Contains(seg[:min(len(seg), 200)], "尾注1") {
		t.Fatalf("尾注1 未随段落1 同组: %q", out)
	}
}

func TestProbeReorderByDataIDPTagWrap(t *testing.T) {
	// data-id 元素内部以 <p> 开头 → 原位展开(不产生嵌套 <p>)
	in := `<div id="__wrap">` + dataIDPage([]int{3, 1, 2}, "p") + `</div>`
	out := CleanContentHTML(in, defaultConfig())
	if strings.Count(out, "<p>") > 6 {
		t.Fatalf("嵌套段落异常: %q", out)
	}
	i1 := strings.Index(out, "段落1")
	i2 := strings.Index(out, "段落2")
	i3 := strings.Index(out, "段落3")
	if !(i1 < i2 && i2 < i3) {
		t.Fatalf("p 包裹形态未重排: %q", out)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
