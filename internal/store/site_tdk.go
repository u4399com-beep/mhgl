// ============================================================
// R65-b — Site.smartTdk 列自举(站点智能 TDK 配置, JSON TEXT)
//
// store 零迁移哲学下的谨慎加列: 对齐 ensureFeedbackTable 幂等自举先例,
// PRAGMA table_info 探测缺列 → ALTER TABLE "Site" ADD COLUMN smartTdk TEXT
// (SQLite 加可空无默认列瞬时完成不重写表; 已存在/异常静默跳过不阻断启动)。
//
// 列语义: JSON = {"enabled":bool,"sets":[1..18],"pages":{页类型:"smart"|"off"},
// "templates":{套编号:{title,description,keywords}}} —— 解析/消毒/消费全在
// internal/crawl/smart(TDKSiteCfg.ParseSiteCfg); 配置读写只走 admin API
// (GET/PUT /api/admin/sites/{id}/tdk), 代码不直写库文件。
// ============================================================
package store

// ensureSmartTdkColumn Site.smartTdk 列自举(存在则空转, 幂等, 每次 Open 自检)。
// 表不存在(极简测试库)整段跳过; 探测/加列失败静默 —— 智能面降级为未配置(引擎回落原逻辑)。
func (d *DB) ensureSmartTdkColumn() {
	rows, err := d.QueryMaps(`PRAGMA table_info("Site")`)
	if err != nil {
		return
	}
	for _, row := range rows {
		if ToStr(row["name"]) == "smartTdk" {
			return // 已存在: 空转
		}
	}
	_, _ = d.Exec(`ALTER TABLE "Site" ADD COLUMN smartTdk TEXT`)
}
