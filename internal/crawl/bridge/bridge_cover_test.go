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
	"regexp"
	"strings"
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

// TestCoverExtByTypeBareExt [R66-b] coverExtByType 返回值不带点: 修前返回 ".jpg"
// 带点形态, 与 saveCoverFile 模板字面 '.' 拼接生成 book_<ms>_<rand>..jpg 双点文件
// (web/covers 留档 38 个; git R63-c 引入 CreateTemp 模板后出现)。回归钉死裸形态。
func TestCoverExtByTypeBareExt(t *testing.T) {
	cases := []struct{ ct, want string }{
		{"image/jpeg", "jpg"},
		{"image/png", "png"},
		{"image/webp", "webp"},
		{"image/gif", "gif"},
		{"IMAGE/PNG; charset=binary", "png"},
		{"  application/octet-stream ", "jpg"},
		{"", "jpg"},
	}
	for _, c := range cases {
		if got := coverExtByType(c.ct); got != c.want {
			t.Errorf("coverExtByType(%q) = %q, want %q", c.ct, got, c.want)
		}
	}
}

// TestSaveCoverFileSingleDot [R66-b] 端到端文件名回归: 生成的封面文件名必须恰好
// 一个点(扩展名分隔), 任何 contentType 下都不得出现 "双点" 形态。
func TestSaveCoverFileSingleDot(t *testing.T) {
	dir := t.TempDir()
	b := &Bridge{coverDir: dir}
	for _, ct := range []string{"image/jpeg", "image/png", "image/webp", "image/gif", "", "text/html"} {
		p, err := b.saveCoverFile([]byte("x"), ct)
		if err != nil {
			t.Fatalf("saveCoverFile(%q): %v", ct, err)
		}
		name := filepath.Base(p)
		if strings.Contains(name, "..") {
			t.Fatalf("contentType %q 生成双点文件名: %s", ct, name)
		}
		if n := strings.Count(name, "."); n != 1 {
			t.Fatalf("contentType %q 文件名应恰好 1 个点, got %d: %s", ct, n, name)
		}
		if !regexp.MustCompile(`^book_\d+_[0-9]+\.(jpg|png|webp|gif)$`).MatchString(name) {
			t.Fatalf("contentType %q 文件名形态异常: %s", ct, name)
		}
	}
}
