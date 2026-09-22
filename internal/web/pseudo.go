// ============================================================
// 伪静态解析/生成 — src/lib/pseudostatic.ts 宽容解析口径移植
//
//	/book/{tok}[.html]                  → 书籍页
//	/read/{btok}/{ctok}[.html]          → 章节页
//	/read/{btok}_{ctok}[.html]          → 紧凑双段
//	/read/{btok}[/]                     → 落书籍详情页(比 404 友好)
//	token: 纯数字 / b前缀(书) / c前缀(章) / cuid 形态(id 直查)
//
// 生成侧(站内链接)统一走 /book/{num}.html 与 /read/{num}/{idx}.html 形态。
// ============================================================
package web

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

var (
	numTokenRe   = regexp.MustCompile(`^\d{1,10}$`)
	alnumBookRe  = regexp.MustCompile(`^b\d{1,10}$`)
	alnumChRe    = regexp.MustCompile(`^c\d{1,10}$`)
	cuidTokenRe  = regexp.MustCompile(`^[a-z0-9]{16,36}$`)
	htmlSuffixRe = regexp.MustCompile(`(?i)\.html?$`)
)

const int32Max = 2147483647

type prettyPath struct {
	view         string // book|read
	bookToken    string
	chapterToken string
}

func validBookToken(t string) bool {
	return numTokenRe.MatchString(t) || alnumBookRe.MatchString(t) || cuidTokenRe.MatchString(t)
}

func validChapterToken(t string) bool {
	return numTokenRe.MatchString(t) || alnumChRe.MatchString(t) || cuidTokenRe.MatchString(t)
}

// parseCompactToken /read/{btok}_{ctok}。
func parseCompactToken(tok string) (b, c string, ok bool) {
	i := strings.IndexByte(tok, '_')
	if i <= 0 || i == len(tok)-1 {
		return "", "", false
	}
	b, c = tok[:i], tok[i+1:]
	if !validBookToken(b) || !validChapterToken(c) {
		return "", "", false
	}
	return b, c, true
}

// parsePrettyPath 宽容解析(路径 → token 集合; 不做库解析)。非 book/read 命名空间 → nil。
func parsePrettyPath(pathname string) *prettyPath {
	p := strings.SplitN(pathname, "?", 2)[0]
	p = strings.SplitN(p, "#", 2)[0]
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	segs := strings.Split(p, "/")
	var parts []string
	for _, s := range segs {
		if s == "" {
			continue
		}
		if dec, err := url.PathUnescape(s); err == nil {
			s = dec
		}
		parts = append(parts, htmlSuffixRe.ReplaceAllString(s, ""))
	}
	if len(parts) < 2 {
		return nil
	}
	kind := strings.ToLower(parts[0])
	book := parts[1]
	switch kind {
	case "book":
		if !validBookToken(book) {
			return nil
		}
		return &prettyPath{view: "book", bookToken: book}
	case "read":
		if len(parts) == 2 {
			if b, c, ok := parseCompactToken(book); ok {
				return &prettyPath{view: "read", bookToken: b, chapterToken: c}
			}
			// /read/{btok} 缺章节段 → 目录页(真站 /read/{num}/=章节列表)
			if validBookToken(book) {
				return &prettyPath{view: "toc", bookToken: book}
			}
			return nil
		}
		if !validBookToken(book) {
			return nil
		}
		ch := parts[2]
		if !validChapterToken(ch) {
			return nil
		}
		return &prettyPath{view: "read", bookToken: book, chapterToken: ch}
	default:
		return nil
	}
}

// tokenToNum '1001'→1001; 'b1001'→1001; 'c3'→3; cuid → 0(走 id 查询)。
func tokenToNum(tok string) int64 {
	if numTokenRe.MatchString(tok) {
		n, _ := strconv.ParseInt(tok, 10, 64)
		if n >= 1 && n <= int32Max {
			return n
		}
		return 0
	}
	if alnumBookRe.MatchString(tok) || alnumChRe.MatchString(tok) {
		n, _ := strconv.ParseInt(tok[1:], 10, 64)
		if n >= 1 && n <= int32Max {
			return n
		}
	}
	return 0
}

// tokenIsCuid cuid 形态(走 id 直查)。
func tokenIsCuid(tok string) bool {
	return cuidTokenRe.MatchString(tok) && !numTokenRe.MatchString(tok) &&
		!alnumBookRe.MatchString(tok) && !alnumChRe.MatchString(tok)
}

// bookHref 书籍页链接: 有 num → /book/{num}.html; 否则查询串(永不死链)。
func bookHref(id string, num int64, siteID string) string {
	var p string
	if num > 0 {
		p = "/book/" + itoa64local(num) + ".html"
	} else {
		p = "/?view=book&id=" + queryEscapeLocal(id)
	}
	return joinSite(p, siteID)
}

// chapterHref 章节页链接(需书号+章内序号; 缺则查询串)。
func chapterHref(chapterID string, bookNum, idx int64, siteID string) string {
	var p string
	if bookNum > 0 && idx > 0 {
		p = "/read/" + itoa64local(bookNum) + "/" + itoa64local(idx) + ".html"
	} else {
		p = "/?view=read&chapter=" + queryEscapeLocal(chapterID)
	}
	return joinSite(p, siteID)
}

// tocHref 目录页链接(查询串形态; 伪静态目录走 /read/{num} 落书籍页, 此处统一查询串+锚)。
func tocHref(bookID string, bookNum int64, siteID string) string {
	if bookNum > 0 {
		return joinSite("/read/"+itoa64local(bookNum)+"/", siteID)
	}
	return joinSite("/?view=toc&id="+queryEscapeLocal(bookID), siteID)
}

// catHref / searchHref / keywordHref / viewHref 查询串视图链接。
func joinSite(base, siteID string) string {
	if siteID == "" {
		return base
	}
	sep := "?"
	if strings.Contains(base, "?") {
		sep = "&"
	}
	return base + sep + "site=" + queryEscapeLocal(siteID)
}

func viewHref(view string, siteID string, extra map[string]string) string {
	qs := "view=" + queryEscapeLocal(view)
	for k, v := range extra {
		if v == "" {
			continue
		}
		qs += "&" + k + "=" + queryEscapeLocal(v)
	}
	return joinSite("/?"+qs, siteID)
}
