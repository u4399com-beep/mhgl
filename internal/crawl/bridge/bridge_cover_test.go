// ============================================================
// [R63-c] 封面落盘唯一性单测
//
//	修前文件名 = NowMS + rand(10000): 并发封面落盘的同毫秒窗口可碰撞
//	(200 次同毫秒写入碰撞概率 ≈ 86%), WriteFile 静默覆写 → 两本书指向
//	同一封面文件。修后 os.CreateTemp 原子唯一命名, 高频循环零碰撞。
//
// ============================================================
package bridge

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSaveCoverFileUniqueNames(t *testing.T) {
	dir := t.TempDir()
	b := &Bridge{coverDir: dir}
	seen := map[string]bool{}
	for i := 0; i < 2000; i++ { // 同毫秒高频落盘窗口(修前实现此规模下碰撞期望≈2 次)
		p, err := b.saveCoverFile([]byte("cover-bytes"), "image/jpeg")
		if err != nil {
			t.Fatalf("saveCoverFile: %v", err)
		}
		if seen[p] {
			t.Fatalf("封面文件名碰撞: %s", p)
		}
		seen[p] = true
		if filepath.Dir(p) != "covers" {
			t.Fatalf("返回路径应为 covers/<file> 相对形态, got %s", p)
		}
		if _, err := os.Stat(filepath.Join(dir, filepath.Base(p))); err != nil {
			t.Fatalf("落盘文件不存在: %s: %v", p, err)
		}
	}
}
