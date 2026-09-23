// ============================================================
// R55-3b — /api/admin/rules 系列(移植 src/app/api/admin/rules/*)
//
//	GET/POST /api/admin/rules            列表 / 创建
//	GET/PUT/DELETE /api/admin/rules/{id}
//	POST /api/admin/rules/batch          delete(整批原子: 任一被引用即 409)
//	POST /api/admin/rules/test           四段试采 → crawl.TestRule(接线缝, 桩错误兜底)
//	GET  /api/admin/rules/builtin        内置规则库(go:embed builtin_rules.json)
//	POST /api/admin/rules/import-builtin 按 name 幂等 upsert(保留既有 ruleId)
//
// 简化档: regexGate(collectRegexIssues 深审查)未移植 —— 仅做 JSON/大小校验;
//
//	引擎侧 regexRuntimeSafe 防线(3-a)兜底运行时风险。calibrate 系列未迁移。
//
// ============================================================
package api

import (
	_ "embed"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"mhgl/internal/crawl"
	"mhgl/internal/store"
)

//go:embed builtin_rules.json
var builtinRulesJSON []byte

type builtinRule struct {
	Key         string          `json:"key"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Enabled     bool            `json:"enabled"`
	Source      string          `json:"source"`
	Config      json.RawMessage `json:"config"`
}

func builtinRules() []builtinRule {
	var rules []builtinRule
	if err := json.Unmarshal(builtinRulesJSON, &rules); err != nil {
		return nil
	}
	return rules
}

// configToString 规则配置序列化: 对象→JSON; 字符串→原样; ≤200KB。
func configToString(v any) (string, bool) {
	switch x := v.(type) {
	case map[string]any:
		b, err := json.Marshal(x)
		if err != nil || len(b) > 200_000 {
			return "", false
		}
		return string(b), true
	case string:
		if len(x) > 200_000 {
			return "", false
		}
		return x, true
	}
	return "", false
}

// (d Deps) adminRulesList GET /api/admin/rules
func (d Deps) adminRulesList(w http.ResponseWriter, r *http.Request) {
	rows, err := d.DB.QueryMaps(`SELECT * FROM "Rule" ORDER BY updatedAt DESC LIMIT 500`)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, rows)
}

// (d Deps) adminRulesCreate POST /api/admin/rules
func (d Deps) adminRulesCreate(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	name := strings.TrimSpace(strOf(body["name"], 100))
	if name == "" {
		apiErr(w, http.StatusBadRequest, "规则名称必填")
		return
	}
	var config string
	if raw, has := body["config"]; !has || raw == nil || strOf(raw, 0) == "" {
		config = defaultRuleConfigJSON
	} else {
		s, ok := configToString(raw)
		if !ok {
			apiErr(w, http.StatusBadRequest, "规则配置过大或类型非法")
			return
		}
		config = s
	}
	id := d.DB.NewID()
	now := store.NowMS()
	desc := strOf(body["description"], 500)
	enabled := int64(1)
	if body["enabled"] == false {
		enabled = 0
	}
	if _, err := d.DB.Exec(`INSERT INTO "Rule" (id,name,description,config,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)`,
		id, name, desc, config, enabled, now, now); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	row, _, _ := d.DB.QueryMap(`SELECT * FROM "Rule" WHERE id=?`, id)
	apiOK(w, row)
}

// defaultRuleConfigJSON 对齐 types.ts defaultRuleConfig()(DEFAULT_FETCH/CLEAN 同源)。
const defaultRuleConfigJSON = `{"list":{"enabled":true,"urlTemplate":"","fields":{}},"book":{"enabled":true,"fields":{}},"toc":{"enabled":true,"fields":{},"pagination":{"enabled":false,"maxPages":20,"joinWith":""}},"content":{"enabled":true,"fields":{},"pagination":{"enabled":false,"maxPages":10,"joinWith":"<br/>"}},"fetch":{"engine":"auto","uaMode":"rotate","autoCookie":true,"referer":true,"timeout":20000,"retries":2,"waitMs":800,"browserFallbackStatus":[403,412,429,503],"hostGateLimit":3,"hostGateConcurrency":3,"globalConcurrency":10},"clean":{"removeSelectors":["script","style","iframe","ins","noscript",".adsbygoogle",".ad","#ad"],"adPatterns":["(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?","本章未完.*?点击下一页继续阅读","请记住本书.*?域名","最新章节请到.*?查看","[（(]?完?本[网站站][）)]?","一秒记住.*?免费读"],"whitelist":["p","br","b","strong","em","i","u","h1","h2","h3","h4","h5","h6"],"normalize":true,"plainText":false}}`

// (d Deps) adminRuleDetail GET /api/admin/rules/{id}
func (d Deps) adminRuleDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	row, ok, err := d.DB.QueryMap(`SELECT * FROM "Rule" WHERE id=?`, id)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if !ok {
		apiErr(w, http.StatusNotFound, "规则不存在")
		return
	}
	apiOK(w, row)
}

// (d Deps) adminRuleUpdate PUT /api/admin/rules/{id}
func (d Deps) adminRuleUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Rule" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "规则不存在")
		return
	}
	sets := []string{"updatedAt=?"}
	args := []any{store.NowMS()}
	if v, has := body["name"]; has {
		name := strings.TrimSpace(strOf(v, 100))
		if name == "" {
			apiErr(w, http.StatusBadRequest, "规则名称不能为空")
			return
		}
		sets, args = append(sets, "name=?"), append(args, name)
	}
	if v, has := body["description"]; has {
		sets, args = append(sets, "description=?"), append(args, strOf(v, 500))
	}
	if v, has := body["enabled"]; has {
		e := int64(0)
		if b, ok := v.(bool); ok && b {
			e = 1
		}
		sets, args = append(sets, "enabled=?"), append(args, e)
	}
	if v, has := body["config"]; has {
		s, ok := configToString(v)
		if !ok {
			apiErr(w, http.StatusBadRequest, "规则配置过大或类型非法")
			return
		}
		sets, args = append(sets, "config=?"), append(args, s)
	}
	args = append(args, id)
	if _, err := d.DB.Exec(`UPDATE "Rule" SET `+strings.Join(sets, ", ")+` WHERE id=?`, args...); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	row, _, _ := d.DB.QueryMap(`SELECT * FROM "Rule" WHERE id=?`, id)
	apiOK(w, row)
}

// (d Deps) adminRuleDelete DELETE /api/admin/rules/{id}
func (d Deps) adminRuleDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Rule" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "规则不存在")
		return
	}
	inUse, _ := d.DB.Count(`SELECT count(*) FROM "Task" WHERE ruleId=?`, id)
	if inUse > 0 {
		apiErr(w, http.StatusBadRequest, "该规则被 "+strconv.Itoa(inUse)+" 个采集任务引用, 请先删除任务")
		return
	}
	if _, err := d.DB.Exec(`DELETE FROM "Rule" WHERE id=?`, id); err != nil {
		if strings.Contains(err.Error(), "FOREIGN KEY") {
			apiErr(w, http.StatusConflict, "删除时发现规则仍被任务引用(并发变更), 请刷新后重试")
			return
		}
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	_, _ = d.DB.Exec(`DELETE FROM "Setting" WHERE key=?`, "calibration:"+id)
	apiOK(w, nil)
}

// (d Deps) adminRulesBatch POST /api/admin/rules/batch — delete 整批原子
func (d Deps) adminRulesBatch(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	_, ids, _, errMsg := parseBatchBody(body, []string{"delete"})
	if errMsg != "" {
		apiErr(w, http.StatusBadRequest, errMsg)
		return
	}
	// 整批预检: 任一规则被任务引用即 409 整批拒绝
	type ref struct {
		ruleID string
		count  int
	}
	var refs []ref
	for _, id := range ids {
		if n, _ := d.DB.Count(`SELECT count(*) FROM "Task" WHERE ruleId=?`, id); n > 0 {
			refs = append(refs, ref{ruleID: id, count: n})
		}
	}
	if len(refs) > 0 {
		parts := make([]string, 0, len(refs))
		for _, rf := range refs {
			name := rf.ruleID
			if row, ok, _ := d.DB.QueryMap(`SELECT name FROM "Rule" WHERE id=?`, rf.ruleID); ok {
				name = strOf(row["name"], 100)
			}
			parts = append(parts, "「"+name+"」("+strconv.Itoa(rf.count)+" 个任务)")
		}
		apiErr(w, http.StatusConflict, "以下规则仍被采集任务引用, 已整批拒绝删除: "+strings.Join(parts, "、"))
		return
	}
	for _, id := range ids {
		if _, err := d.DB.Exec(`DELETE FROM "Rule" WHERE id=?`, id); err != nil {
			if strings.Contains(err.Error(), "FOREIGN KEY") {
				apiErr(w, http.StatusConflict, "删除时发现规则仍被任务引用(并发变更), 已整批拒绝, 请刷新后重试")
				return
			}
			apiErr(w, http.StatusInternalServerError, "服务器内部错误")
			return
		}
		_, _ = d.DB.Exec(`DELETE FROM "Setting" WHERE key=?`, "calibration:"+id)
	}
	apiOK(w, map[string]any{"affected": len(ids)})
}

// (d Deps) adminRulesTest POST /api/admin/rules/test
// 只调 crawl.TestRule(configJSON, sampleURL)(接线缝, 3-a 实现); 桩返回的错误原样兜底成 502 信封。
func (d Deps) adminRulesTest(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	section := strOf(body["section"], 20)
	switch section {
	case "list", "book", "toc", "content":
	default:
		apiErr(w, http.StatusBadRequest, "非法测试段(应为 list/book/toc/content)")
		return
	}
	rawURL := strings.TrimSpace(strOf(body["url"], 2000))
	if rawURL == "" {
		apiErr(w, http.StatusBadRequest, "缺少测试 URL")
		return
	}
	normalized := httpUrlOf(rawURL, 2000)
	if normalized == "" {
		apiErr(w, http.StatusBadRequest, "URL 非法(仅支持 http/https)")
		return
	}
	// 组装单段配置: {<section>: rule, fetch: {...}, clean: {...}} 与引擎 RuleConfig 形态对齐
	cfg := map[string]any{"fetch": body["fetch"], "clean": body["clean"]}
	if ruleObj, ok := body["rule"].(map[string]any); ok {
		cfg[section] = ruleObj
	} else if s, ok := body["rule"].(string); ok && s != "" {
		var m map[string]any
		if json.Unmarshal([]byte(s), &m) == nil {
			cfg[section] = m
		}
	} else {
		apiErr(w, http.StatusBadRequest, "规则配置非法")
		return
	}
	cfgJSON, _ := json.Marshal(cfg)
	res, err := crawl.TestRule(string(cfgJSON), normalized)
	if err != nil {
		apiErr(w, http.StatusBadGateway, "测试失败: "+truncateRunes(err.Error(), 200))
		return
	}
	apiOK(w, res)
}

// (d Deps) adminRulesBuiltin GET /api/admin/rules/builtin
func (d Deps) adminRulesBuiltin(w http.ResponseWriter, r *http.Request) {
	existing, err := d.DB.QueryMaps(`SELECT id,name FROM "Rule"`)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	idsByName := map[string][]string{}
	for _, row := range existing {
		n := strOf(row["name"], 200)
		idsByName[n] = append(idsByName[n], strOf(row["id"], 64))
	}
	out := make([]map[string]any, 0, 40)
	for _, br := range builtinRules() {
		imported := idsByName[br.Name]
		out = append(out, map[string]any{
			"key": br.Key, "name": br.Name, "description": br.Description,
			"enabled": br.Enabled, "source": br.Source, "config": json.RawMessage(br.Config),
			"imported": len(imported) > 0, "importedIds": imported,
		})
	}
	apiOK(w, map[string]any{"rules": out})
}

// (d Deps) adminRulesImportBuiltin POST /api/admin/rules/import-builtin
// 幂等口径(主控裁定, 与 TS 删旧重建不同): 按 name upsert, 保留既有 ruleId。
func (d Deps) adminRulesImportBuiltin(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	all := builtinRules()
	byKey := map[string]*builtinRule{}
	for i := range all {
		byKey[all[i].Key] = &all[i]
	}
	var keys []string
	switch kv := body["keys"].(type) {
	case string:
		if strings.TrimSpace(kv) != "" {
			keys = append(keys, kv)
		}
	case []any:
		for _, v := range kv {
			if s, ok := v.(string); ok {
				keys = append(keys, s)
			}
		}
	}
	if body["all"] == true || len(keys) == 0 {
		keys = nil
		for _, br := range all {
			keys = append(keys, br.Key)
		}
	}
	// 去重保序
	seen := map[string]bool{}
	var uniq []string
	for _, k := range keys {
		k = strings.TrimSpace(k)
		if k == "" || seen[k] {
			continue
		}
		seen[k] = true
		uniq = append(uniq, k)
	}
	if len(uniq) > 500 {
		apiErr(w, http.StatusBadRequest, "单次最多导入 500 条规则(内置规则库共 "+strconv.Itoa(len(all))+" 条)")
		return
	}
	results := make([]map[string]any, 0, len(uniq))
	created, updated := 0, 0
	for _, key := range uniq {
		br := byKey[key]
		if br == nil {
			results = append(results, map[string]any{"key": key, "name": "", "deletedOld": 0, "error": "未知规则 key"})
			continue
		}
		name := strings.TrimSpace(strOf(br.Name, 100))
		config := string(br.Config)
		enabled := int64(1)
		if !br.Enabled {
			enabled = 0
		}
		// 按 name 幂等 upsert(保留既有 ruleId)
		var id string
		err := d.DB.QueryRow(`SELECT id FROM "Rule" WHERE name=?`, name).Scan(&id)
		if err == nil {
			if _, uerr := d.DB.Exec(`UPDATE "Rule" SET description=?, config=?, enabled=?, updatedAt=? WHERE id=?`,
				strOf(br.Description, 500), config, enabled, store.NowMS(), id); uerr != nil {
				results = append(results, map[string]any{"key": key, "name": name, "deletedOld": 0, "error": "操作失败(内部错误), 请重试"})
				continue
			}
			// [R56-2b-fix] 修前 update 路径也 created++, 二次导入时 created/updated
			// 双双虚高(TS 原件 created 仅计实际新建); updated 单独已有计数。
			updated++
			results = append(results, map[string]any{"key": key, "name": name, "id": id, "deletedOld": 0, "updated": true})
			continue
		}
		nid := d.DB.NewID()
		if _, ierr := d.DB.Exec(`INSERT INTO "Rule" (id,name,description,config,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)`,
			nid, name, strOf(br.Description, 500), config, enabled, store.NowMS(), store.NowMS()); ierr != nil {
			results = append(results, map[string]any{"key": key, "name": name, "deletedOld": 0, "error": "操作失败(内部错误), 请重试"})
			continue
		}
		created++
		results = append(results, map[string]any{"key": key, "name": name, "id": nid, "deletedOld": 0})
	}
	apiOK(w, map[string]any{"created": created, "removedOld": 0, "updated": updated, "results": results})
}
