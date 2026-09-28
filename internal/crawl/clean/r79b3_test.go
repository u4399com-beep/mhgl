// ============================================================
// R79 批3(i14) 回归测试 — clean 包
//
//   - [R79-i14] removeLonelyMaskTokens 批量回收硬化: 差分测试(逐个回收参考实现 vs
//     批量实现, 随机 token/文本布局)钉死不动点语义等价 + 链接墙病态输入端到端行为
//     (全量回收/无掩码残留/正文内 URL 防误伤)。
//
// ============================================================
package clean

import (
	"fmt"
	"math/rand"
	"strings"
	"testing"
)

// removeLonelyMaskTokensSeq 逐个回收参考实现(R64-b 原始语义: 每轮回收首个孤立 token
// 后从头重扫至不动点) — 差分基准, 与批量实现须恒等(不动点唯一性)。
func removeLonelyMaskTokensSeq(s string) string {
	for {
		loc := maskRestoreRe.FindStringIndex(s)
		for loc != nil && !lonelyMaskAt(s, loc) {
			next := maskRestoreRe.FindStringIndex(s[loc[1]:])
			if next == nil {
				loc = nil
				break
			}
			loc = []int{loc[1] + next[0], loc[1] + next[1]}
		}
		if loc == nil {
			return s
		}
		s = s[:loc[0]] + s[loc[1]:]
	}
}

// buildMasked 构造掩码期文本: parts 交错真实文本段与 URL 段(URL 段经 urlMaskRe 掩码)。
func buildMasked(parts []string) string {
	return removeAdLinesMaskOnly(strings.Join(parts, ""))
}

// removeAdLinesMaskOnly 只做 URL 掩码不做模式删除(复刻 removeAdLines 掩码段)。
func removeAdLinesMaskOnly(text string) string {
	var urls []string
	out := urlMaskRe.ReplaceAllStringFunc(text, func(m string) string {
		urls = append(urls, m)
		idx := len(urls) - 1
		return maskOpen + itoa(idx*10+(idx%9+1)) + maskClose
	})
	_ = urls
	return out
}

// TestR79b3LonelyMaskBatchDifferential 批量实现 vs 逐个参考实现差分(固定种子随机布局):
// 布局要素 = 标签边界('>'/'<')/空白走廊(含 U+00A0/U+3000)/正文文本/相邻 token 簇 ——
// 覆盖「删除后邻居转孤立」「相邻 token 互挡」「文本起点/终点边界」全判定臂。
func TestR79b3LonelyMaskBatchDifferential(t *testing.T) {
	rnd := rand.New(rand.NewSource(79))
	fragments := []string{
		">", "<", "</p>", "<p>", "<br>", "正文", "段落文本。",
		" ", "\n", "\u00a0", "\u3000", "  \n ", "",
		"https://a.example.com/x?y=1", "http://b.cn/", "www.c.top/p",
	}
	for caseID := 0; caseID < 300; caseID++ {
		n := 2 + rnd.Intn(24)
		var sb strings.Builder
		for i := 0; i < n; i++ {
			sb.WriteString(fragments[rnd.Intn(len(fragments))])
		}
		in := sb.String()
		masked := removeAdLinesMaskOnly(in)
		want := removeLonelyMaskTokensSeq(masked)
		got := removeLonelyMaskTokens(masked)
		if got != want {
			t.Fatalf("case %d 差分不一致\nin=%q\nwant=%q\ngot=%q", caseID, in, want, got)
		}
		// 二次不动点校验: 输出再跑一遍恒等(两实现皆然)
		if again := removeLonelyMaskTokens(got); again != got {
			t.Fatalf("case %d 非不动点: %q → %q", caseID, got, again)
		}
	}
}

// TestR79b3LonelyMaskLinkWall 病态链接墙端到端(HTML 模式清洗全管线): 连续裸 URL 行
// (R79-i14 O(k·len) 放大形态)全部回收且无掩码占位符残留; 千行级输入限时完成由
// go test 默认超时兜底(修前此形态分钟级, 修后毫秒级)。
func TestR79b3LonelyMaskLinkWall(t *testing.T) {
	var sb strings.Builder
	for i := 0; i < 2000; i++ {
		fmt.Fprintf(&sb, "<p>https://ads%d.example.com/path?u=%d</p>", i, i)
	}
	out := CleanContentHTML(sb.String(), defaultConfig())
	if strings.Contains(out, "\uE000") || strings.Contains(out, "\uE001") {
		t.Fatalf("掩码占位符残留: %q", util_truncate(out, 200))
	}
	if strings.Contains(out, "ads0.example.com") {
		t.Fatalf("链接墙 URL 未回收: %q", util_truncate(out, 200))
	}
}

// TestR79b3LonelyMaskKeepInlineURL 防误伤回归: 正文内紧贴文字的 URL(非孤立行)不被
// 孤立回收; 孤立行(前 '>' 后 '<')回收。
func TestR79b3LonelyMaskKeepInlineURL(t *testing.T) {
	keep := CleanContentHTML("<p>官网公告见 https://help.example.com/notice 页面</p>", defaultConfig())
	if !strings.Contains(keep, "https://help.example.com/notice") {
		t.Fatalf("正文内 URL 被误回收: %q", keep)
	}
	lonely := CleanContentHTML("<p>正文前段</p>https://spam.example.com<a>x</a>", defaultConfig())
	if strings.Contains(lonely, "spam.example.com") {
		t.Fatalf("孤立 URL 未回收: %q", lonely)
	}
}

// util_truncate 测试内小截断(避免与包内既有工具名冲突)。
func util_truncate(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		r = r[:n]
	}
	return string(r)
}
