// ============================================================
// R70-c — 关键词/句子转码(entity 实体化 | zwsp 零宽字符)
//
// 目的: 源码层面不出现完整明文关键词(防搜索引擎/采集器按关键词命中),
// 浏览器渲染结果与原文完全一致(entity 编码渲染等价; U+200B 零宽不显示)。
//
// 作用面: 仅文本节点; script/style/textarea/pre 与 svg/math 区为 raw token
// 天然豁免; 属性值一律不动。CJK 判定含基本区/扩展A/中文标点/全角形式区
// (raw string 书写 \x{...} 形式, 不用 \u)。
// ============================================================
package stealth

import (
	"math/rand"
	"strconv"
	"strings"
)

// transcodeTokens 对全部文本节点执行转码(就地改写 data)。
func transcodeTokens(toks []token, cfg Config, r *rand.Rand) []token {
	zwsp := cfg.TranscodeMode == "zwsp"
	for idx := range toks {
		if toks[idx].kind != tokText {
			continue
		}
		if toks[idx].data == "" {
			continue
		}
		if zwsp {
			toks[idx].data = zwspText(toks[idx].data, r)
		} else {
			toks[idx].data = entityText(toks[idx].data, r, 0.55, 0.30)
		}
	}
	return toks
}

// entityText 把文本内 CJK 字符按概率实体化(hex/dec 混用)。
// hanProb 汉字实体化概率, punctProb 标点(中文标点/全角)概率。
// 浏览器对 &#xHEX; 与 &#DEC; 的渲染与原字符完全一致 → 可见文本零变化。
func entityText(s string, r *rand.Rand, hanProb, punctProb float64) string {
	runes := []rune(s)
	// 快速路径: 无 CJK 直接返回原串(零分配)。
	hasCJK := false
	for _, c := range runes {
		if isCJKHan(c) || isCJKPunct(c) {
			hasCJK = true
			break
		}
	}
	if !hasCJK {
		return s
	}
	var b strings.Builder
	b.Grow(len(s) + 32)
	for _, c := range runes {
		if isCJKHan(c) && r.Float64() < hanProb {
			b.WriteString(runeEntity(c, r))
			continue
		}
		if isCJKPunct(c) && r.Float64() < punctProb {
			b.WriteString(runeEntity(c, r))
			continue
		}
		b.WriteRune(c)
	}
	return b.String()
}

// runeEntity 单字符实体化: 随机选 hex/dec 形态。
func runeEntity(c rune, r *rand.Rand) string {
	if r.Intn(2) == 0 {
		return "&#x" + strconv.FormatInt(int64(c), 16) + ";"
	}
	return "&#" + strconv.Itoa(int(c)) + ";"
}

// zwspText 在 CJK 连续串内每 1-3 个汉字间插入 U+200B(零宽空格)。
// 仅在汉字之间插入: 不落在标点/ASCII 旁, 不产生词首词尾悬挂。
func zwspText(s string, r *rand.Rand) string {
	runes := []rune(s)
	hasCJK := false
	for _, c := range runes {
		if isCJKHan(c) {
			hasCJK = true
			break
		}
	}
	if !hasCJK {
		return s
	}
	const zwsp = "​"
	var b strings.Builder
	b.Grow(len(s) + len(s)/2)
	since := 0 // 距上一个已写汉字的计数
	next := 1 + r.Intn(3)
	for idx, c := range runes {
		if isCJKHan(c) {
			b.WriteRune(c)
			since++
			if since >= next && idx+1 < len(runes) && isCJKHan(runes[idx+1]) {
				// 仅当下一字符仍是汉字时才插, 避免"汉字 标点/ASCII"之间挂零宽。
				b.WriteString(zwsp)
				since = 0
				next = 1 + r.Intn(3)
			}
			continue
		}
		b.WriteRune(c)
	}
	return b.String()
}
