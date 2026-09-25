// ============================================================
// 站群站点 / 分类 / 友链(前台渲染共用的读面)
// ============================================================
package store

// DefaultSite 默认启用站(→ 任意启用站兜底; 对齐 resolveMetaSite 链)。
func (d *DB) DefaultSite() (map[string]any, bool, error) {
	if m, ok, err := d.QueryMap(`SELECT * FROM "Site" WHERE isDefault=1 AND status=1 ORDER BY createdAt ASC LIMIT 1`); err != nil || ok {
		return m, ok, err
	}
	return d.QueryMap(`SELECT * FROM "Site" WHERE status=1 ORDER BY createdAt ASC LIMIT 1`)
}

// SiteByID 按主键。
func (d *DB) SiteByID(id string) (map[string]any, bool, error) {
	return d.QueryMap(`SELECT * FROM "Site" WHERE id=?`, id)
}

// [R67/R68 死代码清退] SiteByDomain/ListEnabledSites 删除(TS 站群自动路由口径遗留, 全仓零消费者)。

// ListCategories 分类(含书计数)。
func (d *DB) ListCategories() ([]map[string]any, error) {
	return d.QueryMaps(`SELECT c.id, c.name, c.sortOrder, count(b.id) AS bookCount
FROM "Category" c LEFT JOIN "Book" b ON b.categoryId=c.id
GROUP BY c.id ORDER BY c.sortOrder ASC, c.name ASC`)
}

// ListFriendLinks 启用友链(升序)。
func (d *DB) ListFriendLinks() ([]map[string]any, error) {
	return d.QueryMaps(`SELECT id,name,url,logo,sortOrder FROM "FriendLink" WHERE enabled=1 ORDER BY sortOrder ASC, createdAt ASC`)
}
