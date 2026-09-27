package t2s

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"
)

// parseOpenCCTSV 解析 OpenCC 原始 TSV(testdata 佐证溯源文件): 跳过 # 注释/空行,
// 每行 key\tvalues(values 空格分隔), 取第一候选(OpenCC 默认转换行为)。
func parseOpenCCTSV(t *testing.T, name string) map[string]string {
	t.Helper()
	f, err := os.Open(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("testdata 原始文件缺失(溯源链断裂): %v", err)
	}
	defer f.Close()
	m := make(map[string]string, 4096)
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		ln := strings.TrimRight(sc.Text(), "\r")
		if ln == "" || strings.HasPrefix(ln, "#") {
			continue
		}
		kv := strings.SplitN(ln, "\t", 2)
		if len(kv) != 2 || kv[0] == "" {
			t.Fatalf("%s 畸形行: %q", name, ln)
		}
		m[kv[0]] = strings.SplitN(kv[1], " ", 2)[0] // 第一候选
	}
	if err := sc.Err(); err != nil {
		t.Fatalf("读 %s: %v", name, err)
	}
	return m
}

// TestR74b_OpenCCDictScale 生成物规模数量级断言(字典↔testdata 一致性前置)。
func TestR74b_OpenCCDictScale(t *testing.T) {
	if got := len(parseOpenCCTSV(t, "TSCharacters.txt")); got < 4000 {
		t.Fatalf("TSCharacters 原始表行数异常: %d(预期 ≥4000)", got)
	}
	if got := len(parseOpenCCTSV(t, "TSPhrases.txt")); got < 450 {
		t.Fatalf("TSPhrases 原始表行数异常: %d(预期 ≥450)", got)
	}
	if len(charMap) < 3000 {
		t.Fatalf("合并后单字映射过少: %d(预期 ≥3000, OpenCC 3221+手工兜底)", len(charMap))
	}
	if len(phraseMap) < 450 {
		t.Fatalf("合并后词组映射过少: %d(预期 ≥450)", len(phraseMap))
	}
	// 合并表内不得残留恒等对(key==value 会把简体字形纳入转换 key 集)
	for k, v := range charMap {
		if k == v {
			t.Fatalf("charMap 残留恒等对 %q(简体恒等硬不变式风险)", string(k))
		}
	}
}

// TestR74b_DictMatchesTestdata 生成物↔原始数据对账: OpenCC 权威口径全量一致
// (map 对账, 非文本逐字比对, 无拖慢)+手工兜底对在位。
func TestR74b_DictMatchesTestdata(t *testing.T) {
	raw := parseOpenCCTSV(t, "TSCharacters.txt")
	// 期望集: 第一候选+剔除恒等+剔除畸形(生成器同口径)
	want := make(map[rune]rune, 4096)
	for k, v := range raw {
		kr, vr := []rune(k), []rune(v)
		if len(kr) != 1 || len(vr) != 1 || kr[0] == vr[0] {
			continue
		}
		want[kr[0]] = vr[0]
	}
	// 生成物独立重建(与 build 同解析路径)
	occ := make(map[rune]rune, 4096)
	applyCharPairsTo := func(m map[rune]rune, spec string) {
		for _, pair := range strings.Split(spec, ",") {
			pair = strings.TrimSpace(pair)
			r := []rune(pair)
			if len(r) == 2 && r[0] > 0x2e00 && r[1] > 0x2e00 && r[0] != r[1] {
				m[r[0]] = r[1]
			}
		}
	}
	applyCharPairsTo(occ, openccCharPairs)
	if len(occ) != len(want) {
		t.Fatalf("生成物单字对数 %d ≠ testdata 期望 %d(生成器口径漂移)", len(occ), len(want))
	}
	for k, v := range want {
		if occ[k] != v {
			t.Fatalf("生成物≠testdata @%q: got %q want %q", string(k), string(occ[k]), string(v))
		}
	}
	// 合并表权威覆盖: OpenCC 的 key 上手工字典不得胜出
	for k, v := range want {
		if charMap[k] != v {
			t.Fatalf("charMap@%q = %q, OpenCC 权威 %q(合并顺序漂移)", string(k), string(charMap[k]), string(v))
		}
	}
	// 手工兜底对(OpenCC 缺失的异体/两岸形态, R74 核对: 隔睫 已剔/瘓痪 已正)
	for _, p := range [][2]rune{
		{'妳', '你'}, {'砲', '炮'}, {'鶏', '鸡'}, {'燄', '焰'},
		{'敍', '叙'}, {'艶', '艳'}, {'瞇', '眯'},
	} {
		if got := charMap[p[0]]; got != p[1] {
			t.Errorf("手工兜底对丢失 %q→%q: got %q", string(p[0]), string(p[1]), string(got))
		}
	}
	// 词组表: 同口径对账
	rawPh := parseOpenCCTSV(t, "TSPhrases.txt")
	wantPh := make(map[string]string, 512)
	for k, v := range rawPh {
		if len([]rune(k)) > maxPhraseLen {
			continue
		}
		wantPh[k] = v
	}
	ocPh := make(map[string]string, 512)
	for _, pair := range strings.Split(openccPhrasePairs, ",") {
		pair = strings.TrimSpace(pair)
		kv := strings.SplitN(pair, "|", 2)
		if len(kv) == 2 && kv[0] != "" && kv[1] != "" {
			ocPh[kv[0]] = kv[1]
		}
	}
	if len(ocPh) != len(wantPh) {
		t.Fatalf("生成物词组数 %d ≠ testdata 期望 %d", len(ocPh), len(wantPh))
	}
	for k, v := range wantPh {
		if ocPh[k] != v {
			t.Fatalf("词组生成物≠testdata @%q: got %q want %q", k, ocPh[k], v)
		}
		if phraseMap[k] != v {
			t.Fatalf("phraseMap@%q = %q, TSPhrases 权威 %q", k, phraseMap[k], v)
		}
	}
}

// TestR74b_FullTableConvertProbe 全量合法对命中探针: TSCharacters 全表(剔恒等后
// 3221 对)逐对 Simplify(繁)==简, miss 必须 0。单字输入词组臂必然不触发(词长≥2),
// 探针纯净。
func TestR74b_FullTableConvertProbe(t *testing.T) {
	raw := parseOpenCCTSV(t, "TSCharacters.txt")
	miss, identChecked := 0, 0
	var missSample []string
	for k, v := range raw {
		if k == v {
			// 恒等字(藉/瞭/覆/么…): 转换必须原样(宁缺勿错保守口径)
			if got := Simplify(k); got != k {
				miss++
				missSample = append(missSample, k+"→"+got+"(want 恒等)")
			}
			identChecked++
			continue
		}
		if got := Simplify(k); got != v {
			miss++
			if len(missSample) < 10 {
				missSample = append(missSample, k+"→"+got+"(want "+v+")")
			}
		}
	}
	if miss != 0 {
		t.Fatalf("全表命中探针 miss=%d(样本: %s)", miss, strings.Join(missSample, "; "))
	}
	t.Logf("全表探针: %d 对命中 + %d 恒等字原样, miss=0", len(raw)-identChecked, identChecked)
}

// TestR74b_AmbiguityVerdict 歧义字裁决钉子: R74 主任务1 的验证结论固化。
// 藉/瞭/覆/么 标准表第一候选恒等(词级由词组臂); 乾→干/徵→征/鍾→钟/昇→升/
// 瀋→沈/麵→面 第一候选转换+TSPhrases 专名保护。
func TestR74b_AmbiguityVerdict(t *testing.T) {
	// 恒等裁决(不进 charMap)
	for _, c := range []string{"藉", "瞭", "覆", "么", "面", "后", "干", "著"} {
		if _, ok := charMap[[]rune(c)[0]]; ok {
			t.Errorf("恒等字 %q 不应进单字臂", c)
		}
	}
	// 第一候选转换裁决
	for _, c := range [][2]string{
		{"乾", "干"}, {"徵", "征"}, {"鍾", "钟"}, {"昇", "升"},
		{"瀋", "沈"}, {"麵", "面"}, {"麽", "么"}, {"於", "于"}, {"餘", "余"},
	} {
		if got := Simplify(c[0]); got != c[1] {
			t.Errorf("Simplify(%q)=%q, want %q(第一候选裁决)", c[0], got, c[1])
		}
	}
}

// TestR74b_PhraseProtectionOpenCC 词组保护面(TSPhrases 恒等保护词组+手工保护,
// 单字臂误转拦截)。
func TestR74b_PhraseProtectionOpenCC(t *testing.T) {
	idents := []string{
		"乾隆", "乾坤", "狼藉", // R73 手工保护
		"乾陵", "束脩", "想像", "魏徵", "瞭望", "乾元", "乾卦", // TSPhrases 恒等保护(词组臂命中原样输出=拦截单字臂)
	}
	for _, w := range idents {
		if got := Simplify(w); got != w {
			t.Errorf("保护词组被误转: %q → %q", w, got)
		}
	}
	conv := [][2]string{
		{"一目瞭然", "一目了然"}, {"不瞭解", "不了解"}, {"答覆", "答复"},
		{"藉口", "借口"}, {"憑藉", "凭借"}, {"看著窗外的風景", "看着窗外的风景"},
		{"軟體", "软件"}, {"乾乾淨淨", "干干净净"}, {"情有獨鍾", "情有独钟"},
		{"老態龍鍾", "老态龙钟"}, {"癱瘓", "瘫痪"},
		{"畢昇", "毕昇"}, {"鍾繇", "锺繇"}, // TSPhrases 词级保留特殊字形(昇/锺)
	}
	for _, c := range conv {
		if got := Simplify(c[0]); got != c[1] {
			t.Errorf("Simplify(%q)=%q, want %q", c[0], got, c[1])
		}
	}
}

// TestR74b_SimplifiedIdentityExtended 简体文本恒等扩展(重点: 本轮剔错的 隔/痪 与
// OpenCC 恒等字在简体正文的共存形态)。
func TestR74b_SimplifiedIdentityExtended(t *testing.T) {
	docs := []string{
		"他们间隔着一条河,隔壁就是老王家。",               // R74 虫①回归: 隔 曾被误转「睫」
		"他瘫痪在床三年,头发全白了,面条也咽不下去了。",         // 瘫/痪/发/面 简体形态
		"著名著作里写着:皇后住在后面的宫殿。",              // 著/后 简体字形
		"了解完毕,覆盖全部借口,瞭望塔上什么也看不见。",         // 了/覆/藉/瞭/么
		"干干净净的面条,乾隆年间的故事。",                // 干/面+专名
		"第1024章 出发!距离目标还有三千米。hello 2026!", // 数字/ASCII 混排
	}
	for _, doc := range docs {
		if got := Simplify(doc); got != doc {
			t.Fatalf("简体文本被误转: %q → %q", doc, got)
		}
	}
}

// TestR74b_InvalidUTF8FidelityOpenCC 非法 UTF-8 字节保真(字典扩容后仍走原字节路径)。
func TestR74b_InvalidUTF8FidelityOpenCC(t *testing.T) {
	in := "萬里長城" + "\xf0\x9f\x41" + "永不倒\xf0\x80\x80" + "癱瘓"
	out := Simplify(in)
	if utf8.ValidString(out) {
		t.Fatalf("非法字节被清洗/重建: %q", out)
	}
	if !strings.Contains(out, "\xf0\x9f\x41") || !strings.Contains(out, "\xf0\x80\x80") {
		t.Errorf("原始非法字节未照抄: %q", out)
	}
	if !strings.Contains(out, "万里长城") || !strings.Contains(out, "瘫痪") {
		t.Errorf("合法区段未按新字典转换: %q", out)
	}
}
