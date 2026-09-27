package stealth

// R76-c — interfere→pseudo 组合替换率稀释专项收口(R74 移交留档项)。
//
// R74 疑点: interfere 先插噪声句、pseudo 后跑, 担忧两个方向的交互 —
//   (a) pseudo 对插入噪声文本做替换 = 白替换/噪声被再污染(替换预算被噪声吃掉);
//   (b) 真实内容替换率被稀释(实际替换率低于配置面 5%-25%)。
//
// 探针实证(zz_probe, 300 轮 × 298 词典词全文档唯一布点):
//   A(pseudo 单独) 平均替换 46.1 / 替换率 0.155
//   B(interfere+pseudo) 平均替换 46.1 / 替换率 0.155 —— 稀释幅度 0.0%。
// 机制根因: interfere 插入的噪声 span 是【单个 tokMarkup token】(applyInsertions),
// pseudoTokens 只扫 tokText → 噪声文本对 pseudo 完全不可见; 句界切分点在标点之后,
// 词典键全为纯 CJK 词(无句读标点) → 切分零裂词、真实匹配集不变; pseudo 的
// total/k 口径天然只含真实内容 = 「替换率统计口径对 interfere 文本豁免」在实现上
// 已成立。本组回归把这三条不变式钉死, 防未来重构(如改插 tokText)静默引入真稀释。
//
// 附注(强度语义, 非虫): 噪声 span 携带的词典词不参与替换(每 ~25 span 页约 30 处),
// 「剥标签全文口径」的页面级替换率因此低于配置面 —— 属测量口径差而非实现稀释:
// 噪声句为每请求随机新文本, 对其做同义词替换是纯白替换零收益, 刻意不参与。

import (
	"strings"
	"testing"
)

// r76cWords 每同义词对取一侧构成探针词集: ①选中词全文档各恰一次 ②选中词与
// 伙伴词两个方向互斥(替换产物绝不会撞上已布点词, 计数零串扰) ③排除噪声句库
// 出现过的词 ④≥2 rune(与 synInit 装配门槛一致, 单字成分词剔除)。
func r76cWords() []string {
	noise := strings.Join(noiseSents, "") + strings.Join(noiseTails, "")
	chosen := map[string]bool{}
	partners := map[string]bool{}
	var ws []string
	for _, p := range synonymPairs {
		i := strings.IndexByte(p, '|')
		if i <= 0 || i >= len(p)-1 {
			continue
		}
		a, b := p[:i], p[i+1:]
		if len([]rune(a)) < 2 || len([]rune(b)) < 2 {
			continue
		}
		if chosen[a] || chosen[b] || partners[a] || partners[b] {
			continue
		}
		if strings.Contains(noise, a) || strings.Contains(noise, b) {
			continue
		}
		chosen[a] = true
		partners[b] = true
		ws = append(ws, a)
	}
	return ws
}

// r76cDoc 100 段 × 每段 6 词, 词间 ASCII 填充隔离(相邻 CJK 词不成意外键),
// 段尾句号供 interfere 句界候选。
func r76cDoc(ws []string) string {
	var b strings.Builder
	b.WriteString("<!DOCTYPE html><html><head><title>探针页</title></head><body>")
	wi := 0
	for p := 0; p < 100 && wi < len(ws); p++ {
		b.WriteString("<p>")
		for w := 0; w < 6 && wi < len(ws); w++ {
			if w > 0 {
				b.WriteString("qx")
			}
			b.WriteString(ws[wi])
			wi++
		}
		b.WriteString("。dy</p>")
	}
	b.WriteString("</body></html>")
	return b.String()
}

// r76cMatches 真实内容词典命中数(只数 tokText, 与 pseudoTokens 口径一致)。
func r76cMatches(toks []token) int {
	n := 0
	for i := range toks {
		if toks[i].kind == tokText {
			n += len(pseudoFind(toks[i].data))
		}
	}
	return n
}

// r76cStripNoise 摘除 sj-i 噪声 span: 返回(真实内容文本, 噪声 span 原文列表)。
func r76cStripNoise(s string) (string, []string) {
	var rb strings.Builder
	var spans []string
	for {
		i := strings.Index(s, `<span class="sj-i"`)
		if i < 0 {
			rb.WriteString(s)
			break
		}
		rb.WriteString(s[:i])
		j := strings.Index(s[i:], "</span>")
		if j < 0 {
			spans = append(spans, s[i:])
			s = ""
			break
		}
		end := i + j + len("</span>")
		spans = append(spans, s[i:end])
		s = s[end:]
	}
	return rb.String(), spans
}

// r76cSurvivors 布点词在文本中的存活数(词全文档唯一 → 存活数即未替换数)。
func r76cSurvivors(text string, ws []string) int {
	n := 0
	for _, w := range ws {
		if strings.Contains(text, w) {
			n++
		}
	}
	return n
}

// TestR76c_NoDilutionByInterfere 核心不变式: interfere 前置不稀释 pseudo 对
// 真实内容的替换 —— 两形态逐 nonce 替换数完全相等(pseudo RNG 与 interfere RNG
// 各自独立派生, total 匹配集相同, 超几何抽样决策序列逐位一致)。
func TestR76c_NoDilutionByInterfere(t *testing.T) {
	synInit()
	ws := r76cWords()
	if len(ws) < 250 {
		t.Fatalf("探针词集过小: %d", len(ws))
	}
	doc := r76cDoc(ws)
	toks := tokenize(doc)
	matches := r76cMatches(toks)
	if matches != len(ws) {
		t.Fatalf("布点失真: 词典命中 %d ≠ 布点 %d", matches, len(ws))
	}
	cfgP := Config{Pseudo: true}
	cfgIP := Config{Interfere: true, Density: 4, Pseudo: true}
	for n := 0; n < 200; n++ {
		pc := PageCtx{Kind: "read", Nonce: [16]byte{byte(n), byte(n >> 8), 0x5a, 0xa5}}
		outP := Apply(append([]byte(nil), doc...), cfgP, pc)
		outIP := Apply(append([]byte(nil), doc...), cfgIP, pc)
		realIP, _ := r76cStripNoise(string(outIP))
		replP := len(ws) - r76cSurvivors(string(outP), ws)
		replIP := len(ws) - r76cSurvivors(realIP, ws)
		if replP != replIP {
			t.Fatalf("nonce %d: 替换数不等 pseudo=%d interfere+pseudo=%d(稀释/虚高)", n, replP, replIP)
		}
		if replP == 0 {
			t.Fatalf("nonce %d: 零替换, 探针失效", n)
		}
	}
	// 抽样轮替换率落在配置面邻域(int 截断容差), 防探针构造退化。
	pc := PageCtx{Kind: "read", Nonce: [16]byte{0x99}}
	outP := Apply(append([]byte(nil), doc...), cfgP, pc)
	repl := len(ws) - r76cSurvivors(string(outP), ws)
	rate := float64(repl) / float64(matches)
	if rate < 0.04 || rate > 0.26 {
		t.Fatalf("替换率 %.3f 越出配置面 [0.05,0.25] 邻域", rate)
	}
}

// TestR76c_InterfereSplitsLossless 句界切分不损失真实匹配: interfere 前后
// tokText 词典命中数恒等(词典键全纯 CJK, 句读标点不在键内 → 切点零裂词)。
// 覆盖三类段落: 多句标点/无标点(段首插入路径)/含行内标签混合。
func TestR76c_InterfereSplitsLossless(t *testing.T) {
	synInit()
	docs := []string{
		"<!DOCTYPE html><html><body>" +
			"<p>他立刻跑回家。她马上就跟来了！雨说停就停？然后……大家纷纷离去。</p>" +
			"<p>没有任何句读标点的段落忽然一直缓缓前行</p>" +
			"<p>混合<b>顿时</b>与<i>慢慢</i>的段落。依旧悄悄向前。</p>" +
			"<p><p>未闭合段落突然开始",
		"</body></html>",
	}
	for _, doc := range docs {
		before := r76cMatches(tokenize(doc))
		cfg := Config{Interfere: true, Density: 2}
		after := r76cMatches(interfereTokens(tokenize(doc), cfg, rngFor(PageCtx{Kind: "read", Nonce: [16]byte{3}}, "interfere")))
		if before != after {
			t.Fatalf("切分裂词: before=%d after=%d doc=%q", before, after, doc)
		}
	}
}

// TestR76c_NoiseSpansUntouchedByPipeline 噪声 span 全管线逐字节不动:
// interfere 单独阶段的 span 字节 == 全管线(pseudo+transcode+obfuscate)输出中的
// span 字节。钉死「伪内容不被再污染」—— 若未来把插入形态改成 tokText 或让
// pseudo/transcode 消费 markup, 此测试即红(白替换/噪声改写回归)。
func TestR76c_NoiseSpansUntouchedByPipeline(t *testing.T) {
	synInit()
	doc := r76cDoc(r76cWords())
	cfgSolo := Config{Interfere: true, Density: 4}
	cfgFull := Config{Interfere: true, Density: 4, Pseudo: true, Transcode: true, Obfuscate: true}
	for _, nonce := range [][16]byte{{1}, {0xaa, 0x55}, {7, 8, 9}} {
		pc := PageCtx{Kind: "read", Nonce: nonce}
		_, want := r76cStripNoise(string(Apply(append([]byte(nil), doc...), cfgSolo, pc)))
		_, got := r76cStripNoise(string(Apply(append([]byte(nil), doc...), cfgFull, pc)))
		if len(want) == 0 {
			t.Fatalf("nonce %v: interfere 零插入, 探针失效", nonce)
		}
		if len(want) != len(got) {
			t.Fatalf("nonce %v: span 数漂移 solo=%d full=%d", nonce, len(want), len(got))
		}
		for i := range want {
			if want[i] != got[i] {
				t.Fatalf("nonce %v: span#%d 被后级管线改写:\n want %q\n got  %q", nonce, i, want[i], got[i])
			}
		}
	}
}
