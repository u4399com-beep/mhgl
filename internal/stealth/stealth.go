// ============================================================
// R70-c — 内容伪装/反搜索管线(四大开关)
//
//	interfere  句子干扰: read 页正文按密度插入隐藏白噪声句(class=sj-i)
//	pseudo     伪原创:   read 页文本节点同义词替换(种子可控)
//	transcode  关键词转码: 文本节点 CJK 实体化/零宽字符, 源码无明文关键词
//	obfuscate  结构混淆: 注释/幽灵元素/空白抖动/属性重排/大小写/低频实体化
//
// 硬不变式: Config 全关时 Apply 原样返回同一底层数据(逐字节零变化);
// 所有变换只作用于文本节点, script/style/textarea/pre 内容与 svg/math
// 整区、属性值一律逐字节不动; 输出可见外观与原文档一致。
// ============================================================
package stealth

import (
	cryptorand "crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"math/rand"
	"strconv"
	"strings"
	"time"
)

// Config 伪装管线配置(全部默认零值 = 全关)。
type Config struct {
	Obfuscate     bool   // 结构混淆开关
	Transcode     bool   // 关键词/句子转码开关
	TranscodeMode string // entity|zwsp(缺省 entity)
	Interfere     bool   // 句子干扰开关(仅 read 页生效)
	InterfereMode string // hidden|offscreen(缺省 hidden)
	Density       int    // 每 Density 段插 1 句, 2-8(缺省 4)
	Pseudo        bool   // 伪原创开关(仅 read 页生效)
	PseudoSeed    string // request|daily|stable(缺省 request)
}

// anyEnabled 任一开关开启。
func (c Config) anyEnabled() bool {
	return c.Obfuscate || c.Transcode || c.Interfere || c.Pseudo
}

// AllOff 全关(渲染出口据此走零开销直通路径)。
func (c Config) AllOff() bool { return !c.anyEnabled() }

// PageCtx 单次渲染上下文。
type PageCtx struct {
	Kind      string // read|book|toc|home|category|search|other
	BookID    string
	ChapterID string
	Nonce     [16]byte // 每请求随机(crypto/rand), 派生各阶段 RNG
}

// truthy 设置值宽容解析: 兼容裸 1/0、JSON 带引号 "1"/"0"、true/false/on。
// (admin 设置 API 经 json.Marshal 落库, 字符串值带引号; 历史手工值裸形态。)
func settingRaw(get func(key string) string, key string) string {
	v := strings.TrimSpace(get(key))
	if len(v) >= 2 && v[0] == '"' && v[len(v)-1] == '"' { // JSON 字符串剥引号
		inner := strings.TrimSpace(v[1 : len(v)-1])
		if inner != "" || v == `""` {
			v = inner
		}
	}
	return v
}

func settingBool(get func(key string) string, key string) bool {
	switch strings.ToLower(settingRaw(get, key)) {
	case "1", "true", "on", "yes":
		return true
	}
	return false
}

// BoolSetting 导出布尔设置判读(web 层 book.volume.show 等复用同一宽容口径:
// 裸 1/0、JSON 引号形态、true/on/yes 均判真)。
func BoolSetting(get func(key string) string, key string) bool {
	return settingBool(get, key)
}

// ConfigFromSettings 从 store settings KV 读取装配 Config。
// get 缺键返回 ""(走代码内默认)。非法值一律回落默认, 绝不 panic。
func ConfigFromSettings(get func(key string) string) Config {
	mode := func(raw, def string, allowed ...string) string {
		v := strings.ToLower(settingRaw(get, raw))
		for _, a := range allowed {
			if v == a {
				return v
			}
		}
		return def
	}
	density := 4
	if v := strings.TrimSpace(settingRaw(get, "stealth.interfere.density")); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			density = n
		}
	}
	if density < 2 {
		density = 2
	}
	if density > 8 {
		density = 8
	}
	return Config{
		Obfuscate:     settingBool(get, "stealth.obfuscate"),
		Transcode:     settingBool(get, "stealth.transcode"),
		TranscodeMode: mode("stealth.transcode.mode", "entity", "entity", "zwsp"),
		Interfere:     settingBool(get, "stealth.interfere"),
		InterfereMode: mode("stealth.interfere.mode", "hidden", "hidden", "offscreen"),
		Density:       density,
		Pseudo:        settingBool(get, "stealth.pseudo"),
		PseudoSeed:    mode("stealth.pseudo.seed", "request", "request", "daily", "stable"),
	}
}

// Apply 伪装管线入口。cfg 全关 → 原样返回(同一底层数据)。
// 管线顺序(契约固定): interfere → pseudo → transcode → obfuscate。
func Apply(src []byte, cfg Config, pc PageCtx) []byte {
	if cfg.AllOff() {
		return src
	}
	s := string(src)
	toks := tokenize(s)
	if len(toks) == 0 {
		return src
	}
	if cfg.Interfere && pc.Kind == "read" {
		toks = interfereTokens(toks, cfg, rngFor(pc, "interfere"))
	}
	if cfg.Pseudo && pc.Kind == "read" {
		toks = pseudoTokens(toks, cfg, pc)
	}
	if cfg.Transcode {
		toks = transcodeTokens(toks, cfg, rngFor(pc, "transcode"))
	}
	if cfg.Obfuscate {
		toks = obfuscateTokens(toks, rngFor(pc, "obfuscate"))
	}
	return renderTokens(toks)
}

// rngFor 由 nonce+页面语义派生确定性 RNG(两次抓取 nonce 不同 → 字节不同)。
func rngFor(pc PageCtx, salt string) *rand.Rand {
	h := sha256.New()
	h.Write(pc.Nonce[:])
	for _, part := range []string{pc.Kind, pc.BookID, pc.ChapterID, salt} {
		h.Write([]byte(part))
		h.Write([]byte{0})
	}
	seed := int64(binary.BigEndian.Uint64(h.Sum(nil)[:8]) >> 1) // 首位留空防负
	return rand.New(rand.NewSource(seed))
}

// pseudoRng 伪原创种子 RNG(request=nonce 派生; daily/stable=键语义派生,
// 同章同日替换结果稳定)。
func pseudoRng(cfg Config, pc PageCtx) *rand.Rand {
	switch cfg.PseudoSeed {
	case "daily":
		return seededRNG(pc.BookID + "\x00" + pc.ChapterID + "\x00" + time.Now().Format("20060102"))
	case "stable":
		return seededRNG(pc.BookID + "\x00" + pc.ChapterID)
	default: // request
		return rngFor(pc, "pseudo")
	}
}

func seededRNG(salt string) *rand.Rand {
	sum := sha256.Sum256([]byte(salt))
	seed := int64(binary.BigEndian.Uint64(sum[:8]) >> 1)
	return rand.New(rand.NewSource(seed))
}

// NewNonce 每请求 nonce(crypto/rand; 失败回落时间熵, 不 panic)。
// [70-c2 接手修复] 修前 crypto/rand 与 math/rand 同名裸 import 致包不编译;
// crypto 侧改别名 cryptorand, math/rand 保持管线 RNG 主用名。
func NewNonce() [16]byte {
	var n [16]byte
	if _, err := cryptorand.Read(n[:]); err != nil {
		now := time.Now().UnixNano()
		n[0] = byte(now)
		n[1] = byte(now >> 8)
		n[2] = byte(now >> 16)
		n[3] = byte(now >> 24)
		n[4] = byte(now >> 32)
		n[5] = byte(now >> 40)
		n[6] = byte(now >> 48)
		n[7] = byte(now >> 56)
	}
	return n
}

// hexRand 长度 n 的小写 hex 随机串。
func hexRand(r *rand.Rand, n int) string {
	const digits = "0123456789abcdef"
	b := make([]byte, n)
	for i := range b {
		b[i] = digits[r.Intn(16)]
	}
	return string(b)
}

// isCJKHan CJK 汉字(基本区 + 扩展A)。
func isCJKHan(r rune) bool {
	return (r >= 0x4e00 && r <= 0x9fa5) || (r >= 0x3400 && r <= 0x4dbf)
}

// isCJKPunct 中文标点(CJK 符号标点区 + 全角形式区)。
func isCJKPunct(r rune) bool {
	return (r >= 0x3000 && r <= 0x303f) || (r >= 0xff00 && r <= 0xffef)
}

// escapeHTMLText 文本 HTML 转义(生成件内容兜底)。
func escapeHTMLText(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&#34;", "'", "&#39;")
	return r.Replace(s)
}
