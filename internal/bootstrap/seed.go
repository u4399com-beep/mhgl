// ============================================================
// [R69-a] Go 原生运行态引导 — 彻底替代 scripts/bootstrap-db.ts
//
// 语义与 TS 原件(通过管理 API)完全对齐, 改为直连 store(无需服务在线/
// 无需管理员密码, 单二进制即可执行):
//  1. 内置规则全量导入(按 name 幂等 upsert, 保留既有 ruleId —— 与
//     POST /api/admin/rules/import-builtin 同源同口径);
//  2. 分类幂等固化(15 主分类 4 字名 + FallbackCategory, 序即 sortOrder;
//     名单与 internal/crawl/smart 词表单向对齐, 由 bootstrap_test 断言);
//  3. Site 表为空时创建默认站点(localhost:3000 / aijjxs 主题);
//  4. 按 name 幂等创建三大部头任务(全部 engine=go, R53 档案参数)。
//
// 幂等: 重复执行安全。启动方式: `mhgl bootstrap`(子命令)或服务空库自动引导。
// ============================================================
package bootstrap

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"

	"mhgl/internal/api"
	"mhgl/internal/crawl/smart"
	"mhgl/internal/store"
)

// SeedReport 引导结果(供 CLI 打印与调用方记录)。
type SeedReport struct {
	RulesCreated      int
	RulesUpdated      int
	RuleErrors        []string
	CategoriesCreated int
	SiteCreated       bool
	TasksCreated      []string
}

// majorTaskDef 三大部头任务参数(与 TS 原件 MAJOR_TASKS 逐字对齐; R53 档案)。
//   - xbqg777 内容页有 CF 挑战(R53 事故链A), 固化降速参数 1 线程 1.5~4s 间隔。
type majorTaskDef struct {
	name        string
	ruleMatch   string
	mode        string // bookIds | range
	bookURL     string
	bookIDs     string
	listURL     string
	listStart   int
	listEnd     int
	threadMin   int
	threadMax   int
	intervalMin int
	intervalMax int
	note        string
}

var majorTasks = []majorTaskDef{
	{
		name: "神马小说·大部头批量(yueyouxs)", ruleMatch: "yueyouxs", mode: "bookIds",
		bookURL: "https://sma.yueyouxs.com/b/{bookId}.html", bookIDs: "23070\n23069",
		threadMin: 3, threadMax: 8, intervalMin: 500, intervalMax: 2000,
		note: "R52-a 实测无反爬",
	},
	{
		name: "仙侠天恋·分类批量(xyetianlian)", ruleMatch: "xyetianlian", mode: "range",
		listURL: "http://www.xyetianlian.com/fenlei/1/{page}.html", listStart: 1, listEnd: 1,
		threadMin: 3, threadMax: 8, intervalMin: 500, intervalMax: 2000,
		note: "R52-a 实测无反爬; 杰奇WAP http 站",
	},
	{
		name: "新笔趣阁·大部头批量(xbqg777)", ruleMatch: "xbqg777", mode: "bookIds",
		bookURL: "https://www.xbqg777.com/{bookId}", bookIDs: "34807\n34808",
		threadMin: 1, threadMax: 1, intervalMin: 1500, intervalMax: 4000,
		note: "内容页 CF 挑战(R53 事故链A), 固化降速参数",
	},
}

// seedCategories 16 分类固化名单(15 主分类 4 字 + 兜底; 行序即 sortOrder)。
// bootstrap_test 断言前 15 项与 smart.CanonicalCategoryNames() 逐字一致。
var seedCategories = []string{
	"玄幻奇幻", "西方奇幻", "武侠江湖", "仙侠修真", "都市生活",
	"现代言情", "历史演义", "军事战争", "游戏竞技", "科幻未来",
	"悬疑灵异", "体育竞技", "耽美纯爱", "同人衍生", "现实百态",
	smart.FallbackCategory,
}

// Seed 幂等引导运行态数据(规则/分类/默认站点/三大部头任务)。
// 调用方需保证 schema 已存在(EnsureSchema / store.Open 自检之后)。
func Seed(db *store.DB) (SeedReport, error) {
	var rep SeedReport

	// ---- 1. 内置规则全量导入(按 name 幂等 upsert, 保留既有 ruleId) ----
	now := store.NowMS()
	for _, br := range api.BuiltinRules() {
		name := truncate(br.Name, 100)
		enabled := int64(1)
		if !br.Enabled {
			enabled = 0
		}
		var id string
		err := db.QueryRow(`SELECT id FROM "Rule" WHERE name=?`, name).Scan(&id)
		switch {
		case err == nil:
			if _, uerr := db.Exec(`UPDATE "Rule" SET description=?, config=?, enabled=?, updatedAt=? WHERE id=?`,
				truncate(br.Description, 500), br.Config, enabled, now, id); uerr != nil {
				rep.RuleErrors = append(rep.RuleErrors, fmt.Sprintf("%s: update: %v", br.Key, uerr))
				continue
			}
			rep.RulesUpdated++
		case isNoRows(err):
			if _, ierr := db.Exec(`INSERT INTO "Rule" (id,name,description,config,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)`,
				db.NewID(), name, truncate(br.Description, 500), br.Config, enabled, now, now); ierr != nil {
				rep.RuleErrors = append(rep.RuleErrors, fmt.Sprintf("%s: insert: %v", br.Key, ierr))
				continue
			}
			rep.RulesCreated++
		default:
			rep.RuleErrors = append(rep.RuleErrors, fmt.Sprintf("%s: query: %v", br.Key, err))
		}
	}

	// ---- 2. 分类幂等固化(15 主分类 4 字名 + FallbackCategory) ----
	for i, name := range seedCategories {
		var id string
		err := db.QueryRow(`SELECT id FROM "Category" WHERE name=?`, name).Scan(&id)
		if err == nil {
			continue
		}
		if !isNoRows(err) {
			return rep, fmt.Errorf("bootstrap: category %s: %w", name, err)
		}
		if _, ierr := db.Exec(`INSERT INTO "Category" (id,name,sortOrder,createdAt) VALUES (?,?,?,?)`,
			db.NewID(), name, i, now); ierr != nil {
			return rep, fmt.Errorf("bootstrap: category %s insert: %w", name, ierr)
		}
		rep.CategoriesCreated++
	}

	// ---- 3. 默认站点(仅 Site 表为空时) ----
	var siteN int
	if err := db.QueryRow(`SELECT count(*) FROM "Site"`).Scan(&siteN); err != nil {
		return rep, fmt.Errorf("bootstrap: site count: %w", err)
	}
	if siteN == 0 {
		if _, ierr := db.Exec(`INSERT INTO "Site" (id,name,domain,themeId,isDefault,status,inLinkWheel,createdAt,updatedAt)
                        VALUES (?,?,?,?,1,1,1,?,?)`,
			db.NewID(), "小说聚合站", "localhost:3000", "aijjxs", now, now); ierr != nil {
			return rep, fmt.Errorf("bootstrap: site insert: %w", ierr)
		}
		rep.SiteCreated = true
	}

	// ---- 4. 三大部头任务(按 name 幂等; ruleId 按 name 包含匹配) ----
	for _, def := range majorTasks {
		var taskN int
		if err := db.QueryRow(`SELECT count(*) FROM "Task" WHERE name=?`, def.name).Scan(&taskN); err != nil {
			return rep, fmt.Errorf("bootstrap: task %s: %w", def.name, err)
		}
		if taskN > 0 {
			continue
		}
		ruleID, err := findRuleID(db, def.ruleMatch)
		if err != nil {
			return rep, err
		}
		if ruleID == "" {
			return rep, fmt.Errorf("bootstrap: task %s: 规则 %q 不存在(规则导入失败?)", def.name, def.ruleMatch)
		}
		var ierr error
		if def.mode == "bookIds" {
			_, ierr = db.Exec(`INSERT INTO "Task"
                                (id,name,ruleId,mode,bookUrl,bookIds,engine,recrawlMode,storageMode,
                                 threadMin,threadMax,intervalMin,intervalMax,status,progress,stats,createdAt,updatedAt)
                                VALUES (?,?,?,?,?,?, 'go','incremental','db', ?,?,?,?, 'pending','{}','{}',?,?)`,
				db.NewID(), def.name, ruleID, def.mode, def.bookURL, def.bookIDs,
				def.threadMin, def.threadMax, def.intervalMin, def.intervalMax, now, now)
		} else {
			_, ierr = db.Exec(`INSERT INTO "Task"
                                (id,name,ruleId,mode,listUrl,listStart,listEnd,engine,recrawlMode,storageMode,
                                 threadMin,threadMax,intervalMin,intervalMax,status,progress,stats,createdAt,updatedAt)
                                VALUES (?,?,?,?,?,?,?, 'go','incremental','db', ?,?,?,?, 'pending','{}','{}',?,?)`,
				db.NewID(), def.name, ruleID, def.mode, def.listURL, def.listStart, def.listEnd,
				def.threadMin, def.threadMax, def.intervalMin, def.intervalMax, now, now)
		}
		if ierr != nil {
			return rep, fmt.Errorf("bootstrap: task %s insert: %w", def.name, ierr)
		}
		rep.TasksCreated = append(rep.TasksCreated, def.name)
		log.Printf("[bootstrap] task created: %s (%s)", def.name, def.note)
	}
	return rep, nil
}

// findRuleID 按 name 小写包含匹配找规则(与 TS 原件 ruleList.find(r.name.toLowerCase()
// .includes(ruleMatch)) 同口径; 多命中取首个, 与 TS find 语义一致)。
func findRuleID(db *store.DB, match string) (string, error) {
	rows, err := db.Query(`SELECT id, name FROM "Rule"`)
	if err != nil {
		return "", fmt.Errorf("bootstrap: list rules: %w", err)
	}
	defer rows.Close()
	want := strings.ToLower(match)
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return "", err
		}
		if strings.Contains(strings.ToLower(name), want) {
			return id, nil
		}
	}
	return "", rows.Err()
}

// IsEmpty 判断是否为「空运行态」(规则 0 条)—— 服务启动时空库自动引导的触发口径。
// 规则是采集与站点内容的根基, 规则数为 0 即视为全新部署/沙箱重置后的空库。
func IsEmpty(db *store.DB) (bool, error) {
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM "Rule"`).Scan(&n); err != nil {
		return false, err
	}
	return n == 0, nil
}

func isNoRows(err error) bool { return errors.Is(err, sql.ErrNoRows) }

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
