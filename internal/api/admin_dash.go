// ============================================================
// R55-3b — 仪表盘/健康/设置(移植 stats/route.ts + health/route.ts + settings/route.ts)
//
//	GET /api/admin/stats     计数聚合 + 7 日入库曲线(countPerDay7d 窄区间扫描)
//	GET /api/admin/health    进程 RSS/uptime/GC + DB 状态与文件大小 + 任务态
//	GET/PUT /api/admin/settings  Setting KV(JSON 值; 代码内默认值兜底)
//
// ============================================================
package api

import (
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"runtime"
	"time"

	"mhgl/internal/store"
)

var bootAtAPI = time.Now()

// (d Deps) adminStats GET /api/admin/stats
func (d Deps) adminStats(w http.ResponseWriter, r *http.Request) {
	// 仪表盘加载顺手全局清理 30 天前 TaskLog(兜底已删任务孤儿日志)
	d.DB.APITaskLogPruneAll(store.NowMS() - 30*24*3600*1000)

	books, _ := d.DB.Count(`SELECT count(*) FROM "Book"`)
	chapters, _ := d.DB.Count(`SELECT count(*) FROM "Chapter"`)
	rules, _ := d.DB.Count(`SELECT count(*) FROM "Rule"`)
	tasks, _ := d.DB.Count(`SELECT count(*) FROM "Task"`)
	runningTasks, _ := d.DB.Count(`SELECT count(*) FROM "Task" WHERE status IN ('running','paused')`)
	sites, _ := d.DB.Count(`SELECT count(*) FROM "Site"`)
	tags, _ := d.DB.Count(`SELECT count(*) FROM "BookTag"`)
	downloads, _ := d.DB.Count(`SELECT count(*) FROM "DownloadJob"`)
	totalWords := int64(0)
	_ = d.DB.QueryRow(`SELECT COALESCE(SUM(wordCount),0) FROM "Chapter"`).Scan(&totalWords)

	recentTasks, _ := d.DB.QueryMaps(`SELECT t.*, r.name AS ruleName FROM "Task" t
LEFT JOIN "Rule" r ON r.id=t.ruleId ORDER BY t.updatedAt DESC LIMIT 6`)
	for _, row := range recentTasks {
		if rn, ok := row["ruleName"]; ok {
			row["rule"] = map[string]any{"name": rn}
			delete(row, "ruleName")
		}
		slimRowMap(row)
	}
	recentBooks, _ := d.DB.QueryMaps(`SELECT b.id,b.name,b.author,b.cover,b.status,b.updatedAt,
 (SELECT count(*) FROM "Chapter" ch WHERE ch.bookId=b.id) AS chapterCount
FROM "Book" b ORDER BY b.updatedAt DESC LIMIT 6`)
	categories, _ := d.DB.QueryMaps(`SELECT c.id,c.name,
 (SELECT count(*) FROM "Book" b WHERE b.categoryId=c.id) AS bookCount
FROM "Category" c ORDER BY c.sortOrder ASC LIMIT 500`)

	// feat-b 可视化扩展
	wordsByCategoryRows, _ := d.DB.QueryMaps(`SELECT c.name, COALESCE(SUM(b.wordCount),0) AS words
FROM "Category" c LEFT JOIN "Book" b ON b.categoryId=c.id
GROUP BY c.id ORDER BY words DESC`)
	booksByStatusRows, _ := d.DB.QueryMaps(`SELECT status, count(*) AS count FROM "Book" GROUP BY status`)
	taskStatusRows, _ := d.DB.QueryMaps(`SELECT status, count(*) AS count FROM "Task" GROUP BY status`)
	chapters7d := countPerDay7d(d, "Chapter")
	books7d := countPerDay7d(d, "Book")

	apiOK(w, map[string]any{
		"books": books, "chapters": chapters, "rules": rules, "tasks": tasks,
		"runningTasks": runningTasks, "sites": sites, "tags": tags, "downloads": downloads,
		"totalWords":          totalWords,
		"recentTasks":         recentTasks,
		"recentBooks":         recentBooks,
		"categories":          categories,
		"wordsByCategory":     wordsByCategoryRows,
		"booksByStatus":       booksByStatusRows,
		"chaptersLast7d":      chapters7d,
		"booksLast7d":         books7d,
		"taskStatusBreakdown": taskStatusRows,
	})
}

// countPerDay7d 近 7 天逐日入库计数(R9-d-7: 本地自然日窄区间扫描, Chapter.createdAt 索引命中)。
func countPerDay7d(d Deps, table string) []map[string]any {
	out := make([]map[string]any, 0, 7)
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	for i := 6; i >= 0; i-- {
		dayStart := today.AddDate(0, 0, -i)
		dayEnd := dayStart.AddDate(0, 0, 1)
		n, _ := d.DB.Count(`SELECT count(*) FROM "`+table+`" WHERE createdAt>=? AND createdAt<?`,
			dayStart.UnixMilli(), dayEnd.UnixMilli())
		out = append(out, map[string]any{
			"day":   dayStart.Format("01-02"),
			"count": n,
		})
	}
	return out
}

// (d Deps) adminHealth GET /api/admin/health
func (d Deps) adminHealth(w http.ResponseWriter, r *http.Request) {
	dbStatus := "fail"
	if err := d.DB.Ping(); err == nil {
		dbStatus = "ok"
	}
	runningTasks, _ := d.DB.Count(`SELECT count(*) FROM "Task" WHERE status='running'`)
	pausedTasks, _ := d.DB.Count(`SELECT count(*) FROM "Task" WHERE status='paused'`)

	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	dbSize := int64(0)
	if st, err := os.Stat(dbPathOf(d)); err == nil {
		dbSize = st.Size()
	}
	gcPausedNs := int64(0)
	if ms.NumGC > 0 {
		gcPausedNs = int64(ms.PauseNs[(ms.NumGC+255)%256])
	}
	status := "healthy"
	if dbStatus != "ok" {
		status = "unhealthy"
	}
	apiOK(w, map[string]any{
		"status":      status,
		"uptime":      int(time.Since(bootAtAPI).Seconds()),
		"db":          dbStatus,
		"dbSizeBytes": dbSize,
		"runner": map[string]any{
			"activeTasks": runningTasks + pausedTasks,
			"runtimes":    runningTasks,
			"running":     runningTasks,
			"paused":      pausedTasks,
		},
		"hostGate": map[string]any{"hosts": 0},
		// mini-services 已随单体化退役(PARITY): services 恒空对象
		"services": map[string]any{},
		"memory": map[string]any{
			"rss":       int64(ms.Sys),
			"heapUsed":  int64(ms.HeapAlloc),
			"heapTotal": int64(ms.HeapSys),
		},
		"gc": map[string]any{
			"numGC":       ms.NumGC,
			"lastPauseNs": gcPausedNs,
		},
	})
}

// dbPathOf 取 DB 文件路径(PRAGMA database_list)。
func dbPathOf(d Deps) string {
	var file string
	if err := d.DB.QueryRow(`PRAGMA database_list`).Scan(new(any), new(any), &file); err != nil || file == "" {
		return "db/custom.db"
	}
	return file
}

// ---------------- settings ----------------

var settingKeyRe = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,64}$`)

// settingDefaults 代码内默认值兜底(Setting 表为空时全站生效; 键枚举自
// SettingsSection.tsx / links.ts / pseudostatic.ts / banned-words.ts / seo-tpl.ts /
// proxy-pool.ts / theme-overrides.ts / pseo-server.ts)。
var settingDefaults = map[string]any{
	"download":         map[string]any{"siteName": "", "siteUrl": ""},
	"pseudostatic":     map[string]any{"preset": "query"},
	"linkwheel":        map[string]any{"enabled": true, "mode": "home", "count": 6},
	"bannedWords":      map[string]any{"enabled": false, "mode": "mask", "words": []any{}},
	"seoTemplates":     map[string]any{},
	"proxyPool":        map[string]any{"auto": true, "intervalMin": 30, "checkBatch": 250, "pickLimit": 8},
	"theme_overrides":  map[string]any{},
	"pseoAutoGenerate": "0",
	"feedback":         map[string]any{"enabled": true}, // R60-2b: 反馈开关(公开提交+反馈页共用, 缺省开)
}

// readAllSettings 全量设置(DB 覆盖默认; 值 JSON 解析, 失败回落原字符串)。
func (d Deps) readAllSettings() map[string]any {
	out := map[string]any{}
	for k, v := range settingDefaults {
		out[k] = v
	}
	rows, err := d.DB.AllSettings()
	if err != nil {
		return out
	}
	for k, v := range rows {
		var parsed any
		if json.Unmarshal([]byte(v), &parsed) == nil {
			out[k] = parsed
		} else {
			out[k] = v
		}
	}
	return out
}

// (d Deps) adminSettingsGet GET /api/admin/settings
func (d Deps) adminSettingsGet(w http.ResponseWriter, r *http.Request) {
	apiOK(w, d.readAllSettings())
}

// (d Deps) adminSettingsPut PUT /api/admin/settings
func (d Deps) adminSettingsPut(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	if len(body) == 0 {
		apiErr(w, http.StatusBadRequest, "没有需要保存的设置项")
		return
	}
	if len(body) > 100 {
		apiErr(w, http.StatusBadRequest, "单次最多保存 100 个设置项")
		return
	}
	for key, value := range body {
		if !settingKeyRe.MatchString(key) {
			apiErr(w, http.StatusBadRequest, "非法的设置项 key: "+truncateRunes(key, 32))
			return
		}
		serialized, err := json.Marshal(value)
		if err != nil {
			apiErr(w, http.StatusBadRequest, "设置项 "+key+" 不可序列化")
			return
		}
		if len(serialized) > 100_000 {
			apiErr(w, http.StatusBadRequest, "设置项 "+key+" 过大(上限100KB)")
			return
		}
		if err := d.DB.SetSetting(key, string(serialized)); err != nil {
			apiErr(w, http.StatusInternalServerError, "服务器内部错误")
			return
		}
		if key == "bannedWords" {
			invalidateBannedWordsCache() // 对齐 TS settings PUT 失效钩子(R21-h-1)
		}
	}
	apiOK(w, d.readAllSettings())
}

// protectedSettingKeys 代码内读取的设置键白名单(不可删除)。[R67-c] 新增 DELETE 端点时
// 评估口径: rg 全 internal 的 GetSetting(/SettingJSON( 读点 —— 删除即功能退化的键全集:
//
//	bannedWords(违禁词 api+bridge) / seoTemplates(前台 TDK) / theme_overrides(主题覆盖)
//	linkwheel(友链链轮) / feedback(反馈开关) / pseoAutoGenerate(PSEO 自动钩子)
//	proxyPool(代理池) / download(TXT 下载兜底文案) / pseudostatic(伪静态预设)
//
// 这些键只能改值(复位为默认), 不能整键删除。
var protectedSettingKeys = map[string]bool{
	"bannedWords": true, "seoTemplates": true, "theme_overrides": true,
	"linkwheel": true, "feedback": true, "pseoAutoGenerate": true,
	"proxyPool": true, "download": true, "pseudostatic": true,
	// [R70-c] 内容伪装/分卷显示键(代码内读点: internal/web 伪装出口+目录分卷分组;
	// 删除即功能退回默认关, 与核心键同一防护口径)
	"stealth.obfuscate": true, "stealth.transcode": true, "stealth.transcode.mode": true,
	"stealth.interfere": true, "stealth.interfere.mode": true, "stealth.interfere.density": true,
	"stealth.pseudo": true, "stealth.pseudo.seed": true, "book.volume.show": true,
}

// (d Deps) adminSettingDelete DELETE /api/admin/settings/{key} — [R67-c] R66-c 审查发现⑤。
// 删除非核心设置键(误加探针键/历史垃圾行); 核心键(代码内读点, protectedSettingKeys)
// 拒绝删除并提示复位路径。删除动作不触发缓存失效(核心键不可删, bannedWords 在白名单内)。
func (d Deps) adminSettingDelete(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	if !settingKeyRe.MatchString(key) {
		apiErr(w, http.StatusBadRequest, "非法的设置项 key")
		return
	}
	if protectedSettingKeys[key] {
		apiErr(w, http.StatusBadRequest, "核心设置键不可删除(删除会使对应功能退化), 如需复位请将其值改回默认")
		return
	}
	res, err := d.DB.Exec(`DELETE FROM "Setting" WHERE key=?`, key)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		apiErr(w, http.StatusNotFound, "设置键不存在")
		return
	}
	apiOK(w, map[string]any{"deleted": true, "key": key})
}
