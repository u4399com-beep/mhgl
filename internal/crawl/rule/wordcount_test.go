// ============================================================
// [R62-f] parseWordCount 字数解析 + ParseBook wordCount 映射回归
// 形态来源(R61-1B 实测留档): taijiwang word_number=3079864(纯数字),
// shudugu .itemtxt h1 i = "353.5万字"(带单位)。
// ============================================================
package rule

import (
	"testing"
)

func TestParseWordCount(t *testing.T) {
	cases := []struct {
		in   string
		want int64
	}{
		// 纯数字形态
		{"3079864", 3079864},
		{"3,079,864", 3079864},
		{" 3 079 864 ", 3079864},
		{"3079864字", 3079864},
		// 中文带单位形态
		{"353.5万字", 3535000},
		{"353.5万", 3535000},
		{"353万字", 3530000},
		{"共 353.5 万字", 3535000},
		{"约0.8万字", 8000},
		{"1.2亿字", 120000000},
		{"12亿", 1200000000},
		{"１２３４５", 12345},        // 全角数字
		{"353．5万字", 3535000},    // 全角小数点
		{"字数：3079864", 3079864}, // 前缀杂字符
		{"16441016", 16441016},  // qimao book.words 实测形态
		// 非法/边界 → 0
		{"", 0},
		{"   ", 0},
		{"暂无字数", 0},
		{"连载中", 0},
		{"3.5.7万字", 0},      // 双小数点
		{".", 0},            // 裸点
		{"99999999999", 0},  // 超合理上限(百亿字)判脏数据
		{"99999999999字", 0}, // 同上带尾缀
		{"0", 0},            // 零不产出有效值
	}
	for _, c := range cases {
		if got := parseWordCount(c.in); got != c.want {
			t.Errorf("parseWordCount(%q)=%d want %d", c.in, got, c.want)
		}
	}
}

func TestParseBookWordCountMapping(t *testing.T) {
	html := `<html><body>
<h1>凡人修仙传</h1>
<div class="meta"><span class="writer">忘语</span></div>
<div class="itemtxt"><h1><i>353.5万字</i></h1></div>
</body></html>`
	pr := &PageRule{Fields: map[string]*FieldRule{
		"name":      {Type: "css", Expression: "h1", Attr: "text", Index: idx(0)},
		"wordCount": {Type: "css", Expression: ".itemtxt h1 i", Attr: "text"},
	}}
	pb := ParseBook(html, "http://x/book/1.html", pr)
	if pb.Name == "" {
		t.Fatalf("name must be extracted, got %+v", pb)
	}
	if pb.WordCount != 3535000 {
		t.Fatalf("wordCount=%d want 3535000(「353.5万字」归一)", pb.WordCount)
	}

	// 纯数字形态(taijiwang API 壳页: word_number 裸数字)
	html2 := `<html><body><h1>书名甲</h1><div id="wn">3079864</div></body></html>`
	pr2 := &PageRule{Fields: map[string]*FieldRule{
		"name":      {Type: "css", Expression: "h1", Attr: "text"},
		"wordCount": {Type: "css", Expression: "#wn", Attr: "text"},
	}}
	pb2 := ParseBook(html2, "http://x/book/2.html", pr2)
	if pb2.WordCount != 3079864 {
		t.Fatalf("wordCount=%d want 3079864(纯数字)", pb2.WordCount)
	}

	// 规则未配置 wordCount / 提取到脏值 → 0(不落库, 聚合链兜底)
	html3 := `<html><body><h1>书名乙</h1><div id="wn">连载中</div></body></html>`
	pb3 := ParseBook(html3, "http://x/book/3.html", pr2)
	if pb3.WordCount != 0 {
		t.Fatalf("dirty wordCount must map to 0, got %d", pb3.WordCount)
	}
	pr4 := &PageRule{Fields: map[string]*FieldRule{"name": {Type: "css", Expression: "h1", Attr: "text"}}}
	pb4 := ParseBook(html3, "http://x/book/3.html", pr4)
	if pb4.WordCount != 0 {
		t.Fatalf("absent wordCount must stay 0, got %d", pb4.WordCount)
	}
}

func idx(i int) *int { return &i }
