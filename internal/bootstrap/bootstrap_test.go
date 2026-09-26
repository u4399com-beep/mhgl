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
