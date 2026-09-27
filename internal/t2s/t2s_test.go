package t2s

import (
	"strings"
	"testing"
	"unicode/utf8"
)

// TestR73_DictIntegrity 字典完整性: 非空/无占位字符映射/key 与 value 均为 CJK。
func TestR73_DictIntegrity(t *testing.T) {
	if len(charMap) < 900 {
		t.Fatalf("单字映射过少: %d(预期 ≥900, 解析口径或字典断裂)", len(charMap))
	}
	if len(phraseMap) < 40 {
		t.Fatalf("词组映射过少: %d", len(phraseMap))
	}
	for k, v := range charMap {
		switch v {
		// R74: '同' 移出占位黑名单 —— OpenCC 权威表含 衕→同(胡同) 合法映射,
		// R73 时代手工解析 bug 的占位对(撤同/晚同/盛同)已由生成物消灭。
		case '低', '→', '不':
			t.Errorf("占位/可疑映射: %q → %q", string(k), string(v))
		}
		if v < 0x2e00 {
			t.Errorf("value 非 CJK: %q → %q", string(k), string(v))
		}
	}
	// value 集合不得再次出现在 key 集合之外形成循环(转换是单遍的, 只需确认
	// value 均为简体常用字 —— 由覆盖声明保证, 这里钉住无占位即满足)。
}

// TestR73_SimplifyBasics 常见繁体形态转换(书名/正文片段)。
func TestR73_SimplifyBasics(t *testing.T) {
	cases := [][2]string{
		{"萬古神帝", "万古神帝"},
		{"飛劍問道", "飞剑问道"},
		{"鬥破蒼穹", "斗破苍穹"},
		{"仙俠修真", "仙侠修真"},
		{"靈劍山", "灵剑山"},
		{"這個世界沒有龍", "这个世界没有龙"},
		{"他們來說話", "他们来说话"},
		{"對於這個問題", "对于这个问题"},
		{"歷史與傳說", "历史与传说"},
		{"頭髮與牙齒", "头发与牙齿"},
		{"鐵馬冰河", "铁马冰河"},
		{"一隻雞兩隻鴨", "一只鸡两只鸭"},
		{"聽風觀雨", "听风观雨"},
		{"滄海桑田", "沧海桑田"},
		{"繁體字在這裡", "繁体字在这里"},
	}
	for _, c := range cases {
		if got := Simplify(c[0]); got != c[1] {
			t.Errorf("Simplify(%q) = %q, want %q", c[0], got, c[1])
		}
	}
}

// TestR73_SimplifySimplifiedIdentity 简体文本零变化(恒等): 简体正文经转换必须原样返回。
func TestR73_SimplifySimplifiedIdentity(t *testing.T) {
	// 典型简体小说文本(含常用简体字+标点+数字+ASCII), 一字不动。
	doc := "张三说道：「这是第二十九章，主角终于突破了金丹期！」他心中一紧，" +
		"回头看了一眼身后——那里空无一人。窗外，风起云涌；桌上，茶水已凉。" +
		"三千年后,世界上再也没有神仙。第100章 完 (2023-12-31)"
	if got := Simplify(doc); got != doc {
		// 定位第一个差异字符
		g, w := []rune(got), []rune(doc)
		for i := range w {
			if i >= len(g) || g[i] != w[i] {
				t.Fatalf("简体文本被误转@%d: %q → %q", i, string(w[i:i+minR(8, len(w)-i)]), string(g[i:minR(8, len(g)-i)]))
			}
		}
		t.Fatalf("长度漂移: %d → %d", len(w), len(g))
	}
}

// TestR73_PhraseProtection 词组保护臂: 单字映射在专名词组内被拦截。
func TestR73_PhraseProtection(t *testing.T) {
	if got := Simplify("乾隆皇帝"); got != "乾隆皇帝" {
		t.Errorf("乾隆被误转: %q", got)
	}
	if got := Simplify("扭转乾坤"); got != "扭转乾坤" {
		t.Errorf("乾坤被误转: %q", got)
	}
	if got := Simplify("声名狼藉"); got != "声名狼藉" {
		t.Errorf("狼藉被误转: %q", got)
	}
	// 乾 在非专名上下文正常转(乾燥→干燥)
	if got := Simplify("皮膚乾燥"); got != "皮肤干燥" {
		t.Errorf("乾燥 未转换: %q", got)
	}
	// 词级转换: 著 zhe 形态
	if got := Simplify("他看著窗外的風景"); got != "他看着窗外的风景" {
		t.Errorf("看著 词级转换失败: %q", got)
	}
	// 著 在「著名/著作」中不动(简体本身用著)
	if got := Simplify("著名著作"); got != "著名著作" {
		t.Errorf("著名/著作 被误转: %q", got)
	}
	// 瞭解→了解(词级); 瞭望 不动
	if got := Simplify("瞭解情况"); got != "了解情况" {
		t.Errorf("瞭解: %q", got)
	}
	if got := Simplify("瞭望台"); got != "瞭望台" {
		t.Errorf("瞭望 被误转: %q", got)
	}
}

// TestR73_InvalidUTF8Fidelity 非法 UTF-8 字节保真(与 stealth 管线同标准)。
func TestR73_InvalidUTF8Fidelity(t *testing.T) {
	in := "繁體" + "\xf0\x9f\x41" + "文本"
	out := Simplify(in)
	if utf8.ValidString(out) {
		// 整串变合法 = 非法字节被清洗/重建(应原样保留保真)
		t.Fatalf("非法字节被清洗/重建: %q", out)
	}
	if !strings.Contains(out, "\xf0\x9f\x41") {
		t.Errorf("原始非法字节未照抄: %q", out)
	}
	if !strings.Contains(out, "繁体") || !strings.Contains(out, "文本") {
		t.Errorf("周围合法文本未转换(繁體→繁体): %q", out)
	}
}

// TestR73_AsciiFastPath 纯 ASCII/空串快速路径(原样返回, 同指针语义允许)。
func TestR73_AsciiFastPath(t *testing.T) {
	for _, s := range []string{"", "hello world 123", "/read/6/1.html?site=x"} {
		if got := Simplify(s); got != s {
			t.Errorf("快速路径被改动: %q → %q", s, got)
		}
	}
}

func minR(a, b int) int {
	if a < b {
		return a
	}
	return b
}
