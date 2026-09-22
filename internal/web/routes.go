// ============================================================
// 3-c 路由注册 — 前台 SSR + 后台管理页 + SEO 静态面
// 路由面口径对齐 PLAN §2(查询串路由保留 / 伪静态 /book/{num}.html /read/... /p/{slug}.html)
// ============================================================
package web

import (
	"net/http"
)

func registerRoutes(mux *http.ServeMux, d Deps) {
	// ---- 前台(查询串路由 + /{$}) ----
	mux.HandleFunc("GET /{$}", d.handleRoot)

	// 伪静态: /book/{num}[.html] — {num} 段含 ".html" 后缀由 handler 剥离
	mux.HandleFunc("GET /book/{num}", d.handleBookPretty)
	// /read/... 全形态(parsePrettyPath 口径): /read/{b}/{c}.html | /read/{b}_{c}.html | /read/{b}/ → 目录
	mux.HandleFunc("GET /read/{rest...}", d.handleReadPretty)
	// PSEO 关键词落地页 /p/{slug}[.html]
	mux.HandleFunc("GET /p/{slug}", d.handlePseo)

	// SEO 静态面
	mux.HandleFunc("GET /robots.txt", d.handleRobots)
	mux.HandleFunc("GET /sitemap.xml", d.handleSitemap)

	// 全局兜底 404(其余未匹配路径 → 美观 404; 更具体模式优先, /api/ 未匹配保持纯文本)
	mux.HandleFunc("GET /{rest...}", d.handleNotFoundPretty)

	// ---- 后台管理页(登录门: 未登录 302 → /admin/login) ----
	mux.HandleFunc("GET /admin", d.adminGuard(d.handleAdminHome))
	mux.HandleFunc("GET /admin/{$}", d.adminGuard(d.handleAdminHome))
	mux.HandleFunc("GET /admin/login", d.handleAdminLogin)
	for _, sec := range adminSections {
		mux.HandleFunc("GET /admin/"+sec.path, d.adminGuard(func(w http.ResponseWriter, r *http.Request) {
			d.handleAdminSection(w, r, sec)
		}))
	}
}

// adminSection 后台分区定义(左侧导航即此清单; 渲染 admin/sections/{key}.html)。
type adminSection struct {
	key   string // 模板名/JS 分发键
	path  string // URL 路径段
	label string
}

var adminSections = []adminSection{
	{"dashboard", "dashboard", "仪表盘"},
	{"tasks", "tasks", "采集任务"},
	{"rules", "rules", "采集规则"},
	{"proxy", "proxy", "代理池"},
	{"books", "books", "书籍管理"},
	{"categories", "categories", "分类管理"},
	{"sites", "sites", "站群系统"},
	{"links", "links", "友链链轮"},
	{"downloads", "downloads", "TXT下载"},
	{"settings", "settings", "系统设置"},
	{"feedback", "feedback", "用户反馈"},
	{"backup", "backup", "数据备份"},
}
