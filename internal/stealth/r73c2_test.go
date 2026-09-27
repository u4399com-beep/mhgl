// r73c2 — R73-c 探针转正: 性质回归(hex/dec 分布面·多形态解码恒等/高密度纯插入性/raw text 全集透传)
package stealth

import (
	"html"
	"math/rand"
	"strings"
	"testing"
)

// 探针A(修正口径): pseudoTokens 非法 UTF-8 → U+FFFD 展开(输入无 EF BF BD, 输出出现即腐蚀)
func TestR73c2_PseudoInvalidUTF8NoExpansion(t *testing.T) {
	doc := "<p>他立刻说道：" + "\xf0\x9f\x41" + "然后马上忽然渐渐悄悄悄悄离开了。</p>"
	drifts, replaced := 0, 0
	for seed := 0; seed < 500; seed++ {
		toks := tokenize(doc)
		cfg := Config{PseudoSeed: "stable"}
		pc := PageCtx{Kind: "read", BookID: "b", ChapterID: string(rune('a'+seed%26)) + string(rune('a'+seed/26))}
		out := string(renderTokens(pseudoTokens(toks, cfg, pc)))
		if strings.Contains(out, "\uFFFD") {
			drifts++
			if drifts == 1 {
				t.Logf("seed=%d U+FFFD 展开: %q", seed, out)
			}
		}
		if out != doc {
			replaced++
		}
	}
	if drifts != 0 {
		t.Fatalf("U+FFFD 腐蚀 %d/500 轮(字节保真破坏)", drifts)
	}
	if replaced == 0 {
		t.Fatal("500 轮零替换(同义词替换失效)")
	}
}

// 探针B: runeEntity hex/dec 分布与全管线实体解码恒等(同字符多形态组合)
func TestR73c2_TranscodeDistributionIdentity(t *testing.T) {
	r := rand.New(rand.NewSource(42))
	hexN, decN := 0, 0
	for i := 0; i < 10000; i++ {
		if strings.HasPrefix(runeEntity('上', r), "&#x") {
			hexN++
		} else {
			decN++
		}
	}
	if hexN < 3500 || hexN > 6500 {
		t.Fatalf("hex/dec 分布失衡: hex=%d dec=%d", hexN, decN)
	}
	// 同请求同字符多形态组合: 管线输出经 html.UnescapeString 后可见文本恒等
	src := "<p>上海上海上上上海。哈哈，上！</p>"
	for seed := 0; seed < 300; seed++ {
		cfg := Config{Transcode: true, TranscodeMode: "entity", Obfuscate: true, Pseudo: false}
		pc := PageCtx{Kind: "read", BookID: "b", ChapterID: "c", Nonce: nonceOfSeed(seed)}
		out := string(Apply([]byte(src), cfg, pc))
		if html.UnescapeString(visibleText(out)) != html.UnescapeString(visibleText(src)) {
			t.Fatalf("seed=%d 多形态组合可见漂移: %s", seed, out)
		}
	}

}

// 探针C: 高密度干扰 — 纯插入性(剥掉 sj-i span 后逐字节还原)
func TestR73c2_InterfereHighDensityInsertOnly(t *testing.T) {
	var sb strings.Builder
	sents := []string{"他说。", "她笑！", "风起？", "落幕……", "okay!", "what?", "静。"}
	for i := 0; i < 120; i++ {
		sb.WriteString("<p>")
		for j := 0; j <= i%7; j++ {
			sb.WriteString(sents[(i+j)%len(sents)])
		}
		sb.WriteString("</p>")
	}
	doc := sb.String()
	for seed := 0; seed < 300; seed++ {
		cfg := Config{Interfere: true, InterfereMode: "hidden", Density: 8}
		pc := PageCtx{Kind: "read", BookID: "b", ChapterID: "c", Nonce: nonceOfSeed(seed)}
		out := string(Apply([]byte(doc), cfg, pc))
		stripped := stripSjI(out)
		if stripped != doc {
			t.Fatalf("seed=%d 非纯插入: 剥干扰句后与原文不等\nout=%s", seed, out[:min(300, len(out))])
		}
		n := strings.Count(out, `class="sj-i"`)
		if n == 0 || n > 40 {
			t.Fatalf("seed=%d 干扰句数=%d 越界", seed, n)
		}
	}

}

// stripSjI 剥除 hidden 与 offscreen 两种形态的 sj-i span(非贪婪到首个 </span>).
func stripSjI(s string) string {
	for {
		i := strings.Index(s, `<span class="sj-i"`)
		if i < 0 {
			return s
		}
		j := strings.Index(s[i:], "</span>")
		if j < 0 {
			return s
		}
		s = s[:i] + s[i+j+len("</span>"):]
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// 探针D(修后验证): raw text 容器内容区逐字节不动
func TestR73c2_RawTextElemsPostFix(t *testing.T) {
	cfg := Config{Transcode: true, TranscodeMode: "entity", Obfuscate: true}
	pc := PageCtx{Kind: "read", BookID: "b", ChapterID: "c", Nonce: NewNonce()}
	regions := []string{
		"<xmp>你好世界 hello</xmp>",
		"<plaintext>你好世界 hello</body></html>",
		"<iframe>你好世界</iframe>",
		"<noembed>你好世界</noembed>",
		"<noframes>你好世界</noframes>",
	}
	for _, reg := range regions {
		doc := "<html><body>" + reg
		out := string(Apply([]byte(doc), cfg, pc))
		if !strings.Contains(out, reg) {
			t.Errorf("raw 区被改写: %q → %q", reg, out)
		}
	}
	// 往返恒等
	for _, doc := range regions {
		if string(renderTokens(tokenize(doc))) != doc {
			t.Errorf("往返恒等破坏: %q", doc)
		}
	}

}
