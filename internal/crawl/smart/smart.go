// ============================================================
// 智能系统 —— src/lib/crawl/smart.ts(433 行)语义移植(R55-3a2)
// 语义权威: smart.ts(R22-c/R46-2c/R49-3 历轮词表打磨资产)。
// 消费方: bridge book 回调(智能分类/智能完结初判) + chapters 回调(智能完结终判)。
//
// 移植偏差(worklog R55-3a2 留档):
//
//   - smartCategory 的 LLM 兜底臂不移植(z-ai-web-dev-sdk 为 Node 运行时资产,
//     Go 单体无等价物): 词表命中链(source→keyword)与兜底语义完整保留,
//     词表全未命中且源分类存在 → fallback(兜底分类), 与 TS 终兜底一致。
//
//   - consolidateCategories(存量碎片收敛)不移植: 消费方是后台 API(3-b 职责),
//     非采集回调面。
//
// [R58-2a] 全站分类名 4 字化: 15 主分类名与 FallbackCategory 按主控定稿映射表改名
// (2-3 字 → 4 字), exactCanonMap 全量 value 同步 + 旧 2 字名/常见短名兜底新键;
// internal/web 导航锚由另一代理按同一张表同步, 两侧逐字一致。
//
// ============================================================
package smart

import (
	"regexp"
	"strings"
)

// ---------------- 智能分类 ----------------

// categoryKeywords [R22-c-3/R46-2c-1/R58-2a] 15 主分类词表(行序即词表序; 名称 4 字化)
var categoryKeywords = []struct {
	Name string
	KWs  []string
}{
	{"玄幻奇幻", []string{"玄幻", "修罗", "斗气", "魔法学院", "异界", "大陆", "废材", "神帝", "武魂", "神祇", "神国"}},
	{"西方奇幻", []string{"奇幻", "史诗", "骑士", "法师", "精灵", "龙族", "矮人", "魔兽"}},
	{"武侠江湖", []string{"武侠", "江湖", "剑客", "侠", "武林", "门派", "轻功", "内力", "镖局"}},
	{"仙侠修真", []string{"仙侠", "修真", "修仙", "筑基", "金丹", "元婴", "渡劫", "灵气", "仙人", "道法"}},
	{"都市生活", []string{"都市", "重生", "赘婿", "神豪", "总裁", "兵王", "神医", "urban", "打工", "逆袭", "求婚", "离婚", "七零", "八零", "九零"}},
	{"现代言情", []string{"言情", "甜宠", "恋爱", "霸总", "婚恋", "公主", "新娘", "嫁", "爱恋", "心动"}},
	{"历史演义", []string{"历史", "穿越", "朝代", "大唐", "大明", "大清", "三国", "水浒", "宋朝", "始皇", "皇帝", "王朝"}},
	{"军事战争", []string{"军事", "抗战", "war", "士兵", "特种兵", "战场", "部队", "军官"}},
	{"游戏竞技", []string{"游戏", "网游", "电竞", "副本", "升级", "系统", "玩家", "战队", "开黑"}},
	{"科幻未来", []string{"科幻", "星际", "末世", "丧尸", "机甲", "飞船", "外星", "末日", "AI", "人工智能", "虫族"}},
	{"悬疑灵异", []string{"悬疑", "推理", "侦探", "凶案", "犯罪", "谜团", "刑警", "法医", "命案", "灵异", "鬼", "阴阳", "风水", "盗墓", "僵尸", "驱魔", "诡异"}},
	{"体育竞技", []string{"体育", "足球", "篮球", "奥运", "冠军", "教练", "联赛"}},
	{"耽美纯爱", []string{"耽美", "纯爱", "原耽", "主受", "攻受"}},
	{"同人衍生", []string{"轻小说", "萌妹", "校园", "社团", "二次元", "青梅", "学妹", "学姐", "同人", "衍生", "原作"}},
	{"现实百态", []string{"现实", "职场", "创业", "商战", "生活", "家庭", "医生", "教师"}},
}

// canonicalCategories 主分类白名单(词表行数派生; 词表行数即白名单)
var canonicalCategories = func() []string {
	out := make([]string, 0, len(categoryKeywords))
	for _, row := range categoryKeywords {
		out = append(out, row.Name)
	}
	return out
}()

var canonSet = func() map[string]struct{} {
	m := make(map[string]struct{}, len(canonicalCategories))
	for _, c := range canonicalCategories {
		m[c] = struct{}{}
	}
	return m
}()

// FallbackCategory [R46-2c-1/R58-2a] 兜底分类名(4 字化)
const FallbackCategory = "综合其他"

// exactCanonMap [R46-2c-1/R58-2a] 源站分类名 → 主分类精确映射表(键一律小写; value 全为 4 字新名)。
// 旧 2 字主分类名与常见短名作兜底键直指新名; 已升为 canon 名的旧 value 键(如"都市生活":"都市")
// 删除 —— 由 lookup 的 canonSet 直命中承接
var exactCanonMap = map[string]string{
	// 玄幻奇幻
	"玄幻": "玄幻奇幻", "玄幻小说": "玄幻奇幻", "东方玄幻": "玄幻奇幻", "异世大陆": "玄幻奇幻", "奇幻玄幻": "玄幻奇幻",
	"高武": "玄幻奇幻", "王朝争霸": "玄幻奇幻", "玄幻魔法": "玄幻奇幻", "玄幻言情": "玄幻奇幻", "转世重生": "玄幻奇幻",
	// 西方奇幻
	"奇幻": "西方奇幻", "奇幻小说": "西方奇幻", "剑与魔法": "西方奇幻", "西幻": "西方奇幻", "魔幻": "西方奇幻",
	"史诗奇幻": "西方奇幻", "奇幻修真": "西方奇幻", "领主种田": "西方奇幻", "黑暗幻想": "西方奇幻",
	// 武侠江湖
	"武侠": "武侠江湖", "武侠小说": "武侠江湖", "武侠仙侠": "武侠江湖", "传统武侠": "武侠江湖", "新武侠": "武侠江湖",
	"国术无双": "武侠江湖", "快意恩仇": "武侠江湖", "仙侠武侠": "武侠江湖", "武侠同人": "武侠江湖",
	// 仙侠修真
	"仙侠": "仙侠修真", "仙侠小说": "仙侠修真", "修真": "仙侠修真", "修真小说": "仙侠修真", "修仙": "仙侠修真",
	"古典仙侠": "仙侠修真", "现代修真": "仙侠修真", "幻想修仙": "仙侠修真", "洪荒": "仙侠修真", "凡人流": "仙侠修真",
	"仙侠奇缘": "仙侠修真", "幻想修真": "仙侠修真", "修真仙侠": "仙侠修真",
	// 都市生活
	"都市": "都市生活", "都市小说": "都市生活", "都市言情": "都市生活", "现代都市": "都市生活", "都市异能": "都市生活",
	"异能超能": "都市生活", "官场": "都市生活", "官商": "都市生活", "娱乐明星": "都市生活", "娱乐": "都市生活",
	"重生都市": "都市生活", "都市日常": "都市生活", "都市职场": "都市生活", "都市频道": "都市生活", "合租": "都市生活",
	// 现代言情
	"言情": "现代言情", "言情小说": "现代言情", "古代言情": "现代言情", "浪漫青春": "现代言情", "青春": "现代言情",
	"青春文学": "现代言情", "古言": "现代言情", "现言": "现代言情", "宫斗": "现代言情",
	"宅斗": "现代言情", "豪门世家": "现代言情", "婚恋情缘": "现代言情", "女生小说": "现代言情", "女生频道": "现代言情",
	"女频": "现代言情", "女频小说": "现代言情", "快穿": "现代言情", "穿越言情": "现代言情", "总裁豪门": "现代言情",
	"甜宠": "现代言情", "古代情缘": "现代言情", "婚恋": "现代言情", "言情频道": "现代言情", "言情小说网": "现代言情",
	// 历史演义
	"历史": "历史演义", "历史小说": "历史演义", "架空历史": "历史演义", "历史传记": "历史演义", "秦汉三国": "历史演义",
	"两晋隋唐": "历史演义", "上古先秦": "历史演义", "宋元明清": "历史演义", "外国历史": "历史演义", "穿越": "历史演义",
	"穿越小说": "历史演义", "穿越时空": "历史演义", "架空": "历史演义", "架空穿越": "历史演义", "历史军事": "历史演义",
	"历史频道": "历史演义",
	// 军事战争
	"军事": "军事战争", "军事小说": "军事战争", "军旅": "军事战争", "军旅生涯": "军事战争", "军旅生活": "军事战争",
	"抗战": "军事战争", "抗战烽火": "军事战争", "谍战": "军事战争", "谍战特工": "军事战争", "特工": "军事战争",
	"战争": "军事战争", "战争幻想": "军事战争", "军事历史": "军事战争",
	// 游戏竞技
	"游戏": "游戏竞技", "游戏小说": "游戏竞技", "网游": "游戏竞技", "网游小说": "游戏竞技", "虚拟网游": "游戏竞技",
	"电子竞技": "游戏竞技", "电竞": "游戏竞技", "电竞小说": "游戏竞技", "游戏异界": "游戏竞技", "游戏系统": "游戏竞技",
	"游戏情缘": "游戏竞技", "网游竞技": "游戏竞技", "游戏异世": "游戏竞技", "游戏频道": "游戏竞技",
	// 科幻未来
	"科幻": "科幻未来", "科幻小说": "科幻未来", "科幻空间": "科幻未来", "末世": "科幻未来", "末世危机": "科幻未来",
	"星际": "科幻未来", "星际文明": "科幻未来", "未来世界": "科幻未来", "时空穿梭": "科幻未来", "赛博朋克": "科幻未来",
	"机甲": "科幻未来", "超级科技": "科幻未来", "进化变异": "科幻未来", "科幻末世": "科幻未来", "末世科幻": "科幻未来",
	// 悬疑灵异(含灵异, [R46-2c-1] 合并)
	"悬疑": "悬疑灵异", "悬疑小说": "悬疑灵异", "灵异": "悬疑灵异", "灵异小说": "悬疑灵异", "灵异悬疑": "悬疑灵异",
	"推理": "悬疑灵异", "推理悬疑": "悬疑灵异", "悬疑推理": "悬疑灵异", "侦探": "悬疑灵异", "侦探推理": "悬疑灵异",
	"恐怖": "悬疑灵异", "惊悚": "悬疑灵异", "恐怖惊悚": "悬疑灵异", "惊悚恐怖": "悬疑灵异", "盗墓": "悬疑灵异",
	"盗墓探险": "悬疑灵异", "诡秘": "悬疑灵异", "诡秘悬疑": "悬疑灵异", "探险": "悬疑灵异", "民间传说": "悬疑灵异",
	// 体育竞技
	"体育": "体育竞技", "体育小说": "体育竞技", "竞技": "体育竞技", "篮球": "体育竞技", "篮球运动": "体育竞技",
	"足球": "体育竞技", "足球运动": "体育竞技", "棋牌": "体育竞技", "其他竞技": "体育竞技",
	// 耽美纯爱
	"耽美": "耽美纯爱", "耽美小说": "耽美纯爱", "纯爱": "耽美纯爱", "原耽": "耽美纯爱", "原创耽美": "耽美纯爱",
	"衍生耽美": "耽美纯爱", "bl": "耽美纯爱", "bl小说": "耽美纯爱", "主受": "耽美纯爱",
	// 同人衍生(原轻小说行, [R58-2a] 定名; 青春校园从言情行改指此处)
	"轻小说": "同人衍生", "二次元": "同人衍生", "同人": "同人衍生", "衍生同人": "同人衍生", "动漫": "同人衍生",
	"日轻": "同人衍生", "原生幻想": "同人衍生", "吐槽": "同人衍生", "宅系": "同人衍生", "爆笑": "同人衍生",
	"青春校园": "同人衍生",
	// 现实百态
	"现实": "现实百态", "现实小说": "现实百态", "现实主义": "现实百态", "社会": "现实百态", "社会小说": "现实百态",
	"家庭": "现实百态", "家庭伦理": "现实百态", "情感": "现实百态", "职场": "现实百态", "职场小说": "现实百态",
	"商战": "现实百态", "财经": "现实百态", "乡土": "现实百态", "乡土小说": "现实百态",
	// 归「综合其他」: 源站导航/运营位噪声分类(不建为真实内容分类) + 无明确主类的短名兜底
	"其他": "综合其他", "小说": "综合其他", "全本": "综合其他", "完本": "综合其他", "全本小说": "综合其他", "完本小说": "综合其他",
	"推荐": "综合其他", "排行榜": "综合其他", "新书": "综合其他", "精品": "综合其他", "热门": "综合其他", "免费": "综合其他",
	"综合": "综合其他", "综合小说": "综合其他", "杂谈": "综合其他", "本站精选": "综合其他", "网友转载": "综合其他",
	"无限流": "综合其他",
}

var (
	stripWrapLeadRe  = regexp.MustCompile(`^[\s《「『【[(（]+`)
	stripWrapTrailRe = regexp.MustCompile(`[\s》」』】\])）]+$`)
	innerSpaceRe     = regexp.MustCompile(`\s+`)
	genderPrefixRe   = regexp.MustCompile(`^(?:女生|男生|女频|男频)`)
	genericTailRe    = regexp.MustCompile(`(?:免费小说|小说网|文学网|免费阅读|小说|文学|频道|专区|大全|书库|分类|作品|排行榜|推荐|网)$`)
	asciiWordRe      = regexp.MustCompile(`(?i)^[a-z0-9]+$`)
	asciiAlphaRe     = regexp.MustCompile(`(?i)^[a-z]+$`)
)

// canonicalizeCategoryName [R46-2c-1/R58-2a] 源站分类名 → 主分类语义归一:
// ① 剥包裹符/内部空白 → ② 精确映射表(含旧 2 字名兜底新键) → ③ 循环剥离通用前后缀
// (≤3 轮, 逐中间形态查表) → ④ 包含关系回退(最长命中, 同长按词表序; 排除兜底名自包含)。
// 无法归一返回 ""。链路闭合: canonSet(4 字名)直命中 → exactCanonMap(源名→4 字名) → 剥离回退。
func canonicalizeCategoryName(raw string) string {
	s0 := strings.TrimSpace(raw)
	if s0 == "" {
		return ""
	}
	s := innerSpaceRe.ReplaceAllString(stripWrapTrailRe.ReplaceAllString(stripWrapLeadRe.ReplaceAllString(s0, ""), ""), "")
	if s == "" {
		return ""
	}
	lookup := func(v string) string {
		if _, ok := canonSet[v]; ok {
			return v
		}
		if hit, ok := exactCanonMap[strings.ToLower(v)]; ok {
			return hit
		}
		return ""
	}
	if direct := lookup(s); direct != "" {
		return direct
	}
	// 通用前后缀循环剥离(≤3 轮防多层叠加): 每轮先尾剥再头剥, 逐中间形态查表 ——
	// 尾剥优先保留性别前缀语义("女生小说频道"→"女生小说"精确命中现代言情; 修前
	// 头尾同轮齐剥成"小说"提前落入噪声兜底键), 无进展即止(空串不赋回 s)
	for i := 0; i < 3; i++ {
		progressed := false
		if t := genericTailRe.ReplaceAllString(s, ""); t != "" && t != s {
			s, progressed = t, true
			if hit := lookup(s); hit != "" {
				return hit
			}
		}
		if t := genderPrefixRe.ReplaceAllString(s, ""); t != "" && t != s {
			s, progressed = t, true
			if hit := lookup(s); hit != "" {
				return hit
			}
		}
		if !progressed {
			break
		}
	}
	// 包含关系回退: 取最长命中(同长取词表序前者), 排除兜底名自包含(噪声词不反吞)
	best := ""
	for _, c := range canonicalCategories {
		if c == FallbackCategory {
			continue
		}
		if strings.Contains(s, c) && (best == "" || len([]rune(c)) > len([]rune(best))) {
			best = c
		}
	}
	return best
}

// normalizeCategoryText [R22-c-2] 分类匹配文本归一化: 全角拉丁/标点(FF01-FF5E)→半角、
// 全角空格→半角空格、统一小写; 中文经此变换不变, 截断 3000。
func normalizeCategoryText(text string) string {
	var b strings.Builder
	b.Grow(len(text))
	for _, r := range text {
		switch {
		case r == 0x3000:
			b.WriteRune(' ')
		case r >= 0xFF01 && r <= 0xFF5E:
			b.WriteRune(r - 0xFEE0)
		default:
			b.WriteRune(r)
		}
	}
	out := strings.ToLower(b.String())
	r := []rune(out)
	if len(r) > 3000 {
		out = string(r[:3000]) // TS slice(0,3000) UTF-16 口径的 rune 近似(BMP 等长)
	}
	return out
}

// wordMatches 词命中判定: 纯 [a-z0-9]+ 词走 \b 词边界(大小写不敏感); 中文词无词边界
// 概念仍走 includes; 含连字符/空格短语走 includes(与 TS 分支一致)。
func wordMatches(t, w string) bool {
	if asciiAlphaRe.MatchString(w) {
		re, err := regexp.Compile(`(?i)\b` + regexp.QuoteMeta(w) + `\b`)
		if err != nil {
			return strings.Contains(t, w)
		}
		return re.MatchString(t)
	}
	return strings.Contains(t, w)
}

// matchCategoryByText 分类匹配: ① 直接命中已有分类名(归一化后 includes) ② 关键词评分
// (ASCII 词 \b 边界, 词长 ≥2 计 2 分否则 1 分; 同分取词表序前者)。
func matchCategoryByText(text string, existingCategories []string) string {
	t := normalizeCategoryText(text)
	if t == "" {
		return ""
	}
	for _, c := range existingCategories {
		cn := normalizeCategoryText(c)
		if cn != "" && strings.Contains(t, cn) {
			return c
		}
	}
	bestName := ""
	bestScore := 0
	for _, row := range categoryKeywords {
		score := 0
		for _, rawKw := range row.KWs {
			kw := strings.TrimSpace(rawKw)
			if kw == "" {
				continue
			}
			// TS: /^[a-z0-9]+$/i.test(kw) ? wordMatches(t, kw) : t.includes(kw)
			var hit bool
			if asciiWordRe.MatchString(kw) {
				hit = wordMatches(t, kw)
			} else {
				hit = strings.Contains(t, kw)
			}
			if hit {
				if len([]rune(kw)) >= 2 {
					score += 2
				} else {
					score++
				}
			}
		}
		if score > 0 && (bestName == "" || score > bestScore) {
			bestName, bestScore = row.Name, score
		}
	}
	return bestName
}

// CategoryResult smartCategory 结果(method: source|keyword|fallback|none)
type CategoryResult struct {
	Category string
	Method   string
}

// SmartCategory 智能分类(词表链; LLM 臂不移植见头注):
// ① 源分类先语义归一 → ② 归一失败但已是库内分类原样保留 → ③ 关键词匹配 →
// ④ 源分类存在但全程未命中 → 「综合其他」兜底; 无源分类 → 空(不硬塞)。
// existingCategories = 库内分类名表(调用方提供; 读失败退化空表语义由调用方承担)。
func SmartCategory(bookName, intro, sourceCategory string, existingCategories []string) CategoryResult {
	sc := strings.TrimSpace(sourceCategory)
	if sc != "" {
		if canon := canonicalizeCategoryName(sc); canon != "" {
			return CategoryResult{Category: canon, Method: "source"}
		}
		for _, n := range existingCategories {
			if n == sc {
				return CategoryResult{Category: sc, Method: "source"}
			}
		}
	}
	if kw := matchCategoryByText(bookName+"\n"+intro, existingCategories); kw != "" {
		return CategoryResult{Category: kw, Method: "keyword"}
	}
	if sc != "" {
		return CategoryResult{Category: FallbackCategory, Method: "fallback"}
	}
	return CategoryResult{Category: "", Method: "none"}
}

// ---------------- 智能完结判断 ----------------

// 词表统一小写; detectCompleteFromText 对文本 toLowerCase 后匹配(大小写不敏感)
var completeWords = []string{"已完结", "已完本", "完结", "完本", "全本", "大结局", "全书完", "正文完", "无弹窗全本", "final", "completed", "complete", "finished"}
var ongoingWords = []string{"连载中", "连载", "未完结", "未完待续", "新书", "更新中", "ongoing", "on going", "on-going", "serial", "serializing", "updating", "unfinished", "incomplete", "hiatus", "paused"}

// detectCompleteFromText 未完优先(避免"未完结"被"完结"误判); 文本截断 2000 小写化
// (TS slice(0,2000) UTF-16 口径的 rune 近似)。
func detectCompleteFromText(text string) string {
	r := []rune(text)
	if len(r) > 2000 {
		r = r[:2000]
	}
	t := strings.ToLower(string(r))
	if t == "" {
		return "unknown"
	}
	for _, w := range ongoingWords {
		if wordMatches(t, w) {
			return "ongoing"
		}
	}
	for _, w := range completeWords {
		if wordMatches(t, w) {
			return "completed"
		}
	}
	return "unknown"
}

// CompleteDetectInput smartCompleteDetect 入参(statusField/intro/latestChapterTitle/
// bookName/lastChapterTitle 同 TS 全字段)
type CompleteDetectInput struct {
	StatusField        string
	Intro              string
	LatestChapterTitle string
	BookName           string
	LastChapterTitle   string
}

// DetectResult {Status: completed|ongoing|unknown, Reason}
type DetectResult struct {
	Status string
	Reason string
}

// SmartCompleteDetect 智能完结判定:
// 1. 源站状态字段 → 2. 简介关键词 → 3. 最新章节标题 → 4. 目录末章标题 → 5. 书名标注。
func SmartCompleteDetect(in CompleteDetectInput) DetectResult {
	if in.StatusField != "" {
		if r := detectCompleteFromText(in.StatusField); r != "unknown" {
			return DetectResult{Status: r, Reason: "源站状态: " + truncateStr(in.StatusField, 30)}
		}
	}
	if in.Intro != "" {
		if r := detectCompleteFromText(in.Intro); r != "unknown" {
			return DetectResult{Status: r, Reason: "简介关键词"}
		}
	}
	if in.LatestChapterTitle != "" {
		if r := detectCompleteFromText(in.LatestChapterTitle); r != "unknown" {
			return DetectResult{Status: r, Reason: "最新章节标题"}
		}
	}
	if in.LastChapterTitle != "" {
		if r := detectCompleteFromText(in.LastChapterTitle); r != "unknown" {
			return DetectResult{Status: r, Reason: "目录末章标题"}
		}
	}
	if in.BookName != "" {
		if r := detectCompleteFromText(in.BookName); r != "unknown" {
			return DetectResult{Status: r, Reason: "书名标注"}
		}
	}
	return DetectResult{Status: "unknown", Reason: "无法判断"}
}

func truncateStr(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}
