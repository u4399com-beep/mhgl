// ============================================================
// smart 包回归测试(R58-2a): 分类词表 4 字化改名 + 归一链路闭合
// ============================================================
package smart

import (
	"strings"
	"testing"
	"unicode/utf8"
)

// TestCanonicalizeCategoryName4Char R58-2a 主控定稿回归矩阵:
// 源站 2 字分类名走 exactCanonMap 兜底新键; 4 字新名 canonSet 直命中;
// 常见短名/噪声名/无法归一名各就各位
func TestCanonicalizeCategoryName4Char(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		// 主控指定六断言
		{"玄幻", "玄幻奇幻"},     // 旧 2 字名 → exactCanonMap 新键
		{"都市生活", "都市生活"},   // 4 字新名 canonSet 直命中
		{"玄幻小说", "玄幻奇幻"},   // 常见源站名精确映射
		{"女生小说频道", "现代言情"}, // 多层包裹: 尾剥保留性别前缀语义命中「女生小说」
		{"无限流", "综合其他"},    // 无明确主类短名兜底
		{"未知怪分类", ""},      // 无法归一返回空(不硬塞)
		// 全表改名抽样: 15 主分类兜底键逐一闭合
		{"奇幻", "西方奇幻"},
		{"武侠", "武侠江湖"},
		{"仙侠", "仙侠修真"},
		{"言情", "现代言情"},
		{"历史", "历史演义"},
		{"军事", "军事战争"},
		{"游戏", "游戏竞技"},
		{"科幻", "科幻未来"},
		{"悬疑", "悬疑灵异"},
		{"体育", "体育竞技"},
		{"耽美", "耽美纯爱"},
		{"轻小说", "同人衍生"},
		{"现实", "现实百态"},
		{"其他", "综合其他"},
		{"青春校园", "同人衍生"}, // 从言情改指同人衍生(R58-2a 定稿)
		{"玄幻言情", "玄幻奇幻"}, // 保留键值随表更新
		// 包裹符/空白/大小写形态
		{"《玄幻》", "玄幻奇幻"},
		{" 女频 小说 ", "现代言情"},
		{"BL", "耽美纯爱"},
		// 包含关系回退(4 字名子串)
		{"西方奇幻文学馆", "西方奇幻"},
	}
	for _, c := range cases {
		if got := canonicalizeCategoryName(c.in); got != c.want {
			t.Errorf("canonicalizeCategoryName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// TestCategoryVocabularyInvariants 4 字化词表不变量:
// ① 15 主分类名全为 4 字且唯一 ② FallbackCategory 4 字且不在主分类集
// ③ exactCanonMap 全部 value ∈ 主分类集 ∪ {FallbackCategory}(防手误写旧名/错字)
func TestCategoryVocabularyInvariants(t *testing.T) {
	seen := map[string]bool{}
	for _, row := range categoryKeywords {
		if utf8.RuneCountInString(row.Name) != 4 {
			t.Errorf("主分类名 %q 非 4 字", row.Name)
		}
		if seen[row.Name] {
			t.Errorf("主分类名 %q 重复", row.Name)
		}
		seen[row.Name] = true
	}
	if len(categoryKeywords) != 15 {
		t.Errorf("主分类行数 = %d, want 15", len(categoryKeywords))
	}
	if utf8.RuneCountInString(FallbackCategory) != 4 {
		t.Errorf("兜底分类名 %q 非 4 字", FallbackCategory)
	}
	if seen[FallbackCategory] {
		t.Errorf("兜底分类名 %q 不应与主分类重合", FallbackCategory)
	}
	for k, v := range exactCanonMap {
		if v != FallbackCategory && !seen[v] {
			t.Errorf("exactCanonMap[%q] = %q 不在主分类集/兜底名内", k, v)
		}
		if strings.ToLower(k) != k {
			t.Errorf("exactCanonMap 键 %q 应一律小写", k)
		}
	}
	// 旧 2 字名必须全部作为兜底键在表内(链路闭合: 源站 2 字分类名精确命中)
	for _, old := range []string{"玄幻", "奇幻", "武侠", "仙侠", "都市", "言情", "历史", "军事", "游戏", "科幻", "悬疑", "体育", "耽美", "轻小说", "现实", "其他"} {
		if _, ok := exactCanonMap[old]; !ok {
			t.Errorf("旧 2 字名 %q 缺少 exactCanonMap 兜底键", old)
		}
	}
}

// TestSmartCategory4Char SmartCategory 全链: source 归一/keyword 词表/兜底名均为 4 字新名
func TestSmartCategory4Char(t *testing.T) {
	// source 臂: 源分类名归一
	if got := SmartCategory("凡人修仙传", "修仙小说", "仙侠", nil); got.Category != "仙侠修真" || got.Method != "source" {
		t.Errorf("source 臂 = %+v, want {仙侠修真 source}", got)
	}
	// keyword 臂: 书名+简介关键词评分
	if got := SmartCategory("网游之天下第一", "主角在游戏里升级打怪当玩家", "", nil); got.Category != "游戏竞技" || got.Method != "keyword" {
		t.Errorf("keyword 臂 = %+v, want {游戏竞技 keyword}", got)
	}
	// 同人衍生新增关键词(同人/衍生/原作)生效
	if got := SmartCategory("火影同人录", "原作角色衍生故事", "", nil); got.Category != "同人衍生" || got.Method != "keyword" {
		t.Errorf("同人衍生关键词 = %+v, want {同人衍生 keyword}", got)
	}
	// fallback 臂: 源分类存在但全程未命中 → 综合其他
	if got := SmartCategory("怪书", "怪简介", "怪分类", nil); got.Category != FallbackCategory || got.Method != "fallback" {
		t.Errorf("fallback 臂 = %+v, want {%s fallback}", got, FallbackCategory)
	}
	// 无源分类且关键词未命中 → 空(不硬塞)
	if got := SmartCategory("XYZ", "ABC", "", nil); got.Category != "" || got.Method != "none" {
		t.Errorf("none 臂 = %+v, want {\"\" none}", got)
	}
}
