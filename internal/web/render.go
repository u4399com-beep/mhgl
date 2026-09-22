// ============================================================
// 模板引擎 — html/template 装载(每页克隆注入 content block) + 渲染助手 + 公共 funcmap
// ============================================================
package web

import (
	"embed"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"net/url"
	"path"
	"strings"
	"sync"
	"time"
)

//go:embed tpl
var tplFS embed.FS

// pageTpls 每页一个克隆模板(共享 layout/partials, 各页定义 content block)。
var (
	pageTplsOnce sync.Once
	pageTpls     map[string]*template.Template
)

// ensureTpls 惰性装载(cmd/server 未显式调 LoadTemplates 也能自举; 模板损坏 fatal 暴露问题)。
func ensureTpls() {
	pageTplsOnce.Do(LoadTemplates)
}

// LoadTemplates 启动期解析模板(硬失败: 模板损坏直接 panic 暴露问题)。
func LoadTemplates() {
	pageTpls = map[string]*template.Template{}
	pages := map[string][]string{
		// public
		"home":     {"tpl/public/layout.html", "tpl/public/home.html"},
		"book":     {"tpl/public/layout.html", "tpl/public/book.html"},
		"toc":      {"tpl/public/layout.html", "tpl/public/toc.html"},
		"read":     {"tpl/public/layout.html", "tpl/public/read.html"},
		"search":   {"tpl/public/layout.html", "tpl/public/search.html"},
		"history":  {"tpl/public/layout.html", "tpl/public/history.html"},
		"category": {"tpl/public/layout.html", "tpl/public/category.html"},
		"keyword":  {"tpl/public/layout.html", "tpl/public/keyword.html"},
		"ranking":  {"tpl/public/layout.html", "tpl/public/ranking.html"},
		"fulltext": {"tpl/public/layout.html", "tpl/public/fulltext.html"},
		"pseo":     {"tpl/public/layout.html", "tpl/public/pseo.html"},
		"404":      {"tpl/public/layout.html", "tpl/public/404.html"},
		// admin
		"admin": {"tpl/admin/layout.html", "tpl/admin/sections/dashboard.html"},
		"login": {"tpl/admin/login.html"},
	}
	for name, files := range pages {
		t, err := template.New(path.Base(files[0])).Funcs(tplFuncs).ParseFS(tplFS, files...)
		if err != nil {
			log.Fatalf("[web] parse template %s: %v", name, err)
		}
		pageTpls[name] = t
	}
	// 后台分区页: layout + 各分区 content
	for _, sec := range adminSections {
		f := "tpl/admin/sections/" + sec.key + ".html"
		t, err := template.New("layout.html").Funcs(tplFuncs).ParseFS(tplFS, "tpl/admin/layout.html", f)
		if err != nil {
			log.Fatalf("[web] parse template %s: %v", sec.key, err)
		}
		pageTpls["admin:"+sec.key] = t
	}
	log.Printf("[web] templates loaded: %d pages", len(pageTpls))
}

// render 执行页面模板(layout 根)。
func render(w http.ResponseWriter, name string, data any) {
	ensureTpls()
	t, ok := pageTpls[name]
	if !ok {
		http.Error(w, "template missing: "+name, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := t.ExecuteTemplate(w, "layout.html", data); err != nil {
		log.Printf("[web] render %s: %v", name, err)
	}
}

// render404 美观 404(带返回首页链接)。
func (d Deps) render404(w http.ResponseWriter, r *http.Request, msg string) {
	w.WriteHeader(http.StatusNotFound)
	site := d.resolveSite(r)
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

// requestOrigin 反代兼容取 origin(canonical/og 绝对地址用)。
func requestOrigin(r *http.Request) string {
	host := r.Header.Get("x-forwarded-host")
	if host == "" {
		host = r.Host
	}
	if host == "" {
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
	"safeHTML": func(s string) template.HTML { return template.HTML(sanitizeChapterHTML(s)) },
	"safeHref": safeHref,
	"coverURL": coverURL,
	"fmtWords": fmtWords,
	"fmtKB":    fmtKB,
	"num":      num64,
	"str":      ToStrSafe,
	"bool":     boolOf,
	"excerpt":  func(s string, n int) string { return clampCodePoints(plainText(s), n) },
	"dateMS":   fmtDateMS,
	"dateShort": func(v any) string {
		d := fmtDateMS(num64(v))
		if len(d) >= 10 {
			return d[5:10]
		}
		return d
	},
	"dateDay": func(v any) string {
		d := fmtDateMS(num64(v))
		if len(d) >= 10 {
			return d[:10]
		}
		return d
	},
	"statusLabel": statusLabel,
	"bookHref":    bookHref,
	"chapterHref": chapterHref,
	"tocHref":     tocHref,
	"add":         func(a, b int) int { return a + b },
	"queryEscape": func(s string) string { return url.QueryEscape(s) },
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

func boolOf(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	case int64:
		return x != 0
	case int:
		return x != 0
	case float64:
		return x != 0
	case nil:
		return false
	default:
		return false
	}
}
