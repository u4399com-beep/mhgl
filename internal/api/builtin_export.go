// ============================================================
// [R69-a] 内置规则库导出通道 — 供 internal/bootstrap 幂等引导直连复用。
// 数据与 POST /api/admin/rules/import-builtin 完全同源(go:embed builtin_rules.json),
// 仅做形态转换(json.RawMessage → string), 不携带任何 HTTP 语义。
// 本文件为 bootstrap 迁移专用接缝, 请勿并入 admin_rules.go 改动流。
// ============================================================
package api

// BuiltinRuleInfo 内置规则条目的对外只读形态(Config 为 JSON 字符串)。
type BuiltinRuleInfo struct {
	Key         string
	Name        string
	Description string
	Enabled     bool
	Source      string
	Config      string
}

// BuiltinRules 返回内置规则库全量条目(解析失败返回 nil, 与内部口径一致)。
func BuiltinRules() []BuiltinRuleInfo {
	all := builtinRules()
	out := make([]BuiltinRuleInfo, 0, len(all))
	for i := range all {
		out = append(out, BuiltinRuleInfo{
			Key:         all[i].Key,
			Name:        all[i].Name,
			Description: all[i].Description,
			Enabled:     all[i].Enabled,
			Source:      all[i].Source,
			Config:      string(all[i].Config),
		})
	}
	return out
}
