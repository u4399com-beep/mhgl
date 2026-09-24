// ============================================================
// R55 全栈 Go 化 — 进程配置
// 全部来自环境变量; 缺省值对齐原 Next.js .env 口径, 保证切换零配置可用。
// 生产(GO_ENV=production)下密码/密钥缺失一律 fail-closed(对齐 auth.ts R31-6)。
// ============================================================
package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Port          string // 监听端口(缺省 3000)
	DBPath        string // SQLite 文件(缺省 db/custom.db)
	AdminPassword string // 缺省 audit-fix-2025(dev); 生产必须显式设置
	SessionSecret string // HMAC 密钥; dev 缺省固定值对齐 auth.ts
	CoverDir      string // 封面落盘目录(web/covers)
	MemLimitMB    int    // GOMEMLIMIT 软顶(缺省 600)
	IsProd        bool   // GO_ENV=production
	CookieSecure  bool   // 会话 Cookie 附加 Secure 属性(https 部署; 缺省 false 保 http 沙箱预览可用, 请求经 https 时自动叠加)
	DataDir       string // 项目根(供相对路径解析)
}

func envOr(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

// envBool 布尔环境变量(1/true/yes/on 不分大小写; 其余/未设 = false)。
func envBool(key string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// Load 构建配置。cwd 即项目根(由启动脚本保证)。
func Load() *Config {
	isProd := envOr("GO_ENV", "") == "production"
	memMB := 600
	if v, err := strconv.Atoi(envOr("MEM_LIMIT_MB", "600")); err == nil && v > 0 && v <= 4096 {
		memMB = v
	}
	c := &Config{
		Port:          envOr("PORT", "3000"),
		DBPath:        envOr("DB_PATH", "db/custom.db"),
		AdminPassword: strings.TrimSpace(os.Getenv("ADMIN_PASSWORD")),
		SessionSecret: strings.TrimSpace(os.Getenv("SESSION_SECRET")),
		CoverDir:      envOr("COVER_DIR", "web/covers"),
		MemLimitMB:    memMB,
		IsProd:        isProd,
		CookieSecure:  envBool("COOKIE_SECURE"),
		DataDir:       ".",
	}
	// dev 缺省对齐原 auth.ts 编译期常量; 生产缺失 fail-closed(空密码 → 登录恒 401)
	if c.AdminPassword == "" {
		if isProd {
			c.AdminPassword = "" // fail-closed: verifyPassword 恒 false
		} else {
			c.AdminPassword = "audit-fix-2025"
		}
	}
	if c.SessionSecret == "" {
		if isProd {
			c.SessionSecret = "" // fail-closed: 会话签发/校验恒失败
		} else {
			c.SessionSecret = "heis-session-secret-fixed-2025"
		}
	}
	// 相对路径锚定项目根(可执行文件可能从任意 cwd 启动)
	if !filepath.IsAbs(c.DBPath) {
		c.DBPath = filepath.Join(c.DataDir, c.DBPath)
	}
	if !filepath.IsAbs(c.CoverDir) {
		c.CoverDir = filepath.Join(c.DataDir, c.CoverDir)
	}
	return c
}
