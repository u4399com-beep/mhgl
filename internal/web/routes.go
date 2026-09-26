// ============================================================
// 3-c 路由注册 — 前台 SSR + 后台管理页 + SEO 静态面 + PWA
// 路由面口径对齐 PLAN §2(查询串路由保留 / 伪静态 /book/{num}.html /read/... /p/{slug}.html)
// ============================================================
package web

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path"
)

func registerRoutes(mux *http.ServeMux, d Deps) {
	// [R70-c] 内容伪装配置读取钩子(启动期单次注入; DB 缺键/读错 → 空串走默认)
	registerStealthSettings(func(key string) string {
		v, ok, err := d.DB.GetSetting(key)
		if err != nil || !ok {
			return ""
		}
		return v
	})

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

	// ---- PWA(R56-2c) ----
	mux.HandleFunc("GET /manifest.webmanifest", serveWebStatic("manifest.webmanifest", "application/manifest+json; charset=utf-8", 300))
	mux.HandleFunc("GET /sw.js", serveWebStatic("sw.js", "text/javascript; charset=utf-8", 0))
	mux.HandleFunc("GET /offline.html", serveWebStatic("offline.html", "text/html; charset=utf-8", 0))
	mux.HandleFunc("GET /favicon.ico", serveWebStatic("icons/icon-192.png", "image/png", 3600))

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

// staticRoot 静态资源根(与 cmd/server http.Dir("web/static") 同口径, 进程工作目录相对)。
const staticRoot = "web/static"

// serveWebStatic PWA 根路径静态件(注册于固定字面路径, 无用户输入 → 无路径遍历面)。
// maxAge<=0 → no-cache(sw.js/离线页要求浏览器每次校验); 文件缺失 → 404 纯文本。
func serveWebStatic(name, ctype string, maxAge int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fp := path.Join(staticRoot, name)
		f, err := os.Open(fp)
		if err != nil {
			log.Printf("[web] static asset missing: %s (%v)", name, err)
			http.NotFound(w, r)
			return
		}
		defer func() { _ = f.Close() }()
		st, err := f.Stat()
		if err != nil || st.IsDir() {
			http.NotFound(w, r)
			return
		}
		if maxAge > 0 {
			w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d", maxAge)) // [R69-c] 修前硬编码 3600 无视 maxAge 参数(manifest 300 形同虚设)
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		w.Header().Set("Content-Type", ctype)
		http.ServeContent(w, r, path.Base(name), st.ModTime(), f)
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
