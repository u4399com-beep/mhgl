// ============================================================
// [R73-3] sitemap 三段式分片 index 回归 ——
//
//	默认入口 = <sitemapindex>(static/books/chapters 按段分页, 空段不列);
//	?type= 分片子片 urlset(行级 lastmod); 旧 ?page/?index 形态保持兼容。
//
// ============================================================
package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mhgl/internal/auth"
)

func r73Deps(t *testing.T) Deps {
	return Deps{DB: newTestDB(t), Auth: auth.NewService("pw", "s", false)}
}

// clearSitemapCache 测试间清包级缓存(cacheKey 只含 base/type/page, 同 Host 跨测试命中)。
func clearSitemapCache() {
	sitemapCacheMu.Lock()
	sitemapCache = map[string]sitemapCacheEntry{}
	sitemapCacheMu.Unlock()
}

func TestR73_SitemapDefaultIsIndex(t *testing.T) {
	clearSitemapCache()
	d := r73Deps(t)
	must67(t)(d.DB.Exec(`INSERT INTO "Book" (id,num,name,updatedAt) VALUES ('bk1',1001,'书',1700000000000)`))
	must67(t)(d.DB.Exec(`INSERT INTO "Book" (id,num,name,updatedAt) VALUES ('bk2',1002,'书2',1700000100000)`))
	must67(t)(d.DB.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,content,updatedAt) VALUES ('ch1','bk1',1,'章','内容',1700000200000)`))

	req := httptest.NewRequest("GET", "http://x.test/api/public/sitemap", nil)
	rec := httptest.NewRecorder()
	d.publicSitemap(rec, req)
	body := rec.Body.String()
	if !strings.Contains(body, "<sitemapindex") {
		t.Fatalf("默认入口应为 sitemapindex: %s", body)
	}
	for _, want := range []string{
		`?type=static`, `?type=books&amp;page=1`, `?type=chapters&amp;page=1`,
		`<lastmod>2023-11-`, // lastmod 来自 max(updatedAt) 而非 now(1700000200000 = 2023-11-15 前后)
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("index 缺 %q: %s", want, body)
		}
	}
	// now() 伪 lastmod 检查: index 里不应出现请求当天的日期(2026 年)
	if strings.Contains(body, "2026-") {
		t.Errorf("index lastmod 出现 now() 伪值: %s", body)
	}
}

func TestR73_SitemapTypeSegments(t *testing.T) {
	clearSitemapCache()
	d := r73Deps(t)
	must67(t)(d.DB.Exec(`INSERT INTO "Category" (id,name,sortOrder) VALUES ('cat1','玄幻',1)`))
	must67(t)(d.DB.Exec(`INSERT INTO "Book" (id,num,name,updatedAt) VALUES ('bk1',1001,'书',1700000000000)`))
	must67(t)(d.DB.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,content,updatedAt) VALUES ('ch1','bk1',1,'章','内容',1700000200000)`))

	// static 片: 首页+视图+分类
	rec := httptest.NewRecorder()
	d.publicSitemap(rec, httptest.NewRequest("GET", "http://x.test/api/public/sitemap?type=static", nil))
	body := rec.Body.String()
	if !strings.Contains(body, "<urlset") || !strings.Contains(body, "view=ranking") || !strings.Contains(body, "cat1") {
		t.Fatalf("static 片缺面: %s", body)
	}

	// books 片: 伪静态缺省(query 形态)
	rec = httptest.NewRecorder()
	d.publicSitemap(rec, httptest.NewRequest("GET", "http://x.test/api/public/sitemap?type=books", nil))
	body = rec.Body.String()
	if !strings.Contains(body, "view=book") {
		t.Fatalf("books 片缺书籍 loc: %s", body)
	}

	// chapters 片
	rec = httptest.NewRecorder()
	d.publicSitemap(rec, httptest.NewRequest("GET", "http://x.test/api/public/sitemap?type=chapters", nil))
	body = rec.Body.String()
	if !strings.Contains(body, "view=read") && !strings.Contains(body, "/read/") {
		t.Fatalf("chapters 片缺章节 loc: %s", body)
	}

	// 未知 type → 合法空 urlset(非 500)
	rec = httptest.NewRecorder()
	d.publicSitemap(rec, httptest.NewRequest("GET", "http://x.test/api/public/sitemap?type=bogus", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("未知 type 应 200: %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "</urlset>") {
		t.Fatalf("未知 type 应返回空 urlset: %s", rec.Body.String())
	}
}

func TestR73_SitemapEmptyDBIndex(t *testing.T) {
	clearSitemapCache()
	d := r73Deps(t)
	// 空库: index 只含 static 片(books/chapters 空段不列) —— 修前 totalPages=1 恒产出一个空片
	rec := httptest.NewRecorder()
	d.publicSitemap(rec, httptest.NewRequest("GET", "http://x.test/api/public/sitemap", nil))
	body := rec.Body.String()
	if strings.Contains(body, "type=books") || strings.Contains(body, "type=chapters") {
		t.Fatalf("空库不应列出空段: %s", body)
	}
	if !strings.Contains(body, "type=static") {
		t.Fatalf("static 片恒在: %s", body)
	}
}

func TestR73_SitemapLegacyFormsStillWork(t *testing.T) {
	clearSitemapCache()
	d := r73Deps(t)
	must67(t)(d.DB.Exec(`INSERT INTO "Book" (id,num,name,updatedAt) VALUES ('bk1',1001,'书',1700000000000)`))
	// ?page=1 旧形态仍可用
	rec := httptest.NewRecorder()
	d.publicSitemap(rec, httptest.NewRequest("GET", "http://x.test/api/public/sitemap?page=1", nil))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "<urlset") {
		t.Fatalf("?page=1 兼容破坏: %d %s", rec.Code, rec.Body.String()[:200])
	}
	// ?index=1 旧形态仍可用
	rec = httptest.NewRecorder()
	d.publicSitemap(rec, httptest.NewRequest("GET", "http://x.test/api/public/sitemap?index=1", nil))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "<sitemapindex") {
		t.Fatalf("?index=1 兼容破坏: %d", rec.Code)
	}
}
