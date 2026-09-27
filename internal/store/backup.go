// ============================================================
// [R75-c] SQLite 主库自动快照(防沙箱重置清数据)
//
// 背景: 平台沙箱会周期性重置并清空 db/ 目录(R74/R75 两轮实证: books 从
// 11496 章归零、任务重播种)。本机制对主库做在线一致性快照, 落 backups/
// 目录(与 db/ 同级 —— db/ 被清时 backups/ 存活), 保留最近 K 份, 供:
//  1. 沙箱重置后人工恢复(gunzip → 覆盖 db/custom.db, 见文件尾恢复命令);
//  2. 主控轮末挑选最新一份提交 git(git add -f backups/db-*.db.gz)。
//
// 快照安全性: 禁止直接 cp 主库文件(WAL 模式下 cp 主文件+未合并的 -wal
// 会撕裂)。使用 SQLite ≥3.27 的 `VACUUM INTO '<目标>'`:
//   - 在只读连接上执行 = 隐式读事务, 输出为「某一提交时刻」的完整一致副本
//     (含 WAL 中已提交未 checkpoint 的数据), 不阻塞业务写(WAL 读写并发);
//   - 只读连接失败(如 -shm 不可写的部署形态)自动降级到连接池执行
//     (MaxOpenConns(1) 语义下等价一致, 仅与写者串行)。
//
// 输出经 gzip 压缩, 以 <final>.part 临时名写入后原子 rename, 保留扫描永不
// 看到半成品; VACUUM INTO 目标已存在会报错(SQLite 语义), 故 staging 用
// 进程内唯一临时名。
//
// 触发点(三路共用同一 Manager 单例, Manager 内部互斥串行 —— 并发触发
// 不会撕裂、保留策略删除不会竞态):
//
//	① 周期: store.Open 自动启动循环, 每 BACKUP_INTERVAL_HOURS(缺省 6)小时
//	   一次; 0=禁用。测试进程(testing.Testing())在未显式设置环境变量时
//	   不自动启动 —— 测试零磁盘副作用, 显式 t.Setenv 后自动路径可回归。
//	② 优雅停机: (*DB).Close() 钩子在关库前做最后一次 shutdown 快照。
//	③ 手动: POST /api/admin/backup/snapshot(internal/api)。
//
// 环境变量(internal/config.Config 镜像同名字段, 便于未来 main.go 显式装配):
//
//	BACKUP_INTERVAL_HOURS  周期小时数(缺省 6; 0 或非法=禁用)
//	BACKUP_KEEP            保留份数(缺省 3; <1 钳为 1)
//	BACKUP_DIR             快照目录(缺省 <db 所在目录的同级>/backups;
//	                       标准部署 db/custom.db → ./backups; db/ 重置不殃及)
//
// 失败不致命: 任何快照错误只 log + 记录到 LastSnapshot(), 不影响服务。
//
// 恢复命令(停服后执行; R75-c 交付, 供文档转交):
//
//	gunzip -c backups/db-YYYYMMDD-HHMMSS.db.gz > db/custom.db
//	rm -f db/custom.db-wal db/custom.db-shm   # 旧 WAL 与恢复文件不配套, 必须清
//	# 重启服务(staging 目录校验和可选: gunzip -t backups/db-*.db.gz)
//
// ============================================================
package store

import (
	"compress/gzip"
	"context"
	"database/sql"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// backupFileRe 快照文件名形态(db-YYYYMMDD-HHMMSS.db.gz, 同秒碰撞时 .N 后缀
// 追加在扩展名后 —— logrotate 惯例, 保证字典序=时间序: 若后缀插在中间
// ("-2.db.gz"), '-'<'.' 会使碰撞件被误序为更旧, 保留策略会刚写就删)。
// 保留策略只触碰匹配该形态的文件 —— 用户放在 backups/ 里的其他文件绝不删除。
var backupFileRe = regexp.MustCompile(`^db-\d{8}-\d{6}\.db\.gz(\.\d+)?$`)

// stagingRe 崩溃遗留 staging 清扫形态(24h 以上才回收)。
var stagingRe = regexp.MustCompile(`^\.staging-.*\.db$`)

// backupNow 时间源(测试可注入, 保证保留策略测试中文件名严格时序)。
var backupNow = time.Now

// BackupResult 一次快照的结果(供 admin 端点返回与日志)。
type BackupResult struct {
	Reason     string   `json:"reason"`
	File       string   `json:"file"`      // 绝对/相对路径(与 BACKUP_DIR 解析一致)
	SizeBytes  int64    `json:"sizeBytes"` // gzip 后大小
	DurationMS int64    `json:"durationMs"`
	Kept       []string `json:"kept"` // 保留策略执行后的现存快照(新→旧)
}

// BackupManager 主库快照管理器(*DB 级单例, 见 (*DB).BackupManager)。
type BackupManager struct {
	db   *DB
	auto bool // 是否由 store.Open 自动托管(周期循环 + 停机快照)

	mu       sync.Mutex // 串行化 Snapshot 全程(含保留删除)与循环状态
	dir      string
	keep     int
	interval time.Duration // 0 = 不跑周期循环(仅手动/停机)

	loopStarted bool
	stopCh      chan struct{}
	loopDone    chan struct{}
	finalOnce   sync.Once // 停机快照只做一次

	lastFile string
	lastErr  string
	lastMS   int64
	count    uint64
}

// ---------------- 环境变量解析 ----------------

// backupEnvFromLookup 周期小时数: 返回 (小时, 是否显式设置)。
// 缺省 6; 显式 0/负数/非法 → 0(禁用)。空串视为未设置(与 config.envOr 口径一致)。
func backupIntervalHours() (int, bool) {
	v := strings.TrimSpace(os.Getenv("BACKUP_INTERVAL_HOURS"))
	if v == "" {
		return 6, false
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return 0, true
	}
	return n, true
}

func backupKeep() int {
	if v, ok := os.LookupEnv("BACKUP_KEEP"); ok {
		if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			if n < 1 {
				return 1
			}
			return n
		}
	}
	return 3
}

// backupDirResolve 快照目录: BACKUP_DIR 显式优先。缺省启发:
//   - db 文件位于名为 db/ 的目录(标准部署 db/custom.db)→ 同级 backups/
//     (db/ 被沙箱重置清空时快照存活 —— 同级而非 db/ 内是刻意的);
//   - 其他布局(测试临时目录/自定义路径)→ db 所在目录内的 backups/
//     (就地包含, 绝不外溢到上级 —— /tmp/TestX/test.db → /tmp/TestX/backups)。
func backupDirResolve(dbPath string) string {
	if v := strings.TrimSpace(os.Getenv("BACKUP_DIR")); v != "" {
		return v
	}
	dbDir := filepath.Dir(dbPath)
	if filepath.Base(dbDir) == "db" {
		return filepath.Clean(filepath.Join(dbDir, "..", "backups"))
	}
	return filepath.Clean(filepath.Join(dbDir, "backups"))
}

// ---------------- 生命周期 ----------------

// BackupManager 返回 *DB 级快照管理器单例(懒创建; 不自动启动周期循环)。
// 自动托管(maybeStartAutoBackup)与手动端点共用同一实例 → 互斥天然收敛。
func (d *DB) BackupManager() *BackupManager {
	if m := d.backup.Load(); m != nil {
		return m
	}
	hours, _ := backupIntervalHours()
	m := &BackupManager{
		db:       d,
		dir:      backupDirResolve(d.path),
		keep:     backupKeep(),
		interval: time.Duration(hours) * time.Hour,
	}
	if d.backup.CompareAndSwap(nil, m) {
		return m
	}
	return d.backup.Load()
}

// maybeStartAutoBackup store.Open 尾部调用: 非测试进程且未显式禁用时启动
// 周期循环。显式设置 BACKUP_INTERVAL_HOURS(含测试内 t.Setenv)优先于
// testing.Testing() 门 —— 自动路径在测试里可回归。
func (d *DB) maybeStartAutoBackup() {
	hours, explicit := backupIntervalHours()
	if hours <= 0 {
		return // 0=禁用(显式或非法解析)
	}
	if !explicit && testing.Testing() {
		return // 测试进程缺省零副作用(显式 env 仍放行)
	}
	m := d.BackupManager()
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.loopStarted {
		return
	}
	m.auto = true
	m.loopStarted = true
	m.stopCh = make(chan struct{})
	m.loopDone = make(chan struct{})
	go m.loop()
	log.Printf("[backup] auto snapshot on: dir=%s keep=%d every=%dh", m.dir, m.keep, hours)
}

// loop 周期循环: 每 interval 一次; stopCh 关闭即退出(不补跑)。
func (m *BackupManager) loop() {
	defer close(m.loopDone)
	t := time.NewTicker(m.interval)
	defer t.Stop()
	for {
		select {
		case <-m.stopCh:
			return
		case <-t.C:
			if _, err := m.Snapshot("periodic"); err != nil {
				log.Printf("[backup] periodic: %v", err) // 失败不致命
			}
		}
	}
}

// StopFinalize 优雅停机钩子((*DB).Close 内调用): 停周期循环 → 关库前做最后
// 一次 shutdown 快照。幂等(多次 Close 安全); 非自动托管的实例(纯手动端点
// 创建且 interval=0)不做停机快照(特性整体禁用语义)。
func (m *BackupManager) StopFinalize() {
	m.mu.Lock()
	started := m.loopStarted
	m.loopStarted = false
	stopCh, done := m.stopCh, m.loopDone
	m.mu.Unlock()
	if started && stopCh != nil {
		close(stopCh)
		<-done
	}
	if !m.auto {
		return
	}
	m.finalOnce.Do(func() {
		if _, err := m.Snapshot("shutdown"); err != nil {
			log.Printf("[backup] shutdown: %v", err)
		}
	})
}

// LastSnapshot 最近一次快照状态(运维/端点观测用)。
func (m *BackupManager) LastSnapshot() map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	running := false
	if m.loopStarted {
		select {
		case <-m.stopCh:
		default:
			running = true
		}
	}
	return map[string]any{
		"dir": m.dir, "keep": m.keep,
		"intervalHours": int(m.interval.Hours()), "loopRunning": running,
		"lastFile": m.lastFile, "lastError": m.lastErr,
		"lastAtMs": m.lastMS, "count": m.count,
	}
}

// ---------------- 快照核心 ----------------

// Snapshot 执行一次快照: VACUUM INTO(只读连接, 失败降级连接池) → gzip →
// 原子 rename → 保留策略。全程互斥(周期/手动/停机三路共用), 并发触发
// 排队执行且各自产出一致副本; 失败清理 staging 并返回错误(不致命)。
func (m *BackupManager) Snapshot(reason string) (BackupResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t0 := time.Now()

	if err := os.MkdirAll(m.dir, 0o755); err != nil {
		return m.fail(reason, fmt.Errorf("mkdir %s: %w", m.dir, err))
	}
	staging := filepath.Join(m.dir, fmt.Sprintf(".staging-%d-%d.db", os.Getpid(), time.Now().UnixNano()))
	if err := m.vacuumInto(staging); err != nil {
		_ = os.Remove(staging)
		return m.fail(reason, err)
	}

	final, err := m.packAndPlace(staging)
	_ = os.Remove(staging) // 无论成败都回收 VACUUM INTO 产物
	if err != nil {
		return m.fail(reason, err)
	}

	kept := m.applyRetention()
	res := BackupResult{
		Reason: reason, File: final,
		SizeBytes:  fileSizeOr(final, 0),
		DurationMS: time.Since(t0).Milliseconds(),
		Kept:       kept,
	}
	m.lastFile, m.lastErr, m.lastMS = final, "", time.Now().UnixMilli()
	m.count++
	log.Printf("[backup] snapshot ok: %s (%s, %d bytes, %dms, kept=%d)",
		filepath.Base(final), reason, res.SizeBytes, res.DurationMS, len(kept))
	return res, nil
}

// vacuumInto VACUUM INTO 落一份一致副本到 dst。
// 首选独立只读连接(WAL 读写并发, 不与业务写者串行); 只读失败降级连接池。
func (m *BackupManager) vacuumInto(dst string) error {
	dstSQL := strings.ReplaceAll(dst, "'", "''") // SQL 字面量单引号加倍
	stmt := `VACUUM INTO '` + dstSQL + `'`
	if err := vacuumViaRO(m.db.path, dst); err == nil {
		return nil
	} else {
		log.Printf("[backup] ro-conn vacuum unavailable, fallback to pool: %v", err)
	}
	if _, err := m.db.Exec(stmt); err != nil {
		return fmt.Errorf("vacuum into %s: %w", filepath.Base(dst), err)
	}
	return nil
}

// vacuumViaRO 独立只读连接执行 VACUUM INTO(mode=ro; 主库 WAL/-shm 由进程
// 内既有连接持有, 只读侧可正常读)。
func vacuumViaRO(dbPath, dst string) error {
	if strings.Contains(dbPath, ":memory:") || strings.HasPrefix(dbPath, "file:") {
		return fmt.Errorf("non-file db path %q", dbPath)
	}
	ro, err := sql.Open("sqlite", fmt.Sprintf("file:%s?mode=ro&_pragma=busy_timeout(5000)", dbPath))
	if err != nil {
		return err
	}
	defer ro.Close()
	ro.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	_, err = ro.ExecContext(ctx, `VACUUM INTO '`+strings.ReplaceAll(dst, "'", "''")+`'`)
	return err
}

// packAndPlace staging db → gzip 到进程唯一 .part 临时件 → 原子 rename 到最终名。
// 最终名形态 db-YYYYMMDD-HHMMSS.db.gz(同秒碰撞加 .N 尾缀, logrotate 惯例,
// 字典序=时间序)。.part 名含 pid+纳秒 —— 跨 Manager(跨进程)同时落盘也
// 不会互写同一临时件; rename 原子, 即使两 Manager 抢同一最终名也只是
// 完整件相互覆盖, 无撕裂。并发触发测试覆盖。
func (m *BackupManager) packAndPlace(staging string) (string, error) {
	base := backupNow().Format("db-20060102-150405")
	final := ""
	for i := 0; i < 100; i++ {
		cand := filepath.Join(m.dir, base+".db.gz")
		if i > 0 {
			cand = fmt.Sprintf("%s.%d", cand, i)
		}
		if _, err := os.Stat(cand); os.IsNotExist(err) {
			final = cand
			break
		}
	}
	if final == "" {
		return "", fmt.Errorf("cannot resolve unique backup name in %s", m.dir)
	}

	part := fmt.Sprintf("%s.part-%d-%d", final, os.Getpid(), time.Now().UnixNano())
	pf, err := os.Create(part)
	if err != nil {
		return "", fmt.Errorf("create %s: %w", filepath.Base(part), err)
	}
	src, err := os.Open(staging)
	if err != nil {
		_ = pf.Close()
		_ = os.Remove(part)
		return "", fmt.Errorf("open staging: %w", err)
	}
	zw := gzip.NewWriter(pf)
	if _, err := io.Copy(zw, src); err != nil {
		_ = zw.Close()
		_ = pf.Close()
		_ = src.Close()
		_ = os.Remove(part)
		return "", fmt.Errorf("gzip: %w", err)
	}
	if err := zw.Close(); err != nil {
		_ = pf.Close()
		_ = src.Close()
		_ = os.Remove(part)
		return "", fmt.Errorf("gzip close: %w", err)
	}
	_ = src.Close()
	if err := pf.Sync(); err != nil {
		_ = pf.Close()
		_ = os.Remove(part)
		return "", fmt.Errorf("fsync: %w", err)
	}
	if err := pf.Close(); err != nil {
		_ = os.Remove(part)
		return "", fmt.Errorf("close: %w", err)
	}
	if err := os.Rename(part, final); err != nil {
		_ = os.Remove(part)
		return "", fmt.Errorf("rename: %w", err)
	}
	return final, nil
}

// applyRetention 保留策略: 快照形态文件按名(=时间)降序保留最新 keep 份,
// 其余删除; 顺带回收 24h 以上的崩溃遗留 staging/.part。调用方持有 m.mu。
func (m *BackupManager) applyRetention() []string {
	entries, err := os.ReadDir(m.dir)
	if err != nil {
		return nil
	}
	var snaps []string
	cutoff := time.Now().Add(-24 * time.Hour)
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() {
			continue
		}
		if backupFileRe.MatchString(name) {
			snaps = append(snaps, name)
			continue
		}
		if stagingRe.MatchString(name) ||
			(strings.HasPrefix(name, "db-") && strings.Contains(name, ".part")) { // 本机制临时件
			if fi, ferr := e.Info(); ferr == nil && fi.ModTime().Before(cutoff) {
				_ = os.Remove(filepath.Join(m.dir, name))
			}
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(snaps))) // 新→旧(名字即时间序)
	for i := m.keep; i < len(snaps); i++ {
		if rerr := os.Remove(filepath.Join(m.dir, snaps[i])); rerr != nil {
			log.Printf("[backup] retention remove %s: %v", snaps[i], rerr)
		}
	}
	if len(snaps) > m.keep {
		snaps = snaps[:m.keep]
	}
	return snaps
}

func (m *BackupManager) fail(reason string, err error) (BackupResult, error) {
	m.lastErr = err.Error()
	m.lastMS = time.Now().UnixMilli()
	log.Printf("[backup] snapshot failed (%s): %v", reason, err)
	return BackupResult{Reason: reason}, err
}

func fileSizeOr(p string, def int64) int64 {
	if fi, err := os.Stat(p); err == nil {
		return fi.Size()
	}
	return def
}
