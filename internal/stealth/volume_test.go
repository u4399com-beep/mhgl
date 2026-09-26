// ============================================================
// R70-c2 — SplitVolume 表驱动回归 + ConfigFromSettings 键面回归
// ============================================================
package stealth

import "testing"

func TestSplitVolume_Table(t *testing.T) {
	cases := []struct {
		name string
		in   string
		vol  string
		rest string
		ok   bool
	}{
		{"第X卷+余题", "第一卷 风云再起", "第一卷", "风云再起", true},
		{"第X卷 纯前缀", "第12卷", "第12卷", "", true},
		{"阿拉伯数字", "第3卷上", "第3卷", "上", true},
		{"中文复合数字", "第两百卷 终局", "第两百卷", "终局", true},
		{"段内空格宽容", "第 12 卷 风起", "第 12 卷", "风起", true},
		{"第X部", "第3部 终章", "第3部", "终章", true},
		{"第X部 纯前缀", "第二部", "第二部", "", true},
		{"卷N", "卷一 · 旧事", "卷一", "旧事", true},
		{"卷阿拉伯", "卷12外传", "卷12", "外传", true},
		{"Vol.点", "Vol.2 深海", "Vol.2", "深海", true},
		{"vol 小写", "vol.10", "vol.10", "", true},
		{"VOL 大写", "VOL.3 风暴", "VOL.3", "风暴", true},
		{"vol 空格分隔", "Vol 7 尾声", "Vol 7", "尾声", true},
		{"volume 全拼", "Volume 5 开端", "Volume 5", "开端", true},
		{"首尾空白", "  第一卷 风云  ", "第一卷", "风云", true},
		{"第X章不命中", "第两百章 大结局", "", "第两百章 大结局", false},
		{"第X话不命中", "第1话 开始", "", "第1话 开始", false},
		{"无前缀", "正文 第一章", "", "正文 第一章", false},
		{"裸第", "第", "", "第", false},
		{"裸卷", "卷", "", "卷", false},
		{"vol无数字", "vol.abc", "", "vol.abc", false},
		{"空串", "", "", "", false},
		{"纯空白", "   ", "", "", false},
	}
	for _, c := range cases {
		vol, rest, ok := SplitVolume(c.in)
		if ok != c.ok || vol != c.vol || rest != c.rest {
			t.Errorf("%s: SplitVolume(%q) = (%q, %q, %v), 期望 (%q, %q, %v)",
				c.name, c.in, vol, rest, ok, c.vol, c.rest, c.ok)
		}
	}
}

func TestSplitVolume_AdjacentGroupingShape(t *testing.T) {
	// 相邻同卷归并语义的直接验证(键 = vol 原文; 无前缀归「正文」组, 与
	// web 层 volumeGroupsFor 同一口径: 组键=归并名, 相邻同名合并)。
	titles := []string{"第一卷 起", "第一卷 承", "第二卷 转", "番外"}
	var groups []string
	for _, ti := range titles {
		vol, _, ok := SplitVolume(ti)
		name := vol
		if !ok {
			name = "正文"
		}
		if len(groups) == 0 || groups[len(groups)-1] != name {
			groups = append(groups, name)
		}
	}
	if len(groups) != 3 || groups[0] != "第一卷" || groups[1] != "第二卷" || groups[2] != "正文" {
		t.Fatalf("相邻成组语义破坏: %v", groups)
	}
	// 头部无前缀 → 首组即「正文」。
	lead := []string{"番外一篇", "第一卷 起", "第一卷 承"}
	groups = nil
	for _, ti := range lead {
		vol, _, ok := SplitVolume(ti)
		name := vol
		if !ok {
			name = "正文"
		}
		if len(groups) == 0 || groups[len(groups)-1] != name {
			groups = append(groups, name)
		}
	}
	if len(groups) != 2 || groups[0] != "正文" || groups[1] != "第一卷" {
		t.Fatalf("头部无前缀归并语义破坏: %v", groups)
	}
}

func TestConfigFromSettings_KeysAndDefaults(t *testing.T) {
	// 缺键 → 全默认(全关)。
	get := func(string) string { return "" }
	cfg := ConfigFromSettings(get)
	if cfg.AllOff() != true ||
		cfg.TranscodeMode != "entity" || cfg.InterfereMode != "hidden" ||
		cfg.Density != 4 || cfg.PseudoSeed != "request" {
		t.Fatalf("缺键默认值漂移: %+v", cfg)
	}
	// 全键齐发(带 JSON 引号形态 + 裸形态混用)。
	vals := map[string]string{
		"stealth.obfuscate":         `"1"`,
		"stealth.transcode":         "1",
		"stealth.transcode.mode":    `"zwsp"`,
		"stealth.interfere":         `"true"`,
		"stealth.interfere.mode":    "offscreen",
		"stealth.interfere.density": "6",
		"stealth.pseudo":            `"on"`,
		"stealth.pseudo.seed":       "stable",
		"book.volume.show":          "1",
	}
	cfg = ConfigFromSettings(func(k string) string { return vals[k] })
	if !cfg.Obfuscate || !cfg.Transcode || cfg.TranscodeMode != "zwsp" ||
		!cfg.Interfere || cfg.InterfereMode != "offscreen" || cfg.Density != 6 ||
		!cfg.Pseudo || cfg.PseudoSeed != "stable" {
		t.Fatalf("全键装配漂移: %+v", cfg)
	}
	if cfg.AllOff() {
		t.Fatal("全开配置 AllOff 应为 false")
	}
}

func TestConfigFromSettings_IllegalFallsBack(t *testing.T) {
	vals := map[string]string{
		"stealth.transcode.mode":    "rot13",
		"stealth.interfere.mode":    "invisible",
		"stealth.interfere.density": "99",
		"stealth.pseudo.seed":       "random",
		"stealth.obfuscate":         "yes",
	}
	cfg := ConfigFromSettings(func(k string) string { return vals[k] })
	if cfg.TranscodeMode != "entity" || cfg.InterfereMode != "hidden" ||
		cfg.Density != 8 || cfg.PseudoSeed != "request" {
		t.Fatalf("非法值应回落默认: %+v", cfg)
	}
	if !cfg.Obfuscate {
		t.Fatal("yes 应判真")
	}
	// 密度: 非数字脏值回落 4 / 越界数字钳制到 2-8("1" 与 "0" 同归下钳 2, 与 "99"→8 同口径)。
	if c := ConfigFromSettings(func(string) string { return "abc" }); c.Density != 4 {
		t.Fatalf("非数字脏密度应回落 4: %d", c.Density)
	}
	if c := ConfigFromSettings(func(string) string { return "0" }); c.Density != 2 {
		t.Fatalf("密度下钳 2: %d", c.Density)
	}
}
