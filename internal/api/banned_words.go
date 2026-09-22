// ============================================================
// R55-3b — 违禁词引擎(移植 src/lib/banned-words.ts applyBannedWordsToHtml 段)
//
//	mask   = 命中词替换 '*'(与命中文本码点等长, 最多 6 个)
//	remove = 命中词直接删除
//	HTML 按标签切分, 只过滤文本段(防词表命中 <p>/属性名破坏结构);
//	latin 词条大小写不敏感; 空词表零开销直通。
//	配置读取走 bannedWordsConfig()(admin_content.go 同源 Setting 口径),
//	60s TTL 进程内缓存(对齐 banned-words-server.ts; 保存侧为 KV 直写, 无需失效钩子)。
//
// ============================================================
package api

import (
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

const bannedMaskMaxStars = 6

var (
	bannedTagSplitRe = regexp.MustCompile(`(<[^>]*>)`)
	bannedFullTagRe  = regexp.MustCompile(`^<[^>]*>$`)
)

type bannedCompiled struct {
	mode string
	re   *regexp.Regexp // nil = 词表为空(直通)
}

var (
	bannedCompileMu    sync.Mutex
	bannedCompileCache = map[string]bannedCompiled{}
)

// bannedWordsConfigCached 违禁词配置(60s TTL; 结构体免深拷贝 —— 调用方只读)。
func (d Deps) bannedWordsConfigCached() map[string]any {
	bannedCacheMu.Lock()
	defer bannedCacheMu.Unlock()
	now := time.Now()
	if bannedCacheCfg != nil && now.Sub(bannedCacheAt) < 60*time.Second {
		return bannedCacheCfg
	}
	cfg := d.bannedWordsConfig()
	bannedCacheCfg = cfg
	bannedCacheAt = now
	return cfg
}

var (
	bannedCacheMu  sync.Mutex
	bannedCacheCfg map[string]any
	bannedCacheAt  time.Time
)

// compileBannedWords 词表编译(长词优先排序 → 同位置取最长命中; 配置级缓存)。
func compileBannedWords(cfg map[string]any) bannedCompiled {
	mode := "mask"
	if cfg != nil && cfg["mode"] == "remove" {
		mode = "remove"
	}
	words := []string{}
	seen := map[string]bool{}
	if cfg != nil {
		if arr, ok := cfg["words"].([]any); ok {
			for _, w := range arr {
				s, ok := w.(string)
				if !ok {
					continue
				}
				s = strings.TrimSpace(s)
				if s == "" || seen[strings.ToLower(s)] {
					continue
				}
				seen[strings.ToLower(s)] = true
				words = append(words, s)
			}
		}
	}
	if len(words) == 0 {
		return bannedCompiled{mode: mode, re: nil}
	}
	sort.Slice(words, func(i, j int) bool { return len(words[i]) > len(words[j]) })
	key := mode + "\x00" + strings.Join(words, "\x01")
	bannedCompileMu.Lock()
	defer bannedCompileMu.Unlock()
	if hit, ok := bannedCompileCache[key]; ok {
		return hit
	}
	if len(bannedCompileCache) >= 32 {
		bannedCompileCache = map[string]bannedCompiled{}
	}
	esc := make([]string, len(words))
	for i, w := range words {
		esc[i] = regexp.QuoteMeta(w)
	}
	// (?i): latin 词条大小写不敏感(TS 'gi' 口径; Go 正则对 CJK 无大小写概念, 零影响)
	comp := bannedCompiled{mode: mode, re: regexp.MustCompile("(?i)" + strings.Join(esc, "|"))}
	bannedCompileCache[key] = comp
	return comp
}

// invalidateBannedWordsCache 保存违禁词配置后立即失效(对齐 TS 保存即生效钩子)。
func invalidateBannedWordsCache() {
	bannedCacheMu.Lock()
	bannedCacheAt = time.Time{}
	bannedCacheMu.Unlock()
}

// applyBannedWordsToHtml HTML 内容违禁词过滤(章节正文公共渲染点 [R21-h-1])。
func applyBannedWordsToHtml(html string, cfg map[string]any) string {
	if html == "" {
		return html
	}
	// 空词表零开销直通(不做无谓切分)
	wordsEmpty := true
	if cfg != nil {
		if arr, ok := cfg["words"].([]any); ok && len(arr) > 0 {
			wordsEmpty = false
		}
	}
	if wordsEmpty {
		return html
	}
	comp := compileBannedWords(cfg)
	if comp.re == nil {
		return html
	}
	segs := bannedTagSplitRe.Split(html, -1)
	var b strings.Builder
	for _, seg := range segs {
		if bannedFullTagRe.MatchString(seg) {
			b.WriteString(seg)
			continue
		}
		if comp.mode == "remove" {
			b.WriteString(comp.re.ReplaceAllString(seg, ""))
			continue
		}
		b.WriteString(comp.re.ReplaceAllStringFunc(seg, func(m string) string {
			n := len([]rune(m))
			if n > bannedMaskMaxStars {
				n = bannedMaskMaxStars
			}
			return strings.Repeat("*", n)
		}))
	}
	return b.String()
}
