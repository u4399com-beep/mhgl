// ============================================================
// [R72-c] stealth/web/api/auth 集成面抓虫回归
//
//	真虫①  pseudo 改写 <title>(RCDATA) SEO 元数据 → 标题逐请求漂移
//	真虫②  非法 UTF-8 字节在文本节点被 []rune/WriteRune(RuneError) 归一为
//	        U+FFFD, 同节点有实体化时原始字节丢失(浏览器折叠 1 替换符 vs 展开多个)
//	审计面 tokenizer 往返/属性重排性质/SplitVolume/ConfigFromSettings 垃圾值
//	本轮排查未见虫的形态一并固化为断言(防回归)
//
// ============================================================
package stealth

import (
	"math/rand"
	"strings"
	"testing"
)

// ---------------- 真虫① <title> RCDATA 伪原创豁免 ----------------

// hitRichDoc title 与正文均含词典命中词("美丽|漂亮"), 保证替换率抽样 k>0。
func hitRichDoc() string {
	return `<title>` + strings.Repeat("美丽总裁", 12) + `_第3章</title><p>` +
		strings.Repeat("美丽总裁走进大厅。", 30) + `</p>`
}

func titleOf(doc string) string {
	s := strings.Index(doc, "<title>")
	e := strings.Index(doc, "</title>")
	if s < 0 || e < 0 || e < s {
		return ""
	}
	return doc[s+len("<title>") : e]
}

func TestR72c_Pseudo_TitleRCDATAExempt(t *testing.T) {
	doc := hitRichDoc()
	wantTitle := strings.Repeat("美丽总裁", 12) + "_第3章"
	cfg := Config{Pseudo: true, PseudoSeed: "request"}
	mutated := 0
	for i := 0; i < 60; i++ {
		pc := PageCtx{Kind: "read", BookID: "b1", ChapterID: "c1", Nonce: NewNonce()}
		out := string(Apply([]byte(doc), cfg, pc))
		if got := titleOf(out); got != wantTitle {
			mutated++
			if mutated <= 2 {
				t.Logf("title 被改写样例: %q", got)
			}
		}
	}
	if mutated > 0 {
		t.Fatalf("<title>(RCDATA) 内容被伪原创改写 %d/60 次(SEO 元数据漂移), 样例: %q", mutated, titleOf(string(Apply([]byte(doc), cfg, PageCtx{Kind: "read", Nonce: NewNonce()}))))
	}
	// 正文照常参与替换(伪原创主功能不受豁免影响): 大样本下应有改写发生。
	bodyChanged := false
	for i := 0; i < 30 && !bodyChanged; i++ {
		pc := PageCtx{Kind: "read", BookID: "b1", ChapterID: "c1", Nonce: NewNonce()}
		out := string(Apply([]byte(doc), cfg, pc))
		if !strings.Contains(out, strings.Repeat("美丽总裁走进大厅。", 30)) {
			bodyChanged = true
		}
	}
	if !bodyChanged {
		t.Fatal("正文同义词替换应照常生效(豁免面仅 title)")
	}
}

// ---------------- 真虫② 非法 UTF-8 字节保真 ----------------

const invalidSeq = "\xf0\x80\x80\x80" // 4 字节非法序列(浏览器折叠渲染 1 个 U+FFFD)

func TestR72c_InvalidUTF8_ByteFidelity(t *testing.T) {
	// asciiEntityText: 确定性种子保证至少一个字母被实体化(changed 路径)。
	rnd := rand.New(rand.NewSource(1))
	in := "abc " + strings.Repeat("x", 300) + " " + invalidSeq + " end"
	out := asciiEntityText(in, rnd)
	if out == in {
		t.Fatal("前置失效: asciiEntityText 应发生实体化(changed=true)")
	}
	if !strings.Contains(out, invalidSeq) {
		t.Fatalf("asciiEntityText 丢失非法 UTF-8 字节:\n in=%q\nout=%q", in, out)
	}
	// entityText / zwspText: 同节点含 CJK(重建路径)时非法字节同样保真。
	cin := "她说" + strings.Repeat("x", 20) + invalidSeq + "完"
	if out := entityText(cin, rand.New(rand.NewSource(2)), 1, 1); !strings.Contains(out, invalidSeq) {
		t.Fatalf("entityText 丢失非法 UTF-8 字节: %q", out)
	}
	if out := zwspText(cin, rand.New(rand.NewSource(3))); !strings.Contains(out, invalidSeq) {
		t.Fatalf("zwspText 丢失非法 UTF-8 字节: %q", out)
	}
	// 全管线: transcode(entity/zwsp)+obfuscate 开启, 输出含原始非法序列。
	for _, mode := range []string{"entity", "zwsp"} {
		cfg := Config{Transcode: true, TranscodeMode: mode, Obfuscate: true}
		out := string(Apply([]byte("<p>"+cin+"</p>"), cfg, PageCtx{Kind: "read", Nonce: NewNonce()}))
		if !strings.Contains(out, invalidSeq) {
			t.Fatalf("全管线(%s)丢失非法 UTF-8 字节: %q", mode, out)
		}
	}
}

// ---------------- 审计固化: tokenizer 往返恒等 ----------------

func TestR72c_TokenizerRoundTripBattery(t *testing.T) {
	cases := []string{
		"", "<", "<>", "</>", "<!-- x -->", "<!--", "<?php echo 1 ?>",
		"<!doctype html><html><body>hi</body></html>",
		`<p a=1 b='2' c="3" disabled>text</p>`,
		"<img src=/x.png/>", `<a href='a>b'>link</a>`,
		"<script>var a='</scr'+'ipt>';</script>", "<script>x</script >",
		"<style>a{}</style>", "<textarea><p>raw</p></textarea>",
		"<pre>  keep  </pre>", "<title>t &amp; t</title>",
		"<svg><circle/></svg>", "<math><mi>x</mi></math>",
		"<DIV CLASS='x'>UP</DIV>", "<p/>", "<p/ >",
		"<p>&amp;&#65;&#x42;&nbsp;&copy&noway;&#x&#123abc;</p>",
		"a<b and b>c", "x < y", "<3 hearts", "<-notatag",
		"<p title='未闭合 quote", "<p 未闭合",
		"emoji \U0001F600\u200D\U0001F308 combo", "é combining",
		"<p>说</p><p>明</p>", "中文English123!?,。混排",
		"<ul><li>1</li><li>2</li></ul>",
		"<table><tr><td>a</td><td>b</td></tr></table>",
		"<div data-x='1' data-y='2'>t</div>",
		"<p>  </p>", "  \n\t  ", "<br/><hr />",
	}
	for i, src := range cases {
		if got := string(renderTokens(tokenize(src))); got != src {
			t.Errorf("case %d 往返失配:\n in=%q\nout=%q", i, src, got)
		}
	}
	rnd := rand.New(rand.NewSource(72))
	chars := []rune("<>/=\"' abc&#;!-p div中文。😀")
	for iter := 0; iter < 2000; iter++ {
		b := make([]rune, rnd.Intn(80))
		for i := range b {
			b[i] = chars[rnd.Intn(len(chars))]
		}
		src := string(b)
		if got := string(renderTokens(tokenize(src))); got != src {
			t.Fatalf("fuzz iter %d 往返失配:\n in=%q\nout=%q", iter, src, got)
		}
	}
}

// ---------------- 审计固化: 属性重排性质 ----------------

func TestR72c_ObfTagShape_Property(t *testing.T) {
	tags := []string{
		`<div class="a" id="b" data-x='c' hidden>`,
		`<a href=/x/ title="t>a" target=_blank>`,
		`<p a=1 a=2>`, // 重名属性: 序列必须原样(first-wins 不翻转)
		`<div CLASS='a' class='b'>`,
		`<td colspan=2 align=center nowrap>`,
		`<input type="text" disabled required>`,
	}
	noInsertTags := []string{`<script src="x.js" async>`, `<style media="screen">`,
		`<textarea rows=3>`, `<pre class="code">`, `<title>`}
	rnd := rand.New(rand.NewSource(99))
	for _, tag := range tags {
		for iter := 0; iter < 300; iter++ {
			toks := []token{{kind: tokMarkup, data: tag, name: lowerName(tag, 1, tagNameEnd(tag, 1)), known: true}}
			obfTagShape(toks, rnd)
			got := toks[0].data
			be, ae := tagNameEnd(tag, 1), tagNameEnd(got, 1)
			if be != ae || !strings.EqualFold(tag[1:be], got[1:ae]) {
				t.Fatalf("标签名漂移:\n in=%q\nout=%q", tag, got)
			}
			if hasDupString(attrNamesOf(tag)) && !attrSpanSeqEqual(tag, got) {
				t.Fatalf("重名属性被重排:\n in=%q\nout=%q", tag, got)
			}
			if !attrSpanMultisetEqual(tag, got) {
				t.Fatalf("属性片段漂移:\n in=%q\nout=%q", tag, got)
			}
		}
	}
	for _, tag := range noInsertTags {
		for iter := 0; iter < 150; iter++ {
			toks := []token{{kind: tokMarkup, data: tag, name: lowerName(tag, 1, tagNameEnd(tag, 1)), known: true, noInsert: true}}
			obfTagShape(toks, rnd)
			if toks[0].data != tag {
				t.Fatalf("noInsert 开标签被改写:\n in=%q\nout=%q", tag, toks[0].data)
			}
		}
	}
}

func attrNamesOf(tag string) []string {
	_, names, _, ok := scanAttrSpans(tag, tagNameEnd(tag, 1))
	if !ok {
		return nil
	}
	return names
}

func attrSpanSeqEqual(before, after string) bool {
	be, ae := tagNameEnd(before, 1), tagNameEnd(after, 1)
	if be != ae || !strings.EqualFold(before[1:be], after[1:ae]) {
		return false
	}
	sb, _, cb, ok1 := scanAttrSpans(before, be)
	sa, _, ca, ok2 := scanAttrSpans(after, ae)
	if !ok1 || !ok2 || cb != ca || len(sb) != len(sa) {
		return false
	}
	for i := range sb {
		if before[sb[i][0]:sb[i][1]] != after[sa[i][0]:sa[i][1]] {
			return false
		}
	}
	return true
}

func attrSpanMultisetEqual(before, after string) bool {
	if before == after {
		return true
	}
	be, ae := tagNameEnd(before, 1), tagNameEnd(after, 1)
	if be != ae || !strings.EqualFold(before[1:be], after[1:ae]) {
		return false
	}
	sb, _, cb, ok1 := scanAttrSpans(before, be)
	sa, _, ca, ok2 := scanAttrSpans(after, ae)
	if !ok1 || !ok2 || cb != ca || len(sb) != len(sa) {
		return false
	}
	used := make([]bool, len(sa))
	for _, spanB := range sb {
		frag := before[spanB[0]:spanB[1]]
		found := false
		for j, spanA := range sa {
			if !used[j] && after[spanA[0]:spanA[1]] == frag {
				used[j] = true
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

// ---------------- 审计固化: 四拍重语料 raw 区恒等 + 输出结构稳定 ----------------

func TestR72c_HeavyCorpus_RawInvariant(t *testing.T) {
	rnd := rand.New(rand.NewSource(4242))
	pool := []string{
		`<p class="chapter-content">`, `</p>`, `<div id="wrap" data-v='1'>`, `</div>`,
		`他说："天下无敌。"`, `她回答："不可能！？"`, `英文 Mixed 123 中文。`,
		`<img src="/c/x.jpg" alt='封面'>`, `<br/>`, `<a href="/read/1/2.html">下一页</a>`,
		`<script>var x="</p>";</script>`, `<style>.a{content:"<p>"}</style>`,
		`<textarea>段落。</textarea>`, `<pre>  原样  </pre>`,
		`<title>第一卷 试炼 - 站</title>`, `<!-- nav -->`, `<!doctype html>`,
		`<input disabled value="a>b">`, `&#65;&amp;&nbsp;&copy;`,
		" \U0001F600 组合 ", "\n  ",
	}
	cfg := Config{Obfuscate: true, Transcode: true, Interfere: true, InterfereMode: "hidden", Density: 4, Pseudo: true}
	inRawCache := map[string][]string{}
	for iter := 0; iter < 400; iter++ {
		parts := make([]string, 4+rnd.Intn(18))
		for i := range parts {
			parts[i] = pool[rnd.Intn(len(pool))]
		}
		src := strings.Join(parts, "")
		out := string(Apply([]byte(src), cfg, PageCtx{Kind: "read", BookID: "b", ChapterID: "c", Nonce: [16]byte{byte(iter), 7}}))
		inRaw, cached := inRawCache[src]
		if !cached {
			inRaw = rawSpans(src)
			inRawCache[src] = inRaw
		}
		equalRawSpans(t, inRaw, rawSpans(out), "heavy corpus")
		if got := string(renderTokens(tokenize(out))); got != out {
			t.Fatalf("iter %d 输出非 tokenizer 稳定:\n%q\nvs\n%q", iter, out, got)
		}
	}
}

// ---------------- 审计固化: SplitVolume / ConfigFromSettings 垃圾值 ----------------

func TestR72c_SplitVolumeBattery(t *testing.T) {
	cases := []struct {
		in, vol, rest string
		ok            bool
	}{
		{"第一卷 风起", "第一卷", "风起", true},
		{"第12卷", "第12卷", "", true},
		{"第 3 部 终章", "第 3 部", "终章", true},
		{"第两百卷", "第两百卷", "", true},
		{"卷一 · 旧事", "卷一", "旧事", true},
		{"Vol.2 深海", "Vol.2", "深海", true},
		{"vol 10", "vol 10", "", true},
		{"VOLUME1", "VOLUME1", "", true},
		{"第50章 开战", "", "第50章 开战", false},
		{"第X卷", "", "第X卷", false},
		{"卷", "", "卷", false},
		{"Vol.", "", "Vol.", false},
		{"", "", "", false},
		{"   ", "", "", false},
		{"正常章节标题", "", "正常章节标题", false},
		{"第三部", "第三部", "", true},
	}
	for _, c := range cases {
		vol, rest, ok := SplitVolume(c.in)
		if ok != c.ok || vol != c.vol || rest != c.rest {
			t.Errorf("SplitVolume(%q) = (%q,%q,%v), want (%q,%q,%v)", c.in, vol, rest, ok, c.vol, c.rest, c.ok)
		}
	}
}

func TestR72c_ConfigFromSettings_Garbage(t *testing.T) {
	garbage := []map[string]string{
		{}, {"stealth.interfere.density": "0"}, {"stealth.interfere.density": "-5"},
		{"stealth.interfere.density": "999"}, {"stealth.interfere.density": "abc"},
		{"stealth.interfere.density": `"4"`}, {"stealth.transcode.mode": `"ZWSP"`},
		{"stealth.transcode.mode": "bogus"}, {"stealth.obfuscate": `"1"`},
		{"stealth.obfuscate": "yes"}, {"stealth.pseudo.seed": "DAILY"},
		{"stealth.interfere.density": "9999999999999999999999"},
	}
	for _, g := range garbage {
		cfg := ConfigFromSettings(func(k string) string { return g[k] })
		if cfg.Density < 2 || cfg.Density > 8 {
			t.Fatalf("density 未钳制: %v → %d", g, cfg.Density)
		}
	}
}
