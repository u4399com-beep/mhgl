// ============================================================
// [R75-c] 主库快照端点回归: POST /api/admin/backup/snapshot
// 落盘 gzip → 可解 → sqlite 可开 → 数据在; 保留策略经 env 生效;
// 路由挂载且受 admin 鉴权保护。
// ============================================================
package api

import (
	"compress/gzip"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mhgl/internal/auth"
	"mhgl/internal/store"
)

func TestR75c_AdminBackupSnapshotEndpoint(t *testing.T) {
	bdir := t.TempDir()
	t.Setenv("BACKUP_DIR", bdir)
	t.Setenv("BACKUP_INTERVAL_HOURS", "0") // 端点手动路径与自动托管解耦
	t.Setenv("BACKUP_KEEP", "2")           // Manager 构造时读定(保留策略断言)

	db := newTestDB(t)
	now := store.NowMS()
	if _, err := db.Exec(`INSERT INTO "Book" (id,num,name,author,createdAt,updatedAt) VALUES ('bk1',1,'快照书','作',?,?)`, now, now); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,content,fetched,createdAt,updatedAt) VALUES ('ch1','bk1',1,'章一','正文',1,?,?)`, now, now); err != nil {
		t.Fatal(err)
	}

	d := Deps{DB: db, Auth: auth.NewService("pw", "s", false)}
	snap := func() map[string]any {
		t.Helper()
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/api/admin/backup/snapshot", nil)
		d.adminBackupSnapshot(rec, req)
		if rec.Code != 200 {
			t.Fatalf("snapshot status=%d body=%s", rec.Code, rec.Body.String())
		}
		var top map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &top); err != nil {
			t.Fatal(err)
		}
		m, _ := top["data"].(map[string]any)
		if m == nil {
			t.Fatalf("no data node: %v", top)
		}
		return m
	}

	res := snap()
	file, _ := res["file"].(string)
	if file == "" || res["ok"] != true {
		t.Fatalf("bad response: %v", res)
	}
	if _, err := os.Stat(file); err != nil {
		t.Fatalf("snapshot file missing: %v", err)
	}
	// gzip → 解压 → sqlite ro 打开 → 数据在
	f, err := os.Open(file)
	if err != nil {
		t.Fatal(err)
	}
	zr, err := gzip.NewReader(f)
	if err != nil {
		t.Fatalf("gzip: %v", err)
	}
	restored := filepath.Join(t.TempDir(), "r.db")
	out, err := os.Create(restored)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.Copy(out, zr); err != nil {
		t.Fatalf("gzip stream: %v", err)
	}
	_ = out.Close()
	_ = zr.Close()
	_ = f.Close()
	ro, err := sql.Open("sqlite", "file:"+restored+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer ro.Close()
	var nb, nc int
	if err := ro.QueryRow(`SELECT count(*) FROM "Book"`).Scan(&nb); err != nil || nb != 1 {
		t.Fatalf("restored books=%d err=%v", nb, err)
	}
	if err := ro.QueryRow(`SELECT count(*) FROM "Chapter"`).Scan(&nc); err != nil || nc != 1 {
		t.Fatalf("restored chapters=%d err=%v", nc, err)
	}
	// 状态回显
	if st, ok := res["status"].(map[string]any); !ok || st["lastFile"] == "" {
		t.Fatalf("status echo missing: %v", res["status"])
	}

	// 保留策略: BACKUP_KEEP=2(Manager 构造时读定) → 三次快照恰留两份
	snap()
	snap()
	ents, err := os.ReadDir(bdir)
	if err != nil {
		t.Fatal(err)
	}
	var kept int
	for _, e := range ents {
		name := e.Name()
		if strings.HasPrefix(name, "db-") && (strings.HasSuffix(name, ".gz") || strings.Contains(name, ".db.gz.")) {
			kept++ // 基础形态与同秒碰撞 .N 尾缀形态均计入
		}
	}
	if kept != 2 {
		t.Fatalf("BACKUP_KEEP=2 but %d snapshots on disk", kept)
	}
}

func TestR75c_RegisterMountsSnapshot(t *testing.T) {
	// 路由注册面: POST /api/admin/backup/snapshot 已挂载且受 admin 鉴权保护
	t.Setenv("BACKUP_DIR", t.TempDir())
	d := Deps{DB: newTestDB(t), Auth: auth.NewService("pw", "s", false)}
	mux := http.NewServeMux()
	Register(mux, d)
	req := httptest.NewRequest("POST", "/api/admin/backup/snapshot", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 401 {
		t.Errorf("snapshot without session must 401, got %d", rec.Code)
	}
}
