// ============================================================
// Web/SSR 注册点(主控所有: agent 3-c 在本包新增自有 handler 与模板, 不改本文件)
// ============================================================
package web

import (
	"net/http"

	"mhgl/internal/auth"
	"mhgl/internal/store"
)

// Deps Web 层依赖集。
type Deps struct {
	DB   *store.DB
	Auth *auth.Service // 后台页登录门
}

// Register 挂载前台与后台页面路由 + 静态资源。
// 3-c 追加: 前台 SSR(/、/?view=...、/book/{num}.html、/read/...、/p/{slug}.html)
// 与后台页(/admin*、后台各分区页)。
func Register(mux *http.ServeMux, d Deps) {
	// 3-c 接管: 占位冒烟页已由 routes.go 的 registerRoutes 替换
	registerRoutes(mux, d)
}
