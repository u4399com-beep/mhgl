// ============================================================
// R70-c — 句子干扰(仅 read 页)
//
// 正文段落按密度(每 Density 段取 1 段)插入 1 个隐藏 span(class="sj-i"),
// 内容为内置白噪声句(天气/日常/科普, 无敏感词)+随机尾缀+可选随机 hex,
// 每次请求不重复; 对普通读者不可见, 对按"全文关键词命中"的搜索引擎/
// 采集镜像造成正文指纹扰动。每页上限 40 条。
//
// 豁免: nav/header/footer/aside 内的段落一律不动; 非正文块不动。
// 插入位置: 句界(。！？…!?)之后, 无句界段落在段首(<p> 开标签后)。
// ============================================================
package stealth

import (
	"math/rand"
	"sort"
	"unicode/utf8"
)

// skipTags 干扰豁免容器(其内段落不处理)。
var skipTags = map[string]bool{"nav": true, "header": true, "footer": true, "aside": true}

// paraEnders 出现即隐式结束当前段落(未闭合 <p> 的块级边界)。
var paraEnders = map[string]bool{
	"p": true, "div": true, "section": true, "article": true, "li": true,
	"ul": true, "ol": true, "dl": true, "table": true, "thead": true,
	"tbody": true, "tr": true, "blockquote": true, "h1": true, "h2": true,
	"h3": true, "h4": true, "h5": true, "h6": true, "main": true,
	"form": true, "figure": true, "pre": true, "address": true,
	"details": true, "header": true, "footer": true, "nav": true,
	"aside": true, "center": true, "fieldset": true,
}

type candPos struct {
	tokIdx, off int
}

type paraInfo struct {
	openIdx, closeIdx int // token 区间(开区间, 插入只落在两者之间)
	cands             []candPos
}

type insRec struct {
	tokIdx, off int
	html        string
}

// interfereTokens 扫描段落并生成插入; 返回新 token 切片。
func interfereTokens(toks []token, cfg Config, r *rand.Rand) []token {
	density := cfg.Density
	if density < 2 {
		density = 2
	}
	if density > 8 {
		density = 8
	}
	phase := r.Intn(density)

	var stack []string
	skipDepth := 0
	inPara := false
	paraOpenIdx := -1
	var cands []candPos
	var paras []paraInfo
	closePara := func(endIdx int) {
		if inPara {
			paras = append(paras, paraInfo{openIdx: paraOpenIdx, closeIdx: endIdx, cands: cands})
			inPara = false
			cands = nil
		}
	}
	for idx := range toks {
		tk := &toks[idx]
		switch tk.kind {
		case tokMarkup:
			if tk.name == "" {
				continue
			}
			if tk.closing {
				if len(stack) > 0 && stack[len(stack)-1] == tk.name {
					stack = stack[:len(stack)-1]
				}
				if skipTags[tk.name] && skipDepth > 0 {
					skipDepth--
				}
				if tk.name == "p" {
					closePara(idx)
				}
				continue
			}
			if skipTags[tk.name] {
				skipDepth++
			}
			if inPara && paraEnders[tk.name] {
				closePara(idx)
			}
			if !tk.isVoid && !tk.self {
				stack = append(stack, tk.name)
			}
			if tk.name == "p" && !tk.self && skipDepth == 0 {
				inPara = true
				paraOpenIdx = idx
			}
		case tokText:
			if inPara && skipDepth == 0 {
				cands = sentenceCands(tk.data, idx, cands)
			}
		}
	}
	if inPara {
		closePara(len(toks))
	}

	var ins []insRec
	inserted := 0
	for no, pa := range paras {
		if inserted >= 40 {
			break
		}
		if no%density != phase {
			continue
		}
		html := interfereSpan(cfg.InterfereMode, r)
		if len(pa.cands) > 0 {
			c := pa.cands[r.Intn(len(pa.cands))]
			ins = append(ins, insRec{tokIdx: c.tokIdx, off: c.off, html: html})
		} else if pa.openIdx >= 0 && pa.openIdx < len(toks) {
			ins = append(ins, insRec{tokIdx: pa.openIdx, off: len(toks[pa.openIdx].data), html: html})
		}
		inserted++
	}
	return applyInsertions(toks, ins)
}

// applyInsertions 按 token 分组拆分插入(同 token 多条按偏移升序)。
func applyInsertions(toks []token, ins []insRec) []token {
	if len(ins) == 0 {
		return toks
	}
	insBy := map[int][]insRec{}
	idxs := make([]int, 0, len(ins))
	for _, rec := range ins {
		if _, ok := insBy[rec.tokIdx]; !ok {
			idxs = append(idxs, rec.tokIdx)
		}
		insBy[rec.tokIdx] = append(insBy[rec.tokIdx], rec)
	}
	sort.Ints(idxs)
	out := make([]token, 0, len(toks)+len(ins))
	next := 0 // idxs 游标
	for idx := range toks {
		if next < len(idxs) && idxs[next] == idx {
			next++
			recs := insBy[idx]
			sort.Slice(recs, func(i, j int) bool { return recs[i].off < recs[j].off })
			tk := toks[idx]
			pos := 0
			for _, rec := range recs {
				off := rec.off
				if off < pos {
					off = pos
				}
				if off > len(tk.data) {
					off = len(tk.data)
				}
				if off > pos {
					out = append(out, token{kind: tk.kind, data: tk.data[pos:off]})
				}
				out = append(out, token{kind: tokMarkup, data: rec.html})
				pos = off
			}
			if pos < len(tk.data) {
				out = append(out, token{kind: tk.kind, data: tk.data[pos:]})
			}
			continue
		}
		out = append(out, toks[idx])
	}
	return out
}

// sentenceCands 收集文本 token 内句界候选(标点之后)。
func sentenceCands(data string, tokIdx int, cands []candPos) []candPos {
	for i := 0; i < len(data); {
		r, sz := utf8.DecodeRuneInString(data[i:])
		if r == '。' || r == '！' || r == '？' || r == '…' || r == '!' || r == '?' {
			cands = append(cands, candPos{tokIdx: tokIdx, off: i + sz})
		}
		i += sz
	}
	return cands
}

// interfereSpan 生成一条隐藏 span。
func interfereSpan(mode string, r *rand.Rand) string {
	style := "display:none"
	if mode == "offscreen" {
		style = "position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden"
	}
	txt := noiseSents[r.Intn(len(noiseSents))] + noiseTails[r.Intn(len(noiseTails))]
	if r.Intn(4) == 0 {
		txt += " " + hexRand(r, 6)
	}
	return `<span class="sj-i" style="` + style + `">` + escapeHTMLText(txt) + `</span>`
}

// noiseSents 内置白噪声句库(65 条; 天气/日常/科普中性内容, 无敏感词)。
var noiseSents = []string{
	"今天天气不错，风和日丽。",
	"窗外的阳光透过树叶洒在地上。",
	"傍晚的云被夕阳染成了橘红色。",
	"春天来了，路边的花都开了。",
	"冬天的早晨总是格外安静。",
	"雨后的空气带着泥土的清香。",
	"天气预报说明天有小雨。",
	"秋天的落叶铺满了整条街道。",
	"夏日的午后蝉鸣阵阵。",
	"清晨的雾气还没完全散去。",
	"夜空中的星星格外明亮。",
	"微风吹过湖面泛起层层涟漪。",
	"台风过境后天空湛蓝如洗。",
	"屋檐下的冰凌在阳光下闪闪发光。",
	"远处的山峦笼罩在薄雾之中。",
	"早晨的豆浆总是冒着热气。",
	"楼下的猫咪又在晒太阳。",
	"街角的面包店飘来阵阵香味。",
	"图书馆里静得能听见翻书声。",
	"老人们在公园里悠闲地下棋。",
	"孩子们在操场上追逐嬉戏。",
	"傍晚的菜市场人来人往。",
	"公交车缓缓驶过安静的街道。",
	"巷口的老槐树已经很有年头了。",
	"周末的市场格外热闹。",
	"他习惯每天早起喝一杯温水。",
	"阳台上的绿萝又抽出了新叶。",
	"楼道里的灯换成了节能的。",
	"晚饭后一家人围坐看电视。",
	"街边的梧桐树影斑驳。",
	"邻居家飘来饭菜的香气。",
	"工作日的地铁总是很拥挤。",
	"傍晚散步的人渐渐多了起来。",
	"小卖部的冰柜嗡嗡作响。",
	"雨天记得随身带一把伞。",
	"窗台上的多肉又长胖了一圈。",
	"书桌上的台灯亮到了深夜。",
	"清晨的公园里有晨练的身影。",
	"周末的书店坐满了读者。",
	"茶壶里的水已经烧开了。",
	"水在标准大气压下一百度沸腾。",
	"蜜蜂通过舞蹈告诉同伴花蜜的位置。",
	"月球绕地球一周大约二十七天。",
	"竹子是世界上生长最快的植物之一。",
	"彩虹是阳光经过水滴折射形成的。",
	"企鹅主要生活在南半球。",
	"闪电的温度比太阳表面还高。",
	"植物的向光性帮助它们获取阳光。",
	"声音在水中传播得比在空气中快。",
	"蜘蛛网由不同功能的丝线组成。",
	"地球自转一周约二十三小时五十六分。",
	"蜂蜜在密封条件下可以保存很久。",
	"人类眨眼一次平均耗时约零点三秒。",
	"世界上最深的湖泊是贝加尔湖。",
	"指南针的发明推动了航海事业。",
	"恐龙灭绝距今约六千五百万年。",
	"雪花结晶的形状与温度湿度有关。",
	"海洋覆盖了地球表面约七成。",
	"候鸟迁徙依靠地磁辨别方向。",
	"章鱼有三颗心脏和蓝色的血液。",
	"邻里的问候让一天有了好的开始。",
	"路边的早餐摊冒着白色的蒸汽。",
	"他的水杯里泡着几颗枸杞。",
	"时钟的指针不紧不慢地走着。",
	"屋顶上的鸽子咕咕地叫着。",
}

// noiseTails 随机尾缀片段(25 条)。
var noiseTails = []string{
	"看起来平平无奇。",
	"一切都照旧进行着。",
	"日子就这样慢慢过去。",
	"谁也没有多想什么。",
	"这是很平常的一幕。",
	"空气里有种慵懒的味道。",
	"时间仿佛慢了半拍。",
	"周围安静得很。",
	"一如既往地寻常。",
	"并没有什么特别。",
	"街上一切如常。",
	"这天和往常一样。",
	"平淡得像一杯白水。",
	"岁月静好。",
	"波澜不惊。",
	"一切都井然有序。",
	"似乎习惯了这样的节奏。",
	"像每一个普通的日子。",
	"没有引起任何人的注意。",
	"平静得理所当然。",
	"如同呼吸一般自然。",
	"寻常得不能再寻常。",
	"一切都显得理所当然。",
	"平平常常的一天。",
	"日子过得不紧不慢。",
}
