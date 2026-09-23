// ============================================================
// charset 自动探测 + 解码(契约 §4)
// 探测序: Content-Type 头 → HTML meta(charset= / http-equiv=content-type)
//
//	→ XML prolog → 缺省 UTF-8
//
// 解码: golang.org/x/text(ianaindex 覆盖 utf-8/gbk/gb2312/gb18030/big5/shift-jis/euc-*
//
//	/iso-8859-*/windows-125x 等; 未知标签按 UTF-8 容错解码)
//
// ============================================================
package rule

import (
	"bytes"
	"golang.org/x/text/encoding"
	"golang.org/x/text/encoding/ianaindex"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/encoding/traditionalchinese"
	"golang.org/x/text/encoding/unicode"
	"regexp"
	"strings"
)

var (
	metaCharsetRe   = regexp.MustCompile(`(?i)<meta[^>]+charset\s*=\s*["']?\s*([a-zA-Z0-9_\-]+)`)
	xmlEncodingRe   = regexp.MustCompile(`(?i)<\?xml[^>]+encoding\s*=\s*["']([a-zA-Z0-9_\-]+)`)
	contentTypeCset = regexp.MustCompile(`(?i)charset\s*=\s*"?([a-zA-Z0-9_\-]+)"?`)
)

// SniffCharset 从 Content-Type 头与 HTML/JSON 响应体前部探测 charset 标签(小写)
func SniffCharset(contentType, body []byte) string {
	if len(contentType) > 0 {
		if m := contentTypeCset.FindSubmatch(contentType); m != nil {
			return strings.ToLower(string(m[1]))
		}
	}
	// 探测窗口: 前 4KB 足够覆盖 meta 声明位(与 TS/iconv 探测口径一致)
	peek := body
	if len(peek) > 4096 {
		peek = peek[:4096]
	}
	if m := metaCharsetRe.FindSubmatch(peek); m != nil {
		return strings.ToLower(string(m[1]))
	}
	if m := xmlEncodingRe.FindSubmatch(peek); m != nil {
		return strings.ToLower(string(m[1]))
	}
	// BOM 探测
	if len(peek) >= 3 && peek[0] == 0xEF && peek[1] == 0xBB && peek[2] == 0xBF {
		return "utf-8"
	}
	if len(peek) >= 2 && ((peek[0] == 0xFF && peek[1] == 0xFE) || (peek[0] == 0xFE && peek[1] == 0xFF)) {
		return "utf-16"
	}
	return ""
}

// DecodeBody 按 charset 标签解码响应体为 UTF-8 串; 缺省/utf-8 直接走(带 BOM 剥除)
func DecodeBody(body []byte, charset string) string {
	cs := strings.TrimSpace(charset)
	if cs == "" || cs == "utf-8" || cs == "utf8" || cs == "ascii" || cs == "us-ascii" {
		return stripBOM(body)
	}
	enc := lookupEncoding(cs)
	if enc == nil {
		// 未知标签: 按 UTF-8 容错解码(非法字节 → U+FFFD, 与 iconv-lite 缺省行为接近)
		return stripBOM(body)
	}
	decoded, err := enc.NewDecoder().Bytes(body)
	if err != nil && len(decoded) == 0 {
		// 解码器容错模式下极少整体失败; 全败时按 UTF-8 兜底
		return stripBOM(body)
	}
	return stripBOM(decoded)
}

// lookupEncoding charset 标签 → x/text 编码器(ianaindex 为主 + 常见别名硬表兜底)
func lookupEncoding(label string) encoding.Encoding {
	l := strings.ToLower(strings.TrimSpace(label))
	l = strings.ReplaceAll(l, "_", "-")
	switch l {
	case "gbk", "gb2312", "gb-2312", "gbk2312", "csgb2312", "csiso58gb231280":
		return simplifiedchinese.GBK
	case "gb18030", "gb-18030", "gb18030-2000", "gb18030-2022":
		return simplifiedchinese.GB18030
	case "big5", "big-5", "big5-hkscs", "csbig5":
		return traditionalchinese.Big5
	case "utf-16", "utf-16le", "utf16le":
		return unicode.UTF16(unicode.LittleEndian, unicode.UseBOM)
	case "utf-16be", "utf16be":
		return unicode.UTF16(unicode.BigEndian, unicode.UseBOM)
	case "utf-8-sig":
		return unicode.UTF8BOM
	}
	enc, err := ianaindex.IANA.Encoding(l)
	if err != nil || enc == nil {
		enc, err = ianaindex.MIME.Encoding(l)
		if err != nil || enc == nil {
			return nil
		}
	}
	// x/text 的 ISO-8859-1/ascii 实现: ianaindex 返回的 ISO8859-1 实际为
	// charmap.ISO8859-1, 与浏览器 latin1 语义一致
	return enc
}

func stripBOM(b []byte) string {
	b = bytes.TrimPrefix(b, []byte{0xEF, 0xBB, 0xBF})
	b = bytes.TrimPrefix(b, []byte{0xFE, 0xFF})
	b = bytes.TrimPrefix(b, []byte{0xFF, 0xFE})
	return string(b)
}
