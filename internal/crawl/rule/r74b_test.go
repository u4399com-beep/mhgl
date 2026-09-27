package rule

import (
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

// [R74-b 虫①回归] URL 内控制字符(tab/LF/CR)穿透 —— HTML 属性值内三者合法存在,
// 浏览器 WHATWG URL 解析删除后正常请求; 修前 absolutize 绝对形态原样穿透,
// 下游 Go http 传输层报 invalid control character 必败(丢链烧重试)。
func TestR74bAbsolutizeURLControlChars(t *testing.T) {
	cases := [][3]string{
		{"http://x.com\n/chapter/1.html", "http://www.x.com/book/1/", "http://x.com/chapter/1.html"},
		{"http://x.com\t/a?b=1", "http://www.x.com/book/1/", "http://x.com/a?b=1"},
		{"http://x.com/a\rb", "http://www.x.com/", "http://x.com/ab"},
		{"\n/chapter/2.html", "http://www.x.com/book/1/", "http://www.x.com/chapter/2.html"},
		{"/c\r/3.html", "http://www.x.com/book/1/", "http://www.x.com/c/3.html"},
	}
	for _, c := range cases {
		if got := absolutize(c[0], c[1]); got != c[2] {
			t.Errorf("absolutize(%q) = %q, want %q", c[0], got, c[2])
		}
	}
	// 正常 URL 零影响(既有语义回归)
	if got := absolutize("http://x.com/a", ""); got != "http://x.com/a" {
		t.Errorf("正常 URL 被改动: %q", got)
	}
}

// [R74-b 虫①回归·base 臂] <base href> 属性值含换行: 修前 docBase 返回脏基址,
// 页面全部相对链接 resolveRef 必败; 修后基址剥离控制字符。
func TestR74bDocBaseControlChars(t *testing.T) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(
		`<html><head><base href="http://www.x.com
/book/"></head><body></body></html>`))
	if err != nil {
		t.Fatal(err)
	}
	got := docBase(doc, "http://www.x.com/toc/")
	if got != "http://www.x.com/book/" {
		t.Errorf("docBase(含 LF href) = %q, want %q", got, "http://www.x.com/book/")
	}
	// 无 base / 正常 base 回归
	doc2, _ := goquery.NewDocumentFromReader(strings.NewReader(`<html><head></head><body></body></html>`))
	if got := docBase(doc2, "http://www.x.com/toc/"); got != "http://www.x.com/toc/" {
		t.Errorf("无 base 回归: %q", got)
	}
}

// [R74-b 虫②回归] ParseBook 双重 absolutize: 修前 JSON 书籍页 cover 经
// ParseList(JSON 分支 absolutizeFields)+ParseBook(出口 absolutize) 双重处理,
// 白名单实体多解一层("&amp;amp;copy;=2" 两次解码 → "&copy;=2", TS/浏览器单次
// 语义应为 "&amp;copy;=2")。修后三分支统一单次处理。
func TestR74bParseBookSingleAbsolutize(t *testing.T) {
	// JSON 书籍页(源 JSON 字面含双重转义形态)
	html := `{"cover":"http://x.com/img?a=1&amp;amp;copy;=2"}`
	pr := &PageRule{Fields: map[string]*FieldRule{
		"cover": {Type: "json", Expression: "cover"},
	}}
	pb := ParseBook(html, "http://x.com/book/1/", pr)
	if want := "http://x.com/img?a=1&amp;copy;=2"; pb.Cover != want {
		t.Errorf("JSON 书籍页 cover 双重处理残留: got %q want %q", pb.Cover, want)
	}
	// 无容器 HTML 书籍页: 相对 cover 恰好绝对化一次(修前靠 ParseBook 出口兜底,
	// 修后由 ParseList 无容器分支统一处理)
	html2 := `<html><body><img class="cover" src="/img/1.jpg"></body></html>`
	pr2 := &PageRule{Fields: map[string]*FieldRule{
		"cover": {Type: "css", Expression: "img.cover", Attr: "src"},
	}}
	pb2 := ParseBook(html2, "http://www.x.com/book/9/", pr2)
	if pb2.Cover != "http://www.x.com/img/1.jpg" {
		t.Errorf("无容器书籍页 cover 绝对化: got %q", pb2.Cover)
	}
}
