// ============================================================
// R60-2b — Feedback store 层回归
//
//	① ensureFeedbackTable: 最小测试库(无 Feedback 表)经 Open 自举, 幂等(二次 Open 不炸)
//	② CRUD: Insert(status='new'/空串→NULL)/List(筛选+分页+统计)/Get/Update
//	  (MarkProcessed→resolved+备注; 空备注清 NULL)/Delete/CountByIPSince(限频)
//
// ============================================================
package store

import (
	"testing"
	"time"
)

func TestFeedbackEnsureTableBootstrap(t *testing.T) {
	// testSchema 不含 Feedback → store.Open 走 ensureFeedbackTable 自举
	db := testStore(t)
	if n, err := db.Count(`SELECT count(*) FROM "Feedback"`); err != nil || n != 0 {
		t.Fatalf("ensure bootstrap failed: n=%d err=%v", n, err)
	}
	// 幂等: 索引在位(IF NOT EXISTS 命中既有名)
	for _, idx := range []string{"Feedback_status_createdAt_idx", "Feedback_type_idx", "Feedback_ip_createdAt_idx"} {
		var n int
		if err := db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='index' AND name=?`, idx).Scan(&n); err != nil || n != 1 {
			t.Fatalf("index %s missing: n=%d err=%v", idx, n, err)
		}
	}
	// 二次 Open(同一文件)不炸
	if err := db.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	db2, err := Open(db.path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer db2.Close()
}

func TestFeedbackCRUDRoundtrip(t *testing.T) {
	db := testStore(t)

	id1, err := db.FeedbackInsert(FeedbackInput{Type: "bug", Contact: "a@b.c", Content: "第一章打不开", URL: "https://x/read/1", IP: "1.2.3.4", UserAgent: "UA"})
	if err != nil || id1 == "" {
		t.Fatalf("insert1: id=%q err=%v", id1, err)
	}
	time.Sleep(2 * time.Millisecond) // createdAt 毫秒精度: 错开保证 ORDER BY createdAt DESC 可断言
	id2, err := db.FeedbackInsert(FeedbackInput{Type: "suggestion", Content: "希望加夜间模式", IP: "1.2.3.4"})
	if err != nil {
		t.Fatalf("insert2: %v", err)
	}
	time.Sleep(2 * time.Millisecond)
	id3, err := db.FeedbackInsert(FeedbackInput{Type: "praise", Content: "站点不错", IP: "5.6.7.8"})
	if err != nil {
		t.Fatalf("insert3: %v", err)
	}

	// Get: 空串字段 → NULL(既有 nilIfEmpty 契约)
	row, ok, err := db.FeedbackGet(id2)
	if err != nil || !ok {
		t.Fatalf("get2: ok=%v err=%v", ok, err)
	}
	if row["status"] != "new" || row["contact"] != nil || row["url"] != nil {
		t.Fatalf("get2 fields: %v", row)
	}

	// List: 全量 + 统计
	rows, total, stats, err := db.FeedbackList(FeedbackListOpts{Page: 1, Size: 2})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 3 || len(rows) != 2 || stats["total"] != 3 || stats["new"] != 3 {
		t.Fatalf("list total=%d rows=%d stats=%v", total, len(rows), stats)
	}
	// createdAt DESC → 最近插入的 id2 在前
	if rows[0]["id"] != id3 || rows[1]["id"] != id2 {
		t.Fatalf("list order wrong: %v %v", rows[0]["id"], rows[1]["id"])
	}
	// 筛选: status=resolved(先标一条)
	if err := db.FeedbackMarkProcessed(id3, "已回复"); err != nil {
		t.Fatalf("mark processed: %v", err)
	}
	rows, total, stats, err = db.FeedbackList(FeedbackListOpts{Status: "resolved", Page: 1, Size: 20})
	if err != nil || total != 1 || stats["resolved"] != 1 || stats["new"] != 2 {
		t.Fatalf("filter resolved: total=%d stats=%v err=%v", total, stats, err)
	}
	got, _, _ := db.FeedbackGet(id3)
	if got["status"] != "resolved" || got["adminNote"] != "已回复" {
		t.Fatalf("mark processed fields: %v", got)
	}
	// Type 筛选 + q LIKE
	if _, total, _, _ := db.FeedbackList(FeedbackListOpts{Type: "bug", Page: 1, Size: 20}); total != 1 {
		t.Fatalf("type filter total=%d want 1", total)
	}
	if _, total, _, _ := db.FeedbackList(FeedbackListOpts{Q: "夜间", Page: 1, Size: 20}); total != 1 {
		t.Fatalf("q filter total=%d want 1", total)
	}

	// Update: 空串 adminNote → NULL
	empty := ""
	if err := db.FeedbackUpdate(id3, nil, &empty); err != nil {
		t.Fatalf("update: %v", err)
	}
	got, _, _ = db.FeedbackGet(id3)
	if got["adminNote"] != nil {
		t.Fatalf("empty note must be NULL, got %v", got["adminNote"])
	}

	// CountByIPSince(限频窗口)
	if n, _ := db.FeedbackCountByIPSince("1.2.3.4", time.Now().Add(-time.Hour).UnixMilli()); n != 2 {
		t.Fatalf("ip count=%d want 2", n)
	}

	// Delete
	if err := db.FeedbackDelete(id1); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if ok, _ := db.FeedbackExists(id1); ok {
		t.Fatalf("deleted row still exists")
	}
}
