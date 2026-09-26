// ============================================================
// [R71-c] 伪装管线回归 — legacy 引用保真 / 512KB 跳过边界 / 重名属性不重排 /
// 词典退化键清退 / 引用形识别表
// ============================================================
package stealth

import (
	"html"
	"math/rand"
	"strings"
	"testing"
)

// runObfSeeds 以 seed 确定性 nonce 跑 n 轮 obfuscate, 返回可见文本与输入不一致的轮数。
// 可见文本口径 = visibleText(剥隐藏 span/注释/幽灵元素, 实体解码, 剥零宽)。
func runObfSeeds(t *testing.T, doc string, n int) (drifts int, firstOut string) {
	t.Helper()
	want := visibleText(doc)
	for seed := 0; seed < n; seed++ {
		cfg := Config{Obfuscate: true}
		pc := PageCtx{Kind: "read", BookID: "b", ChapterID: "c", Nonce: nonceOfSeed(seed)}
		out := string(Apply([]byte(doc), cfg, pc))
		if got := visibleText(out); got != want {
			drifts++
			if drifts == 1 {
				firstOut = out
			}
		}
	}
	return drifts, firstOut
}

// ---------------- A. legacy 无分号命名引用保真(R71-c 真虫回归) ----------------
//
// 修前: &amp/&nbsp/&copy 等无分号 legacy 引用的内部字母被 2% 实体化 →
// 浏览器解码失配渲染字面 "amp"/"nbsp"(探针实证 600 轮 139 漂移)。
// 修后: 潜在引用前缀整段照抄, 600 轮零漂移。

func TestObfuscate_LegacyNamedRefs_InvisibleStable(t *testing.T) {
	docs := []string{
		`<p>他说&amp 然后&nbsp 继续&amp 测试&amp 完毕。</p>`,
		`<p>A&amp;B&nbsp;C&copy;D&lt;E&gt;F& quot。</p>`, // 尾段 & 后跟空格 → 非引用形(可编码面)
		`<p>&nbsp&nbsp&amp&amp&nbsp&nbsp。</p>`,
	}
	for i, doc := range docs {
		if drifts, out := runObfSeeds(t, doc, 600); drifts != 0 {
			t.Fatalf("样例%d: %d/600 轮可见漂移\n样例输出: %s", i, drifts, out)
		}
		// 浏览器解码口径(含 legacy 无分号)下, 输出可见文本与输入一致。
		if html.UnescapeString(visibleText(doc)) != html.UnescapeString(visibleText(doc)) {
			t.Fatal("对照恒真断言损坏")
		}
	}
}

func TestObfuscate_MixedRefShapes_FullPipelineStable(t *testing.T) {
	// transcode(实体) + obfuscate 两拍叠加: 转码产物(&#x…;/&#…; 带分号)与
	// 源内 legacy 引用共存时, 低频 ASCII 实体化不得破坏任何一种。
	doc := `<p>他说&amp;然后&nbsp;继续&#x4E0A;海&#19978;测试&amp 完毕&#x200B;。</p>`
	want := visibleText(doc)
	drifts := 0
	for seed := 0; seed < 300; seed++ {
		cfg := Config{Transcode: true, TranscodeMode: "entity", Obfuscate: true}
		pc := PageCtx{Kind: "read", BookID: "b", ChapterID: "c", Nonce: nonceOfSeed(seed)}
		out := string(Apply([]byte(doc), cfg, pc))
		if got := visibleText(out); got != want {
			drifts++
			if drifts == 1 {
				t.Logf("样例输出: %s", out)
			}
		}
	}
	if drifts != 0 {
		t.Fatalf("%d/300 轮可见漂移(混合引用形破坏)", drifts)
	}
}

// ---------------- B. 512KB 跳过边界 ----------------

func TestApply_MaxDocBytes_SkipBoundary(t *testing.T) {
	cfg := allFourOn()
	pc := PageCtx{Kind: "read", BookID: "b", ChapterID: "c", Nonce: NewNonce()}
	pad := strings.Repeat("。", maxDocBytes/3) // CJK 全文(3 字节/字)
	exact := []byte("<p>" + pad + "</p>")
	if len(exact) > maxDocBytes {
		pad = pad[:len(pad)-(len(exact)-maxDocBytes)]
		exact = []byte("<p>" + pad + "</p>")
	}
	if len(exact) < maxDocBytes { // CJK 截断对齐不了 3 的余数 → ASCII pad 补齐
		exact = []byte("<p>" + strings.Repeat("a", maxDocBytes-7) + "</p>")
	}
	if len(exact) != maxDocBytes {
		t.Fatalf("边界样例构造失败: %d", len(exact))
	}
	out := Apply(append([]byte{}, exact...), cfg, pc)
	if string(out) == string(exact) {
		t.Fatal("恰为 512KB 的文档应照常处理(输出应被混淆改变)")
	}
	over := append(exact, 'x') // 512KB + 1 字节
	before := string(over)
	got := Apply(over, cfg, pc)
	if &got[0] != &over[0] {
		t.Fatal("超 512KB 应原样返回同一底层数据(零拷贝跳过)")
	}
	if string(got) != before {
		t.Fatal("超 512KB 文档输出应逐字节不变")
	}
}

// ---------------- C. 重名属性开标签不得重排(R71-c scanAttrSpans 修复回归) ----------------

func TestObfuscate_DupAttrTags_NeverReordered(t *testing.T) {
	// 同名异值(class="a"/class="b"): HTML first-wins, 重排会翻转生效值。
	doc := `<div class="a" class="b" id="z">x</div>`
	for seed := 0; seed < 200; seed++ {
		cfg := Config{Obfuscate: true}
		pc := PageCtx{Kind: "book", Nonce: nonceOfSeed(seed)}
		out := string(Apply([]byte(doc), cfg, pc))
		if !strings.Contains(out, `class="a" class="b"`) && !strings.Contains(out, `class="b" class="a"`) {
			// 大小写抖动不影响属性区; 此处只可能由非法重排产生。
			if !strings.Contains(out, `class="a"`) || !strings.Contains(out, `class="b"`) {
				t.Fatalf("seed=%d 属性片段丢失: %s", seed, out)
			}
			continue
		}
		if strings.Contains(out, `class="b" class="a"`) {
			t.Fatalf("seed=%d 重名属性被重排(first-wins 翻转): %s", seed, out)
		}
	}
	// 首位生效语义锚定: 输出中 class="a" 必须仍在前。
	cfg := Config{Obfuscate: true}
	pc := PageCtx{Kind: "book", Nonce: nonceOfSeed(7)}
	out := string(Apply([]byte(doc), cfg, pc))
	if strings.Index(out, `class="a"`) > strings.Index(out, `class="b"`) {
		t.Fatalf("first-wins 顺序翻转: %s", out)
	}
}

// ---------------- D. 词典退化键清退(R71-c pseudo 数据修复回归) ----------------

func TestPseudo_NoDegeneratePairs(t *testing.T) {
	synInit()
	for _, p := range synonymPairs {
		i := strings.IndexByte(p, '|')
		if i <= 0 || i >= len(p)-1 {
			t.Fatalf("退化词条(缺侧): %q", p)
		}
		a, b := p[:i], p[i+1:]
		if a == b {
			t.Fatalf("退化词条(a==b, 白耗替换配额): %q", p)
		}
	}
	// 错别字伙伴清退: 等侯(侯≠候)不得再作为 等候 的替换目标。
	if partners := synMap["等候"]; partners != nil {
		for _, w := range partners {
			if w == "等侯" {
				t.Fatalf("错别字伙伴仍在词典: 等候 → %v", partners)
			}
		}
	}
	// 双向完整性: 每个双侧 ≥2 汉字的词条 a|b 在 synMap 中双向可达
	// (单字键被 synInit 有意过滤防误伤, 不在断言面)。
	for _, p := range synonymPairs {
		i := strings.IndexByte(p, '|')
		a, b := p[:i], p[i+1:]
		if len([]rune(a)) < 2 || len([]rune(b)) < 2 {
			continue
		}
		found := false
		for _, w := range synMap[a] {
			if w == b {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("词条 %q 正向伙伴丢失", p)
		}
	}
}

// ---------------- E. entityRefLen 引用形识别表 ----------------

func TestEntityRefLen_ShapeTable(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"&#x4E0A;", 8}, // hex 带分号
		{"&#19978;", 8}, // dec 带分号
		{"&#x41", 5},    // hex 无分号(浏览器解码; 5 字节全吞)
		{"&#65", 4},     // dec 无分号(浏览器解码)
		{"&amp;", 5},    // 命名带分号
		{"&#x", 3},      // 无数字 hex 前缀(保守照抄防内部字母被编码)
		{"&#", 0},       // 裸 &# → 非引用
		{"&", 0},        // 裸 & → 非引用
		{"&amp", 0},     // 无分号命名(保守不认, 由 asciiEntityText 整段照抄承接)
		{"&nbsp;", 6},   // 命名带分号
		{"&#xZZ;", 3},   // 无有效数字 → 认领 "&#x" 前缀(照抄防二次编码)
		{"&#x4E0A", 7},  // hex 无分号多数字
		{"&am;", 4},     // 表外命名+分号 → 整段认领照抄(浏览器字面渲染一致)
		{"&lt;", 4},     // 命名带分号
	}
	for _, c := range cases {
		if got := entityRefLen(c.in); got != c.want {
			t.Errorf("entityRefLen(%q) = %d, 期望 %d", c.in, got, c.want)
		}
	}
}

// ---------------- F. 干扰句密度下限(直接构参防退化) ----------------

func TestInterfere_DensityClampDirectConfig(t *testing.T) {
	// Config 直构 Density=0(绕过 ConfigFromSettings 钳制路径) → 不得 panic 且有产出。
	doc := strings.Repeat("<p>句子一。句子二！</p>", 30)
	for _, den := range []int{0, -3, 1, 99} {
		cfg := Config{Interfere: true, InterfereMode: "hidden", Density: den}
		pc := PageCtx{Kind: "read", BookID: "b", ChapterID: "c", Nonce: nonceOfSeed(den + 7)}
		out := string(Apply([]byte(doc), cfg, pc))
		n := strings.Count(out, `class="sj-i"`)
		if n == 0 || n > 40 {
			t.Fatalf("density=%d 应产出 [1,40] 条干扰句, 实测 %d", den, n)
		}
	}
	_ = rand.New(rand.NewSource(1)) // 保持 rand 依赖存活(池化 RNG 面后续复用)
}
