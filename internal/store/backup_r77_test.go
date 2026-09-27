package store

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

// ---- R77 heavy-pin: 大快照不被后续小快照轮转自毁(恢复点保护) ----
//
// 实证背景(R77-main): 沙箱快照回滚清库后, 停机钩子在空库上打出 ~40KB
// 小快照, 把 52MB 全量收口快照轮转删除(BACKUP_KEEP=3 纯时间序), 恢复点
// 归零 —— 保险机制在最需要它的场景自毁。heavy-pin: 候选删除集中体积最大
// 者 ≥ 保留集最小件 ×4 时豁免一份。
//
// 直接手写快照形态文件(applyRetention 只看文件名+体积, 不验内容),
// 文件名字典序=时间序, 体积用真实差异(4096B vs 64B, gzip 后同数量级差距)。

func r77WriteSnap(t *testing.T, dir, name string, size int) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), bytes.Repeat([]byte("x"), size), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestR77_RetentionHeavyPin(t *testing.T) {
	db, bdir := backupTestDB(t)
	m := &BackupManager{db: db, dir: bdir, keep: 3}

	// 场景1: 最旧 4KB 大件 + 3 份 64B 小件(新) —— 大件被 pin 存活
	r77WriteSnap(t, bdir, "db-20260101-000001.db.gz", 4096) // big(旧)
	r77WriteSnap(t, bdir, "db-20260101-000002.db.gz", 64)
	r77WriteSnap(t, bdir, "db-20260101-000003.db.gz", 64)
	r77WriteSnap(t, bdir, "db-20260101-000004.db.gz", 64)
	kept := m.applyRetention()
	// 修前: big 被删(第 4 新, keep=3) —— 恢复点自毁形态钉子
	// 修后: kept = [s4,s3,s2,big]
	if len(kept) != 4 {
		t.Fatalf("scenario1 want 4 kept, got %d: %v", len(kept), kept)
	}
	if kept[0] != "db-20260101-000004.db.gz" || kept[3] != "db-20260101-000001.db.gz" {
		t.Fatalf("scenario1 order: %v", kept)
	}
	if names := snapshotDirFiles(t, bdir); len(names) != 4 {
		t.Fatalf("scenario1 disk: %v", names)
	}

	// 场景2: 新小件入列 —— 旧大件仍 pin, 最旧小件(上一轮保留集边界外)被删
	r77WriteSnap(t, bdir, "db-20260101-000005.db.gz", 64)
	kept = m.applyRetention()
	// snaps={s5,s4,s3,s2,big} keep=3 候选={s2,big} pin=big → 删 s2
	if len(kept) != 4 {
		t.Fatalf("scenario2 want 4 kept, got %d: %v", len(kept), kept)
	}
	if kept[0] != "db-20260101-000005.db.gz" || kept[3] != "db-20260101-000001.db.gz" {
		t.Fatalf("scenario2 order: %v", kept)
	}

	// 场景3: 恢复面 —— 新大件填满保留集后旧 pin 件自然消化(不再豁免)
	r77WriteSnap(t, bdir, "db-20260101-000006.db.gz", 4096)
	r77WriteSnap(t, bdir, "db-20260101-000007.db.gz", 4096)
	r77WriteSnap(t, bdir, "db-20260101-000008.db.gz", 4096)
	kept = m.applyRetention()
	// snaps={s8,s7,s6,s5,big} 候选={s5,big} minKept=4096 → 4096<16384 不 pin → 全删
	if len(kept) != 3 {
		t.Fatalf("scenario3 want 3 kept, got %d: %v", len(kept), kept)
	}
	for _, gone := range []string{"db-20260101-000001.db.gz", "db-20260101-000005.db.gz"} {
		if _, err := os.Stat(filepath.Join(bdir, gone)); !os.IsNotExist(err) {
			t.Fatalf("scenario3 %s should be removed", gone)
		}
	}
}

func TestR77_RetentionNoPinWhenSimilar(t *testing.T) {
	db, bdir := backupTestDB(t)
	m := &BackupManager{db: db, dir: bdir, keep: 3}
	// 4 件等体积(正常周期快照形态) —— 旧行为不回归: 恰好留最新 3 份
	for i := 1; i <= 4; i++ {
		r77WriteSnap(t, bdir, "db-20260101-00000"+string(rune('0'+i))+".db.gz", 64)
	}
	kept := m.applyRetention()
	if len(kept) != 3 {
		t.Fatalf("want 3 kept(旧行为), got %d: %v", len(kept), kept)
	}
	if kept[0] != "db-20260101-000004.db.gz" {
		t.Fatalf("newest first: %v", kept)
	}
}
