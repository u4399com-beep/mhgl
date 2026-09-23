// ============================================================
// R60-2b — 智能 PSEO 自动生成(pseoAutoGenerate 死设置接上)
//
// 修前: Setting.pseoAutoGenerate 仅在 settingDefaults 展示(GET /api/admin/settings
// 可见/可写), Go 侧零消费 —— TS 时代由 runner.ts 在书籍入库后自动生成 ≤5 页
// 关键词落地页, 单体化后该链路断头(死设置)。
// 修后: api.Register 注入 store 书籍入库钩子(InsertBook 成功 → 异步回调),
// 开关开启时对新书按 TS 同语义生成 ≤5 页落地页(库内词: Book.keywords 逗号拆分
// + BookTag 下拉词; keyword 全站唯一去重)。开关关闭(缺省)时仅一次 KV 读, 零写入。
// ============================================================
package api

import (
	"encoding/json"
	"strings"

	"mhgl/internal/store"
)

// pseoAutoPerBook 自动生成单书页数上限(TS runner 同语义 ≤5)。
const pseoAutoPerBook = 5

// initPseoAutoGenerate Register 时装配书籍入库钩子(store.SetBookCreatedHook)。
func (d Deps) initPseoAutoGenerate() {
	store.SetBookCreatedHook(func(db *store.DB, bookID string) {
		if !d.pseoAutoEnabled() {
			return // 缺省关: 每书一次 KV 读的代价
		}
		b, ok, err := db.QueryMap(`SELECT id,name,author,categoryId,intro,status,keywords,wordCount FROM "Book" WHERE id=?`, bookID)
		if err != nil || !ok {
			return
		}
		d.pseoCreateForBook(b, pseoAutoPerBook)
	})
}

// pseoAutoEnabled Setting.pseoAutoGenerate 是否开启(历史口径 TS 时代存字符串
// '1'/'0'; adminSettingsPut JSON 序列化后带引号; 兼容裸 1/true 形态)。
func (d Deps) pseoAutoEnabled() bool {
	raw, ok, _ := d.DB.GetSetting("pseoAutoGenerate")
	if !ok {
		return false
	}
	v := strings.Trim(strings.TrimSpace(raw), `"`)
	return v == "1" || strings.EqualFold(v, "true")
}

// pseoCreateForBook 单书生成 ≤perBook 个关键词落地页(手动端点与自动钩子共用)。
// 关键词候选: Book.keywords 逗号拆分 + BookTag 下拉词(hits 降序); keyword 全站
// 唯一, 命中即跳过。返回 (生成数, 跳过数)。
func (d Deps) pseoCreateForBook(b map[string]any, perBook int) (generated, skipped int) {
	bid := store.ToStr(b["id"])
	if bid == "" {
		return 0, 0
	}
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
	site, _, _ := d.DB.DefaultSite()
	var siteID any
	if site != nil {
		siteID = site["id"]
	}
	for _, kw := range cands {
		// keyword 全站唯一 → 已存在跳过
		if _, ok2, _ := d.DB.QueryMap(`SELECT id FROM "PseoPage" WHERE keyword=?`, kw); ok2 {
			skipped++
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
			skipped++
		}
	}
	return generated, skipped
}
