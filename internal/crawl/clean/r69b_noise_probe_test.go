package clean

import (
	"strings"
	"testing"
)

// ---- 探针: 缺省清洗面对括号/装饰型整行 URL 的覆盖面 ----

func TestProbeBracketWrappedURLLine(t *testing.T) {
	cases := []struct{ name, in string }{
		{"全角括号包裹", "<p>（www.biqque.com）</p>"},
		{"全角括号包裹http", "<p>（http://www.biqque.com/）</p>"},
		{"方头括号包裹", "<p>【www.biqque.com】</p>"},
		{"方头括号包裹http", "<p>【http://www.biqque.com/】</p>"},
		{"破折号装饰", "<p>—— www.biqque.com ——</p>"},
		{"全角句号尾", "<p>www.biqque.com。</p>"},
		{"括号+书名推广", "<p>（更多精彩请关注 www.biqque.com）</p>"},
	}
	for _, c := range cases {
		out := htmlClean(t, "<p>正文A。</p>"+c.in+"<p>正文B。</p>")
		if strings.Contains(out, "biqque") {
			t.Logf("GAP[%s]: %q", c.name, out)
		}
	}
}
