// ============================================================
// 后台管理页 handlers — 服务端渲染多页 + 原生 JS fetch 调 /api/**(3-b 并行端点)
//
//	登录门: d.Auth.Check(r) 失败 → 302 /admin/login; 登录页渲染 preview-hint
//	分区页: SSR 壳(导航/容器/三态容器), 数据由 /static/js/admin.js 拉取渲染
//
// ============================================================
package web

import (
	"net/http"
)

// adminGuard 后台登录门(未登录 302 → /admin/login)。
func (d Deps) adminGuard(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !d.Auth.Check(r) {
			http.Redirect(w, r, "/admin/login", http.StatusFound)
			return
		}
		next(w, r)
	}
}

// adminBaseData 后台公共数据(分区导航/当前分区)。
func adminBaseData(current string) map[string]any {
	secs := make([]map[string]any, 0, len(adminSections))
	for _, s := range adminSections {
		secs = append(secs, map[string]any{"Key": s.key, "Path": s.path, "Label": s.label})
	}
	label := ""
	for _, s := range adminSections {
		if s.key == current {
			label = s.label
		}
	}
	return map[string]any{
		"Sections": secs,
		"Current":  current,
		"Label":    label,
	}
}

// handleAdminHome /admin → 仪表盘(已登录)。
func (d Deps) handleAdminHome(w http.ResponseWriter, r *http.Request) {
	data := adminBaseData("dashboard")
	data["Head"] = map[string]any{"Title": "仪表盘 - mhgl 后台"}
	render(w, "admin", data)
}

// handleAdminLogin 登录页(已登录 → /admin)。
func (d Deps) handleAdminLogin(w http.ResponseWriter, r *http.Request) {
	if d.Auth.Check(r) {
		http.Redirect(w, r, "/admin", http.StatusFound)
		return
	}
	data := map[string]any{
		"Sections":    []map[string]any{},
		"Current":     "login",
		"Label":       "登录",
		"PreviewHint": d.Auth.PreviewHintPassword(),
		"Head":        map[string]any{"Title": "登录 - mhgl 后台"},
	}
	render(w, "login", data)
}

// handleAdminSection 分区页(渲染 admin/sections/{key}.html)。
func (d Deps) handleAdminSection(w http.ResponseWriter, r *http.Request, sec adminSection) {
	data := adminBaseData(sec.key)
	data["Head"] = map[string]any{"Title": sec.label + " - mhgl 后台"}
	render(w, "admin:"+sec.key, data)
}
