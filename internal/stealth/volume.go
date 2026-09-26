// ============================================================
// R70-c2 — 章节标题分卷前缀识别(目录页卷分组数据契约的解析件)
//
// SplitVolume 识别章节标题开头的卷前缀形态(中文数字 + 阿拉伯数字):
//
//	第X卷 / 第X部   第一卷 风起 | 第12卷 | 第3部 终章 | 第两百卷
//	卷N             卷一 | 卷12 · 旧事
//	Vol.N           Vol.2 深海 | vol 10 | VOL.3
//
// 命中 → (前缀, 余题, true); 不命中 → ("", 原题去首空白, false)。
// 纯手写字符扫描(零正则/零依赖): 怪输入(空串/纯符号/截断)保守不命中不 panic。
// ============================================================
package stealth

import "strings"

// cnDigit 中文数字字符集(零〇一两 + 一至十百千; 不含"兆/亿"级, 卷号够用)。
func isCnNumRune(c rune) bool {
	switch c {
	case '零', '〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
		'百', '千', '两':
		return true
	}
	return false
}

func isAsciiDigit(c byte) bool { return c >= '0' && c <= '9' }

// SplitVolume 从章节标题识别卷前缀。vol=卷前缀本体(如 "第一卷"/"Vol.2",
// 去尾部空白), rest=余下标题(去前导空白与常见连接符), ok=是否命中。
// 注意: "第X章" 不是卷前缀(章≠卷/部); 前缀必须位于标题最开头。
func SplitVolume(title string) (vol, rest string, ok bool) {
	s := strings.TrimSpace(title)
	if s == "" {
		return "", "", false
	}
	runes := []rune(s)
	i := 0
	end := -1 // 前缀结束点(rune 下标, 含最后一个标记字符)
	switch {
	case runes[0] == '第':
		i = 1
		// 数字段: 中文数字/阿拉伯数字混收(段内空白宽容), 至少 1 个。
		j := i
		for j < len(runes) {
			c := runes[j]
			if isCnNumRune(c) || ('0' <= c && c <= '9') {
				j++
				continue
			}
			if c == ' ' { // 数字段内空白(含首空格): 仅当后续仍是数字才吞入
				k := j + 1
				for k < len(runes) && runes[k] == ' ' {
					k++
				}
				if k < len(runes) && (isCnNumRune(runes[k]) || ('0' <= runes[k] && runes[k] <= '9')) {
					j = k
					continue
				}
				break
			}
			break
		}
		if j == i {
			return "", trimRest(s, 0), false // "第..." 无数字 → 不命中
		}
		// 数字段与卷/部标记间空白宽容: "第 12 卷"。
		k := j
		for k < len(runes) && runes[k] == ' ' {
			k++
		}
		if k < len(runes) && (runes[k] == '卷' || runes[k] == '部') {
			end = k
		} else {
			return "", trimRest(s, 0), false // 第X章/第X话/第X节 → 不命中
		}
	case runes[0] == '卷':
		j := 1
		for j < len(runes) && (isCnNumRune(runes[j]) || (rune('0') <= runes[j] && runes[j] <= rune('9'))) {
			j++
		}
		if j == 1 {
			return "", trimRest(s, 0), false // 裸 "卷" → 不命中
		}
		end = j - 1
	case runes[0] == 'v' || runes[0] == 'V':
		// vol 形态: [Vv][Oo][Ll] 可选 'Ii' 补全(volume), 随后可选 '.'/' ' + 阿拉伯数字。
		low := strings.ToLower(s)
		if !strings.HasPrefix(low, "vol") {
			return "", trimRest(s, 0), false
		}
		i = 3
		if i < len(low) && low[i] == 'u' { // volume 全拼
			if strings.HasPrefix(low, "volume") {
				i = 6
			} else {
				return "", trimRest(s, 0), false
			}
		}
		if i < len(low) && (low[i] == '.' || low[i] == ' ') {
			i++
		}
		j := i
		for j < len(s) && isAsciiDigit(s[j]) {
			j++
		}
		if j == i {
			return "", trimRest(s, 0), false // Vol 后无数字 → 不命中
		}
		end = j - 1
	default:
		return "", trimRest(s, 0), false
	}
	// 前缀本体 = [0,end](rune 下标闭区间), 去尾空白; 余题去前导空白/连接符。
	volRunes := runes[:end+1]
	vol = strings.TrimSpace(string(volRunes))
	rest = trimRest(s, len(string(volRunes)))
	return vol, rest, true
}

// trimRest 余题清洗: 去前导空白与常见卷名连接符(::·、-—–)。
func trimRest(s string, from int) string {
	if from > len(s) {
		from = len(s)
	}
	return strings.TrimLeft(s[from:], " \t\n\r\f\v　::·、,，-—–")
}
