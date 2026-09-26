// ============================================================
// mhgl — 全栈 Go 单体主入口(R55)
// 装配: config → store(SQLite 直连) → recovery(启动恢复) → auth → 采集管理器
//
//	→ http :3000(api + web + static)
//
// 优雅退出: SIGINT/SIGTERM → StopAll → 关闭 HTTP → 关库。
// ============================================================
package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"syscall"
	"time"

	"mhgl/internal/api"
	"mhgl/internal/auth"
	"mhgl/internal/bootstrap"
	"mhgl/internal/config"
	"mhgl/internal/crawl"
	"mhgl/internal/store"
	"mhgl/internal/web"
)

func main() {
	cfg := config.Load()
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)

	// ---- [R69-a] bootstrap 子命令: `mhgl bootstrap` ----
	// 幂等引导运行态数据(35 规则/16 分类/默认站点/三大部头任务), 不启动 HTTP。
	// 与 TS 原件 scripts/bootstrap-db.ts 同语义, 但直连 store: 无需服务在线/密码/bun。
	if len(os.Args) > 1 && os.Args[1] == "bootstrap" {
		runBootstrap(cfg)
		return
	}

	log.Printf("[mhgl] boot: port=%s db=%s prod=%v", cfg.Port, cfg.DBPath, cfg.IsProd)

	// 内存软顶(GOMEMLIMIT 同源口径 600MB)
	debug.SetMemoryLimit(int64(cfg.MemLimitMB) << 20)

	// ---- 数据层 ----
	if err := os.MkdirAll(filepath.Dir(cfg.DBPath), 0o755); err != nil {
		log.Fatalf("[mhgl] mkdir db dir: %v", err)
	}
	// [R69-a] 原生自举: 缺表自动补全(IF NOT EXISTS, 既有库空转, 毫秒级)。
	// 全新空库单二进制即可启动, 彻底移除 `bunx prisma db push` 外部依赖。
	if err := bootstrap.EnsureSchema(cfg.DBPath); err != nil {
		log.Fatalf("[mhgl] ensure schema: %v", err)
	}
	db, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("[mhgl] store open: %v", err)
	}

	// ---- 封面目录 ----
	if err := os.MkdirAll(cfg.CoverDir, 0o755); err != nil {
		log.Printf("[mhgl] warn: mkdir cover dir: %v", err)
	}

	// ---- 启动恢复: 上代进程遗留的 running 行收编为 paused(条件写, 等价 R54 清扫器收口) ----
	recoverOnBoot(db)

	// ---- 鉴权 ----
	authSvc := auth.NewService(cfg.AdminPassword, cfg.SessionSecret, cfg.IsProd)
	stopCh := make(chan struct{})
	authSvc.StartSweeper(stopCh)
	if cfg.AdminPassword == "" {
		log.Printf("[mhgl] ADMIN_PASSWORD 未配置: 生产 fail-closed, 后台登录将一律失败")
	} else if cfg.AdminPassword == auth.DefaultPassword {
		log.Printf("[mhgl] 使用编译期缺省密码(生产请在环境变量覆盖)")
	}

	// ---- 任务控制面(采集管理器, 回调桥直连 store: internal/crawl/bridge) ----
	mgrAny, mgrErr := crawl.NewManager(db)
	if mgrErr != nil {
		log.Fatalf("[mhgl] crawl manager: %v", mgrErr)
	}
	tasks, ok := mgrAny.(api.TaskController)
	if !ok {
		log.Fatalf("[mhgl] crawl manager 未实现 api.TaskController")
	}

	// ---- HTTP ----
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		var ms runtime.MemStats
		runtime.ReadMemStats(&ms)
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write([]byte(`{"ok":true,"app":"mhgl","engine":"go","rssMB":` +
			itoa64(int64(ms.Sys>>20)) + `,"uptimeMs":` + itoa64(time.Since(bootAt).Milliseconds()) + `}`))
	})
	api.Register(mux, api.Deps{DB: db, Auth: authSvc, Tasks: tasks, IsProd: cfg.IsProd, CookieSecure: cfg.CookieSecure})
	web.Register(mux, web.Deps{DB: db, Auth: authSvc})

	// 静态资源
	fs := http.FileServer(http.Dir("web/static"))
	mux.Handle("GET /static/", http.StripPrefix("/static/", cacheStatic(fs)))

	addr := net.JoinHostPort("", cfg.Port)
	srv := &http.Server{
		Addr:              addr,
		Handler:           logRequest(mux),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// [R69-a] 空库自动引导(后台执行不阻塞启动): 规则数为 0 视为全新部署,
	// 幂等补齐 35 规则/16 分类/默认站点/三大部头任务(不自动开采集)。
	// 设 MHGL_AUTO_SEED=0 可关闭(纯手动运维)。
	if os.Getenv("MHGL_AUTO_SEED") != "0" {
		go autoSeed(db)
	}

	go func() {
		log.Printf("[mhgl] listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("[mhgl] listen: %v", err)
		}
	}()

	// ---- 优雅退出 ----
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	log.Printf("[mhgl] 退出信号, 收割任务并关闭…")
	tasks.StopAll()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	close(stopCh)
	_ = db.Close()
	log.Printf("[mhgl] bye")
}

// runBootstrap `mhgl bootstrap` 子命令: EnsureSchema + Seed + 报告。
// 幂等引导运行态数据(35 规则/16 分类/默认站点/三大部头任务, 不自动开采集)。
func runBootstrap(cfg *config.Config) {
	if err := os.MkdirAll(filepath.Dir(cfg.DBPath), 0o755); err != nil {
		log.Fatalf("[bootstrap] mkdir db dir: %v", err)
	}
	if err := bootstrap.EnsureSchema(cfg.DBPath); err != nil {
		log.Fatalf("[bootstrap] ensure schema: %v", err)
	}
	db, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("[bootstrap] store open: %v", err)
	}
	rep, err := bootstrap.Seed(db)
	if err != nil {
		_ = db.Close()
		log.Fatalf("[bootstrap] seed: %v", err)
	}
	log.Printf("[bootstrap] done: rules +%d/upd%d(err=%d) categories +%d site=%v tasks +%d",
		rep.RulesCreated, rep.RulesUpdated, len(rep.RuleErrors), rep.CategoriesCreated, rep.SiteCreated, len(rep.TasksCreated))
	for _, e := range rep.RuleErrors {
		log.Printf("[bootstrap] rule error: %s", e)
	}
	if err := db.Close(); err != nil {
		log.Printf("[bootstrap] close: %v", err)
	}
}

// autoSeed 空库自动引导(服务启动后台执行; 幂等, 失败仅告警不阻断服务)。
func autoSeed(db *store.DB) {
	empty, err := bootstrap.IsEmpty(db)
	if err != nil {
		log.Printf("[mhgl] auto-seed check: %v", err)
		return
	}
	if !empty {
		return
	}
	log.Printf("[mhgl] 空库(规则 0 条) → 自动引导运行态(关闭: MHGL_AUTO_SEED=0)")
	rep, err := bootstrap.Seed(db)
	if err != nil {
		log.Printf("[mhgl] auto-seed: %v", err)
		return
	}
	log.Printf("[mhgl] auto-seed done: rules +%d/upd%d(err=%d) categories +%d site=%v tasks +%d",
		rep.RulesCreated, rep.RulesUpdated, len(rep.RuleErrors), rep.CategoriesCreated, rep.SiteCreated, len(rep.TasksCreated))
}

// recoverOnBoot running → paused(带 TaskLog 留痕; 任务可由控制面 resume)。
func recoverOnBoot(db *store.DB) {
	tasks, err := db.ListTasksByStatus("running")
	if err != nil {
		log.Printf("[mhgl] recovery list: %v", err)
		return
	}
	for _, t := range tasks {
		ok, err := db.UpdateTaskStatusIf(t.ID, "paused", "running")
		if err != nil {
			log.Printf("[mhgl] recovery %s: %v", t.ID, err)
			continue
		}
		if ok {
			_ = db.AppendTaskLog(t.ID, "warn", "服务重启: 任务由恢复机制收编为 paused, 可从控制面继续采集(断点续采)")
			log.Printf("[mhgl] recovery: task %s(%s) running→paused", t.ID, t.Name)
		}
	}
}

// logRequest 极简访问日志(慢请求/错误留痕, 全量日志走 dev.log)。
func logRequest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		if strings.HasPrefix(r.URL.Path, "/static/") || strings.HasPrefix(r.URL.Path, "/api/public/cover") {
			return // 高频低价值路径不逐条刷屏
		}
		log.Printf("[http] %s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}

func cacheStatic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=3600")
		next.ServeHTTP(w, r)
	})
}

var bootAt = time.Now()

func itoa64(n int64) string {
	if n <= 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
