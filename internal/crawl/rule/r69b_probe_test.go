package rule

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

// ---- 探针: ParseToc 翻页合并/防环 ----

func tocPage(base int, items int, next string) string {
	var b strings.Builder
	b.WriteString("<html><body>")
	for i := 1; i <= items; i++ {
		n := base + i
		fmt.Fprintf(&b, `<div class="item"><a href="/book/%d.html">第%d章</a></div>`, n, n)
	}
	if next != "" {
		fmt.Fprintf(&b, `<a id="next" href="%s">下一页</a>`, next)
	}
	b.WriteString("</body></html>")
	return b.String()
}

func TestProbeTocPaginationChain(t *testing.T) {
	pages := map[string]string{
		"http://x/toc/1.html": tocPage(0, 10, "2.html"),
		"http://x/toc/2.html": tocPage(100, 10, "3.html"),
		"http://x/toc/3.html": tocPage(200, 10, ""),
	}
	fetcher := func(ctx context.Context, u, referer string) (string, error) {
		if p, ok := pages[u]; ok {
			return p, nil
		}
		return "", fmt.Errorf("404: %s", u)
	}
	rule := &PageRule{
		ItemSelector: &FieldRule{Type: "css", Expression: "div.item"},
		Fields: map[string]*FieldRule{
			"title": {Type: "css", Expression: "a"},
			"url":   {Type: "css", Expression: "a", Attr: "href"},
		},
		Pagination: &Pagination{Enabled: true, NextLink: &FieldRule{Type: "css", Expression: "a#next"}, MaxPages: 20},
	}
	items, used := ParseToc(context.Background(), "http://x/toc/1.html", pages["http://x/toc/1.html"], rule, fetcher, nil)
	if used != 3 {
		t.Fatalf("pagesUsed = %d, want 3", used)
	}
	if len(items) != 30 {
		t.Fatalf("items = %d, want 30", len(items))
	}
	for i, it := range items {
		wantNo := i + 1
		if i >= 10 {
			wantNo = 100 + (i - 10) + 1
		}
		if i >= 20 {
			wantNo = 200 + (i - 20) + 1
		}
		want := fmt.Sprintf("http://x/book/%d.html", wantNo)
		if it.URL != want {
			t.Fatalf("items[%d].URL = %q, want %q", i, it.URL, want)
		}
	}
}

func TestProbeTocPaginationSamePathStreak(t *testing.T) {
	// 伪翻页: next 恒为同 path(list_1.html)不同 query —— 站点永远给 next
	page := func(n int) string {
		return tocPage(n*100, 5, fmt.Sprintf("list_1.html?p=%d", n+1))
	}
	pages := map[string]string{}
	for i := 1; i <= 30; i++ {
		pages[fmt.Sprintf("http://x/toc/list_1.html?p=%d", i)] = page(i)
	}
	fetcher := func(ctx context.Context, u, referer string) (string, error) {
		if p, ok := pages[u]; ok {
			return p, nil
		}
		return "", fmt.Errorf("404: %s", u)
	}
	rule := &PageRule{
		ItemSelector: &FieldRule{Type: "css", Expression: "div.item"},
		Fields: map[string]*FieldRule{
			"title": {Type: "css", Expression: "a"},
			"url":   {Type: "css", Expression: "a", Attr: "href"},
		},
		Pagination: &Pagination{Enabled: true, NextLink: &FieldRule{Type: "css", Expression: "a#next"}, MaxPages: 500},
	}
	// 页 1 URL: http://x/toc/list_1.html?p=1
	items, used := ParseToc(context.Background(), "http://x/toc/list_1.html?p=1", pages["http://x/toc/list_1.html?p=1"], rule, fetcher, nil)
	// 同 path 连 5 次即停: 第 6 页比较命中 streak=5 且本页未解析即 break →
	// [R69-b] 实际使用页数=已解析的 5 页(修前 off-by-one 报 6)
	if used != 5 {
		t.Fatalf("同 path 防环 pagesUsed = %d (expect 5, 未解析页不计数)", used)
	}
	// 页 1..5 各 5 条不同 URL → 25 条
	if len(items) != 25 {
		t.Fatalf("items = %d, want 25", len(items))
	}
}

func TestProbeContentPaginationJoin(t *testing.T) {
	pages := map[string]string{
		"http://x/c/1.html": `<html><body><div id="c">第一页内容。</div><a id="next" href="2.html">下一页</a></body></html>`,
		"http://x/c/2.html": `<html><body><div id="c">第二页内容。</div><a id="next" href="3.html">下一页</a></body></html>`,
		"http://x/c/3.html": `<html><body><div id="c">第三页内容。</div></body></html>`,
	}
	fetcher := func(ctx context.Context, u, referer string) (string, error) {
		if p, ok := pages[u]; ok {
			return p, nil
		}
		return "", fmt.Errorf("404: %s", u)
	}
	rule := &PageRule{
		Fields:     map[string]*FieldRule{"content": {Type: "css", Expression: "#c", Attr: "html"}},
		Pagination: &Pagination{Enabled: true, NextLink: &FieldRule{Type: "css", Expression: "a#next"}, MaxPages: 10, JoinWith: "<br/>"},
	}
	res := ParseContent(context.Background(), "http://x/c/1.html", pages["http://x/c/1.html"], rule, fetcher)
	if res.Pages != 3 {
		t.Fatalf("pages = %d, want 3", res.Pages)
	}
	for _, want := range []string{"第一页内容。", "第二页内容。", "第三页内容。"} {
		if !strings.Contains(res.Content, want) {
			t.Fatalf("content 缺 %q: %q", want, res.Content)
		}
	}
}
