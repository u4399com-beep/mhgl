// ============================================================
// 模板引擎 — html/template 多主题装载 + 渲染助手 + 公共 funcmap
//
//	前台模板按主题目录装载: tpl/themes/{themeId}/(layout.html + 各页 content block)
//	Site.themeId → 主题选择; 目录缺失/非法 → 回落 aijjxs(缺省主题)。
//	模板集按主题惰性加载并进程内缓存(主题失效重启生效, 无热载)。
//	后台模板不随主题(tpl/admin/*, 启动期一次装载)。
//
// ============================================================
package web

import (
	"embed"
	"fmt"
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"path"
	"regexp"
	"strings"
	"sync"
	"time"
)

//go:embed tpl
var tplFS embed.FS

const defaultTheme = "aijjxs"

// themeRe 主题名合法性(目录名白名单形态, 防拼接逃逸)。
var themeRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,31}$`)

// publicPages 前台页清单(各主题目录下同名文件, 定义 content block)。
var publicPages = []string{
	"home", "book", "toc", "read", "search", "history", "category",
	"keyword", "ranking", "fulltext", "pseo", "404",
}

var (
	// adminTpls 后台模板集(启动期一次)。
	adminOnce sync.Once
	adminTpls map[string]*template.Template

	// themeTplsMu/ThemeTpls 主题模板集缓存(键=主题名)。
	themeTplsMu sync.RWMutex
	themeTpls   = map[string]map[string]*template.Template{}
)

// ensureAdminTpls 惰性装载后台模板(模板损坏 fatal 暴露问题)。
func ensureAdminTpls() {
	adminOnce.Do(func() {
		adminTpls = map[string]*template.Template{}
		t, err := template.New("layout.html").Funcs(tplFuncs).ParseFS(tplFS,
			"tpl/admin/layout.html", "tpl/admin/sections/dashboard.html")
		if err != nil {
			log.Fatalf("[web] parse template admin: %v", err)
		}
		adminTpls["admin"] = t
		tl, err := template.New("login.html").Funcs(tplFuncs).ParseFS(tplFS, "tpl/admin/login.html")
		if err != nil {
			log.Fatalf("[web] parse template login: %v", err)
		}
		adminTpls["login"] = tl
		for _, sec := range adminSections {
			f := "tpl/admin/sections/" + sec.key + ".html"
			t, err := template.New("layout.html").Funcs(tplFuncs).ParseFS(tplFS, "tpl/admin/layout.html", f)
			if err != nil {
				log.Fatalf("[web] parse template %s: %v", sec.key, err)
			}
			adminTpls["admin:"+sec.key] = t
		}
		log.Printf("[web] admin templates loaded: %d", len(adminTpls))
	})
}

// themeAvailable embed FS 中是否存在该主题目录。
func themeAvailable(theme string) bool {
	_, err := fs.Stat(tplFS, "tpl/themes/"+theme)
	return err == nil
}

// normalizeTheme 站点 theme 字段 → 合法主题名(非法/空 → 缺省)。
func normalizeTheme(raw any) string {
	t := strings.ToLower(strings.TrimSpace(ToStrSafe(raw)))
	if t == "" || !themeRe.MatchString(t) || !themeAvailable(t) {
		return defaultTheme
	}
	return t
}

// themeOf 站点 → 主题名(Site.themeId; 兼容 theme 别名; 查不到目录回落缺省)。
func themeOf(site map[string]any) string {
	if site == nil {
		return defaultTheme
	}
	if t := ToStrSafe(site["themeId"]); strings.TrimSpace(t) != "" {
		return normalizeTheme(t)
	}
	return normalizeTheme(site["theme"])
}

// loadThemeTpls 解析一个主题的模板集(layout 为根, 每页一个克隆)。
func loadThemeTpls(theme string) map[string]*template.Template {
	root := "tpl/themes/" + theme
	set := map[string]*template.Template{}
	layout := path.Join(root, "layout.html")
	for _, name := range publicPages {
		files := []string{layout, path.Join(root, name+".html")}
		t, err := template.New("layout.html").Funcs(tplFuncs).ParseFS(tplFS, files...)
		if err != nil {
			log.Printf("[web] parse theme %s template %s: %v", theme, name, err)
			return nil // 主题集不完整 → 上层回落缺省主题
		}
		set[name] = t
	}
	return set
}

// themeSet 主题模板集(缓存命中直返; 未载入则装载; 装载失败回落缺省主题)。
func themeSet(theme string) map[string]*template.Template {
	themeTplsMu.RLock()
	set, ok := themeTpls[theme]
	themeTplsMu.RUnlock()
	if ok {
		return set
	}
	loaded := loadThemeTpls(theme)
	if loaded == nil && theme != defaultTheme {
		log.Printf("[web] theme %s unavailable, fallback %s (restart to re-apply)", theme, defaultTheme)
		loaded = loadThemeTpls(defaultTheme)
		theme = defaultTheme
	}
	if loaded == nil {
		log.Fatalf("[web] default theme %s templates broken", defaultTheme)
	}
	themeTplsMu.Lock()
	if _, dup := themeTpls[theme]; !dup {
		themeTpls[theme] = loaded
	}
	themeTplsMu.Unlock()
	log.Printf("[web] theme templates loaded: %s (%d pages)", theme, len(loaded))
	return loaded
}

// render 执行页面模板。
// name 以 "admin:"/"login"/"admin" 开头走后台集; 其余走主题集(主题取 data["Site"])。
func render(w http.ResponseWriter, name string, data any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if name == "login" || strings.HasPrefix(name, "admin") {
		ensureAdminTpls()
		t, ok := adminTpls[name]
		if !ok {
			http.Error(w, "template missing: "+name, http.StatusInternalServerError)
			return
		}
		if err := t.ExecuteTemplate(w, "layout.html", data); err != nil {
			log.Printf("[web] render %s: %v", name, err)
		}
		return
	}
	var theme string
	if m, ok := data.(map[string]any); ok {
		if site, ok := m["Site"].(map[string]any); ok {
			theme = themeOf(site)
		}
	}
	if theme == "" {
		theme = defaultTheme
	}
	set := themeSet(theme)
	t, ok := set[name]
	if !ok {
		// 主题缺该页 → 缺省主题页兜底
		if theme != defaultTheme {
			t, ok = themeSet(defaultTheme)[name]
		}
		if !ok {
			http.Error(w, "template missing: "+name, http.StatusInternalServerError)
			return
		}
	}
	if err := t.ExecuteTemplate(w, "layout.html", data); err != nil {
		log.Printf("[web] render %s: %v", name, err)
	}
}

// render404 美观 404(带返回首页链接; 站点缺行时以空表渲染, 防模板 nil 类型错)。
func (d Deps) render404(w http.ResponseWriter, r *http.Request, msg string) {
	w.WriteHeader(http.StatusNotFound)
	site := d.resolveSite(r)
	if site == nil {
		site = map[string]any{}
	}
	sid := siteID(site)
	data := map[string]any{
		"Site":       site,
		"SiteID":     sid,
		"HomeHref":   viewHref("home", sid, nil),
		"SearchHref": viewHref("search", sid, nil),
		"Msg":        msg,
	}
	data["Head"] = d.head(r, site, "页面不存在 - "+siteTitle(site),
		"你访问的页面不存在或已被移除", "", "")
	render(w, "404", data)
}

// hostRe 合法 Host(x-forwarded-host/Host 白名单形态: 域名/IPv4/IPv6 括号 + 可选端口)。
var hostRe = regexp.MustCompile(`^[A-Za-z0-9]([A-Za-z0-9.\-]*[A-Za-z0-9])?(:[0-9]{1,5})?$|^\[[0-9A-Fa-f:.]+\](:[0-9]{1,5})?$`)

// validHost Host 头合法性(防注入 sitemap/canonical; 长度钳 253)。
func validHost(h string) bool {
	if h == "" || len(h) > 253 || strings.ContainsAny(h, "<>\"' \\%^|") {
		return false
	}
	return hostRe.MatchString(h)
}

// requestOrigin 反代兼容取 origin(canonical/og 绝对地址用)。
// Host 来源(x-forwarded-host/Host)不可信: 非法形态丢弃(sitemap/canonical 缺 origin 只降级不注入)。
func requestOrigin(r *http.Request) string {
	host := strings.TrimSpace(strings.SplitN(r.Header.Get("x-forwarded-host"), ",", 2)[0])
	if !validHost(host) {
		host = r.Host
	}
	if !validHost(host) {
		return ""
	}
	proto := strings.TrimSpace(strings.SplitN(r.Header.Get("x-forwarded-proto"), ",", 2)[0])
	if proto == "" {
		if r.TLS != nil {
			proto = "https"
		} else {
			proto = "http"
		}
	}
	if proto != "http" && proto != "https" {
		return ""
	}
	return proto + "://" + host
}

// head 组装 TDK 头(title/desc/keywords/canonical/og)。
// canonicalPath 为站内路径(可含 ?site=), 空串不输出 canonical。
func (d Deps) head(r *http.Request, site map[string]any, title, desc, kw, canonicalPath string) map[string]any {
	origin := requestOrigin(r)
	canonical := ""
	if canonicalPath != "" {
		if origin != "" {
			canonical = origin + canonicalPath
		} else {
			canonical = canonicalPath
		}
	}
	return map[string]any{
		"Title":       title,
		"Description": desc,
		"Keywords":    kw,
		"Canonical":   canonical,
		"OgType":      "website",
	}
}

// ---- 模板函数 ----

var tplFuncs = template.FuncMap{
	"safeHref":    safeHref,
	"coverURL":    coverURL,
	"fmtWords":    fmtWords,
	"fmtKB":       fmtKB,
	"num":         num64,
	"str":         ToStrSafe,
	"excerpt":     func(s string, n int) string { return clampCodePoints(plainText(s), n) },
	"dateMS":      fmtDateMS,
	"dateShort":   dateShortOf,
	"dateDay":     dateDayOf,
	"statusLabel": statusLabel,
	"bookHref":    bookHref,
	"chapterHref": chapterHref,
	"tocHref":     tocHref,
	"add":         func(a, b int) int { return a + b },
	"eqStr": func(a, b any) bool {
		return ToStrSafe(a) == ToStrSafe(b)
	},
	"recent48": func(v any) bool {
		return num64(v) > time.Now().UnixMilli()-48*3600_000
	},
	"readHTML":  func(s string) template.HTML { return template.HTML(sanitizeChapterHTML(contentToParagraphs(s))) },
	"siteTitle": siteTitle,
	"catHref": func(catName, sid string) string {
		return viewHref("category", sid, map[string]string{"cat": "cat:" + catName})
	},
	"catIDHref":           func(catID, sid string) string { return viewHref("category", sid, map[string]string{"cat": catID}) },
	"viewHrefSearch":      func(q, sid string) string { return viewHref("search", sid, map[string]string{"q": q}) },
	"viewHrefKeyword":     func(tag, sid string) string { return viewHref("keyword", sid, map[string]string{"tag": tag}) },
	"viewHrefCategoryAll": func(sid string) string { return viewHref("category", sid, nil) },
	"firstN": func(n int, in []map[string]any) []map[string]any {
		if n <= 0 || len(in) <= n {
			return in
		}
		return in[:n]
	},
}

func dateShortOf(v any) string {
	d := fmtDateMS(num64(v))
	if len(d) >= 10 {
		return d[5:10]
	}
	return d
}

func dateDayOf(v any) string {
	d := fmtDateMS(num64(v))
	if len(d) >= 10 {
		return d[:10]
	}
	return d
}

// ToStrSafe 模板 nil 安全字符串化。
func ToStrSafe(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	case []byte:
		return string(x)
	case int64:
		return fmt.Sprintf("%d", x)
	case int:
		return fmt.Sprintf("%d", x)
	default:
		return fmt.Sprint(x)
	}
}

func num64(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case int:
		return int64(x)
	case float64:
		return int64(x)
	case uint64:
		return int64(x)
	case nil:
		return 0
	default:
		return 0
	}
}
