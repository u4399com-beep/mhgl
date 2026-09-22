// ============================================================
// R55-3b — 伪静态纯函数(移植 src/lib/pseudostatic.ts + pseudostatic-server.ts 解析口径)
// ============================================================
package api

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

var (
	pseudoNumTokenRe  = regexp.MustCompile(`^\d{1,10}$`)
	pseudoAlnumBookRe = regexp.MustCompile(`^b\d{1,10}$`)
	pseudoAlnumChRe   = regexp.MustCompile(`^c\d{1,10}$`)
	// TS CUID_TOKEN_RE 带 i 标志(大小写不敏感), 同口径
	pseudoCuidTokenRe = regexp.MustCompile(`(?i)^[a-z0-9]{16,36}$`)
	pseudoHTMLSufRe   = regexp.MustCompile(`(?i)\.html?$`)
)

const pseudoInt32Max = 2147483647

func pseudoClampInt(n int64) int64 {
	if n < 1 || n > pseudoInt32Max {
		return 0
	}
	return n
}

// tokenToNum '1001'→1001 / 'b1001'→1001 / 'c3'→3 / cuid→0。
func tokenToNum(token string) int64 {
	if pseudoNumTokenRe.MatchString(token) {
		n, _ := strconv.ParseInt(token, 10, 64)
		return pseudoClampInt(n)
	}
	if pseudoAlnumBookRe.MatchString(token) || pseudoAlnumChRe.MatchString(token) {
		n, _ := strconv.ParseInt(token[1:], 10, 64)
		return pseudoClampInt(n)
	}
	return 0
}

// tokenIsCuid cuid 形态(非纯数字/非 bN/cN)。
func tokenIsCuid(token string) bool {
	return pseudoCuidTokenRe.MatchString(token) &&
		!pseudoNumTokenRe.MatchString(token) &&
		!pseudoAlnumBookRe.MatchString(token) &&
		!pseudoAlnumChRe.MatchString(token)
}

func validBookToken(t string) bool {
	return pseudoNumTokenRe.MatchString(t) || pseudoAlnumBookRe.MatchString(t) || pseudoCuidTokenRe.MatchString(t)
}

func validChapterToken(t string) bool {
	return pseudoNumTokenRe.MatchString(t) || pseudoAlnumChRe.MatchString(t) || pseudoCuidTokenRe.MatchString(t)
}

// parseCompactToken /read/1001_3 紧凑双段。
func parseCompactToken(token string) (book, chapter string, ok bool) {
	i := strings.IndexByte(token, '_')
	if i <= 0 || i == len(token)-1 {
		return "", "", false
	}
	b, c := token[:i], token[i+1:]
	if !validBookToken(b) || !validChapterToken(c) {
		return "", "", false
	}
	return b, c, true
}

// parsedPretty parsePrettyPath 结果。
type parsedPretty struct {
	view         string // book|read
	bookToken    string
	chapterToken string
}

// parsePrettyPath 宽容解析 /book/{tok}[/|.html] 与 /read/{btok}/{ctok}[/|.html] 与 /read/{btok}_{ctok}.html。
func parsePrettyPath(pathname string) *parsedPretty {
	p := strings.SplitN(pathname, "?", 2)[0]
	p = strings.SplitN(p, "#", 2)[0]
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	var segs []string
	for _, s := range strings.Split(p, "/") {
		if s == "" {
			continue
		}
		// 对齐 TS: 逐段 decodeURIComponent(非法编码保留原文) + 剥 .html/.htm 后缀(不区分大小写)
		if dec, err := url.PathUnescape(s); err == nil {
			s = dec
		}
		s = pseudoHTMLSufRe.ReplaceAllString(s, "")
		segs = append(segs, s)
	}
	if len(segs) < 2 {
		return nil
	}
	kind := strings.ToLower(segs[0])
	rawBook := segs[1]
	if kind == "book" {
		if !validBookToken(rawBook) {
			return nil
		}
		return &parsedPretty{view: "book", bookToken: rawBook}
	}
	if kind != "read" {
		return nil
	}
	if len(segs) == 2 {
		if b, c, ok := parseCompactToken(rawBook); ok {
			return &parsedPretty{view: "read", bookToken: b, chapterToken: c}
		}
		if !validBookToken(rawBook) {
			return nil
		}
		return &parsedPretty{view: "book", bookToken: rawBook}
	}
	if !validBookToken(rawBook) {
		return nil
	}
	if !validChapterToken(segs[2]) {
		return nil
	}
	return &parsedPretty{view: "read", bookToken: rawBook, chapterToken: segs[2]}
}

// buildBookPath 预设→书籍页路径(无法生成返回 "")。
func buildBookPath(num int64, preset string) string {
	if preset == "query" || num <= 0 {
		return ""
	}
	tok := strconv.FormatInt(num, 10)
	if preset == "alnum" {
		tok = "b" + tok
	}
	switch preset {
	case "directory":
		return "/book/" + tok + "/"
	case "restful":
		return "/book/" + tok
	default: // numeric/alnum/compact
		return "/book/" + tok + ".html"
	}
}

// buildReadPath 预设→阅读页路径(无法生成返回 "")。
func buildReadPath(num, idx int64, preset string) string {
	if preset == "query" || num <= 0 || idx <= 0 {
		return ""
	}
	b := strconv.FormatInt(num, 10)
	c := strconv.FormatInt(idx, 10)
	if preset == "alnum" {
		b, c = "b"+b, "c"+c
	}
	switch preset {
	case "compact":
		return "/read/" + strconv.FormatInt(num, 10) + "_" + strconv.FormatInt(idx, 10) + ".html"
	case "directory":
		return "/read/" + b + "/" + c + "/"
	case "restful":
		return "/read/" + b + "/" + c
	default:
		return "/read/" + b + "/" + c + ".html"
	}
}
