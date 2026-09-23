// ============================================================
// R55-3b — 运营/运维面: 反馈管理 / TXT下载 / 代理池 / 备份
//
//	/ PSEO / 违禁词 / SEO模板 / 主题
//
// ============================================================
package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"mhgl/internal/crawl/proxy"
	"mhgl/internal/store"
)

// ---------------- feedback 管理 ----------------

var feedbackStatuses = map[string]bool{"new": true, "read": true, "resolved": true, "ignored": true}
var feedbackTypes = map[string]bool{"bug": true, "suggestion": true, "praise": true, "other": true}

// (d Deps) adminFeedbackList GET /api/admin/feedback
func (d Deps) adminFeedbackList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page0, size := pageClamp(q, 1, 20, 100)
	status := strOf(q.Get("status"), 20)
	typ := strOf(q.Get("type"), 20)
	qLike := likeSafe(q.Get("q"), 100)
	where := []string{"1=1"}
	var args []any
	if feedbackStatuses[status] {
		where = append(where, `status=?`)
		args = append(args, status)
	}
	if feedbackTypes[typ] {
		where = append(where, `type=?`)
		args = append(args, typ)
	}
	if qLike != "" {
		where = append(where, `content LIKE ?`)
		args = append(args, "%"+qLike+"%")
	}
	whereSQL := strings.Join(where, " AND ")
	total, err := d.DB.Count(`SELECT count(*) FROM "Feedback" WHERE `+whereSQL, args...)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	page := minInt(page0, lastPage(total, size))
	rows, err := d.DB.QueryMaps(`SELECT * FROM "Feedback" WHERE `+whereSQL+
		` ORDER BY createdAt DESC LIMIT ? OFFSET ?`, append(args, size, (page-1)*size)...)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	allCount, _ := d.DB.Count(`SELECT count(*) FROM "Feedback"`)
	newCount, _ := d.DB.Count(`SELECT count(*) FROM "Feedback" WHERE status='new'`)
	resolvedCount, _ := d.DB.Count(`SELECT count(*) FROM "Feedback" WHERE status='resolved'`)
	apiOK(w, map[string]any{
		"rows": rows, "total": total, "page": page, "size": size,
		"pages": maxInt(1, lastPage(total, size)),
		"stats": map[string]any{"total": allCount, "new": newCount, "resolved": resolvedCount},
	})
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// (d Deps) adminFeedbackDetail GET /api/admin/feedback/{id}
func (d Deps) adminFeedbackDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	row, ok, err := d.DB.QueryMap(`SELECT * FROM "Feedback" WHERE id=?`, id)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if !ok {
		apiErr(w, http.StatusNotFound, "反馈不存在")
		return
	}
	apiOK(w, row)
}

// (d Deps) adminFeedbackUpdate PUT/PATCH /api/admin/feedback/{id}
func (d Deps) adminFeedbackUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Feedback" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "反馈不存在")
		return
	}
	sets := []string{"updatedAt=?"}
	args := []any{store.NowMS()}
	if v, has := body["status"]; has {
		st := strings.TrimSpace(strOf(v, 20))
		if !feedbackStatuses[st] {
			apiErr(w, http.StatusBadRequest, "状态值不合法")
			return
		}
		sets, args = append(sets, "status=?"), append(args, st)
	}
	if v, has := body["adminNote"]; has {
		// R5-17: 剥 HTML 标签
		note := stripHTML(strOf(v, 1000))
		note = strings.TrimSpace(note)
		if note == "" {
			args = append(args, nil)
		} else {
			args = append(args, note)
		}
		sets = append(sets, "adminNote=?")
	}
	if len(sets) == 1 {
		apiErr(w, http.StatusBadRequest, "没有可更新字段")
		return
	}
	args = append(args, id)
	if _, err := d.DB.Exec(`UPDATE "Feedback" SET `+strings.Join(sets, ", ")+` WHERE id=?`, args...); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	row, _, _ := d.DB.QueryMap(`SELECT * FROM "Feedback" WHERE id=?`, id)
	apiOK(w, row)
}

func stripHTML(s string) string {
	var b strings.Builder
	depth := 0
	for _, ch := range s {
		switch {
		case ch == '<':
			depth++
		case ch == '>':
			if depth > 0 {
				depth--
			}
		case depth == 0:
			b.WriteRune(ch)
		}
	}
	return b.String()
}

// (d Deps) adminFeedbackDelete DELETE /api/admin/feedback/{id}
func (d Deps) adminFeedbackDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, ok, _ := d.DB.QueryMap(`SELECT id FROM "Feedback" WHERE id=?`, id); !ok {
		apiErr(w, http.StatusNotFound, "反馈不存在")
		return
	}
	if _, err := d.DB.Exec(`DELETE FROM "Feedback" WHERE id=?`, id); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, nil)
}

// ---------------- downloads(TXT 生成) ----------------

// downloadsRoot 成品落盘目录(主控裁定: web/downloads; TS 原为 data/downloads, PARITY 记录)。
const downloadsRoot = "web/downloads"

var dlMu sync.Mutex
var dlInFlight int

const maxConcurrentDownloads = 3

// (d Deps) adminDownloadsList GET /api/admin/downloads
func (d Deps) adminDownloadsList(w http.ResponseWriter, r *http.Request) {
	rows, err := d.DB.QueryMaps(`SELECT j.*, b.name AS bookName, b.author AS bookAuthor
FROM "DownloadJob" j LEFT JOIN "Book" b ON b.id=j.bookId ORDER BY j.createdAt DESC LIMIT 500`)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	for _, row := range rows {
		row["book"] = map[string]any{"name": row["bookName"], "author": row["bookAuthor"]}
		delete(row, "bookName")
		delete(row, "bookAuthor")
	}
	apiOK(w, rows)
}

// (d Deps) adminDownloadsCreate POST /api/admin/downloads
func (d Deps) adminDownloadsCreate(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	job, ok := d.createDownloadJob(w, body)
	if !ok {
		return
	}
	apiOK(w, job)
}

// createDownloadJob 校验入参→建行→goroutine 生成(核心移植 src/lib/crawl/downloader.ts)。
func (d Deps) createDownloadJob(w http.ResponseWriter, body map[string]any) (map[string]any, bool) {
	bookID := strings.TrimSpace(strOf(body["bookId"], 64))
	if bookID == "" {
		apiErr(w, http.StatusBadRequest, "请选择书籍")
		return nil, false
	}
	book, ok, err := d.DB.QueryMap(`SELECT id,name FROM "Book" WHERE id=?`, bookID)
	if err != nil || !ok {
		apiErr(w, http.StatusNotFound, "书籍不存在")
		return nil, false
	}
	if n, _ := d.DB.ChapterCount(bookID); n == 0 {
		apiErr(w, http.StatusBadRequest, "该书暂无章节, 无法生成下载")
		return nil, false
	}
	// 陈旧孤儿清扫(1h 无终态 → error)
	_, _ = d.DB.Exec(`UPDATE "DownloadJob" SET status='error', error='生成中断(服务重启或进程退出), 请重新发起'
WHERE status IN ('pending','running') AND createdAt < ?`, store.NowMS()-3600_000)

	// 并发上限(3)
	dlMu.Lock()
	dlInFlight++
	slot := dlInFlight
	dlMu.Unlock()
	dbActive, _ := d.DB.Count(`SELECT count(*) FROM "DownloadJob" WHERE status IN ('pending','running')`)
	if dbActive >= maxConcurrentDownloads || slot > maxConcurrentDownloads {
		dlMu.Lock()
		dlInFlight--
		dlMu.Unlock()
		apiErr(w, http.StatusTooManyRequests, fmt.Sprintf("已有 %d 个下载任务进行中，请稍后再试", maxConcurrentDownloads))
		return nil, false
	}

	options := map[string]any{}
	for _, k := range []string{"siteInfo", "siteName", "siteUrl", "insertAds", "adInterval", "headerTemplate", "footerTemplate"} {
		if v, has := body[k]; has {
			options[k] = v
		}
	}
	optsJSON, _ := json.Marshal(options)
	jobID := d.DB.NewID()
	if _, err := d.DB.Exec(`INSERT INTO "DownloadJob" (id,bookId,options,status,createdAt) VALUES (?,?,?,'pending',?)`,
		jobID, bookID, string(optsJSON), store.NowMS()); err != nil {
		dlMu.Lock()
		dlInFlight--
		dlMu.Unlock()
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return nil, false
	}
	go d.runDownloadJob(jobID, bookID)
	row, _, _ := d.DB.QueryMap(`SELECT * FROM "DownloadJob" WHERE id=?`, jobID)
	if row != nil {
		row["book"] = map[string]any{"name": book["name"]}
	}
	return row, true
}

// runDownloadJob 生成任务: 头部信息 + 章节串联(downloader.ts 核心口径)。
// 简化档: 混淆(obfuscate)未迁移(合规默认关闭); 广告插入/站点信息/头尾模板保留。
func (d Deps) runDownloadJob(jobID, bookID string) {
	defer func() {
		dlMu.Lock()
		dlInFlight--
		dlMu.Unlock()
		if rec := recover(); rec != nil {
			_, _ = d.DB.Exec(`UPDATE "DownloadJob" SET status='error', error=? WHERE id=?`,
				truncateRunes(fmt.Sprint(rec), 300), jobID)
		}
	}()
	book, ok, err := d.DB.QueryMap(`SELECT * FROM "Book" WHERE id=?`, bookID)
	if err != nil || !ok {
		_, _ = d.DB.Exec(`UPDATE "DownloadJob" SET status='error', error='书籍不存在' WHERE id=?`, jobID)
		return
	}
	var opts struct {
		SiteInfo       bool   `json:"siteInfo"`
		SiteName       string `json:"siteName"`
		SiteURL        string `json:"siteUrl"`
		InsertAds      bool   `json:"insertAds"`
		Ads            []string
		AdInterval     int    `json:"adInterval"`
		HeaderTemplate string `json:"headerTemplate"`
		FooterTemplate string `json:"footerTemplate"`
	}
	opts.SiteInfo = true
	opts.InsertAds = true
	opts.AdInterval = 10
	opts.Ads = []string{"本书由 {site} 收录整理，更多精彩好书请访问本站。", "记得收藏本书网址，防止迷路哦～"}
	opts.HeaderTemplate = "《{book}》\n作者：{author}\n来源：{site}\n\n简介：{intro}\n\n==================\n"
	opts.FooterTemplate = "\n==================\n全书完 —— 由 {site} 提供下载"
	if raw, ok2, _ := d.DB.QueryMap(`SELECT options FROM "DownloadJob" WHERE id=?`, jobID); ok2 {
		if oj, ok3 := raw["options"].(string); ok3 && oj != "" {
			_ = json.Unmarshal([]byte(oj), &opts)
		}
	}
	siteName, siteURL := opts.SiteName, opts.SiteURL
	if siteName == "" || siteURL == "" {
		if site, okS, _ := d.DB.DefaultSite(); okS {
			if siteName == "" {
				siteName = store.ToStr(site["name"])
			}
			if siteURL == "" {
				siteURL = store.ToStr(site["domain"])
			}
		}
	}
	if siteName == "" {
		siteName = "小说站"
	}
	siteTag := siteName
	if siteURL != "" {
		siteTag = siteName + "(" + siteURL + ")"
	}
	bookName := store.ToStr(book["name"])
	author := store.ToStr(book["author"])
	intro := strings.SplitN(stripHTML(store.ToStr(book["intro"])), "\n", 2)[0]
	intro = truncateRunes(strings.TrimSpace(intro), 200)
	header := strings.NewReplacer(
		"{book}", bookName, "{author}", author, "{site}", siteTag, "{intro}", intro,
	).Replace(opts.HeaderTemplate)

	_ = os.MkdirAll(downloadsRoot, 0o755)
	safeBase := sanitizeFileBase(bookName, 60)
	outPath := filepath.Join(downloadsRoot, fmt.Sprintf("%s_%d_%d.txt", safeBase, store.NowMS(), time.Now().UnixNano()%100000))
	f, err := os.Create(outPath)
	if err != nil {
		_, _ = d.DB.Exec(`UPDATE "DownloadJob" SET status='error', error=? WHERE id=?`,
			truncateRunes(err.Error(), 300), jobID)
		return
	}
	writePart := func(part string) { _, _ = f.WriteString(part) }
	gap := "\n\n"

	statusCompleted := store.ToStr(book["status"]) == "completed"
	wordCount := store.ToInt(book["wordCount"])
	if opts.SiteInfo {
		writePart(fmt.Sprintf("【本书信息】\n书名：%s\n作者：%s\n分类：%s\n字数：约%d万字\n来源：%s\n\n==================\n",
			bookName, author, map[bool]string{true: "完结", false: "连载"}[statusCompleted], wordCount/10000, siteTag))
	}
	writePart(header)

	count := 0
	var lastIdx int64
	ads := opts.Ads
	adEvery := opts.AdInterval
	if adEvery <= 0 {
		adEvery = 10
	}
	fail := func(msg string) {
		_ = f.Close()
		_ = os.Remove(outPath)
		_, _ = d.DB.Exec(`UPDATE "DownloadJob" SET status='error', error=? WHERE id=?`, truncateRunes(msg, 300), jobID)
	}
	for {
		batch, err := d.DB.QueryMaps(`SELECT idx,title,volume,content,storage,filePath FROM "Chapter"
WHERE bookId=? AND idx>? ORDER BY idx ASC LIMIT 500`, bookID, lastIdx)
		if err != nil {
			fail("章节读取失败: " + err.Error())
			return
		}
		if len(batch) == 0 {
			break
		}
		for _, ch := range batch {
			lastIdx = store.ToInt(ch["idx"])
			title := store.ToStr(ch["title"])
			text := chapterPlainText(ch)
			if text == "" {
				continue
			}
			count++
			if vol := store.ToStr(ch["volume"]); vol != "" {
				writePart(gap + "══════ " + vol + " ══════")
			}
			writePart(gap + "\n" + title + "\n\n" + text)
			if opts.SiteInfo && count%5 == 0 {
				writePart("\n—— 本章节由 " + siteTag + " 整理 ——")
			}
			if opts.InsertAds && len(ads) > 0 && count%adEvery == 0 {
				writePart("\n\n【" + ads[0] + "】")
			}
		}
	}
	writePart(strings.NewReplacer("{site}", siteTag, "{book}", bookName, "{author}", author, "{intro}", intro).
		Replace(opts.FooterTemplate))
	size, _ := f.Seek(0, io.SeekEnd)
	_ = f.Close()
	_, _ = d.DB.Exec(`UPDATE "DownloadJob" SET status='done', filePath=?, size=?, error=NULL WHERE id=?`,
		outPath, size, jobID)
}

// chapterPlainText 章节正文取文本(db: 剥 HTML; txt: 文件首行后内容)。
func chapterPlainText(ch map[string]any) string {
	if store.ToStr(ch["storage"]) == "txt" {
		fp := store.ToStr(ch["filePath"])
		if fp == "" {
			return ""
		}
		raw, err := os.ReadFile(safeJoinData(fp))
		if err != nil {
			return ""
		}
		lines := strings.Split(string(raw), "\n")
		if len(lines) > 0 {
			lines = lines[1:]
		}
		return strings.TrimSpace(strings.Join(lines, "\n"))
	}
	return stripHTML(store.ToStr(ch["content"]))
}

// safeJoinData txt 章节文件路径沙箱(相对 web/ 目录; 防穿越)。
func safeJoinData(rel string) string {
	clean := filepath.Clean("/" + rel)
	return filepath.Join("web", strings.TrimPrefix(clean, "/"))
}

func sanitizeFileBase(name string, max int) string {
	var b strings.Builder
	for _, r := range name {
		switch {
		case r < 0x20, strings.ContainsRune("\\/:*?\"<>|", r), r == ' ':
			b.WriteRune('_')
		default:
			b.WriteRune(r)
		}
		if b.Len() >= max*4 {
			break
		}
	}
	out := truncateRunes(b.String(), max)
	if out == "" {
		return "book"
	}
	return out
}

// (d Deps) adminDownloadDetail GET /api/admin/downloads/{id}
func (d Deps) adminDownloadDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	row, ok, err := d.DB.QueryMap(`SELECT j.*, b.name AS bookName FROM "DownloadJob" j
LEFT JOIN "Book" b ON b.id=j.bookId WHERE j.id=?`, id)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if !ok {
		apiErr(w, http.StatusNotFound, "任务不存在")
		return
	}
	row["book"] = map[string]any{"name": row["bookName"]}
	delete(row, "bookName")
	apiOK(w, row)
}

// (d Deps) adminDownloadDelete DELETE /api/admin/downloads/{id}
func (d Deps) adminDownloadDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	row, ok, err := d.DB.QueryMap(`SELECT id,filePath FROM "DownloadJob" WHERE id=?`, id)
	if err != nil || !ok {
		apiErr(w, http.StatusNotFound, "任务不存在")
		return
	}
	removeDownloadArtifact(store.ToStr(row["filePath"]))
	if _, err := d.DB.Exec(`DELETE FROM "DownloadJob" WHERE id=?`, id); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, nil)
}

// removeDownloadArtifact 成品文件清理(仅 web/downloads/ 内, 尽力而为)。
func removeDownloadArtifact(rel string) {
	if rel == "" {
		return
	}
	full := safeJoinData(rel)
	if strings.HasPrefix(filepath.Clean(full), downloadsRoot+string(os.PathSeparator)) ||
		filepath.Clean(full) == downloadsRoot {
		_ = os.Remove(full)
	}
}

// (d Deps) adminDownloadsBatch POST /api/admin/downloads/batch — delete|retry|regenerate
func (d Deps) adminDownloadsBatch(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	action, ids, _, errMsg := parseBatchBody(body, []string{"delete", "retry", "regenerate"})
	if errMsg != "" {
		apiErr(w, http.StatusBadRequest, errMsg)
		return
	}
	skipped := []batchSkip{}
	affected := 0
	for _, id := range ids {
		row, ok, _ := d.DB.QueryMap(`SELECT j.id,j.bookId,j.options,j.status,j.filePath, b.name AS bookName
FROM "DownloadJob" j LEFT JOIN "Book" b ON b.id=j.bookId WHERE j.id=?`, id)
		label := id
		if ok {
			if n := store.ToStr(row["bookName"]); n != "" {
				label = n
			}
		}
		if !ok {
			skipped = append(skipped, skipItem("记录不存在(可能已删除)", ""))
			continue
		}
		switch action {
		case "delete":
			removeDownloadArtifact(store.ToStr(row["filePath"]))
			if _, err := d.DB.Exec(`DELETE FROM "DownloadJob" WHERE id=?`, id); err != nil {
				skipped = append(skipped, skipItem("操作失败(内部错误), 请重试", label))
				continue
			}
			affected++
		case "retry":
			if store.ToStr(row["status"]) != "error" {
				skipped = append(skipped, skipItem("仅失败任务可重试", label))
				continue
			}
			if !d.recreateDownloadJob(w, row) {
				return // 429/校验失败已写响应
			}
			affected++
		case "regenerate":
			if store.ToStr(row["status"]) != "done" {
				skipped = append(skipped, skipItem("仅已完成任务可重新生成", label))
				continue
			}
			if !d.recreateDownloadJob(w, row) {
				return
			}
			affected++
		}
	}
	apiOK(w, map[string]any{"affected": affected, "skipped": skipped})
}

// recreateDownloadJob 以旧任务 options 重建生成任务。
func (d Deps) recreateDownloadJob(w http.ResponseWriter, row map[string]any) bool {
	opts := map[string]any{}
	if oj, ok := row["options"].(string); ok && oj != "" {
		var m map[string]any
		if json.Unmarshal([]byte(oj), &m) == nil {
			opts = m
		}
	}
	opts["bookId"] = store.ToStr(row["bookId"])
	_, ok := d.createDownloadJob(w, opts)
	return ok
}

// ---------------- proxy-pool ----------------

// (d Deps) adminProxyPool GET /api/admin/proxy-pool
func (d Deps) adminProxyPool(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, pageSize := clampIntOf(q.Get("page"), 1, 1, 100_000), clampIntOf(q.Get("pageSize"), 50, 5, 200)
	alive := strOf(q.Get("alive"), 8)
	country := strings.ToUpper(strOf(q.Get("country"), 2))
	protocol := strOf(q.Get("protocol"), 8)
	sort := strOf(q.Get("sort"), 12)

	where := []string{"1=1"}
	var args []any
	if alive == "true" {
		where = append(where, `alive=1`)
	} else if alive == "false" {
		where = append(where, `alive=0`)
	}
	if len(country) == 2 {
		where = append(where, `country=?`)
		args = append(args, country)
	}
	if protocol == "http" || protocol == "socks5" || protocol == "socks4" {
		where = append(where, `protocol=?`)
		args = append(args, protocol)
	}
	orderBy := `healthScore DESC, lastSuccessAt DESC`
	switch sort {
	case "checked":
		orderBy = `lastCheckedAt DESC, createdAt DESC`
	case "created":
		orderBy = `createdAt DESC`
	case "latency":
		orderBy = `latencyMs ASC, healthScore DESC`
	}
	whereSQL := strings.Join(where, " AND ")
	total, err := d.DB.Count(`SELECT count(*) FROM "FreeProxy" WHERE `+whereSQL, args...)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	list, err := d.DB.QueryMaps(`SELECT * FROM "FreeProxy" WHERE `+whereSQL+
		` ORDER BY `+orderBy+` LIMIT ? OFFSET ?`, append(args, pageSize, (page-1)*pageSize)...)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	stats := d.proxyStats()
	setting := d.poolSetting()
	apiOK(w, map[string]any{
		"stats":   stats,
		"setting": setting,
		"sources": proxy.PROXY_SOURCES,
		"job":     map[string]any{"running": false, "kind": "", "note": "harvest/check 已内建(R56-2a 收割器), POST harvest/check 即时执行"},
		"total":   total, "page": page, "pageSize": pageSize, "list": list,
	})
}

func (d Deps) proxyStats() map[string]any {
	total, _ := d.DB.Count(`SELECT count(*) FROM "FreeProxy"`)
	alive, _ := d.DB.Count(`SELECT count(*) FROM "FreeProxy" WHERE alive=1`)
	unchecked, _ := d.DB.Count(`SELECT count(*) FROM "FreeProxy" WHERE lastCheckedAt IS NULL`)
	countries, _ := d.DB.Count(`SELECT count(DISTINCT country) FROM "FreeProxy" WHERE country<>''`)
	avgLatency := 0
	var avgLat float64
	// AVG 返 float64 —— Scan 进 int 会 convertAssign 失败被吞(恒 0), 先取浮点再取整
	if err := d.DB.QueryRow(`SELECT COALESCE(AVG(latencyMs),0) FROM "FreeProxy" WHERE alive=1 AND latencyMs IS NOT NULL`).Scan(&avgLat); err == nil {
		avgLatency = int(avgLat + 0.5)
	}
	return map[string]any{
		"total": total, "alive": alive, "dead": total - alive - unchecked,
		"unchecked": unchecked, "countries": countries, "avgLatencyMs": avgLatency,
	}
}

// poolSetting 代理池设置(Setting.proxyPool, 默认值对齐 TS DEFAULT_SETTING)。
func (d Deps) poolSetting() map[string]any {
	setting := map[string]any{"auto": true, "intervalMin": 30, "checkBatch": 250, "pickLimit": 8}
	if raw, ok, _ := d.DB.GetSetting("proxyPool"); ok {
		var m map[string]any
		if json.Unmarshal([]byte(raw), &m) == nil {
			if v, has := m["auto"]; has {
				setting["auto"] = v == true
			}
			setting["intervalMin"] = clampIntOf(m["intervalMin"], 30, 5, 1440)
			setting["checkBatch"] = clampIntOf(m["checkBatch"], 250, 20, 2000)
			setting["pickLimit"] = clampIntOf(m["pickLimit"], 8, 1, 10)
		}
	}
	return setting
}

// (d Deps) adminProxyPoolPatch PATCH /api/admin/proxy-pool
func (d Deps) adminProxyPoolPatch(w http.ResponseWriter, r *http.Request) {
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	cur := d.poolSetting()
	next := map[string]any{
		"auto":        cur["auto"],
		"intervalMin": clampIntOf(body["intervalMin"], clampIntOf(cur["intervalMin"], 30, 5, 1440), 5, 1440),
		"checkBatch":  clampIntOf(body["checkBatch"], clampIntOf(cur["checkBatch"], 250, 20, 2000), 20, 2000),
		"pickLimit":   clampIntOf(body["pickLimit"], clampIntOf(cur["pickLimit"], 8, 1, 10), 1, 10),
	}
	if v, has := body["auto"]; has {
		next["auto"] = v == true
	}
	b, _ := json.Marshal(next)
	if err := d.DB.SetSetting("proxyPool", string(b)); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, next)
}

// (d Deps) adminProxyPoolDelete DELETE /api/admin/proxy-pool?confirm=true
func (d Deps) adminProxyPoolDelete(w http.ResponseWriter, r *http.Request) {
	if strings.ToLower(strOf(r.URL.Query().Get("confirm"), 4)) != "true" {
		apiErr(w, http.StatusBadRequest, "缺少 confirm=true, 拒绝清空代理池")
		return
	}
	res, err := d.DB.Exec(`DELETE FROM "FreeProxy"`)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	n, _ := res.RowsAffected()
	apiOK(w, map[string]any{"deleted": n})
}

// (d Deps) adminProxyHarvest POST /api/admin/proxy-pool/harvest
// [R56 接线] R56-2a 收割器并入后真实现: 公开源抓取→去重→幂等入库(FreeProxy 表)。
// 同步执行(源并发内建, 总耗时受 SourceFetchTimeout 约束), 失败源 perSource 留痕不阻断。
func (d Deps) adminProxyHarvest(w http.ResponseWriter, r *http.Request) {
	h := proxy.NewHarvester(d.DB.DB)
	res := h.Harvest(r.Context())
	apiOK(w, map[string]any{"ok": true, "harvest": res})
}

// (d Deps) adminProxyCheck POST /api/admin/proxy-pool/check
// [R56 接线] 校验器真实现: mode=unchecked|stale|alive, limit/ concurrency 钳制在 CheckOptions 内。
func (d Deps) adminProxyCheck(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	mode := strings.ToLower(strings.TrimSpace(q.Get("mode")))
	if mode == "" {
		mode = "unchecked"
	}
	limit, _ := strconv.Atoi(q.Get("limit"))
	conc, _ := strconv.Atoi(q.Get("concurrency"))
	var countries, protocols []string
	for _, c := range strings.Split(q.Get("countries"), ",") {
		if c = strings.ToUpper(strings.TrimSpace(c)); c != "" {
			countries = append(countries, c)
		}
	}
	for _, p := range strings.Split(q.Get("protocols"), ",") {
		if p = strings.ToLower(strings.TrimSpace(p)); p != "" {
			protocols = append(protocols, p)
		}
	}
	h := proxy.NewHarvester(d.DB.DB)
	res, err := h.Check(r.Context(), proxy.CheckOptions{
		Mode: mode, Limit: limit, Concurrency: conc, Countries: countries, Protocols: protocols,
	})
	if err != nil {
		apiErr(w, http.StatusBadRequest, err.Error())
		return
	}
	apiOK(w, map[string]any{"ok": true, "check": res})
}

// (d Deps) adminProxyPrune POST /api/admin/proxy-pool/prune — 真实清理
func (d Deps) adminProxyPrune(w http.ResponseWriter, r *http.Request) {
	deleted, err := d.DB.APIFreeProxyPrune()
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, map[string]any{"deleted": deleted})
}

// ---------------- backup ----------------

// (d Deps) adminBackup GET /api/admin/backup — 全表 JSON 导出
func (d Deps) adminBackup(w http.ResponseWriter, r *http.Request) {
	books, _ := d.DB.Count(`SELECT count(*) FROM "Book"`)
	chapters, _ := d.DB.Count(`SELECT count(*) FROM "Chapter"`)
	taskCount, _ := d.DB.Count(`SELECT count(*) FROM "Task"`)
	dlCount, _ := d.DB.Count(`SELECT count(*) FROM "DownloadJob"`)
	settings, _ := d.DB.QueryMaps(`SELECT key,value FROM "Setting" LIMIT 500`)
	categories, _ := d.DB.QueryMaps(`SELECT * FROM "Category" LIMIT 500`)
	sites, _ := d.DB.QueryMaps(`SELECT * FROM "Site" LIMIT 500`)
	friendLinks, _ := d.DB.QueryMaps(`SELECT * FROM "FriendLink" LIMIT 500`)
	rules, _ := d.DB.QueryMaps(`SELECT * FROM "Rule" LIMIT 500`)
	tasks, _ := d.DB.QueryMaps(`SELECT * FROM "Task" LIMIT 5000`)
	downloadJobs, _ := d.DB.QueryMaps(`SELECT * FROM "DownloadJob" LIMIT 5000`)

	var bookRows []map[string]any
	warnings := []any{}
	if books > 200 {
		warnings = append(warnings, "书籍数量超过 200, 仅导出书籍元数据(不含章节正文), 以避免备份体积过大")
		bookRows, _ = d.DB.QueryMaps(`SELECT * FROM "Book"`)
	} else {
		bookRows, _ = d.DB.QueryMaps(`SELECT * FROM "Book"`)
		for _, b := range bookRows {
			id := store.ToStr(b["id"])
			chs, _ := d.DB.QueryMaps(`SELECT * FROM "Chapter" WHERE bookId=? ORDER BY idx ASC`, id)
			b["chapters"] = chs
			tags, _ := d.DB.QueryMaps(`SELECT id,bookId,tag,source,hits FROM "BookTag" WHERE bookId=?`, id)
			b["tags"] = tags
		}
	}
	payload := map[string]any{
		"version":    1,
		"exportedAt": time.Now().UTC().Format(time.RFC3339),
		"counts": map[string]any{
			"settings": len(settings), "categories": len(categories), "sites": len(sites),
			"friendLinks": len(friendLinks), "rules": len(rules), "books": books,
			"chapters": chapters, "tasks": taskCount, "downloadJobs": dlCount,
		},
		"warnings": warnings,
		"data": map[string]any{
			"settings": settings, "categories": categories, "sites": sites,
			"friendLinks": friendLinks, "rules": rules, "books": bookRows,
			"tasks": tasks, "downloadJobs": downloadJobs,
		},
	}
	b, err := json.Marshal(payload)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "备份序列化失败")
		return
	}
	fn := "heis-backup-" + time.Now().Format("20060102-1504") + ".json"
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+fn+`"`)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(b)
}

// ---------------- backup restore(R56-2b 补全, R55 遗留①) ----------------

// restoreMaxBody 备份包体积上限(512MB: 现库 137MB/1.3万章 全量导出约 60~100MB, 留余量)。
const restoreMaxBody = 512 << 20

// backupPayload adminBackup 导出形态(version 1: counts/data/warnings; data.books
// 元素在 books≤200 时内嵌 chapters/tags 数组)。
type backupPayload struct {
	Version    int                         `json:"version"`
	ExportedAt string                      `json:"exportedAt"`
	Counts     map[string]any              `json:"counts"`
	Warnings   []any                       `json:"warnings"`
	Data       map[string][]map[string]any `json:"data"`
}

// tblSchema 表列缓存(PRAGMA table_info 每表只读一次, 免逐行重查)。
type tblSchema struct {
	cols, types []string
	pk          string
}

// restoreTables 恢复目标表(有序: FK 依赖前置 —— 分类先于书, 规则先于任务, 书先于章/标签)。
var restoreTables = []string{"settings", "categories", "sites", "friendLinks", "rules", "books", "tasks", "downloadJobs"}

// nestedChaptersTagTables 书行内嵌数组对应的实体表。
var nestedChaptersTagTables = map[string]string{"chapters": "Chapter", "tags": "BookTag"}

// (d Deps) adminBackupRestore POST /api/admin/backup/restore?strategy=skip|overwrite
// 上传 adminBackup 导出的 JSON → 单事务内逐表按主键恢复 → 返回恢复统计。
//
//	strategy=overwrite(缺省): 冲突以备份为准(存在同主键行则整行覆盖);
//	strategy=skip: 已存在同主键行一律保留现库行。
//	跨行唯一约束冲突(Book.num/Site.domain/Category.name 撞到别的行)不整批失败 ——
//	该行计入 failed 继续; Task.status=running 不可信, 按启动恢复口径收编为 paused。
//	全程单事务(事务持有唯一连接, 其他请求排队等待 —— 兼顾原子性与 maxConns=1)。
func (d Deps) adminBackupRestore(w http.ResponseWriter, r *http.Request) {
	strategy := strings.ToLower(strings.TrimSpace(strOf(r.URL.Query().Get("strategy"), 12)))
	if strategy == "" {
		strategy = "overwrite"
	}
	if strategy != "overwrite" && strategy != "skip" {
		apiErr(w, http.StatusBadRequest, "strategy 仅支持 overwrite(备份为准)或 skip(保留现库)")
		return
	}
	var payload backupPayload
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, restoreMaxBody))
	if err := dec.Decode(&payload); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			apiErr(w, http.StatusRequestEntityTooLarge, "备份文件过大(超过上限)")
		} else {
			apiErr(w, http.StatusBadRequest, "备份 JSON 解析失败(需 adminBackup 导出形态)")
		}
		return
	}
	if payload.Data == nil {
		apiErr(w, http.StatusBadRequest, "备份缺少 data 节点(需 adminBackup 导出形态)")
		return
	}

	tx, err := d.DB.DB.BeginTx(r.Context(), nil)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	defer tx.Rollback()

	schemas := map[string]*tblSchema{}
	schemaOf := func(tbl string) (*tblSchema, error) {
		if s, ok := schemas[tbl]; ok {
			return s, nil
		}
		cols, types, pk, err := tableColumnsTx(tx, tbl)
		if err != nil {
			return nil, err
		}
		s := &tblSchema{cols: cols, types: types, pk: pk}
		schemas[tbl] = s
		return s, nil
	}

	restored := map[string]int{}
	skipped := map[string]int{}
	failed := []map[string]any{} // 恒非 nil(响应形态稳定)
	failedTotal := 0
	addFail := func(table, id, msg string) {
		failedTotal++
		if len(failed) >= 20 {
			return // 明细封顶, 总数在 failedTotal
		}
		failed = append(failed, map[string]any{"table": table, "id": id, "error": msg})
	}

	// 书行内嵌 chapters/tags 收集区(主表 books 落库后统一恢复, FK 顺序保障)
	var nestedItems = map[string][]map[string]any{"chapters": nil, "tags": nil}
	restoreOne := func(tbl string, row map[string]any) bool {
		sch, serr := schemaOf(tbl)
		if serr != nil {
			addFail(tbl, store.ToStr(row[idOf(tbl)]), sanitizeRestoreErr(serr))
			return false
		}
		ok2, err2 := restoreRowTx(tx, tbl, row, sch, strategy)
		if err2 != nil {
			addFail(tbl, store.ToStr(row[idOf(tbl)]), sanitizeRestoreErr(err2))
			return false
		}
		if !ok2 {
			skipped[tbl]++
			return false
		}
		restored[tbl]++
		return true
	}

	for _, dataKey := range restoreTables {
		rows := payload.Data[dataKey]
		if len(rows) == 0 {
			continue
		}
		tbl := dataTableName(dataKey)
		for _, row := range rows {
			if row == nil || store.ToStr(row[idOf(tbl)]) == "" {
				skipped[tbl]++
				continue
			}
			if tbl == "Task" && store.ToStr(row["status"]) == "running" {
				row["status"] = "paused" // 备份里的 running 不可信(对齐 recoverOnBoot)
			}
			if tbl == "Setting" { // value 列 TEXT: 备份异常非字符串值 → JSON 字符串化
				if v, ok2 := row["value"]; ok2 {
					if _, isStr := v.(string); !isStr {
						if b, merr := json.Marshal(v); merr == nil {
							row["value"] = string(b)
						}
					}
				}
			}
			if tbl == "Book" { // 内嵌 chapters/tags 摘出延后
				for key := range nestedItems {
					if raw, ok2 := row[key]; ok2 {
						if items, ok3 := raw.([]any); ok3 {
							for _, it := range items {
								if im, ok4 := it.(map[string]any); ok4 {
									nestedItems[key] = append(nestedItems[key], im)
								}
							}
						}
						delete(row, key) // 非表列, 不进 INSERT/UPDATE
					}
				}
			}
			restoreOne(tbl, row)
		}
	}

	// 内嵌 chapters/tags(+ 兼容备份 data 顶层的同名数组)—— books 已全部就位
	for dataKey, tbl := range nestedChaptersTagTables {
		items := nestedItems[dataKey]
		if top, ok := payload.Data[dataKey]; ok && dataTableName(dataKey) == "" {
			items = append(items, top...) // 顶层 chapters/tags 数组(防御性兼容)
		}
		for _, row := range items {
			if row == nil || store.ToStr(row[idOf(tbl)]) == "" {
				skipped[tbl]++
				continue
			}
			restoreOne(tbl, row)
		}
	}

	if err := tx.Commit(); err != nil {
		apiErr(w, http.StatusInternalServerError, "恢复提交失败: "+sanitizeRestoreErr(err))
		return
	}
	if restored["Setting"] > 0 {
		invalidateBannedWordsCache() // 设置面变更即失效违禁词缓存(对齐 PUT 钩子)
	}
	apiOK(w, map[string]any{
		"strategy":    strategy,
		"restored":    restored,
		"skipped":     skipped,
		"failed":      failed,
		"failedTotal": failedTotal,
	})
}

// dataTableName 备份 data 键 → 实体表名(未知键返回 "" 即忽略)。
func dataTableName(key string) string {
	switch key {
	case "settings":
		return "Setting"
	case "categories":
		return "Category"
	case "sites":
		return "Site"
	case "friendLinks":
		return "FriendLink"
	case "rules":
		return "Rule"
	case "books":
		return "Book"
	case "tasks":
		return "Task"
	case "downloadJobs":
		return "DownloadJob"
	}
	return ""
}

// idOf 表主键列名(Prisma 单列 id; Setting 为 key)。
func idOf(tbl string) string {
	if tbl == "Setting" {
		return "key"
	}
	return "id"
}

// tableColumnsTx 事务内读表列(PRAGMA table_info): 列名/声明类型/主键。
func tableColumnsTx(tx *sql.Tx, tbl string) (cols, types []string, pk string, err error) {
	rows, err := tx.Query(`PRAGMA table_info("` + tbl + `")`)
	if err != nil {
		return nil, nil, "", err
	}
	defer rows.Close()
	for rows.Next() {
		var cid, notNull, pkIdx int
		var name, ctype string
		var dflt any
		if err := rows.Scan(&cid, &name, &ctype, &notNull, &dflt, &pkIdx); err != nil {
			return nil, nil, "", err
		}
		if pkIdx == 1 {
			pk = name
		}
		cols = append(cols, name)
		types = append(types, ctype)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, "", err
	}
	if pk == "" {
		return nil, nil, "", fmt.Errorf("table %s has no single-column primary key", tbl)
	}
	return cols, types, pk, nil
}

// restoreRowTx 单行恢复: 先判存在(区分新增/覆盖与 skip 语义)再写入。
// 返回 (是否实际恢复入库, 错误); strategy=skip 且行已存在 → (false, nil)。
func restoreRowTx(tx *sql.Tx, tbl string, row map[string]any, sch *tblSchema, strategy string) (bool, error) {
	pk := sch.pk
	pkv, ok := row[pk]
	if !ok {
		return false, fmt.Errorf("missing primary key %s", pk)
	}
	err := tx.QueryRow(`SELECT 1 FROM "`+tbl+`" WHERE "`+pk+`"=?`, pkv).Scan(new(any))
	exists := err == nil
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}
	if exists && strategy == "skip" {
		return false, nil
	}

	cols, types := sch.cols, sch.types
	useCols := make([]string, 0, len(cols))
	useArgs := make([]any, 0, len(cols))
	for i, c := range cols {
		v, ok := row[c]
		if !ok {
			continue // 备份行缺列 → 保留建表默认值, 不猜
		}
		useCols = append(useCols, c)
		useArgs = append(useArgs, restoreCoerce(types[i], v))
	}
	if len(useCols) == 0 {
		return false, fmt.Errorf("backup row has no known columns")
	}
	quoted := make([]string, len(useCols))
	for i, c := range useCols {
		quoted[i] = `"` + c + `"`
	}
	if exists { // overwrite: 整行覆盖(备份为准)
		sets := make([]string, len(useCols))
		for i, c := range useCols {
			sets[i] = `"` + c + `"=?`
		}
		args := append(append([]any{}, useArgs...), pkv)
		if _, err := tx.Exec(`UPDATE "`+tbl+`" SET `+strings.Join(sets, ",")+` WHERE "`+pk+`"=?`, args...); err != nil {
			return false, err
		}
		return true, nil
	}
	ph := strings.TrimSuffix(strings.Repeat("?,", len(useCols)), ",")
	if _, err := tx.Exec(`INSERT INTO "`+tbl+`" (`+strings.Join(quoted, ",")+`) VALUES (`+ph+`)`, useArgs...); err != nil {
		return false, err
	}
	return true, nil
}

// restoreCoerce 按列声明类型规整 JSON 值(bool→0/1, 整值浮点→INTEGER)。
func restoreCoerce(colType string, v any) any {
	if v == nil {
		return nil
	}
	t := strings.ToUpper(colType)
	intish := strings.Contains(t, "INT") || strings.Contains(t, "BOOL") || strings.Contains(t, "DATETIME")
	realish := strings.Contains(t, "REAL") || strings.Contains(t, "FLOA") || strings.Contains(t, "DOUB") || strings.Contains(t, "NUM")
	switch x := v.(type) {
	case bool:
		if intish || realish {
			return boolInt(x)
		}
	case float64:
		if intish && x == math.Trunc(x) && x >= -9.2e18 && x <= 9.2e18 {
			return int64(x)
		}
	}
	return v
}

// sanitizeRestoreErr 错误文本消毒(不带出 DSN/绝对路径/驱动内部细节)。
func sanitizeRestoreErr(err error) string {
	msg := truncateRunes(err.Error(), 200)
	if i := strings.Index(msg, "file:"); i >= 0 {
		msg = msg[:i] + "…"
	}
	return msg
}
