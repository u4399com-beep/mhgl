// ============================================================
// crawler-go 主进程 — 契约 §1 HTTP 壳
//
//	监听 127.0.0.1:3032(GO_PORT env 可覆盖), 后端对后端直连不经网关。
//	路由: /health /capability /task/start /task/{id}/control /task/{id}/status /tasks
//	错误统一 {ok:false, error:string}; 成功 {ok:true, ...}
//	进程内存策略: GOMEMLIMIT=600MiB(软顶, 由 run.sh 环境注入)
//
// ============================================================
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"crawler-go/internal/rule"
	"crawler-go/internal/task"
)

const (
	engineName    = "go"
	engineVersion = "1.0.0"
	defaultPort   = "3032"
	// 请求体上限 64MB: 规则 JSON(百 KB 级) + bookIds 10 万级列表(约 2MB)安全余量
	maxBodyBytes = 64 << 20
)

func main() {
	mgr := task.NewManager()
	mux := http.NewServeMux()
	registerRoutes(mux, mgr)

	port := envOr("GO_PORT", defaultPort)
	host := envOr("GO_HOST", "127.0.0.1") // 契约: 浏览器永不直连, 仅回环监听
	addr := host + ":" + port

	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		// 不设 WriteTimeout: /task/start 处理是毫秒级, 但保守留长尾(慢客户端由 Next.js 侧超时兜底)
	}

	// 优雅退出: SIGINT/SIGTERM → 停止接受新请求 → 退出(任务态丢弃属契约语义:
	// "Go 进程重启后任务态丢失, Next.js 重发 start 等价断点续采")
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		log.Printf("[crawler-go] 收到退出信号, 关闭 HTTP 服务")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
	}()

	log.Printf("[crawler-go] 引擎 %s v%s 监听 http://%s (GOMEMLIMIT 软顶见启动脚本)", engineName, engineVersion, addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("[crawler-go] HTTP 服务退出: %v", err)
	}
	log.Printf("[crawler-go] 已退出")
}

// registerRoutes 注册契约 §1 全部路由
func registerRoutes(mux *http.ServeMux, mgr *task.Manager) {
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		running, paused := mgr.Counts()
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"ok":       true,
			"engine":   engineName,
			"version":  engineVersion,
			"tasks":    map[string]int{"running": running, "paused": paused},
			"rssMB":    task.RSSMB(),
			"uptimeMs": mgr.UptimeMs(),
		})
	})

	// 规则子集校验: unsupported 非空时 Next.js 回退 TS 引擎(契约 §4)
	mux.HandleFunc("POST /capability", func(w http.ResponseWriter, r *http.Request) {
		body, ok := readBody(w, r)
		if !ok {
			return
		}
		var cfg rule.RuleConfig
		if err := json.Unmarshal(body, &cfg); err != nil {
			writeErr(w, http.StatusBadRequest, "RuleConfig JSON 解析失败: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"ok":          true,
			"unsupported": cfg.Unsupported(),
		})
	})

	// 任务启动: 幂等约束 —— 同 taskId running/paused 时 409(契约 §1)
	mux.HandleFunc("POST /task/start", func(w http.ResponseWriter, r *http.Request) {
		body, ok := readBody(w, r)
		if !ok {
			return
		}
		var payload rule.TaskStartPayload
		if err := json.Unmarshal(body, &payload); err != nil {
			writeErr(w, http.StatusBadRequest, "TaskStartPayload JSON 解析失败: "+err.Error())
			return
		}
		if err := mgr.Start(payload); err != nil {
			if errors.Is(err, task.ErrTaskExists) {
				writeErr(w, http.StatusConflict, "task already exists")
				return
			}
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true})
	})

	// 控制面: pause/resume/stop
	mux.HandleFunc("POST /task/{id}/control", func(w http.ResponseWriter, r *http.Request) {
		body, ok := readBody(w, r)
		if !ok {
			return
		}
		var req struct {
			Action string `json:"action"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			writeErr(w, http.StatusBadRequest, "control 请求体解析失败: "+err.Error())
			return
		}
		id := r.PathValue("id")
		status, err := mgr.Control(strings.TrimSpace(id), strings.TrimSpace(req.Action))
		if err != nil {
			writeErr(w, http.StatusNotFound, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "status": status})
	})

	// 任务状态: 不存在时 {ok:true, exists:false}(契约 §1)
	mux.HandleFunc("GET /task/{id}/status", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		info := mgr.Status(strings.TrimSpace(id))
		resp := map[string]interface{}{
			"ok":          true,
			"exists":      info.Exists,
			"running":     info.Running,
			"phase":       info.Phase,
			"progress":    info.Progress,
			"stats":       info.Stats,
			"rssMB":       info.RssMB,
			"startedAtMs": info.StartedAtMs,
		}
		if info.LastError != "" {
			resp["lastError"] = info.LastError
		}
		writeJSON(w, http.StatusOK, resp)
	})

	// 调试面: 任务列表
	mux.HandleFunc("GET /tasks", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"ok":    true,
			"tasks": mgr.List(),
		})
	})
}

// ---------------- HTTP 辅助 ----------------

// readBody 读请求体(限 64MB); 失败时已写响应
func readBody(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			writeErr(w, http.StatusBadRequest, fmt.Sprintf("请求体超限(%d bytes)", mbe.Limit))
			return nil, false
		}
		writeErr(w, http.StatusBadRequest, "读取请求体失败: "+err.Error())
		return nil, false
	}
	if len(body) == 0 {
		writeErr(w, http.StatusBadRequest, "请求体为空")
		return nil, false
	}
	return body, true
}

// envOr 环境变量缺省取值
func envOr(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

// writeJSON 统一 JSON 响应
func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

// writeErr 统一错误形态 {ok:false, error}
func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]interface{}{"ok": false, "error": msg})
}
