// ============================================================
// 主题注册表(单一来源) — [R67-c] R66-c 审查发现④落地
//
//	修前: api 层 validThemeIDs(合法性)与 themeCatalog(展示清单)两处 11 主题
//	硬编码需与 tpl/themes 目录手工同步(加主题要三处同改, 漏改即站点存入非法
//	主题 ID / 后台清单缺新主题)。
//	收敛: id 清单动态读 embed FS tpl/themes/ 目录(与 themeAvailable 同源),
//	名称/描述按 themeMeta 登记表查; 新增主题 = 加模板目录 + 本表登记一行
//	(漏登记不失效 —— 后台清单回落通用描述, 站点 themeId 写入照常放行)。
//	api 层(admin_taxonomy.validTheme / admin_content.adminThemesList)经
//	导出函数读本注册表, 不再自持清单。
//
// ============================================================
package web

import (
	"io/fs"
	"sort"
)

// ThemeInfo 主题展示元信息。
type ThemeInfo struct {
	ID   string
	Name string
	Desc string
}

// themeMeta 主题名称/描述登记表(与 tpl/themes/{id}/ 目录一一对应)。
var themeMeta = map[string]ThemeInfo{
	"aijjxs":     {ID: "aijjxs", Name: "久久小说(克隆)", Desc: "久久小说布局克隆(默认主题)"},
	"pili":       {ID: "pili", Name: "霹雳书屋(克隆)", Desc: "霹雳书屋布局克隆"},
	"kks101":     {ID: "kks101", Name: "101看書(克隆)", Desc: "101看書布局克隆"},
	"qb23":       {ID: "qb23", Name: "铅笔小说(克隆)", Desc: "铅笔小说布局克隆"},
	"ddyueshu":   {ID: "ddyueshu", Name: "顶点小说(克隆)", Desc: "顶点小说布局克隆"},
	"x2552":      {ID: "x2552", Name: "吾爱文学(克隆)", Desc: "吾爱文学布局克隆"},
	"huangjinwu": {ID: "huangjinwu", Name: "黄金屋(克隆)", Desc: "黄金屋布局克隆"},
	"ggd66":      {ID: "ggd66", Name: "格格党(克隆)", Desc: "格格党布局克隆"},
	"shipsay":    {ID: "shipsay", Name: "船说CMS(克隆)", Desc: "船说CMS布局克隆"},
	"trxsw":      {ID: "trxsw", Name: "唐人小说(克隆)", Desc: "唐人小说布局克隆"},
	"x33yq":      {ID: "x33yq", Name: "33言情(克隆)", Desc: "33言情布局克隆"},
}

// ThemeIDs 可用主题 id 清单(embed FS tpl/themes/ 目录动态清单; 字母序, 过滤非法目录名)。
func ThemeIDs() []string {
	ents, err := fs.ReadDir(tplFS, "tpl/themes")
	if err != nil {
		return []string{defaultTheme}
	}
	ids := make([]string, 0, len(ents))
	for _, e := range ents {
		if !e.IsDir() || !themeRe.MatchString(e.Name()) {
			continue
		}
		ids = append(ids, e.Name())
	}
	sort.Strings(ids)
	return ids
}

// ThemeValid id 是否为可用主题(模板目录存在; 与 normalizeTheme 同一判定源)。
func ThemeValid(id string) bool {
	return themeAvailable(id)
}

// ThemeCatalog 主题展示清单(缺省主题置首, 其余字母序; 未登记 id 回落通用描述)。
func ThemeCatalog() []ThemeInfo {
	ids := ThemeIDs()
	have := make(map[string]bool, len(ids))
	for _, id := range ids {
		have[id] = true
	}
	ordered := make([]string, 0, len(ids)+1)
	if have[defaultTheme] {
		ordered = append(ordered, defaultTheme)
	}
	for _, id := range ids {
		if id != defaultTheme {
			ordered = append(ordered, id)
		}
	}
	out := make([]ThemeInfo, 0, len(ordered))
	for _, id := range ordered {
		info, ok := themeMeta[id]
		if !ok {
			info = ThemeInfo{ID: id, Name: id, Desc: "(未登记主题)"}
		}
		out = append(out, info)
	}
	return out
}
