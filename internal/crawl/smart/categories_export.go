// ============================================================
// [R69-a] 分类词表导出通道 — 供 internal/bootstrap 幂等引导与同步断言使用。
// bootstrap 固化的 16 分类名单必须与采集智能分类词表逐字一致(改任一侧必须
// 同步另一侧, 由 internal/bootstrap/bootstrap_test.go 断言)。
// 本文件为 bootstrap 迁移专用接缝, 请勿并入 smart.go 改动流。
// ============================================================
package smart

// CanonicalCategoryNames 导出 15 主分类名(词表序, 名称 4 字化)。返回副本防外泄修改。
func CanonicalCategoryNames() []string {
	out := make([]string, len(canonicalCategories))
	copy(out, canonicalCategories)
	return out
}
