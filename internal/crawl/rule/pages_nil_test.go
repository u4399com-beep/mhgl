// ============================================================
// ParseToc 防御性单测(R57-2a) — nil 规则守卫(修前 HTML 分支空指针 panic 面)
// ============================================================
package rule

import (
	"context"
	"testing"
)

func TestParseTocNilRuleGuard(t *testing.T) {
	items, pages := ParseToc(context.Background(), "http://a/toc", "<html><body>空</body></html>", nil, nil, nil)
	if len(items) != 0 || pages != 1 {
		t.Fatalf("nil 规则应返回空结果 1 页: items=%d pages=%d", len(items), pages)
	}
}
