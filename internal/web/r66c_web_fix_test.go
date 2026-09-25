// ============================================================
// R66-c — web 层抓虫修复回归钉
//
//	① tagReFor/tagReCache 并发安全: 修前 hasAnyTag 冷缓存并发写共享 map
//	   (Go 运行时并发 map 写 = 进程级 fatal, 不可 recover); 并发锤击验证
//	   无竞态(-race 下若加锁缺失必红)、产出语义不变。
//	② contentToParagraphs 段落规整语义保持(锁重构零行为变化)。
//
// ============================================================
package web

import (
	"strings"
	"sync"
	"testing"
)

// ① 并发锤击 tagReFor/hasAnyTag(锁路径; go test -race 下锁缺失必报 DATA RACE)。
func TestR66cTagReCacheConcurrent(t *testing.T) {
	tags := []string{"p", "div", "br", "span", "section"} // 前 3 键为生产热路径, 后 2 键扩大写窗口
	var wg sync.WaitGroup
	for g := 0; g < 16; g++ {
		wg.Add(1)
		go func(gid int) {
			defer wg.Done()
			for i := 0; i < 200; i++ {
				for _, tag := range tags {
					if !tagReFor(tag).MatchString("<" + tag + ">") {
						t.Errorf("tagReFor(%q) 产出正则失配", tag)
						return
					}
				}
				if hasAnyTag("<p>x</p><div>y</div><br/>", "p", "div", "br") != true {
					t.Errorf("hasAnyTag 命中语义漂移")
					return
				}
			}
		}(g)
	}
	wg.Wait()
}

// ② contentToParagraphs 语义钉(纯文本分段转义 / HTML 直通 / 单 <p> 内 \n→<br/>)。
func TestR66cContentToParagraphsSemantics(t *testing.T) {
	// 纯文本 → 逐段包 <p> 且 HTML 转义(防存储型注入)
	out := contentToParagraphs("第一段<script>alert(1)</script>\n\n第二段")
	if !strings.Contains(out, "<p>第一段&lt;script&gt;") || !strings.Contains(out, "<p>第二段</p>") {
		t.Fatalf("纯文本段落转义语义漂移: %q", out)
	}
	// 已含多 <p> 的 HTML 原样直通(交由 sanitizeChapterHTML 展示级消毒)
	if out := contentToParagraphs("<p>a</p><p>b</p>"); out != "<p>a</p><p>b</p>" {
		t.Fatalf("HTML 直通语义漂移: %q", out)
	}
	// 单 <p> 包裹+内部换行 → \n 转 <br/>
	if out := contentToParagraphs("<p>行一\n行二</p>"); out != "<p>行一<br/>行二</p>" {
		t.Fatalf("单段换行转 <br/> 语义漂移: %q", out)
	}
	if out := contentToParagraphs("   "); out != "" {
		t.Fatalf("空白输入应为空: %q", out)
	}
}
