// ============================================================
// R65-b — 站点智能 TDK 配置 API(18 套 SEO 预设勾选 + 页类型策略)
//
//	GET /api/admin/sites/{id}/tdk → {siteId, config, presets}
//	    config = Site.smartTdk 消毒后配置(未配置 = enabled:false 全 off);
//	    presets = 18 套预设元信息+示例预览(smart 包单一事实源, UI 免复制)。
//	PUT /api/admin/sites/{id}/tdk → body {enabled,sets,pages,templates?}
//	    → 消毒(smart.ParseSiteCfg) → 写 Site.smartTdk(仅动本列+updatedAt,
//	    不碰主题/域名等既有列) → 回读响应。
//
// 与既有 PUT /api/admin/sites/{id}(adminSiteUpdate)完全解耦 —— 不改任何既有 handler。
// ============================================================
package api

import (
	"encoding/json"
	"net/http"

	"mhgl/internal/crawl/smart"
	"mhgl/internal/store"
)

// (d Deps) adminSiteTdkGet GET /api/admin/sites/{id}/tdk
func (d Deps) adminSiteTdkGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	site, ok, _ := d.DB.QueryMap(`SELECT * FROM "Site" WHERE id=?`, id)
	if !ok {
		apiErr(w, http.StatusNotFound, "站点不存在")
		return
	}
	cfg := smart.ParseSiteCfg(store.ToStr(site["smartTdk"]))
	apiOK(w, map[string]any{
		"siteId":  id,
		"site":    map[string]any{"id": site["id"], "name": site["name"], "domain": site["domain"], "themeId": site["themeId"]},
		"config":  cfg,
		"presets": smart.TDKPresets(),
	})
}

// (d Deps) adminSiteTdkPut PUT /api/admin/sites/{id}/tdk
func (d Deps) adminSiteTdkPut(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Site" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "站点不存在")
		return
	}
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	raw, err := json.Marshal(body)
	if err != nil {
		apiErr(w, http.StatusBadRequest, "请求体非法")
		return
	}
	cfg := smart.ParseSiteCfg(string(raw))
	if cfg.Enabled && len(cfg.Sets) == 0 {
		apiErr(w, http.StatusBadRequest, "开启智能 TDK 前请至少勾选一套预设模板")
		return
	}
	saved, err := json.Marshal(cfg)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if _, err := d.DB.Exec(`UPDATE "Site" SET smartTdk=?, updatedAt=? WHERE id=?`, string(saved), store.NowMS(), id); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, cfg)
}
