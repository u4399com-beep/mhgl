// ============================================================
// R55-3b — 分类/站点/友链 管理(移植 categories/* + sites/* + links/*)
//
//	GET/POST /api/admin/categories; PUT/DELETE /api/admin/categories/{id}
//	POST /api/admin/categories/batch (delete|order); POST .../consolidate
//	GET/POST /api/admin/sites; PUT/DELETE /api/admin/sites/{id}
//	POST /api/admin/sites/batch (delete|theme|offset|wheel); POST .../auto-tdk
//	GET/POST/PUT/DELETE /api/admin/links; POST /api/admin/links/batch
//
// ============================================================
package api

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"mhgl/internal/store"
)

// ---------------- categories ----------------

// (d Deps) adminCategoriesList GET /api/admin/categories
func (d Deps) adminCategoriesList(w http.ResponseWriter, r *http.Request) {
	rows, err := d.DB.QueryMaps(`SELECT c.*, (SELECT count(*) FROM "Book" b WHERE b.categoryId=c.id) AS bookCount
FROM "Category" c ORDER BY c.sortOrder ASC LIMIT 500`)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	for _, row := range rows {
		row["_count"] = map[string]any{"books": row["bookCount"]}
		delete(row, "bookCount")
	}
	apiOK(w, rows)
}

// (d Deps) adminCategoriesCreate POST /api/admin/categories
func (d Deps) adminCategoriesCreate(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	name := strings.TrimSpace(strOf(body["name"], 50))
	if name == "" {
		apiErr(w, http.StatusBadRequest, "分类名必填")
		return
	}
	defSort := d.DB.APICategoryMaxSortOrder() + 1
	sortOrder := clampIntOf(body["sortOrder"], defSort, 0, 1_000_000)
	id, err := d.DB.APIUpsertCategoryByName(name, sortOrder)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	row, _, _ := d.DB.QueryMap(`SELECT * FROM "Category" WHERE id=?`, id)
	apiOK(w, row)
}

// (d Deps) adminCategoryUpdate PUT /api/admin/categories/{id}
func (d Deps) adminCategoryUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Category" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "分类不存在")
		return
	}
	sets := []string{}
	var args []any
	if v, has := body["name"]; has {
		name := strings.TrimSpace(strOf(v, 50))
		if name == "" {
			apiErr(w, http.StatusBadRequest, "分类名不能为空")
			return
		}
		sets, args = append(sets, "name=?"), append(args, name)
	}
	if v, has := body["sortOrder"]; has {
		sets, args = append(sets, "sortOrder=?"), append(args, int64(clampIntOf(v, 0, 0, 1_000_000)))
	}
	if len(sets) > 0 {
		args = append(args, id)
		if _, err := d.DB.Exec(`UPDATE "Category" SET `+strings.Join(sets, ", ")+` WHERE id=?`, args...); err != nil {
			if strings.Contains(err.Error(), "UNIQUE") {
				apiErr(w, http.StatusBadRequest, "分类名已存在, 请换一个名称")
				return
			}
			apiErr(w, http.StatusInternalServerError, "服务器内部错误")
			return
		}
	}
	row, _, _ := d.DB.QueryMap(`SELECT * FROM "Category" WHERE id=?`, id)
	apiOK(w, row)
}

// (d Deps) adminCategoryDelete DELETE /api/admin/categories/{id}
func (d Deps) adminCategoryDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Category" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "分类不存在")
		return
	}
	count, _ := d.DB.Count(`SELECT count(*) FROM "Book" WHERE categoryId=?`, id)
	if count > 0 {
		apiErr(w, http.StatusBadRequest, "该分类下有 "+strconv.Itoa(count)+" 本书, 请先移除")
		return
	}
	if _, err := d.DB.Exec(`DELETE FROM "Category" WHERE id=?`, id); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, nil)
}

// (d Deps) adminCategoriesBatch POST /api/admin/categories/batch — delete(force)|order
func (d Deps) adminCategoriesBatch(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	action, ids, payload, errMsg := parseBatchBody(body, []string{"delete", "order"})
	if errMsg != "" {
		apiErr(w, http.StatusBadRequest, errMsg)
		return
	}
	skipped := []batchSkip{}
	switch action {
	case "delete":
		force := payload["force"] == true
		for _, id := range ids {
			row, ok, _ := d.DB.QueryMap(`SELECT id,name FROM "Category" WHERE id=?`, id)
			if !ok {
				skipped = append(skipped, skipItem("分类不存在(可能已删除)", ""))
				continue
			}
			count, _ := d.DB.Count(`SELECT count(*) FROM "Book" WHERE categoryId=?`, id)
			if count > 0 && !force {
				apiErr(w, http.StatusConflict, "以下分类仍有书籍, 已整批拒绝删除: 「"+
					strOf(row["name"], 50)+"」"+strconv.Itoa(count)+" 本。可勾选「强制删除」将书籍移出分类后再删")
				return
			}
			if count > 0 {
				if _, err := d.DB.Exec(`UPDATE "Book" SET categoryId=NULL WHERE categoryId=?`, id); err != nil {
					apiErr(w, http.StatusInternalServerError, "服务器内部错误")
					return
				}
			}
			if _, err := d.DB.Exec(`DELETE FROM "Category" WHERE id=?`, id); err != nil {
				apiErr(w, http.StatusInternalServerError, "服务器内部错误")
				return
			}
		}
		apiOK(w, map[string]any{"affected": len(ids) - len(skipped), "skipped": skipped})
	case "order":
		if len(ids) > 500 {
			apiErr(w, http.StatusBadRequest, "单批最多重排 500 个分类")
			return
		}
		for i, id := range ids {
			if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Category" WHERE id=?`, id); !ok {
				apiErr(w, http.StatusNotFound, "部分分类不存在, 已整体取消重排, 请刷新后重试")
				return
			}
			if _, err := d.DB.Exec(`UPDATE "Category" SET sortOrder=? WHERE id=?`, int64(i), id); err != nil {
				apiErr(w, http.StatusInternalServerError, "服务器内部错误")
				return
			}
		}
		apiOK(w, map[string]any{"affected": len(ids), "skipped": skipped})
	}
}

// (d Deps) adminCategoriesConsolidate POST /api/admin/categories/consolidate
// 简化档(主控裁定): TS 语义映射表(smart.canonicalizeCategoryName)未移植 —
// Go 版仅做「归一化同名」合并(trim+collapse 空格+小写), 现库 name 唯一故合并计划恒空;
// 端点形态与入参(dryRun 缺省 true)/返回结构保持一致。
func (d Deps) adminCategoriesConsolidate(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	dryRun := body["dryRun"] != false
	rows, err := d.DB.QueryMaps(`SELECT id,name FROM "Category" ORDER BY sortOrder ASC, createdAt ASC`)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	type cat struct {
		id   string
		name string
	}
	byKey := map[string]cat{}
	merges := []map[string]any{}
	kept := []map[string]any{}
	for _, row := range rows {
		c := cat{id: strOf(row["id"], 64), name: strOf(row["name"], 50)}
		kept = append(kept, map[string]any{"id": c.id, "name": c.name})
		key := strings.ToLower(strings.Join(strings.Fields(c.name), ""))
		if first, exists := byKey[key]; !exists {
			byKey[key] = c
		} else {
			merges = append(merges, map[string]any{"from": c.name, "fromId": c.id, "into": first.name, "intoId": first.id})
		}
	}
	if dryRun || len(merges) == 0 {
		apiOK(w, map[string]any{
			"before": len(rows), "after": len(rows) - len(merges),
			"kept": kept, "merges": merges, "created": 0, "deleted": 0, "dryRun": dryRun,
		})
		return
	}
	deleted := 0
	for _, m := range merges {
		if _, err := d.DB.Exec(`UPDATE "Book" SET categoryId=? WHERE categoryId=?`, m["intoId"], m["fromId"]); err != nil {
			continue
		}
		if _, err := d.DB.Exec(`DELETE FROM "Category" WHERE id=?`, m["fromId"]); err == nil {
			deleted++
		}
	}
	apiOK(w, map[string]any{
		"before": len(rows), "after": len(rows) - deleted,
		"kept": kept, "merges": merges, "created": 0, "deleted": deleted, "dryRun": false,
	})
}

// ---------------- sites ----------------

var siteDomainRe = regexp.MustCompile(`^(localhost(:\d{1,5})?|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?)$`)

var validThemeIDs = map[string]bool{
	"aijjxs": true, "pili": true, "kks101": true, "qb23": true, "ddyueshu": true,
	"x2552": true, "huangjinwu": true, "ggd66": true, "shipsay": true, "trxsw": true, "x33yq": true,
}

func validTheme(raw any) string {
	id := strings.TrimSpace(strOf(raw, 50))
	if validThemeIDs[id] {
		return id
	}
	return "aijjxs"
}

// (d Deps) adminSitesList GET /api/admin/sites
func (d Deps) adminSitesList(w http.ResponseWriter, r *http.Request) {
	rows, err := d.DB.QueryMaps(`SELECT * FROM "Site" ORDER BY createdAt ASC LIMIT 500`)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, rows)
}

// (d Deps) adminSitesCreate POST /api/admin/sites
func (d Deps) adminSitesCreate(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	name := strings.TrimSpace(strOf(body["name"], 100))
	if name == "" {
		apiErr(w, http.StatusBadRequest, "站点名称必填")
		return
	}
	domain := strings.ToLower(strings.TrimSpace(strOf(body["domain"], 253)))
	if domain == "" {
		apiErr(w, http.StatusBadRequest, "域名必填")
		return
	}
	if !siteDomainRe.MatchString(domain) {
		apiErr(w, http.StatusBadRequest, "域名格式非法(例: www.example.com 或 localhost:3000)")
		return
	}
	if _, ok2, _ := d.DB.QueryMap(`SELECT id FROM "Site" WHERE domain=?`, domain); ok2 {
		apiErr(w, http.StatusBadRequest, "该域名已存在")
		return
	}
	total, _ := d.DB.Count(`SELECT count(*) FROM "Site"`)
	makeDefault := body["isDefault"] == true || total == 0
	id := d.DB.NewID()
	now := store.NowMS()
	title := strings.TrimSpace(strOf(body["title"], 200))
	if title == "" {
		title = name
	}
	status := int64(1)
	if body["status"] == false {
		status = 0
	}
	inWheel := int64(1)
	if body["inLinkWheel"] == false {
		inWheel = 0
	}
	if makeDefault {
		if _, err := d.DB.Exec(`UPDATE "Site" SET isDefault=0`); err != nil {
			apiErr(w, http.StatusInternalServerError, "服务器内部错误")
			return
		}
	}
	_, err := d.DB.Exec(`INSERT INTO "Site" (id,name,domain,themeId,title,description,keywords,icbm,geoRegion,geoPlacename,
offset,isDefault,status,inLinkWheel,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, name, domain, validTheme(body["themeId"]), title, strOf(body["description"], 500), strOf(body["keywords"], 500),
		orDefault(strings.TrimSpace(strOf(body["icbm"], 50)), "35.86166,104.195397"),
		orDefault(strings.TrimSpace(strOf(body["geoRegion"], 10)), "CN"),
		orDefault(strings.TrimSpace(strOf(body["geoPlacename"], 50)), "中国"),
		int64(clampIntOf(body["offset"], 0, 0, 1_000_000_000)), boolInt(makeDefault), status, inWheel, now, now)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			apiErr(w, http.StatusBadRequest, "该域名已存在")
			return
		}
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	row, _, _ := d.DB.QueryMap(`SELECT * FROM "Site" WHERE id=?`, id)
	apiOK(w, row)
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func boolInt(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

// (d Deps) adminSiteUpdate PUT /api/admin/sites/{id}
func (d Deps) adminSiteUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Site" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "站点不存在")
		return
	}
	sets := []string{"updatedAt=?"}
	args := []any{store.NowMS()}
	if v, has := body["name"]; has {
		name := strings.TrimSpace(strOf(v, 100))
		if name == "" {
			apiErr(w, http.StatusBadRequest, "站点名称不能为空")
			return
		}
		sets, args = append(sets, "name=?"), append(args, name)
	}
	for _, k := range []string{"title", "description", "keywords", "icbm", "geoRegion", "geoPlacename"} {
		if v, has := body[k]; has {
			max := 200
			switch k {
			case "description", "keywords":
				max = 500
			case "icbm":
				max = 50
			case "geoRegion":
				max = 10
			case "geoPlacename":
				max = 50
			}
			sets, args = append(sets, k+"=?"), append(args, strOf(v, max))
		}
	}
	if v, has := body["themeId"]; has {
		tid := strings.TrimSpace(strOf(v, 50))
		if !validThemeIDs[tid] {
			apiErr(w, http.StatusBadRequest, "未知主题模板")
			return
		}
		sets, args = append(sets, "themeId=?"), append(args, tid)
	}
	if v, has := body["domain"]; has {
		domain := strings.ToLower(strings.TrimSpace(strOf(v, 253)))
		if domain == "" || !siteDomainRe.MatchString(domain) {
			apiErr(w, http.StatusBadRequest, "域名格式非法(例: www.example.com 或 localhost:3000)")
			return
		}
		sets, args = append(sets, "domain=?"), append(args, domain)
	}
	if v, has := body["offset"]; has {
		sets, args = append(sets, "offset=?"), append(args, int64(clampIntOf(v, 0, 0, 1_000_000_000)))
	}
	if v, has := body["status"]; has {
		sets, args = append(sets, "status=?"), append(args, boolInt(v == true))
	}
	if v, has := body["inLinkWheel"]; has {
		sets, args = append(sets, "inLinkWheel=?"), append(args, boolInt(v == true))
	}
	makeDefault := body["isDefault"] == true
	if makeDefault {
		if _, err := d.DB.Exec(`UPDATE "Site" SET isDefault=0`); err != nil {
			apiErr(w, http.StatusInternalServerError, "服务器内部错误")
			return
		}
		sets = append(sets, "isDefault=1")
	}
	args = append(args, id)
	if _, err := d.DB.Exec(`UPDATE "Site" SET `+strings.Join(sets, ", ")+` WHERE id=?`, args...); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			apiErr(w, http.StatusBadRequest, "该域名已存在")
			return
		}
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	row, _, _ := d.DB.QueryMap(`SELECT * FROM "Site" WHERE id=?`, id)
	apiOK(w, row)
}

// (d Deps) adminSiteDelete DELETE /api/admin/sites/{id}
func (d Deps) adminSiteDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	row, ok, err := d.DB.QueryMap(`SELECT id,isDefault FROM "Site" WHERE id=?`, id)
	if err != nil || !ok {
		apiErr(w, http.StatusNotFound, "站点不存在")
		return
	}
	if store.ToBool(row["isDefault"]) {
		apiErr(w, http.StatusBadRequest, "默认站点不可删除")
		return
	}
	if _, err := d.DB.Exec(`DELETE FROM "Site" WHERE id=?`, id); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, nil)
}

// (d Deps) adminSitesBatch POST /api/admin/sites/batch — delete|theme|offset|wheel
func (d Deps) adminSitesBatch(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	action, ids, payload, errMsg := parseBatchBody(body, []string{"delete", "theme", "offset", "wheel"})
	if errMsg != "" {
		apiErr(w, http.StatusBadRequest, errMsg)
		return
	}
	skipped := []batchSkip{}
	switch action {
	case "delete":
		for _, id := range ids {
			row, ok, _ := d.DB.QueryMap(`SELECT id,name,isDefault FROM "Site" WHERE id=?`, id)
			if !ok {
				skipped = append(skipped, skipItem("站点不存在(可能已删除)", ""))
				continue
			}
			if store.ToBool(row["isDefault"]) {
				skipped = append(skipped, skipItem("默认站点不可删除", strOf(row["name"], 100)))
				continue
			}
			if _, err := d.DB.Exec(`DELETE FROM "Site" WHERE id=?`, id); err != nil {
				skipped = append(skipped, skipItem("操作失败(内部错误), 请重试", strOf(row["name"], 100)))
				continue
			}
		}
		apiOK(w, map[string]any{"affected": len(ids) - len(skipped), "skipped": skipped})
	case "theme":
		tid := ""
		if payload != nil {
			tid = strings.TrimSpace(strOf(payload["themeId"], 50))
		}
		if !validThemeIDs[tid] {
			apiErr(w, http.StatusBadRequest, "未知主题模板")
			return
		}
		for _, id := range ids {
			_, _ = d.DB.Exec(`UPDATE "Site" SET themeId=?, updatedAt=? WHERE id=?`, tid, store.NowMS(), id)
		}
		apiOK(w, map[string]any{"affected": len(ids), "skipped": skipped})
	case "offset":
		offset := clampIntOf(payload["offset"], 0, 0, 1_000_000_000)
		for _, id := range ids {
			_, _ = d.DB.Exec(`UPDATE "Site" SET offset=?, updatedAt=? WHERE id=?`, int64(offset), store.NowMS(), id)
		}
		apiOK(w, map[string]any{"affected": len(ids), "skipped": skipped})
	case "wheel":
		inWheel := payload["inLinkWheel"] != false
		for _, id := range ids {
			_, _ = d.DB.Exec(`UPDATE "Site" SET inLinkWheel=?, updatedAt=? WHERE id=?`, boolInt(inWheel), store.NowMS(), id)
		}
		apiOK(w, map[string]any{"affected": len(ids), "skipped": skipped})
	}
}

// (d Deps) adminSitesAutoTdk POST /api/admin/sites/auto-tdk
// 纯组合不落库: 站点名/域名 + 分类排行/书籍数/章节数 → TDK 三件套(对齐 composeSiteTdk)。
func (d Deps) adminSitesAutoTdk(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	name := strings.TrimSpace(strOf(body["name"], 60))
	domain := strings.TrimSpace(strOf(body["domain"], 200))
	siteID := strings.TrimSpace(strOf(body["siteId"], 64))
	if siteID != "" {
		site, ok, _ := d.DB.QueryMap(`SELECT name,domain FROM "Site" WHERE id=?`, siteID)
		if !ok {
			apiErr(w, http.StatusNotFound, "站点不存在")
			return
		}
		name = strOf(site["name"], 60)
		domain = strOf(site["domain"], 200)
	}
	if name == "" {
		apiErr(w, http.StatusBadRequest, "站点名称必填(或提供 siteId)")
		return
	}
	cats, _ := d.DB.QueryMaps(`SELECT c.name, (SELECT count(*) FROM "Book" b WHERE b.categoryId=c.id) AS bc
FROM "Category" c ORDER BY bc DESC LIMIT 5`)
	catNames := []string{}
	for _, c := range cats {
		if n, _ := c["bc"].(int64); n > 0 {
			catNames = append(catNames, strOf(c["name"], 50))
		}
	}
	bookCount, _ := d.DB.Count(`SELECT count(*) FROM "Book"`)
	chapterCount, _ := d.DB.Count(`SELECT count(*) FROM "Chapter"`)

	top := catNames
	if len(top) > 3 {
		top = top[:3]
	}
	catText := strings.Join(top, "、")
	title := name + " - 全本小说免费在线阅读"
	if catText != "" {
		title = name + "｜" + catText + "小说免费阅读"
	}
	catPhrase := "各类精品小说"
	if len(top) > 0 {
		catPhrase = catText + "等类型小说"
	}
	chapterPhrase := ""
	if chapterCount > 0 {
		chapterPhrase = "、" + strconv.Itoa(chapterCount) + " 章节"
	}
	description := name + "(" + domain + ")提供" + catPhrase + "免费在线阅读, 现已收录 " + strconv.Itoa(bookCount) + " 部作品" +
		chapterPhrase + ", 每日持续更新, 支持全本 TXT 打包下载。"
	kws := append(append([]string{}, catNames...), "免费小说", "全本小说", "小说大全", "小说下载", name)
	seen := map[string]bool{}
	var kwParts []string
	for _, k := range kws {
		k = strings.TrimSpace(k)
		if k == "" || seen[k] {
			continue
		}
		seen[k] = true
		kwParts = append(kwParts, k)
	}
	apiOK(w, map[string]any{
		"title":       truncateRunes(title, 40),
		"description": truncateRunes(description, 160),
		"keywords":    truncateRunes(strings.Join(kwParts, ","), 200),
	})
}

// ---------------- links(友链) ----------------

var linkSchemeRe = regexp.MustCompile(`^[a-z][a-z0-9+.-]*://`)

// normalizeLinkUrl 友链地址消毒(无 scheme 自动补 https)。
func normalizeLinkUrl(raw any) string {
	s := strings.TrimSpace(strOf(raw, 2000))
	if s == "" {
		return ""
	}
	if !linkSchemeRe.MatchString(strings.ToLower(s)) {
		s = "https://" + s
	}
	return httpUrlOf(s, 2000)
}

// (d Deps) adminLinksList GET /api/admin/links
func (d Deps) adminLinksList(w http.ResponseWriter, r *http.Request) {
	rows, err := d.DB.QueryMaps(`SELECT * FROM "FriendLink" ORDER BY sortOrder ASC, createdAt ASC LIMIT 500`)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, rows)
}

// (d Deps) adminLinksCreate POST /api/admin/links
func (d Deps) adminLinksCreate(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	name := strings.TrimSpace(strOf(body["name"], 60))
	if name == "" {
		apiErr(w, http.StatusBadRequest, "名称必填(1~60字)")
		return
	}
	url := normalizeLinkUrl(body["url"])
	if url == "" {
		apiErr(w, http.StatusBadRequest, "链接地址非法(仅支持 http/https)")
		return
	}
	logo, lerr := normalizeLogo(body["logo"])
	if lerr != "" {
		apiErr(w, http.StatusBadRequest, lerr)
		return
	}
	id := d.DB.NewID()
	now := store.NowMS()
	_, err := d.DB.Exec(`INSERT INTO "FriendLink" (id,name,url,logo,sortOrder,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)`,
		id, name, url, logo, int64(clampIntOf(body["sortOrder"], 0, 0, 99_999)), boolInt(body["enabled"] != false), now, now)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	row, _, _ := d.DB.QueryMap(`SELECT * FROM "FriendLink" WHERE id=?`, id)
	apiOK(w, row)
}

// normalizeLogo logo 消毒: 空 | http(s) | 站内 / 路径; // 拒绝。返回 (值, 错误)。
func normalizeLogo(raw any) (string, string) {
	s := strings.TrimSpace(strOf(raw, 2000))
	if s == "" {
		return "", ""
	}
	if strings.HasPrefix(s, "//") {
		return "", "logo 不支持 // 开头的协议相对地址"
	}
	if strings.HasPrefix(s, "/") {
		return s, ""
	}
	low := strings.ToLower(s)
	if strings.HasPrefix(low, "http://") || strings.HasPrefix(low, "https://") {
		v := httpUrlOf(s, 2000)
		if v == "" {
			return "", "logo 地址非法(仅支持 http/https)"
		}
		return v, ""
	}
	return "", "logo 仅支持 http(s) 外链或站内 / 开头路径"
}

// (d Deps) adminLinksUpdate PUT /api/admin/links
func (d Deps) adminLinksUpdate(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	id := strings.TrimSpace(strOf(body["id"], 64))
	if id == "" {
		apiErr(w, http.StatusBadRequest, "缺少 id")
		return
	}
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "FriendLink" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "友链不存在")
		return
	}
	sets := []string{"updatedAt=?"}
	args := []any{store.NowMS()}
	if v, has := body["name"]; has {
		name := strings.TrimSpace(strOf(v, 60))
		if name == "" {
			apiErr(w, http.StatusBadRequest, "名称不能为空(1~60字)")
			return
		}
		sets, args = append(sets, "name=?"), append(args, name)
	}
	if v, has := body["url"]; has {
		url := normalizeLinkUrl(v)
		if url == "" {
			apiErr(w, http.StatusBadRequest, "链接地址非法(仅支持 http/https)")
			return
		}
		sets, args = append(sets, "url=?"), append(args, url)
	}
	if v, has := body["logo"]; has {
		logo, lerr := normalizeLogo(v)
		if lerr != "" {
			apiErr(w, http.StatusBadRequest, lerr)
			return
		}
		sets, args = append(sets, "logo=?"), append(args, logo)
	}
	if v, has := body["sortOrder"]; has {
		sets, args = append(sets, "sortOrder=?"), append(args, int64(clampIntOf(v, 0, 0, 99_999)))
	}
	if v, has := body["enabled"]; has {
		sets, args = append(sets, "enabled=?"), append(args, boolInt(v == true))
	}
	args = append(args, id)
	if _, err := d.DB.Exec(`UPDATE "FriendLink" SET `+strings.Join(sets, ", ")+` WHERE id=?`, args...); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	row, _, _ := d.DB.QueryMap(`SELECT * FROM "FriendLink" WHERE id=?`, id)
	apiOK(w, row)
}

// (d Deps) adminLinksDelete DELETE /api/admin/links?id=
func (d Deps) adminLinksDelete(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(strOf(r.URL.Query().Get("id"), 64))
	if id == "" {
		apiErr(w, http.StatusBadRequest, "缺少 id")
		return
	}
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "FriendLink" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "友链不存在")
		return
	}
	if _, err := d.DB.Exec(`DELETE FROM "FriendLink" WHERE id=?`, id); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, nil)
}

// (d Deps) adminLinksBatch POST /api/admin/links/batch — delete|enable|disable
func (d Deps) adminLinksBatch(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	rawIDs, _ := body["ids"].([]any)
	seen := map[string]bool{}
	var ids []string
	for _, v := range rawIDs {
		s, ok := v.(string)
		if !ok {
			continue
		}
		id := strings.TrimSpace(strOf(s, 64))
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
		if len(ids) >= 500 {
			break
		}
	}
	if len(ids) == 0 {
		apiErr(w, http.StatusBadRequest, "请先选择要操作的友链")
		return
	}
	action := strOf(body["action"], 20)
	switch action {
	case "delete":
		for _, id := range ids {
			_, _ = d.DB.Exec(`DELETE FROM "FriendLink" WHERE id=?`, id)
		}
	case "enable", "disable":
		e := boolInt(action == "enable")
		for _, id := range ids {
			_, _ = d.DB.Exec(`UPDATE "FriendLink" SET enabled=?, updatedAt=? WHERE id=?`, e, store.NowMS(), id)
		}
	default:
		apiErr(w, http.StatusBadRequest, "不支持的操作: "+truncateRunes(action, 32))
		return
	}
	apiOK(w, map[string]any{"affected": len(ids)})
}
