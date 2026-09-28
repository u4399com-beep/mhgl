package stealth

// R79-b4 (i19) 干扰句页内去重采样回归钉。
//
// 修前 interfereSpan 对 65×25=1625 组合有放回抽样: 40 条插入的生日碰撞期望
// ≈0.49, 近半数页面含至少一对全同噪声句 —— 跨页镜像对齐的重复指纹被放大。
// 修后 noiseSampler 洗牌牌堆顺序出牌: 句库 65 ≥ 页内上限 40 ⇒ 页内句子两两
// 不同 ⇒ 全串恒唯一。本组回归把「页内零重复」钉成显式契约。

import (
	"fmt"
	"math/rand"
	"strings"
	"testing"
)

func randForTest(seed int64) *rand.Rand { return rand.New(rand.NewSource(seed)) }

// TestI19NoiseSamplerPageUnique 采样器直接构参: 连抽 200 次(跨越句库 65 的
// 循环点), 任意长度 ≤40 的窗口内句子两两不同; 首 65 抽恰为全排列覆盖。
func TestI19NoiseSamplerPageUnique(t *testing.T) {
	r := randForTest(20260928)
	s := newNoiseSampler(r)
	draws := make([]string, 0, 200)
	for i := 0; i < 200; i++ {
		sent, _ := s.next()
		draws = append(draws, sent)
	}
	// 首 65 抽 = 全排列(65 句各恰一次)
	seen := map[string]int{}
	for i := 0; i < len(noiseSents); i++ {
		seen[draws[i]]++
	}
	if len(seen) != len(noiseSents) {
		t.Fatalf("首 65 抽未覆盖全句库: 去重 %d / 库 %d", len(seen), len(noiseSents))
	}
	// 页内上限 40 的滑动窗口内零重复(模拟最坏满页插入)
	for start := 0; start+40 <= len(draws); start++ {
		w := map[string]bool{}
		for _, d := range draws[start : start+40] {
			if w[d] {
				t.Fatalf("窗口 [%d,%d) 内句重复: %q", start, start+40, d)
			}
			w[d] = true
		}
	}
}

// TestI19InterferePageSpansUnique 端到端: 100 段文档(density=2 → 满额 40 插入,
// 触及页内上限), 全部 sj-i span 文本两两不同, 且句子前缀(首句读前)亦两两不同;
// 跨 8 个 nonce 稳定成立。同时复核插入纯性(剥 span 后逐字节还原)。
func TestI19InterferePageSpansUnique(t *testing.T) {
	var b strings.Builder
	b.WriteString("<!DOCTYPE html><html><head><title>t</title></head><body>")
	for p := 0; p < 100; p++ {
		fmt.Fprintf(&b, "<p>第%d段落讲述了事情的发展。随后情节继续推进！疑虑终于打消？</p>", p)
	}
	b.WriteString("</body></html>")
	doc := b.String()
	cfg := Config{Interfere: true, InterfereMode: "hidden", Density: 2}
	for n := 0; n < 8; n++ {
		pc := PageCtx{Kind: "read", BookID: "bk", ChapterID: "ch", Nonce: [16]byte{byte(n), 0x5a}}
		out := string(Apply([]byte(doc), cfg, pc))
		_, spans := r76cStripNoise(out)
		if len(spans) != 40 {
			t.Fatalf("nonce %d: 插入数 %d ≠ 页内上限 40", n, len(spans))
		}
		seen := map[string]bool{}
		sentSeen := map[string]bool{}
		for _, sp := range spans {
			inner := spanInnerText(sp)
			if seen[inner] {
				t.Fatalf("nonce %d: 页内重复噪声串 %q", n, inner)
			}
			seen[inner] = true
			sent := spanSentencePrefix(inner)
			if sentSeen[sent] {
				t.Fatalf("nonce %d: 页内重复噪声句 %q", n, sent)
			}
			sentSeen[sent] = true
		}
	}
}

// TestI19InterfereInsertOnly 新采样路径不破坏插入纯性: 剥掉 sj-i span 后
// 逐字节还原原文档。
func TestI19InterfereInsertOnly(t *testing.T) {
	doc := "<!DOCTYPE html><html><body><p>甲句落在句号之后。乙句收尾！</p><p>丙段无标点收尾</p></body></html>"
	cfg := Config{Interfere: true, InterfereMode: "offscreen", Density: 2}
	pc := PageCtx{Kind: "read", BookID: "b", ChapterID: "c", Nonce: [16]byte{9}}
	out := string(Apply([]byte(doc), cfg, pc))
	stripped, spans := r76cStripNoise(out)
	if len(spans) == 0 {
		t.Fatal("零插入, 探针失效")
	}
	if stripped != doc {
		t.Fatalf("插入纯性破坏:\n want %q\n got  %q", doc, stripped)
	}
}

// spanInnerText 取 span 开标签之后、</span> 之前的文本(实体内文)。
func spanInnerText(sp string) string {
	i := strings.Index(sp, ">")
	if i < 0 {
		return ""
	}
	body := sp[i+1:]
	j := strings.LastIndex(body, "</span>")
	if j >= 0 {
		body = body[:j]
	}
	return body
}

// spanSentencePrefix 取噪声串首句(到首个句读标点为止, 与 interfere 句界
// 标点集一致)。库内句子均以句读收尾, 前缀即句体本身。
func spanSentencePrefix(s string) string {
	for i, r := range s {
		switch r {
		case '。', '！', '？', '…', '!', '?':
			return s[:i+len(string(r))]
		}
	}
	return s
}
