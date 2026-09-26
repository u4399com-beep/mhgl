// ============================================================
// R70-c2 — 伪装管线不变式回归(外观一致/逐字节豁免区/nonce 扰动/全关恒等)
//
// 硬不变式(任务契约):
//
//	A. 全关 Config{} → Apply 原样返回同一底层数据(逐字节零变化);
//	B. obfuscate / entity-transcode / zwsp / interfere 开启 → strip-tags+
//	   实体解码后可见文本与原文档一致(伪原创按设计改写可见文本, 不在本列);
//	C. script/style/textarea/pre 内容与 svg/math 整区逐字节不变;
//	D. 同配置不同 Nonce → 输出字节不同;
//	E. 伪原创总替换率钳 5%-25%(≥8 处命中时至少 1 处)。
//
// ============================================================
package stealth

import (
	"bytes"
	"html"
	"math/rand"
	"strings"
	"testing"
)

// sampleDoc 样例文档: 覆盖 head/title/meta/script/style/textarea/pre/svg/math/
// 注释/属性(引号+非引号)/段落/句界/同义词命中点/空白空隙。
const sampleDoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>第一卷 试炼之地 - 测试站</title>
<link rel="stylesheet" href="/static/css/site.css" media="all">
<style>body{color:#333}</style>
<script>var a = "第一卷"; if (a<2) { console.log("</div>"); }</script>
</head>
<body class="theme-dark" data-x=1>
<!-- 原有注释 -->
<div class="content"><h1>第12卷 试炼之地</h1>
<p>他立刻明白了，马上转身离开。雨后的空气带着泥土的清香！</p>
<p>她微微一笑，缓缓开口。寻找丢失的钥匙。</p>
<textarea>立刻 & <b>原样</b></textarea>
<pre>  立刻  原样
        第二行  </pre>
<svg width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>
<p>结尾段落。</p>
</div>
<footer><p>页脚立刻不变。</p></footer>
</body>
</html>`

// stripHiddenSpans 剥除干扰隐藏句 span(机器生成形态, 内容无 '<')。
// visibleText 模拟浏览器可见性: interfere 按「设计」插入的 display:none 文本
// 在 DOM 里存在但不可见, 比对可见文本前先剥除([R70-c] 修前把隐藏句计入了
// 可见流导致三拍不变式误报)。
func stripHiddenSpans(doc string) string {
	for {
		i := strings.Index(doc, `<span class="sj-i"`)
		if i < 0 {
			return doc
		}
		j := strings.Index(doc[i:], "</span>")
		if j < 0 {
			return doc // 畸形截断, 保守不再剥
		}
		doc = doc[:i] + doc[i+j+len("</span>"):]
	}
}

// visibleText 提取可见文本: 仅非纯空白文本节点(raw 区 script/style/textarea/pre
// 与 interfere 隐藏句/幽灵元素等整块 markup token 均不入流; 纯空白文本节点按
// 浏览器折叠语义视作不可见 —— 空白抖动子变换只作用于此层)。entity 模式解码
// 字符引用后比对; zwsp 模式先剥 U+200B。
func visibleText(doc string) string {
	var b strings.Builder
	for _, t := range tokenize(stripHiddenSpans(doc)) {
		if t.kind == tokText && !isAllWhitespace(t.data) {
			b.WriteString(t.data)
		}
	}
	return stripZwsp(html.UnescapeString(b.String()))
}

func stripZwsp(s string) string {
	return strings.ReplaceAll(s, "​", "")
}

// rawSpans 依序抽取全部 raw token 内容(含 svg/math region)。
func rawSpans(doc string) []string {
	var out []string
	for _, t := range tokenize(doc) {
		if t.kind == tokRaw {
			out = append(out, t.data)
		}
	}
	return out
}

func equalRawSpans(t *testing.T, a, b []string, label string) {
	t.Helper()
	if len(a) != len(b) {
		t.Fatalf("%s: raw 区数量变化 %d → %d", label, len(a), len(b))
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("%s: raw 区[%d] 逐字节变化\n输入: %q\n输出: %q", label, i, a[i], b[i])
		}
	}
}

// stagesOn 三拍全开(不含 pseudo —— 伪原创按设计改写可见文本, 不参与 B 类不变式)。
func stagesOn() (Config, PageCtx) {
	return Config{
		Obfuscate: true, Transcode: true, TranscodeMode: "entity",
		Interfere: true, InterfereMode: "hidden", Density: 4,
	}, PageCtx{Kind: "read", BookID: "b1", ChapterID: "c1", Nonce: NewNonce()}
}

// allFourOn 四拍全开(含伪原创)。
func allFourOn() Config {
	return Config{
		Obfuscate: true, Transcode: true, TranscodeMode: "entity",
		Interfere: true, InterfereMode: "hidden", Density: 4,
		Pseudo: true, PseudoSeed: "request",
	}
}

// ---------------- A. 全关恒等 ----------------

func TestApply_AllOff_Identity(t *testing.T) {
	src := []byte(sampleDoc)
	got := Apply(src, Config{}, PageCtx{Kind: "read", Nonce: NewNonce()})
	if &got[0] != &src[0] {
		t.Fatal("全关 Apply 应原样返回同一底层数据(零拷贝零变化)")
	}
	if !bytes.Equal(got, src) || len(got) != len(src) {
		t.Fatal("全关 Apply 输出逐字节不等")
	}
}

// ---------------- B. 可见文本不变式 ----------------

func TestApply_VisibleTextInvariant_AllStages(t *testing.T) {
	want := visibleText(sampleDoc)
	pc := PageCtx{Kind: "read", BookID: "b1", ChapterID: "c1", Nonce: NewNonce()}

	// 三拍全开(entity 转码)。
	cfg, _ := stagesOn()
	if got := visibleText(string(Apply([]byte(sampleDoc), cfg, pc))); got != want {
		t.Fatalf("三拍全开可见文本漂移:\n原: %q\n新: %q", want, got)
	}
	// 单独 obfuscate(注释/幽灵/空白抖动/属性重排/大小写/低频实体)。
	o := Config{Obfuscate: true}
	if got := visibleText(string(Apply([]byte(sampleDoc), o, pc))); got != want {
		t.Fatalf("obfuscate 可见文本漂移:\n原: %q\n新: %q", want, got)
	}
	// 单独 transcode entity。
	e := Config{Transcode: true, TranscodeMode: "entity"}
	if got := visibleText(string(Apply([]byte(sampleDoc), e, pc))); got != want {
		t.Fatalf("transcode(entity) 可见文本漂移:\n原: %q\n新: %q", want, got)
	}
	// 单独 transcode zwsp(剥零宽后一致)。
	z := Config{Transcode: true, TranscodeMode: "zwsp"}
	outZ := string(Apply([]byte(sampleDoc), z, pc))
	if !strings.Contains(outZ, "​") {
		t.Fatal("zwsp 模式应插入 U+200B")
	}
	if got := visibleText(outZ); got != want {
		t.Fatalf("transcode(zwsp) 可见文本漂移:\n原: %q\n新: %q", want, got)
	}
	// 单独 interfere(read 页; 隐藏句为整块 markup token 不入可见流)。
	i := Config{Interfere: true, InterfereMode: "hidden", Density: 2}
	if got := visibleText(string(Apply([]byte(sampleDoc), i, pc))); got != want {
		t.Fatalf("interfere 可见文本漂移:\n原: %q\n新: %q", want, got)
	}
}

// B': 非 read 页 interfere/pseudo 不生效(home 页无 sj-i)。
func TestApply_InterferePseudo_ReadOnly(t *testing.T) {
	cfg := Config{Interfere: true, Pseudo: true, InterfereMode: "hidden", Density: 2}
	pc := PageCtx{Kind: "home", BookID: "b1", Nonce: NewNonce()}
	if out := string(Apply([]byte(sampleDoc), cfg, pc)); strings.Contains(out, "sj-i") {
		t.Fatal("非 read 页不得出现干扰句 span")
	}
}

// B”: 四拍全开冒烟(含伪原创): 无 panic + raw 豁免 + 输出必变。
func TestApply_AllOn_Smoke(t *testing.T) {
	in := rawSpans(sampleDoc)
	out := string(Apply([]byte(sampleDoc), allFourOn(), PageCtx{Kind: "read", BookID: "b1", ChapterID: "c1", Nonce: NewNonce()}))
	equalRawSpans(t, in, rawSpans(out), "四拍全开")
	if out == sampleDoc {
		t.Fatal("四拍全开输出不应与输入逐字节相同")
	}
}

// ---------------- C. raw 豁免区逐字节不变 ----------------

func TestApply_RawRegions_ByteInvariant(t *testing.T) {
	cfg, pc := stagesOn()
	in := rawSpans(sampleDoc)
	if len(in) < 4 {
		t.Fatalf("样例文档 raw 区不足(实测 %d, 应含 script/style/textarea/pre)", len(in))
	}
	equalRawSpans(t, in, rawSpans(string(Apply([]byte(sampleDoc), cfg, pc))), "三拍全开")
	// script 源码逐字节保留(注释/幽灵元素绝不落进 raw)。
	cfgAll := allFourOn()
	out := string(Apply([]byte(sampleDoc), cfgAll, pc))
	if !strings.Contains(out, `var a = "第一卷";`) {
		t.Fatal("script 内容逐字节变化")
	}
}

// C': tokenizer 自反性 —— tokenize+renderTokens 对任意输入逐字节恒等。
func TestTokenize_RenderTokens_Identity(t *testing.T) {
	cases := []string{
		sampleDoc,
		`<p a=1 a=2>x</p>`,            // 重复属性(tokenize 不改写)
		`<a href=/x/>link</a>`,        // 非引号值含 '/'
		`<img src="a>b">t`,            // 引号内 '>'
		`<p`,                          // 截断开标签
		`<p>unclosed`,                 // 未闭合
		`<!--`,                        // 未闭合注释
		`<!doctype html><p>x</p>`,     // DOCTYPE
		`</>a</ b>x<?php echo 1;?>`,   // 直通/伪注释/PI
		`<svg><path d="M0 0"/></svg>`, // svg 自闭合
		`<math><mi>x</mi></math>y`,
		`<div><script>a<b</script>后</div>`, // script 内 '<'
		`<textarea></div></TEXTAREA>x`,
		`<pre>  keep  </pre>`,
		`<title>a<b>c</title>`,
		"中文<script>漢字</script>テスト",
	}
	for _, c := range cases {
		if got := string(renderTokens(tokenize(c))); got != c {
			t.Fatalf("tokenizer 自反性破坏: 输入 %q → 输出 %q", c, got)
		}
	}
}

// ---------------- D. Nonce 扰动 ----------------

func TestApply_DifferentNonce_DifferentBytes(t *testing.T) {
	cfg := allFourOn()
	pc := PageCtx{Kind: "read", BookID: "b1", ChapterID: "c1"}
	seen := map[string]bool{}
	for i := 0; i < 8; i++ {
		pc.Nonce = NewNonce()
		seen[string(Apply([]byte(sampleDoc), cfg, pc))] = true
		if len(seen) > 1 {
			return
		}
	}
	t.Fatal("8 次不同 Nonce 输出全相同, 扰动失效")
}

// D': stable/daily 种子同章稳定、异章不同(稠密同义词样文, 命中数≥8 恒有替换)。
func TestPseudo_Seeds(t *testing.T) {
	src := denseSynDoc(t)
	cfgStable := Config{Pseudo: true, PseudoSeed: "stable"}
	pcA := PageCtx{Kind: "read", BookID: "b1", ChapterID: "c1", Nonce: NewNonce()}
	pcA2 := PageCtx{Kind: "read", BookID: "b1", ChapterID: "c1", Nonce: NewNonce()}
	pcB := PageCtx{Kind: "read", BookID: "b1", ChapterID: "c2", Nonce: NewNonce()}
	a1 := string(Apply([]byte(src), cfgStable, pcA))
	if a1 != string(Apply([]byte(src), cfgStable, pcA2)) {
		t.Fatal("stable 种子同章两次渲染应逐字节一致")
	}
	if a1 == string(Apply([]byte(src), cfgStable, pcB)) {
		t.Fatal("stable 种子异章渲染应不同")
	}
	// daily: 同日同章确定性(跨日分支依赖墙钟, 只验当日稳定)。
	cfgDaily := Config{Pseudo: true, PseudoSeed: "daily"}
	if string(Apply([]byte(src), cfgDaily, pcA)) != string(Apply([]byte(src), cfgDaily, pcA)) {
		t.Fatal("daily 种子当日应稳定")
	}
}

// ---------------- E. 伪原创替换率钳制 ----------------

// denseSynDoc 稠密命中样文: 有效词典键逐个入「」词位(词间分隔串不进词典)。
func denseSynDoc(t *testing.T) string {
	t.Helper()
	synInit()
	var sb strings.Builder
	n := 0
	for _, p := range synonymPairs {
		w := p[:strings.IndexByte(p, '|')]
		if len([]rune(w)) < 2 {
			continue
		}
		partners := synMap[w]
		real := false
		for _, x := range partners { // 排除"具备|具备"类 no-op 键(替换后无变化, 干扰计数)
			if x != w {
				real = true
				break
			}
		}
		if !real {
			continue
		}
		sb.WriteString("他说「")
		sb.WriteString(w)
		sb.WriteString("」")
		n++
		if n >= 48 {
			break
		}
	}
	if n < 40 {
		t.Fatalf("可用词典键不足: %d", n)
	}
	return sb.String()
}

func TestPseudo_ReplacementRateClamp(t *testing.T) {
	src := denseSynDoc(t)
	total := strings.Count(src, "「")
	if total < 40 {
		t.Fatalf("样文命中位不足: %d", total)
	}
	for seed := 0; seed < 30; seed++ {
		cfg := Config{Pseudo: true, PseudoSeed: "request"}
		pc := PageCtx{Kind: "read", BookID: "b1", ChapterID: "c1", Nonce: nonceOfSeed(seed)}
		out := pseudoTokens(tokenize(src), cfg, pc)
		var outData string
		for i := range out {
			if out[i].kind == tokText {
				outData += out[i].data
			}
		}
		// 逐词位统计替换数(词长可变, 按「」切分一一对应)。
		inW := extractWords(src)
		outW := extractWords(outData)
		if len(inW) != len(outW) {
			t.Fatalf("seed=%d: 词位数漂移 %d → %d", seed, len(inW), len(outW))
		}
		changed := 0
		for i := range inW {
			if inW[i] != outW[i] {
				changed++
			}
		}
		if changed < 1 {
			t.Fatalf("seed=%d: total=%d ≥8 时至少替换 1 处, 实测 0", seed, total)
		}
		if changed > total/4 { // floor(25%)
			t.Fatalf("seed=%d: 替换 %d/%d 超 25%% 上限", seed, changed, total)
		}
	}
}

// extractWords 提取「」内词序列。
func extractWords(s string) []string {
	var out []string
	for {
		a := strings.Index(s, "「")
		if a < 0 {
			return out
		}
		b := strings.Index(s[a+1:], "」")
		if b < 0 {
			return out
		}
		out = append(out, s[a+1:a+1+b])
		s = s[a+1+b:]
	}
}

// nonceOfSeed 确定性 nonce(种子模式 request 走 rngFor(nonce), 需可复现扰动)。
func nonceOfSeed(seed int) [16]byte {
	var n [16]byte
	r := rand.New(rand.NewSource(int64(seed) + 999))
	for i := range n {
		n[i] = byte(r.Intn(256))
	}
	return n
}

// ---------------- 干扰句形态 ----------------

func TestInterfere_InsertsHiddenSpans_ReadPage(t *testing.T) {
	doc := strings.Repeat("<p>句子一。句子二！句子三？</p>", 12)
	cfg := Config{Interfere: true, InterfereMode: "hidden", Density: 4}
	pc := PageCtx{Kind: "read", BookID: "b1", ChapterID: "c1", Nonce: NewNonce()}
	out := string(Apply([]byte(doc), cfg, pc))
	n := strings.Count(out, `class="sj-i"`)
	if n == 0 {
		t.Fatal("read 页未插入任何干扰句")
	}
	if n > 40 {
		t.Fatalf("干扰句 %d 超每页上限 40", n)
	}
	if !strings.Contains(out, "display:none") {
		t.Fatal("hidden 模式应内联 display:none")
	}
	cfgOff := Config{Interfere: true, InterfereMode: "offscreen", Density: 4}
	outOff := string(Apply([]byte(doc), cfgOff, PageCtx{Kind: "read", BookID: "b1", Nonce: NewNonce()}))
	if !strings.Contains(outOff, "left:-9999px") {
		t.Fatal("offscreen 模式应使用屏外定位样式")
	}
}

// ---------------- 混淆六子变换形态 ----------------

func TestObfuscate_ShapeChanges(t *testing.T) {
	cfg := Config{Obfuscate: true}
	// 大文档放大注入概率命中面(120 个含 3 属性 div, 单点 miss 概率可忽略)。
	doc := strings.Repeat(`<div class="a" data-x="1" id="z"><p>段落文本。</p></div>`, 120)
	out := string(Apply([]byte(doc), cfg, PageCtx{Kind: "book", BookID: "b1", Nonce: NewNonce()}))
	if out == doc {
		t.Fatal("obfuscate 开启后输出应与输入不同(形态抖动)")
	}
	if !strings.Contains(out, "<!--") {
		t.Fatal("应出现注释注入")
	}
	if strings.Count(out, "display:none") == 0 {
		t.Fatal("应出现幽灵元素")
	}
	reordered, jittered := false, false
	for i := 0; i+5 < len(out); i++ {
		if strings.HasPrefix(out[i:], "<div id=") || strings.HasPrefix(out[i:], "<div data-x=") {
			reordered = true
		}
		if strings.HasPrefix(out[i:], "<DiV") || strings.HasPrefix(out[i:], "<dIv") ||
			strings.HasPrefix(out[i:], "<DIV") {
			jittered = true
		}
	}
	if !reordered {
		t.Fatal("未观察到属性重排")
	}
	if !jittered {
		t.Fatal("未观察到标签名大小写抖动")
	}
	// 属性重排语义恒等: div/p 开标签的属性集合(排序形态)不变
	// (幽灵元素 i/b/u/em/span 与注释/doctype 不在比对面)。
	inSets := attrSets(doc, "div", "p")
	outSets := attrSets(out, "div", "p")
	if len(inSets) != len(outSets) {
		t.Fatalf("开标签数量漂移: %d → %d", len(inSets), len(outSets))
	}
	for i := range inSets {
		if inSets[i] != outSets[i] {
			t.Fatalf("开标签[%d] 属性集漂移: %s → %s", i, inSets[i], outSets[i])
		}
	}
}

// attrSets 抽取指定名开标签的「名+排序后属性片段」形态(重排不变量)。
func attrSets(doc string, names ...string) []string {
	allow := map[string]bool{}
	for _, n := range names {
		allow[n] = true
	}
	var out []string
	for _, tk := range tokenize(doc) {
		if tk.kind != tokMarkup || tk.closing || tk.isDoctype || !allow[tk.name] {
			continue
		}
		nameEnd := tagNameEnd(tk.data, 1)
		spans, _, _, ok := scanAttrSpans(tk.data, nameEnd)
		if !ok {
			out = append(out, tk.data)
			continue
		}
		parts := make([]string, 0, len(spans))
		for _, sp := range spans {
			parts = append(parts, tk.data[sp[0]:sp[1]])
		}
		for i := 1; i < len(parts); i++ { // 插入排序(属性个位数, 免 sort 依赖)
			for j := i; j > 0 && parts[j] < parts[j-1]; j-- {
				parts[j], parts[j-1] = parts[j-1], parts[j]
			}
		}
		out = append(out, tk.name+"|"+strings.Join(parts, "\x00"))
	}
	return out
}

// ---------------- 稳健性: 怪输入不 panic ----------------

func TestApply_GarbageRobust_NoPanic(t *testing.T) {
	cfg := allFourOn()
	pc := PageCtx{Kind: "read", BookID: "b1", ChapterID: "c1", Nonce: NewNonce()}
	// 截断样文(全前缀扫描)。
	for i := 0; i <= len(sampleDoc); i += 13 {
		_ = Apply([]byte(sampleDoc[:i]), cfg, pc)
	}
	// 伪随机字节流(定长 + 变长)。
	r := rand.New(rand.NewSource(42))
	for _, n := range []int{0, 1, 2, 3, 7, 64, 1000, 4096} {
		b := make([]byte, n)
		for i := range b {
			b[i] = byte(r.Intn(256))
		}
		_ = Apply(b, cfg, pc)
	}
	// 深嵌套/超长属性/海量空白。
	deep := strings.Repeat("<div>", 500) + "文本" + strings.Repeat("</div>", 500)
	_ = Apply([]byte(deep), cfg, pc)
	_ = Apply([]byte(`<p a="`+strings.Repeat("x", 5000)+`">词</p>`), cfg, pc)
	_ = Apply([]byte(strings.Repeat("\n \t ", 2000)), cfg, pc)
}

// ---------------- 并发安全(race 检测面) ----------------

func TestApply_Concurrent(t *testing.T) {
	cfg := allFourOn()
	done := make(chan struct{})
	for i := 0; i < 8; i++ {
		go func(i int) {
			defer func() { done <- struct{}{} }()
			_ = Apply([]byte(sampleDoc), cfg, PageCtx{Kind: "read", BookID: "b1",
				ChapterID: "c1", Nonce: nonceOfSeed(i)})
		}(i)
	}
	for i := 0; i < 8; i++ {
		<-done
	}
}
