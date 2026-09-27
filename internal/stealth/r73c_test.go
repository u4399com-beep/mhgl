// ============================================================
// [R73-c] stealth 回归 — raw text 元素全集透传 / pseudo 非法 UTF-8 字节保真 /
// 词典退化对再清(且时/明晰)
// ============================================================
package stealth

import (
	"strings"
	"testing"
)

// ---------------- A. raw text 元素全集(R73-c 真虫① 回归) ----------------
//
// HTML5 "in body" 插入模式下 xmp/noembed/noframes/iframe 开标签触发 generic
// raw text 解析(内容不做标记/实体解析), plaintext 触发 PLAINTEXT 状态(到 EOF)。
// 修前这些容器内容被当普通标记+文本: 转码/低频实体化把 xmp/plaintext(渲染型
// raw text)内字符改写为 &#x…; 形态 → 浏览器按字面显示实体文本(可见漂移)。
// 修后内容区逐字节透传。

func TestR73c_TokenizerRawTextElems_Passthrough(t *testing.T) {
	cfg := Config{Transcode: true, TranscodeMode: "entity", Obfuscate: true}
	regions := []string{
		"<xmp>你好世界 hello</xmp>",
		"<plaintext>你好世界 hello</body></html>",
		"<iframe>你好世界</iframe>",
		"<noembed>你好世界</noembed>",
		"<noframes>你好世界</noframes>",
	}
	for seed := 0; seed < 30; seed++ {
		for _, reg := range regions {
			doc := "<html><body>" + reg
			pc := PageCtx{Kind: "read", BookID: "b", ChapterID: "c", Nonce: nonceOfSeed(seed)}
			out := string(Apply([]byte(doc), cfg, pc))
			if !strings.Contains(out, reg) {
				t.Fatalf("seed=%d raw 区被改写: %q → %q", seed, reg, out)
			}
		}
	}
	// plaintext 特判形态: 自开标签起吞到 EOF(规范无 </plaintext> 结束概念)。
	toks := tokenize("<p>a。</p><plaintext>rest</p>more")
	if len(toks) != 5 {
		t.Fatalf("plaintext 样例应为 5 token, got %d: %+v", len(toks), toks)
	}
	last := toks[len(toks)-1]
	if last.kind != tokRaw || last.data != "rest</p>more" {
		t.Fatalf("plaintext 内容应整体 raw 到 EOF, got kind=%d data=%q", last.kind, last.data)
	}
	if !toks[len(toks)-2].noInsert {
		t.Fatal("plaintext 开标签应带 noInsert(禁插入)")
	}
	// xmp 边界: </xmp 后内容恢复正常标记面(不被吞掉)。
	toks = tokenize("<xmp>a</xmp><p>b。</p>")
	if len(toks) != 6 || toks[1].kind != tokRaw || toks[1].data != "a" {
		t.Fatalf("xmp raw 区形态不符: %+v", toks)
	}
	if toks[4].kind != tokText || toks[4].data != "b。" {
		t.Fatalf("</xmp 后应恢复文本面: %+v", toks)
	}
	// 往返恒等(透传不破坏重组)。
	for _, doc := range regions {
		if string(renderTokens(tokenize(doc))) != doc {
			t.Fatalf("往返恒等破坏: %q", doc)
		}
	}
}

// ---------------- B. pseudo 非法 UTF-8 字节保真(R73-c 真虫② 回归) ----------------
//
// 修前替换落地走整串 []rune 归一 + string() 重建: F0 9F 41(截断序列)被展开为
// 2 个 U+FFFD + "A"(浏览器按最大子部分折叠渲染 1 个替换符 + "A")—— 同节点
// 任一同义词命中即触发。修后字节游走替换, 非命中区间原始字节照抄。

func TestR73c_Pseudo_InvalidUTF8_ByteFidelity(t *testing.T) {
	const frag = "\xf0\x9f\x41" // 浏览器渲染: 1 个替换符 + "A"
	doc := "<p>他立刻说道：" + frag + "然后马上忽然渐渐悄悄悄悄离开了。</p>"
	replaced := 0
	for seed := 0; seed < 300; seed++ {
		toks := tokenize(doc)
		cfg := Config{PseudoSeed: "stable"}
		pc := PageCtx{Kind: "read", BookID: "b",
			ChapterID: string(rune('a'+seed%26)) + string(rune('a'+seed/26))}
		out := string(renderTokens(pseudoTokens(toks, cfg, pc)))
		if strings.Contains(out, "\uFFFD") {
			t.Fatalf("seed=%d 非法字节被 U+FFFD 展开: %q", seed, out)
		}
		if !strings.Contains(out, frag) {
			t.Fatalf("seed=%d 原始字节丢失: %q", seed, out)
		}
		if out != doc {
			replaced++
		}
	}
	if replaced == 0 {
		t.Fatal("300 轮无一替换 — 测试失去咬合力(词典/抽样面回归?)")
	}
}

// ---------------- C. 词典退化对再清(R73-c 数据回归) ----------------
//
// "临时|且时": 且时为生造非词, 临时→且时 产垃圾词(错别字/非词伙伴同 R71-c 标准)。
// "显然|明晰": 副词 vs 形容词跨词性, 双向替换均不通顺(他显然很生气→*他明晰很生气;
// 表述明晰→*表述显然), 双向恒错的退化对。

func TestR73c_Pseudo_NoNonwordPartners(t *testing.T) {
	synInit()
	nonwords := []string{"且时", "明晰"}
	for _, p := range synonymPairs {
		i := strings.IndexByte(p, '|')
		a, b := p[:i], p[i+1:]
		for _, nw := range nonwords {
			if a == nw || b == nw {
				t.Fatalf("非词词条仍在词典: %q", p)
			}
		}
	}
	for _, w := range []string{"临时", "显然"} {
		for _, partner := range synMap[w] {
			for _, nw := range nonwords {
				if partner == nw {
					t.Fatalf("%s → %q 非词伙伴仍在", w, partner)
				}
			}
		}
	}
	// 既有既有面不回归: 临时/显然 的合法伙伴仍在(词典删除是精确摘除)。
	if len(synMap["临时"]) == 0 || len(synMap["显然"]) == 0 {
		t.Fatal("临时/显然 伙伴表被清空 — 摘除过度")
	}
	if !containsStr(synMap["临时"], "暂时") || !containsStr(synMap["显然"], "分明") {
		t.Fatalf("合法伙伴丢失: 临时→%v 显然→%v", synMap["临时"], synMap["显然"])
	}
}

func containsStr(xs []string, w string) bool {
	for _, s := range xs {
		if s == w {
			return true
		}
	}
	return false
}
