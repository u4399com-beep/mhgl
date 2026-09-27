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

	// [R75-c] 主库自动快照(防沙箱重置清数据; 引擎在 internal/store/backup.go)。
	// 注意: 本轮 cmd/server 不可触碰(R75-d 领地), store.Open 亦不依赖本结构
	// —— store 侧直接读同名环境变量实现零接线自动生效; 本结构为镜像口径
	// (config_test 断言两边缺省/解析一致), 未来 main.go 可改显式装配。
	BackupIntervalHours int    // BACKUP_INTERVAL_HOURS 周期小时(缺省 6; 0=禁用)
	BackupKeep          int    // BACKUP_KEEP 保留份数(缺省 3; <1 钳为 1)
	BackupDir           string // BACKUP_DIR 快照目录(空 = db 所在目录同级的 backups/)
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
	// [R73-c] 生产判定大小写不敏感并收编 "prod" 别名: 修前恒等比较 "production"
	// —— GO_ENV=Production/PRODUCTION/prod 的部署(大小写笔误/简写)被当 dev,
	// ADMIN_PASSWORD/SESSION_SECRET 缺失时静默启用公开缺省密码(audit-fix-2025)
	// 与固定会话密钥, fail-closed 承诺被绕过。
	goEnv := strings.ToLower(strings.TrimSpace(os.Getenv("GO_ENV")))
	isProd := goEnv == "production" || goEnv == "prod"
	memMB := 600
	if v, err := strconv.Atoi(envOr("MEM_LIMIT_MB", "600")); err == nil && v > 0 && v <= 4096 {
		memMB = v
	}
	// [R75-c] 备份三变量(与 store.backupIntervalHours/backupKeep 同口径):
	// 周期非法/负值 → 0(禁用, fail-safe: 不做不确定周期的备份); keep <1 钳 1。
	backupHours := 6
	if v, err := strconv.Atoi(envOr("BACKUP_INTERVAL_HOURS", "6")); err != nil || v <= 0 {
		backupHours = 0
	} else {
		backupHours = v
	}
	backupKeep := 3
	if v, err := strconv.Atoi(envOr("BACKUP_KEEP", "3")); err == nil {
		if v < 1 {
			v = 1
		}
		backupKeep = v
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

		BackupIntervalHours: backupHours,
		BackupKeep:          backupKeep,
		BackupDir:           strings.TrimSpace(os.Getenv("BACKUP_DIR")),
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
