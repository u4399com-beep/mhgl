// ============================================================
// R67-c — Web 层 R66-c 审查发现落地回归
// ①主题注册表单一来源 ②og:image/JSON-LD 组装 ③robots /feedback ④sitemap 301 收敛
// ============================================================
package web

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ---------------- ① 主题注册表(单一来源) ----------------

// TestThemeRegistry_MatchesEmbedFS 注册表与 embed FS tpl/themes 目录一一对应;
// 修前 api 层两处 11 主题硬编码与目录手工同步(加主题三处同改), 现目录为唯一事实源。
func TestThemeRegistry_MatchesEmbedFS(t *testing.T) {
	ids := ThemeIDs()
	if len(ids) != 11 {
		t.Fatalf("主题数=%d, want 11(与 tpl/themes 目录一致)", len(ids))
	}
	seen := map[string]bool{}
	for _, id := range ids {
		if seen[id] {
			t.Fatalf("主题清单重复: %s", id)
		}
		seen[id] = true
		if !themeRe.MatchString(id) {
			t.Fatalf("非法主题名进入清单: %s", id)
		}
		if !ThemeValid(id) {
			t.Fatalf("ThemeValid(%q)=false, 清单与可用性判定必须同源", id)
		}
	}
	for _, want := range []string{"aijjxs", "pili", "shipsay", "x33yq", "ggd66"} {
		if !seen[want] {
			t.Fatalf("主题 %s 缺席清单(目录存在但未收录)", want)
		}
	}
	if ThemeValid("no-such-theme") {
		t.Fatalf("不存在主题应判非法")
	}
	if ThemeValid("../x33yq") {
		t.Fatalf("路径形态应判非法(防拼接逃逸)")
	}
}

// TestThemeCatalog_OrderAndMeta 清单: 缺省主题置首 + 全部有名称/描述。
func TestThemeCatalog_OrderAndMeta(t *testing.T) {
	cat := ThemeCatalog()
	if len(cat) == 0 {
		t.Fatalf("清单为空")
	}
	if cat[0].ID != defaultTheme {
		t.Fatalf("首项=%s, want 缺省主题 %s", cat[0].ID, defaultTheme)
	}
	names := map[string]bool{}
	for _, it := range cat {
		if strings.TrimSpace(it.Name) == "" || strings.TrimSpace(it.Desc) == "" {
			t.Fatalf("主题 %s 名称/描述缺省未回落", it.ID)
		}
		names[it.ID] = true
	}
	if len(names) != len(cat) {
		t.Fatalf("清单 id 重复")
	}
}

// ---------------- ② og:image / Book JSON-LD ----------------

func TestOgImageOf(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "http://site.example/book/1.html", nil)
	if got := ogImageOf(r, ""); got != "" {
		t.Fatalf("空封面应返回空串, got %q", got)
	}
	if got := ogImageOf(r, "https://cdn.example/c.jpg"); got != "https://cdn.example/c.jpg" {
		t.Fatalf("外链封面应直用, got %q", got)
	}
	r2 := httptest.NewRequest(http.MethodGet, "http://site.example/book/1.html", nil)
	got := ogImageOf(r2, "covers/book_1.jpg")
	if !strings.HasPrefix(got, "http://site.example/api/public/cover?file=book_1") {
		t.Fatalf("本地封面应包装+补 origin 成绝对地址, got %q", got)
	}
	// origin 不可用(Host 非法) → 降级相对路径(与 canonical 同退化口径)
	r3 := httptest.NewRequest(http.MethodGet, "http://site.example/", nil)
	r3.Host = "bad host"
	if got := ogImageOf(r3, "covers/book_1.jpg"); !strings.HasPrefix(got, "/api/public/cover?file=") {
		t.Fatalf("origin 不可用应降级相对路径, got %q", got)
	}
}

// TestBookJSONLD_ShapeAndEscaping JSON-LD 数据面: 字段齐备 + HTML 特殊字符被
// json.Marshal 转义(产出内无裸 < > &, 注入无法逃出 script 元素)。
func TestBookJSONLD_ShapeAndEscaping(t *testing.T) {
	out := string(bookJSONLD(`万古神帝<续>`, "飞天鱼&?", "玄幻", "ongoing",
		`简介<script>alert(1)</script>`, "https://a.example/book/1.html",
		"https://a.example/cover.jpg"))
	var m map[string]any
	if err := json.Unmarshal([]byte(out), &m); err != nil {
		t.Fatalf("产出不是合法 JSON: %v\n%s", err, out)
	}
	if m["@type"] != "Book" || m["@context"] != "https://schema.org" {
		t.Fatalf("@type/@context 缺失: %s", out)
	}
	if strings.ContainsAny(out, "<>&") {
		t.Fatalf("产出含裸 HTML 特殊字符(注入面): %s", out)
	}
	author, _ := m["author"].(map[string]any)
	if author == nil || author["name"] != "飞天鱼&?" {
		t.Fatalf("author 字段形态错误: %v", m["author"])
	}
	if m["genre"] != "玄幻" || m["url"] != "https://a.example/book/1.html" || m["image"] != "https://a.example/cover.jpg" {
		t.Fatalf("genre/url/image 字段缺失: %s", out)
	}
	if ap, ok := m["additionalProperty"].(map[string]any); !ok || ap["value"] != "连载中" {
		t.Fatalf("连载状态字段缺失: %v", m["additionalProperty"])
	}
	// 空值字段不出现(缺省作者/分类/封面)
	min := string(bookJSONLD("书名", "", "", "", "", "", ""))
	if strings.Contains(min, "author") || strings.Contains(min, "genre") || strings.Contains(min, "image") {
		t.Fatalf("空字段不应输出: %s", min)
	}
	if !strings.Contains(min, `"name":"书名"`) {
		t.Fatalf("name 字段缺失: %s", min)
	}
}

// ---------------- ③ robots /feedback ----------------

func TestRobotsDisallowsFeedback(t *testing.T) {
	d := Deps{}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://x/robots.txt", nil)
	d.handleRobots(rec, req)
	body := rec.Body.String()
	if !strings.Contains(body, "Disallow: /feedback") {
		t.Fatalf("robots.txt 缺 /feedback Disallow:\n%s", body)
	}
	if !strings.Contains(body, "Disallow: /admin") || !strings.Contains(body, "Disallow: /api/admin") {
		t.Fatalf("robots.txt 既有 Disallow 面丢失:\n%s", body)
	}
}

// ---------------- ④ sitemap 301 收敛 ----------------

func TestSitemapRedirectsToAPITrack(t *testing.T) {
	d := Deps{} // DB 未装配 → 降级无 site 参数(生产恒有 DB)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://x/sitemap.xml", nil)
	d.handleSitemap(rec, req)
	if rec.Code != http.StatusMovedPermanently {
		t.Fatalf("status=%d, want 301", rec.Code)
	}
	if loc := rec.Header().Get("Location"); loc != "/api/public/sitemap" {
		t.Fatalf("Location=%q, want /api/public/sitemap", loc)
	}
	// 已带 site 参数的请求原样转发
	rec2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "http://x/sitemap.xml?site=abc123", nil)
	d.handleSitemap(rec2, req2)
	if loc := rec2.Header().Get("Location"); loc != "/api/public/sitemap?site=abc123" {
		t.Fatalf("site 参数未转发: %q", loc)
	}
}
