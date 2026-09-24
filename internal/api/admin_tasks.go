// ============================================================
// R55-3b — /api/admin/tasks 系列(移植 src/app/api/admin/tasks/*)
//
//	GET    /api/admin/tasks            列表(status 白名单过滤 + 进度瘦身)
//	POST   /api/admin/tasks            创建(full 规范化 + validateTaskPair)
//	GET    /api/admin/tasks/{id}       详情(rule 带出 + live)
//	PUT    /api/admin/tasks/{id}       在线调节(partial 合并 + 运行中模式字段禁改)
//	DELETE /api/admin/tasks/{id}       删除(运行中先 stop)
//	POST   /api/admin/tasks/batch      start|pause|stop|delete 批量
//	POST   /api/admin/tasks/{id}/control  start|pause|resume|stop → Deps.Tasks
//	GET    /api/admin/tasks/{id}/logs  增量轮询(after/level) + 30 天清理
//
// 书号上限: 单体内 engine 恒 'go' → 100000(book-ids.ts 口径)。
// ============================================================
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"sync/atomic"

	"mhgl/internal/store"
)

var taskStatuses = map[string]bool{
	"pending": true, "running": true, "paused": true,
	"stopped": true, "done": true, "error": true, "interrupted": true,
}

// ---------------- book-ids.ts 移植 ----------------

const (
	bookIDMaxLen      = 200
	bookIDMaxCount    = 2000
	bookIDMaxCountG   = 100_000 // engine='go' 单体内恒用
	bookIDPlaceholder = "{bookId}"
)

var bookIDDigitsRe = regexp.MustCompile(`^\d{1,12}$`)

// parseBookIdList 分隔符拆分→trim→去空→去重保序。
func parseBookIdList(raw string) []string {
	if raw == "" {
		return nil
	}
	seen := map[string]bool{}
	var out []string
	splitFn := func(r rune) bool {
		switch r {
		case ' ', '\t', '\n', '\r', '\v', '\f', ',', '，', '、', ';', '；':
			return true
		}
		return false
	}
	for _, part := range strings.FieldsFunc(raw, splitFn) {
		id := strings.TrimSpace(part)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

// parseBookIdRange 书号范围校验(精确文案对齐 TS)。
func parseBookIdRange(from, to string, max int) (string, string, string) {
	if from == "" || to == "" {
		return "", "", "书号范围必须同时填写起始书号与结束书号"
	}
	if !bookIDDigitsRe.MatchString(from) || !bookIDDigitsRe.MatchString(to) {
		return "", "", "书号范围必须为非负整数(纯数字, 不含小数点/正负号等, 最多 12 位)"
	}
	var fn, tn int64
	fmt.Sscanf(from, "%d", &fn)
	fmt.Sscanf(to, "%d", &tn)
	if fn > tn {
		return "", "", "起始书号不能大于结束书号"
	}
	if tn-fn+1 > int64(max) {
		return "", "", fmt.Sprintf("书号范围过大(%d-%d 共 %d 本, 最多 %d 本)", fn, tn, tn-fn+1, max)
	}
	return from, to, ""
}

// validateTaskPair 模式与 URL/书号联动校验(合并后生效值)。返回 "" 表示通过。
func validateTaskPair(mode, bookUrl, listUrl, bookIds, bookIdFrom, bookIdTo string, engine string) string {
	maxCount := bookIDMaxCount
	if engine == "go" {
		maxCount = bookIDMaxCountG
	}
	if mode == "single" && bookUrl == "" {
		return "单本模式必须填写书籍页URL"
	}
	if mode == "range" && listUrl == "" {
		return "范围模式必须填写列表页URL(仅 {page}/{offset:N} 会被自动替换)"
	}
	if mode == "bookIds" {
		if bookUrl == "" || !strings.Contains(bookUrl, bookIDPlaceholder) {
			return fmt.Sprintf("书号采集必须填写书籍页URL模板(需含 %s 占位符)", bookIDPlaceholder)
		}
		from := strings.TrimSpace(bookIdFrom)
		to := strings.TrimSpace(bookIdTo)
		listCount := len(parseBookIdList(bookIds))
		if (from != "" || to != "") && listCount > 0 {
			return "书号列表与书号范围只能二选一"
		}
		if from != "" || to != "" {
			_, _, err := parseBookIdRange(from, to, maxCount)
			return err
		}
		if listCount == 0 {
			return "书号采集必须填写书号列表"
		}
		if listCount > maxCount {
			return fmt.Sprintf("书号数量超过上限(去重后 %d 个, 最多 %d 个)", listCount, maxCount)
		}
	}
	return ""
}

// normalizeTaskData 任务入参规范化(对齐 tasks/_shared.ts)。
// 返回 (patch, err); patch 仅含 full 模式全量 / partial 模式 body 出现的字段。
func normalizeTaskData(body map[string]any, full bool) (map[string]any, string) {
	out := map[string]any{}
	has := func(k string) bool {
		_, ok := body[k]
		return ok
	}
	when := func(k string) bool { return full || has(k) }

	if when("name") {
		name := strings.TrimSpace(strOf(body["name"], 100))
		if name == "" {
			return nil, "任务名称必填"
		}
		out["name"] = name
	}
	if when("mode") {
		m := strOf(body["mode"], 20)
		// TS 口径: 显式提供且不在白名单(含空串)即报错, 不静默改写; 未提供(full 缺省)回退 range
		if has("mode") && m != "single" && m != "range" && m != "bookIds" {
			return nil, "采集模式必须是 single(单本)、range(范围) 或 bookIds(书号)"
		}
		if m != "single" && m != "range" && m != "bookIds" {
			m = "range"
		}
		out["mode"] = m
	}
	if full {
		if strOf(body["engine"], 4) == "ts" {
			out["engine"] = "ts"
		} else {
			out["engine"] = "go"
		}
	} else if e := strOf(body["engine"], 4); e == "go" || e == "ts" {
		out["engine"] = e
	}

	if when("bookUrl") {
		raw := body["bookUrl"]
		u := httpUrlOf(raw, 2000)
		if raw != nil && strOf(raw, 0) != "" && u == "" {
			return nil, "书籍页URL格式非法(需 http/https)"
		}
		out["bookUrl"] = u
	}
	if when("listUrl") {
		raw := body["listUrl"]
		u := httpUrlOf(raw, 2000)
		if raw != nil && strOf(raw, 0) != "" && u == "" {
			return nil, "列表页URL格式非法(需 http/https)"
		}
		out["listUrl"] = u
	}
	if when("bookIds") {
		var raw string
		if s, ok := body["bookIds"].(string); ok {
			raw = s
		} else if body["bookIds"] == nil {
			raw = ""
		} else {
			raw = store.ToStr(body["bookIds"])
		}
		ids := parseBookIdList(raw)
		for _, id := range ids {
			if len(id) > bookIDMaxLen {
				return nil, fmt.Sprintf("单个书号长度超过 %d 字符上限", bookIDMaxLen)
			}
		}
		out["bookIds"] = strings.Join(ids, "\n")
	}
	if when("bookIdFrom") {
		v := body["bookIdFrom"]
		if v == nil {
			out["bookIdFrom"] = ""
		} else if s, ok := v.(string); ok {
			out["bookIdFrom"] = strings.TrimSpace(s)
		} else {
			out["bookIdFrom"] = strings.TrimSpace(store.ToStr(v))
		}
	}
	if when("bookIdTo") {
		v := body["bookIdTo"]
		if v == nil {
			out["bookIdTo"] = ""
		} else if s, ok := v.(string); ok {
			out["bookIdTo"] = strings.TrimSpace(s)
		} else {
			out["bookIdTo"] = strings.TrimSpace(store.ToStr(v))
		}
	}

	if when("listStart") {
		out["listStart"] = clampIntOf(body["listStart"], 1, 1, 100_000)
	}
	if when("listEnd") {
		out["listEnd"] = clampIntOf(body["listEnd"], 1, 1, 100_000)
	}
	if when("listStart") || when("listEnd") || full {
		ls, lok := out["listStart"].(int)
		le, lok2 := out["listEnd"].(int)
		if lok && lok2 && le < ls {
			out["listStart"], out["listEnd"] = le, ls
		}
	}
	if when("bookStart") {
		out["bookStart"] = clampIntOf(body["bookStart"], 0, 0, 100_000)
	}
	if when("bookEnd") {
		out["bookEnd"] = clampIntOf(body["bookEnd"], 0, 0, 100_000)
	}
	if when("bookStart") || when("bookEnd") || full {
		bs, bok := out["bookStart"].(int)
		be, bok2 := out["bookEnd"].(int)
		if bok && bok2 && bs > 0 && be > 0 && be < bs {
			out["bookStart"], out["bookEnd"] = be, bs
		}
	}

	if when("recrawlMode") {
		if strOf(body["recrawlMode"], 20) == "full" {
			out["recrawlMode"] = "full"
		} else {
			out["recrawlMode"] = "incremental"
		}
	}
	if when("storageMode") {
		if strOf(body["storageMode"], 10) == "txt" {
			out["storageMode"] = "txt"
		} else {
			out["storageMode"] = "db"
		}
	}
	if when("fetchConfig") {
		switch fc := body["fetchConfig"].(type) {
		case map[string]any:
			b, _ := json.Marshal(fc)
			if len(b) > 50_000 {
				return nil, "反反爬配置过大"
			}
			out["fetchConfig"] = string(b)
		case string:
			if len(fc) > 50_000 {
				return nil, "反反爬配置过大"
			}
			out["fetchConfig"] = fc
		default:
			out["fetchConfig"] = "{}"
		}
	}
	if when("threadMin") {
		out["threadMin"] = clampIntOf(body["threadMin"], 1, 1, 32)
	}
	if when("threadMax") {
		out["threadMax"] = clampIntOf(body["threadMax"], 3, 1, 32)
	}
	if tm, ok := out["threadMin"].(int); ok {
		if tx, ok2 := out["threadMax"].(int); ok2 && tx < tm {
			out["threadMax"] = tm
		}
	}
	if when("intervalMin") {
		out["intervalMin"] = clampIntOf(body["intervalMin"], 500, 0, 600_000)
	}
	if when("intervalMax") {
		out["intervalMax"] = clampIntOf(body["intervalMax"], 2000, 0, 600_000)
	}
	if im, ok := out["intervalMin"].(int); ok {
		if ix, ok2 := out["intervalMax"].(int); ok2 && ix < im {
			out["intervalMax"] = im
		}
	}

	if when("smartCategory") {
		out["smartCategory"] = body["smartCategory"] != false
	}
	if when("smartComplete") {
		out["smartComplete"] = body["smartComplete"] != false
	}
	if when("autoSuggest") {
		// [R63-c] autoSuggest 为透传预留字段: 落库但不被 Go 引擎消费(见 store.Task.AutoSuggest
		// 注) —— 引擎侧 buildPayload/流水线无读取点, 开启与否不改变采集行为
		out["autoSuggest"] = body["autoSuggest"] != false
	}
	if when("autoRefresh") {
		out["autoRefresh"] = body["autoRefresh"] == true
	}
	if when("refreshIntervalMin") {
		out["refreshIntervalMin"] = clampIntOf(body["refreshIntervalMin"], 30, 5, 1440)
	}
	return out, ""
}

// taskColumnGo 类型映射: patch 值 → SQL 值(bool→0/1)。
func taskColumnGo(v any) any {
	switch x := v.(type) {
	case bool:
		if x {
			return 1
		}
		return 0
	case int:
		return int64(x)
	default:
		return v
	}
}

var taskTextCols = []string{"name", "mode", "engine", "bookUrl", "bookIds", "bookIdFrom", "bookIdTo",
	"listUrl", "recrawlMode", "storageMode", "fetchConfig"}
var taskIntCols = []string{"listStart", "listEnd", "bookStart", "bookEnd",
	"threadMin", "threadMax", "intervalMin", "intervalMax", "refreshIntervalMin"}
var taskBoolCols = []string{"smartCategory", "smartComplete", "autoSuggest", "autoRefresh"}

func isValidTaskColumn(col string) bool {
	for _, c := range taskTextCols {
		if c == col {
			return true
		}
	}
	for _, c := range taskIntCols {
		if c == col {
			return true
		}
	}
	for _, c := range taskBoolCols {
		if c == col {
			return true
		}
	}
	return false
}

// ---------------- handlers ----------------

// (d Deps) adminTasksList GET /api/admin/tasks
func (d Deps) adminTasksList(w http.ResponseWriter, r *http.Request) {
	status := strings.TrimSpace(strOf(r.URL.Query().Get("status"), 20))
	q := `SELECT t.*, r.name AS ruleName FROM "Task" t LEFT JOIN "Rule" r ON r.id=t.ruleId`
	var args []any
	if taskStatuses[status] {
		q += ` WHERE t.status=?`
		args = append(args, status)
	}
	q += ` ORDER BY t.updatedAt DESC LIMIT 500`
	rows, err := d.DB.QueryMaps(q, args...)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	for _, row := range rows {
		// TS include rule:{id,name}; 前台列表列自带 ruleId→规则表映射兜底
		// (admin.js ruleNameOf), 故不回带 ruleName/rule 对象, 详情端点才带完整 rule
		delete(row, "ruleName")
		slimRowMap(row)
	}
	apiOK(w, rows)
}

// (d Deps) adminTasksCreate POST /api/admin/tasks
func (d Deps) adminTasksCreate(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	ruleID := strings.TrimSpace(strOf(body["ruleId"], 64))
	if ruleID == "" {
		apiErr(w, http.StatusBadRequest, "请选择采集规则")
		return
	}
	rule, ok, err := d.DB.QueryMap(`SELECT * FROM "Rule" WHERE id=?`, ruleID)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if !ok {
		apiErr(w, http.StatusNotFound, "规则不存在")
		return
	}
	data, nerr := normalizeTaskData(body, true)
	if nerr != "" {
		apiErr(w, http.StatusBadRequest, nerr)
		return
	}
	engine, _ := data["engine"].(string)
	if perr := validateTaskPair(
		strOf(data["mode"], 20), strOf(data["bookUrl"], 2000), strOf(data["listUrl"], 2000),
		strOf(data["bookIds"], 0), strOf(data["bookIdFrom"], 200), strOf(data["bookIdTo"], 200), engine); perr != "" {
		apiErr(w, http.StatusBadRequest, perr)
		return
	}

	cols := []string{"id", "ruleId", "status", "progress", "stats", "createdAt", "updatedAt"}
	vals := []any{d.DB.NewID(), ruleID, "pending", "{}", "{}", store.NowMS(), store.NowMS()}
	for _, c := range taskTextCols {
		cols = append(cols, c)
		vals = append(vals, strOf(data[c], 0))
	}
	for _, c := range taskIntCols {
		cols = append(cols, c)
		v, _ := data[c].(int)
		vals = append(vals, int64(v))
	}
	for _, c := range taskBoolCols {
		cols = append(cols, c)
		vals = append(vals, taskColumnGo(data[c]))
	}
	ph := strings.TrimSuffix(strings.Repeat("?,", len(cols)), ",")
	if _, err := d.DB.Exec(`INSERT INTO "Task" (`+strings.Join(cols, ",")+`) VALUES (`+ph+`)`, vals...); err != nil {
		// FK 竞态兜底: 规则被并发删除
		if strings.Contains(err.Error(), "FOREIGN KEY") {
			apiErr(w, http.StatusConflict, "所选采集规则已被删除, 请刷新后重试")
			return
		}
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	row, _, _ := d.DB.QueryMap(`SELECT t.*, r.name AS ruleName FROM "Task" t LEFT JOIN "Rule" r ON r.id=t.ruleId WHERE t.id=?`, vals[0])
	if row != nil {
		row["rule"] = rule
	}
	apiOK(w, row)
}

// (d Deps) adminTaskDetail GET /api/admin/tasks/{id}
func (d Deps) adminTaskDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	row, ok, err := d.DB.QueryMap(`SELECT * FROM "Task" WHERE id=?`, id)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if !ok {
		apiErr(w, http.StatusNotFound, "任务不存在")
		return
	}
	if rule, rok, _ := d.DB.QueryMap(`SELECT * FROM "Rule" WHERE id=?`, strOf(row["ruleId"], 64)); rok {
		row["rule"] = rule
	} else {
		row["rule"] = nil
	}
	slimRowMap(row)
	_, running, _ := d.Tasks.Status(id)
	row["live"] = running
	apiOK(w, row)
}

// (d Deps) adminTaskUpdate PUT /api/admin/tasks/{id}
func (d Deps) adminTaskUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	exist, ok, err := d.DB.QueryMap(`SELECT * FROM "Task" WHERE id=?`, id)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if !ok {
		apiErr(w, http.StatusNotFound, "任务不存在")
		return
	}

	patch, nerr := normalizeTaskData(body, false)
	if nerr != "" {
		apiErr(w, http.StatusBadRequest, nerr)
		return
	}
	if v, has := body["ruleId"]; has {
		rid := strings.TrimSpace(strOf(v, 64))
		if rid == "" {
			apiErr(w, http.StatusBadRequest, "请选择采集规则")
			return
		}
		if exists, e := d.DB.APIRuleExists(rid); e != nil || !exists {
			apiErr(w, http.StatusNotFound, "规则不存在")
			return
		}
		patch["ruleId"] = rid
	}

	// R3-41: 运行中禁改模式字段(mode/bookUrl/listUrl/bookIds/bookIdFrom/bookIdTo)
	_, running, _ := d.Tasks.Status(id)
	if running {
		for _, k := range []string{"mode", "bookUrl", "listUrl", "bookIds", "bookIdFrom", "bookIdTo"} {
			if v, has := patch[k]; has && strOf(v, 0) != strOf(exist[k], 0) {
				apiErr(w, http.StatusBadRequest, "任务运行中, 无法修改模式参数, 请先停止任务")
				return
			}
		}
	}

	// 合并生效值联动校验
	merged := map[string]any{}
	for k, v := range exist {
		merged[k] = v
	}
	for k, v := range patch {
		merged[k] = v
	}
	mergedEngine := strOf(merged["engine"], 4)
	if perr := validateTaskPair(
		strOf(merged["mode"], 20), strOf(merged["bookUrl"], 2000), strOf(merged["listUrl"], 2000),
		strOf(merged["bookIds"], 0), strOf(merged["bookIdFrom"], 200), strOf(merged["bookIdTo"], 200),
		mergedEngine); perr != "" {
		apiErr(w, http.StatusBadRequest, perr)
		return
	}

	if len(patch) == 0 {
		exist["rule"] = nil
		apiOK(w, exist)
		return
	}
	sets := []string{"updatedAt=?"}
	args := []any{store.NowMS()}
	for k, v := range patch {
		if !isValidTaskColumn(k) && k != "ruleId" {
			continue
		}
		sets = append(sets, k+"=?")
		args = append(args, taskColumnGo(v))
	}
	args = append(args, id)
	if _, err := d.DB.Exec(`UPDATE "Task" SET `+strings.Join(sets, ", ")+` WHERE id=?`, args...); err != nil {
		if strings.Contains(err.Error(), "FOREIGN KEY") {
			apiErr(w, http.StatusConflict, "所选采集规则已被删除, 请刷新后重试")
			return
		}
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	row, _, _ := d.DB.QueryMap(`SELECT * FROM "Task" WHERE id=?`, id)
	apiOK(w, row)
}

// (d Deps) adminTaskDelete DELETE /api/admin/tasks/{id}
func (d Deps) adminTaskDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	exist, ok, err := d.DB.QueryMap(`SELECT id FROM "Task" WHERE id=?`, id)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if !ok {
		apiErr(w, http.StatusNotFound, "任务不存在")
		return
	}
	// 运行中先发停止信号再删(尽力而为, 失败不阻断删除)
	if _, running, _ := d.Tasks.Status(id); running {
		_, _ = d.Tasks.Control(id, "stop")
	}
	if _, err := d.DB.APIDeleteTaskRow(strOf(exist["id"], 64)); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, nil)
}

// ---------------- control ----------------

var finalStatuses = map[string]bool{"done": true, "error": true, "stopped": true}

// (d Deps) adminTaskControl POST /api/admin/tasks/{id}/control
// action: start|pause|resume|stop; pause/resume/stop → Deps.Tasks.Control,
// start → 终态条件重置 pending 后 Deps.Tasks.Start(语义: 不存在→404; 在跑→管理器裁决)。
func (d Deps) adminTaskControl(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	action := strings.TrimSpace(strOf(body["action"], 10))
	switch action {
	case "start", "pause", "resume", "stop":
	default:
		apiErr(w, http.StatusBadRequest, "无效操作")
		return
	}
	row, ok, err := d.DB.QueryMap(`SELECT id,status FROM "Task" WHERE id=?`, id)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if !ok {
		apiErr(w, http.StatusNotFound, "任务不存在")
		return
	}
	if action == "start" {
		if finalStatuses[strOf(row["status"], 10)] {
			// R5-7 口径: control 成功前置由管理器裁决; 这里仅做终态条件重置(失败静默放行)
			_, _ = d.DB.UpdateTaskStatusIf(id, "pending", strOf(row["status"], 10))
		}
		if err := d.Tasks.Start(id); err != nil {
			apiErr(w, http.StatusBadRequest, err.Error())
			return
		}
		apiOK(w, map[string]any{"action": action})
		return
	}
	if _, err := d.Tasks.Control(id, action); err != nil {
		if strings.Contains(err.Error(), "任务不存在") {
			apiErr(w, http.StatusNotFound, "任务不存在")
			return
		}
		apiErr(w, http.StatusBadRequest, err.Error())
		return
	}
	apiOK(w, map[string]any{"action": action})
}

// ---------------- batch ----------------

// parseBatchBody 批量入参解析(对齐 _lib/batch.ts)。
func parseBatchBody(body map[string]any, actions []string) (action string, ids []string, payload map[string]any, errMsg string) {
	if !isPlainObj(body) {
		return "", nil, nil, "批量操作入参格式错误"
	}
	action = strings.TrimSpace(strOf(body["action"], 20))
	okAct := false
	for _, a := range actions {
		if a == action {
			okAct = true
			break
		}
	}
	if !okAct {
		return "", nil, nil, "无效的批量操作"
	}
	rawIDs, ok := body["ids"].([]any)
	if !ok {
		return "", nil, nil, "缺少待操作的 ids 列表"
	}
	seen := map[string]bool{}
	for _, raw := range rawIDs {
		if raw == nil {
			continue
		}
		id := strings.TrimSpace(store.ToStr(raw))
		if len(id) > 64 {
			id = id[:64]
		}
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
		if len(ids) > 500 {
			return "", nil, nil, "单次批量操作最多 500 项, 请分批进行"
		}
	}
	if len(ids) == 0 {
		return "", nil, nil, "未选择任何项目"
	}
	if p, ok := body["payload"].(map[string]any); ok {
		payload = p
	} else {
		payload = map[string]any{}
	}
	return action, ids, payload, ""
}

type batchSkip struct {
	Name   string `json:"name,omitempty"`
	Reason string `json:"reason"`
}

func skipItem(reason, name string) batchSkip {
	return batchSkip{Name: name, Reason: reason}
}

// (d Deps) adminTasksBatch POST /api/admin/tasks/batch
func (d Deps) adminTasksBatch(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	action, ids, _, errMsg := parseBatchBody(body, []string{"start", "pause", "stop", "delete"})
	if errMsg != "" {
		apiErr(w, http.StatusBadRequest, errMsg)
		return
	}
	skipped := []batchSkip{}
	affected := 0

	if action == "delete" {
		for _, id := range ids {
			row, ok, err := d.DB.QueryMap(`SELECT id,name FROM "Task" WHERE id=?`, id)
			if err != nil {
				skipped = append(skipped, skipItem("操作失败(内部错误), 请重试", ""))
				continue
			}
			if !ok {
				skipped = append(skipped, skipItem("任务不存在(可能已删除)", ""))
				continue
			}
			// 运行中跳过(批量保护优先, 与单删"先停止再删"不同)
			if _, running, _ := d.Tasks.Status(id); running {
				skipped = append(skipped, skipItem("任务运行中, 请先停止再删除", strOf(row["name"], 100)))
				continue
			}
			okDel, err := d.DB.APIDeleteTaskRow(id)
			if err != nil || !okDel {
				skipped = append(skipped, skipItem("操作失败(内部错误), 请重试", strOf(row["name"], 100)))
				continue
			}
			affected++
		}
		apiOK(w, map[string]any{"affected": affected, "skipped": skipped})
		return
	}

	for _, id := range ids {
		row, ok, _ := d.DB.QueryMap(`SELECT id,name,status FROM "Task" WHERE id=?`, id)
		if !ok {
			skipped = append(skipped, skipItem("任务不存在(可能已删除)", ""))
			continue
		}
		var err error
		if action == "start" {
			st := strOf(row["status"], 10)
			if finalStatuses[st] {
				_, _ = d.DB.UpdateTaskStatusIf(id, "pending", st)
			}
			err = d.Tasks.Start(id)
		} else {
			_, err = d.Tasks.Control(id, action)
		}
		if err != nil {
			skipped = append(skipped, skipItem(err.Error(), strOf(row["name"], 100)))
			continue
		}
		affected++
	}
	apiOK(w, map[string]any{"affected": affected, "skipped": skipped})
}

// ---------------- logs ----------------

var lastLogPrune atomic.Int64

// (d Deps) adminTaskLogs GET /api/admin/tasks/{id}/logs
func (d Deps) adminTaskLogs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Task" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "任务不存在")
		return
	}
	// 30 天清理(进程级 60s 节流, R31-7 口径)
	now := store.NowMS()
	if now-lastLogPrune.Load() >= 60_000 {
		if lastLogPrune.CompareAndSwap(lastLogPrune.Load(), now) {
			d.DB.APITaskLogPruneTask(id, now-30*24*3600*1000)
		}
	}
	q := `SELECT * FROM "TaskLog" WHERE taskId=?`
	args := []any{id}
	after := strings.TrimSpace(strOf(r.URL.Query().Get("after"), 64))
	if after != "" {
		q += ` AND id>?`
		args = append(args, after)
	}
	level := strings.TrimSpace(strOf(r.URL.Query().Get("level"), 20))
	if level == "info" || level == "success" || level == "warn" || level == "error" {
		q += ` AND level=?`
		args = append(args, level)
	}
	q += ` ORDER BY id ASC LIMIT 200`
	rows, err := d.DB.QueryMaps(q, args...)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, rows)
}
