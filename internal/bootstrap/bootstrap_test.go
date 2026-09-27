// ============================================================
// [R69-a] Go 原生建库/引导 测试
//   - EnsureSchema: 全新空库获得完整 14 表 schema; FK 级联真删; 幂等重跑。
//   - Seed: 规则导入数=内置库条数 / 16 分类与 smart 词表逐字同步 / 默认站点 /
//     三大部头任务建链; 二次执行幂等(零新增)。
//   - 与 TS 原件(bootstrap-db.ts)对齐口径回归。
//
// ============================================================
package bootstrap

import (
	"path/filepath"
	"sync"
	"testing"

	"mhgl/internal/api"
	"mhgl/internal/crawl/smart"
	"mhgl/internal/store"
)

func openFresh(t *testing.T) (*store.DB, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	if err := EnsureSchema(path); err != nil {
		t.Fatalf("EnsureSchema: %v", err)
	}
	db, err := store.Open(path)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, path
}

func TestEnsureSchemaFresh(t *testing.T) {
	db, path := openFresh(t)
	want := []string{"Category", "Rule", "Book", "Chapter", "BookTag", "Task", "TaskLog",
		"Site", "DownloadJob", "Setting", "FreeProxy", "PseoPage", "FriendLink", "Feedback"}
	for _, tbl := range want {
		var n int
		if err := db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?`, tbl).Scan(&n); err != nil || n != 1 {
			t.Fatalf("table %s missing (err=%v n=%d)", tbl, err, n)
		}
	}
	// 幂等重跑: 空转不报错
	if err := EnsureSchema(path); err != nil {
		t.Fatalf("EnsureSchema rerun: %v", err)
	}
}

func TestEnsureSchemaFKCascade(t *testing.T) {
	db, _ := openFresh(t)
	now := store.NowMS()
	if _, err := db.Exec(`INSERT INTO "Category" (id,name,sortOrder,createdAt) VALUES ('c1','测试分类',0,?)`, now); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "Book" (id,name,categoryId,createdAt,updatedAt) VALUES ('b1','测试书','c1',?,?)`, now, now); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,createdAt,updatedAt) VALUES ('ch1','b1',1,'第一章',?,?)`, now, now); err != nil {
		t.Fatal(err)
	}
	// 级联: 删书 → 章节连带消失
	if _, err := db.Exec(`DELETE FROM "Book" WHERE id='b1'`); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM "Chapter" WHERE bookId='b1'`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("FK cascade failed: chapters=%d err=%v", n, err)
	}
}

func TestSeedIdempotent(t *testing.T) {
	db, _ := openFresh(t)

	builtinN := len(api.BuiltinRules())
	if builtinN == 0 {
		t.Fatal("内置规则库为空 — embed 断裂?")
	}

	rep1, err := Seed(db)
	if err != nil {
		t.Fatalf("Seed#1: %v", err)
	}
	if rep1.RulesCreated != builtinN {
		t.Fatalf("Seed#1 rules created=%d, want %d", rep1.RulesCreated, builtinN)
	}
	if rep1.CategoriesCreated != len(seedCategories) {
		t.Fatalf("Seed#1 categories=%d, want %d", rep1.CategoriesCreated, len(seedCategories))
	}
	if !rep1.SiteCreated {
		t.Fatal("Seed#1 default site not created")
	}
	if len(rep1.TasksCreated) != len(majorTasks) {
		t.Fatalf("Seed#1 tasks=%d, want %d (%v)", len(rep1.TasksCreated), len(majorTasks), rep1.TasksCreated)
	}

	rep2, err := Seed(db)
	if err != nil {
		t.Fatalf("Seed#2: %v", err)
	}
	if rep2.RulesCreated != 0 || rep2.RulesUpdated != builtinN {
		t.Fatalf("Seed#2 rules created=%d updated=%d, want 0/%d (幂等 upsert)", rep2.RulesCreated, rep2.RulesUpdated, builtinN)
	}
	if rep2.CategoriesCreated != 0 || rep2.SiteCreated || len(rep2.TasksCreated) != 0 {
		t.Fatalf("Seed#2 not idempotent: %+v", rep2)
	}
}

func TestSeedCategoriesSyncWithSmart(t *testing.T) {
	if len(seedCategories) != 16 {
		t.Fatalf("seedCategories len=%d, want 16(15 主分类+兜底)", len(seedCategories))
	}
	canonical := smart.CanonicalCategoryNames()
	for i, name := range canonical {
		if i >= len(seedCategories) || seedCategories[i] != name {
			t.Fatalf("分类词表失同步 @%d: bootstrap=%q smart=%q — 改任一侧必须同步另一侧", i, seedCategories[i], name)
		}
	}
	if seedCategories[len(seedCategories)-1] != smart.FallbackCategory {
		t.Fatalf("末位应为兜底分类 %q, got %q", smart.FallbackCategory, seedCategories[len(seedCategories)-1])
	}
}

func TestSeedTaskRuleLinkage(t *testing.T) {
	db, _ := openFresh(t)
	if _, err := Seed(db); err != nil {
		t.Fatal(err)
	}
	rows, err := db.QueryMaps(`SELECT t.name AS tname, r.name AS rname, t.engine, t.status
                FROM "Task" t JOIN "Rule" r ON r.id = t.ruleId`)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != len(majorTasks) {
		t.Fatalf("task-rule join rows=%d, want %d", len(rows), len(majorTasks))
	}
	for _, r := range rows {
		if r["engine"] != "go" {
			t.Fatalf("task %s engine=%s, want go", r["tname"], r["engine"])
		}
		if r["status"] != "pending" {
			t.Fatalf("task %s status=%s, want pending(引导不自动开采集)", r["tname"], r["status"])
		}
	}
}

func TestIsEmpty(t *testing.T) {
	db, _ := openFresh(t)
	empty, err := IsEmpty(db)
	if err != nil || !empty {
		t.Fatalf("fresh db IsEmpty=%v err=%v, want true", empty, err)
	}
	if _, err := Seed(db); err != nil {
		t.Fatal(err)
	}
	empty, err = IsEmpty(db)
	if err != nil || empty {
		t.Fatalf("seeded db IsEmpty=%v err=%v, want false", empty, err)
	}
}

// [R75-c] 双进程同时首启播种竞争回归: 两个独立连接池(模拟两个进程)对同一
// 库文件并发 Seed。修前 check-then-insert TOCTOU: 两边都 SELECT 空 → 各自
// INSERT → 规则/分类/任务/站点重复(Rule.name 无 UNIQUE 拦不住); 修后
// BEGIN IMMEDIATE 使后者串行在前者提交后重读, 零重复。
func TestR75c_SeedConcurrentNoDuplicates(t *testing.T) {
	path := filepath.Join(t.TempDir(), "race.db")
	if err := EnsureSchema(path); err != nil {
		t.Fatal(err)
	}
	db1, err := store.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db1.Close() })
	db2, err := store.Open(path) // 第二个池 = 第二个"进程"
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db2.Close() })

	var wg sync.WaitGroup
	errs := make([]error, 2)
	wg.Add(2)
	go func() { defer wg.Done(); _, errs[0] = Seed(db1) }()
	go func() { defer wg.Done(); _, errs[1] = Seed(db2) }()
	wg.Wait()
	for i, e := range errs {
		if e != nil {
			t.Fatalf("Seed#%d: %v", i+1, e)
		}
	}

	// 数量恒等 + 按名零重复(四类种子逐项验)
	want := map[string]int{"Rule": len(api.BuiltinRules()), "Category": len(seedCategories),
		"Task": len(majorTasks), "Site": 1}
	for tbl, n := range want {
		var got int
		if err := db1.QueryRow(`SELECT count(*) FROM "` + tbl + `"`).Scan(&got); err != nil || got != n {
			t.Fatalf("%s count=%d err=%v, want %d", tbl, got, err, n)
		}
		var dup int
		if err := db1.QueryRow(`SELECT count(*) FROM (SELECT name FROM "` + tbl + `" GROUP BY name HAVING count(*)>1)`).Scan(&dup); err != nil {
			t.Fatal(err)
		}
		if dup != 0 {
			t.Fatalf("%s has %d duplicated name(s)", tbl, dup)
		}
	}
	// 第三次(串行)播种仍幂等
	if _, err := Seed(db1); err != nil {
		t.Fatalf("Seed#3: %v", err)
	}
	for tbl, n := range want {
		var got int
		if err := db1.QueryRow(`SELECT count(*) FROM "` + tbl + `"`).Scan(&got); err != nil || got != n {
			t.Fatalf("after reseed %s count=%d err=%v, want %d", tbl, got, err, n)
		}
	}
}
