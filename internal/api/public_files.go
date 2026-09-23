// ============================================================
// R55-3b — /api/public/* 文件与写入面: cover / download / feedback / sitemap
//
// cover: ?file= 读 web/covers/(沙箱化防路径穿越; 缺失 404 不 500)
// [R57-2b-fix] 修后缀白名单仍锁 TS 时代 .webp —— R55 桥改存原格式后全库封面是
// .jpg, web 层 coverURL 把本地封面全引到本端点 → 全站封面 400(浏览器 onerror
// 回落占位图)。白名单扩到常见位图格式, Content-Type 按后缀而不是硬编码 image/webp。
// download: ?book= → 最新 done 的 DownloadJob → 流式返回 txt
// feedback: POST 校验 + 同 IP 5 条/小时限流
// sitemap: ?page&index&site → urlset/sitemapindex(5min 内存缓存)
// ============================================================
package api

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"mhgl/internal/store"
)

// coverDirEnv 封面目录(环境变量 COVER_DIR, 缺省 web/covers; PLAN §2)。
var coverDirEnv = func() string {
	if v := strings.TrimSpace(os.Getenv("COVER_DIR")); v != "" {
		return v
	}
	return "web/covers"
}()

// maxCoverBytes 单封面响应体积上限(正常封面 KB 级; 超出按不存在处理, 防 ReadFile 尖峰)。
const maxCoverBytes = 16 << 20

// ---------------- cover ----------------

var coverFileRe = regexp.MustCompile(`^\w[\w.-]*\.(webp|jpe?g|png|gif|avif)$`)

// imageContentType 按文件后缀给出图片 MIME(未知后缀 octet-stream + nosniff 兜底)。
func imageContentType(name string) string {
	switch {
	case strings.HasSuffix(name, ".webp"):
		return "image/webp"
	case strings.HasSuffix(name, ".jpg"), strings.HasSuffix(name, ".jpeg"):
		return "image/jpeg"
	case strings.HasSuffix(name, ".png"):
		return "image/png"
	case strings.HasSuffix(name, ".gif"):
		return "image/gif"
	case strings.HasSuffix(name, ".avif"):
		return "image/avif"
	}
	return "application/octet-stream"
}

// (d Deps) publicCover GET /api/public/cover?file=
// 封面目录: web/covers(coverDir, PLAN §2); 文件缺失 → 404(不 500)。
func (d Deps) publicCover(w http.ResponseWriter, r *http.Request) {
	file := strOf(r.URL.Query().Get("file"), 200)
	file = strings.TrimPrefix(file, "covers/")
	if file == "" || !coverFileRe.MatchString(file) {
		apiErr(w, http.StatusBadRequest, "非法的封面文件名")
		return
	}
	// 双重防护: basename 化 + 目录边界(防 ../ 与 %2e%2e 解码后穿越)
	base := filepath.Base(file)
	dir := d.coverDir()
	full := filepath.Join(dir, base)
	if !strings.HasPrefix(filepath.Clean(full), filepath.Clean(dir)+string(os.PathSeparator)) {
		apiErr(w, http.StatusBadRequest, "非法的封面文件名")
		return
	}
	// [R58-2c] 体积防线: 先 stat 再读 —— 采集侧异常落盘的超大文件不再整读进内存
	// (修前 os.ReadFile 无上限, 目录里被塞进 GB 级文件时一次命中即内存尖峰)。
	st, serr := os.Stat(full)
	if serr != nil {
		apiErr(w, http.StatusNotFound, "封面不存在")
		return
	}
	if st.Size() > maxCoverBytes {
		apiErr(w, http.StatusNotFound, "封面不可用")
		return
	}
	buf, err := os.ReadFile(full)
	if err != nil {
		apiErr(w, http.StatusNotFound, "封面不存在")
		return
	}
	w.Header().Set("Content-Type", imageContentType(base))
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(buf)
}

// coverDir 封面目录(COVER_DIR 环境变量, 缺省 web/covers; PLAN §2)。
func (d Deps) coverDir() string { return coverDirEnv }

// ---------------- download ----------------

// (d Deps) publicDownload GET /api/public/download?id=|?book=
func (d Deps) publicDownload(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	id := strings.TrimSpace(strOf(q.Get("id"), 64))
	bookID := strings.TrimSpace(strOf(q.Get("book"), 64))
	if id == "" && bookID == "" {
		apiErr(w, http.StatusBadRequest, "缺少id")
		return
	}
	var job map[string]any
	var ok bool
	var err error
	if bookID != "" {
		job, ok, err = d.DB.QueryMap(`SELECT j.*, b.name AS bookName FROM "DownloadJob" j
LEFT JOIN "Book" b ON b.id=j.bookId WHERE j.bookId=? AND j.status='done' AND j.filePath IS NOT NULL
ORDER BY j.createdAt DESC LIMIT 1`, bookID)
	} else {
		job, ok, err = d.DB.QueryMap(`SELECT j.*, b.name AS bookName FROM "DownloadJob" j
LEFT JOIN "Book" b ON b.id=j.bookId WHERE j.id=?`, id)
	}
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if !ok || store.ToStr(job["status"]) != "done" || store.ToStr(job["filePath"]) == "" {
		apiErr(w, http.StatusNotFound, "文件不存在或未生成完毕")
		return
	}
	// 路径穿越防护: 仅允许 web/downloads/ 内
	full := safeJoinData(store.ToStr(job["filePath"]))
	clean := filepath.Clean(full)
	if !strings.HasPrefix(clean, downloadsRoot+string(os.PathSeparator)) {
		apiErr(w, http.StatusBadRequest, "文件路径非法")
		return
	}
	st, err := os.Stat(full)
	if err != nil || !st.Mode().IsRegular() {
		apiErr(w, http.StatusNotFound, "文件不存在或已被清理")
		return
	}
	f, err := os.Open(full)
	if err != nil {
		apiErr(w, http.StatusNotFound, "文件不存在或已被清理")
		return
	}
	defer f.Close()
	fileName := orDefault(store.ToStr(job["bookName"]), "book") + "_下载版.txt"
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", contentDisposition(fileName))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", st.Size()))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, f)
}

// contentDisposition RFC5987 文件名(ASCII 回退 + UTF-8 编码)。
func contentDisposition(name string) string {
	ascii := strings.Map(func(r rune) rune {
		if r >= 0x20 && r <= 0x7e && r != '"' && r != '\\' {
			return r
		}
		return '_'
	}, name)
	if ascii == "" {
		ascii = "download.txt"
	}
	var b strings.Builder
	for _, c := range []byte(name) {
		if c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' ||
			strings.IndexByte("-_.~", c) >= 0 {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return `attachment; filename="` + ascii + `"; filename*=UTF-8''` + b.String()
}

// ---------------- sitemap ----------------
// [R60-2b] feedback 提交/管理面整体迁往 api/feedback.go(store 层 CRUD + 开关/限频/公开页)。

const (
	sitemapPageSize  = 5_000
	sitemapMaxPages  = 1000
	sitemapCacheTTL  = 5 * 60 * 1000
	sitemapCacheMax  = 50
	pseoSitemapLimit = 2000
)

var sitemapCacheMu sync.Mutex
var sitemapCache = map[string]sitemapCacheEntry{}

type sitemapCacheEntry struct {
	ts  int64
	xml string
}

var privateHostRe = regexp.MustCompile(
	`^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.6[4-9]\.|100\.[7-9]\d\.|100\.1[01]\d\.|100\.12[0-7]\.|0\.)`)

var sitemapDomainRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$`)

// siteBase 站点域名 → https base(拒私网段)。
func siteBase(domain string) string {
	d := strings.ToLower(strings.TrimSpace(domain))
	if !sitemapDomainRe.MatchString(d) || privateHostRe.MatchString(d) {
		return ""
	}
	return "https://" + d
}

func xmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	return s
}

// siteQOf canonical 对齐的站点参数(R15-a1-6): 站点选取与前台兑底链同口径 ——
// 显式 ?site= → 该站且须启用; 否则默认启用站 → 第一个启用站。返回 "site=<id>" 或 ""。
func (d Deps) siteQOf(siteID string) string {
	var row map[string]any
	var ok bool
	if siteID != "" {
		row, ok, _ = d.DB.QueryMap(`SELECT id,status FROM "Site" WHERE id=?`, siteID)
	} else {
		row, ok, _ = d.DB.QueryMap(`SELECT id,status FROM "Site" WHERE isDefault=1 AND status=1 ORDER BY createdAt ASC LIMIT 1`)
		if !ok {
			row, ok, _ = d.DB.QueryMap(`SELECT id,status FROM "Site" WHERE status=1 ORDER BY createdAt ASC LIMIT 1`)
		}
	}
	if !ok || row == nil || !store.ToBool(row["status"]) || store.ToStr(row["id"]) == "" {
		return ""
	}
	return "site=" + urlQueryEscape(store.ToStr(row["id"]))
}

// appendSiteQ loc 追加 site 参数(R15-a1-6: 与前台 canonical 同形态, 防重复内容信号分裂)。
func appendSiteQ(loc, siteQ string) string {
	if siteQ == "" {
		return loc
	}
	if strings.Contains(loc, "?") {
		return loc + "&" + siteQ
	}
	return loc + "?" + siteQ
}

// (d Deps) publicSitemap GET /api/public/sitemap
func (d Deps) publicSitemap(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	siteID := strings.TrimSpace(strOf(q.Get("site"), 64))
	// [R58-2c] page/index 参与缓存键, 截断防超长垃圾参数撑大 sitemapCache
	// (合法取值 ≤4 位数字; 截断不改变 parsePositiveInt 的 1e9 钳制结果)。
	pageParam := strOf(q.Get("page"), 12)
	indexParam := strOf(q.Get("index"), 12)

	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	base := scheme + "://" + orDefault(r.Host, "localhost:3000")
	if siteID != "" {
		// R3-37: 停用站点/localhost 不放行自定义 base
		if site, ok, _ := d.DB.QueryMap(`SELECT domain,status FROM "Site" WHERE id=?`, siteID); ok &&
			store.ToBool(site["status"]) && store.ToStr(site["domain"]) != "localhost:3000" {
			if custom := siteBase(store.ToStr(site["domain"])); custom != "" {
				base = custom
			}
		}
	}
	preset := d.DB.APIPseudoPreset()
	siteQ := d.siteQOf(siteID)

	cacheKey := base + "|page=" + pageParam + "|index=" + indexParam + "|site=" + siteID + "|preset=" + preset
	now := store.NowMS()
	sitemapCacheMu.Lock()
	if cached, ok := sitemapCache[cacheKey]; ok && now-cached.ts < sitemapCacheTTL {
		xml := cached.xml
		sitemapCacheMu.Unlock()
		writeSitemapXML(w, xml)
		return
	}
	sitemapCacheMu.Unlock()

	var xml string
	switch {
	case pageParam != "":
		// ?page=N → 该页 <urlset>(take:5000, skip:(N-1)*5000, books+chapters 合并分页)
		page := 1
		if p, err := parsePositiveInt(pageParam); err == nil {
			page = minInt(maxInt(1, p), sitemapMaxPages)
		}
		entries := d.sitemapPageEntries(page, base, preset, siteQ)
		var sb strings.Builder
		sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
		sb.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
		for _, e := range entries {
			sb.WriteString(e + "\n")
		}
		sb.WriteString("</urlset>")
		xml = sb.String()
	case indexParam != "":
		// ?index=1 → <sitemapindex> 列出所有分页 URL(保留 site 参数以保持 base 一致)
		pages := d.sitemapTotalPages()
		siteQs := ""
		if siteID != "" && siteQ != "" {
			siteQs = "&" + siteQ
		}
		var sb strings.Builder
		sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
		sb.WriteString(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
		for i := 1; i <= pages; i++ {
			loc := fmt.Sprintf("%s/api/public/sitemap?page=%d%s", base, i, siteQs)
			sb.WriteString("  <sitemap><loc>" + xmlEscape(loc) + "</loc><lastmod>" +
				time.Now().UTC().Format("2006-01-02T15:04:05Z") + "</lastmod></sitemap>\n")
		}
		sb.WriteString("</sitemapindex>")
		xml = sb.String()
	default:
		// 无 ?page/无 ?index → 旧行为(单页): 首页 loc + PSEO + books 5000 + chapters 5000
		// (books/chapters 独立查询, 互不挤占名额, 对齐 TS legacy 形态)
		entries := []string{}
		homeLoc := base + "/?view=home"
		if siteQ != "" {
			homeLoc = base + "/?" + siteQ
		}
		entries = append(entries, sitemapURLEntry(homeLoc, 0, "daily", "1.0"))
		entries = append(entries, d.pseoSitemapEntries(base, siteQ)...)
		books, _ := d.DB.QueryMaps(`SELECT id,num,updatedAt FROM "Book" ORDER BY updatedAt DESC LIMIT ?`, sitemapPageSize)
		for _, b := range books {
			loc := buildBookPath(store.ToInt(b["num"]), preset)
			if loc == "" {
				loc = "/?view=book&id=" + urlQueryEscape(store.ToStr(b["id"]))
			}
			entries = append(entries, sitemapURLEntry(appendSiteQ(base+loc, siteQ), store.ToInt(b["updatedAt"]), "daily", "0.8"))
		}
		chs, _ := d.DB.QueryMaps(`SELECT c.id,c.idx,c.updatedAt,b.num AS bNum FROM "Chapter" c
LEFT JOIN "Book" b ON b.id=c.bookId ORDER BY c.updatedAt DESC LIMIT ?`, sitemapPageSize)
		for _, c := range chs {
			entries = append(entries, sitemapURLEntry(appendSiteQ(d.chapterLoc(base, store.ToInt(c["bNum"]), store.ToInt(c["idx"]), store.ToStr(c["id"]), preset), siteQ), store.ToInt(c["updatedAt"]), "weekly", "0.6"))
		}
		var sb strings.Builder
		sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
		sb.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
		for _, e := range entries {
			sb.WriteString(e + "\n")
		}
		sb.WriteString("</urlset>")
		xml = sb.String()
	}

	sitemapCacheMu.Lock()
	if len(sitemapCache) >= sitemapCacheMax {
		var oldestKey string
		var oldest int64 = 1 << 62
		for k, v := range sitemapCache {
			if v.ts < oldest {
				oldest, oldestKey = v.ts, k
			}
		}
		delete(sitemapCache, oldestKey)
	}
	sitemapCache[cacheKey] = sitemapCacheEntry{ts: now, xml: xml}
	sitemapCacheMu.Unlock()

	writeSitemapXML(w, xml)
}

func writeSitemapXML(w http.ResponseWriter, xml string) {
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(xml))
}

func parsePositiveInt(s string) (int, error) {
	n := 0
	if s == "" {
		return 0, fmt.Errorf("empty")
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("nan")
		}
		n = n*10 + int(c-'0')
		if n > 1e9 {
			return 1e9, nil
		}
	}
	return n, nil
}

// sitemapTotalPages sitemap 总页数(books+chapters, 上限 1000)。
func (d Deps) sitemapTotalPages() int {
	books, _ := d.DB.Count(`SELECT count(*) FROM "Book"`)
	chapters, _ := d.DB.Count(`SELECT count(*) FROM "Chapter"`)
	total := books + chapters
	if total == 0 {
		return 1
	}
	return minInt(sitemapMaxPages, lastPage(total, sitemapPageSize))
}

// pseoSitemapEntries PSEO 关键词页 URL 条目(R27-2-7: 仅 active, 上限 2000, loc 百分号编码)。
func (d Deps) pseoSitemapEntries(base, siteQ string) []string {
	entries := []string{}
	rows, _ := d.DB.QueryMaps(`SELECT slug,updatedAt FROM "PseoPage" WHERE status='active' ORDER BY updatedAt DESC LIMIT ?`,
		pseoSitemapLimit)
	for _, row := range rows {
		loc := fmt.Sprintf("%s/p/%s.html", base, urlPathEscape(store.ToStr(row["slug"])))
		entries = append(entries, sitemapURLEntry(appendSiteQ(loc, siteQ), store.ToInt(row["updatedAt"]), "weekly", "0.6"))
	}
	return entries
}

// sitemapPageEntries 第 N 页 URL 条目(books 前, chapters 后; PSEO 仅第 1 页)。
func (d Deps) sitemapPageEntries(page int, base, preset, siteQ string) []string {
	skip := (page - 1) * sitemapPageSize
	if skip < 0 {
		return nil
	}
	entries := []string{}
	// PSEO 段(仅第 1 页)
	if page == 1 {
		entries = append(entries, d.pseoSitemapEntries(base, siteQ)...)
	}
	booksCount, _ := d.DB.Count(`SELECT count(*) FROM "Book"`)
	if skip < booksCount {
		takeBooks := minInt(sitemapPageSize, booksCount-skip)
		books, _ := d.DB.QueryMaps(`SELECT id,num,updatedAt FROM "Book" ORDER BY updatedAt DESC LIMIT ? OFFSET ?`,
			takeBooks, skip)
		for _, b := range books {
			num := store.ToInt(b["num"])
			loc := buildBookPath(num, preset)
			if loc == "" {
				loc = "/?view=book&id=" + urlQueryEscape(store.ToStr(b["id"]))
			}
			entries = append(entries, sitemapURLEntry(appendSiteQ(base+loc, siteQ), store.ToInt(b["updatedAt"]), "daily", "0.8"))
		}
		remaining := sitemapPageSize - len(books)
		if remaining > 0 {
			chs, _ := d.DB.QueryMaps(`SELECT c.id,c.idx,c.updatedAt,b.num AS bNum FROM "Chapter" c
LEFT JOIN "Book" b ON b.id=c.bookId ORDER BY c.updatedAt DESC LIMIT ?`, remaining)
			for _, c := range chs {
				entries = append(entries, sitemapURLEntry(appendSiteQ(d.chapterLoc(base, store.ToInt(c["bNum"]), store.ToInt(c["idx"]), store.ToStr(c["id"]), preset), siteQ), store.ToInt(c["updatedAt"]), "weekly", "0.6"))
			}
		}
		return entries
	}
	// 已越过 books 段 → chapters 段
	chapterSkip := skip - booksCount
	chs, _ := d.DB.QueryMaps(`SELECT c.id,c.idx,c.updatedAt,b.num AS bNum FROM "Chapter" c
LEFT JOIN "Book" b ON b.id=c.bookId ORDER BY c.updatedAt DESC LIMIT ? OFFSET ?`, sitemapPageSize, chapterSkip)
	for _, c := range chs {
		entries = append(entries, sitemapURLEntry(appendSiteQ(d.chapterLoc(base, store.ToInt(c["bNum"]), store.ToInt(c["idx"]), store.ToStr(c["id"]), preset), siteQ), store.ToInt(c["updatedAt"]), "weekly", "0.6"))
	}
	return entries
}

// chapterLoc 章节 URL: 伪静态可用且书号齐备 → /read/{num}/{idx}.html; 否则查询串(永不死链)。
func (d Deps) chapterLoc(base string, num, idx int64, chapterID, preset string) string {
	if num > 0 {
		if p := buildReadPath(num, idx, preset); p != "" {
			return base + p
		}
	}
	return base + "/?view=read&chapter=" + urlQueryEscape(chapterID)
}

func sitemapURLEntry(loc string, lastmodMS int64, freq, priority string) string {
	lm := ""
	if lastmodMS > 0 {
		lm = time.UnixMilli(lastmodMS).UTC().Format("2006-01-02T15:04:05Z")
	}
	return fmt.Sprintf("  <url><loc>%s</loc><lastmod>%s</lastmod><changefreq>%s</changefreq><priority>%s</priority></url>",
		xmlEscape(loc), lm, freq, priority)
}

func urlPathEscape(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		if c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' ||
			strings.IndexByte("-_.~", c) >= 0 {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

func urlQueryEscape(s string) string { return urlPathEscape(s) }
