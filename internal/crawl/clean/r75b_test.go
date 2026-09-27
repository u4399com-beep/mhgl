// ============================================================
// [R75-b] 35 条在库规则 × clean 配置管线的端到端巡检:
// builtin_rules.json 每条规则的 clean 段经 FromRuleRaw(sanitizeAdPattern 消毒)
// 后逐条编译 —— 畸形/超长/嵌套量词模式会被 compileAdPattern 静默跳过,
// 本巡检把「静默跳过面」显式化并钉死既有规则的消毒产物全可编译。
// ============================================================
package clean

import (
	"encoding/json"
	"os"
	"regexp"
	"strings"
	"testing"
)

func TestR75bBuiltinRulesCleanPipelineAudit(t *testing.T) {
	raw, err := os.ReadFile("../../api/builtin_rules.json")
	if err != nil {
		t.Fatalf("read builtin_rules.json: %v", err)
	}
	var rules []struct {
		Key    string          `json:"key"`
		Enable bool            `json:"enabled"`
		Config json.RawMessage `json:"config"`
	}
	if err := json.Unmarshal(raw, &rules); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(rules) != 35 {
		t.Fatalf("规则数 = %d, want 35", len(rules))
	}
	for _, r := range rules {
		cfg := FromRuleRaw(r.Config)
		// 底线并集后逐条编译(消费侧真实形态 withFloorPatterns)
		pats := withFloorPatterns(cfg.AdPatterns)
		for i, p := range pats {
			re := compileAdPattern(p)
			if re == nil {
				// 与 regexp.Compile 直连区分: 是模式本身非法还是被钳制规则拒
				_, cerr := regexp.Compile(p)
				t.Errorf("规则 %s AdPatterns[%d] 编译失败(静默跳过面): err=%v pattern=%.80q", r.Key, i, cerr, p)
			}
		}
		// 消毒不变式: 自定义模式不得残留裸 \S*/贪心 .*(吞标签族)
		for i, p := range cfg.AdPatterns {
			if regexp.MustCompile(`\\S\*|\\S\+`).MatchString(p) {
				t.Errorf("规则 %s AdPatterns[%d] 消毒后残留 \\S 族: %.80q", r.Key, i, p)
			}
			if n := 0; utf8RuneLen(p) > 300 {
				t.Errorf("规则 %s AdPatterns[%d] 超过 300 rune 上限(消费侧静默失效): %d", r.Key, i, n)
			}
		}
	}
}

func utf8RuneLen(s string) int {
	n := 0
	for range s {
		n++
	}
	return n
}

// TestR75bFromRuleRawMalformedTolerance FromRuleRaw 对畸形 clean 段的健壮性:
// 非法 JSON/clean 非对象 → 整段缺省不 panic; 字段内类型错(数字混入字符串数组)
// 消费已解码部分(TS safeStrArr 逐项过滤同语义), 合法项保留。
func TestR75bFromRuleRawMalformedTolerance(t *testing.T) {
	def := defaultConfig()
	// 整段缺省族
	for _, b := range []string{
		``,
		`{`,
		`null`,
		`"string"`,
		`[1,2,3]`,
		`{"clean": null}`,
		`{"clean": "not-object"}`,
		`{"clean": {"adPatterns": [1, null]}}`, // 全错项 → 空数组 → safeStrArr nil → 缺省
	} {
		cfg := FromRuleRaw([]byte(b))
		if len(cfg.AdPatterns) != len(def.AdPatterns) || len(cfg.RemoveSelectors) != len(def.RemoveSelectors) || len(cfg.Whitelist) != len(def.Whitelist) {
			t.Fatalf("畸形输入 %q 未正确回退缺省: patterns=%d selectors=%d whitelist=%d", b, len(cfg.AdPatterns), len(cfg.RemoveSelectors), len(cfg.Whitelist))
		}
	}
	// 部分解码族: 类型错项过滤, 合法项保留, 其余字段照常解码
	cfg := FromRuleRaw([]byte(`{"clean":{"adPatterns":[1,null,"ok-pattern"],"normalize":false}}`))
	if len(cfg.AdPatterns) != 1 || cfg.AdPatterns[0] != "ok-pattern" {
		t.Fatalf("混合类型 adPatterns 应逐项过滤保留合法项: %#v", cfg.AdPatterns)
	}
	if cfg.Normalize {
		t.Fatalf("类型错同段其余字段应照常解码: normalize=%v", cfg.Normalize)
	}
	// 语法错: 整段缺省(TS JSON.parse 全盘抛同口径)
	cfg2 := FromRuleRaw([]byte(`{"clean":{"adPatterns":["a"],`))
	if len(cfg2.AdPatterns) != len(def.AdPatterns) {
		t.Fatalf("语法错应整段缺省: %#v", cfg2.AdPatterns)
	}
	if !strings.EqualFold(cfg.Whitelist[0], "p") {
		t.Fatalf("缺省白名单异常: %#v", cfg.Whitelist)
	}
}
