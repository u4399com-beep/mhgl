// ============================================================
// [R75-c] 主库自动快照回归
//
// 覆盖: 快照往返(gzip 完整性 + gunzip 后 sqlite 可开 + 数据在, 含 WAL 内
// 未 checkpoint 数据)、只读连接 VACUUM INTO 路径、保留策略 keep=K 恰好保留
// 最新 K 份且按名时序、并发触发不撕裂(单 Manager 多协程 + 双 Manager 跨
// "进程")、自动托管生命周期(Open 启循环/Close 停机快照/0=禁用/测试门)、
// 目录解析启发、环境变量解析口径、config 镜像一致性。
// ============================================================
package store

import (
	"compress/gzip"
	"database/sql"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"testing"
	"time"
)

// backupTestDB 建带数据的测试库: 3 书 + 每书 50 章(正文含 blob 页推入 WAL)。
// schemaAtAt 在 path 处落最小 schema(与 testStore 同源; EnsureSchema 属
// internal/bootstrap, 测试内引入会构成 import 环)。
func schemaAt(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	raw, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("raw open: %v", err)
	}
	if _, err := raw.Exec(testSchema); err != nil {
		t.Fatalf("schema: %v", err)
	}
	if err := raw.Close(); err != nil {
		t.Fatalf("raw close: %v", err)
	}
}

func backupTestDB(t *testing.T) (*DB, string) {
	t.Helper()
	db := testStore(t)
	now := NowMS()
	for i := 1; i <= 3; i++ {
		if _, err := db.Exec(`INSERT INTO "Book" (id,num,name,author,createdAt,updatedAt) VALUES (?,?,?,?,?,?)`,
			fmt.Sprintf("cbk%d", i), i, fmt.Sprintf("备份书%d", i), "作者", now, now); err != nil {
			t.Fatalf("seed book: %v", err)
		}
		for c := 1; c <= 50; c++ {
			content := fmt.Sprintf("第%d章正文 %s", c, string(make([]byte, 2048))) // 2KB 页数据
			if _, err := db.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,content,fetched,createdAt,updatedAt)
                                VALUES (?,?,?,?,?,1,?,?)`,
				fmt.Sprintf("cchk%d_%d", i, c), fmt.Sprintf("cbk%d", i), c,
				fmt.Sprintf("章节%d", c), content, now, now); err != nil {
				t.Fatalf("seed chapter: %v", err)
			}
		}
	}
	return db, t.TempDir() // 第二个 TempDir 专作快照目录
}

// gunzipTo 解压到临时文件并返回路径(校验 gzip 流完整性)。
func gunzipTo(t *testing.T, gzPath, dstPath string) {
	t.Helper()
	f, err := os.Open(gzPath)
	if err != nil {
		t.Fatalf("open gz: %v", err)
	}
	defer f.Close()
	zr, err := gzip.NewReader(f)
	if err != nil {
		t.Fatalf("gzip header %s: %v", filepath.Base(gzPath), err)
	}
	defer zr.Close()
	out, err := os.Create(dstPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.Copy(out, zr); err != nil {
		t.Fatalf("gzip stream corrupt %s: %v", filepath.Base(gzPath), err)
	}
	if err := zr.Close(); err != nil { // 尾部校验和
		t.Fatalf("gzip trailer %s: %v", filepath.Base(gzPath), err)
	}
	if err := out.Close(); err != nil {
		t.Fatal(err)
	}
}

// verifyBackupCounts 打开解压后的 db 校验书/章行数与标记行。
func verifyBackupCounts(t *testing.T, dbFile string, books, chapters int, marker string) {
	t.Helper()
	ro, err := sql.Open("sqlite", "file:"+dbFile+"?mode=ro")
	if err != nil {
		t.Fatalf("open snapshot db: %v", err)
	}
	defer ro.Close()
	var nb, nc int
	if err := ro.QueryRow(`SELECT count(*) FROM "Book"`).Scan(&nb); err != nil || nb != books {
		t.Fatalf("snapshot books=%d err=%v want %d", nb, err, books)
	}
	if err := ro.QueryRow(`SELECT count(*) FROM "Chapter"`).Scan(&nc); err != nil || nc != chapters {
		t.Fatalf("snapshot chapters=%d err=%v want %d", nc, err, chapters)
	}
	if marker != "" {
		var n int
		if err := ro.QueryRow(`SELECT count(*) FROM "Chapter" WHERE title=?`, marker).Scan(&n); err != nil || n != 1 {
			t.Fatalf("marker %q rows=%d err=%v (WAL 内未 checkpoint 数据未进快照?)", marker, n, err)
		}
	}
}

func snapshotDirFiles(t *testing.T, dir string) []string {
	t.Helper()
	ents, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read dir: %v", err)
	}
	var names []string
	for _, e := range ents {
		names = append(names, e.Name())
	}
	sort.Sort(sort.Reverse(sort.StringSlice(names)))
	return names
}

// ---- 快照往返: gzip 完整性 + gunzip 后 sqlite 可开 + 数据在(含 WAL 数据) ----

func TestR75c_SnapshotRoundtrip(t *testing.T) {
	db, bdir := backupTestDB(t)
	// 追加一条标记章节: 不做 WAL checkpoint, 验证快照含 WAL 内未合并数据
	if _, err := db.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,content,fetched,createdAt,updatedAt)
                VALUES ('cmark','cbk1',999,'快照标记章','x',1,?,?)`, NowMS(), NowMS()); err != nil {
		t.Fatal(err)
	}

	m := &BackupManager{db: db, dir: bdir, keep: 3}
	res, err := m.Snapshot("manual")
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	if res.SizeBytes <= 0 || res.DurationMS < 0 {
		t.Fatalf("bad result: %+v", res)
	}
	if len(res.Kept) != 1 || res.Kept[0] != filepath.Base(res.File) {
		t.Fatalf("kept mismatch: %+v", res)
	}
	if !backupFileRe.MatchString(filepath.Base(res.File)) {
		t.Fatalf("filename shape: %s", res.File)
	}
	restoreDir := t.TempDir()
	restored := filepath.Join(restoreDir, "restored.db")
	gunzipTo(t, res.File, restored)
	verifyBackupCounts(t, restored, 3, 151, "快照标记章")
	// 目录内只应有合法快照件(无 staging/.part 残留)
	names := snapshotDirFiles(t, bdir)
	if len(names) != 1 || !backupFileRe.MatchString(names[0]) {
		t.Fatalf("dir leftovers: %v", names)
	}
	if m.lastErr != "" || m.lastFile != res.File || m.count != 1 {
		t.Fatalf("manager state: lastErr=%q count=%d", m.lastErr, m.count)
	}
}

// ---- 只读连接路径: VACUUM INTO 在 mode=ro 连接上一致可读 ----

func TestR75c_VacuumIntoReadOnlyConn(t *testing.T) {
	db, _ := backupTestDB(t)
	dst := filepath.Join(t.TempDir(), "ro-target.db")
	if err := vacuumViaRO(db.path, dst); err != nil {
		t.Fatalf("vacuumViaRO: %v", err)
	}
	verifyBackupCounts(t, dst, 3, 150, "")
}

// ---- 保留策略: keep=K 恰好留最新 K 份, 名字即时间序 ----

func TestR75c_RetentionKeepK(t *testing.T) {
	db, bdir := backupTestDB(t)
	m := &BackupManager{db: db, dir: bdir, keep: 2}
	// 注入时间源: 每次快照推进 1s → 文件名严格时序
	base := time.Now().Truncate(time.Second)
	cur := base
	mu := sync.Mutex{}
	backupNow = func() time.Time {
		mu.Lock()
		defer mu.Unlock()
		cur = cur.Add(time.Second)
		return cur
	}
	t.Cleanup(func() { backupNow = time.Now })

	var lastRes BackupResult
	for i := 0; i < 4; i++ {
		res, err := m.Snapshot("periodic")
		if err != nil {
			t.Fatalf("snapshot %d: %v", i, err)
		}
		lastRes = res
	}
	names := snapshotDirFiles(t, bdir)
	if len(names) != 2 {
		t.Fatalf("keep=2 but %d files: %v", len(names), names)
	}
	// 剩下的必是最新两份(注入时序的第 3/4 次)
	wantNewest := filepath.Base(lastRes.File)
	if names[0] != wantNewest {
		t.Fatalf("newest=%s want %s", names[0], wantNewest)
	}
	for _, n := range names {
		if !backupFileRe.MatchString(n) {
			t.Fatalf("non-snapshot file kept: %v", names)
		}
	}
	// 保留策略不误删他种文件
	if err := os.WriteFile(filepath.Join(bdir, "README.txt"), []byte("keep me"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Snapshot("periodic"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(bdir, "README.txt")); err != nil {
		t.Fatalf("retention deleted foreign file")
	}
}

// ---- 并发触发不撕裂: 单 Manager 多协程 + 双 Manager(跨进程模拟) ----

func TestR75c_ConcurrentSnapshotsNoTear(t *testing.T) {
	db, bdir := backupTestDB(t)
	m := &BackupManager{db: db, dir: bdir, keep: 8}
	const N = 6
	var wg sync.WaitGroup
	errs := make([]error, N)
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, errs[i] = m.Snapshot("manual")
		}(i)
	}
	// 第二个 DB 句柄(模拟第二进程)同时快照到同一目录
	db2, err := Open(db.path)
	if err != nil {
		t.Fatalf("open db2: %v", err)
	}
	t.Cleanup(func() {
		db2.backup.Store(nil) // 避免 db2.Close 触发停机快照搅局
		_ = db2.DB.Close()
	})
	m2 := &BackupManager{db: db2, dir: bdir, keep: 8}
	wg.Add(1)
	go func() {
		defer wg.Done()
		_, _ = m2.Snapshot("manual")
	}()
	wg.Wait()
	for i, e := range errs {
		if e != nil {
			t.Fatalf("snapshot %d: %v", i, e)
		}
	}
	// 全部产物: gzip 完整 + 解开后 sqlite 可开 + 数据在
	names := snapshotDirFiles(t, bdir)
	if len(names) < N { // 至少 N 份(keep=8 不裁剪; 名字碰撞走 -N 后缀)
		t.Fatalf("expected >=%d files, got %d: %v", N, len(names), names)
	}
	tmp := t.TempDir()
	for i, n := range names {
		if !backupFileRe.MatchString(n) {
			t.Fatalf("unexpected file: %s", n)
		}
		dst := filepath.Join(tmp, fmt.Sprintf("r%d.db", i))
		gunzipTo(t, filepath.Join(bdir, n), dst)
		verifyBackupCounts(t, dst, 3, 150, "")
	}
}

// ---- 自动托管生命周期: Open 启循环 → Close 停机快照; 0=禁用; 测试门 ----

func TestR75c_AutoBackupLifecycle(t *testing.T) {
	t.Run("explicit env starts loop and closes with shutdown snapshot", func(t *testing.T) {
		t.Setenv("BACKUP_INTERVAL_HOURS", "1") // 显式 → 放行测试门; 1h 内不会周期触发
		dir := t.TempDir()
		t.Setenv("BACKUP_DIR", dir)
		path := filepath.Join(t.TempDir(), "sub", "lifecycle.db")
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		schemaAt(t, path)
		db, err := Open(path)
		if err != nil {
			t.Fatal(err)
		}
		st := db.BackupManager().LastSnapshot()
		if st["loopRunning"] != true {
			t.Fatalf("loop not running: %v", st)
		}
		if _, err := db.Exec(`CREATE TABLE t1(a)`); err != nil {
			t.Fatal(err)
		}
		if err := db.Close(); err != nil {
			t.Fatalf("close: %v", err)
		}
		names := snapshotDirFiles(t, dir)
		if len(names) != 1 || !backupFileRe.MatchString(names[0]) {
			t.Fatalf("shutdown snapshot missing: %v", names)
		}
		restored := filepath.Join(t.TempDir(), "r.db")
		gunzipTo(t, filepath.Join(dir, names[0]), restored)
		if _, err := os.Stat(restored); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("zero disables entirely", func(t *testing.T) {
		t.Setenv("BACKUP_INTERVAL_HOURS", "0")
		dir := t.TempDir()
		t.Setenv("BACKUP_DIR", dir)
		path := filepath.Join(t.TempDir(), "off.db")
		schemaAt(t, path)
		db, err := Open(path)
		if err != nil {
			t.Fatal(err)
		}
		if db.BackupManager().LastSnapshot()["loopRunning"] != false {
			t.Fatal("loop should be off")
		}
		if err := db.Close(); err != nil {
			t.Fatal(err)
		}
		if names := snapshotDirFiles(t, dir); len(names) != 0 {
			t.Fatalf("disabled but files written: %v", names)
		}
	})
	t.Run("default no env stays off in tests", func(t *testing.T) {
		t.Setenv("BACKUP_INTERVAL_HOURS", "") // 清除可能的外部环境
		path := filepath.Join(t.TempDir(), "gate.db")
		schemaAt(t, path)
		db, err := Open(path)
		if err != nil {
			t.Fatal(err)
		}
		if db.BackupManager().LastSnapshot()["loopRunning"] != false {
			t.Fatal("testing.Testing() gate failed: loop started without explicit env")
		}
		_ = db.Close()
	})
	t.Run("manual endpoint manager works even when interval=0", func(t *testing.T) {
		t.Setenv("BACKUP_INTERVAL_HOURS", "0")
		dir := t.TempDir()
		t.Setenv("BACKUP_DIR", dir)
		db, _ := backupTestDB(t)
		m := db.BackupManager()
		if m.LastSnapshot()["loopRunning"] != false {
			t.Fatal("loop should be off")
		}
		res, err := m.Snapshot("manual")
		if err != nil {
			t.Fatalf("manual snapshot: %v", err)
		}
		if res.File == "" {
			t.Fatal("no file")
		}
	})
}

// ---- 周期循环体: 注入毫秒级 interval, 验证周期触发与停机 ----

func TestR75c_PeriodicLoopFires(t *testing.T) {
	db, bdir := backupTestDB(t)
	backupNow = func() time.Time { return time.Now().Add(10 * time.Second) } // 避开同秒名碰撞
	t.Cleanup(func() { backupNow = time.Now })
	m := &BackupManager{db: db, dir: bdir, keep: 3, interval: 40 * time.Millisecond}
	m.mu.Lock()
	m.loopStarted, m.auto = true, true
	m.stopCh, m.loopDone = make(chan struct{}), make(chan struct{})
	m.mu.Unlock()
	go m.loop()
	time.Sleep(200 * time.Millisecond) // ≥2 个周期
	close(m.stopCh)
	<-m.loopDone
	names := snapshotDirFiles(t, bdir)
	if len(names) < 2 {
		t.Fatalf("periodic snapshots fired %d times, want >=2", len(names))
	}
	for _, n := range names {
		if !backupFileRe.MatchString(n) {
			t.Fatalf("bad file: %s", n)
		}
	}
}

// ---- 目录解析启发 + 环境变量口径 ----

func TestR75c_DirResolution(t *testing.T) {
	t.Setenv("BACKUP_DIR", "")
	cases := []struct{ dbPath, want string }{
		{"db/custom.db", "backups"},                       // 标准布局 → 同级(相对 cwd)
		{"/data/mhgl/db/custom.db", "/data/mhgl/backups"}, // 绝对标准布局 → 同级
		{"/tmp/TestX/test.db", "/tmp/TestX/backups"},      // 测试布局 → 就地包含
		{"custom.db", "backups"},                          // 无目录 → cwd/backups
	}
	for _, c := range cases {
		if got := backupDirResolve(c.dbPath); got != c.want {
			t.Errorf("backupDirResolve(%q)=%q want %q", c.dbPath, got, c.want)
		}
	}
	t.Setenv("BACKUP_DIR", "/explicit/dir")
	if got := backupDirResolve("db/custom.db"); got != "/explicit/dir" {
		t.Errorf("explicit dir override failed: %q", got)
	}
}

func TestR75c_EnvParsing(t *testing.T) {
	t.Setenv("BACKUP_INTERVAL_HOURS", "")
	t.Setenv("BACKUP_KEEP", "")
	if h, explicit := backupIntervalHours(); h != 6 || explicit {
		t.Fatalf("default: %dh explicit=%v", h, explicit)
	}
	t.Setenv("BACKUP_INTERVAL_HOURS", "12")
	if h, explicit := backupIntervalHours(); h != 12 || !explicit {
		t.Fatalf("12: %dh explicit=%v", h, explicit)
	}
	t.Setenv("BACKUP_INTERVAL_HOURS", "0")
	if h, _ := backupIntervalHours(); h != 0 {
		t.Fatalf("0 should disable, got %d", h)
	}
	t.Setenv("BACKUP_INTERVAL_HOURS", "bogus")
	if h, _ := backupIntervalHours(); h != 0 {
		t.Fatalf("bogus should disable, got %d", h)
	}
	t.Setenv("BACKUP_KEEP", "0")
	if k := backupKeep(); k != 1 {
		t.Fatalf("keep 0 clamps to 1, got %d", k)
	}
	t.Setenv("BACKUP_KEEP", "7")
	if k := backupKeep(); k != 7 {
		t.Fatalf("keep 7, got %d", k)
	}
	t.Setenv("BACKUP_KEEP", "bogus")
	if k := backupKeep(); k != 3 {
		t.Fatalf("keep bogus defaults 3, got %d", k)
	}
}
