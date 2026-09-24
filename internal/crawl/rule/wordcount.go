// ============================================================
// 字数解析工具 — book.fields.wordCount 原文 → 字数(int64)
//
//	[R62-f] ParsedBook 白名单接线配套(R61-1B 盲区留档): 两种实测形态都支持 ——
//	  ① 纯数字: taijiwang 详情 API word_number=3079864(兼容千分位逗号/空格)
//	  ② 中文带单位: shudugu "353.5万字"(mantissa 小数 + 万/亿 倍率 + 尾缀「字」)
//	无法解析/无数字/超界一律返回 0(调用侧 >0 才落库, 聚合链兜底)。
//
// ============================================================
package rule

import (
	"strings"
)

// wordCountMax 字数合理上限(10^10 = 百亿字; 真实网文 ≤ 数亿字, 超限判脏数据弃用)。
const wordCountMax = int64(10_000_000_000)

// parseWordCount 字数原文解析(宽容前缀/尾缀, 严格数字段)。
// 支持: "3079864" / "3,079,864" / "353.5万字" / "353.5万" / "1.2亿字" /
// "共 353.5 万字" / 全角数字「３５３」; 不支持(→0): 空串/无数字/多小数点/超上限。
func parseWordCount(raw string) int64 {
	s := strings.TrimSpace(raw)
	if s == "" {
		return 0
	}
	// 全角数字/小数点归一(容错中文站排版)
	s = strings.NewReplacer(
		"０", "0", "１", "1", "２", "2", "３", "3", "４", "4",
		"５", "5", "６", "6", "７", "7", "８", "8", "９", "9", "．", ".",
	).Replace(s)
	// 剥千分位逗号与空格
	s = strings.ReplaceAll(s, ",", "")
	s = strings.ReplaceAll(s, " ", "")

	// 抠首段数字形态(数字与点; 至少含一位数字, 点数合法性交给 parseFloatSafe)
	start, end := -1, len(s)
	for i := 0; i < len(s); i++ {
		c := s[i]
		if start == -1 {
			if isDigit(c) || (c == '.' && i+1 < len(s) && isDigit(s[i+1])) {
				start = i
			}
			continue
		}
		if !isDigit(c) && c != '.' {
			end = i
			break
		}
	}
	if start == -1 {
		return 0
	}
	// 数字段之后紧跟的单位决定倍率(万/亿; 其余尾缀忽略)
	mult := int64(1)
	if rest := s[end:]; strings.HasPrefix(rest, "万") {
		mult = 10_000
	} else if strings.HasPrefix(rest, "亿") {
		mult = 100_000_000
	}
	mantissa, ok := parseFloatSafe(s[start:end])
	if !ok {
		return 0
	}
	n := int64(mantissa*float64(mult) + 0.5) // 四舍五入
	if n <= 0 || n > wordCountMax {
		return 0
	}
	return n
}

func isDigit(c byte) bool { return c >= '0' && c <= '9' }

// parseFloatSafe 纯数字段(至多一个小数点)解析; 非法形态(空/多点/裸点/杂字符)→ false。
func parseFloatSafe(s string) (float64, bool) {
	if s == "" || s == "." || strings.Count(s, ".") > 1 {
		return 0, false
	}
	var intPart, fracPart float64
	head, tail, _ := strings.Cut(s, ".")
	for _, c := range []byte(head) {
		if !isDigit(c) {
			return 0, false
		}
		intPart = intPart*10 + float64(c-'0')
	}
	for i := len(tail) - 1; i >= 0; i-- {
		if !isDigit(tail[i]) {
			return 0, false
		}
		fracPart = (fracPart + float64(tail[i]-'0')) / 10
	}
	return intPart + fracPart, true
}
