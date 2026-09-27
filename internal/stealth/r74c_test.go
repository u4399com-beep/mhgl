package stealth

// R74-c 回归: <title>(RCDATA) 内容跨管线逐字节不动不变式。
// 修前 transcode 是四管线中唯一改写 title 的管线:
//   - zwsp 形态把 U+200B 插进 title → 浏览器/爬虫解码后的标题串含零宽字符
//     (书名关键词失配 + request 种子下每次请求解码标题漂移, R72-c pseudo title
//     虫同类残留; 探针实证 <title>美\u200b丽总裁\u200b的贴身\u200b高手);
//   - entity 形态把 title 内 CJK 实体化(title 原始字节每请求漂移, 解码等价
//     但与 obfTextNoise/pseudo 已建立的 title 豁免不变式相悖)。
// 修后 transcodeTokens 与 obfTextNoise/pseudo 同款 noInsert 前驱守卫。

import (
	"strings"
	"testing"
)

var r74cTitleDoc = []byte(`<!DOCTYPE html><html><head><title>美丽总裁的贴身高手</title></head>` +
	`<body><p>他忽然觉得十分疲惫，慢慢地闭上了眼睛。</p></body></html>`)

const r74cTitleFull = "<title>美丽总裁的贴身高手</title>"

// title 段落截取(开标签至闭标签之后; 缺失返回 "" 由断言报错)。
func r74cTitleSeg(t *testing.T, out []byte) string {
	t.Helper()
	s := string(out)
	ti := strings.Index(s, "<title>")
	te := strings.Index(s, "</title>")
	if ti < 0 || te < 0 {
		s := string(out)
		if len(s) > 160 {
			s = s[:160]
		}
		t.Fatalf("title 段丢失: %q", s)
	}
	return s[ti : te+len("</title>")]
}

// TestR74c_TitleUntouchedByTranscode 两形态 × 多 nonce: title 逐字节不动。
func TestR74c_TitleUntouchedByTranscode(t *testing.T) {
	for _, mode := range []string{"entity", "zwsp"} {
		cfg := Config{Transcode: true, TranscodeMode: mode}
		for _, n := range [][16]byte{{1}, {2}, {0xaa, 0x55}} {
			out := Apply(append([]byte(nil), r74cTitleDoc...), cfg, PageCtx{Kind: "read", Nonce: n})
			if seg := r74cTitleSeg(t, out); seg != r74cTitleFull {
				t.Fatalf("transcode(%s) 改写 title: %q", mode, seg)
			}
		}
	}
}

// TestR74c_TitleUntouchedByFullPipeline 全管线组合下 title 仍不动。
func TestR74c_TitleUntouchedByFullPipeline(t *testing.T) {
	for _, cfg := range []Config{
		{Pseudo: true, Transcode: true, Obfuscate: true},
		{Pseudo: true, Transcode: true, TranscodeMode: "zwsp", Obfuscate: true, Interfere: true, Density: 2},
		{Obfuscate: true},
	} {
		for _, n := range [][16]byte{{3}, {0x11, 0x22}} {
			out := Apply(append([]byte(nil), r74cTitleDoc...), cfg, PageCtx{Kind: "read", Nonce: n})
			if seg := r74cTitleSeg(t, out); seg != r74cTitleFull {
				t.Fatalf("全管线(%+v) 改写 title: %q", cfg, seg)
			}
		}
	}
}

// TestR74c_TranscodeStillTransformsBody title 豁免不等于转码失效: 正文 CJK 照常被改。
func TestR74c_TranscodeStillTransformsBody(t *testing.T) {
	for _, mode := range []string{"entity", "zwsp"} {
		cfg := Config{Transcode: true, TranscodeMode: mode}
		changed := 0
		for _, n := range [][16]byte{{1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}} {
			out := Apply(append([]byte(nil), r74cTitleDoc...), cfg, PageCtx{Kind: "read", Nonce: n})
			body := string(out[strings.Index(string(out), "<body>"):])
			if !strings.Contains(string(body), "他忽然觉得十分疲惫") {
				changed++ // 正文已被转码(实体化/零宽), 原串不再整体出现
			}
		}
		if changed == 0 {
			t.Fatalf("transcode(%s) 8 轮零改写 —— 豁免误伤正文", mode)
		}
	}
}
