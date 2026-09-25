// ============================================================
// R65-b — 智能 TDK 引擎(站群系统 18 套 SEO 预设 + 随机组合填充)
//
// 需求: 「在站群系统中加入智能TDK填充，要求预设18套符合seo的TDK配置可供自由组合随机填充」。
//
// 设计(与 PSEO 引擎同风格, 纯函数无副作用):
//
//   - 18 套预设常量表 tdkPresets: 每套含 ID/风格名/支持页类型/title/description/keywords
//     三模板 + 风格注释, 覆盖主流 SEO 句式(书名型/最新章节/免费阅读/疑问/年份/地域/情感钩子/
//     分类聚合/首页门户等)。
//   - 站点级配置 TDKSiteCfg(JSON, 存 Site.smartTdk 列): enabled 总开关 + sets 启用套编号
//   - pages 每页类型策略(smart|off) + templates 站点级模板覆盖(可选, 高级用法)。
//     默认关闭 —— 存量站点零影响。
//   - 随机组合: 每次渲染从「启用套 ∩ 支持当前页类型」中 crypto/rand 随机选一套,
//     多次请求命中不同套 → 站群各页 TDK 天然去重。
//   - 占位符: {站名}{书名}{作者}{分类}{状态}{字数段}{热词}{年份}; 〔…〕为可裁段 ——
//     段内任一占位符未命中(空值)则整段裁掉(如字数未知), 绝不出现空括号/悬挂标点;
//     产出统一清洗(空括号对回收/重复标点坍缩/首尾悬挂标点裁除/占位符零残留)。
//
// 消费方: internal/web/public.go smartTdkFill(home/book/toc/read/category 五挂接点),
// 未启用/无可用套/渲染为空一律回落原 TDK 逻辑(R62 修复语义零回退)。
// ============================================================
package smart

import (
	crand "crypto/rand"
	"encoding/json"
	"math/big"
	"regexp"
	"strings"
	"time"
)

// ---------------- 页类型 ----------------

// TDK 页类型(与 public.go 视图一一对应)。
const (
	PageHome     = "home"     // 首页
	PageBook     = "book"     // 书籍详情页
	PageToc      = "toc"      // 目录页
	PageRead     = "read"     // 阅读页(正文)
	PageCategory = "category" // 分类聚合页
)

// 页类型白名单(配置消毒用)。
var tdkPageTypes = map[string]bool{
	PageHome: true, PageBook: true, PageToc: true, PageRead: true, PageCategory: true,
}

// 页类型策略值(其余值一律按 off 处理)。
const (
	PageModeSmart = "smart"
	PageModeOff   = "off"
)

// ---------------- 站点配置 ----------------

// TDKTriple 单套 TDK 三模板(站点级覆盖用)。
type TDKTriple struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Keywords    string `json:"keywords"`
}

// TDKSiteCfg 站点智能 TDK 配置(Site.smartTdk 列, JSON TEXT)。
type TDKSiteCfg struct {
	Enabled   bool                 `json:"enabled"`
	Sets      []int                `json:"sets"`
	Pages     map[string]string    `json:"pages"`
	Templates map[string]TDKTriple `json:"templates"` // 键=套编号字符串; 可选站点级模板覆盖
}

// ParseSiteCfg 站点行 smartTdk 原始 JSON → 消毒后配置(脏 JSON/越界值一律安全回落, 永不报错)。
func ParseSiteCfg(raw string) TDKSiteCfg {
	cfg := TDKSiteCfg{Pages: map[string]string{}, Templates: map[string]TDKTriple{}}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return cfg
	}
	var parsed TDKSiteCfg
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return cfg
	}
	cfg.Enabled = parsed.Enabled
	cfg.Sets = sanitizeSets(parsed.Sets)
	for pt, mode := range parsed.Pages {
		if !tdkPageTypes[pt] {
			continue
		}
		m := strings.TrimSpace(strings.ToLower(mode))
		if m == "on" {
			m = PageModeSmart
		}
		if m != PageModeSmart {
			m = PageModeOff
		}
		cfg.Pages[pt] = m
	}
	for id, t := range parsed.Templates {
		if !validSetID(id) {
			continue
		}
		if strings.TrimSpace(t.Title) == "" || strings.TrimSpace(t.Description) == "" {
			continue // 覆盖模板必须三件齐备(至少 title/desc), 防半残配置
		}
		cfg.Templates[id] = TDKTriple{
			Title:       clampRunes(t.Title, 500),
			Description: clampRunes(t.Description, 500),
			Keywords:    clampRunes(t.Keywords, 500),
		}
	}
	return cfg
}

// sanitizeSets 启用套编号消毒: 钳 1..18 + 去重 + 升序。
func sanitizeSets(in []int) []int {
	seen := map[int]bool{}
	out := make([]int, 0, len(in))
	for _, n := range in {
		if n < 1 || n > TDKPresetCount || seen[n] {
			continue
		}
		seen[n] = true
		out = append(out, n)
	}
	// 升序(插入序稳定, 配置可读)
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j] < out[j-1]; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

// PageMode 当前页类型策略(未配置=off; 未知页类型=off)。
func (c TDKSiteCfg) PageMode(pageType string) string {
	if !tdkPageTypes[pageType] {
		return PageModeOff
	}
	if m, ok := c.Pages[pageType]; ok && m == PageModeSmart {
		return PageModeSmart
	}
	return PageModeOff
}

// validSetID 套编号键合法性("1".."18")。
func validSetID(id string) bool {
	if id == "" || len(id) > 2 {
		return false
	}
	n := 0
	for _, c := range id {
		if c < '0' || c > '9' {
			return false
		}
		n = n*10 + int(c-'0')
	}
	return n >= 1 && n <= TDKPresetCount
}

// ---------------- 上下文 ----------------

// TDKCtx 渲染上下文(字段空值=未命中 → 占位符按可裁段/清洗规则安全回落)。
type TDKCtx struct {
	SiteName string // 站名
	BookName string // 书名
	Author   string // 作者
	Category string // 分类
	Status   string // 状态(已完结/连载中; 未知传空)
	Words    int64  // 字数(<=0 未知 → 字数段为空, 可裁段整段裁掉)
	Year     string // 年份(如 2025; 空则引擎补当前年)
}

// WordBand 字数段(10万+字/100万+字 …; 未知/不足 1 万 → 空串, 由可裁段机制整段裁掉)。
func WordBand(words int64) string {
	switch {
	case words <= 0:
		return ""
	case words >= 1_000_000:
		return "100万+字"
	case words >= 500_000:
		return "50万+字"
	case words >= 300_000:
		return "30万+字"
	case words >= 100_000:
		return "10万+字"
	case words >= 50_000:
		return "5万+字"
	default:
		return "1万+字"
	}
}

// tdkHotWords 热词池({热词} 每次渲染随机取一, 与套随机正交叠加变体)。
var tdkHotWords = []string{"全文阅读", "最新章节", "无弹窗", "完整版", "免费阅读", "在线阅读", "TXT下载", "完结全本"}

// ---------------- 18 套预设 ----------------

// TDKPresetMeta 单套预设元信息(常量表行)。
type tdkPreset struct {
	ID    int      // 套编号(1..18)
	Name  string   // 风格名(UI 勾选项展示)
	Note  string   // 风格注释
	Pages []string // 支持页类型
	T     string   // title 模板
	D     string   // description 模板(70-160 字, 含 1-2 个长尾词)
	K     string   // keywords 模板(4-8 个)
}

// TDKPresetCount 预设总数(=18; sanitizeSets/validSetID 以此为界)。
const TDKPresetCount = 18

// tdkPresets 18 套 SEO TDK 预设常量表(行序即套编号)。
//
// 风格分布: 1-11 书籍族(book/toc/read 通吃, 其中 2/6 兼目录, 12 目录专享, 13 阅读专享),
// 14-16 分类聚合族(category), 17-18 首页门户族(home)。
// 模板规约: 〔…〕=可裁段(段内占位符未命中整段裁掉); {热词} 每次渲染随机取一。
var tdkPresets = []tdkPreset{
	{
		ID: 1, Name: "简洁书名型", Pages: []string{PageBook, PageToc, PageRead},
		Note: "极简书名+站名, 品牌词前置, 通用性最强",
		T:    "《{书名}》- {站名}",
		D:    "《{书名}》是{作者}创作的{状态}{分类}小说，〔全书{字数段}，〕情节跌宕起伏、文笔流畅细腻。{站名}提供《{书名}》全文免费在线阅读，支持无弹窗清爽界面与全本TXT下载，追更收藏两不误。",
		K:    "{书名},{作者},{分类}小说,{书名}全文阅读,{站名}",
	},
	{
		ID: 2, Name: "最新章节列表型", Pages: []string{PageBook, PageToc, PageRead},
		Note: "「最新章节列表」长尾词双写, 追更流量主力句式",
		T:    "{书名}最新章节列表_《{书名}》无弹窗阅读-{站名}",
		D:    "《{书名}》最新章节列表由{站名}实时整理，{作者}笔下这部{状态}{分类}小说〔累计{字数段}，〕更新及时、排版清爽，支持无弹窗全文阅读与逐章追更，是追更党不可错过的免费小说站。",
		K:    "{书名}最新章节,{书名}目录,{书名}无弹窗,{分类}小说,{站名}",
	},
	{
		ID: 3, Name: "全文免费阅读型", Pages: []string{PageBook, PageToc, PageRead},
		Note: "「全文免费阅读」核心词开头, 强调免登录即读",
		T:    "{书名}全文免费阅读_{作者}小说-{站名}",
		D:    "想看《{书名}》？{站名}提供全文免费在线阅读，无需注册登录。{作者}创作的这部{状态}{分类}小说〔累计{字数段}，〕情节紧凑引人入胜，支持整本缓存与TXT打包下载，随时随地开读不中断。",
		K:    "{书名}全文免费阅读,{书名}小说,{作者},{分类}小说,{书名}在线阅读",
	},
	{
		ID: 4, Name: "作者搭配型", Pages: []string{PageBook, PageToc, PageRead},
		Note: "书名+作者双词打头, 吃作者名搜索流量",
		T:    "{书名}小说_{作者}作品全集-{站名}",
		D:    "《{书名}》出自作者{作者}之手，是其{分类}题材的代表作。{站名}收录{作者}全部作品章节，这部{状态}{分类}小说更新第一时间同步，喜欢{作者}文风的读者切勿错过，全本免费在线阅读。",
		K:    "{书名},{作者}小说,{作者}作品集,{分类}小说,{书名}在线阅读",
	},
	{
		ID: 5, Name: "完整版在线阅读型", Pages: []string{PageBook, PageToc, PageRead},
		Note: "「完整版在线阅读」长尾词, 强调无删减全本",
		T:    "《{书名}》完整版在线阅读_{分类}小说-{站名}",
		D:    "《{书名}》完整版现已上线{站名}，{作者}这部{状态}{分类}小说〔总量{字数段}，〕完整章节逐章呈现，无删减无错序，阅读体验流畅稳定，收藏本页追更快人一步，全本完结亦可打包下载。",
		K:    "{书名}完整版,{书名}在线阅读,{分类}小说,{作者},{站名}",
	},
	{
		ID: 6, Name: "面包屑型", Pages: []string{PageBook, PageToc, PageRead},
		Note: "分类>书名>状态 面包屑结构, 分类词前置",
		T:    "{分类}小说《{书名}》章节目录_{状态}作品-{站名}",
		D:    "{分类}小说《{书名}》完整章节目录已收录至{站名}，{作者}笔下的这部{状态}作品〔共{字数段}，〕章节顺序完整、更新及时，点击章节标题即可进入正文免费阅读，无需下载任何APP。",
		K:    "{书名}目录,{书名}章节列表,{分类}小说,{书名},{站名}",
	},
	{
		ID: 7, Name: "疑问句式型", Pages: []string{PageBook, PageToc, PageRead},
		Note: "「结局是什么」疑问钩子, 点击率导向",
		T:    "《{书名}》结局是什么？{状态}{分类}小说全文阅读",
		D:    "《{书名}》结局是什么？主角最终能否得偿所愿？{作者}这部{状态}{分类}小说〔全书{字数段}，〕谜底逐章揭晓，剧透止步于此，在{站名}点击目录直抵大结局，免费阅读全程无弹窗打扰。",
		K:    "{书名}结局,{书名}大结局,{书名}全文阅读,{分类}小说,{站名}",
	},
	{
		ID: 8, Name: "年份句式型", Pages: []string{PageBook, PageToc, PageRead},
		Note: "{年份}年必读书单句式, 时效性长尾词",
		T:    "{年份}年必读{分类}小说《{书名}》-{站名}",
		D:    "{年份}年{分类}小说书单更新：《{书名}》高居{站名}必读榜前列，{作者}笔下剧情高能不断〔全书{字数段}〕，追更与补读皆宜，全本免费在线阅读，看完记得收藏本站防迷路。",
		K:    "{年份}小说,{分类}小说,{书名},{书名}全本阅读,{站名}",
	},
	{
		ID: 9, Name: "情感钩子型", Pages: []string{PageBook, PageToc, PageRead},
		Note: "「一口气读完」情绪钩子, 口语化高点击",
		T:    "一口气读完的{分类}小说《{书名}》-{站名}",
		D:    "这本《{书名}》被读者称为最值得一口气读完的{分类}小说！{作者}构思的{状态}故事〔铺陈{字数段}，〕节奏毫不拖沓，反转环环相扣。{站名}免费提供全本在线阅读，今晚就开始畅读。",
		K:    "{分类}小说,{书名},{书名}免费阅读,好看的小说,{站名}",
	},
	{
		ID: 10, Name: "地域热追型", Pages: []string{PageBook, PageToc, PageRead},
		Note: "地域热度句式, 人群面广",
		T:    "全国读者都在追的{分类}小说《{书名}》-{站名}",
		D:    "从北上广到边陲小城，全国读者都在追《{书名}》！{作者}创作的{状态}{分类}小说〔已达{字数段}，〕话题热度持续攀升，{站名}同步更新最新章节，全本免费在线阅读，打开即看。",
		K:    "{书名},{分类}小说,热门小说,{书名}最新章节,{站名}",
	},
	{
		ID: 11, Name: "字数钩子型", Pages: []string{PageBook, PageToc, PageRead},
		Note: "字数段进标题(10万+字/100万+字), 未知名下整段裁掉",
		T:    "《{书名}》〔{字数段}〕完整版_无弹窗免费阅读-{站名}",
		D:    "《{书名}》〔{字数段}〕完整版免费开放阅读！{作者}的这部{状态}{分类}小说全文无弹窗、无广告干扰，{站名}服务器响应迅速，翻页流畅不卡顿，全本收藏一键直达，告别书荒从这本开始。",
		K:    "{书名}完整版,{书名}无弹窗,{书名}免费阅读,{分类}小说,{站名}",
	},
	{
		ID: 12, Name: "目录专享型", Pages: []string{PageToc},
		Note: "仅目录页: 全部章节一览句式",
		T:    "《{书名}》章节目录_全部章节一览-{站名}",
		D:    "{站名}为您整理《{书名}》全部章节目录，按序排列、点击即读。{作者}创作的这部{状态}{分类}小说〔累计{字数段}，〕目录随正文更新实时同步，收藏本页即可追更，免费阅读永不掉线。",
		K:    "{书名}目录,{书名}全部章节,{书名}章节列表,{分类}小说,{站名}",
	},
	{
		ID: 13, Name: "阅读页专享型", Pages: []string{PageRead},
		Note: "仅阅读页: 正文沉浸阅读句式",
		T:    "《{书名}》正文免费阅读_无弹窗全屏-{站名}",
		D:    "您正在{站名}阅读《{书名}》正文内容。{作者}这部{状态}{分类}小说〔累计{字数段}，〕章节内容持续更新，本页提供无弹窗全屏阅读模式，夜间护眼与字号调节随心切换，沉浸式阅读体验。",
		K:    "{书名}在线阅读,{书名}最新章节,{书名}无弹窗,{分类}小说,{站名}",
	},
	{
		ID: 14, Name: "分类大全型", Pages: []string{PageCategory},
		Note: "仅分类页: {分类}小说大全 句式",
		T:    "{分类}小说大全_热门{分类}作品推荐-{站名}",
		D:    "{站名}{分类}频道今日重磅更新，精选全网热门{分类}小说免费在线阅读，完结佳作与连载新作一键切换，{年份}年最新书单持续收录，找{分类}好书就逛本站分类页，每日更新不断档。",
		K:    "{分类}小说,{分类}小说大全,{分类}小说推荐,{站名},免费小说",
	},
	{
		ID: 15, Name: "分类榜单型", Pages: []string{PageCategory},
		Note: "仅分类页: 年份+分类排行榜句式",
		T:    "{年份}年{分类}小说排行榜_佳作推荐-{站名}",
		D:    "{年份}年{分类}小说排行榜由{站名}依据站内真实阅读数据整理，上榜作品均为口碑与热度兼具的{分类}佳作，完结精品可一口气读至大结局，连载新作逐章追更，点击书名即刻免费开读。",
		K:    "{年份}{分类}小说,{分类}小说排行榜,{分类}小说,{站名},小说推荐",
	},
	{
		ID: 16, Name: "分类长尾型", Pages: []string{PageCategory},
		Note: "仅分类页: 「看X小说就来Y」长尾句式",
		T:    "看{分类}小说就来{站名}_全本免费在线阅读",
		D:    "想找好看的{分类}小说？{站名}{分类}分类页全本免费在线阅读，覆盖{年份}年最热门的{分类}题材作品，支持按更新时间与字数排序筛选，TXT全本下载同步开放，助你告别书荒一站读爽。",
		K:    "{分类}小说,{分类}小说免费阅读,{分类}完本,{站名},TXT下载",
	},
	{
		ID: 17, Name: "首页精选型", Pages: []string{PageHome},
		Note: "仅首页: 站名+每日更新门户句式",
		T:    "{站名}_每日更新热门小说免费在线阅读",
		D:    "{站名}每日更新海量热门小说，覆盖玄幻奇幻、都市生活、现代言情等主流分类，全站免费在线阅读，支持无弹窗清爽界面与全本TXT下载，{年份}年最新章节实时同步，追更看书两不误。",
		K:    "{站名},小说,免费小说,小说在线阅读,TXT下载",
	},
	{
		ID: 18, Name: "首页热词型", Pages: []string{PageHome},
		Note: "仅首页: 随机热词(无弹窗/完整版…)进标题",
		T:    "看小说就上{站名}_全本{热词}小说站",
		D:    "选择{站名}的三大理由：全站小说免费畅读、正文无弹窗干扰、{年份}年书库持续扩充。玄幻、言情、都市、悬疑等热门分类一应俱全，海量完本一键收藏，多设备接续阅读进度，好书读到停不下来。",
		K:    "{站名},小说阅读网,免费小说,{热词},完本小说,小说大全",
	},
}

// tdkPresetByID 套编号 → 预设(未命中 nil)。
func tdkPresetByID(id int) *tdkPreset {
	if id < 1 || id > len(tdkPresets) {
		return nil
	}
	return &tdkPresets[id-1]
}

// TDKPresetMeta 18 套预设的对外元信息(admin UI 勾选/示例预览, 单一事实源免 JS 复制)。
type TDKPresetMeta struct {
	ID       int      `json:"id"`
	Name     string   `json:"name"`
	Note     string   `json:"note"`
	Pages    []string `json:"pages"`
	ExampleT string   `json:"exampleTitle"`
	ExampleD string   `json:"exampleDesc"`
	ExampleK string   `json:"exampleKw"`
}

// TDKPresets 18 套预设元信息列表(示例用演示上下文渲染, 供 admin UI 展示)。
func TDKPresets() []TDKPresetMeta {
	demo := TDKCtx{
		SiteName: "示例书站", BookName: "示例书名", Author: "示例作者",
		Category: "玄幻奇幻", Status: "连载中", Words: 1_050_000, Year: time.Now().Format("2006"),
	}
	out := make([]TDKPresetMeta, 0, len(tdkPresets))
	for i := range tdkPresets {
		p := &tdkPresets[i]
		pages := append([]string(nil), p.Pages...)
		out = append(out, TDKPresetMeta{
			ID: p.ID, Name: p.Name, Note: p.Note, Pages: pages,
			ExampleT: renderTdkTpl(p.T, demo),
			ExampleD: renderTdkTpl(p.D, demo),
			ExampleK: renderTdkKw(p.K, demo),
		})
	}
	return out
}

// ---------------- 引擎入口 ----------------

// BuildTDK 智能 TDK 主入口: 从「站点启用套 ∩ 支持当前页类型」随机选一套渲染。
// 返回空串三元组 = 本轮无可用套/渲染失败, 调用方必须回落原 TDK 逻辑。
func BuildTDK(cfg TDKSiteCfg, ctx TDKCtx, pageType string) (title, description, keywords string) {
	if !cfg.Enabled || cfg.PageMode(pageType) != PageModeSmart {
		return "", "", ""
	}
	cands := make([]*tdkPreset, 0, len(cfg.Sets))
	for _, id := range cfg.Sets {
		p := tdkPresetByID(id)
		if p == nil {
			continue
		}
		for _, pt := range p.Pages {
			if pt == pageType {
				cands = append(cands, p)
				break
			}
		}
	}
	if len(cands) == 0 {
		return "", "", ""
	}
	p := cands[tdkRandInt(len(cands))]
	// 站点级模板覆盖(可选): 勾选套命中覆盖表则用站点模板
	tplT, tplD, tplK := p.T, p.D, p.K
	if ov, ok := cfg.Templates[intToString(p.ID)]; ok {
		tplT, tplD, tplK = ov.Title, ov.Description, ov.Keywords
	}
	title = renderTdkTpl(tplT, ctx)
	description = renderTdkTpl(tplD, ctx)
	keywords = renderTdkKw(tplK, ctx)
	// [R66-c] 产出长度钳制(对齐 web/seo.go composeXxxTdk 站内口径: title≤40/desc≤160
	// 码点, keywords 已在 renderTdkKw 钳 200)。修前书名/作者/分类等爬虫可控数据
	// (书名可达 200 字节)经占位符直出无界 <title>/<meta description> —— 智能 TDK
	// 开启即重现 R64-c 修掉的「超长查询串直出无界 TDK」病灶; 站点级覆盖模板
	// (ParseSiteCfg 允许 500 码点)同受此钳保护。
	title = clampRunes(title, tdkTitleMaxCodePoints)
	description = clampRunes(description, tdkDescMaxCodePoints)
	if strings.TrimSpace(title) == "" || strings.TrimSpace(description) == "" {
		return "", "", "" // 渲染失败(如关键占位符全空) → 调用方回落原逻辑
	}
	return title, description, keywords
}

// TDK 产出码点上限(与 web 层 composeBookTdk/composeTocTdk/composeChapterTdk 同口径)。
const (
	tdkTitleMaxCodePoints = 40
	tdkDescMaxCodePoints  = 160
)

// tdkRandInt crypto/rand 均匀取 [0,n); n<=0 或异常回落 0。
func tdkRandInt(n int) int {
	if n <= 1 {
		return 0
	}
	k, err := crand.Int(crand.Reader, big.NewInt(int64(n)))
	if err != nil {
		return 0
	}
	return int(k.Int64())
}

func intToString(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [4]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

// ---------------- 模板渲染 ----------------

// renderTdkTpl 模板渲染: 可裁段(〔…〕) → 占位符替换 → 清洗(去残留/空括号/重复标点/悬挂标点)。
func renderTdkTpl(tpl string, ctx TDKCtx) string {
	vals := tdkVals(ctx)
	out := tdkGroupRe.ReplaceAllStringFunc(tpl, func(g string) string {
		inner := g[len("〔") : len(g)-len("〕")]
		for _, m := range tdkPhRe.FindAllStringSubmatch(inner, -1) {
			if vals[m[1]] == "" {
				return "" // 段内任一占位符未命中 → 整段裁掉(不出现空括号/悬挂标点)
			}
		}
		return tdkSubst(inner, vals)
	})
	return tdkCleanup(tdkSubst(out, vals))
}

// renderTdkKw keywords 渲染: 同管道 + 逗号拆分去重去空 + 钳 200 码点(对齐站内 joinKeywords 口径)。
func renderTdkKw(tpl string, ctx TDKCtx) string {
	out := renderTdkTpl(tpl, ctx)
	seen := map[string]bool{}
	var parts []string
	for _, p := range strings.FieldsFunc(out, func(r rune) bool { return r == ',' || r == '，' }) {
		p = strings.TrimSpace(p)
		if p == "" || seen[p] {
			continue
		}
		seen[p] = true
		parts = append(parts, p)
	}
	return clampRunes(strings.Join(parts, ","), 200)
}

// tdkVals 占位符 → 值表(键=模板中的中文名; 空值=未命中)。
func tdkVals(ctx TDKCtx) map[string]string {
	year := strings.TrimSpace(ctx.Year)
	if year == "" {
		year = time.Now().Format("2006")
	}
	// [R66-c] 空作者回落「佚名」(对齐 adminBooksCreate 手动入库缺省): 11 套书族
	// 模板含「{作者}创作的/{作者}笔下」句式, 修前空作者直出「是创作的小说」空洞
	// 语法(SEO 降质面); 站名生产面恒非空(web.siteTitle 兜底), 分类空值在各模板
	// 中自然成句(「{分类}小说」→「小说」)无需回落。
	author := strings.TrimSpace(ctx.Author)
	if author == "" {
		author = "佚名"
	}
	hot := ""
	if n := len(tdkHotWords); n > 0 {
		hot = tdkHotWords[tdkRandInt(n)]
	}
	return map[string]string{
		"站名":  strings.TrimSpace(ctx.SiteName),
		"书名":  strings.TrimSpace(ctx.BookName),
		"作者":  author,
		"分类":  strings.TrimSpace(ctx.Category),
		"状态":  strings.TrimSpace(ctx.Status),
		"字数段": WordBand(ctx.Words),
		"热词":  hot,
		"年份":  year,
	}
}

// tdkSubst {占位符} 替换(未知键/未命中 → 空串, 保证零残留)。
func tdkSubst(s string, vals map[string]string) string {
	return tdkPhRe.ReplaceAllStringFunc(s, func(m string) string {
		if v, ok := vals[m[1:len(m)-1]]; ok {
			return v
		}
		return ""
	})
}

var (
	// tdkGroupRe 可裁段: 〔…〕(不嵌套; 段内不得再含〔〕)。
	tdkGroupRe = regexp.MustCompile("〔([^〔〕]*)〕")
	// tdkPhRe 占位符: {键}(键不含花括号/方头括号)。
	tdkPhRe = regexp.MustCompile(`\{([^{}〔〕]+)\}`)
)

// tdkCleanup 产出清洗(空括号对回收 → 重复标点坍缩 → 空白规整 → 首尾悬挂标点裁除)。
func tdkCleanup(s string) string {
	// 1) 空括号对回收(占位符在书名号/括号内被清空后的残留壳)
	for _, pair := range []string{"《》", "（）", "()", "「」", "『』", "【】", "〔〕", "[]"} {
		s = strings.ReplaceAll(s, pair, "")
	}
	// 2) 分隔符连写坍缩("_{2,}"→"_" 等, 模板 "a_{x}_{y}" 中段被清空时防 "__")
	s = tdkSepRunRe.ReplaceAllString(s, "$1")
	// 3) 重复句读标点坍缩(留首个: "。，"→"。", "!!"→"!")
	s = tdkPunctRunRe.ReplaceAllString(s, "$1")
	// 4) 连续空白规整
	s = tdkSpaceRe.ReplaceAllString(s, " ")
	// 5) 首尾悬挂分隔符裁除(句末号保留 —— 描述自然句尾)
	s = tdkLeadTrimRe.ReplaceAllString(s, "")
	s = tdkTrailTrimRe.ReplaceAllString(s, "")
	return strings.TrimSpace(s)
}

var (
	// 分隔符连写(_-| 与空格混排)
	tdkSepRunRe = regexp.MustCompile(`[_|\-]{2,}`)
	// 句读标点连写(含中英全半角; 不含 _-| 防误伤连字符词)
	tdkPunctRunRe = regexp.MustCompile(`([，。、！？；：,.;:|·～~…])[，。、！？；：,.;:|·~～…\s]+`)
	// 空白规整
	tdkSpaceRe = regexp.MustCompile(`\s{2,}`)
	// 首部悬挂: 分隔符/句读一律不留
	tdkLeadTrimRe = regexp.MustCompile(`^[\s\-_|·~～…，。、！？；：,.;:]+`)
	// 尾部悬挂: 保句末号(。！?), 裁分隔符/逗号类
	tdkTrailTrimRe = regexp.MustCompile(`[\s\-_|·~～…，、；：,;:]+$`)
)

// clampRunes 码点安全截断。
func clampRunes(s string, max int) string {
	if max <= 0 {
		return s
	}
	rs := []rune(s)
	if len(rs) <= max {
		return s
	}
	return string(rs[:max])
}
