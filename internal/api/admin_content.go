// ============================================================
// R55-3b — 内容 SEO 面: PSEO / 违禁词 / SEO 模板 / 主题 / SEO 审计
// (简化档: 高级分析返回空态; 记 PARITY)
// ============================================================
package api

import (
	"crypto/sha1"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"mhgl/internal/store"
)

// ---------------- pseo ----------------

// (d Deps) adminPseoList GET /api/admin/pseo?page&size
func (d Deps) adminPseoList(w http.ResponseWriter, r *http.Request) {
	page0, size := pageClamp(r.URL.Query(), 1, 20, 50)
	total, err := d.DB.Count(`SELECT count(*) FROM "PseoPage"`)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	page := minInt(page0, lastPage(total, size))
	list, err := d.DB.QueryMaps(`SELECT p.*, b.name AS primaryBookName FROM "PseoPage" p
LEFT JOIN "Book" b ON b.id=p.primaryBookId ORDER BY p.updatedAt DESC LIMIT ? OFFSET ?`,
		size, (page-1)*size)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	for _, row := range list {
		row["primaryBook"] = map[string]any{"name": row["primaryBookName"]}
		delete(row, "primaryBookName")
	}
	apiOK(w, map[string]any{"total": total, "page": page, "size": size, "items": list, "stats": d.pseoStats()})
}

// pseoStats PSEO 统计(对齐 getPseoStats 字段)。
func (d Deps) pseoStats() map[string]any {
	total, _ := d.DB.Count(`SELECT count(*) FROM "PseoPage"`)
	active, _ := d.DB.Count(`SELECT count(*) FROM "PseoPage" WHERE status='active'`)
	disabled, _ := d.DB.Count(`SELECT count(*) FROM "PseoPage" WHERE status='disabled'`)
	sourceTemplate, _ := d.DB.Count(`SELECT count(*) FROM "PseoPage" WHERE source='template'`)
	sourceSuggest, _ := d.DB.Count(`SELECT count(*) FROM "PseoPage" WHERE source='suggest'`)
	booksCovered, _ := d.DB.Count(`SELECT count(DISTINCT primaryBookId) FROM "PseoPage" WHERE primaryBookId IS NOT NULL`)
	sitesEnabled, _ := d.DB.Count(`SELECT count(DISTINCT siteId) FROM "PseoPage" WHERE siteId IS NOT NULL`)
	return map[string]any{
		"total": total, "active": active, "disabled": disabled,
		"sourceTemplate": sourceTemplate, "sourceSuggest": sourceSuggest,
		"booksCovered": booksCovered, "sitesEnabled": sitesEnabled,
	}
}

// (d Deps) adminPseoGenerate POST /api/admin/pseo — 生成(库内词: keywords+BookTag)
// 简化档: useLiveSuggest 实时下拉词抓取未迁移(外部 suggest 引擎退役), 仅库内词。
func (d Deps) adminPseoGenerate(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	perBook := clampIntOf(body["perBook"], 10, 1, 30)
	var bookIDs []string
	if ids, ok := body["bookIds"].([]any); ok {
		for _, v := range ids {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				bookIDs = append(bookIDs, strings.TrimSpace(s))
				if len(bookIDs) >= 200 {
					break
				}
			}
		}
	}
	useAll := body["all"] == true || len(bookIDs) == 0
	if !useAll && len(bookIDs) == 0 {
		apiErr(w, http.StatusBadRequest, "指定的书籍 id 均无效")
		return
	}
	q := `SELECT id,name,author,categoryId,intro,status,keywords,wordCount FROM "Book"`
	var args []any
	if !useAll {
		q += ` WHERE id IN (` + strings.TrimSuffix(strings.Repeat("?,", len(bookIDs)), ",") + `)`
		for _, id := range bookIDs {
			args = append(args, id)
		}
	}
	q += ` ORDER BY wordCount DESC LIMIT 500`
	books, err := d.DB.QueryMaps(q, args...)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	site, _, _ := d.DB.DefaultSite()
	siteID := any(nil)
	if site != nil {
		siteID = site["id"]
	}
	generated, skippedExisting, scanned := 0, 0, 0
	for _, b := range books {
		scanned++
		bid := store.ToStr(b["id"])
		// 关键词候选: Book.keywords 逗号拆分 + BookTag 下拉词(perBook 上限)
		cands := []string{}
		seen := map[string]bool{}
		add := func(kw string) {
			kw = normalizeKeyword(kw)
			if kw == "" || seen[kw] || len(cands) >= perBook {
				return
			}
			seen[kw] = true
			cands = append(cands, kw)
		}
		for _, part := range strings.Split(store.ToStr(b["keywords"]), ",") {
			add(part)
		}
		if len(cands) < perBook {
			tags, _ := d.DB.QueryMaps(`SELECT tag FROM "BookTag" WHERE bookId=? ORDER BY hits DESC LIMIT ?`, bid, perBook)
			for _, t := range tags {
				add(store.ToStr(t["tag"]))
			}
		}
		for _, kw := range cands {
			// keyword 全站唯一 → 已存在跳过
			if _, ok2, _ := d.DB.QueryMap(`SELECT id FROM "PseoPage" WHERE keyword=?`, kw); ok2 {
				skippedExisting++
				continue
			}
			slug := pseoSlugOf(kw)
			title := kw + "_" + store.ToStr(b["name"])
			description := kw + "小说免费阅读 —《" + store.ToStr(b["name"]) + "》" + store.ToStr(b["author"]) + " 作品, 全本在线阅读。"
			matched, _ := json.Marshal([]string{bid})
			if _, err := d.DB.Exec(`INSERT INTO "PseoPage" (id,siteId,keyword,slug,title,description,keywords,primaryBookId,matchedBookIds,status,source,createdAt,updatedAt)
VALUES (?,?,?,?,?,?,?,?,?,'active','suggest',?,?)`,
				d.DB.NewID(), siteID, kw, slug, title, description, kw+","+store.ToStr(b["name"]), bid, string(matched), store.NowMS(), store.NowMS()); err == nil {
				generated++
			} else {
				skippedExisting++
			}
		}
	}
	apiOK(w, map[string]any{
		"generated": generated, "skippedExisting": skippedExisting, "booksScanned": scanned,
		"liveBooks": 0, "cappedByRunLimit": false, "stats": d.pseoStats(),
	})
}

// normalizeKeyword 关键词归一(trim/压空白/截断 60)。
func normalizeKeyword(kw string) string {
	kw = strings.Join(strings.Fields(kw), " ")
	kw = strings.TrimSpace(kw)
	return truncateRunes(kw, 60)
}

// pseoSlugOf slug = CJK 保留 + 其余安全化 + 短哈希后缀(防碰撞)。
func pseoSlugOf(kw string) string {
	var b strings.Builder
	for _, r := range kw {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r > 127:
			b.WriteRune(r)
		default:
			b.WriteRune('-')
		}
	}
	base := strings.Trim(b.String(), "-")
	if base == "" {
		base = "kw"
	}
	base = truncateRunes(base, 40)
	h := fmt.Sprintf("%x", sha1.Sum([]byte(kw)))[:8]
	return base + "-" + h
}

// (d Deps) adminPseoUpdate PUT /api/admin/pseo/{id} — 基础 CRUD(PseoPage 局部更新)
func (d Deps) adminPseoUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "PseoPage" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "页面不存在或已被删除")
		return
	}
	sets := []string{"updatedAt=?"}
	args := []any{store.NowMS()}
	for _, k := range []string{"title", "description", "keywords"} {
		if v, has := body[k]; has {
			sets, args = append(sets, k+"=?"), append(args, strOf(v, 500))
		}
	}
	if v, has := body["status"]; has {
		st := strOf(v, 20)
		if st != "active" && st != "disabled" {
			apiErr(w, http.StatusBadRequest, "状态值不合法(active|disabled)")
			return
		}
		sets, args = append(sets, "status=?"), append(args, st)
	}
	args = append(args, id)
	if _, err := execUpdate(d, `UPDATE "PseoPage" SET `+strings.Join(sets, ", ")+` WHERE id=?`, args); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	row, _, _ := d.DB.QueryMap(`SELECT * FROM "PseoPage" WHERE id=?`, id)
	apiOK(w, row)
}

// (d Deps) adminPseoDelete DELETE /api/admin/pseo/{id}
func (d Deps) adminPseoDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		apiErr(w, http.StatusBadRequest, "缺少 id")
		return
	}
	res, err := d.DB.Exec(`DELETE FROM "PseoPage" WHERE id=?`, id)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		apiErr(w, http.StatusNotFound, "页面不存在或已被删除")
		return
	}
	apiOK(w, map[string]any{"deleted": true, "id": id})
}

// (d Deps) adminPseoWipe DELETE /api/admin/pseo?confirm=wipe
func (d Deps) adminPseoWipe(w http.ResponseWriter, r *http.Request) {
	confirm := r.URL.Query().Get("confirm")
	if confirm == "" {
		body := readBodyMap(w, r, 0)
		if !bodyOK(body) {
			return
		}
		confirm = strOf(body["confirm"], 10)
	}
	if confirm != "wipe" {
		apiErr(w, http.StatusBadRequest, "缺少 confirm:'wipe', 已拒绝清空")
		return
	}
	res, err := d.DB.Exec(`DELETE FROM "PseoPage"`)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	n, _ := res.RowsAffected()
	apiOK(w, map[string]any{"deleted": n})
}

// ---------------- banned-words ----------------

// (d Deps) adminBannedWordsGet GET /api/admin/banned-words
func (d Deps) adminBannedWordsGet(w http.ResponseWriter, r *http.Request) {
	apiOK(w, d.bannedWordsConfig())
}

func (d Deps) bannedWordsConfig() map[string]any {
	def := map[string]any{"enabled": false, "mode": "mask", "words": []any{}}
	if raw, ok, _ := d.DB.GetSetting("bannedWords"); ok {
		var m map[string]any
		if json.Unmarshal([]byte(raw), &m) == nil && m != nil {
			mode := "mask"
			if m["mode"] == "remove" {
				mode = "remove"
			}
			words := []any{}
			if arr, ok := m["words"].([]any); ok {
				for _, w := range arr {
					if s, ok := w.(string); ok && s != "" {
						words = append(words, truncateRunes(s, 50))
						if len(words) >= 500 {
							break
						}
					}
				}
			}
			enabled := false
			if b, ok := m["enabled"].(bool); ok {
				enabled = b
			}
			return map[string]any{"enabled": enabled, "mode": mode, "words": words}
		}
	}
	return def
}

// (d Deps) adminBannedWordsPut PUT /api/admin/banned-words
func (d Deps) adminBannedWordsPut(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	mode := "mask"
	if body["mode"] == "remove" {
		mode = "remove"
	}
	words := []string{}
	seen := map[string]bool{}
	if arr, ok := body["words"].([]any); ok {
		for _, w := range arr {
			s, ok := w.(string)
			if !ok {
				continue
			}
			s = truncateRunes(s, 50)
			if s == "" || seen[strings.ToLower(s)] {
				continue
			}
			seen[strings.ToLower(s)] = true
			words = append(words, s)
			if len(words) >= 500 {
				break
			}
		}
	}
	enabled := body["enabled"] == true
	if enabled && len(words) == 0 {
		apiErr(w, http.StatusBadRequest, "词表为空：请至少填写一个违禁词，或先关闭过滤开关")
		return
	}
	cfg := map[string]any{"enabled": enabled, "mode": mode, "words": words}
	b, _ := json.Marshal(cfg)
	if err := d.DB.SetSetting("bannedWords", string(b)); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	invalidateBannedWordsCache() // 对齐 TS 保存即失效钩子(banned-words-server.ts)
	apiOK(w, cfg)
}

// ---------------- seo-templates ----------------

// defaultSeoTplSet 对齐 seo-tpl.ts DEFAULT_SEO_TEMPLATES。
var defaultSeoTplSet = map[string]any{
	"book": map[string]any{
		"title":       "{bookname}_{author}小说全文免费阅读 - {sitename}",
		"description": "《{bookname}》是{author}创作的{category}小说，{statusText}。{intro}《{bookname}》在{sitename}提供全文免费在线阅读。",
		"keywords":    "{bookname},{bookname}小说,{bookname}全文阅读,{bookname}免费阅读,{author},{author}小说,{category}小说",
	},
	"toc": map[string]any{
		"title":       "{bookname}目录_全部章节列表 - {sitename}",
		"description": "《{bookname}》{statusText}，共{chapterCount}章。{sitename}为您整理{bookname}全部章节目录，持续更新，免费在线阅读。",
	},
	"chapter": map[string]any{
		"title":       "{bookname}_{chaptername} - {sitename}",
		"description": "《{bookname}》{chaptername}在线阅读：{excerpt}……{sitename}提供{bookname}最新章节免费无弹窗阅读。",
		"keywords":    "{bookname},{bookname}最新章节,{chaptername},{bookname}{chaptername},{bookname}无弹窗",
	},
}

func sanitizeSeoTpl(raw map[string]any) map[string]any {
	out := map[string]any{}
	for section, defAny := range defaultSeoTplSet {
		def := defAny.(map[string]any)
		m := map[string]any{}
		sec, _ := raw[section].(map[string]any)
		for field, defVal := range def {
			v := defVal
			if sec != nil {
				if s, ok := sec[field].(string); ok && strings.TrimSpace(s) != "" && strings.Contains(s, "{") {
					v = s
				}
			}
			m[field] = v
		}
		out[section] = m
	}
	return out
}

// (d Deps) adminSeoTemplatesGet GET /api/admin/seo-templates
func (d Deps) adminSeoTemplatesGet(w http.ResponseWriter, r *http.Request) {
	tpl := deepCopyMap(defaultSeoTplSet)
	customized := false
	if raw, ok, _ := d.DB.GetSetting("seoTemplates"); ok {
		var m map[string]any
		if json.Unmarshal([]byte(raw), &m) == nil && len(m) > 0 {
			customized = true
			merged := sanitizeSeoTpl(m)
			tpl = merged
		}
	}
	apiOK(w, map[string]any{"customized": customized, "tpl": tpl})
}

func deepCopyMap(src map[string]any) map[string]any {
	b, _ := json.Marshal(src)
	var out map[string]any
	_ = json.Unmarshal(b, &out)
	return out
}

// (d Deps) adminSeoTemplatesPut PUT /api/admin/seo-templates
func (d Deps) adminSeoTemplatesPut(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	raw, ok := body["tpl"].(map[string]any)
	if !ok {
		raw = body
	}
	tpl := sanitizeSeoTpl(raw)
	defB, _ := json.Marshal(defaultSeoTplSet)
	tplB, _ := json.Marshal(tpl)
	value := string(tplB)
	isDefault := string(defB) == value
	if isDefault {
		value = "{}"
	}
	if err := d.DB.SetSetting("seoTemplates", value); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, map[string]any{"saved": true, "customized": !isDefault, "tpl": tpl})
}

// ---------------- themes ----------------

// themeCatalog 静态主题清单(对齐 themes.ts THEMES 注册表 id/name; 仅清单档)。
var themeCatalog = []map[string]any{
	{"id": "aijjxs", "name": "久久小说(克隆)", "desc": "久久小说布局克隆(默认主题)"},
	{"id": "pili", "name": "霹雳书屋(克隆)", "desc": "霹雳书屋布局克隆"},
	{"id": "kks101", "name": "101看書(克隆)", "desc": "101看書布局克隆"},
	{"id": "qb23", "name": "铅笔小说(克隆)", "desc": "铅笔小说布局克隆"},
	{"id": "ddyueshu", "name": "顶点小说(克隆)", "desc": "顶点小说布局克隆"},
	{"id": "x2552", "name": "吾爱文学(克隆)", "desc": "吾爱文学布局克隆"},
	{"id": "huangjinwu", "name": "黄金屋(克隆)", "desc": "黄金屋布局克隆"},
	{"id": "ggd66", "name": "格格党(克隆)", "desc": "格格党布局克隆"},
	{"id": "shipsay", "name": "船说CMS(克隆)", "desc": "船说CMS布局克隆"},
	{"id": "trxsw", "name": "唐人小说(克隆)", "desc": "唐人小说布局克隆"},
	{"id": "x33yq", "name": "33言情(克隆)", "desc": "33言情布局克隆"},
}

// (d Deps) adminThemesList GET /api/admin/themes(静态清单; q 过滤)
func (d Deps) adminThemesList(w http.ResponseWriter, r *http.Request) {
	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	items := make([]map[string]any, 0, len(themeCatalog))
	for _, t := range themeCatalog {
		if q != "" &&
			!strings.Contains(strings.ToLower(strOf(t["id"], 50)), q) &&
			!strings.Contains(strings.ToLower(strOf(t["name"], 50)), q) &&
			!strings.Contains(strings.ToLower(strOf(t["desc"], 200)), q) {
			continue
		}
		items = append(items, t)
	}
	apiOK(w, items)
}

// (d Deps) adminThemesOverrideGet GET /api/admin/themes/override(Setting KV 形态)
func (d Deps) adminThemesOverrideGet(w http.ResponseWriter, r *http.Request) {
	out := map[string]any{}
	if raw, ok, _ := d.DB.GetSetting("theme_overrides"); ok {
		var m map[string]any
		if json.Unmarshal([]byte(raw), &m) == nil && m != nil {
			out = m
		}
	}
	apiOK(w, out)
}

// (d Deps) adminThemesOverridePut PUT /api/admin/themes/override
func (d Deps) adminThemesOverridePut(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	if !isPlainObj(body) {
		apiErr(w, http.StatusBadRequest, "覆盖配置必须是对象")
		return
	}
	b, err := json.Marshal(body)
	if err != nil {
		apiErr(w, http.StatusBadRequest, "覆盖配置不可序列化")
		return
	}
	if err := d.DB.SetSetting("theme_overrides", string(b)); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, body)
}

// ---------------- seo-audit(简化档空态) ----------------

// (d Deps) adminSeoAudit GET/POST /api/admin/seo-audit — 简化档: 高级分析未迁移, 空态返回。
func (d Deps) adminSeoAudit(w http.ResponseWriter, r *http.Request) {
	apiOK(w, map[string]any{
		"issues": []any{}, "scannedAt": store.NowMS(),
		"note": "简化档: SEO 深度审计未迁移(Go 单体), 高级分析返回空态",
	})
}

// execUpdate 小包装(防 vet 对未用返回值告警)。
func execUpdate(d Deps, q string, args []any) (int64, error) {
	res, err := d.DB.Exec(q, args...)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
