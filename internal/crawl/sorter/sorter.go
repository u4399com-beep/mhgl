// ============================================================
// 目录乱序重排 + 去重 —— src/lib/crawl/sorter.ts(461 行)语义移植
// 语义权威: src/lib/crawl/sorter.ts(R9-c/kk-a/ll-c/tt-c/R35-2b 历轮打磨资产);
// 消费方: bridge chapters 回调 seq=1 全量形态(reorderToc A~E 重排入口)。
// 移植说明:
//   - JS 正则无 Go RE2 的 lookaround/backreference, 仅两处涉及(见 extractChapterNo
//     chapter 分支的手工扫描与 foldDigits 千位分隔符的逐匹配检查), 其余形态
//     Go regexp 采用 PCRE 同构 leftmost-first 语义, 行为逐条对齐;
//   - localeCompare('zh-CN') 以码点序近似(仅用于无号倒序检测的自然比较兜底,
//     见 naturalCompare 尾臂)。
//
// ============================================================
package sorter

import (
	"errors"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// TocItem 目录条目(与 rule.TocItem 同构独立声明: sorter 为纯函数包, 不反向依赖解析层)
type TocItem struct {
	Title  string `json:"title"`
	URL    string `json:"url"`
	Volume string `json:"volume,omitempty"`
}

// CN_NUM 中文数字单字值(对齐 TS CN_NUM)
var cnNum = map[rune]float64{
	'零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
}

// foldDigits 全角数字折叠(０-９ → 0-9): 部分源站目录用全角数字("第１２章")
func foldDigits(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r >= 0xFF10 && r <= 0xFF19 {
			r = r - 0xFF10 + 0x30
		}
		b.WriteRune(r)
	}
	return b.String()
}

// ---------- 罗马数字(ll-c) ----------
var romanVal = map[byte]float64{'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}

// nfkcRoman Unicode 罗马字符(Ⅰ-ⅿ U+2160-217F)→ ASCII 罗马字母映射(Go 无内建 NFKC;
// 覆盖 sorter.ts volTokenToNumber 实际消费的兼容分解形态)
var nfkcRoman = map[rune]string{
	0x2160: "I", 0x2161: "II", 0x2162: "III", 0x2163: "IV", 0x2164: "V", 0x2165: "VI",
	0x2166: "VII", 0x2167: "VIII", 0x2168: "IX", 0x2169: "X", 0x216A: "XI", 0x216B: "XII",
	0x216C: "L", 0x216D: "C", 0x216E: "D", 0x216F: "M",
	0x2170: "i", 0x2171: "ii", 0x2172: "iii", 0x2173: "iv", 0x2174: "v", 0x2175: "vi",
	0x2176: "vii", 0x2177: "viii", 0x2178: "ix", 0x2179: "x", 0x217A: "xi", 0x217B: "xii",
	0x217C: "l", 0x217D: "c", 0x217E: "d", 0x217F: "m",
}

// romanNormalize NFKC 近似归一: Unicode 罗马字符 → ASCII 罗马字母(其余原样)
func romanNormalize(s string) string {
	need := false
	for _, r := range s {
		if _, ok := nfkcRoman[r]; ok {
			need = true
			break
		}
	}
	if !need {
		return s
	}
	var b strings.Builder
	for _, r := range s {
		if rep, ok := nfkcRoman[r]; ok {
			b.WriteString(rep)
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func isRomanUpper(c byte) bool {
	return c == 'I' || c == 'V' || c == 'X' || c == 'L' || c == 'C' || c == 'D' || c == 'M'
}

// romanToNumber 减前缀法罗马求值; 非法形态返回 NaN(对齐 TS: trim+NFKC+大写后仅 [IVXLCDM]+ 合法)
func romanToNumber(s string) float64 {
	u := strings.ToUpper(strings.TrimSpace(romanNormalize(s)))
	if u == "" {
		return math.NaN()
	}
	for i := 0; i < len(u); i++ {
		if !isRomanUpper(u[i]) {
			return math.NaN()
		}
	}
	total := 0.0
	for i := 0; i < len(u); i++ {
		cur := romanVal[u[i]]
		next := 0.0
		if i+1 < len(u) {
			next = romanVal[u[i+1]]
		}
		if cur < next {
			total -= cur
		} else {
			total += cur
		}
	}
	return total
}

// isCJKNumToken 中文/阿拉伯数字 token(对齐 /^[0-9０-９零〇一二两三四五六七八九十百千万亿]+$/)
func isCJKNumToken(token string) bool {
	if token == "" {
		return false
	}
	for _, r := range token {
		switch {
		case r >= '0' && r <= '9':
		case r >= 0xFF10 && r <= 0xFF19:
		case strings.ContainsRune("零〇一二两三四五六七八九十百千万亿", r):
		default:
			return false
		}
	}
	return true
}

// volTokenToNumber 卷号 token 判值: 中文/阿拉伯数字走 cnNumToNumber, 罗马字母走 romanToNumber
func volTokenToNumber(token string) float64 {
	if token == "" {
		return math.NaN()
	}
	if isCJKNumToken(token) {
		return cnNumToNumber(foldDigits(token))
	}
	return romanToNumber(token)
}

// cnNumToNumber 中文数字 → 阿拉伯数字(支持 十/百/千/万/亿 与 "一零二四"式位值连写;
// 逐语义对齐 sorter.ts 同名函数: prevDigit 位值累加 + 万段累加语义 + 亿覆盖语义)
func cnNumToNumber(cn string) float64 {
	if cn == "" {
		return math.NaN()
	}
	var total, section, num float64
	prevDigit := false
	for _, ch := range cn {
		if v, ok := cnNum[ch]; ok {
			if prevDigit {
				num = num*10 + v
			} else {
				num = v
			}
			prevDigit = true
		} else if ch == '十' {
			section += orOne(num) * 10
			num = 0
			prevDigit = false
		} else if ch == '百' {
			section += orOne(num) * 100
			num = 0
			prevDigit = false
		} else if ch == '千' {
			section += orOne(num) * 1000
			num = 0
			prevDigit = false
		} else if ch == '万' {
			// jj-d 修复语义: "万"前已有"亿"段时累加不覆盖
			total += (section + num) * 10000
			section = 0
			num = 0
			prevDigit = false
		} else if ch == '亿' {
			total = (total + section + num) * 100000000
			section = 0
			num = 0
			prevDigit = false
		} else if ch >= '0' && ch <= '9' {
			num = num*10 + float64(ch-'0')
			prevDigit = true
		} else {
			return math.NaN()
		}
	}
	return total + section + num
}

func orOne(n float64) float64 {
	if n == 0 {
		return 1
	}
	return n
}

const chapterNumClass = "0-9零〇一两一二三四五六七八九十百千万亿"

var (
	reChapterUnit  = regexp.MustCompile(`第\s*([` + chapterNumClass + `]+(?:\.[0-9]+)?)\s*[章节回集]`)
	reVolumeUnit   = regexp.MustCompile(`第\s*([` + chapterNumClass + `]+)\s*[卷篇]`)
	reThousand     = regexp.MustCompile(`(\d)[,，](\d{3})`)
	reChapterWord  = regexp.MustCompile(`第\s*(\d{1,6})\s*[话回节卷集部篇]`)
	reNumUnit      = regexp.MustCompile(`(\d{1,6})\s*[话章回节]`)
	reLooseNum     = regexp.MustCompile(`(?:^|[\s._-])(\d{1,6})(?:[\s._-]|$)`)
	reHasDigit     = regexp.MustCompile(`[0-9]`)
	reHasCJKNum    = regexp.MustCompile(`[零〇一二两三四五六七八九十百千万亿]`)
	reChapterTitle = regexp.MustCompile(`第\s*[` + chapterNumClass + `]+\s*[章节回集]`)
	reChapterEn    = regexp.MustCompile(`(?i)chapter\s*\d+`)
)

// numTokenValue 阿拉伯/中文数字 token 取值(主提取臂共用判序同 TS):
// 含小数点走 parseFloat; 纯阿拉伯走 parseInt; 含中文单位走 cnNumToNumber
func numTokenValue(raw string) float64 {
	if strings.Contains(raw, ".") {
		f, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
		if err != nil {
			return math.NaN()
		}
		return f
	}
	if reHasDigit.MatchString(raw) && !reHasCJKNum.MatchString(raw) {
		n, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return math.NaN()
		}
		return n
	}
	return cnNumToNumber(raw)
}

// matchChapterEn chapter 分支(TS: /chapter\s*(\d+|[ivxlcdm]+)(?=\D|$)/i)。
// Go RE2 无 lookahead: 手工扫描逐语义复刻 —— 逐个 "chapter" 出现点: 跳过 \s* 后,
// 先试纯数字段(极大 munch, 后随字符必非数字或串尾, lookahead 恒真);
// 再试罗马段(极大 munch 后从长到短回溯, 要求段后字符非数字或串尾, 同 TS 回溯语义);
// 本出现点全失败 → 前进到下一出现点(leftmost-first 逐位置重试同构)。
func matchChapterEn(t string) float64 {
	lower := strings.ToLower(t)
	for pos := 0; ; {
		idx := strings.Index(lower[pos:], "chapter")
		if idx < 0 {
			return math.NaN()
		}
		i := pos + idx + len("chapter")
		for i < len(t) && isSpaceByte(t[i]) {
			i++
		}
		if i < len(t) && isDigitByte(t[i]) {
			j := i
			for j < len(t) && isDigitByte(t[j]) {
				j++
			}
			if n, err := strconv.ParseFloat(t[i:j], 64); err == nil {
				return n
			}
		}
		if i < len(t) && isRomanByte(t[i]) {
			j := i
			for j < len(t) && isRomanByte(t[j]) {
				j++
			}
			for end := j; end > i; end-- {
				if end >= len(t) || !isDigitByte(t[end]) {
					if n := romanToNumber(t[i:end]); !math.IsNaN(n) {
						return n
					}
				}
			}
		}
		pos = pos + idx + len("chapter")
	}
}

func isRomanByte(c byte) bool {
	return isRomanUpper(c) || (c >= 'a' && c <= 'z' && isRomanUpper(c-32))
}

func isDigitByte(c byte) bool { return c >= '0' && c <= '9' }

func isSpaceByte(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\v' || c == '\f'
}

// extractChapterNo 从标题提取章节序号(对齐 TS 主提取全分支; NaN=无号)
func extractChapterNo(title string) float64 {
	if title == "" {
		return math.NaN()
	}
	// 全角折叠 + 数字间千位分隔符折叠("第1,234章"; 要求后接 3 位数字组且其后非数字)
	t := replaceThousand(foldDigits(strings.TrimSpace(title)))
	// 单位类拆两级: 章节单位([章节回集])优先于卷级单位([卷篇])(ll-c); 小数章号走 parseFloat(tt-c)
	if m := reChapterUnit.FindStringSubmatch(t); m != nil {
		if n := numTokenValue(m[1]); !math.IsNaN(n) {
			return n
		}
	}
	if m := reVolumeUnit.FindStringSubmatch(t); m != nil {
		if n := numTokenValue(m[1]); !math.IsNaN(n) {
			return n
		}
	}
	if n := matchChapterEn(t); !math.IsNaN(n) {
		return n
	}
	if m := reChapterWord.FindStringSubmatch(t); m != nil {
		if n, err := strconv.ParseFloat(m[1], 64); err == nil {
			return n
		}
	}
	if m := reNumUnit.FindStringSubmatch(t); m != nil {
		if n, err := strconv.ParseFloat(m[1], 64); err == nil {
			return n
		}
	}
	if m := reLooseNum.FindStringSubmatch(t); m != nil {
		if n, err := strconv.ParseFloat(m[1], 64); err == nil {
			return n
		}
	}
	return math.NaN()
}

// replaceThousand 千位分隔符折叠(TS: (\d)[,，](\d{3})(?!\d) → '$1$2'):
// 逐匹配检查后随字符非数字(RE2 无负 lookahead, 手工判定等价)。
// [R70-b] 修前写 s[last:loc[2]] —— loc[2] 是组 1 的起点而非终点, 组 1 数字被整段丢弃:
// "第1,234章" → "第234章"(序号 234, 应 1234), 千位分隔符章号整体错序; 修后 prefix+
// 组1+组2 与 TS '$1$2' 同口径。
func replaceThousand(s string) string {
	locs := reThousand.FindAllStringSubmatchIndex(s, -1)
	if len(locs) == 0 {
		return s
	}
	var b strings.Builder
	last := 0
	for _, loc := range locs {
		matchEnd := loc[1]
		// (?!\d): 匹配后随字符为数字 → 本匹配无效(原样保留, 引擎继续后搜)
		if matchEnd < len(s) && isDigitByte(s[matchEnd]) {
			continue
		}
		b.WriteString(s[last:loc[3]]) // 前缀+组1(R70-b 修前止于组1起点 loc[2], 组1数字被吞)
		b.WriteString(s[loc[4]:loc[5]])
		last = matchEnd
	}
	b.WriteString(s[last:])
	return b.String()
}

// ---------- 容错提取(R35-2b-1 缺口回填专用) ----------
const tolCN = "零〇一二两三四五六七八九十百千万亿"

var (
	tolReDI          = regexp.MustCompile(`^地\s*([0-9` + tolCN + `]+)\s*[章节回集]`)
	tolReNoDI        = regexp.MustCompile(`^([` + tolCN + `]+)\s*[章节回集]`)
	tolReNoUnitEnd   = regexp.MustCompile(`^第\s*([` + tolCN + `]+)\s*$`)
	tolReNoUnitTitle = regexp.MustCompile(`^第\s*([` + tolCN + `]+)\s+\S`)
)

// tolTokenToNumber 容错 token 取值(纯阿拉伯 parseInt, 其余 cnNumToNumber)
func tolTokenToNumber(raw string) float64 {
	if reHasDigit.MatchString(raw) && !reHasCJKNum.MatchString(raw) {
		n, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return math.NaN()
		}
		return n
	}
	return cnNumToNumber(raw)
}

// extractChapterNoTolerant 容错提取(「地」错字/缺「第」/缺「章」三类; 全部不命中返回 NaN)
func extractChapterNoTolerant(title string) float64 {
	if title == "" {
		return math.NaN()
	}
	t := replaceThousand(foldDigits(strings.TrimSpace(title)))
	for _, re := range []*regexp.Regexp{tolReDI, tolReNoDI, tolReNoUnitEnd, tolReNoUnitTitle} {
		if m := re.FindStringSubmatch(t); m != nil {
			if n := tolTokenToNumber(m[1]); !math.IsNaN(n) {
				return n
			}
		}
	}
	return math.NaN()
}

// ---------- 卷锚点识别(kk-a) ----------
const volumeNumClass = `[0-9零〇一两一二三四五六七八九十百千万亿]+|[IVXLCDMivxlcdm]+|[\x{2160}-\x{217F}]+`

var (
	volAnchorRe1 = regexp.MustCompile(`^第\s*(` + volumeNumClass + `)\s*[卷部篇]\s*(.*)$`)
	volAnchorRe2 = regexp.MustCompile(`^卷\s*(` + volumeNumClass + `)\s*(.*)$`)
	volAnchorRe3 = regexp.MustCompile(`(?i)^volume\s*(` + volumeNumClass + `)\s*(.*)$`)
)

// extractVolumeAnchor 纯分卷标题识别(返回卷号+卷名; ok=false 非卷标题)。
// 同时含章节单位 → 是章节标题不是卷锚点("第一卷 第1章 xxx"属章节)
func extractVolumeAnchor(title string) (int, string, bool) {
	if title == "" {
		return 0, "", false
	}
	t := foldDigits(strings.TrimSpace(title))
	if reChapterTitle.MatchString(t) {
		return 0, "", false
	}
	if reChapterEn.MatchString(t) {
		return 0, "", false
	}
	for _, re := range []*regexp.Regexp{volAnchorRe1, volAnchorRe2, volAnchorRe3} {
		if m := re.FindStringSubmatch(t); m != nil {
			no := volTokenToNumber(m[1])
			if !math.IsNaN(no) {
				name := strings.TrimSpace(m[2])
				if name == "" {
					name = t
				}
				return int(no), name, true
			}
		}
	}
	return 0, "", false
}

// volumeNoOf 从 volume 字段值或卷名提取卷号(取不到返回 NaN)
func volumeNoOf(vol string) float64 {
	if no, _, ok := extractVolumeAnchor(vol); ok {
		return float64(no)
	}
	return math.NaN()
}

// naturalCompare 自然比较: 序号优先, 数字段自然比较(localeCompare('zh-CN') 以码点序近似)
func naturalCompare(a, b string) float64 {
	na := extractChapterNo(a)
	nb := extractChapterNo(b)
	if !math.IsNaN(na) && !math.IsNaN(nb) && na != nb {
		return na - nb
	}
	ra := allDigits(a)
	rb := allDigits(b)
	n := len(ra)
	if len(rb) < n {
		n = len(rb)
	}
	for i := 0; i < n; i++ {
		if ra[i] != rb[i] {
			return ra[i] - rb[i]
		}
	}
	return float64(strings.Compare(a, b))
}

// allDigits 提取全部数字段(TS: a.match(/\d+/g)?.map(Number) || [])
var digitsRe = regexp.MustCompile(`\d+`)

func allDigits(s string) []float64 {
	ms := digitsRe.FindAllString(s, -1)
	if len(ms) == 0 {
		return nil
	}
	out := make([]float64, 0, len(ms))
	for _, m := range ms {
		n, err := strconv.ParseFloat(m, 64)
		if err != nil {
			continue
		}
		out = append(out, n)
	}
	return out
}

// normalizeUrlKey URL 去重键(参数排序 + origin 归一默认端口 + 尾斜杠剥除; Bug 16/R3-26 语义)
func normalizeUrlKey(u string) string {
	if u == "" {
		return ""
	}
	origin, path, query, err := splitURL(u)
	if err != nil {
		return u
	}
	pairs := splitQuery(query)
	sortPairs(pairs)
	var qs strings.Builder
	for i, p := range pairs {
		if i > 0 {
			qs.WriteByte('&')
		}
		qs.WriteString(urlEncode(p[0]))
		qs.WriteByte('=')
		qs.WriteString(urlEncode(p[1]))
	}
	search := ""
	if len(pairs) > 0 {
		search = "?" + qs.String()
	}
	for len(path) > 1 && strings.HasSuffix(path, "/") {
		path = path[:len(path)-1]
	}
	return origin + path + search
}

// prologueRe 卷首无号标题(R9-c-9 序章类排最前; 无号尾项仍排尾)
var prologueRe = regexp.MustCompile(`^(序章?|序言|自序|前言|楔子|引子|开篇)`)

type noWrap struct {
	it  TocItem
	i   int
	no  float64
	pro bool
}

// ReorderToc 乱序重排主入口(导出: bridge chapters 回调 seq=1 全量形态消费):
//  1. URL 去重(绝对化归一) + 章节名去重
//  2. kk-a: 存在分卷上下文(volume 字段或标题卷锚点) → 分卷感知重排
//  3. 提取序号成功比例 ≥0.6 → 按序号排序(含 R35-2b 容错缺口回填闸)
//  4. 无序号: 倒序检测(naturalCompare 前 30 项; <8 项不翻转, ll-c 守卫)
func ReorderToc(items []TocItem) []TocItem {
	seenURL := map[string]struct{}{}
	seenTitle := map[string]struct{}{}
	deduped := make([]TocItem, 0, len(items))
	for _, it := range items {
		uKey := normalizeUrlKey(it.URL)
		tKey := strings.TrimSpace(it.Title)
		if uKey != "" {
			if _, dup := seenURL[uKey]; dup {
				continue
			}
		}
		if tKey != "" {
			if _, dup := seenTitle[tKey]; dup {
				continue
			}
		}
		if uKey != "" {
			seenURL[uKey] = struct{}{}
		}
		if tKey != "" {
			seenTitle[tKey] = struct{}{}
		}
		deduped = append(deduped, it)
	}
	hasFieldVolume := false
	for _, it := range deduped {
		if strings.TrimSpace(it.Volume) != "" {
			hasFieldVolume = true
			break
		}
	}
	hasAnchor := false
	for _, it := range deduped {
		if _, _, ok := extractVolumeAnchor(it.Title); ok {
			hasAnchor = true
			break
		}
	}
	if hasFieldVolume || hasAnchor {
		return reorderWithVolumes(deduped)
	}
	return sortByChapterNo(deduped)
}

// sortByChapterNo 卷内/无卷排序(序号比例 ≥0.6 → 序号序; 否则自然比较+倒序检测)
func sortByChapterNo(deduped []TocItem) []TocItem {
	withNo := make([]noWrap, len(deduped))
	valid := 0
	for i, it := range deduped {
		// [R55-3a-fix] 必须取指针: 修前 `w := withNo[i]` 值拷贝后赋值只改副本,
		// withNo[i].it 恒零值 → ReorderToc 输出全空壳(title/url 全丢),
		// creates/needUrls 恒空 → 全部任务"0 章需要采集"直通 done(E2E 实证)。
		w := &withNo[i]
		w.it = it
		w.i = i
		w.no = extractChapterNo(it.Title)
		w.pro = prologueRe.MatchString(strings.TrimSpace(it.Title))
		if !math.IsNaN(w.no) {
			valid++
		}
	}
	den := len(withNo)
	if den < 1 {
		den = 1
	}
	if float64(valid)/float64(den) >= 0.6 {
		// R35-2b 缺口回填闸: 标准提取 NaN 条目依原序尝试容错提取,
		// tn 仅当未被占用且 ∈ [minStd, maxStd+1] 才接受(同 tn 先到先得);
		// "第一 噩梦"类 tn=1 因已占用被拒, 不误插最前
		stdNums := map[float64]struct{}{}
		minStd := math.Inf(1)
		maxStd := math.Inf(-1)
		for _, w := range withNo {
			if math.IsNaN(w.no) {
				continue
			}
			stdNums[w.no] = struct{}{}
			if w.no < minStd {
				minStd = w.no
			}
			if w.no > maxStd {
				maxStd = w.no
			}
		}
		for i := range withNo {
			w := &withNo[i]
			if !math.IsNaN(w.no) {
				continue
			}
			tn := extractChapterNoTolerant(w.it.Title)
			if math.IsNaN(tn) {
				continue
			}
			if _, dup := stdNums[tn]; dup || tn < minStd || tn > maxStd+1 {
				continue
			}
			w.no = tn
			stdNums[tn] = struct{}{}
		}
		sortStable(withNo, func(x, y noWrap) bool {
			xa, xb := math.IsNaN(x.no), math.IsNaN(y.no)
			xp, yp := xa && x.pro, xb && y.pro
			if xp != yp {
				return xp
			}
			if xa && xb {
				return x.i < y.i
			}
			if xa {
				return false
			}
			if xb {
				return true
			}
			if x.no != y.no {
				return x.no < y.no
			}
			return x.i < y.i
		})
		out := make([]TocItem, len(withNo))
		for i, w := range withNo {
			out[i] = w.it
		}
		return out
	}
	// 无序号: 倒序检测(ll-c 守卫: <8 项不翻转 —— 无号小列表 locale 码点序与阅读序无必然关系)
	if len(deduped) < 8 {
		return deduped
	}
	sampleN := len(deduped)
	if sampleN > 30 {
		sampleN = 30
	}
	desc, asc := 0, 0
	for i := 1; i < sampleN; i++ {
		c := naturalCompare(deduped[i-1].Title, deduped[i].Title)
		if c > 0 {
			desc++
		} else if c < 0 {
			asc++
		}
	}
	if asc >= desc {
		return deduped
	}
	out := make([]TocItem, len(deduped))
	for i, it := range deduped {
		out[len(deduped)-1-i] = it
	}
	return out
}

// sortStable 稳定排序(通用; 语义=稳定+严格小于 less)。[R57-2a 清理] 原为手写插入排序
// O(n²) —— 目录量级上限 5000 章时最坏 ~12.5M 次比较(闭包内 NaN 判定), 换 stdlib
// sort.SliceStable O(n log n) 同语义实现(稳定性不变, 结果不变, 大书目录重排耗时降两个量级)
func sortStable[T any](items []T, less func(a, b T) bool) {
	sort.SliceStable(items, func(i, j int) bool { return less(items[i], items[j]) })
}

// volumeGroup kk-a 分卷分组
type volumeGroup struct {
	key      string
	no       float64
	firstIdx int
	members  []TocItem
}

// reorderWithVolumes 分卷感知重排:
//   - 分组: item.volume 字段定卷(同名聚合, 卷间按卷号/首现序); 无字段时标题卷锚点自开新卷
//     (条目本身排卷首); 其余归当前卷; 首个无归属段开 p:head 头组
//   - 卷间: 有号卷按卷号升序(同号按首现序); 无号卷装配式归位(qq-e2):
//     首个有号卷之前 → 排最前(前言/作品相关语义); 其余紧跟其源站前置有号卷之后
//     (尾部番外跟最后一卷后, 卷间夹注跟当前卷后); 无有号卷全按首现序(纯无号卷零回归)
//   - 卷内: 锚点条目排最前(卷扉), 其余按章号算法
func reorderWithVolumes(items []TocItem) []TocItem {
	var groups []*volumeGroup
	byKey := map[string]*volumeGroup{}
	var cur *volumeGroup
	for i, it := range items {
		fv := strings.TrimSpace(it.Volume)
		_, _, isAnchor := extractVolumeAnchor(it.Title)
		if fv != "" {
			key := "f:" + fv
			g, ok := byKey[key]
			if !ok {
				g = &volumeGroup{key: key, no: volumeNoOf(fv), firstIdx: i}
				groups = append(groups, g)
				byKey[key] = g
			}
			g.members = append(g.members, it)
			cur = g
		} else if isAnchor {
			no, _, _ := extractVolumeAnchor(it.Title)
			cur = &volumeGroup{key: "t:" + strconv.Itoa(i), no: float64(no), firstIdx: i, members: []TocItem{it}}
			groups = append(groups, cur)
		} else {
			if cur == nil {
				cur = &volumeGroup{key: "p:head", no: math.NaN(), firstIdx: i}
				groups = append(groups, cur)
			}
			cur.members = append(cur.members, it)
		}
	}
	var numbered, unnumbered []*volumeGroup
	for _, g := range groups {
		if math.IsNaN(g.no) {
			unnumbered = append(unnumbered, g)
		} else {
			numbered = append(numbered, g)
		}
	}
	sortStable(numbered, func(a, b *volumeGroup) bool {
		if a.no != b.no {
			return a.no < b.no
		}
		return a.firstIdx < b.firstIdx
	})
	sortStable(unnumbered, func(a, b *volumeGroup) bool { return a.firstIdx < b.firstIdx })
	firstNumIdx := math.Inf(1)
	if len(numbered) > 0 {
		firstNumIdx = float64(numbered[0].firstIdx)
	}
	afterPred := map[*volumeGroup][]*volumeGroup{}
	var headGroups []*volumeGroup
	for _, u := range unnumbered {
		if float64(u.firstIdx) < firstNumIdx {
			headGroups = append(headGroups, u)
			continue
		}
		var pred *volumeGroup
		for _, n := range numbered {
			if float64(n.firstIdx) <= float64(u.firstIdx) && (pred == nil || n.firstIdx > pred.firstIdx) {
				pred = n
			}
		}
		if pred == nil {
			headGroups = append(headGroups, u) // 防御: firstNumIdx 守卫下不应发生
		} else {
			afterPred[pred] = append(afterPred[pred], u)
		}
	}
	orderedGroups := append([]*volumeGroup{}, headGroups...)
	for _, n := range numbered {
		orderedGroups = append(orderedGroups, n)
		orderedGroups = append(orderedGroups, afterPred[n]...)
	}
	out := make([]TocItem, 0, len(items))
	for _, g := range orderedGroups {
		// 卷内: 锚点条目(纯卷标题)固定最前, 其余按章号算法([R15-d1b-5] Set 哈希判定)
		anchorSet := map[*TocItem]struct{}{}
		var anchors []TocItem
		for i := range g.members {
			m := &g.members[i]
			if _, _, ok := extractVolumeAnchor(m.Title); ok && strings.TrimSpace(m.Volume) == "" {
				anchorSet[m] = struct{}{}
				anchors = append(anchors, *m)
			}
		}
		rest := make([]TocItem, 0, len(g.members))
		for i := range g.members {
			m := &g.members[i]
			if _, is := anchorSet[m]; !is {
				rest = append(rest, *m)
			}
		}
		out = append(out, anchors...)
		out = append(out, sortByChapterNo(rest)...)
	}
	return out
}

// ---------------- URL 解析辅助(标准库替代 new URL 的必需子集) ----------------

var errBadURL = errors.New("invalid url")

// splitURL 拆 scheme://host/path?query(等价 new URL().origin/pathname/search 必需子集)
func splitURL(raw string) (origin, path, query string, err error) {
	s := raw
	schemeEnd := strings.Index(s, "://")
	if schemeEnd < 0 {
		return "", "", "", errBadURL
	}
	scheme := s[:schemeEnd]
	rest := s[schemeEnd+3:]
	hostEnd := strings.IndexAny(rest, "/?#")
	host := rest
	tail := ""
	if hostEnd >= 0 {
		host = rest[:hostEnd]
		tail = rest[hostEnd:]
	}
	if host == "" {
		return "", "", "", errBadURL
	}
	// origin: 默认端口归一(https :443 / http :80 剥除; R3-26 语义)
	if i := strings.LastIndex(host, ":"); i >= 0 && !strings.Contains(host[i+1:], "]") {
		port := host[i+1:]
		if (scheme == "https" && port == "443") || (scheme == "http" && port == "80") {
			host = host[:i]
		}
	}
	origin = scheme + "://" + host
	path, query = tail, ""
	if i := strings.Index(tail, "?"); i >= 0 {
		path, query = tail[:i], tail[i+1:]
	}
	return origin, path, query, nil
}

// splitQuery 拆 query 串为键值对(排序后按 TS 形态重新编码)
func splitQuery(query string) [][2]string {
	if query == "" {
		return nil
	}
	parts := strings.Split(query, "&")
	out := make([][2]string, 0, len(parts))
	for _, p := range parts {
		if p == "" {
			continue
		}
		if i := strings.Index(p, "="); i >= 0 {
			out = append(out, [2]string{p[:i], p[i+1:]})
		} else {
			out = append(out, [2]string{p, ""})
		}
	}
	return out
}

func sortPairs(p [][2]string) {
	for i := 1; i < len(p); i++ {
		for j := i; j > 0 && strings.Compare(p[j][0], p[j-1][0]) < 0; j-- {
			p[j], p[j-1] = p[j-1], p[j]
		}
	}
}

// urlEncode encodeURIComponent 同构(非 [A-Za-z0-9-_.!~*'()] 逐字节 %XX)
func urlEncode(s string) string {
	const safe = "-_.!~*'()"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || strings.IndexByte(safe, c) >= 0 {
			b.WriteByte(c)
		} else {
			const hex = "0123456789ABCDEF"
			b.WriteByte('%')
			b.WriteByte(hex[c>>4])
			b.WriteByte(hex[c&0xF])
		}
	}
	return b.String()
}

// SliceCodePoints 按码点截断(emoji 代理对不斩半; 供 bridge 末章回写/卷名截断共用)
func SliceCodePoints(s string, max int) string {
	if max <= 0 || s == "" {
		return ""
	}
	n := 0
	for i := range s {
		if n == max {
			return s[:i]
		}
		n++
	}
	return s
}
