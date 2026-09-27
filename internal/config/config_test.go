// ============================================================
// [R73-c] config env 解析边界回归 — GO_ENV 生产判定变体/布尔变体/畸形数字
// ============================================================
package config

import (
	"testing"
)

// TestLoad_ProdVariantsFailClosed GO_ENV 大小写/prod 别名一律按生产 fail-closed:
// 修前恒等比较 "production", "Production"/"PROD" 等变体静默落入 dev 公开缺省
// 密码(audit-fix-2025)与固定会话密钥, fail-closed 承诺被绕过。
func TestLoad_ProdVariantsFailClosed(t *testing.T) {
	for _, v := range []string{"production", "Production", "PRODUCTION", "prod", "Prod", " PROD "} {
		t.Setenv("GO_ENV", v)
		t.Setenv("ADMIN_PASSWORD", "")
		t.Setenv("SESSION_SECRET", "")
		c := Load()
		if !c.IsProd {
			t.Errorf("GO_ENV=%q 应判生产", v)
		}
		if c.AdminPassword != "" {
			t.Errorf("GO_ENV=%q 生产缺密码必须 fail-closed(空), got %q", v, c.AdminPassword)
		}
		if c.SessionSecret != "" {
			t.Errorf("GO_ENV=%q 生产缺密钥必须 fail-closed(空), got %q", v, c.SessionSecret)
		}
	}
}

// TestLoad_DevDefaults dev 形态(未设/dev/development/其他值)走缺省密码+密钥。
func TestLoad_DevDefaults(t *testing.T) {
	for _, v := range []string{"", "dev", "development", "test", " Production--like "} {
		t.Setenv("GO_ENV", v)
		t.Setenv("ADMIN_PASSWORD", "")
		t.Setenv("SESSION_SECRET", "")
		c := Load()
		if c.IsProd {
			t.Errorf("GO_ENV=%q 应判 dev", v)
		}
		if c.AdminPassword != "audit-fix-2025" {
			t.Errorf("GO_ENV=%q dev 缺省密码漂移: %q", v, c.AdminPassword)
		}
		if c.SessionSecret != "heis-session-secret-fixed-2025" {
			t.Errorf("GO_ENV=%q dev 缺省密钥漂移: %q", v, c.SessionSecret)
		}
	}
}

// TestLoad_EnvParsingEdges 显式密码/密钥覆盖、MEM_LIMIT_MB 畸形数字回落、
// COOKIE_SECURE 布尔变体、PORT 缺省。
func TestLoad_EnvParsingEdges(t *testing.T) {
	t.Run("explicit-override", func(t *testing.T) {
		t.Setenv("GO_ENV", "")
		t.Setenv("ADMIN_PASSWORD", "  my-pw ")
		t.Setenv("SESSION_SECRET", "s3cret")
		c := Load()
		if c.AdminPassword != "my-pw" {
			t.Errorf("ADMIN_PASSWORD 应 trim: %q", c.AdminPassword)
		}
		if c.SessionSecret != "s3cret" {
			t.Errorf("SESSION_SECRET 漂移: %q", c.SessionSecret)
		}
	})
	t.Run("mem-limit-malformed", func(t *testing.T) {
		for _, tc := range []struct {
			in, note string
			want     int
		}{
			{"", "未设回落缺省", 600},
			{"abc", "非数字回落", 600},
			{"0", "零值回落", 600},
			{"-5", "负值回落", 600},
			{"9999", "超上限回落", 600},
			{"2048", "合法区间生效", 2048},
		} {
			t.Setenv("GO_ENV", "")
			t.Setenv("MEM_LIMIT_MB", tc.in)
			if got := Load().MemLimitMB; got != tc.want {
				t.Errorf("MEM_LIMIT_MB=%q(%s) = %d, want %d", tc.in, tc.note, got, tc.want)
			}
		}
	})
	t.Run("cookie-secure-bool-variants", func(t *testing.T) {
		for _, tc := range []struct {
			in   string
			want bool
		}{
			{"1", true}, {"true", true}, {"TRUE", true}, {"Yes", true}, {"on", true},
			{"0", false}, {"false", false}, {"off", false}, {"garbage", false}, {"", false},
		} {
			t.Setenv("COOKIE_SECURE", tc.in)
			if got := Load().CookieSecure; got != tc.want {
				t.Errorf("COOKIE_SECURE=%q = %v, want %v", tc.in, got, tc.want)
			}
		}
	})
	t.Run("port-and-paths", func(t *testing.T) {
		t.Setenv("GO_ENV", "")
		t.Setenv("PORT", " 8080 ")
		t.Setenv("DB_PATH", "")
		t.Setenv("COVER_DIR", "")
		c := Load()
		if c.Port != "8080" {
			t.Errorf("PORT 应 trim 生效: %q", c.Port)
		}
		t.Setenv("PORT", "")
		c = Load()
		if c.Port != "3000" || c.DBPath != "db/custom.db" || c.CoverDir != "web/covers" {
			t.Errorf("缺省值漂移: port=%s db=%s cover=%s", c.Port, c.DBPath, c.CoverDir)
		}
	})
}
