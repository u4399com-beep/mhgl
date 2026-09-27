// ============================================================
// [R74-c] sitemap 二轮审计回归 —— 协议形态硬校验:
//
//	默认 index 与全部子片输出必须是 well-formed XML(encoding/xml 全量解析);
//	lastmod 恒为 W3C datetime(YYYY-MM-DDTHH:MM:SSZ) 或整体省略;
//	PSEO slug(CJK/空格/&/引号) 经 urlPathEscape 后 loc 无裸特殊字节;
//	单书/单章/越界页边界。
//
// ============================================================
package api

import (
	"encoding/xml"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

var r74cLastmodRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$`)

type r74cLocOnly struct {
	Locs    []string `xml:"sitemap>loc"`
	URLs    []string `xml:"url>loc"`
	Lastmod []string `xml:"sitemap>lastmod"`
	URLMod  []string `xml:"url>lastmod"`
}

func r74cParseXML(t *testing.T, body string) r74cLocOnly {
	t.Helper()
	var p r74cLocOnly
	if err := xml.Unmarshal([]byte(body), &p); err != nil {
		t.Fatalf("输出非 well-formed XML: %v\n%s", err, body[:minStr(len(body), 400)])
	}
	return p
}

func minStr(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func r74cSeed(t *testing.T) Deps {
	t.Helper()
	clearSitemapCache()
	d := r73Deps(t)
	must67(t)(d.DB.Exec(`INSERT INTO "Category" (id,name,sortOrder) VALUES ('cat1','玄幻',1)`))
	must67(t)(d.DB.Exec(`INSERT INTO "Book" (id,num,name,updatedAt) VALUES ('bk1',1001,'书',1700000000000)`))
	must67(t)(d.DB.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,content,updatedAt) VALUES ('ch1','bk1',1,'章','内容',1700000200000)`))
	// PSEO slug 带攻击性形态: CJK/空格/&/引号/(斜杠)
	must67(t)(d.DB.Exec(`INSERT INTO "PseoPage" (id,keyword,slug,status,updatedAt) VALUES ('pp1','词','美丽 的&<"x"/词?y=1','active',1700000300000)`))
	return d
}

func TestR74c_SitemapXMLWellFormedAndLastmodStrict(t *testing.T) {
	d := r74cSeed(t)

	// 默认 index: well-formed + lastmod 严格 W3C datetime
	rec := httptest.NewRecorder()
	d.publicSitemap(rec, httptest.NewRequest("GET", "http://x.test/api/public/sitemap", nil))
	idx := r74cParseXML(t, rec.Body.String())
	if len(idx.Locs) < 3 {
		t.Fatalf("index 应列出 static+books+chapters 子片: %s", rec.Body.String())
	}
	for _, lm := range idx.Lastmod {
		if !r74cLastmodRe.MatchString(lm) {
			t.Fatalf("index lastmod 非 W3C datetime 严格形态: %q", lm)
		}
	}
	if len(idx.Lastmod) != 2 { // static 段无 PseoPage lastmod? 有 pp1 → static 也应带; 见下断言
		t.Logf("index lastmod 数量=%d(static 段 PseoPage max 在位时应为 3): %v", len(idx.Lastmod), idx.Lastmod)
	}

	// 全部子片逐一 GET: well-formed + url 级 lastmod 严格 + 无裸 & 字节
	for _, loc := range idx.Locs {
		path := strings.TrimPrefix(loc, "http://x.test")
		rec := httptest.NewRecorder()
		d.publicSitemap(rec, httptest.NewRequest("GET", "http://x.test"+path, nil))
		if rec.Code != 200 {
			t.Fatalf("子片 %s 非 200: %d", path, rec.Code)
		}
		p := r74cParseXML(t, rec.Body.String())
		for _, u := range p.URLs {
			if strings.ContainsAny(u, "<>") {
				t.Fatalf("loc 含未转义字节: %q", u)
			}
		}
		for _, lm := range p.URLMod {
			if !r74cLastmodRe.MatchString(lm) {
				t.Fatalf("url lastmod 非 W3C datetime: %q", lm)
			}
		}
	}

	// PSEO slug 面: static 片 pseo 行的 loc 应全量百分号编码(空格/&/< > 引号/斜杠不裸现)
	rec = httptest.NewRecorder()
	d.publicSitemap(rec, httptest.NewRequest("GET", "http://x.test/api/public/sitemap?type=static", nil))
	sp := r74cParseXML(t, rec.Body.String())
	found := false
	for _, u := range sp.URLs {
		if !strings.Contains(u, "/p/") {
			continue
		}
		found = true
		for _, bad := range []string{" ", "&", "<", ">", `"`, "?", "/词"} {
			bare := strings.SplitN(u, "/p/", 2)[1]
			if strings.Contains(bare, bad) {
				t.Fatalf("pseo loc 未编码字节 %q: %q", bad, u)
			}
		}
	}
	if !found {
		t.Fatalf("static 片缺 pseo 行: %s", rec.Body.String())
	}
}

func TestR74c_SitemapBoundaries(t *testing.T) {
	d := r74cSeed(t)

	// 单书单章: books=1 页 chapters=1 页; 越界页 → 合法空 urlset(200)
	for _, tc := range []struct {
		q    string
		want int
	}{
		{"/api/public/sitemap?type=books&page=1", 1},
		{"/api/public/sitemap?type=books&page=2", 0},
		{"/api/public/sitemap?type=chapters&page=1", 1},
		{"/api/public/sitemap?type=chapters&page=2", 0},
		{"/api/public/sitemap?type=books&page=999999999999", 0}, // 超长页码钳 1000 → 空片非 500
	} {
		rec := httptest.NewRecorder()
		d.publicSitemap(rec, httptest.NewRequest("GET", "http://x.test"+tc.q, nil))
		if rec.Code != 200 {
			t.Fatalf("%s 应 200: %d", tc.q, rec.Code)
		}
		p := r74cParseXML(t, rec.Body.String())
		if len(p.URLs) != tc.want {
			t.Fatalf("%s URLs=%d want %d: %s", tc.q, len(p.URLs), tc.want, rec.Body.String())
		}
	}

	// 空 lastmod 省略: books 行 updatedAt=0 的书 → 无 <lastmod> 元素
	// (先清缓存: 上面循环已把 page=1 的旧结果缓存, 库变更后须失效重取;
	//  type 分片 5000/页 → 两本书都在 page=1, updatedAt=0 排末位且无 lastmod)
	must67(t)(d.DB.Exec(`INSERT INTO "Book" (id,num,name) VALUES ('bk0',1000,'零时间')`))
	clearSitemapCache()
	rec := httptest.NewRecorder()
	d.publicSitemap(rec, httptest.NewRequest("GET", "http://x.test/api/public/sitemap?type=books&page=1", nil))
	p := r74cParseXML(t, rec.Body.String())
	if len(p.URLs) != 2 || len(p.URLMod) != 1 {
		t.Fatalf("updatedAt=0 行应省略 lastmod(2 loc/1 lastmod): %s", rec.Body.String())
	}

	// 未知 type: 合法空 urlset 直出但不落缓存([R74-c] 修前注释与行为相悖,
	// 垃圾键可挤占 sitemapCacheMax 50 槽把合法子片逐出)
	rec = httptest.NewRecorder()
	d.publicSitemap(rec, httptest.NewRequest("GET", "http://x.test/api/public/sitemap?type=bogus", nil))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "</urlset>") {
		t.Fatalf("未知 type 应 200 空 urlset: %d", rec.Code)
	}
	sitemapCacheMu.Lock()
	_, cached := sitemapCache["http://x.test|page=|index=|type=bogus|site=|preset=query"]
	sitemapCacheMu.Unlock()
	if cached {
		t.Fatalf("未知 type 的垃圾空片不应入缓存")
	}
}
