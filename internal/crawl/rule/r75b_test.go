// ============================================================
// [R75-b] rule 包回归 —— 畸形模板容错 + jsonGet 越界边界钉子
// ============================================================
package rule

import "testing"

// TestR75bExpandListURLHugeOffset {offset:超长数字} 溢出 fail-closed:
// 修前 atoiSafe 无溢出预判, int64 回绕渲染出 "list--2914184810805067778.html"
// 垃圾 URL 参与抓取(探针实证); 修后越界回 def=1, 与 parseBookIDNum 同族口径。
func TestR75bExpandListURLHugeOffset(t *testing.T) {
	got := ExpandListURL("http://x/list-{offset:99999999999999999999}.html", 3)
	want := "http://x/list-2.html" // def=1 → (3-1)*1=2
	if got != want {
		t.Fatalf("huge offset 渲染 = %q, want %q", got, want)
	}
	// 边界内行为零回归: 19 位(1<<62 内)仍按值展开
	got2 := ExpandListURL("http://x/list-{offset:1000}.html", 2)
	if got2 != "http://x/list-1000.html" {
		t.Fatalf("正常 offset 回归: %q", got2)
	}
	// 编码形态同口径
	got3 := ExpandListURL("http://x/list-%7Boffset%3A99999999999999999999%7D.html", 2)
	if got3 != "http://x/list-1.html" {
		t.Fatalf("编码形态 huge offset = %q, want http://x/list-1.html", got3)
	}
}

// TestR75bJSONGetHugeIndex jsonGet 超长数字段边界钉子: Atoi ErrRange 返回钳制
// 最大值(非 0), 越界段恒 undefined→空, 不得错位取 arr[0]。
func TestR75bJSONGetHugeIndex(t *testing.T) {
	root := parseJsonBody(`{"list":[{"name":"第一本"},{"name":"第二本"}]}`)
	if got := jsonToString(jsonGet(root, "list.99999999999999999999.name")); got != "" {
		t.Fatalf("huge path index 错位返回: %q", got)
	}
	if got := jsonToString(jsonGet(root, "list[99999999999999999999].name")); got != "" {
		t.Fatalf("huge op index 错位返回: %q", got)
	}
	// 正常下标零回归
	if got := jsonToString(jsonGet(root, "list.1.name")); got != "第二本" {
		t.Fatalf("正常下标回归: %q", got)
	}
}
